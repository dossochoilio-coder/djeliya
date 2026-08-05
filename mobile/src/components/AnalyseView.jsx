import { useState } from "react";
import { fmtTime } from "../lib/constants.js";

/**
 * Vue d'analyse qualitative réutilisée pour un entretien seul ou un corpus entier
 * (analyse transversale). `onSeek` est facultatif : sans audio unique (corpus),
 * les verbatims restent affichés mais non cliquables.
 */
export default function AnalyseView({ sujet, methodes, onLancer, onSeek, seuilMinAvant }) {
  const [contexte, setContexte] = useState("");
  const [methode, setMethode] = useState("gioia");
  const [dimOuverte, setDimOuverte] = useState(0);
  const [demarcheOuverte, setDemarcheOuverte] = useState(false);

  const statut = sujet.analyse_statut;
  const a = sujet.analyse;

  if (!statut || statut === "erreur") {
    return (
      <div className="analyse-intro">
        {seuilMinAvant}
        <label className="field">
          <span className="field-label">Méthodologie</span>
          <select className="field-input" value={methode} onChange={(e) => setMethode(e.target.value)}>
            {Object.entries(methodes || {}).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
            {!methodes || Object.keys(methodes).length === 0 ? <option value="gioia">Méthode Gioia</option> : null}
          </select>
          {methodes?.[methode] && <span className="field-help">Référence : {methodes[methode].reference}</span>}
        </label>
        <label className="field">
          <span className="field-label">Question de recherche ou angle d'analyse (facultatif)</span>
          <input className="field-input" value={contexte} onChange={(e) => setContexte(e.target.value)}
            placeholder="Ex. Comment les commerçantes financent-elles leur activité ?" />
        </label>
        {statut === "erreur" && (
          <p className="note-banner err">Échec de l'analyse : {sujet.analyse_erreur || "erreur inconnue"}</p>
        )}
        <button className="btn primary full" onClick={() => onLancer(contexte, methode)}>
          Lancer l'analyse qualitative
        </button>
      </div>
    );
  }

  if (statut === "en_cours") {
    return (
      <div className="pending-card">
        <span className="spinner" />
        Analyse en cours (30 à 90 secondes)…
      </div>
    );
  }

  if (!a) return null;

  const themesParNom = Object.fromEntries((a.second_ordre || []).map((t) => [t.theme, t]));
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
        {methodes?.[sujet.analyse_methode]?.label || "Analyse qualitative"} · modèle {sujet.analyse_modele || "IA"}
        {sujet.analyse_contexte ? ` · angle : ${sujet.analyse_contexte}` : ""}
        {sujet.analyse_nb_entretiens ? ` · ${sujet.analyse_nb_entretiens} entretiens` : ""}
      </p>

      {a.demarche_methodologique && (
        <div className="dim-card">
          <button className="dim-head" onClick={() => setDemarcheOuverte((o) => !o)}>
            <span className="dim-nom">Démarche méthodologique</span>
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
        <h3 className="subsection-title">Synthèse interprétative</h3>
        <p className="analyse-texte">{a.synthese}</p>
      </div>
      <div className="analyse-texte-card limites">
        <h3 className="subsection-title">Limites de l'analyse automatique</h3>
        <p className="analyse-texte">{a.limites}</p>
      </div>
    </div>
  );
}
