// Génère les DÉS D'OS de la Table des augures — pixel-art AUTHORED.
// Successeur des osselets (astragales) : l'astragale s'est révélé illisible à
// 32px (arbitrage Raph 2026-07-22, cf. scripts/makeOsselets.mjs qu'il remplace).
//
// Parti pris : PAS un d6 de plastique blanc, mais une *tessera* romaine — un dé
// taillé dans l'os. Même matière que l'astragale, même palette échantillonnée
// sur la fresque du jeu, mêmes pips GRAVÉS. On change la forme, pas la DA.
//
//   Sortie : <OUT>/bones.png (planche 6 faces SERVIE au jeu — nom conservé pour
//            ne pas casser le CSS) + die-1..6.png (aides en lecture seule)
//            + gabarit/guide/palette. contact.png (revue) qu'en mode DES_OUT.
//
//   node scripts/makeDesTemple.mjs        → public/pixelart/ui/augures/bones
//   DES_OUT=/tmp/x node scripts/makeDesTemple.mjs   → ailleurs (revue)
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// La sortie par défaut est ancrée sur la RACINE DU DÉPÔT (déduite de l'emplacement
// de ce script), pas sur le dossier courant : lancé depuis ailleurs, un chemin
// relatif écrivait un faux arbre public/… dans ce dossier-là, et le garde-fou
// d'empreinte devenait sans objet puisqu'il ne voyait plus la vraie planche.
// (Défaut relevé sur le générateur d'osselets que celui-ci remplace.)
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.DES_OUT || path.join(RACINE, 'public/pixelart/ui/augures/bones');
const S = 32;   // canevas ; l'échelle d'affichage vit dans le CSS (--bone)
const N = 6;    // six faces, contre quatre à l'astragale

// --- palette (identique à celle des osselets : échantillonnée sur la fresque) --
const PAL = [
  [0x2e, 0x20, 0x12], // 0 contour
  [0x4b, 0x34, 0x18], // 1 ombre profonde
  [0x7e, 0x60, 0x34], // 2 ombre
  [0xa3, 0x8c, 0x66], // 3 mi-ton
  [0xc7, 0xb5, 0x99], // 4 base
  [0xe8, 0xdc, 0xc0], // 5 clair
  [0xfd, 0xf8, 0xea], // 6 specular
];
const LAST = PAL.length - 1;
const L = [-0.7071, -0.7071]; // lumière haut-gauche (règle du projet)

// --- géométrie ---------------------------------------------------------------
// Vue DE FACE, biseautée. Deux approches ont été essayées et écartées avant
// celle-ci (2026-07-22) :
//   · vue de dessus avec une tranche EXTRUDÉE vers le bas — l'extrusion suit le
//     contour arrondi du plateau, donc sa hauteur varie colonne par colonne et
//     le bas part en flaque : le dé a l'air de FONDRE ;
//   · dégradé d'ensemble marqué sur le plateau — à 7 tons il terrasse en une
//     cassure diagonale et le dé a l'air PLIÉ.
// Un dé de pixel-art se lit d'un carré arrondi vu de face, dont tout le relief
// tient dans un BISEAU de bordure : arête haut-gauche allumée, arête bas-droite
// plongée, intérieur parfaitement PLAT. C'est plus lisible à 32px qu'une
// perspective, et ça laisse la face entière aux pips.
const TOP = { rx: 12.2, ry: 12.2, n: 4.6, cy: 0 };
const BEVEL = 2.2; // profondeur du biseau, en pixels (au-delà : intérieur plat)

const onTop = (x, y) =>
  Math.pow(Math.abs(x / TOP.rx), TOP.n) + Math.pow(Math.abs((y - TOP.cy) / TOP.ry), TOP.n) <= 1;

// --- pips (disposition canonique d'un dé) ------------------------------------
// Unités « case » centrées sur 0, mises à l'échelle par GAP.
const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
const GAP = [6.6, 6.6]; // écart des pips ; calé pour que le 6 tienne sur la face

// GRAIN D'IVOIRE : essayé (moucheton déterministe ±1 cran sur l'intérieur),
// ÉCARTÉ. À 22 % c'était du papier de verre qui noyait les pips ; ramené à 7 %
// il restait des TRAÎNÉES DIAGONALES visibles — un hash FNV se distribue mal sur
// des coordonnées voisines, et à 32px l'œil recompose aussitôt le motif. Un
// intérieur franchement plat s'est révélé plus propre et plus lisible. Si l'envie
// revient, il faudra un vrai bruit bleu, pas un hash par pixel.

