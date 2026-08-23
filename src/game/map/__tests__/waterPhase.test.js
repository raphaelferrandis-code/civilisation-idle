// Phase de la surface d'eau animée du fleuve (stepWaterPhase / drawIsoWaterTiles).
// Régression 2026-07-22, retour Raph : « l'animation quand il pleut est accélérée,
// mais surtout est à l'envers, et une fois qu'il a plu celle qui revient saccade ».
//
// Cause : la phase valait `t * fps` avec un fps qui suit la météo. Un produit
// temps ABSOLU × vitesse VARIABLE saute dès que la vitesse bouge, et RECULE quand
// elle diminue — d'où l'animation à l'envers pendant que l'averse faiblit. Le
// premier correctif (`t % period`) ne changeait rien : `period` dérivait de la
// vitesse, donc sautait aussi. La phase est désormais INTÉGRÉE pas à pas.
import { describe, it, expect } from "vitest";
import { stepWaterPhase, waterTilesTune } from "../iso/isoRiver.js";

// ⚠ LU DEPUIS LE RÉGLAGE, pas recopié. Les valeurs bougent à l'oreille (fps 2,5
// → 3,5 → 3 le 2026-07-22, puis 1,8 le 2026-07-30 avec la bande calme) : des
// constantes en dur auraient continué à passer en décrivant un rythme mort.
const FRAMES = 8;
const SPATIAL = 16 * waterTilesTune.worldPx;              // période spatiale, en px monde
const FPS_FAIR = waterTilesTune.fair.fps, FPS_RAIN = waterTilesTune.rain.fps;
const DR_FAIR = waterTilesTune.fair.drift, DR_RAIN = waterTilesTune.rain.drift;

// Avance la phase sur une rampe de météo, en pas de 1/60 s, et renvoie la suite
// des phases de frame vues (déroulées : on annule le rebouclage du modulo).
function run(rainAt, seconds = 8, dtStep = 1 / 60) {
  let st = { at: -1, frame: 0, drift: 0 };
  const unwrapped = [];
  let turns = 0, prev = 0;
  for (let t = 0; t <= seconds; t += dtStep) {
    const rf = rainAt(t);
    const fps = FPS_FAIR + (FPS_RAIN - FPS_FAIR) * rf;
    const drift = DR_FAIR + (DR_RAIN - DR_FAIR) * rf;
    st = stepWaterPhase(st, t, fps, drift, SPATIAL);
    if (st.frame < prev - FRAMES / 2) turns += 1;      // rebouclage du modulo
    unwrapped.push(st.frame + turns * FRAMES);
    prev = st.frame;
  }
  return unwrapped;
}

// La plus grande marche entre deux pas consécutifs.
const biggestStep = (xs) => xs.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - xs[i])), 0);

describe("phase de l'eau animée sous météo variable", () => {
  it("n'avance JAMAIS à reculons quand l'averse faiblit (le bug « à l'envers »)", () => {
    // Averse qui monte puis retombe — c'est la retombée qui inversait l'animation.
    const xs = run((t) => (t < 4 ? Math.min(1, t / 2) : Math.max(0, 1 - (t - 4) / 2)));
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
  });

  it("reste continue quand la vitesse change (le bug « ça saccade »)", () => {
    // Averse brutale : 0 → 1 d'un coup, le pire cas pour une phase recalculée.
    const xs = run((t) => (t < 4 ? 0 : 1));
    // Un pas légitime vaut fps / 60 image ; on tolère le double.
    expect(biggestStep(xs)).toBeLessThan(2 * FPS_RAIN / 60);
  });

  it("TÉMOIN : l'ancienne formule `t * fps` reculait ET sautait sur la même rampe", () => {
    // Sans ce témoin les deux tests ci-dessus seraient vacants : ils passeraient
    // aussi bien sur du code qui n'a jamais eu le bug. On rejoue donc l'ANCIEN
    // calcul sur exactement la même averse, et on exige qu'il échoue.
    const avant = (rainAt) => {
      const xs = [];
      for (let t = 0; t <= 8; t += 1 / 60) {
        const fps = FPS_FAIR + (FPS_RAIN - FPS_FAIR) * rainAt(t);
        xs.push(t * fps);                     // ← la formule d'avant
      }
      return xs;
    };
    // 1) AVERSE QUI FAIBLIT (rampe douce) : la phase RECULE → « à l'envers ».
    //    C'est le symptôme dominant, et il n'a pas besoin d'une marche brutale.
    const douce = avant((t) => (t < 4 ? Math.min(1, t / 2) : Math.max(0, 1 - (t - 4) / 2)));
    expect(douce.slice(1).some((v, i) => v < douce[i] - 1e-9)).toBe(true);
    // 2) CHANGEMENT FRANC : marche de plusieurs images d'un coup → « ça saccade ».
    const franche = avant((t) => (t < 4 ? 0 : 1));
    expect(biggestStep(franche)).toBeGreaterThan(FRAMES);
  });

  it("va nettement plus vite sous l'averse qu'au beau fixe", () => {
    // Marge volontairement lâche : le rythme de base est un réglage d'oreille
    // (2,5 → 3,5 → 3 le 2026-07-22, au jugé de Raph), ce qui rapproche les deux
    // régimes. Ce qu'on protège ici, c'est que l'averse reste franchement
    // distincte du beau temps, pas une valeur de fps précise.
    const beau = run(() => 0), pluie = run(() => 1);
    const rapport = pluie[pluie.length - 1] / beau[beau.length - 1];
    expect(rapport).toBeGreaterThan(1.5);
  });

  it("borne un retour d'onglet : un trou de 30 s ne fait pas bondir la nappe", () => {
    let st = { at: -1, frame: 0, drift: 0 };
    st = stepWaterPhase(st, 0, FPS_FAIR, DR_FAIR, SPATIAL);
    const avant = st.frame;
    st = stepWaterPhase(st, 30, FPS_FAIR, DR_FAIR, SPATIAL);   // onglet caché 30 s
    // dt est plafonné à 0,25 s → au plus 0,625 image, pas 75.
    expect(st.frame - avant).toBeLessThanOrEqual(FPS_FAIR * 0.25 + 1e-9);
  });

  it("garde la phase dans ses bornes (jamais de dérive numérique qui s'accumule)", () => {
    let st = { at: -1, frame: 0, drift: 0 };
    for (let t = 0; t <= 600; t += 0.1) st = stepWaterPhase(st, t, FPS_RAIN, DR_RAIN, SPATIAL);
    expect(st.frame).toBeGreaterThanOrEqual(0);
    expect(st.frame).toBeLessThan(FRAMES);
    expect(st.drift).toBeGreaterThanOrEqual(0);
    expect(st.drift).toBeLessThan(SPATIAL);
  });
});
