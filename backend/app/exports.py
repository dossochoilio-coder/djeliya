"""
Génération des exports Word (.docx) et Excel (.xlsx) de Djeliya.

Deux niveaux :
- Entretien seul : transcription + son analyse.
- Étude (corpus entier) : rapport de recherche complet — page de garde,
  sommaire, démarche méthodologique référencée (APA), structure des
  résultats numérotée, fiabilité inter-codeurs, annexes (liste des
  entretiens et transcriptions intégrales).

Bilingue (fr/en) : la langue du rapport suit la langue dans laquelle
l'analyse IA a été générée (entretien/corpus "analyse_langue"), pour que
les libellés fixes du document restent cohérents avec le contenu généré.
Les verbatims eux-mêmes ne sont jamais traduits (voir main.py).
"""

import io
from datetime import datetime

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

OR_HEX = "E4B04A"

REFERENCES_APA = {
    "gioia": (
        "Gioia, D. A., Corley, K. G., & Hamilton, A. L. (2013). Seeking qualitative "
        "rigor in inductive research: Notes on the Gioia methodology. Organizational "
        "Research Methods, 16(1), 15-31."
    ),
    "thematique": (
        "Braun, V., & Clarke, V. (2006). Using thematic analysis in psychology. "
        "Qualitative Research in Psychology, 3(2), 77-101.\n"
        "Braun, V., & Clarke, V. (2019). Reflecting on reflexive thematic analysis. "
        "Qualitative Research in Sport, Exercise and Health, 11(4), 589-597."
    ),
    "contenu": "Bardin, L. (2013). L'analyse de contenu (2e éd.). Paris : Presses Universitaires de France.",
}

METHODE_LABEL = {
    "fr": {
        "gioia": "Méthode de structuration des données de Gioia et al. (2013)",
        "thematique": "Analyse thématique réflexive de Braun & Clarke (2006, 2019)",
        "contenu": "Analyse de contenu catégorielle de Bardin (2013)",
    },
    "en": {
        "gioia": "Gioia et al. (2013) data structuring method",
        "thematique": "Braun & Clarke (2006, 2019) reflexive thematic analysis",
        "contenu": "Bardin (2013) categorical content analysis",
    },
}