function render(value) {
  const png = new PNG({ width: S, height: S });
  const c = (S - 1) / 2;
  const lvl = new Int8Array(S * S).fill(-1);
  const solid = new Uint8Array(S * S);

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) if (onTop(x - c, y - c)) solid[y * S + x] = 1;
  }
  const topOnly = solid;

  // Champ de distance au bord par ÉROSION : il sert ici à situer le BISEAU
  // (les premiers pixels depuis le bord) et rien d'autre.
  const depth = new Int8Array(S * S);
  let layer = topOnly.slice();
  for (let step = 1; step <= 8; step += 1) {
    const next = layer.slice();
    for (let y = 0; y < S; y += 1) {
      for (let x = 0; x < S; x += 1) {
        const i = y * S + x;
        if (!layer[i]) continue;
        depth[i] = step;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S || !layer[ny * S + nx]) { next[i] = 0; break; }
        }
      }
    }
    layer = next;
  }

  const dAt = (x, y) => (x < 0 || y < 0 || x >= S || y >= S) ? 0 : depth[y * S + x];
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = y * S + x;
      if (!solid[i]) continue;
      const gx = dAt(x + 1, y) - dAt(x - 1, y);
      const gy = dAt(x, y + 1) - dAt(x, y - 1);
      const glen = Math.hypot(gx, gy);
      const lit = glen > 0.001 ? ((-gx / glen) * L[0] + (-gy / glen) * L[1]) : 0;
      // `edge` vaut 1 sur l'arête et retombe à 0 passé BEVEL : hors du biseau,
      // il ne reste que la base — donc un intérieur RIGOUREUSEMENT plat, sur
      // lequel les pips se détachent sans rien pour les concurrencer.
      const edge = Math.max(0, 1 - (depth[i] - 1) / BEVEL);
      const t = 0.50 + 0.42 * lit * edge;
      lvl[i] = Math.max(2, Math.min(LAST, 1 + Math.round(t * (LAST - 1))));
    }
  }

  // Pips GRAVÉS 3x3 sur la face supérieure. Même traitement que les osselets :
  // fond au ton le plus sombre quel que soit l'ombrage local (c'est
  // l'information de jeu, elle doit percer), lèvre bas-droite éclairée.
  // GARDE-FOU : un pip qui déborde de la face est ignoré silencieusement par le
  // rendu — on l'interdit, sinon une face perdrait son point sans rien signaler.
  for (const [px, py] of PIPS[value]) {
    const cx = Math.round(c + px * GAP[0]), cy = Math.round(c + TOP.cy + py * GAP[1]);
    let hors = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= S || y >= S || !topOnly[y * S + x]) hors += 1;
      }
    }
    if (hors > 0) {
      throw new Error(
        `face ${value} : le pip (${px}, ${py}) déborde du plateau — ${hors}/9 pixels dehors.\n` +
        `  Resserre GAP (actuellement [${GAP[0]}, ${GAP[1]}]) ou élargis TOP.`
      );
    }
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = cx + dx, y = cy + dy, i = y * S + x;
        if (dx === 1 && dy === 1) lvl[i] = Math.min(LAST, lvl[i] + 2);
        else if (dx + dy >= 1) lvl[i] = 2;
        else lvl[i] = 1;
      }
    }
  }

  // Contour 1px.
  const out = new Int8Array(lvl);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      if (lvl[y * S + x] >= 1) continue;
      let touche = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        if (lvl[ny * S + nx] >= 1) { touche = true; break; }
      }
      if (touche) out[y * S + x] = 0;
    }
  }

  for (let i = 0; i < S * S; i += 1) {
    const o = i * 4, v = out[i];
    if (v < 0) { png.data[o + 3] = 0; continue; }
    const [r, g, b] = PAL[v];
    png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255;
  }
  return png;
}

// --- planches ----------------------------------------------------------------
function sheet(sprites) {
  const png = new PNG({ width: S * sprites.length, height: S });
  sprites.forEach((s, k) => {
    for (let y = 0; y < S; y += 1) {
      for (let x = 0; x < S; x += 1) {
        const si = (y * S + x) * 4, di = (y * S * sprites.length + k * S + x) * 4;
        for (let ch = 0; ch < 4; ch += 1) png.data[di + ch] = s.data[si + ch];
      }
    }
  });
  return png;
}

function contact(sprites) {
  const BG = [0x0e, 0x13, 0x20]; // fond de la scène du jeu
  const PAD = 8, ROWS = [6, 3, 2]; // inspection, taille de jeu (96px), repli (64px)
  const W = PAD + sprites.length * (S * ROWS[0] + PAD);
  const H = PAD + ROWS.reduce((s, z) => s + S * z + PAD, 0);
  const out = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i += 1) {
    out.data[i * 4] = BG[0]; out.data[i * 4 + 1] = BG[1]; out.data[i * 4 + 2] = BG[2]; out.data[i * 4 + 3] = 255;
  }
  let oy = PAD;
  for (const z of ROWS) {
    sprites.forEach((s, k) => {
      const ox = PAD + k * (S * ROWS[0] + PAD);
      for (let y = 0; y < S * z; y += 1) {
        for (let x = 0; x < S * z; x += 1) {
          const si = (((y / z) | 0) * S + ((x / z) | 0)) * 4;
          if (s.data[si + 3] === 0) continue;
          const di = ((oy + y) * W + ox + x) * 4;
          out.data[di] = s.data[si]; out.data[di + 1] = s.data[si + 1]; out.data[di + 2] = s.data[si + 2];
        }
      }
    });
    oy += S * z + PAD;
  }
  return out;
}

