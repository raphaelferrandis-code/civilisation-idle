// CE QUE MONTRE L'ÉCRAN, EN MILIEUX (docs/PLAN-AMBIANCE-SONORE.md § 2 et § 3.2).
//
// Les nappes se dosent sur la PART de chaque milieu à l'écran — forêt, prairie,
// champs, eau, rive, ville, place —, pondérée vers le centre : c'est là qu'est
// l'oreille (oreille.js). Le procédé est celui de Jurassic World Evolution, qui lit
// la part de chaque milieu sur sa grille, et de Caesar III, qui compte ce que le
// peintre dessine (docs/PLAN-AMBIANCE-SONORE.md § 1.1).
//
// Trois sources, toutes déjà tenues par la carte :
//   · une GRILLE DES MILIEUX, un octet par case, rangée une fois par plan de ville
//     (le seul verdict par case du jeu, `kindAt`, est privé au peintre du sol) ;
//   · la FORÊT réelle : les arbres des blocs de la forêt sauvage (isoWildForest.js),
//     comptés par sous-cases de 4 × 4 — on entend les arbres qui sont dessinés ;
//   · le RUBAN du fleuve, qui déborde de la grille : la distance au BORD de l'eau dit
//     où l'on entend le courant (dedans) et le ressac (des deux côtés du bord).
// Et la FOULE, lue dans le registre des figures (figures.js) : la ville se dose au
// nombre de gens, pas à sa surface — une rue vide se tait (Cities: Skylines II).
//
// ⚠ Rien n'est fait à chaque image : le directeur échantillonne cinq fois par seconde,
// une grille fixe de points à l'écran (ECHANT), et ne relit la grille des milieux
// qu'au changement de plan. Tout passage écran ↔ monde passe par projection.js (la
// règle d'or : personne ne projette à la main).
import { CM } from '../../map/layout.js';
import { screenToWorld, worldToScreen } from '../../map/iso/projection.js';
import { WILD_BLOCK, isoWildForestBlockAt, isoWildForestSig } from '../../map/iso/isoWildForest.js';
import { eachFig, FIG } from '../../map/figures.js';

// Les milieux de la grille. L'eau et la berge l'emportent sur le reste, la place sur
// la ville, la ville sur la route (une route en ville EST de la ville).
export const MIL = { SAUVAGE: 0, VILLE: 1, ROUTE: 2, PLACE: 3, CHAMP: 4, EAU: 5, BERGE: 6 };

// Les parts mesurées. `rive` se SUPERPOSE aux autres (le bord de l'eau s'entend des
// deux côtés) ; les six autres se partagent l'écran.
export const MILIEUX = ['foret', 'prairie', 'champ', 'eau', 'rive', 'ville', 'place'];

// L'échantillonnage : nx × ny points, débordant de `marge` (en fraction d'écran) de
// chaque côté — on entend ce qui est juste hors champ —, pondérés par une gaussienne
// de la distance au centre (`sigma`, en demi-écrans). `rive` : décroissance du ressac
// en cases depuis le bord de l'eau.
export const ECHANT = { nx: 8, ny: 6, marge: 0.15, sigma: 0.55, rive: 1.3 };

export function nouvelleMesure() {
  const zero = () => Object.fromEntries(MILIEUX.map((m) => [m, 0]));
  return { parts: zero(), pans: zero(), foule: 0, foulePlace: 0, foulePort: 0, fouleEmeute: 0, points: 0 };
}

// ── La grille des milieux ────────────────────────────────────────────────────
let _grille = null;
export function grilleMilieux(L, at = CM.layoutRecomputeAt) {
  if (_grille && _grille.L === L && _grille.at === at) return _grille;
  const N = Math.max(0, L.gridN | 0);
  const c = new Uint8Array(N * N);
  const poser = (gx, gy, v) => { if (gx >= 0 && gy >= 0 && gx < N && gy < N) c[gy * N + gx] = v; };
  const poserCle = (k, v) => { const i = k.indexOf(','); poser(Number(k.slice(0, i)), Number(k.slice(i + 1)), v); };
  if (L.roadSet) for (const k of L.roadSet) poserCle(k, MIL.ROUTE);
  if (L.urbanSet) for (const k of L.urbanSet) poserCle(k, MIL.VILLE);
  for (const t of L.tiles || []) {
    if (t.buildingId !== 'irrigated_fields') continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let dy = 0; dy < sy; dy += 1) for (let dx = 0; dx < sx; dx += 1) poser(t.gx + dx, t.gy + dy, MIL.CHAMP);
  }
  if (L.roadMap) for (const r of L.roadMap.values()) if (r && r.rank === 'plaza') poser(r.gx, r.gy, MIL.PLACE);
  const rv = L.river;
  if (rv && rv.present) {
    for (const k of rv.banks || []) poserCle(k, MIL.BERGE);
    for (const k of rv.cells || []) poserCle(k, MIL.EAU);
  }
  _grille = { L, at, N, c };
  return _grille;
}
export function milieuAt(g, gx, gy) {
  return (gx >= 0 && gy >= 0 && gx < g.N && gy < g.N) ? g.c[gy * g.N + gx] : MIL.SAUVAGE;
}

