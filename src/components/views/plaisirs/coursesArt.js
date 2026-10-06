"use strict";
// ── LES COURSES, EN PIXEL (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md) ────────────
//
// La piste des courses de la Maison : une nuit de courses vue de la tribune, six
// couloirs, six chevaux montés. Tout est dessiné par le code, à la grille de la table
// (un pixel d'art = `k` pixels d'écran, entier) :
//   - le CHEVAL et son jockey : un gabarit au pixel (RACER), quatre images de galop,
//     la robe du cheval et la casaque du couloir posées par palette, le contour sombre
//     ajouté par le code ; aux âges cosmiques, des chevaux de lumière ;
//   - la PISTE de l'âge : le ciel de nuit, la tribune et sa foule, les couloirs, la
//     stalle de départ, le poteau d'arrivée en damier.
// Pur : `put(x, y, couleur)` peint ; la scène (CoursesStage) le cuit dans des toiles.
//
// ⛔ Le cheval n'est jamais agrandi ni réduit autrement que par `k` (entier) : pas de
// réduction par moyenne (mémoire « PixelLab : jamais de réduction par moyenne »).
//
// L'outillage vient de deux feuilles sans code de carte (plaisirsHDKit n'importe que
// isoPixelPaint et le hachage partagé) : le chunk de la vue n'embarque rien de plus.
import { bayer, mix } from '../../../game/map/iso/plaisirsHDKit.js';
import { h01Pair as h32 } from '../../../game/map/hash.js';

// ── Le cheval et son jockey ──────────────────────────────────────────────────
// Lettres : H casquette, F visage, S casaque, T casaque ombrée, K botte et sabot,
// M crinière et queue, C robe, L robe éclairée, D robe ombrée, W tapis de selle.
// Le corps (rangs 0-11) est commun aux quatre images ; les jambes (rangs 12-16) font
// le galop. Le cheval regarde à droite.
const CORPS = [
  "......................",
  "..............HH......",
  "...........SSSHF......",
  "..........SSSSS..M....",
  "..........TTSSSSCCC...",
  ".........TTTT..MCCCC..",
  ".MMLLLL.....KMMCCCCCC.",
  "MMCCCCCLLLLLCCCCC..CD.",
  "M.CCCCCWWWCCCCCCC.....",
  "...DCCCCCCCCCCCCCC....",
  "....DCCCCCCCCCCCD.....",
  "......DDDDDDDDD.......",
];
// Les jambes, image par image : [x, y] ; la jambe LOINTAINE (ombrée) d'abord, puis la
// proche ; le dernier point de chaque jambe est le sabot.
// 0 : l'extension (avant tendu, arrière repoussé) ; 1 : la suspension (tout replié
// sous le ventre, le corps monte d'un pixel) ; 2 : la réception (l'avant se pose,
// l'arrière revient) ; 3 : la poussée (l'avant repousse, l'arrière se plante).
const JAMBES = [
  {
    loin: [[[14, 12], [15, 13], [16, 14], [16, 15], [17, 16]], [[7, 12], [6, 13], [5, 14], [5, 15], [4, 16]]],
    pres: [[[15, 12], [16, 13], [17, 14], [18, 15], [19, 16]], [[6, 12], [5, 13], [4, 14], [3, 15], [2, 16]]],
    dy: 0,
  },
  {
    loin: [[[14, 12], [14, 13], [13, 14]], [[6, 12], [7, 13], [8, 13]]],
    pres: [[[15, 12], [16, 13], [15, 14]], [[7, 12], [8, 13], [9, 14]]],
    dy: -1,
  },
  {
    loin: [[[14, 12], [15, 13], [16, 14], [17, 15]], [[6, 12], [6, 13], [7, 14], [7, 15], [8, 16]]],
    pres: [[[15, 12], [15, 13], [15, 14], [14, 15], [14, 16]], [[7, 12], [8, 13], [9, 14], [10, 15]]],
    dy: 0,
  },
  {
    loin: [[[14, 12], [13, 13], [13, 14], [12, 15]], [[7, 12], [8, 13], [8, 14], [9, 15]]],
    pres: [[[15, 12], [14, 13], [13, 14], [12, 15], [11, 16]], [[6, 12], [6, 13], [6, 14], [6, 15], [6, 16]]],
    dy: 0,
  },
];
export const RACER_W = 24; // avec le contour (1 px de chaque côté)
export const RACER_H = 19;
export const RACER_FRAMES = JAMBES.length;
// Le NEZ du cheval dans l'image (x, contour compris) : c'est lui qui franchit la ligne.
export const RACER_NOSE = 22;

