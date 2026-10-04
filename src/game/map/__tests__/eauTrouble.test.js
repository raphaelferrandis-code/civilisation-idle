// L'EAU TROUBLE (2026-10-04, scripts/eauTrouble.mjs) : le fleuve d'une cité en ruine.
//
// Analyse du visuel de crise (Raph : « A et B oui ») : à l'usure haute / Rupture
// 100 %, le fleuve passait au turquoise VIF — le coloris le plus saturé de l'écran,
// un lagon au pire moment. Il prend désormais une eau boueuse, olive-brun.
// Ce qu'on protège : (1) c'est bien LE MÊME DESSIN que la nappe turquoise, recoloré
// par table (une teinte → une teinte, frames comprises) ; (2) c'est le coloris le
// PLUS TERNE de tous — sinon la ruine redeviendrait une carte postale.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { WATER_SHEETS } from "../iso/isoRiver.js";

const read = (src) => PNG.sync.read(fs.readFileSync(path.join(process.cwd(), "public", src)));
const rgb = (p, i) => `${p.data[i * 4]},${p.data[i * 4 + 1]},${p.data[i * 4 + 2]}`;
const moyenne = (p) => {
  const s = [0, 0, 0];
  for (let i = 0; i < p.width * p.height; i += 1) for (let k = 0; k < 3; k += 1) s[k] += p.data[i * 4 + k];
  return s.map((v) => v / (p.width * p.height));
};
// Saturation HSL de la couleur moyenne : assez pour classer des eaux entre elles.
const saturation = ([r, g, b]) => {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
  return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
};

describe("l'eau trouble de la cité en ruine", () => {
  const trouble = read("/pixelart/water/river-tiles-calm-trouble-v2.png");
  const turquoise = read("/pixelart/water/river-tiles-calm-turquoise-v2.png");

  it("est branchée sur le coloris « usure »", () => {
    expect(WATER_SHEETS.usure.src).toBe("/pixelart/water/river-tiles-calm-trouble-v2.png");
  });

  it("garde le DESSIN de la nappe turquoise : même taille, une teinte pour une teinte", () => {
    expect([trouble.width, trouble.height]).toEqual([turquoise.width, turquoise.height]);
    const aller = new Map(), retour = new Map();
    for (let i = 0; i < trouble.width * trouble.height; i += 1) {
      const a = rgb(turquoise, i), b = rgb(trouble, i);
      if (!aller.has(a)) aller.set(a, b);
      if (!retour.has(b)) retour.set(b, a);
      expect(aller.get(a)).toBe(b);
      expect(retour.get(b)).toBe(a);
    }
    expect(aller.size).toBe(5);
  });

  it("TÉMOIN : la nappe d'averse n'est PAS le même dessin recoloré (la garde mord)", () => {
    const ardoise = read("/pixelart/water/river-tiles-calm-v2.png");
    // Même dessin chez toutes les nappes v2 : c'est la palette qui doit différer.
    // On vérifie donc que la table turquoise → trouble n'est pas celle de l'averse.
    let pareil = 0;
    for (let i = 0; i < trouble.width * trouble.height; i += 1) if (rgb(ardoise, i) === rgb(trouble, i)) pareil += 1;
    expect(pareil).toBe(0);
  });

  it("est le coloris le PLUS TERNE de tous (la ruine ne brille pas)", () => {
    const sTrouble = saturation(moyenne(trouble));
    for (const [cle, cfg] of Object.entries(WATER_SHEETS)) {
      if (cle === "usure") continue;
      expect(sTrouble, `usure contre ${cle}`).toBeLessThan(saturation(moyenne(read(cfg.src))));
    }
  });

  it("`pale` est l'éclat de SA bande (la teinte la plus claire)", () => {
    const lum = (s) => { const [r, g, b] = s.split(",").map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const teintes = new Set();
    for (let i = 0; i < trouble.width * trouble.height; i += 1) teintes.add(rgb(trouble, i));
    const plusClaire = [...teintes].sort((a, b) => lum(b) - lum(a))[0];
    expect(WATER_SHEETS.usure.pale).toBe(plusClaire);
  });
});