# ----------------------------------------------------------------- libellés bilingues
L = {
    "fr": {
        "sous_titre_entretien": "Transcription et analyse qualitative",
        "langue_detectee": "Langue détectée : ",
        "genere_le": "Document généré par Djeliya le ",
        "sommaire_repli": "Sommaire — clic droit puis « Mettre à jour les champs » pour l'afficher.",
        "page": "Page ", "sur": " / ",
        "transcription": "1. Transcription",
        "analyse_qualitative": "2. Analyse qualitative",
        "methode": "Méthode : ", "modele": "Modèle : ",
        "demarche_methodologique": "Démarche méthodologique",
        "structure_resultats": "Structure des résultats",
        "synthese_interpretative": "Synthèse interprétative",
        "limites_analyse": "Limites de l'analyse automatique",
        "reference": "Référence", "references": "Références",
        "rapport_titre": "RAPPORT D'ANALYSE QUALITATIVE",
        "etude": "Étude",
        "entretiens_mot": "entretien(s)", "materiau_audio": " de matériau audio",
        "langues_parentheses": "Langue(s) : ",
        "presentation_etude": "1. Présentation de l'étude",
        "etude_intro": "Cette étude qualitative repose sur un corpus de {n} entretien(s), totalisant {duree} de matériau audio transcrit.",
        "question_recherche": "Question de recherche / angle d'analyse : ",
        "entretien_col": "Entretien", "langue_col": "Langue", "duree_col": "Durée", "date_col": "Date",
        "demarche_titre2": "2. Démarche méthodologique",
        "aucune_analyse_corpus": "Aucune analyse transversale n'a encore été lancée sur ce corpus.",
        "structure_resultats3": "3. Structure des résultats",
        "synthese4": "4. Synthèse interprétative",
        "limites5": "5. Limites méthodologiques",
        "fiabilite6": "6. Fiabilité inter-codeurs",
        "fiabilite_intro": "Le kappa de Cohen mesure l'accord entre codeurs indépendants au-delà de ce que le hasard produirait seul (0 = accord aléatoire, 1 = accord parfait).",
        "codeurs_col": "Codeurs", "kappa_moyen_col": "Kappa moyen", "interpretation_col": "Interprétation",
        "rigueur7": "7. Indicateurs de rigueur qualitative",
        "convergence71": "7.1. Convergence entre entretiens",
        "convergence_intro": "Un thème retrouvé dans plusieurs entretiens distincts est plus robuste qu'un thème isolé à un seul cas — c'est le principe de triangulation en recherche qualitative.",
        "theme_col": "Thème", "entretiens_concernes_col": "Entretiens concernés", "pct_corpus_col": "% du corpus",
        "saturation72": "7.2. Saturation théorique",
        "saturation_intro": "Nombre de concepts nouveaux apportés par chaque entretien, dans l'ordre chronologique. Une courbe qui s'aplatit vers la fin du corpus suggère que des entretiens supplémentaires n'apporteraient plus beaucoup d'éléments inédits.",
        "concepts_nouveaux_col": "Concepts nouveaux", "cumul_col": "Cumul",
        "annexe_a": "Annexe A — Composition du corpus",
        "annexe_b": "Annexe B — Transcriptions intégrales",
        "titre_col": "Titre",
        "locuteur_prefixe": "Locuteur ",
        # Excel
        "feuille_transcription": "Transcription", "feuille_statistiques": "Statistiques",
        "feuille_analyse": "Analyse", "feuille_vue_ensemble": "Vue d'ensemble",
        "feuille_entretiens": "Entretiens", "feuille_transcriptions": "Transcriptions",
        "feuille_analyse_transversale": "Analyse transversale", "feuille_codebook": "Codebook",
        "feuille_stats_qual": "Statistiques qualitatives", "feuille_fiabilite": "Fiabilité inter-codeurs",
        "debut": "Début", "fin": "Fin", "locuteur": "Locuteur", "texte": "Texte",
        "confiance_moy": "Confiance moyenne (%)", "confiance_pct": "Fiabilité (%)",
        "indicateur": "Indicateur", "valeur": "Valeur",
        "titre_stat": "Titre", "langue_detectee_stat": "Langue détectée", "duree_totale": "Durée totale",
        "nb_segments": "Nombre de segments", "nb_mots": "Nombre de mots transcrits",
        "fiabilite_moy": "Fiabilité moyenne (%)", "temps_parole": "Temps de parole par locuteur",
        "niveau": "Niveau", "libelle": "Libellé", "detail_verbatim": "Détail / verbatim",
        "horodatage": "Horodatage", "premier_ordre": "Premier ordre", "second_ordre": "Second ordre",
        "dimension_agregee": "Dimension agrégée", "dimension": "Dimension", "theme": "Thème",
        "concept": "Concept", "frequence": "Fréquence (verbatims)",
        "freq_dimension": "Fréquence par dimension", "themes_pl": "Thèmes", "concepts_pl": "Concepts",
        "verbatims_pl": "Verbatims", "convergence_titre": "Convergence entre entretiens (triangulation)",
        "saturation_titre": "Saturation théorique (ordre chronologique)",
        "concepts_distincts": "Cumul de concepts distincts",
        "etude_corpus": "Étude / corpus", "methodologie": "Méthodologie",
        "question_recherche_stat": "Question de recherche", "nb_entretiens": "Nombre d'entretiens",
        "duree_cumulee": "Durée cumulée", "nb_mots_total": "Nombre total de mots transcrits",
        "fiabilite_moy_corpus": "Fiabilité moyenne du corpus (%)", "rapport_genere_le": "Rapport généré le",
        "segments": "Segments", "mots": "Mots", "date": "Date",
    },
    "en": {
        "sous_titre_entretien": "Transcript and qualitative analysis",
        "langue_detectee": "Detected language: ",
        "genere_le": "Document generated by Djeliya on ",
        "sommaire_repli": "Table of contents — right-click then “Update Field” to display it.",
        "page": "Page ", "sur": " of ",
        "transcription": "1. Transcript",
        "analyse_qualitative": "2. Qualitative analysis",
        "methode": "Method: ", "modele": "Model: ",
        "demarche_methodologique": "Methodological approach",
        "structure_resultats": "Findings structure",
        "synthese_interpretative": "Interpretive summary",
        "limites_analyse": "Limits of the automated analysis",
        "reference": "Reference", "references": "References",
        "rapport_titre": "QUALITATIVE ANALYSIS REPORT",
        "etude": "Study",
        "entretiens_mot": "interview(s)", "materiau_audio": " of audio material",
        "langues_parentheses": "Language(s): ",
        "presentation_etude": "1. Study overview",
        "etude_intro": "This qualitative study is based on a corpus of {n} interview(s), totalling {duree} of transcribed audio material.",
        "question_recherche": "Research question / analysis angle: ",
        "entretien_col": "Interview", "langue_col": "Language", "duree_col": "Duration", "date_col": "Date",
        "demarche_titre2": "2. Methodological approach",
        "aucune_analyse_corpus": "No cross-case analysis has been run on this corpus yet.",
        "structure_resultats3": "3. Findings structure",
        "synthese4": "4. Interpretive summary",
        "limites5": "5. Methodological limitations",
        "fiabilite6": "6. Inter-rater reliability",
        "fiabilite_intro": "Cohen's kappa measures agreement between independent coders beyond what chance alone would produce (0 = random agreement, 1 = perfect agreement).",
        "codeurs_col": "Coders", "kappa_moyen_col": "Average kappa", "interpretation_col": "Interpretation",
        "rigueur7": "7. Qualitative rigor indicators",
        "convergence71": "7.1. Convergence across interviews",
        "convergence_intro": "A theme found across several distinct interviews is more robust than one isolated to a single case — this is the triangulation principle in qualitative research.",
        "theme_col": "Theme", "entretiens_concernes_col": "Interviews involved", "pct_corpus_col": "% of corpus",
        "saturation72": "7.2. Theoretical saturation",
        "saturation_intro": "Number of new concepts introduced by each interview, in chronological order. A curve flattening toward the end of the corpus suggests additional interviews would add little new material.",
        "concepts_nouveaux_col": "New concepts", "cumul_col": "Cumulative",
        "annexe_a": "Appendix A — Corpus composition",
        "annexe_b": "Appendix B — Full transcripts",
        "titre_col": "Title",
        "locuteur_prefixe": "Speaker ",
        # Excel
        "feuille_transcription": "Transcript", "feuille_statistiques": "Statistics",
        "feuille_analyse": "Analysis", "feuille_vue_ensemble": "Overview",
        "feuille_entretiens": "Interviews", "feuille_transcriptions": "Transcripts",
        "feuille_analyse_transversale": "Cross-case analysis", "feuille_codebook": "Codebook",
        "feuille_stats_qual": "Qualitative statistics", "feuille_fiabilite": "Inter-rater reliability",
        "debut": "Start", "fin": "End", "locuteur": "Speaker", "texte": "Text",
        "confiance_moy": "Average confidence (%)", "confiance_pct": "Reliability (%)",
        "indicateur": "Indicator", "valeur": "Value",
        "titre_stat": "Title", "langue_detectee_stat": "Detected language", "duree_totale": "Total duration",
        "nb_segments": "Number of segments", "nb_mots": "Number of transcribed words",
        "fiabilite_moy": "Average reliability (%)", "temps_parole": "Speaking time per speaker",
        "niveau": "Level", "libelle": "Label", "detail_verbatim": "Detail / verbatim",
        "horodatage": "Timestamp", "premier_ordre": "First order", "second_ordre": "Second order",
        "dimension_agregee": "Aggregate dimension", "dimension": "Dimension", "theme": "Theme",
        "concept": "Concept", "frequence": "Frequency (verbatims)",
        "freq_dimension": "Frequency by dimension", "themes_pl": "Themes", "concepts_pl": "Concepts",
        "verbatims_pl": "Verbatims", "convergence_titre": "Convergence across interviews (triangulation)",
        "saturation_titre": "Theoretical saturation (chronological order)",
        "concepts_distincts": "Cumulative distinct concepts",
        "etude_corpus": "Study / corpus", "methodologie": "Methodology",
        "question_recherche_stat": "Research question", "nb_entretiens": "Number of interviews",
        "duree_cumulee": "Cumulative duration", "nb_mots_total": "Total transcribed words",
        "fiabilite_moy_corpus": "Average corpus reliability (%)", "rapport_genere_le": "Report generated on",
        "segments": "Segments", "mots": "Words", "date": "Date",
    },
}


