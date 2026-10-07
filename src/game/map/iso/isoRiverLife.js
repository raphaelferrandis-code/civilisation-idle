/* ---- La vie de la SURFACE de l'eau ---- */
//
// Ce qui se passe SUR le fleuve, à la seconde près : la brume de l'aube et du
// soir, la pluie qui le crible, les feuilles au fil du courant, le poisson qui
// saute, les canards, les cygnes, le héron sur la berge, les libellules.
//
// ⚠ REFAIT AU PIXEL LE 2026-10-01 (docs/PLAN-MAQUETTE-VIVANTE.md §9). Tout était
// dessiné par le code — anneaux lissés, carrés, pavés — et ne venait pas de la
// même main que le reste de la carte. Les bêtes sont désormais dessinées à la main
// dans vieArt.js et posées au pixel entier par isoVie.js. L'ancienne vie a été
// retirée après validation de Raph (planches du 2026-10-01).
//
// ⚠ AUCUN ÉTAT ENTRE LES FRAMES : tout est fonction de (now, hash). C'est ce qui
// rend les captures reproductibles et évite une file d'objets à faire vivre.
// UNE exception (2026-10-03) : l'écart des canards et des cygnes qui fuient un
// bateau (cf. ILS S'ÉCARTENT DES BATEAUX) — à `now` figé, il ne bouge pas.
//
// ⚠ ANCRÉ AU FLEUVE, PAS À LA VUE. L'ancienne vie semait ses feuilles dans la
// portion VISIBLE du ruban : chaque pan de caméra les faisait toutes sauter
// ailleurs. Canards, héron, brume, feuilles sont maintenant placés le long du
// fleuve ENTIER (position = fraction de sa longueur) et seulement triés à l'écran.
// Seuls la pluie (du hasard pur) et le saut de poisson (un événement qu'il faut
// voir) restent tirés dans le champ.
//
// ⚠ Ce module n'importe RIEN d'isoRenderer ni d'isoRiver : isoRiver l'importe déjà
// (cycle ES = zone morte, piège payé deux fois sur ce chantier). isoRiver POUSSE sa
// config (configureRiverLife).
import { CM, cmHash } from '../layout.js';
import { hash01Lowbias as h32 } from '../hash.js';
import { worldToScreen } from './projection.js';
import { bridgeBlocks } from './isoBridge.js';
import { figNear } from '../figures.js';
import {
  VIE, vieK, vieZoomFade, vieSprite, fishShadowSprite, vieGenerated, vieBlit, vieBlitAt,
  viePixel, vieRing, vieCount, vieMistF, registerVieActors, registerVieAir, vieIsOccupied,
} from './isoVie.js';
import { mistStrand, mistOfDay, LEAF_KINDS } from './vieArt.js';
// Le guichet du paysage sonore : un module-FEUILLE (aucun import), sans risque de cycle.
import { noteSon, noteEmetteur } from '../../audio/paysage/evenements.js';

const CFG = { ribbonPath: null, precipKind: () => 'rain' };
export function configureRiverLife(o) { Object.assign(CFG, o); }

// Molettes : __vie({ brume, poissons, sauts, pluie, feuilles, canards, cygnes,
// herons, libellules, eclats }) ; compteurs : __vieStats() (isoVie.js).

// Hash → [0,1) : h32 = hash01Lowbias (../hash.js), celui de toute la petite vie.

// Point du ruban à la position t ∈ [0,1] et au décalage transversal lat ∈ [-1,1].
function ribbonPoint(sm, t, lat) {
  const fi = Math.max(0, Math.min(1, t)) * (sm.length - 1);
  const i0 = Math.max(0, Math.min(sm.length - 2, Math.floor(fi)));
  const f = fi - i0;
  const a = sm[i0], b = sm[i0 + 1];
  const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
  let nx = -(b.y - a.y), ny = b.x - a.x;
  const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
  const hw = (a.hw || 2) * 0.82;                 // marge : rien ne mord la berge
  return { x: x + nx * lat * hw, y: y + ny * lat * hw };
}
// Même point, mais le décalage est en TUILES depuis l'axe (berges, postes du héron).
function riverFrame(sm, t) {
  const fi = Math.max(0, Math.min(1, t)) * (sm.length - 1);
  const i0 = Math.max(0, Math.min(sm.length - 2, Math.floor(fi)));
  const f = fi - i0;
  const a = sm[i0], b = sm[i0 + 1];
  let tx = b.x - a.x, ty = b.y - a.y;
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  return {
    x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f,
    tx, ty, nx: -ty, ny: tx, hw: (a.hw || 2) + ((b.hw || 2) - (a.hw || 2)) * f,
  };
}

const S = (p, T) => worldToScreen(p.x * T, p.y * T);

// TRONÇON DE LA VILLE : le ruban court bien au-delà de la carte (316 samples, dont
// 88 dans la grille sur une partie de bande 4 — mesuré). Tout ce qui est ANCRÉ au
// fleuve (familles, héron, brume, feuilles, libellules) vit sur ce tronçon-là :
// réparti sur toute la longueur, il tombait presque entier hors de la carte jouée.
// Rend { a, b } (fractions du ruban) et `len` (tuiles).
let _spanMemo = { sm: null, N: 0, v: null };
function citySpan(sm) {
  const N = (CM.layout && CM.layout.gridN) | 0;
  if (_spanMemo.sm === sm && _spanMemo.N === N) return _spanMemo.v;
  let i0 = -1, i1 = -1;
  for (let i = 0; i < sm.length; i += 1) {
    const q = sm[i];
    if (q.x < -4 || q.y < -4 || q.x > N + 4 || q.y > N + 4) continue;
    if (i0 < 0) i0 = i;
    i1 = i;
  }
  if (i0 < 0 || i1 - i0 < 4) { i0 = 0; i1 = sm.length - 1; }
  let len = 0;
  for (let i = i0 + 1; i <= i1; i += 1) len += Math.hypot(sm[i].x - sm[i - 1].x, sm[i].y - sm[i - 1].y);
  const n = sm.length - 1;
  const v = { a: i0 / n, b: i1 / n, i0, i1, len: Math.max(1, len) };
  _spanMemo = { sm, N, v };
  return v;
}

