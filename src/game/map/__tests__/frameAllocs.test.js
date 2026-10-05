// MOINS D'OBJETS NEUFS À CHAQUE FRAME, MÊME IMAGE (audit du 05/10, PERF-44).
//
// Mesuré en rendu logiciel (Chrome sans GPU, comme chez Raph) :
//   · drapeaux, linge, éclats : une chaîne `rgba(…)` neuve par pixel d'art coûtait
//     autant que le fillRect (20 drapeaux : 0,6-0,76 ms → 0,35 ms avec les chaînes en
//     cache) ;
//   · phares : un dégradé et deux chaînes neufs par véhicule (100 véhicules : 1,1 ms →
//     0,83 ms avec un dégradé partagé).
// Ce que ces tests tiennent : les chaînes et le dégradé sont ceux d'avant, au caractère
// près, mais faits une fois.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { drawVehicleHeadlights } from '../agents.js';
import { vieRgba, viePixel, drawVieFlag } from '../iso/isoVie.js';

const tmpl = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;

describe('chaînes rgba des pixels d\'art', () => {
  it("le texte d'avant, au caractère près, et le même objet d'un appel à l'autre", () => {
    const cols = [[0, 0, 0], [255, 255, 255], [178, 56, 45], [214, 232, 240], [96, 74, 52]];
    for (const a of [1, 0.9, 0.5, 0.0125, 0.2675, 0.0005 + 0.01, 1 / 3]) {
      for (const c of cols) {
        expect(vieRgba(c, a)).toBe(tmpl(c, a));
        expect(vieRgba(c.slice(), a)).toBe(vieRgba(c, a));
      }
    }
    // Une composante hors octet entier repasse par le gabarit (jamais de collision).
    expect(vieRgba([12.5, 3, 4], 1)).toBe('rgba(12.5,3,4,1.000)');
    expect(vieRgba([300, 3, 4], 1)).toBe('rgba(300,3,4,1.000)');
    expect(vieRgba([-1, 3, 4], 1)).toBe('rgba(-1,3,4,1.000)');
  });

  it('viePixel et drawVieFlag posent les mêmes couleurs que le gabarit', () => {
    const styles = [];
    const ctx = { set fillStyle(v) { styles.push(v); }, fillRect() {} };
    CM.dpr = 1; CM.cw = 800; CM.ch = 600;
    viePixel(ctx, 10, 10, 2, [236, 244, 246], 0.9 * 0.73);
    expect(styles.pop()).toBe(tmpl([236, 244, 246], 0.9 * 0.73));
    drawVieFlag(ctx, 100, 100, { k: 2, alpha: 0.64, cols: ['#b2382d', '#7e2620', '#e2b444'], now: 1000 });
    expect(styles.length).toBeGreaterThan(30);
    const allowed = new Set([[178, 56, 45], [126, 38, 32], [226, 180, 68], [74, 58, 42], [232, 196, 90]].map((c) => tmpl(c, 0.64)));
    for (const s of styles) expect(allowed.has(s), s).toBe(true);
  });
});

describe('phares : un dégradé pour toute la frame', () => {
  afterEach(() => { CM.layout = null; CM.nightF = 0; });
  const makeCtx = () => {
    const ctx = { fillStyle: '#000', globalCompositeOperation: 'source-over', made: [], fills: [] };
    for (const m of ['beginPath', 'arc', 'ellipse', 'save', 'restore', 'translate', 'rotate']) ctx[m] = () => {};
    ctx.fill = () => { ctx.fills.push(ctx.fillStyle); };
    ctx.createRadialGradient = (...a) => { const g = { a, stops: [], addColorStop(p, c) { g.stops.push([p, c]); } }; ctx.made.push(g); return g; };
    return ctx;
  };
  const car = (i) => ({ type: 'car', gx: 8, gy: 8, x: 120 + i * 9, y: 170 + i * 3, tx: 160 + i * 9, ty: 170 + i * 3, dir: 0, fade: 1, pauseT: 0, parkT: 0 });

  it('dix véhicules, un seul dégradé — celui que créait chacun', () => {
    CM.cam = { x: 0, y: 0, zoom: 1 }; CM.TILE = 20; CM.cw = 800; CM.ch = 600;
    CM.layout = { counts: { eraBand: 6, eraIndex: 16 } };
    CM.nightF = 0.8;
    const ctx = makeCtx();
    for (let i = 0; i < 10; i += 1) drawVehicleHeadlights(ctx, car(i));
    expect(ctx.made.length).toBe(1);
    const a = Math.min(1, (0.8 - 0.1) / 0.7), hl = Math.max(1, 20 * 0.06);
    expect(ctx.made[0].a).toEqual([0, 0, 0, 0, 0, Math.max(1, hl * 3.4)]);
    expect(ctx.made[0].stops).toEqual([[0, `rgba(255,238,180,${Math.min(1, a * 0.4 * 1.8).toFixed(2)})`], [1, 'rgba(255,238,180,0)']]);
    // Les deux phares ronds : la couleur d'avant, la même chaîne pour tous.
    const lamps = ctx.fills.filter((s) => typeof s === 'string');
    expect(lamps.length).toBe(10);
    expect(new Set(lamps)).toEqual(new Set([`rgba(255,244,210,${Math.min(1, a * 0.75 * 1.8).toFixed(2)})`]));
    // La nuit qui avance (ou un autre zoom) refait le dégradé.
    CM.nightF = 0.5;
    drawVehicleHeadlights(ctx, car(0));
    expect(ctx.made.length).toBe(2);
    CM.cam.zoom = 2;
    drawVehicleHeadlights(ctx, car(0));
    expect(ctx.made.length).toBe(3);
  });
});
