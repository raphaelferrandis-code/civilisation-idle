// L'ANNEAU VIDE (docs/PLAN-LISIBILITE.md, G1, 2026-10-06) — la « grille » d'un regard
// extérieur : aux bandes cosmiques, la demande de lots comptait 3 tirages sur 10 en géants
// 2×2, alors que ~2 % se posent (repli sur le gratte-ciel d'une case). La ville ouvrait un
// anneau d'îlots vides, quadrillé de rues nues (31 % des cases de rue à la bande 8).
// Gardes : (1) une ville neuve n'a plus d'anneau ; (2) une partie existante (fiche v4) le
// referme UNE fois — aucune maison, aucune halle ne bouge, toutes les maisons-moteur
// restent logées — puis plus rien ne bouge.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ENGINE_HOME_LOOKAHEAD, ILOT_BIG, ILOT_MEMORY_V } from "../layout.js";
import { state } from "../../core/state.js";
import { growCity as grow } from "../../../test/city.js";

const BIG0 = { ...ILOT_BIG };
beforeEach(() => {
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
  state.wonders = [];
});
afterEach(() => { Object.assign(ILOT_BIG, BIG0); });

// Part des cases de rue (hors places) qui ne bordent RIEN de visible : ni bâtiment, ni
// place, ni parvis de merveille (8-voisinage).
function bareShare(L) {
  const built = new Set();
  for (const t of L.tiles) {
    if (t.type === "enginehome" && (t.revealIdx || 0) >= (L.counts.engineHomes | 0)) continue;   // pas encore révélée
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let a = 0; a < sx; a += 1) for (let b = 0; b < sy; b += 1) built.add((t.gx + a) + "," + (t.gy + b));
  }
  for (const k of L.wonderGround || []) built.add(k);
  let st = 0, bare = 0;
  for (const [k, m] of L.roadMeta) {
    if (!L.roadSet.has(k) || m.rank === "plaza") continue;
    st += 1;
    const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy += 1) for (let dx = -1; dx <= 1 && !near; dx += 1) {
      const q = (x + dx) + "," + (y + dy), mm = L.roadMeta.get(q);
      if (built.has(q) || (mm && mm.rank === "plaza")) near = true;
    }
    if (!near) bare += 1;
  }
  return bare / Math.max(1, st);
}
const homesOk = (L) => L.tiles.filter((t) => t.type === "enginehome").length === (L.counts.engineHomes | 0) + ENGINE_HOME_LOOKAHEAD;

describe("l'anneau d'îlots vides", () => {
  it("ville neuve, bande 7 : pas d'anneau, toutes les maisons-moteur logées", () => {
    const L = grow(36);
    expect(L.counts.eraBand).toBe(7);
    expect(homesOk(L), "maisons-moteur logées").toBe(true);
    expect(bareShare(L), "rues nues").toBeLessThan(0.12);
    // La demande s'est réglée sur ce qui s'est posé : le calcul suivant reste juste.
    expect(state.cityCore.ilot.big && state.cityCore.ilot.big.b).toBe(7);
    const L2 = grow(36);
    expect(homesOk(L2)).toBe(true);
    expect(L2.ilotBig.demand).toBeLessThanOrEqual(L.ilotBig.demand);
  });

  it("une partie existante (fiche v4) referme son anneau UNE fois, sans rien déplacer d'habité", () => {
    // La partie d'avant : la demande d'avant (géants comptés à la moyenne de liste).
    Object.assign(ILOT_BIG, { cosmicFit: 1, memo: false });
    grow(32);
    const L0 = grow(36);
    expect(L0.counts.eraBand).toBe(7);
    const bare0 = bareShare(L0);
    expect(bare0, "l'anneau d'avant existe bien").toBeGreaterThan(0.2);
    state.cityCore.ilot.v = 4;
    delete state.cityCore.ilot.big;
    const blocks0 = state.cityCore.ilot.blocks.length;
    const halls0 = { ...state.cityCore.ilot.halls };
    const houses0 = Object.entries(state.cityMapSlots).filter(([k]) => /:dec_/.test(k));
    // La mise à jour.
    Object.assign(ILOT_BIG, BIG0);
    const L = grow(36);
    expect(state.cityCore.ilot.v).toBe(ILOT_MEMORY_V);
    expect(homesOk(L), "maisons-moteur logées").toBe(true);
    expect(state.cityCore.ilot.blocks.length).toBeLessThan(blocks0 * 0.9);
    expect(bareShare(L), "rues nues").toBeLessThan(0.12);
    for (const [k, v] of houses0) {
      const w = state.cityMapSlots[k];
      expect(w && w.dx === v.dx && w.dy === v.dy, "maison " + k).toBe(true);
    }
    for (const [k, v] of Object.entries(halls0)) expect(state.cityCore.ilot.halls[k], "halle " + k).toBe(v);
    // Une seule fois.
    const slots = JSON.stringify(state.cityMapSlots), blocks = state.cityCore.ilot.blocks.join(" ");
    grow(36);
    expect(JSON.stringify(state.cityMapSlots)).toBe(slots);
    expect(state.cityCore.ilot.blocks.join(" ")).toBe(blocks);
  });
});
