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
  togglePolicy
} from './actions/crisis.js';

export { addProductionPenalty } from './mechanics.js';

export {
  checkMythOnCollapse,
  foundDynasty,
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
  olympusRuinBonus,
  olympusAbyssProductionMultiplier,
  olympusUnlockedProfile
} from './actions/olympus.js';

export {
  tick
} from './actions/tick.js';
