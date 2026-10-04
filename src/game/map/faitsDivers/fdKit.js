"use strict";

// LES FAITS DIVERS — les outils communs aux scènes (docs/PLAN-FAITS-DIVERS.md).
//
// Une scène = une APPARITION : une histoire, un chapitre, un lieu tiré par fdSpots,
// et ce qu'il faut pour la peindre. Chaque constructeur (un module par histoire)
// remplit l'apparition :
//   figs     les cibles cliquables (personnages et choses), stables d'une frame à l'autre
//   actors   (now, out, alpha) → pousse un acteur du peintre par élément, à SA
//            profondeur (le feu entre les fidèles de devant et ceux de derrière)
//   open     (cible, encore) → { who, line, isNew, sub? } : la plaque de réplique
// Le metteur en scène (fdDirector.js) décide quand une scène naît et quand elle part.
import { CM } from '../layout.js';
import { depthOf } from '../iso/projection.js';
import { isoUnitDepthEx } from '../iso/isoUnits.js';
import { fdFigure, fdBlit } from './fdDraw.js';
import { fdHash } from './fdSpots.js';
import { fdInscrire } from '../../core/faitsDivers.js';

export const T = () => CM.TILE;
// Direction MONDE (0 est, 1 ouest, 2 sud, 3 nord) d'un vecteur (vue diagonale).
export const dirOf = (tx, ty) => (Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 0 : 1) : (ty > 0 ? 2 : 3));
// Le dos tourné à l'œil : la caméra regarde vers le nord-ouest, on lui montre le dos
// en regardant le nord (vu de dos à l'écran).
export const BACK_TO_EYE = 3;
export const unitD = (wx, wy) => isoUnitDepthEx(wx, wy).d;

// Un personnage de scène : cible cliquable + ce qu'il faut pour le peindre.
export function figure(app, i, x, y, o = {}) {
  return {
    app, i, kind: 'fig',
    wx: x * T(), wy: y * T(),
    ct: o.ct ?? 0, variant: o.variant ?? (fdHash(app.seed + ':v' + i) % 12),
    dir: o.dir ?? 2, sit: !!o.sit, walk: false, phase: (fdHash(app.seed + ':p' + i) % 1000) / 1000,
    cast: o.cast ?? i, who: o.who,
  };
}
// Une chose cliquable (le Feu, la tortue…), sans dessin d'habitant.
export function thing(app, i, x, y, cast) {
  return { app, i, kind: 'thing', wx: x * T(), wy: y * T(), cast };
}
export function pushFig(out, f, band, alpha, extra) {
  out.push({
    wx: f.wx, wy: f.wy, d: unitD(f.wx, f.wy),
    draw(ctx, now) {
      const r = fdFigure(ctx, f, band, now, alpha);
      if (r && extra) extra(ctx, r, now);
    },
  });
}
// Un décor posé au sol, trié à son pied (ε : juste devant/derrière ce qui partage sa case).
// `unit` : trié comme un PERSONNAGE à ce point (même relève devant les murs) — pour ce
// qui doit encadrer quelqu'un au plus près (la jarre de Diogène, sa lèvre).
export function pushProp(out, name, x, y, alpha, o = {}) {
  const wx = x * T(), wy = y * T();
  out.push({
    wx, wy, d: (o.unit ? unitD(wx, wy) : depthOf(wx, wy)) + (o.eps || 0),
    draw(ctx, now) {
      const box = fdBlit(ctx, name, o.frame ? o.frame(now) : 0, wx, wy, alpha, !!o.flip, o.lift || 0);
      if (o.after) o.after(ctx, box, now);
    },
  });
}
export function ringPoints(n, r, start = 0) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = start + (i / n) * Math.PI * 2;
    pts.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r });
  }
  return pts;
}

// La plaque d'un chapitre d'histoire : la réplique du personnage visé ; le premier
// clic sur la scène inscrit le chapitre. `sub` : une ligne de fiche facultative.
export function openStory(app, t, again, sub = null) {
  const ch = app.ch, story = app.story;
  const cast = ch.cast[Math.max(0, t.cast | 0) % ch.cast.length];
  let isNew = false;
  if (!app.inscribed && !app.rerun) {
    isNew = fdInscrire(story.id, ch.id, app.band);
    app.inscribed = true;
  }
  let line = cast.line;
  // Re-clic (ou scène rejouée) : une histoire qui a une réserve de répliques
  // (Diogène) en tire une, pour son personnage principal.
  if ((again || app.rerun || t.opened) && story.lines && story.lines.length && cast.ct === 0 && (t.cast | 0) === 0) {
    app.lineN = ((app.lineN ?? (fdHash(app.seed + ':l') % story.lines.length)) + 1) % story.lines.length;
    line = story.lines[app.lineN];
  }
  t.opened = true;
  return { who: cast.who, line, isNew, title: ch.title, sub };
}
