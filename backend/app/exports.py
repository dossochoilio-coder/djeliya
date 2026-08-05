"""
Génération des exports Word (.docx) et Excel (.xlsx) de Djeliya.

Deux niveaux :
- Entretien seul : transcription + son analyse.
- Étude (corpus entier) : rapport de recherche complet — page de garde,
  sommaire, démarche méthodologique référencée (APA), structure des
  résultats numérotée, fiabilité inter-codeurs, annexes (liste des
  entretiens et transcriptions intégrales).
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
    "gioia": "Méthode de structuration des données de Gioia et al. (2013)",
    "thematique": "Analyse thématique réflexive de Braun & Clarke (2006, 2019)",
    "contenu": "Analyse de contenu catégorielle de Bardin (2013)",
}


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


def _kappa_interpretation(k) -> str:
    if k is None:
        return "—"
    if k < 0.20:
        return "accord faible"
    if k < 0.40:
        return "accord passable"
    if k < 0.60:
        return "accord modéré"
    if k < 0.80:
        return "accord fort"
    return "accord quasi parfait"


def _stats_qualitatives(analyse: dict, entretiens_ordre: list) -> dict:
    """Indicateurs statistiques propres à la recherche qualitative :
    - fréquence par dimension (nb de thèmes/concepts/verbatims qui s'y rattachent) ;
    - convergence : pour chaque thème, sur combien d'entretiens distincts il apparaît
      (un thème présent dans un seul entretien est moins robuste qu'un thème
      retrouvé dans plusieurs cas — logique de triangulation) ;
    - saturation théorique : nombre de concepts NOUVEAUX apportés par chaque
      entretien pris dans l'ordre chronologique — un indicateur classique pour
      juger si le corpus est suffisant (la courbe doit s'aplatir)."""
    themes_par_nom = {t["theme"]: t for t in analyse.get("second_ordre", [])}
    concepts_par_nom = {c["concept"]: c for c in analyse.get("premier_ordre", [])}
    dimensions = analyse.get("dimensions_agregees") or []

    # Fréquence par dimension
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

    # Convergence : entretiens distincts par thème
    total_entretiens = len(entretiens_ordre) or 1
    convergence = []
    themes_iter = analyse.get("second_ordre", []) if dimensions else analyse.get("second_ordre", [])
    for t in themes_iter:
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

    # Saturation théorique (ordre chronologique des entretiens)
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
def _champ_toc(document):
    """Insère un vrai champ de sommaire Word (à mettre à jour par l'utilisateur :
    clic droit → Mettre à jour les champs)."""
    paragraphe = document.add_paragraph()
    run = paragraphe.add_run()
    fld_begin = OxmlElement("w:fldChar"); fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve")
    instr.text = 'TOC \\o "1-3" \\h \\z \\u'
    fld_sep = OxmlElement("w:fldChar"); fld_sep.set(qn("w:fldCharType"), "separate")
    texte_repli = OxmlElement("w:t")
    texte_repli.text = "Sommaire — clic droit puis « Mettre à jour les champs » pour l'afficher."
    fld_sep.append(texte_repli)
    fld_end = OxmlElement("w:fldChar"); fld_end.set(qn("w:fldCharType"), "end")
    r = run._r
    r.append(fld_begin); r.append(instr); r.append(fld_sep); r.append(fld_end)


def _numero_page(document):
    """Ajoute la pagination (Page n / total) dans le pied de page."""
    footer = document.sections[0].footer
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    def _champ(instr_text):
        r = p.add_run()
        b = OxmlElement("w:fldChar"); b.set(qn("w:fldCharType"), "begin"); r._r.append(b)
        i = OxmlElement("w:instrText"); i.set(qn("xml:space"), "preserve"); i.text = instr_text; r._r.append(i)
        s = OxmlElement("w:fldChar"); s.set(qn("w:fldCharType"), "separate"); r._r.append(s)
        e = OxmlElement("w:fldChar"); e.set(qn("w:fldCharType"), "end"); r._r.append(e)

    p.add_run("Page ")
    _champ("PAGE")
    p.add_run(" / ")
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


def _ecrire_structure_analyse(document, analyse):
    """Écrit la hiérarchie complète (dimensions > thèmes > concepts > verbatims),
    ou à deux niveaux si la méthode n'utilise pas de dimensions agrégées."""
    themes_par_nom = {t["theme"]: t for t in analyse.get("second_ordre", [])}
    concepts_par_nom = {c["concept"]: c for c in analyse.get("premier_ordre", [])}

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


def _ecrire_transcription(document, segments):
    for s in segments:
        p = document.add_paragraph()
        tc = p.add_run(f"[{_fmt_temps(s.get('debut', 0))}] ")
        tc.bold = True
        tc.font.color.rgb = RGBColor(0xB0, 0x7A, 0x1E)
        if s.get("locuteur"):
            loc = p.add_run(f"{s['locuteur'].replace('SPEAKER_', 'Locuteur ')} — ")
            loc.bold = True
        p.add_run(s.get("texte", ""))


# ----------------------------------------------------------------- Word — entretien seul
def generer_docx_entretien(entretien: dict) -> io.BytesIO:
    doc = Document()
    _page_de_garde(
        doc, entretien.get("titre") or "Entretien",
        "Transcription et analyse qualitative",
        [
            f"Langue détectée : {entretien.get('langue_detectee') or entretien.get('langue') or '—'}",
            f"Document généré par Djeliya le {datetime.now().strftime('%d/%m/%Y à %H:%M')}",
        ],
    )
    _champ_toc(doc)
    doc.add_page_break()

    doc.add_heading("1. Transcription", level=1)
    _ecrire_transcription(doc, entretien.get("segments", []))

    analyse = entretien.get("analyse")
    if analyse:
        doc.add_heading("2. Analyse qualitative", level=1)
        methode = entretien.get("analyse_methode")
        doc.add_paragraph(
            f"Méthode : {METHODE_LABEL.get(methode, methode or '—')}  ·  "
            f"Modèle : {entretien.get('analyse_modele') or '—'}"
        ).italic = True

        if analyse.get("demarche_methodologique"):
            doc.add_heading("2.1. Démarche méthodologique", level=2)
            doc.add_paragraph(analyse["demarche_methodologique"])

        doc.add_heading("2.2. Structure des résultats", level=2)
        _ecrire_structure_analyse(doc, analyse)

        if analyse.get("synthese"):
            doc.add_heading("2.3. Synthèse interprétative", level=2)
            doc.add_paragraph(analyse["synthese"])
        if analyse.get("limites"):
            doc.add_heading("2.4. Limites de l'analyse automatique", level=2)
            p = doc.add_paragraph(analyse["limites"])
            for run in p.runs:
                run.italic = True

        if methode and methode in REFERENCES_APA:
            doc.add_heading("Référence", level=2)
            doc.add_paragraph(REFERENCES_APA[methode])

    _numero_page(doc)
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


# ----------------------------------------------------------------- Word — étude (corpus)
def generer_docx_etude(corpus: dict, entretiens: list, fiabilite: dict = None) -> io.BytesIO:
    doc = Document()
    analyse = corpus.get("analyse") or {}
    methode = corpus.get("analyse_methode")
    duree_totale = sum(_stats_segments(e.get("segments", []))["duree_sec"] for e in entretiens)
    langues = sorted({e.get("langue_detectee") or e.get("langue") or "—" for e in entretiens})

    _page_de_garde(
        doc, "RAPPORT D'ANALYSE QUALITATIVE", corpus.get("nom") or "Étude",
        [
            f"{METHODE_LABEL.get(methode, methode or '—')}",
            f"{len(entretiens)} entretien(s) · {_fmt_temps(duree_totale)} de matériau audio",
            f"Langue(s) : {', '.join(langues)}",
            f"Document généré par Djeliya le {datetime.now().strftime('%d/%m/%Y à %H:%M')}",
        ],
    )
    _champ_toc(doc)
    doc.add_page_break()

    doc.add_heading("1. Présentation de l'étude", level=1)
    doc.add_paragraph(
        f"Cette étude qualitative repose sur un corpus de {len(entretiens)} entretien(s), "
        f"totalisant {_fmt_temps(duree_totale)} de matériau audio transcrit."
    )
    if corpus.get("analyse_contexte"):
        doc.add_paragraph(f"Question de recherche / angle d'analyse : {corpus['analyse_contexte']}")
    tbl = doc.add_table(rows=1, cols=3)
    tbl.style = "Light Grid Accent 1"
    for i, h in enumerate(["Entretien", "Langue", "Durée"]):
        tbl.rows[0].cells[i].text = h
    for e in entretiens:
        row = tbl.add_row().cells
        row[0].text = e.get("titre") or "—"
        row[1].text = e.get("langue_detectee") or e.get("langue") or "—"
        row[2].text = _fmt_temps(_stats_segments(e.get("segments", []))["duree_sec"])

    doc.add_heading("2. Démarche méthodologique", level=1)
    if analyse.get("demarche_methodologique"):
        doc.add_paragraph(analyse["demarche_methodologique"])
    else:
        doc.add_paragraph("Aucune analyse transversale n'a encore été lancée sur ce corpus.")

    if analyse:
        doc.add_heading("3. Structure des résultats", level=1)
        _ecrire_structure_analyse(doc, analyse)

        doc.add_heading("4. Synthèse interprétative", level=1)
        doc.add_paragraph(analyse.get("synthese") or "—")

        doc.add_heading("5. Limites méthodologiques", level=1)
        p = doc.add_paragraph(analyse.get("limites") or "—")
        for run in p.runs:
            run.italic = True

    if fiabilite and fiabilite.get("details"):
        doc.add_heading("6. Fiabilité inter-codeurs", level=1)
        doc.add_paragraph(
            "Le kappa de Cohen mesure l'accord entre codeurs indépendants au-delà de ce que "
            "le hasard produirait seul (0 = accord aléatoire, 1 = accord parfait)."
        )
        tbl2 = doc.add_table(rows=1, cols=4)
        tbl2.style = "Light Grid Accent 1"
        for i, h in enumerate(["Entretien", "Codeurs", "Kappa moyen", "Interprétation"]):
            tbl2.rows[0].cells[i].text = h
        for d in fiabilite["details"]:
            row = tbl2.add_row().cells
            row[0].text = d["titre"]
            row[1].text = str(d["nb_codeurs"])
            row[2].text = str(d["kappa_moyen"]) if d["kappa_moyen"] is not None else "—"
            row[3].text = _kappa_interpretation(d["kappa_moyen"])

    if analyse:
        doc.add_heading("7. Indicateurs de rigueur qualitative", level=1)
        entretiens_ordre = [e.get("titre", "") for e in entretiens]
        stats_q = _stats_qualitatives(analyse, entretiens_ordre)

        doc.add_heading("7.1. Convergence entre entretiens", level=2)
        doc.add_paragraph(
            "Un thème retrouvé dans plusieurs entretiens distincts est plus robuste qu'un thème "
            "isolé à un seul cas — c'est le principe de triangulation en recherche qualitative."
        )
        tbl3 = doc.add_table(rows=1, cols=3)
        tbl3.style = "Light Grid Accent 1"
        for i, h in enumerate(["Thème", "Entretiens concernés", "% du corpus"]):
            tbl3.rows[0].cells[i].text = h
        for c in stats_q["convergence"]:
            row = tbl3.add_row().cells
            row[0].text = c["theme"]
            row[1].text = str(c["nb_entretiens"])
            row[2].text = f"{c['pct_entretiens']} %"

        doc.add_heading("7.2. Saturation théorique", level=2)
        doc.add_paragraph(
            "Nombre de concepts nouveaux apportés par chaque entretien, dans l'ordre chronologique. "
            "Une courbe qui s'aplatit vers la fin du corpus suggère que des entretiens "
            "supplémentaires n'apporteraient plus beaucoup d'éléments inédits."
        )
        tbl4 = doc.add_table(rows=1, cols=3)
        tbl4.style = "Light Grid Accent 1"
        for i, h in enumerate(["Entretien", "Concepts nouveaux", "Cumul"]):
            tbl4.rows[0].cells[i].text = h
        for s in stats_q["saturation"]:
            row = tbl4.add_row().cells
            row[0].text = s["entretien"]
            row[1].text = str(s["nouveaux_concepts"])
            row[2].text = str(s["cumul_concepts"])

    if methode and methode in REFERENCES_APA:
        doc.add_heading("Références", level=1)
        doc.add_paragraph(REFERENCES_APA[methode])

    doc.add_page_break()
    doc.add_heading("Annexe A — Composition du corpus", level=1)
    tblA = doc.add_table(rows=1, cols=4)
    tblA.style = "Light Grid Accent 1"
    for i, h in enumerate(["Titre", "Langue", "Durée", "Date"]):
        tblA.rows[0].cells[i].text = h
    for e in entretiens:
        row = tblA.add_row().cells
        row[0].text = e.get("titre") or "—"
        row[1].text = e.get("langue_detectee") or e.get("langue") or "—"
        row[2].text = _fmt_temps(_stats_segments(e.get("segments", []))["duree_sec"])
        row[3].text = _fmt_date(e.get("cree_le"))

    doc.add_page_break()
    doc.add_heading("Annexe B — Transcriptions intégrales", level=1)
    for e in entretiens:
        doc.add_heading(e.get("titre") or "Entretien", level=2)
        _ecrire_transcription(doc, e.get("segments", []))

    _numero_page(doc)
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
    wb = Workbook()

    ws_t = wb.active
    ws_t.title = "Transcription"
    _entete(ws_t, ["Début", "Fin", "Locuteur", "Texte", "Confiance moyenne (%)"])
    for i, s in enumerate(entretien.get("segments", []), start=2):
        mots = s.get("mots") or []
        conf = round(sum(m.get("confiance", 1) for m in mots) / len(mots) * 100, 1) if mots else None
        ws_t.cell(i, 1, _fmt_temps(s.get("debut", 0)))
        ws_t.cell(i, 2, _fmt_temps(s.get("fin", 0)))
        ws_t.cell(i, 3, (s.get("locuteur") or "").replace("SPEAKER_", "Locuteur "))
        ws_t.cell(i, 4, s.get("texte", ""))
        ws_t.cell(i, 5, conf)
    ws_t.column_dimensions["D"].width = 70

    stats = _stats_segments(entretien.get("segments", []))
    ws_s = wb.create_sheet("Statistiques")
    _entete(ws_s, ["Indicateur", "Valeur"])
    lignes = [
        ("Titre", entretien.get("titre") or "—"),
        ("Langue détectée", entretien.get("langue_detectee") or entretien.get("langue") or "—"),
        ("Durée totale", _fmt_temps(stats["duree_sec"])),
        ("Nombre de segments", stats["nb_segments"]),
        ("Nombre de mots transcrits", stats["nb_mots"]),
        ("Fiabilité moyenne (%)", round(stats["confiance_moyenne"] * 100, 1) if stats["confiance_moyenne"] is not None else "—"),
    ]
    for i, (k, v) in enumerate(lignes, start=2):
        ws_s.cell(i, 1, k).font = Font(bold=True)
        ws_s.cell(i, 2, v)

    if stats["locuteurs"]:
        r = len(lignes) + 3
        ws_s.cell(r, 1, "Temps de parole par locuteur").font = Font(bold=True)
        r += 1
        for loc, dur in sorted(stats["locuteurs"].items(), key=lambda x: -x[1]):
            ws_s.cell(r, 1, loc.replace("SPEAKER_", "Locuteur "))
            ws_s.cell(r, 2, _fmt_temps(dur))
            r += 1

    analyse = entretien.get("analyse")
    if analyse:
        _feuille_analyse(wb, "Analyse", analyse)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _feuille_analyse(wb, nom, analyse):
    ws = wb.create_sheet(nom)
    _entete(ws, ["Niveau", "Libellé", "Détail / verbatim", "Entretien", "Horodatage"])
    r = 2
    for c in analyse.get("premier_ordre", []):
        for v in c.get("verbatims", []) or [{}]:
            ws.cell(r, 1, "Premier ordre")
            ws.cell(r, 2, c.get("concept", ""))
            ws.cell(r, 3, v.get("texte", ""))
            ws.cell(r, 4, v.get("entretien", ""))
            ws.cell(r, 5, _fmt_temps(v.get("debut", 0)) if v else "")
            r += 1
    for t in analyse.get("second_ordre", []):
        ws.cell(r, 1, "Second ordre")
        ws.cell(r, 2, t.get("theme", ""))
        ws.cell(r, 3, t.get("description", ""))
        r += 1
    for d in analyse.get("dimensions_agregees", []) or []:
        ws.cell(r, 1, "Dimension agrégée")
        ws.cell(r, 2, d.get("dimension", ""))
        ws.cell(r, 3, ", ".join(d.get("themes_lies", [])))
        r += 1
    ws.column_dimensions["C"].width = 60
    return ws


def _feuille_codebook(wb, analyse):
    """Un vrai « codebook » de recherche qualitative : chaque concept avec sa
    fréquence d'occurrence (nombre de verbatims), regroupé par thème et dimension."""
    ws = wb.create_sheet("Codebook")
    _entete(ws, ["Dimension", "Thème", "Concept", "Fréquence (verbatims)"])
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


def _feuille_stats_qualitatives(wb, analyse, entretiens_ordre):
    stats_q = _stats_qualitatives(analyse, entretiens_ordre)
    ws = wb.create_sheet("Statistiques qualitatives")

    ws.cell(1, 1, "Fréquence par dimension").font = Font(bold=True, size=13)
    _entete(ws, ["Dimension", "Thèmes", "Concepts", "Verbatims"], ligne=2)
    r = 3
    for d in stats_q["par_dimension"]:
        ws.cell(r, 1, d["dimension"]); ws.cell(r, 2, d["nb_themes"])
        ws.cell(r, 3, d["nb_concepts"]); ws.cell(r, 4, d["nb_verbatims"])
        r += 1

    r += 1
    ws.cell(r, 1, "Convergence entre entretiens (triangulation)").font = Font(bold=True, size=13)
    r += 1
    _entete(ws, ["Thème", "Entretiens concernés", "% du corpus"], ligne=r)
    r += 1
    for c in stats_q["convergence"]:
        ws.cell(r, 1, c["theme"]); ws.cell(r, 2, c["nb_entretiens"]); ws.cell(r, 3, f"{c['pct_entretiens']} %")
        r += 1

    r += 1
    ws.cell(r, 1, "Saturation théorique (ordre chronologique)").font = Font(bold=True, size=13)
    r += 1
    _entete(ws, ["Entretien", "Concepts nouveaux", "Cumul de concepts distincts"], ligne=r)
    r += 1
    for s in stats_q["saturation"]:
        ws.cell(r, 1, s["entretien"]); ws.cell(r, 2, s["nouveaux_concepts"]); ws.cell(r, 3, s["cumul_concepts"])
        r += 1

    ws.column_dimensions["A"].width = 34


def generer_xlsx_etude(corpus: dict, entretiens: list, fiabilite: dict = None) -> io.BytesIO:
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
    ws_v.title = "Vue d'ensemble"
    _entete(ws_v, ["Indicateur", "Valeur"])
    lignes = [
        ("Étude / corpus", corpus.get("nom") or "—"),
        ("Méthodologie", METHODE_LABEL.get(corpus.get("analyse_methode"), corpus.get("analyse_methode") or "—")),
        ("Question de recherche", corpus.get("analyse_contexte") or "—"),
        ("Nombre d'entretiens", len(entretiens)),
        ("Durée cumulée", _fmt_temps(duree_totale)),
        ("Nombre total de mots transcrits", tous_mots),
        ("Fiabilité moyenne du corpus (%)", round(sum(confiances) / len(confiances) * 100, 1) if confiances else "—"),
        ("Rapport généré le", datetime.now().strftime("%d/%m/%Y à %H:%M")),
    ]
    for i, (k, v) in enumerate(lignes, start=2):
        ws_v.cell(i, 1, k).font = Font(bold=True)
        ws_v.cell(i, 2, v)
    ws_v.column_dimensions["B"].width = 60

    ws_e = wb.create_sheet("Entretiens")
    _entete(ws_e, ["Titre", "Langue", "Durée", "Segments", "Mots", "Fiabilité (%)", "Date"])
    for i, e in enumerate(entretiens, start=2):
        st = _stats_segments(e.get("segments", []))
        ws_e.cell(i, 1, e.get("titre", ""))
        ws_e.cell(i, 2, e.get("langue_detectee") or e.get("langue") or "—")
        ws_e.cell(i, 3, _fmt_temps(st["duree_sec"]))
        ws_e.cell(i, 4, st["nb_segments"])
        ws_e.cell(i, 5, st["nb_mots"])
        ws_e.cell(i, 6, round(st["confiance_moyenne"] * 100, 1) if st["confiance_moyenne"] is not None else "—")
        ws_e.cell(i, 7, _fmt_date(e.get("cree_le")))

    ws_tr = wb.create_sheet("Transcriptions")
    _entete(ws_tr, ["Entretien", "Début", "Fin", "Locuteur", "Texte"])
    r = 2
    for e in entretiens:
        for s in e.get("segments", []):
            ws_tr.cell(r, 1, e.get("titre", ""))
            ws_tr.cell(r, 2, _fmt_temps(s.get("debut", 0)))
            ws_tr.cell(r, 3, _fmt_temps(s.get("fin", 0)))
            ws_tr.cell(r, 4, (s.get("locuteur") or "").replace("SPEAKER_", "Locuteur "))
            ws_tr.cell(r, 5, s.get("texte", ""))
            r += 1
    ws_tr.column_dimensions["E"].width = 70

    if analyse:
        _feuille_analyse(wb, "Analyse transversale", analyse)
        _feuille_codebook(wb, analyse)
        _feuille_stats_qualitatives(wb, analyse, [e.get("titre", "") for e in entretiens])

    if fiabilite and fiabilite.get("details"):
        ws_f = wb.create_sheet("Fiabilité inter-codeurs")
        _entete(ws_f, ["Entretien", "Nombre de codeurs", "Kappa moyen", "Interprétation"])
        for i, d in enumerate(fiabilite["details"], start=2):
            ws_f.cell(i, 1, d["titre"])
            ws_f.cell(i, 2, d["nb_codeurs"])
            ws_f.cell(i, 3, d["kappa_moyen"])
            ws_f.cell(i, 4, _kappa_interpretation(d["kappa_moyen"]))

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
