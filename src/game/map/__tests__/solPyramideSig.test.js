// L'INVALIDATION PARTIELLE — garde du lot 3 de PLAN-SOL-PYRAMIDE.
// Au recompute du plan, une tuile ne se recuit que si SES cellules ont changé.
// Ce que ces tests verrouillent : la signature d'une tuile est stable, elle
// change quand une cellule de la tuile change (route, urbain, bâti, cour), elle
// change aussi pour une cellule dans la marge de deux cellules (les franges et
// les faces lisent le voisinage), et elle ne bouge PAS pour une cellule loin.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { tileSig } from '../iso/solPyramideFrame.js';

const savedPv = CM.previewWonder;
afterEach(() => { CM.previewWonder = savedPv; });

// Un plan minimal : les seuls champs que la signature lit.
function planVide() {
  return {
    roadSet: new Set(), roadMap: new Map(), urbanSet: new Set(), meadow: new Set(),
    wonderGround: new Set(), river: { present: false, cells: new Set() }, tiles: [], gridN: 200,
  };
}
const S = 256, z = 1;
// Tuile (0,0) à z 1 : cellules gx 0..12, gy −4..8 (+2 de marge) ; tuile (10,10) : gx ~120..132, gy ~36..48.
const A = [0, 0], B = [10, 10];
const sig = (L, t) => tileSig(L, z, t[0], t[1], S);

describe('tileSig — stable, locale, avec sa marge', () => {
  it('le même plan donne la même signature, deux plans vides aussi', () => {
    const L = planVide();
    expect(sig(L, A)).toBe(sig(L, A));
    expect(sig(planVide(), A)).toBe(sig(L, A));
  });
  it('une route ajoutée dans la tuile change SA signature, pas celle d une tuile lointaine', () => {
    const L0 = planVide(), L1 = planVide();
    L1.roadSet.add('5,2'); L1.roadMap.set('5,2', { rank: 'main', mask: 5 });
    expect(sig(L1, A)).not.toBe(sig(L0, A));
    expect(sig(L1, B)).toBe(sig(L0, B));
  });
  it('le masque de connexion d une route compte (le tracé en dépend)', () => {
    const L0 = planVide(), L1 = planVide();
    L0.roadSet.add('5,2'); L0.roadMap.set('5,2', { rank: 'main', mask: 5 });
    L1.roadSet.add('5,2'); L1.roadMap.set('5,2', { rank: 'main', mask: 7 });
    expect(sig(L1, A)).not.toBe(sig(L0, A));
  });
  it('un bâti ou une cellule urbaine change la signature de sa tuile', () => {
    const L0 = planVide(), L1 = planVide(), L2 = planVide();
    L1.tiles.push({ gx: 6, gy: 1, size: 1 });
    L2.urbanSet.add('6,1');
    expect(sig(L1, A)).not.toBe(sig(L0, A));
    expect(sig(L2, A)).not.toBe(sig(L0, A));
    expect(sig(L1, B)).toBe(sig(L0, B));
  });
  it('une cellule dans la marge de deux cellules compte, au-delà non', () => {
    const L0 = planVide(), Lm = planVide(), Lf = planVide();
    // Tuile A couvre gx 0..12 (+2) : gx 14 est dans la marge, gx 30 est loin.
    Lm.roadSet.add('14,2'); Lm.roadMap.set('14,2', { rank: 'main', mask: 1 });
    Lf.roadSet.add('30,2'); Lf.roadMap.set('30,2', { rank: 'main', mask: 1 });
    expect(sig(Lm, A)).not.toBe(sig(L0, A));
    expect(sig(Lf, A)).toBe(sig(L0, A));
  });
});
