import { state } from '../../game/core/state.js';
import { setTempleAuto, templeAutoThroughput, autoFloorMax, autoStake } from '../../game/core/actions.js';
import { AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX } from '../../game/core/balance.js';
import { fmt, fmtHabitants } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';

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
// Le cadran de MISE, commun aux quatre autos de jeu (lot 1 des gains « vrai
// casino ») : une part de la limite de la table, qui grandit avec la ville.
const STAKE_STEP_OPTS = [
  { id: 'min', label: { fr: 'Min', en: 'Min' } },
  { id: 'quart', label: { fr: '¼', en: '¼' } },
  { id: 'moitie', label: { fr: '½', en: '½' } },
  { id: 'max', label: { fr: 'Max', en: 'Max' } }
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
  // Le débit des JEUX est NÉGATIF (les cotes sont fixes et la maison garde son
  // avantage : l'auto consomme de la Faveur en espérance) ; seule la caisse rapporte.
  const v = Math.round(templeAutoThroughput(game) * 10) / 10;
  return (
    <span
      className="temple-auto-rate"
      {...tipProps(null, tr({
        fr: "Débit de Faveur estimé aux réglages actuels. 0 si à l'arrêt ou avant l'ère requise. Négatif pour les jeux : la Maison garde son avantage, l'auto joue pour le plaisir et les coups rares.",
        en: 'Estimated Favor throughput at current settings. 0 when off or before the required era. Negative for the games: the House keeps its edge, the automation plays for fun and the rare hits.'
      }))}
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
        {...tipProps(tr({ fr: 'Plancher de Faveur', en: 'Favor floor' }), tr({
          fr: "Réserve de Faveur à garder. L'auto ne joue que si la Faveur reste au-dessus de ce niveau après la mise.",
          en: 'Favor reserve to keep. The automation only plays if Favor stays above this level after the stake.'
        }))}
      >
        {tr({ fr: 'Plancher de Faveur', en: 'Favor floor' })}
      </span>
      <span className="doctrine-input-wrap">
        <input
          type="number"
          className="auto-script-input"
          min="0"
          max={autoFloorMax()}
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
      {/* Une CASE sans texte (chrome-wizard.css « LES BASCULES ») : l'état
          passe par aria-label / aria-pressed. */}
      <button
        type="button"
        className={`toggle-btn ${g.on ? 'on' : 'off'}`}
        aria-pressed={Boolean(g.on)}
        aria-label={g.on ? tr({ fr: 'Actif', en: 'On' }) : tr({ fr: 'Inactif', en: 'Off' })}
        onClick={() => setTempleAuto(game, { on: !g.on })}
      ></button>
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

// Le cadran de MISE, commun aux quatre autos de jeu : une part de la limite de la
// table. La mise du moment s'affiche à côté (elle grandit avec la ville).
function StakeLine({ game, tip }) {
  const g = state.templeAuto[game];
  return (
    <div className="doctrine-line">
      <span
        className="doctrine-line-label"
        {...tipProps(tr({ fr: 'Mise', en: 'Stake' }), tip || tr({
          fr: 'Une part de la limite de la table, qui grandit avec la ville.',
          en: 'A share of the table limit, which grows with the city.'
        }))}
      >
        {tr({ fr: 'Mise', en: 'Stake' })} <FaveurIcon /> {fmtHabitants(autoStake(g.stakeStep))}
      </span>
      <Seg game={game} keyName="stakeStep" opts={STAKE_STEP_OPTS} />
    </div>
  );
}

// Le cadran de tempo, commun aux quatre autos de jeu.
function TempoLine({ game }) {
  return (
    <div className="doctrine-line">
      <span
        className="doctrine-line-label"
        {...tipProps(tr({ fr: 'Tempo', en: 'Tempo' }), tr({
          fr: "Cadence de l'auto. Recueilli joue deux fois moins souvent, fervent deux fois plus. L'espérance par partie ne change pas : le tempo règle le débit.",
          en: 'Automation pace. Unhurried plays half as often, fervent twice as much. The expectation per game does not change: tempo sets the throughput.'
        }))}
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
            <span
              className="doctrine-line-label"
              {...tipProps(tr({ fr: 'Cible', en: 'Target' }), tr({
                fr: 'Multiplicateur où encaisser : bas = revenu régulier, haut = gros coups (faibles chances). Le jackpot (cagnotte + jalon) reste manuel.',
                en: 'Cash-out multiplier: low = steady income, high = big wins (low odds). The jackpot (pot + milestone) stays manual.'
              }))}
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
      <StakeLine
        game={game}
        tip={game === 'vingtetun' ? tr({
          fr: "Une part de la limite de la table. L'auto joue la stratégie de la mesure (tirer, rester, doubler), jamais la refente. Les séries de l'oracle ne comptent que tes mains.",
          en: 'A share of the table limit. The automation plays the measure (hit, stand, double), never splits. Oracle streaks only count your own hands.'
        }) : null}
      />
      <TempoLine game={game} />
      <FaveurFloor game={game} />
    </div>
  );
}
