import { afterEach, describe, expect, it } from 'vitest';
import { CM } from '../layout.js';
import { SUN_SHADOW, sunShadowAlpha, sunShadowNightK, sunShadowPixels, sunShear } from '../iso/isoSunShadow.js';

// L'OMBRE DU SOLEIL (2026-09-30, docs/PLAN-MAQUETTE-VIVANTE.md, lot 4).
// Ce que l'œil ne vérifie pas et que ces gardes tiennent :
//   1. elle s'efface la nuit, en dézoom et molette coupée ;
//   2. elle est COUCHÉE au sol, vers le BAS-DROITE le long de l'axe (2, 1) (soleil
//      haut-gauche, la DA figée) et ne remonte JAMAIS au-dessus du pied : debout,
//      elle salissait la façade du voisin peint avant elle (un temple, 2026-09-30) ;
//   3. un SOCLE plat ne projette rien hors de lui-même (pivot 'plate') — sans quoi
//      chaque scène posée sur son dallage se lirait surélevée ;
//   4. le pied d'un mur reste collé à son ombre (pivot par colonne) ;
//   5. la couronne d'un arbre projette LOIN de son tronc (pivot au pied) ;
//   6. le masque ne garde rien de ce que le sprite recouvre de lui-même (il est
//      peint juste après) : ce serait de la surface à remplir pour rien ;
//   7. un habitant (pivot 'bottom') couche TOUTE sa silhouette depuis ses pieds :
//      par colonne, ses bras se croiraient posés au sol et leur ombre flotterait ;
//   8. les dernières ellipses de contact (bateaux, émeutiers) ne s'allument que là
//      où le soleil n'ombre plus — jamais les deux à la fois.

const saved = { night: CM.nightF, lod: CM.lodActive, on: SUN_SHADOW.on };
const { kx: KX, ky: KY } = sunShear();
afterEach(() => { CM.nightF = saved.night; CM.lodActive = saved.lod; SUN_SHADOW.on = saved.on; });

// Rend un prédicat alpha à partir d'un ensemble de pixels "x,y".
const fromSet = (set) => (x, y) => (set.has(x + ',' + y) ? 255 : 0);
const cells = (r) => {
  const out = [];
  for (let i = 0; i < r.px.length; i += 2) out.push([r.px[i] + r.ox, r.px[i + 1] + r.oy]);
  return out;
};

