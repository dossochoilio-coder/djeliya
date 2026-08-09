export const LANGS = {
  auto: { code: "AUTO", name: "Détection auto", color: "#A9ADC4" },
  fr: { code: "FR", name: "Français", color: "#7C9CF5" },
  en: { code: "EN", name: "Anglais", color: "#5FC6A8" },
  dyu: { code: "DYU", name: "Dioula (expérimental)", color: "#E4B04A", experimental: true },
  bci: { code: "BCI", name: "Baoulé (expérimental)", color: "#D96D5F", experimental: true },
};

export const STATUTS = {
  brouillon: { label: "Brouillon", color: "#A9ADC4" },
  en_attente: { label: "En file", color: "#7C9CF5" },
  en_cours: { label: "Transcription…", color: "#E4B04A" },
  termine: { label: "Terminé", color: "#5FC6A8" },
  erreur: { label: "Erreur", color: "#D96D5F" },
};

export function fmtTime(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}
