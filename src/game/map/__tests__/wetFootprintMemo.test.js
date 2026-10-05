import { describe, it, expect } from 'vitest';
import { isoWetFootprint } from '../iso/isoGroundDetail.js';

// L'EMPRISE MOUILLÉE D'UN MOTEUR (audit du 05/10, PERF-63 point 4). Le peintre testait
// à chaque frame, case par case, si l'emprise de chaque moteur touchait le fleuve ou sa
// berge : deux clés chaîne et deux Set.has par case (~0,2 ms sur une grande ville
// entière à l'écran). Le verdict est gardé sur la tuile ; ce test tient qu'il reste
// celui du balayage d'avant, et qu'il se refait avec un nouveau plan (nouveaux
// ensembles) ou une autre emprise.

// Le balayage d'avant, recopié tel quel : l'oracle.
function refWet(t, river, rc, spanX, spanY) {
  let wet = false;
  for (let ax = 0; ax < spanX && !wet; ax += 1) for (let ay = 0; ay < spanY && !wet; ay += 1) {
    if (rc.has((t.gx + ax) + ',' + (t.gy + ay)) || (river.banks && river.banks.has((t.gx + ax) + ',' + (t.gy + ay)))) wet = true;
  }
  return wet;
}

function riverPlan(seed) {
  const cells = new Set(), banks = new Set();
  // Un fleuve en diagonale, une case de berge de chaque côté.
  for (let i = 0; i < 40; i += 1) {
    const x = i, y = 10 + Math.floor(i / 2) + seed;
    cells.add(x + ',' + y); cells.add(x + ',' + (y + 1));
    banks.add(x + ',' + (y - 1)); banks.add(x + ',' + (y + 2));
  }
  return { cells, banks };
}

describe('isoWetFootprint', () => {
  it('rend le verdict du balayage, pour toutes les emprises', () => {
    const river = riverPlan(0);
    let wet = 0;
    for (let gy = 0; gy < 40; gy += 1) {
      for (let gx = 0; gx < 40; gx += 1) {
        for (const [sx, sy] of [[1, 1], [2, 2], [3, 2], [4, 6]]) {
          const t = { gx, gy };
          const v = isoWetFootprint(t, river, river.cells, sx, sy);
          expect(v).toBe(refWet(t, river, river.cells, sx, sy));
          expect(isoWetFootprint(t, river, river.cells, sx, sy)).toBe(v);
          if (v) wet += 1;
        }
      }
    }
    expect(wet).toBeGreaterThan(0);
    // Sans berge connue : seules les cases d'eau comptent.
    const noBank = { cells: river.cells };
    const t = { gx: 5, gy: 10 + 2 - 1 };                 // une case de berge, au-dessus de l'eau
    expect(isoWetFootprint(t, noBank, noBank.cells, 1, 1)).toBe(refWet(t, noBank, noBank.cells, 1, 1));
  });

  it('gardé sur la tuile, refait avec un nouveau plan ou une autre emprise', () => {
    const a = riverPlan(0);
    const t = { gx: 6, gy: 12 };
    expect(isoWetFootprint(t, a, a.cells, 1, 1)).toBe(true);
    const memo = t._wet;
    expect(isoWetFootprint(t, a, a.cells, 1, 1)).toBe(true);
    expect(t._wet).toBe(memo);                            // rien recalculé
    // Le fleuve a bougé (nouveau plan, nouveaux ensembles) : la case est au sec.
    const b = riverPlan(20);
    expect(isoWetFootprint(t, b, b.cells, 1, 1)).toBe(false);
    expect(t._wet).not.toBe(memo);
    // Une emprise plus large, ou la tuile déplacée, rejugent aussi.
    const far = { gx: 6, gy: 26 };
    expect(isoWetFootprint(far, b, b.cells, 1, 1)).toBe(refWet(far, b, b.cells, 1, 1));
    expect(isoWetFootprint(far, b, b.cells, 1, 8)).toBe(refWet(far, b, b.cells, 1, 8));
    far.gy = 40;
    expect(isoWetFootprint(far, b, b.cells, 1, 8)).toBe(refWet(far, b, b.cells, 1, 8));
  });
});
