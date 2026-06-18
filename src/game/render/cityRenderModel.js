/* ============================================================================
 * cityRenderModel.js — Le « tuyau » jeu → rendu (Phase 0 de la refonte iso).
 *
 *   UNIQUE point de contact entre l'état du jeu et le futur moteur isométrique.
 *   Fonction PURE de l'état passé en argument (aucun import du singleton, aucun
 *   effet de bord) : le rendu lit CE modèle, jamais le store directement. Si on
 *   change encore de techno de rendu plus tard, on ne réécrit que le moteur.
 *
 *   Ce que le modèle expose en Phase 0 = la couche LOGIQUE (quoi afficher) :
 *   ère/palier courant, instabilité, et la liste des bâtiments possédés avec leur
 *   famille visuelle. Le placement spatial (case de grille gridX/gridY) est ajouté
 *   par le modèle de croissance en Phase 3 — ici on ne décide pas encore d'« où ».
 * ========================================================================== */

import { buildings } from "../data/buildings.js";
import { eras } from "../data/world.js";
import { eraBandOf } from "../data/eraThemes.js";
import { D, toNum } from "../core/num.js";
import { clamp01 } from "../core/utils.js";
import { visualTierOf } from "./eraTiers.js";
import { kindOf } from "./buildingKinds.js";

const BUILDING_BY_ID = new Map(buildings.map((b) => [b.id, b]));
// Rang de progression (ordre du fichier data) : sert d'ordre stable ET signifiant
// — les bâtiments anciens d'abord, ce que le placement iso met au centre.
const BUILDING_ORDER = new Map(buildings.map((b, i) => [b.id, i]));

// Index d'ère atteint par une population donnée. Miroir PUR de
// mechanics/shared.js `currentEraIndex()` (qui, lui, lit le singleton) : mêmes
// seuils croissants eras[i].at, même early-exit. Gardé ici pour que le contrat
// reste sans dépendance au store. Si les seuils d'ères changent, l'unique source
// reste world.js `eras` — les deux lectures restent alignées.
function eraIndexForPopulation(population) {
  const pop = D(population ?? 0);
  let index = 0;
  for (let i = 0; i < eras.length; i += 1) {
    if (pop.gte(eras[i].at)) index = i;
    else break;
  }
  return index;
}

/**
 * Construit le modèle de rendu à partir d'un état de jeu.
 * @param {object} state - l'état du jeu (state.js ou un stub de test).
 * @returns modèle de rendu immuable décrit ci-dessus.
 */
export function getCityRenderModel(state) {
  if (!state) throw new Error("getCityRenderModel: état requis");

  const eraIndex = eraIndexForPopulation(state.population);
  const band = eraBandOf(eraIndex);
  const tier = visualTierOf(band);

  const owned = state.buildings || {};
  const list = [];
  let totalBuildings = 0;
  for (const id of Object.keys(owned)) {
    const count = owned[id] || 0;
    if (count <= 0) continue;
    totalBuildings += count;
    const def = BUILDING_BY_ID.get(id);
    list.push({
      id,
      name: def ? def.name : id,
      category: def ? def.category : "city",
      kind: kindOf(id, def && def.category),
      count
    });
  }
  // Ordre déterministe (par progression) : le rendu n'est pas tributaire de
  // l'ordre des clés de l'objet state.buildings, et les anciens bâtiments passent
  // en premier (placés au centre de la ville).
  list.sort((a, b) => (BUILDING_ORDER.get(a.id) ?? 999) - (BUILDING_ORDER.get(b.id) ?? 999));

  return {
    era: { index: eraIndex, band, tier },
    instability: clamp01(state.instability ?? 0),
    population: toNum(D(state.population ?? 0)),
    totalBuildings,
    buildings: list
  };
}
