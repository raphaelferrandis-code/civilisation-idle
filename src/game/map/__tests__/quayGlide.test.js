// LE QUAI NE SE RECUIT PLUS À CHAQUE FRAME D'UN ZOOM QUI GLISSE — garde du 2026-09-14.
// Mesuré chez Raph : 55-60 ms par frame de dézoom, six frames de suite, un canvas
// par frame, parce que la clé du bake porte le zoom au millième. La règle du sol
// (« une seule apparence par geste ») s'applique désormais au quai ; ces tests
// verrouillent la décision pure et le rectangle compensé.
import { describe, it, expect } from 'vitest';
import { quayGlideStale, quayGlideRect, QUAY_GLIDE_SETTLE_MS } from '../iso/quayGlide.js';

describe('quayGlideStale — servir l étiré pendant la rafale, recuire à l arrêt', () => {
  const qb = { camX: 0, camY: 0, other: 'q:1', zoomB: 1 };
  it('rafale en cours + zoom différent du bake → étiré (pas de recuisson)', () => {
    expect(quayGlideStale(qb, 0.89, 1000, 900)).toBe(true);
  });
  it('rafale finie (400 ms depuis le dernier changement d échelle) → recuisson', () => {
    expect(quayGlideStale(qb, 0.89, 1000 + QUAY_GLIDE_SETTLE_MS, 1000)).toBe(false);
  });
  it('même zoom que le bake → jamais étiré (le pan garde son chemin normal)', () => {
    expect(quayGlideStale(qb, 1, 1000, 990)).toBe(false);
  });
  it('sans bake, sans ancre, ou bake instable → recuisson', () => {
    expect(quayGlideStale(null, 0.9, 1000, 990)).toBe(false);
    expect(quayGlideStale({ camX: 0, camY: 0, other: 'q' }, 0.9, 1000, 990)).toBe(false);
    expect(quayGlideStale({ ...qb, other: '__unstable__' }, 0.9, 1000, 990)).toBe(false);
  });
  it('un glide de 30 frames ne recuit pas une seule fois, puis une fois à l arrêt', () => {
    let bakes = 0, b = { ...qb };
    let t = 0;
    for (let i = 0; i < 30; i += 1) {
      t += 16; const zoom = 1 - (i + 1) * 0.01; const zoomAt = t;   // le zoom change à chaque frame
      if (!quayGlideStale(b, zoom, t, zoomAt)) { bakes += 1; b = { ...qb, zoomB: zoom }; }
    }
    expect(bakes).toBe(0);
    const zoomAtEnd = t;
    t += QUAY_GLIDE_SETTLE_MS + 1;
    expect(quayGlideStale(b, 0.7, t, zoomAtEnd)).toBe(false);
  });
});

describe('quayGlideRect — les maths du sol, à l identique', () => {
  it('à échelle 1 et sans pan, le rectangle est le blit de marge ordinaire', () => {
    const r = quayGlideRect(1, 1, 800, 600, 64, { x: 0, y: 0 });
    expect(r).toEqual({ x: -64, y: -64, w: 928, h: 728 });
  });
  it('un dézoom de moitié centre le bake réduit sur l écran', () => {
    const r = quayGlideRect(0.5, 1, 800, 600, 0, { x: 0, y: 0 });
    expect(r.w).toBe(400); expect(r.h).toBe(300);
    expect(r.x + r.w / 2).toBe(400); expect(r.y + r.h / 2).toBe(300);
  });
  it('le delta de pan translate le rectangle', () => {
    const r0 = quayGlideRect(0.8, 1, 800, 600, 32, { x: 0, y: 0 });
    const r1 = quayGlideRect(0.8, 1, 800, 600, 32, { x: 10, y: -5 });
    expect(r1.x).toBeCloseTo(r0.x - 10); expect(r1.y).toBeCloseTo(r0.y + 5);
  });
});
