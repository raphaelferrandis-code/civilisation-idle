import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import { regulationContext, regulationActionUnlocked } from '../../game/core/mechanics.js';
import { GAMBLE_HISTORY_LEN, ICARUS_JACKPOT_MULT, TRUNK_CAP, TRUNK_RATE_PER_S } from '../../game/core/balance.js';
import { REGULATION_ACTIONS } from '../../game/data/regulationActions.js';
import { openAuguryTable } from '../../game/core/auguryTable.js';
import { openIcarusFlight } from '../../game/core/icarusDialog.js';
import { openScratch } from '../../game/core/scratchTicket.js';
import { openBlackjack } from '../../game/core/blackjackTable.js';
import { icarusUnlocked, scratchUnlocked, blackjackUnlocked, auguryBaseOdds, auguryRebate, trunkValue, collectTrunk, setTempleAuto } from '../../game/core/actions.js';
import { freeFlightCount } from '../../game/core/actions/templeFlights.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';
import { FaveurIcon } from './FaveurIcon.jsx';

/**
 * La Table des augures (onglet Régulation — pilier 4 de la Chancellerie) :
 * les OFFRANDES (la source de Faveur — jauge + relève ; l'ACHAT de
 * l'auto-relève vit à l'échoppe, le toggle reste ici), la mémoire des paris ET
 * la porte du MINI-JEU. Les 5 derniers jets de chaque table en pastilles, la
 * « Clémence » (chaque revers consécutif ALLÈGE la prochaine offrande, remise
 * à zéro au gain), et le bouton « Jeter » qui ouvre la scène. Les jeux se
 * MISENT et se paient en FAVEUR (monnaie fermée 2026-07-16) — cf.
 * AuguryStage / actions/augures.js.
 */

