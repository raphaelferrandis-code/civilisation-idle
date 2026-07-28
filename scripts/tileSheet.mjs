// tileSheet.mjs — PLANCHE-CONTACT d'un lot `create_tiles_pro` : les 16 tuiles
// BRUTES (agrandies ×3) + leur ton moyen + les écarts par rangée et par colonne.
//   node scripts/tileSheet.mjs <lot-id> [.preview-shots/lot-x.png]
//
// Sert à trancher le RANGEMENT du lot (par rangée ou par colonne) avant de
// grouper les variantes dans fetchGroundTiles : la réponse de l'API ne le dit
// pas, et un groupement inversé égalise quatre matières DIFFÉRENTES entre elles
// — les gardes du fetch l'attrapent, mais après coup. Les écarts imprimés ici
// donnent la réponse en une lecture : l'axe des VARIANTES est celui dont l'écart
// interne est petit (quelques unités), l'axe des MATIÈRES celui où il explose.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const LOT = process.argv[2];
const OUT = process.argv[3] || '.preview-shots/lot-sheet.png';
const BUCKET = 'https://backblaze.pixellab.ai/file/pixellab-tiles/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function grab(url) {
  for (let i = 0; i < 20; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 300 && b.subarray(0, 4).equals(PNG_SIG)) return b;
      }
    } catch { /* pas prêt */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}
const meanRGB = (p) => {
  const s = [0, 0, 0]; let n = 0;
  for (let i = 0; i < p.width * p.height; i += 1) {
    if (p.data[i * 4 + 3] < 128) continue;
    for (let c = 0; c < 3; c += 1) s[c] += p.data[i * 4 + c];
    n += 1;
  }
  return n ? s.map((v) => Math.round(v / n)) : [0, 0, 0];
};
const lum = (m) => 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
function bboxOf(p) {
  const { width: w, height: h, data: d } = p;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (d[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const tiles = [];
for (let i = 0; i < 16; i += 1) {
  const b = await grab(`${BUCKET}/${LOT}/tile_${i}.png`);
  if (!b) { console.error(`tile_${i} indisponible`); process.exit(2); }
  tiles.push(PNG.sync.read(b));
}
const TW = Math.max(...tiles.map((t) => t.width));
const TH = Math.max(...tiles.map((t) => t.height));
const GAP = 6, COLS = 4, ROWS = 4, SC = 3;   // SC : agrandi x3, le pixel se voit
const W = COLS * (TW * SC + GAP) + GAP, H = ROWS * (TH * SC + GAP) + GAP;
const out = new PNG({ width: W, height: H });
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 40; out.data[i + 1] = 40; out.data[i + 2] = 46; out.data[i + 3] = 255; }
tiles.forEach((t, i) => {
  const ox = GAP + (i % COLS) * (TW * SC + GAP), oy = GAP + ((i / COLS) | 0) * (TH * SC + GAP);
  for (let y = 0; y < t.height * SC; y += 1) for (let x = 0; x < t.width * SC; x += 1) {
    const si = (((y / SC) | 0) * t.width + ((x / SC) | 0)) * 4;
    if (t.data[si + 3] < 16) continue;
    const di = ((oy + y) * W + ox + x) * 4;
    out.data[di] = t.data[si]; out.data[di + 1] = t.data[si + 1];
    out.data[di + 2] = t.data[si + 2]; out.data[di + 3] = 255;
  }
});
fs.mkdirSync(OUT.replace(/[/\\][^/\\]*$/, ''), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(out));
console.log(`planche → ${OUT}  (${COLS}x${ROWS}, tuiles ${TW}x${TH})`);
const L = tiles.map((t) => lum(meanRGB(t)));
console.log('\nton moyen / luminance par tuile :');
tiles.forEach((t, i) => {
  const bb = bboxOf(t);
  console.log(`  tile_${String(i).padStart(2)}  [${meanRGB(t).join(', ')}]  lum ${L[i].toFixed(1)}  bbox ${bb ? bb.w + 'x' + bb.h : 'vide'}`);
});
const spread = (idx) => { const v = idx.map((i) => L[i]); return (Math.max(...v) - Math.min(...v)).toFixed(1); };
console.log('\nécart de luminance interne :');
for (let r = 0; r < 4; r += 1) console.log(`  rangée ${r} [${[0, 1, 2, 3].map((c) => r * 4 + c).join(',')}] → ${spread([0, 1, 2, 3].map((c) => r * 4 + c))}`);
for (let c = 0; c < 4; c += 1) console.log(`  colonne ${c} [${[0, 1, 2, 3].map((r) => r * 4 + c).join(',')}] → ${spread([0, 1, 2, 3].map((r) => r * 4 + c))}`);
