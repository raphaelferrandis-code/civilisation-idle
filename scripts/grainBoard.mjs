// PLANCHE DE JUGEMENT du grain (lot G0, docs/PLAN-EGALISATION-GRAIN.md) :
// chaque batiment dessine A L'ECHELLE DU JEU (vue ×2), aligne sur une ligne de
// sol commune, porte annotee surlignee en rouge, avec l'habitant-etalon (barre
// noire de 10 px apparents) et la bande cible de porte (lignes vertes a 10 et
// 14 px apparents) tracees sur toute la rangee.
//
//   node scripts/grainBoard.mjs <dossier_sortie>
//
// Sort planche-habitations.png (une rangee par bande d'ere, variantes du tirage
// reel — aux bandes 7+ block/tenement gardent leur peau XIXe a cote des skins
// cosmiques, comme en jeu) et planche-moteurs.png (props 'batiment' a la
// densite ATELIER, tries par porte apparente decroissante). Legende en console.
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { houseScaleK, HOUSE_LOT_WF, ENGINE_UNIT_F, TILE_REF, COSMIC_TOWER_H } from '../src/game/map/spriteScale.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DATA = path.join(ROOT, 'scripts', 'data');
const VIEW = 2;                 // zoom de lecture de la planche
const HUMAIN = 10;              // px apparents @z=1 (perso visible)
const BANDE_PORTE = [10, 14];   // px apparents

// Copie de VARIANTS_HOUSE (buildingGenerator.js) POUR LA PLANCHE seulement —
// pas une source de verite, juste le melange reellement tire par bande.
const VARIANTS_HOUSE = [
  ['tent', 'hut'],
  ['hut', 'longhouse', 'tent'],
  ['townhouse', 'courtyard', 'hut', 'manor'],
  ['stonehouse', 'manor', 'townhouse'],
  ['courtyard', 'stonehouse', 'manor', 'townhouse'],
  ['block', 'tenement', 'tower'],
  ['tower', 'block', 'megablock', 'arcologyhome', 'tenement'],
];
const HOUSE_FOOTPRINT = { manor: [2, 2], tenement: [1, 2], tower: [1, 2], megablock: [2, 2], arcologyhome: [2, 2] };
const COSMIC = new Set(['tower', 'megablock', 'arcologyhome']);

const inv = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-inventory.json'), 'utf8'));
const ann = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-annotations.json'), 'utf8'));
const fracs = JSON.parse(fs.readFileSync(path.join(DATA, 'engine-fractions.json'), 'utf8'));
const invByKey = new Map(inv.entries.map((e) => [e.key, e]));
const annByKey = new Map(ann.entries.map((a) => [a.key, a]));

function pngOf(e) {
  const dir = e.famille === 'house' ? 'houses' : path.join('agents', 'buildings');
  return PNG.sync.read(fs.readFileSync(path.join(ROOT, 'public', 'pixelart', dir, e.key + '.png')));
}

