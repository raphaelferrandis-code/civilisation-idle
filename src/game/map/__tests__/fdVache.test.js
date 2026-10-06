// La curiosité « La vache » (fdGags) est redessinée avec la VACHE MAISON
// (critters.js, décision de Raph au lot 13 de l'audit du 05/10) au lieu du bœuf des
// attelages. Deux pièges que ces gardes tiennent :
//  - les bêtes posées ont leurs propres diagonales (CRITTER_DIAG : SE, SO, NO, NE),
//    pas l'ordre des caps d'agent (0 +x, 1 −x, 2 +y, 3 −y). L'ancienne version
//    LaserKiwi passait le cap tel quel : sur une rue nord-sud, la vache regardait
//    le long de la rue au lieu de se tenir en travers ;
//  - la boîte de clic doit suivre l'encre de la vache maison, pas celle du bœuf.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CM } from '../layout.js';
import { worldToScreen } from '../iso/projection.js';
import { CRITTER_DIAG, CRITTER_DIR_OF_CAP } from '../critters.js';
import { FD_GAGS } from '../faitsDivers/fdGags.js';
import { FD_CURIOS } from '../../data/faitsDivers.js';
import { AGENT_SCALE } from '../agents.js';

const saved = {};
let prevImage;
beforeAll(() => {
  for (const k of ['cam', 'cw', 'ch', 'TILE', 'dpr']) saved[k] = CM[k];
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.cw = 800; CM.ch = 600; CM.TILE = 32; CM.dpr = 1;
  // Des images « chargées » (cadre 34 de la vache maison) : ensureCritter les demande
  // au premier blit, le chargement arrive au tick suivant.
  prevImage = globalThis.Image;
  globalThis.Image = class {
    set src(v) {
      this._src = v;
      this.width = this.height = this.naturalWidth = this.naturalHeight = 34;
      queueMicrotask(() => this.onload && this.onload());
    }
    get src() { return this._src; }
  };
});
afterAll(() => {
  Object.assign(CM, saved);
  globalThis.Image = prevImage;
});

// Une scène de vache sur une rue d'axe (ax, ay), et le blit de la bête.
function cowFrame(ax, ay) {
  const app = { seed: 'vache-test', band: 2, curio: FD_CURIOS.find((g) => g.id === 'vache'), spot: { x: 10, y: 10, ax, ay } };
  FD_GAGS.vache.build(app);
  const out = [];
  app.actors(0, out, 1);
  const blits = [];
  const ctx = { globalAlpha: 1, imageSmoothingEnabled: true, drawImage(img, ...a) { blits.push({ src: img.src, a }); } };
  out[1].draw(ctx, 0);
  return { app, blits };
}

describe('fait divers « La vache » — la vache maison', () => {
  it('cap d\'agent → diagonale : le même sens à l\'écran que la projection', () => {
    // Un pas d'un cap, projeté : le nom de la diagonale doit dire où il va à l'écran.
    const STEP = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const o = worldToScreen(0, 0);
    STEP.forEach(([dx, dy], cap) => {
      const p = worldToScreen(dx * 32, dy * 32);
      const name = (p.y > o.y ? 'south' : 'north') + (p.x > o.x ? 'east' : 'west');
      expect(CRITTER_DIAG[CRITTER_DIR_OF_CAP[cap]], `cap ${cap}`).toBe(name);
    });
  });

  it('elle se tient EN TRAVERS de la rue, avec la vache maison (pas le bœuf)', async () => {
    cowFrame(1, 0);                                   // premier blit : demande les images
    await new Promise((r) => setTimeout(r, 0));
    // Rue est-ouest (axe +x) : elle regarde vers −y, le nord-est de l'écran.
    const ew = cowFrame(1, 0).blits;
    expect(ew).toHaveLength(1);
    expect(ew[0].src).toBe('/pixelart/agents/animals/critter-cow-northeast.png');
    // Rue nord-sud (axe +y) : elle regarde vers +x, le sud-est. Le cap passé tel quel
    // donnait le même sud-est ici, mais le sud-ouest et le nord-ouest (LE LONG de la
    // rue) pour les axes −y et −x : on vérifie les quatre sens.
    const ns = cowFrame(0, 1);
    expect(ns.blits[0].src).toBe('/pixelart/agents/animals/critter-cow-southeast.png');
    // …et le voyageur attend SUR la rue, derrière elle (runAxis lisait `0 || 1` :
    // l'axe (0, 1) devenait la diagonale (1, 1), en travers de l'îlot).
    const man = ns.app.figs[1];
    expect(man.wx / 32).toBeCloseTo(10, 5);
    expect(man.wy / 32).toBeCloseTo(9.3, 5);
    expect(cowFrame(0, -1).blits[0].src).toBe('/pixelart/agents/animals/critter-cow-northwest.png');
    expect(cowFrame(-1, 0).blits[0].src).toBe('/pixelart/agents/animals/critter-cow-southwest.png');
  });

  it('la boîte de clic couvre l\'encre de la vache maison', async () => {
    cowFrame(1, 0);
    await new Promise((r) => setTimeout(r, 0));
    // Zoom 4 : une bête de ~60 px, l'arrondi du blit (½ px) ne brouille pas la mesure.
    CM.cam.zoom = 4;
    const h = Math.round(32 * 4 * 0.95 * AGENT_SCALE);     // CRITTER_SIZES.cow, dpr 1
    for (const [ax, ay, back] of [[1, 0, true], [0, 1, false]]) {
      const { app, blits } = cowFrame(ax, ay);
      const box = app.figs[0]._box;
      const p = worldToScreen(10 * 32, 10 * 32);
      expect(box).toBeTruthy();
      // Centrée sur la bête, large comme son encre (0,06 → 0,94 de la frame).
      expect(box.x1 - box.x0).toBeCloseTo(h * 0.9, 5);
      expect((box.x0 + box.x1) / 2).toBeCloseTo(p.x, 5);
      // Le haut de l'encre : 0,06 de la frame de dos, 0,18 de face ; frame posée à 0,94.
      const [, , , , , dy] = blits[0].a;
      const inkTop = dy + h * (back ? 0.059 : 0.176);
      expect(box.y0).toBeLessThanOrEqual(inkTop);
      expect(box.y0).toBeGreaterThan(inkTop - h * 0.05);
      expect(box.y1).toBeGreaterThanOrEqual(p.y);
    }
    CM.cam.zoom = 1;
  });
});
