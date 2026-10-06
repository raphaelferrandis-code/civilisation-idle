"use strict";
/* ============================================================================
 * L'AURA DE LA MAISON DES PLAISIRS
 *
 * Le monument était un autocollant : posé sur l'eau, il n'émettait rien — pas
 * une lueur, pas un reflet — alors qu'il porte cent lanternes cuites dans son
 * sprite. Raph, 2026-08-22 : « lui donner une sorte d'aura autour, un peu comme
 * ce qui est fait pour la merveille de l'oeil, mais unique à ce batiment ».
 *
 * ⛔ CE QU'ON NE FAIT PAS, ET POURQUOI :
 *   - PAS d'anneau qui tourne : c'est la signature de l'Œil (gyroscope calculé,
 *     renderBuildings.js), et le doc du lieu proscrit explicitement « ni orbe
 *     lisse, ni halo cyan, ni anneau qui tourne » (anti « trop IA ») ;
 *   - PAS de dégradé lisse en guise de retombée : la lumière tombe par PALIERS
 *     (bandes concentriques, segments de faisceau), c'est ce qui la garde dans
 *     la DA pixel ;
 *   - PAS de cyan : la palette est relevée SUR LE SPRITE (magenta néon, braise,
 *     or), pas inventée.
 *
 * TROIS COUCHES, chacune à sa place dans la frame :
 *   1. LE CERNE — une ellipse posée à plat DANS LE PLAN ISO, allongée par le
 *      courant. Déposée dans la couche de lumière au tri peintre, à la
 *      profondeur du monument : la tour découpe ensuite sa propre silhouette
 *      dedans (lightCut), donc la lumière passe derrière elle, jamais
 *      dessus. C'est la figure INVERSE de celle de l'Œil : la sienne est une
 *      sphère en l'air, celle-ci est couchée sur l'eau — elle marque un
 *      territoire, pas un halo.
 *   2. LES FAISCEAUX — deux ou trois rais qui fouillent le ciel depuis la
 *      flèche. Le doc les avait validés dès la conception (« des faisceaux de
 *      lumière qui percent le ciel, visibles de très loin ») et ils n'avaient
 *      jamais été faits. Ils rendent le lieu repérable quand il ne fait plus
 *      que quarante pixels à l'écran.
 *   3. LES LANTERNES — elles se détachent des plateaux et montent. Rien d'autre
 *      sur la carte ne monte : les feuilles tombent, les lucioles errent.
 *
 * ⚠ 2 et 3 vivent dans la PASSE DE NUIT, après le voile — un halo peint avant
 * perd la moitié de son intensité et vire au bleu (cf. l'en-tête de
 * flameGlow.js, la leçon est déjà payée). 1 passe par la couche de lumière,
 * qui est blitée au même moment.
 *
 * Molette : window.__plaisirsAura({ ring: 0, beams: 1.4, … }).
 * ========================================================================== */
import { CM } from '../layout.js';
import { state } from '../../core/state.js';
import { worldToScreen, screenToWorld } from './projection.js';
import { _frac, _rnd } from './isoMath.js';
import { rasterCanvas } from '../pixelUtil.js';
import { LIGHT_LAYER, lightCtx, lightCut, litBox } from '../lightLayer.js';
import { queueFlameGlow } from '../flameGlow.js';
import { WINTER } from '../seasonMode.js';
import { wonderKitForBand } from './wonderKits.js';
import { bakePlaisirs, plaisirsGames, plaisirsShadow } from './plaisirsBake.js';
import { SUN_SHADOW, sunShear, drawSunShadowPlane, sunShadowVersion } from './isoSunShadow.js';
import { noteReflectionImage } from './isoReflect.js';
import { hexToRgbStr } from './isoProps.js';
import { drawSpriteOutline, dropSpriteOutline } from './isoEngineScene.js';
import { HOVER_GOLD } from './isoPalette.js';
import { plaisirsCast } from './plaisirsCast.js';
import { plaisirsSkin, preloadPlaisirsSkin, applyPlaisirsSkin } from './plaisirsSkin.js';
import { rippleField, noteRipples } from './waterRipples.js';
import { colRows, sliceRows, rowCropExact } from './rowCrop.js';
import { drawNamedAgentIso, AGENT_SCALE } from '../agents.js';
import { focusMark, drawFocusRingAt, noteSceneFigure, sceneRingWidth, keepFigureAlive } from '../citizenFocus.js';

// ── Palette de l'aura : celle des LUMIÈRES du lieu, à son âge ────────────────
// Refonte du 2026-10-02 : le lieu n'est plus un sprite néon unique, il porte des
// torches, des lampions, du gaz, du néon puis la lumière de l'ère. L'aura prend
// donc la couleur de ce qui brûle sur lui — un liseré rose sur un radeau de
// l'âge du feu se lirait comme une décalcomanie (la règle d'origine, relevée sur
// le sprite : `232,40,128` néon, `249,96,45` braise, `252,190,93` or).
// `NEON` = la teinte du LISERÉ, `EMBER` = celle du cœur, `GOLD` = les ferrures.
let NEON = '232,72,58';
let EMBER = '249,110,50';
let GOLD = '252,190,93';
function setAuraBand(band) {
  if (band >= 7) { NEON = hexToRgbStr(wonderKitForBand(band).pal.glow); EMBER = '255,214,170'; GOLD = '252,190,93'; }
  else if (band === 6) { NEON = '232,40,128'; EMBER = '249,96,45'; GOLD = '252,190,93'; }
  else { NEON = '232,72,58'; EMBER = '249,110,50'; GOLD = '252,190,93'; }
}

export const PLAISIRS_AURA = {
  on: true,
  // LE CERNE. `a`/`b` en TUILES : demi-axes le long du courant et en travers.
  // ⚠ `b` doit rester sous la demi-largeur du lit évasé (≈ 5,5 tuiles au droit
  // du monument, cf. PLAISIRS.spread dans layout.js), sinon le cerne mord sur
  // la berge et la lumière de l'eau se met à éclairer de l'herbe.
  // `bandA` est VOLONTAIREMENT minuscule : la nappe n'est qu'un liant, ce sont
  // les éclats qui portent la figure (cf. le § MIROITEMENT).
  // (2026-10-02 : 5,2 × 3,3 → 5,7 × 3,9 — l'îlot construit fait 2,8 tuiles de
  // rayon, la guirlande flottante doit rester DEHORS, sur l'eau.)
  ring: 1, a: 5.7, b: 3.9, bands: 4, bandA: 0.03, dots: 22, ringSec: 6.4, dotDay: 0.6,
  flecks: 84, fleckSec: 2.9,
  // LES FAISCEAUX. `len` et `w` en hauteurs de sprite ; `sweep` et `gap` en
  // radians. ⚠ `w` est le nerf du réglage : à 0,15 les trois rais se recouvraient
  // en un unique coin rose translucide qui grisait la ville derrière (planche du
  // 2026-08-22). Un projecteur est MINCE — c'est sa finesse qui le fait lire
  // comme un rai plutôt que comme un voile.
  beams: 1, beamN: 3, beamSec: 19, sweep: 0.42, gap: 0.44, len: 3.4, w: 0.055, beamA: 0.115,
  // LES LANTERNES. `per` = par plateau (6 plateaux → 24 en vol). `rise` en
  // hauteurs de sprite : au-delà de ~1 elles quittent la colonne du monument et
  // se lisent comme des lumières de ville qui flottent, plus comme un lâcher.
  lant: 1, per: 4, lantSec: 9.5, rise: 1, sway: 0.055,
  // Part d'aura visible en PLEIN JOUR. Les faisceaux, eux, sont nocturnes purs :
  // un projecteur à midi ne se voit pas, il se devine — et un rai peint sur un
  // ciel clair lit comme un défaut de rendu.
  // ⚠ 0,14 rendait l'aura RIGOUREUSEMENT invisible de jour (planche du
  // 2026-08-22) : le lieu n'avait plus d'aura que la nuit, or on la lui a
  // demandée tout court. À 0,28 l'eau scintille encore autour de lui à midi
  // sans que le fleuve tourne au rose.
  day: 0.28,
};
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__plaisirsAura = (o) => {
    if (o === false) PLAISIRS_AURA.on = false;
    else if (o && typeof o === 'object') { PLAISIRS_AURA.on = true; Object.assign(PLAISIRS_AURA, o); }
    else PLAISIRS_AURA.on = true;
    return { ...PLAISIRS_AURA };
  };
}

