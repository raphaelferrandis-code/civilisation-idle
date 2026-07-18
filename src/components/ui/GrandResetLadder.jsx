import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { renderCache } from '../../game/core/state.js';
import {
  GRAND_RESET_MILESTONES,
  isGrandResetMilestoneRevealed,
  isGrandResetMilestoneClaimed,
  isGrandResetMilestoneClaimable,
  claimableGrandResetCount
} from '../../game/core/mechanics.js';
import { performGrandReset } from '../../game/core/actions.js';
import { tr } from '../../game/core/i18n.js';
import PixelIcon from './PixelIcon.jsx';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

// Médaillon pixel-art de chaque sceau (emblèmes existants + 2 dédiés). Montré
// SEULEMENT une fois le sceau révélé : avant, il vendrait la mèche du secret.
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

// Plateau des Sceaux du Grand Reset (page Effondrement, sous la Doctrine de crise).
// Système ORDRE-LIBRE : les 11 sceaux se réclament indépendamment, dans n'importe
// quel ordre. Remplir la condition d'un sceau le LATCHE « prêt » à vie (banking) ;
// réclamer un sceau coûte un reset et donne ×2 permanent. Chaque sceau reste masqué
// (« ??? ») jusqu'à ce que sa condition soit atteinte une 1re fois.
export default function GrandResetLadder() {
  const grandResetCount = useGameState(s => s.grandResetCount || 0);
  const ragnarokHeritage = useGameState(s => Boolean(s.ragnarokHeritage));
  // Abonnement à l'horloge du tick : re-rend en direct pour refléter l'atteinte /
  // le latch d'un sceau (les checks lisent le state courant) sans sélecteur par sceau.
  useGameState(() => renderCache.tickNow);

  const maxGR = ragnarokHeritage ? 11 : 10;
  const rungs = GRAND_RESET_MILESTONES.filter(m => m.gr <= maxGR);
  const claimable = claimableGrandResetCount();

  // Cliché des sceaux déjà révélés au montage : une révélation qui survient EN
  // SESSION (absente du cliché) déclenche l'animation de dorure, une seule fois.
  const [initialRevealed] = useState(() => new Set(
    GRAND_RESET_MILESTONES
      .filter(m => isGrandResetMilestoneRevealed(m.gr))
      .map(m => m.gr)
  ));

  return (
    <div className="panel gr-ladder-panel">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: "Les Sceaux du Grand Reset", en: "The Grand Reset Seals" })}</h2>
          <p className="gr-ladder-hint">
            {tr({
              fr: "Débloque-les dans l'ordre que tu veux. Un sceau atteint reste réclamable à vie — tu peux en banker plusieurs dans une même run avant de lâcher un reset.",
              en: "Unlock them in any order. A reached seal stays claimable forever — you can bank several in one run before spending a reset."
            })}
          </p>
        </div>
        <div className="gr-ladder-progress">
          <span className="gr-notches" aria-hidden="true">
            {rungs.map(m => (
              <span
                key={m.gr}
                className={`gr-notch${isGrandResetMilestoneClaimed(m.gr) ? ' is-filled' : isGrandResetMilestoneClaimable(m.gr) ? ' is-next' : ''}`}
              />
            ))}
          </span>
          <span className="gr-ladder-count">{grandResetCount} / {maxGR}</span>
        </div>
      </div>

      {claimable > 0 && (
        <p className="gr-ladder-ready" role="status">
          {tr({
            fr: `✦ ${claimable} sceau${claimable > 1 ? 'x' : ''} prêt${claimable > 1 ? 's' : ''} à réclamer`,
            en: `✦ ${claimable} seal${claimable > 1 ? 's' : ''} ready to claim`
          })}
        </p>
      )}

      <ol className="gr-ladder">
        {rungs.map(m => {
          const claimed = isGrandResetMilestoneClaimed(m.gr);
          const ready = isGrandResetMilestoneClaimable(m.gr);
          const revealed = claimed || isGrandResetMilestoneRevealed(m.gr);
          // Seul cas « révélé mais pas réclamable » : le Ragnarök (gr 11) découvert
          // sans encore posséder l'héritage du pacte final.
          const ragnarokLocked = m.gr === 11 && revealed && !claimed && !ready;
          const fresh = revealed && !initialRevealed.has(m.gr);
          const status = claimed ? 'done' : ready ? 'ready' : revealed ? 'next' : 'locked';
          // Récompense MARGINALE : chaque sceau réclamé = ×2 (le total est ×2^réclamés,
          // indépendant de l'ordre). Le Ragnarök ajoute son ×4 Ruines.
          const reward = m.gr === 11
            ? tr({ fr: "×2 & ×4 Ruines", en: "×2 & ×4 Ruins" })
            : tr({ fr: "×2 prod", en: "×2 prod" });

          return (
            <li key={m.gr} className={`gr-rung is-${status}${fresh ? ' is-fresh' : ''}`}>
              <span className="gr-medal" aria-hidden="true">
                {revealed ? (
                  <PixelIcon name={MILESTONE_GLYPHS[m.gr]} className="gr-medal-icon" />
                ) : (
                  <span className="gr-medal-rune" />
                )}
              </span>
              <span className="gr-rung-num">{ROMAN[m.gr]}</span>
              <span className="gr-rung-body">
                <span className="gr-rung-jalon">
                  {revealed ? tr(m.name)
                    : <span className="gr-rune-line" title={tr({ fr: "Sceau scellé", en: "Sealed" })} />}
                </span>
                <span className="gr-rung-sub">
                  {ragnarokLocked
                    ? tr({ fr: "Exige le pacte du Ragnarök", en: "Requires the Ragnarök pact" })
                    : revealed ? tr(m.system)
                    : tr({ fr: "Sceau à découvrir…", en: "Seal to discover…" })}
                </span>
              </span>
              <span className="gr-rung-reward">{reward}</span>
              <span className="gr-rung-status">
                {claimed ? (
                  <span className="gr-rung-done" title={tr({ fr: "Sceau réclamé", en: "Seal claimed" })}>✓</span>
                ) : ready ? (
                  <button className="gr-rung-btn" onClick={() => performGrandReset(m.gr)}>
                    {tr({ fr: "Réclamer", en: "Claim" })}
                  </button>
                ) : ragnarokLocked ? (
                  <span className="gr-rung-pending" title={tr({ fr: "Honore le pacte du Ragnarök pour le réclamer", en: "Honor the Ragnarök pact to claim it" })}>🔒</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
