// REBASAGE DES HORODATAGES ET HORLOGE SYSTÈME (audit 2026-10-05, BUG-8 et SAV-12).
// Un seul helper (offlineCredit.js, shiftStateTimestamps) décale toutes les
// minuteries du jeu : le versement de clepsydre (−spend) et l'horloge reculée en
// session. Ce qui se teste ici : la liste des champs ne laisse rien filer, le
// recul d'horloge ne crédite rien et ne fige plus les minuteries, et les
// échéances futures sont bornées au chargement.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state, setState, hydrateState, defaultState } from "../state.js";
import {
  decideTickCredit,
  shiftStateTimestamps,
  SHIFTED_STATE_FIELDS,
  UNSHIFTED_TIME_FIELDS,
  CLOCK_REWIND_TOLERANCE_SEC
} from "../offlineCredit.js";
import { startGameLoop } from "../main.js";
import { RAGNAROK_ARK_COOLDOWN_MS, ATRIDES_RENEGOTIATE_DURATION_MS, ATRIDES_RENEGOTIATE_COOLDOWN_MS } from "../../data/myths.js";
import { VIDEUR_BANNI_MIN, NUIT_DUREE_MIN, NUIT_INTERVAL_H, SPECTACLE_DUREE_MIN } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("decideTickCredit — recul de l'horloge murale (SAV-12)", () => {
  it("un recul de plus de la tolérance → 'rewind', même onglet caché", () => {
    expect(decideTickCredit(-3600, false)).toEqual({ mode: "rewind", seconds: -3600 });
    expect(decideTickCredit(-3600, true)).toEqual({ mode: "rewind", seconds: -3600 });
  });

  it("la gigue sous la tolérance reste un tick 'live' à 0 s", () => {
    expect(decideTickCredit(-CLOCK_REWIND_TOLERANCE_SEC, false)).toEqual({ mode: "live", seconds: 0 });
    expect(decideTickCredit(-1, false)).toEqual({ mode: "live", seconds: 0 });
  });
});

describe("shiftStateTimestamps — un seul helper pour toutes les minuteries", () => {
  // Un nom d'horodatage dans defaultState() qui n'est ni décalé ni exclu en connaissance
  // de cause = une minuterie qui resterait figée pendant un versement de clepsydre.
  const TIME_KEY = /(At|Until|CooldownEnd|Debut|Fin|Prochaine|Jusqua)$/;

  it("tout champ horodaté de premier niveau est décalé ou explicitement exclu", () => {
    const keys = Object.keys(defaultState()).filter((k) => TIME_KEY.test(k));
    expect(keys.length).toBeGreaterThan(10);
    const known = new Set([...SHIFTED_STATE_FIELDS, ...UNSHIFTED_TIME_FIELDS]);
    expect(keys.filter((k) => !known.has(k))).toEqual([]);
  });

  it("décale les champs de premier niveau ET imbriqués ; 0 et null ne bougent pas", () => {
    const s = hydrateState({
      ...MID_GAME_FIXTURE,
      nextBoonAt: FIXED_NOW + 5 * MIN,
      roueAt: FIXED_NOW - 10 * MIN,
      trunkAt: 0,
      crisisOpenedAt: null,
      activeEpitaphLegacy: { id: "granaries", cause: "famine", chosenCycle: 3, startedAt: FIXED_NOW - HOUR },
      stewardClauses: [{ threshold: 0.65, actionId: "rationing", enabled: true, lastAt: FIXED_NOW - MIN }]
    });
    s.templeAuto.osselets.lastAt = FIXED_NOW - 2 * MIN;
    s.olympus.lastInteractionAt = FIXED_NOW - 3 * MIN;
    const cycleStartedAt = s.cycleStartedAt;
    shiftStateTimestamps(s, -HOUR);
    expect(s.cycleStartedAt).toBe(cycleStartedAt - HOUR);
    expect(s.nextBoonAt).toBe(FIXED_NOW + 5 * MIN - HOUR);
    expect(s.roueAt).toBe(FIXED_NOW - 10 * MIN - HOUR);
    expect(s.activeEpitaphLegacy.startedAt).toBe(FIXED_NOW - 2 * HOUR);
    expect(s.stewardClauses[0].lastAt).toBe(FIXED_NOW - MIN - HOUR);
    expect(s.templeAuto.osselets.lastAt).toBe(FIXED_NOW - 2 * MIN - HOUR);
    expect(s.templeAuto.icarus.lastAt).toBe(0); // jamais joué : reste « jamais »
    expect(s.olympus.lastInteractionAt).toBe(FIXED_NOW - 3 * MIN - HOUR);
    expect(s.trunkAt).toBe(0);
    expect(s.crisisOpenedAt).toBe(null);
    // lastTick est l'affaire de l'appelant.
    const lastTick = s.lastTick;
    shiftStateTimestamps(s, -HOUR);
    expect(s.lastTick).toBe(lastTick);
  });
});

