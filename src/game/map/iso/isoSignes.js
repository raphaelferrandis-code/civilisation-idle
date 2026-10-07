// LES SIGNES À L'ÉCRAN (docs/PLAN-ECOUTER-PARLER.md, lot 4).
//
// Le vent, la lumière et le feu que le joueur fait au passant désigné (la décision est
// dans paroles/signs.js ; la bête, elle, se tourne dans son propre dessin). Des
// phénomènes NATURELS seulement (§ 5.4, « trop IA » rejeté) :
//   · LE VENT : une rafale qui passe sur lui. Les feuilles de la saison (la neige en
//     hiver, une poussière pâle aux âges cosmiques) arrivent d'un côté, s'enroulent
//     autour de lui et filent ; un peu de poussière se lève à ses pieds. Chaque feuille
//     est au tri du peintre, à sa place : elle passe devant ou derrière lui.
//   · LA LUMIÈRE : le jour du jeu vient d'en haut à gauche ; un rayon en descend
//     jusqu'à lui, comme par un trou dans les nuages, et pose une flaque claire à ses
//     pieds (la lune, la nuit). Couche de lumière, juste après lui au tri : elle
//     l'éclaire, et ce qui passe devant la coupe.
//   · LE FEU : sa lueur grandit (flameGlow, FIRE_BOOST), des langues de feu montent
//     au-dessus, dans les encres de la rampe rouge, et des étincelles s'envolent.
// Ni orbe, ni halo, ni anneau ; muets jusqu'à la fin du chantier « ambiance sonore ».
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { registerVieActors, registerVieAir, vieK, vieSprite, vieBlit, viePixel, vieGenerated, vieBlitAt } from './isoVie.js';
import { LEAF_KINDS, puffSprite } from './vieArt.js';
import { isoUnitDepthEx } from './isoUnits.js';
import { lightCtx } from '../lightLayer.js';
import { FIRE_BOOST, FIRE_INK } from '../flameGlow.js';
import { signTick, signEnvelope } from '../paroles/signs.js';

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const bandNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Un tirage stable par particule (pas de Math.random par frame : rien ne clignote).
const h01 = (seed, i, k) => {
  let x = (seed ^ Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(k + 7, 0x85EBCA6B)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7FEB352D) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846CA68B) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

