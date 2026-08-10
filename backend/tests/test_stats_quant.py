"""
Tests du moteur statistique de base (app/stats_quant.py) — alpha de Cronbach,
corrélations, et le traitement des variables à item numérique unique (le bug
qui empêchait toute variable économique d'apparaître dans les corrélations,
corrigé en construisant la branche sciences économiques).
"""

import numpy as np

from app.stats_quant import analyser_donnees, cronbach_alpha


def _questionnaire(sections):
    return {"sections": sections}


def test_alpha_eleve_sur_items_fortement_correles():
    """Des items qui mesurent tous le même construit latent doivent produire
    un alpha de Cronbach élevé — vérifié par construction, pas par hasard."""
    np.random.seed(1)
    n = 200
    latent = np.random.normal(3, 1, n)
    matrice = np.column_stack([
        np.clip(np.round(latent + np.random.normal(0, 0.3, n)), 1, 5) for _ in range(4)
    ])
    alpha = cronbach_alpha(matrice)
    assert alpha > 0.8


def test_alpha_faible_sur_items_independants():
    """Des items générés indépendamment les uns des autres (aucun construit
    commun) doivent produire un alpha faible, pas un score artificiellement bon."""
    np.random.seed(2)
    n = 200
    matrice = np.random.randint(1, 6, size=(n, 4))
    alpha = cronbach_alpha(matrice)
    assert alpha < 0.3


def test_variable_a_item_unique_sans_alpha_mais_exploitable():
    """Une variable économique mesurée par un seul item numérique (revenu,
    prix...) ne doit jamais avoir d'alpha de Cronbach (non calculable à 1 item),
    mais doit rester utilisable pour les corrélations — c'est le bug trouvé et
    corrigé en construisant la branche sciences économiques : avant le
    correctif, ces variables étaient purement et simplement absentes des
    corrélations."""
    np.random.seed(3)
    n = 100
    revenu = np.random.normal(150000, 40000, n)
    satisfaction_latente = np.random.normal(3, 1, n)

    questionnaire = _questionnaire([
        {"titre": "S1", "variable_associee": "Revenu", "items": [{"code": "Q1", "type": "numerique"}]},
        {"titre": "S2", "variable_associee": "Satisfaction", "items": [
            {"code": f"Q{i}", "type": "echelle_likert"} for i in range(2, 5)
        ]},
    ])
    lignes = [
        {
            "Q1": float(revenu[i]),
            "Q2": int(np.clip(round(satisfaction_latente[i] + np.random.normal(0, 0.3)), 1, 5)),
            "Q3": int(np.clip(round(satisfaction_latente[i] + np.random.normal(0, 0.3)), 1, 5)),
            "Q4": int(np.clip(round(satisfaction_latente[i] + np.random.normal(0, 0.3)), 1, 5)),
        }
        for i in range(n)
    ]

    resultats = analyser_donnees(lignes, questionnaire)
    fiab_revenu = next(f for f in resultats["fiabilite"] if f["variable"] == "Revenu")
    assert fiab_revenu["alpha_cronbach"] is None
    assert fiab_revenu["interpretation"] == "non applicable (indicateur à item unique)"
    assert fiab_revenu["moyenne_composite"] > 100000  # bien la vraie valeur du revenu

    # Le vrai test de non-régression : le revenu DOIT apparaître dans les
    # corrélations, pas en être exclu comme avant le correctif.
    variables_dans_correlations = {c["variable_1"] for c in resultats["correlations"]} | {
        c["variable_2"] for c in resultats["correlations"]
    }
    assert "Revenu" in variables_dans_correlations


def test_correlation_detecte_une_vraie_relation():
    """Deux construits construits pour être corrélés doivent ressortir comme
    significativement corrélés, avec le bon signe."""
    np.random.seed(4)
    n = 150
    x = np.random.normal(3, 1, n)
    y = 0.7 * x + np.random.normal(0, 0.5, n)

    questionnaire = _questionnaire([
        {"titre": "S1", "variable_associee": "X", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(1, 4)]},
        {"titre": "S2", "variable_associee": "Y", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(4, 7)]},
    ])
    lignes = []
    for i in range(n):
        ligne = {}
        for j in range(1, 4):
            ligne[f"Q{j}"] = int(np.clip(round(x[i] + np.random.normal(0, 0.3)), 1, 5))
        for j in range(4, 7):
            ligne[f"Q{j}"] = int(np.clip(round(y[i] + np.random.normal(0, 0.3)), 1, 5))
        lignes.append(ligne)

    resultats = analyser_donnees(lignes, questionnaire)
    assert len(resultats["correlations"]) == 1
    corr = resultats["correlations"][0]
    assert corr["r"] > 0.4
    assert corr["p_valeur"] < 0.05


def test_moins_de_trois_repondants_ne_plante_pas():
    """Un jeu de données trop petit pour être analysé doit être géré
    proprement (résultats vides), jamais faire planter le moteur."""
    questionnaire = _questionnaire([
        {"titre": "S1", "variable_associee": "X", "items": [{"code": "Q1", "type": "echelle_likert"}, {"code": "Q2", "type": "echelle_likert"}]},
    ])
    lignes = [{"Q1": 3, "Q2": 4}, {"Q1": 2, "Q2": 2}]  # seulement 2 répondants
    resultats = analyser_donnees(lignes, questionnaire)
    assert resultats["fiabilite"] == []
