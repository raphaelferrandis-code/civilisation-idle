import { useState, useRef } from 'react';
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

  // Par défaut on n'affiche que le titre ; un clic déplie la dépêche complète.
  // On replie automatiquement dès qu'une nouvelle dépêche arrive.
  const [expanded, setExpanded] = useState(false);
  // Repli à chaque nouvelle dépêche : ajustement d'état PENDANT le rendu
  // (pattern React recommandé) plutôt qu'un setState dans un effet — évite le
  // rendu en cascade signalé par react-hooks/set-state-in-effect.
  const lastSeenId = useRef(latest?.id);
  if (lastSeenId.current !== latest?.id) {
    lastSeenId.current = latest?.id;
    setExpanded(false);
  }

  // Fenêtre d'affichage : 1 min après publication. Les dépêches d'anciens
  // saves (publishedAt = 0) restent masquées. Hors fenêtre, le bandeau reste
  // monté (état vide) : sa disparition décalait toute la mise en page.
  const visible = Boolean(latest && tickNow - (latest.publishedAt || 0) < CHRONICLE_VISIBLE_MS);

  // Bandeau éphémère : n'apparaît QUE sur notification (≤ CHRONICLE_VISIBLE_MS
  // après publication). Hors fenêtre, il se démonte entièrement — en overlay
  // absolu, sa disparition ne décale plus rien (contrairement à l'ancien
  // bandeau en flux qui devait rester monté pour ne pas sauter la mise en page).
  if (!visible) return null;

  const toggle = () => {
    if (!expanded) markChronicleEntryRead(latest.id);
    setExpanded((v) => !v);
  };

  return (
    <div
      className={`chronicle-ticker ${theme.cssClass}${isCrisis ? ' is-crisis' : ''}${expanded ? ' is-expanded' : ''}`}
      aria-label="Chronique de l'effondrement"
      title={expanded ? `${theme.tradition} — Prix : ${theme.price}` : 'Cliquer pour lire la dépêche'}
      onClick={toggle}
    >
      <span className="ticker-masthead">
        {theme.masthead}
        {latest.isNew && <span className="ticker-new-dot" aria-hidden="true"></span>}
      </span>
      <span className="ticker-line" key={latest.id} aria-live="polite">
        <strong className="ticker-title">{latest.title}</strong>
        {expanded && (
          <span className="ticker-text">
            {" — "}{latest.text}
            {latest.author && <span className="ticker-author"> — {latest.author}</span>}
          </span>
        )}
      </span>
      {expanded && <span className="ticker-date">{latest.date}</span>}
    </div>
  );
}
