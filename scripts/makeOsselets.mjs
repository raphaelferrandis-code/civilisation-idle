// Génère les OSSELETS (astragales) de la Table des augures — pixel-art AUTHORED
// (pas PixelLab : quota épuisé, arbitrage Raph 2026-07-20 « tente à la main »).
//
//   Sortie : <OUT>/bone-1.png, bone-3.png, bone-4.png, bone-6.png  (32x32, alpha)
//            + contact.png (planche de revue : 6x puis taille réelle 2x)
//
// DA calée sur la fresque du jeu (public/pixelart/ui/augures/osselets.png) :
// ivoire chaud → brun, specular crème, contour brun sombre. Lumière HAUT-GAUCHE
// (règle du projet) : reflet en haut à gauche, ombre en bas à droite.
//
// Les 4 faces reprennent l'anatomie réelle de l'astragale : les deux faces
// LARGES (3 concave, 4 convexe) et les deux faces ÉTROITES (1 le Chien, 6 Vénus).
// Les pips sont GRAVÉS (creux : paroi haut-gauche sombre, lèvre bas-droite qui
// capte la lumière) et suivent la disposition d'un dé — la lisibilité prime sur
// l'exactitude archéologique.
//
//   node scripts/makeOsselets.mjs            → écrit dans public/pixelart/ui/augures/bones
//   OSSELETS_OUT=/tmp/x node scripts/makeOsselets.mjs   → ailleurs (revue)
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT = process.env.OSSELETS_OUT || 'public/pixelart/ui/augures/bones';
const S = 32; // canevas (affiché ×2 = 64px, mise à l'échelle ENTIÈRE obligatoire)

// --- palette (échantillonnée sur la fresque) -------------------------------
// index 0 = contour, 1..6 = rampe ombre → specular
const PAL = [
  [0x2e, 0x20, 0x12], // 0 contour
  [0x4b, 0x34, 0x18], // 1 ombre profonde
  [0x7e, 0x60, 0x34], // 2 ombre
  [0xa3, 0x8c, 0x66], // 3 mi-ton
  [0xc7, 0xb5, 0x99], // 4 base (couleur dominante des os de la fresque)
  [0xe8, 0xdc, 0xc0], // 5 clair
  [0xfd, 0xf8, 0xea], // 6 specular
];
const LAST = PAL.length - 1;

const L = [-0.7071, -0.7071]; // lumière haut-gauche

// --- silhouettes ------------------------------------------------------------
// L'astragale n'est PAS un os à moelle : c'est un BLOC trapu, un cuboïde aux
// arêtes émoussées, pincé en son milieu (la « taille » articulaire) et bosselé
// à deux angles opposés. Superellipse (|x/rx|^n + |y/ry|^n <= 1) pour le corps
// rectangulaire arrondi, moins deux encoches de taille, plus deux bosses.
// La taille est un PINCEMENT LÉGER (~1px) : plus profond, l'os devient un nœud
// papillon. Les bosses restent basses, elles ne font que casser la symétrie.
const BROAD = {
  body: [13.0, 8.8, 3.4],
  waist: [[0, -11.4, 3.6], [0, 11.4, 3.6]], // pincements haut/bas
  knobs: [[-10.2, -4.2, 2.6], [10.2, 4.2, 2.6]], // bosses en diagonale
};
const NARROW = {
  body: [8.8, 13.0, 3.4],
  waist: [[-11.4, 0, 3.6], [11.4, 0, 3.6]],
  knobs: [[-4.2, -10.2, 2.6], [4.2, 10.2, 2.6]],
};

const inside = (shape, x, y) => {
  const [rx, ry, n] = shape.body;
  let hit = Math.pow(Math.abs(x / rx), n) + Math.pow(Math.abs(y / ry), n) <= 1;
  if (hit) {
    for (const [wx, wy, wr] of shape.waist) { // les encoches creusent le corps
      const dx = x - wx, dy = y - wy;
      if (dx * dx + dy * dy <= wr * wr) { hit = false; break; }
    }
  }
  if (hit) return true;
  for (const [kx, ky, kr] of shape.knobs) { // les bosses débordent
    const dx = x - kx, dy = y - ky;
    if (dx * dx + dy * dy <= kr * kr) return true;
  }
  return false;
};

