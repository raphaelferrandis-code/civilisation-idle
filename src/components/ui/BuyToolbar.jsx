import { useGameState } from '../../hooks/useGameState.js';
import { setBuyAmount, invalidateRenderCache } from '../../game/core/state.js';
import { has } from '../../game/core/mechanics.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';

export default function BuyToolbar() {
  const buyAmount = useGameState(s => s.buyAmount);
  const hasMaxUpgrade = useGameState(() => has("reforme_administrative"));

  const handleSetAmount = (amount) => {
    setBuyAmount(amount);
    invalidateRenderCache("buildings");
  };

  // « ×10 » comme partout ailleurs dans le jeu (le « x » latin y faisait exception).
  const modes = [
    { label: '×1', value: 1 },
    { label: '×10', value: 10 },
    { label: '×25', value: 25 },
    { label: '×100', value: 100 },
  ];

  // `aria-pressed` : le mode actif n'était dit que par la classe .active, donc
  // invisible au lecteur d'écran (BUG-118). role="group" donne un sens à
  // l'aria-label du bandeau, qu'un <div> nu ne porte pas.
  return (
    <div className="buy-toolbar" id="buyToolbar" role="group" aria-label={tr({ fr: "Mode d'achat", en: "Buy mode" })}>
      <div className="buy-modes">
        {modes.map(mode => (
          <button
            key={mode.value}
            className={`buy-mode ${buyAmount === mode.value ? 'active' : ''}`}
            aria-pressed={buyAmount === mode.value}
            onClick={() => handleSetAmount(mode.value)}
          >
            {mode.label}
          </button>
        ))}
        {/* Palier : la quantité dépend du bâtiment (ce qui reste avant son
            prochain jalon), d'où une sentinelle et non un entier. */}
        <button
          className={`buy-mode buy-mode-step ${buyAmount === 'step' ? 'active' : ''}`}
          aria-pressed={buyAmount === 'step'}
          onClick={() => handleSetAmount('step')}
          {...tipProps(tr({ fr: "Palier", en: "Milestone" }), tr({
            fr: "Achète exactement de quoi franchir le prochain palier de ce bâtiment, ni plus ni moins.",
            en: "Buys exactly what it takes to cross this building's next milestone, no more, no less."
          }))}
        >
          {tr({ fr: "Palier", en: "Milestone" })}
        </button>
        {hasMaxUpgrade && (
          <button
            className={`buy-mode buy-mode-max ${buyAmount === 'max' ? 'active' : ''}`}
            aria-pressed={buyAmount === 'max'}
            onClick={() => handleSetAmount('max')}
          >
            {tr({ fr: "Max", en: "Max" })}
          </button>
        )}
      </div>
    </div>
  );
}
