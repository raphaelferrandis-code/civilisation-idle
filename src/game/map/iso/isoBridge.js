"use strict";
// ── LE PONT — refait à zéro le 2026-10-01 (docs/PLAN-PONTS.md) ──────────────
//
// Demande de Raph : « tu me refais tous les ponts ? oublie ce qui a déjà été fait
// et reprends à zéro ». Ses réponses : tablier PLAT au ras de la route et AUSSI
// LARGE qu'elle, une STRUCTURE qui change par ère, des piles permises avec une
// passe libre pour les bateaux, UN seul pont — et « ce doit être un bâtiment
// remarquable », avec de belles entrées, des lanternes, des gens qui s'arrêtent.
//
// L'ANCIEN PONT EST PARTI EN ENTIER : une grande image générée puis découpée,
// redressée, répétée par fenêtre, quantifiée en longueur, enterrée sur les berges,
// soulevée en dos d'âne. C'est ce montage qui imposait un tablier étroit, des
// coutures et une perspective approximative.
//
// LE NOUVEAU EST CONSTRUIT. Pour chaque travée (cellules `roadSurface 'bridge'`
// du layout, CM.bridgeSpans) on calcule un MODÈLE — ligne d'eau réelle au bord
// aval, piles et passe navigable, parapets qui enjambent la promenade du quai,
// piédestaux — puis le peintre (bridgeBake.js) le cuit, pixel par pixel, en
// trois calques à la résolution du sol, dans le kit de l'ère (bridgeKits.js).
//
// AU TRI PEINTRE, par travée :
//   · 'deck'  — le tablier, UN item, à la profondeur de son coin nord : tout ce
//     qui le chevauche (passants, attelages, parapets) se peint après ;
//   · 'back'  — le parapet amont, en TRANCHES de colonnes, chacune triée au bout
//     amont de sa portée : avant les passants qui marchent devant lui ;
//   · 'front' — la face aval et son parapet, en tranches triées au bout AVAL :
//     après les passants qu'elle cache. Les passants gardent `pedMargin` px de
//     recul sur chaque parapet (≥ leur demi-corps) : aucune tranche voisine ne
//     peut plus les couper — ce qui a coûté si cher à l'ancien pont surélevé.
//   · 'prop'  — statues, braseros, sur leurs piédestaux.
// Le tablier est au plan du sol : plus aucun « lift », les traverseurs marchent
// au sol comme partout.
//
// L'EAU : passe A (drawIsoBridgeUnder, avant les bateaux) — l'ombre sous le
// tablier, vue à travers les arches, et l'ombre du soleil portée sur l'eau côté
// aval. Le REFLET de la face passe par isoReflect en mode 'water', à partir d'une
// copie de la face dont les jours d'arches sont bouchés en sombre : chaque
// colonne se retourne ainsi autour de SA ligne d'eau (sinon l'intrados servait
// de pied et la voûte se reflétait dans l'arche).

import { CM } from '../layout.js';
import { noteFig, FIG } from '../figures.js';
import { worldToScreen } from './projection.js';
import { quayWallTiles, quayWallTune, quayStyleFor } from '../quaysAndRiot.js';
import { tradeStage, tradeSizeMul } from './isoFleet.js';
import { isoRoadHalfW } from './isoRoad.js';
import { bakeBridge } from './bridgeBake.js';
import { bridgeKitForBand } from './bridgeKits.js';
import { isoArt } from './isoArt.js';
import { noteReflection } from './isoReflect.js';
import { drawSunShadow, sunShadowAlpha, SUN_SHADOW } from './isoSunShadow.js';
// Les drapeaux du pont claquent dans le MÊME vent que ceux de la ville (session
// « petite vie ») : une seule recette. isoVie n'importe que layout.js et vieArt.js.
import { drawVieFlag, vieBlit, vieSprite, vieRing, viePixel, vieK, vieZoomFade, vieCount } from './isoVie.js';
// Objets posés (statues, braseros, réverbères, flammes, lueurs) : partagés avec
// les merveilles (iso/isoProps.js).
import { PROP_LIGHT, glowAt, drawFlame, drawSpriteProp, hexToRgbStr } from './isoProps.js';
import { LIGHT_LAYER, lightCut, lightCutImage, litBox } from '../lightLayer.js';
import { colRows, sliceRows, rowCropExact, colCropExact } from './rowCrop.js';
// ⚠ PAS d'import d'isoRiver : il configure la vie du fleuve AU CHARGEMENT et la
// chaîne isoRiverLife → … → isoBridge → isoRiver bouclait (CFG lu avant sa
// déclaration, riverLife.test cassé). Le contour de l'eau est retracé ici à partir
// des mêmes samples (riverEdgesWorld).
// ⚠ Import CIRCULAIRE (agents.js lit bridgeWalkBand) : sans danger, on n'appelle
// ces fonctions qu'au dessin, jamais au chargement du module.
import { agentSetForBand, agentSpecFor, drawNamedAgentIso, drawNamedAgent, AGENT_SCALE } from '../agents.js';
import { focusMark, drawFocusRingAt, noteSceneFigure, sceneRingWidth } from '../citizenFocus.js';
import { rasterCanvas } from '../pixelUtil.js';

// Réglages live : window.__bridgeTune (le pont n'est pas baké dans le sol, un
// changement se voit à la frame suivante ; ce qui touche la géométrie invalide
// le modèle par sa clé).
export const bridgeTune = {
  on: true,
  // Passants : recul sur chaque parapet (px monde, ≥ demi-corps), biais à droite
  // du sens de marche et étalement personnel (fractions de la demi-bande).
  pedMargin: 7, pedSide: 0.42, pedSpread: 0.62,
  // Passe navigable : la plus grosse coque de l'ère (0,7 × échelle de flotte) plus
  // cette marge, en tuiles.
  passMargin: 0.5,
  landing: 6,          // px monde : le tablier dépasse les parapets vers la route
  under: '#7a8597',    // ombre sous le tablier (multiply), jour comme nuit
  underA: 0.85,
  slice: 16,           // largeur d'une tranche du tri, en colonnes d'art
  shipFront: true,     // redessiner la coque des bateaux sortis devant la face aval (A/B)
};

