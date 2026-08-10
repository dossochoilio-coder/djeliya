"""
Analyses statistiques avancées pour l'étude quantitative : analyse factorielle
exploratoire (AFE), analyse factorielle confirmatoire (AFC), régression multiple
et test de médiation par bootstrap — en complément des statistiques descriptives
de base (stats_quant.py).

Chaque fonction est testée indépendamment avec des données aux propriétés
statistiques connues à l'avance, dans le même esprit que le reste de l'app.
"""

import numpy as np
from scipy import stats as sp_stats
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.stattools import jarque_bera
from factor_analyzer import FactorAnalyzer
from factor_analyzer.factor_analyzer import calculate_kmo, calculate_bartlett_sphericity

from .stats_quant import test_normalite


# ----------------------------------------------------------------- AFE
def afe_diagnostics(matrice: np.ndarray, noms_items: list[str]) -> dict:
    """Analyse factorielle exploratoire : adéquation de l'échantillonnage (KMO),
    sphéricité de Bartlett, nombre de facteurs (critère de Kaiser), et charges
    factorielles après extraction avec rotation varimax."""
    if matrice.shape[1] < 3:
        return None  # une AFE n'a pas de sens sous 3 variables

    kmo_par_item, kmo_total = calculate_kmo(matrice)
    chi2, p_bartlett = calculate_bartlett_sphericity(matrice)

    fa_libre = FactorAnalyzer(rotation=None, n_factors=matrice.shape[1])
    fa_libre.fit(matrice)
    valeurs_propres, _ = fa_libre.get_eigenvalues()
    n_facteurs = max(1, int(np.sum(valeurs_propres > 1)))
    n_facteurs = min(n_facteurs, matrice.shape[1] - 1) if matrice.shape[1] > 1 else 1

    fa = FactorAnalyzer(n_factors=n_facteurs, rotation="varimax")
    fa.fit(matrice)
    charges = fa.loadings_
    _, _, variance_cumulee = fa.get_factor_variance()

    return {
        "kmo_total": round(float(kmo_total), 3),
        "kmo_interpretation": _interpretation_kmo(kmo_total),
        "kmo_par_item": [{"item": n, "kmo": round(float(v), 3)} for n, v in zip(noms_items, kmo_par_item)],
        "bartlett_chi2": round(float(chi2), 2),
        "bartlett_p": round(float(p_bartlett), 4),
        "bartlett_factorisable": bool(p_bartlett < 0.05),
        "n_facteurs_extraits": n_facteurs,
        "valeurs_propres": [round(float(v), 3) for v in valeurs_propres],
        "variance_expliquee_cumulee_pct": round(float(variance_cumulee[-1]) * 100, 1),
        "charges_factorielles": [
            {"item": noms_items[i], "charges": [round(float(c), 3) for c in charges[i]]}
            for i in range(len(noms_items))
        ],
    }


def _interpretation_kmo(kmo: float) -> str:
    if kmo >= 0.9:
        return "excellente adéquation"
    if kmo >= 0.8:
        return "très bonne adéquation"
    if kmo >= 0.7:
        return "bonne adéquation"
    if kmo >= 0.6:
        return "adéquation médiocre mais acceptable"
    if kmo >= 0.5:
        return "adéquation faible"
    return "échantillonnage inadéquat pour une AFE"


