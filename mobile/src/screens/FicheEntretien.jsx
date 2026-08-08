import { useEffect, useMemo, useRef, useState } from "react";
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { getAudioBlob } from "../lib/db.js";
import { computePeaks } from "../lib/waveform.js";
import { LANGS, STATUTS, fmtTime } from "../lib/constants.js";
import { useT } from "../lib/i18n.js";
import AnalyseView from "../components/AnalyseView.jsx";

export default function FicheEntretien({ interview, corpusList, methodes, couts, utilisateur, onOuvrirForfaits, onRetour, onUpdate, onCorrigerSegments, onSupprimer, onRelancer, onLancerAnalyse, onEnregistrerCodage, onListerCodages, onFiabilite, onContribuer, onExporterDocx, onExporterXlsx, showToast }) {
  const { t } = useT();
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
  const [vue, setVue] = useState("transcription");
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
    const texteAvant = interview.segments[segIdx].texte;
    const segCorrige = {
      ...interview.segments[segIdx], texte: draft, corrige: true,
      mots: draft.split(/\s+/).filter(Boolean).map((mot) => ({ mot, confiance: 1 })),
    };
    onCorrigerSegments(segIdx, segCorrige);
    setEditing(null);
    showToast(t("ficheEntretien.segmentCorrige"));
    if (draft !== texteAvant) onContribuer?.(texteAvant, draft);
  };
  const editWord = (segIdx, motIdx, nouveauMot) => {
    const seg = interview.segments[segIdx];
    const motAvant = seg.mots[motIdx].mot;
    const mots = seg.mots.map((m, j) => (j === motIdx ? { ...m, mot: nouveauMot, confiance: 1 } : m));
    onCorrigerSegments(segIdx, { ...seg, mots, texte: mots.map((m) => m.mot).join(" ") });
    if (nouveauMot !== motAvant) onContribuer?.(motAvant, nouveauMot);
  };

  /* --- Export / partage --- */
  const copier = async () => {
    await navigator.clipboard.writeText(texteComplet || "");
    showToast(t("ficheEntretien.texteCopie"));
    setMenuOpen(false);
  };

  const partager = async () => {
    try {
      const nomFichier = `${(interview.titre || "entretien").replace(/[^\w-]+/g, "_")}.txt`;
      const res = await Filesystem.writeFile({
        path: nomFichier,
        data: texteComplet || "",
        directory: Directory.Cache,
        encoding: "utf8",
      });
      await Share.share({
        title: interview.titre || "Djeliya",
        text: interview.titre || "",
        url: res.uri,
      });
    } catch (e) {
      showToast(e.message || "");
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
              <button className="menu-item" onClick={copier}>{t("ficheEntretien.copierTexte")}</button>
              <button className="menu-item" onClick={partager}>{t("ficheEntretien.partagerTexte")}</button>
              <button className="menu-item" onClick={() => { onExporterDocx?.(); setMenuOpen(false); }}>{t("ficheEntretien.exporterWord")}</button>
              <button className="menu-item" onClick={() => { onExporterXlsx?.(); setMenuOpen(false); }}>{t("ficheEntretien.exporterExcel")}</button>
              <button className="menu-item" onClick={() => { setCorpusPicker(true); setMenuOpen(false); }}>
                {t("ficheEntretien.modifier")}
              </button>
              <button className="menu-item danger" onClick={supprimer}>{t("ficheEntretien.supprimerEntretien")}</button>
            </div>
          )}
        </div>
      </header>

      <div className="content">
        <div className="meta-row">
          <span className="status-pill" style={{ color: st.color, borderColor: st.color }}>{t(`statuts.${interview.statut}`)}</span>
          <span className="lang-tag" style={{ color: L.color, borderColor: L.color }}>{L.code}</span>
          {duree > 0 && <span className="meta-item mono">{fmtTime(duree)}</span>}
        </div>

        {(() => {
          const c = corpusList.find((x) => x.id === interview.corpusId);
          return (
            <button className="corpus-inline" onClick={() => setCorpusPicker(true)}>
              {c ? `${t("ficheEntretien.corpusAssigne")}${c.nom}` : t("ficheEntretien.aucunCorpusAssigne")} <span className="corpus-inline-edit">{t("ficheEntretien.modifier")}</span>
            </button>
          );
        })()}

        {corpusPicker && (
          <div className="picker-card">
            <button className={"picker-opt" + (!interview.corpusId ? " picker-actif" : "")}
              onClick={() => { onUpdate({ ...interview, corpusId: null }); setCorpusPicker(false); }}>
              {t("ficheEntretien.aucun")}
            </button>
            {corpusList.map((c) => (
              <button key={c.id} className={"picker-opt" + (interview.corpusId === c.id ? " picker-actif" : "")}
                onClick={() => { onUpdate({ ...interview, corpusId: c.id }); setCorpusPicker(false); showToast(t("ficheEntretien.assigneA", { nom: c.nom })); }}>
                {c.nom}
              </button>
            ))}
            {corpusList.length === 0 && <p className="field-help">{t("ficheEntretien.choisirCorpus")}</p>}
          </div>
        )}

        {interview.note && <p className="note-banner">⚑ {interview.note}</p>}
        {interview.statut === "erreur" && (
          <div className="note-banner err">
            <p style={{ margin: 0 }}>{t("ficheEntretien.echecTranscription")}{interview.erreur || "—"}</p>
            <button className="btn primary sm" style={{ marginTop: 10 }} onClick={onRelancer}>
              {t("ficheEntretien.relancer")}
            </button>
          </div>
        )}

        {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" style={{ display: "none" }} />}

        {interview.statut === "termine" && (
          <div className="vue-switch">
            <button className={"vue-opt" + (vue === "transcription" ? " vue-actif" : "")}
              onClick={() => setVue("transcription")}>{t("ficheEntretien.transcription")}</button>
            <button className={"vue-opt" + (vue === "analyse" ? " vue-actif" : "")}
              onClick={() => setVue("analyse")}>{t("ficheEntretien.analyse")}</button>
            <button className={"vue-opt" + (vue === "codage" ? " vue-actif" : "")}
              onClick={() => setVue("codage")}>{t("ficheEntretien.codageEquipe")}</button>
          </div>
        )}

        {vue === "codage" && interview.statut === "termine" && (
          <CodageView interview={interview} onEnregistrer={onEnregistrerCodage}
            onLister={onListerCodages} onFiabilite={onFiabilite} onSeek={seek} />
        )}

        {vue === "analyse" && interview.statut === "termine" ? (
          <AnalyseView sujet={interview} methodes={methodes} onLancer={onLancerAnalyse} onSeek={seek}
            cout={couts?.analyse_qualitative} solde={utilisateur?.credits} onVoirForfaits={onOuvrirForfaits} />
        ) : vue === "codage" && interview.statut === "termine" ? null : (
        <>
        {audioUrl && (
          <div className="player-card">
            <div className="player-row">
              <button className="play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {playing ? (
                  <svg width="14" height="14" viewBox="0 0 16 16"><rect x="3" y="2" width="3.6" height="12" rx="1" fill="currentColor" /><rect x="9.4" y="2" width="3.6" height="12" rx="1" fill="currentColor" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
                )}
              </button>
              <span className="time mono">{fmtTime(time)}</span>
              <div className="ribbon" role="slider" aria-label="Position" tabIndex={0}
                aria-valuemin={0} aria-valuemax={duree} aria-valuenow={Math.round(time)}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seek(((e.clientX - r.left) / r.width) * duree);
                }}>
                {Array.from({ length: NBARS }).map((_, i) => {
                  const tt = (i / NBARS) * duree;
                  const past = tt <= time;
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
          <p className="note-banner">{t("ficheEntretien.audioIndisponible")}</p>
        )}

        {stats.conf !== null && (
          <div className="stat-strip">
            <div className="stat-chip">
              <span className="stat-num">{stats.conf}%</span>
              <span className="stat-label">{t("ficheEntretien.fiabilite")}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-num">{stats.aValider}</span>
              <span className="stat-label">{stats.aValider > 1 ? t("ficheEntretien.motsAVerifier") : t("ficheEntretien.motAVerifier")}</span>
            </div>
          </div>
        )}

        {(interview.statut === "en_attente" || interview.statut === "en_cours") && (
          <div className="pending-card">
            <span className="spinner" />
            {interview.statut === "en_attente" ? t("ficheEntretien.enFileAttente") : t("ficheEntretien.enCoursServeur")}
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
                    {seg.locuteur && <span className="locuteur-tag">{seg.locuteur.replace("SPEAKER_", "Locuteur ")}</span>}
                    {seg.corrige && <span className="corrige-tag">{t("ficheEntretien.corrige")}</span>}
                    <button className="edit-btn" onClick={() =>
                      editing === idx ? setEditing(null) : startEdit(idx)}>
                      {editing === idx ? t("ficheEntretien.annuler") : t("ficheEntretien.modifier")}
                    </button>
                  </div>

                  {editing === idx ? (
                    <div className="edit-zone">
                      <textarea className="edit-ta" rows={3} value={draft}
                        onChange={(e) => setDraft(e.target.value)} autoFocus />
                      <button className="btn primary sm" onClick={() => saveEdit(idx)}>{t("ficheEntretien.enregistrer")}</button>
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
          <p className="note-banner">{t("ficheEntretien.aucuneParole")}</p>
        )}
        </>
        )}
      </div>
    </div>
  );
}

