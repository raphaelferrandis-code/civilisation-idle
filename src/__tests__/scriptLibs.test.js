// LES ATELIERS COMMUNS DE scripts/lib/ (audit 2026-10-05, SCRIPT-11 et SCRIPT-13).
// OKLab, la cuisson ÷N des bandes, l'atelier PixelLab, la flamme en langues et le
// faux navigateur des harnais étaient recopiés de script en script, et les copies
// avaient divergé. Ils vivent maintenant en un exemplaire ; lors de la mise en
// commun, chaque script a été relancé (ou sa fonction comparée) sur tout le parc :
// mêmes PNG au bit près. Ce test garde le contrat de chaque atelier, plus deux
// petits défauts corrigés au passage :
//   - la hauteur du personnage était mesurée sur `x < fh` (assembleAgentClip) :
//     fausse dès que les frames ne sont pas carrées ;
//   - `--cle` / `--ere` en dernier argument levaient une TypeError (sceneLive,
//     plazaBrazierAnim) ; ils refusent maintenant, sans rien écrire.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { bakeHalf, paletteOf, nearest } from "../../scripts/lib/half.mjs";
import { stripShadow, inkRows, assembleStrip } from "../../scripts/lib/pixellab.mjs";
import { tongueMask, flameDepth, flameTop, flameRampIndex, hash } from "../../scripts/lib/fire.mjs";

const require = createRequire(import.meta.url);
const { oklab, labD2 } = require("../../scripts/lib/oklab.cjs");
const { bakeIcon } = require("../../scripts/lib/iconBake.cjs");
const ROOT = path.resolve(__dirname, "../..");

const img = (w, h, fill) => {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fill(x, y), i = (y * w + x) * 4;
    if (c) { p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = c[3] ?? 255; }
  }
  return p;
};

describe("oklab.cjs", () => {
  it("noir → L 0, blanc → L 1, gris neutre sans chroma", () => {
    expect(oklab(0, 0, 0)[0]).toBeCloseTo(0, 6);
    expect(oklab(255, 255, 255)[0]).toBeCloseTo(1, 4);
    const [, a, b] = oklab(128, 128, 128);
    expect(Math.abs(a) + Math.abs(b)).toBeLessThan(1e-4);
    expect(labD2(oklab(10, 20, 30), oklab(10, 20, 30))).toBe(0);
  });
  it("iconBake : un carré plein rendu à 8 px garde sa teinte, sans en inventer", () => {
    const src = img(32, 32, (x, y) => (x >= 4 && x < 28 && y >= 4 && y < 28 ? [200, 30, 40] : null));
    const { out, dw, dh } = bakeIcon(src, 8, 0.5);
    expect([dw, dh]).toEqual([8, 8]);
    for (let i = 0; i < out.data.length; i += 4) expect([...out.data.subarray(i, i + 4)]).toEqual([200, 30, 40, 255]);
  });
});

describe("half.mjs — la cuisson ÷N", () => {
  it("moyenne prémultipliée rabattue sur la palette, alpha binaire au seuil", () => {
    // 4×2 : bloc gauche = 3 rouges + un bleu TRANSPARENT (couverture 75 % → gardé,
    // et le bleu sans alpha ne teinte rien), bloc droit = 1 rouge sur 4 (25 % → vide).
    const src = img(4, 2, (x, y) => (x === 0 || (x <= 2 && y === 0) ? [220, 20, 20] : x === 1 && y === 1 ? [20, 20, 220, 0] : null));
    const out = bakeHalf(src);
    expect([out.width, out.height]).toEqual([2, 1]);
    expect([...out.data.subarray(0, 4)]).toEqual([220, 20, 20, 255]);
    expect(out.data[7]).toBe(0);
  });
  it("palette imposée (l'attente rabattue sur la marche) et priorité aux braises", () => {
    const src = img(2, 2, (x, y) => (x === 0 && y === 0 ? [255, 160, 0] : [40, 40, 40]));
    expect(nearest([[0, 0, 0], [50, 50, 50]], 41, 41, 41)).toEqual([50, 50, 50]);
    expect([...bakeHalf(src, { pal: [[0, 0, 0], [60, 60, 60]] }).data.subarray(0, 3)]).toEqual([60, 60, 60]);
    const hot = new Set([0xffa000]);
    expect([...bakeHalf(src, { hot, hotShare: 0.2 }).data.subarray(0, 3)]).toEqual([255, 160, 0]);
    expect(paletteOf(src)).toEqual([[255, 160, 0], [40, 40, 40]]);
  });
});

