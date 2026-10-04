"use strict";

// LES FAITS DIVERS — le metteur en scène (docs/PLAN-FAITS-DIVERS.md).
//
// Une fois par seconde (sur le temps de la carte, jamais un setTimeout : __demoCity
// les tue et la fenêtre cachée les endort), il regarde ce que le registre autorise
// (core/faitsDivers.fdCandidates), en tire au plus une nouvelle scène, lui trouve
// une place et la fait vivre quelques minutes. Règles tenues :
//   · deux scènes au plus à la fois (le couple séparé de Nancy et William compte
//     pour une : deux personnes, une histoire) ;
//   · une scène NAÎT HORS CHAMP (ou quand la carte est trop dézoomée pour la montrer) :
//     on ne la voit jamais surgir ; si aucune place hors champ n'existe longtemps,
//     elle se fond à l'écran en une seconde et demie ;
//   · elle PART de même — hors champ, ou en se fondant ;
//   · sa durée se compte en temps de carte VISIBLE : une scène attend qu'on ait eu
//     la chance de la voir ;
//   · une scène ratée revient plus tard (rafraîchie), sans rien coûter ;
//   · Nancy ou William, quand on les cherche, attendent jusqu'à être trouvés ;
//   · un chapitre déjà vu revient parfois, pour l'ambiance (le cercle est toujours
//     là, d'autres nuits ; Diogène a toujours une phrase de plus).
// Tout est dessiné par la petite vie (registerVieActors) : même tri du peintre que
// les passants, même extinction au loin (vieZoomFade).
import { CM } from '../layout.js';
import { worldToScreen } from '../iso/projection.js';
import { registerVieActors, vieZoomFade } from '../iso/isoVie.js';
import { fdCandidates, fdState, fdCycle, fdProgress, fdLoversProgress, FD_TUNE } from '../../core/faitsDivers.js';
import { FD_STORIES } from '../../data/faitsDivers.js';
import { AMOUREUX } from '../../data/faitsDiversAmoureux.js';
import { fdFrame, fdHoverTick, fdFocusCheck } from './fdPick.js';
import { fdHash, fdFootprints, spotOnScreen } from './fdSpots.js';
import { FD_BUILDERS, buildersFor } from './fdScenes.js';
import { FD_TRACES } from './fdTraces.js';
import { loverAppWanted } from './fdLovers.js';

// Molette : __faits({ ... }) — cf. le bas du fichier.
export const FD_DIR = {
  on: true,
  maxActive: 2,
  spawnP: 1 / 30,       // chance par seconde de tenter une naissance (≈ 30 s d'attente)
  showMin: 6, showMax: 9,  // minutes de carte visible pour une scène d'histoire
  loversMin: 14,        // … pour Nancy ou William une fois trouvés
  coolMin: 8,           // une scène ratée ne revient pas avant…
  rerunP: 0.25,         // part des tirages qui rejouent un chapitre déjà vu (l'ambiance)
  fadeS: 1.6,           // fondu d'entrée/sortie quand la place est à l'écran
  popAfterS: 150,       // attente d'une place hors champ avant d'accepter le fondu
};

let apps = [];
const cool = new Map();     // clé de candidat → seconde de carte visible où il redevient possible
let clock = 0;              // secondes de carte VISIBLE (pas le temps mural)
let lastNow = null, lastTick = -1;
let waitOn = 0;             // secondes passées à attendre une place hors champ
let nextId = 1;

const candKey = (c) => (c.kind === 'story' ? 's:' + c.story.id : c.kind === 'lovers' ? 'lovers' : c.kind === 'trace' ? 't:' + c.storyId : 'c:' + (c.curio && c.curio.id));
const appKey = (a) => (a.kind === 'story' ? 's:' + a.story.id : a.kind === 'lovers' ? 'lovers' : a.kind === 'trace' ? 't:' + a.storyId : 'c:' + a.curioId);
export const fdApps = () => apps;
// Combien d'HISTOIRES sont en scène (le couple séparé n'en fait qu'une ; les
// résidentes — la tortue qui longe le fleuve — ne comptent pas).
const activeCount = () => new Set(apps.filter((a) => !a.resident).map(appKey)).size;

function bandNow() {
  const L = CM.layout;
  return (L && L.counts && L.counts.eraBand) | 0;
}
function screenOf(spot) {
  const T = CM.TILE;
  return worldToScreen(spot.x * T, spot.y * T);
}
function hidden() {
  return !CM.cam || vieZoomFade() <= 0;
}

