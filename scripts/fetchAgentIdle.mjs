// fetchAgentIdle.mjs — L'ATTENTE ANIMÉE des habitants (docs/PLAN-COMPORTEMENTS.md,
// lot 3) : « fini les statues ». Tout personnage arrêté était figé sur l'image 0 de
// sa marche ; on lui donne une courte bande d'attente (gabarit PixelLab
// `breathing-idle`, 4 images, les 4 vues DIAGONALES de l'iso).
//
//   node scripts/fetchAgentIdle.mjs <name> <charId> [--match=idle] [--pick=<prise>]
//
// Écrit, à côté des bandes de marche (public/pixelart/agents/inhabitants) :
//   {name}-idle-{southeast|southwest|northeast|northwest}.png       (pleine)
//   {name}-idle-{…}-half.png                                         (demi-taille)
// Étapes, dans l'ordre :
//   1. le zip /download du personnage (HTTP 423 tant qu'un job pend : réessais) ;
//   2. les images de l'animation dont le DOSSIER contient --match (« idle ») — le zip
//      porte aussi la marche, qu'il ne faut surtout pas mélanger ;
//   3. l'ombre grise que le gabarit colle sous les pieds est retirée (même critère
//      que scripts/stripBakedShadow.mjs : la charte interdit toute ombre cuite) ;
//   4. chaque pixel est RABATTU sur la palette de la bande de MARCHE du même
//      personnage : passer de la marche à l'attente ne doit changer aucune teinte ;
//   5. la demi-bande est cuite comme celles de la marche (moyenne 2×2 + palette +
//      alpha binaire, cf. fetchAgentFlat.mjs half) — drawNamedAgentIso bascule dessus
//      au même seuil.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';

const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const pos = args.filter((a) => !a.startsWith('--'));
const NAME = pos[0], CHAR_ID = pos[1];
const MATCH = new RegExp(flag('match', 'idle'), 'i');
const PICK = flag('pick', null);
const OUT = flag('out', 'public/pixelart/agents/inhabitants');
const DIRS = ['south-east', 'south-west', 'north-east', 'north-west'];
if (!NAME || !CHAR_ID) { console.error('usage: node scripts/fetchAgentIdle.mjs <name> <charId> [--match=idle] [--pick=<prise>]'); process.exit(1); }

const RX = /animations\/([^/]+)\/(south-east|south-west|north-east|north-west)(?:-([0-9a-f]{8}))?\/frame_(\d+)\.png$/i;
const at = (img, x, y) => (y * img.width + x) * 4;

async function download() {
  for (let i = 0; i < 20; i += 1) {
    const r = await fetch(`https://api.pixellab.ai/mcp/characters/${CHAR_ID}/download`);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status !== 423) throw new Error('download HTTP ' + r.status);
    await new Promise((res) => setTimeout(res, 15000));
  }
  throw new Error('download : 423 trop longtemps (un job pend)');
}

function paletteOf(img) {
  const seen = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] > 128) seen.set((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2], [img.data[i], img.data[i + 1], img.data[i + 2]]);
  }
  return [...seen.values()];
}
const nearest = (pal, r, g, b) => {
  let best = pal[0], bd = Infinity;
  for (const c of pal) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
};
// Ombre cuite : gris neutre opaque dans les 6 rangées du bas d'une frame, qui touche
// le vide (contagion) — cf. stripBakedShadow.mjs.
function stripShadow(img) {
  const W = img.width, H = img.height, ROWS = 6;
  const grey = (i) => {
    if (img.data[i + 3] < 128) return false;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), lum = (r + g + b) / 3;
    return mx - mn <= 24 && lum >= 60 && lum <= 200;
  };
  const empty = (x, y) => x < 0 || y < 0 || x >= W || y >= H || img.data[at(img, x, y) + 3] < 128;
  let n = 0, changed = true;
  while (changed) {
    changed = false;
    for (let y = Math.max(0, H - ROWS); y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = at(img, x, y);
        if (!grey(i)) continue;
        if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) {
          img.data[i + 3] = 0; n += 1; changed = true;
        }
      }
    }
  }
  return n;
}

const buf = await download();
const byDir = Object.fromEntries(DIRS.map((d) => [d, []]));
const folders = new Set();
for (const e of new AdmZip(buf).getEntries()) {
  const m = e.entryName.match(RX);
  if (!m) continue;
  folders.add(m[1]);
  if (!MATCH.test(m[1])) continue;
  byDir[m[2].toLowerCase()].push({ take: m[3] || '', f: +m[4], data: e.getData() });
}
console.log('animations du zip :', [...folders].join(', '));
for (const d of DIRS) {
  const takes = [...new Set(byDir[d].map((e) => e.take))];
  if (takes.length > 1) {
    if (!PICK || !takes.includes(PICK)) throw new Error(`${d} : ${takes.length} prises (${takes.join(', ')}) — --pick=<id>`);
    byDir[d] = byDir[d].filter((e) => e.take === PICK);
  }
  if (byDir[d].length < 2) throw new Error(`${d} : ${byDir[d].length} image(s) d'attente — animation pas prête ?`);
}
for (const d of DIRS) {
  const tag = d.replace('-', '');
  const walk = path.join(OUT, `${NAME}-${tag}.png`);
  if (!fs.existsSync(walk)) throw new Error('bande de marche absente : ' + walk);
  const walkImg = PNG.sync.read(fs.readFileSync(walk));
  const pal = paletteOf(walkImg);
  const frames = byDir[d].sort((a, b) => a.f - b.f).map((e) => PNG.sync.read(e.data));
  const fh = frames[0].height, fw = frames[0].width, n = frames.length;
  if (fh !== walkImg.height) console.warn(`  ⚠ ${d} : frame ${fw}×${fh} ≠ marche ${walkImg.height} — vérifier la taille`);
  const strip = new PNG({ width: fw * n, height: fh });
  let shadow = 0, snapped = 0;
  frames.forEach((img, k) => {
    shadow += stripShadow(img);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 128) { img.data[i + 3] = 0; continue; }
      const c = nearest(pal, img.data[i], img.data[i + 1], img.data[i + 2]);
      if (c[0] !== img.data[i] || c[1] !== img.data[i + 1] || c[2] !== img.data[i + 2]) snapped += 1;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
    PNG.bitblt(img, strip, 0, 0, fw, fh, k * fw, 0);
  });
  const full = path.join(OUT, `${NAME}-idle-${tag}.png`);
  fs.writeFileSync(full, PNG.sync.write(strip));
  // Demi-bande : moyenne 2×2 pondérée par l'alpha, palette d'origine, alpha binaire.
  const w = Math.floor(strip.width / 2), h = Math.floor(strip.height / 2);
  const half = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
        const i = at(strip, x * 2 + dx, y * 2 + dy), pa = strip.data[i + 3];
        r += strip.data[i] * pa; g += strip.data[i + 1] * pa; b += strip.data[i + 2] * pa; a += pa;
      }
      const o = at(half, x, y);
      if (a / 4 < 128) { half.data[o + 3] = 0; continue; }
      const c = nearest(pal, r / a, g / a, b / a);
      half.data[o] = c[0]; half.data[o + 1] = c[1]; half.data[o + 2] = c[2]; half.data[o + 3] = 255;
    }
  }
  fs.writeFileSync(full.replace('.png', '-half.png'), PNG.sync.write(half));
  console.log(`attente ${NAME}-idle-${tag}.png ${strip.width}×${fh} (${n} images) · ombre retirée ${shadow} px · rabattus ${snapped} px`);
}
