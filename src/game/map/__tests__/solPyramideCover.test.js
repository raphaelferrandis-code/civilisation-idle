// LE FOND SOUS UN SOL QUI COUVRE TOUT L'ÉCRAN (audit du 2026-10-05, PERF-64).
// paintWildBackdrop posait à CHAQUE frame un aplat plein écran (SEASON_WILD à 0,9),
// même quand le sol en tuiles, opaque, allait le recouvrir entièrement : 0,3 à 0,5 ms
// par frame en rendu logiciel sur 2 560 × 1 340. Il ne sert qu'à boucher un trou.
// groundCoversScreen dit, AVANT la frame du sol, si rien ne peut le laisser voir.
//
// Ce qui est exigé ici, c'est la condition du « au pixel près » : quand elle répond
// oui, les tuiles posées par la frame couvrent CHAQUE pixel device de l'écran (règle
// du centre de pixel, celle d'un blit sans anticrénelage — et à s = 1 les bords
// tombent de toute façon sur la grille). Sinon l'aplat sauté laisserait voir l'image
// précédente. Même faux canvas que solPyramideFrame.test.js (pas de canvas sous Node).
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../iso/solPyramide.js', async (importOriginal) => {
  const m = await importOriginal();
  const { CM: cm } = await import('../layout.js');
  return {
    ...m,
    cookTile: (z, tx, ty) => {
      const dpr = cm.dpr || 1, S = m.tileSideCss(dpr, z), G = 8, side = Math.round((S + 2 * G) * dpr);
      return { canvas: { width: side, height: side, dpr, z }, G, S, ms: 0.1, tx, ty, z };
    },
  };
});

const { CM } = await import('../layout.js');
const { paintGroundPyramid, groundCoversScreen, solPyramideReset, PYR } = await import('../iso/solPyramideFrame.js');
const { paintWildBackdrop } = await import('../iso/isoWildBackdrop.js');

const saved = { cam: { ...CM.cam }, cw: CM.cw, ch: CM.ch, dpr: CM.dpr, capture: CM.capture, zoomGoal: CM.zoomGoal, layout: CM.layout };
const savedPyr = { ...PYR };
afterEach(() => {
  Object.assign(CM.cam, saved.cam);
  CM.cw = saved.cw; CM.ch = saved.ch; CM.dpr = saved.dpr; CM.capture = saved.capture; CM.zoomGoal = saved.zoomGoal; CM.layout = saved.layout;
  Object.assign(PYR, savedPyr);
  solPyramideReset();
});

function planVide() {
  return {
    roadSet: new Set(), roadMap: new Map(), urbanSet: new Set(), wonderGround: new Set(),
    river: { present: false, cells: new Set() }, tiles: [], gridN: 60, mapSeed: 7, counts: { eraBand: 0 },
  };
}
// Les budgets en ms suivent l'horloge réelle : levés, pour que rien n'en dépende.
const sansChrono = () => Object.assign(PYR, { budgetMs: 1e9, gestureBudgetMs: 1e9, holeCapMs: 1e9 });

// Une frame du sol ; rend les rectangles DESTINATION posés (px CSS).
function frame(L, now) {
  const rects = [];
  paintGroundPyramid({
    imageSmoothingEnabled: true,
    drawImage(cv, sx, sy, sw, sh, dx, dy, dw, dh) { rects.push([dx, dy, dw, dh]); },
  }, L, now);
  return rects;
}

// Pixels device de l'écran (canvas de round(cw·dpr) × round(ch·dpr), cf.
// cityMapResizeCanvas) dont le CENTRE n'est sous aucun rectangle posé.
function pixelsNonCouverts(rects, cw, ch, dpr) {
  const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
  const cov = new Uint8Array(W * H);
  for (const [dx, dy, dw, dh] of rects) {
    const i0 = Math.max(0, Math.ceil(dx * dpr - 0.5)), i1 = Math.min(W, Math.ceil((dx + dw) * dpr - 0.5));
    const j0 = Math.max(0, Math.ceil(dy * dpr - 0.5)), j1 = Math.min(H, Math.ceil((dy + dh) * dpr - 0.5));
    if (i1 <= i0) continue;
    for (let j = j0; j < j1; j += 1) cov.fill(1, j * W + i0, j * W + i1);
  }
  let n = 0;
  for (let k = 0; k < cov.length; k += 1) if (!cov[k]) n += 1;
  return n;
}

function montage({ dpr, cw, ch, zoom, cx, cy }) {
  CM.layout = null; CM.zoomGoal = null;
  CM.dpr = dpr; CM.cw = cw; CM.ch = ch;
  CM.cam.x = cx; CM.cam.y = cy; CM.cam.zoom = zoom;
}

