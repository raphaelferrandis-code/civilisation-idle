#!/usr/bin/env node
// Grave une inscription grecque LISIBLE dans l'anneau d'un disque pixel,
// lettres orientées par rapport au centre.
//
// Le piège, c'est de dessiner la lettre droite puis de la faire tourner : à
// cette taille la rotation part en bouillie, et c'est exactement ce qu'a
// produit la diffusion sur l'anneau d'origine. Ici on ne tourne rien. On
// travaille en repère polaire : u = longueur d'arc, v = rayon. La fonte est
// évaluée comme une fonction continue de (u, v), donc chaque pixel de
// l'anneau demande directement s'il est dans l'encre. Le crénelage se règle
// par sur-échantillonnage puis seuil de couverture, pas par filtrage : la
// sortie reste en couleurs pleines, comme du pixel art dessiné à la main.
//
// Usage :
//   node scripts/ringText.mjs --in d.png --probe            # profil radial
//   node scripts/ringText.mjs --in d.png --unroll 88:116 --out strip.png
//   node scripts/ringText.mjs --in d.png --out grave.png --rin 91 --rout 113
//
// Par défaut : quatre mots, un par quadrant, rosettes cardinales épargnées.

import fs from 'node:fs';
import { PNG } from 'pngjs';

// ---------------------------------------------------------------- fonte 9 px
// Majuscules d'inscription : pas de minuscules, pas d'accents, pas d'esprits.
// C'est ce que faisaient les lapicides, et c'est le seul régime qui tienne.
// Les proportions sont celles de la fonte, pas celles du rendu : le tracé est
// étiré à la taille voulue au moment de l'évaluation.
//
// Pourquoi 9 rangées et des traits de DEUX cases. Dans une fonte de 5 px, une
// diagonale n'est qu'une suite de cases qui se touchent par le coin. À 1:1
// l'oeil recolle le trait tout seul ; agrandi quatre fois pour tenir dans
// l'anneau, chaque coin devient un pincement de 4 px et la lettre se casse en
// morceaux. Le Χ était illisible pour cette seule raison. Un trait de deux
// cases se recouvre d'une rangée à la suivante : la diagonale tient à
// n'importe quelle échelle. La garde en fin de fichier le vérifie.
const GLYPHS = {
  'Α': ['...###...', '...###...', '..##.##..', '..##.##..', '.#######.', '.##...##.', '##.....##', '##.....##', '##.....##'],
  'Β': ['#######', '#######', '##...##', '##...##', '#######', '#######', '##...##', '#######', '#######'],
  'Γ': ['#######', '#######', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....'],
  'Δ': ['...###...', '...###...', '..##.##..', '..##.##..', '.##...##.', '.##...##.', '##.....##', '##.....##', '#########'],
  'Ε': ['#######', '#######', '##.....', '##.....', '######.', '######.', '##.....', '#######', '#######'],
  'Ζ': ['########', '########', '.....##.', '....##..', '...##...', '..##....', '.##.....', '########', '########'],
  'Η': ['##....##', '##....##', '##....##', '##....##', '########', '########', '##....##', '##....##', '##....##'],
  'Θ': ['..####..', '.######.', '##....##', '##....##', '########', '##....##', '##....##', '.######.', '..####..'],
  'Ι': ['##', '##', '##', '##', '##', '##', '##', '##', '##'],
  'Κ': ['##....##', '##...##.', '##..##..', '##.##...', '#####...', '##.##...', '##..##..', '##...##.', '##....##'],
  'Λ': ['...###...', '...###...', '..##.##..', '..##.##..', '.##...##.', '.##...##.', '##.....##', '##.....##', '##.....##'],
  'Μ': ['##......##', '###....###', '####..####', '##.####.##', '##..##..##', '##......##', '##......##', '##......##', '##......##'],
  'Ν': ['##....##', '###...##', '####..##', '####..##', '##.##.##', '##..####', '##..####', '##...###', '##....##'],
  'Ο': ['..####..', '.######.', '##....##', '##....##', '##....##', '##....##', '##....##', '.######.', '..####..'],
  'Π': ['########', '########', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##'],
  'Ρ': ['#######', '#######', '##...##', '##...##', '#######', '#######', '##.....', '##.....', '##.....'],
  'Σ': ['########', '########', '.##.....', '..##....', '...##...', '..##....', '.##.....', '########', '########'],
  'Τ': ['########', '########', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
  'Υ': ['##....##', '.##..##.', '..####..', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
  'Φ': ['...##...', '...##...', '########', '##.##.##', '##.##.##', '##.##.##', '########', '...##...', '...##...'],
  'Χ': ['##.....##', '.##...##.', '..##.##..', '...###...', '...###...', '...###...', '..##.##..', '.##...##.', '##.....##'],
  'Ω': ['..#####..', '.##...##.', '##.....##', '##.....##', '##.....##', '##.....##', '.##...##.', '.##...##.', '###...###'],
  // Ponctuation : légitimement en morceaux, donc dispensée de la garde.
  ';': ['...', '...', '.##', '.##', '...', '.##', '.##', '##.', '...'], // point d'interrogation grec
  '·': ['..', '..', '..', '##', '##', '..', '..', '..', '..'],           // ano stigme
  ' ': ['....', '....', '....', '....', '....', '....', '....', '....', '....'],
};
const GLYPH_H = 9;
const PUNCT = new Set([';', '·', ' ']);

function glyphOf(ch) {
  const g = GLYPHS[ch];
  if (!g) throw new Error(`glyphe absent de la fonte : "${ch}" (U+${ch.codePointAt(0).toString(16).toUpperCase()})`);
  return g;
}
const glyphCols = (ch) => glyphOf(ch)[0].length;

// Garde de la fonte. Une lettre doit être d'un seul tenant en 4-connexité :
// c'est exactement la propriété que la mise à l'échelle détruit quand deux
// cases ne se touchent que par le coin. Elle ne compare pas le rendu à
// lui-même, elle contrôle la donnée contre ce qui casse pour de vrai. Elle
// vérifie aussi que les rangées d'un glyphe ont toutes la même largeur, sans
// quoi la chasse ment silencieusement.
function checkFont() {
  const bad = [];
  for (const [ch, rows] of Object.entries(GLYPHS)) {
    if (rows.length !== GLYPH_H) { bad.push(`${ch} : ${rows.length} rangées au lieu de ${GLYPH_H}`); continue; }
    const w = rows[0].length;
    if (rows.some((r) => r.length !== w)) { bad.push(`${ch} : rangées de largeurs inégales`); continue; }
    if (PUNCT.has(ch)) continue;
    const ink = [];
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') ink.push(y * w + x);
    if (!ink.length) { bad.push(`${ch} : glyphe vide`); continue; }
    const seen = new Set([ink[0]]); const stack = [ink[0]];
    while (stack.length) {
      const k = stack.pop(), y = (k / w) | 0, x = k % w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= GLYPH_H) continue;
        const nk = ny * w + nx;
        if (rows[ny][nx] === '#' && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    if (seen.size !== ink.length) bad.push(`${ch} : ${ink.length - seen.size} case(s) isolée(s), le trait cassera à l'agrandissement`);
  }
  if (bad.length) { console.error('fonte invalide :\n  ' + bad.join('\n  ')); process.exit(1); }
  return Object.keys(GLYPHS).length;
}

// ------------------------------------------------------------------ png util
const idx = (png, x, y) => (png.width * y + x) << 2;
const readPng = (p) => PNG.sync.read(fs.readFileSync(p));

function setPx(png, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = idx(png, x, y);
  png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
}
function getPx(png, x, y) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return [0, 0, 0, 0];
  const i = idx(png, x, y);
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}
function parseColor(s) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (!m) throw new Error(`couleur illisible : ${s}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
}

const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

// Reconnaître l'encre par la teinte est un piège : les faux glyphes ont un
// rehaut crème, trop bleu pour passer un test « c'est doré », et ce sont
// justement ces pixels-là qui survivaient à l'effacement en laissant des
// fantômes. L'histogramme de la bande tranche mieux que la teinte : le fond
// vit sous 47, l'encre au-dessus de 128, et il n'y a que quelques dizaines de
// pixels entre les deux. On coupe donc à la luminance, au milieu du vide.
const INK_MIN = 80;
const isInk = (px) => lum(px) > INK_MIN;

// --------------------------------------------------------- repère polaire
// Angle mesuré depuis midi, dans le sens horaire, comme on lit un cadran.
const angleAt = (cx, cy, x, y) => {
  const t = Math.atan2(x - cx, cy - y);
  return t < 0 ? t + 2 * Math.PI : t;
};
const rad = (d) => (d * Math.PI) / 180;

// Découpe un mot en cellules le long de l'arc. `unit` = largeur d'une colonne
// de fonte en pixels finaux ; la garder égale à hauteur/5 garde les pixels du
// tracé carrés.
function layout(word, unit, gap) {
  const cells = [...word].map((ch) => ({ ch, cols: glyphCols(ch), w: glyphCols(ch) * unit }));
  let u = 0;
  for (const c of cells) { c.u0 = u; u += c.w + gap; }
  return { cells, len: Math.max(0, u - gap) };
}

// L'encre en un point continu (u le long de l'arc, v01 en hauteur de lettre).
function inkAt(cells, u, v01) {
  if (v01 < 0 || v01 >= 1) return false;
  for (const c of cells) {
    if (u < c.u0 || u >= c.u0 + c.w) continue;
    if (c.ch === ' ') return false;
    const rows = glyphOf(c.ch);
    const row = Math.min(GLYPH_H - 1, Math.floor(v01 * GLYPH_H));
    const col = Math.min(c.cols - 1, Math.floor(((u - c.u0) / c.w) * c.cols));
    return rows[row][col] === '#';
  }
  return false;
}

// Grave un mot centré sur `centerDeg`.
//   dir  = +1 l'arc se lit dans le sens horaire, -1 dans l'autre
//   out  = true la tête des lettres pointe vers l'extérieur du disque
// La moitié basse du disque veut dir -1 et out false : c'est la convention des
// sceaux et des monnaies, les deux moitiés se lisent sans tourner la tête.
function stampWord(png, word, o) {
  const { cx, cy, rMid, textH, centerDeg, dir, out, unit, gap, color, hi, ss = 4 } = o;
  const { cells, len } = layout(word, unit, gap);
  const cth = rad(centerDeg);
  const tIn = rMid - textH / 2, tOut = rMid + textH / 2;
  const step = 1 / ss, half = (ss * ss) / 2;
  const ink = new Set();
  let painted = 0;

  const x0 = Math.max(0, Math.floor(cx - tOut - 2)), x1 = Math.min(png.width - 1, Math.ceil(cx + tOut + 2));
  const y0 = Math.max(0, Math.floor(cy - tOut - 2)), y1 = Math.min(png.height - 1, Math.ceil(cy + tOut + 2));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) * step, py = y + (sy + 0.5) * step;
          const d = Math.hypot(px - cx, py - cy);
          if (d < tIn || d >= tOut) continue;
          let dth = angleAt(cx, cy, px, py) - cth;
          while (dth > Math.PI) dth -= 2 * Math.PI;
          while (dth < -Math.PI) dth += 2 * Math.PI;
          const u = dir * dth * rMid + len / 2;
          const v01 = out ? (tOut - d) / textH : (d - tIn) / textH;
          if (inkAt(cells, u, v01)) hits++;
        }
      }
      if (hits > half) { setPx(png, x, y, color); ink.add(`${x},${y}`); painted++; }
    }
  }

  // Rehaut sur l'arête haute du trait, comme le portaient les anciens glyphes :
  // c'est ce qui pose la lettre dans l'or de l'anneau au lieu de la coller
  // dessus. « Haut » veut dire vers l'extérieur du disque en moitié haute, vers
  // le centre en moitié basse : la même bascule que l'orientation des lettres.
  if (hi) {
    for (const k of ink) {
      const [x, y] = k.split(',').map(Number);
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) || 1;
      const s = out ? 1 : -1;
      const nx = Math.round(x + (s * (x + 0.5 - cx)) / d);
      const ny = Math.round(y + (s * (y + 0.5 - cy)) / d);
      if (!ink.has(`${nx},${ny}`)) setPx(png, x, y, hi);
    }
  }
  return { spanDeg: ((len / rMid) * 180) / Math.PI, painted, len };
}

// Efface les faux glyphes d'un secteur : seuls les pixels d'or partent, le
// fond cosmique et ses étoiles restent. Les rosettes hors secteur sont
// épargnées par construction.
function wipeSector(png, { cx, cy, rIn, rOut, a0, a1, bg }) {
  let n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < rIn || d > rOut) continue;
      const deg = (angleAt(cx, cy, x + 0.5, y + 0.5) * 180) / Math.PI;
      const inSector = a0 <= a1 ? deg >= a0 && deg <= a1 : deg >= a0 || deg <= a1;
      if (!inSector) continue;
      const px = getPx(png, x, y);
      if (px[3] < 128 || !isInk(px)) continue;
      setPx(png, x, y, bg); n++;
    }
  }
  return n;
}

// Fond de repeint : la couleur non dorée la plus fréquente de la bande.
function bandBackground(png, { cx, cy, rIn, rOut }) {
  const tally = new Map();
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < rIn || d > rOut) continue;
      const px = getPx(png, x, y);
      if (px[3] < 128 || isInk(px)) continue;
      const k = px.slice(0, 3).join(',');
      tally.set(k, (tally.get(k) || 0) + 1);
    }
  }
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) throw new Error('bande sans fond : rayons hors du disque ?');
  return [...best[0].split(',').map(Number), 255];
}

// ---------------------------------------------------------------- diagnostic
function probe(png, cx, cy) {
  const rMax = Math.floor(Math.min(png.width, png.height) / 2);
  const rows = [];
  for (let r = 1; r < rMax; r++) {
    const C = Math.max(8, Math.round(2 * Math.PI * r));
    let n = 0, ink = 0; const ls = [];
    for (let k = 0; k < C; k++) {
      const a = (k / C) * 2 * Math.PI;
      const px = getPx(png, Math.round(cx + r * Math.sin(a)), Math.round(cy - r * Math.cos(a)));
      if (px[3] < 128) continue;
      n++; if (isInk(px)) ink++;
      ls.push(lum(px));
    }
    if (!n) { rows.push({ r, n: 0, ink: 0, sd: 0 }); continue; }
    const mean = ls.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(ls.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    rows.push({ r, n, ink: ink / n, sd });
  }
  return rows;
}

// Déroule l'anneau à plat : la seule façon honnête de juger une inscription
// circulaire avant de la graver.
function unroll(png, { cx, cy, rIn, rOut, scale = 3 }) {
  const H = rOut - rIn, rMid = (rIn + rOut) / 2;
  const W = Math.round(2 * Math.PI * rMid);
  const out = new PNG({ width: W, height: H * scale });
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < W; x++) {
      const a = (x / W) * 2 * Math.PI, d = rIn + ((y / scale) | 0) + 0.5;
      setPx(out, x, y, getPx(png, Math.round(cx + d * Math.sin(a)), Math.round(cy - d * Math.cos(a))));
    }
  }
  return out;
}

function upscale(png, n) {
  const out = new PNG({ width: png.width * n, height: png.height * n });
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) setPx(out, x, y, getPx(png, (x / n) | 0, (y / n) | 0));
  }
  return out;
}

// ------------------------------------------------------------- ligne de commande
const argv = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : (argv[i + 1] ?? true);
};
const has = (name) => argv.includes(`--${name}`);
const num = (name, def) => Number(flag(name, def));

const nGlyphs = checkFont();
if (has('check')) { console.log(`fonte valide : ${nGlyphs} glyphes, ${GLYPH_H} rangées, tous d'un seul tenant`); process.exit(0); }

const src = flag('in');
if (!src) { console.error('usage : --in <disque.png> [--check|--probe|--unroll rIn:rOut|--out grave.png]'); process.exit(1); }
const png = readPng(src);
const cx = num('cx', png.width / 2), cy = num('cy', png.height / 2);

if (has('probe')) {
  console.log(`image ${png.width}x${png.height}, centre (${cx}, ${cy})`);
  console.log('  r    n   %encre  ecart-type');
  for (const row of probe(png, cx, cy)) {
    console.log(`${String(row.r).padStart(3)} ${String(row.n).padStart(4)}  ${(row.ink * 100).toFixed(0).padStart(5)}%  ${row.sd.toFixed(1).padStart(6)} ${'#'.repeat(Math.round(row.ink * 30))}`);
  }
  console.log('\nla bande de l inscription = la couronne ou l encre cohabite avec le fond');
  process.exit(0);
}

const rIn = num('rin', 91), rOut = num('rout', 113);

if (has('unroll')) {
  const arg = flag('unroll');
  const [a, b] = arg === true ? [rIn, rOut] : String(arg).split(':').map(Number);
  const strip = unroll(png, { cx, cy, rIn: a, rOut: b, scale: num('scale', 3) });
  const out = flag('out') || 'unroll.png';
  fs.writeFileSync(out, PNG.sync.write(strip));
  console.log(`bande ${a}..${b} deroulee : ${strip.width} px de circonference -> ${out}`);
  process.exit(0);
}

// Quatre mots, un par quadrant. Les rosettes cardinales servent de ponctuation.
//
// Par défaut l'inscription TOURNE : pied vers le centre, tête vers l'extérieur,
// sur tout le pourtour. Elle se lit alors d'un seul tenant dans le sens horaire
// depuis le haut gauche, et la moitié basse se présente tête en bas. C'est la
// convention des monnaies et des médailles ; on tourne la pièce, pas la lettre.
//
// --seal donne l'autre école, celle des sceaux : la moitié basse est retournée
// pour se lire sans bouger la tête. Plus confortable, mais les deux moitiés ne
// pointent plus dans le même sens et l'anneau perd sa rotation.
const WORDS = (flag('words', 'ΟΥΔΕΝ|ΒΕΛΤΙΟΝ|ΕΧΕΙΣ|ΠΟΙΕΙΝ;')).split('|');
const KEEP = num('keep', 11);   // demi-emprise des rosettes, en degres
const QUADS = has('seal')
  ? [
    { center: 315, dir: 1, out: true },   // haut gauche
    { center: 45, dir: 1, out: true },   // haut droite
    { center: 225, dir: -1, out: false },  // bas gauche
    { center: 135, dir: -1, out: false },  // bas droite
  ]
  : [
    { center: 315, dir: 1, out: true },   // haut gauche
    { center: 45, dir: 1, out: true },   // haut droite
    { center: 135, dir: 1, out: true },   // bas droite
    { center: 225, dir: 1, out: true },   // bas gauche
  ];

const rMid = (rIn + rOut) / 2;
const textH = num('texth', 20);
// Capitales condensées : la largeur d'un quadrant est le budget contraignant,
// pas la hauteur de la bande. Resserrer la chasse plutôt que rapetisser la
// lettre, c'est ce que faisaient les graveurs quand la pierre manquait.
const unit = num('unit', (textH / GLYPH_H) * num('cond', 0.92));
const gap = num('gap', unit * num('gapf', 1.5));
// Or et crème repris tels quels des couleurs dominantes de l'anneau : une
// inscription qui invente sa teinte se voit tout de suite comme un rapport.
const color = parseColor(flag('color', '#f9b445'));
// Le crème (254,232,173) de la palette est trop clair pour ce rôle : sur un
// trait de 4 px il ne lit plus comme un rehaut mais comme un cerne, et la
// lettre se creuse. L'or clair voisin donne le volume sans le contour.
const hi = has('flat') ? null : parseColor(flag('hi', '#fbc554'));
const bg = flag('bg') ? parseColor(flag('bg')) : bandBackground(png, { cx, cy, rIn, rOut });

console.log(`anneau r ${rIn}..${rOut} (moyen ${rMid}), circonference ${(2 * Math.PI * rMid).toFixed(0)} px`);
console.log(`lettres ${textH} px de haut, fond de repeint rgb(${bg.slice(0, 3)})`);

let wiped = 0;
for (const q of QUADS) {
  const a0 = (q.center - 45 + KEEP + 360) % 360, a1 = (q.center + 45 - KEEP + 360) % 360;
  wiped += wipeSector(png, { cx, cy, rIn, rOut, a0, a1, bg });
}
console.log(`faux glyphes effaces : ${wiped} px (rosettes cardinales epargnees, +/- ${KEEP} deg)`);

const gapDeg = 90 - 2 * KEEP;
WORDS.forEach((w, i) => {
  const q = QUADS[i];
  if (!q) return;
  const r = stampWord(png, w, { cx, cy, rMid, textH, centerDeg: q.center, dir: q.dir, out: q.out, unit, gap, color, hi, ss: num('ss', 4) });
  const fit = r.spanDeg <= gapDeg ? 'ok' : 'DEBORDE la rosette';
  console.log(`  ${String(q.center).padStart(3)} deg  "${w}"  ${r.spanDeg.toFixed(1)} / ${gapDeg} deg  ${r.painted} px  ${fit}`);
});

const out = flag('out');
if (out) { fs.writeFileSync(out, PNG.sync.write(png)); console.log(`ecrit ${out}`); }
const preview = flag('preview');
if (preview) {
  const n = num('pscale', 3);
  fs.writeFileSync(preview, PNG.sync.write(upscale(png, n)));
  console.log(`ecrit ${preview} (x${n})`);
}
