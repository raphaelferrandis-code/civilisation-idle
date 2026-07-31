// snowTrees.mjs — VERSION D'HIVER des sprites de végétation iso.
//   public/pixelart/iso/{tree-1..4,bush-1..6}.png → …-winter.png
//   Lancer :  node scripts/snowTrees.mjs            (--dry pour ne rien écrire)
//
// POURQUOI DÉRIVER AU LIEU DE GÉNÉRER
// ───────────────────────────────────
// Le sol d'hiver est arrivé en sprites dédiés (fetchGroundTiles, lot 34e3e8ab) et
// la carte marche : la neige est CUITE dans l'art, elle ne clignote pas au pan.
// Les arbres, eux, restaient l'été teinté d'un gris à 0,34 — mesuré, ça ne les
// change que de 10 % en valeur, d'où des feuillus lime posés sur de la neige.
// Demande de Raph (2026-07-31) : « les arbres enneigés, reprends les sprites pour
// coller au maximum ».
//
// « Coller au maximum » exclut de REDESSINER les arbres : une génération PixelLab
// rendrait d'autres silhouettes, et le pied mesuré de chaque variante (footCx /
// footW dans isoPlaza) est un contrat — la margelle des places est centrée
// dessus. On DÉRIVE donc : silhouette au pixel près, mêmes troncs, même
// couronne ; on n'ajoute que ce que l'hiver ajoute vraiment, de la neige sur les
// surfaces qui voient le ciel.
//
// La neige reprend la RAMPE DU SOL D'HIVER, relevée sur les PNG livrés (les trois
// tons dominants de iso-grass-winter-*) : deux matières enneigées côte à côte qui
// ne partagent pas leur blanc se lisent comme deux hivers différents.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const DIR = 'public/pixelart/iso';
const SPRITES = [
  'tree-1', 'tree-2', 'tree-3', 'tree-4',
  'bush-1', 'bush-2', 'bush-3', 'bush-4', 'bush-5', 'bush-6',
];

// Rampe de neige — tons DOMINANTS mesurés sur iso-grass-winter-1..4 (1772 / 428 /
// 217 pixels). Ne pas « améliorer » ces valeurs à l'œil : c'est leur identité
// avec le sol qui fait tenir l'image.
const SNOW = [
  [222, 234, 234],   // crête éclairée
  [201, 217, 220],   // corps
  [173, 190, 196],   // retombée / ombre propre
];

// HIVER DU FEUILLAGE. La teinte du moteur (rgba(178,186,190,0.34) en multiply)
// ne retire que 10 % de valeur : sous la neige, le lime d'été reste du lime
// d'été. On désature vers la luminance du pixel LUI-MÊME (le vert ne vire donc
// pas au gris uniforme : un conifère sombre reste plus sombre qu'un feuillu) puis
// on refroidit d'un ton bleuté. Les deux curseurs sont ici, pas dans le moteur :
// une fois cuit, l'hiver ne coûte plus rien à l'affichage.
const DESAT = 0.42;                 // part de gris (luminance propre du pixel)
const COOL = [168, 184, 196];       // ton froid multiplié…
const COOL_A = 0.30;                // …à cette force
const DARKEN = 0.94;                // le jour d'hiver est bas

// OÙ LA NEIGE TIENT — c'est le DESSIN qui le dit, pas la silhouette.
//
// 1re version : dépôt sur les « rebords », c'est-à-dire les transitions vide →
// matière colonne par colonne. Résultat mesuré : 6 % de l'encre, et uniquement le
// long du contour — un liseré blanc, pas de la neige. Un conifère dense n'a AUCUNE
// transition à l'intérieur de sa couronne, donc ses étages restaient nus, alors
// que ce sont eux qui font lire « sapin sous la neige ».
//
// Ce qu'il fallait lire : les FACES TOURNÉES VERS LE CIEL sont déjà dans le
// sprite — l'auteur les a peintes CLAIRES. Prendre le quantile haut de luminance
// du feuillage met donc la neige exactement là où la lumière tombe, étage par
// étage, sans rien deviner de la géométrie. C'est aussi ce qui « colle au
// maximum » : on ne réinvente pas le volume, on relit celui qui est dessiné.
// La charge de neige se règle en SURFACE VISÉE, pas en quantile. Un quantile de
// luminance suppose que chaque sprite a la même richesse de tons — or tree-2 n'a
// que trois verts : son quantile haut est un TON ENTIER, donc un chapeau de
// champignon blanc, quand le sapin tree-3 se pique joliment étage par étage
// (mesuré au même réglage : 67 % de l'encre contre 42 %). On cherche donc le
// seuil qui donne la même charge partout, par dichotomie sur le score.
const SNOW_TARGET = 0.30;           // part de l'encre finalement enneigée
const SUPPORT_MIN = 3;              // voisins clairs exigés (anti-grésil)
// Le score n'est pas la luminance nue : deux biais dirigent la neige là où elle
// tombe vraiment, et c'est ce qui distingue un arbre enneigé d'un arbre saupoudré
// au hasard. HAUTEUR : le bas de la couronne est abrité par le haut, il reste
// vert. CRÊTE : la première ligne opaque d'une colonne porte sa ligne de neige,
// même là où l'auteur l'a peinte sombre — mais en BONUS, pas de force : sur un
// épicéa en aiguilles presque tout pixel est une crête, et l'imposer noyait
// l'arbre (63 % de blanc, silhouette perdue).
const BIAS_Y = 42;                  // pénalité de score du bas de l'encre
const BIAS_X = 10;                  // …et du côté à l'ombre (lumière haut-gauche)
const CREST_BONUS = 34;
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
// Le TRONC ne joue pas dans le quantile : il est brun, donc clair par endroits,
// et il aspirerait la neige au milieu du fût. Il en reçoit quand même par le
// contour (une branche morte enneigée, c'est juste).
const isBark = (r, g, b) => r > g && g >= b && r - b > 24;

