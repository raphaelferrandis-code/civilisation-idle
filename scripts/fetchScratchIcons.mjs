// Télécharge les 8 emblèmes pixel-art des TICKETS À GRATTER (PixelLab map-objects,
// view "side", basic shading, single outline) → public/pixelart/ui/scratch/<symbol>.png
// (PNG transparent, ROGNÉ au contenu pour remplir uniformément les cases). Créés via
// create_map_object. Endpoint /objects/{id}/download (sans auth). Poll 15s.
// ⚠ Les objets PixelLab s'auto-suppriment après 8h → lancer dans la foulée.
// Après : node scripts/quantize.cjs public/pixelart/ui/scratch --colors 20
//   Filtre optionnel : node scripts/fetchScratchIcons.mjs venus
import fs from 'node:fs';
import { PNG } from 'pngjs';

const OUT = 'public/pixelart/ui/scratch';
const ICONS = [
  { key: 'olive', id: 'a81e0048-62eb-4197-ad08-134412c3911f' },
  { key: 'amphore', id: 'c5b681f6-ea9f-43a1-8749-bdbbd5801b57' },
  { key: 'laurier', id: '70715a7a-de64-4499-b952-d092e48ebe2e' },
  { key: 'trepied', id: 'f9a82eca-9a46-4552-aa64-b4ae90d704d9' },
  { key: 'chouette', id: '2655df16-f289-408e-9c46-382001caf92c' },
  { key: 'venus', id: 'd40d8f53-b248-4c75-912b-14cc9bb106e7' },
  { key: 'soleil', id: '602b31a1-ef28-462f-a579-2d4847eab21c' },
  { key: 'tesson', id: '690c2ab6-a5a6-41c7-8c08-f05fe7f86f1c' }
];

// Rogne les marges transparentes (bbox alpha) + 1 px de garde → l'emblème remplit
// la case (object-fit: contain côté CSS).
const trim = (buf) => {
  const png = PNG.sync.read(buf);
  const { width: W, height: H, data } = png;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 24) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return buf;
  minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1);
  maxX = Math.min(W - 1, maxX + 1); maxY = Math.min(H - 1, maxY + 1);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y + minY) * W + (x + minX)) * 4, di = (y * w + x) * 4;
      out.data[di] = data[si]; out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2]; out.data[di + 3] = data[si + 3];
    }
  }
  return PNG.sync.write(out);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const FILTER = process.argv[2] || '';
fs.mkdirSync(OUT, { recursive: true });
for (const it of ICONS) {
  if (FILTER && !it.key.includes(FILTER)) continue;
  if (!it.id) { console.log(it.key, '— pas d\'id, skip'); continue; }
  let png = null;
  for (let i = 0; i < 80 && !png; i += 1) {
    try {
      const r = await fetch(`https://api.pixellab.ai/mcp/objects/${it.id}/download`);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 300 && buf.subarray(0, 4).equals(PNG_SIG)) png = buf;
      }
    } catch { /* pas prêt */ }
    if (!png) await sleep(15000);
  }
  if (!png) { console.warn(it.key, '— pas prêt (timeout, objet expiré ?), skip'); continue; }
  fs.writeFileSync(`${OUT}/${it.key}.png`, trim(png));
  console.log(it.key, '→', it.key + '.png');
}
console.log('OK — icônes dans', OUT);