def _l(langue):
    return L.get(langue, L["fr"])


def _fmt_temps(secondes: float) -> str:
    h, reste = divmod(int(secondes or 0), 3600)
    m, s = divmod(reste, 60)
    return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def _fmt_date(iso: str) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except ValueError:
        return iso[:10]


def _stats_segments(segments: list) -> dict:
    mots = [m for s in segments for m in (s.get("mots") or [])]
    duree = max((s.get("fin", 0) for s in segments), default=0)
    confiance_moy = (sum(m.get("confiance", 1) for m in mots) / len(mots)) if mots else None
    locuteurs = {}
    for s in segments:
        loc = s.get("locuteur")
        if loc:
            locuteurs[loc] = locuteurs.get(loc, 0) + max(0, s.get("fin", 0) - s.get("debut", 0))
    return {
        "duree_sec": duree, "nb_segments": len(segments), "nb_mots": len(mots),
        "confiance_moyenne": confiance_moy, "locuteurs": locuteurs,
    }


def _kappa_interpretation(k, langue="fr") -> str:
    termes = {
        "fr": ["accord faible", "accord passable", "accord modéré", "accord fort", "accord quasi parfait"],
        "en": ["poor agreement", "fair agreement", "moderate agreement", "substantial agreement", "almost perfect agreement"],
    }[langue if langue in ("fr", "en") else "fr"]
    if k is None:
        return "—"
    if k < 0.20:
        return termes[0]
    if k < 0.40:
        return termes[1]
    if k < 0.60:
        return termes[2]
    if k < 0.80:
        return termes[3]
    return termes[4]


