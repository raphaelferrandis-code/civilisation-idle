/**
 * L'EAU CALME — la nappe du beau temps cesse de crier (2026-09-30).
 * ---------------------------------------------------------------------------
 * docs/PLAN-MAQUETTE-VIVANTE.md, lot 1. Mesuré sur l'audit : le fleuve était 3 à 7
 * fois plus saturé que la ville (0,80 contre 0,12-0,30), sur 13 à 18 % de l'écran,
 * et son motif en écailles (anneaux clairs sur fond bleu pur) se lisait à tous les
 * zooms. Raph : « oui, calme-la ».
 *
 * On garde le DESSIN de la nappe calme (`river-tiles-calm-azur.png`, 8 frames de
 * 16×16, recomposée par calmWaterTiles.mjs) et on remplace seulement ses cinq
 * couleurs, une pour une, par une eau profonde : bleu-vert rabattu, anneaux à peine
 * plus clairs que le fond, éclats doux. Aucune couleur n'est inventée pixel par
 * pixel : c'est une table de correspondance exacte, donc le motif, les frames et
 * l'animation restent identiques au pixel près.
 *
 * Sortie : `river-tiles-calm-ciel.png`. ⚠ Depuis le 2026-10-06 (audit MORT-12),
 * l'azur et le ciel de 16 px ne sont plus livrés : rangés comme source dans
 * art/references-ab/eau-planches/, où ce script lit et écrit. Le ciel est la
 * source de la nappe livrée `-v2` (scripts/eauSansEcailles.mjs).
 *
 * Usage : node scripts/eauCalme.mjs [--proof <png>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIR = path.join('art', 'references-ab', 'eau-planches');
const SRC = path.join(DIR, 'river-tiles-calm-azur.png');
const OUT = path.join(DIR, 'river-tiles-calm-ciel.png');
const PROOF = (() => { const i = process.argv.indexOf('--proof'); return i >= 0 ? process.argv[i + 1] : null; })();

// azur → ciel. Clés : les cinq couleurs de la nappe azur (comptées sur les 8 frames :
// 1 137 / 398 / 240 / 180 / 93 pixels).
export const EAU_CALME = new Map([
  ['48,120,243', [64, 112, 134]],    // fond
  ['26,93,246', [56, 102, 126]],     // creux
  ['56,168,244', [70, 121, 142]],    // anneau
  ['75,222,234', [80, 133, 151]],    // anneau clair
  // Éclat : d'abord (166,196,198) ; ses points dessinaient encore un treillis de
  // losanges clairs qui se lisait à tous les zooms et couvrait les REFLETS. Rabattu
  // à peine au-dessus de l'anneau clair (2026-09-30) : l'eau scintille sans quadriller.
  ['207,255,255', [104, 148, 162]],  // éclat
]);

const p = PNG.sync.read(fs.readFileSync(SRC));
let unknown = 0;
for (let i = 0; i < p.width * p.height; i += 1) {
  const k = p.data[i * 4] + ',' + p.data[i * 4 + 1] + ',' + p.data[i * 4 + 2];
  const to = EAU_CALME.get(k);
  if (!to) { unknown += 1; continue; }
  p.data[i * 4] = to[0]; p.data[i * 4 + 1] = to[1]; p.data[i * 4 + 2] = to[2];
}
if (unknown) { console.error(`${unknown} pixels hors palette : la nappe source a changé, table à revoir.`); process.exit(1); }
fs.writeFileSync(OUT, PNG.sync.write(p));
console.log('écrit', OUT);

if (PROOF) {
  // Planche : la frame 0 de chaque nappe, pavée 6×3, ×4.
  const a = PNG.sync.read(fs.readFileSync(SRC));
  const K = 4, TW = 16 * 6 * K, TH = 16 * 3 * K;
  const b = new PNG({ width: TW * 2 + 12, height: TH });
  for (const [src, ox] of [[a, 0], [p, TW + 12]]) {
    for (let y = 0; y < TH; y += 1) {
      for (let x = 0; x < TW; x += 1) {
        const sx = ((x / K) | 0) % 16, sy = ((y / K) | 0) % 16;
        const si = (sy * src.width + sx) * 4, di = (y * b.width + ox + x) * 4;
        b.data[di] = src.data[si]; b.data[di + 1] = src.data[si + 1]; b.data[di + 2] = src.data[si + 2]; b.data[di + 3] = 255;
      }
    }
  }
  fs.writeFileSync(PROOF, PNG.sync.write(b));
  console.log('planche', PROOF);
}
