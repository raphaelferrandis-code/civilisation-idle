// LE TERROIR (docs/PLAN-TERROIR.md, 2026-10-03).
//
// Raph, capture à l'appui : le champ « se lisait comme un tapis posé » (un bloc
// unique quadrillé, sur un carré de pavé gris) et les moulins étaient semés au
// hasard entre les maisons — 23 au nord-ouest de la ville, le champ au sud-est.
// Décision : champs en PARCELLES jointives dans l'herbe, TOUS les moulins gardés
// mais alignés en rangées au bord des champs.
import { describe, it, expect } from 'vitest';
import { computeCityLayout, cmTerroirParcels } from '../layout.js';
import { cityState as city } from '../../../test/city.js';
import { bakeMillTower, bakeMillSails, bakeMillBarn, bakeMillGround, millKind, MILL_FRAMES } from '../iso/millBake.js';
import { bakeFieldParcel } from '../iso/fieldBake.js';
import { wonderKitForBand } from '../iso/wonderKits.js';

const inked = (R) => { let n = 0; for (let k = 3; k < R.data.length; k += 4) if (R.data[k]) n += 1; return n; };

describe('terroir — un moulin et un champ par ère', () => {
  it('chaque bande cuit son moulin, ses ailes, sa halle et son sol', () => {
    const kinds = new Set();
    for (let b = 0; b <= 9; b += 1) {
      const K = wonderKitForBand(b, false);
      kinds.add(millKind(b));
      expect(inked(bakeMillTower(K, b).R), `bande ${b} : corps vide`).toBeGreaterThan(200);
      expect(inked(bakeMillBarn(K, 3, b).R), `bande ${b} : halle vide`).toBeGreaterThan(200);
      expect(inked(bakeMillGround(b, 3)), `bande ${b} : sol vide`).toBeGreaterThan(100);
      // Les poses d'ailes DIFFÈRENT d'une image à l'autre (sinon rien ne tourne).
      const a = bakeMillSails(K, 0, b), c = bakeMillSails(K, MILL_FRAMES >> 1, b);
      expect(inked(a), `bande ${b} : ailes vides`).toBeGreaterThan(40);
      expect(Buffer.from(a.data).equals(Buffer.from(c.data)), `bande ${b} : ailes figées`).toBe(false);
    }
    // Sept silhouettes pour dix bandes (pivot ×2, cosmique ×3).
    expect(kinds.size).toBe(7);
  });

  it('chaque bande cuit son champ ; les âges cosmiques s\'allument la nuit', () => {
    for (let b = 0; b <= 9; b += 1) {
      for (const season of [0, 1, 2, 3]) {
        const { R, N } = bakeFieldParcel(6, 3, { band: b, K: wonderKitForBand(b, season === 3), season, seed: 7 });
        expect(inked(R), `bande ${b}, saison ${season} : champ vide`).toBeGreaterThan(2000);
        if (b >= 7) expect(N, `bande ${b} : pas de calque de nuit`).toBeTruthy();
        else expect(N).toBeNull();
      }
    }
  });
});

const fieldsOf = (L) => L.tiles.filter((t) => t.buildingId === 'irrigated_fields');
const millsOf = (L) => L.tiles.filter((t) => t.buildingId === 'water_mills');
function cellsOf(tiles) {
  const s = new Set();
  for (const t of tiles) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) s.add((t.gx + ax) + ',' + (t.gy + ay));
  }
  return s;
}

