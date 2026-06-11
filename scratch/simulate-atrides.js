import fs from "fs";

// Mock globals for headless Node execution
global.fakeClock = { now: Date.now() };
global.window = {};
global.localStorage = {
  getItem() { return null; },
  setItem() {}
};
Object.defineProperty(global, "navigator", {
  value: { clipboard: { writeText() {} } },
  writable: true,
  configurable: true
});
global.document = {
  addEventListener() {},
  documentElement: { style: { setProperty() {} } },
  body: { appendChild() {} },
  querySelector() {
    return {
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {},
      setAttribute() {},
      click() {},
      style: {}
    };
  },
  querySelectorAll() { return []; },
  createElement() {
    return {
      className: "",
      dataset: {},
      innerHTML: "",
      returnValue: "0",
      addEventListener() {},
      showModal() {},
      remove() {},
      querySelector() {
        return {
          dataset: {},
          disabled: false,
          addEventListener() {},
          setAttribute() {},
          style: {},
          classList: { toggle() {} }
        };
      },
      appendChild() {}
    };
  },
  getElementById() {
    return {
      dataset: {},
      textContent: "",
      disabled: false,
      value: "",
      checked: false,
      style: {},
      classList: { toggle() {}, contains() { return false; } },
      addEventListener() {},
      setAttribute() {},
      appendChild() {},
      querySelector() { return null; }
    };
  }
};
global.Audio = class {
  constructor() {
    this.volume = 1;
    this.loop = true;
    this.preload = "auto";
  }
  addEventListener() {}
  play() { return Promise.resolve(); }
  pause() {}
};

global.render = () => {};
global.save = () => {};
global.openView = () => {};
global.checkCrisisThresholds = () => {};
global.openChoiceDialog = async () => ({ apply() {} });

// Dynamic imports
const { buildings } = await import("../src/game/data/buildings.js");
const { upgrades, dogmaIds, getMythById } = await import("../src/game/data/myths.js");
const { eras } = await import("../src/game/data/world.js");

const stateModule = await import("../src/game/core/state.js");
const {
  state,
  defaultState,
  invalidateRenderCache,
  setGamePaused,
  setCollapseInProgress,
  setBuyAmount,
  setState
} = stateModule;

const {
  isUnlocked,
  canBuyUpgrade,
  ruinGain,
  crisisOpen,
  terminalCrisisReady,
  terminalCrisisCost,
  buildingBatchCost,
  rates
} = await import("../src/game/core/mechanics.js");
const {
  canPayCost,
  payCost
} = await import("../src/game/core/utils.js");
const {
  buyUpgrade,
  tick,
  resetCivilization,
  rembourserAtridesDebt,
  renegocierAtridesDebt,
  transmettreAtrides,
  runTerminalCrisisAction
} = await import("../src/game/core/actions.js");

function simBuyBuilding(building, amount) {
  const cost = buildingBatchCost(building, amount);
  if (!canPayCost(cost)) return false;
  payCost(cost);
  state.buildings[building.id] = (state.buildings[building.id] || 0) + amount;
  return true;
}

