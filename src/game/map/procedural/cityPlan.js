/* ============================================================================
 * cityPlan.js — CityLayoutGenerator
 *   Décide de la forme globale de la ville : archétype de plan, cœur urbain
 *   (pas forcément le centre de la grille), quartiers thématiques, places,
 *   silhouette organique. Tout est dérivé de la seed de partie : la même ville
 *   garde sa morphologie en grandissant, deux parties n'ont jamais la même.
 *
 *   Archétypes :
 *     scattered   — village dispersé, poches d'habitat reliées par des sentiers
 *     crossroads  — bourg né d'un croisement de routes
 *     linear      — ville-rue étirée le long du fleuve ou d'un grand axe
 *     radial      — cité concentrique autour d'un cœur
 *     districts   — ville dense par quartiers différenciés
 *     capital     — capitale planifiée en grille avec grandes avenues
 *     megalopolis — mégalopole stratifiée, grille + boulevards + rocades
 * ============================================================================ */

import { rngFrom, seededWeightedPick } from "./seedManager.js";

// Kinds de quartier : pondérés par la personnalité de la ville.
const ANCHOR_KINDS = ["habitat", "marchand", "religieux", "militaire", "agricole", "savant", "prestige"];

function anchorKindWeights(personality) {
  const bias = personality.buildingBias || {};
  return [
    { value: "habitat", weight: 16 * (bias.house || 1) },
    { value: "marchand", weight: 10 * (personality.variantBias === "trade" ? 1.8 : 1) },
    { value: "religieux", weight: 8 * (personality.variantBias === "sacred" ? 2 : 1) },
    { value: "militaire", weight: 7 * (personality.variantBias === "military" ? 2 : 1) },
    { value: "agricole", weight: 9 * (bias.farm || 1) },
    { value: "savant", weight: 8 * (bias.library || 1) },
    { value: "prestige", weight: 6 * (personality.variantBias === "prestige" || personality.variantBias === "rich" ? 1.9 : 1) }
  ];
}

// L'archétype est choisi parmi ceux que l'âge autorise, selon une préférence
// seedée STABLE sur toute la partie : une ville "linéaire" le reste tant que
// l'âge le permet, puis évolue vers le plan le plus proche de son tempérament.
function pickArchetype(seed, ageCfg, personality) {
  let best = ageCfg.archetypes[0];
  let bestScore = -1;
  for (const name of ageCfg.archetypes) {
    let score = rngFrom(seed, "arch-pref:" + name)();
    // La personnalité tire légèrement vers certains plans.
    if (personality.id === "imperiale" && (name === "capital" || name === "radial")) score += 0.25;
    if (personality.id === "agricole" && (name === "scattered" || name === "linear")) score += 0.25;
    if (personality.id === "marchande" && (name === "crossroads" || name === "linear")) score += 0.2;
    if (personality.id === "militaire" && (name === "radial" || name === "districts")) score += 0.2;
    if (score > bestScore) { bestScore = score; best = name; }
  }
  return best;
}

// Génère les ancres de quartier cumulativement : chaque bande d'ère ajoute ses
// quartiers SANS déplacer ceux des bandes précédentes (croissance cohérente).
function buildAnchors({ seed, counts, personality, archetype, core, reachBase, N, riverYAt }) {
  const anchors = [];
  const usedKinds = [];
  for (let band = 0; band <= counts.eraBand; band += 1) {
    const bandRng = rngFrom(seed, "anchors:" + band);
    const wanted = band === 0 ? 1 : band <= 2 ? 2 : 3;
    for (let i = 0; i < wanted; i += 1) {
      const kind = seededWeightedPick(seed, `anchor-kind:${band}:${i}`, anchorKindWeights(personality));
      let angle = bandRng() * Math.PI * 2;
      let distMul = 0.45 + bandRng() * 0.55;
      if (archetype === "linear") {
        // Ville-rue : les quartiers s'égrènent le long de l'axe est-ouest.
        angle = (bandRng() < 0.5 ? 0 : Math.PI) + (bandRng() - 0.5) * 0.55;
        distMul = 0.5 + bandRng() * 0.65;
      } else if (archetype === "radial" || archetype === "capital") {
        // Répartition angulaire régulière, sectorisée par bande.
        angle = ((anchors.length % 7) / 7) * Math.PI * 2 + bandRng() * 0.7;
      }
      const reach = reachBase * distMul;
      let gx = core.x + Math.cos(angle) * reach;
      let gy = core.y + Math.sin(angle) * reach;
      // Le quartier agricole préfère la rive ; le militaire les abords.
      if (kind === "agricole" && riverYAt) {
        gy = (gy + (riverYAt(gx) - 3)) / 2;
      }
      gx = Math.max(2, Math.min(N - 3, gx));
      gy = Math.max(2, Math.min(N - 3, gy));
      anchors.push({
        label: `${kind}-${band}-${i}`,
        kind, band, angle,
        gx, gy,
        r: Math.max(3.2, reachBase * (0.13 + bandRng() * 0.08)),
        strength: kind === "habitat" ? 1.2 : 1
      });
      usedKinds.push(kind);
    }
  }
  return anchors;
}

