"use strict";
// LA CHUTE (docs/PLAN-CHUTE.md) — garde du manifeste des ruines dessinées : chaque
// ruine a son image, et chaque image répond à un sprite qui existe (sinon la ruine ne
// serait jamais demandée, ou le sprite tomberait sur une image absente).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RUIN_HOUSES, RUIN_PROPS } from "../ruinArt.js";

const PUB = path.resolve(__dirname, "../../../../public/pixelart");

describe("ruines dessinées", () => {
  it("chaque habitation en ruine a son image et son sprite d'origine", () => {
    for (const [key, off] of Object.entries(RUIN_HOUSES)) {
      expect(fs.existsSync(path.join(PUB, "ruins/houses", key + ".png")), key).toBe(true);
      expect(fs.existsSync(path.join(PUB, "houses", key + ".png")), key).toBe(true);
      expect(off.every(Number.isInteger), key).toBe(true);
    }
  });

  it("chaque bâtiment de scène en ruine a son image et son sprite d'origine", () => {
    for (const [key, off] of Object.entries(RUIN_PROPS)) {
      expect(fs.existsSync(path.join(PUB, "ruins/props", key + ".png")), key).toBe(true);
      expect(fs.existsSync(path.join(PUB, "agents/buildings", key + ".png")), key).toBe(true);
      expect(off.every(Number.isInteger), key).toBe(true);
    }
  });

  it("aucune image orpheline dans public/pixelart/ruins", () => {
    for (const [dir, map] of [["houses", RUIN_HOUSES], ["props", RUIN_PROPS]]) {
      const d = path.join(PUB, "ruins", dir);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (!f.endsWith(".png")) continue;
        expect(map[f.slice(0, -4)], dir + "/" + f).toBeTruthy();
      }
    }
  });
});
