import { describe, it, expect, beforeEach } from "vitest";

import { CM } from "../layout.js";
import { state } from "../../core/state.js";
import { defaultParoles } from "../../core/parolesState.js";
import { GR_PERSISTENT_FIELDS } from "../../core/state.js";
import { focusCitizen, clearCitizenFocus } from "../citizenFocus.js";
import { buildIdentity, householdOf } from "../citizenIdentity.js";
import { startListening, listenView, listenOptions, stopListening, LISTEN } from "../paroles/listen.js";
import { PAROLES } from "../../data/paroles.js";

// ÉCOUTER EN JEU (docs/PLAN-ECOUTER-PARLER.md, lot 1) : la fiche propose d'écouter une
// causette ou des pensées ; ce qu'on entend vient du catalogue, avec les vrais
// prénoms du foyer, et ne se répète pas.

// Un foyer en couple avec enfants, à l'âge des villages.
function coupleHousehold() {
  for (let s = 1; s < 5000; s += 1) {
    const hh = householdOf(s * 7919, 2);
    if (hh.couple && hh.kids.length) return hh;
  }
  throw new Error("pas de foyer");
}
function citizen(hh, slot, extra = {}) {
  const fem = slot === "f";
  const identity = buildIdentity({ seed: slot === "m" ? 11 : 22, band: 2, fem, sprite: fem ? "villagerwoman" : "villager", household: hh, slot });
  return {
    name: identity.name, seed: identity.seed, fem, charType: fem ? 1 : 0, skinVariant: 0, phase: 0.3,
    gx: 4, gy: 4, x: 90, y: 90, lox: 0, loy: 0, pauseT: 0, dir: 0, home: null, work: null,
    goalKind: "wander", role: "porte un panier", identity, ...extra,
  };
}

beforeEach(() => {
  clearCitizenFocus();
  stopListening();
  state.paroles = defaultParoles();
  CM.TILE = 20;
  CM.cam = { x: 0, y: 0, zoom: 2 };
  CM.zoomGoal = 2;
  CM.nightF = 0; CM.rainF = 0; CM.healthF = 0.6; CM.rioters = []; CM.season = 1;
  CM.layout = { counts: { eraBand: 2 } };
  CM.tileGrid = new Map();
  CM.describeTile = (t) => ({ title: t.title });
  CM.citizens = [];
});

describe("écouter", () => {
  it("l'entendu est éternel : il survit au Grand Reset", () => {
    expect(GR_PERSISTENT_FIELDS).toContain("paroles");
  });

  it("une causette de couple : leurs vrais prénoms, la causette tenue le temps de l'échange, inscrite", () => {
    const hh = coupleHousehold();
    const a = citizen(hh, "m"), b = citizen(hh, "f");
    a._chatWith = b; b._chatWith = a; a.chatT = b.chatT = 2; a.pauseT = b.pauseT = 2;
    CM.citizens = [a, b];
    focusCitizen(a);
    expect(listenOptions()).toEqual({ chat: true, thought: true });
    expect(startListening("chat")).toBe(true);
    const L = CM.listening;
    expect(L.kind).toBe("chat");
    expect(L.names).toEqual({ a: hh.m.given, b: hh.f.given });
    // La causette dure le temps de toutes les répliques.
    expect(a.pauseT).toBeGreaterThanOrEqual((L.lines.length * LISTEN.lineMs) / 1000);
    expect(b.chatT).toBeGreaterThanOrEqual((L.lines.length * LISTEN.lineMs) / 1000);
    expect(state.paroles.heard[L.id]).toBe(1);
    expect(state.paroles.n).toBe(1);
    // Une réplique qui cite le conjoint le nomme vraiment.
    for (const l of L.lines) expect(l.fr).not.toMatch(/\{/);
  });

  it("les répliques arrivent une à une", () => {
    const hh = coupleHousehold();
    const a = citizen(hh, "m"), b = citizen(hh, "f");
    a._chatWith = b; b._chatWith = a; a.chatT = b.chatT = 2;
    CM.citizens = [a, b];
    focusCitizen(a);
    startListening("chat");
    const L = CM.listening;
    expect(listenView(L.t0).lines).toHaveLength(1);
    expect(listenView(L.t0).done).toBe(false);
    const end = L.t0 + L.lines.length * LISTEN.lineMs;
    expect(listenView(end).lines).toHaveLength(L.lines.length);
    expect(listenView(end).done).toBe(true);
  });

  it("seul, on écoute ses pensées ; et jamais deux fois la même tant qu'il en reste", () => {
    const hh = coupleHousehold();
    const a = citizen(hh, "m");
    CM.citizens = [a];
    focusCitizen(a);
    expect(listenOptions()).toEqual({ chat: false, thought: true });
    expect(startListening("chat")).toBe(false);
    const heard = new Set();
    for (let i = 0; i < 6; i += 1) {
      expect(startListening("thought")).toBe(true);
      const L = CM.listening;
      expect(L.kind).toBe("thought");
      expect(L.lines).toHaveLength(1);
      expect(heard.has(L.id)).toBe(false);
      heard.add(L.id);
      expect(PAROLES.find((e) => e.id === L.id).kind).toBe("thought");
    }
  });

  it("désigner quelqu'un d'autre coupe l'écoute", () => {
    const hh = coupleHousehold();
    const a = citizen(hh, "m"), b = citizen(hh, "f");
    CM.citizens = [a, b];
    focusCitizen(a);
    startListening("thought");
    expect(CM.listening).not.toBe(null);
    focusCitizen(b);
    expect(CM.listening).toBe(null);
    expect(listenView()).toBe(null);
  });
});
