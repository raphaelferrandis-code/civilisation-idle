// LA CHUTE SUR LA CARTE — le metteur en scène (docs/PLAN-CHUTE.md).
//
// Quand la cité tombe (events.js, runCollapseSequence), la chute se JOUE sur la
// carte au lieu d'un grisé de deux secondes :
//   1. LA VAGUE — du cœur vers les faubourgs, chaque bâtiment tremble puis cède sa
//      place à sa ruine dessinée, sous un nuage de poussière (iso/isoChuteScene.js).
//      Devant la vague, la ville se vide : passants, émeutiers, charrettes, étals,
//      guirlandes, braseros, réverbères, bêtes et linge. Le crépuscule du jeu tient
//      la lumière ; la caméra recule quand la vague est passée.
//   2. LA NUIT tombe sur les ruines, puis fondu au noir. Dans le noir : la stèle
//      (si un choix reste à faire), les ruines sont relevées (recordRelics) et le
//      cycle suivant est fondé — dans la MÊME vallée (crisis.js, completeCollapse).
//   3. LE LEVER — du noir, la nuit et le seul feu du campement au milieu des
//      ruines, puis l'aube. Les ruines restent ensuite sur la carte : chaque case
//      que la nouvelle cité bâtit efface la sienne (chuteCollect).
// Un clic ou Échap pendant la chute la mène directement au noir ; pendant le lever,
// à l'aube.
//
// ⚠ Rien ici ne touche la sauvegarde avant la stèle (invariant §1.3 d'events.js) :
// la chute ne lit l'état que pour dessiner, les ruines relevées attendent dans ce
// module que completeCollapse les prenne (takeCityRelics, via cityMapBridge).
import { CM, cmEngineHomeHidden } from '../layout.js';
import { state } from '../../core/state.js';
import { pixelHouseReady, pixelHouseRuin, houseRelicCanvas } from '../pixelHouses.js';
import { propRelicCanvas } from '../cityEngineSprites.js';
import { setChuteHandlers } from '../cityMapBridge.js';
import { isoFrontOffset } from './isoGroundDetail.js';
import { isoEngineSceneBox, isoEngineScenesFlag } from './isoEngineScene.js';
import { drawEngineRuin } from './isoChuteScene.js';
import { clearDustCache } from './chuteDust.js';
import {
  CHUTE, CHUTE_TUNE, chuteMs, chuteTileState, chuteFallenRadius, chuteWaveEnd, chuteHash,
} from './chuteState.js';
import { worldToScreen, depthOf, snapZoom, ISO_X, ISO_Y } from './projection.js';

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const now0 = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Une tuile dont le dessin a disparu (moulin, port riverain, Plaisirs) : tombée.
export function chuteGone(t) {
  const st = chuteTileState(t);
  return !!st && st.ph === 'ruin';
}

// ── 1. LA CHUTE ─────────────────────────────────────────────────────────────────
let fallResolve = null;
let fallTimer = 0;
let playerZoom = 1.25;

function coreOf(L) {
  return (L.plan && L.plan.core) ? { x: L.plan.core.x, y: L.plan.core.y } : { x: L.cx, y: L.cy };
}

// Rayon de la vague = le bâtiment le plus éloigné du cœur qui tient à l'écran quand
// le cœur est au centre : la vague balaie l'écran en `waveDur`, ce qui est hors
// champ tombe ensuite sans qu'on l'attende.
function waveRadius(L, core) {
  const T = CM.TILE, c0 = worldToScreen(core.x * T, core.y * T);
  const hw = (CM.cw || 1200) / 2 + 40, h0 = (CM.ch || 700) / 2;
  let maxD = 6;
  for (const t of L.tiles) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const cx = t.gx + sx / 2, cy = t.gy + sy / 2;
    const s = worldToScreen(cx * T, cy * T);
    const dx = s.x - c0.x, dy = s.y - c0.y;
    if (Math.abs(dx) > hw || dy < -h0 - 40 || dy > h0 + 140) continue;
    const d = Math.hypot(cx - core.x, cy - core.y);
    if (d > maxD) maxD = d;
  }
  return maxD;
}

