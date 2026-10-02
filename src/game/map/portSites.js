/* ============================================================================
 * portSites.js — OÙ VONT LES DEUX PORTS (docs/PLAN-PORTS.md, lots P2-P3)
 *
 * Demande de Raph (2026-10-01) : « qu'on fasse 2 ports, un commercial en
 * périphérie de la ville, et un plaisancier type port de Marseille ». Choix
 * tranchés le même soir : le port se dédouble au XIXe (bande 5), et le port de
 * plaisance est un VRAI BASSIN creusé dans la berge (Vieux-Port).
 *
 *   BASSIN   — au vieux port (là où se trouvait le port de la grève) : un
 *              rectangle d'eau creusé dans la berge, ouvert sur le fleuve au sud
 *              (rive nord), bordé d'un anneau de quai d'une case sur ses trois
 *              autres côtés.
 *   COMMERCE — un tronçon de berge droit, en aval, au bord de la ville du
 *              moment : un terre-plein de `depth` cases le long de `len` cases
 *              d'eau. Réservé à sa taille MAXIMALE dès la fondation (il grandit
 *              avec les Ports achetés sans jamais déloger personne).
 *
 * Géométrie PURE, comme cityQuarters.js : aucun état, aucun import de layout.
 * layout.js passe ses prédicats (eau, cellule libre, ville) et fige le résultat
 * dans `state.cityCore.ports`, en coordonnées RELATIVES AU CENTRE DE GRILLE.
 * ========================================================================== */

// Réglages. Molette : `__portSites({ ... })` puis `__cityRecompute()`.
// Allumé le 2026-10-02 (Raph : « corrige puis termine ce qu'il faut, et applique à
// toutes les ères »). `__portSites({ on: false })` rend le port unique de la grève.
export const PORT_SITES = {
  on: true,
  splitBand: 5,        // bande du dédoublement (XIXe)
  basinW: 5,           // largeur du bassin le long du fleuve (son entrée), en cases
  basinD: 7,           // profondeur dans la berge : long et étroit, ouvert par son petit côté, comme le Vieux-Port
  basinSlope: 2,       // écart maximal de la berge sous le bassin (cases)
  bridgeGap: 5,        // cases libres entre le bassin et la travée du pont (sa tête, sa statue)
  tradeLen: 14,        // longueur maximale du terre-plein de commerce (réservée)
  tradeMinLen: 9,      // en deçà, le site n'est pas assez long : on cherche ailleurs
  tradeDepth: 4,       // profondeur du terre-plein
  tradeSlope: 2,       // écart maximal de la berge le long du terre-plein
  tradeCityMax: 0.25,  // part maximale de cellules DANS la ville (périphérie)
  tradeGap: 3,         // marge à la ville et au domaine des Plaisirs
};

if (typeof window !== 'undefined') {
  window.__portSites = (o) => { if (o && typeof o === 'object') Object.assign(PORT_SITES, o); return { ...PORT_SITES }; };
}

// Première rangée d'eau d'une colonne, en descendant (rive nord) ou en montant
// (rive sud) depuis `from`. null si la colonne n'a pas d'eau à portée.
export function firstWaterRow(isWater, gx, from, dir, maxSteps = 24) {
  for (let k = 0; k <= maxSteps; k += 1) {
    const gy = from + dir * k;
    if (isWater(gx, gy)) return gy;
  }
  return null;
}

// Cellules d'un bassin { gx, gy, w, h } : l'eau, puis l'anneau de quai — DEUX
// rangées au nord (la capitainerie s'y pose), une à l'ouest et à l'est, qui
// descendent jusqu'à l'eau du fleuve (`isWater`).
export const BASIN_NORTH_QUAY = 2;
export function basinCells(b, isWater) {
  const water = [], quay = [];
  for (let x = b.gx; x < b.gx + b.w; x += 1) for (let y = b.gy; y < b.gy + b.h; y += 1) water.push([x, y]);
  for (let x = b.gx - 1; x <= b.gx + b.w; x += 1) for (let r = 1; r <= BASIN_NORTH_QUAY; r += 1) quay.push([x, b.gy - r]);
  for (const x of [b.gx - 1, b.gx + b.w]) {
    for (let y = b.gy; y < b.gy + b.h + 6; y += 1) {
      if (isWater(x, y)) break;
      quay.push([x, y]);
    }
  }
  return { water, quay };
}

