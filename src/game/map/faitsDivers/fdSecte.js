"use strict";

// LA SECTE DU FEU QUI PARLE (docs/PLAN-FAITS-DIVERS.md §3.1).
// Un cercle de fidèles autour d'un feu, à la lisière, la nuit. Le décor change d'âge
// en âge (pierres levées, temple, chaudière, enseigne, étoile), le cercle reste. Assis
// par terre tant qu'il y a un feu à veiller. Au Démiurge, le feu parle — c'est la
// seule chose de la scène qu'on clique pour l'entendre.
import { worldToScreen, depthOf } from '../iso/projection.js';
import { queueFlameGlow, FLAME_COL } from '../flameGlow.js';
import { vieK } from '../iso/isoVie.js';
import { fdBlit, fdPixel, fdNoteThing } from './fdDraw.js';
import { fdHash, lisiereSpots } from './fdSpots.js';
import { fdFocus } from './fdPick.js';
import { T, dirOf, figure, thing, pushFig, ringPoints, openStory } from './fdKit.js';
import { CM } from '../layout.js';
import { drawCritterIso } from '../critters.js';
import { AGENT_SCALE } from '../agents.js';
import { fdProgress } from '../../core/faitsDivers.js';
import { FD_STORIES } from '../../data/faitsDivers.js';