// Direction du courant À L'ÉCRAN au point t (vecteur unitaire).
function screenDir(sm, t, T) {
  const f = riverFrame(sm, t);
  const p = worldToScreen(f.x * T, f.y * T), q = worldToScreen((f.x + f.tx) * T, (f.y + f.ty) * T);
  const dx = q.x - p.x, dy = q.y - p.y, dl = Math.hypot(dx, dy) || 1;
  return { dx: dx / dl, dy: dy / dl };
}
const onScreen = (sc, m) => !(sc.x < -m || sc.x > CM.cw + m || sc.y < -m || sc.y > CM.ch + m);

// ── Portion du ruban RÉELLEMENT à l'écran ───────────────────────────────────
// Sans ça, la pluie et le saut ne se voient pas : semés sur tout le ruban, ils
// tombent presque tous hors champ (mesuré, compteur à l'appui).
export function visibleT(sm, T) {
  const M = 60;
  let t0 = 1, t1 = 0, seen = false;
  for (let i = 0; i < sm.length; i += 3) {
    const p = worldToScreen(sm[i].x * T, sm[i].y * T);
    if (p.x < -M || p.x > CM.cw + M || p.y < -M || p.y > CM.ch + M) continue;
    const t = i / (sm.length - 1);
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
    seen = true;
  }
  if (!seen) return null;
  const pad = 0.02;
  return { t0: Math.max(0, t0 - pad), t1: Math.min(1, t1 + pad) };
}

// Ère et saison qui décident des bêtes : rien après la bande 6 (on n'élève pas de
// canards dans une mégastructure stellaire, même règle que le bétail).
const bandOf = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
const WATER_RGB = [214, 232, 240];

// ═══ 1. LA BRUME D'AUBE ET DE SOIR ═══════════════════════════════════════════
// Des filets effilochés (vieArt.mistStrand) qui naissent, glissent au fil de l'eau
// et se défont. Un poste tous les 5 tuiles de fleuve, chacun avec sa propre vie
// (45-80 s) : la brume se renouvelle sans jamais « tourner en boucle ». Clippée au
// ruban (elle ne passe jamais sur la ville) — cf. drawIsoRiverLife.
function drawMist(ctx, sm, T, z, now, k, fz) {
  const mf = vieMistF(mistOfDay);
  if (mf < 0.03) return;
  const cs = citySpan(sm), Lt = cs.len, span = cs.b - cs.a;
  const n = Math.max(6, Math.round(Lt / 3.2));
  const t = (now || 0) / 1000;
  const lenK = (1.135 * z) / k;                          // longueur suit le zoom réel
  for (let i = 0; i < n; i += 1) {
    const P = 45 + h32(i * 31 + 1) * 35;
    const ph = h32(i * 31 + 2) * P;
    const cyc = Math.floor((t + ph) / P);
    const u = ((t + ph) % P) / P;
    const g = (i * 977 + cyc * 131) | 0;
    const tt = cs.a + span * ((i + h32(g + 3)) / n + u * P * (0.10 + h32(g + 4) * 0.12) / Lt);
    if (tt > 1) continue;
    const lat = (h32(g + 5) * 2 - 1) * 0.62;
    const sc = S(ribbonPoint(sm, tt, lat), T);
    if (!onScreen(sc, 260)) continue;
    // Naissance et fin en fondu — mais un fondu DE PIXELS (la trame s'allume ou
    // s'éteint), jamais d'opacité globale qui rendrait le filet flou.
    const life = Math.max(0, Math.min(1, u / 0.22, (1 - u) / 0.3));
    // Un poste sur trois porte une NAPPE : plus large, plus pâle — le lit de brume
    // d'où sortent les filets. Les autres portent un filet franc.
    const nappe = (i % 3) === 0;
    const dq = Math.round(mf * life * (0.72 + 0.28 * h32(g + 6)) * (nappe ? 0.6 : 1) * 8) / 8;
    if (dq < 0.125) continue;
    const d = screenDir(sm, tt, T);
    const ab = Math.round(Math.atan2(d.dy, d.dx) / (Math.PI / 12));
    const a = ab * (Math.PI / 12);
    const lenArt = Math.max(24, Math.round((110 + h32(g + 7) * 110) * (nappe ? 1.3 : 1) * lenK / 8) * 8);
    const seed = (g % 997 + 997) % 997;
    const img = vieGenerated(`mist:${seed}:${ab}:${lenArt}:${dq}:${nappe ? 1 : 0}`,
      () => mistStrand(seed, Math.cos(a), Math.sin(a), lenArt, dq, nappe ? 1.7 : 1));
    if (vieBlitAt(ctx, img, sc.x - Math.cos(a) * lenArt * k / 2, sc.y - Math.sin(a) * lenArt * k / 2, k, fz)) vieCount('brume');
  }
}

// ═══ 2. RONDS DE PLUIE ═══════════════════════════════════════════════════════
// Même averse qu'avant (130 impacts à pleine pluie, tirés dans le champ, taille
// propre à chaque goutte), mais chaque anneau est tracé AU PIXEL.
function drawRainPx(ctx, sm, T, z, now, rainF, vis, k, fz) {
  if (VIE.pluie <= 0 || rainF <= 0.02) return;
  if (CFG.precipKind(CM.season, rainF) !== 'rain') return;
  const n = Math.round(130 * rainF * VIE.pluie);
  const t = now || 0;
  const rk = (1.135 * z) / k;                            // rayon en pixels d'art, suit le zoom
  for (let i = 0; i < n; i += 1) {
    const P = 620 + h32(i * 7 + 1) * 520;
    const ph = ((t + h32(i * 13 + 2) * P) % P) / P;
    const cyc = Math.floor((t + h32(i * 13 + 2) * P) / P);
    const g = i * 977 + cyc * 31;
    const sc = S(ribbonPoint(sm, vis.t0 + h32(g + 3) * (vis.t1 - vis.t0), h32(g + 4) * 2 - 1), T);
    if (!onScreen(sc, 20)) continue;
    const gros = 0.55 + h32(g + 5) * 1.2;
    const a = (1 - ph) * (1 - ph) * 0.62 * rainF * fz;
    if (a < 0.02) continue;
    // Premier instant : l'impact lui-même, un pixel clair ; puis l'anneau s'ouvre.
    if (ph < 0.12) viePixel(ctx, sc.x, sc.y, k, WATER_RGB, a);
    else if (vieRing(ctx, sc.x, sc.y, Math.max(1, Math.round((1 + ph * 5) * gros * rk)), k, a)) vieCount('pluie');
  }
}

