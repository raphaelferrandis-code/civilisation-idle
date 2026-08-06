// INSTRUMENT DE VALEUR (lot S0, docs/PLAN-RENDU-VILLE.md).
//
// Le grief de Raph — « très brouillon et pas net » — est intégralement un grief de
// VALEUR : le pan de toit du stonehouse mesure L 129,4, le pavé qu'il occupe L 121,9,
// soit 7,5 points d'écart quand la chaussée en a 29. Sans instrument, ce genre de
// constat se juge à l'œil et on se raconte des histoires (leçon du lot « Comprendre
// ses chiffres » : une garde qui ne mesure pas l'objet réel est décorative).
//
// Or au 2026-08-05 AUCUN des 82 scripts du dossier ne comparait deux images, et
// AUCUNE des 70 suites de tests ne regardait une frame rendue. D'où ce fichier.
//
//   node scripts/frameStats.mjs <a.png> [b.png] [--crop x,y,w,h] [--bins 16]
//
// Un seul fichier      → l'anatomie de l'image.
// Deux fichiers        → l'anatomie des deux, plus le diff (le protocole A/B du
//                        chantier : même cadrage, citizens:'none', cf. §7 de
//                        PERF-CARTE-REPRISE.md).
//
// CE QU'IL RÉPOND, ET POURQUOI CHAQUE CHIFFRE EST LÀ :
//
// · AMPLITUDE (p2..p98). Le premier réflexe devant cette capture est de dire
//   « l'image est plate ». C'est FAUX et la mesure le dit : l'herbe rendue vaut ~71
//   et le trottoir ~158, soit 87 points. Le contraste existe, il est dépensé au
//   mauvais endroit. Ce chiffre est là pour empêcher qu'on « ajoute du contraste »
//   quand il faut le DÉPLACER.
//
// · MODES. Une image qui lit a deux masses séparées (le fond, le bâti) donc deux
//   bosses ; une image brouillonne a un pic unique de valeur moyenne. C'est LE
//   témoin de la maladie « composition », et la cible du chantier.
//
// · GRAIN (écart-type local en fenêtre 8×8). La maladie « netteté ». La tuile de
//   pavé porte 18,4 L d'écart entre pixels VOISINS, 4 à 6× toutes les autres
//   matières de sol. Mesuré en fenêtre plutôt qu'entre voisins immédiats parce
//   qu'à l'écran c'est la TEXTURE qui fatigue l'œil, pas le pas de deux pixels.
//
// · GRAIN PAR DÉCILE DE VALEUR. Le seul chiffre qui dit OÙ le bruit vit. Un grain
//   concentré dans les déciles moyens = c'est le sol qui grésille ; concentré dans
//   les déciles hauts = c'est le trottoir ou les hautes lumières.
//
// ⚠ Ce script mesure une IMAGE, pas le jeu. Les tons lus sur les PNG d'assets ne
//   valent pas les tons à l'écran : les habitations passent par l'échange de teintes
//   (housePalette), la couche de lumière et le LOD. Toute conclusion sur le couple
//   bâti/sol doit se prendre sur une CAPTURE, pas sur les fichiers sources.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

// ⚠ fileURLToPath, PAS new URL(...).pathname : sur un chemin de projet contenant un
// espace, le second rend « Civilisation%20idle » et les écritures partent dans un
// répertoire fantôme. Piège déjà payé sur buildPalette/remapPalette (2026-07-02).
const HERE = path.dirname(fileURLToPath(import.meta.url));

const NOISE = 2;        // /255 — plancher de bruit du rendu, cf. PERF-CARTE-REPRISE §4
const PERCEPT = 8;      // /255 — seuil au-dessus duquel un écart se voit
const WIN = 8;          // fenêtre du grain local