// Hash déterministe [0,1) (_rnd) et partie fractionnaire (_frac) : ceux des particules
// d'ambiance, importés d'isoMath (ils y étaient recopiés mot pour mot). AUCUN
// Math.random : les captures doivent rester reproductibles.

// Halo additif local (copie de celui d'isoRenderer : l'importer créerait un
// cycle ES avec le renderer qui, lui, nous importe).
function addGlow(ctx, x, y, r, col, alpha) {
  if (!(alpha > 0.004) || !(r >= 0.6) || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${alpha.toFixed(3)})`);
  g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Visibilité de l'aura à cet instant du cycle : un plancher de jour + la nuit.
// Même forme que flameGlowAlpha — les deux doivent respirer ensemble, sinon
// l'aura se décale du reste des lumières de la carte au crépuscule.
const auraVis = () => PLAISIRS_AURA.day + (1 - PLAISIRS_AURA.day) * ((CM && CM.nightF) || 0);

const RING_SEG = 72;
const _ring = new Float32Array(RING_SEG * 2);

// Ellipse du cerne, en coordonnées ÉCRAN. Le grand axe suit la TANGENTE DU
// COURANT (spot.tx/ty, publiée par layout.js) : une ellipse alignée sur les axes
// de la grille se lirait comme un objet posé, pas comme une nappe de lumière
// portée par le fleuve — et elle déborderait sur les berges d'un côté.
function ringToScreen(spot, k) {
  const T = CM.TILE;
  const tx = spot.tx, ty = spot.ty;
  const nx = -ty, ny = tx;                        // normale au courant
  const A = PLAISIRS_AURA.a * k, B = PLAISIRS_AURA.b * k;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < RING_SEG; i += 1) {
    const th = (Math.PI * 2 * i) / RING_SEG, c = Math.cos(th), s = Math.sin(th);
    const p = worldToScreen((spot.x + A * c * tx + B * s * nx) * T, (spot.y + A * c * ty + B * s * ny) * T);
    _ring[i * 2] = p.x; _ring[i * 2 + 1] = p.y;
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

function ringPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(_ring[0], _ring[1]);
  for (let i = 1; i < RING_SEG; i += 1) ctx.lineTo(_ring[i * 2], _ring[i * 2 + 1]);
  ctx.closePath();
}

/* ── LE CERNE ────────────────────────────────────────────────────────────────
 * Appelé DANS le tri peintre, juste avant le blit du monument. Dépose sa
 * lumière dans la couche (lightCtx) quand elle est armée — c'est elle qui la
 * fera passer par-dessus le voile de nuit ET la fera découper par tout ce que
 * le peintre dessine ensuite. Repli sur le contexte direct sinon (couche
 * éteinte, passe hors écran) : l'aura y perdra en éclat la nuit, mais elle
 * existe, et aucun appelant n'a à connaître la différence.
 *
 * La retombée est en BANDES concentriques additives (4 par défaut), pas en
 * dégradé : chaque bande est un aplat, le cœur reçoit la somme. C'est ce qui
 * donne le palier visible au bord de chaque anneau au lieu du fondu lisse qui
 * trahit l'image de synthèse.
 */
export function drawPlaisirsRing(spot, now) {
  const A = PLAISIRS_AURA;
  if (!A.on || !A.ring || !spot || CM.lodActive) return;
  const vis = auraVis() * A.ring;
  if (vis < 0.02) return;
  const b = ringToScreen(spot, 1);
  if (b.x1 < 0 || b.y1 < 0 || b.x0 > (CM.cw || 0) || b.y0 > (CM.ch || 0)) return;
  // La guirlande RESPIRE (+3 % de rayon) et ses halos débordent de 2,6 ampoules :
  // la zone déclarée à la couche de lumière les couvre — hors d'elle, leur lumière
  // était coupée, et s'accumulait sans être effacée.
  const pad = Math.ceil(0.03 * Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 3 * Math.max(3, Math.round(CM.TILE * CM.cam.zoom * 0.11)));
  const lc = lightCtx(b.x0 - pad, b.y0 - pad, b.x1 + pad, b.y1 + pad);
  const ctx = lc || CM.ctx;
  const direct = !lc;
  if (direct) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; }
  // Respiration : une seule onde lente sur toute la figure. Le rayon ne bouge
  // que de 3 % — au-delà, l'ellipse « pompe » et l'œil ne voit plus que ça.
  const t = (now || 0) / 1000;
  const breath = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / Math.max(0.5, A.ringSec));
  const nBands = Math.max(1, A.bands | 0);
  for (let k = nBands; k >= 1; k -= 1) {
    // De l'extérieur vers l'intérieur : chaque bande ajoute sa part.
    const f = (k / nBands) * (1 + 0.03 * breath);
    if (k < nBands) ringToScreen(spot, f);
    ringPath(ctx);
    // Teinte : néon au bord, braise au cœur — le lieu chauffe vers son pied.
    ctx.fillStyle = `rgba(${k > nBands * 0.6 ? NEON : EMBER},${(A.bandA * vis * (0.8 + 0.2 * breath)).toFixed(3)})`;
    ctx.fill();
  }
  /* ── LE MIROITEMENT : ce qui fait la figure ─────────────────────────────────
   * PREMIÈRE VERSION REFUSÉE (planche du 2026-08-22) : quatre grands aplats
   * concentriques donnaient une tache violette molle sur tout le fleuve —
   * précisément « l'orbe lisse » que le doc du lieu proscrit, et la nappe
   * mangeait son propre liseré.
   *
   * La carte sait déjà peindre de la lumière sur de l'eau, et elle ne le fait
   * PAS en aplats : les reflets du fleuve et ceux des lanternes de pont sont de
   * COURTS TRAITS HORIZONTAUX qui miroitent (isoBridge.js). On reprend cette
   * grammaire, en champ : des éclats semés dans l'ellipse, denses au pied du
   * monument, clairsemés au bord.
   *
   * Semés en coordonnées MONDE puis projetés — ils sont accrochés à l'eau, pas
   * à l'écran : la caméra glisse dessus sans les emmener. Positions par hash,
   * jamais Math.random : les captures doivent rester comparables d'une frame à
   * l'autre.
   */
  const nF = Math.max(0, A.flecks | 0);
  if (nF) {
    const T = CM.TILE, z = CM.cam.zoom;
    const tx = spot.tx, ty = spot.ty, nx = -ty, ny = tx;
    const dh = Math.max(1, Math.round(T * z * 0.045));
    const wob = (t * Math.PI * 2) / Math.max(0.4, A.fleckSec);
    for (let i = 0; i < nF; i += 1) {
      // Disque uniforme : rayon en √(hash) — sans la racine, tout se tasserait
      // au centre et le bord de l'ellipse resterait vide.
      const h1 = _rnd(i + 1, 3), h2 = _rnd(i + 11, 5), h3 = _rnd(i + 29, 7);
      const rr = Math.sqrt(h1), th = h2 * Math.PI * 2;
      const eu = rr * Math.cos(th), ev = rr * Math.sin(th);
      const sh = 0.5 + 0.5 * Math.sin(wob + h3 * 6.283);
      // Retombée radiale : le pied du monument brûle, le bord n'est qu'un scintillement.
      const a = vis * (0.08 + 0.58 * sh) * (1 - rr * rr * 0.82);
      if (a < 0.02) continue;
      const p = worldToScreen(
        (spot.x + A.a * eu * tx + A.b * ev * nx) * T,
        (spot.y + A.a * eu * ty + A.b * ev * ny) * T,
      );
      const dw = Math.max(2, Math.round(T * z * 0.16 * (0.55 + 0.9 * h3)));
      ctx.fillStyle = `rgba(${h1 < 0.6 ? NEON : h1 < 0.87 ? EMBER : GOLD},${a.toFixed(3)})`;
      // Le trait GLISSE d'un ou deux pixels au fil de l'onde : une eau qui
      // miroite bouge, une eau dont seule l'opacité varie clignote.
      ctx.fillRect(Math.round(p.x - dw / 2 + (sh - 0.5) * dh * 2), Math.round(p.y - dh / 2), dw, dh);
    }
  }
  // LISERÉ POINTILLÉ. Nombre de points FIXE (pas leur espacement) : c'est ce qui
  // garde la même densité à tous les zooms — la règle du gyroscope de l'Œil, la
  // seule chose qu'on lui emprunte. Carrés sur pixel ENTIER, comme tout le reste
  // de la DA. L'onde d'alpha court le long du liseré : ça miroite, ça ne tourne
  // pas — un cerne qui tourne serait l'anneau de l'Œil.
  ringToScreen(spot, 1 + 0.03 * breath);
  // CARRÉS, là où le miroitement est fait de traits : le liseré est une
  // GUIRLANDE de feux flottants amarrés au bord du domaine, l'eau à l'intérieur
  // est un reflet. Deux grammaires distinctes, donc deux choses distinctes.
  //
  // ⚠ PREMIER RÉGLAGE INVISIBLE, et mesuré comme tel : 44 points de 3 px à
  // alpha 0,16-0,56 ne changeaient que 360 pixels de l'image (diff canvas
  // avec/sans liseré) — ils existaient, mais ils se noyaient dans le GRAIN de
  // l'eau, qui porte ses propres moutons blancs. Sur une surface bruitée, un
  // point ne se lit que s'il est plus GROS et plus FRANC que le bruit : moitié
  // moins nombreux, deux fois plus larges, deux fois plus opaques, et chacun
  // pose son halo la nuit. Le compte reste FIXE (règle du gyroscope) — c'est
  // lui qui garde la densité constante à tous les zooms.
  const d = Math.max(3, Math.round(CM.TILE * CM.cam.zoom * 0.11));
  const nDots = Math.max(8, A.dots | 0);
  const nf = (CM && CM.nightF) || 0;
  // LA GUIRLANDE A SON PROPRE PLANCHER DE JOUR, et bien plus haut que le reste
  // de l'aura : ce sont des OBJETS amarrés, pas de la lumière. Un feu flottant
  // se voit à midi ; le miroitement de l'eau, non. Mesuré avec le plancher
  // commun (0,28) : de jour l'aura ne déplaçait que 4 284 px d'un écart moyen
  // de 13/765 — sous le seuil de perception sur une eau qui a déjà son grain.
  const visDot = (A.dotDay + (1 - A.dotDay) * nf) * A.ring;
  for (let i = 0; i < nDots; i += 1) {
    const s = (i / nDots) * RING_SEG;
    const i0 = Math.floor(s) % RING_SEG, fr = s - Math.floor(s), i1 = (i0 + 1) % RING_SEG;
    const px = _ring[i0 * 2] + (_ring[i1 * 2] - _ring[i0 * 2]) * fr;
    const py = _ring[i0 * 2 + 1] + (_ring[i1 * 2 + 1] - _ring[i0 * 2 + 1]) * fr;
    const wave = 0.5 + 0.5 * Math.sin((i / nDots) * Math.PI * 6 - t * 1.9);
    const a = visDot * (0.30 + 0.50 * wave);
    if (a < 0.02) continue;
    const col = i & 1 ? NEON : GOLD;
    if (nf > 0.15) addGlow(ctx, px, py, d * 2.6, col, a * 0.34 * nf);
    ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`;
    ctx.fillRect(Math.round(px - d / 2), Math.round(py - d / 2), d, d);
  }
  if (direct) ctx.restore();
}

