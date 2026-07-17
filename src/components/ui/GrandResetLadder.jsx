import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { renderCache } from '../../game/core/state.js';
import { grandResetProductionMult } from '../../game/core/balance.js';
import {
  GRAND_RESET_MILESTONES,
  grandResetMilestoneMet,
  isGrandResetMilestoneRevealed
} from '../../game/core/mechanics.js';
import { performGrandReset } from '../../game/core/actions.js';
import { tr } from '../../game/core/i18n.js';
import PixelIcon from './PixelIcon.jsx';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

// Médaillon pixel-art de chaque jalon (emblèmes existants + 2 dédiés). Montré
// SEULEMENT une fois le jalon révélé : avant, il vendrait la mèche du secret.
const MILESTONE_GLYPHS = {
  1: 'glyphs/cycles',
  2: 'glyphs/merveille',
  3: 'myths/pacte',
  4: 'ruins/population',
  5: 'glyphs/olympe',
  6: 'prep/sceau',
  7: 'icarus/icarus',
  8: 'myths/atrides',
  9: 'glyphs/couronne',
  10: 'glyphs/temps',
  11: 'myths/phenix'
};

// Stèle des Grands Resets (page Effondrement, sous la Doctrine de crise) :
// échelle verticale gravée — rail doré jusqu'au palier courant, un médaillon
// par système, 4 états lisibles (accompli / prêt / à découvrir / scellé). Les
// 11 paliers sont TOUS visibles mais leur JALON reste secret jusqu'à ce que le
// joueur l'atteigne ; chaque récompense (×N prod / ×4 Ruines au XI) est, elle,
// toujours affichée.
export default function GrandResetLadder() {
  const grandResetCount = useGameState(s => s.grandResetCount || 0);
  const ragnarokHeritage = useGameState(s => Boolean(s.ragnarokHeritage));
  // Abonnement à l'horloge du tick : re-rend en direct pour refléter l'atteinte
  // d'un jalon (les checks lisent le state courant) sans dépendre d'un sélecteur
  // par jalon.
  useGameState(() => renderCache.tickNow);

  const maxGR = ragnarokHeritage ? 11 : 10;
  const nextGR = grandResetCount + 1;
  const rungs = GRAND_RESET_MILESTONES.filter(m => m.gr <= maxGR);

  // Cliché des jalons déjà révélés au montage : une révélation qui survient EN
  // SESSION (absente du cliché) déclenche l'animation de dorure, une seule fois.
  const [initialRevealed] = useState(() => new Set(
    GRAND_RESET_MILESTONES
      .filter(m => m.gr <= grandResetCount || isGrandResetMilestoneRevealed(m.gr))
      .map(m => m.gr)
  ));

  return (
    <div className="panel gr-ladder-panel">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: "Les Grands Resets", en: "The Grand Resets" })}</h2>
        </div>
        <div className="gr-ladder-progress">
          <span className="gr-notches" aria-hidden="true">
            {rungs.map(m => (
              <span
                key={m.gr}
                className={`gr-notch${m.gr <= grandResetCount ? ' is-filled' : m.gr === nextGR ? ' is-next' : ''}`}
              />
            ))}
          </span>
          <span className="gr-ladder-count">{grandResetCount} / {maxGR}</span>
        </div>
      </div>
      <ol className="gr-ladder">
        {rungs.map(m => {
          const done = m.gr <= grandResetCount;
          const isNext = m.gr === nextGR;
          const ready = isNext && grandResetMilestoneMet(m.gr);
          const revealed = done || isGrandResetMilestoneRevealed(m.gr);
          const fresh = revealed && !initialRevealed.has(m.gr);
          const status = done ? 'done' : ready ? 'ready' : isNext ? 'next' : 'locked';
          const reward = m.gr === 11
            ? tr({ fr: "×4 Ruines", en: "×4 Ruins" })
            : `×${grandResetProductionMult(m.gr).toFixed(0)} prod`;

          return (
            <li key={m.gr} className={`gr-rung is-${status}${fresh ? ' is-fresh' : ''}`}>
              <span className="gr-medal" aria-hidden="true">
                {revealed ? (
                  <PixelIcon name={MILESTONE_GLYPHS[m.gr]} className="gr-medal-icon" />
                ) : isNext ? (
                  <span className="gr-medal-q">?</span>
                ) : (
                  <span className="gr-medal-rune" />
                )}
              </span>
              <span className="gr-rung-num">{ROMAN[m.gr]}</span>
              <span className="gr-rung-body">
                <span className="gr-rung-jalon">
                  {revealed ? tr(m.name)
                    : isNext ? tr({ fr: "Jalon à découvrir", en: "Milestone to discover" })
                    : <span
                        className="gr-rune-line"
                        title={tr({ fr: "Jalon scellé", en: "Sealed milestone" })}
                      />}
                </span>
                <span className="gr-rung-sub">
                  {revealed ? tr(m.system)
                    : isNext ? tr({ fr: "Les augures restent muets…", en: "The augurs remain silent…" })
                    : tr({ fr: "Jalon scellé", en: "Sealed milestone" })}
                </span>
              </span>
              <span className="gr-rung-reward">{reward}</span>
              <span className="gr-rung-status">
                {done ? (
                  <span className="gr-rung-done" title={tr({ fr: "Accompli", en: "Completed" })}>✓</span>
                ) : ready ? (
                  <button className="gr-rung-btn" onClick={performGrandReset}>
                    {tr({ fr: "Activer", en: "Activate" })}
                  </button>
                ) : revealed && isNext ? (
                  <span className="gr-rung-pending" title={tr({ fr: "Jalon découvert, à atteindre de nouveau", en: "Milestone discovered, reach it again" })}>◆</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
