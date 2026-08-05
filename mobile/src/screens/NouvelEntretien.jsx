import { useRef, useState } from "react";
import { useRecorder } from "../lib/useRecorder.js";
import { LANGS, fmtTime } from "../lib/constants.js";

export default function NouvelEntretien({ settings, corpusList, onRetour, onCreer }) {
  const rec = useRecorder();
  const [blob, setBlob] = useState(null);
  const [source, setSource] = useState(null); // "micro" | "fichier"
  const [titre, setTitre] = useState("");
  const [langue, setLangue] = useState(settings.langueDefaut || "auto");
  const [vocabulaire, setVocabulaire] = useState(settings.vocabulaireDefaut || "");
  const [corpusId, setCorpusId] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const fileRef = useRef(null);

  const handleStart = () => rec.start();
  const handleStop = async () => {
    const b = await rec.stop();
    if (b) { setBlob(b); setSource("micro"); }
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBlob(f);
    setSource("fichier");
    if (!titre) setTitre(f.name.replace(/\.[^.]+$/, ""));
  };

  const recommencer = () => {
    setBlob(null);
    setSource(null);
    rec.cancel();
    if (fileRef.current) fileRef.current.value = "";
  };

  const valider = async () => {
    if (!blob) return;
    setEnvoi(true);
    await onCreer({ blob, titre: titre.trim() || "Entretien sans titre", langue, vocabulaire, corpusId: corpusId || null });
    setEnvoi(false);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onRetour} aria-label="Retour">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="topbar-title">Nouvel entretien</h1>
        <span style={{ width: 36 }} />
      </header>

      <div className="content">
        {!blob && (
          <>
            <div className="recorder-card">
              <div className="meter" aria-hidden="true">
                {rec.levels.map((h, i) => (
                  <span key={i} className="meter-bar"
                    style={{
                      height: `${h}%`,
                      background: rec.status === "enregistrement" ? "#E4B04A" : rec.status === "pause" ? "#7C6533" : "#2A3157",
                    }} />
                ))}
              </div>
              <div className="rec-time mono">{fmtTime(rec.seconds)}</div>
              <div className="rec-controls">
                {rec.status === "enregistrement" || rec.status === "pause" ? (
                  <>
                    <button className="rec-btn-secondaire" onClick={rec.status === "pause" ? rec.resume : rec.pause}
                      aria-label={rec.status === "pause" ? "Reprendre" : "Mettre en pause"}>
                      {rec.status === "pause" ? (
                        <svg width="18" height="18" viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 16 16"><rect x="3" y="2" width="3.6" height="12" rx="1" fill="currentColor" /><rect x="9.4" y="2" width="3.6" height="12" rx="1" fill="currentColor" /></svg>
                      )}
                    </button>
                    <button className="rec-btn active" onClick={handleStop} aria-label="Arrêter">
                      <span className="rec-square" />
                    </button>
                  </>
                ) : (
                  <button className="rec-btn" onClick={handleStart} aria-label="Enregistrer"
                    disabled={rec.status === "demande"}>
                    <span className="rec-dot" />
                  </button>
                )}
              </div>
              <p className="rec-hint">
                {rec.status === "enregistrement"
                  ? "Enregistrement en cours — touche ⏸ pour faire une pause"
                  : rec.status === "pause"
                  ? "En pause — touche ▶ pour reprendre exactement où tu en étais"
                  : rec.status === "demande"
                  ? "Demande d'accès au microphone…"
                  : "Touche pour démarrer l'enregistrement"}
              </p>
              {rec.erreur && <p className="rec-error">{rec.erreur}</p>}
            </div>

            <div className="divider"><span>ou</span></div>

            <button className="btn ghost full" onClick={() => fileRef.current?.click()}>
              Importer un fichier audio
            </button>
            <input ref={fileRef} type="file" accept="audio/*" hidden onChange={handleFile} />
          </>
        )}

        {blob && (
          <>
            <div className="recap-card">
              <div className="recap-icon">{source === "micro" ? "🎙️" : "📁"}</div>
              <div>
                <div className="recap-title">
                  {source === "micro" ? "Enregistrement prêt" : "Fichier importé"}
                </div>
                <div className="recap-sub">{(blob.size / (1024 * 1024)).toFixed(1)} Mo</div>
              </div>
              <button className="link-btn" onClick={recommencer}>Recommencer</button>
            </div>

            <label className="field">
              <span className="field-label">Titre de l'entretien</span>
              <input className="field-input" value={titre} onChange={(e) => setTitre(e.target.value)}
                placeholder="Ex. Awa T. — Adjamé" autoFocus />
            </label>

            <label className="field">
              <span className="field-label">Langue attendue</span>
              <select className="field-input" value={langue} onChange={(e) => setLangue(e.target.value)}>
                {Object.entries(LANGS).map(([k, l]) => (
                  <option key={k} value={k}>{l.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Vocabulaire local (facultatif)</span>
              <input className="field-input" value={vocabulaire} onChange={(e) => setVocabulaire(e.target.value)}
                placeholder="Ex. tontine, pagne, Adjamé, Cocody" />
              <span className="field-help">Guide le modèle vers les termes de ton terrain.</span>
            </label>

            {corpusList.length > 0 && (
              <label className="field">
                <span className="field-label">Corpus (facultatif)</span>
                <select className="field-input" value={corpusId} onChange={(e) => setCorpusId(e.target.value)}>
                  <option value="">Aucun</option>
                  {corpusList.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </label>
            )}

            <button className="btn primary full" onClick={valider} disabled={envoi}>
              {envoi ? "Envoi en cours…" : "Envoyer pour transcription"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