/* ── LE LIEU ÉCLAIRE ─────────────────────────────────────────────────────────
 * Un monument qui porte des lanternes sans éclairer un pixel d'eau est un
 * autocollant (en-tête de flameGlow.js). Un foyer par REBORD de plateau (les
 * `ledges` que la recette publie : là où pendent les guirlandes), à la teinte de
 * ce qui brûle à cet âge — c'est leur SOMME qui rend le lieu incandescent, jamais
 * un seul halo géant (la leçon des 57 braseros du Mausolée). Déphasés.
 * Appelé DANS le peintre, AVANT les tranches : la couche de lumière les dépose à
 * la profondeur du lieu, et la découpe des tranches les range derrière lui.
 */
export function queuePlaisirsGlow(m, now) {
  if (!PLAISIRS_AURA.on || !m || CM.lodActive) return;
  const z = CM.cam.zoom, L = m.bk.ledges;
  const step = Math.max(1, Math.floor(L.length / 6));
  for (let i = 0; i < L.length; i += step) {
    const p = worldToScreen(m.cx + L[i].x, m.cy + L[i].y, L[i].h);
    queueFlameGlow(p.x, p.y, CM.TILE * z * 1.1, EMBER, now, i * 2.63, 0.45);
  }
}
const lantCol = (i) => [EMBER, NEON, GOLD][i % 3];

/* ── FAISCEAUX + LANTERNES ───────────────────────────────────────────────────
 * Passe de NUIT, après le voile — comme les lanternes de pont. Part de
 * `CM._plaisirsBox`, la boîte publiée par le peintre à la frame courante : une
 * seconde projection ici finirait par diverger du sprite (la leçon du hit-test,
 * déjà écrite dans isoRenderer).
 */