describe('ombre solaire', () => {
  it('disparaît la nuit, en dézoom et quand elle est coupée', () => {
    SUN_SHADOW.on = true; CM.lodActive = false; CM.nightF = 0;
    expect(sunShadowAlpha()).toBeGreaterThan(0);
    CM.nightF = 1; expect(sunShadowAlpha()).toBe(0);
    CM.nightF = 0; CM.lodActive = true; expect(sunShadowAlpha()).toBe(0);
    CM.lodActive = false; SUN_SHADOW.on = false; expect(sunShadowAlpha()).toBe(0);
  });

  it('un mur vertical projette au sol vers le bas-droite, collé à son pied', () => {
    const s = new Set();
    for (let y = 0; y < 20; y += 1) s.add('5,' + y);            // un poteau de 20 px, pied en y = 19
    const r = sunShadowPixels(fromSet(s), 12, 20, 'column', KX, KY);
    expect(r).toBeTruthy();
    const c = cells(r);
    // Le sommet part le plus loin, vers la droite ET vers le bas.
    const far = c.reduce((a, p) => (p[0] > a[0] ? p : a));
    expect(far[0]).toBeGreaterThan(5);
    expect(far[1]).toBeGreaterThan(0);
    // Rien à gauche du poteau : le soleil vient de la gauche.
    for (const [x] of c) expect(x).toBeGreaterThanOrEqual(5);
    // Couchée : rien au-dessus du pied (y = 19), et le sommet suit l'axe (2, 1).
    for (const [, y] of c) expect(y).toBeGreaterThanOrEqual(19);
    expect(Math.abs((far[0] - 5) - 2 * (far[1] - 19.5))).toBeLessThanOrEqual(2);
    // Collé au pied : un pixel d'ombre touche la colonne du poteau, près du sol.
    expect(c.some(([x, y]) => x <= 6 && y >= 17)).toBe(true);
  });

  it('un socle plat (losange) ne projette RIEN hors de lui-même', () => {
    const s = new Set();
    const W = 48, H = 24, cx = 23.5, cy = 11.5;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (Math.abs(x - cx) / 24 + Math.abs(y - cy) / 12 <= 1) s.add(x + ',' + y);
      }
    }
    const r = sunShadowPixels(fromSet(s), W, H, 'plate', KX, KY);
    const dehors = r ? cells(r).filter(([x, y]) => !s.has(x + ',' + y)) : [];
    expect(dehors, 'pixels d\'ombre hors du socle').toEqual([]);
    // Le pivot par colonne, lui, prendrait la profondeur du losange pour une
    // hauteur et poserait une fausse bande d'ombre devant : c'est pour ça que les
    // socles ont leur pivot.
    const col = sunShadowPixels(fromSet(s), W, H, 'column', KX, KY);
    expect(cells(col).filter(([x, y]) => !s.has(x + ',' + y)).length).toBeGreaterThan(0);
  });

  it('le masque ne garde pas ce que le sprite cache lui-même', () => {
    const s = new Set();
    for (let y = 4; y < 30; y += 1) for (let x = 4; x < 20; x += 1) s.add(x + ',' + y);   // un bloc plein
    const r = sunShadowPixels(fromSet(s), 40, 40, 'column', KX, KY);
    expect(r).toBeTruthy();
    for (const [x, y] of cells(r)) expect(s.has(x + ',' + y), x + ',' + y).toBe(false);
  });

  it('un habitant couche toute sa silhouette depuis ses pieds (pivot bottom)', () => {
    const s = new Set();
    for (let y = 2; y < 20; y += 1) { s.add('6,' + y); s.add('7,' + y); }   // corps et jambes, pieds en y = 19
    for (let y = 6; y < 13; y += 1) { s.add('4,' + y); s.add('9,' + y); }   // bras ballants, mains en y = 12
    const r = sunShadowPixels(fromSet(s), 16, 22, 'bottom', KX, KY);
    for (const [, y] of cells(r)) expect(y).toBeGreaterThanOrEqual(19);
    // Par colonne, la main se croirait au sol : son ombre flotterait au-dessus des pieds.
    const col = sunShadowPixels(fromSet(s), 16, 22, 'column', KX, KY);
    expect(cells(col).some(([, y]) => y < 19)).toBe(true);
  });

  it('les ellipses de contact ne s\'allument que sans soleil', () => {
    SUN_SHADOW.on = true; CM.lodActive = false; CM.nightF = 0;
    expect(sunShadowNightK()).toBe(0);
    CM.nightF = 1; expect(sunShadowNightK()).toBe(1);
    CM.nightF = 0; CM.lodActive = true; expect(sunShadowNightK()).toBe(1);
    CM.lodActive = false; SUN_SHADOW.on = false; expect(sunShadowNightK()).toBe(1);
  });

  it('la couronne d\'un arbre projette loin de son tronc (pivot au pied)', () => {
    const s = new Set();
    for (let y = 14; y < 20; y += 1) s.add('10,' + y);                       // tronc
    for (let y = 2; y < 10; y += 1) for (let x = 6; x < 15; x += 1) s.add(x + ',' + y);   // couronne
    const r = sunShadowPixels(fromSet(s), 30, 20, 1, KX, KY);
    const c = cells(r);
    // L'ombre de la couronne tombe à droite de la couronne elle-même.
    const maxX = Math.max(...c.map(([x]) => x));
    expect(maxX).toBeGreaterThan(14 + 2);
    // Avec le pivot par colonne, la couronne se serait crue posée au sol : son
    // ombre serait restée collée dessous — c'est pour ça que les arbres ont leur pivot.
    const col = sunShadowPixels(fromSet(s), 30, 20, 'column', KX, KY);
    expect(Math.max(...cells(col).map(([x]) => x))).toBeLessThan(maxX);
  });

  // 9. Un véhicule vu en BIAIS touche le sol à plusieurs hauteurs d'écran (retour Raph,
  //    2026-10-03 : « le chariot vole »). Pivot 'slope' : l'ombre part des DEUX roues,
  //    et elle reste d'un seul tenant (un sol par colonne source laissait des stries).
  describe('véhicule vu en biais (pivot slope)', () => {
    // Caisse en parallélogramme qui descend vers la droite, roue arrière haute, roue
    // avant basse (≈ 8 px plus bas à l'écran), comme un chariot tourné vers le sud-est.
    const s = new Set();
    const top = (x) => Math.round(8 + 0.4 * (x - 4));
    for (let x = 4; x <= 30; x += 1) for (let y = top(x); y < top(x) + 10; y += 1) s.add(x + ',' + y);
    const wheel = (x0) => { for (let x = x0; x < x0 + 4; x += 1) for (let y = top(x) + 10; y < top(x) + 13; y += 1) s.add(x + ',' + y); };
    wheel(5); wheel(25);
    const rearFoot = Math.max(...[...s].map((k) => k.split(',').map(Number)).filter(([x]) => x <= 8).map(([, y]) => y));
    const near = (c) => c.some(([x, y]) => x >= 5 && x <= 10 && y >= rearFoot - 1 && y <= rearFoot + 2);
    it('l\'ombre touche la roue arrière (en pivot bottom, elle s\'en décollait)', () => {
      expect(near(cells(sunShadowPixels(fromSet(s), 40, 40, 'slope', KX, KY)))).toBe(true);
      expect(near(cells(sunShadowPixels(fromSet(s), 40, 40, 'bottom', KX, KY)))).toBe(false);
    });
    it('l\'ombre et le véhicule ne forment qu\'une seule tache (pas de strie détachée)', () => {
      const all = new Set(s);
      for (const [x, y] of cells(sunShadowPixels(fromSet(s), 40, 40, 'slope', KX, KY))) all.add(x + ',' + y);
      const seen = new Set(), start = all.values().next().value, stack = [start];
      while (stack.length) {
        const k = stack.pop();
        if (seen.has(k) || !all.has(k)) continue;
        seen.add(k);
        const [x, y] = k.split(',').map(Number);
        stack.push((x + 1) + ',' + y, (x - 1) + ',' + y, x + ',' + (y + 1), x + ',' + (y - 1));
      }
      expect(seen.size).toBe(all.size);
    });
  });
});
