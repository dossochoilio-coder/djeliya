"""
Tests de la sélection d'options d'analyse par le chercheur, via la vraie route
d'import — un chercheur qui ne veut que des corrélations ne doit jamais se
voir imposer AFE/AFC/régression/médiation/synthèse/passerelle, et le
comportement historique (tout activé) doit rester intact quand aucune
préférence n'est transmise.
"""

import io

import numpy as np
from openpyxl import Workbook

from app.db import get_session, EtudeQuantitative


def _etude_avec_mediation(session, proprietaire_id: str, etude_id: str):
    session.add(EtudeQuantitative(
        id=etude_id, proprietaire_id=proprietaire_id, theme="Test options", langue="fr", statut="termine",
        contenu={
            "titre": "T",
            "methodologie": {"variables": [
                {"nom": "Adoption", "type": "indépendante"},
                {"nom": "Confiance", "type": "médiatrice"},
                {"nom": "Fidelite", "type": "dépendante"},
            ]},
            "questionnaire": {"sections": [
                {"titre": "S1", "variable_associee": "Adoption", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(1, 4)]},
                {"titre": "S2", "variable_associee": "Confiance", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(4, 7)]},
                {"titre": "S3", "variable_associee": "Fidelite", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(7, 10)]},
            ]},
        },
    ))
    session.commit()


def _fichier_reponses_aleatoires(n=150):
    wb = Workbook()
    ws = wb.active
    ws.title = "Réponses"
    ws.append([f"Q{i}" for i in range(1, 10)])
    for _ in range(n):
        ws.append([int(np.random.randint(1, 6)) for _ in range(9)])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def test_options_minimales_ne_calculent_que_les_correlations(client, utilisateur):
    session = get_session()
    try:
        _etude_avec_mediation(session, utilisateur["id"], "etude-opt-min")
    finally:
        session.close()

    np.random.seed(9000)
    r = client.post(
        "/api/etudes-quantitatives/etude-opt-min/donnees",
        files={"fichier": ("d.xlsx", _fichier_reponses_aleatoires(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={
            "inclure_afe": "false", "inclure_afc": "false", "inclure_regression": "false",
            "inclure_mediation": "false", "inclure_passerelle": "false", "inclure_synthese": "false",
        },
        headers=utilisateur["headers"],
    )
    assert r.status_code == 200, r.text
    resultat = r.json()

    assert resultat["synthese_statut"] == "non_demandee"
    assert resultat["passerelle_statut"] == "non_demandee"
    av = resultat["resultats"]["analyses_avancees"]
    assert av["afe"] is None
    assert av["afc"] is None
    assert av["regressions"] == []
    assert av["mediations"] == []
    # La base (corrélations, descriptives) reste toujours calculée, quel que
    # soit le choix du chercheur — ce n'est jamais désactivable.
    assert resultat["resultats"]["correlations"] is not None
    assert resultat["resultats"]["descriptives"] is not None


def test_aucune_option_transmise_garde_le_comportement_historique(client, utilisateur, monkeypatch):
    """Non-régression : un client mobile qui n'envoie pas encore les nouveaux
    champs (ancienne version de l'app) doit continuer à tout obtenir, comme
    avant l'introduction de la sélection d'options."""
    session = get_session()
    try:
        _etude_avec_mediation(session, utilisateur["id"], "etude-opt-defaut")
    finally:
        session.close()

    import app.main as m
    monkeypatch.setattr(m, "_run_synthese_quant", lambda *a, **k: None)
    monkeypatch.setattr(m, "_run_passerelle_qual_quant", lambda *a, **k: None)

    np.random.seed(9001)
    n = 150
    x_latent = np.random.normal(3, 0.9, n)
    m_latent = 0.55 * x_latent + np.random.normal(0, 0.6, n)
    wb = Workbook()
    ws = wb.active
    ws.title = "Réponses"
    ws.append([f"Q{i}" for i in range(1, 10)])
    for i in range(n):
        ligne = [int(np.clip(round(x_latent[i] + np.random.normal(0, 0.4)), 1, 5)) for _ in range(3)]
        ligne += [int(np.clip(round(m_latent[i] + np.random.normal(0, 0.4)), 1, 5)) for _ in range(3)]
        ligne += [int(np.random.randint(1, 6)) for _ in range(3)]
        ws.append(ligne)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    r = client.post(
        "/api/etudes-quantitatives/etude-opt-defaut/donnees",
        files={"fichier": ("d.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=utilisateur["headers"],
    )
    assert r.status_code == 200, r.text
    resultat = r.json()
    assert all(resultat["options_analyse"].values())
    av = resultat["resultats"]["analyses_avancees"]
    assert av["afe"] is not None
    assert resultat["synthese_statut"] == "en_cours"
    assert resultat["passerelle_statut"] == "en_cours"
