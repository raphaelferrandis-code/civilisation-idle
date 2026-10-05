// LES UNITÉS MOBILES — ce qui circule sur la carte, et OÙ ça se range au tri.
//
// Extraites d'isoRenderer.js le 2026-08-23 (Q10). Deux choses, qui n'en font qu'une :
//   · le DESSIN — véhicules 4 directions avec attelage et pousseur, émeutiers,
//     objets portés par les habitants ;
//   · la PROFONDEUR — la clé de tri qui les empêche de se faire avaler par une
//     emprise de bâtiment, la sonde qui la mesure, et le voile FANTÔME des unités
//     cachées.
// Le second existe POUR le premier : une unité qui circule est ponctuelle, et le
// tri scalaire `wx + wy` du peintre ne suffit pas face à un sprite multi-tuiles.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, six sortantes. Vérifiée ligne à ligne contre la
// version commitée.
//
// ⚠ AUCUN CYCLE : `agents.js` (d'où viennent les sprites d'habitants et de
// véhicules), `isoBridge` et `quaysAndRiot` ne remontent jamais vers le peintre —
// vérifié avant la coupe. `agents.js` cite bien `drawIsoVehicle`, mais en PROSE.
import { CM, cmEngineHomeHidden } from '../layout.js';
import { isoFrontOffset } from './isoGroundDetail.js';
import { districtMassTiles } from './isoDistricts.js';
import { worldToScreen } from './projection.js';
import { drawRiotWeapon } from '../quaysAndRiot.js';
import { pxProbe, recPx } from '../pixelGrid.js';
import { snapDev as snapU } from '../blitSnap.js';
import { queueFlameGlow, FLAME_COL, FIRE_INK } from '../flameGlow.js';
import { drawSunShadow, sunShadowNightK } from './isoSunShadow.js';
import {
  drawEraAgent, drawEraAgentIso, drawNamedAgent, drawNamedAgentIso, drawVehicleHeadlights,
  vehicleLaneOffset, ensureVeh, vehReady, VEH_SIZES, VEH_PULL, VEH_PUSH,
  ensureVehDiag, vehDiagReady, eraVehSpec, riotEraKey, AGENT_SCALE, VEH_SCALE, imgInkBox, citizenPose } from '../agents.js';
import { drawCitizenFocusRing, drawFocusRingAt, focusMark, noteFigure, noteVehicle } from '../citizenFocus.js';

// ── Véhicule en iso (Phase 1.5) : corps sprite 4-dirs + attelage/pousseur ────
// Réutilise les briques legacy (ensureVeh, VEH_PULL/PUSH, bandes de marche) mais
// TOUTES les positions passent par la projection : offsets de file/attelage
// calculés en MONDE puis projetés. Drones exclus (tri aérien, plus tard) ;
// vues encore cardinales — les diagonales arrivent avec l'art Phase 4.
const VEH_DIRS = ['east', 'west', 'south', 'north'];
// Corrections d'orientation PAR TYPE (audit visuel des rotations d'objets PixelLab,
// planches .preview-shots/<type>-4views.png, bug vu par Raph « profil d'ouest en
// est ») : le générateur INVERSE les deux vues SUD sur certains objets (voiture,
// char, caravane, tram). Tableau = fichier à afficher pour la dir MONDE 0..3
// (E,O,S,N → écran SE,NO,SO,NE). Le wagon est correct tel quel (default).
// L'entrée `cart` est partie avec le retrait des véhicules poussés à la main.
const VEH_DIAG_MAP = {
  default: ['southeast', 'northwest', 'southwest', 'northeast'],
  car: ['southwest', 'northwest', 'southeast', 'northeast'],
  chariot: ['southwest', 'northwest', 'southeast', 'northeast'],
  // caravan : labels devenus VRAIS après la régénération d'animation (le modèle
  // v3 a « redressé » l'orientation, re-audit veh-audit2.png 2026-07-11) → map
  // par défaut. ⚠ RE-AUDITER après toute régénération : les labels bougent.
  tram: ['southwest', 'northwest', 'southeast', 'northeast'],
};
// Pas de roue (fraction de tuile parcourue par frame de bande diagonale) : par défaut
// il SUIT VEH_SCALE (0.144 · 0.625 = 0.09, le réglage d'origine à taille pleine) — une
// roue rétrécie couvre moins de sol par tour, sinon elle glisse au lieu de rouler.
// __vehStride(x) impose une valeur fixe (unités finales), __vehStride(0) rend la main
// au suivi automatique. Même contrat que __strideLen pour le pas des piétons.
const vehStrideT = { v: null };
function vehStride() { return vehStrideT.v != null ? vehStrideT.v : 0.144 * VEH_SCALE; }
if (typeof window !== 'undefined') window.__vehStride = (x) => { vehStrideT.v = x > 0 ? x : null; return vehStride(); };

// ── GRILLE DE BLIT DES UNITÉS QUI ROULENT ───────────────────────────────────
// Le blit est en PLUS PROCHE VOISIN (`imageSmoothingEnabled = false`) : à
// position fractionnaire, la coupe des lignes source se DÉPLACE d'une image à
// l'autre pendant que le véhicule avance, et le sprite fourmille. C'est le même
// défaut que les habitants ont eu jusqu'au 2026-08-03 ; eux ont été rabattus sur
// l'entier ce jour-là (`drawNamedAgentIso`), les véhicules et les bêtes de trait
// ne l'ont jamais été. Mesuré au lot G0 (docs/PLAN-GRILLE-PIXELS.md §2.1) : ils
// cumulaient la perte de lignes (3 sur 4) ET le déplacement de la coupe.
//
// ⚠ RABATTU SUR LA GRILLE **DEVICE**, PAS SUR LA GRILLE CSS. Le contexte de la
// carte est scalé par `dpr`, donc un `Math.round` en px CSS tombe sur `dpr` px
// device : entier à dpr 1 et 2, mais sur un QUART de pixel à 1,25 et une DEMIE à
// 1,5 — les deux échelles Windows les plus répandues, où l'arrondi ne servirait
// donc à rien. C'est la leçon S6 de PLAN-RENDU-VILLE, déjà payée pour les
// bâtiments (`snapDev`, cityEngineSprites.js) ; on ne la repaie pas ici.
// À dpr 1, `snapU` EST `Math.round` : sur un écran à 100 %, rien ne bouge.
// L'arrondi lui-même vit dans blitSnap.js (`snapDev`, importé ici sous son
// ancien nom) : depuis le 2026-09-14 les habitants, les bateaux et le bétail
// le partagent — un seul arrondi pour tout ce qui bouge.

