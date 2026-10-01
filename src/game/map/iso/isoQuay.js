"use strict";
// ── LES QUAIS, CUITS UNE FOIS, EN TUILES ─────────────────────────────────────
//
// Demande de Raph (2026-10-01) : « reprends les quais au passage, ils ne sont pas
// beaux et très gourmands en ressources ».
//
// L'ANCIEN QUAI (quaysAndRiot.cityMapDrawQuays, retiré le 2026-10-01 après l'OK de
// Raph sur la planche avant/après) était de la géométrie VECTORIELLE cuite dans un
// canevas DE LA TAILLE DE L'ÉCRAN :
//   · recuit à chaque zoom (clé au millième), à chaque pan hors marge, à chaque
//     dixième de nuit (le point des lampes changeait de couleur) ;
//   · recopié EN ENTIER à chaque image — 1,6 Mpx de transparent pour un ruban qui en
//     couvre 10 % : en rendu logiciel (le Chrome de Raph), c'est la surface qui coûte ;
//   · tracé lissé (antialiasé) : bords mous, liserés translucides de 2 à 5 px, et des
//     « lampadaires » qui n'étaient qu'un point lumineux sans mât.
//
// LE NOUVEAU :
//   · cuit en TUILES de 128 px d'« espace d'art » (le zoom 1, caméra nulle), ancrées
//     au monde : un pan ne recuit rien, un zoom non plus (on pose la même tuile à
//     l'échelle, au plus proche voisin — un pixel d'art devient un bloc, comme le
//     reste de la carte). Une tuile ne se cuit que la première fois qu'on la voit ;
//   · seules les tuiles qui CONTIENNENT du quai sont recopiées ;
//   · dessiné AU PIXEL : remplissages aux bords seuillés (plus d'antialias), grain de
//     pierre de 2 px, trois assises au mur, joints, margelle, pied de mur mouillé,
//     bornes d'amarrage, garde-corps aux ères de fonte ; plus aucun trait translucide ;
//   · les réverbères sont de VRAIS mâts (le système de lampes d'isoStreet, qui reçoit
//     `quayLampList`) : même dessin par ère que les rues, mêmes halos, même reflet ;
//   · le liseré lumineux des ères de néon et d'énergie (6+) reste un trait EN DIRECT,
//     additif (cuit sur une tuile transparente, il ne s'ajouterait plus à l'eau).
//
// Mesuré en rendu logiciel (bande 4, nuit) : vue fixe et pan à égalité, zoom continu
// 40 → 47 images/s au zoom 2 ; passe « quais » 0,37 → 0,05-0,11 ms, pics 18 → 1,6 ms.
//
// ⚠ CE QUE LE PONT LIT ET QUI DOIT RESTER VRAI (session des ponts, 2026-10-01) : la
// hauteur du mur = quayWallTiles(band) × quayWallTune.heightK × T, et la largeur de la
// promenade = quayStyleFor(band).W. Les deux viennent de quaysAndRiot, inchangés.
//
// ⚠ Relief éteint (TERRAIN.amp = 0) : la projection est affine, donc un point du monde
// a une position FIXE dans l'espace d'art — c'est ce qui permet de cuire une fois.
import { CM, cmHash } from '../layout.js';
import { ISO_X, ISO_Y, depthOf, worldToScreen } from './projection.js';
import { quayStyleFor, quayWallTune, quayWallColors, ensureQuayGate } from '../quaysAndRiot.js';

// Molette : __quayArt({ bollards, grain }) ; __quayArt() rend l'état.
export const QUAY_ART = { bollards: true, grain: true };
if (typeof window !== 'undefined') {
  window.__quayArt = (o) => {
    if (o && typeof o === 'object') Object.assign(QUAY_ART, o);
    _key = '';                                      // force une recuisson
    return { ...QUAY_ART };
  };
}