# ----------------------------------------------------------------- AFC
def afc_ajustement(donnees: dict, structure: dict[str, list[str]]) -> dict | None:
    """Analyse factorielle confirmatoire (modèle de mesure) via semopy : teste si
    la structure factorielle POSTULÉE (chaque construit mesuré par ses items
    déclarés) s'ajuste bien aux données, avec les indices d'ajustement usuels
    (CFI, TLI, RMSEA, SRMR)."""
    import pandas as pd
    import semopy

    construits_valides = {k: v for k, v in structure.items() if len(v) >= 2}
    if len(construits_valides) < 1:
        return None

    # Noms de construits sûrs pour semopy (qui n'accepte pas espaces, accents ou
    # slashs dans ses identifiants de variables latentes) — les vrais noms,
    # générés par l'IA, contiennent presque toujours ce genre de caractères
    # (ex. "Connaissance/disponibilité Starlink"). On mappe vers F1, F2... pour
    # la syntaxe du modèle, puis on retraduit vers les vrais noms en sortie.
    noms_surs = {construit: f"F{i}" for i, construit in enumerate(construits_valides, start=1)}
    noms_reels = {v: k for k, v in noms_surs.items()}

    lignes_modele = [f"{noms_surs[construit]} =~ " + " + ".join(items) for construit, items in construits_valides.items()]
    description_modele = "\n".join(lignes_modele)

    toutes_colonnes = [c for items in construits_valides.values() for c in items]
    df = pd.DataFrame({c: donnees[c] for c in toutes_colonnes})

    try:
        modele = semopy.Model(description_modele)
        modele.fit(df)
        stats_ajustement = semopy.calc_stats(modele)
    except Exception as ex:  # noqa: BLE001
        return {"erreur": f"L'AFC n'a pas convergé : {ex}"}

    ligne = stats_ajustement.iloc[0]

    def _get(nom, defaut=None):
        return float(ligne[nom]) if nom in ligne and ligne[nom] == ligne[nom] else defaut  # exclut NaN

    cfi, tli, rmsea, srmr = _get("CFI"), _get("TLI"), _get("RMSEA"), _get("SRMR")
    return {
        "cfi": round(cfi, 3) if cfi is not None else None,
        "tli": round(tli, 3) if tli is not None else None,
        "rmsea": round(rmsea, 3) if rmsea is not None else None,
        "srmr": round(srmr, 3) if srmr is not None else None,
        "interpretation": _interpretation_afc(cfi, rmsea),
        "charges_factorielles": _extraire_charges_semopy(modele, noms_reels),
    }


def _interpretation_afc(cfi, rmsea) -> str:
    if cfi is None or rmsea is None:
        return "indices d'ajustement non calculables pour ce modèle"
    bon = cfi >= 0.90 and rmsea <= 0.08
    excellent = cfi >= 0.95 and rmsea <= 0.06
    if excellent:
        return "ajustement excellent (CFI ≥ 0,95 ; RMSEA ≤ 0,06)"
    if bon:
        return "ajustement satisfaisant (CFI ≥ 0,90 ; RMSEA ≤ 0,08)"
    return "ajustement insuffisant — le modèle de mesure postulé ne rend pas bien compte des données"


def _extraire_charges_semopy(modele, noms_reels: dict[str, str]) -> list[dict]:
    inspection = modele.inspect()
    charges = inspection[inspection["op"] == "~"]
    resultat = []
    for _, ligne in charges.iterrows():
        if ligne["rval"] not in noms_reels:
            continue
        p_brut = ligne["p-value"]
        try:
            p_valeur = round(float(p_brut), 4)
        except (ValueError, TypeError):
            # semopy note "-" pour le premier indicateur de chaque facteur (fixé à
            # 1 par convention, pour l'identification du modèle — pas un paramètre
            # librement estimé, donc pas de p-valeur à tester).
            p_valeur = None
        resultat.append({
            "construit": noms_reels[ligne["rval"]], "item": ligne["lval"],
            "charge": round(float(ligne["Estimate"]), 3),
            "p_valeur": p_valeur,
        })
    return resultat


# ----------------------------------------------------------------- régression multiple
def regression_multiple(y: np.ndarray, predicteurs: dict[str, np.ndarray]) -> dict:
    """Régression linéaire multiple standardisée (variables centrées-réduites,
    coefficients bêta directement comparables entre prédicteurs) — teste l'effet
    de chaque prédicteur sur la variable dépendante en contrôlant les autres."""
    noms = list(predicteurs.keys())
    X = np.column_stack([predicteurs[n] for n in noms])
    y_z = (y - y.mean()) / y.std(ddof=1)
    X_z = (X - X.mean(axis=0)) / X.std(axis=0, ddof=1)
    X_const = sm.add_constant(X_z)

    modele = sm.OLS(y_z, X_const).fit()
    ic = np.asarray(modele.conf_int())
    params = np.asarray(modele.params)
    pvalues = np.asarray(modele.pvalues)

    return {
        "n": int(modele.nobs),
        "r2": round(float(modele.rsquared), 3),
        "r2_ajuste": round(float(modele.rsquared_adj), 3),
        "f_stat": round(float(modele.fvalue), 2),
        "f_p": round(float(modele.f_pvalue), 4),
        "modele_significatif": bool(modele.f_pvalue < 0.05),
        "predicteurs": [
            {
                "nom": noms[i], "beta": round(float(params[i + 1]), 3),
                "p_valeur": round(float(pvalues[i + 1]), 4),
                "significatif": bool(pvalues[i + 1] < 0.05),
                "ic95_bas": round(float(ic[i + 1, 0]), 3), "ic95_haut": round(float(ic[i + 1, 1]), 3),
            }
            for i in range(len(noms))
        ],
    }