// Les places possibles pour un candidat, dans l'ordre de préférence.
function spotsFor(L, c, seed) {
  const b = buildersFor(c);
  if (!b || !b.spots) return [];
  try { return b.spots(L, c, seed, bandNow()) || []; } catch (e) {
    if (!CM._fdErr) { CM._fdErr = true; console.warn('faits divers', e); }
    return [];
  }
}
// Une place libre : loin des autres scènes, hors champ si possible.
function pickSpot(list, allowOn, avoid = null) {
  for (const s of list) {
    if (apps.some((a) => Math.hypot(a.spot.x - s.x, a.spot.y - s.y) < 4)) continue;
    if (avoid && Math.hypot(avoid.x - s.x, avoid.y - s.y) < 7) continue;
    const p = screenOf(s);
    const on = !hidden() && spotOnScreen(p.x, p.y, 80);
    if (!on) return { s, on: false };
    if (allowOn) return { s, on: true };
  }
  return null;
}

// Fabrique l'apparition d'un candidat (sans la poser).
function makeApp(c, spot, rerun = false, who = null) {
  const seed = 'fd:' + c.kind + ':' + (c.story ? c.story.id + ':' + c.ch.id : c.step ? c.step.id : '') + ':' + spot.key + ':' + (CM.layout.mapSeed || 0);
  const base = {
    id: nextId++, kind: c.kind, spot, seed, band: bandNow(), alive: true,
    alpha: 1, age: 0, leaving: false, inscribed: false, rerun,
  };
  const b = buildersFor(c);
  if (!b) return null;
  if (c.kind === 'story') {
    const app = { ...base, story: c.story, ch: c.ch, ttl: 60 * (FD_DIR.showMin + (fdHash(seed + ':ttl') % 1000) / 1000 * (FD_DIR.showMax - FD_DIR.showMin)) };
    return b.build(app);
  }
  if (c.kind === 'curio') {
    const app = { ...base, curio: c.curio, curioId: c.curio.id, ttl: 60 * (4 + (fdHash(seed + ':ttl') % 1000) / 500) };
    return b.build(app);
  }
  if (c.kind === 'trace') {
    const app = { ...base, storyId: c.storyId, resident: true, ttl: Infinity };
    return b.build(app);
  }
  if (c.kind === 'lovers') {
    const L = fdState().lovers;
    const app = {
      ...base, step: c.step, who: who || b.lover || null, ttl: Infinity,
      // Un effondrement est passé depuis le dernier rendez-vous : ils le diront.
      collapsed: L.cycle != null && L.cycle !== fdCycle(),
    };
    return b.build(app);
  }
  return null;
}

// Les chapitres déjà vus qui peuvent revenir pour l'ambiance (jamais la première fois).
function rerunCands(cands, nightF) {
  const out = [];
  for (const id of Object.keys(FD_BUILDERS)) {
    const story = FD_STORIES[id];
    const pr = fdProgress(story);
    if (!pr.n) continue;
    const k = 's:' + id;
    if (apps.some((a) => appKey(a) === k) || (cool.get(k) || 0) > clock) continue;
    if (cands.some((c) => c.kind === 'story' && c.story.id === id)) continue;   // la suite passe d'abord
    const ch = story.chapters[pr.n - 1];
    const night = ch.night != null ? ch.night : story.night;
    if (night === true && nightF < 0.5) continue;
    if (night === false && nightF > 0.3) continue;
    out.push({ kind: 'story', story, ch, idx: pr.n - 1, rerun: true });
  }
  return out;
}

