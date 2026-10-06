"use strict";
// TABLE DES RACCOURCIS (C11). Les touches vivaient en dur dans le gestionnaire
// clavier ET recopiées à la main dans l'écran des Options : deux sources, donc
// une liste qui pouvait mentir. Une seule table désormais, personnalisable.
//
// Le vrai risque de la personnalisation est de se tirer une balle dans le pied :
// réattribuer Échap rendrait les Options inaccessibles DEPUIS les Options.

import { describe, it, expect, beforeEach } from "vitest";

import {
  SHORTCUT_DEFS, shortcutKey, shortcutRejection, shortcutPrefs,
  setShortcutKey, setShortcutOff,
  resolveShortcut, resolveViewDigit, resolveCameraKey, feedDebugSequence, pressedDigit,
} from "../shortcuts.js";

const def = (id) => SHORTCUT_DEFS.find((d) => d.id === id);
// Évènement clavier minimal, hors saisie et hors dialogue.
const ev = (key, mods = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });

// Chaque test repart des touches par défaut, toutes actives : on vide les
// préférences en place (resetShortcutKey, sans interface, a été retiré —
// audit du 05/10, TEST-10). `shortcutPrefs` est une liaison vivante : elle
// désigne toujours l'objet courant, même après une réattribution.
beforeEach(() => {
  for (const id of Object.keys(shortcutPrefs)) delete shortcutPrefs[id];
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

  // BUG-103 (audit 2026-10-05) : « Tout acheter » posé sur « - » achetait à
  // chaque dézoom, au clavier comme au bouton de la carte qui rejoue la touche.
  it("refuse les touches de zoom + = - _", () => {
    for (const k of ["+", "=", "-", "_"]) {
      expect(shortcutRejection(def("buy_all"), k).reason).toBe("forbidden");
      expect(setShortcutKey("buy_all", k)).toBe(false);
    }
    expect(resolveShortcut(ev("-"))).toBeNull();
  });

  it("une touche de zoom enregistrée avant le refus retombe sur la touche par défaut", () => {
    shortcutPrefs.buy_all = { key: "-" };
    expect(shortcutKey(def("buy_all"))).toBe("e");
    expect(resolveShortcut(ev("-"))).toBeNull();
    expect(resolveShortcut(ev("e"))?.id).toBe("buy_all");
  });

  // BUG-50 : en AZERTY, la touche du 2 rend « é ». Attribuée à un raccourci,
  // elle ferait aussi changer de vue.
  it("refuse une touche de la rangée des chiffres, même quand elle ne rend pas un chiffre", () => {
    expect(shortcutRejection(def("buy_all"), "é", "Digit2").reason).toBe("digit");
    expect(setShortcutKey("buy_all", "é", "Digit2")).toBe(false);
    expect(shortcutKey(def("buy_all"))).toBe("e");
  });
});

