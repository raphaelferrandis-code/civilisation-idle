// bakeHalfBands.mjs — LA CUISSON DU LOT G1 (docs/PLAN-GRILLE-PIXELS.md).
//
// Déplace la réduction du RENDU vers la FABRICATION : au lieu de jeter 60 à 85 %
// des lignes d'une planche à CHAQUE image (blit `imageSmoothingEnabled = false`,
// donc plus proche voisin, avec une coupe qui se déplace quand le sprite marche),
// on cuit UNE fois la bande à la taille où elle est dessinée — vrai
// rééchantillonnage par moyenne d'aire, puis rabattage sur la palette d'origine.
//
// Le rendu n'a RIEN à apprendre : `ensureAgentDiag` charge déjà
// `{nom}-{dir}-half.png` s'il existe, et `drawNamedAgentIso` bascule dessus dès
// que `drawH ≤ fh × 0,7` (posé pour les habitants le 2026-08-03). Ce script ne
// fait que fournir le fichier.
//
//   node scripts/bakeHalfBands.mjs <dossier> <préfixe> [options]
//   node scripts/bakeHalfBands.mjs events rioter- --div=4
//
// Options :
//   --div=N      diviseur de cuisson (défaut 2). ⚠ ENTIER, et il doit diviser la
//                taille de frame — cf. la leçon du panel habitants ci-dessous.
//   --alpha=N    seuil d'opacité du pixel cuit, 0-255 (défaut 128 = 50 %).
//   --dirs=…     diag (défaut) | cardinal | all.
//   --scale=F    hauteur de rendu en tuiles du consommateur (ex. 0.85 pour un
//                émeutier) : sert au RAPPORT de densité, pas à la cuisson.
//   --dry        ne rien écrire, tout mesurer.
//
// ⚠⚠ LE DIVISEUR DOIT ÊTRE ENTIER. Le panel de la refonte des habitants avait
// tranché : « le ratio non-entier re-bruite même un 24 px ». Une cuisson ÷4 d'une
// planche de 92 donne 23 px pile ; viser une taille cible commune (23 pour tout
// le monde) rouvrirait des ratios de 3,83 et rendrait le bruit qu'on chasse.
//
// ⚠⚠ LE SEUIL D'ALPHA EST LE VRAI RÉGLAGE, PAS LE DIVISEUR. À ÷4 un pixel cuit
// moyenne SEIZE pixels source : un manche de fourche de 2 px de large n'en couvre
// que la moitié d'un, donc son alpha moyen tombe à ~64 et le seuil de 50 % le
// SUPPRIME. Le rapport imprime la perte d'encre par bande ; au-delà de quelques
// pour cent, c'est un membre ou une arme qui est parti, pas de l'antialiasing.
//
// ⚠ Ce script n'écrase JAMAIS une bande source : il n'écrit que des `-half.png`.
// Effacer les `-half` suffit à revenir en arrière — le rendu retombe seul sur la
// bande pleine.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIAG = ['southeast', 'southwest', 'northeast', 'northwest'];
const CARD = ['south', 'east', 'north', 'west'];

const args = process.argv.slice(2);
const opt = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const FOLDER = args.find((a) => !a.startsWith('--'));
const PREFIX = args.filter((a) => !a.startsWith('--'))[1] || '';
const DIV = parseInt(opt('div', '2'), 10);
const ALPHA = parseInt(opt('alpha', '128'), 10);
const SCALE = parseFloat(opt('scale', '0'));
const DRY = args.includes('--dry');
const DIRS = { diag: DIAG, cardinal: CARD, all: [...DIAG, ...CARD] }[opt('dirs', 'diag')];
// Couleurs À PRÉSERVER coûte que coûte (fichier de rampe {steps:[{hex}]}) : voir
// « LES BRAISES GAGNENT » dans bake(). `--hotShare` = part du bloc au-delà de
// laquelle une couleur chaude l'emporte sur la majorité.
const HOTFILE = opt('hot', '');
const HOTSHARE = parseFloat(opt('hotShare', '0.12'));

