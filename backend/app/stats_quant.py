"""
Moteur d'analyse statistique pour les données quantitatives importées par
l'utilisateur (remplies à partir du gabarit Excel généré pour son étude).

Statistiques calculées, avec une rigueur vérifiable à chaque étape :
- Descriptives par item : n, moyenne, IC 95% de la moyenne, médiane, écart-type,
  min, max, asymétrie (skewness) et aplatissement (kurtosis d'excès).
- Tableaux de fréquences pour les items catégoriels.
- Fiabilité par construit : alpha de Cronbach global, corrélation item-total
  corrigée et alpha si l'item est supprimé (diagnostic classique de nettoyage
  d'échelle), et test de normalité du score composite (Shapiro-Wilk).
- Corrélations entre scores composites de construits : Pearson si les deux
  distributions ne s'écartent pas significativement de la normalité, Spearman
  sinon (bascule automatique et signalée) — toujours avec p-valeur réelle.
"""

import numpy as np
from scipy import stats as sp_stats


def cronbach_alpha(matrice: np.ndarray) -> float:
    """Alpha de Cronbach classique : alpha = k/(k-1) * (1 - somme(var_item) / var(somme)).
    matrice : lignes = répondants, colonnes = items d'un même construit."""
    k = matrice.shape[1]
    if k < 2:
        return None
    variances_items = matrice.var(axis=0, ddof=1)
    variance_totale = matrice.sum(axis=1).var(ddof=1)
    if variance_totale == 0:
        return None
    return float(k / (k - 1) * (1 - variances_items.sum() / variance_totale))


def correlation_item_total_corrigee(matrice: np.ndarray) -> list:
    """Pour chaque item, corrélation entre l'item et la somme des AUTRES items du
    même construit — diagnostic classique pour repérer un item qui dégrade la
    cohérence de l'échelle (valeur attendue ≥ 0,30 environ)."""
    k = matrice.shape[1]
    resultats = []
    for i in range(k):
        item = matrice[:, i]
        reste = matrice[:, [j for j in range(k) if j != i]].sum(axis=1)
        if item.std(ddof=1) == 0 or reste.std(ddof=1) == 0:
            resultats.append(None)
            continue
        r, _ = sp_stats.pearsonr(item, reste)
        resultats.append(float(r))
    return resultats


def alpha_si_item_supprime(matrice: np.ndarray) -> list:
    """Pour chaque item, l'alpha de Cronbach recalculé sans cet item — permet de
    voir si retirer un item précis améliorerait la fiabilité globale."""
    k = matrice.shape[1]
    resultats = []
    for i in range(k):
        sous_matrice = matrice[:, [j for j in range(k) if j != i]]
        resultats.append(cronbach_alpha(sous_matrice))
    return resultats


def intervalle_confiance_moyenne(arr: np.ndarray, niveau: float = 0.95):
    n = len(arr)
    if n < 2:
        return None, None
    moyenne = arr.mean()
    erreur_std = sp_stats.sem(arr)
    if erreur_std == 0:
        return float(moyenne), float(moyenne)
    marge = erreur_std * sp_stats.t.ppf((1 + niveau) / 2, df=n - 1)
    return float(moyenne - marge), float(moyenne + marge)


def test_normalite(arr: np.ndarray):
    """Test de Shapiro-Wilk. Retourne (statistique, p_valeur, est_normale) —
    p ≥ 0,05 : on ne rejette pas l'hypothèse de normalité."""
    n = len(arr)
    if n < 3 or np.std(arr) == 0:
        return None, None, None
    stat, p = sp_stats.shapiro(arr)
    return float(stat), float(p), bool(p >= 0.05)


def interpretation_alpha(alpha: float) -> str:
    if alpha is None:
        return "non calculable"
    if alpha < 0.5:
        return "fiabilité inacceptable"
    if alpha < 0.6:
        return "fiabilité faible"
    if alpha < 0.7:
        return "fiabilité discutable"
    if alpha < 0.8:
        return "fiabilité acceptable"
    if alpha < 0.9:
        return "fiabilité bonne"
    return "fiabilité excellente"


def interpretation_correlation(r: float, p: float) -> str:
    if p >= 0.05:
        return "non significative (p ≥ 0,05)"
    force = "faible" if abs(r) < 0.3 else "modérée" if abs(r) < 0.5 else "forte"
    sens = "positive" if r > 0 else "négative"
    return f"corrélation {sens} {force}, significative (p < 0,05)"


