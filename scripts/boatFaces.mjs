// Planche des 8 ROTATIONS d'un seul bateau, en grand — l'outil qui a permis de
// repérer que la face `northwest` du porte-conteneurs racontait un autre bateau
// que les sept autres (pont ocre au lieu des conteneurs, château disparu).
//
// Pourquoi un script et pas un test : j'ai essayé deux gardes automatiques sur
// la cohérence de palette entre faces, et AUCUNE ne sépare le vrai défaut du
// bruit légitime. Les 8 vues d'un objet diffèrent énormément par nature — une
// vue de face ne montre presque rien de ce que montre un profil. La face fautive
// pesait 1,2 % d'écart quand des faces parfaitement saines montaient à 10 %. Un
// seuil qui l'attrape crie sur tout le monde ; un seuil qui se tait la laisse
// passer. Livrer ce test aurait été livrer une garde décorative.
//
// L'œil reste donc le juge — mais il lui faut les 8 vues COTE À COTE et assez
// grandes. C'est tout ce que fait ce fichier, et c'est ce qui a marché.
//
//   node scripts/boatFaces.mjs container        → .preview-shots/faces-container.png
//   node scripts/boatFaces.mjs                  → tous les bateaux
import { PNG } from 'pngjs';
import fs from 'node:fs';

const DIR = 'public/pixelart/iso';
const OUT = '.preview-shots';
const SECTORS = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
const ALL = ['raft', 'sail', 'steam', 'container', 'rowboat', 'dinghy', 'motorboat', 'fisher', 'fisher-row'];
const ZOOM = 3, GAP = 6, COLS = 4, BG = [26, 30, 38];

fs.mkdirSync(OUT, { recursive: true });
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const todo = names.length ? names : ALL;

for (const name of todo) {
  const faces = SECTORS.map((s) => {
    const f = `${DIR}/boat-${name}-${s}.png`;
    return fs.existsSync(f) ? PNG.sync.read(fs.readFileSync(f)) : null;
  });
  if (faces.every((f) => !f)) { console.warn('bateau', name, '— aucun PNG, saute'); continue; }
  const src = Math.max(...faces.filter(Boolean).map((f) => Math.max(f.width, f.height)));
  const C = src * ZOOM;
  const rows = Math.ceil(SECTORS.length / COLS);
  const W = GAP + COLS * (C + GAP), H = GAP + rows * (C + GAP);
  const out = new PNG({ width: W, height: H });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = BG[0]; out.data[i + 1] = BG[1]; out.data[i + 2] = BG[2]; out.data[i + 3] = 255;
  }
  faces.forEach((p, i) => {
    if (!p) return;
    const cx = GAP + (i % COLS) * (C + GAP), cy = GAP + Math.floor(i / COLS) * (C + GAP);
    // Agrandi au PLUS PROCHE VOISIN : un lissage ferait mentir la planche, on
    // juge des pixels.
    for (let y = 0; y < C; y += 1) {
      for (let x = 0; x < C; x += 1) {
        const sx = Math.floor(x / ZOOM), sy = Math.floor(y / ZOOM);
        if (sx >= p.width || sy >= p.height) continue;
        const si = (p.width * sy + sx) << 2, di = (W * (cy + y) + (cx + x)) << 2;
        const a = p.data[si + 3] / 255;
        if (a <= 0) continue;
        for (let k = 0; k < 3; k += 1) out.data[di + k] = Math.round(out.data[di + k] * (1 - a) + p.data[si + k] * a);
      }
    }
  });
  fs.writeFileSync(`${OUT}/faces-${name}.png`, PNG.sync.write(out));
  console.log('OK —', `${OUT}/faces-${name}.png`, `(${W}x${H})`);
}
console.log('ordre de lecture :', SECTORS.join(', '));
