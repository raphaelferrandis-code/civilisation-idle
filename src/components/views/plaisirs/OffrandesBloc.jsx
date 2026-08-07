import { useGameState } from '../../../hooks/useGameState.js';
import { TRUNK_CAP, TRUNK_RATE_PER_S } from '../../../game/core/balance.js';
import { trunkValue, collectTrunk } from '../../../game/core/actions.js';
import { fmt } from '../../../game/core/utils.js';
import { tr } from '../../../game/core/i18n.js';
import { tipProps } from '../../ui/HelpBubble.jsx';
import { FaveurIcon } from '../../ui/FaveurIcon.jsx';

/**
 * La bourse de la Maison des Plaisirs : la Faveur qu'on mise, et le tronc
 * d'offrandes qui la remplit.
 *
 * EXTRAIT d'AuguresPanel, et volontairement RÉDUIT à ces deux lignes. Le panneau
 * complet portait aussi ses quatre boutons de partie : posé dans le hub, il
 * refaisait à l'identique ce que font déjà le menu et l'illustration — deux
 * interfaces concurrentes pour la même action, sur le même écran. Pire, il
 * occupait la colonne de droite et empêchait l'illustration de s'étendre.
 *
 * On ne garde donc QUE la monnaie. Les parties se lancent par les lieux.
 */
export default function OffrandesBloc() {
  const faveur = useGameState((s) => s.faveur || 0);
  // trunkValue() se recalcule à chaque rendu, comme dans AuguresPanel : la
  // valeur DÉRIVE du temps écoulé, s'abonner à un champ d'état ne la
  // rafraîchirait pas.
  const trunk = trunkValue();
  const gain = Math.floor(trunk);

  return (
    <div className="plaisirs-bourse">
      <div
        className="plaisirs-bourse-faveur"
        {...tipProps(
          tr({ fr: 'Faveur', en: 'Favor' }),
          tr({
            fr: 'La monnaie des jeux. Versée par les Offrandes, misée aux tables, dépensée à l’échoppe.',
            en: 'The games currency. Fed by the Offerings, staked at the tables, spent at the shop.'
          })
        )}
      >
        <FaveurIcon /> {fmt(faveur)}
      </div>
      <div
        className="plaisirs-bourse-tronc"
        {...tipProps(
          tr({ fr: 'Les Offrandes', en: 'The Offerings' }),
          tr({
            fr: `Les habitants déposent leurs oboles : +${Math.round(TRUNK_RATE_PER_S * 60)} Faveur par minute. Un tronc plein ne collecte plus, relève-le pour encaisser.`,
            en: `The townsfolk drop their obols: +${Math.round(TRUNK_RATE_PER_S * 60)} Favor per minute. A full trunk stops collecting, empty it to cash in.`
          })
        )}
      >
        <span className="plaisirs-jauge" aria-hidden="true">
          <i style={{ width: `${Math.round((trunk / TRUNK_CAP) * 100)}%` }} />
        </span>
        <span className="plaisirs-bourse-chiffre">{gain} / {TRUNK_CAP}</span>
      </div>
      <button
        type="button"
        className="plaisirs-relever"
        disabled={gain < 1}
        onClick={() => collectTrunk()}
      >
        {tr({ fr: 'Relever', en: 'Collect' })}{gain >= 1 ? ` +${gain}` : ''}
      </button>
    </div>
  );
}