def analyser_donnees(lignes: list[dict], questionnaire: dict) -> dict:
    """lignes : liste de dicts {code_item: valeur} — une entrée par répondant.
    questionnaire : structure générée par l'IA (sections > items, avec
    variable_associee pour les items d'échelle appartenant à un même construit)."""

    items_par_variable: dict[str, list[str]] = {}
    tous_items: dict[str, dict] = {}
    for section in questionnaire.get("sections", []):
        variable = section.get("variable_associee")
        for item in section.get("items", []):
            code = item["code"]
            tous_items[code] = item
            # Les items numériques (revenu, prix, quantité...) sont des indicateurs
            # économiques légitimes à part entière, pas seulement les échelles de
            # Likert — sans ce second type, une variable économique à item unique
            # ne serait jamais incluse dans les corrélations/régressions.
            if variable and item.get("type") in ("echelle_likert", "numerique"):
                items_par_variable.setdefault(variable, []).append(code)

    n_repondants = len(lignes)

    # --- Statistiques descriptives enrichies (items numériques) ---
    descriptives = []
    for code, item in tous_items.items():
        if item.get("type") not in ("echelle_likert", "numerique"):
            continue
        valeurs = [l[code] for l in lignes if code in l and l[code] not in (None, "")]
        valeurs_num = [float(v) for v in valeurs if _est_nombre(v)]
        if not valeurs_num:
            continue
        arr = np.array(valeurs_num)
        ic_bas, ic_haut = intervalle_confiance_moyenne(arr)
        descriptives.append({
            "code": code, "libelle": item.get("libelle", code), "n": len(arr),
            "moyenne": round(float(arr.mean()), 2),
            "ic95_bas": round(ic_bas, 2) if ic_bas is not None else None,
            "ic95_haut": round(ic_haut, 2) if ic_haut is not None else None,
            "mediane": float(np.median(arr)),
            "ecart_type": round(float(arr.std(ddof=1)), 2) if len(arr) > 1 else None,
            "asymetrie": round(float(sp_stats.skew(arr, bias=False)), 2) if len(arr) > 2 else None,
            "aplatissement": round(float(sp_stats.kurtosis(arr, bias=False)), 2) if len(arr) > 3 else None,
            "min": float(arr.min()), "max": float(arr.max()),
        })

    # --- Tableaux de fréquences (items catégoriels) ---
    frequences = []
    for code, item in tous_items.items():
        if item.get("type") not in ("choix_unique", "choix_multiple"):
            continue
        valeurs = [str(l[code]) for l in lignes if code in l and l[code] not in (None, "")]
        if not valeurs:
            continue
        total = len(valeurs)
        modalites = {}
        for v in valeurs:
            modalites[v] = modalites.get(v, 0) + 1
        frequences.append({
            "code": code, "libelle": item.get("libelle", code),
            "modalites": [
                {"valeur": v, "effectif": eff, "pourcentage": round(eff / total * 100, 1)}
                for v, eff in sorted(modalites.items(), key=lambda x: -x[1])
            ],
        })

    # --- Fiabilité (alpha de Cronbach + diagnostics détaillés) par construit ---
    fiabilite = []
    scores_composites: dict[str, np.ndarray] = {}
    normalite_composites: dict[str, dict] = {}
    for variable, codes in items_par_variable.items():
        lignes_completes = [
            [float(l[c]) for c in codes]
            for l in lignes
            if all(c in l and l[c] not in (None, "") and _est_nombre(l[c]) for c in codes)
        ]
        if len(lignes_completes) < 3:
            continue
        matrice = np.array(lignes_completes)
        score_composite = matrice.mean(axis=1)
        stat_sw, p_sw, est_normale = test_normalite(score_composite)

        if len(codes) >= 2:
            alpha = cronbach_alpha(matrice)
            item_total = correlation_item_total_corrigee(matrice)
            alpha_supprime = alpha_si_item_supprime(matrice)
            fiabilite.append({
                "variable": variable, "nb_items": len(codes), "n": len(lignes_completes),
                "alpha_cronbach": round(alpha, 3) if alpha is not None else None,
                "interpretation": interpretation_alpha(alpha),
                "moyenne_composite": round(float(score_composite.mean()), 2),
                "ecart_type_composite": round(float(score_composite.std(ddof=1)), 2) if len(score_composite) > 1 else None,
                "detail_items": [
                    {
                        "code": codes[i],
                        "correlation_item_total": round(item_total[i], 3) if item_total[i] is not None else None,
                        "alpha_si_supprime": round(alpha_supprime[i], 3) if alpha_supprime[i] is not None else None,
                    }
                    for i in range(len(codes))
                ],
                "normalite_score": {
                    "statistique_shapiro": round(stat_sw, 3) if stat_sw is not None else None,
                    "p_valeur": round(p_sw, 4) if p_sw is not None else None,
                    "distribution_normale": est_normale,
                },
            })
        else:
            # Indicateur à item unique (typique des variables économiques
            # numériques : revenu, prix, quantité...) — aucun alpha de Cronbach
            # calculable avec un seul item, mais la variable reste pleinement
            # exploitable pour les corrélations, régressions et médiations.
            fiabilite.append({
                "variable": variable, "nb_items": 1, "n": len(lignes_completes),
                "alpha_cronbach": None,
                "interpretation": "non applicable (indicateur à item unique)",
                "moyenne_composite": round(float(score_composite.mean()), 2),
                "ecart_type_composite": round(float(score_composite.std(ddof=1)), 2) if len(score_composite) > 1 else None,
                "detail_items": [],
                "normalite_score": {
                    "statistique_shapiro": round(stat_sw, 3) if stat_sw is not None else None,
                    "p_valeur": round(p_sw, 4) if p_sw is not None else None,
                    "distribution_normale": est_normale,
                },
            })

        scores_composites[variable] = score_composite
        normalite_composites[variable] = est_normale

    # --- Corrélations entre scores composites : Pearson ou Spearman selon la normalité ---
    correlations = []
    variables = list(scores_composites.keys())
    for i in range(len(variables)):
        for j in range(i + 1, len(variables)):
            v1, v2 = variables[i], variables[j]
            s1, s2 = scores_composites[v1], scores_composites[v2]
            n = min(len(s1), len(s2))
            if n < 4:
                continue
            deux_normales = normalite_composites.get(v1) and normalite_composites.get(v2)
            if deux_normales:
                r, p = sp_stats.pearsonr(s1[:n], s2[:n])
                methode = "Pearson"
            else:
                r, p = sp_stats.spearmanr(s1[:n], s2[:n])
                methode = "Spearman"
            correlations.append({
                "variable_1": v1, "variable_2": v2, "n": n, "methode": methode,
                "r": round(float(r), 3), "p_valeur": round(float(p), 4),
                "interpretation": interpretation_correlation(r, p),
            })

    return {
        "n_repondants": n_repondants,
        "descriptives": descriptives,
        "frequences": frequences,
        "fiabilite": fiabilite,
        "correlations": correlations,
    }


def _est_nombre(v) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False
