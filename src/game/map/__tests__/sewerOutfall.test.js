// LA SORTIE DES ÉGOUTS — ce que ce test garde, c'est une DÉCISION de design et
// deux invariants de la retouche, pas le calcul du script qui la produit.
//
// La décision (Raph, 2026-08-05, après trois passes) : « c'est vraiment le fait
// d'avoir de l'eau qui sort qui est bizarre. Il faudrait juste un tuyau qui rentre
// dans le sol. » Les stations d'égouts ont porté successivement un filet d'eau
// croupie, puis un caniveau à ciel ouvert : les deux sont partis. Un égout AVALE,
// il ne recrache pas. Le premier test ci-dessous est là pour que l'eau ne revienne
// pas par distraction — ni comme fichier, ni comme bande déclarée.
//
// Les deux invariants de la retouche (scripts/sewerOutfall.mjs) : elle ne doit
// RIEN ajouter hors de la silhouette d'origine (un tuyau qui flotte à côté du
// bâtiment serait pire que pas de tuyau), et elle doit tenir le verrou de teintes
// de la palette maître. Tous deux se relisent sur les PNG LIVRÉS, comparés à la
// copie vierge — jamais sur le calcul du script.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ANIM_BANDS } from '../cityEngineSprites.js';

const DIR = path.resolve(process.cwd(), 'public/pixelart/agents/buildings');
const BASE = path.resolve(process.cwd(), 'scripts/data/sewers-base');
const STADES = ['sewers-prop', 'sewers-medieval', 'sewers-works', 'sewers-plant', 'sewers-classical'];
// Stades REGÉNÉRÉS (PixelLab) : leur sprite n'a plus rien à voir avec la copie
// vierge, la comparaison à `sewers-base/` n'a donc plus de sens pour eux. Ils
// restent gardés par tout le reste (pas d'eau, verrou de teintes). Un stade entre
// dans cette liste le jour où il quitte la table de scripts/sewerOutfall.mjs.
const REGENERES = new Set(['sewers-prop']);
const lire = (dir, cle) => PNG.sync.read(fs.readFileSync(path.join(dir, cle + '.png')));
const opaque = (im, x, y) => im.data[(y * im.width + x) * 4 + 3] >= 20;

describe('bandes animées — le PNG livré tient la déclaration', () => {
  // Vaut pour TOUTES les bandes du jeu, pas seulement les égouts : une frame
  // déclarée trop large décale toute l'animation, et rien d'autre ne le dit.
  it('chaque entrée d\'ANIM_BANDS a son fichier, aux dimensions annoncées', () => {
    for (const [cle, meta] of Object.entries(ANIM_BANDS)) {
      const f = path.join(DIR, cle + '.png');
      expect(fs.existsSync(f), `${cle}.png manquant sur le disque`).toBe(true);
      const im = PNG.sync.read(fs.readFileSync(f));
      expect(im.width, `${cle} : largeur ≠ fw×frames`).toBe(meta.fw * meta.frames);
      expect(im.height, `${cle} : hauteur ≠ fh`).toBe(meta.fh);
    }
  });
});

describe('égouts — un tuyau qui rentre dans le sol, et pas d\'eau', () => {
  it('aucune eau de surface ne revient : ni bande déclarée, ni fichier', () => {
    const bandes = Object.keys(ANIM_BANDS).filter((k) => k.startsWith('sewers'));
    expect(bandes, 'les égouts ne doivent déclarer AUCUNE bande animée').toEqual([]);
    for (const mort of ['sewers-water', ...STADES.map((s) => s + '-flow')]) {
      expect(fs.existsSync(path.join(DIR, mort + '.png')), `${mort}.png est ressuscité`).toBe(false);
    }
  });

  it('la retouche n\'ajoute rien hors de la silhouette d\'origine', () => {
    for (const cle of STADES) {
      if (REGENERES.has(cle)) continue;
      const src = lire(BASE, cle), out = lire(DIR, cle);
      expect(out.width, `${cle} : le canevas a changé`).toBe(src.width);
      expect(out.height, `${cle} : le canevas a changé`).toBe(src.height);
      let dehors = 0, premier = null;
      for (let y = 0; y < src.height; y += 1) for (let x = 0; x < src.width; x += 1) {
        if (!opaque(out, x, y) || opaque(src, x, y)) continue;
        dehors += 1;
        if (!premier) premier = `(${x},${y})`;
      }
      expect(dehors, `${cle} : ${dehors} px peints hors du sprite — 1er en ${premier}`).toBe(0);
    }
  });

  it('chaque sprite tient le verrou de 24 teintes de la palette maître', () => {
    for (const cle of STADES) {
      const im = lire(DIR, cle);
      const teintes = new Set();
      for (let i = 0; i < im.data.length; i += 4) {
        if (im.data[i + 3] >= 20) teintes.add(im.data[i] + ',' + im.data[i + 1] + ',' + im.data[i + 2]);
      }
      expect(teintes.size, `${cle} : ${teintes.size} teintes`).toBeLessThanOrEqual(24);
    }
  });
});
