import { describe, it, expect } from 'vitest';
import { contactFraction, orderUnitsAroundVehicles, vehSortWide } from '../iso/isoUnits.js';

// PASSANTS ET VÉHICULES (retour Raph, 2026-10-03 : « un passant debout sur un
// chariot »). Deux gardes :
//   1. le point de tri d'un véhicule est MESURÉ sur son image (ligne de sol roues /
//      sabots sous le centre de l'encre) au lieu d'un 0,30 fixe ;
//   2. un passant qui recoupe un véhicule est rangé selon le sol du véhicule À SA
//      COLONNE, pas selon la clé unique du véhicule (fausse sur un attelage long).

describe('contactFraction — le sol sous le centre d\'un véhicule', () => {
  it('suit la ligne roue arrière → roue avant, pas la rangée la plus basse', () => {
    const fh = 40, s = new Set();
    const top = (x) => Math.round(8 + 0.4 * (x - 4));             // caisse qui descend vers la droite
    for (let x = 4; x <= 30; x += 1) for (let y = top(x); y < top(x) + 10; y += 1) s.add(x + ',' + y);
    for (const x0 of [5, 25]) for (let x = x0; x < x0 + 4; x += 1) for (let y = top(x) + 10; y < top(x) + 13; y += 1) s.add(x + ',' + y);
    const f = contactFraction((x, y) => (s.has(x + ',' + y) ? 255 : 0), fh);
    const lowest = Math.max(...[...s].map((k) => +k.split(',')[1])) + 1;
    expect(f).toBeGreaterThan(0.5);
    expect(f * fh).toBeLessThan(lowest - 2);    // sous le centre, le sol est plus HAUT que le point le plus bas
  });
  it('rend null sur une image vide', () => {
    expect(contactFraction(() => 0, 16)).toBe(null);
  });
});

describe('orderUnitsAroundVehicles — rangés selon le sol du véhicule à leur colonne', () => {
  const T = 32;
  const veh = (cx, cy, dir) => ({ kind: 'veh', v: { type: 'wagon', dir }, gwx: cx, gwy: cy, d: cx + cy });
  const cit = (gwx, gwy, d) => ({ kind: 'cit', gwx, gwy, d: d == null ? gwx + gwy : d });
  it('un passant DERRIÈRE le véhicule passe avant lui, même remonté par un bâtiment', () => {
    const v = veh(100, 100, 0);
    const p = cit(100, 96, 210);                // pieds au nord du sol (196 < 200), clé gonflée
    orderUnitsAroundVehicles([v, p], T);
    expect(p.d).toBeLessThan(v.d);
  });
  it('un passant DEVANT le véhicule passe après lui', () => {
    const v = veh(100, 100, 0);
    const p = cit(100, 103, 190);               // pieds au sud du sol (203 > 200), clé trop basse
    orderUnitsAroundVehicles([v, p], T);
    expect(p.d).toBeGreaterThan(v.d);
  });
  it('le sol suit l\'axe du véhicule : près d\'un bout, la clé unique se tromperait', () => {
    const v = veh(100, 100, 2);                 // axe nord-sud : profondeur du sol = 2·cx − colonne
    const lh = vehSortWide(v.v, T);
    // Colonne s = +lh/2 : le sol y est À 200 − lh/2. Pieds juste devant (+1) : clé brute
    // 201 − lh/2 < 200 = clé du véhicule — dessiné avant lui, il serait avalé.
    const p = cit(100.5, 100.5 - lh / 2);
    expect(lh).toBeGreaterThan(2);
    expect(p.d).toBeLessThan(v.d);
    orderUnitsAroundVehicles([v, p], T);
    expect(p.d).toBeGreaterThan(v.d);
  });
  it('ne touche pas un passant hors de l\'emprise du véhicule à l\'écran', () => {
    const v = veh(100, 100, 0);
    const far = cit(300, 100, 123);
    orderUnitsAroundVehicles([v, far], T);
    expect(far.d).toBe(123);
  });
});

// Audit du 05/10 (PERF-19) : chaque véhicule reparcourait tous les items du peintre
// (~7 000 en mégapole) pour n'y garder que les passants — V × items par frame. Les
// passants et émeutiers sont mis de côté en UNE passe : même ordre, même résultat.
describe('orderUnitsAroundVehicles — une seule passe sur les items', () => {
  // L'algorithme d'avant, tel quel : la référence.
  const before = (items, T) => {
    const vs = items.filter((it) => it.kind === 'veh' && it.v && it.v.type !== 'basket');
    const eps = T * 0.001, hp = T * 0.8;
    for (const iv of vs) {
      const v = iv.v, lh = vehSortWide(v, T);
      if (!(lh > 0)) continue;
      const hv = 3 * lh, cx = iv.gwx, cy = iv.gwy, sc = cx - cy, alongX = v.dir === 0 || v.dir === 1;
      for (const it of items) {
        if (it.kind !== 'cit' && it.kind !== 'riot') continue;
        const s = it.gwx - it.gwy;
        if (s < sc - lh || s > sc + lh) continue;
        const dp = it.gwx + it.gwy, dseg = alongX ? s + 2 * cy : 2 * cx - s;
        if (dp < dseg - hv || dp > dseg + hp) continue;
        if (dp > dseg) { if (it.d <= iv.d) it.d = iv.d + eps; } else if (it.d >= iv.d) it.d = iv.d - eps;
      }
    }
  };
  // Une rue dense : bâtiments, passants, émeutiers et véhicules mêlés (graine fixe).
  const street = () => {
    let s = 7;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const items = [];
    for (let i = 0; i < 1500; i += 1) {
      const u = r(), x = 100 + r() * 300, y = 100 + r() * 300;
      if (u < 0.6) items.push({ kind: 'bld', gwx: x, gwy: y, d: x + y });
      else if (u < 0.88) items.push({ kind: u < 0.85 ? 'cit' : 'riot', gwx: x, gwy: y, d: x + y + (r() - 0.5) * 20 });
      else items.push({ kind: 'veh', v: { type: u < 0.9 ? 'basket' : 'wagon', dir: (r() * 4) | 0 }, gwx: x, gwy: y, d: x + y });
    }
    return items;
  };
  it('rend exactement les mêmes profondeurs que l\'algorithme d\'avant', () => {
    const a = street(), b = street(), ref = street();
    before(a, 32);
    orderUnitsAroundVehicles(b, 32);
    let moved = 0;
    for (let i = 0; i < a.length; i += 1) {
      expect(b[i].d).toBe(a[i].d);
      if (a[i].d !== ref[i].d) moved += 1;
    }
    expect(moved).toBeGreaterThan(10);           // la rue fait vraiment travailler le tri
  });
  it('lit chaque item une seule fois, quel que soit le nombre de véhicules', () => {
    const items = street();
    let reads = 0;
    for (const it of items) {
      const k = it.kind;
      Object.defineProperty(it, 'kind', { get() { reads += 1; return k; } });
    }
    orderUnitsAroundVehicles(items, 32);
    expect(reads).toBe(items.length);
  });
});