// Guide Aseprite : la planche zoomée ×8, une grille de 8px et la rampe en
// pastilles. À REGARDER en dessinant, pas à peindre dessus.
function guide(sprites) {
  const Z = 8, GRID = 8, PAD = 10, SW = 40;
  const W = PAD + sprites.length * (S * Z + PAD);
  const H = PAD + S * Z + PAD + SW + PAD;
  const png = new PNG({ width: W, height: H });
  const bg = [0x0e, 0x13, 0x20];
  for (let i = 0; i < W * H; i += 1) {
    png.data[i * 4] = bg[0]; png.data[i * 4 + 1] = bg[1]; png.data[i * 4 + 2] = bg[2]; png.data[i * 4 + 3] = 255;
  }
  const put = (x, y, col, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    for (let ch = 0; ch < 3; ch += 1) {
      png.data[i + ch] = Math.round(png.data[i + ch] + (col[ch] - png.data[i + ch]) * (a / 255));
    }
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
    for (let g = 0; g <= S; g += GRID) {
      for (let y = 0; y < S * Z; y += 1) put(ox + g * Z, oy + y, [0x6c, 0x8a, 0xb4], g % S === 0 ? 190 : 80);
      for (let x = 0; x < S * Z; x += 1) put(ox + x, oy + g * Z, [0x6c, 0x8a, 0xb4], g % S === 0 ? 190 : 80);
    }
  });
  PAL.forEach((col, k) => {
    const ox = PAD + k * (SW + 6), oy = PAD + S * Z + PAD;
    for (let y = 0; y < SW; y += 1) for (let x = 0; x < SW; x += 1) put(ox + x, oy + y, col);
  });
  return png;
}

// Palette au format GIMP (.gpl) — Aseprite l'ouvre directement.
function gpl() {
  const noms = ['contour', 'ombre profonde', 'ombre', 'mi-ton', 'base', 'clair', 'specular'];
  const rows = PAL.map((col, i) =>
    `${String(col[0]).padStart(3)} ${String(col[1]).padStart(3)} ${String(col[2]).padStart(3)}\t${noms[i]}`);
  return `GIMP Palette\nName: Dés d'os (Table des augures)\nColumns: ${PAL.length}\n#\n${rows.join('\n')}\n`;
}

fs.mkdirSync(OUT, { recursive: true });

// GARDE-FOU repris des osselets : bones.png peut être retouché à la main dans
// Aseprite. On refuse de l'écraser si son empreinte ne correspond plus à ce que
// ce script avait produit. FAIL-CLOSED : stamp absent = provenance invérifiable
// = on refuse aussi. FORCE=1 (exactement) passe outre.
const sheetPath = path.join(OUT, 'bones.png');
const stampPath = path.join(OUT, '.bones.stamp');
const digest = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
if (fs.existsSync(sheetPath) && (process.env.FORCE || '').trim() !== '1') {
  const stamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, 'utf8').trim() : '';
  if (digest(fs.readFileSync(sheetPath)) !== stamp) {
    console.error('\n  ⚠  bones.png ne correspond pas à la dernière génération');
    console.error('     (retouche à la main, ou planche des OSSELETS encore en place).');
    console.error('     Rien n’a été écrit. Pour écraser volontairement :');
    const ps = process.env.DES_OUT ? `$env:DES_OUT='${process.env.DES_OUT}'; ` : '';
    console.error(`       PowerShell : ${ps}$env:FORCE='1'; node scripts/makeDesTemple.mjs; $env:FORCE=$null\n`);
    process.exit(1);
  }
}

const order = [1, 2, 3, 4, 5, 6];
const sprites = order.map(render);
const fresh = PNG.sync.write(sheet(sprites));
order.forEach((v, k) => fs.writeFileSync(path.join(OUT, `die-${v}.png`), PNG.sync.write(sprites[k])));
fs.writeFileSync(sheetPath, fresh);
fs.writeFileSync(stampPath, digest(fresh));

// Gabarit vierge : dimensions exactes de la planche, entièrement transparent.
fs.writeFileSync(path.join(OUT, '_gabarit-vierge.png'), PNG.sync.write(new PNG({ width: S * N, height: S })));
fs.writeFileSync(path.join(OUT, '_guide.png'), PNG.sync.write(guide(sprites)));
fs.writeFileSync(path.join(OUT, '_palette.gpl'), gpl());
// La planche de revue ne doit pas finir servie avec les assets du jeu.
if (process.env.DES_OUT) fs.writeFileSync(path.join(OUT, 'contact.png'), PNG.sync.write(contact(sprites)));
console.log(`dés → ${OUT}  (planche ${S * N}×${S}, ${N} faces)`);
