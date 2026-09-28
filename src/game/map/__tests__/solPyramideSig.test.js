// L'INVALIDATION PARTIELLE — garde du lot 3 de PLAN-SOL-PYRAMIDE.
// Au recompute du plan, une tuile ne se recuit que si SES cellules ont changé.
// Ce que ces tests verrouillent : la signature d'une tuile est stable, elle
// change quand une cellule de la tuile change (route, urbain, bâti, cour), elle
// change aussi pour une cellule dans la marge de deux cellules (les franges et
// les faces lisent le voisinage), et elle ne bouge PAS pour une cellule loin.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { tileSig, revealTouched } from '../iso/solPyramideFrame.js';

const savedPv = CM.previewWonder, savedReveal = CM.engineHomeReveal;
afterEach(() => { CM.previewWonder = savedPv; CM.engineHomeReveal = savedReveal; });

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

// LA RÉVÉLATION PER-ACHAT : une maison-moteur pré-posée n'a d'allée de seuil
// qu'une fois révélée, et un achat ne recalcule pas le plan. C'est donc la
// signature de la tuile qui doit voir la maison apparaître — sinon la tuile reste
// fraîche et la maison n'a jamais son seuil — sans rien remuer au loin, sinon
// chaque achat recuirait la carte entière.
describe('tileSig — la maison-moteur qu un achat révèle', () => {
  const planMaison = (type = 'enginehome') => {
    const L = planVide();
    L.tiles.push({ gx: 6, gy: 1, spanX: 1, spanY: 1, type, revealIdx: 3 });
    return L;
  };
  it('la maison révélée change la signature de SA tuile, pas celle d une tuile lointaine', () => {
    const L = planMaison();
    CM.engineHomeReveal = 3;                  // index 3 pas encore atteint : masquée
    const cacheeA = sig(L, A), cacheeB = sig(L, B);
    CM.engineHomeReveal = 4;                  // un achat de plus : révélée
    expect(sig(L, A)).not.toBe(cacheeA);
    expect(sig(L, B)).toBe(cacheeB);
  });
  it('un achat qui révèle une AUTRE maison ne touche pas cette tuile', () => {
    const L = planMaison();
    CM.engineHomeReveal = 5;
    const a = sig(L, A);
    CM.engineHomeReveal = 9;                  // la maison 3 est visible des deux côtés
    expect(sig(L, A)).toBe(a);
  });
  it('une habitation ordinaire ignore le compteur', () => {
    const L = planMaison('house');
    CM.engineHomeReveal = 0;
    const a = sig(L, A);
    CM.engineHomeReveal = 10;
    expect(sig(L, A)).toBe(a);
  });
  // La frame ne re-juge que les tuiles que revealTouched désigne : elles doivent
  // être EXACTEMENT celles dont la signature change. Une de moins, et une maison
  // apparaît sans son seuil ; une de plus, et l'achat recuit pour rien.
  it('revealTouched désigne exactement les tuiles dont la signature change', () => {
    const L = planMaison();
    const tuiles = [];
    for (let ty = -3; ty <= 3; ty += 1) for (let tx = -3; tx <= 3; tx += 1) tuiles.push({ z, tx, ty, S });
    const touchees = new Set(revealTouched(L, 3, 4, tuiles));
    expect(touchees.size).toBeGreaterThan(0);
    expect(touchees.size).toBeLessThan(tuiles.length);
    for (const e of tuiles) {
      CM.engineHomeReveal = 3;
      const avant = tileSig(L, z, e.tx, e.ty, S);
      CM.engineHomeReveal = 4;
      expect(touchees.has(e)).toBe(tileSig(L, z, e.tx, e.ty, S) !== avant);
    }
  });
  it('un compteur qui bouge sans faire changer aucune maison ne touche rien', () => {
    expect(revealTouched(planMaison(), 5, 9, [{ z, tx: A[0], ty: A[1], S }])).toEqual([]);
  });
});
