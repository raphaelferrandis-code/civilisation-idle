// Télécharge les objets-véhicules PixelLab (zip /download) et écrit les 4 cardinales
// → public/pixelart/agents/veh-{name}-{dir}.png (frames uniques, 68px).
//   Générique : ne nécessite que l'object_id. Attend que l'objet soit prêt.
//   Lancer : node scripts/fetchVehicles.mjs
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/vehicles';
const DIRS = ['east', 'west', 'south', 'north'];
// ⚠ Ne mettre ici QUE des véhicules à 1 frame fixe. Tous les ROULANTS (char,
// charrette, brouette, wagon, caravane, voiture) sont désormais ANIMÉS (roues qui
// tournent) via scripts/fetchVehicleAnims.mjs ; les remettre ici les écraserait en
// frame fixe. Le tram roule sur rails (roues cachées) → reste fixe.
const VEHS = [
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
