/**
 * exportWizardChrome.mjs — chrome « cuir » du pack Complete UI Book Styles
 * (02_WizardBook, licence Crusenho : usage commercial libre, crédit obligatoire).
 *
 * Copie les sprites retenus vers public/pixelart/ui/chrome/wizard/ et génère
 * les variantes d'état par REMAP EXACT de la rampe (le pack n'a que 2 à 6 tons
 * par objet, une correspondance couleur à couleur suffit et reste sans perte).
 *
 * Pourquoi un remap et pas un filtre CSS : `filter: sepia/hue-rotate` déplace
 * TOUTES les teintes d'un bloc, y compris le contour sombre qui fait la
 * profondeur — le bouton perdrait exactement ce qu'on est venu chercher.
 *
 * Usage : node scripts/exportWizardChrome.mjs [chemin du pack]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || join(
  process.env.LOCALAPPDATA || '', 'Temp', 'claude',
  'C--Users-Raphi-civilisation-idle', '2b8c464b-7745-42f6-ba28-d1941e8510b4',
  'scratchpad', 'uibookfull', 'Complete_UI_Book_Styles_Pack_Full_v1.0',
  '02_WizardBook', 'Sprites'
);
const OUT = join(ROOT, 'public', 'pixelart', 'ui', 'chrome', 'wizard');

/* ---------- PNG minimal (lecture + écriture RGBA, sans dépendance) -------- */
function readPng(buf) {
  let p = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, pal = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('PNG entrelacé non géré');
    } else if (type === 'PLTE') pal = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('profondeur ' + bitDepth + ' non gérée');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!ch) throw new Error('colorType ' + colorType + ' non géré');
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[o++];
    const line = raw.subarray(o, o + stride); o += stride;
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
  }
  // → RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, n = w * h; i < n; i++) {
    let r, g, b, a = 255;
    if (colorType === 6) { r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; a = px[i * 4 + 3]; }
    else if (colorType === 2) { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2]; }
    else if (colorType === 3) { const ix = px[i]; r = pal[ix * 3]; g = pal[ix * 3 + 1]; b = pal[ix * 3 + 2]; if (trns && ix < trns.length) a = trns[ix]; }
    else if (colorType === 0) { r = g = b = px[i]; }
    else { r = g = b = px[i * 2]; a = px[i * 2 + 1]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

function writePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(8 + data.length + 4);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii');
    data.copy(b, 8); b.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return b;
  };
  let tbl = null;
  function crc(buf) {
    if (!tbl) { tbl = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tbl[n] = c; } }
    let c = -1; for (const v of buf) c = tbl[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();

function remap(img, map) {
  const out = Buffer.from(img.rgba);
  for (let i = 0, n = img.w * img.h; i < n; i++) {
    if (out[i * 4 + 3] < 128) continue;
    const k = hex(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]);
    const to = map[k];
    if (!to) continue;
    out[i * 4] = parseInt(to.slice(1, 3), 16);
    out[i * 4 + 1] = parseInt(to.slice(3, 5), 16);
    out[i * 4 + 2] = parseInt(to.slice(5, 7), 16);
  }
  return { w: img.w, h: img.h, rgba: out };
}

/* ---------- Rampes -------------------------------------------------------
   Le remap conserve la STRUCTURE de contraste du pack (contour très sombre,
   champ, rehaut) et n'en change que la teinte. C'est ce contour opaque qui
   donne la profondeur ; un filtre CSS l'aurait éclairci avec le reste.        */
/* Or de marque, décliné en 7 crans autour de --brand-gold #C9A968 (indice 3).
   Les deux premiers tons sont volontairement TRÈS sombres : ce sont eux qui
   remplacent le contour #32211B du cuir, donc eux qui portent la profondeur. */
const OR = ['#241A08', '#3A2C10', '#6B5423', '#C9A968', '#E4C77E', '#F3E8CC', '#FFF6E2'];
const OR_ANCRE = 3;

function rampMap(img, to, ancre) {
  /* ANCRAGE SUR LE TON DOMINANT, décalage d'un cran par rang.
     Deux approches ont échoué avant celle-ci, elles sont notées pour ne pas
     être rejouées :
       · par RANG étalé sur toute la rampe → un sprite n'a que 2 à 6 tons, le
         champ (mi-clair) était poussé vers l'avant-dernier cran : bouton blanc.
       · par LUMINANCE normalisée entre le ton le plus sombre et le plus clair
         PRÉSENTS → sur `button` le ton le plus clair EST le champ (ce sprite
         n'a pas de rehaut plus clair que lui), donc il repartait à 1,0 : encore
         blanc.
     Ici le ton le plus RÉPANDU en pixels est le champ par construction ; on le
     colle sur `ancre` (l'or de marque) et chaque ton voisin descend ou monte
     d'exactement un cran. Le contour reste le plus sombre, le rehaut le plus
     clair, et la structure de contraste du pack est conservée telle quelle. */
  const seen = new Map(), count = new Map();
  for (let i = 0, n = img.w * img.h; i < n; i++) {
    if (img.rgba[i * 4 + 3] < 128) continue;
    const k = hex(img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2]);
    if (!seen.has(k)) seen.set(k, 0.2126 * img.rgba[i * 4] + 0.7152 * img.rgba[i * 4 + 1] + 0.0722 * img.rgba[i * 4 + 2]);
    count.set(k, 1 + (count.get(k) || 0));
  }
  const parLum = [...seen.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0]);
  let dom = parLum[0], best = -1;
  for (const [k, c] of count) if (c > best) { best = c; dom = k; }
  const rangDom = parLum.indexOf(dom);
  const map = {};
  parLum.forEach((k, i) => {
    map[k] = to[Math.max(0, Math.min(to.length - 1, ancre + (i - rangDom)))];
  });
  return map;
}

const PICKS = [
  ['Button08a', 'button'],   // plaque d'action : cuir embossé + socle, coins coupés
  ['Button01a', 'button-sm'],// utilitaire
  ['Frame04a',  'segment'],  // segment / onglet
  ['Slot01a',   'card'],     // carte, rangée d'achat
  ['Slot01b',   'card-on'],  // carte retenue
  ['Bar01a',    'gauge'],    // piste de jauge
  ['Fill01a',   'gauge-fill']
];

if (!existsSync(SRC)) { console.error('Pack introuvable :', SRC); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const manifest = [];
for (const [src, name] of PICKS) {
  const img = readPng(readFileSync(join(SRC, `UI_WizardBook_${src}.png`)));
  writeFileSync(join(OUT, `${name}.png`), writePng(img.w, img.h, img.rgba));
  manifest.push(`${name}.png        ${img.w}x${img.h}   <- ${src}`);
  if (name === 'button' || name === 'button-sm' || name === 'segment' || name === 'card') {
    const gold = remap(img, rampMap(img, OR, OR_ANCRE));
    writeFileSync(join(OUT, `${name}-gold.png`), writePng(gold.w, gold.h, gold.rgba));
    manifest.push(`${name}-gold.png   ${img.w}x${img.h}   (remap or)`);
  }
}
console.log(manifest.join('\n'));
console.log('\n->', OUT);
