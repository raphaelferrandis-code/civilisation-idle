// fetchVehiclesIso.mjs — télécharge les objets-véhicules 8-directions PixelLab
// et écrit les 4 vues DIAGONALES → public/pixelart/agents/vehicles/
// veh-{type}-{southeast|southwest|northeast|northwest}.png (1 frame chacune).
// Chantier iso : en losange, la dir monde se projette en diagonale écran ; le
// repli cardinal (bandes animées existantes) reste en place tant qu'une vue
// manque. Roster : section "vehicles" de scripts/isoBatchRoster.json.
// IDEMPOTENT (saute un type dont les 4 PNG existent, sauf --force).
//   Lancer : node scripts/fetchVehiclesIso.mjs   (filtre : … cart)
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/vehicles';
const DIRS = ['south-east', 'south-west', 'north-east', 'north-west'];
const ROSTER = JSON.parse(fs.readFileSync('scripts/isoBatchRoster.json', 'utf8'));
const VEHS = (ROSTER.vehicles || []).filter((v) => v.id);
const FORCE = process.argv.includes('--force');
const FILTER = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX = /rotations\/(south-east|south-west|north-east|north-west)\.png$/i;

fs.mkdirSync(OUT, { recursive: true });
for (const v of VEHS) {
  if (FILTER && !v.name.includes(FILTER)) continue;
  if (!FORCE && DIRS.every((d) => fs.existsSync(`${OUT}/veh-${v.name}-${d.replace('-', '')}.png`))) {
    console.log(v.name, '— déjà présent, skip');
    continue;
  }
  let got = null;
  for (let t = 0; t < 10 && !got; t += 1) {
    try {
      const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/objects/${v.id}/download`).then((r) => r.arrayBuffer()));
      const views = {};
      for (const e of new AdmZip(buf).getEntries()) {
        const m = e.entryName.match(RX);
        if (m) views[m[1].toLowerCase()] = e.getData();
      }
      if (DIRS.every((d) => views[d])) got = views;
    } catch { /* pas prêt */ }
    if (!got) await sleep(12000);
  }
  if (!got) { console.warn(v.name, '— diagonales pas prêtes (timeout), skip'); continue; }
  for (const d of DIRS) fs.writeFileSync(`${OUT}/veh-${v.name}-${d.replace('-', '')}.png`, got[d]);
  console.log(v.name, '— 4 diagonales écrites');
}
console.log('OK — véhicules iso dans', OUT);
