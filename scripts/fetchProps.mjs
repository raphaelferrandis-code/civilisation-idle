// Télécharge les PROPS pixel-art des SCÈNES de moteur (PixelLab map-objects, mode
// basique, vue low top-down) → public/pixelart/agents/<name>.png (PNG transparent).
//   Un « prop » = l'élément STATIQUE d'une scène de bâtiment (étal, silo, sacs…) ;
//   le personnage qui marche reste un agent animé séparé (cf fetchAgents.mjs) et la
//   scène les compose dans cityEngineSprites.js (props + cueilleur RÉUTILISÉ).
//   C'est l'approche validée (cueilleurs/entrepôts/caravanes) — PAS un sprite-bâtiment
//   statique plat (couche pixelBuildings.js, abandonnée le 2026-06-29).
//
//   Endpoint /objects/{id}/download → PNG DIRECT sans auth (mode basique). Poll 15s.
//   ⚠ Les objets PixelLab s'AUTO-SUPPRIMENT après 8h → relancer dans la foulée de la
//   génération. Pour itérer/régénérer un prop : recréer via create_map_object (DA
//   verrouillée ci-dessous) puis remettre le nouvel id ici.
//   Lancer : node scripts/fetchProps.mjs   (filtre optionnel : node scripts/fetchProps.mjs market)
//
//   DA verrouillée (create_map_object) : view "low top-down", outline "lineless",
//   shading "medium shading", detail "medium detail", palette chaude terreuse, base
//   de terre, AUCUN humain cuit dans le sprite, lumière haut-gauche → ombres bas-droite.
import fs from 'node:fs';
import { PNG } from 'pngjs';

// Miroir horizontal (certaines fournées PixelLab ont la lumière du mauvais côté ;
// la convention carte = lumière HAUT-GAUCHE → ombres BAS-DROITE).
const flipH = (buf) => {
  const png = PNG.sync.read(buf); const { width: W, height: H, data } = png;
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (y * W + x) * 4, di = (y * W + (W - 1 - x)) * 4;
    for (let c = 0; c < 4; c++) out[di + c] = data[si + c];
  }
  png.data = out; return PNG.sync.write(png);
};

const OUT = 'public/pixelart/agents';
const PROPS = [
  // clé = nom de fichier (sans .png) ; id = objet PixelLab ; prompt = description de génération.
  {
    key: 'market-prop-stall',
    id: '441f8b21-8e47-48fc-955b-41ee5f03315c', // marché stade 0 — étal de troc à auvent (96×72) — validé 2026-06-29
    prompt: 'a small Neolithic barter market stall on bare packed earth, completely deserted and unoccupied, no people, no merchants, no human figures: a hide awning stretched over two wooden poles shading a woven reed mat, the mat and ground neatly covered with small clay pots, woven wicker baskets and small piles of colorful fruit, berries and grain, warm earthy ochre palette, soft light from the upper-left casting shadows to the lower-right, small patch of dirt ground',
  },
  {
    key: 'guild-prop-lodge',
    id: 'ed7ade38-dec8-475e-b6a6-bbee6a1450a2', // guildes stade 0 — lodge d'artisans clos (96×96)
    flip: 'h',                                  // fournée à lumière inversée → miroir H (validé en jeu)
    prompt: 'a small Stone Age craftsmen\'s guild lodge, completely deserted and empty, no people, no figures, no person: a single sturdy closed hut with timber and wattle-and-daub walls and a steep thatched roof, a dark low doorway, a carved wooden totem pole and crossed stone-axe tools mounted on the wall beside the door, a small hide pennant on a wooden pole on the roof, warm earthy ochre and brown palette, soft light from the upper-left casting shadows to the lower-right, small patch of bare dirt ground',
  },
  {
    key: 'field-prop-crop-green',
    id: '794aec1d-6f3e-4e45-bb9a-d988107b9a83', // champs stade 0 — parcelle cultures vertes (64×64)
    prompt: 'a small square top-down patch of cultivated farmland, neat parallel rows of young green crop sprouts growing on furrowed dark brown tilled soil, completely deserted, no people, no figures, warm earthy palette, soft light from the upper-left, shadows to the lower-right',
  },
  {
    key: 'field-prop-crop-gold',
    id: '33334d2d-028d-422b-9087-9edb9a1909fd', // champs stade 0 — parcelle blé mûr doré (64×64)
    prompt: 'a small square top-down patch of farmland with neat rows of tall ripe golden wheat on furrowed brown soil, completely deserted, no people, no figures, warm earthy golden palette, soft light from the upper-left, shadows to the lower-right',
  },
  {
    key: 'field-prop-fallow',
    id: '9aa08992-edcd-4f74-9e12-763b79de6d50', // champs stade 0 — parcelle terre labourée (64×64)
    prompt: 'a small square top-down patch of freshly tilled empty farmland, neat parallel furrows in dark brown soil with only a few sparse green sprouts, completely deserted, no people, no figures, earthy brown palette, soft light from the upper-left, shadows to the lower-right',
  },
  {
    key: 'port-prop-pontoon',
    id: 'ba197416-24e5-4b0a-9349-6dba800724aa', // port stade 0 — ANCIEN ponton plat (56×56), récupéré (préféré au variant à rambardes 8c7d7d8e) — relie le bâtiment de quai au bateau
    prompt: 'a wooden plank jetty pier extending straight forward over water, top-down view, completely deserted, no people, no figures, transparent background no water: parallel weathered wooden deck planks with a row of mooring posts and pilings along both edges, sturdy timber, warm brown wood, soft light from the upper-left, shadows to the lower-right',
  },
  // NB : les props du trio (forager-prop-tree/-basket, granary-prop-silo, caravan-prop-sacks)
  // ont été récupérés avant ce script — déjà sur disque, ids non consignés.
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const FILTER = process.argv[2] || '';

fs.mkdirSync(OUT, { recursive: true });
for (const p of PROPS) {
  if (FILTER && !p.key.includes(FILTER)) continue;
  if (!p.id) { console.log(p.key, '— pas d\'id, skip'); continue; }
  let png = null;
  for (let i = 0; i < 80 && !png; i += 1) {
    try {
      const r = await fetch(`https://api.pixellab.ai/mcp/objects/${p.id}/download`);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 500 && buf.subarray(0, 4).equals(PNG_SIG)) png = buf;
      }
    } catch { /* pas prêt */ }
    if (!png) await sleep(15000);
  }
  if (!png) { console.warn(p.key, '— pas prêt (timeout, objet expiré ?), skip'); continue; }
  if (p.flip === 'h') png = flipH(png);
  fs.writeFileSync(`${OUT}/${p.key}.png`, png);
  console.log(p.key, '— écrit →', p.key + '.png', (p.flip ? '(flip ' + p.flip + ') ' : '') + `(${png.length} o)`);
}
console.log('OK — props dans', OUT);
