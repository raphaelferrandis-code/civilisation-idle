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
 *      dedans (lightCutImage), donc la lumière passe derrière elle, jamais
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
import { worldToScreen } from './projection.js';
import { lightCtx, lightCutImage } from '../lightLayer.js';
import { queueFlameGlow } from '../flameGlow.js';
import { WINTER } from '../seasonMode.js';
import { wonderKitForBand } from './wonderKits.js';
import { bakePlaisirs, plaisirsRecipeBand, plaisirsGames, plaisirsShadow } from './plaisirsBake.js';
import { SUN_SHADOW, sunShear, drawSunShadowPlane } from './isoSunShadow.js';
import { noteReflectionImage } from './isoReflect.js';
import { drawFlame, glowAt, hexToRgbStr } from './isoProps.js';
import { drawVieFlag } from './isoVie.js';
import { drawSpriteOutline } from './isoEngineScene.js';
import { HOVER_GOLD } from './isoPalette.js';

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
if (typeof window !== 'undefined') {
  window.__plaisirsAura = (o) => {
    if (o === false) PLAISIRS_AURA.on = false;
    else if (o && typeof o === 'object') { PLAISIRS_AURA.on = true; Object.assign(PLAISIRS_AURA, o); }
    else PLAISIRS_AURA.on = true;
    return { ...PLAISIRS_AURA };
  };
}

// Hash déterministe [0,1) — même idiome que les particules d'ambiance. AUCUN
// Math.random : les captures doivent rester reproductibles.
const _frac = (x) => x - Math.floor(x);
const _rnd = (i, j) => _frac(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453);

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
  const lc = lightCtx(b.x0, b.y0, b.x1, b.y1);
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

const gamesKey = (g) => (g.osselets ? 'o' : '') + (g.tickets ? 't' : '') + (g.cartes ? 'c' : '') + (g.icare ? 'i' : '') + (g.boutique ? 'b' : '');

// Molette : `__plaisirsTune.band = n` force l'âge (null : celui de la ville).
export const plaisirsTune = { band: null, slice: 8 };

function rasterCanvas(R) {
  const cv = document.createElement('canvas');
  cv.width = R.w; cv.height = R.h;
  cv.getContext('2d').putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
  return cv;
}
const _bakes = new Map();
function bakeFor(band, g, winter) {
  if (typeof document === 'undefined') return null;
  const key = plaisirsRecipeBand(band) + ':' + band + ':' + gamesKey(g) + (winter ? ':w' : '');
  let e = _bakes.get(key);
  if (e) return e;
  const out = bakePlaisirs(wonderKitForBand(band, winter), g);
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
    sc.fillStyle = SUN_SHADOW.col;
    for (let j = 0; j < S.h; j += 1) for (let i = 0; i < S.w; i += 1) if (S.mask[j * S.w + i]) sc.fillRect(i, j, 1, 1);
  }
  e = { key, R, cv: rasterCanvas(R), cvN: out.N ? rasterCanvas(out.N) : null, occ,
    mir: M ? { ox: M.ox, oy: M.oy, w: M.w, h: M.h, cv: rasterCanvas(M) } : null,
    sh: S ? { ox: S.ox, oy: S.oy, w: S.w, h: S.h, cv: shCv } : null,
    box: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    props: out.props || [], ledges: out.ledges || [], apex: out.apex || { x: 0, y: 0, h: R.h }, foot: out.foot || 64 };
  if (_bakes.size > 12) _bakes.delete(_bakes.keys().next().value);
  _bakes.set(key, e);
  return e;
}

