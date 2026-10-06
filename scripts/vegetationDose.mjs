// vegetationDose.mjs — LA DOSE B de docs/PLAN-VEGETATION.md (choisie par Raph le
// 2026-10-04 sur la planche du lot 0) : un pré plus clair et plus calme, une forêt
// plus sombre dont les couronnes gardent leur lumière.
//
//   node scripts/vegetationDose.mjs grass            réécrit les 4 tuiles d'herbe d'été
//                                                    (+ la tuile de base) depuis leur
//                                                    version SOURCE (commit épinglé)
//   node scripts/vegetationDose.mjs tone <in> <out> <pre|feuillu|sapin>
//                                                    retonifie un PNG (images de style
//                                                    PixelLab, essais)
//   … --dry                                          n'écrit rien, affiche les mesures
//
// LA MESURE. Luminance = Rec. 709 sur les valeurs sRGB, moyennée sur les pixels
// opaques (alpha ≥ 128) — la même que la planche. Pré 72 → 92, feuillus 127-139 → 86,
// sapin 61 → 58 : couronne ÷ pré passe de 1,8 à 0,93.
//
// LA COURBE. Une rotation de teinte, puis un gamma sur la luminance (la chroma suit en
// proportion), puis la saturation autour de la luminance. Le gamma est cherché par
// dichotomie pour que la MOYENNE tombe sur la cible. Pour les feuillus, les reflets
// au-dessus de 0,5-0,78 reviennent vers leur valeur d'origine (`hi`) : la masse
// s'assombrit, la couronne reste éclairée en haut à gauche. Sans ce retour, la
// première maquette rendait une forêt boueuse, sans lumière.
//
// UN SEUL GAMMA POUR LES 4 TUILES D'HERBE : calé sur leur moyenne, pour garder les
// écarts entre variantes (le patchwork est voulu — égaliser les tuiles a été refusé).
//
// ANTI-REJEU : `grass` relit les tuiles au commit SOURCE, jamais la copie de travail —
// le relancer donne le même résultat au bit près.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

export const DOSE_B = {
  pre: { y: 92, sat: 0.74, hue: -7 },
  feuillu: { y: 86, sat: 0.88, hue: 11, hi: [0.5, 0.78, 0.85] },
  sapin: { y: 58, sat: 0.88, hue: -5 },
};
// Tuiles d'herbe d'été telles que livrées avant la dose (commit du 2026-10-04).
const SOURCE = '82f49aaf31987844b3205653f74e9389a0492e94';
const DIR = 'public/pixelart/iso';
const GRASS = ['iso-grass', 'iso-grass-1', 'iso-grass-2', 'iso-grass-3', 'iso-grass-4'];
// Sous-couche des creux d'herbe (GRASS_TILE_UNDER, isoGroundDetail.js) au commit SOURCE.
const UNDER_SRC = [42, 85, 39];

export const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

// Une couleur, pour un réglage `o` et un gamma donnés.
export function toneOne(r, g, b, o, gamma) {
  if (o.hue) { const [h, s, l] = rgb2hsl(r, g, b); [r, g, b] = hsl2rgb((h + o.hue + 360) % 360, s, l); }
  const y = Math.max(1, lum(r, g, b));
  let y2 = 255 * Math.pow(y / 255, gamma);
  if (o.hi) {
    const t = Math.max(0, Math.min(1, (y / 255 - o.hi[0]) / (o.hi[1] - o.hi[0])));
    y2 += (y - y2) * t * t * (3 - 2 * t) * (o.hi[2] == null ? 1 : o.hi[2]);
  }
  const k = y2 / y;
  r *= k; g *= k; b *= k;
  const s = o.sat == null ? 1 : o.sat;
  return [clamp(y2 + (r - y2) * s), clamp(y2 + (g - y2) * s), clamp(y2 + (b - y2) * s)];
}
export function meanLum(png, o = null, gamma = 1) {
  let s = 0, n = 0;
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const c = o ? toneOne(d[i], d[i + 1], d[i + 2], o, gamma) : [d[i], d[i + 1], d[i + 2]];
    s += lum(c[0], c[1], c[2]); n++;
  }
  return n ? s / n : 0;
}
// Gamma qui amène la moyenne d'un LOT d'images sur `o.y`.
export function gammaFor(pngs, o) {
  let lo = 0.2, hi = 4;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    const avg = pngs.reduce((a, p) => a + meanLum(p, o, m), 0) / pngs.length;
    if (avg > o.y) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
export function tonePng(png, o, gamma) {
  const out = new PNG({ width: png.width, height: png.height });
  png.data.copy(out.data);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const c = toneOne(d[i], d[i + 1], d[i + 2], o, gamma);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const cmd = args.filter((a) => !a.startsWith('--'));
  if (cmd[0] === 'grass') {
    const src = GRASS.map((k) => PNG.sync.read(execFileSync('git', ['show', `${SOURCE}:${DIR}/${k}.png`], { maxBuffer: 1 << 24 })));
    // Le gamma se cale sur les 4 VARIANTES (la tuile de base n'est qu'un repli).
    const o = DOSE_B.pre, g = gammaFor(src.slice(1), o);
    src.forEach((p, i) => {
      const t = tonePng(p, o, g);
      console.log(GRASS[i].padEnd(12), 'lum', meanLum(p).toFixed(1), '→', meanLum(t).toFixed(1));
      // Seules les tuiles LIVRÉES sont récrites : la base `iso-grass.png` n'est plus
      // dans public/ (le sol sonde la variante 1, audit du 05/10, ASSET-8).
      if (!dry && fs.existsSync(`${DIR}/${GRASS[i]}.png`)) fs.writeFileSync(`${DIR}/${GRASS[i]}.png`, PNG.sync.write(t));
    });
    console.log('gamma', g.toFixed(3), '· GRASS_TILE_UNDER', JSON.stringify(toneOne(...UNDER_SRC, o, g)));
    return;
  }
  if (cmd[0] === 'tone' && cmd.length >= 4) {
    const [, inp, out, kind] = cmd;
    const o = DOSE_B[kind];
    if (!o) throw new Error('réglage inconnu : ' + kind);
    const p = PNG.sync.read(fs.readFileSync(inp));
    const g = gammaFor([p], o);
    const t = tonePng(p, o, g);
    console.log(inp, 'lum', meanLum(p).toFixed(1), '→', meanLum(t).toFixed(1), 'gamma', g.toFixed(3));
    if (!dry) fs.writeFileSync(out, PNG.sync.write(t));
    return;
  }
  console.log('usage : node scripts/vegetationDose.mjs grass | tone <in> <out> <pre|feuillu|sapin> [--dry]');
}
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/vegetationDose.mjs')) main();
