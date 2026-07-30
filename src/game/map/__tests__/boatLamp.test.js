import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM } from "../layout.js";
import { boatLampMul, boatHasNavLights, navLightOffsets, navUvFor, setNavUv, shipVisual, NAV_STAGES, NAV_PORT_COL, NAV_STBD_COL } from "../iso/isoRenderer.js";
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
  it("ni le pêcheur, ni le radeau, ni la barque à rames", () => {
    // Le pêcheur est à l'ancre ; le radeau et la barque n'ont tout simplement
    // rien pour porter un feu, et à leur ère ça n'aurait aucun sens.
    for (const dark of ["fisher", "raft", "rowboat"]) {
      expect(boatHasNavLights(dark)).toBe(false);
    }
    // Tout ce qui a un pont ou un mât en porte.
    for (const lit of ["sail", "steam", "container", "cosmic", "dinghy", "motorboat"]) {
      expect(boatHasNavLights(lit)).toBe(true);
    }
  });

  it("la garde porte sur la COQUE, pas sur la pose du pêcheur", () => {
    // Le pêcheur a deux sprites (fisher / fisher-row) mais un seul stade. Si la
    // garde regardait la clé de sprite, il s'allumerait dès qu'il navigue —
    // exactement ce qu'on ne veut pas.
    expect(shipVisual("fisher", 4, 18, "anchor").stage).toBe("fisher");
    expect(shipVisual("fisher", 4, 18, "cruise").stage).toBe("fisher");
    expect(boatHasNavLights(shipVisual("fisher", 4, 18, "cruise").stage)).toBe(false);
  });

  it("la liste à calibrer et celle qui s'allume ne peuvent pas diverger", () => {
    // Deux listes à tenir séparément auraient fini par se contredire — le seuil
    // du vapeur avait déjà pris cette pente, recopié à trois endroits. Ici le
    // calibreur reçoit NAV_STAGES ; ce test vérifie que tout ce qu'on y calibre
    // s'allume pour de vrai.
    expect(NAV_STAGES.length).toBeGreaterThan(0);
    for (const s of NAV_STAGES) expect(boatHasNavLights(s)).toBe(true);
  });

  it("bâbord est rouge, tribord est vert", () => {
    const [rP, gP] = NAV_PORT_COL.split(",").map(Number);
    const [rS, gS] = NAV_STBD_COL.split(",").map(Number);
    expect(rP).toBeGreaterThan(gP);
    expect(gS).toBeGreaterThan(rS);
  });
});

describe("feux de navigation — placement", () => {
  const PLAT = { mast: 0, beam: 1, foreP: 0, foreS: 0 };

  it("les deux feux encadrent l'axe, perpendiculairement au cap", () => {
    for (const heading of [0, 0.7, Math.PI / 2, 2.4, -1.1]) {
      const { port, stbd } = navLightOffsets(heading, 10, PLAT);
      // Opposés l'un à l'autre (même avance, écartement symétrique).
      expect(port.x).toBeCloseTo(-stbd.x, 6);
      expect(port.y).toBeCloseTo(-stbd.y, 6);
      // Perpendiculaires au cap : produit scalaire nul avec le vecteur d'avance.
      const dot = port.x * Math.cos(heading) + port.y * Math.sin(heading);
      expect(Math.abs(dot)).toBeLessThan(1e-9);
      expect(Math.hypot(port.x, port.y)).toBeCloseTo(10, 6);
    }
  });

  it("bâbord est bien à GAUCHE du sens de marche", () => {
    // Cap vers la droite de l'écran (est) : la gauche du marin est vers le HAUT
    // de l'écran, donc y négatif.
    const { port, stbd } = navLightOffsets(0, 10, PLAT);
    expect(port.y).toBeLessThan(0);
    expect(stbd.y).toBeGreaterThan(0);
  });

  it("chaque feu a sa propre AVANCE, qui suit le cap", () => {
    // La régression qui a motivé les deux `fore` : sans eux, les feux étaient
    // cloués sur l'axe central et un clic à gauche ou à droite du sprite ne
    // changeait rien du tout.
    const an = { mast: 0, beam: 0, foreP: 1, foreS: -1 };
    const est = navLightOffsets(0, 10, an);
    expect(est.port.x).toBeCloseTo(10, 6);    // bâbord à la proue
    expect(est.stbd.x).toBeCloseTo(-10, 6);   // tribord à la poupe
    // Cap au sud (écran, y vers le bas) : l'avance devient verticale.
    const sud = navLightOffsets(Math.PI / 2, 10, an);
    expect(sud.port.y).toBeCloseTo(10, 6);
    expect(sud.stbd.y).toBeCloseTo(-10, 6);
  });

  it("l'ÉLÉVATION reste verticale quand le bateau vire", () => {
    // Un mât ne se couche pas dans un virage : `mast` est le seul terme qui ne
    // tourne pas avec le cap.
    const an = { mast: 1, beam: 0, foreP: 0, foreS: 0 };
    for (const heading of [0, 1.2, Math.PI, -2.0]) {
      const { port } = navLightOffsets(heading, 10, an);
      expect(port.x).toBeCloseTo(0, 6);
      expect(port.y).toBeCloseTo(-10, 6);
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

describe("feux de navigation — position par face", () => {
  const poses = [];
  const pose = (st, se, o) => { poses.push([st, se]); setNavUv(st, se, o); };
  afterEach(() => { for (const [st, se] of poses.splice(0)) setNavUv(st, se, null); });

  it("une face calibrée prime sur la projection du profil", () => {
    // Les 8 vues d'un bateau ne sont pas la rotation rigide d'un même objet :
    // PixelLab les redessine, le mât se déplace, la coque change de longueur
    // apparente. Projeter le profil sur les 7 autres est donc une APPROXIMATION,
    // et une face relevée doit toujours l'emporter.
    expect(navUvFor("steam", "north")).toBe(null);
    pose("steam", "north", { p: [0.4, 0.3], s: [0.6, 0.35] });
    expect(navUvFor("steam", "north")).toEqual({ p: [0.4, 0.3], s: [0.6, 0.35] });
    // Les autres faces du même bateau restent sur le repli.
    expect(navUvFor("steam", "south")).toBe(null);
  });

  it("les 8 faces sont indépendantes", () => {
    pose("sail", "east", { p: [0.1, 0.1], s: [0.2, 0.2] });
    pose("sail", "west", { p: [0.8, 0.1], s: [0.9, 0.2] });
    expect(navUvFor("sail", "east").p[0]).not.toBe(navUvFor("sail", "west").p[0]);
    expect(navUvFor("sail", "northeast")).toBe(null);
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