function winterize(p) {
  const { width: w, height: h } = p;
  const op = new Uint8Array(w * h);
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    op[i] = p.data[i * 4 + 3] > 16 ? 1 : 0;
    L[i] = lum(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]);
  }
  // 1. Score de dépôt : luminance du dessin, moins la pénalité de hauteur et de
  //    côté, plus le bonus de crête. -Infinity = jamais de neige (tronc, vide).
  let y0 = h, y1 = -1, x0 = w, x1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (!op[y * w + x]) continue;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
  }
  const crest = new Uint8Array(w * h);
  for (let x = 0; x < w; x += 1) for (let y = 0; y < h; y += 1) {
    if (op[y * w + x]) { crest[y * w + x] = 1; break; }
  }
  const score = new Float32Array(w * h).fill(-Infinity);
  const hf = Math.max(1, y1 - y0), wf = Math.max(1, x1 - x0);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x, o = i * 4;
    if (!op[i]) continue;
    if (isBark(p.data[o], p.data[o + 1], p.data[o + 2]) && !crest[i]) continue;
    score[i] = L[i] - BIAS_Y * ((y - y0) / hf) - BIAS_X * ((x - x0) / wf)
      + (crest[i] ? CREST_BONUS : 0);
  }

  // 2. Anti-grésil : un pixel clair isolé au milieu du feuillage n'est pas une
  //    face tournée vers le ciel, c'est un reflet de feuille. On exige un
  //    voisinage retenu — sauf sur la crête, bordée de vide par nature.
  const ink = op.reduce((a, v) => a + v, 0);
  const pick = (thr) => {
    const cand = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) if (score[i] >= thr) cand[i] = 1;
    const set = new Uint8Array(w * h);
    let n = 0;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!cand[i]) continue;
      let k = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { k += 1; continue; }
        const j = ny * w + nx;
        if (!op[j] || cand[j]) k += 1;
      }
      if (k >= SUPPORT_MIN) { set[i] = 1; n += 1; }
    }
    return { set, frac: n / (ink || 1) };
  };
  // 3. Dichotomie sur le seuil : 24 pas suffisent (le score tient dans ~300).
  //    `hi` reste toujours le seuil dont la charge est SOUS la cible — c'est lui
  //    qu'on relit à la fin, sans garder les jeux intermédiaires.
  let lo = -400, hi = 400;
  for (let it = 0; it < 24; it += 1) {
    const mid = (lo + hi) / 2;
    if (pick(mid).frac > SNOW_TARGET) lo = mid; else hi = mid;
  }
  const snowSet = pick(hi).set;

  // 4. Ombrage : le rang d'un pixel de neige est sa PROFONDEUR sous la surface,
  //    comptée vers le haut — une crête est éclairée, le ventre du tas retombe.
  //    Puis la règle de lumière haut-gauche : un pixel dont le voisin EST n'est
  //    pas enneigé regarde l'ombre et descend d'un cran (cf. hue.mjs/light.mjs).
  const out = new PNG({ width: w, height: h });
  let covered = 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x, o = i * 4;
    out.data[o + 3] = p.data[o + 3];
    if (!op[i]) continue;
    if (snowSet[i]) {
      covered += 1;
      let d = 0;
      while (d < SNOW.length - 1 && y - d - 1 >= 0 && snowSet[(y - d - 1) * w + x]) d += 1;
      let rank = d;
      if (x < w - 1 && op[i + 1] && !snowSet[i + 1]) rank = Math.min(SNOW.length - 1, rank + 1);
      for (let c = 0; c < 3; c += 1) out.data[o + c] = SNOW[rank][c];
      continue;
    }
    for (let c = 0; c < 3; c += 1) {
      let v = p.data[o + c] * (1 - DESAT) + L[i] * DESAT;    // désaturation propre
      v *= COOL_A * (COOL[c] / 255) + (1 - COOL_A);          // multiply alpha, cf. canvas
      out.data[o + c] = Math.max(0, Math.min(255, Math.round(v * DARKEN)));
    }
  }
  return { out, covered, ink };
}

const dry = process.argv.includes('--dry');
for (const name of SPRITES) {
  const src = `${DIR}/${name}.png`;
  if (!fs.existsSync(src)) { console.warn(`${name} — absent, ignoré`); continue; }
  const p = PNG.sync.read(fs.readFileSync(src));
  const { out, covered, ink } = winterize(p);
  if (!dry) fs.writeFileSync(`${DIR}/${name}-winter.png`, PNG.sync.write(out));
  console.log(`${name.padEnd(9)} ${p.width}×${p.height} — neige sur ${(100 * covered / ink).toFixed(1)} %`
    + ` de l'encre (${covered} px)${dry ? '  [dry]' : ''}`);
}
