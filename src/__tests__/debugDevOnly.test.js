// MENU DE TRICHE HORS DU BUILD LIVRÉ (audit 2026-10-05, DEV-1). Taper d-e-b-u-g
// n'importe où — même dans le champ du nom de la cité — ouvrait « Mode debug »
// dans le .exe, sur Steam et sur le web (+1 G ruines, cycles, Faveur…). Ce test
// garde le câblage qui permet à Vite de TOUT retirer en production : fenêtre
// chargée sous import.meta.env.DEV, outils de triche hors de main.js (que tout
// le jeu importe). La vérification de fond reste le build : aucun morceau
// DebugDialog-*.js dans dist/assets.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const src = (rel) => readFileSync(path.resolve(__dirname, "..", rel), "utf8");

describe("menu de triche réservé au dev", () => {
  it("App.jsx ne charge la fenêtre qu'en dev, et ne la rend que si elle existe", () => {
    const app = src("App.jsx");
    // Le SEUL import de la fenêtre, sous la garde de build.
    const imports = app.match(/import\(['"]\.\/components\/dialogs\/DebugDialog\.jsx['"]\)/g) || [];
    expect(imports).toHaveLength(1);
    expect(app).toMatch(/const DebugDialog = import\.meta\.env\.DEV \? lazy\(\(\) => import\(['"]\.\/components\/dialogs\/DebugDialog\.jsx['"]\)\) : null;/);
    expect(app).toMatch(/\{DebugDialog && isDebugOpen && <DebugDialog/);
    // La séquence clavier : sous la même garde, et par feedDebugSequence (qui
    // ignore les frappes d'un champ de saisie).
    expect(app).toMatch(/if \(import\.meta\.env\.DEV\) \{\s*const fed = feedDebugSequence\(/);
    expect(app).not.toMatch(/debugSequence = `\$\{debugSequence\}/);
  });

  it("les outils de triche ne vivent plus dans main.js, et seul DebugDialog les importe", () => {
    expect(src("game/core/main.js")).not.toMatch(/export function (addDebug|debugBuyEarlyRuins)/);
    const importeurs = readdirSync(path.resolve(__dirname, ".."), { recursive: true })
      .map((f) => String(f).replace(/\\/g, "/"))
      .filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.includes("__tests__"))
      .filter((f) => /debugTools(\.js)?['"]/.test(src(f)));
    expect(importeurs).toEqual(["components/dialogs/DebugDialog.jsx"]);
  });
});
