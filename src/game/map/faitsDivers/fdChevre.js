"use strict";

// LA CHÈVRE DES TOITS (docs/PLAN-FAITS-DIVERS.md §3.3).
// Blanquette — la chèvre de M. Seguin (Daudet), qui voulait la montagne. Elle
// s'échappe de son enclos au Bois, puis on la retrouve d'âge en âge toujours plus
// haut, sur les toits de la ville, chez des Seguin qui n'en reviennent pas ; au
// Démiurge, elle rentre, et ils ne referment pas la barrière.
// Sur un toit : posée sur la LIGNE D'ENCRE du toit de la maison (comme les pigeons,
// iso/isoVieOiseaux), triée juste après elle ; un Seguin en bas, qui lève la tête.
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from '../iso/projection.js';
import { vieK, drawnBoxOf, inkTopAt } from '../iso/isoVie.js';
import { isoFrontOffset } from '../iso/isoGroundDetail.js';
import { drawCritterIso } from '../critters.js';
import { AGENT_SCALE } from '../agents.js';
import { fdNoteThing } from './fdDraw.js';
import { fdHash, fdFootprints, spotOpen, doorstepForType, lisiereSpots } from './fdSpots.js';
import { T, figure, thing, pushFig, pushProp, openStory } from './fdKit.js';

// La chèvre (le sprite du bétail, critters.js), pieds en (x, y) écran ; rend sa boîte.
function drawGoat(ctx, x, y, dir, alpha) {
  const z = CM.cam ? CM.cam.zoom : 1;
  const pa = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = pa * alpha;
  const m = drawCritterIso(ctx, x, y, CM.TILE * z, { kind: 'goat', dir }, AGENT_SCALE, CM.dpr);
  ctx.globalAlpha = pa;
  if (!m) return null;
  const h = m.box;
  return { x0: x - h * 0.45, x1: x + h * 0.45, y0: y - h * 0.85, y1: y + h * 0.1 };
}

export function buildChevre(app) {
  const st = app.ch.stage | 0;
  const s = app.spot;
  const goatCast = app.ch.cast.findIndex((c) => c.ct < 0);
  const personCast = app.ch.cast.findIndex((c) => c.ct >= 0);
  const goat = thing(app, 0, s.x, s.y, goatCast);
  const figs = [goat];
  const phase = (fdHash(app.seed + ':ph') % 1000) / 1000;
  let person = null;

  if (s.roof) {
    // ── Sur un toit : un Seguin (ou une voisine) en bas, devant la maison, tête levée.
    const t = s.t;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    person = figure(app, 1, t.gx + sx * 0.5, t.gy + sy + 0.35, { ct: app.ch.cast[personCast].ct, dir: 3, cast: personCast, variant: 4 });
    figs.push(person);
    // Triée JUSTE APRÈS sa maison, dont la clé est poussée vers la rue (même calage
    // que les pigeons des toits) : avant elle, la boîte du toit n'existe pas encore.
    const fo = isoFrontOffset(t, CM.layout && CM.layout.roadMap);
    const ax = (t.gx + sx + (fo ? fo.ox : 0)) * T(), ay = (t.gy + sy + (fo ? fo.oy : 0)) * T();
    app.figs = figs;
    app.actors = (now, out, alpha) => {
      pushFig(out, person, app.band, alpha);
      out.push({
        wx: ax, wy: ay, d: depthOf(ax, ay) + 0.004,
        draw(ctx, nowD) {
          const b = drawnBoxOf(t);
          if (!b || b.dh < 10) return;
          const k = vieK();
          // Elle se déplace un peu sur le faîte, puis s'arrête et regarde en bas.
          const u = 0.42 + 0.12 * Math.sin(nowD / 5200 + phase * 6);
          const x = b.dx + b.dw * u;
          const y = inkTopAt(b, u);
          if (y == null) return;
          const dir = Math.cos(nowD / 5200 + phase * 6) > 0 ? 0 : 2;
          const box = drawGoat(ctx, x, y + k, dir, alpha);
          if (box) fdNoteThing(goat, box);
        },
      });
    };
  } else {
    // ── L'enclos : vide au Bois (elle est dehors, à côté), elle dedans au Démiurge.
    const inside = st === 7;
    person = figure(app, 1, s.x - 0.55, s.y + 0.25, { ct: app.ch.cast[personCast].ct, dir: 0, cast: personCast, variant: 4 });
    figs.push(person);
    const gx = inside ? s.x + 0.05 : s.x + 0.75, gy = inside ? s.y - 0.05 : s.y + 0.45;
    goat.wx = gx * T(); goat.wy = gy * T();
    app.figs = figs;
    app.actors = (now, out, alpha) => {
      pushProp(out, 'enclos', s.x, s.y, alpha);
      pushFig(out, person, app.band, alpha);
      const wx = gx * T(), wy = gy * T();
      out.push({
        wx, wy, d: depthOf(wx, wy) + 0.01,
        draw(ctx, nowD) {
          const p = worldToScreen(wx, wy);
          const box = drawGoat(ctx, p.x, p.y, Math.floor(nowD / 4000 + phase * 4) % 2 ? 0 : 2, alpha);
          if (box) fdNoteThing(goat, box);
        },
      });
    };
  }
  app.open = (t, again) => openStory(app, t, again);
  return app;
}

// Les toits possibles : des maisons dont l'avant se voit, les plus grandes d'abord à
// partir de la Couronne (« un grand toit », « tout en haut »).
export function roofSpots(L, st, seed) {
  const foot = fdFootprints(L);
  const out = [];
  for (const t of (L.tiles || [])) {
    if (t.type !== 'house' && t.type !== 'enginehome') continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const fx = t.gx + sx, fy = t.gy + sy;
    // La rue devant elle (où se tient le Seguin) doit être libre, et la maison vue.
    if (foot.has((t.gx + Math.floor(sx / 2)) + ',' + fy)) continue;
    const open = spotOpen(L, fx - 0.5, fy + 0.2);
    if (open < 0) continue;
    out.push({ x: t.gx + sx / 2, y: t.gy + sy / 2, t, roof: true, key: 'roof:' + t.gx + ',' + t.gy, big: sx * sy, h: fdHash(seed + t.gx + ':' + t.gy) });
  }
  out.sort((a, b) => (st >= 2 ? b.big - a.big : 0) || (a.h - b.h));
  return out.slice(0, 40);
}
function spots(L, c, seed) {
  const st = c.ch.stage | 0;
  if (st === 0 || st === 7) {
    // Au bord du terroir (le seuil d'un champ), sinon à la lisière.
    const d = doorstepForType(L, 'irrigated_fields', seed);
    if (d && d.open >= 0) return [{ ...d, roof: false, key: 'enclos:' + d.key }];
    return lisiereSpots(L).slice(0, 20);
  }
  const roofs = roofSpots(L, st, seed);
  return roofs.length ? roofs : lisiereSpots(L).slice(0, 10).map((s) => ({ ...s }));
}

export const CHEVRE_SCENE = { build: buildChevre, spots };
