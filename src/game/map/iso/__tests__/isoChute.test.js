"use strict";
// LA CHUTE SUR LA CARTE (docs/PLAN-CHUTE.md) — le metteur en scène, iso/isoChute.js :
// ce qu'il laisse quand la séquence casse, la lumière à ses raccords, les rues sous
// la vague, et où les ruines du cycle précédent ont le droit de se poser.
// (Audit du 05/10 : CHUTE-5, CHUTE-7, CHUTE-10, CHUTE-12, CHUTE-14.)
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CM } from "../../layout.js";
import { state, normalizeCityRelics } from "../../../core/state.js";
import { chuteFrame, chuteCollect } from "../isoChute.js";
import { CHUTE, CHUTE_TUNE, chuteMs, chuteWaveEnd } from "../chuteState.js";
import { abortCityFall, playCityFall, captureCityRelics, takeCityRelics, playCityRise } from "../../cityMapBridge.js";

const T = CM.TILE;
const saved = {};
beforeEach(() => {
  for (const k of ["layout", "canvas", "cam", "cw", "ch", "citizens", "vehicles", "citizenTarget", "nightF", "focus", "camGoal", "zoomGoal"]) saved[k] = CM[k];
  saved.relics = state.cityRelics;
  saved.seed = state.mapSeed;
});
afterEach(() => {
  abortCityFall();
  Object.assign(CM, { layout: saved.layout, canvas: saved.canvas, cam: saved.cam, cw: saved.cw, ch: saved.ch, citizens: saved.citizens, vehicles: saved.vehicles, citizenTarget: saved.citizenTarget, nightF: saved.nightF, focus: saved.focus, camGoal: saved.camGoal, zoomGoal: saved.zoomGoal });
  state.cityRelics = saved.relics;
  state.mapSeed = saved.seed;
  CHUTE.scrub = null;
});

// Une petite cité vide de bâti (le relevé à blanc n'a rien à dessiner), cœur en 20,20.
function mountCity() {
  const L = { tiles: [], gridN: 40, cx: 20, cy: 20, plan: { core: { x: 20, y: 20 } }, mapSeed: state.mapSeed >>> 0 };
  CM.layout = L;
  CM.canvas = { isConnected: true };
  CM.cam = { x: 20.5 * T, y: 20.5 * T, zoom: 1 };
  CM.cw = 1200; CM.ch = 700;
  return L;
}

describe("la séquence qui casse (abort)", () => {
  it("ne laisse pas de noir, même quand aucune chute n'a été jouée", () => {
    abortCityFall();
    expect(CHUTE.act).toBe(null);
    expect(CHUTE.fade).toBe(0);
    expect(CHUTE.done).toBe(false);
    let called = false;
    playCityRise(() => { called = true; });
    expect(called).toBe(true);            // pas de lever sur une chute qui n'a pas eu lieu
    expect(CHUTE.act).toBe(null);
  });

  it("efface le noir d'une chute arrivée au bout", () => {
    mountCity();
    expect(playCityFall()).toBeInstanceOf(Promise);
    CHUTE.scrub = 1e6;                      // bien après le fondu : le noir est atteint
    chuteFrame();
    expect(CHUTE.done).toBe(true);
    expect(CHUTE.fade).toBe(1);
    abortCityFall();
    expect(CHUTE.act).toBe(null);
    expect(CHUTE.fade).toBe(0);
  });

  it("rend les rues : la foule revient à sa cible, les charrettes à la flotte", () => {
    mountCity();
    const near = { x: 20.5 * T, y: 20.5 * T }, far = { x: 39 * T, y: 1 * T };
    CM.vehicles = [near, far];
    CM.citizens = [{ x: 20.5 * T, y: 21 * T }];
    CM.citizenTarget = 50;
    const flotte = CM.vehicles;
    playCityFall();
    CHUTE.scrub = CHUTE_TUNE.waveStart + 100;
    chuteFrame();
    // Sous la vague, la charrette QUITTE la flotte (elle n'est plus téléportée hors carte).
    expect(CM.vehicles).not.toContain(near);
    expect(CM.vehicles).toContain(far);
    expect(CM.citizens).toHaveLength(0);
    expect(CM.citizenTarget).toBe(0);
    abortCityFall();
    expect(CM.vehicles).toBe(flotte);
    expect(CM.vehicles).toContain(near);
    expect(CM.citizenTarget).toBe(50);
  });

  it("purge les ruines relevées : une chute hors ligne ne les prendra pas", () => {
    mountCity();
    expect(captureCityRelics()).toBe(true);
    abortCityFall();
    expect(takeCityRelics()).toBe(null);
  });

  it("un relevé qui lève ne casse pas la séquence", () => {
    const L = mountCity();
    Object.defineProperty(L, "tiles", { get() { throw new Error("relevé capricieux"); } });
    expect(() => captureCityRelics()).not.toThrow();
    expect(takeCityRelics()).toBe(null);
  });
});

