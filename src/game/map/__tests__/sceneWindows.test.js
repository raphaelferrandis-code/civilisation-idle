// Les bureaux de la bande 6 la nuit (sceneWindows.js) : le verre est NOMMÉ sprite par
// sprite, groupé en carreaux, et une grande surface vitrée s'allume par ÉTAGES.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { sceneWindowUnits, SCENE_GLASS } from "../sceneWindows.js";

const BUILDINGS = new URL("../../../../public/pixelart/agents/buildings/", import.meta.url);
const VERRE = [80, 90, 120], MUR = [230, 230, 224];
const image = (rows) => {
  const h = rows.length, w = rows[0].length, d = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => d.set([...(ch === "v" ? VERRE : MUR), ch === "." ? 0 : 255], (y * w + x) * 4)));
  return { d, w, h };
};
const glass = new Set([(VERRE[0] << 16) | (VERRE[1] << 8) | VERRE[2]]);

describe("bureaux allumés la nuit (bande 6)", () => {
  it("deux vitres séparées par un meneau font deux carreaux ; le mur et le vide n'en sont pas", () => {
    const { d, w, h } = image(["mmmmmmm", "mvvmvvm", "mvvmvvm", "mmmmmmm", "......."]);
    const u = sceneWindowUnits(d, w, h, glass);
    expect(u.length).toBe(2);
    expect(u.map((x) => x.length)).toEqual([4, 4]);
  });
  it("une grande surface vitrée s'allume par étages de 3 px, pas en damier", () => {
    const { d, w, h } = image(Array.from({ length: 9 }, () => "vvvvvv"));
    const u = sceneWindowUnits(d, w, h, glass);
    expect(u.length).toBe(3);                         // 9 rangées → 3 étages
    for (const x of u) expect(x.length).toBe(18);     // 6 px × 3 rangées
  });
  // Garde contre l'art qui change : si un sprite est regénéré, ses couleurs de verre
  // changent et la liste devient muette sans rien dire. On l'apprend ici.
  it("chaque couleur de verre nommée existe dans son PNG", () => {
    for (const [key, list] of Object.entries(SCENE_GLASS)) {
      const file = new URL(`${key}.png`, BUILDINGS);
      expect(fs.existsSync(file), `${key}.png`).toBe(true);
      const p = PNG.sync.read(fs.readFileSync(file));
      const have = new Set();
      for (let i = 0; i < p.width * p.height; i += 1) {
        if (p.data[i * 4 + 3] >= 240) have.add(((p.data[i * 4] << 16) | (p.data[i * 4 + 1] << 8) | p.data[i * 4 + 2]).toString(16).padStart(6, "0"));
      }
      for (const c of list.split(" ")) expect(have.has(c), `${key} : verre #${c} absent du PNG`).toBe(true);
    }
  });
  // Une ville éclairée, pas des bâtiments-lampes : le verre nommé reste une part
  // minoritaire de l'encre (la tour de verre de la banque est la plus vitrée ; le
  // palais de justice, à 1,6 %, reste sombre — c'est voulu).
  it("le verre nommé pèse entre 1 % et 60 % de l'encre de chaque sprite", () => {
    for (const [key, list] of Object.entries(SCENE_GLASS)) {
      const p = PNG.sync.read(fs.readFileSync(new URL(`${key}.png`, BUILDINGS)));
      const set = new Set(list.split(" ").map((c) => parseInt(c, 16)));
      let ink = 0, on = 0;
      for (let i = 0; i < p.width * p.height; i += 1) {
        if (p.data[i * 4 + 3] < 240) continue;
        ink += 1;
        if (set.has((p.data[i * 4] << 16) | (p.data[i * 4 + 1] << 8) | p.data[i * 4 + 2])) on += 1;
      }
      expect(on / ink, key).toBeGreaterThan(0.01);
      expect(on / ink, key).toBeLessThan(0.6);
    }
  });
});