// Les robes : baie, alezane, noire, grise, blanche, isabelle.
const ROBES = [
  { C: '#8b4a24', D: '#5e2f16', L: '#b0683a', M: '#2a1810' },
  { C: '#a5552a', D: '#723816', L: '#c8743e', M: '#6a2c12' },
  { C: '#3a3436', D: '#221e20', L: '#57504f', M: '#121012' },
  { C: '#a8a4a0', D: '#77736f', L: '#cfcac4', M: '#4a4644' },
  { C: '#e6e0d6', D: '#b5ad9f', L: '#fffaf0', M: '#9a9286' },
  { C: '#c99a4a', D: '#94692a', L: '#e8c070', M: '#f2e6c8' },
];
// Les casaques des six couloirs (les couleurs des courses : rouge, blanc, bleu, jaune,
// vert, noir), leur ombre, la casquette.
export const CASAQUES = [
  { S: '#d23a32', T: '#8e2220', H: '#f4efe4' },
  { S: '#f2efe6', T: '#b9b2a2', H: '#d23a32' },
  { S: '#2f5fd0', T: '#1d3c88', H: '#f2c230' },
  { S: '#f2c230', T: '#b0861a', H: '#26262c' },
  { S: '#2f9a4a', T: '#1c6630', H: '#f4efe4' },
  { S: '#2c2c34', T: '#141418', H: '#f2c230' },
];
const PEAU = '#e2b48a';
const BOTTE = '#1a1412';

// Une palette de coureur : la robe (0-5), la casaque du couloir, l'âge. Aux âges
// cosmiques, des CHEVAUX DE LUMIÈRE : la robe nacrée, la crinière et la queue de la
// lumière de l'ère, et une traînée derrière eux (`trainee`, peinte par la scène).
// (Des ailes de pégase ont été essayées : à cette taille, des pavés illisibles.)
export function racerPalette(band, couloir, robe) {
  const r = ROBES[((robe % ROBES.length) + ROBES.length) % ROBES.length];
  const c = CASAQUES[couloir % CASAQUES.length];
  const lum = band >= 7 ? LUMIERES[band] || LUMIERES[7] : null;
  if (!lum) return { ...r, ...c, F: PEAU, K: BOTTE, W: c.H, O: '#140c0a', trainee: null };
  return {
    C: mix(r.C, '#fff8ee', 0.55), D: mix(r.D, lum, 0.35), L: mix(r.L, '#ffffff', 0.7), M: lum,
    ...c, F: PEAU, K: mix(lum, '#000000', 0.55), W: c.H, O: '#0d0a18', trainee: lum,
  };
}
const LUMIERES = { 7: '#5af0b4', 8: '#ffcd78', 9: '#aa8cff' };

