"use strict";

// LES GAGS D'UN SEUL COUP — les curiosités (docs/PLAN-FAITS-DIVERS.md §3.11).
// Sans suite : une file d'attente devant rien, des citrouilles qui dévalent la rue,
// un homme coincé sur un toit, une sieste dans le blé, une sérénade qui finit mouillée,
// un cerf-volant coincé depuis trois générations, une vache qui a la priorité, un mime.
// La Chronique les garde comme des « curiosités ». Le premier clic les inscrit.
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from '../iso/projection.js';
import { vieK, drawnBoxOf, inkTopAt } from '../iso/isoVie.js';
import { isoFrontOffset } from '../iso/isoGroundDetail.js';
import { drawDraftIso } from '../iso/isoUnits.js';
import { AGENT_SCALE } from '../agents.js';
import { WINTER } from '../seasonMode.js';
import { fdBlitScreen, fdPixel, fdFigure, fdNoteThing } from './fdDraw.js';
import { fdHash, roadRunSpots, plazaEdgeSpots, treeSpots, doorstepForType, lisiereSpots } from './fdSpots.js';
import { roofSpots } from './fdChevre.js';
import { T, dirOf, figure, thing, pushFig, pushProp } from './fdKit.js';
import { fdInscrireCurio } from '../../core/faitsDivers.js';

const NOTE = [255, 236, 190];
const PUMPKIN = [[232, 128, 36], [196, 96, 28]];

// La plaque d'une curiosité : la réplique du personnage visé ; le premier clic
// l'inscrit. Le mime a une réserve de répliques (re-clic).
function openCurio(app, t, again) {
  const g = app.curio;
  const cast = g.cast[Math.max(0, t.cast | 0) % g.cast.length];
  let isNew = false;
  if (!app.inscribed) {
    isNew = fdInscrireCurio(g.id, app.band);
    app.inscribed = true;
  }
  let line = cast.line;
  if ((again || t.opened) && g.lines && g.lines.length) {
    app.lineN = ((app.lineN ?? -1) + 1) % g.lines.length;
    line = g.lines[app.lineN];
  }
  t.opened = true;
  return { who: cast.who, line, isNew, title: g.title };
}

// Le long d'une rue : l'axe et son sens.
function runAxis(s) {
  return { ax: s.ax || 1, ay: s.ay || 0 };
}

// ── LA FILE D'ATTENTE ────────────────────────────────────────────────────────
function buildFile(app) {
  const s = app.spot;
  const { ax, ay } = runAxis(s);
  const n = 6;
  const front = dirOf(ax, ay);
  const figs = [];
  for (let i = 0; i < n; i += 1) {
    const u = (i - (n - 1) / 2) * 0.42;
    const cast = i === n - 1 ? 1 : i === 0 ? 0 : 2;            // la première devant, le dernier au bout
    figs.push(figure(app, i, s.x - ax * u, s.y - ay * u, { ct: app.curio.cast[cast].ct, dir: front, cast, variant: 2 + i * 3 }));
  }
  app.figs = figs;
  app.actors = (now, out, alpha) => { for (const f of figs) pushFig(out, f, app.band, alpha); };
  app.open = (t, again) => openCurio(app, t, again);
  return app;
}

// ── LES CITROUILLES ──────────────────────────────────────────────────────────
function buildCitrouilles(app) {
  const s = app.spot;
  const { ax, ay } = runAxis(s);
  const carter = figure(app, 0, s.x - ax * 0.5 + ay * 0.3, s.y - ay * 0.5 + ax * 0.3, { ct: 0, dir: dirOf(ax, ay), cast: 0, variant: 3 });
  const pumpkins = [];
  for (let i = 0; i < 7; i += 1) {
    const h = fdHash(app.seed + ':c' + i);
    pumpkins.push({ u: 0.4 + (h % 100) / 100 * 1.6, v: ((h >> 7) % 100) / 100 - 0.5, c: PUMPKIN[i % 2] });
  }
  app.figs = [carter];
  app.actors = (now, out, alpha) => {
    pushProp(out, 'charrette', s.x, s.y, alpha);
    pushFig(out, carter, app.band, alpha);
    for (const pk of pumpkins) {
      const wx = (s.x + ax * pk.u - ay * pk.v * 0.6) * T(), wy = (s.y + ay * pk.u - ax * pk.v * 0.6) * T();
      out.push({
        wx, wy, d: depthOf(wx, wy),
        draw(ctx) {
          const p = worldToScreen(wx, wy);
          const k = vieK();
          fdPixel(ctx, p.x, p.y - k, pk.c, alpha);
          fdPixel(ctx, p.x + k, p.y - k, pk.c, alpha);
          fdPixel(ctx, p.x, p.y - 2 * k, [92, 132, 52], alpha);
        },
      });
    }
  };
  app.open = (t, again) => openCurio(app, t, again);
  return app;
}

