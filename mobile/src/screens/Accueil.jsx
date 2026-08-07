import { useMemo, useState } from "react";
import { STATUTS, fmtDate } from "../lib/constants.js";
import { useT } from "../lib/i18n.js";
import logo from "../assets/logo-full.png";

export default function Accueil({ interviews, onOpen, onNouveau, onOuvrirGuides, onOuvrirEtudesQuant, backendOk }) {
  const { t } = useT();
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
        <p className="warn-bar">{t("accueil.serveurNonConnecte")}</p>
      )}

      <div className="list-tools">
        <input className="search" type="search" placeholder={t("accueil.rechercher")}
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <button className="guide-card" onClick={onOuvrirGuides}>
        <span className="guide-card-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M5 3.5h10a1 1 0 0 1 1 1v11.2l-1.5-.9-1.5.9-1.5-.9-1.5.9-1.5-.9-1.5.9V4.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M7.3 7.3h5.4M7.3 10h5.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
        </span>
        <span className="guide-card-texte">
          <span className="guide-card-titre">{t("guide.accueilBouton")}</span>
          <span className="guide-card-sous">{t("guide.videSous")}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="guide-card-chevron"><path d="M7.5 15 13 10 7.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      <button className="guide-card" onClick={onOuvrirEtudesQuant}>
        <span className="guide-card-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M3.5 16.5V4M3.5 16.5h13M6.5 13.5v-4M10 13.5v-7M13.5 13.5v-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className="guide-card-texte">
          <span className="guide-card-titre">{t("etudeQuant.accueilBouton")}</span>
          <span className="guide-card-sous">{t("etudeQuant.accueilSous")}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="guide-card-chevron"><path d="M7.5 15 13 10 7.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {filtres.length === 0 ? (
        <div className="empty">
          <div className="empty-badge">◎</div>
          <p className="empty-title">{t("accueil.vide")}</p>
          <p className="empty-sub">{t("accueil.videSous")}</p>
          <button className="btn primary" onClick={onNouveau}>{t("accueil.commencer")}</button>
        </div>
      ) : (
        <ul className="interview-list">
          {filtres.map((i) => {
            const st = STATUTS[i.statut] || STATUTS.brouillon;
            return (
              <li key={i.id}>
                <button className="interview-row" onClick={() => onOpen(i.id)}>
                  <div className="row-main">
                    <span className="row-title">{i.titre || "—"}</span>
                    <span className="row-meta">
                      {fmtDate(i.creeLe)}
                      {i.duree ? ` · ${i.duree}` : ""}
                    </span>
                  </div>
                  <span className="status-pill" style={{ color: st.color, borderColor: st.color }}>
                    {t(`statuts.${i.statut}`)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button className="fab" onClick={onNouveau} aria-label={t("accueil.commencer")}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="#1B1503" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
