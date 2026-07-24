// Télécharge l'animation du MULET COUCHÉ de la halte de caravane (stade 0) et
// l'assemble en bande horizontale → public/pixelart/agents/buildings/caravan-mule-rest.png.
// Le rendu joue la bande en VA-ET-VIENT d'images (muleRestFrame dans cityEngineSprites.js) :
// la tête se lève puis se repose, le corps ne bouge pas. Il n'y a donc PAS de sens de
// marche ici — une seule bande, pas de est/ouest comme l'ancien mulet qui faisait la navette.
//   Frames aux URLs directes backblaze (le zip /download NE contient PAS l'anim).
//   Nombre de frames auto-détecté (0.png, 1.png, … jusqu'au premier manquant).
//   ANIM = animation_id RÉEL (≠ animation_group_id renvoyé par animate_object ; il se lit
//   dans l'URL des frames que get_object affiche une fois le job terminé).
//   Lancer : node scripts/fetchCaravanMuleRest.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/buildings';
const PROJECT = 'f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const OBJ = 'ee262e51-7fc4-4fbc-a72f-ccb8475ffbcc'; // mulet bâté couché (candidat 1 du lot 2026-07-24)
const ANIM = process.env.MULE_REST_ANIM || '';      // animation_id (group id : 8e16ce93-b8fa-4827-aff9-69d44d497d39)
const DIR = 'unknown';                              // objet 1-direction
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

if (!ANIM) {
  console.error('animation_id manquant — passer MULE_REST_ANIM=<uuid> (lu dans l\'URL des frames via get_object)');
  process.exit(2);
}

const frameUrl = (f) =>
  `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PROJECT}/${OBJ}/animations/${ANIM}/${DIR}/${f}.png`;

const imgs = [];
for (let f = 0; f < 32; f += 1) {
  let buf = null;
  try {
    const r = await fetch(frameUrl(f));
    if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 200 && b.subarray(0, 4).equals(PNG_SIG)) buf = b; }
  } catch { /* fin de la bande */ }
  if (!buf) break;
  imgs.push(PNG.sync.read(buf));
}
if (!imgs.length) { console.error('aucune frame (anim pas prête ? animId faux ?)'); process.exit(1); }

const W = imgs[0].width, H = imgs[0].height, N = imgs.length;
fs.mkdirSync(OUT, { recursive: true });
const strip = new PNG({ width: W * N, height: H });
imgs.forEach((im, f) => {
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const si = (y * W + x) * 4, di = (y * (W * N) + (f * W + x)) * 4;
    strip.data[di] = im.data[si]; strip.data[di + 1] = im.data[si + 1];
    strip.data[di + 2] = im.data[si + 2]; strip.data[di + 3] = im.data[si + 3];
  }
});
fs.writeFileSync(`${OUT}/caravan-mule-rest.png`, PNG.sync.write(strip));
console.log(`caravan-mule-rest.png (${W}×${H} ×${N})`);
console.log('→ vérifier MULE_REST_NF et MULE_REST_FOOT dans src/game/map/cityEngineSprites.js');