// Un personnage posé SUR un toit (l'homme de l'échelle) : trié juste après sa maison,
// pieds sur la ligne d'encre du toit, comme Blanquette.
function roofActor(out, app, f, t, alpha) {
  const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
  const fo = isoFrontOffset(t, CM.layout && CM.layout.roadMap);
  const ax = (t.gx + sx + (fo ? fo.ox : 0)) * T(), ay = (t.gy + sy + (fo ? fo.oy : 0)) * T();
  out.push({
    wx: ax, wy: ay, d: depthOf(ax, ay) + 0.005,
    draw(ctx, now) {
      const b = drawnBoxOf(t);
      if (!b || b.dh < 10) return;
      // Il se tient sur le toit, à la colonne de son propre pied : on le relève
      // jusqu'à la ligne d'encre du toit à cette colonne.
      const p = worldToScreen(f.wx, f.wy);
      const u = Math.max(0.2, Math.min(0.8, (p.x - b.dx) / b.dw));
      const y = inkTopAt(b, u);
      if (y == null) return;
      f.lift = (p.y - y) / vieK() - 1;
      fdFigure(ctx, f, app.band, now, alpha);
    },
  });
}

// ── L'ÉCHELLE TROP COURTE ────────────────────────────────────────────────────
function buildEchelle(app) {
  const t = app.spot.t;
  const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
  const man = figure(app, 0, t.gx + sx * 0.4, t.gy + sy, { ct: 0, dir: 2, cast: 0, variant: 7 });
  app.figs = [man];
  app.actors = (now, out, alpha) => {
    // L'échelle contre le mur : elle s'arrête à mi-hauteur.
    pushProp(out, 'echelle', t.gx + sx * 0.45, t.gy + sy + 0.12, alpha);
    roofActor(out, app, man, t, alpha);
  };
  app.open = (tt, again) => openCurio(app, tt, again);
  return app;
}

// ── LA SIESTE DANS LE BLÉ ────────────────────────────────────────────────────
function buildSieste(app) {
  const s = app.spot;
  const g = app.curio;
  const star = [[-0.25, -0.1], [0.2, -0.2], [0.25, 0.18], [-0.18, 0.24]];
  const figs = star.map(([dx, dy], i) => {
    const f = figure(app, i, s.x + dx, s.y + dy, { ct: g.cast[i % g.cast.length].ct, dir: [0, 3, 1, 2][i], sit: true, cast: i % g.cast.length, variant: 3 + i * 2 });
    f.sink = 0.72;
    return f;
  });
  app.figs = figs;
  app.actors = (now, out, alpha) => {
    for (const f of figs) pushFig(out, f, app.band, alpha);
    // Des « z » qui montent (deux pixels), un dormeur sur deux.
    const wx = s.x * T(), wy = s.y * T();
    out.push({
      wx, wy, d: depthOf(wx, wy) + 3,
      draw(ctx, nowD) {
        const p = worldToScreen(wx, wy);
        const k = vieK();
        const v = (nowD / 3000) % 1;
        fdPixel(ctx, p.x + 3 * k, p.y - 8 * k - v * 8 * k, [244, 244, 236], alpha * (1 - v));
        fdPixel(ctx, p.x + 4 * k, p.y - 9 * k - v * 8 * k, [244, 244, 236], alpha * (1 - v) * 0.7);
      },
    });
  };
  app.open = (t, again) => openCurio(app, t, again);
  return app;
}

