"use strict";

// LE CYNIQUE — Diogène, poussé à fond (docs/PLAN-FAITS-DIVERS.md §3.4).
// Une anecdote vraie par âge, transposée : la jarre, l'écuelle jetée, la main tendue
// à une statue, le tonneau et le soleil, le poulet plumé de Platon, la marche à
// reculons, la lanterne en plein midi, l'esprit débranché, la capsule… et au Démiurge,
// le joueur qui joue Alexandre. Un chien le suit partout (« cynique » vient de
// « chien »). Il se tient au BORD des places, là où les flâneurs ne s'arrêtent pas.
// Gag de fiche : sa plaque dit son logis (une jarre, un tonneau… le monde), et
// quand on le regarde, il nous tourne le dos.
import { worldToScreen } from '../iso/projection.js';
import { vieK, vieSprite, vieBlit } from '../iso/isoVie.js';
import { queueFlameGlow, FLAME_COL } from '../flameGlow.js';
import { fdBlitScreen, fdPixel } from './fdDraw.js';
import { fdHash, plazaEdgeSpots, roadRunSpots, doorstepForType, hearthSpot, lisiereSpots } from './fdSpots.js';
import { fdFocus } from './fdPick.js';
import { T, dirOf, BACK_TO_EYE, figure, pushFig, pushProp, openStory, unitD } from './fdKit.js';

// Son dessin d'habitant, âge par âge : le plus proche d'un ascète (agents.js, l'ordre des
// listes `men`) — le second chasseur au Feu et au Bois, le MOINE au Moyen Âge, le citoyen
// en toge à Rome (pas le légionnaire : retour de Raph sur le tonneau), l'homme en sweat
// au Néon, l'astronome à l'âge stellaire, le moine blanc au Démiurge.
const DIOGENE_BY_BAND = [1, 1, 2, 2, 0, 0, 1, 0, 0, 2];
export const diogeneVariant = (band) => DIOGENE_BY_BAND[Math.max(0, Math.min(9, band | 0))];
// Dans son logis (debout, fdArt) : il se découpe au bord haut de la lèvre de devant,
// 9 pixels d'art au-dessus du pied, et il en reste 45 % dedans — la tête et les épaules
// dépassent, comme sur les gravures. Ses mains se posent sur le bord.
export const LOGIS_LIFT = 9, LOGIS_SINK = 0.45;
const SKIN = [222, 168, 124];
export function drawLogisHands(ctx, box, alpha) {
  if (!box) return;
  const k = vieK();
  // Posées sur le bord, de part et d'autre de son buste, sur l'ouverture SOMBRE (sur le
  // bois clair, elles se perdaient).
  const cx = (box.x0 + box.x1) / 2, y = box.y0 + 3.5 * k;
  fdPixel(ctx, cx - 2 * k, y, SKIN, alpha);
  fdPixel(ctx, cx + 2 * k, y, SKIN, alpha);
}
const FACE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Son logis, selon l'âge — la ligne de fiche qui le résume mieux qu'un long discours.
const LOGIS = [
  { fr: 'une jarre', en: 'a jar' }, null, null,
  { fr: 'un tonneau', en: 'a barrel' }, null, null, null, null,
  { fr: 'une capsule', en: 'a capsule' },
  { fr: 'un tonneau', en: 'a barrel' },
];
function subOf(st) {
  const l = LOGIS[st] || { fr: 'le monde', en: 'the world' };
  return {
    fr: `Logis : ${l.fr} · Humeur : parfaitement content`,
    en: `Home: ${l.en} · Mood: perfectly content`,
  };
}

// Le chien : assis à côté de lui, ou qui trotte quand il marche.
function pushDog(out, x, y, alpha, o = {}) {
  const wx = x * T(), wy = y * T();
  out.push({
    wx, wy, d: unitD(wx, wy),
    draw(ctx, now) {
      const p = worldToScreen(wx, wy);
      const spr = o.walk
        ? vieSprite('dog', Math.floor(now / 120) % 2, !!o.left)
        : vieSprite('dogSit', 0, !!o.left);
      vieBlit(ctx, spr, p.x, p.y, vieK(), alpha);
    },
  });
}

