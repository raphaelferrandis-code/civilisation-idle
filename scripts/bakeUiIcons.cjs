// bakeUiIcons.cjs — cuit des icônes d'UI à leur TAILLE D'AFFICHAGE (24×24 par défaut).
//
// POURQUOI. Les icônes de public/pixelart/ui/nav/ étaient livrées en 42-60 px
// (générées en 64×64 par Pixflux — cf. scratch/generate-nav-icons.cjs — puis trimées
// à leur boîte englobante). Le CSS les affiche en 24 px avec `image-rendering:
// pixelated` (.px-icon, components.css) : le navigateur réduit au PLUS-PROCHE-VOISIN,
// sur un ratio non entier (46/24 = 1,92 ; 61/24 = 2,54). Résultat mesuré : ~16 % des
// pixels source atteignaient l'écran, et l'échantillonnage DÉRIVANT coupait les traits
// fins (le fléau de la balance de Régulation était pointillé, l'anneau du sceau ouvert).
// Symptôme vécu : « je retouche l'icône et le rendu ne change pas en jeu ».
// En livrant du 24×24 natif, le navigateur ne resample plus rien — 100 % des pixels
// livrés s'affichent, et l'icône redevient retouchable à la main à sa taille réelle.
//
// MÉTHODE (pensée pour le pixel art, pas pour la photo) :
//   1. boîte englobante des pixels opaques, mise à l'échelle `contain` vers la cible,
//      centrée sur un canevas carré — même cadrage que `object-fit: contain` en CSS ;
//   2. par pixel de sortie : moyenne de zone PONDÉRÉE PAR L'ALPHA du bloc source ;
//   3. alpha binarisé au seuil de couverture — le pixel art veut des bords francs,
//      pas une frange semi-transparente ;
//   4. couleur = celle DU BLOC la plus proche de sa moyenne en OKLab. On ne fabrique
//      donc jamais de teinte nouvelle : une moyenne brute ferait de la boue entre le
//      rouge du sceau et la crème du parchemin. OKLab = même distance perceptuelle
//      que scripts/remapPalette.mjs.
//
// Les originaux vivent dans <dossier>/_orig/ (convention du dépôt, cf. buildings/_orig).
// Contrairement à leurs voisins ils sont VERSIONNÉS : save.png a été repeint à la main
// et n'est reproductible par aucune génération.
//
// Lancer :
//   node scripts/bakeUiIcons.cjs public/pixelart/ui/nav/_orig public/pixelart/ui/nav
//   node scripts/bakeUiIcons.cjs <src> <out> [--size 24] [--alpha 0.5] [--dry]
//
//   --size   côté du canevas de sortie (défaut 24 = la taille CSS des icônes de nav)
//   --alpha  seuil de couverture pour qu'un pixel existe (défaut 0.5). Baisser
//            (0.4) épaissit et sauve les traits fins ; monter (0.6) affine et érode.
//   --force  autorise l'ÉCRASEMENT d'une icône déjà livrée (voir ci-dessous)
//   --dry    n'écrit rien, affiche seulement le tableau
//
// ⚠ GARDE-FOU. Les icônes livrées sont destinées à être REPRISES À LA MAIN à leur
// taille réelle — c'est tout l'intérêt de la cuisson. Une recuisson repartirait de
// _orig/ et effacerait ce travail sans prévenir. Le script REFUSE donc d'écraser un
// fichier existant : il liste ce qu'il a sauté et sort en code 1. `--force` lève le
// verrou, à n'utiliser que si tu veux réellement jeter les retouches manuelles.

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const [SRC_DIR, OUT_DIR] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const num = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SIZE = num('size', 24);
const ALPHA_T = num('alpha', 0.5);
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

if (!SRC_DIR || !OUT_DIR) {
  console.error('usage : node scripts/bakeUiIcons.cjs <dossier-source> <dossier-sortie> [--size 24] [--alpha 0.5] [--dry]');
  process.exit(2);
}

