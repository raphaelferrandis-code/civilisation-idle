import { afterEach, describe, expect, it, vi } from 'vitest';
import { CM } from '../layout.js';
import { SUN_SHADOW, drawSunShadow, sunShadowAlpha } from '../iso/isoSunShadow.js';

const saved = { night: CM.nightF, lod: CM.lodActive, on: SUN_SHADOW.on };
afterEach(() => {
  CM.nightF = saved.night; CM.lodActive = saved.lod; SUN_SHADOW.on = saved.on;
  vi.unstubAllGlobals();
});
describe('ombres solaires', () => {
  it('disparaît la nuit, en rendu allégé et quand désactivée', () => {
    SUN_SHADOW.on = true; CM.lodActive = false; CM.nightF = 0;
    expect(sunShadowAlpha()).toBeGreaterThan(0);
    CM.nightF = 1; expect(sunShadowAlpha()).toBe(0);
    CM.nightF = 0; CM.lodActive = true; expect(sunShadowAlpha()).toBe(0);
    CM.lodActive = false; SUN_SHADOW.on = false; expect(sunShadowAlpha()).toBe(0);
  });
  it('respecte le fondu du sprite et conserve son pied sur le sol', () => {
    SUN_SHADOW.on = true; CM.nightF = 0; CM.lodActive = false;
    const bake = { drawImage: vi.fn(), fillRect: vi.fn() };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => bake }) });
    const ctx = { globalAlpha: 0.25, save: vi.fn(), restore: vi.fn(), transform: vi.fn(), drawImage: vi.fn() };
    drawSunShadow(ctx, { width: 50, height: 100 }, 10, 20, 50, 100, 0, 0, 0, 0, 0.92);
    expect(ctx.globalAlpha).toBeCloseTo(0.25 * SUN_SHADOW.alpha);
    const [a, b, c, d, e, f] = ctx.transform.mock.calls[0];
    expect(a * 25 + c * 92 + e).toBeCloseTo(35);
    expect(b * 25 + d * 92 + f).toBeCloseTo(112);
  });
});
