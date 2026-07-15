import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import {
  artifactTree,
  buyArtifactNode,
  setTempleAuto,
  templeAutoThroughput
} from '../../game/core/actions.js';
import { AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX, AUTO_TEMPLE_GOLD_FLOOR_MAX_S } from '../../game/core/balance.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';

/**
 * L'ARBRE D'ARTEFACTS du Temple (Phase 4) — remplace le tableau de bord
 * d'automatisation isolé (Phase 3) par DEUX lignées en ÉCHELLE :
 *   osselets : Dés pipés (niveaux) → Dé d'ivoire → Osselet du noyé → Osselets sacrés (auto)
 *   Icare    : Ailes cirées (niveaux) → Plumes de secours → Ailes solaires → Ailes d'aigle (auto)
 * On achète les rangs dans l'ordre (le rang N exige le rang N-1). Les artefacts
 * refont le RISQUE (profils, pas des sticks de stats) et SURVIVENT au Grand
 * Reset. Le capstone est l'AUTOMATISATION : une fois débloquée, le rang déplie
 * ses CADRANS (les dials de la Phase 3, fusionnés ici). Tout se lit dans
 * artifactTree() (moteur), tout achat passe par buyArtifactNode(id).
 */

const RITE_OPTS = [
  { id: 'prudent', label: { fr: 'Prudent', en: 'Cautious' } },
  { id: 'classique', label: { fr: 'Ancestral', en: 'Ancestral' } },
  { id: 'grand', label: { fr: 'Grand', en: 'Great' } }
];
const STAKE_OPTS = [
  { id: 'plume', label: { fr: 'Plume', en: 'Feather' } },
  { id: 'aile', label: { fr: 'Aile', en: 'Wing' } },
  { id: 'hecatombe', label: { fr: 'Hécatombe', en: 'Hecatomb' } }
];

// ── Cadrans de l'automatisation (capstone déplié) ────────────────────────────
function RateBadge({ game }) {
  return (
    <span
      className="temple-auto-rate"
      title={tr({
        fr: "Débit estimé (espérance) aux réglages actuels. 0 si à l'arrêt ou avant l'ère requise ; sinon borne haute — le plancher d'or peut réduire la cadence réelle.",
        en: 'Estimated throughput (expectation) at current settings. 0 when off or before the required era; otherwise an upper bound — the gold floor can slow the real cadence.'
      })}
    >
      ✦ {fmt(Math.round(templeAutoThroughput(game)))}<span className="temple-auto-rate-unit"> {tr({ fr: '/min', en: '/min' })}</span>
    </span>
  );
}

