// LES FLACONS DE L'ÉCHOPPE tiennent aux articles VENDUS (audit 2026-10-05, ASSET-11).
// BOTTLE_OF gardait sept entrées pour des articles retirés au lot 1 (dés pipés, dé
// d'ivoire, ailes cirées, planches, double, refente, coffres) : une table trompeuse, et
// sept PNG livrés qu'aucun chemin ne pouvait plus demander. La table est confrontée ici
// aux articles réels et au dossier des flacons, dans les deux sens.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BOTTLE_OF, BOTTLE_POS, bottleOf } from '../echoppeBottles.js';
import { ARTIFACT_NODES } from '../../../game/data/artifacts.js';
import { upgrades } from '../../../game/data/upgrades.js';

const FLACONS = path.join('public', 'pixelart', 'boutique', 'flacons');
// Les articles de l'Échoppe, comme HeritageView les nomme : artefacts du temple
// (`temple_<nœud>`), la sébile, et les améliorations d'Héritage.
const WARES = new Set([
  ...Object.keys(ARTIFACT_NODES).map((id) => 'temple_' + id),
  'temple_autoTronc',
  ...upgrades.filter((u) => (u.group || 'heritage') === 'heritage').map((u) => u.id),
]);
const lit = new Set([...Object.values(BOTTLE_OF), bottleOf('faveur_benediction')]);

describe('flacons de l’Échoppe', () => {
  it('chaque entrée de BOTTLE_OF est un article réellement vendu', () => {
    expect(Object.keys(BOTTLE_OF).filter((id) => !WARES.has(id))).toEqual([]);
  });

  it('chaque flacon allumable a sa découpe et son image', () => {
    expect([...lit].filter((b) => !BOTTLE_POS[b])).toEqual([]);
    expect([...lit].filter((b) => !fs.existsSync(path.join(FLACONS, b + '.png')))).toEqual([]);
  });

  it('aucune découpe ni image de flacon que plus rien n’allume', () => {
    expect(Object.keys(BOTTLE_POS).filter((b) => !lit.has(b))).toEqual([]);
    const orphelins = fs.readdirSync(FLACONS).filter((f) => f.endsWith('.png') && !lit.has(f.slice(0, -4)));
    expect(orphelins).toEqual([]);
  });
});
