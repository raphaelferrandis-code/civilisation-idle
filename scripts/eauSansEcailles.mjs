/**
 * L'EAU SANS ÉCAILLES — une nappe qui ne quadrille plus (2026-10-02).
 * ---------------------------------------------------------------------------
 * Raph : « qu'est-ce que tu proposes pour les écailles ? ». La nappe du beau temps
 * (`river-tiles-calm-ciel.png`) est un carreau de 16 px — UNE tuile de jeu — dont les
 * anneaux clairs dessinent des alvéoles fermées : dès le zoom 1,5, l'œil voit la grille.
 *
 * Ici, un carreau de 64 px (4 tuiles de jeu) SANS forme fermée, dans les CINQ couleurs
 * exactes de la nappe actuelle (aucune teinte nouvelle, le fleuve garde son ton) :
 *   · des CREUX allongés à l'horizontale (houle douce), tirés d'un bruit périodique
 *     anisotrope — jamais deux fois la même forme dans le carreau ;
 *   · une CRÊTE d'un pixel au-dessus de chaque creux (la lecture « petite vague »
 *     du pixel art : creux sombre, crête claire, à l'horizontale de l'écran) ;
 *   · des REFLETS : de courts traits horizontaux semés au hasard (tirage à distance
 *     minimale, sur le tore), qui naissent, s'allongent et s'éteignent sur les 8
 *     images — seuls eux bougent, le corps reste figé (la règle de la nappe calme).
 * Tout est périodique sur 64 px, donc le motif se répète sans couture.
 *
 * Sortie : public/pixelart/water/river-tiles-calm-ciel-v2.png (8 images de 64×64), puis
 * les trois autres coloris de l'état de la partie, MÊME DESSIN, couleurs par rôle (cf.
 * LES AUTRES COLORIS en bas) : -turquoise-v2 (usure), -hiver-v2, river-tiles-calm-v2
 * (ardoise de l'averse). Choisie par Raph sur planche le 2026-10-02 (« go pour la
 * nouvelle ») contre l'ancienne et une version aux écailles atténuées.
 * Usage : node scripts/eauSansEcailles.mjs [--seed N] [--out chemin] [--board chemin]
 *   (--out : essai seul, sans décliner les coloris)
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SEED = Number(arg('--seed', 11));
const OUT = arg('--out', path.join('public', 'pixelart', 'water', 'river-tiles-calm-ciel-v2.png'));
const BOARD = arg('--board', null);

const N = 64, FR = 8;
// Les cinq couleurs de la nappe calme du beau temps (scripts/eauCalme.mjs).
const FOND = [64, 112, 134], CREUX = [56, 102, 126], ANNEAU = [70, 121, 142];
const CLAIR = [80, 133, 151], ECLAT = [104, 148, 162];

// Hasard déterministe (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(SEED);

// Bruit PÉRIODIQUE sur 64 px : somme de sinus à fréquences ENTIÈRES (donc sans
// couture), plus serrées en y qu'en x → des formes allongées à l'horizontale.
const waves = [];
// Pente d'une crête = kx / ky ≤ 0,5 : des formes à l'HORIZONTALE de l'écran. Un
// premier jet à kx ≤ 3, ky ≥ 3 faisait une grande traînée en DIAGONALE, assez
// singulière pour qu'on la voie se répéter tous les 64 px.
for (let k = 0; k < 9; k += 1) {
  waves.push({
    kx: 1 + Math.floor(R() * 2),            // 1..2 périodes en x
    ky: 4 + Math.floor(R() * 5),            // 4..8 périodes en y
    sx: R() < 0.5 ? -1 : 1,
    ph: R() * Math.PI * 2,
    a: 0.6 + R() * 0.4,
  });
}
const amp = waves.reduce((s, w) => s + w.a, 0);
const noise = (x, y) => {
  let v = 0;
  for (const w of waves) v += w.a * Math.sin(2 * Math.PI * (w.sx * w.kx * x / N + w.ky * y / N) + w.ph);
  return v / amp;                           // ~[-1, 1]
};

// Le corps, FIGÉ : fond, creux, et la crête d'un pixel au-dessus de chaque creux.
const TROUGH = -0.38;
const body = [];
for (let y = 0; y < N; y += 1) {
  for (let x = 0; x < N; x += 1) body.push(noise(x, y) < TROUGH ? CREUX : FOND);
}
const at = (x, y) => body[((y + N) % N) * N + ((x + N) % N)];
const base = body.slice();
for (let y = 0; y < N; y += 1) {
  for (let x = 0; x < N; x += 1) {
    if (at(x, y) === FOND && at(x, y + 1) === CREUX) base[y * N + x] = ANNEAU;   // crête
  }
}

// Les reflets : traits horizontaux à distance minimale (sur le tore).
const dashes = [];
const DMIN = 7.5;
for (let tries = 0; tries < 6000 && dashes.length < 30; tries += 1) {
  const x = Math.floor(R() * N), y = Math.floor(R() * N);
  let ok = true;
  for (const d of dashes) {
    let dx = Math.abs(d.x - x), dy = Math.abs(d.y - y);
    dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
    if (Math.hypot(dx, dy * 1.6) < DMIN) { ok = false; break; }   // un peu plus d'écart en y
  }
  if (!ok) continue;
  dashes.push({ x, y, len: 2 + Math.floor(R() * 5), ph: Math.floor(R() * FR) });
}
// Profil d'un reflet sur ses 8 images : il naît, s'allonge, tient, s'éteint, repose.
const PROFILE = [0, 0.5, 1, 1, 0.5, 0, 0, 0];

const sheet = new PNG({ width: N * FR, height: N });
for (let f = 0; f < FR; f += 1) {
  const img = base.slice();
  for (const d of dashes) {
    const w = PROFILE[(f + d.ph) % FR];
    const L = Math.round(d.len * w);
    if (L <= 0) continue;
    const x0 = d.x - Math.floor(L / 2);
    for (let i = 0; i < L; i += 1) img[d.y * N + ((x0 + i + N) % N)] = CLAIR;
    if (w >= 1 && d.len >= 3) img[d.y * N + ((d.x + N) % N)] = ECLAT;        // le cœur, au plus fort
  }
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const c = img[y * N + x], o = (y * sheet.width + f * N + x) * 4;
      sheet.data[o] = c[0]; sheet.data[o + 1] = c[1]; sheet.data[o + 2] = c[2]; sheet.data[o + 3] = 255;
    }
  }
}
fs.writeFileSync(OUT, PNG.sync.write(sheet));

// ── LES AUTRES COLORIS ──────────────────────────────────────────────────────
// Les bandes calmes de 16 px (ciel, turquoise, hiver, ardoise) partagent EXACTEMENT le
// même dessin en cinq couleurs : vérifié pixel à pixel, chaque couleur de la ciel
// correspond à une et une seule couleur de chaque coloris. On LIT cette correspondance
// sur les bandes existantes, puis on l'applique à la nouvelle nappe : aucune teinte
// n'est inventée, chaque coloris garde les siennes (et donc son liseré, son quai, son
// lavis de nuit, réglés sur elles dans WATER_SHEETS).
if (!process.argv.includes('--out')) {
  const DIR = path.dirname(OUT);
  const read = (name) => PNG.sync.read(fs.readFileSync(path.join(DIR, name)));
  const ref = read('river-tiles-calm-ciel.png');
  const key = (d, i) => d[i] + ',' + d[i + 1] + ',' + d[i + 2];
  for (const [from, to] of [
    ['river-tiles-calm-turquoise.png', 'river-tiles-calm-turquoise-v2.png'],
    ['river-tiles-calm-hiver.png', 'river-tiles-calm-hiver-v2.png'],
    ['river-tiles-calm.png', 'river-tiles-calm-v2.png'],
  ]) {
    const src = read(from);
    if (src.width !== ref.width || src.height !== ref.height) throw new Error(from + ' : pas la taille de la bande ciel');
    const map = new Map();
    for (let i = 0; i < ref.data.length; i += 4) {
      const a = key(ref.data, i), b = [src.data[i], src.data[i + 1], src.data[i + 2]];
      const prev = map.get(a);
      if (prev && prev.join(',') !== b.join(',')) throw new Error(from + ' : la couleur ' + a + ' a deux correspondances');
      map.set(a, b);
    }
    const out = new PNG({ width: sheet.width, height: sheet.height });
    for (let i = 0; i < sheet.data.length; i += 4) {
      const c = map.get(key(sheet.data, i));
      if (!c) throw new Error(to + ' : couleur sans correspondance ' + key(sheet.data, i));
      out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
    }
    fs.writeFileSync(path.join(DIR, to), PNG.sync.write(out));
    console.log('écrit', path.join(DIR, to));
  }
}

// Mesures : couverture des couleurs, et pixels qui changent d'une image à l'autre.
const count = new Map();
for (let i = 0; i < sheet.data.length; i += 4) {
  const k = sheet.data[i] + ',' + sheet.data[i + 1] + ',' + sheet.data[i + 2];
  count.set(k, (count.get(k) || 0) + 1);
}
let churn = 0;
for (let f = 0; f < FR; f += 1) {
  const g = (f + 1) % FR;
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const a = (y * sheet.width + f * N + x) * 4, b = (y * sheet.width + g * N + x) * 4;
      if (sheet.data[a] !== sheet.data[b] || sheet.data[a + 1] !== sheet.data[b + 1]) churn += 1;
    }
  }
}
console.log('écrit', OUT, '— reflets', dashes.length, '— churn', (100 * churn / FR / (N * N)).toFixed(1) + ' %');
console.log([...count].map(([k, v]) => k + ' ' + (100 * v / (N * N * FR)).toFixed(1) + '%').join(' | '));

// Planche de contrôle : l'image 0 en mosaïque 3×3, ×4.
if (BOARD) {
  const S = 4, M = 3, b = new PNG({ width: N * M * S, height: N * M * S });
  for (let y = 0; y < b.height; y += 1) {
    for (let x = 0; x < b.width; x += 1) {
      const sx = (Math.floor(x / S)) % N, sy = (Math.floor(y / S)) % N;
      const si = (sy * sheet.width + sx) * 4, di = (y * b.width + x) * 4;
      for (let c = 0; c < 4; c += 1) b.data[di + c] = sheet.data[si + c];
    }
  }
  fs.writeFileSync(BOARD, PNG.sync.write(b));
}
