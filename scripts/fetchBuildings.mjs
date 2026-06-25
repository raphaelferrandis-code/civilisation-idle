// Télécharge les objets-bâtiments PixelLab (map objects, vue low top-down) et
// écrit le PNG transparent → public/pixelart/buildings/<id>.png.
//   Clé de fichier = <buildingId>-s<stage>-t<tier> (stage = palier d'ère 0-3 du
//   rendu moteur ; tier = palier d'achat 0-3, cf cmEngineTier). Calqué sur
//   fetchTrees.mjs : l'endpoint /map-objects/{id}/download renvoie un PNG DIRECT
//   sans auth. Poll 15s. Mets l'id à '' pour sauter une entrée.
//   ⚠ Les objets PixelLab s'auto-suppriment après 8h → relancer dans la foulée.
//   Lancer : node scripts/fetchBuildings.mjs
import fs from 'node:fs';

const OUT = 'public/pixelart/buildings';
// DA verrouillée « station qui grandit » (cf mémoire building-art-direction-consistency).
const SPRITES = [
  { key: 'foragers-s0-t0', id: '3312b7f0-e55c-4733-a8b5-b8da7b7dbec8' }, // rack + 2 paniers
  { key: 'foragers-s0-t1', id: '819a93a4-8123-403e-be30-1bb59d0737c0' }, // + paniers + buisson
  { key: 'foragers-s0-t2', id: 'b2f39723-4f7a-4222-ad79-12984748d727' }, // 2 racks + abri + plot pierres
  { key: 'foragers-s0-t3', id: '5126305e-1a2d-4615-bf36-738fe08ad8c7' }, // hameau compact (re-roll ; fallback bfbb2bcb-a698-4ed3-b3df-4116647407ed)
  { key: 'granaries_city-s0-t0', id: 'b1860b8f-4edf-443a-89e2-574283895166' }, // pots + paniers de grain
  { key: 'granaries_city-s0-t1', id: 'be765654-3bdf-4dcd-9118-7df9d31a6553' }, // petit grenier sur pilotis
  { key: 'granaries_city-s0-t2', id: '70b29cdb-401d-4d96-bfd0-4077b01518bc' }, // grenier + jarres (plot pierres)
  { key: 'granaries_city-s0-t3', id: '50beca46-2f91-496b-9474-0a63ae59bba2' }, // complexe de greniers
  { key: 'caravans-s0-t0', id: '8b3d7de4-b6ec-4dd7-adfd-665ecea2cdb3' }, // cache de troc (ballot + perche)
  { key: 'caravans-s0-t1', id: '518f8eb7-2f3d-47e7-afa6-cdb2b21f95a0' }, // travois chargé (transport) — v2
  { key: 'caravans-s0-t2', id: '70c6d48a-e8a0-442e-98fc-166ccf95f1ca' }, // hub transport (2 travois) — v2
  { key: 'caravans-s0-t3', id: '6696a388-a7ef-42e5-b07c-6423e04192ff' }, // comptoir prospère (auvent)
  { key: 'markets-s0-t0', id: '99edc1cd-e77c-4e28-9dab-e297dba53861' }, // étal isolé
  { key: 'markets-s0-t1', id: '35043e1b-0911-4ef3-b0c0-8a77e4afabd1' }, // 2 étals à auvent
  { key: 'markets-s0-t2', id: '0fd0c37e-7600-4860-836f-d2b92d515924' }, // petit marché (plot pierres)
  { key: 'markets-s0-t3', id: '40cd20d3-4875-4bb9-bc65-fe2b2baf66ce' }, // grand marché ouvert/aéré, désert — v4
  { key: 'guilds-s0-t0', id: 'd6c389f0-f7df-4986-ae6b-4f120b082c0a' }, // petite maison de guilde — v3 (plus niche)
  { key: 'guilds-s0-t1', id: '95138d22-2022-44cf-9604-7506a39d6c42' }, // loge de guilde — v3 (plus niche)
  { key: 'guilds-s0-t2', id: 'c3a27e59-2832-44f5-a19e-46533fe53ccf' }, // hall de guilde clos — v2
  { key: 'guilds-s0-t3', id: '5ff6b2ab-650f-428e-a943-ed87261215fb' }, // grand hall de guilde clos — v2
  { key: 'mint_houses-s0-t0', id: '2daef206-b43d-4b45-ac0b-d349c18ee720' }, // hutte-trésor primitive — v2 (bois/torchis)
  { key: 'mint_houses-s0-t1', id: 'c84b9ae5-a34f-46f4-8857-30fc985aa621' }, // loge-trésor primitive — v2
  { key: 'mint_houses-s0-t2', id: 'faf14de2-a8bc-4ebf-8d89-8ca7af2dad80' }, // maison d'échange primitive — v2
  { key: 'mint_houses-s0-t3', id: 'bd7bbde4-5ac1-4a05-9562-6a65dc04442d' }, // grande maison-trésor primitive — v2
  { key: 'imperial_exchanges-s0-t0', id: 'efba835b-81f4-4413-b8f5-4ef3adf2fc8f' }, // poste d'échange (mégalithe + balance)
  { key: 'imperial_exchanges-s0-t1', id: '01aa2b0c-32ea-4e9d-8afc-bd9f7685c23b' }, // hall d'échange (2 pierres dressées)
  { key: 'imperial_exchanges-s0-t2', id: '17b1c8ec-d84c-4eab-975c-80bca9eb0d44' }, // grand hall d'échange national
  { key: 'imperial_exchanges-s0-t3', id: '889d575d-55a1-446f-a156-66193dcd177d' }, // échange national monumental (mégalithes)
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // \x89PNG : valide le contenu
// Filtre optionnel (sous-chaîne de clé) : ne télécharge QUE les clés qui matchent.
// ⚠ utile pour ne pas réécraser des sprites déjà retouchés (ex. flip de lumière).
const FILTER = process.argv[2] || '';

fs.mkdirSync(OUT, { recursive: true });
for (const sp of SPRITES) {
  if (FILTER && !sp.key.includes(FILTER)) continue;
  if (!sp.id) { console.log(sp.key, '— pas d\'id, skip'); continue; }
  let png = null;
  for (let i = 0; i < 80 && !png; i += 1) {
    try {
      const r = await fetch(`https://api.pixellab.ai/mcp/map-objects/${sp.id}/download`);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 500 && buf.subarray(0, 4).equals(PNG_SIG)) png = buf;
      }
    } catch { /* pas prêt */ }
    if (!png) await sleep(15000);
  }
  if (!png) { console.warn(sp.key, '— pas prêt (timeout), skip'); continue; }
  fs.writeFileSync(`${OUT}/${sp.key}.png`, png);
  console.log(sp.key, '— écrit →', sp.key + '.png', `(${png.length} o)`);
}
console.log('OK — bâtiments dans', OUT);