// Audit du 05/10, CHUTE-2 : le geste de saut est à la chute seule. Le clic de la
// carte (fiche d'habitant, onglet d'un monument, fait divers) est écouté en CAPTURE
// sur son conteneur : seul un écouteur posé sur window, en capture, passe avant lui.
describe("le geste de saut", () => {
  const target = () => {
    const L = {};
    return {
      L,
      addEventListener: (type, f, capture) => { (L[type] ||= []).push({ f, capture }); },
      removeEventListener: (type, f) => { L[type] = (L[type] || []).filter((l) => l.f !== f); },
    };
  };
  const ev = (type, extra) => ({
    type, ...extra, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  });
  const fire = (on, e) => { for (const l of on.L[e.type] || []) l.f(e); return e; };

  it("Échap mène au noir sans rien laisser passer, et le clic sur la carte est avalé avant elle", () => {
    const win = target();
    vi.stubGlobal("window", win);
    try {
      mountCity();
      CM.canvas = Object.assign(target(), { isConnected: true });
      playCityFall();
      const esc = fire(win, ev("keydown", { key: "Escape" }));
      expect(esc.prevented && esc.stopped).toBe(true);     // ni les Options (App.jsx)…
      const T = CHUTE_TUNE;
      expect(chuteMs()).toBeGreaterThanOrEqual(chuteWaveEnd() + T.nightAt + T.nightMs + T.fadeAt - 1);
      const key = fire(win, ev("keydown", { key: "a" }));
      expect(key.prevented || key.stopped).toBe(false);     // …ni les autres touches
      // Le clic : en capture sur WINDOW (le conteneur de la carte passe avant le canevas).
      expect(win.L.click.map((l) => l.capture)).toEqual([true]);
      const onMap = fire(win, ev("click", { target: CM.canvas }));
      expect(onMap.prevented && onMap.stopped).toBe(true);
      const onButton = fire(win, ev("click", { target: {} }));
      expect(onButton.prevented || onButton.stopped).toBe(false);
      abortCityFall();
      expect(win.L.click).toHaveLength(0);                  // la carte rend ses clics
      expect(win.L.keydown).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("le suivi d'un habitant", () => {
  it("s'arrête quand la cité tombe : la vague part du cœur", () => {
    mountCity();
    CM.focus = { p: { x: 3 * T, y: 3 * T }, kind: "citizen", cam: true };
    playCityFall();
    expect(CM.focus).toBe(null);
    expect(CM.camGoal).toEqual({ x: 20.5 * T, y: 20.5 * T });
  });
});

describe("les raccords de lumière", () => {
  it("une chute qui part de nuit ne commence pas en plein jour", () => {
    mountCity();
    playCityFall();
    CHUTE.scrub = 0;
    CM.nightF = 1;                           // l'horloge murale : pleine nuit
    chuteFrame();
    expect(CM.nightF).toBe(1);
    CM.nightF = 1;
    CHUTE.scrub = CHUTE_TUNE.duskInMs;       // puis le crépuscule de la chute
    chuteFrame();
    expect(CM.nightF).toBeCloseTo(CHUTE_TUNE.duskNight, 6);
  });

  it("l'aube du lever finit à l'heure de l'horloge", () => {
    const R = CHUTE_TUNE;
    const dawnEnd = R.riseBlackMs + R.riseFadeMs + R.riseNightMs + R.riseDawnMs;
    CHUTE.act = "rise"; CHUTE.t0 = 0; CHUTE.fade = 1;
    CHUTE.scrub = dawnEnd - 1;
    CM.nightF = 1;                           // il fait nuit à l'horloge
    chuteFrame();
    expect(CM.nightF).toBeGreaterThan(0.99);  // rien ne retombe d'un coup à la reprise
    CHUTE.scrub = dawnEnd + 1;
    CM.nightF = 0.3;
    chuteFrame();
    expect(CHUTE.act).toBe(null);
    expect(CM.nightF).toBeCloseTo(0.3, 6);
  });
});

describe("les ruines du cycle précédent", () => {
  it("ne se posent ni sur le parvis, ni sur la pelouse d'une merveille, ni sur un grand ensemble", () => {
    const L = mountCity();
    L.roadSet = new Set();
    L.wonderGround = new Set(["10,10"]);
    L.townGreen = new Set(["14,10"]);
    L.districts = [{ gx: 18, gy: 10, size: 2 }];
    const c = 20;   // ruines rangées relativement au centre de la grille
    const item = (gx, gy) => [gx - c, gy - c, 0];
    state.cityRelics = { v: 2, seed: state.mapSeed >>> 0, keys: ["h|domus|0||0"], forms: [[0, 1, 1, -1000, -2000, 2000, 2000]],
      items: [item(10, 10), item(14, 10), item(19, 11), item(24, 10)].flat() };
    const items = [];
    chuteCollect(items, L);
    const at = items.filter((it) => it.kind === "relic").map((it) => it.r.gx + "," + it.r.gy);
    expect(at).toEqual(["24,10"]);
  });

  // Audit du 05/10, CHUTE-14 : la sauvegarde range les ruines au format v2 ; une
  // sauvegarde au premier format, convertie au chargement, se rejoue à l'identique.
  it("un relevé v1 rechargé se rejoue tel quel : mêmes cadres, même ordre, monuments debout", () => {
    const L = mountCity();
    L.roadSet = new Set();
    const keys = ["h|domus|0||0", "p|courthouses-basilica-grand"];
    const v1 = [
      [-3, -2, 1, 1, 0, -17.5, -33.25, 49.9, 58.8, 0],
      [2, 1, 2, 2, 1, -60.07, -140.13, 176.01, 160.3, 1],
      [2, 1, 2, 2, 1, -12.33, -96.5, 40.2, 51.17, 1],
      [-1, -4, 1, 1, 0, -17.5, -33.25, 49.9, 58.8, 0],
    ];
    state.cityRelics = normalizeCityRelics({ v: 1, seed: state.mapSeed >>> 0, n: 40, keys, items: v1 });
    expect(state.cityRelics.v).toBe(2);
    const items = [];
    chuteCollect(items, L);
    const got = items.filter((it) => it.kind === "relic").map(({ r }) => [r.gx - 20, r.gy - 20, r.sx, r.sy, r.k, r.x, r.y, r.w, r.h]);
    expect(got).toEqual(v1.map((it) => [...it.slice(0, 4), keys[it[4]], ...it.slice(5, 9)]));
    // Les pièces de la scène moteur (monuments) ne sont jamais arasées.
    expect(items.filter((it) => it.kind === "relic" && it.r.kind === "p").every((it) => !it.r.razed)).toBe(true);
  });
});
