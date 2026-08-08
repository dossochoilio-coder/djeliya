import { useT } from "../lib/i18n.js";

/**
 * Carte de confirmation affichée avant toute action qui consomme des crédits
 * (transcription, analyse, génération de guide/étude...). L'utilisateur voit le
 * coût exact et le solde restant avant de déclencher réellement l'appel au
 * serveur/à l'IA — jamais de consommation silencieuse.
 */
export default function ConfirmationCredits({ cout, solde, onConfirmer, onAnnuler, onVoirForfaits }) {
  const { t } = useT();
  const insuffisant = typeof solde === "number" && solde < cout;

  return (
    <div className="glossaire-form">
      <span className="field-label">{t("credits.confirmationTitre")}</span>
      <p className="theme-desc">
        {t("credits.coutAction")} <strong>{cout} {cout > 1 ? t("credits.creditsPluriel") : t("credits.creditUnique")}</strong>.
        {typeof solde === "number" && (
          <> {t("credits.soldeActuel")} <strong>{solde}</strong> {solde > 1 ? t("credits.creditsPluriel") : t("credits.creditUnique")} {t("credits.soldeApres")}.</>
        )}
      </p>
      {insuffisant && (
        <>
          <p className="note-banner err">{t("credits.insuffisant")}</p>
          {onVoirForfaits && (
            <button className="btn ghost sm" onClick={onVoirForfaits}>{t("credits.voirForfaits")}</button>
          )}
        </>
      )}
      <div className="field-inline">
        <button className="btn ghost sm" style={{ flex: 1 }} onClick={onAnnuler}>{t("credits.annuler")}</button>
        <button className="btn primary sm" style={{ flex: 1 }} onClick={onConfirmer} disabled={insuffisant}>
          {t("credits.confirmer")}
        </button>
      </div>
    </div>
  );
}
