import { useMemo, useState } from "react";
import { STATUTS, fmtDate } from "../lib/constants.js";
import logo from "../assets/logo-full.png";

export default function Accueil({ interviews, onOpen, onNouveau, onReglages, backendOk }) {
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
      <header className="topbar">
        <img src={logo} alt="Djeliya" className="brand-logo" />
        <button className="icon-btn" onClick={onReglages} aria-label="Réglages">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z" stroke="currentColor" strokeWidth="1.4" />
            <path d="M16.6 12.2a1.3 1.3 0 0 0 .26 1.44l.05.05a1.58 1.58 0 1 1-2.23 2.23l-.05-.05a1.3 1.3 0 0 0-1.44-.26 1.3 1.3 0 0 0-.79 1.19v.14a1.58 1.58 0 1 1-3.15 0v-.07a1.3 1.3 0 0 0-.85-1.19 1.3 1.3 0 0 0-1.44.26l-.05.05a1.58 1.58 0 1 1-2.23-2.23l.05-.05a1.3 1.3 0 0 0 .26-1.44 1.3 1.3 0 0 0-1.19-.79h-.14a1.58 1.58 0 1 1 0-3.15h.07a1.3 1.3 0 0 0 1.19-.85 1.3 1.3 0 0 0-.26-1.44l-.05-.05a1.58 1.58 0 1 1 2.23-2.23l.05.05a1.3 1.3 0 0 0 1.44.26h.06a1.3 1.3 0 0 0 .79-1.19v-.14a1.58 1.58 0 1 1 3.15 0v.07a1.3 1.3 0 0 0 .79 1.19h.06a1.3 1.3 0 0 0 1.44-.26l.05-.05a1.58 1.58 0 1 1 2.23 2.23l-.05.05a1.3 1.3 0 0 0-.26 1.44v.06a1.3 1.3 0 0 0 1.19.79h.14a1.58 1.58 0 1 1 0 3.15h-.07a1.3 1.3 0 0 0-1.19.79Z" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
      </header>

      {!backendOk && (
        <button className="warn-bar" onClick={onReglages}>
          Serveur non connecté — touche ici pour le configurer
        </button>
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
