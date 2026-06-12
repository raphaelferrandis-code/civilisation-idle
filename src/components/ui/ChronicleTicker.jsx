import { useGameState } from '../../hooks/useGameState.js';
import { markChronicleEntryRead, renderCache } from '../../game/core/state.js';
import { currentEraIndex, crisisOpen } from '../../game/core/mechanics.js';
import { CHRONICLE_VISIBLE_MS } from '../../game/core/chronicleEvaluator.js';
import { getJournalTheme } from './journalThemes.js';

/**
 * Bandeau-dépêche : remplace l'ancien panneau JournalPanel (Audit UI Phase 2).
 * Une ligne pleine largeur, éphémère : la dépêche n'est affichée que pendant
 * CHRONICLE_VISIBLE_MS (1 min) après sa publication, puis le bandeau disparaît
 * jusqu'à la dépêche suivante (cadence de publication : 3 min). Aucune archive.
 */
export default function ChronicleTicker() {
  const entries = useGameState(s => s.chronicleEntries || []);
  const eraIndex = useGameState(() => currentEraIndex());
  const isCrisis = useGameState(() => crisisOpen());
  // Horloge du tick (1 Hz) : pas de Date.now() ni de timer local en rendu.
  const tickNow = useGameState(() => renderCache.tickNow);

  const theme = getJournalTheme(eraIndex);
  const latest = entries[0];

  // Fenêtre d'affichage : 1 min après publication. Les dépêches d'anciens
  // saves (publishedAt = 0) restent masquées. Hors fenêtre, le bandeau reste
  // monté (état vide) : sa disparition décalait toute la mise en page.
  const visible = Boolean(latest && tickNow - (latest.publishedAt || 0) < CHRONICLE_VISIBLE_MS);

  return (
    <div
      className={`chronicle-ticker ${theme.cssClass}${isCrisis ? ' is-crisis' : ''}${visible ? '' : ' is-idle'}`}
      aria-label="Chronique de l'effondrement"
      title={`${theme.tradition} — Prix : ${theme.price}`}
      onClick={() => visible && markChronicleEntryRead(latest.id)}
    >
      <span className="ticker-masthead">{theme.masthead}</span>
      <span className="ticker-sep" aria-hidden="true"></span>
      {visible ? (
        <span className="ticker-line" key={latest.id} aria-live="polite">
          <strong className="ticker-title">{latest.title}</strong>
          <span className="ticker-text">
            {" — "}{latest.text}
            {latest.author && <span className="ticker-author"> — {latest.author}</span>}
          </span>
        </span>
      ) : (
        <span className="ticker-line ticker-empty">En attente de la prochaine dépêche…</span>
      )}
      {visible && latest.isNew && <span className="ticker-new-dot" aria-hidden="true"></span>}
      {visible && <span className="ticker-date">{latest.date}</span>}
    </div>
  );
}
