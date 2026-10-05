// LE METTEUR EN SCÈNE — joue la chute sur la VRAIE carte, par les crochets injectés
// (vite.config.mjs) : __chuteClock (temps, lumière), __chuteHouse / __chuteEngine
// (chaque bâtiment : debout, secoué, ruine + poussière), __chuteCollect /
// __chutePaint (les ruines du cycle d'avant), __chutePost (rien d'écrit à l'écran).
import { worldToScreen, depthOf, snapZoom } from '/src/game/map/iso/projection.js';
import { drawEngineSprite } from '/src/game/map/engineSprites.js';
import { suspendFlameGlow } from '/src/game/map/flameGlow.js';
import { suspendLightLayer } from '/src/game/map/lightLayer.js';
import { Ruins } from './ruins.js';
import { dustFrame, dustPalette, DUST_FRAMES } from './dust.js';

const CMr = () => window.__CM;

// ── RÉGLAGES (molette : window.__chuteTune) ────────────────────────────────────
export const TUNE = {
  fige: { night: 0.42, rampMs: 1800 },   // l'heure figée : crépuscule (voile chaud du jeu)
  wave: { start: 700, dur: 5200, jitter: 420, pow: 0.85 },
  shakeMs: 420,
  dustLead: 260,                  // la poussière part avant la bascule debout → ruine
  dustMs: 1700,
  nightAt: 1600, nightMs: 2600, holdMs: 1800, dawnMs: 3200,   // après la vague
  pullBack: 0.75,                 // recul de caméra à la fin de la vague (× zoom)
  relicKeep: 55,                  // % des maisons dont la ruine survit au cycle suivant
  resteZoom: 1.25,
  chain: true,                    // II enchaîne sur III (noir → feu du campement → aube)
  dust: true,                     // nuages de poussière de la vague (A/B : sans = la ruine apparaît après la secousse)
  reste: { blackMs: 700, fadeMs: 1400, nightMs: 2200 },
  nuit: { outMs: 4200, swapAt: 5200, fadeMs: 900, blackMs: 500, nightMs: 1600 },
};
window.__chuteTune = (o) => { if (o) for (const k of Object.keys(o)) { if (o[k] && typeof o[k] === 'object') Object.assign(TUNE[k] = TUNE[k] || {}, o[k]); else TUNE[k] = o[k]; } return TUNE; };

export const D = {
  act: null,          // null | 'fige' | 'chute' | 'reste'
  t0: 0,
  frozenNow: 0,
  gameNow: 0,
  fall: new WeakMap(),
  core: null, maxD: 1,
  ended: false,
  listeners: new Set(),
};
// Temps de l'acte (ms). `D.scrub` fige l'instant (planches de captures).
const tm = () => (D.scrub != null ? D.scrub : performance.now() - D.t0);
function emit() { for (const f of D.listeners) f(D); }

function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ── LA VAGUE : quand tombe chaque bâtiment ─────────────────────────────────────
function tileCenter(t) {
  const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
  return { x: t.gx + sx / 2, y: t.gy + sy / 2 };
}
function prepareWave() {
  const CM = CMr(), L = CM.layout;
  D.core = (L.plan && L.plan.core) ? { x: L.plan.core.x, y: L.plan.core.y } : { x: L.cx, y: L.cy };
  // Rayon de la vague = le bâtiment VISIBLE le plus éloigné du cœur : la vague balaie
  // l'écran en `wave.dur`, ce qui est hors champ tombe après, sans qu'on l'attende.
  const T = CM.TILE;
  let maxD = 4;
  for (const t of L.tiles) {
    const c = tileCenter(t);
    const s = worldToScreen(c.x * T, c.y * T);
    if (s.x < -40 || s.y < -40 || s.x > CM.cw + 40 || s.y > CM.ch + 120) continue;
    const d = Math.hypot(c.x - D.core.x, c.y - D.core.y);
    if (d > maxD) maxD = d;
  }
  D.maxD = maxD;
  D.fall = new WeakMap();
}
function fallAt(t) {
  let v = D.fall.get(t);
  if (v !== undefined) return v;
  const W = TUNE.wave;
  const c = tileCenter(t);
  const d = Math.hypot(c.x - D.core.x, c.y - D.core.y) / D.maxD;
  const j = (hash('chute:' + t.gx + ':' + t.gy) % 1000) / 1000;
  v = W.start + Math.pow(d, W.pow) * W.dur + (j - 0.5) * W.jitter;
  D.fall.set(t, v);
  return v;
}
// Rayon tombé (en tuiles) à l'instant ms — pour vider les rues devant la vague.
function fallenRadius(ms) {
  const W = TUNE.wave;
  const q = (ms - W.start) / W.dur;
  return q <= 0 ? -1 : D.maxD * Math.pow(q, 1 / W.pow);
}
function waveEnd() { return TUNE.wave.start + TUNE.wave.dur * 1.25 + TUNE.wave.jitter; }

