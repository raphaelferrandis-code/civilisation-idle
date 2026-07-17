import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import { regulationContext, regulationActionUnlocked } from '../../game/core/mechanics.js';
import { REGULATION_ACTIONS } from '../../game/data/regulationActions.js';
import { icarusUnlocked, scratchUnlocked, blackjackUnlocked, icarusPotFaveur, setTempleAuto } from '../../game/core/actions.js';
import { freeFlightCount } from '../../game/core/actions/templeFlights.js';
import { hasTempleArtifact } from '../../game/core/actions/templeArtifacts.js';
import AutoDials, { RateBadge } from './TempleAutoDials.jsx';
import { fmtMult } from './coffreMeta.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { PotIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';

/**
 * Le pupitre du temple (colonne droite de la Régulation, sous les Annales —
 * demande Raphaël 2026-07-17, format accordéon replié puis DÉ-LISSÉ à sa
 * relecture : « le côté parfait enlève l'âme ») — un MUR DE PLAQUETTES
 * votives, pas un panneau d'admin. Chaque auto est une tablette de bois
 * clouée un peu de travers (rotations alternées, clou pixel) ; sa FLAMME
 * VOTIVE l'allume ou l'éteint (l'identité de la Faveur), son emblème pixel
 * la signe, le débit pend sur une plaque de bronze penchée. Un clic sur la
 * tablette la redresse et ouvre le tiroir des cadrans ; UN SEUL ouvert à la
 * fois. Une lignée non couronnée est une tablette noircie, emblème en
 * silhouette. Les ACHATS restent à l'échoppe ; ici on ne fait que RÉGLER.
 */

// L'ordre = l'ordre de déblocage des jeux (parité avec la liste de gauche).
// `era` rend l'atteinte de l'ère ; `bottle` = la bouteille capstone à l'échoppe.
const PUPITRE_GAMES = [
  {
    id: 'osselets',
    name: { fr: 'Les osselets', en: 'Knucklebones' },
    bottle: { fr: 'Osselets sacrés', en: 'Sacred knucklebones' },
    era: (ctx) => REGULATION_ACTIONS.some((a) => a.kind === 'gamble' && regulationActionUnlocked(a.id, ctx))
  },
  {
    id: 'gratteux',
    name: { fr: 'Tickets à gratter', en: 'Scratch tickets' },
    bottle: { fr: 'Le sacristain gratte', en: 'The sacristan scratches' },
    era: (ctx) => scratchUnlocked(ctx)
  },
  {
    id: 'vingtetun',
    name: { fr: 'Vingt-et-un', en: 'Twenty-one' },
    bottle: { fr: "L'oracle joue seul", en: 'The oracle plays alone' },
    era: (ctx) => blackjackUnlocked(ctx)
  },
  {
    id: 'icarus',
    name: { fr: "Vol d'Icare", en: 'Flight of Icarus' },
    bottle: { fr: "Ailes d'aigle", en: 'Eagle wings' },
    era: (ctx) => icarusUnlocked(ctx)
  }
];

// Libellés courts des réglages pour le résumé de ligne (parité TempleAutoDials).
const SHORT = {
  prudent: { fr: 'prudent', en: 'cautious' },
  classique: { fr: 'ancestral', en: 'ancestral' },
  grand: { fr: 'grand', en: 'great' },
  interdit: { fr: 'interdit', en: 'forbidden' },
  plume: { fr: 'plume', en: 'feather' },
  aile: { fr: 'aile', en: 'wing' },
  hecatombe: { fr: 'hécatombe', en: 'hecatomb' },
  obole: { fr: 'obole', en: 'obol' },
  drachme: { fr: 'drachme', en: 'drachma' },
  talent: { fr: 'talent', en: 'talent' },
  legere: { fr: 'légère', en: 'light' },
  pleine: { fr: 'pleine', en: 'full' },
  royale: { fr: 'grand jeu', en: 'high' },
  recueilli: { fr: 'recueilli', en: 'unhurried' },
  mesure: { fr: 'mesuré', en: 'measured' },
  fervent: { fr: 'fervent', en: 'fervent' }
};
const short = (id) => (SHORT[id] ? tr(SHORT[id]) : id);

// Le résumé d'une auto en une poignée de mots : mise (ou rite, ou cible),
// coffre (seulement s'il porte), tempo, plancher (seulement s'il existe).
function autoSummary(gameId, g) {
  const parts = [];
  if (gameId === 'osselets') parts.push(short(g.rite || 'classique'));
  else parts.push(short(g.stakeId || (gameId === 'icarus' ? 'plume' : gameId === 'gratteux' ? 'obole' : 'legere')));
  if (gameId === 'icarus') parts.push(`${tr({ fr: 'cible', en: 'target' })} ×${Number(g.target || 2).toFixed(1)}`);
  if ((g.stakePow || 0) > 0) parts.push(`×${fmtMult(10 ** g.stakePow)}`);
  parts.push(short(g.tempo || 'mesure'));
  if ((g.faveurFloor || 0) > 0) parts.push(`${tr({ fr: 'plancher', en: 'floor' })} ${fmt(g.faveurFloor)}`);
  return parts.join(' · ');
}

