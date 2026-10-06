"use strict";

// LA TORTUE DE ZÉNON (docs/PLAN-FAITS-DIVERS.md §3.2).
// Elle longe le fleuve d'un bout à l'autre de la ville, en toute la partie. À chaque
// chapitre elle a parcouru la MOITIÉ de ce qui lui restait (0, ½, ¾, ⅞…) : le paradoxe
// — et au Démiurge, elle arrive. Une lignée d'Achille la poursuit à partir du Marbre,
// toujours un peu derrière : à pied, en vélocipède, en réacteur dorsal, presque à la
// vitesse de la lumière. Une fois rencontrée, elle reste sur la carte (une RÉSIDENTE,
// cf. fdDirector) : on revient voir où elle en est.
import { CM } from '../layout.js';
import { worldToScreen } from '../iso/projection.js';
import { vieK } from '../iso/isoVie.js';
import { fdBlit, fdPixel, fdNoteThing } from './fdDraw.js';
import { fdHash, fdFootprints, spotOpen } from './fdSpots.js';
import { T, dirOf, figure, thing, pushFig, pushProp, openStory } from './fdKit.js';

// Où elle en est, chapitre par chapitre : la moitié de ce qui reste.
const ZENON = [0, 0.5, 0.75, 0.875, 0.9375, 0.96875, 1];

// LE CHEMIN : la berge du fleuve, du côté le plus habité, sur le tronçon qui longe la
// ville (deux cases au plus du sol urbain). Sans fleuve : une ligne ouest → est au
// sud du centre. Points en cellules, dans le sens de la marche.
let _path = null;
export function tortoisePath(L) {
  const at = CM.layoutRecomputeAt || 0;
  if (_path && _path.at === at && _path.L === L) return _path.pts;
  const foot = fdFootprints(L);
  const urban = L.urbanSet;
  const near = (x, y) => {
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (urban && urban.has((Math.floor(x) + dx) + ',' + (Math.floor(y) + dy))) return true;
    return false;
  };
  let pts = [];
  const rv = L.river;
  if (rv && rv.present && rv.samples && rv.samples.length > 8) {
    const sm = rv.samples;
    let best = null;
    for (const side of [-1, 1]) {
      const list = [];
      for (let i = 1; i < sm.length - 1; i += 1) {
        const q = sm[i], a = sm[i - 1], b = sm[i + 1];
        let tx = b.x - a.x, ty = b.y - a.y;
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const off = (q.hw || 2) + 0.55;
        const x = q.x - ty * side * off, y = q.y + tx * side * off;
        const k = Math.floor(x) + ',' + Math.floor(y);
        const dry = !(rv.isWater && rv.isWater(Math.floor(x), Math.floor(y))) && !foot.has(k);
        list.push({ x, y, ok: dry && near(x, y) });
      }
      // Du premier au dernier point « en ville » de ce côté, en sautant ceux qui
      // tombent dans l'eau ou sur un bâtiment (un plus long chemin : le paradoxe a
      // besoin de place pour se diviser).
      const ok = list.filter((q2) => q2.ok);
      if (ok.length && (!best || ok.length > best.length)) best = ok;
    }
    if (best && best.length >= 6) pts = best;
  }
  if (!pts.length) {
    const N = L.gridN | 0, cy = (L.cy || N / 2) + 3;
    for (let x = 2; x < N - 2; x += 0.5) pts.push({ x, y: cy, ok: true });
  }
  _path = { at, L, pts };
  return pts;
}
// Le point du chemin à la fraction f, ou le plus proche qui se VOIT (rien de bâti
// devant) parmi ses voisins.
function pointAt(L, pts, f) {
  const n = pts.length;
  const i = Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
  for (let d = 0; d < 6; d += 1) {
    for (const j of [i - d, i + d]) {
      if (j < 0 || j >= n) continue;
      const p = pts[j];
      if (spotOpen(L, p.x, p.y) >= 0) return { ...p, i: j };
    }
  }
  return { ...pts[i], i };
}

