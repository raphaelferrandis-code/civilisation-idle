"use strict";
// ── CHANTIER ISO — Phase 1 : LA fonction de projection unique ────────────────
// Décisions verrouillées (Raphaël, 2026-07-10, cf REPRISE-chantier-iso.md) :
// losange 2:1 classique, caméra fixe (pas de rotation), grille/logique/save
// INTACTES — seule la projection monde→écran change.
//
// Règle d'or du chantier : PLUS PERSONNE ne projette à la main. Tout passage
// monde↔écran passe par worldToScreen/screenToWorld ci-dessous, qui répliquent
// exactement l'ancien mapping quand CM.iso est éteint (identité translatée) :
// flag off ⇒ zéro changement de comportement, au bit près.
//
// Géométrie (mode iso), en px monde autour de la caméra (dx=wx−cam.x, dy=wy−cam.y) :
//   sx = (dx − dy) · ISO_X · zoom + cw/2        ISO_X = 1
//   sy = (dx + dy) · ISO_Y · zoom + ch/2        ISO_Y = 0.5
// Une tuile de TILE px monde devient un LOSANGE de 2·TILE de large × TILE de haut
// (TILE=32 → 64×32, le standard). La projection est LINÉAIRE : un pan caméra reste
// une pure translation écran → les bakes offscreen restent valides (offset projeté).
//
// Profondeur du peintre (Phase 2) : depthOf = wx + wy (diagonales SE), remplace wy.
import { CM, cmWonderSlot, cmWonderExtent, cmWonderHeightTiles, CM_WONDERS } from '../layout.js';

export const ISO_X = 1;
export const ISO_Y = 0.5;

// LE LOSANGE EST LA SEULE PROJECTION. Le drapeau `isoFlag` / `CM.iso` et sa molette
// `window.__iso` vivaient ici : ils choisissaient entre ce module et l'ancienne
// projection planaire du rendu top-down. Ce dernier a été retiré aux étapes 4 à 6 ;
// le drapeau est parti à l'étape 7, le 2026-08-23. Plus rien à basculer.
//
// ⚠ Ordre respecté à la lettre : `CM.iso` absent vaut `undefined` vaut `false` —
// supprimer cette définition AVANT son dernier lecteur aurait rallumé toutes les
// branches legacy en silence, sans une seule erreur. Condition de passage tenue
// (P22) : plus aucun `CM.iso` ni `isoFlag` dans `src/`, hors commentaires.
// ⚠⚠ La condition NAÏVE du plan — chercher `CM.iso` seul — était insuffisante :
// `pixelHouses.js` lisait `isoFlag` directement, et trois lecteurs apparus après
// la rédaction (isoBridge ×2, isoRenderer ×1) n'y figuraient pas non plus.

// Nettoyage ponctuel : la clé de persistance du choix de pipeline ne veut plus rien
// dire. La laisser traînerait un « 0 » inerte chez qui avait fait `__iso(false)`.
try {
  if (typeof localStorage !== "undefined") localStorage.removeItem("cmIsoMode");
} catch { /* stockage indisponible : rien à nettoyer */ }

