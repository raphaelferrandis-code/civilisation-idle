// ============================================================================
// FICHE D'HABITANT — désigner un passant (ou un véhicule), le suivre, dire qui
// il est.
// ----------------------------------------------------------------------------
// Demande de Raph (2026-10-03) : « chaque pnj un personnage cliquable, avec une
// petite fiche générée et la caméra qui le suit », puis « ça ne marche pas sur
// les habitants du quai ? et sur les véhicules ? », puis « fais aussi le pont et
// le bac ».
//
// QUATRE NATURES — c'est tout l'enjeu de ce module :
//   · 'citizen' : les passants des rues (CM.citizens, agents.js). Ils ont un
//     état complet : nom, logis, atelier, compagnon, envies du jour ;
//   · 'figure'  : des personnages de SCÈNE, absents de CM.citizens. Sans
//     identité : on la leur donne au premier survol, tirée de leur graine.
//       - 'quai' : les promeneurs (iso/isoQuayWalk.js), pseudo-habitants dessinés
//         par drawIsoCitizenItem ;
//       - 'pont' : les accoudés et le pêcheur du parapet (iso/isoBridge.js) ;
//       - 'bac'  : les voyageurs qui attendent le passeur (iso/boatScenes.js). Ils
//         MONTENT À BORD quand le bac arrive (sa `trip` avance) et en descendent
//         sur l'autre rive : suivi, l'un d'eux emmène la caméra sur le bac ;
//       - 'navette' : ceux qui attendent la navette des Plaisirs. Elle les assoit à
//         bord en accostant et les mène à la Maison, où ils entrent ;
//       - 'bateau' : les marins de la flotte (et l'hôtesse de la navette), peints sur
//         leur pont par boatKit.drawCrew (noteBoatCrew). La caméra suit leur coque.
//     Ceux-là sont dessinés par drawNamedAgentIso ou drawCrew : ils se signalent
//     avec la boîte réellement peinte (noteSceneFigure) ;
//   · 'vehicle' : la flotte des rues (CM.vehicles), porteurs de panier compris
//     (un « véhicule » côté moteur, un piéton à l'écran) ;
//   · 'boat'    : le bac lui-même (CM.ships, kind 'ferry'), visé par la coque
//     que le port publie à chaque frame (sh._hull, iso/isoPort.js).
// Figures et véhicules ne sont connus que parce qu'ils ont été DESSINÉS : le
// rendu les signale (noteFigure / noteSceneFigure / noteVehicle) et le clic vise
// ce qui a été peint à la dernière frame.
//
// Ce module tient la désignation (`CM.focus = { p, kind, cam }`) et ses abonnés
// (la fiche React), le test de clic, l'anneau au sol, le chevron, et le relevé
// que lit la fiche. La caméra reste dans cmCameraGlide (cityMapRuntime.js).
//
// ⚠ Rien de tout ça n'est sauvegardé. Celui qu'on suit est protégé du reflux de
// foule (passant en tête de liste), de l'excédent de la flotte (véhicule gardé en
// tête, cmSyncRoadFleet) et de l'émeute (jamais recruté, riotRecruit) ; pour le
// reste, la fiche dit qu'il a quitté la rue et la caméra s'arrête.
// ============================================================================
import { CM } from './layout.js';
import {
  citizenScreenBox, citizenSheltering, thoughtBubbleAnchor, vehicleLaneOffset,
  imgInkBox, citizenPortraitFrame, namedPortraitFrame, citizenSpriteName, citizenWorkNear,
} from './agents.js';
import {
  buildIdentity, SPRITE_PROFILE, SCHOOLS, jobLabel, traitWord, householdOf, householdSlot, memberOf,
  jobOfBuilding, jobWorks,
} from './citizenIdentity.js';
import { snapZoom, screenToWorld } from './iso/projection.js';
import { snapDev } from './blitSnap.js';
import { cmPasserbyName } from './cityNaming.js';
import { isBoatPassenger } from './iso/boatCrew.js';
import { WINTER } from './seasonMode.js';
import { tr } from '../core/i18n.js';
import { state } from '../core/state.js';
import { pressureBreakdown, cityVitals } from '../core/mechanics.js';

// zoom = cran visé à la désignation quand on regarde de plus loin (un passant
// y fait ~30 px de haut) ; rate = amortissement du suivi (cf. CAM_FEEL).
export const FOCUS_TUNE = { zoom: 2, rate: 6 };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__citizenFocus = (o) => { if (o) Object.assign(FOCUS_TUNE, o); return { ...FOCUS_TUNE }; };
}

const listeners = new Set();
function emit() {
  for (const fn of listeners) {
    try { fn(CM.focus ? CM.focus.p : null); } catch { /* abonné démonté entre-temps */ }
  }
}
export function onCitizenFocus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const bandNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);

// ── CE QUI A ÉTÉ PEINT ───────────────────────────────────────────────────────
// Le rendu signale les personnages de scène et les véhicules qu'il dessine ; à
// chaque nouvelle frame (citizenHoverTick), la liste remplie à la précédente
// devient la liste visée. Bornée : une capture hors boucle ne la fait pas enfler.
let frameN = 0;
let figBuf = [], vehBuf = [], drawnFigs = [], drawnVehs = [];
export function noteFigure(p) {
  // Peint deux fois dans la frame (le pont redessine un bateau sorti de dessous lui,
  // et ses marins avec) : la dernière boîte vaut, une seule entrée.
  if (p._seenFrame === frameN) return;
  p._seenFrame = frameN;
  if (figBuf.length < 4000) figBuf.push(p);
}
// Personnage de scène dessiné par drawNamedAgentIso (pont, bac) : `d` = ce que
// rend drawNamedAgentIso ({ drawW, drawH, top }), (sx, sy) = ses pieds à l'écran.
// Silhouette = la médiane d'encre des bandes de piétons ; sa position MONDE est
// relue sous ses pieds (au sol : centrer la caméra dessus le remet au centre).
export function noteSceneFigure(q, scene, sprite, sx, sy, d) {
  q.scene = scene;
  q.sprite = sprite;
  const w = screenToWorld(sx, sy);
  q.x = w.x; q.y = w.y;
  q._figBox = { x0: sx - d.drawW * 0.28, x1: sx + d.drawW * 0.28, y0: d.top + d.drawH * 0.03, y1: d.top + d.drawH * 0.91 };
  noteFigure(q);
}
// UN MARIN PEINT (boatKit.drawCrew, via isoPort) : `sh` son bateau, `M` le modèle, `cr`
// sa place cuite, `who` son identité (place × bateau), `sp` le dessin qu'il porte, `j`
// son rang parmi les voyageurs du bac ou de la navette (−1 : un marin), (fx, fy) ses
// pieds à l'écran. Un voyageur est la PERSONNE qui attendait au ponton
// (sh._passPeople, boatScenes) ; un marin, un objet par place, gardé sur son bateau.
const SHIP_WORK = {
  trade: { fr: 'Bateau marchand', en: 'Merchant boat' },
  fisher: { fr: 'Barque de pêche', en: 'Fishing boat' },
  barge: { fr: 'Chaland', en: 'Barge' },
  ferry: { fr: 'Bac', en: 'Ferry' },
  shuttle: { fr: 'Navette des Plaisirs', en: 'Pleasure shuttle' },
};
function shipWork(M, hostess) {
  if (hostess) return { fr: 'Hôtesse · Navette des Plaisirs', en: 'Hostess · Pleasure shuttle' };
  if (M && M.beacon) return { fr: 'Vedette de police', en: 'Police launch' };
  if (M && M.service === 'fire') return { fr: 'Bateau pompe', en: 'Fireboat' };
  if (M && M.role === 'service') return { fr: 'Bateau de service', en: 'Service boat' };
  return (M && SHIP_WORK[M.role]) || SHIP_WORK.trade;
}
export function noteBoatCrew(sh, M, cr, who, sp, j, fx, fy, drawH, top) {
  if (!sh || !sp) return;
  sh._crewFrame = frameN;
  let q = j >= 0 && sh._passPeople ? sh._passPeople[j] : null;
  if (!q) {
    if (!sh._crewFigs) sh._crewFigs = new Map();
    q = sh._crewFigs.get(who);
    if (!q) {
      if (sh._crewFigs.size > 24) sh._crewFigs.clear();
      const hostess = cr.role === 'hostess';
      q = {
        figSeed: who >>> 0, onShip: sh, sceneTag: 'bateau',
        charType: hostess || /woman|girl|plaisirs/.test(sp.name) ? 1 : 0,
        hostess, passenger: isBoatPassenger(M, cr), pose: cr.pose || 'stand', boatRole: M ? M.role : null,
        workLabel: shipWork(M, hostess),
      };
      sh._crewFigs.set(who, q);
    }
    q.pose = cr.pose || 'stand';
  }
  noteSceneFigure(q, q.sceneTag || 'bac', sp.name, fx, fy, { drawW: drawH, drawH, top });
}
// Vérification : les personnages de scène peints à la dernière frame, et où.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__focusFigures = () => drawnFigs.map((p) => ({
    scene: p.scene, name: p.persona ? p.persona.name : null,
    x: p._figBox ? Math.round((p._figBox.x0 + p._figBox.x1) / 2) : null,
    y: p._figBox ? Math.round((p._figBox.y0 + p._figBox.y1) / 2) : null,
  }));
}
// Largeur de l'anneau sous un personnage de scène de hauteur dessinée `drawH`
// (même grain que sous un passant, cf. drawCitizenFocusRing).
export const sceneRingWidth = (drawH) => drawH * (19 / 16);
// `box` = la silhouette du véhicule à l'écran (boîte d'encre de sa frame),
// `art` = { img, sx, fh } la planche PLEINE servie, pour le portrait.
export function noteVehicle(v, box, art) {
  v._seenFrame = frameN;
  v._box = box;
  if (art) v._art = art;
  if (vehBuf.length < 4000) vehBuf.push(v);
}