// ── Géométrie ────────────────────────────────────────────────────────────────
// Bords du ruban en MONDE (px), comme riverRibbonScreen les trace (lit peint).
function riverEdgesWorld(samples, T) {
  const left = [], right = [];
  for (let i = 0; i < samples.length; i += 1) {
    const p = samples[i];
    const o = samples[Math.max(0, i - 1)], q = samples[Math.min(samples.length - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, hw = p.hw || 0;
    left.push({ x: (p.x + nx * hw) * T, y: (p.y + ny * hw) * T });
    right.push({ x: (p.x - nx * hw) * T, y: (p.y - ny * hw) * T });
  }
  return { left, right };
}
// Étendue d'EAU le long de la droite t = const (repère du pont), autour de lMid :
// les deux traversées de berge qui l'encadrent. null si la droite ne mouille pas.
export function wetOnLine(vertical, t, edges, lMid) {
  const hits = [];
  for (const poly of [edges.left, edges.right]) {
    for (let i = 1; i < poly.length; i += 1) {
      const p = poly[i - 1], q = poly[i];
      const pa = vertical ? p.x : p.y, qa = vertical ? q.x : q.y;
      if ((pa - t) * (qa - t) > 0 || pa === qa) continue;
      const u = (t - pa) / (qa - pa);
      hits.push(vertical ? p.y + (q.y - p.y) * u : p.x + (q.x - p.x) * u);
    }
  }
  let a = -Infinity, b = Infinity;
  for (const h of hits) {
    if (h <= lMid && h > a) a = h;
    if (h > lMid && h < b) b = h;
  }
  return a > -Infinity && b < Infinity ? [a, b] : null;
}

// Répartition des ARCHES sur l'eau de la face [fA, fB] : la passe au milieu du
// fleuve (au moins la plus grosse coque), puis des arches d'ouverture ≈ `clear`
// jusqu'aux culées, piles d'épaisseur `pw` entre elles. Une rive trop courte pour
// une arche de plus est absorbée par la passe : pas d'arche naine au bord.
// La passe est l'arche MAÎTRESSE : si les arches de rive sortent plus larges
// qu'elle, on l'élargit (≈ 12 % de plus que la plus large) — un pont romain a son
// arche centrale la plus grande, et c'est elle que les bateaux visent.
export function layoutSpans(fA, fB, mid, passW, clear, pw) {
  let Cc = Math.max(passW, clear);
  let out = spanPass(fA, fB, mid, Cc, clear, pw);
  for (let i = 0; i < 6 && out.wMax > Cc; i += 1) {
    Cc = (Cc + 1.12 * out.wMax) / 2;
    out = spanPass(fA, fB, mid, Cc, clear, pw);
  }
  return { open: out.open, piers: out.piers };
}
function spanPass(fA, fB, mid, Cc, clear, pw) {
  const Lw = fB - fA;
  if (!(pw > 0) || Lw <= Cc + 2 * pw + clear * 0.5) return { open: [[fA, fB]], piers: [], wMax: 0 };
  let c0 = Math.max(fA, mid - Cc / 2), c1 = Math.min(fB, mid + Cc / 2);
  const piers = [], right = [], left = [];
  let wMax = 0;
  const R = fB - (c1 + pw);
  if (R < clear * 0.45) c1 = fB;
  else {
    piers.push({ l: c1 + pw / 2, w: pw });
    const n = Math.max(1, Math.round((R + pw) / (clear + pw)));
    const w = (R - (n - 1) * pw) / n;
    wMax = Math.max(wMax, w);
    let x = c1 + pw;
    for (let i = 0; i < n; i += 1) {
      right.push([x, x + w]); x += w;
      if (i < n - 1) { piers.push({ l: x + pw / 2, w: pw }); x += pw; }
    }
  }
  const Ls = (c0 - pw) - fA;
  if (Ls < clear * 0.45) c0 = fA;
  else {
    piers.push({ l: c0 - pw / 2, w: pw });
    const n = Math.max(1, Math.round((Ls + pw) / (clear + pw)));
    const w = (Ls - (n - 1) * pw) / n;
    wMax = Math.max(wMax, w);
    let x = c0 - pw;
    for (let i = 0; i < n; i += 1) {
      left.push([x - w, x]); x -= w;
      if (i < n - 1) { piers.push({ l: x - pw / 2, w: pw }); x -= pw; }
    }
  }
  piers.sort((p, q) => p.l - q.l);
  return { open: [...left.reverse(), [c0, c1], ...right], piers, wMax };
}

function buildModel(sp, L, band, ei) {
  const T = CM.TILE, v = !!sp.vertical;
  const K = bridgeKitForBand(band);
  const lanes = v ? sp.gx1 - sp.gx0 + 1 : sp.gy1 - sp.gy0 + 1;
  const tUp = (v ? sp.gx0 : sp.gy0) * T, tDn = (v ? sp.gx1 + 1 : sp.gy1 + 1) * T;
  const c = (tUp + tDn) / 2;
  const lc0 = (v ? sp.gy0 : sp.gx0) * T, lc1 = (v ? sp.gy1 + 1 : sp.gx1 + 1) * T;
  const lMid = (lc0 + lc1) / 2;
  const pth = (K.parapet && K.parapet.th) || 3;
  const hq = Math.round(quayWallTiles(band) * (quayWallTune.heightK || 1) * T);
  const rv = L.river;
  const edges = rv && rv.present && rv.samples && rv.samples.length > 1 ? riverEdgesWorld(rv.samples, T) : null;
  const wet = (t) => (edges && wetOnLine(v, t, edges, lMid)) || [lc0, lc1];
  const wDn = wet(tDn - 0.5), wUp = wet(tUp + 0.5), wC = wet(c);
  const fA = Math.round(wDn[0]), fB = Math.round(wDn[1]);
  const bankA = Math.min(wUp[0], wDn[0]), bankB = Math.max(wUp[1], wDn[1]);
  // Les parapets ENJAMBENT la promenade du quai : le pont commence où la ville
  // quitte la terre ferme, pas au bord de l'eau.
  const quayW = edges ? ((quayStyleFor(band) || {}).W || 0.7) * T : 0;
  const pA = Math.round(bankA - quayW - 3), pB = Math.round(bankB + quayW + 3);
  const dA = pA - bridgeTune.landing, dB = pB + bridgeTune.landing;
  const rank = (sp.cells && sp.cells[0] && sp.cells[0].rank) || 'main';
  const roadHalf = (lanes * T) / 2 - (0.5 - isoRoadHalfW(rank)) * T;
  // Piles et arches.
  const passW = (0.7 * tradeSizeMul(tradeStage(band, ei), band) + bridgeTune.passMargin) * T;
  const pw = K.pier ? K.pier.w : 0;
  const clear = ((K.span && K.span.clear) || 1.3) * T;
  const mid = (wC[0] + wC[1]) / 2;
  const lay = layoutSpans(fA, fB, mid, passW, clear, pw);
  const crown = (K.face && K.face.crown) != null ? K.face.crown : -6;
  const arches = lay.open.map(([l0, l1]) => ({ l0, l1, crown, spring: crown - (l1 - l0) / 2 }));
  // PORTES aux deux bouts (arc de triomphe, portail, tour-porte, anneau), posées
  // sur les culées : l'entrée et la sortie du « bâtiment remarquable ». Les
  // parapets courent d'une porte à l'autre.
  const E = K.entrance, gates = [];
  let rA = pA, rB = pB;
  if (E && v) {
    const dl = E.dl || 12, out = E.out || 14;
    const tA = tUp - out, tB = tDn + out;
    const ends = [[pA, pA + dl], [pB - dl, pB]];
    for (const [l0, l1] of ends) {
      const g = { type: E.type, l0, l1, tA, tB, o0: tUp + pth - 1, o1: tDn - pth + 1 };
      if (E.type === 'triumph') {
        g.hs = E.spring || 10;
        g.hc = g.hs + (g.o1 - g.o0) / 2;
        g.hE0 = Math.round(g.hc + 2); g.hE1 = g.hE0 + (E.entH || 6); g.hTop = g.hE1 + (E.atticH || 11);
      } else if (E.type === 'portal') {
        g.o0 = tA + 3; g.o1 = tB - 3;
        g.postH = E.postH || 26; g.roofH = E.roofH || 8; g.hTop = g.postH + g.roofH + 1;
      } else if (E.type === 'tower') {
        g.hs = E.spring || 10; g.bodyH = E.bodyH || 44; g.crenH = E.crenH || 5; g.roofH = E.roofH || 22;
        g.hTop = g.bodyH + g.crenH + g.roofH;
      } else if (E.type === 'ring') {
        g.o0 = tA + 6; g.o1 = tB - 6; g.band = E.band || 3; g.hTop = (tB - tA) / 2 + 2;
      }
      gates.push(g);
    }
    rA = pA + dl; rB = pB - dl;
  }
  // MONUMENTS posés aux quatre coins (totems, piliers, pylônes, bornes), juste
  // hors des parapets, en tête de pont.
  const Mo = K.monument, monuments = [];
  if (Mo && v) {
    const half = Mo.w / 2, gap = 1.5;
    for (const lc of [pA + half + 1, pB - half - 1]) {
      for (const tcen of [tUp - gap - half, tDn + gap + half]) {
        monuments.push({ type: Mo.type, l0: lc - half, l1: lc + half, t0: tcen - half, t1: tcen + half, h: Mo.h, lc, tc: tcen });
      }
    }
  }
  // SUPERSTRUCTURE : les mâts des haubans sur les deux piles de la passe, les
  // tours de la suspension au ras des berges.
  const Sup = K.superstructure;
  let masts = [], towers = [];
  if (Sup && Sup.type === 'stayed') {
    const byMid = [...lay.piers].sort((p, q) => Math.abs(p.l - mid) - Math.abs(q.l - mid)).slice(0, 2).map((p) => p.l);
    masts = byMid.length === 2 ? byMid.sort((a, b) => a - b) : [fA + 10, fB - 10];
  } else if (Sup && Sup.type === 'suspension') towers = [fA + 6, fB - 6];
  // Piédestaux (un par pile et par parapet) + têtes de pont quand rien n'y trône.
  const peds = [], props = [];
  const Q = K.parapet || {};
  const onRail = (side) => (side === 'up' ? tUp + pth / 2 : tDn - pth / 2);
  if (K.ped) {
    for (const p of lay.piers) for (const side of ['up', 'dn']) peds.push({ l: p.l, side, end: false });
    if (!gates.length && !monuments.length && K.props && K.props.end) {
      const we = (K.ped.wEnd || K.ped.w) / 2 + 0.5;
      for (const l of [rA + we, rB - we]) for (const side of ['up', 'dn']) peds.push({ l, side, end: true });
    }
  }
  const era = K.props && K.props.era;
  if (K.props) {
    for (const pd of peds) {
      const prop = pd.end ? K.props.end : K.props.pier;
      if (!prop) continue;
      props.push({
        prop, era, side: pd.side, l: pd.l, t: onRail(pd.side),
        h: pd.end ? (K.ped.hEnd || K.ped.h) : K.ped.h,
      });
    }
    // LUMIÈRES le long du pont : sur la main courante, au droit de chaque clé
    // d'arche (braseros) ou à pas régulier (réverbères), des deux côtés.
    if (K.props.mid) {
      const spots = K.props.every
        ? Array.from({ length: Math.max(0, Math.floor((rB - rA - 16) / (K.props.every * T)) + 1) }, (_, i) => rA + 8 + i * K.props.every * T)
        : arches.map((a) => (a.l0 + a.l1) / 2);
      for (const l of spots) {
        if (l < rA + 6 || l > rB - 6) continue;
        for (const side of ['up', 'dn']) props.push({ prop: K.props.mid, era, side, l, t: onRail(side), h: Q.h || 0, small: true });
      }
    }
  }
  // Ce qui trône sur les portes et les monuments.
  for (const g of gates) {
    const l = (g.l0 + g.l1) / 2;
    if (g.type === 'triumph') {
      if (E.top) props.push({ prop: E.top, era, side: 'gate', l, t: c, h: g.hTop, gate: g });
      if (E.corner) for (const t of [g.tA + 5, g.tB - 5]) props.push({ prop: E.corner, era, side: 'gate', l, t, h: g.hTop, gate: g });
    } else if (g.type === 'portal' && E.lantern) {
      props.push({ prop: 'lantern', side: 'gate', l, t: c, h: g.postH - 7, hang: g.postH - 4, gate: g });
    } else if (g.type === 'tower') {
      if (E.flag) props.push({ prop: 'flag', side: 'gate', l, t: c, h: g.bodyH + g.crenH - 1 + g.roofH, gate: g });
      for (const t of [g.o0 - 3, g.o1 + 3]) props.push({ prop: 'flame', side: 'gate', l: g.l1 + 0.5, t, h: 15, gate: g, small: true });
    }
  }
  for (const mo of monuments) {
    const top = { side: 'mon', l: mo.lc, t: mo.tc, mon: mo };
    if (mo.type === 'totem') props.push({ ...top, prop: 'flame', h: mo.h + 1, big: true });
    else if (mo.type === 'pillar') props.push({ ...top, prop: 'flame', h: mo.h + 2, big: true });
    else if (mo.type === 'pylon') props.push({ ...top, prop: 'statue', era: 'antique', tint: 'gold', h: mo.h, big: true });
    else if (mo.type === 'beacon') props.push({ ...top, prop: 'glow', h: mo.h - 1, col: K.pal.led });
  }
  // DRAPEAUX à partir de la pierre (cf. bridgeKits.js, `flags`).
  const FL = K.flags;
  if (FL && v) {
    const cols = FL.banner ? K.pal.banner : FL.cols;
    const flag = (l, t, h, side, extra = {}) => props.push({
      prop: 'flag', l, t, h, side, cols, poleH: FL.poleH || 10, fw: FL.w || 6, fh: FL.h || 4,
      swallow: !!FL.swallow, seed: (l * 0.13 + t * 0.07) % 6.28, ...extra,
    });
    if (FL.at === 'piers') for (const p of lay.piers) for (const side of ['up', 'dn']) flag(p.l, onRail(side), Q.h || 0, side);
    if (FL.at === 'mid') {
      for (const a of arches) {
        const l = (a.l0 + a.l1) / 2;
        if (l < rA + 6 || l > rB - 6) continue;
        for (const side of ['up', 'dn']) flag(l, onRail(side), Q.h || 0, side);
      }
    }
    if (FL.at === 'gate') {
      for (const g of gates) for (const t of [c - 12, c + 12]) flag((g.l0 + g.l1) / 2, t, g.hTop, 'gate', { gate: g });
    }
    if (FL.at === 'masts' && Sup) for (const lm of masts) for (const [side, t] of [['up', tUp - 1.5], ['dn', tDn + 1.5]]) flag(lm, t, Sup.mastH, side);
    if (FL.at === 'towers' && Sup) for (const lt of towers) for (const [side, t] of [['up', tUp - 1.5], ['dn', tDn + 1.5]]) flag(lt, t, Sup.towerH, side);
  }
  const walkHalf = Math.max(T * 0.05, (tDn - tUp) / 2 - pth - bridgeTune.pedMargin);
  // DES GENS QUI S'ARRÊTENT (demande de Raph) : accoudés au parapet aval, face à
  // l'eau (le parapet les coupe à la taille, comme en vrai), deux de dos côté amont,
  // un pêcheur. Hors de la bande de marche, loin des piédestaux et des mâts. Tirage
  // stable par travée : ils sont là à chaque visite, comme les habitués d'un pont.
  const idlers = [];
  if (K.people !== false && v && rB - rA > T * 2) {
    const busy = [...peds.map((p) => p.l), ...props.filter((p) => p.small || p.prop === 'flag').map((p) => p.l), ...masts, ...towers];
    const free = (l) => busy.every((b) => Math.abs(b - l) > 8) && idlers.every((q) => Math.abs(q.l - l) > 14);
    const seed = sp.gx0 * 7919 + sp.gy0 * 104729;
    // LOT 5 de PLAN-COMPORTEMENTS : tous les ponts avaient le MÊME ordre (le pêcheur
    // toujours deuxième, les mêmes dessins dans le même ordre). L'ordre et les dessins
    // sont tirés par travée ; un pont sur trois n'a pas de pêcheur.
    const want = [['dn', 0, false], ['dn', 0, false], ['up', 1, false], ['dn', 0, false], ['up', 1, false]];
    for (let i = want.length - 1; i > 0; i -= 1) {
      const j = (Math.imul(seed + i * 613, 2246822519) >>> 0) % (i + 1);
      [want[i], want[j]] = [want[j], want[i]];
    }
    if (((Math.imul(seed, 3266489917) >>> 0) % 3) !== 0) want.splice((Math.imul(seed + 7, 668265263) >>> 0) % 3, 0, ['dn', 0, true]);
    const n = Math.min(want.length, Math.max(2, Math.floor((rB - rA) / (T * 1.4))));
    for (let i = 0; i < n; i += 1) {
      const [side, dir, fisher] = want[i];
      // Le pêcheur se met AU-DESSUS DE L'EAU, et sa ligne doit tomber dans une
      // ARCHE, pas devant une pile ni la culée (vu : le bout de la canne sur le
      // poteau de rive). La ligne (l − 1, t ≈ tDn + 14,5) a, à l'écran, la colonne
      // du point de la face aval l − 15,5 : c'est lui qu'on écarte des piles.
      const LF = 15.5;
      const [lo, hi] = fisher && fB - fA > 48 ? [fA + LF + 5, fB - 5] : [rA + 16, rB - 16];
      const clearOfPiers = (l) => !fisher || lay.piers.every((p) => Math.abs(p.l - (l - LF)) > (p.w || pw) / 2 + 3);
      for (let k = 0; k < 8; k += 1) {
        const u = ((Math.imul(seed + i * 131 + k * 17, 2654435761) >>> 0) % 1000) / 1000;
        const l = lo + u * (hi - lo);
        if (!free(l) || !clearOfPiers(l)) continue;
        const r = ((Math.imul(seed + i * 977, 40503) >>> 0) % 1000) / 1000;
        idlers.push({
          l, side, dir, fisher,
          t: side === 'dn' ? tDn - pth - 4 : tUp + pth + 4,
          charType: r < 0.5 ? 0 : r < 0.9 ? 1 : 2, variant: (Math.imul(seed + i * 389, 2654435761) >>> 0) % 4,
          ...idlerRhythm(seed, i, v),
        });
        break;
      }
    }
  }
  // Emprise hors du tablier (portes, monuments, mâts) pour bridgeBlocks.
  const out = Math.max(gates.length ? (E.out || 14) : 0, monuments.length ? Mo.w + 2 : 0, Sup ? 4 : 0);
  return {
    sp, vertical: v, lanes, T, K, band,
    tUp, tDn, c, pth, hq, fA, fB, pA: rA, pB: rB, dA, dB, roadHalf, passW,
    piers: lay.piers, arches, peds, props, gates, monuments, masts, towers, idlers, out,
    walk: { axis: c, half: walkHalf },
  };
}

// Signature de la GÉOMÉTRIE que buildModel lit : l'emprise, le sens et le rang de
// route de chaque travée, et le fleuve (ses samples). Rien d'autre du layout.
function bridgeGeoSig(spans, rv) {
  let s = '';
  for (const sp of spans) {
    s += sp.gx0 + ',' + sp.gy0 + ',' + sp.gx1 + ',' + sp.gy1 + (sp.vertical ? 'v' : 'h')
      + ((sp.cells && sp.cells[0] && sp.cells[0].rank) || 'main') + ';';
  }
  if (rv && rv.present && rv.samples) {
    let h = 2166136261;
    for (const p of rv.samples) {
      h = Math.imul(h ^ Math.round(p.x * 1000), 16777619);
      h = Math.imul(h ^ Math.round(p.y * 1000), 16777619);
      h = Math.imul(h ^ Math.round((p.hw || 0) * 1000), 16777619);
    }
    s += rv.samples.length + '#' + (h >>> 0);
  }
  return s;
}

let _models = { key: '', list: null, at: null, spans: null, tune: '', tv: null };
// Modèles des travées de la frame (cache par GÉOMÉTRIE + ère + molettes de gabarit).
// ⚠ JAMAIS par l'horodatage du layout (audit 2026-10-05, BUG-66) : le layout se
// recalcule toutes les 1,5 s en pleine croissance (structSig suit eraFrac au
// centième), et chaque fois le pont refaisait ses modèles — donc ses HABITUÉS,
// objets neufs : la fiche d'un accoudé suivi (désigné par identité d'objet,
// citizenFocus) passait à « a quitté la rue » au recalcul suivant — et recuisait
// tout (6 à 12 ms, quatre putImageData de ~2 Mo). L'horodatage ne sert plus que de
// chemin rapide : la signature n'est recalculée qu'une fois par recalcul.
export function bridgeGeoms() {
  const L = CM.layout;
  if (!L || !CM.bridgeSpans || !CM.bridgeSpans.length || !bridgeTune.on) return null;
  const band = (L.counts && L.counts.eraBand) | 0, ei = (L.counts && L.counts.eraIndex) | 0;
  const hk = quayWallTune.heightK || 1;
  // Chemin rapide SANS chaîne (audit 2026-10-05, PERF-25) : appelée pour chaque arbre à
  // l'écran (bridgeBlocks), chaque passant (bridgeWalkBand), les oiseaux, le port — la
  // clé de sept morceaux se reconcaténait à chaque appel. On compare les sept valeurs.
  const tv = _models.tv;
  if (_models.list && _models.at === CM.layoutRecomputeAt && _models.spans === CM.bridgeSpans && tv
    && tv[0] === band && tv[1] === ei && tv[2] === bridgeTune.pedMargin && tv[3] === bridgeTune.passMargin
    && tv[4] === bridgeTune.landing && tv[5] === hk && tv[6] === CM.TILE) {
    return _models.list;
  }
  const tvNow = [band, ei, bridgeTune.pedMargin, bridgeTune.passMargin, bridgeTune.landing, hk, CM.TILE];
  const tune = tvNow.join(':');
  const key = tune + '|' + bridgeGeoSig(CM.bridgeSpans, L.river);
  if (_models.key === key && _models.list) {
    // Même pont : on garde modèles, habitués et cuissons ; seules les travées du
    // nouveau layout (mêmes valeurs, objets neufs) sont rebranchées.
    _models.list.forEach((m, i) => { m.sp = CM.bridgeSpans[i]; });
    _models.at = CM.layoutRecomputeAt; _models.spans = CM.bridgeSpans; _models.tune = tune; _models.tv = tvNow;
    return _models.list;
  }
  const list = CM.bridgeSpans.map((sp) => buildModel(sp, L, band, ei));
  list.forEach((m, i) => { m.key = key + ':' + i; m.si = i; });
  _models = { key, list, at: CM.layoutRecomputeAt, spans: CM.bridgeSpans, tune, tv: tvNow };
  // Moins de travées qu'avant (une ville rebâtie plus petite) : les cuissons des
  // travées disparues partent (audit du 05/10, MEM-9 — ~2 Mo de rasters chacune).
  for (const si of _bakes.keys()) if (si >= list.length) _bakes.delete(si);
  return list;
}

// ── API des passants et des poseurs extérieurs ───────────────────────────────
// Bande de marche sous un point MONDE (null hors pont) : le milieu du tablier et
// sa demi-largeur utile, parapets et recul déduits. agents.js y range chaque
// passant sur SA ligne (biais à droite + étalement personnel).
export function bridgeWalkBand(wx, wy) {
  const ms = bridgeGeoms();
  if (!ms) return null;
  const T = CM.TILE;
  for (const m of ms) {
    const l = m.vertical ? wy : wx, t = m.vertical ? wx : wy;
    if (l < m.dA - T || l > m.dB + T) continue;
    if (t < m.tUp - T || t > m.tDn + T) continue;
    return { vertical: m.vertical, axis: m.walk.axis, half: m.walk.half };
  }
  return null;
}

// Emprise du pont pour les poseurs EXTÉRIEURS (arbres, rochers, bateaux amarrés,
// oiseaux) : vrai si le point monde tombe sur le tablier, élargi de `margin` px.
export function bridgeBlocks(wx, wy, margin = 0) {
  const ms = bridgeGeoms(); if (!ms) return false;
  for (const m of ms) {
    const l = m.vertical ? wy : wx, t = m.vertical ? wx : wy;
    if (l > m.dA - margin && l < m.dB + margin && t > m.tUp - m.out - margin && t < m.tDn + m.out + margin) return true;
  }
  return false;
}

// ── Cuisson (canvas) ─────────────────────────────────────────────────────────
// Texture de chaussée de l'ère, lue dans sa tuile 64×32 aux coordonnées MONDE :
// la même dalle que la route qui arrive, au même endroit de son motif.
const _roadData = new Map();
function roadSampler(tile) {
  if (!tile || typeof document === 'undefined') return { ready: true, tex: null };
  const art = isoArt(tile);
  if (!art.ready || !art.img) return { ready: false, tex: null };
  let e = _roadData.get(tile);
  if (e === undefined) {
    try {
      const w = art.img.naturalWidth || art.img.width, h = art.img.naturalHeight || art.img.height;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(art.img, 0, 0);
      e = { w, h, data: cx.getImageData(0, 0, w, h).data };
    } catch { e = null; }
    _roadData.set(tile, e);
  }
  if (!e) return { ready: true, tex: null };
  const T = CM.TILE;
  const tex = (vertical) => (l, t) => {
    const wx = vertical ? t : l, wy = vertical ? l : t;
    const fx = wx - Math.floor(wx / T) * T, fy = wy - Math.floor(wy / T) * T;
    const px = Math.floor(((fx - fy) + T) * (e.w / (2 * T)));
    const py = Math.floor(((fx + fy) / 2) * (e.h / T));
    if (px < 0 || py < 0 || px >= e.w || py >= e.h) return null;
    const k = (py * e.w + px) * 4;
    if (e.data[k + 3] < 128) return null;
    return [e.data[k], e.data[k + 1], e.data[k + 2]];
  };
  return { ready: true, tex };
}

// (rasterCanvas : ../pixelUtil.js.)
// Colonnes non vides d'un raster (on ne pousse pas de tranche vide au tri).
function occupied(R) {
  const col = new Uint8Array(R.w);
  for (let i = 0; i < R.w; i += 1) {
    for (let j = 0; j < R.h; j += 1) if (R.data[(j * R.w + i) * 4 + 3]) { col[i] = 1; break; }
  }
  return col;
}

const _bakes = new Map();
const _rowsB = [0, 0];       // plage de rangées de la tranche en cours (sans allocation)
function bakeFor(m) {
  if (typeof document === 'undefined') return null;
  const rs = roadSampler(m.K.deck && m.K.deck.tile);
  const key = m.key + ':' + (rs.ready ? 1 : 0);
  let e = _bakes.get(m.si);
  if (e && e.key === key) return e;
  const B = bakeBridge(m, m.K, rs.tex ? rs.tex(m.vertical) : null);
  e = {
    key, B,
    deck: rasterCanvas(B.deck), back: rasterCanvas(B.back), front: rasterCanvas(B.front), refl: rasterCanvas(B.refl),
    occBack: occupied(B.back), occFront: occupied(B.front),
    // Rangées occupées par colonne (rowCrop.js) : le cadre commun aux calques est
    // vide à ~90 % (audit du 05/10, PERF-35).
    rowsDeck: colRows(B.deck), rowsBack: colRows(B.back), rowsFront: colRows(B.front),
    gates: B.gates.map((G) => ({ G, cv: rasterCanvas(G.R) })),
    mons: B.monuments.map((Mn) => ({ Mn, cv: rasterCanvas(Mn.R) })),
  };
  _bakes.set(m.si, e);
  return e;
}

// Coin haut-gauche ÉCRAN d'un raster (repère X = wx − wy, Y = (wx + wy)/2).
function originScreen(B) {
  return worldToScreen(B.oy + B.ox / 2, B.oy - B.ox / 2);
}
// Boîte ÉCRAN du raster d'une travée (item 'bridgeSeg'), ou null tant qu'il n'est pas
// cuit : la forêt cuite dans le sol (forestBake.js) y marque ce que le pont recouvre.
export function bridgeSegScreenBox(it) {
  const bk = _bakes.get(it.si);
  if (!bk) return null;
  const B = bk.B, z = CM.cam.zoom, o = originScreen(B);
  return { x0: o.x, y0: o.y, x1: o.x + B.w * z, y1: o.y + B.h * z };
}

// ── Tri peintre ──────────────────────────────────────────────────────────────
// LES HABITUÉS VONT ET VIENNENT (lot 5) : chacun a son cycle — il arrive en longeant
// le parapet depuis un bout, s'accoude (et jette de temps en temps un regard le long du
// pont), puis repart de l'autre côté ; il s'efface en partant et revient plus tard. Le
// pêcheur, lui, reste à sa ligne. La nuit, la plupart sont rentrés. Fonction pure du
// temps : rien à simuler.
const IDLER = { walk: 4.5, dist: 76 };          // s d'arrivée/départ ; px parcourus le long du pont
function idlerRhythm(seed, i, vertical) {
  const h = (salt) => ((Math.imul(seed + i * 7919 + salt * 104729, 2654435761) >>> 0) % 1000) / 1000;
  return {
    ph: h(1), cyc: 70 + 70 * h(2), stay: 40 + 40 * h(3), from: h(4) < 0.5 ? -1 : 1, night: h(5),
    along: vertical ? [2, 3] : [0, 1],            // marcher vers +l, vers −l (bandes diagonales)
  };
}
// UN SIGNE (paroles/signs.js) : l'accoudé s'arrête et se tourne vers ce qu'il a vu
// (`_signDir`) ; son horloge prend le retard du temps arrêté (`_signLag`, s) et le
// rattrape doucement ensuite. Le pêcheur, lui, se tourne sans quitter sa ligne.
export function idlerNow(q, now) {
  const st = idlerAt(q, now);
  if (st && q._signDir != null) { st.dir = q._signDir; st.walking = false; }
  return st;
}
function idlerAt(q, now) {
  const nf = CM.nightF || 0;
  if (q.fisher || !q.cyc) return { l: q.l, dir: q.dir, walking: false, alpha: 1, dist: 0 };   // le pêcheur reste à sa ligne, même la nuit
  // La nuit, il en reste un sur trois (s'efface en fondu au crépuscule).
  const na = Math.max(0, Math.min(1, (q.night - nf * 0.7) / 0.1));
  if (na <= 0) return null;
  const W = IDLER.walk, t = ((((now || 0) / 1000 - (q._signLag || 0) + q.ph * q.cyc) % q.cyc) + q.cyc) % q.cyc;
  const fwdDir = q.along[q.from > 0 ? 1 : 0];   // il vient de +l (from = 1) : il marche vers −l
  if (t < W) {
    const u = t / W;
    return { l: q.l + q.from * IDLER.dist * (1 - u), dir: fwdDir, walking: true, alpha: na * Math.min(1, u * 3), dist: u * IDLER.dist };
  }
  if (t < W + q.stay) {
    const tt = t - W, glance = tt > 3 && ((tt + q.ph * 11) % 11) < 1.6;
    return { l: q.l, dir: glance ? q.along[(Math.floor(tt / 11) + (q.from > 0 ? 1 : 0)) % 2] : q.dir, walking: false, alpha: na, dist: 0 };
  }
  if (t < 2 * W + q.stay) {
    const u = (t - W - q.stay) / W;
    return { l: q.l - q.from * IDLER.dist * u, dir: fwdDir, walking: true, alpha: na * Math.min(1, (1 - u) * 3), dist: (1 + u) * IDLER.dist };
  }
  return null;
}

export function pushIsoBridgeItems(items, bounds, now = 0) {
  const ms = bridgeGeoms(); if (!ms) return;
  const T = CM.TILE;
  for (let si = 0; si < ms.length; si += 1) {
    const m = ms[si];
    const bk = bakeFor(m);
    if (!bk) continue;
    const B = bk.B, v = m.vertical;
    // Cull grossier : la travée entière dans la vue (marge de 3 cellules).
    const lA = Math.floor(m.dA / T) - 3, lB = Math.floor(m.dB / T) + 3;
    const g0 = Math.floor(m.tUp / T) - 3, g1 = Math.floor(m.tDn / T) + 3;
    const [gx0, gx1, gy0, gy1] = v ? [g0, g1, lA, lB] : [lA, lB, g0, g1];
    if (gx1 < bounds.gx0 || gx0 > bounds.gx1 || gy1 < bounds.gy0 || gy0 > bounds.gy1) continue;
    items.push({ d: m.dA + m.tUp - 1, kind: 'bridgeSeg', si, part: 'deck' });
    const S = bridgeTune.slice;
    const tB = m.tUp + m.pth, tF = m.tDn;
    // l aux deux bords d'une tranche, sur la ligne d'un mur (vertical : l = t − X).
    const lOn = (t, X) => (v ? t - X : X + t);
    for (let c0 = 0; c0 < B.w; c0 += S) {
      const c1 = Math.min(B.w, c0 + S);
      let hasB = false, hasF = false;
      for (let i = c0; i < c1; i += 1) { if (bk.occBack[i]) hasB = true; if (bk.occFront[i]) hasF = true; }
      const Xa = B.ox + c0, Xb = B.ox + c1;
      if (hasB) {
        const lmin = Math.min(lOn(tB, Xa), lOn(tB, Xb));
        items.push({ d: lmin + m.tUp - 0.5, kind: 'bridgeSeg', si, part: 'back', c0, c1 });
      }
      if (hasF) {
        const lmax = Math.max(lOn(tF, Xa), lOn(tF, Xb));
        items.push({ d: lmax + m.tDn + 0.5, kind: 'bridgeSeg', si, part: 'front', c0, c1 });
      }
    }
    // PORTES : trois tranches — pile ouest, passage (le linteau, haut au-dessus
    // des têtes), pile est — chacune à sa profondeur, pour qu'un passant qui
    // franchit la porte passe devant la pile ouest et derrière la pile est.
    for (let gi = 0; gi < bk.gates.length; gi += 1) {
      const G = bk.gates[gi].G, g = G.g;
      const cW = Math.max(0, Math.min(G.R.w, Math.round((g.o0 - g.l0) - G.R.ox)));
      const cE = Math.max(cW, Math.min(G.R.w, Math.round((g.o1 - g.l1) - G.R.ox)));
      const parts = [[0, cW, g.l1 + g.o0], [cW, cE, g.l1 + (g.o0 + g.o1) / 2], [cE, G.R.w, g.l1 + g.tB]];
      for (const [c0, c1, d] of parts) if (c1 > c0) items.push({ d, kind: 'bridgeSeg', si, part: 'gate', gi, c0, c1 });
    }
    // Accoudés : à leur profondeur de passant (le parapet aval, trié après, les
    // coupe à la taille). La canne du pêcheur passe PAR-DESSUS ce parapet.
    for (let ii = 0; ii < m.idlers.length; ii += 1) {
      const q = m.idlers[ii];
      const st = idlerNow(q, now);
      if (!st) continue;                         // parti (il reviendra)
      items.push({ d: st.l + q.t + 0.3, kind: 'bridgeSeg', si, part: 'idler', ii });
      // Lot 6 : l'accoudé dans le registre des figures (px monde : l le long du pont).
      noteFig(m.vertical ? q.t : st.l, m.vertical ? st.l : q.t, FIG.SCENE | (st.walking ? FIG.MOVING : 0));
      if (q.fisher) items.push({ d: q.l + m.tDn + S + 1, kind: 'bridgeSeg', si, part: 'rod', ii });
    }
    // BATEAUX SORTIS DE SOUS LE PONT. La flotte est peinte AVANT le pont (passe
    // des bateaux, isoPort) : sans rien de plus, la face aval — qui pend de la
    // hauteur d'un mur de quai sous le tablier — recouvrait un bateau DEVANT elle
    // sur ~1,5 tuile après sa sortie (retour Raph). Un bateau croise le pont en
    // travers (il avance en t) : la part de sa coque déjà passée devant la face
    // (t > tDn) est, à l'écran, à DROITE de la verticale x = écran(tDn, l du
    // bateau). On la redessine là, juste après les tranches avant qu'elle
    // chevauche ; la part encore sous le tablier reste cachée.
    if (v && CM.ships && bridgeTune.shipFront) {
      for (const sh of CM.ships) {
        const hb = sh._hull;
        if (!hb) continue;
        if (hb.wy < m.fA - T || hb.wy > m.fB + T || hb.wx < m.tUp - T || hb.wx > m.tDn + 4 * T) continue;
        items.push({ d: hb.wy + m.tDn + S + 1, kind: 'bridgeSeg', si, part: 'ship', sh });
      }
    }
    // MONUMENTS des coins : un item chacun, trié à son coin le plus proche.
    for (let mi = 0; mi < bk.mons.length; mi += 1) {
      const mo = bk.mons[mi].Mn.mo;
      items.push({ d: mo.l1 + mo.t1, kind: 'bridgeSeg', si, part: 'mon', mi });
    }
    for (let pi = 0; pi < m.props.length; pi += 1) {
      const pr = m.props[pi];
      // Aval : après la tranche qui porte son piédestal ; amont : juste après la
      // sienne, avant les passants qui marchent devant ; porte : après sa pile est ;
      // monument : juste après lui.
      const d = pr.gate ? pr.gate.l1 + pr.gate.tB + 1
        : pr.mon ? pr.mon.l1 + pr.mon.t1 + 0.5
          : pr.side === 'dn' ? pr.l + m.tDn + 0.5 + S : pr.l + m.tUp + 0.2;
      items.push({ d, kind: 'bridgeSeg', si, part: 'prop', pi });
    }
  }
}

export function drawIsoBridgeSeg(ctx, it, now) {
  const ms = bridgeGeoms(); if (!ms || !ms[it.si]) return;
  const m = ms[it.si];
  const bk = _bakes.get(it.si);
  if (!bk) return;
  const B = bk.B, z = CM.cam.zoom;
  const o = originScreen(B);
  const prevSm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const y0 = Math.round(o.y), y1 = Math.round(o.y + B.h * z);
  // Audit du 05/10 (PERF-35) : les calques partagent un cadre vide à ~90 % et se
  // posaient en entier (le tablier) ou sur toute sa hauteur (les tranches). Ils ne
  // posent plus que leurs rangées occupées — et le tablier ses bandes de colonnes
  // non vides — quand c'est PROUVÉ identique au pixel (échelle device entière, cf.
  // rowCrop.js) ; sinon comme avant. La découpe de lumière serre son emprise
  // partout (lightLayer.litBox). Le REFLET garde sa pose : isoReflect retourne
  // chaque colonne autour de son pied, mesuré sur le rectangle qu'on lui donne.
  const dpr = CM.dpr || 1;
  if (it.part === 'deck') {
    const x0 = Math.round(o.x), x1 = Math.round(o.x + B.w * z);
    if (x1 > x0 && y1 > y0 && rowCropExact(ctx, y0, y1, B.h, dpr) && colCropExact(ctx, x0, x1, B.w, dpr)) {
      const kx = (x1 - x0) / B.w, ky = (y1 - y0) / B.h, S = bridgeTune.slice, rr = _rowsB;
      for (let c0 = 0; c0 < B.w; c0 += S) {
        const c1 = Math.min(B.w, c0 + S);
        if (!sliceRows(bk.rowsDeck, Math.max(0, c0 - 1), Math.min(B.w, c1 + 1), rr)) continue;
        ctx.drawImage(bk.deck, c0, rr[0], c1 - c0, rr[1] - rr[0], x0 + c0 * kx, y0 + rr[0] * ky, (c1 - c0) * kx, (rr[1] - rr[0]) * ky);
      }
    } else ctx.drawImage(bk.deck, 0, 0, B.w, B.h, x0, y0, x1 - x0, y1 - y0);
    drawDeckShade(ctx, m);
  } else if (it.part === 'back' || it.part === 'front') {
    const x0 = Math.round(o.x + it.c0 * z), x1 = Math.round(o.x + it.c1 * z);
    if (x1 > x0) {
      const front = it.part === 'front', cv = front ? bk.front : bk.back, cw = it.c1 - it.c0, k = (y1 - y0) / B.h;
      if (front) {
        noteReflection(ctx, bk.refl, x0, y0, x1 - x0, y1 - y0, it.c0, 0, cw, B.h, 'column', 'water');
      }
      const rr = _rowsB;
      if (y1 > y0 && sliceRows(front ? bk.rowsFront : bk.rowsBack, Math.max(0, it.c0 - 1), Math.min(B.w, it.c1 + 1), rr)) {
        const pose = (g) => {
          if (rowCropExact(g, y0, y1, B.h, dpr)) g.drawImage(cv, it.c0, rr[0], cw, rr[1] - rr[0], x0, y0 + rr[0] * k, x1 - x0, (rr[1] - rr[0]) * k);
          else g.drawImage(cv, it.c0, 0, cw, B.h, x0, y0, x1 - x0, y1 - y0);
        };
        pose(ctx);
        const b = LIGHT_LAYER.tight !== false ? litBox(x0, y0, (x1 - x0) / cw, k, 0, rr[0], cw, rr[1]) : { x0, y0, x1, y1 };
        lightCut(b.x0, b.y0, b.x1, b.y1, pose);
      }
    }
  } else if (it.part === 'gate') {
    const gk = bk.gates[it.gi];
    if (gk) {
      const R = gk.G.R, og = originScreen(R);
      const gx0 = Math.round(og.x + it.c0 * z), gx1 = Math.round(og.x + it.c1 * z);
      const gy0 = Math.round(og.y), gy1 = Math.round(og.y + R.h * z);
      if (gx1 > gx0) {
        // Ombre du soleil des PILES seules : dans la tranche du passage, le pied
        // de chaque colonne serait l'intrados (le linteau « flotte »), et son ombre
        // partirait de là-haut au lieu du sol.
        if (it.c0 === 0 || it.c1 === R.w) drawSunShadow(ctx, gk.cv, gx0, gy0, gx1 - gx0, gy1 - gy0, it.c0, 0, it.c1 - it.c0, R.h, 'column', false);
        ctx.drawImage(gk.cv, it.c0, 0, it.c1 - it.c0, R.h, gx0, gy0, gx1 - gx0, gy1 - gy0);
        lightCutImage(gk.cv, gx0, gy0, gx1 - gx0, gy1 - gy0, it.c0, 0, it.c1 - it.c0, R.h);
      }
    }
  } else if (it.part === 'ship') {
    const hb = it.sh._hull;
    if (hb) {
      const cut = Math.round(worldToScreen(m.tDn, hb.wy).x);
      if (hb.bx + hb.dw > cut) {
        ctx.save();
        ctx.beginPath();
        // La coque n'est plus cuite au carré (boatKit, PERF-36) : sa hauteur est `dh`.
        ctx.rect(cut, hb.by - 2, hb.bx + hb.dw - cut + 2, hb.dh + 4);
        ctx.clip();
        ctx.globalAlpha = hb.a == null ? 1 : hb.a;
        ctx.drawImage(hb.img, hb.bx, hb.by, hb.dw, hb.dh);
        if (hb.crew) hb.crew(ctx);          // ses marins avec (boatKit.drawCrew)
        ctx.restore();
      }
    }
  } else if (it.part === 'mon') {
    const mk = bk.mons[it.mi];
    if (mk) {
      const R = mk.Mn.R, om = originScreen(R);
      const mx0 = Math.round(om.x), mx1 = Math.round(om.x + R.w * z);
      const my0 = Math.round(om.y), my1 = Math.round(om.y + R.h * z);
      drawSunShadow(ctx, mk.cv, mx0, my0, mx1 - mx0, my1 - my0, 0, 0, R.w, R.h, 'column', false);
      ctx.drawImage(mk.cv, 0, 0, R.w, R.h, mx0, my0, mx1 - mx0, my1 - my0);
      lightCutImage(mk.cv, mx0, my0, mx1 - mx0, my1 - my0, 0, 0, R.w, R.h);
    }
  } else if (it.part === 'prop') {
    drawProp(ctx, m, m.props[it.pi], z, now);
  } else if (it.part === 'idler') {
    const q = m.idlers[it.ii];
    const spec = agentSpecFor(agentSetForBand(m.band), q.charType, q.variant);
    const st = idlerNow(q, now);
    q._shown = null;
    if (spec && st && st.alpha > 0.02) {
      const p = P(m, st.l, q.t);
      const pa0 = ctx.globalAlpha;
      if (st.alpha < 1) ctx.globalAlpha = pa0 * st.alpha;
      // Fiche d'habitant (citizenFocus.js) : désigné ou survolé, l'anneau sous lui.
      const mark = focusMark(q);
      if (mark) drawFocusRingAt(ctx, p.x, p.y, sceneRingWidth(CM.TILE * z * spec.scale * AGENT_SCALE), mark === 2);
      // Repli sur la bande de FACE quand la diagonale ne se charge pas (serveur de
      // dev tombé, image en cours de génération), comme les passants (isoUnits).
      // Sans lui l'accoudé DISPARAISSAIT — et la canne du pêcheur restait seule
      // au-dessus de l'eau (retour Raph 2026-10-03 : « elle pêche toute seule ? »).
      const d = drawNamedAgentIso(ctx, p.x, p.y, z, spec.name, spec.scale, st.dir, st.walking, now, q.ph || 0, 1, st.walking ? st.dist : null, true);
      ctx.globalAlpha = pa0;
      if (d || drawNamedAgent(ctx, p.x, p.y, z, spec.name, spec.scale, q.dir, false, now, 0)) q._shown = now;
      // Cliquable : il se signale avec la boîte peinte (graine = sa travée et sa place).
      if (d) {
        if (q.figSeed == null) q.figSeed = Math.round(q.l * 131 + q.t * 7) + m.sp.gx0 * 7919 + m.sp.gy0 * 104729;
        if (q.charType == null) q.charType = 0;
        noteSceneFigure(q, 'pont', spec.name, p.x, p.y, d);
      }
    }
  } else if (it.part === 'rod') {
    drawRod(ctx, m, m.idlers[it.ii], z, now);
  }
  ctx.imageSmoothingEnabled = prevSm;
}

// LE PÊCHEUR (retour Raph 2026-10-02 : « il pêche ? on ne comprend pas trop, alors
// que l'idée est bonne »). La canne partait presque à PLAT (8 px de montée pour 18
// de long, donc horizontale à l'écran), brun sur planches brunes, et une ligne
// blanche tombait seule dans l'eau, loin de lui : on lisait un piquet. Ce qui dit
// « pêche » au premier coup d'œil : une canne LEVÉE et courbée, foncée sur le
// tablier clair ; un FLOTTEUR rouge qui fait des ronds ; et de temps en temps la
// touche — le flotteur coule, la canne se lève, un poisson remonte au bout de la
// ligne jusqu'aux mains, puis il relance. Une prise un cycle sur deux.
// Temps en ms dans un cycle de P, décalé par pêcheur.
const FISHING = { P: 17000, bite: 10200, strike: 11800, land: 12900, cast: 13500, back: 13900 };
const ROD_INK = [46, 30, 18], LINE_RGB = [232, 236, 228];

// Trait au pixel d'art (k) le long d'une courbe de Bézier quadratique a → c → b.
function artCurve(ctx, a, c, b, k, rgb) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / k) * 2);
  let last = '';
  for (let i = 0; i <= n; i += 1) {
    const s = i / n, u = 1 - s;
    const x = u * u * a.x + 2 * s * u * c.x + s * s * b.x, y = u * u * a.y + 2 * s * u * c.y + s * s * b.y;
    const key = Math.round(x / k) + ',' + Math.round(y / k);
    if (key === last) continue;
    last = key;
    viePixel(ctx, Math.round(x / k) * k, Math.round(y / k) * k, k, rgb, 1);
  }
}
// Ligne de pêche : UN pixel device (un fil, pas un trait d'art), en marches.
function fishLine(ctx, a, b, alpha) {
  const d = CM.dpr || 1, n = Math.max(1, Math.ceil(Math.abs(b.y - a.y) * d));
  ctx.fillStyle = `rgba(${LINE_RGB[0]},${LINE_RGB[1]},${LINE_RGB[2]},${alpha})`;
  for (let i = 0; i < n; i += 1) {
    const s = i / n;
    ctx.fillRect(Math.round((a.x + (b.x - a.x) * s) * d) / d, Math.round((a.y + (b.y - a.y) * s) * d) / d, 1 / d, 1 / d);
  }
}

