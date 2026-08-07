import { useEffect, useRef, useState } from "react";
import {
  listerEtudesQuant, creerEtudeQuant, supprimerEtudeQuant, detailEtudeQuant,
  exporterDocxEtudeQuant, exporterTemplateEtudeQuant,
  listerAnalysesQuant, importerDonneesQuant, exporterDocxAnalyseQuant, exporterXlsxAnalyseQuant,
} from "../lib/api.js";
import { partagerFichierBinaire } from "../lib/export.js";
import { useT } from "../lib/i18n.js";
import { fmtDate } from "../lib/constants.js";

export default function EtudeQuantitative({ settings, token, onRetour, showToast }) {
  const { t, langue } = useT();
  const [etudes, setEtudes] = useState(null);
  const [selection, setSelection] = useState(null);
  const [analyses, setAnalyses] = useState(null);
  const [formulaire, setFormulaire] = useState(false);
  const [theme, setTheme] = useState("");
  const [question, setQuestion] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [importEnCours, setImportEnCours] = useState(false);
  const fileRef = useRef(null);

  const charger = () => listerEtudesQuant(settings.backendUrl, token).then(setEtudes).catch(() => setEtudes([]));
  useEffect(() => { charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sondage pendant la génération */
  useEffect(() => {
    if (!selection || selection.statut !== "en_cours") return;
    const it = setInterval(async () => {
      try {
        const d = await detailEtudeQuant(settings.backendUrl, token, selection.id);
        setSelection(d);
        if (d.statut !== "en_cours") { clearInterval(it); charger(); }
      } catch { /* nouvel essai au prochain intervalle */ }
    }, 3000);
    return () => clearInterval(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const ouvrirEtude = (e) => {
    setSelection(e);
    setAnalyses(null);
    if (e.statut === "termine") {
      listerAnalysesQuant(settings.backendUrl, token, e.id).then(setAnalyses).catch(() => setAnalyses([]));
    }
  };

  const generer = async () => {
    const th = theme.trim();
    if (!th) { showToast(t("etudeQuant.themeRequis")); return; }
    setEnvoi(true);
    try {
      const r = await creerEtudeQuant(settings.backendUrl, token, { theme: th, questionRecherche: question.trim(), langue });
      setFormulaire(false); setTheme(""); setQuestion("");
      setSelection({ id: r.id, statut: "en_cours", theme: th, question_recherche: question.trim() });
      charger();
    } catch (e) {
      showToast(e.message || "");
    } finally {
      setEnvoi(false);
    }
  };

  const relancer = (e) => {
    setTheme(e.theme || "");
    setQuestion(e.question_recherche || "");
    setSelection(null);
    setFormulaire(true);
  };

  const supprimer = async (id) => {
    try {
      await supprimerEtudeQuant(settings.backendUrl, token, id);
      setSelection(null);
      charger();
    } catch (e) {
      showToast(e.message || "");
    }
  };

  const exporterWord = async () => {
    try {
      const { blob, nomFichier } = await exporterDocxEtudeQuant(settings.backendUrl, token, selection.id);
      await partagerFichierBinaire(blob, nomFichier, selection.theme);
    } catch (e) {
      showToast(e.message || "");
    }
  };

  const telechargerGabarit = async () => {
    try {
      const { blob, nomFichier } = await exporterTemplateEtudeQuant(settings.backendUrl, token, selection.id);
      await partagerFichierBinaire(blob, nomFichier, selection.theme);
    } catch (e) {
      showToast(e.message || "");
    }
  };

  const importerDonnees = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setImportEnCours(true);
    try {
      const resultat = await importerDonneesQuant(settings.backendUrl, token, selection.id, fichier);
      if (resultat.statut === "erreur") {
        showToast(t("etudeQuant.analyseEchec") + (resultat.erreur || ""));
      } else {
        showToast("✓");
      }
      listerAnalysesQuant(settings.backendUrl, token, selection.id).then(setAnalyses).catch(() => {});
    } catch (err) {
      showToast(err.message || "");
    } finally {
      setImportEnCours(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const exporterAnalyse = async (analyseId, format) => {
    try {
      const fn = format === "docx" ? exporterDocxAnalyseQuant : exporterXlsxAnalyseQuant;
      const { blob, nomFichier } = await fn(settings.backendUrl, token, selection.id, analyseId);
      await partagerFichierBinaire(blob, nomFichier, selection.theme);
    } catch (e) {
      showToast(e.message || "");
    }
  };

  /* ---------------- Vue détail ---------------- */
  if (selection) {
    const c = selection.contenu;
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setSelection(null)} aria-label="Retour">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <h1 className="topbar-title truncate">{c?.titre || selection.theme}</h1>
          <span style={{ width: 36 }} />
        </header>
        <div className="content">
          {selection.statut === "en_cours" && (
            <div className="pending-card"><span className="spinner" />{t("etudeQuant.generation")}</div>
          )}
          {selection.statut === "erreur" && (
            <>
              <p className="note-banner err">{t("etudeQuant.echec")}{selection.erreur || "—"}</p>
              <button className="btn ghost full" onClick={() => relancer(selection)}>{t("etudeQuant.relancer")}</button>
            </>
          )}

          {c && (
            <>
              <p className="note-banner" style={{ fontSize: 12 }}>⚠ {t("guide.avertissementIa")}</p>

              {c.cadre_theorique && (
                <div className="analyse-texte-card">
                  <h3 className="subsection-title">{t("etudeQuant.cadreTheorique")}</h3>
                  <p className="analyse-texte">{c.cadre_theorique}</p>
                </div>
              )}
              {c.revue_litterature && (
                <div className="analyse-texte-card">
                  <h3 className="subsection-title">{t("etudeQuant.revueLitterature")}</h3>
                  <p className="analyse-texte">{c.revue_litterature}</p>
                </div>
              )}

              {c.methodologie && (
                <div className="dim-card">
                  <div className="dim-head" style={{ cursor: "default" }}>
                    <span className="dim-nom">{t("etudeQuant.methodologie")}</span>
                  </div>
                  <div className="dim-body">
                    {c.methodologie.type_etude && <p className="theme-desc"><strong>{t("etudeQuant.typeEtude")} : </strong>{c.methodologie.type_etude}</p>}
                    {c.methodologie.population_cible && <p className="theme-desc"><strong>{t("etudeQuant.population")} : </strong>{c.methodologie.population_cible}</p>}
                    {c.methodologie.echantillon && <p className="theme-desc"><strong>{t("etudeQuant.echantillon")} : </strong>{c.methodologie.echantillon}</p>}
                    {(c.methodologie.hypotheses || []).length > 0 && (
                      <>
                        <p className="theme-desc" style={{ fontWeight: 700, marginTop: 8 }}>{t("etudeQuant.hypotheses")}</p>
                        {c.methodologie.hypotheses.map((h, i) => (
                          <p key={i} className="theme-desc"><strong>{h.code} : </strong>{h.enonce}</p>
                        ))}
                      </>
                    )}
                    {(c.methodologie.variables || []).length > 0 && (
                      <>
                        <p className="theme-desc" style={{ fontWeight: 700, marginTop: 8 }}>{t("etudeQuant.variables")}</p>
                        {c.methodologie.variables.map((v, i) => (
                          <p key={i} className="theme-desc"><strong>{v.nom}</strong> ({v.type}) — {v.definition}</p>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}

              {c.questionnaire?.sections?.length > 0 && (
                <div className="dim-card">
                  <div className="dim-head" style={{ cursor: "default" }}>
                    <span className="dim-nom">{t("etudeQuant.questionnaire")}</span>
                  </div>
                  <div className="dim-body">
                    {c.questionnaire.sections.map((s, i) => (
                      <div key={i} className="concept-block">
                        <div className="concept-nom">{s.titre}</div>
                        {(s.items || []).map((item, ii) => (
                          <p key={ii} className="theme-desc">[{item.code}] {item.libelle}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {c.note_methodologique && (
                <div className="analyse-texte-card limites">
                  <h3 className="subsection-title">{t("etudeQuant.noteMethodologique")}</h3>
                  <p className="analyse-texte">{c.note_methodologique}</p>
                </div>
              )}

              <button className="btn primary full" onClick={exporterWord}>{t("etudeQuant.exporterWord")}</button>
              <button className="btn ghost full" onClick={telechargerGabarit}>{t("etudeQuant.telechargerGabarit")}</button>

              <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={importerDonnees} />
              <button className="btn ghost full" onClick={() => fileRef.current?.click()} disabled={importEnCours}>
                {importEnCours ? t("etudeQuant.analyseEnCours") : t("etudeQuant.importerDonnees")}
              </button>

              {analyses && analyses.length > 0 && (
                <>
                  <h2 className="subsection-title">{t("etudeQuant.historiqueAnalyses")}</h2>
                  {analyses.map((a) => (
                    <AnalyseResume key={a.id} analyse={a} onExporter={exporterAnalyse} showToast={showToast} />
                  ))}
                </>
              )}
            </>
          )}

          <button className="link-btn" style={{ color: "#D96D5F" }} onClick={() => supprimer(selection.id)}>{t("etudeQuant.supprimer")}</button>
        </div>
      </div>
    );
  }

  /* ---------------- Vue liste ---------------- */
  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onRetour} aria-label="Retour">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="topbar-title">{t("etudeQuant.titre")}</h1>
        <button className="icon-btn" onClick={() => setFormulaire((f) => !f)} aria-label="Nouvelle étude">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="content">
        {formulaire && (
          <div className="glossaire-form">
            <label className="field">
              <span className="field-label">{t("etudeQuant.theme")}</span>
              <input className="field-input" value={theme} onChange={(e) => setTheme(e.target.value)}
                placeholder={t("etudeQuant.themePlaceholder")} autoFocus />
            </label>
            <label className="field">
              <span className="field-label">{t("etudeQuant.questionRecherche")}</span>
              <input className="field-input" value={question} onChange={(e) => setQuestion(e.target.value)}
                placeholder={t("etudeQuant.questionPlaceholder")} />
            </label>
            <button className="btn primary sm" onClick={generer} disabled={envoi || !theme.trim()}>
              {envoi ? "…" : t("etudeQuant.generer")}
            </button>
          </div>
        )}

        {etudes === null ? (
          <div className="pending-card"><span className="spinner" />{t("admin.chargement")}</div>
        ) : etudes.length === 0 && !formulaire ? (
          <div className="empty">
            <div className="empty-badge">📊</div>
            <p className="empty-title">{t("etudeQuant.videTitre")}</p>
            <p className="empty-sub">{t("etudeQuant.videSous")}</p>
            <button className="btn primary" onClick={() => setFormulaire(true)}>{t("etudeQuant.nouvelleEtude")}</button>
          </div>
        ) : (
          <ul className="interview-list flush">
            {etudes.map((e) => (
              <li key={e.id} className="guide-row-avec-action">
                <button className="interview-row" onClick={() => ouvrirEtude(e)}>
                  <div className="row-main">
                    <span className="row-title">{e.contenu?.titre || e.theme}</span>
                    <span className="row-meta">{fmtDate(e.cree_le)}</span>
                  </div>
                  <span className="status-pill" style={{
                    color: e.statut === "termine" ? "#5FC6A8" : e.statut === "erreur" ? "#D96D5F" : "#E4B04A",
                    borderColor: e.statut === "termine" ? "#5FC6A8" : e.statut === "erreur" ? "#D96D5F" : "#E4B04A",
                  }}>
                    {t(`statuts.${e.statut === "en_cours" ? "en_cours" : e.statut === "erreur" ? "erreur" : "termine"}`)}
                  </span>
                </button>
                <button className="icon-btn sm" aria-label={t("etudeQuant.supprimer")}
                  onClick={(ev) => { ev.stopPropagation(); supprimer(e.id); }}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AnalyseResume({ analyse, onExporter }) {
  const { t } = useT();
  const r = analyse.resultats;

  if (analyse.statut === "erreur") {
    return <p className="note-banner err">{t("etudeQuant.analyseEchec")}{analyse.erreur || "—"}</p>;
  }
  if (!r) return null;

  return (
    <div className="dim-card">
      <div className="dim-head" style={{ cursor: "default" }}>
        <span className="dim-nom">{fmtDate(analyse.cree_le)} — {r.n_repondants} {t("etudeQuant.nRepondants")}</span>
      </div>
      <div className="dim-body">
        {r.fiabilite?.length > 0 && (
          <>
            <p className="theme-desc" style={{ fontWeight: 700 }}>{t("etudeQuant.fiabilite")}</p>
            {r.fiabilite.map((f, i) => (
              <p key={i} className="theme-desc">{f.variable} — α = {f.alpha_cronbach ?? "—"} ({f.interpretation})</p>
            ))}
          </>
        )}
        {r.correlations?.length > 0 && (
          <>
            <p className="theme-desc" style={{ fontWeight: 700, marginTop: 8 }}>{t("etudeQuant.correlations")}</p>
            {r.correlations.map((c, i) => (
              <p key={i} className="theme-desc">
                {c.variable_1} × {c.variable_2} : r = {c.r} ({c.methode}, p = {c.p_valeur}) — {c.interpretation}
              </p>
            ))}
          </>
        )}
        <div className="field-inline" style={{ marginTop: 10 }}>
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => onExporter(analyse.id, "docx")}>Word</button>
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => onExporter(analyse.id, "xlsx")}>Excel</button>
        </div>
      </div>
    </div>
  );
}
