// Planche-contact du pilote Blender : pour chaque maison, le sprite ACTUEL
// (public/pixelart/houses) à côté du rendu Blender (blender/out), recadré sur
// son encre, agrandi ×S en nearest. Écrit blender/out/contact.png et les
// sprites recadrés blender/out/<nom>.crop.png (ce sont eux qu'on quantifie).
//   node blender/contact.cjs [--scale 4]
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const S = (() => { const i = process.argv.indexOf('--scale'); return i > 0 ? +process.argv[i + 1] : 4; })();
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const NAMES = ['hut', 'stonehouse', 'tenement'];

const read = (f) => PNG.sync.read(fs.readFileSync(f));
function bbox(p) {
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if (p.data[(y * p.width + x) * 4 + 3] < 8) continue;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function crop(p, b) {
  const o = new PNG({ width: b.w, height: b.h });
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const si = ((b.y0 + y) * p.width + b.x0 + x) * 4, di = (y * b.w + x) * 4;
    for (let k = 0; k < 4; k++) o.data[di + k] = p.data[si + k];
  }
  return o;
}
function colors(p) {
  const m = new Set();
  for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3] >= 128) m.add(p.data[i] + ',' + p.data[i + 1] + ',' + p.data[i + 2]);
  return m.size;
}

const cells = [];
for (const n of NAMES) {
  const cur = read(path.join(ROOT, 'public/pixelart/houses', n + '.png'));
  const raw = read(path.join(OUT, n + '.png'));
  const b = bbox(raw);
  if (!b) { console.log(n, ': rendu VIDE'); continue; }
  const nw = crop(raw, b);
  fs.writeFileSync(path.join(OUT, n + '.crop.png'), PNG.sync.write(nw));
  console.log(`${n}: actuel ${cur.width}x${cur.height} (${colors(cur)} teintes) | blender ${nw.width}x${nw.height} (${colors(nw)} teintes)`);
  cells.push([cur, nw]);
}
const PAD = 12;
const cw = cells.reduce((a, [c, n]) => Math.max(a, c.width + n.width), 0) * S + PAD * 3;
const ch = cells.reduce((a, [c, n]) => a + Math.max(c.height, n.height) * S + PAD, PAD);
const sheet = new PNG({ width: cw, height: ch });
for (let i = 0; i < sheet.data.length; i += 4) { sheet.data[i] = 96; sheet.data[i + 1] = 100; sheet.data[i + 2] = 92; sheet.data[i + 3] = 255; }
function blit(p, ox, oy) {
  for (let y = 0; y < p.height * S; y++) for (let x = 0; x < p.width * S; x++) {
    const si = (((y / S) | 0) * p.width + ((x / S) | 0)) * 4;
    if (p.data[si + 3] < 8) continue;
    const di = ((oy + y) * sheet.width + ox + x) * 4;
    for (let k = 0; k < 3; k++) sheet.data[di + k] = p.data[si + k];
  }
}
let y = PAD;
for (const [c, n] of cells) {
  const rowH = Math.max(c.height, n.height) * S;
  blit(c, PAD, y + rowH - c.height * S);                    // pieds alignés en bas
  blit(n, PAD * 2 + c.width * S, y + rowH - n.height * S);
  y += rowH + PAD;
}
fs.writeFileSync(path.join(OUT, 'contact.png'), PNG.sync.write(sheet));
console.log('contact →', path.join(OUT, 'contact.png'));
