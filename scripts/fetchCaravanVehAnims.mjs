// Télécharge les animations des VÉHICULES de caravane (PixelLab animate_object, v3,
// objets 1-direction → dir "unknown") et assemble chaque anim en bande horizontale
// → public/pixelart/agents/buildings/veh-<name>.png. Le rendu joue la bande
// (blitVehAnim dans cityEngineSprites.js) : roues qui tournent, cheval qui trotte, etc.
//   Frames aux URLs directes backblaze (le zip /download NE contient PAS l'anim).
//   Nombre de frames auto-détecté (0.png, 1.png, … jusqu'au premier manquant).
//   animId = animation_group_id renvoyé par animate_object (à vérifier via get_object).
//   Lancer : node scripts/fetchCaravanVehAnims.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/buildings';
const PROJECT = 'f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const DIR = 'unknown';
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// name (= clé VEH_ANIM) → { obj, anim }
// anim = animation_id RÉEL (≠ animation_group_id renvoyé par animate_object ; extrait de
// l'URL des frames via get_object). group ids : wagon a16a1805 / truck 3726a342 / pod 91d999e9.
const VEHS = [
  { name: 'caravan-wagon', obj: '21b1d1dc-2ff3-48ba-a49e-0a1e9794a7c0', anim: '5d986abf-3ad3-4d4e-abb6-afdbc2f6eb02' },
  { name: 'caravan-truck', obj: '5d3f6a75-6add-4618-a878-5f023604ef5b', anim: 'e0f49a90-6510-4b55-ab46-e812f80cf6dd' },
  { name: 'caravan-pod',   obj: 'c70e2ce3-0fba-4c36-9780-e5a2d4239f20', anim: '09644453-2a1d-4eb3-b16d-b3e9c7944d0e' },
];

const frameUrl = (obj, anim, f) =>
  `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PROJECT}/${obj}/animations/${anim}/${DIR}/${f}.png`;

fs.mkdirSync(OUT, { recursive: true });
for (const v of VEHS) {
  const imgs = [];
  for (let f = 0; f < 32; f += 1) {
    let buf = null;
    try {
      const r = await fetch(frameUrl(v.obj, v.anim, f));
      if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 200 && b.subarray(0, 4).equals(PNG_SIG)) buf = b; }
    } catch { /* fin de la bande */ }
    if (!buf) break;
    imgs.push(PNG.sync.read(buf));
  }
  if (!imgs.length) { console.warn(`${v.name} — aucune frame (anim pas prête ? animId faux ?), skip`); continue; }
  const W = imgs[0].width, H = imgs[0].height, N = imgs.length;
  const strip = new PNG({ width: W * N, height: H });
  imgs.forEach((im, f) => {
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const si = (y * W + x) * 4, di = (y * (W * N) + (f * W + x)) * 4;
      strip.data[di] = im.data[si]; strip.data[di + 1] = im.data[si + 1];
      strip.data[di + 2] = im.data[si + 2]; strip.data[di + 3] = im.data[si + 3];
    }
  });
  fs.writeFileSync(`${OUT}/veh-${v.name}.png`, PNG.sync.write(strip));
  console.log(`veh-${v.name}.png (${W}×${H} ×${N})`);
}
console.log('OK — véhicules animés dans', OUT);
