/* ============================================================================
 * cityPersonality.js — Profils de personnalité de ville
 *   Donne à chaque civilisation une identité : deux villes du même âge ne se
 *   ressemblent pas, parce qu'elles n'accordent pas la même importance aux
 *   mêmes choses. Le profil de base est tiré de la seed (stable sur toute la
 *   partie), puis légèrement infléchi par ce que le joueur construit ; les
 *   états de crise/effondrement s'appliquent en surcouche dynamique.
 *
 *   Champs d'un profil :
 *     buildingBias  — multiplicateurs de catégories lors du placement
 *     variantBias   — oriente le choix de variantes (riche, pauvre, sacré...)
 *     densityMul    — densité bâtie ET densité de piétons
 *     orderDelta    — décale l'ordre de l'âge (+ = ville plus planifiée)
 *     plazaBias     — nombre/taille des places
 *     vehicleBias   — multiplicateurs par type de véhicule
 *     treeMul       — végétation urbaine
 * ============================================================================ */

import { rngFrom, seededWeightedPick } from "./seedManager.js";
import { localizeData } from "../../core/i18n.js";

const PERSONALITIES = {
  religieuse: {
    id: "religieuse", label: { fr: "cité religieuse", en: "religious city" },
    buildingBias: { library: 1.5, public: 1.15, house: 1, farm: 0.95 },
    variantBias: "sacred",
    densityMul: 0.95, orderDelta: 0.08, plazaBias: 1.4,
    vehicleBias: { caravan: 1.2 }, treeMul: 1
  },
  militaire: {
    id: "militaire", label: { fr: "cité militaire", en: "military city" },
    buildingBias: { public: 1.35, house: 0.95, library: 0.8, farm: 1 },
    variantBias: "military",
    densityMul: 1, orderDelta: 0.15, plazaBias: 0.8,
    vehicleBias: { chariot: 1.6, wagon: 1.2 }, treeMul: 0.85
  },
  marchande: {
    id: "marchande", label: { fr: "cité marchande", en: "merchant city" },
    buildingBias: { public: 1.3, house: 1.05, farm: 0.9, library: 0.9 },
    variantBias: "trade",
    densityMul: 1.12, orderDelta: -0.05, plazaBias: 1.5,
    vehicleBias: { caravan: 1.8, cart: 1.4, wagon: 1.3 }, treeMul: 0.9
  },
  agricole: {
    id: "agricole", label: { fr: "cité agricole", en: "agricultural city" },
    buildingBias: { farm: 1.7, house: 1, public: 0.85, library: 0.85 },
    variantBias: "rural",
    densityMul: 0.82, orderDelta: -0.12, plazaBias: 0.9,
    vehicleBias: { barrow: 1.5, cart: 1.3 }, treeMul: 1.25
  },
  imperiale: {
    id: "imperiale", label: { fr: "cité impériale", en: "imperial city" },
    buildingBias: { public: 1.25, library: 1.1, house: 1, farm: 0.85 },
    variantBias: "prestige",
    densityMul: 1.08, orderDelta: 0.18, plazaBias: 1.3,
    vehicleBias: { chariot: 1.3, tram: 1.2 }, treeMul: 0.8
  },
  pauvre: {
    id: "pauvre", label: { fr: "cité modeste", en: "humble city" },
    buildingBias: { house: 1.2, farm: 1.1, public: 0.75, library: 0.7 },
    variantBias: "poor",
    densityMul: 1.05, orderDelta: -0.15, plazaBias: 0.6,
    vehicleBias: { basket: 1.4, barrow: 1.4 }, treeMul: 1.05
  },
  luxueuse: {
    id: "luxueuse", label: { fr: "cité fastueuse", en: "lavish city" },
    buildingBias: { house: 0.95, public: 1.15, library: 1.15, farm: 0.85 },
    variantBias: "rich",
    densityMul: 0.9, orderDelta: 0.12, plazaBias: 1.6,
    vehicleBias: { caravan: 1.2, car: 1.2 }, treeMul: 1.15
  },
  savante: {
    id: "savante", label: { fr: "cité savante", en: "scholarly city" },
    buildingBias: { library: 1.7, public: 1, house: 0.95, farm: 0.9 },
    variantBias: "scholar",
    densityMul: 0.95, orderDelta: 0.1, plazaBias: 1.2,
    vehicleBias: {}, treeMul: 1.1
  }
};

