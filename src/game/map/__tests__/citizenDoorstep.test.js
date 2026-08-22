import { describe, it, expect } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey, citizenSpawnCell } from "../agents.js";

// « Les habitants ne spawnent pas au hasard mais devant les maisons, et
// disparaissent devant n'importe quel bâtiment plutôt qu'au milieu de la rue »
// (Raph 2026-07-29). Les deux bouts de vie d'un piéton sont désormais accrochés
// aux SEUILS — les cellules-route bordant un bâtiment, publiées par
// cityMapEnsureLayout dans CM.homeRoadCells / CM.buildingEdgeSet.
//
// Ce test pilote le VRAI updateCitizens sur un corridor où un seul bout est un
// seuil : un habitant en partance doit traverser toute la rue sans s'effacer,
// puis ne se dissiper qu'arrivé devant la porte. Le contrôle négatif (seuils non
// publiés) montre que l'assertion tient bien à la garde et pas au hasard.

const TILE = 20;
const SPEED = 10;
const DT = 0.016;

// Corridor horizontal y=5, x de 2 à 12. Seule (12,5) borde un bâtiment.
const DOOR = { gx: 12, gy: 5 };

function setupCorridor({ withDoorstep = true } = {}) {
  CM.TILE = TILE;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.cw = 800; CM.ch = 600; CM.nightF = 0;
  const roadMap = new Map();
  const walkRoadSet = new Set();
  const walkRoadList = [];
  const mask = ROAD_E | ROAD_W | ROAD_S | ROAD_N;
  for (let gx = 2; gx <= 12; gx += 1) {
    walkRoadSet.add(cityMapWalkRoadKey(gx, 5));
    walkRoadList.push({ gx, gy: 5 });
    roadMap.set(gx + ",5", { gx, gy: 5, mask, roadSurface: "road" });
  }
  CM.layout = { counts: { eraBand: 2, eraIndex: 5 }, roadMap };
  CM.walkRoadSet = walkRoadSet;
  CM.walkRoadList = walkRoadList;
  CM.wonderWalkSet = null;
  CM.wonderGatherCells = null;
  CM.plazaRoadCells = null;
  CM.bankRoads = null;
  CM.globalBubbleCooldown = 999;
  CM.vehicles = [];
  CM.citizens = [];
  CM.homeRoadCells = withDoorstep ? [DOOR] : [];
  CM.workRoadCells = [];
  CM.buildingEdgeList = withDoorstep ? [DOOR] : [];
  CM.buildingEdgeSet = new Set(withDoorstep ? [cityMapWalkRoadKey(DOOR.gx, DOOR.gy)] : []);
}

function makeCitizen(gx, gy, extra = {}) {
  return {
    gx, gy,
    x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE,
    tx: (gx + 0.5) * TILE, ty: (gy + 0.5) * TILE,
    pauseT: 0, speed: SPEED, phase: 0.1, dir: 0, charType: 0, skinVariant: 0, fade: 1,
    goal: null, social: false, home: null, work: null,
    thoughtType: null, thoughtTimer: 0,
    ...extra,
  };
}

const atDoor = (p) => p.gx === DOOR.gx && p.gy === DOOR.gy;

describe("apparition devant les maisons", () => {
  it("tire toujours un seuil de logement, jamais une cellule de rue quelconque", () => {
    setupCorridor();
    // 200 graines : le tirage doit rester DANS homeRoadCells. L'ancien spawn piochait
    // dans walkRoadList (11 cellules) et serait tombé à côté quasi à tous les coups.
    const seen = new Set();
    for (let s = 0; s < 200; s += 1) {
      const c = citizenSpawnCell(s * 2654435761 >>> 0);
      seen.add(c.gx + "," + c.gy);
    }
    expect([...seen]).toEqual([DOOR.gx + "," + DOOR.gy]);
  });

  it("se rabat sur la voirie tant qu'aucun logement n'est bordé de route", () => {
    setupCorridor({ withDoorstep: false });
    const c = citizenSpawnCell(7);
    expect(c).toBeTruthy();
    expect(CM.walkRoadSet.has(cityMapWalkRoadKey(c.gx, c.gy))).toBe(true);
  });
});