// ── VISER ────────────────────────────────────────────────────────────────────
// Ce qui est SOUS LE POINTEUR. Une personne est visée par sa silhouette (boîte
// d'encre de sa bande), portée à une taille minimale ; un véhicule par la boîte
// d'encre de sa frame. Chaque cible est entourée d'une MARGE fixe écran ; parmi
// les cibles touchées, la plus PROCHE du pointeur gagne (à égalité, celle de
// devant : bas le plus bas à l'écran = dessinée en dernier par le peintre).
// ⚠ La silhouette seule ne suffisait pas : au zoom d'ensemble d'une ville, un
// passant fait 7 px de haut sur 5 de large, et il MARCHE — « je ne peux cliquer
// sur aucun passant » (Raph, 2026-10-03, Chrome en rendu logiciel). Mesuré : le
// vrai clic passait, mais seulement au pixel près.
const MIN_HALF_W = 7, MIN_H = 20, PICK_PAD = 9;
export function pickAtScreen(sx, sy) {
  if (!CM.layout || !CM.cam || CM.lodActive) return null;
  let best = null, bestD = Infinity, bestY = -Infinity;
  // `bias` : un écart ajouté (la coque du bac cède devant ceux qui sont à son bord).
  const consider = (kind, p, x0, y0, x1, y1, bias = 0) => {
    const dx = Math.max(x0 - sx, 0, sx - x1);
    const dy = Math.max(y0 - sy, 0, sy - y1);
    const d = Math.hypot(dx, dy) + bias;
    if (d > PICK_PAD) return;
    if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && y1 > bestY)) {
      bestD = d; bestY = y1; best = { kind, p };
    }
  };
  const reach = CM.TILE * CM.cam.zoom + MIN_H + PICK_PAD;   // rejet grossier avant tout calcul de bande
  const person = (kind, p) => {
    const b = citizenScreenBox(p);
    if (!b) return;
    if (Math.abs(sx - b.footX) > reach || sy > b.footY + reach || sy < b.footY - 2 * reach) return;
    const cx = (b.x0 + b.x1) / 2;
    const hw = Math.max(MIN_HALF_W, (b.x1 - b.x0) / 2);
    const y1 = Math.max(b.y1, b.footY + 2);
    consider(kind, p, cx - hw, Math.min(b.y0, y1 - MIN_H), cx + hw, y1);
  };
  for (const p of CM.citizens || []) {
    if (p._nightHidden || p._dead || (p._sleepFade ?? 1) < 0.3) continue;
    person('citizen', p);
  }
  // Même cible minimale qu'un passant pour tout ce qui a une boîte peinte (le
  // porteur de panier, l'accoudé du pont, le voyageur du bac SONT des passants).
  const boxed = (kind, p, b) => {
    const cx = (b.x0 + b.x1) / 2, hw = Math.max(MIN_HALF_W, (b.x1 - b.x0) / 2);
    consider(kind, p, cx - hw, Math.min(b.y0, b.y1 - MIN_H), cx + hw, b.y1);
  };
  for (const p of drawnFigs) {
    if (p._figBox) boxed('figure', p, p._figBox);
    else person('figure', p);
  }
  for (const v of drawnVehs) {
    if (v._box && CM.vehicles && CM.vehicles.indexOf(v) >= 0) boxed('vehicle', v, v._box);
  }
  // Le bac : sa coque peinte à cette frame (null hors champ, cf. isoPort). Elle passe
  // APRÈS les gens peints sur son pont : sous le pointeur, on désigne le passeur ou le
  // voyageur, et la coque autour d'eux.
  for (const sh of CM.ships || []) {
    if (sh.kind !== 'ferry') continue;
    const b = hullBox(sh);
    if (b) consider('boat', sh, b.x0, b.y0, b.x1, b.y1, 1);
  }
  return best;
}
// Silhouette d'une coque à l'écran (sh._hull, publié par le port à chaque frame où il
// la peint). Son canvas est SERRÉ sur la coque, qui en occupe les iw × ih premiers
// pixels (boatKit.toCanvas, audit du 05/10, PERF-36) : la boîte d'encre lue au carré
// (imgInkBox replie un canvas plus large que haut en planche de frames) n'y vaut plus.
function hullBox(sh) {
  const hb = sh._hull;
  if (!hb || !hb.img || !hb.iw) return null;
  const k = hb.dw / hb.img.width;
  return { x0: hb.bx, y0: hb.by, x1: hb.bx + hb.iw * k, y1: hb.by + hb.ih * k };
}
// ── LE VOYAGEUR DU BAC ───────────────────────────────────────────────────────
// Le bac avance sa `trip` à chaque accostage (riverFleet.ferryStep). Les voyageurs
// de la traversée n° t attendent tant que trip = t ; le bac qui ACCOSTE à leur
// embarcadère passe à t+1 — ils sont à bord (et ne sont plus dessinés) ; il
// accoste en face à t+2 — ils ont débarqué.
// 'wait' | 'aboard' | 'landed' | null (pas un voyageur).
function ferryLeg(p) {
  const sh = p.ferryShip;
  if (!sh) return null;
  if (!CM.ships || CM.ships.indexOf(sh) < 0) return 'landed';
  const t = sh.trip | 0;
  return t >= p.trip + 2 ? 'landed' : t === p.trip + 1 ? 'aboard' : 'wait';
}
// ── LE VOYAGEUR DE LA NAVETTE ────────────────────────────────────────────────
// Il attend le voyage n° t (la navette en est à t − 1) ; elle accoste en ville et
// passe à t : il est à bord, jusqu'à la Maison des Plaisirs ; elle y accoste : il
// est entré. 'wait' | 'aboard' | 'arrived' | null (pas un voyageur).
function shuttleLeg(p) {
  const sh = p.shuttleShip;
  if (!sh) return null;
  if (!CM.ships || CM.ships.indexOf(sh) < 0) return 'arrived';
  const t = sh.trip | 0;
  if (t < p.trip) return 'wait';
  if (t > p.trip || sh.at === 'maison' || (sh.state !== 'dock' && sh.dest === 'city')) return 'arrived';
  return 'aboard';
}
// Le bateau qui le PORTE en ce moment (sa coque guide la caméra et le chevron quand
// on ne le voit pas lui-même), ou null.
function shipCarrying(p) {
  if (ferryLeg(p) === 'aboard') return p.ferryShip;
  if (shuttleLeg(p) === 'aboard') return p.shuttleShip;
  if (p.onShip && CM.ships && CM.ships.indexOf(p.onShip) >= 0) return p.onShip;
  return null;
}

// SURVOL VIVANT : ce qui est sous le pointeur, réévalué ~12 fois par seconde
// même souris immobile — eux marchent et roulent. Il allume l'anneau (plus pâle
// que celui du désigné) et la main du curseur : on voit ce qu'on va cliquer
// avant de cliquer. Le pointeur (CM._mouse) est publié par le survol de
// cityMapRuntime. Appelé à CHAQUE frame, avant le rendu : il tourne aussi la
// page des listes de ce qui a été peint.
let hoverAt = 0;
export function citizenHoverTick(now) {
  frameN += 1;
  drawnFigs = figBuf; drawnVehs = vehBuf;
  figBuf = []; vehBuf = [];
  if (now - hoverAt < 80) return;
  hoverAt = now;
  const m = CM._mouse;
  const next = m && !CM.drag ? pickAtScreen(m.x, m.y) : null;
  const prev = CM.hoverPick;
  if ((next && next.p) === (prev && prev.p)) return;
  CM.hoverPick = next;
  const cv = CM.canvas;
  if (cv && !CM.drag) cv.style.cursor = next || CM._cursorBase === 'pointer' ? 'pointer' : 'grab';
}

// 2 = désigné, 1 = survolé, 0 = rien : l'anneau à poser sous lui.
export function focusMark(p) {
  if (CM.focus && CM.focus.p === p) return 2;
  if (CM.hoverPick && CM.hoverPick.p === p) return 1;
  return 0;
}

