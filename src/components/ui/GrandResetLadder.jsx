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

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

// Table des Grands Resets (page Effondrement, sous la Doctrine de crise) : les 11
// paliers sont TOUS visibles, mais leur JALON reste secret (« ??? ») jusqu'à ce
// que le joueur l'atteigne — il le découvre alors, et peut déclencher le GR quand
// il veut. Chaque récompense (×N production / ×4 Ruines au XI) est, elle, affichée.
export default function GrandResetLadder() {
  const grandResetCount = useGameState(s => s.grandResetCount || 0);
  const ragnarokHeritage = useGameState(s => Boolean(s.ragnarokHeritage));
  // Abonnement à l'horloge du tick : re-rend en direct pour refléter l'atteinte
  // d'un jalon (les checks lisent le state courant) sans dépendre d'un sélecteur
  // par jalon.
  useGameState(() => renderCache.tickNow);

  const maxGR = ragnarokHeritage ? 11 : 10;
  const nextGR = grandResetCount + 1;

  return (
    <div className="panel gr-ladder-panel">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: "Les Grands Resets", en: "The Grand Resets" })}</h2>
        </div>
        <span className="gr-ladder-count">{grandResetCount} / {maxGR}</span>
      </div>
      <p className="body-copy">
        {tr({
          fr: "Chaque Grand Reset se débloque en atteignant un jalon marquant — que tu découvriras en jouant. Une fois débloqué, déclenche-le quand tu veux : il efface tout mais accorde un bonus permanent.",
          en: "Each Grand Reset unlocks upon reaching a landmark milestone — which you'll discover as you play. Once unlocked, trigger it whenever you like: it wipes everything but grants a permanent bonus."
        })}
      </p>
      <ol className="gr-ladder">
        {GRAND_RESET_MILESTONES.filter(m => m.gr <= maxGR).map(m => {
          const done = m.gr <= grandResetCount;
          const isNext = m.gr === nextGR;
          const ready = isNext && grandResetMilestoneMet(m.gr);
          const revealed = done || isGrandResetMilestoneRevealed(m.gr);
          const status = done ? 'done' : ready ? 'ready' : isNext ? 'next' : 'locked';
          const reward = m.gr === 11
            ? tr({ fr: "×4 Ruines", en: "×4 Ruins" })
            : tr({ fr: `×${grandResetProductionMult(m.gr).toFixed(0)} prod`, en: `×${grandResetProductionMult(m.gr).toFixed(0)} prod` });

          return (
            <li key={m.gr} className={`gr-rung is-${status}`}>
              <span className="gr-rung-num">{ROMAN[m.gr]}</span>
              <span className="gr-rung-body">
                <span className="gr-rung-jalon">
                  {revealed ? tr(m.name) : tr({ fr: "Jalon secret", en: "Secret milestone" })}
                </span>
                <span className="gr-rung-sub">
                  {revealed ? tr(m.system) : "???"} · {reward}
                </span>
              </span>
              <span className="gr-rung-status">
                {done ? (
                  <span className="gr-rung-done" title={tr({ fr: "Accompli", en: "Completed" })}>✓</span>
                ) : ready ? (
                  <button className="gr-rung-btn" onClick={performGrandReset}>
                    {tr({ fr: "Activer", en: "Activate" })}
                  </button>
                ) : isNext ? (
                  <span className="gr-rung-pending" title={tr({ fr: "Jalon en cours de découverte", en: "Milestone yet to discover" })}>◆</span>
                ) : (
                  <span className="gr-rung-locked" aria-hidden="true">🔒</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
