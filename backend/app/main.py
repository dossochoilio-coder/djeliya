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
from datetime import datetime, timedelta, timezone
from itertools import combinations

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .db import (
    init_db, get_session, Utilisateur, Corpus, MembreCorpus, Entretien, Codage,
    ContributionLangue, Forfait, MouvementCredit, ADMIN_EMAIL,
)
from .auth import hacher_mot_de_passe, verifier_mot_de_passe, creer_jeton, utilisateur_courant
from .email_utils import envoyer_code_verification, envoyer_code_reinitialisation, EMAIL_CONFIGURE
from .cgu import CGU_TEXTE, CGU_VERSION
from .exports import generer_docx_entretien, generer_xlsx_entretien, generer_docx_etude, generer_xlsx_etude

# ----------------------------------------------------------------- config
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
COMPUTE_TYPE = os.getenv("COMPUTE_TYPE", "int8")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "200"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANALYSE_MODEL = os.getenv("ANALYSE_MODEL", "claude-sonnet-5")
HF_TOKEN = os.getenv("HF_TOKEN")
CREDITS_ESSAI_GRATUIT = float(os.getenv("CREDITS_ESSAI_GRATUIT", "20"))
COUT_CREDIT_TRANSCRIPTION = float(os.getenv("COUT_CREDIT_TRANSCRIPTION", "1"))
COUT_CREDIT_ANALYSE = float(os.getenv("COUT_CREDIT_ANALYSE", "2"))

app = FastAPI(title="Djeliya API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
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
def _nom_fichier(texte: str) -> str:
    """Translittère en ASCII pur : les en-têtes HTTP n'acceptent pas les accents,
    et un nom de fichier avec un « é » brut cassait le téléchargement."""
    import unicodedata
    ascii_txt = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^\w\-]+", "_", ascii_txt).strip("_") or "export"


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
        "analyse_methode": e.analyse_methode,
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
    accepte_cgu: bool = False


class ModifierCompteIn(BaseModel):
    nom: str | None = None
    mot_de_passe_actuel: str | None = None
    nouveau_mot_de_passe: str | None = None


class SupprimerCompteIn(BaseModel):
    mot_de_passe: str


class ConnexionIn(BaseModel):
    email: str
    mot_de_passe: str


class VerifierEmailIn(BaseModel):
    email: str
    code: str


class RenvoyerCodeIn(BaseModel):
    email: str


class MotDePasseOublieIn(BaseModel):
    email: str


class ReinitialiserMdpIn(BaseModel):
    email: str
    code: str
    nouveau_mot_de_passe: str


class CreditsIn(BaseModel):
    delta: float
    motif: str = ""


class DefinirCreditsIn(BaseModel):
    valeur: float
    motif: str = ""


class ForfaitIn(BaseModel):
    nom: str
    prix_fcfa: int
    credits_inclus: float
    description: str = ""


class AttribuerForfaitIn(BaseModel):
    forfait_id: str


class CorpusIn(BaseModel):
    nom: str


class RejoindreIn(BaseModel):
    code: str


class AnalyseCorpusIn(BaseModel):
    contexte: str = ""
    methode: str = "gioia"


class CodageIn(BaseModel):
    segment_index: int
    code: str


class PreferencesIn(BaseModel):
    contribution_langues_locales: bool


class ContributionIn(BaseModel):
    langue: str
    texte_original: str
    texte_corrige: str


class SegmentsIn(BaseModel):
    segments: list


# ----------------------------------------------------------------- routes publiques
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": WHISPER_MODEL,
        "analyse_disponible": bool(ANTHROPIC_API_KEY),
        "diarisation_disponible": bool(HF_TOKEN),
        "email_configure": EMAIL_CONFIGURE,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/languages")
def languages():
    return LANGUES_SUPPORTEES


@app.get("/api/methodes")
def methodes():
    return {k: {"label": v["label"], "reference": v["reference"]} for k, v in METHODES_ANALYSE.items()}


@app.get("/api/cgu")
def cgu():
    return {"version": CGU_VERSION, "texte": CGU_TEXTE}


# ----------------------------------------------------------------- authentification
def _generer_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def _expire(dt) -> bool:
    """Vrai si la date d'expiration est dépassée. Gère le cas SQLite (dev/test) où les
    dates reviennent sans fuseau horaire, contrairement à PostgreSQL en production."""
    if dt is None:
        return True
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt < datetime.now(timezone.utc)


def _utilisateur_public(u: Utilisateur) -> dict:
    return {
        "id": u.id, "email": u.email, "nom": u.nom,
        "contribution_langues_locales": u.contribution_langues_locales,
        "email_verifie": u.email_verifie,
        "est_admin": u.est_admin,
        "credits": u.credits,
        "forfait_actuel": u.forfait_actuel,
    }