function drawRod(ctx, m, q, z, now) {
  // Pas de pêcheur à l'image, pas de canne : son item est trié AVANT celui-ci,
  // dans la même frame (même `now`), et note s'il a pu être posé.
  if (q._shown !== now) return;
  const t = now || 0, k = vieK(), fz = vieZoomFade();
  const seed = Math.floor(q.l * 37) % FISHING.P;
  const tc = (t + seed) % FISHING.P, cycle = Math.floor((t + seed) / FISHING.P);
  const catchIt = (cycle & 1) === 0;
  const F = FISHING;
  // Pose de la canne : tenue haute à l'attente, piquée d'un pixel à la touche,
  // levée pendant qu'on remonte la ligne.
  const dips = tc >= F.bite && tc < F.strike && [[0, 260], [620, 900], [1150, 1400]].some(([a, b]) => tc - F.bite >= a && tc - F.bite < b);
  const pulling = tc >= F.strike && tc < F.cast;
  const sway = Math.sin(t / 900 + q.l) * 0.5;
  const hand = P(m, q.l, q.t + 1.5, 5);
  // ⚠ OÙ TOMBE LE BOUT À L'ÉCRAN : un point (t, h) se projette comme le point du
  // tablier (t − h, 0). Une canne LEVÉE (bout à h 18 pour t = tDn + 7) finit donc,
  // à l'écran, AU MILIEU DU TABLIER — sur les passants, la ligne semble partir de
  // l'un d'eux (vu à la capture). Il faut t − h > tDn : la canne sort au-dessus de
  // l'eau, à peine relevée, vers le bas-droite de l'écran, et la ligne tombe
  // devant la face du pont. À la remontée elle se lève, son bout reste au bord.
  const tip = pulling ? P(m, q.l - 1, m.tDn + 14, 12) : P(m, q.l - 1 + sway, m.tDn + 13, dips ? 6 : 7);
  // Courbe : la canne bombe vers le haut et le bout pique (le poids de la ligne) ;
  // elle plie davantage quand elle tire.
  const bend = (pulling ? 4 : dips ? 3 : 2.5) * k;
  const ctl = { x: (hand.x + tip.x) / 2, y: (hand.y + tip.y) / 2 - bend };
  // L'eau sous le bout de la canne, un peu dérivée vers l'aval (le courant).
  const water = P(m, q.l - 1, m.tDn + 16, -m.hq);
  const lineA = 0.5 * (1 - 0.5 * (CM.nightF || 0));
  const prevSm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  // Le bout de la ligne : flotteur à l'eau, prise (ou flotteur vide) remontée,
  // poisson ramené aux mains, flotteur relancé.
  let end = water, hang, ring = null;
  if (tc < F.bite) {
    const qr = (tc % 2600) / 2600;
    ring = { r: 1 + qr * 3, a: (1 - qr) * 0.45 };
    hang = { spr: vieSprite('bobber', Math.floor(tc / 900) & 1), at: water };
  } else if (tc < F.strike) {
    const u = tc - F.bite;
    const lastDip = u >= 1150 ? 1150 : u >= 620 ? 620 : 0;
    const qr = Math.min(1, (u - lastDip) / 600);
    ring = { r: 1 + qr * 3, a: (1 - qr) * 0.6 };
    hang = { spr: vieSprite('bobber', dips ? 2 : 1), at: water };
  } else if (tc < F.land) {
    // On remonte : la prise file de l'eau au bout de la canne.
    const u = (tc - F.strike) / (F.land - F.strike), e = 1 - (1 - u) * (1 - u);
    end = { x: water.x + (tip.x - water.x) * e, y: water.y + (tip.y + 6 * k - water.y) * e };
    const qr = Math.min(1, (tc - F.strike) / 900);
    ring = { r: 1 + qr * 5, a: (1 - qr) * 0.7 };
    hang = catchIt ? { spr: vieSprite('fishHang', Math.floor(t / 110) & 1), at: end } : { spr: vieSprite('bobber', 0), at: { x: end.x, y: end.y + 2 * k } };
    if (catchIt && u < 0.45) {
      // Gerbe : deux gouttes qui montent et retombent.
      const g = u / 0.45;
      for (const side of [-1, 1]) viePixel(ctx, water.x + side * (1 + g * 3) * k, water.y - Math.sin(g * Math.PI) * 4 * k, k, [236, 244, 246], 0.9 * fz);
    }
  } else if (tc < F.cast) {
    // La prise passe du bout de la canne aux mains (puis au panier : elle
    // disparaît) ; ratée, le flotteur pend au bout de la canne.
    const u = (tc - F.land) / (F.cast - F.land);
    end = catchIt
      ? { x: tip.x + (hand.x - tip.x) * u, y: tip.y + 6 * k + (hand.y - tip.y - 6 * k) * u }
      : { x: tip.x, y: tip.y + 6 * k };
    hang = catchIt ? { spr: vieSprite('fishHang', Math.floor(t / 110) & 1), at: end } : { spr: vieSprite('bobber', 0), at: { x: end.x, y: end.y + 2 * k } };
  } else if (tc < F.back) {
    // Relance : le flotteur part du bout de la canne et retombe à l'eau.
    const u = (tc - F.cast) / (F.back - F.cast);
    const x = tip.x + (water.x - tip.x) * u, y = tip.y + (water.y - tip.y) * u * u;
    end = { x, y };
    hang = { spr: vieSprite('bobber', 0), at: { x, y: y + 2 * k } };
  } else {
    // Le plouf de la relance, puis l'attente reprend.
    const qr = Math.min(1, (tc - F.back) / 800);
    ring = { r: 1 + qr * 4, a: (1 - qr) * 0.6 };
    hang = { spr: vieSprite('bobber', Math.floor(tc / 900) & 1), at: water };
  }
  if (ring && ring.a > 0.02) vieRing(ctx, water.x, water.y, Math.round(ring.r), k, ring.a * fz);
  // La ligne d'abord (elle passe derrière la prise), puis la canne, puis le bout.
  fishLine(ctx, tip, end, lineA);
  artCurve(ctx, hand, ctl, tip, k, ROD_INK);
  if (hang && hang.spr && vieBlit(ctx, hang.spr, hang.at.x, hang.at.y, k, fz)) vieCount('pecheur');
  ctx.imageSmoothingEnabled = prevSm;
}

