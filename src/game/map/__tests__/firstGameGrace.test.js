import { describe, it, expect } from 'vitest';
import { FIRST_GAME_GRACE_SEC, firstGameGraceActive, makeGraceLatch } from '../firstGameGrace.js';

const neuf = (over = {}) => ({
  cycles: 0, grandResetCount: 0, playTimeSec: 0,
  onboarding: { built: false, pressureSeen: false, collapsed: false },
  chronicleStats: { lifetimePlaySec: 0 },
  ...over,
});

describe('grâce de la toute première partie', () => {
  it('vaut pour une partie neuve, pendant les premières minutes seulement', () => {
    expect(firstGameGraceActive(neuf())).toBe(true);
    expect(firstGameGraceActive(neuf({ chronicleStats: { lifetimePlaySec: FIRST_GAME_GRACE_SEC - 1 } }))).toBe(true);
    expect(firstGameGraceActive(neuf({ chronicleStats: { lifetimePlaySec: FIRST_GAME_GRACE_SEC } }))).toBe(false);
  });

  it("ne vaut plus après un effondrement ni après un Grand Reset", () => {
    expect(firstGameGraceActive(neuf({ cycles: 1 }))).toBe(false);
    expect(firstGameGraceActive(neuf({ grandResetCount: 1 }))).toBe(false);
    // Après un Grand Reset, cycles repart à 0 : c'est le drapeau à vie qui tranche.
    expect(firstGameGraceActive(neuf({ onboarding: { collapsed: true } }))).toBe(false);
  });

  it("une save d'avant le registre (lifetimePlaySec à 0) ne regagne pas la grâce", () => {
    expect(firstGameGraceActive(neuf({ playTimeSec: 5000, chronicleStats: { lifetimePlaySec: 0 } }))).toBe(false);
    expect(firstGameGraceActive(neuf({ chronicleStats: undefined, playTimeSec: 5000 }))).toBe(false);
  });

  it('sans état, pas de grâce', () => {
    expect(firstGameGraceActive(null)).toBe(false);
    expect(firstGameGraceActive(undefined)).toBe(false);
  });
});

describe('verrou de grâce', () => {
  it('tient le calme pendant la grâce, quel que soit le temps réel', () => {
    const hold = makeGraceLatch();
    expect(hold(true, false)).toBe(true);
    expect(hold(true, true)).toBe(true);
  });

  it("à la fin de la grâce, attend que le réel soit calme avant de relâcher", () => {
    const hold = makeGraceLatch();
    hold(true, false);
    // Grâce finie en pleine averse : on tient encore…
    expect(hold(false, false)).toBe(true);
    expect(hold(false, false)).toBe(true);
    // …jusqu'à l'éclaircie réelle, puis on relâche pour de bon.
    expect(hold(false, true)).toBe(false);
    expect(hold(false, false)).toBe(false);
  });

  it('un vétéran est relâché dès le premier appel, même en pleine averse', () => {
    const hold = makeGraceLatch();
    expect(hold(false, false)).toBe(false);
    expect(hold(false, false)).toBe(false);
  });

  it('une fois relâché, il ne reprend jamais la main', () => {
    const hold = makeGraceLatch();
    hold(true, true);
    expect(hold(false, true)).toBe(false);
    expect(hold(true, false)).toBe(false);
  });
});
