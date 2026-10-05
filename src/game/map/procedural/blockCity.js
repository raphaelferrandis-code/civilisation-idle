/* ============================================================================
 * blockCity.js — LA VILLE PAR ÎLOTS (docs/PLAN-ILOTS.md)
 *
 * Raph, 2026-10-04 : « il faut tout refaire le placement des bâtiments, là on a
 * un gros brouillon ». Mesuré (bande 4) : 72 % du sol de ville ne porte rien, la
 * ville occupe ~2,3 fois l'emprise que son contenu demande. La cause est l'ordre
 * de fabrication — un réseau de rues dimensionné par l'âge, puis des maisons
 * semées une à une, puis un chemin par maison.
 *
 * Ici l'ordre est renversé : l'ÎLOT est l'unité. Une grille de pas `pitch` (une
 * rue d'une case, puis `pitch − 1` cases d'îlot) est ancrée sur le CARDO (la
 * colonne du pont) et le DECUMANUS (la rangée du cœur). Les îlots s'ouvrent un à
 * un, du cœur vers l'extérieur, chacun RACCORDÉ au réseau des précédents : la
 * ville grandit d'un bloc, jamais d'une maison isolée au milieu d'un champ de
 * pavés. Les rues sont le pourtour des îlots ouverts — rien à élaguer ensuite,
 * et chaque lot du bord touche sa rue par construction.
 *
 * PUR : aucune dépendance au monde. Le terrain arrive par prédicats (eau,
 * réservé), le résultat est déterministe et à PRÉFIXE STABLE — l'îlot de rang k
 * reste le k-ième quand la ville grandit (même géométrie ⇒ même ordre). C'est ce
 * qui permet à la mémoire de ne jamais déplacer un îlot déjà ouvert.
 * ========================================================================== */

// Réglages par défaut (pilote : bande 4, grille romaine).
//   pitch      : rue + îlot. 5 ⇒ îlots de 4×4 cases (12 lots de bord, cour 2×2).
//   minCells   : un îlot rogné (berge, merveille) n'ouvre pas en deçà.
//   axisBonus  : la ville pousse d'abord le long du cardo et du decumanus.
//   reach      : rayon de recherche des îlots candidats, en pas de grille.
export const ILOT_DEFAULTS = { pitch: 5, minCells: 6, axisBonus: 0.35, reach: 40 };

const key = (x, y) => x + "," + y;
const mod = (a, n) => ((a % n) + n) % n;

/**
 * Géométrie de la grille : quelle rue, quel îlot pour une cellule.
 * @param {{ox:number, oy:number, pitch:number}} g ox = colonne du cardo, oy = rangée du decumanus
 */
// ÎLOTS LONGS (Raph 2026-10-04 : « vas-y pour les îlots longs le long des axes ») :
// `merge(i, j)` rend "x" quand l'îlot (i, j) absorbe son voisin (i+1, j) — la rue
// qui les séparait devient de l'îlot —, "y" pour (i, j+1), sinon null. L'îlot
// absorbé n'existe plus comme îlot (`absorbed`) ; l'îlot long garde la clé (i, j).
export function gridOf({ ox, oy, pitch, merge = null }) {
  const m = merge || (() => null);
  return {
    ox, oy, pitch,
    isStreetCol: (x) => mod(x - ox, pitch) === 0,
    isStreetRow: (y) => mod(y - oy, pitch) === 0,
    blockIndexOf: (x, y) => ({ i: Math.floor((x - ox) / pitch), j: Math.floor((y - oy) / pitch) }),
    absorbed: (i, j) => m(i - 1, j) === "x" || m(i, j - 1) === "y",
    // Intérieur de l'îlot (i, j), bornes INCLUSES — allongé s'il absorbe son voisin.
    interior: (i, j) => {
      const k = m(i, j);
      return { x0: ox + i * pitch + 1, y0: oy + j * pitch + 1,
        x1: ox + (i + (k === "x" ? 2 : 1)) * pitch - 1, y1: oy + (j + (k === "y" ? 2 : 1)) * pitch - 1 };
    },
  };
}

/**
 * Pourtour d'un îlot : les cellules de rue qui l'entourent, coins compris, avec
 * leur sens (h = rue courant le long de X, v = le long de Y).
 */
