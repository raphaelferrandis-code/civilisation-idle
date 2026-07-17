import { state } from '../../game/core/state.js';
import { setTempleAuto, templeAutoThroughput } from '../../game/core/actions.js';
import { AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX, AUTO_TEMPLE_FAVEUR_FLOOR_MAX } from '../../game/core/balance.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon } from './FaveurIcon.jsx';
import { coffreLevel, fmtMult } from './coffreMeta.js';

/**
 * Les CADRANS des automatisations du Temple (osselets = rite ; Icare = mise +
 * multiplicateur cible ; plancher de FAVEUR commun — monnaie fermée
 * 2026-07-16). Extraits de l'ex-ArtifactTreePanel : les ACHATS d'artefacts
 * vivent désormais sur les étagères de l'échoppe (HeritageView, armoire de
 * gauche) et ces cadrans se déplient dans la barre de détail quand on
 * sélectionne la bouteille d'un capstone acquis.
 */

const RITE_OPTS = [
  { id: 'prudent', label: { fr: 'Prudent', en: 'Cautious' } },
  { id: 'classique', label: { fr: 'Ancestral', en: 'Ancestral' } },
  { id: 'grand', label: { fr: 'Grand', en: 'Great' } },
  // Le rite interdit n'apparaît qu'avec son artefact (filtré au rendu).
  { id: 'interdit', label: { fr: 'Interdit', en: 'Forbidden' }, artifact: 'interdit' }
];
const STAKE_OPTS = [
  { id: 'plume', label: { fr: 'Plume', en: 'Feather' } },
  { id: 'aile', label: { fr: 'Aile', en: 'Wing' } },
  { id: 'hecatombe', label: { fr: 'Hécatombe', en: 'Hecatomb' } }
];
const SCRATCH_OPTS = [
  { id: 'obole', label: { fr: 'Obole', en: 'Obol' } },
  { id: 'drachme', label: { fr: 'Drachme', en: 'Drachma' } },
  { id: 'talent', label: { fr: 'Talent', en: 'Talent' } }
];
const BLACKJACK_OPTS = [
  { id: 'legere', label: { fr: 'Légère', en: 'Light' } },
  { id: 'pleine', label: { fr: 'Pleine', en: 'Full' } },
  { id: 'royale', label: { fr: 'Grand jeu', en: 'High' } }
];
// Le cadran TEMPS de l'arbitrage gain/temps/risque : multiplie l'intervalle
// entre deux parties (recueilli ×2, mesuré ×1, fervent ×0.5). L'espérance PAR
// PARTIE ne bouge pas : le tempo règle le débit.
const TEMPO_OPTS = [
  { id: 'recueilli', label: { fr: 'Recueilli', en: 'Unhurried' } },
  { id: 'mesure', label: { fr: 'Mesuré', en: 'Measured' } },
  { id: 'fervent', label: { fr: 'Fervent', en: 'Fervent' } }
];

export function RateBadge({ game }) {
  // Le débit est NÉGATIF tant que la table garde un edge (l'auto consomme de la
  // Faveur en espérance) et devient POSITIF passé la bascule (dés 11+, ailes 7+,
  // planches 6+, coffre à l'échelle) : le badge est la jauge de l'imprimante.
  const v = Math.round(templeAutoThroughput(game) * 10) / 10;
  return (
    <span
      className="temple-auto-rate"
      title={tr({
        fr: "Débit de Faveur estimé aux réglages actuels, coffre compris. 0 si à l'arrêt ou avant l'ère requise. Négatif tant que la table garde un avantage ; positif quand tes augments l'ont retourné.",
        en: 'Estimated Favor throughput at current settings, chest included. 0 when off or before the required era. Negative while the table keeps an edge; positive once your augments have turned it around.'
      })}
    >
      <FaveurIcon /> {v < 0 ? `−${fmt(-v)}` : fmt(v)}<span className="temple-auto-rate-unit"> {tr({ fr: '/min', en: '/min' })}</span>
    </span>
  );
}

