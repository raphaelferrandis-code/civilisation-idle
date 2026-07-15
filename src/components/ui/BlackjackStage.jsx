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
  icarusPotFaveur,
  handValue
} from '../../game/core/actions.js';
import { D } from '../../game/core/num.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';

/**
 * Le Vingt-et-un — SCÈNE INTÉGRÉE (bas de la page Régulation, comme osselets/
 * Icare/scratch). Le moteur (actions/blackjack.js) est autoritaire : rouvrir la
 * scène pendant une main la REPREND en cours. Phases : pari (choix de la mise) →
 * jeu (tirer/rester) → résultat. Les cartes sont des tuiles pixel : rang + une
 * « couleur » = sprite d'emblème antique RÉUTILISÉ du scratch (/pixelart/ui/
 * scratch/<suit>.png). La carte cachée du croupier reste face verso tant qu'on
 * joue. Fermer/changer de cycle en pleine main abandonne la mise (déjà payée).
 */

// Libellés d'issue pour l'infobulle des pastilles d'historique (résolus par tr()).
const BJ_RESULT_LABEL = {
  blackjack: { fr: 'Vingt-et-un', en: 'Twenty-one' },
  win: { fr: 'Gagné', en: 'Win' },
  push: { fr: 'Égalité', en: 'Push' },
  lose: { fr: 'Perdu', en: 'Lose' }
};

function BjCard({ card, hidden }) {
  if (hidden) {
    return <span className="bj-card is-hidden" aria-hidden="true"><span className="bj-card-back" /></span>;
  }
  return (
    <span className="bj-card">
      <span className="bj-card-rank">{card.rank}</span>
      <img className="bj-card-suit" src={`/pixelart/ui/scratch/${card.suit}.png`} alt="" aria-hidden="true" draggable="false" />
    </span>
  );
}

export default function BlackjackStage({ table, onClose }) {
  const [phase, setPhase] = useState('bet');
  const [chosenStake, setChosenStake] = useState('legere');
  const [hand, setHand] = useState(null);
  const [outcome, setOutcome] = useState(null);
  useGameState((s) => s.instability); // or, cagnotte, mises vivants (1 Hz)
  const cycles = useGameState((s) => s.cycles);

  // (Ré)ouverture : reprendre une main en cours (état module), sinon repartir au pari.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronise la scène sur l'état module (blackjackActive) à la (ré)ouverture
    setOutcome(null);
    if (blackjackActive()) {
      setHand(blackjackHand());
      setPhase('player');
    } else {
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
  const pot = icarusPotFaveur();
  const history = (state.blackjackHistory || []).slice().reverse();
  const chosen = stakes.find((s) => s.id === chosenStake) || stakes[0];
  const broke = chosen && D(state.gold).lt(chosen.gold);

  const finish = (h) => {
    setHand(h);
    if (h.resolved) { setOutcome(blackjackLastOutcome()); setPhase('done'); }
  };

  const onDeal = () => {
    if (!chosen || D(state.gold).lt(chosen.gold)) return;
    const h = dealBlackjack(chosen.id);
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
  const onNewHand = () => { setHand(null); setOutcome(null); setPhase('bet'); };

  const dealerHideHole = phase === 'player';
  const dealerValue = hand ? (dealerHideHole ? handValue([hand.dealer[0]]) : hand.dealerValue) : 0;

  const resultText = () => {
    if (!outcome) return null;
    if (outcome.result === 'blackjack') return tr({ fr: `Vingt-et-un ! +${fmt(outcome.faveurGain)} faveur`, en: `Twenty-one! +${fmt(outcome.faveurGain)} favor` });
    if (outcome.result === 'win') return tr({ fr: `Gagné — +${fmt(outcome.faveurGain)} faveur`, en: `Win — +${fmt(outcome.faveurGain)} favor` });
    if (outcome.result === 'push') return tr({ fr: `Égalité — +${fmt(outcome.faveurGain)} faveur`, en: `Push — +${fmt(outcome.faveurGain)} favor` });
    return tr({ fr: 'Main perdue — la cagnotte du temple s’épaissit.', en: 'Hand lost — the temple pot thickens.' });
  };

  return (
    <div className="blackjack-stage">
      <div className="regul-block-title stage-title">
        <span>🃏 {tr({ fr: 'Vingt-et-un', en: 'Twenty-one' })}</span>
        <span className="scratch-stage-pot">
          🏺 <strong>{fmt(pot)}</strong> {tr({ fr: 'faveur', en: 'favor' })}
        </span>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}>✕</button>
      </div>

      {history.length > 0 && (
        <div className="bj-history" aria-label={tr({ fr: 'Dernières mains', en: 'Last hands' })}>
          {history.map((r, i) => (
            <span key={`${r}-${i}`} className={`bj-chip is-${r}`} title={tr(BJ_RESULT_LABEL[r] || { fr: r, en: r })}>
              {r === 'blackjack' ? '21' : r === 'win' ? '✓' : r === 'push' ? '=' : '✕'}
            </span>
          ))}
        </div>
      )}

      {phase === 'bet' && (
        <>
          <div className="scratch-stakes">
            {stakes.map((s) => {
              const cantPay = D(state.gold).lt(s.gold);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`scratch-stake${chosenStake === s.id ? ' is-chosen' : ''}${cantPay ? ' is-broke' : ''}`}
                  onClick={() => setChosenStake(s.id)}
                  title={tr({ fr: `${s.seconds} secondes de production d'or`, en: `${s.seconds} seconds of gold production` })}
                >
                  <strong>{tr(s.label)}</strong>
                  <span>{fmt(s.gold)} {tr({ fr: 'or', en: 'gold' })}</span>
                </button>
              );
            })}
          </div>
          <menu className="choice-menu scratch-actions">
            <button type="button" className="scratch-buy" disabled={broke} onClick={onDeal}>
              {tr({ fr: 'Distribuer', en: 'Deal' })}
            </button>
          </menu>
          <p className="stage-footnote">
            {tr({
              fr: 'Approche 21 sans dépasser. Le croupier tire jusqu’à 17. Un « vingt-et-un » (21 en deux cartes) paie 3:2. Une main perdue nourrit la cagnotte du temple ; le gain est de la Faveur.',
              en: 'Get close to 21 without going over. The dealer draws to 17. A natural (21 on two cards) pays 3:2. A lost hand feeds the temple pot; winnings are Favor.'
            })}
          </p>
        </>
      )}

      {(phase === 'player' || phase === 'done') && hand && (
        <>
          <div className="bj-table">
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
              <div className="bj-hand">
                {hand.player.map((c, i) => <BjCard key={i} card={c} />)}
              </div>
            </div>
          </div>

          {phase === 'player' && (
            <menu className="choice-menu scratch-actions">
              <button type="button" className="scratch-buy" onClick={onHit}>{tr({ fr: 'Tirer', en: 'Hit' })}</button>
              <button type="button" onClick={onStand}>{tr({ fr: 'Rester', en: 'Stand' })}</button>
            </menu>
          )}

          {phase === 'done' && outcome && (
            <>
              <p className={`scratch-result scratch-result--${outcome.result === 'lose' ? 'lose' : 'win'}`}>{resultText()}</p>
              <menu className="choice-menu scratch-actions">
                <button type="button" className="scratch-buy" onClick={onNewHand}>{tr({ fr: 'Nouvelle main', en: 'New hand' })}</button>
                <button type="button" onClick={onClose}>{tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}</button>
              </menu>
            </>
          )}
        </>
      )}
    </div>
  );
}
