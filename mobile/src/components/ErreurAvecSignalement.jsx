import { messageAffichable, mailtoSignalement } from "../lib/erreurs.js";
import { useT } from "../lib/i18n.js";

/**
 * Bannière d'erreur professionnelle réutilisable : affiche un message présentable
 * (jamais un code d'erreur technique brut), avec un lien « Signaler ce problème »
 * qui pré-remplit un e-mail au support avec le détail technique complet.
 */
export default function ErreurAvecSignalement({ erreur, contexte, email, prefixe }) {
  const { t, langue } = useT();
  if (!erreur) return null;
  return (
    <p className="note-banner err">
      {prefixe}{messageAffichable(erreur, langue)}{" "}
      <a className="link-inline" href={mailtoSignalement({ erreur, contexte, email, langue })}>
        {t("erreurs.signaler")}
      </a>
    </p>
  );
}
