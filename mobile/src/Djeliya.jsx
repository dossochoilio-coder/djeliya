import { useState, useEffect, useRef, useMemo } from "react";

/* ============================================================
   DJELIYA — Plateforme de transcription pour la recherche
   qualitative multilingue (français · dioula · baoulé · anglais)
   ============================================================ */

const LANGS = {
  fr:  { code: "FR",  name: "Français", color: "#7C9CF5" },
  dyu: { code: "DYU", name: "Dioula",   color: "#E4B04A" },
  bci: { code: "BCI", name: "Baoulé",   color: "#D96D5F" },
  en:  { code: "EN",  name: "Anglais",  color: "#5FC6A8" },
};

const DUREE = 96; // secondes de l'extrait affiché

const SEGMENTS_INIT = [
  {
    id: 1, speaker: "Dr Kouassi", role: "chercheuse", lang: "fr", start: 0, end: 7,
    words: [
      { w: "Merci", c: 0.98 }, { w: "de", c: 0.99 }, { w: "m'accueillir,", c: 0.97 },
      { w: "Tantie", c: 0.91 }, { w: "Awa.", c: 0.95 }, { w: "Pouvez-vous", c: 0.97 },
      { w: "me", c: 0.99 }, { w: "raconter", c: 0.98 }, { w: "comment", c: 0.99 },
      { w: "vous", c: 0.99 }, { w: "avez", c: 0.99 }, { w: "commencé", c: 0.97 },
      { w: "votre", c: 0.99 }, { w: "commerce", c: 0.96 }, { w: "ici,", c: 0.98 },
      { w: "à", c: 0.99 }, { w: "Adjamé", c: 0.93 }, { w: "?", c: 1 },
    ],
  },
  {
    id: 2, speaker: "Awa T.", role: "enquêtée", lang: "fr", start: 7, end: 18,
    words: [
      { w: "Ah,", c: 0.96 }, { w: "ça", c: 0.98 }, { w: "fait", c: 0.98 },
      { w: "longtemps", c: 0.97 }, { w: "hein.", c: 0.9 }, { w: "J'ai", c: 0.98 },
      { w: "commencé", c: 0.97 }, { w: "en", c: 0.99 }, { w: "2009,", c: 0.94 },
      { w: "avec", c: 0.99 }, { w: "un", c: 0.99 }, { w: "petit", c: 0.98 },
      { w: "étal", c: 0.71, alts: ["étale", "état", "hôtel"] },
      { w: "de", c: 0.98 },
      { w: "pagnes.", c: 0.78, alts: ["panneaux", "campagnes"] },
      { w: "Au", c: 0.99 }, { w: "début", c: 0.98 }, { w: "c'était", c: 0.97 },
      { w: "dur,", c: 0.96 }, { w: "il", c: 0.99 }, { w: "n'y", c: 0.98 },
      { w: "avait", c: 0.98 }, { w: "pas", c: 0.99 }, { w: "l'argent.", c: 0.95 },
    ],
  },
  {
    id: 3, speaker: "Awa T.", role: "enquêtée", lang: "dyu", start: 18, end: 26,
    translation: "Petit à petit, notre travail a grandi. L'argent manquait, mais nous n'avons pas abandonné.",
    words: [
      { w: "Dɔɔni", c: 0.88 }, { w: "dɔɔni,", c: 0.9 }, { w: "an", c: 0.86 },
      { w: "ka", c: 0.9 }, { w: "baara", c: 0.82, alts: ["bara", "baraka"] },
      { w: "bonyara.", c: 0.74, alts: ["bɔnyara", "bonya ra"] },
      { w: "Wari", c: 0.89 }, { w: "tun", c: 0.85 }, { w: "tɛ,", c: 0.87 },
      { w: "nka", c: 0.88 }, { w: "an", c: 0.9 }, { w: "ma", c: 0.91 },
      { w: "dabila.", c: 0.79, alts: ["da bila", "dabla"] },
    ],
  },
  {
    id: 4, speaker: "Dr Kouassi", role: "chercheuse", lang: "fr", start: 26, end: 35,
    words: [
      { w: "Et", c: 0.99 }, { w: "comment", c: 0.99 }, { w: "faisiez-vous", c: 0.96 },
      { w: "pour", c: 0.99 }, { w: "financer", c: 0.97 }, { w: "la", c: 0.99 },
      { w: "marchandise,", c: 0.95 }, { w: "au", c: 0.99 }, { w: "tout", c: 0.98 },
      { w: "début", c: 0.98 }, { w: "?", c: 1 },
    ],
  },
  {
    id: 5, speaker: "Awa T.", role: "enquêtée", lang: "fr", start: 35, end: 50,
    words: [
      { w: "C'est", c: 0.98 }, { w: "la", c: 0.99 },
      { w: "tontine", c: 0.76, alts: ["tantine", "cantine"] },
      { w: "qui", c: 0.99 }, { w: "m'a", c: 0.98 }, { w: "sauvée.", c: 0.96 },
      { w: "Chaque", c: 0.98 }, { w: "semaine", c: 0.98 }, { w: "on", c: 0.99 },
      { w: "cotise,", c: 0.81, alts: ["cotisait", "quotise"] },
      { w: "chacune", c: 0.94 }, { w: "prend", c: 0.97 }, { w: "son", c: 0.99 },
      { w: "tour.", c: 0.97 }, { w: "Sans", c: 0.98 }, { w: "ça,", c: 0.97 },
      { w: "la", c: 0.99 }, { w: "banque", c: 0.97 }, { w: "là,", c: 0.92 },
      { w: "ils", c: 0.98 }, { w: "ne", c: 0.99 }, { w: "regardent", c: 0.96 },
      { w: "pas", c: 0.99 }, { w: "les", c: 0.99 }, { w: "femmes", c: 0.98 },
      { w: "du", c: 0.99 }, { w: "marché.", c: 0.97 },
    ],
  },
  {
    id: 6, speaker: "Awa T.", role: "enquêtée", lang: "bci", start: 50, end: 58,
    translation: "Celui qui travaille bien finit toujours par obtenir quelque chose. [Proverbe]",
    note: "Segment baoulé — validation par un locuteur recommandée",
    words: [
      { w: "Sran", c: 0.68, alts: ["Sranin", "Sara n"] },
      { w: "ng'ɔ", c: 0.7 }, { w: "di", c: 0.82 },
      { w: "junman", c: 0.64, alts: ["jouman", "dyunman"] },
      { w: "kpa'n,", c: 0.72 }, { w: "ɔ", c: 0.8 },
      { w: "ɲan", c: 0.69, alts: ["nyan", "gnan"] },
      { w: "like.", c: 0.66, alts: ["liké", "li ke"] },
    ],
  },
  {
    id: 7, speaker: "Awa T.", role: "enquêtée", lang: "en", start: 58, end: 72,
    words: [
      { w: "Sometimes", c: 0.95 }, { w: "I", c: 0.99 }, { w: "buy", c: 0.97 },
      { w: "from", c: 0.98 }, { w: "Ghana.", c: 0.96 }, { w: "My", c: 0.98 },
      { w: "supplier", c: 0.9 }, { w: "speaks", c: 0.95 }, { w: "English,", c: 0.97 },
      { w: "so", c: 0.98 }, { w: "we", c: 0.99 }, { w: "manage", c: 0.93 },
      { w: "—", c: 1 },
      { w: "small", c: 0.87 }, { w: "small.", c: 0.85, alts: ["smallsmall"] },
    ],
  },
  {
    id: 8, speaker: "Awa T.", role: "enquêtée", lang: "fr", start: 72, end: 96,
    words: [
      { w: "Aujourd'hui", c: 0.97 }, { w: "j'ai", c: 0.98 }, { w: "trois", c: 0.98 },
      { w: "apprenties.", c: 0.89 }, { w: "Mon", c: 0.99 }, { w: "rêve,", c: 0.96 },
      { w: "c'est", c: 0.98 }, { w: "d'ouvrir", c: 0.96 }, { w: "un", c: 0.99 },
      { w: "vrai", c: 0.97 }, { w: "magasin", c: 0.96 }, { w: "à", c: 0.99 },
      { w: "Cocody.", c: 0.92 }, { w: "Si", c: 0.98 }, { w: "Dieu", c: 0.97 },
      { w: "le", c: 0.99 }, { w: "veut,", c: 0.97 }, { w: "on", c: 0.99 },
      { w: "va", c: 0.99 }, { w: "y", c: 0.98 }, { w: "arriver.", c: 0.97 },
    ],
  },
];

