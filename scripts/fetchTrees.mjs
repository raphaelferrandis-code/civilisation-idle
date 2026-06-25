// Télécharge les objets-arbres PixelLab et écrit le PNG (frame unique, 96px) →
// public/pixelart/trees/tree-{kind}.png.
//   Objets « map object » 1-direction (create_map_object, vue low top-down) :
//   l'endpoint /map-objects/{id}/download renvoie un PNG transparent DIRECT (pas
//   un zip). Générique : ne nécessite que l'object_id. Poll 15s (~20 min max) au
//   cas où l'objet n'est pas encore prêt. Repli procédural côté moteur si absent.
//   ⚠ Les objets PixelLab s'auto-suppriment après 8h → relancer dans la foulée.
//   Lancer : node scripts/fetchTrees.mjs
import fs from 'node:fs';

const OUT = 'public/pixelart/trees';
// kind = clé de sprite (cf. TREE_SPRITES dans renderWorld.js). Mets l'id à '' pour sauter.
const TREES = [
  { kind: 'oak',   id: 'a78e8cec-7c2e-4200-b83f-35987046bf6d' }, // chêne — couronne ronde large
  { kind: 'pine',  id: '93eb8c8b-662f-43db-94aa-815963bddcd2' }, // conifère — tiers triangulaires
  { kind: 'birch', id: 'a25f7aa1-931e-4db0-b02e-4665a79e0a86' }, // bouleau — clair, élancé
  { kind: 'shrub', id: '05fe50e9-6efb-4364-8da6-be9dca74dd48' }, // buisson — bas, sans tronc
  { kind: 'dead',  id: 'a08b29a5-59f2-46fc-845d-8fa2ab777b35' }, // arbre mort — villes en déclin/ruine
  // Canopées « masse » (dômes plats qui se chevauchent dans les fourrés denses ;
  // ≠ arbres détaillés isolés). 2 teintes tirées au hash.
  { kind: 'canopy',  id: '90f3a151-279a-4683-b3ab-fd4e42c062a4' }, // canopée bleu-vert (standard)
  { kind: 'canopy2', id: '3e05e132-e76d-4c75-aa44-10297b915773' }, // canopée lime (accent)
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // \x89PNG : valide le contenu

fs.mkdirSync(OUT, { recursive: true });
for (const t of TREES) {
  if (!t.id) { console.log(t.kind, '— pas d\'id, skip'); continue; }
  let png = null;
  for (let i = 0; i < 80 && !png; i += 1) {
    try {
      const r = await fetch(`https://api.pixellab.ai/mcp/map-objects/${t.id}/download`);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        // PNG complet (96² ≈ 8 Ko) ; rejette une réponse partielle/erreur déguisée.
        if (buf.length > 500 && buf.subarray(0, 4).equals(PNG_SIG)) png = buf;
      }
    } catch { /* pas prêt */ }
    if (!png) await sleep(15000);
  }
  if (!png) { console.warn(t.kind, '— pas prêt (timeout), skip'); continue; }
  fs.writeFileSync(`${OUT}/tree-${t.kind}.png`, png);
  console.log(t.kind, '— écrit → tree-' + t.kind + '.png', `(${png.length} o)`);
}
console.log('OK — arbres dans', OUT);
