// RECOMPRESSION SANS PERTE DES PNG (audit 2026-10-05, ASSET-1).
//
// Les sprites sortent de pngjs et de PixelLab en RVBA 8 bits, dégonflés au
// réglage par défaut : c'est du pixel art, presque tous tiennent dans une
// palette de 256 couleurs ou moins. Réencodés en palette indexée (PLTE + tRNS),
// ou en RVB quand l'alpha vaut partout 255, ils pèsent 4 à 5 fois moins — pour
// EXACTEMENT les mêmes pixels une fois décodés.
//
// ⚠⚠ CE MODULE NE TOUCHE JAMAIS public/. Il travaille sur une COPIE (dist/,
// via le plugin de build de vite.config.js) : les scripts pngjs du dépôt ne
// savent écrire que du RVBA et les sessions réécrivent public/ sans arrêt.
//
// GARDE ALLER-RETOUR : chaque candidat est relu par pngjs et comparé octet à
// octet au RVBA d'origine. Au moindre écart — ou si rien n'est plus petit —
// c'est l'original qui reste. Le gain ne se paie jamais d'un pixel.
//
// Prudence sur ce qu'on ne sait pas refaire à l'identique : PNG 16 bits (pngjs
// les ramènerait à 8 bits), PNG animé (acTL), ou chunk qui change l'affichage
// (gAMA, iCCP, sRGB, cHRM…) — ces fichiers-là sont rendus tels quels.
import zlib from 'node:zlib';
import { PNG } from 'pngjs';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// Chunks auxiliaires sans effet sur les pixels affichés : on peut les laisser
// tomber. Tout AUTRE chunk auxiliaire → fichier rendu tel quel.
const DROPPABLE = new Set(['tEXt', 'iTXt', 'zTXt', 'tIME', 'pHYs']);
const CRITICAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Liste des chunks, ou null si le fichier n'est pas un PNG lisible.
function readChunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) return null;
  const out = [];
  let o = 8;
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o);
    out.push(buf.toString('latin1', o + 4, o + 8));
    o += 12 + len;
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Lignes filtrées prêtes pour IDAT. adaptive=false : filtre 0 partout (le
// meilleur, en général, pour une palette) ; adaptive=true : par ligne, le filtre
// de plus petite somme absolue (heuristique de la spec PNG, pour le RVB/RVBA).
function filterRows(raw, rows, stride, bpp, adaptive) {
  const out = Buffer.alloc(rows * (stride + 1));
  const zero = Buffer.alloc(stride);
  const cand = adaptive ? [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride)) : null;
  for (let y = 0; y < rows; y++) {
    const cur = raw.subarray(y * stride, (y + 1) * stride);
    const dst = y * (stride + 1);
    if (!adaptive) {
      out[dst] = 0;
      cur.copy(out, dst + 1);
      continue;
    }
    const up = y ? raw.subarray((y - 1) * stride, y * stride) : zero;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0, b = up[x], d = x >= bpp ? up[x - bpp] : 0;
        let v;
        if (f === 0) v = cur[x];
        else if (f === 1) v = cur[x] - a;
        else if (f === 2) v = cur[x] - b;
        else if (f === 3) v = cur[x] - ((a + b) >> 1);
        else v = cur[x] - paeth(a, b, d);
        v &= 255;
        c[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    out[dst] = best;
    cand[best].copy(out, dst + 1);
  }
  return out;
}

const deflate = (buf) => zlib.deflateSync(buf, { level: 9, memLevel: 9 });

// Le plus petit IDAT parmi filtre 0 et filtre adaptatif.
function bestIdat(raw, rows, stride, bpp, tryAdaptive) {
  let best = deflate(filterRows(raw, rows, stride, bpp, false));
  if (tryAdaptive) {
    const alt = deflate(filterRows(raw, rows, stride, bpp, true));
    if (alt.length < best.length) best = alt;
  }
  return best;
}

function ihdr(w, h, depth, colorType) {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(w, 0);
  b.writeUInt32BE(h, 4);
  b[8] = depth;
  b[9] = colorType; // compression 0, filtre 0, pas d'entrelacement
  return b;
}

// Palette indexée (type 3), profondeur 1/2/4/8 selon le nombre de couleurs.
// Les entrées à alpha < 255 passent en tête : le tRNS s'arrête à la dernière.
function encodePalette(w, h, data, colors) {
  const cols = [...colors].sort((a, b) => ((a & 255) === 255) - ((b & 255) === 255));
  const index = new Map(cols.map((c, i) => [c, i]));
  const n = cols.length;
  const depth = n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8;
  const stride = Math.ceil((w * depth) / 8);
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = index.get(data.readUInt32BE((y * w + x) * 4));
      const bit = x * depth;
      raw[y * stride + (bit >> 3)] |= v << (8 - depth - (bit & 7));
    }
  }
  const plte = Buffer.alloc(3 * n);
  cols.forEach((c, i) => {
    plte[3 * i] = c >>> 24;
    plte[3 * i + 1] = (c >>> 16) & 255;
    plte[3 * i + 2] = (c >>> 8) & 255;
  });
  const alphas = cols.filter((c) => (c & 255) !== 255).map((c) => c & 255);
  const parts = [SIGNATURE, chunk('IHDR', ihdr(w, h, depth, 3)), chunk('PLTE', plte)];
  if (alphas.length) parts.push(chunk('tRNS', Buffer.from(alphas)));
  // Filtre 0 seul : mesuré sur un échantillon de 509 sprites en palette, le
  // filtre adaptatif ne gagne que 47 octets au total pour trois fois le temps
  // (c'est aussi le conseil de la spec PNG pour les images indexées).
  parts.push(chunk('IDAT', bestIdat(raw, h, stride, 1, false)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// Couleurs vraies : RVB (type 2) si tout est opaque, sinon RVBA (type 6).
function encodeTruecolor(w, h, data, opaque) {
  const ch = opaque ? 3 : 4;
  const stride = w * ch;
  let raw = data;
  if (opaque) {
    raw = Buffer.alloc(stride * h);
    for (let p = 0, q = 0; p < data.length; p += 4) {
      raw[q++] = data[p];
      raw[q++] = data[p + 1];
      raw[q++] = data[p + 2];
    }
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr(w, h, 8, opaque ? 2 : 6)),
    chunk('IDAT', bestIdat(raw, h, stride, ch, true)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sameRgba(png, w, h, data) {
  if (png.width !== w || png.height !== h || png.data.length !== data.length) return false;
  return Buffer.compare(Buffer.from(png.data.buffer, png.data.byteOffset, png.data.length), data) === 0;
}

// Le PNG le plus léger aux pixels IDENTIQUES, ou null s'il faut garder
// l'original (déjà optimal, format non pris en charge, illisible).
export function recompressPng(buf) {
  const types = readChunks(buf);
  if (!types || types[0] !== 'IHDR') return null;
  if (types.some((t) => !CRITICAL.has(t) && !DROPPABLE.has(t))) return null;
  if (buf[24] === 16) return null; // 16 bits : pngjs le relirait en 8 bits
  let src;
  try {
    src = PNG.sync.read(buf);
  } catch {
    return null;
  }
  const { width: w, height: h } = src;
  const data = Buffer.from(src.data.buffer, src.data.byteOffset, src.data.length);
  const colors = new Set();
  let opaque = true;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 255) opaque = false;
    if (colors.size <= 256) colors.add(data.readUInt32BE(i));
  }
  // Un seul candidat : la palette dès qu'elle suffit (elle bat le RVB/RVBA sur
  // tout le pixel art), sinon les couleurs vraies. On garde le plus petit de
  // lui et de l'original.
  const out = colors.size <= 256 ? encodePalette(w, h, data, colors) : encodeTruecolor(w, h, data, opaque);
  if (out.length >= buf.length) return null;
  try {
    return sameRgba(PNG.sync.read(out), w, h, data) ? out : null;
  } catch {
    return null;
  }
}
