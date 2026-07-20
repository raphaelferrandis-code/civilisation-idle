import { useGameState } from '../../hooks/useGameState.js';
import PixelIcon from '../ui/PixelIcon.jsx';
import { rates } from '../../game/core/mechanics.js';
import { comptoirBuy, comptoirSellFood } from '../../game/core/actions.js';
import { COMPTOIR_LOT_SECONDS, COMPTOIR_BUY_MARKUP, COMPTOIR_SELL_RATE } from '../../game/core/balance.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { D, toNum } from '../../game/core/num.js';

/**
 * « Le Comptoir » — l'onglet Marchandage, héritage du Mythe de l'Âge d'Or.
 * Échange permanent au tarif du marchand : sa MARGE est la contrepartie (le
 * Comptoir dépanne, il n'enrichit pas). Lots et prix ancrés sur la production
 * COURANTE (COMPTOIR_LOT_SECONDS) → utilisables à toutes les échelles, mêmes
 * formules que comptoirBuy/comptoirSellFood, qui restent la source de vérité.
 */
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
    <section className="view active" id="comptoir">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>{tr({ fr: "Le Comptoir", en: "The Trading Post" })}</h2>
            <p className="body-copy">{tr({
              fr: "Le marchand échange à son tarif — sa marge est le prix de la commodité.",
              en: "The merchant trades at his own rate — his margin is the price of convenience."
            })}</p>
          </div>
        </div>

        <div className="comptoir-rows">
          {ACHATS.map((res) => (
            <div className="comptoir-row" key={res.key}>
              <PixelIcon name={res.icon} className="comptoir-icon" />
              <div className="comptoir-terms">
                <strong>{tr(res.label)}</strong>
                <small>{tr({
                  fr: `${fmt(lotOf(res.key))} contre ${fmt(buyPrice)} Or`,
                  en: `${fmt(lotOf(res.key))} for ${fmt(buyPrice)} Gold`
                })}</small>
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={toNum(gold) < toNum(buyPrice)}
                onClick={() => comptoirBuy(res.key)}
              >
                {tr({ fr: "Acheter", en: "Buy" })}
              </button>
            </div>
          ))}

          <div className="comptoir-row comptoir-row--sell">
            <PixelIcon name="res/gold" className="comptoir-icon" />
            <div className="comptoir-terms">
              <strong>{tr({ fr: "Vendre du surplus", en: "Sell surplus" })}</strong>
              <small>{tr({
                fr: `${fmt(sellLot)} Nourriture contre ${fmt(sellGain)} Or`,
                en: `${fmt(sellLot)} Food for ${fmt(sellGain)} Gold`
              })}</small>
            </div>
            <button
              type="button"
              className="btn-secondary"
              disabled={toNum(food) < toNum(sellLot)}
              onClick={comptoirSellFood}
            >
              {tr({ fr: "Vendre", en: "Sell" })}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