# ----------------------------------------------------------------- diagnostics économétriques
def regression_econometrique(y: np.ndarray, predicteurs: dict[str, np.ndarray]) -> dict:
    """Régression multiple enrichie des diagnostics économétriques standards —
    ce qui distingue une analyse économique d'une simple régression : la
    multicolinéarité (VIF), l'hétéroscédasticité (test de Breusch-Pagan) et la
    normalité des résidus (test de Jarque-Bera) conditionnent la validité même
    des erreurs-types de la régression, pas un simple complément décoratif.
    Calcule aussi les élasticités au point moyen, quand toutes les variables
    concernées sont strictement positives (prix, quantité, revenu...) — sans
    quoi une élasticité n'a pas de sens économique et n'est jamais rapportée."""
    base = regression_multiple(y, predicteurs)
    noms = list(predicteurs.keys())
    X = np.column_stack([predicteurs[n] for n in noms])
    X_const = sm.add_constant(X)
    modele = sm.OLS(y, X_const).fit()
    residus = np.asarray(modele.resid)

    vif = None
    if len(noms) >= 2:
        vif = []
        for i, nom in enumerate(noms):
            v = variance_inflation_factor(X_const, i + 1)  # +1 : la constante occupe la position 0
            vif.append({"nom": nom, "vif": round(float(v), 2), "problematique": bool(v > 10)})

    try:
        stat_bp, p_bp, _, _ = het_breuschpagan(residus, X_const)
        heteroscedasticite = {
            "statistique": round(float(stat_bp), 3), "p_valeur": round(float(p_bp), 4),
            "homoscedastique": bool(p_bp >= 0.05),
            "interpretation": (
                "résidus homoscédastiques (p ≥ 0,05) — l'hypothèse d'homoscédasticité de l'OLS n'est pas rejetée"
                if p_bp >= 0.05 else
                "hétéroscédasticité détectée (p < 0,05) — les erreurs-types classiques peuvent être biaisées ; "
                "des erreurs-types robustes (HC3) seraient recommandées pour une interprétation plus prudente"
            ),
        }
    except Exception:  # noqa: BLE001
        heteroscedasticite = None

    try:
        stat_jb, p_jb, skew, kurtosis = jarque_bera(residus)
        normalite_residus = {
            "statistique": round(float(stat_jb), 3), "p_valeur": round(float(p_jb), 4),
            "normale": bool(p_jb >= 0.05), "asymetrie": round(float(skew), 3), "aplatissement": round(float(kurtosis), 3),
        }
    except Exception:  # noqa: BLE001
        normalite_residus = None

    elasticites = None
    if np.all(y > 0) and all(np.all(predicteurs[n] > 0) for n in noms):
        coefs = np.asarray(modele.params)
        moyenne_y = float(np.mean(y))
        if moyenne_y != 0:
            elasticites = []
            for i, nom in enumerate(noms):
                moyenne_x = float(np.mean(predicteurs[nom]))
                e = float(coefs[i + 1]) * (moyenne_x / moyenne_y)
                elasticites.append({"nom": nom, "elasticite": round(e, 3), "interpretation": _interpretation_elasticite(e)})

    return {**base, "vif": vif, "heteroscedasticite": heteroscedasticite,
            "normalite_residus": normalite_residus, "elasticites": elasticites}


