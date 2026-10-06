// SCÈNES VIVANTES (2026-10-04) — les couches qui font vivre ce qui était PEINT dans
// les images fixes des bâtiments-moteur : feux, roues, charges de grue, drones,
// anneaux et cristaux en orbite (cityEngineSprites.LIVE_LAYERS, cuites par
// scripts/sceneLive.mjs). Ce que ce test garde, dans les FICHIERS :
//   1. chaque couche annoncée a ses PNG — une couche sans fichier ne casserait rien
//      en dev (Vite rend 200), mais compterait en erreur dans le .exe ; et chaque
//      bande livrée est annoncée (sinon de l'art mort que personne ne dessine) ;
//   2. la GÉOMÉTRIE : la bande est N TIMBRES de la boîte `box` (audit du 05/10,
//      ASSET-4), boîte tenue DANS l'image d'origine, et le fond au canvas exact de
//      l'image — blitProp pose le fond au cadre de l'image et le timbre à sa place ;
//      un pixel de trop et la flamme glisse à côté de son foyer, la charge à côté de
//      son câble. Le timbre garde un pixel vide sur ses bords (hors bord de l'image) :
//      sur GPU, l'échantillon de bord y tombe et non sur le timbre voisin ;
//   3. une bande qui ne bouge pas, ou une image vide, est un élément figé de plus.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { LIVE_LAYERS } from "../cityEngineSprites.js";
import { plaisirsSkinSpec } from "../iso/plaisirsSkin.js";

const DIR = new URL("../../../../public/pixelart/agents/buildings/", import.meta.url);
const read = (name) => PNG.sync.read(fs.readFileSync(new URL(`${name}.png`, DIR)));
const has = (name) => fs.existsSync(new URL(`${name}.png`, DIR));

describe("scènes vivantes : couches animées des bâtiments-moteur", () => {
  it("chaque couche annoncée a ses fichiers, et chaque bande livrée est annoncée", () => {
    for (const [k, L] of Object.entries(LIVE_LAYERS)) {
      expect(has(k), `${k} : image d'origine`).toBe(true);
      expect(has(`${k}-live`), `${k}-live`).toBe(true);
      expect(has(`${k}-back`), `${k}-back`).toBe(!!L.back);
    }
    const livrees = fs.readdirSync(DIR).filter((f) => f.endsWith("-live.png")).map((f) => f.slice(0, -"-live.png".length));
    expect(livrees.sort()).toEqual(Object.keys(LIVE_LAYERS).sort());
  });

  it("la bande fait N timbres de sa boîte, la boîte tient dans l'image, le fond au canvas de l'image", () => {
    let full = 0, kept = 0;
    for (const [k, L] of Object.entries(LIVE_LAYERS)) {
      const src = read(k), strip = read(`${k}-live`);
      expect(L.box, `${k} : boîte`).toHaveLength(4);
      const [bx, by, bw, bh] = L.box;
      expect(bx >= 0 && by >= 0 && bw > 0 && bh > 0 && bx + bw <= src.width && by + bh <= src.height, `${k} : boîte ${L.box} dans ${src.width}×${src.height}`).toBe(true);
      expect([strip.width, strip.height], `${k} : ${L.n} timbres de ${bw}×${bh}`).toEqual([bw * L.n, bh]);
      if (L.back) {
        const b = read(`${k}-back`);
        expect([b.width, b.height], `${k}-back`).toEqual([src.width, src.height]);
      }
      // Le liseré vide : colonnes et rangées de bord du timbre, sauf au bord de l'image.
      const edge = [];
      if (bx > 0) edge.push((f, j) => [0, j]);
      if (bx + bw < src.width) edge.push((f, j) => [bw - 1, j]);
      for (let f = 0; f < L.n; f += 1) {
        for (let j = 0; j < bh; j += 1) for (const e of edge) {
          const [x, y] = e(f, j);
          expect(strip.data[(y * strip.width + f * bw + x) * 4 + 3], `${k} image ${f} : bord vertical`).toBe(0);
        }
        for (let i = 0; i < bw; i += 1) {
          if (by > 0) expect(strip.data[(f * bw + i) * 4 + 3], `${k} image ${f} : bord haut`).toBe(0);
          if (by + bh < src.height) expect(strip.data[((bh - 1) * strip.width + f * bw + i) * 4 + 3], `${k} image ${f} : bord bas`).toBe(0);
        }
      }
      full += src.width * src.height * L.n; kept += bw * bh * L.n;
    }
    // Ce qu'on a gagné : moins d'un dixième des pixels décodés (37,8 → 3,5 Mo).
    expect(kept / full).toBeLessThan(0.1);
  });

  it("habillages des Plaisirs : chaque `live` a son fond et sa bande, au canvas de l'image", () => {
    const PLACES = new URL("../../../../public/pixelart/places/", import.meta.url);
    let n = 0;
    for (let b = 0; b <= 9; b += 1) {
      const sp = plaisirsSkinSpec(b);
      if (!sp || !sp.live) continue;
      n += 1;
      const name = sp.src.split("/").pop().replace(/\.png$/, "");
      const at = (suf) => PNG.sync.read(fs.readFileSync(new URL(`${name}${suf}.png`, PLACES)));
      const src = at(""), back = at("-back"), strip = at("-live");
      expect([back.width, back.height], `${name}-back`).toEqual([src.width, src.height]);
      expect([strip.width, strip.height], `${name}-live : ${sp.live.n} images`).toEqual([src.width * sp.live.n, src.height]);
    }
    expect(n, "au moins un habillage vivant").toBeGreaterThan(0);
  });

  it("aucune image vide, et la bande bouge vraiment", () => {
    // Plancher bas : une charge hissée de 3 px sur 16 images ne prend que quatre
    // positions — c'est un mouvement, pas une bande figée.
    for (const [k, L] of Object.entries(LIVE_LAYERS)) {
      const strip = read(`${k}-live`), fw = strip.width / L.n;
      const frames = [];
      for (let f = 0; f < L.n; f += 1) {
        const px = [];
        for (let y = 0; y < strip.height; y += 1) for (let x = 0; x < fw; x += 1) {
          const i = (y * strip.width + f * fw + x) * 4;
          px.push(strip.data[i + 3] ? (strip.data[i] << 16) | (strip.data[i + 1] << 8) | strip.data[i + 2] : -1);
        }
        expect(px.some((v) => v >= 0), `${k} image ${f} vide`).toBe(true);
        frames.push(px.join(","));
      }
      expect(new Set(frames).size, `${k} : images toutes identiques`).toBeGreaterThan(2);
    }
  });
});