// État d'un bâtiment à l'instant : debout / secoué / ruine (+ image de poussière).
// La poussière part PENDANT la secousse : quand le sprite debout cède la place à la
// ruine, le nuage est déjà plein et couvre la bascule.
function stateOf(t) {
  if (D.act === 'record') return { ph: 'ruin', dust: -1 };
  if (D.act === 'nuit') {
    // Variante sobre : les fenêtres s'éteignent une à une, puis, dans le noir, la
    // ville devient ruine. Aucune animation de destruction.
    const ms = tm();
    if (ms >= TUNE.nuit.swapAt) return { ph: 'ruin', dust: -1 };
    const te = 300 + (hash('nuit:' + t.gx + ':' + t.gy) % 1000) / 1000 * TUNE.nuit.outMs;
    return ms >= te ? { ph: 'dark' } : null;
  }
  if (D.act !== 'chute') return null;
  const ms = tm(), tf = fallAt(t);
  if (ms < tf - TUNE.shakeMs) return null;
  const df = Math.floor((ms - (tf - TUNE.dustLead)) / TUNE.dustMs * DUST_FRAMES);
  const dust = df >= 0 && df < DUST_FRAMES ? df : -1;
  if (ms < tf) {
    const s = Math.floor((ms - (tf - TUNE.shakeMs)) / 70);
    const SH = [[1, 0], [-1, 0], [1, 1], [-1, 1], [0, 2], [0, 3]];
    const o = SH[Math.min(SH.length - 1, s)];
    return { ph: 'shake', ox: o[0], oy: o[1], dust };
  }
  return { ph: 'ruin', dust };
}

function drawDust(ctx, t, cx, by, wSpr, hSpr, k, wallImg, f) {
  if (f < 0 || !TUNE.dust) return;
  const pal = dustPalette(Ruins.wallColor(wallImg));
  const seed = hash('dust:' + t.gx + ':' + t.gy);
  const fr = dustFrame(Math.max(8, Math.round(wSpr)), Math.max(8, Math.round(hSpr)), seed, pal, f);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fr.c, Math.round(cx - fr.ax * k), Math.round(by - fr.ay * k), Math.round(fr.c.width * k), Math.round(fr.c.height * k));
  ctx.imageSmoothingEnabled = prev;
}

// ── CROCHET : HABITATIONS ──────────────────────────────────────────────────────
globalThis.__chuteHouse = (t, g, ctx) => {
  const st = stateOf(t);
  if (!st) return undefined;
  const k = g.dw / g.bb.w;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (st.ph === 'dark') {
    // La maison telle quelle, sans ses fenêtres allumées : il n'y a plus personne.
    ctx.drawImage(g.img, g.bb.x0, g.bb.y0, g.bb.w, g.bb.h, g.dx, g.dy, g.dw, g.dh);
    ctx.imageSmoothingEnabled = prev;
    return { dx: g.dx, dy: g.dy, dw: g.dw, dh: g.dh, mask: g.bb.mask };
  }
  if (st.ph === 'shake') {
    ctx.drawImage(g.img, g.bb.x0, g.bb.y0, g.bb.w, g.bb.h,
      g.dx + Math.round(st.ox * k), g.dy + Math.round(st.oy * k), g.dw, g.dh);
    ctx.imageSmoothingEnabled = prev;
    drawDust(ctx, t, g.dx + g.dw / 2, g.dy + g.dh, g.bb.w, g.bb.h, k, g.img, st.dust);
    return { dx: g.dx, dy: g.dy, dw: g.dw, dh: g.dh, mask: g.bb.mask };
  }
  const r = Ruins.house(g);
  if (r) {
    const x = Math.round(g.dx - r.ox * k), y = Math.round(g.dy - r.oy * k);
    const w = Math.round((r.img.width || r.img.naturalWidth) * k), h = Math.round((r.img.height || r.img.naturalHeight) * k, false);
    ctx.drawImage(r.img, x, y, w, h);
    recordRuin(t, r.img, g.dx - r.ox * k, g.dy - r.oy * k, (r.img.width || r.img.naturalWidth) * k, (r.img.height || r.img.naturalHeight) * k, false);
  } else if (!D.showMissing) {
    ctx.drawImage(g.img, g.bb.x0, g.bb.y0, g.bb.w, g.bb.h, g.dx, g.dy, g.dw, g.dh);
  }
  ctx.imageSmoothingEnabled = prev;
  drawDust(ctx, t, g.dx + g.dw / 2, g.dy + g.dh, g.bb.w, g.bb.h, k, g.img, st.dust);
  return { dx: g.dx, dy: g.dy, dw: g.dw, dh: g.dh };
};

