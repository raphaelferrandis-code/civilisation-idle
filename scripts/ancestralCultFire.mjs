// ancestralCultFire.mjs — remet la bande de feu du Culte des ancêtres (stade 0) au
// propre, et recompose le repli statique.
//
//   POURQUOI. La bande `ancestralcult-fire.png` ne portait pas QUE le feu : la
//   découpe d'origine (2026-07) avait pris un rectangle de la scène, donc la bande
//   trimballait un morceau de la galette de sol saumon et les pierres du foyer,
//   CUITS dedans et rejoués à chaque frame. Symétriquement, la couche `-back` avait
//   un trou noir à l'emplacement du feu gommé. Les deux couches se recouvraient,
//   ça ne se voyait pas — jusqu'à ce qu'on regarde `-back` seule.
//
//   Une bande de feu doit être de la FLAMME et rien d'autre, comme `watch-fire`
//   (mesuré : 3 teintes, toutes de la rampe). Ce script rétablit ça :
//     1. ne garde que les pixels de public/pixelart/fire-ramp.json ;
//     2. donne un cœur incandescent aux pixels les plus ENFOUIS de la flamme — un
//        pixel dont tout le voisinage r=1 est opaque passe en or-de-coeur, r=2 en
//        coeur-blanc. La flamme d'origine n'avait aucun des deux pas les plus
//        clairs de la rampe : elle brûlait plate.
//        ⚠ NE PAS utiliser `reflame.mjs --mask all` ici : il répartit par RANG de
//        luminance, et la source n'a que 4 tons — les 328 px du corps orange
//        partaient d'un bloc en blanc.
//     3. assoit la flamme dans le foyer du nouveau cercle : base à SEAT_Y, axe à
//        SEAT_X. Position ABSOLUE et non décalage, pour que relancer ne dérive pas.
//   Puis recompose `ancestralcult-prop.png` = `-back` + frame 0, le repli servi
//   tant que la bande n'est pas chargée.
//
//   Garde : src/game/map/__tests__/flameHue.test.js (plancher de rampe) et
//   flameGlow.test.js, qui RE-MESURE le foyer des PNG et le confronte à
//   ANIM_FIRE_CORES dans cityEngineSprites.js — déplacer la flamme sans y reporter
//   fx/fy/sig fait tomber la garde.
//
//   Lancer : node scripts/ancestralCultFire.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUB = path.join(ROOT, 'public', 'pixelart');
const DIR = path.join(PUB, 'agents', 'buildings');
const DRY = process.argv.includes('--dry');

const RAMP = JSON.parse(fs.readFileSync(path.join(PUB, 'fire-ramp.json'), 'utf8'));
const STEPS = RAMP.steps.map((s) => s.hex.toLowerCase());
const RAMP_SET = new Set(STEPS);
const GOLD = STEPS[6];   // or-de-coeur
const WHITE = STEPS[7];  // coeur-blanc
const BODY = STEPS[5];   // orange-ardent — le ton le plus clair que porte la source

const FW = 96, FH = 80, FRAMES = 7;
const SEAT_X = 48, SEAT_Y = 47;   // axe et base de la flamme dans le foyer du cercle

const png = PNG.sync.read(fs.readFileSync(path.join(DIR, 'ancestralcult-fire.png')));
const { width: W, data: D } = png;
const hexAt = (x, y) => {
  const i = (y * W + x) * 4;
  if (D[i + 3] < 128) return null;
  return `#${[D[i], D[i + 1], D[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const setAt = (x, y, hex) => {
  const i = (y * W + x) * 4;
  D[i] = parseInt(hex.slice(1, 3), 16); D[i + 1] = parseInt(hex.slice(3, 5), 16); D[i + 2] = parseInt(hex.slice(5, 7), 16);
};

// 1. flamme seule
let stripped = 0;
for (let i = 0; i < D.length; i += 4) {
  if (D[i + 3] < 128) { D[i + 3] = 0; continue; }
  const hex = `#${[D[i], D[i + 1], D[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  if (!RAMP_SET.has(hex)) { D[i + 3] = 0; stripped += 1; }
}

