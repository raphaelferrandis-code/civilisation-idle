import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import {
  launchIcarus,
  cashOutIcarus,
  icarusStakes,
  icarusFlying,
  icarusMultiplier,
  icarusLastOutcome,
  icarusPotFaveur,
  icarusAlmostPayout,
  icarusEffectiveCap
} from '../../game/core/actions.js';
import { ICARUS_JACKPOT_MULT, ICARUS_FAVEUR_K } from '../../game/core/balance.js';
import { D } from '../../game/core/num.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';

/**
 * Le Vol d'Icare — SCÈNE INTÉGRÉE (ex-IcarusDialog, dé-modalisée 2026-07-14 :
 * le jeu se joue dans la scène en bas de la page Régulation). Le moteur
 * (actions/icarus.js) reste autoritaire : rouvrir la scène PENDANT un vol le
 * REPREND en cours (le timer de chute n'a jamais cessé de courir).
 */

const TICK_MS = 80;

function PixelFeather() {
  return (
    <svg viewBox="0 0 8 14" width="16" height="28" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="0" width="2" height="2" fill="#fdf3d0" />
      <rect x="2" y="2" width="4" height="2" fill="#f4d88a" />
      <rect x="2" y="4" width="4" height="3" fill="#e8b54f" />
      <rect x="3" y="7" width="2" height="3" fill="#c98d33" />
      <rect x="3" y="10" width="1" height="4" fill="#8a5f28" />
    </svg>
  );
}

function crashChipTone(c) {
  if (c >= ICARUS_JACKPOT_MULT) return 'is-hot';
  if (c >= 2) return 'is-warm';
  return 'is-cold';
}

function multiplierTone(m) {
  if (m >= 10) return '#ff5b4d';
  if (m >= 5) return '#ff9a3d';
  if (m >= 2) return '#ffd23d';
  return '#ffe9a8';
}

