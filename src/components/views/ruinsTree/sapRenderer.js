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

// ── Le cœur de braise ─────────────────────────────────────────────────────────
// Centre du foyer dans l'illustration et sa rampe : les 6 tons relevés au pixel
// (du rouge sombre au jaune), plus un rouge presque éteint et un blanc-chaud
// pour les creux et les pics de flamme.
const COAL_C = [342, 196];
const COAL_RAMP = [[96, 10, 4], [162, 14, 1], [205, 61, 21], [255, 76, 7], [255, 106, 10], [255, 152, 12], [255, 188, 46], [255, 226, 156]];
const SPARK = [[255, 226, 156], [255, 152, 12], [205, 61, 21]];
const hash2 = (x, y) => { let q = (x * 374761393 + y * 668265263) | 0; q = Math.imul(q ^ (q >>> 13), 1274126177); return ((q ^ (q >>> 16)) >>> 0) / 4294967295; };
function vnoise(x, y) {
  const gx = Math.floor(x), gy = Math.floor(y), fx = x - gx, fy = y - gy;
  const a = hash2(gx, gy), b = hash2(gx + 1, gy), c = hash2(gx, gy + 1), d = hash2(gx + 1, gy + 1);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

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

  // Le foyer : ses braises (pixels chauds) et le disque qu'aucune veine ne traverse.
  const coalMask = new Uint8Array(w * h);
  const coalIdx = [], coalLvl = [];
  for (let y = COAL_C[1] - 28; y <= COAL_C[1] + 28; y++) {
    for (let x = COAL_C[0] - 28; x <= COAL_C[0] + 28; x++) {
      const k = y * w + x, i = k * 4, r = lit[i], g = lit[i + 1], b = lit[i + 2];
      const d = Math.hypot(x - COAL_C[0], y - COAL_C[1]);
      const warm = r >= 120 && r > b + 60;
      if (d <= 17 || (warm && d <= 26)) coalMask[k] = 1;
      if (!warm || d > 26) continue;
      let best = 0, bd = Infinity;
      COAL_RAMP.forEach((c, j) => { const e = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (e < bd) { bd = e; best = j; } });
      coalIdx.push(k);
      coalLvl.push(best);
    }
  }
  const coal = { idx: Int32Array.from(coalIdx), lvl: Uint8Array.from(coalLvl), mask: coalMask, sparks: [], acc: 0, last: 0 };

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
        const k = ny * w + nx; if (seen.has(k) || walk[k] === 0 || coalMask[k]) continue;
        seen.add(k); body.push(k); bodyAt.push(p);
      }
      for (const [dx, dy] of NEIGHBORS_2) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx; if (seen.has(k) || walk[k] === 0 || coalMask[k]) continue;
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
      hide: Uint8Array.from(px, (k) => coalMask[k]),
      body: Int32Array.from(body), bodyAt: Int32Array.from(bodyAt),
      ring: Int32Array.from(ring), ringAt: Int32Array.from(ringAt),
      reveal: Int32Array.from(reveal),
    };
  }
  return { w, h, base: new ImageData(base, w, h), lit, edges, coal };
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
//   st.marks   : [{ x, y, branch, kind }] — lueur sous un nœud (« lit » = acquis,
//                couleur de sa matière ; « avail » = à prendre, or)
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
  paintCoal(put, scene, st, t);
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
        for (let p = 0; p < n; p++) if (!e.hide[p]) put(e.px[p], C.mid[0], C.mid[1], C.mid[2], a);
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
      if (e.hide[p]) continue;
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

  paintSparks(put, scene, st, now);

  // Lueurs sous les nœuds, en trois anneaux francs (pas de dégradé lissé :
  // c'est l'arbre qui s'éclaire, au grain de l'illustration).
  const H = scene.h;
  for (const mk of st.marks || []) {
    const col = mk.kind === "avail" ? GOLD : st.colors[mk.branch].mid;
    const dim = st.focus && st.focus !== mk.branch ? 0.16 : 1;
    const R = mk.kind === "avail" ? 6 : 7;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = mk.x + dx, y = mk.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > R) continue;
        const a = dist <= R * 0.45 ? 0.34 : dist <= R * 0.75 ? 0.2 : 0.09;
        put(y * W + x, col[0], col[1], col[2], a * dim);
      }
    }
  }
}

const GOLD = [228, 199, 126];

// Le cœur BRÛLE : chaque braise monte et descend dans la rampe du foyer selon un
// bruit qui remonte lentement (les flammes montent). Ni battement ni halo : le
// double battement (qui avivait le foyer et allumait un halo dans le bois) a
// été retiré à la demande de Raph — seul le scintillement reste.
function paintCoal(put, scene, st, t) {
  const coal = scene.coal;
  if (!coal) return;
  const W = scene.w;
  const top = COAL_RAMP.length - 1;
  for (let q = 0; q < coal.idx.length; q++) {
    const k = coal.idx[q], x = k % W, y = (k / W) | 0;
    const n = st.still ? 0.5 : 0.65 * vnoise(x / 3, y / 3 + t / 180) + 0.35 * vnoise(x / 1.6 + 40, y / 1.6 + t / 100);
    const lvl = Math.max(0, Math.min(top, coal.lvl[q] + Math.round((n - 0.5) * 3.2)));
    const c = COAL_RAMP[lvl];
    put(k, c[0], c[1], c[2], 1);
  }
}

// Des étincelles s'échappent du foyer et montent en s'éteignant.
function paintSparks(put, scene, st, now) {
  const coal = scene.coal;
  if (!coal || st.still) return;
  const W = scene.w, H = scene.h;
  const dt = coal.last ? Math.min(0.12, (now - coal.last) / 1000) : 0;
  coal.last = now;
  coal.acc += dt * 4;
  while (coal.acc >= 1) {
    coal.acc -= 1;
    coal.sparks.push({ x: COAL_C[0] + (Math.random() - 0.5) * 18, y: COAL_C[1] - 8 - Math.random() * 6, vx: (Math.random() - 0.5) * 4, vy: -(6 + Math.random() * 7), life: 0, max: 1.1 + Math.random() * 1 });
  }
  coal.sparks = coal.sparks.filter((sp) => (sp.life += dt) < sp.max);
  for (const sp of coal.sparks) {
    sp.x += sp.vx * dt + Math.sin(sp.life * 5) * 0.1;
    sp.y += sp.vy * dt;
    const x = Math.round(sp.x), y = Math.round(sp.y);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const f = sp.life / sp.max;
    const c = SPARK[f < 0.3 ? 0 : f < 0.65 ? 1 : 2];
    put(y * W + x, c[0], c[1], c[2], 1 - f * f);
  }
}
