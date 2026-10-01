"use strict";
// OÙ EST LA GRÈVE — la règle, et ses exclusions avec elle.
//
// Extraite d'`isoGroundResolve` le 2026-08-24. Elle y était un prédicat anonyme dont les
// exclusions (route, bâti sauf port) vivaient AILLEURS, dans les gardes de la chaîne
// `kindAt` — trois morceaux pour une seule question : « cette cellule de berge est-elle
// du sable ? ».
//
// ⚠⚠ ET LES SÉPARER A DÉJÀ COÛTÉ UN BUG. Un second peintre a voulu poser la même
// question et n'a recopié que le critère de proximité, pas les exclusions : il a peint
// du sable devant le QUARTIER PAVÉ de la rive opposée, là où le sol cuit est de la
// pierre. Les exclusions ne sont pas un détail de la règle, elles SONT la règle — d'où
// une fonction nommée qui les porte toutes.
//
// ⚠ Le peintre en question était la pente de grève du chantier du RELIEF, clos par Raph
// le jour même (cf. l'en-tête de `docs/PLAN-RELIEF.md`). Ce module n'a donc plus qu'un
// appelant, le sol cuit. Il reste parce que la leçon, elle, ne dépend pas du chantier.
//
// ⚠ Ce module ne dit PAS tout le classement : la priorité de l'eau, du parvis de
// merveille et des places reste dans la chaîne de `kindAt`, où elle se lit. Il ne porte
// que ce qui est propre à la grève de BERGE.
import { CM } from '../layout.js';
import { BEACH } from './isoGroundTiles.js';
import { builtCells } from './isoTissu.js';
import { ensureQuayGate } from '../quaysAndRiot.js';

// ⚠ LE PORT EST EXEMPTÉ DE L'EXCLUSION DES CELLULES BÂTIES. Retour Raph : « il y a une
// bande de gazon au port qui coupe la plage en 2 ». Mesuré à l'époque : sur les 72
// cellules de berge concernées, 4 étaient écartées comme bâties — et les 4 appartiennent
// au port, dont l'emprise (4×5) mord la berge en plein milieu de la grève. Un port de
// rivière est un PONTON posé sur le rivage : du sable dessous est juste, et son sprite
// recouvre les cellules de toute façon. Mémoïsé par layout, comme `builtCells`.
export function beachPortCells(L) {
  if (L._beachPortCells) return L._beachPortCells;
  const s = new Set();
  for (const t of (L.tiles || [])) {
    if (t.buildingId !== 'river_ports') continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) s.add((t.gx + ax) + ',' + (t.gy + ay));
  }
  L._beachPortCells = s;
  return s;
}

// ── LA GRÈVE EST UNE BANDE, PAS UNE COURONNE DE CASES ────────────────────────
// Retour Raph (2026-10-01, capture du port médiéval) : « avoir une vraie plage et pas
// des morceaux d'herbe dedans ». L'ancienne règle prenait les seules cases de
// `river.banks` (la couronne qui touche l'eau) à moins de 7 tuiles d'un point sans
// quai. Mesuré sur le port de la capture, elle fabriquait l'herbe de trois façons :
//   1. les cases D'EAU (riverSet) que le ruban peint ne couvre pas : le riverSet
//      déborde le ruban de ~1,4 tuile, ces cases restaient en herbe, et la bande de
//      sable vectorielle (0,55 tuile) n'en couvrait que le bas — un liseré vert
//      entre le sable et l'eau ;
//   2. le CERCLE de 7 tuiles : la grève s'arrêtait en arc au milieu de la berge, et
//      les cases entre cet arc et la pointe du quai restaient vertes ;
//   3. UNE case de profondeur, en escalier le long d'un fleuve en biais : la largeur
//      du sable variait de 0 à 1,4 tuile, avec des trous.
// La règle devient géométrique, mesurée PERPENDICULAIREMENT au fleuve depuis le bord
// d'eau PEINT (les samples, pas les cases) : une cellule est de la grève si son centre
// est à moins de `BEACH.depth` tuiles au-delà du bord, du côté d'une rive où le quai
// ne trace pas. Profondeur pleine sur toute la coupure, puis rampe douce sur
// `BEACH.ramp` samples SOUS la pointe effilée du quai : la maçonnerie sort du sable au
// lieu de s'arrêter contre une bande d'herbe. Les cases d'eau de la bande en sont
// aussi (le ruban recouvre ce qui est sous lui, le reste est du sable). La lisière
// arrondie (isoLisiere) fait le reste : le bord sable↔herbe ondule au pixel.
// ⚠ Les extrémités du fleuve restent exclues (cf. gapPts dans quaysAndRiot : le ruban
// se prolonge au-delà, il n'y a plus de bout à arrondir).
const RIVER_END = 3;                     // = QUAY_END de quaysAndRiot
const smooth01 = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

