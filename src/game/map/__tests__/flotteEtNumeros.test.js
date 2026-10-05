import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { state } from "../../core/state.js";
import { CM, cmHash } from "../layout.js";
import { cmSyncRoadFleet, spawnOneCitizen, simStepsFor } from "../cityMapRuntime.js";
import { chooseRoadVehicleType, getVehicleDensity, vehSkinFor, updateVehicles, cityMapWalkRoadKey, drawDroneRotors } from "../agents.js";
import { ageConfigFor } from "../procedural/ageVisualConfig.js";

// Audit du 2026-10-05, lot 6 (agents) :
//   BUG-56 — la flotte des rues était rebâtie d'un bloc à chaque recalcul (tous les
//            véhicules sautaient à leur case de départ), ou restait figée hors réseau ;
//   BUG-57 — chars à bœufs dans la mégalopole, berlines sous les drones cosmiques ;
//   BUG-58 — un passant parti en milieu de liste laissait naître son clone ;
//   BUG-67 — sous 30 images/s, la ville marchait au ralenti (pas plafonné à 1/30 s).

const deps = { getVehicleDensity, chooseRoadVehicleType, vehSkinFor };
const saved = { timeWear: state.timeWear, instability: state.instability, cycles: state.cycles };

// Un grand axe (y = 5), une rue secondaire (y = 12), une avenue qui les relie (x = 15).
function city(band, eraIndex, extra = []) {
  const roads = [];
  for (let gx = 0; gx < 30; gx += 1) roads.push({ gx, gy: 5, rank: "main", mask: 15 }, { gx, gy: 12, rank: "secondary", mask: 15 });
  for (let gy = 0; gy < 20; gy += 1) if (gy !== 5 && gy !== 12) roads.push({ gx: 15, gy, rank: "avenue", mask: 15 });
  roads.push(...extra);
  const L = {
    counts: { eraIndex, eraBand: band, urbanTier: 1, houses: 0 }, roads,
    roadMap: new Map(roads.map((r) => [r.gx + "," + r.gy, r])),
    ageCfg: ageConfigFor(band), personality: null,
  };
  CM.layout = L;
  CM.TILE = 20;
  CM.walkRoadList = roads.slice();
  CM.walkRoadSet = new Set(roads.map((r) => cityMapWalkRoadKey(r.gx, r.gy)));
  CM.wonderWalkSet = new Set();
  return L;
}

beforeEach(() => {
  state.timeWear = 0; state.instability = 0; state.cycles = 3;
  CM.vehicles = []; CM.vehicleTypeKey = ""; CM.focus = null;
});
afterEach(() => {
  Object.assign(state, saved);
  CM.vehicles = []; CM.citizens = []; CM.focus = null; CM.layout = null;
  CM.walkRoadList = []; CM.walkRoadSet = new Set();
});