// Écran d'un point (l, t, h) du repère du pont.
function P(m, l, t, h = 0) {
  return m.vertical ? worldToScreen(t, l, h) : worldToScreen(l, t, h);
}

// Ombre du parapet AMONT portée sur le tablier : le soleil (haut-gauche) la
// couche vers l'aval, un liseré au pied du parapet qui l'assoit sur la chaussée.
function drawDeckShade(ctx, m) {
  const a = sunShadowAlpha();
  const Q = m.K.parapet;
  if (!(a > 0) || !Q || !Q.h || !m.vertical) return;
  const k = 0.894 * SUN_SHADOW.len;
  const t0 = m.tUp + m.pth, t1 = t0 + k * Q.h * (Q.type === 'wall' ? 1 : 0.8);
  const q = [P(m, m.pA, t0), P(m, m.pB, t0), P(m, m.pB, t1), P(m, m.pA, t1)];
  ctx.save();
  ctx.globalAlpha = a * 0.8;
  ctx.globalCompositeOperation = SUN_SHADOW.mode || 'multiply';
  ctx.fillStyle = SUN_SHADOW.col;
  ctx.beginPath();
  ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < 4; i += 1) ctx.lineTo(q[i].x, q[i].y);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawProp(ctx, m, pr, z, now) {
  const p = P(m, pr.l, pr.t, pr.h);
  const ph = (pr.l * 0.37 + pr.t * 0.11) % 3;
  if (pr.prop === 'flame') { drawFlame(ctx, p.x, p.y, z, now, pr.small ? 0.8 : pr.big ? 1.6 : 1, ph); return; }
  if (pr.prop === 'lantern') {
    // Lanterne pendue au linteau : un fil, une cage sombre, la flamme dedans.
    const top = P(m, pr.l, pr.t, pr.hang);
    const w = Math.max(1, Math.round(z));
    ctx.fillStyle = '#3a2614';
    ctx.fillRect(Math.round(p.x) - Math.floor(w / 2), Math.round(top.y), w, Math.max(1, Math.round(p.y - top.y - 3 * z)));
    ctx.fillRect(Math.round(p.x - 1.5 * z), Math.round(p.y - 3 * z), Math.round(3 * z), Math.round(4 * z));
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(Math.round(p.x - 0.5 * z), Math.round(p.y - 2 * z), Math.max(1, Math.round(z)), Math.max(1, Math.round(2 * z)));
    glowAt(p.x, p.y - z, Math.max(6, CM.TILE * z * 0.6), '255,190,110', 0.7);
    return;
  }
  if (pr.prop === 'flag') {
    // Hampe et drapeau : la recette commune de la ville (même vent, même grain que
    // les drapeaux des bâtiments publics), sur la grille du pont (k = zoom).
    drawVieFlag(ctx, p.x, p.y, {
      k: z, now, poleH: pr.poleH || 10, w: pr.fw || 6, h: pr.fh || 4,
      cols: pr.cols || m.K.pal.banner, swallow: pr.cols ? !!pr.swallow : true, seed: pr.seed || 0,
    });
    return;
  }
  if (pr.prop === 'glow') {
    glowAt(p.x, p.y, Math.max(6, CM.TILE * z * 0.55), m.K.pal.led ? hexToRgbStr(m.K.pal.led) : '255,220,160', 0.8);
    return;
  }
  drawSpriteProp(ctx, pr, p, z, now);
}
// ── PASSE A : l'eau sous et à côté du pont (avant les bateaux) ────────────────
// Clippé à l'eau VISIBLE : le ruban, et le ruban descendu de la hauteur du mur de
// quai (sous la rive nord l'eau commence au pied du mur, pas à la margelle).
// Audit du 05/10 (PERF-37) : à chaque frame, les berges se recalculaient (deux
// objets par sample), le ruban se reprojetait deux fois par travée et se découpait
// deux fois — un masque du fleuve ENTIER, le plus cher en rendu logiciel (~2 ms
// par travée mesurés) —, même pont hors champ. Les berges sont gardées par fleuve
// (elles ne dépendent que des samples), le ruban projeté une fois par frame, et
// une travée dont les remplissages tombent hors de l'écran ne trace ni ne découpe
// rien. Mêmes points, même chemin, mêmes remplissages : même image.
// (Gardées par tableau de samples ET par recalcul du layout : un fleuve retouché sur
// place se retrace au recalcul suivant — toutes les 1,5 s au pire, un calcul de rien.)
let _edgesOf = null, _edgesKey = '', _edges = null;
let _ribX = new Float64Array(0), _ribY = new Float64Array(0);
export function drawIsoBridgeUnder() {
  const ms = bridgeGeoms(); if (!ms) return;
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const sun = sunShadowAlpha();
  const ek = rv.samples.length + ':' + T + ':' + CM.layoutRecomputeAt;
  if (_edgesOf !== rv.samples || _edgesKey !== ek) { _edges = riverEdgesWorld(rv.samples, T); _edgesOf = rv.samples; _edgesKey = ek; }
  const edges = _edges, nL = edges.left.length, nR = edges.right.length;
  let projected = false;
  const project = () => {
    if (_ribX.length < nL + nR) { _ribX = new Float64Array(nL + nR); _ribY = new Float64Array(nL + nR); }
    for (let i = 0; i < nL; i += 1) { const s = worldToScreen(edges.left[i].x, edges.left[i].y); _ribX[i] = s.x; _ribY[i] = s.y; }
    for (let i = 0; i < nR; i += 1) { const s = worldToScreen(edges.right[i].x, edges.right[i].y); _ribX[nL + i] = s.x; _ribY[nL + i] = s.y; }
    projected = true;
  };
  const ribbon = (dy) => {
    ctx.beginPath();
    for (let i = 0; i < nL; i += 1) { if (i) ctx.lineTo(_ribX[i], _ribY[i] + dy); else ctx.moveTo(_ribX[i], _ribY[i] + dy); }
    for (let i = nR - 1; i >= 0; i -= 1) ctx.lineTo(_ribX[nL + i], _ribY[nL + i] + dy);
    ctx.closePath();
  };
  const cw = CM.cw || 0, ch = CM.ch || 0, cull = cw > 0 && ch > 0;
  for (const m of ms) {
    if (!(m.fB > m.fA)) continue;
    const corners = (l0, l1, t0, t1) => [P(m, l0, t0, -m.hq), P(m, l1, t0, -m.hq), P(m, l1, t1, -m.hq), P(m, l0, t1, -m.hq)];
    // Sous le tablier : la pénombre qu'on voit à travers les arches.
    const qUnder = corners(m.fA - T, m.fB + T, m.tUp, m.tDn);
    // L'ombre du soleil côté aval : le tablier et la face (hauteur du mur), puis le
    // parapet, ajouré, à demi-dose. Aucun jour sous les arches : le rayon qui y
    // passerait bute sur le dessous du tablier, large de deux cases.
    let qSun = null, qPar = null;
    const Q = m.K.parapet;
    if (sun > 0 && m.vertical) {
      const k = 0.894 * SUN_SHADOW.len;
      qSun = corners(m.fA, m.fB, m.tDn, m.tDn + k * m.hq);
      if (Q && Q.h) qPar = corners(m.fA, m.fB, m.tDn + k * m.hq, m.tDn + k * (m.hq + Q.h));
    }
    if (cull) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of [qUnder, qSun, qPar]) {
        if (!q) continue;
        for (const p of q) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
      }
      if (x1 < -2 || y1 < -2 || x0 > cw + 2 || y0 > ch + 2) continue;
    }
    if (!projected) project();
    ctx.save();
    ribbon(0);
    ctx.clip();
    ribbon(m.hq * z);
    ctx.clip();
    const fillQ = (q) => {
      ctx.beginPath();
      ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < 4; i += 1) ctx.lineTo(q[i].x, q[i].y);
      ctx.closePath(); ctx.fill();
    };
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = bridgeTune.underA;
    ctx.fillStyle = bridgeTune.under;
    fillQ(qUnder);
    if (qSun) {
      // L'ombre du soleil au mode de toutes les autres (source-over depuis PERF-1) :
      // en multiply, son bleu nuit ne s'y poserait pas, l'ombre du pont aurait un
      // autre ton que celle des façades.
      ctx.globalCompositeOperation = SUN_SHADOW.mode || 'multiply';
      ctx.fillStyle = SUN_SHADOW.col;
      ctx.globalAlpha = sun;
      fillQ(qSun);
      if (qPar) {
        ctx.globalAlpha = sun * (Q.type === 'wall' ? 1 : 0.5);
        fillQ(qPar);
      }
    }
    ctx.restore();
  }
}

