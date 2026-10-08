"use strict";

// LES FIGURES DE LA CHRONIQUE DANS LA RUE (docs/PLAN-ECOUTER-PARLER.md, lot 6, § 7.4).
//
// Dès la période 3 de la gazette, Claude, Edith, Raphaël, Khael et Aldric vivent dans la
// cité. Ce sont des passants de la rue (CM.citizens) : la fiche, l'écoute, les signes et la
// parole les prennent comme les autres. Ils sont faits ici, d'aucun foyer : leur prénom,
// leur caractère, le métier que leur signature donne dans la gazette à cette période, leur
// dessin à cet âge (data/parolesFigures.js), un logis et un atelier à eux. Ils portent
// `p.chronique` (leur clé) et `identity.chronique` : pick.js ne leur donne que leurs mots,
// et la fiche ne leur refait pas une identité de passant (citizenFocus.citizenIdentityOf).
// Ils vivent comme les autres (le travail, la place, le logis le soir, la nuit chez eux), en
// tête de la foule : la baisse de la cible (la pluie) renvoie chez eux les derniers venus,
// pas eux. S'ils la quittent quand même (la ville rebâtie de zéro), ils ressortent de chez
// eux. On peut leur reparler, un moment après (`againMs`) : un passant n'entend la voix
// qu'une fois, eux la connaissent.
import { CM } from '../layout.js';
import { citizenSpriteName } from '../agents.js';
import { ageRange, idHash, fnv1a } from '../citizenIdentity.js';
import { getPeriod } from '../../core/chronicleEvaluator.js';
import { FIGURES, FIGURE_KEYS, FIGURES_FROM, figureJob } from '../../data/parolesFigures.js';
import { veilleeNow } from './veillee.js';

// on : les faire vivre. checkMs : tous les combien on vérifie qu'ils sont là, et leur
// atelier. againMs : le temps avant de pouvoir leur reparler. minCrowd : la foule qu'il
// faut au moins pour qu'ils sortent (en deçà, la baisse de la cible renverrait chez eux
// jusqu'aux premiers de la file).
export const FIGURES_LIVE = { on: true, checkMs: 1000, againMs: 120000, minCrowd: 8 };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__figures = (o) => {
    if (o) Object.assign(FIGURES_LIVE, o);
    return { ...FIGURES_LIVE, here: [...F.keys()] };
  };
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const bandNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
const eraNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraIndex) | 0);
const tile = () => CM.TILE || 32;
const cellKey = (c) => `${c.gx},${c.gy}`;
const tileKey = (t) => `${t.gx},${t.gy}`;
const SKINS = ['#e8c8a0', '#d4a878', '#b88a58', '#8a5c38'];

const F = new Map();   // clé → le passant
let nextCheck = 0;

const alive = (p) => !!p && !p._dead && Array.isArray(CM.citizens) && CM.citizens.indexOf(p) >= 0;
export const figureSeed = (key) => fnv1a('figure/' + key);

// ── QUI IL EST ───────────────────────────────────────────────────────────────
// `period` : celle de son métier (il change de métier avec la gazette).
function figureIdentity(key, p, band, period) {
  const D = FIGURES[key];
  const [lo, hi] = ageRange(band, D.age);
  return {
    seed: p.seed, band, sprite: citizenSpriteName(p, band), child: false, fem: D.fem,
    age: Math.round(lo + (hi - lo) * D.ageAt), job: figureJob(key, period).job, traits: D.traits.slice(), epithet: null,
    given: D.given, name: D.given, family: null, household: null, slot: null, line: null,
    chronique: key, period,
  };
}