def _stats_qualitatives(analyse: dict, entretiens_ordre: list) -> dict:
    """Indicateurs statistiques propres à la recherche qualitative :
    - fréquence par dimension (nb de thèmes/concepts/verbatims qui s'y rattachent) ;
    - convergence : pour chaque thème, sur combien d'entretiens distincts il apparaît ;
    - saturation théorique : nombre de concepts NOUVEAUX apportés par chaque entretien."""
    themes_par_nom = {t["theme"]: t for t in analyse.get("second_ordre", [])}
    concepts_par_nom = {c["concept"]: c for c in analyse.get("premier_ordre", [])}
    dimensions = analyse.get("dimensions_agregees") or []

    par_dimension = []
    for dim in dimensions:
        nb_themes = 0
        nb_concepts = 0
        nb_verbatims = 0
        for nom_t in dim.get("themes_lies", []):
            t = themes_par_nom.get(nom_t)
            if not t:
                continue
            nb_themes += 1
            for nom_c in t.get("concepts_lies", []):
                c = concepts_par_nom.get(nom_c)
                if not c:
                    continue
                nb_concepts += 1
                nb_verbatims += len(c.get("verbatims", []))
        par_dimension.append({
            "dimension": dim["dimension"], "nb_themes": nb_themes,
            "nb_concepts": nb_concepts, "nb_verbatims": nb_verbatims,
        })

    total_entretiens = len(entretiens_ordre) or 1
    convergence = []
    for t in analyse.get("second_ordre", []):
        entretiens_du_theme = set()
        for nom_c in t.get("concepts_lies", []):
            c = concepts_par_nom.get(nom_c)
            if not c:
                continue
            for v in c.get("verbatims", []):
                if v.get("entretien"):
                    entretiens_du_theme.add(v["entretien"])
        convergence.append({
            "theme": t["theme"], "nb_entretiens": len(entretiens_du_theme),
            "pct_entretiens": round(len(entretiens_du_theme) / total_entretiens * 100, 1),
        })
    convergence.sort(key=lambda x: -x["nb_entretiens"])

    saturation = []
    concepts_vus = set()
    for titre_e in entretiens_ordre:
        concepts_ici = set()
        for c in analyse.get("premier_ordre", []):
            for v in c.get("verbatims", []):
                if v.get("entretien") == titre_e:
                    concepts_ici.add(c["concept"])
        nouveaux = concepts_ici - concepts_vus
        concepts_vus |= concepts_ici
        saturation.append({
            "entretien": titre_e, "nouveaux_concepts": len(nouveaux),
            "cumul_concepts": len(concepts_vus),
        })

    return {"par_dimension": par_dimension, "convergence": convergence, "saturation": saturation}


# ----------------------------------------------------------------- utilitaires Word
def _champ_toc(document, langue):
    paragraphe = document.add_paragraph()
    run = paragraphe.add_run()
    fld_begin = OxmlElement("w:fldChar"); fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve")
    instr.text = 'TOC \\o "1-3" \\h \\z \\u'
    fld_sep = OxmlElement("w:fldChar"); fld_sep.set(qn("w:fldCharType"), "separate")
    texte_repli = OxmlElement("w:t")
    texte_repli.text = _l(langue)["sommaire_repli"]
    fld_sep.append(texte_repli)
    fld_end = OxmlElement("w:fldChar"); fld_end.set(qn("w:fldCharType"), "end")
    r = run._r
    r.append(fld_begin); r.append(instr); r.append(fld_sep); r.append(fld_end)


def _numero_page(document, langue):
    footer = document.sections[0].footer
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    def _champ(instr_text):
        r = p.add_run()
        b = OxmlElement("w:fldChar"); b.set(qn("w:fldCharType"), "begin"); r._r.append(b)
        i = OxmlElement("w:instrText"); i.set(qn("xml:space"), "preserve"); i.text = instr_text; r._r.append(i)
        s = OxmlElement("w:fldChar"); s.set(qn("w:fldCharType"), "separate"); r._r.append(s)
        e = OxmlElement("w:fldChar"); e.set(qn("w:fldCharType"), "end"); r._r.append(e)

    p.add_run(_l(langue)["page"])
    _champ("PAGE")
    p.add_run(_l(langue)["sur"])
    _champ("NUMPAGES")


def _page_de_garde(document, titre, sous_titre, lignes_meta):
    t = document.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    t.paragraph_format.space_before = Pt(140)
    run = t.add_run(titre)
    run.font.size = Pt(30); run.font.bold = True; run.font.color.rgb = RGBColor(0x1B, 0x15, 0x03)

    st = document.add_paragraph()
    st.alignment = WD_ALIGN_PARAGRAPH.CENTER
    st.paragraph_format.space_after = Pt(60)
    run2 = st.add_run(sous_titre)
    run2.font.size = Pt(16); run2.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    for ligne in lignes_meta:
        m = document.add_paragraph()
        m.alignment = WD_ALIGN_PARAGRAPH.CENTER
        m.add_run(ligne).font.size = Pt(11)

    document.add_page_break()


def _ecrire_structure_analyse(document, analyse, langue):
    themes_par_nom = {t["theme"]: t for t in analyse.get("second_ordre", [])}
    concepts_par_nom = {c["concept"]: c for c in analyse.get("premier_ordre", [])}
    loc_prefixe = _l(langue)["locuteur_prefixe"]

    def _ecrire_theme(theme, niveau):
        document.add_heading(theme["theme"], level=niveau)
        if theme.get("description"):
            document.add_paragraph(theme["description"])
        for nom_c in theme.get("concepts_lies", []):
            c = concepts_par_nom.get(nom_c)
            if not c:
                continue
            document.add_paragraph(c["concept"], style="List Bullet")
            for v in c.get("verbatims", []):
                vp = document.add_paragraph(style="List Bullet 2")
                vp.add_run(f"« {v.get('texte', '')} » ").italic = True
                suffixe = f" — {v['entretien']}" if v.get("entretien") else ""
                vp.add_run(f"[{_fmt_temps(v.get('debut', 0))}{suffixe}]").font.size = Pt(9)

    dimensions = analyse.get("dimensions_agregees") or []
    if dimensions:
        for dim in dimensions:
            document.add_heading(dim["dimension"], level=2)
            for nom_t in dim.get("themes_lies", []):
                t = themes_par_nom.get(nom_t)
                if t:
                    _ecrire_theme(t, 3)
    else:
        for t in analyse.get("second_ordre", []):
            _ecrire_theme(t, 2)
    _ = loc_prefixe  # réservé pour cohérence future des libellés de locuteur dans le corps


