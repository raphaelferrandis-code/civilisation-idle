import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import { faveurShopItems, buyFaveurItem, icarusEffectiveEdge } from '../../game/core/actions.js';
import {
  DICE_BOOST_STEP, WING_STEP, ICARUS_EDGE, BLESSING_MULT, BLESSING_DURATION_S
} from '../../game/core/balance.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';

/**
 * La Boutique de Faveur (couche 2, branchée 2026-07-14) — sous les Annales.
 * On y dépense la FAVEUR gagnée aux jeux :
 *   • Dés pipés    : boost PERMANENT des chances aux osselets (+2 pts/niveau) ;
 *   • Ailes cirées : abaisse PERMANENT l'edge du Vol d'Icare ;
 *   • Bénédiction  : bonus TEMPORAIRE de production (+50 % pendant 3 min).
 * Les deux boosters permanents justifient les odds volontairement bas en early
 * game : on remonte ses chances en investissant.
 */

const LABELS = {
  dice: { fr: 'Dés pipés', en: 'Loaded dice' },
  wing: { fr: 'Ailes cirées', en: 'Waxed wings' },
  blessing: { fr: 'Bénédiction', en: 'Blessing' }
};
const ICONS = { dice: '🎲', wing: '🪽', blessing: '🌾' };
const DESCS = {
  dice: { fr: 'Boost PERMANENT des chances aux osselets (+2 pts par niveau). Coût croissant.', en: 'PERMANENT boost to the knucklebones odds (+2 pts per level). Rising cost.' },
  wing: { fr: "Abaisse PERMANENT l'edge du Vol d'Icare — la cire tient plus longtemps.", en: 'PERMANENTLY lowers the Flight of Icarus edge — the wax holds longer.' },
  blessing: { fr: `Bonus TEMPORAIRE de production (+${Math.round((BLESSING_MULT - 1) * 100)} % pendant ${Math.round(BLESSING_DURATION_S / 60)} min). Re-jouable, cumulable en durée.`, en: `TEMPORARY production bonus (+${Math.round((BLESSING_MULT - 1) * 100)}% for ${Math.round(BLESSING_DURATION_S / 60)} min). Repeatable, duration stacks.` }
};

function effectLine(item) {
  if (item.kind === 'dice') {
    const cur = Math.round(item.level * DICE_BOOST_STEP * 100);
    return item.maxed
      ? tr({ fr: `+${cur} pts · au max`, en: `+${cur} pts · maxed` })
      : tr({ fr: `+${cur} pts → +${cur + Math.round(DICE_BOOST_STEP * 100)} pts de chance`, en: `+${cur} pts → +${cur + Math.round(DICE_BOOST_STEP * 100)} pts chance` });
  }
  if (item.kind === 'wing') {
    const edgeNow = Math.round(icarusEffectiveEdge() * 100);
    const edgeNext = Math.max(4, Math.round((icarusEffectiveEdge() - WING_STEP) * 100));
    return item.maxed
      ? tr({ fr: `edge ${edgeNow} % · au max`, en: `edge ${edgeNow}% · maxed` })
      : tr({ fr: `edge ${edgeNow} % → ${edgeNext} %`, en: `edge ${edgeNow}% → ${edgeNext}%` });
  }
  // blessing
  if (item.active) {
    const secs = Math.max(0, Math.ceil((item.endsAt - Date.now()) / 1000));
    const mm = Math.floor(secs / 60); const ss = String(secs % 60).padStart(2, '0');
    return tr({ fr: `active · +${Math.round((BLESSING_MULT - 1) * 100)} % (${mm}:${ss})`, en: `active · +${Math.round((BLESSING_MULT - 1) * 100)}% (${mm}:${ss})` });
  }
  return tr({ fr: `+${Math.round((BLESSING_MULT - 1) * 100)} % prod · ${Math.round(BLESSING_DURATION_S / 60)} min`, en: `+${Math.round((BLESSING_MULT - 1) * 100)}% prod · ${Math.round(BLESSING_DURATION_S / 60)} min` });
}

export default function FaveurShop() {
  const faveur = useGameState((s) => s.faveur || 0);
  // Re-render 1 Hz (compte à rebours de bénédiction, niveaux, prix).
  useGameState((s) => `${s.diceLevel || 0}:${s.wingLevel || 0}:${s.blessingUntil || 0}:${Math.floor((s.instability || 0) * 1000)}`);

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
        <span className="faveur-count">✦ {fmt(faveur)}</span>
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