function spawnOne(L, nightF) {
  if (activeCount() >= FD_DIR.maxActive) return;
  const band = bandNow();
  const cands = fdCandidates({ band, nightF }).filter((c) => {
    const k = candKey(c);
    // La résidente cède la place à son chapitre suivant (elle « avance ») — quand
    // on ne la regarde pas.
    const res = apps.find((a) => a.resident && appKey(a) === k);
    if (res && c.kind === 'story') {
      const p = screenOf(res.spot);
      if (!hidden() && spotOnScreen(p.x, p.y, 80)) return false;
      res.alive = false;
      apps = apps.filter((x) => x !== res);
    }
    if (apps.some((a) => appKey(a) === k)) return false;
    if ((cool.get(k) || 0) > clock) return false;
    const b = buildersFor(c);
    // `when` : une condition propre à la scène (pas de sieste sous la neige).
    return !!b && (!b.when || b.when());
  });
  const reruns = rerunCands(cands, nightF);
  if (!cands.length && !reruns.length) return;
  const r = (fdHash('pick:' + Math.floor(clock) + ':' + nextId) % 1000) / 1000;
  let c = null;
  const storyC = cands.filter((x) => x.kind !== 'curio'), curioC = cands.filter((x) => x.kind === 'curio');
  if (storyC.length && (!reruns.length || r >= FD_DIR.rerunP)) {
    // Les histoires commencées et Nancy-William d'abord ; une nouveauté suit l'ordre
    // d'introduction sept fois sur dix.
    const started = storyC.filter((x) => !x.isNew);
    const fresh = storyC.filter((x) => x.isNew).sort((a, b) => a.intro - b.intro);
    if (started.length && (!fresh.length || r < 0.6)) c = started[fdHash('s' + clock) % started.length];
    else if (fresh.length) c = r < 0.7 ? fresh[0] : fresh[fdHash('f' + clock) % fresh.length];
  } else if (curioC.length && r < 0.55) {
    // Une curiosité (un gag d'un seul coup), quand aucune histoire n'est à tirer.
    c = curioC[fdHash('c' + clock) % curioC.length];
  } else if (reruns.length) {
    c = reruns[fdHash('r' + clock) % reruns.length];
  }
  if (!c) return;
  const seed = 'spot:' + candKey(c) + ':' + (c.ch ? c.ch.id : c.step ? c.step.id : '');
  const list = spotsFor(L, c, seed);
  if (!list.length) { cool.set(candKey(c), clock + 120); return; }
  const allowOn = waitOn >= FD_DIR.popAfterS;
  const got = pickSpot(list, allowOn);
  if (!got) { waitOn += 1; return; }
  const b = buildersFor(c);
  // Le couple séparé : deux scènes, loin l'une de l'autre.
  if (b && b.pair) {
    const got2 = pickSpot(list, allowOn, got.s);
    if (!got2) { waitOn += 1; return; }
    waitOn = 0;
    for (const [g, who] of [[got, 'nancy'], [got2, 'william']]) {
      const app = makeApp(c, g.s, false, who);
      if (!app) continue;
      app.alpha = g.on ? 0 : 1;
      app.fadeIn = g.on;
      apps.push(app);
    }
    return;
  }
  waitOn = 0;
  const app = makeApp(c, got.s, !!c.rerun);
  if (!app) return;
  app.alpha = got.on ? 0 : 1;
  app.fadeIn = got.on;
  apps.push(app);
}

// La scène est-elle encore possible à cet endroit, à cette heure ?
function stillValid(app, nightF) {
  if (app.forced) return true;
  if (app.kind === 'story') {
    const night = app.ch.night != null ? app.ch.night : app.story.night;
    if (night === true && nightF < 0.35) return false;
    if (night === false && nightF > 0.45) return false;
  }
  // Nancy et William : partis si l'histoire ne les attend plus là.
  if (app.kind === 'lovers' && !loverAppWanted(app)) return false;
  return true;
}

// LES RÉSIDENTES : une histoire marquée `resident` (la tortue) reste sur la carte
// une fois rencontrée, à son dernier chapitre vu — on revient voir où elle en est.
function keepResidents(L) {
  // Les TRACES des histoires finies (fdTraces.js) : présentes à jamais.
  for (const id of Object.keys(FD_TRACES)) {
    const done = id === 'amoureux' ? fdLoversProgress().done : !!(FD_STORIES[id] && fdProgress(FD_STORIES[id]).done);
    if (!done || apps.some((a) => appKey(a) === 't:' + id)) continue;
    // La tortue en route cède la place à la tortue endormie.
    for (const a of apps) if (a.resident && appKey(a) === 's:' + id) a.alive = false;
    apps = apps.filter((a) => a.alive);
    const c = { kind: 'trace', storyId: id };
    const list = spotsFor(L, c, 'trace:' + id);
    // Une place à elle (deux traces ne se partagent pas la même berge) ; à l'écran,
    // elle se fond plutôt que de surgir.
    const got = pickSpot(list, true);
    if (!got) continue;
    const app = makeApp(c, got.s);
    if (!app) continue;
    app.alpha = got.on ? 0 : 1;
    app.fadeIn = got.on;
    apps.push(app);
  }
  for (const [id, b] of Object.entries(FD_BUILDERS)) {
    if (!b.resident) continue;
    const story = FD_STORIES[id];
    const pr = fdProgress(story);
    if (!pr.n || pr.done || apps.some((a) => appKey(a) === 's:' + id)) continue;
    const ch = story.chapters[pr.n - 1];
    const c = { kind: 'story', story, ch, idx: pr.n - 1 };
    const list = spotsFor(L, c, 'res:' + id + ':' + ch.id);
    if (!list.length) continue;
    const got = pickSpot(list, true);
    if (!got) continue;
    const app = makeApp(c, got.s, true);
    if (!app) continue;
    app.alpha = got.on ? 0 : 1;
    app.fadeIn = got.on;
    app.resident = true;
    app.ttl = Infinity;
    apps.push(app);
  }
}

