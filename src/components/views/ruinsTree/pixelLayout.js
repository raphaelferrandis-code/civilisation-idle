"use strict";

// Layout de l'Arbre des Ruines PEINT : projette les ancres posées à la main sur
// l'illustration (anchors.js) en positions SOURCE (px de l'image). Pur et
// déterministe — la composition EST l'illustration, ce module ne fait que
// filtrer (visibilité) et rassembler. L'écran multiplie par le zoom entier.
import {
  PRESTIGE_TREE,
  PRESTIGE_TREE_BRANCHES,
  PRESTIGE_DOGMAS,
  upgrades,
} from "../../../game/data/upgrades.js";
import {
  TREE_ART,
  HUB_ANCHOR,
  PIXEL_LAYOUT,
  NODE_ANCHORS,
  DOGMA_ANCHORS,
  GATE_ANCHORS,
} from "./anchors.js";

// Invariant dev-only : chaque nœud/dogme des DONNÉES doit avoir une ancre —
// un id ajouté sans ancre casserait silencieusement (nœud invisible).
if (import.meta.env?.DEV) {
  for (const node of PRESTIGE_TREE) {
    if (!NODE_ANCHORS[node.id]) throw new Error(`Ancre manquante pour le nœud de ruines "${node.id}" (anchors.js).`);
  }
  for (const dogma of PRESTIGE_DOGMAS) {
    if (!DOGMA_ANCHORS[dogma.id]) throw new Error(`Ancre manquante pour le dogme "${dogma.id}" (anchors.js).`);
  }
  for (const branch of PRESTIGE_TREE_BRANCHES) {
    for (let t = 1; t < branch.tiers.length; t++) {
      if (!GATE_ANCHORS[`${branch.id}:${t}`]) throw new Error(`Ancre de porte manquante "${branch.id}:${t}" (anchors.js).`);
    }
  }
}

// Rayons en px SOURCE (les rayons d'anchors.js sont en px écran au zoom de référence).
const toSrc = (r) => r / PIXEL_LAYOUT.REF_SCALE;

export function computePixelTreeLayout(visibleIds, options = {}) {
  const dogmaDefs = options.dogmas || PRESTIGE_DOGMAS;

  const nodes = [];
  const pos = {}; // id → {x, y} source (fils d'exclusion, bulles)

  for (const node of PRESTIGE_TREE) {
    if (!visibleIds.has(node.id)) continue;
    const a = NODE_ANCHORS[node.id];
    if (!a) continue;
    nodes.push({
      id: node.id,
      branch: node.branch,
      tier: node.tier,
      x: a.x,
      y: a.y,
      r: toSrc(node.capstone ? PIXEL_LAYOUT.CAPSTONE_R : PIXEL_LAYOUT.NODE_R),
      capstone: node.capstone,
    });
    pos[node.id] = { x: a.x, y: a.y };
  }

  const dogmas = [];
  for (const d of dogmaDefs) {
    const a = DOGMA_ANCHORS[d.id];
    if (!a) continue;
    dogmas.push({
      id: d.id,
      branch: d.branch,
      requiredPurchases: d.requiredPurchases,
      tier: d.tier,
      x: a.x,
      y: a.y,
      r: toSrc(PIXEL_LAYOUT.DOGMA_R),
    });
    pos[d.id] = { x: a.x, y: a.y };
  }

  // Portes de palier : une par (branche, palier ≥ 1) — le compteur n/m vit là.
  const gates = [];
  for (const branch of PRESTIGE_TREE_BRANCHES) {
    for (let t = 1; t < branch.tiers.length; t++) {
      const g = GATE_ANCHORS[`${branch.id}:${t}`];
      if (!g) continue;
      gates.push({ branch: branch.id, tier: t, x: g.x, y: g.y, need: branch.unlock?.[t] ?? 0 });
    }
  }

  // Fils d'exclusion (paires conflictsWith — dogmes) : surlignés au survol.
  const exclusionLinks = [];
  const seen = new Set();
  for (const u of upgrades) {
    if (!u.conflictsWith) continue;
    const key = [u.id, u.conflictsWith].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    if (pos[u.id] && pos[u.conflictsWith]) {
      exclusionLinks.push({ ids: [u.id, u.conflictsWith], a: pos[u.id], b: pos[u.conflictsWith] });
    }
  }

  return {
    nodes,
    dogmas,
    gates,
    exclusionLinks,
    pos,
    hub: { x: HUB_ANCHOR.x, y: HUB_ANCHOR.y },
    size: { w: TREE_ART.w, h: TREE_ART.h },
  };
}
