"""
Djeliya — Serveur de transcription et d'analyse pour la recherche qualitative.
Déployé sur Railway. Whisper (FR/EN + langues locales expérimentales),
diarisation des locuteurs, analyse qualitative méthode Gioia, comptes et
corpus partagés en équipe, fiabilité inter-codeurs.
"""

import os
import re
import json
import uuid
import secrets
import tempfile
import threading
from datetime import datetime, timezone
from itertools import combinations

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db import init_db, get_session, Utilisateur, Corpus, MembreCorpus, Entretien, Codage, ContributionLangue
from .auth import hacher_mot_de_passe, verifier_mot_de_passe, creer_jeton, utilisateur_courant

# ----------------------------------------------------------------- config
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
COMPUTE_TYPE = os.getenv("COMPUTE_TYPE", "int8")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "200"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANALYSE_MODEL = os.getenv("ANALYSE_MODEL", "claude-sonnet-5")
HF_TOKEN = os.getenv("HF_TOKEN")

app = FastAPI(title="Djeliya API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _demarrage():
    init_db()


LANGUES_SUPPORTEES = {
    "auto": "Détection automatique",
    "fr": "Français",
    "en": "Anglais",
    "dyu": "Dioula (expérimental — nécessite un modèle affiné)",
    "bci": "Baoulé (expérimental — nécessite un modèle affiné)",
}

# ----------------------------------------------------------------- modèles paresseux
_whisper_model = None
_whisper_lock = threading.Lock()


def get_whisper():
    global _whisper_model
    with _whisper_lock:
        if _whisper_model is None:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel(WHISPER_MODEL, compute_type=COMPUTE_TYPE)
        return _whisper_model


_anthropic_client = None


def get_anthropic():
    global _anthropic_client
    if not ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY n'est pas configurée — ajoute-la dans les variables Railway "
            "pour activer l'analyse qualitative."
        )
    if _anthropic_client is None:
        from anthropic import Anthropic
        _anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


_diarisation_pipeline = None
_diarisation_lock = threading.Lock()


def get_diarisation():
    global _diarisation_pipeline
    if not HF_TOKEN:
        raise RuntimeError(
            "HF_TOKEN n'est pas configuré — la diarisation des locuteurs est désactivée. "
            "Accepte les conditions du modèle pyannote/speaker-diarization-3.1 sur Hugging Face "
            "puis ajoute ton jeton dans les variables Railway pour l'activer."
        )
    with _diarisation_lock:
        if _diarisation_pipeline is None:
            from pyannote.audio import Pipeline
            _diarisation_pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1", use_auth_token=HF_TOKEN
            )
        return _diarisation_pipeline


# ----------------------------------------------------------------- utilitaires
def _entretien_vers_dict(e: Entretien) -> dict:
    segments = list(e.segments or [])
    if e.locuteurs:
        for s in segments:
            meilleur, recouvrement_max = None, 0.0
            for loc in e.locuteurs:
                debut = max(s.get("debut", 0), loc["debut"])
                fin = min(s.get("fin", s.get("debut", 0)), loc["fin"])
                recouvrement = max(0.0, fin - debut)
                if recouvrement > recouvrement_max:
                    meilleur, recouvrement_max = loc["locuteur"], recouvrement
            if meilleur:
                s["locuteur"] = meilleur

    return {
        "id": e.id,
        "titre": e.titre,
        "langue": e.langue,
        "statut": e.statut,
        "erreur": e.erreur,
        "note": e.note,
        "langue_detectee": e.langue_detectee,
        "segments": segments,
        "diarisation_disponible": bool(e.locuteurs),
        "corpus_id": e.corpus_id,
        "analyse_statut": e.analyse_statut,
        "analyse": e.analyse,
        "analyse_erreur": e.analyse_erreur,
        "analyse_contexte": e.analyse_contexte,
        "analyse_modele": e.analyse_modele,
        "cree_le": e.cree_le.isoformat() if e.cree_le else None,
    }


def _verifier_acces(session, entretien: Entretien, user: Utilisateur):
    if entretien.proprietaire_id == user.id:
        return
    if entretien.corpus_id:
        membre = session.query(MembreCorpus).filter_by(
            corpus_id=entretien.corpus_id, utilisateur_id=user.id
        ).first()
        if membre:
            return
    raise HTTPException(403, "Tu n'as pas accès à cet entretien.")


