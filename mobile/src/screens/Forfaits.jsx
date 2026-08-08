import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  listerForfaits, tarifRecharge, creerRecharge, listerRecharges, verifierRecharge, supprimerRecharge,
  catalogueGooglePlay, verifierAchatGooglePlay,
} from "../lib/api.js";
import DjeliyaBilling from "../lib/billing.js";
import { useT } from "../lib/i18n.js";
import { fmtDate } from "../lib/constants.js";

const CONTACT_ADMIN = "dosso.choilio@gmail.com";
const EST_ANDROID_NATIF = Capacitor.getPlatform() === "android";

export default function Forfaits({ settings, token, utilisateur, onMajUtilisateur, onRetour, showToast }) {
  const { t } = useT();
  const [forfaits, setForfaits] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [tarif, setTarif] = useState(null);
  const [credits, setCredits] = useState("10");
  const [envoi, setEnvoi] = useState(false);
  const [historique, setHistorique] = useState(null);
  const [lienEnAttente, setLienEnAttente] = useState(null);

  // Google Play Billing — uniquement pertinent sur Android natif, jamais sur web.
  const [catalogueGP, setCatalogueGP] = useState(null);
  const [achatEnCoursGP, setAchatEnCoursGP] = useState(null);
  const [billingPret, setBillingPret] = useState(false);

  useEffect(() => {
    listerForfaits(settings.backendUrl).then(setForfaits).catch((e) => setErreur(e.message));
    if (token) listerRecharges(settings.backendUrl, token).then(setHistorique).catch(() => {});

    if (EST_ANDROID_NATIF) {
      catalogueGooglePlay(settings.backendUrl).then(setCatalogueGP).catch(() => {});
      DjeliyaBilling.initialiser().then(() => setBillingPret(true)).catch(() => setBillingPret(false));
    } else {
      tarifRecharge(settings.backendUrl).then(setTarif).catch(() => {});
    }
  }, [settings.backendUrl, token]);

  /* Vérification automatique en arrière-plan des recharges PayDunya en attente
     (web uniquement) — évite de devoir appuyer manuellement sur « Vérifier
     maintenant » si le webhook n'arrive pas jusqu'au serveur. */
  useEffect(() => {
    if (EST_ANDROID_NATIF || !historique || !token) return;
    const enAttente = historique.filter((h) => h.statut === "en_attente");
    if (enAttente.length === 0) return;

    const it = setInterval(async () => {
      let creditsGagnes = 0;
      for (const h of enAttente) {
        try {
          const r = await verifierRecharge(settings.backendUrl, token, h.id);
          if (r.statut === "payee") creditsGagnes += r.credits;
        } catch { /* nouvel essai au prochain intervalle */ }
      }
      if (creditsGagnes > 0) {
        onMajUtilisateur?.({ ...utilisateur, credits: utilisateur.credits + creditsGagnes });
        showToast("✓ " + t("forfaits.rechargeStatutPayee"));
      }
      listerRecharges(settings.backendUrl, token).then(setHistorique).catch(() => {});
    }, 8000);
    return () => clearInterval(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historique, token, settings.backendUrl]);

  /* ---------------- Google Play Billing (Android natif uniquement) ---------------- */
  const acheterGooglePlay = async (productId) => {
    setAchatEnCoursGP(productId);
    try {
      const achat = await DjeliyaBilling.acheter({ productId });
      const verif = await verifierAchatGooglePlay(settings.backendUrl, token, {
        productId: achat.productId, purchaseToken: achat.purchaseToken, orderId: achat.orderId,
      });
      if (verif.statut === "payee") {
        showToast("✓ " + t("forfaits.rechargeStatutPayee"));
        onMajUtilisateur?.({ ...utilisateur, credits: utilisateur.credits + verif.credits });
      } else {
        showToast(t("forfaits.rechargeStatutEchouee"));
      }
    } catch (e) {
      if (e?.message !== "annule_par_utilisateur") showToast(e?.message || "");
    } finally {
      setAchatEnCoursGP(null);
    }
  };

  /* ---------------- PayDunya (web uniquement) ---------------- */
  const creditsNum = Math.max(0, parseInt(credits, 10) || 0);
  const min = tarif?.credits_min ?? 10;
  const montant = tarif ? creditsNum * tarif.prix_credit_fcfa : 0;

  const payer = async () => {
    if (creditsNum < min) { showToast(t("forfaits.rechargeMin", { min })); return; }
    setEnvoi(true);
    setLienEnAttente(null);
    const fenetre = window.open("", "_blank");
    try {
      const commande = await creerRecharge(settings.backendUrl, token, creditsNum);
      if (commande.lien_paiement) {
        if (fenetre && !fenetre.closed) {
          fenetre.location.href = commande.lien_paiement;
        } else {
          window.open(commande.lien_paiement, "_blank");
        }
        setLienEnAttente(commande.lien_paiement);
      }
      listerRecharges(settings.backendUrl, token).then(setHistorique).catch(() => {});
      showToast("✓");
    } catch (e) {
      if (fenetre && !fenetre.closed) fenetre.close();
      showToast(e.message || "");
    } finally {
      setEnvoi(false);
    }
  };

  const libelleStatut = (s) =>
    s === "payee" ? t("forfaits.rechargeStatutPayee")
      : s === "echouee" || s === "expiree" ? t("forfaits.rechargeStatutEchouee")
      : t("forfaits.rechargeStatutEnAttente");

  const [verificationEnCours, setVerificationEnCours] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(null);

  const supprimerEntreeHistorique = async (id) => {
    setSuppressionEnCours(id);
    try {
      await supprimerRecharge(settings.backendUrl, token, id);
      setHistorique((h) => h.filter((x) => x.id !== id));
    } catch (e) {
      showToast(e.message || "");
    } finally {
      setSuppressionEnCours(null);
    }
  };

  const verifierMaintenant = async (id) => {
    setVerificationEnCours(id);
    try {
      const r = await verifierRecharge(settings.backendUrl, token, id);
      if (r.statut === "payee") {
        showToast("✓ " + t("forfaits.rechargeStatutPayee"));
        onMajUtilisateur?.({ ...utilisateur, credits: utilisateur.credits + r.credits });
      } else {
        showToast(libelleStatut(r.statut));
      }
      listerRecharges(settings.backendUrl, token).then(setHistorique).catch(() => {});
    } catch (e) {
      showToast(e.message || "");
    } finally {
      setVerificationEnCours(null);
    }
  };

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

        {EST_ANDROID_NATIF ? (
          <div className="glossaire-form">
            <h2 className="subsection-title" style={{ margin: 0 }}>{t("forfaits.rechargeTitre")}</h2>
            {!billingPret && <div className="pending-card"><span className="spinner" />{t("forfaits.chargement")}</div>}
            {billingPret && catalogueGP?.produits?.map((p) => (
              <button key={p.product_id} className="btn primary sm" style={{ marginBottom: 6 }}
                onClick={() => acheterGooglePlay(p.product_id)} disabled={achatEnCoursGP !== null}>
                {achatEnCoursGP === p.product_id ? "…" : `${p.credits} ${t("reglages.credits")}`}
              </button>
            ))}
            {billingPret && catalogueGP && !catalogueGP.disponible && (
              <p className="note-banner">{t("forfaits.rechargeIndisponible")}</p>
            )}
          </div>
        ) : tarif && (
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
            {lienEnAttente && (
              <a className="btn ghost sm" href={lienEnAttente} target="_blank" rel="noreferrer">
                {t("forfaits.rechargeOuvrirPage")}
              </a>
            )}
          </div>
        )}

        {historique && historique.length > 0 && (
          <>
            <h2 className="subsection-title">{t("forfaits.rechargeHistorique")}</h2>
            <ul className="gloss-list">
              {historique.map((h) => (
                <li key={h.id} className="gloss-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <div>
                    <span className="gloss-terme">{h.credits} {t("reglages.credits")}</span>
                    <span className="gloss-sens">
                      {" — "}
                      {h.montant_fcfa != null ? `${h.montant_fcfa.toLocaleString("fr-FR")} FCFA` : "Google Play"}
                      {h.cree_le ? ` · ${fmtDate(h.cree_le)}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      {h.statut === "en_attente" && h.source === "paydunya" && (
                        <button className="link-btn" style={{ fontSize: 12 }}
                          onClick={() => verifierMaintenant(h.id)} disabled={verificationEnCours === h.id}>
                          {verificationEnCours === h.id ? "…" : t("forfaits.rechargeVerifier")}
                        </button>
                      )}
                      {h.statut !== "payee" && (
                        <button className="link-btn" style={{ fontSize: 12, color: "#D96D5F" }}
                          onClick={() => supprimerEntreeHistorique(h.id)} disabled={suppressionEnCours === h.id}>
                          {suppressionEnCours === h.id ? "…" : t("forfaits.rechargeSupprimer")}
                        </button>
                      )}
                    </div>
                    <span className="status-pill" style={{
                      color: h.statut === "payee" ? "#5FC6A8" : h.statut === "echouee" || h.statut === "expiree" ? "#D96D5F" : "#E4B04A",
                      borderColor: h.statut === "payee" ? "#5FC6A8" : h.statut === "echouee" || h.statut === "expiree" ? "#D96D5F" : "#E4B04A",
                    }}>
                      {libelleStatut(h.statut)}
                    </span>
                  </div>
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
