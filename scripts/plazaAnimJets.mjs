// ============================================================================
// plazaAnimJets.mjs — anime PAR LE CODE les jets d'eau d'une fontaine de place.
//
//   Pour la grande fontaine moderne (couronne de jets verticaux autour d'une
//   sphère d'acier), PixelLab a échoué deux fois de la même façon : les jets
//   s'éteignent à mi-boucle puis rejaillissent d'un coup. Sur une place, ça se
//   lit comme un clignotement, pas comme de l'eau. Plutôt que de tirer au sort
//   une troisième fois, on anime le sprite STATIQUE lui-même :
//
//     · un REFLET monte le long de chaque jet (2 px par frame) ;
//     · une GOUTTE se détache du sommet, monte et s'éteint ;
//     · un peu d'ÉCUME bat au pied du jet, à gauche puis à droite ;
//     · quelques ÉCLATS s'allument et s'éteignent sur le bassin.
//
//   Tout est périodique sur 8 frames, déphasé jet par jet : la boucle est
//   parfaite PAR CONSTRUCTION, et seul ce qui est de l'eau peut changer.
//   Un pixel n'est touché que s'il est jet (rampe claire du statique) ou eau du
//   bassin ; la sphère et la margelle ne sont jamais réécrites.
//
//   Sorties :
//     public/pixelart/iso/plaza/anim/<prop>-<ère>.png       la bande (8 frames)
//     public/pixelart/iso/plaza/anim/zone/<prop>-<ère>.png  la zone d'eau : les
//       pixels que la bande fait bouger. Le test « seule l'eau bouge » la prend
//       pour référence, parce que le blanc des jets (b − r ≈ 2) ne lit pas
//       « bleu » au critère de couleur.
//
//   Usage :
//     node scripts/plazaAnimJets.mjs <prop> <ère>    (ex. fountain-forum modern)
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIR = 'public/pixelart/iso/plaza';
const NF = 8;
const [prop, era] = process.argv.slice(2);
if (!prop || !era) { console.error('usage: <prop> <ère>'); process.exit(1); }

const st = PNG.sync.read(fs.readFileSync(path.join(DIR, `${prop}-${era}.png`)));
const W = st.width, H = st.height;
const key = (x, y) => { const o = (y * W + x) * 4; return `${st.data[o]},${st.data[o + 1]},${st.data[o + 2]}`; };
const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && st.data[(y * W + x) * 4 + 3] >= 128;

// La RAMPE DES JETS, du plus sombre au plus clair — relevée dans le statique
// (palette quantifiée : couleurs exactes). Un reflet monte d'un ou deux crans.
const RAMPE = [[149, 207, 230], [177, 217, 232], [185, 230, 246], [218, 236, 240], [222, 244, 251], [251, 253, 253]];
const iRampe = new Map(RAMPE.map((c, i) => [c.join(','), i]));
// L'EAU DU BASSIN (b − r ≥ 90) : là seulement s'allument écume et éclats.
const estBassin = (x, y) => {
  if (!opaque(x, y)) return false;
  const o = (y * W + x) * 4;
  return st.data[o + 2] - st.data[o] >= 90 && !iRampe.has(key(x, y));
};
const h01 = (a, b) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ── Les jets : courses VERTICALES (≥ 4 px) de couleurs de la rampe ──────────
const courses = [];
for (let x = 0; x < W; x += 1) {
  let y = 0;
  while (y < H) {
    if (!opaque(x, y) || !iRampe.has(key(x, y))) { y += 1; continue; }
    let y1 = y;
    while (y1 + 1 < H && opaque(x, y1 + 1) && iRampe.has(key(x, y1 + 1))) y1 += 1;
    if (y1 - y + 1 >= 4) courses.push({ x, y0: y, y1 });
    y = y1 + 1;
  }
}
// Deux courses voisines qui se chevauchent forment UN jet (2 px de large) :
// même phase, sinon les deux moitiés d'un jet battraient chacune de son côté.
const jets = [];
for (const c of courses) {
  const j = jets.find((J) => J.cols.some((d) => Math.abs(d.x - c.x) === 1 && d.y0 <= c.y1 && c.y0 <= d.y1));
  if (j) j.cols.push(c); else jets.push({ cols: [c] });
}
jets.forEach((j, i) => {
  j.phase = Math.floor(h01(j.cols[0].x, j.cols[0].y1) * NF);
  j.xL = Math.min(...j.cols.map((c) => c.x));
  j.xR = Math.max(...j.cols.map((c) => c.x));
  j.top = j.cols.reduce((a, c) => (c.y0 < a.y0 ? c : a));        // colonne la plus haute
  j.yb = Math.max(...j.cols.map((c) => c.y1));
  j.i = i;
});
const dansJet = new Set(courses.flatMap((c) => Array.from({ length: c.y1 - c.y0 + 1 }, (_, k) => `${c.x},${c.y0 + k}`)));

