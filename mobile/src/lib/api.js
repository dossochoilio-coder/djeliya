/* ============================================================
   Communication avec le serveur Djeliya (FastAPI sur Railway).
   ============================================================ */

function clean(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

async function lireErreur(res) {
  const txt = await res.text().catch(() => "");
  try {
    return JSON.parse(txt).detail || txt;
  } catch {
    return txt || `Erreur ${res.status}`;
  }
}

function headersAuth(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ---------------- Santé du serveur ---------------- */

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

/* ---------------- Authentification ---------------- */

export async function inscription(backendUrl, { email, motDePasse, nom }) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, mot_de_passe: motDePasse, nom: nom || "" }),
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json(); // { token, utilisateur }
}

export async function connexion(backendUrl, { email, motDePasse }) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/auth/connexion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, mot_de_passe: motDePasse }),
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

/* ---------------- Corpus / équipes ---------------- */

export async function creerCorpusDistant(backendUrl, token, nom) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/corpus`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headersAuth(token) },
    body: JSON.stringify({ nom }),
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

export async function listerCorpusDistant(backendUrl, token) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/corpus`, { headers: headersAuth(token) });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

export async function rejoindreCorpus(backendUrl, token, code) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/corpus/rejoindre`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headersAuth(token) },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

export async function membresCorpus(backendUrl, token, corpusId) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/corpus/${corpusId}/membres`, { headers: headersAuth(token) });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

/* ---------------- Transcriptions ---------------- */

export async function createTranscription(backendUrl, token, { blob, filename, langue, vocabulaire, corpusId, titre }) {
  const base = clean(backendUrl);
  if (!base) throw new Error("Configure d'abord l'adresse du serveur dans Réglages.");
  const form = new FormData();
  form.append("audio", blob, filename || "entretien.webm");
  form.append("langue", langue || "auto");
  form.append("vocabulaire", vocabulaire || "");
  form.append("corpus_id", corpusId || "");
  form.append("titre", titre || "");

  const res = await fetch(`${base}/api/transcriptions`, { method: "POST", body: form, headers: headersAuth(token) });
  if (!res.ok) throw new Error(`Le serveur a refusé l'envoi (${res.status}). ${await lireErreur(res)}`.slice(0, 200));
  return res.json(); // { id, statut }
}

export async function getTranscription(backendUrl, token, jobId) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/transcriptions/${jobId}`, { headers: headersAuth(token) });
  if (res.status === 404) {
    const err = new Error("Cet entretien n'existe plus sur le serveur (probablement redémarré depuis).");
    err.introuvable = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Introuvable sur le serveur (${res.status})`);
  return res.json();
}

export async function lancerAnalyse(backendUrl, token, jobId, contexte) {
  const base = clean(backendUrl);
  const form = new FormData();
  form.append("contexte", contexte || "");
  const res = await fetch(`${base}/api/transcriptions/${jobId}/analyser`, {
    method: "POST", body: form, headers: headersAuth(token),
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

/* ---------------- Codage collaboratif ---------------- */

export async function enregistrerCodage(backendUrl, token, jobId, segmentIndex, code) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/transcriptions/${jobId}/codages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headersAuth(token) },
    body: JSON.stringify({ segment_index: segmentIndex, code }),
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

export async function listerCodages(backendUrl, token, jobId) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/transcriptions/${jobId}/codages`, { headers: headersAuth(token) });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

export async function fiabiliteInterCodeurs(backendUrl, token, jobId) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/transcriptions/${jobId}/fiabilite`, { headers: headersAuth(token) });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

/* ---------------- Contribution aux langues locales ---------------- */

export async function majPreferences(backendUrl, token, contributionLanguesLocales) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/auth/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headersAuth(token) },
    body: JSON.stringify({ contribution_langues_locales: contributionLanguesLocales }),
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

export async function envoyerContribution(backendUrl, token, { langue, texteOriginal, texteCorrige }) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/contributions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headersAuth(token) },
    body: JSON.stringify({ langue, texte_original: texteOriginal, texte_corrige: texteCorrige }),
  });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}

export async function nombreContributions(backendUrl, token) {
  const base = clean(backendUrl);
  const res = await fetch(`${base}/api/contributions/nombre`, { headers: headersAuth(token) });
  if (!res.ok) throw new Error(await lireErreur(res));
  return res.json();
}
