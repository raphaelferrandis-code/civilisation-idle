/**
 * L'EAU TROUBLE — le fleuve d'une cité qui tombe (2026-10-04).
 * ---------------------------------------------------------------------------
 * Analyse du visuel de crise (Raph : « A et B oui ») : quand la cité passe en ruine
 * (Usure > 0,88 ou Rupture à 100 %), le fleuve prenait le coloris « usure » —
 * turquoise VIF (0,160,144 → éclats 207,255,255), le plus saturé de tout l'écran :
 * un lagon de carte postale au pire moment de la partie. (Le turquoise venait de la
 * demande du 2026-07-30 « turquoise quand rupture/usure haute » ; il reste sur le
 * disque, `__waterSheets.usure.src = '/pixelart/water/river-tiles-calm-turquoise-v2.png'`
 * le rejoue.)
 *
 * Même méthode que l'eau calme (eauCalme.mjs) : on garde le DESSIN et les 8 images
 * de la nappe turquoise, et on remplace ses cinq couleurs une pour une, par rôle,
 * par une eau stagnante : boue olive-brun, presque sans saturation (assez loin de
 * l'ardoise de l'averse pour ne pas s'y confondre), reflets éteints. Table exacte :
 * motif, frames et animation identiques au pixel.
 *
 * Sorties : public/pixelart/water/river-tiles-calm-trouble-v2.png (nappe de 64 px,
 * branchée par WATER_SHEETS.usure) et river-tiles-calm-trouble.png (l'ancienne bande
 * de 16 px, même palette — témoin des tests de palette).
 *
 * Usage : node scripts/eauTrouble.mjs [--proof <png>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIR = path.join('public', 'pixelart', 'water');
const PAIRS = [
  ['river-tiles-calm-turquoise-v2.png', 'river-tiles-calm-trouble-v2.png'],
  ['river-tiles-calm-turquoise.png', 'river-tiles-calm-trouble.png'],
];
const PROOF = (() => { const i = process.argv.indexOf('--proof'); return i >= 0 ? process.argv[i + 1] : null; })();

// turquoise → trouble, par rôle (comptes sur la nappe de 64 px : 25 329 / 4 993 /
// 1 766 / 596 / 84 pixels). Écarts entre rôles gardés MINCES, comme l'eau calme :
// une eau morte ne scintille presque plus.
export const EAU_TROUBLE = new Map([
  ['0,160,144', [86, 88, 68]],      // fond
  ['5,140,125', [77, 79, 61]],      // creux
  ['15,178,159', [94, 95, 74]],     // anneau
  ['75,222,234', [104, 104, 82]],   // anneau clair
  ['207,255,255', [126, 124, 98]],  // éclat
]);

const outs = [];
for (const [from, to] of PAIRS) {
  const p = PNG.sync.read(fs.readFileSync(path.join(DIR, from)));
  let unknown = 0;
  for (let i = 0; i < p.width * p.height; i += 1) {
    const k = p.data[i * 4] + ',' + p.data[i * 4 + 1] + ',' + p.data[i * 4 + 2];
    const c = EAU_TROUBLE.get(k);
    if (!c) { unknown += 1; continue; }
    p.data[i * 4] = c[0]; p.data[i * 4 + 1] = c[1]; p.data[i * 4 + 2] = c[2];
  }
  if (unknown) { console.error(`${from} : ${unknown} pixels hors palette — table à revoir.`); process.exit(1); }
  fs.writeFileSync(path.join(DIR, to), PNG.sync.write(p));
  outs.push(p);
  console.log('écrit', path.join(DIR, to));
}

if (PROOF) {
  // Planche : la frame 0 de la nappe 64 px, beau temps / turquoise / trouble, ×3.
  const srcs = ['river-tiles-calm-ciel-v2.png', 'river-tiles-calm-turquoise-v2.png']
    .map((f) => PNG.sync.read(fs.readFileSync(path.join(DIR, f)))).concat([outs[0]]);
  const K = 3, S = 64, TW = S * 2 * K, TH = S * K, GAP = 12;
  const b = new PNG({ width: TW * 3 + GAP * 2, height: TH });
  srcs.forEach((src, n) => {
    const ox = n * (TW + GAP);
    for (let y = 0; y < TH; y += 1) {
      for (let x = 0; x < TW; x += 1) {
        const sx = ((x / K) | 0) % S, sy = ((y / K) | 0) % S;
        const si = (sy * src.width + sx) * 4, di = (y * b.width + ox + x) * 4;
        b.data[di] = src.data[si]; b.data[di + 1] = src.data[si + 1]; b.data[di + 2] = src.data[si + 2]; b.data[di + 3] = 255;
      }
    }
  });
  fs.writeFileSync(PROOF, PNG.sync.write(b));
  console.log('planche', PROOF);
}
