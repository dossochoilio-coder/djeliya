import { useEffect, useState } from "react";
import { listerGuides, creerGuide, supprimerGuide, detailGuide } from "../lib/api.js";
import { partagerFichierBinaire } from "../lib/export.js";
import { useT } from "../lib/i18n.js";
import { fmtDate } from "../lib/constants.js";
import ConfirmationCredits from "../components/ConfirmationCredits.jsx";
import ErreurAvecSignalement from "../components/ErreurAvecSignalement.jsx";

export default function GuideEntretien({ settings, token, couts, utilisateur, onExporterDocx, onOuvrirForfaits, onRetour, showToast }) {
  const { t, langue } = useT();
  const [guides, setGuides] = useState(null);
  const [selection, setSelection] = useState(null);
  const [formulaire, setFormulaire] = useState(false);
  const [confirmationSuppression, setConfirmationSuppression] = useState(null);
  const [theme, setTheme] = useState("");
  const [question, setQuestion] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState(false);

  const charger = () => listerGuides(settings.backendUrl, token).then(setGuides).catch(() => setGuides([]));
  useEffect(() => { charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sondage pendant la génération */
  useEffect(() => {
    if (!selection || selection.statut !== "en_cours") return;
    const it = setInterval(async () => {
      try {
        const d = await detailGuide(settings.backendUrl, token, selection.id);
        setSelection(d);
        if (d.statut !== "en_cours") { clearInterval(it); charger(); }
      } catch { /* nouvel essai au prochain intervalle */ }
    }, 3000);
    return () => clearInterval(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const generer = async () => {
    const th = theme.trim();
    if (!th) { showToast(t("guide.themeRequis")); return; }
    setEnvoi(true);
    try {
      const r = await creerGuide(settings.backendUrl, token, { theme: th, questionRecherche: question.trim(), langue });
      setFormulaire(false); setTheme(""); setQuestion("");
      setSelection({ id: r.id, statut: "en_cours", theme: th, question_recherche: question.trim() });
      charger();
    } catch (e) {
      showToast(e.message || "");
    } finally {
      setEnvoi(false);
    }
  };

  const relancer = (g) => {
    setTheme(g.theme || "");
    setQuestion(g.question_recherche || "");
    setSelection(null);
    setFormulaire(true);
  };

  const supprimer = async (id) => {
    try {
      await supprimerGuide(settings.backendUrl, token, id);
      setSelection(null);
      charger();
    } catch (e) {
      showToast(e.message || "");
    }
  };

  const exporter = async (id) => {
    try {
      const { blob, nomFichier } = await onExporterDocx(id);
      await partagerFichierBinaire(blob, nomFichier, selection?.theme);
    } catch (e) {
      showToast(e.message || "");
    }
  };

  /* ---------------- Vue détail ---------------- */
  if (selection) {
    const g = selection.guide;
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setSelection(null)} aria-label="Retour">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <h1 className="topbar-title truncate">{g?.titre || selection.theme}</h1>
          <span style={{ width: 36 }} />
        </header>
        <div className="content">
          {selection.statut === "en_cours" && (
            <div className="pending-card"><span className="spinner" />{t("guide.generation")}</div>
          )}
          {selection.statut === "erreur" && (
            <ErreurAvecSignalement erreur={selection.erreur} contexte="génération du guide d'entretien"
              email={utilisateur?.email} prefixe={t("guide.echec")} />
          )}

          {g && (
            <>
              <p className="note-banner" style={{ fontSize: 12 }}>⚠ {t("guide.avertissementIa")}</p>

              {g.informations_pratiques && (
                <div className="analyse-texte-card">
                  <h3 className="subsection-title">{t("guide.infosPratiques")}</h3>
                  {g.informations_pratiques.type_entretien && <p className="analyse-texte"><strong>{t("guide.type")} : </strong>{g.informations_pratiques.type_entretien}</p>}
                  {g.informations_pratiques.duree_estimee && <p className="analyse-texte"><strong>{t("guide.duree")} : </strong>{g.informations_pratiques.duree_estimee}</p>}
                  {g.informations_pratiques.population_cible && <p className="analyse-texte"><strong>{t("guide.population")} : </strong>{g.informations_pratiques.population_cible}</p>}
                  {g.informations_pratiques.materiel_recommande && <p className="analyse-texte"><strong>{t("guide.materiel")} : </strong>{g.informations_pratiques.materiel_recommande}</p>}
                </div>
              )}

              {g.preambule && (
                <div className="analyse-texte-card">
                  <h3 className="subsection-title">{t("guide.preambule")}</h3>
                  <p className="analyse-texte" style={{ fontStyle: "italic" }}>{g.preambule}</p>
                </div>
              )}

              {(g.sections || []).map((s, i) => (
                <div key={i} className="dim-card">
                  <div className="dim-head" style={{ cursor: "default" }}>
                    <span className="dim-nom">{i + 1}. {s.titre}</span>
                  </div>
                  <div className="dim-body">
                    {s.objectif && <p className="theme-desc"><strong>{t("guide.objectif")}</strong>{s.objectif}</p>}
                    {(s.questions || []).map((q, qi) => (
                      <div key={qi} className="concept-block">
                        <div className="concept-nom">{q.question}</div>
                        {(q.relances || []).length > 0 && (
                          <p className="theme-desc" style={{ fontSize: 12.5 }}>
                            {t("guide.relances")} {q.relances.join(" · ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {(g.grille_coherence || []).length > 0 && (
                <div className="analyse-texte-card">
                  <h3 className="subsection-title">{t("guide.grilleCoherence")}</h3>
                  <p className="analyse-texte" style={{ fontSize: 12.5, opacity: 0.8 }}>{t("guide.grilleCoherenceIntro")}</p>
                  {g.grille_coherence.map((item, gi) => (
                    <div key={gi} className="concept-block">
                      <div className="concept-nom">{item.question}</div>
                      <p className="theme-desc"><strong>{t("guide.dimensionVisee")} : </strong>{item.dimension_visee}</p>
                      {item.justification && <p className="theme-desc" style={{ fontSize: 12 }}>{item.justification}</p>}
                    </div>
                  ))}
                </div>
              )}

              {g.conseils_methodologiques && (
                <div className="analyse-texte-card">
                  <h3 className="subsection-title">{t("guide.conseils")}</h3>
                  <p className="analyse-texte">{g.conseils_methodologiques}</p>
                </div>
              )}

              {g.note_methodologique && (
                <div className="analyse-texte-card limites">
                  <h3 className="subsection-title">{t("guide.noteMethodologique")}</h3>
                  <p className="analyse-texte">{g.note_methodologique}</p>
                </div>
              )}

              <button className="btn primary full" onClick={() => exporter(selection.id)}>{t("guide.exporterWord")}</button>
            </>
          )}

          {selection.statut === "erreur" && (
            <button className="btn ghost full" onClick={() => relancer(selection)}>{t("guide.relancer")}</button>
          )}

          <button className="link-btn" style={{ color: "#D96D5F" }} onClick={() => supprimer(selection.id)}>{t("guide.supprimer")}</button>
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
        <h1 className="topbar-title">{t("guide.titre")}</h1>
        <button className="icon-btn" onClick={() => setFormulaire((f) => !f)} aria-label="Nouveau guide">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="content">
        {formulaire && (
          <div className="glossaire-form">
            <label className="field">
              <span className="field-label">{t("guide.theme")}</span>
              <input className="field-input" value={theme} onChange={(e) => setTheme(e.target.value)}
                placeholder={t("guide.themePlaceholder")} autoFocus />
            </label>
            <label className="field">
              <span className="field-label">{t("guide.questionRecherche")}</span>
              <input className="field-input" value={question} onChange={(e) => setQuestion(e.target.value)}
                placeholder={t("guide.questionPlaceholder")} />
            </label>
            <button className="btn primary sm" onClick={() => setConfirmation(true)} disabled={envoi || !theme.trim()}>
              {envoi ? "…" : t("guide.generer")}
            </button>
            {confirmation && (
              <ConfirmationCredits
                cout={couts?.guide_entretien ?? 1}
                solde={utilisateur?.credits}
                onAnnuler={() => setConfirmation(false)}
                onVoirForfaits={onOuvrirForfaits}
                onConfirmer={() => { setConfirmation(false); generer(); }}
              />
            )}
          </div>
        )}

        {guides === null ? (
          <div className="pending-card"><span className="spinner" />{t("admin.chargement")}</div>
        ) : guides.length === 0 && !formulaire ? (
          <div className="empty">
            <div className="empty-badge">📋</div>
            <p className="empty-title">{t("guide.videTitre")}</p>
            <p className="empty-sub">{t("guide.videSous")}</p>
            <button className="btn primary" onClick={() => setFormulaire(true)}>{t("guide.nouveauGuide")}</button>
          </div>
        ) : (
          <ul className="interview-list flush">
            {guides.map((gd) => (
              <li key={gd.id} className="guide-row-avec-action">
                <button className="interview-row" onClick={() => setSelection(gd)}>
                  <div className="row-main">
                    <span className="row-title">{gd.guide?.titre || gd.theme}</span>
                    <span className="row-meta">{fmtDate(gd.cree_le)}</span>
                  </div>
                  <span className="status-pill" style={{
                    color: gd.statut === "termine" ? "#5FC6A8" : gd.statut === "erreur" ? "#D96D5F" : "#E4B04A",
                    borderColor: gd.statut === "termine" ? "#5FC6A8" : gd.statut === "erreur" ? "#D96D5F" : "#E4B04A",
                  }}>
                    {t(`statuts.${gd.statut === "en_cours" ? "en_cours" : gd.statut === "erreur" ? "erreur" : "termine"}`)}
                  </span>
                </button>
                <button className="icon-btn sm icon-btn-danger" aria-label={t("guide.supprimer")}
                  onClick={(e) => { e.stopPropagation(); setConfirmationSuppression(gd.id); }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6m-7 0 .6 9.3a1.4 1.4 0 0 0 1.4 1.3h4a1.4 1.4 0 0 0 1.4-1.3L15 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {confirmationSuppression && (
          <div className="glossaire-form" style={{ borderColor: "#D96D5F" }}>
            <span className="field-label" style={{ color: "#D96D5F" }}>{t("guide.confirmerSuppressionTitre")}</span>
            <p className="theme-desc">{t("guide.confirmerSuppressionTexte")}</p>
            <div className="field-inline">
              <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => setConfirmationSuppression(null)}>
                {t("credits.annuler")}
              </button>
              <button className="btn sm" style={{ flex: 1, background: "#D96D5F", color: "#1A1024" }}
                onClick={() => { const id = confirmationSuppression; setConfirmationSuppression(null); supprimer(id); }}>
                {t("etudeQuant.supprimerDefinitivement")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