@app.post("/api/auth/inscription")
def inscription(payload: InscriptionIn):
    email = payload.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(422, "Adresse e-mail invalide.")
    if len(payload.mot_de_passe) < 8:
        raise HTTPException(422, "Le mot de passe doit contenir au moins 8 caractères.")

    if not payload.accepte_cgu:
        raise HTTPException(422, "Tu dois accepter les conditions d'utilisation pour créer un compte.")

    session = get_session()
    try:
        if session.query(Utilisateur).filter_by(email=email).first():
            raise HTTPException(409, "Un compte existe déjà avec cet e-mail.")

        code = _generer_code()
        user = Utilisateur(
            id=uuid.uuid4().hex[:16], email=email, nom=payload.nom.strip(),
            mot_de_passe_hash=hacher_mot_de_passe(payload.mot_de_passe),
            code_verification=code,
            code_verification_expire=datetime.now(timezone.utc) + timedelta(minutes=30),
            cgu_acceptees_le=datetime.now(timezone.utc), cgu_version=CGU_VERSION,
        )
        if email == ADMIN_EMAIL:
            user.est_admin = True
            user.email_verifie = True
            user.credits = 999999
        elif not EMAIL_CONFIGURE:
            # Pas de serveur SMTP configuré sur Railway : on ne peut pas envoyer de code,
            # donc on ne bloque pas l'inscription — vérification et essai gratuit sont
            # accordés automatiquement. Configure SMTP_HOST/SMTP_USER/SMTP_PASSWORD pour
            # activer la vraie vérification par e-mail.
            user.email_verifie = True
            user.credits = CREDITS_ESSAI_GRATUIT
            user.code_verification = None
            user.code_verification_expire = None
        session.add(user)
        session.flush()
        if user.credits == CREDITS_ESSAI_GRATUIT and email != ADMIN_EMAIL:
            session.add(MouvementCredit(
                id=uuid.uuid4().hex[:16], utilisateur_id=user.id,
                delta=CREDITS_ESSAI_GRATUIT, motif="Essai gratuit à l'inscription",
            ))
        session.commit()

        email_envoye = False
        if EMAIL_CONFIGURE and not user.email_verifie:
            email_envoye = envoyer_code_verification(email, code)
            if not email_envoye:
                # L'envoi a échoué (adresse invalide, quota, etc.) : ne bloque pas non plus,
                # l'utilisateur pourra redemander un code plus tard via /renvoyer-code.
                pass

        return {
            "token": creer_jeton(user.id), "utilisateur": _utilisateur_public(user),
            "email_envoye": email_envoye,
        }
    finally:
        session.close()


@app.post("/api/auth/connexion")
def connexion(payload: ConnexionIn):
    session = get_session()
    try:
        user = session.query(Utilisateur).filter_by(email=payload.email.strip().lower()).first()
        if not user or not verifier_mot_de_passe(payload.mot_de_passe, user.mot_de_passe_hash):
            raise HTTPException(401, "E-mail ou mot de passe incorrect.")
        return {"token": creer_jeton(user.id), "utilisateur": _utilisateur_public(user)}
    finally:
        session.close()


@app.get("/api/auth/moi")
def moi(user: Utilisateur = Depends(utilisateur_courant)):
    return _utilisateur_public(user)


