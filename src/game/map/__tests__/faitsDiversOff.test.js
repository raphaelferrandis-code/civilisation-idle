// Une histoire éteinte (`off`, data/faitsDivers.js) n'a plus de scène ni de trace sur
// la carte : la Chèvre des toits l'est depuis le 2026-10-05, son sprite venait du pack
// LaserKiwi, retiré faute de licence (audit STEAM-1). La vache des curiosités, elle,
// reste : le bœuf maison des attelages la dessine.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { FD_BUILDERS, buildersFor } from '../faitsDivers/fdScenes.js';
import { FD_TRACES } from '../faitsDivers/fdTraces.js';
import { FD_STORIES, FD_CURIOS } from '../../data/faitsDivers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(path.join(HERE, '..', f), 'utf8');

describe('faits divers — histoire éteinte', () => {
  it('la Chèvre n\'a plus ni scène, ni trace ; les autres histoires gardent les leurs', () => {
    expect(FD_STORIES.chevre.off).toBe(true);
    expect(FD_BUILDERS.chevre).toBeUndefined();
    expect(FD_TRACES.chevre).toBeUndefined();
    expect(buildersFor({ kind: 'story', story: FD_STORIES.chevre })).toBeNull();
    expect(buildersFor({ kind: 'trace', storyId: 'chevre' })).toBeNull();
    for (const id of ['secte', 'cynique', 'tortue', 'volant', 'borne', 'monstre', 'musicien']) {
      expect(FD_BUILDERS[id], id).toBeTruthy();
    }
    expect(FD_TRACES.cynique).toBeTruthy();
  });

  it('la chèvre sacrée de la Secte suit l\'interrupteur', () => {
    expect(src('faitsDivers/fdSecte.js')).toMatch(/!FD_STORIES\.chevre\.off && fdProgress\(FD_STORIES\.chevre\)/);
  });

  it('la vache des curiosités a toujours sa scène, dessinée par le bœuf maison', () => {
    const vache = FD_CURIOS.find((g) => g.id === 'vache');
    expect(buildersFor({ kind: 'curio', curio: vache })).toBeTruthy();
    const gags = src('faitsDivers/fdGags.js');
    expect(gags).toMatch(/drawDraftIso\(ctx, p\.x, p\.y, z, 'ox'/);
    expect(gags).not.toMatch(/drawCritterIso/);
  });
});
