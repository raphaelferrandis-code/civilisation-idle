// LA LISIÈRE ARRONDIE — les invariants du classement par pixel d'art.
//
// La lisière (cf. isoLisiere.js) décide la matière de chaque texel des cellules
// de BORD. Ce qu'il promet, et que ces gardes tiennent :
//   · un bord DROIT reste à sa place (sans bruit) — seuls les coins bougent ;
//   · un coin saillant s'arrondit, une cellule isolée devient une tache ;
//   · les texels d'une cellule pavent EXACTEMENT son losange (1 024 à zoom 1),
//     sans trou ni recouvrement — sinon la couture de l'ancien losange revient ;
//   · le bord est CONTINU d'une cellule à la voisine (bruit ancré monde) ;
//   · l'eau ne vote pas : la grève garde son sable au ras du fleuve.
// Tout est pur : aucun canevas, seulement des rectangles et des matières.
import { describe, it, expect } from 'vitest';
import { makeLisiere, LISIERE } from '../isoLisiere.js';

const SANS_BRUIT = { ...LISIERE, amp: 0 };
const aire = (rects) => {
  let s = 0;
  for (let i = 0; i < rects.length; i += 4) s += (rects[i + 2] - rects[i]) * (rects[i + 3] - rects[i + 1]);
  return s;
};
// Losange d'une cellule à zoom 1 : hw = 32, coin nord en (100, 100).
const runsDe = (lis, gx, gy, own) => lis.runs(gx, gy, own, 100, 100, 32);

describe('lisière arrondie — classement par texel', () => {
  it('un bord droit reste à sa place quand le bruit est coupé', () => {
    const kindAt = (x) => (x < 1 ? 'urban' : 'grass');
    const lis = makeLisiere(kindAt, () => false, SANS_BRUIT);
    const r = runsDe(lis, 0, 0, 'urban');
    expect(r).not.toBeNull();                     // c'est bien une cellule de bord…
    expect([...r.byKind.keys()]).toEqual(['urban']);   // …dont rien ne change
  });

  it('les texels pavent le losange : 1 024 à zoom 1, quelle que soit la matière', () => {
    const kindAt = (x, y) => (x === 0 && y === 0 ? 'urban' : 'grass');
    const lis = makeLisiere(kindAt, () => false);
    for (const [gx, gy, own] of [[0, 0, 'urban'], [1, 0, 'grass'], [1, 1, 'grass']]) {
      const r = runsDe(lis, gx, gy, own);
      let tot = 0;
      for (const rects of r.byKind.values()) tot += aire(rects);
      expect(tot).toBe(1024);
    }
  });

  it('un coin saillant s’arrondit, une cellule seule devient une tache', () => {
    // Bloc 3×3 de terre : sa cellule de coin cède de l'herbe à son coin extérieur.
    const bloc = (x, y) => (x >= 0 && x <= 2 && y >= 0 && y <= 2 ? 'urban' : 'grass');
    const coin = runsDe(makeLisiere(bloc, () => false, SANS_BRUIT), 2, 2, 'urban');
    const herbeCoin = aire(coin.byKind.get('grass') || []);
    expect(herbeCoin).toBeGreaterThan(40);
    expect(herbeCoin).toBeLessThan(400);
    // Cellule isolée : il reste de la terre au centre, l'herbe prend les pointes.
    const seule = (x, y) => (x === 0 && y === 0 ? 'urban' : 'grass');
    const r = runsDe(makeLisiere(seule, () => false, SANS_BRUIT), 0, 0, 'urban');
    const terre = aire(r.byKind.get('urban') || []);
    expect(terre).toBeGreaterThan(100);
    expect(terre).toBeLessThan(700);
  });

  it('le bord est continu d’une cellule à la voisine (bruit ancré monde)', () => {
    const kindAt = (x, y) => (x + y < 3 ? 'urban' : 'grass');   // escalier en diagonale
    const lis = makeLisiere(kindAt, () => false);
    let ecarts = 0, n = 0;
    for (let gy = -2; gy <= 4; gy += 1) {
      for (let t = 0.05; t < 1; t += 0.1) {
        // de part et d'autre de l'arête x = 1, à 10⁻⁶ près
        const a = lis.kindAtPoint(1 - 1e-6, gy + t), b = lis.kindAtPoint(1 + 1e-6, gy + t);
        if (a !== b) ecarts += 1;
        n += 1;
      }
    }
    // Un point peut tomber PILE sur le bord : on tolère un écart isolé, pas une couture.
    expect(ecarts).toBeLessThanOrEqual(1);
    expect(n).toBeGreaterThan(50);
  });

  it('l’eau est hors champ : la grève garde son sable au ras du fleuve', () => {
    // Une cellule de sable seule sur la berge : herbe à l'est et à l'ouest, eau
    // au sud (son sol est peint « herbe » sous le fleuve). Si l'eau votait, son
    // herbe mangerait le sable par le bas en plus des côtés.
    const kindAt = (x, y) => (x === 0 && y === 0 ? 'sand' : 'grass');
    const eau = (x, y) => y >= 1;
    const sable = (neutral) => aire(runsDe(makeLisiere(kindAt, neutral, SANS_BRUIT), 0, 0, 'sand').byKind.get('sand') || []);
    const avecRegle = sable(eau), sansRegle = sable(() => false);
    expect(avecRegle).toBeGreaterThan(sansRegle + 100);
  });

  it('une cellule sans voisine d’une autre matière garde son losange (null)', () => {
    const lis = makeLisiere(() => 'grass', () => false);
    expect(runsDe(lis, 5, 5, 'grass')).toBeNull();
    // Les dallages formels ne sont jamais retouchés.
    const lis2 = makeLisiere((x) => (x < 1 ? 'plaza' : 'grass'), () => false);
    expect(runsDe(lis2, 0, 0, 'plaza')).toBeNull();
  });
});
