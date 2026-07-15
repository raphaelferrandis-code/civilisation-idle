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
  auguryCost,
  auguryBaseOdds,
  auguryTierOdds,
  auguryTierBones,
  AUGURY_RITES,
  AUGURY_TIER_LABELS
} from './actions/augures.js';

export {
  launchIcarus,
  cashOutIcarus,
  icarusStakes,
  icarusFlying,
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

export { tickTempleAutomation, setTempleAuto, unlockTempleAuto, templeAutoUnlockCost, templeAutoThroughput, buyArtifactNode, artifactTree } from './actions/templeAutomation.js';
export { hasTempleArtifact } from './actions/templeArtifacts.js';

export {
  playScratch,
  scratchStakes,
  scratchGrid,
  scratchUnlocked,
  scratchPayout
} from './actions/scratch.js';

export {
  dealBlackjack,
  hitBlackjack,
  standBlackjack,
  blackjackHand,
  blackjackActive,
  blackjackLastOutcome,
  blackjackStakes,
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
  blessingMultiplier,
  diceOddsBonus,
  wingEdgeReduction
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
  activateSurchauffe,
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
  tick
} from './actions/tick.js';
