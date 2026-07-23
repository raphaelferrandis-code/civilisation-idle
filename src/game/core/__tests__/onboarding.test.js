"use strict";
// PREMIERS PAS (E1).
//
// Le fil se lit ou s'ignore, mais il ne doit JAMAIS revenir. C'est tout le
// sujet : un effondrement vide state.buildings, un Grand Reset remet `cycles` à
// zéro. Des conditions relues sur l'état courant se décocheraient donc à chaque
// chute, et le fil réapparaîtrait chez un joueur qui l'a fini depuis des heures
// — le risque nommé par la fiche.

import { describe, it, expect, beforeEach } from "vitest";

import { state, setState, defaultState, hydrateState, GR_PERSISTENT_FIELDS } from "../state.js";
import {
  ONBOARDING_STEPS,
  ONBOARDING_PRESSURE_THRESHOLD,
  currentOnboardingStep,
  onboardingSignature,
  refreshOnboarding
} from "../onboarding.js";

const roundTrip = (s) => hydrateState(JSON.parse(JSON.stringify(s)));

beforeEach(() => { setState(defaultState()); });

describe("le fil avance dans l'ordre", () => {
  it("une partie neuve commence à la première étape", () => {
    const cur = currentOnboardingStep(state);
    expect(cur).not.toBeNull();
    expect(cur.index).toBe(0);
    expect(cur.step.id).toBe("build");
    expect(cur.total).toBe(3);
  });

  it("chaque étape franchie fait passer à la suivante", () => {
    refreshOnboarding(state, 1);
    expect(currentOnboardingStep(state).step.id).toBe("pressure");

    state.instability = ONBOARDING_PRESSURE_THRESHOLD;
    refreshOnboarding(state, 1);
    expect(currentOnboardingStep(state).step.id).toBe("collapse");

    state.cycles = 1;
    refreshOnboarding(state, 1);
    expect(currentOnboardingStep(state), "le fil doit disparaître").toBeNull();
  });

  it("la Rupture ne coche pas l'étape sous le seuil", () => {
    refreshOnboarding(state, 1);
    state.instability = ONBOARDING_PRESSURE_THRESHOLD - 0.01;
    refreshOnboarding(state, 1);
    expect(state.onboarding.pressureSeen).toBe(false);
  });

  it("les trois étapes ont un libellé et un indice, en français ET en anglais", () => {
    // La porte i18n ne couvre que les modules de données : sans ce contrôle, une
    // étape sans `en` passerait en silence et s'afficherait en français.
    for (const s of ONBOARDING_STEPS) {
      expect(s.label?.fr, `${s.id} : libellé fr`).toBeTruthy();
      expect(s.label?.en, `${s.id} : libellé en`).toBeTruthy();
      expect(s.hint?.fr, `${s.id} : indice fr`).toBeTruthy();
      expect(s.hint?.en, `${s.id} : indice en`).toBeTruthy();
    }
  });
});

describe("LE piège : le fil ne revient jamais", () => {
  it("un effondrement ne rouvre pas le fil", () => {
    // On termine le fil, puis on rejoue ce que fait la chute.
    state.instability = 1;
    state.cycles = 1;
    refreshOnboarding(state, 5);
    expect(currentOnboardingStep(state)).toBeNull();

    for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
    state.instability = 0;
    refreshOnboarding(state, 0);
    expect(currentOnboardingStep(state), "AUCUN retour après la chute").toBeNull();
  });

  it("un Grand Reset ne refait pas le didacticiel", () => {
    // `cycles` N'EST PAS persistant au Grand Reset : une condition relue dessus
    // rouvrirait le fil juste après la chose la plus avancée du jeu.
    expect(GR_PERSISTENT_FIELDS).toContain("onboarding");

    state.instability = 1;
    state.cycles = 1;
    refreshOnboarding(state, 5);
    state.cycles = 0;                       // ce que fait le Grand Reset
    refreshOnboarding(state, 0);
    expect(currentOnboardingStep(state)).toBeNull();
  });

  it("les drapeaux sont à SENS UNIQUE : rien ne les retire", () => {
    refreshOnboarding(state, 3);
    expect(state.onboarding.built).toBe(true);
    refreshOnboarding(state, 0);
    expect(state.onboarding.built, "un drapeau posé ne se retire jamais").toBe(true);
  });
});

describe("état et persistance", () => {
  it("survit au rechargement", () => {
    state.instability = 1;
    refreshOnboarding(state, 2);
    expect(roundTrip(state).onboarding).toEqual({ built: true, pressureSeen: true, collapsed: false });
  });

  it("est un objet PLEIN sur une partie neuve, jamais null", () => {
    expect(defaultState().onboarding).toEqual({ built: false, pressureSeen: false, collapsed: false });
  });

  it("une sauvegarde corrompue ou d'avant E1 ne casse pas l'hydratation", () => {
    for (const pourri of ["nope", 42, null, undefined, []]) {
      const s = defaultState();
      s.onboarding = pourri;
      expect(roundTrip(s).onboarding).toEqual({ built: false, pressureSeen: false, collapsed: false });
    }
  });
});

describe("signature d'abonnement", () => {
  it("ne change QUE lorsque l'avancement change", () => {
    // Sans ça, la vue Cité se re-rendrait une fois par seconde pour réafficher
    // exactement la même phrase.
    const a = onboardingSignature(state);
    state.gold = 999999;
    state.population = 4242;
    expect(onboardingSignature(state)).toBe(a);
    refreshOnboarding(state, 1);
    expect(onboardingSignature(state)).not.toBe(a);
  });

  it("rend une chaîne VIDE quand le fil est fini", () => {
    state.instability = 1;
    state.cycles = 1;
    refreshOnboarding(state, 1);
    expect(onboardingSignature(state)).toBe("");
  });

  it("l'étape 0 rend « 0 », pas une chaîne vide", () => {
    // Piège classique : « 0 » est falsy si on le rend en nombre, et le panneau
    // se croirait terminé dès la première étape.
    expect(onboardingSignature(state)).toBe("0");
    expect(Boolean(onboardingSignature(state))).toBe(true);
  });
});
