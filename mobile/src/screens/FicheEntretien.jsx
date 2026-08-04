import { useEffect, useMemo, useRef, useState } from "react";
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { getAudioBlob } from "../lib/db.js";
import { computePeaks } from "../lib/waveform.js";
import { LANGS, STATUTS, fmtTime } from "../lib/constants.js";

export default function FicheEntretien({ interview, corpusList, onRetour, onUpdate, onSupprimer, onRelancer, showToast }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioIntrouvable, setAudioIntrouvable] = useState(false);
  const [peaks, setPeaks] = useState(interview.peaks || null);
  const [time, setTime] = useState(0);
  const [duree, setDuree] = useState(interview.dureeSec || 0);
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [corpusPicker, setCorpusPicker] = useState(false);
  const audioRef = useRef(null);

  const L = LANGS[interview.langueDetectee] || LANGS[interview.langue] || LANGS.auto;
  const st = STATUTS[interview.statut] || STATUTS.brouillon;

  /* Charger l'audio local */
  useEffect(() => {
    let url;
    (async () => {
      const blob = await getAudioBlob(interview.id).catch(() => null);
      if (!blob) { setAudioIntrouvable(true); return; }
      url = URL.createObjectURL(blob);
      setAudioUrl(url);
      if (!peaks) {
        try {
          const { peaks: p, duree: d } = await computePeaks(blob);
          setPeaks(p);
          setDuree(d);
          onUpdate({ ...interview, peaks: p, dureeSec: d });
        } catch { /* forme d'onde facultative */ }
      }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.id]);

  /* Suivre la lecture */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setDuree(a.duration || duree);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [audioUrl, duree]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause(); else a.play();
    setPlaying(!playing);
  };

  const seek = (t) => {
    const a = audioRef.current;
    if (a) a.currentTime = t;
    setTime(t);
  };

  const activeSeg = useMemo(
    () => (interview.segments || []).find((s) => time >= s.debut && time < s.fin),
    [time, interview.segments]
  );

  /* La mise à jour du statut est gérée globalement dans App.jsx */

  const stats = useMemo(() => {
    const mots = (interview.segments || []).flatMap((s) => s.mots || []);
    if (!mots.length) return { conf: null, aValider: 0 };
    const somme = mots.reduce((a, m) => a + (m.confiance ?? 1), 0);
    return {
      conf: Math.round((somme / mots.length) * 100),
      aValider: mots.filter((m) => (m.confiance ?? 1) < 0.85).length,
    };
  }, [interview.segments]);

  const texteComplet = useMemo(
    () => (interview.segments || []).map((s) => s.texte).join("\n\n"),
    [interview.segments]
  );

  /* --- Édition --- */
  const startEdit = (segIdx) => {
    setEditing(segIdx);
    setDraft(interview.segments[segIdx].texte);
  };
  const saveEdit = (segIdx) => {
    const segments = interview.segments.map((s, i) =>
      i === segIdx ? { ...s, texte: draft, corrige: true, mots: (s.mots || []).map((m) => ({ ...m, confiance: 1 })) } : s
    );
    onUpdate({ ...interview, segments });
    setEditing(null);
    showToast("Segment corrigé");
  };
  const editWord = (segIdx, motIdx, nouveauMot) => {
    const segments = interview.segments.map((s, i) => {
      if (i !== segIdx) return s;
      const mots = s.mots.map((m, j) => (j === motIdx ? { ...m, mot: nouveauMot, confiance: 1 } : m));
      return { ...s, mots, texte: mots.map((m) => m.mot).join(" ") };
    });
    onUpdate({ ...interview, segments });
  };

  /* --- Export / partage --- */
  const copier = async () => {
    await navigator.clipboard.writeText(texteComplet || "(transcription vide)");
    showToast("Texte copié dans le presse-papiers");
    setMenuOpen(false);
  };

  const partager = async () => {
    try {
      const nomFichier = `${(interview.titre || "entretien").replace(/[^\w-]+/g, "_")}.txt`;
      const res = await Filesystem.writeFile({
        path: nomFichier,
        data: texteComplet || "(transcription vide)",
        directory: Directory.Cache,
        encoding: "utf8",
      });
      await Share.share({
        title: interview.titre || "Entretien Djeliya",
        text: "Transcription — " + (interview.titre || ""),
        url: res.uri,
      });
    } catch (e) {
      showToast("Partage indisponible : " + (e.message || ""));
    }
    setMenuOpen(false);
  };

  const supprimer = () => {
    setMenuOpen(false);
    onSupprimer(interview.id);
  };

  const NBARS = 160;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onRetour} aria-label="Retour">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="topbar-title truncate">{interview.titre}</h1>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Options">⋯</button>
          {menuOpen && (
            <div className="menu">
              <button className="menu-item" onClick={copier}>Copier le texte</button>
              <button className="menu-item" onClick={partager}>Partager / Exporter</button>
              <button className="menu-item" onClick={() => { setCorpusPicker(true); setMenuOpen(false); }}>
                Changer de corpus
              </button>
              <button className="menu-item danger" onClick={supprimer}>Supprimer l'entretien</button>
            </div>
          )}
        </div>
      </header>

      <div className="content">
        <div className="meta-row">
          <span className="status-pill" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
          <span className="lang-tag" style={{ color: L.color, borderColor: L.color }}>{L.code}</span>
          {duree > 0 && <span className="meta-item mono">{fmtTime(duree)}</span>}
        </div>

        {(() => {
          const c = corpusList.find((x) => x.id === interview.corpusId);
          return (
            <button className="corpus-inline" onClick={() => setCorpusPicker(true)}>
              {c ? `Corpus : ${c.nom}` : "Aucun corpus assigné"} <span className="corpus-inline-edit">modifier</span>
            </button>
          );
        })()}

        {corpusPicker && (
          <div className="picker-card">
            <button className={"picker-opt" + (!interview.corpusId ? " picker-actif" : "")}
              onClick={() => { onUpdate({ ...interview, corpusId: null }); setCorpusPicker(false); }}>
              Aucun
            </button>
            {corpusList.map((c) => (
              <button key={c.id} className={"picker-opt" + (interview.corpusId === c.id ? " picker-actif" : "")}
                onClick={() => { onUpdate({ ...interview, corpusId: c.id }); setCorpusPicker(false); showToast(`Assigné à « ${c.nom} »`); }}>
                {c.nom}
              </button>
            ))}
            {corpusList.length === 0 && <p className="field-help">Crée d'abord un corpus dans l'onglet Corpus.</p>}
          </div>
        )}

        {interview.note && <p className="note-banner">⚑ {interview.note}</p>}
        {interview.statut === "erreur" && (
          <div className="note-banner err">
            <p style={{ margin: 0 }}>Échec de la transcription : {interview.erreur || "erreur inconnue"}</p>
            <button className="btn primary sm" style={{ marginTop: 10 }} onClick={onRelancer}>
              Relancer la transcription
            </button>
          </div>
        )}

        {audioUrl && (
          <div className="player-card">
            <audio ref={audioRef} src={audioUrl} preload="metadata" />
            <div className="player-row">
              <button className="play" onClick={togglePlay} aria-label={playing ? "Pause" : "Lecture"}>
                {playing ? (
                  <svg width="14" height="14" viewBox="0 0 16 16"><rect x="3" y="2" width="3.6" height="12" rx="1" fill="currentColor" /><rect x="9.4" y="2" width="3.6" height="12" rx="1" fill="currentColor" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
                )}
              </button>
              <span className="time mono">{fmtTime(time)}</span>
              <div className="ribbon" role="slider" aria-label="Position de lecture" tabIndex={0}
                aria-valuemin={0} aria-valuemax={duree} aria-valuenow={Math.round(time)}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seek(((e.clientX - r.left) / r.width) * duree);
                }}>
                {Array.from({ length: NBARS }).map((_, i) => {
                  const t = (i / NBARS) * duree;
                  const past = t <= time;
                  const amp = peaks ? peaks[Math.floor((i / NBARS) * peaks.length)] : 0.4;
                  return (
                    <span key={i} className="bar" style={{
                      height: `${14 + amp * 78}%`,
                      background: L.color,
                      opacity: past ? 1 : 0.28,
                    }} />
                  );
                })}
                <span className="playhead" style={{ left: `${duree ? (time / duree) * 100 : 0}%` }} />
              </div>
              <span className="time mono dim">{fmtTime(duree)}</span>
            </div>
          </div>
        )}
        {audioIntrouvable && (
          <p className="note-banner">Audio indisponible sur cet appareil. La transcription reste consultable.</p>
        )}

        {stats.conf !== null && (
          <div className="stat-strip">
            <div className="stat-chip">
              <span className="stat-num">{stats.conf}%</span>
              <span className="stat-label">fiabilité</span>
            </div>
            <div className="stat-chip">
              <span className="stat-num">{stats.aValider}</span>
              <span className="stat-label">mot{stats.aValider > 1 ? "s" : ""} à vérifier</span>
            </div>
          </div>
        )}

        {(interview.statut === "en_attente" || interview.statut === "en_cours") && (
          <div className="pending-card">
            <span className="spinner" />
            {interview.statut === "en_attente" ? "En file d'attente sur le serveur…" : "Transcription en cours…"}
          </div>
        )}

        {(interview.segments || []).length > 0 && (
          <div className="transcript">
            {interview.segments.map((seg, idx) => {
              const actif = activeSeg === seg;
              return (
                <article key={idx} className={"seg" + (actif ? " actif" : "")}>
                  <div className="seg-top">
                    {typeof seg.debut === "number" && (
                      <button className="tc mono" onClick={() => seek(seg.debut)}>{fmtTime(seg.debut)}</button>
                    )}
                    {seg.corrige && <span className="corrige-tag">corrigé</span>}
                    <button className="edit-btn" onClick={() =>
                      editing === idx ? setEditing(null) : startEdit(idx)}>
                      {editing === idx ? "Annuler" : "Modifier"}
                    </button>
                  </div>

                  {editing === idx ? (
                    <div className="edit-zone">
                      <textarea className="edit-ta" rows={3} value={draft}
                        onChange={(e) => setDraft(e.target.value)} autoFocus />
                      <button className="btn primary sm" onClick={() => saveEdit(idx)}>Enregistrer</button>
                    </div>
                  ) : seg.mots && seg.mots.length ? (
                    <p className="seg-text">
                      {seg.mots.map((m, mi) => (
                        <Mot key={mi} m={m} onSave={(v) => editWord(idx, mi, v)} />
                      ))}
                    </p>
                  ) : (
                    <p className="seg-text">{seg.texte}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {interview.statut === "termine" && (interview.segments || []).length === 0 && (
          <p className="note-banner">Aucune parole détectée dans cet audio.</p>
        )}
      </div>
    </div>
  );
}

function Mot({ m, onSave }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(m.mot);
  const low = (m.confiance ?? 1) < 0.85;

  if (edit) {
    return (
      <input className="word-input mono" value={val} autoFocus
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEdit(false); if (val !== m.mot) onSave(val); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setVal(m.mot); setEdit(false); }
        }}
      />
    );
  }
  return (
    <span className="wtok">
      <button className={"word" + (low ? " low" : "")} onClick={() => low && setEdit(true)}
        title={low ? `Fiabilité ${Math.round((m.confiance ?? 1) * 100)} % — toucher pour corriger` : undefined}>
        {m.mot}
      </button>{" "}
    </span>
  );
}
