// LA GÉOMÉTRIE DES TUILES — garde du lot 1 de PLAN-SOL-PYRAMIDE.
// Tout repose sur une identité : worldToScreen(p) = tileSpace(p) − camSpace(cam)
// + centre. Si camForTile ne renvoie pas la caméra dont camSpace tombe au centre
// de la tuile, chaque tuile se cuit décalée et les coutures sont garanties.
// Ces tests verrouillent l'identité, l'inverse, les indices et la couverture.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import {
  levelZoom, tileSideCss, gutterCss, tileSpace, camSpace, camForSpace,
  tileIndex, tileOrigin, camForTile, tilesCovering, TILE_PX,
} from '../iso/solPyramide.js';
import { worldToScreen } from '../iso/projection.js';

const saved = { x: CM.cam.x, y: CM.cam.y, zoom: CM.cam.zoom, cw: CM.cw, ch: CM.ch, dpr: CM.dpr };
afterEach(() => { Object.assign(CM.cam, { x: saved.x, y: saved.y, zoom: saved.zoom }); CM.cw = saved.cw; CM.ch = saved.ch; CM.dpr = saved.dpr; });

describe('levelZoom — le cran sous le zoom, borné', () => {
  it('rabat sur la grille 1/8 vers le bas, jamais sous 0,25', () => {
    expect(levelZoom(1)).toBe(1);
    expect(levelZoom(0.7)).toBeCloseTo(0.625, 9);
    expect(levelZoom(0.1)).toBe(0.25);
    expect(levelZoom(9)).toBeCloseTo(3.125, 9);
  });
});

describe('tuile et gouttière', () => {
  it('~256 px device, côté MULTIPLE de n = 8z (caméra de cuisson exacte), device entier', () => {
    expect(tileSideCss(1, 1)).toBe(256);
    expect(tileSideCss(1, 0.25)).toBe(256);
    expect(tileSideCss(1, 0.375)).toBe(255);      // n = 3
    expect(tileSideCss(1, 0.875)).toBe(259);      // n = 7
    expect(tileSideCss(2, 1)).toBe(128);
    expect(tileSideCss(1.25, 1)).toBe(208);       // 204,8 CSS visés → 208 (multiple de 8, 208·1,25 = 260 device entier)
    const s = tileSideCss(1.25, 0.375);           // multiple de 3 ET ·1,25 entier → multiple de 12
    expect(s % 12).toBe(0); expect(Math.abs(s - TILE_PX / 1.25)).toBeLessThan(12);
  });
  it('la caméra de cuisson est un demi-entier : la projection y est exacte', () => {
    for (const z of [0.25, 0.375, 0.625, 0.875, 1, 1.125, 2.375, 3.125]) {
      const S = tileSideCss(1, z);
      for (const [tx, ty] of [[0, 0], [3, -2], [-7, 11], [100, 57]]) {
        const cam = camForTile(tx, ty, S, z, 0);
        expect(cam.x * 2).toBe(Math.round(cam.x * 2));
        expect(cam.y * 2).toBe(Math.round(cam.y * 2));
      }
    }
  });
  it('la gouttière vaut une cellule, bornée à 64 px', () => {
    expect(gutterCss(1, 32)).toBe(64);
    expect(gutterCss(0.25, 32)).toBe(16);
    expect(gutterCss(3.2, 32)).toBe(64);
  });
});

describe('l identité de projection : worldToScreen = tileSpace − camSpace + centre', () => {
  it('tient pour des caméras et des points quelconques (terrain à plat)', () => {
    CM.cw = 800; CM.ch = 600;
    for (const [cx, cy, z] of [[0, 0, 1], [123.4, -56.7, 0.5], [-9, 400, 2.375]]) {
      CM.cam.x = cx; CM.cam.y = cy; CM.cam.zoom = z;
      for (const [wx, wy] of [[0, 0], [10, 3], [-77.5, 1000], [cx, cy]]) {
        const s = worldToScreen(wx, wy);
        const t = tileSpace(wx, wy, z), c = camSpace(cx, cy, z);
        expect(s.x).toBeCloseTo(t.x - c.x + 400, 9);
        expect(s.y).toBeCloseTo(t.y - c.y + 300, 9);
      }
    }
  });
  it('camForSpace inverse camSpace', () => {
    for (const [sx, sy, z] of [[0, 0, 1], [1234.5, -678, 0.25], [-3, 999.25, 3.125]]) {
      const p = camForSpace(sx, sy, z), c = camSpace(p.x, p.y, z);
      expect(c.x).toBeCloseTo(sx, 9); expect(c.y).toBeCloseTo(sy, 9);
    }
  });
});

describe('indices, origines, caméra de cuisson', () => {
  it('tileIndex / tileOrigin sont inverses, décalage compris', () => {
    const S = 256;
    for (const [sx, sy, shift] of [[0, 0, 0], [255.9, 256, 0], [-1, -300, 0], [130, 130, 128], [127, 127, 128]]) {
      const i = tileIndex(sx, sy, S, shift), o = tileOrigin(i.tx, i.ty, S, shift);
      expect(o.x).toBeLessThanOrEqual(sx); expect(o.x + S).toBeGreaterThan(sx);
      expect(o.y).toBeLessThanOrEqual(sy); expect(o.y + S).toBeGreaterThan(sy);
    }
  });
  it('la caméra de cuisson met le centre de la tuile au centre du canvas', () => {
    const S = 256;
    for (const [tx, ty, z, shift] of [[0, 0, 1], [3, -2, 0.5, 0], [-7, 11, 2.375, 128]]) {
      const cam = camForTile(tx, ty, S, z, shift || 0);
      const c = camSpace(cam.x, cam.y, z), o = tileOrigin(tx, ty, S, shift || 0);
      expect(c.x).toBeCloseTo(o.x + S / 2, 9); expect(c.y).toBeCloseTo(o.y + S / 2, 9);
      // Et via la projection réelle : l'origine du canvas (S + 2G) reçoit le coin
      // de la tuile moins la gouttière, exactement.
      const G = 16;
      CM.cam.x = cam.x; CM.cam.y = cam.y; CM.cam.zoom = z; CM.cw = S + 2 * G; CM.ch = S + 2 * G;
      const corner = camForSpace(o.x, o.y, z);          // point du monde au coin de la tuile
      const s = worldToScreen(corner.x, corner.y);
      expect(s.x).toBeCloseTo(G, 9); expect(s.y).toBeCloseTo(G, 9);
    }
  });
  it('tilesCovering couvre exactement l écran, ni plus ni moins', () => {
    const S = 256;
    // Écran 800×600 centré sur camSpace = (0,0) : x ∈ [−400, 400) → tx ∈ {−2..1} ; y ∈ [−300, 300) → ty ∈ {−2..1}
    const list = tilesCovering(0, 0, 1, 800, 600, S, 0);
    expect(list.length).toBe(16);
    expect(Math.min(...list.map((t) => t.tx))).toBe(-2); expect(Math.max(...list.map((t) => t.tx))).toBe(1);
    expect(Math.min(...list.map((t) => t.ty))).toBe(-2); expect(Math.max(...list.map((t) => t.ty))).toBe(1);
    // Un écran de 256 px pile aligné = une seule tuile.
    const cam = camForSpace(128, 128, 1);
    expect(tilesCovering(cam.x, cam.y, 1, 256, 256, S, 0).length).toBe(1);
  });
});
