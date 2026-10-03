"use strict";

// Rendu de la SÈVE de l'Arbre des Ruines, sur deux canvas à la résolution
// SOURCE de l'illustration (688×384) que le CSS agrandit en pixels nets :
//   • le fond = l'illustration aux lumières ÉTEINTES (calculé une fois) ;
//   • la sève = pour chaque veine allumée, la matière rallumée autour du chemin
//     (runes, ambre et feuilles, braises, lave) + un FAISCEAU continu (cœur
//     clair, corps, lueur) parcouru par une pulsation qui monte du cœur de braise.
// Aucun filtre CSS (blur / drop-shadow) : sur ce calque transformé au pan/zoom,
// ils coûtaient cher (cf. mémoire du chantier) — tout est peint au pixel.

import { SAP_ART, lightClass, branchOfLight, dimLight, walkClass, REVEAL_R } from "./sapMaterials.js";

const NEIGHBORS_1 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const NEIGHBORS_2 = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]];

// Prépare la scène à partir de l'image chargée et des veines (sapPaths.js).
// `branchOf(id)` → branche du nœud. Renvoie null si l'image ne peut pas être
// lue (canvas « contaminé ») : l'arbre s'affiche alors sans sève.
export function prepareSapScene(img, paths, branchOf) {
  const { w, h } = SAP_ART;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  let lit;
  try {
    lit = cx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }

  const cls = new Array(w * h);
  const walk = new Uint8Array(w * h);
  const base = new Uint8ClampedArray(lit);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x, i = k * 4;
      const c = lightClass(lit[i], lit[i + 1], lit[i + 2], x, y);
      cls[k] = c;
      walk[k] = walkClass(lit[i], lit[i + 1], lit[i + 2], x, y, c);
      if (c) {
        const d = dimLight(c, lit[i], lit[i + 1], lit[i + 2]);
        base[i] = d[0]; base[i + 1] = d[1]; base[i + 2] = d[2];
      }
    }
  }

  const edges = {};
  for (const [id, [parent, flat]] of Object.entries(paths)) {
    const branch = branchOf(id);
    const n = flat.length / 2;
    const px = new Int32Array(n);
    const onPath = new Set();
    for (let p = 0; p < n; p++) { px[p] = flat[2 * p + 1] * w + flat[2 * p]; onPath.add(px[p]); }
    // corps du faisceau (voisins immédiats) et lueur (anneau suivant), jamais dans le ciel
    const body = [], bodyAt = [], ring = [], ringAt = [], reveal = [];
    const seen = new Set(onPath), seenR = new Set();
    const R = REVEAL_R[branch] || 3;
    for (let p = 0; p < n; p++) {
      const x = flat[2 * p], y = flat[2 * p + 1];
      for (const [dx, dy] of NEIGHBORS_1) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx; if (seen.has(k) || walk[k] === 0) continue;
        seen.add(k); body.push(k); bodyAt.push(p);
      }
      for (const [dx, dy] of NEIGHBORS_2) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx; if (seen.has(k) || walk[k] === 0) continue;
        seen.add(k); ring.push(k); ringAt.push(p);
      }
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R + 1) continue;
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (seenR.has(k) || !cls[k] || branchOfLight(cls[k]) !== branch) continue;
        seenR.add(k); reveal.push(k);
      }
    }
    edges[id] = {
      parent, branch, px,
      body: Int32Array.from(body), bodyAt: Int32Array.from(bodyAt),
      ring: Int32Array.from(ring), ringAt: Int32Array.from(ringAt),
      reveal: Int32Array.from(reveal),
    };
  }
  return { w, h, base: new ImageData(base, w, h), lit, edges };
}

// Prolongement des bords de l'illustration (la fenêtre est plus large qu'elle) :
// une colonne par côté (médiane des 12 colonnes du bord, ligne par ligne, pour
// ne pas étirer une étoile en trait) et les tons du haut et du bas.
export function edgeStrips(imageData) {
  const { width: w, height: h, data } = imageData;
  const lum = (i) => data[i] + data[i + 1] + data[i + 2];
  const median = (idx) => idx.sort((a, b) => lum(a) - lum(b))[idx.length >> 1];
  const strip = (fromRight) => {
    const cv = document.createElement("canvas");
    cv.width = 1;
    cv.height = h;
    const cx = cv.getContext("2d");
    const out = cx.createImageData(1, h);
    for (let y = 0; y < h; y++) {
      const idx = [];
      for (let x = 0; x < 12; x++) idx.push((y * w + (fromRight ? w - 1 - x : x)) * 4);
      const i = median(idx);
      out.data.set([data[i], data[i + 1], data[i + 2], 255], y * 4);
    }
    cx.putImageData(out, 0, 0);
    return cv.toDataURL();
  };
  const rowTone = (y) => {
    const idx = [];
    for (let x = 0; x < w; x += 3) idx.push((y * w + x) * 4);
    const i = median(idx);
    return `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`;
  };
  return { left: strip(false), right: strip(true), top: rowTone(0), bottom: rowTone(h - 1) };
}