@app.patch("/api/auth/moi")
def modifier_compte(payload: ModifierCompteIn, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        u = session.get(Utilisateur, user.id)
        if payload.nom is not None:
            u.nom = payload.nom.strip()
        if payload.nouveau_mot_de_passe:
            if not payload.mot_de_passe_actuel or not verifier_mot_de_passe(payload.mot_de_passe_actuel, u.mot_de_passe_hash):
                raise HTTPException(401, "Mot de passe actuel incorrect.")
            if len(payload.nouveau_mot_de_passe) < 8:
                raise HTTPException(422, "Le nouveau mot de passe doit contenir au moins 8 caractères.")
            u.mot_de_passe_hash = hacher_mot_de_passe(payload.nouveau_mot_de_passe)
        session.commit()
        return _utilisateur_public(u)
    finally:
        session.close()


def _supprimer_utilisateur_cascade(session, user_id: str):
    """Supprime un compte et ses données associées. Les entretiens des autres membres
    d'un corpus que ce compte possédait sont conservés, mais détachés du corpus."""
    corpus_possedes = session.query(Corpus).filter_by(proprietaire_id=user_id).all()
    for c in corpus_possedes:
        session.query(Entretien).filter_by(corpus_id=c.id).update({"corpus_id": None})
        session.query(MembreCorpus).filter_by(corpus_id=c.id).delete()
        session.delete(c)

    entretiens_possedes = session.query(Entretien).filter_by(proprietaire_id=user_id).all()
    for e in entretiens_possedes:
        session.query(Codage).filter_by(entretien_id=e.id).delete()
        session.delete(e)

    session.query(MembreCorpus).filter_by(utilisateur_id=user_id).delete()
    session.query(Codage).filter_by(utilisateur_id=user_id).delete()
    session.query(ContributionLangue).filter_by(utilisateur_id=user_id).delete()
    session.query(MouvementCredit).filter_by(utilisateur_id=user_id).delete()
    session.delete(session.get(Utilisateur, user_id))


@app.delete("/api/auth/moi")
def supprimer_compte(payload: SupprimerCompteIn, user: Utilisateur = Depends(utilisateur_courant)):
    if user.email == ADMIN_EMAIL:
        raise HTTPException(403, "Le compte administrateur ne peut pas être auto-supprimé.")
    session = get_session()
    try:
        u = session.get(Utilisateur, user.id)
        if not verifier_mot_de_passe(payload.mot_de_passe, u.mot_de_passe_hash):
            raise HTTPException(401, "Mot de passe incorrect.")
        _supprimer_utilisateur_cascade(session, user.id)
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@app.post("/api/auth/verifier-email")
def verifier_email(payload: VerifierEmailIn):
    session = get_session()
    try:
        user = session.query(Utilisateur).filter_by(email=payload.email.strip().lower()).first()
        if not user:
            raise HTTPException(404, "Compte introuvable.")
        if user.email_verifie:
            return {"email_verifie": True, "credits": user.credits}
        if (
            not user.code_verification
            or user.code_verification != payload.code.strip()
            or _expire(user.code_verification_expire)
        ):
            raise HTTPException(400, "Code invalide ou expiré.")

        user.email_verifie = True
        user.code_verification = None
        user.code_verification_expire = None
        user.credits += CREDITS_ESSAI_GRATUIT
        session.add(MouvementCredit(
            id=uuid.uuid4().hex[:16], utilisateur_id=user.id,
            delta=CREDITS_ESSAI_GRATUIT, motif="Essai gratuit à l'inscription",
        ))
        session.commit()
        return {"email_verifie": True, "credits": user.credits}
    finally:
        session.close()


@app.post("/api/auth/renvoyer-code")
def renvoyer_code(payload: RenvoyerCodeIn):
    session = get_session()
    try:
        user = session.query(Utilisateur).filter_by(email=payload.email.strip().lower()).first()
        if not user or user.email_verifie:
            return {"ok": True}  # réponse neutre : n'indique jamais si le compte existe
        code = _generer_code()
        user.code_verification = code
        user.code_verification_expire = datetime.now(timezone.utc) + timedelta(minutes=30)
        session.commit()
        envoye = envoyer_code_verification(user.email, code) if EMAIL_CONFIGURE else False
        return {"ok": True, "email_envoye": envoye}
    finally:
        session.close()


@app.post("/api/auth/mot-de-passe-oublie")
def mot_de_passe_oublie(payload: MotDePasseOublieIn):
    session = get_session()
    try:
        user = session.query(Utilisateur).filter_by(email=payload.email.strip().lower()).first()
        if user:
            code = _generer_code()
            user.code_reinitialisation = code
            user.code_reinitialisation_expire = datetime.now(timezone.utc) + timedelta(minutes=30)
            session.commit()
            if EMAIL_CONFIGURE:
                envoyer_code_reinitialisation(user.email, code)
        # Toujours la même réponse, que le compte existe ou non — évite de révéler
        # quelles adresses sont enregistrées.
        return {"ok": True}
    finally:
        session.close()


@app.post("/api/auth/reinitialiser-mot-de-passe")
def reinitialiser_mot_de_passe(payload: ReinitialiserMdpIn):
    if len(payload.nouveau_mot_de_passe) < 8:
        raise HTTPException(422, "Le mot de passe doit contenir au moins 8 caractères.")
    session = get_session()
    try:
        user = session.query(Utilisateur).filter_by(email=payload.email.strip().lower()).first()
        if (
            not user or not user.code_reinitialisation
            or user.code_reinitialisation != payload.code.strip()
            or _expire(user.code_reinitialisation_expire)
        ):
            raise HTTPException(400, "Code invalide ou expiré.")
        user.mot_de_passe_hash = hacher_mot_de_passe(payload.nouveau_mot_de_passe)
        user.code_reinitialisation = None
        user.code_reinitialisation_expire = None
        session.commit()
        return {"token": creer_jeton(user.id), "utilisateur": _utilisateur_public(user)}
    finally:
        session.close()


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


# ----------------------------------------------------------------- administration
def admin_requis(user: Utilisateur = Depends(utilisateur_courant)) -> Utilisateur:
    if not user.est_admin:
        raise HTTPException(403, "Accès réservé à l'administrateur.")
    return user


@app.get("/api/admin/utilisateurs")
def admin_lister_utilisateurs(_: Utilisateur = Depends(admin_requis)):
    session = get_session()
    try:
        users = session.query(Utilisateur).order_by(Utilisateur.cree_le.desc()).all()
        return [
            {
                "id": u.id, "email": u.email, "nom": u.nom, "email_verifie": u.email_verifie,
                "est_admin": u.est_admin, "credits": u.credits, "forfait_actuel": u.forfait_actuel,
                "cree_le": u.cree_le.isoformat() if u.cree_le else None,
            }
            for u in users
        ]
    finally:
        session.close()


@app.post("/api/admin/utilisateurs/{utilisateur_id}/credits")
def admin_ajuster_credits(utilisateur_id: str, payload: CreditsIn, admin: Utilisateur = Depends(admin_requis)):
    session = get_session()
    try:
        u = session.get(Utilisateur, utilisateur_id)
        if not u:
            raise HTTPException(404, "Utilisateur introuvable.")
        u.credits += payload.delta
        session.add(MouvementCredit(
            id=uuid.uuid4().hex[:16], utilisateur_id=u.id, delta=payload.delta,
            motif=payload.motif or f"Ajustement manuel par {admin.email}",
        ))
        session.commit()
        return {"credits": u.credits}
    finally:
        session.close()


@app.post("/api/admin/utilisateurs/{utilisateur_id}/credits/definir")
def admin_definir_credits(utilisateur_id: str, payload: DefinirCreditsIn, admin: Utilisateur = Depends(admin_requis)):
    session = get_session()
    try:
        u = session.get(Utilisateur, utilisateur_id)
        if not u:
            raise HTTPException(404, "Utilisateur introuvable.")
        delta = payload.valeur - u.credits
        u.credits = payload.valeur
        session.add(MouvementCredit(
            id=uuid.uuid4().hex[:16], utilisateur_id=u.id, delta=delta,
            motif=payload.motif or f"Solde redéfini par {admin.email}",
        ))
        session.commit()
        return {"credits": u.credits}
    finally:
        session.close()


@app.delete("/api/admin/utilisateurs/{utilisateur_id}")
def admin_supprimer_utilisateur(utilisateur_id: str, admin: Utilisateur = Depends(admin_requis)):
    session = get_session()
    try:
        u = session.get(Utilisateur, utilisateur_id)
        if not u:
            raise HTTPException(404, "Utilisateur introuvable.")
        if u.email == ADMIN_EMAIL:
            raise HTTPException(403, "Le compte administrateur ne peut pas être supprimé.")
        _supprimer_utilisateur_cascade(session, utilisateur_id)
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@app.get("/api/admin/utilisateurs/{utilisateur_id}/mouvements")
def admin_mouvements_credit(utilisateur_id: str, _: Utilisateur = Depends(admin_requis)):
    session = get_session()
    try:
        mvts = session.query(MouvementCredit).filter_by(utilisateur_id=utilisateur_id) \
            .order_by(MouvementCredit.cree_le.desc()).all()
        return [{"delta": m.delta, "motif": m.motif, "cree_le": m.cree_le.isoformat()} for m in mvts]
    finally:
        session.close()


@app.post("/api/admin/utilisateurs/{utilisateur_id}/attribuer-forfait")
def admin_attribuer_forfait(utilisateur_id: str, payload: AttribuerForfaitIn, admin: Utilisateur = Depends(admin_requis)):
    session = get_session()
    try:
        u = session.get(Utilisateur, utilisateur_id)
        forfait = session.get(Forfait, payload.forfait_id)
        if not u or not forfait:
            raise HTTPException(404, "Utilisateur ou forfait introuvable.")
        u.credits += forfait.credits_inclus
        u.forfait_actuel = forfait.nom
        session.add(MouvementCredit(
            id=uuid.uuid4().hex[:16], utilisateur_id=u.id, delta=forfait.credits_inclus,
            motif=f"Forfait « {forfait.nom} » attribué par {admin.email}",
        ))
        session.commit()
        return {"credits": u.credits, "forfait_actuel": u.forfait_actuel}
    finally:
        session.close()


@app.get("/api/forfaits")
def lister_forfaits():
    """Catalogue public des forfaits actifs, affiché dans l'app."""
    session = get_session()
    try:
        forfaits = session.query(Forfait).filter_by(actif=True).order_by(Forfait.prix_fcfa).all()
        return [
            {"id": f.id, "nom": f.nom, "prix_fcfa": f.prix_fcfa, "credits_inclus": f.credits_inclus, "description": f.description}
            for f in forfaits
        ]
    finally:
        session.close()


@app.post("/api/admin/forfaits")
def admin_creer_forfait(payload: ForfaitIn, _: Utilisateur = Depends(admin_requis)):
    session = get_session()
    try:
        f = Forfait(
            id=uuid.uuid4().hex[:16], nom=payload.nom, prix_fcfa=payload.prix_fcfa,
            credits_inclus=payload.credits_inclus, description=payload.description,
        )
        session.add(f)
        session.commit()
        return {"id": f.id}
    finally:
        session.close()


@app.post("/api/admin/forfaits/{forfait_id}/desactiver")
def admin_desactiver_forfait(forfait_id: str, _: Utilisateur = Depends(admin_requis)):
    session = get_session()
    try:
        f = session.get(Forfait, forfait_id)
        if not f:
            raise HTTPException(404, "Forfait introuvable.")
        f.actif = False
        session.commit()
        return {"ok": True}
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


def _corpus_vers_dict(c: Corpus) -> dict:
    return {
        "id": c.id, "nom": c.nom, "code_invitation": c.code_invitation,
        "analyse_statut": c.analyse_statut, "analyse": c.analyse, "analyse_erreur": c.analyse_erreur,
        "analyse_contexte": c.analyse_contexte, "analyse_methode": c.analyse_methode,
        "analyse_modele": c.analyse_modele, "analyse_nb_entretiens": c.analyse_nb_entretiens,
    }


@app.get("/api/corpus/{corpus_id}")
def detail_corpus(corpus_id: str, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        if not session.query(MembreCorpus).filter_by(corpus_id=corpus_id, utilisateur_id=user.id).first():
            raise HTTPException(403, "Tu n'as pas accès à ce corpus.")
        c = session.get(Corpus, corpus_id)
        if not c:
            raise HTTPException(404, "Corpus introuvable.")
        return _corpus_vers_dict(c)
    finally:
        session.close()


@app.post("/api/corpus/{corpus_id}/analyser")
def lancer_analyse_corpus(corpus_id: str, payload: AnalyseCorpusIn, user: Utilisateur = Depends(utilisateur_courant)):
    if payload.methode not in METHODES_ANALYSE:
        raise HTTPException(422, f"Méthode inconnue : {payload.methode}")
    session = get_session()
    try:
        if not session.query(MembreCorpus).filter_by(corpus_id=corpus_id, utilisateur_id=user.id).first():
            raise HTTPException(403, "Tu n'as pas accès à ce corpus.")
        c = session.get(Corpus, corpus_id)
        if not c:
            raise HTTPException(404, "Corpus introuvable.")
        nb_termines = session.query(Entretien).filter_by(corpus_id=corpus_id, statut="termine").count()
        if nb_termines < 2:
            raise HTTPException(422, "Il faut au moins 2 entretiens terminés dans ce corpus pour une analyse transversale.")
        cout = COUT_CREDIT_ANALYSE * nb_termines
        if not user.est_admin and user.credits < cout:
            raise HTTPException(402, f"Crédits insuffisants ({cout} nécessaires pour {nb_termines} entretiens).")
        if not user.est_admin:
            u = session.get(Utilisateur, user.id)
            u.credits -= cout
            session.add(MouvementCredit(
                id=uuid.uuid4().hex[:16], utilisateur_id=user.id, delta=-cout,
                motif=f"Analyse transversale ({payload.methode}) — {c.nom}",
            ))
        c.analyse_statut = "en_cours"
        c.analyse_erreur = None
        session.commit()
    finally:
        session.close()

    threading.Thread(target=_run_analyse_corpus, args=(corpus_id, payload.contexte, payload.methode, user.id, cout), daemon=True).start()
    return {"analyse_statut": "en_cours"}


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
        if not user.email_verifie:
            os.unlink(tmp.name)
            raise HTTPException(403, "Vérifie ton adresse e-mail avant de lancer une transcription.")
        if not user.est_admin and user.credits < COUT_CREDIT_TRANSCRIPTION:
            os.unlink(tmp.name)
            raise HTTPException(402, "Crédits insuffisants. Consulte les forfaits disponibles dans l'app.")
        if corpus_id and not session.query(MembreCorpus).filter_by(corpus_id=corpus_id, utilisateur_id=user.id).first():
            os.unlink(tmp.name)
            raise HTTPException(403, "Tu n'as pas accès à ce corpus.")

        if not user.est_admin:
            u = session.get(Utilisateur, user.id)
            u.credits -= COUT_CREDIT_TRANSCRIPTION
            session.add(MouvementCredit(
                id=uuid.uuid4().hex[:16], utilisateur_id=user.id, delta=-COUT_CREDIT_TRANSCRIPTION,
                motif=f"Transcription — {titre or audio.filename}",
            ))

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


@app.post("/api/transcriptions/{entretien_id}/segments/{index}")
def corriger_segment(entretien_id: str, index: int, payload: dict, user: Utilisateur = Depends(utilisateur_courant)):
    """Corrige UN SEUL segment de façon atomique (jamais tout le tableau d'un coup),
    pour que deux corrections rapprochées ne puissent jamais s'écraser l'une l'autre."""
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        if not e:
            raise HTTPException(404, "Entretien introuvable.")
        _verifier_acces(session, e, user)
        segments = list(e.segments or [])
        if index < 0 or index >= len(segments):
            raise HTTPException(422, "Segment introuvable.")
        segments[index] = payload.get("segment", segments[index])
        e.segments = segments
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@app.get("/api/transcriptions/{entretien_id}/export/docx")
def export_docx_entretien(entretien_id: str, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        if not e:
            raise HTTPException(404, "Entretien introuvable.")
        _verifier_acces(session, e, user)
        data = _entretien_vers_dict(e)
    finally:
        session.close()
    buf = generer_docx_entretien(data)
    nom = _nom_fichier(data["titre"])
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{nom}.docx"'},
    )


@app.get("/api/transcriptions/{entretien_id}/export/xlsx")
def export_xlsx_entretien(entretien_id: str, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        if not e:
            raise HTTPException(404, "Entretien introuvable.")
        _verifier_acces(session, e, user)
        data = _entretien_vers_dict(e)
    finally:
        session.close()
    buf = generer_xlsx_entretien(data)
    nom = _nom_fichier(data["titre"])
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nom}.xlsx"'},
    )


@app.get("/api/corpus/{corpus_id}/export/docx")
def export_docx_corpus(corpus_id: str, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        if not session.query(MembreCorpus).filter_by(corpus_id=corpus_id, utilisateur_id=user.id).first():
            raise HTTPException(403, "Tu n'as pas accès à ce corpus.")
        c = session.get(Corpus, corpus_id)
        if not c or not c.analyse:
            raise HTTPException(404, "Aucune analyse de corpus disponible à exporter.")
        entretiens = [_entretien_vers_dict(e) for e in session.query(Entretien).filter_by(corpus_id=corpus_id, statut="termine").order_by(Entretien.cree_le).all()]
        fiabilite = _fiabilite_corpus(session, corpus_id)
        buf = generer_docx_etude(_corpus_vers_dict(c), entretiens, fiabilite)
        nom = _nom_fichier(c.nom)
    finally:
        session.close()
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="rapport_{nom}.docx"'},
    )


@app.get("/api/corpus/{corpus_id}/export/xlsx")
def export_xlsx_corpus(corpus_id: str, user: Utilisateur = Depends(utilisateur_courant)):
    session = get_session()
    try:
        if not session.query(MembreCorpus).filter_by(corpus_id=corpus_id, utilisateur_id=user.id).first():
            raise HTTPException(403, "Tu n'as pas accès à ce corpus.")
        c = session.get(Corpus, corpus_id)
        if not c or not c.analyse:
            raise HTTPException(404, "Aucune analyse de corpus disponible à exporter.")
        entretiens = [_entretien_vers_dict(e) for e in session.query(Entretien).filter_by(corpus_id=corpus_id, statut="termine").order_by(Entretien.cree_le).all()]
        fiabilite = _fiabilite_corpus(session, corpus_id)
        buf = generer_xlsx_etude(_corpus_vers_dict(c), entretiens, fiabilite)
        nom = _nom_fichier(c.nom)
    finally:
        session.close()
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="rapport_{nom}.xlsx"'},
    )


