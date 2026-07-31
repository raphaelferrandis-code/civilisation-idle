// Les sprites d'hiver de la végétation iso sont DÉRIVÉS de ceux d'été
// (scripts/snowTrees.mjs) — ce test lit les deux jeux de PNG et vérifie que la
// dérivation a tenu ses trois promesses. Aucune constante recopiée : tout se
// mesure sur les fichiers livrés.
//
// Pourquoi la SILHOUETTE est le point dur. `treeFootMetrics` (isoPlaza) mesure
// le pied de CHAQUE variante sur le sprite d'ÉTÉ — centre à 0,474-0,521 du
// canvas, largeur 0,135-0,240 — et la margelle des places est centrée dessus.
// Le moteur, lui, blitte le sprite d'hiver en hiver. Un pixel d'alpha qui bouge
// et les deux ne parlent plus du même arbre : margelle décentrée, ombre décalée,
// et le masque d'occultation des halos (lightCutImage) découpe à côté. C'est
// exactement ce qu'une génération PixelLab aurait cassé, et la raison pour
// laquelle l'hiver se DÉRIVE au lieu de se redessiner.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";

const DIR = new URL("../../../../public/pixelart/iso/", import.meta.url);
const NAMES = [
  "tree-1", "tree-2", "tree-3", "tree-4",
  "bush-1", "bush-2", "bush-3", "bush-4", "bush-5", "bush-6",
];
const read = (name) => PNG.sync.read(fs.readFileSync(new URL(name + ".png", DIR)));
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Rampe de neige du SOL d'hiver (fetchGroundTiles, tons dominants de
// iso-grass-winter-*). Deux matières enneigées qui ne partagent pas leur blanc
// se lisent comme deux hivers différents : c'est la même liste que le script.
const SNOW = [[222, 234, 234], [201, 217, 220], [173, 190, 196]];
const isSnow = (r, g, b) => SNOW.some((s) => s[0] === r && s[1] === g && s[2] === b);

describe("végétation enneigée (sprites -winter)", () => {
  for (const name of NAMES) {
    it(`${name}-winter : même canvas et même SILHOUETTE que l'été`, () => {
      const a = read(name), b = read(name + "-winter");
      expect(b.width).toBe(a.width);
      expect(b.height).toBe(a.height);
      let moved = 0;
      for (let i = 0; i < a.width * a.height; i += 1) {
        if (a.data[i * 4 + 3] !== b.data[i * 4 + 3]) moved += 1;
      }
      expect(moved).toBe(0);
    });

    it(`${name}-winter : neige POSÉE (rampe du sol) sur 20 à 45 % de l'encre`, () => {
      const b = read(name + "-winter");
      let ink = 0, snow = 0;
      for (let i = 0; i < b.width * b.height; i += 1) {
        if (b.data[i * 4 + 3] <= 16) continue;
        ink += 1;
        if (isSnow(b.data[i * 4], b.data[i * 4 + 1], b.data[i * 4 + 2])) snow += 1;
      }
      // Le script vise 30 % ; la fourchette laisse régler SNOW_TARGET sans
      // réécrire le test, mais interdit les deux échecs déjà vus en vrai : le
      // liseré blanc du 1er jet (6 % — de la neige au contour, pas sur l'arbre)
      // et l'épicéa noyé du 2e (63 %, silhouette perdue).
      expect(snow / ink).toBeGreaterThan(0.20);
      expect(snow / ink).toBeLessThan(0.45);
    });

    it(`${name}-winter : la neige est EN HAUT, pas répartie au hasard`, () => {
      const b = read(name + "-winter");
      // Barycentre vertical de la neige contre celui de l'encre : la neige tombe
      // du ciel, elle doit peser plus haut que l'arbre. Sans le biais de hauteur
      // du script, un semis uniforme mettrait les deux au même niveau.
      let ny = 0, n = 0, iy = 0, ink = 0;
      for (let y = 0; y < b.height; y += 1) for (let x = 0; x < b.width; x += 1) {
        const i = y * b.width + x;
        if (b.data[i * 4 + 3] <= 16) continue;
        iy += y; ink += 1;
        if (isSnow(b.data[i * 4], b.data[i * 4 + 1], b.data[i * 4 + 2])) { ny += y; n += 1; }
      }
      expect(n).toBeGreaterThan(0);
      // Écart mesuré sur le lot livré : 8 à 26 % de la hauteur d'encre.
      expect((iy / ink - ny / n) / b.height).toBeGreaterThan(0.05);
    });

    it(`${name}-winter : le feuillage restant est REFROIDI, pas l'été tel quel`, () => {
      const a = read(name), b = read(name + "-winter");
      // Sur les pixels NON enneigés : la saturation doit avoir baissé. Comparer
      // les moyennes globales ne prouverait rien (la neige tire tout vers le
      // clair) — c'est le feuillage qui doit changer, pixel à pixel.
      let sa = 0, sb = 0, n = 0;
      for (let i = 0; i < a.width * a.height; i += 1) {
        if (a.data[i * 4 + 3] <= 16) continue;
        const br = b.data[i * 4], bg = b.data[i * 4 + 1], bb = b.data[i * 4 + 2];
        if (isSnow(br, bg, bb)) continue;
        const ar = a.data[i * 4], ag = a.data[i * 4 + 1], ab = a.data[i * 4 + 2];
        sa += Math.max(ar, ag, ab) - Math.min(ar, ag, ab);
        sb += Math.max(br, bg, bb) - Math.min(br, bg, bb);
        n += 1;
      }
      expect(n).toBeGreaterThan(0);
      // La teinte du moteur (multiply gris à 0,34) ne retirait que ~2 % de
      // saturation : c'est précisément ce qui laissait des feuillus lime sur la
      // neige. On exige une vraie désaturation.
      expect(sb / n).toBeLessThan((sa / n) * 0.75);
      // …sans virer au gris mort : l'arbre reste un arbre.
      expect(sb / n).toBeGreaterThan(4);
      // Et il s'assombrit un peu (le jour d'hiver est bas), jamais plus clair.
      let la = 0, lb = 0;
      for (let i = 0; i < a.width * a.height; i += 1) {
        if (a.data[i * 4 + 3] <= 16) continue;
        const br = b.data[i * 4], bg = b.data[i * 4 + 1], bb = b.data[i * 4 + 2];
        if (isSnow(br, bg, bb)) continue;
        la += lum(a.data[i * 4], a.data[i * 4 + 1], a.data[i * 4 + 2]);
        lb += lum(br, bg, bb);
      }
      expect(lb / n).toBeLessThan(la / n);
    });
  }
});
