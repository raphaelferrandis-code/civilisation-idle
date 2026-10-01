"use strict";
// ── LES KITS DU PONT, UN PAR BANDE D'ÈRE (docs/PLAN-PONTS.md §4) ─────────────
//
// Décision de Raph (2026-10-01) : tablier PLAT au ras de la route, aussi large
// qu'elle, et une STRUCTURE qui change d'une ère à l'autre ; le pont est un
// « bâtiment remarquable », avec de belles entrées. Pilote bande 4 validé
// (« c'est parfait ! fais toutes les ères »), les neuf autres suivent sa recette.
//
// Un kit dit tout ce que le peintre (bridgeBake.js) et la pose (isoBridge.js)
// doivent savoir d'une ère : palette, gabarits (px monde au zoom 1, altitudes en
// px d'écran), famille de face, type de parapet, piédestaux et ce qui s'y pose,
// superstructure (haubans, suspension), entrée (porte qui enjambe la route, ou
// monuments posés aux quatre coins).
//
// UNE SEULE MAIN : les pierres sont prises aux QUAIS de la même ère
// (quaysAndRiot.quayStyleFor), la chaussée est la tuile de route de l'ère
// (isoRoad.ROAD_MATS), les statues et braseros viennent de l'art des places.
//
// DRAPEAUX (Raph, 2026-10-01, via la session « petite vie ») : « des drapeaux sur
// les ponts à partir de la pierre ». `flags.at` dit où : 'piers' (sur le parapet au
// droit des piles), 'mid' (au milieu des arches), 'gate' (sur l'attique des portes),
// 'masts' (en tête des mâts), 'towers' (en tête des tours). Ils claquent tous dans le
// même vent que ceux de la ville (iso/isoVie.drawVieFlag).
//
// TOISE (le piège du pilote) : un habitant fait 7 à 8 px de haut au zoom 1. Les
// parapets lui arrivent à la taille (5-6 px).
//
// Rampe `stone` : 0 reflet · 1 dessus · 2 face éclairée · 3 mi-teinte ·
// 4 face à l'ombre · 5 ombre · 6 ombre profonde · 7 joint / creux · 8 encre.
// `litBase` / `shadeBase` : où une face éclairée / à l'ombre lit la rampe.

// ── BANDE 0 · FEU — la passerelle de rondins ──────────────────────────────────
// Rondins jetés sur des pieux, rambarde de corde, palées contreventées en X. Aux
// deux bouts, des TOTEMS peints coiffés d'une torche : le premier ouvrage de la
// tribu, et déjà un lieu.
const FEU = {
  id: 'feu',
  pal: {
    stone: ['#e6dcc4', '#cdbf9f', '#b3a27c', '#998660', '#7f6c4a', '#665538', '#4e4029', '#382d1c', '#251d12'],
    wood: ['#b58a55', '#946b3e', '#73502c', '#53381e', '#352312'],
    rope: '#d7c08a',
    paint: ['#d29a3a', '#b3462e', '#ece0c4', '#2a1f16'],
    wet: ['#5f6a4c', '#4a543c'],
  },
  litBase: 2, shadeBase: 4,
  deck: { log: 3, sill: null },
  parapet: { type: 'rope', h: 5, pitch: 10, th: 2 },
  face: { type: 'trestle', beam: 3, brace: true },
  pier: { w: 6, bw: 6, cut: 0 },
  span: { clear: 1.0 },
  ped: null,
  props: null,
  monument: { type: 'totem', w: 4, h: 25, flame: true },
};