// ── DÉSIGNER, SUIVRE, LÂCHER ─────────────────────────────────────────────────
export function focusPick(pick) {
  if (!pick || !pick.p) return;
  const { kind, p } = pick;
  if (kind === 'citizen') {
    // EN TÊTE DE LISTE : cmRetireExcessCitizens marque en partance la QUEUE de la
    // liste quand la foule doit refluer (pluie, nuit, qualité). Un départ déjà
    // décidé est annulé — il reprend sa journée au lieu de rentrer s'effacer.
    const list = CM.citizens || [];
    const i = list.indexOf(p);
    if (i > 0) { list.splice(i, 1); list.unshift(p); }
    if (p.leaving) {
      p.leaving = false;
      p.leaveCell = null;
      if (p.goalKind === 'leave') { p.goal = null; p.goalKind = 'wander'; }
    }
  } else if (kind === 'figure') {
    figureIdentity(p);
  } else if (kind === 'boat') {
    boatIdentity(p);
  } else {
    vehicleIdentity(p);
  }
  // `since` : depuis quand la caméra le suit (l'écoute, paroles/listen.js : au bout
  // d'un moment, il sent qu'on le suit).
  CM.focus = { p, kind, cam: true, since: nowMs() };
  CM.camGoal = null;
  CM.panVel = null;
  const z = CM.zoomGoal ?? (CM.cam ? CM.cam.zoom : FOCUS_TUNE.zoom);
  if (z < FOCUS_TUNE.zoom) CM.zoomGoal = snapZoom(FOCUS_TUNE.zoom);
  emit();
}
export function focusCitizen(p) {
  focusPick({ kind: 'citizen', p });
}
// « SUIVANT » (Raph, 2026-10-07) : passer au passant le plus proche de celui qu'on
// regarde, pour flâner de l'un à l'autre. D'abord ceux qu'on VOIT (un passant dont
// la silhouette sort de l'écran passe après), jamais l'un des derniers désignés.
// Passants des rues et personnages de scène peints à la dernière frame (le flâneur
// de la place, le promeneur du quai) ; pas les véhicules.
const RECENT_MAX = 6;
const recentPicks = [];
function noteRecent(p) {
  const i = recentPicks.indexOf(p);
  if (i >= 0) recentPicks.splice(i, 1);
  recentPicks.push(p);
  if (recentPicks.length > RECENT_MAX) recentPicks.shift();
}
function worldPosOf(kind, p) {
  if (kind === 'vehicle') return { x: p.x, y: p.y };
  if (kind === 'boat') return p._camAt || (p._hull ? { x: p._hull.wx, y: p._hull.wy } : null);
  return { x: p.x + (p.lox || 0), y: p.y + (p.loy || 0) };
}
function offScreen(kind, p) {
  const b = kind === 'figure' && p._figBox ? p._figBox : citizenScreenBox(p);
  if (!b || !(CM.cw > 0) || !(CM.ch > 0)) return false;   // visibilité inconnue : la distance seule
  return b.x1 < 0 || b.x0 > CM.cw || b.y1 < 0 || b.y0 > CM.ch;
}
export function focusNextCitizen() {
  const f = CM.focus;
  const cur = f ? f.p : null;
  if (cur) noteRecent(cur);
  const from = (f && worldPosOf(f.kind, f.p)) || (CM.cam ? { x: CM.cam.x, y: CM.cam.y } : { x: 0, y: 0 });
  let best = null, bestScore = Infinity;
  const consider = (kind, p) => {
    if (p === cur || recentPicks.indexOf(p) >= 0) return;
    const w = worldPosOf(kind, p);
    if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) return;
    const score = Math.hypot(w.x - from.x, w.y - from.y) + (offScreen(kind, p) ? 1e7 : 0);
    if (score < bestScore) { bestScore = score; best = { kind, p }; }
  };
  for (const p of CM.citizens || []) {
    if (p._nightHidden || p._dead || (p._sleepFade ?? 1) < 0.3 || (p.fade ?? 1) < 0.5 || p._vanish !== undefined) continue;
    consider('citizen', p);
  }
  for (const p of drawnFigs) if (p._seenFrame === frameN || p._seenFrame === frameN - 1) consider('figure', p);
  if (!best) return false;
  focusPick(best);
  return true;
}
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// Le joueur reprend la caméra (drag, flèches, recentrage) : la fiche reste
// ouverte, l'anneau aussi, seul le suivi s'arrête.
export function releaseFocusCamera() {
  if (!CM.focus || !CM.focus.cam) return;
  CM.focus.cam = false;
  emit();
}
export function resumeFocusCamera() {
  if (!CM.focus) return;
  if (!CM.focus.cam) CM.focus.since = nowMs();
  CM.focus.cam = true;
  CM.camGoal = null;
  CM.panVel = null;
  emit();
}
export function clearCitizenFocus() {
  if (!CM.focus) return;
  CM.focus = null;
  emit();
}
// Point monde que la caméra doit rejoindre cette frame, ou null.
export function focusCameraTarget() {
  const f = CM.focus;
  if (!f || !f.cam) return null;
  const p = f.p;
  if (f.kind === 'vehicle') {
    const lo = vehicleLaneOffset(p, CM.TILE);
    return { x: p.x + lo.x, y: p.y + lo.y };
  }
  // Le bac, le voyageur monté à bord, le marin : la coque (sa dernière position
  // peinte si elle sort un instant du champ).
  const sh = f.kind === 'boat' ? p : f.kind === 'figure' ? shipCarrying(p) : null;
  if (sh) {
    if (sh._hull) sh._camAt = { x: sh._hull.wx, y: sh._hull.wy };
    if (sh._camAt || sh === p) return sh._camAt || null;
    // Coque jamais vue sous la caméra : là où on l'a vu, lui, en dernier ; le bateau
    // entre dans le champ et la caméra le prend.
  }
  return { x: p.x + (p.lox || 0), y: p.y + (p.loy || 0) };
}
// A-t-il quitté la scène ? Passant et véhicule : sorti de sa liste. Le bac : sorti
// de la flotte. Le voyageur : débarqué (il ne compte pas comme parti tant qu'il
// est à bord, même invisible). Personnage de scène : plus peint depuis ~3 s (un
// promeneur rentré à la nuit tombée, un quai recalculé). ⚠ Un personnage HORS
// CHAMP n'est pas peint non plus : caméra lâchée et regard ailleurs, il passe
// pour parti — la caméra qui le suit le garde, elle, toujours à l'écran.
function isLost(f) {
  if (f.kind === 'citizen') return !CM.citizens || CM.citizens.indexOf(f.p) < 0;
  if (f.kind === 'vehicle') return !CM.vehicles || CM.vehicles.indexOf(f.p) < 0;
  if (f.kind === 'boat') return !CM.ships || CM.ships.indexOf(f.p) < 0;
  const leg = ferryLeg(f.p);
  // Débarqué : parti dès qu'on ne le voit plus descendre (ferryWalkers le peint
  // jusqu'au bout de l'embarcadère, en fondu).
  if (leg === 'landed') return frameN - (f.p._seenFrame ?? -1e9) > 10;
  if (leg === 'aboard') return false;
  // La navette : à bord jusqu'à la Maison, où il entre.
  const sl = shuttleLeg(f.p);
  if (sl === 'arrived') return true;
  if (sl === 'aboard') return false;
  // Le marin : parti avec son bateau ; ou sa place a disparu (le voyageur du retour
  // de la navette, débarqué en ville) — son pont est peint, lui non.
  if (f.p.onShip) {
    const sh = f.p.onShip;
    if (!CM.ships || CM.ships.indexOf(sh) < 0) return true;
    return frameN - (f.p._seenFrame ?? -1e9) > 30 && frameN - (sh._crewFrame ?? -1e9) <= 2;
  }
  // Les filles de la Maison des Plaisirs ne partent jamais : celle qui passe
  // derrière la rotonde n'est pas peinte, mais elle revient. La maison les
  // déclare vivantes à chaque frame où elle les place (keepFigureAlive) ; sans
  // maison depuis ~3 s (disparue, ou hors champ caméra lâchée), elles sont parties.
  if (f.p.scene === 'plaisirs') return !f.p._alive || frameN - f.p._alive > 90;
  return frameN - (f.p._seenFrame ?? -1e9) > 90;
}
// Un personnage de scène toujours là (même non peint) se déclare à chaque frame.
export function keepFigureAlive(p) { p._alive = frameN; }

// ── L'ANNEAU AU SOL ──────────────────────────────────────────────────────────
// Ellipse 2:1 (le sol iso) en pixels pleins, cuite une fois ; posée sous les
// pieds dans le tri peintre, au grain des habitants (un pixel d'anneau ≈ un
// seizième de leur hauteur dessinée, aligné sur la grille device).
// Plus large que le corps (un passant y tient ~5 cases de large) et fin : à
// 6,5 cases il collait aux pieds et se lisait comme un socle, pas un anneau.
let ringImg = null;
const RING = { rx: 8.5, ry: 4.25 };
function ringSprite() {
  if (ringImg || typeof document === 'undefined') return ringImg;
  const w = Math.ceil(RING.rx * 2) + 2, h = Math.ceil(RING.ry * 2) + 2;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (x + 0.5 - w / 2) / RING.rx, dy = (y + 0.5 - h / 2) / RING.ry;
      const e = dx * dx + dy * dy;
      if (e > 0.66 && e <= 1) g.fillStyle = y < h / 2 ? '#FFE39A' : '#E8B54A';
      else if (e > 1 && e <= 1.4) g.fillStyle = 'rgba(38, 24, 10, 0.8)';
      else continue;
      g.fillRect(x, y, 1, 1);
    }
  }
  ringImg = cv;
  return ringImg;
}
// L'anneau centré en (cx, cy), `width` px de large (arrondi au grain entier).
// Ni anneau ni chevron dans une CAPTURE (« Garder une image », harnais) : un
// cliché de la ville n'a pas de curseur. Le SURVOLÉ porte l'anneau à demi-teinte.
export function drawFocusRingAt(ctx, cx, cy, width, focused) {
  if (CM.capture) return;
  const img = ringSprite();
  if (!img) return;
  const grain = Math.max(1, snapDev(width / img.width));
  const w = img.width * grain, h = img.height * grain;
  const prevS = ctx.imageSmoothingEnabled, prevA = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  if (!focused) ctx.globalAlpha = prevA * 0.6;
  ctx.drawImage(img, snapDev(cx - w / 2), snapDev(cy - h / 2), w, h);
  ctx.imageSmoothingEnabled = prevS;
  ctx.globalAlpha = prevA;
}
export function drawCitizenFocusRing(ctx, p, footX, footY, focused = true) {
  const b = citizenScreenBox(p);
  if (!b) return;
  const img = ringSprite();
  if (!img) return;
  drawFocusRingAt(ctx, footX, footY, img.width * (b.drawH / 16), focused);
}

