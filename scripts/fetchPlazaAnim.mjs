// ============================================================================
// fetchPlazaAnim.mjs — assemble la bande d'eau animée d'une fontaine de place.
//
//   PixelLab anime l'objet ENTIER : sa pierre respire un peu, son ombre bouge,
//   ses arêtes se redessinent d'une frame à l'autre. Sur un sprite de 42 px posé
//   au milieu d'une place, ça se voit — la fontaine a l'air de trembler sur son
//   socle. C'est le même piège que la fontaine de l'ancienne scène, résolu de la
//   même façon :
//
//     ┌──────────────────────────────────────────────────────────────────┐
//     │ on MESURE quels pixels bougent, et on FIGE tous les autres sur le │
//     │ sprite statique. Hors de l'eau, la bande est le sprite, au bit    │
//     │ près : zéro tremblement, et passer de l'animé au statique ne se   │
//     │ voit pas.                                                        │
//     └──────────────────────────────────────────────────────────────────┘
//
//   Le masque de mouvement est DILATÉ d'un pixel : sans ça le bord de l'eau,
//   qui alterne entre eau et pierre, se retrouvait coupé net et clignotait.
//
//   Sortie : /pixelart/iso/plaza/anim/<prop>-<ère>.png, bande HORIZONTALE de N
//   frames carrées au format EXACT du sprite statique (isoPlaza en déduit N par
//   largeur/hauteur, aucune méta à tenir à jour).
//
//   Usage :
//     node scripts/fetchPlazaAnim.mjs <objectId> <animId> <prop> <ère> [frames] [direction]
//   L'animId est celui de l'URL rendue par get_object (≠ animation_group_id).
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const BASE = 'https://backblaze.pixellab.ai/file/pixellab-characters/objects';
const PROJET = 'f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const OUT = 'public/pixelart/iso/plaza/anim';
const STATIC_DIR = 'public/pixelart/iso/plaza';

const argv = process.argv.slice(2);
// ⚠ La frame 0 d'une anim v3 est la frame de RÉFÉRENCE : elle est identique au
// sprite statique, donc « eau au repos ». Gardée dans la boucle, l'eau se fige
// une image sur neuf — un hoquet bien visible sur une eau qui doit couler. On
// l'écarte par défaut ; --avec-frame0 la remet.
const gardeFrame0 = argv.includes('--avec-frame0');
const [objectId, animId, prop, era, framesArg, dirArg] = argv.filter((a) => !a.startsWith('--'));
if (!objectId || !animId || !prop || !era) {
  console.error('usage: <objectId> <animId> <prop> <ère> [frames=9] [direction=south-west]');
  process.exit(1);
}
const NF = parseInt(framesArg || '9', 10);
const DIR = dirArg || 'south-west';

// Moyenne 2×2 en alpha prémultiplié, alpha SEUILLÉ — identique à
// fetchPlazaProp.halve, pour que la bande retombe pile sur le canvas du statique.
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
      out.data[o + 3] = a >= 0.5 ? 255 : 0;
    }
  }
  return out;
}

const statiquePath = path.join(STATIC_DIR, `${prop}-${era}.png`);
if (!fs.existsSync(statiquePath)) { console.error('sprite statique introuvable :', statiquePath); process.exit(1); }
const statique = PNG.sync.read(fs.readFileSync(statiquePath));
const W = statique.width, H = statique.height;

// ── Récupération et mise au format du statique ───────────────────────────────
const frames = [];
const i0 = gardeFrame0 ? 0 : 1;
for (let i = i0; i < NF; i += 1) {
  const url = `${BASE}/${PROJET}/${objectId}/animations/${animId}/${DIR}/${i}.png`;
  const r = await fetch(url);
  if (!r.ok) { console.error('échec frame', i, r.status); process.exit(1); }
  let f = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
  while (f.width > W) f = halve(f);
  if (f.width !== W || f.height !== H) {
    console.error(`frame ${i} : ${f.width}×${f.height} ≠ statique ${W}×${H}`);
    process.exit(1);
  }
  frames.push(f);
}

// ── Masque de MOUVEMENT ──────────────────────────────────────────────────────
// Un pixel bouge s'il s'écarte assez de la frame 0, sur la couleur OU sur
// l'alpha (un jet qui apparaît sur du vide ne change pas de couleur, il change
// d'opacité). Le seuil est volontairement bas : mieux vaut animer un pixel de
// pierre stable — il redonnera la même valeur — que figer un pixel d'eau.
const SEUIL = 18;
const bouge = new Uint8Array(W * H);
for (let i = 1; i < frames.length; i += 1) {
  const a = frames[0].data, b = frames[i].data;
  for (let px = 0; px < W * H; px += 1) {
    const o = px * 4;
    const da = Math.abs(a[o + 3] - b[o + 3]);
    const dc = Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]);
    if (da > 24 || dc > SEUIL) bouge[px] = 1;
  }
}
// DILATATION d'un pixel : le bord de l'eau alterne entre eau et pierre d'une
// frame à l'autre ; coupé net, il clignote.
const masque = new Uint8Array(W * H);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    let on = 0;
    for (let dy = -1; dy <= 1 && !on; dy += 1) {
      for (let dx = -1; dx <= 1 && !on; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && bouge[ny * W + nx]) on = 1;
      }
    }
    masque[y * W + x] = on;
  }
}
const nMasque = masque.reduce((s, v) => s + v, 0);

// ── Bande : hors masque, le sprite STATIQUE au bit près ──────────────────────
const NB = frames.length;
const strip = new PNG({ width: W * NB, height: H });
for (let i = 0; i < NB; i += 1) {
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const src = masque[y * W + x] ? frames[i] : statique;
      const s = (y * W + x) * 4, d = (y * strip.width + i * W + x) * 4;
      strip.data[d] = src.data[s]; strip.data[d + 1] = src.data[s + 1];
      strip.data[d + 2] = src.data[s + 2]; strip.data[d + 3] = src.data[s + 3];
    }
  }
}
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `${prop}-${era}.png`);
fs.writeFileSync(file, PNG.sync.write(strip));
console.log(`→ ${file}  ${NB} frames de ${W}×${H}${gardeFrame0 ? '' : ' (frame 0 de référence écartée)'}`);
console.log(`   pixels animés : ${nMasque} / ${W * H} (${(100 * nMasque / (W * H)).toFixed(1)} %) — le reste est figé sur le statique`);
