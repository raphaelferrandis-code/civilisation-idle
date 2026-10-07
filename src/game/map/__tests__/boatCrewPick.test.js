// Raph, 2026-10-07 : « on ne peut pas suivre les personnages sur les bateaux en cliquant
// dessus, et on perd même le suivi d'un habitant qui rentre dans un bateau (la navette
// des plaisirs par exemple) ». Chaque marin PEINT par drawBoat se signale (opts.onCrew),
// et les places de voyageur de la navette, à l'aller, reçoivent ceux qui attendaient au
// ponton (opts.passNames), dans l'ordre.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../agents.js", async (importOriginal) => ({
  ...(await importOriginal()),
  agentFrameIso: () => ({ img: {}, drawH: 8, feetF: 0.9, fh: 16 }),
  agentIdleFrameIso: () => ({ img: {}, fh: 16, sx: 0 }),
  agentPoseFrameIso: () => ({ img: {}, fh: 16, sx: 0 }),
}));

import { drawBoat } from "../iso/boatKit.js";
import { shuttleModelFor, shuttleSeats } from "../iso/boatKitsPlaisirs.js";

const ctx2d = () => new Proxy({ globalAlpha: 1, imageSmoothingEnabled: false }, {
  get(t, k) { if (k in t) return t[k]; return typeof k === "string" ? () => {} : undefined; },
  set(t, k, v) { t[k] = v; return true; },
});
class FakeImageData {
  constructor(a, b, c) {
    if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c || a.length / 4 / b; }
    else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
  }
}

let saved;
beforeAll(() => {
  saved = { doc: globalThis.document, id: globalThis.ImageData };
  if (!saved.doc) globalThis.document = { createElement: () => { const g = ctx2d(); return { width: 0, height: 0, getContext: () => g }; } };
  if (!saved.id) globalThis.ImageData = FakeImageData;
});
afterAll(() => {
  globalThis.document = saved.doc; globalThis.ImageData = saved.id;
});

const draw = (id, seed, state, extra = {}) => {
  const seen = [];
  const onCrew = (cr, who, sp, j, fx, fy, drawH, top, M) => seen.push({ role: cr.role, pose: cr.pose, who, name: sp.name, j, drawH, top, fx, fy, M });
  const r = drawBoat(ctx2d(), { id, seed, ident: 77 }, 100, 100, 0.4, 2, 1000, { state, band: 2, reflect: false, onCrew, ...extra });
  expect(r, "bateau posé").toBeTruthy();
  return seen;
};

describe("les gens peints sur un bateau se signalent", () => {
  it("chaque marin d'une scapha passe par onCrew, avec ses pieds et son cadre", () => {
    const seen = draw("scapha", 3, "cruise");
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(s.j).toBe(-1);
      expect(s.drawH).toBe(8);
      expect(Number.isFinite(s.fx) && Number.isFinite(s.fy) && Number.isFinite(s.top)).toBe(true);
      expect(s.M && s.M.role).toBeTruthy();
    }
  });

  it("la navette à l'aller assoit ceux qui attendaient, dans l'ordre, l'hôtesse à part", () => {
    const id = shuttleModelFor(2), seed = 4;
    const names = [{ name: "villagerwoman", scale: 1 }];   // un seul voyageur ce voyage-ci
    const seen = draw(id, seed, "dock", { passNames: names });
    const hostess = seen.filter((s) => s.role === "hostess");
    const pass = seen.filter((s) => s.role !== "hostess");
    expect(hostess.length).toBe(1);
    expect(hostess[0].j).toBe(-1);
    // Une place par voyageur ; les places en trop restent vides.
    expect(pass.map((s) => [s.j, s.name])).toEqual([[0, "villagerwoman"]]);
    // Sans voyageurs désignés (le retour), les places gardent leurs tirages.
    const free = draw(id, seed, "cruise").filter((s) => s.role !== "hostess");
    expect(free.length).toBe(shuttleSeats(seed));
    expect(free.every((s) => s.j === -1)).toBe(true);
  });
});
