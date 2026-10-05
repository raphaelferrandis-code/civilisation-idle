import { Component } from 'react';
import { save } from '../../game/core/state.js';
import { tr } from '../../game/core/i18n.js';
import { isChunkLoadError, reloadOnceForChunkError } from '../../game/core/crashGuard.js';

// FRONTIÈRE D'ERREUR des vues et des dialogues (audit 2026-10-05, BUG-18).
// Une exception de rendu ne démonte plus que ce qu'elle entoure : App reste
// monté, donc la boucle de jeu, l'autosave et la sauvegarde de fermeture
// continuent. Elle se réarme quand `resetKey` change (changement d'onglet).
//   onHome   repli affiché, avec « Retour à la Cité » qui l'appelle
//   onError  repli MUET (dialogues) : l'appelant referme ce qui a planté
export default class ViewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, current) {
    if (props.resetKey !== current.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error) {
    // Sauvegarde tout de suite : si l'erreur vient de la partie, elle reviendra,
    // et le joueur ne doit rien perdre de ce qui précède.
    try { save(); } catch { /* save() tient son propre journal d'échec */ }
    // Morceau introuvable (redéploiement) : un rechargement, une seule fois.
    if (isChunkLoadError(error) && reloadOnceForChunkError()) return;
    this.props.onError?.(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (!this.props.onHome) return null;
    return (
      <section className="panel view-error" role="alert">
        <div className="panel-heading">
          <h2>{tr({ fr: "Cette vue a rencontré un problème", en: "This view ran into a problem" })}</h2>
        </div>
        <div className="view-error-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => { this.setState({ error: null }); this.props.onHome(); }}
          >
            {tr({ fr: "Retour à la Cité", en: "Back to the City" })}
          </button>
          <button type="button" className="btn-secondary" onClick={() => location.reload()}>
            {tr({ fr: "Recharger", en: "Reload" })}
          </button>
        </div>
      </section>
    );
  }
}
