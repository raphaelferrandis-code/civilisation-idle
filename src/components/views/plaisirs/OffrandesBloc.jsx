import { useGameState } from '../../../hooks/useGameState.js';
import { trunkValue, trunkCap, collectTrunk, icarusPotFaveur, recettesPerHour } from '../../../game/core/actions.js';
import { freeFlightCount } from '../../../game/core/actions/templeFlights.js';
import { hasTempleArtifact } from '../../../game/core/actions/templeArtifacts.js';
import { state } from '../../../game/core/state.js';
import { fmt } from '../../../game/core/utils.js';
import { tr } from '../../../game/core/i18n.js';
import { tipProps } from '../../ui/HelpBubble.jsx';
import { FaveurIcon, PotIcon } from '../../ui/FaveurIcon.jsx';
import RangMaison from './RangMaison.jsx';

/**
 * La bourse de la Maison des Plaisirs, en tête du menu : la Faveur qu'on mise,
 * la cagnotte de la Maison, et le tronc d'offrandes qui remplit la Faveur.
 *
 * EXTRAITE d'AuguresPanel, et volontairement RÉDUITE à la monnaie : le panneau
 * complet portait aussi ses quatre boutons de partie, doublons du menu.
 *
 * Depuis le « tableau d'étages » (2026-10-03), elle reprend aussi ce que portait
 * l'en-tête du pupitre du temple, retiré : la cagnotte, les vols offerts, la
 * série de l'oracle — des réserves de la Maison, pas des réglages d'un jeu.
 */
export default function OffrandesBloc() {
  const faveur = useGameState((s) => s.faveur || 0);
  useGameState((s) => s.instability); // cagnotte, vols, tronc (1 Hz)
  // trunkValue() se recalcule à chaque rendu : la valeur DÉRIVE du temps écoulé,
  // s'abonner à un champ d'état ne la rafraîchirait pas.
  const trunk = trunkValue();
  const cap = trunkCap();
  const gain = Math.floor(trunk);
  // Les RECETTES de la Maison (lot 1 des gains « vrai casino ») : elles suivent l'ère
  // record de la ville, le plafond de la caisse aussi (30 min de recettes).
  const perMin = recettesPerHour() / 60;
  const pot = icarusPotFaveur();
  const flights = freeFlightCount();
  const streak = state.blackjackStreak || 0;

  return (
    <div className="plaisirs-bourse">
      <div className="pm-purse-top">
        <span
          className="pm-faveur"
          {...tipProps(
            tr({ fr: 'Faveur', en: 'Favor' }),
            tr({
              fr: 'La monnaie des jeux. Versée par les Offrandes, misée aux tables, dépensée à l’échoppe.',
              en: 'The games currency. Fed by the Offerings, staked at the tables, spent at the shop.'
            })
          )}
        >
          <FaveurIcon /> {fmt(faveur)}
        </span>
        <span className="pm-reserves">
          <span {...tipProps(
            tr({ fr: 'La cagnotte de la Maison', en: 'The House pot' }),
            tr({ fr: 'Nourrie par l’avantage des tables, raflée au Vol d’Icare (×10 et plus, au prorata de la mise).', en: 'Fed by the tables’ edge, swept at the Flight of Icarus (×10 and above, pro rata of the stake).' })
          )}><PotIcon /> {fmt(pot)}</span>
          {flights > 0 && (
            <span {...tipProps(
              tr({ fr: 'Vols offerts', en: 'Free flights' }),
              tr({ fr: 'Offerts par les Coups de Vénus, la roue de la machine et les trois Vénus des tickets. La Maison paie la mise du coup qui les a gagnés.', en: 'Granted by Venus throws, the machine’s wheel and three Venus on a ticket. The House pays the stake of the play that won them.' })
            )}>🪽 {flights}</span>
          )}
          {hasTempleArtifact('voix') && streak >= 2 && (
            <span className="pm-streak" {...tipProps(
              tr({ fr: 'La série de l’oracle', en: 'The oracle’s streak' }),
              tr({ fr: 'Mains gagnées d’affilée au vingt-et-un, à la main. L’auto n’y touche pas.', en: 'Hands won in a row at twenty-one, by hand. The automation never touches it.' })
            )}>🃏 {streak}</span>
          )}
        </span>
      </div>
      {/* Le titre à la Maison (lot 2) : le rang, et le chemin vers le suivant. */}
      <RangMaison />
      <div
        className="pm-trunk"
        {...tipProps(
          tr({ fr: 'Les recettes de la Maison', en: 'The House takings' }),
          tr({
            fr: `Les habitants jouent, la Maison verse sa part à la cité : +${fmt(perMin)} Faveur par minute, plus à mesure que la ville grandit. Une caisse pleine ne collecte plus, relève-la pour encaisser.`,
            en: `The townsfolk gamble, the House pays its share to the city: +${fmt(perMin)} Favor per minute, more as the city grows. A full till stops collecting, empty it to cash in.`
          })
        )}
      >
        <span className="pm-gauge" aria-hidden="true">
          <i style={{ width: `${Math.round((trunk / Math.max(1, cap)) * 100)}%` }} />
        </span>
        <span className="pm-trunk-num">{fmt(gain)}/{fmt(cap)}</span>
      </div>
      {/* OR quand le tronc a de quoi : c'est un clic qui rapporte MAINTENANT
          (chrome-wizard : l'or est réservé à ce qui appelle un clic). */}
      <button
        type="button"
        className="pm-collect"
        disabled={gain < 1}
        onClick={() => collectTrunk()}
      >
        {tr({ fr: 'Relever', en: 'Collect' })}{gain >= 1 ? ` +${fmt(gain)}` : ''}
      </button>
    </div>
  );
}