// Peint une image du coureur, contour compris, dans une grille RACER_W × RACER_H.
// `put(x, y, couleur)` ; (ox, oy) : le coin haut-gauche.
export function paintRacer(put, ox, oy, frame, pal) {
  const f = JAMBES[((frame % JAMBES.length) + JAMBES.length) % JAMBES.length];
  const grid = Array.from({ length: RACER_H }, () => new Array(RACER_W).fill(null));
  const set = (x, y, c) => {
    const gx = x + 1, gy = y + 1 + f.dy + 1;
    if (gx >= 0 && gx < RACER_W && gy >= 0 && gy < RACER_H) grid[gy][gx] = c;
  };
  for (let y = 0; y < CORPS.length; y += 1) {
    const row = CORPS[y];
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch !== '.') set(x, y, pal[ch] || pal.C);
    }
  }
  for (const jambe of f.loin) jambe.forEach(([x, y], i) => set(x, y, i === jambe.length - 1 ? pal.K : pal.D));
  for (const jambe of f.pres) jambe.forEach(([x, y], i) => set(x, y, i === jambe.length - 1 ? pal.K : i < 2 ? pal.C : pal.L));
  // Le contour : tout pixel vide qui touche le dessin (4 voisins).
  for (let y = 0; y < RACER_H; y += 1) {
    for (let x = 0; x < RACER_W; x += 1) {
      if (grid[y][x]) continue;
      const touche = (grid[y - 1] && grid[y - 1][x] && grid[y - 1][x] !== pal.O)
        || (grid[y + 1] && grid[y + 1][x] && grid[y + 1][x] !== pal.O)
        || (grid[y][x - 1] && grid[y][x - 1] !== pal.O)
        || (grid[y][x + 1] && grid[y][x + 1] !== pal.O);
      if (touche) grid[y][x] = pal.O;
    }
  }
  for (let y = 0; y < RACER_H; y += 1) for (let x = 0; x < RACER_W; x += 1) if (grid[y][x]) put(ox + x, oy + y, grid[y][x]);
}

// ── La piste ─────────────────────────────────────────────────────────────────
export const TRACK = {
  ciel: 4,        // le ciel au-dessus de la tribune
  tribune: 9,     // le toit, la foule, la lisse
  marge: 6,       // le pré entre la lisse du fond et le premier couloir (les têtes y passent)
  couloir: 11,    // le pas d'un couloir (un coureur en fait 19 de haut : il mord sur celui de derrière, pas sur deux)
  devant: 4,      // la lisse avant
  depart: 29,     // le nez des coureurs au départ, derrière la barrière des stalles
  arrivee: 18,    // la ligne d'arrivée, depuis le bord droit
};
export const trackHeight = (n = 6) => TRACK.ciel + TRACK.tribune + TRACK.marge + n * TRACK.couloir + TRACK.devant;
// Le bas d'un couloir (là où le coureur pose ses sabots).
export const laneFoot = (couloir) => TRACK.ciel + TRACK.tribune + TRACK.marge + (couloir + 1) * TRACK.couloir - 1;

// Les pistes des âges : sol (deux tons), lisses, toit de la tribune, lumière.
const PISTES = [
  { sol: ['#5a3f26', '#4e3620'], lisse: '#c9a46a', toit: ['#7a4a26', '#4a2c16'], lum: '#ffb35a', foule: 0.8 },   // campement
  { sol: ['#2f5a2a', '#294f25'], lisse: '#e8e0d0', toit: ['#8e2a2a', '#e8d8b0'], lum: '#ffcf8a', foule: 0.9 },   // bannières rayées
  { sol: ['#2f5a2a', '#294f25'], lisse: '#e8e0d0', toit: ['#2a4a8e', '#e8d8b0'], lum: '#ffcf8a', foule: 0.9 },
  { sol: ['#33602c', '#2b5426'], lisse: '#d8d2c4', toit: ['#5a5f6c', '#2f323a'], lum: '#ffd27a', foule: 1 },
  { sol: ['#b89a62', '#a88a52'], lisse: '#f2ece0', toit: ['#e6dfd0', '#a99f8a'], lum: '#ffe0a0', foule: 1 },     // le cirque de marbre
  { sol: ['#2f6a34', '#285e2e'], lisse: '#f4efe4', toit: ['#3a3f46', '#d2a53e'], lum: '#ffd890', foule: 1 },     // la fonte et le gaz
  { sol: ['#1c2a36', '#17232e'], lisse: '#ff6fb5', toit: ['#14161c', '#ff6fb5'], lum: '#6ff0ff', foule: 1 },     // le néon
  { sol: ['#123038', '#0f2930'], lisse: '#5af0b4', toit: ['#0f2a26', '#7fdcb8'], lum: '#5af0b4', foule: 1 },
  { sol: ['#2a2214', '#231c10'], lisse: '#ffcd78', toit: ['#3a2c14', '#ffd99a'], lum: '#ffcd78', foule: 1 },
  { sol: ['#201a34', '#1a152c'], lisse: '#aa8cff', toit: ['#1c1530', '#c9b4ff'], lum: '#aa8cff', foule: 1 },
];
export const pisteOf = (band) => PISTES[Math.max(0, Math.min(PISTES.length - 1, band | 0))];

