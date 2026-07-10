// fetchIsoTiles.mjs — télécharge les TUILES DE SOL isométriques (PixelLab
//   create_isometric_tile) → public/pixelart/iso/<key>.png. Jumeau de
//   fetchMedians.mjs. Chantier iso Phase 1+ (post-GO Raphaël 2026-07-10) :
//   habillage du sol du renderer losange (isoRenderer.js), repli aplat sinon.
//   ⚠ Objets PixelLab auto-supprimés après 8h → lancer dans la foulée.
//   Lancer :  node scripts/fetchIsoTiles.mjs   (filtre : node scripts/fetchIsoTiles.mjs grass)
import fs from 'node:fs';

const OUT = 'public/pixelart/iso';

const TILES = [
  { key: 'iso-grass',    id: '8d57bc28-78a2-4f0a-aaf9-454ddafe380c' }, // herbe (seed 11)
  // v2 SOBRES (le 1er jet grès/terre — seeds 12-13 — criait en tuilage : trop
  // rose/rouge, joints trop marqués → moiré sur toute la ville) :
  { key: 'iso-dirt',     id: '2973c3be-bfbe-432f-8e5f-f83294cf69f6' }, // terre discrète (seed 24)
  { key: 'iso-pavement', id: '5d30604d-f34f-4ecf-aed4-72f83de95b7c' }, // béton usé discret (seed 23)
  { key: 'iso-plaza',    id: '038eae47-52a3-445c-ab65-ea55413d7cef' }, // dallage marbre place (seed 14)
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const FILTER = process.argv[2] || '';

fs.mkdirSync(OUT, { recursive: true });
for (const t of TILES) {
  if (FILTER && !t.key.includes(FILTER)) continue;
  if (!t.id) { console.log(t.key, "— pas d'id, skip"); continue; }
  // ⚠ Route au SINGULIER (isometric-tile), contrairement à map-objects.
  const urls = [
    `https://api.pixellab.ai/mcp/isometric-tile/${t.id}/download`,
  ];
  let png = null;
  for (let i = 0; i < 40 && !png; i += 1) {
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 300 && buf.subarray(0, 4).equals(PNG_SIG)) { png = buf; break; } }
      } catch { /* pas prêt */ }
    }
    if (!png) await sleep(8000);
  }
  if (!png) { console.warn(t.key, '— pas prêt (timeout / route inconnue ?), skip'); continue; }
  fs.writeFileSync(`${OUT}/${t.key}.png`, png);
  console.log(t.key, '— écrit →', t.key + '.png', `(${png.length} o)`);
}
console.log('OK — tuiles dans', OUT);
