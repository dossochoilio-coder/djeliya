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
from factor_analyzer import FactorAnalyzer
from factor_analyzer.factor_analyzer import calculate_kmo, calculate_bartlett_sphericity


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


# ----------------------------------------------------------------- médiation (bootstrap)
def mediation_bootstrap(x: np.ndarray, m: np.ndarray, y: np.ndarray, n_bootstrap: int = 2000, seed: int = 42) -> dict:
    """Test de médiation par bootstrap (méthode de Preacher & Hayes) : l'effet
    indirect (a × b) est ré-estimé sur des milliers de rééchantillonnages, et sa
    significativité s'évalue par l'intervalle de confiance à 95% obtenu — la
    médiation est significative si cet intervalle exclut zéro. Cette méthode ne
    suppose pas la normalité de la distribution de l'effet indirect, contrairement
    aux approches plus anciennes (test de Sobel)."""
    n = len(x)
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
def analyses_avancees(lignes: list[dict], questionnaire: dict, variables: list[dict]) -> dict:
    """Orchestre AFE, AFC, régressions et médiations à partir des types de
    variables déclarés dans la méthodologie (indépendante/médiatrice/dépendante),
    sans que l'utilisateur n'ait rien à configurer manuellement."""
    items_par_variable: dict[str, list[str]] = {}
    for section in questionnaire.get("sections", []):
        variable = section.get("variable_associee")
        if variable:
            items_par_variable[variable] = [
                it["code"] for it in section.get("items", []) if it.get("type") == "echelle_likert"
            ]
    items_par_variable = {k: v for k, v in items_par_variable.items() if len(v) >= 2}
    if not items_par_variable:
        return {"afe": None, "afc": None, "regressions": [], "mediations": []}

    scores: dict[str, np.ndarray] = {}
    for variable, codes in items_par_variable.items():
        lignes_completes = [
            [float(l[c]) for c in codes]
            for l in lignes if all(c in l and l[c] not in (None, "") for c in codes)
        ]
        if len(lignes_completes) >= 10:
            scores[variable] = np.array(lignes_completes).mean(axis=1)

    tous_codes = [c for codes in items_par_variable.values() for c in codes]
    lignes_afe = [
        [float(l[c]) for c in tous_codes]
        for l in lignes if all(c in l and l[c] not in (None, "") for c in tous_codes)
    ]
    afe = afe_diagnostics(np.array(lignes_afe), tous_codes) if len(lignes_afe) >= 10 else None

    donnees_dict = {c: np.array([float(l[c]) for l in lignes if c in l and l[c] not in (None, "")]) for c in tous_codes}
    try:
        afc = afc_ajustement(donnees_dict, items_par_variable) if len(items_par_variable) >= 2 else None
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
                regressions.append({"dependante": dv, **regression_multiple(scores[dv], preds)})
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