// ── LA SÉRÉNADE ──────────────────────────────────────────────────────────────
function buildSerenade(app) {
  const t = app.spot.t;
  const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
  const singer = figure(app, 0, t.gx + sx * 0.5, t.gy + sy + 0.45, { ct: 0, dir: 3, cast: 0, variant: 9 });
  const phase = (fdHash(app.seed + ':ph') % 1000) / 1000;
  app.figs = [singer];
  app.actors = (now, out, alpha) => {
    const cyc = (now / 1000 + phase * 14) % 14;
    pushFig(out, singer, app.band, alpha, (ctx, r) => {
      const k = vieK();
      // Ses notes, puis — à la fin du couplet — l'eau qui lui tombe dessus.
      if (cyc < 10) {
        for (let i = 0; i < 2; i += 1) {
          const v = ((cyc / 2.2) + i / 2) % 1;
          fdPixel(ctx, r.x + (3 + i * 2) * k, r.top - v * 10 * k, NOTE, alpha * (1 - v));
        }
      } else if (cyc > 11.2 && cyc < 12.6) {
        const v = (cyc - 11.2) / 1.4;
        for (let i = 0; i < 5; i += 1) fdPixel(ctx, r.x + (i - 2) * k, r.top - 14 * k + v * 14 * k + (i % 2) * k, [150, 196, 236], alpha * (1 - v * 0.5));
      }
    });
    // La fenêtre qui s'allume au-dessus de lui (et s'ouvre, pour le seau).
    const fo = isoFrontOffset(t, CM.layout && CM.layout.roadMap);
    const ax = (t.gx + sx + (fo ? fo.ox : 0)) * T(), ay = (t.gy + sy + (fo ? fo.oy : 0)) * T();
    out.push({
      wx: ax, wy: ay, d: depthOf(ax, ay) + 0.005,
      draw(ctx) {
        if (cyc < 9.5) return;
        const b = drawnBoxOf(t);
        if (!b) return;
        const k = vieK();
        const wx0 = b.dx + b.dw * 0.5, wy0 = b.dy + b.dh * 0.52;
        for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) fdPixel(ctx, wx0 + dx * k, wy0 + dy * k, [255, 214, 120], alpha);
      },
    });
  };
  app.open = (tt, again) => openCurio(app, tt, again);
  return app;
}

// ── LE CERF-VOLANT ───────────────────────────────────────────────────────────
function buildCerfvolant(app) {
  const s = app.spot;
  const g = app.curio;
  const grand = figure(app, 0, s.x, s.y, { ct: g.cast[0].ct, dir: dirOf(s.tx - s.x, s.ty - s.y), cast: 0, variant: 1 });
  const kid = figure(app, 1, s.x + 0.35, s.y - 0.2, { ct: g.cast[1].ct, dir: dirOf(s.tx - s.x, s.ty - s.y), cast: 1 });
  app.figs = [grand, kid];
  app.actors = (now, out, alpha) => {
    pushFig(out, grand, app.band, alpha);
    pushFig(out, kid, app.band, alpha, (ctx, r, nowD) => {
      const k = vieK();
      const tp = worldToScreen(s.tx * T(), s.ty * T());
      const kx = tp.x + 3 * k, ky = tp.y - (18 + (s.r || 0.7) * 14) * k;
      fdBlitScreen(ctx, 'cerfvolant', 0, kx, ky + Math.sin(nowD / 700) * k, alpha);
      // La ficelle : de sa main au cerf-volant, en pointillé.
      const hx = r.x + 2 * k, hy = r.top + r.h * 0.45;
      const n = Math.max(2, Math.ceil(Math.hypot(kx - hx, ky - hy) / k));
      for (let i = 0; i <= n; i += 2) fdPixel(ctx, hx + (kx - hx) * (i / n), hy + (ky - 2 * k - hy) * (i / n), [236, 236, 228], alpha * 0.7);
    });
  };
  app.open = (t, again) => openCurio(app, t, again);
  return app;
}

