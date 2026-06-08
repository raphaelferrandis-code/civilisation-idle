import fs from "fs";

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

// Mock render and save functions
global.render = () => {};
global.save = () => {};
global.openView = () => {};
global.checkCrisisThresholds = () => {};
global.openChoiceDialog = async (dialog) => {
  return dialog.options[0];
};

// Dynamic imports
const { buildings, dynastyNames } = await import("../src/game/data/buildings.js");
const { upgrades, dogmaIds, PRESTIGE_DOGMAS } = await import("../src/game/data/upgrades.js");
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
const { registerChoiceDialog } = await import("../src/game/core/choiceDialog.js");
registerChoiceDialog((dialog) => {
  const choice = dialog.options[0];
  if (dialog.multiSelectOptions) {
    choice.selectedIds = dialog.multiSelectOptions.filter(o => !o.disabled).map(o => o.id);
  }
  return choice;
});
const {
  isUnlocked,
  canBuyUpgrade,
  checkDogmaAvailability,
  ruinGain,
  crisisOpen,
  terminalCrisisReady,
  buildingBatchCost,
  legitimacyGain
} = await import("../src/game/core/mechanics.js");
const {
  canPayCost,
  payCost
} = await import("../src/game/core/utils.js");
const {
  buyUpgrade,
  completeCollapse,
  runTerminalCrisisAction,
  tick,
  cycleYear,
  foundDynasty,
  performGrandReset
} = await import("../src/game/core/actions.js");
const { generateEpitaph } = await import("../src/game/core/events.js");

const STEP_SECONDS = 120;
const TICK_SLICE_SECONDS = 5;

function simCost(building, amount) {
  return buildingBatchCost(building, amount);
}

function simBuyBuilding(building, amount) {
  const cost = simCost(building, amount);
  if (!canPayCost(cost)) return false;
  
  // Prudent food safety: keep food above population * 2.5
  if (cost.food) {
    const remainingFood = state.food - cost.food;
    const safetyThreshold = state.population * 2.5;
    if (remainingFood < safetyThreshold) {
      return false;
    }
  }

  payCost(cost);
  state.buildings[building.id] = (state.buildings[building.id] || 0) + amount;
  invalidateRenderCache("all");
  return true;
}

function simAutoBuyBuildings() {
  // Define dynamic targets based on unlocks to keep a balanced economy
  const targets = {};
  for (const b of buildings) {
    targets[b.id] = 0;
  }
  
  targets.foragers = 10;
  if (state.buildings.foragers >= 3) targets.granaries_city = 5;
  if (state.buildings.granaries_city >= 3) targets.caravans = 3;
  if (state.buildings.caravans >= 1) targets.storytellers = 3;
  if (state.buildings.storytellers >= 3) targets.scribes = 3;
  if (state.buildings.storytellers >= 1) targets.roads = 3;
  if (state.buildings.roads >= 3) targets.aqueducts = 3;
  
  // Later game unlocks targets
  if (state.buildings.aqueducts >= 3) targets.watch = 3;
  if (state.buildings.watch >= 3) targets.sewers = 3;
  if (state.buildings.sewers >= 3) targets.bureaucracy = 3;
  if (state.buildings.caravans >= 5) targets.markets = 3;
  if (state.buildings.markets >= 5) targets.guilds = 3;
  if (state.buildings.guilds >= 3) targets.irrigated_fields = 3;
  if (state.buildings.irrigated_fields >= 3) targets.river_ports = 3;
  
  // Check if we met all active targets
  let allMet = true;
  let activeCount = 0;
  for (const [id, target] of Object.entries(targets)) {
    if (target > 0) {
      activeCount++;
      if ((state.buildings[id] || 0) < target) {
        allMet = false;
      }
    }
  }
  
  // Scale factor: if we met all targets, we expand the economy by doubling targets
  const scaleFactor = allMet ? 2 + Math.floor(state.cycles / 4) : 1;
  
  // Sort visible buildings by how far they are from their scaled target
  const visible = buildings
    .filter((building) => isUnlocked(building))
    .filter((building) => targets[building.id] > 0)
    .sort((a, b) => {
      const ratioA = (state.buildings[a.id] || 0) / (targets[a.id] * scaleFactor);
      const ratioB = (state.buildings[b.id] || 0) / (targets[b.id] * scaleFactor);
      return ratioA - ratioB;
    });

  let bought = 0;
  // Buy one building at a time to maintain balanced ratios
  for (const building of visible) {
    const target = targets[building.id] * scaleFactor;
    if ((state.buildings[building.id] || 0) >= target) continue;
    
    if (simBuyBuilding(building, 1)) {
      bought += 1;
      break;
    }
  }
  return bought;
}