// ── CROCHET : SCÈNES MOTEUR ────────────────────────────────────────────────────
// La scène est redessinée à travers un contexte-relais : le canvas du bâtiment est
// remplacé par sa ruine, tout le reste (habitants de la scène, détails peints,
// feux) est retenu. Rien n'est cuit, rien n'est déposé dans la couche de lumière.
const DROP = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'putImageData']);
const noop = () => {};
let relay = null, relayTarget = null, relayInk = null, relayShake = false, relayTile = null;
const engineUnit = new Map();      // buildingId → taille d'un pixel de sprite à l'écran
function relayDraw(img, ...a) {
  const ctx = relayTarget;
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  let sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
  if (a.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = a;
  else if (a.length === 4) [dx, dy, dw, dh] = a;
  else { [dx, dy] = a; dw = iw; dh = ih; }
  const r = (!relayShake && (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement)) ? Ruins.engine(img) : null;
  const kx = dw / sw, ky = dh / sh;
  if (relayShake) {
    ctx.drawImage(img, ...a);
  } else if (r) {
    const rx = dx - (r.ox + sx) * kx, ry = dy - (r.oy + sy) * ky;
    const rw = (r.img.width || r.img.naturalWidth) * kx, rh = (r.img.height || r.img.naturalHeight) * ky;
    ctx.drawImage(r.img, Math.round(rx), Math.round(ry), Math.round(rw), Math.round(rh));
    if (relayTile) recordRuin(relayTile, r.img, rx, ry, rw, rh, true);
  } else if (dw * dh >= relayInk.area * 0.25) {
    ctx.drawImage(img, ...a);       // corps sans ruine dessinée : on le laisse debout (repérable)
  } else return;                    // petits sprites de la scène (gens, bêtes) : partis
  if (!relayInk.img || dw * dh > relayInk.best) {
    relayInk.best = dw * dh;
    relayInk.img = img; relayInk.k = kx;
    relayInk.cx = dx + dw / 2; relayInk.by = dy + dh * inkBottom(img);
    relayInk.w = sw * inkWidth(img); relayInk.h = sh;
  }
}
const _ink = new WeakMap();
function ink(img) {
  let v = _ink.get(img);
  if (v) return v;
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  v = { bottom: 1, width: 1 };
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, w, h).data;
    let x0 = w, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 1) for (let xx = 0; xx < w; xx += 1) if (d[(y * w + xx) * 4 + 3] > 64) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y > y1) y1 = y; }
    if (y1 >= 0) v = { bottom: (y1 + 1) / h, width: (x1 - x0 + 1) / w };
  } catch { /* garde */ }
  _ink.set(img, v);
  return v;
}
const inkBottom = (img) => ink(img).bottom;
const inkWidth = (img) => ink(img).width;

function ruinCtx(ctx) {
  if (relayTarget !== ctx || !relay) {
    relayTarget = ctx;
    relay = new Proxy(ctx, {
      get(o, p) {
        if (p === 'drawImage') return relayDraw;
        if (DROP.has(p) && !relayShake) return noop;
        const v = o[p];
        return typeof v === 'function' ? v.bind(o) : v;
      },
      set(o, p, v) { o[p] = v; return true; },
    });
  }
  return relay;
}

globalThis.__chuteEngine = (t, bx, by, bw, now, aNow, ctx) => {
  const st = stateOf(t);
  if (!st || st.ph === 'dark') return undefined;
  const CM = CMr();
  relayInk = { area: bw * bw, best: 0, img: null };
  const prevCtx = CM.ctx;
  if (st.ph === 'shake') {
    // Debout, secoué : la scène telle quelle, décalée d'un pixel de sprite. Le
    // relais ne sert ici qu'à mesurer l'encre (pied du nuage) : il dessine normalement.
    const k = engineUnit.get(t.buildingId) || bw / 112;
    relayShake = true;
    CM.ctx = ruinCtx(ctx);
    try { drawEngineSprite(t, bx + Math.round(st.ox * k), by + Math.round(st.oy * k), bw, bw, aNow); }
    catch { /* rien */ } finally { CM.ctx = prevCtx; relayShake = false; }
    if (relayInk.img) {
      engineUnit.set(t.buildingId, relayInk.k);
      drawDust(ctx, t, relayInk.cx, relayInk.by, relayInk.w, relayInk.h * 0.7, relayInk.k, relayInk.img, st.dust);
    }
    return { dx: bx, dy: by, dw: bw, dh: bw };
  }
  CM.ctx = ruinCtx(ctx);
  suspendFlameGlow(true); suspendLightLayer(true);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  relayTile = t;
  try { drawEngineSprite(t, bx, by, bw, bw, aNow); } catch { /* scène capricieuse : rien */ }
  finally {
    relayTile = null;
    CM.ctx = prevCtx;
    suspendFlameGlow(false); suspendLightLayer(false);
    ctx.imageSmoothingEnabled = prev;
  }
  if (relayInk.img) drawDust(ctx, t, relayInk.cx, relayInk.by, relayInk.w, relayInk.h * 0.7, relayInk.k, relayInk.img, st.dust);
  return { dx: bx, dy: by, dw: bw, dh: bw };
};

