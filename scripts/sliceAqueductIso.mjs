// sliceAqueductIso.mjs — découpe UNE bande d'aqueduc iso diagonale (générée chez
// PixelLab, 320²) en 3 modules tuilables : start (cap début) · mid (période
// répétée) · end (cap fin).
//
// ⚠ CONTRAIREMENT au terre-plein (sliceMedianIso, ROTATION PCA), une STRUCTURE
// ne se redresse PAS par rotation : pivoter la bande coucherait ses piles et ses
// arches (vu en jeu : arcade « à l'envers », piles penchées). Le redressement est
// un CISAILLEMENT : chaque COLONNE de pixels est décalée verticalement (entier →
// aucun rééchantillonnage, zéro flou) pour amener la LIGNE D'EAU à l'horizontale
// (régression sur les pixels cyan, colonnes centrales). Les verticales restent
// verticales ; le renderer re-cisaille par l'angle iso réel de l'axe (transform
// [ux, uy, 0, 1]) au lieu de pivoter. La ligne d'eau exactement horizontale
// supprime aussi les dents de scie au tuilage (« pas droit »).
//
//   Lancer :  node scripts/sliceAqueductIso.mjs <wood|roman|iron|modern> [c1Frac] [c2Frac] [endFrac]
//     lit  public/pixelart/iso/aqueduct-iso-<era>-scene.png
//     écrit aqueduct-iso-<era>-{start,mid,end}.png (+ -flat.png et -tiled.png d'inspection)
//   c1/c2 = fractions de largeur des coupes : start=[0,c1] · mid=[c1,c2] (UNE
//   période de support) · end=[endFrac,1] (défaut c2). Les caler ENTRE deux
//   supports (le cisaillement ne change PAS les x). endFrac SÉPARÉ = les pièces
//   n'ont pas à être contiguës dans la source : quand la scène porte un motif de
//   bout aux DEUX extrémités (tours romaines), end = la tour DROITE seule et les
//   travées intermédiaires sont sautées — seuls les BORDS de coupe doivent se
//   raccorder (creux↔creux). Mesure des supports : colonnes dont les pixels
//   descendent sous le corps de la bande (cf. mémo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ISO = path.resolve(HERE, '..', 'public', 'pixelart', 'iso');

const era = (process.argv[2] || 'roman').toLowerCase();
const c1Frac = Number(process.argv[3] || 0.30);
const c2Frac = Number(process.argv[4] || 0.57);
const endFrac = Number(process.argv[5] || c2Frac);

const srcPath = path.join(ISO, `aqueduct-iso-${era}-scene.png`);
if (!fs.existsSync(srcPath)) { console.error('manque', srcPath); process.exit(1); }
const src = PNG.sync.read(fs.readFileSync(srcPath));

// Pixels d'EAU (cyan/bleu clair) — même détecteur que les mesures d'inspection.
const isWater = (d, i) => d[i + 3] > 128 && d[i + 2] > d[i] + 18 && d[i + 1] > d[i] + 5 && d[i + 2] > 110;

// Pente de la ligne d'eau : médiane du y des pixels cyan PAR COLONNE, régression
// linéaire sur les colonnes centrales (60 % du support en x — les caps ont des
// fantaisies : déversoir du bois, bassin d'extrémité…).
function waterSlope(img) {
  const cols = [];
  for (let x = 0; x < img.width; x += 1) {
    const ys = [];
    for (let y = 0; y < img.height; y += 1) { if (isWater(img.data, (y * img.width + x) * 4)) ys.push(y); }
    if (ys.length >= 2) { ys.sort((a, b) => a - b); cols.push({ x, y: ys[ys.length >> 1] }); }
  }
  if (cols.length < 20) { console.error(`eau introuvable (${cols.length} colonnes) — détecteur cyan à élargir ?`); process.exit(1); }
  const lo = cols[0].x, hi = cols[cols.length - 1].x, span = hi - lo;
  const mid = cols.filter((c) => c.x >= lo + span * 0.2 && c.x <= hi - span * 0.2);
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const c of mid) { sx += c.x; sy += c.y; sxx += c.x * c.x; sxy += c.x * c.y; }
  const n = mid.length;
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { m, n, lo, hi };
}

// CISAILLEMENT vertical par colonne (décalages ENTIERS — pixels intacts) :
// y' = y - (x - cx) * m  → la ligne d'eau devient horizontale.
function shear(img, m) {
  const cx = img.width / 2;
  const shifts = [];
  let minS = Infinity, maxS = -Infinity;
  for (let x = 0; x < img.width; x += 1) {
    const s = Math.round((x - cx) * m);
    shifts.push(s); if (s < minS) minS = s; if (s > maxS) maxS = s;
  }
  const out = new PNG({ width: img.width, height: img.height + (maxS - minS) });
  for (let x = 0; x < img.width; x += 1) {
    const dy = -shifts[x] + maxS;   // décale vers le haut les colonnes qui descendaient
    for (let y = 0; y < img.height; y += 1) {
      const si = (y * img.width + x) * 4, di = ((y + dy) * out.width + x) * 4;
      out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

function trim(img, mg = 1) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    if (img.data[(y * img.width + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - mg); y0 = Math.max(0, y0 - mg);
  x1 = Math.min(img.width - 1, x1 + mg); y1 = Math.min(img.height - 1, y1 + mg);
  const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  PNG.bitblt(img, out, x0, y0, out.width, out.height, 0, 0);
  return out;
}

function subX(img, a, z) {
  const w = z - a, out = new PNG({ width: w, height: img.height });
  PNG.bitblt(img, out, a, 0, w, img.height, 0, 0);
  return out;
}

// 1) pente de la ligne d'eau, 2) cisaille (verticales préservées), 3) rogne,
// 4) coupe en start|mid|end.
const ws = waterSlope(src);
const horiz = trim(shear(src, ws.m));
// contrôle : pente résiduelle de l'eau après cisaillement (doit être ~0)
const ws2 = waterSlope(horiz);
fs.writeFileSync(path.join(ISO, `aqueduct-iso-${era}-flat.png`), PNG.sync.write(horiz)); // inspection
const W = horiz.width, H = horiz.height;
const c1 = Math.round(c1Frac * W), c2 = Math.round(c2Frac * W), ce = Math.round(endFrac * W);
const pieces = {
  start: subX(horiz, 0, c1),
  mid: subX(horiz, c1, c2),
  end: subX(horiz, ce, W),
};
for (const [k, im] of Object.entries(pieces)) {
  fs.writeFileSync(path.join(ISO, `aqueduct-iso-${era}-${k}.png`), PNG.sync.write(im));
  console.log(`aqueduct-iso-${era}-${k}.png  ${im.width}x${im.height}`);
}

// Aperçu : start + mid×4 + end posés bout-à-bout (doit lire comme une bande continue).
{
  const tiles = [pieces.start, pieces.mid, pieces.mid, pieces.mid, pieces.mid, pieces.end];
  const totW = tiles.reduce((s, t) => s + t.width, 0);
  const prev = new PNG({ width: totW, height: H });
  let ox = 0;
  for (const t of tiles) { PNG.bitblt(t, prev, 0, 0, t.width, t.height, ox, 0); ox += t.width; }
  fs.writeFileSync(path.join(ISO, `aqueduct-iso-${era}-tiled.png`), PNG.sync.write(prev));
  console.log(`aperçu aqueduct-iso-${era}-tiled.png  ${totW}x${H} (pente eau ${ws.m.toFixed(3)} → ${ws2.m.toFixed(4)} ; W=${W} ; coupes ${c1}/${c2})`);
}