@app.post("/api/transcriptions/{entretien_id}/analyser")
def lancer_analyse(
    entretien_id: str, contexte: str = Form(""), methode: str = Form("gioia"),
    user: Utilisateur = Depends(utilisateur_courant),
):
    if methode not in METHODES_ANALYSE:
        raise HTTPException(422, f"Méthode inconnue : {methode}")
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
        if not user.est_admin and user.credits < COUT_CREDIT_ANALYSE:
            raise HTTPException(402, "Crédits insuffisants. Consulte les forfaits disponibles dans l'app.")
        if not user.est_admin:
            u = session.get(Utilisateur, user.id)
            u.credits -= COUT_CREDIT_ANALYSE
            session.add(MouvementCredit(
                id=uuid.uuid4().hex[:16], utilisateur_id=user.id, delta=-COUT_CREDIT_ANALYSE,
                motif=f"Analyse ({methode}) — {e.titre}",
            ))
        e.analyse_statut = "en_cours"
        e.analyse_erreur = None
        session.commit()
    finally:
        session.close()

    threading.Thread(target=_run_analyse, args=(entretien_id, contexte, methode, user.id), daemon=True).start()
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
        return _fiabilite_entretien(session, entretien_id)
    finally:
        session.close()


def _fiabilite_entretien(session, entretien_id: str) -> dict:
    codages = session.query(Codage).filter_by(entretien_id=entretien_id).all()
    par_codeur: dict = {}
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