function buildSecte(app) {
  const { x, y } = app.spot;
  const st = app.ch.stage | 0;
  const people = app.ch.cast.map((c, i) => ({ c, i })).filter((e) => e.c.ct >= 0);
  const N = [6, 12, 5, 6, 8, 6, 6][st] || 6;
  const R = [0.55, 0.9, 0.7, 0.75, 0.85, 0.7, 0.62][st] || 0.7;
  const sit = st === 0 || st === 1 || st === 5 || st === 6;
  const figs = [];
  // Âge du Marbre : le temple occupe le centre, les fidèles se tiennent devant lui
  // (moitié sud du cercle, celle qu'on voit) ; l'oracle au plus près.
  const start = st === 2 ? Math.PI * 0.08 : (fdHash(app.seed + ':a') % 628) / 100;
  const span = st === 2 ? Math.PI * 0.84 : Math.PI * 2;
  for (let i = 0; i < N; i += 1) {
    const a = start + (span === Math.PI * 2 ? (i / N) * span : (i / Math.max(1, N - 1)) * span);
    let dx = Math.cos(a) * R, dy = Math.sin(a) * R;
    const e = people[i % people.length];
    // Les fidèles de l'âge stellaire regardent le ciel : tous tournés vers le nord.
    const dir = st === 5 ? 3 : dirOf(-dx, -dy);
    if (st === 5) { dx *= 1.1; dy = dy * 0.6 + 0.25; }
    figs.push(figure(app, i, x + dx, y + dy, { ct: e.c.ct, dir, sit, cast: e.i }));
  }
  const fireCast = app.ch.cast.findIndex((c) => c.ct < 0);
  const fire = fireCast >= 0 ? thing(app, N, x, y, fireCast) : null;
  if (fire) figs.push(fire);
  // La chèvre sacrée (si Blanquette a été rencontrée) : assise parmi les fidèles.
  // Jamais tant que la Chèvre est éteinte (`off`, data/faitsDivers.js).
  const goat = st >= 2 && app.story.cameo && !FD_STORIES.chevre.off && fdProgress(FD_STORIES.chevre).n > 0 ? thing(app, N + 1, x + R * 0.75, y - R * 0.55, 0) : null;
  if (goat) { goat.say = app.story.cameo; figs.push(goat); }
  // Les pierres levées (âges de la Pierre et du Démiurge) : huit, en couronne.
  const stones = st === 1 || st === 6 ? ringPoints(8, st === 1 ? 1.42 : 1.2, 0.2).map((p, i) => ({ x: x + p.dx, y: y + p.dy, v: i % 2 })) : [];
  const phase = (fdHash(app.seed + ':f') % 1000) / 100;

  app.figs = figs;
  app.actors = (now, out, alpha) => {
    const band = app.band;
    for (const f of figs) if (f.kind === 'fig') pushFig(out, f, band, alpha);
    if (goat) {
      out.push({
        wx: goat.wx, wy: goat.wy, d: goat.wx + goat.wy,
        draw(ctx) {
          const p = worldToScreen(goat.wx, goat.wy);
          const z = CM.cam ? CM.cam.zoom : 1;
          const pa = ctx.globalAlpha;
          if (alpha < 1) ctx.globalAlpha = pa * alpha;
          const m = drawCritterIso(ctx, p.x, p.y, CM.TILE * z, { kind: 'goat', dir: 1 }, AGENT_SCALE, CM.dpr);
          ctx.globalAlpha = pa;
          if (m) fdNoteThing(goat, { x0: p.x - m.box * 0.45, x1: p.x + m.box * 0.45, y0: p.y - m.box * 0.85, y1: p.y });
        },
      });
    }
    for (const s of stones) {
      const wx = s.x * T(), wy = s.y * T();
      out.push({ wx, wy, d: depthOf(wx, wy), draw(ctx) { fdBlit(ctx, s.v ? 'menhir2' : 'menhir', 0, wx, wy, alpha); } });
    }
    // Le centre : feu, temple, chaudière, enseigne, ou rien (le ciel).
    const cwx = x * T(), cwy = y * T();
    out.push({
      wx: cwx, wy: cwy, d: depthOf(cwx, cwy),
      draw(ctx, nowD) {
        const fi = Math.floor(nowD / 140 + phase * 7);
        let box = null;
        const p = worldToScreen(cwx, cwy);
        const k = vieK();
        if (st === 0 || st === 1 || st === 6) {
          // Au Démiurge, le feu « parle » : il s'élève quand on l'écoute.
          const talk = fire && fdFocus() === fire;
          box = fdBlit(ctx, 'feu', fi, cwx, cwy, alpha, false, talk ? 1 : 0);
          queueFlameGlow(p.x, p.y - 3 * k, (talk ? 26 : 18) * k / 1.135, FLAME_COL, nowD, phase, talk ? 1.2 : 0.75);
        } else if (st === 2) {
          box = fdBlit(ctx, 'temple', Math.floor(nowD / 260 + phase) % 2, cwx, cwy, alpha);
          queueFlameGlow(p.x, p.y - 5 * k, 12 * k / 1.135, FLAME_COL, nowD, phase, 0.55);
        } else if (st === 3) {
          box = fdBlit(ctx, 'chaudiere', Math.floor(nowD / 200 + phase) % 2, cwx, cwy, alpha);
          queueFlameGlow(p.x, p.y - 2 * k, 13 * k / 1.135, FLAME_COL, nowD, phase, 0.6);
          // La vapeur : trois pixels qui montent du tuyau, en boucle.
          for (let j = 0; j < 3; j += 1) {
            const u = ((nowD / 1400 + j / 3 + phase) % 1);
            fdPixel(ctx, p.x + 2.5 * k + Math.sin(u * 6 + j) * k, p.y - (11 + u * 9) * k, [226, 226, 222], alpha * (1 - u) * 0.8);
          }
        } else if (st === 4) {
          // Le néon grésille : éteint par instants, selon une « grammaire » à graine.
          const tick = Math.floor(nowD / 180 + phase * 3);
          const off = (fdHash(app.seed + ':n' + (tick % 23)) % 9) === 0;
          box = fdBlit(ctx, 'enseigne', off ? 1 : 0, cwx, cwy, alpha);
          if (!off) queueFlameGlow(p.x - 0.5 * k, p.y - 8 * k, 16 * k / 1.135, '255,70,110', nowD, phase, 0.7);
        } else if (st === 5) {
          // L'étoile : un éclat qui scintille au-dessus d'eux, et la boîte à braise.
          const sy = p.y - 46 * k, tw = 0.55 + 0.45 * Math.sin(nowD / 420 + phase);
          fdPixel(ctx, p.x, sy, [255, 248, 220], alpha * tw);
          for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) fdPixel(ctx, p.x + ox * k, sy + oy * k, [255, 236, 190], alpha * tw * 0.5);
          fdBlit(ctx, 'boite', 0, cwx, cwy, alpha);
          queueFlameGlow(p.x, p.y - k, 5 * k / 1.135, FLAME_COL, nowD, phase, 0.35);
        }
        if (fire && box) fdNoteThing(fire, box);
      },
    });
  };
  app.open = (t, again) => openStory(app, t, again);
  return app;
}

export const SECTE_SCENE = {
  build: buildSecte,
  spots: (L) => lisiereSpots(L).slice(0, 40),
};
