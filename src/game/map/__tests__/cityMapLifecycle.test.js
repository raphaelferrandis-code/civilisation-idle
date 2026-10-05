// CYCLE DE VIE DE LA CARTE MONTÉE (audit 2026-10-05, lot 6) : capture live
// (BUG-89), repeinte après réallocation du canvas (BUG-90), état d'entrée remis à
// zéro au démontage (BUG-91).
//
// ⚠ La VRAIE carte est montée sur un FAUX DOM (canvas, fenêtre, rAF tenu à la
// main) ; seul le peintre (drawIsoWorld) est remplacé par un espion, qui relève
// l'état de la frame au moment où elle serait peinte. Le plan, la boucle, la
// capture et les écouteurs sont les vrais. Une nouvelle partie : le plan d'un
// campement se calcule en quelques dizaines de ms.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ CM: null, draws: [], weather: null, ambiance: 1 }));

vi.mock("../iso/isoRenderer.js", async (orig) => ({
  ...(await orig()),
  drawIsoWorld: vi.fn(() => {
    const { CM } = h;
    h.draws.push({
      rainF: CM.rainF, dayP: CM.dayP, ambianceK: CM.ambianceK, riotWindow: CM.riotWindow,
      rioters: CM.rioters, capture: !!CM.capture,
    });
    return true;
  }),
}));
vi.mock("../weatherMode.js", async (orig) => ({ ...(await orig()), weatherState: () => h.weather }));
vi.mock("../ambianceMode.js", async (orig) => ({ ...(await orig()), ambianceK: () => h.ambiance }));
// La grâce de la première partie tient le ciel dégagé et le jour levé : hors sujet ici.
vi.mock("../firstGameGrace.js", async (orig) => ({ ...(await orig()), firstGameGraceActive: () => false }));

import { CM, applyCityMapQuality } from "../cityMapRuntime.js";
import { startCityMapRuntime, resetCityMapRuntime } from "../loadCityMapScripts.js";

h.CM = CM;

// ── Faux DOM ────────────────────────────────────────────────────────────────
const noop = () => {};
const ctx = new Proxy({}, {
  get: (o, k) => (k in o ? o[k] : noop),
  set: (o, k, v) => { o[k] = v; return true; },
});
const target = (extra) => Object.assign(new EventTarget(), extra);
const ev = (type, props) => Object.assign(new Event(type), props);

