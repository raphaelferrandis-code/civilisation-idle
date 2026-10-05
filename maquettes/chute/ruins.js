// LES RUINES DESSINÉES — registre des sprites « ruine » de la maquette.
//
// Chaque ruine est le sprite du jeu ÉDITÉ par PixelLab (même angle, même cadre, même
// palette), rangée dans art/ruines/<bande>/ et décrite par manifest.json :
//   houses[clé de sprite]   → { file, ox, oy } : position de l'original dans la ruine
//   engines[empreinte]      → { file, ox, oy } : idem, pour le canvas d'une scène moteur
// La teinte par tuile du jeu (variantes de matière des maisons, des rangées) est
// TRANSPOSÉE sur la ruine : on lit, pixel à pixel, ce que la variante a fait de
// l'original, et on applique la même table de couleurs à la ruine.

const BASE = '/maquettes/chute/art/ruines/';
const HOUSES = '/pixelart/houses/';

function loadImg(url) {
  const img = new Image();
  const e = { img, ready: false };
  img.onload = () => { e.ready = true; };
  img.src = url;
  return e;
}
function pixels(src, sx = 0, sy = 0, w = src.width || src.naturalWidth, h = src.height || src.naturalHeight) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, sx, sy, w, h, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}
function fnv(d) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < d.length; i += 1) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

export const Ruins = {
  man: { houses: {}, engines: {} },
  imgs: new Map(),
  bases: new Map(),
  tinted: new WeakMap(),       // canvas de variante (jeu) → canvas de ruine teinté
  hashOf: new WeakMap(),       // canvas de scène → empreinte
  avg: new WeakMap(),          // image → couleur moyenne des murs (poussière)

  async load() {
    const r = await fetch(BASE + 'manifest.json?v=' + Date.now());
    this.man = await r.json();
    for (const [k, e] of Object.entries(this.man.houses)) this.imgs.set('h:' + k, loadImg(BASE + e.file));
    for (const [k, e] of Object.entries(this.man.engines)) this.imgs.set('e:' + k, loadImg(BASE + e.file));
    for (const k of Object.keys(this.man.houses)) this.bases.set(k, loadImg(HOUSES + k + '.png'));
  },

  // Ruine d'une maison telle que le jeu la dessine (g = géométrie de drawPixelHouse).
  // Renvoie { img, ox, oy } (ox, oy : coin de la boîte d'encre de g dans l'image) ou null.
  house(g) {
    const e = this.man.houses[g.key];
    const r = e && this.imgs.get('h:' + g.key);
    if (!r || !r.ready) return null;
    const isBase = g.img instanceof HTMLImageElement;
    let img = r.img;
    if (!isBase) {
      let t = this.tinted.get(g.img);
      if (t === undefined) {
        const b = this.bases.get(g.key);
        t = (b && b.ready) ? this.transpose(b.img, g, r.img) : null;
        if (t) this.tinted.set(g.img, t);
      }
      if (t) img = t;
    }
    return { img, ox: e.ox + g.ox, oy: e.oy + g.oy };
  },

  // Table couleur original → variante, appliquée à la ruine.
  transpose(baseImg, g, ruinImg) {
    const a = pixels(baseImg, g.ox, g.oy, g.bb.w, g.bb.h).data;
    const b = pixels(g.img, g.bb.x0, g.bb.y0, g.bb.w, g.bb.h).data;
    const votes = new Map();
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 128 || b[i + 3] < 128) continue;
      const ka = (a[i] << 16) | (a[i + 1] << 8) | a[i + 2], kb = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
      let m = votes.get(ka);
      if (!m) votes.set(ka, (m = new Map()));
      m.set(kb, (m.get(kb) || 0) + 1);
    }
    const map = new Map();
    for (const [ka, m] of votes) {
      let best = ka, n = -1;
      for (const [kb, c] of m) if (c > n) { n = c; best = kb; }
      if (best !== ka) map.set(ka, best);
    }
    if (!map.size) return null;
    const out = pixels(ruinImg);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const k = map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      if (k === undefined) continue;
      d[i] = k >> 16; d[i + 1] = (k >> 8) & 255; d[i + 2] = k & 255;
    }
    const c = document.createElement('canvas');
    c.width = out.width; c.height = out.height;
    c.getContext('2d').putImageData(out, 0, 0);
    return c;
  },

  // Ruine d'une scène moteur : par l'empreinte du canvas que la scène dessine.
  engine(srcCanvas) {
    let h = this.hashOf.get(srcCanvas);
    if (h === undefined) {
      try { h = fnv(pixels(srcCanvas).data); } catch { h = null; }
      this.hashOf.set(srcCanvas, h);
    }
    const e = h && this.man.engines[h];
    const r = e && this.imgs.get('e:' + h);
    return r && r.ready ? { img: r.img, ox: e.ox, oy: e.oy } : null;
  },

  // RUINE ARASÉE (un cycle plus tard) : la même ruine, rasée à quelques pixels de
  // sa base. La coupe SUIT le pied du bâtiment colonne par colonne (le pied d'un
  // bâtiment iso est en V), à une hauteur qui varie par paliers : des pans de mur
  // bas, cassés, et le tas de gravats qui était déjà au pied.
  razedOf: new WeakMap(),
  razed(img, seed = 1) {
    let c = this.razedOf.get(img);
    if (c) return c;
    const px = pixels(img);
    const W = px.width, H = px.height, d = px.data;
    const base = new Int32Array(W).fill(-1);
    for (let x = 0; x < W; x += 1) for (let y = H - 1; y >= 0; y -= 1) if (d[(y * W + x) * 4 + 3] > 128) { base[x] = y; break; }
    let s = seed >>> 0 || 7;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const inkH = (() => { let top = H; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { top = Math.floor(i / 4 / W); break; } let b = 0; for (const v of base) if (v > b) b = v; return Math.max(8, b - top); })();
    let h = 0, run = 0;
    for (let x = 0; x < W; x += 1) {
      if (run <= 0) { h = Math.round(inkH * (0.1 + rnd() * 0.16)); run = 2 + Math.floor(rnd() * 4); }
      run -= 1;
      if (base[x] < 0) continue;
      const cut = base[x] - h;
      for (let y = 0; y < cut; y += 1) d[(y * W + x) * 4 + 3] = 0;
    }
    c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').putImageData(px, 0, 0);
    this.razedOf.set(img, c);
    return c;
  },

  // Couleur moyenne des MURS (moitié basse du sprite), pour teinter la poussière.
  wallColor(img, sx = 0, sy = 0, w = img.width || img.naturalWidth, h = img.height || img.naturalHeight) {
    const k = this.avg.get(img);
    if (k) return k;
    let r = 0, g = 0, b = 0, n = 0;
    try {
      const d = pixels(img, sx, sy + Math.floor(h * 0.45), w, Math.ceil(h * 0.55)).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1; }
    } catch { /* image pas lisible : poussière neutre */ }
    const c = n ? [r / n, g / n, b / n] : [180, 166, 146];
    this.avg.set(img, c);
    return c;
  },
};
