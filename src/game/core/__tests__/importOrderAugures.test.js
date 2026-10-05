"use strict";
// ORDRE D'ÉVALUATION DES MODULES (audit du 05/10, STRUCT-1).
// data/myths.js prenait `log` dans le baril core/actions.js, ce qui refermait un
// cycle de 43 modules : importer actions/augures.js EN PREMIER évaluait
// templeAutomation.js (via mechanics → shared → myths → actions.js) avant la fin
// d'augures.js, et `Object.keys(AUGURY_RITES)` au niveau module levait une
// ReferenceError (TDZ) — un écran blanc au démarrage si un composant chargé tôt
// importait augures.js directement. `log` vit désormais dans la feuille core/log.js.
// Le PREMIER import du fichier (après vitest, qui ne charge rien du jeu) est
// augures.js : si le cycle revient, le fichier échoue dès son chargement.
import { AUGURY_RITES } from "../actions/augures.js";
import { describe, it, expect } from "vitest";
import { log } from "../log.js";
import { log as logFromBarrel } from "../actions.js";
import { state } from "../state.js";

describe("ordre d'import du cœur", () => {
  it("actions/augures.js se charge seul, en premier, sans TDZ", () => {
    expect(Object.keys(AUGURY_RITES).length).toBeGreaterThan(0);
  });

  it("le baril actions.js réexporte le même log que la feuille core/log.js", () => {
    expect(logFromBarrel).toBe(log);
    const before = (state.history || []).length;
    log("essai");
    expect(state.history.at(-1)).toBe("essai");
    expect(state.history.length).toBe(Math.min(48, before + 1));
  });
});
