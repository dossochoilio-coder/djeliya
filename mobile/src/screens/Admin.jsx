import { useEffect, useState } from "react";
import {
  adminListerUtilisateurs, adminAjusterCredits, adminDefinirCredits, adminSupprimerUtilisateur,
  adminMouvements, adminAttribuerForfait,
  listerForfaits, adminCreerForfait, adminDesactiverForfait,
} from "../lib/api.js";
import { fmtDate } from "../lib/constants.js";

export default function Admin({ settings, token, onRetour, showToast }) {
  const [vue, setVue] = useState("utilisateurs");
  const [utilisateurs, setUtilisateurs] = useState(null);
  const [forfaits, setForfaits] = useState(null);
  const [selection, setSelection] = useState(null);
  const [mouvements, setMouvements] = useState(null);
  const [delta, setDelta] = useState("");
  const [motif, setMotif] = useState("");
  const [modeDefinir, setModeDefinir] = useState(false);
  const [suppressionConfirm, setSuppressionConfirm] = useState(false);
  const [nouveauForfait, setNouveauForfait] = useState(false);
  const [nfNom, setNfNom] = useState("");
  const [nfPrix, setNfPrix] = useState("");
  const [nfCredits, setNfCredits] = useState("");
  const [nfDesc, setNfDesc] = useState("");

  const chargerUtilisateurs = () => adminListerUtilisateurs(settings.backendUrl, token).then(setUtilisateurs).catch(() => {});
  const chargerForfaits = () => listerForfaits(settings.backendUrl).then(setForfaits).catch(() => {});

  useEffect(() => { chargerUtilisateurs(); chargerForfaits(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ouvrirUtilisateur = (u) => {
    setSelection(u);
    setMouvements(null);
    adminMouvements(settings.backendUrl, token, u.id).then(setMouvements).catch(() => {});
  };

  const ajusterCredits = async () => {
    const val = parseFloat(delta);
    if (isNaN(val)) return;
    try {
      const r = modeDefinir
        ? await adminDefinirCredits(settings.backendUrl, token, selection.id, val, motif)
        : await adminAjusterCredits(settings.backendUrl, token, selection.id, val, motif);
      setSelection((s) => ({ ...s, credits: r.credits }));
      setDelta(""); setMotif("");
      chargerUtilisateurs();
      adminMouvements(settings.backendUrl, token, selection.id).then(setMouvements);
      showToast("Crédits mis à jour");
    } catch (e) {
      showToast("Échec : " + e.message);
    }
  };

  const supprimerUtilisateur = async () => {
    try {
      await adminSupprimerUtilisateur(settings.backendUrl, token, selection.id);
      showToast("Utilisateur supprimé");
      setSelection(null);
      chargerUtilisateurs();
    } catch (e) {
      showToast("Échec : " + e.message);
    }
  };

  const attribuer = async (forfaitId) => {
    try {
      const r = await adminAttribuerForfait(settings.backendUrl, token, selection.id, forfaitId);
      setSelection((s) => ({ ...s, credits: r.credits, forfait_actuel: r.forfait_actuel }));
      chargerUtilisateurs();
      adminMouvements(settings.backendUrl, token, selection.id).then(setMouvements);
      showToast("Forfait attribué");
    } catch (e) {
      showToast("Échec : " + e.message);
    }
  };

  const creerForfait = async () => {
    if (!nfNom.trim() || !nfPrix || !nfCredits) return;
    try {
      await adminCreerForfait(settings.backendUrl, token, {
        nom: nfNom.trim(), prixFcfa: parseInt(nfPrix, 10), creditsInclus: parseFloat(nfCredits), description: nfDesc,
      });
      setNfNom(""); setNfPrix(""); setNfCredits(""); setNfDesc(""); setNouveauForfait(false);
      chargerForfaits();
      showToast("Forfait créé");
    } catch (e) {
      showToast("Échec : " + e.message);
    }
  };

  const desactiver = async (id) => {
    try {
      await adminDesactiverForfait(settings.backendUrl, token, id);
      chargerForfaits();
      showToast("Forfait désactivé");
    } catch (e) {
      showToast("Échec : " + e.message);
    }
  };

  if (selection) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setSelection(null)} aria-label="Retour">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <h1 className="topbar-title truncate">{selection.nom || selection.email}</h1>
          <span style={{ width: 36 }} />
        </header>
        <div className="content">
          <div className="stat-strip">
            <div className="stat-chip">
              <span className="stat-num">{selection.credits}</span>
              <span className="stat-label">crédits</span>
            </div>
            <div className="stat-chip">
              <span className="stat-num" style={{ fontSize: 14 }}>{selection.email_verifie ? "Vérifié" : "Non vérifié"}</span>
              <span className="stat-label">e-mail</span>
            </div>
          </div>

          <div className="vue-switch">
            <button className={"vue-opt" + (!modeDefinir ? " vue-actif" : "")} onClick={() => setModeDefinir(false)}>Ajouter/retirer</button>
            <button className={"vue-opt" + (modeDefinir ? " vue-actif" : "")} onClick={() => setModeDefinir(true)}>Définir le solde</button>
          </div>
          <div className="field-inline">
            <input className="field-input" type="number" placeholder={modeDefinir ? "Nouveau solde, ex. 100" : "+10 ou -5"} value={delta}
              onChange={(e) => setDelta(e.target.value)} />
            <button className="btn primary sm" onClick={ajusterCredits}>{modeDefinir ? "Définir" : "Ajuster"}</button>
          </div>
          <input className="field-input" placeholder="Motif (facultatif)" value={motif}
            onChange={(e) => setMotif(e.target.value)} />

          {forfaits && forfaits.length > 0 && (
            <label className="field">
              <span className="field-label">Attribuer un forfait (paiement confirmé)</span>
              <select className="field-input" defaultValue="" onChange={(e) => e.target.value && attribuer(e.target.value)}>
                <option value="">Choisir…</option>
                {forfaits.map((f) => <option key={f.id} value={f.id}>{f.nom} — {f.credits_inclus} crédits</option>)}
              </select>
            </label>
          )}

          <h2 className="subsection-title">Historique des mouvements</h2>
          {mouvements === null ? (
            <div className="pending-card"><span className="spinner" />Chargement…</div>
          ) : (
            <ul className="gloss-list">
              {mouvements.map((m, i) => (
                <li key={i} className="gloss-row">
                  <div>
                    <span className="gloss-terme">{m.delta > 0 ? "+" : ""}{m.delta}</span>
                    <span className="gloss-sens"> — {m.motif}</span>
                  </div>
                  <span className="field-help">{fmtDate(m.cree_le)}</span>
                </li>
              ))}
            </ul>
          )}

          {!selection.est_admin && (
            <>
              <button className="link-btn" style={{ color: "#D96D5F", marginTop: 16 }}
                onClick={() => setSuppressionConfirm((s) => !s)}>
                Supprimer cet utilisateur
              </button>
              {suppressionConfirm && (
                <div className="glossaire-form" style={{ borderColor: "rgba(217,109,95,0.4)" }}>
                  <p className="note-banner err" style={{ margin: 0 }}>
                    Supprime définitivement ce compte, ses entretiens et ses corpus. Irréversible.
                  </p>
                  <button className="btn primary sm" style={{ background: "#D96D5F" }} onClick={supprimerUtilisateur}>
                    Confirmer la suppression
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onRetour} aria-label="Retour">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="topbar-title">Administration</h1>
        <span style={{ width: 36 }} />
      </header>

      <div className="content">
        <div className="vue-switch">
          <button className={"vue-opt" + (vue === "utilisateurs" ? " vue-actif" : "")} onClick={() => setVue("utilisateurs")}>Utilisateurs</button>
          <button className={"vue-opt" + (vue === "forfaits" ? " vue-actif" : "")} onClick={() => setVue("forfaits")}>Forfaits</button>
        </div>

        {vue === "utilisateurs" && (
          utilisateurs === null ? (
            <div className="pending-card"><span className="spinner" />Chargement…</div>
          ) : (
            <ul className="interview-list flush">
              {utilisateurs.map((u) => (
                <li key={u.id}>
                  <button className="interview-row" onClick={() => ouvrirUtilisateur(u)}>
                    <div className="row-main">
                      <span className="row-title">{u.nom || u.email}</span>
                      <span className="row-meta">{u.email} · {u.credits} crédits{u.est_admin ? " · admin" : ""}</span>
                    </div>
                    <span className="status-pill" style={{
                      color: u.email_verifie ? "#5FC6A8" : "#D96D5F",
                      borderColor: u.email_verifie ? "#5FC6A8" : "#D96D5F",
                    }}>
                      {u.email_verifie ? "Vérifié" : "Non vérifié"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        {vue === "forfaits" && (
          <>
            <button className="btn ghost full" onClick={() => setNouveauForfait((n) => !n)}>
              {nouveauForfait ? "Annuler" : "+ Nouveau forfait"}
            </button>
            {nouveauForfait && (
              <div className="glossaire-form">
                <input className="field-input" placeholder="Nom, ex. Chercheur Pro" value={nfNom} onChange={(e) => setNfNom(e.target.value)} />
                <input className="field-input" type="number" placeholder="Prix en FCFA" value={nfPrix} onChange={(e) => setNfPrix(e.target.value)} />
                <input className="field-input" type="number" placeholder="Crédits inclus" value={nfCredits} onChange={(e) => setNfCredits(e.target.value)} />
                <input className="field-input" placeholder="Description (facultatif)" value={nfDesc} onChange={(e) => setNfDesc(e.target.value)} />
                <button className="btn primary sm" onClick={creerForfait}>Créer</button>
              </div>
            )}
            {forfaits === null ? (
              <div className="pending-card"><span className="spinner" />Chargement…</div>
            ) : (
              <ul className="corpus-list">
                {forfaits.map((f) => (
                  <li key={f.id}>
                    <div className="forfait-card">
                      <div className="forfait-head">
                        <span className="forfait-nom">{f.nom}</span>
                        <span className="forfait-prix">{f.prix_fcfa.toLocaleString("fr-FR")} FCFA</span>
                      </div>
                      <p className="forfait-credits">{f.credits_inclus} crédits</p>
                      <button className="link-btn" onClick={() => desactiver(f.id)}>Désactiver</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