// ═══ 3. FEUILLES AU FIL DE L'EAU ═════════════════════════════════════════════
// Seulement des feuilles (Raph) : c'est le seul élément qui rend le SENS du fleuve
// lisible quand aucun bateau ne passe. Une tous les 9 tuiles de fleuve, au fil du
// courant (0,18-0,43 tuile/s), qui vrille lentement. Surtout à l'automne.
function drawLeavesPx(ctx, sm, T, z, now, k, fz) {
  const seasonK = [0.45, 0.55, 1.6, 0][CM.season | 0] ?? 1;
  const cs = citySpan(sm), Lt = cs.len;
  const n = Math.min(40, Math.round(Lt / 9 * VIE.feuilles * seasonK));
  if (n <= 0) return;
  const t = (now || 0) / 1000;
  for (let i = 0; i < n; i += 1) {
    const speed = 0.18 + h32(i * 5 + 11) * 0.25;
    let u = (h32(i * 3 + 7) + t * speed / Lt) % 1;
    if (u < 0) u += 1;
    const lat = (h32(i * 9 + 13) * 2 - 1) * 0.75 + Math.sin(t * 0.4 + h32(i) * 6.28) * 0.05;
    const sc = S(ribbonPoint(sm, cs.a + u * (cs.b - cs.a), lat), T);
    if (!onScreen(sc, 10)) continue;
    const kind = LEAF_KINDS[i % LEAF_KINDS.length];
    const fr = Math.floor(t / (1.1 + h32(i * 7) * 0.9) + h32(i * 11) * 4) % 4;
    if (vieBlit(ctx, vieSprite(kind, fr), sc.x, sc.y, k, 0.9 * fz)) vieCount('feuilles');
  }
}

// ═══ 4. LE POISSON QUI SAUTE ═════════════════════════════════════════════════
// Un saut toutes les 11 s, dans le champ, trois calibres. Dessiné de flanc : il
// sort tête haute, file à plat au sommet, replonge tête basse — trois images, et
// l'eau raconte le reste (gouttes au départ, anneaux au départ et à l'arrivée).
const JUMP_PERIOD = 11000, JUMP_MS = 460;
let _jumpVis = { idx: -1, t0: 0, t1: 1, son: 0 };
function drawJumpPx(ctx, sm, T, z, now, vis, k, fz) {
  if (VIE.sauts <= 0) return;
  const t = now || 0;
  const idx = Math.floor(t / JUMP_PERIOD);
  const ph = (t % JUMP_PERIOD) / JUMP_MS;
  if (ph > 2) return;                                 // l'essentiel du temps : rien
  // Le champ est FIGÉ pour la durée du saut : un pan de caméra pendant la demi-
  // seconde ne doit pas téléporter le poisson.
  if (_jumpVis.idx !== idx) _jumpVis = { idx, t0: vis.t0, t1: vis.t1, son: 0 };
  const V = _jumpVis;
  const rp = ribbonPoint(sm, V.t0 + h32(idx * 17 + 1) * (V.t1 - V.t0), (h32(idx * 17 + 2) * 2 - 1) * 0.7);
  const sc = S(rp, T);
  if (!onScreen(sc, 30)) return;
  const s = T * z;
  const gros = 0.7 + h32(idx * 17 + 7) * 0.85;
  const dir = h32(idx * 17 + 3) < 0.5 ? -1 : 1;
  const reach = s * 0.34 * gros;
  // LE SON (docs/PLAN-AMBIANCE-SONORE.md) : la sortie de l'eau, puis le plouf de
  // l'amerrissage, une fois chacun par saut, à l'image qui les dessine.
  if (!(V.son & 1) && ph < 0.5) { V.son |= 1; noteSon('sortie', rp.x * T, rp.y * T, gros); }
  if (!(V.son & 2) && ph >= 1) { V.son |= 2; noteSon('plouf', rp.x * T, rp.y * T, gros); }
  // Anneaux au départ ET à l'arrivée.
  for (const [start, at] of [[0, 0], [1, 1]]) {
    const q = (ph - start) / 0.9;
    if (q < 0 || q > 1) continue;
    vieRing(ctx, sc.x + at * dir * reach * 0.5, sc.y, Math.max(1, Math.round((1 + q * 4) * gros)), k, (1 - q) * 0.65 * fz);
  }
  if (ph > 1) return;
  vieCount('saut');
  const lift = Math.sin(ph * Math.PI) * s * 0.30 * gros;
  const x = sc.x + dir * (ph - 0.5) * reach;
  const y = sc.y - lift;
  const name = ph < 0.36 ? 'fishUp' : ph < 0.64 ? 'fishTop' : 'fishDown';
  vieBlit(ctx, vieSprite(name, 0, dir < 0), x, y, k, fz);
  // Gerbe du départ : deux gouttes qui montent et retombent.
  if (ph < 0.4) {
    const q = ph / 0.4;
    for (const side of [-1, 1]) {
      viePixel(ctx, sc.x + side * (1 + q * 3) * k, sc.y - Math.sin(q * Math.PI) * 4 * k, k, [236, 244, 246], 0.9 * fz);
    }
  }
}

// ═══ 4 bis. ÉCLATS DU SOLEIL ═════════════════════════════════════════════════
// « Tente » (Raph, 2026-10-01), malgré trois refus de grain et de vaguelettes AU
// MILIEU du fleuve : ceci n'est pas une texture mais des ÉVÉNEMENTS rares — une
// dizaine d'étincelles à la fois sur tout le fleuve visible, chacune une demi-
// seconde (un point, une petite croix, un point), de jour et par beau temps.
// Molette : __vie({ eclats: 0..1 }).
function drawGlints(ctx, sm, T, z, now, vis, k, fz) {
  if (!(VIE.eclats > 0) || (CM.nightF || 0) > 0.15 || (CM.rainF || 0) > 0.1) return;
  const n = Math.round(10 * VIE.eclats), t = (now || 0) / 1000;
  for (let i = 0; i < n; i += 1) {
    const P = 1.1 + h32(i * 7 + 3) * 0.9;
    const tc = t + h32(i * 13 + 5) * P;
    const c = Math.floor(tc / P), ph = (tc % P) / P;
    if (ph > 0.45) continue;                         // le reste du cycle : rien
    const g = (i * 7919 + c * 104729) | 0;
    const sc = S(ribbonPoint(sm, vis.t0 + h32(g + 1) * (vis.t1 - vis.t0), (h32(g + 2) * 2 - 1) * 0.8), T);
    if (!onScreen(sc, 10)) continue;
    const fr = ph < 0.12 ? 0 : ph < 0.3 ? 1 : 2;
    if (vieBlit(ctx, vieSprite('glint', fr), sc.x, sc.y + k, k, 0.9 * fz)) vieCount('eclats');
  }
}

