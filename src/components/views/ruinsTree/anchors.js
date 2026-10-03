"use strict";

// Ancres de l'Arbre des Ruines — « l'Arbre de la Mémoire » (piste B, choisie
// par Raphaël le 2026-10-03). Illustration : public/pixelart/ruins-tree/memoire.png
// (PixelLab Pro 688×384, seed 3301) — un arbre par matière :
//   L'Écorce gravée (knowledge)   → la couronne d'argent gravée de runes
//   La Sève         (prosperity)  → les membres vivants de GAUCHE (feuilles, ambre)
//   La Cendre       (cycle_crise) → le bois calciné de DROITE (braises)
//   Les Racines     (resilience)  → sous terre, dans les strates des cités enfouies
//   Le cœur de braise (milieu du tronc) = d'où part toute la sève.
//
// Toutes les coordonnées sont en PIXELS SOURCE de l'illustration ; l'écran les
// affiche à un zoom ENTIER (×3 dans une fenêtre de 2 560 px) pour garder des
// pixels nets. Les médaillons, eux, vivent dans un calque ÉCRAN à taille fixe.
//
// Réglage : `window.__ruinsAnchors = true` en console → un clic sur l'arbre
// journalise les coordonnées source. Après avoir déplacé une ancre ou une
// chaîne : `node scripts/buildRuinsSap.mjs` (régénère les veines, sapPaths.js).

export const TREE_ART = {
  src: "/pixelart/ruins-tree/memoire.png",
  w: 688,
  h: 384,
};

export const HUB_ANCHOR = { x: 340, y: 192 };

// Rayons des médaillons en px ÉCRAN, au zoom de référence (×3). L'invariant
// anti-chevauchement est testé dans cette unité (pixelLayout.test.js).
export const PIXEL_LAYOUT = {
  REF_SCALE: 3,
  NODE_R: 22,
  CAPSTONE_R: 28,
  DOGMA_R: 21,
};

export const NODE_ANCHORS = {
  /* ── L'Écorce gravée — couronne d'argent : chaîne gauche / chaîne droite ── */
  oral_tradition:        { x: 312, y: 124 },
  autel_du_culte:        { x: 280, y: 104 },
  recurring_ages:        { x: 246, y: 84 },
  epitaphes_profondes:   { x: 204, y: 60 },
  grammaire_des_ruines:  { x: 364, y: 120 },
  encre_indelebile:      { x: 396, y: 98 },
  loi_des_temoins:       { x: 428, y: 78 },
  chronicle_engine:      { x: 472, y: 56 },

  /* ── La Sève — membres vivants de gauche : chaîne haute / chaîne basse ──── */
  fallen_roads:          { x: 300, y: 152 },
  foundation_ghosts:     { x: 262, y: 147 },
  caravanes_aubaine:     { x: 222, y: 140 },
  fetes_jalon:           { x: 178, y: 121 },
  gouvernail_millions:   { x: 140, y: 106 },
  rives_fecondes:        { x: 246, y: 161 },
  grand_cadastre:        { x: 212, y: 175 },
  franchises_marchandes: { x: 184, y: 185 },
  ville_monde:           { x: 154, y: 193 },

  /* ── La Cendre — bois calciné de droite : chaîne principale / chaîne haute ─ */
  conseil_de_crise:      { x: 386, y: 153 },
  edit_effondrement:     { x: 416, y: 151 },
  ruin_liturgy:          { x: 443, y: 157 },
  cendres_fertiles:      { x: 470, y: 165 },
  stagnation_feconde:    { x: 508, y: 166 },
  phenix_calendaire:     { x: 552, y: 177 },
  rites_feu_court:       { x: 392, y: 132 },
  moisson_de_crise:      { x: 426, y: 121 },
  preparations_funebres: { x: 464, y: 115 },
  collapse_taxonomy:     { x: 498, y: 108 },

  /* ── Les Racines — sous terre, dans les strates des cités enfouies ──────── */
  granaries:             { x: 310, y: 270 },
  veilleurs_nuit_1:      { x: 343, y: 274 },
  skill_archaeology:     { x: 377, y: 268 },
  reliquaire_pics:       { x: 280, y: 290 },
  necropole_vivante:     { x: 423, y: 290 },
  veilleurs_nuit_4:      { x: 257, y: 308 },
  chambres_scellees:     { x: 324, y: 302 },
  chantiers_fouilles:    { x: 403, y: 318 },
  limon_des_ages:        { x: 240, y: 326 },
  racine_mere:           { x: 322, y: 330 },
};

