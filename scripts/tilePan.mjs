// tilePan.mjs — PAN de N×N cellules d'une matière de sol, à l'échelle du jeu
// (zoom 1), depuis les PNG normalisés de public/pixelart/iso.
//   node scripts/tilePan.mjs iso-wonder 7 [variantes] [miroir 0|1]
//   → .preview-shots/pan-<clé>-v<N>[-mir].png
//
// LE test des sols, réclamé sans arrêt par les commentaires de fetchGroundTiles :
// un défaut de raccord ne se voit JAMAIS sur la vignette d'une tuile seule, ni
// même sur la planche-contact — seulement sur le pan. C'est lui qui a écarté
// trois des quatre matières candidates du parvis (2026-07-28), toutes belles en
// vignette. Il est HORS JEU exprès : pas de serveur à lancer, pas de bake à
// attendre, on juge la matière et rien d'autre.
//
// Le tirage (variante, miroir) rejoue celui du moteur AU BIT PRÈS — même hash,
// mêmes bits. Un pan tiré autrement ne montrerait pas ce que le joueur voit.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const KEY = process.argv[2] || 'iso-wonder';
const N = +(process.argv[3] || 7);
const NV = +(process.argv[4] || 3);
const MIR = process.argv[5] !== '0';
const DIR = 'public/pixelart/iso';
const HW = 32, HH = 16;                          // demi-losange à zoom 1 (TILE=32)

// FNV-1a — la MÊME que cmHash, et les MÊMES bits que isoVariantKey/le miroir :
// tester avec un autre tirage ne testerait pas ce que le jeu affiche.
const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const tiles = [];
for (let v = 1; v <= NV; v += 1) {
  const f = NV > 1 ? `${DIR}/${KEY}-${v}.png` : `${DIR}/${KEY}.png`;
  tiles.push(PNG.sync.read(fs.readFileSync(f)));
}
const TW = tiles[0].width, TH = tiles[0].height;
const OV = TH - 2 * HH;                          // débord nord (herbe) — 0 sinon
const W = (N + 1) * TW, H = (N + 1) * TH + N * HH;
const out = new PNG({ width: W, height: H });
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 30; out.data[i + 1] = 32; out.data[i + 2] = 36; out.data[i + 3] = 255; }
const ox = W / 2 - HW, oy = 8;
for (let gy = 0; gy < N; gy += 1) for (let gx = 0; gx < N; gx += 1) {
  const h = hash(gx + ',' + gy);
  const t = tiles[(h >>> 5) % tiles.length];
  const flip = MIR && ((h >>> 3) & 1) === 1;
  const px = Math.round(ox + (gx - gy) * HW), py = Math.round(oy + (gx + gy) * HH) - OV;
  for (let y = 0; y < TH; y += 1) for (let x = 0; x < TW; x += 1) {
    const sx = flip ? TW - 1 - x : x;
    const si = (y * TW + sx) * 4;
    if (t.data[si + 3] < 16) continue;
    const dx = px + x, dy = py + y;
    if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
    const di = (dy * W + dx) * 4;
    out.data[di] = t.data[si]; out.data[di + 1] = t.data[si + 1];
    out.data[di + 2] = t.data[si + 2]; out.data[di + 3] = 255;
  }
}
const name = `.preview-shots/pan-${KEY}-v${NV}${MIR ? '-mir' : ''}.png`;
fs.mkdirSync('.preview-shots', { recursive: true });
fs.writeFileSync(name, PNG.sync.write(out));
console.log(`${name}  (${N}x${N}, tuile ${TW}x${TH}, ${NV} variante(s), miroir ${MIR ? 'on' : 'off'})`);
