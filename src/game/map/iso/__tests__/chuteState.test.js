"use strict";
// LA CHUTE (docs/PLAN-CHUTE.md) — l'horloge de la vague : du cœur vers les faubourgs,
// chaque tuile tremble, cède, et sa poussière couvre la bascule.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CHUTE, CHUTE_TUNE, DUST_FRAMES, chuteFallAt, chuteFallenRadius, chuteTileState, chuteWaveEnd,
} from "../chuteState.js";

const tile = (gx, gy) => ({ gx, gy, spanX: 1, spanY: 1 });

beforeEach(() => {
  CHUTE.act = "fall";
  CHUTE.core = { x: 50, y: 50 };
  CHUTE.maxD = 30;
  CHUTE.fall = new WeakMap();
  CHUTE.t0 = 0;
  CHUTE.scrub = 0;
});
afterEach(() => {
  CHUTE.act = null;
  CHUTE.scrub = null;
});

describe("la vague", () => {
  it("part du cœur : une tuile lointaine tombe après une tuile proche", () => {
    const near = chuteFallAt(tile(50, 50));
    const mid = chuteFallAt(tile(62, 50));
    const far = chuteFallAt(tile(78, 50));
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(far);
    expect(near).toBeGreaterThanOrEqual(CHUTE_TUNE.waveStart - CHUTE_TUNE.waveJitter);
  });

  it("le bord de l'écran (rayon maxD) tombe vers la fin de la traversée", () => {
    const edge = chuteFallAt(tile(50 + 30 - 0.5, 49.5));
    const T = CHUTE_TUNE;
    expect(Math.abs(edge - (T.waveStart + T.waveDur))).toBeLessThanOrEqual(T.waveJitter / 2 + 1);
    expect(edge).toBeLessThan(chuteWaveEnd());
  });

  it("le rayon tombé croît avec le temps et vaut maxD au bout de la traversée", () => {
    const T = CHUTE_TUNE;
    expect(chuteFallenRadius(T.waveStart - 1)).toBeLessThan(0);
    const a = chuteFallenRadius(T.waveStart + T.waveDur * 0.3);
    const b = chuteFallenRadius(T.waveStart + T.waveDur * 0.6);
    expect(b).toBeGreaterThan(a);
    expect(chuteFallenRadius(T.waveStart + T.waveDur)).toBeCloseTo(CHUTE.maxD, 6);
  });

  it("une tuile reste debout, tremble, puis devient ruine — la poussière part avant la bascule", () => {
    const t = tile(60, 52);
    const tf = chuteFallAt(t);
    const T = CHUTE_TUNE;
    CHUTE.scrub = tf - T.shakeMs - 1;
    expect(chuteTileState(t)).toBeNull();
    CHUTE.scrub = tf - T.dustLead + 1;
    const shaking = chuteTileState(t);
    expect(shaking.ph).toBe("shake");
    expect(shaking.dust).toBeGreaterThanOrEqual(0);
    CHUTE.scrub = tf + 1;
    const ruin = chuteTileState(t);
    expect(ruin.ph).toBe("ruin");
    expect(ruin.dust).toBeGreaterThanOrEqual(0);
    expect(ruin.dust).toBeLessThan(DUST_FRAMES);
    CHUTE.scrub = tf - T.dustLead + T.dustMs + 1;
    expect(chuteTileState(t)).toEqual({ ph: "ruin", dust: -1 });   // le nuage est retombé
  });

  it("hors de la chute, rien ne bouge", () => {
    CHUTE.act = null;
    expect(chuteTileState(tile(50, 50))).toBeNull();
    CHUTE.act = "rise";
    expect(chuteTileState(tile(50, 50))).toBeNull();
  });

  it("la gigue est fixe par tuile (pas de tremblement d'une frame à l'autre)", () => {
    const a = chuteFallAt(tile(55, 41));
    CHUTE.fall = new WeakMap();
    expect(chuteFallAt(tile(55, 41))).toBe(a);
  });
});
