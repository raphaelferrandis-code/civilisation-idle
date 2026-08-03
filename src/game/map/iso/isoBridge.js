"use strict";
// ── PONT ISO « 3/4 top-down » — v1 procédurale (chantier relancé 2026-07-16) ──
// Le pont plat projeté (withLegacyToIso ∘ drawPixelBridges) couchait le tablier
// legacy sur le plan du sol : lecture « tapis posé sur l'eau », aucun volume.
// Les sprites de pont complets (bridge-full-*) re-tournés gardaient leur
// perspective interne (rejetés 2026-07-12). On repart de zéro en PROCÉDURAL,
// avec la grammaire du reste du jeu :
//   · surfaces horizontales (tablier, ombre portée) = quads MONDE projetés,
//     donc posées dans le plan du losange ;
//   · verticalité (piles, épaisseur du tablier, parapets) = rubans VERTICAUX
//     ÉCRAN qui « pendent » sous leur ligne de base — même geste que le mur de
//     quai (cityMapDrawQuays) et l'aqueduc 3-slice debout.
// Le tablier reste AU PLAN DU SOL (pas de dos d'âne) : agents et attelages le
// traversent sans lift ; le volume vient de ce qui pend dessous (face, piles)
// et dépasse dessus (parapets). La hauteur d'eau est CONVENTIONNELLE (l'eau
// peinte vit dans le plan du sol) : les piles descendent de pileH px et posent
// leur remous là — personne d'autre ne référence ce niveau.
//
// Répartition des passes (cf. drawIsoWorld / drawIsoLive dans isoRenderer) :
//   passe A  drawIsoBridgeUnder — AVANT les bateaux : OMBRE portée seule.
//   tri peintre  pushIsoBridgeItems — TOUT LE PONT, par CELLULE (kind
//     'bridgeSeg', même leçon que l'aqueduc : tri LOCAL) : le PLATELAGE (part
//     'deck', profondeur au coin NORD comme les empreintes 'field' → tout ce
//     qui le chevauche passe dessus), côté amont le parapet, côté aval face +
//     arches + piles + contreventement + parapet. Leçon des 1res versions :
//     tout élément dessiné en passe globale AVANT la scène vivante finit
//     recouvert par un voisin plus profond (scène riveraine, bâtiment dont le
//     sprite déborde) — au tri, le pont est un citoyen 3/4 comme les autres.
//     Seul compromis : un bateau émergeant côté aval glisse quelques px
//     DERRIÈRE les piles (lecture « encore sous le pont », acceptable).
//   nuit  drawIsoBridgeNight — après le voile : lanternes (halos, reflets).
// Les piétons/attelages traversent à ±0.16 tuile de l'axe de leur voie (cf.
// __bridgePedEdge) : jamais dans les parapets, et leur profondeur les place
// entre parapet amont et parapet aval de leur cellule.
// Bord AVAL = bord +x (span vertical) ou +y (span horizontal) : celui dont la
// normale DESCEND à l'écran — propriété fixe de la projection, aucun test par
// sample. Hypothèse héritée du legacy : les spans sont RECTILIGNES (bbox).
//
// Matière par bande : bridgeEraForBand (partagé avec le pont legacy top-down).
// A/B : window.__isoBridge3d(false) rebranche l'ancien tablier plat projeté.
// Molettes fines : window.__bridgeTune (objet muté en live, pont non baké).
//
// ── PONT SPRITE (chantier 2026-08-03, stade 0 bois) ──────────────────────────
// Le stade bois quitte le procédural pour un SPRITE PixelLab « façon ponton » :
// arc de bois surbaissé en dos d'âne, AUCUNE palée dans l'eau (choix Raph — la
// cohérence bateaux du suspendu, dès l'ère des tentes). Objet 8-directions dont
// on ne garde que les 2 axes diagonaux (ne = spans verticaux, nw = horizontaux),
// REDRESSÉS à la pente iso ±0,5 exacte par scripts/prepBridgeIso.mjs (leçon
// aqueduc : sans cisaillement, chaque couture fait une marche d'escalier).
// Pose 3-SLICE le long de l'axe : culée a + travée RÉPÉTÉE + culée b — c'est ce
// qui rend le pont découpable quand la largeur du fleuve varie (elle se rabat
// aux ères hautes). Les coupes sont des RECTS VERTICAUX du PNG : le sprite étant
// à la pente de la projection, deux rects adjacents ancrés par les mêmes
// formules se raccordent au pixel près, sans clip ni recouvrement.
// Chaque pièce est SOUS-DÉCOUPÉE par tuile pour le tri peintre (tri LOCAL, même
// leçon que l'aqueduc et le platelage procédural : une pièce de 2 tuiles
// dessinée d'un bloc passerait sous le sprite d'un voisin plus profond).
// Le DOS D'ÂNE est dans le dessin, pas dans la géométrie : les traverseurs sont
// SOULEVÉS à l'écran par bridgeLiftScreen (rampes smoothstep sur les culées,
// plateau au centre) — appelé aux points de blit des citoyens, véhicules,
// émeutiers et bulles de pensée. Repli intégral : PNG absent ou
// __bridgeSprite(false) → procédural d'avant, stades 1+ inchangés.

import { CM, cmHash } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { bridgeEraForBand } from '../pixelBridge.js';

export const isoBridge3dFlag = { on: true };
if (typeof window !== 'undefined') {
  window.__isoBridge3d = (on) => { isoBridge3dFlag.on = on !== false; return isoBridge3dFlag.on; };
}

// Cotes en px MONDE (× zoom au rendu). Partagées entre matières sauf mention.
export const bridgeTune = {
  // Demi-largeur du tablier par voie (fraction de tuile). 0,44 → 0,36 au
  // chantier ÉCHELLE (Lot A, docs/PLAN-ECHELLE.md §A3) : un tablier large se
  // lit « petit fleuve, gros pont » et rapetissait la ville. Garde-fous tenus :
  // piétons à ±0,16 de l'axe de voie + demi-corps ~0,13 = 0,29 < 0,36 ; en iso
  // les véhicules roulent CENTRÉS sur leur cellule de pont (vehicleLaneTarget,
  // rang main → offset nul).
  deckHalf: 0.36,
  landing: 0.55,       // débord du platelage dans la cellule d'atterrissage (fraction)
  shadowA: 0.20,       // alpha de l'ombre portée sur l'eau
  shadowDx: 2.5, shadowDy: 6,   // décalage écran de l'ombre (lumière haut-gauche)
  ripple: true,        // remous clairs au pied des piles
  brace: true,         // contreventement en X des palées bois
  arches: true,        // arches dans la face des ponts maçonnés
  posts: true,         // poteaux de tête aux entrées
  // Demi-largeur de la PASSE NAVIGABLE, en tuiles : les palées du milieu du
  // chenal sautent pour laisser filer les bateaux. 1,7 laisse 3,4 tuiles de
  // large — la plus grosse coque (cosmique bande 9 ÉCRÊTÉ, cf. FLEET_SCALE
  // d'isoRenderer) fait 0,7×3,2 = 2,24 : la passe retrouve sa cote d'origine,
  // que la flotte cosmique d'avant l'écrêtage (3,9 tuiles) débordait.
  passHalf: 1.7,
  // ── Pont SPRITE (stade bois) ───────────────────────────────────────────────
  sprite: true,        // false = repli procédural (A/B rapide : __bridgeSprite)
  spriteTilePx: 28,    // px SOURCE par tuile monde le long de l'axe (échelle)
  // Dos d'âne au plateau, px SOURCE au-dessus de l'axe-sol. ⚠ Ce n'est PAS la
  // flèche « géométrique » de l'arc (~8 px) : c'est la hauteur du TABLIER
  // DESSINÉ (arc + épaisseur du caisson) — jugée aux pieds des piétons posés
  // sur la travée (capture bridge-walkers-h16, 16 = pieds sur les planches).
  humpH: 16,
  spriteDy: 0,         // affinage vertical écran du blit, px monde (± descend/monte)
  // Débord d'atterrissage PROPRE au pont sprite : ses rampes descendent sur la
  // berge, plus longues que le platelage plat du procédural — à 0,55 le pied
  // SW trempait dans le ruban peint (vu à la capture). Ne touche PAS le 0,55
  // des stades procéduraux. ⚠ 0,9 → 0,7 : avec les abouts intégrés au déroulé,
  // le pont dessiné finissait ~1,3 tuile après l'eau et mordait les LOTS — des
  // maisons se posaient sur les marches (retour Raph) ; à 0,7 l'about reste
  // sur la route d'atterrissage.
  spriteLanding: 0.7,
};
if (typeof window !== 'undefined') window.__bridgeTune = bridgeTune;