const S = 128;                                       // côté d'une tuile, px d'art
const TAPER = 2;
const art = (wx, wy) => ({ x: (wx - wy) * ISO_X, y: (wx + wy) * ISO_Y });
function riverNormalAt(sm, i) {
  const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
  let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1;
  return { nx: -ty / tl, ny: tx / tl };
}
const hexRgb = (h) => {
  if (typeof h !== 'string') return [128, 128, 128];
  if (h[0] === '#') { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = h.match(/\d+(\.\d+)?/g);
  return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
};
const alphaOf = (h) => { const m = String(h).match(/rgba\([^)]*,\s*([\d.]+)\)/); return m ? +m[1] : 1; };
const lighten = (c, t) => c.map((v) => Math.round(v + (255 - v) * t));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function h01(x, y, s = 0) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + s * 982451653;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// ── LA GÉOMÉTRIE, UNE FOIS PAR VILLE ────────────────────────────────────────
// Les tronçons (runs) du masque effectif du quai (CM.quayGate.drawPlus/drawMinus),
// leurs points en espace d'art, la hauteur du mur par sample, et les boîtes des
// segments pour savoir quelles tuiles en contiennent.
let _key = '', _geo = null;
const _tiles = new Map();
function cacheKey(L, band) {
  const g = CM.quayGate;
  return (CM.layoutRecomputeAt || 0) + ':' + band + ':' + (g ? g.key : '-')
    + ':' + (CM.waterShore ? CM.waterShore.quay.join('|') : '-')
    + ':' + (quayWallTune.on ? 1 : 0) + quayWallTune.heightK + '_' + quayWallTune.light
    + ':' + (QUAY_ART.bollards ? 1 : 0) + (QUAY_ART.grain ? 1 : 0);
}
function buildGeo(L, band) {
  const g = CM.quayGate, sm = L.river.samples, n0 = sm.length, T = CM.TILE;
  const st = quayStyleFor(band), W = st.W, faceW = W * 0.3;
  const wh = st.wallTiles * quayWallTune.heightK * T;          // hauteur du mur, px d'art
  const runs = [], segs = [];
  for (const side of [1, -1]) {
    const gate = side > 0 ? g.drawPlus : g.drawMinus;
    let i = 0;
    while (i < n0) {
      if (!gate[i]) { i += 1; continue; }
      const a = i; while (i + 1 < n0 && gate[i + 1]) i += 1;
      const b = i; i += 1;
      if (b <= a) continue;
      // Effilement aux bouts qui bordent une interruption EN VILLE (port), pas aux
      // bouts naturels (même règle que l'ancien quai) : un bout naturel finit carré.
      const no = g.naturalOff;
      const tA = a > 0 && no ? !no[a - 1] : a > 0, tB = b < n0 - 1 && no ? !no[b + 1] : b < n0 - 1;
      const tt = (k) => {
        const dA = tA ? k - a : 1e9, dB = tB ? b - k : 1e9;
        const t = Math.max(0, Math.min(1, Math.min(dA, dB) / TAPER));
        return t * t * (3 - 2 * t);
      };
      const N = b - a + 1;
      const P = (k, base) => {
        const s = sm[k], n = riverNormalAt(sm, k), off = s.hw + base * tt(k);
        return art((s.x + side * n.nx * off) * T, (s.y + side * n.ny * off) * T);
      };
      const edge = [], land = [], face = [], mid = [];
      const wbel = new Uint8Array(N), tap = new Float32Array(N);
      for (let k = a; k <= b; k += 1) {
        edge.push(P(k, 0)); land.push(P(k, W)); face.push(P(k, faceW)); mid.push(P(k, W * 0.55));
        tap[k - a] = tt(k);
        wbel[k - a] = P(k, -0.3).y > P(k, 0.3).y ? 1 : 0;      // l'eau est DEVANT : on voit le mur
      }
      // Hauteur du mur par sample : effilée aux bouts de chaque sous-tronçon « eau devant ».
      const wallH = new Float32Array(N);
      if (quayWallTune.on) {
        let q = 0;
        while (q < N) {
          if (!wbel[q]) { q += 1; continue; }
          let r = q; while (r + 1 < N && wbel[r + 1]) r += 1;
          for (let k = q; k <= r; k += 1) {
            const dA = k - q, dB = r - k, t = Math.max(0, Math.min(1, Math.min(dA, dB) / TAPER));
            wallH[k] = wh * (r > q ? t * t * (3 - 2 * t) : 0) * tt(a + k);
          }
          q = r + 1;
        }
      }
      const run = { side, a, b, edge, land, face, mid, wallH, tap, ri: runs.length };
      runs.push(run);
      for (let k = 0; k < N - 1; k += 1) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of [edge[k], edge[k + 1], land[k], land[k + 1]]) {
          if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
        }
        y1 = Math.max(y1, edge[k].y + wallH[k] + 4, edge[k + 1].y + wallH[k + 1] + 4);
        segs.push({ run, k, x0: x0 - 4, y0: y0 - 6, x1: x1 + 4, y1 });
      }
    }
  }
  return { st, W, wh, runs, segs, band };
}

