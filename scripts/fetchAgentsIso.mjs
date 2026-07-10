// fetchAgentsIso.mjs — télécharge les personnages PixelLab 8-directions et
// assemble les 4 bandes de marche DIAGONALES → public/pixelart/agents/
// inhabitants/{name}-{southeast|southwest|northeast|northwest}.png (6 frames de
// 68 px, mêmes conventions que fetchAgents.mjs). Chantier iso Phase 4 : en mode
// losange, la direction MONDE se projette sur une diagonale ÉCRAN (E→SE, O→NO,
// S→SO, N→NE) → seules ces 4 vues servent. ⚠ Personnages PixelLab expirés ~8h.
//   Lancer : node scripts/fetchAgentsIso.mjs   (filtre : … greekman)
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/inhabitants';
const DIRS = ['south-east', 'south-west', 'north-east', 'north-west'];
const FRAMES = 6;
const CHARS = [
  // Pilote Phase 4 (2026-07-11) : LE grec de l'ère antique. Les autres persos
  // (5 ères × h/f/enfant + variantes) suivront par vagues une fois le pilote
  // validé in-game — même recette : create_character standard 8-dirs size 48
  // (canvas 68) + animate walking-6-frames sur les 4 diagonales.
  { name: 'greekman', id: 'af97ef76-f638-4720-94af-a6d61c7bbda7' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX = /animations\/[^/]+\/(south-east|south-west|north-east|north-west)\/frame_(\d+)\.png$/i;

fs.mkdirSync(OUT, { recursive: true });
const FILTER = process.argv[2] || '';
for (const ch of CHARS) {
  if (FILTER && !ch.name.includes(FILTER)) continue;
  let frames = null;
  for (let t = 0; t < 30 && !frames; t += 1) {
    try {
      const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/characters/${ch.id}/download`).then((r) => r.arrayBuffer()));
      const byDir = { 'south-east': [], 'south-west': [], 'north-east': [], 'north-west': [] };
      for (const e of new AdmZip(buf).getEntries()) {
        const m = e.entryName.match(RX);
        if (m) byDir[m[1].toLowerCase()].push({ f: +m[2], data: e.getData() });
      }
      if (DIRS.every((d) => byDir[d].length >= FRAMES)) {
        for (const d of DIRS) byDir[d].sort((a, b) => a.f - b.f);
        frames = byDir;
      }
    } catch { /* zip pas prêt */ }
    if (!frames) await sleep(15000);
  }
  if (!frames) { console.warn(ch.name, '— diagonales pas prêtes (timeout), skip'); continue; }
  for (const d of DIRS) {
    const imgs = frames[d].slice(0, FRAMES).map((e) => PNG.sync.read(e.data));
    const fw = imgs[0].width, fh = imgs[0].height;
    const strip = new PNG({ width: fw * FRAMES, height: fh });
    for (let i = 0; i < FRAMES; i += 1) PNG.bitblt(imgs[i], strip, 0, 0, fw, fh, i * fw, 0);
    const outName = `${ch.name}-${d.replace('-', '')}.png`;
    fs.writeFileSync(`${OUT}/${outName}`, PNG.sync.write(strip));
    console.log(ch.name, d, '→', outName, `(${fw}×${fh} ×${FRAMES})`);
  }
}
console.log('OK — bandes diagonales dans', OUT);