// ── S11 — QUANTIFICATION DU ZOOM (docs/PLAN-RENDU-VILLE.md) ─────────────────
// Le pas de grille du sol vaut hw = TILE·z·ISO_X et hh = TILE·z·ISO_Y, soit 32z et
// 16z px écran. À zoom CONTINU ces deux pas sont fractionnaires : deux losanges
// voisins, chacun arrondi à l'entier écran, laissent un liseré transparent entre
// eux. C'est la seule raison d'être du « +1 px anti-couture » de blitIsoTileKey —
// qui duplique en échange une colonne ET une rangée d'art sur CHAQUE cellule
// (source 64×32 → destination 65×33 à z = 1, mesuré).
//
// Contraindre z à un multiple de 1/8 rend 32z et 16z ENTIERS : les losanges se
// joignent exactement, et le +1 n'a plus d'objet. C'est donc le PRÉREQUIS du lot
// S7, pas un réglage de confort.
//
// ⚠ CE N'EST PAS le « taille-selon-le-zoom » écarté par Raph le 2026-08-03 :
// aucune taille relative ne change, aucun sprite ne se redimensionne selon le
// zoom, la toise habitants/bâtiments reste intacte. On limite seulement les
// VALEURS que la variable zoom peut prendre.
//
// `dir` = le sens du geste, et il est INDISPENSABLE : un pas multiplicatif de
// 1,12 depuis 0,375 rend 0,42, dont le cran le plus PROCHE est 0,375 — arrondir
// au plus proche rendrait la molette morte en bas de plage. On arrondit donc dans
// le sens du mouvement (ceil en zoomant, floor en dézoomant), ce qui garantit un
// cran par cran de molette. `dir = 0` (recentrage, pincement) = au plus proche,
// le geste y étant absolu et non incrémental.
//
// Molette : `__zoomQuant(0)` rend le zoom continu (l'A/B qui montre les coutures),
// `__zoomQuant(4)` élargit les crans, `__zoomQuant(16)` les resserre.
export const ZOOM_QUANT = { on: true, per: 8 };
export function snapZoom(z, dir = 0) {
  const q = ZOOM_QUANT.on ? (ZOOM_QUANT.per | 0) : 0;
  if (!(q > 0) || !Number.isFinite(z)) return z;
  const v = z * q;
  // L'epsilon évite qu'une valeur DÉJÀ sur un cran ne soit poussée au cran
  // suivant par le ceil (flottants) : sans lui, un zoom posé dériverait tout seul.
  const n = dir > 0 ? Math.ceil(v - 1e-6) : dir < 0 ? Math.floor(v + 1e-6) : Math.round(v);
  return Math.max(1, n) / q;
}
if (typeof window !== "undefined") {
  window.__zoomQuant = (per) => {
    if (per === false || per === 0) ZOOM_QUANT.on = false;
    else { ZOOM_QUANT.on = true; if (typeof per === "number" && per > 0) ZOOM_QUANT.per = per | 0; }
    // Le pas de grille change → les bakes du sol sont périmés.
    CM._isoGroundBake = null; CM._tileBake = null; CM._quayBake = null;
    return { ...ZOOM_QUANT };
  };
}

// Monde → écran. Renvoie {x, y} en px écran.
export function worldToScreen(wx, wy) {
  const z = CM.cam.zoom;
  const dx = wx - CM.cam.x, dy = wy - CM.cam.y;
  return {
    x: (dx - dy) * ISO_X * z + CM.cw / 2,
    y: (dx + dy) * ISO_Y * z + CM.ch / 2,
  };
}

// Écran → monde (inverse exact de worldToScreen).
export function screenToWorld(sx, sy) {
  const z = CM.cam.zoom;
  const ax = (sx - CM.cw / 2) / z, ay = (sy - CM.ch / 2) / z;
  // ax = dx − dy ; ay/ISO_Y = dx + dy
  const b = ay / ISO_Y;
  return { x: (b + ax) / 2 + CM.cam.x, y: (b - ax) / 2 + CM.cam.y };
}

// Delta caméra (monde) → delta écran. Sert aux bakes offscreen (pan = translation).
export function panDeltaToScreen(dwx, dwy) {
  const z = CM.cam.zoom;
  return { x: (dwx - dwy) * ISO_X * z, y: (dwx + dwy) * ISO_Y * z };
}

// Delta écran → delta caméra (monde) : inverse de panDeltaToScreen. Sert au drag-pan
// (la souris tire la carte en px écran, la caméra vit en px monde).
export function screenDeltaToPan(dsx, dsy) {
  const z = CM.cam.zoom;
  const ax = dsx / (ISO_X * z), b = dsy / (ISO_Y * z);
  return { x: (b + ax) / 2, y: (b - ax) / 2 };
}

