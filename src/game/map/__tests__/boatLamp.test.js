import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM } from "../layout.js";
import { boatLampCol, boatLampMul } from "../iso/isoRenderer.js";
import { queueFlameGlow, paintFlameGlows, FLAME_GLOW } from "../flameGlow.js";

// Aucun bateau ne lisait nightF : la nuit tombée, le fleuve restait un ruban
// mort pendant que la rive s'allumait. Chaque coque porte désormais un fanal.
//
// Deux règles à tenir, et une seule est évidente :
//   1. la teinte DATE la scène (huile → pétrole → halogène → feu froid) ;
//   2. le fanal est ÉTEINT le jour. Ce n'est pas gratuit : flameGlowAlpha a un
//      plancher de jour délibéré (FLAME_GLOW.day = 0,16) pour que les feux de
//      forge brûlent aussi à midi. Un fanal qui hériterait de ce plancher
//      brillerait en plein soleil. C'est pourquoi le site d'appel module son
//      `mul` par nightF — et c'est ce que ce test surveille.

// Compte les lueurs réellement peintes par un appel, via un ctx factice. On
// passe par paintFlameGlows (et non par la couche armée) pour rester sur le
// chemin testable, sans canvas.
function countGlows(mul) {
  let painted = 0;
  const ctx = {
    globalCompositeOperation: "source-over", globalAlpha: 1,
    save() {}, restore() {}, drawImage() { painted += 1; },
    createRadialGradient() { return { addColorStop() {} }; },
    beginPath() {}, arc() {}, fill() {}, fillRect() {},
    set fillStyle(_v) {}, get fillStyle() { return ""; },
  };
  queueFlameGlow(100, 100, 12, "255,172,72", 0, 0, mul);
  return { painted, drained: paintFlameGlows(ctx) };
}

describe("fanal de bateau — la teinte date la scène", () => {
  it("passe de la flamme d'huile au feu froid", () => {
    const huile = boatLampCol(2);
    const petrole = boatLampCol(5);
    const halogene = boatLampCol(6);
    const froid = boatLampCol(8);
    expect(new Set([huile, petrole, halogene, froid]).size).toBe(4);
    // L'ancien monde est chaud (rouge > bleu), le nouveau est froid.
    const [rH, , bH] = huile.split(",").map(Number);
    const [rF, , bF] = froid.split(",").map(Number);
    expect(rH).toBeGreaterThan(bH);
    expect(bF).toBeGreaterThan(rF);
  });
});

describe("fanal de bateau — éteint le jour", () => {
  const saved = { ...FLAME_GLOW };
  beforeEach(() => { CM.nightF = 0; });
  afterEach(() => { Object.assign(FLAME_GLOW, saved); CM.nightF = 0; });

  it("le plancher de jour des flammes ne doit PAS allumer un feu de position", () => {
    // CONTRÔLE NÉGATIF : un poids constant (ce qu'on aurait écrit sans y penser)
    // hérite du plancher de jour et PEINT quand même. C'est le comportement
    // voulu d'une forge, et exactement le piège pour un fanal.
    expect(FLAME_GLOW.day).toBeGreaterThan(0);
    expect(countGlows(2.6).drained).toBeGreaterThan(0);

    // Le vrai poids, lui, vient de boatLampMul — et il est nul en plein jour.
    expect(boatLampMul(CM.nightF, 1)).toBe(0);
    expect(countGlows(boatLampMul(CM.nightF, 1)).drained).toBe(0);
  });

  it("s'allume quand la nuit tombe, et monte avec elle", () => {
    CM.nightF = 0.9;
    expect(boatLampMul(CM.nightF, 1)).toBeGreaterThan(0);
    expect(countGlows(boatLampMul(CM.nightF, 1)).drained).toBeGreaterThan(0);
    // Le crépuscule éclaire moins que le cœur de la nuit.
    expect(boatLampMul(0.3, 1)).toBeLessThan(boatLampMul(0.9, 1));
  });
});
