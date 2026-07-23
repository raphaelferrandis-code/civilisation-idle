"use strict";
// L'INFOBULLE UNIQUE (B1) — la part calculable. Le dépôt n'a ni jsdom ni
// testing-library : aucun composant n'est monté nulle part. Ce qui se teste
// ici, ce sont les trois décisions que la bulle prend sans le DOM — où se
// poser, quoi afficher, et quand s'ouvrir.

import { describe, it, expect } from "vitest";

import {
  BUBBLE_MARGIN,
  BUBBLE_WIDTH,
  OPEN_DELAY_MS,
  REOPEN_GRACE_MS,
  normalizeTipContent,
  openDelayFor,
  placeTip,
  tipStillAlive
} from "../helpBubbleCore.js";

const rect = (left, top, width = 100, height = 20) => ({
  left, top, width, height, right: left + width, bottom: top + height
});

describe("placeTip — la bulle reste à l'écran", () => {
  it("se pose SOUS la cible dans le cas courant", () => {
    const p = placeTip(rect(200, 300), 1920, 1080);
    expect(p.flip).toBe(false);
    expect(p.top).toBe(330);   // bottom 320 + écart 10
    expect(p.left).toBe(200);
  });

  it("bascule AU-DESSUS près du bas de l'écran", () => {
    const p = placeTip(rect(200, 980), 1920, 1080);
    expect(p.flip).toBe(true);
    // Le `top` rendu reste le HAUT de la cible : c'est le CSS qui remonte la
    // bulle par translateY(-100%). Le confondre avec « top = haut de bulle »
    // la ferait sortir de l'écran d'une hauteur de bulle.
    expect(p.top).toBe(970);
  });

  it("ne déborde pas à droite : une cible collée au bord ramène la bulle", () => {
    const p = placeTip(rect(1900, 300), 1920, 1080);
    expect(p.left).toBe(1920 - BUBBLE_WIDTH - 2 * BUBBLE_MARGIN);
    expect(p.left + BUBBLE_WIDTH).toBeLessThanOrEqual(1920);
  });

  it("ne déborde pas à gauche : une cible hors cadre est clampée à la marge", () => {
    expect(placeTip(rect(-50, 300), 1920, 1080).left).toBe(BUBBLE_MARGIN);
  });

  it("sur une fenêtre plus étroite que la bulle, reste à la marge au lieu de partir en négatif", () => {
    const p = placeTip(rect(10, 100), 200, 600);
    expect(p.left).toBe(BUBBLE_MARGIN);
  });

  it("une cible en haut d'un écran court ne colle jamais au-dessus du bord", () => {
    const p = placeTip(rect(10, 2, 100, 4), 1920, 200);
    expect(p.top).toBeGreaterThanOrEqual(BUBBLE_MARGIN);
  });
});

describe("normalizeTipContent — rien à dire, rien à ouvrir", () => {
  it("une chaîne devient du texte", () => {
    expect(normalizeTipContent("Sauvegarder")).toEqual({ kind: "text", text: "Sauvegarder" });
  });

  it("le vide rend null, et c'est le garde-fou d'origine", () => {
    // `tipProps` ne pose AUCUN écouteur sur un contenu nul : un libellé absent
    // ne doit pas produire une bulle vide qui suit la souris.
    for (const vide of [null, undefined, false, "", "   "]) {
      expect(normalizeTipContent(vide)).toBeNull();
    }
    expect(normalizeTipContent([])).toBeNull();
  });

  it("un tableau devient des lignes", () => {
    expect(normalizeTipContent([{ label: "Nourriture", value: "+24/min" }])).toEqual({
      kind: "rows",
      rows: [{ label: "Nourriture", value: "+24/min" }]
    });
  });

  it("jette les lignes conditionnelles éteintes, garde les autres", () => {
    // Le patron d'appel est `cond && { label, value }`, qui rend false.
    const out = normalizeTipContent([
      { label: "Base", value: "10" },
      false,
      null,
      { label: "", value: "" },
      { label: "Bonus", value: "×2" }
    ]);
    expect(out.rows).toEqual([{ label: "Base", value: "10" }, { label: "Bonus", value: "×2" }]);
  });

  it("un tableau qui ne contient QUE des lignes éteintes rend null, pas une bulle vide", () => {
    expect(normalizeTipContent([false, null, { label: "", value: "" }])).toBeNull();
  });

  it("les nombres sont coercés : une valeur 0 s'affiche au lieu de disparaître", () => {
    const out = normalizeTipContent([{ label: "Or", value: 0 }]);
    expect(out).toEqual({ kind: "rows", rows: [{ label: "Or", value: "0" }] });
  });

  it("une ligne sans valeur reste affichable (libellé seul)", () => {
    expect(normalizeTipContent([{ label: "Épuisé" }]).rows).toEqual([{ label: "Épuisé", value: "" }]);
  });
});

describe("openDelayFor — le survol ne s'allume pas au quart de tour", () => {
  it("première ouverture de la session : délai plein", () => {
    expect(openDelayFor(10_000, 0)).toBe(OPEN_DELAY_MS);
  });

  it("juste après une fermeture : ouverture immédiate", () => {
    // Le joueur lit une rangée après l'autre ; lui réimposer le délai à chaque
    // saut donne une interface qui traîne.
    expect(openDelayFor(10_000, 10_000 - REOPEN_GRACE_MS + 1)).toBe(0);
  });

  it("passé le répit : délai plein à nouveau", () => {
    expect(openDelayFor(10_000, 10_000 - REOPEN_GRACE_MS)).toBe(OPEN_DELAY_MS);
    expect(openDelayFor(10_000, 5_000)).toBe(OPEN_DELAY_MS);
  });
});

describe("tipStillAlive — la bulle orpheline", () => {
  // Le vrai cas : survoler un libellé dans une modale puis presser Échap. La
  // cible est démontée, or tipProps ne pose que onMouseLeave et onBlur, dont
  // AUCUN ne part à un démontage. La couche étant désormais globale, elle ne se
  // démonte plus au changement de vue et la bulle restait seule à l'écran.
  it("une cible détachée est morte", () => {
    expect(tipStillAlive({ isConnected: false })).toBe(false);
    expect(tipStillAlive(null)).toBe(false);
    expect(tipStillAlive(undefined)).toBe(false);
  });

  it("une cible attachée est vivante", () => {
    expect(tipStillAlive({ isConnected: true })).toBe(true);
  });
});
