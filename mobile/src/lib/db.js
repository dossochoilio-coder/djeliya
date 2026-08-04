/* ============================================================
   Stockage local de Djeliya.
   - Métadonnées et transcriptions -> localStorage (léger, JSON)
   - Fichiers audio -> IndexedDB (volumineux, binaire)
   ============================================================ */

const LS_INTERVIEWS = "djeliya:interviews";
const LS_SETTINGS = "djeliya:settings";
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
