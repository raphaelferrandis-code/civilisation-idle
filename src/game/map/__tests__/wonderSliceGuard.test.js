// LA MOLETTE DES TRANCHES DE MERVEILLE (audit du 2026-10-05, STRUCT-13 / iso-merveilles
// #10). `__wonderTune.slice = 0` (ou négatif) depuis la console rendait infinie la
// boucle des tranches de pushIsoWonderItems (`c0 += S`) et figeait l'onglet. La
// largeur de tranche est désormais bornée à 1 px : 0 et -4 se comportent comme 1.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state } from "../../core/state.js";
import { CM, CM_WONDERS } from "../layout.js";
import { pushIsoWonderItems, wonderTune } from "../iso/isoWonder.js";

const T = 32;
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) });
const saved = { wonders: state.wonders, slice: wonderTune.slice };

// Les tranches poussées pour le Mausolée : leurs bornes [c0, c1).
function slices() {
  CM._wonderBoxes = [];
  const items = [];
  pushIsoWonderItems(items, CM_WONDERS[0], 0);
  return items.filter((it) => it.c1 > it.c0).map((it) => `${it.part}:${it.c0}-${it.c1}`);
}

describe("isoWonder — la tranche ne descend jamais sous 1 px", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: fakeCanvas });
    vi.stubGlobal("ImageData", class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } });
    CM.TILE = T; CM.cw = 1200; CM.ch = 800; CM.dpr = 1; CM.capture = { night: 0, health: 1 };
    CM.season = 1; CM.previewWonder = null; CM.born = {}; CM.ships = [];
    CM.layout = { gridN: 120, cx: 60, cy: 60, counts: { eraBand: 4, eraIndex: 13 }, wonderTiers: { dynasty1: 1 }, river: null, roadSet: new Set() };
    CM.cam = { x: 60 * T, y: 60 * T, zoom: 0.25 };
    state.wonders = ["dynasty1"];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    wonderTune.slice = saved.slice;
    state.wonders = saved.wonders; CM.layout = null; CM._wonderBoxes = undefined; CM.capture = null;
  });

  it("slice = 0 ou négatif : la passe rend la main, comme à 1 px", () => {
    wonderTune.slice = 1;
    const ref = slices();
    expect(ref.length).toBeGreaterThan(0);
    for (const bad of [0, -4, 0.5]) {
      wonderTune.slice = bad;
      expect(slices(), `slice = ${bad}`).toEqual(ref);
    }
  });
});