describe("touches caméra (A9)", () => {
  it("les flèches rendent une direction de pan écran", () => {
    expect(resolveCameraKey(ev("ArrowLeft"))).toEqual({ pan: [-1, 0] });
    expect(resolveCameraKey(ev("ArrowRight"))).toEqual({ pan: [1, 0] });
    expect(resolveCameraKey(ev("ArrowUp"))).toEqual({ pan: [0, -1] });
    expect(resolveCameraKey(ev("ArrowDown"))).toEqual({ pan: [0, 1] });
  });

  it("plus et moins rendent un sens de zoom (avec leurs variantes de clavier)", () => {
    expect(resolveCameraKey(ev("+"))).toEqual({ zoom: 1 });
    expect(resolveCameraKey(ev("="))).toEqual({ zoom: 1 });
    expect(resolveCameraKey(ev("-"))).toEqual({ zoom: -1 });
    expect(resolveCameraKey(ev("_"))).toEqual({ zoom: -1 });
  });

  it("ignore une touche quelconque et respecte la garde de saisie (modificateur)", () => {
    expect(resolveCameraKey(ev("a"))).toBeNull();
    expect(resolveCameraKey(ev("ArrowLeft", { ctrlKey: true }))).toBeNull();
  });

  it("le recentrage est une touche personnalisable de la table, pas une touche caméra", () => {
    expect(resolveCameraKey(ev("c"))).toBeNull();
    expect(resolveShortcut(ev("c"))?.id).toBe("recenter_map");
  });

  // BUG-50 : en AZERTY, le 6 rend « - » et le 8 « _ » — changer d'onglet
  // dézoomait la carte.
  it("un +/- tapé sur la rangée des chiffres ne zoome pas : il appartient aux vues", () => {
    expect(resolveCameraKey(ev("-", { code: "Digit6" }))).toBeNull();
    expect(resolveCameraKey(ev("_", { code: "Digit8" }))).toBeNull();
    expect(resolveCameraKey(ev("+", { code: "Digit1" }))).toBeNull();   // QWERTZ tchèque
  });

  it("le pavé numérique, la touche « - » QWERTY et le bouton de la carte (sans code) zooment", () => {
    expect(resolveCameraKey(ev("-", { code: "NumpadSubtract" }))).toEqual({ zoom: -1 });
    expect(resolveCameraKey(ev("+", { code: "NumpadAdd" }))).toEqual({ zoom: 1 });
    expect(resolveCameraKey(ev("-", { code: "Minus" }))).toEqual({ zoom: -1 });
    expect(resolveCameraKey(ev("=", { code: "Equal" }))).toEqual({ zoom: 1 });
    expect(resolveCameraKey(ev("-"))).toEqual({ zoom: -1 });
  });

  // Décision de Raph sur BUG-50 : la touche à droite du 0 dézoome quelle que
  // soit la disposition — le zoom arrière clavier revient aux AZERTY sans pavé.
  it("la touche à droite du 0 dézoome : « ) » en AZERTY, « ß » en QWERTZ", () => {
    expect(resolveCameraKey(ev(")", { code: "Minus" }))).toEqual({ zoom: -1 });
    expect(resolveCameraKey(ev("°", { code: "Minus" }))).toEqual({ zoom: -1 });   // avec Maj
    expect(resolveCameraKey(ev("ß", { code: "Minus" }))).toEqual({ zoom: -1 });
    // Le « ) » de Maj+0 en QWERTY n'est pas cette touche.
    expect(resolveCameraKey(ev(")", { code: "Digit0" }))).toBeNull();
  });

  it("…et elle est interdite aux raccourcis, même posée avant le refus", () => {
    expect(shortcutRejection(def("buy_all"), ")", "Minus").reason).toBe("forbidden");
    expect(shortcutRejection(def("buy_all"), "ß", "Minus").reason).toBe("forbidden");
    expect(shortcutRejection(def("buy_all"), ")").reason).toBe("forbidden");
    expect(setShortcutKey("buy_all", ")", "Minus")).toBe(false);
    shortcutPrefs.buy_all = { key: "ß" };
    expect(resolveShortcut(ev("ß", { code: "Minus" }))).toBeNull();
    shortcutPrefs.buy_all = { key: ")" };
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

  // BUG-50 : le jeu est français. Sans Maj, la rangée AZERTY rend
  // « & é " ' ( - è _ » : les touches 1 à 8 promises par l'Aide ne marchaient pas.
  it("AZERTY sans Maj : la touche physique suffit", () => {
    const azerty = ["&", "é", "\"", "'", "(", "-", "è", "_"];
    azerty.forEach((k, i) => expect(resolveViewDigit(ev(k, { code: `Digit${i + 1}` }))).toBe(i));
    expect(resolveViewDigit(ev("à", { code: "Digit0" }))).toBe(-1);
    expect(resolveViewDigit(ev("ç", { code: "Digit9" }))).toBe(-1);
  });

  it("pavé numérique : le chiffre compte, pas une flèche du pavé verrouillé", () => {
    expect(resolveViewDigit(ev("3", { code: "Numpad3" }))).toBe(2);
    expect(resolveViewDigit(ev("ArrowDown", { code: "Numpad2" }))).toBe(-1);
    expect(pressedDigit(ev("End", { code: "Numpad1" }))).toBe(-1);
  });
});

// Séquence secrète du menu de triche (dev seulement, audit 2026-10-05 DEV-1).
describe("séquence « debug »", () => {
  const taper = (mot, seq = "") => {
    let hit = false;
    for (const k of mot) ({ seq, hit } = feedDebugSequence(seq, ev(k)));
    return { seq, hit };
  };

  it("complète le mot hors saisie, puis repart de zéro", () => {
    expect(taper("xxdebug")).toEqual({ seq: "", hit: true });
    expect(taper("DEBUG").hit).toBe(true);     // insensible à la casse
    expect(taper("debu")).toEqual({ seq: "debu", hit: false });
  });

  it("ignore les touches spéciales et les combinaisons avec modificateur", () => {
    expect(feedDebugSequence("debu", ev("Shift"))).toEqual({ seq: "debu", hit: false });
    expect(feedDebugSequence("debu", ev("g", { ctrlKey: true }))).toEqual({ seq: "debu", hit: false });
  });

  it("RIEN pendant une saisie : nommer sa cité « Debugville » n'ouvre plus le menu", () => {
    const avant = globalThis.document;
    globalThis.document = { activeElement: { tagName: "INPUT" }, querySelector: () => null };
    try {
      expect(taper("Debugville")).toEqual({ seq: "", hit: false });
    } finally {
      if (avant === undefined) delete globalThis.document;
      else globalThis.document = avant;
    }
  });
});
