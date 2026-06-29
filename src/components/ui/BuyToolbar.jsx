import { useGameState } from '../../hooks/useGameState.js';
import { setBuyAmount, invalidateRenderCache } from '../../game/core/state.js';
import { has } from '../../game/core/mechanics.js';
import { tr } from '../../game/core/i18n.js';

export default function BuyToolbar() {
  const buyAmount = useGameState(s => s.buyAmount);
  const hasMaxUpgrade = useGameState(() => has("reforme_administrative"));

  const handleSetAmount = (amount) => {
    setBuyAmount(amount);
    invalidateRenderCache("buildings");
  };

  const modes = [
    { label: 'x1', value: 1 },
    { label: 'x10', value: 10 },
    { label: 'x25', value: 25 },
    { label: 'x100', value: 100 },
  ];

  return (
    <div className="buy-toolbar" id="buyToolbar" aria-label={tr({ fr: "Mode d'achat", en: "Buy mode" })}>
      <div className="buy-modes">
        {modes.map(mode => (
          <button
            key={mode.value}
            className={`buy-mode ${buyAmount === mode.value ? 'active' : ''}`}
            onClick={() => handleSetAmount(mode.value)}
          >
            {mode.label}
          </button>
        ))}
        {hasMaxUpgrade && (
          <button
            className={`buy-mode buy-mode-max ${buyAmount === 'max' ? 'active' : ''}`}
            onClick={() => handleSetAmount('max')}
          >
            {tr({ fr: "Max", en: "Max" })}
          </button>
        )}
      </div>
    </div>
  );
}