// ═══ 5. CANARDS ET CYGNES ════════════════════════════════════════════════════
// Des FAMILLES ancrées chacune à son bout de fleuve (une pour ~45 tuiles, 4 au
// plus) : on les découvre en longeant l'eau, on ne les croise pas partout. Chacune
// va et vient lentement sur 3 à 6 tuiles, près d'une berge. La file suit le CHEMIN
// de la mère avec un retard (chaque suiveur est là où elle était il y a quelques
// secondes) : ils se serrent quand elle ralentit et s'étirent quand elle file —
// comme une vraie couvée, sans une ligne de simulation.
const DUCK_KINDS = ['mere', 'couple', 'mere', 'trio'];
function familyAt(fam, tSec) {
  const tt = fam.home + fam.A * Math.sin((6.2832 * tSec) / fam.P + fam.ph);
  const lat = fam.side * (fam.lat0 + 0.12 * Math.sin((6.2832 * tSec) / (fam.P * 0.73) + fam.ph2));
  return { tt, lat };
}
function familiesOf(sm, band) {
  const cs = citySpan(sm), Lt = cs.len, span = cs.b - cs.a;
  const key = sm.length + ':' + Math.round(Lt) + ':' + ((CM.layout && CM.layout.mapSeed) || 0) + ':' + band;
  if (familiesOf._k === key) return familiesOf._v;
  const out = [];
  const nf = Math.max(1, Math.min(4, Math.round(Lt / 40)));
  const seed = ((CM.layout && CM.layout.mapSeed) || 0) | 0;
  for (let f = 0; f < nf; f += 1) {
    const g = cmHash('duck:' + f + ':' + seed) >>> 0;
    out.push({
      kind: DUCK_KINDS[g % DUCK_KINDS.length], swan: false,
      home: cs.a + span * (f + 0.5 + (h32(g + 1) - 0.5) * 0.5) / nf,
      A: span * (3 + h32(g + 2) * 3) / Lt, P: 110 + h32(g + 3) * 90, ph: h32(g + 4) * 6.28, ph2: h32(g + 5) * 6.28,
      side: h32(g + 6) < 0.5 ? -1 : 1, lat0: 0.42 + h32(g + 7) * 0.18,
      brood: 3 + Math.floor(h32(g + 8) * 3), g,
    });
  }
  // Un couple de cygnes, des bandes 3 à 6 (les eaux des palais) : au milieu du
  // courant, plus lent, et jamais sur le bout de fleuve d'une couvée.
  if (band >= 3 && band <= 6) {
    const g = cmHash('swan:' + seed) >>> 0;
    const home = cs.a + span * (nf > 1 ? (Math.floor(h32(g) * (nf - 1)) + 1) / nf : 0.5 + (h32(g) - 0.5) * 0.3);
    out.push({
      kind: 'cygnes', swan: true, home, A: span * (2 + h32(g + 2) * 2) / Lt, P: 220 + h32(g + 3) * 80,
      ph: h32(g + 4) * 6.28, ph2: h32(g + 5) * 6.28, side: h32(g + 6) < 0.5 ? -1 : 1, lat0: 0.22, brood: 0, g,
    });
  }
  familiesOf._k = key; familiesOf._v = out;
  return out;
}

