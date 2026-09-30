/**
 * LE CONTOUR DES BUISSONS REJOINT CELUI DES ARBRES — « une seule main » (2026-09-29).
 * ---------------------------------------------------------------------------
 * Chantier « cohérence de l'univers » (Raph : « pas juste des éléments copiés-collés
 * les uns sur les autres »). Les six buissons (`bush-1..6`, pack Cainos, cf.
 * sliceCainosPlants.mjs) sont cernés d'un contour BRUN-ROUGE (107,69,48), avec des
 * reprises brun foncé (74,47,34) ; les arbres, eux, d'un contour quasi NOIR
 * (13,11,12) et brun-noir (33,26,29). Posés côte à côte — terre-pleins, abords des
 * places —, ils ne semblaient pas dessinés par la même main.
 *
 * Mesuré sur les PNG livrés : ces deux couleurs n'apparaissent QUE sur le contour
 * (pixel opaque au bord de l'encre), jamais dans le feuillage. On les remplace donc
 * par couleur exacte, sans autre critère ; l'alpha n'est jamais écrit.
 *
 * ⚠ Les variantes d'HIVER (`bush-N-winter.png`) sont DÉRIVÉES des buissons d'été par
 * `scripts/snowTrees.mjs` : le relancer après `--apply` (il régénère aussi les arbres
 * d'hiver, à l'identique tant que leurs sprites d'été n'ont pas bougé).
 *
 * Usage :
 *   node scripts/contourBuissons.mjs            # mesure seule, n'écrit rien
 *   node scripts/contourBuissons.mjs --apply    # réécrit bush-1..6.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const APPLY = process.argv.includes('--apply');
const DIR = path.join('public', 'pixelart', 'iso');
const MAP = new Map([
  ['107,69,48', [13, 11, 12]],    // contour brun-rouge → contour des arbres
  ['74,47,34', [33, 26, 29]],     // reprise brun foncé → brun-noir des arbres
]);

let total = 0;
for (let i = 1; i <= 6; i += 1) {
  const file = path.join(DIR, `bush-${i}.png`);
  const p = PNG.sync.read(fs.readFileSync(file));
  const W = p.width, H = p.height;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && p.data[(y * W + x) * 4 + 3] > 16;
  let n = 0, inside = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const k = (y * W + x) * 4;
      if (p.data[k + 3] <= 16) continue;
      const to = MAP.get(p.data[k] + ',' + p.data[k + 1] + ',' + p.data[k + 2]);
      if (!to) continue;
      const edge = !(opaque(x + 1, y) && opaque(x - 1, y) && opaque(x, y + 1) && opaque(x, y - 1));
      if (!edge) inside += 1;
      p.data[k] = to[0]; p.data[k + 1] = to[1]; p.data[k + 2] = to[2];
      n += 1;
    }
  }
  total += n;
  console.log(`bush-${i} : ${n} px de contour repeints${inside ? ` (⚠ ${inside} hors du bord)` : ''}`);
  if (APPLY && n) fs.writeFileSync(file, PNG.sync.write(p));
}
console.log(APPLY ? `écrit (${total} px). Relancer : node scripts/snowTrees.mjs` : `Rien écrit (ajouter --apply). ${total} px à repeindre.`);
