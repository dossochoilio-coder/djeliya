import { useEffect, useState } from "react";
import { listerForfaits, tarifRecharge, creerRecharge, listerRecharges } from "../lib/api.js";
import { useT } from "../lib/i18n.js";

const CONTACT_ADMIN = "dosso.choilio@gmail.com";

export default function Forfaits({ settings, token, utilisateur, onRetour, showToast }) {
  const { t } = useT();
  const [forfaits, setForfaits] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [tarif, setTarif] = useState(null);
  const [credits, setCredits] = useState("10");
  const [envoi, setEnvoi] = useState(false);
  const [historique, setHistorique] = useState(null);

  useEffect(() => {
    listerForfaits(settings.backendUrl).then(setForfaits).catch((e) => setErreur(e.message));
    tarifRecharge(settings.backendUrl).then(setTarif).catch(() => {});
    if (token) listerRecharges(settings.backendUrl, token).then(setHistorique).catch(() => {});
  }, [settings.backendUrl, token]);

  const creditsNum = Math.max(0, parseInt(credits, 10) || 0);
  const min = tarif?.credits_min ?? 10;
  const montant = tarif ? creditsNum * tarif.prix_credit_fcfa : 0;

  const payer = async () => {
    if (creditsNum < min) { showToast(t("forfaits.rechargeMin", { min })); return; }
    setEnvoi(true);
    try {
      const commande = await creerRecharge(settings.backendUrl, token, creditsNum);
      if (commande.lien_paiement) {
        window.open(commande.lien_paiement, "_blank");
      }
      listerRecharges(settings.backendUrl, token).then(setHistorique).catch(() => {});
      showToast("✓");
    } catch (e) {
      showToast(e.message || "");
    } finally {
      setEnvoi(false);
    }
  };

  const libelleStatut = (s) =>
    s === "payee" ? t("forfaits.rechargeStatutPayee")
      : s === "echouee" || s === "expiree" ? t("forfaits.rechargeStatutEchouee")
      : t("forfaits.rechargeStatutEnAttente");

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

        {tarif && (
          <div className="glossaire-form">
            <h2 className="subsection-title" style={{ margin: 0 }}>{t("forfaits.rechargeTitre")}</h2>
            <label className="field">
              <span className="field-label">{t("forfaits.rechargeCredits", { min })}</span>
              <input className="field-input" type="number" min={min} step="1" value={credits}
                onChange={(e) => setCredits(e.target.value)} />
            </label>
            <p className="analyse-texte" style={{ margin: 0 }}>
              <strong>{t("forfaits.rechargeMontant")} : </strong>{montant.toLocaleString("fr-FR")} FCFA
              <span className="field-help"> ({tarif.prix_credit_fcfa} FCFA × {creditsNum})</span>
            </p>
            {tarif.paiement_disponible ? (
              <button className="btn primary sm" onClick={payer} disabled={envoi || creditsNum < min}>
                {envoi ? "…" : t("forfaits.rechargePayer")}
              </button>
            ) : (
              <p className="note-banner">{t("forfaits.rechargeIndisponible")}</p>
            )}
          </div>
        )}

        {historique && historique.length > 0 && (
          <>
            <h2 className="subsection-title">{t("forfaits.rechargeHistorique")}</h2>
            <ul className="gloss-list">
              {historique.map((h) => (
                <li key={h.id} className="gloss-row">
                  <div>
                    <span className="gloss-terme">{h.credits} {t("reglages.credits")}</span>
                    <span className="gloss-sens"> — {h.montant_fcfa.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                  <span className="status-pill" style={{
                    color: h.statut === "payee" ? "#5FC6A8" : h.statut === "echouee" || h.statut === "expiree" ? "#D96D5F" : "#E4B04A",
                    borderColor: h.statut === "payee" ? "#5FC6A8" : h.statut === "echouee" || h.statut === "expiree" ? "#D96D5F" : "#E4B04A",
                  }}>
                    {libelleStatut(h.statut)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {forfaits === null ? (
          <div className="pending-card"><span className="spinner" />{t("forfaits.chargement")}</div>
        ) : forfaits.length === 0 ? null : (
          <>
            <h2 className="subsection-title">{t("forfaits.titre")}</h2>
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
            <div className="note-banner">
              {t("forfaits.commentSouscrire")} <strong>{CONTACT_ADMIN}</strong> {t("forfaits.commentSouscrireSuite")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