// Plancher de FAVEUR d'une auto de jeu (monnaie fermée 2026-07-16) : la
// réserve de jetons à ne pas entamer — l'auto ne joue que si la Faveur reste
// au-dessus APRÈS la mise.
function FaveurFloor({ game }) {
  const g = state.templeAuto[game];
  return (
    <div className="doctrine-line">
      <span
        className="doctrine-line-label"
        title={tr({
          fr: "Réserve de Faveur à garder. L'auto ne joue que si la Faveur reste au-dessus de ce niveau après la mise.",
          en: 'Favor reserve to keep. The automation only plays if Favor stays above this level after the stake.'
        })}
      >
        {tr({ fr: 'Plancher de Faveur', en: 'Favor floor' })}
      </span>
      <span className="doctrine-input-wrap">
        <input
          type="number"
          className="auto-script-input"
          min="0"
          max={AUTO_TEMPLE_FAVEUR_FLOOR_MAX}
          value={Math.round(g.faveurFloor)}
          onChange={(e) => setTempleAuto(game, { faveurFloor: parseFloat(e.target.value) || 0 })}
        />
        <span className="auto-script-unit"><FaveurIcon /></span>
      </span>
    </div>
  );
}

function Toggle({ game, onLabel }) {
  const g = state.templeAuto[game];
  return (
    <div className="doctrine-line">
      <span className="doctrine-line-label">{onLabel}</span>
      <button
        type="button"
        className={`toggle-btn ${g.on ? 'on' : 'off'}`}
        onClick={() => setTempleAuto(game, { on: !g.on })}
      >
        {g.on ? tr({ fr: 'Actif', en: 'On' }) : tr({ fr: 'Inactif', en: 'Off' })}
      </button>
    </div>
  );
}

function Seg({ game, keyName, opts }) {
  const g = state.templeAuto[game];
  return (
    <div className="doctrine-seg">
      {opts.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={`doctrine-seg-btn${g[keyName] === id ? ' is-active' : ''}`}
          onClick={() => setTempleAuto(game, { [keyName]: id })}
        >
          {tr(label)}
        </button>
      ))}
    </div>
  );
}

// Le cadran de COFFRE, commun aux quatre autos de jeu : la puissance de mise
// (mise × 10^stakePow), bornée au rang de coffre possédé. N'apparaît qu'au
// premier rang acquis — avant, l'auto mise ×1 et le cadran serait un mensonge.
function CoffreLine({ game }) {
  const lvl = coffreLevel();
  if (lvl < 1) return null;
  const g = state.templeAuto[game];
  const cur = Math.max(0, Math.min(lvl, g.stakePow || 0));
  return (
    <div className="doctrine-line">
      <span
        className="doctrine-line-label"
        title={tr({
          fr: 'La puissance de mise du coffre. L’auto mise ×10 par rang choisi ; les gains suivent la mise, le plancher aussi.',
          en: 'The chest’s stake power. The automation stakes ×10 per chosen rank; winnings follow the stake, so does the floor.'
        })}
      >
        {tr({ fr: 'Coffre', en: 'Chest' })}
      </span>
      <div className="doctrine-seg">
        {Array.from({ length: lvl + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`doctrine-seg-btn${cur === i ? ' is-active' : ''}`}
            onClick={() => setTempleAuto(game, { stakePow: i })}
          >
            ×{fmtMult(10 ** i)}
          </button>
        ))}
      </div>
    </div>
  );
}

// Le cadran de tempo, commun aux quatre autos de jeu.
function TempoLine({ game }) {
  return (
    <div className="doctrine-line">
      <span
        className="doctrine-line-label"
        title={tr({
          fr: "Cadence de l'auto. Recueilli joue deux fois moins souvent, fervent deux fois plus. L'espérance par partie ne change pas : le tempo règle le débit.",
          en: 'Automation pace. Unhurried plays half as often, fervent twice as much. The expectation per game does not change: tempo sets the throughput.'
        })}
      >
        {tr({ fr: 'Tempo', en: 'Tempo' })}
      </span>
      <Seg game={game} keyName="tempo" opts={TEMPO_OPTS} />
    </div>
  );
}

