// Quantification de palette pixel-art (median-cut, SANS dithering).
// Réduit le nombre de teintes d'un PNG (ou de tout un dossier, récursif) pour
// tuer les dégradés inutiles des générations PixelLab, sans toucher à l'alpha
// ni aux dimensions. Anims multi-frames : toutes les frames de la bande
// partagent la MÊME palette (pas de dérive chromatique entre frames).
//
// Usage:
//   node scripts/quantize.cjs <fichier|dossier> [--colors N] [--min M] [--dry]
//     --colors N  nb max de teintes (défaut 24)
//     --min M     saute les fichiers ayant déjà <= M teintes (défaut = N)
//                 => un fichier déjà propre n'est PAS réécrit (diff git minimal)
//     --dry       n'écrit rien, affiche seulement ce qui serait fait
//
// Dossiers TOUJOURS ignorés (sécurité) : _orig, _archive, splash, palettes.

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SKIP_DIRS = ['_orig', '_archive', 'splash', 'palettes'];

// ---- CLI ----
const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const getOpt = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const COLORS = parseInt(getOpt('colors', '24'), 10);
const MIN = parseInt(getOpt('min', String(COLORS)), 10);
const DRY = argv.includes('--dry');
if (!target) { console.error('Usage: node scripts/quantize.cjs <fichier|dossier> [--colors N] [--min M] [--dry]'); process.exit(1); }

// ---- helpers ----
function uniqueOpaque(png) {
  const s = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 128) continue;
    s.add((png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2]);
  }
  return s.size;
}

// median-cut sur les pixels opaques -> COLORS buckets -> chaque bucket = sa moyenne
function quantize(png, N) {
  const pixels = [];
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 128) continue;
    pixels.push([png.data[i], png.data[i + 1], png.data[i + 2], i]);
  }
  let buckets = [pixels];
  while (buckets.length < N) {
    let bi = -1, brange = -1, bch = 0;
    buckets.forEach((b, idx) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let mn = 255, mx = 0;
        for (const p of b) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; }
        const r = mx - mn;
        if (r > brange) { brange = r; bi = idx; bch = c; }
      }
    });
    if (bi < 0) break; // plus rien à couper
    const b = buckets[bi];
    b.sort((p, q) => p[bch] - q[bch]);
    const mid = b.length >> 1;
    buckets.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  for (const b of buckets) {
    if (!b.length) continue;
    let r = 0, g = 0, bl = 0;
    for (const p of b) { r += p[0]; g += p[1]; bl += p[2]; }
    r = Math.round(r / b.length); g = Math.round(g / b.length); bl = Math.round(bl / b.length);
    for (const p of b) { const i = p[3]; png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = bl; }
  }
}

function listPngs(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return p.toLowerCase().endsWith('.png') ? [p] : [];
  const out = [];
  for (const e of fs.readdirSync(p)) {
    const fp = path.join(p, e);
    if (fs.statSync(fp).isDirectory()) {
      if (SKIP_DIRS.includes(e)) continue;
      out.push(...listPngs(fp));
    } else if (e.toLowerCase().endsWith('.png')) {
      out.push(fp);
    }
  }
  return out;
}

// ---- run ----
const files = listPngs(target);
let changed = 0, skipped = 0, savedC = 0;
for (const f of files) {
  let png;
  try { png = PNG.sync.read(fs.readFileSync(f)); } catch (e) { console.warn('skip (illisible):', f); continue; }
  const before = uniqueOpaque(png);
  if (before <= MIN) { skipped++; continue; }
  quantize(png, COLORS);
  const after = uniqueOpaque(png);
  savedC += before - after;
  changed++;
  if (!DRY) fs.writeFileSync(f, PNG.sync.write(png));
  console.log(`${DRY ? '[dry] ' : ''}${path.relative(process.cwd(), f)}  ${before} -> ${after}`);
}
console.log(`\n${DRY ? '[DRY] ' : ''}${changed} réécrits, ${skipped} déjà propres (<=${MIN}), ${files.length} scannés. Teintes supprimées: ${savedC}. Cap=${COLORS}.`);
