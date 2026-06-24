// Télécharge les 10 tilesets de route PixelLab et extrait leur tuile PLEINE
// (4 coins « lower » = surface de route sans couture) → public/pixelart/_streets_src/band{N}.png.
// Ces surfaces alimentent makeStreetTiles.mjs (habillage des tuiles edge-Wang).
//   Lancer : node scripts/fetchStreetSurfaces.mjs   (Node 18+ : fetch global)
import { PNG } from 'pngjs';
import fs from 'node:fs';

const OUT = 'public/pixelart/_streets_src';
const BASE = 'https://api.pixellab.ai/mcp/tilesets';
// [bande, tileset_id] — générés par create_topdown_tileset (route → herbe), par ère.
// v3 — surfaces UNIFORMES sans lignes/bandes/joints (une route n'a pas de traits qui
// se répètent par cellule). Distinctes du sol (pavé chargé) par leur uniformité + valeur.
const TS = [
  [0, '62f34c1e-2178-415f-9beb-b12bad021986'], // terre uniforme (régénérée)
  [1, 'c90d8958-6789-41aa-bfe0-1eaaf35a676f'], // terre brune uniforme
  [2, 'fa7c4f48-ba2f-4f37-bbbc-cd8928996a15'], // gravier gris uniforme
  [3, '4306969d-391d-4540-a809-388c2826451a'], // pierre claire uniforme (régénérée)
  [4, 'c395df8a-48f7-4555-a2d3-425e23e0186a'], // marbre sombre poli uniforme
  [5, 'c47234be-8dd4-4192-9251-00fa6ff17c9c'], // asphalte sombre uniforme
  [6, '4ca1c32c-34e1-41e8-805c-f2330170cc48'], // béton clair uniforme
  [7, '68e7db55-af41-41fe-9f43-e6cc88cccc07'], // blanc lumineux uniforme
  [8, '7b864bee-d6a0-4ae4-a4c8-3762240d9bd4'], // métal bleu mat uniforme
  [9, '4a1eaccc-6517-419f-a92e-71475f05a28c'], // pierre sombre + paillettes d'or
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Attend que le tileset soit généré (metadata exploitable + tuile pleine).
async function waitFull(id, tries = 30, delay = 20000) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const meta = await fetch(`${BASE}/${id}/metadata`).then((r) => (r.ok ? r.json() : null));
      const tiles = meta && meta.tileset_data && meta.tileset_data.tiles;
      const full = tiles && tiles.find((t) => t.corners.NW === 'lower' && t.corners.NE === 'lower' && t.corners.SE === 'lower' && t.corners.SW === 'lower');
      if (full) return { meta, full };
    } catch { /* en cours */ }
    await sleep(delay);
  }
  return null;
}

fs.mkdirSync(OUT, { recursive: true });
for (const [band, id] of TS) {
  try {
    const r = await waitFull(id);
    if (!r) { console.warn('band' + band, '— pas prêt (timeout), skip'); continue; }
    const { meta, full } = r;
    const buf = Buffer.from(await fetch(`${BASE}/${id}/image`).then((r2) => r2.arrayBuffer()));
    const png = PNG.sync.read(buf);
    const { x, y } = full.bounding_box;
    const out = new PNG({ width: 32, height: 32 });
    for (let yy = 0; yy < 32; yy += 1) for (let xx = 0; xx < 32; xx += 1) {
      const si = ((y + yy) * png.width + (x + xx)) * 4, di = (yy * 32 + xx) * 4;
      out.data[di] = png.data[si]; out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2]; out.data[di + 3] = 255;
    }
    fs.writeFileSync(`${OUT}/band${band}.png`, PNG.sync.write(out));
    console.log('surface band' + band, '←', meta.lower_description || id);
  } catch (e) {
    console.error('band' + band, 'ERREUR', e.message);
  }
}
console.log('OK — surfaces dans', OUT);
