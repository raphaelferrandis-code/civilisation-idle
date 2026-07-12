// normalizeIsoScenes.mjs — NORMALISE la géométrie des scènes iso PixelLab pour
// qu'elles se calent exactement sur la grille losange 2:1 du jeu (retour Raph :
// places « en biais », ponts « dimensions fausses / mauvais sens »).
//
//   • PONTS (bridge-full-*.png) : PCA des pixels opaques → axe principal ;
//     FLIP X si l'axe court en SE (il doit courir en SW : haut-droit → bas-
//     gauche) ; ROTATION nearest-neighbor pour amener l'axe PILE sur la
//     diagonale iso (pente 0.5) ; recadrage au contenu (+2 px).
//   • PLACES (plaza-*.png) : pente du losange de base mesurée entre le coin
//     GAUCHE (colonne la plus à gauche) et le coin SUD (ligne la plus basse) ;
//     re-échantillonnage VERTICAL (facteur 0.5/pente) pour un losange 2:1
//     exact — les verticales (fontaine) s'écrasent d'autant, assumé.
//
// Les originaux sont copiés une fois dans public/pixelart/iso/_orig/ (dossier
// ignoré par quantize). IDEMPOTENT : un fichier déjà normalisé (marqueur dans
// _orig) est re-normalisé DEPUIS l'original, jamais depuis lui-même.
//   Lancer : node scripts/normalizeIsoScenes.mjs [bridges|plazas|all]
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'public/pixelart/iso';
const ORIG = path.join(DIR, '_orig');
const MODE = process.argv[2] || 'all';
fs.mkdirSync(ORIG, { recursive: true });

const A = 40;   // seuil alpha « opaque »

function load(p) { return PNG.sync.read(fs.readFileSync(p)); }
function save(p, png) { fs.writeFileSync(p, PNG.sync.write(png)); }
function fromOrig(name) {
  const cur = path.join(DIR, name), org = path.join(ORIG, name);
  if (!fs.existsSync(org)) fs.copyFileSync(cur, org);
  return load(org);
}

function opaquePixels(png) {
  const pts = [];
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    if (png.data[(y * png.width + x) * 4 + 3] > A) pts.push([x, y]);
  }
  return pts;
}

function flipX(png) {
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    const s = (y * png.width + x) * 4, d = (y * png.width + (png.width - 1 - x)) * 4;
    out.data[d] = png.data[s]; out.data[d + 1] = png.data[s + 1];
    out.data[d + 2] = png.data[s + 2]; out.data[d + 3] = png.data[s + 3];
  }
  return out;
}

// Rotation nearest-neighbor de `ang` rad autour du centre, canvas élargi.
function rotate(png, ang) {
  const S = Math.ceil(Math.hypot(png.width, png.height)) + 4;
  const out = new PNG({ width: S, height: S });
  const cs = Math.cos(-ang), sn = Math.sin(-ang);
  const cx = png.width / 2, cy = png.height / 2, ox = S / 2, oy = S / 2;
  for (let y = 0; y < S; y += 1) for (let x = 0; x < S; x += 1) {
    const dx = x - ox, dy = y - oy;
    const sx = Math.round(cx + dx * cs - dy * sn);
    const sy = Math.round(cy + dx * sn + dy * cs);
    if (sx < 0 || sy < 0 || sx >= png.width || sy >= png.height) continue;
    const s = (sy * png.width + sx) * 4, d = (y * S + x) * 4;
    out.data[d] = png.data[s]; out.data[d + 1] = png.data[s + 1];
    out.data[d + 2] = png.data[s + 2]; out.data[d + 3] = png.data[s + 3];
  }
  return out;
}

function trim(png, margin = 2) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (const [x, y] of opaquePixels(png)) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return png;
  x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin);
  x1 = Math.min(png.width - 1, x1 + margin); y1 = Math.min(png.height - 1, y1 + margin);
  const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  PNG.bitblt(png, out, x0, y0, out.width, out.height, 0, 0);
  return out;
}

// Re-échantillonnage nearest indépendant en X et Y.
function scaleXY(png, fx, fy) {
  const W = Math.max(1, Math.round(png.width * fx));
  const H = Math.max(1, Math.round(png.height * fy));
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y += 1) {
    const sy = Math.min(png.height - 1, Math.round(y / fy));
    for (let x = 0; x < W; x += 1) {
      const sx = Math.min(png.width - 1, Math.round(x / fx));
      const s = (sy * png.width + sx) * 4, d = (y * W + x) * 4;
      out.data[d] = png.data[s]; out.data[d + 1] = png.data[s + 1];
      out.data[d + 2] = png.data[s + 2]; out.data[d + 3] = png.data[s + 3];
    }
  }
  return out;
}

