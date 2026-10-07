// CE QUE MONTRE L'ÉCRAN, EN MILIEUX (paysage/milieux.js). Sur des plans de ville faits à
// la main : au-dessus du fleuve on entend l'eau et sa rive, au-dessus de la ville la
// ville, et la forêt réelle décide entre la forêt et la prairie ; le fleuve vu à gauche
// s'entend à gauche ; la foule ne compte que les gens à l'écran.
import { describe, it, expect } from 'vitest';
import { CM } from '../../map/layout.js';
import { figuresBeginFrame, noteFig, FIG } from '../../map/figures.js';
import { MIL, grilleMilieux, milieuAt, echantillonner, mesurerFoule, nouvelleMesure, tailleVille } from '../paysage/milieux.js';

const T = CM.TILE;
// Un plan minimal : une ville rectangulaire, un fleuve droit du nord au sud (x = eau.x).
function plan({ N = 100, ville = null, eau = null } = {}) {
  const urbanSet = new Set(), cells = new Set(), banks = new Set();
  if (ville) for (let x = ville.x0; x <= ville.x1; x += 1) for (let y = ville.y0; y <= ville.y1; y += 1) urbanSet.add(x + ',' + y);
  let river = { present: false };
  if (eau) {
    const samples = [];
    for (let y = -60; y <= N + 60; y += 5) samples.push({ x: eau.x, y, hw: eau.hw });
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const d = Math.abs(x + 0.5 - eau.x);
        if (d < eau.hw) cells.add(x + ',' + y); else if (d < eau.hw + 1) banks.add(x + ',' + y);
      }
    }
    river = { present: true, samples, cells, banks };
  }
  return { gridN: N, urbanSet, roadSet: new Set(), roadMap: new Map(), tiles: [], river };
}
let plans = 1;
// Pose la caméra au-dessus de la case (gx, gy) et échantillonne l'écran.
function regarder(L, gx, gy, zoom = 1.5, densite = () => 0) {
  CM.cw = 1000; CM.ch = 600;
  CM.cam.x = gx * T; CM.cam.y = gy * T; CM.cam.zoom = zoom;
  CM.layoutRecomputeAt = plans++;
  return echantillonner(L, nouvelleMesure(), { densiteForet: densite });
}
const somme = (p) => p.foret + p.prairie + p.champ + p.eau + p.ville + p.place;

describe('les milieux à l’écran', () => {
  it("la grille : l'eau l'emporte, la place sur la ville, la ville sur la route ; hors du plan, le sauvage", () => {
    const L = plan({ N: 10, ville: { x0: 0, x1: 9, y0: 0, y1: 4 }, eau: { x: 8, hw: 1 } });
    L.roadSet.add('1,1'); L.roadSet.add('1,8');
    L.roadMap.set('2,2', { gx: 2, gy: 2, rank: 'plaza' });
    L.tiles.push({ buildingId: 'irrigated_fields', gx: 3, gy: 7, spanX: 2, spanY: 2 });
    const g = grilleMilieux(L, -1);
    expect(milieuAt(g, 1, 1)).toBe(MIL.VILLE);       // une route en ville est de la ville
    expect(milieuAt(g, 1, 8)).toBe(MIL.ROUTE);       // une route de campagne
    expect(milieuAt(g, 2, 2)).toBe(MIL.PLACE);
    expect(milieuAt(g, 4, 8)).toBe(MIL.CHAMP);
    expect(milieuAt(g, 8, 2)).toBe(MIL.EAU);         // le fleuve passe en ville : c'est de l'eau
    expect(milieuAt(g, 6, 2)).toBe(MIL.BERGE);
    expect(milieuAt(g, -3, 50)).toBe(MIL.SAUVAGE);
  });

  it("au-dessus du fleuve, on entend l'eau et sa rive, pas la ville", () => {
    const m = regarder(plan({ N: 120, eau: { x: 60, hw: 9 } }), 60, 60, 2);
    expect(m.parts.eau).toBeGreaterThan(0.5);
    expect(m.parts.rive).toBeGreaterThan(0.02);
    expect(m.parts.ville).toBe(0);
    expect(somme(m.parts)).toBeCloseTo(1, 6);
  });

  it('au-dessus de la ville, la ville', () => {
    const m = regarder(plan({ N: 140, ville: { x0: 10, x1: 130, y0: 10, y1: 130 } }), 70, 70, 1.5);
    expect(m.parts.ville).toBeGreaterThan(0.95);
    expect(m.parts.eau).toBe(0);
  });

  it('la forêt réelle décide entre la forêt et la prairie', () => {
    const L = plan({ N: 60 });
    expect(regarder(L, 30, 30, 1.5, () => 1).parts.foret).toBeCloseTo(1, 6);
    const pre = regarder(L, 30, 30, 1.5, () => 0);
    expect(pre.parts.prairie).toBeCloseTo(1, 6);
    expect(pre.parts.foret).toBe(0);
    expect(regarder(L, 30, 30, 1.5, () => 0.5).parts.foret).toBeCloseTo(0.5, 6);
  });

  it("le fleuve vu à gauche de l'écran s'entend à gauche", () => {
    const L = plan({ N: 120, eau: { x: 60, hw: 3 } });
    const m = regarder(L, 68, 60, 1.5);              // la caméra à l'est du fleuve
    expect(m.parts.eau).toBeGreaterThan(0);
    expect(m.pans.eau).toBeLessThan(-0.2);
    const n = regarder(L, 52, 60, 1.5);              // et à l'ouest
    expect(n.pans.eau).toBeGreaterThan(0.2);
  });

  it("la foule ne compte que les gens à l'écran, pondérés vers le centre", () => {
    CM.cw = 1000; CM.ch = 600; CM.cam.x = 3200; CM.cam.y = 3200; CM.cam.zoom = 1;
    figuresBeginFrame();
    noteFig(3200, 3200, FIG.STREET | FIG.MOVING);    // au centre : compte pour 1
    noteFig(3200, 3200, FIG.PLAZA);                  // un autre, sur une place
    noteFig(3200 + 20000, 3200, FIG.STREET);         // très loin hors champ : ne compte pas
    figuresBeginFrame();
    const m = mesurerFoule(nouvelleMesure());
    expect(m.foule).toBeCloseTo(2, 6);
    expect(m.foulePlace).toBeCloseTo(1, 6);
  });

  it('la taille de la ville : nulle au campement, pleine en mégapole', () => {
    expect(tailleVille({ urbanSet: { size: 40 } })).toBe(0);
    expect(tailleVille({ urbanSet: { size: 500 } })).toBeCloseTo(0.5, 1);
    expect(tailleVille({ urbanSet: { size: 9000 } })).toBe(1);
    expect(tailleVille(null)).toBe(0);
  });
});
