// ============================================================================
// plazaSheet.mjs — PLANCHE-CONTACT des props de place, pour validation.
//
//   Une vignette agrandie ne prouve RIEN : on a déjà conclu faux en lisant une
//   projection sur une vignette. Cette planche montre donc TROIS choses, dans
//   cet ordre d'importance :
//     1. « en situation » — le prop à sa taille d'écran RÉELLE, posé sur le ton
//        du dallage, à côté d'une maison à SA taille réelle. C'est le seul juge
//        de l'échelle, et c'est exactement le défaut d'origine (« les bancs font
//        la taille d'une maison »).
//     2. 1:1 — le sprite tel qu'il sera blité.
//     3. ×4 — pour inspecter le pixel, en dernier seulement.
//
//   Usage :
//     node scripts/plazaSheet.mjs <sortie.html> <étiquette>=<chemin.png> ...
//     node scripts/plazaSheet.mjs out.html "banc antique sud"=public/.../bench-s-antique.png
//
//   Les images sont EMBARQUÉES en base64 : la planche est un fichier unique,
//   lisible tel quel.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

// Ton du dallage de place (PLAZA dans isoRenderer) et de l'herbe, pour juger le
// prop sur son vrai fond et pas sur du blanc.
const PLAZA_TONE = 'rgb(214,206,182)';

// Échelle du jeu, reprise d'isoPlaza.js. TILE = 32 ; le zoom de référence est
// celui auquel Raph joue sur ses captures.
const TILE = 32, ZOOM = 1.5;
const px = (hT) => hT * TILE * ZOOM;

// Hauteurs d'encre par prop (miroir des recettes — à garder synchronisé).
const HT = {
  bench: 0.492, planter: 0.41, fountain: 1.127, grate: 0.35, tree: 1.65,
};
const propOf = (label) => Object.keys(HT).find((k) => label.includes(k))
  || (label.includes('banc') ? 'bench' : label.includes('bac') ? 'planter'
    : label.includes('fontaine') ? 'fountain' : label.includes('grille') ? 'grate' : 'bench');

// Boîte d'ENCRE (alpha > 16) — même seuil que le rendu, donc la taille affichée
// ici est celle que le jeu produira.
function inkBox(file) {
  const img = PNG.sync.read(fs.readFileSync(file));
  const { width: w, height: h, data: d } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (d[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, w, h, iw: w, ih: h };
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, iw: w, ih: h };
}

const dataUri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

// Une maison de référence, à SA taille de rendu (largeur = 1.56 tuile).
// ⚠ Doit être une habitation d'emprise 1×1 (cf. HOUSE_FOOTPRINT) : un manoir ou
// une tour occupe 2 cellules et fausserait la comparaison d'échelle.
const HOUSES = ['public/pixelart/houses/townhouse.png', 'public/pixelart/houses/stonehouse.png'];
function houseTag() {
  const f = HOUSES.find((p) => fs.existsSync(p));
  if (!f) throw new Error('aucune maison de référence : la planche perdrait son seul juge d\'échelle');
  const b = inkBox(f);
  const wpx = 1.56 * TILE * ZOOM;
  const k = wpx / b.w;
  return `<img class="px" src="${dataUri(f)}" style="width:${(b.iw * k).toFixed(1)}px" title="maison 1×1, taille réelle">`;
}

const args = process.argv.slice(2);
const out = args.shift();
const items = args.map((a) => {
  const i = a.indexOf('=');
  return { label: a.slice(0, i), file: a.slice(i + 1) };
}).filter((it) => fs.existsSync(it.file));
if (!items.length) { console.error('aucun fichier'); process.exit(1); }

const cell = (it, mode) => {
  const b = inkBox(it.file);
  const hT = HT[propOf(it.label)] || 0.5;
  let style;
  if (mode === 'jeu') { const k = px(hT) / b.h; style = `width:${(b.iw * k).toFixed(1)}px`; }
  else if (mode === 'x4') style = `width:${b.iw * 4}px`;
  else style = `width:${b.iw}px`;
  return `<figure><img class="px" src="${dataUri(it.file)}" style="${style}"><figcaption>${it.label}<br><span class="dim">encre ${b.w}×${b.h} · canvas ${b.iw}×${b.ih}</span></figcaption></figure>`;
};

const html = `<meta charset="utf-8"><title>Planche-contact — props de place</title>
<style>
  body { margin:0; padding:20px; font:13px/1.5 system-ui,sans-serif; background:#1b1815; color:#e8e0ce; }
  h2 { font-size:14px; letter-spacing:.06em; text-transform:uppercase; color:#c9a961; margin:26px 0 4px; }
  p.note { margin:0 0 12px; color:#9a9188; max-width:62ch; }
  .row { display:flex; flex-wrap:wrap; gap:18px; align-items:flex-end;
         background:${PLAZA_TONE}; padding:18px; border-radius:4px; }
  .row.dark { background:#2a2621; }
  figure { margin:0; text-align:center; }
  figcaption { margin-top:6px; font-size:11px; color:#3a352c; }
  .row.dark figcaption { color:#9a9188; }
  .dim { opacity:.65; font-size:10px; }
  img.px { image-rendering:pixelated; display:block; margin:0 auto; }
  .situ { display:flex; gap:26px; align-items:flex-end; }
</style>
<h2>1 — En situation</h2>
<p class="note">Taille d'écran réelle (TILE 32, zoom ${ZOOM}), sur le ton du dallage, à côté d'une maison 1×1 à sa propre taille réelle. C'est ce plan-là qui décide de l'échelle.</p>
<div class="row"><div class="situ">${items.map((it) => cell(it, 'jeu')).join('')}${houseTag()}</div></div>
<h2>2 — 1:1</h2>
<p class="note">Le sprite tel qu'il sera blité, sans agrandissement.</p>
<div class="row">${items.map((it) => cell(it, '1')).join('')}</div>
<h2>3 — ×4</h2>
<p class="note">Inspection du pixel. À lire en dernier : c'est le plan le plus flatteur et le moins représentatif.</p>
<div class="row dark">${items.map((it) => cell(it, 'x4')).join('')}</div>
`;

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, html);
console.log('planche →', out, '(' + items.length + ' sprites)');