function onSkip(e) {
  if (!CHUTE.act) return;
  if (e.type === 'keydown' && !['Escape', ' ', 'Enter'].includes(e.key)) return;
  const T = CHUTE_TUNE;
  if (CHUTE.act === 'fall') {
    // directement au début du fondu au noir
    const target = chuteWaveEnd() + T.nightAt + T.nightMs + T.fadeAt;
    if (chuteMs() < target) CHUTE.t0 = now0() - target;
  } else if (CHUTE.act === 'rise' && CHUTE.t0 < now0()) {
    const target = T.riseBlackMs + T.riseFadeMs + T.riseNightMs + T.riseDawnMs;
    if (chuteMs() < target) CHUTE.t0 = now0() - target;
  }
}
function listenSkip(on) {
  if (typeof window === 'undefined') return;
  const f = on ? 'addEventListener' : 'removeEventListener';
  window[f]('keydown', onSkip, true);
  if (CM.canvas) CM.canvas[f]('pointerdown', onSkip, true);
}

// Lance la chute. Renvoie une promesse tenue quand le noir est atteint, ou null si
// la carte n'est pas là pour la jouer (onglet caché, carte pas encore construite).
function startFall() {
  const L = CM.layout;
  if (!L || !CM.canvas || !CM.cam || (typeof document !== 'undefined' && document.hidden)) return null;
  const core = coreOf(L);
  CHUTE.core = core;
  CHUTE.maxD = waveRadius(L, core);
  CHUTE.fall = new WeakMap();
  CHUTE.fade = 0; CHUTE.pulled = false; CHUTE.done = false; CHUTE.scrub = null;
  CHUTE.fromLayout = L;
  playerZoom = CM.cam.zoom;
  // Un relevé à blanc : il demande toutes les ruines de la cité au réseau, qui
  // arrivent ainsi avant que leurs bâtiments ne tombent (sinon un bâtiment pourrait
  // disparaître sous sa poussière le temps que sa ruine charge).
  try { recordRelics(L); } catch { /* le relevé du noir réessaiera */ }
  // Le cœur au centre : la vague part de lui.
  CM.camGoal = { x: (core.x + 0.5) * CM.TILE, y: (core.y + 0.5) * CM.TILE };
  CM.panVel = null;
  CHUTE.act = 'fall';
  CHUTE.t0 = now0();
  listenSkip(true);
  const T = CHUTE_TUNE;
  const total = chuteWaveEnd() + T.nightAt + T.nightMs + T.fadeAt + T.fadeMs;
  return new Promise((resolve) => {
    fallResolve = resolve;
    // Filet : si la carte cesse de peindre (onglet quitté), la séquence ne reste pas
    // suspendue — la chute se termine d'elle-même au bout de sa durée.
    fallTimer = setTimeout(() => endFall(), total + 3000);
  });
}
function endFall() {
  clearTimeout(fallTimer);
  CHUTE.fade = 1;
  CHUTE.done = true;
  const r = fallResolve;
  fallResolve = null;
  if (r) r(true);
}

// La foule s'en va devant la vague ; l'émeute ne se reforme pas derrière.
// (Formule de l'effectif d'émeute : quaysAndRiot.js, updateCrisis — RIOT_MIN 0,5.)
function emptyStreets(ms) {
  CM.citizenTarget = 0;
  const R = chuteFallenRadius(ms) + 1.5, T = CM.TILE;
  if (R <= 0) return;
  const inR = (wx, wy) => Math.hypot(wx / T - CHUTE.core.x, wy / T - CHUTE.core.y) < R;
  const cit = CM.citizens || [];
  for (let i = cit.length - 1; i >= 0; i -= 1) if (inR(cit[i].x, cit[i].y)) cit.splice(i, 1);
  for (const v of CM.vehicles || []) if (v.x > -1e5 && inR(v.x, v.y)) { v.x = -1e6; v.y = -1e6; v.pauseT = 1e9; }
  const rio = CM.rioters;
  if (rio && rio.length) {
    for (let i = rio.length - 1; i >= 0; i -= 1) if (inR(rio[i].x, rio[i].y)) rio.splice(i, 1);
    const inst = state.instability || 0;
    const base = CM.riotWindow === true && inst > 0.5 ? Math.floor((inst - 0.5) / 0.5 * 36) + 8 : 0;
    CM.riotCalmed = Math.max(0, base - rio.length);
  }
}

