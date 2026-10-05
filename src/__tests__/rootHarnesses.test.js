// LES HARNAIS DE LA RACINE (audit 2026-10-05, SCRIPT-1 / SCRIPT-2) : simulate-ce,
// sim-10-profils, bench-myths, bench-rupture, sim-idle-impact et simulate-game
// plantaient DÈS L'IMPORT depuis le 20/07 — leur faux `window` n'avait pas
// d'addEventListener, que cloudSave.js appelle au chargement — et simulate-ce /
// sim-10-profils appelaient icarusStakes, retiré du jeu le 04/10. Personne ne l'a
// vu : ils sont hors lint et hors suite. Deux gardes :
//   1. chaque nom qu'un harnais déstructure d'un module du jeu existe encore
//      (un export retiré donnait `undefined`, puis un TypeError au premier appel,
//      parfois des heures de jeu simulé plus tard) ;
//   2. chaque harnais RAPIDE se lance pour de vrai, avec un budget minuscule,
//      dans un dossier temporaire (ils écrivent leurs rapports dans le dossier
//      COURANT : jamais ceux du dépôt), et rend la main avec le code 0.
// bench-temple (~7 s, pas de budget réglable) reste hors de la garde 2 ;
// sim-idle-impact-return ne tourne pas sous Node (import.meta.glob) — SCRIPT-7.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const TOUS = [
  "simulate-ce.js", "sim-10-profils.js", "sim-idle-impact.js", "simulate-game.js",
  "bench-myths.js", "bench-rupture.js", "bench-crises.js", "bench-plaisirs.js", "bench-temple.js",
];

// [fichier, arguments (budget minuscule), rapport attendu dans le dossier courant]
const RAPIDES = [
  ["bench-rupture.js", [], "rupture-impact.md"],
  ["bench-myths.js", [], "myth-impact.md"],
  ["bench-crises.js", ["--hours=0.2"], "crisis-choices-impact.md"],
  ["bench-plaisirs.js", ["--hours=0.2"], "plaisirs-20h.md"],
  ["sim-idle-impact.js", ["--cycles=1", "--grow=60"], "sim-idle-impact.out.json"],
  ["simulate-game.js", ["0.05"], null],
  ["simulate-ce.js", ["--hours=0.05", "--scenario=optimized"], "balance-summary.md"],
  ["sim-10-profils.js", ["--hours=0.05", "--profile=theoricien"], "course-gr1-profils.md"],
];

// Noms déstructurés d'un module du jeu : `const { a, b: c } = await import("./src/…")`
// et `const { … } = mod;` quand `mod = await import("./src/…")`.
function nomsImportes(src) {
  const vars = new Map();
  for (const m of src.matchAll(/const (\w+) = await import\("(\.\/src\/[^"]+)"\)/g)) vars.set(m[1], m[2]);
  const blocs = [];
  for (const m of src.matchAll(/const \{([^}]*)\} = await import\("(\.\/src\/[^"]+)"\)/g)) blocs.push([m[2], m[1]]);
  for (const m of src.matchAll(/const \{([^}]*)\} = (\w+);/g)) if (vars.has(m[2])) blocs.push([vars.get(m[2]), m[1]]);
  return blocs.flatMap(([mod, liste]) => liste
    .replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    .split(",").map((s) => s.split(":")[0].trim()).filter(Boolean)
    .map((nom) => ({ mod, nom })));
}

describe("harnais de la racine — les noms importés existent", () => {
  it.each(TOUS)("%s", async (fichier) => {
    const noms = nomsImportes(read(fichier));
    expect(noms.length, "aucun import du jeu reconnu : le motif a changé ?").toBeGreaterThan(0);
    const manquants = [];
    for (const { mod, nom } of noms) {
      const ns = await import(/* @vite-ignore */ path.join(ROOT, mod));
      if (!(nom in ns)) manquants.push(`${nom} (${mod})`);
    }
    expect(manquants, `exports disparus : ${manquants.join(", ")}`).toEqual([]);
  });
});

describe("harnais de la racine — ils se chargent, jouent et rendent la main", () => {
  let dossier;
  beforeAll(() => { dossier = fs.mkdtempSync(path.join(os.tmpdir(), "civ-harnais-")); });
  afterAll(() => { fs.rmSync(dossier, { recursive: true, force: true }); });

  it.concurrent.each(RAPIDES)("%s", async (fichier, args, rapport) => {
    // Un sous-dossier par harnais : deux rapports homonymes ne se marchent pas dessus.
    const cwd = fs.mkdtempSync(path.join(dossier, `${path.basename(fichier, ".js")}-`));
    // Délai < testTimeout (30 s, vite.config.js) : un harnais qui boucle est tué
    // par execFile et le test échoue avec sa sortie, au lieu de rester orphelin.
    const { code, sortie } = await new Promise((resolve) => {
      execFile(process.execPath, [path.join(ROOT, fichier), ...args], { cwd, timeout: 25000, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout, stderr) => resolve({ code: err ? (err.code ?? err.signal ?? 1) : 0, sortie: `${stdout}\n${stderr}` }));
    });
    expect(code, sortie.slice(-2000)).toBe(0);
    if (rapport) expect(fs.existsSync(path.join(cwd, rapport)), `${rapport} non écrit`).toBe(true);
  });
});
