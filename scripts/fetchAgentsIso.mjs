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
// DA « Figurine d'époque » (2026-07-11) — le roster du batch vit dans
// scripts/isoBatchRoster.json (source unique : prompts + ids + états). Ce script
// assemble les persos dont l'id est posé ; IDEMPOTENT : saute un perso dont les
// 4 bandes existent déjà (relançable en boucle pendant que le batch tourne).
const ROSTER = JSON.parse(fs.readFileSync('scripts/isoBatchRoster.json', 'utf8'));
const CHARS = ROSTER.chars.filter((c) => c.id);
const FORCE = process.argv.includes('--force');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX = /animations\/[^/]+\/(south-east|south-west|north-east|north-west)\/frame_(\d+)\.png$/i;

fs.mkdirSync(OUT, { recursive: true });
const FILTER = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : '';
for (const ch of CHARS) {
  if (FILTER && !ch.name.includes(FILTER)) continue;
  // Idempotence : les 4 bandes déjà assemblées → skip (sauf --force).
  if (!FORCE && DIRS.every((d) => fs.existsSync(`${OUT}/${ch.name}-${d.replace('-', '')}.png`))) {
    console.log(ch.name, '— déjà assemblé, skip');
    continue;
  }
  // Poll court par perso (2 min max) : un perso pas prêt sera repris à la
  // PROCHAINE passe (le script est relancé en boucle pendant le batch).
  let frames = null;
  for (let t = 0; t < 10 && !frames; t += 1) {
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
    if (!frames) await sleep(12000);
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