// Surcouches dynamiques : appliquées au-dessus du profil de base selon l'état
// réel de la partie (jamais persistées — recalculées à chaque layout).
const OVERLAYS = {
  crise: {
    id: "crise", label: { fr: "en crise", en: "in crisis" },
    densityMul: 0.92, orderDelta: -0.18, plazaBias: 0.8,
    chaos: 0.35, treeMul: 1.1
  },
  effondrement: {
    id: "effondrement", label: { fr: "au bord de l'effondrement", en: "on the brink of collapse" },
    densityMul: 0.8, orderDelta: -0.4, plazaBias: 0.5,
    chaos: 0.85, treeMul: 1.35
  }
};

// Le profil de base est seedé, mais le jeu du joueur le module : une partie où
// l'on construit surtout des bibliothèques tire plus souvent "savante", etc.
function personalityWeights(s) {
  const b = (s && s.buildings) || {};
  const get = (id) => b[id] || 0;
  const knowledgeB = get("scribes") + get("schools") + get("academies") + get("libraries") + get("universities");
  const tradeB = get("caravans") + get("markets") + get("guilds") + get("imperial_exchanges");
  const farmB = get("foragers") + get("irrigated_fields") + get("granaries_city");
  const faithB = get("ancestral_cult") + get("storytellers");
  return [
    { value: "religieuse", weight: 10 + faithB * 0.4 },
    { value: "militaire", weight: 10 + (get("watch") || 0) * 0.5 },
    { value: "marchande", weight: 12 + tradeB * 0.3 },
    { value: "agricole", weight: 12 + farmB * 0.2 },
    { value: "imperiale", weight: 9 },
    { value: "pauvre", weight: 9 },
    { value: "luxueuse", weight: 9 },
    { value: "savante", weight: 10 + knowledgeB * 0.3 }
  ];
}

export function computeCityPersonality(seed, s) {
  const baseId = seededWeightedPick(seed, "personality", personalityWeights(s));
  const base = PERSONALITIES[baseId] || PERSONALITIES.marchande;
  const timeWear = (s && s.timeWear) || 0;
  const instability = (s && s.instability) || 0;
  const collapsing = timeWear > 0.88 || instability >= 1;
  const inCrisis = !collapsing && (timeWear > 0.6 || instability >= 0.6);
  const overlay = collapsing ? OVERLAYS.effondrement : inCrisis ? OVERLAYS.crise : null;

  // Micro-variations seedées pour que deux villes du même profil divergent.
  const jitterRng = rngFrom(seed, "personality-jitter");
  const out = {
    ...base,
    overlayId: overlay ? overlay.id : null,
    label: overlay ? `${base.label} ${overlay.label}` : base.label,
    densityMul: base.densityMul * (overlay ? overlay.densityMul : 1) * (0.92 + jitterRng() * 0.16),
    orderDelta: base.orderDelta + (overlay ? overlay.orderDelta : 0) + (jitterRng() - 0.5) * 0.1,
    plazaBias: base.plazaBias * (overlay ? overlay.plazaBias : 1),
    treeMul: base.treeMul * (overlay ? overlay.treeMul : 1),
    chaos: overlay ? overlay.chaos : 0
  };
  return out;
}

// Aplatit les `label` { fr, en } en chaînes (cf. i18n.js) AVANT tout rendu, pour
// que la composition `${base.label} ${overlay.label}` (computeCityPersonality)
// opère sur des strings. id/biais numériques non touchés.
localizeData(PERSONALITIES);
localizeData(OVERLAYS);

export { PERSONALITIES };
