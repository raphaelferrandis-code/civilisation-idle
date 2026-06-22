"use strict";

// Layout « RONDS » (cluster-wheels type PoE) & déterministe de l'arbre des ruines.
// Aucune dépendance React, aucun Math.random : mêmes entrées → mêmes positions.
//
// Grammaire unique : un HUB central ; de lui partent 5 BRANCHES (rayons à 72°),
// chacune = une CHAÎNE DE RONDS. Un rond = un PALIER : ses nœuds disposés en
// CERCLE autour d'un CŒUR, reliés au cœur par des RAYONS courts. Le cœur d'un
// rond est, par priorité : le CAPSTONE (dernier palier, nœud achetable), sinon
// un DOGME (paliers I/II/III), sinon un SCEAU « palier scellé » (s'allume une
// fois le rond complété). PAS d'anneau dessiné autour du cluster.
//
// Tous les segments (chaîne entre ronds, rayons cœur↔nœuds) s'ARRÊTENT sur le
// CONTOUR des cercles — jamais jusqu'aux centres, jamais à travers un cercle.
//
// Le gating réel reste un COMPTEUR (ownedInBranchBelowTier) ; les seuils sont
// matérialisés par les PORTES de palier posées sur la chaîne entre deux ronds.
// La seule arête de graphe inter-nœuds est le conflit `conflictsWith` (au survol).
import {
  PRESTIGE_TREE_BRANCHES,
  PRESTIGE_DOGMAS,
  upgrades,
} from "../../../game/data/upgrades.js";
import { BRANCH_ORDER } from "./branchTheme.js";

const TAU = Math.PI * 2;

// Constantes géométriques (toutes ajustables sans toucher aux données).
export const LAYOUT = {
  R0: 140,         // sizing du moyeu (disque = R0 * 0.46)
  RC0: 178,        // distance moyeu → centre du 1er rond
  RC_STEP: 206,    // distance entre centres de ronds consécutifs (barre visible)
  ORBIT_R: 60,     // rayon d'orbite des nœuds autour du cœur
  CLUSTER_R: 78,   // rayon du cluster (où la chaîne se raccroche) — pas d'anneau dessiné
  NODE_R: 17,      // rayon disque-nœud (orbite)
  DOGMA_R: 22,     // cœur-dogme
  CAPSTONE_R: 26,  // cœur-capstone (objectif final)
  SEAL_R: 18,      // cœur-sceau (palier sans dogme)
  GATE_R: 13,      // porte de palier
  MARGIN: 130,     // marge du viewBox
};

const byId = Object.fromEntries(upgrades.map((u) => [u.id, u]));

// Angle du rayon d'une branche : 5 rayons réguliers (72°), sens horaire depuis
// le haut, dans l'ordre BRANCH_ORDER. knowledge en haut (−90°).
function branchAngle(branchId) {
  const i = BRANCH_ORDER.indexOf(branchId);
  return -Math.PI / 2 + (i < 0 ? 0 : i) * (TAU / 5);
}

// "Palier I/II/III" → index de palier 0/1/2 (position du cœur-dogme).
const ROMAN = { I: 0, II: 1, III: 2, IV: 3, V: 4 };
function dogmaTierIndex(dogma) {
  const m = /\b(III|II|IV|V|I)\b/.exec(dogma.tier || "");
  return m ? ROMAN[m[1]] : null;
}