// ── SON ATELIER, SON LOGIS ───────────────────────────────────────────────────
// Les listes de la cité sont refaites à chaque recalcul du plan (cityMapRuntime) : on en
// garde l'index tant qu'elles ne changent pas.
let homeSrc = null, homeKeys = null, workSrc = null, workIds = null;
function homeSet() {
  if (CM.homeRoadCells !== homeSrc) { homeSrc = CM.homeRoadCells; homeKeys = new Set((homeSrc || []).map(cellKey)); }
  return homeKeys;
}
function workMap() {
  if (CM.workRoadCells !== workSrc) {
    workSrc = CM.workRoadCells;
    workIds = new Map();
    for (const c of workSrc || []) if (c.t) workIds.set(cellKey(c), c.t.buildingId);
  }
  return workIds;
}
// Le premier de ses ateliers que la cité a bâti (par ordre de préférence) ; parmi ses
// portes, toujours la même tant qu'elle existe (un tirage sur sa graine).
function workOf(works, seed) {
  const cells = CM.workRoadCells || [];
  for (const id of works || []) {
    let best = null, bh = Infinity;
    for (const c of cells) {
      if (!c.t || c.t.buildingId !== id) continue;
      const h = idHash(seed, fnv1a(cellKey(c)));
      if (h < bh) { bh = h; best = c; }
    }
    if (best) return best;
  }
  return null;
}
// Une maison près de son atelier (sinon une tirée sur sa graine), où ne vit aucune autre
// figure (`taken` : les maisons déjà prises). Une vraie maison si la cité en a.
function homeOf(work, seed, taken) {
  const all = CM.homeRoadCells || [];
  const houses = all.filter((c) => c.t && c.t.type === 'house' && !taken.has(tileKey(c.t)));
  const list = houses.length ? houses : all.filter((c) => !c.t || !taken.has(tileKey(c.t)));
  let best = null, bd = Infinity, bh = Infinity;
  for (const c of list) {
    const d = work ? Math.abs(c.gx - work.gx) + Math.abs(c.gy - work.gy) : 0;
    const h = idHash(seed, fnv1a(cellKey(c)));
    if (d < bd || (d === bd && h < bh)) { bd = d; bh = h; best = c; }
  }
  return best;
}

// ── IL SORT DE CHEZ LUI ──────────────────────────────────────────────────────
// Il est peut-être encore dans la rue (renvoyé chez lui, puis la pluie passée, ressorti) :
// on le reprend plutôt que d'en faire un second.
function stray(key) {
  for (const q of CM.citizens) if (q.chronique === key && !q._dead) return q;
  return null;
}
function makeFigure(key, band, period, taken) {
  const D = FIGURES[key];
  const seed = figureSeed(key);
  const work = workOf(figureJob(key, period).works, seed);
  const home = homeOf(work, seed, taken);
  const walk = CM.walkRoadList || [];
  const at = home || work || (walk.length ? walk[seed % walk.length] : null);
  if (!at) return null;
  const T = tile();
  const tier = (CM.layout && CM.layout.counts && CM.layout.counts.urbanTier) || 0;
  const p = {
    gx: at.gx, gy: at.gy, x: (at.gx + 0.5) * T, y: (at.gy + 0.5) * T, tx: (at.gx + 0.5) * T, ty: (at.gy + 0.5) * T,
    // Fondu d'apparition, devant sa porte ; à la nuit, il est déjà chez lui (agents.js).
    fade: 0, dir: -1, goal: null, pauseT: 0.4, phase: (seed % 628) / 100,
    charType: D.fem ? 1 : 0, skinVariant: D.look[band] | 0, home, work,
    speed: 9 + (D.age === 'old' ? 0 : 3) + tier * 0.6,
    col: '#5d4630', skin: SKINS[(seed >>> 3) % SKINS.length], hat: null,
    seed, fem: D.fem, name: D.given, role: D.role,
    chronique: key,
    // La fiche ne nomme pas son logis : la maison porte le nom de la famille qui y vit.
    homeTitle: null,
    // Ni compagnon de personne : il suivrait son meneur jusque chez lui, et quitterait la rue.
    _grp: 0,
  };
  p.identity = figureIdentity(key, p, band, period);
  return p;
}

