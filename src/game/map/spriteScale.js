"use strict";
// ÉCHELLE DU GRAIN — module PUR, zéro dépendance : la formule d'échelle des
// sprites d'habitation et les constantes de densité, importables aussi bien par
// le rendu (pixelHouses.js) que par l'audit hors navigateur
// (scripts/spriteScaleAudit.mjs). Créé au lot G0 de la campagne d'égalisation
// (docs/PLAN-EGALISATION-GRAIN.md) ; le lot G1 y rapatriera les autres densités
// aujourd'hui éparpillées (cf. constantes de référence en bas de fichier).

// Largeur de contenu (px du PNG) qui remplit ~1 tuile d'emprise. Les autres
// sprites scalent au MÊME facteur → leur taille relative (calibrée sur
// BUILDING_HEIGHTS à la génération) se retrouve à l'écran. Baisser = ville plus
// imposante ; monter = plus tassée. Doit rester cohérent avec HOUSE_FOOTPRINT
// (buildingGenerator.js) : les variantes qui dépassent 1 tuile de large y ont
// une empreinte.
export const HOUSE_UNIT = 44;

// A — AJUSTEMENT AU LOT (anti-débordement sur le trottoir/la route). Un sprite
// dont le contenu dépasse la largeur de son empreinte (w = tuile × spanX) est
// rétréci pour tenir dans w × (1 + margin), en scalant UNIFORMÉMENT (garde le
// ratio, donc ne s'étire pas). `margin` = débord latéral toléré. Les grands
// variants ont l'empreinte (HOUSE_FOOTPRINT) pour NE PAS être clampés → ils
// gardent leur masse. Molettes : __houseFit / __houseFitTune (pixelHouses.js).
export const houseFitTune = { on: true, margin: 0.08 };

// LA formule d'échelle d'un sprite d'habitation — source unique, partagée par
// pixelHouseGeom (dessin, liseré, fumée, hit-test) ET par l'audit du grain.
//   spanX : largeur d'empreinte en tuiles ; w : largeur écran de la boîte-lot
//   (tuile × spanX × zoom, côté iso : wpx) ; inkW : largeur d'ENCRE du PNG
//   (bbox alpha>16), jamais la largeur de canvas.
// Empreinte multi-tuiles : on scale sur la taille d'UNE tuile (w/span), pas sur
// toute la boîte → le sprite garde sa taille naturelle et NE grandit PAS avec
// l'empreinte ; celle-ci ne sert qu'à réserver l'espace (anti-chevauchement).
// ⚠ Anomalie documentée (PLAN-EGALISATION-GRAIN §1.2) : côté iso, w vient de
// (spanX+spanY)·T·z·HOUSE_LOT_WF, donc unit dépend de la FORME du lot — un 1×2
// dessine ~1,5× plus dense qu'un lot carré. Correction prévue en G1, avec
// compensation par sprite (l'équilibre accidentel du tenement en dépend).
export function houseScaleK(spanX, w, inkW) {
  const unit = w / (spanX || 1);
  let k = unit / HOUSE_UNIT;
  if (houseFitTune.on) {
    const maxW = w * (1 + houseFitTune.margin);
    if (inkW * k > maxW) k = maxW / inkW;
  }
  return k;
}

// ── Constantes de RÉFÉRENCE (sites vifs PAS ENCORE branchés — G1) ───────────
// Recopies déclaratives des densités éparpillées, consommées par l'audit G0.
// Un test de garde (spriteScale.test.js) vérifie par lecture du SOURCE que
// chaque site vif porte toujours cette valeur : si l'un bouge sans l'autre, le
// test casse. Le lot G1 remplace ces recopies par de vrais imports.
export const TILE_REF = 32;         // CM.TILE (layout.js)
export const HOUSE_LOT_WF = 0.78;   // isoRenderer.js « wpx = (spanX+spanY)·T·z·ISO_X·0.78 »
export const ENGINE_UNIT_F = 0.72;  // isoRenderer.js « unit = T·z·ISO_X·0.72 » (boîte des scènes moteur)
export const WONDER_PPT = 34;       // renderBuildings.js « PPT = 34 » (merveilles)
export const COSMIC_TOWER_H = 1.72; // cityEngineSprites.js « __cosmicTowerH) || 1.72 » (tours cosmiques moteur, drawH = H × boîte)
