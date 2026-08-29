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
// Les piétons/attelages traversent dans la ZONE DE PASSAGE publiée par
// bridgeWalkBand (milieu + demi-largeur du platelage DESSINÉ) : jamais dans
// les parapets, et leur profondeur les place entre parapet amont et parapet
// aval de leur cellule. Cette bande est la source de vérité commune des
// agents, du dos d'âne et de la profondeur de tri du tablier.
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
// MATIÈRE PAR BANDE D'ÈRE. Rapatriée de pixelBridge.js le 2026-08-23 (Q2) : elle y
// était partagée avec le pont plat, qui n'existe plus. Fonction pure, sans
// dépendance, et ce fichier est désormais son seul consommateur — la ramener ici
// évite de garder un module de 163 lignes vivant pour huit.
// La bascule bois→pierre coïncide avec le passage 1→2 voies (bande 2) : le bois est
// le seul tablier à une voie.
//   0-1 Feu/Bois → bois · 2-3 Pierre/Couronne → pierre · 4-5 → fer
//   6 → béton            · 7-9 cosmiques → énergie
export function bridgeEraForBand(band) {
  const b = band | 0;
  if (b <= 1) return 'bois';
  if (b <= 3) return 'pierre';
  if (b <= 5) return 'fer';
  if (b === 6) return 'beton';
  return 'energie';
}
// ⚠ QUATRE IMPORTS ONT VÉCU ICI — `ROAD_E`/`ROAD_W`, `ISO_X`/`ISO_Y`, `fillWorldQuad`
// et `roadTone`/`ROAD_BAND`. Un commentaire affirmait qu'ils servaient LE TABLIER ;
// c'était faux, ils servaient le chemin legacy (`drawIsoBridges` et ses aides), et
// le tablier `drawIsoBridgeSeg` ne touche à aucun des quatre. Partis avec Q2 le
// 2026-08-23 — levés par le lint, pas par la relecture du commentaire.
// ⚠ PAS d'import de `rgb` : ce fichier en porte déjà une copie IDENTIQUE au
// caractère près (cf. plus bas). Le tablier utilise donc la locale — rien ne change.
// La déduplication est un chantier à part : ce n'est pas un déplacement pur.


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
  // ── ZONE DE PASSAGE sur le tablier (piétons & attelages) ───────────────────
  // Le tablier DESSINÉ n'est pas centré sur l'axe logique de la voie : le pied
  // pointé (footHi) tombe au bord AVAL de la culée, si bien que tout le dessin
  // s'étale vers l'AMONT de l'axe. Les habitants, eux, marchaient sur l'axe à
  // ±0,09 tuile — donc collés au garde-corps du bas, en file indienne (« ils
  // sont tous sur les barrières du bas », Raph 2026-08-04).
  // La bande de passage est donc décrite PAR SPRITE (pedC/pedHalf, px SOURCE
  // transverses depuis l'ancre, même repère et même signe que `dt`) et non
  // plus déduite de l'axe : cf. bridgeWalkBand, seule source de vérité pour
  // les agents, le dos d'âne et la profondeur du tri.
  pedMargin: 0.10,   // retrait de chaque bord du tablier (fraction de tuile) — demi-corps
  pedSide: 0.42,     // biais « à droite du sens de marche » (fraction de la demi-bande)
  pedSpread: 0.62,   // étalement PERSONNEL dans la bande (fraction de la demi-bande)
  // ── RÈGLE DE DÉSIGNATION : « jusqu'où descend le dessin » ──────────────────
  // Ne blitte le sprite que jusqu'à N px SOURCE sous la ligne d'axe (chaussée).
  // C'est un OUTIL DE POINTAGE, pas un réglage de production : il sert à
  // trouver EN JEU, à la molette, où couper le dessin — puis on grave le chiffre
  // dans `trimUnder` (scripts/prepBridgeIso.mjs) et on remet null. Le laisser
  // actif coûterait un blit tronqué par tranche pour un résultat déjà bakable.
  // Console : __bridgeTune.cutBelow = 22  ·  = null pour revenir au dessin entier.
  cutBelow: null,
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
        dryRuns: g.dryRuns, tDn: g.tDn,      // enterrement (cf. buryClip)
      })),
    };
  };
  // Sonde du dos d'âne : __bridgeLift(wx, wy) → px écran (0 hors pont sprite).
  window.__bridgeLift = (wx, wy) => bridgeLiftScreen(wx, wy);
  // Sonde de la ZONE DE PASSAGE : __bridgeWalk(wx, wy) → { axis, half } en px
  // monde (null hors pont). Calibrage : poser des marqueurs à axis ± half et
  // vérifier qu'ils tombent sur le platelage, garde-corps exclus.
  window.__bridgeWalk = (wx, wy) => bridgeWalkBand(wx, wy);
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
    // Ce style a un PONT SPRITE (cf. en-tête) : clé de la famille dans
    // BRIDGE_SPRITES. Le marqueur vit sur le STYLE (pas sur le décodage de
    // l'art) : la géométrie (landing élargi, quantification) ne doit pas
    // sauter quand les PNG finissent de charger.
    spriteKey: 'bois',
  },
  // PIERRE (bandes 2-3) : base = IMAGE DE RÉFÉRENCE 400 px (mode map_object,
  // canvas libre) détourée et redressée — c'est le seul format qui donne le
  // ratio longueur/hauteur (~10) d'un pont LONG et BAS ; le générateur de
  // sprites, en canvas carré, plafonnait à ~2,7 et sortait des ouvrages
  // monumentaux. tilePx 37 (au lieu de 28) : cette image est plus dense.
  pierre: {
    deck: [148, 142, 128], plankPitch: 15, plankVar: 0.05, joint: 'rgba(30,26,20,0.16)',
    stringer: [186, 178, 156],          // margelle claire au bord des dalles
    faceH: 9, faceTop: [122, 114, 98], faceBot: [82, 76, 64],
    pileH: 8, pileW: 5.5, pileEvery: 1.6, pile: [112, 106, 92], pileDark: [78, 72, 60],
    railH: 7, railPostEvery: 0.5, railPostW: 2.5, rail: [140, 132, 116], railTop: [190, 182, 160],
    kind: 'stone', arch: [46, 44, 44],
    spriteKey: 'pierre',
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
    // Sprité depuis le 2026-08-28 : le procédural ci-dessus reste le REPLI
    // (PNG absent, __bridgeSprite(false)). `suspended` n'est plus lu par le
    // rendu de cette bande, seulement par bridgeIsSuspended / la passe.
    spriteKey: 'fer',
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
    spriteKey: 'beton',
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
    spriteKey: 'energie',
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
// Indexé PAR MATIÈRE (clé `spriteKey` du style, cf. STYLES / bridgeEraForBand)
// puis par axe : une matière sans entrée ici retombe sur le procédural, ce qui
// permet de livrer les stades un par un.
const BRIDGE_SPRITES = {
  bois: {
    ne: {
      key: 'bridge-bois-ne', sgn: -1,          // x source DÉCROÎT quand l croît
      footHi: [156, 83], footLo: [37, 142.5],
      over: [167, 4], capHi: 33, capLo: 42,
      // dt : le dessin (about surtout) est décalé de ~4-5 px vers l aval par
      // rapport à son axe — recentré sous la route et la ligne de marche
      // (calibré au marqueur, retour Raph « centre la route sur le pont »).
      dt: -4,
      // ZONE DE PASSAGE (cf. bridgeTune.pedMargin) : centre et demi-largeur du
      // PLATELAGE DESSINÉ, px source transverses depuis l'ancre. Mesurés au
      // harnais de marqueurs (une pastille tous les 4 px monde posée sur le
      // tablier, lift compris) : le platelage court de −31 à +5 px source —
      // il est donc ENTIÈREMENT en amont de l'axe de voie, le pied pointé
      // tombant sur son bord aval. C'est ce décalage qui plaquait la file
      // contre le garde-corps du bas.
      pedC: -13, pedHalf: 18,
    },
    nw: {
      key: 'bridge-bois-nw', sgn: +1,
      footHi: [14, 78], footLo: [143, 142.5],
      over: [3, 166], capHi: 46, capLo: 53,
      // Même biais supposé que le ne (jamais vu en jeu — à recalibrer au
      // premier pont est-ouest croisé : __bridgeSpecs.bois.nw.dt en live).
      dt: -4,
      pedC: -13, pedHalf: 18,
    },
  },
  // PIERRE (bandes 2-3) : même moule, parapets pleins. Pas de calque -rail
  // pour l'instant (le parapet plein masque déjà par sa hauteur dessinée) —
  // à ajouter si un traverseur passe visiblement DEVANT le muret aval.
  // PIERRE (bandes 2-3) : base = IMAGE DE RÉFÉRENCE 400 px (mode map_object,
  // canvas LIBRE), détourée puis redressée. C'est le seul format qui donne le
  // ratio longueur/hauteur (~10) d'un pont LONG et BAS : le générateur de
  // sprites, contraint à un canvas carré, plafonnait à ~2,7 et ne sortait que
  // des ouvrages monumentaux à rampes raides.
  // `tilePx` 37 (au lieu de 28) : cette image est plus dense — c'est ce
  // réglage qui met le tablier à ~1 tuile de haut, comme le pont de bois.
  pierre: {
    ne: {
      key: 'bridge-pierre-ne', sgn: -1,
      // ⚠ footHi.y DESCENDU de la hauteur du tablier (49 → 75) et humpH = 0 :
      // le dessin n'a pas de rampes (tablier à 26 px du sol d'un bout à
      // l'autre), il se raccordait donc à la route par une MARCHE. Posé au
      // niveau du sol, le tablier affleure la chaussée et les arches plongent
      // dans l'eau — ce que fait un vrai pont.
      footHi: [378, 23], footLo: [8, 208],
      over: [383, 5], capHi: 252, capLo: 31,
      tilePx: 37, humpH: 0, dt: 0, pedC: -2, pedHalf: 14,
      // ENTERREMENT (2026-08-22, retour Raph « un pont plat qui rejoigne les
      // deux bords ») : px SOURCE sous la ligne d'axe où passe le BORD AVAL du
      // tablier — le plan du sol du dessin. Mesuré au liseré sombre entre la
      // face extérieure du parapet aval (+18..+24) et la face du caisson
      // (+25 et au-delà) : cf. scan des contours, stable à ±1 px sur les
      // 400 colonnes. Tout ce qui est dessiné plus bas (caisson, arches,
      // piles) n'existe qu'au-dessus de l'eau : sur la berge il est caché,
      // le tablier affleure la route, plus de marche. cf. buryClip.
      bury: 25,
    },
    nw: {
      key: 'bridge-pierre-nw', sgn: +1,
      footHi: [21, 23], footLo: [391, 208],
      over: [17, 395], capHi: 253, capLo: 30,
      tilePx: 37, humpH: 0, dt: 0, pedC: -2, pedHalf: 14,
      bury: 25,   // miroir du ne : même liseré mesuré (+24/+25)
    },
  },
  // ── FER (4-5) · BÉTON (6) · ÉNERGIE (7-9) — 2026-08-28 ─────────────────────
  // Même moule que la pierre : image de référence 400 px (canvas libre), pente
  // redressée à ±0,5, fenêtre répétée, `humpH: 0` + `bury` (tablier POSÉ au
  // plan du sol, tout ce qui pend dessous n'existe qu'au-dessus de l'eau).
  //
  // ⚠ LA CONTRAINTE DES ÈRES HAUTES EST TENUE AUTREMENT. Depuis `baf2406` ces
  // trois matières étaient des SUSPENDUS procéduraux, non par goût mais pour
  // vider le chenal (un cargo fait 2,24 tuiles, les palées tombaient tous les
  // 1,5 — cf. bd3c5bb). Le sprite n'a plus une seule palée : `trimUnder` les a
  // coupées au dessin (prepBridgeIso). `STYLES.suspended` reste vrai — c'est
  // lui que lisent bridgeIsSuspended et la passe navigable — mais il ne pilote
  // plus le rendu de ces bandes, qui passe par le sprite.
  //
  // ⚠⚠ ET L'EAU PASSE DESSOUS. Le générateur peint l'OMBRE du tablier SUR SON
  // EAU ; connexe à l'ouvrage, elle survivait au détourage et sortait en DALLE
  // PLEINE sous le pont — le fleuve disparaissait dessous (retour Raph). C'est
  // `trimUnder` qui l'ôte, calé au ras du CORPS du dessin et non au pied des
  // palées : sous le tablier il ne reste que sa propre épaisseur, et le fleuve
  // se voit d'une berge à l'autre.
  //
  // footHi.y = ligne de sol imprimée par le prep MOINS la hauteur du tablier
  // (43 / 40 / 37 px, mesurée à la plage unie de la chaussée colonne par
  // colonne, médiane sur la travée — pas devinée) : le dessin se pose alors
  // chaussée au ras de la route. Contrôle : dans un dump de colonne relatif à
  // CET axe, la chaussée tombe bien à ±9 de 0.
  // ⚠ CES DEUX NOMBRES SONT LIÉS AU PNG, PAS AU DESSIN : remonter `trimUnder`
  // raccourcit le canvas, donc décale la ligne de sol imprimée (46→44 sur le
  // fer). Toute retouche du prep oblige à recoller footHi/footLo/over.
  // footLo.y suit le même abaissement — le moteur ne lit que footLo[0], on le
  // garde cohérent pour la relecture.
  //
  // ⚠ `bury` N'EST PAS la hauteur du tablier — c'est le bas du CORPS de
  // l'ouvrage : sous la chaussée viennent d'abord le chaperon et la face
  // extérieure du parapet aval, qui doivent FILER SUR LA BERGE comme sur la
  // pierre. Enterrer à la hauteur du tablier ne cachait rien du tout — le clip
  // tombait au ras du bas du dessin.
  fer: {
    ne: {
      key: 'bridge-fer-ne', sgn: -1,
      footHi: [364, 1], footLo: [36, 165],
      over: [362, 36], capHi: 121, capLo: 121,
      tilePx: 37, humpH: 0, dt: 0, pedC: 0, pedHalf: 9, bury: 23,
    },
    nw: {
      key: 'bridge-fer-nw', sgn: +1,
      footHi: [35, 1], footLo: [363, 165],
      over: [38, 364], capHi: 121, capLo: 121,
      tilePx: 37, humpH: 0, dt: 0, pedC: 0, pedHalf: 9, bury: 23,
    },
  },
  beton: {
    ne: {
      key: 'bridge-beton-ne', sgn: -1,
      footHi: [348, 12], footLo: [50, 161],
      over: [347, 50], capHi: 105, capLo: 105,
      tilePx: 37, humpH: 0, dt: 0, pedC: 0, pedHalf: 10, bury: 22,
    },
    nw: {
      key: 'bridge-beton-nw', sgn: +1,
      footHi: [51, 12], footLo: [349, 161],
      over: [53, 350], capHi: 105, capLo: 105,
      tilePx: 37, humpH: 0, dt: 0, pedC: 0, pedHalf: 10, bury: 22,
    },
  },
  energie: {
    ne: {
      key: 'bridge-energie-ne', sgn: -1,
      footHi: [348, 15], footLo: [50, 164],
      over: [345, 50], capHi: 111, capLo: 111,
      tilePx: 37, humpH: 0, dt: 0, pedC: 0, pedHalf: 12, bury: 20,
    },
    nw: {
      key: 'bridge-energie-nw', sgn: +1,
      footHi: [51, 15], footLo: [349, 164],
      over: [55, 350], capHi: 111, capLo: 111,
      tilePx: 37, humpH: 0, dt: 0, pedC: 0, pedHalf: 12, bury: 20,
    },
  },
};

// ── BANDE DE PASSAGE d'un span : { axis, half } en px MONDE ──────────────────
// SOURCE UNIQUE de « où l'on marche sur ce pont » : les habitants (agents.js),
// les attelages, le dos d'âne (bridgeLiftScreen) et la profondeur de tri du
// platelage lisent tous cette bande. Avant, chacun repartait de l'axe de voie
// (g.c) et de la demi-emprise géométrique (g.wD) — or le tablier DESSINÉ n'est
// centré ni sur l'un ni sur l'autre (cf. pedC/pedHalf).
// Sans sprite calibré (stades procéduraux, PNG pas encore décodé, matière
// livrée sans mesure) : repli sur l'axe et l'emprise, comportement d'avant.
// ⚠ Chemin CHAUD (bridgeLiftScreen l'appelle par agent et par frame) : on part
// de g._sprite, posé à la frame courante par pushIsoBridgeItems — styleFor et
// le cache d'images ne sont relus que s'il manque encore.
function spanBand(g, st) {
  const T = CM.TILE;
  let spr = g._sprite;
  if (!spr) {
    const stl = st || (CM.layout ? styleFor(CM.layout) : null);
    spr = stl ? spanSprite(g, stl) : null;
  }
  const sp = spr && spr.spec;
  const kpx = T / tilePxOf(sp);   // échelle PAR MATIÈRE (cf. tilePxOf)
  const axis = sp && sp.pedC != null ? g.c + ((sp.dt || 0) + sp.pedC) * kpx : g.c;
  const raw = sp && sp.pedHalf != null ? sp.pedHalf * kpx : g.wD;
  return { axis, half: Math.max(T * 0.05, raw - T * bridgeTune.pedMargin) };
}

// Bande de passage sous un point MONDE, ou null hors pont. Consommée par
// agents.js (ligne de marche des habitants et des attelages) : le test
// longitudinal est LARGE (les cellules d'atterrissage en font partie — la
// convergence lox/loy doit commencer avant d'engager la travée).
export function bridgeWalkBand(wx, wy) {
  const geos = bridgeGeoms();
  if (!geos) return null;
  const T = CM.TILE;
  const st = styleFor(CM.layout);
  for (const g of geos) {
    const l = g.vertical ? wy : wx, t = g.vertical ? wx : wy;
    if (l < g.a - T || l > g.b + T) continue;
    if (Math.abs(t - g.c) > g.wD + T * 2) continue;
    const b = spanBand(g, st);
    return { vertical: g.vertical, axis: b.axis, half: b.half };
  }
  return null;
}

// Échelle du sprite : px SOURCE par tuile monde. Par MATIÈRE (une image de
// référence 400 px n'a pas la même densité qu'un sprite 168 px) — défaut =
// la molette globale.
function tilePxOf(sp) { return (sp && sp.tilePx) || bridgeTune.spriteTilePx; }

// Spec sprite d'un style pour un axe donné (null → chemin procédural).
function spriteSpecFor(st, vertical) {
  const fam = st && st.spriteKey ? BRIDGE_SPRITES[st.spriteKey] : null;
  return fam ? fam[vertical ? 'ne' : 'nw'] : null;
}

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

// ── SILHOUETTE d'un sprite de pont (pour l'ombre portée sur l'eau) ──────────
// Le sprite teinté en noir, une fois pour toutes, dans un canvas hors écran :
// l'ombre épouse alors la forme RÉELLE du dessin (arches comprises) au lieu du
// tablier logique. Sans elle le pont flottait sur l'eau ; avec l'ancienne
// (rectangle du tablier logique) elle sortait décalée à côté de l'ouvrage.
const _silCache = new Map();
function bridgeSilhouette(art, key) {
  let c = _silCache.get(key);
  if (c !== undefined) return c;
  c = null;
  try {
    if (typeof document !== 'undefined' && art && art.img) {
      const w = art.img.naturalWidth || art.img.width;
      const h = art.img.naturalHeight || art.img.height;
      if (w && h) {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(art.img, 0, 0);
        cx.globalCompositeOperation = 'source-in';
        cx.fillStyle = '#000';
        cx.fillRect(0, 0, w, h);
        c = cv;
      }
    }
  } catch { c = null; }          // pas de DOM (tests) : pas d'ombre, tant pis
  _silCache.set(key, c);
  return c;
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
  if (!bridgeTune.sprite) return null;
  const spec = spriteSpecFor(st, g.vertical);
  if (!spec) return null;
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
//
// ⚠⚠ REND DES PX MONDE, ET C'EST LE CHANGEMENT DU 2026-08-23. Cette fonction rendait
// des px ÉCRAN, déjà multipliés par le zoom, et ses quatre consommateurs faisaient
// `sp.y -= …` APRÈS avoir projeté. C'était la plus ancienne des rustines d'altitude de
// ce projet — celle qui a servi de modèle aux suivantes. Depuis que la projection a son
// troisième axe, une altitude se PASSE à `worldToScreen` : le zoom ne regarde plus
// l'appelant, et surtout on ne peut plus oublier de l'appliquer.
export function bridgeLiftWorld(wx, wy) {
  const geos = _geo.list;
  if (!geos) return 0;
  const T = CM.TILE;
  for (const g of geos) {
    if (!g._sprite) continue;
    const l = g.vertical ? wy : wx, t = g.vertical ? wx : wy;
    const sp = g._sprite.spec;
    const kpx = T / tilePxOf(sp);
    // Bornes ÉTENDUES aux débords d'about : les marches dessinées au-delà des
    // pieds font partie du pont (cf. pushSpriteItems) — la montée commence dès
    // le premier pas sur l'about, pas au pied théorique.
    const aExt = g.a - Math.abs(sp.over[0] - sp.footHi[0]) * kpx;
    const bExt = g.b + Math.abs(sp.over[1] - sp.footLo[0]) * kpx;
    // Fenêtre TRANSVERSE = la bande de passage, pas l'axe de voie : le tablier
    // dessiné étant décalé en amont (cf. spanBand), un habitant du bord amont
    // sortait de l'ancienne fenêtre `|t − c| ≤ wD + 0,35` et perdait son lift
    // — il traversait le pont EN DESSOUS. Côté aval la fenêtre se resserre
    // d'autant : les agents de la berge aval ne flottent plus près des culées.
    const bd = spanBand(g);
    if (l < aExt || l > bExt || Math.abs(t - bd.axis) > bd.half + T * 0.35) continue;
    const half = (bExt - aExt) / 2;
    const rHi = Math.min((sp.capHi + Math.abs(sp.over[0] - sp.footHi[0])) * kpx, half);
    const rLo = Math.min((sp.capLo + Math.abs(sp.over[1] - sp.footLo[0])) * kpx, half);
    const f = Math.max(0, Math.min((l - aExt) / rHi, (bExt - l) / rLo, 1));
    // Profil de montée : SMOOTHSTEP par défaut (dos d'âne du bois, la pente
    // s'adoucit aux deux bouts), LINÉAIRE quand le dessin porte de vraies
    // RAMPES droites (pierre) — un smoothstep sur une rampe droite décolle le
    // traverseur du tablier au bas de la pente puis le rattrape brutalement.
    const sm = sp.rampEase === 'linear' ? f : f * f * (3 - 2 * f);
    // humpH PAR MATIÈRE (la pierre porte son tablier bien plus haut que le
    // bois) : hauteur du tablier DESSINÉ au-dessus de la ligne de sol, en px
    // source — mesurée sur le PNG, pas devinée.
    const hump = sp.humpH != null ? sp.humpH : bridgeTune.humpH;
    return sm * hump * kpx;
  }
  return 0;
}

// Le même lift, en px ÉCRAN. ⚠ CONSERVÉ POUR UNE SEULE RAISON : la molette
// `__bridgeLift(wx, wy)` sert à LIRE la hauteur du tablier au point visé, et un
// chiffre d'écran est ce qu'on veut quand on mesure une capture. Aucun peintre ne
// doit s'en servir — un point qui se projette passe son altitude à `worldToScreen`.
export function bridgeLiftScreen(wx, wy) { return bridgeLiftWorld(wx, wy) * CM.cam.zoom; }

// ── Géométrie par span, en repère (l = longitudinal, t = transverse) ─────────
// P(l,t) projette directement en écran ; aval = t croissant (cf. en-tête).
let _geo = { at: '', list: null };
// (exportée pour les tests : dryRuns / tDn de l'enterrement, cf. bridgeBury.test.js)
export function bridgeGeoms() {
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
  const landing = (bridgeTune.sprite && st.spriteKey) ? bridgeTune.spriteLanding : bridgeTune.landing;
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
      if (bridgeTune.sprite && st.spriteKey) {
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
        const spq = spriteSpecFor(st, vertical);
        if (spq) {
          const kpx = T / tilePxOf(spq);
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
    // ── TRONÇONS SECS du bord aval (sprite ENTERRÉ, spec.bury) ──────────────
    // Pour un sprite posé au niveau du sol, tout ce qui pend sous le bord aval
    // du tablier (caisson, arches, piles) n'est visible qu'au-dessus de l'eau :
    // sur la berge il est ENTERRÉ (cf. buryClip). On publie ici les intervalles
    // [l0, l1] où le bord AVAL dessiné (t = tDn) est à sec — un par tête de pont
    // — mesurés sur le ruban CONTINU du fleuve (samples ± hw, la même frange
    // que la parallaxe ci-dessus), parce que c'est cette eau-là que l'œil voit.
    // Sans samples (tests, repli) : les bornes mouillées de l'axe. Un fleuve
    // oblique décale la ligne d'eau du bord aval par rapport à celle de l'axe :
    // c'est précisément pour ça qu'on mesure au bord aval et pas à l'axe.
    const dryRuns = [];
    let tDn = c;
    {
      const spq = (bridgeTune.sprite && st.spriteKey) ? spriteSpecFor(st, vertical) : null;
      if (spq && spq.bury != null) {
        const kpx = T / tilePxOf(spq);
        const aExt = a - Math.abs(spq.over[0] - spq.footHi[0]) * kpx;
        const bExt = b + Math.abs(spq.over[1] - spq.footLo[0]) * kpx;
        tDn = c + ((spq.dt || 0) + spq.bury) * kpx;
        const hasSamples = !!(rv && rv.present && rv.samples && rv.samples.length);
        const wetSamples = (l) => {
          const wx = vertical ? tDn : l, wy = vertical ? l : tDn;
          for (const s of rv.samples) {
            const dx = s.x * T - wx, dy = s.y * T - wy, m = ((s.hw || 0) - 0.05) * T;
            if (m > 0 && dx * dx + dy * dy < m * m) return true;
          }
          return false;
        };
        const wetAxis = (l) => l >= wetA && l <= wetB;
        const scan = (wet) => {
          const step = T / 8;
          let wa = null, wb = null;
          for (let l = aExt; l <= bExt; l += step) if (wet(l)) { wa = l; break; }
          for (let l = bExt; l >= aExt; l -= step) if (wet(l)) { wb = l; break; }
          return wa == null ? null : [wa, wb];
        };
        const w = (hasSamples && scan(wetSamples)) || scan(wetAxis);
        if (w) {
          if (w[0] - aExt > 0.5) dryRuns.push([aExt, w[0]]);
          if (bExt - w[1] > 0.5) dryRuns.push([w[1], bExt]);
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
      sp, vertical, c, wD, a, b, wetA, wetB, lanes, piles, lamps, towers, dryRuns, tDn,
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
  const L = CM.layout; if (!L) return;
  const geos = bridgeGeoms(); if (!geos) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  _drew.under += 1;
  const st = styleFor(L);
  for (const g of geos) {
    if (!spanVisible(g, z)) continue;
    // ⚠ PONT SPRITÉ posé DANS l'eau (piles immergées) : l'ombre du tablier
    // LOGIQUE (g.wD) n'a ni sa largeur ni sa position — elle sortait en dalle
    // sombre à côté de l'ouvrage (retour Raph « le liseré noir n'est pas
    // bon »). On dessine à la place la SILHOUETTE DU DESSIN, décalée, en UNE
    // SEULE passe : découpée par tranche, les recouvrements empileraient leur
    // alpha en bandes plus sombres.
    const spr = spanSprite(g, st);
    if (spr && spr.spec && (spr.spec.humpH || 0) === 0) {
      const sil = bridgeSilhouette(spr.art, spr.spec.key);
      if (!sil) continue;
      const sp = spr.spec, kpx = T / tilePxOf(sp);
      const s = kpx * z;
      const ih = sil.height;
      const ySol0 = sp.footHi[1];
      ctx.save();
      ctx.globalAlpha = bridgeTune.shadowA;
      ctx.translate(bridgeTune.shadowDx * z, bridgeTune.shadowDy * z);
      const prevSm = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      // Mêmes pièces que la pose (culée a / travées / culée b), sans la
      // sous-découpe par tuile : l'ombre n'a pas besoin du tri fin.
      const ovHi = Math.abs(sp.over[0] - sp.footHi[0]);
      const ovLo = Math.abs(sp.over[1] - sp.footLo[0]);
      const D = (g.b - g.a) / kpx;
      const midW = Math.abs(sp.footLo[0] - sp.footHi[0]) - sp.capHi - sp.capLo;
      const runs = [];
      if (midW < 8 || D <= sp.capHi + sp.capLo) {
        const cut = D * sp.capHi / (sp.capHi + sp.capLo);
        runs.push(['hi', -ovHi, cut], ['lo', cut, D + ovLo]);
      } else {
        runs.push(['hi', -ovHi, sp.capHi]);
        const dEnd = D - sp.capLo;
        for (let sd = sp.capHi; sd < dEnd - 0.01; sd += midW) runs.push(['mid', sd, Math.min(sd + midW, dEnd)]);
        runs.push(['lo', dEnd, D + ovLo]);
      }
      const midX0 = sp.footHi[0] + sp.sgn * sp.capHi;
      for (const [part, e0, e1] of runs) {
        const ax = part === 'hi' ? sp.footHi[0] : part === 'lo' ? sp.footLo[0] : midX0;
        const al = part === 'hi' ? g.a : part === 'lo' ? g.b : g.a + e0 * kpx;
        const xAt = part === 'hi' ? (e) => sp.footHi[0] + sp.sgn * e
          : part === 'lo' ? (e) => sp.footLo[0] - sp.sgn * (D - e)
            : (e) => midX0 + sp.sgn * (e - e0);
        const xa = xAt(e0), xb = xAt(e1);
        const sx = Math.round(Math.min(xa, xb)), sx1 = Math.round(Math.max(xa, xb));
        if (sx1 <= sx) continue;
        const E = g.P(al, g.c + (sp.dt || 0) * kpx);
        const x0 = Math.round(E.x - (ax - sx) * s);
        const x1 = Math.round(E.x - (ax - sx1) * s);
        const dy = Math.round(E.y - (ySol0 + Math.abs(ax - sp.footHi[0]) * 0.5) * s);
        if (x1 <= x0) continue;
        // Enterré sur la berge : l'ombre aussi (même clip que la pose, dans le
        // repère TRANSLATÉ de l'ombre — la découpe suit son décalage, ce qui
        // est le comportement voulu : c'est l'ombre du caisson qui disparaît).
        const buried = buryClip(ctx, g, sp, s, x0, x1, dy, Math.round(ih * s), E.x, ax);
        ctx.drawImage(sil, sx, 0, sx1 - sx, ih, x0, dy, x1 - x0, Math.round(ih * s));
        if (buried) ctx.restore();
      }
      ctx.imageSmoothingEnabled = prevSm;
      ctx.restore();
      continue;
    }
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
  const kpx = T / tilePxOf(sp);                    // px monde par px source
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
    // suivante recouvre un traverseur dès que sa profondeur la dépasse. Une
    // tranche est triée en tRef ; un traverseur en (l, t) avec l dans la
    // tranche passe devant la SUIVANTE tant que t > tRef + step (pire cas
    // l = l0). D'où tRef = bord AMONT de la bande de passage − step : toute
    // la zone piétonne, d'un garde-corps à l'autre, est alors garantie devant
    // sa propre tranche ET devant la suivante.
    // ⚠ Ancien tRef = c − wD : il ne couvrait que ±0,09 tuile autour de l'axe.
    // Dès qu'un habitant s'écartait vers l'amont (t < c − 6 px monde) il
    // DISPARAISSAIT sous la tranche suivante — c'est ce qui a longtemps
    // interdit d'élargir la file, et fait ressembler le pont à un rail.
    const step = T / 6;
    const bd = spanBand(g);
    const tRef = Math.min(g.c - g.wD, bd.axis - bd.half - step);
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
        items.push({ d: g.D(l0, tRef), kind: 'bridgeSeg', si, part: 'sprite', sx, sw: sx1 - sx, ax, al });
        // GARDE-CORPS AVAL par-dessus les traverseurs : duplicata (calque
        // -rail) redessiné à la profondeur du bord AVAL de la BANDE — les
        // habitants se trient entre les deux, donc derrière la lisse du bas
        // et devant celle du haut (retour Raph ; même geste que le parapet
        // 'down' du procédural).
        if (g._sprite.railArt) {
          items.push({
            d: g.D((l0 + l1) / 2, Math.max(g.c + g.wD, bd.axis + bd.half)), kind: 'bridgeSeg', si,
            part: 'sprite', rail: true, sx, sw: sx1 - sx, ax, al,
          });
        }
      }
      e0 = e1;
    }
  }
}

export function pushIsoBridgeItems(items, bounds) {
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

// ── ENTERREMENT : clip « au-dessus du plan du sol » sur les tronçons SECS ────
// Pour un sprite posé AU NIVEAU DU SOL (humpH 0, spec.bury), tout ce que le
// dessin porte SOUS le bord aval du tablier — face du caisson, arches, piles —
// est sous le plan du sol. Au-dessus de l'eau (conventionnellement plus basse,
// cf. en-tête) ça se voit ; sur la berge c'est ENTERRÉ dans le remblai. Sans ce
// clip le pont se posait sur la rive comme une dalle, caisson apparent, avec
// une MARCHE à chaque bout (Raph, 2026-08-22 : « je veux un pont plat, qui
// rejoigne les deux bords »). Après : le tablier affleure la route, les
// parapets filent sur la berge, et le caisson ne sort de terre qu'au-dessus de
// l'eau — le dessin d'un vrai pont.
//
// Pièce écran [x0, x1] × [dy, dy+h] (rect de blit), ex/ax = ancre écran/source
// (x source sx ↔ écran ex + (sx − ax)·s, s = px écran par px source). Le bord
// caché suit le PIXEL du sprite — escalier 2:1 par colonne source, première
// rangée cachée = ceil(ySol(sx) + bury) — et non une droite anticrénelée qui
// baverait sur la ligne du tablier. Chaque tronçon sec (g.dryRuns, mesuré au
// bord aval) devient un polygone « sous le tablier » ôté du rect par la règle
// evenodd : la découpe à la ligne d'eau est une verticale écran, comme la fin
// d'un mur de quai. Retourne true si un clip est posé (ctx.save fait — le
// caller doit ctx.restore après son blit).
export function buryClip(ctx, g, sp, s, x0, x1, dy, h, ex, ax) {
  const runs = g.dryRuns;
  if (!runs || !runs.length || sp.bury == null) return false;
  const yBot = dy + h + 2;
  // Ligne d'axe SIGNÉE (pas de |·| : au-delà du pied, dans le débord d'about,
  // la droite continue — un abs en ferait un V et l'escalier repartirait à
  // l'envers sur les dernières colonnes).
  const ySolAt = (sx) => sp.footHi[1] + sp.sgn * (sx - sp.footHi[0]) * 0.5;
  const yTop = (sx) => dy + Math.ceil(ySolAt(sx) + sp.bury - 1e-6) * s;
  const xAt = (sx) => ex + (sx - ax) * s;
  let any = false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, dy, x1 - x0, h);
  for (const [l0, l1] of runs) {
    const p0 = g.P(l0, g.tDn), p1 = g.P(l1, g.tDn);
    const Xa = Math.max(x0, Math.round(Math.min(p0.x, p1.x)));
    const Xb = Math.min(x1, Math.round(Math.max(p0.x, p1.x)));
    if (Xb - Xa < 1) continue;
    any = true;
    const sxA = Math.floor(ax + (Xa - ex) / s), sxB = Math.ceil(ax + (Xb - ex) / s);
    ctx.moveTo(Xa, yBot);
    ctx.lineTo(Xa, yTop(sxA));
    for (let sx = sxA; sx <= sxB; sx += 1) {
      const xr = Math.min(Xb, xAt(sx + 1));
      ctx.lineTo(xr, yTop(sx));
      if (xr >= Xb) break;
      ctx.lineTo(xr, yTop(sx + 1));
    }
    ctx.lineTo(Xb, yBot);
    ctx.closePath();
  }
  if (!any) { ctx.restore(); return false; }
  ctx.clip('evenodd');
  return true;
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
    const s = (T / tilePxOf(sp)) * z;
    // dt : offset TRANSVERSE (px source, + vers l aval) — centre le DESSIN
    // sur l axe logique de la route (retour Raph « centrer la route sur le
    // pont ») ; la ligne de marche et le lift restent sur l axe, c est le
    // sprite qui vient sous leurs pieds.
    const E = g.P(it.al, g.c + (sp.dt || 0) * (T / tilePxOf(sp)));
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
    const ih0 = img.naturalHeight || img.height;
    // Molette de désignation (cf. bridgeTune.cutBelow) : on tronque la SOURCE,
    // pas la destination — `dy` est le haut du dessin, le bas seul recule. La
    // ligne d'axe est prise au MILIEU de la tranche (elle glisse de 0,5 px par
    // colonne, soit ~2 px sur une tranche de T/6 : un escalier invisible pour
    // un outil de pointage, et le bake final n'a pas ce défaut).
    const ih = bridgeTune.cutBelow == null ? ih0 : Math.max(1, Math.min(ih0,
      Math.ceil(sp.footHi[1] + sp.sgn * ((it.sx + it.sw / 2) - sp.footHi[0]) * 0.5 + bridgeTune.cutBelow)));
    const prevSm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    // Sprite ENTERRÉ : sur les tronçons secs, rien sous le plan du sol (le
    // calque -rail vit AU-DESSUS du tablier : jamais clippé).
    const buried = !it.rail && buryClip(ctx, g, sp, s, x0, x1, dy, Math.round(ih * s), E.x, it.ax);
    ctx.drawImage(img, it.sx, 0, it.sw, ih, x0, dy, x1 - x0, Math.round(ih * s));
    if (buried) ctx.restore();
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

// ── PONT : tablier par ère au-dessus de l'eau (cellules roadSurface 'bridge') ─
// Matière par bande, calquée sur les 5 stades du pont pixel legacy
// (bois → pierre → fer → béton/énergie). Le tablier d'une voie s'étend jusqu'au
// bord mitoyen quand la voie JUMELLE est aussi un pont (double-voie dès band 2)
// → un seul tablier continu, garde-corps seulement sur les bords EXTÉRIEURS.
// Rejoue un rendu ÉCRAN LEGACY en iso : P_iso = A ∘ P_legacy, avec A l'affine
// écran autour du centre, de colonnes (ISO_X, ISO_Y) et (−ISO_X, ISO_Y). Tout
// art PLAT dessiné par le pipeline legacy (tablier de pont, terre-plein planté)
// se projette ainsi EXACTEMENT sur le plan du sol en losange — zéro re-art.
// ⚠ Réservé à l'art « à plat » : un décor avec verticalité bakée se coucherait.


// RAMPES D'ACCÈS (retour Raph : « la jonction pont/routes n'est pas fluide »).
// À chaque bout de travée, un trapèze en matière de CHAUSSÉE qui s'évase de la
// largeur du ruban de route vers la largeur du tablier — l'asphalte « monte »
// sur le pont et couvre la couture dure de la culée. Bordure sombre dessous,
// même grammaire que les rubans de rue. Dessiné APRÈS le tablier (pixel ou
// procédural), AVANT la passe vivante (les véhicules roulent dessus).