describe("BUG-56 — la flotte des rues est tenue, plus rebâtie", () => {
  it("la première flotte d'un plan est celle d'avant, au véhicule près", () => {
    const L = city(4, 9);
    cmSyncRoadFleet(L, 8, deps);
    // L'ancienne formule : case pool[(n·53) % longueur], grands axes pondérés.
    const pool = [];
    for (const r of L.roads) { const w = r.rank === "main" ? 11 : r.rank === "avenue" ? 7 : 3; for (let i = 0; i < w; i += 1) pool.push(r); }
    CM.vehicles.forEach((v, n) => {
      const r = pool[(n * 53) % pool.length];
      expect([v.gx, v.gy, v.serial]).toEqual([r.gx, r.gy, n]);
      expect(v.seed).toBe(cmHash(`3:veh:${n}:${r.gx},${r.gy}`) >>> 0);
      expect(v.fade).toBe(0);
    });
  });

  it("un recalcul garde chacun à sa place et n'ajoute ou ne retire que l'écart", () => {
    cmSyncRoadFleet(city(4, 9), 10, deps);
    const first = CM.vehicles.slice();
    for (const v of first) { v.fade = 1; v.x += 7; }          // ils roulent
    // Nouveau plan (une route de plus, un peu plus de trafic voulu) : même ère.
    cmSyncRoadFleet(city(4, 9, [{ gx: 30, gy: 5, rank: "main", mask: 15 }]), 12, deps);
    expect(CM.vehicles).toHaveLength(12);
    first.forEach((v, i) => { expect(CM.vehicles[i]).toBe(v); expect(v.fade).toBe(1); });
    expect(first.every((v) => v.x === (v.gx + 0.5) * 20 + 7)).toBe(true);
    expect(CM.vehicles.slice(10).map((v) => [v.serial, v.fade])).toEqual([[10, 0], [11, 0]]);
    // Moins de trafic voulu : les derniers venus s'en vont, les autres restent.
    cmSyncRoadFleet(CM.layout, 6, deps);
    expect(CM.vehicles).toEqual(first.slice(0, 6));
  });

  it("celui qu'on suit n'est jamais retiré, même quand il ne doit plus en rester", () => {
    cmSyncRoadFleet(city(4, 9), 10, deps);
    const followed = CM.vehicles[7];
    CM.focus = { p: followed, kind: "vehicle", cam: true };
    cmSyncRoadFleet(CM.layout, 3, deps);
    expect(CM.vehicles).toHaveLength(3);
    expect(CM.vehicles[0]).toBe(followed);
    cmSyncRoadFleet(CM.layout, 0, deps);
    expect(CM.vehicles).toEqual([followed]);
  });

  it("nouvelle ère : même place, même conducteur, nouvelle monture", () => {
    cmSyncRoadFleet(city(4, 9), 6, deps);
    const before = CM.vehicles.map((v) => ({ v, x: v.x, seed: v.seed }));
    expect(before.every(({ v }) => ["wagon", "chariot", "caravan"].includes(v.type))).toBe(true);
    cmSyncRoadFleet(city(8, 40), 6, deps);                      // âge stellaire
    before.forEach(({ v, x, seed }, i) => {
      expect(CM.vehicles[i]).toBe(v);
      expect([v.x, v.seed, v.type]).toEqual([x, seed, "drone"]);
    });
  });

  it("une ère de plus dans le même âge : personne ne change de monture sous nos yeux", () => {
    cmSyncRoadFleet(city(5, 25), 12, deps);                     // capitale : voitures sur les axes
    const car = CM.vehicles.find((v) => v.type === "car");
    expect(car).toBeTruthy();
    Object.assign(car, { gx: 3, gy: 12 });                      // elle a tourné dans une rue secondaire
    cmSyncRoadFleet(city(5, 26), 12, deps);
    expect(car.type).toBe("car");                               // pas changée en charrette sur place
  });

  it("un véhicule dont la case a disparu est remis sur la route la plus proche, en fondu", () => {
    cmSyncRoadFleet(city(4, 9), 1, deps);
    const v = CM.vehicles[0];
    // Sa case n'est plus une route (recalcul du plan) : il y restait figé.
    Object.assign(v, { gx: 3, gy: 8, x: 70, y: 170, tx: 70, ty: 170, fade: 1 });
    updateVehicles(0.1);
    expect(v.gy).toBe(5);                                       // le grand axe, 3 cases au nord
    expect(Math.abs(v.gx - 3)).toBeLessThanOrEqual(1);
    expect([v.x, v.y]).toEqual([70, 110]);
    expect(v.fade).toBeCloseTo(0.2, 6);
    updateVehicles(0.5);
    expect(v.fade).toBe(1);
  });

  it("le drone en fondu : ses hélices suivent l'opacité de sa coque", () => {
    // Un contexte qui relève l'opacité de chaque trait peint.
    const seen = [];
    const ctx = {
      globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1,
      save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, arc() {},
      moveTo() {}, lineTo() {}, closePath() {},
      fill() { seen.push(this.globalAlpha); }, stroke() { seen.push(this.globalAlpha); },
    };
    drawDroneRotors(ctx, 64, 0, 0);
    const full = seen.splice(0);
    expect(Math.max(...full)).toBeCloseTo(0.92, 9);             // plein : le dessin d'avant
    ctx.globalAlpha = 0.25;                                     // entrée en fondu
    drawDroneRotors(ctx, 64, 0, 0);
    expect(seen).toHaveLength(full.length);
    seen.forEach((a, i) => expect(a).toBeCloseTo(full[i] * 0.25, 9));
    expect(ctx.globalAlpha).toBe(0.25);
  });

  it("un véhicule sur la route ne bouge pas de case pour rien", () => {
    cmSyncRoadFleet(city(4, 9), 1, deps);
    const v = CM.vehicles[0];
    Object.assign(v, { gx: 9, gy: 5, x: 150, y: 110, tx: 190, ty: 110, fade: 1 });   // en route vers la case 9
    updateVehicles(1 / 30);
    expect([v.gx, v.gy, v.fade]).toEqual([9, 5, 1]);
    expect(v.x).toBeGreaterThan(150);
  });
});

