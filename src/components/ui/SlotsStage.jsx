import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import { icarusPotFaveur } from '../../game/core/actions.js';
import { spinSlots, slotsStakes, slotsFreeSpins } from '../../game/core/actions/slots.js';
import { SLOTS_REELS, SLOTS_WHEEL, SLOTS_PAY, SLOTS_LINES, SLOTS_FREE_SPINS, SLOTS_FREE_MULT, SLOTS_CHESTS, SLOTS_FLIGHT, ICARUS_STAKES } from '../../game/core/balance.js';
import { clampStakeMult, potRakeShare } from '../../game/core/actions/templePot.js';
import { bakeSlotsScene, paintReels, paintLive, wheelRaster, chestRaster, symbolRaster, stakeArtRaster, SLOT_CELL, SCENE_H, WHEEL_SIZE } from '../../game/map/iso/plaisirsSlotsArt.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon, PotIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
import CoffreSelect from './CoffreSelect.jsx';
import StageHelp from './StageHelp.jsx';
import { usePlaisirsBand } from './plaisirsMaterial.js';
import { TableStake } from '../views/plaisirs/PlaisirsTable.jsx';
import '../../styles/plaisirs-tables.css';
import '../../styles/plaisirs-slots.css';

/**
 * LA MACHINE À SOUS (2026-10-03, demande de Raph : « avec des bonus type free spin et
 * mini jeux, qui déclenche une roue »). Moteur : game/core/actions/slots.js ; dessin :
 * game/map/iso/plaisirsSlotsArt.js (fonte, néon, cosmique).
 *
 * Le moteur tire les ARRÊTS des rouleaux et la case de la roue dès la mise ; tout effet
 * attend sa révélation (apply différé), comme le gratteux : les rouleaux tournent, s'arrêtent
 * l'un après l'autre, les lignes gagnantes s'allument, puis on encaisse. La roue se lance
 * d'un clic (le geste est le plaisir), les coffres se choisissent. Les tours gratuits
 * s'enchaînent seuls. Fermer la machine encaisse ce qui reste en suspens.
 *
 * ⛔ Pas une phrase à l'écran : des valeurs ; les règles sont dans l'aide « ? ».
 */
