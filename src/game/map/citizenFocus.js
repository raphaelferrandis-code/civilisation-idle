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
//         sur l'autre rive : suivi, l'un d'eux emmène la caméra sur le bac.
//     Les deux derniers sont dessinés par drawNamedAgentIso : ils se signalent
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
  imgInkBox, citizenPortraitFrame, namedPortraitFrame,
} from './agents.js';
import { snapZoom, screenToWorld } from './iso/projection.js';
import { snapDev } from './blitSnap.js';
import { cmPasserbyName } from './cityNaming.js';
import { tr } from '../core/i18n.js';

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
  const consider = (kind, p, x0, y0, x1, y1) => {
    const dx = Math.max(x0 - sx, 0, sx - x1);
    const dy = Math.max(y0 - sy, 0, sy - y1);
    const d = Math.hypot(dx, dy);
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
  // Le bac : sa coque peinte à cette frame (null hors champ, cf. isoPort).
  for (const sh of CM.ships || []) {
    if (sh.kind !== 'ferry') continue;
    const b = hullBox(sh);
    if (b) consider('boat', sh, b.x0, b.y0, b.x1, b.y1);
  }
  return best;
}
// Silhouette d'une coque à l'écran : la boîte d'encre de l'image posée dans son
// carré de dessin (sh._hull, publié par le port à chaque frame où il la peint).
function hullBox(sh) {
  const hb = sh._hull;
  if (!hb || !hb.img) return null;
  const ink = imgInkBox(hb.img);
  return { x0: hb.bx + ink.l * hb.dw, y0: hb.by + ink.t * hb.dw, x1: hb.bx + ink.r * hb.dw, y1: hb.by + ink.b * hb.dw };
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
  CM.focus = { p, kind, cam: true };
  CM.camGoal = null;
  CM.panVel = null;
  const z = CM.zoomGoal ?? (CM.cam ? CM.cam.zoom : FOCUS_TUNE.zoom);
  if (z < FOCUS_TUNE.zoom) CM.zoomGoal = snapZoom(FOCUS_TUNE.zoom);
  emit();
}
export function focusCitizen(p) {
  focusPick({ kind: 'citizen', p });
}
// Le joueur reprend la caméra (drag, flèches, recentrage) : la fiche reste
// ouverte, l'anneau aussi, seul le suivi s'arrête.
export function releaseFocusCamera() {
  if (!CM.focus || !CM.focus.cam) return;
  CM.focus.cam = false;
  emit();
}
export function resumeFocusCamera() {
  if (!CM.focus) return;
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
  // Le bac, ou le voyageur monté à bord : la coque (sa dernière position peinte
  // si elle sort un instant du champ).
  const sh = f.kind === 'boat' ? p : ferryLeg(p) === 'aboard' ? p.ferryShip : null;
  if (sh) {
    if (sh._hull) sh._camAt = { x: sh._hull.wx, y: sh._hull.wy };
    return sh._camAt || null;
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
  // Le bac, ou le voyageur à son bord : au-dessus de la coque — sauf pendant qu'on
  // le VOIT monter la passerelle (peint cette frame) : au-dessus de lui.
  const sh = f.kind === 'boat' ? p
    : ferryLeg(p) === 'aboard' && p._seenFrame !== frameN ? p.ferryShip : null;
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

// Personnage de scène : une graine tirée de son dessin (phase, variante), puis le
// même nom accordé que les passants. Posée UNE fois — son nom ne change plus.
// Rangée à part (`p.persona`), JAMAIS dans `p.name` : sur les places, `name` est
// déjà le nom de la bande dessinée. Une scène peut fixer le nom elle-même
// (`p.stageName` : les filles de la Maison des Plaisirs gardent le leur d'âge en âge).
function figureIdentity(p) {
  if (p.persona) return p.persona;
  // `figSeed` : graine donnée par la scène (pont, bac…) ; sinon celle du dessin.
  const seed = p.figSeed != null ? mixHash(p.figSeed >>> 0, 29)
    : mixHash(Math.floor((p.phase || 0) * 1e9) >>> 0, (p.skinVariant || 0) + 31);
  const fem = p.charType === 1 || (p.charType === 2 && ((seed >>> 17) & 1) === 1);
  p.persona = { seed, fem, name: p.stageName || cmPasserbyName(seed, bandNow(), fem, p.charType === 2) };
  return p.persona;
}
// Qui il est, quelle que soit sa nature : { name, seed, fem }.
const idOf = (p, kind) => (kind === 'figure' || p.scene ? figureIdentity(p) : p);
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
    case 'tram':
      return e === 'cos8' ? { fr: 'Tram flottant', en: 'Floating tram' }
        : e === 'cos7' ? { fr: 'Tram magnétique', en: 'Maglev tram' }
          : { fr: 'Tramway', en: 'Tram' };
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
    case 'tram': case 'bus': return { fr: 'Dessert sa ligne', en: 'On its line' };
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
  if (v.type === 'tram' || v.type === 'bus' || v.type === 'caravan') return { riders: 3 + (s % 38) };
  return {};
}

// Âge adulte par âge de la cité (bande 0 → 9) : la vie s'allonge avec elle.
const ADULT_AGE = [[15, 42], [16, 48], [16, 56], [17, 60], [18, 66], [18, 74], [20, 82], [22, 104], [24, 130], [30, 160]];

const TRAITS = [
  { m: 'Bavard', f: 'Bavarde', en: 'Chatty' },
  { m: 'Taciturne', f: 'Taciturne', en: 'Quiet' },
  { m: 'Pieux', f: 'Pieuse', en: 'Pious' },
  { m: 'Rêveur', f: 'Rêveuse', en: 'Dreamy' },
  { m: 'Gourmand', f: 'Gourmande', en: 'Greedy' },
  { m: 'Curieux', f: 'Curieuse', en: 'Curious' },
  { m: 'Économe', f: 'Économe', en: 'Thrifty' },
  { m: 'Généreux', f: 'Généreuse', en: 'Generous' },
  { m: 'Rancunier', f: 'Rancunière', en: 'Spiteful' },
  { m: 'Joyeux', f: 'Joyeuse', en: 'Cheerful' },
  { m: 'Superstitieux', f: 'Superstitieuse', en: 'Superstitious' },
  { m: 'Lève-tôt', f: 'Lève-tôt', en: 'Early riser' },
  { m: 'Têtu', f: 'Têtue', en: 'Stubborn' },
  { m: 'Courageux', f: 'Courageuse', en: 'Brave' },
  { m: 'Prudent', f: 'Prudente', en: 'Cautious' },
  { m: 'Fier', f: 'Fière', en: 'Proud' },
  { m: 'Distrait', f: 'Distraite', en: 'Absent-minded' },
  { m: 'Travailleur', f: 'Travailleuse', en: 'Hard-working' },
  { m: 'Frileux', f: 'Frileuse', en: 'Cold-blooded' },
  { m: 'Râleur', f: 'Râleuse', en: 'Grumpy' },
];
const MOODS = [   // du pire au meilleur, seuils sur l'humeur 0..1
  { at: 0, m: 'En colère', f: 'En colère', en: 'Angry' },
  { at: 0.25, m: 'Inquiet', f: 'Inquiète', en: 'Worried' },
  { at: 0.42, m: 'Soucieux', f: 'Soucieuse', en: 'Uneasy' },
  { at: 0.6, m: 'Content', f: 'Contente', en: 'Content' },
  { at: 0.8, m: 'Radieux', f: 'Radieuse', en: 'Radiant' },
];
const word = (w, fem) => ({ fr: fem ? w.f : w.m, en: w.en });

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

function activityOf(p, lost) {
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
    // Elle ne revient pas : la navette l'emmène à la Maison des Plaisirs.
    return lost ? { fr: 'Parti pour la Maison des Plaisirs', en: 'Off to the House of Pleasures' }
      : { fr: 'Attend la navette des Plaisirs', en: 'Waiting for the shuttle' };
  }
  if (p.scene === 'port' && lost) return { fr: "A fini l'escale", en: 'Done unloading' };
  if (lost) return { fr: 'A quitté la rue', en: 'Left the street' };
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
  if (p._nightHidden) return night ? { fr: 'Dort', en: 'Asleep' } : { fr: 'Chez soi', en: 'At home' };
  if (p._vanish !== undefined) return night ? { fr: 'Va se coucher', en: 'Going to bed' } : { fr: 'Rentre au logis', en: 'Heading home' };
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
  if (L) return L.chatT > 0 ? chat : activityOf(L, false);
  if (p.chatT > 0 && (p._f1 || p._chatWith)) return chat;
  const k = p.goalKind;
  // Lot 2 de PLAN-COMPORTEMENTS : on ENTRE par la porte (travail, courses, maison).
  if (p._enter && p._vanish !== undefined) {
    if (k === 'work') return { fr: 'Entre au travail', en: 'Going in to work' };
    if (k === 'errand') return { fr: 'Entre dans une boutique', en: 'Stepping into a shop' };
    return { fr: 'Rentre chez soi', en: 'Going inside' };
  }
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
  if (k === 'night') return { fr: 'Se promène à la nuit tombée', en: 'Out for an evening stroll' };
  // Le rôle tiré à l'apparition (ageVisualConfig) est une unité { fr, en } ; une
  // simple chaîne (ancien format) n'a pas d'anglais.
  const r = p.role;
  const ro = r && typeof r === 'object';
  return { fr: cap(ro ? r.fr : r) || 'Flâne', en: cap(ro ? r.en : null) || 'Strolling' };
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
      following: !!f.cam,
      lost,
    };
  }
  const id = idOf(p, f.kind);
  const band = bandNow();
  const seed = (id.seed >>> 0) || mixHash(Math.round((p.phase || 0) * 1000), 7);
  const child = p.charType === 2;
  const fem = !!id.fem;
  const span = ADULT_AGE[Math.max(0, Math.min(ADULT_AGE.length - 1, band))];
  const age = child ? 4 + (mixHash(seed, 1) % 10) : span[0] + (mixHash(seed, 1) % (span[1] - span[0] + 1));
  const t1 = mixHash(seed, 2) % TRAITS.length;
  let t2 = mixHash(seed, 3) % (TRAITS.length - 1);
  if (t2 >= t1) t2 += 1;
  // Humeur = la santé de la cité (CM.healthF, la même qui teinte la carte),
  // tirée par le tempérament de chacun, assombrie par l'émeute et l'averse.
  let mood = (CM.healthF ?? 0.6) + ((mixHash(seed, 4) % 1000) / 1000 - 0.5) * 0.3;
  if (Array.isArray(CM.rioters) && CM.rioters.length) mood -= 0.25;
  if ((CM.rainF || 0) > 0.15) mood -= 0.06;
  let m = MOODS[0];
  for (const lvl of MOODS) if (mood >= lvl.at) m = lvl;
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
    age,
    activity: activityOf(p, lost),
    home: tileTitle(p.home),
    work,
    companion: companion ? idOf(companion).name : null,
    mood: word(m, fem),
    traits: [word(TRAITS[t1], fem), word(TRAITS[t2], fem)],
    following: !!f.cam,
    lost,
  };
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
    if (!hb || !hb.img) return null;
    return { img: hb.img, sx: 0, fh: hb.img.naturalHeight || hb.img.height, ink: imgInkBox(hb.img), fit: 'ink' };
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
