import { describe, it, expect } from "vitest";

import { ISO_ROAD_HALFW, isoRoadHalfW } from "../iso/isoRenderer.js";
import { CM } from "../layout.js";

// Hiérarchie des largeurs de chaussée iso (Raph 2026-07-28 : « des petits
// chemins et des grandes routes — là tout fait la même largeur ») : le RANG
// (path/secondary/avenue/main) pilote la demi-largeur du ruban, et la géométrie
// publiée aux agents suit. Ces gardes verrouillent la monotonie, la compat des
// scalaires historiques et la cohérence renderer ↔ agents.

describe("hiérarchie iso des largeurs de chaussée", () => {
  it("les rangs s'élargissent strictement : sentier < rue < avenue < boulevard", () => {
    const { path, secondary, avenue, main } = ISO_ROAD_HALFW;
    expect(path).toBeLessThan(secondary);
    expect(secondary).toBeLessThan(avenue);
    expect(avenue).toBeLessThan(main);
  });

  it("compat : `secondary` = l'ancienne largeur unique (0.25), base des scalaires agents", () => {
    expect(ISO_ROAD_HALFW.secondary).toBe(0.25);
    expect(CM.isoVehLane).toBe(0.25 / 2);
  });

  it("budget géométrique : trottoir compris, personne ne déborde au-delà d'une marge de dalle", () => {
    // SIDEWALK_ISO.w = 0.22 + joint 0.02 : path/secondary tiennent dans la ½
    // tuile ; avenue/main peuvent mordre la cellule voisine mais jamais plus de
    // 0.1 tuile (le débord est couvert par la voie jumelle ou la marge d'herbe).
    for (const [rank, w] of Object.entries(ISO_ROAD_HALFW)) {
      const out = w + 0.22 + 0.02;
      expect(out, `${rank} déborde trop`).toBeLessThanOrEqual(0.6);
    }
    expect(ISO_ROAD_HALFW.path + 0.24).toBeLessThanOrEqual(0.5);
    expect(ISO_ROAD_HALFW.secondary + 0.24).toBeLessThanOrEqual(0.5);
    // Lampadaires : mât à 0.05 du bord de cellule → hors chaussée tant que la
    // demi-largeur reste ≤ 0.45 (LAMP_TUNE.curb, computeIsoLamps).
    expect(ISO_ROAD_HALFW.main).toBeLessThanOrEqual(0.45 - 0.05);
  });

  it("repli : rang inconnu ou absent → largeur historique", () => {
    expect(isoRoadHalfW(undefined)).toBe(0.25);
    expect(isoRoadHalfW("plaza")).toBe(0.25);
    expect(isoRoadHalfW("path")).toBe(ISO_ROAD_HALFW.path);
  });

  it("géométrie publiée aux agents : tables par rang cohérentes avec les scalaires", () => {
    expect(CM.isoVehLaneByRank).toBeTruthy();
    expect(CM.isoPedEdgeByRank).toBeTruthy();
    expect(CM.isoPedEdgeLowByRank).toBeTruthy();
    for (const [rank, w] of Object.entries(ISO_ROAD_HALFW)) {
      expect(CM.isoVehLaneByRank[rank], `voie ${rank}`).toBe(w / 2);
      expect(CM.isoPedEdgeLowByRank[rank], `accotement ${rank}`).toBeCloseTo(w + 0.09, 10);
    }
    // Le rang de référence reproduit EXACTEMENT les scalaires historiques : un
    // agent sur une rue `secondary` marche là où il a toujours marché.
    expect(CM.isoVehLaneByRank.secondary).toBe(CM.isoVehLane);
    expect(CM.isoPedEdgeByRank.secondary).toBeCloseTo(CM.isoPedEdge, 10);
    expect(CM.isoPedEdgeLowByRank.secondary).toBeCloseTo(CM.isoPedEdgeLow, 10);
  });
});