// Bête de trait (cheval/bœuf) en VUE DIAGONALE : bandes veh-{animal}-{diag}.png
// (objets 8-dir PixelLab animés « walking » 6 frames), frame par DISTANCE
// (v.rollDist, même odomètre que les roues). Renvoie false si les bandes ne
// sont pas prêtes → repli sur la bande cardinale legacy (drawNamedAgent).
const DRAFT_DIAG_MAP = { default: ['southeast', 'northwest', 'southwest', 'northeast'] };
// Exportée pour les bêtes de trait hors de la route (attelages des champs).
export function drawDraftIso(ctx, x, yFeet, z, animal, v) {
  const dchr = ensureVehDiag(animal);
  if (!vehDiagReady(dchr)) return false;
  const map = DRAFT_DIAG_MAP[animal] || DRAFT_DIAG_MAP.default;
  const img = dchr.img[map[v.dir]] || dchr.img[map[0]];
  if (!img || !(img.naturalWidth > 0)) return false;
  const fh = img.naturalHeight || 68;
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  const fr = nf > 1 ? Math.floor((v.rollDist || 0) / (CM.TILE * vehStride())) % nf : 0;
  const s = CM.TILE * z;
  // Hauteur exprimée AVANT AGENT_SCALE, comme les `scale` d'agents (0.975·0.8 = 0.78
  // tuile, l'ancienne valeur en dur) : la bête de trait suit donc la taille des
  // habitants. Plus haut que le 0.72-0.74 legacy parce que l'objet a du vide autour.
  // Taille ET position sur la grille de blit (cf. snapU) : le bœuf marche, donc
  // sans ça sa coupe de lignes bougeait à chaque pas.
  const dh2 = Math.max(1, snapU(s * 0.975 * AGENT_SCALE)), dw2 = dh2;
  if (pxProbe.on) recPx('bete · ' + animal, fh, dh2);   // sonde G0 (pixelGrid.js)
  const bx = snapU(x - dw2 / 2), by = snapU(yFeet - dh2 * 0.82);
  // Sol INCLINÉ : une bête vue en biais a ses sabots à plusieurs hauteurs d'écran.
  drawSunShadow(ctx, img, bx, by, dw2, dh2, fr * fh, 0, fh, fh, 'slope');
  ctx.drawImage(img, fr * fh, 0, fh, fh, bx, by, dw2, dh2);
  return true;
}

// ── LE POINT DE TRI D'UN VÉHICULE (retour Raph, 2026-10-03 : un passant debout sur un
// chariot) ─────────────────────────────────────────────────────────────────────────
// La carrosserie est dessinée CENTRÉE sur l'ancre : son contact au sol tombe plus bas à
// l'écran, et c'est là que le véhicule doit se trier (isoLiveCollect déplace sa clé de
// `h` sur chaque axe monde). Ce décalage était un 0,30 × la taille de BASE du type :
// faux deux fois pour les véhicules d'époque, DESSINÉS à leur propre taille (1,3 à
// 2,4 contre 0,8 à 1,4) et dont le contact mesuré va de 0,26 à 0,43 du cadre selon la
// vue. Leur clé restait en arrière : un passant qui marchait juste derrière la caisse
// se dessinait par-dessus. Le contact est désormais MESURÉ sur l'image servie (ligne
// de sol roues/sabots au centre de l'encre, même enveloppe que l'ombre 'slope'), à la
// taille réellement dessinée, et posé sur le véhicule (`v._sortH`) pour la collecte de
// la frame suivante. Repli tant qu'il n'a jamais été dessiné : 0,30 × la bonne taille.
const _contactF = new WeakMap();
function vehContactF(img, fh) {
  let m = _contactF.get(img);
  if (m === undefined) {
    m = null;
    try {
      if (typeof document !== 'undefined' && fh > 0) {
        const c = document.createElement('canvas');
        c.width = fh; c.height = fh;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, fh, fh, 0, 0, fh, fh);
        const d = g.getImageData(0, 0, fh, fh).data;
        m = contactFraction((x, y) => d[(y * fh + x) * 4 + 3], fh);
      }
    } catch { m = null; }
    _contactF.set(img, m);
  }
  return m;
}
// Pure (testée) : fraction du cadre (0 = haut) où tombe le sol sous le CENTRE de l'encre,
// sur l'enveloppe basse des pieds de colonne proches du bas (cf. slopeGround).
export function contactFraction(alpha, fh) {
  const bottom = new Int32Array(fh).fill(-1);
  for (let x = 0; x < fh; x += 1) for (let y = fh - 1; y >= 0; y -= 1) if (alpha(x, y) > 16) { bottom[x] = y; break; }
  let yb = -1, xa = fh, xb = -1;
  for (let x = 0; x < fh; x += 1) if (bottom[x] >= 0) { if (bottom[x] > yb) yb = bottom[x]; if (x < xa) xa = x; xb = x; }
  if (yb < 0) return null;
  const hull = [];
  for (let x = 0; x < fh; x += 1) {
    if (bottom[x] < 0 || bottom[x] < yb - 0.35 * fh) continue;
    const p = [x, bottom[x] + 1];
    while (hull.length >= 2) {
      const a = hull[hull.length - 2], b = hull[hull.length - 1];
      if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) hull.pop(); else break;
    }
    hull.push(p);
  }
  const xc = (xa + xb) / 2;
  let g = hull[hull.length - 1][1];
  if (xc <= hull[0][0]) g = hull[0][1];
  else for (let i = 1; i < hull.length; i += 1) {
    const a = hull[i - 1], b = hull[i];
    if (xc <= b[0]) { g = a[1] + (b[1] - a[1]) * (xc - a[0]) / (b[0] - a[0]); break; }
  }
  return g / fh;
}
// Décalage de tri (px monde, sur chaque axe) d'un véhicule, lu par isoLiveCollect.
const vehDrawSize = (v) => {
  const era = v.skin ? eraVehSpec(v.type, v.skin) : null;
  return era ? era.size : (VEH_SIZES[v.type] || 0);
};
export function vehSortLift(v, T) {
  if (v._sortH != null) return v._sortH;
  return T * 0.30 * vehDrawSize(v) * VEH_SCALE;
}
// Demi-largeur d'encre d'un véhicule pour le recouvrement de colonne (isoUnitDepthEx) :
// ~40 % de la boîte dessinée (l'encre ne la remplit pas jusqu'aux bords).
export function vehSortWide(v, T) {
  return 0.4 * T * vehDrawSize(v) * VEH_SCALE;
}

// ── PASSANTS AUTOUR D'UN VÉHICULE : ordre LOCAL ──────────────────────────────────
// Une seule clé par véhicule ne peut pas être juste sur toute sa longueur : vu en
// biais, son sol monte d'un bout à l'autre (un chariot d'époque fait 1,3 tuile, un
// tram 2,4). Un passant qui recoupe le véhicule à l'écran est donc rangé par rapport
// à la ligne de sol du véhicule À SA COLONNE : pieds plus bas = devant (dessiné
// après), plus haut = derrière (dessiné avant). La ligne : le segment au sol du
// véhicule, centré sur son point de tri, le long de son axe de marche. Même règle
// que l'audit du 2026-10-03 (avant : ~6 % des recouvrements mal rangés, dont des
// passants debout sur les chariots). Molette : __vehOrder(false) pour comparer.
export const VEH_ORDER = { on: true };
if (typeof window !== 'undefined') window.__vehOrder = (on) => { VEH_ORDER.on = on !== false; return VEH_ORDER.on; };
export function orderUnitsAroundVehicles(items, T) {
  if (!VEH_ORDER.on) return;
  let vs = null;
  for (const it of items) if (it.kind === 'veh' && it.v && it.v.type !== 'basket') (vs || (vs = [])).push(it);
  if (!vs) return;
  const eps = T * 0.001, hp = T * 0.8;          // hauteur d'un passant, en unités de profondeur
  for (const iv of vs) {
    const v = iv.v, lh = vehSortWide(v, T);
    if (!(lh > 0)) continue;
    const hv = 3 * lh;                          // hauteur du véhicule au-dessus de son sol
    const cx = iv.gwx, cy = iv.gwy, sc = cx - cy, alongX = v.dir === 0 || v.dir === 1;
    for (const it of items) {
      if (it.kind !== 'cit' && it.kind !== 'riot') continue;
      const s = it.gwx - it.gwy;
      if (s < sc - lh || s > sc + lh) continue;
      const dp = it.gwx + it.gwy;
      const dseg = alongX ? s + 2 * cy : 2 * cx - s;   // profondeur du sol du véhicule à cette colonne
      if (dp < dseg - hv || dp > dseg + hp) continue;  // pas de recouvrement à l'écran
      if (dp > dseg) { if (it.d <= iv.d) it.d = iv.d + eps; } else if (it.d >= iv.d) it.d = iv.d - eps;
    }
  }
}