// 2. cœur incandescent
const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < FH && D[(y * W + x) * 4 + 3] >= 128;
const buried = (x, y, r) => {
  for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) if (!opaque(x + dx, y + dy)) return false;
  return true;
};
const promote = [];
for (let y = 0; y < FH; y += 1) for (let x = 0; x < W; x += 1) {
  if (hexAt(x, y) !== BODY) continue;
  if (buried(x, y, 2)) promote.push([x, y, WHITE]);
  else if (buried(x, y, 1)) promote.push([x, y, GOLD]);
}
for (const [x, y, hex] of promote) setAt(x, y, hex);

// 3. assise : position ABSOLUE, mesurée sur l'ensemble des frames pour que toutes
//    bougent du même pas (sinon la flamme sauterait d'une frame à l'autre).
let bx0 = FW, bx1 = -1, by1 = -1;
for (let f = 0; f < FRAMES; f += 1) for (let y = 0; y < FH; y += 1) for (let x = 0; x < FW; x += 1) {
  if (D[(y * W + f * FW + x) * 4 + 3] < 128) continue;
  if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y > by1) by1 = y;
}
const dx = SEAT_X - Math.round((bx0 + bx1) / 2), dy = SEAT_Y - by1;
if (dx || dy) {
  const src = Buffer.from(D), out = Buffer.alloc(D.length);
  for (let f = 0; f < FRAMES; f += 1) for (let y = 0; y < FH; y += 1) for (let x = 0; x < FW; x += 1) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue;
    const s = (y * W + f * FW + x) * 4, d = (ny * W + f * FW + nx) * 4;
    for (let c = 0; c < 4; c += 1) out[d + c] = src[s + c];
  }
  D.set(out);
}