// ── ILS S'ÉCARTENT DES BATEAUX ───────────────────────────────────────────────
// Retour Raph (2026-10-03, le bac passait sur un cygne) : « il faut que les oiseaux
// s'éloignent quand il s'approche ». Chaque bête porte un ÉCART (tuiles, monde) qui
// la sort de la route d'une coque : quand un bateau arrive, elle file sur le côté —
// en travers de SON cap, du côté où elle est déjà —, puis, une fois le danger passé,
// elle revient lentement à sa promenade. Le bac qui traverse les chasse donc le long
// du fleuve, le marchand qui le descend vers la berge.
//
// ⚠ Le SEUL état de ce module (cf. l'en-tête) : une bête effrayée met du temps à
// revenir, ce qu'aucune fonction de `now` ne dit sans mémoire. Il ne dépend que des
// frames — une capture à `now` figé n'avance pas l'écart (dt nul).
const FLEE = {
  ahead: 3.2,     // portée devant l'étrave (tuiles) — elle a le temps de s'écarter
  behind: 1.0,    // derrière la poupe
  clear: 1.0,     // marge voulue entre la bête et le flanc d'un bateau en route
  still: 0.55,    // … et d'une coque à l'arrêt (ancre, quai, bac à l'embarcadère)
  out: 1.5,       // vitesse de fuite (tuiles/s)
  back: 0.28,     // vitesse de retour
};
const _flee = new Map();
// Les coques sur l'eau cette frame : centre (monde, tuiles), cap, taille, à l'arrêt ?
// Même pose que drawIsoShips (iso/isoPort.js) : point du ruban + voie `lat`.
function hullsOnWater(sm) {
  const out = [];
  for (const sh of CM.ships || []) {
    if (sh.orbit || sh.t == null) continue;
    if (sh.fade != null && sh.fade <= 0) continue;
    const f = riverFrame(sm, sh.t);
    const lat = sh.lat || 0;
    const sg = sh.dir < 0 ? -1 : 1;
    const th = sh.th != null ? sh.th : Math.atan2(sg * f.ty, sg * f.tx);
    const stopped = sh.state === 'dock' || sh.state === 'anchor' || sh.state === 'board';
    out.push({
      id: sh.id, x: f.x + f.nx * lat, y: f.y + f.ny * lat, hx: Math.cos(th), hy: Math.sin(th),
      half: (sh._len || 1) / 2, need: (sh._beam || 0.4) / 2 + (stopped ? FLEE.still : FLEE.clear), stopped,
    });
  }
  return out;
}
const smooth01 = (x) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
// Écart VOULU pour une bête dont la promenade passe en (bx, by), à `lim` tuiles au
// plus de l'axe (berge). Compté depuis la PROMENADE et non depuis la place tenue :
// le but ne bouge pas avec la bête, elle ne tremble pas au bord de la zone.
// `st.sides` retient de quel côté elle passe chaque coque : décidé une fois à
// l'approche (vers où il y a la place), sinon elle changerait de bord en plein passage.
function fleeGoal(st, bx, by, fr, lim, hulls) {
  let ox = 0, oy = 0;
  const seen = {};
  for (const s of hulls) {
    const dx = bx - s.x, dy = by - s.y;
    if (dx * dx + dy * dy > 49) continue;
    const u = dx * s.hx + dy * s.hy;                 // le long du cap (+ = devant)
    const v = -dx * s.hy + dy * s.hx;                // en travers (+ = bâbord)
    const fwd = s.half + (s.stopped ? FLEE.still : FLEE.ahead);
    const aft = s.half + (s.stopped ? FLEE.still : FLEE.behind);
    if (u > fwd || u < -aft) continue;
    seen[s.id] = 1;
    // Poids plein le long de la coque, qui s'éteint en douceur aux deux bouts.
    const w = u > s.half ? smooth01((fwd - u) / (fwd - s.half))
      : u < -s.half ? smooth01((aft + u) / (aft - s.half)) : 1;
    // Combien la poussée en travers déplace la bête vers la berge (lat signée).
    const pn = -s.hy * fr.nx + s.hx * fr.ny;
    const lat0 = (bx - fr.x) * fr.nx + (by - fr.y) * fr.ny;
    let side = st.sides[s.id];
    if (side == null) {
      side = v >= 0 ? 1 : -1;
      // Pas la place entre la coque et la berge : elle passe de l'autre côté.
      if (Math.abs(lat0 + pn * (side * s.need - v)) > lim) side = -side;
      st.sides[s.id] = side;
    }
    if (side * v >= s.need) continue;
    const push = (side * s.need - v) * w;
    ox += -s.hy * push; oy += s.hx * push;
  }
  for (const id of Object.keys(st.sides)) if (!seen[id]) delete st.sides[id];
  return { ox, oy };
}
// Pose d'une bête au temps `now` : sa promenade + son écart, tenu dans l'eau.
// `hulls` au format de hullsOnWater. Exportée pour les tests (riverLife.test.js).
export function fleePos(key, base, fr, lim, hulls, now) {
  let st = _flee.get(key);
  if (!st) { st = { ox: 0, oy: 0, vx: 0, vy: 0, at: now, sides: {} }; _flee.set(key, st); }
  const dt = Math.max(0, Math.min(0.1, (now - st.at) / 1000));
  st.at = now; st.seen = now;
  const g = hulls.length ? fleeGoal(st, base.x, base.y, fr, lim, hulls) : { ox: 0, oy: 0 };
  const ex = g.ox - st.ox, ey = g.oy - st.oy, el = Math.hypot(ex, ey);
  let mx = 0, my = 0;
  if (el > 1e-4 && dt > 0) {
    // Elle FUIT quand le but l'éloigne de sa promenade ; elle revient sans hâte.
    const fleeing = Math.hypot(g.ox, g.oy) > Math.hypot(st.ox, st.oy) + 1e-3;
    const stepL = Math.min(el, fleeing ? Math.min(el * dt * 6, FLEE.out * dt) : FLEE.back * dt);
    mx = (ex / el) * stepL; my = (ey / el) * stepL;
  }
  st.ox += mx; st.oy += my;
  // Toujours dans l'eau : on rabat ce qui passerait la berge.
  const lat = (base.x + st.ox - fr.x) * fr.nx + (base.y + st.oy - fr.y) * fr.ny;
  if (Math.abs(lat) > lim) {
    const over = lat - Math.sign(lat) * lim;
    st.ox -= fr.nx * over; st.oy -= fr.ny * over;
  }
  if (dt > 0) { st.vx = mx / dt; st.vy = my / dt; }
  return { x: base.x + st.ox, y: base.y + st.oy, vx: st.vx, vy: st.vy };
}
// Les bêtes qui ne sont plus dessinées (hors champ longtemps, autre ville) sortent.
function fleeSweep(now) {
  if (_flee.size < 64) return;
  for (const [key, st] of _flee) if (now - st.seen > 20000 || st.seen > now) _flee.delete(key);
}

function drawDucks(ctx, sm, T, z, now, k, fz) {
  if (VIE.canards <= 0 && VIE.cygnes <= 0) return;
  const band = bandOf();
  if (band >= 7) return;
  const t = (now || 0) / 1000;
  const young = CM.season === 0 || CM.season === 1;      // couvées au printemps et l'été
  const list = [];
  const hulls = hullsOnWater(sm);
  fleeSweep(now || 0);
  for (const fam of familiesOf(sm, band)) {
    if (fam.swan ? VIE.cygnes <= 0 : VIE.canards <= 0) continue;
    // Membres : [image, retard en s, décalage latéral].
    let mem;
    if (fam.swan) mem = [['swan', 0, 0], ['swan', 5, 0.10]];
    else if (fam.kind === 'mere' && young) {
      mem = [['duckF', 0, 0]];
      for (let j = 1; j <= fam.brood; j += 1) mem.push(['duckling', j * 2.4, (j % 2 ? 1 : -1) * 0.04]);
    } else if (fam.kind === 'trio') mem = [['duckM', 0, 0], ['duckM', 3.2, 0.08], ['duckF', 6, -0.05]];
    else mem = [['duckM', 0, 0], ['duckF', 3.4, 0.06]];
    for (let j = 0; j < mem.length; j += 1) {
      const [name, lag, dl] = mem[j];
      const a = familyAt(fam, t - lag), b = familyAt(fam, t - lag - 0.6);
      const wa = ribbonPoint(sm, a.tt, a.lat + dl), wb = ribbonPoint(sm, b.tt, b.lat + dl);
      // L'écart qui l'éloigne des coques (tenu à jour même hors champ : une bête qui
      // rentre dans le champ ne doit pas sauter). Pas trop près du mur de quai d'en
      // face, dont la face cache une bande d'eau.
      const fr = riverFrame(sm, a.tt);
      const P = fleePos(fam.g + ':' + j, wa, fr, Math.min(fr.hw * 0.82, fr.hw - 0.75), hulls, now || 0);
      const p = S(P, T);
      if (!onScreen(p, 30)) continue;
      // Sens et sillage : sa promenade + sa fuite, sur les 0,6 dernières secondes.
      const q = S({ x: P.x - (wa.x - wb.x) - P.vx * 0.6, y: P.y - (wa.y - wb.y) - P.vy * 0.6 }, T);
      const vx = p.x - q.x, vy = p.y - q.y;
      list.push({ name, x: p.x, y: p.y, left: vx < 0, moving: Math.hypot(vx, vy) > 0.35 * k, j, fam });
    }
  }
  list.sort((u, v) => u.y - v.y);
  for (const d of list) {
    const spr = vieSprite(d.name, Math.floor(t * 2.2 + d.j * 0.7 + (d.fam.g % 5)) % 2, d.left);
    // Sillage : un petit V de pixels clairs derrière la bête qui avance.
    if (d.moving && spr) {
      const f = d.left ? 1 : -1, tail = d.x + f * (spr.w / 2) * k;
      for (let i = 1; i <= 3; i += 1) {
        const a = 0.42 * (1 - i / 4) * fz;
        viePixel(ctx, tail + f * i * 1.6 * k, d.y - k * 0.5 + i * 0.55 * k, k, WATER_RGB, a);
        viePixel(ctx, tail + f * i * 1.6 * k, d.y - k * 0.5 - i * 0.55 * k, k, WATER_RGB, a * 0.7);
      }
    }
    if (vieBlit(ctx, spr, d.x, d.y, k, fz)) vieCount(d.fam.swan ? 'cygnes' : 'canards');
  }
}

