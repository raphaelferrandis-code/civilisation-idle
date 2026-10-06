"use strict";
// EMPLACEMENTS EN UNE SEULE CLÉ (audit 2026-10-05, SAV-14). L'emplacement s'écrivait
// en deux clés, la partie PUIS sa méta : un arrêt entre les deux laissait la date et
// la cité de l'ancien instantané sur la nouvelle partie. Désormais un seul setItem
// (en-tête de méta + partie) ; l'ancien format reste lisible. Au passage, la vue
// « plaisirs » survit au rechargement (liste blanche d'activeView).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setState, hydrateState, invalidateRenderCache } from "../state.js";
import { writeSlot, readSlotMeta, loadSlot, slotIsEmpty } from "../saveSlots.js";
import { SAVE_KEY, PENDING_LOAD_KEY } from "../saveKey.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const SLOT = `${SAVE_KEY}-slot0`;
const META = `${SAVE_KEY}-slot0-meta`;
let store;
let failWrites = false;
const pendingCity = () => (store.has(PENDING_LOAD_KEY) ? JSON.parse(store.get(PENDING_LOAD_KEY)).save.cityName : null);
const play = (fields) => { setState(hydrateState({ ...MID_GAME_FIXTURE, ...fields })); invalidateRenderCache("all"); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  store = new Map();
  failWrites = false;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) throw new Error("QuotaExceededError");
      store.set(k, String(v));
    },
    removeItem: (k) => { store.delete(k); },
  };
  play({ cityName: "Ici", cycles: 4 });
});
afterEach(() => {
  delete globalThis.localStorage;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("emplacements de sauvegarde — une seule clé (SAV-14)", () => {
  it("méta et partie écrites ensemble dans la clé de l'emplacement, relues, chargées", () => {
    expect(writeSlot(0).ok).toBe(true);
    expect([...store.keys()]).toEqual([SLOT]);
    expect(readSlotMeta(0)).toEqual({ at: FIXED_NOW, cycles: 4, city: "Ici" });
    expect(slotIsEmpty(0)).toBe(false);
    play({ cityName: "Ailleurs" });
    expect(loadSlot(0)).toBe(true);
    expect(pendingCity()).toBe("Ici");
  });

  it("stockage plein : l'instantané précédent reste entier — sa méta ne ment pas", () => {
    writeSlot(0);
    play({ cityName: "Ailleurs", cycles: 9 });
    vi.setSystemTime(FIXED_NOW + 60000);
    failWrites = true;
    expect(writeSlot(0)).toMatchObject({ ok: false, full: true });
    failWrites = false;
    expect(readSlotMeta(0)).toEqual({ at: FIXED_NOW, cycles: 4, city: "Ici" });
    expect(loadSlot(0)).toBe(true);
    expect(pendingCity()).toBe("Ici");
  });

  it("ancien format (partie seule + clé -meta) : relu et chargé ; réécrit, la vieille méta disparaît", () => {
    store.set(SLOT, JSON.stringify({ ...MID_GAME_FIXTURE, cityName: "Jadis" }));
    store.set(META, JSON.stringify({ at: 123, cycles: 2, city: "Jadis" }));
    expect(readSlotMeta(0)).toEqual({ at: 123, cycles: 2, city: "Jadis" });
    expect(loadSlot(0)).toBe(true);
    expect(pendingCity()).toBe("Jadis");
    store.delete(PENDING_LOAD_KEY);
    writeSlot(0);
    expect(store.has(META)).toBe(false);
    expect(readSlotMeta(0).city).toBe("Ici");
    // Clé de l'emplacement retirée : vide, sans méta résiduelle.
    store.delete(SLOT);
    expect(slotIsEmpty(0)).toBe(true);
    expect(readSlotMeta(0)).toBe(null);
  });
});

describe("vue active au rechargement (SAV-14)", () => {
  it("la Maison des Plaisirs survit au rechargement ; une vue inconnue retombe sur la Cité", () => {
    expect(hydrateState({ ...MID_GAME_FIXTURE, activeView: "plaisirs" }).activeView).toBe("plaisirs");
    expect(hydrateState({ ...MID_GAME_FIXTURE, activeView: "nimporte" }).activeView).toBe("city");
  });
});
