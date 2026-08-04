import { useMemo, useState } from "react";
import { STATUTS, fmtDate } from "../lib/constants.js";
import logo from "../assets/logo-full.png";

export default function Accueil({ interviews, onOpen, onNouveau, backendOk }) {
  const [query, setQuery] = useState("");

  const filtres = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? interviews.filter((i) => i.titre.toLowerCase().includes(q))
      : interviews;
    return [...list].sort((a, b) => new Date(b.creeLe) - new Date(a.creeLe));
  }, [interviews, query]);

  return (
    <div className="screen accueil">
      <header className="topbar hero">
        <span className="kora-cordes" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => <span key={i} />)}
        </span>
        <img src={logo} alt="Djeliya" className="brand-logo" />
      </header>

      {backendOk === false && (
        <p className="warn-bar">Serveur non connecté — configure-le dans l'onglet Réglages</p>
      )}

      <div className="list-tools">
        <input className="search" type="search" placeholder="Rechercher un entretien…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {filtres.length === 0 ? (
        <div className="empty">
          <div className="empty-badge">◎</div>
          <p className="empty-title">Aucun entretien pour l'instant</p>
          <p className="empty-sub">Enregistre ta première conversation de terrain ou importe un fichier audio.</p>
          <button className="btn primary" onClick={onNouveau}>Commencer un entretien</button>
        </div>
      ) : (
        <ul className="interview-list">
          {filtres.map((i) => {
            const st = STATUTS[i.statut] || STATUTS.brouillon;
            return (
              <li key={i.id}>
                <button className="interview-row" onClick={() => onOpen(i.id)}>
                  <div className="row-main">
                    <span className="row-title">{i.titre || "Entretien sans titre"}</span>
                    <span className="row-meta">
                      {fmtDate(i.creeLe)}
                      {i.duree ? ` · ${i.duree}` : ""}
                    </span>
                  </div>
                  <span className="status-pill" style={{ color: st.color, borderColor: st.color }}>
                    {st.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button className="fab" onClick={onNouveau} aria-label="Nouvel entretien">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="#1B1503" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
