// ALLÉES DE SEUIL HORS DE LA TUILE (PERF-52, audit du 2026-10-05). Chaque cuisson
// de tuile du sol projetait et remplissait les allées de TOUTES les habitations de
// la ville (1 082 quads pour 157 utiles, ville d'ère 24). Elles sont désormais
// écartées hors des bornes de la cuisson — sans rien changer au rendu : les fills
// tombent aux mêmes allées qu'avant (une allée écartée compte dans son paquet), et
// chaque fill porte exactement les allées d'avant qui peuvent toucher la tuile.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { drawIsoGroundRoads } from '../iso/isoGroundRoads.js';

const savedCam = { ...CM.cam }, savedCw = CM.cw, savedCh = CM.ch;
afterEach(() => { Object.assign(CM.cam, savedCam); CM.cw = savedCw; CM.ch = savedCh; });

const T = 32;
// Une ville de 30 × 30 habitations (une case sur trois), une rue au sud de chacune.
function city() {
  const tiles = [], roadMap = new Map();
  for (let j = 0; j < 30; j += 1) for (let i = 0; i < 30; i += 1) {
    const gx = i * 3, gy = j * 3;
    tiles.push({ gx, gy, type: (i + j) % 5 ? 'house' : 'engine', buildingId: 'markets' });
    roadMap.set(gx + ',' + (gy + 1), { rank: 'path', mask: 0 });
  }
  return { tiles, roadMap, roadSet: new Set(roadMap.keys()), urbanSet: new Set() };
}
// La passe des allées seule (aucune cellule-route : pas de calque d'art), relevée
// fill par fill : chaque sous-chemin est noté par son premier sommet.
function allees(L, b) {
  const fills = [];
  let cur = [];
  const ctx = { globalAlpha: 1, fillStyle: '' };
  for (const k of ['closePath', 'lineTo', 'fillRect', 'save', 'restore', 'clip']) ctx[k] = () => {};
  ctx.beginPath = () => { cur = []; };
  ctx.moveTo = (x, y) => { cur.push(x.toFixed(3) + ',' + y.toFixed(3)); };
  ctx.fill = () => { fills.push(cur); };
  drawIsoGroundRoads(
    { ctx, T, z: 1, hw: T, LOD: false, HARD: false, L, band: 0,
      road: [120, 100, 80], roadMap: L.roadMap, urb: [150, 130, 100], PR: null, b },
    { kindAt: () => 'grass' },
    [],
  );
  return fills;
}

describe('allées de seuil : seules celles de la tuile sont tracées, au même rendu', () => {
  it('mêmes paquets, et dans chacun exactement les allées d avant proches de la tuile', () => {
    Object.assign(CM.cam, { x: 0, y: 0, zoom: 1 });
    CM.cw = 800; CM.ch = 600;
    const L = city();
    const b = { gx0: 30, gx1: 45, gy0: 30, gy1: 45 };
    const all = allees(L, null);
    const cut = allees(L, b);
    // Toute la ville sans bornes (le chemin d'avant) : 900 allées, en paquets de 256.
    expect(all.reduce((n, f) => n + f.length, 0)).toBe(900);
    expect(cut.length).toBe(all.length);
    // Les allées attendues : façade (gx, gy) et rue (gx, gy + 1) dans les bornes ±3.
    const near = (t) => t.gx + 1 >= b.gx0 - 3 && t.gx <= b.gx1 + 3 && t.gy + 2 >= b.gy0 - 3 && t.gy <= b.gy1 + 3;
    let want = 0;
    for (const t of L.tiles) if (near(t)) want += 1;
    expect(cut.reduce((n, f) => n + f.length, 0)).toBe(want);
    expect(want).toBeLessThan(100);
    // Chaque paquet garde les siennes, dans le même ordre, aux mêmes sommets.
    for (let i = 0; i < all.length; i += 1) {
      const kept = new Set(cut[i]);
      expect(all[i].filter((s) => kept.has(s))).toEqual(cut[i]);
    }
  });
});
