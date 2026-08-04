// Verification VISUELLE des annotations portes/fenetres (lot G0,
// docs/PLAN-EGALISATION-GRAIN.md) : dessine les rects annotes sur les sprites
// agrandis, pour juger a l'oeil que la mesure colle a l'art.
//
//   node scripts/annotateCheck.mjs overlays <dossier_sortie>   → un PNG par sprite annote (porte ROUGE, fenetre BLEUE)
//   node scripts/annotateCheck.mjs sheets <dossier_sortie>     → planches de recadrage sur les PORTES (grilles 6x4) + legende console
//
// Lit scripts/data/sprite-annotations.json + sprite-inventory.json (chemins).
// Lecture seule sur les PNG du repo.
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DATA = path.join(ROOT, 'scripts', 'data');

function loadSprite(inv, key) {
  const e = inv.entries.find((x) => x.key === key);
  if (!e) return null;
  const dir = e.famille === 'house' ? 'houses' : path.join('agents', 'buildings');
  const p = path.join(ROOT, 'public', 'pixelart', dir, key + '.png');
  return { e, png: PNG.sync.read(fs.readFileSync(p)) };
}

function upscale(src, K) {
  const dst = new PNG({ width: src.width * K, height: src.height * K });
  for (let y = 0; y < dst.height; y++) {
    for (let x = 0; x < dst.width; x++) {
      const si = ((Math.floor(y / K) * src.width) + Math.floor(x / K)) * 4;
      const di = (y * dst.width + x) * 4;
      dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = src.data[si + 3];
    }
  }
  return dst;
}

function drawRect(png, r, K, rgb) {
  // Math.round : les planches passent des coords fractionnaires (ox/k) — un
  // index flottant dans png.data ecrirait a cote du tableau, pas un pixel.
  const x0 = Math.round(r.x * K), y0 = Math.round(r.y * K),
    x1 = Math.round((r.x + r.w) * K) - 1, y1 = Math.round((r.y + r.h) * K) - 1;
  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const di = (y * png.width + x) * 4;
    png.data[di] = rgb[0]; png.data[di + 1] = rgb[1]; png.data[di + 2] = rgb[2]; png.data[di + 3] = 255;
  };
  for (let x = x0; x <= x1; x++) { put(x, y0); put(x, y1); }
  for (let y = y0; y <= y1; y++) { put(x0, y); put(x1, y); }
}

function overlays(outDir) {
  const inv = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-inventory.json'), 'utf8'));
  const ann = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-annotations.json'), 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const a of ann.entries) {
    if (!a.door && !a.window) continue;
    const s = loadSprite(inv, a.key);
    if (!s) { console.warn('inventaire sans', a.key); continue; }
    const K = s.png.height > 200 ? 3 : 6;
    const up = upscale(s.png, K);
    if (a.door) drawRect(up, a.door, K, [255, 0, 0]);
    if (a.window) drawRect(up, a.window, K, [0, 128, 255]);
    fs.writeFileSync(path.join(outDir, `${a.key}-check.png`), PNG.sync.write(up));
    n++;
  }
  console.log(n, 'overlays →', outDir);
}

// Planches de PORTES : recadrage (porte + 8 px de marge) ×8, grille 6×4 par
// planche. La legende console fait foi : planche/cellule → cle + rect.
function sheets(outDir) {
  const inv = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-inventory.json'), 'utf8'));
  const ann = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-annotations.json'), 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const doors = ann.entries.filter((a) => a.door);
  const COLS = 6, ROWS = 4, CELL = 220, K = 8, MARGE = 8;
  let sheet = 0;
  for (let i = 0; i < doors.length; i += COLS * ROWS) {
    const batch = doors.slice(i, i + COLS * ROWS);
    const out = new PNG({ width: COLS * CELL, height: ROWS * CELL });
    // fond gris fonce
    for (let j = 0; j < out.data.length; j += 4) { out.data[j] = 24; out.data[j + 1] = 24; out.data[j + 2] = 28; out.data[j + 3] = 255; }
    const legende = [];
    batch.forEach((a, j) => {
      const s = loadSprite(inv, a.key);
      if (!s) return;
      const col = j % COLS, row = Math.floor(j / COLS);
      const r = a.door;
      const cx0 = Math.max(0, r.x - MARGE), cy0 = Math.max(0, r.y - MARGE);
      const cx1 = Math.min(s.png.width, r.x + r.w + MARGE), cy1 = Math.min(s.png.height, r.y + r.h + MARGE);
      const cw = cx1 - cx0, ch = cy1 - cy0;
      const k = Math.max(2, Math.min(K, Math.floor(CELL / Math.max(cw, ch))));
      const ox = col * CELL + Math.floor((CELL - cw * k) / 2), oy = row * CELL + Math.floor((CELL - ch * k) / 2);
      for (let y = 0; y < ch * k; y++) {
        for (let x = 0; x < cw * k; x++) {
          const si = ((cy0 + Math.floor(y / k)) * s.png.width + cx0 + Math.floor(x / k)) * 4;
          if (s.png.data[si + 3] < 8) continue;
          const di = ((oy + y) * out.width + ox + x) * 4;
          out.data[di] = s.png.data[si]; out.data[di + 1] = s.png.data[si + 1];
          out.data[di + 2] = s.png.data[si + 2]; out.data[di + 3] = 255;
        }
      }
      drawRect(out, { x: (ox / k + r.x - cx0), y: (oy / k + r.y - cy0), w: r.w, h: r.h }, k, [255, 0, 0]);
      legende.push(`  [${row},${col}] ${a.key} door=${JSON.stringify(r)} (${a.doorKind || 'porte'})`);
    });
    fs.writeFileSync(path.join(outDir, `portes-${sheet}.png`), PNG.sync.write(out));
    console.log(`portes-${sheet}.png :`);
    for (const l of legende) console.log(l);
    sheet++;
  }
}

const cmd = process.argv[2], out = process.argv[3];
if (cmd === 'overlays' && out) overlays(out);
else if (cmd === 'sheets' && out) sheets(out);
else { console.error('usage: node scripts/annotateCheck.mjs overlays|sheets <dossier_sortie>'); process.exit(1); }