// ── LE DESSIN D'UNE TUILE ───────────────────────────────────────────────────
function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function bakeTile(tx, ty, m) {
  const geo = _geo, M = 1 << m, Q = 1 / M, SM = S * M, X0 = tx * SM, Y0 = ty * SM;
  const fine = m === 0;                              // détails au pixel : zoom ≥ 0,7 seulement
  // Segments qui touchent la tuile, regroupés par tronçon (plage de samples).
  const ranges = new Map();
  for (const sg of geo.segs) {
    if (sg.x1 < X0 || sg.x0 > X0 + SM || sg.y1 < Y0 || sg.y0 > Y0 + SM) continue;
    const r = ranges.get(sg.run) || { lo: 1e9, hi: -1 };
    r.lo = Math.min(r.lo, sg.k); r.hi = Math.max(r.hi, sg.k + 1);
    ranges.set(sg.run, r);
  }
  if (!ranges.size) return { empty: true };
  const cv = mkCanvas(S, S), c = cv.getContext('2d');
  c.setTransform(Q, 0, 0, Q, -X0 * Q, -Y0 * Q);
  const st = geo.st, LT = quayWallTune.light;
  const walk = lighten(hexRgb(st.walk), LT);
  const wc = quayWallColors(geo.band);
  const wTop = hexRgb(wc.top), wBot = hexRgb(wc.bot), cop = hexRgb(wc.coping);
  const wMid = mix(wTop, wBot, 0.5);
  const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
  // 1) Remplissages : la promenade, puis le mur en trois assises (clair → sombre).
  // ⚠ Les assises sont à hauteur ABSOLUE sous la margelle (fraction du mur PLEIN) :
  // là où le mur s'effile, celles du bas s'enfoncent, elles ne se tassent pas. En
  // fraction du mur effilé, elles convergeaient en rayures (bande 3, 2026-10-01).
  const WH = geo.wh;
  const cy = (h, f) => (f >= 1 ? h : Math.min(h, WH * f));
  for (const [run, r] of ranges) {
    const lo = Math.max(0, r.lo - 1), hi = Math.min(run.edge.length - 1, r.hi + 1);
    c.beginPath();
    for (let k = lo; k <= hi; k += 1) { const p = run.edge[k]; if (k === lo) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); }
    for (let k = hi; k >= lo; k -= 1) { const p = run.land[k]; c.lineTo(p.x, p.y); }
    c.closePath(); c.fillStyle = rgb(walk); c.fill();
    for (const [f0, f1, col] of [[0, 0.36, wTop], [0.36, 0.7, wMid], [0.7, 1, wBot]]) {
      let k = lo;
      while (k <= hi) {
        if (!(run.wallH[k] > 0)) { k += 1; continue; }
        let j = k; while (j + 1 <= hi && run.wallH[j + 1] > 0) j += 1;
        const k0 = Math.max(lo, k - 1), j1 = Math.min(hi, j + 1);
        c.beginPath();
        for (let q = k0; q <= j1; q += 1) { const p = run.edge[q]; const y = p.y + cy(run.wallH[q], f0); if (q === k0) c.moveTo(p.x, y); else c.lineTo(p.x, y); }
        for (let q = j1; q >= k0; q -= 1) { const p = run.edge[q]; c.lineTo(p.x, p.y + cy(run.wallH[q], f1) + (f1 === 1 ? 0.5 : 0)); }
        c.closePath(); c.fillStyle = rgb(col); c.fill();
        k = j + 1;
      }
    }
  }
  // 2) Bords NETS (seuil d'alpha) et grain de pierre de 2 px, ancré au monde.
  c.setTransform(1, 0, 0, 1, 0, 0);
  const im = c.getImageData(0, 0, S, S), d = im.data;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = (y * S + x) * 4;
      if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
      d[i + 3] = 255;
      if (QUAY_ART.grain && fine) {
        const g = 1 + (h01((X0 + x) >> 1, (Y0 + y) >> 1, 7) - 0.5) * 0.07;
        d[i] = Math.min(255, d[i] * g); d[i + 1] = Math.min(255, d[i + 1] * g); d[i + 2] = Math.min(255, d[i + 2] * g);
      }
    }
  }
  c.putImageData(im, 0, 0);
  // 3) Les détails, AU PIXEL (fillRect sur la grille de la tuile, jamais de trait lissé).
  // Tout est en coordonnées d'ART ; `u` = un pixel de la tuile (M px d'art aux
  // niveaux grossiers) : un liseré d'« un pixel » reste d'un pixel à l'écran.
  const u = M;
  const px = (x, y, col, a = 1) => {
    const ix = Math.round((x - X0) * Q), iy = Math.round((y - Y0) * Q);
    if (ix < 0 || iy < 0 || ix >= S || iy >= S) return;
    c.fillStyle = a >= 1 ? rgb(col) : `rgba(${col[0]},${col[1]},${col[2]},${a})`;
    c.fillRect(ix, iy, 1, 1);
  };
  const line = (p, q, col, a, dy0 = 0, dy1 = dy0) => {
    const n = Math.max(1, Math.round(Math.max(Math.abs(q.x - p.x), Math.abs(q.y + dy1 - p.y - dy0)) * Q));
    for (let s = 0; s <= n; s += 1) { const u = s / n; px(p.x + (q.x - p.x) * u, p.y + dy0 + (q.y + dy1 - p.y - dy0) * u, col, a); }
  };
  const joint = [0, 0, 0];
  const jA = alphaOf(st.wallJoint) || 0.3;
  const wq = (CM.waterShore && CM.waterShore.quay) || ['rgba(150,184,180,0.50)', 'rgba(202,224,214,0.62)'];
  const shoreA = hexRgb(wq[0]), shoreB = hexRgb(wq[1]);
  for (const [run, r] of ranges) {
    const lo = Math.max(0, r.lo - 1), hi = Math.min(run.edge.length - 1, r.hi + 1);
    for (let k = lo; k < hi; k += 1) {
      const e0 = run.edge[k], e1 = run.edge[k + 1], h0 = run.wallH[k], h1 = run.wallH[k + 1];
      // Joints de dalles : un trait en travers par sample, de la face au bord côté terre.
      if (st.joints && fine) line(run.face[k], run.land[k], joint, 0.16);
      // Côté terre : garde-corps (fonte, néon : une lisse levée de 3 px sur des
      // barreaux tous les 3 px — un poteau par sample se lisait comme un fil tendu),
      // sinon un liseré clair d'un pixel. Pas de garde-corps où la promenade s'effile.
      if (st.rail && run.tap[k] > 0.9 && run.tap[k + 1] > 0.9) {
        const RC = [22, 26, 32];
        line(run.land[k], run.land[k + 1], RC, 0.85, -3 * u, -3 * u);
        if (fine) {
          const p = run.land[k], q = run.land[k + 1];
          const n = Math.max(1, Math.round(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y))));
          for (let s = 0; s < n; s += 1) {
            const x = p.x + (q.x - p.x) * s / n, y = p.y + (q.y - p.y) * s / n;
            if (((Math.round(x) % 3) + 3) % 3 !== 0) continue;
            px(x, y - 1, RC, 0.7); px(x, y - 2, RC, 0.7);
          }
        }
      } else line(run.land[k], run.land[k + 1], lighten(walk, 0.25), 0.55);
      // Margelle : un pixel clair au bord, et sa lèvre sombre juste dessous si le mur se voit.
      line(e0, e1, cop, 1);
      if (h0 > 0 || h1 > 0) {
        line(e0, e1, mix(wTop, [0, 0, 0], 0.35), 1, u, u);
        if (fine) {
          // Assises (lignes d'un pixel) et joints verticaux décalés d'une assise à l'autre.
          for (const f of [0.36, 0.7]) if (Math.min(h0, h1) > WH * f + 1) line(e0, e1, joint, jA, WH * f, WH * f);
          for (const [f0, f1, sh] of [[0, 0.36, 0], [0.36, 0.7, 0.5], [0.7, 1, 0]]) {
            const jx = e0.x + (e1.x - e0.x) * sh, jy = e0.y + (e1.y - e0.y) * sh, hh = h0 + (h1 - h0) * sh;
            for (let y = Math.ceil(WH * f0) + 1; y < cy(hh, f1) - 0.5; y += 1) px(jx, jy + y, joint, jA);
          }
          // Pied mouillé : quelques pixels d'algue sur la dernière assise.
          const fx = e0.x + (e1.x - e0.x) * 0.5, fy = e0.y + (e1.y - e0.y) * 0.5 + (h0 + h1) * 0.5;
          if (h01(run.ri, run.a + k, 3) < 0.6) px(fx + Math.round((h01(k, run.ri, 5) - 0.5) * 3), fy - 1 - Math.floor(h01(k, run.ri, 9) * 2), [46, 66, 44], 0.75);
        }
        // Contact du mur et de l'eau : un pixel sombre, puis le liseré clair de l'eau peu
        // profonde (deux pixels nets, aux teintes du corps d'eau du moment).
        line(e0, e1, [0, 0, 0], 0.35, h0, h1);
        line(e0, e1, shoreB, alphaOf(wq[1]), h0 + u, h1 + u);
        line(e0, e1, shoreA, alphaOf(wq[0]), h0 + 2 * u, h1 + 2 * u);
      } else {
        // Rive dont l'eau est DERRIÈRE : pas de mur visible, le liseré borde la margelle.
        line(e0, e1, shoreB, alphaOf(wq[1]) * 0.8, -u, -u);
      }
      // Bornes d'amarrage : un plot de fonte tous les 4 samples, près du bord.
      if (fine && QUAY_ART.bollards && geo.band <= 5 && ((run.a + k) % 4) === 2) {
        const p = run.face[k], q = run.edge[k];
        const bx = Math.round(p.x + (q.x - p.x) * 0.35), by = Math.round(p.y + (q.y - p.y) * 0.35);
        for (let yy = -2; yy <= 0; yy += 1) { px(bx, by + yy, [40, 36, 32]); px(bx + 1, by + yy, [26, 24, 22]); }
        px(bx, by - 3, [96, 90, 80]);
      }
    }
  }
  return { cv, empty: false };
}

