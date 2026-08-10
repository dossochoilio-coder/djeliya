"""
Tests d'authentification — inscription, connexion, protection des routes
sans jeton valide, et isolation des données entre comptes.
"""

import uuid


def test_inscription_retourne_un_jeton_valide(client):
    email = f"nouveau-{uuid.uuid4().hex[:8]}@cires.ci"
    r = client.post("/api/auth/inscription", json={
        "email": email, "mot_de_passe": "motdepasse1", "accepte_cgu": True,
    })
    assert r.status_code == 200
    assert r.json()["token"]
    assert r.json()["utilisateur"]["email"] == email
    assert r.json()["utilisateur"]["credits"] > 0  # crédits d'essai gratuits


def test_inscription_refuse_un_email_deja_utilise(client, utilisateur):
    r = client.post("/api/auth/inscription", json={
        "email": utilisateur["email"], "mot_de_passe": "autremotdepasse", "accepte_cgu": True,
    })
    assert r.status_code >= 400


def test_inscription_refuse_sans_acceptation_des_cgu(client):
    email = f"refus-{uuid.uuid4().hex[:8]}@cires.ci"
    r = client.post("/api/auth/inscription", json={
        "email": email, "mot_de_passe": "motdepasse1", "accepte_cgu": False,
    })
    assert r.status_code >= 400


def test_connexion_avec_bon_mot_de_passe(client, utilisateur):
    r = client.post("/api/auth/connexion", json={
        "email": utilisateur["email"], "mot_de_passe": "motdepasse1",
    })
    assert r.status_code == 200
    assert r.json()["token"]


def test_connexion_refuse_mauvais_mot_de_passe(client, utilisateur):
    r = client.post("/api/auth/connexion", json={
        "email": utilisateur["email"], "mot_de_passe": "mauvais-mot-de-passe",
    })
    assert r.status_code == 401


def test_route_protegee_refuse_sans_jeton(client):
    r = client.get("/api/auth/moi")
    assert r.status_code in (401, 403)


def test_route_protegee_refuse_jeton_invalide(client):
    r = client.get("/api/auth/moi", headers={"Authorization": "Bearer jeton-completement-invalide"})
    assert r.status_code == 401


def test_un_utilisateur_ne_voit_jamais_les_etudes_dun_autre(client, utilisateur, autre_utilisateur):
    r_creer = client.post("/api/etudes-quantitatives", json={"theme": "Étude privée", "langue": "fr"}, headers=utilisateur["headers"])
    etude_id = r_creer.json()["id"]

    r_acces_etranger = client.get(f"/api/etudes-quantitatives/{etude_id}", headers=autre_utilisateur["headers"])
    assert r_acces_etranger.status_code == 404

    r_liste_proprietaire = client.get("/api/etudes-quantitatives", headers=utilisateur["headers"])
    assert any(e["id"] == etude_id for e in r_liste_proprietaire.json())

    r_liste_etranger = client.get("/api/etudes-quantitatives", headers=autre_utilisateur["headers"])
    assert not any(e["id"] == etude_id for e in r_liste_etranger.json())
