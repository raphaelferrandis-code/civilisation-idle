"use strict";

// Baril des actions : ne ré-exporte que ce que ses importeurs lisent (l'UI, les
// harnais racine bench-*/sim-*, le parcours scripté) — les tests visent les
// modules directs. Les blocs de la Maison (rang, roulette, roue, Nuit, duel,
// courses) restent ENTIERS même si leurs scènes les importent en direct :
// importer le baril évalue tous les modules d'actions dans l'ordre du jeu réel
// (bench-plaisirs, bench-temple) ; retirer un bloc entier changerait cet ordre
// dans un cycle d'imports sensible (cf. data/myths.js → baril).

export {
  log,
  chronicle,
  cycleYear
} from './actions/utils.js';

export {
  buyBuilding,
  buyAllAffordable,
  buyAllAffordableChained,
  exhumeVestige,
  performGrandReset,
  buyUpgrade,
  rewardCitizenThought
} from './actions/building.js';

export {
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
  potCap
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
  scratchPayout,
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
  couleurOf,
  rouletteVipUnlocked,
  rouletteLimits
} from './actions/roulette.js';

// La roue de la Maison (2026-10-04) : un tour offert par heure.
export { spinRoue, roueReady, roueUnlocked, roueValues, roueWaitMinutes } from './actions/roueMaison.js';

// La Nuit du Grand Jeu, le spectacle, le duel des grands flambeurs, les courses
// (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md).
export {
  nuitUnlocked, nuitActive, nuitResteMin, nuitAttenteMin, tickNuit, ouvrirNuit, flambeurDeLaNuit,
  spectaclePret, spectacleActif, spectacleCout, lancerSpectacle
} from './actions/nuitGrandJeu.js';
export { jouerDuel, duelOuvert, duelMiseMin } from './actions/duel.js';
export { lancerCourse, coursePartants, coursesUnlocked, coteAffichee } from './actions/courses.js';

export {
  dealBlackjack,
  hitBlackjack,
  standBlackjack,
  blackjackHand,
  blackjackActive,
  blackjackLastOutcome,
  blackjackResult,
  handValue,
  isBlackjack
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
  stewardMagistrate,
  STEWARD_SLOT_UNLOCKS,
  BASE_ACTION_LABELS
} from './actions/steward.js';

export {
  promptActiveRuinsForNewCycle,
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
  migrerEnee
} from './actions/myths.js';

export {
  getAutoScriptRules,
  toggleAutoScriptRule,
  setAutoScriptThreshold,
  getAutomateRules,
  toggleAutomate,
  setAutomateThreshold,
  setAutomateField,
  checkAutomateRules,
  setCrisisPosture,
  setAutoCollapseConfig
} from './actions/automation.js';

export { registerOlympusInteraction } from './actions/olympus.js';

export {
  tick,
  resetOfflineBoonQuota
} from './actions/tick.js';
