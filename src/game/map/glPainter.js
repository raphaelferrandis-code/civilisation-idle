"use strict";

// ── BATCHER DE SPRITES WebGL2 (chantier rendu, étape 2) ──────────────────────
// Canvas 2D dicte au GPU un ordre PAR SPRITE : 3-4 000 appels `drawImage` par
// frame au dézoom, et le GPU passe son temps à attendre les instructions
// (diagnostic de juillet : piste GPU pleine, thread principal à 35 %). Ici, les
// sprites sont empilés dans un tampon de sommets et partent en UN SEUL appel de
// dessin — c'est ce que la carte graphique sait faire de mieux.
//
// TROIS PROPRIÉTÉS qui rendent la greffe possible sans rien casser :
//  1. ORDRE PRÉSERVÉ. Les quads sont dessinés dans leur ordre d'insertion, avec
//     le même mélange alpha que Canvas 2D : c'est exactement l'algorithme du
//     peintre. Aucun tri à refaire, aucun test de profondeur à régler.
//  2. PIXEL-ART EXACT. Filtrage NEAREST, alpha prémultiplié à l'upload, et le
//     rendu se fait en pixels écran entiers — mêmes pixels que
//     `imageSmoothingEnabled = false`.
//  3. REPLI TOTAL. Sans WebGL2 (vieux pilote, contexte perdu), `glReady()` est
//     faux et l'appelant garde son chemin Canvas 2D. Aucun état de jeu ici.
//
// ATLAS : chaque source (Image décodée, canvas hors écran) est copiée UNE fois
// dans une grande texture, par étagères (shelf packing). Les bandes d'agents
// sont déjà des atlas linéaires : on les copie telles quelles et on découpe par
// UV, sans re-tranchage. Une source trop grande, ou un atlas plein, renvoie
// `false` → l'appelant dessine ce sprite en 2D (dégradation progressive).

const ATLAS_SIZE = 4096;

let gl = null;
let canvas = null;
let prog = null;
let vbo = null;
let tex = null;
let ready = false;
let failed = false;

// Étagères de l'atlas : { y, h, x } — remplissage par bandes horizontales.
let shelves = [];
let atlasFull = false;
const placed = new WeakMap(); // source -> { x, y, w, h }

// Tampon de sommets : 6 sommets par quad (2 triangles), 8 flottants par sommet
// (x, y, u, v, r, g, b, a). Croît par doublement, jamais réalloué par frame.
let buf = new Float32Array(6 * 8 * 2048);
let n = 0;          // sommets accumulés
let vw = 0, vh = 0; // viewport logique courant

