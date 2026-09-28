// PAS DE SEUIL SANS MAISON — la règle de visibilité des maisons-moteur, partagée.
//
// Le plan pose d'avance ENGINE_HOME_LOOKAHEAD maisons-moteur qu'un achat
// révélera ; le peintre les cache tant que le compteur de révélation n'a pas
// atteint leur index. Le sol cuit, lui, dessinait leur allée de seuil quand
// même : dès le campement de départ, de courts traits sombres sortaient du sol
// nu vers les sentiers (22 maisons cachées sur 26 avaient une rue devant elles).
//
// Trois verrous : (1) la règle elle-même ; (2) la passe des allées la suit ;
// (3) aucun module de src/game/map ne la réécrit à la main — c'est une copie
// divergente, pas une règle absente, qui avait laissé passer ces traits.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CM, cmEngineHomeHidden } from '../layout.js';
import { drawIsoGroundRoads } from '../iso/isoGroundRoads.js';

const savedReveal = CM.engineHomeReveal;
afterEach(() => { CM.engineHomeReveal = savedReveal; });

describe('cmEngineHomeHidden — la règle', () => {
  it('une maison-moteur est masquée tant que le compteur n a pas atteint son index', () => {
    const t = { type: 'enginehome', revealIdx: 3 };
    expect(cmEngineHomeHidden(t, 3)).toBe(true);
    expect(cmEngineHomeHidden(t, 4)).toBe(false);
  });
  it('par défaut, elle lit le compteur VIVANT (et 0 tant qu il n existe pas)', () => {
    const t = { type: 'enginehome', revealIdx: 0 };
    CM.engineHomeReveal = undefined;
    expect(cmEngineHomeHidden(t)).toBe(true);
    CM.engineHomeReveal = 1;
    expect(cmEngineHomeHidden(t)).toBe(false);
  });
  it('une habitation ordinaire n est jamais masquée', () => {
    expect(cmEngineHomeHidden({ type: 'house', revealIdx: 9 }, 0)).toBe(false);
  });
});

// La passe des allées, seule : aucune cellule-route à peindre (pas de calque
// d'art ouvert), donc chaque sous-chemin du contexte est une allée de seuil.
function allees(tiles) {
  const ctx = { n: 0, globalAlpha: 1, fillStyle: '' };
  for (const k of ['beginPath', 'closePath', 'lineTo', 'fill', 'fillRect', 'save', 'restore', 'clip']) ctx[k] = () => {};
  ctx.moveTo = () => { ctx.n += 1; };
  const roadMap = new Map();
  for (const t of tiles) roadMap.set(t.gx + ',' + (t.gy + 1), { rank: 'path', mask: 0 });   // une rue au sud de chacune
  const L = { tiles, roadMap, roadSet: new Set(roadMap.keys()), urbanSet: new Set() };
  drawIsoGroundRoads(
    { ctx, T: 32, z: 1, hw: 32, LOD: false, HARD: false, L, band: 0,
      road: [120, 100, 80], roadMap, urb: [150, 130, 100], PR: null },
    { kindAt: () => 'grass' },
    [],
  );
  return ctx.n;
}
// Tuiles neuves à chaque appel : isoBuildingFront mémoïse la façade sur la tuile.
const camp = () => [
  { gx: 5, gy: 5, type: 'house' },
  { gx: 8, gy: 5, type: 'enginehome', revealIdx: 0 },
  { gx: 11, gy: 5, type: 'enginehome', revealIdx: 5 },
];

describe('allées de seuil — pas de porte pour une maison cachée', () => {
  it('la maison-moteur masquée n a pas d allée ; la visible et la tente en ont une', () => {
    CM.engineHomeReveal = 1;                  // index 0 révélé, index 5 masqué
    expect(allees(camp())).toBe(2);
  });
  it('la même maison, une fois révélée, reçoit la sienne', () => {
    CM.engineHomeReveal = 6;
    expect(allees(camp())).toBe(3);
  });
});

// ── La règle n'existe qu'à un endroit ────────────────────────────────────────
const MAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const INLINE_RULE = /revealIdx\s*\|\|\s*0\)\s*>=/;
function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== '__tests__') out.push(...jsFiles(full)); }
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('la règle de visibilité n est écrite qu une fois', () => {
  it('aucun module de src/game/map ne la recopie hors de layout.js', () => {
    const fautifs = [];
    for (const f of jsFiles(MAP_DIR)) {
      if (basename(f) === 'layout.js') continue;
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
        if (INLINE_RULE.test(l)) fautifs.push(`${basename(f)}:${i + 1} ${l.trim()}`);
      });
    }
    expect(fautifs).toEqual([]);
  });
  it('contrôle négatif : le motif attrape bien une copie', () => {
    expect(INLINE_RULE.test("if (t.type === 'enginehome' && (t.revealIdx || 0) >= (CM.engineHomeReveal || 0)) continue;")).toBe(true);
    expect(INLINE_RULE.test("if (_t.type === 'enginehome' && (_t.revealIdx || 0) === _last) { break; }")).toBe(false);
  });
});