function fond(png, rgb) {
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0]; png.data[i + 1] = rgb[1]; png.data[i + 2] = rgb[2]; png.data[i + 3] = 255;
  }
}
function ligneH(png, y, x0, x1, rgb) {
  if (y < 0 || y >= png.height) return;
  for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x++) {
    const di = (y * png.width + x) * 4;
    png.data[di] = rgb[0]; png.data[di + 1] = rgb[1]; png.data[di + 2] = rgb[2]; png.data[di + 3] = 255;
  }
}
// Blit du sprite (recadre sur src rect) a l'echelle sc, ancre bas-gauche.
function blit(dst, src, sx0, sy0, sw, sh, ox, baseY, sc) {
  const dw = Math.max(1, Math.round(sw * sc)), dh = Math.max(1, Math.round(sh * sc));
  const oy = baseY - dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const si = ((sy0 + Math.min(sh - 1, Math.floor(y / sc))) * src.width + sx0 + Math.min(sw - 1, Math.floor(x / sc))) * 4;
      if (src.data[si + 3] < 8) continue;
      const px = ox + x, py = oy + y;
      if (px < 0 || py < 0 || px >= dst.width || py >= dst.height) continue;
      const di = (py * dst.width + px) * 4;
      dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = 255;
    }
  }
  return { dw, dh, oy };
}
// Voile rouge translucide sur la porte + cadre plein.
function surligne(dst, ox, oy, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = ox + x, py = oy + y;
      if (px < 0 || py < 0 || px >= dst.width || py >= dst.height) continue;
      const di = (py * dst.width + px) * 4;
      const bord = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (bord) { dst.data[di] = 255; dst.data[di + 1] = 0; dst.data[di + 2] = 0; }
      else {
        dst.data[di] = Math.min(255, Math.round(dst.data[di] * 0.55 + 255 * 0.45));
        dst.data[di + 1] = Math.round(dst.data[di + 1] * 0.55);
        dst.data[di + 2] = Math.round(dst.data[di + 2] * 0.55);
      }
      dst.data[di + 3] = 255;
    }
  }
}
// Etalon + bande : barre humaine noire, lignes vertes de bande de porte.
function etalon(dst, x, baseY, largeurRangee) {
  const hh = Math.round(HUMAIN * VIEW);
  for (let y = 0; y < hh; y++) {
    for (let dx = 0; dx < 3; dx++) {
      const di = ((baseY - 1 - y) * dst.width + x + dx) * 4;
      dst.data[di] = 20; dst.data[di + 1] = 20; dst.data[di + 2] = 20; dst.data[di + 3] = 255;
    }
  }
  ligneH(dst, baseY - Math.round(BANDE_PORTE[0] * VIEW), x, x + largeurRangee, [40, 170, 60]);
  ligneH(dst, baseY - Math.round(BANDE_PORTE[1] * VIEW), x, x + largeurRangee, [40, 170, 60]);
  ligneH(dst, baseY, x - 4, x + largeurRangee, [90, 90, 96]);
}

function spriteKeyPourBande(v, bande) {
  if (bande >= 7 && COSMIC.has(v)) return `${v}-cosmic-${Math.min(9, bande)}`;
  return v;
}

function plancheHabitations(outDir) {
  const rangs = [];
  for (let bande = 0; bande <= 9; bande++) {
    const variants = VARIANTS_HOUSE[Math.min(6, bande)];
    const cles = [...new Set(variants.map((v) => spriteKeyPourBande(v, bande)))];
    if (bande >= 8 && cles.join() === rangs[rangs.length - 1]?.cles.join()) continue;
    rangs.push({ bande, cles });
  }
  const MARGE = 24, GAP = 16;
  const items = rangs.map((r) => r.cles.map((key) => {
    const e = invByKey.get(key);
    const base = key.replace(/-cosmic-\d$/, '');
    const [spanX, spanY] = HOUSE_FOOTPRINT[base] && !(COSMIC.has(base) && /-cosmic-/.test(key) && base === 'tower')
      ? HOUSE_FOOTPRINT[base] : (base === 'tower' && /-cosmic-/.test(key) ? [2, 2] : (HOUSE_FOOTPRINT[base] || [1, 1]));
    const wpx = (spanX + spanY) * TILE_REF * HOUSE_LOT_WF;
    const k = houseScaleK(spanX, wpx, e.ink16.w, spanY, key);
    return { key, e, sc: k * VIEW };
  }));
  const largeurs = items.map((row) => row.reduce((s, it) => s + Math.round(it.e.ink16.w * it.sc) + GAP, MARGE + 30));
  const hauteurs = items.map((row) => Math.max(...row.map((it) => Math.round(it.e.ink16.h * it.sc))) + 40);
  const out = new PNG({ width: Math.max(...largeurs) + MARGE, height: hauteurs.reduce((a, b) => a + b, MARGE) });
  fond(out, [232, 230, 224]);
  let baseY = MARGE;
  items.forEach((row, i) => {
    baseY += hauteurs[i];
    etalon(out, MARGE, baseY, largeurs[i] - MARGE);
    let ox = MARGE + 30;
    const legende = [];
    for (const it of row) {
      const png = pngOf(it.e);
      const bb = it.e.ink16;
      const g = blit(out, png, bb.x0, bb.y0, bb.w, bb.h, ox, baseY, it.sc);
      const a = annByKey.get(it.key);
      if (a && a.door) {
        surligne(out,
          ox + Math.round((a.door.x - bb.x0) * it.sc), g.oy + Math.round((a.door.y - bb.y0) * it.sc),
          Math.max(2, Math.round(a.door.w * it.sc)), Math.max(2, Math.round(a.door.h * it.sc)));
      }
      legende.push(`${it.key} (k=${(it.sc / VIEW).toFixed(2)}${a && a.door ? `, porte ${a.door.h}px → ${(a.door.h * it.sc / VIEW).toFixed(1)} app` : ''})`);
      ox += g.dw + GAP;
    }
    console.log(`bande ${rangs[i].bande}: ${legende.join(' | ')}`);
  });
  fs.writeFileSync(path.join(outDir, 'planche-habitations.png'), PNG.sync.write(out));
}