export function drawPlaisirsSky(now) {
  const A = PLAISIRS_AURA;
  if (!A.on) return;
  const box = CM._plaisirsBox, m = _frameModel;
  if (!box || !(box.dh > 4) || !m) return;
  // ⚠ LES FAISCEAUX SURVIVENT AU LOD, tout le reste non. C'est leur raison
  // d'être : « visibles de très loin » (doc du lieu), or le LOD s'arme
  // précisément au dézoom. Vingt-et-un trapèzes ne pèsent rien ; les lanternes
  // et leurs halos, si — elles s'éteignent avec le reste des particules.
  const lod = !!CM.lodActive;
  const nf = (CM && CM.nightF) || 0;
  const ctx = CM.ctx;
  const t = (now || 0) / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // ── LES FAISCEAUX ─────────────────────────────────────────────────────────
  // Apex au SOMMET publié par la recette. Chaque rai est une suite de trapèzes à
  // alpha décroissant : sept paliers francs plutôt qu'un dégradé, pour la même
  // raison que les bandes du cerne. Balayage lent et déphasé ; un rai qui revient
  // trop vite lit comme un gyrophare de police, pas comme une fête.
  // ⛔ Pas avant l'âge du NÉON : un projecteur sur un radeau de l'âge du feu ou
  // une rotonde de marbre serait un anachronisme (refonte du 2026-10-02).
  if (A.beams && nf > 0.15 && m.band >= 6) {
    const ap = worldToScreen(m.cx + m.bk.apex.x, m.cy + m.bk.apex.y, m.bk.apex.h);
    const ax = ap.x, ay = ap.y;
    const len = box.dh * A.len;
    const n = Math.max(1, A.beamN | 0);
    for (let i = 0; i < n; i += 1) {
      const ang = -Math.PI / 2
        + (i - (n - 1) / 2) * A.gap
        + Math.sin((t * Math.PI * 2) / Math.max(1, A.beamSec) + i * 2.09) * A.sweep;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = -sa, ny = ca;
      const col = i === ((n / 2) | 0) ? GOLD : NEON;
      const STEPS = 7;
      for (let k = 0; k < STEPS; k += 1) {
        const u0 = k / STEPS, u1 = (k + 1) / STEPS;
        const w0 = (0.025 + u0 * A.w) * box.dh, w1 = (0.025 + u1 * A.w) * box.dh;
        const a = A.beamA * nf * A.beams * Math.max(0, 1 - u0 * 1.12);
        if (a < 0.004) break;
        ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(ax + ca * len * u0 - nx * w0, ay + sa * len * u0 - ny * w0);
        ctx.lineTo(ax + ca * len * u1 - nx * w1, ay + sa * len * u1 - ny * w1);
        ctx.lineTo(ax + ca * len * u1 + nx * w1, ay + sa * len * u1 + ny * w1);
        ctx.lineTo(ax + ca * len * u0 + nx * w0, ay + sa * len * u0 + ny * w0);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // ── LES LANTERNES ─────────────────────────────────────────────────────────
  // Visibles de jour (ce sont des lampions de papier, pas de la lumière pure),
  // mais leur halo est nocturne. Fondu aux DEUX bouts : elles naissent au ras du
  // plateau et s'éteignent avant le haut de leur course — sans ça, une lanterne
  // apparaît et disparaît d'un coup, et l'œil ne voit que le pop.
  // ⛔ Pas de lâcher de lanternes à l'âge du feu : il n'y a ni papier ni lampion
  // sur le radeau, seulement des torches.
  if (A.lant && !lod && m.band >= 1) {
    const vis = auraVis() * A.lant;
    const size = Math.max(1, Math.round(CM.TILE * CM.cam.zoom * 0.07));
    const per = Math.max(1, A.per | 0);
    const L = m.bk.ledges, step = Math.max(1, Math.floor(L.length / 6));
    for (let e = 0; e < L.length; e += step) {
      const lp = worldToScreen(m.cx + L[e].x, m.cy + L[e].y, L[e].h);
      const ex = lp.x, ey = lp.y;
      for (let i = 0; i < per; i += 1) {
        const sd = _rnd(e + 1, i + 1), sd2 = _rnd(e + 7, i + 13);
        const ph = _frac(t / (A.lantSec * (0.8 + sd * 0.5)) + sd);
        const f = Math.min(1, ph / 0.15) * Math.min(1, (1 - ph) / 0.35);
        if (f < 0.05) continue;
        const ly = ey - ph * box.dh * A.rise;
        const lx = ex + (sd2 - 0.5) * box.dw * 0.035
          + Math.sin(ph * Math.PI * 2.2 + sd2 * 6.28) * box.dw * A.sway * ph;
        const col = lantCol(e + i);
        addGlow(ctx, lx, ly, size * 3.2, col, Math.min(0.45, f * vis * nf * 0.6));
        ctx.fillStyle = `rgba(${col},${(f * vis * 0.9).toFixed(3)})`;
        ctx.fillRect(Math.round(lx - size / 2), Math.round(ly - size / 2), size, size);
      }
    }
  }
  ctx.restore();
}

// ── LE MONUMENT, CONSTRUIT PAR LE CODE (refonte du 2026-10-02) ───────────────
// Le sprite néon unique (`plaisirs-t3.png`) cède la place à une CUISSON par âge et
// par jeux ouverts (iso/plaisirsBake.js), même main que les merveilles. Ce module
// la pose sur l'eau, la trie avec la ville, l'éclaire et la rend cliquable.
// Depuis, chaque âge porte un HABILLAGE PixelLab (plaisirsSkin.js) : la recette ne
// fournit plus que la géométrie (silhouette, hauteurs, corniches, tour des filles),
// sa matière et ses props ne sont plus jamais montrés (audit du 05/10, MORT-15).

// La clé de cuisson. Sur un HABILLAGE (`skinned`), l'hiver et la boutique ne changent
// rien à l'octet près — R, H, D, N, reflet, corniches, tour des filles (audit du 05/10,
// PERF-13 ; plaisirsBakeKey.test.js) : la neige ne touche que les couleurs du code, que
// l'habillage écrase, et le pavillon de la boutique tombe sous sa matière. Ils sortaient
// pourtant de la clé : une cuisson de plus à chaque hiver et au premier effondrement.
// Les autres jeux y restent : ils déplacent des hauteurs (98 px à l'âge du feu), donc un
// peu d'ombre et de reflet.
export function plaisirsBakeKey(band, g, winter, skinned) {
  const games = (g.osselets ? 'o' : '') + (g.tickets ? 't' : '') + (g.cartes ? 'c' : '') + (g.icare ? 'i' : '') + (g.boutique && !skinned ? 'b' : '');
  return band + ':' + games + (winter && !skinned ? ':w' : '') + (skinned ? ':skin' : '');
}

// Molette : `__plaisirsTune.band = n` force l'âge (null : celui de la ville) ;
// `occlude = false` coupe la découpe des filles par ce qui est devant elles (A/B).
export const plaisirsTune = { band: null, slice: 8, occlude: true };

// (rasterCanvas : ../pixelUtil.js.)
// Plages de rangées occupées de la tranche en cours (cf. rowCrop.js), sans allocation.
const _rowsR = [0, 0], _rowsL = [0, 0], _rowsN = [0, 0];
const _bakes = new Map();
// La dernière cuisson rendue : l'âge d'avant, gardé à l'écran le temps que l'habillage
// du nouvel âge arrive.
let _lastBake = null;
function bakeFor(band, g, winter) {
  if (typeof document === 'undefined') return null;
  // L'HABILLAGE PixelLab de l'âge (plaisirsSkin.js) remplace la matière du code. Audit
  // du 05/10 (PERF-13) : le rendu du code n'est plus cuit le temps qu'il arrive (une
  // cuisson de 50 à 140 ms, jetée une frame plus tard) — l'âge d'avant reste affiché,
  // ou rien la toute première fois. Ni même si l'image est perdue (MORT-15) : les dix
  // âges sont habillés, la matière du code n'est plus jamais montrée — comme une scène
  // moteur sans son PNG (MORT-2), le lieu garde ce qu'il avait, ou rien.
  const skin = plaisirsSkin(band);
  if (!skin) return _lastBake;
  // L'ombre portée est cuite avec le reste : sa géométrie (sunShadowVersion, que la
  // molette __sunShadow fait changer) entre dans la clé, comme pour les autres scènes.
  const key = plaisirsBakeKey(band, g, winter, !!skin) + ':s' + sunShadowVersion();
  let e = _bakes.get(key);
  if (e) {
    // Le moins récemment servi part le premier (cf. le plafond plus bas).
    if (e !== _lastBake) { _bakes.delete(key); _bakes.set(key, e); }
    return (_lastBake = e);
  }
  // La recette ne sert plus que la GÉOMÉTRIE (silhouette, hauteurs, corniches, tour des
  // filles) : l'habillage en remplace la matière. Ses lumières et fanions (`props`)
  // tomberaient à côté du dessin : ils ne sont plus posés (MORT-15).
  let out = bakePlaisirs(wonderKitForBand(band, winter), g);
  out = { ...out, ...applyPlaisirsSkin(out, skin) };
  const R = out.R, occ = new Uint8Array(R.w);
  let x0 = R.w, y0 = R.h, x1 = -1, y1 = -1;
  for (let i = 0; i < R.w; i += 1) {
    for (let j = 0; j < R.h; j += 1) {
      if (!R.data[(j * R.w + i) * 4 + 3]) continue;
      occ[i] = 1;
      if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
    }
  }
  // Ombre et reflet EXACTS, tirés de la hauteur de chaque pixel (plaisirsBake.js) :
  // le reflet générique retournait chaque colonne autour de son pixel le plus bas, et
  // le pont du radeau se reflétait comme s'il était dressé (Raph, 2026-10-03).
  const M = out.mirror;
  const { kx, ky } = sunShear();
  const S = plaisirsShadow(R, out.H, kx, ky);
  let shCv = null;
  if (S) {
    shCv = document.createElement('canvas');
    shCv.width = S.w; shCv.height = S.h;
    const sc = shCv.getContext('2d');
    // Une seule pose d'image (audit du 05/10, PERF-13 : 7 700 à 27 000 fillRect d'un
    // pixel) ; mêmes octets qu'avant pour une teinte opaque en #rrggbb (celle du jeu) —
    // toute autre teinte posée à la molette `__sunShadow` retombe sur le pixel à pixel.
    const hex = /^#([0-9a-f]{6})$/i.exec(SUN_SHADOW.col);
    if (hex) {
      const v = parseInt(hex[1], 16), img = sc.createImageData(S.w, S.h), px = img.data;
      for (let k = 0; k < S.mask.length; k += 1) {
        if (!S.mask[k]) continue;
        px[k * 4] = v >> 16; px[k * 4 + 1] = (v >> 8) & 255; px[k * 4 + 2] = v & 255; px[k * 4 + 3] = 255;
      }
      sc.putImageData(img, 0, 0);
    } else {
      sc.fillStyle = SUN_SHADOW.col;
      for (let j = 0; j < S.h; j += 1) for (let i = 0; i < S.w; i += 1) if (S.mask[j * S.w + i]) sc.fillRect(i, j, 1, 1);
    }
  }
  e = { key, band, R, D: out.D || null, cv: rasterCanvas(R), cvN: out.N ? rasterCanvas(out.N) : null, occ,
    mir: M ? { ox: M.ox, oy: M.oy, w: M.w, h: M.h, cv: rasterCanvas(M) } : null,
    sh: S ? { ox: S.ox, oy: S.oy, w: S.w, h: S.h, cv: shCv } : null,
    box: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    ledges: out.ledges || [], apex: out.apex || { x: 0, y: 0, h: R.h }, foot: out.foot || 64,
    // L'habillage replace les filles sur SES planchers : le tour de SON pont, le balcon
    // derrière SA balustrade (plaisirsSkin.js).
    stroll: out.stroll ? { ...out.stroll, ...(out.walk || {}), ...(out.balcony ? { balcony: out.balcony } : {}), ...(out.door ? { door: out.door } : {}) } : null,
    rail: out.rail || null, skinned: !!skin,
    // Ce qui vit dans l'habillage (plaisirsSkin.js, `live`) : N images côte à côte.
    live: out.live ? { cv: rasterCanvas({ w: out.live.w, h: out.live.h, data: out.live.data }), n: out.live.n, ms: out.live.ms } : null,
    // Rangées occupées par colonne : la matière, la nuit, et le vivant (ses N images).
    rowsR: colRows(R), rowsN: out.N ? colRows(out.N) : null, rowsLive: out.live ? colRows(out.live) : null,
    ripples: plaisirsRipples(R, out.H) };
  // Audit du 05/10 (MEM-3) : le cache gardait jusqu'à 13 cuissons de 2,6 à 15 Mo, de
  // tous les âges traversés. Ne restent que l'âge cuit et le précédent (celui qu'on
  // montre le temps que l'habillage du nouvel âge arrive, cf. `_lastBake`) ; un âge
  // revisité, au cycle suivant, se recuit. Le plafond reste en garde-fou (les variantes
  // d'un même âge : jeux ouverts).
  for (const [k, b] of _bakes) if (b.band !== band && b.band !== band - 1) _bakes.delete(k);
  if (_bakes.size > 12) _bakes.delete(_bakes.keys().next().value);
  _bakes.set(key, e);
  return (_lastBake = e);
}

// LES REMOUS AU PIED DU LIEU (iso/waterRipples.js ; Raph, 2026-10-04 : « fais aussi le
// débarcadère des Plaisirs »). L'habillage PixelLab n'a pas la géométrie du code : on la
// MESURE sur l'image cuite — chaque pixel porte sa hauteur au-dessus de l'eau (H) ; le
// bas de la silhouette (rien dessous) AU RAS DE L'EAU (H < 1,5 : marches qui plongent,
// ponton, pieux, bord du radeau) est le contact. Un point sur deux, chacun un petit pieu,
// dans le repère du lieu (x, y depuis le pied du fût) ; pas de sillage (trop de points).
function plaisirsRipples(R, H) {
  if (!H) return null;
  const posts = [];
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      const k = j * R.w + i;
      if (!R.data[k * 4 + 3] || H[k] >= 1.5) continue;
      if (j + 1 < R.h && R.data[(k + R.w) * 4 + 3]) continue;   // pas le bas de la silhouette
      if ((i + j) & 1) continue;
      const X = R.ox + i + 0.5, Y = R.oy + j + 1, h = H[k];
      posts.push([Y + h + X / 2, Y + h - X / 2, 0.5]);
    }
  }
  // SEULEMENT DEVANT la silhouette (Raph, 2026-10-04 : « le ponton est coupé et le bateau
  // sous l'eau, c'est normal ? ») : une ride part du contact dans tous les sens, et sa
  // moitié arrière se voyait par les jours de l'image — sous un tablier, au-dessus de la
  // barque amarrée entre deux pieux, un trait d'écume la noyait. On ne garde que l'eau
  // sous le dernier pixel opaque de sa colonne (ou hors des colonnes du lieu).
  const low = new Int32Array(R.w).fill(-1);
  for (let i = 0; i < R.w; i += 1) for (let j = R.h - 1; j >= 0; j -= 1) if (R.data[(j * R.w + i) * 4 + 3]) { low[i] = j; break; }
  const keep = (x, y) => {
    const i = Math.floor(x - y - R.ox), j = Math.floor((x + y) / 2 - R.oy);
    return i < 0 || i >= R.w || j > low[i];
  };
  return posts.length ? rippleField({ posts, seed: 77, keep }) : null;
}

// Le modèle de la frame (posé par la collecte, relu par le ciel et le survol).
let _frameModel = null;
function modelOf(pl) {
  const L = CM.layout;
  if (!L || !pl) return null;
  const band = plaisirsTune.band != null ? plaisirsTune.band | 0 : (L.counts && L.counts.eraBand) | 0;
  // L'habillage de l'âge SUIVANT se charge pendant qu'on regarde celui-ci : au
  // changement d'âge, il est là, et le lieu ne cuit qu'une fois.
  if (band < 9) preloadPlaisirsSkin(band + 1);
  const g = plaisirsGames(state, L.counts && L.counts.eraIndex);
  const bk = bakeFor(band, g, CM.season === WINTER);
  if (!bk) return null;
  const T = CM.TILE;
  // `bk.band` : l'âge réellement cuit (l'âge d'avant, le temps du chargement).
  return { pl, band: bk.band, g, bk, cx: pl.x * T, cy: pl.y * T };
}
// Le lieu est-il prêt à peindre ? (la collecte n'empile rien sinon).
export function plaisirsReady() { return typeof document !== 'undefined'; }

// Coin haut-gauche ÉCRAN du raster (repère local : X = x − y, Y = (x + y)/2 − h).
function originScreen(m) {
  const R = m.bk.R;
  return worldToScreen(m.cx + R.oy + R.ox / 2, m.cy + R.oy - R.ox / 2);
}
// Profondeur du bord AVANT du pied (un disque de rayon `foot`) sur la verticale
// locale X : sur la corde x − y = X, x + y vaut au plus √(2r² − X²).
function frontDepth(m, X) {
  const r = m.bk.foot;
  return m.cx + m.cy + Math.sqrt(Math.max(0, 2 * r * r - X * X));
}

// ── Tri peintre : des TRANCHES verticales, comme les merveilles ──────────────
// Un seul point de tri (l'ancien pied du sprite) faisait passer un bateau en
// aval DEVANT tout le lieu ou DERRIÈRE tout le lieu ; découpé en tranches triées
// au bord avant du pied dans leur colonne, il passe devant la façade qu'il longe
// et derrière celle qu'il contourne.
export function pushIsoPlaisirsItems(items, pl, now = null) {
  const m = modelOf(pl);
  _frameModel = m;
  if (!m || !m.bk.box) { CM._plaisirsBox = null; return; }
  setAuraBand(m.band);
  const R = m.bk.R, S = plaisirsTune.slice, z = CM.cam.zoom, bx = m.bk.box;
  const o = originScreen(m);
  // Boîte d'encre RÉELLEMENT dessinée, publiée pour le clic, le survol et le ciel.
  CM._plaisirsBox = { dx: o.x + bx.x * z, dy: o.y + bx.y * z, dw: bx.w * z, dh: bx.h * z };
  // Le cerne, les foyers, l'ombre et le reflet : une fois, sous tout le lieu.
  items.push({ d: m.cx + m.cy - 2 * m.bk.foot - 1, kind: 'plaisirs', m, part: 'base' });
  // HORS ÉCRAN, une tranche ne peint rien (audit du 05/10, PERF-51 : le lieu est posé
  // hors de la ville, donc souvent hors champ, et chaque tranche payait ses poses, sa
  // découpe et sa nuit). Elle ne pose que dans son rectangle [sx0, sx1[ × [y0, y1[ (cf.
  // drawIsoPlaisirsSeg) : celles qui tombent hors de l'écran ne sont pas empilées. La
  // base (cerne, foyers, ombre, reflet, remous), les décors et les filles, si — la
  // caméra qui suit l'une d'elles l'attend au tournant.
  const scrW = CM.cw, scrH = CM.ch, cull = scrW > 0 && scrH > 0;
  const rowsOff = cull && (Math.round(o.y + R.h * z) <= 0 || Math.round(o.y) >= scrH);
  for (let c0 = 0; c0 < R.w; c0 += S) {
    const c1 = Math.min(R.w, c0 + S);
    if (cull && (rowsOff || Math.round(o.x + c1 * z) <= 0 || Math.round(o.x + c0 * z) >= scrW)) continue;
    let any = false;
    for (let i = c0; i < c1; i += 1) if (m.bk.occ[i]) { any = true; break; }
    if (!any) continue;
    const Xa = R.ox + c0, Xb = R.ox + c1;
    const minAbs = Xa <= 0 && Xb >= 0 ? 0 : Math.min(Math.abs(Xa), Math.abs(Xb));
    items.push({ d: frontDepth(m, minAbs), kind: 'plaisirs', m, part: 'slice', c0, c1 });
  }
  // LES FILLES DE LA MAISON, dehors (les âges qui ont les leurs, plaisirsCast.js) :
  // deux font le tour du ponton, une accueille sous la marquise, une s'accoude au
  // balcon. ⚠ Le pont fait partie des TRANCHES du lieu (triées à leur bord avant) :
  // triée à son pied, une fille passait SOUS la tranche de sa colonne. Elle se peint
  // donc après TOUTES les tranches que sa silhouette chevauche, puis le lieu repeint
  // sur elle ce qui est DEVANT elle, au pixel (cf. girlOccluders) — la tranche
  // entière la coupait sur le pont qu'elle foulait, et la fille du balcon passait
  // devant la balustrade (Raph, 2026-10-03).
  const cast = plaisirsCast(m.band), st = m.bk.stroll;
  if (!cast || !st) return;
  const hw = CM.TILE * AGENT_SCALE / 2, girls = strollers(cast, st, now != null ? now : (typeof performance !== 'undefined' ? performance.now() : 0));   // l'horloge de la FRAME : figée, la capture est reproductible
  let minAbs = Infinity;
  for (const q of girls) {
    // Fiche d'habitant : la fille de ce poste est TOUJOURS la même (TROUPE), placée
    // même quand la rotonde la cache — la caméra qui la suit l'attend au tournant.
    const g = TROUPE[q.k];
    if (g) {
      const s = worldToScreen(m.cx + q.x, m.cy + q.y, q.h), w = screenToWorld(s.x, s.y);
      g.x = w.x; g.y = w.y; g.dir = q.dir; g.walking = q.walking; g.phase = q.k * 0.31;
      keepFigureAlive(g);
      q.g = g;
    }
    // Sa boîte (carrée, `hw` de demi-largeur) en X.
    const X = q.x - q.y, w = hw * q.spec.scale;
    minAbs = Math.min(minAbs, X - w <= 0 && X + w >= 0 ? 0 : Math.min(Math.abs(X - w), Math.abs(X + w)));
  }
  // Toutes après les tranches que l'une d'elles chevauche (élargi d'une tranche : une
  // tranche qui la touche peut s'étendre de S − 1 vers le centre), et entre elles dans
  // l'ordre de la profondeur : la promeneuse qui passe devant l'hôtesse est peinte après.
  const d0 = frontDepth(m, Math.max(0, minAbs - S)) + 0.6;
  for (const q of girls) items.push({ d: d0 + (q.x + q.y + 500) * 1e-5, kind: 'plaisirs', m, part: 'girl', q });
}
// LA TROUPE : les MÊMES quatre femmes, d'âge en âge et de ville en ville (Raph,
// 2026-10-03 : « pour la maison des plaisirs ça peut être les mêmes qui
// reviennent ? »). La tenue change avec l'époque (plaisirsCast), pas la personne :
// un nom de scène fixe, un rôle par poste (la danseuse et l'hôtesse du ponton, la
// courtisane sous la marquise, l'hôtesse du balcon). Un objet par poste, gardé :
// la fiche d'habitant la désigne et la suit (citizenFocus.js, scène 'plaisirs').
const TROUPE = [
  ['Ysoria la Rousse', { fr: 'Danseuse', en: 'Dancer' }],
  ['Soraya la Nomade', { fr: 'Hôtesse', en: 'Hostess' }],
  ['Linnea la Vive', { fr: 'Courtisane', en: 'Courtesan' }],
  ['Talia la Patiente', { fr: 'Hôtesse', en: 'Hostess' }],
].map(([stageName, role], slot) => ({
  scene: 'plaisirs', slot, stageName, charType: 1, figSeed: 0x9A15 + slot * 7919,
  workLabel: { fr: role.fr + ' · Maison des Plaisirs', en: role.en + ' · House of Pleasures' },
}));

// Où est chacune à l'instant `now` : { x, y, h, dir, walking, spec }.
const ISO_DIR = (vx, vy) => (Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 0 : 1) : (vy > 0 ? 2 : 3));
// `gap` : un secteur pris, [a, b] en degrés (0 à droite, 90 à gauche, devant entre
// les deux), ou plusieurs ([[a, b], …]) — escalier, kiosque, l'arrière de la maison.
// Elles font alors les cent pas sur les arcs ouverts, une par arc à tour de rôle,
// demi-tour à leurs bouts. `ex` : le tour est une ELLIPSE de l'écran ([X, Y] du
// centre, demi-axes ; repère du lieu) et non un cercle du sol — PixelLab a aplati les
// ponts de ses habillages (plaisirsSkin.js).
export function strollAt(st, a) {
  if (!st.ex) return [st.r * Math.cos(a), st.r * Math.sin(a)];
  const f = a + Math.PI / 4, X = st.ex[0] + st.ex[2] * Math.cos(f), s = 2 * (st.ex[1] + st.ex[3] * Math.sin(f) + st.h);
  return [(s + X) / 2, (s - X) / 2];
}
// Le tour en LONGUEUR AU SOL (px) : sur une ellipse de l'écran, l'angle n'avance pas à
// vitesse constante au sol (audit des comportements, 2026-10-04) — une table angle →
// longueur par tour, relue dans les deux sens.
const TURN = 720, _len = new WeakMap();
function strollLen(st) {
  let S = _len.get(st);
  if (S) return S;
  S = new Float64Array(TURN + 1);
  let [px, py] = strollAt(st, 0);
  for (let i = 1; i <= TURN; i += 1) {
    const [x, y] = strollAt(st, (i / TURN) * 2 * Math.PI);
    S[i] = S[i - 1] + Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  _len.set(st, S);
  return S;
}
function lenOf(S, a) {
  const t = a / (2 * Math.PI), n = Math.floor(t), f = (t - n) * TURN, i = Math.min(TURN - 1, Math.floor(f));
  return n * S[TURN] + S[i] + (S[i + 1] - S[i]) * (f - i);
}
function angleOf(S, s) {
  const n = Math.floor(s / S[TURN]), r = s - n * S[TURN];
  let lo = 0, hi = TURN;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= r) lo = mid; else hi = mid; }
  return (n + (lo + (S[hi] > S[lo] ? (r - S[lo]) / (S[hi] - S[lo]) : 0)) / TURN) * 2 * Math.PI;
}
// Les arcs OUVERTS d'un tour ([début, longueur] en radians), au degré près ; un arc de
// moins de 15° ne fait pas une promenade. Rien de pris : null (le tour complet).
const _arcs = new WeakMap();
export function strollArcs(st) {
  if (!st.gap) return null;
  let A = _arcs.get(st);
  if (A) return A;
  const shut = new Uint8Array(360);
  for (const [a, b] of Array.isArray(st.gap[0]) ? st.gap : [st.gap]) for (let d = Math.ceil(a); d <= b; d += 1) shut[((d % 360) + 360) % 360] = 1;
  A = [];
  const d0 = shut.indexOf(1);
  if (d0 >= 0) {
    for (let i = 1, run = -1; i <= 360; i += 1) {
      const d = (d0 + i) % 360;
      if (!shut[d] && run < 0) run = d0 + i;
      if (shut[d] && run >= 0) {
        if (d0 + i - 1 - run >= 15) A.push([(run * Math.PI) / 180, ((d0 + i - 1 - run) * Math.PI) / 180]);
        run = -1;
      }
    }
  }
  _arcs.set(st, A);
  return A;
}
// La promeneuse k à l'instant `now` (ms) : { x, y, vx, vy (son pas), dist (px marchés :
// la cadence de ses pas, sinon les pieds glissent) }, ou null (aucun arc ouvert).
const WALK_SPEED = 7;                                         // px/s au sol
export function strollWalker(st, k, now) {
  const S = strollLen(st), arcs = strollArcs(st);
  let walked = (now / 1000) * WALK_SPEED, a, sg;
  if (arcs) {
    if (!arcs.length) return null;
    const [a0, L] = arcs[k % arcs.length], s0 = lenOf(S, a0), Lp = lenOf(S, a0 + L) - s0;
    // Chacune son arc : la seconde décalée ; à deux sur le MÊME arc, en miroir — elles se
    // croisent au milieu (sur un arc court, un simple décalage les gardait collées).
    if (k) walked += arcs.length === 1 ? Lp : 2.6 * st.r;
    const s = ((walked % (2 * Lp)) + 2 * Lp) % (2 * Lp);
    a = angleOf(S, s0 + (s > Lp ? 2 * Lp - s : s));
    sg = s > Lp ? -1 : 1;
  } else {
    if (k) walked += 2.6 * st.r;
    a = angleOf(S, k ? -walked : walked);                     // tour complet : sens inverse
    sg = k ? -1 : 1;
  }
  // Deux sur le même chemin : un couloir chacune, à ±1,5 px AU SOL le long de la normale
  // (une ellipse aplatie, agrandie, les serrait devant) — elles se croisent l'une devant
  // l'autre au lieu de se traverser.
  const [x0, y0] = strollAt(st, a), [x1, y1] = strollAt(st, a + 0.01);
  const tl = Math.hypot(x1 - x0, y1 - y0) || 1, tx = (x1 - x0) / tl, ty = (y1 - y0) / tl;
  const dr = !arcs || arcs.length === 1 ? (k ? 1.5 : -1.5) : 0;
  return { x: x0 + ty * dr, y: y0 - tx * dr, vx: tx * sg, vy: ty * sg, dist: walked };
}
function strollers(cast, st, now) {
  const G = cast.girls, out = [];
  for (let k = 0; k < 2; k += 1) {
    const w = strollWalker(st, k, now);
    if (w) out.push({ x: w.x, y: w.y, h: st.h, dir: ISO_DIR(w.vx, w.vy), walking: true, spec: G[k % G.length], k, dist: w.dist });
  }
  out.push({ x: st.door[0], y: st.door[1], h: st.door[2], dir: 0, walking: false, spec: G[2 % G.length], k: 2 });
  out.push({ x: st.balcony[0], y: st.balcony[1], h: st.balcony[2], dir: 0, walking: false, spec: G[1 % G.length], k: 3 });
  return out;
}

