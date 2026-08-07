import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import {
  dealBlackjack,
  hitBlackjack,
  standBlackjack,
  blackjackHand,
  blackjackActive,
  blackjackLastOutcome,
  blackjackStakes,
  handValue
} from '../../game/core/actions.js';
import { doubleBlackjack, splitBlackjack, basicAction } from '../../game/core/actions/blackjack.js';
import { hasTempleArtifact } from '../../game/core/actions/templeArtifacts.js';
import { clampStakeMult } from '../../game/core/actions/templePot.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
import { cardSrc, cardLabel, CARD_BACK_SRC, CARD_DECK_SRC } from './cardSprites.js';
import CoffreSelect from './CoffreSelect.jsx';
import StageHelp from './StageHelp.jsx';

/**
 * Le Vingt-et-un — SCÈNE INTÉGRÉE (bas de la page Régulation, comme osselets/
 * Icare/scratch). Le moteur (actions/blackjack.js) est autoritaire : rouvrir la
 * scène pendant une main la REPREND en cours. Phases : pari (choix de la mise) →
 * jeu (tirer/rester) → résultat. Les cartes sont des sprites pixel du pack Bit
 * Digitalis (cardSprites.js) : couleurs internationales à l'écran, clés antiques
 * dans le moteur. La carte cachée du croupier reste face verso tant qu'on joue.
 * Fermer/changer de cycle
 * en pleine main abandonne la mise (déjà payée).
 */

// L'EMBLÈME DE CHAQUE MISE, en tête de sa colonne. Ici ce sont des CARTES et non
// de l'argent : les tickets voisins portent déjà l'escalade du métal (bronze,
// argent, or), et deux jeux à emblèmes de monnaie croissante auraient été des
// jumeaux dans le même hub. La table monte donc par le JEU qu'on engage — une
// carte, deux cartes, la couronne posée dessus.
//
// ⚠ Table explicite plutôt qu'un chemin déduit de `s.id` : une mise ajoutée
// demain sortirait un 404 muet. Cf. la même table dans IcarusStage.
const STAKE_ART = {
  legere: '/pixelart/ui/plaisirs/mises/vingtetun-legere.png',
  pleine: '/pixelart/ui/plaisirs/mises/vingtetun-pleine.png',
  royale: '/pixelart/ui/plaisirs/mises/vingtetun-royale.png'
};

// Libellés d'issue pour l'infobulle des pastilles d'historique (résolus par tr()).
const BJ_RESULT_LABEL = {
  blackjack: { fr: 'Vingt-et-un', en: 'Twenty-one' },
  win: { fr: 'Gagné', en: 'Win' },
  push: { fr: 'Égalité', en: 'Push' },
  lose: { fr: 'Perdu', en: 'Lose' }
};

// La Voix de l'oracle (artefact) : une réplique par issue, indexée sur la série.
// Sobre, antique, sans emphase. La série ne compte que les mains jouées à la main.
function oracleLine(result, streak) {
  if (result === 'blackjack') return { fr: 'Les dieux te devaient une carte.', en: 'The gods owed you a card.' };
  if (result === 'push') return { fr: "Rien n'a eu lieu.", en: 'Nothing has taken place.' };
  if (result === 'lose') return { fr: "L'oracle reprend son dû.", en: 'The oracle takes back its due.' };
  if (streak >= 5) return { fr: "L'oracle se souvient de ton nom.", en: 'The oracle remembers your name.' };
  if (streak >= 3) return { fr: "Trois mains. L'oracle te voit.", en: 'Three hands. The oracle sees you.' };
  if (streak >= 2) return { fr: "Encore. L'oracle te regarde.", en: 'Again. The oracle is watching you.' };
  return { fr: "L'oracle incline la tête.", en: 'The oracle bows its head.' };
}

// Le conseil de la Mesure gravée (artefact) : ce que la stratégie de base ferait.
const MEASURE_LABEL = {
  hit: { fr: 'la mesure tirerait', en: 'the measure would hit' },
  stand: { fr: 'la mesure resterait', en: 'the measure would stand' },
  double: { fr: 'la mesure doublerait', en: 'the measure would double' }
};

/* Carte à jouer : un seul sprite du pack Bit Digitalis (32×48 natif, rendu au
   double exact). Le rang et la couleur sont déjà peints dedans, il n'y a donc
   plus rien à composer — juste l'alternative textuelle pour la voix. La carte
   cachée du croupier montre le dos du même pack. */
function BjCard({ card, hidden }) {
  if (hidden) {
    return <img className="bj-card is-hidden" src={CARD_BACK_SRC} alt={tr({ fr: 'carte cachée', en: 'face-down card' })} draggable="false" />;
  }
  return <img className="bj-card" src={cardSrc(card)} alt={cardLabel(card)} draggable="false" />;
}

