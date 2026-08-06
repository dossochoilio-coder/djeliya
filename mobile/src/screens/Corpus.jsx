import { useEffect, useMemo, useState } from "react";
import { STATUTS, fmtDate } from "../lib/constants.js";
import { useT } from "../lib/i18n.js";
import AnalyseView from "../components/AnalyseView.jsx";

const PALETTE = ["#E4B04A", "#7C9CF5", "#5FC6A8", "#D96D5F", "#C48FE0"];

export default function Corpus({ corpusList, interviews, onCreer, onRejoindre, onOpenInterview, onSelectCorpus, selectedId, corpusDetail, methodes, onLancerAnalyse, onExporterDocx, onExporterXlsx, showToast }) {
  const { t } = useT();
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");
  const [rejoindre, setRejoindre] = useState(false);
  const [code, setCode] = useState("");
  const [vue, setVue] = useState("entretiens");

  useEffect(() => { setVue("entretiens"); }, [selectedId]);

  const enrichis = useMemo(() => {
    return corpusList.map((c, i) => {
      const membres = interviews.filter((iv) => iv.corpusId === c.id);
      const termines = membres.filter((iv) => iv.statut === "termine");
      const dureeSec = membres.reduce((a, m) => a + (m.dureeSec || 0), 0);
      return {
        ...c,
        couleur: PALETTE[i % PALETTE.length],
        nbEntretiens: membres.length,
        nbTermines: termines.length,
        dureeMin: Math.round(dureeSec / 60),
        membres,
      };
    });
  }, [corpusList, interviews]);

  const sansCorpus = useMemo(
    () => interviews.filter((iv) => !iv.corpusId),
    [interviews]
  );

  const validerCreation = async () => {
    const n = nom.trim();
    if (!n) return;
    await onCreer(n);
    setNom("");
    setCreation(false);
  };

  const validerRejoindre = async () => {
    const c = code.trim();
    if (!c) return;
    try {
      await onRejoindre(c);
      setCode("");
      setRejoindre(false);
    } catch (e) {
      showToast(e.message || "");
    }
  };

  const selection = selectedId ? enrichis.find((c) => c.id === selectedId) : null;

  if (selection) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={() => onSelectCorpus(null)} aria-label="Retour">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <h1 className="topbar-title truncate">{selection.nom}</h1>
          <span style={{ width: 36 }} />
        </header>
        <div className="content">
          <div className="stat-strip">
            <div className="stat-chip">
              <span className="stat-num" style={{ color: selection.couleur }}>{selection.nbEntretiens}</span>
              <span className="stat-label">{selection.nbEntretiens > 1 ? t("corpus.entretiensMot") : t("corpus.entretien")}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-num" style={{ color: selection.couleur }}>{selection.dureeMin}</span>
              <span className="stat-label">{t("corpus.minutes")}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-num" style={{ color: selection.couleur }}>{selection.nb_membres}</span>
              <span className="stat-label">{selection.nb_membres > 1 ? t("corpus.chercheurs") : t("corpus.chercheur")}</span>
            </div>
          </div>

          {selection.nbEntretiens > selection.nbTermines && (
            <p className="field-help">
              {selection.nbTermines} {t("corpus.termines")} {selection.nbEntretiens} {t("corpus.reellementTermines")}
            </p>
          )}

          {selection.code_invitation && (
            <button className="corpus-inline" onClick={() => {
              navigator.clipboard.writeText(selection.code_invitation);
              showToast(t("corpus.codeCopie"));
            }}>
              {t("corpus.codeInvitation")} : <span className="mono">{selection.code_invitation}</span>
              <span className="corpus-inline-edit">{t("corpus.copier")}</span>
            </button>
          )}

          {selection.nbTermines >= 2 && (
            <div className="vue-switch">
              <button className={"vue-opt" + (vue === "entretiens" ? " vue-actif" : "")}
                onClick={() => setVue("entretiens")}>{t("corpus.entretiensOnglet")}</button>
              <button className={"vue-opt" + (vue === "analyse" ? " vue-actif" : "")}
                onClick={() => setVue("analyse")}>{t("corpus.analyseTransversale")}</button>
            </div>
          )}

          {vue === "analyse" && selection.nbTermines >= 2 ? (
            <>
              <AnalyseView
                sujet={corpusDetail || {}}
                methodes={methodes}
                onLancer={onLancerAnalyse}
              />
              {corpusDetail?.analyse_statut === "termine" && (
                <div className="field-inline">
                  <button className="btn ghost sm" style={{ flex: 1 }}
                    onClick={() => onExporterDocx(selection.id, selection.nom)}>{t("corpus.exporterWord")}</button>
                  <button className="btn ghost sm" style={{ flex: 1 }}
                    onClick={() => onExporterXlsx(selection.id, selection.nom)}>{t("corpus.exporterExcel")}</button>
                </div>
              )}
            </>
          ) : selection.membres.length === 0 ? (
            <p className="note-banner">{t("corpus.aucunEntretien")}</p>
          ) : (
            <ul className="interview-list flush">
              {selection.membres.map((iv) => {
                const st = STATUTS[iv.statut] || STATUTS.brouillon;
                return (
                  <li key={iv.id}>
                    <button className="interview-row" onClick={() => onOpenInterview(iv.id)}>
                      <div className="row-main">
                        <span className="row-title">{iv.titre}</span>
                        <span className="row-meta">{fmtDate(iv.creeLe)}{iv.duree ? ` · ${iv.duree}` : ""}</span>
                      </div>
                      <span className="status-pill" style={{ color: st.color, borderColor: st.color }}>{t(`statuts.${iv.statut}`)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar-title left">{t("corpus.titre")}</h1>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="icon-btn" onClick={() => { setRejoindre((r) => !r); setCreation(false); }} aria-label="Rejoindre un corpus">
            <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" stroke="currentColor" strokeWidth="1.4" /><path d="M4 17c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </button>
          <button className="icon-btn" onClick={() => { setCreation((c) => !c); setRejoindre(false); }} aria-label="Nouveau corpus">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      <div className="content">
        <p className="section-intro">{t("corpus.intro")}</p>

        {rejoindre && (
          <div className="field-inline">
            <input className="field-input mono" placeholder={t("corpus.codeInvitationPlaceholder")} value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus
              onKeyDown={(e) => e.key === "Enter" && validerRejoindre()} />
            <button className="btn primary sm" onClick={validerRejoindre}>{t("corpus.rejoindre")}</button>
          </div>
        )}

        {creation && (
          <div className="field-inline">
            <input className="field-input" placeholder={t("corpus.nomCorpusPlaceholder")}
              value={nom} onChange={(e) => setNom(e.target.value)} autoFocus
              onKeyDown={(e) => e.key === "Enter" && validerCreation()} />
            <button className="btn primary sm" onClick={validerCreation}>{t("corpus.creer")}</button>
          </div>
        )}

        {enrichis.length === 0 && !creation && !rejoindre ? (
          <div className="empty">
            <div className="empty-badge">◫</div>
            <p className="empty-title">{t("corpus.videTitre")}</p>
            <p className="empty-sub">{t("corpus.videSous")}</p>
            <button className="btn primary" onClick={() => setCreation(true)}>{t("corpus.creerUnCorpus")}</button>
          </div>
        ) : (
          <ul className="corpus-list">
            {enrichis.map((c) => (
              <li key={c.id}>
                <button className="corpus-card" onClick={() => onSelectCorpus(c.id)}>
                  <span className="corpus-bar" style={{ background: c.couleur }} />
                  <div className="corpus-info">
                    <span className="corpus-nom">{c.nom}</span>
                    <span className="corpus-meta">
                      {c.nbEntretiens} {c.nbEntretiens !== 1 ? t("corpus.entretiensMot") : t("corpus.entretien")}
                      {c.dureeMin > 0 ? ` · ${c.dureeMin} ${t("corpus.minutes")}` : ""}
                      {c.nb_membres > 1 ? ` · ${c.nb_membres} ${t("corpus.chercheurs")}` : ""}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {sansCorpus.length > 0 && (
          <div className="unassigned-note">
            {sansCorpus.length} {sansCorpus.length > 1 ? t("corpus.entretiensMot") : t("corpus.entretien")} {t("corpus.sansCorpus")}.
          </div>
        )}
      </div>
    </div>
  );
}
