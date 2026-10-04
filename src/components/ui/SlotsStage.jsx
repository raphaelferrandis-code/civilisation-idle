import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import { icarusPotFaveur } from '../../game/core/actions.js';
import { spinSlots, slotsFreeSpins, slotsJackpots, SLOTS_CELLS } from '../../game/core/actions/slots.js';
import { SLOTS_REELS, SLOTS_WHEEL, SLOTS_PAY, SLOTS_LINES, SLOTS_FREE_SPINS, SLOTS_FREE_MULT, SLOTS_CHESTS, SLOTS_HW } from '../../game/core/balance.js';
import { potRakeShare } from '../../game/core/actions/templePot.js';
import { tableLimits } from '../../game/core/actions/maisonTable.js';
import { bakeSlotsScene, paintReels, paintLive, paintHold, paintWinCells, lancerPieces, avancerPieces, paintPieces, wheelRaster, chestRaster, symbolRaster, slotsLook, SLOT_CELL, SCENE_H, WHEEL_SIZE } from '../../game/map/iso/plaisirsSlotsArt.js';
// Les bruitages (v2, 2026-10-03 : « commence par le son ») — joués par le code.
import { sonSlots, ronronSlots, prechaufferSons } from '../../game/audio/slotsSound.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon, PotIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
import StageHelp from './StageHelp.jsx';
import { usePlaisirsBand } from './plaisirsMaterial.js';
import { PancarteFermee } from '../views/plaisirs/PlaisirsTable.jsx';
import TableMise from '../views/plaisirs/TableMise.jsx';
import { initialStake, rememberStake, fmtMise } from '../views/plaisirs/miseMemory.js';
import { tablesFermees } from '../views/plaisirs/fermeture.js';
import '../../styles/plaisirs-tables.css';
import '../../styles/plaisirs-slots.css';

/**
 * LA MACHINE À SOUS (2026-10-03, demande de Raph : « avec des bonus type free spin et
 * mini jeux, qui déclenche une roue » ; v2 : « 5 rouleaux, joker et Hold & Win »).
 * Moteur : game/core/actions/slots.js (+ slotsMath.js) ; dessin : iso/plaisirsSlotsArt.js
 * (fonte, néon, cosmique) ; bruitages : game/audio/slotsSound.js.
 *
 * Le moteur tire les ARRÊTS des rouleaux, la case de la roue et tout le Hold & Win dès la
 * mise ; chaque effet attend sa révélation (apply différé) : les rouleaux tournent et
 * s'arrêtent l'un après l'autre (ils TRAÎNENT quand deux étoiles, deux roues ou quatre
 * pièces sont déjà là), les lignes gagnantes s'allument une à une, le Hold & Win se
 * rejoue relance par relance, la roue se lance d'un clic, les coffres se choisissent. Les
 * tours gratuits s'enchaînent seuls. Fermer la machine encaisse ce qui reste en suspens.
 *
 * ⛔ Pas une phrase à l'écran : des valeurs ; les règles sont dans l'aide « ? ».
 */
const SCENE_K = 3;
const N = SLOTS_REELS.length;
const toCanvas = (R) => {
  const cv = document.createElement('canvas');
  cv.width = R.w; cv.height = R.h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(R.data), R.w, R.h), 0, 0);
  return cv;
};
const artUrl = new Map();
function cachedUrl(key, make) {
  if (typeof document === 'undefined') return null;
  if (!artUrl.has(key)) artUrl.set(key, toCanvas(make()).toDataURL());
  return artUrl.get(key);
}
const chestUrl = (band, open) => cachedUrl('chest|' + band + '|' + open, () => chestRaster(band, open));
const symbolUrl = (id, band) => cachedUrl(id + '|' + band, () => symbolRaster(id, band));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const GAP = 240, TEASE = 900;                           // ms entre deux arrêts ; l'arrêt qui traîne
// La COURSE d'un rouleau (polissage du 2026-10-04 : « beaux, fluides et agréables ») : il
// prend un ÉLAN (remonte d'un quart de case), accélère vite, file à vitesse constante,
// freine, et cogne son cran (un petit rebond). `course(u)` : la part du chemin faite.
const ELAN = 140, REBOND = 220;
const A_ = 0.12, C_ = 0.6, AIRE = A_ / 2 + (C_ - A_) + (1 - C_) / 3;
const course = (u) => {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < A_) return (u * u) / (2 * A_) / AIRE;
  if (u < C_) return (A_ / 2 + (u - A_)) / AIRE;
  const w = (u - C_) / (1 - C_);
  return (A_ / 2 + (C_ - A_) + ((1 - C_) / 3) * (1 - Math.pow(1 - w, 3))) / AIRE;
};
// Le LEVIER : on l'abaisse (accéléré), il remonte sur son ressort et dépasse un peu.
const levier = (t) => (t < 140 ? (t / 140) ** 2 : t > 1100 ? 0 : Math.exp(-(t - 140) / 120) * Math.cos((t - 140) / 75));
// Lâché à mi-course (ou secoué quand on ne peut pas jouer) : il remonte seul sur son ressort.
const ressortLevier = (from, t) => (t > 700 ? 0 : from * Math.exp(-t / 110) * Math.cos(t / 70));
const LEVIER_SEUIL = 0.55;                              // tiré au-delà : la machine part
// La dernière mise jouée est gardée d'une ouverture à l'autre (miseMemory) : la machine
// s'ouvre PRÊTE (2026-10-04, Raph : « je ne peux pas essayer, ça ne marche pas » — sans
// mise choisie, le levier ne répondait pas et le bouton Tirer n'apparaissait pas).
// Les gros gains : leur bandeau, selon le multiple de la mise.
const bandeau = (x) => (x >= 50 ? { fr: 'MÉGA GAIN', en: 'MEGA WIN' } : x >= 25 ? { fr: 'ÉNORME GAIN', en: 'HUGE WIN' } : x >= 10 ? { fr: 'GROS GAIN', en: 'BIG WIN' } : null);