describe("horloge système reculée en session (SAV-12)", () => {
  let listeners;
  beforeEach(() => {
    listeners = {};
    const on = (type, fn) => { (listeners[type] ||= []).push(fn); };
    const off = (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); };
    globalThis.window = { addEventListener: on, removeEventListener: off };
    globalThis.document = { hidden: false, addEventListener: on, removeEventListener: off };
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    delete globalThis.window;
    delete globalThis.document;
  });

  it("un recul d'un jour ne crédite rien et les minuteries suivent : âge du cycle et échéances conservés", () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, instability: 0.1, lastTick: FIXED_NOW, nextBoonAt: FIXED_NOW + 5 * MIN }));
    const cleanup = startGameLoop();
    vi.advanceTimersByTime(1000); // un tick normal
    const age = Date.now() - state.cycleStartedAt;
    const boonIn = state.nextBoonAt - Date.now();
    const food = state.food.toString();

    // L'horloge recule d'un jour entre deux ticks.
    vi.setSystemTime(Date.now() - DAY);
    vi.advanceTimersByTime(1000);
    expect(state.food.toString()).toBe(food); // aucun crédit sur le tick du recul
    expect(Date.now() - state.cycleStartedAt).toBeCloseTo(age, -4); // ± 10 s : le cycle ne rajeunit pas d'un jour
    expect(state.nextBoonAt - Date.now()).toBeCloseTo(boonIn, -4); // l'aubaine n'est pas repoussée d'un jour
    expect(Math.abs(Date.now() - state.lastTick)).toBeLessThan(2000);

    // Et la boucle repart normalement derrière.
    const played = state.playTimeSec || 0;
    vi.advanceTimersByTime(2000);
    expect(state.playTimeSec).toBe(played + 2);
    cleanup();
  });
});

describe("échéances futures bornées au chargement (SAV-12)", () => {
  const FAR_FUTURE = FIXED_NOW + 365 * DAY; // horloge en avance d'un an, puis corrigée

  it("les durées écrites en dur dans hydrateState (TDZ) suivent data/myths.js", () => {
    // Une échéance LÉGITIME (posée à l'instant) survit au rechargement.
    const s = hydrateState({
      ragnarokArkNextAt: FIXED_NOW + RAGNAROK_ARK_COOLDOWN_MS,
      atridesRenegotiateActiveUntil: FIXED_NOW + ATRIDES_RENEGOTIATE_DURATION_MS,
      atridesRenegotiateCooldownEnd: FIXED_NOW + ATRIDES_RENEGOTIATE_COOLDOWN_MS
    });
    expect(s.ragnarokArkNextAt).toBe(FIXED_NOW + RAGNAROK_ARK_COOLDOWN_MS);
    expect(s.atridesRenegotiateActiveUntil).toBe(FIXED_NOW + ATRIDES_RENEGOTIATE_DURATION_MS);
    expect(s.atridesRenegotiateCooldownEnd).toBe(FIXED_NOW + ATRIDES_RENEGOTIATE_COOLDOWN_MS);
    // Une échéance aberrante retombe à « maintenant + la durée ».
    const far = hydrateState({ ragnarokArkNextAt: FAR_FUTURE, atridesRenegotiateActiveUntil: FAR_FUTURE, atridesRenegotiateCooldownEnd: FAR_FUTURE });
    expect(far.ragnarokArkNextAt).toBe(FIXED_NOW + RAGNAROK_ARK_COOLDOWN_MS);
    expect(far.atridesRenegotiateActiveUntil).toBe(FIXED_NOW + ATRIDES_RENEGOTIATE_DURATION_MS);
    expect(far.atridesRenegotiateCooldownEnd).toBe(FIXED_NOW + ATRIDES_RENEGOTIATE_COOLDOWN_MS);
  });

  it("videur, Nuit et spectacle : bornés à leur plus longue durée, les débuts passés plafonnés à maintenant", () => {
    const s = hydrateState({
      bjBarreJusqua: FAR_FUTURE, nuitProchaine: FAR_FUTURE, spectacleFin: FAR_FUTURE,
      nuitDebut: FAR_FUTURE, spectacleDebut: FAR_FUTURE, roueAt: FAR_FUTURE
    });
    expect(s.bjBarreJusqua).toBe(FIXED_NOW + VIDEUR_BANNI_MIN * MIN);
    expect(s.nuitProchaine).toBe(FIXED_NOW + NUIT_DUREE_MIN * MIN + NUIT_INTERVAL_H * HOUR);
    expect(s.spectacleFin).toBe(FIXED_NOW + Math.max(NUIT_DUREE_MIN, SPECTACLE_DUREE_MIN) * MIN);
    expect(s.nuitDebut).toBe(FIXED_NOW);
    expect(s.spectacleDebut).toBe(FIXED_NOW);
    expect(s.roueAt).toBe(FIXED_NOW); // la roue attend une heure, pas un an
    // Les valeurs légitimes passent telles quelles.
    const ok = hydrateState({ bjBarreJusqua: FIXED_NOW + 10 * MIN, nuitProchaine: FIXED_NOW + 2 * HOUR, roueAt: FIXED_NOW - 5 * MIN });
    expect(ok.bjBarreJusqua).toBe(FIXED_NOW + 10 * MIN);
    expect(ok.nuitProchaine).toBe(FIXED_NOW + 2 * HOUR);
    expect(ok.roueAt).toBe(FIXED_NOW - 5 * MIN);
  });
});
