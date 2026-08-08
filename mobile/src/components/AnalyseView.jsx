import { useState } from "react";
import { fmtTime } from "../lib/constants.js";
import { useT } from "../lib/i18n.js";
import ConfirmationCredits from "./ConfirmationCredits.jsx";
import ErreurAvecSignalement from "./ErreurAvecSignalement.jsx";

/**
 * Vue d'analyse qualitative réutilisée pour un entretien seul ou un corpus entier
 * (analyse transversale). `onSeek` est facultatif : sans audio unique (corpus),
 * les verbatims restent affichés mais non cliquables.
 *
 * Note i18n : le contenu généré par le modèle (démarche méthodologique, thèmes,
 * synthèse, verbatims) est produit en français par le serveur quelle que soit la
 * langue de l'interface — seuls les libellés fixes de cet écran sont traduits.
 */
export default function AnalyseView({ sujet, methodes, onLancer, onSeek, seuilMinAvant, cout, solde, onVoirForfaits, email }) {
  const { t, langue } = useT();
  const [contexte, setContexte] = useState("");
  const [methode, setMethode] = useState("gioia");
  const [dimOuverte, setDimOuverte] = useState(0);
  const [demarcheOuverte, setDemarcheOuverte] = useState(false);
  const [confirmation, setConfirmation] = useState(false);

  const statut = sujet.analyse_statut;
  const a = sujet.analyse;

  if (!statut || statut === "erreur") {
    return (
      <div className="analyse-intro">
        {seuilMinAvant}
        <label className="field">
          <span className="field-label">{t("analyseView.methodologie")}</span>
          <select className="field-input" value={methode} onChange={(e) => setMethode(e.target.value)}>
            {Object.entries(methodes || {}).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
            {!methodes || Object.keys(methodes).length === 0 ? <option value="gioia">Gioia</option> : null}
          </select>
          {methodes?.[methode] && <span className="field-help">{t("analyseView.reference")}{methodes[methode].reference}</span>}
        </label>
        <label className="field">
          <span className="field-label">{t("analyseView.questionRecherche")}</span>
          <input className="field-input" value={contexte} onChange={(e) => setContexte(e.target.value)}
            placeholder={t("analyseView.questionPlaceholder")} />
        </label>
        {statut === "erreur" && (
          <ErreurAvecSignalement erreur={sujet.analyse_erreur} contexte="analyse qualitative"
            email={email} prefixe={t("analyseView.echecAnalyse")} />
        )}
        <button className="btn primary full" onClick={() => setConfirmation(true)}>
          {t("analyseView.lancerAnalyse")}
        </button>
        {confirmation && (
          <ConfirmationCredits
            cout={cout ?? 2}
            solde={solde}
            onAnnuler={() => setConfirmation(false)}
            onVoirForfaits={onVoirForfaits}
            onConfirmer={() => { setConfirmation(false); onLancer(contexte, methode, langue); }}
          />
        )}
      </div>
    );
  }

  if (statut === "en_cours") {
    return (
      <div className="pending-card">
        <span className="spinner" />
        {t("analyseView.analyseEnCours")}
      </div>
    );
  }

  if (!a) return null;

  const themesParNom = Object.fromEntries((a.second_ordre || []).map((t2) => [t2.theme, t2]));
  const conceptsParNom = Object.fromEntries((a.premier_ordre || []).map((c) => [c.concept, c]));
  const structureADeuxNiveaux = (a.dimensions_agregees || []).length === 0;

  const renderTheme = (theme) => (
    <div key={theme.theme} className="theme-block">
      <div className="theme-nom">{theme.theme}</div>
      {theme.description && <p className="theme-desc">{theme.description}</p>}
      {(theme.concepts_lies || []).map((nomConcept) => {
        const concept = conceptsParNom[nomConcept];
        if (!concept) return null;
        return (
          <div key={nomConcept} className="concept-block">
            <div className="concept-nom">{concept.concept}</div>
            {(concept.verbatims || []).map((v, vi) => {
              const contenu = (
                <>
                  <span className="verbatim-tc mono">{fmtTime(v.debut)}</span>
                  « {v.texte} »{v.entretien && <span className="verbatim-source"> — {v.entretien}</span>}
                </>
              );
              return onSeek ? (
                <button key={vi} className="verbatim" onClick={() => onSeek(v.debut)}>{contenu}</button>
              ) : (
                <div key={vi} className="verbatim verbatim-inerte">{contenu}</div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="analyse">
      <p className="analyse-methode">
        {methodes?.[sujet.analyse_methode]?.label || t("ficheEntretien.analyse")} · {t("analyseView.modele")} {sujet.analyse_modele || "IA"}
        {sujet.analyse_contexte ? ` · ${t("analyseView.angle")}${sujet.analyse_contexte}` : ""}
        {sujet.analyse_nb_entretiens ? ` · ${sujet.analyse_nb_entretiens} ${t("analyseView.entretiens")}` : ""}
      </p>
      <p className="note-banner" style={{ fontSize: 12 }}>⚠ {t("analyseView.avertissementIa")}</p>

      {a.demarche_methodologique && (
        <div className="dim-card">
          <button className="dim-head" onClick={() => setDemarcheOuverte((o) => !o)}>
            <span className="dim-nom">{t("analyseView.demarcheMethodologique")}</span>
            <span className="dim-chevron">{demarcheOuverte ? "−" : "+"}</span>
          </button>
          {demarcheOuverte && (
            <div className="dim-body">
              <p className="theme-desc" style={{ paddingTop: 12 }}>{a.demarche_methodologique}</p>
            </div>
          )}
        </div>
      )}

      {structureADeuxNiveaux
        ? (a.second_ordre || []).map(renderTheme)
        : (a.dimensions_agregees || []).map((dim, di) => (
          <div key={dim.dimension} className="dim-card">
            <button className="dim-head" onClick={() => setDimOuverte(dimOuverte === di ? -1 : di)}>
              <span className="dim-nom">{dim.dimension}</span>
              <span className="dim-chevron">{dimOuverte === di ? "−" : "+"}</span>
            </button>
            {dimOuverte === di && (
              <div className="dim-body">
                {(dim.themes_lies || []).map((nomTheme) => themesParNom[nomTheme] && renderTheme(themesParNom[nomTheme]))}
              </div>
            )}
          </div>
        ))}

      <div className="analyse-texte-card">
        <h3 className="subsection-title">{t("analyseView.syntheseInterpretative")}</h3>
        <p className="analyse-texte">{a.synthese}</p>
      </div>
      <div className="analyse-texte-card limites">
        <h3 className="subsection-title">{t("analyseView.limitesAutomatique")}</h3>
        <p className="analyse-texte">{a.limites}</p>
      </div>
    </div>
  );
}
