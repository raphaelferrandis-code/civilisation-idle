import { useGameState } from '../../hooks/useGameState.js';
import { markChronicleEntryRead, renderCache } from '../../game/core/state.js';
import { currentEraIndex, crisisOpen } from '../../game/core/mechanics.js';
import { CHRONICLE_VISIBLE_MS, chronicleEntryContent } from '../../game/core/chronicleEvaluator.js';
import { getNotifEnabled } from '../../game/core/main.js';
import { getJournalTheme } from './journalThemes.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';
import { findFigure, showFigure } from '../../game/map/paroles/figures.js';
import { FIGURES, FIGURE_KEYS } from '../../game/data/parolesFigures.js';

/**
 * LA GAZETTE DE LA CITÉ (Raph, 2026-10-08 : « on reprend le concept de base, chaque ère a
 * son type de gazette et l'article entier s'affiche directement ») : la dernière dépêche,
 * ENTIÈRE, dans un carré sous le cadre de la ville, au support de son ère (tradition orale,
 * argile, manuscrit, proclamation, gazette imprimée, presse, flux, puis les âges cosmiques :
 * journalThemes.js). Elle reste tant que le joueur ne l'a pas lue : un clic n'importe où
 * sur l'article la referme (`isNew` retombe, sauvegardé), une dépêche plus fraîche la
 * remplace. Sauf sur un NOM : celui d'une figure de la Chronique qui vit dans la cité
 * (Claude, Edith, Raphaël, Khael, Aldric), dans le titre, le texte ou la signature, la fait
 * retrouver sur la carte, et l'article reste ouvert. Options › « Notifications du fil » la
 * coupe. Les dépêches d'anciens saves (publishedAt = 0) restent masquées.
 */

// Les prénoms des figures, coupés au mot (« Claudette » n'est pas Claude). La parenthèse
// capture : `split` garde les noms dans le tableau, aux rangs impairs.
const NAMES = new RegExp(`(?<!\\p{L})(${FIGURE_KEYS.map((k) => FIGURES[k].given).join('|')})(?!\\p{L})`, 'u');
const KEY_OF = Object.fromEntries(FIGURE_KEYS.map((k) => [FIGURES[k].given, k]));

// Le texte, ses noms de figures présentes devenus des boutons (relu à chaque seconde du
// tick : une figure qui sort de chez elle devient cliquable).
function withNames(text) {
  if (typeof text !== 'string' || !text) return text;
  const parts = text.split(NAMES);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const key = i % 2 ? KEY_OF[part] : null;
    if (!key || !findFigure(key)) return part;
    return (
      <button
        key={i}
        type="button"
        className="gazette-name"
        // Ni refermer l'article (le clic de la carte), ni le refermer au clavier.
        onClick={(e) => { e.stopPropagation(); showFigure(key); }}
        onKeyDown={(e) => e.stopPropagation()}
        {...tipProps(null, tr({ fr: `Retrouver ${part} dans la cité`, en: `Find ${part} in the city` }))}
      >
        {part}
      </button>
    );
  });
}

export default function ChronicleTicker() {
  const entries = useGameState(s => s.chronicleEntries || []);
  const eraIndex = useGameState(() => currentEraIndex());
  const isCrisis = useGameState(() => crisisOpen());
  // Le tick (1 Hz) re-rend la gazette : la présence des figures se relit avec lui.
  useGameState(() => renderCache.tickNow);
  // Options › « Notifications du fil » : la gazette est l'héritière du fil des
  // habitants que ce réglage masquait (audit 2026-10-05, BUG-55).
  const notifOn = useGameState(() => getNotifEnabled());

  const latest = entries[0];
  if (!latest || !latest.isNew || !(latest.publishedAt > 0) || !notifOn) return null;

  const theme = getJournalTheme(eraIndex);
  // Texte relu dans l'article source (la save ne garde que articleId, SAV-16).
  const { title, text, author } = chronicleEntryContent(latest);
  const close = () => markChronicleEntryRead(latest.id);

  return (
    <article
      className={`chronicle-ticker chronicle-gazette ${theme.cssClass}${isCrisis ? ' is-crisis' : ''}`}
      aria-label={tr({ fr: "Chronique de l'effondrement", en: "Chronicle of the collapse" })}
      {...tipProps(null, tr({ fr: 'Cliquer pour refermer la dépêche', en: 'Click to close the dispatch' }))}
      onClick={close}
      // Un <article onClick> est invisible au clavier : role="button" + tabIndex le
      // remettent dans l'ordre de tabulation, Entrée et Espace le referment comme le clic
      // (preventDefault sur Espace, sinon la page défile).
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          close();
        }
      }}
    >
      <header className="gazette-head">
        <span className="gazette-tradition">{theme.tradition}</span>
        <span className="ticker-date">{latest.date}</span>
        <span className="gazette-price">{tr({ fr: `Prix : ${theme.price}`, en: `Price: ${theme.price}` })}</span>
      </header>
      <span className="ticker-masthead">{theme.masthead}</span>
      <h3 className="ticker-title">{withNames(title)}</h3>
      <p className="ticker-line ticker-text">{withNames(text)}</p>
      {author && <p className="ticker-author">{withNames(author)}</p>}
    </article>
  );
}

/**
 * Annonce vocale de la dépêche (BUG-118). Les lecteurs d'écran n'annoncent que les
 * MUTATIONS d'une région aria-live DÉJÀ présente (motif IdleReportPanel), or la gazette
 * se monte déjà remplie. Cette région sr-only reste montée avec la Cité ; le titre de
 * la dépêche y est écrit la première minute après sa parution.
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