// Rec.709 : c'est la luminance utilisée par les mesures du diagnostic, la garder
// pour que les chiffres de ce script se comparent à ceux du plan.
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function parseArgs(argv) {
  const files = [];
  const opt = { bins: 16, crop: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--crop') {
      const v = (argv[i += 1] || '').split(',').map(Number);
      if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) throw new Error('--crop attend x,y,w,h');
      opt.crop = v;
    } else if (a === '--bins') {
      opt.bins = Math.max(4, Math.min(64, Number(argv[i += 1]) | 0));
    } else if (a.startsWith('--')) {
      throw new Error(`option inconnue : ${a}`);
    } else files.push(a);
  }
  if (!files.length) throw new Error('usage : node scripts/frameStats.mjs <a.png> [b.png] [--crop x,y,w,h] [--bins N]');
  return { files, opt };
}

// Charge un PNG et rend { w, h, lum: Float32Array, rgb: Uint8Array, opaque: n }.
// Les pixels transparents sont EXCLUS des statistiques (une capture de canvas peut
// en porter sur ses bords) mais gardent leur place dans la grille, pour que la
// fenêtre de grain reste alignée sur les pixels d'écran.
function load(file, crop) {
  const p = PNG.sync.read(fs.readFileSync(file));
  let [cx, cy, cw, ch] = crop || [0, 0, p.width, p.height];
  cx = Math.max(0, Math.min(p.width - 1, cx | 0));
  cy = Math.max(0, Math.min(p.height - 1, cy | 0));
  cw = Math.max(1, Math.min(p.width - cx, cw | 0));
  ch = Math.max(1, Math.min(p.height - cy, ch | 0));
  const L = new Float32Array(cw * ch);
  const A = new Uint8Array(cw * ch);
  const rgb = new Uint8Array(cw * ch * 3);
  let opaque = 0;
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const s = ((y + cy) * p.width + (x + cx)) * 4;
      const d = y * cw + x;
      const on = p.data[s + 3] >= 128;
      A[d] = on ? 1 : 0;
      if (on) opaque += 1;
      rgb[d * 3] = p.data[s]; rgb[d * 3 + 1] = p.data[s + 1]; rgb[d * 3 + 2] = p.data[s + 2];
      L[d] = on ? lum(p.data[s], p.data[s + 1], p.data[s + 2]) : NaN;
    }
  }
  return { file, w: cw, h: ch, L, A, rgb, opaque, full: [p.width, p.height] };
}

const pct = (sorted, q) => {
  if (!sorted.length) return NaN;
  const i = Math.max(0, Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1))));
  return sorted[i];
};

// Écart-type de luminance dans des fenêtres 8×8 NON CHEVAUCHANTES. Non chevauchantes
// parce qu'on veut une distribution de tuiles indépendantes, pas un champ lissé :
// c'est la médiane et le p90 de CETTE distribution qui disent si le bruit est partout
// ou concentré. Une fenêtre à moins de la moitié de pixels opaques est ignorée.
function grain(img) {
  const out = [];
  const byDecile = Array.from({ length: 10 }, () => ({ sum: 0, n: 0 }));
  for (let by = 0; by + WIN <= img.h; by += WIN) {
    for (let bx = 0; bx + WIN <= img.w; bx += WIN) {
      let s = 0, s2 = 0, n = 0;
      for (let y = 0; y < WIN; y += 1) {
        for (let x = 0; x < WIN; x += 1) {
          const d = (by + y) * img.w + (bx + x);
          if (!img.A[d]) continue;
          s += img.L[d]; s2 += img.L[d] * img.L[d]; n += 1;
        }
      }
      if (n < (WIN * WIN) / 2) continue;
      const mean = s / n;
      const sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
      out.push(sd);
      const dec = Math.max(0, Math.min(9, Math.floor((mean / 255) * 10)));
      byDecile[dec].sum += sd; byDecile[dec].n += 1;
    }
  }
  out.sort((a, b) => a - b);
  return { sd: out, byDecile };
}