// ── LE VENT ──────────────────────────────────────────────────────────────────
// TUNE : n feuilles, la longueur du trajet (cases), sa durée (ms), l'étalement des
// départs, l'écart de part et d'autre de lui (cases), la hauteur de vol (cases), et
// la traînée de poussière (puffs bouffées).
// Ce qui vole passe AU-DESSUS du sol et du platelage de sa case (lift, en cases de clé
// peintre) : à sa seule profondeur, une feuille qui survole un ponton passait dessous.
export const WIND_SIGN = { n: 22, path: 5.2, life: 1500, spread: 560, side: 0.95, alt: 0.62, puffs: 7, lift: 0.6 };
const DUST = [[214, 196, 160], [190, 170, 136], [158, 140, 112]];
function windParticleKind(i, seed) {
  const band = bandNow();
  if (band >= 7) return 'mote';
  if ((CM.season | 0) === 3) return 'snow';
  const r = h01(seed, i, 3);
  // Ce que le vent soulève, ce sont les feuilles SÈCHES (or, ambre, rouille) : une
  // feuille verte disparaît sur l'herbe. L'automne y mêle un peu de vert qui traîne.
  if ((CM.season | 0) === 2) return LEAF_KINDS[Math.floor(r * LEAF_KINDS.length)];
  return r < 0.4 ? 'leafE' : r < 0.75 ? 'leaf' : r < 0.9 ? 'leafU' : 'leafM';
}
function pushWind(S, now, out) {
  const W = S.wind, T = CM.TILE || 32, t = now - S.t0;
  const px = -W.gy, py = W.gx;                 // la perpendiculaire au vent
  const lift = WIND_SIGN.lift * T;
  for (let i = 0; i < WIND_SIGN.n; i += 1) {
    const d0 = h01(W.seed, i, 0) * WIND_SIGN.spread;
    const life = WIND_SIGN.life * (0.8 + 0.4 * h01(W.seed, i, 1));
    const s = (t - d0) / life;
    if (s <= 0 || s >= 1) continue;
    const side = (h01(W.seed, i, 2) * 2 - 1) * WIND_SIGN.side;
    // Elle passe SUR lui : l'écart se resserre en le croisant, puis se rouvre.
    const lat = side * (1 - 0.55 * Math.sin(Math.PI * s)) + 0.25 * Math.sin(s * 9 + i);
    const along = (s - 0.5) * WIND_SIGN.path;
    const wx = S.feet.x + (W.gx * along + px * lat) * T;
    const wy = S.feet.y + (W.gy * along + py * lat) * T;
    const alt = T * (0.12 + WIND_SIGN.alt * Math.sin(Math.PI * s) * (0.6 + 0.6 * h01(W.seed, i, 4)) + 0.08 * Math.sin(s * 14 + i * 2));
    const kind = windParticleKind(i, W.seed);
    const a = Math.min(1, Math.sin(Math.PI * s) * 2.2);
    const fr = Math.floor(s * 14 + i) & 3;
    out.push({
      wx, wy, d: depthOf(wx, wy) + lift,
      draw(ctx) {
        const z = (CM.cam && CM.cam.zoom) || 1, k = vieK();
        const p = worldToScreen(wx, wy);
        const y = p.y - alt * z;
        if (kind === 'snow') viePixel(ctx, p.x, y, k, [242, 246, 250], a);
        else if (kind === 'mote') viePixel(ctx, p.x, y, k, [232, 226, 210], a * 0.85);
        else vieBlit(ctx, vieSprite(kind, fr, (i & 1) === 1), p.x, y, k, a);
      },
    });
  }
  // La poussière (la neige) que la rafale soulève : une traînée de bouffées qui part
  // d'avant lui, passe à ses pieds et file avec le vent en grossissant.
  if (bandNow() <= 6) {
    const pal = (CM.season | 0) === 3 ? undefined : DUST;
    for (let j = 0; j < WIND_SIGN.puffs; j += 1) {
      const d0 = 60 + j * 120, s = (t - d0) / 1000;
      if (s <= 0 || s >= 1) continue;
      const off = -1.4 + s * 2.8;
      const sd = (h01(W.seed, j, 9) - 0.5) * 0.7;
      const wx = S.feet.x + (W.gx * off + px * sd) * T;
      const wy = S.feet.y + (W.gy * off + py * sd) * T;
      const r = 1 + Math.round(s * 2.4);
      const a = 0.7 * Math.min(1, s * 5) * (1 - s);
      out.push({
        wx, wy, d: depthOf(wx, wy) + lift * 0.5,
        draw(ctx) {
          const k = vieK(), z = (CM.cam && CM.cam.zoom) || 1;
          const p = worldToScreen(wx, wy);
          const img = vieGenerated('puff:sign:' + r + ':' + (pal ? 'd' : 'w'), () => puffSprite(r, pal));
          vieBlitAt(ctx, img, p.x, p.y - (2 + s * 5) * z, k, a);
        },
      });
    }
  }
}