export default function TemplePupitre() {
  useGameState((s) => s.instability); // cagnotte, débits, vols (1 Hz)
  useGameState((s) => JSON.stringify(s.templeAuto || {})); // les cadrans en direct
  const [openId, setOpenId] = useState(null); // accordéon : un seul volet déplié

  const ctx = regulationContext();
  const games = PUPITRE_GAMES.filter((g) => g.era(ctx));
  if (!games.length) return null; // avant l'Ère II, rien à piloter ni à annoncer

  const pot = icarusPotFaveur();
  const flights = freeFlightCount();
  const streak = state.blackjackStreak || 0;
  const anyUnlocked = games.some((g) => state.templeAuto?.[g.id]?.unlocked);

  return (
    <section className="regul-block temple-pupitre">
      <h3
        className="regul-block-title"
        {...tipProps(
          tr({ fr: 'Le pupitre du temple', en: 'The temple desk' }),
          tr({
            fr: 'Le poste de commande des automatisations. Chaque lignée couronnée à l’échoppe se règle ici : la pastille allume ou éteint, la ligne se déplie sur les cadrans. Le débit affiché est l’espérance aux réglages courants.',
            en: 'The automation command desk. Each lineage crowned at the shop is tuned here: the dot turns it on or off, the row unfolds into the dials. The shown throughput is the expectation at current settings.'
          })
        )}
      >
        {tr({ fr: 'Le pupitre du temple', en: 'The temple desk' })}
        <span className="pupitre-state-inline">
          <span {...tipProps(
            tr({ fr: 'La cagnotte du temple', en: 'The temple pot' }),
            tr({ fr: 'Nourrie par l’avantage des tables, raflée au Vol d’Icare (×10 et plus, au prorata de la mise).', en: 'Fed by the tables’ edge, swept at the Flight of Icarus (×10 and above, pro rata of the stake).' })
          )}><PotIcon /> {fmt(pot)}</span>
          {flights > 0 && (
            <span {...tipProps(
              tr({ fr: 'Vols offerts', en: 'Free flights' }),
              tr({ fr: 'Offerts par les Coups de Vénus et les trois Soleils du gratteux. Le temple paie la mise, au coffre ×1.', en: 'Granted by Venus throws and three Suns on a ticket. The temple pays the stake, at chest ×1.' })
            )}>🪽 {flights}</span>
          )}
          {hasTempleArtifact('voix') && streak >= 2 && (
            <span className="pupitre-streak" {...tipProps(
              tr({ fr: 'La série de l’oracle', en: 'The oracle’s streak' }),
              tr({ fr: 'Mains gagnées d’affilée au vingt-et-un, à la main. L’auto n’y touche pas.', en: 'Hands won in a row at twenty-one, by hand. The automation never touches it.' })
            )}>🃏 {streak}</span>
          )}
        </span>
      </h3>

      {games.map((g) => {
        const auto = state.templeAuto?.[g.id];
        if (!auto?.unlocked) {
          return (
            <div
              key={g.id}
              className="pupitre-tablet pupitre-tablet--locked"
              {...tipProps(
                tr(g.name),
                tr({
                  fr: `L’automatisation se gagne à l’échoppe : la bouteille « ${tr(g.bottle)} », au sommet de la lignée.`,
                  en: `The automation is earned at the shop: the "${tr(g.bottle)}" bottle, at the top of the lineage.`
                })
              )}
            >
              <span className="pupitre-game-name">{tr(g.name)}</span>
              <span className="pupitre-locked-note">{tr({ fr: `« ${tr(g.bottle)} » à l’échoppe`, en: `"${tr(g.bottle)}" at the shop` })}</span>
            </div>
          );
        }
        const open = openId === g.id;
        return (
          <div key={g.id} className={`pupitre-tablet${open ? ' is-open' : ''}${auto.on ? ' is-lit' : ''}`}>
            <div
              className="pupitre-game-head"
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : g.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : g.id); } }}
            >
              <button
                type="button"
                className={`pupitre-flame${auto.on ? ' is-on' : ''}`}
                title={tr({
                  fr: auto.on ? 'La flamme brûle : l’auto joue. Souffler pour la suspendre.' : 'La flamme est éteinte. Cliquer pour la rallumer.',
                  en: auto.on ? 'The flame burns: the automation plays. Blow to pause it.' : 'The flame is out. Click to relight it.'
                })}
                aria-label={tr(g.name)}
                aria-pressed={auto.on}
                onClick={(e) => { e.stopPropagation(); setTempleAuto(g.id, { on: !auto.on }); }}
              >
                <img src="/pixelart/ui/faveur/flamme.png" alt="" aria-hidden="true" draggable="false" />
              </button>
              <span className="pupitre-game-name">{tr(g.name)}</span>
              {!open && <span className="pupitre-summary">{autoSummary(g.id, auto)}</span>}
              <span className="pupitre-plaque"><RateBadge game={g.id} /></span>
            </div>
            {open && <AutoDials game={g.id} />}
          </div>
        );
      })}

      {!anyUnlocked && (
        <p className="pupitre-hint">
          {tr({
            fr: 'Le temple ne joue pas encore tout seul. Couronne une lignée à l’échoppe et son pupitre s’ouvrira ici.',
            en: 'The temple does not play on its own yet. Crown a lineage at the shop and its desk will open here.'
          })}
        </p>
      )}
    </section>
  );
}