// Diagnostic live : géométrie calculée + compteurs de la dernière frame.
// Usage console : __bridgeGeo() → { spans: [...], drew: { under, segs, night } }.
const _drew = { under: 0, segs: 0, night: 0 };
if (typeof window !== 'undefined') {
  window.__bridgeGeo = () => {
    const geos = bridgeGeoms();
    return {
      drew: { ..._drew },
      spans: (geos || []).map((g) => ({
        vertical: g.vertical, lanes: g.lanes, c: g.c, wD: g.wD,
        a: g.a, b: g.b, wetA: g.wetA, wetB: g.wetB,
        sprite: !!g._sprite,
      })),
    };
  };
  // Sonde du dos d'âne : __bridgeLift(wx, wy) → px écran (0 hors pont sprite).
  window.__bridgeLift = (wx, wy) => bridgeLiftScreen(wx, wy);
}

// ── Styles par matière ────────────────────────────────────────────────────────
// Teintes calées sur bridgeTone/roadTone (palette terracotta, jamais de cyan).
// Hauteurs px monde : faceH = épaisseur pendue sous le bord aval, pileH = chute
// des piles SOUS la face (jusqu'à l'eau conventionnelle), railH = parapet.
const STYLES = {
  bois: {
    deck: [126, 96, 58], plankPitch: 3.8, plankVar: 0.16, joint: 'rgba(42,28,14,0.28)',
    stringer: [88, 62, 38],
    faceH: 4, faceTop: [102, 74, 44], faceBot: [70, 48, 28],
    pileH: 9, pileW: 2.6, pileEvery: 1.15, pile: [82, 58, 36], pileDark: [56, 38, 22],
    railH: 8.5, railPostEvery: 0.56, railPostW: 2, rail: [96, 68, 40], railTop: [128, 94, 56],
    kind: 'wood',
    // Ce style a un PONT SPRITE (cf. en-tête) : arc de bois PixelLab en dos
    // d'âne, sans palée. Le marqueur vit sur le STYLE (pas sur le décodage de
    // l'art) : la géométrie (landing élargi) ne doit pas sauter quand les PNG
    // finissent de charger.
    sprite: true,
  },
  pierre: {
    deck: [148, 142, 128], plankPitch: 15, plankVar: 0.05, joint: 'rgba(30,26,20,0.16)',
    stringer: [186, 178, 156],          // margelle claire au bord des dalles
    faceH: 9, faceTop: [122, 114, 98], faceBot: [82, 76, 64],
    pileH: 8, pileW: 5.5, pileEvery: 1.6, pile: [112, 106, 92], pileDark: [78, 72, 60],
    railH: 7, railPostEvery: 0.5, railPostW: 2.5, rail: [140, 132, 116], railTop: [190, 182, 160],
    kind: 'stone', arch: [46, 44, 44],
  },
  // ── SUSPENDUS (bande 4+) ───────────────────────────────────────────────────
  // `suspended` : AUCUNE palée dans l'eau. Deux pylônes plantés sur les berges,
  // un câble porteur en caténaire, des suspentes verticales, et le tablier
  // franchit d'un seul jet. C'est la vraie réponse au problème des bateaux qui
  // traversaient la pierre (Raph) : le suspendu ne le contourne pas, il le
  // supprime — plus rien ne se dresse dans le chenal.
  //
  // À partir du FER et pas avant : le suspendu naît avec la métallurgie. Un pont
  // suspendu à l'âge du bronze serait la même faute que le vapeur croisant
  // devant des habitants en toge, déjà corrigée sur ce chantier.
  //
  // towerH = hauteur du pylône au-dessus du tablier ; sag = flèche du câble
  // (fraction de la portée) ; hangEvery = pas des suspentes, en tuiles.
  // ⚠ Gabarits fer/béton/énergie AFFINÉS au chantier ÉCHELLE (Lot A, §A3) :
  // rails, piles et pylônes −10/15 % en même temps que deckHalf — un parapet
  // épais à l'échelle d'une voiture rendait le pont plus « gros » que les tours.
  fer: {
    deck: [96, 92, 88], plankPitch: 8, plankVar: 0.06, joint: 'rgba(16,16,18,0.22)',
    stringer: [58, 54, 52],
    faceH: 7, faceTop: [78, 74, 70], faceBot: [46, 44, 42],
    pileH: 9, pileW: 3.4, pileEvery: 1.5, pile: [70, 66, 62], pileDark: [42, 40, 38],
    railH: 7, railPostEvery: 0.5, railPostW: 1.4, rail: [50, 48, 46], railTop: [104, 98, 92],
    kind: 'metal',
    suspended: true, towerH: 30, towerW: 3.1, sag: 0.30, hangEvery: 0.62,
    cable: [58, 56, 54], cableLite: [126, 122, 116], tower: [78, 74, 70], towerDark: [46, 44, 42],
  },
  beton: {
    deck: [122, 122, 124], plankPitch: 16, plankVar: 0.04, joint: 'rgba(20,20,24,0.14)',
    stringer: [156, 156, 154],
    faceH: 8, faceTop: [104, 104, 106], faceBot: [70, 70, 74],
    pileH: 9, pileW: 5.2, pileEvery: 1.9, pile: [100, 100, 102], pileDark: [66, 66, 70],
    railH: 6, railPostEvery: 0.62, railPostW: 1.7, rail: [96, 96, 100], railTop: [150, 150, 150],
    kind: 'stone', arch: [40, 42, 46],
    suspended: true, towerH: 34, towerW: 3.7, sag: 0.26, hangEvery: 0.7,
    cable: [92, 92, 96], cableLite: [168, 168, 168], tower: [132, 132, 134], towerDark: [82, 82, 86],
  },
  energie: {
    deck: [104, 110, 128], plankPitch: 12, plankVar: 0.05, joint: 'rgba(12,14,20,0.20)',
    stringer: [64, 58, 44],
    faceH: 8, faceTop: [84, 90, 108], faceBot: [50, 54, 68],
    pileH: 10, pileW: 4.4, pileEvery: 1.9, pile: [76, 82, 100], pileDark: [44, 48, 62],
    railH: 6.5, railPostEvery: 0.62, railPostW: 1.6, rail: [70, 76, 94], railTop: [214, 178, 108],
    kind: 'metal', glow: '255,196,110',   // lisse lumineuse ambre (jamais cyan)
    suspended: true, towerH: 38, towerW: 3.4, sag: 0.22, hangEvery: 0.68,
    cable: [70, 76, 94], cableLite: [214, 178, 108], tower: [84, 90, 108], towerDark: [50, 54, 68],
  },
};

const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// ── Sprites de pont (stade bois) : mesures px SOURCE des PNG REDRESSÉS ───────
// footHi = pied de culée du bout « l = a » du span (NE écran pour l'axe ne, NW
// pour nw), footLo = bout « l = b ». L'axe-sol du sprite est la droite de pente
// ±0,5 passant par footHi (garantie prepBridgeIso) : ySol(x) se déduit, jamais
// mesuré ailleurs. capHi/capLo découpent le DÉROULÉ (px source le long de
// l'axe depuis chaque pied) : les CULÉES = rampes + arcs des extrémités.
// over = x source des bouts du CONTENU au-delà des pieds (débord d'about,
// inclus dans les rects des culées — l'équivalent du landing du procédural).
//
// La TRAVÉE répétée est la FENÊTRE CENTRALE DU MÊME SPRITE, entre les deux
// culées — le dessin y est un tablier « dos plat » parfaitement horizontal,
// APLATI au pixel par prepBridgeIso (2e cisaillement, local). Un premier
// montage collait un MODULE généré à part : silhouettes du dessous
// différentes + ancre verticale propre = crans et coupures à chaque jonction
// (retour Raph). Ici : même bois, mêmes lisses, même dessous des deux côtés
// de chaque coupe, et UNE SEULE droite d'ancrage pour tout le pont.
// ⚠ Toutes les coordonnées x sont des BORDS de colonne (0..W), pas des index
// de pixel : un rect [x0, x1] dessine les colonnes [x0..x1−1]. Avec un index,
// la dernière colonne de la fenêtre n'était jamais blittée → fente d'eau d'un
// px source à chaque jonction (vu au crop).
const BRIDGE_SPRITES = {
  ne: {
    key: 'bridge-bois-ne', sgn: -1,            // x source DÉCROÎT quand l croît
    footHi: [156, 83], footLo: [37, 142.5],
    over: [167, 4], capHi: 33, capLo: 42,
    // dt : le dessin (about surtout) est décalé de ~4-5 px vers l aval par
    // rapport à son axe — recentré sous la route et la ligne de marche
    // (calibré au marqueur, retour Raph « centre la route sur le pont »).
    dt: -4,
  },
  nw: {
    key: 'bridge-bois-nw', sgn: +1,
    footHi: [14, 78], footLo: [143, 142.5],
    over: [3, 166], capHi: 46, capLo: 53,
    // Même biais supposé que le ne (jamais vu en jeu — à recalibrer au
    // premier pont est-ouest croisé : __bridgeSpecs.nw.dt en live).
    dt: -4,
  },
};