// ── LA LUMIÈRE ───────────────────────────────────────────────────────────────
// Le rayon : un ruban oblique aux bords doux, venu d'en haut à gauche (la lumière du
// jeu), plus fort en bas qu'en haut ; la flaque : une ellipse couchée (le sol iso).
// col/a : jour, nuit ; len/slant en cases ; w = largeur du rayon (cases).
export const LIGHT_SIGN = {
  day: { col: '255,234,186', beam: 0.17, pool: 0.30 },
  night: { col: '214,218,230', beam: 0.22, pool: 0.38 },
  len: 9, slant: 0.42, w: 0.55, poolR: 1.25,
};
const _beams = new Map();
function beamTex(col) {
  if (_beams.has(col)) return _beams.get(col);
  let cv = null;
  if (typeof document !== 'undefined') {
    cv = document.createElement('canvas');
    cv.width = 32; cv.height = 128;
    const g = cv.getContext('2d');
    if (g) {
      const im = g.createImageData(32, 128);
      const [r, gg, b] = col.split(',').map(Number);
      for (let y = 0; y < 128; y += 1) {
        const v = y / 127;
        const len = smooth(0, 0.8, v) * (1 - 0.35 * smooth(0.93, 1, v));
        for (let x = 0; x < 32; x += 1) {
          const u = x / 31;
          const edge = smooth(0, 0.38, u) * smooth(0, 0.38, 1 - u);
          const i = (y * 32 + x) * 4;
          im.data[i] = r; im.data[i + 1] = gg; im.data[i + 2] = b;
          im.data[i + 3] = Math.round(255 * edge * len);
        }
      }
      g.putImageData(im, 0, 0);
    } else cv = null;
  }
  _beams.set(col, cv);
  return cv;
}
const _pools = new Map();
function poolTex(col) {
  if (_pools.has(col)) return _pools.get(col);
  let cv = null;
  if (typeof document !== 'undefined') {
    cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    if (g) {
      const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, `rgba(${col},1)`);
      rg.addColorStop(0.55, `rgba(${col},0.55)`);
      rg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = rg;
      g.fillRect(0, 0, 64, 64);
    } else cv = null;
  }
  _pools.set(col, cv);
  return cv;
}
function paintLight(c, S, now) {
  const k = signEnvelope(S, now);
  if (k <= 0.01) return;
  const night = (CM.nightF || 0) > 0.55;
  const L = night ? LIGHT_SIGN.night : LIGHT_SIGN.day;
  const z = (CM.cam && CM.cam.zoom) || 1, T = (CM.TILE || 32) * z;
  const f = worldToScreen(S.feet.x, S.feet.y);
  const H = LIGHT_SIGN.len * T, Wd = LIGHT_SIGN.w * T * 2;
  const rx = LIGHT_SIGN.poolR * T, ry = rx / 2;
  const x0 = f.x - H * LIGHT_SIGN.slant - Wd, x1 = f.x + Math.max(Wd, rx);
  const y0 = f.y - H, y1 = f.y + ry;
  const lc = lightCtx(x0, y0, x1, y1);
  const g = lc || c;
  const beam = beamTex(L.col), pool = poolTex(L.col);
  g.save();
  if (!lc) g.globalCompositeOperation = 'lighter';
  g.imageSmoothingEnabled = true;
  if (pool) {
    g.globalAlpha = L.pool * k;
    g.drawImage(pool, f.x - rx, f.y - ry, rx * 2, ry * 2);
  }
  if (beam) {
    // Le ruban : son pied sur lui, sa tête décalée vers la gauche (cisaillement).
    g.globalAlpha = L.beam * k;
    g.translate(f.x, f.y - T * 0.05);
    g.transform(1, 0, LIGHT_SIGN.slant, 1, 0, 0);
    g.drawImage(beam, -Wd / 2, -H, Wd, H);
  }
  g.restore();
}

