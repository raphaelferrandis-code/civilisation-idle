// fetchVehiclesIsoAnim.mjs — télécharge les animations « rolling » (roues qui
// tournent) des objets-véhicules PixelLab et assemble les 4 bandes DIAGONALES
// multi-frames → public/pixelart/agents/vehicles/veh-{type}-{dir}.png.
// ⚠ ÉCRASE les vues 1-frame du même nom : le lecteur (ensureVehDiag +
// drawIsoVehicle) est adaptatif (nf = largeur/hauteur) → bascule seule en animé.
// Zip objets : entrées animations/<uuid|nom>/<direction>/<i>.png (frames carrées).
// IDEMPOTENT par présence d'une bande multi-frames (sauf --force) ; un type dont
// l'anim n'est pas prête garde ses 1-frame et sera repris à la passe suivante.
//   Lancer : node scripts/fetchVehiclesIsoAnim.mjs   (filtre : … cart)
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/vehicles';
const DIRS = ['south-east', 'south-west', 'north-east', 'north-west'];
const ROSTER = JSON.parse(fs.readFileSync('scripts/isoBatchRoster.json', 'utf8'));
const VEHS = (ROSTER.vehicles || []).filter((v) => v.id);
const FORCE = process.argv.includes('--force');
const FILTER = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// frames d'anim : `animations/…/<dir>/<i>.png` (objets) ou `frame_<i>.png` (persos)
const RX = /animations\/[^/]+\/(south-east|south-west|north-east|north-west)\/(?:frame_)?(\d+)\.png$/i;

// Une bande est « déjà animée » si le PNG existe ET est plus large que haut ×2
// (les 1-frame sont carrés) — l'idempotence des 1-frame ne suffit plus ici.
const isAnimated = (p) => {
  if (!fs.existsSync(p)) return false;
  try {
    const png = PNG.sync.read(fs.readFileSync(p));
    return png.width >= png.height * 2;
  } catch { return false; }
};

fs.mkdirSync(OUT, { recursive: true });
for (const v of VEHS) {
  if (FILTER && !v.name.includes(FILTER)) continue;
  const outPath = (d) => `${OUT}/veh-${v.name}-${d.replace('-', '')}.png`;
  if (!FORCE && DIRS.every((d) => isAnimated(outPath(d)))) {
    console.log(v.name, '— bandes animées déjà présentes, skip');
    continue;
  }
  let frames = null;
  for (let t = 0; t < 8 && !frames; t += 1) {
    try {
      const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/objects/${v.id}/download`).then((r) => r.arrayBuffer()));
      const byDir = { 'south-east': [], 'south-west': [], 'north-east': [], 'north-west': [] };
      for (const e of new AdmZip(buf).getEntries()) {
        const m = e.entryName.match(RX);
        if (m) byDir[m[1].toLowerCase()].push({ f: +m[2], data: e.getData() });
      }
      if (DIRS.every((d) => byDir[d].length >= 4)) {         // ≥4 frames = anim livrée
        for (const d of DIRS) byDir[d].sort((a, b) => a.f - b.f);
        frames = byDir;
      }
    } catch { /* zip pas prêt */ }
    if (!frames) await sleep(12000);
  }
  if (!frames) { console.warn(v.name, '— anim diagonale pas prête, skip (repassera)'); continue; }
  for (const d of DIRS) {
    const imgs = frames[d].map((e) => PNG.sync.read(e.data));
    const fw = imgs[0].width, fh = imgs[0].height;
    const strip = new PNG({ width: fw * imgs.length, height: fh });
    for (let i = 0; i < imgs.length; i += 1) PNG.bitblt(imgs[i], strip, 0, 0, fw, fh, i * fw, 0);
    fs.writeFileSync(outPath(d), PNG.sync.write(strip));
    console.log(v.name, d, '→', `veh-${v.name}-${d.replace('-', '')}.png`, `(${fw}×${fh} ×${imgs.length})`);
  }
}
console.log('OK — bandes véhicules animées dans', OUT);
