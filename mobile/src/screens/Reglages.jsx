import { useEffect, useState } from "react";
import { checkHealth, majPreferences, nombreContributions, modifierCompte, supprimerCompte } from "../lib/api.js";
import { LANGS } from "../lib/constants.js";
import { useT } from "../lib/i18n.js";
import logo from "../assets/logo-full.png";

const SUPPORT_EMAIL = "infos@dosco-game.com";

export default function Reglages({ settings, utilisateur, token, onSave, onDeconnexion, onMajUtilisateur, onOuvrirForfaits, onOuvrirAdmin, onOuvrirCgu, onCompteSupprime, showToast }) {
  const { t } = useT();
  const [form, setForm] = useState(settings);
  const [test, setTest] = useState(null); // null | "en_cours" | {ok, ...}
  const [nbContrib, setNbContrib] = useState(null);
  const [enregistrementPref, setEnregistrementPref] = useState(false);

  const [editionCompte, setEditionCompte] = useState(false);
  const [nomEdit, setNomEdit] = useState(utilisateur?.nom || "");
  const [mdpActuel, setMdpActuel] = useState("");
  const [nouveauMdp, setNouveauMdp] = useState("");
  const [envoiCompte, setEnvoiCompte] = useState(false);

  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [mdpSuppression, setMdpSuppression] = useState("");
  const [confirmationTexte, setConfirmationTexte] = useState("");
  const [envoiSuppression, setEnvoiSuppression] = useState(false);

  useEffect(() => {
    if (!utilisateur) return;
    nombreContributions(settings.backendUrl, token)
      .then((r) => setNbContrib(r.nombre))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const basculerContribution = async () => {
    setEnregistrementPref(true);
    try {
      const nouvelleValeur = !utilisateur.contribution_langues_locales;
      await majPreferences(settings.backendUrl, token, nouvelleValeur);
      onMajUtilisateur({ ...utilisateur, contribution_langues_locales: nouvelleValeur });
      showToast(nouvelleValeur ? "✓" : "✓");
    } catch (e) {
      showToast(t("reglages.echec") + e.message);
    } finally {
      setEnregistrementPref(false);
    }
  };

  const enregistrerCompte = async () => {
    setEnvoiCompte(true);
    try {
      const u = await modifierCompte(settings.backendUrl, token, {
        nom: nomEdit, motDePasseActuel: mdpActuel || undefined, nouveauMotDePasse: nouveauMdp || undefined,
      });
      onMajUtilisateur({ ...utilisateur, nom: u.nom });
      setMdpActuel(""); setNouveauMdp(""); setEditionCompte(false);
      showToast("✓");
    } catch (e) {
      showToast(t("reglages.echec") + e.message);
    } finally {
      setEnvoiCompte(false);
    }
  };

  const confirmerSuppression = async () => {
    setEnvoiSuppression(true);
    try {
      await supprimerCompte(settings.backendUrl, token, mdpSuppression);
      onCompteSupprime();
    } catch (e) {
      showToast(t("reglages.echec") + e.message);
    } finally {
      setEnvoiSuppression(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const tester = async () => {
    setTest("en_cours");
    const res = await checkHealth(form.backendUrl);
    setTest(res);
  };

  const enregistrer = () => {
    onSave(form);
    showToast("✓");
  };

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar-title left">{t("reglages.titre")}</h1>
      </header>

      <div className="content">
        {utilisateur && (
          <div className="compte-card">
            <div className="compte-avatar">{(utilisateur.nom || utilisateur.email)[0].toUpperCase()}</div>
            <div className="compte-info">
              <span className="compte-nom">{utilisateur.nom || "—"}</span>
              <span className="compte-email">{utilisateur.email}</span>
            </div>
            <button className="link-btn" onClick={onDeconnexion}>{t("reglages.deconnexion")}</button>
          </div>
        )}

        {utilisateur && !utilisateur.email_verifie && (
          <p className="note-banner err">{t("reglages.emailNonVerifie")}</p>
        )}

        {utilisateur && (
          <button className="btn ghost full" onClick={() => setEditionCompte((e) => !e)}>
            {editionCompte ? t("ficheEntretien.annuler") : t("reglages.modifierCompte")}
          </button>
        )}

        {editionCompte && (
          <div className="glossaire-form">
            <label className="field">
              <span className="field-label">{t("reglages.nom")}</span>
              <input className="field-input" value={nomEdit} onChange={(e) => setNomEdit(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{t("reglages.mdpActuelLabel")}</span>
              <input className="field-input" type="password" value={mdpActuel} onChange={(e) => setMdpActuel(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{t("reglages.nouveauMdpLabel")}</span>
              <input className="field-input" type="password" value={nouveauMdp} onChange={(e) => setNouveauMdp(e.target.value)} placeholder={t("reglages.nouveauMdpAide")} />
            </label>
            <button className="btn primary sm" onClick={enregistrerCompte} disabled={envoiCompte}>
              {envoiCompte ? "…" : t("ficheEntretien.enregistrer")}
            </button>
          </div>
        )}

        {utilisateur && !utilisateur.est_admin && (
          <button className="link-btn" style={{ color: "#D96D5F" }} onClick={() => setSuppressionOuverte((s) => !s)}>
            {t("reglages.supprimerCompte")}
          </button>
        )}

        {suppressionOuverte && (
          <div className="glossaire-form" style={{ borderColor: "rgba(217,109,95,0.4)" }}>
            <p className="note-banner err" style={{ margin: 0 }}>{t("reglages.suppressionAvertissement")}</p>
            <label className="field">
              <span className="field-label">{t("reglages.tapeSupprimer")}</span>
              <input className="field-input" value={confirmationTexte} onChange={(e) => setConfirmationTexte(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{t("reglages.tonMdp")}</span>
              <input className="field-input" type="password" value={mdpSuppression} onChange={(e) => setMdpSuppression(e.target.value)} />
            </label>
            <button className="btn primary sm" style={{ background: "#D96D5F" }}
              onClick={confirmerSuppression}
              disabled={envoiSuppression || confirmationTexte !== "SUPPRIMER" || !mdpSuppression}>
              {envoiSuppression ? "…" : t("reglages.supprimerDefinitivement")}
            </button>
          </div>
        )}

        {utilisateur && (
          <button className="corpus-inline" onClick={onOuvrirForfaits}>
            {utilisateur.credits} {t("reglages.credits")} · {utilisateur.forfait_actuel || t("reglages.essaiGratuit")}
            <span className="corpus-inline-edit">{t("reglages.forfaits")}</span>
          </button>
        )}

        {utilisateur?.est_admin && (
          <button className="btn ghost full" onClick={onOuvrirAdmin}>{t("reglages.panneauAdmin")}</button>
        )}

        <button className="link-btn" onClick={onOuvrirCgu}>{t("reglages.cguLien")}</button>

        {utilisateur && (
          <div className="contrib-card">
            <div className="contrib-head">
              <span className="field-label">{t("reglages.contribuerLangues")}</span>
              <button className={"toggle" + (utilisateur.contribution_langues_locales ? " on" : "")}
                onClick={basculerContribution} disabled={enregistrementPref}
                role="switch" aria-checked={utilisateur.contribution_langues_locales}>
                <span className="toggle-knob" />
              </button>
            </div>
            <p className="field-help">{t("reglages.contribuerAide")}</p>
            {nbContrib !== null && nbContrib > 0 && (
              <p className="contrib-count">{nbContrib} {nbContrib > 1 ? t("reglages.correctionsEnvoyeesPl") : t("reglages.correctionsEnvoyees")}</p>
            )}
          </div>
        )}

        <label className="field">
          <span className="field-label">{t("reglages.langueInterface")}</span>
          <select className="field-input" value={form.langueInterface || "fr"}
            onChange={(e) => set("langueInterface", e.target.value)}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">{t("reglages.adresseServeur")}</span>
          <input className="field-input mono" value={form.backendUrl}
            onChange={(e) => set("backendUrl", e.target.value)}
            placeholder="https://votre-app.up.railway.app" inputMode="url" autoCapitalize="none" />
          <span className="field-help">{t("reglages.adresseServeurAide")}</span>
        </label>

        <button className="btn ghost full" onClick={tester} disabled={test === "en_cours"}>
          {test === "en_cours" ? t("reglages.verification") : t("reglages.testerConnexion")}
        </button>

        {test && test !== "en_cours" && (
          <p className={"note-banner" + (test.ok ? " ok" : " err")}>
            {test.ok
              ? `${t("reglages.connecte")}${test.data.model} » · ${t("ficheEntretien.analyse")} ${test.data.analyse_disponible ? t("reglages.activee") : t("reglages.nonConfiguree")}${t("reglages.diarisation")}${test.data.diarisation_disponible ? t("reglages.activee") : t("reglages.nonConfiguree")}`
              : `${t("reglages.echec")}${test.erreur}`}
          </p>
        )}

        <label className="field">
          <span className="field-label">{t("reglages.langueDefaut")}</span>
          <select className="field-input" value={form.langueDefaut}
            onChange={(e) => set("langueDefaut", e.target.value)}>
            {Object.entries(LANGS).map(([k, l]) => (
              <option key={k} value={k}>{l.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">{t("reglages.vocabulaireDefaut")}</span>
          <input className="field-input" value={form.vocabulaireDefaut}
            onChange={(e) => set("vocabulaireDefaut", e.target.value)}
            placeholder={t("reglages.vocabulaireDefautPlaceholder")} />
          <span className="field-help">{t("reglages.vocabulaireDefautAide")}</span>
        </label>

        <button className="btn primary full" onClick={enregistrer}>{t("ficheEntretien.enregistrer")}</button>

        <div className="support-card">
          <span className="field-label">{t("reglages.support")}</span>
          <p className="field-help">{t("reglages.supportAide")}</p>
          <a className="link-btn" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </div>

        <div className="about">
          <img src={logo} alt="Djeliya" className="about-logo" />
          <p>{t("reglages.about1")}</p>
          <p>{t("reglages.about2")}</p>
        </div>
      </div>
    </div>
  );
}
