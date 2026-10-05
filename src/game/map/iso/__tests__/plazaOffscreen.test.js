import { it, expect, afterEach } from "vitest";

import { CM } from "../../layout.js";
import { isoPlazaCompositions, isoPlazaItems } from "../isoPlaza.js";
import { FOLK } from "../plazaFolk.js";

// PLACE HORS CHAMP (audit du 05/10, PERF-48) : une place dont l'enveloppe est hors du
// losange visible est sautée d'un bloc — ni folkAt ni la boucle des props. Ce test
// prouve que ce qu'on POUSSE reste exactement le même que sans le saut (même items,
// même ordre, même profondeur), vue par vue et instant par instant, et que le saut a
// bien lieu.

function cityWithPlazas(specs) {
  const roadMap = new Map();
  const plazas = [];
  for (const { n, kind, gx0, gy0 } of specs) {
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) roadMap.set((gx0 + ix) + "," + (gy0 + iy), { gx: gx0 + ix, gy: gy0 + iy, rank: "plaza" });
    }
    const road = (gx, gy) => roadMap.set(gx + "," + gy, { gx, gy, rank: "street" });
    for (let i = -1; i <= n; i += 1) { road(gx0 + i, gy0 - 1); road(gx0 + i, gy0 + n); road(gx0 - 1, gy0 + i); road(gx0 + n, gy0 + i); }
    plazas.push({ gx: gx0 + n / 2, gy: gy0 + n / 2, kind });
  }
  return { roadMap, plan: { plazas }, counts: { eraBand: 3 } };
}

// Le test du renderer (isoRenderer.js, dvVis) sur un losange u = x − y, v = x + y.
const dvOf = (dv) => (wx0, wy0, wx1, wy1) =>
  !(wx1 - wy0 < dv.u0 || wx0 - wy1 > dv.u1 || wx1 + wy1 < dv.v0 || wx0 + wy0 > dv.v1);

function collect(L, now, dvVis, withBox) {
  const T = CM.TILE, out = [];
  const pushItem = () => { const it = {}; out.push(it); return it; };
  isoPlazaItems(L, 3, pushItem, (wx, wy) => dvVis(wx - T, wy - T, wx + T, wy + T), now,
    withBox ? (wx0, wy0, wx1, wy1) => dvVis(wx0 - T, wy0 - T, wx1 + T, wy1 + T) : null);
  return out.map((it) => [it.kind, it.d, it.art || it.tr]);
}

afterEach(() => { CM.focus = null; });

it("une place hors champ n'est pas calculée, et ce qu'on voit ne change pas", () => {
  Object.assign(FOLK, { on: true, slot: 30, speed: 0.27, leaveP: 0.1, viaP: 0.4, density: 1 });
  CM.layoutRecomputeAt = 515151;
  const L = cityWithPlazas([
    { n: 5, kind: "marche", gx0: 10, gy0: 10 },
    { n: 4, kind: "fontaine", gx0: 30, gy0: 12 },
    { n: 4, kind: "square", gx0: 14, gy0: 34 },
  ]);
  const comps = isoPlazaCompositions(L, 3);
  expect(comps.length).toBe(3);
  expect(comps.some((c) => c.folk && c.folk.actors.length)).toBe(true);
  const T = CM.TILE;
  // Des fenêtres qui coupent les places de toutes les façons : tout, rien, au ras des
  // bords (où la marge d'une case décide), une seule place.
  const views = [];
  for (let u = -40; u <= 40; u += 4) {
    for (let v = 20; v <= 100; v += 8) views.push({ u0: (u - 3) * T, u1: (u + 3) * T, v0: (v - 4) * T, v1: (v + 4) * T });
  }
  views.push({ u0: -1e9, u1: 1e9, v0: -1e9, v1: 1e9 }, { u0: 1e6, u1: 2e6, v0: 1e6, v1: 2e6 });
  let skipped = 0, seen = 0;
  for (let f = 0; f < 16; f += 1) {
    const now = 1000 + f * 5833;
    for (const dv of views) {
      const vis = dvOf(dv);
      const ref = collect(L, now, vis, false);
      const got = collect(L, now, vis, true);
      expect(got).toEqual(ref);
      seen += ref.length;
      const fr = comps.map((c) => c.folk && c.folk.frame);
      collect(L, now, vis, true);
      skipped += comps.filter((c, i) => c.folk && c.folk.frame === fr[i]).length;
    }
  }
  expect(seen).toBeGreaterThan(0);
  expect(skipped).toBeGreaterThan(0);
});

it("la place du flâneur désigné reste calculée hors champ", () => {
  CM.layoutRecomputeAt = 515152;
  const L = cityWithPlazas([{ n: 5, kind: "marche", gx0: 10, gy0: 10 }]);
  const [comp] = isoPlazaCompositions(L, 3);
  const nowhere = dvOf({ u0: 1e6, u1: 2e6, v0: 1e6, v1: 2e6 });
  const everywhere = dvOf({ u0: -1e9, u1: 1e9, v0: -1e9, v1: 1e9 });
  collect(L, 5000, everywhere, true);
  const rec = comp.folk.recs.values().next().value;
  expect(rec).toBeTruthy();
  let fr = comp.folk.frame;
  collect(L, 6000, nowhere, true);
  expect(comp.folk.frame).toBe(fr);              // hors champ, personne de suivi : sautée
  CM.focus = { p: rec, kind: "figure", cam: false };
  fr = comp.folk.frame;
  collect(L, 7000, nowhere, true);
  expect(comp.folk.frame).toBe(fr + 1);          // sa fiche suit ce qu'il fait
});