// ── CROCHET : CE QUI VIT DANS LES RUES ─────────────────────────────────────────
// Sous la vague, la ville se vide : flâneurs des places, étals et guirlandes,
// braseros, bêtes et linge (petite vie), fumées des cheminées. Restent la pierre :
// bancs, bacs, statues, fontaines, réverbères (éteints), ponts.
const GONE_PROPS = /^(person|garland|stall|crates|brazier)/;
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
const LIFE_KINDS = new Set(['cit', 'veh', 'vie', 'elev', 'critter', 'smoke', 'revealpin', 'terroirTeam', 'fleetScene', 'porter', 'portBoat', 'lamp', 'plaisirs']);
globalThis.__chuteCollect = (items, bake, now) => {
  if (!D.act || D.act === 'fige') return;
  if (D.act === 'reste') { if (D.relics) pushRelics(items, bake); return; }
  const CM = CMr(), T = CM.TILE;
  const R = D.act === 'nuit' ? (tm() >= TUNE.nuit.swapAt ? Infinity : -1) : fallenRadius(tm()) + 0.5;
  if (R <= 0) return;
  let w = 0;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    let gone = false;
    if (LIFE_KINDS.has(it.kind) || (it.kind === 'plazaProp' && it.art && GONE_PROPS.test(it.art.prop || ''))) {
      const p = itemPos(it, T);
      gone = !p || Math.hypot(p[0] / T - D.core.x, p[1] / T - D.core.y) < R;
    }
    if (!gone) items[w++] = it;
  }
  items.length = w;
};

// ── ACTE III : LES RUINES DU CYCLE D'AVANT ─────────────────────────────────────
// La cité suivante est fondée dans la MÊME vallée (même graine, même fleuve, même
// cœur) : son campement s'installe au milieu des ruines de la précédente. Chaque
// ruine garde sa « recette » de dessin (image + cadre relatif à sa cellule, ramené
// au zoom 1) relevée pendant la chute ; elle est rejouée comme un item du peintre,
// triée à sa profondeur, partout où la nouvelle cité n'a encore rien posé.
function recordRuin(t, img, x, y, w, h, monument) {
  if (!D.recording) return;
  const CM = CMr(), T = CM.TILE, z = CM.cam.zoom;
  const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
  const ref = worldToScreen(t.gx * T, t.gy * T);
  D.recording.set(t.gx + ',' + t.gy, {
    img, gx: t.gx, gy: t.gy, sx, sy, monument: !!monument,
    x: (x - ref.x) / z, y: (y - ref.y) / z, w: w / z, h: h / z,
    d: depthOf((t.gx + sx) * T, (t.gy + sy) * T),
  });
}
let relicCells = null;
function relicFree(L) {
  // Cellules que la nouvelle cité occupe déjà (bâti, rues, eau, berges, foyer).
  const occ = new Set();
  for (const t of L.tiles) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let a = -1; a <= sx; a += 1) for (let b = -1; b <= sy; b += 1) occ.add((t.gx + a) + ',' + (t.gy + b));
  }
  if (L.roadSet) for (const k of L.roadSet) occ.add(k);
  if (L.river && L.river.cells) for (const k of L.river.cells) occ.add(k);
  if (L.river && L.river.banks) for (const k of L.river.banks) occ.add(k);
  if (L.campHearth) for (let a = -3; a <= 3; a += 1) for (let b = -3; b <= 3; b += 1) occ.add((L.campHearth.gx + a) + ',' + (L.campHearth.gy + b));
  return occ;
}
function pushRelics(items) {
  const CM = CMr(), L = CM.layout, T = CM.TILE, z = CM.cam.zoom;
  if (D.relicLayout !== L) {
    D.relicLayout = L;
    const occ = relicFree(L);
    D.liveRelics = [];
    relicCells = new Set();
    for (const r of D.relics.values()) {
      let blocked = false;
      for (let a = 0; a < r.sx && !blocked; a += 1) for (let b = 0; b < r.sy && !blocked; b += 1) if (occ.has((r.gx + a) + ',' + (r.gy + b))) blocked = true;
      if (blocked) continue;
      // Le temps a fait son tri : les monuments restent, une maison sur deux a fini
      // en tas de pierres sous l'herbe.
      const h = hash('relic:' + r.gx + ':' + r.gy);
      const razed = !r.monument && (h % 100) >= TUNE.relicKeep;
      D.liveRelics.push(razed ? { ...r, img: Ruins.razed(r.img, h) } : r);
      for (let a = 0; a < r.sx; a += 1) for (let b = 0; b < r.sy; b += 1) relicCells.add((r.gx + a) + ',' + (r.gy + b));
    }
  }
  // Les arbres de la forêt neuve ne poussent pas DANS une ruine (ils l'entourent).
  let w = 0;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it.kind === 'tree' && it.tr && relicCells.has(it.tr.gx + ',' + it.tr.gy)) continue;
    items[w++] = it;
  }
  items.length = w;
  for (const r of D.liveRelics) {
    const ref = worldToScreen(r.gx * T, r.gy * T);
    const x = ref.x + r.x * z, y = ref.y + r.y * z;
    if (x > CM.cw || y > CM.ch || x + r.w * z < 0 || y + r.h * z < 0) continue;
    items.push({ d: r.d, kind: 'chute', rec: r, sx: x, sy: y });
  }
}
globalThis.__chutePaint = (ctx, it) => {
  const r = it.rec, z = CMr().cam.zoom;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(r.img, Math.round(it.sx), Math.round(it.sy), Math.round(r.w * z), Math.round(r.h * z));
  ctx.imageSmoothingEnabled = prev;
};