// ── BANDE 1 · BOIS — le pont de charpente ─────────────────────────────────────
// Planches sciées, garde-corps à deux lisses, palées à jambes de force. Un
// PORTAIL couvert à chaque bout, lanterne pendue au linteau.
const BOIS = {
  id: 'bois',
  pal: {
    stone: ['#e6dcc4', '#cdbf9f', '#b3a27c', '#998660', '#7f6c4a', '#665538', '#4e4029', '#382d1c', '#251d12'],
    wood: ['#c2955e', '#a07745', '#7d5831', '#5a3d21', '#3a2614'],
    roof: ['#cfa95e', '#a8823f', '#7c5b2a', '#523a1a'],
    wet: ['#5f6a4c', '#4a543c'],
  },
  litBase: 2, shadeBase: 4,
  deck: { plank: 4, sill: null },
  parapet: { type: 'rail', h: 6, pitch: 8, th: 2, mid: true },
  face: { type: 'trestle', beam: 4, brace: true, knee: true },
  pier: { w: 6, bw: 6, cut: 0 },
  span: { clear: 1.1 },
  ped: null,
  props: null,
  entrance: { type: 'portal', dl: 6, out: 3, postH: 26, roofH: 8, lantern: true },
};

// ── BANDE 2 · PIERRE TAILLÉE — le pont roman ──────────────────────────────────
// Arches en plein cintre en pierre brute, muret plein à chaperon, avant-becs. Des
// PILIERS dressés aux quatre coins, une vasque de feu sur chacun.
const PIERRE = {
  id: 'pierre',
  pal: {
    // Quais des bandes 2-3 : walk #a89a78, coping #d8cfb4, wallTop #8a7f60, wallBot #4e4230.
    stone: ['#e6dec8', '#d2c7ac', '#bbae8e', '#a39574', '#8b7d5e', '#73674c', '#5c523d', '#453e2f', '#2e2a21'],
    wet: ['#667055', '#4f5842'],
  },
  litBase: 2, shadeBase: 4, course: 4, block: 9, joint: 2, rough: true,
  deck: { tile: 'road-cobble', col: '#857c6b', joint: '#665e50', walkW: 0, sill: '#a1977f' },
  parapet: { type: 'wall', h: 5, th: 3 },
  face: { type: 'arches', ring: 3, vous: 3, crown: -6 },
  pier: { w: 10, bw: 10, cut: 5, top: -11 },
  span: { clear: 1.15 },
  ped: null,
  props: null,
  monument: { type: 'pillar', w: 7, h: 24, flame: true },
  flags: { at: 'piers', cols: ['#b2382d', '#7e2620', '#e2b444'], poleH: 10 },
};

// ── BANDE 3 · COURONNE — le pont fortifié ─────────────────────────────────────
// Arches brisées, avant-becs aigus, parapet crénelé. Une TOUR-PORTE à chaque
// bout : passage en ogive, mâchicoulis, toit d'ardoise, bannière (Pont Valentré).
const COURONNE = {
  id: 'couronne',
  pal: {
    stone: ['#e2dccb', '#cdc4ad', '#b6ab90', '#9e9276', '#86795f', '#6e634d', '#575040', '#413c31', '#2b2822'],
    slate: ['#6a7182', '#525867', '#3b404c', '#282b33'],
    banner: ['#b2382d', '#7e2620', '#e2b444'],
    wet: ['#667055', '#4f5842'],
  },
  litBase: 2, shadeBase: 4, course: 4, block: 10, joint: 2,
  deck: { tile: 'road-cobble', col: '#857c6b', joint: '#665e50', walkW: 0, sill: '#a1977f' },
  parapet: { type: 'crenel', h: 6, th: 3, pitch: 6 },
  face: { type: 'arches', ring: 3, vous: 3, crown: -5, pointed: true },
  pier: { w: 10, bw: 10, cut: 8, top: -6 },
  span: { clear: 1.2 },
  ped: null,
  props: null,
  entrance: { type: 'tower', dl: 18, out: 9, spring: 10, bodyH: 44, crenH: 5, roofH: 22, flag: true },
  flags: { at: 'piers', banner: true, swallow: true, poleH: 10 },
};

