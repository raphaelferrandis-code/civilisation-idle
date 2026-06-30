// Télécharge les personnages-animaux de trait (PixelLab) et assemble les BANDES de
// marche → public/pixelart/agents/{name}-{dir}.png (4 directions × N frames, 68px),
// au même format que les habitants (villager-{dir}.png).
//   Source : zip /characters/{id}/download. ⚠ Ce zip est PARTIEL — il ne contient que
//   les directions déjà rendues. On re-télécharge tant que les 4 directions n'y sont pas.
//   Lancer : node scripts/fetchDraftAnimals.mjs
import AdmZip from 'adm-zip';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/animals';
const DIRS = ['south', 'north', 'east', 'west'];
const ANIMALS = [
  { name: 'horse', id: '19ada8a2-dae0-4dda-9050-fc3eeda57ee9' }, // cheval de trait
  { name: 'ox', id: '41bbf269-9c39-4fc0-94b9-a42bb8c179ba' },    // bœuf de trait
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// .../animations/<action>/<dir>/frame_000.png  (le n° peut avoir un préfixe frame_)
const frameRx = (dir) => new RegExp(`/animations/[^/]+/${dir}/(?:frame[_-]?)?(\\d+)\\.png$`, 'i');

fs.mkdirSync(OUT, { recursive: true });
for (const a of ANIMALS) {
  // 1) Télécharger le zip ; attendre qu'il contienne les 4 directions.
  let zip = null;
  for (let t = 0; t < 60 && !zip; t += 1) {
    try {
      const r = await fetch(`https://api.pixellab.ai/mcp/characters/${a.id}/download`);
      if (r.ok) {
        const z = new AdmZip(Buffer.from(await r.arrayBuffer()));
        const names = z.getEntries().map((e) => e.entryName);
        if (DIRS.every((d) => names.some((n) => frameRx(d).test(n)))) { zip = z; break; }
      }
    } catch { /* retry */ }
    process.stdout.write('.');
    await sleep(15000);
  }
  if (!zip) { console.warn(`\n${a.name} — animations incomplètes (timeout), skip`); continue; }

  // 2) Assembler une bande horizontale par direction.
  const names = zip.getEntries().map((e) => e.entryName);
  for (const dir of DIRS) {
    const rx = frameRx(dir);
    const frames = names.filter((n) => rx.test(n))
      .map((n) => ({ n, f: parseInt(n.match(rx)[1], 10) }))
      .sort((x, y) => x.f - y.f);
    const imgs = frames.map((fr) => PNG.sync.read(zip.getEntry(fr.n).getData()));
    const W = imgs[0].width, H = imgs[0].height, N = imgs.length;
    const strip = new PNG({ width: W * N, height: H });
    imgs.forEach((im, i) => {
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
        const si = (y * W + x) * 4, di = (y * (W * N) + (i * W + x)) * 4;
        strip.data[di] = im.data[si]; strip.data[di + 1] = im.data[si + 1];
        strip.data[di + 2] = im.data[si + 2]; strip.data[di + 3] = im.data[si + 3];
      }
    });
    fs.writeFileSync(`${OUT}/${a.name}-${dir}.png`, PNG.sync.write(strip));
    console.log(`${a.name}-${dir}.png (${W}×${H} ×${N})`);
  }
}
console.log('OK — animaux de trait dans', OUT);