// Fondu d'apparition (BUG-56, audit du 2026-10-05) : le nouveau venu de la flotte
// (cmSyncRoadFleet), ou celui qu'updateVehicles remet sur la route — `v.fade` monte
// de 0 à 1 en ~0,5 s. Il était posé, jamais lu. Absent = 1 (autoroute, molettes).
export function drawIsoVehicle(ctx, v, now, z) {
  const fa = v.fade == null ? 1 : v.fade;
  if (fa <= 0.02) return;
  if (fa >= 1) { drawIsoVehicleInner(ctx, v, now, z); return; }
  const pa = ctx.globalAlpha;
  ctx.globalAlpha = pa * fa;
  try { drawIsoVehicleInner(ctx, v, now, z); } finally { ctx.globalAlpha = pa; }
}
function drawIsoVehicleInner(ctx, v, now, z) {
  const T = CM.TILE, s = T * z;
  const lo = vehicleLaneOffset(v, T);              // offset en px MONDE (s = TILE)
  const wx = v.x + lo.x, wy = v.y + lo.y;
  const p = worldToScreen(wx, wy);
  if (p.x < -s * 2 || p.y < -s * 2 || p.x > CM.cw + s * 2 || p.y > CM.ch + s * 2) return;
  if (v.type === 'basket') {                       // porteurs de panier (ères anciennes)
    // Le porteur marche sur une route, donc toujours en biais à l'écran : vue
    // DIAGONALE si sa bande est livrée (même contrat que les habitants d'ère,
    // animation par DISTANCE via l'odomètre v.rollDist), sinon repli cardinal.
    const nm = v.woman ? 'basket-woman' : 'basket-man';
    const walking = (v.pauseT || 0) <= 0;
    // Fiche d'habitant : le porteur désigné ou survolé a son anneau, comme un passant.
    const bmark = v.seed != null ? focusMark(v) : 0;
    if (bmark) drawFocusRingAt(ctx, p.x, p.y, s * 1.24 * AGENT_SCALE * 1.19, bmark === 2);
    // 1.24 = compensation des bandes FLAT (ratio perso/canvas 0.50 vs 0.73 avant,
    // cf. tables AGENT_* d'agents.js) — diagonales ET cardinales régénérées 2026-08-03.
    // Phase de pas tirée de la GRAINE du porteur, pas de sa position : v.x·0,02 glissait
    // en marchant (foulée plus rapide vers l'est, plus lente vers l'ouest).
    const bph = ((v.seed >>> 0) % 997) / 997;
    const bd = drawNamedAgentIso(ctx, p.x, p.y, z, nm, 1.24, v.dir, walking, now, bph, 1, v.rollDist != null ? v.rollDist : null);
    if (!bd) {
      drawNamedAgent(ctx, p.x, p.y, z, nm, 1.24, v.dir, walking, now, bph);
    } else if (v.seed != null) {
      // Silhouette : la médiane d'encre des bandes de piétons (agents.js).
      noteVehicle(v, { x0: p.x - bd.drawW * 0.28, x1: p.x + bd.drawW * 0.28, y0: bd.top + bd.drawH * 0.03, y1: bd.top + bd.drawH * 0.91 }, null);
    }
    return;
  }
  if (!VEH_SIZES[v.type]) return;                  // type sans sprite (broken_cart…) : rien en iso
  // VEH_SCALE (molette __vehScale) était ignoré ICI : la vue iso dessinait les
  // véhicules à leur taille d'art brute. Il est appliqué à la carrosserie ET aux
  // distances d'attelage plus bas, sinon l'équipage décroche de la carrosserie.
  // Taille sur la grille de blit (cf. snapU) — la position l'est aussi, au blit
  // lui-même. ⚠ `dh` sert AUSSI à caler l'attelage et le pousseur (`+ dh · 0,24`
  // plus bas) : le rabattement les décale d'un huitième de pixel au pire, et il
  // vaut mieux qu'ils suivent la carrosserie RÉELLEMENT dessinée que sa valeur
  // idéale — c'est la même raison qui fait passer VEH_SCALE dans les distances.
  // VUE DIAGONALE si disponible (rotations d'objets PixelLab, direction-correcte,
  // multi-frames « rolling » quand la bande animée est livrée), sinon repli sur
  // la bande CARDINALE (animée mais orientée écran).
  let img = null, usedDiag = false;
  // Skin d'INSTANCE de la flotte moderne (veh-car-sedan-red-…) : tiré au spawn,
  // chargé paresseusement. Tant qu'il n'est pas arrivé — et il arrive une frame
  // ou deux après l'apparition du véhicule — on dessine la bande NUE du type
  // plutôt que rien : `car` a encore sa vieille automobile pour ça.
  let dchr = v.skin ? ensureVehDiag(v.type, v.skin) : null;
  let onSkin = vehDiagReady(dchr);
  if (!onSkin) dchr = ensureVehDiag(v.type);
  if (vehDiagReady(dchr)) {
    // ⚠ LA CORRECTION D'ÉTIQUETAGE SUIT LA BANDE, PAS LE TYPE. VEH_DIAG_MAP
    // rattrape une inversion sud↔sud des rotations PixelLab ; les bandes du pack
    // MinZinn, elles, sont nommées juste. Appliquer la correction `car` à un skin
    // ferait rouler les berlines de travers — et seulement dans deux directions
    // sur quatre, le genre de bug qu'on ne voit qu'en suivant une voiture.
    const map = (onSkin ? VEH_DIAG_MAP.default : VEH_DIAG_MAP[v.type]) || VEH_DIAG_MAP.default;
    img = dchr.img[map[v.dir]] || dchr.img[map[0]];
    usedDiag = true;
  } else {
    dchr = null;
    const chr = ensureVeh(v.type);
    if (!vehReady(chr)) return;
    // Vues poussées : timon vers l'arrière (échange sud↔nord, comme le legacy).
    const sdir = VEH_PUSH[v.type] ? ['east', 'west', 'north', 'south'][v.dir] : VEH_DIRS[v.dir];
    img = chr.img[sdir] || chr.img.south;
  }
  // Véhicule d'ÉPOQUE (ERA_VEH, PLAN-VIVANT) : sa propre toise, et la bête est DANS
  // le dessin. Tant que sa bande n'est pas décodée, la bande nue du type et son
  // attelage de code prennent le relais (une frame ou deux).
  const era = onSkin ? eraVehSpec(v.type, v.skin) : null;
  const size = era ? era.size : VEH_SIZES[v.type];
  const dh = Math.max(1, snapU(s * size * VEH_SCALE)), dw = dh;
  let fh = img.naturalHeight || img.height || 64;
  const fullImg = img, fullFh = fh;   // planche PLEINE, pour le portrait de la fiche
  // Bande -half pré-cuite (mêmes règles que les habitants : servie tant que la boîte
  // tient dans 70 % de la planche pleine — le petit zoom ne réduit plus ×0,3).
  // (Un véhicule d'époque est toujours servi par son skin : étiquettes justes.)
  if (era && dchr) {
    const half = dchr.imgHalf[VEH_DIAG_MAP.default[v.dir]];
    if (half && half.complete && half.naturalWidth > 0 && dh <= fh * 0.7) { img = half; fh = half.naturalHeight; }
  }
  const nf = Math.max(1, Math.round((img.naturalWidth || img.width || fh) / fh));
  // Point de tri de la frame suivante : contact MESURÉ, à la taille dessinée (cf. vehSortLift).
  const cf = vehContactF(img, fh);
  if (cf != null) v._sortH = (cf - 0.5) * T * size * VEH_SCALE;
  // Diagonales : frame par DISTANCE parcourue (odomètre v.rollDist — anti-
  // patinage, molette __vehStride en fraction de tuile/frame). Cardinales :
  // cadence temporelle legacy inchangée.
  const fr = nf <= 1 ? 0
    : usedDiag ? Math.floor((v.rollDist || 0) / (T * vehStride())) % nf
      : Math.floor((now || 0) / 130 + v.x * 0.1) % nf;
  // FICHE D'HABITANT (citizenFocus.js) : un véhicule de la flotte (`v.seed`, posé
  // à l'apparition — pas ceux de l'autoroute) publie sa silhouette à l'écran
  // (encre de sa frame) pour être cliquable ; désigné ou survolé, il pose son
  // anneau au sol AVANT tout le reste de sa petite scène (bêtes, pousseur).
  if (v.seed != null) {
    const ink = imgInkBox(img);
    const ox = snapU(p.x - dw / 2), oy = snapU(p.y - dh / 2);
    const vb = { x0: ox + ink.l * dw, y0: oy + ink.t * dh, x1: ox + ink.r * dw, y1: oy + ink.b * dh };
    noteVehicle(v, vb, { img: fullImg, sx: fr * fullFh, fh: fullFh });
    const vmark = focusMark(v);
    if (vmark) drawFocusRingAt(ctx, (vb.x0 + vb.x1) / 2, vb.y1 - (vb.y1 - vb.y0) * 0.22, (vb.x1 - vb.x0) * 1.15, vmark === 2);
  }
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const drawBody = () => {
    // ⛔ PAS D'ELLIPSE D'OMBRE SOUS UN VÉHICULE (Raph 2026-08-05) : la tache du
    // moteur faisait doublon. Depuis le 2026-09-30, le véhicule porte l'OMBRE DU
    // SOLEIL comme tout objet de la carte (une seule lumière, décision de Raph).
    // Pivot 'slope' (2026-10-03) : un sol incliné qui passe par les roues et les
    // sabots. L'ancien pivot unique (rangée la plus basse) faisait « voler » les
    // véhicules vus en biais, roues arrière comprises (retour Raph, chariot à bœuf).
    // Sonde G0 : le SKIN d'instance a sa propre planche (pack MinZinn) — c'est
    // `fh`, lu sur l'image servie, qui la porte, pas la table VEH_SIZES.
    if (pxProbe.on) recPx('vehicule · ' + v.type, fh, dh);
    const bx = snapU(p.x - dw / 2), by = snapU(p.y - dh / 2);
    drawSunShadow(ctx, img, bx, by, dw, dh, fr * fh, 0, fh, fh, 'slope');
    ctx.drawImage(img, fr * fh, 0, fh, fh, bx, by, dw, dh);
    // Sonde du tri (globalThis.__sortAudit, cf. isoRenderer) : la boîte réellement
    // dessinée, pour l'audit « un passant debout sur un chariot ».
    if (globalThis.__sortAudit && CM._vehBoxes) CM._vehBoxes.push({ v, img, sx: fr * fh, fh, bx, by, dw, dh });
  };
  // Attelage : bête(s) de trait DEVANT dans le sens de marche (monde → projeté).
  const pull = era && era.team ? null : VEH_PULL[v.type];
  let drawTeam = null, teamBelow = false;
  if (pull) {
    const D = (pull.dist || 0.44) * T * VEH_SCALE;
    const front = [[D, 0], [-D, 0], [0, D], [0, -D]][v.dir] || [0, 0];
    const ap = worldToScreen(wx + front[0], wy + front[1]);
    teamBelow = ap.y > p.y;
    drawTeam = () => {
      ctx.strokeStyle = 'rgba(38,26,15,0.72)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + (ap.x - p.x) * 0.82, p.y + (ap.y - p.y) * 0.82);
      ctx.stroke();
      // Bête en VUE DIAGONALE (retour Raph : cheval de profil ouest→est) si les
      // bandes sont livrées, sinon bande cardinale legacy.
      if (!drawDraftIso(ctx, ap.x, ap.y + dh * 0.24, z, pull.animal, v)) {
        drawNamedAgent(ctx, ap.x, ap.y + dh * 0.24, z, pull.animal, pull.scale || 0.72, v.dir, true, now, v.x * 0.12);
      }
    };
  }
  // Pousseur : humain de l'ère DERRIÈRE (charrette/brouette).
  let drawPusher = null, pusherBelow = false;
  if (VEH_PUSH[v.type]) {
    const D = 0.34 * T * VEH_SCALE;
    const back = [[-D, 0], [D, 0], [0, -D], [0, D]][v.dir] || [0, 0];
    const pp = worldToScreen(wx + back[0], wy + back[1]);
    pusherBelow = pp.y > p.y;
    drawPusher = () => {
      // Vue diagonale du pousseur (nouvelle DA) si dispo, sinon bande cardinale.
      if (!drawEraAgentIso(ctx, pp.x, pp.y + dh * 0.24, z, v.dir, true, now, v.x * 0.1, 0)) {
        drawEraAgent(ctx, pp.x, pp.y + dh * 0.24, z, v.dir, true, now, v.x * 0.1, 0);
      }
    };
  }
  // Ordre nord → sud (peintre local de la petite scène).
  if (drawTeam && !teamBelow) drawTeam();
  if (drawPusher && !pusherBelow) drawPusher();
  drawBody();
  if (drawTeam && teamBelow) drawTeam();
  if (drawPusher && pusherBelow) drawPusher();
  // Phares (voiture/tram, nuit, ère motorisée) : fonction PARTAGÉE re-projetée
  // (agents.js) — dessinés À LA PROFONDEUR du véhicule, dans son item peintre,
  // comme le legacy (sinon ils brilleraient par-dessus les murs).
  drawVehicleHeadlights(ctx, v);
  ctx.imageSmoothingEnabled = prev;
}