export default function BlackjackStage({ table, onClose }) {
  const [phase, setPhase] = useState('bet');
  // Aucune mise choisie au départ (sketch Raph 2026-07-17 : « le bouton de jeu
  // n'apparaît que quand la mise est sélectionnée ») — le bouton Distribuer reste
  // masqué tant qu'on n'a pas cliqué un choix.
  const [chosenStake, setChosenStake] = useState(null);
  // La puissance de mise du coffre (×1, ×10…), re-clampée au rendu ET au moteur.
  const [coffreMult, setCoffreMult] = useState(1);
  const [hand, setHand] = useState(null);
  const [outcome, setOutcome] = useState(null);
  useGameState((s) => s.instability); // or, cagnotte, mises vivants (1 Hz)
  const cycles = useGameState((s) => s.cycles);

  // (Ré)ouverture : reprendre une main en cours (état module), sinon repartir au pari.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronise la scène sur l'état module (blackjackActive) à la (ré)ouverture
    setOutcome(null);
    if (blackjackActive()) {
      const h = blackjackHand();
      setHand(h);
      // Main reprise : on RESTAURE la mise réelle depuis le moteur — sinon
      // « Redistribuer » retombait sur la première mise ×1 (une royale ×coffre
      // rejouée en légère). Même geste qu'IcarusStage à la reprise d'un vol.
      setChosenStake(h?.stakeId ?? null);
      setCoffreMult(h?.stakeMult ?? 1);
      setPhase('player');
    } else {
      setChosenStake(null);
      setHand(null);
      setPhase('bet');
    }
  }, [table?.openedAt]);

  // Effondrement pendant une main : la scène se referme (nouveau cycle).
  const prevCyclesRef = useRef(cycles);
  useEffect(() => {
    if (prevCyclesRef.current !== cycles) onClose();
    prevCyclesRef.current = cycles;
  }, [cycles, onClose]);

  const stakes = blackjackStakes();
  const history = (state.blackjackHistory || []).slice().reverse();
  const chosen = stakes.find((s) => s.id === chosenStake) || stakes[0];
  const effMult = clampStakeMult(coffreMult); // parité stricte avec le moteur
  const chosenCost = chosen ? chosen.faveur * effMult : 0;

  const finish = (h) => {
    setHand(h);
    if (h.resolved) { setOutcome(blackjackLastOutcome()); setPhase('done'); }
  };

  // La donne part sur la mise SÉLECTIONNÉE (chosen) : le bouton Distribuer et le
  // « Redistribuer » de résultat appellent tous onDeal() sans argument.
  const onDeal = () => {
    if (!chosen || (state.faveur || 0) < chosenCost) return;
    const h = dealBlackjack(chosen.id, { stakeMult: effMult });
    if (!h) return;
    setOutcome(null);
    setPhase('player');
    finish(h); // un naturel se résout d'emblée → passe direct au résultat
  };
  // Garde anti double-clic : « Tirer » est synchrone et le bouton reste monté
  // tant qu'on ne crève pas → un double-clic tirerait 2 cartes d'un coup.
  const hittingRef = useRef(false);
  const onHit = () => {
    if (hittingRef.current) return;
    hittingRef.current = true;
    const h = hitBlackjack();
    if (h) finish(h);
    setTimeout(() => { hittingRef.current = false; }, 150);
  };
  const onStand = () => { const h = standBlackjack(); if (h) finish(h); };
  const onDouble = () => { const h = doubleBlackjack(); if (h) finish(h); };
  const onSplit = () => { const h = splitBlackjack(); if (h) finish(h); };
  const onNewHand = () => { setHand(null); setOutcome(null); setChosenStake(null); setPhase('bet'); };

  // Le conseil de la Mesure gravée : ce que la stratégie de base ferait avec
  // cette main contre la carte visible de l'oracle. Pure information, calculée
  // sur les mêmes fonctions que l'auto et le bench.
  const hasMeasure = hasTempleArtifact('mesure');
  const advice = hasMeasure && phase === 'player' && hand
    ? basicAction(hand.player, hand.dealer[0], { allowDouble: hand.canDouble })
    : null;
  const hasVoice = hasTempleArtifact('voix');

  const dealerHideHole = phase === 'player';
  const dealerValue = hand ? (dealerHideHole ? handValue([hand.dealer[0]]) : hand.dealerValue) : 0;

  const resultText = () => {
    if (!outcome) return null;
    if (outcome.result === 'blackjack') return tr({ fr: `Vingt-et-un ! +${fmt(outcome.faveurGain)} faveur`, en: `Twenty-one! +${fmt(outcome.faveurGain)} favor` });
    if (outcome.result === 'win') return tr({ fr: `Gagné : +${fmt(outcome.faveurGain)} faveur`, en: `Win: +${fmt(outcome.faveurGain)} favor` });
    if (outcome.result === 'push') return tr({ fr: `Égalité : +${fmt(outcome.faveurGain)} faveur`, en: `Push: +${fmt(outcome.faveurGain)} favor` });
    // Cette table ne nourrit plus la cagnotte depuis la bascule (REF ≥ 1,
    // feedPot clampe à 0) : ne pas promettre un versement qui n'existe pas.
    return tr({ fr: "Main perdue. L'oracle reprend la mise.", en: 'Hand lost. The oracle takes back the stake.' });
  };

  return (
    <div className="blackjack-stage">
      {/* Plus de cagnotte dans ce titre : depuis la bascule, cette table ne la
          nourrit plus et ne la rafle jamais — l'afficher ici était une vitrine
          mensongère (passe densité 2026-07-17). */}
      <div className="regul-block-title stage-title">
        {/* Nom du jeu retiré (retour Raphaël 2026-07-17 : « plus de nom en tête ») —
            la ligne se réduit à une barrette de contrôles (aide, fermeture) à droite. */}
        <StageHelp>
          <p>
            {tr({
              fr: 'Approche 21 sans dépasser. Le croupier tire jusqu’à 17. Un « vingt-et-un » (21 en deux cartes) paie ×2,5, une victoire ×2, l’égalité rend la mise. As : 1 ou 11, figures : 10.',
              en: 'Get close to 21 without going over. The dealer draws to 17. A natural (21 on two cards) pays ×2.5, a win ×2, a push returns the stake. Aces: 1 or 11, faces: 10.'
            })}
          </p>
          <p>
            {tr({
              fr: 'C’est la table la plus clémente du temple : bien jouée, elle ne garde presque rien.',
              en: 'This is the temple’s most lenient table: played well, it keeps almost nothing.'
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}>✕</button>
      </div>

      {history.length > 0 && (
        <div className="bj-history" aria-label={tr({ fr: 'Dernières mains', en: 'Last hands' })}>
          {history.map((r, i) => (
            <span key={`${r}-${i}`} className={`bj-chip is-${r}`} {...tipProps(null, tr(BJ_RESULT_LABEL[r] || { fr: r, en: r }))}>
              {r === 'blackjack' ? '21' : r === 'win' ? '✓' : r === 'push' ? '=' : '✕'}
            </span>
          ))}
        </div>
      )}

      {phase === 'bet' && (
        <>
          <CoffreSelect value={effMult} onChange={setCoffreMult} />
          <div className="scratch-stakes">
            {stakes.map((s) => {
              const cost = s.faveur * effMult;
              const cantPay = (state.faveur || 0) < cost;
              const chosen = chosenStake === s.id;
              return (
                // Le bouton de distribution n'apparaît QUE dans la mise choisie, cousu
                // au pied de SA colonne (retour Raph 2026-07-17 : « dans le cadre de la
                // mise choisie »).
                <div
                  key={s.id}
                  className={`scratch-stake${chosen ? ' is-chosen' : ''}${cantPay ? ' is-broke' : ''}`}
                >
                  <button
                    type="button"
                    className="stake-pick"
                    onClick={() => setChosenStake(s.id)}
                    {...tipProps(tr(s.label), tr({ fr: `Mise de ${cost} Faveur. Une victoire paie ×2, un vingt-et-un ×2,5.`, en: `${cost} Favor stake. A win pays ×2, a natural ×2.5.` }))}
                  >
                    {STAKE_ART[s.id] && (
                      <img className="stake-art" src={STAKE_ART[s.id]} alt="" aria-hidden="true" width={64} height={64} />
                    )}
                    <strong>{tr(s.label)}</strong>
                    <span><FaveurIcon /> {fmt(cost)}</span>
                  </button>
                  {chosen && (
                    <button type="button" className="scratch-buy stake-play" disabled={(state.faveur || 0) < chosenCost} onClick={() => onDeal()}>
                      {tr({ fr: 'Distribuer', en: 'Deal' })}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {(phase === 'player' || phase === 'done') && hand && (
        <>
          <div className="bj-table">
            {/* Le sabot, posé à droite du drap. Pur décor : il ne diminue pas et
                ne se distribue pas, le sabot réel vit dans le moteur. */}
            <img className="bj-deck" src={CARD_DECK_SRC} alt="" aria-hidden="true" draggable="false" />
            <div className="bj-side">
              <div className="bj-side-head">
                <span>{tr({ fr: 'Oracle', en: 'Dealer' })}</span>
                <span className="bj-val">{dealerHideHole ? `${dealerValue}+` : dealerValue}</span>
              </div>
              <div className="bj-hand">
                {hand.dealer.map((c, i) => <BjCard key={i} card={c} hidden={dealerHideHole && i > 0} />)}
              </div>
            </div>
            <div className="bj-side">
              <div className="bj-side-head">
                <span>{tr({ fr: 'Toi', en: 'You' })}</span>
                <span className={`bj-val${hand.playerValue > 21 ? ' is-bust' : ''}`}>{hand.playerValue}</span>
              </div>
              {/* La refente : les deux mains côte à côte, la main EN JEU marquée.
                  Une main simple garde le rendu d'avant (hands = [la main]). */}
              {hand.split ? (
                hand.hands.map((h, hi) => (
                  <div
                    key={hi}
                    className={`bj-hand bj-hand--split${phase === 'player' && hand.active === hi ? ' is-active' : ''}`}
                  >
                    {h.cards.map((c, i) => <BjCard key={i} card={c} />)}
                    <span className={`bj-split-val${h.value > 21 ? ' is-bust' : ''}`}>
                      {h.value}{h.doubled ? ' ×2' : ''}
                    </span>
                  </div>
                ))
              ) : (
                <div className="bj-hand">
                  {hand.player.map((c, i) => <BjCard key={i} card={c} />)}
                </div>
              )}
            </div>
          </div>

          {phase === 'player' && (
            <>
              {advice && (
                <p className="bj-measure" {...tipProps(null, tr({ fr: 'La mesure gravée : le conseil de la stratégie de base, contre la carte visible de l’oracle.', en: 'The graven measure: basic strategy advice, against the oracle’s visible card.' }))}>
                  {tr(MEASURE_LABEL[advice] || MEASURE_LABEL.stand)}
                </p>
              )}
              <menu className="choice-menu scratch-actions">
                <button type="button" className="scratch-buy" onClick={onHit}>{tr({ fr: 'Tirer', en: 'Hit' })}</button>
                <button type="button" onClick={onStand}>{tr({ fr: 'Rester', en: 'Stand' })}</button>
                {hand.canDouble && (
                  <button
                    type="button"
                    className="bj-double"
                    {...tipProps(tr({ fr: 'Doubler', en: 'Double' }), tr({ fr: `Double la mise (${fmt(hand.stakeFaveur)} de plus), une seule carte, et la main passe.`, en: `Double the stake (${fmt(hand.stakeFaveur)} more), one single card, and the hand passes.` }))}
                    onClick={onDouble}
                  >
                    {tr({ fr: 'Doubler', en: 'Double' })}
                  </button>
                )}
                {hand.canSplit && (
                  <button
                    type="button"
                    className="bj-double"
                    {...tipProps(tr({ fr: 'Refendre', en: 'Split' }), tr({ fr: `Sépare la paire en deux mains, chacune avec sa mise (${fmt(hand.stakeFaveur)} de plus). Un 21 refendu paie ×2.`, en: `Split the pair into two hands, each with its own stake (${fmt(hand.stakeFaveur)} more). A split 21 pays ×2.` }))}
                    onClick={onSplit}
                  >
                    {tr({ fr: 'Refendre', en: 'Split' })}
                  </button>
                )}
              </menu>
            </>
          )}

          {phase === 'done' && outcome && (
            <>
              <p className={`scratch-result scratch-result--${outcome.result === 'lose' ? 'lose' : 'win'}`}>{resultText()}</p>
              {outcome.split && (
                <p className="bj-split-summary">
                  {outcome.results.map((r, i) => (
                    `${tr({ fr: 'main', en: 'hand' })} ${i + 1} : ${tr(BJ_RESULT_LABEL[r.result] || { fr: r.result, en: r.result })}`
                  )).join(' · ')}
                </p>
              )}
              {hasVoice && (
                <p className="bj-oracle-line">
                  {tr(oracleLine(outcome.result, state.blackjackStreak || 0))}
                  {(state.blackjackStreak || 0) >= 2 && (
                    <span className="bj-streak"> · {tr({ fr: `série de ${state.blackjackStreak}`, en: `streak of ${state.blackjackStreak}` })}</span>
                  )}
                </p>
              )}
              {/* Rejeu DIRECT (phase 7) : redistribuer à la même mise sans repasser
                  par le pari — c'est le seul jeu du temple jouable en continu, le
                  clic administratif y coûtait le plus. */}
              <menu className="choice-menu scratch-actions">
                <button
                  type="button"
                  className="scratch-buy"
                  disabled={!chosen || (state.faveur || 0) < chosenCost}
                  onClick={() => { setOutcome(null); onDeal(); }}
                >
                  {tr({ fr: `Redistribuer (${fmt(chosenCost)})`, en: `Deal again (${fmt(chosenCost)})` })}
                </button>
                <button type="button" onClick={onNewHand}>{tr({ fr: 'Changer de mise', en: 'Change stake' })}</button>
                <button type="button" className="btn-close" onClick={onClose}>{tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}</button>
              </menu>
            </>
          )}
        </>
      )}
    </div>
  );
}
