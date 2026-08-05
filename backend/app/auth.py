"""
Authentification de Djeliya — mots de passe hachés (bcrypt) + jetons JWT.
"""

import os
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException
from jose import jwt, JWTError
from passlib.context import CryptContext

from .db import get_session, Utilisateur

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGO = "HS256"
JWT_DUREE_JOURS = 30

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _verifier_secret_configure():
    if not JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET n'est pas configuré sur le serveur — ajoute une chaîne aléatoire longue "
            "dans les variables d'environnement Railway (ex. via `openssl rand -hex 32`)."
        )


def hacher_mot_de_passe(mdp: str) -> str:
    return _pwd_ctx.hash(mdp)


def verifier_mot_de_passe(mdp: str, hash_stocke: str) -> bool:
    return _pwd_ctx.verify(mdp, hash_stocke)


def creer_jeton(utilisateur_id: str) -> str:
    _verifier_secret_configure()
    expiration = datetime.now(timezone.utc) + timedelta(days=JWT_DUREE_JOURS)
    return jwt.encode({"sub": utilisateur_id, "exp": expiration}, JWT_SECRET, algorithm=JWT_ALGO)


def utilisateur_courant(authorization: str = Header(default="")) -> Utilisateur:
    _verifier_secret_configure()
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentification requise.")
    jeton = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(jeton, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        raise HTTPException(401, "Jeton invalide ou expiré, reconnecte-toi.")

    session = get_session()
    try:
        user = session.get(Utilisateur, payload.get("sub"))
        if not user:
            raise HTTPException(401, "Utilisateur introuvable.")
        session.expunge(user)
        return user
    finally:
        session.close()
