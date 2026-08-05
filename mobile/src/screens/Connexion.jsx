import { useState } from "react";
import { inscription, connexion } from "../lib/api.js";
import logo from "../assets/logo-full.png";

export default function Connexion({ backendUrl, onConnecte }) {
  const [mode, setMode] = useState("connexion"); // "connexion" | "inscription"
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const valider = async () => {
    setErreur(null);
    if (!backendUrl) {
      setErreur("Configure d'abord l'adresse du serveur (voir plus bas).");
      return;
    }
    setEnvoi(true);
    try {
      const data = mode === "connexion"
        ? await connexion(backendUrl, { email, motDePasse })
        : await inscription(backendUrl, { email, motDePasse, nom });
      onConnecte(data);
    } catch (e) {
      setErreur(e.message || "Échec de la connexion.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="screen connexion-screen">
      <div className="connexion-hero">
        <img src={logo} alt="Djeliya" className="brand-logo" />
        <p className="connexion-tag">La parole des terrains, structurée pour la recherche.</p>
      </div>

      <div className="content">
        <div className="vue-switch">
          <button className={"vue-opt" + (mode === "connexion" ? " vue-actif" : "")}
            onClick={() => setMode("connexion")}>Connexion</button>
          <button className={"vue-opt" + (mode === "inscription" ? " vue-actif" : "")}
            onClick={() => setMode("inscription")}>Créer un compte</button>
        </div>

        {mode === "inscription" && (
          <label className="field">
            <span className="field-label">Nom</span>
            <input className="field-input" value={nom} onChange={(e) => setNom(e.target.value)}
              placeholder="Dr Aya Kouassi" />
          </label>
        )}

        <label className="field">
          <span className="field-label">E-mail</span>
          <input className="field-input" type="email" value={email} autoCapitalize="none"
            onChange={(e) => setEmail(e.target.value)} placeholder="toi@labo.ci" />
        </label>

        <label className="field">
          <span className="field-label">Mot de passe</span>
          <input className="field-input" type="password" value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)} placeholder="8 caractères minimum"
            onKeyDown={(e) => e.key === "Enter" && valider()} />
        </label>

        {erreur && <p className="note-banner err">{erreur}</p>}
        {!backendUrl && (
          <p className="note-banner">
            Aucun serveur configuré. Renseigne l'adresse Railway dans les réglages une fois connecté,
            ou redémarre l'app après l'avoir configurée.
          </p>
        )}

        <button className="btn primary full" onClick={valider} disabled={envoi || !email || !motDePasse}>
          {envoi ? "…" : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
        </button>
      </div>
    </div>
  );
}
