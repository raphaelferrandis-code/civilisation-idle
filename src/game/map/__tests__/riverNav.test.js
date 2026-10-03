// La NAVIGATION de la flotte (docs/PLAN-BATEAUX.md §5) : règle de route, suivre,
// doubler, passe du pont à sens unique, cap à giration bornée.
import { describe, it, expect } from "vitest";
import {
  updateRiverFleet, makeFleetCtl, ribbonAt, ribbonLength, mergeGates, navWindow, NAV_TUNE,
  ferrySite, ferryLat, riverFleetBudget, FLEET_TUNE,
} from "../riverFleet.js";

// Un fleuve droit d'ouest en est, 60 tuiles, demi-largeur 3.
const SM = Array.from({ length: 61 }, (_, i) => ({ x: i, y: 10, hw: 3 }));
const L = ribbonLength(SM);
const NONE = { trade: 0, fisher: 0 };
const DT = 0.1;
const SIZE = { len: 1.8, beam: 0.55 };

function boat(o) {
  return {
    kind: "trade", dir: 1, t: 0.5, speed: 0.008, lane: 0.4, phase: 0, fade: 1,
    state: "cruise", stateT: 0, done: true, lastDock: -1, ...o,
  };
}
function run(ships, seconds, env = {}, each = null) {
  const ctl = makeFleetCtl();
  ctl.birth = { trade: 1e9, fisher: 1e9 };
  const E = { samples: SM, gates: [], obstacles: [], sizeOf: () => SIZE, ...env };
  for (let k = 0; k < seconds / DT; k += 1) {
    updateRiverFleet(ships, ctl, NONE, DT, E);
    if (each) each(ships, k);
  }
  return ships;
}

describe("navigation — géométrie du ruban", () => {
  it("ribbonAt interpole comme le rendu, normale à gauche du sens des samples", () => {
    const r = ribbonAt(SM, 0.25);
    expect(r.x).toBeCloseTo(15, 5);
    expect(r.tx).toBeCloseTo(1, 5);
    expect(r.nx).toBeCloseTo(0, 5);
    expect(r.ny).toBeCloseTo(1, 5);
    expect(L).toBeCloseTo(60, 5);
  });
  it("un pont large (une porte par cellule) ne fait qu'UNE passe", () => {
    const g = mergeGates([{ t: 0.5 }, { t: 0.5 + 1 / 60 }, { t: 0.8 }], L);
    expect(g.length).toBe(2);
  });
});

describe("navigation — règle de route", () => {
  it("chacun tient sa DROITE : deux sens, deux files", () => {
    const ships = run([boat({ id: 1, dir: 1, t: 0.2 }), boat({ id: 2, dir: -1, t: 0.8 })], 3);
    // Sens +1 : tribord = +normale ; sens −1 : tribord = −normale.
    expect(ships[0].lat).toBeGreaterThan(0.3);
    expect(ships[1].lat).toBeLessThan(-0.3);
  });

  it("le cap suit le ruban, et ne vire jamais plus vite que la giration permise", () => {
    const ships = [boat({ id: 1, t: 0.2, lane: 0 })];
    let prev = null, maxRate = 0;
    run(ships, 6, {}, (s) => {
      if (prev != null) maxRate = Math.max(maxRate, Math.abs(Math.atan2(Math.sin(s[0].th - prev), Math.cos(s[0].th - prev))) / DT);
      prev = s[0].th;
    });
    expect(Math.abs(ships[0].th)).toBeLessThan(0.2);
    expect(maxRate).toBeLessThanOrEqual(NAV_TUNE.turnRate * 2 + 1e-6);
  });
});

