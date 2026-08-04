import { useMemo, useState } from "react";

export default function Glossaire({ interviews, entrees, onAjouter, onSupprimer }) {
  const [query, setQuery] = useState("");
  const [formOuvert, setFormOuvert] = useState(false);
  const [terme, setTerme] = useState("");
  const [sens, setSens] = useState("");

  /* Fréquence réelle des termes saisis comme vocabulaire local dans les entretiens */
  const releves = useMemo(() => {
    const compte = new Map();
    interviews.forEach((iv) => {
      (iv.vocabulaire || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => compte.set(t.toLowerCase(), (compte.get(t.toLowerCase()) || 0) + 1));
    });
    return [...compte.entries()]
      .map(([terme, occurrences]) => ({ terme, occurrences }))
      .sort((a, b) => b.occurrences - a.occurrences);
  }, [interviews]);

  const definis = useMemo(() => {
    const set = new Set(entrees.map((e) => e.terme.toLowerCase()));
    return set;
  }, [entrees]);

  const q = query.trim().toLowerCase();
  const entreesFiltrees = q ? entrees.filter((e) => e.terme.toLowerCase().includes(q)) : entrees;
  const relevesFiltres = q ? releves.filter((r) => r.terme.includes(q) && !definis.has(r.terme)) : releves.filter((r) => !definis.has(r.terme));

  const valider = () => {
    const t = terme.trim();
    if (!t) return;
    onAjouter({ terme: t, sens: sens.trim() });
    setTerme(""); setSens(""); setFormOuvert(false);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar-title left">Glossaire</h1>
        <button className="icon-btn" onClick={() => setFormOuvert((o) => !o)} aria-label="Ajouter un terme">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="content">
        <p className="section-intro">Les termes locaux que tu renseignes à chaque entretien s'accumulent ici — définis-les une fois pour toutes.</p>

        <input className="search" type="search" placeholder="Rechercher un terme…"
          value={query} onChange={(e) => setQuery(e.target.value)} />

        {formOuvert && (
          <div className="glossaire-form">
            <input className="field-input" placeholder="Terme, ex. tontine" value={terme}
              onChange={(e) => setTerme(e.target.value)} autoFocus />
            <input className="field-input" placeholder="Sens ou traduction" value={sens}
              onChange={(e) => setSens(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} />
            <button className="btn primary sm" onClick={valider}>Ajouter au glossaire</button>
          </div>
        )}

        {entreesFiltrees.length > 0 && (
          <section>
            <h2 className="subsection-title">Définis</h2>
            <ul className="gloss-list">
              {entreesFiltrees.map((e) => (
                <li key={e.id} className="gloss-row">
                  <div>
                    <span className="gloss-terme">{e.terme}</span>
                    {e.sens && <span className="gloss-sens"> — {e.sens}</span>}
                  </div>
                  <button className="icon-btn sm" onClick={() => onSupprimer(e.id)} aria-label="Supprimer">✕</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {relevesFiltres.length > 0 && (
          <section>
            <h2 className="subsection-title">Relevés dans tes entretiens</h2>
            <div className="gloss-chips">
              {relevesFiltres.map((r) => (
                <button key={r.terme} className="gloss-chip-btn"
                  onClick={() => { setTerme(r.terme); setFormOuvert(true); }}>
                  {r.terme}
                  {r.occurrences > 1 && <span className="chip-count">×{r.occurrences}</span>}
                </button>
              ))}
            </div>
          </section>
        )}

        {entreesFiltrees.length === 0 && relevesFiltres.length === 0 && (
          <div className="empty">
            <div className="empty-badge">✎</div>
            <p className="empty-title">{q ? "Aucun résultat" : "Le glossaire est vide"}</p>
            <p className="empty-sub">
              {q ? "Essaie un autre terme." : "Renseigne un vocabulaire local à tes prochains entretiens, il apparaîtra ici automatiquement."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