// ── BANDE 4 · MARBRE — le PILOTE validé ───────────────────────────────────────
// Pont romain : arches en plein cintre posées sur l'eau, avant-becs, cordon de
// corniche, balustrade de marbre, statues sur les piles, braseros, et un ARC DE
// TRIOMPHE à chaque bout (Pont Flavien, pont Saint-Ange).
const MARBRE = {
  id: 'marbre',
  pal: {
    // Travertin des quais de la bande 4 (walk #cdc6b2, coping #ece6d6,
    // wallTop #b3ab92, wallBot #6f684f), étiré en rampe de 9.
    stone: ['#f3eee2', '#e6dfcd', '#d6cdb6', '#c3b99f', '#afa488', '#978c71', '#7c725b', '#5f5745', '#433d31'],
    marble: ['#f7f4ec', '#e4dccb', '#c2b89f'],
    wet: ['#6f7a5c', '#56604a'],
    bronze: ['#d8b265', '#a57a3a', '#6d4c25'],
  },
  litBase: 2, shadeBase: 4, course: 5, block: 14, joint: 2,
  deck: {
    tile: 'road-stone',                 // la voie dallée de la bande 4 continue sur le pont
    col: '#8a8272', joint: '#6e6556',
    walkW: 5, walk: '#d9d0b9', walkEdge: '#9d937a', walkJoint: '#bdb399', walkSlab: 8,
    sill: '#b3a98f',
  },
  parapet: { type: 'balustrade', h: 6, plinth: 1, rail: 2, pitch: 4, th: 3 },
  face: { type: 'arches', ring: 3, vous: 4, crown: -6 },
  pier: { w: 10, bw: 10, cut: 6, top: -10 },
  span: { clear: 1.35 },                // ouverture visée d'une arche, en tuiles
  ped: { w: 6, h: 10, wEnd: 8, hEnd: 12, panel: true, over: 1.5 },
  props: { pier: 'statue', end: 'brazier', mid: 'brazier', era: 'antique' },
  // Arc de triomphe : épaisseur dl, piles qui débordent de `out` px hors des
  // parapets, naissance de l'arche à `spring` px, entablement et attique.
  entrance: { type: 'triumph', dl: 12, out: 14, spring: 10, entH: 6, atticH: 11, top: 'statue', corner: 'brazier' },
  flags: { at: 'gate', cols: ['#b2382d', '#7e2620', '#e2b444'], poleH: 12, w: 5, h: 5 },
};

// ── BANDE 5 · FONTE — le pont de fonte ────────────────────────────────────────
// Arches de fonte surbaissées, tympans ajourés de cercles, piles de pierre,
// garde-corps ouvragé, candélabres à gaz. Aux quatre coins, de grands PYLÔNES de
// pierre portant des statues DORÉES (pont Alexandre III).
const FONTE = {
  id: 'fonte',
  pal: {
    // Quais de la fonte : walk #827a6e, coping #9c968c, wallTop #5f5a52.
    stone: ['#ece6da', '#d8d0c0', '#c1b7a3', '#a89d88', '#8f846f', '#776c59', '#5f5747', '#474136', '#2f2b25'],
    iron: ['#6f8079', '#55645e', '#3e4a45', '#2a332f', '#1b211e'],
    gold: ['#f0cf6a', '#d2a53e', '#9c7524'],
    wet: ['#5d6758', '#475143'],
  },
  litBase: 2, shadeBase: 4, course: 5, block: 13, joint: 2,
  deck: { tile: 'road-stone', col: '#7d776c', joint: '#5f5a51', walkW: 5, walk: '#cfc7b6', walkEdge: '#8a8272', walkJoint: '#ada594', walkSlab: 8, sill: '#9d9585' },
  parapet: { type: 'lattice', h: 6, pitch: 6, th: 2 },
  face: { type: 'ironarch', girder: 4, rib: 3, crown: -4 },
  pier: { w: 9, bw: 9, cut: 5, top: -12 },
  span: { clear: 2.0 },
  ped: { w: 5, h: 7, panel: false, over: 1 },
  props: { pier: 'gaslamp', mid: null, era: 'industrial' },
  monument: { type: 'pylon', w: 8, h: 34, statue: 'gold' },
  flags: { at: 'mid', cols: ['#2f5a9e', '#1f3a6a', '#e2b444'], poleH: 11 },
};

