import { useGameState } from '../../hooks/useGameState.js';
import PixelIcon from '../ui/PixelIcon.jsx';
import Place, { PlaceKey } from '../ui/Place.jsx';
import { rates } from '../../game/core/mechanics.js';
import { comptoirBuy, comptoirSellFood } from '../../game/core/actions.js';
import { COMPTOIR_LOT_SECONDS, COMPTOIR_BUY_MARKUP, COMPTOIR_SELL_RATE } from '../../game/core/balance.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { D } from '../../game/core/num.js';

/**
 * « Le Comptoir » — l'onglet Marchandage, héritage du Mythe de l'Âge d'Or.
 * Échange permanent au tarif du marchand : sa MARGE est la contrepartie (le
 * Comptoir dépanne, il n'enrichit pas). Lots et prix ancrés sur la production
 * COURANTE (COMPTOIR_LOT_SECONDS) → utilisables à toutes les échelles, mêmes
 * formules que comptoirBuy/comptoirSellFood, qui restent la source de vérité.
 *
 * LIEU (maquette V4) : le décor du marchand en grand, puis quatre offres en
 * cartes — ce qu'on reçoit, ce qu'on donne, un bouton. Aucune phrase : le tarif
 * du marchand est expliqué dans l'Aide (Options › Aide › Le Marchandage).
 */

function Flow({ icon, amount, sign }) {
  return (
    <span className={`comptoir-flow-line ${sign > 0 ? 'is-gain' : 'is-cost'}`}>
      <PixelIcon name={icon} size={16} />
      {sign > 0 ? '+' : '−'}{fmt(amount)}
    </span>
  );
}

function TradeCard({ icon, title, give, get, action, actionLabel, gold = false, disabled }) {
  return (
    <article className="comptoir-card">
      <PixelIcon name={icon} size={48} className="comptoir-card-icon" />
      <h3>{title}</h3>
      <div className="comptoir-flow">
        <Flow {...get} sign={1} />
        <Flow {...give} sign={-1} />
      </div>
      <button type="button" className={gold ? 'btn-primary' : 'btn-secondary'} disabled={disabled} onClick={action}>
        {actionLabel}
      </button>
    </article>
  );
}

export default function ComptoirView() {
  // Re-rendu à 1 Hz via lastTick : les lots suivent la production vivante.
  useGameState(s => s.lastTick);
  const gold = useGameState(s => s.gold);
  const food = useGameState(s => s.food);

  const r = rates();
  const lotOf = (key) => D(r[key]).max(0).mul(COMPTOIR_LOT_SECONDS).max(25).round();
  const buyPrice = D(r.gold).max(0).mul(COMPTOIR_LOT_SECONDS).mul(COMPTOIR_BUY_MARKUP).max(40).round();
  const sellGain = D(r.gold).max(0).mul(COMPTOIR_LOT_SECONDS).mul(COMPTOIR_SELL_RATE).max(10).round();
  const sellLot = lotOf("food");

  const ACHATS = [
    { key: "food", icon: "res/food", label: { fr: "Nourriture", en: "Food" } },
    { key: "knowledge", icon: "res/knowledge", label: { fr: "Savoir", en: "Knowledge" } },
    { key: "infrastructure", icon: "res/infra", label: { fr: "Infrastructure", en: "Infrastructure" } }
  ];

  return (
    <Place
      id="comptoir"
      className="comptoir is-tall-band"
      scene="/pixelart/places/comptoir.png"
      sceneAlt={tr({ fr: 'Le comptoir du marchand au crépuscule', en: "The merchant's counter at dusk" })}
      focus={[45, 45]}
      eyebrow={tr({ fr: 'Marchandage', en: 'Trading' })}
      title={tr({ fr: 'Le Comptoir', en: 'The Trading Post' })}
      bodyClassName="comptoir-body"
      keys={<>
        <PlaceKey
          label={tr({ fr: 'Trésor', en: 'Treasury' })}
          value={fmt(gold)}
          valueClassName="is-gold"
          sub={`+${fmt(r.gold)} /s`}
        />
        <PlaceKey
          label={tr({ fr: 'Nourriture', en: 'Food' })}
          value={fmt(food)}
          valueClassName="is-food"
          sub={`+${fmt(r.food)} /s`}
        />
      </>}
    >
      <div className="comptoir-cards">
        {ACHATS.map((res) => (
          <TradeCard
            key={res.key}
            icon={res.icon}
            title={tr(res.label)}
            get={{ icon: res.icon, amount: lotOf(res.key) }}
            give={{ icon: 'res/gold', amount: buyPrice }}
            gold
            // Comparé en Decimal (BUG-111) : au-delà de 1,8e308, toNum rend
            // Infinity des deux côtés et `Infinity < Infinity` laissait le bouton
            // actif — puis comptoirBuy refusait.
            disabled={D(gold).lt(buyPrice)}
            action={() => comptoirBuy(res.key)}
            actionLabel={tr({ fr: "Acheter", en: "Buy" })}
          />
        ))}
        <TradeCard
          icon="res/food"
          title={tr({ fr: 'Surplus de nourriture', en: 'Food surplus' })}
          get={{ icon: 'res/gold', amount: sellGain }}
          give={{ icon: 'res/food', amount: sellLot }}
          disabled={D(food).lt(sellLot)}
          action={comptoirSellFood}
          actionLabel={tr({ fr: "Vendre", en: "Sell" })}
        />
      </div>
    </Place>
  );
}
