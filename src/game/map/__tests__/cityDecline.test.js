// LA VILLE QUI S'ÉTEINT (docs/PLAN-LISIBILITE.md, E) : le front d'abandon part du bord à
// 50 % de Rupture, n'atteint jamais le cœur, et avance de façon monotone — quartier par
// quartier (des voisines s'éteignent ensemble), pas maison par maison.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DECLINE, declineFront, isAbandoned, isAbandonedAt } from "../cityDecline.js";
import { state } from "../../core/state.js";
import { growCity as grow } from "../../../test/city.js";

const D0 = { ...DECLINE };
beforeEach(() => {
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
  state.wonders = [];
});
afterEach(() => { Object.assign(DECLINE, D0); });

const homes = (L) => L.tiles.filter((t) => t.type === "house" || t.type === "enginehome");
const shareAt = (L, r) => { DECLINE.force = r; const h = homes(L); return h.filter((t) => isAbandoned(t, L)).length / h.length; };

describe("la ville qui s'éteint", () => {
  it("le front : hors de la ville jusqu'à 50 %, sur le cœur à 100 %, monotone", () => {
    expect(declineFront(0)).toBe(Infinity);
    expect(declineFront(DECLINE.from)).toBe(Infinity);
    expect(declineFront(1)).toBeCloseTo(DECLINE.core, 6);
    let prev = Infinity;
    for (let r = 0.51; r <= 1.0001; r += 0.01) { const f = declineFront(r); expect(f).toBeLessThanOrEqual(prev); prev = f; }
  });

  it("une ville : rien sous 50 %, un tiers environ à 75 %, le cœur toujours habité", () => {
    const L = grow(27);
    expect(shareAt(L, 0.3)).toBe(0);
    expect(shareAt(L, 0.5)).toBe(0);
    const s75 = shareAt(L, 0.75), s90 = shareAt(L, 0.9), s100 = shareAt(L, 1);
    expect(s75).toBeGreaterThan(0.1);
    expect(s75).toBeLessThan(0.5);
    expect(s90).toBeGreaterThan(s75);
    expect(s100).toBeGreaterThanOrEqual(s90);
    expect(s100).toBeLessThan(1);
    // Le cœur : à 100 %, aucune maison à moins de (core − écarts) du centre n'est éteinte.
    DECLINE.force = 1;
    const g = L._declineGeom, safe = DECLINE.core - DECLINE.jPatch - DECLINE.jHouse;
    for (const t of homes(L)) {
      const d = Math.hypot(t.gx + 0.5 - g.x, t.gy + 0.5 - g.y) / g.R;
      if (d < safe) expect(isAbandoned(t, L), `${t.gx},${t.gy}`).toBe(false);
    }
  });

  it("par quartiers : deux voisines s'éteignent ensemble bien plus souvent qu'au hasard", () => {
    const L = grow(27);
    DECLINE.force = 0.8;
    const at = new Map(homes(L).map((t) => [t.gx + "," + t.gy, isAbandoned(t, L)]));
    let same = 0, n = 0;
    for (const [k, v] of at) {
      const [x, y] = k.split(",").map(Number);
      const w = at.get((x + 1) + "," + y);
      if (w === undefined) continue;
      n += 1; if (w === v) same += 1;
    }
    expect(n).toBeGreaterThan(50);
    expect(same / n).toBeGreaterThan(0.85);
  });

  it("molette : éteinte, rien n'est abandonné ; les réverbères suivent les quartiers", () => {
    const L = grow(27);
    DECLINE.force = 1;
    const h = homes(L);
    const far = h.reduce((a, t) => (Math.hypot(t.gx - L.cx, t.gy - L.cy) > Math.hypot(a.gx - L.cx, a.gy - L.cy) ? t : a), h[0]);
    expect(isAbandonedAt(far.gx, far.gy, L)).toBe(true);
    DECLINE.on = false;
    expect(h.some((t) => isAbandoned(t, L))).toBe(false);
    expect(isAbandonedAt(far.gx, far.gy, L)).toBe(false);
  });
});
