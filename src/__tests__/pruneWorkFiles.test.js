// Fichiers de travail de public/ retirés de dist/ au build (audit 2026-10-05, ASSET-7) :
// scripts/build/pruneWorkFiles.mjs. Deux risques gardés ici : laisser partir chez les
// joueurs un README, un .aseprite ou un guide des osselets — et, pire, retirer du jeu un
// fichier qu'il charge.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { isWorkFile, listFiles, pruneWorkFiles } from '../../scripts/build/pruneWorkFiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('fichiers de travail — ce qui ne part pas chez les joueurs', () => {
  it('les fichiers relevés par l\'audit sont reconnus', () => {
    for (const rel of [
      'pixelart/ui/nav/_orig/nav-cite.png',
      'pixelart/Asepritelayers/basket-man-south.aseprite',
      'pixelart/iso/plaza/anim/zone/fountain-a.png',
      'pixelart/ui/augures/bones/_LISEZMOI.md',
      'pixelart/ui/augures/bones/_palette.gpl',
      'pixelart/ui/augures/bones/.bones.stamp',
      'pixelart/ui/augures/bones/_guide.png',
      'pixelart/ui/augures/bones/_gabarit-vierge.png',
      'pixelart/ui/augures/bones/die-1.png',
      'pixelart/README.md', 'pixelart/houses/README.md', 'pixelart/wonders/README.md',
      'pixelart/master-palette.gpl', 'pixelart/master-palette.json',
      'pixelart/grass-ref.png', 'pixelart/grass-ref.json', 'pixelart/fire-ramp.json',
      'pixelart/_archive/coupled/a.png', 'pixelart/buildings/_zoom/x.png',
      'pixelart/palettes/_contact.png', 'pixelart/wonders/arc-t5-candidats/a.png',
      'pixelart/ui/scratch/ticket-or.png',
    ]) expect(isWorkFile(rel), rel).toBe(true);
  });

  it('ce que le jeu charge reste', () => {
    for (const rel of [
      'pixelart/ui/augures/bones/bones.png',
      'icons/icon-192.png', 'manifest.webmanifest', 'sw.js', '_headers', '_redirects',
      'licenses/OFL-polices.txt', 'licenses/FontAwesome-LICENSE.txt',
      'pixelart/iso/plaza/anim/fountain-a-0.png', 'pixelart/agents/vehicles/veh-bus-southeast.png',
      'pixelart/ui/cards/back.png', '.well-known/x.txt',
    ]) expect(isWorkFile(rel), rel).toBe(false);
  });

  // Sur le VRAI public/ : aucun fichier écarté n'est nommé dans une chaîne du code du
  // jeu (src/ hors tests). Un nom construit à la volée échappe à ce filet — d'où les
  // règles étroites du module, vérifiées une à une au grep le 05/10.
  it('aucun fichier écarté de public/ n\'est demandé par le code du jeu', () => {
    const pruned = listFiles(path.join(ROOT, 'public')).filter(isWorkFile);
    expect(pruned.length).toBeGreaterThan(20);
    const code = listFiles(path.join(ROOT, 'src'))
      .filter((f) => /\.(jsx?|css)$/.test(f) && !/__tests__|\.test\./.test(f))
      .map((f) => readFileSync(path.join(ROOT, 'src', f), 'utf8'))
      .join('\n');
    const quoted = new Set([...code.matchAll(/["'`]([^"'`\n]{1,200})["'`]/g)].map((m) => m[1]));
    const asked = [...quoted].join('\n');
    // Le chemin complet, ou au moins « dossier/nom » (un même nom vit dans plusieurs
    // dossiers : ui/scratch/amphore.png est mort, ui/faveur/amphore.png est chargé).
    const hits = pruned.filter((rel) => asked.includes(rel) || asked.includes(rel.split('/').slice(-2).join('/')));
    expect(hits).toEqual([]);
  });

  it('pruneWorkFiles ne touche que dist/, et que ce qui vient de public/', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'prune-'));
    try {
      const pub = path.join(tmp, 'public'), dist = path.join(tmp, 'dist');
      const put = (base, rel, body = 'x') => {
        const f = path.join(base, ...rel.split('/'));
        mkdirSync(path.dirname(f), { recursive: true });
        writeFileSync(f, body);
      };
      const work = ['pixelart/ui/nav/_orig/a.png', 'pixelart/README.md', 'pixelart/ui/augures/bones/die-2.png'];
      const keep = ['pixelart/ui/augures/bones/bones.png', 'pixelart/ui/nav/nav-cite.png', '_headers'];
      for (const rel of [...work, ...keep]) { put(pub, rel); put(dist, rel, 'yy'); }
      // Produits par le build : jamais candidats, même avec un nom « de travail ».
      put(dist, 'assets/_commonjsHelpers-abc.js');
      put(dist, 'licenses/THIRD-PARTY-LICENSES.md');

      const r = pruneWorkFiles(dist, pub);
      expect(r.removed.sort()).toEqual([...work].sort());
      expect(r.bytes).toBe(2 * work.length);
      for (const rel of work) {
        expect(existsSync(path.join(dist, rel)), rel).toBe(false);
        expect(existsSync(path.join(pub, rel)), 'public/ intact : ' + rel).toBe(true);
      }
      for (const rel of [...keep, 'assets/_commonjsHelpers-abc.js', 'licenses/THIRD-PARTY-LICENSES.md']) {
        expect(existsSync(path.join(dist, rel)), rel).toBe(true);
      }
      // Le dossier `_orig/` vidé disparaît ; son parent, qui garde nav-cite.png, reste.
      expect(existsSync(path.join(dist, 'pixelart/ui/nav/_orig'))).toBe(false);
      expect(existsSync(path.join(dist, 'pixelart/ui/nav'))).toBe(true);
      // Un second passage ne trouve plus rien.
      expect(pruneWorkFiles(dist, pub).files).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('le plugin est branché au build, et l\'onglet n\'a plus le logo Vite', () => {
    const cfg = readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');
    expect(cfg).toMatch(/pruneWorkFilesPlugin\(\)/);
    const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).not.toMatch(/favicon\.svg/);
    expect(html).toMatch(/rel="icon"[^>]*icons\/icon-192\.png/);
    expect(existsSync(path.join(ROOT, 'public/icons/icon-192.png'))).toBe(true);
  });
});
