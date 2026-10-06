// L'ALLER-RETOUR DE SAUVEGARDE EN ÉGALITÉ PROFONDE (audit 2026-10-05, TEST-2).
//
// La classe de bug « champ écrit par le jeu mais oublié (ou abîmé) à
// l'hydratation », déjà vécue plusieurs fois, n'était gardée que sur un état PAR
// DÉFAUT et sur la seule liste des CLÉS : un champ remis à son défaut au
// rechargement passait au vert. Ici, un état « plein » — CHAQUE champ de
// defaultState() porte une valeur hors défaut, tirée de vraies parties jouées par
// le harnais de parcours puis complétée à la main — doit revenir de hydrateState
// À L'IDENTIQUE, hors une liste blanche explicite de champs remis à neuf.
//
// Un champ NOUVEAU dans defaultState() fait échouer le premier test tant qu'il n'a
// pas sa valeur hors défaut dans fixtures/etat-plein.json : c'est voulu, c'est le
// moment de vérifier que hydrateState le relit.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { defaultState, hydrateState } from "../state.js";
import { SAVE_KEY } from "../saveKey.js";
import plein from "./fixtures/etat-plein.json";

// Champs que hydrateState REMET À NEUF par conception (avec la raison) : ils
// doivent revenir à leur valeur de defaultState(), quelle que soit la save.
const REMIS_A_NEUF = {
  saveVersion: "ré-estampillé à la version courante (migrate)",
  mourning: "deuil d'une chute coupée par le rechargement",
  chute: "cinématique de la chute sur la carte, jamais rejouée",
  lastCycleReport: "bilan de cycle déjà montré, jamais rejoué",
  pendingCrisisSlot: "verrou d'une modale de crise disparue avec la page (BUG-22)",
  cadmosPromptPending: "modale de Cadmos disparue : son palier sera reproposé",
};

const json = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let base;
let hydrated;

beforeAll(() => {
  // L'horloge de la partie figée : les horodatages « dans le futur » seraient
  // ramenés à maintenant par l'hydratation.
  vi.spyOn(Date, "now").mockReturnValue(plein.now);
  base = json(defaultState());
  hydrated = json(hydrateState(json(plein.state)));
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("aller-retour de sauvegarde sur un état plein", () => {
  it("l'état plein couvre chaque champ de defaultState(), hors défaut", () => {
    const manquants = Object.keys(base).filter((key) => !(key in plein.state));
    expect(manquants, "champ absent de fixtures/etat-plein.json : lui donner une valeur hors défaut (ou l'inscrire dans REMIS_A_NEUF)").toEqual([]);
    const auDefaut = Object.keys(base).filter((key) => !(key in REMIS_A_NEUF) && same(plein.state[key], base[key]));
    expect(auDefaut, "champ resté à son défaut dans l'état plein : l'aller-retour ne le garderait pas").toEqual([]);
  });

  it("hydrateState rend chaque champ tel quel (égalité profonde)", () => {
    for (const key of Object.keys(base)) {
      if (key in REMIS_A_NEUF) continue;
      expect(hydrated[key], key).toEqual(plein.state[key]);
    }
    // Rien d'inventé non plus : mêmes clés que defaultState().
    expect(Object.keys(hydrated).sort()).toEqual(Object.keys(base).sort());
  });

  it("les champs transitoires reviennent à leur défaut", () => {
    for (const key of Object.keys(REMIS_A_NEUF)) expect(hydrated[key], key).toEqual(base[key]);
  });

  it("save → rechargement → save est un point fixe", () => {
    expect(json(hydrateState(json(hydrated)))).toEqual(hydrated);
  });

  it("load() relit la save du localStorage sans repli ni champ perdu", async () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(plein.state));
    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => { errors.push(args.join(" ")); });
    vi.resetModules();
    const fresh = await import("../state.js");
    spy.mockRestore();
    expect(errors).toEqual([]);
    expect(json(fresh.state)).toEqual(hydrated);
  });
});