// CE QUI PASSE DEVANT UNE FILLE : les pixels du lieu plus proches de l'œil qu'elle
// (profondeur cuite, plaisirsBake.depthsOf), repeints sur elle avec les MÊMES appels
// que les tranches (mêmes arrondis : pas un pixel de décalage), bornés à sa boîte.
// Le pont derrière elle reste dessous ; la colonne, la balustrade, la rotonde devant
// elle la recouvrent. Rend la part cachée de son corps (0 à 1).
const GIRL_EPS = 3;          // le pont sous ses pieds, à la rangée près, ne la coupe pas
let _occ = null;
// Les pixels repeints, dans UNE ImageData qui ne fait que grandir (audit du 05/10,
// PERF-51 : une neuve par fille et par frame) ; seule sa part [0, uw[ × [0, vh[ sert.
let _occImg = null;
function girlOccluders(ctx, m, q, p, d, o) {
  const D = m.bk.D, R = m.bk.R;
  // Un habillage n'a pas de profondeur (plaisirsSkin.js) : seule sa balustrade découpe.
  if ((!D && !m.bk.rail) || typeof ImageData === 'undefined') return 0;
  const z = CM.cam.zoom, S = plaisirsTune.slice;
  // Sa boîte, allongée vers le bas-droite : son ombre au soleil (isoSunShadow) part
  // de ses pieds, et ce qui est devant elle la recouvre aussi.
  const bx0 = Math.floor(p.x - d.drawW / 2) - 1, bx1 = Math.ceil(p.x + d.drawW) + 1;
  const by0 = Math.floor(d.top) - 1, by1 = Math.ceil(d.top + d.drawH * 1.3) + 1;
  const u0 = Math.max(0, Math.floor((bx0 - o.x) / z)), u1 = Math.min(R.w, Math.ceil((bx1 - o.x) / z));
  const v0 = Math.max(0, Math.floor((by0 - o.y) / z)), v1 = Math.min(R.h, Math.ceil((by1 - o.y) / z));
  if (u1 <= u0 || v1 <= v0) return 0;
  // La fille du balcon d'un HABILLAGE : sa balustrade (redessinée par PixelLab, que la
  // profondeur du code ne connaît pas) — tout ce qui est sous son bord haut est devant.
  // Les autres, sur un habillage, ne sont découpées par RIEN : la profondeur vient du
  // plan du code, que le dessin ne suit pas (Raph, 2026-10-04 : des planches du pont
  // repeintes sur elles, le bord de la galerie qui ne les cachait pas) ; leurs chemins
  // les gardent devant la maison (plaisirsSkin.js, `walk`).
  const L = q.k === 3 ? m.bk.rail : null;
  if (m.bk.skinned && !L) return 0;
  const dg = q.x + q.y + GIRL_EPS, uw = u1 - u0, vh = v1 - v0;
  if (!_occImg || _occImg.width < uw || _occImg.height < vh) {
    _occImg = new ImageData(Math.max(uw, _occImg ? _occImg.width : 0), Math.max(vh, _occImg ? _occImg.height : 0));
  }
  const img = _occImg, iw = img.width;
  for (let v = 0; v < vh; v += 1) img.data.fill(0, v * iw * 4, (v * iw + uw) * 4);
  const railY = L ? (u) => L[1] + (L[3] - L[1]) * (u + 0.5 - L[0]) / ((L[2] - L[0]) || 1) : null;
  // Son corps : la boîte du clic (citizenFocus.noteSceneFigure), dans le raster.
  const fx0 = (p.x - d.drawW * 0.28 - o.x) / z, fx1 = (p.x + d.drawW * 0.28 - o.x) / z;
  const fy0 = (d.top + d.drawH * 0.03 - o.y) / z, fy1 = (d.top + d.drawH * 0.91 - o.y) / z;
  let nIn = 0, nHid = 0, any = false;
  for (let v = v0; v < v1; v += 1) {
    for (let u = u0; u < u1; u += 1) {
      const k = v * R.w + u, body = u + 0.5 > fx0 && u + 0.5 < fx1 && v + 0.5 > fy0 && v + 0.5 < fy1;
      if (body) nIn += 1;
      if (!R.data[k * 4 + 3] || !(L ? v >= railY(u) : D[k] > dg)) continue;
      if (body) nHid += 1;
      any = true;
      const t = ((v - v0) * iw + (u - u0)) * 4;
      img.data[t] = R.data[k * 4]; img.data[t + 1] = R.data[k * 4 + 1]; img.data[t + 2] = R.data[k * 4 + 2]; img.data[t + 3] = 255;
    }
  }
  if (!any) return 0;
  if (!_occ) _occ = { cv: document.createElement('canvas'), r: null };
  const cv = _occ.cv;
  if (cv.width !== R.w || cv.height !== R.h) { cv.width = R.w; cv.height = R.h; _occ.r = null; }
  const g = cv.getContext('2d');
  if (_occ.r) g.clearRect(_occ.r[0], _occ.r[1], _occ.r[2], _occ.r[3]);
  g.putImageData(img, u0, v0, 0, 0, uw, vh);
  _occ.r = [u0, v0, uw, vh];
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx0, by0, bx1 - bx0, by1 - by0);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  const y0 = Math.round(o.y), y1 = Math.round(o.y + R.h * z);
  for (let c0 = Math.floor(u0 / S) * S; c0 < u1; c0 += S) {
    const c1 = Math.min(R.w, c0 + S), sx0 = Math.round(o.x + c0 * z), sx1 = Math.round(o.x + c1 * z);
    if (sx1 > sx0 && y1 > y0) ctx.drawImage(cv, c0, 0, c1 - c0, R.h, sx0, y0, sx1 - sx0, y1 - y0);
  }
  ctx.restore();
  return nIn ? nHid / nIn : 0;
}

