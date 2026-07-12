// fetchIsoPhase5.mjs — récolte l'art Phase 5 du chantier iso :
//   • ROUES DE MOULIN vues iso animées (objets 1-direction promus, anim
//     « turning » 6 frames) → public/pixelart/iso/mill-wheel-{wood|metal|turbine}.png
//     (bande horizontale, frames carrées 96px) ;
//   • BATEAUX PAR STADE en 8 rotations (objets 8-direction 80px) →
//     public/pixelart/iso/boat-{stage}-{south|southeast|east|…}.png (1 frame chacun).
// Roster : sections "millWheelsIso" + "boatsIso" de scripts/isoBatchRoster.json.
// IDEMPOTENT (largeur de bande pour les roues, présence des 8 PNG pour les
// bateaux ; --force pour écraser). Relançable en boucle pendant le batch.
//   Lancer : node scripts/fetchIsoPhase5.mjs [wheels|boats] [filtre] [--force]
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/iso';
const ROSTER = JSON.parse(fs.readFileSync('scripts/isoBatchRoster.json', 'utf8'));
const FORCE = process.argv.includes('--force');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MODE = args[0] || 'all';           // wheels | boats | all
const FILTER = args[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANIM_RX = /animations\/[^/]+\/[^/]+\/(?:frame_)?(\d+)\.png$/i;
const ROT_RX = /rotations\/(south|south-east|east|north-east|north|north-west|west|south-west)\.png$/i;
const BOAT_DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

fs.mkdirSync(OUT, { recursive: true });
const zipOf = async (id) => Buffer.from(await fetch(`https://api.pixellab.ai/mcp/objects/${id}/download`).then((r) => r.arrayBuffer()));
const isStrip = (p) => {
  if (!fs.existsSync(p)) return false;
  try { const png = PNG.sync.read(fs.readFileSync(p)); return png.width >= png.height * 2; } catch { return false; }
};

if (MODE === 'wheels' || MODE === 'all') {
  const wheels = ROSTER.millWheelsIso || {};
  for (const k of Object.keys(wheels)) {
    if (k.startsWith('_') || (FILTER && !k.includes(FILTER))) continue;
    const out = `${OUT}/mill-wheel-${k}.png`;
    if (!FORCE && isStrip(out)) { console.log('wheel', k, '— bande déjà présente, skip'); continue; }
    let frames = null;
    for (let t = 0; t < 8 && !frames; t += 1) {
      try {
        const list = [];
        for (const e of new AdmZip(await zipOf(wheels[k])).getEntries()) {
          const m = e.entryName.match(ANIM_RX);
          if (m) list.push({ f: +m[1], data: e.getData() });
        }
        if (list.length >= 4) { list.sort((a, b) => a.f - b.f); frames = list; }
      } catch { /* pas prêt */ }
      if (!frames) await sleep(12000);
    }
    if (!frames) { console.warn('wheel', k, '— anim pas prête, skip (repassera)'); continue; }
    const imgs = frames.map((e) => PNG.sync.read(e.data));
    const fw = imgs[0].width, fh = imgs[0].height;
    const strip = new PNG({ width: fw * imgs.length, height: fh });
    for (let i = 0; i < imgs.length; i += 1) PNG.bitblt(imgs[i], strip, 0, 0, fw, fh, i * fw, 0);
    fs.writeFileSync(out, PNG.sync.write(strip));
    console.log('wheel', k, '→', out, `(${fw}×${fh} ×${imgs.length})`);
  }
}

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
