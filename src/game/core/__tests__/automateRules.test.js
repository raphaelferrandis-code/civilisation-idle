"use strict";
// AUTOMATES DE BÂTIMENTS (C6). Aucun test ne les couvrait jusqu'ici.
//
// Le piège de cette fiche est l'INVERSE de celui qu'on attend. `normalizeRuleList`
// fait `{...fallback, enabled}` : les nouveaux champs reçoivent donc leur défaut
// automatiquement, aucune sauvegarde ne revient avec `reservePct` undefined. Le
// vrai problème est symétrique et silencieux : sans recopie explicite, les
// valeurs RÉGLÉES PAR LE JOUEUR repartent au défaut à chaque rechargement.

import { describe, it, expect, beforeEach } from "vitest";

import {
  setState, defaultState, hydrateState,
  defaultAutomateRules, normalizeRuleList, AUTOMATE_FIELD_BOUNDS,
} from "../state.js";
import { setAutomateField, getAutomateRules } from "../actions.js";

const roundTrip = (s) => hydrateState(JSON.parse(JSON.stringify(s)));
const ruleById = (rules, id) => rules.find((r) => r.id === id);
// `state.automateRules` naît à null et se remplit paresseusement au premier
// accès (getAutomateRules) : un test qui lit le champ brut tombe sur null.
const rules = () => getAutomateRules();

beforeEach(() => {
  setState(defaultState());
});

describe("règles par défaut", () => {
  it("le Savoir a enfin son automate, à côté de Cité et Infrastructure", () => {
    const cats = defaultAutomateRules().filter((r) => r.type === "buy_cheapest").map((r) => r.category);
    expect(cats).toEqual(["city", "knowledge", "infra"]);
  });

  it("les automates d'achat naissent inoffensifs : rien de réservé, un achat par tick", () => {
    for (const r of defaultAutomateRules().filter((r) => r.type === "buy_cheapest")) {
      expect(r.reservePct).toBe(0);
      expect(r.perTick).toBe(1);
      expect(r.enabled).toBe(false);
    }
  });
});

describe("persistance des réglages", () => {
  it("LE PIÈGE : un réglage du joueur survit au rechargement", () => {
    const s = defaultState();
    s.automateRules = defaultAutomateRules();
    const rule = ruleById(s.automateRules, "auto_buy_city");
    rule.enabled = true;
    rule.reservePct = 40;
    rule.perTick = 6;
    const back = ruleById(roundTrip(s).automateRules, "auto_buy_city");
    expect(back.enabled).toBe(true);
    expect(back.reservePct).toBe(40);
    expect(back.perTick).toBe(6);
  });

  it("une sauvegarde ANTÉRIEURE aux nouveaux champs reçoit les défauts", () => {
    // Les vieilles sauvegardes n'ont ni reservePct ni perTick : le spread du
    // fallback doit les injecter sans rien casser.
    const vieux = [{ id: "auto_buy_city", enabled: true }];
    const back = ruleById(normalizeRuleList(vieux, defaultAutomateRules(), 1, 99, AUTOMATE_FIELD_BOUNDS), "auto_buy_city");
    expect(back.enabled).toBe(true);
    expect(back.reservePct).toBe(0);
    expect(back.perTick).toBe(1);
  });

  it("les valeurs aberrantes sont ramenées dans leurs bornes, pas propagées", () => {
    const trafique = [{ id: "auto_buy_city", enabled: true, reservePct: 5000, perTick: -3 }];
    const back = ruleById(normalizeRuleList(trafique, defaultAutomateRules(), 1, 99, AUTOMATE_FIELD_BOUNDS), "auto_buy_city");
    expect(back.reservePct).toBe(AUTOMATE_FIELD_BOUNDS.reservePct[1]);
    expect(back.perTick).toBe(AUTOMATE_FIELD_BOUNDS.perTick[0]);
  });

  it("un champ non listé dans les bornes ne survivrait PAS : c'est le contrat", () => {
    // Contrôle négatif du piège : tout champ modifiable doit figurer dans
    // AUTOMATE_FIELD_BOUNDS, sinon il repart au défaut en silence.
    const avecIntrus = [{ id: "auto_buy_city", enabled: true, champInvente: 42 }];
    const back = ruleById(normalizeRuleList(avecIntrus, defaultAutomateRules(), 1, 99, AUTOMATE_FIELD_BOUNDS), "auto_buy_city");
    expect(back.champInvente).toBeUndefined();
  });
});

describe("setAutomateField", () => {
  it("borne à l'écriture, avec la MÊME table que l'hydratation", () => {
    setAutomateField("auto_buy_city", "reservePct", 999);
    expect(ruleById(rules(), "auto_buy_city").reservePct).toBe(AUTOMATE_FIELD_BOUNDS.reservePct[1]);
    setAutomateField("auto_buy_city", "perTick", 0);
    expect(ruleById(rules(), "auto_buy_city").perTick).toBe(AUTOMATE_FIELD_BOUNDS.perTick[0]);
  });

  it("ignore un champ inconnu plutôt que de l'inventer", () => {
    setAutomateField("auto_buy_city", "champInvente", 5);
    expect(ruleById(rules(), "auto_buy_city").champInvente).toBeUndefined();
  });

  it("ignore une saisie non numérique au lieu d'écrire NaN", () => {
    setAutomateField("auto_buy_city", "reservePct", 30);
    setAutomateField("auto_buy_city", "reservePct", "");
    expect(ruleById(rules(), "auto_buy_city").reservePct).toBe(30);
  });
});