if (!FOLDER || !DIRS || !(DIV >= 2)) {
  console.error('usage: node scripts/bakeHalfBands.mjs <dossier> <préfixe> [--div=N] [--alpha=N] [--dirs=diag|cardinal|all] [--scale=F] [--dry]');
  process.exit(1);
}

const ROOT = path.join('public/pixelart/agents', FOLDER);
const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
const setPx = (img, x, y, [r, g, b, a]) => { const i = (y * img.width + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a; };

// Palette d'ARRIVÉE = les couleurs pleines de la source.
function paletteOf(img) {
  const seen = new Map();
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    const [r, g, b, a] = px(img, x, y);
    if (a > 128) seen.set((r << 16) | (g << 8) | b, [r, g, b]);
  }
  return [...seen.values()];
}

// DÉRIVE DE LUMINANCE, pondérée par l'alpha. ⚠ Cette mesure existe parce qu'une
// règle de couleur peut NOIRCIR tout un lot sans qu'aucune autre métrique ne
// bouge : l'essai « plurialité » gardait l'aire, la ligne de pieds et la torche
// au chiffre près, et rendait des silhouettes noires — le contour l'emportait
// partout. Ça s'est vu sur planche-contact et NULLE PART ailleurs. Depuis, ça se
// mesure : au-delà de ~8 %, la cuisson a changé la valeur de l'art, pas sa taille.
function lumDrift(src, out) {
  const lum = (img) => {
    let s = 0, w = 0;
    for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
      const [r, g, b, a] = px(img, x, y);
      if (a <= 16) continue;
      s += (0.2126 * r + 0.7152 * g + 0.0722 * b) * a; w += a;
    }
    return w ? s / w : 0;
  };
  const a = lum(src);
  return a > 0 ? lum(out) / a - 1 : 0;
}

// Jeu de couleurs à préserver, lu d'un fichier de rampe (public/pixelart/fire-ramp.json).
function hotSet(file) {
  if (!file) return null;
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const s = new Set();
  for (const st of j.steps || []) {
    const m = /^#?([0-9a-f]{6})$/i.exec(st.hex || '');
    if (m) s.add(parseInt(m[1], 16));
  }
  return s.size ? s : null;
}

// Ligne de PIEDS, exactement comme `agentFootF` la mesure en jeu (dernière rangée
// d'alpha > 16, sur TOUTE la bande) : c'est elle qui pose l'émeutier sur son
// ombre. Si la cuisson la déplace, le personnage décolle du sol — donc on la
// compare avant/après et on le dit.
function footF(img) {
  for (let y = img.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < img.width; x += 1) if (px(img, x, y)[3] > 16) return (y + 1) / img.height;
  }
  return 1;
}
// AIRE D'ENCRE CONSERVÉE, signée. ⚠ Premier jet FAUX, à ne pas refaire : il
// comparait le NOMBRE de pixels d'alpha > 16 avant et après, en valeur absolue.
// Deux erreurs dans une seule ligne — (1) la source a un liseré antialiasé qui
// compte comme de l'encre alors qu'il ne doit PAS survivre à une sortie binaire,
// (2) la valeur absolue confond « la fourche a disparu » et « la silhouette a
// grossi ». Le rapport disait alors qu'un seuil PLUS BAS perdait PLUS d'encre,
// ce qui est impossible.
// La bonne référence est l'AIRE : Σalpha/255 sur la source, ramenée à l'échelle
// de sortie, c'est le nombre de pixels pleins qu'une réduction fidèle doit
// produire. L'écart signé dit alors ce qu'on veut savoir :
//   négatif → la cuisson AMAIGRIT (un manche, une arme, un bras a sauté) ;
//   positif → elle ÉPAISSIT (la silhouette enfle, elle bave).
function airRatio(src, out, div) {
  let area = 0;
  for (let y = 0; y < src.height; y += 1) for (let x = 0; x < src.width; x += 1) area += px(src, x, y)[3] / 255;
  const attendu = area / (div * div);
  let got = 0;
  for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) if (px(out, x, y)[3] > 16) got += 1;
  return attendu > 0 ? got / attendu - 1 : 0;
}