function buildTortue(app) {
  const st = app.ch.stage | 0;
  const L = CM.layout;
  const pts = tortoisePath(L);
  const { x, y } = app.spot;
  const ti = app.spot.i | 0;
  // Le sens de la marche (vers la fin du chemin), pour tourner la tête et placer Achille.
  const nx = pts[Math.min(pts.length - 1, ti + 1)] || app.spot, px = pts[Math.max(0, ti - 1)] || app.spot;
  let ux = nx.x - px.x, uy = nx.y - px.y;
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const flip = worldToScreen(ux, uy).x < worldToScreen(0, 0).x;     // la tête à gauche
  const tortoiseCast = app.ch.cast.findIndex((c) => c.ct < 0);
  const tortoise = thing(app, 0, x, y, tortoiseCast);
  const figs = [tortoise];
  // Achille (et sa descendante à l'arrivée), un peu en arrière sur le chemin.
  const people = app.ch.cast.map((c, i) => ({ c, i })).filter((e) => e.c.ct >= 0);
  const back = st >= 6 ? 0.55 : 0.75 + (st >= 4 ? 0.25 : 0);
  const achilles = people.map((e, j) => {
    const ax = x - ux * (back + j * 0.3) - uy * (j ? 0.35 : 0), ay = y - uy * (back + j * 0.3) + ux * (j ? 0.35 : 0);
    const f = figure(app, 1 + j, ax, ay, { ct: e.c.ct, dir: dirOf(x - ax, y - ay), cast: e.i, variant: 2 + j * 5 });
    if (st >= 2 && st <= 5 && j === 0) { f.walk = true; }
    if (st === 4 && j === 0) f.lift = 3;
    return f;
  });
  figs.push(...achilles);
  const phase = (fdHash(app.seed + ':ph') % 1000) / 1000;

  app.figs = figs;
  app.actors = (now, out, alpha) => {
    const band = app.band;
    // La ligne d'arrivée, au Démiurge.
    if (st === 6) pushProp(out, 'arrivee', x + ux * 0.35, y + uy * 0.35, alpha);
    // La tortue : deux images de pattes, une toutes les 0,7 s — elle avance, si si.
    const wx = x * T(), wy = y * T();
    out.push({
      wx, wy, d: wx + wy + 0.002,
      draw(ctx, nowD) {
        const box = fdBlit(ctx, 'tortue', Math.floor(nowD / 700 + phase * 3) % 2, wx, wy, alpha, flip);
        if (box) fdNoteThing(tortoise, box);
      },
    });
    for (const [j, f] of achilles.entries()) {
      // Il court sur place, à jamais derrière elle (l'odomètre fait tourner les jambes).
      if (f.walk) f.dist = now / 1000 * 18;
      if (st === 3 && j === 0) pushProp(out, 'velo', f.wx / T() + 0.03, f.wy / T() + 0.03, alpha, { unit: true, eps: 0.01, flip: !flip });
      pushFig(out, f, band, alpha, (ctx, r, nowD) => {
        const k = vieK();
        if (st === 4 && j === 0) {
          // Le réacteur : deux flammes qui battent sous ses pieds.
          for (let i = 0; i < 3; i += 1) {
            const on = ((Math.floor(nowD / 90) + i) % 3) !== 0;
            if (on) fdPixel(ctx, r.x + (i - 1) * k, r.y + (1 + (i % 2)) * k, i === 1 ? [255, 214, 90] : [247, 120, 40], alpha);
          }
        }
        if (st === 5 && j === 0) {
          // Presque à la vitesse de la lumière : des traînées derrière lui.
          const s = worldToScreen(-ux, -uy), o = worldToScreen(0, 0);
          const dx = s.x - o.x, dy = s.y - o.y, dl = Math.hypot(dx, dy) || 1;
          for (let i = 1; i <= 4; i += 1) {
            for (const h of [0.35, 0.6, 0.8]) fdPixel(ctx, r.x + (dx / dl) * i * 2.2 * k, r.top + r.h * h + (dy / dl) * i * 2.2 * k, [200, 230, 255], alpha * (1 - i / 5));
          }
        }
      });
    }
  };
  app.open = (t, again) => openStory(app, t, again);
  return app;
}

function spots(L, c) {
  const pts = tortoisePath(L);
  if (!pts.length) return [];
  const st = c.ch.stage | 0;
  const p = pointAt(L, pts, ZENON[Math.max(0, Math.min(ZENON.length - 1, st))]);
  return [{ x: p.x, y: p.y, i: p.i, key: 'zenon:' + st + ':' + p.i, path: true }];
}

export const TORTUE_SCENE = { build: buildTortue, spots, resident: true };