// --- dispositions de pips (grille de dé) ------------------------------------
// Coordonnées en unités « case », centrées sur 0 ; mises à l'échelle par face.
const PIPS = {
  1: [[0, 0]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

// Faces : 3 et 4 sur la face LARGE, 1 et 6 sur la face ÉTROITE (anatomie réelle).
// `curve` : +1 bombé (convexe), -1 creusé (concave), 0 plat.
const FACES = {
  1: { shape: NARROW, curve: 0, gap: [0, 0] },
  3: { shape: BROAD, curve: -1, gap: [6.6, 4.2] },
  4: { shape: BROAD, curve: +1, gap: [5.8, 4.2] },
  6: { shape: NARROW, curve: 0, gap: [3.8, 5.6] },
};

function render(value) {
  const f = FACES[value];
  const png = new PNG({ width: S, height: S });
  const c = (S - 1) / 2;
  const lvl = new Int8Array(S * S).fill(-1); // -1 = vide, 0 = contour, 1..6 = rampe

  // Champ de distance au bord par ÉROSION successive : bandes propres et
  // concentriques (le pixel-art se lit en terrasses, pas en dégradé lisse).
  const isIn = (px, py) => inside(f.shape, px - c, py - c);
  const depth = new Int8Array(S * S);
  const solid = new Uint8Array(S * S);
  for (let y = 0; y < S; y += 1) for (let x = 0; x < S; x += 1) if (isIn(x, y)) solid[y * S + x] = 1;
  let layer = solid.slice();
  for (let step = 1; step <= 8; step += 1) {
    const next = layer.slice();
    for (let y = 0; y < S; y += 1) {
      for (let x = 0; x < S; x += 1) {
        const i = y * S + x;
        if (!layer[i]) continue;
        depth[i] = step;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nxp = x + dx, nyp = y + dy;
          if (nxp < 0 || nyp < 0 || nxp >= S || nyp >= S || !layer[nyp * S + nxp]) { next[i] = 0; break; }
        }
      }
    }
    layer = next;
  }

  // La normale vient du GRADIENT du champ de distance, pas de la direction du
  // centre : le gradient pointe vers l'intérieur, donc -g est la normale de
  // surface. L'arête tournée vers le haut-gauche s'allume, celle tournée vers
  // le bas-droite s'assombrit, et le plateau central (gradient nul) reste au
  // ton de base — c'est ce qui donne le galbe au lieu d'une coupe en diagonale.
  const dAt = (x, y) => (x < 0 || y < 0 || x >= S || y >= S) ? 0 : depth[y * S + x];
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = y * S + x;
      if (!solid[i]) continue;
      const gx2 = dAt(x + 1, y) - dAt(x - 1, y);
      const gy2 = dAt(x, y + 1) - dAt(x, y - 1);
      const glen = Math.hypot(gx2, gy2);
      const lit = glen > 0.001 ? ((-gx2 / glen) * L[0] + (-gy2 / glen) * L[1]) : 0;
      const d = Math.min(depth[i] / 5, 1);
      // Trois couches, sinon l'os reste un galet uniforme :
      //   · FORME — un dégradé d'ensemble le long de l'axe de lumière, qui
      //     donne sa masse au bloc (haut-gauche clair → bas-droite sourd) ;
      //   · ARÊTE — le terme de normale, qui ne mord qu'au bord ;
      //   · COURBURE — bombé/creusé au centre de la face.
      const [rx, ry] = f.shape.body;
      const form = ((x - c) / rx) * L[0] + ((y - c) / ry) * L[1]; // ~ +1 au haut-gauche
      const rim = 1 - d * 0.72;
      // Écart marqué : c'est ce qui sépare le 3 du 4 d'un coup d'œil (leurs
      // silhouettes sont identiques). Le 3 se creuse en cuvette, le 4 bombe.
      const bulge = f.curve * (1 - d) * 0.46;
      const t = 0.34 + 0.30 * form + 0.12 * d + 0.30 * lit * rim + bulge;
      let v = Math.max(1, Math.min(LAST, 1 + Math.round(t * (LAST - 1))));
      // Éclat spéculaire : la crête tournée vers la lumière, juste sous le bord.
      if (lit > 0.62 && depth[i] <= 2 && form > 0.34) v = LAST;
      lvl[i] = v;
    }
  }

  // Pips GRAVÉS 3x3 : le creux est peint au ton le plus sombre de la rampe quel
  // que soit l'ombrage local (c'est l'information de jeu — elle doit percer),
  // et la lèvre bas-droite capte la lumière qui passe par-dessus le bord.
  const [gx, gy] = f.gap;
  for (const [px, py] of PIPS[value]) {
    const cx = Math.round(c + px * gx), cy = Math.round(c + py * gy);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = cx + dx, y = cy + dy, i = y * S + x;
        if (x < 0 || y < 0 || x >= S || y >= S || !solid[i]) continue;
        if (dx === 1 && dy === 1) lvl[i] = Math.min(LAST, lvl[i] + 2); // lèvre éclairée
        else if (dx + dy >= 1) lvl[i] = 2;                             // paroi basse-droite
        else lvl[i] = 1;                                               // fond du creux
      }
    }
  }

  // Contour 1px (dilatation du vide) — définit l'os sur le tapis sombre.
  const out = new Int8Array(lvl);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      if (lvl[y * S + x] >= 1) continue;
      let touche = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nxp = x + dx, nyp = y + dy;
        if (nxp < 0 || nyp < 0 || nxp >= S || nyp >= S) continue;
        if (lvl[nyp * S + nxp] >= 1) { touche = true; break; }
      }
      if (touche) out[y * S + x] = 0;
    }
  }

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = y * S + x, o = i * 4, v = out[i];
      if (v < 0) { png.data[o + 3] = 0; continue; }
      const [r, g, b] = PAL[v];
      png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255;
    }
  }
  return png;
}

