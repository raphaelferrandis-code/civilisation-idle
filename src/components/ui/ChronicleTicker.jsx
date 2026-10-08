import { useState, useRef } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { markChronicleEntryRead, renderCache } from '../../game/core/state.js';
import { currentEraIndex, crisisOpen } from '../../game/core/mechanics.js';
import { CHRONICLE_VISIBLE_MS, chronicleEntryContent } from '../../game/core/chronicleEvaluator.js';
import { getNotifEnabled } from '../../game/core/main.js';
import { getJournalTheme } from './journalThemes.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';
import { figureOfAuthor, findFigure, showFigure } from '../../game/map/paroles/figures.js';

/**
 * Bandeau-dépêche : remplace l'ancien panneau JournalPanel (Audit UI Phase 2).
 * Une ligne pleine largeur, éphémère : la dépêche n'est affichée que pendant
 * CHRONICLE_VISIBLE_MS (1 min) après sa publication, puis le bandeau disparaît
 * jusqu'à la dépêche suivante (cadence de publication : 3 min). Aucune archive.
 */
// `onFind` : appelé quand la signature a fait retrouver sa figure sur la carte (la Cité
// referme alors la fenêtre de la chronique, pour laisser voir la fiche).
export default function ChronicleTicker({ onFind = null } = {}) {
  const entries = useGameState(s => s.chronicleEntries || []);
  const eraIndex = useGameState(() => currentEraIndex());
  const isCrisis = useGameState(() => crisisOpen());
  // Horloge du tick (1 Hz) : pas de Date.now() ni de timer local en rendu.
  const tickNow = useGameState(() => renderCache.tickNow);
  // Options › « Notifications du fil » : le bandeau est l'héritier du fil des
  // habitants que ce réglage masquait ; personne ne le lisait plus depuis
  // (audit 2026-10-05, BUG-55). setNotifEnabled notifie : le bandeau suit.
  const notifOn = useGameState(() => getNotifEnabled());

  const theme = getJournalTheme(eraIndex);
  const latest = entries[0];

  // La dépêche s'affiche ENTIÈRE d'emblée (demande Raph 2026-07-31, bureau ET
  // téléphone). Avant : un premier geste ouvrait le titre, un second seulement
  // donnait l'article — deux gestes pour lire trois lignes, sur un bandeau qui
  // ne reste affiché qu'une minute. On la donne à lire tout de suite ; le clic
  // ne sert plus qu'à la refermer si elle gêne.
  const [expanded, setExpanded] = useState(true);
  // Ré-ouverture à chaque nouvelle dépêche : ajustement d'état PENDANT le rendu
  // (pattern React recommandé) plutôt qu'un setState dans un effet — évite le
  // rendu en cascade signalé par react-hooks/set-state-in-effect. Une dépêche
  // qui arrive doit être lisible, même si la précédente avait été refermée.
  const lastSeenId = useRef(latest?.id);
  if (lastSeenId.current !== latest?.id) {
    lastSeenId.current = latest?.id;
    setExpanded(true);
  }

  // Fenêtre d'affichage : 1 min après publication. Les dépêches d'anciens
  // saves (publishedAt = 0) restent masquées. Hors fenêtre, le bandeau reste
  // monté (état vide) : sa disparition décalait toute la mise en page.
  const visible = Boolean(latest && tickNow - (latest.publishedAt || 0) < CHRONICLE_VISIBLE_MS);

  // Bandeau éphémère : n'apparaît QUE sur notification (≤ CHRONICLE_VISIBLE_MS
  // après publication). Hors fenêtre, il se démonte entièrement — en overlay
  // absolu, sa disparition ne décale plus rien (contrairement à l'ancien
  // bandeau en flux qui devait rester monté pour ne pas sauter la mise en page).
  if (!visible || !notifOn) return null;

  // Texte relu dans l'article source (la save ne garde que articleId, SAV-16).
  const { title, text, author } = chronicleEntryContent(latest);
  // LA SIGNATURE MÈNE À SA FIGURE (docs/PLAN-ECOUTER-PARLER.md, lot 6) : Claude, Edith,
  // Raphaël, Khael et Aldric vivent dans la cité ; si celui qui signe s'y trouve, son nom
  // le fait retrouver sur la carte. (Relu à chaque seconde du tick, comme la fenêtre.)
  const fig = figureOfAuthor(author);
  const findable = !!fig && !!findFigure(fig);
  const who = findable ? author.split(',')[0].trim() : null;

  const toggle = () => {
    if (!expanded) markChronicleEntryRead(latest.id);
    setExpanded((v) => !v);
  };

  return (
    <div
      className={`chronicle-ticker ${theme.cssClass}${isCrisis ? ' is-crisis' : ''}${expanded ? ' is-expanded' : ''}`}
      aria-label={tr({ fr: "Chronique de l'effondrement", en: "Chronicle of the collapse" })}
      {...tipProps(null, expanded
        ? tr({ fr: `${theme.tradition} · Prix : ${theme.price}`, en: `${theme.tradition} · Price: ${theme.price}` })
        : tr({ fr: 'Cliquer pour lire la dépêche', en: 'Click to read the dispatch' }))}
      onClick={toggle}
      // Un <div onClick> est invisible au clavier : role="button" + tabIndex le
      // remettent dans l'ordre de tabulation, Entrée/Espace déplient comme le
      // clic (preventDefault sur Espace, sinon la page défile).
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault();
          toggle();
        }
      }}
    >
      <span className="ticker-masthead">
        {theme.masthead}
        {latest.isNew && <span className="ticker-new-dot" aria-hidden="true"></span>}
      </span>
      {/* Pas d'aria-live ici : monté déjà rempli, il n'était jamais annoncé.
          L'annonce passe par ChronicleAnnounce, ci-dessous. */}
      <span className="ticker-line" key={latest.id}>
        <strong className="ticker-title">{title}</strong>
        {expanded && (
          <span className="ticker-text">
            {" · "}{text}
            {author && (
              <span className="ticker-author">
                {' · '}
                {findable ? (
                  <button
                    type="button"
                    className="ticker-author-link"
                    // Ni replier la dépêche (le clic du bandeau), ni la déplier au clavier.
                    onClick={(e) => { e.stopPropagation(); if (showFigure(fig) && onFind) onFind(); }}
                    onKeyDown={(e) => e.stopPropagation()}
                    {...tipProps(null, tr({ fr: `Retrouver ${who} dans la cité`, en: `Find ${who} in the city` }))}
                  >
                    {author}
                  </button>
                ) : author}
              </span>
            )}
          </span>
        )}
      </span>
      {expanded && <span className="ticker-date">{latest.date}</span>}
    </div>
  );
}

/**
 * Annonce vocale de la dépêche (BUG-118). Le bandeau n'est monté que dock
 * ouvert, et déjà rempli : or les lecteurs d'écran n'annoncent que les
 * MUTATIONS d'une région aria-live DÉJÀ présente (motif IdleReportPanel). Cette
 * région sr-only reste montée avec la Cité ; le titre de la dépêche y est écrit
 * pendant sa fenêtre d'affichage, aux mêmes conditions que le bandeau.
 */
export function ChronicleAnnounce() {
  const entries = useGameState(s => s.chronicleEntries || []);
  const tickNow = useGameState(() => renderCache.tickNow);
  const notifOn = useGameState(() => getNotifEnabled());
  const latest = entries[0];
  const visible = Boolean(latest && notifOn && tickNow - (latest.publishedAt || 0) < CHRONICLE_VISIBLE_MS);
  const title = visible ? chronicleEntryContent(latest).title : '';
  return (
    <div className="sr-only" role="status" aria-live="polite">
      {visible ? tr({ fr: `Chronique : ${title}`, en: `Chronicle: ${title}` }) : ''}
    </div>
  );
}