// ── OKLab (Björn Ottosson) — identique à scripts/remapPalette.mjs ──
const _lin = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; _lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function oklab(r, g, b) {
  const R = _lin[r], G = _lin[g], B = _lin[b];
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
          1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
          0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_];
}
const labD2 = (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; };

const at = (img, x, y) => { const i = (img.width * y + x) << 2; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };

function bbox(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (at(img, x, y)[3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? { x0: 0, y0: 0, w: img.width, h: img.height } : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function bake(img) {
  const bb = bbox(img);
  const s = Math.min(SIZE / bb.w, SIZE / bb.h);
  const dw = Math.max(1, Math.round(bb.w * s)), dh = Math.max(1, Math.round(bb.h * s));
  const ox = (SIZE - dw) >> 1, oy = (SIZE - dh) >> 1;

  const out = new PNG({ width: SIZE, height: SIZE });
  out.data.fill(0);

  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx0 = bb.x0 + Math.floor(x * bb.w / dw);
    const sx1 = bb.x0 + Math.max(Math.floor(x * bb.w / dw) + 1, Math.floor((x + 1) * bb.w / dw));
    const sy0 = bb.y0 + Math.floor(y * bb.h / dh);
    const sy1 = bb.y0 + Math.max(Math.floor(y * bb.h / dh) + 1, Math.floor((y + 1) * bb.h / dh));

    let wr = 0, wg = 0, wb = 0, wa = 0, n = 0;
    const bloc = [];
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
      const p = at(img, sx, sy);
      n++;
      if (p[3] > 8) { wr += p[0] * p[3]; wg += p[1] * p[3]; wb += p[2] * p[3]; wa += p[3]; bloc.push(p); }
    }
    if (!bloc.length || (n ? wa / (n * 255) : 0) < ALPHA_T) continue; // bord franc

    const moy = oklab(Math.round(wr / wa), Math.round(wg / wa), Math.round(wb / wa));
    let best = bloc[0], bd = Infinity;
    for (const p of bloc) { const d = labD2(oklab(p[0], p[1], p[2]), moy); if (d < bd) { bd = d; best = p; } }

    const i = (SIZE * (oy + y) + ox + x) << 2;
    out.data[i] = best[0]; out.data[i + 1] = best[1]; out.data[i + 2] = best[2]; out.data[i + 3] = 255;
  }
  return { out, dw, dh };
}

const teintes = (img) => {
  const s = new Set();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 8) s.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
  return s.size;
};

if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });
const files = fs.readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.png')).sort();
const sautees = [];
let ecrites = 0;
console.log(`fichier            source    contenu  teintes`);
for (const f of files) {
  const img = PNG.sync.read(fs.readFileSync(path.join(SRC_DIR, f)));
  const { out, dw, dh } = bake(img);
  const cible = path.join(OUT_DIR, f);
  // Garde-fou : ne jamais écraser une icône déjà livrée (elle a pu être reprise
  // à la main à sa taille réelle — cf. l'en-tête).
  const existe = fs.existsSync(cible);
  if (!DRY && existe && !FORCE) { sautees.push(f); }
  else if (!DRY) { fs.writeFileSync(cible, PNG.sync.write(out)); ecrites++; }
  console.log(`${f.padEnd(18)} ${String(img.width + 'x' + img.height).padEnd(8)} ${String(dw + 'x' + dh).padEnd(7)} ${String(teintes(img)).padStart(3)} -> ${teintes(out)}${!DRY && existe && !FORCE ? '   [SAUTÉ, existe déjà]' : ''}`);
}

if (DRY) {
  console.log(`\n${files.length} icônes analysées (--dry, rien écrit).`);
} else if (sautees.length) {
  console.error(`\n⚠ ${sautees.length} icône(s) NON écrites, la cible existe déjà : ${sautees.join(', ')}`);
  console.error(`  Elles ont pu être reprises à la main depuis la cuisson — les écraser détruirait ce travail.`);
  console.error(`  Relance avec --force si tu veux réellement repartir de ${SRC_DIR}.`);
  process.exit(1);
} else {
  console.log(`\n${ecrites} icônes cuites en ${SIZE}×${SIZE} -> ${OUT_DIR}`);
}