export function blockRing(grid, i, j) {
  const { x0, y0, x1, y1 } = grid.interior(i, j);
  const out = [];
  for (let x = x0 - 1; x <= x1 + 1; x += 1) { out.push({ x, y: y0 - 1, h: true, v: x === x0 - 1 || x === x1 + 1 }); out.push({ x, y: y1 + 1, h: true, v: x === x0 - 1 || x === x1 + 1 }); }
  for (let y = y0; y <= y1; y += 1) { out.push({ x: x0 - 1, y, h: false, v: true }); out.push({ x: x1 + 1, y, h: false, v: true }); }
  return out;
}

/**
 * Lots et cour d'un îlot, sur les seules cellules utilisables. Un lot est une
 * cellule de l'intérieur qui borde une rue praticable ; `faces` dit de quel(s)
 * côté(s) (N = y−1, S = y+1, W = x−1, E = x+1). L'ordre suit le pourtour, en
 * partant du coin le plus proche du cœur : des maisons consécutives forment une
 * rangée, pas un semis.
 */
export function blockLots(grid, i, j, { usable, streetOk, core }) {
  const { x0, y0, x1, y1 } = grid.interior(i, j);
  const cells = [];
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (usable(x, y)) cells.push({ x, y });
  const lots = [], court = [];
  for (const c of cells) {
    const faces = [];
    if (c.y === y0 && streetOk(c.x, c.y - 1)) faces.push("N");
    if (c.y === y1 && streetOk(c.x, c.y + 1)) faces.push("S");
    if (c.x === x0 && streetOk(c.x - 1, c.y)) faces.push("W");
    if (c.x === x1 && streetOk(c.x + 1, c.y)) faces.push("E");
    if (faces.length) lots.push({ gx: c.x, gy: c.y, faces });
    else court.push({ gx: c.x, gy: c.y });
  }
  // Ordre du pourtour : angle autour du centre de l'îlot, origine = direction du cœur.
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const a0 = Math.atan2(core.y - my, core.x - mx);
  const ang = (l) => { let a = Math.atan2(l.gy - my, l.gx - mx) - a0; while (a < 0) a += Math.PI * 2; return a; };
  lots.sort((p, q) => ang(p) - ang(q) || p.gy - q.gy || p.gx - q.gx);
  return { cells, lots, court, x0, y0, x1, y1 };
}

/**
 * L'ORDRE D'OUVERTURE des îlots : du cœur vers l'extérieur, chaque îlot raccordé
 * au réseau déjà ouvert (sa rue touche une rue existante). Déterministe et à
 * préfixe stable : il ne dépend que du terrain, jamais de la demande.
 *
 * @param {object} o
 * @param {number} o.N            taille de la grille
 * @param {{x:number,y:number}} o.core
 * @param {object} o.grid         gridOf(...)
 * @param {(x,y)=>boolean} o.usable    cellule constructible (sec, non réservé)
 * @param {(x,y)=>boolean} o.streetOk  cellule pouvant porter une rue (sec, ou pont)
 * @param {Array<{x:number,y:number}>} o.seed  rues de départ (cardo jusqu'au pont, pont)
 * @param {(i,j,center)=>number} [o.extraCost] coût ajouté (rive d'en face, etc.)
 * @param {number} [o.maxBlocks]
 * @returns {Array<object>} îlots { i, j, rank, cells, lots, court, ring, x0..y1, cost }
 */
export function blockOrder(o) {
  return blockOrderLazy(o).all();
}

/**
 * Le même ordre, PARESSEUX (PERF-7 de l'audit du 2026-10-05). Les lots de TOUS les
 * îlots de la fenêtre (~3 500 en fin de partie) étaient calculés à chaque plan, pour
 * n'en ouvrir que quelques centaines : un quart du coût de planIlots. Le coût d'un
 * îlot est GÉOMÉTRIQUE (son intérieur, pas ses lots) : on trie les candidats une
 * fois, et lots + pourtour ne se calculent que quand la boucle gloutonne atteint
 * l'îlot. Mêmes îlots, même ordre : le tri sur (coût, j, i) est total, donc écarter
 * un îlot inutilisable au passage rend la suite qu'on aurait eue en l'écartant avant.
 * `at(r)` rend l'îlot de rang r (en avançant juste ce qu'il faut, undefined au-delà
 * de la fin), `all()` la suite entière, `produced` ce qui est déjà ouvert.
 */
