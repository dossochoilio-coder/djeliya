import { useEffect, useRef, useState } from "react";
import {
  listerEtudesQuant, creerEtudeQuant, supprimerEtudeQuant, detailEtudeQuant,
  exporterDocxEtudeQuant, exporterTemplateEtudeQuant,
  listerAnalysesQuant, importerDonneesQuant, exporterDocxAnalyseQuant, exporterXlsxAnalyseQuant,
} from "../lib/api.js";
import { partagerFichierBinaire } from "../lib/export.js";
import { useT } from "../lib/i18n.js";
import { fmtDate } from "../lib/constants.js";
import ConfirmationCredits from "../components/ConfirmationCredits.jsx";
import ErreurAvecSignalement from "../components/ErreurAvecSignalement.jsx";

export default function EtudeQuantitative({ settings, token, couts, utilisateur, onOuvrirForfaits, onRetour, showToast }) {
  const { t, langue } = useT();
  const [etudes, setEtudes] = useState(null);
  const [selection, setSelection] = useState(null);
  const [analyses, setAnalyses] = useState(null);
  const [formulaire, setFormulaire] = useState(false);
  const [theme, setTheme] = useState("");
  const [question, setQuestion] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [importEnCours, setImportEnCours] = useState(false);
  const [confirmationGeneration, setConfirmationGeneration] = useState(false);
  const [confirmationImport, setConfirmationImport] = useState(false);
  const fileRef = useRef(null);

  const charger = () => listerEtudesQuant(settings.backendUrl, token).then(setEtudes).catch(() => setEtudes([]));
  useEffect(() => { charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sondage pendant la génération — un appel immédiat pour éviter le message
     générique le temps du premier intervalle, puis toutes les 3 secondes */
  useEffect(() => {
    if (!selection || selection.statut !== "en_cours") return;
    let annule = false;
    const sonder = async () => {
      try {
        const d = await detailEtudeQuant(settings.backendUrl, token, selection.id);
        if (annule) return;
        setSelection(d);
        if (d.statut !== "en_cours") charger();
      } catch { /* nouvel essai au prochain intervalle */ }
    };
    if (!selection.etape) sonder();
    // Sondage rapide (0,7 s) pendant la génération, pour donner une vraie
    // impression d'écriture en direct plutôt que des sauts de texte visibles.
    const it = setInterval(sonder, 700);
    return () => { annule = true; clearInterval(it); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  /* Sondage des analyses tant qu'au moins une synthèse interprétative est en
     cours de génération — les statistiques, elles, sont déjà affichées
     immédiatement ; seule la synthèse arrive après coup. */
  useEffect(() => {
    if (!selection || !analyses?.some((a) => a.synthese_statut === "en_cours")) return;
    let annule = false;
    const it = setInterval(async () => {
      try {
        const d = await listerAnalysesQuant(settings.backendUrl, token, selection.id);
        if (!annule) setAnalyses(d);
      } catch { /* nouvel essai au prochain intervalle */ }
    }, 1500);
    return () => { annule = true; clearInterval(it); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, analyses]);

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
            <>
              <div className="pending-card">
                <span className="spinner" />
                {selection.etape === "cadre" ? t("etudeQuant.etapeCadre")
                  : selection.etape === "revue" ? t("etudeQuant.etapeRevue")
                  : selection.etape === "methodologie" ? t("etudeQuant.etapeMethodologie")
                  : selection.etape?.startsWith("questionnaire:")
                    ? `${t("etudeQuant.etapeQuestionnaire").replace("…", "")} (section ${selection.etape.split(":")[1]})…`
                  : selection.etape === "questionnaire" ? t("etudeQuant.etapeQuestionnaire")
                  : selection.etape === "references" ? t("etudeQuant.etapeReferences")
                  : t("etudeQuant.generation")}
              </div>
              {selection.texte_en_cours && (
                <div className="analyse-texte-card" style={{ maxHeight: 180, overflowY: "auto" }}>
                  <p className="analyse-texte" style={{ fontFamily: "monospace", fontSize: 12.5, whiteSpace: "pre-wrap" }}>
                    {selection.texte_en_cours}
                    <span className="curseur-clignotant">▌</span>
                  </p>
                </div>
              )}
            </>
          )}
          {selection.statut === "erreur" && (
            <>
              <ErreurAvecSignalement erreur={selection.erreur} contexte="génération de l'étude quantitative"
                email={utilisateur?.email} prefixe={t("etudeQuant.echec")} />
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

              {(c.references_apa?.methodologie?.length > 0 || c.references_apa?.concepts_a_referencer?.length > 0) && (
                <div className="analyse-texte-card">
                  <h3 className="subsection-title">{t("etudeQuant.references")}</h3>
                  {c.references_apa.methodologie?.length > 0 && (
                    <>
                      <p className="theme-desc" style={{ fontWeight: 700 }}>{t("etudeQuant.referencesMethodo")}</p>
                      {c.references_apa.methodologie.map((ref, i) => (
                        <p key={i} className="analyse-texte" style={{ fontSize: 12.5 }}>{ref}</p>
                      ))}
                    </>
                  )}
                  {c.references_apa.concepts_a_referencer?.length > 0 && (
                    <>
                      <p className="theme-desc" style={{ fontWeight: 700, marginTop: 10 }}>{t("etudeQuant.referencesConcepts")}</p>
                      {c.references_apa.concepts_a_referencer.map((concept, i) => (
                        <p key={i} className="analyse-texte" style={{ fontSize: 12.5 }}>{concept.concept} — {concept.auteur_associe}</p>
                      ))}
                    </>
                  )}
                </div>
              )}

              <button className="btn primary full" onClick={exporterWord}>{t("etudeQuant.exporterWord")}</button>
              <button className="btn ghost full" onClick={telechargerGabarit}>{t("etudeQuant.telechargerGabarit")}</button>

              <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={importerDonnees} />
              <button className="btn ghost full" onClick={() => setConfirmationImport(true)} disabled={importEnCours}>
                {importEnCours ? t("etudeQuant.analyseEnCours") : t("etudeQuant.importerDonnees")}
              </button>
              {confirmationImport && (
                <ConfirmationCredits
                  cout={couts?.analyse_quantitative ?? 2}
                  solde={utilisateur?.credits}
                  onAnnuler={() => setConfirmationImport(false)}
                  onVoirForfaits={onOuvrirForfaits}
                  onConfirmer={() => { setConfirmationImport(false); fileRef.current?.click(); }}
                />
              )}

              {analyses && analyses.length > 0 && (
                <>
                  <h2 className="subsection-title">{t("etudeQuant.historiqueAnalyses")}</h2>
                  {analyses.map((a) => (
                    <AnalyseResume key={a.id} analyse={a} onExporter={exporterAnalyse} email={utilisateur?.email} />
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
            <button className="btn primary sm" onClick={() => setConfirmationGeneration(true)} disabled={envoi || !theme.trim()}>
              {envoi ? "…" : t("etudeQuant.generer")}
            </button>
            {confirmationGeneration && (
              <ConfirmationCredits
                cout={couts?.etude_quantitative ?? 3}
                solde={utilisateur?.credits}
                onAnnuler={() => setConfirmationGeneration(false)}
                onVoirForfaits={onOuvrirForfaits}
                onConfirmer={() => { setConfirmationGeneration(false); generer(); }}
              />
            )}
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

function AnalyseResume({ analyse, onExporter, email }) {
  const { t } = useT();
  const r = analyse.resultats;

  if (analyse.statut === "erreur") {
    return <ErreurAvecSignalement erreur={analyse.erreur} contexte="analyse quantitative des données importées"
      email={email} prefixe={t("etudeQuant.analyseEchec")} />;
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

        {analyse.synthese_statut === "en_cours" && (
          <div className="pending-card" style={{ marginTop: 10 }}>
            <span className="spinner" />{t("etudeQuant.syntheseEnCours")}
          </div>
        )}
        {analyse.synthese_statut === "termine" && analyse.synthese_interpretative && (
          <div className="analyse-texte-card" style={{ marginTop: 10 }}>
            <h3 className="subsection-title">{t("etudeQuant.syntheseTitre")}</h3>
            <p className="analyse-texte">{analyse.synthese_interpretative.synthese_generale}</p>
            {analyse.synthese_interpretative.tests_hypotheses?.map((th, i) => (
              <p key={i} className="theme-desc" style={{ marginTop: 6 }}>
                <strong>{th.code}</strong> — {th.verdict}
              </p>
            ))}
          </div>
        )}
        {analyse.synthese_statut === "non_disponible" && (
          <p className="note-banner" style={{ marginTop: 10, fontSize: 12 }}>{t("etudeQuant.syntheseIndisponible")}</p>
        )}
        <div className="field-inline" style={{ marginTop: 10 }}>
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => onExporter(analyse.id, "docx")}>Word</button>
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => onExporter(analyse.id, "xlsx")}>Excel</button>
        </div>
      </div>
    </div>
  );
}
