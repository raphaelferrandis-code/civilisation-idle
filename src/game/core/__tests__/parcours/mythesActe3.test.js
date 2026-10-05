// MYTHES DE L'ACTE III, JOUÉS COMME À L'ÉCRAN (audit 2026-10-05, TEST-1, volet 1).
// Atlas, Phénix, Sisyphe et les Atrides depuis la save d'Acte III figée, en
// doctrine de crise automatique ET en « ask » avec des fenêtres de 4 s : chacun
// doit s'accomplir, sans NaN ni champ perdu à l'aller-retour de sauvegarde. Le
// harnais de l'audit résolvait les fenêtres en temps nul et cliquait ÉPAULER à la
// milliseconde : il a conclu à tort qu'Atlas était impossible pour tout joueur.
//
// Hors de la suite par défaut : `npm run test:parcours` (ou PARCOURS=1 avec
// --testTimeout=0). PC_OUT=<dossier> y garde les journaux.
import { describe, it, expect } from "vitest";
import { PARCOURS_ON } from "./harness.js";
import { runMythScenario } from "./scenarios.js";

const FATAL = /throw|numeric|roundtrip|BLOCAGE/;
// Le Phénix se joue après Icare, comme dans l'ordre de l'Acte III : sans l'Aile,
// le joueur scripté n'a jamais porté la Rupture à 100 % dans la fenêtre de 3 min
// (3 h virtuelles d'essais, question posée à Raph).
const PRELUDE = { mythe_du_phenix: ["mythe_d_icare"] };
const CASES = [];
for (const mythId of ["mythe_d_atlas", "mythe_du_phenix", "mythe_de_sisyphe", "mythe_atrides"]) {
  CASES.push([mythId, "auto", 0]);
  CASES.push([mythId, "ask", 4000]);
}

describe.runIf(PARCOURS_ON)("Mythes de l'Acte III, clics fidèles à l'interface", () => {
  it.each(CASES)("%s — doctrine %s, fenêtres de %i ms", async (mythId, doctrine, dialogMs) => {
    const res = await runMythScenario(mythId, { doctrine, dialogMs, maxSec: 2 * 3600, prelude: PRELUDE[mythId] || [] });
    const fatal = res.anomalies.filter((a) => FATAL.test(a.kind));
    expect(fatal, res.tail).toEqual([]);
    expect(res.done, `${mythId} non accompli en ${Math.round(res.sec)} s virtuelles (${res.attempts} essais)\n${res.tail}`).toBe(true);
    // En « ask », les crises ont bien ouvert leurs fenêtres (Sisyphe se joue en
    // une vingtaine de secondes, avant toute crise).
    if (doctrine === "ask" && mythId !== "mythe_de_sisyphe") {
      expect(Object.values(res.dialogs).reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);
    }
  });
});
