"""
Tests du système de crédits — déduction à la création d'une étude, et surtout
le remboursement automatique en cas d'échec (jamais facturer un chercheur pour
une génération qui a échoué).
"""

import app.main as m
from app.db import get_session, EtudeQuantitative, Utilisateur


def test_creation_etude_deduit_le_bon_nombre_de_credits(client, utilisateur, monkeypatch):
    # La génération se poursuit en arrière-plan après la création — sans
    # simuler l'IA, l'appel réel échouerait (aucune clé API en test) et
    # déclencherait un remboursement automatique, entrant en course avec la
    # vérification du solde ci-dessous. On neutralise uniquement la fonction
    # de génération elle-même (jamais le mécanisme de threading lui-même,
    # dont FastAPI a besoin en interne pour exécuter les routes synchrones).
    monkeypatch.setattr(m, "_run_etude_quant", lambda *a, **k: None)

    # Le crédit d'essai gratuit (5) ne couvre plus, à lui seul, le coût d'une
    # étude quantitative (7) depuis la révision tarifaire — on recharge le
    # compte de test pour isoler ce qu'on veut vérifier ici : la déduction,
    # pas le refus pour solde insuffisant (déjà testé séparément).
    session = get_session()
    try:
        u = session.get(Utilisateur, utilisateur["id"])
        u.credits = 20
        session.commit()
    finally:
        session.close()

    r_moi = client.get("/api/auth/moi", headers=utilisateur["headers"])
    credits_avant = r_moi.json()["credits"]

    r = client.post("/api/etudes-quantitatives", json={"theme": "Test crédits", "langue": "fr"}, headers=utilisateur["headers"])
    assert r.status_code == 200, r.text

    r_moi2 = client.get("/api/auth/moi", headers=utilisateur["headers"])
    credits_apres = r_moi2.json()["credits"]
    assert credits_avant - credits_apres == 7  # coût d'une étude quantitative (tarif révisé)


def test_theme_vide_refuse_sans_debiter(client, utilisateur):
    r_moi = client.get("/api/auth/moi", headers=utilisateur["headers"])
    credits_avant = r_moi.json()["credits"]

    r = client.post("/api/etudes-quantitatives", json={"theme": "   ", "langue": "fr"}, headers=utilisateur["headers"])
    assert r.status_code == 422

    r_moi2 = client.get("/api/auth/moi", headers=utilisateur["headers"])
    assert r_moi2.json()["credits"] == credits_avant


def test_credits_insuffisants_refuse_la_creation(client, utilisateur):
    session = get_session()
    try:
        u = session.get(Utilisateur, utilisateur["id"])
        u.credits = 1  # moins que le coût d'une étude (3)
        u.email_verifie = True
        session.commit()
    finally:
        session.close()

    r = client.post("/api/etudes-quantitatives", json={"theme": "Test", "langue": "fr"}, headers=utilisateur["headers"])
    assert r.status_code == 402


def test_admin_ne_paie_jamais_de_credits(client, utilisateur, monkeypatch):
    monkeypatch.setattr(m, "_run_etude_quant", lambda *a, **k: None)
    session = get_session()
    try:
        u = session.get(Utilisateur, utilisateur["id"])
        u.credits = 0
        u.est_admin = True
        session.commit()
    finally:
        session.close()

    r = client.post("/api/etudes-quantitatives", json={"theme": "Test admin", "langue": "fr"}, headers=utilisateur["headers"])
    assert r.status_code == 200, r.text

    r_moi = client.get("/api/auth/moi", headers=utilisateur["headers"])
    assert r_moi.json()["credits"] == 0  # jamais débité, même à 0 crédit


def test_echec_analyse_quantitative_rembourse(client, utilisateur):
    """Un import de données qui échoue (fichier illisible, pas assez de
    répondants...) ne doit jamais laisser l'utilisateur débité pour rien."""
    session = get_session()
    try:
        u = session.get(Utilisateur, utilisateur["id"])
        u.email_verifie = True
        session.commit()

        e = EtudeQuantitative(
            id="etude-echec-remboursement", proprietaire_id=utilisateur["id"], theme="T", langue="fr", statut="termine",
            contenu={"titre": "T", "questionnaire": {"sections": [
                {"titre": "S1", "variable_associee": "V1", "items": [{"code": "Q1", "type": "echelle_likert"}]},
            ]}},
        )
        session.add(e)
        session.commit()
    finally:
        session.close()

    r_moi = client.get("/api/auth/moi", headers=utilisateur["headers"])
    credits_avant = r_moi.json()["credits"]

    # Fichier délibérément invalide (pas un vrai .xlsx) pour déclencher un échec
    r = client.post(
        "/api/etudes-quantitatives/etude-echec-remboursement/donnees",
        files={"fichier": ("d.xlsx", b"ceci n'est pas un fichier excel valide", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=utilisateur["headers"],
    )
    assert r.status_code == 422

    r_moi2 = client.get("/api/auth/moi", headers=utilisateur["headers"])
    assert r_moi2.json()["credits"] == credits_avant, "Un échec d'import ne doit jamais débiter l'utilisateur"


def test_le_cout_de_chaque_action_est_documente_dans_couts_credits(client):
    """Vérifie que la route publique des coûts reflète bien la tarification
    actuelle — le mobile s'appuie dessus pour ne jamais afficher un prix
    obsolète après une révision tarifaire."""
    r = client.get("/api/couts-credits")
    assert r.status_code == 200
    couts = r.json()
    assert couts["etude_quantitative"] == 7
    assert couts["analyse_quantitative"] == 5
    assert couts["transcription"] == 2
    assert couts["analyse_qualitative"] == 3
    assert couts["guide_entretien"] == 2
