import { describe, it, expect } from "vitest";

import { CM } from "../layout.js";
import { drawGroundAgents } from "../agents.js";

// Vérifie le Y-SORT FUSIONNÉ piétons ↔ véhicules de drawGroundAgents : dans une même passe,
// l'agent le plus au SUD (plus grand y monde) doit être peint EN DERNIER (donc DEVANT). Avant
// le fix, tous les piétons étaient dessinés PUIS tous les véhicules (2 couches) → une voiture
// recouvrait toujours un piéton, même quand il était devant elle. Ici, on stimule le vrai code
// de rendu (repli vectoriel/procédural — aucune Image en environnement node) avec un ctx espion
// qui enregistre l'ordre : chaque piéton commence par une ombre `ellipse` en "rgba(0,0,0,0.22)",
// chaque véhicule procédural par un `save()`. La SÉQUENCE de ces marqueurs = l'ordre de dessin.

function makeRecCtx(log) {
  const ctx = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt",
    lineJoin: "miter", globalAlpha: 1, imageSmoothingEnabled: true,
    font: "10px sans", textAlign: "left", textBaseline: "alphabetic",
    canvas: { width: 800, height: 600 },
  };
  const noop = () => {};
  for (const m of [
    "beginPath", "moveTo", "lineTo", "arc", "closePath", "fill", "stroke",
    "restore", "translate", "rotate", "scale", "quadraticCurveTo", "arcTo", "rect",
    "roundRect", "strokeRect", "fillRect", "fillText", "drawImage", "setTransform", "clip",
  ]) ctx[m] = noop;
  const grad = { addColorStop: noop };
  ctx.createLinearGradient = () => grad;
  ctx.createRadialGradient = () => grad;
  // Marqueur PIÉTON : l'ombre au sol est la 1re primitive de drawOneCitizen (fillStyle 0.22).
  ctx.ellipse = () => { if (ctx.fillStyle === "rgba(0,0,0,0.22)") log.push("cit"); };
  // Marqueur VÉHICULE : le rendu procédural d'un véhicule ouvre par un save() (les piétons
  // n'appellent jamais save()).
  ctx.save = () => { log.push("veh"); };
  return ctx;
}

// Monte une scène minimale : 1 piéton + 1 véhicule à des y monde donnés, sans bâtiment
// (donc tout le monde dans la passe front=false). Renvoie le journal d'ordre de dessin.
function renderScene(citizenY, vehicleY) {
  const log = [];
  CM.ctx = makeRecCtx(log);
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.TILE = 20;
  CM.cw = 800; CM.ch = 600;
  CM.nightF = 0;
  CM.layout = { counts: { eraBand: 2, eraIndex: 5 } };
  CM.buildingCells = new Set();   // personne « devant » un bâtiment → passe unique
  CM.fountainCells = null;
  CM.plazaPropCells = null;
  CM.walkRoadList = [{ gx: 5, gy: 5 }];
  CM.walkRoadSet = { has: () => true };   // pas de remap
  CM.globalBubbleCooldown = 999;          // pas de spawn de bulle

  CM.citizens = [{
    gx: 5, gy: Math.round(citizenY / CM.TILE), x: 100, y: citizenY,
    tx: 100, ty: citizenY, pauseT: 999, speed: 10, phase: 0, dir: 2,
    charType: 0, skinVariant: 0, fade: 1, tox: 0, toy: 0,
    col: "#8a7a5a", skin: "#e0b890", hat: null,
    thoughtType: null, thoughtTimer: 0,
  }];
  CM.vehicles = [{
    type: "wagon", gx: 5, gy: Math.round(vehicleY / CM.TILE), x: 100, y: vehicleY,
    tx: 100, ty: vehicleY, dir: 2, col: "#8f6534", fade: 1,
    parkT: 1, parkSide: 1,   // garé → n'appelle pas vehicleLaneOffset (isolé du reste)
  }];

  drawGroundAgents(0.016, 0, false);
  return log.filter((e) => e === "cit" || e === "veh");
}

describe("drawGroundAgents — Y-sort piéton ↔ véhicule", () => {
  it("dessine le piéton APRÈS le véhicule quand il est au SUD (devant)", () => {
    // piéton y=200 (sud) sous un véhicule y=100 (nord) → le piéton doit passer DEVANT.
    expect(renderScene(200, 100)).toEqual(["veh", "cit"]);
  });

  it("dessine le piéton AVANT le véhicule quand il est au NORD (derrière)", () => {
    // piéton y=100 (nord) au-dessus d'un véhicule y=200 (sud) → le piéton est DERRIÈRE.
    expect(renderScene(100, 200)).toEqual(["cit", "veh"]);
  });

  it("l'ordre dépend bien du Y (pas d'une couche fixe piétons-puis-véhicules)", () => {
    // Si les deux configs donnaient le même ordre, ce serait l'ancien bug (couches empilées).
    const south = renderScene(200, 100);
    const north = renderScene(100, 200);
    expect(south).not.toEqual(north);
  });
});

