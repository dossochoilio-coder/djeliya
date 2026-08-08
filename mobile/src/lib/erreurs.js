/**
 * Transforme une erreur technique brute en message présentable, et prépare un
 * e-mail de signalement pré-rempli vers le support — pour qu'un chercheur ne
 * voie jamais un message du style « Expecting value: line 1 column 1 (char 0) »
 * ou « Failed to fetch » sans avoir un moyen simple de nous le faire remonter.
 */

const SUPPORT_EMAIL = "infos@dosco-game.com";

// Signatures typiques d'un message technique (erreur JS brute, JSON cassé,
// erreur réseau bas niveau...) plutôt qu'un message déjà rédigé par le serveur.
const SIGNATURES_TECHNIQUES = [
  /failed to fetch/i, /networkerror/i, /typeerror/i, /referenceerror/i,
  /expecting value/i, /unexpected token/i, /json/i, /line \d+ column \d+/i,
  /is not a function/i, /undefined is not/i, /null is not/i, /cannot read propert/i,
  /stack trace/i, /at [a-zA-Z0-9_.]+\s*\(/,
];

function texteBrut(erreur) {
  if (!erreur) return "";
  if (typeof erreur === "string") return erreur;
  return erreur.stack || erreur.message || String(erreur);
}

/** Message à afficher à l'utilisateur : garde les messages déjà soignés du
 * serveur tels quels, remplace les fuites techniques par une phrase professionnelle. */
export function messageAffichable(erreur, langue = "fr") {
  const texte = texteBrut(erreur).trim();
  const generique = langue === "en"
    ? "An unexpected technical error occurred. Please try again — if it persists, let us know."
    : "Une erreur technique inattendue s'est produite. Réessaie, et si le problème persiste, signale-le-nous.";
  if (!texte) return generique;
  if (SIGNATURES_TECHNIQUES.some((re) => re.test(texte))) return generique;
  return texte;
}

/** Construit un lien mailto: pré-rempli avec le détail technique complet, pour
 * que le support reçoive une information exploitable même quand l'utilisateur
 * ne voit à l'écran qu'un message simplifié. */
export function mailtoSignalement({ erreur, contexte, email, langue = "fr" }) {
  const texte = texteBrut(erreur) || "(non précisé)";
  const sujet = langue === "en"
    ? `Djeliya — technical issue (${contexte || "app"})`
    : `Djeliya — problème technique (${contexte || "app"})`;
  const lignes = langue === "en"
    ? [
        "Hello,", "", "I ran into a problem in the Djeliya app.", "",
        `Screen / action: ${contexte || "not specified"}`,
        `Account: ${email || "not signed in"}`,
        `Date: ${new Date().toISOString()}`,
        `Platform: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
        "", "Technical detail:", texte, "", "Additional description (optional):", "",
      ]
    : [
        "Bonjour,", "", "J'ai rencontré un problème dans l'application Djeliya.", "",
        `Écran / action : ${contexte || "non précisé"}`,
        `Compte : ${email || "non connecté"}`,
        `Date : ${new Date().toISOString()}`,
        `Plateforme : ${typeof navigator !== "undefined" ? navigator.userAgent : "inconnue"}`,
        "", "Détail technique :", texte, "", "Description complémentaire (facultatif) :", "",
      ];
  const corps = lignes.join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}

export { SUPPORT_EMAIL };
