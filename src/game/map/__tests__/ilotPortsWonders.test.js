// VILLE PAR ÎLOTS — revue du 2026-10-04, deux oublis du passage aux îlots :
//  1. le port de commerce (bandes 5+) était resté dans le bloc `townOn` : plus aucun
//     ne se fondait ; PLAN-ILOTS : « champs, moulins et port gardent leur placement » ;
//  2. une merveille neuve se posait sur les îlots déjà bâtis (la garde d'espacement
//     des merveilles n'était active qu'avec `townOn`) et en délogeait les maisons.
// Même méthode que ilotLayout.test.js : on fait grandir l'état GLOBAL.
import { describe, it, expect, beforeEach } from "vitest";
import { computeCityLayout, ILOT_MODE } from "../layout.js";
import { state } from "../../core/state.js";
import { D } from "../../core/num.js";
import { eras } from "../../data/world.js";
import { ROAD_MEMORY } from "../roadMemory.js";
import { tradeCells } from "../portSites.js";
import { growCity as grow } from "../../../test/city.js";

const BUILT = new Set(["house", "enginehome", "engine"]);
const foot = (t) => { const out = []; const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1; for (let a = 0; a < sx; a += 1) for (let b = 0; b < sy; b += 1) out.push((t.gx + a) + "," + (t.gy + b)); return out; };
const RURAL = /:(irrigated_fields|water_mills|river_ports):/;

beforeEach(() => {
  ROAD_MEMORY.on = true; ILOT_MODE.on = true;
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
  state.wonders = [];
});

describe("ville par îlots — port de commerce et merveilles", () => {
  it("le port de commerce se fonde à la bande 5, hors des îlots, desservi par une rue", () => {
    grow(21);
    const L = grow(25);
    expect(L.counts.eraBand).toBe(5);
    const port = L.tiles.find((t) => t.key === "engine:river_ports:trade");
    expect(port, "tuile du port de commerce").toBeTruthy();
    expect(state.cityCore.ports && state.cityCore.ports.trade).toBeTruthy();
    // Aucun autre bâtiment ni rue sur le terre-plein.
    const tp = port.tradePort;
    const cells = new Set(tradeCells(tp).map(([x, y]) => x + "," + y));
    for (const t of L.tiles) {
      if (t === port || !BUILT.has(t.type)) continue;
      for (const k of foot(t)) expect(cells.has(k), `${t.key || t.type} sur le port`).toBe(false);
    }
    for (const k of cells) expect(L.roadSet.has(k)).toBe(false);
    // Une rue touche l'arrière du terre-plein.
    const dir = tp.side === "N" ? 1 : -1;
    let served = false;
    for (let i = 0; i < tp.len && !served; i += 1) {
      const x = tp.x0 + i, y = tp.edge[i] - dir * tp.depth;
      if (L.roadSet.has(x + "," + y)) served = true;
    }
    expect(served, "rue d'accès").toBe(true);
  });

  // LE PORT NE SAUTE PLUS (audit 2026-10-05, BUG-14) : la revérification du terre-plein
  // lisait tout le pourtour des îlots ouverts (ilotMemoryCells), même là où aucune rue
  // ne se pose — un îlot ouvert contre lui faisait refonder le port au calcul suivant
  // (10 déplacements sur 54 recalculs mesurés, jusqu'à 28 cases). Les deux graines et
  // l'achat retenus déplaçaient le port avant le correctif.
  it("le port de commerce, fondé une fois, ne bouge plus quand la ville grandit", () => {
    const ALL = Object.keys(state.buildings);
    const run = (era, lvl, seed) => {
      const pop = D(eras[era].at).mul(3);
      Object.assign(state, { cycles: 1, mapSeed: seed, population: pop, knowledge: pop.mul(0.05), infrastructure: pop.mul(0.1), instability: 0, timeWear: 0 });
      for (const k of ALL) state.buildings[k] = k === "roads" ? 20 : lvl;
      return computeCityLayout(state);
    };
    for (const seed of [0x2b1c07, 777]) {
      state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
      let dx = null;
      for (const [era, lvl] of [[32, 160], [32, 200]]) {
        const L = run(era, lvl, seed);
        const at = `graine ${seed.toString(16)}, ère ${era}, niveau ${lvl}`;
        const tr = state.cityCore.ports && state.cityCore.ports.trade;
        expect(tr, at).toBeTruthy();
        if (dx === null) dx = tr.dx;
        expect(tr.dx, `port déplacé (${at})`).toBe(dx);
        // …et resté libre : ni bâtiment ni rue sur le terre-plein. (Une assertion par
        // liste, pas par case : des milliers d'`expect` coûtaient ~0,7 s au test.)
        const port = L.tiles.find((t) => t.key === "engine:river_ports:trade");
        const cells = new Set(tradeCells(port.tradePort).map(([x, y]) => x + "," + y));
        const onPort = L.tiles.filter((t) => t !== port && BUILT.has(t.type) && foot(t).some((k) => cells.has(k))).map((t) => t.key || t.type);
        expect(onPort, `bâtiments sur le port (${at})`).toEqual([]);
        expect([...cells].filter((k) => L.roadSet.has(k)), `rues sur le port (${at})`).toEqual([]);
      }
    }
  });

  it("une merveille neuve contourne les îlots déjà ouverts : aucune maison ne déménage", () => {
    grow(21);
    const before = { ...state.cityMapSlots };
    state.wonders = ["era_singularity"];        // l'Œil : anneau 0,42, en plein dans la ville
    grow(21);
    const f = state.cityCore.wonders && state.cityCore.wonders.era_singularity;
    expect(f, "merveille posée").toBeTruthy();
    let moved = 0;
    for (const [k, v] of Object.entries(before)) {
      if (RURAL.test(k)) continue;
      const now = state.cityMapSlots[k];
      if (!now || now.dx !== v.dx || now.dy !== v.dy) moved += 1;
    }
    expect(moved, "maisons et halles délogées par la merveille").toBe(0);
  });
});
