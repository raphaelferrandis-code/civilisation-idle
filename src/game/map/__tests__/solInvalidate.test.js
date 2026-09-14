// UNE SEULE PORTE POUR INVALIDER LE SOL — garde du lot 0 de PLAN-SOL-PYRAMIDE.
// Dix-neuf sites écrivaient `CM._isoGroundBake = null` ou `.soft = true` à la
// main ; avec un second cache (les tuiles), un site oublié = un sol périmé en
// silence. Ici : (1) la façade fait exactement ce que faisaient les sites,
// (2) plus AUCUN fichier hors du cache lui-même n'écrit cet état directement.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CM } from '../layout.js';
import { solInvalidate, setSolPyramideInvalidator } from '../iso/solInvalidate.js';

const MAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
// Les seuls fichiers autorisés à écrire l'état du bake : son propriétaire, et la façade.
const OWNERS = new Set(['isoGroundBake.js', 'solInvalidate.js']);
const DIRECT_WRITE = /_isoGroundBake(\s*=[^=]|\.soft\s*=)/;

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

const saved = CM._isoGroundBake;
afterEach(() => { CM._isoGroundBake = saved; setSolPyramideInvalidator(null); });

describe('solInvalidate — la façade fait ce que faisaient les sites', () => {
  it("'all' jette le bake (invalidation dure)", () => {
    CM._isoGroundBake = { other: 'k', camX: 0, camY: 0 };
    solInvalidate('all');
    expect(CM._isoGroundBake).toBeNull();
  });
  it("'soft' marque le bake sans le jeter, et ne crée rien s'il n'y en a pas", () => {
    CM._isoGroundBake = { other: 'k', camX: 0, camY: 0 };
    solInvalidate('soft');
    expect(CM._isoGroundBake).toEqual({ other: 'k', camX: 0, camY: 0, soft: true });
    CM._isoGroundBake = null;
    solInvalidate('soft');
    expect(CM._isoGroundBake).toBeNull();
  });
  it("'cells' vaut 'all' tant que la pyramide ne cible pas (lot 3)", () => {
    CM._isoGroundBake = { other: 'k' };
    solInvalidate('cells', new Set(['1,2']));
    expect(CM._isoGroundBake).toBeNull();
  });
  it('la pyramide reçoit chaque invalidation, avec sa clé et ses cellules', () => {
    const seen = [];
    setSolPyramideInvalidator((kind, cells) => seen.push([kind, cells]));
    const cells = new Set(['3,4']);
    solInvalidate('soft'); solInvalidate('all'); solInvalidate('cells', cells);
    expect(seen).toEqual([['soft', null], ['all', null], ['cells', cells]]);
  });
});

describe('plus aucune écriture directe de l état du bake hors de ses propriétaires', () => {
  it('src/game/map : seuls isoGroundBake.js et solInvalidate.js écrivent _isoGroundBake', () => {
    const fautifs = [];
    for (const f of jsFiles(MAP_DIR)) {
      if (OWNERS.has(basename(f))) continue;
      const src = readFileSync(f, 'utf8');
      codeLines(src).forEach((l, i) => { if (DIRECT_WRITE.test(l)) fautifs.push(`${basename(f)}:${i + 1} ${l.trim()}`); });
    }
    expect(fautifs).toEqual([]);
  });
  it('contrôle négatif : le motif attrape bien une écriture directe', () => {
    expect(DIRECT_WRITE.test('    CM._isoGroundBake = null;')).toBe(true);
    expect(DIRECT_WRITE.test('      if (CM._isoGroundBake) CM._isoGroundBake.soft = true;')).toBe(true);
    expect(DIRECT_WRITE.test('const bakeOk = () => !!(CM._isoGroundBake && x === y);')).toBe(false);
  });
});
