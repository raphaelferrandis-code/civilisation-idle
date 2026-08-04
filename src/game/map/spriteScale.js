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

// G1 — COMPENSATIONS DU GRAIN (PLAN-EGALISATION-GRAIN §4). `floor` = plancher
// de densité des scènes moteur aux petites empreintes (fraction de la densité
// atelier, cf. isoRenderer) ; `GRAIN_FIX` = correction PAR SPRITE des
// habitations, clé EXACTE de sprite (les skins cosmiques ne suivent pas leur
// variante de base), bornée [0,8-1,25] à l'application. Valeurs initiales
// dérivées de l'audit G0 (scripts/data/sprite-apparent.json) : après la
// correction de forme 1×2, tenement/tower/townhouse restent un cran sous ou
// sur la bande → +10 %. Molettes : __grainFix / __grainFloor (pixelHouses.js).
export const grainTune = { on: true, floor: 0.7 };
export const GRAIN_FIX = { tenement: 1.1, tower: 1.1, townhouse: 1.1 };

// G2 — PALIERS DE HALLES : spanSum de la boîte pour laquelle un sprite de
// palier est calibré (audit + planches ; le runtime, lui, reçoit la vraie
// boîte). Un sprite absent d'ici est jugé à l'ATELIER (spanSum 4).
export const PALIER_SPANSUM = {
  'granary-warehouse-grand': 6, 'granary-hall-grand': 6, 'granary-hub-grand': 6,
  'granary-horreum-grand': 6,
};
const fixFor = (key) => {
  if (!grainTune.on || !key) return 1;
  const f = GRAIN_FIX[key];
  return f ? Math.max(0.8, Math.min(1.25, f)) : 1;
};

// LA formule d'échelle d'un sprite d'habitation — source unique, partagée par
// pixelHouseGeom (dessin, liseré, fumée, hit-test) ET par l'audit du grain.
//   spanX : largeur d'empreinte en tuiles ; w : largeur écran de la boîte-lot
//   (tuile × spanX × zoom, côté iso : wpx) ; inkW : largeur d'ENCRE du PNG
//   (bbox alpha>16), jamais la largeur de canvas ; spanY : profondeur du lot
//   (côté iso — le legacy top-down passe spanY = spanX et garde son unité
//   historique) ; key : clé de sprite pour la compensation GRAIN_FIX.
// Empreinte multi-tuiles : on scale sur la taille d'UNE tuile, pas sur toute
// la boîte → le sprite garde sa taille naturelle et NE grandit PAS avec
// l'empreinte ; celle-ci ne sert qu'à réserver l'espace (anti-chevauchement).
// Correction G1 de l'anomalie 1×2 (PLAN-EGALISATION-GRAIN §1.2) : côté iso, w
// vient de (spanX+spanY)·T·z·HOUSE_LOT_WF ; l'unité honnête est donc
// 2w/(spanX+spanY) — identique à w/spanX pour les lots carrés, et ~1,5× plus
// petite pour un 1×2, qui dessinait d'autant plus dense que son lot était
// profond. La compensation par sprite (GRAIN_FIX) rattrape ce que l'art des
// 1×2 avait calé sur l'ancienne densité.
export function houseScaleK(spanX, w, inkW, spanY = spanX, key = '') {
  const sx = spanX || 1, sy = spanY || sx;
  const unit = (2 * w) / (sx + sy);
  let k = (unit / HOUSE_UNIT) * fixFor(key);
  if (houseFitTune.on) {
    const maxW = w * (1 + houseFitTune.margin);
    if (inkW * k > maxW) k = maxW / inkW;
  }
  return k;
}

// ── Sonde du grain (dev) ────────────────────────────────────────────────────
// Densités RÉELLEMENT blitées (px écran par px source, normalisées à zoom 1),
// alimentées par les chemins de rendu (blitProp, blitCosmicTower,
// pixelHouseGeom). __grainAudit() les croise avec les annotations G0 pour
// donner la vérité runtime — celle qui calibrera les paliers de halles (G2).
export const grainDens = {};
export const recDens = (key, dens) => { if (Number.isFinite(dens)) grainDens[key] = +dens.toFixed(3); };
if (typeof window !== 'undefined') {
  window.__grainDens = grainDens;
  window.__grainAudit = async () => {
    const ann = (await import('../../../scripts/data/sprite-annotations.json')).default;
    const rows = [];
    for (const a of ann.entries) {
      const d = grainDens[a.key];
      if (d == null || !a.door) continue;
      rows.push({ key: a.key, dens: d, porte: +(a.door.h * d).toFixed(1), bande: a.doorKind === 'portail' ? '14-22' : '10-14' });
    }
    rows.sort((x, y) => y.porte - x.porte);
    console.table(rows);
    return rows;
  };
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
