// halfABSheet.mjs — LA PLANCHE-CONTACT A/B du lot G1 (docs/PLAN-GRILLE-PIXELS.md).
//
// Ce que le joueur verra, à taille apparente IDENTIQUE, avant et après cuisson :
//   AVANT — la bande PLEINE réduite au plus proche voisin à la boîte de blit,
//           exactement ce que fait le canvas aujourd'hui à chaque image ;
//   APRÈS — la bande `-half` pré-cuite, réduite de la même façon à la MÊME boîte.
// Les deux sont ensuite agrandies ×N au plus proche voisin, pour l'œil.
//
// ⚠⚠ RÈGLE DU CHANTIER, payée deux fois ailleurs (cf. building-frontview-regen) :
// on juge sur la planche COMPLÈTE, jamais sur trois sprites. Le script sort donc
// TOUTES les bandes du préfixe, sans échantillonnage.
//
// ⚠ Ce qu'une image FIXE ne peut pas montrer : le fourmillement. La coupe du
// plus proche voisin se déplace quand le sprite marche, et c'est le vrai défaut.
// La planche prouve qu'aucun membre ni aucune arme n'a disparu ; la stabilité,
// elle, se juge EN JEU, en regardant marcher.
//
//   node scripts/halfABSheet.mjs <dossier> <préfixe> [--drawH=14] [--zoom=8] [--frame=0]
//   node scripts/halfABSheet.mjs events rioter- --drawH=14
// Sortie : .preview-shots/halfAB-<préfixe>.png (gitignoré).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIAG = ['southeast', 'southwest', 'northeast', 'northwest'];
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const pos = args.filter((a) => !a.startsWith('--'));
const FOLDER = pos[0], PREFIX = pos[1] || '';
const DRAWH = parseInt(opt('drawH', '14'), 10);      // la boîte RÉELLE du jeu (sonde G0)
const ZOOM = parseInt(opt('zoom', '8'), 10);
const FRAME = parseInt(opt('frame', '0'), 10);
const ROOT = path.join('public/pixelart/agents', FOLDER);
const OUT = '.preview-shots';
const BG = [26, 26, 32], SEP = [70, 70, 84], GAP = 6;

if (!FOLDER) { console.error('usage: node scripts/halfABSheet.mjs <dossier> <préfixe> [--drawH=14] [--zoom=8] [--frame=0]'); process.exit(1); }

const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
// Plus proche voisin, la même règle que le canvas : c'est le point de la
// démonstration — on ne s'autorise PAS un meilleur filtre du côté « avant »,
// sinon la comparaison flatte la cuisson.
function nearest(src, sx0, sy0, sw, sh, dw, dh) {
  const out = new PNG({ width: dw, height: dh });
  for (let y = 0; y < dh; y += 1) for (let x = 0; x < dw; x += 1) {
    const u = sx0 + Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw));
    const v = sy0 + Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
    const [r, g, b, a] = px(src, u, v);
    const i = (y * dw + x) * 4;
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = a;
  }
  return out;
}
function blit(dst, src, ox, oy, k) {
  for (let y = 0; y < src.height * k; y += 1) for (let x = 0; x < src.width * k; x += 1) {
    const [r, g, b, a] = px(src, Math.floor(x / k), Math.floor(y / k));
    if (a <= 16) continue;
    const X = ox + x, Y = oy + y;
    if (X < 0 || Y < 0 || X >= dst.width || Y >= dst.height) continue;
    const i = (Y * dst.width + X) * 4;
    dst.data[i] = r; dst.data[i + 1] = g; dst.data[i + 2] = b; dst.data[i + 3] = 255;
  }
}

// Un « sujet » = un nom de sprite (les 4 diagonales sur une ligne).
const noms = [...new Set(fs.readdirSync(ROOT)
  .filter((f) => f.startsWith(PREFIX) && f.endsWith('.png') && !f.endsWith('-half.png'))
  .filter((f) => DIAG.some((d) => f.endsWith(`-${d}.png`)))
  .map((f) => f.replace(/-(southeast|southwest|northeast|northwest)\.png$/, '')))].sort();
if (!noms.length) { console.error(`aucune bande ${PREFIX}* dans ${ROOT}`); process.exit(1); }

const CELL = DRAWH * ZOOM;
const COL = CELL * 2 + GAP;                      // avant | après
const W = GAP + noms.length ? GAP + DIAG.length * (COL + GAP) : 0;
const H = GAP + noms.length * (CELL + GAP);
const sheet = new PNG({ width: W, height: H });
for (let i = 0; i < sheet.data.length; i += 4) {
  sheet.data[i] = BG[0]; sheet.data[i + 1] = BG[1]; sheet.data[i + 2] = BG[2]; sheet.data[i + 3] = 255;
}

let nHalf = 0, nManque = 0;
noms.forEach((nom, r) => {
  const oy = GAP + r * (CELL + GAP);
  DIAG.forEach((d, c) => {
    const ox = GAP + c * (COL + GAP);
    const fPlein = path.join(ROOT, `${nom}-${d}.png`);
    if (!fs.existsSync(fPlein)) { nManque += 1; return; }
    const plein = PNG.sync.read(fs.readFileSync(fPlein));
    const fh = plein.height;
    blit(sheet, nearest(plein, FRAME * fh, 0, fh, fh, DRAWH, DRAWH), ox, oy, ZOOM);
    // Trait de séparation : sans lui, deux silhouettes voisines se lisent comme
    // une seule au premier coup d'œil, et c'est justement ce coup d'œil qu'on veut.
    for (let y = 0; y < CELL; y += 1) {
      const i = ((oy + y) * W + ox + CELL + Math.floor(GAP / 2)) * 4;
      sheet.data[i] = SEP[0]; sheet.data[i + 1] = SEP[1]; sheet.data[i + 2] = SEP[2];
    }
    const fHalf = path.join(ROOT, `${nom}-${d}-half.png`);
    if (!fs.existsSync(fHalf)) return;
    const half = PNG.sync.read(fs.readFileSync(fHalf));
    const hh = half.height;
    blit(sheet, nearest(half, FRAME * hh, 0, hh, hh, DRAWH, DRAWH), ox + CELL + GAP, oy, ZOOM);
    nHalf += 1;
  });
});

fs.mkdirSync(OUT, { recursive: true });
const f = path.join(OUT, `halfAB-${PREFIX.replace(/[^a-z0-9]/gi, '') || FOLDER}.png`);
fs.writeFileSync(f, PNG.sync.write(sheet));
console.log(`${f}  ${W}×${H}  — ${noms.length} sujets × ${DIAG.length} vues, ${nHalf} cuites${nManque ? `, ${nManque} vues absentes` : ''}`);
console.log(`  gauche = bande pleine réduite au blit (aujourd'hui) · droite = bande -half pré-cuite · boîte ${DRAWH} px, ×${ZOOM}`);