function simAutoBuyBuildingsSmart() {
  const limits = {
    foragers: 12,
    granaries_city: 25,
    caravans: 35,
    markets: 30,
    guilds: 25,
    irrigated_fields: 20,
    river_ports: 15,
    water_mills: 10,
    mint_houses: 10,
    
    // Knowledge
    storytellers: 10,
    scribes: 15,
    schools: 15,
    academies: 10,
    ancestral_cult: 10,
    
    // Infra
    roads: 20,
    aqueducts: 20,
    watch: 15,
    sewers: 15,
    bureaucracy: 10,
    courthouses: 10
  };

  const visible = buildings
    .filter((building) => isUnlocked(building))
    .sort((a, b) => a.base - b.base);
  
  let bought = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;
    for (const building of visible) {
      const currentCount = state.buildings[building.id] || 0;
      const limit = limits[building.id] || 10;
      if (currentCount >= limit) continue;
      
      // Buy 1
      if (simBuyBuilding(building, 1)) {
        bought += 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return bought;
}

function resolveCrisis() {
  if (!crisisOpen()) {
    setGamePaused(false);
    return;
  }
  
  if ((state.crisisExtensions || 0) < 7) {
    const choice = terminalCrisisReady("prepareArchives")
      ? "prepareArchives"
      : terminalCrisisReady("exodus")
        ? "exodus"
        : terminalCrisisReady("holdOrder")
          ? "holdOrder"
          : "";
    if (choice) {
      runTerminalCrisisAction(choice);
      setGamePaused(false);
      return;
    }
  }
}

function runAtridesSimulation(useRembourser, useRenegocier, useTransmettre, grandResetCount = 2, ruins = 1000, maxTimeSeconds = 1200) {
  setState(defaultState());
  setGamePaused(false);
  setCollapseInProgress(false);
  setBuyAmount(100);
  invalidateRenderCache("all");
  
  const basicUpgrades = [
    "root_cellars", "buried_coins", "charcoal_tablets", "reseau_routes", "grand_reset",
    "granaries", "conservateurs_ruines"
  ];
  for (const uid of basicUpgrades) {
    state.upgrades[uid] = true;
  }
  state.grandResetCount = grandResetCount;
  state.ruins = ruins;
  
  // Force activate the Atrides myth, bypassing isMythUnlocked checks
  const myth = getMythById("mythe_atrides");
  state.activeMythId = "mythe_atrides";
  resetCivilization();
  myth.onActivate();
  
  let time = 0;
  let success = false;
  let successTime = 0;
  const startedAt = Date.now();
  
  const STEP_SECONDS = 5;
  const TICK_SLICE = 1;
  
  while (time < maxTimeSeconds) {
    Date.now = () => startedAt + time * 1000;
    
    // Attempt building purchases
    simAutoBuyBuildingsSmart();
    
    // Tick slices
    for (let slice = 0; slice < STEP_SECONDS; slice += TICK_SLICE) {
      Date.now = () => startedAt + (time + slice) * 1000;
      tick(TICK_SLICE);
      
      if (stateModule.gamePaused || crisisOpen()) {
        resolveCrisis();
      }
    }
    
    // Repayment:
    if (useRembourser) {
      const cost = state.atridesDebt * 1.2;
      if (state.atridesDebt > 100 && state.gold >= cost) {
        rembourserAtridesDebt();
      }
    }
    
    // Renegotiation:
    if (useRenegocier) {
      const isCooldownActive = state.atridesRenegotiateCooldownEnd && Date.now() < state.atridesRenegotiateCooldownEnd;
      if (!isCooldownActive) {
        renegocierAtridesDebt();
      }
    }
    
    // Transmission:
    if (useTransmettre) {
      const netGold = state.gold - state.atridesDebt;
      if (!state.atridesDrainDisabled && (time >= 400 || netGold >= 80000)) {
        transmettreAtrides();
      }
    }
    
    const netGold = state.gold - state.atridesDebt;
    if (netGold >= 100000) {
      success = true;
      successTime = time;
      break;
    }
    
    if (crisisOpen()) {
      break;
    }
    
    time += STEP_SECONDS;
  }
  
  return {
    meta: `GR:${grandResetCount} | R:${ruins}`,
    strategy: `Repay:${useRembourser ? 'Y' : 'N'} | Reneg:${useRenegocier ? 'Y' : 'N'} | Transmit:${useTransmettre ? 'Y' : 'N'}`,
    success,
    timeSpent: success ? `${Math.floor(successTime / 60)}m ${successTime % 60}s` : 'Failed/Collapse',
    finalGold: Math.round(state.gold),
    finalDebt: Math.round(state.atridesDebt),
    finalNet: Math.round(state.gold - state.atridesDebt),
    crisisReached: crisisOpen(),
    extensions: state.crisisExtensions || 0
  };
}

console.log("=== SIMULATION DU MYTHE DES ATRIDES (Acte III) ===");
console.log("Lancement de scénarios avec différentes méta-progressions et stratégies...");

const results = [];

// 1. Low Meta-progression profile (Grand Reset = 0, Ruins = 50)
results.push(runAtridesSimulation(true, true, true, 0, 50));   // All tools active
results.push(runAtridesSimulation(true, true, false, 0, 50));  // No transmission
results.push(runAtridesSimulation(true, false, false, 0, 50)); // Repay only
results.push(runAtridesSimulation(false, true, false, 0, 50)); // Renegotiate only

// 2. Standard Meta-progression profile (Grand Reset = 2, Ruins = 1000)
results.push(runAtridesSimulation(true, true, true, 2, 1000));
results.push(runAtridesSimulation(true, true, false, 2, 1000));
results.push(runAtridesSimulation(true, false, false, 2, 1000));
results.push(runAtridesSimulation(false, true, false, 2, 1000));

console.table(results);