const census = new Map();
for (let i = 0; i < D.length; i += 4) {
  if (D[i + 3] < 128) continue;
  const hex = `#${[D[i], D[i + 1], D[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  census.set(hex, (census.get(hex) || 0) + 1);
}
const total = [...census.values()].reduce((a, b) => a + b, 0);
console.log(`bande : ${stripped} px hors rampe retirés · cœur ${promote.length} px · assise dx=${dx} dy=${dy}`);
console.log(`        ${total} px de rampe (plancher du test : 500) — ${[...census.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}:${n}`).join(' ')}`);

if (DRY) { console.log('--dry : rien écrit'); process.exit(0); }
fs.writeFileSync(path.join(DIR, 'ancestralcult-fire.png'), PNG.sync.write(png));

// repli statique = cercle + frame 0
const back = PNG.sync.read(fs.readFileSync(path.join(DIR, 'ancestralcult-back.png')));
const prop = new PNG({ width: FW, height: FH });
for (let y = 0; y < FH; y += 1) for (let x = 0; x < FW; x += 1) {
  const o = (y * FW + x) * 4, b = o, f = (y * W + x) * 4;
  if (D[f + 3] >= 128) for (let c = 0; c < 4; c += 1) prop.data[o + c] = D[f + c];
  else if (back.data[b + 3] >= 128) for (let c = 0; c < 4; c += 1) prop.data[o + c] = back.data[b + c];
  else prop.data[o + 3] = 0;
}
fs.writeFileSync(path.join(DIR, 'ancestralcult-prop.png'), PNG.sync.write(prop));


// ── PALIER DE HALLE (spanSum ≥ 6) : la flamme du GRAND cercle ────────────────
//   Quand le lot du culte atteint l'empreinte 3, `blitProp` sert
//   `ancestralcult-back-grand` (192×160) à la place du cercle 96×80, et la bande
//   DOIT suivre : substituer la seule couche du fond laisserait la flamme à
//   l'échelle et à la place du petit, donc à côté de son foyer.
//
//   ⛔ Ce qui NE marche pas : agrandir la bande, même en Scale2x. Essayé, regardé :
//   la flamme devient une fourche creuse dont les pixels font le double de ceux
//   des pierres — c'est-à-dire exactement le défaut de grain que la campagne
//   d'égalisation combat, réintroduit dans le sprite censé le corriger.
//   Ce qu'on garde du petit, c'est ce qui y a été DESSINÉ : la silhouette et son
//   mouvement (7 images). On les REMATÉRIALISE à la résolution du grand :
//     1. le masque est rééchantillonné en bilinéaire puis seuillé — un contour
//        propre à la résolution cible, pas des blocs de 2×2 ;
//     2. l'ombrage est REFAIT : chaque pixel reçoit un pas de rampe selon sa
//        PROFONDEUR sous le contour (+ un bonus de bas de flamme), et les
//        proportions de chaque pas sont celles MESURÉES sur le petit (55 % de
//        rouge-feu, 24 % d'orange…). Un cœur qui garderait ses 63 px du petit
//        deviendrait une tache ; réattribuer par rang le garde à sa taille.
//   Aucune couleur inventée : la rampe est la seule source (garde flameHue).
const FWG = 192, FHG = 160;
// Largeur du BOL du foyer : 21 px sur le stade 0 (x38..58), 32 sur le palier
// (x81..112, cf. la passe cendres de fetchProps). Dans le petit, la flamme fait
// EXACTEMENT la largeur de son bol — on garde ce rapport, donc ×1,52 et non ×2.
// Effet de bord heureux : à 0,605 px/px de densité de palier contre 0,84 pour
// l'atelier, la flamme garde ainsi sa taille À L'ÉCRAN. C'est le CERCLE qui
// grandit, pas le feu.
const KG = 32 / 21;
// Assise dans le foyer du grand, en ABSOLU (jamais un décalage : relancer le
// script ne doit pas faire dériver la flamme). Axe = centre du foyer mesuré
// (x76..117) ; base = 56 % de sa hauteur (y74..103), la fraction que la flamme
// du petit occupe dans le sien (base y47 dans un foyer y37..54).
const SEAT_XG = 96, SEAT_YG = 91;
// Poids du bas de flamme dans le classement des pixels chauds. 0 = ombrage
// purement concentrique (effet oignon) ; trop haut = la flamme brûle par le pied
// et son sommet devient noir. 2 pas de rampe de bonus entre le sommet et la base.
const LAMBDA = 2;

const dedans = (f, x, y) => x >= 0 && y >= 0 && x < FW && y < FH && D[(y * W + f * FW + x) * 4 + 3] >= 128;
// Pas de rampe du plus CHAUD au plus froid, avec la part que chacun occupe dans
// la bande du petit. Un pas absent (vermillon, braise-éteinte) a une part nulle
// et ne sort donc jamais.
const ordre = [7, 6, 5, 4, 3, 2, 1, 0]
  .map((k) => ({ hex: STEPS[k], part: (census.get(STEPS[k]) || 0) / total }))
  .filter((p) => p.part > 0);

const grand = new PNG({ width: FWG * FRAMES, height: FHG });
const GW = grand.width;
for (let f = 0; f < FRAMES; f += 1) {
  // 1. masque rééchantillonné (bilinéaire sur le masque binaire, seuil 0,5)
  const masque = new Uint8Array(FWG * FHG);
  for (let y = 0; y < FHG; y += 1) for (let x = 0; x < FWG; x += 1) {
    const sx = (x + 0.5) / KG - 0.5, sy = (y + 0.5) / KG - 0.5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), tx = sx - x0, ty = sy - y0;
    const v = (dedans(f, x0, y0) ? (1 - tx) * (1 - ty) : 0)
      + (dedans(f, x0 + 1, y0) ? tx * (1 - ty) : 0)
      + (dedans(f, x0, y0 + 1) ? (1 - tx) * ty : 0)
      + (dedans(f, x0 + 1, y0 + 1) ? tx * ty : 0);
    if (v >= 0.5) masque[y * FWG + x] = 1;
  }
  // 2. profondeur sous le contour (BFS 4-connexe depuis les pixels de bord)
  const prof = new Int16Array(FWG * FHG);
  const file = [];
  const dansMasque = (x, y) => x >= 0 && y >= 0 && x < FWG && y < FHG && masque[y * FWG + x] === 1;
  for (let y = 0; y < FHG; y += 1) for (let x = 0; x < FWG; x += 1) {
    if (!dansMasque(x, y)) continue;
    if (!dansMasque(x - 1, y) || !dansMasque(x + 1, y) || !dansMasque(x, y - 1) || !dansMasque(x, y + 1)) {
      prof[y * FWG + x] = 1; file.push([x, y]);
    }
  }
  for (let t = 0; t < file.length; t += 1) {
    const [x, y] = file[t];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!dansMasque(nx, ny) || prof[ny * FWG + nx]) continue;
      prof[ny * FWG + nx] = prof[y * FWG + x] + 1; file.push([nx, ny]);
    }
  }
  // 3. classement : profond et bas = chaud
  let hy0 = FHG, hy1 = -1;
  for (const [, y] of file) { if (y < hy0) hy0 = y; if (y > hy1) hy1 = y; }
  const hauteur = Math.max(1, hy1 - hy0);
  const rangs = file.map(([x, y]) => ({ x, y, s: prof[y * FWG + x] + LAMBDA * ((y - hy0) / hauteur) }));
  rangs.sort((a, b) => b.s - a.s || a.y - b.y || a.x - b.x);
  let i = 0;
  for (const pas of ordre) {
    const n = pas === ordre[ordre.length - 1] ? rangs.length - i : Math.round(pas.part * rangs.length);
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(pas.hex.slice(k, k + 2), 16));
    for (let k = 0; k < n && i < rangs.length; k += 1, i += 1) {
      const o = (rangs[i].y * GW + f * FWG + rangs[i].x) * 4;
      grand.data[o] = r; grand.data[o + 1] = g; grand.data[o + 2] = b; grand.data[o + 3] = 255;
    }
  }
}