describe("navigation — personne ne passe à travers personne", () => {
  it("un rapide derrière un lent : il ralentit ou il double, jamais il ne le traverse", () => {
    // Vitesses en TUILES/s (la sim les convertit selon la longueur du ruban).
    const fast = boat({ id: 1, t: 0.3, _vTiles: 1.4, lane: 0.4 });
    const slow = boat({ id: 2, t: 0.34, _vTiles: 0.45, lane: 0.4 });
    let worst = Infinity;
    run([fast, slow], 60, {}, () => {
      const along = Math.abs(slow.t - fast.t) * L - SIZE.len;
      const side = Math.abs(slow.lat - fast.lat) - SIZE.beam;
      // Deux coques se touchent si elles se recouvrent dans les DEUX sens.
      if (along < 0 && side < 0) worst = Math.min(worst, Math.max(along, side));
    });
    expect(worst).toBe(Infinity);
    // … et il a fini par passer devant (la file d'en face était libre).
    expect(fast.t).toBeGreaterThan(slow.t);
  });

  it("derrière un lent, file d'en face OCCUPÉE : il reste derrière", () => {
    // Vitesses en TUILES/s (la sim les convertit selon la longueur du ruban).
    const fast = boat({ id: 1, t: 0.3, _vTiles: 1.4, lane: 0.4 });
    const slow = boat({ id: 2, t: 0.34, _vTiles: 0.45, lane: 0.4 });
    // Un convoi qui remonte en face, à la queue leu leu.
    const oncoming = [0, 1, 2, 3, 4, 5].map((k) => boat({ id: 10 + k, dir: -1, t: 0.46 + k * 0.07, _vTiles: 0.8, lane: 0.4 }));
    run([fast, slow, ...oncoming], 8);
    expect(fast.t).toBeLessThan(slow.t);
    expect(fast.overtake == null).toBe(true);
  });
});

describe("navigation — la passe du pont est à sens unique", () => {
  it("deux bateaux qui arrivent en face ne s'y trouvent jamais ensemble", () => {
    const a = boat({ id: 1, dir: 1, t: 0.42, speed: 0.008 });
    const b = boat({ id: 2, dir: -1, t: 0.58, speed: 0.008 });
    const gates = [{ t: 0.5 }];
    const zone = NAV_TUNE.gateZone + SIZE.len / 2;
    let together = 0, waited = 0;
    run([a, b], 60, { gates }, () => {
      const inA = Math.abs((0.5 - a.t) * L) < zone, inB = Math.abs((0.5 - b.t) * L) < zone;
      if (inA && inB) together += 1;
      if (a._gateWait || b._gateWait) waited += 1;
    });
    expect(together).toBe(0);
    expect(waited).toBeGreaterThan(0);
    // Et personne n'est resté bloqué : les deux ont franchi.
    expect(a.t).toBeGreaterThan(0.55);
    expect(b.t).toBeLessThan(0.45);
  });

  it("dans le MÊME sens, on se suit sous le pont sans s'attendre", () => {
    const a = boat({ id: 1, dir: 1, t: 0.44, speed: 0.008 });
    const b = boat({ id: 2, dir: 1, t: 0.40, speed: 0.008 });
    run([a, b], 10, { gates: [{ t: 0.5 }] });
    expect(a._gateWait || 0).toBe(0);
    expect(b._gateWait || 0).toBe(0);
  });
});

describe("navigation — rien ne casse", () => {
  it("sans géométrie (les anciens tests), la voie n'est pas simulée", () => {
    const ships = [boat({ id: 1 })];
    const ctl = makeFleetCtl(); ctl.birth = { trade: 1e9, fisher: 1e9 };
    updateRiverFleet(ships, ctl, NONE, DT, {});
    expect(ships[0].lat).toBeUndefined();
  });
  it("aucune valeur NaN sur une longue traversée chargée", () => {
    const ships = Array.from({ length: 7 }, (_, k) => boat({ id: k + 1, dir: k % 2 ? -1 : 1, t: 0.1 + k * 0.11, speed: 0.005 + (k % 3) * 0.003, lane: (k % 4) * 0.2 }));
    run(ships, 90, { gates: [{ t: 0.5 }] });
    for (const s of ships) {
      expect(Number.isFinite(s.lat)).toBe(true);
      expect(Number.isFinite(s.th)).toBe(true);
    }
  });
  it("une coque reste dans le lit", () => {
    const ships = Array.from({ length: 6 }, (_, k) => boat({ id: k + 1, dir: k % 2 ? -1 : 1, t: 0.15 + k * 0.12, speed: 0.004 + (k % 3) * 0.004 }));
    let worst = 0;
    run(ships, 90, { gates: [{ t: 0.5 }] }, (s) => { for (const b of s) worst = Math.max(worst, Math.abs(b.lat) + SIZE.beam / 2); });
    expect(worst).toBeLessThan(3);
  });
});