// ═══ 6. LIBELLULES ═══════════════════════════════════════════════════════════
// Au printemps et l'été, de jour, près des berges : un poste de guet où elle
// vibre sur place, puis un trait brusque jusqu'au suivant. Une pour ~9 tuiles de
// fleuve. Elles volent à hauteur d'herbe, au-dessus de l'eau.
function drawDragonflies(ctx, sm, T, z, now, k, fz) {
  if (VIE.libellules <= 0) return;
  if (!(CM.season === 0 || CM.season === 1) || (CM.nightF || 0) > 0.3 || (CM.rainF || 0) > 0.3) return;
  if (bandOf() >= 7) return;
  const cs = citySpan(sm), Lt = cs.len, span = cs.b - cs.a, t = (now || 0) / 1000;
  const n = Math.max(2, Math.round(Lt / 9));
  // Le poste de guet, en cases (le son a besoin du monde, le dessin de l'écran).
  const spotW = (i, c) => {
    const g = (i * 7919 + c * 104729) | 0;
    const tt = cs.a + span * ((i + 0.5 + (h32(g + 1) - 0.5) * 0.8) / n + (h32(g + 2) - 0.5) * 2 / Lt);
    const side = h32(i * 13) < 0.5 ? -1 : 1;
    return ribbonPoint(sm, tt, side * (0.55 + h32(g + 3) * 0.25));
  };
  for (let i = 0; i < n; i += 1) {
    const P = 5 + h32(i * 3 + 1) * 4;
    const tc = t + h32(i * 3 + 2) * P;
    const c = Math.floor(tc / P), u = (tc % P) / P;
    const Aw = spotW(i, c), A = S(Aw, T);
    if (!onScreen(A, 40)) continue;
    let x = A.x, y = A.y, wx = Aw.x, wy = Aw.y;
    const dart = 0.06;                                   // part du cycle en vol franc
    const enVol = u > 1 - dart;
    const Bw = spotW(i, c + 1), d = S(Bw, T);
    if (enVol) {
      const q = (u - (1 - dart)) / dart;
      x = A.x + (d.x - A.x) * q; y = A.y + (d.y - A.y) * q;
      wx = Aw.x + (Bw.x - Aw.x) * q; wy = Aw.y + (Bw.y - Aw.y) * q;
    } else {
      x += Math.round(Math.sin(t * 9 + i) * 0.8) * k;    // vibre sur place, au pixel
      y += Math.round(Math.cos(t * 7 + i * 2) * 0.6) * k;
    }
    const hover = (5 + h32(i * 5) * 3) * k;
    const fr = Math.floor(t * 16 + i) % 2;
    if (vieBlit(ctx, vieSprite('dragonfly', fr, d.x < A.x), x, y - hover, k, fz)) {
      vieCount('libellules');
      // Le battement des ailes (paysage sonore), plus fort en vol franc.
      noteEmetteur('libellule', wx * T, wy * T, enVol ? 1 : 0.5, now);
    }
  }
}