def _interpretation_elasticite(e: float) -> str:
    ae = abs(e)
    qualificatif = "élastique" if ae > 1 else "unitaire" if ae == 1 else "inélastique"
    sens = "positive" if e > 0 else "négative" if e < 0 else "nulle"
    return (
        f"élasticité {sens} {qualificatif} — une hausse de 1% de cette variable est associée à une "
        f"variation d'environ {round(e, 2)}% de la variable dépendante, toutes choses égales par ailleurs"
    )


# ----------------------------------------------------------------- médiation (bootstrap)
def mediation_bootstrap(x: np.ndarray, m: np.ndarray, y: np.ndarray, n_bootstrap: int = 2000, seed: int = 42) -> dict:
    """Test de médiation par bootstrap (méthode de Preacher & Hayes) : l'effet
    indirect (a × b) est ré-estimé sur des milliers de rééchantillonnages, et sa
    significativité s'évalue par l'intervalle de confiance à 95% obtenu — la
    médiation est significative si cet intervalle exclut zéro. Cette méthode ne
    suppose pas la normalité de la distribution de l'effet indirect, contrairement
    aux approches plus anciennes (test de Sobel).

    Les trois variables sont standardisées (z-scores) avant tout calcul : sans
    cela, un indicateur à grande échelle brute (ex. un revenu en FCFA, courant
    en sciences économiques) combiné à une échelle Likert 1-5 produirait un
    effet indirect numériquement écrasé (arrondi à 0,000) alors que la relation
    est bien réelle — les coefficients standardisés restent interprétables
    quelle que soit l'unité d'origine de chaque variable."""
    n = len(x)
    x = (x - x.mean()) / x.std(ddof=1)
    m = (m - m.mean()) / m.std(ddof=1)
    y = (y - y.mean()) / y.std(ddof=1)
    rng = np.random.default_rng(seed)

    def _chemins(x_, m_, y_):
        a = float(np.polyfit(x_, m_, 1)[0])
        X_by = np.column_stack([m_, x_, np.ones(len(x_))])
        coefs, *_ = np.linalg.lstsq(X_by, y_, rcond=None)
        return a, float(coefs[0]), float(coefs[1])  # a, b, effet direct c'

    a_obs, b_obs, c_direct_obs = _chemins(x, m, y)
    effet_indirect_obs = a_obs * b_obs

    effets_boot = np.empty(n_bootstrap)
    for i in range(n_bootstrap):
        idx = rng.integers(0, n, n)
        a_b, b_b, _ = _chemins(x[idx], m[idx], y[idx])
        effets_boot[i] = a_b * b_b

    ic_bas, ic_haut = np.percentile(effets_boot, [2.5, 97.5])
    significatif = not (ic_bas <= 0 <= ic_haut)

    return {
        "n": n, "n_bootstrap": n_bootstrap,
        "effet_a_x_vers_m": round(a_obs, 3), "effet_b_m_vers_y": round(b_obs, 3),
        "effet_direct_c_prime": round(c_direct_obs, 3),
        "effet_indirect_a_x_b": round(effet_indirect_obs, 3),
        "ic95_bas": round(float(ic_bas), 3), "ic95_haut": round(float(ic_haut), 3),
        "mediation_significative": bool(significatif),
        "type_mediation": (
            "médiation totale" if significatif and sp_stats.pearsonr(x, y)[1] >= 0.05
            else "médiation partielle" if significatif
            else "pas de médiation détectée"
        ),
    }


