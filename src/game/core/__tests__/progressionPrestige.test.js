// PRESTIGE, EFFONDREMENT ET MYTHES À L'EXÉCUTION (audit 2026-10-05, TEST-3).
//
// La couverture V8 de l'audit comptait 0 passage dans l'achat des nœuds de
// l'arbre des Ruines (ruinNodeCost, canBuyUpgrade, checkNodeAvailability,
// buyUpgrade — la principale dépense de prestige), dans collapse(reason),
// setTestamentLegacy et l'Édit d'effondrement mené jusqu'au bout, et dans les
// onCollapse / applyHeritage de la moitié des Mythes. ruinTree.structure.test
// garde les DONNÉES de l'arbre (en réimplémentant le verrouillage des paliers) ;
// ici, ce sont les vraies fonctions du jeu qui tournent.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as stateModule from "../state.js";
import { buyUpgrade } from "../actions/building.js";
import { collapse, setTestamentLegacy } from "../actions/crisis.js";
import { checkAutoCollapse } from "../main.js";
import { ruinNodeCost, checkNodeAvailability, checkDogmaAvailability, canBuyUpgrade } from "../mechanics/upgrades.js";
import { upgrades, PRESTIGE_TREE } from "../../data/upgrades.js";
import { MYTHS } from "../../data/myths.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const {
  state, setState, hydrateState, defaultState, invalidateRenderCache,
  setGamePaused, setCollapseInProgress, GR_PERSISTENT_FIELDS, buildGrandResetState
} = stateModule;

const byId = Object.fromEntries(upgrades.map((u) => [u.id, u]));
const json = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function setup(extra = {}) {
  setState(hydrateState({ ...MID_GAME_FIXTURE, upgrades: {}, ...extra }));
  invalidateRenderCache("all");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setGamePaused(false);
  setCollapseInProgress(false);
});

afterEach(async () => {
  // Laisse finir une séquence d'effondrement lancée (deuil de 2 s, pas de carte).
  await vi.advanceTimersByTimeAsync(3000);
  setGamePaused(false);
  setCollapseInProgress(false);
  vi.useRealTimers();
});

describe("Mythes : chaque pacte s'active, se juge et lègue sans lever (TEST-3 a)", () => {
  it.each(MYTHS.map((myth) => [myth.id, myth]))("%s", async (_id, myth) => {
    setup({ cycles: 12 });
    state.activeMythId = myth.id;
    await myth.onActivate();
    let verdict;
    expect(() => { verdict = myth.onCollapse(); }).not.toThrow();
    expect(typeof Boolean(verdict)).toBe("boolean");

    const before = json(state);
    myth.applyHeritage();
    const after = json(state);
    const base = json(defaultState());
    // Champs posés par l'héritage (le Journal, lui, est recomposé par le Grand Reset).
    const legues = Object.keys(after).filter((key) => key !== "history"
      && !same(after[key], before[key]) && !same(after[key], base[key]));
    expect(legues.length, "applyHeritage ne lègue rien").toBeGreaterThan(0);
    // Un héritage est PERMANENT : il doit traverser le Grand Reset, valeur comprise.
    expect(legues.filter((key) => !GR_PERSISTENT_FIELDS.includes(key)), "héritage absent de GR_PERSISTENT_FIELDS").toEqual([]);
    const afterGr = json(buildGrandResetState((state.grandResetCount || 0) + 1));
    for (const key of legues) expect(afterGr[key], key).toEqual(after[key]);
  });
});