// Cache paresseux des PNG (/pixelart/iso/<key>.png). Copie locale du pattern
// isoArt d'isoRenderer : l'importer créerait un cycle isoRenderer ↔ isoBridge.
const _bridgeArt = new Map();
function bridgeArt(key) {
  let e = _bridgeArt.get(key);
  if (e) return e;
  e = { img: null, ready: false };
  _bridgeArt.set(key, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => { e.img = im; e.ready = true; };
    im.src = '/pixelart/iso/' + key + '.png';
  }
  return e;
}

// A/B express : __bridgeSprite(false) rebranche le procédural (mute la molette).
// __bridgeSpecs : les specs des sprites, MUTABLES en live (calibrage du dt
// transverse & co à la capture — le pont n est pas baké, effet immédiat).
if (typeof window !== 'undefined') {
  window.__bridgeSprite = (on) => { bridgeTune.sprite = on !== false; return bridgeTune.sprite; };
  window.__bridgeSpecs = BRIDGE_SPRITES;
}

// Le span g se dessine-t-il en sprite ? (style bois seulement, art décodé.)
// Null → chemin procédural intact. railArt (calque garde-corps AVAL, duplicata
// lisse+poteaux extrait par prepBridgeIso) est OPTIONNEL : sans lui, pas
// d'occlusion fine, le pont reste entier.
function spanSprite(g, st) {
  if (!bridgeTune.sprite || st !== STYLES.bois) return null;
  const spec = BRIDGE_SPRITES[g.vertical ? 'ne' : 'nw'];
  const art = bridgeArt(spec.key);
  if (!art.ready) return null;
  const railArt = bridgeArt(spec.key + '-rail');
  return { spec, art, railArt: railArt.ready ? railArt : null };
}

// ── LIFT du dos d'âne : hauteur ÉCRAN à soustraire au blit d'un traverseur ───
// Le tablier du sprite monte en rampe sur les culées puis tient un plateau ;
// les agents/attelages/émeutiers (et leurs bulles) suivent ce profil, sinon ils
// marchent DANS le pont. Smoothstep sur la longueur des rampes (les caps),
// bornée à la demi-portée pour les ponts courts (caps compressés, cf. push).
// Nul hors des spans sprités : le tablier procédural reste au plan du sol.
// Lit le DERNIER cache géo (_geo) : les consommateurs dessinent dans la même
// frame que pushIsoBridgeItems, qui vient de le (re)calculer.
export function bridgeLiftScreen(wx, wy) {
  if (!CM.iso || !isoBridge3dFlag.on) return 0;
  const geos = _geo.list;
  if (!geos) return 0;
  const T = CM.TILE;
  for (const g of geos) {
    if (!g._sprite) continue;
    const l = g.vertical ? wy : wx, t = g.vertical ? wx : wy;
    const sp = g._sprite.spec;
    const kpx = T / bridgeTune.spriteTilePx;
    // Bornes ÉTENDUES aux débords d'about : les marches dessinées au-delà des
    // pieds font partie du pont (cf. pushSpriteItems) — la montée commence dès
    // le premier pas sur l'about, pas au pied théorique.
    const aExt = g.a - Math.abs(sp.over[0] - sp.footHi[0]) * kpx;
    const bExt = g.b + Math.abs(sp.over[1] - sp.footLo[0]) * kpx;
    if (l < aExt || l > bExt || Math.abs(t - g.c) > g.wD + T * 0.35) continue;
    const half = (bExt - aExt) / 2;
    const rHi = Math.min((sp.capHi + Math.abs(sp.over[0] - sp.footHi[0])) * kpx, half);
    const rLo = Math.min((sp.capLo + Math.abs(sp.over[1] - sp.footLo[0])) * kpx, half);
    const f = Math.max(0, Math.min((l - aExt) / rHi, (bExt - l) / rLo, 1));
    const sm = f * f * (3 - 2 * f);
    return sm * bridgeTune.humpH * kpx * CM.cam.zoom;
  }
  return 0;
}

