import { useState } from "react";
import { inscription, connexion, verifierEmail, renvoyerCode, motDePasseOublie, reinitialiserMotDePasse } from "../lib/api.js";
import logo from "../assets/logo-full.png";
import Cgu from "./Cgu.jsx";

function ChampMotDePasse({ value, onChange, placeholder, onEnter }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="champ-mdp">
      <input className="field-input" type={visible ? "text" : "password"} value={value}
        onChange={onChange} placeholder={placeholder}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()} />
      <button type="button" className="mdp-oeil" onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
        {visible ? (
          <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" stroke="currentColor" strokeWidth="1.4" /><circle cx="10" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.4" /></svg>
        ) : (
          <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M2.5 2.5l15 15M6.5 6.8C4.4 7.9 3 10 3 10s3 5.5 8 5.5c1.5 0 2.8-.4 3.9-1M9 4.6c.3 0 .6-.1 1-.1 5 0 8 5.5 8 5.5s-.6 1.1-1.7 2.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        )}
      </button>
    </div>
  );
}

export default function Connexion({ backendUrl, onConnecte }) {
  const [mode, setMode] = useState("connexion"); // connexion | inscription | verification | oubli | reset
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [nouveauMdp, setNouveauMdp] = useState("");
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [authEnAttente, setAuthEnAttente] = useState(null); // conservé pendant la vérification post-inscription
  const [accepteCgu, setAccepteCgu] = useState(false);
  const [voirCgu, setVoirCgu] = useState(false);

  const requireBackend = () => {
    if (!backendUrl) { setErreur("Configure d'abord l'adresse du serveur (voir plus bas)."); return false; }
    return true;
  };

  const valider = async () => {
    setErreur(null); setInfo(null);
    if (!requireBackend()) return;
    setEnvoi(true);
    try {
      if (mode === "connexion") {
        const data = await connexion(backendUrl, { email, motDePasse });
        if (!data.utilisateur.email_verifie) {
          setAuthEnAttente(data);
          setMode("verification");
        } else {
          onConnecte(data);
        }
      } else {
        if (!accepteCgu) { setErreur("Tu dois accepter les conditions d'utilisation pour créer un compte."); setEnvoi(false); return; }
        const data = await inscription(backendUrl, { email, motDePasse, nom, accepteCgu });
        if (!data.utilisateur.email_verifie) {
          setAuthEnAttente(data);
          setMode("verification");
          setInfo(data.email_envoye
            ? "Un code à 6 chiffres a été envoyé à ton adresse e-mail."
            : "Vérification e-mail indisponible pour l'instant — contacte l'administrateur si besoin.");
        } else {
          onConnecte(data);
        }
      }
    } catch (e) {
      setErreur(e.message || "Échec.");
    } finally {
      setEnvoi(false);
    }
  };

  const validerCode = async () => {
    setErreur(null);
    setEnvoi(true);
    try {
      await verifierEmail(backendUrl, { email, code });
      onConnecte(authEnAttente);
    } catch (e) {
      setErreur(e.message || "Code invalide.");
    } finally {
      setEnvoi(false);
    }
  };

  const renvoyer = async () => {
    setErreur(null); setInfo(null);
    try {
      const r = await renvoyerCode(backendUrl, email);
      setInfo(r.email_envoye ? "Nouveau code envoyé." : "L'envoi a échoué — réessaie plus tard.");
    } catch (e) {
      setErreur(e.message);
    }
  };

  const demanderReinitialisation = async () => {
    setErreur(null); setInfo(null);
    if (!requireBackend()) return;
    setEnvoi(true);
    try {
      await motDePasseOublie(backendUrl, email);
      setInfo("Si un compte existe avec cette adresse, un code de réinitialisation vient d'être envoyé.");
      setMode("reset");
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  };

  const validerReinitialisation = async () => {
    setErreur(null);
    setEnvoi(true);
    try {
      const data = await reinitialiserMotDePasse(backendUrl, { email, code, nouveauMotDePasse: nouveauMdp });
      onConnecte(data);
    } catch (e) {
      setErreur(e.message || "Échec de la réinitialisation.");
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
        {(mode === "connexion" || mode === "inscription") && (
          <>
            <div className="vue-switch">
              <button className={"vue-opt" + (mode === "connexion" ? " vue-actif" : "")}
                onClick={() => { setMode("connexion"); setErreur(null); }}>Connexion</button>
              <button className={"vue-opt" + (mode === "inscription" ? " vue-actif" : "")}
                onClick={() => { setMode("inscription"); setErreur(null); }}>Créer un compte</button>
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
              <ChampMotDePasse value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)}
                placeholder="8 caractères minimum" onEnter={valider} />
            </label>

            {mode === "connexion" && (
              <button className="link-btn" style={{ alignSelf: "flex-start" }}
                onClick={() => { setMode("oubli"); setErreur(null); setInfo(null); }}>
                Mot de passe oublié ?
              </button>
            )}

            {mode === "inscription" && (
              <label className="consent-row">
                <input type="checkbox" checked={accepteCgu} onChange={(e) => setAccepteCgu(e.target.checked)} />
                <span>
                  J'accepte les{" "}
                  <button type="button" className="link-inline" onClick={() => setVoirCgu(true)}>
                    conditions d'utilisation et la politique de confidentialité
                  </button>
                </span>
              </label>
            )}

            {erreur && <p className="note-banner err">{erreur}</p>}
            {!backendUrl && (
              <p className="note-banner">Aucun serveur configuré. Renseigne l'adresse Railway une fois connecté.</p>
            )}

            <button className="btn primary full" onClick={valider}
              disabled={envoi || !email || !motDePasse || (mode === "inscription" && !accepteCgu)}>
              {envoi ? "…" : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
            </button>
          </>
        )}

        {voirCgu && (
          <div className="cgu-overlay">
            <Cgu backendUrl={backendUrl} onRetour={() => setVoirCgu(false)} />
          </div>
        )}

        {mode === "verification" && (
          <>
            <p className="section-intro">
              Entre le code à 6 chiffres envoyé à <strong>{email}</strong> pour activer ton compte
              et recevoir ton crédit d'essai gratuit.
            </p>
            <label className="field">
              <span className="field-label">Code de vérification</span>
              <input className="field-input mono" value={code} inputMode="numeric" maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456" onKeyDown={(e) => e.key === "Enter" && validerCode()} />
            </label>
            {info && <p className="note-banner ok">{info}</p>}
            {erreur && <p className="note-banner err">{erreur}</p>}
            <button className="btn primary full" onClick={validerCode} disabled={envoi || code.length !== 6}>
              {envoi ? "…" : "Vérifier"}
            </button>
            <button className="link-btn" onClick={renvoyer}>Renvoyer le code</button>
          </>
        )}

        {mode === "oubli" && (
          <>
            <p className="section-intro">Renseigne ton adresse e-mail pour recevoir un code de réinitialisation.</p>
            <label className="field">
              <span className="field-label">E-mail</span>
              <input className="field-input" type="email" value={email} autoCapitalize="none"
                onChange={(e) => setEmail(e.target.value)} placeholder="toi@labo.ci"
                onKeyDown={(e) => e.key === "Enter" && demanderReinitialisation()} />
            </label>
            {erreur && <p className="note-banner err">{erreur}</p>}
            <button className="btn primary full" onClick={demanderReinitialisation} disabled={envoi || !email}>
              {envoi ? "…" : "Recevoir un code"}
            </button>
            <button className="link-btn" onClick={() => { setMode("connexion"); setErreur(null); }}>Retour à la connexion</button>
          </>
        )}

        {mode === "reset" && (
          <>
            {info && <p className="note-banner ok">{info}</p>}
            <label className="field">
              <span className="field-label">Code reçu par e-mail</span>
              <input className="field-input mono" value={code} inputMode="numeric" maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            </label>
            <label className="field">
              <span className="field-label">Nouveau mot de passe</span>
              <ChampMotDePasse value={nouveauMdp} onChange={(e) => setNouveauMdp(e.target.value)}
                placeholder="8 caractères minimum" onEnter={validerReinitialisation} />
            </label>
            {erreur && <p className="note-banner err">{erreur}</p>}
            <button className="btn primary full" onClick={validerReinitialisation}
              disabled={envoi || code.length !== 6 || nouveauMdp.length < 8}>
              {envoi ? "…" : "Réinitialiser et me connecter"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
