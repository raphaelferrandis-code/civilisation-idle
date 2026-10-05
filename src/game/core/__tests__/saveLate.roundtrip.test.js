import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";

import { hydrateState, invalidateRenderCache, setState, defaultState } from "../state.js";
import { looksLikeSave, isFutureSave } from "../saveKey.js";
import { D } from "../num.js";

// ── UNE VRAIE SAUVEGARDE DE FIN DE PARTIE, RECHARGÉE ───────────────────────────
// Audit du 05/10 (TEST-4). Le seul aller-retour générique (state.hydration) compare
// les CLÉS d'un defaultState ; les autres saves de test sont des objets de quelques
// champs. Une régression d'un normalizer sur une save de 100 h n'était attrapée que
// par le joueur — normalizeVowEntry, par exemple, n'avait jamais tourné.
//
// fixtures/save-late.json : une partie JOUÉE de bout en bout par le harnais de
// parcours de l'audit (joueur scripté sur les vraies actions du jeu), relevée au
// titre final — 5 cycles, 7 Grands Reset, 14 Mythes, ère 115, 35 améliorations,
// 3e37 Ruines, un vœu de cycle choisi. Écrite par la version du 05/10 (saveVersion
// 7, la courante ce jour-là) : dès que le format bougera, elle vérifiera aussi
// qu'une save d'une version PASSÉE se relit. Ses champs de
// carte (cityCore, cityMapSlots, cityRoads…) sont ceux d'un computeCityLayout,
// comme quand la vue Cité s'est ouverte — c'est eux qui font ses ~350 Ko.
// Même texte que « Exporter » sans le base64 (forme JSON brut, acceptée à l'import).
// ⚠ À remplacer par un export anonymisé d'une vraie longue partie dès qu'il y en a
// un : le test vaut pour toute save de ce jeu.
const FIXTURE = new URL("./fixtures/save-late.json", import.meta.url);
// L'instant où la save a été écrite (horloge virtuelle du harnais) : hydrateState
// borne les horodatages « dans le futur », l'heure réelle rendrait le test mouvant.
const SAVED_AT = 1_800_017_359_000;

let texte, brut;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SAVED_AT);
  texte = fs.readFileSync(FIXTURE, "utf8");
  brut = JSON.parse(texte);
});
afterAll(() => {
  vi.useRealTimers();
  setState(defaultState());
  invalidateRenderCache("all");
});

// Un F5 du joueur : save → JSON → hydrateState.
const recharger = (s) => hydrateState(JSON.parse(JSON.stringify(s)));
// Forme JSON d'un état (Decimal → chaîne), pour comparer en profondeur.
const enJson = (s) => JSON.parse(JSON.stringify(s));

describe("save de fin de partie (fixtures/save-late.json)", () => {
  it("est reconnue comme une save de ce jeu, d'une version passée ou courante", () => {
    expect(looksLikeSave(brut)).toBe(true);
    expect(isFutureSave(brut)).toBe(false);
  });

  it("hydrate → JSON → hydrate est idempotent, en profondeur", () => {
    const une = recharger(brut);
    const deux = recharger(une);
    expect(enJson(deux)).toEqual(enJson(une));
  });

  it("garde cycles, Ruines, améliorations, Mythes et Grands Reset", () => {
    const h = recharger(brut);
    expect(h.cycles).toBe(brut.cycles);
    expect(D(h.ruins).eq(D(brut.ruins))).toBe(true);
    expect(Object.keys(h.upgrades).sort()).toEqual(Object.keys(brut.upgrades).sort());
    expect(h.grandResetCount).toBe(brut.grandResetCount);
    expect(Object.keys(h.mythsCompleted).sort()).toEqual(Object.keys(brut.mythsCompleted).sort());
    expect(h.finalChronicleTitle).toBe(brut.finalChronicleTitle);
  });

  it("garde le vœu du cycle (proposés et choisi)", () => {
    expect(brut.cycleVow && brut.cycleVow.chosen).toBeTruthy();   // la fixture en porte bien un
    expect(recharger(brut).cycleVow).toEqual(brut.cycleVow);
  });

  it("garde la carte : cœur de ville, routes et emplacements", () => {
    const h = recharger(brut);
    expect(brut.cityCore).toBeTruthy();
    // toMatchObject : normalizeCityCore complète les tables absentes (districts,
    // quarters vides) — rien ne doit en revanche manquer ni changer.
    expect(h.cityCore).toMatchObject(brut.cityCore);
    expect(h.cityRoads).toEqual(brut.cityRoads);
    expect(Object.keys(h.cityMapSlots).length).toBe(Object.keys(brut.cityMapSlots).length);
    expect(h.cityMapSlots).toEqual(brut.cityMapSlots);
    expect(h.mapSeed).toBe(brut.mapSeed);
  });

  it("garde les bâtiments, au chiffre près", () => {
    expect(recharger(brut).buildings).toEqual(expect.objectContaining(brut.buildings));
  });
});
