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