export function computeRuinTreeLayout(visibleIds, options = {}) {
  const branches = options.branches || PRESTIGE_TREE_BRANCHES;
  const dogmaDefs = options.dogmas || PRESTIGE_DOGMAS;
  const isVisible = (id) => visibleIds.has(id);

  const hub = { x: 0, y: 0 };
  const nodes = [];     // nœuds achetables : orbite + cœur-capstone
  const edges = [];     // rayons décoratifs cœur ↔ nœud, clippés sur les contours
  const trunks = [];    // chaîne : moyeu/rond → rond (segments clippés)
  const gates = [];     // porte de palier entre deux ronds
  const dogmas = [];    // cœurs-dogmes
  const seals = [];     // cœurs-sceaux (palier sans dogme/capstone)
  const ronds = [];     // centres des ronds (données, pas d'anneau dessiné)
  const pos = {};       // id → {x, y} (pour les fils d'exclusion)

  let maxRadius = LAYOUT.RC0;

  for (const branch of branches) {
    const angle = branchAngle(branch.id);
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);

    // Dogmes ACCESSIBLES de la branche, indexés par palier (I/II/III → 0/1/2).
    const dogmaAtTier = {};
    for (const d of dogmaDefs) {
      if (d.branch !== branch.id) continue;
      const ti = dogmaTierIndex(d);
      if (ti != null) dogmaAtTier[ti] = d;
    }

    const rondCenters = []; // {t, cx, cy} des ronds visibles, dans l'ordre

    branch.tiers.forEach((tierIds, t) => {
      const visTier = tierIds.filter(isVisible);
      if (visTier.length === 0) return;

      const radius = LAYOUT.RC0 + t * LAYOUT.RC_STEP;
      const cx = radius * ca;
      const cy = radius * sa;
      // Cœur du rond : capstone > dogme > sceau (+ son rayon de clip).
      const capstoneId = visTier.find((id) => byId[id]?.capstone);
      const dogma = capstoneId ? null : dogmaAtTier[t];
      const orbitIds = capstoneId ? visTier.filter((id) => id !== capstoneId) : visTier;
      const coeurR = capstoneId ? LAYOUT.CAPSTONE_R : (dogma ? LAYOUT.DOGMA_R : LAYOUT.SEAL_R);

      // Nœuds d'orbite + rayon CLIPPÉ (du bord du nœud au bord du cœur). On repère
      // au passage le nœud le plus INTÉRIEUR (côté moyeu) et le plus EXTÉRIEUR :
      // ce sont eux que la chaîne reliera d'un rond à l'autre (lien nœud→nœud).
      const k = orbitIds.length;
      let innerNode = { x: cx, y: cy };
      let outerNode = { x: cx, y: cy };
      let innerC = Infinity;
      let outerC = -Infinity;
      orbitIds.forEach((id, j) => {
        const a = -Math.PI / 2 + (j * TAU) / Math.max(1, k);
        const nx = cx + LAYOUT.ORBIT_R * Math.cos(a);
        const ny = cy + LAYOUT.ORBIT_R * Math.sin(a);
        nodes.push({ id, branch: branch.id, tier: t, x: nx, y: ny, r: LAYOUT.NODE_R, capstone: false, angle: a });
        pos[id] = { x: nx, y: ny };
        const ux = (cx - nx) / LAYOUT.ORBIT_R; // nœud → cœur (unitaire)
        const uy = (cy - ny) / LAYOUT.ORBIT_R;
        const x1 = nx + ux * LAYOUT.NODE_R;
        const y1 = ny + uy * LAYOUT.NODE_R;
        const x2 = cx - ux * coeurR;
        const y2 = cy - uy * coeurR;
        edges.push({ id, branch: branch.id, tier: t, x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 });
        const proj = Math.cos(a - angle); // projection sur l'axe sortant de la branche
        if (proj > outerC) { outerC = proj; outerNode = { x: nx, y: ny }; }
        if (proj < innerC) { innerC = proj; innerNode = { x: nx, y: ny }; }
      });

      rondCenters.push({ t, cx, cy, coeurR, innerNode, outerNode });

      // Cœur du rond.
      if (capstoneId) {
        nodes.push({ id: capstoneId, branch: branch.id, tier: t, x: cx, y: cy, r: LAYOUT.CAPSTONE_R, capstone: true, angle });
        pos[capstoneId] = { x: cx, y: cy };
      } else if (dogma) {
        dogmas.push({ id: dogma.id, branch: branch.id, requiredPurchases: dogma.requiredPurchases, tier: dogma.tier, x: cx, y: cy, r: LAYOUT.DOGMA_R });
        pos[dogma.id] = { x: cx, y: cy };
      } else {
        seals.push({ branch: branch.id, tier: t, x: cx, y: cy, r: LAYOUT.SEAL_R, nodeIds: orbitIds.slice() });
      }

      ronds.push({ branch: branch.id, tier: t, x: cx, y: cy, r: LAYOUT.CLUSTER_R, nodeIds: orbitIds.slice() });
      maxRadius = Math.max(maxRadius, radius + LAYOUT.CLUSTER_R);
    });

    // Chaîne nœud → nœud : on relie le nœud EXTÉRIEUR d'un rond au nœud INTÉRIEUR
    // du suivant, le lien s'arrêtant sur le CONTOUR des deux nœuds (dans l'espace
    // entre les clusters). Le moyeu se relie au nœud intérieur du 1er rond. La
    // porte de palier se pose au milieu de ce lien.
    let prevExit = hub;           // point de sortie précédent (moyeu, puis nœud extérieur)
    let prevR = LAYOUT.R0 * 0.46; // rayon de clip du point de sortie
    rondCenters.forEach((rc, idx) => {
      const entry = rc.innerNode; // on entre par le nœud le plus proche du moyeu
      const dx = entry.x - prevExit.x;
      const dy = entry.y - prevExit.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const x1 = prevExit.x + ux * prevR;
      const y1 = prevExit.y + uy * prevR;
      const x2 = entry.x - ux * LAYOUT.NODE_R;
      const y2 = entry.y - uy * LAYOUT.NODE_R;
      trunks.push({ branch: branch.id, tier: rc.t, x1, y1, x2, y2 });
      if (idx > 0) {
        gates.push({
          branch: branch.id,
          tier: rc.t,
          x: (prevExit.x + entry.x) / 2,
          y: (prevExit.y + entry.y) / 2,
          need: branch.unlock?.[rc.t] ?? 0,
        });
      }
      prevExit = rc.outerNode;     // on ressort par le nœud le plus éloigné du moyeu
      prevR = LAYOUT.NODE_R;
    });
  }

  // Fils d'exclusion : la seule vraie arête (paires conflictsWith inter-branche).
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

  const R = maxRadius + LAYOUT.MARGIN;
  const viewBox = `${-R} ${-R} ${2 * R} ${2 * R}`;

  return { hub, nodes, edges, trunks, gates, dogmas, seals, ronds, exclusionLinks, pos, maxRadius, viewBox };
}
