// Audit du 2026-10-05, BUG-17 — les pontons FANTÔMES des bandes 5 à 9.
// Dès que le Vieux-Port existe, il ne reste au bord de l'eau que le bassin, la
// capitainerie et le terminal de commerce : aucun n'a de ponton peint (portTiles les
// écarte). fleetBerths n'écartait que le bassin : la capitainerie et le terminal
// recevaient un poste devant un ponton cuit mais jamais dessiné — les marchands s'y
// rangeaient en plein fleuve et les porteurs marchaient sur l'eau.
// Ces deux postes tenaient aussi, par accident, le bac et la navette à distance des
// deux ports : leurs REPÈRES restent (fleetPortMarks), sinon les deux sites bougeaient.
// Fleuve synthétique (ouest → est, y = 40, demi-largeur 3) : pas de ville à faire
// grandir, le test reste sous la seconde.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CM } from "../layout.js";
import { fleetBerths, fleetPortMarks } from "../iso/boatBerths.js";
import { isPierPortTile, pierMoorings } from "../iso/isoPier.js";
import { fleetFor } from "../iso/boatKits.js";

// La cuisson du ponton (contrôle positif) veut un canvas : un faux, muet.
class FakeOC {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() {
    const { width: w, height: h } = this;
    return new Proxy({ canvas: this }, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === "getImageData" || k === "createImageData") {
          return (a, b, c, d) => { const W = c || a || w, H = d || b || h; return { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }; };
        }
        if (typeof k === "string" && /^[a-z]/.test(k)) return () => {};
        return undefined;
      },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
}

function riverLayout(tiles) {
  const samples = [], cells = new Set(), banks = new Set();
  for (let x = 0; x <= 80; x += 2) samples.push({ x, y: 40, hw: 3 });
  for (let x = 0; x <= 80; x += 1) {
    for (let y = 37; y <= 43; y += 1) cells.add(x + "," + y);
    banks.add(x + ",36"); banks.add(x + ",44");
  }
  return { mapSeed: 7, river: { present: true, samples, cells, banks }, counts: { eraBand: 5, eraIndex: 25 }, tiles };
}
const port = (gx, extra = {}) => ({ buildingId: "river_ports", type: "engine", gx, gy: 35, size: 2, ...extra });

class FakeImageData {
  constructor(a, b, c) {
    if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c || a.length / 4 / b; }
    else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
  }
}

let savedOC, savedID, savedLayout;
beforeAll(() => {
  savedOC = globalThis.OffscreenCanvas; savedID = globalThis.ImageData; savedLayout = CM.layout;
  globalThis.OffscreenCanvas = FakeOC;
  if (!savedID) globalThis.ImageData = FakeImageData;
});
afterAll(() => { globalThis.OffscreenCanvas = savedOC; globalThis.ImageData = savedID; CM.layout = savedLayout; });

describe("BUG-17 — pas d'escale devant un ponton qui n'est pas peint", () => {
  it("un seul tri : seul le port fluvial ordinaire a son ponton", () => {
    expect(isPierPortTile(port(10))).toBe(true);
    expect(isPierPortTile(port(10, { tradePort: { side: "N" } }))).toBe(false);
    expect(isPierPortTile(port(10, { portOffice: {} }))).toBe(false);
    expect(isPierPortTile(port(10, { oldPort: {} }))).toBe(false);
    expect(isPierPortTile({ buildingId: "water_mills", type: "engine", gx: 0, gy: 0 })).toBe(false);
    expect(isPierPortTile(null)).toBe(false);
  });

  // (L'escale au QUAI du terminal, sans ponton, est éprouvée par tradeQuayBerth.test.js ;
  // le terre-plein n'a ici pas de géométrie, il n'en publie pas.)
  it("bande 5 : ni la capitainerie ni le terminal ne reçoivent de poste au ponton ni de ponton cuit", () => {
    expect(fleetFor(5).trade.length).toBeGreaterThan(0);     // la boucle tourne vraiment
    const office = port(20, { portOffice: { side: "N" } });
    const trade = port(50, { tradePort: { side: "N", x0: 48, len: 6 } });
    const L = riverLayout([port(4, { oldPort: { gx: 2, w: 6 } }), office, trade]);
    CM.layout = L;
    expect(fleetBerths(L)).toEqual([]);
    // Aucun autre appelant ne cuit de ponton fantôme non plus.
    expect(pierMoorings(office, 2, 2, 5, 25, 1.2)).toBe(null);
    expect(pierMoorings(trade, 2, 2, 5, 25, 1.2)).toBe(null);
  });

  it("contrôle : le port ordinaire au bord de l'eau garde son poste au ponton", () => {
    const L = riverLayout([port(30)]);
    CM.layout = L;
    const berths = fleetBerths(L);
    expect(berths.length).toBe(1);
    expect(berths[0].id).toBe("30,35");
    expect(berths[0].pier).toBeTruthy();
  });

  it("le bac et la navette fuient toujours la capitainerie et le terminal (repères sans poste)", () => {
    const office = port(20, { portOffice: { side: "N" } });
    const trade = port(50, { tradePort: { side: "N", x0: 48, len: 6 } });
    const L = riverLayout([port(4, { oldPort: { gx: 2, w: 6 } }), office, port(30), trade]);
    CM.layout = L;
    const berths = fleetBerths(L), marks = fleetPortMarks(L);
    expect(berths.map((b) => b.id)).toEqual(["30,35"]);
    // Un repère par port riverain (le bassin a les siens) : au droit de la capitainerie
    // (x ≈ 21), du port ordinaire (son poste même) et du terminal (x ≈ 51), t = x / 80.
    expect(marks.length).toBe(3);
    expect(marks).toContain(berths[0].t);
    const xs = marks.map((t) => t * 80).sort((a, b) => a - b);
    expect(Math.abs(xs[0] - 21)).toBeLessThan(1);
    expect(Math.abs(xs[2] - 51)).toBeLessThan(1);
  });
});
