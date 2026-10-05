import { useGameState } from '../../../hooks/useGameState.js';
import { trunkValue, trunkCap, collectTrunk, icarusPotFaveur, recettesPerHour } from '../../../game/core/actions.js';
import { freeFlightCount } from '../../../game/core/actions/templeFlights.js';
import { hasTempleArtifact } from '../../../game/core/actions/templeArtifacts.js';
import { state, renderCache } from '../../../game/core/state.js';
import { roueReady, roueUnlocked, roueWaitMinutes } from '../../../game/core/actions/roueMaison.js';
import { openTempleGame } from '../../../game/core/templeGames.js';
import {
  nuitUnlocked, nuitActive, nuitResteMin, nuitAttenteMin, flambeurDeLaNuit,
  spectacleActif, spectaclePret, spectacleCout, spectacleResteMin, spectacleReposMin, lancerSpectacle
} from '../../../game/core/actions/nuitGrandJeu.js';
import { fmt } from '../../../game/core/utils.js';
import { tr } from '../../../game/core/i18n.js';
import { tipProps } from '../../ui/HelpBubble.jsx';
import { FaveurIcon, PotIcon } from '../../ui/FaveurIcon.jsx';
import RangMaison from './RangMaison.jsx';
import { NUIT_INTERVAL_H, NUIT_DUREE_MIN, SPECTACLE_DUREE_MIN } from '../../../game/core/balance.js';
import '../../../styles/plaisirs-nuit.css';

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
export default function OffrandesBloc({ onRoue }) {
  const faveur = useGameState((s) => s.faveur || 0);
  // Horloge 1 Hz : le tick, pas l'instabilité (figée en crise terminale ou une
  // fois convergée — BUG-114). Cagnotte, vols, tronc.
  useGameState(() => renderCache.tickNow);
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
  // La roue de la Maison (2026-10-04) : un tour offert par heure.
  useGameState((s) => s.roueAt || 0);
  const roueOuverte = roueUnlocked();
  const rouePrete = roueReady();
  const roueAttente = roueWaitMinutes();
  // La Nuit du Grand Jeu et le spectacle (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md).
  useGameState((s) => s.nuitDebut || 0);
  useGameState((s) => s.spectacleFin || 0);
  const nuitOuverte = nuitUnlocked();
  const nuit = nuitActive();
  const nuitReste = nuitResteMin();
  const nuitAttente = nuitAttenteMin();
  const surScene = spectacleActif();
  const spectacleOk = spectaclePret();
  const coutSpectacle = spectacleCout();
  const fmtAttente = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);

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
          {/* La lune de la Nuit : allumée pendant la Nuit (les minutes qui restent),
              éteinte sinon — l'heure de la prochaine se lit dans l'infobulle. */}
          {nuitOuverte && (
            <span
              className={`pm-nuit${nuit ? ' is-nuit' : ''}`}
              {...tipProps(
                tr({ fr: 'La Nuit du Grand Jeu', en: 'The Night of High Play' }),
                nuit
                  ? tr({ fr: `Toutes les portes ouvertes, la réputation compte double, ${flambeurDeLaNuit().nom.fr} au salon privé. Encore ${nuitReste} min.`, en: `Every door open, reputation counts double, ${flambeurDeLaNuit().nom.en} in the private salon. ${nuitReste} min left.` })
                  : tr({ fr: `Toutes les ${NUIT_INTERVAL_H} heures, ${NUIT_DUREE_MIN} minutes. La prochaine dans ${fmtAttente(nuitAttente)}.`, en: `Every ${NUIT_INTERVAL_H} hours, ${NUIT_DUREE_MIN} minutes. The next one in ${fmtAttente(nuitAttente)}.` })
              )}
            >🌙{nuit ? ` ${nuitReste} min` : ''}</span>
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
      <div className="pm-actions">
        <button
          type="button"
          className="pm-collect"
          disabled={gain < 1}
          onClick={() => collectTrunk()}
        >
          {tr({ fr: 'Relever', en: 'Collect' })}{gain >= 1 ? ` +${fmt(gain)}` : ''}
        </button>
        {/* La roue : OR quand un tour attend (un clic qui rapporte), éteinte sinon ;
            l'attente se lit dans l'infobulle. */}
        {roueOuverte && (
          <button
            type="button"
            className={`pm-collect pm-roue${rouePrete ? ' is-ready' : ''}`}
            disabled={!rouePrete}
            onClick={() => (onRoue ? onRoue() : openTempleGame('roue'))}
            {...tipProps(
              tr({ fr: 'La roue de la Maison', en: 'The House wheel' }),
              rouePrete
                ? tr({ fr: 'Un tour offert.', en: 'A free spin.' })
                : tr({ fr: `Prochain tour dans ${roueAttente} min.`, en: `Next spin in ${roueAttente} min.` })
            )}
          >
            {tr({ fr: 'Roue', en: 'Wheel' })}
          </button>
        )}
        {/* Le spectacle : OR quand la troupe est prête et la bourse le paie ; sur
            scène, la lumière rouge ; au repos, éteint. Le détail dans l'infobulle. */}
        {nuitOuverte && (
          <button
            type="button"
            className={`pm-collect pm-spectacle${surScene ? ' is-live' : ''}`}
            disabled={!spectacleOk || faveur < coutSpectacle}
            onClick={() => lancerSpectacle()}
            {...tipProps(
              tr({ fr: 'Le spectacle', en: 'The show' }),
              surScene
                ? tr({ fr: `La troupe est sur scène : la salle est pleine, la caisse se remplit deux fois plus vite. Encore ${nuit ? nuitReste : spectacleResteMin()} min.`, en: `The troupe is on stage: the hall is full, the till fills twice as fast. ${nuit ? nuitReste : spectacleResteMin()} min left.` })
                : spectacleOk
                  ? tr({ fr: `${SPECTACLE_DUREE_MIN} minutes de salle pleine : la caisse se remplit deux fois plus vite. ${fmt(coutSpectacle)} Faveur.`, en: `${SPECTACLE_DUREE_MIN} minutes of full house: the till fills twice as fast. ${fmt(coutSpectacle)} Favor.` })
                  : tr({ fr: `La troupe se repose : ${spectacleReposMin()} min.`, en: `The troupe is resting: ${spectacleReposMin()} min.` })
            )}
          >
            {surScene ? '🎭' : tr({ fr: 'Spectacle', en: 'Show' })}
          </button>
        )}
      </div>
    </div>
  );
}
