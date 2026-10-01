// SCÈNES COSMIQUES PAR FAMILLE (2026-10-01, « le meilleur rendu futuriste »).
//
// Aux bandes 7-9, les familles savoir/infra se partageaient six images de TOURS par
// bande — la forêt de flèches identiques. Chacune reçoit maintenant son bâtiment
// (COSMIC_SCENE_KEYS, chargé à la demande par cosmicSceneKey). Ce que ce test garde :
//   1. chaque clé annoncée a son PNG — une clé sans fichier ne casserait rien en dev
//      (Vite rend 200), mais compterait en erreur dans le .exe ;
//   2. le CALAGE commun de blitCosmicTower : canevas 128×224, pied de l'encre sur la
//      dernière rangée, encre centrée — une image décalée flotterait ou glisserait
//      hors de son lot ;
//   3. la GAMME DE HAUTEURS : c'est le point du chantier. Si toutes les nouvelles
//      images remplissaient le canevas, on aurait refait une forêt de tours.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { COSMIC_SCENE_KEYS } from "../cityEngineSprites.js";

const DIR = new URL("../../../../public/pixelart/agents/buildings/", import.meta.url);
const ink = (key) => {
  const p = PNG.sync.read(fs.readFileSync(new URL(`${key}.png`, DIR)));
  let x0 = p.width, x1 = -1, y0 = p.height, y1 = -1;
  for (let y = 0; y < p.height; y += 1) for (let x = 0; x < p.width; x += 1) {
    if (p.data[(y * p.width + x) * 4 + 3] < 128) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { w: p.width, h: p.height, x0, x1, y0, y1 };
};

describe("scènes cosmiques par famille", () => {
  it("chaque clé annoncée a son PNG", () => {
    for (const k of COSMIC_SCENE_KEYS) {
      expect(fs.existsSync(new URL(`${k}.png`, DIR)), k).toBe(true);
    }
  });

  it("calage commun : 128×224, pied au ras du bas, encre centrée", () => {
    for (const k of COSMIC_SCENE_KEYS) {
      const b = ink(k);
      expect([b.w, b.h], k).toEqual([128, 224]);
      expect(b.y1, `${k} : pied`).toBeGreaterThanOrEqual(220);
      expect(Math.abs((b.x0 + b.x1) / 2 - 63.5), `${k} : centre`).toBeLessThanOrEqual(2);
    }
  });

  it("une gamme de hauteurs, pas une forêt de tours", () => {
    const hauts = [...COSMIC_SCENE_KEYS].map((k) => { const b = ink(k); return (b.y1 - b.y0 + 1) / b.h; });
    expect(hauts.length).toBeGreaterThanOrEqual(3);
    // Au moins un bâtiment bas (moins de la moitié du canevas) et au plus un tiers de tours.
    expect(Math.min(...hauts)).toBeLessThan(0.5);
    expect(hauts.filter((h) => h > 0.7).length).toBeLessThanOrEqual(Math.ceil(hauts.length / 3));
  });
});
