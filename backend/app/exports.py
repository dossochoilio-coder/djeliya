"""
Génération des exports Word (.docx) et Excel (.xlsx) des transcriptions et
analyses qualitatives de Djeliya, avec données statistiques dans l'Excel.
"""

import io
from datetime import datetime

from docx import Document
from docx.shared import Pt, RGBColor
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

OR_HEX = "E4B04A"


def _fmt_temps(secondes: float) -> str:
    m, s = divmod(int(secondes or 0), 60)
    return f"{m:02d}:{s:02d}"


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


# ----------------------------------------------------------------- Word
def generer_docx_entretien(entretien: dict) -> io.BytesIO:
    doc = Document()

    titre = doc.add_heading(entretien.get("titre") or "Entretien", level=0)
    titre.runs[0].font.color.rgb = RGBColor(0x1B, 0x15, 0x03)

    meta = doc.add_paragraph()
    meta.add_run(
        f"Langue détectée : {entretien.get('langue_detectee') or entretien.get('langue') or '—'}  ·  "
        f"Exporté le {datetime.now().strftime('%d/%m/%Y à %H:%M')}"
    ).italic = True

    doc.add_heading("Transcription", level=1)
    for s in entretien.get("segments", []):
        p = doc.add_paragraph()
        tc = p.add_run(f"[{_fmt_temps(s.get('debut', 0))}] ")
        tc.bold = True
        tc.font.color.rgb = RGBColor(0xB0, 0x7A, 0x1E)
        if s.get("locuteur"):
            loc = p.add_run(f"{s['locuteur'].replace('SPEAKER_', 'Locuteur ')} — ")
            loc.bold = True
        p.add_run(s.get("texte", ""))

    analyse = entretien.get("analyse")
    if analyse:
        doc.add_heading("Analyse qualitative", level=1)
        methode_label = entretien.get("analyse_methode") or "—"
        doc.add_paragraph(f"Méthode : {methode_label}  ·  Modèle : {entretien.get('analyse_modele') or '—'}").italic = True

        if analyse.get("demarche_methodologique"):
            doc.add_heading("Démarche méthodologique", level=2)
            doc.add_paragraph(analyse["demarche_methodologique"])

        themes_par_nom = {t["theme"]: t for t in analyse.get("second_ordre", [])}
        concepts_par_nom = {c["concept"]: c for c in analyse.get("premier_ordre", [])}

        def _ecrire_theme(theme):
            doc.add_heading(theme["theme"], level=3)
            if theme.get("description"):
                doc.add_paragraph(theme["description"])
            for nom_c in theme.get("concepts_lies", []):
                c = concepts_par_nom.get(nom_c)
                if not c:
                    continue
                doc.add_paragraph(c["concept"], style="List Bullet")
                for v in c.get("verbatims", []):
                    vp = doc.add_paragraph(style="List Bullet 2")
                    vp.add_run(f"« {v.get('texte', '')} » ").italic = True
                    vp.add_run(f"[{_fmt_temps(v.get('debut', 0))}]").font.size = Pt(9)

        dimensions = analyse.get("dimensions_agregees") or []
        if dimensions:
            for dim in dimensions:
                doc.add_heading(dim["dimension"], level=2)
                for nom_t in dim.get("themes_lies", []):
                    t = themes_par_nom.get(nom_t)
                    if t:
                        _ecrire_theme(t)
        else:
            for t in analyse.get("second_ordre", []):
                _ecrire_theme(t)

        if analyse.get("synthese"):
            doc.add_heading("Synthèse interprétative", level=2)
            doc.add_paragraph(analyse["synthese"])
        if analyse.get("limites"):
            doc.add_heading("Limites de l'analyse automatique", level=2)
            p = doc.add_paragraph(analyse["limites"])
            for run in p.runs:
                run.italic = True

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
        ws_a = wb.create_sheet("Analyse")
        _entete(ws_a, ["Niveau", "Libellé", "Détail / verbatim", "Horodatage"])
        r = 2
        for c in analyse.get("premier_ordre", []):
            for v in c.get("verbatims", []) or [{}]:
                ws_a.cell(r, 1, "Premier ordre")
                ws_a.cell(r, 2, c.get("concept", ""))
                ws_a.cell(r, 3, v.get("texte", ""))
                ws_a.cell(r, 4, _fmt_temps(v.get("debut", 0)) if v else "")
                r += 1
        for t in analyse.get("second_ordre", []):
            ws_a.cell(r, 1, "Second ordre")
            ws_a.cell(r, 2, t.get("theme", ""))
            ws_a.cell(r, 3, t.get("description", ""))
            r += 1
        for d in analyse.get("dimensions_agregees", []) or []:
            ws_a.cell(r, 1, "Dimension agrégée")
            ws_a.cell(r, 2, d.get("dimension", ""))
            ws_a.cell(r, 3, ", ".join(d.get("themes_lies", [])))
            r += 1
        ws_a.column_dimensions["C"].width = 60

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ----------------------------------------------------------------- corpus (analyse transversale)
def generer_docx_corpus(corpus_nom: str, analyse: dict, nb_entretiens: int) -> io.BytesIO:
    faux_entretien = {
        "titre": f"Corpus — {corpus_nom}", "segments": [], "analyse": analyse,
        "analyse_methode": None, "analyse_modele": None,
    }
    return generer_docx_entretien(faux_entretien)


