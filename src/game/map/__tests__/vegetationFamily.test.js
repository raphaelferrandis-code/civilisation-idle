// LA FAMILLE D'ARBRES (docs/PLAN-VEGETATION.md, lot 1) : la table du moteur
// (TREE_SPRITES), le manifeste de pose (scripts/data/vegetation-trees.json) et les
// PNG livrés doivent dire la même chose. Tout se MESURE sur les fichiers.
//
// Les trois promesses qui tiennent l'image :
//  - le GRAIN : la taille de dessin d'un arbre vient de son canevas (treeSpriteK =
//    px / 96) ; un `px` faux dans la table étirerait l'arbre hors de la grille des
//    habitations — d'où la vérification de la taille RÉELLE de chaque PNG ;
//  - le PIED à 0,92 du canevas et au milieu : c'est l'ancre de tous les arbres de la
//    carte (ombre solaire, tri peintre, margelle des places) ;
//  - la PALETTE : 24 teintes au plus, comme le reste de l'art du jeu.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import {
  TREE_SPRITES, ISO_TREE_VARIANTS, TREE_DEAD_VARIANT, TREE_LIVING, CITY_TREES, cityTreeVariant, treeSpriteK,
} from "../iso/isoGroundProps.js";

const DIR = new URL("../../../../public/pixelart/iso/", import.meta.url);
const MANIFEST = JSON.parse(fs.readFileSync(new URL("../../../../scripts/data/vegetation-trees.json", import.meta.url), "utf8"));
const read = (name) => PNG.sync.read(fs.readFileSync(new URL(name + ".png", DIR)));

describe("famille d'arbres : table, manifeste et PNG", () => {
  it("le manifeste et la table nomment les mêmes arbres (tree-4, le sapin mort, hors manifeste)", () => {
    const table = TREE_SPRITES.filter(Boolean).map((t) => t.name).filter((n) => n !== "tree-4").sort();
    expect(MANIFEST.trees.map((t) => t.name).sort()).toEqual(table);
    expect(TREE_SPRITES[TREE_DEAD_VARIANT].sp).toBe("mort");
    expect(ISO_TREE_VARIANTS).toBe(TREE_SPRITES.length - 1);
  });

  it("la famille compte au moins 12 arbres vivants et 4 essences à 3 âges", () => {
    expect(TREE_LIVING.length).toBeGreaterThanOrEqual(12);
    for (const sp of ["chene", "bouleau", "sapin", "pin"]) {
      const ages = new Set(TREE_SPRITES.filter((t) => t && t.sp === sp).map((t) => t.age));
      expect([...ages].sort(), sp).toEqual([0, 1, 2]);
    }
  });

  for (let v = 1; v <= ISO_TREE_VARIANTS; v += 1) {
    const t = TREE_SPRITES[v];
    it(`${t.name} : canevas de ${t.px} px (été et hiver), pied à 0,92 et au milieu, ≤ 24 teintes`, () => {
      const a = read(t.name), w = read(t.name + "-winter");
      expect([a.width, a.height]).toEqual([t.px, t.px]);
      expect([w.width, w.height]).toEqual([t.px, t.px]);
      expect(treeSpriteK(v)).toBeCloseTo(t.px / 96, 9);
      if (t.sp === "mort") return;                       // tree-4 : l'ancien dessin, intouché
      let y1 = -1;
      const cols = new Set();
      for (let y = 0; y < a.height; y += 1) for (let x = 0; x < a.width; x += 1) {
        const i = (y * a.width + x) * 4;
        if (a.data[i + 3] < 128) continue;
        if (y > y1) y1 = y;
        cols.add((a.data[i] << 16) | (a.data[i + 1] << 8) | a.data[i + 2]);
      }
      expect(y1).toBe(Math.round(t.px * 0.92));
      let sx = 0, n = 0;
      for (let y = y1 - 3; y <= y1; y += 1) for (let x = 0; x < a.width; x += 1) {
        if (a.data[(y * a.width + x) * 4 + 3] >= 128) { sx += x; n += 1; }
      }
      expect(Math.abs(sx / n - t.px / 2)).toBeLessThanOrEqual(1.5);
      expect(cols.size).toBeLessThanOrEqual(24);
    });
  }
});

describe("arbres de ville par ère (lot 6)", () => {
  it("chaque bande plante les essences de son époque, dans ses proportions", () => {
    for (let band = 2; band < CITY_TREES.length; band += 1) {
      const mix = CITY_TREES[band], tot = mix.reduce((a, [, w]) => a + w, 0);
      const n = {};
      for (let y = 0; y < 60; y += 1) for (let x = 0; x < 60; x += 1) {
        const t = TREE_SPRITES[cityTreeVariant(x, y, band)];
        expect(t.age, `bande ${band}`).toBe(1);                       // des adultes seulement
        n[t.sp] = (n[t.sp] || 0) + 1;
      }
      for (const [sp, w] of mix) expect(Math.abs(n[sp] / 3600 - w / tot), `bande ${band} ${sp}`).toBeLessThan(0.05);
      expect(Object.keys(n).sort()).toEqual(mix.map(([sp]) => sp).sort());
    }
  });

  it("les essences de ville ne poussent pas en forêt", () => {
    for (const v of TREE_LIVING) expect(["chene", "bouleau", "sapin", "pin"]).toContain(TREE_SPRITES[v].sp);
  });
});