// ── CROCHET : HORLOGE, LUMIÈRE, FOULE ──────────────────────────────────────────
globalThis.__chuteClock = (dt, now) => {
  D.gameNow = now;
  const CM = CMr();
  if (!D.act || !CM) return { dt, now };
  const ms = tm();
  if (D.act === 'fige') {
    // La dernière heure : l'émeute gronde, la lumière tourne au crépuscule… puis
    // plus rien ne bouge. La carte reste là, sous le panneau de la Chute.
    CM.nightF = TUNE.fige.night * smooth(ms / TUNE.fige.rampMs); CM.dayRising = true;
    CM.riotWindow = true;
    if (D.riotCell && ms < 400) { CM.riotGoal = D.riotCell; CM.riotGoalAt = now; }
    if (ms < TUNE.fige.rampMs) return { dt, now };
    if (!D.frozen) { D.frozen = true; D.frozenNow = now; emit(); }
    CM.zoomGoal = CM.cam.zoom;
    return { dt: 0, now: D.frozenNow };
  }
  if (D.act === 'chute') {
    const end = waveEnd();
    // Lumière : l'heure figée, puis la nuit tombe sur les ruines, puis l'aube.
    const tn = ms - end - TUNE.nightAt;
    let n = TUNE.fige.night * (D.fromFige ? 1 : smooth(ms / 700)), rising = true;
    if (tn > 0) n = TUNE.fige.night + (1 - TUNE.fige.night) * smooth(tn / TUNE.nightMs);
    const td = tn - TUNE.nightMs - TUNE.holdMs;
    if (TUNE.chain) {
      // Enchaîné : en pleine nuit, fondu au noir — le cycle suivant se prépare
      // derrière (nextCycle, appelé par la régie), et l'acte III reprend du noir.
      const tf = tn - TUNE.nightMs - 500;
      D.fade = tf > 0 ? smooth(tf / 900) : 0;
      if (tf > 900 && !D.switching) { D.switching = true; emit(); }
    } else if (td > 0) { n = 1 - smooth(td / TUNE.dawnMs); rising = false; }
    CM.nightF = n; CM.dayRising = rising;
    CM.frameRuined = true;            // l'eau et les arbres de la crise restent jusqu'au bout
    // La foule : la vague emporte qui se trouve sous elle ; plus personne ne sort.
    CM.citizenTarget = 0;
    const R = fallenRadius(ms) + 1.5, T = CM.TILE;
    if (R > 0) {
      const inR = (wx, wy) => Math.hypot(wx / T - D.core.x, wy / T - D.core.y) < R;
      for (let i = CM.citizens.length - 1; i >= 0; i -= 1) { const c = CM.citizens[i]; if (inR(c.x, c.y)) CM.citizens.splice(i, 1); }
      for (const v of CM.vehicles || []) if (v.x > -1e5 && inR(v.x, v.y)) { v.x = -1e6; v.y = -1e6; v.pauseT = 1e9; }
      if (CM.rioters) for (let i = CM.rioters.length - 1; i >= 0; i -= 1) { const r = CM.rioters[i]; if (inR(r.x, r.y)) CM.rioters.splice(i, 1); }
    }
    // L'émeute ne se reforme pas derrière la vague : la sim du jeu ne garde que ceux
    // qui restent (sa cible d'effectif suit l'instabilité, qu'on ajuste au compte).
    if (CM.rioters && window.__state) {
      const n = CM.rioters.length;
      CM.riotWindow = n >= 8;
      window.__state.instability = n >= 8 ? 0.55 + (n - 8 + 0.5) / 36 * 0.45 : 0;
    }
    if (!D.pulled && ms > end && D.scrub == null) {
      D.pulled = true;
      CM.zoomAnchor = { mx: CM.cw / 2, my: CM.ch / 2 };
      CM.zoomGoal = snapZoom(CM.cam.zoom * TUNE.pullBack);
    }
    if (!D.ended && !TUNE.chain && td > TUNE.dawnMs) { D.ended = true; emit(); }
    return { dt, now };
  }
  if (D.act === 'nuit') {
    CM.frameRuined = true;
    const N = TUNE.nuit;
    const n0 = D.fromFige ? TUNE.fige.night : 0;
    let n = n0 + (1 - n0) * smooth(ms / N.outMs), rising = true;
    // fondu au noir, bascule en ruines dans le noir, puis (seule) nuit et aube
    const f1 = smooth((ms - (N.swapAt - N.fadeMs)) / N.fadeMs);
    const f2 = 1 - smooth((ms - N.swapAt - N.blackMs) / N.fadeMs);
    D.fade = ms < N.swapAt ? f1 : (TUNE.chain ? 1 : f2);
    if (ms >= N.swapAt) {
      CM.frameRuined = true;
      if (!D.lampsOff) { D.lampsOff = true; lamps(false); }
      if (TUNE.chain && !D.switching) { D.switching = true; emit(); }
      const td = ms - N.swapAt - N.blackMs - N.fadeMs - N.nightMs;
      if (td > 0) { n = 1 - smooth(td / TUNE.dawnMs); rising = false; }
    }
    CM.nightF = n; CM.dayRising = rising;
    // Les rues se vident peu à peu (l'exode), l'émeute se disperse avec elles.
    CM.citizenTarget = 0;
    const keep = 1 - smooth(ms / (N.outMs * 0.9));
    const want = Math.floor((D.cit0 || 0) * keep);
    while (CM.citizens.length > want) CM.citizens.splice((hash('x' + CM.citizens.length) % CM.citizens.length), 1);
    if (CM.rioters && window.__state) {
      const r = Math.floor((D.riot0 || 0) * keep);
      CM.rioters.length = Math.min(CM.rioters.length, r);
      CM.riotWindow = r >= 8;
      window.__state.instability = r >= 8 ? 0.55 + (r - 8 + 0.5) / 36 * 0.45 : 0;
    }
    return { dt, now };
  }
  if (D.act === 'reste') {
    // Du noir : la nuit, le seul feu du campement au milieu des ruines… puis l'aube.
    const a = ms - TUNE.reste.blackMs;
    D.fade = 1 - smooth(a / TUNE.reste.fadeMs);
    const b = a - TUNE.reste.fadeMs - TUNE.reste.nightMs;
    CM.nightF = 1 - smooth(b / TUNE.dawnMs); CM.dayRising = false;
    return { dt, now };
  }
  return { dt, now };
};

