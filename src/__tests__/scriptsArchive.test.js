// LES FABRICANTS HISTORIQUES (audit 2026-10-05, SCRIPT-4). Une vingtaine de scripts
// de scripts/ écrivaient sans garde dans public/ de l'art retouché depuis (remap
// OKLab, dé-liserage, bandes -half…), et fetchProps bouclait ~50 h sur des ids
// PixelLab expirés. Ils sont rangés dans scripts/_archive/ comme trace de
// provenance, et chacun REFUSE de tourner sans CE_RELANCER_ARCHIVE=1 ; seul
// fetchGroundTiles.mjs reste en place, avec un refus d'écraser une tuile existante
// sans --force. Ce test garde les deux refus :
//   1. chaque script archivé commence par la garde, et n'importe aucun module local
//      (un `import` statique s'évalue AVANT la garde : il ne doit rien faire) ;
//      deux d'entre eux (un .mjs, le .cjs) sont lancés pour de vrai ;
//   2. fetchGroundTiles refuse une matière déjà en place, AVANT tout téléchargement.
// Tous les lancements se font dans un dossier temporaire : leurs chemins sont
// relatifs au dossier courant, une garde cassée n'écrirait jamais dans public/.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const ARCHIVE = path.join(ROOT, "scripts", "_archive");
const GARDE = "if (process.env.CE_RELANCER_ARCHIVE !== '1') {";

const lancer = (file, args, cwd) => new Promise((resolve) => {
  const env = { ...process.env };
  delete env.CE_RELANCER_ARCHIVE;
  execFile(process.execPath, [file, ...args], { cwd, env, timeout: 10000 },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? err.signal) : 0, sortie: `${stdout}${stderr}` }));
});

describe("scripts/_archive — les fabricants historiques refusent de tourner", () => {
  const scripts = fs.readdirSync(ARCHIVE).filter((f) => /\.(mjs|cjs)$/.test(f));
  let dossier;
  beforeAll(() => { dossier = fs.mkdtempSync(path.join(os.tmpdir(), "civ-archive-")); });
  afterAll(() => { fs.rmSync(dossier, { recursive: true, force: true }); });

  it("la garde est la première instruction de chaque script, sans import local", () => {
    expect(scripts.length).toBeGreaterThanOrEqual(22);
    for (const f of scripts) {
      const lignes = fs.readFileSync(path.join(ARCHIVE, f), "utf8").split(/\r?\n/);
      const i = lignes.findIndex((l) => l.trim() && !l.trim().startsWith("//"));
      expect(lignes[i], f).toBe(GARDE);
      expect(lignes.slice(i, i + 4).join("\n"), f).toMatch(/process\.exit\(1\)/);
      expect(lignes.filter((l) => /^import .* from ['"]\./.test(l)), f).toEqual([]);
    }
  });

  it.concurrent.each(["fetchProps.mjs", "isoToneDown.cjs"])("%s sort en code 1 sans rien écrire", async (f) => {
    const cwd = fs.mkdtempSync(path.join(dossier, "run-"));
    const { code, sortie } = await lancer(path.join(ARCHIVE, f), [], cwd);
    expect(code, sortie).toBe(1);
    expect(sortie).toMatch(/Script archivé/);
    expect(fs.readdirSync(cwd)).toEqual([]);
  });

  it("fetchGroundTiles refuse d'écraser une tuile en place, sans réseau", async () => {
    // `iso-sand` : le filtre n'attrape que cette matière ; une variante présente suffit.
    const cwd = fs.mkdtempSync(path.join(dossier, "sol-"));
    const tuile = path.join(cwd, "public/pixelart/iso/iso-sand-2.png");
    fs.mkdirSync(path.dirname(tuile), { recursive: true });
    fs.writeFileSync(tuile, "retouchée à la main");
    const { code, sortie } = await lancer(path.join(ROOT, "scripts/fetchGroundTiles.mjs"), ["--equalize", "iso-sand"], cwd);
    expect(code, sortie).toBe(2);
    expect(sortie).toMatch(/iso-sand — 1 tuile\(s\) déjà en place \(iso-sand-2\.png\)/);
    expect(fs.readFileSync(tuile, "utf8")).toBe("retouchée à la main");
  });
});
