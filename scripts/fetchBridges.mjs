// fetchBridges.mjs — télécharge les SCÈNES de pont (PixelLab map-objects, mode basique)
//   → public/pixelart/bridges/<key>.png (PNG transparent). Mirroir de fetchProps.mjs,
//   dédié au rework pixel-art du pont central (méthode « scène large → slice »,
//   cf. sliceBridge.mjs). Endpoint /objects/{id}/download = PNG DIRECT sans auth.
//   ⚠ Les objets PixelLab s'AUTO-SUPPRIMENT après 8h → lancer dans la foulée de la génération.
//   Lancer :  node scripts/fetchBridges.mjs   (filtre optionnel : node scripts/fetchBridges.mjs bois)
//
//   DA cible (map-object) : lumière HAUT-GAUCHE → ombres BAS-DROITE. Le pont étant un
//   TABLIER À PLAT (comme une route/terrain), vue "high top-down" (plus plat que les
//   bâtiments en "low top-down") pour s'aligner sur l'eau/routes plates de la carte.
import fs from 'node:fs';

const OUT = 'public/pixelart/bridges';

// clé = nom de fichier (sans .png) ; id = objet PixelLab. Éditer au fil des générations.
// CANON = tabliers VERTICAUX (direction B validée 2026-07-06). Bois = 1 voie (48×256),
// pierre/fer/béton/énergie = 2 voies (80×256). Les scènes HORIZONTALES à arches
// (664f8137 bois, a57ce13b pierre) n'étaient qu'une référence de style — écartées.
const SCENES = [
  { key: 'bridge-bois-scene',    id: '0be34649-85df-4cd2-b1d0-e712398bca33' }, // BOIS 1-voie (48×256)
  { key: 'bridge-pierre-scene',  id: '206dbcb6-f84a-4538-bf54-ce2234033a3a' }, // PIERRE 2-voies (80×256, repolie)
  { key: 'bridge-fer-scene',     id: '73a91cf5-e944-433b-b9e2-f8bca9dbd4a9' }, // FER 2-voies (80×256)
  { key: 'bridge-beton-scene',   id: '66c8e21d-a0f1-4eea-aee7-15100d029095' }, // BÉTON 2-voies (80×256)
  { key: 'bridge-energie-scene', id: '4ffdd5a9-342c-40b3-841b-ba9286d63058' }, // ÉNERGIE 2-voies (80×256, v2 pleine longueur)
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const FILTER = process.argv[2] || '';

fs.mkdirSync(OUT, { recursive: true });
for (const s of SCENES) {
  if (FILTER && !s.key.includes(FILTER)) continue;
  if (!s.id) { console.log(s.key, '— pas d\'id, skip'); continue; }
  // Endpoint map-objects (create_map_object) ; repli sur l'ancien /objects/.
  const urls = [
    `https://api.pixellab.ai/mcp/map-objects/${s.id}/download`,
    `https://api.pixellab.ai/mcp/objects/${s.id}/download`,
  ];
  let png = null;
  for (let i = 0; i < 80 && !png; i += 1) {
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > 500 && buf.subarray(0, 4).equals(PNG_SIG)) { png = buf; break; }
        }
      } catch { /* pas prêt */ }
    }
    if (!png) await sleep(15000);
  }
  if (!png) { console.warn(s.key, '— pas prêt (timeout, objet expiré ?), skip'); continue; }
  fs.writeFileSync(`${OUT}/${s.key}.png`, png);
  console.log(s.key, '— écrit →', s.key + '.png', `(${png.length} o)`);
}
console.log('OK — scènes dans', OUT);
