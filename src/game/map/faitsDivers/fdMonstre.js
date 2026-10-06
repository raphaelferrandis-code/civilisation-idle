"use strict";

// LE MONSTRE DU FLEUVE (docs/PLAN-FAITS-DIVERS.md §3.7).
// Anselme sent quelque chose de plus gros que lui au bout de sa ligne, et lâche. Puis
// un aileron devant la berge, un sous-marin à vapeur, une équipe de télévision qui
// filme l'eau trois nuits durant, une enfant qui le voit remonter — et au Démiurge,
// toute la ville au bord de l'eau : il affleure, il souffle une bulle, on le baptise
// Anselme. La peur, la légende, puis la tendresse.
import { worldToScreen } from '../iso/projection.js';
import { vieK, vieRing } from '../iso/isoVie.js';
import { queueFlameGlow } from '../flameGlow.js';
import { fdBlit, fdPixel, fdNoteThing } from './fdDraw.js';
import { fdHash, bankSpots } from './fdSpots.js';
import { T, dirOf, figure, thing, pushFig, pushProp, openStory } from './fdKit.js';

const ROD = [62, 44, 28], LINE = [188, 196, 196];

function buildMonstre(app) {
  const st = app.ch.stage | 0;
  const s = app.spot;
  // Vers l'eau : le vecteur de la berge au fil du courant (fdSpots.bankSpots).
  let fx = s.wxd != null ? s.wxd : 0, fy = s.wyd != null ? s.wyd : 1;
  const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
  const sx = -fy, sy = fx;
  const x = s.x, y = s.y;
  const toWater = dirOf(fx, fy);
  const cast = app.ch.cast;
  const people = cast.map((c, i) => ({ c, i })).filter((e) => e.c.ct >= 0);
  const thingCast = cast.findIndex((c) => c.ct < 0);
  // Les gens de la berge, côte à côte, tournés vers l'eau (assise : l'enfant).
  const figs = people.map((e, j) => {
    const off = (j - (people.length - 1) / 2) * 0.42;
    return figure(app, j, x + sx * off, y + sy * off, { ct: e.c.ct, dir: toWater, cast: e.i, sit: st === 4, variant: 3 + j * 4 });
  });
  // Au baptême, la foule : quelques voisins de plus, derrière (sans réplique propre).
  if (st === 5) {
    for (let j = 0; j < 3; j += 1) {
      const off = (j - 1) * 0.5 + 0.2;
      const extra = figure(app, 10 + j, x - fx * 0.5 + sx * off, y - fy * 0.5 + sy * off, { ct: j % 2, dir: toWater, cast: people[0].i, variant: 7 + j });
      extra.mute = true;
      figs.push(extra);
    }
  }
  // Ce qui vit dans l'eau : le sous-marin (le savant est dedans) ou le poisson.
  const waterCast = st === 2 ? cast.findIndex((c) => c.ct >= 0) : thingCast;
  const water = waterCast >= 0 && (st === 2 || st === 5) ? thing(app, 50, x + fx * 1.2, y + fy * 1.2, waterCast) : null;
  if (water) figs.push(water);
  const phase = (fdHash(app.seed + ':ph') % 1000) / 1000;
  // Un point d'eau : `d` = 1,1 tombe sur le point d'eau de la berge (fdSpots.bankSpots,
  // à mi-largeur), `side` longe la rive.
  const wx0 = s.wxp != null ? s.wxp : x + fx * 1.1, wy0 = s.wyp != null ? s.wyp : y + fy * 1.1;
  const wpt = (d, side = 0) => ({ x: x + (wx0 - x) * (d / 1.1) + sx * side, y: y + (wy0 - y) * (d / 1.1) + sy * side });

  app.figs = st === 2 ? figs.filter((f) => f.kind === 'thing') : figs;
  app.actors = (now, out, alpha) => {
    const band = app.band;
    const k = vieK();
    for (const f of figs) {
      if (f.kind !== 'fig' || (st === 2 && f.i === 0)) continue;
      const fisher = st === 0 && f.i === 0;
      pushFig(out, f, band, alpha, fisher ? (ctx, r, nowD) => {
        // La canne levée, tordue par la touche ; la ligne plonge, des ronds autour.
        const pw = worldToScreen(wpt(1.1).x * T(), wpt(1.1).y * T());
        const hx = r.x, hy = r.top + r.h * 0.45;
        const jerk = Math.sin(nowD / 70 + phase * 9) * 1.5 * k;
        // Une canne COURTE (sept pixels d'art), levée, penchée vers l'eau ; c'est la
        // ligne, longue, qui va jusqu'au point d'eau.
        const dxw = pw.x - hx, dyw = pw.y - hy, dl = Math.hypot(dxw, dyw) || 1;
        const tipX = hx + (dxw / dl) * 7 * k, tipY = hy - 6 * k + (dyw / dl) * 2 * k + jerk;
        for (let i = 0; i <= 6; i += 1) {
          const u = i / 6;
          fdPixel(ctx, hx + (tipX - hx) * u, hy + (tipY - hy) * u + Math.sin(u * Math.PI) * 2 * k, ROD, alpha);
        }
        const n = Math.max(2, Math.ceil(Math.hypot(pw.x - tipX, pw.y - tipY) / k));
        for (let i = 0; i <= n; i += 2) fdPixel(ctx, tipX + (pw.x - tipX) * (i / n), tipY + (pw.y - tipY) * (i / n), LINE, alpha * 0.8);
        const v = ((nowD / 700 + phase) % 1);
        vieRing(ctx, pw.x, pw.y, 1 + v * 4, k, alpha * (1 - v), [214, 232, 240]);
      } : null);
    }
    if (st === 1) {
      // L'aileron : il longe la berge, va et vient.
      const v = Math.sin(now / 2600 + phase * 6);
      const p = wpt(1.0, v * 1.1);
      const wx = p.x * T(), wy = p.y * T();
      out.push({
        wx, wy, d: wx + wy - 2,
        draw(ctx) {
          const sp = worldToScreen(wx, wy);
          fdBlit(ctx, 'aileron', 0, wx, wy, alpha, Math.cos(now / 2600 + phase * 6) < 0);
          vieRing(ctx, sp.x, sp.y + k, 3, k, alpha * 0.5, [214, 232, 240]);
        },
      });
    }
    if (st === 2 && water) {
      // Le sous-marin, son périscope, ses bulles.
      const p = wpt(1.2, Math.sin(now / 4000 + phase * 6) * 0.4);
      const wx = p.x * T(), wy = p.y * T();
      water.wx = wx; water.wy = wy;
      out.push({
        wx, wy, d: wx + wy - 2,
        draw(ctx, nowD) {
          const box = fdBlit(ctx, 'sousmarin', 0, wx, wy, alpha);
          if (box) fdNoteThing(water, box);
          const sp = worldToScreen(wx, wy);
          for (let i = 0; i < 3; i += 1) {
            const v = ((nowD / 1500 + i / 3 + phase) % 1);
            fdPixel(ctx, sp.x + (i - 1) * 3 * k, sp.y - 6 * k - v * 8 * k, [200, 230, 240], alpha * (1 - v));
          }
        },
      });
    }
    if (st === 3) {
      // L'équipe de télévision : la caméra, et son projecteur dans la nuit.
      const c = wpt(-0.3, 0.75);
      pushProp(out, 'camera', c.x, c.y, alpha, {
        after(ctx, box, nowD) {
          if (box) queueFlameGlow(box.x0 + 2 * k, box.y0 + 2 * k, 12 * k / 1.135, '230,240,255', nowD, phase, 0.6);
        },
      });
    }
    if (st === 4 || st === 5) {
      // Le vieux poisson : une ombre immense sous l'eau (la nuit), son dos qui affleure
      // au baptême, et une bulle.
      const p = wpt(1.3, st === 4 ? Math.sin(now / 5200 + phase * 6) * 0.6 : 0);
      const wx = p.x * T(), wy = p.y * T();
      if (water) { water.wx = wx; water.wy = wy; }
      out.push({
        wx, wy, d: wx + wy - 2,
        draw(ctx, nowD) {
          const sp = worldToScreen(wx, wy);
          const box = fdBlit(ctx, 'dos', 0, wx, wy, alpha * (st === 4 ? 0.35 : 1), false, st === 5 ? Math.round(Math.sin(nowD / 900) * 0.6) : 0);
          if (box && water) fdNoteThing(water, box);
          if (st === 4) fdPixel(ctx, sp.x + 4 * k, sp.y - k, [236, 240, 200], alpha * (0.5 + 0.5 * Math.sin(nowD / 600)));
          const v = ((nowD / 2400 + phase) % 1);
          if (st === 5) vieRing(ctx, sp.x - 2 * k, sp.y - 2 * k - v * 6 * k, 1 + v * 2, k, alpha * (1 - v), [230, 244, 250]);
        },
      });
    }
  };
  app.open = (t, again) => openStory(app, t, again);
  return app;
}

function spots(L) {
  return bankSpots(L).slice(0, 30);
}

export const MONSTRE_SCENE = { build: buildMonstre, spots };