function plancheMoteurs(outDir) {
  const rows = [];
  for (const a of ann.entries) {
    const e = invByKey.get(a.key);
    if (!e || e.famille !== 'engine' || a.nature !== 'batiment' || !a.door) continue;
    const cosmique = e.classe === 'prop-cosmic';
    const fr = fracs.entries[a.key];
    const hFrac = fr ? fr.hFrac : 0.75;
    const dens = cosmique
      ? (4 * TILE_REF * ENGINE_UNIT_F * COSMIC_TOWER_H) / e.h    // chemin blitCosmicTower
      : (4 * TILE_REF * ENGINE_UNIT_F * hFrac) / e.h;            // densite ATELIER
    rows.push({ key: a.key, e, a, dens, sc: dens * VIEW, doorApp: a.door.h * dens, supposee: !cosmique && !fr });
  }
  rows.sort((x, y) => y.doorApp - x.doorApp);
  const MARGE = 24, GAP = 14, LARGEUR = 1500;
  // Passe 1 : layout des rangees (retour a la ligne), pour dimensionner le canvas.
  let ox = MARGE + 30, rangHaut = MARGE, rangMax = 0, rang = [];
  const rangs = [];
  for (const r of rows) {
    const dw = Math.round(r.e.w * r.sc);
    if (ox + dw > LARGEUR - MARGE && rang.length) {
      rangs.push({ items: rang, haut: rangHaut, hMax: rangMax });
      rangHaut += rangMax + 46; ox = MARGE + 30; rangMax = 0; rang = [];
    }
    rang.push({ ...r, ox });
    rangMax = Math.max(rangMax, Math.round(r.e.h * r.sc));
    ox += dw + GAP;
  }
  if (rang.length) rangs.push({ items: rang, haut: rangHaut, hMax: rangMax });
  const dernier = rangs[rangs.length - 1];
  const out = new PNG({ width: LARGEUR, height: (dernier ? dernier.haut + dernier.hMax + 20 : 100) + MARGE });
  fond(out, [232, 230, 224]);
  // Passe 2 : dessin.
  for (const rg of rangs) {
    const baseY = rg.haut + rg.hMax + 20;
    etalon(out, MARGE, baseY, LARGEUR - 2 * MARGE);
    const legende = [];
    for (const it of rg.items) {
      const png = pngOf(it.e);
      const g = blit(out, png, 0, 0, it.e.w, it.e.h, it.ox, baseY, it.sc);
      surligne(out,
        it.ox + Math.round(it.a.door.x * it.sc), g.oy + Math.round(it.a.door.y * it.sc),
        Math.max(2, Math.round(it.a.door.w * it.sc)), Math.max(2, Math.round(it.a.door.h * it.sc)));
      legende.push(`${it.key} (${it.doorApp.toFixed(1)} app${it.supposee ? ', hFrac?' : ''})`);
    }
    console.log('rangee moteurs:', legende.join(' | '));
  }
  fs.writeFileSync(path.join(outDir, 'planche-moteurs.png'), PNG.sync.write(out));
}

const outDir = process.argv[2];
if (!outDir) { console.error('usage: node scripts/grainBoard.mjs <dossier_sortie>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
plancheHabitations(outDir);
plancheMoteurs(outDir);
console.log('planches →', outDir);
