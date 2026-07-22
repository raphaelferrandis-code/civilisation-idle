// bakeUiIconSizes.cjs — décline chaque icône d'UI en variantes NATIVES `<nom>@<taille>.png`.
//
// POURQUOI, ET EN QUOI C'EST DIFFÉRENT DE bakeUiIcons.cjs.
// bakeUiIcons.cjs REMPLACE une icône par sa version à la taille d'écran. Ça marchait pour
// public/pixelart/ui/nav/ parce que ces 10 icônes ont UN seul point d'usage à UNE seule
// taille. Partout ailleurs c'est faux : un même fichier sert plusieurs tailles fixes
// (glyphs/ruines sort en tuile de stats ET en .harvest-glyph), et surtout il sert aussi
// des consommateurs À L'ÉCHELLE qui ont besoin de la pleine résolution :
//   - src/game/map/agents.js peint res/*.png sur le canvas de la carte ;
//   - src/components/ui/scratchSymbols.js compose les tickets en 512×512 ;
//   - .rt-emblem (ruinsTree.css) dimensionne les emblèmes en POURCENTAGE du nœud.
// Réduire le fichier maître casserait ces trois-là. On travaille donc en ADDITIF :
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

// ── OKLab (Björn Ottosson) — identique à bakeUiIcons.cjs et remapPalette.mjs ──
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

// Même algorithme que bakeUiIcons.cjs : bbox -> `contain` -> moyenne de zone pondérée
// par l'alpha -> alpha binarisé (bords francs) -> couleur = celle DU BLOC la plus proche
// de sa moyenne en OKLab, pour n'inventer aucune teinte.
function bake(img, SIZE) {
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
    if (!bloc.length || (n ? wa / (n * 255) : 0) < ALPHA_T) continue;

    const moy = oklab(Math.round(wr / wa), Math.round(wg / wa), Math.round(wb / wa));
    let best = bloc[0], bd = Infinity;
    for (const p of bloc) { const d = labD2(oklab(p[0], p[1], p[2]), moy); if (d < bd) { bd = d; best = p; } }
    const i = (SIZE * (oy + y) + ox + x) << 2;
    out.data[i] = best[0]; out.data[i + 1] = best[1]; out.data[i + 2] = best[2]; out.data[i + 3] = 255;
  }
  return out;
}

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