describe('terroir — les parcelles', () => {
  it('jamais de carré dès qu\'il y a plusieurs parcelles : des lanières', () => {
    for (let lv = 1; lv <= 300; lv += 1) {
      const P = cmTerroirParcels(lv, lv * 7919);
      expect(P.length).toBeGreaterThanOrEqual(1);
      expect(P.length).toBeLessThanOrEqual(4);
      if (P.length === 1) continue;
      for (const p of P) expect(Math.max(p.w, p.h), `niveau ${lv} : ${p.w}×${p.h}`).toBeGreaterThanOrEqual(Math.min(p.w, p.h) + 2);
    }
  });

  it('le terroir grandit avec les achats (jamais moins de parcelles en achetant)', () => {
    let prev = 0;
    for (let lv = 1; lv <= 300; lv += 1) {
      const n = cmTerroirParcels(lv, 1).length;
      expect(n, `niveau ${lv}`).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});

describe('terroir — sur la carte', () => {
  it('des parcelles JOINTIVES, d\'un seul tenant, dans l\'herbe', () => {
    const L = computeCityLayout(city(60));
    const F = fieldsOf(L);
    expect(F.length, 'un seul bloc : pas de terroir').toBeGreaterThanOrEqual(2);
    for (const t of F) expect(t.rural).toBe(true);
    // D'un seul tenant (4-voisinage).
    const cells = cellsOf(F), seen = new Set(), stack = [cells.values().next().value];
    seen.add(stack[0]);
    while (stack.length) {
      const [x, y] = stack.pop().split(',').map(Number);
      for (const k of [(x + 1) + ',' + y, (x - 1) + ',' + y, x + ',' + (y + 1), x + ',' + (y - 1)]) {
        if (cells.has(k) && !seen.has(k)) { seen.add(k); stack.push(k); }
      }
    }
    expect(seen.size, 'parcelles éparses').toBe(cells.size);
    // Dans l'herbe : aucune cellule de parcelle n'est du sol de ville.
    const paved = [...cells].filter((k) => L.urbanSet.has(k));
    expect(paved).toEqual([]);
  });

  it('tous les moulins au bord du terroir, jamais jointifs', () => {
    const L = computeCityLayout(city(60));
    const fc = cellsOf(fieldsOf(L));
    const M = millsOf(L);
    expect(M.length, 'le régime halle + ateliers ne pose plus ses moulins').toBeGreaterThanOrEqual(10);
    const dist = (t) => {
      let d = Infinity;
      const sz = t.size || 1;
      for (const k of fc) {
        const [x, y] = k.split(',').map(Number);
        for (let ax = 0; ax < sz; ax += 1) for (let ay = 0; ay < sz; ay += 1) {
          d = Math.min(d, Math.max(Math.abs(t.gx + ax - x), Math.abs(t.gy + ay - y)));
        }
      }
      return d;
    };
    for (const t of M) {
      expect(t.rural, `moulin @${t.gx},${t.gy} semé hors du terroir`).toBe(true);
      expect(dist(t), `moulin @${t.gx},${t.gy} loin des champs`).toBeLessThanOrEqual(5);
    }
    const at = M.filter((t) => (t.size || 1) === 1);
    for (let i = 0; i < at.length; i += 1) {
      for (let j = i + 1; j < at.length; j += 1) {
        const d = Math.max(Math.abs(at[i].gx - at[j].gx), Math.abs(at[i].gy - at[j].gy));
        expect(d, `moulins jointifs @${at[i].gx},${at[i].gy} / @${at[j].gx},${at[j].gy}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('un ancien slot de moulin « semé dans le faubourg » n\'est pas repris', () => {
    const s = city(60);
    computeCityLayout(s);
    // Une save d'avant le terroir : le moulin nº 3 rangé dans la zone « outer », loin.
    s.cityMapSlots['1:water_mills:3'] = { dx: -40, dy: -40, zone: 'outer', id: 'water_mills' };
    const L = computeCityLayout(s);
    const m3 = L.tiles.find((t) => t.key && t.key.startsWith('engine:water_mills:3:'));
    expect(m3, 'moulin nº 3 absent').toBeTruthy();
    expect(m3.rural).toBe(true);
    expect(s.cityMapSlots['1:water_mills:3'].zone).toBe('terroir');
  });

  it('le terroir est stable d\'un calcul à l\'autre (slots repris)', () => {
    const s = city(60);
    const a = fieldsOf(computeCityLayout(s)).map((t) => [t.gx, t.gy, t.spanX, t.spanY].join(':')).sort();
    const b = fieldsOf(computeCityLayout(s)).map((t) => [t.gx, t.gy, t.spanX, t.spanY].join(':')).sort();
    expect(b).toEqual(a);
  });
});