export default function IcarusStage({ table, onClose }) {
  const tickerRef = useRef(null);
  const [phase, setPhase] = useState('ready');
  const [stakeId, setStakeId] = useState('plume');
  const [stakeSeconds, setStakeSeconds] = useState(null); // pour l'aperçu vivant du gain de Faveur
  const [m, setM] = useState(1);
  const [outcome, setOutcome] = useState(null);
  useGameState((s) => s.instability); // or, cagnotte, mises (1 Hz)
  const cycles = useGameState((s) => s.cycles);

  const stopTicker = () => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = null;
  };

  // Nouvelle ouverture : repartir au sol — SAUF si un vol est déjà en l'air
  // (scène fermée en plein vol puis rouverte) : on le reprend.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronise la scène sur l'état EXTERNE du vol (icarusFlying) à la réouverture
    setOutcome(null);
    setStakeId('plume');
    if (icarusFlying()) {
      setM(icarusMultiplier());
      setPhase('flying');
    } else {
      setM(1);
      setPhase('ready');
    }
    return stopTicker;
  }, [table?.openedAt]);

  // Effondrement pendant le vol : la scène se referme (nouveau cycle).
  const prevCyclesRef = useRef(cycles);
  useEffect(() => {
    if (prevCyclesRef.current !== cycles) onClose();
    prevCyclesRef.current = cycles;
  }, [cycles, onClose]);

  // Ticker de vol : anime le multiplicateur et détecte la chute (timer moteur).
  useEffect(() => {
    if (phase !== 'flying') return undefined;
    tickerRef.current = setInterval(() => {
      if (icarusFlying()) {
        setM(icarusMultiplier());
      } else {
        const out = icarusLastOutcome();
        stopTicker();
        setOutcome(out);
        if (out?.type === 'crash') { setM(out.crashPoint); setPhase('crashed'); }
        else if (out) { setM(out.m); setPhase('landed'); }
        else setPhase('ready');
      }
    }, TICK_MS);
    return stopTicker;
  }, [phase]);

  const stakes = icarusStakes();
  const potFaveur = icarusPotFaveur();
  const history = (state.icarusHistory || []).slice().reverse();
  const flying = phase === 'flying';
  // Plafond EFFECTIF (relevé par « Ailes solaires ») → l'échelle de la jauge se
  // recale : un ×100 ne remplit plus toute la barre, il reste du ciel à gagner.
  const climb = Math.max(0, Math.min(1, Math.log(Math.max(1, m)) / Math.log(icarusEffectiveCap())));
  // Gain de Faveur en direct : secondes de mise × multiplicateur × K (l'objet
  // stake retient stakeSeconds pour l'aperçu vivant du retrait).
  const liveGain = stakeSeconds ? Math.round(stakeSeconds * (Math.floor(m * 100) / 100) * ICARUS_FAVEUR_K) : null;
  const almost = outcome?.type === 'crash' ? icarusAlmostPayout(outcome) : null;
  const nearMiss = outcome?.type === 'cashout' && (outcome.crashPoint - outcome.m) < 0.6;

  const onLaunch = () => {
    const stake = stakes.find((s) => s.id === stakeId);
    if (!stake) return;
    const freeHere = stakeId === 'plume' && (state.icarusFreeFlights || 0) > 0;
    if (!freeHere && D(state.gold).lt(stake.gold)) return;
    const res = launchIcarus(stakeId);
    if (!res) return;
    setStakeSeconds(stake.seconds);
    setOutcome(null);
    setM(1);
    setPhase('flying');
  };

  const onCashOut = () => {
    const out = cashOutIcarus();
    if (!out) return;
    stopTicker();
    setOutcome(out);
    if (out.type === 'crash') { setM(out.crashPoint); setPhase('crashed'); }
    else { setM(out.m); setPhase('landed'); }
  };

  return (
    <div className="icarus-stage">
      <div className="regul-block-title stage-title">
        <span>🪽 {tr({ fr: "Le Vol d'Icare", en: 'The Flight of Icarus' })}</span>
        <span className="icarus-stage-pot">
          🏺 <strong>{fmt(potFaveur)}</strong> {tr({ fr: 'faveur', en: 'favor' })}
          <span className="icarus-pot-hint-inline"> · {tr({ fr: `rafle à ×${ICARUS_JACKPOT_MULT}+`, en: `sweep at ×${ICARUS_JACKPOT_MULT}+` })}</span>
        </span>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}>✕</button>
      </div>

      {history.length > 0 && (
        <div className="icarus-history" aria-label={tr({ fr: 'Derniers vols', en: 'Last flights' })}>
          {history.map((c, i) => (
            <span key={`${c}-${i}`} className={`icarus-crash-chip ${crashChipTone(c)}`}>×{c < 10 ? c.toFixed(2) : Math.round(c)}</span>
          ))}
        </div>
      )}

      <div className={`icarus-sky${phase === 'crashed' ? ' is-crashed' : ''}${outcome?.jackpotFaveur ? ' is-jackpot' : ''}`}>
        <img
          className={`icarus-sun${phase === 'crashed' ? ' is-flare' : ''}`}
          src="/pixelart/ui/icarus/sun.png"
          alt=""
          aria-hidden="true"
        />
        <span className="icarus-mult" style={{ color: multiplierTone(m) }}>×{m.toFixed(2)}</span>
        {(flying || phase === 'ready' || phase === 'landed') && (
          <span className={`icarus-bird${phase === 'landed' ? ' is-safe' : ''}`} style={{ bottom: `${8 + climb * 76}%` }} aria-hidden="true">
            <img src="/pixelart/ui/icarus/icarus.png" alt="" />
          </span>
        )}
        {phase === 'crashed' && (
          <span className="icarus-feathers" style={{ bottom: `${8 + climb * 76}%` }} aria-hidden="true">
            <i><PixelFeather /></i><i><PixelFeather /></i><i><PixelFeather /></i><i><PixelFeather /></i>
          </span>
        )}
        {phase === 'ready' && (
          <span className="icarus-ground-hint">{tr({ fr: 'le soleil frappe où il veut — encaisse avant', en: 'the sun strikes where it wills — cash out first' })}</span>
        )}
      </div>

      {phase === 'ready' && (
        <>
          <div className="icarus-stakes">
            {stakes.map((s) => {
              const freeHere = s.id === 'plume' && (state.icarusFreeFlights || 0) > 0;
              const broke = !freeHere && D(state.gold).lt(s.gold);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`icarus-stake${stakeId === s.id ? ' is-chosen' : ''}${broke ? ' is-broke' : ''}`}
                  onClick={() => setStakeId(s.id)}
                  title={freeHere
                    ? tr({ fr: 'Vol offert par un Coup de Vénus — le temple paie la mise.', en: 'Flight offered by a Venus throw — the temple pays the stake.' })
                    : tr({ fr: `${s.seconds} secondes de production d'or`, en: `${s.seconds} seconds of gold production` })}
                >
                  <strong>{tr(s.label)}</strong>
                  <span>{fmt(s.gold)} {tr({ fr: 'or', en: 'gold' })}</span>
                  {freeHere && <span className="icarus-stake-free">🪽 {tr({ fr: 'OFFERT', en: 'FREE' })} ×{state.icarusFreeFlights}</span>}
                </button>
              );
            })}
          </div>
          <menu className="choice-menu icarus-actions">
            <button
              type="button"
              className="icarus-launch"
              disabled={!(stakeId === 'plume' && (state.icarusFreeFlights || 0) > 0)
                && D(state.gold).lt((stakes.find((s) => s.id === stakeId) || stakes[0]).gold)}
              onClick={onLaunch}
            >
              {tr({ fr: "S'ENVOLER", en: 'TAKE FLIGHT' })}
            </button>
          </menu>
        </>
      )}

      {flying && (
        <menu className="choice-menu icarus-actions">
          <button type="button" className="icarus-cashout" onClick={onCashOut}>
            {tr({ fr: 'SE POSER', en: 'LAND' })} — ×{m.toFixed(2)}{liveGain ? ` · +${fmt(liveGain)} ${tr({ fr: 'faveur', en: 'favor' })}` : ''}
          </button>
        </menu>
      )}

      {phase === 'landed' && outcome && (
        <>
          {outcome.jackpotFaveur && (
            <p className="icarus-jackpot-banner">🏺 {tr({ fr: 'CAGNOTTE RAFLÉE', en: 'POT SWEPT' })} — +{fmt(outcome.jackpotFaveur)} {tr({ fr: 'faveur', en: 'favor' })}</p>
          )}
          <p className="icarus-result icarus-result--win">
            +{fmt(outcome.faveur)} {tr({ fr: 'faveur', en: 'favor' })} <span className="icarus-result-sub">(×{outcome.m.toFixed(2)})</span>
          </p>
          <p className="icarus-reveal">
            {nearMiss ? '🔥 ' : ''}
            {tr({ fr: `Le soleil a frappé à ×${outcome.crashPoint.toFixed(2)}`, en: `The sun struck at ×${outcome.crashPoint.toFixed(2)}` })}
            {nearMiss ? ` — ${tr({ fr: "d'un battement d'aile !", en: 'by a wingbeat!' })}` : ` — ${tr({ fr: 'tu volais encore.', en: 'you were still flying.' })}`}
          </p>
          <menu className="choice-menu icarus-actions">
            <button type="button" className="icarus-launch" onClick={() => { setPhase('ready'); setOutcome(null); setM(1); }}>
              {tr({ fr: 'Revoler', en: 'Fly again' })}
            </button>
            <button type="button" onClick={onClose}>{tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}</button>
          </menu>
        </>
      )}

      {phase === 'crashed' && outcome && (
        <>
          <p className="icarus-result icarus-result--burn">
            {outcome.crashPoint <= 1.01
              ? tr({ fr: 'Le soleil frappe au décollage : la cire fond d’un coup.', en: 'The sun strikes at takeoff: the wax melts at once.' })
              : tr({ fr: `La cire fond à ×${outcome.crashPoint.toFixed(2)} — Icare tombe.`, en: `The wax melts at ×${outcome.crashPoint.toFixed(2)} — Icarus falls.` })}
          </p>
          <p className="icarus-reveal">
            {tr({ fr: `La cagnotte du temple atteint ${fmt(potFaveur)} faveur`, en: `The temple pot reaches ${fmt(potFaveur)} favor` })}
            {almost && (
              <span className="icarus-knife"> · {tr({ fr: `une seconde plus tôt : +${fmt(almost.faveur)} faveur (×${almost.m.toFixed(2)})`, en: `one second sooner: +${fmt(almost.faveur)} favor (×${almost.m.toFixed(2)})` })}</span>
            )}
          </p>
          <menu className="choice-menu icarus-actions">
            <button type="button" className="icarus-launch" onClick={() => { setPhase('ready'); setOutcome(null); setM(1); }}>
              {tr({ fr: 'Revoler', en: 'Fly again' })}
            </button>
            <button type="button" onClick={onClose}>{tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}</button>
          </menu>
        </>
      )}
    </div>
  );
}