// Le modèle de la frame (posé par la collecte, relu par le ciel et le survol).
let _frameModel = null;
function modelOf(pl) {
  const L = CM.layout;
  if (!L || !pl) return null;
  const band = plaisirsTune.band != null ? plaisirsTune.band | 0 : (L.counts && L.counts.eraBand) | 0;
  const g = plaisirsGames(state, L.counts && L.counts.eraIndex);
  const bk = bakeFor(band, g, CM.season === WINTER);
  if (!bk) return null;
  const T = CM.TILE;
  return { pl, band, g, bk, cx: pl.x * T, cy: pl.y * T };
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
export function pushIsoPlaisirsItems(items, pl) {
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
  for (let c0 = 0; c0 < R.w; c0 += S) {
    const c1 = Math.min(R.w, c0 + S);
    let any = false;
    for (let i = c0; i < c1; i += 1) if (m.bk.occ[i]) { any = true; break; }
    if (!any) continue;
    const Xa = R.ox + c0, Xb = R.ox + c1;
    const minAbs = Xa <= 0 && Xb >= 0 ? 0 : Math.min(Math.abs(Xa), Math.abs(Xb));
    items.push({ d: frontDepth(m, minAbs), kind: 'plaisirs', m, part: 'slice', c0, c1 });
  }
  for (let pi = 0; pi < m.bk.props.length; pi += 1) {
    const pr = m.bk.props[pi];
    items.push({ d: frontDepth(m, pr.x - pr.y) + 0.5, kind: 'plaisirs', m, part: 'prop', pi });
  }
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
    if (CM.hover && CM.hover.plaisirs) drawSpriteOutline(cv, x0, y0, x1 - x0, y1 - y0, HOVER_GOLD);
  } else if (it.part === 'slice') {
    const sx0 = Math.round(o.x + it.c0 * z), sx1 = Math.round(o.x + it.c1 * z);
    if (sx1 > sx0 && y1 > y0) {
      ctx.drawImage(cv, it.c0, 0, it.c1 - it.c0, R.h, sx0, y0, sx1 - sx0, y1 - y0);
      lightCutImage(cv, sx0, y0, sx1 - sx0, y1 - y0, it.c0, 0, it.c1 - it.c0, R.h);
      // LA NUIT : baies, fentes de rideaux, lampions — après la découpe.
      const nf = CM.nightF || 0;
      if (m.bk.cvN && nf > 0.03) {
        const lc = lightCtx(sx0, y0, sx1, y1);
        if (lc) {
          lc.globalAlpha = Math.min(1, nf * 1.15);
          lc.drawImage(m.bk.cvN, it.c0, 0, it.c1 - it.c0, R.h, sx0, y0, sx1 - sx0, y1 - y0);
          lc.globalAlpha = 1;
        }
      }
    }
  } else if (it.part === 'prop') {
    const pr = m.bk.props[it.pi];
    if (pr) {
      const p = worldToScreen(m.cx + pr.x, m.cy + pr.y, pr.h);
      if (pr.prop === 'flame') drawFlame(ctx, p.x, p.y, z, now, pr.small ? 0.8 : pr.big ? 1.6 : 1, (pr.x * 0.37 + pr.y * 0.11) % 3);
      else if (pr.prop === 'flag') {
        drawVieFlag(ctx, p.x, p.y, { k: z, now, poleH: pr.poleH || 8, w: pr.fw || 6, h: pr.fh || 4, cols: ['#c8434a', '#7a2333', '#f0cf6a'], swallow: true, seed: it.pi * 7 + 3 });
      } else if (pr.prop === 'glow') {
        glowAt(p.x, p.y, Math.max(6, CM.TILE * z * (pr.big ? 1.1 : 0.7)), EMBER, 0.85);
      } else if (pr.prop === 'beacon') {
        // Balise d'aviation au sommet de la tour (âge du néon) : un feu rouge qui
        // bat la seconde — même geste que les merveilles.
        const on = Math.floor(now / 600) % 2 === 0, sz = Math.max(1, Math.round(z * 1.5));
        ctx.fillStyle = on ? '#ff3b2e' : '#6a1a14';
        ctx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz), sz, sz);
        if (on) glowAt(p.x, p.y - sz / 2, Math.max(5, CM.TILE * z * 0.3), '255,70,50', 0.9);
      } else if (pr.prop === 'halo') {
        // Halo des âges cosmiques : un anneau de la lumière de l'ère qui flotte et
        // respire au-dessus du sommet.
        const bob = Math.sin(now / 900) * 2 * z, r = (pr.r || 16) * z;
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(now / 600);
        ctx.strokeStyle = `rgb(${NEON})`;
        ctx.lineWidth = Math.max(1, Math.round(z));
        ctx.beginPath();
        ctx.ellipse(Math.round(p.x), Math.round(p.y + bob), r * Math.SQRT2, r / Math.SQRT2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        glowAt(p.x, p.y + bob, r * 1.6, NEON, 0.6);
      }
    }
  }
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

if (typeof window !== 'undefined') {
  window.__plaisirsTune = plaisirsTune;
  window.__plaisirsBakes = () => { const n = _bakes.size; _bakes.clear(); return n; };
}
