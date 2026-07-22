// Garde-fou des variantes d'icônes natives.
//
// PixelIcon sert `<nom>@<taille>.png` pour que le navigateur n'ait rien à rééchantillonner.
// Deux façons silencieuses de casser ça, que ces tests attrapent :
//   1. ajouter une icône dans une famille déclinée SANS relancer scripts/bakeUiIconSizes.cjs
//      -> la variante manque, l'<img> tombe en 404 et l'icône disparaît de l'écran ;
//   2. changer une taille dans le CSS sans toucher SIZE_BY_CLASS (ou l'inverse)
//      -> on sert du 32 dans une boîte de 24, ce qui ramène exactement le défaut corrigé.
// Le point 2 ne peut être vérifié qu'en comparant à la FEUILLE DE STYLE : on lit donc
// la règle réelle plutôt que de recopier la valeur attendue dans le test.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveIconSrc } from '../PixelIcon.jsx';

const PUB = path.resolve(__dirname, '../../../../public/pixelart/ui');
const SRC = path.resolve(__dirname, '../../../styles');
const onDisk = (url) => fs.existsSync(path.join(PUB, url.replace('/pixelart/ui/', '')));
const dimsOf = (p) => { const b = fs.readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

// Tailles déclinées par famille (miroir de SIZES_BY_FAMILY dans PixelIcon.jsx ;
// les familles absentes sont déclinées dans les quatre tailles de l'échelle).
const PAR_FAMILLE = { ruins: [24, 32], myths: [16, 32], nav: [24] };
const ECHELLE = [16, 24, 32, 48];
const FAMILLES = ['res', 'glyphs', 'prep', 'foyers', 'seals', 'myths', 'nav', 'ruins'];

describe('variantes natives des icônes d\'UI', () => {
  it('chaque maître possède les variantes déclinées pour sa famille', () => {
    const manquantes = [];
    for (const fam of FAMILLES) {
      const dir = path.join(PUB, fam);
      const maitres = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && !/@\d+\.png$/.test(f));
      for (const f of maitres) {
        const stem = f.replace(/\.png$/, '');
        const { w, h } = dimsOf(path.join(dir, f));
        for (const s of PAR_FAMILLE[fam] || ECHELLE) {
          // L'agrandissement est refusé par le script : pas de variante attendue.
          if (s > Math.min(w, h)) continue;
          if (!fs.existsSync(path.join(dir, `${stem}@${s}.png`))) manquantes.push(`${fam}/${stem}@${s}`);
        }
      }
    }
    expect(manquantes).toEqual([]);
  });

  it('chaque variante est réellement carrée et à la taille annoncée par son nom', () => {
    const faux = [];
    for (const fam of FAMILLES) {
      const dir = path.join(PUB, fam);
      for (const f of fs.readdirSync(dir).filter((x) => /@\d+\.png$/.test(x))) {
        const attendu = Number(/@(\d+)\.png$/.exec(f)[1]);
        const { w, h } = dimsOf(path.join(dir, f));
        if (w !== attendu || h !== attendu) faux.push(`${fam}/${f} = ${w}x${h}`);
      }
    }
    expect(faux).toEqual([]);
  });

  it('resolveIconSrc ne renvoie jamais un fichier absent', () => {
    const cas = [
      ['res/food', 'csp-stat-icon', undefined],
      ['res/gold', 'comptoir-icon', undefined],
      ['res/food', '', 24],
      ['glyphs/ruines', 'harvest-glyph', undefined],
      ['glyphs/temps', '', undefined],
      ['prep/exode', 'edict-seal', undefined],
      ['prep/sceau', 'edict-emblem', undefined],
      ['seals/curfew', 'policy-seal', undefined],
      ['seals/curfew', 'policy-seal', 16],
      ['myths/sisyphe', 'myth-card-icon', undefined],
      ['nav/cite', 'tab-icon', undefined],
      ['nav/save', 'qa-icon', undefined],
      ['ruins/node-oral_tradition', '', 24],
      ['ruins/node-rites_feu_court', 'myth-card-icon', undefined],
    ];
    const absents = cas
      .map(([n, c, s]) => [n, c, s, resolveIconSrc(n, c, s)])
      .filter(([, , , url]) => !onDisk(url))
      .map(([n, c, s, url]) => `${n} (classe "${c}", size ${s}) -> ${url}`);
    expect(absents).toEqual([]);
  });

  it('une famille sans variante retombe sur son maître plutôt que sur un 404', () => {
    // `augures/` et `scratch/` ne sont pas déclinés : ce sont des bandeaux et des
    // planches de tickets, dimensionnés librement et jamais servis à taille fixe.
    const url = resolveIconSrc('augures/bandeau-des', '', 24);
    expect(url).toBe('/pixelart/ui/augures/bandeau-des.png');
    // Taille non déclinée dans une famille qui l'est partiellement -> maître.
    expect(resolveIconSrc('myths/sisyphe', '', 48)).toBe('/pixelart/ui/myths/sisyphe.png');
    expect(resolveIconSrc('ruins/node-oral_tradition', '', 16)).toBe('/pixelart/ui/ruins/node-oral_tradition.png');
  });

  it('SIZE_BY_CLASS ne dérive pas des tailles déclarées dans le CSS', () => {
    // On relit les feuilles de style : si quelqu'un passe .myth-card-icon de 32 à 40,
    // le test tombe ici plutôt qu'en jeu, où ça se voit à peine mais gâche l'icône.
    const css = ['components.css', 'layout.css', 'views-crises.css', 'views-city.css']
      .map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
    const tailleDe = (cls) => {
      const m = new RegExp(`\\.${cls}(?:\\.px-icon)?\\s*\\{[^}]*?width:\\s*(\\d+)px`, 's').exec(css);
      return m && Number(m[1]);
    };
    for (const [cls, attendu] of Object.entries({
      'csp-stat-icon': 16, 'myth-card-icon': 32, 'harvest-glyph': 24,
      'edict-seal': 32, 'edict-emblem': 48, 'policy-seal': 24, 'comptoir-icon': 32,
    })) {
      expect(`${cls}=${tailleDe(cls)}`).toBe(`${cls}=${attendu}`);
    }
  });

  it('toutes les tailles servies appartiennent à l\'échelle 16/24/32/48', () => {
    const hors = [];
    for (const fam of FAMILLES) {
      for (const f of fs.readdirSync(path.join(PUB, fam)).filter((x) => /@\d+\.png$/.test(x))) {
        const s = Number(/@(\d+)\.png$/.exec(f)[1]);
        if (!ECHELLE.includes(s)) hors.push(`${fam}/${f}`);
      }
    }
    expect(hors).toEqual([]);
  });
});