// ── LA VACHE ─────────────────────────────────────────────────────────────────
// Dessinée par le BŒUF MAISON (bandes veh-ox-<diagonale>, PixelLab, celui des
// attelages et des champs : drawDraftIso, frame 0 = à l'arrêt) depuis que la vache
// du pack LaserKiwi est partie, faute de licence (2026-10-05, cf. critters.js).
// drawDraftIso suit la convention de cap des agents (0 +x, 1 −x, 2 +y, 3 −y) : elle
// se tient donc vraiment EN TRAVERS de la rue.
function buildVache(app) {
  const s = app.spot;
  const { ax, ay } = runAxis(s);
  const g = app.curio;
  const cowCast = g.cast.findIndex((c) => c.ct < 0), manCast = g.cast.findIndex((c) => c.ct >= 0);
  const cow = thing(app, 0, s.x, s.y, cowCast);
  const man = figure(app, 1, s.x - ax * 0.7, s.y - ay * 0.7, { ct: 0, dir: dirOf(ax, ay), cast: manCast, variant: 5 });
  app.figs = [cow, man];
  app.actors = (now, out, alpha) => {
    pushFig(out, man, app.band, alpha);
    const wx = s.x * T(), wy = s.y * T();
    out.push({
      wx, wy, d: depthOf(wx, wy) + 0.01,
      draw(ctx) {
        const p = worldToScreen(wx, wy);
        const z = CM.cam ? CM.cam.zoom : 1;
        const pa = ctx.globalAlpha;
        if (alpha < 1) ctx.globalAlpha = pa * alpha;
        const ok = drawDraftIso(ctx, p.x, p.y, z, 'ox', { dir: dirOf(ay, -ax), rollDist: 0 });
        ctx.globalAlpha = pa;
        // Boîte de clic = l'encre mesurée de la bande (de 0,12 à 0,87 de la frame en
        // largeur, de 0,10 à 0,91 en hauteur, frame posée à 0,82 au-dessus des pieds).
        const h = CM.TILE * z * 0.975 * AGENT_SCALE;
        if (ok) fdNoteThing(cow, { x0: p.x - h * 0.38, x1: p.x + h * 0.38, y0: p.y - h * 0.72, y1: p.y + h * 0.1 });
      },
    });
  };
  app.open = (t, again) => openCurio(app, t, again);
  return app;
}

// ── LE MIME ──────────────────────────────────────────────────────────────────
function buildMime(app) {
  const s = app.spot;
  const mime = figure(app, 0, s.x, s.y, { ct: 0, dir: s.face != null ? s.face : 2, cast: 0, variant: 11 });
  app.figs = [mime];
  app.actors = (now, out, alpha) => {
    pushFig(out, mime, app.band, alpha, (ctx, r) => {
      // Le visage blanc du mime (deux pixels), et ses mains contre la vitre invisible.
      const k = vieK();
      fdPixel(ctx, r.x, r.top + r.h * 0.12, [248, 248, 244], alpha);
      fdPixel(ctx, r.x + 3 * k, r.top + r.h * 0.4, [248, 248, 244], alpha);
      fdPixel(ctx, r.x + 3 * k, r.top + r.h * 0.48, [248, 248, 244], alpha);
    });
  };
  app.open = (t, again) => openCurio(app, t, again);
  return app;
}

// ── OÙ ─────────────────────────────────────────────────────────────────────────
const runs = (L) => roadRunSpots(L, 4).filter((r) => r.open >= 0).slice(0, 30);
export const FD_GAGS = {
  file: { build: buildFile, spots: (L) => runs(L) },
  citrouilles: { build: buildCitrouilles, spots: (L) => runs(L) },
  echelle: { build: buildEchelle, spots: (L, c, seed) => roofSpots(L, 1, seed) },
  sieste: {
    build: buildSieste,
    // On ne fait pas la sieste dans le blé sous la neige.
    when: () => CM.season !== WINTER,
    spots: (L, c, seed) => {
      const d = doorstepForType(L, 'irrigated_fields', seed);
      if (!d || !d.t) return lisiereSpots(L).slice(0, 10);
      // DANS le champ, près de son bord avant (on dort dans le blé, pas devant).
      const t = d.t, sx = t.spanX || 1, sy = t.spanY || 1;
      return [{ x: t.gx + sx - 0.9, y: t.gy + sy - 0.9, t, key: 'sieste:' + t.gx + ',' + t.gy, inField: true }];
    },
  },
  serenade: { build: buildSerenade, spots: (L, c, seed) => roofSpots(L, 1, seed) },
  cerfvolant: { build: buildCerfvolant, spots: (L) => treeSpots(L).slice(0, 20) },
  vache: { build: buildVache, spots: (L) => runs(L) },
  mime: { build: buildMime, spots: (L, c, seed, band) => plazaEdgeSpots(L, band).slice(0, 30) },
};