describe("effacement devant une porte", () => {
  it("un habitant en partance traverse la rue sans s'effacer, puis se dissipe au seuil", () => {
    setupCorridor();
    const p = makeCitizen(2, 5, { leaving: true });
    CM.citizens = [p];
    let fadedInStreet = false;   // fondu amorcé AILLEURS que devant la porte : le bug
    let reached = false;
    let partial = false;         // au moins une frame à mi-fondu : pas de pop sec
    for (let step = 0; step < 6000 && CM.citizens.length; step += 1) {
      updateCitizens(DT);
      if (!CM.citizens.length) break;
      const f = p._sleepFade === undefined ? 1 : p._sleepFade;
      if (atDoor(p)) reached = true;
      else if (f < 1) fadedInStreet = true;
      if (f > 0 && f < 1) partial = true;
    }
    expect(fadedInStreet).toBe(false);
    expect(reached).toBe(true);
    expect(partial).toBe(true);
    expect(CM.citizens.length).toBe(0);   // rentré : il quitte la liste
  });

  it("CONTRÔLE — sans seuils publiés, il s'efface sur place (garde désarmée)", () => {
    setupCorridor({ withDoorstep: false });
    const p = makeCitizen(2, 5, { leaving: true });
    CM.citizens = [p];
    for (let step = 0; step < 200 && CM.citizens.length; step += 1) updateCitizens(DT);
    // Il est parti bien avant d'avoir pu traverser les 10 cellules du corridor :
    // c'est l'ancien comportement, et la preuve que le test ci-dessus mesure la garde.
    expect(CM.citizens.length).toBe(0);
    expect(p.gx).toBeLessThan(DOOR.gx);
  });

  it("sous l'averse il COURT vers l'abri, et rentre chez lui plutôt qu'au seuil le plus proche", () => {
    // Deux seuils : le domicile à l'OUEST (2,5) et une porte quelconque juste à l'EST
    // (12,5). Un habitant surpris par la pluie en (11,5) doit tourner le dos à la porte
    // voisine pour rentrer CHEZ LUI — et couvrir plus de terrain qu'au pas de marche.
    const distance = (rainF) => {
      setupCorridor();
      CM.buildingEdgeList = [{ gx: 2, gy: 5 }, DOOR];
      CM.buildingEdgeSet = new Set([cityMapWalkRoadKey(2, 5), cityMapWalkRoadKey(DOOR.gx, DOOR.gy)]);
      CM.rainF = rainF;
      // dir -1 : pas de cap tenu à l'entrée, il choisit librement son premier pas
      // (la règle anti-demi-tour interdirait sinon de repartir vers l'ouest).
      const p = makeCitizen(11, 5, { leaving: true, home: { gx: 2, gy: 5 }, dir: -1 });
      CM.citizens = [p];
      const x0 = p.x;
      for (let step = 0; step < 40; step += 1) updateCitizens(DT);
      return { parcouru: Math.abs(p.x - x0), versOuest: p.x < x0, vivant: CM.citizens.length === 1 };
    };
    const marche = distance(0);       // temps sec : il rentre au pas
    const course = distance(0.9);     // averse : il court
    expect(marche.versOuest).toBe(true);    // cap sur le domicile dans les deux cas
    expect(course.versOuest).toBe(true);
    expect(course.parcouru).toBeGreaterThan(marche.parcouru * 1.5);
  });

  it("le dormeur de la nuit attend la porte pour s'estomper, et progressivement", () => {
    setupCorridor();
    CM.nightF = 0.9;                       // nuit installée : le fondu peut s'amorcer
    // phase 0.03 → ((0.03*100)|0) % 3 === 0 : ce citoyen fait partie du tiers dormeur.
    const p = makeCitizen(2, 5, { phase: 0.03 });
    CM.citizens = [p];
    let fadedInStreet = false, partial = false, hiddenAtDoor = false;
    for (let step = 0; step < 6000; step += 1) {
      updateCitizens(DT);
      const f = p._sleepFade === undefined ? 1 : p._sleepFade;
      if (!atDoor(p) && f < 1) fadedInStreet = true;
      if (f > 0 && f < 1) partial = true;
      if (atDoor(p) && f <= 0) { hiddenAtDoor = true; break; }
    }
    expect(fadedInStreet).toBe(false);
    expect(partial).toBe(true);            // fondu piloté par dt, pas un pop en une frame
    expect(hiddenAtDoor).toBe(true);
    expect(p._nightHidden).toBe(true);
    expect(CM.citizens.length).toBe(1);    // il dort, il ne quitte pas la ville
  });
});