// ── LA POSE, À CHAQUE IMAGE ─────────────────────────────────────────────────
const BAKE_PER_FRAME = 24;
// Niveau de détail : une tuile de niveau m couvre S·2^m px d'art (toujours S×S pixels),
// pour qu'un pixel de tuile reste entre ~0,7 et 1,4 px d'écran : en dézoom total
// (0,25) on pose ~100 tuiles, pas 1 500 — et le cache ne s'affole pas.
const levelOf = (z) => (z >= 0.7 ? 0 : z >= 0.35 ? 1 : 2);
// ⚠ L'usure ne retire pas le quai (Raph, 2026-07-27 : une berge qui disparaît d'un
// coup se lit comme un bug) ; seul l'effondrement en cours l'efface.
export function paintQuays(ctx) {
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) return;
  const band = L.counts ? (L.counts.eraBand | 0) : 0;
  if (band <= 1 || CM.collapseAt) return;              // campement : pas de quai
  ensureQuayGate();
  if (!CM.quayGate) return;
  const key = cacheKey(L, band);
  if (key !== _key) { _key = key; _tiles.clear(); _geo = buildGeo(L, band); }
  const z = CM.cam.zoom, dpr = CM.dpr || 1;
  const m = levelOf(z), SM = S << m;
  const cam = art(CM.cam.x, CM.cam.y);
  const ax0 = cam.x - CM.cw / (2 * z), ay0 = cam.y - CM.ch / (2 * z);
  const ax1 = cam.x + CM.cw / (2 * z), ay1 = cam.y + CM.ch / (2 * z);
  const tx0 = Math.floor(ax0 / SM), tx1 = Math.floor(ax1 / SM), ty0 = Math.floor(ay0 / SM), ty1 = Math.floor(ay1 / SM);
  const snap = (v) => Math.round(v * dpr) / dpr;
  const sx = (ax) => snap((ax - cam.x) * z + CM.cw / 2), sy = (ay) => snap((ay - cam.y) * z + CM.ch / 2);
  const prevS = ctx.imageSmoothingEnabled;
  // Lissage seulement quand un pixel de tuile tombe sous le pixel d'écran (sinon des
  // lignes d'un pixel sautent une image sur deux pendant le zoom).
  ctx.imageSmoothingEnabled = z * (1 << m) < 0.999;
  let baked = 0;
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      const k = m + ':' + tx + ',' + ty;
      let t = _tiles.get(k);
      if (!t) {
        if (baked >= BAKE_PER_FRAME) continue;      // la suite à la prochaine image
        t = bakeTile(tx, ty, m); baked += 1;
        _tiles.set(k, t);
        if (_tiles.size > 900) { let n = 200; for (const kk of _tiles.keys()) { _tiles.delete(kk); if (--n <= 0) break; } }
      }
      if (t.empty) continue;
      const X = sx(tx * SM), Y = sy(ty * SM), X1 = sx((tx + 1) * SM), Y1 = sy((ty + 1) * SM);
      ctx.drawImage(t.cv, X, Y, X1 - X, Y1 - Y);
    }
  }
  ctx.imageSmoothingEnabled = prevS;
  paintNeonEdge(ctx);
}

