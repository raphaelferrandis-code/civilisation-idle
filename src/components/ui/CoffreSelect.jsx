import { tr } from '../../game/core/i18n.js';
import { coffreLevel, fmtMult } from './coffreMeta.js';
import { tipProps } from './HelpBubble.jsx';

/**
 * Les coffres du temple — sélecteur de PUISSANCE de mise partagé par les 4
 * scènes de jeu. Chaque rang de coffre (state.coffreLevel, boutique) autorise
 * une mise ×10 de plus : la rangée n'apparaît qu'au premier rang acquis, et ne
 * propose QUE des puissances de 10 (le moteur re-clampe de toute façon via
 * clampStakeMult — l'UI et l'auto ne sont pas les garde-fous).
 */
export default function CoffreSelect({ value, onChange }) {
  const lvl = coffreLevel();
  if (lvl < 1) return null;
  const opts = [];
  for (let i = 0; i <= lvl; i++) opts.push(10 ** i);
  return (
    <div
      className="coffre-select"
      role="group"
      aria-label={tr({ fr: 'Puissance de mise (coffre du temple)', en: 'Stake power (temple chest)' })}
      {...tipProps(null, tr({
        fr: 'Le coffre du temple : chaque rang autorise une mise dix fois plus lourde. Les gains suivent la mise.',
        en: 'The temple chest: each rank allows a tenfold heavier stake. Winnings follow the stake.'
      }))}
    >
      <span className="coffre-select-label">🏺 {tr({ fr: 'coffre', en: 'chest' })}</span>
      {opts.map((m) => (
        <button
          key={m}
          type="button"
          className={`coffre-mult${(value === m || (m === 1 && !opts.includes(value))) ? ' is-chosen' : ''}`}
          onClick={() => onChange(m)}
        >
          ×{fmtMult(m)}
        </button>
      ))}
    </div>
  );
}
