// L'ÈRE DANS LES SIGNATURES DU PLAN (PERF-59, audit du 2026-10-05). Le runtime
// gardait cityCounts en cache sous la clé floor(toNum(pop)/500)|… : recalculé à
// chaque tick passé ~5e6 habitants (le cache ne servait à rien), et FIGÉ au-delà de
// 1e308, où toNum rend Infinity — un passage d'ère transcendante n'y relançait plus
// le plan avant un achat. L'ère est désormais lue à chaque frame sur le Decimal.
//
// Monter la vraie carte pour une ère transcendante coûterait un plan de mégapole :
// on garde la preuve bon marché (le Decimal voit l'ère, l'ancienne clé non) et un
// garde-fou sur le câblage, dans l'idiome de frameGuard.test.js.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { state } from '../../core/state.js';
import { D, toNum } from '../../core/num.js';
import { eras } from '../../data/world.js';
import { currentEraIndex } from '../../core/mechanics.js';

const savedPop = state.population;
afterEach(() => { state.population = savedPop; });

describe('ère des signatures du plan au-delà de 1e308', () => {
  it('deux ères transcendantes : currentEraIndex les distingue, l ancienne clé toNum non', () => {
    // Deux ères consécutives au-delà du domaine des flottants.
    const k = eras.findIndex((e) => D(e.at).gt('1e310'));
    expect(k).toBeGreaterThan(0);
    expect(k + 1).toBeLessThan(eras.length);
    const oldKey = () => Math.floor(toNum(state.population) / 500);
    state.population = D(eras[k].at).mul(1.5);
    const a = currentEraIndex(), keyA = oldKey();
    state.population = D(eras[k + 1].at).mul(1.5);
    const b = currentEraIndex(), keyB = oldKey();
    expect(b).toBe(a + 1);
    expect(keyB).toBe(keyA);          // Infinity des deux côtés : le piège d'avant
  });

  it('le runtime lit l ère sur le Decimal, sans clé toNum de population', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'cityMapRuntime.js'), 'utf8');
    const body = src.slice(src.indexOf('function cityMapEnsureLayoutInner('));
    const head = body.slice(0, body.indexOf('const coreSig'));
    expect(head).toMatch(/const eraIndex = currentEraIndex\(\);/);
    expect(head).not.toMatch(/toNum\(state\.population\)/);
    // Les trois signatures portent cette ère-là.
    expect((head.match(/= eraIndex \+ '\|'/g) || []).length).toBe(2);
    expect(body).toMatch(/const coreSig = eraIndex \+ '\|'/);
  });
});