def generer_xlsx_corpus(corpus_nom: str, analyse: dict, entretiens: list) -> io.BytesIO:
    wb = Workbook()
    ws_s = wb.active
    ws_s.title = "Statistiques"
    _entete(ws_s, ["Indicateur", "Valeur"])
    duree_totale = sum(_stats_segments(e.get("segments", []))["duree_sec"] for e in entretiens)
    ws_s.cell(2, 1, "Corpus").font = Font(bold=True); ws_s.cell(2, 2, corpus_nom)
    ws_s.cell(3, 1, "Nombre d'entretiens analysés").font = Font(bold=True); ws_s.cell(3, 2, len(entretiens))
    ws_s.cell(4, 1, "Durée cumulée").font = Font(bold=True); ws_s.cell(4, 2, _fmt_temps(duree_totale))

    ws_e = wb.create_sheet("Entretiens")
    _entete(ws_e, ["Titre", "Durée", "Segments", "Fiabilité moyenne (%)"])
    for i, e in enumerate(entretiens, start=2):
        st = _stats_segments(e.get("segments", []))
        ws_e.cell(i, 1, e.get("titre", ""))
        ws_e.cell(i, 2, _fmt_temps(st["duree_sec"]))
        ws_e.cell(i, 3, st["nb_segments"])
        ws_e.cell(i, 4, round(st["confiance_moyenne"] * 100, 1) if st["confiance_moyenne"] is not None else "—")

    if analyse:
        ws_a = wb.create_sheet("Analyse transversale")
        _entete(ws_a, ["Niveau", "Libellé", "Détail / verbatim", "Entretien", "Horodatage"])
        r = 2
        for c in analyse.get("premier_ordre", []):
            for v in c.get("verbatims", []) or [{}]:
                ws_a.cell(r, 1, "Premier ordre")
                ws_a.cell(r, 2, c.get("concept", ""))
                ws_a.cell(r, 3, v.get("texte", ""))
                ws_a.cell(r, 4, v.get("entretien", ""))
                ws_a.cell(r, 5, _fmt_temps(v.get("debut", 0)) if v else "")
                r += 1
        for t in analyse.get("second_ordre", []):
            ws_a.cell(r, 1, "Second ordre")
            ws_a.cell(r, 2, t.get("theme", ""))
            ws_a.cell(r, 3, t.get("description", ""))
            r += 1
        for d in analyse.get("dimensions_agregees", []) or []:
            ws_a.cell(r, 1, "Dimension agrégée")
            ws_a.cell(r, 2, d.get("dimension", ""))
            ws_a.cell(r, 3, ", ".join(d.get("themes_lies", [])))
            r += 1
        ws_a.column_dimensions["C"].width = 60

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
