// LE PARVIS DES MERVEILLES, comme ENSEMBLE DE CELLULES.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Deux consommateurs le lisent : le
// sol, qui y pose un dallage dédié, et la forêt sauvage, qui refuse d'y planter des
// arbres. Le second devait donc importer depuis le premier — un cycle. Ce module
// coupe la question : il ne dépend que du layout.
//
// ⚠ LE PEINTRE EST RENTRÉ le 2026-08-23. Cet en-tête disait « ce n'est PAS le peintre
// du parvis, resté dans isoRenderer avec la machinerie de tuiles dont il dépend » — la
// machinerie est partie dans isoGroundTiles entre-temps, et le peintre n'avait plus de
// raison de vivre loin de sa config. Ce module porte donc maintenant les trois : la
// config, l'ensemble effectif des cellules, et le DALLAGE qui s'y pose.
import { CM, CM_WONDERS, cmWonderSlot, cmForEachWonderCell } from '../layout.js';
import { rgb } from './isoPalette.js';   // le dallage compose ses tons

export const WONDER_GROUND = { on: true, tone: [227, 206, 176], pave: 4, joint: 0, rim: 1.10, tileAlpha: 1 };

// Ensemble effectif des cellules-parvis : celui du layout, PLUS l'emprise de la
// merveille en APERÇU (__showWonder force le rendu sans recalcul du plan — le
// parvis suit pour que l'aperçu soit fidèle). Mémoïsé par (layout, id d'aperçu).
export function wonderGroundSet(L) {
  const pv = CM.previewWonder;
  if (!pv) return L.wonderGround || null;
  // Le RANG entre dans la clé de mémoïsation : __showWonder(id, rang) change
  // l'emprise sans recalculer le plan, et le cache renvoyait l'ancienne taille.
  const sig = (CM.layoutRecomputeAt || 0) + ':' + pv.id + ':' + pv.tier;
  const cache = CM._pvWonderGround;
  if (cache && cache.sig === sig) return cache.set;
  const set = new Set(L.wonderGround || []);
  const wi = CM_WONDERS.findIndex((w) => w.id === pv.id);
  if (wi >= 0 && pv.id !== 'era_mega' && L.gridN) {
    const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
    cmForEachWonderCell(slot, pv.id, L.gridN, (gx, gy, k) => set.add(k), pv.tier);
  }
  CM._pvWonderGround = { sig, set };
  return set;
}
if (typeof window !== 'undefined') {
  window.__wonderGround = (arg) => {
    if (arg === false) WONDER_GROUND.on = false;
    else if (arg && typeof arg === 'object') { WONDER_GROUND.on = true; Object.assign(WONDER_GROUND, arg); }
    else WONDER_GROUND.on = true;
    CM._isoGroundBake = null;
    return { ...WONDER_GROUND };
  };
}