def _ecrire_transcription(document, segments, langue):
    loc_prefixe = _l(langue)["locuteur_prefixe"]
    for s in segments:
        p = document.add_paragraph()
        tc = p.add_run(f"[{_fmt_temps(s.get('debut', 0))}] ")
        tc.bold = True
        tc.font.color.rgb = RGBColor(0xB0, 0x7A, 0x1E)
        if s.get("locuteur"):
            loc = p.add_run(f"{s['locuteur'].replace('SPEAKER_', loc_prefixe)} — ")
            loc.bold = True
        p.add_run(s.get("texte", ""))


# ----------------------------------------------------------------- Word — entretien seul
def generer_docx_entretien(entretien: dict) -> io.BytesIO:
    langue = entretien.get("analyse_langue") or "fr"
    l = _l(langue)
    doc = Document()
    _page_de_garde(
        doc, entretien.get("titre") or "Entretien",
        l["sous_titre_entretien"],
        [
            f"{l['langue_detectee']}{entretien.get('langue_detectee') or entretien.get('langue') or '—'}",
            f"{l['genere_le']}{datetime.now().strftime('%d/%m/%Y %H:%M')}",
        ],
    )
    _champ_toc(doc, langue)
    doc.add_page_break()

    doc.add_heading(l["transcription"], level=1)
    _ecrire_transcription(doc, entretien.get("segments", []), langue)

    analyse = entretien.get("analyse")
    if analyse:
        doc.add_heading(l["analyse_qualitative"], level=1)
        methode = entretien.get("analyse_methode")
        doc.add_paragraph(
            f"{l['methode']}{METHODE_LABEL[langue].get(methode, methode or '—')}  ·  "
            f"{l['modele']}{entretien.get('analyse_modele') or '—'}"
        ).italic = True

        if analyse.get("demarche_methodologique"):
            doc.add_heading(f"2.1. {l['demarche_methodologique']}", level=2)
            doc.add_paragraph(analyse["demarche_methodologique"])

        doc.add_heading(f"2.2. {l['structure_resultats']}", level=2)
        _ecrire_structure_analyse(doc, analyse, langue)

        if analyse.get("synthese"):
            doc.add_heading(f"2.3. {l['synthese_interpretative']}", level=2)
            doc.add_paragraph(analyse["synthese"])
        if analyse.get("limites"):
            doc.add_heading(f"2.4. {l['limites_analyse']}", level=2)
            p = doc.add_paragraph(analyse["limites"])
            for run in p.runs:
                run.italic = True

        if methode and methode in REFERENCES_APA:
            doc.add_heading(l["reference"], level=2)
            doc.add_paragraph(REFERENCES_APA[methode])

    _numero_page(doc, langue)
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


