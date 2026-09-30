import { describe, expect, it } from 'vitest';
import { reflectPixels, waterColumns, wobbleAt, wobbleRuns } from '../iso/isoReflect.js';

// LES REFLETS DANS L'EAU (2026-09-30, docs/PLAN-MAQUETTE-VIVANTE.md, lot 1).
// Ce que l'œil ne vérifie pas et que ces gardes tiennent :
//   1. un mur se reflète SOUS son pied, tête en bas, dans ses couleurs vraies ;
//   2. un arbre se reflète depuis le pied de son TRONC (même pivot que l'ombre) —
//      par colonne, sa couronne se croirait posée au sol et flotterait dans l'eau ;
//   3. ce qui est sous le sol (racines, marge d'un habitant) ne se reflète pas ;
//   4. l'ondulation ne décale que d'UN pixel d'art, par courses contiguës, et bouge ;
//   5. l'eau par colonne d'écran borne bien le ruban (c'est elle qui trie la rive
//      d'en face, ce qui flotte et la rive proche).

const rgba = (w, h, px) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (const [k, c] of Object.entries(px)) {
    const [x, y] = k.split(',').map(Number);
    const i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  return d;
};
const at = (r, x, y) => {
  const lx = x - r.ox, ly = y - r.oy;
  if (lx < 0 || ly < 0 || lx >= r.w || ly >= r.h) return null;
  const i = (ly * r.w + lx) * 4;
  return r.data[i + 3] ? [r.data[i], r.data[i + 1], r.data[i + 2]] : null;
};

describe('reflets dans l\'eau', () => {
  it('un mur se reflète sous son pied, tête en bas, couleurs vraies', () => {
    const px = {};
    for (let y = 0; y < 10; y += 1) px['2,' + y] = y === 0 ? [200, 0, 0] : [0, 0, 200];   // sommet rouge, pied en y = 9
    const r = reflectPixels(rgba(5, 10, px), 5, 10, 'column');
    expect(r.oy).toBe(10);                          // collé sous le pied
    expect(at(r, 2, 10)).toEqual([0, 0, 200]);      // le pied se reflète juste dessous
    expect(at(r, 2, 19)).toEqual([200, 0, 0]);      // le sommet tout en bas
    expect(r.h).toBe(10);
  });

  it('un arbre se reflète depuis le pied de son tronc', () => {
    const px = {};
    for (let y = 14; y < 20; y += 1) px['10,' + y] = [90, 60, 30];                                  // tronc
    for (let y = 2; y < 10; y += 1) for (let x = 6; x < 15; x += 1) px[x + ',' + y] = [40, 160, 40];   // couronne
    const r = reflectPixels(rgba(30, 20, px), 30, 20, 1);
    // Couronne (y 2..9) → 2·20 − y − 1 = 30..37 ; tronc (14..19) → 20..25.
    expect(at(r, 8, 33)).toEqual([40, 160, 40]);
    expect(at(r, 10, 20)).toEqual([90, 60, 30]);
    expect(at(r, 8, 12)).toBeNull();                // rien sous la couronne elle-même
    // Par colonne, la couronne se croirait posée au sol : son reflet flotterait.
    const col = reflectPixels(rgba(30, 20, px), 30, 20, 'column');
    expect(at(col, 8, 12)).toEqual([40, 160, 40]);
  });

  it('ce qui est sous le sol ne se reflète pas', () => {
    const px = { '1,0': [1, 2, 3], '1,1': [1, 2, 3], '1,5': [9, 9, 9] };   // pied commun au rang 5 (0,5 × 10)
    const r = reflectPixels(rgba(3, 10, px), 3, 10, 0.5);
    expect(at(r, 1, 9)).toEqual([1, 2, 3]);
    expect(at(r, 1, 8)).toEqual([1, 2, 3]);
    expect(r.oy).toBe(8);
    expect(r.h).toBe(2);                            // le pixel du rang 5 n'y est pas
  });

  it('l\'ondulation : un pixel au plus, par courses contiguës, et elle bouge', () => {
    for (let r = -50; r < 50; r += 1) expect([-1, 0, 1]).toContain(wobbleAt(r, 12.3));
    const runs = wobbleRuns(-20, 40, 7.7);
    let r = -20;
    for (const u of runs) { expect(u.r).toBe(r); r += u.n; }
    expect(r).toBe(40);
    const motif = (t) => wobbleRuns(-20, 40, t).map((u) => u.d + ':' + u.n).join();
    expect(motif(7.7)).not.toBe(motif(9.1));
  });

  it('l\'eau par colonne d\'écran borne le ruban', () => {
    const left = [{ x: 0, y: 100 }, { x: 400, y: 300 }], right = [{ x: 0, y: 200 }, { x: 400, y: 400 }];
    const c = waterColumns({ left, right }, 400, 8);
    const i = Math.round(200 / 8);
    expect(c.top[i]).toBeCloseTo(200, 0);
    expect(c.bot[i]).toBeCloseTo(300, 0);
  });
});
