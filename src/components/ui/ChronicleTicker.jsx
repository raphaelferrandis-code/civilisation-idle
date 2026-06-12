import { useGameState } from '../../hooks/useGameState.js';
import { markChronicleEntryRead } from '../../game/core/state.js';
import { currentEraIndex, crisisOpen } from '../../game/core/mechanics.js';
import { getJournalTheme } from './journalThemes.js';

/**
 * Bandeau-dépêche : remplace l'ancien panneau JournalPanel (Audit UI Phase 2).
 * Une ligne pleine largeur ; la dernière dépêche reste affichée jusqu'à la
 * suivante ; le survol révèle les 2 précédentes en fantôme. Aucune archive.
 */
export default function ChronicleTicker() {
  const entries = useGameState(s => s.chronicleEntries || []);
  const eraIndex = useGameState(() => currentEraIndex());
  const isCrisis = useGameState(() => crisisOpen());

  const theme = getJournalTheme(eraIndex);
  const latest = entries[0];

  return (
    <div
      className={`chronicle-ticker ${theme.cssClass}${isCrisis ? ' is-crisis' : ''}`}
      aria-label="Chronique de l'effondrement"
      title={`${theme.tradition} — Prix : ${theme.price}`}
      onClick={() => latest && markChronicleEntryRead(latest.id)}
    >
      <span className="ticker-masthead">{theme.masthead}</span>
      <span className="ticker-sep" aria-hidden="true"></span>
      {latest ? (
        <span className="ticker-line" key={latest.id} aria-live="polite">
          <strong className="ticker-title">{latest.title}</strong>
          <span className="ticker-text">
            {" — "}{latest.text}
            {latest.author && <span className="ticker-author"> — {latest.author}</span>}
          </span>
        </span>
      ) : (
        <span className="ticker-line ticker-empty">
          La mémoire de la civilisation est calme.
        </span>
      )}
      {latest?.isNew && <span className="ticker-new-dot" aria-hidden="true"></span>}
      <span className="ticker-date">{latest ? latest.date : "An 1"}</span>
    </div>
  );
}
