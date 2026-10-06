// Une histoire éteinte (`off`, data/faitsDivers.js) n'a plus de scène ni de trace sur
// la carte. La Chèvre des toits l'a été le 2026-10-05 (son sprite venait du pack
// LaserKiwi, retiré faute de licence, audit STEAM-1), puis RALLUMÉE avec la chèvre
// maison (PixelLab, planche validée par Raph) : scène, trace et chèvre sacrée. La vache
// des curiosités, dessinée un temps par le bœuf des attelages, a retrouvé la vache
// maison (décision de Raph, lot 13 de l'audit : fdVache.test.js).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { FD_BUILDERS, buildersFor } from '../faitsDivers/fdScenes.js';
import { FD_TRACES } from '../faitsDivers/fdTraces.js';
import { FD_STORIES, FD_CURIOS } from '../../data/faitsDivers.js';
import { CRITTERS_ON } from '../critters.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(path.join(HERE, '..', f), 'utf8');

describe('faits divers — histoires éteintes et rallumées', () => {
  it('la Chèvre est rallumée avec la chèvre maison : scène et trace, comme les autres', () => {
    expect(CRITTERS_ON).toBe(true);
    expect(FD_STORIES.chevre.off).toBeFalsy();
    expect(FD_BUILDERS.chevre).toBeTruthy();
    expect(FD_TRACES.chevre).toBeTruthy();
    expect(buildersFor({ kind: 'story', story: FD_STORIES.chevre })).toBeTruthy();
    for (const id of ['secte', 'cynique', 'tortue', 'volant', 'borne', 'monstre', 'musicien']) {
      expect(FD_BUILDERS[id], id).toBeTruthy();
    }
    // Plus aucune histoire éteinte.
    expect(Object.values(FD_STORIES).filter((s) => s.off).map((s) => s.id)).toEqual([]);
  });

  it('l\'interrupteur `off` reste branché partout (proposition, scène, trace, chèvre sacrée)', () => {
    expect(src('faitsDivers/fdScenes.js')).toMatch(/FD_STORIES\[id\]\.off/);
    expect(src('faitsDivers/fdTraces.js')).toMatch(/FD_STORIES\[id\]\.off/);
    expect(src('faitsDivers/fdSecte.js')).toMatch(/!FD_STORIES\.chevre\.off && fdProgress\(FD_STORIES\.chevre\)/);
    expect(readFileSync(path.join(HERE, '../../core/faitsDivers.js'), 'utf8')).toMatch(/if \(story\.off\) continue;/);
  });

  it('la vache des curiosités a toujours sa scène, dessinée par la vache maison', () => {
    const vache = FD_CURIOS.find((g) => g.id === 'vache');
    expect(buildersFor({ kind: 'curio', curio: vache })).toBeTruthy();
    const gags = src('faitsDivers/fdGags.js');
    expect(gags).toMatch(/drawCritterIso\(ctx, p\.x, p\.y, CM\.TILE \* z, \{ kind: 'cow'/);
    expect(gags).not.toMatch(/drawDraftIso/);
  });
});