function CodageView({ interview, onEnregistrer, onLister, onFiabilite, onSeek }) {
  const { t } = useT();
  const [codages, setCodages] = useState(null);
  const [brouillon, setBrouillon] = useState({});
  const [fiabilite, setFiabilite] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const c = await onLister();
        if (!annule) setCodages(c);
      } catch { if (!annule) setCodages([]); }
      setChargement(false);
    })();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.id]);

  const codagesParSegment = (idx) => (codages || []).filter((c) => c.segment_index === idx);

  const enregistrer = async (idx) => {
    const val = (brouillon[idx] || "").trim();
    if (!val) return;
    await onEnregistrer(idx, val);
    setCodages((prev) => {
      const sans = (prev || []).filter((c) => !(c.segment_index === idx && c.moi));
      return [...sans, { segment_index: idx, code: val, codeur: "Toi", moi: true }];
    });
    setBrouillon((b) => ({ ...b, [idx]: "" }));
  };

  const calculerFiabilite = async () => {
    setFiabilite("chargement");
    try {
      setFiabilite(await onFiabilite());
    } catch (e) {
      setFiabilite({ erreur: e.message });
    }
  };

  if (chargement) return <div className="pending-card"><span className="spinner" />{t("codage.chargement")}</div>;

  return (
    <div className="codage-view">
      <p className="section-intro">{t("codage.intro")}</p>

      <button className="btn ghost full" onClick={calculerFiabilite}>{t("codage.calculerFiabilite")}</button>
      {fiabilite === "chargement" && <div className="pending-card"><span className="spinner" />{t("codage.calcul")}</div>}
      {fiabilite && fiabilite !== "chargement" && !fiabilite.erreur && (
        <div className="analyse-texte-card">
          {fiabilite.nb_codeurs < 2 ? (
            <p className="analyse-texte">{t("codage.unSeulCodeur")}</p>
          ) : (
            <>
              <p className="analyse-texte">
                {t("codage.kappaMoyen", { n: fiabilite.nb_codeurs })}<strong>{fiabilite.kappa_moyen ?? "—"}</strong>
              </p>
              <p className="analyse-texte" style={{ fontSize: 12, opacity: 0.75 }}>
                {t("codage.kappaAide")}
              </p>
            </>
          )}
        </div>
      )}
      {fiabilite?.erreur && <p className="note-banner err">{fiabilite.erreur}</p>}

      <div className="transcript">
        {(interview.segments || []).map((seg, idx) => (
          <article key={idx} className="seg">
            <div className="seg-top">
              {typeof seg.debut === "number" && (
                <button className="tc mono" onClick={() => onSeek(seg.debut)}>{fmtTime(seg.debut)}</button>
              )}
            </div>
            <p className="seg-text">{seg.texte}</p>
            <div className="codage-chips">
              {codagesParSegment(idx).map((c, ci) => (
                <span key={ci} className={"codage-chip" + (c.moi ? " moi" : "")}>{c.code} · {c.codeur}</span>
              ))}
            </div>
            <div className="field-inline">
              <input className="field-input sm" placeholder={t("codage.tonCode")}
                value={brouillon[idx] || ""} onChange={(e) => setBrouillon((b) => ({ ...b, [idx]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && enregistrer(idx)} />
              <button className="btn primary sm" onClick={() => enregistrer(idx)}>{t("codage.coder")}</button>
            </div>
          </article>
        ))}
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
        title={low ? `${Math.round((m.confiance ?? 1) * 100)}%` : undefined}>
        {m.mot}
      </button>{" "}
    </span>
  );
}