// Peint la sève dans `out` (ImageData w×h, effacée ici).
//   st.lit     : Set des veines allumées (un nœud acquis allume toute sa lignée)
//   st.pending : Set des veines qui mènent à un nœud À PRENDRE (fil continu, atténué)
//   st.anim    : Map id → { t0, dur } — coulée en cours après un achat
//   st.focus   : branche mise en avant (les autres s'éteignent presque) ou null
//   st.colors  : { branche: { core, mid, glow } }
//   st.still   : true = pas d'animation (prefers-reduced-motion)
export function paintSap(out, scene, st, now) {
  const d = out.data, W = scene.w, lit = scene.lit;
  d.fill(0);
  const put = (k, r, g, b, a) => {
    if (a <= 0) return;
    const i = k * 4, ea = d[i + 3] / 255, na = a + ea * (1 - a);
    d[i] = (r * a + d[i] * ea * (1 - a)) / na;
    d[i + 1] = (g * a + d[i + 1] * ea * (1 - a)) / na;
    d[i + 2] = (b * a + d[i + 2] * ea * (1 - a)) / na;
    d[i + 3] = na * 255;
  };
  const t = st.still ? 0 : now;
  // pulsation qui MONTE le long de la veine (du parent vers le nœud)
  const wave = (p) => { const s = 0.5 + 0.5 * Math.sin(t / 260 - p * 0.3); return s * s; };

  for (const id in scene.edges) {
    const e = scene.edges[id], C = st.colors[e.branch];
    const dim = st.focus && st.focus !== e.branch ? 0.16 : 1;
    let on = st.lit.has(id), prog = 1;
    const an = st.anim.get(id);
    if (an) {
      prog = (now - an.t0) / an.dur;
      if (prog >= 1) { st.anim.delete(id); prog = 1; } else if (prog <= 0) on = false;
    }
    const n = e.px.length;

    if (!on) {
      // vers un nœud à prendre : un fil continu, faible, qui respire lentement
      if (st.pending.has(id)) {
        const a = (0.26 + 0.14 * Math.sin(t / 520)) * dim;
        for (let p = 0; p < n; p++) put(e.px[p], C.mid[0], C.mid[1], C.mid[2], a);
      }
      continue;
    }

    const m = prog >= 1 ? n : Math.max(1, Math.floor(n * prog));
    if (prog >= 1) {
      // la matière se rallume autour de la veine (couleurs d'origine de l'image)
      const rv = e.reveal;
      for (let q = 0; q < rv.length; q++) { const i = rv[q] * 4; put(rv[q], lit[i], lit[i + 1], lit[i + 2], dim); }
    }
    // lueur, corps, cœur : un faisceau continu jusqu'à la tête de la coulée
    for (let q = 0; q < e.ring.length; q++) {
      if (e.ringAt[q] >= m) continue;
      put(e.ring[q], C.glow[0], C.glow[1], C.glow[2], 0.22 * dim);
    }
    for (let q = 0; q < e.body.length; q++) {
      const p = e.bodyAt[q]; if (p >= m) continue;
      put(e.body[q], C.mid[0], C.mid[1], C.mid[2], (0.42 + 0.22 * wave(p)) * dim);
    }
    for (let p = 0; p < m; p++) {
      const s = wave(p);
      put(e.px[p],
        C.mid[0] + (C.core[0] - C.mid[0]) * s,
        C.mid[1] + (C.core[1] - C.mid[1]) * s,
        C.mid[2] + (C.core[2] - C.mid[2]) * s,
        (0.8 + 0.2 * s) * dim);
    }
    if (prog < 1) {
      // tête de la coulée : un point blanc-chaud
      const k = e.px[m - 1];
      put(k, C.core[0], C.core[1], C.core[2], 1);
      for (const off of [1, -1, W, -W]) put(k + off, C.core[0], C.core[1], C.core[2], 0.7);
    }
  }
}