// --- planche de revue -------------------------------------------------------
function contact(sprites) {
  const BG = [0x18, 0x16, 0x14]; // fond de la fresque
  const PAD = 8, BIG = 6, MID = 3, REAL = 2; // inspection, puis les 2 tailles d'affichage candidates
  const W = PAD + sprites.length * (S * BIG + PAD);
  const H = PAD + S * BIG + PAD + S * MID + PAD + S * REAL + PAD;
  const sheet = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i += 1) {
    sheet.data[i * 4] = BG[0]; sheet.data[i * 4 + 1] = BG[1]; sheet.data[i * 4 + 2] = BG[2]; sheet.data[i * 4 + 3] = 255;
  }
  const blit = (src, ox, oy, sc) => {
    for (let y = 0; y < S * sc; y += 1) {
      for (let x = 0; x < S * sc; x += 1) {
        const si = (((y / sc) | 0) * S + ((x / sc) | 0)) * 4;
        if (src.data[si + 3] === 0) continue;
        const di = ((oy + y) * W + ox + x) * 4;
        sheet.data[di] = src.data[si]; sheet.data[di + 1] = src.data[si + 1];
        sheet.data[di + 2] = src.data[si + 2]; sheet.data[di + 3] = 255;
      }
    }
  };
  sprites.forEach((s, i) => {
    blit(s, PAD + i * (S * BIG + PAD), PAD, BIG);
    blit(s, PAD + i * (S * BIG + PAD), PAD + S * BIG + PAD, MID);
    blit(s, PAD + i * (S * BIG + PAD), PAD + S * BIG + PAD + S * MID + PAD, REAL);
  });
  return sheet;
}

// Planche horizontale des 4 faces, dans l'ordre 1·3·4·6 : sert À LA FOIS de
// jeu de sprites (background-position figé sur la face tombée) et de pellicule
// de culbute (steps(4) fait défiler les faces pendant le jet — l'os roule sans
// qu'on ait à faire tourner l'image, ce qui casserait la grille de pixels).
function sheet(sprites) {
  const png = new PNG({ width: S * sprites.length, height: S });
  sprites.forEach((s, k) => {
    for (let y = 0; y < S; y += 1) {
      for (let x = 0; x < S; x += 1) {
        const si = (y * S + x) * 4, di = (y * S * sprites.length + k * S + x) * 4;
        for (let c2 = 0; c2 < 4; c2 += 1) png.data[di + c2] = s.data[si + c2];
      }
    }
  });
  return png;
}