function tick(nightF) {
  const L = CM.layout;
  keepResidents(L);
  // Naissances.
  if (FD_DIR.on && FD_TUNE.on && (fdHash('t:' + Math.floor(clock)) % 1000) / 1000 < FD_DIR.spawnP * (waitOn > 0 ? 6 : 1)) spawnOne(L, nightF);
  // Vies et départs.
  for (const app of apps) {
    app.age += 1;
    // Trouvés, ils restent encore un moment (on revient relire ce qu'ils ont dit).
    if (app.kind === 'lovers' && !Number.isFinite(app.ttl) && app.said && Object.keys(app.said).length) app.ttl = app.age + 60 * FD_DIR.loversMin;
    if (!app.leaving && (app.age >= app.ttl || !stillValid(app, nightF))) app.leaving = true;
  }
}

function step(now) {
  const dt = lastNow == null ? 0 : Math.min(0.25, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  clock += dt;
  const nightF = CM.nightF || 0;
  if (Math.floor(clock) !== lastTick) {
    lastTick = Math.floor(clock);
    tick(nightF);
  }
  // Fondus, et départs hors champ.
  const fade = dt / Math.max(0.2, FD_DIR.fadeS);
  for (const app of apps) {
    if (app.fadeIn && !app.leaving) {
      app.alpha = Math.min(1, app.alpha + fade);
      if (app.alpha >= 1) app.fadeIn = false;
    }
    if (app.leaving) {
      const p = screenOf(app.spot);
      if (hidden() || !spotOnScreen(p.x, p.y, 80)) app.alpha = 0;
      else if ((app.leaveWait = (app.leaveWait || 0) + dt) > 30) app.alpha = Math.max(0, app.alpha - fade);
      if (app.alpha <= 0) app.alive = false;
    }
  }
  if (apps.some((a) => !a.alive)) {
    for (const a of apps) {
      if (a.alive) continue;
      // Ratée (jamais ouverte) : elle reviendra, mais pas tout de suite.
      const seen = a.inscribed || (a.said && Object.keys(a.said).length);
      cool.set(appKey(a), clock + 60 * (seen ? 2 : FD_DIR.coolMin));
    }
    apps = apps.filter((a) => a.alive);
  }
}

// Le recalcul de la ville (elle grandit à chaque achat, un effondrement la rase) :
// une scène dont la place est prise — un bâtiment sur la lisière, le seuil d'une
// maison démolie — part, hors champ. Les autres restent, au costume du jour.
let lastLayout = null;
function spotStillFree(app, L) {
  const s = app.spot;
  const foot = fdFootprints(L);
  if ((s.roof || s.inField) && s.t) {
    const t = foot.get(s.t.gx + ',' + s.t.gy);
    return !!t && t.type === s.t.type;
  }
  if (s.t) {
    const t = foot.get(s.t.gx + ',' + s.t.gy);
    if (!t || t.buildingId !== s.t.buildingId) return false;
    return !foot.has(Math.floor(s.x) + ',' + Math.floor(s.y));
  }
  const gx = Math.floor(s.x), gy = Math.floor(s.y);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const k = (gx + dx) + ',' + (gy + dy);
      if (foot.has(k)) return false;
      // La lisière doit rester hors des routes (une rue neuve a pu y passer).
      if (String(s.key).startsWith('lis:') && L.roadSet && L.roadSet.has(k)) return false;
    }
  }
  return true;
}
function onLayout(L) {
  if (L === lastLayout) return;
  lastLayout = L;
  const band = bandNow();
  for (const a of apps) {
    if (!spotStillFree(a, L)) a.leaving = true;
    a.band = band;
  }
}