// LA RÈGLE DE COULEUR — deux essais ratés avant celle-ci, les deux instructifs.
//
// ① MOYENNE prémultipliée du bloc, puis rabattage sur la palette (la recette du
//    ÷2 des habitants). Elle tient le TON du corps, mais elle ne survit pas au
//    ÷4 sur un détail minuscule : un bloc de seize pixels contenant trois pixels
//    de flamme rend une moyenne brun-orangé dont le plus proche voisin est un
//    brun de vêtement — la torche s'éteint. Mesuré : médiane de 153 px de rampe
//    de feu tombée à 4, et ZÉRO sur certaines bandes. C'est la garde
//    `flameHue.test.js` qui l'a vu, pas l'œil.
// ② PLURALITÉ (la couleur qui occupe le plus d'aire l'emporte). Elle rallume la
//    torche et n'invente aucune teinte… mais cet art a un CONTOUR NOIR ÉPAIS, et
//    à ÷4 c'est le contour qui gagne la majorité presque partout : les corps
//    virent au blob noir. Vu sur planche-contact, invisible dans les chiffres —
//    d'où la mesure de dérive de LUMINANCE ajoutée depuis.
//
// ③ Ce qui marche : la MOYENNE pour la masse, et une PRIORITÉ AUX BRAISES pour
//    ce qui doit survivre à tout prix. Une flamme de torche ne fait que quelques
//    pixels dans la planche et un seul une fois cuite, mais c'est elle qui dit
//    « émeute » d'un coup d'œil : si une couleur chaude occupe ne serait-ce
//    qu'une petite part du bloc (`--hotShare`), elle l'emporte sur la moyenne.
function bake(src, hot) {
  const pal = paletteOf(src);
  const w = Math.floor(src.width / DIV), h = Math.floor(src.height / DIV);
  const out = new PNG({ width: w, height: h });
  const n2 = DIV * DIV;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let r = 0, g = 0, b = 0, a = 0, hotW = 0, hotK = -1, hotBest = -1;
    for (let dy = 0; dy < DIV; dy += 1) for (let dx = 0; dx < DIV; dx += 1) {
      const [pr, pg, pb, pa] = px(src, x * DIV + dx, y * DIV + dy);
      r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
      if (hot && pa > 16) {
        const k = (pr << 16) | (pg << 8) | pb;
        if (hot.has(k)) { hotW += pa; if (pa > hotBest) { hotBest = pa; hotK = k; } }
      }
    }
    if (a / n2 < ALPHA) { setPx(out, x, y, [0, 0, 0, 0]); continue; }
    let best;
    if (hotK >= 0 && hotW >= HOTSHARE * a) {
      best = [(hotK >> 16) & 255, (hotK >> 8) & 255, hotK & 255];
    } else {
      // Moyenne PRÉMULTIPLIÉE : sans pondérer par l'alpha, les pixels
      // transparents du bord tirent la couleur vers le noir et le sprite se
      // cerne d'un liseré. Rabattue sur la palette de la source pour ne pas
      // inventer de teinte intermédiaire (même discipline que quantize.cjs).
      const m = [r / a, g / a, b / a];
      let bd = Infinity;
      best = pal[0];
      for (const c of pal) {
        const dd = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2;
        if (dd < bd) { bd = dd; best = c; }
      }
    }
    // Alpha BINAIRE : le blit est en plus-proche-voisin, un bord semi-opaque n'y
    // gagne rien et salit la silhouette au petit zoom.
    setPx(out, x, y, [best[0], best[1], best[2], 255]);
  }
  return out;
}