// --- gabarit Aseprite -------------------------------------------------------
// Planche de référence zoomée (x8) : l'art courant + une grille de 8px + la
// rampe en pastilles. À REGARDER pendant qu'on dessine, pas à peindre dessus.
function guide(sprites) {
  const Z = 8, GRID = 8, PAD = 10, SW = 40; // zoom, pas de grille, marge, pastille
  const W = PAD + sprites.length * (S * Z + PAD);
  const H = PAD + S * Z + PAD + SW + PAD;
  const png = new PNG({ width: W, height: H });
  const bg = [0x0e, 0x13, 0x20]; // fond de la scène du jeu
  for (let i = 0; i < W * H; i += 1) {
    png.data[i * 4] = bg[0]; png.data[i * 4 + 1] = bg[1]; png.data[i * 4 + 2] = bg[2]; png.data[i * 4 + 3] = 255;
  }
  const put = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    png.data[i] = Math.round(png.data[i] + (c[0] - png.data[i]) * (a / 255));
    png.data[i + 1] = Math.round(png.data[i + 1] + (c[1] - png.data[i + 1]) * (a / 255));
    png.data[i + 2] = Math.round(png.data[i + 2] + (c[2] - png.data[i + 2]) * (a / 255));
  };
  sprites.forEach((s, k) => {
    const ox = PAD + k * (S * Z + PAD), oy = PAD;
    for (let y = 0; y < S * Z; y += 1) {
      for (let x = 0; x < S * Z; x += 1) {
        const si = (((y / Z) | 0) * S + ((x / Z) | 0)) * 4;
        if (s.data[si + 3] === 0) continue;
        put(ox + x, oy + y, [s.data[si], s.data[si + 1], s.data[si + 2]]);
      }
    }
    for (let g = 0; g <= S; g += GRID) { // grille de repère
      for (let y = 0; y < S * Z; y += 1) put(ox + g * Z, oy + y, [0x6c, 0x8a, 0xb4], g % S === 0 ? 190 : 80);
      for (let x = 0; x < S * Z; x += 1) put(ox + x, oy + g * Z, [0x6c, 0x8a, 0xb4], g % S === 0 ? 190 : 80);
    }
  });
  PAL.forEach((c, k) => { // rampe en pastilles
    const ox = PAD + k * (SW + 6), oy = PAD + S * Z + PAD;
    for (let y = 0; y < SW; y += 1) for (let x = 0; x < SW; x += 1) put(ox + x, oy + y, c);
  });
  return png;
}

// Palette au format GIMP (.gpl) — Aseprite l'ouvre directement.
function gpl() {
  const names = ['contour', 'ombre profonde', 'ombre', 'mi-ton', 'base', 'clair', 'specular'];
  const rows = PAL.map((c, i) => `${String(c[0]).padStart(3)} ${String(c[1]).padStart(3)} ${String(c[2]).padStart(3)}\t${names[i]}`);
  return `GIMP Palette\nName: Osselets (Table des augures)\nColumns: ${PAL.length}\n#\n${rows.join('\n')}\n`;
}

fs.mkdirSync(OUT, { recursive: true });
const order = [1, 3, 4, 6];
const sprites = order.map((v) => render(v));
const sheetPng = sheet(sprites);

// GARDE-FOU : bones.png est le fichier que Raphaël retouche à la main dans
// Aseprite. Si son contenu ne correspond plus à ce que ce script avait produit,
// c'est qu'il a été redessiné — on REFUSE de l'écraser (FORCE=1 pour passer
// outre). Sans ça, un simple `node scripts/makeOsselets.mjs` détruirait le
// travail à la main sans prévenir.
const sheetPath = path.join(OUT, 'bones.png');
const stampPath = path.join(OUT, '.bones.stamp');
const digest = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const fresh = PNG.sync.write(sheetPng);
if (fs.existsSync(sheetPath) && !process.env.FORCE) {
  const stamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, 'utf8').trim() : '';
  const actual = digest(fs.readFileSync(sheetPath));
  if (stamp && actual !== stamp) {
    console.error('\n  ⚠  bones.png a été RETOUCHÉ À LA MAIN depuis la dernière génération.');
    console.error('     Rien n’a été écrit — le dessin est préservé.');
    console.error('     Pour écraser volontairement : FORCE=1 node scripts/makeOsselets.mjs\n');
    process.exit(1);
  }
}
order.forEach((v, k) => fs.writeFileSync(path.join(OUT, `bone-${v}.png`), PNG.sync.write(sprites[k])));
fs.writeFileSync(sheetPath, fresh);
fs.writeFileSync(stampPath, digest(fresh));

// Gabarit vierge : mêmes dimensions exactes, entièrement transparent.
const blank = new PNG({ width: S * order.length, height: S });
fs.writeFileSync(path.join(OUT, '_gabarit-vierge.png'), PNG.sync.write(blank));
fs.writeFileSync(path.join(OUT, '_guide.png'), PNG.sync.write(guide(sprites)));
fs.writeFileSync(path.join(OUT, '_palette.gpl'), gpl());
// La planche de revue n'est écrite qu'en mode revue (OSSELETS_OUT) : elle ne
// doit pas finir servie avec les assets du jeu.
if (process.env.OSSELETS_OUT) fs.writeFileSync(path.join(OUT, 'contact.png'), PNG.sync.write(contact(sprites)));
console.log('osselets → ' + OUT);
console.log('  bones.png (planche SERVIE au jeu — c’est le fichier à retoucher)');
console.log('  _gabarit-vierge.png  _guide.png  _palette.gpl  bone-{1,3,4,6}.png');
