/* ============================================================
   Stockage local de Djeliya.
   - Métadonnées et transcriptions -> localStorage (léger, JSON)
   - Fichiers audio -> IndexedDB (volumineux, binaire)
   ============================================================ */

const LS_INTERVIEWS = "djeliya:interviews";
const LS_SETTINGS = "djeliya:settings";
const LS_CORPUS = "djeliya:corpus";
const LS_GLOSSAIRE = "djeliya:glossaire";
const LS_AUTH = "djeliya:auth";
const IDB_NAME = "djeliya-audio";
const IDB_STORE = "blobs";

/* ---------------- Entretiens (localStorage) ---------------- */

export function loadInterviews() {
  try {
    const raw = localStorage.getItem(LS_INTERVIEWS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveInterviews(list) {
  try {
    localStorage.setItem(LS_INTERVIEWS, JSON.stringify(list));
  } catch (e) {
    console.error("Échec de l'enregistrement local :", e);
  }
}

/* ---------------- Réglages (localStorage) ---------------- */

const DEFAULT_SETTINGS = {
  backendUrl: "https://djeliya-production.up.railway.app",
  langueDefaut: "auto",
  vocabulaireDefaut: "",
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
}

/* ---------------- Corpus (regroupements d'entretiens) ---------------- */

export function loadCorpus() {
  try {
    const raw = localStorage.getItem(LS_CORPUS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCorpus(list) {
  localStorage.setItem(LS_CORPUS, JSON.stringify(list));
}

/* ---------------- Glossaire (termes locaux définis) ---------------- */

export function loadGlossaire() {
  try {
    const raw = localStorage.getItem(LS_GLOSSAIRE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGlossaire(list) {
  localStorage.setItem(LS_GLOSSAIRE, JSON.stringify(list));
}

/* ---------------- Session (jeton d'authentification) ---------------- */

export function loadAuth() {
  try {
    const raw = localStorage.getItem(LS_AUTH);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth) {
  if (auth) localStorage.setItem(LS_AUTH, JSON.stringify(auth));
  else localStorage.removeItem(LS_AUTH);
}

/* ---------------- Audio (IndexedDB) ---------------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAudioBlob(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAudioBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAudioBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function newId() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

/**
 * Demande au système un stockage "persistant" plutôt que "best-effort" —
 * sans ça, Android peut évincer les données de l'app (dont l'audio des
 * entretiens) sous pression de stockage, même sans intervention de
 * l'utilisateur. Les données ne doivent disparaître que si l'utilisateur
 * les supprime lui-même dans l'app.
 */
export async function demanderStockagePersistant() {
  try {
    if (navigator.storage?.persist) {
      const dejaAccorde = await navigator.storage.persisted();
      if (!dejaAccorde) await navigator.storage.persist();
    }
  } catch { /* API indisponible sur cet appareil : pas bloquant */ }
}