// 4. assise ABSOLUE, mesurée sur toutes les frames à la fois (sinon la flamme
//    sauterait d'une image à l'autre).
const G = grand.data;
let gx0 = FWG, gx1 = -1, gy1 = -1;
for (let f = 0; f < FRAMES; f += 1) for (let y = 0; y < FHG; y += 1) for (let x = 0; x < FWG; x += 1) {
  if (G[(y * GW + f * FWG + x) * 4 + 3] < 128) continue;
  if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (y > gy1) gy1 = y;
}
const gdx = SEAT_XG - Math.round((gx0 + gx1) / 2), gdy = SEAT_YG - gy1;
if (gdx || gdy) {
  const src = Buffer.from(G), out = Buffer.alloc(G.length);
  for (let f = 0; f < FRAMES; f += 1) for (let y = 0; y < FHG; y += 1) for (let x = 0; x < FWG; x += 1) {
    const nx = x + gdx, ny = y + gdy;
    if (nx < 0 || ny < 0 || nx >= FWG || ny >= FHG) continue;
    const s = (y * GW + f * FWG + x) * 4, d = (ny * GW + f * FWG + nx) * 4;
    for (let c = 0; c < 4; c += 1) out[d + c] = src[s + c];
  }
  G.set(out);
}
const cenG = new Map();
for (let i = 0; i < G.length; i += 4) {
  if (G[i + 3] < 128) continue;
  const hex = `#${[G[i], G[i + 1], G[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  cenG.set(hex, (cenG.get(hex) || 0) + 1);
}
const totalG = [...cenG.values()].reduce((a, b) => a + b, 0);
console.log(`palier : flamme ${gx1 - gx0 + 1} px de large (bol 32) · assise dx=${gdx} dy=${gdy}`);
console.log(`         ${totalG} px de rampe (plancher du test : 1200) — ${[...cenG.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}:${n}`).join(' ')}`);
fs.writeFileSync(path.join(DIR, 'ancestralcult-fire-grand.png'), PNG.sync.write(grand));
console.log('écrit : ancestralcult-fire.png + ancestralcult-prop.png + ancestralcult-fire-grand.png');
