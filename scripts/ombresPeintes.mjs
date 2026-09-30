/**
 * LES OMBRES PEINTES S'EN VONT — une seule lumière pour toute la carte (2026-09-30).
 * ---------------------------------------------------------------------------
 * Décision de Raph (docs/PLAN-MAQUETTE-VIVANTE.md, lot 4) : « une ombre solaire pour
 * tout ». Le jeu projette désormais la même ombre sous chaque objet
 * (iso/isoSunShadow.js) ; les ombres PEINTES dans les sprites d'habitation feraient
 * double emploi — et elles n'étaient pas d'accord entre elles (sept sprites en ont
 * une, noire ; deux une gris-bleu ; les autres aucune).
 *
 * Même geste que le 2026-08-04 pour le manoir et la tente (commit 52e65d2) : on rend
 * TRANSPARENTS les pixels de l'ombre, on n'écrit AUCUNE couleur — la table des
 * teintes (housePalette.js) travaille par couleur EXACTE, et une couleur qui glisse
 * d'une unité la casse (c'est ce qui était arrivé au manoir en août).
 *
 * L'ombre d'un sprite = les taches d'UNE couleur (la sienne, relevée à la main
 * ci-dessous) qui touchent le vide et vivent dans le BAS du sprite. Vérifié sur
 * planche agrandie, sprite par sprite : ces couleurs n'apparaissent nulle part
 * ailleurs en tache touchant le vide (le sombre de la tour-maison et des maisons en
 * rangée est leur MUR à l'ombre, pas une ombre au sol — ils ne sont pas listés).
 *
 * ⚠ LA BOÎTE D'ENCRE EST FIGÉE. Retirer l'ombre rétrécit l'encre mesurée ; or le rendu
 * centre le sprite sur elle, pose son bas sur le sol du lot, et plafonne son échelle
 * sur sa largeur. Sans rien faire, sept maisons auraient glissé de 1 à 7 px et le bloc
 * aurait grandi de 12 %. Le script imprime donc la boîte d'ORIGINE de chaque sprite
 * traité, à recopier dans `INK_BOX_PIN` (pixelHouses.js) : seul l'ombre disparaît.
 *
 * Usage :
 *   node scripts/ombresPeintes.mjs                 # mesure seule, n'écrit rien
 *   node scripts/ombresPeintes.mjs --apply         # rend les ombres transparentes
 *   node scripts/ombresPeintes.mjs --proof <png>   # planche avant | après (×4)
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const PROOF = (() => { const i = argv.indexOf('--proof'); return i >= 0 ? argv[i + 1] : null; })();
const DIR = path.join('public', 'pixelart', 'houses');

// sprite → couleur de son ombre, part basse de l'encre où elle vit, taille mini
// d'une tache, contacts mini avec le vide.
const NOIRE = '33,26,29', GRISE = '79,84,94';
export const OMBRES = {
  stonehouse: { col: NOIRE, low: 0.5, min: 40, border: 8 },
  townhouse: { col: NOIRE, low: 0.5, min: 40, border: 8 },
  courtyard: { col: NOIRE, low: 0.5, min: 40, border: 8 },
  block: { col: NOIRE, low: 0.5, min: 40, border: 8 },
  tenement: { col: NOIRE, low: 0.5, min: 40, border: 8 },
  tower: { col: NOIRE, low: 0.5, min: 40, border: 8 },
  megablock: { col: NOIRE, low: 0.3, min: 40, border: 8 },
  // L'arcologie : la grande tache, et les petites ombres des jardinières de son
  // socle, dans son bas uniquement.
  arcologyhome: { col: NOIRE, low: 0.72, min: 10, border: 8 },
  hut: { col: GRISE, low: 0.6, min: 3, border: 1 },
  longhouse: { col: GRISE, low: 0.6, min: 3, border: 1 },
};

const O4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function inkBox(p) {
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y += 1) {
    for (let x = 0; x < p.width; x += 1) {
      if (p.data[(y * p.width + x) * 4 + 3] <= 16) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const pins = {};
const proofs = [];
let total = 0;
for (const [name, spec] of Object.entries(OMBRES)) {
  const file = path.join(DIR, name + '.png');
  const p = PNG.sync.read(fs.readFileSync(file));
  const before = Buffer.from(p.data);
  const W = p.width, H = p.height;
  const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : p.data[(y * W + x) * 4 + 3];
  const C = (x, y) => { const i = (y * W + x) * 4; return p.data[i] + ',' + p.data[i + 1] + ',' + p.data[i + 2]; };
  const box = inkBox(p);
  const yLow = box.y0 + spec.low * (box.h - 1);
  const seen = new Uint8Array(W * H);
  let removed = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (seen[y * W + x] || A(x, y) <= 16 || C(x, y) !== spec.col) continue;
      const comp = [[x, y]];
      seen[y * W + x] = 1;
      let border = 0, minY = y;
      for (let i = 0; i < comp.length; i += 1) {
        const [a, b] = comp[i];
        if (b < minY) minY = b;
        for (const [dx, dy] of O4) {
          const nx = a + dx, ny = b + dy;
          if (A(nx, ny) <= 16) { border += 1; continue; }
          if (!seen[ny * W + nx] && C(nx, ny) === spec.col) { seen[ny * W + nx] = 1; comp.push([nx, ny]); }
        }
      }
      if (comp.length < spec.min || border < spec.border || minY < yLow) continue;
      for (const [a, b] of comp) p.data[(b * W + a) * 4 + 3] = 0;
      removed += comp.length;
    }
  }
  total += removed;
  pins[name] = box;
  console.log(`${name.padEnd(13)} ${removed ? removed + ' px d\'ombre' : 'rien (déjà fait ?)'} — boîte d'origine x${box.x0} y${box.y0} ${box.w}×${box.h}`);
  if (APPLY && removed) fs.writeFileSync(file, PNG.sync.write(p));
  if (PROOF) proofs.push({ name, W, H, before, after: Buffer.from(p.data) });
}
console.log('\nINK_BOX_PIN = ' + JSON.stringify(pins));
console.log(APPLY ? `écrit (${total} px).` : `Rien écrit (ajouter --apply). ${total} px à rendre transparents.`);

if (PROOF) {
  const K = 4, GAP = 10, BG = [185, 173, 146];
  const colW = Math.max(...proofs.map((q) => q.W)) * K;
  const rowH = proofs.map((q) => q.H * K);
  const out = new PNG({ width: colW * 2 + GAP * 3, height: rowH.reduce((a, h) => a + h + GAP, GAP) });
  for (let i = 0; i < out.width * out.height; i += 1) { out.data[i * 4] = 30; out.data[i * 4 + 1] = 33; out.data[i * 4 + 2] = 44; out.data[i * 4 + 3] = 255; }
  let oy = GAP;
  for (const q of proofs) {
    for (const [buf, ox] of [[q.before, GAP], [q.after, GAP * 2 + colW]]) {
      for (let y = 0; y < q.H * K; y += 1) {
        for (let x = 0; x < q.W * K; x += 1) {
          const si = (((y / K) | 0) * q.W + ((x / K) | 0)) * 4, di = ((oy + y) * out.width + ox + x) * 4;
          const a = buf[si + 3] / 255;
          for (let c = 0; c < 3; c += 1) out.data[di + c] = Math.round(buf[si + c] * a + BG[c] * (1 - a));
        }
      }
    }
    oy += q.H * K + GAP;
  }
  fs.writeFileSync(PROOF, PNG.sync.write(out));
  console.log('planche', PROOF);
}
