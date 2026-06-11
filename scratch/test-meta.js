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

global.render = () => {};
global.save = () => {};
global.openView = () => {};
global.checkCrisisThresholds = () => {};
global.openChoiceDialog = async (dialog) => {
  return dialog.options[0];
};

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
  buildingBatchCost,
  legitimacyGain
} = await import("../src/game/core/mechanics.js");
const { canPayCost, payCost } = await import("../src/game/core/utils.js");
const {
  buyUpgrade,
  completeCollapse,
  tick,
  foundDynasty
} = await import("../src/game/core/actions.js");
const { generateEpitaph } = await import("../src/game/core/events.js");

const TICK_SLICE_SECONDS = 5;

function simBuyBuilding(building, amount) {
  const cost = buildingBatchCost(building, amount);
  if (!canPayCost(cost)) return false;
  
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
  
  if (state.buildings.aqueducts >= 3) targets.watch = 3;
  if (state.buildings.watch >= 3) targets.sewers = 3;
  if (state.buildings.sewers >= 3) targets.bureaucracy = 3;
  if (state.buildings.caravans >= 5) targets.markets = 3;
  if (state.buildings.markets >= 5) targets.guilds = 3;
  if (state.buildings.guilds >= 3) targets.irrigated_fields = 3;
  if (state.buildings.irrigated_fields >= 3) targets.river_ports = 3;
  
  let allMet = true;
  for (const [id, target] of Object.entries(targets)) {
    if (target > 0) {
      if ((state.buildings[id] || 0) < target) {
        allMet = false;
      }
    }
  }
  
  const scaleFactor = allMet ? 2 + Math.floor(state.cycles / 4) : 1;
  
  const visible = buildings
    .filter((building) => isUnlocked(building))
    .filter((building) => targets[building.id] > 0)
    .sort((a, b) => {
      const ratioA = (state.buildings[a.id] || 0) / (targets[a.id] * scaleFactor);
      const ratioB = (state.buildings[b.id] || 0) / (targets[b.id] * scaleFactor);
      return ratioA - ratioB;
    });

  let bought = 0;
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
      
      const cost = upgrade.cost.ruins;
      if (state.ruins < 300 && cost > 15) continue; 
      if (state.ruins >= 300 && cost > state.ruins * 0.1) continue; 
      
      buyUpgrade(upgrade.id);
      bought += 1;
      changed = true;
    }
    for (const dogma of PRESTIGE_DOGMAS) {
      if (checkDogmaAvailability(dogma.id) !== "available") continue;
      
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

function simCollapse(reason) {
  const gain = ruinGain();
  if (gain <= 0) return false;
  completeCollapse(gain, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), reason);
  setGamePaused(false);
  setCollapseInProgress(false);
  simAutoBuyRuins();
  return true;
}

async function simulate() {
  setState(defaultState());
  setGamePaused(false);
  setCollapseInProgress(false);
  setBuyAmount(100);
  invalidateRenderCache("all");

  const startedAt = Date.now();
  let virtualTimeSeconds = 0;
  
  const milestones = [1, 3, 6, 9, 14, 20, 320];
  let nextMilestoneIndex = 0;
  
  console.log("Starting debug simulation...");
  
  let grStartCycles = 0;
  let grStartTimeSeconds = 0;
  
  for (let cycle = 1; cycle <= 10000; cycle++) {
    let cycleAge = 0;
    let tickCount = 0;
    while (!crisisOpen() && !stateModule.gamePaused && cycleAge < 600) {
      virtualTimeSeconds += TICK_SLICE_SECONDS;
      cycleAge += TICK_SLICE_SECONDS;
      Date.now = () => startedAt + virtualTimeSeconds * 1000;
      
      simAutoBuyBuildings();
      tick(TICK_SLICE_SECONDS);
      tickCount++;
      if (tickCount > 10000) {
        console.log(`[Cycle ${cycle}] Stale detection: tick count reached 10000 without crisis. Instability: ${state.instability}, Wear: ${state.timeWear}`);
        break;
      }

      while (stateModule.gamePaused && !crisisOpen()) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    
    if (cycleAge >= 600 && !crisisOpen()) {
      state.instability = 1.0;
    }
    
    const gain = ruinGain();
    const age = cycleAge;
    
    if (crisisOpen()) {
      const success = simCollapse("auto");
      if (!success) {
        // If collapse failed because gain is 0, print debug info
        console.log(`[Cycle ${cycle}] Collapse failed: ruins gain is ${gain}. Instability: ${state.instability}, Wear: ${state.timeWear}, Age: ${age}s, Ruins: ${state.ruins}`);
        // Let's force a minimum gain to avoid getting stuck if early game is too slow
        state.ruins += 1;
        completeCollapse(1, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), "auto");
        setGamePaused(false);
        setCollapseInProgress(false);
        simAutoBuyRuins();
      }
    } else {
      console.log(`[Cycle ${cycle}] Ended without crisis (Paused? ${stateModule.gamePaused})`);
    }

    if (cycle % 20 === 0) {
      console.log(`Cycle ${cycle}: Time=${(virtualTimeSeconds/3600).toFixed(1)}h, Ruins=${state.ruins.toFixed(0)}, Legitimacy=${state.legitimacy}, GR=${state.grandResetCount}`);
    }
    
    // Found dynasty if possible
    const legGain = legitimacyGain();
    if (state.ruins >= 350 && (cycle - lastDynastyCycle) >= 10 && legGain > 0) {
      console.log(`Founding dynasty at cycle ${cycle}: ruins = ${state.ruins.toFixed(0)}, legitimacy gain = ${legGain}, total legitimacy = ${state.legitimacy + legGain}`);
      await foundDynasty();
      buyHeritageUpgrades();
      lastDynastyCycle = cycle;
    }
    
    // Check Grand Reset
    const hasGRUpgrade = state.upgrades.grand_reset;
    if (hasGRUpgrade) {
      console.log(`Grand Reset #${state.grandResetCount + 1} achieved at cycle ${cycle} (Time: ${(virtualTimeSeconds/3600).toFixed(1)}h)`);
      // We manually perform a grand reset because we need to clear state
      // Let's see if performGrandReset is imported
      const nextGRCount = state.grandResetCount + 1;
      const savedRagnarok = Boolean(state.ragnarokHeritage);
      
      setState(defaultState());
      state.grandResetCount = nextGRCount;
      state.ragnarokHeritage = savedRagnarok;
      
      grStartCycles = cycle;
      grStartTimeSeconds = virtualTimeSeconds;
      nextMilestoneIndex = 0;
      invalidateRenderCache("all");
      
      if (state.grandResetCount >= 10) {
        console.log(`Reached 10 Grand Resets in ${(virtualTimeSeconds/3600).toFixed(1)} hours!`);
        break;
      }
    }
  }
}

await simulate();
