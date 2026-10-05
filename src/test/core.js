// Aides partagées des tests du CŒUR (audit 2026-10-05, TEST-9).
//
// Chacune vivait en deux à sept copies, une par fichier : une correction faite dans
// l'une ne profitait pas aux autres. Les données (MID_GAME_FIXTURE, FARM_FIXTURE,
// FIXED_NOW) restent dans src/game/core/__tests__/fixtures.js, qui n'importe rien ;
// ici, ce qui a besoin de l'état du jeu ou de Vitest.
import { vi } from "vitest";
import { state, hydrateState } from "../game/core/state.js";
import { CRISIS_EVENTS } from "../game/data/world.js";
import { FARM_FIXTURE } from "../game/core/__tests__/fixtures.js";

// Simule un cycle save → JSON.parse → hydrateState, comme un F5 du joueur.
export const roundTrip = (s) => hydrateState(JSON.parse(JSON.stringify(s)));

// Neutralise les crises NARRATIVES (25/50/75 %) de l'état courant : tous les paliers
// déjà marqués, checkCrisisThresholds ne tire plus rien — ni effet, ni dialogue
// (openChoiceDialog, absent en environnement de test). Isole ainsi le déclencheur
// terminal, ou un tick sans aléa de crise.
export function neutralizeCrises() {
  state.crisisThresholds = Object.fromEntries(CRISIS_EVENTS.map((e) => [e.id, true]));
}

// L'état de FARM HORS-LIGNE hydraté (cf. FARM_FIXTURE), sur une copie FRAÎCHE : un
// test qui modifie ses sous-objets (state.upgrades…) ne fuit pas dans le suivant.
export const farmState = (overrides = {}) => hydrateState({ ...structuredClone(FARM_FIXTURE), ...overrides });

// payRound(x) = floor(x), +1 si le tirage u tombe sous la partie fractionnaire
// (E[payRound(x)] = x). Sert à prévoir un gain quand on pilote Math.random.
export const payRoundAt = (x, u) => Math.floor(x) + (u < x - Math.floor(x) ? 1 : 0);

// Pilote Math.random : les valeurs de `seq` dans l'ordre, puis `rest` pour tout le
// reste. Aux osselets, ordre des tirages d'un jet : l'issue, puis (Vénus seulement)
// le carré de six, puis les os (cosmétiques), puis l'arrondi payRound d'un gain.
export function withRandom(seq, rest, fn) {
  const queue = [...seq];
  const spy = vi.spyOn(Math, "random").mockImplementation(() => (queue.length ? queue.shift() : rest));
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}