function GoldFloor({ game }) {
  const g = state.templeAuto[game];
  return (
    <div className="doctrine-line">
      <span
        className="doctrine-line-label"
        title={tr({
          fr: "Réserve d'or à garder : sous ce niveau (en secondes de production d'or), l'auto se met en veille — elle ne joue que si l'or reste au-dessus APRÈS la mise.",
          en: 'Gold reserve to keep: below this (in seconds of gold production) the automation stands by — it only plays if gold stays above AFTER the stake.'
        })}
      >
        {tr({ fr: "Plancher d'or", en: 'Gold floor' })}
      </span>
      <span className="doctrine-input-wrap">
        <input
          type="number"
          className="auto-script-input"
          min="0"
          max={AUTO_TEMPLE_GOLD_FLOOR_MAX_S}
          value={Math.round(g.goldFloorS)}
          onChange={(e) => setTempleAuto(game, { goldFloorS: parseFloat(e.target.value) || 0 })}
        />
        <span className="auto-script-unit">{tr({ fr: 's', en: 's' })}</span>
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

// Cadrans dépliés d'une automatisation débloquée (osselets = rite ; Icare =
// mise + multiplicateur cible). Le plancher d'or est commun aux deux.
function AutoDials({ game }) {
  return (
    <div className="artifact-dials">
      {game === 'osselets' ? (
        <>
          <Toggle game="osselets" onLabel={tr({ fr: 'Auto-lancé', en: 'Auto-cast' })} />
          <div className="doctrine-line">
            <span className="doctrine-line-label">{tr({ fr: 'Rite', en: 'Rite' })}</span>
            <Seg game="osselets" keyName="rite" opts={RITE_OPTS} />
          </div>
          <GoldFloor game="osselets" />
        </>
      ) : (
        <>
          <Toggle game="icarus" onLabel={tr({ fr: 'Autopush', en: 'Autopush' })} />
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
          <GoldFloor game="icarus" />
        </>
      )}
    </div>
  );
}

// ── Un rang de l'échelle ─────────────────────────────────────────────────────
function LadderNode({ game, node }) {
  const isLevel = node.kind === 'level';
  const isAuto = node.kind === 'automation';
  // Automation débloquée → on déplie ses cadrans (plus de bouton d'achat).
  if (isAuto && node.owned) {
    return (
      <li className="artifact-node is-owned kind-automation">
        <div className="artifact-node-head">
          <span className="artifact-node-name">{tr(node.label)}</span>
          <RateBadge game={game} />
        </div>
        <AutoDials game={game} />
      </li>
    );
  }

  const stateClass = node.owned
    ? 'is-owned'
    : !node.unlocked
      ? 'is-locked'
      : node.buyable
        ? 'is-buyable'
        : 'is-wanting'; // débloqué mais Faveur insuffisante

  // Libellé du bouton selon le kind + l'état.
  let btnLabel;
  if (isLevel) {
    btnLabel = node.maxed
      ? tr({ fr: 'Complet', en: 'Full' })
      : `${tr({ fr: 'Améliorer', en: 'Upgrade' })} · ✦ ${fmt(node.cost)}`;
  } else if (node.owned) {
    btnLabel = tr({ fr: 'Acquis', en: 'Owned' });
  } else if (isAuto) {
    // Pas de 🔓 ici : le 🔒 devant (quand verrouillé) suffit ; une fois
    // déverrouillé, « Débloquer » se lit seul, sans cadenas contradictoire.
    btnLabel = `${tr({ fr: 'Débloquer', en: 'Unlock' })} · ✦ ${fmt(node.cost)}`;
  } else {
    btnLabel = `${tr({ fr: 'Acheter', en: 'Buy' })} · ✦ ${fmt(node.cost)}`;
  }

  const nameSuffix = isLevel && node.level > 0
    ? ` · ${tr({ fr: 'niv.', en: 'lvl' })} ${node.level}${node.maxed ? ` (${tr({ fr: 'max', en: 'max' })})` : `/${node.maxLevel}`}`
    : '';

  return (
    <li className={`artifact-node kind-${node.kind} ${stateClass}`}>
      <div className="artifact-node-head">
        <span className="artifact-node-name">
          {node.owned && !isLevel ? '✓ ' : ''}{tr(node.label)}{nameSuffix}
        </span>
      </div>
      <p className="artifact-node-desc">{tr(node.desc)}</p>
      <button
        type="button"
        className="artifact-node-buy"
        disabled={!node.buyable}
        title={
          !node.unlocked
            ? tr({ fr: 'Rang précédent requis.', en: 'Previous rank required.' })
            : node.lockedReason === 'faveur'
              ? tr({ fr: 'Pas assez de Faveur — gagne-en aux jeux du temple.', en: 'Not enough Favor — earn it at the temple games.' })
              : undefined
        }
        onClick={() => buyArtifactNode(node.id)}
      >
        {!node.unlocked ? '🔒 ' : ''}{btnLabel}
      </button>
    </li>
  );
}

export default function ArtifactTreePanel() {
  // Re-render 1 Hz sur la Faveur, les artefacts, les niveaux et les cadrans.
  useGameState((s) => {
    const t = s.templeAuto || {};
    const o = t.osselets || {};
    const i = t.icarus || {};
    const arts = Object.keys(s.templeArtifacts || {}).sort().join(',');
    return `${Math.floor(s.faveur || 0)}:${s.diceLevel || 0}:${s.wingLevel || 0}:${arts}` +
      `:${o.unlocked}:${o.on}:${o.rite}:${o.goldFloorS}:${i.unlocked}:${i.on}:${i.stakeId}:${i.target}:${i.goldFloorS}`;
  });

  const tree = artifactTree();
  // Apparaît dès qu'une lignée est ouverte (son ère atteinte) : c'est là qu'on
  // gagne la Faveur qui grimpe l'échelle. Rien avant (aucune économie de temple).
  if (!tree.some((lin) => lin.eraOk)) return null;
  if (!state.templeAuto) return null; // garde défensive (hydraté par défaut)

  return (
    <div className="panel artifact-tree-panel">
      <div className="panel-heading">
        <div><h2>⚜️ {tr({ fr: 'Artefacts du Temple', en: 'Temple Artifacts' })}</h2></div>
      </div>
      <p className="temple-auto-intro">
        {tr({
          fr: "Deux voies qui se gravissent rang par rang : des artefacts qui refont le RISQUE (des profils, pas des stats), jusqu'à l'automatisation qui joue à ta place. Tout survit au Grand Reset ; la Faveur, elle, se re-gagne.",
          en: 'Two paths climbed rank by rank: artifacts that reshape RISK (profiles, not stats), up to the automation that plays for you. Everything survives the Grand Reset; Favor is re-earned.'
        })}
      </p>

      <div className="temple-auto-grid">
        {tree.map((lin) => (
          <section key={lin.id} className={`temple-auto-game artifact-lineage${lin.eraOk ? '' : ' is-era-locked'}`}>
            <h3 className="temple-auto-game-title artifact-lineage-title">
              <span>{lin.icon} {tr(lin.label)}</span>
            </h3>
            <span className="artifact-lineage-sub">{tr(lin.subtitle)}</span>
            {lin.eraOk ? (
              <ol className="artifact-ladder">
                {lin.nodes.map((node) => (
                  <LadderNode key={node.id} game={lin.id} node={node} />
                ))}
              </ol>
            ) : (
              <p className="artifact-era-hint">
                {tr({ fr: 'Atteins son ère pour ouvrir cette voie.', en: 'Reach its era to open this path.' })}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
