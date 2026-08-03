// fetchAgentFlat.mjs — pipeline de la DA FLAT des habitants (2026-08-03) :
// assemble les 4 bandes de marche DIAGONALES d'un personnage PixelLab et pré-cuit
// les bandes DEMI-TAILLE que le rendu iso affiche au petit zoom (drawNamedAgentIso
// bascule sur {name}-{dir}-half.png quand drawH ≤ 70 % de la bande pleine).
//   node scripts/fetchAgentFlat.mjs assemble <name> <charId>   → backup tmp + zip → 4 bandes
//   node scripts/fetchAgentFlat.mjs half <name>                → 4 bandes -half (÷2 box + palette + alpha binaire)
// Flag --cardinal : travaille les 4 vues CARDINALES (south/east/north/west, fichiers
// {name}-south.png…) au lieu des diagonales — pour les consommateurs de scènes
// (blitFarmer/blitBasket de cityEngineSprites.js) et le rendu legacy top-down.
// ⚠ Le zip /download renvoie HTTP 423 tant qu'UN job de fond du perso pend (2e gen
// v3, anim en cours…) → réessayer plus tard, ou passer par scripts/assembleAgentUrls.mjs.
// Après assemble : passer chaque bande à scripts/quantize.cjs --colors 24 PUIS lancer half.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';

const CARDINAL = process.argv.includes('--cardinal');
const args = process.argv.filter((a) => a !== '--cardinal');
const NAME = args[3];
const CHAR_ID = args[4];
const OUT = 'public/pixelart/agents/inhabitants';
const BACKUP = path.join(os.tmpdir(), 'civ-agents-backup');
const DIRS = CARDINAL ? ['south', 'east', 'north', 'west'] : ['south-east', 'south-west', 'north-east', 'north-west'];
const FRAMES = 6;
const RX = CARDINAL
  ? /animations\/[^/]+\/(south|east|north|west)\/frame_(\d+)\.png$/i
  : /animations\/[^/]+\/(south-east|south-west|north-east|north-west)\/frame_(\d+)\.png$/i;

const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
const setPx = (img, x, y, [r, g, b, a]) => { const i = (y * img.width + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a; };

async function assemble() {
  fs.mkdirSync(BACKUP, { recursive: true });
  for (const d of DIRS) {
    const f = `${NAME}-${d.replace('-', '')}.png`;
    const src = path.join(OUT, f);
    if (fs.existsSync(src) && !fs.existsSync(path.join(BACKUP, f))) fs.copyFileSync(src, path.join(BACKUP, f));
  }
  const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/characters/${CHAR_ID}/download`).then((r) => {
    if (!r.ok) throw new Error('download HTTP ' + r.status);
    return r.arrayBuffer();
  }));
  const byDir = { 'south-east': [], 'south-west': [], 'north-east': [], 'north-west': [] };
  for (const e of new AdmZip(buf).getEntries()) {
    const m = e.entryName.match(RX);
    if (m) byDir[m[1].toLowerCase()].push({ f: +m[2], data: e.getData() });
  }
  for (const d of DIRS) {
    if (byDir[d].length < FRAMES) throw new Error(`${d}: ${byDir[d].length}/${FRAMES} frames — anim pas prête (direction ratée en silence ? re-queuer via animate_character + animation_group_id)`);
    byDir[d].sort((a, b) => a.f - b.f);
    const imgs = byDir[d].slice(0, FRAMES).map((e) => PNG.sync.read(e.data));
    const fw = imgs[0].width, fh = imgs[0].height;
    const strip = new PNG({ width: fw * FRAMES, height: fh });
    for (let i = 0; i < FRAMES; i += 1) PNG.bitblt(imgs[i], strip, 0, 0, fw, fh, i * fw, 0);
    fs.writeFileSync(path.join(OUT, `${NAME}-${d.replace('-', '')}.png`), PNG.sync.write(strip));
    console.log('bande', `${NAME}-${d.replace('-', '')}.png`, `${fw * FRAMES}×${fh}`);
    if (d === 'south-east') {
      // bbox frame 0 → scale runtime suggéré : même hauteur de perso à l'écran que
      // l'ancienne DA (ratio perso/canvas 0.728, scale 0.85 adulte / 0.6 enfant).
      let top = -1, bot = -1;
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        if (imgs[0].data[(y * fw + x) * 4 + 3] > 16) { if (top < 0) top = y; bot = y; break; }
      }
      const ratio = (bot - top + 1) / fh;
      console.log(`  perso ${bot - top + 1}px / canvas ${fh} (ratio ${ratio.toFixed(2)}) → scale adulte ≈ ${(0.85 * 0.728 / ratio).toFixed(2)}, enfant ≈ ${(0.6 * 0.728 / ratio).toFixed(2)}`);
    }
  }
}

function paletteOf(img) {
  const seen = new Map();
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b, a] = px(img, x, y);
    if (a > 128) seen.set((r << 16) | (g << 8) | b, [r, g, b]);
  }
  return [...seen.values()];
}
function half() {
  for (const d of DIRS) {
    const f = path.join(OUT, `${NAME}-${d.replace('-', '')}.png`);
    const src = PNG.sync.read(fs.readFileSync(f));
    const pal = paletteOf(src);
    const w = Math.floor(src.width / 2), h = Math.floor(src.height / 2);
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const [pr, pg, pb, pa] = px(src, x * 2 + dx, y * 2 + dy);
        r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
      }
      if (a / 4 < 128) { setPx(out, x, y, [0, 0, 0, 0]); continue; }
      const m = [r / a, g / a, b / a];
      let best = pal[0], bd = Infinity;
      for (const c of pal) {
        const dd = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2;
        if (dd < bd) { bd = dd; best = c; }
      }
      setPx(out, x, y, [best[0], best[1], best[2], 255]);
    }
    fs.writeFileSync(f.replace('.png', '-half.png'), PNG.sync.write(out));
    console.log('half', `${NAME}-${d.replace('-', '')}-half.png`, `${w}×${h}`);
  }
}

const mode = process.argv[2];
if (!NAME || (mode === 'assemble' && !CHAR_ID)) { console.error('usage: node scripts/fetchAgentFlat.mjs assemble <name> <charId> | half <name>'); process.exit(1); }
if (mode === 'assemble') await assemble();
else if (mode === 'half') half();
else { console.error('usage: node scripts/fetchAgentFlat.mjs assemble <name> <charId> | half <name>'); process.exit(1); }