// ── La forêt réelle ──────────────────────────────────────────────────────────
// Densité d'arbres (0..1) autour de la case (gx, gy) : les arbres et buissons du bloc
// de forêt sauvage, comptés par sous-cases de SOUS × SOUS. Une sous-case pleine à 55 %
// sonne comme une forêt dense (les trouées et l'ombre des vieux arbres en laissent).
const SOUS = 4, PAR = WILD_BLOCK / SOUS;
let _foret = { sig: '', L: null, blocs: new Map() };
export function densiteForet(L, gx, gy, sig = isoWildForestSig(L)) {
  if (_foret.sig !== sig || _foret.L !== L) _foret = { sig, L, blocs: new Map() };
  const bx = Math.floor(gx / WILD_BLOCK), by = Math.floor(gy / WILD_BLOCK);
  const cle = (bx + 4096) * 8192 + (by + 4096);
  let d = _foret.blocs.get(cle);
  if (!d) {
    if (_foret.blocs.size >= 256) _foret.blocs.clear();
    d = new Uint8Array(PAR * PAR);
    for (const a of isoWildForestBlockAt(L, bx, by)) {
      const sx = Math.min(PAR - 1, Math.max(0, Math.floor((a.gx - bx * WILD_BLOCK) / SOUS)));
      const sy = Math.min(PAR - 1, Math.max(0, Math.floor((a.gy - by * WILD_BLOCK) / SOUS)));
      if (d[sy * PAR + sx] < 255) d[sy * PAR + sx] += 1;
    }
    _foret.blocs.set(cle, d);
  }
  const sx = Math.floor((gx - bx * WILD_BLOCK) / SOUS), sy = Math.floor((gy - by * WILD_BLOCK) / SOUS);
  return Math.min(1, d[sy * PAR + sx] / (SOUS * SOUS * 0.55));
}

// ── Le bord de l'eau ─────────────────────────────────────────────────────────
// Les segments du ruban proches de la vue, retenus une fois par échantillonnage :
// (ax, ay, bx, by, demi-largeur en a, en b), en cases.
let _seg = new Float32Array(6 * 64), _nSeg = 0;
function retenirSegments(L, x0, y0, x1, y1) {
  _nSeg = 0;
  const sm = L.river && L.river.present && L.river.samples;
  if (!sm || sm.length < 2) return;
  for (let i = 0; i < sm.length - 1; i += 1) {
    const a = sm[i], b = sm[i + 1];
    const m = Math.max(a.hw || 2, b.hw || 2) + 4 * ECHANT.rive;
    if (Math.max(a.x, b.x) < x0 - m || Math.min(a.x, b.x) > x1 + m || Math.max(a.y, b.y) < y0 - m || Math.min(a.y, b.y) > y1 + m) continue;
    if ((_nSeg + 1) * 6 > _seg.length) { const s = new Float32Array(_seg.length * 2); s.set(_seg); _seg = s; }
    const o = _nSeg * 6;
    _seg[o] = a.x; _seg[o + 1] = a.y; _seg[o + 2] = b.x; _seg[o + 3] = b.y; _seg[o + 4] = a.hw || 2; _seg[o + 5] = b.hw || 2;
    _nSeg += 1;
  }
}
// Distance (cases) du point (x, y) au BORD de l'eau, parmi les segments retenus :
// négative dans l'eau, Infinity s'il n'y a pas d'eau près de la vue.
export function bordEau(x, y) {
  let best = Infinity;
  for (let s = 0; s < _nSeg; s += 1) {
    const o = s * 6, ax = _seg[o], ay = _seg[o + 1], dx = _seg[o + 2] - ax, dy = _seg[o + 3] - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const px = ax + dx * t - x, py = ay + dy * t - y;
    const d = Math.sqrt(px * px + py * py) - (_seg[o + 4] + (_seg[o + 5] - _seg[o + 4]) * t);
    if (d < best) best = d;
  }
  return best;
}

// ── L'échantillonnage de l'écran ─────────────────────────────────────────────
const _somme = Object.fromEntries(MILIEUX.map((m) => [m, 0]));
const _pan = Object.fromEntries(MILIEUX.map((m) => [m, 0]));