# ----------------------------------------------------------------- orchestration
def analyses_avancees(lignes: list[dict], questionnaire: dict, variables: list[dict], branche: str = "sciences_humaines") -> dict:
    """Orchestre AFE, AFC, régressions et médiations à partir des types de
    variables déclarés dans la méthodologie (indépendante/médiatrice/dépendante),
    sans que l'utilisateur n'ait rien à configurer manuellement. En branche
    sciences économiques, les régressions sont enrichies des diagnostics
    économétriques standards (VIF, hétéroscédasticité, normalité des résidus,
    élasticités) — propres à ce type d'analyse, jamais rapportés autrement."""
    # Deux ensembles distincts : les scores (régression/médiation) acceptent les
    # variables à item numérique unique (revenu, prix...), courantes en sciences
    # économiques ; l'AFE/AFC, elles, n'ont de sens que sur des échelles à
    # plusieurs items Likert mesurant le même construit — jamais sur un indicateur
    # numérique isolé, qui n'a pas de structure factorielle à valider.
    items_par_variable_tous: dict[str, list[str]] = {}
    items_par_variable_likert: dict[str, list[str]] = {}
    for section in questionnaire.get("sections", []):
        variable = section.get("variable_associee")
        if not variable:
            continue
        items_likert = [it["code"] for it in section.get("items", []) if it.get("type") == "echelle_likert"]
        items_scorables = [it["code"] for it in section.get("items", []) if it.get("type") in ("echelle_likert", "numerique")]
        if items_scorables:
            items_par_variable_tous[variable] = items_scorables
        if len(items_likert) >= 2:
            items_par_variable_likert[variable] = items_likert

    if not items_par_variable_tous:
        return {"afe": None, "afc": None, "regressions": [], "mediations": []}

    scores: dict[str, np.ndarray] = {}
    for variable, codes in items_par_variable_tous.items():
        lignes_completes = [
            [float(l[c]) for c in codes]
            for l in lignes if all(c in l and l[c] not in (None, "") for c in codes)
        ]
        if len(lignes_completes) >= 10:
            scores[variable] = np.array(lignes_completes).mean(axis=1)

    tous_codes = [c for codes in items_par_variable_likert.values() for c in codes]
    lignes_afe = [
        [float(l[c]) for c in tous_codes]
        for l in lignes if all(c in l and l[c] not in (None, "") for c in tous_codes)
    ] if tous_codes else []
    afe = afe_diagnostics(np.array(lignes_afe), tous_codes) if len(lignes_afe) >= 10 else None

    donnees_dict = {c: np.array([float(l[c]) for l in lignes if c in l and l[c] not in (None, "")]) for c in tous_codes}
    try:
        afc = afc_ajustement(donnees_dict, items_par_variable_likert) if len(items_par_variable_likert) >= 2 else None
    except Exception as ex:  # noqa: BLE001
        afc = {"erreur": f"L'AFC n'a pas pu être calculée : {ex}"}

    types_par_nom = {v["nom"]: v.get("type") for v in variables}
    dependantes = [n for n, t in types_par_nom.items() if t == "dépendante" and n in scores]
    predicteurs_possibles = [n for n, t in types_par_nom.items() if t in ("indépendante", "médiatrice") and n in scores]

    regressions = []
    for dv in dependantes:
        preds = {n: scores[n] for n in predicteurs_possibles if n != dv}
        if len(preds) >= 1:
            try:
                if branche == "sciences_economiques":
                    resultat_reg = regression_econometrique(scores[dv], preds)
                else:
                    resultat_reg = regression_multiple(scores[dv], preds)
                regressions.append({"dependante": dv, **resultat_reg})
            except Exception as ex:  # noqa: BLE001
                regressions.append({"dependante": dv, "erreur": str(ex)})

    independantes = [n for n, t in types_par_nom.items() if t == "indépendante" and n in scores]
    mediatrices = [n for n, t in types_par_nom.items() if t == "médiatrice" and n in scores]

    mediations = []
    for iv in independantes:
        for med in mediatrices:
            for dv in dependantes:
                if iv == med or med == dv or iv == dv:
                    continue
                try:
                    resultat = mediation_bootstrap(scores[iv], scores[med], scores[dv])
                    mediations.append({"independante": iv, "mediatrice": med, "dependante": dv, **resultat})
                except Exception as ex:  # noqa: BLE001
                    mediations.append({"independante": iv, "mediatrice": med, "dependante": dv, "erreur": str(ex)})

    return {"afe": afe, "afc": afc, "regressions": regressions, "mediations": mediations}


