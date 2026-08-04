/* ============================================================
   Communication avec le serveur Djeliya (FastAPI sur Railway).
   ============================================================ */

function clean(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

export async function checkHealth(backendUrl) {
  const base = clean(backendUrl);
  if (!base) return { ok: false, erreur: "Aucune adresse de serveur configurée." };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, erreur: `Réponse ${res.status}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, erreur: e.message || "Connexion impossible" };
  }
}

export async function fetchLanguages(backendUrl) {
  const base = clean(backendUrl);
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/languages`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function createTranscription(backendUrl, { blob, filename, langue, vocabulaire }) {
  const base = clean(backendUrl);
  if (!base) throw new Error("Configure d'abord l'adresse du serveur dans Réglages.");
  const form = new FormData();
  form.append("audio", blob, filename || "entretien.webm");
  form.append("langue", langue || "auto");
  form.append("vocabulaire", vocabulaire || "");

  const res = await fetch(`${base}/api/transcriptions`, { method: "POST", body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Le serveur a refusé l'envoi (${res.status}). ${txt.slice(0, 140)}`);
  }
  return res.json(); // { id, statut }
}

export async function getTranscription(backendUrl, jobId) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/transcriptions/${jobId}`);
  if (res.status === 404) {
    const err = new Error("Cet entretien n'existe plus sur le serveur (probablement redémarré depuis).");
    err.introuvable = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Introuvable sur le serveur (${res.status})`);
  return res.json();
}