// Places publiques typées, placées là où la vie les justifie :
//   centrale — le cœur historique, près du noyau fondateur ;
//   marche   — au centre du quartier marchand (étals, balance publique) ;
//   parvis   — devant le quartier religieux (statue votive, braseros) ;
//   jardin   — square public du quartier de prestige (ères avancées).
// Espacement minimal pour éviter deux places collées.
function buildPlazas({ seed, counts, ageCfg, personality, core, anchors, corridorAt }) {
  const plazas = [];
  if (ageCfg.plazaSize <= 0) return plazas;
  // Une vraie place : jamais moins de 2×2, jusqu'à 5×5 en mégalopole fastueuse.
  const size = Math.max(2, Math.min(5, Math.round(ageCfg.plazaSize * Math.min(1.5, personality.plazaBias)) + 1));
  const rng = rngFrom(seed, "plazas");
  const farEnough = (gx, gy) =>
    plazas.every((p) => Math.hypot(gx - p.gx, gy - p.gy) > (p.size + size) * 1.6);
  // Une place ne se pose jamais sur l'eau/la berge : on teste son emprise
  // (même convention que roadGraph.plaza : centre gx,gy, demi-taille floor(size/2))
  // + 1 cellule de marge pour ne pas coller au quai.
  const touchesCorridor = (gx, gy, sz) => {
    if (!corridorAt) return false;
    const half = Math.floor(sz / 2);
    for (let dx = -half - 1; dx <= sz - half; dx += 1)
      for (let dy = -half - 1; dy <= sz - half; dy += 1)
        if (corridorAt(gx + dx, gy + dy)) return true;
    return false;
  };
  // Place centrale : si elle mord le corridor, on la repousse vers l'intérieur
  // (le fleuve coule au sud → on remonte vers le nord jusqu'au dégagement).
  let cgx = Math.round(core.x + (rng() - 0.5) * 3);
  let cgy = Math.round(core.y + (rng() - 0.5) * 3);
  for (let guard = 0; guard < 24 && touchesCorridor(cgx, cgy, size); guard += 1) cgy -= 1;
  plazas.push({ gx: cgx, gy: cgy, size, kind: "centrale" });
  if (counts.eraBand >= 2) {
    const kindFor = { marchand: "marche", religieux: "parvis", prestige: "jardin" };
    const maxExtra = 1 + Math.round(2 * personality.plazaBias);
    // Les ancres récentes d'abord : les places de quartier suivent l'expansion.
    for (const a of anchors) {
      if (plazas.length >= 1 + maxExtra) break;
      const kind = kindFor[a.kind];
      if (!kind) continue;
      if (kind === "jardin" && counts.eraBand < 4) continue; // squares publics : ères avancées
      const gx = Math.round(a.gx), gy = Math.round(a.gy);
      const pSize = Math.max(2, size - 1);
      if (!farEnough(gx, gy)) continue;
      if (touchesCorridor(gx, gy, pSize)) continue;          // jamais sur le fleuve/quai
      plazas.push({ gx, gy, size: pSize, kind });
    }
  }
  return plazas;
}

export function generateCityPlan({ seed, counts, personality, ageCfg, N, cx, cy, riverYAt, corridorAt }) {
  const rng = rngFrom(seed, "plan");
  const archetype = pickArchetype(seed, ageCfg, personality);
  const order = Math.max(0, Math.min(1, ageCfg.order + personality.orderDelta));
  const chaos = Math.max(0, Math.min(1, personality.chaos + (1 - order) * 0.12));

  // Cœur urbain décalé du centre de grille (borné : la rivière coule au sud).
  const core = {
    x: cx + (rng() - 0.5) * N * 0.16,
    y: cy + (rng() - 0.62) * N * 0.14
  };

  // Silhouette organique : lobes seedés + excentricité selon l'archétype.
  // (remplace l'ancienne silhouette dérivée de l'ère, identique à chaque partie)
  const lobeA = rng() * Math.PI * 2;
  const lobeB = rng() * Math.PI * 2;
  const lobeAmp = archetype === "scattered" ? 0.3 : archetype === "capital" || archetype === "megalopolis" ? 0.1 : 0.2;
  const stretchAngle = archetype === "linear" ? 0 : rng() * Math.PI;
  const stretch = archetype === "linear" ? 0.55 : archetype === "scattered" ? 0.25 : 0.12 + rng() * 0.1;

  return {
    archetype,
    order,
    chaos,
    core,
    seed,
    // Portée de la ville dans une direction donnée (forme du contour).
    reachFor(reachBase, angle) {
      const lobes = Math.sin(angle * 3 + lobeA) * lobeAmp * 0.6
        + Math.cos(angle * 5 + lobeB) * lobeAmp * 0.4;
      const ecc = 1 + Math.cos(2 * (angle - stretchAngle)) * stretch;
      return reachBase * Math.max(0.4, (1 + lobes) * ecc);
    },
    finalize({ reachBase }) {
      this.anchors = buildAnchors({ seed, counts, personality, archetype, core, reachBase, N, riverYAt });
      this.plazas = buildPlazas({ seed, counts, ageCfg, personality, core, anchors: this.anchors, corridorAt });
      return this;
    }
  };
}

export { ANCHOR_KINDS };
