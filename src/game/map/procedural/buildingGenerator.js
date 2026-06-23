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
  { base: ["block", "block", "tenement"], poor: ["tenement", "tenement", "block"], rich: ["block", "manor"] },
  { base: ["block", "tenement", "tower"], poor: ["tenement", "tenement", "block"], rich: ["tower", "block"] },
  { base: ["tower", "block", "megablock", "arcologyhome"], poor: ["megablock", "tenement", "tower"], rich: ["arcologyhome", "tower"] }
];

const VARIANTS_PUBLIC = [
  { base: ["firepit"] },
  { base: ["market", "granary"], sacred: ["granary", "market"], trade: ["market", "market", "granary"] },
  { base: ["temple", "market", "hall"], sacred: ["temple", "temple", "hall"], military: ["hall", "market"], trade: ["market", "hall", "temple"] },
  { base: ["keep", "hall", "temple"], sacred: ["temple", "hall", "keep"], military: ["keep", "keep", "hall"], trade: ["market", "hall", "keep"], prestige: ["palace", "keep", "hall"] },
  { base: ["forum", "palace", "market"], sacred: ["temple", "forum", "palace"], military: ["keep", "forum"], prestige: ["palace", "forum", "palace"] },
  { base: ["station", "tower", "forum"], prestige: ["palace", "station", "forum"], military: ["keep", "station"] },
  { base: ["spire", "station", "archive"], prestige: ["spire", "spire", "station"] }
];

const VARIANTS_LIBRARY = [
  { base: ["shrine"] },
  { base: ["shrine"], scholar: ["shrine", "school"] },
  { base: ["school", "temple"], sacred: ["temple", "shrine"], scholar: ["school", "school", "library"] },
  { base: ["library", "scribehall"], sacred: ["temple", "library"], scholar: ["library", "scribehall", "academy"] },
  { base: ["academy", "archive"], scholar: ["academy", "university", "archive"] },
  { base: ["university", "observatory"], scholar: ["university", "observatory", "academy"] },
  { base: ["datavault", "observatory"], scholar: ["datavault", "observatory", "university"] }
];

function variantList(table, band, bias) {
  const row = table[Math.max(0, Math.min(table.length - 1, band))];
  return (bias && row[bias]) || row.base;
}

// Affinité catégorie ↔ type de quartier : un bonus de placement quand la
// cellule est dans le rayon d'une ancre du bon kind.
const CATEGORY_AFFINITY = {
  house: { habitat: 1.4, marchand: 0.6, agricole: 0.5, prestige: 0.4 },
  public: { marchand: 1.4, prestige: 1.2, militaire: 1.1, religieux: 0.7, habitat: 0.4 },
  library: { savant: 1.6, religieux: 1.3, prestige: 0.7 },
  farm: { agricole: 1.8, habitat: 0.3 }
};

export function createBuildingPlacer({
  cells, plan, roadKey, counts, personality, seed, nearSet, N, requireRoad = false
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

  const plazaProximity = (gx, gy) => {
    let best = 0;
    for (const p of plan.plazas || []) {
      const d = Math.hypot(gx - p.gx, gy - p.gy);
      const prox = Math.max(0, 5 - d) / 5;
      if (prox > best) best = prox;
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
      + jitter(c.gx, c.gy, "house"),
    public: (c) => coreDist(c) * 1.1
      - roadAdj(c.gx, c.gy) * 20
      - anchorAffinity(c.gx, c.gy, "public") * 24
      - plazaProximity(c.gx, c.gy) * 30
      + jitter(c.gx, c.gy, "public"),
    library: (c) => coreDist(c) * 1.0
      - roadAdj(c.gx, c.gy) * 14
      - anchorAffinity(c.gx, c.gy, "library") * 26
      - plazaProximity(c.gx, c.gy) * 12
      + jitter(c.gx, c.gy, "library"),
    farm: (c) => -coreDist(c) * 0.6
      - anchorAffinity(c.gx, c.gy, "farm") * 30
      - (nearSet.has(c.gx + "," + c.gy) ? 24 : 0)
      + jitter(c.gx, c.gy, "farm")
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

  const chooseVariant = (category, n, cell) => {
    if (category === "farm") {
      const rural = bias === "rural";
      if (counts.eraBand >= 4) return rural && n % 3 === 0 ? "field" : "industrial";
      if (counts.eraBand >= 2) return "field";
      return rural && n % 2 === 0 ? "field" : "patch";
    }
    const table = category === "house" ? VARIANTS_HOUSE : category === "public" ? VARIANTS_PUBLIC : VARIANTS_LIBRARY;
    const list = variantList(table, counts.eraBand, bias);
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
    const shrineQuarters = category === "library" ? new Set() : null;
    let placed = 0;
    for (let i = 0; i < list.length && placed < count; i += 1) {
      const cell = list[i];
      const k = cell.gx + "," + cell.gy;
      if (usedKeys.has(k)) continue;
      // PR2 — placement par lots : tout bâtiment décoratif doit border une rue
      // (route dans le 8-voisinage). Sans rue adjacente, la cellule est ignorée
      // → plus d'orphelins « au milieu de nulle part », plus de sentier à tracer.
      if (requireRoad && roadAdj(cell.gx, cell.gy) < 1) continue;
      const variant = chooseVariant(category, placed, cell);
      if (category === "library" && variant === "shrine") {
        const qid = quarterIdAt(cell.gx, cell.gy);
        if (shrineQuarters.has(qid)) continue;
        shrineQuarters.add(qid);
      }
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

  return { placeCategory, chooseVariant, orderedList, quarterKindAt, quarterIdAt, roadAdj, requireRoad };
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
    cellFree, chooseVariant, quarterKindAt, quarterIdAt, pushTile, clamp
  } = ctx;
  const slotKey = (i) => cycle + ":dec_" + category + ":" + i;
  const shrineQuarters = category === "library" ? new Set() : null;
  let placed = 0;

  const finalize = (i, cell) => {
    // L'index PERSISTANT `i` (pas le rang d'attribution) pilote chooseVariant :
    // le design reste stable à position fixe et n'évolue que par eraBand.
    const variant = chooseVariant(category, i, cell);
    if (shrineQuarters && variant === "shrine") {
      const qid = quarterIdAt(cell.gx, cell.gy);
      if (shrineQuarters.has(qid)) return false; // un seul sanctuaire par quartier
      shrineQuarters.add(qid);
    }
    const dx = cell.gx - cx, dy = cell.gy - cy;
    pushTile({
      gx: cell.gx, gy: cell.gy, type: category, variant,
      qkind: quarterKindAt(cell.gx, cell.gy),
      key: cell.gx + "," + cell.gy,
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