export function drawIsoPlaisirsSeg(ctx, it, now) {
  const m = it.m;
  if (!m) return;
  const R = m.bk.R, cv = m.bk.cv, z = CM.cam.zoom;
  const o = originScreen(m);
  const prevSm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const y0 = Math.round(o.y), y1 = Math.round(o.y + R.h * z);
  const x0 = Math.round(o.x), x1 = Math.round(o.x + R.w * z);
  if (it.part === 'base') {
    // Ses remous, peints à l'image suivante sous le lieu (passe des remous).
    if (m.bk.ripples) noteRipples('plaisirs:' + m.bk.key + ':' + m.cx + ',' + m.cy, () => [{ F: m.bk.ripples, h: 0, clip: 'river', wx: m.cx, wy: m.cy }]);
    // AURA, à la profondeur du lieu : le cerne sur l'eau puis les foyers. Déposés
    // dans la couche de lumière, donc découpés par les tranches qui suivent.
    drawPlaisirsRing(m.pl, now);
    queuePlaisirsGlow(m, now);
    // Ombre portée et REFLET dans l'eau, calculés à la cuisson (cf. bakeFor).
    const layer = (L) => {
      const lx = Math.round(o.x + (L.ox - R.ox) * z), ly = Math.round(o.y + (L.oy - R.oy) * z);
      return [lx, ly, Math.round(o.x + (L.ox - R.ox + L.w) * z) - lx, Math.round(o.y + (L.oy - R.oy + L.h) * z) - ly];
    };
    if (m.bk.sh) drawSunShadowPlane(ctx, m.bk.sh.cv, ...layer(m.bk.sh));
    if (m.bk.mir) noteReflectionImage(ctx, m.bk.mir.cv, ...layer(m.bk.mir));
    // Liseré de survol : le lieu est CLIQUABLE, il doit dire qu'on le touche.
    // Gardé d'une frame à l'autre tant que rien ne change, rendu dès que le survol cesse.
    if (CM.hover && CM.hover.plaisirs) drawSpriteOutline(cv, x0, y0, x1 - x0, y1 - y0, HOVER_GOLD);
    else dropSpriteOutline();
  } else if (it.part === 'slice') {
    const sx0 = Math.round(o.x + it.c0 * z), sx1 = Math.round(o.x + it.c1 * z);
    if (sx1 > sx0 && y1 > y0) {
      const bk = m.bk, c0 = it.c0, cw = it.c1 - c0, sw = sx1 - sx0, k = (y1 - y0) / R.h;
      // Audit du 05/10 (PERF-29) : chaque tranche se posait sur TOUTE la hauteur du
      // cadre, vide aux trois quarts. Elle ne pose plus que ses rangées occupées
      // (prises une colonne plus large de chaque côté) quand c'est PROUVÉ identique
      // au pixel — échelle device entière, cf. rowCrop.js ; sinon pleine hauteur,
      // comme avant. Partout, sans rien changer à l'image : une couche VIDE sur la
      // tranche (le vivant, la nuit) n'est pas posée, et les emprises déclarées à
      // la couche de lumière se serrent sur les rangées (lightLayer.litBox).
      const dpr = CM.dpr || 1, tight = LIGHT_LAYER.tight !== false;
      const ca = Math.max(0, c0 - 1), cb = Math.min(R.w, it.c1 + 1), rr = _rowsR;
      const hasR = sliceRows(bk.rowsR, ca, cb, rr);
      const pose = (g, crop, img, sx, rows) => {
        if (crop && rows) g.drawImage(img, sx, rows[0], cw, rows[1] - rows[0], sx0, y0 + rows[0] * k, sw, (rows[1] - rows[0]) * k);
        else g.drawImage(img, sx, 0, cw, R.h, sx0, y0, sw, y1 - y0);
      };
      const crop = rowCropExact(ctx, y0, y1, R.h, dpr);
      pose(ctx, crop, cv, c0, hasR ? rr : null);
      // Ce qui vit dans l'habillage (torches, ballon captif) : la même tranche de
      // l'image du moment. Cran d'ambiance « aucune » : la première, figée.
      const lv = bk.live;
      if (lv) {
        const f = (CM.ambianceK ?? 1) > 0 ? Math.floor((now || 0) / lv.ms) % lv.n : 0;
        const lr = _rowsL, fx = f * R.w;
        if (sliceRows(bk.rowsLive, fx + ca, fx + cb, lr)) pose(ctx, crop, lv.cv, fx + c0, lr);
      }
      if (hasR) {
        const b = tight ? litBox(sx0, y0, sw / cw, k, 0, rr[0], cw, rr[1]) : { x0: sx0, y0, x1: sx1, y1 };
        lightCut(b.x0, b.y0, b.x1, b.y1, (lc) => pose(lc, rowCropExact(lc, y0, y1, R.h, dpr), cv, c0, rr));
      }
      // LA NUIT : baies, fentes de rideaux, lampions — après la découpe. Posée telle
      // quelle (le calque de lumière la lisse : une pose rognée changerait ses bords) ;
      // son emprise, elle, se serre sur ses rangées, à une rangée près (le lissage).
      const nf = CM.nightF || 0, nr = _rowsN;
      if (bk.cvN && nf > 0.03 && sliceRows(bk.rowsN, ca, cb, nr)) {
        const b = tight ? litBox(sx0, y0, sw / cw, k, 0, nr[0] - 1, cw, nr[1] + 1) : { x0: sx0, y0, x1: sx1, y1 };
        const lc = lightCtx(b.x0, b.y0, b.x1, b.y1);
        if (lc) {
          lc.globalAlpha = Math.min(1, nf * 1.15);
          lc.drawImage(bk.cvN, c0, 0, cw, R.h, sx0, y0, sw, y1 - y0);
          lc.globalAlpha = 1;
        }
      }
    }
  } else if (it.part === 'girl') {
    const q = it.q, p = worldToScreen(m.cx + q.x, m.cy + q.y, q.h);
    // Fiche d'habitant : désignée ou survolée, l'anneau à ses pieds ; elle se
    // signale avec la boîte peinte.
    const mark = q.g ? focusMark(q.g) : 0;
    if (mark) drawFocusRingAt(ctx, p.x, p.y, sceneRingWidth(CM.TILE * z * q.spec.scale * AGENT_SCALE), mark === 2);
    const d = drawNamedAgentIso(ctx, p.x, p.y, z, q.spec.name, q.spec.scale, q.dir, q.walking, now, q.k * 0.31, 1, q.walking ? q.dist : null, true);
    // Le lieu repeint sur elle ce qui est devant elle ; cachée (derrière la rotonde),
    // elle ne se laisse pas viser à travers le mur.
    const hidden = d && plaisirsTune.occlude !== false ? girlOccluders(ctx, m, q, p, d, o) : 0;
    if (d && q.g && hidden < 0.85) noteSceneFigure(q.g, 'plaisirs', q.spec.name, p.x, p.y, d);
  }
  // (Plus de partie 'prop' — flammes, fanions, lueurs, balise du Néon, halo cosmique de
  // la recette : ils ne vivaient que sur le rendu du code, plus jamais montré. Les feux
  // et le ballon de l'habillage vivent dans sa couche `live` — audit du 05/10, MORT-15.)
  ctx.imageSmoothingEnabled = prevSm;
}

