import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});

import BuildingShop from "../BuildingShop.jsx";
import { state, setState, defaultState, invalidateRenderCache, buildingById } from "../../../game/core/state.js";
import { buildings } from "../../../game/data/buildings.js";
import { Decimal } from "../../../game/core/num.js";
import {
  buildingMilestoneInfo,
  buildingUnitFactor,
  buildingUnitFactorDec
} from "../../../game/core/mechanics/production/buildingOutput.js";

// BUG-45 (audit du 05/10) : au-delà de ~13 500 exemplaires d'un Moteur, le
// facteur unitaire déborde le float. La boutique affichait alors « effet
// indirect » sur chaque rangée (Decimal.mul(Infinity) rend 0) et « ⚡ ×inf »
// sur le badge de palier, alors que le moteur, lui, bascule en Decimal.

const clean = (html) => html.replace(/<!-- -->/g, "");

beforeEach(() => {
  setState(defaultState());
  invalidateRenderCache("all");
});

describe("boutique au-delà du float (BUG-45)", () => {
  it("le badge de palier passe en Decimal au lieu de « inf »", () => {
    const moteur = buildings.find((b) => b.category === "city");
    const savoir = buildings.find((b) => b.category === "knowledge");
    // Sous le plafond : le number d'origine, à l'identique.
    expect(buildingMilestoneInfo(moteur, 250).bonus).toBe(1024);
    const fin = buildingMilestoneInfo(moteur, 48000);
    expect(fin.bonus).toBeInstanceOf(Decimal);
    expect(fin.label).not.toMatch(/inf/);
    expect(buildingMilestoneInfo(savoir, 48000).bonus).toBeInstanceOf(Decimal);
  });

  it("le miroir Decimal du facteur unitaire suit le float sous le plafond", () => {
    const port = buildingById.river_ports || buildings[0];
    const f = buildingUnitFactor(port, 400);
    expect(buildingUnitFactorDec(port, 400).toNumber() / f).toBeCloseTo(1, 9);
    expect(Number.isFinite(buildingUnitFactor(port, 48000))).toBe(false);
    expect(buildingUnitFactorDec(port, 48000).gt(new Decimal("1e308"))).toBe(true);
  });

  it("multiplicateur global encore fini, un seul Moteur à 14 000 : pas de « +inf/s »", () => {
    // Le cas d'origine : globalMult reste un number, seul le facteur unitaire
    // déborde — l'ancien produit en float affichait « +inf/s ».
    const moteur = buildings.find((b) => b.category === "city");
    state.buildings[moteur.id] = 14000;
    invalidateRenderCache("all");
    const html = clean(renderToString(<BuildingShop />));
    expect(html).toMatch(/pr-prod-item res-[a-z]+"[^>]*>\+\d\.\d\de\d+\/s/);
    expect(html).not.toMatch(/effet indirect|indirect effect|\+inf|×inf/);
  });

  it("à 48 000 exemplaires, chaque rangée dit encore ce qu'elle produit", () => {
    for (const b of buildings) state.buildings[b.id] = 48000;
    invalidateRenderCache("all");
    const html = clean(renderToString(<BuildingShop />));
    expect(html).toContain("pr-prod-item res-");
    expect(html).not.toMatch(/effet indirect|indirect effect/);
    expect(html).not.toMatch(/×inf|\+inf/);
    // Le badge de palier s'écrit en notation scientifique.
    expect(html).toMatch(/pr-milestone-badge[^>]*>(<i[^>]*><\/i>)?×\d\.\d\de\d+/);
  });
});