def _generer_code_invitation() -> str:
    return secrets.token_hex(4).upper()


# ----------------------------------------------------------------- schémas
class InscriptionIn(BaseModel):
    email: str
    mot_de_passe: str
    nom: str = ""


class ConnexionIn(BaseModel):
    email: str
    mot_de_passe: str


class CorpusIn(BaseModel):
    nom: str


class RejoindreIn(BaseModel):
    code: str


class CodageIn(BaseModel):
    segment_index: int
    code: str


class PreferencesIn(BaseModel):
    contribution_langues_locales: bool


class ContributionIn(BaseModel):
    langue: str
    texte_original: str
    texte_corrige: str


# ----------------------------------------------------------------- routes publiques
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": WHISPER_MODEL,
        "analyse_disponible": bool(ANTHROPIC_API_KEY),
        "diarisation_disponible": bool(HF_TOKEN),
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/languages")
def languages():
    return LANGUES_SUPPORTEES


# ----------------------------------------------------------------- authentification
@app.post("/api/auth/inscription")
def inscription(payload: InscriptionIn):
    email = payload.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(422, "Adresse e-mail invalide.")
    if len(payload.mot_de_passe) < 8:
        raise HTTPException(422, "Le mot de passe doit contenir au moins 8 caractères.")

    session = get_session()
    try:
        if session.query(Utilisateur).filter_by(email=email).first():
            raise HTTPException(409, "Un compte existe déjà avec cet e-mail.")
        user = Utilisateur(
            id=uuid.uuid4().hex[:16], email=email, nom=payload.nom.strip(),
            mot_de_passe_hash=hacher_mot_de_passe(payload.mot_de_passe),
        )
        session.add(user)
        session.commit()
        return {"token": creer_jeton(user.id), "utilisateur": {"id": user.id, "email": user.email, "nom": user.nom, "contribution_langues_locales": user.contribution_langues_locales}}
    finally:
        session.close()


@app.post("/api/auth/connexion")
def connexion(payload: ConnexionIn):
    session = get_session()
    try:
        user = session.query(Utilisateur).filter_by(email=payload.email.strip().lower()).first()
        if not user or not verifier_mot_de_passe(payload.mot_de_passe, user.mot_de_passe_hash):
            raise HTTPException(401, "E-mail ou mot de passe incorrect.")
        return {"token": creer_jeton(user.id), "utilisateur": {"id": user.id, "email": user.email, "nom": user.nom, "contribution_langues_locales": user.contribution_langues_locales}}
    finally:
        session.close()


@app.get("/api/auth/moi")
def moi(user: Utilisateur = Depends(utilisateur_courant)):
    return {
        "id": user.id, "email": user.email, "nom": user.nom,
        "contribution_langues_locales": user.contribution_langues_locales,
    }


