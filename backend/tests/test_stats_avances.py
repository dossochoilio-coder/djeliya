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
    afe_diagnostics, afc_ajustement, regression_multiple, regression_econometrique,
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


def test_vif_detecte_une_vraie_multicolinearite():
    """Régression économétrique : le VIF doit détecter une colinéarité
    délibérément construite, tout en laissant une variable indépendante
    intacte — la spécificité économétrique demandée pour la branche
    sciences économiques."""
    np.random.seed(1000)
    n = 300
    x1 = np.random.normal(100, 15, n)
    x2 = x1 * 1.02 + np.random.normal(0, 1, n)  # quasi-copie -> forte colinéarité
    x3 = np.random.normal(50, 10, n)
    y = 2 * x1 + np.random.normal(0, 5, n)

    resultat = regression_econometrique(y, {"colineaire_1": x1, "colineaire_2": x2, "independant": x3})
    vif = {v["nom"]: v for v in resultat["vif"]}
    assert vif["colineaire_1"]["vif"] > 10
    assert vif["colineaire_1"]["problematique"] is True
    assert vif["independant"]["vif"] < 5
    assert vif["independant"]["problematique"] is False


def test_breusch_pagan_distingue_hetero_et_homoscedasticite():
    np.random.seed(1001)
    n = 300
    x = np.random.uniform(1, 100, n)

    y_hetero = 3 * x + np.random.normal(0, x * 0.5, n)  # variance croissante avec x
    resultat_hetero = regression_econometrique(y_hetero, {"x": x})
    assert resultat_hetero["heteroscedasticite"]["homoscedastique"] is False

    y_homo = 3 * x + np.random.normal(0, 5, n)  # variance constante
    resultat_homo = regression_econometrique(y_homo, {"x": x})
    assert resultat_homo["heteroscedasticite"]["homoscedastique"] is True


def test_elasticite_proche_de_la_valeur_theorique_connue():
    """La formule d'élasticité au point moyen (β × X̄/Ȳ) doit retrouver une
    valeur très proche de la valeur théorique calculable à l'avance pour une
    relation linéaire construite : Y = 500 + 2X."""
    np.random.seed(1003)
    n = 300
    prix = np.random.normal(100, 10, n)
    quantite = 500 + 2 * prix + np.random.normal(0, 20, n)

    resultat = regression_econometrique(quantite, {"prix": prix})
    elasticite_estimee = resultat["elasticites"][0]["elasticite"]
    elasticite_theorique = 2 * (np.mean(prix) / np.mean(quantite))
    assert abs(elasticite_estimee - elasticite_theorique) < 0.05


def test_elasticite_absente_si_variable_negative_ou_nulle():
    """Une élasticité n'a pas de sens économique sur une variable pouvant
    être négative ou nulle (ex. un score centré) — ne doit jamais être
    rapportée dans ce cas, plutôt qu'un calcul trompeur."""
    np.random.seed(1004)
    n = 100
    x_avec_negatifs = np.random.normal(0, 1, n)  # peut être négatif
    y = 2 * x_avec_negatifs + np.random.normal(0, 0.5, n)
    resultat = regression_econometrique(y, {"x": x_avec_negatifs})
    assert resultat["elasticites"] is None


def test_analyses_avancees_active_diagnostics_econometriques_seulement_en_branche_economique():
    np.random.seed(2000)
    n = 200
    prix = np.random.normal(100, 15, n)
    quantite = np.clip(800 - 3 * prix + np.random.normal(0, 30, n), 50, None)

    questionnaire = {"sections": [
        {"titre": "S1", "variable_associee": "Prix", "items": [{"code": "Q1", "type": "numerique"}]},
        {"titre": "S2", "variable_associee": "Quantite", "items": [{"code": "Q2", "type": "numerique"}]},
    ]}
    variables = [{"nom": "Prix", "type": "indépendante"}, {"nom": "Quantite", "type": "dépendante"}]
    lignes = [{"Q1": float(prix[i]), "Q2": float(quantite[i])} for i in range(n)]

    resultat_eco = analyses_avancees(lignes, questionnaire, variables, branche="sciences_economiques")
    reg_eco = resultat_eco["regressions"][0]
    assert "elasticites" in reg_eco and reg_eco["elasticites"] is not None
    assert reg_eco["elasticites"][0]["elasticite"] < 0  # loi de la demande : prix ↑ -> quantité ↓

    resultat_humaines = analyses_avancees(lignes, questionnaire, variables, branche="sciences_humaines")
    reg_humaines = resultat_humaines["regressions"][0]
    assert "elasticites" not in reg_humaines
    assert "vif" not in reg_humaines