// Profondeur de grève par sample, une table par rive ([0] = rive `plus`, [1] = `minus`).
function beachDepths(sm, g) {
  const n0 = sm.length, R = Math.max(0, BEACH.ramp | 0);
  const out = [new Float32Array(n0), new Float32Array(n0)];
  [g.drawPlus, g.drawMinus].forEach((gate, si) => {
    const D = out[si];
    for (let i = RIVER_END; i < n0 - RIVER_END; i += 1) {
      if (gate[i]) continue;
      for (let d = -R; d <= R; d += 1) {
        const j = i + d;
        if (j < 0 || j >= n0) continue;
        const v = BEACH.depth * smooth01(1 - Math.abs(d) / (R + 1));
        if (v > D[j]) D[j] = v;
      }
    }
  });
  return out;
}

// L'ensemble des cellules de grève, mémoïsé par layout ET par masque du quai (la
// coupure du port dépend de la molette `portGap`) et réglage de la plage.
export function beachZone(L) {
  if (!L || !L.river || !L.river.present || !L.river.samples || L.river.samples.length < 2) return null;
  // ⚠ Le gate doit être FRAIS : le sol est baké AVANT le fleuve dans la frame, donc
  // personne ne l'a encore calculé au premier passage. Idempotent et caché.
  ensureQuayGate();
  const g = CM.quayGate;
  if (!g || !g.drawPlus) return null;
  const key = g.key + ':' + BEACH.depth + ':' + BEACH.ramp;
  if (L._beachZone && L._beachZone.key === key) return L._beachZone.cells;
  const sm = L.river.samples, n0 = sm.length;
  const D = beachDepths(sm, g);
  const cells = new Set(), seen = new Set();
  for (let i = 0; i < n0; i += 1) {
    if (!(D[0][i] > 0) && !(D[1][i] > 0)) continue;
    const s = sm[i], r = (s.hw || 2) + BEACH.depth + 1.5;
    for (let gy = Math.floor(s.y - r); gy <= Math.floor(s.y + r); gy += 1) {
      for (let gx = Math.floor(s.x - r); gx <= Math.floor(s.x + r); gx += 1) {
        const key2 = gx + ',' + gy;
        if (seen.has(key2)) continue;
        seen.add(key2);
        // Point le plus proche de la ligne médiane, sur les segments voisins.
        const cx = gx + 0.5, cy = gy + 0.5;
        let bj = -1, bf = 0, bd = Infinity;
        for (let j = Math.max(0, i - 5); j < Math.min(n0 - 1, i + 5); j += 1) {
          const a = sm[j], b = sm[j + 1];
          const tx = b.x - a.x, ty = b.y - a.y, l2 = tx * tx + ty * ty || 1e-9;
          const f = Math.max(0, Math.min(1, ((cx - a.x) * tx + (cy - a.y) * ty) / l2));
          const qx = a.x + tx * f, qy = a.y + ty * f, dd = (cx - qx) * (cx - qx) + (cy - qy) * (cy - qy);
          if (dd < bd) { bd = dd; bj = j; bf = f; }
        }
        if (bj < 0) continue;
        const a = sm[bj], b = sm[bj + 1];
        const qx = a.x + (b.x - a.x) * bf, qy = a.y + (b.y - a.y) * bf;
        // Même normale que le ruban et le quai (riverNormalAt : n = (−ty, tx)).
        const side = (cx - qx) * -(b.y - a.y) + (cy - qy) * (b.x - a.x) >= 0 ? 0 : 1;
        const hw = (a.hw || 2) + ((b.hw || 2) - (a.hw || 2)) * bf;
        const depth = D[side][bj] + (D[side][bj + 1] - D[side][bj]) * bf;
        if (depth > 0.05 && Math.sqrt(bd) - hw <= depth) cells.add(key2);
      }
    }
  }
  L._beachZone = { key, cells };
  return cells;
}

// Cette cellule est-elle de la grève ? La bande ci-dessus, moins ses EXCLUSIONS —
// qui SONT la règle (cf. l'en-tête) : une route reste une route (une rampe vers le
// quai reste une rampe), le bâti garde son sol, sauf le PORT (cf. beachPortCells).
export function isBeachBankCell(L, gx, gy) {
  if (!BEACH.on || !L) return false;
  const key = gx + ',' + gy;
  if (L.roadSet && L.roadSet.has(key)) return false;               // une rampe vers le quai reste une rampe
  if (builtCells(L).has(key) && !beachPortCells(L).has(key)) return false;
  const zone = beachZone(L);
  return !!(zone && zone.has(key));
}