// Les libellés du toggle par jeu.
const TOGGLE_LABELS = {
  osselets: { fr: 'Auto-lancé', en: 'Auto-cast' },
  icarus: { fr: 'Autopush', en: 'Autopush' },
  gratteux: { fr: 'Auto-gratteux', en: 'Auto-scratch' },
  vingtetun: { fr: 'Auto-vingt-et-un', en: 'Auto twenty-one' }
};

// Cadrans dépliés d'une automatisation débloquée. Les QUATRE jeux ont les mêmes
// trois axes (arbitrage Raphaël 2026-07-17) : le RISQUE (rite, mise, cible), le
// TEMPS (tempo) et le GAIN GARDÉ (plancher de Faveur) — plus le toggle.
export default function AutoDials({ game }) {
  const riteOpts = RITE_OPTS.filter((o) => !o.artifact || (state.templeArtifacts || {})[o.artifact]);
  return (
    <div className="artifact-dials">
      <Toggle game={game} onLabel={tr(TOGGLE_LABELS[game] || TOGGLE_LABELS.osselets)} />
      {game === 'osselets' && (
        <div className="doctrine-line">
          <span className="doctrine-line-label">{tr({ fr: 'Rite', en: 'Rite' })}</span>
          <Seg game="osselets" keyName="rite" opts={riteOpts} />
        </div>
      )}
      {game === 'icarus' && (
        <>
          <div className="doctrine-line">
            <span className="doctrine-line-label">{tr({ fr: 'Mise', en: 'Stake' })}</span>
            <Seg game="icarus" keyName="stakeId" opts={STAKE_OPTS} />
          </div>
          <div className="doctrine-line">
            <span
              className="doctrine-line-label"
              title={tr({
                fr: 'Multiplicateur où encaisser : bas = revenu régulier, haut = gros coups (faibles chances). Le jackpot (cagnotte + jalon) reste manuel.',
                en: 'Cash-out multiplier: low = steady income, high = big wins (low odds). The jackpot (pot + milestone) stays manual.'
              })}
            >
              {tr({ fr: 'Cible', en: 'Target' })}
            </span>
            <span className="temple-auto-slider">
              <input
                type="range"
                min={AUTO_ICARUS_TARGET_MIN}
                max={AUTO_ICARUS_TARGET_MAX}
                step="0.1"
                value={state.templeAuto.icarus.target}
                onChange={(e) => setTempleAuto('icarus', { target: parseFloat(e.target.value) })}
              />
              <strong className="temple-auto-slider-val">×{Number(state.templeAuto.icarus.target).toFixed(1)}</strong>
            </span>
          </div>
        </>
      )}
      {game === 'gratteux' && (
        <div className="doctrine-line">
          <span className="doctrine-line-label">{tr({ fr: 'Mise', en: 'Stake' })}</span>
          <Seg game="gratteux" keyName="stakeId" opts={SCRATCH_OPTS} />
        </div>
      )}
      {game === 'vingtetun' && (
        <div className="doctrine-line">
          <span
            className="doctrine-line-label"
            title={tr({
              fr: "L'auto joue la stratégie de la mesure (tirer ou rester), jamais le double. Les séries de l'oracle ne comptent que tes mains.",
              en: 'The automation plays the measure (hit or stand), never the double. Oracle streaks only count your own hands.'
            })}
          >
            {tr({ fr: 'Mise', en: 'Stake' })}
          </span>
          <Seg game="vingtetun" keyName="stakeId" opts={BLACKJACK_OPTS} />
        </div>
      )}
      <CoffreLine game={game} />
      <TempoLine game={game} />
      <FaveurFloor game={game} />
    </div>
  );
}
