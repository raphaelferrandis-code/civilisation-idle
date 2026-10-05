// LA FRAME DU SOL EN PYRAMIDE — gardes de l'audit du 2026-10-05.
// La frame (paintGroundPyramid) est montée sur un plan minimal, avec une cuisson
// simulée qui étiquette chaque canvas de son dpr (pas de canvas sous Node).
//
// BUG-21, LE DPR CHANGE EN COURS DE JEU. Zoom du navigateur, Ctrl±, fenêtre
// glissée vers un écran à 125/150 % : le côté des tuiles dépend du dpr (256 px
// device), leur raster aussi. La clé du cache (niveau, tx, ty) et la fraîcheur
// l'ignoraient : après dpr 1 → 1,25, la frame servait les tuiles cuites à dpr 1
// — trous et patchwork jusqu'à la saison suivante. Aucun canvas cuit à un dpr ne
// doit être posé à un autre.
//
// BUG-60, LA PORTE DE FRAÎCHEUR. Elle ne comptait que des tailles d'ensembles :
// un bâtiment posé sans route nouvelle gardait les mêmes tailles, et sa tuile
// restait fraîche — ni allée de seuil, ni cour. Elle doit se recuire, elle seule.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../iso/solPyramide.js', async (importOriginal) => {
  const m = await importOriginal();
  const { CM: cm } = await import('../layout.js');
  return {
    ...m,
    // Pas de canvas sous Node : la cuisson rend un faux canvas qui porte le dpr
    // auquel il a été cuit, à la géométrie exacte de la vraie (S·dpr + gouttière).
    cookTile: (z, tx, ty) => {
      const dpr = cm.dpr || 1, S = m.tileSideCss(dpr, z), G = 8, side = Math.round((S + 2 * G) * dpr);
      return { canvas: { width: side, height: side, dpr }, G, S, ms: 0.1, tx, ty, z };
    },
  };
});

const { CM } = await import('../layout.js');
const { paintGroundPyramid, solPyramideReset } = await import('../iso/solPyramideFrame.js');

const saved = { cam: { ...CM.cam }, cw: CM.cw, ch: CM.ch, dpr: CM.dpr, capture: CM.capture, zoomGoal: CM.zoomGoal, layout: CM.layout };
afterEach(() => {
  Object.assign(CM.cam, saved.cam);
  CM.cw = saved.cw; CM.ch = saved.ch; CM.dpr = saved.dpr; CM.capture = saved.capture; CM.zoomGoal = saved.zoomGoal; CM.layout = saved.layout;
  solPyramideReset();
});

// Un plan minimal : les seuls champs que la frame et la signature lisent.
function planVide() {
  return {
    roadSet: new Set(), roadMap: new Map(), urbanSet: new Set(), wonderGround: new Set(),
    river: { present: false, cells: new Set() }, tiles: [], gridN: 60, mapSeed: 7, counts: { eraBand: 0 },
  };
}
function fauxCtx() {
  const poses = [];
  return { poses, imageSmoothingEnabled: true, drawImage(cv) { poses.push(cv.dpr); } };
}
function frame(L, dpr, now) {
  CM.dpr = dpr;
  const ctx = fauxCtx();
  paintGroundPyramid(ctx, L, now);
  return ctx.poses;
}

