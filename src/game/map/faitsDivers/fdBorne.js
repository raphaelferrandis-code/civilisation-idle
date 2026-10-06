"use strict";

// LA QUERELLE DE LA BORNE (docs/PLAN-FAITS-DIVERS.md §3.6).
// Les Pinçon contre les Gratteloup, de la Pierre au Démiurge : une borne plantée entre
// deux champs, un duel à l'épée (ils sont très mauvais), onze ans de procès, des
// pistolets tous les mardis (ils ratent), un procès télévisé, des robots géants — et
// la vérité : une météorite sans valeur, et ils sont cousins.
import { worldToScreen } from '../iso/projection.js';
import { vieK } from '../iso/isoVie.js';
import { fdPixel } from './fdDraw.js';
import { fdHash, doorstepForType, lisiereSpots, plazaEdgeSpots } from './fdSpots.js';
import { dirOf, figure, pushFig, pushProp, openStory } from './fdKit.js';

const FACE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STEEL = [210, 214, 222];

function buildBorne(app) {
  const st = app.ch.stage | 0;
  const s = app.spot;
  const [fx, fy] = FACE[s.face != null ? s.face : 2];
  const sx = -fy, sy = fx;
  const x = s.x, y = s.y;
  const cast = app.ch.cast;
  // Qui est qui : on cherche les deux familles dans la distribution du chapitre.
  const idxOf = (re) => cast.findIndex((c) => re.test(c.who.fr));
  const iP = Math.max(0, idxOf(/Pinçon/)), iG = idxOf(/Gratteloup/);
  const gap = st === 3 ? 0.75 : st === 5 ? 0.9 : 0.4;    // les pistolets : à distance
  const P = figure(app, 0, x - sx * gap, y - sy * gap, { ct: cast[iP].ct, cast: iP, variant: 1, dir: dirOf(sx, sy) });
  const G = figure(app, 1, x + sx * gap, y + sy * gap, { ct: iG >= 0 ? cast[iG].ct : 0, cast: iG >= 0 ? iG : 1, variant: 8, dir: dirOf(-sx, -sy) });
  const figs = [P, G];
  // Le troisième rôle : la passante (duel), le juge (procès), la présentatrice
  // (télévision), la savante (Démiurge) — en retrait, ou entre eux.
  const third = cast.findIndex((c, i) => i !== iP && i !== iG);
  let X = null;
  if (third >= 0) {
    const judge = st === 2 || st === 4;
    const tx = judge ? x - fx * 0.55 : st === 6 ? x + fx * 0.25 : x - fx * 0.6 + sx * 0.9;
    const ty = judge ? y - fy * 0.55 : st === 6 ? y + fy * 0.25 : y - fy * 0.6 + sy * 0.9;
    X = figure(app, 2, tx, ty, { ct: cast[third].ct, cast: third, sit: st === 6, dir: dirOf(x - tx, y - ty), variant: 6 });
    figs.push(X);
  }
  const phase = (fdHash(app.seed + ':ph') % 1000) / 1000;

  app.figs = figs;
  app.actors = (now, out, alpha) => {
    const band = app.band;
    const k = vieK();
    // La borne : présente à la Pierre et au Démiurge (là où tout se joue vraiment).
    if (st === 0 || st === 1 || st === 6) pushProp(out, 'borne', x + fx * 0.08, y + fy * 0.08, alpha);
    if (st === 4) pushProp(out, 'camera', x - fx * 0.5 + sx * 0.5, y - fy * 0.5 + sy * 0.5, alpha);
    if (st === 5) {
      // Les robots géants, chacun derrière son maître.
      pushProp(out, 'robot', x - sx * 1.5 - fx * 0.3, y - sy * 1.5 - fy * 0.3, alpha);
      pushProp(out, 'robot', x + sx * 1.5 - fx * 0.3, y + sy * 1.5 - fy * 0.3, alpha, { flip: true });
    }
    // À la Pierre, ils se tournent le dos de dépit, puis se refont face (toutes les 2 s).
    const huff = st === 0 && Math.floor(now / 2000 + phase * 3) % 3 === 2;
    P.dir = huff ? dirOf(-sx, -sy) : dirOf(sx, sy);
    G.dir = huff ? dirOf(sx, sy) : dirOf(-sx, -sy);
    const weapon = (who, sign) => (ctx, r, nowD) => {
      if (st === 1) {
        // L'épée : trois pixels d'acier, qui se fendent l'un vers l'autre en alternance.
        const lunge = ((Math.floor(nowD / 450 + phase * 4) + (sign > 0 ? 0 : 1)) % 2) ? 1 : 0;
        const ps = worldToScreen(sx * sign, sy * sign), po = worldToScreen(0, 0);
        const dx = Math.sign(ps.x - po.x) || sign;
        for (let i = 1; i <= 3 + lunge; i += 1) fdPixel(ctx, r.x + dx * (2 + i) * k, r.top + r.h * 0.5 - i * 0.4 * k, STEEL, alpha);
      }
      if (st === 3) {
        // Le pistolet : une bouffée de fumée, tous les… mardis (toutes les 6 s), ratée.
        const cyc = (nowD / 1000 + phase * 6 + (sign > 0 ? 0 : 0.15)) % 6;
        if (cyc < 0.9) {
          const ps = worldToScreen(sx * sign, sy * sign), po = worldToScreen(0, 0);
          const dx = Math.sign(ps.x - po.x) || sign;
          for (let i = 0; i < 3; i += 1) fdPixel(ctx, r.x + dx * (3 + i + cyc * 3) * k, r.top + r.h * 0.45 - (i % 2) * k - cyc * 2 * k, [236, 236, 230], alpha * (1 - cyc / 0.9));
        }
      }
    };
    pushFig(out, P, band, alpha, weapon(P, 1));
    pushFig(out, G, band, alpha, weapon(G, -1));
    if (X) pushFig(out, X, band, alpha);
  };
  app.open = (t, again) => openStory(app, t, again);
  return app;
}

// Au bord des champs (le seuil d'un champ irrigué), ou à la lisière ; le procès et la
// télévision au bord d'une place.
function spots(L, c, seed, band) {
  const st = c.ch.stage | 0;
  const place = c.ch.place || c.story.place;
  if (place === 'place') {
    const p = plazaEdgeSpots(L, band);
    if (p.length) return p.slice(0, 30);
  }
  const d = doorstepForType(L, 'irrigated_fields', seed);
  if (d && d.open >= 0 && st !== 5) return [{ ...d, key: 'borne:' + d.key }];
  return lisiereSpots(L).slice(0, 30).map((sp) => ({ ...sp, face: 2 }));
}

export const BORNE_SCENE = { build: buildBorne, spots };