// ── Géométrie par span, en repère (l = longitudinal, t = transverse) ─────────
// P(l,t) projette directement en écran ; aval = t croissant (cf. en-tête).
let _geo = { at: '', list: null };
function bridgeGeoms() {
  const L = CM.layout;
  if (!L || !CM.bridgeSpans || !CM.bridgeSpans.length) return null;
  // La clé embarque les molettes de gabarit : muter __bridgeTune re-calcule
  // la géométrie à la frame suivante (le pont n'est pas baké).
  const key = CM.layoutRecomputeAt + ':' + bridgeTune.deckHalf + ':' + bridgeTune.landing
    + ':' + bridgeTune.spriteLanding + ':' + bridgeTune.sprite;
  if (_geo.at === key && _geo.list) return _geo.list;
  const T = CM.TILE, rv = L.river;
  const st = styleFor(L);
  // Style sprité → rampes qui mordent la berge : débord d'atterrissage élargi.
  const landing = (bridgeTune.sprite && st.sprite) ? bridgeTune.spriteLanding : bridgeTune.landing;
  const list = [];
  for (const sp of CM.bridgeSpans) {
    const vertical = sp.vertical;
    const lanes = vertical ? (sp.gx1 - sp.gx0 + 1) : (sp.gy1 - sp.gy0 + 1);
    const c = vertical ? ((sp.gx0 + sp.gx1 + 1) / 2) * T : ((sp.gy0 + sp.gy1 + 1) / 2) * T;
    const wD = (lanes - 1 + bridgeTune.deckHalf * 2) / 2 * T;
    // Bornes longitudinales : cellules-pont + débord dans les atterrissages
    // (recouvre la couture avec la route SANS l'évasement rejeté par Raph).
    let a = (vertical ? sp.gy0 : sp.gx0) * T;
    let b = (vertical ? sp.gy1 + 1 : sp.gx1 + 1) * T;
    if (sp.exits) {
      for (const r of sp.exits) {
        const g = vertical ? r.gy : r.gx;
        if (g < (vertical ? sp.gy0 : sp.gx0)) a = Math.min(a, (g + 1 - landing) * T);
        else if (g > (vertical ? sp.gy1 : sp.gx1)) b = Math.max(b, (g + landing) * T);
      }
    }
    // Tronçon MOUILLÉ (piles, face, ombre) : cellules du span posées sur l'eau.
    let wetA = Infinity, wetB = -Infinity;
    if (rv && rv.present && rv.cells) {
      for (const cell of sp.cells) {
        if (!rv.cells.has(cell.gx + ',' + cell.gy)) continue;
        const l0 = (vertical ? cell.gy : cell.gx) * T;
        if (l0 < wetA) wetA = l0;
        if (l0 + T > wetB) wetB = l0 + T;
      }
    }
    if (wetA > wetB) { wetA = a + T * 0.4; wetB = b - T * 0.4; }   // pas d'info eau : approx
    // Un span peut S'ARRÊTER EN PLEINE EAU : au coude du fleuve, le RUBAN PEINT
    // (polyline samples ± hw, lissée) déborde de la discrétisation rv.cells et
    // il n'y a aucune route d'atterrissage (donc aucun exit) pour étendre les
    // bornes — la tête de pont trempait au milieu de l'eau (vu à la capture,
    // place au débouché sud). Le tronçon mouillé RÉEL se lit sur les SAMPLES :
    // ceux dont le ruban passe au droit du gabarit du pont, près du span,
    // étendent wetA/wetB — et le tablier suit, débord `landing` sur la berge.
    if (rv && rv.present && rv.samples && rv.samples.length) {
      for (const s of rv.samples) {
        const sT = (vertical ? s.x : s.y) * T;      // transverse (vs axe c)
        const sL = (vertical ? s.y : s.x) * T;      // longitudinal
        const shw = (s.hw || 0) * T;
        if (Math.abs(sT - c) > shw + wD + T * 0.5) continue;   // ruban hors gabarit
        if (sL < a - T * 3 || sL > b + T * 3) continue;        // trop loin du span
        if (sL - shw < wetA) wetA = sL - shw;
        if (sL + shw > wetB) wetB = sL + shw;
      }
      a = Math.min(a, wetA - landing * T);
      b = Math.max(b, wetB + landing * T);
      // ── BOUT AVAL EN PARALLAXE (mode sprite) : sur un fleuve OBLIQUE, l'eau
      // des cellules situées en (t+u, l+u) — la diagonale qui descend l'ÉCRAN à
      // x constant — passe visuellement SOUS le pied aval : la rampe du sprite
      // semblait plonger à mi-eau alors que sa cellule d'ancrage est à terre
      // (vu à la capture). Le platelage PLAT du procédural masquait cette eau
      // de sa face ; le dos d'âne, non. On étend b jusqu'à ce que la colonne
      // d'écran sous le pied soit sèche sur ~2 tuiles de diagonale.
      if (bridgeTune.sprite && st.sprite) {
        const wetAt = (wx, wy) => {
          for (const s of rv.samples) {
            const dx = s.x * T - wx, dy = s.y * T - wy, m = ((s.hw || 0) - 0.05) * T;
            if (m > 0 && dx * dx + dy * dy < m * m) return true;
          }
          return false;
        };
        for (let guard = 0; guard < 40; guard += 1) {
          let touche = false;
          for (let u = 0; u <= T * 2.2; u += T * 0.25) {
            const wx = vertical ? c + u : b + u;
            const wy = vertical ? b + u : c + u;
            if (wetAt(wx, wy)) { touche = true; break; }
          }
          if (!touche) break;
          b += T * 0.25;
        }
        // ── LONGUEUR QUANTIFIÉE AU PAS DE LA TRAVÉE ──────────────────────────
        // Si (b − a) n'est pas culées + k·fenêtre EXACTEMENT, la dernière
        // répétition est TRONQUÉE à une phase arbitraire : le dessous du pont
        // saute à cette jonction et la coupe se voit (« la zone coupée »,
        // Raph). On étire/rogne les bouts (±½ fenêtre au total, réparti sur
        // les deux landings) pour ne poser QUE des répétitions entières —
        // plus aucune coupe de phase nulle part.
        const spq = BRIDGE_SPRITES[vertical ? 'ne' : 'nw'];
        if (spq) {
          const kpx = T / bridgeTune.spriteTilePx;
          const caps = (spq.capHi + spq.capLo) * kpx;
          const midW = (Math.abs(spq.footLo[0] - spq.footHi[0]) - spq.capHi - spq.capLo) * kpx;
          const L = b - a;
          if (midW > 4 && L > caps + midW * 0.5) {
            const k = Math.max(1, Math.round((L - caps) / midW));
            const grow = (caps + k * midW) - L;
            a -= grow / 2; b += grow / 2;
          }
        }
      }
    }
    // PILES précalculées, PIED VÉRIFIÉ SUR L'EAU (distance au ruban continu
    // < hw locale − marge) : une pile posée sur la frange peinte de la berge
    // laissait son remous flotter sur l'herbe (vu à la capture). Phase stable
    // par pile → clapot/écume animés sans re-tirage par frame.
    const piles = [];
    {
      const span = wetB - wetA - T * 0.55;
      if (span >= T * 0.5) {
        const n = Math.max(2, Math.round(span / (st.pileEvery * T)) + 1);
        const tAval = c + wD;
        for (let i = 0; i < n; i += 1) {
          const l = wetA + T * 0.275 + (span * i) / (n - 1);
          const px = (vertical ? tAval : l) / T, py = (vertical ? l : tAval) / T;
          let wet = !(rv && rv.present && rv.samples && rv.samples.length);
          if (!wet) {
            for (const s of rv.samples) {
              const dx = s.x - px, dy = s.y - py, m = (s.hw || 0) - 0.15;
              if (m > 0 && dx * dx + dy * dy < m * m) { wet = true; break; }
            }
          }
          if (wet) piles.push({ l, ph: (cmHash('bpile:' + sp.gx0 + ':' + sp.gy0 + ':' + i) % 1000) / 1000 });
        }
      }
    }
    // ── PASSE NAVIGABLE ──────────────────────────────────────────────────────
    // Les palées tombaient TOUS LES 1,15 à 1,6 tuiles d'une berge à l'autre. Un
    // porte-conteneurs en fait 2,24 de large : il ne pouvait passer nulle part,
    // et traversait donc la pierre (Raph : « qu'ils passent entre les poteaux »).
    //
    // On ouvre la travée du milieu, comme un vrai pont : les palées du chenal
    // sautent et les deux qui bordent la passe deviennent ses culées. Ça règle le
    // problème par la GÉOMÉTRIE plutôt qu'en faisant slalomer les bateaux dans un
    // espace où ils ne tiennent pas.
    // ── SUSPENDU : le chenal est VIDE ────────────────────────────────────────
    // Toutes les palées mouillées sautent, remplacées par deux pylônes plantés
    // en retrait sur la terre ferme. C'est ce qui rend la passe navigable
    // inutile pour ces ères : il n'y a plus rien à éviter d'un bout à l'autre de
    // la traversée.
    const towers = [];
    if (st.suspended) {
      piles.length = 0;
      towers.push(wetA - T * 0.35, wetB + T * 0.35);
    }
    // (Le RECENTRAGE des bateaux sur cette passe est publié à part, par le
    // runtime, à partir des cellules de pont : CM.riverGates.)
    if (piles.length > 2) {
      const mid = (wetA + wetB) / 2;
      const half = bridgeTune.passHalf * T;
      const garde = piles.filter((p) => Math.abs(p.l - mid) > half);
      // Jamais moins de deux palées : sans elles, la face n'a plus de quoi
      // s'appuyer et le tablier flotte.
      if (garde.length >= 2) {
        piles.length = 0;
        piles.push(...garde);
      }
    }
    // LANTERNES : une aux deux têtes de pont + une paire médiane sur les longs
    // spans, alignées sur le PAS des poteaux du parapet (le boîtier se dessine
    // dans drawRailRun, les halos/reflets de nuit dans drawIsoBridgeNight).
    // `wet` : lanterne au-dessus de l'eau → reflet dans l'eau côté aval.
    const lamps = [];
    {
      const step = st.railPostEvery * T;
      const nTot = Math.max(1, Math.round((b - a) / step));
      const post = (i) => a + ((b - a) * i) / nTot;
      const cand = [[0, true], [nTot, true]];
      if (b - a > T * 5.5) cand.push([Math.round(nTot / 2), false]);
      for (const [i, head] of cand) {
        const l = post(i);
        lamps.push({ l, head, wet: l > wetA + T * 0.3 && l < wetB - T * 0.3 });
      }
    }
    list.push({
      sp, vertical, c, wD, a, b, wetA, wetB, lanes, piles, lamps, towers,
      P: vertical ? (l, t) => worldToScreen(t, l) : (l, t) => worldToScreen(l, t),
      D: vertical ? (l, t) => depthOf(t, l) : (l, t) => depthOf(l, t),
    });
  }
  _geo = { at: key, list };
  return list;
}

// Cull écran d'un span (bbox des 4 coins étendus + marge verticale des piles).
function spanVisible(g, z) {
  const m = 24 * z;
  const p = [g.P(g.a, g.c - g.wD), g.P(g.a, g.c + g.wD), g.P(g.b, g.c - g.wD), g.P(g.b, g.c + g.wD)];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of p) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
  return !(x1 < -m || y1 < -m || x0 > CM.cw + m || y0 > CM.ch + m + 24 * z);
}

function styleFor(L) { return STYLES[bridgeEraForBand((L.counts && L.counts.eraBand) | 0)] || STYLES.bois; }

// Le pont de cette bande est-il un SUSPENDU (donc sans aucune palée en eau) ?
// Exporté pour le test : la règle « pas avant le fer » est exactement le genre
// de seuil qui dérive en silence — celui du vapeur avait fini recopié à trois
// endroits avec deux valeurs différentes.
export function bridgeIsSuspended(band) {
  const st = STYLES[bridgeEraForBand(band | 0)];
  return !!(st && st.suspended);
}

// Emprise « pont » pour les poseurs EXTÉRIEURS (bateau amarré du port, arbres
// et rochers du décor…) : vrai si le point monde (wx, wy) tombe sur un
// tablier, élargi de `margin` px.
export function bridgeBlocks(wx, wy, margin = 0) {
  if (!isoBridge3dFlag.on) return false;
  const geos = bridgeGeoms(); if (!geos) return false;
  for (const g of geos) {
    const l = g.vertical ? wy : wx, t = g.vertical ? wx : wy;
    if (l > g.a - margin && l < g.b + margin && Math.abs(t - g.c) < g.wD + margin) return true;
  }
  return false;
}

// Ruban vertical écran : ligne de base (l0→l1 à t fixe) extrudée de h px écran
// vers le bas, découpée en 2 assises (haut clair → bas sombre, lecture quai).
function fillDrop(ctx, g, l0, l1, t, yOff, h, colTop, colBot) {
  const p0 = g.P(l0, t), p1 = g.P(l1, t);
  for (const seg of [[0, 0.5, colTop], [0.5, 1, colBot]]) {
    ctx.fillStyle = seg[2];
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y + yOff + h * seg[0]);
    ctx.lineTo(p1.x, p1.y + yOff + h * seg[0]);
    ctx.lineTo(p1.x, p1.y + yOff + h * seg[1]);
    ctx.lineTo(p0.x, p0.y + yOff + h * seg[1]);
    ctx.closePath(); ctx.fill();
  }
}

