import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import {
  playScratch,
  scratchStakes,
  scratchPayout,
  icarusPotFaveur
} from '../../game/core/actions.js';
import { SCRATCH_PRIZES, SCRATCH_REVEAL_PCT } from '../../game/core/balance.js';
import { D } from '../../game/core/num.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import ScratchCanvas from './ScratchCanvas.jsx';

// Symbole d'un ticket = sprite pixel-art (PixelLab, /pixelart/ui/scratch/<name>.png),
// rendu net (image-rendering: pixelated). Décoratif → aria-hidden.
function Sym({ name, cls }) {
  return (
    <img
      className={`scratch-sym${cls ? ' ' + cls : ''}`}
      src={`/pixelart/ui/scratch/${name}.png`}
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}

/**
 * Les tickets à gratter — SCÈNE INTÉGRÉE (bas de la page Régulation, comme
 * osselets/Icare). Le moteur (actions/scratch.js) tire l'issue et fige la grille
 * À L'ACHAT, mais l'EFFET est différé jusqu'à ce que le joueur ait vraiment
 * GRATTÉ le vernis (auto-révélation à SCRATCH_REVEAL_PCT %, ou bouton « Tout
 * révéler »). Phases : achat (choix de la mise) → grattage → résultat. Fermer
 * ou changer de cycle en plein grattage flush l'effet (la mise est déjà payée).
 */

// Symboles gagnants (hors « blank ») pour la légende des lots.
const WIN_PRIZES = SCRATCH_PRIZES.filter((p) => p.symbol !== 'blank');

export default function ScratchStage({ table, onClose }) {
  const [phase, setPhase] = useState('buy');
  const [chosenStake, setChosenStake] = useState('obole');
  const [outcome, setOutcome] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [ticketNonce, setTicketNonce] = useState(0);
  const pendingRef = useRef(null); // apply() différé du ticket en cours
  const outcomeRef = useRef(null); // le résultat brut (apply le peuple sur place)
  useGameState((s) => s.instability); // or, cagnotte, mises vivants (1 Hz)
  const cycles = useGameState((s) => s.cycles);

  // Nouvelle ouverture de la scène : flush un éventuel ticket en suspens et
  // repartir à l'achat.
  useEffect(() => {
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
    outcomeRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remise à zéro VOULUE de la scène à chaque réouverture (openedAt)
    setPhase('buy');
    setOutcome(null);
    setRevealed(false);
  }, [table?.openedAt]);

  // Démontage : un ticket acheté mais non gratté DOIT se résoudre (mise payée).
  useEffect(() => () => {
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
  }, []);

  // Effondrement pendant le grattage : la scène se referme (nouveau cycle).
  const prevCyclesRef = useRef(cycles);
  useEffect(() => {
    if (prevCyclesRef.current !== cycles) onClose();
    prevCyclesRef.current = cycles;
  }, [cycles, onClose]);

  // Révélation : applique l'effet (crédite la Faveur / nourrit la cagnotte),
  // découvre la grille et passe au résultat. Stable (refs + setters).
  const reveal = useCallback(() => {
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
    if (outcomeRef.current) setOutcome({ ...outcomeRef.current });
    setRevealed(true);
    setPhase('done');
  }, []);

  // Feuille à gratter : « cire dorée » + grain pixel + libellé, procédurale
  // (same-origin → getImageData jamais tainted). Coords entières (DA pixel).
  const drawFoil = useCallback((ctx, w, h) => {
    ctx.fillStyle = '#b98a34';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      for (let x = 0; x < w; x += 3) {
        const n = (x * 7 + y * 13 + (x * y) % 5) % 19;
        if (n < 4) { ctx.fillStyle = 'rgba(255,232,170,0.22)'; ctx.fillRect(x, y, 3, 3); }
        else if (n > 15) { ctx.fillStyle = 'rgba(70,45,15,0.24)'; ctx.fillRect(x, y, 3, 3); }
      }
    }
    ctx.fillStyle = 'rgba(58,38,10,0.55)';
    ctx.font = '700 20px "Pixelify Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // tr() résolu à la peinture (un changement de langue recharge la page, cf. i18n.js).
    ctx.fillText(tr({ fr: '✦ GRATTEZ ✦', en: '✦ SCRATCH ✦' }), Math.round(w / 2), Math.round(h / 2));
  }, []);

  const stakes = scratchStakes();
  const pot = icarusPotFaveur();
  const history = (state.scratchHistory || []).slice().reverse();
  const chosen = stakes.find((s) => s.id === chosenStake) || stakes[0];
  const broke = chosen && D(state.gold).lt(chosen.gold);

  const onBuy = () => {
    if (!chosen || D(state.gold).lt(chosen.gold)) return;
    const res = playScratch(chosen.id, { defer: true });
    if (!res) return;
    pendingRef.current = res.apply;
    outcomeRef.current = res;
    setOutcome(res);
    setRevealed(false);
    setTicketNonce((n) => n + 1);
    setPhase('scratch');
  };

  const onNewTicket = () => {
    // Le ticket courant est déjà appliqué (reveal a flush) : on repart à l'achat.
    outcomeRef.current = null;
    setOutcome(null);
    setRevealed(false);
    setPhase('buy');
  };

  const totalFaveur = outcome ? outcome.faveurGain + (outcome.jackpotFaveur || 0) : 0;

  const ticket = (phase === 'scratch' || phase === 'done') && outcome && (
    <div className={`scratch-ticket${revealed ? ' is-revealed' : ''}`}>
      <div className="scratch-grid" aria-hidden={phase === 'scratch' && !revealed ? 'true' : undefined}>
        {(outcome.grid || []).map((sym, i) => (
          <span
            key={i}
            className={`scratch-cell${revealed && outcome.win && sym === outcome.symbol ? ' is-win' : ''}`}
          >
            {sym ? <Sym name={sym} /> : null}
          </span>
        ))}
      </div>
      <ScratchCanvas
        nonce={ticketNonce}
        threshold={SCRATCH_REVEAL_PCT}
        onReveal={reveal}
        drawFoil={drawFoil}
        disabled={revealed}
      />
    </div>
  );

  return (
    <div className="scratch-stage">
      <div className="regul-block-title stage-title">
        <span>🎟️ {tr({ fr: 'Tickets à gratter', en: 'Scratch tickets' })}</span>
        <span className="scratch-stage-pot">
          🏺 <strong>{fmt(pot)}</strong> {tr({ fr: 'faveur', en: 'favor' })}
          <span className="scratch-pot-hint-inline"> · {tr({ fr: 'rafle à ☀☀☀', en: 'sweep at ☀☀☀' })}</span>
        </span>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}>✕</button>
      </div>

      {history.length > 0 && (
        <div className="scratch-history" aria-label={tr({ fr: 'Derniers tickets', en: 'Last tickets' })}>
          {history.map((sym, i) => (
            <span key={`${sym}-${i}`} className={`scratch-chip${sym === 'blank' ? ' is-blank' : ' is-win'}`}>
              {sym === 'blank' ? '·' : <Sym name={sym} cls="scratch-sym-sm" />}
            </span>
          ))}
        </div>
      )}

      {phase === 'buy' && (
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
            <button type="button" className="scratch-buy" disabled={broke} onClick={onBuy}>
              {tr({ fr: 'Acheter le ticket', en: 'Buy the ticket' })}
            </button>
          </menu>
          <div className="scratch-legend" aria-label={tr({ fr: 'Table des lots', en: 'Prize table' })}>
            {WIN_PRIZES.map((p) => (
              <span key={p.symbol} className="scratch-legend-item">
                <b><Sym name={p.symbol} cls="scratch-sym-sm" />×3</b>
                {`+${fmt(scratchPayout(p.symbol, chosen ? chosen.seconds : 0))}`}
                {p.sweep ? ` +${tr({ fr: 'cagnotte', en: 'pot' })}` : p.freeFlight ? ' 🪽' : ''}
              </span>
            ))}
          </div>
          <p className="stage-footnote">
            {tr({
              fr: 'Aligne 3 symboles identiques sous le vernis pour gagner de la Faveur. La plupart des tickets sont nus — chacun épaissit la cagnotte du temple. Trois Vénus offrent un vol d’Icare, trois Soleils raflent la cagnotte.',
              en: 'Reveal 3 matching symbols under the varnish to win Favor. Most tickets come up bare — each thickens the temple pot. Three Venus grant an Icarus flight, three Suns sweep the pot.'
            })}
          </p>
        </>
      )}

      {phase === 'scratch' && (
        <>
          {ticket}
          <p className="scratch-hint">{tr({ fr: 'Gratte le vernis avec la souris ou le doigt…', en: 'Scratch the varnish with the mouse or finger…' })}</p>
          <menu className="choice-menu scratch-actions">
            <button type="button" className="scratch-reveal-all" onClick={reveal}>
              {tr({ fr: 'Tout révéler', en: 'Reveal all' })}
            </button>
          </menu>
        </>
      )}

      {phase === 'done' && outcome && (
        <>
          {ticket}
          {outcome.jackpotFaveur ? (
            <p className="scratch-jackpot-banner">☀ {tr({ fr: 'CAGNOTTE RAFLÉE', en: 'POT SWEPT' })} — +{fmt(outcome.jackpotFaveur)} {tr({ fr: 'faveur', en: 'favor' })}</p>
          ) : null}
          {outcome.win ? (
            <p className="scratch-result scratch-result--win">
              +{fmt(totalFaveur)} {tr({ fr: 'faveur', en: 'favor' })}
              {outcome.freeFlight && <span className="scratch-result-sub"> · 🪽 {tr({ fr: "vol d'Icare offert", en: 'free Icarus flight' })}</span>}
            </p>
          ) : (
            <p className="scratch-result scratch-result--lose">
              {tr({ fr: 'Vernis nu — la cagnotte du temple s’épaissit.', en: 'Bare varnish — the temple pot thickens.' })}
            </p>
          )}
          <menu className="choice-menu scratch-actions">
            <button type="button" className="scratch-buy" onClick={onNewTicket}>
              {tr({ fr: 'Nouveau ticket', en: 'New ticket' })}
            </button>
            <button type="button" onClick={onClose}>{tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}</button>
          </menu>
        </>
      )}
    </div>
  );
}
