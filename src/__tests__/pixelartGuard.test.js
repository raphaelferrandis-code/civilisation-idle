// GARDE-FOUS DES PASSES DE PALETTE EN LOT (audit 2026-10-05, SCRIPT-9).
// quantize.cjs et remapPalette.mjs avaient chacun leur liste d'exclusions, et les
// deux dataient : `ruins` ne couvrait pas `ruins-tree` (comparaison au nom exact),
// places/ et boutique/ n'y étaient pas, et un passage sur public/pixelart aurait
// réécrit 166 PNG qui dépassent le plafond PAR CHOIX (la fresque de l'Arbre, ses
// emblèmes — bakeRuinsEmblems.mjs lève une erreur si un ton disparaît —, les
// scènes de la Boutique, les enseignes néon). Les deux scripts passent désormais
// par scripts/lib/pixelartGuard.cjs. On vérifie la garde elle-même, puis son
// BRANCHEMENT dans les deux scripts, sans jamais leur laisser une chance d'écrire
// dans public/ : refus testé sur un dossier VIDE, parcours testé en --dry hors de
// public/.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, "../..");
const { PIXELART, SKIP_DIRS, batchPngs, batchRefusal } = require("../../scripts/lib/pixelartGuard.cjs");

const rel = (p) => path.relative(PIXELART, p).split(path.sep).join("/");

describe("pixelartGuard — ce qu'un lot peut réécrire", () => {
  it("le parcours saute l'art peint ou calibré, les feux et la fresque", () => {
    // Les dossiers visés existent : sinon le test ne prouverait rien. Des dossiers
    // SUIVIS par git (un dossier vidé n'existe pas dans un clone neuf, la CI) :
    // iso/anim/ est parti dans art/references-ab/ (MORT-12), les fontaines
    // livrées et leurs zones vivent dans iso/plaza/anim/.
    for (const d of ["ruins-tree", "places", "boutique", "ruins", "ui", "iso/plaza/anim"]) {
      expect(fs.existsSync(path.join(PIXELART, d)), d).toBe(true);
    }
    const tout = batchPngs(PIXELART).map(rel);
    expect(tout.length).toBeGreaterThan(1000);           // le parcours descend bien
    expect(tout.some((f) => f.startsWith("agents/inhabitants/"))).toBe(true);
    const fautifs = tout.filter((f) => /(^|\/)(ruins|ruins-tree|places|boutique|prestige|ui|wonders|anim|_orig|_archive)\//.test(f)
      || /-torch-|-fire\.png$/.test(f) || f.endsWith("tree-base.png"));
    expect(fautifs).toEqual([]);
  });

  it("`ruins` ne couvre pas `ruins-tree` : les deux sont listés", () => {
    expect(SKIP_DIRS).toEqual(expect.arrayContaining(["ruins", "ruins-tree", "places", "boutique"]));
  });

  it("refuse tout dossier de public/pixelart, accepte un dossier de travail", () => {
    expect(batchRefusal(PIXELART)).toMatch(/PARENT/);
    expect(batchRefusal(path.join(PIXELART, "iso"))).toMatch(/LIVRÉ/);
    expect(batchRefusal(path.join(PIXELART, "agents", "inhabitants"))).toMatch(/LIVRÉ/);
    expect(batchRefusal(path.join(PIXELART, "ruins-tree"))).toMatch(/protégé \(ruins-tree\/\)/);
    expect(batchRefusal(path.join(PIXELART, "ui", "ruins"))).toMatch(/protégé/);
    const travail = fs.mkdtempSync(path.join(os.tmpdir(), "civ-garde-"));
    try { expect(batchRefusal(travail)).toBeNull(); } finally { fs.rmSync(travail, { recursive: true, force: true }); }
  });
});

// Un PNG de 64 teintes (8×8, une par pixel) : au-dessus de tout plafond.
function png64(file) {
  const p = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < 64; i += 1) p.data.set([i * 4, 255 - i * 4, (i * 37) % 256, 255], i * 4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(p));
}

const lancer = (script, args) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(ROOT, "scripts", script), ...args], { cwd: ROOT, timeout: 20000 },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, sortie: `${stdout}\n${stderr}` }));
});

describe("quantize.cjs et remapPalette.mjs passent par la garde commune", () => {
  let vide, travail;
  beforeAll(() => {
    // Dossier VIDE dans public/pixelart : si le refus sautait, le lot n'y trouverait
    // rien à écrire — le test ne peut pas abîmer l'art livré.
    vide = fs.mkdtempSync(path.join(PIXELART, "_garde-test-"));
    travail = fs.mkdtempSync(path.join(os.tmpdir(), "civ-lot-"));
    png64(path.join(travail, "neuf.png"));
    png64(path.join(travail, "rioter-man-torch-east.png"));
    png64(path.join(travail, "ui", "icone.png"));
    png64(path.join(travail, "anim", "fontaine.png"));
  });
  afterAll(() => {
    fs.rmSync(vide, { recursive: true, force: true });
    fs.rmSync(travail, { recursive: true, force: true });
  });

  it.concurrent.each([
    ["quantize.cjs", (d) => [d]],
    ["remapPalette.mjs", (d) => ["--dir", d]],
  ])("%s refuse un dossier de public/pixelart sans --force", async (script, args) => {
    const { code, sortie } = await lancer(script, args(vide));
    expect(code, sortie).toBe(1);
    expect(sortie).toMatch(/REFUSÉ/);
  });

  it.concurrent.each([
    ["quantize.cjs", (d) => [d, "--dry"]],
    ["remapPalette.mjs", (d) => ["--dir", d, "--dry"]],
  ])("%s ne retient, dans un lot, ni les feux ni ui/ ni anim/", async (script, args) => {
    const { code, sortie } = await lancer(script, args(travail));
    expect(code, sortie).toBe(0);
    expect(sortie).toMatch(/neuf\.png/);
    expect(sortie).not.toMatch(/torch|icone\.png|fontaine\.png/);
  });
});
