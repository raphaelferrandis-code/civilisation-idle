"use strict";

// NANCY ET WILLIAM (docs/PLAN-FAITS-DIVERS.md §3.9, data/faitsDiversAmoureux.js).
//
// Celui qu'on cherche attend devant un bâtiment et regarde autour de lui : on le
// remarque à ce qu'il ATTEND, au milieu des passants qui passent. La moitié d'un ruban
// rouge au poignet — leur seul signe. Quand on le trouve, il parle de l'autre, et ce
// qu'il en dit désigne le bâtiment où l'autre attend vraiment (la PISTE).
// Les rendez-vous à deux (retrouvailles, dispute), le couple séparé (deux scènes à la
// fois : on trouve l'un, puis l'autre — le joueur fait le messager sans le savoir),
// le mariage sur une place, et des années plus tard, le banc au bord de l'eau.
import { CM } from '../layout.js';
import { fdRibbon, fdPixel } from './fdDraw.js';
import { vieK } from '../iso/isoVie.js';
import {
  fdHash, engineTilesByType, doorstepOf, doorstepForType, fdFootprints, plazaEdgeSpots, bankSpots,
} from './fdSpots.js';
import { fdFocus } from './fdPick.js';
import { dirOf, figure, pushFig, pushProp } from './fdKit.js';
import { fdLoversInscrire, fdState, fdProgress } from '../../core/faitsDivers.js';
import { FD_STORIES } from '../../data/faitsDivers.js';
import { drawInstrument, drawNotes, INSTR_STAGE_OF_BAND } from './fdMusicien.js';
import { jouerMelodieScene } from '../../audio/melodieScene.js';
import { AMOUREUX, AMOUREUX_NAMES, AMOUREUX_PISTES, accordePiste } from '../../data/faitsDiversAmoureux.js';

const LOVER_VARIANT = { nancy: 3, william: 5 };
const OTHER = { nancy: 'william', william: 'nancy' };
const FACE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const nameOf = (who) => ({ fr: AMOUREUX_NAMES[who].fr, en: AMOUREUX_NAMES[who].en });

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

// Cette scène est-elle encore attendue par l'histoire ? (le rendez-vous courant, ou
// l'autre moitié du couple séparé). Une scène déjà trouvée reste jusqu'à sa fin.
export function loverAppWanted(app) {
  if (app.said && Object.keys(app.said).length) return true;
  const fd = fdState();
  const cur = AMOUREUX.steps[fd.lovers.step];
  if (!cur) return false;
  if (cur === app.step) return true;
  return cur.who === 'second' && app.step.who === 'first' && app.who !== fd.lovers.firstFound;
}

// Le clic sur l'un des deux. Le premier clic sur le rendez-vous en cours l'inscrit ;
// ensuite, chacun redit ce qu'il a dit.
function openLover(app, who) {
  const fd = fdState();
  const Ls = fd.lovers;
  const cur = AMOUREUX.steps[Ls.step];
  const said = app.said || (app.said = {});
  if (said[who]) return { who: nameOf(who), line: said[who], isNew: false };
  let st = null;
  if (cur && cur === app.step) st = cur;
  else if (cur && cur.who === 'second' && app.step.who === 'first' && who !== Ls.firstFound) st = cur;
  if (!st) {
    said[who] = app.step.lines[who] || app.step.lines[OTHER[who]];
    return { who: nameOf(who), line: said[who], isNew: false };
  }
  let next = null, piste = 0;
  if (st.clue) {
    next = chooseNextType(CM.layout, app.spot.type, app.seed + ':n');
    piste = fdHash(app.seed + ':pv') % 2;
  }
  let line = loverLine(st, who, next, piste, who !== 'nancy');
  if (app.collapsed) line = { fr: AMOUREUX.afterCollapse.fr + ' ' + line.fr, en: AMOUREUX.afterCollapse.en + ' ' + line.en };
  const rec = { type: app.spot.type || null, place: app.spot.key, next, piste };
  if (st.who === 'first') rec.firstFound = who;
  const isNew = fdLoversInscrire(st.id, app.band, rec);
  said[who] = line;
  return { who: nameOf(who), line, isNew };
}