// ── 3. LE LEVER ─────────────────────────────────────────────────────────────────
let riseWait = 0, riseDone = null, riseTimer = 0;
// Fin du lever : la Cité rend son interface (events.js). Une fois, même si la carte
// cesse de peindre (filet de 15 s).
function riseEnded() {
  clearTimeout(riseTimer);
  const f = riseDone;
  riseDone = null;
  if (f) f();
}
function startRise(onDone) {
  riseDone = onDone || null;
  riseTimer = setTimeout(() => { if (CHUTE.act === 'rise') { CHUTE.act = null; CHUTE.fade = 0; listenSkip(false); } riseEnded(); }, 15000);
  if (typeof document === 'undefined') return;
  CHUTE.act = 'rise';
  CHUTE.fall = new WeakMap();
  CHUTE.fade = 1;
  CHUTE.done = false;
  CHUTE.t0 = Infinity;            // noir tenu tant que la nouvelle carte n'est pas là
  riseWait = now0();
  listenSkip(true);
  clearDustCache();
}
function riseFrame() {
  const L = CM.layout;
  if (CHUTE.t0 === Infinity) {
    // La carte du cycle neuf est-elle construite ? (ou filet de 4 s)
    if ((L && L !== CHUTE.fromLayout) || now0() - riseWait > 4000) {
      if (L) {
        const core = coreOf(L);
        CM.cam.x = (core.x + 0.5) * CM.TILE; CM.cam.y = (core.y + 0.5) * CM.TILE;
        CM.cam.zoom = snapZoom(Math.max(1, Math.min(1.6, playerZoom)));
        CM.zoomGoal = CM.cam.zoom; CM.camGoal = null; CM.panVel = null;
        CM.centered = true;
      }
      CHUTE.t0 = now0();
    }
    CHUTE.fade = 1;
    CM.nightF = 1; CM.dayRising = false;
    return;
  }
  const T = CHUTE_TUNE, ms = chuteMs();
  const a = ms - T.riseBlackMs;
  CHUTE.fade = 1 - smooth(a / T.riseFadeMs);
  const b = a - T.riseFadeMs - T.riseNightMs;
  CM.nightF = 1 - smooth(b / T.riseDawnMs); CM.dayRising = false;
  if (b > T.riseDawnMs) {
    CHUTE.act = null; CHUTE.fade = 0; CHUTE.done = true;
    riseEnded();
    listenSkip(false);
  }
}

// ── LA FRAME ────────────────────────────────────────────────────────────────────
// Appelée en tête de drawIsoWorld : la lumière, la foule, la caméra de la chute.
export function chuteFrame() {
  if (!CHUTE.act) return;
  if (CHUTE.act === 'rise') { riseFrame(); return; }
  const T = CHUTE_TUNE, ms = chuteMs(), end = chuteWaveEnd();
  const tn = ms - end - T.nightAt;
  let n = T.duskNight * smooth(ms / T.duskInMs);
  if (tn > 0) n = T.duskNight + (1 - T.duskNight) * smooth(tn / T.nightMs);
  const tf = tn - T.nightMs - T.fadeAt;
  CHUTE.fade = tf > 0 ? smooth(tf / T.fadeMs) : 0;
  CM.nightF = n; CM.dayRising = true;
  CM.frameRuined = true;            // l'eau et les arbres de la crise jusqu'au bout
  emptyStreets(ms);
  if (!CHUTE.pulled && ms > end && CHUTE.scrub == null) {
    CHUTE.pulled = true;
    CM.zoomAnchor = { mx: CM.cw / 2, my: CM.ch / 2 };
    CM.zoomGoal = snapZoom(CM.cam.zoom * T.pullBack);
  }
  if (tf > T.fadeMs && !CHUTE.done) endFall();
}

