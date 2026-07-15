import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import { regulationContext, regulationActionUnlocked, clemencyBonus } from '../../game/core/mechanics.js';
import { GAMBLE_HISTORY_LEN, CLEMENCY_PER_LOSS, ICARUS_JACKPOT_MULT } from '../../game/core/balance.js';
import { REGULATION_ACTIONS } from '../../game/data/regulationActions.js';
import { openAuguryTable } from '../../game/core/auguryTable.js';
import { openIcarusFlight } from '../../game/core/icarusDialog.js';
import { openScratch } from '../../game/core/scratchTicket.js';
import { openBlackjack } from '../../game/core/blackjackTable.js';
import { icarusPotFaveur, icarusUnlocked, scratchUnlocked, blackjackUnlocked, auguryBaseOdds } from '../../game/core/actions.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';

/**
 * La Table des augures (onglet Régulation — pilier 4 de la Chancellerie) :
 * mémoire des paris ET porte du MINI-JEU. Les 5 derniers jets de chaque table
 * en pastilles, la « Clémence » (chaque revers consécutif adoucit le prochain
 * jet, remise à zéro au gain), et le bouton « Jeter » qui ouvre la scène. Les
 * paris paient de la FAVEUR (jeux découplés) — cf. AuguryStage.
 */

export default function AuguresPanel() {
  useGameState((s) => s.instability);
  useGameState((s) => Object.entries(s.gambleHistory || {}).map(([k, v]) => k + (v || []).join('')).join('|'));
  const faveur = useGameState((s) => s.faveur || 0);

  const ctx = regulationContext();
  const gambles = REGULATION_ACTIONS.filter((a) => a.kind === 'gamble');
  const icarusOpen = icarusUnlocked(ctx);
  const scratchOpen = scratchUnlocked(ctx);
  const blackjackOpen = blackjackUnlocked(ctx);
  const potFaveur = (icarusOpen || scratchOpen || blackjackOpen) ? icarusPotFaveur() : null;

  return (
    <section className="regul-block augures-block">
      <h3
        className="regul-block-title"
        {...tipProps(
          tr({ fr: 'La Table des augures', en: 'The Augurs’ Table' }),
          tr({
            fr: 'Les osselets gardent mémoire : chaque revers rend les dieux plus cléments au prochain jet, un gain remet le compteur à zéro. Le gain est de la Faveur.',
            en: 'The knucklebones keep memory: each setback makes the gods more lenient on the next roll, a win resets the counter. Winnings are Favor.'
          })
        )}
      >
        {tr({ fr: 'La Table des augures', en: 'The Augurs’ Table' })}
        <span
          className="faveur-count"
          {...tipProps(
            tr({ fr: 'Faveur', en: 'Favor' }),
            tr({ fr: 'La monnaie des jeux du temple, gagnée aux osselets et au Vol d’Icare, dépensée à la Boutique en bénédictions et boosters permanents.', en: 'The temple games currency, won at the knucklebones and the Flight of Icarus, spent at the Shop on blessings and permanent boosters.' })
          )}
        >✦ {fmt(faveur)}</span>
      </h3>
      {icarusOpen ? (
        <button
          type="button"
          className="icarus-banner"
          {...tipProps(
            tr({ fr: "Le Vol d'Icare", en: 'The Flight of Icarus' }),
            tr({ fr: `Le crash game du temple : le multiplicateur grimpe, le soleil frappe où il veut. Pose-toi avant — et à ×${ICARUS_JACKPOT_MULT}+, rafle la cagnotte.`, en: `The temple's crash game: the multiplier climbs, the sun strikes where it wills. Land first — and at ×${ICARUS_JACKPOT_MULT}+, sweep the pot.` })
          )}
          onClick={() => openIcarusFlight()}
        >
          <span className="icarus-banner-title">🪽 {tr({ fr: "Le Vol d'Icare", en: 'The Flight of Icarus' })}</span>
          <span className="icarus-banner-pot">
            🏺 {fmt(potFaveur)} {tr({ fr: 'faveur en cagnotte', en: 'favor in the pot' })}
            {(state.icarusFreeFlights || 0) > 0 && (
              <span className="icarus-banner-free" title={tr({ fr: 'Vols offerts par les Coups de Vénus (mise Plume payée par le temple).', en: 'Flights offered by Venus throws (Feather stake paid by the temple).' })}>
                {' '}· {state.icarusFreeFlights} {tr({ fr: 'vol(s) offert(s)', en: 'free flight(s)' })}
              </span>
            )}
          </span>
          <span className="icarus-banner-cta">{tr({ fr: 'Voler', en: 'Fly' })}</span>
        </button>
      ) : (
        <div className="augures-row augures-row--locked">
          <span className="augures-name">🔒 {tr({ fr: "Le Vol d'Icare", en: 'The Flight of Icarus' })}</span>
          <span className="augures-base">{tr({ fr: 'Ère III', en: 'Era III' })}</span>
        </div>
      )}
      {scratchOpen ? (
        <button
          type="button"
          className="scratch-banner"
          {...tipProps(
            tr({ fr: 'Tickets à gratter', en: 'Scratch tickets' }),
            tr({ fr: 'Gratte le vernis : aligne 3 symboles pour gagner de la Faveur. Trois Soleils raflent la cagnotte du temple, trois Vénus offrent un vol d’Icare.', en: 'Scratch the varnish: line up 3 symbols to win Favor. Three Suns sweep the temple pot, three Venus grant an Icarus flight.' })
          )}
          onClick={() => openScratch()}
        >
          <span className="icarus-banner-title">🎟️ {tr({ fr: 'Tickets à gratter', en: 'Scratch tickets' })}</span>
          <span className="icarus-banner-pot">🏺 {fmt(potFaveur)} {tr({ fr: 'faveur en cagnotte', en: 'favor in the pot' })}</span>
          <span className="icarus-banner-cta">{tr({ fr: 'Gratter', en: 'Scratch' })}</span>
        </button>
      ) : (
        <div className="augures-row augures-row--locked">
          <span className="augures-name">🔒 {tr({ fr: 'Tickets à gratter', en: 'Scratch tickets' })}</span>
          <span className="augures-base">{tr({ fr: 'Ère II', en: 'Era II' })}</span>
        </div>
      )}
      {blackjackOpen ? (
        <button
          type="button"
          className="scratch-banner"
          {...tipProps(
            tr({ fr: 'Vingt-et-un', en: 'Twenty-one' }),
            tr({ fr: 'Le blackjack du temple : approche 21 sans dépasser, bats l’oracle. Un « vingt-et-un » paie 3:2. Le gain est de la Faveur ; une main perdue épaissit la cagnotte.', en: 'The temple blackjack: get close to 21 without busting, beat the oracle. A natural pays 3:2. Winnings are Favor; a lost hand thickens the pot.' })
          )}
          onClick={() => openBlackjack()}
        >
          <span className="icarus-banner-title">🃏 {tr({ fr: 'Vingt-et-un', en: 'Twenty-one' })}</span>
          <span className="icarus-banner-pot">🏺 {fmt(potFaveur)} {tr({ fr: 'faveur en cagnotte', en: 'favor in the pot' })}</span>
          <span className="icarus-banner-cta">{tr({ fr: 'Jouer', en: 'Play' })}</span>
        </button>
      ) : (
        <div className="augures-row augures-row--locked">
          <span className="augures-name">🔒 {tr({ fr: 'Vingt-et-un', en: 'Twenty-one' })}</span>
          <span className="augures-base">{tr({ fr: 'Ère III', en: 'Era III' })}</span>
        </div>
      )}
      <div className="augures-list">
        {gambles.map((a) => {
          const unlocked = regulationActionUnlocked(a.id, ctx);
          const rolls = (state.gambleHistory || {})[a.id] || [];
          const baseOdds = auguryBaseOdds(a);
          const clem = clemencyBonus(a.id, baseOdds);
          const clemPct = Math.round(clem * 100);
          const basePct = Math.round(baseOdds * 100);
          const pips = Array.from({ length: GAMBLE_HISTORY_LEN }, (_, i) => {
            const idx = rolls.length - GAMBLE_HISTORY_LEN + i;
            return idx >= 0 ? rolls[idx] : null;
          });
          if (!unlocked) {
            return (
              <div
                key={a.id}
                className="augures-row augures-row--locked"
                {...tipProps(tr(a.label), `${tr({ fr: 'Se débloque', en: 'Unlocks' })} : ${tr(a.unlockLabel)}`)}
              >
                <span className="augures-name">🔒 {tr(a.label)}</span>
                <span className="augures-base">{tr(a.unlockLabel)}</span>
              </div>
            );
          }
          return (
            <div key={a.id} className="augures-row"
              {...tipProps(
                tr(a.label),
                tr({
                  fr: `Chance de base ${basePct} %. Chaque revers consécutif ajoute ${Math.round(CLEMENCY_PER_LOSS * 100)} pts de chance au prochain jet (Clémence, le Chien compte double), remise à zéro au gain. Le gain est de la Faveur.`,
                  en: `Base chance ${basePct}%. Each consecutive setback adds ${Math.round(CLEMENCY_PER_LOSS * 100)} pts of chance to the next roll (Clemency, the Dog counts double), reset on a win. Winnings are Favor.`
                })
              )}
            >
              <span className="augures-name">🎲 {tr(a.label)}</span>
              <span className="augures-pips" aria-label={tr({ fr: 'Derniers jets', en: 'Latest rolls' })}>
                {pips.map((v, i) => (
                  <i key={i} className={`augures-pip${v === 1 ? ' is-win' : v === 2 ? ' is-dog' : v === 0 ? ' is-loss' : ''}`}
                    title={v === 2 ? tr({ fr: 'Le Chien', en: 'The Dog' }) : undefined}></i>
                ))}
              </span>
              {clemPct > 0
                ? <span className="augures-favor">{tr({ fr: 'clémence', en: 'clemency' })} +{clemPct} %</span>
                : <span className="augures-base">{basePct} % {tr({ fr: 'de base', en: 'base' })}</span>}
              <button
                type="button"
                className="augures-throw"
                title={tr({ fr: 'Ouvrir la table : choisir son rite, jeter les osselets — et peut-être défier les dieux.', en: 'Open the table: choose your rite, cast the knucklebones — and maybe defy the gods.' })}
                onClick={() => openAuguryTable(a.id)}
              >
                {tr({ fr: 'Jeter', en: 'Cast' })}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
