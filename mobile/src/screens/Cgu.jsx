import { useEffect, useState } from "react";
import { fetchCgu } from "../lib/api.js";

export default function Cgu({ backendUrl, onRetour }) {
  const [texte, setTexte] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    fetchCgu(backendUrl).then((r) => setTexte(r.texte)).catch((e) => setErreur(e.message));
  }, [backendUrl]);

  return (
    <div className="screen">
      <header className="topbar">
        {onRetour && (
          <button className="icon-btn" onClick={onRetour} aria-label="Retour">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        <h1 className="topbar-title">Conditions & confidentialité</h1>
        <span style={{ width: 36 }} />
      </header>
      <div className="content">
        {erreur && <p className="note-banner err">{erreur}</p>}
        {!texte && !erreur && <div className="pending-card"><span className="spinner" />Chargement…</div>}
        {texte && <pre className="cgu-texte">{texte}</pre>}
      </div>
    </div>
  );
}