const HOT = hotSet(HOTFILE);
const files = fs.readdirSync(ROOT)
  .filter((f) => f.startsWith(PREFIX) && f.endsWith('.png') && !f.endsWith('-half.png'))
  .filter((f) => DIRS.some((d) => f.endsWith(`-${d}.png`)))
  .sort();

if (!files.length) { console.error(`aucune bande ${PREFIX}*-{${DIRS.join('|')}}.png dans ${ROOT}`); process.exit(1); }

let nOk = 0, nSkip = 0, worstFoot = 0;
const airs = [], lums = [], dens = [];
for (const f of files) {
  const src = PNG.sync.read(fs.readFileSync(path.join(ROOT, f)));
  const fh = src.height;
  if (fh % DIV || src.width % DIV) {
    console.log(`  ⨯ ${f} — ${src.width}×${fh} non divisible par ${DIV} (sautée : un reste rognerait la dernière frame)`);
    nSkip += 1;
    continue;
  }
  const out = bake(src, HOT);
  const df = Math.abs(footF(out) - footF(src));
  const air = airRatio(src, out, DIV);
  const lum = lumDrift(src, out);
  lums.push(lum);
  worstFoot = Math.max(worstFoot, df);
  airs.push({ f, air });
  if (SCALE > 0) dens.push((32 * SCALE * 0.5) / out.height);   // CM.TILE × scale × AGENT_SCALE
  if (!DRY) fs.writeFileSync(path.join(ROOT, f.replace('.png', '-half.png')), PNG.sync.write(out));
  nOk += 1;
  if (nOk <= 2 || Math.abs(air) > 0.12) {
    console.log(`  ${f}  ${src.width}×${fh} → ${out.width}×${out.height}   pieds ${(footF(src) * 100).toFixed(1)}% → ${(footF(out) * 100).toFixed(1)}%   aire ${air >= 0 ? '+' : ''}${(air * 100).toFixed(1)}%${Math.abs(air) > 0.12 ? '  ⚠' : ''}`);
  }
}
const av = airs.map((a) => a.air);
const moy = av.reduce((s, v) => s + v, 0) / (av.length || 1);
const pire = airs.slice().sort((a, b) => Math.abs(b.air) - Math.abs(a.air))[0];
console.log(`\n${DRY ? '[à blanc] ' : ''}${nOk} bandes cuites ÷${DIV} (seuil alpha ${ALPHA})${nSkip ? `, ${nSkip} sautées` : ''}`);
console.log(`  dérive max de la ligne de pieds : ${(worstFoot * 100).toFixed(2)} pt  (au-delà de ~2 pt le sprite décolle de son ombre)`);
console.log(`  aire d'encre conservée : moyenne ${moy >= 0 ? '+' : ''}${(moy * 100).toFixed(1)} %, étendue ${(Math.min(...av) * 100).toFixed(1)} % … ${(Math.max(...av) * 100).toFixed(1)} %`);
console.log(`  (négatif = ça AMAIGRIT, positif = ça ÉPAISSIT ; viser une moyenne proche de 0)`);
console.log(`  dérive de luminance : moyenne ${(lums.reduce((s2,v)=>s2+v,0)/(lums.length||1)*100).toFixed(1)} %, pire ${(lums.slice().sort((a2,b2)=>Math.abs(b2)-Math.abs(a2))[0]*100).toFixed(1)} %  (au-delà de ~8 % la cuisson a changé la VALEUR de l'art)`);
if (pire) console.log(`  pire bande : ${pire.f}  ${pire.air >= 0 ? '+' : ''}${(pire.air * 100).toFixed(1)} %`);
if (dens.length) {
  console.log(`  densité obtenue @z=1 (scale ${SCALE}) : ${Math.min(...dens).toFixed(3)}–${Math.max(...dens).toFixed(3)}  → zoom en grille ${(1 / Math.max(...dens)).toFixed(2)}–${(1 / Math.min(...dens)).toFixed(2)}`);
}
