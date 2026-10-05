import { describe, it, expect } from "vitest";
import { gridOf, blockOrder, blockOrderLazy, blockLots, blockRing, ILOT_DEFAULTS } from "../blockCity.js";

// L'ORDRE PARESSEUX (PERF-7, audit du 2026-10-05) doit rendre EXACTEMENT l'ordre
// d'avant : mêmes îlots, mêmes rangs, mêmes lots. La référence ci-dessous est
// l'algorithme d'avant, recopié tel quel (lots de toute la fenêtre, puis tri, puis
// boucle gloutonne) : si un jour l'un des deux change, ce fichier le voit.
function referenceOrder(o) {
  const { N, core, grid, usable, streetOk } = o;
  const P = grid.pitch, minCells = ILOT_DEFAULTS.minCells, axisBonus = ILOT_DEFAULTS.axisBonus, reach = ILOT_DEFAULTS.reach;
  const maxBlocks = o.maxBlocks ?? Infinity;
  const key = (x, y) => x + "," + y;
  const net = new Set();
  for (const s of o.seed || []) net.add(key(s.x, s.y));
  const c0 = grid.blockIndexOf(Math.floor(core.x), Math.floor(core.y));
  const cand = new Map();
  for (let j = c0.j - reach; j <= c0.j + reach; j += 1) {
    for (let i = c0.i - reach; i <= c0.i + reach; i += 1) {
      if (grid.absorbed && grid.absorbed(i, j)) continue;
      const it = grid.interior(i, j);
      if (it.x1 < 1 || it.y1 < 1 || it.x0 > N - 2 || it.y0 > N - 2) continue;
      const b = blockLots(grid, i, j, { usable: (x, y) => x >= 1 && y >= 1 && x < N - 1 && y < N - 1 && usable(x, y), streetOk, core });
      if (b.cells.length < minCells || !b.lots.length) continue;
      const ring = blockRing(grid, i, j).filter((r) => r.x >= 0 && r.y >= 0 && r.x < N && r.y < N && streetOk(r.x, r.y));
      const cxB = (b.x0 + b.x1 + 1) / 2, cyB = (b.y0 + b.y1 + 1) / 2;
      let cost = Math.hypot(cxB - core.x, cyB - core.y) / P;
      if (i === 0 || i === -1 || j === 0 || j === -1) cost -= axisBonus;
      if (o.extraCost) cost += o.extraCost(i, j, { x: cxB, y: cyB });
      cand.set(i + ":" + j, { i, j, ...b, ring, cost });
    }
  }
  const touches = (b) => b.ring.some((r) => net.has(key(r.x, r.y))
    || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => net.has(key(r.x + dx, r.y + dy))));
  const out = [];
  const left = [...cand.values()].sort((a, b) => a.cost - b.cost || a.j - b.j || a.i - b.i);
  while (left.length && out.length < maxBlocks) {
    const k = left.findIndex((b) => net.size === 0 || touches(b));
    if (k < 0) break;
    const b = left.splice(k, 1)[0];
    b.rank = out.length;
    out.push(b);
    for (const r of b.ring) net.add(key(r.x, r.y));
  }
  return out;
}

// Terrain : fleuve en biais que seul le cardo franchit, une merveille (réservé), des
// îlots longs le long des axes, la rive d'en face plus chère.
const N = 150, core = { x: 70.5, y: 60.5 };
const wet = (x, y) => Math.abs(y - (95 + x * 0.12)) < 3;
const reserved = (x, y) => Math.hypot(x - 52, y - 44) < 6;
const odd = (n) => ((n % 2) + 2) % 2 === 1;
const merge = (i, j) => ((j === -1 || j === 0) && !(i === -1 || i === 0) && odd(i) ? "x" : (i === -1 || i === 0) && !(j === -1 || j === 0) && odd(j) ? "y" : null);
const grid = gridOf({ ox: 70, oy: 60, pitch: 5, merge });
const seed = [];
for (let y = 60; y <= 110; y += 1) seed.push({ x: 70, y, h: false, v: true });
const base = {
  N, core, grid, seed,
  usable: (x, y) => !wet(x, y) && !reserved(x, y),
  streetOk: (x, y) => !reserved(x, y) && (!wet(x, y) || x === 70),
  extraCost: (i, j, c) => (c.y > 95 + c.x * 0.12 ? 1.5 : 0),
  maxBlocks: 2000,
};
const sig = (list) => JSON.stringify(list.map((b) => [b.i, b.j, b.rank, b.cost, b.lots, b.court, b.ring.length]));

describe("blockOrderLazy — même ordre que le calcul complet", () => {
  it("la suite entière est identique à celle d'avant (îlots, rangs, coûts, lots)", () => {
    const ref = referenceOrder(base);
    expect(ref.length).toBeGreaterThan(100);
    expect(sig(blockOrder(base))).toBe(sig(ref));
  });

  it("lu en partie, il rend le même préfixe — et ne calcule que ce qu'il lit", () => {
    const ref = referenceOrder(base);
    const lazy = blockOrderLazy(base);
    expect(lazy.at(39)).toBeTruthy();
    expect(lazy.produced.length).toBe(40);
    expect(sig(lazy.produced)).toBe(sig(ref.slice(0, 40)));
    expect(lazy.at(ref.length)).toBeUndefined();       // au-delà de la fin
    expect(sig(lazy.produced)).toBe(sig(ref));
  });

  it("respecte maxBlocks comme avant", () => {
    const o = { ...base, maxBlocks: 25 };
    expect(sig(blockOrderLazy(o).all())).toBe(sig(referenceOrder(o)));
  });
});
