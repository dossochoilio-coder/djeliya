"""
Tests des analyses statistiques avancées (app/stats_avances.py) — AFE, AFC,
régression, médiation, comparaison de groupes. Porte une attention
particulière aux vrais bugs trouvés et corrigés au fil du développement :
- l'AFC échouait silencieusement avec des noms de construits réalistes
  (espaces, accents, barres obliques) — testé explicitement ci-dessous ;
- la médiation entre une variable à grande échelle brute et une échelle
  Likert produisait un effet indirect numériquement écrasé à 0.000 sans
  standardisation préalable.
"""

import numpy as np
import pytest

from app.stats_avances import (
    afe_diagnostics, afc_ajustement, regression_multiple,
    mediation_bootstrap, comparaison_groupes, analyses_avancees,
)


def test_afe_retrouve_une_structure_a_deux_facteurs_connue():
    np.random.seed(10)
    n = 300
    f1 = np.random.normal(0, 1, n)
    f2 = np.random.normal(0, 1, n)
    items, noms = [], []
    for i in range(3):
        items.append(f1 * 0.8 + np.random.normal(0, 0.5, n)); noms.append(f"F1_item{i+1}")
    for i in range(3):
        items.append(f2 * 0.8 + np.random.normal(0, 0.5, n)); noms.append(f"F2_item{i+1}")

    resultat = afe_diagnostics(np.column_stack(items), noms)
    assert resultat["n_facteurs_extraits"] == 2
    assert resultat["bartlett_factorisable"] is True
    for charge in resultat["charges_factorielles"]:
        assert max(abs(x) for x in charge["charges"]) > 0.5


def test_afc_avec_noms_de_construits_realistes():
    """Régression du vrai bug trouvé : l'AFC échouait dès que les noms de
    construits contenaient des espaces, accents ou barres obliques (ex.
    « Connaissance/disponibilité Starlink »), parce que ces caractères sont
    invalides dans la syntaxe de modèle de semopy. Corrigé par un mappage
    interne vers des identifiants sûrs (F1, F2...)."""
    np.random.seed(20)
    n = 250
    f1 = np.random.normal(0, 1, n)
    f2 = np.random.normal(0, 1, n)
    donnees = {}
    for i in range(1, 4):
        donnees[f"A{i}"] = f1 * 0.85 + np.random.normal(0, 0.5, n)
    for i in range(1, 4):
        donnees[f"B{i}"] = f2 * 0.85 + np.random.normal(0, 0.5, n)

    structure = {
        "Connaissance/disponibilité Starlink": ["A1", "A2", "A3"],
        "Réaction perçue de l'opérateur": ["B1", "B2", "B3"],
    }
    resultat = afc_ajustement(donnees, structure)
    assert resultat.get("erreur") is None, resultat
    assert resultat["cfi"] > 0.90
    # Les vrais noms doivent apparaître dans les charges factorielles en sortie,
    # pas les identifiants internes sûrs (F1, F2).
    construits_en_sortie = {c["construit"] for c in resultat["charges_factorielles"]}
    assert construits_en_sortie == set(structure.keys())


def test_regression_multiple_retrouve_les_vrais_coefficients():
    np.random.seed(30)
    n = 250
    x1 = np.random.normal(3, 1, n)
    x2 = np.random.normal(3, 1, n)
    x3_sans_effet = np.random.normal(3, 1, n)
    y = 0.5 * x1 + 0.25 * x2 + np.random.normal(0, 0.8, n)

    resultat = regression_multiple(y, {"fort": x1, "modere": x2, "nul": x3_sans_effet})
    preds = {p["nom"]: p for p in resultat["predicteurs"]}
    assert preds["fort"]["significatif"] is True and preds["fort"]["beta"] > 0.3
    assert preds["modere"]["significatif"] is True and 0.1 < preds["modere"]["beta"] < 0.4
    # Ne jamais tester une significativité binaire sur un effet nul : par
    # construction même du seuil p<0,05, un vrai effet nul ressort "significatif"
    # par pur hasard environ 1 fois sur 20 — un test qui dépend de ça est fragile
    # par nature. On vérifie plutôt que son beta reste nettement plus petit que
    # les effets réels, ce qui est robuste et statistiquement plus juste.
    assert abs(preds["nul"]["beta"]) < abs(preds["modere"]["beta"])


def test_mediation_detecte_une_vraie_mediation():
    np.random.seed(40)
    n = 300
    x = np.random.normal(3, 1, n)
    m = 0.6 * x + np.random.normal(0, 0.5, n)
    y = 0.5 * m + 0.15 * x + np.random.normal(0, 0.6, n)

    resultat = mediation_bootstrap(x, m, y, n_bootstrap=1500)
    assert resultat["mediation_significative"] is True
    assert resultat["ic95_bas"] > 0


