"""
Génération des graphiques du rapport d'analyse quantitative — rendus en PNG
(matplotlib) pour être insérés dans le document Word. Styles sobres et
professionnels, cohérents avec l'identité visuelle de l'app (marine/or).
"""

import io

import matplotlib
matplotlib.use("Agg")  # jamais d'interface graphique sur un serveur
import matplotlib.pyplot as plt
import numpy as np

MARINE = "#0E1226"
OR = "#E4B04A"
VERT = "#5FC6A8"
ROUGE = "#D96D5F"
GRIS = "#8A8574"

plt.rcParams.update({
    "font.size": 10, "axes.edgecolor": "#444444", "axes.labelcolor": "#222222",
    "text.color": "#222222", "xtick.color": "#222222", "ytick.color": "#222222",
    "figure.facecolor": "white", "axes.facecolor": "white",
})


def _fig_vers_png(fig) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def graphique_fiabilite(fiabilite: list[dict]) -> bytes | None:
    """Barres horizontales de l'alpha de Cronbach par construit, avec le seuil
    de référence à 0,70 (usage courant en sciences sociales)."""
    if not fiabilite:
        return None
    variables = [f["variable"] for f in fiabilite]
    alphas = [f["alpha_cronbach"] or 0 for f in fiabilite]
    couleurs = [VERT if a >= 0.7 else (OR if a >= 0.6 else ROUGE) for a in alphas]

    fig, ax = plt.subplots(figsize=(7.5, 0.55 * len(variables) + 1))
    y = np.arange(len(variables))
    ax.barh(y, alphas, color=couleurs, height=0.55)
    ax.axvline(0.70, color=GRIS, linestyle="--", linewidth=1, label="Seuil usuel (0,70)")
    ax.set_yticks(y)
    ax.set_yticklabels(variables)
    ax.invert_yaxis()
    ax.set_xlim(0, 1)
    ax.set_xlabel("Alpha de Cronbach")
    ax.set_title("Fiabilité des construits", fontsize=12, fontweight="bold", loc="left")
    for i, a in enumerate(alphas):
        ax.text(a + 0.015, i, f"{a:.2f}", va="center", fontsize=9)
    ax.legend(loc="lower right", fontsize=8, frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    return _fig_vers_png(fig)


def graphique_moyennes(fiabilite: list[dict]) -> bytes | None:
    """Barres verticales des moyennes composites par construit, avec barre
    d'erreur (écart-type)."""
    if not fiabilite:
        return None
    variables = [f["variable"] for f in fiabilite]
    moyennes = [f["moyenne_composite"] for f in fiabilite]
    ecarts = [f["ecart_type_composite"] or 0 for f in fiabilite]

    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    x = np.arange(len(variables))
    ax.bar(x, moyennes, yerr=ecarts, capsize=4, color=MARINE, alpha=0.85, width=0.55)
    ax.set_xticks(x)
    ax.set_xticklabels(variables, rotation=25, ha="right", fontsize=8.5)
    ax.set_ylim(0, 5.5)
    ax.set_ylabel("Score moyen (échelle 1-5)")
    ax.set_title("Scores moyens par construit (± écart-type)", fontsize=12, fontweight="bold", loc="left")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    return _fig_vers_png(fig)


def graphique_matrice_correlations(fiabilite: list[dict], correlations: list[dict]) -> bytes | None:
    """Matrice de corrélations entre construits, sous forme de carte de chaleur —
    lecture visuelle immédiate des relations les plus fortes."""
    variables = [f["variable"] for f in fiabilite]
    n = len(variables)
    if n < 2:
        return None
    matrice = np.eye(n)
    index = {v: i for i, v in enumerate(variables)}
    for c in correlations:
        i, j = index.get(c["variable_1"]), index.get(c["variable_2"])
        if i is None or j is None:
            continue
        matrice[i, j] = matrice[j, i] = c["r"]

    fig, ax = plt.subplots(figsize=(1.1 * n + 2, 1.1 * n + 1))
    im = ax.imshow(matrice, cmap="RdYlGn", vmin=-1, vmax=1)
    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels(variables, rotation=35, ha="right", fontsize=8.5)
    ax.set_yticklabels(variables, fontsize=8.5)
    for i in range(n):
        for j in range(n):
            couleur_texte = "white" if abs(matrice[i, j]) > 0.6 else "#222222"
            ax.text(j, i, f"{matrice[i, j]:.2f}", ha="center", va="center", fontsize=8.5, color=couleur_texte)
    ax.set_title("Matrice de corrélations entre construits", fontsize=12, fontweight="bold", loc="left", pad=14)
    fig.colorbar(im, ax=ax, shrink=0.8, label="Coefficient r")
    fig.tight_layout()
    return _fig_vers_png(fig)
