/* ============================================================================
 * wallGenerator.js — Enceintes urbaines
 *   À partir de l'ère fortifiée (ageCfg.wallTier > 0), la ville s'entoure
 *   d'une muraille qui suit son contour organique de l'époque :
 *     - aux ères fortifiée/royale, l'enceinte englobe presque toute la ville ;
 *     - aux ères suivantes, la ville a débordé : la muraille délimite le
 *       "vieux centre" intra-muros, contraste voulu avec les faubourgs ;
 *     - portes là où les routes traversent, tours à intervalles réguliers,
 *       brèche naturelle au passage du fleuve.
 *   Sortie : { cells: [{gx,gy,kind:wall|gate|tower}], set } — le set sert à
 *   exclure les cellules de muraille du placement de bâtiments et d'arbres.
 * ============================================================================ */

import { rngFrom } from "./seedManager.js";

export function generateWalls({
  plan, seed, counts, ageCfg, personality, N, reachBase,
  roadKey, riverSet, bankSet
}) {
  let tier = ageCfg.wallTier;
  if (personality.id === "militaire" && counts.eraBand >= 2) tier += 1;
  if (tier <= 0) return null;

  const rng = rngFrom(seed, "walls");
  // Le `reachBase` reçu est FIGÉ au moment de la construction (state.wallRadius) :
  // l'enceinte garde sa taille d'origine pendant que la ville grandit autour.
  const wallMul = 0.78 + rng() * 0.06;
  const towerEvery = 7 + Math.floor(rng() * 3);

  // Échantillonne le contour organique puis rasterise en cellules de grille.
  const steps = 96;
  const pts = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const r = Math.max(4, plan.reachFor(reachBase, a) * wallMul);
    pts.push({
      x: Math.round(Math.max(1, Math.min(N - 2, plan.core.x + Math.cos(a) * r))),
      y: Math.round(Math.max(1, Math.min(N - 2, plan.core.y + Math.sin(a) * r)))
    });
  }

  const cellMap = new Map(); // key -> kind
  const addWallCell = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= N || gy >= N) return;
    const k = gx + "," + gy;
    if (riverSet.has(k) || bankSet.has(k)) return;     // brèche au fleuve
    if (roadKey.has(k)) { cellMap.set(k, "gate"); return; } // porte sur route
    if (!cellMap.has(k)) cellMap.set(k, "wall");
  };

  // Bresenham entre points consécutifs du contour.
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    let x = a.x, y = a.y;
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
    let err = dx - dy;
    for (let guard = 0; guard < N * 2; guard += 1) {
      addWallCell(x, y);
      if (x === b.x && y === b.y) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  // Tours : à intervalles réguliers le long du périmètre (jamais sur une porte).
  const cells = [];
  let idx = 0;
  for (const [k, kind] of cellMap) {
    const comma = k.indexOf(",");
    const gx = +k.slice(0, comma), gy = +k.slice(comma + 1);
    const finalKind = kind === "wall" && idx % towerEvery === 0 ? "tower" : kind;
    cells.push({ gx, gy, kind: finalKind });
    idx += 1;
  }

  const set = new Set(cells.filter((c) => c.kind !== "gate").map((c) => c.gx + "," + c.gy));
  return { cells, set, tier };
}