// ── LE FEU ───────────────────────────────────────────────────────────────────
// La flamme du feu ne se redessine pas : elle est le sprite de son site (foyer du camp,
// brasero, torche de pont). Ce qui dit qu'il MONTE, c'est ce qui en sort : des langues
// qui se détachent du haut de la flamme et s'élèvent en rapetissant, et une gerbe
// d'étincelles qui file bien plus haut que d'habitude, dans les encres de la rampe
// (FIRE_INK). Tout se cale sur le rayon de sa lueur (sr), qui suit la taille du feu :
// la flamme fait environ sr de haut au-dessus du centre de la lueur.
// Passe aérienne : au-dessus de ce qui entoure le feu, avant le voile de nuit (comme
// les flammes elles-mêmes, que la lueur ravive ensuite).
export const FIRE_SIGN = { tongues: 3, tongueMs: 560, sparks: 30, sparkMs: 1150, rise: 2.6 };
// Une langue, de la pointe à la base : 3 de large au plus, en pixels d'art.
const TONGUE = ['.h.', '.c.', 'hch', 'hbh', '.b.'];
const INK = { b: FIRE_INK.body, h: FIRE_INK.hot, c: FIRE_INK.core };
function drawFireFlare(ctx, now) {
  const B = FIRE_BOOST;
  if (!B.on || !B.seen || B.k <= 0.02) return;
  const S = CM.sign;
  if (!S || !S.fire) return;
  const k = B.k, t = now - S.t0, sr = B.sr;
  const u = Math.max(1, Math.min(5, Math.round(sr / 11)));
  const cx = B.sx, top = B.sy - sr * 0.55;          // le haut de la flamme, à peu près
  const prevA = ctx.globalAlpha;
  const px = (x, y, col, s = 1) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), u * s, u * s); };
  // Les langues : chacune part du haut de la flamme, monte d'une demi-flamme et plus,
  // rétrécit d'une rangée en route, s'éteint ; trois en décalé.
  for (let i = 0; i < FIRE_SIGN.tongues; i += 1) {
    const q = (((t / FIRE_SIGN.tongueMs) + i / FIRE_SIGN.tongues) % 1 + 1) % 1;
    const rows = q < 0.45 ? TONGUE : TONGUE.slice(0, 3);
    const x0 = cx + (i - (FIRE_SIGN.tongues - 1) / 2) * sr * 0.22 + Math.sin(q * 6.3 + i * 2) * u - 1.5 * u;
    const y0 = top - q * sr * 1.1 - rows.length * u;
    ctx.globalAlpha = prevA * Math.min(1, k * 1.5) * (1 - q * q);
    for (let r = 0; r < rows.length; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const ch = rows[r][c];
        if (ch !== '.') px(x0 + c * u, y0 + r * u, INK[ch]);
      }
    }
  }
  // La gerbe : des étincelles qui filent haut en dérivant, d'or, puis orange, puis
  // rouge braise ; les premières d'un pixel double.
  for (let i = 0; i < FIRE_SIGN.sparks; i += 1) {
    const born = (i / FIRE_SIGN.sparks) * 2700 + h01(S.t0 | 0, i, 1) * 160;
    const s = (t - born) / FIRE_SIGN.sparkMs;
    if (s <= 0 || s >= 1) continue;
    const r = h01(S.t0 | 0, i, 2), r2 = h01(S.t0 | 0, i, 3);
    const lift = sr * (FIRE_SIGN.rise * (0.6 + 0.6 * r2)) * (1 - (1 - s) * (1 - s));
    const x = cx + (r - 0.5) * sr * 0.6 + (r - 0.5) * sr * 0.9 * s + Math.sin(s * 7 + i) * u;
    const y = top + sr * 0.15 - lift;
    ctx.globalAlpha = prevA * Math.min(1, k * 2) * (1 - s * s);
    px(x, y, s < 0.35 ? FIRE_INK.core : s < 0.7 ? FIRE_INK.hot : FIRE_INK.body, s < 0.25 && r2 > 0.6 ? 2 : 1);
  }
  ctx.globalAlpha = prevA;
}

// ── BRANCHEMENTS ─────────────────────────────────────────────────────────────
// Le fournisseur d'acteurs tourne une fois par frame, AVANT la passe du peintre : c'est
// là que la scène avance (signTick) et que le feu attisé reçoit sa position attendue.
registerVieActors((_now, out) => {
  const now = clock();
  FIRE_BOOST.seen = false;
  const S = signTick(now);
  if (!S) return;
  if (S.fire && CM.cam) {
    const e = worldToScreen(S.fire.W.x, S.fire.W.y);
    FIRE_BOOST.x = e.x; FIRE_BOOST.y = e.y;
    FIRE_BOOST.tol = Math.max(6, (CM.TILE || 32) * CM.cam.zoom * 0.3);
  }
  if (S.kind === 'wind' && S.wind) pushWind(S, now, out);
  else if (S.kind === 'light') {
    const fx = S.p.x + (S.p.lox || 0), fy = S.p.y + (S.p.loy || 0);
    S.feet = { x: fx, y: fy };
    out.push({ wx: fx, wy: fy, d: isoUnitDepthEx(fx, fy).d + 0.5, draw(ctx) { paintLight(ctx, S, clock()); } });
  }
});
registerVieAir((ctx) => drawFireFlare(ctx, clock()));
