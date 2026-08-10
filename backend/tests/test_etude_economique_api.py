"""
Test de bout en bout, via la vraie route API, de l'enrichissement économétrique
en branche sciences économiques — la scène complète : import de données réelles
sur une étude économique, vérification que VIF/hétéroscédasticité/élasticités
apparaissent bien dans la réponse, et non-régression en branche sciences
humaines (une étude psychosociale ne doit jamais voir ces diagnostics).
"""

import io

import numpy as np
from openpyxl import Workbook

from app.db import get_session, EtudeQuantitative


def _questionnaire_prix_quantite():
    return {"sections": [
        {"titre": "Prix", "variable_associee": "Prix", "items": [{"code": "Q1", "type": "numerique"}]},
        {"titre": "Quantité", "variable_associee": "Quantite demandee", "items": [{"code": "Q2", "type": "numerique"}]},
    ]}


def test_import_donnees_etude_economique_inclut_diagnostics_econometriques(client, utilisateur):
    session = get_session()
    try:
        session.add(EtudeQuantitative(
            id="etude-eco-api", proprietaire_id=utilisateur["id"], theme="Élasticité-prix", branche="sciences_economiques",
            langue="fr", statut="termine",
            contenu={
                "titre": "T",
                "methodologie": {"variables": [
                    {"nom": "Prix", "type": "indépendante"},
                    {"nom": "Quantite demandee", "type": "dépendante"},
                ]},
                "questionnaire": _questionnaire_prix_quantite(),
            },
        ))
        session.commit()
    finally:
        session.close()

    np.random.seed(3000)
    n = 150
    prix = np.random.normal(100, 15, n)
    quantite = np.clip(800 - 3 * prix + np.random.normal(0, 30, n), 50, None)

    wb = Workbook()
    ws = wb.active
    ws.title = "Réponses"
    ws.append(["Q1", "Q2"])
    for i in range(n):
        ws.append([float(prix[i]), float(quantite[i])])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    r = client.post(
        "/api/etudes-quantitatives/etude-eco-api/donnees",
        files={"fichier": ("d.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=utilisateur["headers"],
    )
    assert r.status_code == 200, r.text
    av = r.json()["resultats"]["analyses_avancees"]
    reg = av["regressions"][0]
    assert reg["vif"] is None or isinstance(reg["vif"], list)  # 1 seul prédicteur ici : VIF non pertinent, absent ou vide
    assert reg["heteroscedasticite"] is not None
    assert reg["elasticites"] is not None
    assert reg["elasticites"][0]["elasticite"] < 0


def test_import_donnees_etude_sciences_humaines_sans_diagnostics_econometriques(client, utilisateur):
    """Non-régression : une étude en sciences humaines (comportement par
    défaut) ne doit jamais afficher VIF, hétéroscédasticité ou élasticités —
    ces diagnostics sont propres à la branche économique."""
    session = get_session()
    try:
        session.add(EtudeQuantitative(
            id="etude-humaines-api", proprietaire_id=utilisateur["id"], theme="Satisfaction", branche="sciences_humaines",
            langue="fr", statut="termine",
            contenu={
                "titre": "T",
                "methodologie": {"variables": [
                    {"nom": "Adoption", "type": "indépendante"},
                    {"nom": "Satisfaction", "type": "dépendante"},
                ]},
                "questionnaire": {"sections": [
                    {"titre": "S1", "variable_associee": "Adoption", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(1, 4)]},
                    {"titre": "S2", "variable_associee": "Satisfaction", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(4, 7)]},
                ]},
            },
        ))
        session.commit()
    finally:
        session.close()

    np.random.seed(3001)
    n = 100
    latent = np.random.normal(3, 1, n)

    wb = Workbook()
    ws = wb.active
    ws.title = "Réponses"
    ws.append([f"Q{i}" for i in range(1, 7)])
    for i in range(n):
        ws.append([int(np.clip(round(latent[i] + np.random.normal(0, 0.3)), 1, 5)) for _ in range(6)])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    r = client.post(
        "/api/etudes-quantitatives/etude-humaines-api/donnees",
        files={"fichier": ("d.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=utilisateur["headers"],
    )
    assert r.status_code == 200, r.text
    reg = r.json()["resultats"]["analyses_avancees"]["regressions"][0]
    assert "elasticites" not in reg
    assert "vif" not in reg
    assert "heteroscedasticite" not in reg
