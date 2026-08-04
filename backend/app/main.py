"""
Djeliya — Serveur de transcription pour la recherche qualitative.
Déployé sur Railway. Modèle Whisper (faster-whisper) pour FR/EN,
architecture extensible pour les langues ivoiriennes (dioula, baoulé...).
"""

import os
import uuid
import shutil
import tempfile
import threading
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# ----------------------------------------------------------------- config
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")   # tiny/base/small/medium/large-v3
COMPUTE_TYPE = os.getenv("COMPUTE_TYPE", "int8")      # int8 = CPU Railway
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "200"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app = FastAPI(title="Djeliya API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Chargement paresseux du modèle (démarrage rapide du conteneur)
_model = None
_model_lock = threading.Lock()


def get_model():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel
            _model = WhisperModel(WHISPER_MODEL, compute_type=COMPUTE_TYPE)
        return _model


# Stockage des tâches en mémoire (remplacer par PostgreSQL/Redis en production —
# Railway fournit les deux en un clic)
JOBS: dict[str, dict] = {}

LANGUES_SUPPORTEES = {
    "auto": "Détection automatique",
    "fr": "Français",
    "en": "Anglais",
    # Extensibles via un fournisseur dédié (MMS / Whisper affiné) :
    "dyu": "Dioula (expérimental — nécessite un modèle affiné)",
    "bci": "Baoulé (expérimental — nécessite un modèle affiné)",
}


# ----------------------------------------------------------------- routes
@app.get("/health")
def health():
    return {"status": "ok", "model": WHISPER_MODEL, "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/languages")
def languages():
    return LANGUES_SUPPORTEES


@app.post("/api/transcriptions")
async def create_transcription(
    audio: UploadFile = File(...),
    langue: str = Form("auto"),
    vocabulaire: str = Form(""),  # termes locaux : "tontine, pagne, Adjamé"
):
    if langue not in LANGUES_SUPPORTEES:
        raise HTTPException(422, f"Langue inconnue : {langue}")

    job_id = uuid.uuid4().hex[:12]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio.filename or "a.wav")[1])
    size = 0
    with tmp as f:
        while chunk := await audio.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_MB * 1024 * 1024:
                os.unlink(tmp.name)
                raise HTTPException(413, f"Fichier trop volumineux (max {MAX_UPLOAD_MB} Mo)")
            f.write(chunk)

    JOBS[job_id] = {
        "id": job_id,
        "statut": "en_attente",
        "fichier": audio.filename,
        "langue": langue,
        "cree_le": datetime.now(timezone.utc).isoformat(),
        "segments": [],
    }
    threading.Thread(target=_run_job, args=(job_id, tmp.name, langue, vocabulaire), daemon=True).start()
    return {"id": job_id, "statut": "en_attente"}


@app.get("/api/transcriptions/{job_id}")
def get_transcription(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Transcription introuvable")
    return job


# ----------------------------------------------------------------- moteur
def _run_job(job_id: str, path: str, langue: str, vocabulaire: str):
    job = JOBS[job_id]
    job["statut"] = "en_cours"
    try:
        model = get_model()
        # Le vocabulaire local guide le décodage (améliore "tontine", noms de lieux…)
        prompt = f"Entretien de recherche. Termes attendus : {vocabulaire}" if vocabulaire else None
        segments, info = model.transcribe(
            path,
            language=None if langue in ("auto", "dyu", "bci") else langue,
            initial_prompt=prompt,
            word_timestamps=True,
            vad_filter=True,  # coupe les silences / bruit de fond
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
        job["segments"] = out
        job["langue_detectee"] = info.language
        job["statut"] = "termine"
        if langue in ("dyu", "bci"):
            job["note"] = (
                "Langue locale demandée : la transcription utilise le modèle général. "
                "Branchez un modèle affiné via TRANSCRIBER_PROVIDER pour de meilleurs résultats."
            )
    except Exception as e:  # noqa: BLE001
        job["statut"] = "erreur"
        job["erreur"] = str(e)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