// ── LE CHEVRON ───────────────────────────────────────────────────────────────
// Au-dessus de la tête (du toit, pour un véhicule), taille FIXE écran comme les
// bulles de pensée, dessiné en toute fin de frame : il se voit la nuit, et quand
// un toit cache celui qu'on suit.
const CHEVRON = [
  '222222222',
  '211111112',
  '021111120',
  '002111200',
  '000212000',
  '000020000',
];
export function drawCitizenFocusOverlay(ctx, now = 0) {
  const f = CM.focus;
  if (!f || !ctx || !CM.cam || CM.capture || isLost(f)) return;
  const p = f.p;
  let ax, ay, lift = 4;
  // Le bac, ou qui est à bord : au-dessus de la coque — sauf quand on le VOIT (peint
  // cette frame, sur la passerelle ou sur le pont) : au-dessus de lui.
  const sh = f.kind === 'boat' ? p
    : f.kind === 'figure' && p._seenFrame !== frameN ? shipCarrying(p) : null;
  if (sh) {
    const b = hullBox(sh);
    if (!b) return;                                    // coque hors champ cette frame
    ax = (b.x0 + b.x1) / 2;
    ay = b.y0 - 10;
  } else if (f.kind === 'vehicle' || p._figBox) {
    const b = f.kind === 'vehicle' ? p._box : p._figBox;
    if (p._seenFrame !== frameN || !b) return;        // hors champ cette frame
    ax = (b.x0 + b.x1) / 2;
    ay = b.y0 - 10;
  } else {
    if (f.kind === 'figure' && p._seenFrame !== frameN) return;
    const a = thoughtBubbleAnchor(p);
    ax = a.x; ay = a.y;
    if (p.thoughtType && p.thoughtTimer > 0 && !p._nightHidden) lift = -26;   // au-dessus de la bulle
  }
  const G = 2;   // grain : 2 px CSS par case
  const w = CHEVRON[0].length * G, h = CHEVRON.length * G;
  const bob = Math.round(Math.sin(now / 320) * 1.5);
  // `ay` = 10 px au-dessus de la tête (ancre des bulles) : la pointe du chevron
  // se pose à ~6 px du crâne, ou au-dessus de la bulle quand il en porte une.
  const x0 = Math.round(ax - w / 2), y0 = Math.round(ay + lift - h + bob);
  if (x0 < -w || y0 < -h || x0 > CM.cw || y0 > CM.ch) return;
  const prevA = ctx.globalAlpha;
  if (p._nightHidden) ctx.globalAlpha = prevA * 0.55;   // il dort derrière sa porte
  for (let r = 0; r < CHEVRON.length; r += 1) {
    const row = CHEVRON[r];
    for (let c = 0; c < row.length; c += 1) {
      const v = row[c];
      if (v === '0') continue;
      ctx.fillStyle = v === '2' ? '#2A1A0A' : (r <= 1 ? '#FFE39A' : '#E8B54A');
      ctx.fillRect(x0 + c * G, y0 + r * G, G, G);
    }
  }
  ctx.globalAlpha = prevA;
  drawSpeechMark(ctx);
}

// ── QUI PARLE (l'écoute, paroles/listen.js) ──────────────────────────────────
// Pendant une causette qu'on écoute, une petite bulle sans texte au-dessus de qui
// dit la réplique en cours : les mots sont dans la fiche, la carte ne montre que
// qui parle. Même grain que le chevron, décalée à droite de la tête.
const SPEECH = [
  '0222220',
  '2111112',
  '2131312',
  '2111112',
  '0222220',
  '0200000',
];
function drawSpeechMark(ctx) {
  const L = CM.listening;
  if (!L || L.kind !== 'chat' || !CM.focus || CM.focus.p !== L.p) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const i = Math.floor((now - L.t0) / (L.lineMs || 2800));
  if (i < 0 || i >= L.lines.length) return;
  const who = L.lines[i].who === 'b' ? L.q : L.p;
  if (!who) return;
  let ax, ay;
  if (who._figBox) {
    if (who._seenFrame !== frameN) return;
    ax = who._figBox.x1; ay = who._figBox.y0;
  } else {
    if (who._nightHidden) return;
    const a = thoughtBubbleAnchor(who);
    ax = a.x + 5; ay = a.y + 4;
  }
  const G = 2;
  const x0 = Math.round(ax), y0 = Math.round(ay - SPEECH.length * G);
  if (x0 < -20 || y0 < -20 || x0 > CM.cw || y0 > CM.ch) return;
  for (let r = 0; r < SPEECH.length; r += 1) {
    const row = SPEECH[r];
    for (let c = 0; c < row.length; c += 1) {
      const v = row[c];
      if (v === '0') continue;
      ctx.fillStyle = v === '2' ? '#2A1A0A' : v === '3' ? '#6B5432' : '#F3E6C4';
      ctx.fillRect(x0 + c * G, y0 + r * G, G, G);
    }
  }
}