describe("BUG-57 — chaque époque roule avec ses véhicules", () => {
  const mix = (band, rank) => {
    CM.layout = { counts: { eraBand: band }, ageCfg: ageConfigFor(band), personality: null };
    const out = {};
    for (let s = 0; s < 1000; s += 1) { const t = chooseRoadVehicleType(30, rank, s); out[t] = (out[t] || 0) + 1; }
    return out;
  };

  it("mégalopole : plus de char à bœufs dans les rues étroites", () => {
    const sec = mix(6, "secondary");
    expect(sec.wagon).toBeUndefined();
    expect(sec.car).toBeGreaterThan(500);
    expect(sec.bus || 0).toBe(0);                               // trop long pour une venelle
    expect(mix(6, "main").bus).toBeGreaterThan(0);              // les grands axes, inchangés
  });

  it("Noosphère et âge stellaire : des drones, ni berline ni chariot", () => {
    for (const band of [7, 8]) {
      for (const rank of ["main", "avenue", "secondary"]) expect(Object.keys(mix(band, rank))).toEqual(["drone"]);
    }
  });

  it("capitale monumentale : le repli d'époque reste la charrette", () => {
    expect(mix(5, "secondary").wagon).toBeGreaterThan(0);
    expect(mix(5, "secondary").car || 0).toBe(0);
  });
});

describe("BUG-58 — un passant parti ne laisse pas naître son clone", () => {
  it("le numéro d'apparition ne revient jamais tant qu'il reste quelqu'un", () => {
    const L = city(4, 9);
    CM.homeRoadCells = CM.walkRoadList.slice(0, 40);
    CM.workRoadCells = [];
    CM.citizens = [];
    for (let i = 0; i < 6; i += 1) spawnOneCitizen(L);
    const firstSeed = CM.citizens[0].seed;
    // Un compagnon rentré avec son meneur quitte la liste en son milieu.
    CM.citizens.splice(2, 1);
    spawnOneCitizen(L);
    const seeds = CM.citizens.map((c) => c.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
    // Liste vidée (changement de cycle, plus de route) : on repart de 0.
    CM.citizens = [];
    spawnOneCitizen(L);
    expect(CM.citizens[0].seed).toBe(firstSeed);
  });
});

describe("BUG-67 — sous-pas de simulation", () => {
  it("60 images/s et le bruit de l'horloge à 30 : un seul pas, comme avant", () => {
    expect(simStepsFor(1 / 60)).toEqual({ steps: 1, dt: 1 / 60 });
    expect(simStepsFor(0.0334)).toEqual({ steps: 1, dt: 1 / 30 });
  });

  it("une frame lente se joue en plusieurs pas, jamais plus de 1/30 s chacun", () => {
    const soft = simStepsFor(0.062);                            // rendu logiciel, ~16 i/s
    expect(soft.steps).toBe(2);
    expect(soft.steps * soft.dt).toBeCloseTo(0.062, 9);
    for (let ms = 0; ms <= 100; ms += 0.5) {
      const s = simStepsFor(ms / 1000);
      expect(s.steps).toBeLessThanOrEqual(3);
      expect(s.dt).toBeLessThanOrEqual(1 / 30 + 1e-12);
      expect(s.steps * s.dt).toBeGreaterThanOrEqual(ms / 1000 * 0.9 - 1e-12);
    }
  });

  it("au-delà de 0,1 s (onglet revenu), le ralenti est accepté ; jamais de pas négatif", () => {
    expect(simStepsFor(5)).toEqual({ steps: 3, dt: 1 / 30 });
    expect(simStepsFor(-0.02)).toEqual({ steps: 1, dt: 0 });
    expect(simStepsFor(NaN)).toEqual({ steps: 1, dt: 0 });
  });
});
