// FRONT DE RUE (lot L3 de docs/PLAN-TISSU-URBAIN.md) : le bâtiment cesse de
// flotter au milieu de son lot et se pousse vers la rue qu'il dessert.
//
// Deux propriétés à verrouiller, et elles n'ont rien d'évident :
//   • le poussé est BORNÉ par la largeur de la chaussée d'en face. L'ancre du
//     sprite est son point le plus au sud ; la chaussée de la cellule voisine
//     commence à `0,5 − demi-largeur` de son centre. Un poussé fixe qui va bien
//     contre une rue (0,25) plante le bâtiment DANS un boulevard (0,36). Cette
//     borne se calcule — un réglage à l'œil se serait vu deux ères plus tard.
//   • la façade doit être LA MÊME pour le sprite et pour son allée de seuil.
//     Elle vivait dans la boucle de dessin des allées ; elle est maintenant
//     partagée, et ce fichier est ce qui empêche qu'elles se remettent à diverger.
import { describe, it, expect } from "vitest";
import { isoBuildingFront, isoFrontOffset, FRONT, ROW_SETBACK } from "../iso/isoGroundDetail.js";
// La GÉOMÉTRIE de rue est partie dans isoRoad.js le 2026-08-23 : que de la config,
// aucune ligne de dessin. Le front de rue, lui, est resté avec le peintre.
import { ISO_ROAD_HALFW, SIDEWALK_ISO } from "../iso/isoRoad.js";

const carte = (cells) => {
  const m = new Map();
  for (const [k, v] of Object.entries(cells)) m.set(k, { rank: "secondary", ...v });
  return m;
};
// Les tuiles portent un cache `_front` : chaque cas veut une tuile neuve.
const tuile = (gx, gy, spanX = 1, spanY = 1) => ({ gx, gy, spanX, spanY, type: "house" });

describe("façade sur rue", () => {
  it("préfère le SUD, la face que la caméra voit", () => {
    // Rue au sud ET au nord : la porte des sprites regarde la caméra.
    const f = isoBuildingFront(tuile(5, 5), carte({ "5,6": {}, "5,4": {} }));
    expect([f.dx, f.dy]).toEqual([0, 1]);
  });

  it("puis l'est, puis l'ouest, puis le nord", () => {
    expect(isoBuildingFront(tuile(5, 5), carte({ "6,5": {}, "4,5": {}, "5,4": {} })).dx).toBe(1);
    expect(isoBuildingFront(tuile(5, 5), carte({ "4,5": {}, "5,4": {} })).dx).toBe(-1);
    expect(isoBuildingFront(tuile(5, 5), carte({ "5,4": {} })).dy).toBe(-1);
  });

  it("ouvre au MILIEU de la façade, pas sur un coin", () => {
    // Halle de trois cellules bordée sur toute sa longueur : la porte est centrée.
    const f = isoBuildingFront(tuile(4, 5, 3, 1), carte({ "4,6": {}, "5,6": {}, "6,6": {} }));
    expect(f.hx).toBe(5);
  });

  it("ignore un pont et une place : ni seuil dans l'eau, ni seuil sur du dallage", () => {
    expect(isoBuildingFront(tuile(5, 5), carte({ "5,6": { roadSurface: "bridge" } }))).toBe(null);
    expect(isoBuildingFront(tuile(5, 5), carte({ "5,6": { rank: "plaza" } }))).toBe(null);
    // …mais la face suivante reste éligible.
    const f = isoBuildingFront(tuile(5, 5), carte({ "5,6": { rank: "plaza" }, "6,5": {} }));
    expect(f.dx).toBe(1);
  });

  it("un bâtiment sans aucune rue ne se pousse nulle part", () => {
    const t = tuile(5, 5);
    expect(isoBuildingFront(t, carte({}))).toBe(null);
    expect(isoFrontOffset(t, carte({}))).toBe(null);
  });
});

