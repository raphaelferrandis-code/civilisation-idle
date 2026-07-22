"use strict";
// fmtSecs — duree APPROCHEE en langage courant. Remontee dans utils.js (C2)
// parce que le rapport de reprise (B11) en a besoin aussi : deux copies de ce
// formatage finiraient par diverger d'une unite.

import { describe, it, expect, beforeEach } from "vitest";

import { fmtSecs } from "../utils.js";
import { setLang } from "../i18n.js";

// La langue est POSÉE explicitement (B5) : ces treize chaînes verrouillaient du
// français sans le dire, alors que fmtSecs est aussi consommé dans des phrases
// anglaises. La couverture EN vit dans purchaseEta.test.js.
beforeEach(() => setLang("fr"));

describe("fmtSecs", () => {
  it("n'ecrit jamais une unite inferieure nulle", () => {
    // Le defaut d'origine : « 2h 0min » dans une gouttiere de 37 px.
    expect(fmtSecs(2 * 3600)).toBe("2 h");
    expect(fmtSecs(8 * 3600)).toBe("8 h");
    expect(fmtSecs(86400)).toBe("1 j");
  });

  it("garde l'unite inferieure quand elle porte de l'information", () => {
    expect(fmtSecs(3600 + 60)).toBe("1 h 1 min");
    expect(fmtSecs(86400 + 3600)).toBe("1 j 1 h");
    expect(fmtSecs(45 * 60)).toBe("45 min");
  });

  it("ne descend pas sous la minute : c'est un ordre de grandeur", () => {
    expect(fmtSecs(0)).toBe("moins d'1 min");
    expect(fmtSecs(59)).toBe("moins d'1 min");
    expect(fmtSecs(60)).toBe("1 min");
  });

  it("encaisse les entrees aberrantes sans rendre NaN", () => {
    expect(fmtSecs(-500)).toBe("moins d'1 min");
    expect(fmtSecs(1234.7)).toBe("20 min");
  });

  it("les paliers d'absence du jeu se lisent bien", () => {
    // 2 h gratuites, 8 h avec Veilleurs de nuit, 24 h au palier suivant.
    expect(fmtSecs(2 * 3600)).toBe("2 h");
    expect(fmtSecs(8 * 3600)).toBe("8 h");
    expect(fmtSecs(24 * 3600)).toBe("1 j");
  });
});