describe("Arbre des Ruines : achat réel des nœuds (TEST-3 b)", () => {
  it("palier 0 acheté au coût effectif ; palier suivant fermé tant que son seuil n'est pas atteint", () => {
    setup({ ruins: 1000 });
    expect(checkNodeAvailability("autel_du_culte")).toBe("locked");
    expect(buyUpgrade("autel_du_culte")).toBe(false);

    const cost = ruinNodeCost(byId.oral_tradition);
    expect(cost).toBe(byId.oral_tradition.cost.ruins); // aucune remise encore
    expect(buyUpgrade("oral_tradition")).toBe(true);
    expect(D(state.ruins).toNumber()).toBe(1000 - cost);
    expect(checkNodeAvailability("oral_tradition")).toBe("purchased");
    expect(buyUpgrade("oral_tradition")).toBe(false); // pas deux fois

    // 1 nœud sur les 2 que demande le palier I : toujours fermé, rien n'est payé.
    expect(checkNodeAvailability("autel_du_culte")).toBe("locked");
    expect(buyUpgrade("autel_du_culte")).toBe(false);
    expect(D(state.ruins).toNumber()).toBe(1000 - cost);
  });

  it("la Grammaire des ruines remise les nœuds suivants de 10 %", () => {
    setup({ ruins: 1000 });
    expect(buyUpgrade("oral_tradition")).toBe(true);
    expect(buyUpgrade("grammaire_des_ruines")).toBe(true);
    const raw = byId.encre_indelebile.cost.ruins;
    expect(ruinNodeCost(byId.encre_indelebile)).toBe(Math.ceil(raw * 0.9));
    expect(checkNodeAvailability("encre_indelebile")).toBe("available");
    const before = D(state.ruins).toNumber();
    expect(buyUpgrade("encre_indelebile")).toBe(true);
    expect(D(state.ruins).toNumber()).toBe(before - Math.ceil(raw * 0.9));
  });

  it("Ruines insuffisantes : « cost », achat refusé, rien n'est payé", () => {
    setup({ ruins: 3 });
    expect(checkNodeAvailability("oral_tradition")).toBe("cost");
    expect(canBuyUpgrade(byId.oral_tradition)).toBe(false);
    expect(buyUpgrade("oral_tradition")).toBe(false);
    expect(D(state.ruins).toNumber()).toBe(3);
  });

  it("gel moteur (pause, chute, crise terminale) : aucun achat", () => {
    setup({ ruins: 1000 });
    setGamePaused(true);
    expect(buyUpgrade("oral_tradition")).toBe(false);
    setGamePaused(false);
    state.crisisLimitAnnounced = true;
    expect(buyUpgrade("oral_tradition")).toBe(false);
    expect(D(state.ruins).toNumber()).toBe(1000);
  });

  it("dogmes : ouverts au seuil de la branche, puis le jumeau est « blocked »", () => {
    setup({ ruins: 100000 });
    expect(checkDogmaAvailability("trait_theocracy")).toBe("locked");
    for (const id of ["oral_tradition", "grammaire_des_ruines", "autel_du_culte", "encre_indelebile"]) {
      expect(buyUpgrade(id), id).toBe(true);
    }
    expect(checkDogmaAvailability("trait_theocracy")).toBe("available");
    expect(buyUpgrade("trait_theocracy")).toBe(true);
    expect(checkDogmaAvailability("dogma_free_academies")).toBe("blocked");
    expect(buyUpgrade("dogma_free_academies")).toBe(false);
    expect(stateModule.state.upgrades.dogma_free_academies).toBeFalsy();
  });

  it("chaque branche se parcourt jusqu'à son capstone par les seuls nœuds « available »", () => {
    setup({ ruins: "1e40", cycles: 99 });
    for (let pass = 0; pass < PRESTIGE_TREE.length; pass++) {
      const next = PRESTIGE_TREE.find((node) => checkNodeAvailability(node.id) === "available");
      if (!next) break;
      expect(buyUpgrade(next.id), next.id).toBe(true);
    }
    const missing = PRESTIGE_TREE.filter((node) => !state.upgrades[node.id]).map((node) => node.id);
    expect(missing).toEqual([]);
  });
});

describe("Effondrement mené jusqu'au bout (TEST-3 c)", () => {
  const buildingTotal = () => Object.values(state.buildings).reduce((sum, n) => sum + n, 0);

  it("Édit, déclencheur « temps » : la séquence part et fonde le cycle suivant", async () => {
    setup({
      cycles: 12, instability: 0.5, timeWear: 0.3,
      upgrades: { conseil_de_crise: true, edit_effondrement: true },
      cycleStartedAt: FIXED_NOW - 20 * 60_000, // 20 min de cycle : le seuil (10 min) est passé
      crisisDoctrine: { autoCollapse: { enabled: true, trigger: "temps", timeSeconds: 600, usureThreshold: 0.9, prepare: false } }
    });
    const cycles = state.cycles;
    const ruins = D(state.ruins);
    expect(buildingTotal()).toBeGreaterThan(0);

    checkAutoCollapse();
    expect(stateModule.collapseInProgress).toBe(true);
    expect(stateModule.gamePaused).toBe(true);
    expect(state.cycles).toBe(cycles); // rien d'écrit avant le deuil (invariant §1.3)

    await vi.advanceTimersByTimeAsync(2500);
    expect(state.cycles).toBe(cycles + 1);
    expect(state.prevCycle.cause).toBe("auto_collapse");
    const gain = D(state.prevCycle.ruinGain);
    expect(gain.gt(0)).toBe(true);
    expect(D(state.ruins).eq(ruins.add(gain))).toBe(true);
    expect(buildingTotal()).toBe(0);
    expect(state.mourning).toBe(false);
    expect(stateModule.collapseInProgress).toBe(false);
    expect(stateModule.gamePaused).toBe(false);
  });

  it("collapse(\"manual\") : refusé hors crise ; en crise, le testament gravé fonde le cycle sans dialogue", async () => {
    setup({ cycles: 12, instability: 0.5, timeWear: 0.3 });
    expect(collapse("manual")).toBe(false);
    expect(stateModule.collapseInProgress).toBe(false);

    setTestamentLegacy("legs_inconnu");
    expect(state.testamentLegacyId).toBeNull();
    setTestamentLegacy("granaries");
    expect(state.testamentLegacyId).toBe("granaries");

    state.timeWear = 1; // Usure pleine : la crise terminale est ouverte
    const cycles = state.cycles;
    const ruins = D(state.ruins);
    expect(collapse("manual")).toBe(true);
    expect(collapse("manual")).toBe(false); // déjà en cours
    await vi.advanceTimersByTimeAsync(2500);
    expect(state.cycles).toBe(cycles + 1);
    expect(state.nextEpitaphLegacy?.id).toBe("granaries");
    expect(state.prevCycle.cause).toBe("manual");
    expect(D(state.ruins).eq(ruins.add(D(state.prevCycle.ruinGain)))).toBe(true);
    expect(buildingTotal()).toBe(0);
    expect(state.mourning).toBe(false);
    expect(stateModule.collapseInProgress).toBe(false);
  });
});