def _fiabilite_corpus(session, corpus_id: str) -> dict:
    """Agrège la fiabilité inter-codeurs sur tous les entretiens terminés d'un corpus,
    pour l'inclure dans le rapport d'étude complet."""
    entretiens = session.query(Entretien).filter_by(corpus_id=corpus_id, statut="termine").all()
    details = []
    for e in entretiens:
        f = _fiabilite_entretien(session, e.id)
        if f["nb_codeurs"] >= 2:
            details.append({"titre": e.titre, "nb_codeurs": f["nb_codeurs"], "kappa_moyen": f["kappa_moyen"]})
    return {"details": details}


def _kappa_cohen(a: list, b: list) -> float:
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
            # Réduction des hallucinations et gain d'exhaustivité, en particulier pour
            # les entretiens longs avec pauses, bruit de fond, et alternance de langues :
            # - condition_on_previous_text=False évite au modèle de "dériver" ou de
            #   boucler sur une phrase après un silence ou un changement de langue.
            # - hallucination_silence_threshold ignore les segments hallucinés générés
            #   sur du silence pur, sans jamais couper une parole réelle (vad_filter
            #   s'en charge séparément).
            # - beam_size=5 (recherche en faisceau) et température multi-passe
            #   (valeur par défaut de la bibliothèque) maximisent la fidélité au lieu
            #   d'une simple prédiction gloutonne.
            condition_on_previous_text=False,
            hallucination_silence_threshold=2.0,
            beam_size=5,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
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
            u = session.get(Utilisateur, e.proprietaire_id)
            if u and not u.est_admin:
                u.credits += COUT_CREDIT_TRANSCRIPTION
                session.add(MouvementCredit(
                    id=uuid.uuid4().hex[:16], utilisateur_id=u.id, delta=COUT_CREDIT_TRANSCRIPTION,
                    motif="Remboursement — échec de la transcription",
                ))
            session.commit()
    finally:
        session.close()
        try:
            os.unlink(path)
        except OSError:
            pass


