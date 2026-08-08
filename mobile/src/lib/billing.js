import { registerPlugin } from "@capacitor/core";

/**
 * Pont vers le greffon natif Android (DjeliyaBillingPlugin.java) — n'a d'effet
 * réel que sur Android natif ; sur web, les appels échoueront simplement
 * (attrapés par l'appelant), ce qui est le comportement voulu puisque
 * Google Play Billing n'existe que dans l'app Android elle-même.
 */
const DjeliyaBilling = registerPlugin("DjeliyaBilling");

export default DjeliyaBilling;
