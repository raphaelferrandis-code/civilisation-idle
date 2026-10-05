// LES CHEMINS D'ENTRÉE/SORTIE DE LA SAUVEGARDE (audit 2026-10-05, TEST-2).
//
// La couverture V8 de l'audit comptait 0 passage dans encode/decodeSaveText,
// exportSave et consumePendingWipe. Ils tournent ici sur le localStorage en
// mémoire de src/test/setup.js — le chemin de la RÉUSSITE, que les tests ne
// voyaient jamais sans lui. (Import refusé, BOM, emplacements, quota plein,
// nuage : saveVersionGuard, saveRecovery, saveSlotsKey, pendingLoad,
// cloudSaveSession.)
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState } from "../state.js";
import { exportSave, importSave } from "../main.js";
import { encodeSaveText, decodeSaveText } from "../utils.js";
import { markPendingWipe, consumePendingWipe, consumePendingLoad, WIPE_KEY } from "../saveKey.js";
import plein from "./fixtures/etat-plein.json";

// Un nom qui sort du Latin-1 (btoa le refuse tel quel) : accents, idéogrammes,
// emoji hors plan de base — l'export passe par TextEncoder.
const NOM = "Ys-sur-Mer ✦ 東京 🏛️";

const json = (value) => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(plein.now);
  setState(hydrateState(json(plein.state)));
  state.cityName = NOM;
  state.cityNameCustom = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("encodeSaveText / decodeSaveText", () => {
  it("aller-retour exact d'une save de plusieurs blocs de 8 Ko, nom unicode compris", () => {
    const text = JSON.stringify(state);
    expect(text.length).toBeGreaterThan(3 * 8192); // plusieurs tranches de l'encodeur
    const encoded = encodeSaveText(text);
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(decodeSaveText(encoded)).toBe(text);
  });
});

describe("exportSave → importSave", () => {
  it("le code exporté (presse-papiers) se réimporte à l'identique", async () => {
    let copied = null;
    vi.stubGlobal("navigator", { clipboard: { writeText: async (text) => { copied = text; } } });
    const exported = json(state);
    const res = await exportSave();
    expect(res.ok).toBe(true);
    expect(copied).toBe(res.text);
    expect(JSON.parse(decodeSaveText(res.text))).toEqual(exported);

    // Le même code, collé avec un BOM (passé par un éditeur) : accepté.
    expect(importSave("\uFEFF" + res.text)).toBe(true);
    const pending = consumePendingLoad();
    expect(pending).not.toBeNull();
    const loaded = JSON.parse(pending);
    expect(loaded.cityName).toBe(NOM);
    // L'import ne change que ce qu'il doit : époque fraîche (SAV-4), ligne de
    // Journal, ancre du hors-ligne remise à l'heure du chargement.
    const ignore = new Set(["saveEpoch", "history", "lastTick"]);
    for (const key of Object.keys(exported)) {
      if (!ignore.has(key)) expect(loaded[key], key).toEqual(exported[key]);
    }
    expect(loaded.saveEpoch.id).not.toBe(exported.saveEpoch.id);
  });

  it("sans presse-papiers : échec dit, mais le texte à copier à la main est rendu", async () => {
    vi.stubGlobal("navigator", {});
    const res = await exportSave();
    expect(res.ok).toBe(false);
    expect(JSON.parse(decodeSaveText(res.text)).cityName).toBe(NOM);
  });
});

describe("drapeau d'effacement (« Recommencer depuis le tout premier feu »)", () => {
  it("consommé une seule fois", () => {
    markPendingWipe();
    expect(consumePendingWipe()).toBe(true);
    expect(consumePendingWipe()).toBe(false);
    expect(localStorage.getItem(WIPE_KEY)).toBeNull();
  });

  it("périmé (plus d'une minute) ou abîmé : ignoré, mais consommé quand même", () => {
    markPendingWipe();
    vi.setSystemTime(plein.now + 61_000);
    expect(consumePendingWipe()).toBe(false);
    expect(localStorage.getItem(WIPE_KEY)).toBeNull();

    localStorage.setItem(WIPE_KEY, "pas une date");
    expect(consumePendingWipe()).toBe(false);
    expect(localStorage.getItem(WIPE_KEY)).toBeNull();
  });
});
