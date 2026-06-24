// Télécharge les objets-véhicules PixelLab (zip /download) et écrit les 4 cardinales
// → public/pixelart/agents/veh-{name}-{dir}.png (frames uniques, 68px).
//   Générique : ne nécessite que l'object_id. Attend que l'objet soit prêt.
//   Lancer : node scripts/fetchVehicles.mjs
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents';
const DIRS = ['east', 'west', 'south', 'north'];
const VEHS = [
  { name: 'cart', id: '271e95ab-c038-4899-8354-b26d510e1a7f' }, // charrette
  { name: 'barrow', id: '510edd1e-52f9-4c81-b622-1e4ec450769d' }, // brouette
  { name: 'wagon', id: '4f71f9b3-d89f-49dc-8109-a5d3e8af878f' }, // wagon bâché
  { name: 'chariot', id: 'dfd60da7-6e35-4949-9fee-eb3ec116654b' }, // char romain
  { name: 'caravan', id: '81e548dc-68ca-4cf3-bd7d-3a46703c6713' }, // caravane marchande
  { name: 'car', id: '32c2fd7c-f5e2-4689-b909-0ea27dd3427b' }, // voiture ancienne
  { name: 'tram', id: 'a70a2942-a5f6-4ff8-a64b-d25459529d45' }, // tram
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX = /rotations\/(east|west|south|north)\.png$/i;

fs.mkdirSync(OUT, { recursive: true });
for (const v of VEHS) {
  let ent = null;
  for (let t = 0; t < 24 && !ent; t += 1) {
    try {
      const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/objects/${v.id}/download`).then((r) => r.arrayBuffer()));
      const got = {};
      for (const e of new AdmZip(buf).getEntries()) {
        const m = e.entryName.match(RX);
        if (m) got[m[1].toLowerCase()] = e.getData();
      }
      if (DIRS.every((d) => got[d])) ent = got;
    } catch { /* pas prêt */ }
    if (!ent) await sleep(15000);
  }
  if (!ent) { console.warn(v.name, '— pas prêt (timeout), skip'); continue; }
  for (const d of DIRS) fs.writeFileSync(`${OUT}/veh-${v.name}-${d}.png`, ent[d]);
  console.log(v.name, '— 4 directions écrites');
}
console.log('OK — véhicules dans', OUT);