# ----------------------------------------------------------------- passerelle qual-quant
def comparaison_groupes(groupe_a: np.ndarray, groupe_b: np.ndarray, nom_a: str = "Groupe A", nom_b: str = "Groupe B") -> dict | None:
    """Compare deux groupes indépendants sur une variable quantitative continue —
    la passerelle qualitatif-quantitatif : teste si les répondants exprimant un
    thème qualitatif donné (groupe A) diffèrent significativement des autres
    (groupe B) sur un construit quantitatif. Test t de Student si les deux
    groupes suivent une distribution normale, test de Mann-Whitney sinon (non
    paramétrique) — même logique que le choix Pearson/Spearman déjà en place
    pour les corrélations."""
    if len(groupe_a) < 3 or len(groupe_b) < 3:
        return None

    _, _, normale_a = test_normalite(groupe_a)
    _, _, normale_b = test_normalite(groupe_b)
    deux_normales = bool(normale_a) and bool(normale_b)

    moyenne_a, moyenne_b = float(np.mean(groupe_a)), float(np.mean(groupe_b))
    ecart_type_commun = float(np.sqrt(((len(groupe_a) - 1) * np.var(groupe_a, ddof=1) + (len(groupe_b) - 1) * np.var(groupe_b, ddof=1)) / (len(groupe_a) + len(groupe_b) - 2)))
    cohen_d = (moyenne_a - moyenne_b) / ecart_type_commun if ecart_type_commun > 0 else None

    if deux_normales:
        stat, p = sp_stats.ttest_ind(groupe_a, groupe_b, equal_var=False)
        methode = "test t de Student (Welch)"
    else:
        stat, p = sp_stats.mannwhitneyu(groupe_a, groupe_b, alternative="two-sided")
        methode = "test de Mann-Whitney"

    return {
        "n_groupe_a": len(groupe_a), "n_groupe_b": len(groupe_b),
        "nom_groupe_a": nom_a, "nom_groupe_b": nom_b,
        "moyenne_groupe_a": round(moyenne_a, 3), "moyenne_groupe_b": round(moyenne_b, 3),
        "methode": methode, "statistique": round(float(stat), 3), "p_valeur": round(float(p), 4),
        "significatif": bool(p < 0.05),
        "taille_effet_cohen_d": round(cohen_d, 3) if cohen_d is not None else None,
        "interpretation": _interpretation_comparaison(p, cohen_d, nom_a, nom_b, moyenne_a, moyenne_b),
    }


def _interpretation_comparaison(p, d, nom_a, nom_b, moyenne_a, moyenne_b) -> str:
    if p >= 0.05:
        return "aucune différence significative entre les deux groupes (p ≥ 0,05)"
    sens = nom_a if moyenne_a > moyenne_b else nom_b
    if d is None:
        force = ""
    else:
        ad = abs(d)
        force = "faible" if ad < 0.5 else "modérée" if ad < 0.8 else "forte"
        force = f", taille d'effet {force} (d de Cohen = {round(d, 2)})"
    return f"différence significative (p < 0,05) — « {sens} » présente le score le plus élevé{force}"


def passerelle_qual_quant(lignes: list[dict], themes_avec_attributions: list[dict], scores_composites: dict[str, np.ndarray], index_lignes_valides: list[int]) -> list[dict]:
    """Pour chaque thème qualitatif identifié dans les réponses libres, compare
    statistiquement les répondants qui l'expriment aux autres, sur chaque
    variable quantitative du modèle — la passerelle qualitatif-quantitatif :
    « les répondants qui évoquent tel thème diffèrent-ils significativement sur
    telle variable ? », pas seulement deux analyses côte à côte sans lien."""
    resultats = []
    for theme in themes_avec_attributions:
        code_theme = theme["code"]
        indices_avec_theme = {
            a["index_ligne"] for a in theme.get("attributions", []) if code_theme in a.get("themes", [])
        }
        for variable, scores in scores_composites.items():
            # index_lignes_valides fait correspondre chaque position dans `scores`
            # (qui a pu exclure des lignes incomplètes) à l'index de ligne d'origine.
            groupe_a, groupe_b = [], []
            for pos, idx_ligne in enumerate(index_lignes_valides):
                if idx_ligne in indices_avec_theme:
                    groupe_a.append(scores[pos])
                else:
                    groupe_b.append(scores[pos])
            if len(groupe_a) < 3 or len(groupe_b) < 3:
                continue
            comparaison = comparaison_groupes(
                np.array(groupe_a), np.array(groupe_b),
                f"Évoque « {theme['libelle']} »", f"N'évoque pas « {theme['libelle']} »",
            )
            if comparaison:
                resultats.append({"theme": theme["libelle"], "theme_code": code_theme, "variable": variable, **comparaison})
    return resultats
