"use strict";

import { useGameState } from './useGameState.js';
import { renderCache } from '../game/core/state.js';

export function useCityViewState() {
  return useGameState(s => ({
    cityName:                      s.cityName,
    population:                    s.population,
    food:                          s.food,
    gold:                          s.gold,
    knowledge:                     s.knowledge,
    infrastructure:                s.infrastructure,
    instability:                   s.instability,
    cycles:                        s.cycles,
    bestEraIndex:                  s.bestEraIndex,
    cycleStartedAt:                s.cycleStartedAt,
    // Vœu du cycle (D2). Réf. remplacée à chaque changement (choix, latch, tirage)
    // → le shallow-compare du hook le détecte ; l'avancement suit `tickNow`.
    cycleVow:                      s.cycleVow,
    archaeologyUses:               s.archaeologyUses,
    activeMythId:                  s.activeMythId,
    sisypheCran:                   s.sisypheCran,
    sisypheMontees:                s.sisypheMontees,
    // Usages à PLAT (pas l'objet s.sisypheUsages) : le shallow-compare du hook ne
    // détecterait pas une mutation interne de l'objet.
    sisypheUsesFood:               s.sisypheUsages?.food || 0,
    sisypheUsesKnowledge:          s.sisypheUsages?.knowledge || 0,
    sisypheUsesInfra:              s.sisypheUsages?.infrastructure || 0,
    icareAltitude:                 s.icareAltitude,
    icareHeritage:                 s.icareHeritage,
    mythStartGold:                 s.mythStartGold,
    babelCategory:                 s.babelCategory,
    babelHeritage:                 s.babelHeritage,
    babelCommonTongue:             s.babelCommonTongue,
    babelAutoTongue:               s.babelAutoTongue,
    orDealsClosed:                 s.orDealsClosed,
    orUsureImbalance:              s.orUsureImbalance,
    phoenixRenaissances:           s.phoenixRenaissances,
    phoenixRebirthTargetPop:       s.phoenixRebirthTargetPop,
    hephPopPeak:                   s.hephPopPeak,
    hephGoalReached:               s.hephGoalReached,
    atridesDebt:                   s.atridesDebt,
    atridesReached:                s.atridesReached,
    atridesDrainDisabled:          s.atridesDrainDisabled,
    atridesDebtGrowthMultiplier:   s.atridesDebtGrowthMultiplier,
    atridesRenegotiateActiveUntil: s.atridesRenegotiateActiveUntil,
    atridesRenegotiateCooldownEnd: s.atridesRenegotiateCooldownEnd,
    atridesHeritage:               s.atridesHeritage,
    atridesPactActive:             s.atridesPactActive,
    atridesNextRunPenaltyActive:   s.atridesNextRunPenaltyActive,
    eneeMigrations:                s.eneeMigrations,
    eneeDegraded:                  s.eneeDegraded,
    eneeTerritoryStartedAt:        s.eneeTerritoryStartedAt,
    eneeHeritage:                  s.eneeHeritage,
    eneeCollapseCount:             s.eneeCollapseCount,
    activeEpitaphLegacy:           s.activeEpitaphLegacy,
    ruins:                         s.ruins,
    rationing:                     s.crisisActions?.rationing || 0,
    prometheeBraisiers:            s.prometheeBraisiers,
    prometheePopReached:           s.prometheePopReached,
    prometheeFailed:               s.prometheeFailed,
    timeWear:                      s.timeWear,
    // La clepsydre (C7) : secondes d'absence mises de côté au-dessus du plafond.
    storedSeconds:                 s.storedSeconds,
    blessingUntil:                 s.blessingUntil,
    atlasSkipUsed:                 s.atlasSkipUsed,
    atlasHeritage:                 s.atlasHeritage,
    atlasFardeau:                  s.atlasFardeau,
    atlasEpaules:                  s.atlasEpaules,
    atlasCrushed:                  s.atlasCrushed,
    atlasShoulderCdEnd:            s.atlasShoulderCdEnd,
    ragnarokArkOfferings:          s.ragnarokArkOfferings,
    ragnarokArkNextAt:             s.ragnarokArkNextAt,
    buildingsSig:                  renderCache._buildingsVersion,
    upgradesSig:                   renderCache._upgradesVersion,
    // Horloge du dernier tick : permet d'afficher du temps écoulé sans appeler
    // Date.now() pendant le rendu (fragile sous mémoïsation React Compiler).
    tickNow:                       renderCache.tickNow
  }));
}
