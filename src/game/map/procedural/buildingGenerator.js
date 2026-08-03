/* ============================================================================
 * buildingGenerator.js — BuildingGenerator
 *   Place les bâtiments décoratifs par catégorie en respectant le plan :
 *     - chaque catégorie a son propre classement des cellules (les maisons
 *       cherchent les quartiers d'habitat ET le bord des rues, les fermes la
 *       périphérie et la rive, les temples les places...) ;
 *     - les variantes visuelles dépendent de l'âge ET de la personnalité de
 *       la ville (une cité fastueuse n'aligne pas les mêmes façades qu'une
 *       cité modeste du même âge).
 *   Pour ajouter une variante : l'inscrire dans VARIANTS_* ci-dessous (elle
 *   doit exister dans renderBuildings/buildingShapes) — aucun autre fichier
 *   à modifier.
 * ============================================================================ */

import { hashString, mixSeed } from "./seedManager.js";

// ── Tables de variantes par bande d'ère ─────────────────────────────────────
// Chaque entrée : { base: [variantes neutres], <variantBias>: [variantes biaisées] }
const VARIANTS_HOUSE = [
  { base: ["tent"], poor: ["tent"], rich: ["hut"] },
  { base: ["hut", "hut", "longhouse"], poor: ["tent", "hut", "hut"], rich: ["longhouse", "hut"] },
  { base: ["townhouse", "townhouse", "courtyard"], poor: ["hut", "townhouse"], rich: ["courtyard", "townhouse", "manor"] },
  { base: ["stonehouse", "stonehouse", "manor"], poor: ["townhouse", "stonehouse"], rich: ["manor", "stonehouse"] },
  // b4 = Marbre / antiquité classique (habitants en toge) : pierre, cours et villas.
  // PAS d'immeuble ici — `block`/`tenement` (façades d'appartements XIXe) démarrent en
  // b5 = Fonte (époque industrielle), sinon on obtient « immeubles + toges ».
  { base: ["courtyard", "stonehouse", "courtyard", "manor"], poor: ["stonehouse", "townhouse", "courtyard"], rich: ["manor", "courtyard", "manor"] },
  { base: ["block", "tenement", "tower"], poor: ["tenement", "tenement", "block"], rich: ["tower", "block"] },
  { base: ["tower", "block", "megablock", "arcologyhome"], poor: ["megablock", "tenement", "tower"], rich: ["arcologyhome", "tower"] }
];

function variantList(table, band, bias) {
  const row = table[Math.max(0, Math.min(table.length - 1, band))];
  return (bias && row[bias]) || row.base;
}

// Empreinte au sol [largeur, profondeur] (en tuiles) par variante. Les grands
// bâtiments de late game réservent plus qu'une tuile : leur sprite est bien plus
// grand, donc la « tuile » grandit avec lui → plus de chevauchement des voisins.
//  - tours/immeubles FINS mais HAUTS : 1 large × 2 profond (denses côte à côte,
//    espacés en profondeur pour ne pas se recouvrir de face) ;
//  - mega-complexes LARGES : 2×2. Défaut 1×1.
const HOUSE_FOOTPRINT = {
  manor: [2, 2],                  // grande demeure (sprite ~1,3 tuile de large) : réserve son lot pour garder sa masse sans déborder
  tenement: [1, 2], tower: [1, 2],
  megablock: [2, 2], arcologyhome: [2, 2],
  supertower: [2, 2]              // super-tour B3 : rare (cf. SUPER_SLOTS), la plus haute du bâti
};
// EMPREINTES ÉLARGIES aux bandes cosmiques (reprise mégalopole, Raph 2026-08-03 :
// « les tours âge cosmique de plusieurs tuiles de large ») : la tour cesse d'être
// une aiguille d'une tuile pour devenir un monolithe 2×2, la Tour-monde un
// colosse 3×3. ⚠ L'ART DOIT SUIVRE : l'échelle de dessin dépend de l'empreinte
// (pixelHouseGeom : unit = w/spanX) — un sprite cousu pour 1×2 dessiné sur 2×2
// RAPETISSE d'un tiers. Les sprites tower-cosmic/supertower-cosmic sont générés
// pour CES empreintes (contenu ≤ 95 px / ≤ 142 px). Avant la bande 7, rien ne bouge.
const HOUSE_FOOTPRINT_COSMIC = { tower: [2, 2], supertower: [3, 3] };
export const houseFootprint = (variant, eraBand = 0) =>
  (eraBand >= 7 && HOUSE_FOOTPRINT_COSMIC[variant]) || HOUSE_FOOTPRINT[variant] || [1, 1];

