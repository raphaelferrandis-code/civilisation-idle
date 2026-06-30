// remapPalette.mjs — REPLI anti-bloat : ramène un sprite PixelLab sur la palette maître.
//   L'API pixflux/bitforge accepte un `color_image` (palette forcée) mais c'est un BIAIS,
//   pas un verrou — et le MCP create_map_object ne l'expose même pas. Ce script applique
//   donc le verrou DUR en post-traitement : chaque pixel est rabattu (plus proche voisin
//   perceptuel) sur la palette UTILISABLE de l'époque du sprite, puis on plafonne à K teintes.
//
//   Lancer :
//     node scripts/remapPalette.mjs <fichier.png> [--epoch <id>] [--max 22] [--inplace] [--out dir] [--dry]
//     node scripts/remapPalette.mjs --dir public/pixelart/agents [--dry]   (lot, époque auto par tag)
//
//   • --epoch  force l'époque (feu|bois|pierre|couronne|marbre|fonte|neon|noosphere|stellaire|demiurge).
//              Sinon : déduite de spriteEpochTags (master-palette.json) d'après le nom de fichier.
//   • --max    plafond de teintes par sprite (défaut 22 ; viser 16-24).
//   • --no-accent  n'utilise que le cœur (36) — pour un sprite sans signature d'époque.
//   • --inplace écrase le fichier ; sinon écrit <nom>.remap.png à côté (ou dans --out).
//   • --dry    ne fait que rapporter (aucune écriture).
//   • --fringe seuil alpha sous lequel le pixel devient transparent (défaut 16) — tue le halo AA.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const PUB = path.join(ROOT, 'public', 'pixelart');
const PAL = JSON.parse(fs.readFileSync(path.join(PUB, 'master-palette.json'), 'utf8'));

/* ---- args ---------------------------------------------------------------- */
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--inplace', '--dry', '--no-accent'].includes(argv[i - 1])));
const MAX = parseInt(opt('--max', '22'), 10);
const FRINGE = parseInt(opt('--fringe', '16'), 10);
const DRY = flag('--dry');
const INPLACE = flag('--inplace');
const NO_ACCENT = flag('--no-accent');
const OUTDIR = opt('--out', null);
const EPOCH_FORCE = opt('--epoch', null);

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const stemOf = (file) => path.basename(file, '.png');

// Époque d'un fichier : --epoch > tag exact > plus long tag préfixe > null.
function epochFor(file) {
  if (EPOCH_FORCE) return EPOCH_FORCE;
  const stem = stemOf(file);
  if (PAL.spriteEpochTags[stem]) return PAL.spriteEpochTags[stem];
  let best = null;
  for (const k of Object.keys(PAL.spriteEpochTags)) {
    if (stem.startsWith(k) && (!best || k.length > best.length)) best = k;
  }
  return best ? PAL.spriteEpochTags[best] : null;
}

// Palette cible (RGB) pour une époque : cœur (+ accent sauf --no-accent).
function targetFor(epochId) {
  const core = PAL.coreFlat.slice();
  if (NO_ACCENT || !epochId) return core.map(hexToRgb);
  const e = PAL.epochs.find((x) => x.id === epochId);
  const acc = e ? [e.accent.deep, e.accent.mid, e.accent.bright] : [];
  return [...core, ...acc].map(hexToRgb);
}

// Distance perceptuelle « redmean » (bon compromis sans passer en Lab).
function dist(r1, g1, b1, r2, g2, b2) {
  const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}
function nearest(target, r, g, b) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < target.length; i++) {
    const t = target[i], d = dist(r, g, b, t[0], t[1], t[2]);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function countColors(data) {
  const s = new Set();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) s.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return s.size;
}

function remapFile(file) {
  const epochId = epochFor(file);
  const target = targetFor(epochId);
  const png = PNG.sync.read(fs.readFileSync(file));
  const { data } = png;
  const before = countColors(data);

  // 1) snap chaque pixel opaque sur la cible (index palette mémorisé).
  const idxOf = new Int32Array(data.length / 4).fill(-1);
  const usage = new Map();
  for (let p = 0, i = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < FRINGE) { data[i + 3] = 0; continue; } // halo AA → transparent
    const bi = nearest(target, data[i], data[i + 1], data[i + 2]);
    idxOf[p] = bi;
    usage.set(bi, (usage.get(bi) || 0) + 1);
  }

  // 2) plafond K : garder les MAX teintes les plus utilisées, rabattre les autres
  //    sur la plus proche teinte CONSERVÉE.
  let collapse = null;
  if (usage.size > MAX) {
    const kept = [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX).map(([i]) => i);
    const keptSet = new Set(kept);
    collapse = new Map();
    for (const [i] of usage) {
      if (keptSet.has(i)) { collapse.set(i, i); continue; }
      const [r, g, b] = target[i];
      let bj = kept[0], bd = Infinity;
      for (const j of kept) { const t = target[j], d = dist(r, g, b, t[0], t[1], t[2]); if (d < bd) { bd = d; bj = j; } }
      collapse.set(i, bj);
    }
  }

  // 3) appliquer.
  for (let p = 0, i = 0; i < data.length; i += 4, p++) {
    let bi = idxOf[p];
    if (bi < 0) continue;
    if (collapse) bi = collapse.get(bi);
    const t = target[bi];
    data[i] = t[0]; data[i + 1] = t[1]; data[i + 2] = t[2];
  }
  const after = countColors(data);

  let outPath = file;
  if (!INPLACE) {
    const stem = stemOf(file);
    outPath = OUTDIR ? path.join(OUTDIR, stem + '.png') : path.join(path.dirname(file), stem + '.remap.png');
  }
  if (!DRY) { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, PNG.sync.write(png)); }
  console.log(`${(epochId || 'core').padEnd(10)} ${String(before).padStart(4)} → ${String(after).padStart(3)} teintes  ${DRY ? '[dry] ' : ''}${path.basename(file)}${INPLACE ? '' : DRY ? '' : ' → ' + path.basename(outPath)}`);
  return { file, epochId, before, after };
}

/* ---- run ----------------------------------------------------------------- */
const dir = opt('--dir', null);
let files = [];
if (dir) {
  // Scan RÉCURSIF (les agents sont rangés en sous-dossiers : inhabitants/, buildings/, …).
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : (e.name.endsWith('.png') && !e.name.endsWith('.remap.png') ? [p] : []);
  });
  files = walk(dir);
}
else files = positional;
if (!files.length) { console.error('Aucun fichier. Usage : node scripts/remapPalette.mjs <fichier.png|--dir dossier> [options]'); process.exit(1); }

const res = files.map(remapFile);
const avgB = (res.reduce((s, r) => s + r.before, 0) / res.length).toFixed(0);
const avgA = (res.reduce((s, r) => s + r.after, 0) / res.length).toFixed(0);
console.log(`\n${res.length} fichier(s) · moyenne ${avgB} → ${avgA} teintes · plafond ${MAX}${DRY ? ' · DRY (rien écrit)' : ''}`);
