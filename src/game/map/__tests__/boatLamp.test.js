import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM } from "../layout.js";
import { boatLampMul, boatLampFlicker, NAV_PORT_COL, NAV_STBD_COL } from "../iso/isoFleet.js";
import { BOAT_MODELS, fleetFor } from "../iso/boatKits.js";
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

// Qui en porte est une règle du MODÈLE du kit (`lights`, boatKits) : les feux sont
// des ancres de la coque. (Les relevés par stade et par face des anciens sprites —
// NAV_ANCHOR, NAV_UV, navLightOffsets, NAV_STAGES — et leurs tests sont partis avec
// eux, audit du 05/10, MORT-6.)
describe("feux de navigation — qui en porte", () => {
  it("jamais le pêcheur, à aucune ère", () => {
    // Il est à l'ancre, hors des règles de route.
    for (let band = 0; band <= 9; band += 1) {
      for (const id of fleetFor(band).fisher) expect(BOAT_MODELS[id].lights, `bande ${band} : ${id}`).toBeFalsy();
    }
  });

  it("ni le radeau, ni la pirogue des premières ères", () => {
    // Rien pour porter un feu, et à leur ère ça n'aurait aucun sens (Raph, 2026-07-29).
    for (const id of fleetFor(0).trade) expect(BOAT_MODELS[id].lights, id).toBeFalsy();
  });

  it("dès qu'il y a un mât ou une passerelle, le marchand de l'ère en porte", () => {
    for (let band = 3; band <= 9; band += 1) {
      expect(fleetFor(band).trade.some((id) => BOAT_MODELS[id].lights), `bande ${band}`).toBe(true);
    }
  });

  it("bâbord est rouge, tribord est vert", () => {
    const [rP, gP] = NAV_PORT_COL.split(",").map(Number);
    const [rS, gS] = NAV_STBD_COL.split(",").map(Number);
    expect(rP).toBeGreaterThan(gP);
    expect(gS).toBeGreaterThan(rS);
  });
});

describe("feux de navigation — placement (ancres du modèle)", () => {
  // Ancre = [avance, travers, hauteur] dans le repère du bateau, y vers le sud du
  // monde : un travers NÉGATIF est à la gauche du marin, donc bâbord. Les deux feux
  // encadrent l'axe à la même avance et la même hauteur — c'est ce qui donne le sens
  // de marche.
  const lit = Object.entries(BOAT_MODELS).filter(([, M]) => M.lights);
  it("chaque coque qui porte ses feux a bâbord à gauche, tribord à droite, face à face", () => {
    expect(lit.length).toBeGreaterThan(0);
    for (const [id, M] of lit) {
      const A = M.anchors({ variant: M.variant ? M.variant(1) : {}, state: "cruise", k: 0 });
      expect(A.port && A.stbd, `${id} : ancres port/stbd`).toBeTruthy();
      expect(A.port[1], `${id} : bâbord à gauche`).toBeLessThan(0);
      expect(A.stbd[1], `${id} : tribord à droite`).toBeGreaterThan(0);
      expect(A.port[0], `${id} : même avance`).toBe(A.stbd[0]);
      expect(A.port[2], `${id} : même hauteur`).toBe(A.stbd[2]);
    }
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

describe("feux de navigation — battement", () => {
  it("respire LENTEMENT et LÉGÈREMENT", () => {
    // « Les lumières des bateaux peuvent clignoter légèrement et lentement ? »
    // (Raph). Léger : un feu de position n'est pas un gyrophare. Lent : sinon ça
    // se lit comme une balise de danger.
    let min = Infinity, max = -Infinity;
    for (let t = 0; t < 30000; t += 25) {
      const v = boatLampFlicker(t, 0);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // Amplitude perceptible mais discrète : sous 5 % l'œil ne voit rien, au delà
    // de 45 % ça clignote.
    expect(max - min).toBeGreaterThan(0.08);
    expect(max - min).toBeLessThan(0.45);
    // Et ça ne s'éteint jamais complètement : un feu qui disparaît, c'est un
    // bateau qui disparaît.
    expect(min).toBeGreaterThan(0.5);
  });

  it("chaque bateau a SA phase", () => {
    // Sans phase par coque, toute la flotte respirerait à l'unisson — l'œil y
    // verrait un clignotant commun, pas des bateaux distincts.
    const t = 4321;
    const vals = [1, 2, 3, 4, 5].map((id) => boatLampFlicker(t, id * 0.7));
    expect(new Set(vals.map((v) => v.toFixed(4))).size).toBe(vals.length);
  });

  it("ne bat pas comme une horloge", () => {
    // Un sinus unique se reconnaît dès qu'on le regarde : deux périodes premières
    // entre elles évitent le battement métronomique.
    const P = 1160 * 2 * Math.PI;                 // période du premier sinus seul
    expect(Math.abs(boatLampFlicker(0, 0) - boatLampFlicker(P, 0))).toBeGreaterThan(1e-4);
  });
});

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