describe('sol en pyramide — une tuile cuite à un dpr n est jamais servie à un autre', () => {
  it('dpr 1 → 1,25 → 1 : chaque frame ne pose que des tuiles de son dpr, et l écran est couvert', () => {
    const L = planVide();
    CM.layout = null; CM.capture = true; CM.zoomGoal = null;   // capture : tout le visible se cuit dans la frame
    CM.cam.x = 30 * CM.TILE; CM.cam.y = 30 * CM.TILE; CM.cam.zoom = 1;
    CM.cw = 1200; CM.ch = 700;
    const a = frame(L, 1, 1000);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((d) => d === 1)).toBe(true);
    // Même fenêtre, dpr 1,25 (Ctrl+ dans l'.exe) : rien de ce qui a été cuit à 1 ne se pose.
    const b = frame(L, 1.25, 2000);
    expect(b.length).toBeGreaterThan(0);
    expect(b.filter((d) => d !== 1.25)).toEqual([]);
    // Et retour : les tuiles à 1,25 ne servent pas non plus à dpr 1.
    const c = frame(L, 1, 3000);
    expect(c.length).toBeGreaterThan(0);
    expect(c.filter((d) => d !== 1)).toEqual([]);
  });
  it('à dpr constant, la frame suivante ne recuit rien (le cache sert toujours)', () => {
    const L = planVide();
    CM.layout = null; CM.capture = true; CM.zoomGoal = null;
    CM.cam.x = 30 * CM.TILE; CM.cam.y = 30 * CM.TILE; CM.cam.zoom = 1;
    CM.cw = 1200; CM.ch = 700;
    frame(L, 1.25, 1000);
    const stats = globalThis.__solPyramideStats;
    frame(L, 1.25, 2000);
    expect(stats.dernier.cuites).toBe(0);
    expect(stats.dernier.trous).toBe(0);
  });
});

describe('sol en pyramide — un bâtiment posé sans route nouvelle recuit sa tuile', () => {
  // Deux plans aux ensembles de MÊMES TAILLES (routes, urbain, parvis, fleuve) :
  // seul le second porte une emprise au centre de l'écran — le cas de chaque
  // premier achat d'un début de partie.
  const plan = (avecBatiment) => {
    const L = planVide();
    for (let gx = 26; gx <= 34; gx += 1) for (let gy = 26; gy <= 34; gy += 1) L.urbanSet.add(gx + ',' + gy);
    L.roadSet.add('29,30'); L.roadMap.set('29,30', { rank: 'path', mask: 5 });
    if (avecBatiment) L.tiles.push({ gx: 30, gy: 30, size: 1, type: 'scribes', buildingId: 'scribes' });
    return L;
  };
  it('seules les tuiles qui voient l emprise se recuisent', () => {
    CM.layout = null; CM.capture = true; CM.zoomGoal = null;
    CM.cam.x = 30 * CM.TILE; CM.cam.y = 30 * CM.TILE; CM.cam.zoom = 1;
    CM.cw = 1200; CM.ch = 700;
    const stats = globalThis.__solPyramideStats;
    frame(plan(false), 1, 1000);
    const vis = stats.dernier.vis;
    frame(plan(false), 1, 2000);                 // même contenu, autre objet (un recompute sans effet)
    expect(stats.dernier.cuites).toBe(0);
    frame(plan(true), 1, 3000);                  // une emprise de plus, mêmes tailles
    expect(stats.dernier.cuites).toBeGreaterThan(0);
    expect(stats.dernier.cuites).toBeLessThan(vis);
  });
});

// CÂBLAGE dans cityMapRuntime (monter la vraie carte sous vitest coûte ~4 s, cf.
// frameGuard.test.js) : au zoom du navigateur, la largeur CSS et le dpr varient en
// sens inverse et le canvas garde souvent sa taille en px device. Le retour anticipé
// « même taille » sautait alors setTransform(dpr) : toute la carte se peignait à
// l'ancienne échelle.
describe('cityMapResizeCanvas — le dpr suit, même à taille de canvas identique', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'cityMapRuntime.js'), 'utf8');
  const debut = src.indexOf('function cityMapResizeCanvas(');
  const corps = src.slice(debut, src.indexOf('\n}\n', debut));
  it('le retour « même taille » réapplique la transformation quand le dpr a changé', () => {
    expect(debut).toBeGreaterThan(-1);
    const meme = corps.match(/if \(canvas\.width === nw && canvas\.height === nh\) \{([\s\S]*?)\n {2}\}/);
    expect(meme).not.toBeNull();
    expect(meme[1]).toMatch(/if \(dprChanged\) CM\.ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\);/);
    expect(meme[1]).toMatch(/return\b/);
    // dprChanged se lit AVANT que CM.dpr soit écrasé.
    expect(corps.indexOf('const dprChanged = CM.dpr !== dpr;')).toBeGreaterThan(-1);
    expect(corps.indexOf('const dprChanged')).toBeLessThan(corps.indexOf('CM.dpr = dpr;'));
  });
});