// ═══ 7. LE HÉRON ═════════════════════════════════════════════════════════════
// Debout au bord de l'eau (sur le quai quand l'ère en a, les pattes dans l'eau au
// bord d'une berge naturelle), il guette, pique du cou de temps en temps, et
// change de poste toutes les deux minutes et demie en un long vol plané. Un par
// fleuve, deux s'il est long.
//
// Il se tient AU SOL : il passe par le tri du peintre (acteur 'vie'), sinon une
// maison de la rive d'en face se dessinerait sous lui. En vol il passe dans la
// passe aérienne, au-dessus de tout.
// Cycle de 150 s ; le vol dure le temps du trajet à ~2,2 tuiles/s (4 à 16 s) et
// occupe la FIN du cycle — un héron qui traverse la ville en 7 s filait comme un
// martinet (vu au relevé des postes).
const HERON_P = 150, HERON_SPEED = 2.2;
const heronFlyS = (A, B) => Math.max(4, Math.min(16, Math.hypot(B.wx - A.wx, B.wy - A.wy) / HERON_SPEED));
function heronSpots(L, sm, band) {
  const key = (CM.layoutRecomputeAt || 0) + ':' + sm.length + ':' + band;
  if (heronSpots._k === key) return heronSpots._v;
  const T = CM.TILE, out = [];
  const built = new Set();
  for (const tl of (L.tiles || [])) {
    const sx = tl.spanX || tl.size || 1, sy = tl.spanY || tl.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) built.add((tl.gx + ax) + ',' + (tl.gy + ay));
  }
  // Arbres : un héron posé au pied d'un arbre de la rive d'en deçà disparaît sous sa
  // couronne (vu en capture : seules les pattes dépassaient). Sur un quai, on exige
  // aussi une cellule de VILLE (urbanSet) — la forêt sauvage vit hors de la ville,
  // et on ne la connaît ici que par là.
  const treed = new Set();
  for (const tr of (L.trees || [])) for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) treed.add((tr.gx + dx) + ',' + (tr.gy + dy));
  const urban = L.urbanSet;
  const quays = band >= 2;
  const cs = citySpan(sm);
  for (let i = Math.max(4, cs.i0); i < Math.min(sm.length - 4, cs.i1 + 1); i += 3) {
    for (const side of [-1, 1]) {
      const f = riverFrame(sm, i / (sm.length - 1));
      // Sur un quai : un pas en retrait du bord, sur la promenade. Sur une berge
      // naturelle : dans l'eau, au ras du bord (le héron pêche « à gué »).
      const off = quays ? f.hw + 0.3 : f.hw - 0.3;
      const wx = f.x + f.nx * side * off, wy = f.y + f.ny * side * off;
      const ck = Math.floor(wx) + ',' + Math.floor(wy);
      if (built.has(ck) || treed.has(ck)) continue;
      if (quays && urban && urban.has && !urban.has(ck)) continue;
      if (bridgeBlocks(wx * T, wy * T, T * 1.5)) continue;
      // Là où le quai est coupé (port, bouts du fleuve), personne ne pêche.
      const g = CM.quayGate;
      if (quays && g && (side > 0 ? g.drawPlus : g.drawMinus) && !(side > 0 ? g.drawPlus : g.drawMinus)[i]) continue;
      out.push({ wx, wy, i, side, cx: f.x, cy: f.y });
    }
  }
  heronSpots._k = key; heronSpots._v = out;
  return out;
}
// Poste du héron h au cycle c : une marche pseudo-aléatoire BORNÉE (deux sinus),
// pour que deux postes successifs soient voisins sans garder d'état.
function heronSpotIdx(h, c, n) {
  const g = h * 7717 + 13;
  // Lente : d'un cycle à l'autre le poste avance d'environ 15 % de la liste.
  const v = n * 0.5 + n * 0.4 * Math.sin(c * 0.23 + h32(g) * 6.28) + n * 0.08 * Math.sin(c * 0.71 + h32(g + 1) * 6.28);
  return Math.max(0, Math.min(n - 1, Math.round(v)));
}
// LE HÉRON S'ENVOLE QUAND ON APPROCHE (lot 5 de PLAN-COMPORTEMENTS) : les promeneurs
// des quais lui marchaient au travers. Un passant qui marche à moins de 0,8 tuile d'un
// héron posé le fait partir AUSSITÔT vers son poste suivant : on avance son horloge
// jusqu'au début de son vol (_heronSkip, gardé tant que la ville ne change pas).
const _heronSkip = { key: '', v: [] };
function heronState(now) {
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 12) return null;
  if (VIE.herons <= 0 || CM.collapseAt) return null;
  const band = bandOf();
  if (band >= 7) return null;
  const sm = rv.samples;
  const spots = heronSpots(L, sm, band);
  if (spots.length < 2) return null;
  const nh = citySpan(sm).len > 110 ? 2 : 1;
  const t = (now || 0) / 1000, out = [];
  // Deux marches pseudo-aléatoires sur TOUTE la liste (les partager en deux moitiés
  // clouait un héron sur un ou deux postes dans une petite ville : il ne s'envolait
  // jamais). Le second cède la place s'il tombe sur le poste du premier, et chacun
  // saute un poste pris par une volée (mouettes du quai).
  const n = spots.length;
  const idxOf = (h, c) => {
    let i = heronSpotIdx(h, c, n);
    if (h > 0 && i === heronSpotIdx(0, Math.floor((c * HERON_P - h * 61) / HERON_P), n)) i = (i + Math.ceil(n / 2)) % n;
    for (let tries = 0; tries < 4 && vieIsOccupied(spots[i].wx, spots[i].wy); tries += 1) i = (i + 1) % n;
    return i;
  };
  const at = (h, c) => spots[idxOf(h, c)];
  const sk = (CM.layoutRecomputeAt || 0) + ':' + n;
  if (_heronSkip.key !== sk) { _heronSkip.key = sk; _heronSkip.v = []; }
  const T = CM.TILE;
  for (let h = 0; h < nh; h += 1) {
    let tc = t + h * 61 + (_heronSkip.v[h] || 0);
    let c = Math.floor(tc / HERON_P), u = tc % HERON_P;
    let A = at(h, c), B = at(h, c + 1);
    let F = A === B ? 0 : heronFlyS(A, B);
    if (u < HERON_P - F && F > 0 && figNear(A.wx * T, A.wy * T, 0.8 * T)) {
      _heronSkip.v[h] = (_heronSkip.v[h] || 0) + (HERON_P - F - u);
      tc = t + h * 61 + _heronSkip.v[h];
      c = Math.floor(tc / HERON_P); u = tc % HERON_P;
      A = at(h, c); B = at(h, c + 1); F = A === B ? 0 : heronFlyS(A, B);
    }
    if (u < HERON_P - F) {
      out.push({ h, fly: false, A, t: u });
    } else {
      out.push({ h, fly: true, A, B, q: (u - (HERON_P - F)) / F, t: u });
    }
  }
  return out;
}
// Au sol : un acteur du tri peintre par héron posé.
registerVieActors((now, out) => {
  const hs = heronState(now);
  if (!hs) return;
  const T = CM.TILE;
  for (const s of hs) {
    // Au décollage et à l'atterrissage il est au sol — le vol commence et finit au poste.
    if (s.fly) continue;
    const A = s.A;
    out.push({
      wx: A.wx * T, wy: A.wy * T,
      draw(ctx) {
        const k = vieK(), fz = vieZoomFade();
        if (fz <= 0) return;
        const p = worldToScreen(A.wx * T, A.wy * T);
        const c = worldToScreen(A.cx * T, A.cy * T);   // il regarde l'eau
        const guet = ((s.t + s.h * 7) % 17) < 3;
        if (vieBlit(ctx, vieSprite('heron', guet ? 1 : 0, c.x < p.x), p.x, p.y, k, fz)) vieCount('heron');
      },
    });
  }
});
// En vol : grand arc plané d'un poste à l'autre, ailes lentes.
registerVieAir((ctx, now) => {
  const hs = heronState(now);
  if (!hs) return;
  const T = CM.TILE, k = vieK(), fz = vieZoomFade();
  if (fz <= 0) return;
  for (const s of hs) {
    if (!s.fly) continue;
    const e = s.q * s.q * (3 - 2 * s.q);
    const wx = s.A.wx + (s.B.wx - s.A.wx) * e, wy = s.A.wy + (s.B.wy - s.A.wy) * e;
    const p = worldToScreen(wx * T, wy * T);
    const lift = Math.sin(s.q * Math.PI) * T * CM.cam.zoom * 1.6;
    const pb = worldToScreen(s.B.wx * T, s.B.wy * T), pa = worldToScreen(s.A.wx * T, s.A.wy * T);
    const fr = Math.floor((now || 0) / 340 + s.h) % 2;
    if (vieBlit(ctx, vieSprite('heronFly', fr, pb.x < pa.x), p.x, p.y - lift, k, fz)) vieCount('heronVol');
  }
});

