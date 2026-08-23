// Une CHAUSSÉE se distingue-t-elle du SOL DES LOTS de la même ère ?
//
// Le grief (Raph 2026-07-29, ère bourg) : « les routes de cette ère ne se
// distinguent pas assez du sol des maisons ». La cause n'était visible dans
// aucune constante — `ground-cobble` et `road-cobble` sont deux clés
// différentes, deux prompts différents, deux lots PixelLab différents. Elles ne
// se ressemblent que dans les PIXELS LIVRÉS. Ce test lit donc les PNG de
// public/pixelart/iso/, comme isoGroundTileAssets.test.js.
//
// Mesure = distance RGB entre les tons moyens des deux matières, et non écart de
// luminance : les couples qui lisent bien le doivent autant à la TEINTE qu'à la
// valeur (l'ère impériale pose une voie brune sur des dalles pâles). Le voile de
// lecture de l'ère (ROAD_VEIL) est un mélange linéaire — l'appliquer au ton moyen
// donne EXACTEMENT le ton moyen de la tuile voilée, rien n'est approximé ici.
//
// Le seuil 40 n'est pas rond par hasard : il est posé entre le couple le plus
// serré qui LIT (tech, 43,0 — la voie y est la plus CLAIRE des deux et le sol
// porte des plaques structurées) et le couple qui ne lisait pas (bourg nu, 32,0).
// Les autres ères sont loin au-dessus : 80,6 · 84,4 · 111,4.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { isoEraSurface } from "../iso/isoRenderer.js";
import { ISO_TILE_VARIANTS } from "../iso/isoGroundTiles.js";

const DIR = new URL("../../../../public/pixelart/iso/", import.meta.url);
const MIN_DIST = 40;

const read = (name) => PNG.sync.read(fs.readFileSync(new URL(name, DIR)));
// Ton moyen d'une MATIÈRE = moyenne de ses variantes, sur les pixels opaques
// (le losange ; les coins transparents ne sont jamais peints).
const matTone = (key) => {
  const n = ISO_TILE_VARIANTS[key] || 0;
  const names = n > 1 ? Array.from({ length: n }, (_, i) => `${key}-${i + 1}.png`) : [`${key}.png`];
  const acc = [0, 0, 0];
  for (const name of names) {
    const p = read(name);
    const s = [0, 0, 0];
    let px = 0;
    for (let i = 0; i < p.width * p.height; i += 1) {
      if (p.data[i * 4 + 3] < 128) continue;
      for (let c = 0; c < 3; c += 1) s[c] += p.data[i * 4 + c];
      px += 1;
    }
    for (let c = 0; c < 3; c += 1) acc[c] += s[c] / px / names.length;
  }
  return acc;
};
const veiled = (tone, veil) => (veil ? tone.map((v, i) => v + (veil[i] - v) * veil[3]) : tone);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Tons mémoïsés : 14 matières × 4 variantes de PNG relues à chaque `it` sinon.
const cache = new Map();
const tone = (key) => {
  if (!cache.has(key)) cache.set(key, matTone(key));
  return cache.get(key);
};

describe("chaussée vs sol des lots, par ère", () => {
  for (let band = 0; band <= 9; band += 1) {
    const s = isoEraSurface(band);
    it(`ère ${band} : ${s.road} se détache de ${s.ground}`, () => {
      const d = dist(veiled(tone(s.road), s.veil), tone(s.ground));
      expect(d).toBeGreaterThanOrEqual(MIN_DIST);
    });
  }

  // ⚠ LE point du test : sans le voile, les ères 2-3 TOMBENT. Une garde qui
  // passerait aussi bien avec et sans ce qu'elle protège ne protège rien — et
  // c'est exactement le piège ici, puisque le voile est un réglage d'une ligne
  // qu'un futur nettoyage pourrait juger décoratif.
  it("mord : le bourg et l'ère fortifiée échouent si on retire leur voile", () => {
    for (const band of [2, 3]) {
      const s = isoEraSurface(band);
      expect(s.veil).toBeTruthy();
      expect(dist(tone(s.road), tone(s.ground))).toBeLessThan(MIN_DIST);
    }
  });

  // Le voile assombrit-il des ères qui allaient bien ? Aucune autre n'en porte.
  it("ne voile que les ères dont le couple se confond", () => {
    for (let band = 0; band <= 9; band += 1) {
      const s = isoEraSurface(band);
      if (band === 2 || band === 3) continue;
      expect(s.veil, `ère ${band}`).toBeFalsy();
      expect(dist(tone(s.road), tone(s.ground))).toBeGreaterThanOrEqual(MIN_DIST);
    }
  });
});
