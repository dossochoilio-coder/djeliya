import { useEffect, useState } from "react";
import { checkHealth, majPreferences, nombreContributions, modifierCompte, supprimerCompte } from "../lib/api.js";
import { LANGS } from "../lib/constants.js";
import logo from "../assets/logo-full.png";

export default function Reglages({ settings, utilisateur, token, onSave, onDeconnexion, onMajUtilisateur, onOuvrirForfaits, onOuvrirAdmin, onOuvrirCgu, onCompteSupprime, showToast }) {
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
      showToast(nouvelleValeur ? "Contribution activée — merci !" : "Contribution désactivée");
    } catch (e) {
      showToast("Échec : " + e.message);
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
      showToast("Compte mis à jour");
    } catch (e) {
      showToast("Échec : " + e.message);
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
      showToast("Échec : " + e.message);
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
    showToast("Réglages enregistrés");
  };

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar-title left">Réglages</h1>
      </header>

      <div className="content">
        {utilisateur && (
          <div className="compte-card">
            <div className="compte-avatar">{(utilisateur.nom || utilisateur.email)[0].toUpperCase()}</div>
            <div className="compte-info">
              <span className="compte-nom">{utilisateur.nom || "Chercheur"}</span>
              <span className="compte-email">{utilisateur.email}</span>
            </div>
            <button className="link-btn" onClick={onDeconnexion}>Déconnexion</button>
          </div>
        )}

        {utilisateur && !utilisateur.email_verifie && (
          <p className="note-banner err">
            Adresse e-mail non vérifiée — certaines actions (transcription) resteront bloquées tant
            que la vérification n'est pas terminée.
          </p>
        )}

        {utilisateur && (
          <button className="btn ghost full" onClick={() => setEditionCompte((e) => !e)}>
            {editionCompte ? "Annuler" : "Modifier mon compte"}
          </button>
        )}

        {editionCompte && (
          <div className="glossaire-form">
            <label className="field">
              <span className="field-label">Nom</span>
              <input className="field-input" value={nomEdit} onChange={(e) => setNomEdit(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Mot de passe actuel (pour changer de mot de passe)</span>
              <input className="field-input" type="password" value={mdpActuel} onChange={(e) => setMdpActuel(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Nouveau mot de passe (facultatif)</span>
              <input className="field-input" type="password" value={nouveauMdp} onChange={(e) => setNouveauMdp(e.target.value)} placeholder="Laisser vide pour ne pas changer" />
            </label>
            <button className="btn primary sm" onClick={enregistrerCompte} disabled={envoiCompte}>
              {envoiCompte ? "…" : "Enregistrer"}
            </button>
          </div>
        )}

        {utilisateur && !utilisateur.est_admin && (
          <button className="link-btn" style={{ color: "#D96D5F" }} onClick={() => setSuppressionOuverte((s) => !s)}>
            Supprimer mon compte
          </button>
        )}

        {suppressionOuverte && (
          <div className="glossaire-form" style={{ borderColor: "rgba(217,109,95,0.4)" }}>
            <p className="note-banner err" style={{ margin: 0 }}>
              Action irréversible : tes entretiens, tes corpus (dont tu es seul propriétaire) et tes
              contributions seront définitivement supprimés.
            </p>
            <label className="field">
              <span className="field-label">Tape SUPPRIMER pour confirmer</span>
              <input className="field-input" value={confirmationTexte} onChange={(e) => setConfirmationTexte(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Ton mot de passe</span>
              <input className="field-input" type="password" value={mdpSuppression} onChange={(e) => setMdpSuppression(e.target.value)} />
            </label>
            <button className="btn primary sm" style={{ background: "#D96D5F" }}
              onClick={confirmerSuppression}
              disabled={envoiSuppression || confirmationTexte !== "SUPPRIMER" || !mdpSuppression}>
              {envoiSuppression ? "…" : "Supprimer définitivement mon compte"}
            </button>
          </div>
        )}

        {utilisateur && (
          <button className="corpus-inline" onClick={onOuvrirForfaits}>
            {utilisateur.credits} crédits · {utilisateur.forfait_actuel || "Essai gratuit"}
            <span className="corpus-inline-edit">forfaits</span>
          </button>
        )}

        {utilisateur?.est_admin && (
          <button className="btn ghost full" onClick={onOuvrirAdmin}>Panneau d'administration</button>
        )}

        <button className="link-btn" onClick={onOuvrirCgu}>Conditions d'utilisation et confidentialité</button>

        {utilisateur && (
          <div className="contrib-card">
            <div className="contrib-head">
              <span className="field-label">Contribuer aux langues locales</span>
              <button className={"toggle" + (utilisateur.contribution_langues_locales ? " on" : "")}
                onClick={basculerContribution} disabled={enregistrementPref}
                role="switch" aria-checked={utilisateur.contribution_langues_locales}>
                <span className="toggle-knob" />
              </button>
            </div>
            <p className="field-help">
              Si activé, tes corrections manuelles sur des segments en dioula ou en baoulé sont
              envoyées de façon sécurisée pour servir de données d'entraînement à un futur modèle
              plus fiable dans ces langues. Aucun réentraînement automatique n'a lieu — c'est un
              travail humain et scientifique distinct (voir la stratégie langues locales du projet).
              Désactivable à tout moment.
            </p>
            {nbContrib !== null && nbContrib > 0 && (
              <p className="contrib-count">{nbContrib} correction{nbContrib > 1 ? "s" : ""} envoyée{nbContrib > 1 ? "s" : ""} jusqu'ici — merci !</p>
            )}
          </div>
        )}

        <label className="field">
          <span className="field-label">Adresse du serveur Djeliya</span>
          <input className="field-input mono" value={form.backendUrl}
            onChange={(e) => set("backendUrl", e.target.value)}
            placeholder="https://votre-app.up.railway.app" inputMode="url" autoCapitalize="none" />
          <span className="field-help">L'adresse de ton déploiement Railway (voir onglet Networking du service).</span>
        </label>

        <button className="btn ghost full" onClick={tester} disabled={test === "en_cours"}>
          {test === "en_cours" ? "Vérification…" : "Tester la connexion"}
        </button>

        {test && test !== "en_cours" && (
          <p className={"note-banner" + (test.ok ? " ok" : " err")}>
            {test.ok
              ? `Connecté — modèle « ${test.data.model} » · analyse ${test.data.analyse_disponible ? "activée" : "non configurée"} · diarisation ${test.data.diarisation_disponible ? "activée" : "non configurée"}`
              : `Échec : ${test.erreur}`}
          </p>
        )}

        <label className="field">
          <span className="field-label">Langue par défaut</span>
          <select className="field-input" value={form.langueDefaut}
            onChange={(e) => set("langueDefaut", e.target.value)}>
            {Object.entries(LANGS).map(([k, l]) => (
              <option key={k} value={k}>{l.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Vocabulaire local par défaut</span>
          <input className="field-input" value={form.vocabulaireDefaut}
            onChange={(e) => set("vocabulaireDefaut", e.target.value)}
            placeholder="Ex. tontine, pagne, Cocody" />
          <span className="field-help">Pré-rempli à chaque nouvel entretien — modifiable au cas par cas.</span>
        </label>

        <button className="btn primary full" onClick={enregistrer}>Enregistrer</button>

        <div className="about">
          <img src={logo} alt="Djeliya" className="about-logo" />
          <p>Djeliya — plateforme de transcription pour la recherche qualitative multilingue.</p>
          <p>Les entretiens et l'audio restent sur cet appareil ; seul l'audio envoyé pour transcription transite par ton serveur.</p>
        </div>
      </div>
    </div>
  );
}