// ── Émeutier en ISO ──────────────────────────────────────────────────────────
// Même recette que le rendu legacy (sprite d'ère + arme bakée, halo de torche
// la nuit, repli silhouette vectorielle) mais positionné par worldToScreen et
// trié au PEINTRE — l'appelant pousse UN item 'riot' par émeutier, clé
// isoUnitDepth aux pieds, offsets de file compris. Vues encore CARDINALES :
// repli assumé du plan (« émeutiers : PLUS TARD ») tant que le batch des
// diagonales est en pause.
// Fondu (lot 4) : l'émeutier d'appoint qui s'efface à la fin de l'émeute (p._alpha).
export function drawIsoRioter(ctx, p, now, z) {
  const ra = p._alpha == null ? 1 : p._alpha;
  if (ra <= 0.02) return;
  if (ra >= 1) { drawIsoRioterInner(ctx, p, now, z); return; }
  const pa = ctx.globalAlpha;
  ctx.globalAlpha = pa * ra;
  try { drawIsoRioterInner(ctx, p, now, z); } finally { ctx.globalAlpha = pa; }
}
// Décalage de file LISSÉ (p.lx/p.ly, quaysAndRiot.js — lot 4) ; repli sur l'ancien
// décalage par direction, qui sautait d'un côté à l'autre à chaque virage.
export const rioterLane = (p) => ({
  x: p.lx != null ? p.lx : ((p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0),
  y: p.ly != null ? p.ly : ((p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0),
});
function drawIsoRioterInner(ctx, p, now, z) {
  const ln = rioterLane(p);
  const laneX = ln.x, laneY = ln.y;
  const sp = worldToScreen(p.x + laneX, p.y + laneY);
  const wob = Math.sin(now / 170 + (p.phase || 0)) * 0.8;
  const sx = sp.x, groundY = sp.y + wob * z;
  if (sx < -24 || groundY < -24 || sx > CM.cw + 24 || groundY > CM.ch + 24) return;
  const ph = Math.max(1.5, 2.1 * z);
  const walking = p.pauseT <= 0;
  // Ombre posée au SOL STABLE (sp.y, sans le wobble) : elle ne saute pas avec le
  // corps — seul le sprite bondit dessus (le duo qui bobbait ensemble « volait »).
  // De jour, l'OMBRE DU SOLEIL la remplace (portée par le sprite, cf. agents.js) :
  // l'ellipse ne tient l'émeutier au sol que la nuit, en fondu inverse.
  const nk = sunShadowNightK();
  if (nk > 0.01) {
    ctx.fillStyle = 'rgba(0,0,0,' + (0.22 * nk).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(sx, sp.y, ph * 0.85, ph * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  }
  const rEra = riotEraKey((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0);
  let rgen = ((p.charType || 0) === 1 ? 'woman' : 'man') + '-' + (p.weapon === 'fork' ? 'fork' : 'torch');
  // Ère à jeu INCOMPLET (deux émeutiers sur quatre) : la combinaison manquante prend
  // sa voisine de la même ère plutôt que le paysan médiéval de base.
  const rSwap = RIOT_ERA_SWAP[rEra];
  if (rSwap && rSwap[rgen]) rgen = rSwap[rgen];
  const torch = rgen.endsWith('torch');
  // BANDES DIAGONALES (DA « Figurine d'époque », batch riotIsoRoster) d'abord :
  // ère puis base médiévale ; repli CARDINAL legacy tant qu'une bande manque.
  // Anim par DISTANCE (p.walkDist, posé par updateCrisis) — anti-patinage.
  const wd = p.walkDist != null ? p.walkDist : null;
  // groundFeet=true : les PIEDS MESURÉS de la bande touchent groundY — l'ombre
  // (ci-dessus) est posée à ce même point ; sans ça, la marge transparente du
  // roster (~12 % du cadre) suspendait l'émeutier au-dessus de son ombre.
  // Ères REDESSINÉES dans la main des habitants (PLAN-VIVANT) : leur propre scale,
  // pour la même hauteur de personnage à l'écran (toutes les ères depuis le
  // 2026-10-03 ; 0,85 ne reste que pour une clé d'ère inconnue).
  const rScale = RIOT_FLAT_SCALE[rEra] || 0.85;
  let dim = drawNamedAgentIso(ctx, sx, groundY, z, 'rioter-' + rEra + rgen, rScale, p.dir, walking, now, p.phase, 1, wd, true)
    || (rEra ? drawNamedAgentIso(ctx, sx, groundY, z, 'rioter-' + rgen, RIOT_FLAT_SCALE[''] || 0.85, p.dir, walking, now, p.phase, 1, wd, true) : false);
  if (!dim) dim = drawNamedAgent(ctx, sx, groundY, z, 'rioter-' + rEra + rgen, 0.85, p.dir, walking, now, p.phase);
  if (!dim && rEra) dim = drawNamedAgent(ctx, sx, groundY, z, 'rioter-' + rgen, 0.85, p.dir, walking, now, p.phase);
  if (dim) {
    // Flamme bakée ; halo chaud additif de NUIT sur les torches (cf. legacy).
    if (torch && (CM.nightF || 0) > 0.05) {
      const flick = 0.8 + 0.2 * Math.sin(now / 90 + (p.phase || 0) * 5);
      const gx2 = sx + dim.drawW * 0.18, gy2 = dim.top + dim.drawH * 0.16, gr = Math.max(1, dim.drawW * 0.5 * flick);
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(gx2, gy2, 0, gx2, gy2, gr);
      g2.addColorStop(0, `rgba(255,120,40,${(0.2 * (CM.nightF || 0) * flick).toFixed(2)})`);
      g2.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(gx2, gy2, gr, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = prevOp;
    }
    return;
  }
  // Repli vectoriel (sprites pas encore décodés) : silhouette du legacy dont le
  // centre de corps est recalé pour poser les pieds sur groundY.
  const syB = groundY - ph * 1.35;
  if (ph > 2 && walking) {
    const step = Math.sin(now / 110 + (p.phase || 0) * 3) * ph * 0.45;
    ctx.strokeStyle = '#241a10';
    ctx.lineWidth = Math.max(1, ph * 0.28);
    ctx.beginPath(); ctx.moveTo(sx - ph * 0.12, syB + ph * 0.35); ctx.lineTo(sx - ph * 0.15 + step * 0.5, syB + ph * 1.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + ph * 0.12, syB + ph * 0.35); ctx.lineTo(sx + ph * 0.15 - step * 0.5, syB + ph * 1.3); ctx.stroke();
  }
  ctx.fillStyle = p.col || '#9a4d38';
  ctx.beginPath();
  ctx.moveTo(sx - ph * 0.62, syB - ph * 0.45);
  ctx.quadraticCurveTo(sx - ph * 0.5, syB + ph * 0.65, sx - ph * 0.3, syB + ph * 0.62);
  ctx.lineTo(sx + ph * 0.3, syB + ph * 0.62);
  ctx.quadraticCurveTo(sx + ph * 0.5, syB + ph * 0.65, sx + ph * 0.62, syB - ph * 0.45);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(sx - ph * 0.5, syB - ph * 0.45, ph, Math.max(0.5, ph * 0.2));
  ctx.fillStyle = p.skin || '#e0b890';
  ctx.beginPath(); ctx.arc(sx, syB - ph * 0.85, ph * 0.5, 0, Math.PI * 2); ctx.fill();
  if (ph > 1.8) drawRiotWeapon(ctx, sx + ph * 0.55, syB - ph * 0.2, ph, p.weapon, now, p.phase, 0.5 + 0.5 * Math.sin(now / 320));
}


// ── PROFONDEUR DES UNITÉS (habitants / véhicules / émeutiers) ────────────────
// Le tri scalaire wx+wy du peintre suffit entre objets PONCTUELS, mais face à
// une emprise multi-tuiles (clé au COIN SUD, sprite large de 0.78·(sx+sy))
// il AVALE les unités qui longent les faces sud/est : leur somme est plus
// petite que la clé du bâtiment alors qu'elles sont DEVANT son mur (retour
// Raph « pas de cohérence de profondeur », 2026-07-13). Transposition iso des
// fiches frontByPainter du legacy (Phase 2 du plan : « baseY → baseDepth »),
// même recette que la clé précalculée des lampadaires (computeIsoLamps) mais
// appliquée en DYNAMIQUE, aux pieds de chaque unité :
//   - unité au SUD de la base (wy ≥ y1) ou à l'EST du bord (wx ≥ x1), colonne
//     du rect sprite recouverte → clé REMONTÉE juste au-dessus de celle du
//     bâtiment (elle passe devant le mur au lieu d'être mangée) ;
//   - unité DERRIÈRE (nord-ouest, colonne recouverte) → remontée PLAFONNÉE
//     sous la clé de cet occulteur (jamais posée sur son toit — même arbitrage
//     que la passe 1 du peintre legacy : l'occulteur gagne).
// Fiches par cellule (Map partagée par emprise) reconstruites au recompute ;
// empreintes À PLAT (champs, triées au coin nord — jamais occultantes) et POINTS
// D'EAU exclus. Ces derniers restent dehors non par héritage de l'aqueduc mais
// parce qu'un puits est un PROP, pas un bâtiment : le calcul de fiche suppose une
// façade qui occulte, or aucun prop de place (banc, fontaine) n'y figure non plus.
// Molette : window.__isoUnitDepth(false) = retour au tri scalaire brut.
const isoUnitDepthFlag = { on: true };
if (typeof window !== 'undefined') window.__isoUnitDepth = (on) => { isoUnitDepthFlag.on = on !== false; return isoUnitDepthFlag.on; };

// ── SONDE Q9 / P23 (docs/PLAN-SUPPRESSION-LEGACY.md) ────────────────────────
// isoUnitDepth ne lit AUCUNE hauteur de bâtiment — les fiches ne portent que
// key/ax/halfW/x1/y1 — là où le legacy pesait `topY` : une hutte trop basse pour
// recouvrir la rue n'occultait pas (ysortPainter.test.js:56). Comme `cap` est un
// MINIMUM GLOBAL, on a soupçonné qu'un bâtiment bas puisse annuler un `lift`
// légitime, l'unité retombant sous la clé d'une façade qui, ELLE, la recouvre.
//
// ⚠ MESURÉ LE 2026-08-22 : LA HAUTEUR N'Y EST POUR RIEN — NE PAS REJOUER CE
// SOUPÇON. En jeu, 2 312 évaluations à l'ère 23 et 852 à l'ère 161, 557 et 183
// conflits lift+cap, `suppressed` = 0 partout. La hauteur d'un occulteur n'entre
// jamais dans le verdict, et son absence ne coûte rien au tri.
//
// ⚠⚠ EN REVANCHE un plafond PEUT écraser une remontée, pour une raison qui n'a
// rien à voir : quand le lifteur et le plafonneur ont EXACTEMENT LA MÊME CLÉ,
// lift = clé + T·0.02 et cap = clé − T·0.02 → le plafond gagne de 2·epsilon et
// l'unité bascule de « juste après les deux » à « juste avant les deux » : elle
// se fait avaler par le mur qu'elle longeait. C'est un départage d'ÉGALITÉ.
// Mesuré : 2 cas sur 19 557 géométries légales (0,01 %), tous à clé égale, tous
// d'exactement 2·epsilon, et 0 occurrence en jeu. Frontière figée par
// isoUnitDepth.test.js (« un plafond ne coûte qu'un départage d'égalité »).
//
// ⚠⚠ DEUX PIÈGES DE MESURE, chèrement payés. (1) Une force brute sur emprises
// doit REJETER LES CHEVAUCHEMENTS : sans ça, 382 faux positifs sur 400 000, et
// la géométrie testée n'est même pas la bonne (dans isoUnitFiches la seconde
// fiche écrase la première dans la Map). (2) Un tirage ALÉATOIRE à position
// continue RATE le vrai cas — 866 418 tirages, zéro trouvaille — parce que la
// remontée ne se déclenche qu'en longeant une face, bande étroite que le hasard
// visite peu. C'est une grille régulière calée près des faces qui l'a levé.
//
// CE QUE LA MESURE A TROUVÉ À LA PLACE : `cap` lève `hidden` pour 86-87 % des
// unités (2 eres mesurées, foule normale) et la passe FANTÔME redessine sans
// vérifier — voir son bloc plus bas. L'aveuglement à la hauteur ne casse donc
// pas le tri, il fait REDESSINER en transparence ~6 unités sur 7 à chaque frame.
// C'est un sujet de coût/rendu, pas de profondeur. Chantier distinct.
//
// La sonde reste : elle re-tranche en une frame si la géométrie des fiches change.
//   __depthProbe(true)  arme et remet à zéro     __depthProbe(false)  éteint
//   window.__depthProbeLast  porte le relevé
// Coût nul éteinte : un seul booléen de module lu par appel (même idiome que
// isoUnitDepthFlag juste au-dessus, et que __layoutProfile dans layout.js).
const depthProbe = { on: false, out: null };
function depthProbeReset() {
  depthProbe.out = {
    units: 0,        // appels comptés
    lift: 0,         // une remontée a été calculée
    cap: 0,          // un plafond existe (= `hidden` = passe fantôme)
    conflict: 0,     // les deux à la fois
    suppressed: 0,   // LE CAS P23 : le plafond a ÉCRASÉ la remontée
    ghostLifted: 0,  // remontée gagnante mais unité quand même marquée fantôme
    cappers: {},     // qui plafonne, dans les cas `suppressed` : id -> compte
    samples: [],     // 8 premiers cas `suppressed`, pour l'œil
  };
  if (typeof window !== 'undefined') window.__depthProbeLast = depthProbe.out;
  return depthProbe.out;
}
if (typeof window !== 'undefined') {
  window.__depthProbe = (on) => {
    depthProbe.on = on !== false;
    if (depthProbe.on) depthProbeReset();
    return depthProbe.on;
  };
}
let _unitFiches = null, _unitFichesAt = '';
function isoUnitFiches() {
  const L = CM.layout;
  if (!L) return null;
  // Mémo re-clée aussi sur la RÉVÉLATION per-achat : une maison-moteur masquée
  // n'est pas dessinée → elle ne doit ni remonter ni plafonner une unité.
  const memoKey = CM.layoutRecomputeAt + ':' + (CM.engineHomeReveal || 0);
  if (_unitFiches && _unitFichesAt === memoKey) return _unitFiches;
  const T = CM.TILE;
  const m = new Map();
  const fiche = (t, idf, fo) => {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const x1 = (t.gx + sx) * T, y1 = (t.gy + sy) * T;
    const fx = fo ? fo.ox * T : 0, fy = fo ? fo.oy * T : 0;
    const rec = {
      key: x1 + fx + y1 + fy,                        // clé peintre du bâtiment (coin sud, poussé compris)
      ax: x1 + fx - (y1 + fy),                       // écran-X du coin sud du sprite (px monde)
      halfW: (sx + sy) * T * 0.39 + T * 0.45,        // demi-rect sprite (0.78/2) + demi-unité
      x1, y1,
      id: idf, sx, sy,                               // identité : lue par la SONDE Q9 seulement
    };
    for (let ay = 0; ay < sy; ay += 1) for (let ax2 = 0; ax2 < sx; ax2 += 1) m.set((t.gx + ax2) * 10000 + (t.gy + ay), rec);
  };
  for (const t of L.tiles) {
    const idf = t.buildingId || t.variant || '';
    if (/field|farm|crop|orchard|aqueduct/i.test(idf)) continue;   // à plat (champs) / prop (point d'eau)
    if (cmEngineHomeHidden(t)) continue; // pas encore achetée
    // FRONT DE RUE : le peintre pousse le sprite vers sa rue (jusqu'à 0,19 case) et
    // trie le bâtiment À CETTE POSITION (isoLiveCollect). La fiche doit porter la
    // MÊME clé : avec la clé du coin nu, un passant « remonté » devant une façade
    // poussée au sud ou à l'est restait sous la clé réelle du bâtiment — dessiné
    // avant lui, donc avalé par le mur qu'il longe (audit du tri, 2026-10-02 :
    // jusqu'à 6 % des passants selon la bande, tous sur ce cas). Les seuils
    // devant/derrière restent ceux de l'emprise : le trottoir que le poussé
    // recouvre est DEVANT la façade.
    fiche(t, idf, isoFrontOffset(t, L.roadMap));
  }
  // REPÈRES CIVIQUES (isoDistricts) : des pseudo-tiles hors de L.tiles, que le
  // peintre dessine pourtant comme des scènes moteur de plusieurs cases. Sans fiche,
  // un passant qui longeait leur face sud passait sous le mur (audit 2026-10-02,
  // observatoires de la bande 8). Pas de poussé de front : le peintre n'en met pas.
  const dMass = districtMassTiles(L);
  if (dMass) for (const t of dMass) fiche(t, t.buildingId || '', null);
  _unitFiches = m; _unitFichesAt = memoKey;
  return m;
}
// Clé peintre d'une unité au sol dont les PIEDS (contact sol visuel) sont en (wx, wy).
// isoUnitDepthEx renvoie AUSSI `hidden` : vrai quand un occulteur franc au sud plafonne
// l'unité (elle sera dessinée AVANT lui, donc recouverte par son sprite s'il est assez
// haut) — c'est le signal de la passe SILHOUETTE FANTÔME. Objet de sortie PARTAGÉ
// (zéro alloc, ~600 appels/frame) : à consommer immédiatement, ne pas retenir.
// `wide` (px monde d'écran, défaut 0) : demi-largeur de l'unité elle-même, ajoutée au
// test de recouvrement de colonne. Un passant est un point ; un VÉHICULE est large
// (jusqu'à 2,4 tuiles) : testé sur la seule colonne de son centre, il n'était pas
// remonté devant un bâtiment que son flanc recouvrait, alors que le passant juste
// derrière lui l'était — et se dessinait par-dessus la caisse (audit du 2026-10-03,
// un passant à 30 px derrière l'omnibus).
// `ex`, `ey` (px monde, défaut 0) : demi-ÉTENDUE au sol de l'unité le long de X et de
// Y — sa caisse, pour un véhicule, le long de son axe de marche. « Devant » se juge
// alors sur TOUTE la caisse : elle doit être entière au sud de la façade sud, ou
// entière à l'est de la façade est. Sur le seul point de tri, un fiacre qui roulait
// dans la rue DERRIÈRE une rangée, son point juste passé le bord est d'une maison,
// était jugé à l'est de celle-ci — donc devant — et peint sur son toit (Raph
// 2026-10-04, capture ; mesuré : 7 véhicules sur 80 à un instant, âge 5). Le gros de
// sa caisse est au nord, derrière : c'est le plafond qui doit gagner. Un passant est
// un point (0, 0) : verdict inchangé.
const _depthOut = { d: 0, hidden: false };
export function isoUnitDepthEx(wx, wy, wide = 0, ex = 0, ey = 0) {
  const d = wx + wy;
  _depthOut.d = d; _depthOut.hidden = false;
  if (!isoUnitDepthFlag.on) return _depthOut;
  const F = isoUnitFiches();
  if (!F) return _depthOut;
  const T = CM.TILE, gx = Math.floor(wx / T), gy = Math.floor(wy / T);
  const sxScr = wx - wy;                             // colonne écran (px monde)
  let lift = d, cap = Infinity, capB = null;
  // Voisinage cy−1..cy+2 (comme frontByPainter) : la rangée +2 porte les
  // occulteurs francs du sud dont la clé doit PLAFONNER la remontée. Une fiche
  // partagée revue par plusieurs cellules est re-testée telle quelle (max/min
  // idempotents — pas de dédup, 12 lectures par unité restent négligeables).
  for (let cy = gy - 1; cy <= gy + 2; cy += 1) {
    for (let cx = gx - 1; cx <= gx + 1; cx += 1) {
      const b = F.get(cx * 10000 + cy);
      if (!b) continue;
      if (Math.abs(sxScr - b.ax) > b.halfW + wide) continue;   // pas de recouvrement de colonne
      if (d >= b.key) continue;                      // déjà dessinée après lui
      if (wy - ey >= b.y1 - T * 0.02 || wx - ex >= b.x1 - T * 0.02) {
        if (b.key + T * 0.02 > lift) lift = b.key + T * 0.02;   // devant : passe au-dessus du mur
      } else if (b.key - T * 0.02 < cap) {
        cap = b.key - T * 0.02;                      // derrière : jamais par-dessus son toit
        if (depthProbe.on) capB = b;                 // sonde Q9 : qui plafonne
      }
    }
  }
  const out = lift < cap ? lift : cap;
  _depthOut.d = out > d ? out : d;
  _depthOut.hidden = cap < Infinity;
  if (depthProbe.on) {
    const P = depthProbe.out, hasLift = lift > d, hasCap = cap < Infinity;
    P.units += 1;
    if (hasLift) P.lift += 1;
    if (hasCap) P.cap += 1;
    if (hasLift && hasCap) {
      P.conflict += 1;
      if (cap < lift) {
        P.suppressed += 1;
        const id = (capB && capB.id) || '?';
        P.cappers[id] = (P.cappers[id] || 0) + 1;
        if (P.samples.length < 8) {
          P.samples.push({
            id, span: capB ? capB.sx + 'x' + capB.sy : '?',
            gx: Math.round(wx / T * 10) / 10, gy: Math.round(wy / T * 10) / 10,
            perte: Math.round((lift - cap) / T * 100) / 100,   // en tuiles de clé peintre
          });
        }
      } else P.ghostLifted += 1;
    }
  }
  return _depthOut;
}
export function isoUnitDepth(wx, wy) {
  return isoUnitDepthEx(wx, wy).d;
}

// Dessin d'UN habitant du tri peintre (partagé entre la passe normale et la passe
// silhouette fantôme — même rendu, seul globalAlpha diffère).
export function drawIsoCitizenItem(ctx, p, now, z) {
  const sp = worldToScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
  const walking = (p.pauseT || 0) <= 0;
  // FONDUS (docs/PLAN-COMPORTEMENTS.md, lot 1) : naître devant une porte, rentrer par
  // une porte. `fade` (apparition) et `_sleepFade` (rentrée du soir, départ) étaient
  // calculés par agents.js depuis juillet mais jamais APPLIQUÉS au dessin : le passant
  // surgissait d'un coup et disparaissait d'un coup. L'ombre du soleil suit (elle
  // multiplie l'alpha courant).
  const fa = (p.fade == null ? 1 : p.fade) * (p._sleepFade == null ? 1 : p._sleepFade);
  if (fa <= 0.02) return;
  const prevA = ctx.globalAlpha;
  if (fa < 1) ctx.globalAlpha = prevA * fa;
  // Fiche d'habitant (citizenFocus.js) : un personnage de SCÈNE (promeneur du
  // quai…) se signale pour être cliquable ; désigné ou survolé, l'anneau au sol
  // se pose SOUS ses pieds.
  if (p.scene) noteFigure(p);
  const mark = focusMark(p);
  if (mark) drawCitizenFocusRing(ctx, p, sp.x, sp.y, mark === 2);
  // Vue DIAGONALE (Phase 4) si la bande existe, sinon bande cardinale.
  // p.walkDist = odomètre → animation par DISTANCE (anti-patinage).
  if (!drawEraAgentIso(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0, 1, p.walkDist != null ? p.walkDist : null, p.skinVariant || 0, citizenPose(p))) {
    drawEraAgent(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0);
  }
  carryLight(ctx, p, sp, z, now, fa);
  ctx.globalAlpha = prevA;
}

// UNE LUMIÈRE À LA MAIN (docs/PLAN-COMPORTEMENTS.md, lot 4) : la nuit, aux ères
// d'avant l'éclairage public (bandes 0-5), une partie des passants (et tous les
// couche-tard en promenade) porte une TORCHE (préhistoire) ou une LANTERNE. La
// lueur passe par la file des feux (flameGlow.js) : posée au tri du peintre, masquée
// par ce qui passe devant, chaude par-dessus le voile de nuit. Pas d'enfant
// porte-lumière. Molette : __carryLight({ on, share }).
export const CARRY_LIGHT = { on: true, share: 0.55 };
if (typeof window !== 'undefined') window.__carryLight = (o) => { if (o) Object.assign(CARRY_LIGHT, o); return { ...CARRY_LIGHT }; };
function carryLight(ctx, p, sp, z, now, fa) {
  const nf = CM.nightF || 0;
  if (!CARRY_LIGHT.on || nf < 0.35 || (p.charType || 0) === 2) return;
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0;
  if (band > 5) return;
  const ph = p.phase || 0;
  if (p.goalKind !== 'night' && ((((ph * 911.7) % 1) + 1) % 1) >= CARRY_LIGHT.share) return;
  const Hf = CM.TILE * z * 0.85 * AGENT_SCALE;          // hauteur d'un adulte à l'écran
  const side = (p.dir === 0 || p.dir === 2) ? 1 : -1;   // la main côté où il regarde
  const u = Math.max(1, Math.round(Hf / 14));
  // La main, bras tendu le long du corps (à hauteur de hanche) ; la torche se lève.
  const hx = Math.round(sp.x + side * Hf * 0.24), hy = Math.round(sp.y - Hf * (band <= 1 ? 0.42 : 0.34));
  const k = Math.min(1, (nf - 0.35) / 0.25) * (fa == null ? 1 : fa);
  const pa = ctx.globalAlpha;
  ctx.globalAlpha = pa * Math.min(1, k * 1.5);
  const torch = band <= 1;
  if (torch) {
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(hx, hy - u * 2, u, u * 3);       // le manche
    ctx.fillStyle = FIRE_INK.body; ctx.fillRect(hx - u, hy - u * 4, u * 2, u * 2);
    ctx.fillStyle = FIRE_INK.core; ctx.fillRect(hx, hy - u * 4, u, u);
  } else {
    // Lanterne pendue à la main : anse, chapeau, verre ambré sur deux rangs, pied.
    // Le verre est clair : le voile de nuit l'assombrit, la lueur (après le voile)
    // le rallume.
    ctx.fillStyle = '#2e2216';
    ctx.fillRect(hx, hy, u, u);                                               // l'anse
    ctx.fillRect(hx - u, hy + u, u * 3, u);                                   // le chapeau
    ctx.fillRect(hx - u, hy + u * 4, u * 3, u);                               // le pied
    ctx.fillStyle = '#ffb64a'; ctx.fillRect(hx - u, hy + u * 2, u * 3, u * 2);  // le verre
    ctx.fillStyle = '#fff1b8'; ctx.fillRect(hx, hy + u * 2, u, u * 2);          // la flamme
  }
  ctx.globalAlpha = pa;
  queueFlameGlow(hx + u * 0.5, torch ? hy - u * 3 : hy + u * 3, Hf * (torch ? 0.8 : 0.55),
    torch ? FLAME_COL : '255,196,110', now, ph * 3, (torch ? 0.9 : 0.75) * k);
}

// Silhouettes fantômes : réglage live. __ghost({ on: true }) rallume, __ghost({ alpha: 0.5 })
// renforce. L'alpha par défaut est volontairement discret — on devine, on ne lit pas.
// ⚠ `cover`/`wK`/`hK` posés le 2026-08-23 avec le test de couverture exact (Q11).
// `cover` = fraction de la silhouette qu'une façade doit recouvrir pour qu'on
// redessine ; `wK`/`hK` = la silhouette elle-même, en fractions de tuile (elle suit
// l'échelle des habitants, cf. sceneHumanH).
//
// ALPHA : 0,34 → 0,58 → **0,70**, choix de Raph le 2026-08-23. Le réglage discret
// d'origine compensait le fait que la plupart des fantômes se posaient sur des unités
// que rien ne cachait ; une fois le marquage exact, ils peuvent se lire. À 0,70 la
// silhouette se voit franchement à travers la façade — c'est passé de « on devine »
// à « on voit », et c'est assumé.
// ⚠ Contrepartie signalée avant le choix : plus l'alpha monte, plus les faux positifs
// du test de couverture se voient. Ils viennent de ce que la boîte d'encre est un
// RECTANGLE autour d'une silhouette isométrique (coins vides) — cf. le § du test dans
// isoLivePaint. Si un jour ça se remarque en jeu, c'est ce test-là qu'il faut affiner,
// pas l'alpha qu'il faut redescendre.
//
// ⛔ ÉTEINT LE 2026-10-01, demande de Raph : « enlever l'effet fantôme des habitants,
// émeutiers et véhicules quand ils passent derrière un bâtiment ». L'audit du vivant
// (docs/PLAN-VIVANT.md §2, constat 6) l'avait montré : dans les villes de tours
// (bandes 6 à 9), des dizaines de silhouettes semblaient escalader les façades. Une
// unité cachée est désormais simplement cachée. Le code reste, rallumable pour
// comparer : __ghost({ on: true }).
// Scale des émeutiers redessinés en aplats, par préfixe d'ère (riotEraKey). L'arme
// levée agrandit la toile de l'animation (44 à 48 px selon la direction) : les bandes
// sont ramenées à 48 px pieds alignés (scripts/padStrip.mjs), personnage ~30 px →
// 0,98 × 0,64 ≈ 0,70 × 0,90 des habitants — même hauteur, même taille de pixel.
// Depuis le 2026-10-03, TOUTES les ères sont redessinées (la clé vide = le médiéval,
// qui sert aussi de repli) : plus aucune figurine de juillet n'est servie.
const RIOT_FLAT_SCALE = { 'stone-': 0.98, '': 0.98, 'anti-': 0.98, 'ind-': 0.98, 'mod-': 0.98, 'fut-': 0.98 };
// Jeux d'émeutiers incomplets : combinaison manquante → combinaison dessinée.
const RIOT_ERA_SWAP = { 'mod-': { 'man-fork': 'man-torch', 'woman-torch': 'woman-fork' } };

export const GHOST_TUNE = { on: false, alpha: 0.7, cover: 0.35, wK: 0.34, hK: 0.68 };
if (typeof window !== 'undefined') {
  window.__ghost = (o) => { if (o) Object.assign(GHOST_TUNE, o); return { ...GHOST_TUNE }; };
}

