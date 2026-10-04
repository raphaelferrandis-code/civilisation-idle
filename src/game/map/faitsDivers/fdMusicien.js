"use strict";

// LA MÉLODIE DE TOUJOURS — le musicien des rues (docs/PLAN-FAITS-DIVERS.md §3.8).
// Une mélodie transmise de main en main, de l'os à la lumière : flûte d'os près du feu
// du campement, lyre, vielle, cithare, accordéon, guitare électrique, thérémine. Au
// clic, elle JOUE (la petite mélodie de la scène, par l'instrument de l'âge —
// audio/melodieScene.js). Au Démiurge, le dernier musicien retrouve l'os, et tous ses
// ancêtres reviennent l'accompagner, chacun au costume de son âge — des silhouettes
// pâles, en demi-cercle — et la mélodie est celle du premier soir.
import { vieK } from '../iso/isoVie.js';
import { queueFlameGlow, FLAME_COL } from '../flameGlow.js';
import { jouerMelodieScene } from '../../audio/melodieScene.js';
import { fdBlitScreen, fdPixel } from './fdDraw.js';
import { fdHash, plazaEdgeSpots, hearthSpot, lisiereSpots } from './fdSpots.js';
import { dirOf, figure, pushFig, pushProp, openStory } from './fdKit.js';

const FACE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// L'instrument de chaque chapitre (stage) et l'âge du costume de chaque ancêtre.
const INSTR = ['flute', 'lyre', 'vielle', 'lyre', 'accordeon', 'guitare', 'theremine', 'flute'];
const ANCESTORS = [{ band: 0, st: 0 }, { band: 2, st: 1 }, { band: 3, st: 2 }, { band: 4, st: 3 }, { band: 5, st: 4 }, { band: 6, st: 5 }, { band: 8, st: 6 }];
const NOTE = [255, 236, 190];

// L'instrument tenu à la main (ou la flûte : deux pixels d'os à la bouche).
export function drawInstrument(ctx, r, stage, alpha, side) {
  const k = vieK();
  const name = INSTR[stage];
  if (name === 'flute') {
    fdPixel(ctx, r.x + side * 2 * k, r.top + r.h * 0.3, [240, 232, 210], alpha);
    fdPixel(ctx, r.x + side * 3 * k, r.top + r.h * 0.34, [240, 232, 210], alpha);
    return;
  }
  if (name === 'theremine') return;     // posé par terre devant lui
  fdBlitScreen(ctx, name, 0, r.x + side * r.w * 0.16, r.top + r.h * 0.62, alpha);
}
// Les notes qui montent (un pixel, puis deux), une toutes les 1,4 s.
export function drawNotes(ctx, r, now, phase, alpha) {
  const k = vieK();
  for (let i = 0; i < 2; i += 1) {
    const v = ((now / 2800) + i / 2 + phase) % 1;
    const nx = r.x + (4 + Math.sin(v * 6.28 + i) * 3) * k, ny = r.top - v * 12 * k;
    const a = alpha * (v < 0.15 ? v / 0.15 : 1 - (v - 0.15) / 0.85);
    fdPixel(ctx, nx, ny, NOTE, a);
    fdPixel(ctx, nx + k, ny - k, NOTE, a * 0.8);
  }
}

export function buildMusicien(app) {
  const st = app.ch.stage | 0;
  const s = app.spot;
  const [fx, fy] = FACE[s.face != null ? s.face : 2];
  const sx = -fy, sy = fx;
  const x = s.x, y = s.y;
  const cast = app.ch.cast[0];
  const sit = st === 0 || st === 1 || st === 7;
  const M = figure(app, 0, x, y, { ct: cast.ct, dir: s.face != null ? s.face : 2, sit, cast: 0, variant: 5 });
  // Les ancêtres (Démiurge) : un demi-cercle derrière lui, pâles, muets.
  const ghosts = st === 7 ? ANCESTORS.map((a, j) => {
    const ang = Math.PI * (0.15 + 0.7 * (j / (ANCESTORS.length - 1)));
    const gx = x - fx * Math.sin(ang) * 0.9 + sx * Math.cos(ang) * 1.1;
    const gy = y - fy * Math.sin(ang) * 0.9 + sy * Math.cos(ang) * 1.1;
    const g = figure(app, 1 + j, gx, gy, { ct: j % 3 === 1 ? 1 : 0, dir: dirOf(x - gx, y - gy), cast: 0, variant: 5 + j });
    g.mute = true;
    g.band = a.band;
    g.stage = a.st;
    return g;
  }) : [];
  const phase = (fdHash(app.seed + ':ph') % 1000) / 1000;
  const fire = st === 0 && s.hx != null;

  app.figs = [M];
  app.actors = (now, out, alpha) => {
    const side = M.dir === 1 || M.dir === 2 ? -1 : 1;
    if (st === 5) pushProp(out, 'ampli', x + sx * 0.32, y + sy * 0.32, alpha);
    if (st === 6) pushProp(out, 'theremine', x + fx * 0.28, y + fy * 0.28, alpha);
    for (const g of ghosts) {
      pushFig(out, g, g.band, alpha * 0.42, (ctx, r) => drawInstrument(ctx, r, g.stage, alpha * 0.42, g.dir === 1 || g.dir === 2 ? -1 : 1));
    }
    pushFig(out, M, app.band, alpha, (ctx, r, nowD) => {
      drawInstrument(ctx, r, st, alpha, side);
      drawNotes(ctx, r, nowD, phase, alpha);
      // La flûte d'os, près du feu : le feu l'éclaire un peu.
      if (fire) queueFlameGlow(r.x, r.top + r.h * 0.5, 6 * vieK() / 1.135, FLAME_COL, nowD, phase, 0.2);
    });
  };
  app.open = (t, again) => {
    const res = openStory(app, t, again);
    // La mélodie : celle de l'âge — au Démiurge, celle du premier soir (l'os).
    try { jouerMelodieScene(st === 7 ? 0 : app.band); } catch { /* pas de son : tant pis */ }
    return res;
  };
  return app;
}

// Au bord d'une place (« au coin de la place ») ; la flûte d'os près du feu du camp.
function spots(L, c, seed, band) {
  const st = c.ch.stage | 0;
  if (st === 0) {
    const h = hearthSpot(L);
    if (h) return [{ x: h.x, y: h.y, hx: h.hx, hy: h.hy, key: h.key + ':mus', face: 1 }];
  }
  const p = plazaEdgeSpots(L, band);
  if (p.length) return p.slice(0, 40);
  const h = hearthSpot(L);
  if (h) return [{ x: h.x, y: h.y, hx: h.hx, hy: h.hy, key: h.key + ':mus', face: 1 }];
  return lisiereSpots(L).slice(0, 10).map((sp) => ({ ...sp, face: 2 }));
}

export const MUSICIEN_SCENE = { build: buildMusicien, spots };
// L'instrument d'un âge (la bande), pour le musicien venu jouer ailleurs.
export const INSTR_STAGE_OF_BAND = [0, 0, 1, 2, 3, 4, 5, 6, 6, 7];
