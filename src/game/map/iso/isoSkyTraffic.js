"use strict";
// ── LE CIEL HABITÉ (bandes 7-9) — lot 1 des « étages de la ville » ───────────
// docs/PLAN-ETAGES.md fait foi. Validé par Raph sur maquette le 2026-10-02.
//
// Des COULOIRS AÉRIENS fixes, des véhicules qui les suivent, des habitants en
// jetpack. Pur f(now) : aucune simulation, aucun état — une capture à `now` figé
// est déterministe, et le coût ne dépend que de ce qui est à l'écran.
//
// LES TROIS RÈGLES QUI TIENNENT L'ILLUSION :
//   1. Un couloir suit une GRANDE RUE DROITE, jamais le travers d'un îlot. Le
//      peintre trie un objet volant à l'aplomb de son pied ; un pied qui tombe
//      dans l'emprise d'une tour ferait sauter le véhicule de derrière à devant
//      la tour en pleine traversée. Au-dessus d'une rue, l'aplomb est libre.
//   2. Les couloirs en x et en y volent à des HAUTEURS DIFFÉRENTES : pas de
//      croisement à niveau, comme les règles de l'air.
//   3. Une OMBRE au sol (décision de Raph, 2026-10-02) dit l'altitude ; elle est
//      décalée vers le bas-droite, comme toutes les ombres du jeu (soleil
//      haut-gauche), et triée à SON aplomb : ce qui est devant elle la couvre.
//
// Nuit : phares, feux arrière et une courte traînée passent par le calque de
// lumière occultée (lightLayer) — déposés pendant la passe vivante, posés après
// le voile, découpés par ce qui est devant.
//
// Molette : __skyTraffic({ on, density, shadow, trails, beacons, jets }).
import { CM } from '../layout.js';
import { worldToScreen, screenToWorld, depthOf } from './projection.js';
import { lightCtx } from '../lightLayer.js';
import { vieK } from './isoVie.js';
import { drawEraAgentIso } from '../agents.js';
import { muteSunShadow } from './isoSunShadow.js';
import { boxShapes, bakeShapes, blitBaked, makeBakeCache, artKdAt, elevGlow as glowAt } from './elevPaint.js';
import { floatIsleSpan } from './isoFloatIsle.js';

export const SKY = { on: true, density: 1, shadow: 0.35, trails: 1, beacons: 1, jets: 1, gates: 1, minZoom: 0.42 };

// Par bande : hauteurs (en tuiles) des couloirs en x et en y, écart minimal entre deux
// couloirs parallèles (cellules), part de véhicules gardés, pas entre véhicules (base +
// écart, en tuiles), couloirs au-dessus du fleuve (paires), nombre de jetpacks. Sous la bande 7 : ciel vide.
export const SKY_BANDS = {
  7: { tiers: { x: [1.45], y: [1.95] }, sep: 16, keep: 0.45, gap: [3.4, 2.2], river: 0, jets: 0 },
  8: { tiers: { x: [2.6], y: [3.9] }, sep: 9, keep: 0.8, gap: [2.4, 1.8], river: 1, jets: 12 },
  9: { tiers: { x: [2.6, 5.2], y: [3.9] }, sep: 7, keep: 0.9, gap: [2.0, 1.6], river: 2, jets: 22 },
};

// Palettes d'ère : carrosserie (dessus, flanc éclairé, flanc à l'ombre), vitrage,
// contour, lueur de sustentation, feux arrière.
const PAL = {
  7: { body: ['#eef6f0', '#cfe3d6', '#9fc2ae'], glass: '#3f8fb0', dark: '#24382c', glow: '150,255,210', tail: '255,80,80' },
  8: { body: ['#fbf3dc', '#ead9a8', '#c9ad6a'], glass: '#4fb3a0', dark: '#40341c', glow: '255,220,140', tail: '255,96,60' },
  9: { body: ['#f4f1fb', '#dcd4ee', '#b8acd6'], glass: '#8a6fd8', dark: '#3a3050', glow: '120,230,255', tail: '255,90,200' },
};
const KIND_BODY = {
  1: ['#ffe9a8', '#f2c75c', '#c8962e'],   // taxi
  3: ['#c8f2ee', '#7fd6cf', '#4aa39c'],
  4: ['#f6c9e4', '#e08cc0', '#a85a8c'],
};