describe("navigation — la fenêtre de la carte", () => {
  // Le ruban déborde la carte de très loin (590 tuiles pour 164 au banc) : on naît
  // et on meurt à ses bords, pas 200 tuiles avant la ville.
  const LONG = Array.from({ length: 301 }, (_, i) => ({ x: -100 + i, y: 10, hw: 3 }));
  const B = { x0: 0, y0: 0, x1: 100, y1: 100 };
  it("navWindow ne garde que la traversée de la carte, marge comprise", () => {
    const [lo, hi] = navWindow(LONG, B);
    expect(lo * 300 - 100).toBeCloseTo(-NAV_TUNE.winMargin, 0);
    expect(hi * 300 - 100).toBeCloseTo(100 + NAV_TUNE.winMargin, 0);
  });
  it("un marchand naît au BORD de la fenêtre et meurt passé l'autre", () => {
    const ships = [];
    const ctl = makeFleetCtl();
    const env = { samples: LONG, bounds: B, sizeOf: () => SIZE };
    updateRiverFleet(ships, ctl, { trade: 1, fisher: 0 }, DT, env);
    expect(ships.length).toBe(1);
    const x = ships[0].t * 300 - 100;
    expect(x > -NAV_TUNE.winMargin - 5 && x < 100 + NAV_TUNE.winMargin + 5).toBe(true);
    // Traversée entière : il disparaît sans avoir quitté la fenêtre de plus d'un pas.
    let maxOut = 0;
    for (let k = 0; k < 4000 && ships.length; k += 1) {
      updateRiverFleet(ships, ctl, { trade: 0, fisher: 0 }, DT, env);
      for (const b of ships) {
        const bx = b.t * 300 - 100;
        maxOut = Math.max(maxOut, -NAV_TUNE.winMargin - bx, bx - 100 - NAV_TUNE.winMargin);
      }
    }
    expect(ships.length).toBe(0);
    expect(maxOut).toBeLessThan(6);
  });
  it("à la passe, celui qui attend serre sa DROITE (il ne bouche pas la sortie)", () => {
    const a = boat({ id: 1, dir: 1, t: 0.46, _vTiles: 1 });
    const b = boat({ id: 2, dir: -1, t: 0.555, _vTiles: 1 });
    let minSep = Infinity;
    run([a, b], 40, { gates: [{ t: 0.5 }] }, () => {
      if (Math.abs(a.t - b.t) * L < SIZE.len) minSep = Math.min(minSep, Math.abs(a.lat - b.lat));
    });
    expect(minSep).toBeGreaterThan(SIZE.beam + 0.2);
  });
});

describe("navigation — le vrai accostage", () => {
  // Un poste au bord (lat 2,2), à mi-fleuve.
  const BERTH = { id: "p", t: 0.5, lat: 2.2, th: 0, x: 30, y: 12.2, along: "river" };
  const trader = (o) => boat({ done: false, _vTiles: 1.1, ...o });

  it("le marchand vient se ranger AU PONTON, y reste, puis repart en libérant le poste", () => {
    const a = trader({ id: 1, t: 0.3 });
    const ctl = makeFleetCtl(); ctl.birth = { trade: 1e9, fisher: 1e9 };
    const env = { samples: SM, gates: [], obstacles: [], sizeOf: () => SIZE, berths: [BERTH] };
    let docked = 0, atBerth = Infinity, freed = false;
    for (let k = 0; k < 900; k += 1) {
      updateRiverFleet([a], ctl, NONE, DT, env);
      if (a.state === "dock") {
        docked += DT;
        atBerth = Math.min(atBerth, Math.abs(a.t - BERTH.t) * L + Math.abs(a.lat - BERTH.lat));
      }
      if (docked > 0 && a.state === "cruise" && !ctl.berthOwner.p) freed = true;
    }
    expect(docked).toBeGreaterThan(14);
    expect(atBerth).toBeLessThan(0.35);
    expect(freed).toBe(true);
    expect(a.done).toBe(true);
    expect(a.t).toBeGreaterThan(0.55);         // il est reparti
  });

  it("poste PRIS : le second attend son tour au lieu de traverser le premier", () => {
    const a = trader({ id: 1, t: 0.4 });
    const b = trader({ id: 2, t: 0.33 });
    const ctl = makeFleetCtl(); ctl.birth = { trade: 1e9, fisher: 1e9 };
    const env = { samples: SM, gates: [], obstacles: [], sizeOf: () => SIZE, berths: [BERTH] };
    let waited = false, bothDocked = 0, bDocked = false;
    for (let k = 0; k < 1500; k += 1) {
      updateRiverFleet([a, b], ctl, NONE, DT, env);
      if (b.waitBerth) waited = true;
      if (a.state === "dock" && b.state === "dock") bothDocked += 1;
      if (b.state === "dock") bDocked = true;
    }
    expect(waited).toBe(true);
    expect(bothDocked).toBe(0);
    expect(bDocked).toBe(true);
  });
});