// LE BASSIN DU VIEUX PORT. Colonnes essayées par proximité à `preferX` (le port
// de la grève, s'il existe ; sinon le cœur), sur la rive NORD (le fleuve coule au
// sud du cœur par construction, cf. cityPlan). Le bas du bassin descend jusqu'à
// la première rangée d'eau la plus BASSE de ses colonnes : il touche le fleuve
// partout. Refusé : sur l'artère et ses abords, trop près du pont, berge trop
// inclinée, cellule non libre (`free`).
export function oldPortBasinFor({ N, isWater, riverYAt, riverHwAt, preferX, bridgeX, arteryAx, free, opts = PORT_SITES }) {
  const W = opts.basinW, D = opts.basinD;
  const cols = [];
  for (let x0 = 2; x0 + W < N - 2; x0 += 1) cols.push(x0);
  cols.sort((a, b) => (Math.abs(a + W / 2 - preferX) - Math.abs(b + W / 2 - preferX)) || (a - b));
  for (const x0 of cols) {
    if (Math.abs(x0 + W / 2 - bridgeX) < opts.bridgeGap + W / 2 + 1) continue;
    if (arteryAx != null && x0 - 2 <= arteryAx + 1 && x0 + W + 1 >= arteryAx) continue;
    let yb = -Infinity, ymin = Infinity, ok = true;
    for (let x = x0; x < x0 + W && ok; x += 1) {
      const from = Math.floor(riverYAt(x) - riverHwAt(x) - 3);
      const fw = firstWaterRow(isWater, x, from, 1);
      if (fw == null) { ok = false; break; }
      if (fw > yb) yb = fw;
      if (fw < ymin) ymin = fw;
    }
    if (!ok || yb - ymin > opts.basinSlope) continue;
    const b = { gx: x0, gy: yb - D, w: W, h: D };
    if (b.gy < 1 + BASIN_NORTH_QUAY) continue;
    const { water, quay } = basinCells(b, isWater);
    if (water.concat(quay).some(([x, y]) => x < 1 || y < 1 || x >= N - 1 || y >= N - 1 || (!isWater(x, y) && !free(x, y)))) continue;
    return b;
  }
  return null;
}

// LE PORT DE COMMERCE. Un tronçon de berge [x0, x0 + len) sur une rive : le
// terre-plein va du bord de l'eau à `depth` cases dans les terres. On le veut :
//   - en PÉRIPHÉRIE : au plus `tradeCityMax` de ses cellules dans la ville ;
//   - DROIT : la berge ne s'écarte pas de plus de `tradeSlope` cases ;
//   - LIBRE : aucune cellule tenue, de merveille, de Plaisirs, d'artère (`free`) ;
//   - le plus PRÈS possible de la ville, de préférence vers l'AVAL (`downX`, le
//     sens des Plaisirs, « posés loin en aval »).
// Rend { x0, len, side: 'N'|'S', depth, edge: [rangée de bord par colonne] }.
export function tradePortSiteFor({ N, isWater, riverYAt, riverHwAt, inCity, free, coreX, downX, bridgeX, arteryAx, opts = PORT_SITES }) {
  const D = opts.tradeDepth;
  const dirDown = downX >= coreX ? 1 : -1;
  const sites = [];
  // Rive NORD d'abord : le quai y regarde le sud, donc l'œil — les navires amarrés
  // passent DEVANT les portiques, leurs flèches au-dessus d'eux. Sur la rive sud,
  // le terminal tournerait le dos à la caméra et cacherait ses navires.
  for (const side of ["N", "S"]) {
    const dir = side === "N" ? 1 : -1;              // vers l'eau, depuis la terre
    for (let len = opts.tradeLen; len >= opts.tradeMinLen; len -= 1) {
      for (let x0 = 2; x0 + len < N - 2; x0 += 1) {
        if (Math.abs(x0 + len / 2 - bridgeX) < len / 2 + 4) continue;
        if (arteryAx != null && x0 - 2 <= arteryAx + 1 && x0 + len + 1 >= arteryAx) continue;
        const edge = [];
        let lo = Infinity, hi = -Infinity, ok = true;
        for (let x = x0; x < x0 + len && ok; x += 1) {
          // Rive nord : on descend vers l'eau depuis le haut ; rive sud : on remonte.
          const from = side === "N" ? Math.floor(riverYAt(x) - riverHwAt(x) - 4) : Math.ceil(riverYAt(x) + riverHwAt(x) + 4);
          const fw = firstWaterRow(isWater, x, from, dir);
          if (fw == null) { ok = false; break; }
          const row = fw - dir;                         // la dernière rangée sèche
          edge.push(row);
          if (row < lo) lo = row;
          if (row > hi) hi = row;
        }
        if (!ok || hi - lo > opts.tradeSlope) continue;
        let inside = 0, n = 0;
        for (let i = 0; i < len && ok; i += 1) {
          const x = x0 + i;
          for (let d = 0; d < D; d += 1) {
            const y = edge[i] - dir * d;
            if (y < 1 || y >= N - 1 || isWater(x, y) || !free(x, y)) { ok = false; break; }
            if (inCity(x, y)) inside += 1;
            n += 1;
          }
        }
        if (!ok || inside > n * opts.tradeCityMax) continue;
        const mid = x0 + len / 2;
        const down = (mid - coreX) * dirDown > 0;
        // Score : distance au cœur, pénalisée vers l'amont ; un tronçon plus long
        // passe devant (on balaie les longueurs de la plus grande à la plus petite).
        sites.push({ x0, len, side, depth: D, edge, score: Math.abs(mid - coreX) + (down ? 0 : 40) + (opts.tradeLen - len) * 6 + (side === "S" ? 30 : 0) });
      }
    }
  }
  if (!sites.length) return null;
  sites.sort((a, b) => a.score - b.score || a.x0 - b.x0 || (a.side < b.side ? -1 : 1));
  const s = sites[0];
  return { x0: s.x0, len: s.len, side: s.side, depth: s.depth, edge: s.edge };
}

// Cellules du terre-plein d'un site de commerce (pour la réserve et le rendu).
export function tradeCells(t) {
  const out = [];
  const dir = t.side === "N" ? 1 : -1;
  for (let i = 0; i < t.len; i += 1) for (let d = 0; d < t.depth; d += 1) out.push([t.x0 + i, t.edge[i] - dir * d]);
  return out;
}
