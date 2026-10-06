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
// L'algorithme vit dans scripts/lib/iconBake.cjs, partagé avec bakeUiIconSizes.cjs.
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
const { bakeIcon } = require('./lib/iconBake.cjs');

// Les options À VALEUR consomment l'argument suivant (même correctif que
// bakeUiIconSizes.cjs) : sans ça, `--size 32 <src> <out>` prenait « 32 » pour le
// dossier source.
const VALUED = new Set(['--size', '--alpha']);
const ARGS = process.argv.slice(2);
const [SRC_DIR, OUT_DIR] = ARGS.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(ARGS[i - 1])));
const num = (n, d) => { const i = ARGS.indexOf('--' + n); return i >= 0 ? Number(ARGS[i + 1]) : d; };
const SIZE = num('size', 24);
const ALPHA_T = num('alpha', 0.5);
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

if (!SRC_DIR || !OUT_DIR) {
  console.error('usage : node scripts/bakeUiIcons.cjs <dossier-source> <dossier-sortie> [--size 24] [--alpha 0.5] [--dry]');
  process.exit(2);
}

const bake = (img) => bakeIcon(img, SIZE, ALPHA_T);

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