// ── NUIT : les lueurs du pont se reflètent dans l'eau ─────────────────────────
// Sous chaque brasero aval (au-dessus de l'eau), une colonne de courts traits qui
// miroitent — la grammaire des reflets du fleuve. Après le voile de nuit.
export function drawIsoBridgeNight(now) {
  const nf = CM.nightF || 0;
  if (nf < 0.15 || CM.lodActive) return;
  const ms = bridgeGeoms(); if (!ms) return;
  const ctx = CM.ctx, z = CM.cam.zoom;
  const tsec = (now || 0) / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of ms) {
    const glow = m.K.pal.glow ? hexToRgbStr(m.K.pal.glow) : null;
    // REFLETS des lumières aval qui surplombent l'eau : quatre traits chauds qui
    // rétrécissent et s'éteignent en descendant (à six traits francs, on lisait
    // une échelle posée sur l'eau).
    for (const pr of m.props) {
      const L = PROP_LIGHT[pr.prop];
      if (!L || pr.side !== 'dn') continue;
      if (pr.l < m.fA || pr.l > m.fB) continue;           // sur la berge : pas d'eau dessous
      const q = P(m, pr.l, m.tDn + 4, -m.hq);
      for (let k = 0; k < 4; k += 1) {
        const sw = Math.sin(tsec * 2.6 + pr.l * 0.13 + k * 1.7);
        const w = Math.max(2, (6 - k * 1.2) * z * (0.8 + 0.2 * sw));
        ctx.fillStyle = `rgba(${L.col},${(nf * (0.26 - k * 0.055) * (0.72 + 0.28 * sw)).toFixed(3)})`;
        ctx.fillRect(Math.round(q.x - w / 2 + sw * z), Math.round(q.y + 2 * z + k * 2.5 * z), Math.round(w), Math.max(1, Math.round(z)));
      }
    }
    // Les CÂBLES de la suspension luisent dans la couleur de l'ère.
    const S = m.K.superstructure;
    if (S && S.type === 'suspension' && glow && m.towers.length === 2) {
      const [lA, lB] = m.towers, Q = m.K.parapet || { h: 0 };
      const low = Q.h + 3, top = S.towerH - 3, mid = (lA + lB) / 2, half = (lB - lA) / 2;
      const cab = (l) => low + (top - low) * Math.pow(Math.abs(l - mid) / half, 2);
      ctx.strokeStyle = `rgba(${glow},${(0.32 * nf).toFixed(3)})`;
      ctx.lineWidth = Math.max(2, 2.5 * z);
      for (const t of [m.tUp - 1.5, m.tDn + 1.5]) {
        ctx.beginPath();
        for (let l = lA; l <= lB; l += 4) { const p = P(m, l, t, cab(l)); if (l === lA) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
        ctx.stroke();
      }
    }
    // Les MÂTS des haubans portent un feu rouge qui clignote, comme en vrai.
    if (S && S.type === 'stayed') {
      const on = Math.sin(tsec * 3.1) > -0.2;
      for (const lm of m.masts) {
        const p = P(m, lm, m.tDn + 1.5, S.mastH + 1);
        ctx.fillStyle = `rgba(255,70,50,${((on ? 0.9 : 0.25) * nf).toFixed(3)})`;
        ctx.fillRect(Math.round(p.x - z), Math.round(p.y - z), Math.max(2, Math.round(2 * z)), Math.max(2, Math.round(2 * z)));
      }
    }
    // Les ANNEAUX de lumière des portes cosmiques rayonnent.
    if (glow) {
      for (const g of m.gates) {
        if (g.type !== 'ring') continue;
        const c = (g.tA + g.tB) / 2, rad = (g.tB - g.tA) / 2 - g.band / 2;
        ctx.strokeStyle = `rgba(${glow},${(0.35 * nf).toFixed(3)})`;
        ctx.lineWidth = Math.max(3, 4 * z);
        ctx.beginPath();
        for (let a = 0; a <= 32; a += 1) {
          const th = Math.PI * a / 32;
          const p = P(m, g.l1, c + Math.cos(th) * rad, Math.sin(th) * rad);
          if (a === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// ── Sondes ───────────────────────────────────────────────────────────────────
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__bridgeTune = bridgeTune;
  // __bridgeGeo() → le modèle de chaque travée (sans le kit, lisible en console).
  window.__bridgeGeo = () => (bridgeGeoms() || []).map((m) => ({
    vertical: m.vertical, lanes: m.lanes, band: m.band, kit: m.K.id,
    tUp: m.tUp, tDn: m.tDn, hq: m.hq, face: [m.fA, m.fB], parapets: [m.pA, m.pB], deck: [m.dA, m.dB],
    passW: m.passW, piers: m.piers.map((p) => p.l), arches: m.arches.map((a) => [a.l0, a.l1]),
    props: m.props.length, walk: m.walk,
  }));
  window.__bridgeWalk = (wx, wy) => bridgeWalkBand(wx, wy);
}