// Un montant qui DÉFILE jusqu'à sa valeur (écrit directement dans le DOM, image par image :
// pas un rendu React par image).
function CountUp({ value, dur = 900 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0, t0 = null;
    const step = (now) => {
      if (t0 === null) t0 = now;
      const u = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(Math.round(value * easeOut(u)));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return <span ref={ref}>{fmt(0)}</span>;
}

export default function SlotsStage({ table, onClose }) {
  const band = usePlaisirsBand();
  useGameState((s) => s.instability);                 // solde, cagnotte, tours vivants (1 Hz)
  // LA MISE LIBRE (lot 1 des gains « vrai casino ») : des jetons, toutes lignes comprises.
  const [stake, setStake] = useState(() => initialStake('machines', state.faveur || 0));
  const { max: tableMax } = tableLimits();
  const fs = slotsFreeSpins();
  const pot = icarusPotFaveur();
  const look = slotsLook(band);
  // Les sons de l'habit se rendent à l'avance, un par un, pas au premier tour.
  useEffect(() => prechaufferSons(look), [look]);

  // La scène : le cadre, son pas entier (k), la largeur native qui le remplit. La machine
  // se tient aux 3/5 : les mises ont leur place au sol, à gauche.
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
  const k = boxW && boxW < 620 ? 2 : SCENE_K;
  const W = boxW ? Math.ceil(boxW / k) : 0;
  const cxFrac = W * k >= 820 ? 0.6 : 0.5;
  const scene = useMemo(() => (W ? bakeSlotsScene(band, W, cxFrac) : null), [band, W, cxFrac]);

  // Ce qui tourne : positions des rouleaux (en cases), flou, levier, lignes, Hold & Win.
  const anim = useRef({ pos: [1, 4, 7, 2, 5], blur: [0, 0, 0, 0, 0], pull: 0, lines: [], win: false, hold: null, timers: [], coins: [], last: 0 });
  const [fete, setFete] = useState(null);              // le bandeau d'un gros gain : { label, value, key }
  const feteKey = useRef(0);
  const [phase, setPhase] = useState('idle');          // idle | spin | show | hold | holdDone | wheel | wheelSpin | wheelDone | chests
  const [outcome, setOutcome] = useState(null);
  const [holdView, setHoldView] = useState(null);      // { respins, total, done, hw }
  const [wheelState, setWheelState] = useState(null);  // { res, angle, done }
  const pending = useRef({ spin: null, hold: null, wheel: null });

  // Fermer la machine (ou la rouvrir) encaisse ce qui attend.
  useEffect(() => () => {
    if (pending.current.spin) pending.current.spin.apply();
    if (pending.current.hold) pending.current.hold.apply();
    if (pending.current.wheel) pending.current.wheel.apply(0);
  }, [table.openedAt]);
  useEffect(() => () => {
    const a = anim.current;
    a.timers.forEach(clearTimeout);
    clearTimeout(a.freeTimer);
    if (a.ronron) { a.ronron.stop(); a.ronron = null; }
  }, []);
  const later = (fn, ms) => { anim.current.timers.push(setTimeout(fn, ms)); };

  // ── LE DESSIN : une boucle qui ne peint que ce qui bouge (20 i/s au repos : les
  // ampoules ; 60 pendant que les rouleaux tournent). ⚠ Le Chrome de Raph rend en
  // logiciel : la scène reste petite (≈ 330×164 px natifs) et un seul putImageData.
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !scene) return undefined;
    const g = cv.getContext('2d');
    const R = { w: scene.back.w, h: scene.back.h, data: new Uint8ClampedArray(scene.back.data.length) };
    let raf = 0, last = 0, alive = true;
    const frame = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const a = anim.current, busy = a.spinning || a.pull !== 0 || a.drag || a.ressort || (a.hold && (a.hold.spinning || a.hold.dropping)) || a.coins.length > 0;
      if (!busy && now - last < 50) return;
      const dt = Math.min(0.05, (now - (a.last || now)) / 1000);
      a.last = now;
      last = now;
      if (a.step) a.step(now);
      else if (a.ressort) {
        // Le levier lâché remonte seul.
        if (a.ressort.t0 === null) a.ressort.t0 = now;
        const u = now - a.ressort.t0;
        a.pull = ressortLevier(a.ressort.from, u);
        if (u > 700) a.ressort = null;
      }
      if (a.hold && a.hold.drops) a.hold.dropping = [...a.hold.drops.values()].some((d) => now / 1000 - d < 0.45);
      R.data.set(scene.back.data);
      if (a.hold) paintHold(R, scene, a.hold, band, now / 1000);
      else paintReels(R, scene, SLOTS_REELS, a.pos, band, a.blur);
      paintLive(R, scene, now / 1000, a.pull, a.win);
      // Les lignes gagnantes, UNE À LA FOIS (vingt lignes ensemble ne se lisent plus) :
      // le tracé, et un cadre autour des symboles qui paient.
      if (!a.hold && a.lines.length) {
        const L = a.lines[Math.floor(now / 750) % a.lines.length], ln = SLOTS_LINES[L.line];
        const put = (x, y, c) => { const q = (y * R.w + x) * 4; R.data[q] = c[0]; R.data[q + 1] = c[1]; R.data[q + 2] = c[2]; R.data[q + 3] = 255; };
        const gold = [255, 216, 74];
        for (let r = 0; r < N - 1; r += 1) {
          const x = scene.reelX[r] + SLOT_CELL / 2, y = scene.win.y + ln[r] * SLOT_CELL + SLOT_CELL / 2;
          const nx = scene.reelX[r + 1] + SLOT_CELL / 2, ny = scene.win.y + ln[r + 1] * SLOT_CELL + SLOT_CELL / 2;
          const steps = Math.max(1, Math.abs(nx - x), Math.abs(ny - y));
          for (let s = 0; s <= steps; s += 1) { const px = Math.round(x + ((nx - x) * s) / steps), py = Math.round(y + ((ny - y) * s) / steps); put(px, py, gold); put(px, py + 1, gold); }
        }
        paintWinCells(R, scene, Array.from({ length: L.count }, (_, r) => [r, ln[r]]), now / 1000);
      }
      // La pluie de pièces des gros gains.
      if (a.coins.length) { a.coins = avancerPieces(a.coins, dt, scene.back.h - 4); paintPieces(R, a.coins, look); }
      g.putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [scene, band, look]);

  // Un GROS moment : la pluie de pièces et, au-delà de ×10 la mise, le bandeau.
  const fete_ = (gain, stakeFaveur, label = null, pieces = 0) => {
    const x = gain / Math.max(1, stakeFaveur);
    const b = label || bandeau(x);
    const n = pieces || (b ? Math.min(70, 24 + Math.round(x)) : 0);
    if (n && scene) anim.current.coins = anim.current.coins.concat(lancerPieces(scene, n));
    if (b) { feteKey.current += 1; setFete({ label: b, value: gain, key: feteKey.current }); later(() => setFete(null), 2800); }
  };

  // On ne peut pas jouer (mise trop chère, machine occupée, crise) : le levier cogne en
  // butée et remonte, un clac sourd. Pas une phrase.
  const refuser = () => {
    const a = anim.current;
    if (a.step) return;
    a.ressort = { from: Math.max(0.18, a.pull), t0: null };
    sonSlots('tic', look, 0.6);
  };

  // ── UN TOUR ──────────────────────────────────────────────────────────────────
  const phaseRef = useRef('idle');
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const startSpin = (amount, tire = false) => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'show') return;
    phaseRef.current = 'spin';
    if (pending.current.spin) { pending.current.spin.apply(); pending.current.spin = null; }
    const res = spinSlots(amount, { defer: true });
    if (!res) { phaseRef.current = 'show'; refuser(); return; }
    if (!res.free) rememberStake('machines', res.stakeFaveur);
    // Le levier tiré à la main part d'où la main l'a laissé.
    const p0 = tire ? anim.current.pull : 0;
    anim.current.ressort = null;
    pending.current.spin = res;
    pending.current.hold = res.holdWin || null;
    pending.current.wheel = res.wheel || null;
    setOutcome(res);
    setPhase('spin');
    const a = anim.current;
    a.lines = []; a.win = false; a.spinning = true; a.hold = null;
    sonSlots('levier', look);
    if (a.ronron) a.ronron.stop();
    a.ronron = ronronSlots(look);
    // Les arrêts : l'un après l'autre ; un rouleau TRAÎNE si ceux d'avant montrent déjà deux
    // étoiles, deux roues ou quatre pièces (le suspense des vraies machines).
    const vu = (r, sym) => res.grid.slice(0, r).reduce((n, col) => n + col.filter((s) => s === sym).length, 0);
    const stopAt = [], traine = [];
    for (let r = 0; r < N; r += 1) {
      const t = r > 0 && (vu(r, 'etoile') >= 2 || vu(r, 'roue') >= 2 || vu(r, 'piece') >= 4);
      traine.push(t);
      stopAt.push(r === 0 ? 800 : stopAt[r - 1] + (t ? TEASE : GAP));
    }
    const cell = a.pos.map((p) => Math.floor(p + 0.5)), arrete = new Array(N).fill(false);
    let tPrev = null, tensionVue = -1, t0 = null;
    const start = a.pos.slice();
    const target = SLOTS_REELS.map((reel, r) => {
      const n = reel.length, cur = ((start[r] % n) + n) % n;
      // Les rouleaux DESCENDENT : la position décroît jusqu'à l'arrêt tiré.
      return start[r] - ((cur - res.stops[r] + n) % n) - n * (3 + r);
    });
    a.step = (now) => {
      if (t0 === null) t0 = now;                           // l'horloge part à la première image
      const t = now - t0;
      a.pull = t < 140 ? p0 + (1 - p0) * levier(t) : levier(t);
      let moving = t < 1100, vit = 0, tournent = 0;
      for (let r = 0; r < N; r += 1) {
        const u = Math.min(1, Math.max(0, (t - ELAN) / (stopAt[r] - ELAN)));
        const prev = a.pos[r];
        // L'élan (la bande remonte un peu), la course, puis le rebond du cran à l'arrêt.
        const elan = t < ELAN ? 0.28 * Math.sin((Math.PI * t) / ELAN) : 0;
        const s2 = t - stopAt[r], cran = s2 > 0 && s2 < REBOND ? -0.2 * Math.sin((Math.PI * s2) / REBOND) * (1 - s2 / REBOND) : 0;
        a.pos[r] = start[r] + (target[r] - start[r]) * course(u) + elan + cran;
        a.blur[r] = Math.min(6, Math.round(Math.abs(a.pos[r] - prev) * SLOT_CELL * 0.5));
        if (s2 < REBOND) moving = true;
        const dt = tPrev === null ? 16 : Math.max(1, t - tPrev), v = (Math.abs(a.pos[r] - prev) * 1000) / dt;
        if (u < 1) { moving = true; vit += v; tournent += 1; }
        // Le SON : un tic par symbole quand il ralentit, le clac de l'arrêt.
        const c = Math.floor(a.pos[r] + 0.5);
        if (c !== cell[r] && u < 1 && v < 22) sonSlots('tic', look, Math.min(1, 0.45 + (22 - v) / 30));
        cell[r] = c;
        if (u >= 1 && !arrete[r]) {
          arrete[r] = true;
          sonSlots('arret', look);
          // Le rouleau suivant va traîner : la tension.
          if (r + 1 < N && traine[r + 1] && tensionVue < r + 1) { tensionVue = r + 1; sonSlots('tension', look); }
        }
      }
      if (a.ronron) a.ronron.vitesse(Math.min(1, (tournent ? vit / tournent : 0) / 40));
      tPrev = t;
      if (moving) return;
      a.pull = 0;
      a.pos = target.map((p, r) => ((p % SLOTS_REELS[r].length) + SLOTS_REELS[r].length) % SLOTS_REELS[r].length);
      a.blur = new Array(N).fill(0);
      a.spinning = false;
      a.step = null;
      res.apply();
      pending.current.spin = null;
      a.lines = res.lines.map((l) => ({ line: l.line, count: l.count }));
      a.win = res.faveurGain > 0 || res.freeSpinsWon > 0 || !!res.wheel || !!res.holdWin;
      if (a.ronron) { a.ronron.stop(); a.ronron = null; }
      if (res.holdWin) { sonSlots('roue', look); later(() => startHold(res), 900); setPhase('hold'); return; }
      if (res.wheel) sonSlots('roue', look);
      else if (res.freeSpinsWon > 0) sonSlots('tours', look);
      else if (res.faveurGain > 0) {
        const x = res.faveurGain / Math.max(1, res.stakeFaveur);
        sonSlots(x >= 10 ? 'gain3' : x >= 2 ? 'gain2' : 'gain1', look);
        fete_(res.faveurGain, res.stakeFaveur);
      }
      afterBonuses(res);
    };
  };
  // Ce qui suit le tour (ou son Hold & Win) : la roue, sinon le tour suivant.
  const afterBonuses = (res) => {
    // La roue attend encore si personne ne l'a encaissée (pending.wheel).
    if (res.wheel && pending.current.wheel === res.wheel) { setWheelState({ res: res.wheel, angle: 0, done: false }); setPhase('wheel'); return; }
    setPhase('show');
    phaseRef.current = 'show';
    nextFree(1100);
  };

  // Les tours gratuits s'enchaînent seuls : le suivant se programme à la FIN d'un tour (ou
  // d'un bonus), jamais au rendu — la vue se redessine à 1 Hz, un minuteur relancé à chaque
  // rendu ne partirait jamais.
  const nextFree = (delay) => {
    clearTimeout(anim.current.freeTimer);
    if (!slotsFreeSpins()) return;
    anim.current.freeTimer = setTimeout(() => startSpin(0), delay);
  };

  // ── LE HOLD & WIN, rejoué relance par relance ───────────────────────────────
  const startHold = (res) => {
    const hw = res.holdWin, a = anim.current;
    const cells = new Array(SLOTS_CELLS).fill(null);
    for (const c of hw.initial) cells[c] = hw.board[c];
    a.lines = [];
    a.hold = { cells, fresh: new Set(hw.initial), drops: new Map(), spinning: false };
    let respins = SLOTS_HW.respins, total = hw.initial.reduce((s, c) => s + hw.board[c].v, 0);
    setHoldView({ respins, total, done: false, hw });
    let at = 900;
    hw.rounds.forEach((round) => {
      later(() => { a.hold.spinning = true; a.hold.fresh = new Set(); sonSlots('relance', look); }, at);
      at += 800;
      later(() => {
        a.hold.spinning = false;
        // Chaque pièce TOMBE dans sa case (décalées d'un souffle), et sonne en se posant.
        round.add.forEach((c, i) => {
          later(() => { cells[c] = hw.board[c]; a.hold.fresh.add(c); a.hold.drops.set(c, performance.now() / 1000); }, i * 110);
          later(() => sonSlots('atterrit', look), i * 110 + 260);
          total += hw.board[c].v;
        });
        respins = round.respins;
        setHoldView({ respins, total, done: false, hw });
      }, at);
      at += round.add.length ? 700 : 450;
    });
    later(() => {
      hw.apply();
      pending.current.hold = null;
      const x = hw.total;
      sonSlots(hw.full ? 'jackpot' : x >= 40 || hw.majeurs ? 'gain3' : 'gain2', look);
      fete_(hw.faveurGain + hw.grandFaveur, hw.stakeFaveur, hw.full ? { fr: 'GRAND JACKPOT', en: 'GRAND JACKPOT' } : null, hw.full ? 90 : 36);
      setHoldView({ respins: 0, total: hw.total, done: true, hw });
      setPhase('holdDone');
    }, at + 300);
  };
  const closeHold = () => {
    anim.current.hold = null;
    setHoldView(null);
    afterBonuses(outcome);
  };

  // ── LA ROUE ─────────────────────────────────────────────────────────────────
  const wheelAnim = useRef(null), pointerRef = useRef(null);
  useEffect(() => {
    const cv = wheelCvRef.current;
    if (!cv || !wheelState) return undefined;
    // `lit` : la case gagnante, qui reste allumée une fois la roue arrêtée.
    const lit = wheelState.lit ?? -1;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(wheelRaster(band, SLOTS_WHEEL, wheelState.angle, lit, 0.6, 1).data), WHEEL_SIZE, WHEEL_SIZE), 0, 0);
    return undefined;
  }, [wheelState, band]);

  const spinWheel = () => {
    if (!wheelState || phase !== 'wheel') return;
    setPhase('wheelSpin');
    const n = SLOTS_WHEEL.length, i = wheelState.res.index;
    // Où tombe le pointeur dans la case : varié, mais tiré de la roue elle-même (pas d'aléa
    // au rendu).
    const jitter = ((((i * 7919 + n * 31) % 97) / 97) - 0.5) * 0.6;
    const target = -((i + 0.5 + jitter) / n) * Math.PI * 2 - Math.PI * 2 * 5;
    const dur = 4200, from = wheelState.angle;
    let t0 = null;
    const cv = wheelCvRef.current, g = cv && cv.getContext('2d');
    let caseVue = null, picot = -1e9;
    const tick = (now) => {
      if (t0 === null) t0 = now;
      const u = Math.min(1, (now - t0) / dur), ang = from + (target - from) * easeOut(u);
      const tour = (((-ang) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), sousPointeur = Math.floor((tour / (Math.PI * 2)) * n);
      if (caseVue !== null && sousPointeur !== caseVue) { sonSlots('cliquet', look); picot = now; }
      caseVue = sousPointeur;
      // Le pointeur bat contre chaque picot, puis revient.
      if (pointerRef.current) pointerRef.current.style.transform = `translateX(-50%) rotate(${-18 * Math.max(0, 1 - (now - picot) / 110)}deg)`;
      if (g) g.putImageData(new ImageData(new Uint8ClampedArray(wheelRaster(band, SLOTS_WHEEL, ang).data), WHEEL_SIZE, WHEEL_SIZE), 0, 0);
      if (u < 1) { wheelAnim.current = requestAnimationFrame(tick); return; }
      const w = wheelState.res;
      allumer(ang, i);
      // La roue garde son angle d'arrêt (sinon, au choix d'un coffre, elle revenait d'un
      // coup à sa position de départ).
      if (w.segment === 'coffres') { setWheelState({ ...wheelState, angle: ang, lit: i }); setPhase('chests'); return; }
      w.apply();
      pending.current.wheel = null;
      sonSlots(w.jackpotFaveur > 0 ? 'jackpot' : w.freeSpins ? 'tours' : w.segment === 'vol' ? 'vol' : typeof w.segment === 'number' && w.segment >= 10 ? 'gain3' : 'gain2', look);
      if (w.jackpotFaveur > 0) fete_(w.jackpotFaveur, w.stakeFaveur, { fr: 'GRAND JACKPOT', en: 'GRAND JACKPOT' }, 90);
      else if (w.faveurGain > 0) fete_(w.faveurGain, w.stakeFaveur);
      setWheelState({ ...wheelState, angle: ang, lit: i, done: true });
      setPhase('wheelDone');
    };
    wheelAnim.current = requestAnimationFrame(tick);
  };
  // La case gagnante s'allume, quelques battements, puis reste éclairée.
  const allumer = (ang, idx) => {
    const cv = wheelCvRef.current, g = cv && cv.getContext('2d');
    if (!g) return;
    let t0 = null;
    const beat = (now) => {
      if (t0 === null) t0 = now;
      const u = (now - t0) / 1400, pulse = u < 1 ? 0.5 + 0.5 * Math.sin(u * Math.PI * 9) : 0.6;
      g.putImageData(new ImageData(new Uint8ClampedArray(wheelRaster(band, SLOTS_WHEEL, ang, idx, pulse, Math.min(1, u * 4)).data), WHEEL_SIZE, WHEEL_SIZE), 0, 0);
      if (u < 1) wheelAnim.current = requestAnimationFrame(beat);
    };
    wheelAnim.current = requestAnimationFrame(beat);
  };
  useEffect(() => () => cancelAnimationFrame(wheelAnim.current), []);

  const pickChest = (i) => {
    if (phase !== 'chests' || !wheelState) return;
    wheelState.res.apply(i);
    pending.current.wheel = null;
    sonSlots('coffre', look);
    const v = wheelState.res.chests[i];
    later(() => { sonSlots(v >= 20 ? 'gain3' : v >= 6 ? 'gain2' : 'gain1', look); fete_(wheelState.res.faveurGain, wheelState.res.stakeFaveur); }, 450);
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
  const busy = phase !== 'idle' && phase !== 'show';
  // La crise terminale ferme les tables (comme tous les jeux de la Maison).
  const fermee = tablesFermees();
  const canPull = !busy && !fermee && (fs || (stake > 0 && (state.faveur || 0) >= stake));
  // `tire` : le levier a été abaissé à la main (sinon il part seul : clic, Tirer, clavier).
  const onPull = (tire) => { if (canPull) startSpin(fs ? 0 : stake, tire === true); else refuser(); };

  // LE LEVIER À LA MAIN : on l'attrape et on l'abaisse ; lâché au-delà de LEVIER_SEUIL, la
  // machine part ; avant, il remonte. Un simple clic le fait partir seul.
  const prise = useRef(null);                          // { id, y, moved }
  const courseLevier = scene ? (scene.lever.y1 + 14 - scene.lever.y0) * k : 1;
  const leverDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (!canPull) { refuser(); return; }
    // Le levier garde la main même si elle sort de sa zone en descendant.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    prise.current = { id: e.pointerId, y: e.clientY, moved: 0 };
    anim.current.ressort = null;
    anim.current.drag = true;
  };
  const leverMove = (e) => {
    const d = prise.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    d.moved = Math.max(d.moved, Math.abs(dy));
    anim.current.pull = Math.max(0, Math.min(1, dy / courseLevier));
  };
  const leverUp = (e) => {
    const d = prise.current;
    if (!d || d.id !== e.pointerId) return;
    prise.current = null;
    const a = anim.current, p = a.pull;
    a.drag = false;
    if (d.moved < 6) { a.pull = 0; onPull(); return; }
    if (p >= LEVIER_SEUIL) { onPull(true); return; }
    a.ressort = { from: p, t0: null };
  };
  const leverCancel = () => {
    if (!prise.current) return;
    prise.current = null;
    anim.current.drag = false;
    anim.current.ressort = { from: anim.current.pull, t0: null };
  };
  const series = fs || (state.slotsFreeSpins && state.slotsFreeSpins.left === 0 && phase === 'show' && outcome && outcome.free ? state.slotsFreeSpins : null);
  const lastWin = outcome && phase === 'show' ? outcome.faveurGain : 0;
  const history = (state.slotsHistory || []).slice(-8).reverse();
  const wr = wheelState && wheelState.res;
  const machineX = scene ? (scene.win.x + scene.win.w / 2) * k : 0;
  const leverBox = scene ? { left: (scene.lever.x - 5) * k, top: (scene.lever.y0 - 5) * k, width: 12 * k, height: (scene.lever.y1 - scene.lever.y0 + 10) * k } : null;
  // Les mises, sur le sol de la salle à gauche de la machine.
  const leftRoom = scene ? (scene.win.x - 26) * k : 0;
  const stakeXs = scene ? [0.2, 0.5, 0.8].map((f) => Math.round(f * Math.max(240, leftRoom))) : [];
  const jpStake = fs ? fs.stakeFaveur : outcome && phase !== 'idle' ? outcome.stakeFaveur : stake;
  const jp = slotsJackpots(jpStake);
  const coinsJp = SLOTS_HW.values.filter((c) => c.jp);

  return (
    <div className="slots-stage">
      <div className="regul-block-title stage-title">
        <span className="slots-stage-pot" {...tipProps(tr({ fr: 'La cagnotte de la Maison', en: 'The House pot' }), null)}>
          <PotIcon /> <strong>{fmt(pot)}</strong>
        </span>
        <StageHelp>
          <p>
            {tr({
              fr: 'Cinq rouleaux, vingt lignes. Une ligne paie trois, quatre ou cinq symboles identiques alignés depuis la gauche ; le joker remplace n’importe quel symbole qui paie. Les gains sont des multiples de la mise.',
              en: 'Five reels, twenty lines. A line pays three, four or five matching symbols lined up from the left; the joker stands in for any paying symbol. Winnings are multiples of the stake.'
            })}
          </p>
          <div className="slots-paytable">
            {Object.entries(SLOTS_PAY).map(([sym, p]) => (
              <span key={sym} className="slots-pay">
                <img src={symbolUrl(sym, band)} alt="" width={16} height={16} /> <b>×{p[3]} · ×{p[4]} · ×{p[5]}</b>
              </span>
            ))}
            <span className="slots-pay"><img src={symbolUrl('joker', band)} alt="" width={16} height={16} /> <b>{tr({ fr: 'joker', en: 'joker' })}</b></span>
          </div>
          <div className="slots-paytable">
            <span className="slots-pay"><img src={symbolUrl('etoile', band)} alt="" width={16} height={16} />×3/4/5 <b>{SLOTS_FREE_SPINS.slice(3).join(' / ')} {tr({ fr: 'tours', en: 'spins' })} ×{SLOTS_FREE_MULT}</b></span>
            <span className="slots-pay"><img src={symbolUrl('roue', band)} alt="" width={16} height={16} />×3 <b>{tr({ fr: 'la roue', en: 'the wheel' })}</b></span>
            <span className="slots-pay"><img src={symbolUrl('piece', band)} alt="" width={16} height={16} />×{SLOTS_HW.trigger} <b>Hold & Win</b></span>
          </div>
          <p>
            {tr({
              fr: `Hold & Win : les pièces se figent, ${SLOTS_HW.respins} relances, chaque nouvelle pièce les recharge. Chaque pièce vaut ×1 à ×10 la mise, ou le MINI (×${coinsJp[0].v}) ou le MAJEUR (×${coinsJp[1].v}). Les quinze cases remplies : le GRAND, la cagnotte de la Maison au prorata de la mise.`,
              en: `Hold & Win: the coins lock, ${SLOTS_HW.respins} respins, each new coin resets them. Each coin is worth ×1 to ×10 the stake, or the MINI (×${coinsJp[0].v}) or the MAJOR (×${coinsJp[1].v}). All fifteen cells filled: the GRAND, the House pot pro rata of the stake.`
            })}
          </p>
          <p>
            {tr({
              fr: `La roue : ×2 à ×20 la mise, les coffres (×${SLOTS_CHESTS.join(', ×')} : on en ouvre un), des tours gratuits, un vol d’Icare à ta mise, et le GRAND.`,
              en: `The wheel: ×2 to ×20 the stake, the chests (×${SLOTS_CHESTS.join(', ×')}: you open one), free spins, an Icarus flight at your stake, and the GRAND.`
            })}
          </p>
          <p>
            {tr({
              fr: `La mise est libre, toutes lignes comprises, jusqu'à la limite de la table (${fmtMise(tableMax)}). Le GRAND emporte une part de la cagnotte au prorata de la mise : ${Math.round(potRakeShare(stake) * 100)} % à ta mise actuelle, tout à la mise maximale. La machine rend 92 % sur la durée.`,
              en: `The stake is free, all lines included, up to the table limit (${fmtMise(tableMax)}). The GRAND takes a share of the pot pro rata of the stake: ${Math.round(potRakeShare(stake) * 100)}% at your current stake, all of it at the maximum stake. The machine returns 92% over time.`
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter la machine', en: 'Leave the machine' })}>✕</button>
      </div>

      <div ref={boxRef} className={`ptable slots-ptable${fermee ? ' is-fermee' : ''}`} style={{ height: SCENE_H * k }}>
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
                      {h === 'gain' ? '✓' : h === 'tours' ? '★' : h === 'roue' ? '◎' : h === 'pieces' ? '●' : '·'}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Le levier : on l'attrape et on le tire (ou un clic, ou Entrée). */}
            <button
              type="button"
              className="slots-lever"
              style={leverBox}
              aria-disabled={!canPull}
              onPointerDown={leverDown}
              onPointerMove={leverMove}
              onPointerUp={leverUp}
              onPointerCancel={leverCancel}
              onLostPointerCapture={leverCancel}
              onClick={(e) => { if (e.detail === 0) onPull(); }}
              aria-label={tr({ fr: 'Tirer le levier', en: 'Pull the lever' })}
              {...(fermee ? tipProps(tr({ fr: 'Machine fermée', en: 'Machine closed' }), tr({ fr: 'La crise terminale ferme les tables de la Maison.', en: 'The terminal crisis closes the House tables.' })) : {})}
            />

            {/* Au mur, à droite : l'échelle des jackpots (pour la mise en jeu), la série, le gain. */}
            <div className="slots-hud" style={{ left: (scene.win.x + scene.win.w + 30) * k }}>
              <span className="slots-jp is-grand">GRAND <b>{fmt(jp.grand)}</b></span>
              <span className="slots-jp is-majeur">{tr({ fr: 'MAJEUR', en: 'MAJOR' })} <b>{fmt(jp.majeur)}</b></span>
              <span className="slots-jp is-mini">MINI <b>{fmt(jp.mini)}</b></span>
              {series && (
                <span className="slots-series">★ {series.total - series.left}/{series.total} · +{fmt(series.won)}</span>
              )}
              {holdView && <span className="slots-series">↻ {holdView.respins} · +{fmt(Math.round(holdView.total * holdView.hw.stakeFaveur))}</span>}
              {phase === 'show' && lastWin > 0 && <span className="slots-win" key={outcome.stops.join('-')}>+<CountUp value={lastWin} dur={lastWin >= 10 * outcome.stakeFaveur ? 1600 : 700} /> <FaveurIcon /></span>}
              {phase === 'show' && outcome && outcome.freeSpinsWon > 0 && <span className="slots-win">★ +{outcome.freeSpinsWon}</span>}
            </div>

            {/* La mise, en jetons sur le sol à gauche de la machine ; Tirer dessous. */}
            {!fs && (
              <TableMise
                game="machines"
                x={stakeXs[1]}
                y={(SCENE_H - 60) * k}
                k={k}
                rackX={stakeXs[1]}
                rackY={54}
                rackWidth={Math.max(220, leftRoom - 12)}
                stake={stake}
                onStake={setStake}
                faveur={state.faveur || 0}
                playLabel={tr({ fr: 'Tirer', en: 'Pull' })}
                playDisabled={!canPull}
                onPlay={onPull}
              />
            )}
            {fs && (
              <div className="slots-free" style={{ left: stakeXs[1] }}>
                <button type="button" className="scratch-buy" disabled={busy || fermee} onClick={onPull}>
                  {tr({ fr: `Tour gratuit (${fs.left})`, en: `Free spin (${fs.left})` })}
                </button>
              </div>
            )}

            {/* En crise terminale, la machine est FERMÉE (comme toutes les tables) : une
                pancarte pendue devant la vitre, plutôt qu'un levier qui ne répond pas
                (2026-10-04, Raph : « je clique il ne se passe rien »). */}
            {fermee && <PancarteFermee x={machineX} y={(scene.win.y + scene.win.h / 2) * k} />}

            {/* LE BANDEAU DES GROS GAINS : un mot, et le montant qui défile. */}
            {fete && (
              <div className="slots-bigwin" key={fete.key} style={{ left: machineX, top: (scene.win.y + 6) * k }} aria-live="polite">
                <span className="slots-bigwin-label">{tr(fete.label)}</span>
                <span className="slots-bigwin-value">+<CountUp value={fete.value} dur={1800} /> <FaveurIcon /></span>
              </div>
            )}

            {/* LE HOLD & WIN : son bandeau, puis son résultat. */}
            {holdView && (
              <div className="slots-hold" style={{ left: machineX, top: 4 * k }}>
                <span className="slots-hold-title">HOLD & WIN</span>
              </div>
            )}
            {holdView && holdView.done && (
              // Sous la fenêtre (sur la plaque des paiements) : la grille reste lisible.
              <div className="slots-wheel" style={{ left: machineX, top: (scene.win.y + scene.win.h + 2) * k }}>
                <div className="slots-wheel-result">
                  <strong className={holdView.hw.full ? 'is-jackpot' : ''}>
                    {holdView.hw.full ? <>GRAND +{fmt(holdView.hw.faveurGain + holdView.hw.grandFaveur)} <FaveurIcon /></>
                      : <>+{fmt(holdView.hw.faveurGain)} <FaveurIcon /></>}
                  </strong>
                  {(holdView.hw.minis > 0 || holdView.hw.majeurs > 0) && (
                    <span className="slots-hold-jp">
                      {holdView.hw.majeurs > 0 && <b className="is-majeur">{tr({ fr: 'MAJEUR', en: 'MAJOR' })}{holdView.hw.majeurs > 1 ? ` ×${holdView.hw.majeurs}` : ''}</b>}
                      {holdView.hw.minis > 0 && <b className="is-mini">MINI{holdView.hw.minis > 1 ? ` ×${holdView.hw.minis}` : ''}</b>}
                    </span>
                  )}
                  <button type="button" onClick={closeHold}>{tr({ fr: 'Continuer', en: 'Continue' })}</button>
                </div>
              </div>
            )}

            {/* LA ROUE, par-dessus la machine. */}
            {wheelState && <div className="slots-dim" aria-hidden="true" />}
            {wheelState && (
              <div className="slots-wheel" style={{ left: machineX, top: Math.max(6, (SCENE_H - WHEEL_SIZE) / 2 - 10) * k }}>
                <canvas
                  ref={wheelCvRef}
                  width={WHEEL_SIZE}
                  height={WHEEL_SIZE}
                  className="slots-wheel-art"
                  style={{ width: WHEEL_SIZE * k, height: WHEEL_SIZE * k, cursor: phase === 'wheel' ? 'pointer' : 'default' }}
                  onClick={spinWheel}
                  aria-label={tr({ fr: 'Lancer la roue', en: 'Spin the wheel' })}
                />
                <span ref={pointerRef} className="slots-wheel-pointer" aria-hidden="true" />
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
                      {wr.jackpotFaveur > 0 ? <>GRAND +{fmt(wr.jackpotFaveur)} <FaveurIcon /></>
                        : wr.freeSpins ? <>★ +{wr.freeSpins} {tr({ fr: 'tours gratuits', en: 'free spins' })}</>
                          : wr.segment === 'vol' ? (wr.flight ? <>🪽 {tr({ fr: 'Vol d’Icare offert', en: 'Free Icarus flight' })}</> : <>🪽 —</>)
                            : wr.segment === 'jackpot' ? <>GRAND +0</>
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