// ═══ 8. OMBRES DE POISSONS (appelées par isoRiver) ═══════════════════════════
// Le mouvement reste celui d'isoRiver (glisse, pause, serpentage) ; seul le TRACÉ
// change : une silhouette dessinée, choisie parmi quatre caps, au lieu de deux
// ellipses tournées et lissées. Rend true si le nouveau tracé a pris la main.
export function vieFishShadow(ctx, x, y, ang, size, swimming, t, h, alpha) {
  if (!VIE.on || VIE.poissons <= 0) return false;
  const k = vieK(), fz = vieZoomFade();
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const fi = Math.floor(t * (swimming ? 5 : 1.4) + (h % 7)) & 1;
  if (vieBlit(ctx, fishShadowSprite(size > 1.02 ? 'big' : 'small', fi, dx < 0, dy < 0), x, y, k, alpha * fz)) vieCount('poissons');
  return true;
}
// Les rides du poisson qui gobe, au pixel (r en pixels d'art).
export function vieFishRipple(ctx, x, y, q, size, alpha) {
  if (!VIE.on) return false;
  const k = vieK();
  vieRing(ctx, x, y, Math.max(1, Math.round((1.5 + q * 4) * (0.7 + size * 0.4))), k, alpha * vieZoomFade());
  return true;
}

// Outil de vérification : où sont les familles et les hérons À CET INSTANT (monde,
// en tuiles) — une bête de 5 px ne se trouve pas à l'œil sur une carte de 300 tuiles.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__vieSpots = (now = 0) => {
    const L = CM.layout, rv = L && L.river;
    if (!rv || !rv.samples) return null;
    const sm = rv.samples, t = now / 1000;
    const fams = familiesOf(sm, bandOf()).map((f) => { const a = familyAt(f, t); return { kind: f.kind, ...ribbonPoint(sm, a.tt, a.lat) }; });
    const hs = (heronState(now) || []).map((s) => ({ fly: s.fly, x: s.A.wx, y: s.A.wy }));
    // L'écart de chaque bête qui fuit un bateau (clé = famille:rang).
    const flee = [..._flee].filter(([, s]) => s.ox || s.oy).map(([k, s]) => ({ k, ox: s.ox, oy: s.oy }));
    return { fams, hs, flee };
  };
}

// L'eau autour du PÊCHEUR (isoRiver.drawIsoFisherWater) : les mêmes horloges et
// les mêmes rayons que le tracé d'origine, mais des anneaux au pixel et un banc de
// silhouettes dessinées. `p` = centre écran, `s` = tuile écran, `F` = FISHER_WATER.
export function vieFisherWater(ctx, p, sh, t, s, F, tone, dwell) {
  if (!VIE.on) return false;
  const k = vieK(), fz = vieZoomFade();
  const rgb = String(tone).split(',').map(Number);
  for (let i = 0; i < F.rings; i += 1) {
    const q = ((t * 1000 / F.ringP) + i / F.rings) % 1;
    const r = s * F.ringR * (0.45 + q * 0.85);
    const a = F.ringA * 1.4 * (1 - q) * (sh.state === 'anchor' ? 1 : 0.55) * fz;
    if (a >= 0.02) vieRing(ctx, p.x, p.y, Math.max(1, Math.round(r / k)), k, a, rgb);
  }
  if (sh.state === 'anchor' && F.school > 0) {
    const reste = Math.max(0, sh.stateT || 0);
    const g = Math.max(0, Math.min(1, Math.min(dwell - reste, reste) / F.fade));
    if (g > 0.01) {
      const h0 = (cmHash('school:' + sh.id) >>> 0);
      for (let i = 0; i < F.school; i += 1) {
        const h = (h0 + i * 2654435761) >>> 0;
        const rr = s * F.schoolR * (0.62 + ((h >>> 3) % 100) / 220);
        const spd = 1 + ((h >>> 9) % 100) / 260;
        const ang = (t * 1000 / F.schoolP) * Math.PI * 2 * spd + (i / F.school) * Math.PI * 2 + ((h >>> 15) % 100) / 100;
        // Cap tangent au cercle, écrasé comme le sol (le banc tourne À PLAT).
        const hd = Math.atan2(Math.cos(ang) * 0.5, -Math.sin(ang));
        vieFishShadow(ctx, p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr * 0.5, hd, 0.8, true, t, h, F.schoolA * g);
      }
    }
  }
  return true;
}

// ═══ ORCHESTRATION ═══════════════════════════════════════════════════════════
/**
 * Vie de surface, appelée juste après le fleuve et AVANT les bateaux : la pluie
 * crible l'eau, pas les coques ; les canards passent sous le pont.
 */
export function drawIsoRiverLife(now) {
  if (!VIE.on) return;
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  if (CM.lodActive) return;                           // dézoomé : que du bruit de 1 px
  const amb = CM.ambianceK ?? 1;
  if (amb <= 0) return;
  const ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom, sm = rv.samples;
  const vis = visibleT(sm, T);
  if (!vis) return;                                   // fleuve hors champ
  // `__vie({ pluie: … })` règle la dose ; `pluieForce` impose l'averse (captures,
  // où la météo est tenue au beau fixe).
  const rainF = VIE.pluieForce != null ? +VIE.pluieForce : (CM.rainF || 0);
  ctx.save();
  // Tout reste SUR L'EAU, clip en 'evenodd' comme l'exige le contrat du chemin
  // d'eau (WATER_FILL, isoRiver) : les ÎLES y sont des sous-chemins qui doivent
  // creuser un trou quel que soit leur sens de rotation.
  if (CFG.ribbonPath) { CFG.ribbonPath(ctx, sm, T); ctx.clip('evenodd'); }
  const prevA = ctx.globalAlpha;
  if (amb < 1) ctx.globalAlpha = prevA * amb;
  const k = vieK(), fz = vieZoomFade();
  const prevS = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (fz > 0 && !CM.collapseAt) {
    drawLeavesPx(ctx, sm, T, z, now, k, fz);
    drawDucks(ctx, sm, T, z, now, k, fz);
    drawJumpPx(ctx, sm, T, z, now, vis, k, fz);
    drawDragonflies(ctx, sm, T, z, now, k, fz);
    drawGlints(ctx, sm, T, z, now, vis, k, fz);
  }
  drawRainPx(ctx, sm, T, z, now, rainF, vis, k, Math.max(0.6, fz));
  // La brume en DERNIER : elle passe devant les canards, pas l'inverse.
  drawMist(ctx, sm, T, z, now, k, 1);
  ctx.imageSmoothingEnabled = prevS;
  ctx.globalAlpha = prevA;
  ctx.restore();
}