// ── LE LISERÉ NÉON (ères 6+) ────────────────────────────────────────────────
// Le bord d'eau s'allume : un trait ADDITIF, avivé la nuit, en direct (cf. l'en-tête).
function paintNeonEdge(ctx) {
  const geo = _geo, glow = geo && geo.st.glow;
  if (!glow) return;
  const T = CM.TILE, z = CM.cam.zoom, night = CM.nightF || 0;
  const L = CM.layout, sm = L.river.samples;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(${glow},${(0.30 + 0.45 * night).toFixed(2)})`;
  ctx.lineWidth = Math.max(1, z * 0.7);
  for (const run of geo.runs) {
    ctx.beginPath();
    for (let i = run.a; i <= run.b; i += 1) {
      const s = sm[i], n = riverNormalAt(sm, i);
      const p = worldToScreen((s.x + run.side * n.nx * s.hw) * T, (s.y + run.side * n.ny * s.hw) * T);
      if (i === run.a) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ── LES RÉVERBÈRES DES QUAIS ────────────────────────────────────────────────
// Au format du système de lampes ({ wx, wy, gx, gy, d } — cf. isoStreet.isoLamps) :
// ils héritent du dessin par ère, des halos, du vacillement et du reflet des sprites.
// Un mât tous les 4 samples, sur la promenade côté terre, là où la ville est proche
// (on n'éclaire pas le vide — même règle que les rues), jamais sur un pont.
// `wbel` : l'eau est devant (rive d'en face), le reflet de sa lumière se verra.
let _lampKey = '', _lamps = [];
export function quayLampList(L, band) {
  if (band <= 1 || !L || !L.river || !L.river.present || !L.river.samples) return [];
  ensureQuayGate();
  const g = CM.quayGate;
  if (!g) return [];
  const key = (CM.layoutRecomputeAt || 0) + ':' + band + ':' + g.key;
  if (key === _lampKey) return _lamps;
  _lampKey = key; _lamps = [];
  const sm = L.river.samples, n0 = sm.length, T = CM.TILE, W = quayStyleFor(band).W;
  const bridgeNear = (gx, gy) => {
    if (!L.roadMap) return false;
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      const rc = L.roadMap.get((gx + dx) + ',' + (gy + dy));
      if (rc && rc.roadSurface === 'bridge') return true;
    }
    return false;
  };
  for (const side of [1, -1]) {
    const gate = side > 0 ? g.drawPlus : g.drawMinus;
    for (let i = 3; i < n0 - 3; i += 1) {
      if (((i + (side > 0 ? 0 : 2)) % 4) !== 0) continue;
      // Pas sur un bout effilé (TAPER samples) : la promenade y rétrécit, le mât
      // tombait sur la grève (bande 5).
      let full = true;
      for (let d = -TAPER; d <= TAPER; d += 1) if (!gate[i + d]) { full = false; break; }
      if (!full) continue;
      const s = sm[i], n = riverNormalAt(sm, i), off = s.hw + W * 0.8;
      const wx = (s.x + side * n.nx * off) * T, wy = (s.y + side * n.ny * off) * T;
      const gx = Math.floor(wx / T), gy = Math.floor(wy / T);
      // En VILLE (pas « un bâtiment voisin » : la promenade a la rue, pas des
      // façades, à côté d'elle — il n'en restait que 3 sur une ville de bande 3).
      if (!(L.urbanSet && L.urbanSet.has(gx + ',' + gy)) || bridgeNear(gx, gy)) continue;
      const pIn = art((s.x + side * n.nx * (s.hw - 0.3)) * T, (s.y + side * n.ny * (s.hw - 0.3)) * T);
      const pOut = art((s.x + side * n.nx * (s.hw + 0.3)) * T, (s.y + side * n.ny * (s.hw + 0.3)) * T);
      const ex = (s.x + side * n.nx * s.hw) * T, ey = (s.y + side * n.ny * s.hw) * T;
      _lamps.push({ wx, wy, gx, gy, d: depthOf(wx, wy), quay: true, wbel: pIn.y > pOut.y, ex, ey, s: cmHash('ql:' + i + ':' + side) >>> 0 });
    }
  }
  return _lamps;
}