if (MODE === 'bridges' || MODE === 'all') {
  for (const f of fs.readdirSync(DIR)) {
    if (!/^bridge-full-.*\.png$/.test(f)) continue;
    let png = fromOrig(f);
    const pts = opaquePixels(png);
    // PCA : axe principal du nuage opaque.
    let mx = 0, my = 0;
    for (const [x, y] of pts) { mx += x; my += y; }
    mx /= pts.length; my /= pts.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const [x, y] of pts) { const dx = x - mx, dy = y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);   // orientation de l'axe (mod π)
    let vx = Math.cos(th), vy = Math.sin(th);
    if (vy < 0) { vx = -vx; vy = -vy; }                // normalise vy ≥ 0
    let flipped = false;
    if (vx > 0) { png = flipX(png); vx = -vx; flipped = true; }   // SE → SW
    // Rotation vers la diagonale SW exacte : direction cible (−2, 1)/√5.
    const target = Math.atan2(1, -2);
    const cur = Math.atan2(vy, vx);
    const delta = target - cur;
    png = trim(rotate(png, delta));
    save(path.join(DIR, f), png);
    console.log(f, `axe ${(cur * 180 / Math.PI).toFixed(1)}° → ${(target * 180 / Math.PI).toFixed(1)}°`,
      flipped ? '(FLIP X : courait en SE)' : '', `rot ${(delta * 180 / Math.PI).toFixed(1)}°`, `${png.width}×${png.height}`);
  }
}

if (MODE === 'plazas' || MODE === 'all') {
  for (const f of fs.readdirSync(DIR)) {
    if (!/^plaza-.*\.png$/.test(f)) continue;
    const png = fromOrig(f);
    const pts = opaquePixels(png);
    let x0 = png.width, x1 = -1, y1 = -1;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    // Pente du SOCLE par régression sur l'ENVELOPPE BASSE (y opaque le plus bas
    // par colonne), moitié gauche 8-45 % de la largeur : le bord bas-gauche du
    // losange — les bancs/lampes en périphérie ne polluent plus la mesure
    // (l'ancienne mesure aux coins extrêmes se faisait piéger).
    const bottom = new Array(png.width).fill(-1);
    for (const [x, y] of pts) if (y > bottom[x]) bottom[x] = y;
    const rxs = [], rys = [];
    const xa = x0 + Math.round((x1 - x0) * 0.08), xb = x0 + Math.round((x1 - x0) * 0.45);
    for (let x = xa; x <= xb; x += 1) if (bottom[x] >= 0) { rxs.push(x); rys.push(bottom[x]); }
    let mxr = 0, myr = 0;
    for (let i = 0; i < rxs.length; i += 1) { mxr += rxs[i]; myr += rys[i]; }
    mxr /= rxs.length; myr /= rys.length;
    let vxx = 0, vxy = 0;
    for (let i = 0; i < rxs.length; i += 1) { vxx += (rxs[i] - mxr) ** 2; vxy += (rxs[i] - mxr) * (rys[i] - myr); }
    const slope = vxy / Math.max(1, vxx);              // pente du bord bas-gauche du losange
    const c = 0.5 / slope;
    if (Math.abs(c - 1) < 0.04) { save(path.join(DIR, f), png); console.log(f, `pente ${slope.toFixed(3)} ≈ 0.5, inchangé`); continue; }
    // Correction RÉPARTIE entre X et Y (fy/fx = c) : écraser Y seul divisait la
    // fontaine par deux ; élargir un peu + écraser un peu préserve la lecture.
    const fx = 1 / Math.sqrt(c), fy = Math.sqrt(c);
    const out = trim(scaleXY(png, fx, fy));
    save(path.join(DIR, f), out);
    console.log(f, `pente ${slope.toFixed(3)} → 0.5 (X ×${fx.toFixed(3)}, Y ×${fy.toFixed(3)})`, `${out.width}×${out.height}`);
  }
}
console.log('OK — scènes normalisées (originaux dans', ORIG + ')');