# ----------------------------------------------------------------- analyse qualitative
SCHEMA_ANALYSE = """{
  "demarche_methodologique": "paragraphe de niveau doctoral (8-12 phrases) situant le positionnement épistémologique, justifiant le choix de la méthode pour ce corpus, et détaillant précisément la procédure suivie (étapes, critères de regroupement, itérations)",
  "premier_ordre": [{"concept": "libellé proche du verbatim", "verbatims": [{"texte": "citation exacte", "debut": 12.4, "entretien": "titre de l'entretien si plusieurs"}]}],
  "second_ordre": [{"theme": "libellé du regroupement de second niveau", "concepts_lies": ["concept 1", "concept 2"], "description": "1-2 phrases"}],
  "dimensions_agregees": [{"dimension": "libellé de la catégorie la plus abstraite", "themes_lies": ["thème 1", "thème 2"]}],
  "synthese": "synthèse interprétative de 4-6 phrases reliant les résultats à la question de recherche",
  "limites": "limites méthodologiques de ce codage automatique, en 2-3 phrases"
}"""

METHODES_ANALYSE = {
    "gioia": {
        "label": "Méthode Gioia (structuration des données)",
        "reference": "Gioia, Corley & Hamilton (2013)",
        "instructions": """Suis la méthode de structuration des données de Gioia, Corley & Hamilton (2013), \
le standard des revues de recherche en management (Academy of Management Journal, Organization Science) :
1. Premier ordre : concepts proches du langage des participants (in vivo, très proches du verbatim), \
chacun appuyé par un ou plusieurs verbatims exacts avec leur horodatage.
2. Second ordre : thèmes plus abstraits regroupant les concepts de premier ordre — c'est ici que le \
chercheur introduit son vocabulaire théorique.
3. Dimensions agrégées : catégories théoriques finales regroupant les thèmes de second ordre, formant \
la "data structure" typique d'un article Gioia.
Utilise TOUJOURS les trois niveaux (premier_ordre, second_ordre, dimensions_agregees).""",
    },
    "thematique": {
        "label": "Analyse thématique réflexive (Braun & Clarke)",
        "reference": "Braun & Clarke (2006, 2019)",
        "instructions": """Suis les six phases de l'analyse thématique réflexive de Braun & Clarke (2006, 2019) : \
familiarisation avec les données, génération de codes initiaux, recherche de thèmes, révision des thèmes, \
définition et nommage des thèmes, production du rapport.
Mets les codes initiaux dans "premier_ordre" (chaque code appuyé par ses verbatims), et les thèmes \
définitifs (regroupements de codes, avec leur description) dans "second_ordre". Cette méthode ne \
comporte PAS de troisième niveau d'abstraction théorique : laisse "dimensions_agregees" comme une \
liste VIDE []. Insiste dans "demarche_methodologique" sur la nature réflexive et itérative du \
processus (le chercheur comme instrument actif de l'analyse), propre à cette méthode.""",
    },
    "contenu": {
        "label": "Analyse de contenu catégorielle (Bardin)",
        "reference": "Bardin (1977/2013)",
        "instructions": """Suis l'analyse de contenu catégorielle de Bardin : pré-analyse, exploitation du \
matériel par découpage en unités de sens, catégorisation, et inférence.
Mets les unités de sens (unités d'enregistrement) dans "premier_ordre", les sous-catégories qui les \
regroupent dans "second_ordre", et les catégories finales dans "dimensions_agregees". Pour chaque \
sous-catégorie, indique dans sa "description" sa fréquence d'apparition dans le corpus (nombre \
d'occurrences) — c'est une dimension centrale de cette méthode, plus quantitative que les deux autres. \
Précise dans "demarche_methodologique" les règles de découpage retenues (thématique, par énoncé...) \
et les critères de catégorisation (exclusion mutuelle, homogénéité, pertinence).""",
    },
}