// ctx qui compte les primitives (beginPath). Dans une scène DRONE SEUL, tout dessin = le drone.
function makeCountCtx() {
  const ctx = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt",
    globalAlpha: 1, imageSmoothingEnabled: true, globalCompositeOperation: "source-over",
    canvas: { width: 800, height: 600 }, _draws: 0,
  };
  const noop = () => {};
  for (const m of [
    "moveTo", "lineTo", "arc", "ellipse", "closePath", "fill", "stroke", "save",
    "restore", "translate", "rotate", "scale", "quadraticCurveTo", "arcTo", "rect",
    "roundRect", "strokeRect", "fillRect", "fillText", "drawImage", "setTransform", "clip",
  ]) ctx[m] = noop;
  ctx.beginPath = () => { ctx._draws += 1; };
  ctx.createRadialGradient = () => ({ addColorStop: noop });
  ctx.createLinearGradient = () => ({ addColorStop: noop });
  return ctx;
}

// Nombre de primitives dessinées pour un drone-seul dans une passe donnée (front=false/true).
function droneDraws(buildingKeys, gx, gy, front) {
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.TILE = 20; CM.cw = 800; CM.ch = 600; CM.nightF = 0;
  CM.layout = { counts: { eraBand: 6, eraIndex: 16 } };
  CM.buildingCells = new Set(buildingKeys);
  CM.fountainCells = null; CM.plazaPropCells = null;
  CM.walkRoadList = []; CM.walkRoadSet = { has: () => true };
  CM.citizens = [];
  CM.vehicles = [{ type: "drone", gx, gy, x: (gx + 0.5) * 20, y: (gy + 0.5) * 20, tx: (gx + 0.5) * 20, ty: (gy + 0.5) * 20, dir: 2, fade: 1 }];
  const ctx = makeCountCtx(); CM.ctx = ctx;
  drawGroundAgents(0.016, 0, front);
  return ctx._draws;
}

describe("drawGroundAgents — Y-sort des drones (occlusion par bâtiments)", () => {
  it("drone SANS bâtiment au nord : dessiné en 1re passe (derrière), pas en 2e", () => {
    expect(droneDraws([], 8, 8, false)).toBeGreaterThan(0);
    expect(droneDraws([], 8, 8, true)).toBe(0);
  });

  it("drone AVEC bâtiment au nord : dessiné en 2e passe (devant), pas en 1re", () => {
    // « devant » = passe 2, par-dessus le blit des bâtiments (comme piétons/voitures).
    expect(droneDraws(["8,7"], 8, 8, false)).toBe(0);
    expect(droneDraws(["8,7"], 8, 8, true)).toBeGreaterThan(0);
  });
});

// Nombre de faisceaux (dégradés radiaux) dessinés pour une voiture — isole les phares
// (drawVehicleHeadlights) : la carrosserie n'utilise pas de createRadialGradient.
function carHeadlightBeams(nightF, pauseT) {
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.TILE = 20; CM.cw = 800; CM.ch = 600; CM.nightF = nightF;
  CM.layout = { counts: { eraBand: 6, eraIndex: 16 } };   // ère motorisée (>=14)
  CM.buildingCells = new Set(); CM.fountainCells = null; CM.plazaPropCells = null;
  CM.walkRoadList = []; CM.walkRoadSet = { has: () => true }; CM.citizens = [];
  CM.vehicles = [{ type: "car", gx: 8, gy: 8, x: 170, y: 170, tx: 170, ty: 170, dir: 2, fade: 1, pauseT, parkT: 0 }];
  let beams = 0;
  const ctx = makeCountCtx();
  ctx.createRadialGradient = () => { beams += 1; return { addColorStop: () => {} }; };
  CM.ctx = ctx;
  drawGroundAgents(0.016, 0, false);   // pas de bâtiment nord → passe 1
  return beams;
}

describe("phares voiture dessinés à la profondeur du véhicule", () => {
  it("nuit + en mouvement → faisceau dessiné (chemin exécuté sans planter)", () => {
    expect(carHeadlightBeams(0.6, 0)).toBeGreaterThan(0);
  });
  it("de JOUR → pas de phares", () => {
    expect(carHeadlightBeams(0, 0)).toBe(0);
  });
  it("ARRÊTÉE la nuit → phares éteints", () => {
    expect(carHeadlightBeams(0.6, 999)).toBe(0);
  });
});
