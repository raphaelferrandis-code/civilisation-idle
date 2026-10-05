"use strict";
// LANGUE DE DÉPART (audit 2026-10-05, I18N-1). Le français était imposé à tous :
// un joueur anglophone ouvrait l'.exe dans une langue qu'il ne lit pas. Sans
// choix enregistré, on suit désormais la langue du système — mais SEULEMENT pour
// un joueur neuf : une save déjà là sans clé de langue, c'est un joueur d'avant
// qui jouait en français, il y reste.
//
// La langue se fixe à l'ÉVALUATION du module : chaque cas pose son décor
// (stockage, navigateur, page), recharge i18n.js à neuf et lit getLang().

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { SAVE_KEY } from "../saveKey.js";

const LANG_KEY = "civ-opt-lang";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    has: (k) => map.has(k),
  };
}

// Un lancement : le décor posé, i18n.js réévalué, la langue retenue.
async function boot({ storage, languages, language, page = true }) {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", { languages, language });
  if (page) vi.stubGlobal("document", { documentElement: {} });
  else vi.stubGlobal("document", undefined);
  vi.resetModules();
  const mod = await import("../i18n.js");
  return mod.getLang();
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("langue de départ — joueur neuf (aucune save)", () => {
  it("suit un système anglais, et écrit ce choix", async () => {
    const storage = memoryStorage();
    expect(await boot({ storage, languages: ["en-US"] })).toBe("en");
    expect(storage.getItem(LANG_KEY)).toBe("en");
  });

  it("suit un système français", async () => {
    const storage = memoryStorage();
    expect(await boot({ storage, languages: ["fr-FR", "en-US"] })).toBe("fr");
    expect(storage.getItem(LANG_KEY)).toBe("fr");
  });

  it("une langue que le jeu ne parle pas → l'anglais", async () => {
    expect(await boot({ storage: memoryStorage(), languages: ["de-DE"] })).toBe("en");
  });

  it("prend la première langue proposée que le jeu parle", async () => {
    expect(await boot({ storage: memoryStorage(), languages: ["nl-BE", "fr-BE", "en"] })).toBe("fr");
  });

  it("sans navigator.languages, lit navigator.language", async () => {
    expect(await boot({ storage: memoryStorage(), languages: [], language: "en-GB" })).toBe("en");
  });

  it("un système muet garde le français d'avant", async () => {
    expect(await boot({ storage: memoryStorage(), languages: [], language: "" })).toBe("fr");
  });

  it("le lancement suivant garde la langue détectée, alors que la save existe", async () => {
    const storage = memoryStorage();
    expect(await boot({ storage, languages: ["en-US"] })).toBe("en");
    storage.setItem(SAVE_KEY, "{}"); // la première partie s'est sauvegardée
    expect(await boot({ storage, languages: ["en-US"] })).toBe("en");
  });

  it("stockage refusé : la détection vaut pour la session, sans planter", async () => {
    const storage = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
    };
    expect(await boot({ storage, languages: ["en-US"] })).toBe("en");
  });
});

describe("langue de départ — joueur existant", () => {
  it("une save sans clé de langue reste en français, même sur un système anglais", async () => {
    const storage = memoryStorage({ [SAVE_KEY]: "{}" });
    expect(await boot({ storage, languages: ["en-US"] })).toBe("fr");
    // Écrite : un « Recommencer depuis le tout premier feu » (save effacée) ne la
    // ferait pas basculer au lancement suivant.
    expect(storage.getItem(LANG_KEY)).toBe("fr");
    storage.removeItem(SAVE_KEY);
    expect(await boot({ storage, languages: ["en-US"] })).toBe("fr");
  });

  it("un choix enregistré l'emporte toujours sur le système", async () => {
    expect(await boot({ storage: memoryStorage({ [LANG_KEY]: "en", [SAVE_KEY]: "{}" }), languages: ["fr-FR"] })).toBe("en");
    expect(await boot({ storage: memoryStorage({ [LANG_KEY]: "fr" }), languages: ["en-US"] })).toBe("fr");
  });

  it("une valeur enregistrée inconnue est traitée comme absente", async () => {
    const storage = memoryStorage({ [LANG_KEY]: "de", [SAVE_KEY]: "{}" });
    expect(await boot({ storage, languages: ["en-US"] })).toBe("fr");
    expect(storage.getItem(LANG_KEY)).toBe("fr");
  });
});

describe("hors page (tests sous Node, worker)", () => {
  it("ni détection ni écriture : le français, le même sur tous les postes", async () => {
    const storage = memoryStorage();
    expect(await boot({ storage, languages: ["en-US"], page: false })).toBe("fr");
    expect(storage.has(LANG_KEY)).toBe(false);
  });
});
