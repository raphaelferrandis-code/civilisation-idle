"use strict";
// « Tout acheter » du clavier et du bouton (audit du 05/10, BUG-79, décision de
// Raph : c). En fin de partie, une pression sur E achetait jusqu'à 10 000
// bâtiments d'un trait (gel de 1,5 à 2,1 s mesuré en jeu) et en laissait
// d'abordables. La passe se fait maintenant par tranches de ~16 ms enchaînées
// d'une image à l'autre, jusqu'au bout, avec UN float et UNE ligne de Chronique.
// Aucun chronomètre réel : l'horloge des tranches est simulée (1 ms par lecture).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, defaultState, invalidateRenderCache, setGamePaused } from "../state.js";
import { D } from "../num.js";
import { buyAllAffordable, buyAllAffordableChained } from "../actions/building.js";
import { registerOutcomeFloats } from "../outcomeFloat.js";
import { FIXED_NOW } from "./fixtures.js";

function citeRiche(exp) {
  setState(defaultState());
  state.cycles = 12;
  const v = D(`1e${exp}`);
  for (const k of ["food", "gold", "knowledge", "infrastructure", "population"]) state[k] = v;
  state.cyclePeaks = { population: v, food: v, gold: v, knowledge: v, infrastructure: v, eraIndex: 10 };
  invalidateRenderCache("all");
}
const empreinte = () => JSON.stringify({
  b: state.buildings, f: String(state.food), g: String(state.gold), k: String(state.knowledge),
  i: String(state.infrastructure), lp: state.lifetimePurchases, rw: state.roadWorks
});
const lignesProgramme = () => (state.history || []).filter((l) => l.includes("programme de construction")).length;

let floats;
let unregister;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(FIXED_NOW);
  floats = [];
  unregister = registerOutcomeFloats((f) => floats.push(f));
  // Horloge des tranches : chaque lecture avance d'une milliseconde, une
  // tranche fait donc une quinzaine d'achats.
  let t = 0;
  vi.spyOn(performance, "now").mockImplementation(() => (t += 1));
});
afterEach(() => {
  unregister();
  setGamePaused(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BUG-79 — « Tout acheter » en tranches, d'une image à l'autre", () => {
  it("achète TOUT, comme l'appel synchrone, avec un seul float et une seule ligne", async () => {
    citeRiche(30);
    const nRef = buyAllAffordable();
    const ref = empreinte();
    expect(nRef).toBeGreaterThan(1000);

    citeRiche(30);
    floats.length = 0;
    expect(buyAllAffordableChained()).toBe(true);
    // La première tranche est passée, pas toute la passe : rien n'est encore dit.
    expect(state.lifetimePurchases || 0).toBeGreaterThan(0);
    expect(state.lifetimePurchases || 0).toBeLessThan(nRef);
    expect(floats).toHaveLength(0);
    expect(lignesProgramme()).toBe(0);
    // Une pression pendant la passe ne la relance pas.
    expect(buyAllAffordableChained()).toBe(false);

    await vi.runAllTimersAsync();
    expect(empreinte()).toBe(ref);
    expect(floats).toHaveLength(1);
    expect(lignesProgramme()).toBe(1);
    // La passe est finie : une nouvelle pression repart (et ne trouve plus rien).
    expect(buyAllAffordableChained()).toBe(true);
  });

  it("le gel moteur, revérifié à chaque tranche, arrête la passe et dit ce qui a été bâti", async () => {
    citeRiche(30);
    expect(buyAllAffordableChained()).toBe(true);
    const apresPremiere = state.lifetimePurchases;
    setGamePaused(true); // un dialogue s'ouvre entre deux images
    await vi.runAllTimersAsync();
    expect(state.lifetimePurchases).toBe(apresPremiere);
    expect(floats).toHaveLength(1);
    expect(floats[0].label).toContain(String(apresPremiere));
    expect(lignesProgramme()).toBe(1);
    // La passe arrêtée libère la touche.
    setGamePaused(false);
    expect(buyAllAffordableChained()).toBe(true);
  });
});