// Quad du plan du sol entre (l0..l1) × (t0..t1), rempli.
function fillFlat(ctx, g, l0, t0, l1, t1) {
  const q0 = g.P(l0, t0), q1 = g.P(l1, t0), q2 = g.P(l1, t1), q3 = g.P(l0, t1);
  ctx.beginPath();
  ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y);
  ctx.closePath(); ctx.fill();
}

// ── PASSE A : ombre portée sur l'eau (avant les bateaux) ─────────────────────
export function drawIsoBridgeUnder() {
  if (!isoBridge3dFlag.on) return;
  const L = CM.layout; if (!L) return;
  const geos = bridgeGeoms(); if (!geos) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  _drew.under += 1;
  for (const g of geos) {
    if (!spanVisible(g, z)) continue;
    // Silhouette du tablier (tronçon mouillé seulement, marge aux berges)
    // translatée EN ÉCRAN bas-droite — même convention que les bâtiments.
    const sA = g.wetA + T * 0.12, sB = g.wetB - T * 0.12;
    if (sB > sA) {
      ctx.save();
      ctx.translate(bridgeTune.shadowDx * z, bridgeTune.shadowDy * z);
      ctx.fillStyle = `rgba(8,12,14,${bridgeTune.shadowA})`;
      fillFlat(ctx, g, sA, g.c - g.wD, sB, g.c + g.wD);
      ctx.restore();
    }
  }
}

// ── PLATELAGE d'une tranche [l0, l1] — item 'deck' du TRI PEINTRE ────────────
// (Le platelage vivait en passe globale AVANT la scène vivante : un bâtiment
// au NORD du pont, dessiné après, recouvrait le tablier de son débord. Comme
// les empreintes à plat 'field', chaque tranche est triée au coin NORD de sa
// cellule → tout ce qui la chevauche se dessine après, donc au-dessus.)
// Fond + planches/dalles PERPENDICULAIRES à l'axe, bornées à la tranche : une
// planche à cheval sur deux tranches est repeinte à l'identique (même hash
// global) — recouvrement exact, couture invisible.
function drawDeckSeg(ctx, g, st, l0, l1, z, lod) {
  const T = CM.TILE;
  const tAval = g.c + g.wD, tAmont = g.c - g.wD;
  ctx.fillStyle = rgb(st.deck);
  fillFlat(ctx, g, l0, tAmont, l1, tAval);
  if (lod) return;
  const pitch = st.plankPitch;
  for (let i = Math.floor(l0 / pitch); i * pitch < l1; i += 1) {
    const p0 = Math.max(l0, i * pitch), p1 = Math.min(l1, (i + 1) * pitch);
    if (p1 - p0 < 0.4) continue;
    const h = cmHash('bdk:' + g.sp.gx0 + ':' + g.sp.gy0 + ':' + i) % 100;
    const v = 1 - st.plankVar / 2 + (h / 100) * st.plankVar;
    if (Math.abs(v - 1) > 0.015) {
      ctx.fillStyle = rgb(st.deck, v);
      fillFlat(ctx, g, p0, tAmont, p1, tAval);
    }
    // Joint marqué toutes les ~2 planches (bois) / chaque dalle (pierre) — au
    // BORD de planche i·pitch, seulement s'il tombe dans la tranche.
    if (h % (st.kind === 'wood' ? 2 : 1) === 0 && i * pitch >= l0) {
      const q0 = g.P(i * pitch, tAmont), q1 = g.P(i * pitch, tAval);
      ctx.strokeStyle = st.joint;
      ctx.lineWidth = Math.max(1, z * 0.5);
      ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
    }
  }
  // Poutres de rive / margelles : liserés longitudinaux aux deux bords.
  ctx.fillStyle = rgb(st.stringer);
  fillFlat(ctx, g, l0, tAmont, l1, tAmont + T * 0.055);
  fillFlat(ctx, g, l0, tAval - T * 0.055, l1, tAval);
}