describe("pixellab.mjs", () => {
  it("inkRows mesure sur TOUTE la largeur (frames non carrées)", () => {
    // 10 de large, 4 de haut : l'encre n'est qu'en x = 8, au-delà de x < fh.
    const f = img(10, 4, (x, y) => (x === 8 && y >= 1 ? [0, 0, 0] : null));
    expect(inkRows(f)).toEqual({ top: 1, bot: 3, h: 3 });
  });
  it("assembleStrip colle les images côte à côte", () => {
    const a = img(2, 2, () => [255, 0, 0]), b = img(2, 2, () => [0, 0, 255]);
    const s = assembleStrip([a, b]);
    expect([s.width, s.height]).toEqual([4, 2]);
    expect([...s.data.subarray(12, 16)]).toEqual([0, 0, 255, 255]);
  });
  it("stripShadow ôte le gris qui touche le vide, pas celui du contour", () => {
    // 8×8 : pied noir en x = 2..5, rangées 5-7 ; un gris DEDANS (3, 6), cerné de
    // noir, et un gris d'ombre DEHORS (6, 7), à côté du vide.
    const f = img(8, 8, (x, y) => (y === 7 && x === 6 ? [120, 120, 120] : y === 6 && x === 3 ? [130, 130, 130]
      : y >= 5 && x >= 2 && x <= 5 ? [10, 10, 10] : null));
    expect(stripShadow(f)).toBe(1);
    expect(f.data[(7 * 8 + 6) * 4 + 3]).toBe(0);
    expect(f.data[(6 * 8 + 3) * 4 + 3]).toBe(255);
  });
});

describe("fire.mjs — la flamme en langues", () => {
  it("un masque sous la base, une profondeur croissante vers le cœur, une rampe 2-7", () => {
    const W = 16, H = 16, base = 13;
    const m = tongueMask(W, H, [{ dx: 0, h: 9, w: 3, ph: 0 }], { cx: 8, base, top: 2, breath: 0.16, sway: 1.1 }, 0.25);
    const rows = [...m.keys()].filter((i) => m[i]).map((i) => Math.floor(i / W));
    expect(rows.length).toBeGreaterThan(10);
    expect(Math.max(...rows)).toBe(base);
    expect(flameTop(m, W, base)).toBe(Math.min(...rows));
    expect(Math.min(...rows)).toBeGreaterThanOrEqual(2);
    const d = flameDepth(m, W, H, base);
    expect(Math.max(...d)).toBeGreaterThanOrEqual(2);
    expect(flameRampIndex(1, 0.9, false)).toBe(2);
    expect(flameRampIndex(4, 0.1, true)).toBe(7);
    expect(hash(3, 4, 5)).toBe(hash(3, 4, 5));
  });
});

describe("arguments sans valeur : refus, sans rien écrire", () => {
  const run = (script, args) => new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, "scripts", script), ...args], { cwd: ROOT, timeout: 15000 },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, sortie: `${stdout}${stderr}` }));
  });
  it.each([["sceneLive.mjs", "--cle"], ["plazaBrazierAnim.mjs", "--ere"]])("%s %s", async (script, flag) => {
    const { code, sortie } = await run(script, ["--dry", flag]);
    expect(code).toBe(1);
    expect(sortie).toMatch(new RegExp(`${flag} attend`));
    expect(sortie).not.toMatch(/TypeError/);
  });
});

describe("harnais de la racine — un seul faux navigateur", () => {
  const HARNAIS = ["simulate-ce.js", "sim-10-profils.js", "bench-myths.js", "bench-rupture.js", "bench-crises.js", "bench-plaisirs.js", "bench-temple.js"];
  it.each(HARNAIS)("%s importe scripts/lib/headless.mjs et n'en tient plus de copie", (f) => {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    expect(src).toMatch(/^import "\.\/scripts\/lib\/headless\.mjs";$/m);
    expect(src).not.toMatch(/global(This)?\.(window|document|localStorage)\s*=/);
  });
});
