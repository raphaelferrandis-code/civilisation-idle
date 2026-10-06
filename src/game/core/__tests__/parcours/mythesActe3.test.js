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
// Le Phénix se joue ici SANS Icare avant lui : à 3 min murales, le joueur scripté
// n'avait jamais porté la Rupture à 100 % dans la fenêtre (3 h virtuelles
// d'essais), l'Aile d'Icare était une dépendance cachée. Depuis BUG-38 (fenêtre de
// 4 min de jeu non pausé), il renaît seul (le parcours court, lui, garde l'ordre
// de l'Acte III : Icare puis le Phénix).
const CASES = [];
for (const mythId of ["mythe_d_atlas", "mythe_du_phenix", "mythe_de_sisyphe", "mythe_atrides"]) {
  CASES.push([mythId, "auto", 0]);
  CASES.push([mythId, "ask", 4000]);
}

describe.runIf(PARCOURS_ON)("Mythes de l'Acte III, clics fidèles à l'interface", () => {
  it.each(CASES)("%s — doctrine %s, fenêtres de %i ms", async (mythId, doctrine, dialogMs) => {
    const res = await runMythScenario(mythId, { doctrine, dialogMs, maxSec: 2 * 3600 });
    const fatal = res.anomalies.filter((a) => FATAL.test(a.kind));
    expect(fatal, res.tail).toEqual([]);
    expect(res.done, `${mythId} non accompli en ${Math.round(res.sec)} s virtuelles (${res.attempts} essais)\n${res.tail}`).toBe(true);
    // En « ask », les crises ont bien ouvert leurs fenêtres (Sisyphe se joue en
    // une vingtaine de secondes, avant toute crise).
    if (doctrine === "ask" && mythId !== "mythe_de_sisyphe") {
      expect(Object.values(res.dialogs).reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);
    }
  });

  // L'ÂGE D'OR, AUTOMATES D'ACHAT ALLUMÉS (trouvaille du harnais, AGE-OR-AUTOMATES) :
  // le lot 5 faisait acheter à l'automate le moins cher ABORDABLE — l'Or partait au
  // fil de l'eau, aucune caravane n'était plus jamais payable (0 marché en 3 h).
  // L'automate attend de nouveau que le moins cher soit payable ; le joueur scripté
  // ne coupe plus rien pendant le pacte.
  it("Âge d'Or — automates d'achat allumés, les huit marchés se concluent", async () => {
    const res = await runMythScenario("mythe_age_or", { doctrine: "auto", maxSec: 3 * 3600 });
    expect(res.anomalies.filter((a) => FATAL.test(a.kind)), res.tail).toEqual([]);
    expect(res.done, `Âge d'Or non accompli en ${Math.round(res.sec)} s virtuelles\n${res.tail}`).toBe(true);
  });
});
