import { Component } from "react";
import { mailtoSignalement } from "../lib/erreurs.js";

/**
 * Filet de sécurité global : si un plantage inattendu survient n'importe où
 * dans l'app (bug non anticipé, pas une simple erreur réseau déjà gérée),
 * affiche un écran professionnel plutôt qu'une page blanche ou une pile
 * d'erreurs JavaScript brute, avec un moyen immédiat de le signaler.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    // Conserve la pile complète pour l'e-mail de signalement, même si l'affichage reste sobre.
    this.setState({ erreur: Object.assign(erreur, { infoComposant: info?.componentStack }) });
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    const email = this.props.emailUtilisateur;
    return (
      <div className="screen" style={{ justifyContent: "center", alignItems: "center", display: "flex" }}>
        <div className="content" style={{ textAlign: "center", paddingTop: 80 }}>
          <div className="empty-badge">⚠</div>
          <p className="empty-title">Une erreur inattendue s'est produite</p>
          <p className="empty-sub">
            Ce n'est pas de ta faute — l'équipe technique en a été informée. Tu peux essayer de
            recharger l'application, ou nous signaler directement ce qui s'est passé.
          </p>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Recharger l'application
          </button>
          <a
            className="btn ghost"
            style={{ marginTop: 10, display: "inline-block", textDecoration: "none" }}
            href={mailtoSignalement({ erreur: this.state.erreur, contexte: "plantage de l'application", email })}
          >
            Signaler ce problème
          </a>
        </div>
      </div>
    );
  }
}
