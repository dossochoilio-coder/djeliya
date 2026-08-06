import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";

import Connexion from "./screens/Connexion.jsx";
import Accueil from "./screens/Accueil.jsx";
import Corpus from "./screens/Corpus.jsx";
import Glossaire from "./screens/Glossaire.jsx";
import NouvelEntretien from "./screens/NouvelEntretien.jsx";
import FicheEntretien from "./screens/FicheEntretien.jsx";
import Reglages from "./screens/Reglages.jsx";
import Forfaits from "./screens/Forfaits.jsx";
import Admin from "./screens/Admin.jsx";
import Cgu from "./screens/Cgu.jsx";
import TabBar from "./components/TabBar.jsx";
import { LangueProvider } from "./lib/i18n.js";

import {
  loadInterviews, saveInterviews, loadSettings, saveSettings,
  loadGlossaire, saveGlossaire, loadAuth, saveAuth,
  putAudioBlob, getAudioBlob, deleteAudioBlob, newId, demanderStockagePersistant,
} from "./lib/db.js";
import {
  checkHealth, createTranscription, getTranscription, lancerAnalyse, enregistrerSegment,
  creerCorpusDistant, listerCorpusDistant, rejoindreCorpus, detailCorpus, lancerAnalyseCorpus,
  enregistrerCodage, listerCodages, fiabiliteInterCodeurs, envoyerContribution, fetchMethodes, moi,
  exporterDocxEntretien, exporterXlsxEntretien, exporterDocxCorpus, exporterXlsxCorpus,
} from "./lib/api.js";
import { partagerFichierBinaire } from "./lib/export.js";
import { fmtTime } from "./lib/constants.js";