// Détection de modes sur l'histogramme 256, lissé par moyenne glissante. Un mode est
// retenu s'il domine son voisinage ET s'il pèse au moins `minShare` de la surface :
// sans ce second critère, le moindre ressaut de quantification devient un « mode ».
function modes(hist, total, { span = 9, minShare = 0.02 } = {}) {
  const sm = new Float64Array(256);
  for (let i = 0; i < 256; i += 1) {
    let s = 0, n = 0;
    for (let k = -span; k <= span; k += 1) {
      const j = i + k;
      if (j < 0 || j > 255) continue;
      s += hist[j]; n += 1;
    }
    sm[i] = s / n;
  }
  const peaks = [];
  for (let i = 1; i < 255; i += 1) {
    if (sm[i] <= sm[i - 1] || sm[i] < sm[i + 1]) continue;
    // Proéminence : hauteur au-dessus du creux le plus haut de part et d'autre.
    let lo = sm[i], hi = sm[i];
    for (let j = i - 1; j >= 0 && sm[j] <= sm[j + 1]; j -= 1) lo = Math.min(lo, sm[j]);
    for (let j = i + 1; j <= 255 && sm[j] <= sm[j - 1]; j += 1) hi = Math.min(hi, sm[j]);
    const prom = sm[i] - Math.max(lo, hi);
    let mass = 0;
    for (let j = Math.max(0, i - span); j <= Math.min(255, i + span); j += 1) mass += hist[j];
    if (prom > sm[i] * 0.15 && mass / total >= minShare) peaks.push({ at: i, share: mass / total, prom });
  }
  peaks.sort((a, b) => b.share - a.share);
  return peaks;
}

function stats(img, bins) {
  const vals = [];
  const hist = new Float64Array(256);
  for (let i = 0; i < img.L.length; i += 1) {
    if (!img.A[i]) continue;
    vals.push(img.L[i]);
    hist[Math.max(0, Math.min(255, Math.round(img.L[i])))] += 1;
  }
  vals.sort((a, b) => a - b);
  const g = grain(img);
  return {
    n: vals.length,
    p2: pct(vals, 0.02), p50: pct(vals, 0.5), p98: pct(vals, 0.98),
    mean: vals.reduce((a, b) => a + b, 0) / (vals.length || 1),
    hist, bins,
    modes: modes(hist, vals.length),
    grainMean: g.sd.reduce((a, b) => a + b, 0) / (g.sd.length || 1),
    grainMed: pct(g.sd, 0.5), grainP90: pct(g.sd, 0.9), grainN: g.sd.length,
    byDecile: g.byDecile,
  };
}

const bar = (v, max, w = 40) => '#'.repeat(Math.round((v / (max || 1)) * w));

function report(img, s) {
  const rel = path.relative(process.cwd(), img.file) || img.file;
  console.log(`\n=== ${rel}  ${img.w}x${img.h}${img.w !== img.full[0] || img.h !== img.full[1] ? ` (crop de ${img.full[0]}x${img.full[1]})` : ''}`);
  console.log(`    pixels opaques ${s.n}  (${((s.n / (img.w * img.h)) * 100).toFixed(1)} %)`);
  console.log(`    luminance : p2 ${s.p2.toFixed(1)}  mediane ${s.p50.toFixed(1)}  p98 ${s.p98.toFixed(1)}  moyenne ${s.mean.toFixed(1)}`);
  console.log(`    AMPLITUDE p2..p98 : ${(s.p98 - s.p2).toFixed(1)} points`);

  const B = s.bins, step = 256 / B;
  const buck = new Float64Array(B);
  for (let i = 0; i < 256; i += 1) buck[Math.min(B - 1, Math.floor(i / step))] += s.hist[i];
  const max = Math.max(...buck);
  console.log('    histogramme de luminance (part de surface) :');
  for (let b = 0; b < B; b += 1) {
    const lo = Math.round(b * step), hi = Math.round((b + 1) * step) - 1;
    const share = (buck[b] / s.n) * 100;
    console.log(`      ${String(lo).padStart(3)}-${String(hi).padStart(3)} ${share.toFixed(1).padStart(5)} % ${bar(buck[b], max)}`);
  }

  console.log(`    MODES : ${s.modes.length}`);
  for (const m of s.modes) console.log(`      L ${String(m.at).padStart(3)}  ${(m.share * 100).toFixed(1)} % de la surface`);
  if (s.modes.length <= 1) {
    console.log('      -> pic UNIQUE : le bati ne se detache pas de son sol (maladie "brouillon").');
  } else {
    const d = Math.abs(s.modes[0].at - s.modes[1].at);
    console.log(`      -> ecart entre les deux modes dominants : ${d} points de luminance.`);
  }

  console.log(`    GRAIN local (ecart-type en fenetre ${WIN}x${WIN}, ${s.grainN} fenetres) :`);
  console.log(`      moyenne ${s.grainMean.toFixed(1)}   mediane ${s.grainMed.toFixed(1)}   p90 ${s.grainP90.toFixed(1)}`);
  console.log('    grain par decile de valeur (ou vit le bruit) :');
  const gmax = Math.max(...s.byDecile.map((d) => (d.n ? d.sum / d.n : 0)));
  s.byDecile.forEach((d, i) => {
    if (!d.n) return;
    const v = d.sum / d.n;
    console.log(`      L ${String(i * 26).padStart(3)}-${String((i + 1) * 26 - 1).padStart(3)}  sd ${v.toFixed(1).padStart(5)}  (${d.n} fen.) ${bar(v, gmax, 28)}`);
  });
}