// Dogmes : paires exclusives, une par chaîne (« choisis ta voie »).
export const DOGMA_ANCHORS = {
  trait_theocracy:          { x: 309, y: 50 },
  dogma_free_academies:     { x: 393, y: 44 },
  dogma_merchant_law:       { x: 182, y: 143 },
  dogma_public_works:       { x: 130, y: 150 },
  dogma_eternal_return:     { x: 535, y: 88 },
  dogma_abime_assume:       { x: 561, y: 120 },
  trait_nomadism:           { x: 210, y: 267 },
  trait_enracinement:       { x: 480, y: 269 },
  dogma_communal_granaries: { x: 214, y: 298 },
  dogma_reliquaire_scelle:  { x: 452, y: 316 },
};

// Portes de palier « n/m » (seule la prochaine porte fermée de chaque branche
// s'affiche). Posées sur le bois entre deux paliers, à l'écart des médaillons.
export const GATE_ANCHORS = {
  "knowledge:1":   { x: 336, y: 104 },
  "knowledge:2":   { x: 333, y: 80 },
  "knowledge:3":   { x: 333, y: 56 },
  "prosperity:1":  { x: 281, y: 150 },
  "prosperity:2":  { x: 198, y: 132 },
  "prosperity:3":  { x: 160, y: 114 },
  "cycle_crise:1": { x: 401, y: 162 },
  "cycle_crise:2": { x: 460, y: 153 },
  "cycle_crise:3": { x: 526, y: 140 },
  "resilience:1":  { x: 362, y: 286 },
  "resilience:2":  { x: 366, y: 306 },
  "resilience:3":  { x: 290, y: 318 },
};

// Chemins de la sève : chaque nœud reçoit la sève de son PARENT (« hub » = le
// cœur de braise). Purement visuel — le jeu ne connaît que des paliers à
// compteur ; la sève monte jusqu'à chaque nœud acquis en passant par ses aînés.
export const SAP_CHAINS = [
  ["hub", "fallen_roads", "foundation_ghosts", "caravanes_aubaine", "fetes_jalon", "gouvernail_millions"],
  ["hub", "rives_fecondes", "grand_cadastre", "franchises_marchandes", "ville_monde"],
  ["hub", "oral_tradition", "autel_du_culte", "recurring_ages", "epitaphes_profondes"],
  ["hub", "grammaire_des_ruines", "encre_indelebile", "loi_des_temoins", "chronicle_engine"],
  ["hub", "conseil_de_crise", "edit_effondrement", "ruin_liturgy", "cendres_fertiles", "stagnation_feconde", "phenix_calendaire"],
  ["conseil_de_crise", "rites_feu_court", "moisson_de_crise", "preparations_funebres", "collapse_taxonomy"],
  ["hub", "granaries", "reliquaire_pics", "veilleurs_nuit_4", "limon_des_ages"],
  ["hub", "veilleurs_nuit_1", "chambres_scellees", "racine_mere"],
  ["hub", "skill_archaeology", "necropole_vivante", "chantiers_fouilles"],
];

// Chaque dogme boit à la veine du nœud de sa branche le plus proche.
export const DOGMA_PARENT = {
  trait_theocracy: "autel_du_culte",
  dogma_free_academies: "loi_des_temoins",
  dogma_merchant_law: "fetes_jalon",
  dogma_public_works: "gouvernail_millions",
  dogma_eternal_return: "collapse_taxonomy",
  dogma_abime_assume: "phenix_calendaire",
  trait_nomadism: "veilleurs_nuit_4",
  trait_enracinement: "necropole_vivante",
  dogma_communal_granaries: "limon_des_ages",
  dogma_reliquaire_scelle: "necropole_vivante",
};

export function sapParentMap() {
  const parent = {};
  for (const chain of SAP_CHAINS) for (let i = 1; i < chain.length; i++) parent[chain[i]] = chain[i - 1];
  return { ...parent, ...DOGMA_PARENT };
}
