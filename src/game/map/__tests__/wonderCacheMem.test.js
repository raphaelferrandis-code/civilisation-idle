import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Audit 2026-10-05, MEM-2 — les caches de cuisson des merveilles étaient des FIFO de
// 25/9/25 entrées dont les clés changent avec la bande, l'hiver et les portes des
// rues : des canvases morts gardés jusqu'au plafond, chacun DOUBLÉ de ses pixels
// bruts. Trois gardes :
//  · une entrée ne garde que le CADRE de ses rasters (pas `data`) ;
//  · les caches restent bornés quand les bandes et les saisons défilent, et ce qui
//    n'a pas servi depuis 10 s part à l'insertion suivante — jamais ce qui est montré ;
//  · une rue qui vient toucher l'enceinte refait le décor, pas le sol.

let groundBakes = 0;
vi.mock("../iso/wonderPlace.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, bakePlaceGround: (...a) => { groundBakes += 1; return real.bakePlaceGround(...a); } };
});
// Le peintre des lieux du SOL (drawWonderPlaces), injecté par isoWonder.js.
let paintPlaces = null;
vi.mock("../iso/isoWonderGround.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, setWonderPlacePainter: (fn) => { paintPlaces = fn; real.setWonderPlacePainter(fn); } };
});

const { state } = await import("../../core/state.js");
const { CM, CM_WONDERS, cmWonderSlot } = await import("../layout.js");
const { WINTER } = await import("../seasonMode.js");
const { pushIsoWonderItems, wonderCacheStats } = await import("../iso/isoWonder.js");

const T = 32;
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) });
const saved = { wonders: state.wonders };
let clock = 0;
function scene() {
  CM.TILE = T;
  CM.cw = 1200; CM.ch = 800; CM.dpr = 1; CM.season = 1; CM.previewWonder = null;
  // En capture, le budget par image ne retarde aucune cuisson : chaque image montre
  // la variante exacte, les clés suivent pas à pas.
  CM.capture = { night: 0, health: 1 };
  CM.born = {}; CM.ships = [];
  CM.cam = { x: 60 * T, y: 60 * T, zoom: 0.25 };
  CM.layout = { gridN: 120, cx: 60, cy: 60, counts: { eraBand: 4, eraIndex: 13 }, wonderTiers: { dynasty1: 1 }, river: null, roadSet: new Set() };
  state.wonders = ["dynasty1"];
}
// Une image : horloge avancée de `ms`, nouveau tableau de survol (l'horloge d'images).
function frame(ms = 100) {
  clock += ms;
  CM._wonderBoxes = [];
  const items = [];
  pushIsoWonderItems(items, CM_WONDERS[0], 0);
  return items;
}

describe("MEM-2 — mémoire des cuissons des merveilles", () => {
  beforeEach(() => {
    groundBakes = 0;
    vi.stubGlobal("document", { createElement: fakeCanvas });
    vi.stubGlobal("ImageData", class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } });
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    scene();
  });
  afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks();
    state.wonders = saved.wonders; CM.layout = null; CM._wonderBoxes = undefined; CM.capture = null;
  });

  it("une entrée ne garde que le cadre de ses rasters, pas leurs pixels", () => {
    const items = frame();
    const m = items.find((it) => it.part === "shadow").m;
    expect(m.bk.R.data).toBeUndefined();
    expect(m.bk.R.w).toBeGreaterThan(0);
    expect(m.pl && m.pl.G.data).toBeUndefined();
    expect(m.pl.decor.length).toBeGreaterThan(0);
    for (const d of m.pl.decor) expect(d.R.data).toBeUndefined();
  });

  it("les bandes et les saisons défilent : caches bornés, les variantes oubliées partent", () => {
    for (let band = 0; band < 8; band += 1) {
      for (const season of [1, WINTER]) {
        CM.layout.counts.eraBand = band; CM.season = season;
        frame();
      }
    }
    let s = wonderCacheStats();
    expect(s.bakes).toBeLessThanOrEqual(12);
    expect(s.places).toBeLessThanOrEqual(12);
    expect(s.grounds).toBeLessThanOrEqual(s.places);
    // Plus de 10 s sur la même variante, puis une bascule vers une bande jamais
    // cuite : il ne reste que la variante montrée et la nouvelle.
    for (let i = 0; i < 12; i += 1) frame(1000);
    CM.layout.counts.eraBand = 9; CM.season = 1;
    frame();
    s = wonderCacheStats();
    expect(s.bakes).toBe(2);
    expect(s.places).toBe(2);
    expect(s.grounds).toBe(2);
  });

  it("une rue qui touche l'enceinte refait le décor, pas le sol", () => {
    CM.layout.wonderTiers.dynasty1 = 2;            // un rang que les autres cas ne cuisent pas
    const m0 = frame().find((it) => it.part === "shadow").m;
    const n0 = groundBakes;
    expect(n0).toBeGreaterThan(0);
    // Une rue au nord, à côté de la porte du milieu : une porte s'ouvre là où elle
    // aborde l'enceinte.
    const slot = cmWonderSlot(0, 120, 60, 60);
    for (let r = 1; r < 24; r += 1) CM.layout.roadSet.add((slot.gx + 2) + "," + (slot.gy - r));
    const m1 = frame().find((it) => it.part === "shadow").m;
    const walls = (pl) => JSON.stringify(pl.decor.map((d) => [d.kind, d.x, d.y]));
    expect(m1.pl).not.toBe(m0.pl);                 // décor neuf (une porte de plus)
    expect(walls(m1.pl)).not.toBe(walls(m0.pl));
    expect(m1.pl.cv).toBe(m0.pl.cv);               // même sol, pas recuit
    expect(groundBakes).toBe(n0);
  });

  it("un lieu que seul le sol peint (monument hors champ) n'est pas purgé", () => {
    // Le sol d'une fournée de dézoom peint le lieu de la Dynastie ; son monument, lui,
    // n'entre jamais à la passe vivante (hors champ) : pas dans _placeShown.
    const nop = () => {};
    const ctx = { save: nop, restore: nop, beginPath: nop, moveTo: nop, lineTo: nop, closePath: nop, clip: nop, drawImage: nop, imageSmoothingEnabled: false };
    const slot = cmWonderSlot(0, 120, 60, 60);
    CM.previewWonder = { id: "dynasty1", tier: 3 };   // un rang que les autres cas ne cuisent pas
    CM._wonderBoxes = [];
    paintPlaces(ctx, [slot.gx, slot.gy, 0, 0], 16, 8);
    const n0 = groundBakes;
    expect(n0).toBeGreaterThan(0);
    // Plus de 10 s, puis une insertion : le lieu d'une autre merveille, à l'écran.
    clock += 12000;
    state.wonders = ["dynasty1", "pop1m"];
    CM.layout.wonderTiers.pop1m = 3;
    CM._wonderBoxes = [];
    pushIsoWonderItems([], CM_WONDERS[1], 1);
    expect(groundBakes).toBeGreaterThan(n0);       // le lieu des Millions, cuit
    const n1 = groundBakes;
    // La fournée suivante (ou le retour de la merveille) retrouve le lieu, sans recuisson.
    CM._wonderBoxes = [];
    paintPlaces(ctx, [slot.gx, slot.gy, 0, 0], 16, 8);
    expect(groundBakes).toBe(n1);
  });
});
