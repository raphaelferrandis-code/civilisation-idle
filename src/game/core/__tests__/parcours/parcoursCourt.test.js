// PARCOURS COURT, dans la suite par défaut (audit 2026-10-05, TEST-1). La version
// rapide et déterministe des scénarios de mythesActe3.test.js : horloge
// virtuelle, hasard à graine, save d'Acte III figée — le même résultat sur tous
// les postes, en quelques centaines de millisecondes.
//   Atlas : 12 épaulées en cliquant au premier tick où ÉPAULER se rallume (le
//           blocage du 05/10, BUG-2), en doctrine automatique et en « ask » avec
//           des fenêtres de crise de 4 s ;
//   Sisyphe (rejoué) et le Phénix (après Icare) : les verbes des Mythes et
//           l'effondrement forcé des renaissances.
// Les Atrides (plusieurs essais, ~2 s) et la partie complète restent derrière
// `npm run test:parcours`.
import { describe, it, expect, beforeAll } from "vitest";
import { setupEnv, restoreEnv } from "./harness.js";
import { runMythScenario } from "./scenarios.js";

const FATAL = /throw|numeric|roundtrip|BLOCAGE/;

beforeAll(async () => {
  // Charge les modules du jeu une fois, hors du chrono des tests.
  await setupEnv();
  restoreEnv();
});

describe("parcours court depuis la save d'Acte III", () => {
  // [Mythe, doctrine, durée d'une fenêtre, Mythes joués avant, fenêtres de crise attendues au moins]
  it.each([
    ["mythe_d_atlas", "auto", 0, [], 0],
    ["mythe_d_atlas", "ask", 4000, [], 1],
    ["mythe_de_sisyphe", "ask", 4000, [], 0],
    ["mythe_du_phenix", "auto", 0, ["mythe_d_icare"], 0],
  ])("%s — doctrine %s, fenêtres de %i ms", async (mythId, doctrine, dialogMs, prelude, minDialogs) => {
    const res = await runMythScenario(mythId, { doctrine, dialogMs, prelude, maxSec: 1800 });
    expect(res.anomalies.filter((a) => FATAL.test(a.kind)), res.tail).toEqual([]);
    expect(res.done, `${mythId} non accompli en ${Math.round(res.sec)} s virtuelles\n${res.tail}`).toBe(true);
    expect(res.attempts).toBe(1);
    // En « ask », les crises ont bien ouvert leurs fenêtres (le scénario n'est pas vide).
    expect(Object.values(res.dialogs).reduce((sum, n) => sum + n, 0)).toBeGreaterThanOrEqual(minDialogs);
  });
});
