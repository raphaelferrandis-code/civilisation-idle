/* ---------------------------------------------------------------------------
 * calmWaterTiles.mjs — cuit une variante CALME de la texture d'eau du fleuve.
 *
 * LE PROBLÈME MESURÉ (2026-07-30, retour Raph « le fleuve est trop bruyant »).
 * Les 8 frames de `river-tiles.png` ne sont pas une vague qui avance : ce sont
 * huit champs de bruit indépendants. Mesuré sur la bande livrée :
 *   - 48,6 % des pixels changent à CHAQUE transition, dont 30,4 points dans le
 *     seul CORPS de l'eau (les deux tons sombres, 80 % de la surface) ;
 *   - 0 % des pixels sont stables sur le cycle complet — pas un seul socle ;
 *   - la distance MINIMALE entre deux frames quelconques est de 33 %, donc
 *     aucun sous-ensemble de frames n'est calme : on ne peut pas s'en sortir en
 *     baissant le fps ou en gardant 3 images sur 8.
 * À worldPx = 2, un pixel de tuile fait ~1 px écran au zoom de jeu : l'œil ne
 * résout plus les formes, il ne perçoit QUE le clignotement. D'où la neige de
 * télé. Le défaut est dans la matière source, pas dans le réglage.
 *
 * LA RÈGLE DES TUTOS D'EAU PIXEL ART (Slynyrd « Water in Motion », Wolthera
 * « Animating Water Tiles ») : on n'anime PAS toute la surface, on fige le corps
 * et on ne fait bouger que les REFLETS. Wolthera le dit du contour : animer le
 * contour INTÉRIEUR est « beaucoup plus apaisant » que d'animer tout.
 *
 * CE QUE FAIT CE SCRIPT. Il relit la bande déjà versionnée (pas besoin du pack
 * source, qui reste hors dépôt) et recompose 8 frames :
 *   - SUBSTRAT figé : la structure d'UNE frame de référence, ses éclats rabattus
 *     d'un cran, identique dans les 8 images → le corps de l'eau ne bout plus ;
 *   - ÉCLATS mobiles : seuls les pixels de rang >= glintMin de chaque frame sont
 *     réimprimés par-dessus → ~10 % de la surface bouge au lieu de 49 %.
 * Les frames sont RÉORDONNÉES (cycle hamiltonien minimal sur les 8 nœuds, force
 * brute) pour que deux images consécutives partagent le plus d'éclats possible :
 * les reflets se déplacent au lieu de sauter au hasard.
 *
 * GARDES (les mêmes que bakeWaterTiles, plus une) : moyenne pondérée à moins de
 * 4 par canal de WATER (la texture ne doit pas déplacer le ton du fleuve),
 * raccord seamless, et churn effectivement descendu — sinon abandon.
 *
 * PALETTE DÉDUITE DE LA SOURCE, pas codée en dur : les coloris pilotés par
 * l'état de la partie (azur, turquoise, bleu d'hiver) gardent les couleurs du
 * pack, donc le script ne peut pas présumer de la rampe ardoise. Il trie les
 * cinq teintes par luminance et travaille en RANGS — la recomposition est
 * exactement la même quelle que soit la teinte. `--tone water` (défaut) garde le
 * contrôle « la texture ne déplace pas le ton du fleuve » pour la bande ardoise ;
 * `--tone none` le désactive pour un coloris natif, où la teinte EST l'information.
 *
 * usage : node scripts/calmWaterTiles.mjs [--in b.png] [--out c.png]
 *                                        [--base 0] [--glintMin 3] [--demote 1]
 *                                        [--tone water|none]
 * ------------------------------------------------------------------------- */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { PNG } = require('pngjs');
import fs from 'node:fs';
import path from 'node:path';

const T = 16, FRAMES = 8, TONES = 5;
const WATER = [74, 98, 109];
const MEAN_TOL = 4;

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = Number(arg('base', 0));
const GLINT_MIN = Number(arg('glintMin', 3));
const DEMOTE = Number(arg('demote', 1));      // de combien de crans on rabat les éclats du substrat
const TONE = arg('tone', 'water');            // water = garde le contrôle de teinte, none = coloris natif
const SRC = arg('in', path.join(process.cwd(), 'public/pixelart/water/river-tiles.png'));
const OUT = arg('out', path.join(process.cwd(), 'public/pixelart/water/river-tiles-calm.png'));

const src = PNG.sync.read(fs.readFileSync(SRC));
if (src.height !== T || src.width !== T * FRAMES) {
  console.error(`bande attendue ${T * FRAMES}x${T}, lue ${src.width}x${src.height}`);
  process.exit(2);
}
// Palette de la SOURCE, triée par luminance : les rangs sont tout ce dont la
// recomposition a besoin, donc elle marche sur l'ardoise comme sur l'azur.
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const seen = new Map();
for (let y = 0; y < T; y += 1) for (let x = 0; x < src.width; x += 1) {
  const i = (y * src.width + x) * 4;
  if (src.data[i + 3] < 250) { console.error(`pixel non opaque en (${x},${y})`); process.exit(1); }
  const k = `${src.data[i]},${src.data[i + 1]},${src.data[i + 2]}`;
  seen.set(k, (seen.get(k) || 0) + 1);
}
const RAMP = [...seen.keys()].map((k) => k.split(',').map(Number)).sort((a, b) => lum(a) - lum(b));
if (RAMP.length !== TONES) {
  console.error(`la bande source a ${RAMP.length} teintes, il en faut ${TONES} — mauvais fichier ou coloris`);
  process.exit(1);
}
const key = new Map(RAMP.map((c, i) => [c.join(','), i]));
const rankAt = (x, y) => {
  const i = (y * src.width + x) * 4;
  return key.get([src.data[i], src.data[i + 1], src.data[i + 2]].join(','));
};
// Grille des rangs : [frame][y][x]
const R = [];
for (let f = 0; f < FRAMES; f++) {
  const g = [];
  for (let y = 0; y < T; y++) { const row = []; for (let x = 0; x < T; x++) row.push(rankAt(f * T + x, y)); g.push(row); }
  R.push(g);
}