// ── BANDE 6 · NÉON — le pont à haubans ────────────────────────────────────────
// Caisson de béton fin sur piles élancées, garde-corps d'acier, et deux MÂTS en H
// d'où les haubans descendent en éventail. Bornes lumineuses aux quatre coins,
// réverbères à LED.
const NEON = {
  id: 'neon',
  pal: {
    stone: ['#f0f0ee', '#dededb', '#c8c8c4', '#b0b0ac', '#979794', '#7f7f7c', '#666665', '#4d4d4e', '#333336'],
    rail: ['#e4e8ec', '#b9bfc6', '#878d94'],
    cable: '#dfe4ea',
    led: '#8fdcff',
    wet: ['#56605a', '#434b46'],
  },
  litBase: 2, shadeBase: 4,
  deck: { tile: 'road-asphalt', col: '#5f6064', joint: '#4b4c50', walkW: 5, walk: '#c4c4c0', walkEdge: '#80807d', walkJoint: '#a6a6a2', walkSlab: 10, sill: '#8d8d8a' },
  parapet: { type: 'rail', h: 5, pitch: 6, th: 2, mid: true },
  face: { type: 'girder', girder: 6 },
  pier: { w: 8, bw: 8, cut: 3 },
  span: { clear: 2.3 },
  ped: null,
  props: { pier: null, mid: 'ledlamp', every: 1.6, era: 'modern' },
  superstructure: { type: 'stayed', mastH: 66, mastW: 4, stays: 4 },
  monument: { type: 'beacon', w: 4, h: 26 },
  flags: { at: 'masts', cols: ['#3fb6d6', '#24708a', '#e8f6ff'], poleH: 8 },
};

// ── BANDES 7-9 · COSMIQUES — le pont de lumière ───────────────────────────────
// Tablier mince bordé d'un filet lumineux, parapet de verre, deux tours effilées
// et des câbles porteurs qui LUISENT dans la couleur de l'ère (celle de ses
// quais). Un ANNEAU de lumière enjambe la route à chaque bout.
function cosmic(id, glow, quay) {
  return {
    id,
    pal: {
      stone: ['#e6e9f2', '#cfd4e2', '#b5bccf', '#9aa2b9', '#8088a0', '#686f88', '#525870', '#3c4157', '#282c3e'],
      rail: ['#c9d0e4', '#949bb5', '#646a85'],
      glow, glass: quay,
      wet: ['#4c5870', '#3b465c'],
    },
    litBase: 2, shadeBase: 4,
    deck: { tile: 'road-tech', col: '#62687e', joint: '#4c5166', walkW: 5, walk: '#b8bed2', walkEdge: '#767d99', walkJoint: '#9ca3bb', walkSlab: 10, sill: glow },
    parapet: { type: 'glass', h: 6, pitch: 16, th: 2 },
    face: { type: 'thin', girder: 3 },
    pier: null,
    span: { clear: 9 },
    ped: null,
    props: null,
    superstructure: { type: 'suspension', towerH: 74, towerW: 3, sag: 0.78 },
    entrance: { type: 'ring', dl: 4, out: 8, band: 3 },
    flags: { at: 'towers', cols: [quay, '#151826', glow], poleH: 8 },
  };
}
const NOOSPHERE = cosmic('noosphere', '#5af0b4', '#1d5640');
const STELLAIRE = cosmic('stellaire', '#ffcd78', '#4a3a1c');
const DEMIURGE = cosmic('demiurge', '#aa8cff', '#322a52');

const KITS = [FEU, BOIS, PIERRE, COURONNE, MARBRE, FONTE, NEON, NOOSPHERE, STELLAIRE, DEMIURGE];

export function bridgeKitForBand(band) {
  const b = Math.max(0, Math.min(KITS.length - 1, band | 0));
  return KITS[b];
}