// Hash entier → [0, 1). Les tirages sont faits en repère du CENTRE de grille
// (leçon des routes : un tirage en absolu glisse quand la grille grandit).
export function h01(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

// ── LES COULOIRS ─────────────────────────────────────────────────────────────
// Tronçons de rue droits (cellules de route consécutives sur une rangée ou une
// colonne), places exclues, DANS LA VILLE seulement (`urban` : les plus longues
// lignes droites de la carte sont les routes de campagne — un ciel au-dessus des
// champs ne raconte rien). Rend [{ axis, c, a, b }] en CELLULES (b exclu).
export function roadRuns(roadSet, roadMap, minLen, urban = null) {
  const rows = new Map(), cols = new Map();
  for (const k of roadSet) {
    const m = roadMap && roadMap.get(k);
    if (m && m.rank === 'plaza') continue;
    if (urban && !urban.has(k)) continue;
    const i = k.indexOf(',');
    const x = +k.slice(0, i), y = +k.slice(i + 1);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
    if (!cols.has(x)) cols.set(x, []);
    cols.get(x).push(y);
  }
  const runs = [];
  const scan = (map, axis) => {
    for (const [c, arr] of map) {
      arr.sort((p, q) => p - q);
      let a = arr[0], prev = arr[0];
      for (let j = 1; j <= arr.length; j += 1) {
        const v = arr[j];
        if (v === prev + 1) { prev = v; continue; }
        if (prev + 1 - a >= minLen) runs.push({ axis, c, a, b: prev + 1 });
        a = v; prev = v;
      }
    }
  };
  scan(rows, 'x'); scan(cols, 'y');
  return runs;
}

// Choisit les couloirs : les tronçons les plus longs d'abord, écartés d'au moins
// `cfg.sep` cellules d'un couloir parallèle qui les chevauche — un quadrillage qui
// couvre toute la ville, pas une grappe autour des plus grandes rues.
// Chaque couloir = deux voies à contresens (±0,22 tuile), à la hauteur de son axe.
export function pickLanes(runs, cfg, cx, cy, T) {
  const sorted = runs.slice().sort((p, q) => (q.b - q.a) - (p.b - p.a) || p.c - q.c || p.a - q.a);
  const chosen = { x: [], y: [] };
  for (const r of sorted) {
    const list = chosen[r.axis];
    if (list.some((o) => Math.abs(o.c - r.c) < cfg.sep && o.a < r.b && r.a < o.b)) continue;
    list.push(r);
  }
  const lanes = [];
  for (const axis of ['x', 'y']) {
    const tiers = cfg.tiers[axis];
    chosen[axis].forEach((r, i) => {
      // tirages en repère du centre : la même rue garde ses voies quand la grille grandit
      const rel = (axis === 'x' ? r.c - cy : r.c - cx) * 131 + (axis === 'x' ? 7 : 13);
      const alt = tiers[i % tiers.length] * T;
      for (const dir of [1, -1]) {
        const id = rel * 4 + (dir > 0 ? 1 : 2);
        lanes.push({
          id, axis, dir, alt,
          c: (r.c + 0.5) * T + dir * 0.22 * T, row: r.c,
          a: (r.a + 0.3) * T, b: (r.b - 0.3) * T,
          speed: (1.6 + h01(id * 5) * 0.7) * T,
          gap: (cfg.gap[0] + h01(id * 3) * cfg.gap[1]) * T,
          off: h01(id * 11) * 97 * T,
        });
      }
    });
  }
  return lanes;
}

// Au-dessus du FLEUVE : rien à traverser, le plus beau couloir de la ville. Il suit
// la ligne d'eau (riverYAt, en cellules) sur toute la longueur où elle coule, à la
// hauteur des couloirs en x ; `pairs` paires de voies, de part et d'autre du milieu.
export function riverLanes(river, N, pairs, tiers, T) {
  if (!river || !river.present || typeof river.riverYAt !== 'function' || !(pairs > 0)) return [];
  let a = -1, b = -1;
  for (let x = 0; x < N; x += 1) {
    const y = Math.round(river.riverYAt(x));
    const wet = typeof river.isWater === 'function' ? river.isWater(x, y) : true;
    if (wet) { if (a < 0) a = x; b = x + 1; }
  }
  if (a < 0 || b - a < 12) return [];
  const lanes = [];
  for (let p = 0; p < pairs; p += 1) {
    const side = (p % 2 ? -1 : 1) * (0.9 + Math.floor(p / 2) * 1.4);
    const alt = tiers[p % tiers.length] * T;
    for (const dir of [1, -1]) {
      const id = 900001 + p * 4 + (dir > 0 ? 1 : 2);
      lanes.push({
        id, axis: 'x', dir, alt, river: true,
        c: 0, cOff: (side + dir * 0.22) * T,
        a: a * T, b: b * T,
        speed: (1.8 + h01(id * 5) * 0.6) * T,
        gap: (1.6 + h01(id * 3) * 1.2) * T,
        off: h01(id * 11) * 97 * T,
      });
    }
  }
  return lanes;
}

let _lanesFor = null, _lanesBand = -1, _lanes = [], _runs = [];
function lanesOf(L, band) {
  if (_lanesFor === L && _lanesBand === band) return _lanes;
  const cfg = SKY_BANDS[band];
  _runs = cfg && L.roadSet ? roadRuns(L.roadSet, L.roadMap, 12, L.urbanSet && L.urbanSet.size ? L.urbanSet : null) : [];
  _lanes = cfg ? [...pickLanes(_runs, cfg, L.cx, L.cy, CM.TILE), ...riverLanes(L.river, L.gridN, cfg.river, cfg.tiers.x, CM.TILE)] : [];
  _lanesFor = L; _lanesBand = band;
  return _lanes;
}
// Ordonnée monde d'une voie à l'abscisse wx (le couloir du fleuve suit l'eau).
function laneY(lane, wx, L, T) {
  return lane.river ? L.river.riverYAt(wx / T) * T + lane.cOff : lane.c;
}

// Positions des véhicules d'un couloir à l'instant t (s) : pas régulier + gigue,
// trous tirés (part `keep`), fondu aux deux bouts du tronçon (le véhicule « se
// pose » plutôt que d'apparaître). Pur — c'est ce que les gardes vérifient.
// Un couloir de rue finit dans une PORTE (anneau sur mât) : le véhicule y apparaît
// et s'y efface sur GATE_FADE tuile — retour Raph : les voitures volantes
// « disparaissent à la fin d'une route ». Au-dessus du fleuve (pas de porte), le
// fondu reste long : les bouts du fleuve sont hors de la ville.
export const GATE_FADE = 0.35;
export function laneCars(lane, t, keep, T) {
  const len = lane.b - lane.a;
  if (len <= 0) return [];
  const n = Math.floor(len / lane.gap);
  const out = [];
  const fl = (lane.river ? 1.5 : GATE_FADE) * T;
  for (let i = 0; i < n; i += 1) {
    if (h01(lane.id * 31 + i) >= keep) continue;
    const base = t * lane.speed * lane.dir + i * lane.gap + h01(lane.id * 97 + i) * lane.gap * 0.6 + lane.off;
    const s = ((base % len) + len) % len;
    const fade = Math.min(1, Math.min(s, len - s) / fl);
    const r1 = h01(lane.id * 17 + i), r2 = h01(lane.id * 19 + i);
    const kind = r1 < 0.1 ? 2 : r2 < 0.12 ? 1 : r2 < 0.24 ? 3 : r2 < 0.32 ? 4 : 0;
    out.push({ s: lane.a + s, fade, kind, i });
  }
  return out;
}

// ── IMAGES CUITES ────────────────────────────────────────────────────────────
const _bakes = makeBakeCache(400);
function dims(kind, T) {
  return kind === 2 ? { Lh: 0.36 * T, Wh: 0.11 * T, H: 0.12 * T } : kind === 'jet' ? { Lh: 0.07 * T, Wh: 0.05 * T, H: 0 } : { Lh: 0.18 * T, Wh: 0.085 * T, H: 0.075 * T };
}
// (u, v) = (le long du couloir, en travers) → (x, y) monde
const uv = (ax, u0, u1, v0, v1) => (ax ? [u0, v0, u1, v1] : [v0, u0, v1, u1]);
function carShapes(band, kind, axis, dir, T) {
  const pal = PAL[band] || PAL[9];
  const body = KIND_BODY[kind] || pal.body;
  const { Lh, Wh, H } = dims(kind, T);
  const ax = axis === 'x';
  const B = (u0, u1, v0, v1, z0, z1, cT, cL, cR, out) => { const [x0, y0, x1, y1] = uv(ax, u0, u1, v0, v1); return boxShapes(x0, y0, x1, y1, z0, z1, cT, cL, cR, out); };
  const s = [];
  // ventre sombre (la sustentation), carrosserie, verrière vers l'avant
  s.push(...B(-Lh * 0.7, Lh * 0.7, -Wh * 0.8, Wh * 0.8, -H * 0.45, 0, null, pal.dark, pal.dark, null));
  s.push(...B(-Lh, Lh, -Wh, Wh, 0, H, body[0], body[1], body[2], pal.dark));
  const f = dir * Lh * (kind === 2 ? 0 : 0.15), gl = Lh * (kind === 2 ? 1.5 : 0.9), gh = kind === 2 ? H * 0.7 : H * 1.1;
  s.push(...B(f - gl / 2, f + gl / 2, -Wh * 0.7, Wh * 0.7, H, H + gh, pal.glass, pal.glass, pal.dark, pal.dark));
  // deux nacelles lumineuses sous la coque
  for (const u of [-0.5, 0.5]) s.push({ px: ax ? [u * Lh, 0, -H * 0.5] : [0, u * Lh, -H * 0.5], col: `rgb(${pal.glow})` });
  return s;
}
function shadowShapes(kind, axis, T) {
  const { Lh, Wh } = dims(kind, T);
  const [x0, y0, x1, y1] = uv(axis === 'x', -Lh, Lh, -Wh, Wh);
  return [{ poly: [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], col: '#1c1230' }];
}
function trailShapes(band, axis, dir, kind, T) {
  const pal = PAL[band] || PAL[9];
  const { Lh, H } = dims(kind, T);
  const s = [];
  const L = 1.1 * T, n = 22;
  for (let i = 0; i <= n; i += 1) {
    const u = -dir * (Lh + (L * i) / n);
    const a = (0.55 * (1 - i / n)).toFixed(3);
    s.push({ px: axis === 'x' ? [u, 0, H * 0.5] : [0, u, H * 0.5], col: `rgba(${pal.tail},${a})` });
  }
  return s;
}
// Au zoom de REPOS (elevPaint.getZ) : pendant un glissement de zoom, la dernière
// cuisson de la forme, posée à l'échelle — plus 40 à 60 canvas recuits par frame
// (22 à 36 ms mesurés en rendu logiciel aux bandes 7-9).
function baked(key, make) {
  const d = CM.dpr || 1;
  return _bakes.getZ(key, d, (z) => bakeShapes(make(), z, d, artKdAt(z, d)));
}

// ── LES ACTEURS ──────────────────────────────────────────────────────────────
function viewBounds(margin) {
  const c = [screenToWorld(0, 0), screenToWorld(CM.cw, 0), screenToWorld(0, CM.ch), screenToWorld(CM.cw, CM.ch)];
  return {
    x0: Math.min(c[0].x, c[1].x, c[2].x, c[3].x) - margin, x1: Math.max(c[0].x, c[1].x, c[2].x, c[3].x) + margin,
    y0: Math.min(c[0].y, c[1].y, c[2].y, c[3].y) - margin, y1: Math.max(c[0].y, c[1].y, c[2].y, c[3].y) + margin,
  };
}
export const skyStats = { cars: 0, jets: 0, lanes: 0 };
const _cand = [];

// CLÉ DU PEINTRE d'un objet volant au-dessus d'une rue droite. ⚠ À l'aplomb de son
// pied (premier jet), une voiture passait SOUS les tours de la rangée d'en face
// quand celles-ci débordaient de deux cases le long de la rue (une tour se trie à son
// coin sud). Retour Raph : elles « ne passent pas correctement la hiérarchie de
// profondeur des bâtiments ». Au-dessus d'une rue de la rangée r (couloir en x),
// tout ce qui est au nord (y ≤ r) est derrière, tout ce qui est au sud (y ≥ r + 1)
// devant : la clé se pose au coin sud de la CASE DE RUE survolée, juste avant les
// voisins de devant. En tuiles : x + (r + 1) + 0,999 ; idem en y.
export function streetKey(axis, row, along, T) {
  return (axis === 'x' ? along / T + (row + 1) : (row + 1) + along / T) * T + 0.999 * T;
}

export function skyTrafficActors(now, out, decay = 0) {
  skyStats.cars = 0; skyStats.jets = 0; skyStats.lanes = 0;
  const L = CM.layout;
  if (!SKY.on || !L || !L.counts || CM.lodActive) return;
  const band = L.counts.eraBand;
  const cfg = SKY_BANDS[band];
  if (!cfg) return;
  const z = CM.cam.zoom;
  const zf = Math.max(0, Math.min(1, (z - SKY.minZoom) / 0.12));
  if (zf <= 0) return;
  const T = CM.TILE, d = CM.dpr || 1;
  const t = now / 1000;
  const health = CM.healthF == null ? 1 : CM.healthF;
  // La ville qui tombe vide son ciel (lot 4) : à l'effondrement il ne reste rien.
  const keep = cfg.keep * Math.max(0, Math.min(1.5, SKY.density)) * (0.4 + 0.6 * Math.max(0, Math.min(1, health))) * (1 - decay);
  const isle = floatIsleSpan(L);
  const lanes = lanesOf(L, band);
  skyStats.lanes = lanes.length;
  const maxAlt = Math.max(...cfg.tiers.x, ...cfg.tiers.y) * T;
  const vb = viewBounds(maxAlt + 3 * T);
  const n = CM.nightF || 0;
  const pal = PAL[band] || PAL[9];
  // ⚠ PAS DE PLAFOND AU NOMBRE : couper les candidats au-delà d'un compte faisait
  // apparaître et disparaître des voitures en plein ciel à chaque fois qu'une autre
  // entrait dans le champ. La densité se règle par couloir (keep, gap) ; au dézoom,
  // un tri STABLE par voiture (pri < part) en garde moins, sans clignotement.
  const zPart = Math.max(0.25, Math.min(1, (z / 0.625) * (z / 0.625))) * (1 - 0.3 * Math.min(1, n * 1.5));
  const cand = _cand; cand.length = 0;
  const mg = T * z * 1.5;
  for (const lane of lanes) {
    const ax = lane.axis === 'x';
    if (!lane.river && (ax ? (lane.c < vb.y0 || lane.c > vb.y1 || lane.b < vb.x0 || lane.a > vb.x1)
      : (lane.c < vb.x0 || lane.c > vb.x1 || lane.b < vb.y0 || lane.a > vb.y1))) continue;
    for (const car of laneCars(lane, t, keep, T)) {
      const wx = ax ? car.s : lane.c, wy = ax ? laneY(lane, car.s, L, T) : car.s;
      if (wx < vb.x0 || wx > vb.x1 || wy < vb.y0 || wy > vb.y1) continue;
      const alpha = car.fade * zf;
      if (alpha <= 0.02) continue;
      // Tri à l'ÉCRAN : la boîte monde d'un écran iso (un losange) est deux fois
      // trop grande — sans ce test, le plafond se dépensait hors champ.
      const ps = worldToScreen(wx, wy, lane.alt);
      if (ps.x < -mg || ps.x > CM.cw + mg || ps.y < -mg || ps.y > CM.ch + mg) continue;
      if (isle && lane.river && wx > isle.x0 && wx < isle.x1) continue;   // l'îlot flottant
      if (h01(lane.id * 7919 + car.i) >= zPart) continue;
      cand.push({ lane, wx, wy, alpha, kind: car.kind, s: car.s });
    }
  }
  // ⚠ PERF : la nuit, chaque véhicule coûte quatre poses de plus (phares, feu, traînée) :
  // la part gardée baisse d'un tiers (zPart) et l'ombre au sol, presque invisible sous
  // le voile, n'est plus posée.
  for (const c of cand) {
    const { lane, wx, wy, alpha, kind } = c;
    const dKey = lane.river ? depthOf(wx, wy) + 0.05 * T : streetKey(lane.axis, lane.row, c.s, T);
    const ax = lane.axis === 'x';
    skyStats.cars += 1;
    const alt = lane.alt;
    if (SKY.shadow > 0 && n < 0.5) {
      const sx = wx + alt * SKY.shadow;
      out.push({ wx: sx, wy, d: depthOf(sx, wy) - 0.6 * T, draw(ctx) {
        const bk = baked('sh|' + kind + '|' + lane.axis, () => shadowShapes(kind, lane.axis, T));
        const p = worldToScreen(sx, wy);
        blitBaked(ctx, bk, p.x, p.y, d, alpha * 0.26 * (1 - 0.7 * (CM.nightF || 0)));
      } });
    }
    out.push({ wx, wy, d: dKey, draw(ctx) {
      const bk = baked('car|' + band + '|' + kind + '|' + lane.axis + '|' + lane.dir, () => carShapes(band, kind, lane.axis, lane.dir, T));
      const p = worldToScreen(wx, wy, alt);
      blitBaked(ctx, bk, p.x, p.y, d, alpha);
      const nn = CM.nightF || 0;
      if (nn > 0.05) {
        const { Lh, H } = dims(kind, T);
        const fwd = worldToScreen(ax ? wx + lane.dir * Lh : wx, ax ? wy : wy + lane.dir * Lh, alt + H * 0.6);
        const back = worldToScreen(ax ? wx - lane.dir * Lh : wx, ax ? wy : wy - lane.dir * Lh, alt + H * 0.6);
        glowAt(fwd.x, fwd.y, 4.5 * z / 0.625, '255,250,235', 0.6 * nn * alpha);
        glowAt(back.x, back.y, 3.5 * z / 0.625, pal.tail, 0.6 * nn * alpha);
        if (kind === 2) glowAt(p.x, p.y + H * z, 4 * z / 0.625, pal.glow, 0.3 * nn * alpha);
        if (SKY.trails > 0) {
          const lc = lightCtx(p.x - 2 * T * z, p.y - 2 * T * z, p.x + 2 * T * z, p.y + 2 * T * z);
          if (lc) blitBaked(lc, baked('tr|' + band + '|' + kind + '|' + lane.axis + '|' + lane.dir, () => trailShapes(band, lane.axis, lane.dir, kind, T)), p.x, p.y, d, nn * alpha * SKY.trails);
        }
      }
    } });
  }
  // Balises de couloir, la nuit : une lueur toutes les 6 tuiles, sous la voie aller.
  for (const lane of lanes) {
    const ax = lane.axis === 'x';
    if (SKY.beacons > 0 && n > 0.05 && lane.dir === 1 && !lane.river && decay < 0.3) {
      const step = 6 * T;
      for (let s = Math.ceil(lane.a / step) * step; s < lane.b; s += step) {
        const wx = ax ? s : lane.c - 0.22 * T, wy = ax ? lane.c - 0.22 * T : s;
        if (wx < vb.x0 || wx > vb.x1 || wy < vb.y0 || wy > vb.y1) continue;
        const blink = (Math.floor(t * 1.5 + s / T) % 4) === 0 ? 1 : 0.45;
        out.push({ wx, wy, draw() {
          const p = worldToScreen(wx, wy, lane.alt - 0.15 * T);
          glowAt(p.x, p.y, 4 * z / 0.625, '170,140,255', 0.45 * blink * (CM.nightF || 0) * SKY.beacons * zf);
        } });
      }
    }
  }
  if (SKY.gates > 0 && decay < 0.5) gateActors(out, lanes, band, vb, zf, T, d, n);
  if (cfg.jets > 0 && SKY.jets > 0 && _runs.length && decay < 0.3) jetActors(out, t, cfg, vb, zf, T, d);
}

// ── LES PORTES DE COULOIR ────────────────────────────────────────────────────
// Au bout de chaque couloir de rue : un anneau à la hauteur du couloir, perpendiculaire
// à lui, porté par un mât fin. Les deux voies passent dedans ; un véhicule s'y efface
// ou en sort (GATE_FADE). Deux moitiés triées de part et d'autre des véhicules qui la
// traversent : l'arc arrière avant eux, l'arc avant après.
const GATE_PAL = {
  7: ['#e6f0ea', '#9fc2ae', '150,255,210'], 8: ['#fbf3dc', '#c9ad6a', '255,220,140'], 9: ['#f4f1fb', '#b8acd6', '190,160,255'],
};
function gateShapes(band, axis, half, alt, T) {
  const P = GATE_PAL[band] || GATE_PAL[9];
  const R = 0.42 * T, s = [];
  const pt = (v, w) => (axis === 'x' ? [0, v, w] : [v, 0, w]);   // v : en travers, w : hauteur
  // l'anneau : deux rangs de pixels (bord clair, cœur coloré), la moitié demandée
  // ⚠ assez d'échantillons pour un trait CONTINU au plus fort zoom (40 donnait un pointillé)
  for (let k = 0; k <= 160; k += 1) {
    const a = (k / 160) * Math.PI * 2;
    const v = Math.cos(a) * R, w = Math.sin(a) * R + 0.03 * T;
    if (half === 'back' ? v > 0.01 * T : v < -0.01 * T) continue;
    s.push({ px: pt(v, w), col: P[1] });
    s.push({ px: pt(v * 0.86, w * 0.86 + 0.004 * T), col: P[0] });
  }
  if (half === 'back') {
    // le mât : de la rue jusqu'au bas de l'anneau
    s.push(...(axis === 'x' ? boxShapes(-0.04 * T, -0.04 * T, 0.04 * T, 0.04 * T, -alt, -R + 0.03 * T, null, P[0], P[1], null)
      : boxShapes(-0.04 * T, -0.04 * T, 0.04 * T, 0.04 * T, -alt, -R + 0.03 * T, null, P[0], P[1], null)));
  }
  return s;
}
export function gateEnds(lanes) {
  // une porte par COULOIR (paire de voies) et par bout : on prend la voie aller
  const out = [];
  for (const ln of lanes) {
    if (ln.river || ln.dir !== 1) continue;
    for (const end of [ln.a, ln.b]) out.push({ axis: ln.axis, row: ln.row, along: end, mid: ln.c - 0.22 * CM.TILE, alt: ln.alt, isStart: end === ln.a });
  }
  return out;
}
function gateActors(out, lanes, band, vb, zf, T, d, night) {
  for (const g of gateEnds(lanes)) {
    const ax = g.axis === 'x';
    const wx = ax ? g.along : g.mid, wy = ax ? g.mid : g.along;
    if (wx < vb.x0 || wx > vb.x1 || wy < vb.y0 || wy > vb.y1) continue;
    const kIn = streetKey(g.axis, g.row, g.along, T);
    const kBack = g.isStart ? kIn - 0.05 * T : kIn - 0.6 * T;
    const kFront = g.isStart ? kIn + 0.6 * T : kIn + 0.05 * T;
    for (const [half, dk] of [['back', kBack], ['front', kFront]]) {
      out.push({ wx, wy, d: dk, draw(ctx) {
        const bk = baked('gate|' + band + '|' + g.axis + '|' + half + '|' + Math.round(g.alt), () => gateShapes(band, g.axis, half, g.alt, T));
        const p = worldToScreen(wx, wy, g.alt);
        blitBaked(ctx, bk, p.x, p.y, d, zf);
        if (half === 'front' && night > 0.05) {
          const P = GATE_PAL[band] || GATE_PAL[9];
          glowAt(p.x, p.y, 7 * CM.cam.zoom / 0.625, P[2], 0.5 * night * zf);
        }
      } });
    }
  }
}

// ── LES JETPACKS ─────────────────────────────────────────────────────────────
// Un habitant de l'ère décolle de la rue, fait un bond en arc le long d'elle et se
// repose plus loin ; puis recommence ailleurs. Le dessin est celui des habitants
// (drawEraAgentIso, ombre solaire coupée : il est en l'air) + une flamme.
const _jetRuns = [];
function jetActors(out, t, cfg, vb, zf, T, d) {
  _jetRuns.length = 0;
  for (const r of _runs) {
    const ax = r.axis === 'x';
    const cMin = (r.c) * T, cMax = (r.c + 1) * T;
    if (ax ? (cMax < vb.y0 || cMin > vb.y1 || r.b * T < vb.x0 || r.a * T > vb.x1)
      : (cMax < vb.x0 || cMin > vb.x1 || r.b * T < vb.y0 || r.a * T > vb.y1)) continue;
    _jetRuns.push(r);
  }
  if (!_jetRuns.length) return;
  const n = Math.round(cfg.jets * Math.min(1.5, SKY.jets));
  const z = CM.cam.zoom;
  for (let i = 0; i < n; i += 1) {
    const per = 6 + h01(i * 3 + 1) * 5;
    const ph = t + h01(i * 5 + 2) * per;
    const cyc = Math.floor(ph / per), u = (ph % per) / per;
    const seed = i * 1009 + cyc;
    const r = _jetRuns[Math.floor(h01(seed * 7) * _jetRuns.length)];
    const len = (r.b - r.a) * T;
    const dist = Math.min(len - T, (3 + h01(seed * 13) * 5) * T);
    if (dist <= T) continue;
    const s0 = r.a * T + h01(seed * 17) * (len - dist);
    const dir = h01(seed * 19) < 0.5 ? 1 : -1;
    const along = dir > 0 ? s0 + dist * u : s0 + dist * (1 - u);
    const lat = (r.c + 0.5 + (h01(seed * 23) - 0.5) * 0.6) * T;
    const ax = r.axis === 'x';
    const wx = ax ? along : lat, wy = ax ? lat : along;
    if (wx < vb.x0 || wx > vb.x1 || wy < vb.y0 || wy > vb.y1) continue;
    const peak = (1.4 + h01(seed * 29) * 1.4) * T;
    const alt = 0.1 * T + 4 * peak * u * (1 - u);
    const ddir = ax ? (dir > 0 ? 0 : 1) : (dir > 0 ? 2 : 3);
    skyStats.jets += 1;
    if (SKY.shadow > 0) {
      const sx = wx + alt * SKY.shadow;
      out.push({ wx: sx, wy, d: depthOf(sx, wy) - 0.6 * T, draw(ctx) {
        const p = worldToScreen(sx, wy);
        blitBaked(ctx, baked('sh|jet|x', () => shadowShapes('jet', 'x', T)), p.x, p.y, d, zf * 0.3 * (1 - 0.7 * (CM.nightF || 0)));
      } });
    }
    const jf = Math.min(1, Math.min(u, 1 - u) / 0.08) * zf;
    out.push({ wx, wy, d: streetKey(r.axis, r.c, along, T) + 0.01 * T, draw(ctx, nw) {
      const p = worldToScreen(wx, wy, alt);
      const pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * jf;
      const k = vieK();
      const fl = 2 + Math.floor((nw / 70 + i) % 3);
      for (let j = 0; j < fl; j += 1) {
        ctx.fillStyle = j === 0 ? '#fff6c0' : j === 1 ? '#ffc23a' : '#ff6a1a';
        ctx.fillRect(Math.round(p.x / k - 0.5) * k, Math.round(p.y / k + j) * k, k, k);
      }
      muteSunShadow(() => drawEraAgentIso(ctx, p.x, p.y, z, ddir, false, nw, i * 0.37, i % 3));
      ctx.globalAlpha = pa;
      const nn = CM.nightF || 0;
      if (nn > 0.05) glowAt(p.x, p.y + 2 * k, 6 * z / 0.625, '255,170,60', 0.6 * nn * jf);
    } });
  }
}

if (typeof window !== 'undefined') {
  window.__skyTraffic = (o) => { if (o) Object.assign(SKY, o); return { ...SKY, stats: { ...skyStats } }; };
}