// Remplit `out.parts` (part de chaque milieu, 0..1) et `out.pans` (où il se trouve,
// de −1 à gauche à +1 à droite). `opts.densiteForet` remplace la lecture de la forêt
// (tests).
export function echantillonner(L, out, opts = {}) {
  for (const m of MILIEUX) { _somme[m] = 0; _pan[m] = 0; out.parts[m] = 0; out.pans[m] = 0; }
  out.points = 0;
  const cw = CM.cw, ch = CM.ch, T = CM.TILE;
  if (!L || !(cw > 0) || !(ch > 0)) return out;
  const g = grilleMilieux(L);
  const foret = opts.densiteForet || densiteForet;
  const sig = opts.densiteForet ? '' : isoWildForestSig(L);
  const { nx, ny, marge, sigma, rive } = ECHANT;
  // Les segments du fleuve qui touchent la vue (élargie de la marge).
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[-marge, -marge], [1 + marge, -marge], [-marge, 1 + marge], [1 + marge, 1 + marge]]) {
    const p = screenToWorld(u * cw, v * ch);
    x0 = Math.min(x0, p.x / T); x1 = Math.max(x1, p.x / T); y0 = Math.min(y0, p.y / T); y1 = Math.max(y1, p.y / T);
  }
  retenirSegments(L, x0, y0, x1, y1);
  const add = (m, w, pan) => { _somme[m] += w; _pan[m] += w * pan; };
  let tot = 0;
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const u = -marge + ((ix + 0.5) / nx) * (1 + 2 * marge), v = -marge + ((iy + 0.5) / ny) * (1 + 2 * marge);
      const ux = 2 * u - 1, vy = 2 * v - 1;            // −1..1 aux bords de l'écran
      const w = Math.exp(-(ux * ux + vy * vy) / (2 * sigma * sigma));
      const pan = Math.max(-1, Math.min(1, ux));
      const p = screenToWorld(u * cw, v * ch);
      const cx = p.x / T, cy = p.y / T, gx = Math.floor(cx), gy = Math.floor(cy);
      const m = milieuAt(g, gx, gy);
      const de = bordEau(cx, cy);
      tot += w;
      // Le ressac s'entend des deux côtés du bord.
      const r = m === MIL.BERGE ? 1 : (de < 4 * rive ? Math.exp(-Math.abs(de) / rive) : 0);
      if (r > 0) add('rive', w * r, pan);
      if (m === MIL.EAU || de < 0) { add('eau', w, pan); continue; }
      if (m === MIL.VILLE) add('ville', w, pan);
      else if (m === MIL.PLACE) add('place', w, pan);
      else if (m === MIL.CHAMP) add('champ', w, pan);
      else if (m === MIL.ROUTE) add('prairie', w, pan);   // route de campagne : de l'herbe de part et d'autre
      else {
        const f = foret(L, gx, gy, sig);
        if (f > 0) add('foret', w * f, pan);
        if (f < 1) add('prairie', w * (1 - f), pan);
      }
    }
  }
  out.points = nx * ny;
  if (tot > 0) {
    for (const m of MILIEUX) {
      out.parts[m] = _somme[m] / tot;
      out.pans[m] = _somme[m] > 0 ? _pan[m] / _somme[m] : 0;
    }
  }
  return out;
}

// La FOULE : les figures de la dernière image, pondérées par la même gaussienne.
// Positions en px monde, ramenées à l'écran par worldToScreen.
export function mesurerFoule(out) {
  const cw = CM.cw, ch = CM.ch, s2 = 2 * ECHANT.sigma * ECHANT.sigma;
  let n = 0, place = 0, port = 0, emeute = 0;
  if (cw > 0 && ch > 0) {
    eachFig((x, y, f) => {
      const s = worldToScreen(x, y);
      const ux = (2 * s.x) / cw - 1, vy = (2 * s.y) / ch - 1;
      if (ux < -1.4 || ux > 1.4 || vy < -1.4 || vy > 1.4) return false;
      const w = Math.exp(-(ux * ux + vy * vy) / s2);
      n += w;
      if (f & FIG.PLAZA) place += w;
      if (f & (FIG.PORT | FIG.QUAY)) port += w;
      if (f & FIG.RIOT) emeute += w;
      return false;
    });
  }
  out.foule = n; out.foulePlace = place; out.foulePort = port; out.fouleEmeute = emeute;
  return out;
}

// La TAILLE de la ville (0..1), qui dose la rumeur lointaine : nulle au campement
// (une cinquantaine de cases de sol de ville), pleine vers 5 000 cases.
export function tailleVille(L) {
  const n = (L && L.urbanSet && L.urbanSet.size) || 0;
  if (n <= 1) return 0;
  return Math.max(0, Math.min(1, (Math.log10(n) - 1.7) / 2));
}