// ── 1. SUBSTRAT FIGÉ ────────────────────────────────────────────────────────
// La frame de référence, éclats rabattus : ils seront réimprimés par-dessus,
// et les laisser à leur rang figerait des reflets là où d'autres se posent.
const sub = R[BASE].map(row => row.map(r => (r >= GLINT_MIN ? Math.max(0, r - DEMOTE) : r)));

// ── 2. ORDRE DES FRAMES : que les éclats se DÉPLACENT au lieu de sauter ─────
// Distance = nombre de pixels où l'un a un éclat et pas l'autre. Cycle minimal
// par force brute (7!/2 = 2520 cycles, instantané).
const glint = R.map(g => g.map(row => row.map(r => (r >= GLINT_MIN ? 1 : 0))));
const dist = (a, b) => { let n = 0; for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (glint[a][y][x] !== glint[b][y][x]) n++; return n; };
const D = R.map((_, a) => R.map((_, b) => dist(a, b)));
let best = null, bestCost = Infinity;
const perm = (rest, acc) => {
  if (!rest.length) {
    let c = 0;
    for (let i = 0; i < acc.length; i++) c += D[acc[i]][acc[(i + 1) % acc.length]];
    if (c < bestCost) { bestCost = c; best = acc.slice(); }
    return;
  }
  for (let i = 0; i < rest.length; i++) perm(rest.filter((_, j) => j !== i), acc.concat(rest[i]));
};
perm(R.map((_, i) => i).slice(1), [0]);
const order = best;

// ── 3. COMPOSITION ──────────────────────────────────────────────────────────
const out = new PNG({ width: T * FRAMES, height: T });
const comp = [];
for (let k = 0; k < FRAMES; k++) {
  const f = order[k];
  const g = [];
  for (let y = 0; y < T; y++) {
    const row = [];
    for (let x = 0; x < T; x++) row.push(R[f][y][x] >= GLINT_MIN ? R[f][y][x] : sub[y][x]);
    g.push(row);
  }
  comp.push(g);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const c = RAMP[g[y][x]], i = (y * out.width + (k * T + x)) * 4;
    out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
  }
}

// ── 4. GARDES ───────────────────────────────────────────────────────────────
const counts = new Array(RAMP.length).fill(0);
for (const g of comp) for (const row of g) for (const r of row) counts[r]++;
const total = counts.reduce((a, b) => a + b, 0);
const mean = [0, 1, 2].map(i => Math.round(counts.reduce((s, n, r) => s + RAMP[r][i] * n, 0) / total));
const drift = [0, 1, 2].map(i => Math.abs(mean[i] - WATER[i]));

const churn = (grids) => {
  let n = 0;
  for (let k = 0; k < FRAMES; k++) {
    const a = grids[k], b = grids[(k + 1) % FRAMES];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (a[y][x] !== b[y][x]) n++;
  }
  return 100 * n / (FRAMES * T * T);
};
const before = churn(R), after = churn(comp);

console.log(`source ${path.basename(SRC)}  base=frame ${BASE}  glintMin=${GLINT_MIN}  demote=${DEMOTE}  tone=${TONE}`);
console.log(`palette lue : ${RAMP.map((c) => c.join(',')).join('  |  ')}`);
console.log(`ordre des frames : ${order.join(' -> ')} (coût éclats ${bestCost})`);
console.log('répartition :', counts.map((n, r) => `r${r} ${(100 * n / total).toFixed(1)}%`).join('  '));
console.log(`moyenne pondérée ${mean.join(',')}${TONE === 'water' ? ` contre WATER ${WATER.join(',')} -> dérive ${drift.join('/')}` : '  (coloris natif, teinte non contrainte)'}`);
console.log(`churn par transition : ${before.toFixed(1)}% -> ${after.toFixed(1)}% des pixels`);

if (TONE === 'water' && Math.max(...drift) > MEAN_TOL) { console.error(`ABANDON : le ton du fleuve dérive de plus de ${MEAN_TOL} par canal.`); process.exit(1); }
if (after > before / 2) { console.error('ABANDON : le churn n\'a pas été divisé par deux, la variante n\'est pas plus calme.'); process.exit(1); }

const px = (x, y) => { const i = (y * out.width + x) * 4; return [out.data[i], out.data[i + 1], out.data[i + 2]]; };
const dst = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
let worst = 0;
for (let f = 0; f < FRAMES; f++) {
  const o = f * T;
  let wH = 0, iH = 0, wV = 0, iV = 0;
  for (let y = 0; y < T; y++) { wH += dst(px(o + T - 1, y), px(o, y)); for (let x = 1; x < T; x++) iH += dst(px(o + x - 1, y), px(o + x, y)); }
  for (let x = 0; x < T; x++) { wV += dst(px(o + x, T - 1), px(o + x, 0)); for (let y = 1; y < T; y++) iV += dst(px(o + x, y - 1), px(o + x, y)); }
  worst = Math.max(worst, (wH / T) / (iH / (T * (T - 1))), (wV / T) / (iV / (T * (T - 1))));
}
console.log(`raccord : pire rapport ${worst.toFixed(2)} (1 = aussi continu qu'à l'intérieur)`);
if (worst > 2.2) { console.error('ABANDON : la tuile n\'est pas seamless.'); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(out));
console.log(`écrit ${path.relative(process.cwd(), OUT)}  ${out.width}x${out.height}`);
