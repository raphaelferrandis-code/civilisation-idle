// La nuit cosmique : seuls le VERRE et les bandes lumineuses de la teinte de l'ère
// s'allument (sceneEmissive.js) — ni la nacre, ni le feuillage, ni les ombres.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { emissivePixels } from "../sceneEmissive.js";

const px = (rgb) => {
  const d = new Uint8ClampedArray(rgb.length * 4);
  rgb.forEach((c, i) => d.set([...c, 255], i * 4));
  return d;
};

describe("lumière de nuit des scènes cosmiques", () => {
  it("allume le verre de l'ère, pas la nacre, le feuillage ni l'ombre", () => {
    const jade = [118, 204, 172], nacre = [236, 238, 232], feuille = [92, 150, 60], ombre = [40, 60, 52];
    const m = emissivePixels(px([jade, nacre, feuille, ombre]), 4, 1, 7);
    expect([...m]).toEqual([1, 0, 0, 0]);
  });
  it("chaque bande a sa teinte : l'or s'allume en 8, pas en 7", () => {
    const or = [236, 190, 96];
    expect([...emissivePixels(px([or]), 1, 1, 8)]).toEqual([1]);
    expect([...emissivePixels(px([or]), 1, 1, 7)]).toEqual([0]);
  });
  // Sur l'art réel : une part visible mais minoritaire de l'encre s'allume — une ville
  // éclairée, pas des bâtiments-lampes.
  it("sur l'école de la bande 7 : entre 3 % et 40 % de l'encre", () => {
    const p = PNG.sync.read(fs.readFileSync(new URL("../../../../public/pixelart/agents/buildings/cosmic-schools-7.png", import.meta.url)));
    const m = emissivePixels(p.data, p.width, p.height, 7);
    let ink = 0, on = 0;
    for (let i = 0; i < p.width * p.height; i += 1) { if (p.data[i * 4 + 3] >= 200) ink += 1; on += m[i]; }
    expect(on / ink).toBeGreaterThan(0.03);
    expect(on / ink).toBeLessThan(0.4);
  });
});