const SCENE_K = 3;
const toCanvas = (R) => {
  const cv = document.createElement('canvas');
  cv.width = R.w; cv.height = R.h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(R.data), R.w, R.h), 0, 0);
  return cv;
};
const artUrl = new Map();
function stakeArtUrl(id) {
  if (typeof document === 'undefined') return null;
  if (!artUrl.has(id)) artUrl.set(id, toCanvas(stakeArtRaster(id)).toDataURL());
  return artUrl.get(id);
}
function chestUrl(band, open) {
  const key = 'chest|' + band + '|' + open;
  if (typeof document === 'undefined') return null;
  if (!artUrl.has(key)) artUrl.set(key, toCanvas(chestRaster(band, open)).toDataURL());
  return artUrl.get(key);
}
function symbolUrl(id, band) {
  const key = id + '|' + band;
  if (typeof document === 'undefined') return null;
  if (!artUrl.has(key)) artUrl.set(key, toCanvas(symbolRaster(id, band)).toDataURL());
  return artUrl.get(key);
}
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export default function SlotsStage({ table, onClose }) {
  const band = usePlaisirsBand();
  useGameState((s) => s.instability);                 // solde, cagnotte, tours vivants (1 Hz)
  const stakes = slotsStakes();
  const [chosenStake, setChosenStake] = useState(null);
  const [coffreMult, setCoffreMult] = useState(1);
  const effMult = clampStakeMult(coffreMult);
  const chosen = stakes.find((s) => s.id === chosenStake) || null;
  const chosenCost = chosen ? chosen.faveur * effMult : 0;
  const fs = slotsFreeSpins();
  const pot = icarusPotFaveur();

  // La scène : le cadre, son pas entier (k), la largeur native qui le remplit.
  const boxRef = useRef(null), cvRef = useRef(null), wheelCvRef = useRef(null);
  const [boxW, setBoxW] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const upd = () => setBoxW(Math.round(el.getBoundingClientRect().width));
    upd();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = boxW && boxW < 560 ? 2 : SCENE_K;
  const W = boxW ? Math.ceil(boxW / k) : 0;
  const scene = useMemo(() => (W ? bakeSlotsScene(band, W) : null), [band, W]);

  // Ce qui tourne : positions des rouleaux (en cases), flou, levier, lignes allumées.
  const anim = useRef({ pos: [1, 4, 7], blur: [0, 0, 0], pull: 0, lines: [], win: false, t0: 0 });
  const [phase, setPhase] = useState('idle');          // idle | spin | show | wheel | wheelSpin | wheelDone | chests
  const [outcome, setOutcome] = useState(null);
  const [wheelState, setWheelState] = useState(null);  // { res, angle, done }
  const pending = useRef({ spin: null, wheel: null });

  // Fermer la machine (ou la rouvrir) encaisse ce qui attend.
  useEffect(() => () => {
    if (pending.current.spin) pending.current.spin.apply();
    if (pending.current.wheel) pending.current.wheel.apply(0);
  }, [table.openedAt]);

  // ── LE DESSIN : une boucle qui ne peint que ce qui bouge (20 i/s au repos : les
  // ampoules ; 60 pendant que les rouleaux tournent). ⚠ Le Chrome de Raph rend en
  // logiciel : la scène reste petite (≈ 300×150 px natifs) et un seul putImageData.
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !scene) return undefined;
    const g = cv.getContext('2d');
    const R = { w: scene.back.w, h: scene.back.h, data: new Uint8ClampedArray(scene.back.data.length) };
    let raf = 0, last = 0, alive = true;
    const frame = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const a = anim.current, busy = a.spinning || a.pull > 0;
      if (!busy && now - last < 50) return;
      last = now;
      if (a.step) a.step(now);
      R.data.set(scene.back.data);
      paintReels(R, scene, SLOTS_REELS, a.pos, band, a.blur);
      paintLive(R, scene, now / 1000, a.pull, a.win);
      // Les lignes gagnantes, qui clignotent.
      if (a.lines.length && Math.floor(now / 260) % 2 === 0) {
        for (const li of a.lines) {
          const ln = SLOTS_LINES[li];
          for (let r = 0; r < 3; r += 1) {
            const x = scene.reelX[r] + SLOT_CELL / 2, y = scene.win.y + ln[r] * SLOT_CELL + SLOT_CELL / 2;
            const nx = r < 2 ? scene.reelX[r + 1] + SLOT_CELL / 2 : x, ny = r < 2 ? scene.win.y + ln[r + 1] * SLOT_CELL + SLOT_CELL / 2 : y;
            const steps = Math.max(1, Math.abs(nx - x), Math.abs(ny - y));
            for (let s = 0; s <= steps; s += 1) {
              const px = Math.round(x + ((nx - x) * s) / steps), py = Math.round(y + ((ny - y) * s) / steps);
              for (const [dx, dy] of [[0, 0], [0, 1]]) { const q = ((py + dy) * R.w + px + dx) * 4; R.data[q] = 255; R.data[q + 1] = 216; R.data[q + 2] = 74; R.data[q + 3] = 255; }
            }
          }
        }
      }
      g.putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [scene, band]);

  // ── UN TOUR ──────────────────────────────────────────────────────────────────
  const phaseRef = useRef('idle');
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const startSpin = (stakeId) => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'show') return;
    phaseRef.current = 'spin';
    if (pending.current.spin) { pending.current.spin.apply(); pending.current.spin = null; }
    const res = spinSlots(stakeId, { defer: true, stakeMult: effMult });
    if (!res) { phaseRef.current = 'show'; return; }
    pending.current.spin = res;
    pending.current.wheel = res.wheel || null;
    setOutcome(res);
    setPhase('spin');
    const a = anim.current;
    a.lines = []; a.win = false; a.spinning = true;
    // L'horloge part à la première image (le temps de l'animation, pas celui du clic).
    const start = a.pos.slice();
    let t0 = null;
    // Chaque rouleau s'arrête un peu après le précédent ; deux étoiles (ou deux roues) déjà
    // posées font TRAÎNER le troisième — le suspense des vraies machines.
    const teaseCount = (sym) => [0, 1].reduce((n, r) => n + (res.grid[r].includes(sym) ? 1 : 0), 0);
    const tease = teaseCount('etoile') >= 2 || teaseCount('roue') >= 2;
    const stopAt = [900, 1250, tease ? 2400 : 1600];
    const target = SLOTS_REELS.map((reel, r) => {
      const n = reel.length, cur = ((start[r] % n) + n) % n;
      return start[r] + ((res.stops[r] - cur + n) % n) + n * (3 + r);
    });
    a.step = (now) => {
      if (t0 === null) t0 = now;
      const t = now - t0;
      a.pull = t < 180 ? t / 180 : t < 420 ? 1 - (t - 180) / 240 : 0;
      let moving = false;
      for (let r = 0; r < 3; r += 1) {
        const u = Math.min(1, t / stopAt[r]);
        const prev = a.pos[r];
        // Un léger rebond à l'arrêt : la bande dépasse d'un quart de case et revient.
        const e = u < 1 ? easeOut(u) : 1;
        const over = u > 0.92 && u < 1 ? Math.sin(((u - 0.92) / 0.08) * Math.PI) * 0.18 : 0;
        a.pos[r] = start[r] + (target[r] - start[r]) * e + over;
        a.blur[r] = Math.min(5, Math.round(Math.abs(a.pos[r] - prev) * 4));
        if (u < 1) moving = true;
      }
      if (!moving) {
        a.pos = target.map((p, r) => p % SLOTS_REELS[r].length);
        a.blur = [0, 0, 0];
        a.spinning = false;
        a.step = null;
        res.apply();
        pending.current.spin = null;
        a.lines = res.lines.map((l) => l.line);
        a.win = res.faveurGain > 0 || res.freeSpinsWon > 0 || !!res.wheel;
        setPhase(res.wheel ? 'wheel' : 'show');
        if (res.wheel) setWheelState({ res: res.wheel, angle: 0, done: false });
        else nextFree(1100);
      }
    };
  };

  // Les tours gratuits s'enchaînent seuls : le suivant se programme à l'ARRÊT des
  // rouleaux (ou quand la roue se referme), jamais au rendu — la vue se redessine à
  // 1 Hz, un minuteur relancé à chaque rendu ne partirait jamais.
  const nextFree = (delay) => {
    clearTimeout(anim.current.freeTimer);
    if (!slotsFreeSpins()) return;
    anim.current.freeTimer = setTimeout(() => startSpin(null), delay);
  };
  useEffect(() => () => clearTimeout(anim.current.freeTimer), []);

  // ── LA ROUE ─────────────────────────────────────────────────────────────────
  const wheelAnim = useRef(null);
  useEffect(() => {
    const cv = wheelCvRef.current;
    if (!cv || !wheelState) return undefined;
    const g = cv.getContext('2d');
    const draw = (angle) => g.putImageData(new ImageData(new Uint8ClampedArray(wheelRaster(band, SLOTS_WHEEL, angle).data), WHEEL_SIZE, WHEEL_SIZE), 0, 0);
    draw(wheelState.angle);
    return undefined;
  }, [wheelState, band]);

  const spinWheel = () => {
    if (!wheelState || phase !== 'wheel') return;
    setPhase('wheelSpin');
    const n = SLOTS_WHEEL.length, i = wheelState.res.index;
    const jitter = (Math.random() - 0.5) * 0.6;
    const target = -((i + 0.5 + jitter) / n) * Math.PI * 2 - Math.PI * 2 * 5;
    const t0 = performance.now(), dur = 4200, from = wheelState.angle;
    const cv = wheelCvRef.current, g = cv && cv.getContext('2d');
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / dur), ang = from + (target - from) * easeOut(u);
      if (g) g.putImageData(new ImageData(new Uint8ClampedArray(wheelRaster(band, SLOTS_WHEEL, ang).data), WHEEL_SIZE, WHEEL_SIZE), 0, 0);
      if (u < 1) { wheelAnim.current = requestAnimationFrame(tick); return; }
      const w = wheelState.res;
      if (w.segment === 'coffres') { setPhase('chests'); return; }
      w.apply();
      pending.current.wheel = null;
      setWheelState({ ...wheelState, angle: ang, done: true });
      setPhase('wheelDone');
    };
    wheelAnim.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(wheelAnim.current), []);

  const pickChest = (i) => {
    if (phase !== 'chests' || !wheelState) return;
    wheelState.res.apply(i);
    pending.current.wheel = null;
    setWheelState({ ...wheelState, done: true });
    setPhase('wheelDone');
  };
  const closeWheel = () => {
    setWheelState(null);
    setPhase('show');
    phaseRef.current = 'show';
    nextFree(600);
  };

  // ── CE QUI S'AFFICHE ────────────────────────────────────────────────────────
  const busy = phase === 'spin' || phase === 'wheel' || phase === 'wheelSpin' || phase === 'chests' || phase === 'wheelDone';
  const canPull = !busy && (fs || (chosen && (state.faveur || 0) >= chosenCost));
  const onPull = () => { if (canPull) startSpin(fs ? null : chosen.id); };
  const series = fs || (state.slotsFreeSpins && state.slotsFreeSpins.left === 0 && phase === 'show' && outcome && outcome.free ? state.slotsFreeSpins : null);
  const lastWin = outcome && phase !== 'spin' ? outcome.faveurGain : 0;
  const history = (state.slotsHistory || []).slice(-8).reverse();
  const wr = wheelState && wheelState.res;
  const machineX = scene ? (scene.win.x + scene.win.w / 2) * k : 0;
  const leverBox = scene ? { left: (scene.lever.x - 5) * k, top: (scene.lever.y0 - 5) * k, width: 12 * k, height: (scene.lever.y1 - scene.lever.y0 + 10) * k } : null;
  // Les mises, sur le sol de la salle à gauche de la machine.
  const stakeXs = scene ? [0.2, 0.5, 0.8].map((f) => Math.round(f * Math.max(220, (scene.win.x - 40) * k))) : [];
  const flightLabel = (id) => tr((ICARUS_STAKES.find((s) => s.id === SLOTS_FLIGHT[id]) || ICARUS_STAKES[0]).label);

  return (
    <div className="slots-stage">
      <div className="regul-block-title stage-title">
        <span className="slots-stage-pot" {...tipProps(tr({ fr: 'La cagnotte de la Maison', en: 'The House pot' }), null)}>
          <PotIcon /> <strong>{fmt(pot)}</strong>
        </span>
        <StageHelp>
          <p>
            {tr({
              fr: 'Trois symboles identiques sur une des cinq lignes (les trois rangées, les deux diagonales) : la mise multipliée. Trois étoiles n’importe où : des tours gratuits, gains doublés. Trois roues n’importe où : la roue.',
              en: 'Three matching symbols on one of the five lines (the three rows, the two diagonals): the stake multiplied. Three stars anywhere: free spins, winnings doubled. Three wheels anywhere: the wheel.'
            })}
          </p>
          <div className="slots-paytable">
            {Object.entries(SLOTS_PAY).map(([sym, mult]) => (
              <span key={sym} className="slots-pay">
                <img src={symbolUrl(sym, band)} alt="" width={16} height={16} />×3 <b>×{mult}</b>
              </span>
            ))}
            <span className="slots-pay"><img src={symbolUrl('etoile', band)} alt="" width={16} height={16} />×3 <b>{SLOTS_FREE_SPINS} {tr({ fr: 'tours', en: 'spins' })} ×{SLOTS_FREE_MULT}</b></span>
            <span className="slots-pay"><img src={symbolUrl('roue', band)} alt="" width={16} height={16} />×3 <b>{tr({ fr: 'la roue', en: 'the wheel' })}</b></span>
          </div>
          <p>
            {tr({
              fr: `La roue : ×2 à ×20 la mise, les coffres (×${SLOTS_CHESTS.join(', ×')} : on en ouvre un), ${SLOTS_FREE_SPINS} tours gratuits, un vol d’Icare à la hauteur de la mise, et le JACKPOT : la cagnotte de la Maison, au prorata de la mise.`,
              en: `The wheel: ×2 to ×20 the stake, the chests (×${SLOTS_CHESTS.join(', ×')}: you open one), ${SLOTS_FREE_SPINS} free spins, an Icarus flight matching the stake, and the JACKPOT: the House pot, pro rata of the stake.`
            })}
          </p>
          <ul className="stage-help-list">
            {stakes.map((s) => (
              <li key={s.id}><b>{tr(s.label)}</b> : {tr({ fr: 'vol', en: 'flight' })} {flightLabel(s.id)} · JACKPOT {Math.round(potRakeShare(s.faveur * effMult) * 100)} %</li>
            ))}
          </ul>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter la machine', en: 'Leave the machine' })}>✕</button>
      </div>

      <div ref={boxRef} className="ptable slots-ptable" style={{ height: SCENE_H * k }}>
        {scene && (
          <canvas ref={cvRef} className="ptable-art" width={scene.back.w} height={scene.back.h} style={{ width: scene.back.w * k, height: scene.back.h * k }} aria-hidden="true" />
        )}
        {scene && (
          <div className="ptable-layer">
            <div className="ptable-hud">
              {history.length > 0 && (
                <div className="slots-history" aria-label={tr({ fr: 'Derniers tours', en: 'Last spins' })}>
                  {history.map((h, i) => (
                    <span key={`${h}-${i}`} className={`slots-chip is-${h}`}>
                      {h === 'gain' ? '✓' : h === 'tours' ? '★' : h === 'roue' ? '◎' : '·'}
                    </span>
                  ))}
                </div>
              )}
              <CoffreSelect value={effMult} onChange={setCoffreMult} />
            </div>

            {/* Le levier : on le tire. */}
            <button
              type="button"
              className="slots-lever"
              style={leverBox}
              disabled={!canPull}
              onClick={onPull}
              aria-label={tr({ fr: 'Tirer le levier', en: 'Pull the lever' })}
            />

            {/* Le compteur, sur le mur à droite de la machine : la série, le dernier gain. */}
            <div className="slots-hud" style={{ left: (scene.win.x + scene.win.w + 46) * k }}>
              {series && (
                <span className="slots-series">
                  ★ {series.total - series.left}/{series.total} · +{fmt(series.won)}
                </span>
              )}
              {phase === 'show' && lastWin > 0 && <span className="slots-win">+{fmt(lastWin)} <FaveurIcon /></span>}
              {phase === 'show' && outcome && outcome.freeSpinsWon > 0 && <span className="slots-win">★ +{outcome.freeSpinsWon}</span>}
            </div>

            {/* Les mises, posées sur le sol à gauche ; le bouton sous la mise choisie. */}
            {!fs && stakes.map((s, i) => {
              const cost = s.faveur * effMult;
              return (
                <TableStake
                  key={s.id}
                  x={stakeXs[i]}
                  y={(SCENE_H - 36) * k}
                  art={stakeArtUrl(s.id)}
                  label={tr(s.label)}
                  cost={<><FaveurIcon /> {fmt(cost)}</>}
                  chosen={chosenStake === s.id}
                  broke={(state.faveur || 0) < cost}
                  onPick={() => setChosenStake(s.id)}
                  tip={tipProps(tr(s.label), null)}
                  play
                  playLabel={tr({ fr: 'Tirer', en: 'Pull' })}
                  playDisabled={!canPull}
                  onPlay={onPull}
                />
              );
            })}
            {fs && (
              <div className="slots-free" style={{ left: stakeXs[1] }}>
                <button type="button" className="scratch-buy" disabled={busy} onClick={onPull}>
                  {tr({ fr: `Tour gratuit (${fs.left})`, en: `Free spin (${fs.left})` })}
                </button>
              </div>
            )}

            {/* LA ROUE, par-dessus la machine. */}
            {wheelState && (
              <div className="slots-wheel" style={{ left: machineX, top: 6 * k }}>
                <canvas
                  ref={wheelCvRef}
                  width={WHEEL_SIZE}
                  height={WHEEL_SIZE}
                  className="slots-wheel-art"
                  style={{ width: WHEEL_SIZE * k, height: WHEEL_SIZE * k, cursor: phase === 'wheel' ? 'pointer' : 'default' }}
                  onClick={spinWheel}
                  aria-label={tr({ fr: 'Lancer la roue', en: 'Spin the wheel' })}
                />
                <span className="slots-wheel-pointer" aria-hidden="true" />
                {phase === 'wheel' && (
                  <button type="button" className="scratch-buy slots-wheel-go" onClick={spinWheel}>{tr({ fr: 'Lancer la roue', en: 'Spin the wheel' })}</button>
                )}
                {phase === 'chests' && wr && (
                  <div className="slots-chests">
                    {[0, 1, 2].map((i) => (
                      <button key={i} type="button" className="slots-chest" onClick={() => pickChest(i)} aria-label={tr({ fr: `Coffre ${i + 1}`, en: `Chest ${i + 1}` })}>
                        <img src={chestUrl(band, false)} alt="" width={22 * k} height={18 * k} />
                      </button>
                    ))}
                  </div>
                )}
                {phase === 'wheelDone' && wr && (
                  <div className="slots-wheel-result">
                    {wr.segment === 'coffres' && (
                      <div className="slots-chests is-open">
                        {wr.chests.map((v, i) => (
                          <span key={i} className={`slots-chest${i === wr.chestPick ? ' is-picked' : ''}`}>
                            <img src={chestUrl(band, true)} alt="" width={22 * k} height={18 * k} />
                            <b>×{v}</b>
                          </span>
                        ))}
                      </div>
                    )}
                    <strong className={wr.jackpotFaveur > 0 ? 'is-jackpot' : ''}>
                      {wr.jackpotFaveur > 0 ? <>JACKPOT +{fmt(wr.jackpotFaveur)} <FaveurIcon /></>
                        : wr.freeSpins ? <>★ +{wr.freeSpins} {tr({ fr: 'tours gratuits', en: 'free spins' })}</>
                          : wr.segment === 'vol' ? (wr.flight ? <>🪽 {tr({ fr: 'Vol d’Icare offert', en: 'Free Icarus flight' })}</> : <>🪽 —</>)
                            : wr.segment === 'jackpot' ? <>JACKPOT +0</>
                              : <>+{fmt(wr.faveurGain)} <FaveurIcon /></>}
                    </strong>
                    <button type="button" onClick={closeWheel}>{tr({ fr: 'Continuer', en: 'Continue' })}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