def test_mediation_rejette_absence_de_mediation():
    np.random.seed(41)
    n = 300
    x = np.random.normal(3, 1, n)
    m = np.random.normal(3, 1, n)
    y = np.random.normal(3, 1, n)

    resultat = mediation_bootstrap(x, m, y, n_bootstrap=1500)
    assert resultat["mediation_significative"] is False


def test_mediation_avec_variables_a_echelles_tres_differentes():
    """Régression du second bug trouvé : combiner une variable à grande
    échelle brute (ex. un revenu ~150 000 FCFA) avec une échelle Likert (1-5)
    produisait un effet indirect qui s'arrondissait numériquement à 0.000,
    bien que la médiation soit réelle. Corrigé par standardisation systématique."""
    np.random.seed(42)
    n = 200
    revenu = np.random.normal(150000, 40000, n)
    revenu_normalise = (revenu - revenu.mean()) / revenu.std()
    satisfaction = 3.0 + 0.6 * revenu_normalise + np.random.normal(0, 0.7, n)
    intention = 0.6 * satisfaction + np.random.normal(0, 0.6, n)

    resultat = mediation_bootstrap(revenu, satisfaction, intention, n_bootstrap=1500)
    assert resultat["effet_indirect_a_x_b"] != 0.0
    assert resultat["mediation_significative"] is True


def test_comparaison_groupes_detecte_une_vraie_difference():
    np.random.seed(50)
    groupe_a = np.random.normal(2.1, 0.6, 40)
    groupe_b = np.random.normal(3.8, 0.6, 45)
    resultat = comparaison_groupes(groupe_a, groupe_b, "A", "B")
    assert resultat["significatif"] is True
    assert abs(resultat["taille_effet_cohen_d"]) > 0.8


def test_comparaison_groupes_rejette_absence_de_difference():
    np.random.seed(51)
    groupe_a = np.random.normal(3.0, 0.7, 40)
    groupe_b = np.random.normal(3.0, 0.7, 45)
    resultat = comparaison_groupes(groupe_a, groupe_b, "A", "B")
    assert resultat["significatif"] is False


def test_comparaison_groupes_refuse_les_petits_echantillons():
    assert comparaison_groupes(np.array([1, 2]), np.array([1, 2, 3, 4]), "A", "B") is None


def test_analyses_avancees_orchestration_complete_avec_mediation():
    """Le scénario complet : une variable indépendante, une médiatrice, une
    dépendante — AFE, AFC, régression et médiation doivent tous être
    déclenchés automatiquement à partir des types de variables."""
    np.random.seed(60)
    n = 250
    x_latent = np.random.normal(3, 0.9, n)
    m_latent = 0.55 * x_latent + np.random.normal(0, 0.6, n)
    y_latent = 0.45 * m_latent + 0.1 * x_latent + np.random.normal(0, 0.6, n)

    questionnaire = {"sections": [
        {"titre": "S1", "variable_associee": "Adoption", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(1, 4)]},
        {"titre": "S2", "variable_associee": "Confiance", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(4, 7)]},
        {"titre": "S3", "variable_associee": "Fidelite", "items": [{"code": f"Q{i}", "type": "echelle_likert"} for i in range(7, 10)]},
    ]}
    variables = [
        {"nom": "Adoption", "type": "indépendante"},
        {"nom": "Confiance", "type": "médiatrice"},
        {"nom": "Fidelite", "type": "dépendante"},
    ]
    lignes = []
    for i in range(n):
        ligne = {}
        for j in range(1, 4):
            ligne[f"Q{j}"] = int(np.clip(round(x_latent[i] + np.random.normal(0, 0.4)), 1, 5))
        for j in range(4, 7):
            ligne[f"Q{j}"] = int(np.clip(round(m_latent[i] + np.random.normal(0, 0.4)), 1, 5))
        for j in range(7, 10):
            ligne[f"Q{j}"] = int(np.clip(round(y_latent[i] + np.random.normal(0, 0.4)), 1, 5))
        lignes.append(ligne)

    resultat = analyses_avancees(lignes, questionnaire, variables)
    assert resultat["afe"]["n_facteurs_extraits"] == 3
    assert resultat["afc"]["cfi"] > 0.85
    assert len(resultat["regressions"]) == 1
    assert len(resultat["mediations"]) == 1
    assert resultat["mediations"][0]["independante"] == "Adoption"


@pytest.mark.parametrize("n_facteurs_attendu,taille_echantillon", [(1, 5), (1, 20)])
def test_afe_refuse_sous_trois_variables(n_facteurs_attendu, taille_echantillon):
    """Une AFE n'a pas de sens sous 3 variables — doit être refusée proprement (None), jamais planter."""
    matrice = np.random.randint(1, 6, size=(taille_echantillon, 2))
    resultat = afe_diagnostics(matrice, ["Q1", "Q2"])
    assert resultat is None