// SURVOL ET CLIC : UN SEUL test, partagé par l'infobulle et par le clic
// (cityMapRuntime) — deux tests séparés finiraient par diverger. Part de la
// boîte réellement dessinée, puis descend au PIXEL du raster cuit, avec une
// tolérance d'un pixel source (garde-corps, mâts et guirlandes ne font qu'un ou
// deux pixels de large : un test strict les rendrait invisibles à la souris).
export function plaisirsHitTest(sx, sy) {
  const b = CM._plaisirsBox, m = _frameModel;
  if (!b || !m) return false;
  if (sx < b.dx || sx > b.dx + b.dw || sy < b.dy || sy > b.dy + b.dh) return false;
  const R = m.bk.R, z = CM.cam.zoom, o = originScreen(m);
  const u = Math.floor((sx - o.x) / z), v = Math.floor((sy - o.y) / z);
  for (let dv = -1; dv <= 1; dv += 1) {
    const y = v + dv;
    if (y < 0 || y >= R.h) continue;
    for (let du = -1; du <= 1; du += 1) {
      const x = u + du;
      if (x < 0 || x >= R.w) continue;
      if (R.data[(y * R.w + x) * 4 + 3]) return true;
    }
  }
  return false;
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__plaisirsTune = plaisirsTune;
  window.__plaisirsBakes = () => { const n = _bakes.size; _bakes.clear(); return n; };
}
