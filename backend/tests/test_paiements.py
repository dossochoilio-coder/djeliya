"""
Tests de la vérification des achats Google Play Billing — idempotence (un
jeton d'achat rejoué ne doit jamais créditer deux fois) et refus propre d'un
achat annulé côté Google, sans jamais faire confiance au seul jeton fourni
par l'app.
"""

import base64
import json

import app.main as m


def _cle_service_compte_factice() -> str:
    cle = {
        "type": "service_account", "project_id": "test", "private_key_id": "x",
        "private_key": "-----BEGIN PRIVATE KEY-----\nfaux\n-----END PRIVATE KEY-----\n",
        "client_email": "test@test.iam.gserviceaccount.com", "client_id": "1",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    return base64.b64encode(json.dumps(cle).encode()).decode()


def test_catalogue_google_play_disponible(client, monkeypatch):
    monkeypatch.setattr(m, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64", _cle_service_compte_factice())
    r = client.get("/api/google-play/catalogue")
    assert r.status_code == 200
    data = r.json()
    assert data["disponible"] is True
    assert len(data["produits"]) == 4


def test_achat_valide_credite_le_bon_montant(client, utilisateur, monkeypatch):
    monkeypatch.setattr(m, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64", _cle_service_compte_factice())
    monkeypatch.setattr(m, "_verifier_achat_google_play", lambda pid, tok: {"purchaseState": 0})
    appels_consommation = {"n": 0}
    def _fausse_consommation(pid, tok):
        appels_consommation["n"] += 1
    monkeypatch.setattr(m, "_consommer_achat_google_play", _fausse_consommation)

    r_moi = client.get("/api/auth/moi", headers=utilisateur["headers"])
    credits_avant = r_moi.json()["credits"]

    r = client.post("/api/google-play/verifier", json={
        "product_id": "djeliya_credits_25", "purchase_token": "jeton-unique-abc", "order_id": "GPA.1",
    }, headers=utilisateur["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["statut"] == "payee"
    assert r.json()["credits"] == 25
    assert appels_consommation["n"] == 1, "La consommation de l'achat doit être appelée, sinon Google rembourse automatiquement"

    r_moi2 = client.get("/api/auth/moi", headers=utilisateur["headers"])
    assert r_moi2.json()["credits"] == credits_avant + 25


def test_rejouer_le_meme_jeton_ne_credite_jamais_deux_fois(client, utilisateur, monkeypatch):
    monkeypatch.setattr(m, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64", _cle_service_compte_factice())
    monkeypatch.setattr(m, "_verifier_achat_google_play", lambda pid, tok: {"purchaseState": 0})
    monkeypatch.setattr(m, "_consommer_achat_google_play", lambda pid, tok: None)

    payload = {"product_id": "djeliya_credits_10", "purchase_token": "jeton-rejoue-xyz", "order_id": "GPA.2"}
    r1 = client.post("/api/google-play/verifier", json=payload, headers=utilisateur["headers"])
    assert r1.json()["deja_traite"] is False

    r_moi_apres_premier = client.get("/api/auth/moi", headers=utilisateur["headers"])
    credits_apres_premier = r_moi_apres_premier.json()["credits"]

    # Rejeu exact du même jeton (simulateur d'un double appel réseau, ou d'une
    # tentative de fraude par rejeu)
    r2 = client.post("/api/google-play/verifier", json=payload, headers=utilisateur["headers"])
    assert r2.json()["deja_traite"] is True

    r_moi_apres_second = client.get("/api/auth/moi", headers=utilisateur["headers"])
    assert r_moi_apres_second.json()["credits"] == credits_apres_premier, "Un jeton rejoué ne doit jamais créditer une seconde fois"


def test_achat_annule_cote_google_ne_credite_rien(client, utilisateur, monkeypatch):
    monkeypatch.setattr(m, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64", _cle_service_compte_factice())
    monkeypatch.setattr(m, "_verifier_achat_google_play", lambda pid, tok: {"purchaseState": 1})  # annulé

    r_moi = client.get("/api/auth/moi", headers=utilisateur["headers"])
    credits_avant = r_moi.json()["credits"]

    r = client.post("/api/google-play/verifier", json={
        "product_id": "djeliya_credits_10", "purchase_token": "jeton-annule", "order_id": "GPA.3",
    }, headers=utilisateur["headers"])
    assert r.json()["statut"] == "echouee"

    r_moi2 = client.get("/api/auth/moi", headers=utilisateur["headers"])
    assert r_moi2.json()["credits"] == credits_avant


def test_produit_inconnu_refuse(client, utilisateur, monkeypatch):
    monkeypatch.setattr(m, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64", _cle_service_compte_factice())
    r = client.post("/api/google-play/verifier", json={
        "product_id": "produit_qui_nexiste_pas", "purchase_token": "x",
    }, headers=utilisateur["headers"])
    assert r.status_code == 422


def test_interrupteur_recharges_desactivees_bloque_tout(client, utilisateur, monkeypatch):
    monkeypatch.setattr(m, "RECHARGES_ACTIVEES", False)
    monkeypatch.setattr(m, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64", _cle_service_compte_factice())

    r_catalogue = client.get("/api/google-play/catalogue")
    assert r_catalogue.json()["disponible"] is False

    r = client.post("/api/google-play/verifier", json={
        "product_id": "djeliya_credits_10", "purchase_token": "x",
    }, headers=utilisateur["headers"])
    assert r.status_code == 403
