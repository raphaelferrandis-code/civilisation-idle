"use strict";

// LES FAITS DIVERS — les scènes (docs/PLAN-FAITS-DIVERS.md).
//
// Une scène = une APPARITION : une histoire, un chapitre, un lieu tiré par fdSpots,
// et ce qu'il faut pour la peindre. Chaque constructeur rend :
//   figs     les cibles cliquables (personnages et choses), stables d'une frame à l'autre
//   actors   (now, out, alpha) → pousse un acteur du peintre par élément, à SA
//            profondeur (le feu entre les fidèles de devant et ceux de derrière)
//   open     (cible, encore) → { who, line, isNew } : la carte de réplique
// Le metteur en scène (fdDirector.js) décide quand une scène naît et quand elle part.
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from '../iso/projection.js';
import { isoUnitDepthEx } from '../iso/isoUnits.js';
import { queueFlameGlow, FLAME_COL } from '../flameGlow.js';
import { vieK } from '../iso/isoVie.js';
import { fdBlit, fdFigure, fdPixel, fdRibbon, fdNoteThing } from './fdDraw.js';
import { fdHash, engineTilesByType, doorstepOf, doorstepForType } from './fdSpots.js';
import { fdFocus } from './fdPick.js';
import { fdInscrire, fdLoversInscrire, fdState } from '../../core/faitsDivers.js';
import { FD_STORIES } from '../../data/faitsDivers.js';
import { AMOUREUX, AMOUREUX_NAMES, AMOUREUX_PISTES, accordePiste } from '../../data/faitsDiversAmoureux.js';

const T = () => CM.TILE;
// Direction MONDE (0 est, 1 ouest, 2 sud, 3 nord) d'un vecteur (vue diagonale).
export const dirOf = (tx, ty) => (Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 0 : 1) : (ty > 0 ? 2 : 3));
const unitD = (wx, wy) => isoUnitDepthEx(wx, wy).d;

// Un personnage de scène : cible cliquable + ce qu'il faut pour le peindre.
function figure(app, i, x, y, o = {}) {
  return {
    app, i, kind: 'fig',
    wx: x * T(), wy: y * T(),
    ct: o.ct ?? 0, variant: o.variant ?? (fdHash(app.seed + ':v' + i) % 12),
    dir: o.dir ?? 2, sit: !!o.sit, walk: false, phase: (fdHash(app.seed + ':p' + i) % 1000) / 1000,
    cast: o.cast ?? i,
  };
}
// Une chose cliquable (le Feu…), sans dessin d'habitant.
function thing(app, i, x, y, cast) {
  return { app, i, kind: 'thing', wx: x * T(), wy: y * T(), cast };
}
function pushFig(out, f, band, alpha, extra) {
  out.push({
    wx: f.wx, wy: f.wy, d: unitD(f.wx, f.wy),
    draw(ctx, now) {
      const r = fdFigure(ctx, f, band, now, alpha);
      if (r && extra) extra(ctx, r, now);
    },
  });
}

// La carte d'un chapitre d'histoire : la réplique du personnage visé ; le premier
// clic sur la scène inscrit le chapitre.
function openStory(app, t, again) {
  const ch = app.ch, story = app.story;
  const cast = ch.cast[Math.max(0, t.cast | 0) % ch.cast.length];
  let isNew = false;
  if (!app.inscribed && !app.rerun) {
    isNew = fdInscrire(story.id, ch.id, app.band);
    app.inscribed = true;
  }
  let line = cast.line;
  // Re-clic : une histoire qui a une réserve de répliques (Diogène) en tire une.
  if ((again || app.rerun || t.opened) && story.lines && story.lines.length && cast.ct === 0 && t.cast === 0) {
    app.lineN = ((app.lineN ?? (fdHash(app.seed + ':l') % story.lines.length)) + 1) % story.lines.length;
    line = story.lines[app.lineN];
  }
  t.opened = true;
  return { who: cast.who, line, isNew, title: ch.title };
}

