import { useMemo, useState } from "react";
import { STATUTS, fmtDate } from "../lib/constants.js";

const PALETTE = ["#E4B04A", "#7C9CF5", "#5FC6A8", "#D96D5F", "#C48FE0"];

export default function Corpus({ corpusList, interviews, onCreer, onOpenInterview, onSelectCorpus, selectedId }) {
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");

  const enrichis = useMemo(() => {
    return corpusList.map((c, i) => {
      const membres = interviews.filter((iv) => iv.corpusId === c.id);
      const dureeSec = membres.reduce((a, m) => a + (m.dureeSec || 0), 0);
      return {
        ...c,
        couleur: PALETTE[i % PALETTE.length],
        nbEntretiens: membres.length,
        dureeMin: Math.round(dureeSec / 60),
        membres,
      };
    });
  }, [corpusList, interviews]);

  const sansCorpus = useMemo(
    () => interviews.filter((iv) => !iv.corpusId),
    [interviews]
  );

  const valider = () => {
    const n = nom.trim();
    if (!n) return;
    onCreer(n);
    setNom("");
    setCreation(false);
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
          </div>
          {selection.membres.length === 0 ? (
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
        <button className="icon-btn" onClick={() => setCreation((c) => !c)} aria-label="Nouveau corpus">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="content">
        <p className="section-intro">Regroupe tes entretiens par projet de recherche pour suivre l'avancement de chaque terrain.</p>

        {creation && (
          <div className="field-inline">
            <input className="field-input" placeholder="Nom du corpus, ex. Entrepreneuriat féminin"
              value={nom} onChange={(e) => setNom(e.target.value)} autoFocus
              onKeyDown={(e) => e.key === "Enter" && valider()} />
            <button className="btn primary sm" onClick={valider}>Créer</button>
          </div>
        )}

        {enrichis.length === 0 && !creation ? (
          <div className="empty">
            <div className="empty-badge">◫</div>
            <p className="empty-title">Aucun corpus pour l'instant</p>
            <p className="empty-sub">Crée un premier regroupement pour organiser tes terrains de recherche.</p>
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