describe("navigation — le ponton est une passe", () => {
  // Ponton parti de la rive NÉGATIVE, tête à lat −0,6 ; un marchand y est amarré.
  const BERTH = { id: "p", t: 0.5, lat: -0.6, th: 0, side: -1, beam: 0.55 };
  it("ceux qui passent contournent le ponton et le bateau à quai, par le chenal libre", () => {
    const docked = boat({ id: 1, t: 0.5, state: "dock", stateT: 1e9, berthId: "p", berthLat: -0.6, lat: -0.6 });
    const passer = boat({ id: 2, dir: -1, t: 0.62, done: true, _vTiles: 1 });
    let worst = Infinity;
    run([docked, passer], 30, { berths: [BERTH] }, () => {
      if (Math.abs(passer.t - 0.5) * L < SIZE.len) worst = Math.min(worst, passer.lat - BERTH.lat);
    });
    // Toujours du côté libre, avec la largeur de deux demi-coques et du jeu.
    expect(worst).toBeGreaterThan(SIZE.beam + 0.3);
    expect(passer.t).toBeLessThan(0.45);
  });
});

describe("le passeur", () => {
  const SITE = { t: 0.5, hw: 3 };
  const ferry = (o) => boat({ kind: "ferry", id: 50, t: 0.5, state: "board", stateT: 1, ferrySide: -1, trip: 0, ...o });

  it("son site fuit le pont et le port (16 tuiles au moins)", () => {
    const site = ferrySite(SM, [0, 1], [0.5, 0.7], 0.5);
    expect(site).not.toBeNull();
    for (const a of [0.5, 0.7]) expect(Math.abs(site.t - a) * L).toBeGreaterThanOrEqual(16);
  });

  it("fait la navette : il traverse, s'arrête à l'autre rive, repart", () => {
    const f = ferry();
    const sides = [];
    run([f], 120, { ferry: SITE }, () => { if (f.state === "board" && sides[sides.length - 1] !== f.ferrySide) sides.push(f.ferrySide); });
    expect(sides.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < sides.length; k += 1) expect(sides[k]).toBe(-sides[k - 1]);
    expect(Math.abs(f.lat)).toBeLessThanOrEqual(ferryLat(SITE, 1) + 1e-6);
  });

  it("ne part pas quand un bateau arrive tout près", () => {
    const f = ferry({ stateT: 0.1 });
    const b = boat({ id: 2, t: 0.5 - 5 / L, _vTiles: 0.05 });   // presque à l'arrêt, à 5 tuiles
    run([f, b], 3, { ferry: SITE });
    expect(f.state).toBe("board");
  });

  it("pendant la traversée, celui qui arrive attend au lieu de passer sur le bac", () => {
    const f = ferry({ state: "cross", ferrySide: 1, lat: ferryLat(SITE, -1), latV: 0 });
    const b = boat({ id: 2, t: 0.5 - 9 / L, _vTiles: 1.2 });
    let minGap = Infinity;
    run([f, b], 12, { ferry: SITE }, () => {
      if (f.state === "cross") minGap = Math.min(minGap, (0.5 - b.t) * L - SIZE.len / 2);
    });
    expect(minGap).toBeGreaterThan(0.8);
  });

  it("le budget ne publie chaland et passeur QUE là où l'ère a leur dessin", () => {
    const L4 = { river: { present: true }, counts: { eraIndex: 20, eraBand: 4 } };
    expect(riverFleetBudget({ buildings: {} }, L4)).toMatchObject({ barge: 0, ferry: 0 });
    expect(riverFleetBudget({ buildings: {} }, L4, ["trade", "barge", "ferry"])).toMatchObject({ barge: 1, ferry: 1 });
  });
});