def _construire_prompt(transcription: str, contexte: str, methode: str, multi_entretiens: bool = False) -> str:
    m = METHODES_ANALYSE[methode]
    portee = (
        "sur l'ensemble des entretiens de ce corpus (analyse transversale inter-cas — indique pour "
        "chaque verbatim de quel entretien il provient via le champ \"entretien\", et commente dans "
        "la synthèse le degré de convergence/divergence entre entretiens ainsi que si une saturation "
        "théorique semble atteinte ou si de nouveaux codes émergent encore)"
        if multi_entretiens else
        "de la transcription d'entretien ci-dessous"
    )
    return f"""Tu es méthodologue qualitatif spécialisé en sciences de gestion et organisation, de niveau \
recherche doctorale.

Effectue un codage {portee}.

{m['instructions']}

Contexte / question de recherche fournie par le chercheur : {contexte or "non précisée"}

Transcription{'s' if multi_entretiens else ''} horodatée{'s' if multi_entretiens else ''} :
{transcription}

Réponds UNIQUEMENT avec un objet JSON strictement conforme à ce schéma — aucun texte avant ou après, \
aucune balise markdown, en français. Assure-toi que le JSON est syntaxiquement valide : échappe tous \
les guillemets internes aux chaînes de caractères (\\") et ne laisse aucune chaîne non terminée :
{SCHEMA_ANALYSE}"""