// Affinité catégorie ↔ type de quartier : un bonus de placement quand la
// cellule est dans le rayon d'une ancre du bon kind.
const CATEGORY_AFFINITY = {
  house: { habitat: 1.4, marchand: 0.6, agricole: 0.5, prestige: 0.4 }
};

export function createBuildingPlacer({
  cells, plan, roadKey, counts, personality, seed, N, requireRoad = false
}) {
  const bias = personality.variantBias;
  const core = plan.core;
  const maxDist = Math.max(1, Math.hypot(N / 2, N / 2));

  // Adjacence aux rues : un bâtiment "tient" sa rue. Bonus fort à 1 cellule,
  // léger à 2 — au-delà, malus (évite les bâtiments orphelins au milieu de rien).
  const roadAdj = (gx, gy) => {
    for (let d = 1; d <= 2; d += 1) {
      if (roadKey.has((gx + d) + "," + gy) || roadKey.has((gx - d) + "," + gy)
        || roadKey.has(gx + "," + (gy + d)) || roadKey.has(gx + "," + (gy - d))
        || (d === 1 && (roadKey.has((gx + 1) + "," + (gy + 1)) || roadKey.has((gx - 1) + "," + (gy - 1))
          || roadKey.has((gx + 1) + "," + (gy - 1)) || roadKey.has((gx - 1) + "," + (gy + 1))))) {
        return d === 1 ? 1 : 0.45;
      }
    }
    return 0;
  };

  // Route dans un rayon de HOUSE_ROAD_RADIUS cellules (Chebyshev). Sert de FILTRE
  // de pose (requireRoad) : les maisons remplissent l'INTÉRIEUR des blocs (pas
  // seulement le liseré de rue → on VEUT des bâtiments au milieu), tout en bornant
  // la distance à une voie (pas d'orphelin perdu au milieu de nulle part, à relier).
  const HOUSE_ROAD_RADIUS = 4;
  const nearRoad = (gx, gy) => {
    for (let dx = -HOUSE_ROAD_RADIUS; dx <= HOUSE_ROAD_RADIUS; dx += 1) {
      for (let dy = -HOUSE_ROAD_RADIUS; dy <= HOUSE_ROAD_RADIUS; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        if (roadKey.has((gx + dx) + "," + (gy + dy))) return true;
      }
    }
    return false;
  };

  const anchorAffinity = (gx, gy, category) => {
    const weights = CATEGORY_AFFINITY[category] || {};
    let best = 0;
    for (const a of plan.anchors || []) {
      const w = weights[a.kind] || 0;
      if (!w) continue;
      const d = Math.hypot(gx + 0.5 - a.gx, gy + 0.5 - a.gy);
      const prox = Math.max(0, a.r * 1.4 - d) / Math.max(1, a.r);
      if (prox * w > best) best = prox * w;
    }
    return best;
  };

  // Désordre contrôlé : plus la ville est organique (order bas) ou en chaos,
  // plus le tirage cellule par cellule est bruité. Hash entier (fonction
  // chaude : une évaluation par cellule et par catégorie).
  const noiseAmp = 14 * (1 - plan.order) + plan.chaos * 22;
  const labelSeeds = {};
  const jitter = (gx, gy, label) => {
    const lh = labelSeeds[label] || (labelSeeds[label] = mixSeed(seed, label));
    const h = (Math.imul(gx | 0, 73856093) ^ Math.imul(gy | 0, 19349663) ^ lh) >>> 0;
    return ((h % 1000) / 1000 - 0.5) * noiseAmp;
  };

  const coreDist = (c) => Math.hypot(c.gx + 0.5 - core.x, c.gy + 0.5 - core.y) / maxDist * 100;

  // Classements par catégorie — plus le score est bas, plus la cellule est
  // attribuée tôt (donc présente dès que la ville est petite).
  const sorters = {
    house: (c) => coreDist(c) * 0.9
      - roadAdj(c.gx, c.gy) * 26
      - anchorAffinity(c.gx, c.gy, "house") * 18
      + jitter(c.gx, c.gy, "house")
  };

  const orderedFor = {};
  const orderedList = (category) => {
    if (!orderedFor[category]) {
      // Décore-trie-retire : le score (boucle sur les ancres) n'est calculé
      // qu'une fois par cellule, pas à chaque comparaison du tri.
      const scorer = sorters[category] || sorters.house;
      orderedFor[category] = cells
        .map((cell) => ({ cell, s: scorer(cell) }))
        .sort((a, b) => a.s - b.s)
        .map((e) => e.cell);
    }
    return orderedFor[category];
  };

  // ── SUPER-TOUR (chantier ÉCHELLE, Lot B3 — docs/PLAN-ECHELLE.md) ───────────
  // La perception du maximum FAIT le maximum : 1-2 exemplaires par ville
  // suffisent à crever la skyline, pas besoin que tout grandisse. Deux SLOTS
  // persistants précis (0 et 12 — les mieux classés du tri, donc près du cœur,
  // posés tôt, et qui ne bougent plus jamais) deviennent « supertower » dès la
  // bande 7. Espacement : registre par RECALCUL (le placer est recréé à chaque
  // compute) ; la seconde est DÉMOTÉE au tirage normal si elle tombe à moins de
  // SUPER_DIST de l'autre — jamais deux côte à côte. Clé PAR SLOT : quand la
  // passe 1 refuse l'empreinte 2×2 et refit le slot ailleurs, il se ré-évalue
  // sans être bloqué par son propre fantôme.
  const SUPER_SLOTS = new Set([0, 12]);
  const SUPER_DIST = 10;
  const supers = new Map();
  // ÎLOTS UNIFORMES aux bandes cosmiques (Raph 2026-08-03 : « de grosses
  // mégalopoles d'immeubles tel cyberpunk, ou ce qu'on voit en Chine ») : le
  // tirage est quantifié par pâté de BLOCK_Q×BLOCK_Q cellules — tout un îlot
  // porte le MÊME variant et se lit en rangées d'immeubles identiques, pas en
  // bric-à-brac. Les teintes suivent déjà : les skins cosmiques n'en ont pas
  // (houseTintOf les exclut). Avant la bande 7, tirage historique inchangé.
  const BLOCK_Q = 3;

  const chooseVariant = (category, n, cell) => {
    if (category === "house" && counts.eraBand >= 7 && SUPER_SLOTS.has(n)) {
      let far = true;
      for (const [si, s] of supers) {
        if (si !== n && Math.max(Math.abs(s.gx - cell.gx), Math.abs(s.gy - cell.gy)) < SUPER_DIST) { far = false; break; }
      }
      if (far) {
        supers.set(n, { gx: cell.gx, gy: cell.gy });
        return "supertower";
      }
    }
    const list = variantList(VARIANTS_HOUSE, counts.eraBand, bias);
    if (counts.eraBand >= 7) {
      const hq = hashString(seed + ":" + category + ":q" + Math.floor(cell.gx / BLOCK_Q) + ":" + Math.floor(cell.gy / BLOCK_Q));
      return list[hq % list.length];
    }
    const h = hashString(seed + ":" + category + ":" + cell.gx + ":" + cell.gy);
    return list[(n + h) % list.length];
  };

  // Quartier d'appartenance d'une cellule : l'ancre la plus proche dont le
  // rayon d'influence la couvre. Sert aux teintes de quartier du rendu.
  const quarterKindAt = (gx, gy) => {
    let best = null, bestD = Infinity;
    for (const a of plan.anchors || []) {
      const d = Math.hypot(gx + 0.5 - a.gx, gy + 0.5 - a.gy);
      if (d <= a.r * 1.5 && d < bestD) { bestD = d; best = a.kind; }
    }
    return best;
  };

  const quarterIdAt = (gx, gy) => {
    let best = "outskirts", bestD = Infinity;
    const anchors = plan.anchors || [];
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      const d = Math.hypot(gx + 0.5 - a.gx, gy + 0.5 - a.gy);
      if (d <= a.r * 1.5 && d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  // Place `count` bâtiments d'une catégorie ; `usedKeys` est partagé avec le
  // placement moteur pour éviter tout chevauchement.
  const placeCategory = (category, count, usedKeys, pushTile) => {
    const list = orderedList(category);
    let placed = 0;
    for (let i = 0; i < list.length && placed < count; i += 1) {
      const cell = list[i];
      const k = cell.gx + "," + cell.gy;
      if (usedKeys.has(k)) continue;
      // PR2 — placement par lots : tout bâtiment décoratif doit être PROCHE d'une
      // rue (rayon HOUSE_ROAD_RADIUS). Assez large pour remplir l'intérieur des
      // blocs (bâtiments au milieu), assez borné pour éviter les orphelins isolés.
      if (requireRoad && !nearRoad(cell.gx, cell.gy)) continue;
      const variant = chooseVariant(category, placed, cell);
      pushTile({
        gx: cell.gx, gy: cell.gy, type: category,
        variant,
        qkind: quarterKindAt(cell.gx, cell.gy),
        key: k, d2: cell.d2
      });
      usedKeys.add(k);
      placed += 1;
    }
    return placed;
  };

  return { placeCategory, chooseVariant, orderedList, quarterKindAt, quarterIdAt, roadAdj, nearRoad, requireRoad };
}

// ── Placement décoratif PERSISTANT (slots) ──────────────────────────────────
// Étend aux décoratifs le mécanisme de slots déjà utilisé par les moteurs : chaque
// index reçoit une position sauvée UNE FOIS (offset core-relatif dans `store`) et
// réutilisée tant qu'elle tient. Le bâtiment ne bouge plus jamais ; seul son design
// (variant, piloté par eraBand) évolue. Pur/testable : toutes les dépendances au
// monde (cellFree, pushTile, store, chooseVariant…) sont injectées. Renvoie le
// nombre de bâtiments posés.
//
// Deux passes :
//   1. réutilise les positions sauvées (épingle l'existant) ;
//   2. comble les index manquants depuis le tri `ordered` (nouveaux à la frange).
// Sur une partie fraîche (aucun slot), la passe 1 ne fait rien et la passe 2
// reproduit à l'identique le placement positionnel d'origine.
export function placeCategorySlotted(category, count, ctx) {
  const {
    ordered, store, live, cx, cy, N, cycle,
    cellFree, chooseVariant, quarterKindAt, pushTile, clamp,
    eraBand = 0
  } = ctx;
  const slotKey = (i) => cycle + ":dec_" + category + ":" + i;
  let placed = 0;

  const finalize = (i, cell) => {
    // L'index PERSISTANT `i` (pas le rang d'attribution) pilote chooseVariant :
    // le design reste stable à position fixe et n'évolue que par eraBand.
    const variant = chooseVariant(category, i, cell);
    // Empreinte multi-tuiles des grands bâtiments : refuse la pose si le rectangle
    // complet ne tient pas (cellFree est span-aware côté runtime) → refit ailleurs.
    const [spanX, spanY] = houseFootprint(variant, eraBand);
    if ((spanX > 1 || spanY > 1) && !cellFree(cell.gx, cell.gy, spanX, spanY)) return false;
    const dx = cell.gx - cx, dy = cell.gy - cy;
    pushTile({
      gx: cell.gx, gy: cell.gy, type: category, variant, spanX, spanY,
      qkind: quarterKindAt(cell.gx, cell.gy),
      key: cell.gx + "," + cell.gy,
      revealIdx: i,   // index de slot persistant → ordre de révélation per-buy (catégorie enginehome)
      d2: cell.d2 != null ? cell.d2 : dx * dx + dy * dy
    });
    store[slotKey(i)] = { dx, dy, zone: "dec", id: category };
    live.add(slotKey(i));
    placed += 1;
    return true;
  };

  // Passe 1 — réutiliser les positions sauvées.
  const reused = new Set();
  for (let i = 0; i < count; i += 1) {
    const slot = store[slotKey(i)];
    if (!slot) continue;
    const gx = clamp(cx + (Number(slot.dx) || 0), 0, N - 1);
    const gy = clamp(cy + (Number(slot.dy) || 0), 0, N - 1);
    if (!cellFree(gx, gy)) continue; // devenue route/eau/occupée → refit en passe 2
    if (finalize(i, { gx, gy })) reused.add(i);
  }

  // Passe 2 — combler les index manquants depuis le tri.
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    if (reused.has(i)) continue;
    while (cursor < ordered.length) {
      const cell = ordered[cursor++];
      if (!cellFree(cell.gx, cell.gy)) continue;
      if (finalize(i, cell)) break;
    }
  }
  return placed;
}
