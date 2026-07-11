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
  w: 800,   // FRESQUE ÉLARGIE : l'art de Raphaël (320) + 240 px de ruines
  h: 400,   // cousues de chaque côté (scratch/widen-tree.cjs) → monde 4000×2000
  scale: 5,
  // Les ancres ci-dessous restent dans le REPÈRE DE L'ART de Raphaël
  // (320×400, source scratch/tree-concepts/raph-tree-src.png) : pixelLayout
  // ajoute cet offset. Retoucher l'arbre ne décale donc jamais les ancres.
  artOffsetX: 240
};

// La boule de braise (milieu du tronc) : le compteur de ruines vit dessus.
export const HUB_ANCHOR = { x: 172, y: 201 };

// Rayons des pastilles en px MONDE (après ×SCALE). Réduits (retour Raphaël :
// médaillons plus petits, posés SUR le bois) — l'invariant anti-chevauchement
// est testé par pixelLayout.test.js.
export const PIXEL_LAYOUT = {
  NODE_R: 18,
  CAPSTONE_R: 25,
  DOGMA_R: 21,
  GATE_R: 14
};

export const NODE_ANCHORS = {
  /* ── La Sève (prosperity) — éventail de gauche ────────────────────────────
     chaîne HAUTE (grand membre sup.) : fallen_roads → foundation_ghosts → caravanes → fetes → gouvernail
     chaîne BASSE (branches basses)   : rives → grand_cadastre → franchises → ville_monde (capstone) */
  fallen_roads:         { x: 136, y: 120 },
  rives_fecondes:       { x: 126, y: 132 },
  foundation_ghosts:    { x: 114, y: 106 },
  grand_cadastre:       { x: 102, y: 138 },
  caravanes_aubaine:    { x: 92,  y: 90 },
  fetes_jalon:          { x: 77,  y: 75 },
  franchises_marchandes:{ x: 78,  y: 148 },
  gouvernail_millions:  { x: 62,  y: 63 },
  ville_monde:          { x: 54,  y: 149 },

  /* ── L'Écorce gravée (knowledge) — branches du sommet ─────────────────────
     chaîne GAUCHE : oral → autel → recurring → epitaphes
     chaîne DROITE : grammaire → encre → loi → chronicle (capstone) */
  oral_tradition:       { x: 146, y: 92 },
  grammaire_des_ruines: { x: 170, y: 90 },
  autel_du_culte:       { x: 134, y: 71 },
  encre_indelebile:     { x: 192, y: 72 },
  recurring_ages:       { x: 121, y: 53 },
  loi_des_temoins:      { x: 199, y: 51 },
  epitaphes_profondes:  { x: 112, y: 38 },
  chronicle_engine:     { x: 211, y: 36 },

  /* ── La Cendre (cycle_crise) — éventail de droite ─────────────────────────
     chaîne PRINCIPALE (crête du grand membre) : conseil → edit → ruin_liturgy → cendres → stagnation → phenix (capstone)
     chaîne HAUTE : rites → moisson → preparations → collapse_taxonomy */
  conseil_de_crise:     { x: 200, y: 127 },
  rites_feu_court:      { x: 206, y: 110 },
  edit_effondrement:    { x: 217, y: 111 },
  ruin_liturgy:         { x: 238, y: 102 },
  moisson_de_crise:     { x: 224, y: 88 },
  cendres_fertiles:     { x: 259, y: 95 },
  preparations_funebres:{ x: 240, y: 73 },
  stagnation_feconde:   { x: 275, y: 93 },
  collapse_taxonomy:    { x: 260, y: 63 },
  phenix_calendaire:    { x: 292, y: 112 },

  /* ── Les Racines (resilience) — épaules du tronc → racines → cité ───────── */
  granaries:            { x: 140, y: 238 },
  veilleurs_nuit_1:     { x: 168, y: 242 },
  skill_archaeology:    { x: 196, y: 238 },
  reliquaire_pics:      { x: 122, y: 258 },
  necropole_vivante:    { x: 216, y: 258 },
  veilleurs_nuit_4:     { x: 88,  y: 276 },
  chambres_scellees:    { x: 166, y: 290 },
  chantiers_fouilles:   { x: 242, y: 272 },
  limon_des_ages:       { x: 106, y: 330 },
  racine_mere:          { x: 170, y: 352 }
};

// Dogmes : paires exclusives. Les paires aériennes se répartissent une par
// chaîne (« choisis ta voie ») ; les paires des Racines flanquent les racines.
export const DOGMA_ANCHORS = {
  trait_nomadism:          { x: 100, y: 268 },
  trait_enracinement:      { x: 232, y: 268 },
  dogma_communal_granaries:{ x: 64,  y: 316 },
  dogma_reliquaire_scelle: { x: 258, y: 316 },
  dogma_merchant_law:      { x: 96,  y: 158 },
  dogma_public_works:      { x: 70,  y: 162 },
  dogma_eternal_return:    { x: 270, y: 74 },
  dogma_abime_assume:      { x: 284, y: 62 },
  trait_theocracy:         { x: 126, y: 96 },
  dogma_free_academies:    { x: 204, y: 84 }
};

// Portes de palier « n/m » : posées sur le chemin entre deux paliers.
export const GATE_ANCHORS = {
  "prosperity:1":  { x: 120, y: 124 },
  "prosperity:2":  { x: 96,  y: 118 },
  "prosperity:3":  { x: 66,  y: 108 },
  "knowledge:1":   { x: 158, y: 90 },
  "knowledge:2":   { x: 158, y: 62 },
  "knowledge:3":   { x: 160, y: 42 },
  "cycle_crise:1": { x: 212, y: 118 },
  "cycle_crise:2": { x: 240, y: 88 },
  "cycle_crise:3": { x: 276, y: 88 },
  "resilience:1":  { x: 168, y: 252 },
  "resilience:2":  { x: 166, y: 272 },
  "resilience:3":  { x: 138, y: 316 }
};
