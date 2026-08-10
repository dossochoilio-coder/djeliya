"""
Fixtures partagées pour la suite de tests — base de données isolée (fichier
SQLite temporaire, jamais le djeliya.db réel), utilisateur de test frais par
défaut. La variable DATABASE_URL doit être fixée AVANT tout import de app.db
ou app.main, car l'engine SQLAlchemy est créé une fois pour toutes au niveau
du module.
"""

import os
import sys
import tempfile
import uuid

import pytest

_DB_TEMP = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_DB_TEMP.name}")
os.environ.setdefault("JWT_SECRET", "jeton-de-test-jamais-utilise-en-production")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import init_db  # noqa: E402
from app.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def utilisateur(client):
    """Crée un utilisateur de test frais (e-mail aléatoire, jamais de collision
    entre tests), avec son jeton d'authentification prêt à l'emploi."""
    email = f"test-{uuid.uuid4().hex[:10]}@cires.ci"
    r = client.post("/api/auth/inscription", json={
        "email": email, "mot_de_passe": "motdepasse1", "accepte_cgu": True,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "token": data["token"], "id": data["utilisateur"]["id"], "email": email,
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


@pytest.fixture()
def autre_utilisateur(client):
    """Un second utilisateur, pour tester les refus d'accès entre comptes."""
    email = f"autre-{uuid.uuid4().hex[:10]}@cires.ci"
    r = client.post("/api/auth/inscription", json={
        "email": email, "mot_de_passe": "motdepasse1", "accepte_cgu": True,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "token": data["token"], "id": data["utilisateur"]["id"], "email": email,
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }
