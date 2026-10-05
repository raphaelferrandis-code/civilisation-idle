// SCÈNES VIVANTES (2026-10-04) — les couches qui font vivre ce qui était PEINT dans
// les images fixes des bâtiments-moteur : feux, roues, charges de grue, drones,
// anneaux et cristaux en orbite (cityEngineSprites.LIVE_LAYERS, cuites par
// scripts/sceneLive.mjs). Ce que ce test garde, dans les FICHIERS :
//   1. chaque couche annoncée a ses PNG — une couche sans fichier ne casserait rien
//      en dev (Vite rend 200), mais compterait en erreur dans le .exe ; et chaque
//      bande livrée est annoncée (sinon de l'art mort que personne ne dessine) ;
//   2. la GÉOMÉTRIE : la bande est N images au canvas EXACT de l'image d'origine,
//      le fond aussi — blitProp les pose au même cadre ; un pixel de trop et la
//      flamme glisse à côté de son foyer, la charge à côté de son câble ;
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

  it("la bande fait N images au canvas exact de l'image, le fond aussi", () => {
    for (const [k, L] of Object.entries(LIVE_LAYERS)) {
      const src = read(k), strip = read(`${k}-live`);
      expect(strip.height, `${k} : hauteur`).toBe(src.height);
      expect(strip.width, `${k} : ${L.n} images de ${src.width} px`).toBe(src.width * L.n);
      if (L.back) {
        const b = read(`${k}-back`);
        expect([b.width, b.height], `${k}-back`).toEqual([src.width, src.height]);
      }
    }
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
