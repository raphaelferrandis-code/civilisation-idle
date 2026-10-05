import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import { state } from "../../core/state.js";
import { seededRng } from "../../core/utils.js";
import { CM } from "../layout.js";
import { cityMapWalkRoadKey } from "../agents.js";
import { updateCrisis } from "../quaysAndRiot.js";

// BUG-86 (audit du 2026-10-05) — le passant DÉSIGNÉ (fiche d'habitant) pouvait être
// recruté par l'émeute : masqué le temps de l'émeute, il laissait la caméra sur un
// trottoir vide et la fiche disait « Chez soi », quand il défilait torche en main.

const saved = { wonders: state.wonders, instability: state.instability };

// Une rue droite de dix cases, deux passants au milieu : tous deux à portée de
// recrutement, quelle que soit la case où l'émeute se forme.
function street() {
  state.wonders = [];
  state.instability = 0.95;
  CM.TILE = 20;
  const list = [];
  for (let gx = 0; gx < 10; gx += 1) list.push({ gx, gy: 0 });
  CM.walkRoadList = list;
  CM.walkRoadSet = new Set(list.map((c) => cityMapWalkRoadKey(c.gx, c.gy)));
  CM.layout = { gridN: 20, cx: 5, cy: 0, roadMap: new Map(list.map((c) => [c.gx + "," + c.gy, { mask: 15 }])) };
  const at = (gx) => ({ gx, gy: 0, x: (gx + 0.5) * 20, y: 10, tx: (gx + 0.5) * 20, ty: 10, fade: 1, charType: 0 });
  CM.citizens = [at(4), at(5)];
  CM.rioters = []; CM.riotGoal = null; CM.riotCalmed = 0; CM.riotWindow = true; CM.riotFading = [];
  return CM.citizens;
}

beforeEach(() => { vi.spyOn(Math, "random").mockImplementation(seededRng(11)); });
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(state, saved);
  CM.riotWindow = false; CM.rioters = []; CM.riotDraw = null; CM.citizens = []; CM.focus = null;
});

describe("BUG-86 — l'émeute ne recrute jamais le passant qu'on suit", () => {
  it("le désigné reste dans la rue, son voisin rejoint la foule", () => {
    const [a, b] = street();
    CM.focus = { p: a, kind: "citizen", cam: true };
    updateCrisis(1 / 30, 1000);
    expect(CM.rioters.length).toBeGreaterThan(0);
    expect(a._riot).toBeFalsy();
    expect(b._riot).toBeTruthy();
  });

  it("sans désignation, les deux passants peuvent se lever (témoin)", () => {
    const [a, b] = street();
    updateCrisis(1 / 30, 1000);
    expect(a._riot).toBeTruthy();
    expect(b._riot).toBeTruthy();
  });
});
