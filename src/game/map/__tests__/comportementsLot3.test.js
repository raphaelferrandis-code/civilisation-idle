import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

import { IDLE_NAMES } from "../agents.js";

// docs/PLAN-COMPORTEMENTS.md, LOT 3 — « fini les statues ». Tout personnage ARRÊTÉ
// était figé sur l'image 0 de sa marche. Chaque habitant des ères (et chaque porteur
// de panier) a maintenant une bande d'ATTENTE par diagonale, et la liste des noms qui
// en ont une est EXPLICITE (IDLE_NAMES) : le .exe compte chaque fichier demandé
// absent. Ces gardes lisent le DISQUE.

const DIR = path.resolve(__dirname, "../../../../public/pixelart/agents/inhabitants");
const DIAG = ["southeast", "southwest", "northeast", "northwest"];
const read = (f) => PNG.sync.read(fs.readFileSync(path.join(DIR, f)));
const palette = (img) => {
  const s = new Set();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 128) s.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
  return s;
};

describe("lot 3 — l'attente animée", () => {
  it("la liste couvre les 8 habitants de chaque jeu et les deux porteurs de panier", () => {
    expect(IDLE_NAMES.size).toBe(66);
    expect(IDLE_NAMES.has("basket-woman")).toBe(true);
  });

  for (const name of IDLE_NAMES) {
    it(`${name} : 4 bandes d'attente + demi-bandes, au format de sa marche, dans sa palette`, () => {
      for (const d of DIAG) {
        const walk = read(`${name}-${d}.png`);
        const idle = read(`${name}-idle-${d}.png`);
        const half = read(`${name}-idle-${d}-half.png`);
        expect(idle.height).toBe(walk.height);                    // même cadre
        expect(idle.width % idle.height).toBe(0);
        expect(idle.width / idle.height).toBeGreaterThanOrEqual(2); // au moins 2 images
        expect(half.height).toBe(Math.floor(idle.height / 2));
        // Aucune teinte nouvelle : passer de la marche à l'attente ne change rien.
        const pw = palette(walk);
        for (const c of palette(idle)) expect(pw.has(c)).toBe(true);
      }
    });
  }
});