// ── Éclats du bassin : ~5 % de l'eau libre, loin des jets ───────────────────
const eclats = [];
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (!estBassin(x, y) || h01(x + 101, y + 7) >= 0.05) continue;
    let pres = false;
    for (let dy = -1; dy <= 1 && !pres; dy += 1) for (let dx = -1; dx <= 2 && !pres; dx += 1) if (dansJet.has(`${x + dx},${y + dy}`)) pres = true;
    if (!pres) eclats.push({ x, y, g: Math.floor(h01(y + 31, x + 3) * NF) });
  }
}

// ── Les frames ───────────────────────────────────────────────────────────────
const bande = new PNG({ width: W * NF, height: H });
const zone = new PNG({ width: W, height: H });
for (let k = 0; k < NF; k += 1) {
  const f = Buffer.from(st.data);
  const poser = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    f[o] = c[0]; f[o + 1] = c[1]; f[o + 2] = c[2]; f[o + 3] = 255;
  };
  for (const j of jets) {
    // Le REFLET : deux crans plus clair sur 2 px, un cran sur le suivant, qui
    // montent de 2 px par frame (p = distance au pied du jet).
    for (const c of j.cols) {
      for (let y = c.y0; y <= c.y1; y += 1) {
        const p = c.y1 - y, m = (((p - 2 * k + j.phase) % NF) + NF) % NF;
        const i0 = iRampe.get(key(c.x, y));
        const i1 = m < 2 ? Math.min(i0 + 2, RAMPE.length - 1) : m === 2 ? Math.min(i0 + 1, RAMPE.length - 1) : i0;
        if (i1 !== i0) poser(c.x, y, RAMPE[i1]);
      }
    }
    // La GOUTTE, sur la colonne la plus haute : collée au sommet, puis
    // détachée, puis plus haut, puis rien pendant la moitié du cycle.
    const ph = (k + j.phase) % NF, x = j.top.x, yt = j.top.y0;
    if (ph === 0) poser(x, yt - 1, RAMPE[4]);
    else if (ph === 1) { poser(x, yt - 1, RAMPE[4]); poser(x, yt - 2, RAMPE[2]); }
    else if (ph === 2) poser(x, yt - 2, RAMPE[2]);
    else if (ph === 3) poser(x, yt - 3, RAMPE[2]);
    // L'ÉCUME au pied, qui bat d'un côté à l'autre — seulement sur l'eau.
    const cote = (k + j.phase) % 2 === 0 ? j.xL - 1 : j.xR + 1;
    if (estBassin(cote, j.yb)) poser(cote, j.yb, RAMPE[3]);
  }
  // Les ÉCLATS : allumés 2 frames sur 8, chacun à sa phase.
  for (const e of eclats) {
    if (((k - e.g) % NF + NF) % NF >= 2) continue;
    poser(e.x, e.y, RAMPE[0]);
    if (estBassin(e.x + 1, e.y)) poser(e.x + 1, e.y, RAMPE[0]);
  }
  // Pose dans la bande + zone = ce qui diffère du statique.
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const s = (y * W + x) * 4, d = (y * bande.width + k * W + x) * 4;
      let diff = false;
      for (let c = 0; c < 4; c += 1) { bande.data[d + c] = f[s + c]; if (f[s + c] !== st.data[s + c]) diff = true; }
      if (diff) { zone.data[s] = 255; zone.data[s + 1] = 255; zone.data[s + 2] = 255; zone.data[s + 3] = 255; }
    }
  }
}
const fBande = path.join(DIR, 'anim', `${prop}-${era}.png`);
const fZone = path.join(DIR, 'anim', 'zone', `${prop}-${era}.png`);
fs.mkdirSync(path.dirname(fZone), { recursive: true });
fs.writeFileSync(fBande, PNG.sync.write(bande));
fs.writeFileSync(fZone, PNG.sync.write(zone));
let n = 0; for (let p = 0; p < W * H; p += 1) if (zone.data[p * 4 + 3]) n += 1;
console.log(`→ ${fBande}  ${NF} frames de ${W}×${H} · ${jets.length} jets, ${eclats.length} éclats`);
console.log(`→ ${fZone}  ${n} px d'eau qui bougent`);
