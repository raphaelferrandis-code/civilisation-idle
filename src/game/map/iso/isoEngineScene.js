// LES SCÈNES MOTEUR posées sur le losange, et le LISERÉ des sprites.
//
// Extraites d'isoRenderer.js le 2026-08-23 (Q10). Une scène moteur est un décor
// legacy (props de `cityEngineSprites`) reposé en repère iso : boîte bornée par
// l'emprise, encre mesurée une fois pour caler le liseré, cache de rendu, et
// QUARANTAINE — une scène qui jette est retirée du tour au lieu d'emporter la frame.
// Le liseré de sprite simple vit ici pour la même raison : c'est le même geste
// (mesurer l'encre, en tirer un contour) sur un dessin sans scène.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, trois sortantes. Vérifiée ligne à ligne contre la
// version commitée.
//
// ⚠ L'or du survol (`HOVER_GOLD`) est monté dans isoPalette le même jour : il
// était la SEULE dépendance entrante de ce bloc, et trois passes le tracent. Une
// teinte partagée par trois peintres est une teinte de palette.
//
// ⚠ Aucun cycle : engineSprites, engineSceneCache, engineAnim, flameGlow,
// lightLayer et spriteScale citent bien isoRenderer — tous en PROSE, aucun import.
import { CM, cmHash, cmEngineAtelierFoot } from '../layout.js';
import { maskFromImageData } from "./isoMask.js";
import { fp } from '../framePerf.js';
import { worldToScreen, ISO_X } from './projection.js';
import { grainTune } from '../spriteScale.js';
import { drawEngineSprite } from '../engineSprites.js';
import { drawCachedEngineScene } from '../engineSceneCache.js';
import { engineAnimNow } from '../engineAnim.js';
import { suspendFlameGlow } from '../flameGlow.js';
import { suspendLightLayer } from '../lightLayer.js';
import { HOVER_GOLD } from './isoPalette.js';

// ── SCÈNES MOTEUR legacy posées sur le losange (Phase 3-lite) ────────────────
// Expérience validée à la capture : les scènes de cityEngineSprites (props
// PixelLab transparents + personnages + détails procéduraux) se dessinent dans
// une BOÎTE (x, y, w, h) — on leur donne une boîte CARRÉE ancrée au coin sud du
// losange (même geste que drawPixelHouse). Le contenu carré déborde un peu des
// coins du lot en losange (accepté : la référence fait pareil) ; le sol dur sous
// les scènes est déjà coupé game-wide (DRAW_BUILDING_GROUND=false). Molette
// __isoEngineScenes(false) → retour aux socles ; une scène qui jette est mise en
// quarantaine (socle) pour la session, sans casser la frame.
// Taille de dessin MAXIMALE d'une halle, en multiples de l'atelier de son type.
// Valeur choisie À L'ŒIL sur captures comparées (foragers 60, band 0, zoom 3.2) :
//   1.35 → panier à la taille d'un atelier : la halle devient INDISCERNABLE, on
//          perd le monument que le modèle « halle + ateliers » promet ;
//   1.7  → panier à hauteur de poitrine : nettement le plus gros du quartier,
//          et encore un objet qu'un humain peut porter. ← retenu
//   2.1  → panier à l'épaule, on repart vers l'absurde ;
//   3    → aucun bornage : la scène s'étire sur toute l'emprise.
// Molette de réglage en live : window.__hallSceneMax.
const HALL_SCENE_MAX_DEFAULT = 1.7;
// ⚠ Le bornage ne vaut QUE pour les ères où la scène est un DIORAMA D'OBJETS
// (campements, paniers, huttes : bandes 0-2). Là, agrandir la scène agrandit un
// panier de fruits, ce qui est absurde. À partir de la pierre (bande 3+), la
// scène EST un bâtiment, terrasse et perron compris dans le sprite : le borner
// rétrécissait le bâtiment ET escamotait son socle — « certains bâtiments n'ont
// plus de sols » (Raph, capture d'une ville band 4 ; halle des guildes mesurée à
// 0,57× et sa terrasse pavée disparue avec elle). Un bâtiment de pierre plus
// grand est simplement un plus grand bâtiment : rien à corriger.
const HALL_SCENE_CAP_MAX_BAND = 2;
export const isoEngineScenesFlag = { on: true };
if (typeof window !== 'undefined') window.__isoEngineScenes = (on) => { isoEngineScenesFlag.on = on !== false; return isoEngineScenesFlag.on; };
const _isoSceneQuarantine = new Set();   // buildingIds dont la scène a jeté (repli socle)

