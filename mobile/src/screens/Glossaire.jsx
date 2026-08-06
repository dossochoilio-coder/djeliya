import { useMemo, useState } from "react";
import { useT } from "../lib/i18n.js";

export default function Glossaire({ interviews, entrees, onAjouter, onSupprimer }) {
  const { t } = useT();
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
    const term = terme.trim();
    if (!term) return;
    onAjouter({ terme: term, sens: sens.trim() });
    setTerme(""); setSens(""); setFormOuvert(false);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar-title left">{t("glossaire.titre")}</h1>
        <button className="icon-btn" onClick={() => setFormOuvert((o) => !o)} aria-label="Ajouter un terme">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="content">
        <p className="section-intro">{t("glossaire.intro")}</p>

        <input className="search" type="search" placeholder={t("glossaire.rechercher")}
          value={query} onChange={(e) => setQuery(e.target.value)} />

        {formOuvert && (
          <div className="glossaire-form">
            <input className="field-input" placeholder={t("glossaire.terme")} value={terme}
              onChange={(e) => setTerme(e.target.value)} autoFocus />
            <input className="field-input" placeholder={t("glossaire.sens")} value={sens}
              onChange={(e) => setSens(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} />
            <button className="btn primary sm" onClick={valider}>{t("glossaire.ajouterGlossaire")}</button>
          </div>
        )}

        {entreesFiltrees.length > 0 && (
          <section>
            <h2 className="subsection-title">{t("glossaire.definis")}</h2>
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
            <h2 className="subsection-title">{t("glossaire.relevesTitre")}</h2>
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
            <p className="empty-title">{q ? t("glossaire.aucunResultat") : t("glossaire.videTitre")}</p>
            <p className="empty-sub">
              {q ? t("glossaire.videSousRecherche") : t("glossaire.videSous")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
