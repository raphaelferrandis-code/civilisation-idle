import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import Decimal from "break_infinity.js";

import { state } from "../../core/state.js";
import { seededRng } from "../../core/utils.js";
import { eras } from "../../data/world.js";
import { CM, CM_WONDERS, cmWonderSlot, WONDER_CLEAR_R } from "../layout.js";
import { cityMapWalkRoadKey } from "../agents.js";
import { updateCrisis } from "../quaysAndRiot.js";

// Audit 2026-10-05, PERF-6 — le test de dégagement des merveilles relisait l'ère
// (une boucle Decimal) pour chaque merveille, pour chaque passant au recrutement
// et pour chaque case de route au choix du but : 0,9 à 1,5 s de gel au
// déclenchement d'une émeute en fin de partie, 25 à 50 ms toutes les 5 s ensuite.
// Ces gardes tiennent le coût ET le comportement (la foule reste hors des parvis).

const R = WONDER_CLEAR_R + 2;
const saved = { population: state.population, wonders: state.wonders, instability: state.instability };

function city(eraIdx, wonderIds) {
  state.population = new Decimal(eras[eraIdx].at).mul(1.01);
  state.wonders = wonderIds;
  state.instability = 0.95;
  CM.TILE = 20;
  const N = 100, list = [], set = new Set();
  for (let gy = 0; gy <= N; gy += 1) for (let gx = 0; gx <= N; gx += 1) {
    if (gx % 4 && gy % 4) continue;
    list.push({ gx, gy }); set.add(cityMapWalkRoadKey(gx, gy));
  }
  CM.walkRoadList = list; CM.walkRoadSet = set;
  CM.layout = { gridN: 120, cx: 60, cy: 60, roadMap: new Map(list.map((c) => [c.gx + "," + c.gy, { mask: 15 }])) };
  CM.citizens = [];
  for (let i = 0; i < 1000; i += 1) {
    const c = list[(i * 7919) % list.length];
    CM.citizens.push({ gx: c.gx, gy: c.gy, x: (c.gx + 0.5) * 20, y: (c.gy + 0.5) * 20, tx: 0, ty: 0, fade: 1, charType: i % 6 === 0 ? 2 : 0 });
  }
  CM.rioters = []; CM.riotGoal = null; CM.riotCalmed = 0; CM.riotWindow = true; CM.riotFading = [];
}
const slotsOf = (ids) => CM_WONDERS.map((w, wi) => ids.includes(w.id) ? cmWonderSlot(wi, 120, 60, 60) : null).filter(Boolean);
const inClearing = (p, slots) => slots.some((s) => Math.hypot(p.gx - s.gx, p.gy - s.gy) <= R);

beforeEach(() => { vi.spyOn(Math, "random").mockImplementation(seededRng(7)); });
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(state, saved);
  CM.riotWindow = false; CM.rioters = []; CM.riotDraw = null; CM.citizens = [];
});

describe("PERF-6 — l'émeute ne relit plus l'ère case par case", () => {
  it("déclenchement et re-choix du but restent bon marché avec les six merveilles", () => {
    city(34, CM_WONDERS.map((w) => w.id));
    // On compte les comparaisons Decimal plutôt que les millisecondes : un seuil
    // de temps dépend de la machine (la CI, 2 à 3 fois plus lente, a fait tomber
    // « repick < 15 ms » à 19,8 ms), un compte d'opérations non. Le défaut d'origine
    // relisait l'ère (une boucle de gte sur les seuils d'ère) pour chaque merveille,
    // chaque passant et chaque case : des centaines de milliers de comparaisons.
    // Aujourd'hui : ~200 par appel (quelques lectures d'ère par frame).
    const gte = vi.spyOn(Decimal.prototype, "gte");
    updateCrisis(1 / 30, 1000);
    const first = gte.mock.calls.length;
    expect(CM.rioters.length).toBe(40);
    gte.mockClear();
    updateCrisis(1 / 30, 7000);                        // > 5 s : nouveau but
    const repick = gte.mock.calls.length;
    expect(first).toBeLessThan(5000);
    expect(repick).toBeLessThan(5000);
  });

  it("la foule reste hors du dégagement des merveilles ACTIVES, et seulement de celles-là", () => {
    // Ère 10 : le Palais (reEra 9) est relevé, la Cathédrale (reEra 13) pas encore.
    city(10, ["era_kingdom", "era_empire"]);
    const active = slotsOf(["era_kingdom"]), dormant = slotsOf(["era_empire"]);
    for (let f = 0; f < 300; f += 1) {
      updateCrisis(1 / 30, 1000 + f * 120);
      for (const p of CM.rioters) expect(inClearing(p, active)).toBe(false);
      expect(inClearing(CM.riotGoal, active)).toBe(false);
    }
    expect(CM.rioters.length).toBeGreaterThan(0);
    // La merveille pas encore relevée ne bloque rien : un but posé sur son parvis
    // est gardé (un but bloqué serait aussitôt re-tiré).
    const d = dormant[0];
    const onDormant = CM.walkRoadList.find((r) => Math.hypot(r.gx - d.gx, r.gy - d.gy) <= 2);
    expect(onDormant).toBeTruthy();
    CM.riotGoal = onDormant; CM.riotGoalAt = 99000;
    updateCrisis(1 / 30, 99030);
    expect(CM.riotGoal).toBe(onDormant);
    // Le même but sur le parvis ACTIF est refusé.
    const a = active[0];
    const onActive = CM.walkRoadList.find((r) => Math.hypot(r.gx - a.gx, r.gy - a.gy) <= 2);
    CM.riotGoal = onActive; CM.riotGoalAt = 99060;
    updateCrisis(1 / 30, 99090);
    expect(CM.riotGoal).not.toBe(onActive);
  });

  it("une merveille relevée en pleine émeute ferme son parvis dès la frame suivante", () => {
    city(10, ["era_kingdom", "era_empire"]);
    for (let f = 0; f < 20; f += 1) updateCrisis(1 / 30, 1000 + f * 100);
    // La ville atteint l'ère 13 : la Cathédrale se relève, la liste des routes sûres
    // doit être refiltrée (pas de cache périmé).
    state.population = new Decimal(eras[13].at).mul(1.01);
    const both = slotsOf(["era_kingdom", "era_empire"]);
    for (let f = 20; f < 200; f += 1) {
      updateCrisis(1 / 30, 1000 + f * 120);
      for (const p of CM.rioters) expect(inClearing(p, both)).toBe(false);
    }
  });
});