// Profondeur du peintre : plus grand = plus « devant » (dessiné après).
export function depthOf(wx, wy) {
  return wx + wy;
}

// SOURCE UNIQUE de l'ancre écran d'une merveille. Le sprite reste debout
// (front-view), seul ce point change de projection. Le rendu (drawWonder) ET le
// survol (cityMapHitTest) doivent lire cette fonction : la formule était
// dupliquée, et la copie du hit-test projetait encore à la main façon legacy —
// donc en iso la zone survolable ne tombait plus sur la merveille dessinée.
// Cf. la règle d'or en tête de ce fichier.
//
// LEGACY : centre-BAS de la tuile du slot, à l'identique (flag off ⇒ zéro
// changement, au bit près).
//
// ISO : le monument DESCEND d'une demi-hauteur de sprite (Raph 2026-07-28,
// « centre bien les merveilles »). Un sprite front-view est un PANNEAU DEBOUT :
// sa masse monte tout entière AU-DESSUS de son point d'appui. Posé au centre de
// son parvis — ce qu'était le centre-bas de la tuile du slot, à un demi-losange
// près — le monument occupait la moitié NORD de sa place et laissait l'autre
// moitié vide devant lui. C'est la boîte du SPRITE qu'on veut centrée, pas son
// point d'appui.
//
// Décalage = (k, k) tuiles depuis le centre du slot. En (u−v) il s'annule (le
// monument reste sur l'axe vertical de son losange — plus de biais vers la
// gauche), et en (u+v) il vaut 2k, soit k·(2·hh) = k·hw px vers le BAS. Poser
// k = hauteur/2 en tuiles descend donc la base d'exactement une demi-hauteur de
// sprite : la boîte se retrouve à cheval sur le centre du parvis, à tous les
// zooms (les deux termes sont en tuiles) et à tous les rangs.
//
// ⚠ PREMIER JET : k = coreR + ½, le coin sud du socle. Juste pour un monument
// HAUT (la Couronne rang V tombait à 0,3 tuile près) mais faux pour un monument
// BAS : au rang I le sprite ne fait que 2,6 tuiles de haut et descendait de 2,5
// — il se retrouvait planté au bord sud de son parvis, tout le dallage derrière
// lui. Ce n'est pas l'emprise au sol qui commande, c'est la hauteur.
// Garde-fou : k borné à R−½ pour que la base ne sorte jamais du parvis (aucun
// rang connu ne l'atteint — le plus haut, l'Aiguille, est exclue).
//
// era_mega est EXCLUE : l'Aiguille est plantée dans le fleuve, sans parvis ni
// socle au sol (cf. wonderGround) ; la glisser vers le sud la ferait dériver le
// long de l'eau et vers la travée du pont, pour corriger un cadrage qui ne se
// pose pas — elle n'a pas de place autour d'elle.
// Point d'appui en px MONDE — la seule chose qui bouge ; wonderAnchor n'est que
// sa projection. Le TRI DU PEINTRE doit lire ce point-là et pas un autre : il
// décide qui passe devant le monument, et une profondeur calculée sur un point
// différent de celui où le sprite se pose fait disparaître derrière lui les
// badauds qui sont visiblement DEVANT (l'anneau d'attroupement est au sud du
// socle, exactement dans l'écart).
export function wonderFootWorld(idx, gridN, cx, cy) {
  const slot = cmWonderSlot(idx, gridN, cx, cy);
  const T = CM.TILE;
  const legacy = { x: slot.gx * T + T / 2, y: slot.gy * T + T };
  const w = CM_WONDERS[idx];
  if (!w || w.id === "era_mega") return legacy;
  // Rang LU SUR LE PLAN (celui qui a dimensionné le parvis), aperçu prioritaire :
  // un cran d'écart et le monument se poserait à côté de son socle.
  const pv = CM.previewWonder;
  const tier = (pv && pv.id === w.id) ? pv.tier
    : ((CM.layout && CM.layout.wonderTiers && CM.layout.wonderTiers[w.id]) || 1);
  const R = cmWonderExtent(w.id, tier).halfW + 0.5;          // demi-côté du parvis
  const k = Math.max(0.5, Math.min(R - 0.5, cmWonderHeightTiles(w.id, tier) / 2));
  return { x: (slot.gx + 0.5 + k) * T, y: (slot.gy + 0.5 + k) * T };
}
export function wonderAnchor(idx, gridN, cx, cy) {
  const f = wonderFootWorld(idx, gridN, cx, cy);
  return worldToScreen(f.x, f.y);
}