describe("poussé vers la rue", () => {
  it("pousse dans le sens de la façade, jamais ailleurs", () => {
    const o = isoFrontOffset(tuile(5, 5), carte({ "5,6": {} }));
    expect(o.oy).toBeGreaterThan(0);
    expect(o.ox).toBe(0);
    const e = isoFrontOffset(tuile(5, 5), carte({ "6,5": {} }));
    expect(e.ox).toBeGreaterThan(0);
    expect(e.oy).toBe(0);
  });

  // ⚠ LE point du fichier.
  it("mord : le poussé est RABOTÉ devant un boulevard, pas devant une rue", () => {
    const cfg = { on: true, push: 0.14, gap: 0.06 };
    const rue = isoFrontOffset(tuile(5, 5), carte({ "5,6": { rank: "secondary" } }), cfg);
    const bd = isoFrontOffset(tuile(5, 5), carte({ "5,6": { rank: "main" } }), cfg);
    expect(rue.oy).toBeCloseTo(0.14, 6);                       // place de reste : rabotage inutile
    expect(bd.oy).toBeCloseTo(0.5 - ISO_ROAD_HALFW.main - 0.06, 6);
    expect(bd.oy).toBeLessThan(rue.oy);                        // le boulevard mange la marge
  });

  it("l'ancre reste HORS de la chaussée d'en face, quel que soit le rang", () => {
    // La propriété qui compte vraiment : ancre du sprite + poussé ne doit jamais
    // atteindre le bord de la chaussée voisine. Vérifiée sur les quatre rangs,
    // avec un réglage volontairement trop gourmand pour éprouver la borne.
    const cfg = { on: true, push: 0.45, gap: 0.06 };
    for (const rank of Object.keys(ISO_ROAD_HALFW)) {
      const o = isoFrontOffset(tuile(5, 5), carte({ "5,6": { rank } }), cfg);
      const bordChaussee = 1 + 0.5 - ISO_ROAD_HALFW[rank];     // depuis le coin sud du lot
      expect(o.oy, rank).toBeLessThanOrEqual(bordChaussee - 0.06 + 1e-9);
    }
  });

  it("l'échappatoire recentre vraiment les bâtiments", () => {
    expect(isoFrontOffset(tuile(5, 5), carte({ "5,6": {} }), { on: false, push: 0.14, gap: 0.06 })).toBe(null);
    expect(isoFrontOffset(tuile(5, 5), carte({ "5,6": {} }), { on: true, push: 0, gap: 0.06 })).toBe(null);
  });

  it("les réglages livrés sont ceux qu'on croit", () => {
    expect(FRONT.on).toBe(true);
    expect(FRONT.push).toBe(0.19);
    expect(FRONT.gap).toBe(0.06);
    // …et le réglage livré tient face au rang le plus large sans être annulé.
    expect(0.5 - ISO_ROAD_HALFW.main - FRONT.gap).toBeGreaterThan(0);
  });

  it("le poussé livré est RÉELLEMENT appliqué devant une rue ordinaire", () => {
    // ⚠ Sans ce contrôle, monter le réglage pourrait ne rien faire du tout : le
    // rabotage rendrait la même valeur et personne ne le verrait, ni à l'écran
    // (2 px) ni dans les autres gardes, qui vérifient toutes la BORNE et jamais
    // que la valeur choisie passe. `secondary` est le rang le plus courant du
    // réseau, c'est lui qui décide de ce qu'on voit.
    const o = isoFrontOffset(tuile(5, 5), carte({ "5,6": { rank: "secondary" } }));
    expect(o.oy).toBeCloseTo(FRONT.push, 6);
    // …et il consomme exactement la place disponible : au-delà, plus rien ne bouge.
    const trop = isoFrontOffset(tuile(5, 5), carte({ "5,6": { rank: "secondary" } }),
      { ...FRONT, push: FRONT.push + 0.1 });
    expect(trop.oy).toBeCloseTo(o.oy, 6);
  });
});

// RECUL DES RANGÉES (Raph 2026-10-04 : « il n'y a plus de trottoir, donc les gens et
// les objets apparaissent sur les bâtiments ») : une rangée remplit son lot, sa
// façade tombe au bord de la rue — là où marchent les passants devant une avenue.
describe("recul des rangées", () => {
  const rangee = (gx, gy, face = "S") => ({ ...tuile(gx, gy), terrace: 1, row: 1, face });
  // Bord extérieur de la bande des passants et du mobilier, depuis l'axe de la rue
  // (mêmes termes que isoStreet : outerOf = demi-chaussée + SIDEWALK_ISO.w).
  const bande = (rank) => ISO_ROAD_HALFW[rank] + SIDEWALK_ISO.w;

  it("la façade d'une rangée laisse du sol entre le trottoir et le mur, quel que soit le rang", () => {
    for (const rank of Object.keys(ISO_ROAD_HALFW)) {
      const o = isoFrontOffset(rangee(5, 5), carte({ "5,6": { rank } }));
      const facade = 0.5 - (o ? o.oy : 0);                 // distance axe de rue → façade
      expect(facade - bande(rank), rank).toBeGreaterThanOrEqual(ROW_SETBACK.margin - 1e-9);
      if (o) expect(o.ox).toBe(0);
    }
  });

  it("recule DEPUIS la rue (vers l'intérieur de l'îlot), jamais vers elle", () => {
    const s = isoFrontOffset(rangee(5, 5), carte({ "5,6": { rank: "main" } }));
    expect(s.oy).toBeLessThan(0);
    const e = isoFrontOffset(rangee(5, 5, "E"), carte({ "6,5": { rank: "main" } }));
    expect(e.ox).toBeLessThan(0);
    expect(e.oy).toBe(0);
  });

  it("une unité d'angle recule des deux rues côté caméra ; derrière, rien ne bouge", () => {
    const c = isoFrontOffset(rangee(5, 5), carte({ "5,6": { rank: "main" }, "6,5": { rank: "avenue" } }));
    expect(c.oy).toBeLessThan(0);
    expect(c.ox).toBeLessThan(0);
    // Rues au nord et à l'ouest : façade cachée, le bâtiment couvre son trottoir.
    expect(isoFrontOffset(rangee(5, 5, "N"), carte({ "5,4": { rank: "main" }, "4,5": { rank: "main" } }))).toBe(null);
  });

  it("toute une rangée recule d'autant : les toits restent alignés", () => {
    const m = carte({ "4,6": { rank: "avenue" }, "5,6": { rank: "avenue" }, "6,6": { rank: "avenue" } });
    const ys = [4, 5, 6].map((gx) => isoFrontOffset(rangee(gx, 5), m).oy);
    expect(new Set(ys).size).toBe(1);
  });

  it("une maison ordinaire garde son poussé vers la rue", () => {
    expect(isoFrontOffset(tuile(5, 5), carte({ "5,6": { rank: "main" } })).oy).toBeGreaterThan(0);
  });
});