// ── À CHAQUE FRAME ───────────────────────────────────────────────────────────
// Son dessin et son métier suivent l'âge de la cité et la gazette ; on peut lui reparler.
function keep(key, p, band, period, now) {
  const D = FIGURES[key];
  const v = D.look[band] | 0;
  if (p.skinVariant !== v) p.skinVariant = v;
  const id = p.identity;
  if (!id || id.band !== band || id.period !== period || id.sprite !== citizenSpriteName(p, band)) {
    p.identity = figureIdentity(key, p, band, period);
    p._tr = undefined;   // ses traits de comportement (citizenDay.js) suivent la fiche
  }
  p.name = D.given; p.fem = D.fem;
  if (p._talked) {
    if (!p._talkedAt) p._talkedAt = now;
    else if (now - p._talkedAt >= FIGURES_LIVE.againMs && !(CM.talking && CM.talking.p === p)) {
      p._talked = false; p._talkedAt = 0; p._talkAvail = null;
    }
  }
}
// Chaque seconde : qu'ils soient là, chez eux, et à l'atelier de leur métier (le plus
// voulu que la cité ait bâti : Khael quitte la place pour le tribunal dès qu'il y en a un).
function check(band, period) {
  const taken = new Set();
  for (const p of F.values()) if (alive(p) && p.home && p.home.t) taken.add(tileKey(p.home.t));
  const out = (CM.citizenTarget | 0) < FIGURES_LIVE.minCrowd;
  for (const key of FIGURE_KEYS) {
    let p = F.get(key);
    if (!alive(p)) {
      F.delete(key);
      p = stray(key);
      if (p) { p.leaving = false; F.set(key, p); continue; }
      // Claude rentre de la veillée (lot 5) : il ressortira de chez lui, pas deux fois.
      if (out || (key === 'claude' && veilleeNow())) continue;
      p = makeFigure(key, band, period, taken);
      if (!p) continue;
      CM.citizens.unshift(p);
      F.set(key, p);
      if (p.home && p.home.t) taken.add(tileKey(p.home.t));
      continue;
    }
    const want = workOf(figureJob(key, period).works, p.seed);
    const has = p.work && workMap().get(cellKey(p.work));
    if (want ? has !== want.t.buildingId : !!p.work) { p.work = want; }
    if (!p.home || !homeSet().has(cellKey(p.home))) {
      if (p.home && p.home.t) taken.delete(tileKey(p.home.t));
      p.home = homeOf(p.work, p.seed, taken);
      if (p.home && p.home.t) taken.add(tileKey(p.home.t));
    }
  }
}
// Ils rentrent chez eux (la gazette n'en est plus là, ou on les a coupés).
function dismiss() {
  for (const p of F.values()) if (alive(p)) p.leaving = true;
  F.clear();
}

// iso/isoSignes.js, avant la veillée et les mots.
export function figuresTick(now = clock()) {
  if (!CM.layout || !Array.isArray(CM.citizens)) { F.clear(); return null; }
  const band = bandNow(), period = getPeriod(eraNow());
  if (!FIGURES_LIVE.on || period < FIGURES_FROM) {
    if (F.size) dismiss();
    return null;
  }
  if (now >= nextCheck) {
    nextCheck = now + FIGURES_LIVE.checkMs;
    check(band, period);
  }
  for (const [key, p] of F) if (!p._dead) keep(key, p, band, period, now);
  return F;
}

// La figure dans la rue (ou null) ; toutes (le harnais).
export const figureOf = (key) => {
  const p = F.get(key);
  return alive(p) ? p : null;
};
export const figuresNow = () => F;

// Tout s'arrête (la carte démontée, un test qui repart de zéro) : ils quittent la rue.
export function resetFigures() {
  if (Array.isArray(CM.citizens)) {
    for (const p of F.values()) {
      const i = CM.citizens.indexOf(p);
      if (i >= 0) CM.citizens.splice(i, 1);
    }
  }
  F.clear();
  nextCheck = 0;
}
