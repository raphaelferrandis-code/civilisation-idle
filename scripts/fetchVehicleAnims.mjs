// Télécharge les animations d'OBJETS véhicules (PixelLab) depuis les URLs directes
// des frames et assemble les bandes → public/pixelart/agents/veh-{name}-{dir}.png
// (4 directions × 7 frames carrées). Le rendu joue la bande multi-frames (cf. vnf
// dans agents.js) : roues qui tournent, cheval intégré du char qui trotte, etc.
//   Le zip /objects/{id}/download ne contient PAS les frames d'anim → URLs directes.
//   Récupérer les animIds par direction via get_object (MCP) après génération.
//   Lancer : node scripts/fetchVehicleAnims.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/vehicles';
const PROJECT = 'f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const FRAMES = 7; // v3 : 1 réf + 6 animées
const DIRS = ['south', 'north', 'east', 'west'];

// name → { obj: objectId, anim: { dir: animationId } }
const VEHS = [
  { name: 'chariot', obj: 'dfd60da7-6e35-4949-9fee-eb3ec116654b', anim: {
    south: 'bb0b2951-6fd5-4e9c-bca3-e3da9f44e314', north: 'e9fadec1-78b7-4b89-9547-971f891b8dab',
    east: 'da3ec2bf-bba6-433c-b1eb-71f8896a62b3', west: 'b92177cf-d1da-487d-850d-9e00f6815ebd' } },
  // 'cart' et 'barrow' retirés le 2026-08-23 avec leurs 16 PNG (étape 2 du plan
  // de suppression du legacy) : débranchés côté agents.js depuis longtemps.
  // Leurs object/animation ids restent récupérables dans l'historique git.
  { name: 'wagon', obj: '4f71f9b3-d89f-49dc-8109-a5d3e8af878f', anim: {
    south: 'faf6c723-abe0-49b5-888f-42bc0cfc7145', north: '095e6e00-94ee-4175-9b62-138af47d9887',
    east: '9da87ccf-c294-4c9e-8a73-314eeff9278c', west: 'de59cf61-77f5-4488-aead-30eb47092e56' } },
  { name: 'caravan', obj: '81e548dc-68ca-4cf3-bd7d-3a46703c6713', anim: {
    south: '4a6ae3e7-ecad-480d-bdc2-f4a0058a10ce', north: 'e5fe43c6-d175-46f6-b2bf-7c0f59e5f287',
    east: '18f99744-b4d2-4c70-a1aa-7b4817ce2309', west: 'e56f0351-729e-417c-b3e1-23da760e6e5e' } },
  { name: 'car', obj: '32c2fd7c-f5e2-4689-b909-0ea27dd3427b', anim: {
    south: 'ed10230b-8815-48d1-9a26-7d1d28d469a8', north: 'ad99f1cf-4033-4141-b278-12a97a365e2f',
    east: '741a7e76-023b-4546-bd12-5d59fc8110ca', west: 'f9c1d09c-4dc3-4a30-ac0b-0d02bcf9a145' } },
];

const url = (obj, animId, dir, f) =>
  `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PROJECT}/${obj}/animations/${animId}/${dir}/${f}.png`;

fs.mkdirSync(OUT, { recursive: true });
for (const v of VEHS) {
  for (const dir of DIRS) {
    const animId = v.anim[dir];
    if (!animId) { console.warn(`${v.name} ${dir} — animId manquant, skip`); continue; }
    const imgs = [];
    for (let f = 0; f < FRAMES; f += 1) {
      const buf = Buffer.from(await fetch(url(v.obj, animId, dir, f)).then((r) => r.arrayBuffer()));
      imgs.push(PNG.sync.read(buf));
    }
    const W = imgs[0].width, H = imgs[0].height;
    const strip = new PNG({ width: W * FRAMES, height: H });
    imgs.forEach((im, f) => {
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
        const si = (y * W + x) * 4, di = (y * (W * FRAMES) + (f * W + x)) * 4;
        strip.data[di] = im.data[si]; strip.data[di + 1] = im.data[si + 1];
        strip.data[di + 2] = im.data[si + 2]; strip.data[di + 3] = im.data[si + 3];
      }
    });
    fs.writeFileSync(`${OUT}/veh-${v.name}-${dir}.png`, PNG.sync.write(strip));
    console.log(`veh-${v.name}-${dir}.png (${W}×${H} ×${FRAMES})`);
  }
}
console.log('OK — véhicules animés dans', OUT);
