// UNE SEULE PORTE POUR INVALIDER LE SOL — garde des lots 0 et 4 de PLAN-SOL-PYRAMIDE.
// (1) La façade transmet chaque invalidation, avec sa clé et ses cellules, au
// cache abonné ; (2) plus AUCUN module de src/game/map n'écrit l'état de l'ancien
// cache (`CM._isoGroundBake`), retiré au lot 4 — une écriture qui réapparaîtrait
// serait du code mort qui se croit vivant.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solInvalidate, setSolPyramideInvalidator } from '../iso/solInvalidate.js';

const MAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEAD_STATE = /_isoGroundBake|_groundZoomCache|paintIsoGroundCached|__groundZoomCacheStats/;

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== '__tests__') out.push(...jsFiles(full)); }
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}
const codeLines = (src) => src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

afterEach(() => { setSolPyramideInvalidator(null); });

describe('solInvalidate — la façade transmet tout au cache abonné', () => {
  it('chaque clé arrive, avec ses cellules', () => {
    const seen = [];
    setSolPyramideInvalidator((kind, cells) => seen.push([kind, cells]));
    const cells = new Set(['3,4']);
    solInvalidate('soft'); solInvalidate('all'); solInvalidate('cells', cells);
    expect(seen).toEqual([['soft', null], ['all', null], ['cells', cells]]);
  });
  it('sans abonné, appeler la façade ne jette pas', () => {
    expect(() => solInvalidate('all')).not.toThrow();
  });
});

describe('l ancien cache du sol est bien parti (lot 4)', () => {
  it('aucun fichier de src/game/map ne mentionne son état ni son entrée', () => {
    const fautifs = [];
    for (const f of jsFiles(MAP_DIR)) {
      const src = readFileSync(f, 'utf8');
      codeLines(src).forEach((l, i) => { if (DEAD_STATE.test(l)) fautifs.push(`${basename(f)}:${i + 1} ${l.trim()}`); });
    }
    expect(fautifs).toEqual([]);
  });
  it('contrôle négatif : le motif attrape bien une résurgence', () => {
    expect(DEAD_STATE.test('    CM._isoGroundBake = null;')).toBe(true);
    expect(DEAD_STATE.test('  paintIsoGroundCached(ctx, L, helpers);')).toBe(true);
    expect(DEAD_STATE.test('  paintGroundPyramid(ctx, L, now);')).toBe(false);
  });
});

// LES MOLETTES QUI CHANGENT LE SOL CUIT (audit du 2026-10-05, BUG-100). Les
// molettes ne vivent que sous `window` (absent sous Node) : on lit leur CORPS.
describe('les molettes qui touchent au sol cuit le font recuire', () => {
  const corps = (file, nom) => {
    const src = readFileSync(join(MAP_DIR, file), 'utf8');
    const i = src.indexOf('window.' + nom + ' = ');
    expect(i, file + ' : ' + nom).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('\n  };', i));
  };
  it('__forest (densité de la forêt → sous-bois et fleurs cuits) invalide tout le sol', () => {
    expect(corps('iso/isoWildForest.js', '__forest')).toMatch(/solInvalidate\('all'\)/);
  });
  it('__cour oublie aussi ce qui a lu l ancien champ : pelouse de ville et fleurs du camp', () => {
    const c = corps('iso/isoTissu.js', '__cour');
    for (const memo of ['_courField', '_townLawn', '_campFlowerK']) expect(c, memo).toMatch(new RegExp('CM\\.layout\\.' + memo + ' = '));
    expect(c).toMatch(/solInvalidate\('all'\)/);
  });
  // (La neige de grève, elle, passe par le suffixe : cf. solPyramideSig.test.js.)
});
