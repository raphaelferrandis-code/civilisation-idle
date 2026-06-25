// Télécharge les objets-bateaux PixelLab (zip /download) et écrit la SEULE vue est
// → public/pixelart/agents/boat-{stage}.png (frame unique, 64px).
//   Les bateaux suivent le fleuve en paramétrique : le moteur (drawShips) fait le
//   miroir est↔ouest et l'inclinaison → une seule direction (est, proue à droite) suffit.
//   Générique : ne nécessite que l'object_id. Attend que l'objet soit prêt.
//   ⚠ Sprites STATIQUES de base. scripts/fetchBoatAnims.mjs écrit ensuite les bandes
//     ANIMÉES (multi-frames) PAR-DESSUS ces mêmes fichiers → lance fetchBoatAnims
//     APRÈS, et ne relance PAS ce script seul si tu veux garder les animations.
//   Lancer : node scripts/fetchBoats.mjs
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents';
// stage = clé de sprite (cf. BOAT_SIZES dans agents.js). Le cosmic a 3 teintes par
// band → stages 'cosmic-7' / 'cosmic-8' / 'cosmic-9' (band 8/9 dérivés par recolor
// create_object_state, même silhouette). Ajoute un id quand l'objet est généré.
const BOATS = [
  { stage: 'sail', id: '370e453f-6409-44ae-94dc-b9e0e74e24ea' }, // voilier (tranche verticale)
  { stage: 'raft', id: 'e025f434-daf6-40f2-ab6d-f486c0aa845b' }, // radeau de rondins liés
  { stage: 'steam', id: '6ff81cf1-de77-4d79-b99a-d3095077b7e1' }, // vapeur à roue à aubes + cheminée
  { stage: 'container', id: '966ca590-b013-48fa-94e7-1adb0be16603' }, // porte-conteneurs moderne
  { stage: 'cosmic-7', id: 'ba5bcb10-c88e-4b2d-bee4-2946d2efdf78' }, // vaisseau cosmique (band 7, base verte)
  { stage: 'cosmic-8', id: '7dd910b8-21d8-4bd8-9daf-f4d3c0f620bf' }, // recolor or    (create_object_state de cosmic-7)
  { stage: 'cosmic-9', id: '806d76a4-40a9-45c7-8937-c3d1f3e52d1e' }, // recolor violet (create_object_state de cosmic-7)
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX = /rotations\/east\.png$/i;

fs.mkdirSync(OUT, { recursive: true });
for (const b of BOATS) {
  if (!b.id) { console.log(b.stage, '— pas d\'id, skip'); continue; }
  let east = null;
  for (let t = 0; t < 48 && !east; t += 1) {
    try {
      const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/objects/${b.id}/download`).then((r) => r.arrayBuffer()));
      for (const e of new AdmZip(buf).getEntries()) {
        if (RX.test(e.entryName)) east = e.getData();
      }
    } catch { /* pas prêt */ }
    if (!east) await sleep(15000);
  }
  if (!east) { console.warn(b.stage, '— pas prêt (timeout), skip'); continue; }
  fs.writeFileSync(`${OUT}/boat-${b.stage}.png`, east);
  console.log(b.stage, '— vue est écrite → boat-' + b.stage + '.png');
}
console.log('OK — bateaux dans', OUT);