// ── Parapet : lisse + poteaux verticaux écran le long d'un bord ──────────────
// side = t du bord ; [l0, l1] = tranche dessinée. Les POTEAUX sont ancrés sur
// la grille GLOBALE du span (g.a → g.b) : le parapet, débité par cellule pour
// le tri peintre, garde un pas continu (un poteau pile sur une couture est
// re-dessiné superposé à l'identique — indolore). Têtes de pont renforcées aux
// seules extrémités RÉELLES du span.
function drawRailRun(ctx, g, st, side, l0, l1, z) {
  const railH = st.railH * z;
  const p0 = g.P(l0, side), p1 = g.P(l1, side);
  // Poteaux d'abord (la lisse les coiffe).
  const T = CM.TILE, step = st.railPostEvery * T;
  const nTot = Math.max(1, Math.round((g.b - g.a) / step));
  const pw = Math.max(1, st.railPostW * z);
  for (let i = 0; i <= nTot; i += 1) {
    const l = g.a + ((g.b - g.a) * i) / nTot;
    if (l < l0 - 0.25 || l > l1 + 0.25) continue;
    const p = g.P(l, side);
    const head = bridgeTune.posts && (i === 0 || i === nTot);
    const lamp = g.lamps && g.lamps.some((la) => Math.abs(la.l - l) < step * 0.45);
    const hh = head ? railH * 1.3 : railH;
    const ww = head ? pw * 1.5 : pw;
    ctx.fillStyle = rgb(head ? st.pileDark : st.rail);
    ctx.fillRect(Math.round(p.x - ww / 2), Math.round(p.y - hh), Math.ceil(ww), Math.round(hh));
    if (head) {   // chapeau clair 1px sur les poteaux de tête
      ctx.fillStyle = rgb(st.railTop);
      ctx.fillRect(Math.round(p.x - ww / 2), Math.round(p.y - hh), Math.ceil(ww), Math.max(1, Math.round(z)));
    }
    if (lamp) {
      // BOÎTIER de lanterne au sommet du poteau (mât court + caisson) — la
      // lumière elle-même (point chaud, halo, reflet dans l'eau) vit dans
      // drawIsoBridgeNight, PAR-DESSUS le voile de nuit.
      const bw = Math.max(2, Math.round(1.8 * z));
      const my2 = Math.round(p.y - hh - 2.6 * z);
      ctx.fillStyle = rgb(st.pileDark);
      ctx.fillRect(Math.round(p.x - z * 0.5), my2, Math.max(1, Math.round(z)), Math.round(2.6 * z));
      ctx.fillRect(Math.round(p.x - bw / 2), my2 - bw, bw, bw);
      ctx.fillStyle = rgb(st.railTop);
      ctx.fillRect(Math.round(p.x - bw / 2), my2 - bw, bw, Math.max(1, Math.round(z * 0.6)));
    }
  }
  if (st.kind === 'stone') {
    // Muret plein : parement OMBRÉ (sinon il se fondait dans le platelage,
    // quasi même valeur — vu à la capture) + margelle claire (grammaire du
    // quai) + ombre de contact au pied, qui l'assoit sur le tablier.
    ctx.fillStyle = rgb(st.rail, 0.80);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y - railH); ctx.lineTo(p1.x, p1.y - railH);
    ctx.lineTo(p1.x, p1.y); ctx.lineTo(p0.x, p0.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgb(st.railTop, 1.04);
    ctx.lineWidth = Math.max(1, z * 1.3);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y - railH); ctx.lineTo(p1.x, p1.y - railH); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,16,10,0.30)';
    ctx.lineWidth = Math.max(1, z * 0.6);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  } else {
    // Lisse + sous-lisse (bois/métal). Énergie : la lisse haute LUIT ambre.
    ctx.strokeStyle = rgb(st.railTop);
    ctx.lineWidth = Math.max(1, z * 1.2);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y - railH); ctx.lineTo(p1.x, p1.y - railH); ctx.stroke();
    ctx.strokeStyle = rgb(st.rail);
    ctx.lineWidth = Math.max(1, z * 0.8);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y - railH * 0.52); ctx.lineTo(p1.x, p1.y - railH * 0.52); ctx.stroke();
    if (st.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${st.glow},0.30)`;
      ctx.lineWidth = Math.max(1.5, z * 2.4);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y - railH); ctx.lineTo(p1.x, p1.y - railH); ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Le pont au tri peintre : trois items PAR CELLULE longitudinale ───────────
// part 'deck' (platelage, à plat) : profondeur au coin NORD de sa tranche —
//   même geste que les empreintes 'field' : tout ce qui le chevauche se trie
//   après, donc au-dessus (agents dessus, bâtiments voisins des deux rives).
// part 'up' (bord amont) : parapet seul, profondeur de SA ligne.
// part 'down' (bord aval) : face + arches + piles + contreventement + parapet.
// Poussés SANS garde LOD (les bâtiments du tri n'en ont pas) ; le dessin se
// simplifie de lui-même au LOD (platelage nu, face seule).
// ── Pièces SPRITE d'un span : 3-slice le long de l'axe, sous-découpé par tuile ─
// Chaque pièce (culée a / répétitions de travée / culée b) porte une ANCRE
// commune (ax px source ↔ al px monde) ; ses sous-tranches en héritent, si bien
// que leurs rects écran, calculés par les mêmes formules, sont adjacents au
// pixel près. Les bornes x source sont ARRONDIES au px entier (drawImage à
// source fractionnaire re-échantillonne : colonne dupliquée aux coutures).
function pushSpriteItems(items, bounds, g, si) {
  const T = CM.TILE, sp = g._sprite.spec;
  const kpx = T / bridgeTune.spriteTilePx;          // px monde par px source
  const D = (g.b - g.a) / kpx;                      // déroulé total, px source
  // Débords d'about (marches finales, bouts de rambarde dessinés AU-DELÀ des
  // pieds) : INTÉGRÉS au déroulé — dessinés hors [a..b] à la profondeur du
  // bout, ils recouvraient l'habitant qui marchait dessus (« derrière le
  // pont », vu par Raph à l'atterrissage NE) ; en déroulé négatif/étendu,
  // chaque tranche d'about reprend sa vraie profondeur locale.
  const ovHi = Math.abs(sp.over[0] - sp.footHi[0]);
  const ovLo = Math.abs(sp.over[1] - sp.footLo[0]);
  // Fenêtre de travée = le plateau du MÊME sprite, entre les deux culées.
  const midLen = Math.abs(sp.footLo[0] - sp.footHi[0]) - sp.capHi - sp.capLo;
  const midX0 = sp.footHi[0] + sp.sgn * sp.capHi;   // bord de fenêtre côté a
  const pieces = [];
  if (midLen < 8 || D <= sp.capHi + sp.capLo) {
    // Pont court (fleuve rabattu aux ères hautes) : plus de travée, les deux
    // culées se partagent le déroulé au prorata — chacune garde SA rampe.
    const cut = D * sp.capHi / (sp.capHi + sp.capLo);
    pieces.push(['hi', -ovHi, cut], ['lo', cut, D + ovLo]);
  } else {
    pieces.push(['hi', -ovHi, sp.capHi]);
    const dEnd = D - sp.capLo;
    for (let sd = sp.capHi; sd < dEnd - 0.01; sd += midLen) {
      pieces.push(['mid', sd, Math.min(sd + midLen, dEnd)]);   // dernière tronquée
    }
    pieces.push(['lo', dEnd, D + ovLo]);
  }
  for (const [part, sd0, sd1] of pieces) {
    let ax, al, xAt;                                 // xAt(e) = x source du déroulé e
    if (part === 'hi') {
      ax = sp.footHi[0]; al = g.a;
      xAt = (e) => sp.footHi[0] + sp.sgn * e;
    } else if (part === 'lo') {
      // Ancrée sur footLo ↔ b : la culée AVAL se pose depuis SON pied, quelle
      // que soit la compression — le raccord côté travée retombe juste (même
      // position monde des deux côtés de la couture).
      ax = sp.footLo[0]; al = g.b;
      xAt = (e) => sp.footLo[0] - sp.sgn * (D - e);
    } else {
      // TRAVÉE : la fenêtre plate, re-basée à chaque répétition.
      ax = midX0; al = g.a + sd0 * kpx;
      xAt = (e) => midX0 + sp.sgn * (e - sd0);
    }
    let e0 = sd0;
    // Sous-découpe au SIXIÈME de tuile : le tablier étant SURÉLEVÉ, la tranche
    // suivante recouvre un traverseur dès qu'il est à plus de (wD + t_off) de
    // la couture — et t_off est NÉGATIF pour la file AMONT (−0,09 tuile − le
    // jitter personnel) : la borne réelle est wD − 5 px ≈ 6,5 px monde. T/3
    // (10,7 px) laissait une bande de disparition pour cette file (vu par
    // Raph sur la rampe) ; T/6 (5,3 px) passe sous la borne pour les DEUX
    // files, et l'habitant reste devant le garde-corps de sa propre tranche.
    const step = T / 6;
    while (e0 < sd1 - 0.01) {
      const l0 = g.a + e0 * kpx;
      const e1 = Math.min(sd1, ((Math.floor(l0 / step + 1e-6) + 1) * step - g.a) / kpx);
      const xa = xAt(e0), xb = xAt(e1);
      let sx = Math.round(Math.min(xa, xb)), sx1 = Math.round(Math.max(xa, xb));
      // (Les débords d'about sont couverts par le déroulé étendu ±ov ci-dessus,
      // avec une profondeur locale par tranche. Le CHEVAUCHEMENT capOver a été
      // RETIRÉ : la longueur du pont étant quantifiée au pas de la travée
      // (bridgeGeoms), toutes les jonctions sont à contenu contigu — un rect
      // débordant y REPEIGNAIT une phase différente par-dessus la couture
      // propre, la « zone coupée » vue par Raph.)
      if (sx1 <= sx) { e0 = e1; continue; }
      const l1 = g.a + e1 * kpx;
      const gx = g.vertical ? Math.floor(g.c / T) : Math.floor((l0 + l1) / 2 / T);
      const gy = g.vertical ? Math.floor((l0 + l1) / 2 / T) : Math.floor(g.c / T);
      // Marge d'une cellule : l'about et la hauteur du sprite débordent la tuile.
      if (gx >= bounds.gx0 - 1 && gx <= bounds.gx1 + 1 && gy >= bounds.gy0 - 1 && gy <= bounds.gy1 + 1) {
        items.push({ d: g.D(l0, g.c - g.wD), kind: 'bridgeSeg', si, part: 'sprite', sx, sw: sx1 - sx, ax, al });
        // GARDE-CORPS AVAL par-dessus les traverseurs : duplicata (calque
        // -rail) redessiné à la profondeur du bord AVAL de la tranche — les
        // habitants (t ≤ axe + 0,16 tuile) se trient entre les deux, donc
        // derrière la lisse du bas et devant celle du haut (retour Raph ;
        // même geste que le parapet 'down' du procédural).
        if (g._sprite.railArt) {
          items.push({
            d: g.D((l0 + l1) / 2, g.c + g.wD), kind: 'bridgeSeg', si,
            part: 'sprite', rail: true, sx, sw: sx1 - sx, ax, al,
          });
        }
      }
      e0 = e1;
    }
  }
}

export function pushIsoBridgeItems(items, bounds) {
  if (!isoBridge3dFlag.on) return;
  const L = CM.layout; if (!L) return;
  const geos = bridgeGeoms(); if (!geos) return;
  const T = CM.TILE;
  const st = styleFor(L);
  for (let si = 0; si < geos.length; si += 1) {
    const g = geos[si];
    // Mode SPRITE (stade bois) : rafraîchi CHAQUE frame — l'art peut finir de
    // décoder en cours de partie, et bridgeLiftScreen lit ce champ.
    g._sprite = spanSprite(g, st);
    if (g._sprite) { pushSpriteItems(items, bounds, g, si); continue; }
    for (let li = Math.floor(g.a / T); li * T < g.b; li += 1) {
      const l0 = Math.max(g.a, li * T), l1 = Math.min(g.b, (li + 1) * T);
      if (l1 - l0 < 1) continue;
      const lMid = (l0 + l1) / 2;
      for (const part of ['deck', 'up', 'down']) {
        const t = part === 'up' ? g.c - g.wD : part === 'down' ? g.c + g.wD : g.c;
        const gx = g.vertical ? Math.floor(t / T) : li;
        const gy = g.vertical ? li : Math.floor(t / T);
        if (gx < bounds.gx0 || gx > bounds.gx1 || gy < bounds.gy0 || gy > bounds.gy1) continue;
        const d = part === 'deck' ? g.D(l0, g.c - g.wD) : g.D(lMid, t);
        items.push({ d, kind: 'bridgeSeg', si, l0, l1, part });
      }
    }
  }
}

export function drawIsoBridgeSeg(ctx, it, now) {
  const geos = bridgeGeoms(); if (!geos || !geos[it.si]) return;
  const L = CM.layout; if (!L) return;
  const g = geos[it.si], st = styleFor(L), z = CM.cam.zoom, T = CM.TILE;
  const lod = CM.lodActive;
  _drew.segs += 1;
  if (it.part === 'sprite') {
    // Tranche du PONT SPRITE : rect vertical du PNG posé par son ancre — le
    // pixel source (ax, ySol(ax)) tombe sur P(al, c). ySol se déduit de footHi
    // et de la pente ±0,5 (sprite redressé) ; le dos d'âne est DANS le dessin.
    const spr = g._sprite; if (!spr) return;
    if (it.rail && !spr.railArt) return;
    const sp = spr.spec, img = (it.rail ? spr.railArt : spr.art).img;
    const s = (T / bridgeTune.spriteTilePx) * z;
    // dt : offset TRANSVERSE (px source, + vers l aval) — centre le DESSIN
    // sur l axe logique de la route (retour Raph « centrer la route sur le
    // pont ») ; la ligne de marche et le lift restent sur l axe, c est le
    // sprite qui vient sous leurs pieds.
    const E = g.P(it.al, g.c + (sp.dt || 0) * (T / bridgeTune.spriteTilePx));
    // ySol de l'ancre : LA droite d'axe-sol du sprite (pente ±0,5 depuis
    // footHi) — culées ET travée, une seule référence : les raccords ne
    // peuvent plus dériver (le cran du module séparé venait de son ancre à lui).
    const ySol = sp.footHi[1] + Math.abs(it.ax - sp.footHi[0]) * 0.5;
    // Bords écran ARRONDIS chacun par la même formule que chez le voisin : deux
    // rects adjacents partagent leur frontière au pixel ENTIER. En float, les
    // bords AA de drawImage se chevauchaient en alpha partiel → fente d'eau
    // semi-transparente à chaque couture (vu à la capture).
    const x0 = Math.round(E.x - (it.ax - it.sx) * s);
    const x1 = Math.round(E.x - (it.ax - (it.sx + it.sw)) * s);
    const dy = Math.round(E.y - ySol * s + bridgeTune.spriteDy * z);
    if (x1 <= x0) return;
    const ih = img.naturalHeight || img.height;
    const prevSm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, it.sx, 0, it.sw, ih, x0, dy, x1 - x0, Math.round(ih * s));
    ctx.imageSmoothingEnabled = prevSm;
    return;
  }
  if (it.part === 'deck') {
    drawDeckSeg(ctx, g, st, it.l0, it.l1, z, lod);
    return;
  }
  if (it.part === 'up') {
    if (!lod) drawRailRun(ctx, g, st, g.c - g.wD, it.l0, it.l1, z);
    return;
  }
  const tAval = g.c + g.wD;
  // Écart max entre palées voisines pour les relier (arche, croix) : au-delà,
  // c'est un TROU du filtre « pied sur l'eau » (berge en biais) — on ne jette
  // pas une travée par-dessus.
  // ⚠ Doit couvrir la PASSE NAVIGABLE, dont les palées ont été retirées : sans
  // ça, l'ouverture du chenal laissait un TROU dans la face au lieu de la grande
  // arche centrale qu'on veut y voir.
  const linkMax = Math.max(st.pileEvery * 1.7, bridgeTune.passHalf * 2 + st.pileEvery) * T;
  // 1) FACE d'épaisseur (tronçon mouillé ∩ segment) : 2 assises + ombre de
  // contact. Sur la berge le tablier affleure le sol → pas de face au sec.
  const fA = Math.max(it.l0, Math.max(g.a, g.wetA - T * 0.10));
  const fB = Math.min(it.l1, Math.min(g.b, g.wetB + T * 0.10));
  const fh = st.faceH * z;
  if (fB > fA) {
    fillDrop(ctx, g, fA, fB, tAval, 0, fh, rgb(st.faceTop), rgb(st.faceBot));
    // Arches maçonnées : arcs sombres découpés dans la face entre palées.
    // CLIPPÉES à la tranche du segment : un arc à cheval sur deux segments est
    // peint moitié par moitié (géométrie globale identique → raccord invisible),
    // sans que la face du segment suivant ne recouvre la moitié déjà peinte.
    if (bridgeTune.arches && !lod && st.kind === 'stone' && st.arch) {
      ctx.save();
      ctx.beginPath();
      const c0 = g.P(fA, tAval), c1 = g.P(fB, tAval);
      ctx.moveTo(c0.x, c0.y - 1); ctx.lineTo(c1.x, c1.y - 1);
      ctx.lineTo(c1.x, c1.y + fh + 1); ctx.lineTo(c0.x, c0.y + fh + 1);
      ctx.closePath(); ctx.clip();
      ctx.fillStyle = rgb(st.arch);
      for (let i = 0; i < g.piles.length - 1; i += 1) {
        // Piédroits fins, arc OUVERT (contrôle au-dessus du haut de face,
        // sommet ~70 % de l'épaisseur — l'ancien 0.25·fh donnait un arc plat
        // invisible à la capture) ; le clip borne au ruban de face.
        if (g.piles[i + 1].l - g.piles[i].l > linkMax) continue;
        const la = g.piles[i].l + st.pileW * 0.6, lb = g.piles[i + 1].l - st.pileW * 0.6;
        if (lb - la < T * 0.3) continue;
        if (lb < it.l0 - T || la > it.l1 + T) continue;   // hors tranche (large)
        const pa = g.P(la, tAval), pb = g.P(lb, tAval);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y + fh);
        ctx.quadraticCurveTo((pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - fh * 0.40, pb.x, pb.y + fh);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    // Liseré d'ombre : le platelage porte sur la face.
    const pa = g.P(fA, tAval), pb = g.P(fB, tAval);
    ctx.strokeStyle = 'rgba(20,14,8,0.35)';
    ctx.lineWidth = Math.max(1, z * 0.7);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  if (!lod) {
    // 2) PILES du segment (positions précalculées de la géo, pied sur l'eau)
    // + eau VIVANTE au pied + braces. Une pile pile sur la couture appartient
    // au segment de GAUCHE (< l1-0.25).
    const pw = Math.max(1, st.pileW * z), drop = (st.faceH + st.pileH) * z;
    const inSeg = (l) => l >= it.l0 - 0.25 && (l < it.l1 - 0.25 || (it.l1 >= g.b - 0.5 && l <= it.l1 + 0.25));
    const tsec = (now || 0) / 1000;
    for (const pl of g.piles) {
      if (!inSeg(pl.l)) continue;
      const p = g.P(pl.l, tAval);
      const x = Math.round(p.x - pw / 2);
      ctx.fillStyle = rgb(st.pileDark);
      ctx.fillRect(x, Math.round(p.y), Math.ceil(pw), Math.round(drop));
      ctx.fillStyle = rgb(st.pile);
      ctx.fillRect(x, Math.round(p.y), Math.max(1, Math.round(pw * 0.5)), Math.round(drop));
      if (bridgeTune.ripple) {
        // EAU VIVANTE au pied (retour Raph « effet d'eau sur les pontons ») :
        // anneau de remous qui RESPIRE (rayon + alpha pulsés, phase stable par
        // pile) + écume accrochée qui scintille — mêmes courts traits
        // horizontaux écran que les reflets du fleuve (waterRipple).
        const ph = pl.ph * Math.PI * 2;
        const pulse = Math.sin(tsec * 2.2 + ph);
        const fy = p.y + drop;
        ctx.strokeStyle = `rgba(206,228,220,${(0.30 + 0.13 * pulse).toFixed(2)})`;
        ctx.lineWidth = Math.max(1, z * 0.9);
        ctx.beginPath();
        ctx.ellipse(p.x, fy, pw * (1.5 + 0.28 * pulse), Math.max(1.2, pw * 0.62) * (1 + 0.22 * pulse), 0, 0, Math.PI * 2);
        ctx.stroke();
        const rw = Math.max(2, Math.round(T * z * 0.16));
        const rh = Math.max(1, Math.round(z));
        for (let k = 0; k < 3; k += 1) {
          const tw = Math.sin(tsec * 1.7 + ph + k * 2.1);
          if (tw < 0.05) continue;
          const hx = cmHash('bfoam:' + g.sp.gx0 + ':' + Math.round(pl.l) + ':' + k);
          const ox = ((hx % 100) / 100 - 0.5) * pw * 4.4;
          const oy = (((hx >> 7) % 100) / 100 - 0.2) * pw * 1.3;
          ctx.fillStyle = `rgba(214,234,226,${(0.28 * tw).toFixed(2)})`;
          ctx.fillRect(Math.round(p.x + ox - rw / 2), Math.round(fy + oy), rw, rh);
        }
      }
    }
    // Contreventement en X (bois) : chaque croix appartient au segment de sa
    // palée GAUCHE ; elle déborde sous le bord (zone d'eau) sans rien recouvrir,
    // et la palée droite (segment suivant) vient coiffer son extrémité.
    if (bridgeTune.brace && st.kind === 'wood' && g.piles.length > 1) {
      ctx.strokeStyle = rgb(st.pileDark, 1.05);
      ctx.lineWidth = Math.max(1, z * 0.8);
      for (let i = 0; i < g.piles.length - 1; i += 1) {
        if (!inSeg(g.piles[i].l)) continue;
        if (g.piles[i + 1].l - g.piles[i].l > linkMax) continue;
        const pa = g.P(g.piles[i].l, tAval), pb = g.P(g.piles[i + 1].l, tAval);
        const y0 = st.faceH * z, y1 = drop - 1.5 * z;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y + y0); ctx.lineTo(pb.x, pb.y + y1);
        ctx.moveTo(pb.x, pb.y + y0); ctx.lineTo(pa.x, pa.y + y1);
        ctx.stroke();
      }
    }
    // 3) PARAPET aval : par-dessus la face, devant les jambes des traverseurs.
    drawRailRun(ctx, g, st, tAval, it.l0, it.l1, z);
    // 4) SUSPENSION : pylônes, câble porteur, suspentes — dessinés APRÈS le
    // parapet, ils passent devant lui comme dans la réalité.
    if (st.suspended && !lod) drawSuspension(ctx, g, st, it, z);
  }
}

// ── Suspension : deux pylônes, un câble, des suspentes ──────────────────────
// Tout est tracé côté AVAL, dans le même ruban vertical écran que la face et le
// parapet : la verticalité du jeu est toujours de l'écran, jamais du monde.
//
// Le câble suit une PARABOLE (approximation classique de la caténaire, et la
// seule qui se lise à cette taille) entre les deux têtes de pylône. La flèche
// vaut `sag` × la portée : c'est ce ventre qui dit « suspendu » d'un coup d'œil,
// bien plus qu'un pylône isolé.
function drawSuspension(ctx, g, st, it, z) {
  const tw = g.towers;
  if (!tw || tw.length < 2) return;
  const tAval = g.c + g.wD;
  const [lA, lB] = tw;
  const portee = lB - lA;
  if (!(portee > 0)) return;
  const topH = st.towerH * z;                       // hauteur au-dessus du tablier
  const sag = st.sag * portee;                      // flèche, en px monde longitudinal
  // Hauteur du câble au-dessus du tablier, à la position l. 0 aux pylônes,
  // -sag au milieu (on descend vers le tablier).
  const yCable = (l) => {
    const u = (l - lA) / portee;                    // 0..1
    const v = 4 * u * (1 - u);                      // parabole, 1 au milieu
    return -topH + v * Math.min(topH * 0.92, sag * z * 0.5);
  };
  const inSeg = (l) => l >= it.l0 - 1 && l <= it.l1 + 1;

  // 1) SUSPENTES d'abord : elles passent DERRIÈRE le câble et les pylônes.
  ctx.strokeStyle = rgb(st.cable, 1.08);
  ctx.lineWidth = Math.max(1, z * 0.55);
  ctx.beginPath();
  const pas = Math.max(1, st.hangEvery * (CM.TILE || 32));
  for (let l = lA + pas; l < lB - pas * 0.5; l += pas) {
    if (!inSeg(l)) continue;
    const p = g.P(l, tAval);
    const yTop = p.y + yCable(l);
    if (yTop >= p.y - 2) continue;                  // câble déjà sur le tablier
    ctx.moveTo(Math.round(p.x) + 0.5, yTop);
    ctx.lineTo(Math.round(p.x) + 0.5, p.y);
  }
  ctx.stroke();

  // 2) CÂBLE PORTEUR, en deux passes : un trait sombre épais puis un filet clair
  // au-dessus. Un câble d'une seule teinte disparaît sur un ciel de ville ; le
  // liseré lui donne son galbe.
  for (const [col, lw, dy] of [[st.cable, 1.5, 0], [st.cableLite, 0.8, -0.8]]) {
    ctx.strokeStyle = rgb(col);
    ctx.lineWidth = Math.max(1, z * lw);
    ctx.beginPath();
    let first = true;
    for (let l = lA; l <= lB; l += Math.max(2, portee / 26)) {
      const p = g.P(l, tAval);
      const y = p.y + yCable(l) + dy * z;
      if (first) { ctx.moveTo(p.x, y); first = false; } else ctx.lineTo(p.x, y);
    }
    const pEnd = g.P(lB, tAval);
    ctx.lineTo(pEnd.x, pEnd.y + yCable(lB) + dy * z);
    ctx.stroke();
  }

  // 3) PYLÔNES par-dessus tout : ils tiennent le câble, ils doivent le couper.
  const pw = Math.max(2, st.towerW * z);
  for (const l of tw) {
    if (!inSeg(l)) continue;
    const p = g.P(l, tAval);
    const x = Math.round(p.x - pw / 2);
    const yTop = Math.round(p.y - topH);
    const h = Math.round(topH + st.faceH * z);
    ctx.fillStyle = rgb(st.towerDark);
    ctx.fillRect(x, yTop, Math.ceil(pw), h);
    ctx.fillStyle = rgb(st.tower);
    ctx.fillRect(x, yTop, Math.max(1, Math.round(pw * 0.45)), h);
    // Traverse sous la tête : sans elle le pylône n'est qu'un poteau.
    const bw = Math.ceil(pw * 2.1);
    ctx.fillStyle = rgb(st.towerDark);
    ctx.fillRect(Math.round(p.x - bw / 2), yTop + Math.round(topH * 0.22), bw, Math.max(1, Math.round(z * 1.4)));
  }
}

// ── LUMIÈRES de pont (par-dessus le voile de nuit) ───────────────────────────
// Appelée après drawIsoNight : point chaud + halo additif à chaque lanterne
// (boîtiers posés par drawRailRun), et REFLET dans l'eau côté aval — colonne de
// courts traits horizontaux qui miroitent, la grammaire des reflets du fleuve.
export function drawIsoBridgeNight(now) {
  if (!isoBridge3dFlag.on) return;
  const nf = CM.nightF || 0;
  if (nf < 0.15 || CM.lodActive) return;
  const L = CM.layout; if (!L) return;
  const geos = bridgeGeoms(); if (!geos) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const st = styleFor(L);
  const glow = st.glow || '255,199,120';
  const tsec = (now || 0) / 1000;
  _drew.night += 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const g of geos) {
    if (!spanVisible(g, z)) continue;
    // Span SPRITÉ (stade bois) : pont primitif SANS lanternes — les boîtiers
    // procéduraux (drawRailRun) ne sont plus dessinés, un halo orphelin
    // flotterait dans le noir.
    if (g._sprite) continue;
    for (const la of g.lamps) {
      const hh = (st.railH * (la.head ? 1.3 : 1) + 2.6) * z;   // sommet du mât (cf. boîtier)
      const flick = 0.86 + 0.14 * Math.sin(tsec * 7.3 + la.l);
      for (const side of [g.c - g.wD, g.c + g.wD]) {
        const p = g.P(la.l, side);
        const ly = p.y - hh - Math.max(2, 1.8 * z) * 0.5;
        // point chaud + halo ambiant
        ctx.fillStyle = `rgba(255,236,190,${(0.9 * nf * flick).toFixed(2)})`;
        ctx.fillRect(Math.round(p.x - z * 0.6), Math.round(ly - z * 0.6), Math.max(1, Math.round(z * 1.2)), Math.max(1, Math.round(z * 1.2)));
        const gr = ctx.createRadialGradient(p.x, ly, 0, p.x, ly, Math.max(5, T * z * 0.55));
        gr.addColorStop(0, `rgba(${glow},${(0.34 * nf * flick).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${glow},0)`);
        ctx.fillStyle = gr;
        const rr = Math.max(5, T * z * 0.55);
        ctx.fillRect(p.x - rr, ly - rr, rr * 2, rr * 2);
      }
      // REFLET dans l'eau, sous le bord AVAL (seulement si la lanterne
      // surplombe l'eau — celles des têtes de pont sont sur la berge). La
      // zone est déjà mangée par l'ombre du tablier + le voile de nuit : la
      // colonne doit être FRANCHE (1re version à 0.20 invisible à la capture) —
      // traits horizontaux qui rétrécissent en descendant et miroitent.
      if (la.wet) {
        const q = g.P(la.l, g.c + g.wD);
        const y0 = q.y + st.faceH * z + 2 * z;
        for (let k = 0; k < 6; k += 1) {
          const sw = Math.sin(tsec * 2.6 + la.l * 0.13 + k * 1.7);
          const w = Math.max(2, (8.5 - k * 1.2) * z * (0.8 + 0.2 * sw));
          ctx.fillStyle = `rgba(${glow},${(nf * (0.40 - k * 0.052) * (0.72 + 0.28 * sw)).toFixed(3)})`;
          ctx.fillRect(Math.round(q.x - w / 2 + sw * z * 1.4), Math.round(y0 + k * 3.1 * z), Math.round(w), Math.max(1, Math.round(z * 1.2)));
        }
      }
    }
  }
  ctx.restore();
}
