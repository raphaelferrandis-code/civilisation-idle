import { describe, it, expect } from "vitest";
import { gridOf, blockOrder, blockStreets } from "../blockCity.js";

// Terrain d'essai : une grille de 120 avec un fleuve horizontal (y ∈ [80, 84]) que
// seul le pont (colonne du cardo) franchit.
const N = 120, core = { x: 60.5, y: 50.5 };
const wet = (x, y) => y >= 80 && y <= 84;
const grid = gridOf({ ox: 60, oy: 50, pitch: 5 });
const bridge = [];
for (let y = 50; y <= 86; y += 1) bridge.push({ x: 60, y, h: false, v: true });
const base = {
  N, core, grid,
  usable: (x, y) => !wet(x, y),
  streetOk: (x, y) => !wet(x, y) || x === 60,
  seed: bridge,
};

const connected = (streets) => {
  const keys = [...streets.keys()];
  if (!keys.length) return true;
  const seen = new Set([keys[0]]), st = [keys[0]];
  while (st.length) {
    const [x, y] = st.pop().split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (x + dx) + "," + (y + dy);
      if (streets.has(k) && !seen.has(k)) { seen.add(k); st.push(k); }
    }
  }
  return seen.size === keys.length;
};

describe("blockCity — la ville par îlots", () => {
  it("ordre déterministe et à PRÉFIXE STABLE (un îlot ouvert ne change jamais de rang)", () => {
    const a = blockOrder({ ...base, maxBlocks: 30 });
    const b = blockOrder({ ...base, maxBlocks: 90 });
    expect(a.length).toBe(30);
    expect(b.slice(0, 30).map((q) => q.i + ":" + q.j)).toEqual(a.map((q) => q.i + ":" + q.j));
  });

  it("chaque lot borde une rue du réseau, et le réseau est d'un seul tenant à tout préfixe", () => {
    const all = blockOrder({ ...base, maxBlocks: 120 });
    for (const n of [1, 5, 20, 60, 120]) {
      const blocks = all.slice(0, n);
      const streets = blockStreets(grid, blocks, bridge);
      expect(connected(streets)).toBe(true);
      for (const b of blocks) for (const l of b.lots) {
        const near = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => streets.has((l.gx + dx) + "," + (l.gy + dy)));
        expect(near).toBe(true);
      }
    }
  });

  it("aucun lot ni îlot dans l'eau ; la rive d'en face se rejoint par le pont", () => {
    const all = blockOrder({ ...base, maxBlocks: 200 });
    for (const b of all) for (const l of b.lots) expect(wet(l.gx, l.gy)).toBe(false);
    expect(all.some((b) => b.y0 > 84)).toBe(true);        // la rive sud finit par s'ouvrir
  });

  it("la ville pousse en tache autour du cœur, pas en ruban", () => {
    const all = blockOrder({ ...base, maxBlocks: 40 });
    const far = Math.max(...all.map((b) => Math.hypot((b.x0 + b.x1) / 2 - core.x, (b.y0 + b.y1) / 2 - core.y)));
    // 40 îlots de 5×5 ≈ un disque de rayon ~18 cases : rien au-delà de ~30.
    expect(far).toBeLessThan(30);
  });
});