function simAutoBuyRuins() {
  let bought = 0;
  const affordable = upgrades
    .filter((upgrade) => upgrade.group === "ruins" && !dogmaIds.has(upgrade.id))
    .sort((a, b) => a.cost.ruins - b.cost.ruins);
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const upgrade of affordable) {
      if (!canBuyUpgrade(upgrade)) continue;
      
      // Keep a ruins buffer when approaching the 300 milestone for dynasty
      const cost = upgrade.cost.ruins;
      if (state.ruins < 300 && cost > 15) continue; 
      if (state.ruins >= 300 && cost > state.ruins * 0.1) continue; 
      
      buyUpgrade(upgrade.id);
      bought += 1;
      changed = true;
    }
    for (const dogma of PRESTIGE_DOGMAS) {
      if (checkDogmaAvailability(dogma.id) !== "available") continue;
      const cost = dogma.cost.ruins;
      if (state.ruins < 300 && cost > 15) continue;
      if (state.ruins >= 300 && cost > state.ruins * 0.1) continue;
      
      buyUpgrade(dogma.id);
      bought += 1;
      changed = true;
    }
    if (!changed) break;
  }
  return bought;
}

function buyHeritageUpgrades() {
  const order = [
    "reforme_administrative",
    "protocoles_urgence",
    "reseau_routes",
    "codex_mythique",
    "conservateurs_ruines",
    "rituel_effondrement",
    "grand_reset"
  ];
  for (const id of order) {
    const upgrade = upgrades.find((u) => u.id === id);
    if (upgrade && canBuyUpgrade(upgrade)) {
      buyUpgrade(id);
    }
  }
}

let simCycleAges = [];

function simCollapse(reason) {
  const gain = ruinGain();
  if (gain <= 0) return false;
  simCycleAges.push(cycleYear());
  completeCollapse(gain, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), reason);
  setGamePaused(false);
  setCollapseInProgress(false);
  simAutoBuyRuins();
  return true;
}

function resolveCrisis() {
  if (!crisisOpen()) {
    setGamePaused(false);
    return;
  }
  simCollapse("auto");
}

async function simulateRagnarok() {
  setState(defaultState());
  setGamePaused(false);
  setCollapseInProgress(false);
  setBuyAmount(100);
  invalidateRenderCache("all");

  const startedAt = Date.now();
  let virtualTimeSeconds = 0;
  
  const milestones = [1, 3, 6, 9, 14, 20, 320];
  let nextMilestoneIndex = 0;
  
  console.log("Starting simulation of meta-progression with smart buyer...");
  
  const grLogs = [];
  let grStartCycles = 0;
  let grStartTimeSeconds = 0;
  
  for (let cycle = 0; cycle < 10000; cycle++) {
    let cycleAge = 0;
    while (!crisisOpen() && !stateModule.gamePaused) {
      virtualTimeSeconds += TICK_SLICE_SECONDS;
      cycleAge += TICK_SLICE_SECONDS;
      Date.now = () => startedAt + virtualTimeSeconds * 1000;
      
      simAutoBuyBuildings();
      tick(TICK_SLICE_SECONDS);
    }
    
    resolveCrisis();
    
    // Check if we can found a dynasty to advance legitimacy
    const gain = legitimacyGain();
    if (gain > 0 && state.ruins >= 300) {
      const target = milestones[nextMilestoneIndex];
      if (state.legitimacy + gain >= target) {
        await foundDynasty();
        buyHeritageUpgrades();
        if (state.legitimacy >= target) {
          nextMilestoneIndex = Math.min(milestones.length - 1, nextMilestoneIndex + 1);
        }
      }
    }
    
    // Check if we performed a grand reset
    if (state.grandResetCount > grLogs.length) {
      const durationSeconds = virtualTimeSeconds - grStartTimeSeconds;
      const grCycles = state.cycles - grStartCycles;
      
      grLogs.push({
        grCount: state.grandResetCount,
        cycles: grCycles,
        virtualHours: (durationSeconds / 3600).toFixed(1),
        virtualDays: (durationSeconds / 86400).toFixed(2)
      });
      
      console.log(`[GRAND RESET #${state.grandResetCount}] Achieved in ${grCycles} cycles (${(durationSeconds / 3600).toFixed(1)} virtual hours). Best Era reached: ${eras[state.bestEraIndex || 0].name}`);
      
      grStartCycles = state.cycles;
      grStartTimeSeconds = virtualTimeSeconds;
      nextMilestoneIndex = 0;
      
      if (state.grandResetCount >= 5) {
        break; // Stop at 5 grand resets for speed, then we will extrapolate!
      }
    }
    
    if (cycle > 5000) {
      console.log("Safety limit reached. Stopping simulation.");
      break;
    }
  }
  
  console.log("\n=== Meta-Progression Simulation Results ===");
  console.table(grLogs);
  
  const totalHours = (virtualTimeSeconds / 3600).toFixed(1);
  const totalDays = (virtualTimeSeconds / 86400).toFixed(2);
  console.log(`Total time to reach ${state.grandResetCount} Grand Resets: ${totalHours} virtual hours (${totalDays} virtual days).`);
}

await simulateRagnarok();
