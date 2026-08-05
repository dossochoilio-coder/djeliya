import { useEffect, useMemo, useState } from "react";
import { STATUTS, fmtDate } from "../lib/constants.js";
import AnalyseView from "../components/AnalyseView.jsx";

const PALETTE = ["#E4B04A", "#7C9CF5", "#5FC6A8", "#D96D5F", "#C48FE0"];

export default function Corpus({ corpusList, interviews, onCreer, onRejoindre, onOpenInterview, onSelectCorpus, selectedId, corpusDetail, methodes, onLancerAnalyse, onExporterDocx, onExporterXlsx, showToast }) {
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");
  const [rejoindre, setRejoindre] = useState(false);
  const [code, setCode] = useState("");
  const [vue, setVue] = useState("entretiens");

  useEffect(() => { setVue("entretiens"); }, [selectedId]);

  const enrichis = useMemo(() => {
    return corpusList.map((c, i) => {
      const membres = interviews.filter((iv) => iv.corpusId === c.id);
      const termines = membres.filter((iv) => iv.statut === "termine");
      const dureeSec = membres.reduce((a, m) => a + (m.dureeSec || 0), 0);
      return {
        ...c,
        couleur: PALETTE[i % PALETTE.length],
        nbEntretiens: membres.length,
        nbTermines: termines.length,
        dureeMin: Math.round(dureeSec / 60),
        membres,
      };
    });
  }, [corpusList, interviews]);

  const sansCorpus = useMemo(
    () => interviews.filter((iv) => !iv.corpusId),
    [interviews]
  );

  const validerCreation = async () => {
    const n = nom.trim();
    if (!n) return;
    await onCreer(n);
    setNom("");
    setCreation(false);
  };

  const validerRejoindre = async () => {
    const c = code.trim();
    if (!c) return;
    try {
      await onRejoindre(c);
      setCode("");
      setRejoindre(false);
    } catch (e) {
      showToast(e.message || "Code invalide");
    }
  };

  const selection = selectedId ? enrichis.find((c) => c.id === selectedId) : null;

  if (selection) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={() => onSelectCorpus(null)} aria-label="Retour">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <h1 className="topbar-title truncate">{selection.nom}</h1>
          <span style={{ width: 36 }} />
        </header>
        <div className="content">
          <div className="stat-strip">
            <div className="stat-chip">
              <span className="stat-num" style={{ color: selection.couleur }}>{selection.nbEntretiens}</span>
              <span className="stat-label">entretien{selection.nbEntretiens > 1 ? "s" : ""}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-num" style={{ color: selection.couleur }}>{selection.dureeMin}</span>
              <span className="stat-label">minutes au total</span>
            </div>
            <div className="stat-chip">
              <span className="stat-num" style={{ color: selection.couleur }}>{selection.nb_membres}</span>
              <span className="stat-label">chercheur{selection.nb_membres > 1 ? "s" : ""}</span>
            </div>
          </div>

          {selection.nbEntretiens > selection.nbTermines && (
            <p className="field-help">
              {selection.nbTermines} sur {selection.nbEntretiens} entretien{selection.nbEntretiens > 1 ? "s" : ""} réellement
              terminé{selection.nbTermines > 1 ? "s" : ""} — seuls ceux-ci comptent pour l'analyse transversale.
            </p>
          )}

          {selection.code_invitation && (
            <button className="corpus-inline" onClick={() => {
              navigator.clipboard.writeText(selection.code_invitation);
              showToast("Code copié — partage-le à ton équipe");
            }}>
              Code d'invitation : <span className="mono">{selection.code_invitation}</span>
              <span className="corpus-inline-edit">copier</span>
            </button>
          )}

          {selection.nbTermines >= 2 && (
            <div className="vue-switch">
              <button className={"vue-opt" + (vue === "entretiens" ? " vue-actif" : "")}
                onClick={() => setVue("entretiens")}>Entretiens</button>
              <button className={"vue-opt" + (vue === "analyse" ? " vue-actif" : "")}
                onClick={() => setVue("analyse")}>Analyse transversale</button>
            </div>
          )}

          {vue === "analyse" && selection.nbTermines >= 2 ? (
            <>
              <AnalyseView
                sujet={corpusDetail || {}}
                methodes={methodes}
                onLancer={onLancerAnalyse}
              />
              {corpusDetail?.analyse_statut === "termine" && (
                <div className="field-inline">
                  <button className="btn ghost sm" style={{ flex: 1 }}
                    onClick={() => onExporterDocx(selection.id, selection.nom)}>Exporter en Word</button>
                  <button className="btn ghost sm" style={{ flex: 1 }}
                    onClick={() => onExporterXlsx(selection.id, selection.nom)}>Exporter en Excel</button>
                </div>
              )}
            </>
          ) : selection.membres.length === 0 ? (
            <p className="note-banner">Aucun entretien dans ce corpus pour l'instant. Assigne-le depuis la fiche d'un entretien.</p>
          ) : (
            <ul className="interview-list flush">
              {selection.membres.map((iv) => {
                const st = STATUTS[iv.statut] || STATUTS.brouillon;
                return (
                  <li key={iv.id}>
                    <button className="interview-row" onClick={() => onOpenInterview(iv.id)}>
                      <div className="row-main">
                        <span className="row-title">{iv.titre}</span>
                        <span className="row-meta">{fmtDate(iv.creeLe)}{iv.duree ? ` · ${iv.duree}` : ""}</span>
                      </div>
                      <span className="status-pill" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar-title left">Corpus</h1>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="icon-btn" onClick={() => { setRejoindre((r) => !r); setCreation(false); }} aria-label="Rejoindre un corpus">
            <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" stroke="currentColor" strokeWidth="1.4" /><path d="M4 17c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </button>
          <button className="icon-btn" onClick={() => { setCreation((c) => !c); setRejoindre(false); }} aria-label="Nouveau corpus">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      <div className="content">
        <p className="section-intro">Regroupe tes entretiens par projet de recherche, et invite ton équipe à coder les mêmes corpus.</p>

        {rejoindre && (
          <div className="field-inline">
            <input className="field-input mono" placeholder="Code d'invitation" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus
              onKeyDown={(e) => e.key === "Enter" && validerRejoindre()} />
            <button className="btn primary sm" onClick={validerRejoindre}>Rejoindre</button>
          </div>
        )}

        {creation && (
          <div className="field-inline">
            <input className="field-input" placeholder="Nom du corpus, ex. Entrepreneuriat féminin"
              value={nom} onChange={(e) => setNom(e.target.value)} autoFocus
              onKeyDown={(e) => e.key === "Enter" && validerCreation()} />
            <button className="btn primary sm" onClick={validerCreation}>Créer</button>
          </div>
        )}

        {enrichis.length === 0 && !creation && !rejoindre ? (
          <div className="empty">
            <div className="empty-badge">◫</div>
            <p className="empty-title">Aucun corpus pour l'instant</p>
            <p className="empty-sub">Crée un premier regroupement, ou rejoins celui d'un collègue avec son code.</p>
            <button className="btn primary" onClick={() => setCreation(true)}>Créer un corpus</button>
          </div>
        ) : (
          <ul className="corpus-list">
            {enrichis.map((c) => (
              <li key={c.id}>
                <button className="corpus-card" onClick={() => onSelectCorpus(c.id)}>
                  <span className="corpus-bar" style={{ background: c.couleur }} />
                  <div className="corpus-info">
                    <span className="corpus-nom">{c.nom}</span>
                    <span className="corpus-meta">
                      {c.nbEntretiens} entretien{c.nbEntretiens !== 1 ? "s" : ""}
                      {c.dureeMin > 0 ? ` · ${c.dureeMin} min` : ""}
                      {c.nb_membres > 1 ? ` · ${c.nb_membres} chercheurs` : ""}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {sansCorpus.length > 0 && (
          <div className="unassigned-note">
            {sansCorpus.length} entretien{sansCorpus.length > 1 ? "s" : ""} sans corpus assigné.
          </div>
        )}
      </div>
    </div>
  );
}
