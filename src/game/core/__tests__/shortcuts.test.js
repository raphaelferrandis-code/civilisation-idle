"use strict";
// TABLE DES RACCOURCIS (C11). Les touches vivaient en dur dans le gestionnaire
// clavier ET recopiées à la main dans l'écran des Options : deux sources, donc
// une liste qui pouvait mentir. Une seule table désormais, personnalisable.
//
// Le vrai risque de la personnalisation est de se tirer une balle dans le pied :
// réattribuer Échap rendrait les Options inaccessibles DEPUIS les Options.

import { describe, it, expect, beforeEach } from "vitest";

import {
  SHORTCUT_DEFS, shortcutKey, shortcutRejection,
  setShortcutKey, setShortcutOff, resetShortcutKey,
  resolveShortcut, resolveViewDigit,
} from "../shortcuts.js";

const def = (id) => SHORTCUT_DEFS.find((d) => d.id === id);
// Évènement clavier minimal, hors saisie et hors dialogue.
const ev = (key, mods = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });

beforeEach(() => {
  for (const d of SHORTCUT_DEFS) { resetShortcutKey(d.id); setShortcutOff(d.id, false); }
});

describe("table", () => {
  it("les identifiants sont uniques et les touches par défaut ne se marchent pas dessus", () => {
    const ids = SHORTCUT_DEFS.map((d) => d.id);
    const keys = SHORTCUT_DEFS.map((d) => d.key);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("aucune touche par défaut n'est un chiffre : ils sont réservés aux vues", () => {
    for (const d of SHORTCUT_DEFS) expect(d.key).not.toMatch(/^[0-9]$/);
  });
});

describe("résolution", () => {
  it("rend l'entrée correspondant à la touche", () => {
    expect(resolveShortcut(ev("e"))?.id).toBe("buy_all");
    expect(resolveShortcut(ev("F"))?.id).toBe("contemplation");   // insensible à la casse
  });

  it("ignore les combinaisons avec modificateur : Ctrl+S reste « enregistrer »", () => {
    expect(resolveShortcut(ev("s", { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(ev("s", { metaKey: true }))).toBeNull();
    expect(resolveShortcut(ev("s", { altKey: true }))).toBeNull();
  });

  it("ignore ce qui n'est pas une touche simple", () => {
    expect(resolveShortcut(ev("ArrowLeft"))).toBeNull();
    expect(resolveShortcut(ev("Escape"))).toBeNull();
  });

  it("un raccourci DÉSACTIVÉ ne résout plus : c'est la réponse au E parti au moindre appui", () => {
    setShortcutOff("buy_all", true);
    expect(resolveShortcut(ev("e"))).toBeNull();
    setShortcutOff("buy_all", false);
    expect(resolveShortcut(ev("e"))?.id).toBe("buy_all");
  });

  it("suit la touche réattribuée, et l'ancienne ne déclenche plus rien", () => {
    setShortcutKey("buy_all", "b");
    expect(resolveShortcut(ev("b"))?.id).toBe("buy_all");
    expect(resolveShortcut(ev("e"))).toBeNull();
  });
});

describe("réattribution — les garde-fous", () => {
  it("REFUSE Échap : c'est le seul chemin de secours vers les Options", () => {
    // Sans ce refus, on peut rendre les Options inaccessibles depuis les Options.
    expect(shortcutRejection(def("buy_all"), "Escape").reason).toBe("forbidden");
    expect(setShortcutKey("buy_all", "Escape")).toBe(false);
    expect(shortcutKey(def("buy_all"))).toBe("e");
  });

  it("refuse une touche DÉJÀ PRISE, et dit par qui", () => {
    const refus = shortcutRejection(def("buy_all"), "m");
    expect(refus.reason).toBe("taken");
    expect(refus.by.id).toBe("buy_city");
    expect(setShortcutKey("buy_all", "m")).toBe(false);
  });

  it("accepte de reprendre SA PROPRE touche (ce n'est pas un conflit)", () => {
    expect(shortcutRejection(def("buy_all"), "e")).toBeNull();
  });

  it("refuse les chiffres, réservés aux vues 1 à 8", () => {
    expect(shortcutRejection(def("buy_all"), "3").reason).toBe("digit");
  });

  it("refuse les touches de navigation et de saisie", () => {
    for (const k of ["Tab", "Enter", " ", "ArrowUp", "Backspace"]) {
      expect(shortcutRejection(def("buy_all"), k).reason).toBe("forbidden");
    }
  });

  it("refuse une touche à plusieurs caractères", () => {
    expect(shortcutRejection(def("buy_all"), "F5").reason).toBe("invalid");
  });

  it("libère l'ancienne touche : elle redevient attribuable", () => {
    setShortcutKey("buy_all", "b");
    expect(shortcutRejection(def("buy_city"), "e")).toBeNull();
  });

  it("le retour au défaut rend bien la touche d'origine", () => {
    setShortcutKey("buy_all", "b");
    resetShortcutKey("buy_all");
    expect(shortcutKey(def("buy_all"))).toBe("e");
  });
});

describe("touches de vue", () => {
  it("1 à 8 rendent un index de vue, à partir de zéro", () => {
    expect(resolveViewDigit(ev("1"))).toBe(0);
    expect(resolveViewDigit(ev("8"))).toBe(7);
  });

  it("0 et 9 ne visent rien : il n'y a que huit onglets", () => {
    expect(resolveViewDigit(ev("0"))).toBe(-1);
    expect(resolveViewDigit(ev("9"))).toBe(-1);
  });

  it("ignore les combinaisons avec modificateur", () => {
    expect(resolveViewDigit(ev("1", { ctrlKey: true }))).toBe(-1);
  });
});