describe('groundCoversScreen — oui seulement quand les tuiles couvrent chaque pixel', () => {
  it('au repos, toutes les tuiles en cache : oui, et la frame couvre bien tout l écran (dpr, tailles impaires, crans)', () => {
    const L = planVide(), T = CM.TILE;
    sansChrono();
    let cas = 0;
    for (const dpr of [1, 1.25, 1.5]) {
      for (const [zoom, cw, ch] of [[0.875, 1412, 753], [1, 1200, 700], [1.375, 1413, 701], [2, 1765 / 1.25, 900]]) {
        for (const [ox, oy] of [[0.37, -0.21], [-5.1, 3.3]]) {
          solPyramideReset();
          montage({ dpr, cw, ch, zoom, cx: 30 * T + ox, cy: 30 * T + oy });
          expect(groundCoversScreen(L)).toBe(false);          // cache vide : l'aplat reste
          CM.capture = true; frame(L, 1000);                  // capture : tout le visible se cuit
          CM.capture = false;
          expect(groundCoversScreen(L)).toBe(true);
          const rects = frame(L, 2000);
          expect(pixelsNonCouverts(rects, cw, ch, dpr)).toBe(0);
          cas += 1;
        }
      }
    }
    expect(cas).toBe(24);
  });

  it('non quand une tuile visible manque (pan vers du sol pas encore cuit), oui une fois cuite', () => {
    const L = planVide(), T = CM.TILE;
    sansChrono();
    montage({ dpr: 1, cw: 1200, ch: 700, zoom: 1, cx: 30 * T, cy: 30 * T });
    CM.capture = true; frame(L, 1000); CM.capture = false;
    expect(groundCoversScreen(L)).toBe(true);
    CM.cam.x += 520; CM.cam.y -= 260;                       // deux tuiles plus loin
    expect(groundCoversScreen(L)).toBe(false);
    // Frame du geste : les trous se bouchent au PLANCHER (repli étiré), 6 tuiles
    // exactes au plus — l'aplat reste dessous.
    frame(L, 2000);
    expect(groundCoversScreen(L)).toBe(false);
    frame(L, 3000);                                          // au repos : le reste se cuit
    expect(groundCoversScreen(L)).toBe(true);
    expect(pixelsNonCouverts(frame(L, 3100), 1200, 700, 1)).toBe(0);
  });

  it('non pendant un glissement de zoom (tuiles étirées : bords entre les pixels)', () => {
    const L = planVide(), T = CM.TILE;
    sansChrono();
    montage({ dpr: 1, cw: 1200, ch: 700, zoom: 1, cx: 30 * T, cy: 30 * T });
    CM.capture = true; frame(L, 1000); CM.capture = false;
    CM.cam.zoom = 1.06;                                     // entre deux crans : le niveau 1 s'étire
    expect(groundCoversScreen(L)).toBe(false);
  });

  it('non quand le dpr change (la frame va vider le cache) ou quand l écran déborde du plan', () => {
    const L = planVide(), T = CM.TILE;
    sansChrono();
    montage({ dpr: 1, cw: 1200, ch: 700, zoom: 1, cx: 30 * T, cy: 30 * T });
    CM.capture = true; frame(L, 1000); CM.capture = false;
    CM.dpr = 1.25;
    expect(groundCoversScreen(L)).toBe(false);
    CM.dpr = 1;
    expect(groundCoversScreen(L)).toBe(true);
    // Dézoom au plancher : la ville entière tient dans l'écran, le fond se voit autour.
    montage({ dpr: 1, cw: 1200, ch: 700, zoom: 0.25, cx: 30 * T, cy: 30 * T });
    CM.capture = true; frame(L, 3000); CM.capture = false;
    expect(groundCoversScreen(L)).toBe(false);
    expect(groundCoversScreen(null)).toBe(false);
  });
});

describe('paintWildBackdrop — l aplat sauté quand le sol couvre l écran', () => {
  const fauxCtx = () => {
    const ops = [];
    return { ops, fillRect(x, y, w, h) { ops.push(['fillRect', x, y, w, h]); }, set fillStyle(v) { ops.push(['fill', v]); } };
  };
  it('couvert : aucun remplissage ; sinon l aplat plein écran, comme avant', () => {
    CM.layout = null; CM.cw = 1200; CM.ch = 700;
    const a = fauxCtx();
    paintWildBackdrop(a, 1000, true);
    expect(a.ops).toEqual([]);
    const b = fauxCtx();
    paintWildBackdrop(b, 1000, false);
    expect(b.ops.filter((o) => o[0] === 'fillRect')).toEqual([['fillRect', 0, 0, 1200, 700]]);
    const c = fauxCtx();
    paintWildBackdrop(c, 1000);                              // appel d'avant (sans l'argument)
    expect(c.ops.filter((o) => o[0] === 'fillRect')).toEqual([['fillRect', 0, 0, 1200, 700]]);
  });
});
