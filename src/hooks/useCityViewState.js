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
    legitimacy:                    s.legitimacy,
    instability:                   s.instability,
    cycles:                        s.cycles,
    dynastyCount:                  s.dynastyCount,
    bestEraIndex:                  s.bestEraIndex,
    cycleStartedAt:                s.cycleStartedAt,
    archaeologyUsed:               s.archaeologyUsed,
    activeMythId:                  s.activeMythId,
    sisypheMult:                   s.sisypheMult,
    icareInfraReached:             s.icareInfraReached,
    babelProdReached:              s.babelProdReached,
    babelCategory:                 s.babelCategory,
    orPopPeak:                     s.orPopPeak,
    orUsureImbalance:              s.orUsureImbalance,
    phoenixCycleCount:             s.phoenixCycleCount,
    phoenixTotalRuins:             s.phoenixTotalRuins,
    phoenixNextForceAt:            s.phoenixNextForceAt,
    hephPopPeak:                   s.hephPopPeak,
    hephGoalReached:               s.hephGoalReached,
    atridesDebt:                   s.atridesDebt,
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
    timeWear:                      s.timeWear,
    atlasLegitimite:               s.atlasLegitimite,
    atlasHeritage:                 s.atlasHeritage,
    buildingsSig:                  renderCache._buildingsVersion,
    upgradesSig:                   renderCache._upgradesVersion,
    // Horloge du dernier tick : permet d'afficher du temps écoulé sans appeler
    // Date.now() pendant le rendu (fragile sous mémoïsation React Compiler).
    tickNow:                       renderCache.tickNow
  }));
}