function loverFig(app, i, who, x, y, dir, sit = false) {
  return figure(app, i, x, y, { ct: who === 'nancy' ? 1 : 0, variant: LOVER_VARIANT[who], dir, sit, cast: 0, who });
}
const ribbonSide = (f) => (f.dir === 1 || f.dir === 3 ? -1 : 1);

// ── SEUL(E), À ATTENDRE ──────────────────────────────────────────────────────
function buildSolo(app) {
  const { x, y } = app.spot;
  const who = app.who;
  const rest = app.spot.face === 1 ? 0 : 2;
  const f = loverFig(app, 0, who, x, y, rest);
  app.figs = [f];
  const look = [2, 0, 3, 1];
  app.actors = (now, out, alpha) => {
    // Il regarde autour de lui : un quart de tour toutes les 3,5 s (à graine). On lui
    // parle : il nous regarde.
    const k = Math.floor(now / 3500 + (fdHash(app.seed + ':t') % 7));
    f.dir = fdFocus() === f ? rest : look[(k + (fdHash(app.seed + ':k' + k) % 2)) % 4];
    pushFig(out, f, app.band, alpha, (ctx, r) => fdRibbon(ctx, r, ribbonSide(f)));
  };
  app.open = (t) => openLover(app, t.who);
  return app;
}

// ── À DEUX : ENFIN, LA DISPUTE, LES RETROUVAILLES ────────────────────────────
function buildDuo(app) {
  const { x, y } = app.spot;
  const [fx, fy] = FACE[app.spot.face != null ? app.spot.face : 2];
  const sx = -fy, sy = fx;
  const apart = app.step.id === 'dispute';
  const n = loverFig(app, 0, 'nancy', x - sx * 0.2, y - sy * 0.2, apart ? dirOf(-sx, -sy) : dirOf(sx, sy));
  const w = loverFig(app, 1, 'william', x + sx * 0.2, y + sy * 0.2, apart ? dirOf(sx, sy) : dirOf(-sx, -sy));
  app.figs = [n, w];
  app.actors = (now, out, alpha) => {
    pushFig(out, n, app.band, alpha, (ctx, r) => fdRibbon(ctx, r, ribbonSide(n)));
    pushFig(out, w, app.band, alpha, (ctx, r) => fdRibbon(ctx, r, ribbonSide(w)));
  };
  app.open = (t) => openLover(app, t.who);
  return app;
}