describe("le chaland", () => {
  // Plus de halage (Raph, 2026-10-03) : il ne longe plus une rive (collé au quai, il
  // traversait les escaliers) — il tient sa droite selon son sens, comme les autres.
  it("tient sa droite selon son sens, sans longer une rive", () => {
    const a = boat({ kind: "barge", id: 60, dir: 1, t: 0.3, done: true, _vTiles: 0.6 });
    const b = boat({ kind: "barge", id: 61, dir: -1, t: 0.7, done: true, _vTiles: 0.6 });
    run([a, b], 8);
    expect(a.lat).toBeGreaterThan(0);
    expect(b.lat).toBeLessThan(0);
    expect(FLEET_TUNE.bargeGap[0]).toBeGreaterThan(20);
  });
});

describe("naissances des nouveaux métiers", () => {
  it("chaland et passeur naissent sans planter (vitesse de repli, site du bac)", () => {
    const ships = [];
    const ctl = makeFleetCtl();
    const env = { samples: SM, sizeOf: () => SIZE, ferry: { t: 0.5, hw: 3 } };
    for (let k = 0; k < 50; k += 1) updateRiverFleet(ships, ctl, { trade: 0, fisher: 0, barge: 1, ferry: 1 }, DT, env);
    expect(ships.some((s) => s.kind === "barge")).toBe(true);
    expect(ships.some((s) => s.kind === "ferry")).toBe(true);
  });
});

describe("les bateaux de service", () => {
  const LONG = Array.from({ length: 301 }, (_, i) => ({ x: -100 + i, y: 10, hw: 3 }));
  const B = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const run2 = (mode, seconds, each) => {
    const ships = [];
    const ctl = makeFleetCtl();
    const env = { samples: LONG, bounds: B, sizeOf: () => ({ len: 1, beam: 0.35 }), serviceMode: () => mode };
    for (let k = 0; k < seconds / DT; k += 1) {
      updateRiverFleet(ships, ctl, { trade: 0, fisher: 0, service: 1 }, DT, env);
      if (each) each(ships);
    }
    return ships;
  };
  it("la patrouille fait demi-tour et ne quitte jamais la carte", () => {
    let flips = 0, last = null, out = 0;
    const ships = run2("patrol", 600, (s) => {
      const p = s.find((o) => o.kind === "service");
      if (!p) return;
      if (last != null && p.dir !== last) flips += 1;
      last = p.dir;
      const x = p.t * 300 - 100;
      if (x < -NAV_TUNE.winMargin - 5 || x > 100 + NAV_TUNE.winMargin + 5) out += 1;
    });
    expect(ships.filter((o) => o.kind === "service").length).toBe(1);
    expect(flips).toBeGreaterThanOrEqual(2);
    expect(out).toBe(0);
  });
  it("la drague reste à son poste", () => {
    let t0 = null, moved = 0;
    run2("work", 120, (s) => {
      const d = s.find((o) => o.kind === "service");
      if (!d) return;
      if (t0 == null) t0 = d.t;
      moved = Math.max(moved, Math.abs(d.t - t0));
      expect(d.state).toBe("anchor");
    });
    expect(moved).toBe(0);
  });
  it("les pompiers s'arrêtent pour arroser, puis repartent", () => {
    let stops = 0, prev = "cruise";
    run2("fire", 400, (s) => {
      const p = s.find((o) => o.kind === "service");
      if (!p) return;
      if (p.state === "anchor" && prev !== "anchor") stops += 1;
      prev = p.state;
    });
    expect(stops).toBeGreaterThanOrEqual(2);
  });
});