export default function AuguresPanel() {
  useGameState((s) => s.instability);
  useGameState((s) => Object.entries(s.gambleHistory || {}).map(([k, v]) => k + (v || []).join('')).join('|'));
  const faveur = useGameState((s) => s.faveur || 0);

  const ctx = regulationContext();
  const gambles = REGULATION_ACTIONS.filter((a) => a.kind === 'gamble');
  const tableOpen = gambles.some((a) => regulationActionUnlocked(a.id, ctx));
  const icarusOpen = icarusUnlocked(ctx);
  const scratchOpen = scratchUnlocked(ctx);
  const blackjackOpen = blackjackUnlocked(ctx);
  const freeFlights = freeFlightCount();
  const trunk = trunkValue();
  const trunkGain = Math.floor(trunk);
  const trunkAuto = state.templeAuto?.tronc || {};

  return (
    <section className="regul-block augures-block">
      <h3
        className="regul-block-title"
        {...tipProps(
          tr({ fr: 'La Table des augures', en: 'The Augurs’ Table' }),
          tr({
            fr: 'Les jeux du temple se misent en Faveur, versée par les Offrandes. Aux osselets, chaque perte réduit la mise suivante grâce à la Clémence. Un gain remet le compteur à zéro.',
            en: 'The temple games are staked in Favor, fed by the Offerings. At the knucklebones, each loss lowers the next stake through Clemency. A win resets the counter.'
          })
        )}
      >
        {tr({ fr: 'La Table des augures', en: 'The Augurs’ Table' })}
        <span
          className="faveur-count"
          {...tipProps(
            tr({ fr: 'Faveur', en: 'Favor' }),
            tr({ fr: 'La monnaie des jeux du temple. Versée par les Offrandes, misée aux tables, dépensée à la Boutique.', en: 'The temple games currency. Fed by the Offerings, staked at the tables, spent at the Shop.' })
          )}
        ><FaveurIcon /> {fmt(faveur)}</span>
      </h3>
      {tableOpen ? (
        <div
          className="augures-row augures-trunk"
          {...tipProps(
            tr({ fr: 'Les Offrandes', en: 'The Offerings' }),
            tr({
              // Le plafond se lit déjà sur la jauge (30 / 60) : ne pas le répéter ici.
              fr: `Les habitants déposent leurs oboles : +${Math.round(TRUNK_RATE_PER_S * 60)} Faveur par minute. Un tronc plein ne collecte plus, relève-le pour encaisser.`,
              en: `The townsfolk drop their obols: +${Math.round(TRUNK_RATE_PER_S * 60)} Favor per minute. A full trunk stops collecting, empty it to cash in.`
            })
          )}
        >
          <span className="augures-name">🏺 {tr({ fr: 'Offrandes', en: 'Offerings' })}</span>
          <span className="augures-trunk-gauge" aria-hidden="true">
            <i style={{ width: `${Math.round((trunk / TRUNK_CAP) * 100)}%` }} />
          </span>
          <span className="augures-base">{trunkGain} / {TRUNK_CAP}</span>
          {trunkAuto.unlocked && (
            <button
              type="button"
              className={`augures-trunk-auto${trunkAuto.on ? ' is-on' : ''}`}
              {...tipProps(null, () => {
                // Contenu VIVANT : le clic bascule l'auto sous le curseur, bulle
                // ouverte. Un texte figé à l'ouverture annoncerait l'état inverse,
                // donc l'état est relu à chaque rafraîchissement.
                const on = Boolean(state.templeAuto?.tronc?.on);
                return tr({
                  fr: on ? 'Auto-relève active : les offrandes sont encaissées avant de déborder. Cliquer pour suspendre.' : 'Auto-relève suspendue. Cliquer pour la réactiver.',
                  en: on ? 'Auto-collect active: the offerings are cashed before they overflow. Click to pause.' : 'Auto-collect paused. Click to resume.'
                });
              })}
              onClick={() => setTempleAuto('tronc', { on: !trunkAuto.on })}
            >
              ⚙️ {trunkAuto.on ? tr({ fr: 'auto', en: 'auto' }) : tr({ fr: 'auto ⏸', en: 'auto ⏸' })}
            </button>
          )}
          <button
            type="button"
            className="augures-throw"
            disabled={trunkGain < 1}
            onClick={() => collectTrunk()}
          >
            {tr({ fr: 'Relever', en: 'Collect' })}{trunkGain >= 1 ? ` +${trunkGain}` : ''}
          </button>
        </div>
      ) : (
        <div className="augures-row augures-row--locked">
          <span className="augures-name">🔒 {tr({ fr: 'Offrandes', en: 'Offerings' })}</span>
          <span className="augures-base">{tr({ fr: 'Ère II', en: 'Era II' })}</span>
        </div>
      )}
      {/* Ordre des bandeaux = ordre de DÉBLOCAGE (osselets II, tickets II, vingt-et-un
          III, Icare III). Avant, Icare et le vingt-et-un (Ère III) trônaient AU-DESSUS
          des deux seules tables qu'un joueur d'Ère II peut ouvrir : il voyait d'abord
          deux cadenas. Les gardes vivent dans scratchOpen/icarusOpen/blackjackOpen,
          jamais dans l'ordre d'affichage — déplacer le JSX ne déplace aucun déblocage. */}
      <div className="augures-list">
        {gambles.map((a) => {
          const unlocked = regulationActionUnlocked(a.id, ctx);
          const rolls = (state.gambleHistory || {})[a.id] || [];
          const baseOdds = auguryBaseOdds(a);
          const rebatePct = Math.round(auguryRebate(a.id) * 100);
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
          // Tout le bandeau ouvre la table (comme les autres jeux) : le « Jeter »
          // n'est plus qu'un CTA visuel, assorti à Voler/Gratter/Jouer.
          return (
            <button key={a.id} type="button" className="augures-row augure-fresque fresque-osselets"
              {...tipProps(
                tr(a.label),
                tr({
                  fr: `Chance de ${basePct} %, mise en Faveur. Chaque revers descend l'offrande d'un cran grâce à la Clémence (le Chien compte double), jusqu'à la moitié. Un gain remet la mise pleine.`,
                  en: `${basePct}% chance, staked in Favor. Each setback lowers the offering one step through Clemency (the Dog counts double), down to half. A win restores the full stake.`
                })
              )}
              onClick={() => openAuguryTable(a.id)}
            >
              <span className="augures-name">{tr(a.label)}</span>
              <span className="augures-pips" aria-label={tr({ fr: 'Derniers jets', en: 'Latest rolls' })}>
                {pips.map((v, i) => (
                  <i key={i} className={`augures-pip${v === 1 ? ' is-win' : v === 2 ? ' is-dog' : v === 0 ? ' is-loss' : ''}`}
                    {...tipProps(null, v === 2 ? tr({ fr: 'Le Chien', en: 'The Dog' }) : undefined)}></i>
                ))}
              </span>
              {rebatePct > 0
                ? <span className="augures-favor">{tr({ fr: 'offrande', en: 'offering' })} −{rebatePct} %</span>
                : <span className="augures-base">{basePct} % {tr({ fr: 'de base', en: 'base' })}</span>}
              <span className="icarus-banner-cta">{tr({ fr: 'Jeter', en: 'Cast' })}</span>
            </button>
          );
        })}
      </div>
      {scratchOpen ? (
        <button
          type="button"
          className="scratch-banner augure-fresque fresque-tickets"
          {...tipProps(
            tr({ fr: 'Tickets à gratter', en: 'Scratch tickets' }),
            tr({ fr: 'Gratte le vernis : découvre 3 symboles identiques pour gagner de la Faveur. Trois Soleils raflent la cagnotte du temple, trois Vénus offrent un vol d’Icare.', en: 'Scratch the varnish: reveal 3 matching symbols to win Favor. Three Suns sweep the temple pot, three Venus grant an Icarus flight.' })
          )}
          onClick={() => openScratch()}
        >
          <span className="icarus-banner-title">{tr({ fr: 'Tickets à gratter', en: 'Scratch tickets' })}</span>
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
          className="scratch-banner augure-fresque fresque-vingtetun"
          {...tipProps(
            tr({ fr: 'Vingt-et-un', en: 'Twenty-one' }),
            tr({ fr: "Approche 21 sans dépasser pour battre l'oracle. Un vingt-et-un paie ×2,5. Une main perdue va à la cagnotte du temple.", en: 'Get close to 21 without busting to beat the oracle. A natural pays ×2.5. A lost hand goes to the temple pot.' })
          )}
          onClick={() => openBlackjack()}
        >
          <span className="icarus-banner-title">{tr({ fr: 'Vingt-et-un', en: 'Twenty-one' })}</span>
          <span className="icarus-banner-cta">{tr({ fr: 'Jouer', en: 'Play' })}</span>
        </button>
      ) : (
        <div className="augures-row augures-row--locked">
          <span className="augures-name">🔒 {tr({ fr: 'Vingt-et-un', en: 'Twenty-one' })}</span>
          <span className="augures-base">{tr({ fr: 'Ère III', en: 'Era III' })}</span>
        </div>
      )}
      {icarusOpen ? (
        <button
          type="button"
          className="icarus-banner augure-fresque fresque-icare"
          {...tipProps(
            tr({ fr: "Le Vol d'Icare", en: 'The Flight of Icarus' }),
            tr({ fr: `Le multiplicateur grimpe jusqu'au coup de soleil. Se poser avant encaisse la mise multipliée. Se poser à ×${ICARUS_JACKPOT_MULT} ou plus emporte une part de la cagnotte, au prorata de la mise.`, en: `The multiplier climbs until the sun strikes. Landing before that cashes in the multiplied stake. Landing at ×${ICARUS_JACKPOT_MULT} or more takes a share of the pot, pro rata of the stake.` })
          )}
          onClick={() => openIcarusFlight()}
        >
          <span className="icarus-banner-title">{tr({ fr: "Le Vol d'Icare", en: 'The Flight of Icarus' })}</span>
          {freeFlights > 0 && (
            <span className="icarus-banner-free" {...tipProps(null, tr({ fr: 'Vols offerts par les Coups de Vénus (mise Plume) et par les trois Soleils du gratteux (mise du ticket). Le temple paie la mise.', en: 'Flights offered by Venus throws (Feather stake) and by three Suns on a ticket (the ticket stake). The temple pays the stake.' }))}>
              {freeFlights} {tr({ fr: 'vol(s) offert(s)', en: 'free flight(s)' })}
            </span>
          )}
          <span className="icarus-banner-cta">{tr({ fr: 'Voler', en: 'Fly' })}</span>
        </button>
      ) : (
        <div className="augures-row augures-row--locked">
          <span className="augures-name">🔒 {tr({ fr: "Le Vol d'Icare", en: 'The Flight of Icarus' })}</span>
          <span className="augures-base">{tr({ fr: 'Ère III', en: 'Era III' })}</span>
        </div>
      )}
    </section>
  );
}