// Fondu au noir des passages de temps, par-dessus toute la carte.
export function paintChuteFade(ctx) {
  if (!(CHUTE.fade > 0)) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(4,3,8,${Math.min(1, CHUTE.fade).toFixed(3)})`;
  ctx.fillRect(0, 0, CM.canvas.width, CM.canvas.height);
  ctx.restore();
}

// ── 2. LES RUINES RELEVÉES ──────────────────────────────────────────────────────
// Pour chaque bâtiment de la cité qui tombe : sa ruine (clé d'image + teinte) et son
// cadre ÉCRAN au zoom 1, relatif au coin nord de sa cellule. On le calcule sans rien
// peindre (géométrie des peintres, scènes moteur dessinées dans le vide), à un zoom
// élevé pour que l'arrondi des peintres ne coûte rien. Coordonnées de cellule
// relatives au CENTRE de la grille, comme les rues et les slots du jeu.
const RELIC_CAP = 2200;
let pendingRelics = null;

function relicKeyOfHouse(r) {
  return 'h|' + r.key + '|' + (r.tint | 0) + '|' + (r.model || '') + '|' + (r.vi | 0);
}
export function recordRelics(L = CM.layout) {
  if (!L || !CM.cam) return null;
  const T = CM.TILE;
  const cam = { x: CM.cam.x, y: CM.cam.y, zoom: CM.cam.zoom };
  const Z = 4;
  CM.cam.zoom = Z;
  const z = Z, hh = T * z * ISO_Y;
  const N = L.gridN | 0, cx = Math.floor(N / 2), cy = cx;
  const keys = [], keyIdx = new Map();
  const kid = (k) => { let i = keyIdx.get(k); if (i === undefined) { i = keys.length; keys.push(k); keyIdx.set(k, i); } return i; };
  const items = [];
  const r2 = (v) => Math.round(v * 100) / 100;
  const push = (t, sx, sy, k, x, y, w, h, mon) => {
    const ref = worldToScreen(t.gx * T, t.gy * T);
    items.push([t.gx - cx, t.gy - cy, sx, sy, kid(k), r2((x - ref.x) / z), r2((y - ref.y) / z), r2(w / z), r2(h / z), mon ? 1 : 0]);
  };
  const river = L.river && L.river.present ? L.river : null;
  try {
    for (const t of L.tiles) {
      if (cmEngineHomeHidden(t)) continue;
      const id = t.buildingId || t.variant || '';
      if (/aqueduct|field|farm|crop|orchard/i.test(id)) continue;
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      const isHouse = t.type === 'house' || t.type === 'enginehome' || !!t.body;
      const fOff = t.__district ? null : isoFrontOffset(t, L.roadMap);
      const anchor = worldToScreen((t.gx + sx + (fOff ? fOff.ox : 0)) * T, (t.gy + sy + (fOff ? fOff.oy : 0)) * T);
      if (isHouse) {
        if (!pixelHouseReady(t)) continue;
        const wpx = (sx + sy) * T * z * ISO_X * 0.78;
        const r = pixelHouseRuin(t, anchor.x - wpx / 2, anchor.y - wpx - hh * 0.5, wpx, wpx);
        if (r) push(t, sx, sy, relicKeyOfHouse(r), r.x, r.y, r.w, r.h, false);
        continue;
      }
      if (t.type !== 'engine' || !isoEngineScenesFlag.on || id === 'water_mills') continue;
      if (river && river.cells) {
        let wet = false;
        for (let a = 0; a < sx && !wet; a += 1) for (let b = 0; b < sy && !wet; b += 1) {
          const k = (t.gx + a) + ',' + (t.gy + b);
          if (river.cells.has(k) || (river.banks && river.banks.has(k))) wet = true;
        }
        if (wet) continue;
      }
      const { bx, by, bw } = isoEngineSceneBox(t, anchor, sx, sy, T, z, hh);
      const rec = [];
      drawEngineRuin(null, t, bx, by, bw, 0, rec);
      for (const b of rec) push(t, sx, sy, 'p|' + b.p, b.x, b.y, b.w, b.h, true);
    }
  } finally {
    CM.cam.x = cam.x; CM.cam.y = cam.y; CM.cam.zoom = cam.zoom;
  }
  // Au-delà du plafond, on garde les monuments et les ruines les plus proches du cœur.
  if (items.length > RELIC_CAP) {
    const core = coreOf(L);
    const d2 = (it) => (it[0] + cx - core.x) ** 2 + (it[1] + cy - core.y) ** 2 - (it[9] ? 1e9 : 0);
    items.sort((a, b) => d2(a) - d2(b));
    items.length = RELIC_CAP;
  }
  return { v: 1, seed: (L.mapSeed >>> 0) || 0, n: N, keys, items };
}

// ── LES RUINES DU CYCLE PRÉCÉDENT, SUR LA CARTE ─────────────────────────────────
// Rejouées comme des items du peintre, triés à leur profondeur, partout où la
// nouvelle cité n'a encore rien posé (bâti, rues, eau, berges, foyer du camp).
// Une maison sur deux (TUNE.relicKeep) n'est plus qu'un pan de mur : arasée.
let relicCache = { relics: null, L: null, live: null, cells: null };
function relicsFor(L) {
  const R = state.cityRelics;
  if (!R || !Array.isArray(R.items) || !R.items.length || (R.seed >>> 0) !== ((L.mapSeed >>> 0) || 0)) return null;
  if (relicCache.relics === R && relicCache.L === L) return relicCache;
  const occ = new Set();
  for (const t of L.tiles) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let a = -1; a <= sx; a += 1) for (let b = -1; b <= sy; b += 1) occ.add((t.gx + a) + ',' + (t.gy + b));
  }
  if (L.roadSet) for (const k of L.roadSet) occ.add(k);
  if (L.river && L.river.cells) for (const k of L.river.cells) occ.add(k);
  if (L.river && L.river.banks) for (const k of L.river.banks) occ.add(k);
  if (L.campHearth) for (let a = -3; a <= 3; a += 1) for (let b = -3; b <= 3; b += 1) occ.add((L.campHearth.gx + a) + ',' + (L.campHearth.gy + b));
  const N = L.gridN | 0, cx = Math.floor(N / 2), cy = cx;
  const live = [], cells = new Set();
  for (const it of R.items) {
    const gx = it[0] + cx, gy = it[1] + cy, sx = it[2], sy = it[3];
    let blocked = false;
    for (let a = 0; a < sx && !blocked; a += 1) for (let b = 0; b < sy && !blocked; b += 1) if (occ.has((gx + a) + ',' + (gy + b))) blocked = true;
    if (blocked) continue;
    const k = R.keys[it[4]];
    if (!k) continue;
    const razed = !it[9] && (chuteHash('relique:' + gx + ':' + gy) % 100) >= CHUTE_TUNE.relicKeep;
    live.push({ gx, gy, sx, sy, k, razed, x: it[5], y: it[6], w: it[7], h: it[8], d: depthOf((gx + sx) * CM.TILE, (gy + sy) * CM.TILE) });
    for (let a = 0; a < sx; a += 1) for (let b = 0; b < sy; b += 1) cells.add((gx + a) + ',' + (gy + b));
  }
  relicCache = { relics: R, L, live, cells };
  return relicCache;
}
function relicImage(r) {
  const p = r.k.split('|');
  if (p[0] === 'h') return houseRelicCanvas(p[1], +p[2] || 0, p[3] || null, +p[4] || 0, r.razed);
  if (p[0] === 'p') return propRelicCanvas(p[1]);
  return null;
}

// Fin de collecte du peintre (iso/isoLiveCollect.js) : la chute vide les rues sous la
// vague ; les ruines du cycle précédent entrent dans le tri, la forêt neuve les évite.
const GONE_PROPS = /^(person|garland|stall|crates|brazier)/;
const LIFE_KINDS = new Set(['cit', 'veh', 'vie', 'elev', 'critter', 'smoke', 'revealpin', 'terroirTeam', 'fleetScene', 'porter', 'portBoat', 'lamp', 'plaisirs']);
function itemPos(it, T) {
  switch (it.kind) {
    case 'plazaProp': return it.art && it.art.wx != null ? [it.art.wx, it.art.wy] : null;
    case 'vie': case 'elev': return it.v && it.v.wx != null ? [it.v.wx, it.v.wy] : null;
    case 'cit': case 'veh': return [it.gwx, it.gwy];
    case 'critter': return it.cr ? [(it.cr.gx + 0.5) * T, (it.cr.gy + 0.5) * T] : null;
    case 'smoke': case 'revealpin': return it.t ? [(it.t.gx + 0.5) * T, (it.t.gy + 0.5) * T] : null;
    case 'lamp': return [it.wx, it.wy];
    case 'plaisirs': return it.m && it.m.cx != null ? [it.m.cx, it.m.cy] : null;
    default: return null;
  }
}
export function chuteCollect(items, L) {
  if (!L) return;
  const T = CM.TILE;
  if (CHUTE.act === 'fall') {
    const R = chuteFallenRadius(chuteMs()) + 0.5;
    if (R > 0) {
      let w = 0;
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        let gone = false;
        if (LIFE_KINDS.has(it.kind) || (it.kind === 'plazaProp' && it.art && GONE_PROPS.test(it.art.prop || ''))) {
          const p = itemPos(it, T);
          gone = !p || Math.hypot(p[0] / T - CHUTE.core.x, p[1] / T - CHUTE.core.y) < R;
        }
        if (!gone) items[w++] = it;
      }
      items.length = w;
    }
    return;
  }
  const rc = relicsFor(L);
  if (!rc || !rc.live.length) return;
  let w = 0;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it.kind === 'tree' && it.tr && rc.cells.has(it.tr.gx + ',' + it.tr.gy)) continue;
    items[w++] = it;
  }
  items.length = w;
  const z = CM.cam.zoom;
  for (const r of rc.live) {
    const ref = worldToScreen(r.gx * T, r.gy * T);
    const x = ref.x + r.x * z, y = ref.y + r.y * z;
    if (x > CM.cw || y > CM.ch || x + r.w * z < 0 || y + r.h * z < 0) continue;
    items.push({ d: r.d, kind: 'relic', r, x, y });
  }
}
export function paintRelic(ctx, it) {
  const img = relicImage(it.r);
  if (!img) return;
  const z = CM.cam.zoom;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(it.x), Math.round(it.y), Math.round(it.r.w * z), Math.round(it.r.h * z));
  ctx.imageSmoothingEnabled = prev;
}

// ── LE BRANCHEMENT (cityMapBridge : le cœur du jeu ne connaît pas la carte) ──────
setChuteHandlers({
  // events.js : joue la chute ; tenue quand le noir est atteint (ou null).
  fall: () => startFall(),
  // events.js, au noir : relève les ruines de la cité qui tombe.
  // (seulement si la carte est montée et montre bien la cité de cette partie : un
  // layout resté en mémoire d'un autre cycle relèverait les ruines d'une autre cité)
  capture: () => {
    const L = CM.layout;
    const ok = L && CM.canvas && CM.canvas.isConnected && (L.mapSeed >>> 0) === ((state.mapSeed >>> 0) || 0);
    pendingRelics = ok ? recordRelics(L) : null;
    return !!pendingRelics;
  },
  // crisis.js, completeCollapse : prend les ruines relevées (une seule fois).
  take: () => { const r = pendingRelics; pendingRelics = null; return r; },
  // events.js, cycle neuf fondé : le lever (noir → feu du campement → aube).
  rise: (onDone) => { if (CHUTE.act === 'fall' || CHUTE.done) startRise(onDone); else if (onDone) onDone(); },
  // Fin forcée (erreur, cité rechargée) : la carte rend la main.
  abort: () => { CHUTE.act = null; CHUTE.fade = 0; listenSkip(false); endFall(); },
});

if (typeof window !== 'undefined' && import.meta.env && import.meta.env.DEV) {
  // Molettes de dev : __chute.tune, __chute.scrub(ms), __chute.fall(), __chute.rise().
  window.__chute = { CHUTE, TUNE: CHUTE_TUNE, fall: startFall, rise: startRise, record: recordRelics,
    scrub: (ms) => { CHUTE.scrub = ms; } };
}
