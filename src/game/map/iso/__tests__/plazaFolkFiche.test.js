import { it, expect } from "vitest";

import { CM } from "../../layout.js";
import { isoPlazaCompositions } from "../isoPlaza.js";
import { folkAt, FOLK } from "../plazaFolk.js";
import { depthOf } from "../projection.js";
import { noteSceneFigure, focusPick, citizenSheet, clearCitizenFocus } from "../../citizenFocus.js";

// LA FICHE D'UN FLÂNEUR DE PLACE (plazaFolk.js × citizenFocus.js). Séparé de
// plazaFolk.test.js : la fiche d'habitant cliquable vit dans son propre chantier, ce
// test part avec elle.

function plazaLayout(n, kind, band = 3, gx0 = 10, gy0 = 10) {
  const roadMap = new Map();
  for (let iy = 0; iy < n; iy += 1) {
    for (let ix = 0; ix < n; ix += 1) roadMap.set((gx0 + ix) + "," + (gy0 + iy), { gx: gx0 + ix, gy: gy0 + iy, rank: "plaza" });
  }
  const road = (gx, gy) => roadMap.set(gx + "," + gy, { gx, gy, rank: "street" });
  for (let i = -1; i <= n; i += 1) { road(gx0 + i, gy0 - 1); road(gx0 + i, gy0 + n); road(gx0 - 1, gy0 + i); road(gx0 + n, gy0 + i); }
  return { roadMap, plan: { plazas: [{ gx: gx0 + n / 2, gy: gy0 + n / 2, kind }] }, counts: { eraBand: band } };
}

it("la fiche d'un flâneur de place dit ce qu'il fait, et avec qui il cause", () => {
  Object.assign(FOLK, { on: true, slot: 30, speed: 0.27, leaveP: 0.1, viaP: 0.4, density: 1 });
  CM.layoutRecomputeAt = 424242;
  const comps = isoPlazaCompositions(plazaLayout(5, "marche", 3), 3);
  expect(comps).toHaveLength(1);
  const comp = comps[0], T = CM.TILE;
  CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600;
  const box = { drawW: 20, drawH: 20, top: 282 };
  const WANT = {
    walk: "Flâne sur la place", leave: "Quitte la place", stall: "Regarde les étals",
    chat: "Bavarde sur la place", pause: "Fait une halte", look: "Se repose près du puits",
  };
  const seenActs = new Set();
  let withMate = 0;
  for (let s = 0; s <= 900 && (seenActs.size < 6 || !withMate); s += 1) {
    for (const r of folkAt(comp.folk, s * 1000, T, depthOf)) {
      if (seenActs.has(r.act) && !(r.act === "chat" && r.mate)) continue;
      noteSceneFigure(r, "place", r.name, 400, 300, box);
      focusPick({ kind: "figure", p: r });
      const sh = citizenSheet();
      expect(sh.activity.fr).toBe(WANT[r.act]);
      if (r.act === "chat" && r.mate) { expect(sh.companion).toBeTruthy(); withMate += 1; }
      seenActs.add(r.act);
    }
  }
  clearCitizenFocus();
  expect([...seenActs].sort()).toEqual(Object.keys(WANT).sort());
  expect(withMate).toBeGreaterThan(0);
});