export function blockOrderLazy(o) {
  const { N, core, grid, usable, streetOk } = o;
  const P = grid.pitch;
  const minCells = o.minCells ?? ILOT_DEFAULTS.minCells;
  const axisBonus = o.axisBonus ?? ILOT_DEFAULTS.axisBonus;
  const reach = o.reach ?? ILOT_DEFAULTS.reach;
  const maxBlocks = o.maxBlocks ?? Infinity;
  const net = new Set();
  for (const s of o.seed || []) net.add(key(s.x, s.y));
  const c0 = grid.blockIndexOf(Math.floor(core.x), Math.floor(core.y));
  const inner = (x, y) => x >= 1 && y >= 1 && x < N - 1 && y < N - 1 && usable(x, y);
  // Candidats : tous les îlots de la fenêtre, coût seul (lots calculés au besoin).
  const left = [];
  for (let j = c0.j - reach; j <= c0.j + reach; j += 1) {
    for (let i = c0.i - reach; i <= c0.i + reach; i += 1) {
      if (grid.absorbed && grid.absorbed(i, j)) continue;   // moitié d'un îlot long
      const it = grid.interior(i, j);
      if (it.x1 < 1 || it.y1 < 1 || it.x0 > N - 2 || it.y0 > N - 2) continue;
      const cxB = (it.x0 + it.x1 + 1) / 2, cyB = (it.y0 + it.y1 + 1) / 2;
      let cost = Math.hypot(cxB - core.x, cyB - core.y) / P;
      // Le long des axes : un îlot qui borde le cardo ou le decumanus passe devant.
      if (i === 0 || i === -1 || j === 0 || j === -1) cost -= axisBonus;
      if (o.extraCost) cost += o.extraCost(i, j, { x: cxB, y: cyB });
      left.push({ i, j, cost, b: null });
    }
  }
  left.sort((a, b) => a.cost - b.cost || a.j - b.j || a.i - b.i);
  // Lots et pourtour d'un candidat ; null s'il ne s'ouvrira jamais (rogné, sans lot).
  const prepare = (c) => {
    const { i, j, cost } = c;
    const b = blockLots(grid, i, j, { usable: inner, streetOk, core });
    if (b.cells.length < minCells || !b.lots.length) return null;
    const ring = blockRing(grid, i, j).filter((r) => r.x >= 0 && r.y >= 0 && r.x < N && r.y < N && streetOk(r.x, r.y));
    return { i, j, ...b, ring, cost };
  };
  const touches = (b) => {
    for (const r of b.ring) {
      if (net.has(key(r.x, r.y))) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (net.has(key(r.x + dx, r.y + dy))) return true;
    }
    return false;
  };
  const out = [];
  let done = false;
  // Un pas d'ouverture gloutonne : le moins cher des îlots RACCORDABLES.
  // (n ≲ quelques centaines d'îlots : la boucle quadratique reste sous la ms.)
  const step = () => {
    if (done) return false;
    if (out.length >= maxBlocks) { done = true; return false; }
    for (let n = 0; n < left.length; n += 1) {
      const c = left[n];
      if (!c.b) {
        c.b = prepare(c);
        if (!c.b) { left.splice(n, 1); n -= 1; continue; }
      }
      if (net.size === 0 || touches(c.b)) {
        left.splice(n, 1);
        const b = c.b;
        b.rank = out.length;
        out.push(b);
        for (const r of b.ring) net.add(key(r.x, r.y));
        return true;
      }
    }
    done = true;                                       // plus rien de raccordable
    return false;
  };
  return {
    at(r) { while (out.length <= r && step()); return out[r]; },
    all() { while (step()); return out; },
    produced: out,
  };
}

/**
 * Les RUES d'un ensemble d'îlots ouverts : leurs pourtours, plus les rues de
 * départ (cardo jusqu'au pont). Rang : `main` pour le cardo et le decumanus,
 * `secondary` ailleurs. Renvoie une Map "x,y" → { h, v, rank }.
 */
export function blockStreets(grid, blocks, seed = []) {
  const m = new Map();
  const put = (x, y, h, v) => {
    const k = key(x, y);
    const main = x === grid.ox || y === grid.oy;
    const e = m.get(k);
    if (e) { e.h = e.h || h; e.v = e.v || v; return; }
    m.set(k, { h, v, rank: main ? "main" : "secondary" });
  };
  for (const s of seed) put(s.x, s.y, !!s.h, s.v !== false);
  for (const b of blocks) for (const r of b.ring) put(r.x, r.y, r.h, r.v);
  return m;
}
