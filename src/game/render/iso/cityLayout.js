/* ============================================================================
 * cityLayout.js — Modèle de CROISSANCE : bâtiments possédés → cases de grille.
 *
 *   Fonction PURE et DÉTERMINISTE (mêmes données → même plan) :
 *     • `spiralCells(n)` ordonne les cases du centre vers l'extérieur (anneaux).
 *     • chaque TYPE de bâtiment reçoit un BLOC RÉSERVÉ de cases (taille `perTypeCap`)
 *       à un emplacement fixé par son rang de progression. Acheter un bâtiment ne
 *       remplit QUE son propre bloc → les autres ne bougent jamais (stabilité),
 *       et les types anciens (rang faible) occupent le centre → la ville grandit
 *       du centre vers l'extérieur au fil des âges.
 *
 *   En greybox (Phase 3) on borne à `perTypeCap` cases par type : la ville croît
 *   visiblement sans poser des milliers de tuiles. Le plan urbain « final »
 *   (quartiers, routes) viendra plus tard ; ici on valide données → cases → tri.
 * ========================================================================== */

import { buildings } from "../../data/buildings.js";

// Rang de progression de chaque bâtiment (ordre du fichier data) → bloc réservé.
const TYPE_ORDER = new Map(buildings.map((b, i) => [b.id, i]));

/** Cases (col,row) d'une grille n×n, ordonnées du centre vers l'extérieur. */
export function spiralCells(n) {
  const c = Math.floor(n / 2);
  const cells = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) cells.push({ col, row });
  }
  cells.sort((a, b) => {
    const ra = Math.max(Math.abs(a.col - c), Math.abs(a.row - c));
    const rb = Math.max(Math.abs(b.col - c), Math.abs(b.row - c));
    if (ra !== rb) return ra - rb;                       // anneau (Chebyshev)
    const aa = Math.atan2(a.row - c, a.col - c);
    const ab = Math.atan2(b.row - c, b.col - c);
    if (aa !== ab) return aa - ab;                       // angle stable
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  return cells;
}

/**
 * Place les bâtiments possédés sur la grille.
 * @param model   sortie de getCityRenderModel (buildings: [{id,kind,count}]).
 * @returns [{ id, kind, col, row }] trié en ordre peintre (du fond vers l'avant).
 */
export function computeCityPlacements(model, { gridN = 20, perTypeCap = 8, typeOrder = TYPE_ORDER } = {}) {
  const cells = spiralCells(gridN);
  const placements = [];
  for (const b of model.buildings) {
    const rank = typeOrder.get(b.id);
    if (rank == null) continue;                          // type inconnu : ignoré
    const tiles = Math.min(perTypeCap, b.count);
    const base = rank * perTypeCap;                      // bloc réservé, fixe
    for (let u = 0; u < tiles; u += 1) {
      const cell = cells[base + u];
      if (!cell) break;                                  // hors grille : on arrête
      placements.push({ id: b.id, kind: b.kind, col: cell.col, row: cell.row });
    }
  }
  // Tri peintre iso : le fond (col+row petit) avant l'avant (grand), pour que les
  // bâtiments « plus bas » à l'écran passent devant ceux « plus haut ».
  placements.sort((p, q) => (p.col + p.row) - (q.col + q.row) || p.col - q.col);
  return placements;
}

/** Cases-route d'une grille n×n : quadrillage régulier tous les `block` cases. */
export function roadGridCells(n, block = 4) {
  const roads = new Set();
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      if (col % block === 0 || row % block === 0) roads.add(col + "," + row);
    }
  }
  return roads;
}

/**
 * Plan de ville en GRILLE : rues en quadrillage + bâtiments le long des rues
 * (cases NON-route, du centre vers l'extérieur). Les familles sont entrelacées
 * (round-robin) pour des rues variées plutôt que des blocs monotypes.
 * Fonction pure et déterministe.
 * @returns { roads:Set<"c,r">, placements:[{id,kind,col,row}] }
 */
export function computeCityGrid(model, { gridN = 24, block = 4, perTypeCap = 16, typeOrder = TYPE_ORDER } = {}) {
  const roads = roadGridCells(gridN, block);
  const buildable = spiralCells(gridN).filter((c) => !roads.has(c.col + "," + c.row));
  // File de familles entrelacée, ordre de progression stable.
  const entries = [];
  for (const b of model.buildings) {
    if (typeOrder.get(b.id) == null) continue;
    entries.push({ id: b.id, kind: b.kind, left: Math.min(perTypeCap, b.count) });
  }
  entries.sort((a, c) => typeOrder.get(a.id) - typeOrder.get(c.id));
  const queue = [];
  let any = true;
  while (any) {
    any = false;
    for (const e of entries) if (e.left > 0) { queue.push({ id: e.id, kind: e.kind }); e.left -= 1; any = true; }
  }
  const placements = [];
  const count = Math.min(queue.length, buildable.length);
  for (let i = 0; i < count; i += 1) {
    placements.push({ id: queue[i].id, kind: queue[i].kind, col: buildable[i].col, row: buildable[i].row });
  }
  placements.sort((p, q) => (p.col + p.row) - (q.col + q.row) || p.col - q.col);
  return { roads, placements };
}
