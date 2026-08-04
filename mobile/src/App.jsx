import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";

import Accueil from "./screens/Accueil.jsx";
import NouvelEntretien from "./screens/NouvelEntretien.jsx";
import FicheEntretien from "./screens/FicheEntretien.jsx";
import Reglages from "./screens/Reglages.jsx";

import { loadInterviews, saveInterviews, loadSettings, saveSettings, putAudioBlob, deleteAudioBlob, newId } from "./lib/db.js";
import { checkHealth, createTranscription, getTranscription } from "./lib/api.js";
import { fmtTime } from "./lib/constants.js";

export default function App() {
  const [interviews, setInterviews] = useState(() => loadInterviews());
  const [settings, setSettings] = useState(() => loadSettings());
  const [stack, setStack] = useState([{ screen: "accueil" }]);
  const [backendOk, setBackendOk] = useState(null);
  const [toast, setToast] = useState(null);

  const current = stack[stack.length - 1];

  /* Persistance */
  useEffect(() => saveInterviews(interviews), [interviews]);
  useEffect(() => saveSettings(settings), [settings]);

  /* Habillage natif : barre de statut sombre assortie au thème */
  useEffect(() => {
    if (Capacitor.getPlatform() === "android") {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: "#0E1226" }).catch(() => {});
    }
  }, []);

  /* Bouton retour matériel Android */
  useEffect(() => {
    const handle = CapApp.addListener("backButton", () => {
      setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    });
    return () => { handle.then((h) => h.remove()); };
  }, []);

  /* Vérification silencieuse de la connexion serveur */
  const verifierServeur = useCallback(async () => {
    if (!settings.backendUrl) { setBackendOk(false); return; }
    const r = await checkHealth(settings.backendUrl);
    setBackendOk(r.ok);
  }, [settings.backendUrl]);
  useEffect(() => { verifierServeur(); }, [verifierServeur]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  /* Navigation */
  const push = (screen, id) => setStack((s) => [...s, { screen, id }]);
  const retour = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  /* Sondage global des entretiens en cours de traitement */
  const pollingRef = useRef(false);
  useEffect(() => {
    const enAttente = interviews.some((i) => i.statut === "en_attente" || i.statut === "en_cours");
    if (!enAttente || pollingRef.current) return;
    pollingRef.current = true;
    const it = setInterval(async () => {
      const cibles = interviews.filter((i) => i.statut === "en_attente" || i.statut === "en_cours");
      if (cibles.length === 0) { clearInterval(it); pollingRef.current = false; return; }
      for (const i of cibles) {
        try {
          const job = await getTranscription(settings.backendUrl, i.jobId);
          setInterviews((prev) => prev.map((x) => x.id === i.id ? {
            ...x,
            statut: job.statut,
            segments: job.segments || [],
            langueDetectee: job.langue_detectee,
            note: job.note,
            erreur: job.erreur,
          } : x));
        } catch { /* nouvel essai au prochain intervalle */ }
      }
    }, 4000);
    return () => { clearInterval(it); pollingRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviews, settings.backendUrl]);

  /* Création d'un entretien : enregistrement local + envoi immédiat */
  const creerEntretien = async ({ blob, titre, langue, vocabulaire }) => {
    const id = newId();
    await putAudioBlob(id, blob);
    const brouillon = {
      id, titre, langue, statut: "en_attente", creeLe: new Date().toISOString(),
      duree: null, dureeSec: 0, segments: [], jobId: null,
    };
    setInterviews((prev) => [brouillon, ...prev]);
    setStack([{ screen: "accueil" }, { screen: "fiche", id }]);

    try {
      const { id: jobId } = await createTranscription(settings.backendUrl, {
        blob, filename: `${id}.webm`, langue, vocabulaire,
      });
      setInterviews((prev) => prev.map((x) => x.id === id ? { ...x, jobId, statut: "en_attente" } : x));
    } catch (e) {
      setInterviews((prev) => prev.map((x) => x.id === id ? { ...x, statut: "erreur", erreur: e.message } : x));
      showToast("Échec de l'envoi : " + e.message);
    }
  };

  const majEntretien = (updated) => {
    setInterviews((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated, duree: updated.dureeSec ? fmtTime(updated.dureeSec) : x.duree } : x)));
  };

  const supprimerEntretien = async (id) => {
    await deleteAudioBlob(id).catch(() => {});
    setInterviews((prev) => prev.filter((x) => x.id !== id));
    setStack([{ screen: "accueil" }]);
    showToast("Entretien supprimé");
  };

  /* Rendu de l'écran courant */
  let body;
  if (current.screen === "accueil") {
    body = (
      <Accueil
        interviews={interviews}
        backendOk={backendOk}
        onOpen={(id) => push("fiche", id)}
        onNouveau={() => push("nouveau")}
        onReglages={() => push("reglages")}
      />
    );
  } else if (current.screen === "nouveau") {
    body = (
      <NouvelEntretien
        settings={settings}
        onRetour={retour}
        onCreer={async (payload) => { await creerEntretien(payload); }}
      />
    );
  } else if (current.screen === "fiche") {
    const interview = interviews.find((i) => i.id === current.id);
    body = interview ? (
      <FicheEntretien
        interview={interview}
        onRetour={retour}
        onUpdate={majEntretien}
        onSupprimer={supprimerEntretien}
        showToast={showToast}
      />
    ) : (
      <div className="screen"><div className="content"><p>Entretien introuvable.</p></div></div>
    );
  } else if (current.screen === "reglages") {
    body = (
      <Reglages
        settings={settings}
        onSave={(s) => { setSettings(s); verifierServeur(); }}
        onRetour={retour}
        showToast={showToast}
      />
    );
  }

  return (
    <>
      {body}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