// ── LE MARIAGE ───────────────────────────────────────────────────────────────
// Sur le bord d'une place : le couple face à face, les invités en petits groupes
// lâches de part et d'autre (jamais un cercle — « ça fait secte »), tournés vers eux.
function buildWedding(app) {
  const { x, y } = app.spot;
  const [fx, fy] = FACE[app.spot.face != null ? app.spot.face : 2];
  const sx = -fy, sy = fx;
  const n = loverFig(app, 0, 'nancy', x - sx * 0.18, y - sy * 0.18, dirOf(sx, sy));
  const w = loverFig(app, 1, 'william', x + sx * 0.18, y + sy * 0.18, dirOf(-sx, -sy));
  const guests = app.step.guests || [];
  // Deux grappes : trois à gauche, deux à droite, à des distances inégales.
  const slots = [[-0.85, 0.18], [-1.15, -0.05], [-1.0, 0.42], [0.9, 0.12], [1.2, 0.36]];
  const gfigs = guests.map((g, i) => {
    const [a, b] = slots[i % slots.length];
    const gx = x + sx * a + fx * b, gy = y + sy * a + fy * b;
    return figure(app, 2 + i, gx, gy, { ct: g.ct, dir: dirOf(x - gx, y - gy), cast: i, who: 'guest' });
  });
  // Les invités venus d'autres histoires (si on les a rencontrées) : le musicien, qui
  // joue ; Diogène, assis dans son tonneau à l'écart, qui regarde.
  const cameos = [];
  const cm = app.step.cameos || {};
  if (cm.musicien && fdProgress(FD_STORIES.musicien).n > 0) {
    const m = figure(app, 20, x + sx * 1.45 - fx * 0.1, y + sy * 1.45 - fy * 0.1, { ct: 0, dir: dirOf(-sx, -sy), cast: 0, variant: 5, who: 'cameo' });
    m.say = cm.musicien; m.music = true;
    cameos.push(m);
  }
  if (cm.cynique && fdProgress(FD_STORIES.cynique).n > 0) {
    const d = figure(app, 21, x - sx * 1.7 + fx * 0.2, y - sy * 1.7 + fy * 0.2, { ct: 0, dir: 2, sit: true, cast: 0, variant: 6, who: 'cameo' });
    d.say = cm.cynique; d.lift = 2; d.logis = true;
    cameos.push(d);
  }
  app.figs = [n, w, ...gfigs, ...cameos];
  const petals = [[226, 120, 150], [250, 244, 236], [238, 196, 90], [214, 92, 120]];
  app.actors = (now, out, alpha) => {
    for (const c of cameos) {
      if (c.logis) {
        pushProp(out, 'tonneau', c.wx / CM.TILE, c.wy / CM.TILE, alpha, { unit: true, eps: -0.01 });
        pushProp(out, 'tonneau', c.wx / CM.TILE, c.wy / CM.TILE, alpha, { unit: true, eps: 0.01, frame: () => 1 });
      }
      pushFig(out, c, app.band, alpha, c.music ? (ctx, r, nowD) => {
        drawInstrument(ctx, r, INSTR_STAGE_OF_BAND[Math.max(0, Math.min(9, app.band))], alpha, c.dir === 1 || c.dir === 2 ? -1 : 1);
        drawNotes(ctx, r, nowD, 0.3, alpha);
      } : null);
    }
    // L'arche fleurie, juste derrière le couple (c'est elle qui dit « mariage »).
    pushProp(out, 'arche', x - fx * 0.18, y - fy * 0.18, alpha, { unit: true, eps: -0.02 });
    pushFig(out, n, app.band, alpha, (ctx, r) => fdRibbon(ctx, r, ribbonSide(n)));
    pushFig(out, w, app.band, alpha, (ctx, r, nowD) => {
      fdRibbon(ctx, r, ribbonSide(w));
      // Des pétales qui tombent sur eux, en boucle (un pixel d'art chacun).
      const k = vieK();
      for (let i = 0; i < 9; i += 1) {
        const u = ((nowD / 2600) + i / 9) % 1;
        const px = r.x - 14 * k + ((i * 37) % 28) * k + Math.sin(u * 6.28 + i) * 2 * k;
        const py = r.top - 10 * k + u * 22 * k;
        fdPixel(ctx, px, py, petals[i % petals.length], alpha * (u < 0.85 ? 1 : (1 - u) / 0.15));
      }
    });
    for (const g of gfigs) pushFig(out, g, app.band, alpha);
  };
  app.open = (t) => {
    if (t.who === 'cameo') {
      const cur0 = AMOUREUX.steps[fdState().lovers.step];
      let isNew0 = false;
      if (cur0 === app.step && !(app.said && Object.keys(app.said).length)) {
        isNew0 = fdLoversInscrire(cur0.id, app.band, { place: app.spot.key });
        app.said = app.said || {};
        app.said.cameo = t.say.line;
      }
      if (t.music) { try { jouerMelodieScene(app.band); } catch { /* sans son */ } }
      return { who: t.say.who, line: t.say.line, isNew: isNew0 };
    }
    if (t.who !== 'guest') return openLover(app, t.who);
    // Un invité : il dit la sienne ; le premier clic inscrit aussi le mariage.
    const g = guests[t.cast % guests.length];
    let isNew = false;
    const cur = AMOUREUX.steps[fdState().lovers.step];
    if (cur === app.step && !(app.said && Object.keys(app.said).length)) {
      isNew = fdLoversInscrire(cur.id, app.band, { place: app.spot.key });
      app.said = app.said || {};
      app.said.guest = g.line;
    }
    return { who: g.who, line: g.line, isNew };
  };
  return app;
}

