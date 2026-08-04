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
// MANIFESTE DES PALIERS — la seule liste qui fasse foi. Une clé y figure dès
// que `public/pixelart/agents/buildings/<clé>.png` existe ; le rendu s'en sert
// pour savoir quoi charger (pas de 404 à l'aveugle) et l'audit pour mesurer.
// La valeur = le spanSum pour lequel le sprite est CALIBRÉ (6 = empreinte 3).
// `node scripts/spriteScaleAudit.mjs manifeste` régénère ces lignes.
export const PALIER_SPANSUM = {
  'granary-warehouse-grand': 6, 'granary-hall-grand': 6, 'granary-hub-grand': 6,
  'granary-horreum-classical-grand': 6,
  'exchange-prop-stall-grand': 6, 'bank-house-renaissance-grand': 6,
  'bank-house-glass-grand': 6, 'bank-basilica-roman-grand': 6,
  'bank-house-neoclassical-grand': 6,
  'mill-prop-house-grand': 6, 'mill-house-stone-grand': 6,
  'mill-house-roman-grand': 6, 'mill-house-industrial-grand': 6,
  'ministries-council-grand': 6, 'ministries-tower-grand': 6,
  'ministries-capitol-grand': 6, 'ministries-curia-grand': 6,
  'ministries-palace-grand': 6,
  'cult-shrine-grand': 6, 'cult-mausoleum-grand': 6, 'cult-memorial-grand': 6,
  'think-prop-council-grand': 6, 'think-institute-grand': 6,
  'think-modern-grand': 6, 'think-chancellery-grand': 6,
  'think-stoa-roman-grand': 6,
  'guild-prop-lodge-grand': 6, 'guild-chamber-grand': 6,
  'guild-house-grand': 6, 'guild-collegium-grand': 6,
  'libraries-prop-archive-grand': 6, 'libraries-monastic-grand': 6,
  'libraries-classical-grand': 6, 'libraries-modern-grand': 6,
  'libraries-grand-grand': 6,
  'mint-prop-house-grand': 6, 'mint-prop-forge-grand': 6,
  'mint-house-steam-grand': 6, 'mint-house-digital-grand': 6,
  'mint-moneta-grand': 6,
  'archive-vault-grand': 6, 'archive-tabularium-grand': 6,
  'archive-records-grand': 6, 'archive-hut-grand': 6, 'archive-grid-grand': 6,
  'courthouses-lodge-grand': 6, 'courthouses-basilica-grand': 6,
  'courthouses-tribunal-grand': 6, 'courthouses-modern-grand': 6,
  'courthouses-neoclassical-grand': 6,
  'bureau-hut-grand': 6, 'bureau-chancery-grand': 6,
  'bureau-tabularium-grand': 6, 'bureau-office-grand': 6,
  'bureau-tower-grand': 6,
  'market-hall-glass-grand': 6, 'market-macellum-grand': 6,
  'market-prop-stall-grand': 6, 'market-plaza-neon-grand': 6,
  'printing-media-grand': 6, 'printing-press-shop-grand': 6,
  'printing-prop-workshop-grand': 6, 'printing-factory-grand': 6,
  'printing-scriptorium-grand': 6,
  'schools-prop-yard-grand': 6, 'schools-victorian-grand': 6,
  'schools-schoolhouse-grand': 6, 'schools-campus-grand': 6,
  'academies-prop-yard-grand': 6, 'forager-greenhouse-grand': 6,
  'forager-hortus-classical-grand': 6, 'granary-prop-silo-grand': 6,
};

// Hauteur de calibrage d'un palier, en fraction de sa boîte. 0,7 partout sauf
// exception MESURÉE (le terminal a une porte de service courte, il lui faut un
// peu plus). Change la taille dessinée ET la porte apparente : ne bouger que
// sur mesure, jamais à l'œil.
export const PALIER_HFRAC_DEFAUT = 0.7;
export const PALIER_HFRAC = { 'granary-hub-grand': 0.75 };
export const palierHFrac = (cle) => PALIER_HFRAC[cle] || PALIER_HFRAC_DEFAUT;

// Facteur de COMPENSATION d'un sprite de palier posé dans une boîte plus grande
// que celle pour laquelle il est calibré. Sans lui, une halle d'empreinte 5
// (spanSum 10) étirerait le sprite calibré pour l'empreinte 3 (spanSum 6) d'un
// facteur 1,67 et rouvrirait un portail de 30 px apparents — le mal qu'on
// soigne. Avec lui, le bâtiment garde sa taille écran quand son LOT grandit :
// l'excédent devient une clairière, et c'est le SAUT DE PALIER (changement
// d'ère) qui apporte la masse. Doctrine §7.2 du plan.
// Jamais > 1 : une boîte plus PETITE que le calibrage ne regonfle pas le sprite.
export function palierK(spanSumCalibre, spanSumReel) {
  if (!(spanSumReel > 0) || !(spanSumCalibre > 0)) return 1;
  return Math.min(1, spanSumCalibre / spanSumReel);
}
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
