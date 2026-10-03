"use strict";
// Les veines de sève (sapPaths.js, généré par scripts/buildRuinsSap.mjs) :
// chaque nœud et chaque dogme en a une, elle part de son parent et ARRIVE à
// son médaillon, et toute lignée remonte au cœur de braise. Un nœud ajouté ou
// une ancre déplacée sans relancer le script fait échouer ce test.

import { describe, it, expect } from "vitest";
import { SAP_PATHS } from "../sapPaths.js";
import { TREE_ART, HUB_ANCHOR, NODE_ANCHORS, DOGMA_ANCHORS, sapParentMap } from "../anchors.js";

const anchors = { hub: HUB_ANCHOR, ...NODE_ANCHORS, ...DOGMA_ANCHORS };
const ids = [...Object.keys(NODE_ANCHORS), ...Object.keys(DOGMA_ANCHORS)];
// tolérance : le chemin s'accroche au bois le plus épais dans un carré de ±6 px autour de l'ancre
const NEAR = 6 * Math.SQRT2 + 0.01;

describe("Veines de sève", () => {
  it("couvre exactement les nœuds et dogmes ancrés", () => {
    expect(new Set(Object.keys(SAP_PATHS))).toEqual(new Set(ids));
  });

  it("suit la topologie d'anchors.js (parent déclaré)", () => {
    const parent = sapParentMap();
    for (const id of ids) expect(SAP_PATHS[id][0], id).toBe(parent[id]);
  });

  it("part du parent et arrive au médaillon, dans l'image", () => {
    for (const id of ids) {
      const [parent, flat] = SAP_PATHS[id];
      expect(flat.length % 2, id).toBe(0);
      expect(flat.length, id).toBeGreaterThan(2);
      for (let i = 0; i < flat.length; i += 2) {
        expect(flat[i] >= 0 && flat[i] < TREE_ART.w && flat[i + 1] >= 0 && flat[i + 1] < TREE_ART.h, id).toBe(true);
      }
      const end = { x: flat[flat.length - 2], y: flat[flat.length - 1] };
      expect(Math.hypot(end.x - anchors[id].x, end.y - anchors[id].y), `${id} (arrivée)`).toBeLessThanOrEqual(NEAR);
      const start = { x: flat[0], y: flat[1] };
      expect(Math.hypot(start.x - anchors[parent].x, start.y - anchors[parent].y), `${id} (départ)`).toBeLessThanOrEqual(NEAR);
    }
  });

  it("fait remonter chaque lignée jusqu'au cœur de braise", () => {
    for (const id of ids) {
      let k = id, hops = 0;
      while (k !== "hub" && hops < 20) { k = SAP_PATHS[k][0]; hops++; }
      expect(k, id).toBe("hub");
    }
  });
});
