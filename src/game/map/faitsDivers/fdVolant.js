"use strict";

// LES GRANDVENT — l'homme-volant (docs/PLAN-FAITS-DIVERS.md §3.5).
// Au bord de l'eau, avec des badauds. D'âge en âge, un Grandvent essaie de voler :
// des plumes, une catapulte, des ailes de cire, une montgolfière, un réacteur… Il
// saute, il tombe dans le fleuve, des ronds dans l'eau, il remonte, il recommence.
// Au Stellaire il vole enfin (et il a le vertige) ; au Démiurge, il range ses ailes.
// Une boucle à graine, dessinée au pixel : élan, saut en arc, plouf, retour.
import { worldToScreen } from '../iso/projection.js';
import { vieK, vieRing } from '../iso/isoVie.js';
import { fdBlit, fdBlitScreen, fdPixel } from './fdDraw.js';
import { fdHash, bankSpots, plazaEdgeSpots } from './fdSpots.js';
import { T, dirOf, figure, pushFig, pushProp, openStory } from './fdKit.js';

const FACE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// La boucle d'un essai (s) : élan, saut, eau, retour sur la berge.
const LOOP = [4.2, 1.1, 2.2, 1.2];

function buildVolant(app) {
  const st = app.ch.stage | 0;
  const s = app.spot;
  const [fx, fy] = FACE[s.face != null ? s.face : 2];
  const sx = -fy, sy = fx;
  const x = s.x, y = s.y;
  const hero = figure(app, 0, x, y, { ct: 0, dir: s.face != null ? s.face : 2, cast: 0, variant: 9 });
  // Les badauds, un peu en retrait, tournés vers lui (ou vers le ciel au Stellaire).
  const crowd = app.ch.cast.map((c, i) => ({ c, i })).filter((e) => e.i > 0).map((e, j) => {
    const side = j % 2 ? -1 : 1;
    const bx = x - fx * 0.55 + sx * side * (0.45 + j * 0.15), by = y - fy * 0.55 + sy * side * (0.45 + j * 0.15);
    return figure(app, 1 + j, bx, by, { ct: e.c.ct, dir: dirOf(x - bx, y - by), cast: e.i });
  });
  // Le point d'eau où il finit (à une case dans le fleuve).
  const wxT = s.wxp != null ? s.wxp : x + fx * 1.0, wyT = s.wyp != null ? s.wyp : y + fy * 1.0;
  const phase = (fdHash(app.seed + ':ph') % 1000) / 1000;
  const period = LOOP.reduce((a, b) => a + b, 0) + (st === 3 ? 5 : 0);

  app.figs = [hero, ...crowd];
  app.actors = (now, out, alpha) => {
    const band = app.band;
    for (const c of crowd) pushFig(out, c, band, alpha);
    if (st === 6) {
      // Il a rangé ses ailes : debout, tourné vers nous.
      hero.dir = 2;
      pushProp(out, 'ailesPliees', x + sx * 0.3, y + sy * 0.3, alpha);
      pushFig(out, hero, band, alpha);
      return;
    }
    if (st === 5) {
      // Il vole enfin : immobile très haut, il tremble un peu.
      hero.lift = 16 + Math.round(Math.sin(now / 90) * 0.6);
      pushFig(out, hero, band, alpha, (ctx, r, nowD) => {
        const k = vieK();
        for (let i = 0; i < 3; i += 1) {
          if (((Math.floor(nowD / 90) + i) % 3) !== 0) fdPixel(ctx, r.x + (i - 1) * k, r.y + (1 + (i % 2)) * k, i === 1 ? [200, 240, 255] : [120, 190, 255], alpha);
        }
      });
      return;
    }
    if (st === 1) pushProp(out, 'catapulte', x - fx * 0.35 + sx * 0.25, y - fy * 0.35 + sy * 0.25, alpha);
    const t = ((now / 1000 + phase * period) % period);
    let u = 0, phaseName = 'elan';
    if (st === 3) {
      // La montgolfière : elle monte lentement, dérive au-dessus de l'eau, descend.
      const up = 6, drift = 4, down = 3;
      const q = t % (up + drift + down + 3);
      let lift = 0, px = x, py = y;
      if (q < up) lift = (q / up) * 26;
      else if (q < up + drift) { lift = 26; const v = (q - up) / drift; px = x + (wxT - x) * v; py = y + (wyT - y) * v; }
      else if (q < up + drift + down) { const v = (q - up - drift) / down; lift = 26 * (1 - v); px = wxT; py = wyT; }
      else { px = wxT; py = wyT; lift = -1; }
      const wx = px * T(), wy = py * T();
      out.push({
        wx, wy, d: wx + wy + 4,
        draw(ctx) {
          const k = vieK();
          if (lift >= 0) fdBlit(ctx, 'montgolfiere', 0, wx, wy, alpha, false, Math.round(lift));
          else {
            const p = worldToScreen(wx, wy);
            const v = (q - up - drift - down) / 3;
            vieRing(ctx, p.x, p.y, 2 + v * 6, k, alpha * (1 - v), [214, 232, 240]);
          }
        },
      });
      hero.dir = dirOf(fx, fy);
      pushFig(out, hero, band, alpha);
      return;
    }
    // Les autres âges : élan (battements), saut en arc, plouf, retour.
    if (t < LOOP[0]) { phaseName = 'elan'; u = t / LOOP[0]; }
    else if (t < LOOP[0] + LOOP[1]) { phaseName = 'saut'; u = (t - LOOP[0]) / LOOP[1]; }
    else if (t < LOOP[0] + LOOP[1] + LOOP[2]) { phaseName = 'eau'; u = (t - LOOP[0] - LOOP[1]) / LOOP[2]; }
    else { phaseName = 'retour'; u = (t - LOOP[0] - LOOP[1] - LOOP[2]) / LOOP[3]; }
    if (phaseName === 'eau') {
      const wx = wxT * T(), wy = wyT * T();
      out.push({
        wx, wy, d: wx + wy,
        draw(ctx) {
          const p = worldToScreen(wx, wy);
          const k = vieK();
          for (let i = 0; i < 2; i += 1) {
            const v = Math.max(0, u - i * 0.3);
            if (v > 0) vieRing(ctx, p.x, p.y, 2 + v * 7, k, alpha * (1 - v), [214, 232, 240]);
          }
        },
      });
      return;
    }
    let hx = x, hy = y, lift = 0;
    if (phaseName === 'saut') {
      // L'arc : il monte un peu (beaucoup moins qu'il ne l'espérait), puis l'eau.
      hx = x + (wxT - x) * u; hy = y + (wyT - y) * u;
      lift = Math.round(Math.sin(u * Math.PI) * (st === 1 ? 22 : st === 4 ? 14 : 9) - u * 3);
    }
    if (phaseName === 'retour') { hx = x + fx * 0.3 * (1 - u); hy = y + fy * 0.3 * (1 - u); }
    if (st === 4 && phaseName === 'elan' && u > 0.55) lift = Math.round((u - 0.55) / 0.45 * 10);   // trois secondes en l'air
    hero.wx = hx * T(); hero.wy = hy * T();
    hero.lift = lift;
    hero.dir = phaseName === 'retour' ? dirOf(-fx, -fy) : dirOf(fx, fy);
    const wings = st === 0 || st === 2;
    pushFig(out, hero, band, alpha, (ctx, r, nowD) => {
      const k = vieK();
      if (wings) {
        const flap = phaseName === 'elan' || phaseName === 'saut' ? Math.floor(nowD / (phaseName === 'saut' ? 110 : 260)) % 2 : 1;
        fdBlitScreen(ctx, 'ailes', flap, r.x, r.top + r.h * 0.42, alpha);
      }
      if (st === 4 && lift > 0) {
        for (let i = 0; i < 3; i += 1) {
          if (((Math.floor(nowD / 80) + i) % 3) !== 0) fdPixel(ctx, r.x + (i - 1) * k, r.y + (1 + (i % 2)) * k, i === 1 ? [255, 214, 90] : [247, 120, 40], alpha);
        }
      }
    });
  };
  app.open = (t, again) => openStory(app, t, again);
  return app;
}

function spots(L, c, seed, band) {
  const b = bankSpots(L);
  if (b.length) return b.slice(0, 30);
  return plazaEdgeSpots(L, band).slice(0, 20);
}

export const VOLANT_SCENE = { build: buildVolant, spots };
