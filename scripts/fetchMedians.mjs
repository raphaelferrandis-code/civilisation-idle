// fetchMedians.mjs — télécharge les SCÈNES de terre-plein (PixelLab map-objects)
//   → public/pixelart/medians/<key>.png. Jumeau de fetchBridges.mjs, pour le rework
//   pixel-art du refuge central planté des grands axes (avenues/boulevards).
//   Bande verticale tileable (gazon + bordure + arbres/haies + massifs), SANS
//   lampadaires (restent procéduraux, glow de nuit). Endpoint /map-objects/{id}/download.
//   ⚠ Objets PixelLab auto-supprimés après 8h → lancer dans la foulée.
//   Lancer :  node scripts/fetchMedians.mjs   (filtre : node scripts/fetchMedians.mjs antique)
import fs from 'node:fs';

const OUT = 'public/pixelart/medians';

// 5 stades (comme le pont/les places) : antique → classique → industriel → moderne → futuriste.
const SCENES = [
  { key: 'median-antique-scene',   id: '17218c9b-a69e-4805-a697-5ec1b19631ed' }, // planté arbres+fleurs+bordure (56×256, v2)
  { key: 'median-classique-scene', id: '6750fb48-e07f-46de-92f0-6734fc0e88f4' }, // jardin taillé + marbre
  { key: 'median-industriel-scene',id: 'a5f4bc5f-2d8b-42f3-b152-148d69502704' }, // bacs fonte + arbres
  { key: 'median-moderne-scene',   id: '7e52a971-31a7-4372-a21d-6eec58766a07' }, // bacs béton + arbustes
  { key: 'median-futuriste-scene', id: '30bf6bf8-47fa-4ed4-8a21-fd2b6f3d5349' }, // planter néon bioluminescent
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const FILTER = process.argv[2] || '';

fs.mkdirSync(OUT, { recursive: true });
for (const s of SCENES) {
  if (FILTER && !s.key.includes(FILTER)) continue;
  if (!s.id) { console.log(s.key, '— pas d\'id, skip'); continue; }
  const urls = [
    `https://api.pixellab.ai/mcp/map-objects/${s.id}/download`,
    `https://api.pixellab.ai/mcp/objects/${s.id}/download`,
  ];
  let png = null;
  for (let i = 0; i < 80 && !png; i += 1) {
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 500 && buf.subarray(0, 4).equals(PNG_SIG)) { png = buf; break; } }
      } catch { /* pas prêt */ }
    }
    if (!png) await sleep(15000);
  }
  if (!png) { console.warn(s.key, '— pas prêt (timeout, objet expiré ?), skip'); continue; }
  fs.writeFileSync(`${OUT}/${s.key}.png`, png);
  console.log(s.key, '— écrit →', s.key + '.png', `(${png.length} o)`);
}
console.log('OK — scènes dans', OUT);
