import { useState } from "react";
import { checkHealth } from "../lib/api.js";
import { LANGS } from "../lib/constants.js";
import logo from "../assets/logo-full.png";

export default function Reglages({ settings, onSave, onRetour, showToast }) {
  const [form, setForm] = useState(settings);
  const [test, setTest] = useState(null); // null | "en_cours" | {ok, ...}

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const tester = async () => {
    setTest("en_cours");
    const res = await checkHealth(form.backendUrl);
    setTest(res);
  };

  const enregistrer = () => {
    onSave(form);
    showToast("Réglages enregistrés");
    onRetour();
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onRetour} aria-label="Retour">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="topbar-title">Réglages</h1>
        <span style={{ width: 36 }} />
      </header>

      <div className="content">
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
              ? `Connecté — modèle « ${test.data.model} »`
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
