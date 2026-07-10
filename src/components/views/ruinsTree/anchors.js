"use strict";

// Ancres de l'Arbre des Ruines PEINT (refonte Phase C, docs/REFONTE-ARBRE-RUINES.md).
// Toutes les coordonnées sont en PIXELS SOURCE de l'illustration
// (public/pixelart/ui/ruins/tree-base.png = MIX-1 choisi par Raphaël :
// l'arbre de g2-regen + la boule de braise du D4 greffée au MILIEU du tronc,
// cf. scratch/mix-tree.cjs). Le monde affiché = source × SCALE, pixelated.
//
// Retours Raphaël (2026-07-10) : AUCUN lien dessiné (les nœuds posés le long
// des branches suffisent à lire les chemins), aucune nappe de brume (les nœuds
// verrouillés sont simplement grisés). Les ancres ne portent donc que {x, y}.
//
// Cartographie des branches sur l'œuvre :
//   La Sève (prosperity)       → l'éventail de GAUCHE (2 chaînes haut/bas)
//   L'Écorce gravée (knowledge)→ les branches du SOMMET (2 chaînes)
//   La Cendre (cycle_crise)    → l'éventail de DROITE (2 chaînes)
//   Les Racines (resilience)   → base du tronc → racines-éclairs → cité
//   Le HUB (compteur de ruines) = la boule de braise au milieu du tronc.
//
// Réglage : `window.__ruinsAnchors = true` en console → un clic sur l'arbre
// journalise les coordonnées source pour recaler un point. Vérif offline :
// `node scratch/check-anchors.cjs` → contact-sheet annoté.

export const TREE_ART = {
  src: "/pixelart/ui/ruins/tree-base.png",
  w: 320,
  h: 400,
  scale: 5 // monde 1600 × 2000
};

// La boule de braise (milieu du tronc) : le compteur de ruines vit dessus.
export const HUB_ANCHOR = { x: 170, y: 192 };

// Rayons des pastilles en px MONDE (après ×SCALE). Agrandis au redesign des
// médaillons (retour lisibilité) — l'invariant anti-chevauchement est testé
// par pixelLayout.test.js.
export const PIXEL_LAYOUT = {
  NODE_R: 26,
  CAPSTONE_R: 36,
  DOGMA_R: 30,
  GATE_R: 14
};

export const NODE_ANCHORS = {
  /* ── La Sève (prosperity) — éventail de gauche ────────────────────────────
     chaîne HAUTE : fallen_roads → foundation_ghosts → caravanes → fetes → gouvernail
     chaîne BASSE : rives → grand_cadastre → franchises → ville_monde (capstone) */
  fallen_roads:         { x: 138, y: 122 },
  rives_fecondes:       { x: 130, y: 142 },
  foundation_ghosts:    { x: 114, y: 103 },
  grand_cadastre:       { x: 100, y: 135 },
  caravanes_aubaine:    { x: 90,  y: 88 },
  fetes_jalon:          { x: 66,  y: 74 },
  franchises_marchandes:{ x: 70,  y: 127 },
  gouvernail_millions:  { x: 44,  y: 62 },
  ville_monde:          { x: 38,  y: 118 },

  /* ── L'Écorce gravée (knowledge) — branches du sommet ─────────────────────
     chaîne GAUCHE : oral → autel → recurring → epitaphes
     chaîne DROITE : grammaire → encre → loi → chronicle (capstone) */
  oral_tradition:       { x: 146, y: 96 },
  grammaire_des_ruines: { x: 176, y: 92 },
  autel_du_culte:       { x: 134, y: 72 },
  encre_indelebile:     { x: 188, y: 68 },
  recurring_ages:       { x: 126, y: 50 },
  loi_des_temoins:      { x: 198, y: 48 },
  epitaphes_profondes:  { x: 120, y: 32 },
  chronicle_engine:     { x: 208, y: 30 },

  /* ── La Cendre (cycle_crise) — éventail de droite ─────────────────────────
     chaîne PRINCIPALE : conseil → edit → ruin_liturgy → cendres → stagnation → phenix (capstone)
     chaîne HAUTE      : rites → moisson → preparations → collapse_taxonomy */
  conseil_de_crise:     { x: 198, y: 143 },
  rites_feu_court:      { x: 196, y: 122 },
  edit_effondrement:    { x: 226, y: 140 },
  ruin_liturgy:         { x: 252, y: 137 },
  moisson_de_crise:     { x: 220, y: 103 },
  cendres_fertiles:     { x: 276, y: 131 },
  preparations_funebres:{ x: 246, y: 88 },
  stagnation_feconde:   { x: 296, y: 124 },
  collapse_taxonomy:    { x: 272, y: 72 },
  phenix_calendaire:    { x: 308, y: 114 },

  /* ── Les Racines (resilience) — base du tronc → racines-éclairs → cité ──── */
  granaries:            { x: 136, y: 240 },
  veilleurs_nuit_1:     { x: 166, y: 246 },
  skill_archaeology:    { x: 196, y: 240 },
  reliquaire_pics:      { x: 118, y: 272 },
  necropole_vivante:    { x: 212, y: 272 },
  veilleurs_nuit_4:     { x: 90,  y: 300 },
  chambres_scellees:    { x: 164, y: 292 },
  chantiers_fouilles:   { x: 240, y: 300 },
  limon_des_ages:       { x: 110, y: 332 },
  racine_mere:          { x: 168, y: 352 }
};

// Dogmes : paires exclusives. Les paires aériennes se répartissent une par
// chaîne (« choisis ta voie ») ; les paires des Racines flanquent les racines.
export const DOGMA_ANCHORS = {
  trait_nomadism:          { x: 98,  y: 264 },
  trait_enracinement:      { x: 232, y: 264 },
  dogma_communal_granaries:{ x: 66,  y: 330 },
  dogma_reliquaire_scelle: { x: 260, y: 330 },
  dogma_merchant_law:      { x: 106, y: 158 },
  dogma_public_works:      { x: 80,  y: 152 },
  dogma_eternal_return:    { x: 260, y: 50 },
  dogma_abime_assume:      { x: 284, y: 60 },
  trait_theocracy:         { x: 106, y: 58 },
  dogma_free_academies:    { x: 216, y: 56 }
};

// Portes de palier « n/m » : posées sur le chemin entre deux paliers.
export const GATE_ANCHORS = {
  "prosperity:1":  { x: 120, y: 122 },
  "prosperity:2":  { x: 86,  y: 110 },
  "prosperity:3":  { x: 54,  y: 96 },
  "knowledge:1":   { x: 160, y: 86 },
  "knowledge:2":   { x: 158, y: 60 },
  "knowledge:3":   { x: 160, y: 36 },
  "cycle_crise:1": { x: 208, y: 130 },
  "cycle_crise:2": { x: 240, y: 112 },
  "cycle_crise:3": { x: 286, y: 92 },
  "resilience:1":  { x: 166, y: 258 },
  "resilience:2":  { x: 164, y: 280 },
  "resilience:3":  { x: 140, y: 320 }
};