// bayer, mix (hex → hex) et le hash 2D [0,1) (`h32` ici) : importés en tête de module.

// Les chiffres des stalles (3 × 5).
const CHIFFRES = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
};

// Peint la piste de l'âge (W × trackHeight()). Le ciel est TOUJOURS de nuit : la
// Maison est hors du temps.
export function paintTrack(put, W, band, n = 6) {
  const P = pisteOf(band);
  const H = trackHeight(n);
  const yTrib = TRACK.ciel, yPre = TRACK.ciel + TRACK.tribune, ySol = yPre + TRACK.marge;
  // Le ciel de nuit et ses étoiles.
  for (let y = 0; y < yTrib; y += 1) for (let x = 0; x < W; x += 1) {
    let c = mix('#0a0b1c', '#1c1230', y / Math.max(1, yTrib));
    if (h32(x, y + 77) > 0.985) c = '#f4efe4';
    put(x, y, c);
  }
  // La tribune : le toit (festonné), la foule sous les lumières, la lisse.
  for (let x = 0; x < W; x += 1) {
    const raye = Math.floor(x / 4) % 2 === 0;
    put(x, yTrib, P.toit[raye ? 0 : 1]);
    put(x, yTrib + 1, P.toit[raye ? 0 : 1]);
    if (x % 4 !== 0) put(x, yTrib + 2, mix(P.toit[raye ? 0 : 1], '#000000', 0.35));
    else put(x, yTrib + 2, mix('#0a0b1c', '#1c1230', 0.9));
  }
  for (let y = yTrib + 3; y < yPre - 1; y += 1) for (let x = 0; x < W; x += 1) {
    // La foule : des têtes et des chapeaux en désordre, plus claires sous les lampes.
    const lampe = Math.abs(((x + 8) % 24) - 12) / 12;
    let c = mix('#1a1218', '#3a2a30', 1 - lampe);
    const r = h32(x, y);
    if (r < 0.32 * P.foule) c = mix(['#d8b48a', '#a8784e', '#6a4a36', '#e8c8a8'][Math.floor(r * 40) % 4], '#000000', 0.25 + lampe * 0.4);
    else if (r < 0.46 * P.foule) c = mix(['#8e2a2a', '#2a4a8e', '#d2a53e', '#5a2a6e', '#2a6e4a'][Math.floor(r * 77) % 5], '#000000', 0.3 + lampe * 0.4);
    put(x, y, c);
  }
  // Les lampes de la tribune.
  for (let x = 4; x < W; x += 24) {
    put(x, yTrib + 3, P.lum);
    put(x - 1, yTrib + 3, mix(P.lum, '#1a1218', 0.5));
    put(x + 1, yTrib + 3, mix(P.lum, '#1a1218', 0.5));
    put(x, yTrib + 4, mix(P.lum, '#1a1218', 0.6));
  }
  // La lisse du fond.
  for (let x = 0; x < W; x += 1) put(x, yPre - 1, x % 3 === 2 ? mix(P.lisse, '#000000', 0.5) : P.lisse);
  // Le pré du fond : le sol de la piste, plus sombre, sous la lisse.
  for (let y = yPre; y < ySol; y += 1) for (let x = 0; x < W; x += 1) {
    let c = mix(P.sol[1], '#000000', 0.22 - (y - yPre) * 0.02);
    if (bayer(x, y) < 0.1) c = mix(c, '#000000', 0.2);
    put(x, y, c);
  }
  // Les couloirs : deux tons alternés, tramés, et la lisse pointillée entre eux.
  for (let i = 0; i < n; i += 1) {
    const y0 = ySol + i * TRACK.couloir;
    for (let y = y0; y < y0 + TRACK.couloir; y += 1) for (let x = 0; x < W; x += 1) {
      let c = P.sol[i % 2];
      if (bayer(x, y) < 0.12) c = mix(c, '#000000', 0.18);
      // La lumière des lampes tombe en flaques sur la piste.
      const lampe = Math.abs(((x + 8) % 24) - 12) / 12;
      if (lampe < 0.35 && bayer(x, y) < (0.35 - lampe) * 0.6) c = mix(c, P.lum, 0.12);
      put(x, y, c);
    }
    if (i > 0) for (let x = 0; x < W; x += 2) put(x, y0, mix(P.lisse, P.sol[i % 2], 0.45));
  }
  // La lisse avant (au premier plan) : des poteaux et une main courante.
  const yDev = ySol + n * TRACK.couloir;
  for (let y = yDev; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    let c = mix('#0e0a0c', P.sol[0], 0.25);
    if (y === yDev) c = P.lisse;
    else if (y === yDev + 1) c = mix(P.lisse, '#000000', 0.45);
    else if (x % 8 === 0) c = mix(P.lisse, '#000000', 0.35);
    put(x, y, c);
  }
  // La stalle de départ : un portique par couloir, son numéro peint.
  const xs = TRACK.depart + 1;
  for (let i = 0; i < n; i += 1) {
    const y0 = ySol + i * TRACK.couloir;
    for (let y = y0; y < y0 + TRACK.couloir; y += 1) put(xs, y, '#d8d2c4');
    const cas = CASAQUES[i % CASAQUES.length];
    const yp = y0 + Math.max(1, Math.floor((TRACK.couloir - 7) / 2));
    for (let y = yp; y < yp + 7; y += 1) for (let x = 1; x < 6; x += 1) put(x, y, cas.S);
    const g = CHIFFRES[i + 1];
    if (g) g.forEach((row, yy) => row.split('').forEach((ch, xx) => { if (ch === '#') put(2 + xx, yp + 1 + yy, cas.H); }));
  }
  // Le poteau d'arrivée : la ligne en damier, sa colonne et son disque dans la tribune.
  const xa = W - TRACK.arrivee;
  for (let y = yPre; y < yDev; y += 1) {
    put(xa, y, ((y >> 1) & 1) ? '#f4efe4' : '#141418');
    put(xa + 1, y, ((y >> 1) & 1) ? '#141418' : '#f4efe4');
  }
  for (let y = yTrib - 3; y < yPre; y += 1) put(xa + 2, y, '#f4efe4');
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) put(xa + 2 + dx, yTrib - 4 + dy, dx === 0 && dy === 0 ? '#d23a32' : '#f4efe4');
}