function buildCynique(app) {
  const st = app.ch.stage | 0;
  const s = app.spot;
  const [fx, fy] = FACE[s.face != null ? s.face : 2];
  const sx = -fy, sy = fx;                      // le côté (perpendiculaire au regard)
  const x = s.x, y = s.y;
  const sit = st === 0 || st === 3 || st === 7 || st === 8 || st === 9;
  const logis = st === 0 ? 'jarre' : st === 3 || st === 9 ? 'tonneau' : st === 8 ? 'capsuleLogis' : null;
  const D = figure(app, 0, x, y, { ct: 0, variant: diogeneVariant(app.band), dir: logis ? 2 : (s.face != null ? s.face : 2), sit, cast: 0 });
  if (logis) { D.lift = LOGIS_LIFT; D.sink = LOGIS_SINK; }
  const figs = [D];
  let other = null;
  if (st === 1) {
    // L'enfant qui boit dans ses mains, accroupi un peu plus loin.
    other = figure(app, 1, x + sx * 0.4 + fx * 0.1, y + sy * 0.4 + fy * 0.1, { ct: 2, dir: dirOf(-sx, -sy), sit: true, cast: 1 });
    D.dir = dirOf(sx, sy);
  } else if (st === 4) {
    // Le savant de l'Académie, face à lui.
    other = figure(app, 1, x + sx * 0.42, y + sy * 0.42, { ct: 0, dir: dirOf(-sx, -sy), cast: 1, variant: (diogeneVariant(app.band) + 1) % 4 });
    D.dir = dirOf(sx, sy);
  } else if (st === 2) {
    D.dir = dirOf(sx, sy);                      // vers la statue
  }
  if (other) figs.push(other);
  const run = st === 5 ? s : null;              // la rue où il marche à reculons
  const phase = (fdHash(app.seed + ':ph') % 1000) / 1000;

  app.figs = figs;
  app.actors = (now, out, alpha) => {
    const band = app.band;
    const looked = fdFocus() === D;
    // ── la marche à reculons : un aller-retour le long de la rue, le dos devant.
    if (run) {
      const span = Math.max(1, (run.len || 4) - 1) * 0.8;
      const speed = 0.32;                        // cases par seconde : il ne se presse pas
      const tt = now / 1000 * speed / span + phase * 2;
      const tri = tt % 2 < 1 ? tt % 2 : 2 - (tt % 2);
      const dirSign = tt % 2 < 1 ? 1 : -1;
      const u = (tri - 0.5) * span;
      const px = run.x + run.ax * u, py = run.y + run.ay * u;
      D.wx = px * T(); D.wy = py * T();
      D.walk = true;
      D.dist = now / 1000 * speed * T();
      // Il avance dans un sens… en regardant l'autre.
      D.dir = dirOf(-run.ax * dirSign, -run.ay * dirSign);
      pushFig(out, D, band, alpha);
      pushDog(out, px + run.ax * dirSign * 0.45 + run.ay * 0.2, py + run.ay * dirSign * 0.45 + run.ax * 0.2, alpha, { walk: true, left: worldToScreen(run.ax * dirSign, run.ay * dirSign).x < worldToScreen(0, 0).x });
      return;
    }
    // ── les décors derrière lui : jarre, tonneau, capsule.
    // Son logis : le fond AVANT lui, le corps APRÈS (il est assis dedans).
    if (logis) {
      pushProp(out, logis, x, y, alpha, { unit: true, eps: -0.01 });
      pushProp(out, logis, x, y, alpha, { unit: true, eps: 0.01, frame: () => 1, after: (ctx, box) => drawLogisHands(ctx, box, alpha) });
    }
    if (st === 2) pushProp(out, 'statue', x + sx * 0.36 - fx * 0.08, y + sy * 0.36 - fy * 0.08, alpha);
    if (st === 1) pushProp(out, 'ecuelle', x + fx * 0.14 + sx * 0.12, y + fy * 0.14 + sy * 0.12, alpha);
    // On le regarde : il nous tourne le dos (« Ôte-toi de mon soleil »).
    const baseDir = D.dir;
    if (looked && (st === 3 || st === 9 || st === 0 || st === 8)) D.dir = BACK_TO_EYE;
    // La lanterne : il cherche — un quart de tour toutes les 4 s.
    if (st === 6 && !looked) D.dir = [2, 0, 3, 1][Math.floor(now / 4000 + phase * 4) % 4];
    pushFig(out, D, band, alpha, (ctx, r, nowD) => {
      const k = vieK();
      const side = D.dir === 1 || D.dir === 2 ? -1 : 1;
      if (st === 4) fdBlitScreen(ctx, 'poulet', 0, r.x + side * r.w * 0.17, r.top + r.h * 0.3, alpha);
      if (st === 6) {
        const lx = r.x + side * r.w * 0.2, ly = r.top + r.h * 0.62;
        fdBlitScreen(ctx, 'lanterne', 0, lx, ly, alpha);
        queueFlameGlow(lx, ly - 2 * k, 7 * k / 1.135, FLAME_COL, nowD, phase, 0.45);
      }
      if (st === 8) {
        // L'étoile vers laquelle la capsule est tournée.
        const tw = 0.55 + 0.45 * Math.sin(nowD / 380 + phase * 6);
        fdPixel(ctx, r.x, r.top - 30 * k, [255, 246, 214], alpha * tw);
      }
    });
    D.dir = baseDir;
    if (other) pushFig(out, other, band, alpha);
    if (st !== 4 && st !== 1) pushDog(out, x + sx * 0.3 + fx * 0.12, y + sy * 0.3 + fy * 0.12, alpha, { left: worldToScreen(sx, sy).x > worldToScreen(0, 0).x });
  };
  app.open = (t, again) => openStory(app, t, again, t === D ? subOf(st) : null);
  return app;
}

// Où le trouver : au bord d'une place ; devant l'Académie pour le poulet ; dans une
// rue droite pour la marche à reculons ; au village (pas encore de place), près du feu.
function spots(L, c, seed, band) {
  const st = c.ch.stage | 0;
  const plaza = plazaEdgeSpots(L, band);
  if (st === 4) {
    const d = doorstepForType(L, 'academies', seed);
    if (d) return [{ ...d, face: d.face === 1 ? 0 : 2 }];
  }
  if (st === 5) {
    const runs = roadRunSpots(L, 4);
    if (runs.length) return runs.slice(0, 30);
  }
  if (plaza.length) return plaza.slice(0, 40);
  const h = hearthSpot(L);
  if (h) return [{ x: h.x + 0.6, y: h.y - 0.4, key: h.key + ':cyn', face: 1 }];
  return lisiereSpots(L).slice(0, 20).map((s) => ({ ...s, face: 2 }));
}

export const CYNIQUE_SCENE = { build: buildCynique, spots };
