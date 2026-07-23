// sliceUiChrome.mjs — decoupe la planche PixelLab « cle grecque » en chrome d'UI
// etirable (ce que le jeu n'avait pas : cf. docs/ui-references.md).
//
//   Source : docs/concepts/ui-panneau/pixellab-cle-grecque-512.png (planche 512²).
//   Sorties dans public/pixelart/ui/chrome/ :
//     panel-greek.png  — cadre 9-slice du panneau central
//     gauge-frame.png  — jonc 9-slice de la barre (jauge de Rupture)
//
// METHODE (la meme que sliceAqueduct.mjs : scene coherente -> decoupe).
//
// 1. On EVIDE l'interieur (remplissage par diffusion depuis le centre) : le cadre
//    ne doit peindre que son anneau, le fond reste celui du panneau en CSS. Les
//    creux du meandre sont enclos par le contour sombre, la diffusion s'y arrete
//    donc toute seule et le motif garde son ardoise.
//
// 2. On RESSERRE le milieu a UNE periode de motif. Le meandre a une periode
//    mesuree de 19 px (autocorrelation des colonnes de la bande haute). C'est ce
//    qui rend `border-image ... round` propre : le navigateur redimensionne la
//    tuile du milieu pour en faire tenir un nombre entier, et l'erreur est de
//    l'ordre de 0,5 % sur une tuile de 19 px la ou elle serait de 8 % sur la
//    bande entiere de 133 px. On enleve donc 6 periodes pleines (114 px) au
//    milieu, en largeur comme en hauteur : la phase du motif est conservee, donc
//    la jonction coin -> tuile reste continue.
//
//    Les emprises des ornements d'angle ont ete mesurees sur la planche
//    (profondeur du cuivre par colonne) : l'angle gauche s'arrete a 45 px, le
//    droit reprend a 181 px = 48 + 7x19. D'ou des tranches ASYMETRIQUES
//    48/40/42/48 — c'est du dessin a la main, pas une grille.
//
// Lancer : node scripts/sliceUiChrome.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'docs', 'concepts', 'ui-panneau', 'pixellab-cle-grecque-512.png');
const OUT = path.join(ROOT, 'public', 'pixelart', 'ui', 'chrome');

if (!fs.existsSync(SRC)) { console.error(`manque ${SRC}`); process.exit(1); }
const sheet = PNG.sync.read(fs.readFileSync(SRC));

/** Recadre une zone de la planche dans un PNG neuf. */
function crop(src, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * src.width + (x0 + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

/**
 * Evide le champ interieur par diffusion depuis un germe. « Interieur » = ardoise
 * opaque (bleutee et pas tres sombre) ; le cuivre (r-b > 26) et le contour sombre
 * font barrage, ce qui preserve le meandre et son ardoise enclose.
 */
function hollow(png, seedX, seedY) {
  const { width: W, height: H, data } = png;
  const isField = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    return a >= 24 && r - b <= 26 && r + g + b >= 150;
  };
  const seen = new Uint8Array(W * H);
  const start = seedY * W + seedX;
  if (!isField(start * 4)) { console.warn('germe hors du champ interieur'); return 0; }
  const stack = [start];
  seen[start] = 1;
  let n = 0;
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0;
    n++;
    const px = p % W, py = (p / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (seen[q] || !isField(q * 4)) continue;
      seen[q] = 1; stack.push(q);
    }
  }
  return n;
}

/** Supprime une bande verticale [a, b[ et une bande horizontale [c, d[ (resserrage). */
function shrink(png, cutX, cutW, cutY, cutH) {
  const W = png.width, H = png.height;
  const nw = W - cutW, nh = H - cutH;
  const out = new PNG({ width: nw, height: nh });
  const srcX = (x) => (x < cutX ? x : x + cutW);
  const srcY = (y) => (y < cutY ? y : y + cutH);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const si = (srcY(y) * W + srcX(x)) * 4;
      const di = (y * nw + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });

// ── 1. Panneau : planche (145,145) 221x223 ───────────────────────────────────
const PERIOD = 19;          // periode du meandre, mesuree par autocorrelation
const KEEP = 1;             // periodes gardees au milieu
const L = 48, R = 40, T = 48, B = 42;

