import { useEffect, useState } from "react";
import { listerForfaits } from "../lib/api.js";

const CONTACT_ADMIN = "dosso.choilio@gmail.com";

export default function Forfaits({ settings, utilisateur, onRetour }) {
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
        <h1 className="topbar-title">Forfaits & crédits</h1>
        <span style={{ width: 36 }} />
      </header>

      <div className="content">
        <div className="stat-strip">
          <div className="stat-chip">
            <span className="stat-num">{utilisateur?.credits ?? "—"}</span>
            <span className="stat-label">crédits disponibles</span>
          </div>
          <div className="stat-chip">
            <span className="stat-num" style={{ fontSize: 15 }}>{utilisateur?.forfait_actuel || "Essai gratuit"}</span>
            <span className="stat-label">forfait actuel</span>
          </div>
        </div>

        <p className="section-intro">
          1 crédit ≈ 1 transcription courte ; une analyse qualitative coûte 2 crédits. Les crédits
          ne sont jamais consommés en cas d'échec (remboursement automatique).
        </p>

        {erreur && <p className="note-banner err">{erreur}</p>}

        {forfaits === null ? (
          <div className="pending-card"><span className="spinner" />Chargement des forfaits…</div>
        ) : forfaits.length === 0 ? (
          <p className="note-banner">Aucun forfait payant n'est encore proposé — profite de ton crédit d'essai gratuit.</p>
        ) : (
          <ul className="corpus-list">
            {forfaits.map((f) => (
              <li key={f.id}>
                <div className="forfait-card">
                  <div className="forfait-head">
                    <span className="forfait-nom">{f.nom}</span>
                    <span className="forfait-prix">{f.prix_fcfa.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                  <p className="forfait-credits">{f.credits_inclus} crédits inclus</p>
                  {f.description && <p className="field-help">{f.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {forfaits && forfaits.length > 0 && (
          <div className="note-banner">
            Pour souscrire : envoie le montant du forfait par Mobile Money (Orange Money, MTN Money,
            Moov Money) ou virement, puis écris à <strong>{CONTACT_ADMIN}</strong> avec ton e-mail de
            compte Djeliya et la preuve de paiement. Ton forfait sera activé sous peu.
          </div>
        )}
      </div>
    </div>
  );
}
