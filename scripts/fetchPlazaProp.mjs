// ============================================================================
// fetchPlazaProp.mjs — récupère un objet PixelLab et le range en props de place.
//
//   ORIENTATIONS. Un banc de place regarde le CENTRE. En iso, monde +x part vers
//   la droite-bas de l'écran et monde +y vers la gauche-bas, donc les quatre
//   faces utiles sont les DIAGONALES écran, pas les cardinales :
//
//        banc du bord NORD  regarde le sud  → écran bas-gauche  → south-west
//        banc du bord SUD   regarde le nord → écran haut-droite → north-east
//        banc du bord OUEST regarde l'est   → écran bas-droite  → south-east
//        banc du bord EST   regarde l'ouest → écran haut-gauche → north-west
//
//   Le nom de fichier porte la direction MONDE (bench-n/s/e/w-<ère>.png), c'est
//   ce que lit isoPlaza ; la table ci-dessous fait la traduction.
//
//   ÉCRASEMENT ×0,5. PixelLab ne descend pas sous 32 px de canvas et rend mieux
//   à 64, alors qu'un banc s'affiche autour de 24 px. On génère donc large et on
//   écrase par MOYENNE de blocs 2×2 en alpha prémultiplié (le plus proche voisin
//   jetterait 3 pixels sur 4, et une moyenne non prémultipliée ourlerait les
//   bords d'un liseré sombre). La palette est resserrée ensuite par remapPalette.
//
//   Usage : node scripts/fetchPlazaProp.mjs <objectId> <prop> <ère> [--all]
//     --all garde les 8 rotations au lieu des 4 diagonales.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIAGONALS = { s: 'south-west', n: 'north-east', e: 'south-east', w: 'north-west' };
const OUT = 'public/pixelart/iso/plaza';

// Moyenne 2×2 en alpha prémultiplié — voir l'en-tête.
function halve(png) {
  const { width: w, height: h, data: d } = png;
  const W = w >> 1, H = h >> 1;
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const i = (((y * 2 + dy) * w) + (x * 2 + dx)) * 4;
          const al = d[i + 3] / 255;
          r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al;
        }
      }
      const o = (y * W + x) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      // Alpha SEUILLÉ, pas moyenné : un pixel à demi transparent sur un sprite
      // pixel-art fait un bord sale. Au-delà d'un quart couvert, le pixel existe.
      out.data[o + 3] = a >= 0.5 ? 255 : 0;
    }
  }
  return out;
}

const [objectId, prop, era, ...flags] = process.argv.slice(2);
if (!objectId || !prop || !era) { console.error('usage: <objectId> <prop> <ère> [--projet=ID] [--all|--single]'); process.exit(1); }
const all = flags.includes('--all');

// ── PROP SYMÉTRIQUE (--single) ──────────────────────────────────────────────
// Une grille d'arbre ou une fontaine n'a pas d'orientation : elle vient d'un
// `create_map_object` (une seule vue) et se range en `<prop>-<ère>.png`, que
// propImage trouve après avoir cherché la variante directionnelle.
if (flags.includes('--single')) {
  const r = await fetch(`https://api.pixellab.ai/mcp/map-objects/${objectId}/download`);
  if (!r.ok) { console.error('échec', r.status); process.exit(1); }
  const src = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
  const small = halve(src);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${prop}-${era}.png`);
  fs.writeFileSync(file, PNG.sync.write(small));
  console.log(`→ ${file}  ${src.width}×${src.height} → ${small.width}×${small.height}`);
  process.exit(0);
}

// ⚠ L'URL d'une rotation porte l'id du PROJET PixelLab, pas seulement celui de
// l'objet, et le endpoint /download ne le révèle pas (il rend un zip sans
// redirection). On le lit donc dans les URL que get_object a déjà données —
// il est stable pour un compte. Surchargeable par --projet=ID.
const BASE = 'https://backblaze.pixellab.ai/file/pixellab-characters/objects';
const PROJET_DEFAUT = 'f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const projet = (flags.find((f) => f.startsWith('--projet=')) || '').slice(9) || PROJET_DEFAUT;

// ── UNE SEULE ROTATION D'UN OBJET 8-DIRECTIONS (--pick=<rotation>) ──────────
// Pour un prop À SYMÉTRIE DE RÉVOLUTION (fontaine) : le pipeline 8 rotations
// donne un VRAI 3/4 — c'est ce qui manquait aux fontaines passées par
// create_map_object, rendues trop de face — mais une seule vue suffit à l'objet.
// On range donc la rotation choisie sous `<prop>-<ère>.png`, sans suffixe de
// direction, qui est ce que cherche propImage pour un prop non orienté.
// ⚠ Ce bloc doit rester APRÈS la déclaration de BASE et de projet : placé avant,
// il lève une TDZ à l'exécution (const n'est pas hissé comme var).
const pick = (flags.find((f) => f.startsWith('--pick=')) || '').slice(7);
if (pick) {
  const r = await fetch(`${BASE}/${projet}/${objectId}/rotations/${pick}.png`);
  if (!r.ok) { console.error('échec', pick, r.status); process.exit(1); }
  const src = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
  const small = halve(src);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${prop}-${era}.png`);
  fs.writeFileSync(file, PNG.sync.write(small));
  console.log(`${pick} → ${file}  ${src.width}×${src.height} → ${small.width}×${small.height}`);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
const jobs = all
  ? Object.entries({ n: 'north', s: 'south', e: 'east', w: 'west', ...DIAGONALS })
  : Object.entries(DIAGONALS);

for (const [face, rot] of jobs) {
  const url = `${BASE}/${projet}/${objectId}/rotations/${rot}.png`;
  const r = await fetch(url);
  if (!r.ok) { console.error('échec', rot, r.status); continue; }
  const src = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
  const small = halve(src);
  const file = path.join(OUT, `${prop}-${face}-${era}.png`);
  fs.writeFileSync(file, PNG.sync.write(small));
  console.log(`${rot} → ${file}  ${src.width}×${src.height} → ${small.width}×${small.height}`);
}