let panel = crop(sheet, 145, 145, 221, 223);
const filled = hollow(panel, 110, 111);
// milieu horizontal : x = [L, 221-R[ = 133 px = 7 periodes -> on en retire 6
panel = shrink(
  panel,
  L + PERIOD * KEEP, PERIOD * (7 - KEEP),
  T + PERIOD * KEEP, PERIOD * (7 - KEEP),
);
fs.writeFileSync(path.join(OUT, 'panel-greek.png'), PNG.sync.write(panel));
console.log(`panel-greek.png ${panel.width}x${panel.height} — champ evide ${filled} px`);
console.log(`  border-image-slice: ${T} ${R} ${B} ${L}`);

// ── 2. Barre / jauge : planche (109,96) 294x33 ───────────────────────────────
// Jonc plein sur tout le pourtour, capuchons arrondis aux deux bouts. Tranches
// mesurees sur la planche : 5 px en haut/bas, 9 a gauche, 10 a droite.
//
// On ne resserre QU'EN LARGEUR. Les capuchons sont des COURBES sur toute la
// hauteur : couper leur milieu vertical les decapiterait (essai fait, la barre
// devenait une pastille). La hauteur reste donc 33 px, ce qui impose a l'element
// une hauteur de 33 px pour que les capuchons tombent au 1:1.
//
// DEUX PIEGES, tous deux vus en jeu et pas au decoupage :
//
//  a) La colonne du milieu se prend au CENTRE de la barre source (x=147), pas
//     juste apres le capuchon. A x=9-10 le jonc est encore en transition : ses
//     deux colonnes different (cuivre puis contour sombre), et `stretch` les
//     etale en deux moities -> le jonc changeait de ton pile au milieu de la
//     barre, ce qui se lisait comme un cadre autour des paliers. Une SEULE
//     colonne au milieu rend la couture impossible par construction.
//
//  b) Le capuchon GAUCHE perd son contour sombre interieur sur la hauteur du
//     champ. Le remplissage passe DERRIERE le jonc (surcouche ::after, cf.
//     views-city.css), mais ce contour, lui, se peignait par-dessus : il restait
//     une bande noire d'1 px entre la pierre et la couleur, mesuree a l'encre
//     (#010505 a x=8). On efface donc tout ce qui est sombre ou transparent
//     depuis l'interieur jusqu'au premier pixel de pierre : la couleur vient
//     epouser la silhouette du montant, creux compris.
//     Le capuchon DROIT garde son contour : de ce cote le remplissage s'arrete
//     au bord du chenal (sa largeur est un % du chenal), il ne passe pas
//     derriere, et l'effacer ouvrirait le noir du chenal a 100 %.
const BL = 9, BR = 10, BT = 5, BB = 5;
const MID_X = 147;   // colonne de jonc droit, prise au centre de la barre
const MID_W = 1;
const bar0 = crop(sheet, 109, 96, 294, 33);
const barFilled = hollow(bar0, 147, 16);

const BH = 33;
const bar = new PNG({ width: BL + MID_W + BR, height: BH });
const copyCols = (dstX, srcX, n) => {
  for (let y = 0; y < BH; y++) {
    for (let i = 0; i < n; i++) {
      const si = (y * bar0.width + (srcX + i)) * 4;
      const di = (y * bar.width + (dstX + i)) * 4;
      for (let c = 0; c < 4; c++) bar.data[di + c] = bar0.data[si + c];
    }
  }
};
copyCols(0, 0, BL);
copyCols(BL, MID_X, MID_W);
copyCols(BL + MID_W, 294 - BR, BR);

// (b) contour interieur du capuchon gauche efface sur la hauteur du champ
const px = (x, y) => (y * bar.width + x) * 4;
const isStone = (i) => bar.data[i + 3] >= 24
  && bar.data[i] + bar.data[i + 1] + bar.data[i + 2] >= 150;
let cleared = 0;
for (let y = BT; y < BH - BB; y++) {
  for (let x = BL - 1; x >= 0 && !isStone(px(x, y)); x--) {
    if (bar.data[px(x, y) + 3] !== 0) cleared++;
    bar.data[px(x, y) + 3] = 0;
  }
}

fs.writeFileSync(path.join(OUT, 'gauge-frame.png'), PNG.sync.write(bar));
console.log(`gauge-frame.png ${bar.width}x${bar.height} — champ evide ${barFilled} px, contour interieur gauche efface ${cleared} px`);
console.log(`  border-image-slice: ${BT} ${BR} ${BB} ${BL}`);
