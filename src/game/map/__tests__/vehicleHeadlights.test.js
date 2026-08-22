import { describe, it, expect, afterEach } from "vitest";

import { CM } from "../layout.js";
import { drawVehicleHeadlights } from "../agents.js";

// PHARES DES VÉHICULES (drawVehicleHeadlights, agents.js).
//
// Ce fichier est le PORTAGE des 3 `it` « phares » de groundSort.test.js, qui
// disparaît avec le rendu top-down (docs/PLAN-SUPPRESSION-LEGACY.md, étape 3 —
// décision Raph 2026-08-22 « on porte les 13 »). Ils y passaient par
// `drawGroundAgents`, fonction purement legacy ; ici on appelle la fonction
// PARTAGÉE directement — c'est aussi le chemin ISO, qui l'appelle SANS GARDE
// (isoRenderer.js). Cette couverture reste donc vivante après la coupe, et
// c'était la SEULE du dépôt à toucher cette fonction.
// ⚠ Le garde `CM.headlightDepth !== false` que mentionnait ce commentaire vivait
// dans `drawOneVehicle`, côté top-down : il est parti avec lui à l'étape 6, avec
// sa molette `__headlightDepth`. L'iso n'a jamais eu d'interrupteur ici.
//
// L'appel direct permet en prime de couvrir les gardes que l'ancien harnais ne
// pouvait pas isoler : les 3 `it` d'origine tournaient tous à l'ère 16, donc la
// garde d'ÈRE MOTORISÉE — pourtant nommée par le plan — n'était jamais exercée.
// Les quatre gardes du bloc d'entrée sont désormais couvertes une par une.
//
// ⚠ On ne touche PAS à `CM.iso` : le mode par défaut est le vrai mode du jeu, et
// le plan supprime ce drapeau à l'étape 7 — inutile d'ajouter un 10e fichier de
// test qui le pilote (cf. §0.2 du plan, l'inventaire du drapeau a déjà dérivé).

// Le faisceau est le SEUL dégradé radial de la fonction : la carrosserie n'en
// utilise pas, et on n'appelle plus le rendu du véhicule ici de toute façon.
// Compter les createRadialGradient = compter les faisceaux allumés.
function makeBeamCtx() {
  const ctx = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: "source-over", canvas: { width: 800, height: 600 },
    beams: 0,
  };
  const noop = () => {};
  for (const m of [
    "beginPath", "moveTo", "lineTo", "arc", "ellipse", "closePath", "fill", "stroke",
    "save", "restore", "translate", "rotate", "scale", "rect", "fillRect", "drawImage",
    "setTransform", "clip",
  ]) ctx[m] = noop;
  ctx.createLinearGradient = () => ({ addColorStop: noop });
  ctx.createRadialGradient = () => { ctx.beams += 1; return { addColorStop: noop }; };
  return ctx;
}

// Une voiture à l'arrêt de la grille mais EN MOUVEMENT (pauseT/parkT à 0), bien
// dans le champ. Chaque option écrase une seule condition à la fois.
function beams({ nightF = 0.6, eraIndex = 16, type = "car", pauseT = 0, parkT = 0 } = {}) {
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.TILE = 20; CM.cw = 800; CM.ch = 600;
  CM.nightF = nightF;
  CM.layout = { counts: { eraBand: 6, eraIndex } };
  const ctx = makeBeamCtx();
  const v = { type, gx: 8, gy: 8, x: 170, y: 170, tx: 170, ty: 170, dir: 2, fade: 1, pauseT, parkT };
  drawVehicleHeadlights(ctx, v);
  return ctx.beams;
}

afterEach(() => { CM.layout = null; CM.nightF = 0; });

describe("drawVehicleHeadlights — les quatre gardes d'allumage", () => {
  it("nuit + en mouvement → faisceau dessiné", () => {
    expect(beams()).toBeGreaterThan(0);
  });

  it("de JOUR → pas de phares", () => {
    expect(beams({ nightF: 0 })).toBe(0);
  });

  // Le seuil est `n <= 0.3` : le crépuscule ne suffit pas, il faut la vraie nuit.
  it("crépuscule (sous le seuil de 0.3) → pas encore de phares", () => {
    expect(beams({ nightF: 0.3 })).toBe(0);
    expect(beams({ nightF: 0.31 })).toBeGreaterThan(0);
  });

  // Garde nommée par le plan mais JAMAIS exercée par les 3 `it` d'origine, qui
  // tournaient tous à l'ère 16. Avant l'ère 14, rien n'a de phares à allumer.
  it("ère PRÉ-MOTORISÉE → pas de phares, même en pleine nuit", () => {
    expect(beams({ eraIndex: 13 })).toBe(0);
    expect(beams({ eraIndex: 14 })).toBeGreaterThan(0);
  });

  // MOTOR_TYPES : tout ce qui a un moteur s'allume, le reste non. Un chariot
  // tiré n'a pas de phares, même à l'ère motorisée.
  it("véhicule SANS MOTEUR (chariot) → pas de phares", () => {
    expect(beams({ type: "wagon" })).toBe(0);
    expect(beams({ type: "bus" })).toBeGreaterThan(0);
  });

  // La garde couvre DEUX champs ; les `it` d'origine n'en testaient qu'un.
  it("ARRÊTÉE ou GARÉE la nuit → phares éteints", () => {
    expect(beams({ pauseT: 999 })).toBe(0);
    expect(beams({ parkT: 1 })).toBe(0);
  });
});