let canvas, rafQueue, active, saved;
beforeAll(() => {
  saved = { window: globalThis.window, document: globalThis.document, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  globalThis.window = target({ devicePixelRatio: 1, location: { search: "" } });
  globalThis.document = { querySelector: () => null, getElementById: () => null, createElement: () => ({ getContext: () => ctx }) };
  rafQueue = [];
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = noop;
});
afterAll(() => {
  resetCityMapRuntime();
  Object.assign(globalThis, { window: saved.window, document: saved.document, requestAnimationFrame: saved.raf, cancelAnimationFrame: saved.caf });
});

function mount() {
  const root = target({ clientWidth: 800, contains: () => true, querySelector: () => null });
  canvas = target({
    clientWidth: 800, clientHeight: 600, width: 0, height: 0, style: {}, parentElement: root,
    getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture: noop,
    toDataURL: () => "data:image/png;base64,",
  });
  active = true;
  rafQueue.length = 0;
  startCityMapRuntime(canvas, { mapRoot: root, isActive: () => active });
}
// Une frame de la boucle, comme le navigateur la donnerait (horloge de
// performance.now, sans quoi le cap de frame la refuserait).
let clock = 0;
function tick() {
  clock = Math.max(clock + 40, performance.now() + 40);
  for (const cb of rafQueue.splice(0)) cb(clock);
}
const RAIN = { rainF: 0.8, windX: 0.3, gustF: 0 };
const CLEAR = { rainF: 0, windX: 0, gustF: 0 };

beforeEach(() => { h.draws.length = 0; h.weather = CLEAR; h.ambiance = 1; });

describe("« Garder une image » : la scène à l'heure qu'il est (BUG-89)", () => {
  // Heure murale fixée DANS la fenêtre d'émeute (dayP = 0,5 ; cycle de 9 min).
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(540000 * 4000 + 0.5 * 540000));
    mount();
    tick(); tick();
  });
  afterAll(() => { vi.useRealTimers(); });

  it("une capture déterministe sous l'averse ne recale plus la foule", () => {
    h.weather = RAIN;
    tick();
    expect(CM._weatherStep).toBe(2);
    expect(CM.weatherCrowdK).toBe(0.35);
    h.draws.length = 0;
    CM.captureFrame({});
    // Le cliché du harnais reste au sec…
    expect(h.draws.at(-1)).toMatchObject({ capture: true, rainF: 0 });
    // …mais la foule, elle, n'a pas bougé (avant : palier 0, foule pleine, puis
    // recalée à rebours à la frame suivante).
    expect(CM._weatherStep).toBe(2);
    expect(CM.weatherCrowdK).toBe(0.35);
  });

  it("la capture live garde l'averse, l'ambiance réglée, l'heure et l'émeute", () => {
    h.weather = RAIN;
    h.ambiance = 0;                      // « Vie de la carte : aucune »
    tick();
    const rioters = CM.rioters;
    h.draws.length = 0;
    CM.captureFrame({ live: true, night: CM.nightF, health: CM.healthF, now: clock + 40 });
    const live = h.draws.at(-1);
    expect(live.capture).toBe(true);
    expect(live.rainF).toBe(0.8);
    expect(live.ambianceK).toBe(0);
    expect(live.dayP).toBeCloseTo(0.5, 3);
    expect(live.riotWindow).toBe(true);
    expect(live.rioters).toBe(rioters);   // la vraie foule d'émeute, pas un tableau jetable
    // Le cliché du harnais, lui, reste déterministe.
    CM.captureFrame({});
    const det = h.draws.at(-1);
    expect(det).toMatchObject({ rainF: 0, ambianceK: 1, dayP: null, riotWindow: false });
    expect(det.rioters).not.toBe(rioters);
    expect(CM.rioters).toBe(rioters);     // remise en place après le cliché
  });
});

describe("canvas réalloué : repeint dans la même image (BUG-90)", () => {
  beforeAll(() => { mount(); tick(); tick(); });

  it("un redimensionnement repeint tout de suite, sans chaîne rAF de plus", () => {
    const pending = rafQueue.length;
    h.draws.length = 0;
    canvas.clientWidth = 900;
    window.dispatchEvent(new Event("resize"));
    expect(canvas.width).toBe(900);
    expect(h.draws.length).toBe(1);
    expect(rafQueue.length).toBe(pending);
    // Même taille : rien de réalloué, rien à repeindre.
    window.dispatchEvent(new Event("resize"));
    expect(h.draws.length).toBe(1);
  });

  it("un changement de Qualité qui réalloue repeint même derrière le dialogue d'Options", () => {
    active = false;                       // dialogue ouvert : la boucle est en pause
    tick();
    h.draws.length = 0;
    canvas.clientWidth = 840;
    applyCityMapQuality();
    expect(h.draws.length).toBe(1);
    // Sans réallocation, la boucle en pause reste en pause.
    applyCityMapQuality();
    expect(h.draws.length).toBe(1);
    active = true;
  });
});

describe("démontage : l'état d'entrée ne survit pas (BUG-91)", () => {
  beforeEach(() => { mount(); tick(); });
  afterEach(() => { vi.useRealTimers(); });

  it("l'appui long en cours est annulé", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const before = vi.getTimerCount();
    canvas.dispatchEvent(ev("pointerdown", { pointerType: "touch", pointerId: 1, clientX: 40, clientY: 30 }));
    expect(vi.getTimerCount()).toBe(before + 1);
    resetCityMapRuntime();
    expect(vi.getTimerCount()).toBe(before);
  });

  it("le pointeur et le passant survolé sont oubliés", () => {
    canvas.dispatchEvent(ev("mousemove", { clientX: 120, clientY: 80 }));
    expect(CM._mouse).toEqual({ x: 120, y: 80 });
    CM.hoverPick = { kind: "citizen", p: {} };
    resetCityMapRuntime();
    expect(CM._mouse).toBe(null);
    expect(CM.hoverPick).toBe(null);
    expect(CM._cursorBase).toBe(null);
  });
});