const ENTRETIENS = [
  { id: "E05", titre: "Fatou D. — Treichville", duree: "38:04", statut: "validé" },
  { id: "E06", titre: "Groupe tontine — Yopougon", duree: "1:02:17", statut: "validé" },
  { id: "E07", titre: "Awa T. — Adjamé", duree: "47:12", statut: "actif" },
  { id: "E08", titre: "Mariam K. — Bouaké", duree: "29:45", statut: "en cours" },
  { id: "E09", titre: "Coopérative — Korhogo", duree: "—", statut: "file" },
];

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* Forme d'onde pseudo-aléatoire mais déterministe */
function barH(i) {
  const v =
    Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.21) * Math.cos(i * 0.045));
  return 14 + Math.round(v * env * 78);
}

export default function Djeliya() {
  const [segments, setSegments] = useState(SEGMENTS_INIT);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [openWord, setOpenWord] = useState(null); // {seg, idx}
  const [editing, setEditing] = useState(null);   // seg id
  const [draft, setDraft] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");
  const transcriptRef = useRef(null);
  const segRefs = useRef({});

  /* Lecture simulée */
  useEffect(() => {
    if (!playing) return;
    const it = setInterval(() => {
      setTime((t) => {
        const nt = t + 0.1 * speed;
        if (nt >= DUREE) { setPlaying(false); return DUREE; }
        return nt;
      });
    }, 100);
    return () => clearInterval(it);
  }, [playing, speed]);

  const activeSeg = useMemo(
    () => segments.find((s) => time >= s.start && time < s.end),
    [time, segments]
  );

  /* Suivi du défilement pendant la lecture */
  useEffect(() => {
    if (!playing || !activeSeg) return;
    const el = segRefs.current[activeSeg.id];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [activeSeg?.id, playing]);

  /* Raccourci espace = lecture/pause (hors zones de saisie) */
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.code === "Space" && tag !== "TEXTAREA" && tag !== "INPUT") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const chooseAlt = (segId, idx, mot) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id !== segId
          ? s
          : {
              ...s,
              words: s.words.map((w, i) =>
                i === idx ? { w: mot, c: 1 } : w
              ),
            }
      )
    );
    setOpenWord(null);
    showToast("Mot corrigé et validé");
  };

  const validateWord = (segId, idx) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id !== segId
          ? s
          : { ...s, words: s.words.map((w, i) => (i === idx ? { ...w, c: 1 } : w)) }
      )
    );
    setOpenWord(null);
    showToast("Transcription confirmée");
  };

  const startEdit = (seg) => {
    setEditing(seg.id);
    setDraft(seg.words.map((w) => w.w).join(" "));
    setOpenWord(null);
  };

  const saveEdit = (segId) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id !== segId
          ? s
          : { ...s, words: draft.split(/\s+/).filter(Boolean).map((w) => ({ w, c: 1 })) }
      )
    );
    setEditing(null);
    showToast("Segment enregistré");
  };

  /* Statistiques */
  const stats = useMemo(() => {
    const parLangue = {};
    let confSum = 0, confN = 0;
    segments.forEach((s) => {
      parLangue[s.lang] = (parLangue[s.lang] || 0) + (s.end - s.start);
      s.words.forEach((w) => { confSum += w.c; confN++; });
    });
    const total = Object.values(parLangue).reduce((a, b) => a + b, 0);
    return {
      repartition: Object.entries(parLangue).map(([k, v]) => ({
        lang: k, pct: Math.round((v / total) * 100),
      })),
      conf: Math.round((confSum / confN) * 100),
      aValider: segments.reduce(
        (n, s) => n + s.words.filter((w) => w.c < 0.85).length, 0
      ),
    };
  }, [segments]);

  /* Forme d'onde : couleur selon la langue au temps t */
  const NBARS = 220;
  const langAt = (t) => {
    const s = segments.find((sg) => t >= sg.start && t < sg.end);
    return s ? s.lang : "fr";
  };

  const highlight = (txt) => {
    if (!query.trim()) return txt;
    const i = txt.toLowerCase().indexOf(query.toLowerCase());
    if (i === -1) return txt;
    return (
      <>
        {txt.slice(0, i)}
        <mark className="hl">{txt.slice(i, i + query.length)}</mark>
        {txt.slice(i + query.length)}
      </>
    );
  };

  return (
    <div className="app">
      <style>{CSS}</style>

      {/* ============ BARRE LATÉRALE ============ */}
      <aside className="sidebar">
        <div className="brand">
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <circle cx="15" cy="15" r="14" fill="none" stroke="#E4B04A" strokeWidth="1.6" />
            {[6, 9.5, 13, 16.5, 20, 23.5].map((x, i) => (
              <rect key={x} x={x} y={15 - [3, 6, 9, 7, 5, 2][i]} width="1.8"
                height={[6, 12, 18, 14, 10, 4][i]} rx="0.9" fill="#E4B04A" />
            ))}
          </svg>
          <div>
            <div className="brand-name">Djeliya</div>
            <div className="brand-sub">La parole des terrains</div>
          </div>
        </div>

        <nav className="nav">
          <button className="nav-item active">Entretiens</button>
          <button className="nav-item">Corpus</button>
          <button className="nav-item">Glossaires locaux</button>
          <button className="nav-item">Modèles de langue</button>
          <button className="nav-item">Exports</button>
        </nav>

        <div className="side-label">Corpus · Entrepreneuriat féminin</div>
        <div className="side-list">
          {ENTRETIENS.map((e) => (
            <button key={e.id} className={"side-row" + (e.statut === "actif" ? " on" : "")}>
              <span className="side-id">{e.id}</span>
              <span className="side-titre">{e.titre}</span>
              <span className={"dot " + e.statut} title={e.statut} />
            </button>
          ))}
        </div>

        <div className="side-user">
          <div className="avatar">AK</div>
          <div>
            <div className="user-name">Dr Aya Kouassi</div>
            <div className="user-org">CIRES · Univ. FHB</div>
          </div>
        </div>
      </aside>

      {/* ============ COLONNE PRINCIPALE ============ */}
      <main className="main">
        <header className="head">
          <div>
            <div className="crumb">Corpus Entrepreneuriat féminin / Adjamé</div>
            <h1 className="titre">E07 — Awa T., commerçante de pagnes</h1>
            <div className="meta">
              <span className="chip statut">À valider</span>
              <span className="meta-item">47 min 12 s</span>
              <span className="meta-item">2 locutrices</span>
              <span className="meta-item">4 langues détectées</span>
            </div>
          </div>
          <div className="head-actions">
            <div className="export-wrap">
              <button className="btn ghost" onClick={() => setExportOpen((o) => !o)}
                aria-expanded={exportOpen}>
                Exporter
              </button>
              {exportOpen && (
                <div className="menu" role="menu">
                  {["Word (.docx)", "NVivo (.qdpx)", "Sous-titres (.srt)", "Données (.json)"].map((f) => (
                    <button key={f} role="menuitem" className="menu-item"
                      onClick={() => { setExportOpen(false); showToast(`Export ${f.split(" ")[0]} lancé — E07_Awa`); }}>
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn primary" onClick={() => showToast("Entretien marqué comme validé")}>
              Valider l'entretien
            </button>
          </div>
        </header>

        {/* ---- RUBAN LINGUISTIQUE (signature) ---- */}
        <section className="ribbon-card" aria-label="Lecteur audio">
          <div className="ribbon-top">
            <button className="play" onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Lecture"}>
              {playing ? (
                <svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="2" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="9.4" y="2" width="3.6" height="12" rx="1" fill="currentColor"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>
              )}
            </button>
            <span className="time mono">{fmt(time)}</span>
            <div className="ribbon" role="slider" aria-label="Position de lecture"
              aria-valuemin={0} aria-valuemax={DUREE} aria-valuenow={Math.round(time)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") setTime((t) => Math.min(DUREE, t + 2));
                if (e.key === "ArrowLeft") setTime((t) => Math.max(0, t - 2));
              }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setTime(((e.clientX - r.left) / r.width) * DUREE);
              }}>
              {Array.from({ length: NBARS }).map((_, i) => {
                const t = (i / NBARS) * DUREE;
                const past = t <= time;
                const c = LANGS[langAt(t)].color;
                return (
                  <span key={i} className="bar"
                    style={{
                      height: `${barH(i)}%`,
                      background: c,
                      opacity: past ? 1 : 0.28,
                    }} />
                );
              })}
              <span className="playhead" style={{ left: `${(time / DUREE) * 100}%` }} />
            </div>
            <span className="time mono dim">{fmt(DUREE)}</span>
            <button className="speed mono" onClick={() =>
              setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 0.75 : 1))}>
              ×{speed}
            </button>
          </div>
          <div className="ribbon-legend">
            <span className="legend-note">Le ruban révèle les changements de langue —</span>
            {Object.values(LANGS).map((l) => (
              <span key={l.code} className="legend-item">
                <span className="sw" style={{ background: l.color }} />{l.name}
              </span>
            ))}
          </div>
        </section>

        {/* ---- TRANSCRIPTION ---- */}
        <section className="transcript-card">
          <div className="transcript-head">
            <h2 className="section-title">Transcription</h2>
            <div className="transcript-tools">
              <input className="search" type="search" placeholder="Rechercher dans l'entretien…"
                value={query} onChange={(e) => setQuery(e.target.value)} />
              <span className="tool-hint">Espace = lecture · clic sur un horodatage = navigation</span>
            </div>
          </div>

          <div className="transcript" ref={transcriptRef}>
            {segments.map((seg) => {
              const L = LANGS[seg.lang];
              const actif = activeSeg?.id === seg.id;
              return (
                <article key={seg.id} ref={(el) => (segRefs.current[seg.id] = el)}
                  className={"seg" + (actif ? " actif" : "")}
                  style={{ "--lc": L.color }}>
                  <div className="seg-side">
                    <button className="tc mono" onClick={() => setTime(seg.start)}
                      title="Aller à ce passage">
                      {fmt(seg.start)}
                    </button>
                    <span className="lang-tag" style={{ color: L.color, borderColor: L.color }}>
                      {L.code}
                    </span>
                  </div>

                  <div className="seg-body">
                    <div className="seg-top">
                      <span className={"speaker " + seg.role}>{seg.speaker}</span>
                      {seg.note && <span className="seg-note">⚑ {seg.note}</span>}
                      <button className="edit-btn" onClick={() =>
                        editing === seg.id ? setEditing(null) : startEdit(seg)}>
                        {editing === seg.id ? "Annuler" : "Modifier"}
                      </button>
                    </div>

                    {editing === seg.id ? (
                      <div className="edit-zone">
                        <textarea className="edit-ta" value={draft} rows={3}
                          onChange={(e) => setDraft(e.target.value)} autoFocus />
                        <button className="btn primary sm" onClick={() => saveEdit(seg.id)}>
                          Enregistrer
                        </button>
                      </div>
                    ) : (
                      <p className="seg-text">
                        {seg.words.map((w, i) => {
                          const low = w.c < 0.85;
                          const open = openWord && openWord.seg === seg.id && openWord.idx === i;
                          return (
                            <span key={i} className="wtok">
                              <button
                                className={"word" + (low ? " low" : "")}
                                onClick={() => low && setOpenWord(open ? null : { seg: seg.id, idx: i })}
                                tabIndex={low ? 0 : -1}
                                title={low ? `Fiabilité ${Math.round(w.c * 100)} % — cliquer pour corriger` : undefined}>
                                {highlight(w.w)}
                              </button>
                              {open && (
                                <span className="pop" role="dialog" aria-label="Corriger le mot">
                                  <span className="pop-label">
                                    Entendu à {Math.round(w.c * 100)} % — autres hypothèses :
                                  </span>
                                  <span className="pop-row">
                                    {(w.alts || []).map((a) => (
                                      <button key={a} className="alt"
                                        onClick={() => chooseAlt(seg.id, i, a)}>{a}</button>
                                    ))}
                                    <button className="alt ok"
                                      onClick={() => validateWord(seg.id, i)}>
                                      Garder « {w.w.replace(/[.,]$/, "")} »
                                    </button>
                                  </span>
                                </span>
                              )}
                              {" "}
                            </span>
                          );
                        })}
                      </p>
                    )}

                    {seg.translation && (
                      <p className="trad">Traduction — {seg.translation}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {/* ============ PANNEAU D'ANALYSE ============ */}
      <aside className="panel">
        <h2 className="section-title">Analyse de l'entretien</h2>

        <div className="stat-card">
          <div className="stat-big">{stats.conf}<span className="pct">%</span></div>
          <div className="stat-label">Fiabilité globale de la transcription</div>
          <div className="stat-sub">
            {stats.aValider} mot{stats.aValider > 1 ? "s" : ""} à vérifier
            <span className="low-demo"> (soulignés dans le texte)</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Répartition des langues</div>
          <div className="lang-bars">
            {stats.repartition.map(({ lang, pct }) => (
              <div key={lang} className="lang-row">
                <span className="lang-name">{LANGS[lang].name}</span>
                <span className="lang-track">
                  <span className="lang-fill"
                    style={{ width: `${pct}%`, background: LANGS[lang].color }} />
                </span>
                <span className="lang-pct mono">{pct} %</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Termes locaux repérés</div>
          <div className="gloss">
            {[
              ["tontine", "Épargne rotative entre membres d'un groupe"],
              ["pagne", "Tissu imprimé, unité de commerce textile"],
              ["dɔɔni dɔɔni", "« Petit à petit » (dioula)"],
              ["small small", "« Doucement » (anglais ouest-africain)"],
            ].map(([t, d]) => (
              <span key={t} className="gloss-chip" title={d}>{t}</span>
            ))}
          </div>
          <button className="link-btn"
            onClick={() => showToast("Termes ajoutés au glossaire du corpus")}>
            Ajouter au glossaire du corpus
          </button>
        </div>

        <div className="stat-card">
          <div className="stat-label">Traitement appliqué</div>
          <ul className="pipeline">
            <li><span className="ok">✓</span> Réduction du bruit de fond (marché)</li>
            <li><span className="ok">✓</span> Séparation des locutrices</li>
            <li><span className="ok">✓</span> Détection de langue par segment</li>
            <li><span className="ok">✓</span> Correction contextuelle IA</li>
            <li><span className="wait">…</span> Validation humaine en cours</li>
          </ul>
        </div>
      </aside>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/* ============================================================ CSS */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');

:root {
  --nuit: #0E1226;
  --surface: #161B33;
  --surface-2: #1D2342;
  --ligne: #2A3157;
  --ivoire: #F1EEE4;
  --ivoire-dim: #A9ADC4;
  --or: #E4B04A;
  --ok: #5FC6A8;
}
* { box-sizing: border-box; margin: 0; }
.app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr) 300px;
  background:
    radial-gradient(1100px 500px at 85% -10%, rgba(228,176,74,0.07), transparent 60%),
    var(--nuit);
  color: var(--ivoire);
  font-family: 'Instrument Sans', system-ui, sans-serif;
  font-size: 15px;
}
.mono { font-family: 'JetBrains Mono', monospace; }
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
button:focus-visible, input:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
  outline: 2px solid var(--or); outline-offset: 2px; border-radius: 4px;
}

/* ---- Barre latérale ---- */
.sidebar {
  border-right: 1px solid var(--ligne);
  padding: 22px 16px;
  display: flex; flex-direction: column; gap: 20px;
  background: rgba(14,18,38,0.6);
}
.brand { display: flex; gap: 11px; align-items: center; }
.brand-name {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800; font-size: 21px; letter-spacing: 0.2px;
}
.brand-sub { font-size: 11.5px; color: var(--ivoire-dim); }
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  text-align: left; padding: 8px 11px; border-radius: 8px;
  color: var(--ivoire-dim); font-weight: 500; font-size: 14px;
}
.nav-item:hover { background: var(--surface); color: var(--ivoire); }
.nav-item.active { background: var(--surface-2); color: var(--ivoire); }
.side-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em;
  color: var(--ivoire-dim); padding: 0 4px;
}
.side-list { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: auto; }
.side-row {
  display: grid; grid-template-columns: 34px 1fr 8px; align-items: center; gap: 8px;
  padding: 8px 9px; border-radius: 8px; text-align: left; font-size: 13px;
  color: var(--ivoire-dim);
}
.side-row:hover { background: var(--surface); }
.side-row.on { background: var(--surface-2); color: var(--ivoire); }
.side-id { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; opacity: 0.8; }
.side-titre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 7px; height: 7px; border-radius: 50%; }
.dot.validé { background: var(--ok); }
.dot.actif { background: var(--or); }
.dot.en { background: #7C9CF5; }
.dot.file { background: var(--ligne); }
.side-user {
  display: flex; gap: 10px; align-items: center;
  border-top: 1px solid var(--ligne); padding-top: 16px;
}
.avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--surface-2); border: 1px solid var(--or);
  display: grid; place-items: center; font-size: 12px; font-weight: 600; color: var(--or);
}
.user-name { font-size: 13.5px; font-weight: 600; }
.user-org { font-size: 11.5px; color: var(--ivoire-dim); }

/* ---- Colonne principale ---- */
.main { padding: 26px 30px 40px; display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; flex-wrap: wrap; }
.crumb { font-size: 12.5px; color: var(--ivoire-dim); margin-bottom: 5px; }
.titre {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 700; font-size: 27px; line-height: 1.15; letter-spacing: 0.1px;
}
.meta { display: flex; gap: 14px; align-items: center; margin-top: 9px; flex-wrap: wrap; }
.meta-item { font-size: 13px; color: var(--ivoire-dim); }
.chip.statut {
  font-size: 12px; font-weight: 600; color: var(--or);
  border: 1px solid rgba(228,176,74,0.5); border-radius: 999px; padding: 3px 10px;
}
.head-actions { display: flex; gap: 10px; align-items: center; }
.btn {
  border-radius: 9px; padding: 9px 15px; font-weight: 600; font-size: 13.5px;
  transition: transform 0.06s ease, background 0.15s ease;
}
.btn:active { transform: scale(0.98); }
.btn.primary { background: var(--or); color: #1B1503; }
.btn.primary:hover { background: #EFC066; }
.btn.ghost { border: 1px solid var(--ligne); color: var(--ivoire); }
.btn.ghost:hover { background: var(--surface); }
.btn.sm { padding: 7px 12px; font-size: 12.5px; }
.export-wrap { position: relative; }
.menu {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 30;
  background: var(--surface-2); border: 1px solid var(--ligne); border-radius: 10px;
  padding: 6px; min-width: 190px; box-shadow: 0 14px 34px rgba(0,0,0,0.45);
}
.menu-item {
  display: block; width: 100%; text-align: left; padding: 8px 10px;
  border-radius: 7px; font-size: 13.5px;
}
.menu-item:hover { background: var(--surface); }

/* ---- Ruban linguistique ---- */
.ribbon-card {
  background: var(--surface); border: 1px solid var(--ligne);
  border-radius: 14px; padding: 16px 18px 13px;
}
.ribbon-top { display: flex; align-items: center; gap: 13px; }
.play {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  background: var(--or); color: #1B1503; display: grid; place-items: center;
  transition: transform 0.1s ease;
}
.play:hover { transform: scale(1.05); }
.time { font-size: 12.5px; min-width: 42px; }
.time.dim { color: var(--ivoire-dim); }
.ribbon {
  position: relative; flex: 1; height: 64px; cursor: pointer;
  display: flex; align-items: center; gap: 1.5px; border-radius: 6px;
}
.bar { flex: 1; min-width: 1px; border-radius: 2px; transition: opacity 0.2s linear; }
.playhead {
  position: absolute; top: -5px; bottom: -5px; width: 2px;
  background: var(--ivoire); border-radius: 2px;
  box-shadow: 0 0 10px rgba(241,238,228,0.8);
}
.speed {
  font-size: 12px; border: 1px solid var(--ligne); border-radius: 7px;
  padding: 5px 9px; color: var(--ivoire-dim);
}
.speed:hover { color: var(--ivoire); background: var(--surface-2); }
.ribbon-legend {
  display: flex; gap: 15px; align-items: center; flex-wrap: wrap;
  margin-top: 11px; padding-left: 53px; font-size: 12px; color: var(--ivoire-dim);
}
.legend-note { font-style: italic; }
.legend-item { display: inline-flex; gap: 6px; align-items: center; }
.sw { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }

/* ---- Transcription ---- */
.transcript-card {
  background: var(--surface); border: 1px solid var(--ligne);
  border-radius: 14px; padding: 20px 22px; min-width: 0;
}
.section-title {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-size: 16px; font-weight: 700; letter-spacing: 0.2px;
}
.transcript-head {
  display: flex; justify-content: space-between; align-items: center;
  gap: 14px; flex-wrap: wrap; margin-bottom: 16px;
}
.transcript-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.search {
  background: var(--nuit); border: 1px solid var(--ligne); border-radius: 9px;
  color: var(--ivoire); padding: 8px 12px; font-size: 13.5px; width: 230px;
  font-family: inherit;
}
.search::placeholder { color: var(--ivoire-dim); }
.tool-hint { font-size: 11.5px; color: var(--ivoire-dim); }
.transcript { display: flex; flex-direction: column; gap: 4px; max-height: 460px; overflow: auto; padding-right: 6px; }
.seg {
  display: grid; grid-template-columns: 64px 1fr; gap: 14px;
  padding: 13px 12px; border-radius: 11px; border-left: 3px solid transparent;
}
.seg.actif { background: var(--surface-2); border-left-color: var(--lc); }
.seg-side { display: flex; flex-direction: column; gap: 7px; align-items: flex-start; }
.tc { font-size: 11.5px; color: var(--ivoire-dim); padding: 1px 2px; }
.tc:hover { color: var(--or); }
.lang-tag {
  font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600;
  border: 1px solid; border-radius: 5px; padding: 1.5px 5px;
}
.seg-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.speaker { font-size: 12.5px; font-weight: 600; }
.speaker.chercheuse { color: var(--ivoire-dim); }
.speaker.enquêtée { color: var(--ivoire); }
.seg-note { font-size: 11.5px; color: var(--or); }
.edit-btn {
  margin-left: auto; font-size: 11.5px; color: var(--ivoire-dim);
  opacity: 0; transition: opacity 0.12s ease;
}
.seg:hover .edit-btn, .edit-btn:focus-visible { opacity: 1; }
.edit-btn:hover { color: var(--ivoire); }
.seg-text { line-height: 1.85; font-size: 15.5px; }
.wtok { position: relative; }
.word { padding: 0; border-radius: 3px; cursor: default; }
.word.low {
  cursor: pointer;
  border-bottom: 2px dotted var(--or);
  padding-bottom: 1px;
}
.word.low:hover { background: rgba(228,176,74,0.14); }
.hl { background: rgba(124,156,245,0.4); color: inherit; border-radius: 2px; }
.pop {
  position: absolute; left: 0; top: calc(100% + 7px); z-index: 25;
  background: var(--surface-2); border: 1px solid var(--ligne); border-radius: 10px;
  padding: 10px 12px; min-width: 250px;
  box-shadow: 0 14px 34px rgba(0,0,0,0.5);
  display: block; font-size: 13px;
}
.pop-label { display: block; color: var(--ivoire-dim); font-size: 11.5px; margin-bottom: 8px; }
.pop-row { display: flex; gap: 6px; flex-wrap: wrap; }
.alt {
  border: 1px solid var(--ligne); border-radius: 7px; padding: 4px 9px; font-size: 12.5px;
}
.alt:hover { background: var(--surface); border-color: var(--or); }
.alt.ok { color: var(--ok); border-color: rgba(95,198,168,0.5); }
.trad {
  margin-top: 7px; font-size: 13px; font-style: italic; color: var(--ivoire-dim);
  border-left: 2px solid var(--ligne); padding-left: 10px;
}
.edit-zone { display: flex; flex-direction: column; gap: 9px; align-items: flex-start; }
.edit-ta {
  width: 100%; background: var(--nuit); border: 1px solid var(--or);
  border-radius: 9px; color: var(--ivoire); padding: 10px 12px;
  font: inherit; line-height: 1.7; resize: vertical;
}

/* ---- Panneau d'analyse ---- */
.panel {
  border-left: 1px solid var(--ligne); padding: 26px 20px;
  display: flex; flex-direction: column; gap: 14px;
  background: rgba(14,18,38,0.6); overflow: auto;
}
.stat-card {
  background: var(--surface); border: 1px solid var(--ligne);
  border-radius: 12px; padding: 15px 16px;
}
.stat-big {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-size: 42px; font-weight: 800; line-height: 1; color: var(--ok);
}
.stat-big .pct { font-size: 20px; margin-left: 2px; }
.stat-label { font-size: 12.5px; font-weight: 600; color: var(--ivoire-dim); margin-top: 4px; }
.stat-card > .stat-label:first-child { margin-top: 0; margin-bottom: 11px; }
.stat-sub { font-size: 12.5px; color: var(--or); margin-top: 7px; }
.low-demo { color: var(--ivoire-dim); }
.lang-bars { display: flex; flex-direction: column; gap: 9px; }
.lang-row { display: grid; grid-template-columns: 62px 1fr 38px; gap: 9px; align-items: center; }
.lang-name { font-size: 12.5px; }
.lang-track { height: 7px; background: var(--nuit); border-radius: 99px; overflow: hidden; }
.lang-fill { display: block; height: 100%; border-radius: 99px; }
.lang-pct { font-size: 11px; color: var(--ivoire-dim); text-align: right; }
.gloss { display: flex; flex-wrap: wrap; gap: 7px; }
.gloss-chip {
  font-size: 12.5px; border: 1px solid var(--ligne); border-radius: 999px;
  padding: 4px 11px; cursor: help;
}
.gloss-chip:hover { border-color: var(--or); }
.link-btn { margin-top: 11px; font-size: 12.5px; color: var(--or); padding: 0; }
.link-btn:hover { text-decoration: underline; }
.pipeline { list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 13px; padding: 0; }
.pipeline .ok { color: var(--ok); margin-right: 7px; }
.pipeline .wait { color: var(--or); margin-right: 7px; }

/* ---- Toast ---- */
.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--surface-2); border: 1px solid var(--or);
  border-radius: 10px; padding: 11px 18px; font-size: 13.5px; z-index: 60;
  box-shadow: 0 14px 34px rgba(0,0,0,0.5);
  animation: rise 0.22s ease;
}
@keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } }

/* ---- Réactivité ---- */
@media (max-width: 1140px) {
  .app { grid-template-columns: minmax(0, 1fr); }
  .sidebar { display: none; }
  .panel { border-left: none; border-top: 1px solid var(--ligne); }
}
@media (max-width: 640px) {
  .main { padding: 18px 14px 28px; }
  .titre { font-size: 21px; }
  .ribbon-legend { padding-left: 0; }
  .seg { grid-template-columns: 1fr; gap: 6px; }
  .seg-side { flex-direction: row; align-items: center; }
  .search { width: 100%; }
  .transcript { max-height: none; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;