registerVieActors((now, out) => {
  fdFrame();
  fdFocusCheck();
  const L = CM.layout;
  if (!L || !CM.cam || CM.lodActive || CM.collapseAt) return;
  onLayout(L);
  step(now || 0);
  const fadeZ = vieZoomFade();
  if (fadeZ <= 0) return;
  for (const app of apps) {
    if (!app.alive || app.alpha <= 0.01) continue;
    app.actors(now, out, Math.min(1, app.alpha * fadeZ));
  }
  fdHoverTick();
});

// ── BANC D'ESSAI ─────────────────────────────────────────────────────────────
// __faits()                              l'état : scènes vivantes, réglages
// __faits({ story: 'secte', ch: 2 })     fait naître ce chapitre près du centre de l'écran
// __faits({ lovers: true })              le rendez-vous en cours de Nancy et William
// __faits({ clear: true })               vide la carte
// __faits({ dir: {...}, tune: {...} })   règle le metteur en scène / le rythme
function nearCenter(list, n = 1) {
  const cx = (CM.cw || 0) / 2, cy = (CM.ch || 0) / 2;
  return list.map((s) => ({ s, d: Math.hypot(screenOf(s).x - cx, screenOf(s).y - cy) }))
    .sort((a, b) => a.d - b.d).slice(0, n).map((e) => e.s);
}
export function fdForce(o = {}) {
  const L = CM.layout;
  if (!L) return null;
  if (o.clear) { for (const a of apps) a.alive = false; apps = []; cool.clear(); return true; }
  if (o.dir) Object.assign(FD_DIR, o.dir);
  if (o.tune) Object.assign(FD_TUNE, o.tune);
  let c = null;
  if (o.story) {
    const story = FD_STORIES[o.story];
    if (!story) return null;
    const ch = story.chapters[Math.max(0, Math.min(story.chapters.length - 1, o.ch | 0))];
    c = { kind: 'story', story, ch, idx: o.ch | 0, isNew: false };
  } else if (o.lovers) {
    const st = AMOUREUX.steps[Math.min(AMOUREUX.steps.length - 1, fdState().lovers.step)];
    c = { kind: 'lovers', step: st, idx: fdState().lovers.step };
  }
  if (!c) return o.dir || o.tune ? true : null;
  const b = buildersFor(c);
  if (!b) return null;
  const list = spotsFor(L, c, 'force:' + Date.now());
  // Les places VUES d'abord (fdSpots.openFront), la plus proche du centre parmi elles.
  const seen = list.filter((s) => s.open == null || s.open >= 0);
  const near = nearCenter(seen.length ? seen : list, b.pair ? 6 : 1);
  if (!near.length) return null;
  for (const a of apps) if (appKey(a) === candKey(c)) a.alive = false;
  apps = apps.filter((a) => a.alive);
  const made = [];
  const pairs = b.pair ? [[near[0], 'nancy'], [near[near.length - 1], 'william']] : [[near[0], null]];
  for (const [s, who] of pairs) {
    const app = makeApp(c, s, !!o.rerun, who);
    if (!app) continue;
    app.forced = true;
    apps.push(app);
    made.push({ id: app.id, who: app.who, x: s.x, y: s.y, key: s.key });
  }
  return made.length === 1 ? made[0] : made;
}
if (typeof window !== 'undefined') {
  window.__faits = (o) => {
    if (o) return fdForce(o);
    return {
      clock: Math.round(clock), dir: { ...FD_DIR }, tune: { ...FD_TUNE },
      apps: apps.map((a) => ({ id: a.id, kind: a.kind, story: a.story && a.story.id, ch: a.ch && a.ch.id, step: a.step && a.step.id, who: a.who, x: +a.spot.x.toFixed(1), y: +a.spot.y.toFixed(1), age: a.age, ttl: a.ttl, alpha: +a.alpha.toFixed(2), leaving: a.leaving })),
      cool: Object.fromEntries([...cool].map(([k, v]) => [k, Math.round(v - clock)])),
      state: JSON.parse(JSON.stringify(fdState())),
    };
  };
}
