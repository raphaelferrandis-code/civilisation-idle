"use strict";
// LES ICÔNES DES SUCCÈS (audit 2026-10-05, SUCCES-AFFICHAGE) : chaque succès a son
// icône 64×64 et sa version grise (Steam : « Achieved » / « Unachieved »), cuites
// par scripts/bakeAchievementIcons.cjs dans public/pixelart/ui/achievements/.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { ACHIEVEMENTS } from "../../data/achievements.js";
import { achievementIconSrc } from "../achievements.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = path.join(ROOT, "public/pixelart/ui/achievements");
const read = (file) => PNG.sync.read(fs.readFileSync(path.join(DIR, file)));

describe("succès — icônes", () => {
  it("chaque succès a son icône et sa version grise, en 64×64 (node scripts/bakeAchievementIcons.cjs)", () => {
    const missing = ACHIEVEMENTS.flatMap((a) => [`${a.id}.png`, `${a.id}-gris.png`]).filter((f) => !fs.existsSync(path.join(DIR, f)));
    expect(missing).toEqual([]);
    for (const a of ACHIEVEMENTS) {
      const icon = read(`${a.id}.png`);
      expect([icon.width, icon.height], a.id).toEqual([64, 64]);
    }
  });

  it("aucune icône orpheline (succès retiré ou renommé)", () => {
    const known = new Set(ACHIEVEMENTS.flatMap((a) => [`${a.id}.png`, `${a.id}-gris.png`]));
    expect(fs.readdirSync(DIR).filter((f) => !known.has(f))).toEqual([]);
  });

  it("la version grise : même silhouette, aucune couleur, et une vraie icône (pas un carré vide)", () => {
    for (const a of ACHIEVEMENTS) {
      const icon = read(`${a.id}.png`), gris = read(`${a.id}-gris.png`);
      let opaque = 0, colored = 0, sameAlpha = true;
      for (let i = 0; i < icon.data.length; i += 4) {
        if (icon.data[i + 3] !== gris.data[i + 3]) sameAlpha = false;
        if (gris.data[i + 3] === 0) continue;
        opaque++;
        if (gris.data[i] !== gris.data[i + 1] || gris.data[i + 1] !== gris.data[i + 2]) colored++;
      }
      expect(sameAlpha, a.id).toBe(true);
      expect(colored, a.id).toBe(0);
      // Assez de matière pour se lire, sans remplir le carré (fond transparent).
      expect(opaque, a.id).toBeGreaterThan(300);
      expect(opaque, a.id).toBeLessThan(64 * 64);
    }
  });

  it("le chemin servi au jeu suit les fichiers cuits", () => {
    expect(achievementIconSrc("ERE_HAMEAU", true)).toBe("/pixelart/ui/achievements/ERE_HAMEAU.png");
    expect(achievementIconSrc("ERE_HAMEAU", false)).toBe("/pixelart/ui/achievements/ERE_HAMEAU-gris.png");
  });
});
