// bakeUiIconSizes.cjs — décline chaque icône d'UI en variantes NATIVES `<nom>@<taille>.png`.
//
// POURQUOI, ET EN QUOI C'EST DIFFÉRENT DE bakeUiIcons.cjs.
// bakeUiIcons.cjs REMPLACE une icône par sa version à la taille d'écran. Ça marchait pour
// public/pixelart/ui/nav/ parce que ces 10 icônes ont UN seul point d'usage à UNE seule
// taille. Partout ailleurs c'est faux : un même fichier sert plusieurs tailles fixes
// (glyphs/ruines sort en tuile de stats ET en .harvest-glyph), et surtout il sert aussi
// des consommateurs À L'ÉCHELLE qui ont besoin de la pleine résolution :
//   - src/game/map/agents.js peint res/*.png sur le canvas de la carte ;
//   - src/components/ui/scratchSymbols.js compose les tickets en 512×512.
// (L'arbre des Ruines, troisième consommateur à l'origine, lit aujourd'hui l'atlas
// cuit par scripts/bakeRuinsEmblems.mjs ; ses maîtres sont rangés dans
// art/emblemes-ruines/ — audit 2026-10-05, ASSET-3.)
// Réduire le fichier maître casserait ces consommateurs-là. On travaille donc en ADDITIF :
// le 64×64 reste la source de vérité, les variantes se posent à côté.
//
// L'ÉCHELLE est 16/24/32/48 (cf. l'en-tête de .px-icon dans components.css). PixelIcon.jsx
// choisit la variante d'après sa classe et retombe sur le maître si elle n'existe pas.
//
// Lancer :
//   node scripts/bakeUiIconSizes.cjs public/pixelart/ui/res public/pixelart/ui/glyphs ...
//   node scripts/bakeUiIconSizes.cjs <dossiers...> [--sizes 16,24,32,48] [--dry]
//
// Contrairement à bakeUiIcons.cjs, ce script ÉCRASE ses sorties sans demander : une
// variante est un pur dérivé, régénérable à l'identique. Ne jamais retoucher une
// `@<taille>.png` à la main — retoucher le maître, puis relancer.

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { bakeIcon } = require('./lib/iconBake.cjs');

// Les options À VALEUR consomment l'argument suivant : sans ça `--sizes 16,32` laissait
// « 16,32 » dans la liste des dossiers, et le script partait chercher un dossier de ce nom.
const VALUED = new Set(['--sizes', '--alpha']);
const ARGS = process.argv.slice(2);
const DIRS = ARGS.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(ARGS[i - 1])));
const argOf = (n, d) => { const i = ARGS.indexOf('--' + n); return i >= 0 ? ARGS[i + 1] : d; };
const SIZES = argOf('sizes', '16,24,32,48').split(',').map(Number);
const DRY = process.argv.includes('--dry');
const ALPHA_T = Number(argOf('alpha', 0.5));

if (!DIRS.length) {
  console.error('usage : node scripts/bakeUiIconSizes.cjs <dossiers...> [--sizes 16,24,32,48] [--dry]');
  process.exit(2);
}

// Même algorithme que bakeUiIcons.cjs, en commun dans scripts/lib/iconBake.cjs : bbox ->
// `contain` -> moyenne de zone pondérée par l'alpha -> alpha binarisé (bords francs) ->
// couleur = celle DU BLOC la plus proche de sa moyenne en OKLab, pour n'inventer aucune teinte.
const bake = (img, SIZE) => bakeIcon(img, SIZE, ALPHA_T).out;

let ecrites = 0, copiees = 0, ignorees = 0;
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) { console.error('dossier absent : ' + dir); process.exit(2); }
  const files = fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png') && !/@\d+\.png$/i.test(f))
    .sort();
  console.log('\n=== ' + dir + '  (' + files.length + ' maitres)');
  for (const f of files) {
    const img = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
    const stem = f.replace(/\.png$/i, '');
    const src = Math.min(img.width, img.height);
    const faits = [];
    for (const S of SIZES) {
      const cible = path.join(dir, stem + '@' + S + '.png');
      // JAMAIS d'agrandissement : un maître plus petit que la cible n'a pas les pixels,
      // l'agrandir fabriquerait des traits d'épaisseur inégale (16->24 = 1,5). Dans ce
      // cas on n'écrit rien et PixelIcon retombe sur le maître.
      if (S > src) { ignorees++; continue; }
      if (S === src && img.width === img.height) {
        if (!DRY) fs.copyFileSync(path.join(dir, f), cible);
        copiees++; faits.push(S + '=');
        continue;
      }
      if (!DRY) fs.writeFileSync(cible, PNG.sync.write(bake(img, S)));
      ecrites++; faits.push(String(S));
    }
    console.log('  ' + stem.padEnd(30) + String(img.width + 'x' + img.height).padStart(7) + '  ->  ' + (faits.join(' ') || '(aucune)'));
  }
}
console.log('\n' + ecrites + ' variantes cuites, ' + copiees + ' copiees telles quelles (maitre deja a la taille), '
  + ignorees + ' ignorees (agrandissement refuse)' + (DRY ? '   [--dry, rien ecrit]' : ''));
