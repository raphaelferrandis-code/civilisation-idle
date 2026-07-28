// fetchIsoPhase5.mjs — récolte l'art Phase 5 du chantier iso :
//   • BATEAUX PAR STADE en 8 rotations (objets 8-direction 80px) →
//     public/pixelart/iso/boat-{stage}-{south|southeast|east|…}.png (1 frame chacun).
// Roster : section "boatsIso" de scripts/isoBatchRoster.json.
// (Le mode « wheels » — bandes iso/mill-wheel-* de l'ancien moulin riverain — a été
// retiré à la refonte éolienne 2026-07-28 : plus aucun consommateur, l'hélice est
// désormais un sprite statique tourné par blitPropRot, cf. scripts/fetchProps.mjs.)
// IDEMPOTENT (présence des 8 PNG par bateau ; --force pour écraser).
//   Lancer : node scripts/fetchIsoPhase5.mjs [boats] [filtre] [--force]
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/iso';
const ROSTER = JSON.parse(fs.readFileSync('scripts/isoBatchRoster.json', 'utf8'));
const FORCE = process.argv.includes('--force');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MODE = args[0] || 'all';           // boats | all
const FILTER = args[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROT_RX = /rotations\/(south|south-east|east|north-east|north|north-west|west|south-west)\.png$/i;
const BOAT_DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

fs.mkdirSync(OUT, { recursive: true });
const zipOf = async (id) => Buffer.from(await fetch(`https://api.pixellab.ai/mcp/objects/${id}/download`).then((r) => r.arrayBuffer()));

if (MODE === 'boats' || MODE === 'all') {
  for (const b of (ROSTER.boatsIso || [])) {
    if (FILTER && !b.name.includes(FILTER)) continue;
    const outPath = (d) => `${OUT}/boat-${b.name}-${d.replace(/-/g, '')}.png`;
    if (!FORCE && BOAT_DIRS.every((d) => fs.existsSync(outPath(d)))) {
      console.log('boat', b.name, '— 8 rotations déjà présentes, skip');
      continue;
    }
    let views = null;
    for (let t = 0; t < 8 && !views; t += 1) {
      try {
        const got = {};
        for (const e of new AdmZip(await zipOf(b.id)).getEntries()) {
          const m = e.entryName.match(ROT_RX);
          if (m) got[m[1].toLowerCase()] = e.getData();
        }
        if (BOAT_DIRS.every((d) => got[d])) views = got;
      } catch { /* pas prêt */ }
      if (!views) await sleep(12000);
    }
    if (!views) { console.warn('boat', b.name, '— rotations pas prêtes, skip (repassera)'); continue; }
    for (const d of BOAT_DIRS) fs.writeFileSync(outPath(d), views[d]);
    console.log('boat', b.name, '— 8 rotations écrites');
  }
}
console.log('OK — art Phase 5 dans', OUT);