def _extraire_json(texte: str) -> dict:
    """Nettoie et parse la réponse du modèle, avec une tentative de réparation si le JSON
    a été coupé net (troncature liée à la limite de tokens)."""
    texte = texte.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(texte)
    except json.JSONDecodeError:
        # Réparation simple : si la chaîne est coupée en plein milieu, on referme au dernier
        # point de structure valide (dernière accolade/crochet fermé équilibré).
        for fin in range(len(texte), 0, -1):
            fragment = texte[:fin]
            if fragment.count("{") == 0:
                break
            try:
                return json.loads(fragment + "}" * (fragment.count("{") - fragment.count("}")))
            except json.JSONDecodeError:
                continue
        raise


def _valider_analyse(analyse: dict):
    for cle in ("premier_ordre", "second_ordre", "dimensions_agregees", "synthese", "limites"):
        if cle not in analyse:
            raise ValueError(f"Réponse du modèle incomplète (« {cle} » manquant).")


def _run_analyse(entretien_id: str, contexte: str, methode: str, payeur_id: str):
    session = get_session()
    try:
        e = session.get(Entretien, entretien_id)
        segments = list(e.segments or [])
        transcription = "\n".join(f"[{s['debut']:.1f}s] {s['texte']}" for s in segments)
        client = get_anthropic()
        prompt = _construire_prompt(transcription, contexte, methode)
        resp = client.messages.create(
            model=ANALYSE_MODEL,
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}],
        )
        texte = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        analyse = _extraire_json(texte)
        _valider_analyse(analyse)

        e.analyse = analyse
        e.analyse_statut = "termine"
        e.analyse_contexte = contexte
        e.analyse_methode = methode
        e.analyse_modele = ANALYSE_MODEL
        session.commit()
    except Exception as ex:  # noqa: BLE001
        e = session.get(Entretien, entretien_id)
        if e:
            e.analyse_statut = "erreur"
            e.analyse_erreur = str(ex)
            u = session.get(Utilisateur, payeur_id)
            if u and not u.est_admin:
                u.credits += COUT_CREDIT_ANALYSE
                session.add(MouvementCredit(
                    id=uuid.uuid4().hex[:16], utilisateur_id=u.id, delta=COUT_CREDIT_ANALYSE,
                    motif="Remboursement — échec de l'analyse",
                ))
            session.commit()
    finally:
        session.close()


def _run_analyse_corpus(corpus_id: str, contexte: str, methode: str, payeur_id: str, cout: float):
    session = get_session()
    try:
        entretiens = session.query(Entretien).filter_by(corpus_id=corpus_id, statut="termine").all()
        blocs = []
        for e in entretiens:
            for s in (e.segments or []):
                blocs.append(f"[{e.titre} · {s['debut']:.1f}s] {s['texte']}")
        transcription = "\n".join(blocs)

        client = get_anthropic()
        prompt = _construire_prompt(transcription, contexte, methode, multi_entretiens=True)
        resp = client.messages.create(
            model=ANALYSE_MODEL,
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}],
        )
        texte = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        analyse = _extraire_json(texte)
        _valider_analyse(analyse)

        corpus = session.get(Corpus, corpus_id)
        corpus.analyse = analyse
        corpus.analyse_statut = "termine"
        corpus.analyse_contexte = contexte
        corpus.analyse_methode = methode
        corpus.analyse_modele = ANALYSE_MODEL
        corpus.analyse_nb_entretiens = len(entretiens)
        session.commit()
    except Exception as ex:  # noqa: BLE001
        corpus = session.get(Corpus, corpus_id)
        if corpus:
            corpus.analyse_statut = "erreur"
            corpus.analyse_erreur = str(ex)
            u = session.get(Utilisateur, payeur_id)
            if u and not u.est_admin:
                u.credits += cout
                session.add(MouvementCredit(
                    id=uuid.uuid4().hex[:16], utilisateur_id=u.id, delta=cout,
                    motif="Remboursement — échec de l'analyse transversale",
                ))
            session.commit()
    finally:
        session.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