// ── LE BANC ──────────────────────────────────────────────────────────────────
// Au bord de l'eau, au soir : assis côte à côte, tournés vers le fleuve.
function buildBench(app) {
  const { x, y } = app.spot;
  const face = app.spot.face != null ? app.spot.face : 2;
  // (+0,1 ; −0,1) en monde = un pas vers la droite de l'écran : le banc est vu de face,
  // les deux s'y tiennent côte à côte, un rien derrière lui (il leur cache les jambes).
  const n = loverFig(app, 0, 'nancy', x - 0.09 - 0.05, y + 0.09 - 0.05, face, true);
  const w = loverFig(app, 1, 'william', x + 0.09 - 0.05, y - 0.09 - 0.05, face, true);
  app.figs = [n, w];
  app.actors = (now, out, alpha) => {
    pushFig(out, n, app.band, alpha, (ctx, r) => fdRibbon(ctx, r, ribbonSide(n)));
    pushFig(out, w, app.band, alpha, (ctx, r) => fdRibbon(ctx, r, ribbonSide(w)));
    pushProp(out, 'banc', x, y, alpha, { unit: true, eps: 0.02 });
  };
  app.open = (t) => openLover(app, t.who);
  return app;
}

// ── OÙ ─────────────────────────────────────────────────────────────────────────
function doorstepsOfType(L, type, seed) {
  const list = (engineTilesByType(L).get(type) || []).map((t) => doorstepOf(L, t, seed)).filter(Boolean);
  // Les seuils les mieux dégagés vers l'avant d'abord (fdSpots.openFront).
  return list.sort((a, b) => (b.open - a.open) || (fdHash(seed + a.key) - fdHash(seed + b.key)));
}
function randomDoorsteps(L, seed, n = 8) {
  const by = engineTilesByType(L);
  const types = [...by.keys()].filter((tp) => AMOUREUX_PISTES[tp]);
  types.sort((a, b) => fdHash(seed + a) - fdHash(seed + b));
  const out = [];
  for (const tp of types) {
    const d = doorstepForType(L, tp, seed);
    if (d) out.push(d);
    if (out.length >= n) break;
  }
  return out;
}
// Le seuil d'un endroit retenu par sa clé « door:gx,gy », s'il existe encore.
function doorstepAtKey(L, keyStr, seed) {
  const m = /^door:(-?\d+),(-?\d+)$/.exec(keyStr || '');
  if (!m) return null;
  const t = fdFootprints(L).get(m[1] + ',' + m[2]);
  return t && t.type === 'engine' ? doorstepOf(L, t, seed) : null;
}
function spots(L, c, seed, band) {
  const st = c.step;
  const Ls = fdState().lovers;
  if (st.where === 'piste' && Ls.next) {
    const list = doorstepsOfType(L, Ls.next, seed);
    if (list.length) return list;
  }
  if (st.where === 'meme') {
    const d = doorstepAtKey(L, Ls.place, seed);
    if (d) return [d];
  }
  if (st.where === 'premier') {
    const d = doorstepAtKey(L, Ls.firstPlace, seed);
    if (d) return [d];
    if (Ls.first) {
      const list = doorstepsOfType(L, Ls.first, seed);
      if (list.length) return list;
    }
  }
  if (st.where === 'mariage') {
    const p = plazaEdgeSpots(L, band).filter((s) => s.main);
    if (p.length) return p.slice(0, 20);
    const b = bankSpots(L);
    if (b.length) return b.slice(0, 10);
  }
  if (st.where === 'banc') {
    const b = bankSpots(L);
    if (b.length) return b.slice(0, 20);
    const p = plazaEdgeSpots(L, band);
    if (p.length) return p.slice(0, 20);
  }
  return randomDoorsteps(L, seed);
}

// Le constructeur d'un rendez-vous. `pair` : deux scènes à la fois (Nancy et William,
// chacun de son côté) ; `lover` : qui attend, pour une scène à une personne.
export function loversSceneFor(step) {
  const fd = fdState();
  if (step.who === 'first') return { build: buildSolo, spots, pair: true };
  if (step.who === 'second') {
    const ff = fd.lovers.firstFound;
    return ff ? { build: buildSolo, spots, lover: OTHER[ff] } : null;
  }
  if (step.who === 'nancy' || step.who === 'william') return { build: buildSolo, spots, lover: step.who };
  if (step.where === 'mariage') return { build: buildWedding, spots };
  if (step.where === 'banc') return { build: buildBench, spots };
  return { build: buildDuo, spots };
}