# ----------------------------------------------------------------- Word — étude (corpus)
def generer_docx_etude(corpus: dict, entretiens: list, fiabilite: dict = None) -> io.BytesIO:
    langue = corpus.get("analyse_langue") or "fr"
    l = _l(langue)
    doc = Document()
    analyse = corpus.get("analyse") or {}
    methode = corpus.get("analyse_methode")
    duree_totale = sum(_stats_segments(e.get("segments", []))["duree_sec"] for e in entretiens)
    langues = sorted({e.get("langue_detectee") or e.get("langue") or "—" for e in entretiens})

    _page_de_garde(
        doc, l["rapport_titre"], corpus.get("nom") or l["etude"],
        [
            f"{METHODE_LABEL[langue].get(methode, methode or '—')}",
            f"{len(entretiens)} {l['entretiens_mot']} · {_fmt_temps(duree_totale)}{l['materiau_audio']}",
            f"{l['langues_parentheses']}{', '.join(langues)}",
            f"{l['genere_le']}{datetime.now().strftime('%d/%m/%Y %H:%M')}",
        ],
    )
    _champ_toc(doc, langue)
    doc.add_page_break()

    doc.add_heading(l["presentation_etude"], level=1)
    doc.add_paragraph(l["etude_intro"].format(n=len(entretiens), duree=_fmt_temps(duree_totale)))
    if corpus.get("analyse_contexte"):
        doc.add_paragraph(f"{l['question_recherche']}{corpus['analyse_contexte']}")
    tbl = doc.add_table(rows=1, cols=3)
    tbl.style = "Light Grid Accent 1"
    for i, h in enumerate([l["entretien_col"], l["langue_col"], l["duree_col"]]):
        tbl.rows[0].cells[i].text = h
    for e in entretiens:
        row = tbl.add_row().cells
        row[0].text = e.get("titre") or "—"
        row[1].text = e.get("langue_detectee") or e.get("langue") or "—"
        row[2].text = _fmt_temps(_stats_segments(e.get("segments", []))["duree_sec"])

    doc.add_heading(l["demarche_titre2"], level=1)
    if analyse.get("demarche_methodologique"):
        doc.add_paragraph(analyse["demarche_methodologique"])
    else:
        doc.add_paragraph(l["aucune_analyse_corpus"])

    if analyse:
        doc.add_heading(l["structure_resultats3"], level=1)
        _ecrire_structure_analyse(doc, analyse, langue)

        doc.add_heading(l["synthese4"], level=1)
        doc.add_paragraph(analyse.get("synthese") or "—")

        doc.add_heading(l["limites5"], level=1)
        p = doc.add_paragraph(analyse.get("limites") or "—")
        for run in p.runs:
            run.italic = True

    if fiabilite and fiabilite.get("details"):
        doc.add_heading(l["fiabilite6"], level=1)
        doc.add_paragraph(l["fiabilite_intro"])
        tbl2 = doc.add_table(rows=1, cols=4)
        tbl2.style = "Light Grid Accent 1"
        for i, h in enumerate([l["entretien_col"], l["codeurs_col"], l["kappa_moyen_col"], l["interpretation_col"]]):
            tbl2.rows[0].cells[i].text = h
        for d in fiabilite["details"]:
            row = tbl2.add_row().cells
            row[0].text = d["titre"]
            row[1].text = str(d["nb_codeurs"])
            row[2].text = str(d["kappa_moyen"]) if d["kappa_moyen"] is not None else "—"
            row[3].text = _kappa_interpretation(d["kappa_moyen"], langue)

    if analyse:
        doc.add_heading(l["rigueur7"], level=1)
        entretiens_ordre = [e.get("titre", "") for e in entretiens]
        stats_q = _stats_qualitatives(analyse, entretiens_ordre)

        doc.add_heading(l["convergence71"], level=2)
        doc.add_paragraph(l["convergence_intro"])
        tbl3 = doc.add_table(rows=1, cols=3)
        tbl3.style = "Light Grid Accent 1"
        for i, h in enumerate([l["theme_col"], l["entretiens_concernes_col"], l["pct_corpus_col"]]):
            tbl3.rows[0].cells[i].text = h
        for c in stats_q["convergence"]:
            row = tbl3.add_row().cells
            row[0].text = c["theme"]
            row[1].text = str(c["nb_entretiens"])
            row[2].text = f"{c['pct_entretiens']} %"

        doc.add_heading(l["saturation72"], level=2)
        doc.add_paragraph(l["saturation_intro"])
        tbl4 = doc.add_table(rows=1, cols=3)
        tbl4.style = "Light Grid Accent 1"
        for i, h in enumerate([l["entretien_col"], l["concepts_nouveaux_col"], l["cumul_col"]]):
            tbl4.rows[0].cells[i].text = h
        for s in stats_q["saturation"]:
            row = tbl4.add_row().cells
            row[0].text = s["entretien"]
            row[1].text = str(s["nouveaux_concepts"])
            row[2].text = str(s["cumul_concepts"])

    if methode and methode in REFERENCES_APA:
        doc.add_heading(l["references"], level=1)
        doc.add_paragraph(REFERENCES_APA[methode])

    doc.add_page_break()
    doc.add_heading(l["annexe_a"], level=1)
    tblA = doc.add_table(rows=1, cols=4)
    tblA.style = "Light Grid Accent 1"
    for i, h in enumerate([l["titre_col"], l["langue_col"], l["duree_col"], l["date_col"]]):
        tblA.rows[0].cells[i].text = h
    for e in entretiens:
        row = tblA.add_row().cells
        row[0].text = e.get("titre") or "—"
        row[1].text = e.get("langue_detectee") or e.get("langue") or "—"
        row[2].text = _fmt_temps(_stats_segments(e.get("segments", []))["duree_sec"])
        row[3].text = _fmt_date(e.get("cree_le"))

    doc.add_page_break()
    doc.add_heading(l["annexe_b"], level=1)
    for e in entretiens:
        doc.add_heading(e.get("titre") or "—", level=2)
        _ecrire_transcription(doc, e.get("segments", []), langue)

    _numero_page(doc, langue)
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


# ----------------------------------------------------------------- Excel
def _entete(ws, valeurs, ligne=1):
    for i, v in enumerate(valeurs, start=1):
        cell = ws.cell(row=ligne, column=i, value=v)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=OR_HEX)
        cell.alignment = Alignment(vertical="center")
    for i in range(1, len(valeurs) + 1):
        ws.column_dimensions[get_column_letter(i)].width = 22