// Fondu au noir des passages de temps (rien d'autre n'est peint par-dessus la carte).
globalThis.__chutePost = (ctx) => {
  if (!D.act || !(D.fade > 0)) return;
  const CM = CMr();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(4,3,8,${Math.min(1, D.fade).toFixed(3)})`;
  ctx.fillRect(0, 0, CM.canvas.width, CM.canvas.height);
  ctx.restore();
};

// ── LES ACTES ──────────────────────────────────────────────────────────────────
function lamps(on) { if (window.__lampLight) window.__lampLight({ on }); }

let savedInstability = null;
function setUnrest(on) {
  const s = window.__state;
  if (!s) return;
  if (on) { if (savedInstability == null) savedInstability = s.instability || 0; s.instability = 1; }
  else if (savedInstability != null) { s.instability = savedInstability; savedInstability = null; }
}
function resetFlags() { D.ended = false; D.pulled = false; D.frozen = false; D.fromFige = false; D.fade = 0; D.switching = false; }

export async function stop() {
  if (D.act === 'reste') { await restoreCity(); }
  D.act = null; resetFlags();
  setUnrest(false);
  lamps(true);
  const CM = CMr();
  if (CM) { CM.zoomGoal = CM.cam.zoom; CM.rioters && (CM.rioters.length = 0); }
  emit();
}
export async function actFige() {
  if (D.act === 'reste' || D.act === 'chute') await stop();
  const CM = CMr(), L = CM.layout;
  D.act = 'fige'; D.t0 = performance.now(); resetFlags();
  // L'émeute se lève près du cœur (une case de rue voisine), pour qu'on la voie.
  const core = (L.plan && L.plan.core) ? L.plan.core : { x: L.cx, y: L.cy };
  let best = null, bd = Infinity;
  for (const c of CM.walkRoadList || []) { const d = Math.hypot(c.gx - core.x - 3, c.gy - core.y - 2); if (d < bd) { bd = d; best = c; } }
  D.riotCell = best ? { gx: best.gx, gy: best.gy } : null;
  if (CM.rioters) CM.rioters.length = 0;
  setUnrest(true);
  lamps(true);
  emit();
}
export async function actNuit() {
  if (D.act === 'reste') await stop();
  D.fromFige = D.act === 'fige';
  prepareWave();
  const CM = CMr();
  D.cit0 = CM.citizens.length; D.riot0 = CM.rioters ? CM.rioters.length : 0;
  D.act = 'nuit'; D.t0 = performance.now(); D.ended = false; D.pulled = false; D.frozen = false;
  D.fade = 0; D.switching = false; D.lampsOff = false;
  emit();
}
export async function actChute() {
  if (D.act === 'reste') await stop();
  D.fromFige = D.act === 'fige';
  prepareWave();
  D.act = 'chute'; D.t0 = performance.now(); D.ended = false; D.pulled = false; D.frozen = false; D.fade = 0; D.switching = false;
  lamps(false);
  emit();
}

// ── LA CITÉ DEBOUT, GARDÉE POUR REJOUER ────────────────────────────────────────
let cityBackup = null;
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
function backupCity() {
  const s = window.__state;
  cityBackup = {
    population: s.population, knowledge: s.knowledge, infrastructure: s.infrastructure,
    buildings: { ...s.buildings }, cityMapSlots: clone(s.cityMapSlots), cityCore: clone(s.cityCore),
    cityRoads: clone(s.cityRoads), cityArchetype: s.cityArchetype, cycles: s.cycles, riverWP: clone(s.riverWP),
    cityName: s.cityName,
  };
}
async function pump(n = 8, ms = 90) {
  const CM = CMr();
  for (let i = 0; i < n; i += 1) { CM.forceFrame(); await yieldTask(ms); }
}
export async function restoreCity() {
  const s = window.__state;
  if (!cityBackup) {
    await window.__demoCity({ pop: '1e22' });
    backupCity();
    D.relics = null;
    return;
  }
  for (const [k, v] of Object.entries(cityBackup)) s[k] = (v && typeof v === 'object' && !v.mantissa && k !== 'population' && k !== 'knowledge' && k !== 'infrastructure') ? clone(v) : v;
  D.act = null; D.relicLayout = null; D.fade = 0; D.switching = false;
  lamps(true);
  window.__cityRecompute();
  await pump(6);
  const CM = CMr();
  if (CM.born) for (const k of Object.keys(CM.born)) CM.born[k] = -1e6;
  emit();
}

// Relève la recette de chaque ruine en promenant la caméra sur toute la cité
// (au zoom courant : les cadres arrondis sont ceux qu'on verra).
async function recordAll() {
  const CM = CMr(), L = CM.layout, T = CM.TILE;
  prepareWave();
  D.recording = new Map();
  const prevAct = D.act;
  D.act = 'record';
  const cam0 = { x: CM.cam.x, y: CM.cam.y, z: CM.cam.zoom };
  CM.cam.zoom = snapZoom(TUNE.resteZoom);
  // Relevé HORS ÉCRAN : la carte visible garde sa dernière image pendant ce temps.
  const screenCtx = CM.ctx;
  const off = document.createElement('canvas');
  off.width = CM.canvas.width; off.height = CM.canvas.height;
  CM.ctx = off.getContext('2d');
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const t of L.tiles) {
    if (t.type === 'house' || t.type === 'enginehome' || t.type === 'engine') {
      x0 = Math.min(x0, t.gx); y0 = Math.min(y0, t.gy); x1 = Math.max(x1, t.gx + 3); y1 = Math.max(y1, t.gy + 3);
    }
  }
  const step = Math.min(CM.cw, CM.ch) / CM.cam.zoom / 2.2;
  try {
    for (let wy = y0 * T; wy <= y1 * T + step; wy += step) {
      for (let wx = x0 * T; wx <= x1 * T + step; wx += step) {
        CM.cam.x = wx; CM.cam.y = wy; CM.camGoal = null; CM.zoomGoal = CM.cam.zoom; CM.panVel = null;
        CM.forceFrame();
      }
      await yieldTask(0);
    }
  } finally {
    CM.ctx = screenCtx;
    CM.cam.x = cam0.x; CM.cam.y = cam0.y; CM.cam.zoom = cam0.z; CM.zoomGoal = cam0.z;
  }
  D.relics = D.recording;
  D.recording = null;
  D.act = prevAct;
  return D.relics.size;
}

function toCamp() {
  const s = window.__state, Dd = window.__D;
  s.population = Dd(24); s.knowledge = Dd(0); s.infrastructure = Dd(0);
  for (const k of Object.keys(s.buildings)) s.buildings[k] = 0;
  s.cycles = (cityBackup.cycles || 0) + 1;
  s.cityMapSlots = {}; s.cityRoads = null;
  const c = cityBackup.cityCore || {};
  s.cityCore = { seed: c.seed, dx: c.dx, dy: c.dy, bx: c.bx, maxN: c.maxN };
  s.riverWP = clone(cityBackup.riverWP);
  window.__cityRecompute();
}

export async function actReste() {
  if (D.act === 'reste') await restoreCity();
  if (!cityBackup) backupCity();
  D.fade = 1;                                   // le passage du temps se fait dans le noir
  if (!D.relics) await recordAll();
  setUnrest(false);
  toCamp();
  D.act = 'reste'; D.relicLayout = null; D.t0 = performance.now() + 1e9;   // noir tenu
  D.switching = false;
  lamps(true);
  await pump(6, 40);
  placeCam(TUNE.resteZoom);
  await pump(2, 40);
  D.t0 = performance.now();
  emit();
}
// Caméra posée net (sans vol) sur le cœur.
function placeCam(zoom) {
  const CM = CMr(), L = CM.layout;
  const core = (L.plan && L.plan.core) ? L.plan.core : { x: L.cx, y: L.cy };
  CM.cam.x = (core.x + 0.5) * CM.TILE; CM.cam.y = (core.y + 0.5) * CM.TILE;
  CM.cam.zoom = snapZoom(zoom);
  CM.zoomGoal = CM.cam.zoom; CM.camGoal = null; CM.panVel = null;
}

// Capture d'un instant de l'acte (ms) → .preview-shots/<name>.png, plein cadre.
export async function shot(name, ms = null, opts = {}) {
  D.scrub = ms;
  try { return await window.__cityShot({ name, ...opts }); }
  finally { D.scrub = null; }
}

// Capture BRUTE : une frame normale (pas le mode capture du jeu, qui purge les
// émeutiers et force le plein jour), telle que le joueur la voit.
export async function rawShot(name, ms = null) {
  const CM = CMr();
  D.scrub = ms;
  try { CM.forceFrame(); } finally { D.scrub = null; }
  const blob = await new Promise((r) => CM.canvas.toBlob(r, 'image/png'));
  const res = await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
  return res.ok ? res.json() : { err: res.status };
}

// Image de « film » : un instant de l'acte, recadré au centre (px canvas, 1:1), en JPEG.
// (le middleware /__shot nomme tout en .png : on renomme ensuite)
export async function filmShot(name, ms, w = 1280, h = 720, q = 0.86) {
  const CM = CMr();
  D.scrub = ms;
  try { CM.forceFrame(); } finally { D.scrub = null; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(CM.canvas, Math.round((CM.canvas.width - w) / 2), Math.round((CM.canvas.height - h) / 2), w, h, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
  const res = await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
  return res.ok ? blob.size : -1;
}

// Cadre de référence : le cœur de la cité au centre, zoom de jeu.
export function frameCore(zoom = 1) {
  const CM = CMr(), L = CM && CM.layout;
  if (!L) return;
  const core = (L.plan && L.plan.core) ? L.plan.core : { x: L.cx, y: L.cy };
  CM.camGoal = { x: (core.x + 0.5) * CM.TILE, y: (core.y + 0.5) * CM.TILE };
  CM.zoomAnchor = { mx: CM.cw / 2, my: CM.ch / 2 };
  CM.zoomGoal = snapZoom(zoom);
  CM.panVel = null;
}

// La partie de démo ne doit pas vivre sa vie pendant qu'on filme : on coupe la
// boucle de jeu (crises, achats, sauvegarde) — la carte, elle, tourne sur rAF.
export function freezeGame() {
  for (let i = 1; i < 1e5; i += 1) clearInterval(i);
  const s = window.__state;
  if (s) { s.instability = Math.min(s.instability || 0, 0.3); s.timeWear = Math.min(s.timeWear || 0, 0.3); }
}

export async function init() {
  await Ruins.load();
  const wait = () => yieldTask(250);
  for (let i = 0; i < 80 && !(window.__CM && window.__CM.layout); i += 1) await wait();
  freezeGame();
  // La maquette n'écrit plus la partie : un rechargement retrouve la cité debout.
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('civ-opt-')) return setItem.call(this, k, v); };
  const CM = CMr();
  if (CM && CM.layout && (CM.layout.counts.eraBand | 0) >= 2) backupCity();
  window.__chute = { D, TUNE, Ruins, actFige, actChute, actReste, restoreCity, stop, frameCore, freezeGame, shot, rawShot, pump, placeCam, yieldTask, actNuit, setEra, filmShot };
}
export { depthOf };

// Rendre la main SANS minuterie : un onglet caché bride les setTimeout (jusqu'à un
// par minute), pas les messages. On laisse quand même passer le temps demandé.
export function yieldTask(ms = 0) {
  const until = performance.now() + ms;
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { if (performance.now() >= until) resolve(); else ch.port2.postMessage(0); };
    ch.port2.postMessage(0);
  });
}

// Changer d'âge (démo) : une cité de cet âge, gardée comme « cité debout ».
export async function setEra(pop) {
  await stop();
  await window.__demoCity({ pop });
  freezeGame();
  backupCity();
  D.relics = null;
  placeCam(TUNE.resteZoom);
  emit();
}
