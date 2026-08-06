import { useEffect, useState } from "react";
import { listerForfaits } from "../lib/api.js";
import { useT } from "../lib/i18n.js";

const CONTACT_ADMIN = "dosso.choilio@gmail.com";

export default function Forfaits({ settings, utilisateur, onRetour }) {
  const { t } = useT();
  const [forfaits, setForfaits] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    listerForfaits(settings.backendUrl).then(setForfaits).catch((e) => setErreur(e.message));
  }, [settings.backendUrl]);

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onRetour} aria-label="Retour">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="topbar-title">{t("forfaits.titre")}</h1>
        <span style={{ width: 36 }} />
      </header>

      <div className="content">
        <div className="stat-strip">
          <div className="stat-chip">
            <span className="stat-num">{utilisateur?.credits ?? "—"}</span>
            <span className="stat-label">{t("forfaits.credits")}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-num" style={{ fontSize: 15 }}>{utilisateur?.forfait_actuel || t("reglages.essaiGratuit")}</span>
            <span className="stat-label">{t("forfaits.forfaitActuel")}</span>
          </div>
        </div>

        <p className="section-intro">{t("forfaits.intro")}</p>

        {erreur && <p className="note-banner err">{erreur}</p>}

        {forfaits === null ? (
          <div className="pending-card"><span className="spinner" />{t("forfaits.chargement")}</div>
        ) : forfaits.length === 0 ? (
          <p className="note-banner">{t("forfaits.aucunForfait")}</p>
        ) : (
          <ul className="corpus-list">
            {forfaits.map((f) => (
              <li key={f.id}>
                <div className="forfait-card">
                  <div className="forfait-head">
                    <span className="forfait-nom">{f.nom}</span>
                    <span className="forfait-prix">{f.prix_fcfa.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                  <p className="forfait-credits">{f.credits_inclus} {t("forfaits.creditsInclus")}</p>
                  {f.description && <p className="field-help">{f.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {forfaits && forfaits.length > 0 && (
          <div className="note-banner">
            {t("forfaits.commentSouscrire")} <strong>{CONTACT_ADMIN}</strong> {t("forfaits.commentSouscrireSuite")}
          </div>
        )}
      </div>
    </div>
  );
}