def generer_xlsx_entretien(entretien: dict) -> io.BytesIO:
    langue = entretien.get("analyse_langue") or "fr"
    l = _l(langue)
    loc_prefixe = l["locuteur_prefixe"]
    wb = Workbook()

    ws_t = wb.active
    ws_t.title = l["feuille_transcription"]
    _entete(ws_t, [l["debut"], l["fin"], l["locuteur"], l["texte"], l["confiance_moy"]])
    for i, s in enumerate(entretien.get("segments", []), start=2):
        mots = s.get("mots") or []
        conf = round(sum(m.get("confiance", 1) for m in mots) / len(mots) * 100, 1) if mots else None
        ws_t.cell(i, 1, _fmt_temps(s.get("debut", 0)))
        ws_t.cell(i, 2, _fmt_temps(s.get("fin", 0)))
        ws_t.cell(i, 3, (s.get("locuteur") or "").replace("SPEAKER_", loc_prefixe))
        ws_t.cell(i, 4, s.get("texte", ""))
        ws_t.cell(i, 5, conf)
    ws_t.column_dimensions["D"].width = 70

    stats = _stats_segments(entretien.get("segments", []))
    ws_s = wb.create_sheet(l["feuille_statistiques"])
    _entete(ws_s, [l["indicateur"], l["valeur"]])
    lignes = [
        (l["titre_stat"], entretien.get("titre") or "—"),
        (l["langue_detectee_stat"], entretien.get("langue_detectee") or entretien.get("langue") or "—"),
        (l["duree_totale"], _fmt_temps(stats["duree_sec"])),
        (l["nb_segments"], stats["nb_segments"]),
        (l["nb_mots"], stats["nb_mots"]),
        (l["fiabilite_moy"], round(stats["confiance_moyenne"] * 100, 1) if stats["confiance_moyenne"] is not None else "—"),
    ]
    for i, (k, v) in enumerate(lignes, start=2):
        ws_s.cell(i, 1, k).font = Font(bold=True)
        ws_s.cell(i, 2, v)

    if stats["locuteurs"]:
        r = len(lignes) + 3
        ws_s.cell(r, 1, l["temps_parole"]).font = Font(bold=True)
        r += 1
        for loc, dur in sorted(stats["locuteurs"].items(), key=lambda x: -x[1]):
            ws_s.cell(r, 1, loc.replace("SPEAKER_", loc_prefixe))
            ws_s.cell(r, 2, _fmt_temps(dur))
            r += 1

    analyse = entretien.get("analyse")
    if analyse:
        _feuille_analyse(wb, l["feuille_analyse"], analyse, langue)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _feuille_analyse(wb, nom, analyse, langue):
    l = _l(langue)
    ws = wb.create_sheet(nom)
    _entete(ws, [l["niveau"], l["libelle"], l["detail_verbatim"], l["entretien_col"], l["horodatage"]])
    r = 2
    for c in analyse.get("premier_ordre", []):
        for v in c.get("verbatims", []) or [{}]:
            ws.cell(r, 1, l["premier_ordre"])
            ws.cell(r, 2, c.get("concept", ""))
            ws.cell(r, 3, v.get("texte", ""))
            ws.cell(r, 4, v.get("entretien", ""))
            ws.cell(r, 5, _fmt_temps(v.get("debut", 0)) if v else "")
            r += 1
    for t in analyse.get("second_ordre", []):
        ws.cell(r, 1, l["second_ordre"])
        ws.cell(r, 2, t.get("theme", ""))
        ws.cell(r, 3, t.get("description", ""))
        r += 1
    for d in analyse.get("dimensions_agregees", []) or []:
        ws.cell(r, 1, l["dimension_agregee"])
        ws.cell(r, 2, d.get("dimension", ""))
        ws.cell(r, 3, ", ".join(d.get("themes_lies", [])))
        r += 1
    ws.column_dimensions["C"].width = 60
    return ws


def _feuille_codebook(wb, analyse, langue):
    l = _l(langue)
    ws = wb.create_sheet(l["feuille_codebook"])
    _entete(ws, [l["dimension"], l["theme"], l["concept"], l["frequence"]])
    themes_par_nom = {t["theme"]: t for t in analyse.get("second_ordre", [])}
    concepts_par_nom = {c["concept"]: c for c in analyse.get("premier_ordre", [])}
    r = 2
    dimensions = analyse.get("dimensions_agregees") or []
    if dimensions:
        for dim in dimensions:
            for nom_t in dim.get("themes_lies", []):
                t = themes_par_nom.get(nom_t)
                if not t:
                    continue
                for nom_c in t.get("concepts_lies", []):
                    c = concepts_par_nom.get(nom_c)
                    if not c:
                        continue
                    ws.cell(r, 1, dim["dimension"])
                    ws.cell(r, 2, t["theme"])
                    ws.cell(r, 3, c["concept"])
                    ws.cell(r, 4, len(c.get("verbatims", [])))
                    r += 1
    else:
        for t in analyse.get("second_ordre", []):
            for nom_c in t.get("concepts_lies", []):
                c = concepts_par_nom.get(nom_c)
                if not c:
                    continue
                ws.cell(r, 1, "—")
                ws.cell(r, 2, t["theme"])
                ws.cell(r, 3, c["concept"])
                ws.cell(r, 4, len(c.get("verbatims", [])))
                r += 1
    ws.column_dimensions["B"].width = 30
    ws.column_dimensions["C"].width = 30


def _feuille_stats_qualitatives(wb, analyse, entretiens_ordre, langue):
    l = _l(langue)
    stats_q = _stats_qualitatives(analyse, entretiens_ordre)
    ws = wb.create_sheet(l["feuille_stats_qual"])

    ws.cell(1, 1, l["freq_dimension"]).font = Font(bold=True, size=13)
    _entete(ws, [l["dimension"], l["themes_pl"], l["concepts_pl"], l["verbatims_pl"]], ligne=2)
    r = 3
    for d in stats_q["par_dimension"]:
        ws.cell(r, 1, d["dimension"]); ws.cell(r, 2, d["nb_themes"])
        ws.cell(r, 3, d["nb_concepts"]); ws.cell(r, 4, d["nb_verbatims"])
        r += 1

    r += 1
    ws.cell(r, 1, l["convergence_titre"]).font = Font(bold=True, size=13)
    r += 1
    _entete(ws, [l["theme_col"], l["entretiens_concernes_col"], l["pct_corpus_col"]], ligne=r)
    r += 1
    for c in stats_q["convergence"]:
        ws.cell(r, 1, c["theme"]); ws.cell(r, 2, c["nb_entretiens"]); ws.cell(r, 3, f"{c['pct_entretiens']} %")
        r += 1

    r += 1
    ws.cell(r, 1, l["saturation_titre"]).font = Font(bold=True, size=13)
    r += 1
    _entete(ws, [l["entretien_col"], l["concepts_nouveaux_col"], l["concepts_distincts"]], ligne=r)
    r += 1
    for s in stats_q["saturation"]:
        ws.cell(r, 1, s["entretien"]); ws.cell(r, 2, s["nouveaux_concepts"]); ws.cell(r, 3, s["cumul_concepts"])
        r += 1

    ws.column_dimensions["A"].width = 34


