// daPanel.mjs — compose la PLANCHE du panel de DA habitants (chantier iso).
// Télécharge les zips des personnages pilotes PixelLab, extrait 2 vues
// (south + south-east) par candidat, et assemble une planche à l'échelle 3×
// (nearest-neighbor) → .preview-shots/da-panel.png. Ordre des colonnes = ordre
// du tableau CANDIDATES (A, B, C, D — légende donnée dans la conversation).
//   Lancer : node scripts/daPanel.mjs
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const CANDIDATES = [
  // Panel v2 « petit peuple » (v3 quality — le standard faisait des yeux ratés).
  // Panel v1 (A-D, mode standard) : ids d14b697d / 022d9052 / cbca1463 / 6de574da.
  { label: 'E-creature-dodue', id: '8b06561b-e563-43fc-a320-751116fc5ed7' },
  { label: 'F-tete-embleme', id: '94b19c13-5e6b-452f-a745-04c159505bb1' },
  { label: 'G-ombre-doree', id: '2d6a6784-2199-4b57-ab52-5426eba3cb24' },
];
const VIEWS = ['south', 'south-east'];
const SCALE = 3, PAD = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function scaleNearest(src, k) {
  const out = new PNG({ width: src.width * k, height: src.height * k });
  for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) {
    const si = ((Math.floor(y / k) * src.width) + Math.floor(x / k)) * 4;
    const di = (y * out.width + x) * 4;
    out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1];
    out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3];
  }
  return out;
}

const cells = [];   // [col][row] = PNG
for (const c of CANDIDATES) {
  let got = null;
  for (let t = 0; t < 40 && !got; t += 1) {
    try {
      const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/characters/${c.id}/download`).then((r) => r.arrayBuffer()));
      const zip = new AdmZip(buf);
      const views = {};
      for (const e of zip.getEntries()) {
        const m = e.entryName.match(/rotations\/(south|south-east)\.png$/i);
        if (m) views[m[1].toLowerCase()] = PNG.sync.read(e.getData());
      }
      if (VIEWS.every((v) => views[v])) got = views;
    } catch { /* pas prêt */ }
    if (!got) await sleep(12000);
  }
  if (!got) { console.warn(c.label, '— pas prêt, colonne vide'); cells.push(null); continue; }
  cells.push(VIEWS.map((v) => scaleNearest(got[v], SCALE)));
  console.log(c.label, '— ok');
}

const cw = Math.max(...cells.filter(Boolean).map((col) => Math.max(...col.map((p) => p.width))));
const chh = Math.max(...cells.filter(Boolean).map((col) => Math.max(...col.map((p) => p.height))));
const W = CANDIDATES.length * (cw + PAD) + PAD;
const H = VIEWS.length * (chh + PAD) + PAD;
const sheet = new PNG({ width: W, height: H });
// fond bleu nuit (comme le logo) pour juger les silhouettes
for (let i = 0; i < sheet.data.length; i += 4) { sheet.data[i] = 24; sheet.data[i + 1] = 30; sheet.data[i + 2] = 52; sheet.data[i + 3] = 255; }
cells.forEach((col, ci) => {
  if (!col) return;
  col.forEach((img, ri) => {
    const ox = PAD + ci * (cw + PAD) + Math.floor((cw - img.width) / 2);
    const oy = PAD + ri * (chh + PAD) + Math.floor((chh - img.height) / 2);
    // blit avec alpha (bitblt écrase l'alpha → copie manuelle)
    for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
      const si = (y * img.width + x) * 4;
      if (img.data[si + 3] < 8) continue;
      const di = ((oy + y) * W + (ox + x)) * 4;
      sheet.data[di] = img.data[si]; sheet.data[di + 1] = img.data[si + 1];
      sheet.data[di + 2] = img.data[si + 2]; sheet.data[di + 3] = 255;
    }
  });
});
const OUT_SHEET = process.argv[2] || '.preview-shots/da-panel.png';
fs.mkdirSync('.preview-shots', { recursive: true });
fs.writeFileSync(OUT_SHEET, PNG.sync.write(sheet));
console.log('planche →', OUT_SHEET, `(${W}×${H})`);