// ── La course, dans le temps ─────────────────────────────────────────────────
// Le déroulé d'une course jouée : l'ordre d'arrivée est celui du moteur (tiré avant) ;
// chaque coureur reçoit son temps d'arrivée (le gagnant d'abord, les suivants à des
// écarts tirés), et une allure (en tête puis rattrapé, ou finisseur) qui fait les
// changements de tête en route. `rand` : un tirage [0, 1).
export const COURSE_MS = 6200;
export function planCourse(ordre, rand = Math.random) {
  const plan = {};
  let t = COURSE_MS;
  ordre.forEach((couloir, rang) => {
    if (rang > 0) t += 110 + rand() * 380;
    plan[couloir] = {
      fin: t,
      allure: 0.78 + rand() * 0.5,      // < 1 : part vite ; > 1 : finit fort
      mele: rand() * 0.6,               // la part d'allure « régulière »
      phase: Math.floor(rand() * 4),
      rang,
    };
  });
  const [a, b] = ordre;
  plan.photo = b != null && plan[b].fin - plan[a].fin < 160;
  return plan;
}
// La part de la piste couverte à `ms` (0 → 1 à l'arrivée, puis le petit galop d'après).
export function avance(p, ms) {
  if (ms <= 0) return 0;
  const u = ms / p.fin;
  if (u >= 1) return 1 + Math.min(0.08, (ms - p.fin) / 9000);
  const lisse = u * u * (3 - 2 * u);
  return (1 - p.mele) * Math.pow(u, p.allure) + p.mele * lisse;
}
// L'image de galop à `ms` (le coureur ralentit après la ligne, puis s'arrête).
export function imageAt(p, ms) {
  const pas = ms < p.fin ? 85 : ms < p.fin + 900 ? 130 : 0;
  if (!pas) return 2;
  return (Math.floor(ms / pas) + p.phase) % RACER_FRAMES;
}