@app.post("/api/auth/preferences")
def maj_preferences(payload: PreferencesIn, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        u = session.get(Utilisateur, user.id)
        u.contribution_langues_locales = payload.contribution_langues_locales
        session.commit()
        return {"contribution_langues_locales": u.contribution_langues_locales}
    finally:
        session.close()


@app.post("/api/contributions")
def enregistrer_contribution(payload: ContributionIn, user: Utilisateur = Depends(utilisateur_courant)):
    if payload.langue not in ("dyu", "bci"):
        raise HTTPException(422, "Seules les langues locales expérimentales acceptent des contributions.")
    session = get_session()
    try:
        u = session.get(Utilisateur, user.id)
        if not u.contribution_langues_locales:
            raise HTTPException(403, "Active d'abord la contribution dans tes réglages.")
        session.add(ContributionLangue(
            id=uuid.uuid4().hex[:16], utilisateur_id=user.id, langue=payload.langue,
            texte_original=payload.texte_original, texte_corrige=payload.texte_corrige,
        ))
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@app.get("/api/contributions/nombre")
def nombre_contributions(user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        n = session.query(ContributionLangue).filter_by(utilisateur_id=user.id).count()
        return {"nombre": n}
    finally:
        session.close()


# ----------------------------------------------------------------- corpus / équipes
@app.post("/api/corpus")
def creer_corpus(payload: CorpusIn, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        corpus = Corpus(
            id=uuid.uuid4().hex[:16], nom=payload.nom.strip() or "Corpus sans nom",
            proprietaire_id=user.id, code_invitation=_generer_code_invitation(),
        )
        session.add(corpus)
        session.add(MembreCorpus(
            id=uuid.uuid4().hex[:16], corpus_id=corpus.id,
            utilisateur_id=user.id, role="proprietaire",
        ))
        session.commit()
        return {"id": corpus.id, "nom": corpus.nom, "code_invitation": corpus.code_invitation}
    finally:
        session.close()


@app.get("/api/corpus")
def lister_corpus(user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        memberships = session.query(MembreCorpus).filter_by(utilisateur_id=user.id).all()
        out = []
        for m in memberships:
            corpus = session.get(Corpus, m.corpus_id)
            if not corpus:
                continue
            nb_membres = session.query(MembreCorpus).filter_by(corpus_id=corpus.id).count()
            out.append({
                "id": corpus.id, "nom": corpus.nom, "role": m.role,
                "code_invitation": corpus.code_invitation if m.role == "proprietaire" else None,
                "nb_membres": nb_membres,
            })
        return out
    finally:
        session.close()


@app.post("/api/corpus/rejoindre")
def rejoindre_corpus(payload: RejoindreIn, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        corpus = session.query(Corpus).filter_by(code_invitation=payload.code.strip().upper()).first()
        if not corpus:
            raise HTTPException(404, "Code d'invitation invalide.")
        existant = session.query(MembreCorpus).filter_by(corpus_id=corpus.id, utilisateur_id=user.id).first()
        if not existant:
            session.add(MembreCorpus(
                id=uuid.uuid4().hex[:16], corpus_id=corpus.id,
                utilisateur_id=user.id, role="codeur",
            ))
            session.commit()
        return {"id": corpus.id, "nom": corpus.nom}
    finally:
        session.close()


@app.get("/api/corpus/{corpus_id}/membres")
def membres_corpus(corpus_id: str, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        if not session.query(MembreCorpus).filter_by(corpus_id=corpus_id, utilisateur_id=user.id).first():
            raise HTTPException(403, "Tu n'as pas accès à ce corpus.")
        membres = session.query(MembreCorpus).filter_by(corpus_id=corpus_id).all()
        out = []
        for m in membres:
            u = session.get(Utilisateur, m.utilisateur_id)
            out.append({"nom": u.nom or u.email, "role": m.role})
        return out
    finally:
        session.close()


# ----------------------------------------------------------------- transcriptions
@app.post("/api/transcriptions")
async def creer_transcription(
    audio: UploadFile = File(...),
    langue: str = Form("auto"),
    vocabulaire: str = Form(""),
    corpus_id: str = Form(""),
    titre: str = Form(""),
    user: Utilisateur = Depends(utilisateur_courant),
):
    if langue not in LANGUES_SUPPORTEES:
        raise HTTPException(422, f"Langue inconnue : {langue}")

    entretien_id = uuid.uuid4().hex[:12]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio.filename or "a.wav")[1])
    size = 0
    with tmp as f:
        while chunk := await audio.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_MB * 1024 * 1024:
                os.unlink(tmp.name)
                raise HTTPException(413, f"Fichier trop volumineux (max {MAX_UPLOAD_MB} Mo)")
            f.write(chunk)

    session = get_session()
    try:
        if corpus_id and not session.query(MembreCorpus).filter_by(corpus_id=corpus_id, utilisateur_id=user.id).first():
            raise HTTPException(403, "Tu n'as pas accès à ce corpus.")
        e = Entretien(
            id=entretien_id, proprietaire_id=user.id, corpus_id=corpus_id or None,
            titre=titre or audio.filename or "Entretien sans titre", langue=langue, statut="en_attente",
        )
        session.add(e)
        session.commit()
    finally:
        session.close()

    threading.Thread(target=_run_job, args=(entretien_id, tmp.name, langue, vocabulaire), daemon=True).start()
    return {"id": entretien_id, "statut": "en_attente"}


@app.get("/api/transcriptions")
def lister_transcriptions(user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        corpus_ids = [m.corpus_id for m in session.query(MembreCorpus).filter_by(utilisateur_id=user.id).all()]
        q = session.query(Entretien).filter(
            (Entretien.proprietaire_id == user.id) | (Entretien.corpus_id.in_(corpus_ids or ["_aucun_"]))
        )
        return [
            {"id": e.id, "titre": e.titre, "statut": e.statut, "corpus_id": e.corpus_id,
             "cree_le": e.cree_le.isoformat() if e.cree_le else None}
            for e in q.all()
        ]
    finally:
        session.close()


@app.get("/api/transcriptions/{entretien_id}")
def obtenir_transcription(entretien_id: str, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        if not e:
            raise HTTPException(404, "Entretien introuvable.")
        _verifier_acces(session, e, user)
        return _entretien_vers_dict(e)
    finally:
        session.close()


@app.post("/api/transcriptions/{entretien_id}/analyser")
def lancer_analyse(entretien_id: str, contexte: str = Form(""), user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        if not e:
            raise HTTPException(404, "Entretien introuvable.")
        _verifier_acces(session, e, user)
        if e.statut != "termine":
            raise HTTPException(409, "La transcription doit être terminée avant de lancer l'analyse.")
        if not e.segments:
            raise HTTPException(422, "Aucune parole détectée : rien à analyser.")
        e.analyse_statut = "en_cours"
        e.analyse_erreur = None
        session.commit()
    finally:
        session.close()

    threading.Thread(target=_run_analyse, args=(entretien_id, contexte), daemon=True).start()
    return {"analyse_statut": "en_cours"}


# ----------------------------------------------------------------- codage collaboratif
@app.post("/api/transcriptions/{entretien_id}/codages")
def enregistrer_codage(entretien_id: str, payload: CodageIn, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        if not e:
            raise HTTPException(404, "Entretien introuvable.")
        _verifier_acces(session, e, user)

        existant = session.query(Codage).filter_by(
            entretien_id=entretien_id, utilisateur_id=user.id, segment_index=payload.segment_index
        ).first()
        if existant:
            existant.code = payload.code
        else:
            session.add(Codage(
                id=uuid.uuid4().hex[:16], entretien_id=entretien_id, utilisateur_id=user.id,
                segment_index=payload.segment_index, code=payload.code,
            ))
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@app.get("/api/transcriptions/{entretien_id}/codages")
def lister_codages(entretien_id: str, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        if not e:
            raise HTTPException(404, "Entretien introuvable.")
        _verifier_acces(session, e, user)
        codages = session.query(Codage).filter_by(entretien_id=entretien_id).all()
        out = []
        for c in codages:
            u = session.get(Utilisateur, c.utilisateur_id)
            out.append({"segment_index": c.segment_index, "code": c.code, "codeur": u.nom or u.email if u else "?"})
        return out
    finally:
        session.close()


@app.get("/api/transcriptions/{entretien_id}/fiabilite")
def fiabilite_inter_codeurs(entretien_id: str, user: Utilisateur = Depends(utilisateur_courant)):
    """Calcule le kappa de Cohen entre chaque paire de codeurs ayant codé les mêmes segments."""
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        if not e:
            raise HTTPException(404, "Entretien introuvable.")
        _verifier_acces(session, e, user)
        codages = session.query(Codage).filter_by(entretien_id=entretien_id).all()
    finally:
        session.close()

    par_codeur: dict[str, dict[int, str]] = {}
    for c in codages:
        par_codeur.setdefault(c.utilisateur_id, {})[c.segment_index] = c.code

    paires = []
    for u1, u2 in combinations(par_codeur.keys(), 2):
        communs = set(par_codeur[u1]) & set(par_codeur[u2])
        if len(communs) < 2:
            continue
        kappa = _kappa_cohen(
            [par_codeur[u1][i] for i in communs],
            [par_codeur[u2][i] for i in communs],
        )
        paires.append({"segments_communs": len(communs), "kappa": round(kappa, 3)})

    moyenne = round(sum(p["kappa"] for p in paires) / len(paires), 3) if paires else None
    return {"nb_codeurs": len(par_codeur), "paires": paires, "kappa_moyen": moyenne}


def _kappa_cohen(a: list[str], b: list[str]) -> float:
    n = len(a)
    accord_observe = sum(1 for x, y in zip(a, b) if x == y) / n
    labels = set(a) | set(b)
    accord_attendu = sum((a.count(lbl) / n) * (b.count(lbl) / n) for lbl in labels)
    if accord_attendu == 1:
        return 1.0
    return (accord_observe - accord_attendu) / (1 - accord_attendu)


# ----------------------------------------------------------------- moteur de transcription
def _run_job(entretien_id: str, path: str, langue: str, vocabulaire: str):
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        e.statut = "en_cours"
        session.commit()

        locuteurs = []
        try:
            pipeline = get_diarisation()
            diarisation = pipeline(path)
            for segment, _, label in diarisation.itertracks(yield_label=True):
                locuteurs.append({"debut": round(segment.start, 2), "fin": round(segment.end, 2), "locuteur": label})
        except Exception:  # noqa: BLE001
            pass  # diarisation facultative : on continue sans elle

        model = get_whisper()
        prompt = f"Entretien de recherche. Termes attendus : {vocabulaire}" if vocabulaire else None
        segments, info = model.transcribe(
            path,
            language=None if langue in ("auto", "dyu", "bci") else langue,
            initial_prompt=prompt,
            word_timestamps=True,
            vad_filter=True,
        )
        out = []
        for s in segments:
            out.append({
                "debut": round(s.start, 2),
                "fin": round(s.end, 2),
                "texte": s.text.strip(),
                "mots": [
                    {"mot": w.word.strip(), "confiance": round(w.probability, 2)}
                    for w in (s.words or [])
                ],
            })

        e = session.get(Entretien, entretien_id)
        e.segments = out
        e.locuteurs = locuteurs
        e.langue_detectee = info.language
        e.statut = "termine"
        if langue in ("dyu", "bci"):
            e.note = (
                "Langue locale demandée : la transcription utilise le modèle général. "
                "Un modèle affiné améliorerait sensiblement la qualité."
            )
        session.commit()
    except Exception as ex:  # noqa: BLE001
        e = session.get(Entretien, entretien_id)
        if e:
            e.statut = "erreur"
            e.erreur = str(ex)
            session.commit()
    finally:
        session.close()
        try:
            os.unlink(path)
        except OSError:
            pass


# ----------------------------------------------------------------- analyse qualitative
SCHEMA_ANALYSE = """{
  "premier_ordre": [{"concept": "libellé proche du verbatim", "verbatims": [{"texte": "citation exacte", "debut": 12.4}]}],
  "second_ordre": [{"theme": "libellé du thème", "concepts_lies": ["concept 1", "concept 2"], "description": "1-2 phrases"}],
  "dimensions_agregees": [{"dimension": "libellé de la dimension théorique", "themes_lies": ["thème 1", "thème 2"]}],
  "synthese": "synthèse interprétative de 4-6 phrases reliant les dimensions à la question de recherche",
  "limites": "limites méthodologiques de ce codage automatique, en 2-3 phrases"
}"""


def _construire_prompt(segments: list, contexte: str) -> str:
    lignes = [f"[{s['debut']:.1f}s] {s['texte']}" for s in segments]
    transcription = "\n".join(lignes)
    return f"""Tu es méthodologue qualitatif spécialisé en sciences de gestion et organisation.

Effectue un codage thématique inductif de la transcription d'entretien ci-dessous, en suivant \
la méthode de structuration des données de Gioia, Corley & Hamilton (2013), largement utilisée \
dans les revues de recherche en management (Academy of Management Journal, Organization Science) :
1. Premier ordre : concepts proches du langage des participants (in vivo), chacun appuyé par un \
ou plusieurs verbatims exacts avec leur horodatage de début.
2. Second ordre : thèmes plus abstraits regroupant les concepts de premier ordre.
3. Dimensions agrégées : catégories théoriques regroupant les thèmes de second ordre.

Contexte / question de recherche fournie par le chercheur : {contexte or "non précisée"}

Transcription horodatée :
{transcription}

Réponds UNIQUEMENT avec un objet JSON strictement conforme à ce schéma, sans texte autour, \
sans balises markdown, en français :
{SCHEMA_ANALYSE}"""


def _run_analyse(entretien_id: str, contexte: str):
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        segments = list(e.segments or [])
        client = get_anthropic()
        prompt = _construire_prompt(segments, contexte)
        resp = client.messages.create(
            model=ANALYSE_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        texte = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        texte = texte.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        analyse = json.loads(texte)
        for cle in ("premier_ordre", "second_ordre", "dimensions_agregees", "synthese", "limites"):
            if cle not in analyse:
                raise ValueError(f"Réponse du modèle incomplète (« {cle} » manquant).")

        e.analyse = analyse
        e.analyse_statut = "termine"
        e.analyse_contexte = contexte
        e.analyse_modele = ANALYSE_MODEL
        session.commit()
    except Exception as ex:  # noqa: BLE001
        e = session.get(Entretien, entretien_id)
        if e:
            e.analyse_statut = "erreur"
            e.analyse_erreur = str(ex)
            session.commit()
    finally:
        session.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
