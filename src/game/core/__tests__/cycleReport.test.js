"use strict";
// BILAN DE FIN DE CYCLE (D9). Deux invariants, tous deux faciles à casser :
//   - `prevCycle` doit survivre au rechargement, sinon l'écart avec le cycle
//     précédent est inaffichable au premier cycle qui suit un F5 ;
//   - `lastCycleReport` ne doit JAMAIS survivre au rechargement, sinon un F5
//     rejoue l'annonce d'une chute déjà passée à l'écran.

import { describe, it, expect } from "vitest";

import { defaultState, hydrateState, normalizePrevCycle } from "../state.js";
import { COLLAPSE_CAUSES, FAVORED_CAUSE_LABELS, COLLAPSE_CAUSE_LABELS } from "../../data/epitaphs.js";

const roundTrip = (s) => hydrateState(JSON.parse(JSON.stringify(s)));

describe("prevCycle — le bilan du cycle précédent traverse la sauvegarde", () => {
  it("est nul sur une partie neuve", () => {
    expect(defaultState().prevCycle).toBeNull();
  });

  it("survit à un rechargement", () => {
    const s = defaultState();
    s.prevCycle = { cycleSec: 842.5, ruinGain: "1.5e21", peakPop: "3.2e9", cause: "famine" };
    expect(roundTrip(s).prevCycle).toEqual(s.prevCycle);
  });

  it("les montants restent des CHAÎNES : ce bilan s'affiche, il ne se calcule pas", () => {
    const s = defaultState();
    s.prevCycle = { cycleSec: 10, ruinGain: "1e300", peakPop: "1e40", cause: "time" };
    const back = roundTrip(s).prevCycle;
    expect(typeof back.ruinGain).toBe("string");
    expect(back.ruinGain).toBe("1e300");
  });

  it("un bilan corrompu ne casse pas l'hydratation", () => {
    expect(normalizePrevCycle(undefined)).toBeNull();
    expect(normalizePrevCycle("nope")).toBeNull();
    const bad = normalizePrevCycle({ cycleSec: NaN, ruinGain: 42, peakPop: null, cause: 7 });
    expect(bad.cycleSec).toBe(0);
    expect(bad.ruinGain).toBe("0");
    expect(bad.peakPop).toBe("0");
    expect(bad.cause).toBe("");
  });
});

// LA PORTE QUI MANQUAIT. Le bandeau a été livré avec une table de causes qui
// contenait deux `reason` (« instability », « auto_collapse ») et ignorait deux
// causes réelles : sur une chute par avarice ou par Rupture, il imprimait la
// clé interne. Rien ne l'attrapait, parce que rien ne confrontait les tables au
// registre des causes.
describe("libellés de cause — aucune table n'imprime une clé interne", () => {
  it("le registre est bien les quatre causes de collapseCause()", () => {
    expect([...COLLAPSE_CAUSES].sort()).toEqual(["avarice", "famine", "rupture", "time"]);
  });

  // Les deux tables sont aplaties par localizeData() au chargement du module :
  // leurs valeurs sont déjà des chaînes de la langue courante, pas des unités
  // { fr, en }. Un test qui les lirait via tr() passerait aussi, mais pour la
  // mauvaise raison (tr rend une string telle quelle).
  for (const [nom, table] of [["bandeau", COLLAPSE_CAUSE_LABELS], ["sceau", FAVORED_CAUSE_LABELS]]) {
    it(`table du ${nom} : les quatre causes ont un libellé, aucun n'est la clé`, () => {
      for (const cause of COLLAPSE_CAUSES) {
        expect(typeof table[cause]).toBe("string");
        expect(table[cause]).toBeTruthy();
        expect(table[cause]).not.toBe(cause);
      }
    });

    it(`table du ${nom} : aucune clé étrangère au registre`, () => {
      expect(Object.keys(table).sort()).toEqual([...COLLAPSE_CAUSES].sort());
    });
  }

  it("les deux tables restent des phrases DIFFÉRENTES : elles ne tiennent pas dans la même", () => {
    // Le bandeau écrit « Emportée par X », donc un groupe nominal avec article,
    // le sceau écrit X seul (« chute par famine »). Les fusionner rendrait
    // forcément l'une des deux phrases bancale.
    for (const cause of COLLAPSE_CAUSES) {
      expect(COLLAPSE_CAUSE_LABELS[cause]).not.toBe(FAVORED_CAUSE_LABELS[cause]);
    }
  });
});

describe("lastCycleReport — une annonce ne se rejoue pas", () => {
  it("est nul sur une partie neuve", () => {
    expect(defaultState().lastCycleReport).toBeNull();
  });

  it("est REMIS À NULL au rechargement, même s'il figurait dans la sauvegarde", () => {
    const s = defaultState();
    s.lastCycleReport = { year: 120, dynasty: "Atrides", cause: "famine", peakPop: "1e6", cycleSec: 300, ruinGain: "1e9" };
    expect(roundTrip(s).lastCycleReport).toBeNull();
  });
});
