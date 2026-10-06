// Audit du 2026-10-05, BUG-17 et MORT-5 — l'ESCALE AU TERMINAL DE COMMERCE.
// Dès la bande 5, plus aucun ponton au fleuve : le terminal était le seul port et
// n'offrait aucun poste (son contrat portBerths n'avait pas de lecteur) — les marchands
// marquaient une pause de 2,5 s en plein courant au droit des ports. Le terminal publie
// désormais son poste LIBRE (la plus longue travée de quai entre ses navires-décor), la
// flotte en fait une vraie escale : elle longe les navires-décor par le large, se range de
// côté une fois arrêtée, s'en écarte de même avant de repartir.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CM } from "../layout.js";
import { fleetBerths, fleetPortMarks } from "../iso/boatBerths.js";
import { portBerths, hullFootprint } from "../iso/portBerths.js";
import { TRADE, drawTradePort } from "../iso/isoTradePort.js";
import { fleetFor, BOAT_MODELS } from "../iso/boatKits.js";
import { updateRiverFleet, makeFleetCtl, ribbonLength, FLEET_TUNE } from "../riverFleet.js";

// ── La géométrie : le poste libre du terminal ───────────────────────────────────
// La cuisson du terminal veut un canvas : un faux, muet.
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
class FakeImageData {
  constructor(a, b, c) {
    if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c || a.length / 4 / b; }
    else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
  }
}

// Fleuve synthétique (ouest → est, y = 40, demi-largeur 3) ; terminal de 14 tuiles sur
// la rive NORD, terre-plein de 4 rangées jusqu'à la dernière rangée sèche (36).
function riverLayout(tiles, band, eraIndex) {
  const samples = [], cells = new Set(), banks = new Set();
  for (let x = 0; x <= 100; x += 2) samples.push({ x, y: 40, hw: 3 });
  for (let x = 0; x <= 100; x += 1) {
    for (let y = 37; y <= 43; y += 1) cells.add(x + "," + y);
    banks.add(x + ",36"); banks.add(x + ",44");
  }
  return { mapSeed: 7, river: { present: true, samples, cells, banks }, counts: { eraBand: band, eraIndex }, tiles };
}
const terminal = (level) => ({
  buildingId: "river_ports", type: "engine", gx: 40, gy: 33, size: 14, spanX: 14, spanY: 4, level,
  tradePort: { x0: 40, len: 14, side: "N", depth: 4, edge: new Array(14).fill(36) },
});

let saved;
beforeAll(() => {
  saved = { oc: globalThis.OffscreenCanvas, id: globalThis.ImageData, layout: CM.layout, trade: { ...TRADE } };
  globalThis.OffscreenCanvas = FakeOC;
  if (!saved.id) globalThis.ImageData = FakeImageData;
  // Ni ombre, ni reflet, ni encre : la cuisson n'est ici que la géométrie du plan.
  Object.assign(TRADE, { shadow: false, reflect: false, ink: false });
});
afterAll(() => {
  globalThis.OffscreenCanvas = saved.oc; globalThis.ImageData = saved.id; CM.layout = saved.layout;
  Object.assign(TRADE, saved.trade);
});

describe("BUG-17 / MORT-5 — le poste libre du terminal de commerce", () => {
  it("bande 6 : un poste entre les deux porte-conteneurs, au pied du quai nord, sans ponton", () => {
    const t = terminal(30);
    const L = riverLayout([t], 6, 31);
    CM.layout = L;
    const [free] = portBerths(L, "commerce");
    // Les deux navires-décor (tradePlan : niveau 30 → 2) sont centrés à 1/4 et 3/4 du quai.
    const fp = hullFootprint("container", 6);
    expect(free.decor).toBe(false);
    expect(free.x).toBeCloseTo(47, 5);
    expect(free.maxLen).toBeCloseTo((50.5 - fp.len / 2 - 0.15) - (43.5 + fp.len / 2 + 0.15), 5);
    const big = Math.max(...fleetFor(6).trade.map((id) => BOAT_MODELS[id].len / 32));
    const berths = fleetBerths(L);
    expect(berths.length).toBe(1);
    const b = berths[0];
    expect(b.quay).toBe("40,33");
    expect(b.pier).toBe(null);                          // pas de porteurs sur l'eau
    expect(free.maxLen).toBeGreaterThanOrEqual(big);
    // Rive nord d'un fleuve ouest → est : lat négative ; la file d'approche est plus au
    // large (vers l'axe) de la largeur d'un navire-décor.
    expect(b.side).toBe(-1);
    expect(b.lat).toBeLessThan(-1.5);
    expect(b.lat).toBeGreaterThan(-3);
    expect(b.approachLat - b.lat).toBeCloseTo(fp.beam + 0.08, 5);
    // Le quai entier, en t, encadre le poste.
    expect(b.span[0]).toBeLessThan(b.t);
    expect(b.span[1]).toBeGreaterThan(b.t);
  });

  it("le bac et la navette n'y voient pas un port de plus (repères inchangés)", () => {
    const L = riverLayout([terminal(30)], 6, 31);
    CM.layout = L;
    const marks = fleetPortMarks(L), b = fleetBerths(L)[0];
    expect(marks.length).toBe(1);                       // le repère du terminal, et lui seul
    expect(marks).not.toContain(b.t);
  });

  it("quai plein (niveau 120 : trois navires-décor) : pas de poste — les navires-décor ne bougent pas", () => {
    const L = riverLayout([terminal(120)], 6, 31);
    CM.layout = L;
    const big = Math.max(...fleetFor(6).trade.map((id) => BOAT_MODELS[id].len / 32));
    const [free] = portBerths(L, "commerce");
    expect(free.maxLen).toBeLessThan(big);
    expect(fleetBerths(L)).toEqual([]);
  });

  it("la scène du terminal peint les marchands qui manœuvrent à son quai, une fois", () => {
    const L = riverLayout([terminal(30)], 6, 31);
    CM.layout = L;
    const ctx = new FakeOC(64, 64).getContext("2d");
    let n = 0;
    drawTradePort(ctx, L.tiles[0], 6, 31, 1000, () => { n += 1; });
    expect(n).toBe(1);
  });
});