// ── 1. LA SECTE DU FEU QUI PARLE ────────────────────────────────────────────
// Un cercle de fidèles autour d'un feu, à la lisière, la nuit. Le décor change
// d'âge en âge (pierres levées, temple, chaudière, enseigne, étoile), le cercle
// reste. Assis par terre tant qu'il y a un feu à veiller.
function ringPoints(n, r, start = 0) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = start + (i / n) * Math.PI * 2;
    // Le sol iso est un losange : un cercle en MONDE se voit en ellipse à l'écran.
    pts.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r });
  }
  return pts;
}
function buildSecte(app) {
  const { x, y } = app.spot;
  const st = app.ch.stage | 0;
  const people = app.ch.cast.map((c, i) => ({ c, i })).filter((e) => e.c.ct >= 0);
  const N = [6, 12, 5, 6, 8, 6, 6][st] || 6;
  const R = [0.55, 0.9, 0.95, 0.8, 0.9, 0.7, 0.62][st] || 0.7;
  const sit = st === 0 || st === 1 || st === 5 || st === 6;
  const figs = [];
  // Âge du Marbre : le temple occupe le centre, les fidèles se tiennent devant lui
  // (moitié sud du cercle, celle qu'on voit) ; l'oracle au plus près.
  const start = st === 2 ? Math.PI * 0.08 : (fdHash(app.seed + ':a') % 628) / 100;
  const span = st === 2 ? Math.PI * 0.84 : Math.PI * 2;
  for (let i = 0; i < N; i += 1) {
    const a = start + (span === Math.PI * 2 ? (i / N) * span : (i / Math.max(1, N - 1)) * span);
    let dx = Math.cos(a) * R, dy = Math.sin(a) * R;
    // Un fidèle de l'âge stellaire regarde le ciel : tous tournés vers le nord.
    const e = people[i % people.length];
    const dir = st === 5 ? 3 : dirOf(-dx, -dy);
    if (st === 5) { dx *= 1.1; dy = dy * 0.6 + 0.25; }
    figs.push(figure(app, i, x + dx, y + dy, { ct: e.c.ct, dir, sit, cast: e.i }));
  }
  // Le Feu qui parle (âge du Démiurge) : la seule chose qui dit quelque chose.
  const fireCast = app.ch.cast.findIndex((c) => c.ct < 0);
  const fire = fireCast >= 0 ? thing(app, N, x, y, fireCast) : null;
  if (fire) figs.push(fire);
  // Les pierres levées (âges de la Pierre et du Démiurge) : huit, en couronne.
  const stones = st === 1 || st === 6 ? ringPoints(8, st === 1 ? 1.42 : 1.2, 0.2).map((p, i) => ({ x: x + p.dx, y: y + p.dy, v: i % 2 })) : [];
  const phase = (fdHash(app.seed + ':f') % 1000) / 100;

  app.figs = figs;
  app.actors = (now, out, alpha) => {
    const band = app.band;
    for (const f of figs) {
      if (f.kind !== 'fig') continue;
      pushFig(out, f, band, alpha);
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
          fdPixel(ctx, p.x - k, sy, [255, 236, 190], alpha * tw * 0.5);
          fdPixel(ctx, p.x + k, sy, [255, 236, 190], alpha * tw * 0.5);
          fdPixel(ctx, p.x, sy - k, [255, 236, 190], alpha * tw * 0.5);
          fdPixel(ctx, p.x, sy + k, [255, 236, 190], alpha * tw * 0.5);
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

// ── NANCY ET WILLIAM ─────────────────────────────────────────────────────────
// L'un des deux attend devant un bâtiment et regarde autour de lui (il tourne la
// tête toutes les quelques secondes) : on le remarque à ce qu'il ATTEND, au milieu
// des passants qui passent. La moitié d'un ruban rouge au poignet.
const LOVER_VARIANT = { nancy: 3, william: 5 };
// Le prochain bâtiment désigné par une piste : un type présent en ville, autre que
// celui d'ici et que les deux derniers.
export function chooseNextType(L, here, seed) {
  const by = engineTilesByType(L);
  const L2 = fdState().lovers;
  const avoid = new Set([here, L2.next, L2.first].filter(Boolean));
  const types = [...by.keys()].filter((tp) => AMOUREUX_PISTES[tp] && !avoid.has(tp) && by.get(tp).some((t) => doorstepOf(L, t)));
  if (!types.length) return AMOUREUX_PISTES[here] && here !== L2.next ? here : null;
  types.sort((a, b) => fdHash(seed + a) - fdHash(seed + b));
  return types[0];
}
// La réplique d'un rendez-vous, piste comprise : { fr, en }.
function loverLine(step, who, nextType, piste, otherFem) {
  const base = step.lines[who] || { fr: '', en: '' };
  if (!step.clue || !nextType) return base;
  const set = AMOUREUX_PISTES[nextType] || AMOUREUX_PISTES.place;
  const p = set[piste % set.length];
  return {
    fr: base.fr + ' ' + accordePiste(p.fr, otherFem, 'fr'),
    en: base.en + ' ' + accordePiste(p.en, otherFem, 'en'),
  };
}
function buildLoverSolo(app) {
  const { x, y } = app.spot;
  const who = app.who;
  const ct = who === 'nancy' ? 1 : 0;
  const f = figure(app, 0, x, y, { ct, variant: LOVER_VARIANT[who], dir: app.spot.face === 1 ? 0 : 2, cast: 0 });
  app.figs = [f];
  const look = [2, 0, 3, 1];
  app.actors = (now, out, alpha) => {
    // Il regarde autour de lui : un quart de tour toutes les 3,5 s (à graine).
    const k = Math.floor(now / 3500 + (fdHash(app.seed + ':t') % 7));
    f.dir = fdFocus() === f ? (app.spot.face === 1 ? 0 : 2) : look[(k + (fdHash(app.seed + ':k' + k) % 2)) % 4];
    pushFig(out, f, app.band, alpha, (ctx, r) => fdRibbon(ctx, r, f.dir === 1 || f.dir === 3 ? -1 : 1));
  };
  app.open = () => {
    const fd = fdState();
    const L = CM.layout;
    const step = app.step;
    const name = AMOUREUX_NAMES[who];
    // Le rendez-vous de cette scène est déjà passé (rechargement, double clic) :
    // on redit ce qui a été dit.
    if (app.line) return { who: name, line: app.line, isNew: false, title: step.title };
    if (AMOUREUX.steps[fd.lovers.step] !== step) {
      app.line = step.lines[who];
      return { who: name, line: app.line, isNew: false, title: step.title };
    }
    const otherFem = who !== 'nancy';
    const next = step.clue ? chooseNextType(L, app.spot.type, app.seed + ':n') : null;
    const piste = fdHash(app.seed + ':pv') % 2;
    app.line = loverLine(step, who, next, piste, otherFem);
    if (app.collapsed) app.line = { fr: AMOUREUX.afterCollapse.fr + ' ' + app.line.fr, en: AMOUREUX.afterCollapse.en + ' ' + app.line.en };
    const isNew = fdLoversInscrire(step.id, app.band, { type: app.spot.type, place: app.spot.key, next, piste });
    return { who: name, line: app.line, isNew, title: step.title };
  };
  return app;
}
// Où attend celui qu'on cherche : un bâtiment au hasard, ou celui de la piste.
export function loverSpot(L, step, seed) {
  const fd = fdState();
  if (step.where === 'piste' && fd.lovers.next) {
    const d = doorstepForType(L, fd.lovers.next, seed);
    if (d) return d;
  }
  // Au hasard (ou piste introuvable : la ville a changé) — un type tiré à la graine.
  const by = engineTilesByType(L);
  const types = [...by.keys()].filter((tp) => AMOUREUX_PISTES[tp]);
  types.sort((a, b) => fdHash(seed + a) - fdHash(seed + b));
  for (const tp of types) {
    const d = doorstepForType(L, tp, seed);
    if (d) return d;
  }
  return null;
}

// ── LES CONSTRUCTEURS ────────────────────────────────────────────────────────
// `kind` → { build(app), spot(L, cand, seed) } ; seules les scènes écrites ici
// apparaissent : une histoire sans scène attend simplement son lot.
export const FD_BUILDERS = {
  secte: { build: buildSecte },
};
export function buildersFor(cand) {
  if (cand.kind === 'story') return FD_BUILDERS[cand.story.id] || null;
  if (cand.kind === 'lovers') {
    const w = cand.step.who;
    if ((w === 'nancy' || w === 'william') && (cand.step.where === 'hasard' || cand.step.where === 'piste')) {
      return { build: buildLoverSolo, lover: w };
    }
    return null;
  }
  return null;
}
// Un chapitre d'histoire déjà vu, rejoué pour l'ambiance (le cercle est encore là,
// d'autres nuits) : même scène, sans inscription.
export function storyApp(base, story, ch) {
  return { ...base, story, ch, stage: ch.stage | 0 };
}
export { FD_STORIES };
