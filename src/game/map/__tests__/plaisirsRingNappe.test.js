// LE CERNE DES PLAISIRS : LA NAPPE N'EST POSÉE QU'À PARTIR DU CRÉPUSCULE (décision de
// Raph du 2026-10-05, PERF-51 = B). De jour, ses 4 ellipses de 72 sommets en additif
// ne bougeaient l'eau que d'1 à 2 niveaux sur 255 ; sous 3 niveaux (alpha × 255 < 3),
// elles ne sont plus remplies. Les éclats et la guirlande, eux, restent ; la nuit,
// la nappe est là, inchangée.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { CM } from '../layout.js';
import { PLAISIRS_AURA, drawPlaisirsRing } from '../iso/isoPlaisirs.js';

function fauxCtx() {
  const log = [];
  return {
    log,
    globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000',
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() { log.push({ op: 'fill', style: this.fillStyle }); },
    fillRect() { log.push({ op: 'fillRect', style: this.fillStyle }); },
    createRadialGradient() { return { addColorStop() {} }; },
  };
}

const SPOT = { x: 20, y: 20, tx: 1, ty: 0 };
let saved;
beforeEach(() => {
  saved = { ctx: CM.ctx, cam: CM.cam, cw: CM.cw, ch: CM.ch, night: CM.nightF, lod: CM.lodActive, T: CM.TILE };
  CM.TILE = CM.TILE || 32;
  CM.cw = 1600; CM.ch = 900; CM.lodActive = false;
  CM.cam = { x: 20 * CM.TILE, y: 20 * CM.TILE, zoom: 1 };
});
afterEach(() => {
  CM.ctx = saved.ctx; CM.cam = saved.cam; CM.cw = saved.cw; CM.ch = saved.ch;
  CM.nightF = saved.night; CM.lodActive = saved.lod; CM.TILE = saved.T;
});

// Remplissages de la NAPPE : les seuls `fill()` du cerne peints d'un aplat rgba
// (les halos de la guirlande, la nuit, sont des dégradés posés en fillRect).
const nappe = (log) => log.filter((e) => e.op === 'fill' && typeof e.style === 'string');

describe('cerne des Plaisirs : la nappe au crépuscule seulement', () => {
  it('en plein jour : ni nappe, mais éclats et guirlande', () => {
    CM.nightF = 0;
    const ctx = fauxCtx(); CM.ctx = ctx;
    for (const now of [0, 800, 1600, 2400, 3200]) drawPlaisirsRing(SPOT, now);
    expect(nappe(ctx.log)).toHaveLength(0);
    expect(ctx.log.filter((e) => e.op === 'fillRect').length).toBeGreaterThan(0);
  });

  it('la nuit : les 4 bandes, à la dose de toujours', () => {
    CM.nightF = 1;
    const ctx = fauxCtx(); CM.ctx = ctx;
    drawPlaisirsRing(SPOT, 0);
    const bands = nappe(ctx.log);
    expect(bands).toHaveLength(PLAISIRS_AURA.bands);
    // breath = 0,5 à t = 0 : alpha = bandA × 1 × 0,9
    for (const b of bands) expect(b.style.endsWith(`,${(PLAISIRS_AURA.bandA * 0.9).toFixed(3)})`)).toBe(true);
  });

  it('le seuil : 3 niveaux sur 255', () => {
    // vis tel que bandA × vis × 0,9 × 255 tombe juste sous puis juste sur 3.
    const visAt = (lv) => lv / (255 * PLAISIRS_AURA.bandA * 0.9);
    const nightFor = (vis) => (vis - PLAISIRS_AURA.day) / (1 - PLAISIRS_AURA.day);
    CM.nightF = nightFor(visAt(2.9));
    let ctx = fauxCtx(); CM.ctx = ctx; drawPlaisirsRing(SPOT, 0);
    expect(nappe(ctx.log)).toHaveLength(0);
    CM.nightF = nightFor(visAt(3.05));
    ctx = fauxCtx(); CM.ctx = ctx; drawPlaisirsRing(SPOT, 0);
    expect(nappe(ctx.log)).toHaveLength(PLAISIRS_AURA.bands);
  });
});
