// S2 — LA DOSE DU PAVÉ (docs/PLAN-RENDU-VILLE.md), et ce qui la justifie.
//
// Le grief « brouillon » de Raph vient pour partie du GRAIN de la matière de sol :
// mesuré sur les PNG livrés, `ground-cobble` porte 18,4 points d'écart de luminance
// entre pixels VOISINS, quatre à six fois plus que toutes les autres pierres — et
// c'est la matière des bandes 2 et 3, celles de sa capture. La tuile est blittée
// 1:1 à l'écran (cf. lot S7), donc ces 18,4 points sont bien des pixels d'écran.
//
// La dose (`URBAN_TILE_A.cobble = 0,6`, arbitrée sur planche le 2026-08-05) n'est
// donc pas un goût : elle répond à un chiffre. Ce test garde les DEUX bouts —
// la dose ET la mesure qui la justifie. Si un jour les tuiles de pavé sont
// régénérées avec un grain calme, c'est le second `it` qui tombera, et il faudra
// rouvrir la dose au lieu de la traîner.
//
// ⚠ Troisième garde, structurelle : doser ne laisse aucun trou UNIQUEMENT parce que
// l'aplat de ton est peint sous la tuile (`texAlpha === 0` pour `urban`). Ce 0 est
// vérifié par lecture du SOURCE, comme le fait déjà spriteScale.test.js pour les
// densités — une garde qui recopierait la règle ne verrait pas sa disparition.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { URBAN_TILE_A } from "../iso/isoRenderer.js";
import { ISO_TILE_VARIANTS } from "../iso/isoGroundTiles.js";

const ISO = new URL("../../../../public/pixelart/iso/", import.meta.url);
const SRC = new URL("../iso/isoRenderer.js", import.meta.url);

// Grain d'une matière = moyenne des |ΔL| entre pixels ADJACENTS (H et V), sur les
// pixels opaques, moyennée sur ses variantes. C'est la texture que l'œil lit, pas
// l'écart-type global (une tuile peut être très contrastée et parfaitement lisse).
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function grain(key) {
  const n = ISO_TILE_VARIANTS[key] || 0;
  const names = n > 1 ? Array.from({ length: n }, (_, i) => `${key}-${i + 1}.png`) : [`${key}.png`];
  let acc = 0, used = 0;
  for (const name of names) {
    const url = new URL(name, ISO);
    if (!fs.existsSync(url)) continue;
    const p = PNG.sync.read(fs.readFileSync(url));
    const L = new Float64Array(p.width * p.height);
    const A = new Uint8Array(p.width * p.height);
    for (let i = 0; i < p.width * p.height; i += 1) {
      A[i] = p.data[i * 4 + 3] >= 128 ? 1 : 0;
      L[i] = lum(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]);
    }
    let s = 0, m = 0;
    for (let y = 0; y < p.height; y += 1) {
      for (let x = 0; x < p.width; x += 1) {
        const i = y * p.width + x;
        if (!A[i]) continue;
        if (x + 1 < p.width && A[i + 1]) { s += Math.abs(L[i] - L[i + 1]); m += 1; }
        if (y + 1 < p.height && A[i + p.width]) { s += Math.abs(L[i] - L[i + p.width]); m += 1; }
      }
    }
    if (m) { acc += s / m; used += 1; }
  }
  return used ? acc / used : NaN;
}

describe("S2 — dose de la tuile de sol par matière", () => {
  it("seul le pavé est dosé ; les autres matières restent pleines", () => {
    expect(URBAN_TILE_A.cobble).toBeGreaterThan(0.3);   // pas un aplat : refus de juillet
    expect(URBAN_TILE_A.cobble).toBeLessThan(1);        // …mais bien dosé
    for (const k of ["flagstone", "concrete", "tech"]) {
      expect(URBAN_TILE_A[k], `${k} ne doit PAS être dosé`).toBe(1);
    }
    // La terre battue garde son réglage HISTORIQUE partagé (`tileA`) : `null` =
    // « suit tileA ». La remplacer par un nombre couperait ce lien en silence.
    expect(URBAN_TILE_A.earth).toBeNull();
  });

  // ⚠ LE point du test : la dose répond à une MESURE. Si l'art change, elle tombe.
  it("mord : le pavé est bien la matière la plus bruyante, de loin", () => {
    const cobble = grain("ground-cobble");
    const autres = ["ground-flagstone", "ground-concrete", "ground-earth", "ground-tech"]
      .map((k) => ({ k, g: grain(k) }))
      .filter((e) => Number.isFinite(e.g));
    expect(autres.length).toBeGreaterThanOrEqual(3);
    expect(cobble).toBeGreaterThan(12);
    for (const { k, g } of autres) {
      expect(cobble / g, `pavé (${cobble.toFixed(1)}) vs ${k} (${g.toFixed(1)})`).toBeGreaterThan(2);
    }
  });

  // Garde STRUCTURELLE, par lecture du source : c'est ce 0 qui fait que la dose ne
  // laisse pas voir le fond du canvas. Il vit dans une variable locale de la boucle
  // de cuisson, donc aucun import ne peut l'observer — la lecture de source est la
  // seule garde possible, et c'est l'idiome déjà retenu ailleurs (spriteScale).
  it("l'aplat de ton est bien peint SOUS la tuile urbaine (texAlpha 0)", () => {
    const src = fs.readFileSync(SRC, "utf8");
    expect(src).toMatch(/texAlpha\s*=\s*kind === 'urban'\s*\?\s*0/);
    // …et la branche de repli se déclenche bien quand texAlpha < 1.
    expect(src).toMatch(/if \(kind !== 'grass' && \(!tileReady \|\| texAlpha < 1\)\)/);
  });
});