// ── SILHOUETTE DORÉE DU MOTEUR SURVOLÉ ──────────────────────────────────────
// Les habitations ont leur liseré depuis A3 (drawPixelHouseOutline) : elles ont
// UNE image, on la décale quatre fois et on remplit en source-in. Un moteur n'en
// a pas une mais une SCÈNE — des props PixelLab blités plus quelques détails
// procéduraux. On la redessine donc HORS ÉCRAN pour obtenir la même chose.
//
// ⚠ CE QUI REND L'ÉCHANGE POSSIBLE : drawEngineSprite ne reçoit pas de contexte,
// il lit CM.ctx une fois en tête ; et cityEngineSprites, lui, reçoit le sien
// d'en haut et ne relit jamais CM.ctx. Échanger CM.ctx le temps du tracé
// redirige donc la scène ENTIÈRE, props compris. Vérifié avant d'écrire.
//
// La scène n'est dessinée QU'UNE FOIS hors écran (elle est chère), et ce sont
// ses quatre copies décalées qui sont bon marché. Ne tourne que pour la tuile
// survolée : au plus un moteur par frame.
// ── EMPRISE RÉELLE D'UNE SCÈNE MOTEUR (encre), en fractions de sa boîte ─────
// ⚠ LA BOÎTE D'UNE SCÈNE EST CARRÉE, de côté égal à la largeur du losange. Or
// un losange iso est deux fois plus large que haut : le carré déborde donc
// ÉNORMÉMENT au-dessus du bâtiment, sur du vide transparent. Publier ce carré
// tel quel au hit-test faisait qu'un moteur volait le survol de ses voisins —
// souris sur la guilde, ce sont les Tribunaux qui s'allumaient. Les habitations
// n'ont jamais eu ce défaut : drawPixelHouse rend une boîte ROGNÉE sur le
// contenu du sprite.
//
// On mesure donc l'encre une fois par espèce de bâtiment, à taille de
// référence, et on met le résultat en cache. Le rendu d'une scène dépend de
// l'identifiant, du palier d'achat et de l'ère : la clé les porte tous.
const ENG_INK_REF = 96;                 // côté de la mesure, assez fin sans coûter
const _engInkCache = new Map();
let _engInkCanvas = null;
function engineInkFrac(t, now) {
  if (typeof document === 'undefined') return null;
  const key = (t.buildingId || t.variant || '?') + ':' + (t.tier || 0)
    + ':' + (CM.layout?.counts?.eraBand ?? 0) + ':' + (CM.layout?.counts?.eraIndex ?? 0);
  const cached = _engInkCache.get(key);
  if (cached) return cached;
  if (!_engInkCanvas) {
    _engInkCanvas = document.createElement('canvas');
    _engInkCanvas.width = ENG_INK_REF; _engInkCanvas.height = ENG_INK_REF;
  }
  const c = _engInkCanvas;
  const cctx = c.getContext('2d', { willReadFrequently: true });
  cctx.clearRect(0, 0, ENG_INK_REF, ENG_INK_REF);
  const prevCtx = CM.ctx;
  CM.ctx = cctx;
  // Mesure hors écran : ni lueur de feu ni découpe de lumière ne doivent en
  // sortir (la scène est dessinée en (0,0) d'un canvas de 96 px).
  suspendFlameGlow(true);
  suspendLightLayer(true);
  try { drawEngineSprite(t, 0, 0, ENG_INK_REF, ENG_INK_REF, now); }
  catch { CM.ctx = prevCtx; suspendFlameGlow(false); suspendLightLayer(false); return null; }
  suspendFlameGlow(false);
  suspendLightLayer(false);
  CM.ctx = prevCtx;

  const d = cctx.getImageData(0, 0, ENG_INK_REF, ENG_INK_REF).data;
  let x0 = ENG_INK_REF, y0 = ENG_INK_REF, x1 = -1, y1 = -1;
  for (let y = 0; y < ENG_INK_REF; y += 1) {
    for (let x = 0; x < ENG_INK_REF; x += 1) {
      if (d[(y * ENG_INK_REF + x) * 4 + 3] < 16) continue;   // quasi transparent
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  // Rien d'encré : props pas encore chargés, ou scène en repli. On ne met RIEN
  // en cache — sinon la première frame, celle où les PNG manquent encore,
  // figerait une emprise fausse pour toute la session.
  if (x1 < x0 || y1 < y0) return null;
  // MASQUE D'OCCULTATION (Q11) : tiré du MÊME tampon `d` que l'encre ci-dessus,
  // donc gratuit, et mémoïsé sur la même clé (id, tier, bande, ère) — partagé par
  // toutes les instances de la scène. Il dit à la passe fantôme si un point d'écran
  // tombe sur de la matière ou dans un coin vide de la boîte. Cf. iso/isoMask.js.
  const frac = {
    mask: maskFromImageData(d, ENG_INK_REF, ENG_INK_REF, x0, y0, x1 - x0 + 1, y1 - y0 + 1),
    x0: x0 / ENG_INK_REF,
    y0: y0 / ENG_INK_REF,
    w: (x1 - x0 + 1) / ENG_INK_REF,
    h: (y1 - y0 + 1) / ENG_INK_REF
  };
  _engInkCache.set(key, frac);
  return frac;
}

let _engOutlineA = null, _engOutlineB = null;
function drawIsoEngineOutline(t, bx, by, bw, now, color) {
  if (typeof document === 'undefined') return;
  const p = 1;
  const w = Math.max(1, Math.ceil(bw));
  const cw = w + p * 2;
  if (!_engOutlineA) { _engOutlineA = document.createElement('canvas'); _engOutlineB = document.createElement('canvas'); }
  const a = _engOutlineA, b = _engOutlineB;
  if (a.width < w || a.height < w) { a.width = w; a.height = w; }
  if (b.width < cw || b.height < cw) { b.width = cw; b.height = cw; }
  const actx = a.getContext('2d'), bctx = b.getContext('2d');
  actx.clearRect(0, 0, a.width, a.height);
  bctx.clearRect(0, 0, b.width, b.height);

  const prevCtx = CM.ctx;
  CM.ctx = actx;
  // Les feux ne doivent PAS éclairer pendant cette passe : le remplissage
  // source-in ci-dessous convertit tout pixel non transparent en or, si bien
  // qu'un halo doux deviendrait une auréole autour du bâtiment au lieu d'un
  // liseré net. La silhouette veut la MATIÈRE de la scène, pas sa lumière.
  // Même raison pour la COUCHE DE LUMIÈRE : la scène est redessinée en (0,0),
  // dans un canvas auxiliaire — une découpe partirait à l'autre bout de l'écran.
  suspendFlameGlow(true);
  suspendLightLayer(true);
  try {
    drawEngineSprite(t, 0, 0, w, w, now);
  } catch {
    suspendFlameGlow(false);
    suspendLightLayer(false);
    CM.ctx = prevCtx;
    return;                       // une scène qui jette ne doit pas coûter la frame
  }
  suspendFlameGlow(false);
  suspendLightLayer(false);
  CM.ctx = prevCtx;

  // On ne blitte QUE la zone utile : le canevas est réutilisé et peut être plus
  // grand que la boîte courante (il ne rétrécit jamais).
  for (const [dx, dy] of [[0, p], [p * 2, p], [p, 0], [p, p * 2]]) {
    bctx.drawImage(a, 0, 0, w, w, dx, dy, w, w);
  }
  bctx.globalCompositeOperation = 'source-in';
  bctx.fillStyle = color;
  bctx.fillRect(0, 0, cw, cw);
  bctx.globalCompositeOperation = 'source-over';

  const ctx = CM.ctx;
  const sm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(b, 0, 0, cw, cw, bx - p, by - p, cw, cw);
  ctx.imageSmoothingEnabled = sm;
}

// ── LISERÉ D'UN SPRITE SIMPLE ───────────────────────────────────────────────
// Troisième et dernière variante du liseré de survol, pour ce qui n'est QU'UNE
// image blitée : la Maison des Plaisirs. Les deux autres partent d'une source
// plus compliquée (un sprite mesuré au ras de l'encre pour les habitations,
// une SCÈNE redessinée hors écran pour les moteurs) ; ici l'image est déjà la
// silhouette, il n'y a rien à préparer.
// Recette identique dans les trois cas : quatre copies décalées d'un pixel,
// remplies à plat en source-in, posées AVANT le sprite qui les recouvre et n'en
// laisse dépasser que le contour.
let _sprOutlineCanvas = null;
export function drawSpriteOutline(img, dx, dy, dw, dh, color) {
  if (typeof document === 'undefined') return;
  const p = 1;
  const w = Math.max(1, Math.ceil(dw)), h = Math.max(1, Math.ceil(dh));
  const cw = w + p * 2, ch = h + p * 2;
  if (!_sprOutlineCanvas) _sprOutlineCanvas = document.createElement('canvas');
  const oc = _sprOutlineCanvas;
  // Le canevas est réutilisé et ne rétrécit jamais : on efface TOUT et on ne
  // reblitte ensuite que la zone utile.
  if (oc.width < cw || oc.height < ch) { oc.width = cw; oc.height = ch; }
  const octx = oc.getContext('2d');
  octx.clearRect(0, 0, oc.width, oc.height);
  octx.imageSmoothingEnabled = false;
  for (const [ox, oy] of [[0, p], [p * 2, p], [p, 0], [p, p * 2]]) {
    octx.drawImage(img, ox, oy, w, h);
  }
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = color;
  octx.fillRect(0, 0, cw, ch);
  octx.globalCompositeOperation = 'source-over';
  const ctx = CM.ctx;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(oc, 0, 0, cw, ch, dx - p, dy - p, cw, ch);
  ctx.imageSmoothingEnabled = prev;
}

export function drawIsoEngineScene(ctx, t, anchor, spanX, spanY, T, z, hh, now) {
  const id = t.buildingId || t.variant || '?';
  if (_isoSceneQuarantine.has(id)) return false;
  // Scènes DE SOL (champs irrigués) : elles PEIGNENT leur emprise en repère
  // carré → posées en boîte, elles font une dalle qui déborde du lot (vu à la
  // capture : irrigated_fields 10×6 par-dessus le fleuve). Elles retombent sur
  // le rendu d'emprise iso dédié (parcelle plate à sillons).
  if (/field|farm|crop|orchard/i.test(id)) return false;
  // Jalon profileur : clôt la tranche générique du peintre — tout ce qui suit
  // (scène + mesure d'encre) s'impute au poste dédié 'vif-moteurs'. C'est la
  // mesure qui décide du chantier « scènes cuites » (étape 0 du plan).
  fp('vif-peinture');
  // ── Échelle de la scène : BORNÉE, jamais l'emprise brute ────────────────────
  // La halle occupe un grand lot, mais sa scène ne doit pas être celle d'un
  // atelier AGRANDIE : c'est exactement ce qui peignait un panier de fruits plus
  // haut qu'un homme (capture Raph). On borne la taille de dessin à
  // HALL_SCENE_MAX fois celle d'un atelier du MÊME type — l'unité d'échelle de ce
  // type, celle pour laquelle sa scène a été composée. Le lot excédentaire devient
  // une CLAIRIÈRE : un bâtiment important a sa place dégagée autour de lui, il
  // n'est pas un atelier soufflé. Un atelier, lui, remplit son lot → f = 1 → cette
  // branche ne change rien pour lui.
  const spanSum = spanX + spanY;
  const unit = T * z * ISO_X * 0.72;
  const HALL_SCENE_MAX = (typeof window !== 'undefined' && window.__hallSceneMax) || HALL_SCENE_MAX_DEFAULT;
  const sceneBand = CM.layout?.counts?.eraBand ?? 0;
  const capSum = sceneBand <= HALL_SCENE_CAP_MAX_BAND
    ? (cmEngineAtelierFoot(id) || 1) * 2 * HALL_SCENE_MAX
    : Infinity;                                  // bâtiments de pierre : aucun bornage
  let bw = Math.min(spanSum, capSum) * unit;
  // GRAIN G1.2 (PLAN-EGALISATION-GRAIN §4.2) : plancher de densité aux petites
  // empreintes. Un moteur d'empreinte 1 (spanSum 2) dessinait ses portes moitié
  // moins hautes qu'à l'atelier (spanSum 4) — 4 % du corpus en bande, mesuré en
  // G0. On regonfle la boîte VERS la densité atelier, sans jamais la dépasser ;
  // le débord de lot qui en résulte est le pendant du clamp maisons, assumé aux
  // toutes premières empreintes. Molette : __grainFloor (0 = off).
  if (grainTune.on && grainTune.floor > 0 && spanSum > 0 && spanSum < 4) {
    bw *= Math.max(1, Math.min(grainTune.floor * (4 / spanSum), 4 / spanSum));
  }
  const f = spanSum > 0 ? Math.min(spanSum, capSum) / spanSum : 1;
  // Pieds : au coin SUD tant que le bâtiment remplit son lot (comportement
  // historique, inchangé pour les ateliers), ramenés vers le CENTRE du lot à
  // mesure qu'il s'y fait plus petit — sinon la halle se collerait au bord sud de
  // sa clairière au lieu d'y trôner.
  const ctr = worldToScreen((t.gx + spanX / 2) * T, (t.gy + spanY / 2) * T);
  let bx = ctr.x + (anchor.x - ctr.x) * f - bw / 2;
  let by = ctr.y + (anchor.y - ctr.y) * f - bw + hh * 0.5;
  // ── Variation par instance ────────────────────────────────────────────────
  // Les moteurs étaient les SEULES tuiles privées de jitter (renderBuildings le
  // réserve aux maisons via `if (t.type !== "engine")`). Tolérable tant qu'un type
  // ne posait que 13 blocs ; avec 48 ateliers alignés, l'absence de variation
  // donne un damier. Graine stable sur (gx,gy) → invariante entre frames ET entre
  // recomputes. `>>> 0` obligatoire : cmHash est SIGNÉ.
  // La HALLE (groupIndex 1) reste d'aplomb et à l'échelle : c'est le monument du
  // quartier, il ne doit ni pencher ni rapetisser.
  if ((t.groupIndex || 1) > 1) {
    const sd = cmHash(t.gx + ':' + t.gy) >>> 0;
    const k = 0.92 + (sd % 17) / 17 * 0.16;                  // 0.92..1.08
    // Ancrage par le BAS : la boîte se redimensionne sur ses pieds, sinon un
    // atelier réduit flotte au-dessus de son lot.
    by += bw * (1 - k) + ((((sd >> 9) % 5) - 2) * bw * 0.008);
    bx += bw * (1 - k) / 2 + ((((sd >> 5) % 5) - 2) * bw * 0.012);
    bw *= k;
  }
  // ── HORLOGE PROPRE À L'INSTANCE ───────────────────────────────────────────
  // Sans elle, tous les ateliers d'un type jouent la MÊME image au même instant
  // (le `now` de la frame est global) : le quartier bat à l'unisson. Le décalage
  // se pose ici, une fois, et TOUTE la scène en hérite — les ~120 blocs animés
  // des deux fichiers de scènes n'ont rien à savoir. Coût : une multiplication
  // et une addition par scène (graine mémoïsée sur la tuile). cf. engineAnim.js.
  const aNow = engineAnimNow(t, now);
  try {
    // SURVOL : la silhouette se pose AVANT la scène, sinon elle la mange au
    // lieu de la cerner (même geste que les habitations). Elle lit `aNow` comme
    // la scène : un liseré tracé sur une AUTRE image que celle dessinée juste
    // après cernerait une silhouette que le bâtiment n'a pas.
    if (CM.hover && CM.hover.tile === t) drawIsoEngineOutline(t, bx, by, bw, aNow, HOVER_GOLD);
    // SCÈNE CUITE (engineSceneCache) : plans statiques blittés, animé en direct.
    // false = cache indisponible (molette off, échelle hors bornes, cuisson
    // échouée) → dessin direct intégral, comme avant.
    // ⚠ LES DEUX TEMPS sont passés, et ce n'est pas de la coquetterie : `now`
    // sert la CLÉ du cache (son époque est mémoïsée sur la frame — un temps par
    // instance la ferait recalculer par scène, le piège des huit concaténations
    // documenté là-bas), `aNow` ne sert que la passe animée.
    if (!drawCachedEngineScene(ctx, t, bx, by, bw, now, aNow)) {
      drawEngineSprite(t, bx, by, bw, bw, aNow);
    }
    // Rend la boîte publiée à l'appelant pour le hit-test au survol. Sans elle,
    // viser un moteur haut (une école, un temple) retombait sur la cellule
    // projetée sous le curseur, c'est-à-dire celle SITUÉE DERRIÈRE.
    //
    // ⚠ ROGNÉE SUR L'ENCRE, jamais la boîte carrée brute : celle-ci est aussi
    // HAUTE que large alors qu'un losange iso est deux fois plus large que haut,
    // donc elle couvre un large vide au-dessus du bâtiment. Publiée telle
    // quelle, ce vide volait le survol aux voisins — souris sur la guilde,
    // Tribunaux qui s'allument. Repli sur la boîte entière tant que l'encre
    // n'est pas mesurable (props en cours de chargement).
    // `now` brut et non `aNow` : cette mesure est MÉMOÏSÉE par (id, tier, ère) et
    // partagée par toutes les instances — lui donner un temps par instance ne
    // changerait que l'image sur laquelle tombe la toute première mesure.
    const ink = engineInkFrac(t, now);
    fp('vif-moteurs');
    return ink
      ? { dx: bx + bw * ink.x0, dy: by + bw * ink.y0, dw: bw * ink.w, dh: bw * ink.h, mask: ink.mask }
      : { dx: bx, dy: by, dw: bw, dh: bw };
  } catch (e) {
    fp('vif-moteurs');
    _isoSceneQuarantine.add(id);
    if (typeof console !== 'undefined') console.warn('[iso] scène moteur en quarantaine:', id, e);
    return false;
  }
}

