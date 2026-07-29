import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM } from "../layout.js";
import { boatLampMul, boatHasNavLights, navLightOffsets, NAV_PORT_COL, NAV_STBD_COL } from "../iso/isoRenderer.js";
import { queueFlameGlow, paintFlameGlows, FLAME_GLOW } from "../flameGlow.js";

// Aucun bateau ne lisait nightF : la nuit tombée, le fleuve restait un ruban
// mort pendant que la rive s'allumait.
//
// La première version posait un fanal ambre avec halo et reflet — rejetée par
// Raph au profit du vrai : DEUX feux de position en haut du mât, rouge à bâbord
// et vert à tribord, sans halo, discrets. Trois règles à tenir :
//   1. le PÊCHEUR n'en porte aucun (il est à l'ancre, hors règles de route) ;
//   2. les deux feux sont de part et d'autre, perpendiculaires au cap — c'est ce
//      qui donne le sens de marche ;
//   3. tout est ÉTEINT le jour. Pas gratuit : flameGlowAlpha porte un plancher
//      de jour DÉLIBÉRÉ (FLAME_GLOW.day) pour qu'une forge brûle aussi à midi,
//      et la v1 en héritait.

describe("feux de navigation — qui en porte", () => {
  it("le pêcheur reste noir sur l'eau", () => {
    expect(boatHasNavLights("fisher")).toBe(false);
    expect(boatHasNavLights("trade")).toBe(true);
    expect(boatHasNavLights("yacht")).toBe(true);
  });

  it("bâbord est rouge, tribord est vert", () => {
    const [rP, gP] = NAV_PORT_COL.split(",").map(Number);
    const [rS, gS] = NAV_STBD_COL.split(",").map(Number);
    expect(rP).toBeGreaterThan(gP);
    expect(gS).toBeGreaterThan(rS);
  });
});

describe("feux de navigation — placement", () => {
  it("les deux feux encadrent le mât, perpendiculairement au cap", () => {
    for (const heading of [0, 0.7, Math.PI / 2, 2.4, -1.1]) {
      const { port, stbd } = navLightOffsets(heading, 10);
      // Opposés l'un à l'autre.
      expect(port.x).toBeCloseTo(-stbd.x, 6);
      expect(port.y).toBeCloseTo(-stbd.y, 6);
      // Perpendiculaires au cap : produit scalaire nul avec le vecteur d'avance.
      const dot = port.x * Math.cos(heading) + port.y * Math.sin(heading);
      expect(Math.abs(dot)).toBeLessThan(1e-9);
      // Et à la bonne distance.
      expect(Math.hypot(port.x, port.y)).toBeCloseTo(10, 6);
    }
  });

  it("bâbord est bien à GAUCHE du sens de marche", () => {
    // Cap vers la droite de l'écran (est) : la gauche du marin est vers le HAUT
    // de l'écran, donc y négatif.
    const { port, stbd } = navLightOffsets(0, 10);
    expect(port.y).toBeLessThan(0);
    expect(stbd.y).toBeGreaterThan(0);
  });
});

// Compte les lueurs réellement peintes, via un ctx factice.
function countGlows(mul) {
  const ctx = {
    globalCompositeOperation: "source-over", globalAlpha: 1,
    save() {}, restore() {}, drawImage() {},
    createRadialGradient() { return { addColorStop() {} }; },
    beginPath() {}, arc() {}, fill() {}, fillRect() {},
    set fillStyle(_v) {}, get fillStyle() { return ""; },
  };
  queueFlameGlow(100, 100, 12, "255,172,72", 0, 0, mul);
  return paintFlameGlows(ctx);
}

describe("feux de navigation — éteints le jour", () => {
  const saved = { ...FLAME_GLOW };
  beforeEach(() => { CM.nightF = 0; });
  afterEach(() => { Object.assign(FLAME_GLOW, saved); CM.nightF = 0; });

  it("le plancher de jour des flammes ne doit PAS allumer un feu de position", () => {
    // CONTRÔLE NÉGATIF : un poids constant (ce qu'on écrit sans y penser) hérite
    // du plancher de jour et peint quand même. Voulu pour une forge, piège ici.
    expect(FLAME_GLOW.day).toBeGreaterThan(0);
    expect(countGlows(0.62)).toBeGreaterThan(0);

    // Le vrai poids vient de boatLampMul, et il est nul en plein jour.
    expect(boatLampMul(CM.nightF, 1)).toBe(0);
    expect(countGlows(boatLampMul(CM.nightF, 1))).toBe(0);
  });

  it("s'allume avec la nuit, sans jamais éclairer comme un fanal", () => {
    expect(boatLampMul(0.3, 1)).toBeLessThan(boatLampMul(0.9, 1));
    expect(boatLampMul(0.9, 1)).toBeGreaterThan(0);
    // Un feu de position BALISE, il n'éclaire pas : même au cœur de la nuit il
    // reste bien en dessous du poids d'un vrai foyer (la v1 était à 2,6).
    expect(boatLampMul(1, 1)).toBeLessThan(1);
  });
});