// Les 4 coins écran du losange de la cellule (gx,gy) (ordre N,E,S,W) + centre.
// En mode legacy, renvoie le carré équivalent (utile pour du debug partagé).
export function tileDiamond(gx, gy) {
  const T = CM.TILE;
  const wx = gx * T, wy = gy * T;
  return {
    n: worldToScreen(wx, wy),            // sommet haut (coin nord de la cellule)
    e: worldToScreen(wx + T, wy),        // droite
    s: worldToScreen(wx + T, wy + T),    // bas (coin SUD = ancre des sprites)
    w: worldToScreen(wx, wy + T),        // gauche
    c: worldToScreen(wx + T / 2, wy + T / 2),
  };
}

// BORNES EN LOSANGE du viewport — le complément de visibleCellBounds. En iso,
// l'écran projeté en monde est un LOSANGE dont visibleCellBounds prend la boîte
// englobante : ~2× l'aire, donc ~1,8× trop d'items retenus par le peintre
// (mesuré : 437 tuiles pour 246 visibles à zoom 1, PERF-CARTE-REPRISE §6). Or
// les coordonnées écran sont AFFINES en u = wx − wy (ne dépend que de sx) et
// v = wx + wy (ne dépend que de sy) : le viewport est un simple RECTANGLE dans
// le repère (u, v). Une emprise [wx0..wx1]×[wy0..wy1] se teste alors par
// recouvrement d'intervalles — deux soustractions, quatre comparaisons.
// Marge basse séparée (`marginDownPx`) : les sprites se DRESSENT depuis leur
// base — une base sous le bord bas de l'écran peut encore montrer sa tour.
export function visibleDiamondBounds(marginPx = 0, marginDownPx = 0) {
  const l = screenToWorld(-marginPx, 0), r = screenToWorld(CM.cw + marginPx, 0);
  const t = screenToWorld(0, -marginPx), bo = screenToWorld(0, CM.ch + marginDownPx);
  return { u0: l.x - l.y, u1: r.x - r.y, v0: t.x + t.y, v1: bo.x + bo.y };
}

// Bornes de cellules (gx/gy) couvrant le viewport élargi de `marginPx` — culling
// des boucles de rendu. Passe par screenToWorld des 4 coins (correct dans les 2 modes).
export function visibleCellBounds(marginPx = 0) {
  const T = CM.TILE;
  const corners = [
    screenToWorld(-marginPx, -marginPx),
    screenToWorld(CM.cw + marginPx, -marginPx),
    screenToWorld(-marginPx, CM.ch + marginPx),
    screenToWorld(CM.cw + marginPx, CM.ch + marginPx),
  ];
  let wx0 = Infinity, wy0 = Infinity, wx1 = -Infinity, wy1 = -Infinity;
  for (const c of corners) {
    if (c.x < wx0) wx0 = c.x; if (c.x > wx1) wx1 = c.x;
    if (c.y < wy0) wy0 = c.y; if (c.y > wy1) wy1 = c.y;
  }
  return {
    gx0: Math.floor(wx0 / T) - 1, gy0: Math.floor(wy0 / T) - 1,
    gx1: Math.ceil(wx1 / T) + 1, gy1: Math.ceil(wy1 / T) + 1,
  };
}