export default function App() {
  const [auth, setAuth] = useState(() => loadAuth());
  const [interviews, setInterviews] = useState(() => loadInterviews());
  const [settings, setSettings] = useState(() => loadSettings());
  const [corpusList, setCorpusList] = useState([]);
  const [corpusDetail, setCorpusDetail] = useState(null);
  const [methodes, setMethodes] = useState({});
  const [glossaire, setGlossaire] = useState(() => loadGlossaire());

  const [tab, setTab] = useState("accueil");
  const [corpusSelectionne, setCorpusSelectionne] = useState(null);
  const [stack, setStack] = useState([]);
  const [backendOk, setBackendOk] = useState(null);
  const [toast, setToast] = useState(null);

  const current = stack.length ? stack[stack.length - 1] : { screen: tab };

  /* Persistance locale */
  useEffect(() => saveInterviews(interviews), [interviews]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveGlossaire(glossaire), [glossaire]);

  /* Habillage natif */
  useEffect(() => {
    if (Capacitor.getPlatform() === "android") {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: "#0E1226" }).catch(() => {});
    }
    demanderStockagePersistant();
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

  useEffect(() => {
    if (settings.backendUrl) fetchMethodes(settings.backendUrl).then((m) => m && setMethodes(m));
  }, [settings.backendUrl]);

  /* Charger les corpus distants une fois connecté */
  const rafraichirCorpus = useCallback(async () => {
    if (!auth) return;
    try {
      setCorpusList(await listerCorpusDistant(settings.backendUrl, auth.token));
    } catch { /* affiché via le bandeau serveur si hors ligne */ }
  }, [auth, settings.backendUrl]);
  useEffect(() => { rafraichirCorpus(); }, [rafraichirCorpus]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const push = (screen, id) => setStack((s) => [...s, { screen, id }]);
  const retour = () => setStack((s) => s.slice(0, -1));
  const changerOnglet = (t) => { setStack([]); setCorpusSelectionne(null); setTab(t); };

  const seDeconnecter = () => {
    saveAuth(null);
    setAuth(null);
    setStack([]);
    setTab("accueil");
  };

  /* Sondage global des entretiens en cours (transcription et/ou analyse) */
  const pollingRef = useRef(false);
  useEffect(() => {
    if (!auth) return;
    const enAttente = interviews.some((i) =>
      i.statut === "en_attente" || i.statut === "en_cours" || i.analyse_statut === "en_cours"
    );
    if (!enAttente || pollingRef.current) return;
    pollingRef.current = true;
    const it = setInterval(async () => {
      rafraichirUtilisateur();
      const cibles = interviews.filter((i) =>
        i.statut === "en_attente" || i.statut === "en_cours" || i.analyse_statut === "en_cours"
      );
      if (cibles.length === 0) { clearInterval(it); pollingRef.current = false; return; }
      for (const i of cibles) {
        try {
          const job = await getTranscription(settings.backendUrl, auth.token, i.jobId);
          setInterviews((prev) => prev.map((x) => x.id === i.id ? {
            ...x, statut: job.statut, segments: job.segments || [],
            langueDetectee: job.langue_detectee, note: job.note, erreur: job.erreur,
            analyse_statut: job.analyse_statut, analyse: job.analyse, analyse_erreur: job.analyse_erreur,
          } : x));
        } catch (e) {
          if (e.introuvable) {
            setInterviews((prev) => prev.map((x) => x.id === i.id ? {
              ...x, statut: "erreur",
              erreur: "Le serveur a redémarré depuis l'envoi. Relance une nouvelle transcription.",
            } : x));
          }
        }
      }
    }, 4000);
    return () => { clearInterval(it); pollingRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviews, settings.backendUrl, auth]);

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
      const { id: jobId } = await createTranscription(settings.backendUrl, auth.token, {
        blob, filename: `${id}.webm`, langue, vocabulaire, corpusId, titre,
      });
      setInterviews((prev) => prev.map((x) => x.id === id ? { ...x, jobId, statut: "en_attente" } : x));
      rafraichirUtilisateur();
    } catch (e) {
      setInterviews((prev) => prev.map((x) => x.id === id ? { ...x, statut: "erreur", erreur: e.message } : x));
      showToast("Échec de l'envoi : " + e.message);
    }
  };

  const majEntretien = (updated) => {
    setInterviews((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated, duree: updated.dureeSec ? fmtTime(updated.dureeSec) : x.duree } : x)));
  };

  /* Correction d'UN segment : appliquée localement tout de suite (à partir de l'état le
     plus récent, jamais d'un `interview` potentiellement périmé), puis persistée sur le
     serveur de façon atomique — deux corrections rapprochées ne peuvent plus s'écraser. */
  const corrigerSegment = async (interviewId, jobId, index, nouveauSegment) => {
    setInterviews((prev) => prev.map((x) => {
      if (x.id !== interviewId) return x;
      const segments = x.segments.map((s, i) => (i === index ? nouveauSegment : s));
      return { ...x, segments };
    }));
    try {
      await enregistrerSegment(settings.backendUrl, auth.token, jobId, index, nouveauSegment);
    } catch (e) {
      showToast("Correction gardée sur ce téléphone, mais pas encore synchronisée : " + e.message);
    }
  };

  const relancerEntretien = async (interview) => {
    const blob = await getAudioBlob(interview.id).catch(() => null);
    if (!blob) { showToast("Audio introuvable sur cet appareil, impossible de relancer."); return; }
    setInterviews((prev) => prev.map((x) => x.id === interview.id ? { ...x, statut: "en_attente", erreur: null } : x));
    try {
      const { id: jobId } = await createTranscription(settings.backendUrl, auth.token, {
        blob, filename: `${interview.id}.webm`, langue: interview.langue, vocabulaire: interview.vocabulaire,
        corpusId: interview.corpusId, titre: interview.titre,
      });
      setInterviews((prev) => prev.map((x) => x.id === interview.id ? { ...x, jobId, statut: "en_attente" } : x));
    } catch (e) {
      setInterviews((prev) => prev.map((x) => x.id === interview.id ? { ...x, statut: "erreur", erreur: e.message } : x));
      showToast("Échec de l'envoi : " + e.message);
    }
  };

  const lancerAnalyseEntretien = async (interview, contexte, methode, langue) => {
    setInterviews((prev) => prev.map((x) => x.id === interview.id ? { ...x, analyse_statut: "en_cours", analyse_erreur: null } : x));
    try {
      await lancerAnalyse(settings.backendUrl, auth.token, interview.jobId, contexte, methode, langue);
      rafraichirUtilisateur();
    } catch (e) {
      setInterviews((prev) => prev.map((x) => x.id === interview.id ? { ...x, analyse_statut: "erreur", analyse_erreur: e.message } : x));
      showToast("Échec du lancement de l'analyse : " + e.message);
    }
  };

  const supprimerEntretien = async (id) => {
    await deleteAudioBlob(id).catch(() => {});
    setInterviews((prev) => prev.filter((x) => x.id !== id));
    setStack([]);
    showToast("Entretien supprimé");
  };

  const creerCorpus = async (nom) => {
    try {
      await creerCorpusDistant(settings.backendUrl, auth.token, nom);
      await rafraichirCorpus();
      showToast("Corpus créé");
    } catch (e) {
      showToast("Échec : " + e.message);
    }
  };

  const rejoindreCorpusHandler = async (code) => {
    await rejoindreCorpus(settings.backendUrl, auth.token, code);
    await rafraichirCorpus();
    showToast("Corpus rejoint");
  };

  /* Charger le détail (dont l'analyse) du corpus sélectionné */
  useEffect(() => {
    if (!corpusSelectionne || !auth) { setCorpusDetail(null); return; }
    let annule = false;
    setCorpusDetail(null); // évite d'afficher un résultat périmé pendant le chargement
    detailCorpus(settings.backendUrl, auth.token, corpusSelectionne)
      .then((d) => { if (!annule) setCorpusDetail(d); })
      .catch(() => {});
    return () => { annule = true; };
  }, [corpusSelectionne, auth, settings.backendUrl]);

  /* Sondage de l'analyse de corpus en cours */
  useEffect(() => {
    if (!corpusDetail || corpusDetail.analyse_statut !== "en_cours") return;
    const it = setInterval(async () => {
      try {
        const d = await detailCorpus(settings.backendUrl, auth.token, corpusSelectionne);
        setCorpusDetail(d);
        if (d.analyse_statut !== "en_cours") clearInterval(it);
      } catch { /* nouvel essai au prochain intervalle */ }
    }, 4000);
    return () => clearInterval(it);
  }, [corpusDetail, corpusSelectionne, auth, settings.backendUrl]);

  const lancerAnalyseCorpusHandler = async (contexte, methode, langue) => {
    setCorpusDetail((prev) => ({ ...prev, analyse_statut: "en_cours", analyse_erreur: null }));
    try {
      await lancerAnalyseCorpus(settings.backendUrl, auth.token, corpusSelectionne, contexte, methode, langue);
    } catch (e) {
      setCorpusDetail((prev) => ({ ...prev, analyse_statut: "erreur", analyse_erreur: e.message }));
      showToast("Échec du lancement : " + e.message);
    }
  };

  const ajouterGlossaire = ({ terme, sens }) => {
    setGlossaire((prev) => [...prev, { id: newId(), terme, sens }]);
    showToast("Terme ajouté au glossaire");
  };
  const supprimerGlossaire = (id) => setGlossaire((prev) => prev.filter((e) => e.id !== id));

  const majUtilisateur = (utilisateur) => {
    const nouvelAuth = { ...auth, utilisateur };
    saveAuth(nouvelAuth);
    setAuth(nouvelAuth);
  };

  const exporterEntretien = async (interview, format) => {
    try {
      const fn = format === "docx" ? exporterDocxEntretien : exporterXlsxEntretien;
      const { blob, nomFichier } = await fn(settings.backendUrl, auth.token, interview.jobId);
      await partagerFichierBinaire(blob, nomFichier, interview.titre);
    } catch (e) {
      showToast("Échec de l'export : " + e.message);
    }
  };

  const exporterCorpus = async (corpusId, nomCorpus, format) => {
    try {
      const fn = format === "docx" ? exporterDocxCorpus : exporterXlsxCorpus;
      const { blob, nomFichier } = await fn(settings.backendUrl, auth.token, corpusId);
      await partagerFichierBinaire(blob, nomFichier, nomCorpus);
    } catch (e) {
      showToast("Échec de l'export : " + e.message);
    }
  };

  const rafraichirUtilisateur = async () => {
    try {
      const u = await moi(settings.backendUrl, auth.token);
      majUtilisateur(u);
    } catch { /* pas grave si ça échoue, l'affichage se remettra à jour au prochain appel */ }
  };

  const contribuerCorrection = async (langue, texteOriginal, texteCorrige) => {
    if (!auth.utilisateur.contribution_langues_locales) return;
    if (!["dyu", "bci"].includes(langue)) return;
    try {
      await envoyerContribution(settings.backendUrl, auth.token, { langue, texteOriginal, texteCorrige });
    } catch { /* contribution facultative : échec silencieux, ne bloque jamais la correction elle-même */ }
  };

  /* ---------------- Écran de connexion (bloque tout le reste) ---------------- */
  if (!auth) {
    return (
      <LangueProvider langue={settings.langueInterface || "fr"}>
        <Connexion
          backendUrl={settings.backendUrl}
          onConnecte={(data) => {
            saveAuth(data);
            setAuth(data);
            showToast(`Bienvenue, ${data.utilisateur.nom || data.utilisateur.email} !`);
          }}
        />
      </LangueProvider>
    );
  }

  /* ---------------- Écran empilé (au-dessus des onglets) ---------------- */
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
        methodes={methodes}
        onRetour={retour}
        onUpdate={majEntretien}
        onCorrigerSegments={(index, segment) => corrigerSegment(interview.id, interview.jobId, index, segment)}
        onSupprimer={supprimerEntretien}
        onRelancer={() => relancerEntretien(interview)}
        onLancerAnalyse={(contexte, methode, langue) => lancerAnalyseEntretien(interview, contexte, methode, langue)}
        onEnregistrerCodage={(segIdx, code) => enregistrerCodage(settings.backendUrl, auth.token, interview.jobId, segIdx, code)}
        onListerCodages={() => listerCodages(settings.backendUrl, auth.token, interview.jobId)}
        onFiabilite={() => fiabiliteInterCodeurs(settings.backendUrl, auth.token, interview.jobId)}
        onContribuer={(avant, apres) => contribuerCorrection(interview.langueDetectee || interview.langue, avant, apres)}
        onExporterDocx={() => exporterEntretien(interview, "docx")}
        onExporterXlsx={() => exporterEntretien(interview, "xlsx")}
        showToast={showToast}
      />
    ) : (
      <div className="screen"><div className="content"><p>Entretien introuvable.</p></div></div>
    );
  } else if (current.screen === "forfaits") {
    overlay = (
      <Forfaits settings={settings} utilisateur={auth.utilisateur} onRetour={retour} />
    );
  } else if (current.screen === "cgu") {
    overlay = <Cgu backendUrl={settings.backendUrl} onRetour={retour} />;
  } else if (current.screen === "admin") {
    overlay = auth.utilisateur.est_admin ? (
      <Admin settings={settings} token={auth.token} onRetour={retour} showToast={showToast} />
    ) : (
      <div className="screen"><div className="content"><p>Accès réservé.</p></div></div>
    );
  }

  /* ---------------- Onglets ---------------- */
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
        corpusDetail={corpusDetail}
        methodes={methodes}
        onSelectCorpus={setCorpusSelectionne}
        onCreer={creerCorpus}
        onRejoindre={rejoindreCorpusHandler}
        onOpenInterview={(id) => push("fiche", id)}
        onLancerAnalyse={lancerAnalyseCorpusHandler}
        onExporterDocx={(id, nom) => exporterCorpus(id, nom, "docx")}
        onExporterXlsx={(id, nom) => exporterCorpus(id, nom, "xlsx")}
        showToast={showToast}
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
        utilisateur={auth.utilisateur}
        token={auth.token}
        onSave={(s) => { setSettings(s); verifierServeur(); }}
        onDeconnexion={seDeconnecter}
        onMajUtilisateur={majUtilisateur}
        onOuvrirForfaits={() => push("forfaits")}
        onOuvrirAdmin={() => push("admin")}
        onOuvrirCgu={() => push("cgu")}
        onCompteSupprime={() => { seDeconnecter(); showToast("Compte supprimé"); }}
        showToast={showToast}
      />
    );
  }

  const montrerTabBar = stack.length === 0;

  return (
    <LangueProvider langue={settings.langueInterface || "fr"}>
      <div className={montrerTabBar ? "with-tabbar" : ""}>{overlay || body}</div>
      {montrerTabBar && <TabBar active={tab} onChange={changerOnglet} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </LangueProvider>
  );
}
