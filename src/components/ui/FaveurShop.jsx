import { useGameState } from '../../hooks/useGameState.js';
import { faveurShopItems, buyFaveurItem } from '../../game/core/actions.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';
import { LABELS, ICONS, DESCS, effectLine } from './faveurShopMeta.js';

/**
 * La Boutique de Faveur (couche 2, branchée 2026-07-14). Les métadonnées
 * (libellés, icônes, descriptions, ligne d'effet) vivent dans faveurShopMeta.js
 * — partagées avec la Boutique immersive (HeritageView), qui présente ces mêmes
 * items en pastilles cliquables sur les étagères. Ce composant reste disponible
 * comme panneau-liste autonome (non monté par défaut depuis 2026-07-15).
 */
export default function FaveurShop() {
  // Re-render 1 Hz (Faveur, compte à rebours de bénédiction, niveaux, prix).
  useGameState((s) => `${s.faveur || 0}:${s.diceLevel || 0}:${s.wingLevel || 0}:${s.blessingUntil || 0}:${Math.floor((s.instability || 0) * 1000)}`);

  const items = faveurShopItems();

  return (
    <section className="regul-block faveur-shop">
      <h3
        className="regul-block-title"
        {...tipProps(
          tr({ fr: 'Boutique de Faveur', en: 'Favor Shop' }),
          tr({ fr: 'Dépense ta Faveur : boosters permanents (dés, ailes) et bénédictions temporaires.', en: 'Spend your Favor: permanent boosters (dice, wings) and temporary blessings.' })
        )}
      >
        {tr({ fr: 'Boutique de Faveur', en: 'Favor Shop' })}
      </h3>
      <div className="faveur-shop-list">
        {items.map((it) => (
          <div key={it.id} className={`faveur-shop-item${it.active ? ' is-active' : ''}`} {...tipProps(tr(LABELS[it.kind]), tr(DESCS[it.kind]))}>
            <span className="faveur-shop-icon" aria-hidden="true">{ICONS[it.kind]}</span>
            <span className="faveur-shop-main">
              <span className="faveur-shop-name">
                {tr(LABELS[it.kind])}
                {it.kind !== 'blessing' && <span className="faveur-shop-lvl"> · {it.level}/{it.maxLevel}</span>}
              </span>
              <span className="faveur-shop-fx">{effectLine(it)}</span>
            </span>
            {it.maxed ? (
              <span className="faveur-shop-maxed">{tr({ fr: 'max', en: 'max' })}</span>
            ) : (
              <button
                type="button"
                className="faveur-shop-buy"
                disabled={!it.canAfford}
                onClick={() => buyFaveurItem(it.id)}
              >
                ✦ {fmt(it.cost)}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
