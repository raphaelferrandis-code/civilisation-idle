"use strict";

export {
  log,
  chronicle,
  cycleYear,
  chronicleBuilding,
  resetCyclePeaks
} from './actions/utils.js';

export {
  buyBuilding,
  buyAllAffordable,
  exhumeVestige,
  performGrandReset,
  buyUpgrade,
  rewardCitizenThought
} from './actions/building.js';

export {
  pickCrisisEvent,
  checkCrisisThresholds,
  openCrisisEvent,
  triggerCollapseChoices,
  resumeAfterCrisisOutcome,
  runTerminalCrisisAction,
  completeCollapse,
  collapse,
  runCrisisAction,
  togglePolicy,
  setTestamentLegacy
} from './actions/crisis.js';

export {
  castAugury,
  doubleAugury,
  auguryPaytable,
  auguryRiteOdds,
  auguryTierOdds,
  auguryTierBones,
  AUGURY_RITES,
  AUGURY_TIER_LABELS
} from './actions/augures.js';

export { trunkValue, trunkCap, collectTrunk } from './actions/offeringTrunk.js';

// La table de la Maison (lot 1 des gains « vrai casino ») : recettes, limites, jetons.
export {
  recettesPerHour,
  tableLimits,
  clampStake,
  autoStake,
  blessingCost,
  potCap,
  chipRack,
  chipPile,
  chipIndexOf,
  chipValueAt
} from './actions/maisonTable.js';

// Le rang de la Maison (lot 2) : réputation, titres, cadeaux.
export {
  maisonReputation,
  maisonRank,
  rankProgress,
  rankForReputation,
  recordWager,
  promoteRank,
  RANK_LABELS,
  RANK_OF_GIFT
} from './actions/maisonRang.js';

export {
  launchIcarus,
  cashOutIcarus,
  icarusFlying,
  icarusFlightInfo,
  icarusTakeoffAt,
  icarusMultiplier,
  icarusMultiplierAt,
  icarusLastOutcome,
  icarusPotFaveur,
  icarusAlmostPayout,
  icarusUnlocked,
  icarusEffectiveEdge,
  icarusEffectiveCap,
  resolveIcarusHeadless
} from './actions/icarus.js';

export { tickTempleAutomation, resetOfflineTempleQuota, setTempleAuto, unlockTempleAuto, templeAutoUnlockCost, templeAutoThroughput, autoFloorMax, buyArtifactNode, artifactTree } from './actions/templeAutomation.js';
export { hasTempleArtifact } from './actions/templeArtifacts.js';

export {
  playScratch,
  scratchGrid,
  scratchUnlocked,
  scratchPayout,
  scratchPrizes,
  scratchOdds,
  scratchRtpRef
} from './actions/scratch.js';

// La roulette du salon (lot 3) : ouverte au titre de Familier.
export {
  spinRoulette,
  rouletteUnlocked,
  rouletteHistory,
  betPayout,
  betCovers,
  payoutFor,
  ROULETTE_WHEEL,
  couleurOf
} from './actions/roulette.js';

export {
  dealBlackjack,
  hitBlackjack,
  standBlackjack,
  blackjackHand,
  blackjackActive,
  blackjackLastOutcome,
  blackjackUnlocked,
  blackjackResult,
  handValue,
  isBlackjack,
  BLACKJACK_SUITS
} from './actions/blackjack.js';

export {
  faveurShopItems,
  buyFaveurItem,
  buyTempleArtifact,
  blessingMultiplier
} from './actions/faveurShop.js';

export {
  setStewardClause,
  tickSteward,
  stewardSlotCount,
  stewardActionChoices,
  stewardActionAllowed,
  stewardMagistrate,
  STEWARD_SLOT_UNLOCKS,
  BASE_ACTION_LABELS
} from './actions/steward.js';

export { addProductionPenalty } from './mechanics.js';

export {
  checkMythOnCollapse,
  chooseActiveRuins,
  promptActiveRuinsForNewCycle,
  promptCadmosAgeName,
  engraveCadmosEpitaph,
  activateMyth,
  icareClimb,
  icareDescend,
  atlasEpauler,
  sisyphePousser,
  babelDeclareTongue,
  babelToggleAutoTongue,
  ragnarokOffrir,
  ragnarokOfferingCost,
  negotiateOrDeal,
  comptoirBuy,
  comptoirSellFood,
  rembourserAtridesDebt,
  renegocierAtridesDebt,
  transmettreAtrides,
  activateAtridesPact,
  resetCivilization,
  migrerEnee
} from './actions/myths.js';

export {
  initAutoScriptRules,
  getAutoScriptRules,
  toggleAutoScriptRule,
  setAutoScriptThreshold,
  checkAutoScriptRules,
  initAutomateRules,
  getAutomateRules,
  toggleAutomate,
  setAutomateThreshold,
  setAutomateField,
  checkAutomateRules,
  setCrisisPosture,
  setAutoCollapseConfig
} from './actions/automation.js';

export {
  registerOlympusInteraction,
  tickOlympus,
  registerOlympusCrisisResolved,
  registerOlympusCrisisIgnored,
  registerOlympusCollapse,
  olympusRuinBonus
} from './actions/olympus.js';

export {
  tick,
  resetOfflineBoonQuota
} from './actions/tick.js';