// ── La sim : approche par le large, rangé de côté, écarté avant de repartir ────────
const SM = Array.from({ length: 61 }, (_, i) => ({ x: i, y: 10, hw: 3 }));
const LEN = ribbonLength(SM);
const SIZE = { len: 1.8, beam: 0.55 };
const DT = 0.1;
const NONE = { trade: 0, fisher: 0 };
// Un poste de quai sur la rive négative, à mi-fleuve, et le quai du terminal autour.
const QUAY = { id: "quai:1,1", t: 0.5, lat: -2.0, approachLat: -1.3, th: 0, side: -1, beam: 0.6, pier: null, quay: "1,1", span: [0.45, 0.55] };
const trader = (o) => ({
  kind: "trade", dir: 1, t: 0.3, speed: 0.008, lane: 0.4, phase: 0, fade: 1, _vTiles: 1.1,
  // `latV` : navSteer ne l'initialise qu'avec `lat` ; un bateau posé avec sa voie (le
  // marchand amarré ci-dessous) sans elle passait à lat = NaN au premier pas.
  state: "cruise", stateT: 0, done: false, lastDock: -1, id: 1, latV: 0, ...o,
});
function sail(ships, env, steps, each) {
  const ctl = makeFleetCtl(); ctl.birth = { trade: 1e9, fisher: 1e9 };
  const E = { samples: SM, gates: [], obstacles: [], sizeOf: () => SIZE, berths: [QUAY], ...env };
  for (let k = 0; k < steps; k += 1) { updateRiverFleet(ships, ctl, NONE, DT, E); if (each) each(k, ctl); }
}

describe("BUG-17 — l'escale au quai du terminal", () => {
  for (const dir of [1, -1]) {
    it("le marchand (" + (dir > 0 ? "vers l'est" : "vers l'ouest") + ") longe par le large, se range de côté, s'écarte puis repart", () => {
      const a = trader({ dir, t: dir > 0 ? 0.3 : 0.7 });
      let arrivedLat = null, docked = 0, nearest = Infinity, unmoorT = null, unmoorMoved = 0, unmoorTurn = 0, quaySeen = false, quayAfter = null;
      sail([a], { docks: [{ t: 0.5, side: -1 }] }, 1200, () => {
        if (a.state === "dock") {
          if (arrivedLat == null) arrivedLat = a.lat;
          docked += DT;
          nearest = Math.min(nearest, Math.abs(a.lat - QUAY.lat));
        } else if (a.unmoor != null) {
          if (unmoorT == null) unmoorT = { t: a.t, th: a.th };
          unmoorMoved = Math.max(unmoorMoved, Math.abs(a.t - unmoorT.t) * LEN);
          unmoorTurn = Math.max(unmoorTurn, Math.abs(Math.sin(a.th - unmoorT.th)));
        }
        if (a.quay === "1,1") quaySeen = true;
        if (docked > 0 && a.state === "cruise" && Math.abs(a.t - 0.5) * LEN > 8) quayAfter = a.quay;
      });
      // Arrivé arrêté sur la file du large, pas sur le quai (il aurait balayé les navires-décor).
      expect(Math.abs(arrivedLat - QUAY.approachLat)).toBeLessThan(0.3);
      // Une VRAIE escale (16-26 s), pas la pause de 2,5 s — et il s'est rangé au quai.
      expect(docked).toBeGreaterThan(FLEET_TUNE.berthDwell[0] - 0.5);
      expect(nearest).toBeLessThan(0.05);
      // Il s'écarte sur place, sans virer, avant de repartir.
      expect(unmoorT).not.toBe(null);
      expect(unmoorMoved).toBeLessThan(0.05);
      expect(unmoorTurn).toBeLessThan(0.05);
      expect(Math.abs((a.t - 0.5) * LEN)).toBeGreaterThan(8);
      expect(Math.sign(a.t - 0.5)).toBe(dir);
      // La scène du terminal le peint tant qu'il manœuvre à son quai, plus après.
      expect(quaySeen).toBe(true);
      expect(quayAfter).toBe(null);
    });
  }

  it("le quai n'est pas une passe : deux bateaux qui s'y croisent ne font pas la queue (le ponton, si)", () => {
    const cross = (berth) => {
      const docked = trader({ id: 1, t: 0.5, state: "dock", stateT: 1e9, berthId: berth.id, berthLat: berth.lat, lat: berth.lat, done: true });
      const west = trader({ id: 2, dir: -1, t: 0.6, done: true, _vTiles: 1 });
      const east = trader({ id: 3, dir: 1, t: 0.4, done: true, _vTiles: 1 });
      let waited = false;
      sail([docked, west, east], { berths: [berth] }, 300, () => { if (west._gateWait || east._gateWait) waited = true; });
      return { waited, west, east, docked };
    };
    const quay = cross(QUAY);
    expect(quay.docked.lat).toBeCloseTo(QUAY.lat, 2);     // vraiment amarré, à sa place
    expect(quay.waited).toBe(false);
    expect(quay.west.t).toBeLessThan(0.45);
    expect(quay.east.t).toBeGreaterThan(0.55);
    // Contrôle : le même poste, au bout d'un ponton (sans `quay`), reste une passe.
    const pier = { ...QUAY };
    delete pier.quay;
    expect(cross(pier).waited).toBe(true);
  });
});