def generer_xlsx_etude(corpus: dict, entretiens: list, fiabilite: dict = None) -> io.BytesIO:
    langue = corpus.get("analyse_langue") or "fr"
    l = _l(langue)
    loc_prefixe = l["locuteur_prefixe"]
    wb = Workbook()
    analyse = corpus.get("analyse") or {}
    duree_totale = sum(_stats_segments(e.get("segments", []))["duree_sec"] for e in entretiens)
    tous_mots = sum(_stats_segments(e.get("segments", []))["nb_mots"] for e in entretiens)
    confiances = [
        st["confiance_moyenne"] for st in
        (_stats_segments(e.get("segments", [])) for e in entretiens)
        if st["confiance_moyenne"] is not None
    ]

    ws_v = wb.active
    ws_v.title = l["feuille_vue_ensemble"]
    _entete(ws_v, [l["indicateur"], l["valeur"]])
    lignes = [
        (l["etude_corpus"], corpus.get("nom") or "—"),
        (l["methodologie"], METHODE_LABEL[langue].get(corpus.get("analyse_methode"), corpus.get("analyse_methode") or "—")),
        (l["question_recherche_stat"], corpus.get("analyse_contexte") or "—"),
        (l["nb_entretiens"], len(entretiens)),
        (l["duree_cumulee"], _fmt_temps(duree_totale)),
        (l["nb_mots_total"], tous_mots),
        (l["fiabilite_moy_corpus"], round(sum(confiances) / len(confiances) * 100, 1) if confiances else "—"),
        (l["rapport_genere_le"], datetime.now().strftime("%d/%m/%Y %H:%M")),
    ]
    for i, (k, v) in enumerate(lignes, start=2):
        ws_v.cell(i, 1, k).font = Font(bold=True)
        ws_v.cell(i, 2, v)
    ws_v.column_dimensions["B"].width = 60

    ws_e = wb.create_sheet(l["feuille_entretiens"])
    _entete(ws_e, [l["titre_col"], l["langue_col"], l["duree_col"], l["segments"], l["mots"], l["confiance_pct"], l["date"]])
    for i, e in enumerate(entretiens, start=2):
        st = _stats_segments(e.get("segments", []))
        ws_e.cell(i, 1, e.get("titre", ""))
        ws_e.cell(i, 2, e.get("langue_detectee") or e.get("langue") or "—")
        ws_e.cell(i, 3, _fmt_temps(st["duree_sec"]))
        ws_e.cell(i, 4, st["nb_segments"])
        ws_e.cell(i, 5, st["nb_mots"])
        ws_e.cell(i, 6, round(st["confiance_moyenne"] * 100, 1) if st["confiance_moyenne"] is not None else "—")
        ws_e.cell(i, 7, _fmt_date(e.get("cree_le")))

    ws_tr = wb.create_sheet(l["feuille_transcriptions"])
    _entete(ws_tr, [l["entretien_col"], l["debut"], l["fin"], l["locuteur"], l["texte"]])
    r = 2
    for e in entretiens:
        for s in e.get("segments", []):
            ws_tr.cell(r, 1, e.get("titre", ""))
            ws_tr.cell(r, 2, _fmt_temps(s.get("debut", 0)))
            ws_tr.cell(r, 3, _fmt_temps(s.get("fin", 0)))
            ws_tr.cell(r, 4, (s.get("locuteur") or "").replace("SPEAKER_", loc_prefixe))
            ws_tr.cell(r, 5, s.get("texte", ""))
            r += 1
    ws_tr.column_dimensions["E"].width = 70

    if analyse:
        _feuille_analyse(wb, l["feuille_analyse_transversale"], analyse, langue)
        _feuille_codebook(wb, analyse, langue)
        _feuille_stats_qualitatives(wb, analyse, [e.get("titre", "") for e in entretiens], langue)

    if fiabilite and fiabilite.get("details"):
        ws_f = wb.create_sheet(l["feuille_fiabilite"])
        _entete(ws_f, [l["entretien_col"], l["codeurs_col"], l["kappa_moyen_col"], l["interpretation_col"]])
        for i, d in enumerate(fiabilite["details"], start=2):
            ws_f.cell(i, 1, d["titre"])
            ws_f.cell(i, 2, d["nb_codeurs"])
            ws_f.cell(i, 3, d["kappa_moyen"])
            ws_f.cell(i, 4, _kappa_interpretation(d["kappa_moyen"], langue))

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