// DIFF. Le protocole du projet compte les pixels qui diffèrent et donne le pire
// écart ; il distingue le plancher de bruit du rendu (2/255) du seuil perceptible
// (8/255). ⚠ Deux captures ne se comparent QUE si la caméra a été réépinglée à
// chaque image et si le cliché passe citizens:'none' — sinon on mesure le bateau
// qui a bougé (piège n°4 de PERF-CARTE-REPRISE §7).
function diff(a, b) {
  if (a.w !== b.w || a.h !== b.h) {
    console.log(`\n!! tailles differentes (${a.w}x${a.h} vs ${b.w}x${b.h}) : diff impossible.`);
    return;
  }
  let n = 0, noisy = 0, percept = 0, worst = 0, sum = 0;
  for (let i = 0; i < a.L.length; i += 1) {
    if (!a.A[i] && !b.A[i]) continue;
    n += 1;
    let d = 0;
    for (let c = 0; c < 3; c += 1) d = Math.max(d, Math.abs(a.rgb[i * 3 + c] - b.rgb[i * 3 + c]));
    if (d > worst) worst = d;
    sum += d;
    if (d >= NOISE) noisy += 1;
    if (d >= PERCEPT) percept += 1;
  }
  console.log('\n=== DIFF');
  console.log(`    pixels compares       ${n}`);
  console.log(`    differents (>=${NOISE}/255) ${noisy}  (${((noisy / n) * 100).toFixed(2)} %)`);
  console.log(`    perceptibles (>=${PERCEPT}/255) ${percept}  (${((percept / n) * 100).toFixed(2)} %)`);
  console.log(`    ecart max ${worst}/255   ecart moyen ${(sum / n).toFixed(2)}/255`);
  if (percept === 0) console.log('    -> aucun ecart perceptible : les deux images sont equivalentes a l\'oeil.');
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const imgs = args.files.map((f) => load(path.resolve(HERE, '..', f), args.opt.crop));
  const all = imgs.map((im) => {
    const s = stats(im, args.opt.bins);
    report(im, s);
    return s;
  });
  if (imgs.length >= 2) {
    diff(imgs[0], imgs[1]);
    console.log(`\n    amplitude   ${(all[0].p98 - all[0].p2).toFixed(1)}  ->  ${(all[1].p98 - all[1].p2).toFixed(1)}`);
    console.log(`    grain moyen ${all[0].grainMean.toFixed(1)}  ->  ${all[1].grainMean.toFixed(1)}`);
    console.log(`    modes       ${all[0].modes.length}  ->  ${all[1].modes.length}`);
  }
}

main();