const VERT = `#version 300 es
in vec2 aPos;
in vec2 aUV;
in vec4 aTint;
uniform vec2 uView;
out vec2 vUV;
out vec4 vTint;
void main() {
  // Pixels écran → repère normalisé, origine en HAUT à gauche comme Canvas 2D.
  vec2 p = vec2(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0);
  gl_Position = vec4(p, 0.0, 1.0);
  vUV = aUV;
  vTint = aTint;
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec4 vTint;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  // Texture en alpha PRÉMULTIPLIÉ : la teinte module couleur et opacité
  // ensemble, exactement comme un globalAlpha appliqué à un drawImage.
  vec4 t = texture(uTex, vUV);
  outColor = t * vTint;
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    if (typeof console !== 'undefined') console.warn('[glPainter] shader:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

// Prépare le contexte. Idempotent ; `failed` fige l'échec (on ne retente pas à
// chaque frame).
export function glInit() {
  if (ready || failed) return ready;
  try {
    if (typeof document === 'undefined') { failed = true; return false; }
    canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false,
      depth: false, stencil: false, preserveDrawingBuffer: false,
    });
    if (!gl) { failed = true; return false; }
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { failed = true; return false; }
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.bindAttribLocation(prog, 1, 'aUV');
    gl.bindAttribLocation(prog, 2, 'aTint');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (typeof console !== 'undefined') console.warn('[glPainter] link:', gl.getProgramInfoLog(prog));
      failed = true; return false;
    }
    vbo = gl.createBuffer();
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_SIZE, ATLAS_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // NEAREST : le pixel-art ne se lisse jamais. CLAMP : pas de répétition.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    // Sources prémultipliées : mélange « source-over » de Canvas 2D.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ready = false; failed = true; });
    ready = true;
    return true;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[glPainter] init impossible:', e);
    failed = true;
    return false;
  }
}

export function glReady() { return ready; }
export function glGetCanvas() { return canvas; }

// Réserve une place dans l'atlas et y copie la source. Renvoie la région, ou
// null si la source est trop grande / l'atlas plein.
function place(src, w, h) {
  if (atlasFull || w > ATLAS_SIZE || h > ATLAS_SIZE) return null;
  for (const sh of shelves) {
    if (h <= sh.h && sh.x + w <= ATLAS_SIZE) {
      const r = { x: sh.x, y: sh.y, w, h };
      sh.x += w;
      return r;
    }
  }
  const top = shelves.length ? shelves[shelves.length - 1] : null;
  const y = top ? top.y + top.h : 0;
  if (y + h > ATLAS_SIZE) { atlasFull = true; return null; }
  const sh = { y, h, x: w };
  shelves.push(sh);
  return { x: 0, y, w, h };
}

// Enregistre (une fois) une source dans l'atlas. `src` : Image décodée,
// HTMLCanvasElement ou OffscreenCanvas.
function ensure(src) {
  let r = placed.get(src);
  if (r !== undefined) return r;
  const w = src.naturalWidth || src.width | 0;
  const h = src.naturalHeight || src.height | 0;
  if (!w || !h) return null;                  // pas encore décodée
  r = place(src, w, h);
  if (r) {
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch {
      r = null;                                // source tainted / illisible
    }
  }
  placed.set(src, r);                          // null mémoïsé : on ne retente pas
  return r;
}

// Ouvre une frame : dimensions LOGIQUES du viewport et densité de pixels.
export function glBegin(w, h, dpr) {
  if (!ready) return false;
  vw = w; vh = h;
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw; canvas.height = ph;
  }
  gl.viewport(0, 0, pw, ph);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  n = 0;
  return true;
}

// Empile un sprite. Mêmes arguments que `drawImage` à 9 paramètres, plus une
// teinte optionnelle (r, g, b, a dans [0,1] — a joue le rôle de globalAlpha).
// Renvoie false si la source n'est pas dans l'atlas : à l'appelant de la
// dessiner en 2D.
export function glQuad(src, sx, sy, sw, sh, dx, dy, dw, dh, r = 1, g = 1, b = 1, a = 1) {
  if (!ready) return false;
  const reg = ensure(src);
  if (!reg) return false;
  if (n + 6 > (buf.length / 8)) {
    const bigger = new Float32Array(buf.length * 2);
    bigger.set(buf);
    buf = bigger;
  }
  const u0 = (reg.x + sx) / ATLAS_SIZE, v0 = (reg.y + sy) / ATLAS_SIZE;
  const u1 = (reg.x + sx + sw) / ATLAS_SIZE, v1 = (reg.y + sy + sh) / ATLAS_SIZE;
  const x0 = dx, y0 = dy, x1 = dx + dw, y1 = dy + dh;
  let o = n * 8;
  const put = (x, y, u, v) => {
    buf[o] = x; buf[o + 1] = y; buf[o + 2] = u; buf[o + 3] = v;
    buf[o + 4] = r; buf[o + 5] = g; buf[o + 6] = b; buf[o + 7] = a;
    o += 8;
  };
  put(x0, y0, u0, v0); put(x1, y0, u1, v0); put(x0, y1, u0, v1);
  put(x1, y0, u1, v0); put(x1, y1, u1, v1); put(x0, y1, u0, v1);
  n += 6;
  return true;
}

// Envoie tout le lot en UN appel de dessin. Renvoie le nombre de sprites rendus.
export function glFlush() {
  if (!ready || n === 0) return 0;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, n * 8), gl.DYNAMIC_DRAW);
  const S = 8 * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, S, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, S, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 16);
  gl.uniform2f(gl.getUniformLocation(prog, 'uView'), vw, vh);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
  gl.drawArrays(gl.TRIANGLES, 0, n);
  const drawn = n / 6;
  n = 0;
  return drawn;
}

// Bloque jusqu'à ce que le GPU ait FINI (bancs seulement). Sans elle, on ne
// mesure que le temps d'ENVOI des commandes : les deux pipelines empilent du
// travail asynchrone et le chronomètre ment.
export function glFinish() { if (ready) gl.finish(); }

// Diagnostic : état de l'atlas et du lot courant.
export function glStats() {
  return {
    ready, failed, atlasFull,
    etageres: shelves.length,
    hauteurUtilisee: shelves.length ? shelves[shelves.length - 1].y + shelves[shelves.length - 1].h : 0,
    spritesEnAttente: n / 6,
    capaciteTampon: buf.length / 8 / 6,
  };
}
