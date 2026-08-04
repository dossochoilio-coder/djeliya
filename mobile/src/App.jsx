import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";

import Accueil from "./screens/Accueil.jsx";
import Corpus from "./screens/Corpus.jsx";
import Glossaire from "./screens/Glossaire.jsx";
import NouvelEntretien from "./screens/NouvelEntretien.jsx";
import FicheEntretien from "./screens/FicheEntretien.jsx";
import Reglages from "./screens/Reglages.jsx";
import TabBar from "./components/TabBar.jsx";

import {
  loadInterviews, saveInterviews, loadSettings, saveSettings,
  loadCorpus, saveCorpus, loadGlossaire, saveGlossaire,
  putAudioBlob, getAudioBlob, deleteAudioBlob, newId,
} from "./lib/db.js";
import { checkHealth, createTranscription, getTranscription } from "./lib/api.js";
import { fmtTime } from "./lib/constants.js";

export default function App() {
  const [interviews, setInterviews] = useState(() => loadInterviews());
  const [settings, setSettings] = useState(() => loadSettings());
  const [corpusList, setCorpusList] = useState(() => loadCorpus());
  const [glossaire, setGlossaire] = useState(() => loadGlossaire());

  const [tab, setTab] = useState("accueil");
  const [corpusSelectionne, setCorpusSelectionne] = useState(null);
  const [stack, setStack] = useState([]); // écrans empilés au-dessus de l'onglet courant
  const [backendOk, setBackendOk] = useState(null);
  const [toast, setToast] = useState(null);

  const current = stack.length ? stack[stack.length - 1] : { screen: tab };

  /* Persistance */
  useEffect(() => saveInterviews(interviews), [interviews]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveCorpus(corpusList), [corpusList]);
  useEffect(() => saveGlossaire(glossaire), [glossaire]);

  /* Habillage natif */
  useEffect(() => {
    if (Capacitor.getPlatform() === "android") {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: "#0E1226" }).catch(() => {});
    }
  }, []);

  /* Bouton retour matériel Android */
  useEffect(() => {
    const handle = CapApp.addListener("backButton", () => {
      if (stack.length) setStack((s) => s.slice(0, -1));
      else if (corpusSelectionne) setCorpusSelectionne(null);
      else if (tab !== "accueil") setTab("accueil");
      else CapApp.exitApp();
    });
    return () => { handle.then((h) => h.remove()); };
  }, [stack, corpusSelectionne, tab]);

  const verifierServeur = useCallback(async () => {
    if (!settings.backendUrl) { setBackendOk(false); return; }
    const r = await checkHealth(settings.backendUrl);
    setBackendOk(r.ok);
  }, [settings.backendUrl]);
  useEffect(() => { verifierServeur(); }, [verifierServeur]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  /* Navigation */
  const push = (screen, id) => setStack((s) => [...s, { screen, id }]);
  const retour = () => setStack((s) => s.slice(0, -1));
  const changerOnglet = (t) => { setStack([]); setCorpusSelectionne(null); setTab(t); };

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
            ...x, statut: job.statut, segments: job.segments || [],
            langueDetectee: job.langue_detectee, note: job.note, erreur: job.erreur,
          } : x));
        } catch (e) {
          if (e.introuvable) {
            setInterviews((prev) => prev.map((x) => x.id === i.id ? {
              ...x, statut: "erreur",
              erreur: "Le serveur a redémarré depuis l'envoi. Relance une nouvelle transcription.",
            } : x));
          }
          /* autre erreur réseau : nouvel essai au prochain intervalle */
        }
      }
    }, 4000);
    return () => { clearInterval(it); pollingRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviews, settings.backendUrl]);

  /* Création d'un entretien */
  const creerEntretien = async ({ blob, titre, langue, vocabulaire, corpusId }) => {
    const id = newId();
    await putAudioBlob(id, blob);
    const brouillon = {
      id, titre, langue, vocabulaire, corpusId: corpusId || null,
      statut: "en_attente", creeLe: new Date().toISOString(),
      duree: null, dureeSec: 0, segments: [], jobId: null,
    };
    setInterviews((prev) => [brouillon, ...prev]);
    setStack([{ screen: "fiche", id }]);

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

  const relancerEntretien = async (interview) => {
    const blob = await getAudioBlob(interview.id).catch(() => null);
    if (!blob) { showToast("Audio introuvable sur cet appareil, impossible de relancer."); return; }
    setInterviews((prev) => prev.map((x) => x.id === interview.id ? { ...x, statut: "en_attente", erreur: null } : x));
    try {
      const { id: jobId } = await createTranscription(settings.backendUrl, {
        blob, filename: `${interview.id}.webm`, langue: interview.langue, vocabulaire: interview.vocabulaire,
      });
      setInterviews((prev) => prev.map((x) => x.id === interview.id ? { ...x, jobId, statut: "en_attente" } : x));
    } catch (e) {
      setInterviews((prev) => prev.map((x) => x.id === interview.id ? { ...x, statut: "erreur", erreur: e.message } : x));
      showToast("Échec de l'envoi : " + e.message);
    }
  };

  const supprimerEntretien = async (id) => {
    await deleteAudioBlob(id).catch(() => {});
    setInterviews((prev) => prev.filter((x) => x.id !== id));
    setStack([]);
    showToast("Entretien supprimé");
  };

  const creerCorpus = (nom) => {
    setCorpusList((prev) => [...prev, { id: newId(), nom, creeLe: new Date().toISOString() }]);
    showToast("Corpus créé");
  };

  const ajouterGlossaire = ({ terme, sens }) => {
    setGlossaire((prev) => [...prev, { id: newId(), terme, sens }]);
    showToast("Terme ajouté au glossaire");
  };

  const supprimerGlossaire = (id) => {
    setGlossaire((prev) => prev.filter((e) => e.id !== id));
  };

  /* Rendu de l'écran empilé (prioritaire sur les onglets) */
  let overlay = null;
  if (current.screen === "nouveau") {
    overlay = (
      <NouvelEntretien
        settings={settings}
        corpusList={corpusList}
        onRetour={retour}
        onCreer={async (payload) => { await creerEntretien(payload); }}
      />
    );
  } else if (current.screen === "fiche") {
    const interview = interviews.find((i) => i.id === current.id);
    overlay = interview ? (
      <FicheEntretien
        interview={interview}
        corpusList={corpusList}
        onRetour={retour}
        onUpdate={majEntretien}
        onSupprimer={supprimerEntretien}
        onRelancer={() => relancerEntretien(interview)}
        showToast={showToast}
      />
    ) : (
      <div className="screen"><div className="content"><p>Entretien introuvable.</p></div></div>
    );
  }

  /* Rendu de l'onglet courant */
  let body;
  if (tab === "accueil") {
    body = (
      <Accueil
        interviews={interviews}
        backendOk={backendOk}
        onOpen={(id) => push("fiche", id)}
        onNouveau={() => push("nouveau")}
      />
    );
  } else if (tab === "corpus") {
    body = (
      <Corpus
        corpusList={corpusList}
        interviews={interviews}
        selectedId={corpusSelectionne}
        onSelectCorpus={setCorpusSelectionne}
        onCreer={creerCorpus}
        onOpenInterview={(id) => push("fiche", id)}
      />
    );
  } else if (tab === "glossaire") {
    body = (
      <Glossaire
        interviews={interviews}
        entrees={glossaire}
        onAjouter={ajouterGlossaire}
        onSupprimer={supprimerGlossaire}
      />
    );
  } else if (tab === "reglages") {
    body = (
      <Reglages
        settings={settings}
        onSave={(s) => { setSettings(s); verifierServeur(); }}
        showToast={showToast}
      />
    );
  }

  const montrerTabBar = stack.length === 0;

  return (
    <>
      <div className={montrerTabBar ? "with-tabbar" : ""}>{overlay || body}</div>
      {montrerTabBar && <TabBar active={tab} onChange={changerOnglet} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
