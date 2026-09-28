import { describe, it, expect, afterEach } from "vitest";

import { computeCityLayout } from "../layout.js";
import { defaultState, setState } from "../../core/state.js";
import { D } from "../../core/num.js";

// FOYER DU CAMPEMENT (2026-09-28) : un feu commun au cœur du camp de tentes.
// Le contrat qui ne se voit pas à l'œil : son carré de 3×3 cellules est au sec et
// n'accueille ni bâti ni arbre — sinon une tente se plante dans le cercle du feu,
// ce que la première version faisait. Et il n'existe QU'AU campement.
//
// ⚠ computeCityLayout lit l'ère sur l'état GLOBAL (cmEraIndexFor), pas sur l'état
// passé : une partie neuve (population 10) donne la bande 0. Le cas « hors
// campement » passe donc par setState.

const GRAINES = [1234567, 987654321, 55555, 204429183, 0x51a7c0de];

function camp(seed) {
  const s = defaultState();
  s.mapSeed = seed;
  return s;
}

const carre = (h) => {
  const out = [];
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) out.push([h.gx + dx, h.gy + dy]);
  return out;
};

afterEach(() => { setState(defaultState()); });

describe("foyer du campement", () => {
  it("au campement, il existe, au sec, et rien n'est planté dans son carré", () => {
    for (const seed of GRAINES) {
      const L = computeCityLayout(camp(seed));
      expect(L.counts.eraBand, `graine ${seed}`).toBe(0);
      const h = L.campHearth;
      expect(h, `graine ${seed} : pas de foyer`).toBeTruthy();
      const cases = new Set(carre(h).map(([x, y]) => x + "," + y));
      for (const [x, y] of carre(h)) {
        expect(L.water.isDry(x, y), `graine ${seed} : foyer mouillé en ${x},${y}`).toBe(true);
      }
      for (const t of L.tiles) {
        const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
        for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) {
          const k = (t.gx + ax) + "," + (t.gy + ay);
          expect(cases.has(k), `graine ${seed} : ${t.type} ${t.variant || ""} planté dans le foyer (${k})`).toBe(false);
        }
      }
      for (const tr of L.trees || []) {
        expect(cases.has(tr.gx + "," + tr.gy), `graine ${seed} : arbre dans le foyer`).toBe(false);
      }
    }
  });

  it("hors du campement, pas de foyer", () => {
    setState({ ...defaultState(), population: D("1e15") });
    const L = computeCityLayout(camp(GRAINES[0]));
    expect(L.counts.eraBand).toBeGreaterThan(0);
    expect(L.campHearth).toBeNull();
  });
});
