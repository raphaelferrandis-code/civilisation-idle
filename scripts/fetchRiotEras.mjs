// Télécharge les ÉMEUTIERS PixelLab par ère et assemble une BANDE de marche par
// direction → public/pixelart/agents/events/{name}-{dir}.png (6×68px). Même pipeline
// que fetchRiotBasket.mjs : poll du zip /download jusqu'à ce que la marche « angrily »
// y soit, puis assemblage. Le slot d'arme « fork » = l'outil de mêlée de l'ère (lance,
// gourdin, clé, matraque…) ; « torch » = l'objet enflammé (garde le halo nocturne).
//   Lancer tout : node scripts/fetchRiotEras.mjs
//   Une ère    : node scripts/fetchRiotEras.mjs stone
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/events';
const DIRS = ['south', 'east', 'north', 'west'];
const FRAMES = 6;
// name = basename de fichier (slot d'arme torch/fork) ; id = personnage PixelLab.
const CHARS = [
  // ── PRÉHISTOIRE (band ≤ 1) : fourrures, torche = branche enflammée, fork = épieu ──
  { era: 'stone', name: 'rioter-stone-man-torch',   id: '1cdb05c9-7c0e-4535-a2f2-06f1cb857f28' },
  { era: 'stone', name: 'rioter-stone-man-fork',    id: '37ece977-a42e-4c1c-8cb1-732b136149f6' },
  { era: 'stone', name: 'rioter-stone-woman-torch', id: '4d3106f9-c366-4292-83f8-b8aa2bed5bda' },
  { era: 'stone', name: 'rioter-stone-woman-fork',  id: '6d0e6bfe-2bf7-465b-ab0f-eca4abe3f9ae' },
  // ── ANTIQUITÉ (band 4) : tunique/chiton drapé blanc + rouge, torche, fork = lance bronze ──
  { era: 'anti', name: 'rioter-anti-man-torch',   id: '0dadc4bd-6af0-4bdc-b78d-648f8aaecb71' },
  { era: 'anti', name: 'rioter-anti-man-fork',    id: '2345222b-b789-4ce3-9bcc-3df27fe522b5' },
  { era: 'anti', name: 'rioter-anti-woman-torch', id: '1e5d5735-52c8-4653-9e63-176543608f20' },
  { era: 'anti', name: 'rioter-anti-woman-fork',  id: '72457c2c-ce47-4c8c-9d10-d9f1c9d602ab' },
  // ── INDUSTRIEL (band 5-6) : ouvriers XIXe (casquette/tablier), torche, fork = PIED-DE-BICHE (masse « décrochait » de la main → barre fine à 1 main, comme l'épieu) ──
  { era: 'ind', name: 'rioter-ind-man-torch',   id: '62b4dd7a-53ef-41f4-958f-1c0e67bb843a' },
  { era: 'ind', name: 'rioter-ind-man-fork',    id: '3f4f30b1-85df-4ad6-965c-a304f41f1186' },
  { era: 'ind', name: 'rioter-ind-woman-torch', id: 'c6129148-b766-49ef-9a4d-894714dec34e' },
  { era: 'ind', name: 'rioter-ind-woman-fork',  id: '407af68e-d9a3-4bfb-83c3-e57d917d879e' },
  // ── FUTUR (band ≥ 7) : cyberpunk néon (cyan H / magenta F), visière PAS capuche, torche = fusée, fork = matraque élec (refait — 1er jet trop sombre) ──
  { era: 'fut', name: 'rioter-fut-man-torch',   id: 'be088667-5c50-46cb-a856-63d10b8bf995' },
  { era: 'fut', name: 'rioter-fut-man-fork',    id: '2bd19d0a-2679-422a-8389-552f2a32e71c' },
  { era: 'fut', name: 'rioter-fut-woman-torch', id: '4a4bb10f-f76d-4c1a-930f-7bdf3a485f0d' },
  { era: 'fut', name: 'rioter-fut-woman-fork',  id: 'c26504b1-52db-46eb-88c4-f0c63f5756de' },
];

const only = process.argv[2];              // ex: node fetchRiotEras.mjs stone
const list = only ? CHARS.filter((c) => c.era === only) : CHARS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX = /animations\/[^/]+\/(south|east|north|west)\/frame_(\d+)\.png$/i;

fs.mkdirSync(OUT, { recursive: true });
for (const ch of list) {
  let frames = null;
  for (let t = 0; t < 30 && !frames; t += 1) {
    try {
      const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/characters/${ch.id}/download`).then((r) => r.arrayBuffer()));
      const byDir = { south: [], east: [], north: [], west: [] };
      for (const e of new AdmZip(buf).getEntries()) {
        const m = e.entryName.match(RX);
        if (m) byDir[m[1].toLowerCase()].push({ f: +m[2], data: e.getData() });
      }
      if (DIRS.every((d) => byDir[d].length >= FRAMES)) {
        for (const d of DIRS) byDir[d].sort((a, b) => a.f - b.f);
        frames = byDir;
      }
    } catch { /* zip pas prêt */ }
    if (!frames) await sleep(20000);
  }
  if (!frames) { console.warn(ch.name, '— marche pas prête (timeout), skip'); continue; }
  for (const d of DIRS) {
    // v3 rend 7 frames (frame_0 = pose de référence statique) → on prend les 6 DERNIÈRES.
    const imgs = frames[d].slice(-FRAMES).map((fr) => PNG.sync.read(fr.data));
    const W = imgs[0].width, H = imgs[0].height;
    const strip = new PNG({ width: W * FRAMES, height: H });
    imgs.forEach((im, f) => {
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
        const si = (y * W + x) * 4, di = (y * (W * FRAMES) + (f * W + x)) * 4;
        strip.data[di] = im.data[si]; strip.data[di + 1] = im.data[si + 1];
        strip.data[di + 2] = im.data[si + 2]; strip.data[di + 3] = im.data[si + 3];
      }
    });
    fs.writeFileSync(`${OUT}/${ch.name}-${d}.png`, PNG.sync.write(strip));
  }
  console.log(ch.name, '— 4 bandes (' + frames.south[0].data.length + 'o/frame)');
}
console.log('OK — émeutiers assemblés dans', OUT);