// ── IDENTITÉS ────────────────────────────────────────────────────────────────
// Tout ce qui ne bouge pas se tire d'une graine (âge, caractère, part d'humeur
// propre, conducteur, chargement) ; le reste se LIT dans l'état, à chaque relevé.
// Libellés {fr, en} : la fiche les passe à tr().
// mixHash : un brassage de HASH (graine, sel) → uint32 — rien à voir avec les `mix`
// de couleurs des peintres, d'où le nom (audit du 05/10, STRUCT-9).
function mixHash(seed, k) {
  let x = (seed ^ Math.imul(k + 1, 0x9E3779B1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7FEB352D) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846CA68B) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// Minuscule à la PREMIÈRE lettre seulement : un toLowerCase() entier écrasait
// les noms propres de la phrase (« la navette des plaisirs »).
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const pickOf = (list, seed) => list[seed % list.length];

// Le métier qu'une SCÈNE donne à ses personnages : le porteur du port, le
// laboureur du champ, le pêcheur du pont. Les autres le tiennent de leur dessin.
function sceneJob(p) {
  if (p.scene === 'port') return 'porter';
  if (p.scene === 'champ') return 'farmer';
  if (p.scene === 'pont' && p.fisher) return 'fisher';
  // Les marins : le pêcheur de sa barque, le batelier des autres (pas les voyageurs).
  if (p.scene === 'bateau' && !p.passenger && !p.hostess) return p.boatRole === 'fisher' ? 'fisher' : 'boatman';
  return null;
}
// Le dessin d'un personnage de scène, s'il est l'un de ceux des passants : le
// promeneur du quai est tiré comme eux (genre, variante). Les bandes propres aux
// scènes (« medieval-man »…) ne disent pas de métier.
function figureSprite(p) {
  if (p.sprite) return SPRITE_PROFILE[p.sprite] ? p.sprite : null;
  return p.charType != null && p.skinVariant != null ? citizenSpriteName(p) : null;
}
// Personnage de scène : une graine tirée de son dessin (phase, variante), puis la
// même personne accordée que les passants (citizenIdentity.js). Posée UNE fois —
// son nom ne change plus. Rangée à part (`p.persona`), JAMAIS dans `p.name` : sur
// les places, `name` est déjà le nom de la bande dessinée. Une scène peut fixer le
// nom elle-même (`p.stageName` : les filles de la Maison des Plaisirs gardent le
// leur d'âge en âge).
function figureIdentity(p) {
  if (p.persona) return p.persona;
  // `figSeed` : graine donnée par la scène (pont, bac…) ; sinon celle du dessin.
  const seed = p.figSeed != null ? mixHash(p.figSeed >>> 0, 29)
    : mixHash(Math.floor((p.phase || 0) * 1e9) >>> 0, (p.skinVariant || 0) + 31);
  const fem = p.charType === 1 || (p.charType === 2 && ((seed >>> 17) & 1) === 1);
  const id = buildIdentity({ seed, band: bandNow(), child: p.charType === 2, fem, sprite: figureSprite(p), job: sceneJob(p) });
  if (p.stageName) id.name = p.stageName;
  p.persona = id;
  return id;
}
// Passant des rues : l'identité posée à sa naissance (spawnOneCitizen), refaite si
// l'âge de la cité lui a changé de dessin (le moine des villages devient
// légionnaire au Marbre : son métier et son nom suivent). Un passant né avant
// cette fiche la reçoit à son premier relevé, sans changer de nom.
function citizenIdentityOf(p) {
  const band = bandNow();
  const sprite = citizenSpriteName(p, band);
  const id = p.identity;
  if (id && id.band === band && id.sprite === sprite) return id;
  const seed = (p.seed >>> 0) || mixHash(Math.round((p.phase || 0) * 1000), 7);
  const child = p.charType === 2;
  const who = { child, fem: !!p.fem, sprite, band };
  // Son foyer : celui qu'il avait (sa place, si elle existe encore à cet âge), sinon
  // une famille qui vit ailleurs (le passant né avant la fiche, le harnais de test).
  let household, slot;
  if (id && id.household != null) {
    household = householdOf(id.household, band);
    slot = memberOf(household, id.slot) ? id.slot : null;
  } else {
    household = householdOf(mixHash(seed, 77), band);
    slot = householdSlot(household, who, new Set());
  }
  // Un nouveau dessin de métier cherche son atelier (le moine devenu légionnaire
  // quitte le culte des ancêtres pour les Veilleurs) ; l'enfant, son école.
  const prof = SPRITE_PROFILE[sprite] || {};
  if (id && (child || prof.job) && CM.workRoadCells && CM.workRoadCells.length) {
    const kinds = child ? SCHOOLS : jobWorks(prof.job);
    const t = tileNow(p.work && p.work.t);
    if (!t || !kinds.includes(t.buildingId)) p.work = citizenWorkNear(p.home || p, seed, kinds);
  }
  const fresh = buildIdentity({
    seed, band, child, fem: !!p.fem, sprite, job: workJobOf(p, band), household, slot,
  });
  if (id) { p.name = fresh.name; p.fem = fresh.fem; }
  p.identity = fresh;
  p._tr = undefined;   // ses traits de comportement (citizenDay.js) suivent la nouvelle fiche
  return fresh;
}
// La tuile qui occupe AUJOURD'HUI l'ancre d'une tuile (un recalcul a pu remplacer
// la hutte par une maison), ou la tuile elle-même.
function tileNow(t0) {
  if (!t0) return null;
  return (CM.tileGrid && CM.tileGrid.get(t0.gx + ',' + t0.gy)) || t0;
}
// Le métier que lui donne son atelier, quand son dessin n'en porte pas.
function workJobOf(p, band) {
  if (p.charType === 2) return null;
  const t = tileNow(p.work && p.work.t);
  return t && t.type === 'engine' ? jobOfBuilding(t.buildingId, band) : null;
}

// LA FAMILLE (idée 7) : ce que sa place au foyer dit de lui, avec les prénoms du
// foyer (citizenIdentity.js). Un proche qui passe dans la rue en ce moment est
// marqué `here` : la fiche en fait un lien (focusRelative). Pas d'objet passant
// dans le relevé (la fiche le compare par JSON, et un passant se cite lui-même).
function livingRelatives(hs, self) {
  const out = new Map();
  for (const q of CM.citizens || []) {
    const qi = q.identity;
    if (q === self || q._dead || !qi || qi.household !== hs || !qi.slot) continue;
    out.set(qi.slot, q);
  }
  return out;
}
function familyOf(p, kind, id) {
  if (kind !== 'citizen' || !id || !id.line || id.household == null) return null;
  const hh = householdOf(id.household, id.band);
  const here = livingRelatives(id.household, p);
  const person = (slot) => {
    const m = memberOf(hh, slot);
    return m ? { given: m.given, fem: m.fem, slot, here: here.has(slot) } : null;
  };
  const line = id.line;
  const base = { kind: line.kind, hh: id.household };
  switch (line.kind) {
    case 'married': return { ...base, other: person(line.other), kids: line.kids };
    case 'single': return { ...base, kids: line.kids };
    case 'child': return { ...base, parents: line.parents.map(person).filter(Boolean) };
    case 'elder': return { ...base, of: person(line.of) };
    case 'lodger': case 'nephew': return { ...base, host: person(line.host) };
    default: return null;
  }
}
// Désigner un proche que la fiche nomme (s'il est encore dans la rue).
export function focusRelative(hs, slot) {
  for (const q of CM.citizens || []) {
    const qi = q.identity;
    if (!q._dead && qi && qi.household === hs && qi.slot === slot) { focusPick({ kind: 'citizen', p: q }); return true; }
  }
  return false;
}
// Qui il est, quelle que soit sa nature : { name, seed, fem, age, job, traits… }.
// Le passant garde son `name` (celui que les bulles et le journal ont déjà dit).
function idOf(p, kind) {
  if (kind === 'figure' || p.scene) return figureIdentity(p);
  const id = citizenIdentityOf(p);
  return id.name === p.name ? id : { ...id, name: p.name };
}
// La même identité, pour l'écoute (paroles/listen.js).
export const identityOfPick = (kind, p) => idOf(p, kind);
// Véhicule : son conducteur. Charretiers, cochers et chevaliers sont des hommes
// jusqu'à l'âge industriel ; ensuite, une conductrice sur deux.
function vehicleIdentity(v) {
  if (v.driver) return;
  const seed = (v.seed >>> 0) || mixHash(Math.round(v.x * 7 + v.y * 13) >>> 0, Math.round(v.speed || 1));
  v.seed = seed;
  const band = bandNow();
  v.driverFem = v.type === 'basket' ? !!v.woman : band >= 6 && ((seed >>> 9) & 1) === 1;
  v.driver = cmPasserbyName(seed, band, v.driverFem, false);
}
// Le bac : son passeur, même règle que les conducteurs.
function boatIdentity(sh) {
  if (sh.driver) return;
  const seed = mixHash((sh.id | 0) >>> 0, 41);
  const band = bandNow();
  sh.driverFem = band >= 6 && ((seed >>> 9) & 1) === 1;
  sh.driver = cmPasserbyName(seed, band, sh.driverFem, false);
}
// Voyageurs à bord : ceux de la traversée précédente, comptés par boatScenes quand
// ils attendaient (sh._parties[trip] = n). Inconnu si on ne les a jamais vus.
const ferryAboard = (sh) => (sh._parties && sh._parties[(sh.trip | 0) - 1]) || null;

// Le style du véhicule : son skin d'époque s'il en porte un (ERA_VEH, agents.js),
// sinon l'âge de la cité.
function vehicleEra(v) {
  if (v.skin && /^(med|anti|ind|mod|cos7|cos8)$/.test(v.skin)) return v.skin;
  const b = bandNow();
  return b <= 3 ? 'med' : b === 4 ? 'anti' : b === 5 ? 'ind' : b === 6 ? 'mod' : b === 7 ? 'cos7' : 'cos8';
}
const VEH_NAMES = {
  car: { fr: 'Automobile', en: 'Car' },
  taxi: { fr: 'Taxi', en: 'Taxi' },
  police: { fr: 'Voiture de police', en: 'Police car' },
  ambulance: { fr: 'Ambulance', en: 'Ambulance' },
  bus: { fr: 'Autobus', en: 'Bus' },
  van: { fr: 'Camionnette', en: 'Van' },
  truck: { fr: 'Camion', en: 'Truck' },
};
function vehicleLabel(v) {
  const e = vehicleEra(v);
  switch (v.type) {
    case 'basket': return v.woman ? { fr: 'Porteuse de panier', en: 'Basket carrier' } : { fr: 'Porteur de panier', en: 'Basket carrier' };
    case 'wagon':
      return e === 'med' ? { fr: 'Chariot à foin', en: 'Hay cart' }
        : e === 'anti' ? { fr: 'Chariot à amphores', en: 'Amphora cart' }
          : e === 'ind' ? { fr: 'Charrette de brasseur', en: "Brewer's dray" }
            : { fr: 'Charrette', en: 'Cart' };
    case 'chariot': return e === 'med' ? { fr: 'Chevalier', en: 'Knight' } : { fr: 'Char', en: 'Chariot' };
    case 'caravan':
      return e === 'ind' ? { fr: 'Omnibus', en: 'Omnibus' }
        : e === 'med' ? { fr: 'Caravane marchande', en: 'Merchant caravan' }
          : { fr: 'Caravane', en: 'Caravan' };
    default: return VEH_NAMES[v.type] || { fr: 'Véhicule', en: 'Vehicle' };
  }
}
function vehicleActivity(v, lost) {
  if (lost) return { fr: 'A quitté la rue', en: 'Left the street' };
  if (v.crossing) return { fr: "Passe sur l'autre rive", en: 'Crossing the river' };
  const e = vehicleEra(v);
  switch (v.type) {
    case 'basket': return { fr: 'Porte son panier', en: 'Carrying a basket' };
    case 'chariot': return e === 'med' ? { fr: 'Fait sa ronde', en: 'On patrol' } : { fr: 'Traverse la ville', en: 'Crossing town' };
    case 'caravan': return e === 'ind' ? { fr: 'Mène ses voyageurs', en: 'Carrying passengers' } : { fr: 'Convoie des marchandises', en: 'Hauling goods' };
    case 'bus': return { fr: 'Dessert sa ligne', en: 'On its line' };
    case 'taxi': return { fr: 'Cherche un client', en: 'Looking for a fare' };
    case 'police': return { fr: 'Patrouille', en: 'On patrol' };
    case 'ambulance': return { fr: 'En intervention', en: 'On a call' };
    case 'car': return { fr: 'Roule en ville', en: 'Driving around' };
    default: return { fr: 'Livre en ville', en: 'Making deliveries' };
  }
}
const CARGO = {
  basket: [['Pain', 'Bread'], ['Poisson', 'Fish'], ['Fruits', 'Fruit'], ['Herbes', 'Herbs']],
  med: [['Foin', 'Hay'], ['Grain', 'Grain'], ['Bois', 'Firewood']],
  anti: [["Amphores d'huile", 'Oil amphorae'], ['Amphores de vin', 'Wine amphorae']],
  ind: [['Tonneaux de bière', 'Beer barrels']],
  caravan: [['Épices', 'Spices'], ['Étoffes', 'Cloth'], ['Sel', 'Salt'], ['Soie', 'Silk']],
  goods: [['Caisses', 'Crates'], ['Primeurs', 'Produce'], ['Matériaux', 'Materials'], ['Colis', 'Parcels']],
};
function vehicleLoad(v) {
  const e = vehicleEra(v), s = mixHash(v.seed >>> 0, 5);
  const c = (list) => { const it = pickOf(list, s); return { fr: it[0], en: it[1] }; };
  if (v.type === 'basket') return { cargo: c(CARGO.basket) };
  if (v.type === 'wagon') return { cargo: c(CARGO[e] || CARGO.goods) };
  if (v.type === 'caravan' && e !== 'ind') return { cargo: c(CARGO.caravan) };
  if (v.type === 'van' || v.type === 'truck') return { cargo: c(CARGO.goods) };
  if (v.type === 'bus' || v.type === 'caravan') return { riders: 3 + (s % 38) };
  return {};
}

// (L'âge et le caractère se tirent avec le reste de la personne :
// citizenIdentity.js, ADULT_AGE et TRAITS.)
const MOODS = [   // du pire au meilleur, seuils sur l'humeur 0..1
  { at: 0, m: 'En colère', f: 'En colère', en: 'Angry' },
  { at: 0.25, m: 'Inquiet', f: 'Inquiète', en: 'Worried' },
  { at: 0.42, m: 'Soucieux', f: 'Soucieuse', en: 'Uneasy' },
  { at: 0.6, m: 'Content', f: 'Contente', en: 'Content' },
  { at: 0.8, m: 'Radieux', f: 'Radieuse', en: 'Radiant' },
];
const word = (w, fem) => ({ fr: fem ? w.f : w.m, en: w.en });

// L'HUMEUR ET CE QUI LA FAIT (idée 6, 2026-10-07). La base est la santé de la cité
// (CM.healthF, la teinte de la carte), que cityMapRuntime tire de la prospérité
// (vivres, or, savoir) et de la tension (foyers de Rupture, Rupture montée,
// usure) ; le tempérament de chacun la tire de ±0,15, l'émeute et l'averse
// l'assombrissent. La CAUSE est ce qui la tire le plus vers le bas, dite avec les
// mots de la rue (« la disette » pour la Subsistance). Rien sous « Content » : on
// ne cherche pas de raison à la bonne humeur.
const MOOD_CAUSE = {
  riot: { fr: "l'émeute", en: 'the riot' },
  rain: { fr: 'la pluie', en: 'the rain' },
  snow: { fr: 'la neige', en: 'the snow' },
  temper: { fr: 'un mauvais jour', en: 'a bad day' },
  scarcity: { fr: 'la disette', en: 'food shortage' },
  inequality: { fr: 'les inégalités', en: 'inequality' },
  complexity: { fr: 'la paperasse', en: 'red tape' },
  dissent: { fr: 'la dissidence', en: 'dissent' },
  structural: { fr: 'les fissures', en: 'the cracks' },
  demesure: { fr: 'la démesure', en: 'hubris' },
  wear: { fr: "l'usure", en: 'wear' },
  poverty: { fr: 'la misère', en: 'poverty' },
};
const FOYERS = ['scarcity', 'inequality', 'complexity', 'dissent', 'structural', 'demesure'];
// Les poids de la cité, au même barème que la santé (cityMapRuntime) : la tension
// pèse 0,55 (la Rupture en cours comptée avec ses foyers, dont le plus lourd
// prend le nom), la prospérité 0,45 (seuls les manques comptent).
function cityPulls() {
  let pr, vt;
  try { pr = pressureBreakdown(); vt = cityVitals(); } catch { return []; }
  const out = [];
  let dom = null, domV = 0;
  for (const k of FOYERS) if ((pr[k] || 0) > domV) { domV = pr[k]; dom = k; }
  // Bornés comme la tension de la santé (cityMapRuntime : strain ∈ [0, 1]).
  if (dom) out.push([dom, Math.min(1, (pr.total || 0) * 0.5 + (state.instability || 0) * 0.55) * 0.55]);
  out.push(['wear', Math.min(1, (state.timeWear || 0) * 0.6) * 0.55]);
  out.push(['scarcity', Math.max(0, -(vt.foodBonus || 0)) * 1.6 * 0.45]);
  out.push(['poverty', Math.max(0, -(vt.goldBonus || 0)) * 0.9 * 0.45]);
  return out;
}
// Ce qui pèse le plus sur la cité, s'il pèse vraiment (au moins 0,06 de santé) : ce
// dont les habitants parlent dans la rue (paroles/listen.js).
export function cityConcern() {
  let best = null, bestV = 0.06;
  for (const [k, v] of cityPulls()) if (v > bestV) { bestV = v; best = k; }
  return best;
}
function moodOf(seed, fem) {
  const temper = ((mixHash(seed, 4) % 1000) / 1000 - 0.5) * 0.3;
  const riot = Array.isArray(CM.rioters) && CM.rioters.length ? 0.25 : 0;
  const wet = (CM.rainF || 0) > 0.15 ? 0.06 : 0;
  const mood = (CM.healthF ?? 0.6) + temper - riot - wet;
  let level = 0;
  for (let i = 0; i < MOODS.length; i += 1) if (mood >= MOODS[i].at) level = i;
  let cause = null;
  if (level <= 2) {
    let best = 0;
    const pulls = [
      ['riot', riot],
      [(CM.season | 0) === WINTER ? 'snow' : 'rain', wet],
      ['temper', Math.max(0, -temper)],
      ...cityPulls(),
    ];
    for (const [k, v] of pulls) if (v > best) { best = v; cause = k; }
  }
  return { level, word: word(MOODS[level], fem), cause: cause ? MOOD_CAUSE[cause] : null };
}

function tileTitle(cell) {
  const t0 = cell && cell.t;
  if (!t0 || typeof CM.describeTile !== 'function') return null;
  // La tuile d'origine a pu être remplacée par un recalcul (hutte → maison) :
  // on relit celle qui occupe aujourd'hui son ancre.
  const t = (CM.tileGrid && CM.tileGrid.get(t0.gx + ',' + t0.gy)) || t0;
  try { return CM.describeTile(t).title || null; } catch { return null; }
}
// Le bâtiment d'une ancre « gx,gy » (le port d'un porteur, le champ d'un laboureur).
function keyTitle(key) {
  const t = key && CM.tileGrid && CM.tileGrid.get(key);
  return t ? tileTitle({ t }) : null;
}

// Les filles de la Maison des Plaisirs, poste par poste (iso/isoPlaisirs.js).
const PLAISIRS_DO = [
  { fr: 'Fait le tour du ponton', en: 'Strolling the pontoon' },
  { fr: 'Fait le tour du ponton', en: 'Strolling the pontoon' },
  { fr: 'Accueille sous la marquise', en: 'Greeting under the awning' },
  { fr: "S'accoude au balcon", en: 'Leaning on the balcony' },
];
// Le flâneur arrêté au bord de la pièce maîtresse de la place (famille du prop).
const PLACE_LOOK = {
  fountain: { fr: 'Admire la fontaine', en: 'Admiring the fountain' },
  well: { fr: 'Se repose près du puits', en: 'Resting by the well' },
  statue: { fr: 'Admire la statue', en: 'Admiring the statue' },
  bandstand: { fr: 'Écoute le kiosque', en: 'Listening at the bandstand' },
};

// Ce que fait un marin, selon son bateau et sa pose (boatParts.person).
const CREW_DO = {
  row: { fr: 'Rame', en: 'Rowing' },
  paddle: { fr: 'Pagaie', en: 'Paddling' },
  pole: { fr: 'Pousse à la perche', en: 'Poling' },
  steer: { fr: 'Tient la barre', en: 'At the helm' },
  wave: { fr: 'Salue un bateau qui passe', en: 'Waving at a passing boat' },
};
function crewActivity(p, lost) {
  if (lost) return { fr: 'A quitté le fleuve', en: 'Left the river' };
  const sh = p.onShip, st = sh ? sh.state : null;
  if (p.hostess) return st === 'dock' ? { fr: 'Accueille les passagers', en: 'Welcoming passengers' } : { fr: 'Veille sur ses passagers', en: 'Looking after her passengers' };
  if (p.passenger) return { fr: 'Rentre en ville', en: 'Heading back to town' };
  if (CREW_DO[p.pose] && st !== 'dock' && st !== 'board' && st !== 'anchor') return CREW_DO[p.pose];
  if (p.boatRole === 'fisher') return p.pose === 'haul' ? { fr: 'Remonte son filet', en: 'Hauling in the net' } : { fr: 'Pêche sur le fleuve', en: 'Fishing on the river' };
  if (st === 'dock' || st === 'board') return { fr: 'À quai', en: 'Moored' };
  if (p.pose === 'haul') return { fr: 'Tire un cordage', en: 'Hauling a rope' };
  return { fr: 'Navigue sur le fleuve', en: 'Sailing the river' };
}

function activityOf(p, lost, fem = false) {
  if (p.scene === 'bac') {
    const leg = ferryLeg(p);
    if (leg === 'landed') {
      // Il descend encore sur l'embarcadère (boatScenes.ferryWalkers), puis s'en va.
      return lost ? { fr: "A débarqué sur l'autre rive", en: 'Landed on the far bank' } : { fr: 'Débarque', en: 'Getting off' };
    }
    if (leg === 'aboard') {
      return p.ferryShip.state === 'cross' ? { fr: 'Traverse en bac', en: 'Crossing by ferry' } : { fr: 'Monte à bord', en: 'Boarding' };
    }
    if (lost) return { fr: 'A quitté le quai', en: 'Left the landing' };
    return { fr: 'Attend le bac', en: 'Waiting for the ferry' };
  }
  if (p.scene === 'navette') {
    // La navette l'emmène à la Maison des Plaisirs, où il entre.
    const leg = shuttleLeg(p);
    if (leg === 'arrived') return { fr: `${fem ? 'Entrée' : 'Entré'} · Maison des Plaisirs`, en: 'Went in · House of Pleasures' };
    if (leg === 'aboard') {
      return p.shuttleShip.state === 'dock' ? { fr: 'À bord, attend le départ', en: 'Aboard, waiting to leave' }
        : { fr: 'Vogue vers la Maison des Plaisirs', en: 'Sailing to the House of Pleasures' };
    }
    return lost ? { fr: 'A quitté le ponton', en: 'Left the landing' }
      : { fr: 'Attend la navette des Plaisirs', en: 'Waiting for the shuttle' };
  }
  if (p.scene === 'bateau') return crewActivity(p, lost);
  if (p.scene === 'port' && lost) return { fr: "A fini l'escale", en: 'Done unloading' };
  // OÙ IL EST ENTRÉ (idée 12) : la porte qu'il a passée (agents.js, `p._in`), ou
  // celle de son meneur pour un compagnon.
  const inside = p._in || (p.lead && p.lead._in) || null;
  const where = inside && inside.t ? tileTitle({ t: inside.t }) : null;
  const atHome = !!(inside && inside.t && p.home && p.home.t && inside.t.gx === p.home.t.gx && inside.t.gy === p.home.t.gy);
  if (lost) {
    if (atHome || (inside && inside.kind === 'home')) return { fr: fem ? 'Rentrée chez elle' : 'Rentré chez lui', en: 'Went home' };
    if (where) return { fr: `${fem ? 'Entrée' : 'Entré'} · ${where}`, en: `Went in · ${where}` };
    return { fr: 'A quitté la rue', en: 'Left the street' };
  }
  if (p.scene === 'pont') {
    return p.fisher ? { fr: 'Pêche à la ligne', en: 'Fishing' } : { fr: 'Regarde le fleuve', en: 'Watching the river' };
  }
  if (p.scene === 'port') {
    if (p.carry) return p.walking ? { fr: 'Décharge le bateau', en: 'Unloading the boat' } : { fr: 'Charge son fardeau', en: 'Shouldering a load' };
    return p.walking ? { fr: 'Retourne au bateau', en: 'Back to the boat' } : { fr: 'Pose son fardeau', en: 'Setting down a load' };
  }
  if (p.scene === 'place') {
    // Les flâneurs de la place (iso/plazaFolk.js) : `act` dit ce qu'ils font.
    if (p.act === 'walk') return { fr: 'Flâne sur la place', en: 'Strolling the square' };
    if (p.act === 'leave') return { fr: 'Quitte la place', en: 'Leaving the square' };
    if (p.act === 'pause') return { fr: 'Fait une halte', en: 'Taking a break' };
    if (p.act === 'look') return PLACE_LOOK[p.lookAt] || PLACE_LOOK.fountain;
    return p.stall ? { fr: 'Regarde les étals', en: 'Browsing the stalls' } : { fr: 'Bavarde sur la place', en: 'Chatting on the square' };
  }
  if (p.scene === 'champ') return { fr: 'Laboure son champ', en: 'Ploughing the field' };
  if (p.scene === 'plaisirs') return PLAISIRS_DO[p.slot | 0] || PLAISIRS_DO[0];
  if (p.scene === 'quai') {
    return (p.pauseT || 0) > 0 ? { fr: "Regarde l'eau", en: 'Watching the water' } : { fr: 'Flâne sur le quai', en: 'Strolling the quay' };
  }
  const night = (CM.nightF || 0) > 0.55;
  const ik = inside && !atHome ? inside.kind : 'home';
  // À l'intérieur : là où il est entré.
  if (p._nightHidden) {
    if (ik === 'work') return { fr: 'Au travail', en: 'At work' };
    if (ik === 'pray') return where ? { fr: `Prie · ${where}`, en: `Praying · ${where}` } : { fr: 'Prie', en: 'Praying' };
    if ((ik === 'errand' || ik === 'leave') && where) return { fr: `En visite · ${where}`, en: `Visiting · ${where}` };
    return night ? { fr: 'Dort', en: 'Asleep' } : { fr: 'Chez soi', en: 'At home' };
  }
  // Il passe la porte : il entre (travail, courses, prière, logis), ou il ressort.
  if (p._vanish !== undefined) {
    if (!p._enter && !p.leaving) return { fr: 'Ressort', en: 'Coming out' };
    if (ik === 'work') return { fr: 'Entre au travail', en: 'Going in to work' };
    if (ik === 'pray') return { fr: 'Entre prier', en: 'Going in to pray' };
    if ((ik === 'errand' || ik === 'leave') && where) return { fr: `Entre · ${where}`, en: `Going in · ${where}` };
    return night ? { fr: 'Va se coucher', en: 'Going to bed' } : { fr: 'Rentre chez soi', en: 'Going inside' };
  }
  if (citizenSheltering(p)) return { fr: "S'abrite de la pluie", en: 'Running from the rain' };
  // Lot 4 de PLAN-COMPORTEMENTS : la ville réagit (averse, émeute).
  if (p._shelter) return { fr: 'Attend sous un auvent', en: 'Waiting under an awning' };
  if (p._watch && (p.pauseT || 0) > 0) return { fr: "Regarde l'émeute", en: 'Watching the riot' };
  if (p.goalKind === 'flee') return { fr: "Fuit l'émeute", en: 'Fleeing the riot' };
  if (p.leaving) return { fr: 'Rentre au logis', en: 'Heading home' };
  // En compagnie : la ligne « Avec » nomme déjà l'autre — l'activité dit ce
  // qu'ils font ENSEMBLE (le but du meneur), ou qu'ils se sont arrêtés causer.
  const L = p.lead;
  const chat = { fr: 'Fait la causette', en: 'Chatting' };
  if (L) return L.chatT > 0 ? chat : activityOf(L, false, fem);
  if (p.chatT > 0 && (p._f1 || p._chatWith)) return chat;
  const k = p.goalKind;
  // (Entrer par la porte, lot 2 de PLAN-COMPORTEMENTS : traité plus haut, avec le
  // bâtiment où il entre.)
  if ((p.pauseT || 0) > 0) {
    if (p._browse) return { fr: 'Regarde une vitrine', en: 'Window-shopping' };
    if (k === 'wonder') return { fr: 'Admire la merveille', en: 'Admiring the wonder' };
    if (k === 'plaza') return { fr: 'Flâne sur la place', en: 'Idling on the square' };
    return { fr: 'Fait une halte', en: 'Taking a break' };
  }
  if (k === 'home') return { fr: 'Rentre au logis', en: 'Heading home' };
  if (k === 'work') return { fr: 'Va au travail', en: 'Going to work' };
  if (k === 'wonder') return { fr: 'Va voir la merveille', en: 'Off to see the wonder' };
  if (k === 'plaza') return { fr: 'Va sur la place', en: 'Heading to the square' };
  if (k === 'cross') return { fr: "Passe sur l'autre rive", en: 'Crossing the river' };
  if (k === 'errand') return { fr: 'Fait ses courses', en: 'Running errands' };
  if (k === 'pray') return { fr: 'Va prier', en: 'Off to pray' };
  if (k === 'night') return { fr: 'Se promène à la nuit tombée', en: 'Out for an evening stroll' };
  // Le rôle tiré à l'apparition (ageVisualConfig) est une unité { fr, en } ; une
  // simple chaîne (ancien format) n'a pas d'anglais.
  const r = p.role;
  const ro = r && typeof r === 'object';
  return { fr: cap(ro ? r.fr : r) || 'Flâne', en: cap(ro ? r.en : null) || 'Strolling' };
}

// CE QU'IL FAIT, en une clé stable (l'écoute, paroles/listen.js) : la même lecture
// que la ligne « Activité » de la fiche, pour que ses pensées parlent de ce qu'on
// le voit faire (docs/PLAN-ECOUTER-PARLER.md, la plume). 'work', 'school' (l'enfant
// qui va à l'école), 'home', 'errand', 'plaza', 'pray', 'wonder', 'wander',
// 'night', 'flee', 'shelter', 'riot' (il regarde l'émeute), 'river', 'port',
// 'field', ou null (une scène sans pensée propre : le bac, la navette).
export function doingOf(p) {
  if (!p) return null;
  const sc = p.scene;
  if (sc === 'champ') return 'field';
  if (sc === 'port') return 'port';
  if (sc === 'pont' || sc === 'quai' || sc === 'bac' || sc === 'bateau') return 'river';
  if (sc === 'place') return 'plaza';
  if (sc) return null;
  const inside = p._in || (p.lead && p.lead._in) || null;
  const atHome = !!(inside && inside.t && p.home && p.home.t && inside.t.gx === p.home.t.gx && inside.t.gy === p.home.t.gy);
  const child = p.charType === 2 || !!(p.identity && p.identity.child);
  const ik = inside && !atHome ? inside.kind : null;
  if (p._nightHidden || p._vanish !== undefined) {
    if (ik === 'work') return child ? 'school' : 'work';
    if (ik === 'pray') return 'pray';
    if (ik === 'errand' || ik === 'leave') return 'errand';
    return 'home';
  }
  if (citizenSheltering(p) || p._shelter) return 'shelter';
  if (p._watch && (p.pauseT || 0) > 0) return 'riot';
  if (p.goalKind === 'flee') return 'flee';
  if (p.leaving) return 'home';
  // En compagnie, ils font ce que fait le meneur.
  const k = (p.lead && p.lead.goalKind) || p.goalKind;
  if (p._browse) return 'errand';
  if (k === 'work') return child ? 'school' : 'work';
  if (k === 'home') return 'home';
  if (k === 'errand') return 'errand';
  if (k === 'plaza') return 'plaza';
  if (k === 'pray') return 'pray';
  if (k === 'wonder') return 'wonder';
  if (k === 'night') return 'night';
  if (k === 'cross') return 'river';
  return 'wander';
}

// Ce que dit l'infobulle de la carte au survol, dans la langue du joueur (les
// libellés { fr, en } de la fiche, résolus par tr()). `kindId` est la catégorie
// STABLE : la logique le lit, jamais le libellé affiché (`kind`).
const INHABITANT = { fr: 'Habitant', en: 'Inhabitant' };
export function describePick(pk) {
  const { kind, p } = pk;
  if (kind === 'boat') {
    boatIdentity(p);
    return {
      title: tr({ fr: 'Bac', en: 'Ferry' }),
      body: tr({ fr: `Passeur : ${p.driver}`, en: `Ferryman: ${p.driver}` }),
      kind: tr({ fr: 'Bateau', en: 'Boat' }), kindId: 'boat',
    };
  }
  if (kind === 'vehicle') {
    vehicleIdentity(p);
    const label = tr(vehicleLabel(p));
    return p.type === 'basket'
      ? { title: p.driver, body: label, kind: tr(INHABITANT), kindId: 'citizen' }
      : { title: label, body: p.driver, kind: tr({ fr: 'Véhicule', en: 'Vehicle' }), kindId: 'vehicle' };
  }
  const id = idOf(p, kind);
  return {
    title: id.name,
    body: kind === 'figure' ? lowerFirst(tr(activityOf(p, false))) : tr(p.role),
    kind: tr(INHABITANT), kindId: 'citizen',
  };
}

// Relevé complet de ce qui est désigné, ou null. `lost` = il n'est plus dans la
// rue : la caméra le lâche, la fiche le dit.
export function citizenSheet() {
  const f = CM.focus;
  if (!f) return null;
  const p = f.p;
  const lost = isLost(f);
  if (lost && f.cam) { f.cam = false; emit(); }
  if (f.kind === 'boat') {
    boatIdentity(p);
    return {
      kind: 'vehicle',
      person: false,
      name: { fr: 'Bac', en: 'Ferry' },
      label: { fr: 'Bac', en: 'Ferry' },
      driver: p.driver,
      driverLabel: { fr: 'Passeur', en: 'Ferryman' },
      activity: lost ? { fr: 'A quitté le fleuve', en: 'Left the river' }
        : p.state === 'cross' ? { fr: 'Traverse le fleuve', en: 'Crossing the river' }
          : { fr: 'Embarque ses voyageurs', en: 'Taking on passengers' },
      riders: ferryAboard(p),
      crossings: p.trip | 0,
      ...skyOf(),
      following: !!f.cam,
      lost,
    };
  }
  if (f.kind === 'vehicle') {
    vehicleIdentity(p);
    const person = p.type === 'basket';
    return {
      kind: 'vehicle',
      person,
      name: person ? p.driver : vehicleLabel(p),
      label: vehicleLabel(p),
      driver: person ? null : p.driver,
      activity: vehicleActivity(p, lost),
      ...vehicleLoad(p),
      ...skyOf(),
      following: !!f.cam,
      lost,
    };
  }
  // La personne, tirée d'un seul tenant (citizenIdentity.js) : âge, métier,
  // caractère et nom s'accordent au dessin et entre eux.
  const id = idOf(p, f.kind);
  const child = p.charType === 2;
  const fem = !!id.fem;
  const mood = moodOf(id.seed >>> 0, fem);
  // Le compagnon : meneur ou suiveur d'un passant, partenaire de flânerie d'un
  // promeneur du quai.
  const companion = p.lead || (p._f1 && p._f1.lead === p ? p._f1 : null) || p.mate || p._chatWith || null;
  // Le travail : l'atelier d'un passant, le port d'un porteur, le champ d'un
  // laboureur, ou un libellé posé par la scène (la Maison des Plaisirs).
  const work = p.workLabel || (p.workKey ? keyTitle(p.workKey) : tileTitle(p.work));
  return {
    kind: child ? 'child' : fem ? 'woman' : 'man',
    name: id.name,
    fem,
    age: id.age,
    job: id.job ? jobLabel(id.job, fem) : null,
    activity: activityOf(p, lost, fem),
    home: tileTitle(p.home),
    work,
    family: familyOf(p, f.kind, id),
    companion: companion ? idOf(companion).name : null,
    mood: mood.word,
    moodLevel: mood.level,
    moodCause: mood.cause,
    traits: id.traits.map((k) => traitWord(k, fem)).filter(Boolean),
    ...skyOf(),
    following: !!f.cam,
    lost,
  };
}

// LE CIEL DERRIÈRE LE PORTRAIT (idée 2) : l'heure et le temps qu'il fait là où il
// marche. `sky` : 'day', 'dusk' (la nuit tombe), 'dawn' (elle se lève), 'night' ;
// `precip` : 'rain', 'snow' ou null — les mêmes signaux que la carte (nightF,
// dayRising, rainF au-delà du premier palier de pluie, saison).
function skyOf() {
  const n = CM.nightF || 0;
  const sky = n >= 0.85 ? 'night' : n <= 0.15 ? 'day' : CM.dayRising ? 'dusk' : 'dawn';
  const precip = (CM.rainF || 0) > 0.15 ? ((CM.season | 0) === WINTER ? 'snow' : 'rain') : null;
  return { sky, precip };
}

// L'image du portrait est-elle prête à peindre ? Une image décodée, ou un CANVAS
// cuit : la coque d'un bateau du kit (boatKit.js) en est un, sans `complete` ni
// `naturalWidth` — la fiche du bac gardait sa niche vide pendant tout le suivi
// (BUG-87, audit du 2026-10-05).
export function portraitImgReady(img) {
  if (!img) return false;
  if (typeof img.getContext === 'function') return img.width > 0 && img.height > 0;
  return !!img.complete && img.naturalWidth > 0;
}

// L'image du portrait : la frame que joue en ce moment ce qui est désigné.
// `fit` = 'frame' (une personne : échelle réglée sur le cadre, un enfant reste
// plus petit qu'un adulte) ou 'ink' (un véhicule : il remplit la niche).
export function focusPortrait(now) {
  const f = CM.focus;
  if (!f) return null;
  const p = f.p;
  if (f.kind === 'boat') {
    const hb = p._hull || p._lastHull;
    if (p._hull) p._lastHull = p._hull;
    if (!hb || !hb.img || !hb.iw) return null;
    // La coque occupe les iw × ih premiers pixels de son canvas serré (cf. hullBox) :
    // son encre, en px (`fh` = 1).
    return { img: hb.img, sx: 0, fh: 1, ink: { l: 0, t: 0, r: hb.iw, b: hb.ih }, fit: 'ink' };
  }
  if (f.kind !== 'vehicle') {
    // Personnage de scène dessiné par son NOM de bande : il marche s'il marche
    // (porteur, laboureur, fille du ponton), sinon il pose.
    const fr = p.sprite
      ? namedPortraitFrame(p.sprite, p.dir, !!p.walking, p.walkDist ?? null, p.phase || 0, now)
      : citizenPortraitFrame(p, now);
    return fr && { ...fr, fit: 'frame' };
  }
  if (p.type === 'basket') {
    const fr = namedPortraitFrame(p.woman ? 'basket-woman' : 'basket-man', p.dir, (p.pauseT || 0) <= 0, p.rollDist, p.x * 0.02, now);
    return fr && { ...fr, fit: 'frame' };
  }
  const a = p._art;
  if (!a || !a.img || !a.img.naturalWidth) return null;
  return { img: a.img, sx: a.sx, fh: a.fh, ink: imgInkBox(a.img), fit: 'ink' };
}
