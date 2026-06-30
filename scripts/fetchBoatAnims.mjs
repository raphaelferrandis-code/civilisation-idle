// Télécharge les animations EST des bateaux (PixelLab v3) et assemble une BANDE
// horizontale → public/pixelart/agents/boat-{stage}.png (N frames carrées). Les
// bateaux ne rendent que l'est (le moteur fait le miroir ouest) → 1 seule direction.
//   La frame 0 d'une anim v3 = la pose de repos (= le sprite statique) → continuité.
//   Le zip /download ne contient PAS les frames d'anim → URLs directes (cf.
//   fetchVehicleAnims.mjs). anim = animation_group_id renvoyé par animate_object.
//   Auto-détecte le nombre de frames (fetch jusqu'au 404) et POLL (attend que les
//   frames apparaissent : génération ~7 min). Lancer : node scripts/fetchBoatAnims.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/boats';
const PROJECT = 'f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const DIR = 'east';
// ⚠ anim = animId du SEGMENT D'URL (≠ animation_group_id renvoyé par animate_object).
// Le récupérer via get_object : champ « east: …/animations/<animId>/east/{i}.png ».
const BOATS = [
  { stage: 'raft',      obj: 'e025f434-daf6-40f2-ab6d-f486c0aa845b', anim: '5c7ba67c-f151-4cd4-a5ea-285594a2e004' },
  { stage: 'sail',      obj: '370e453f-6409-44ae-94dc-b9e0e74e24ea', anim: '9d3598e3-0288-4022-9076-37bce461ceb7' },
  { stage: 'steam',     obj: '6ff81cf1-de77-4d79-b99a-d3095077b7e1', anim: '7d526933-5b44-46c1-906b-edb2d79f1700' },
  { stage: 'cosmic-7',  obj: 'ba5bcb10-c88e-4b2d-bee4-2946d2efdf78', anim: 'acf72970-36ff-4e50-8b59-3bc80e46a1c0' },
  { stage: 'cosmic-8',  obj: '7dd910b8-21d8-4bd8-9daf-f4d3c0f620bf', anim: 'd9170b1a-4523-414d-8b23-7f4dd3952549' },
  { stage: 'cosmic-9',  obj: '806d76a4-40a9-45c7-8937-c3d1f3e52d1e', anim: '65392e5d-82c6-4473-980d-b8af7204f8f2' },
  { stage: 'container', obj: '966ca590-b013-48fa-94e7-1adb0be16603', anim: '4aad4f99-3123-4766-a8f7-435164da77ed' },
];
const frameUrl = (obj, anim, f) =>
  `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PROJECT}/${obj}/animations/${anim}/${DIR}/${f}.png`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tryFetch = async (url) => { try { const r = await fetch(url); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; } catch { return null; } };

fs.mkdirSync(OUT, { recursive: true });
for (const b of BOATS) {
  // Attend la frame 0 (poll ~12 min), puis récupère les suivantes jusqu'au 404.
  let f0 = null;
  for (let t = 0; t < 48 && !f0; t += 1) { f0 = await tryFetch(frameUrl(b.obj, b.anim, 0)); if (!f0) await sleep(15000); }
  if (!f0) { console.warn(b.stage, '— anim pas prête (timeout), skip'); continue; }
  const bufs = [f0];
  for (let f = 1; f < 32; f += 1) { const buf = await tryFetch(frameUrl(b.obj, b.anim, f)); if (!buf) break; bufs.push(buf); }
  const imgs = bufs.map((buf) => PNG.sync.read(buf));
  const W = imgs[0].width, H = imgs[0].height, NF = imgs.length;
  const strip = new PNG({ width: W * NF, height: H });
  imgs.forEach((im, f) => {
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const si = (y * W + x) * 4, di = (y * (W * NF) + (f * W + x)) * 4;
      strip.data[di] = im.data[si]; strip.data[di + 1] = im.data[si + 1];
      strip.data[di + 2] = im.data[si + 2]; strip.data[di + 3] = im.data[si + 3];
    }
  });
  fs.writeFileSync(`${OUT}/boat-${b.stage}.png`, PNG.sync.write(strip));
  console.log(`boat-${b.stage}.png — bande ${W}×${H} ×${NF} frames`);
}
console.log('OK — bateaux animés dans', OUT);