// ── PARVIS DES MERVEILLES : sol dédié de l'emprise (L.wonderGround) ───────────
// Demande Raph 2026-07-13 : la grande zone réservée d'une merveille (dès le
// rang I) doit se LIRE comme une PLACE, pas comme du sol urbain ordinaire — et
// le monument trône en son CENTRE (emprise carrée, cf. cmWonderExtent).
// Base = TUILE `iso-wonder` (MOSAÏQUE ocre et blanche, 4 variantes égalisées)
// posée à plat sur l'aplat de repli. Sur tout le POURTOUR, marche d'ombre +
// MARGELLE claire (arêtes dont le voisin n'est pas du parvis).
// Réglage live : __wonderGround({ tone, pave, joint, rim, tileAlpha }) / (false).
//
// ⚠ TROIS MOTIFS AU PAS DE LA CELLULE RETIRÉS le 2026-07-24 (retour Raph :
// « l'effet carré des plaques au sol »). Le parvis cumulait un damier ±5 % par
// cellule, un joint le long de deux arêtes de CHAQUE losange, et la tuile
// iso-plaza (quatre grandes dalles dessinées) reblittée par cellule avec un
// miroir un coup sur deux. Trois périodes égales à celle de la grille : l'œil
// ne lisait pas un dallage mais des plaques, parce qu'une cellule vaut un LOT
// DE MAISON et qu'un pavé de cette taille n'existe pas.
//
// LA TUILE EST RALLUMÉE le 2026-07-28 (tileAlpha 0 → 1, Raph : « je veux une
// génération pixel lab »), et le grief ci-dessus est traité, pas contourné :
//   • ce n'étaient pas LES tuiles qui plaquaient, c'était CELLE-LÀ — iso-plaza
//     dessinait quatre grandes dalles avec leur liseré, un objet de la taille
//     d'une cellule, donc une période égale à la grille ;
//   • la mosaïque est une texture de TESSELLES (période ~1/16 de cellule) ;
//   • ses 4 variantes sont ÉGALISÉES par canal au fetch (écart de luminance
//     ramené de 8,9 à 0,0) : ce qui change d'une cellule à l'autre est le
//     dessin seul, jamais la valeur — la règle du fichier, à la lettre ;
//   • et ce qui reste de période cellulaire se lit comme un PANNEAU de mosaïque,
//     ce dont un sol d'apparat antique est fait. Vérifié au pan 7×7 avant de
//     câbler (scripts/tilePan.mjs) : c'est LE test du parvis, seul sol du jeu à
//     couvrir un carré plein. Les trois autres matières du lot y ont échoué —
//     le détail des quatre verdicts est dans scripts/fetchGroundTiles.mjs.
//
// `pave`/`joint` : le DALLAGE PROCÉDURAL (drawWonderPaving) est coupé par défaut
// depuis que l'art porte ses propres joints — deux appareillages superposés
// faisaient une trame double. Le tracé reste, `joint` le rallume.
// DALLAGE : joints d'un appareillage posé dans le repère MONDE, au pas TILE/pave,
// À JOINTS DÉCALÉS (une rangée sur deux glisse d'une demi-dalle). Le décalage est
// ce qui compte : sans lui les joints de bout se réalignent en maille croisée et
// on retombe sur un quadrillage, juste plus fin.
//
// Tout tient DANS le losange de la cellule (les indices de dalle sont absolus,
// `pave` divise la cellule) : pas de clip, coût borné à pave + pave² segments par
// cellule, et le motif ne glisse pas d'un pan à l'autre. Les rangs `dk` et les
// joints `dj` s'arrêtent à div-1 : l'arête SO et l'arête SE appartiennent à la
// cellule suivante, qui trace les siens — chaque joint interne est tracé une fois
// et les lignes se raboutent d'une cellule à l'autre.
export function drawWonderPaving(ctx, gx, gy, px, py, hw, hh) {
  const div = WONDER_GROUND.pave | 0;
  if (div < 1 || !(WONDER_GROUND.joint > 0)) return;
  // Trop loin : sous ~5 px la dalle, la trame vire au gris sale — on rend
  // l'aplat nu, comme le bake allégé rend le sol sans ses détails fins.
  if ((hw * 2) / div < 5) return;
  const ex = hw / div, ey = hh / div;        // pas d'UNE dalle en x monde, projeté
  const sx = (dj, dk) => px + (dj - dk) * ex;
  const sy = (dj, dk) => py + (dj + dk) * ey;
  ctx.beginPath();
  for (let dk = 0; dk < div; dk += 1) {
    // RANG : joint long, continu d'une cellule à la suivante.
    ctx.moveTo(sx(0, dk), sy(0, dk));
    ctx.lineTo(sx(div, dk), sy(div, dk));
    // JOINTS DE BOUT du rang, décalés d'une demi-dalle un rang sur deux. L'indice
    // ABSOLU du rang décide (gy * div + dk), sinon le décalage se remettrait à
    // zéro à chaque cellule et redessinerait la grille qu'on retire.
    const off = ((gy * div + dk) & 1) ? 0.5 : 0;
    for (let dj = 0; dj < div; dj += 1) {
      const a = dj + off;
      ctx.moveTo(sx(a, dk), sy(a, dk));
      ctx.lineTo(sx(a, dk + 1), sy(a, dk + 1));
    }
  }
  ctx.strokeStyle = rgb(WONDER_GROUND.tone, 1 - WONDER_GROUND.joint);
  ctx.lineWidth = Math.max(1, Math.round((hw * 2) / div * 0.045));
  ctx.stroke();
}
export function drawWonderGroundDetail(ctx, gx, gy, px, py, hw, hh, wg) {
  const shade = (f) => rgb(WONDER_GROUND.tone, f);
  const N = [px, py], E = [px + hw, py + hh], S = [px, py + hh * 2], W = [px - hw, py + hh];
  const seg = (a, b, style, lw) => { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  // Pourtour : marche d'ombre (nu extérieur) + margelle claire en retrait. Traits
  // RENTRÉS vers le centre pour survivre au liseré anti-couture des cellules
  // voisines (dessinées après : elles recouvrent l'arête partagée).
  const cx = px, cy = py + hh;
  const inset = (p, k) => [p[0] + (cx - p[0]) * k, p[1] + (cy - p[1]) * k];
  const edges = [
    [gx, gy - 1, N, E], [gx + 1, gy, E, S],   // NE / SE écran
    [gx, gy + 1, S, W], [gx - 1, gy, W, N],   // SO / NO écran
  ];
  for (const [nx, ny, a, b] of edges) {
    if (wg.has(nx + ',' + ny)) continue;
    seg(inset(a, 0.05), inset(b, 0.05), 'rgba(34,30,20,0.25)', Math.max(1, hw * 0.05));
    seg(inset(a, 0.16), inset(b, 0.16), shade(WONDER_GROUND.rim), Math.max(1, hw * 0.09));
  }
}
