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
global.openChoiceDialog = async () => ({ apply() {} });

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
  buildingBatchCost
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
  cycleYear
} = await import("../src/game/core/actions.js");
const { generateEpitaph } = await import("../src/game/core/events.js");

const STEP_SECONDS = 120;
const TICK_SLICE_SECONDS = 5;

function simCost(building, amount) {
  return buildingBatchCost(building, amount);
}

function simBuyBuilding(building, amount, profile) {
  const cost = simCost(building, amount);
  if (!canPayCost(cost)) return false;
  
  if (profile === "prudent" || profile === "prudent_with_infra") {
    // Food safety check
    if (cost.food) {
      const remainingFood = state.food - cost.food;
      const safetyThreshold = state.population * 2.5;
      if (remainingFood < safetyThreshold) {
        return false;
      }
    }
    
    // For prudent with infra, let's balance knowledge and infra
    if (profile === "prudent_with_infra" && building.category === "knowledge") {
      // Don't buy knowledge if infrastructure is lagging behind
      const complexityLimit = state.infrastructure * 38 + 180;
      if (state.knowledge > complexityLimit * 0.8) {
        return false; // Lag knowledge buying to let infrastructure catch up!
      }
    }
  }

  payCost(cost);
  state.buildings[building.id] = (state.buildings[building.id] || 0) + amount;
  invalidateRenderCache("all");
  return true;
}

function simAutoBuyBuildings(profile) {
  const isCityOnly = profile === "cityOnly";
  const isNoInfra = profile === "noInfra" || profile === "prudent";
  
  const visible = buildings
    .filter((building) => isUnlocked(building))
    .filter((building) => {
      if (isCityOnly) return building.category === "city";
      if (isNoInfra) return building.category !== "infra";
      return true;
    })
    .sort((a, b) => a.base - b.base);
    
  let bought = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;
    for (const building of visible) {
      for (const amount of [100, 25, 10, 1]) {
        if (simBuyBuilding(building, amount, profile)) {
          bought += amount;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
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

function resolveCrisis(policy) {
  if (!crisisOpen()) {
    setGamePaused(false);
    return;
  }

  const age = (Date.now() - state.cycleStartedAt) / 1000;
  const gain = ruinGain();

  if (policy === "collapse100") {
    simCollapse("auto");
    return;
  }

  if (policy === "wait10min" && age >= 600) {
    simCollapse("auto");
    return;
  }

  if (policy === "gain4" && gain >= 4) {
    simCollapse("auto");
    return;
  }

  if (policy === "longGame" && age >= 900 && gain >= 5) {
    simCollapse("auto");
    return;
  }

  if ((state.crisisExtensions || 0) < 4) {
    const choice = terminalCrisisReady("prepareArchives")
      ? "prepareArchives"
      : terminalCrisisReady("exodus")
        ? "exodus"
        : terminalCrisisReady("holdOrder")
          ? "holdOrder"
          : "";
    if (choice) {
      runTerminalCrisisAction(choice);
      return;
    }
  }

  simCollapse("forced");
}

async function runScenario(policy, label, durationSeconds, stepSeconds, profile = "all") {
  setState(defaultState());
  setGamePaused(false);
  setCollapseInProgress(false);
  setBuyAmount(100);
  simCycleAges = [];
  invalidateRenderCache("all");

  const startedAt = Date.now();

  for (let t = 0; t < durationSeconds; t += stepSeconds) {
    for (let slice = 0; slice < stepSeconds; slice += TICK_SLICE_SECONDS) {
      Date.now = () => startedAt + (t + slice) * 1000;
      simAutoBuyBuildings(profile);
      tick(TICK_SLICE_SECONDS);
      await new Promise((resolve) => setImmediate(resolve));
      if (stateModule.gamePaused || crisisOpen()) resolveCrisis(policy);
    }
    simAutoBuyRuins();
  }

  return {
    label,
    cycles: state.cycles,
    bestEra: eras[state.bestEraIndex || 0].name,
    maxPopulation: state.population,
    averageCycleAge: simCycleAges.length
      ? Math.round(simCycleAges.reduce((sum, age) => sum + age, 0) / simCycleAges.length)
      : 0
  };
}

console.log("Running comparative simulations...");
const results = [];
results.push(await runScenario("collapse100", "Joueur Agressif (Tout acheter / collapse 100%)", 8 * 3600, STEP_SECONDS, "all"));
results.push(await runScenario("collapse100", "Joueur Prudent (Sans infra / collapse 100%)", 8 * 3600, STEP_SECONDS, "prudent"));
results.push(await runScenario("collapse100", "Joueur Prudent (Avec infra + équilibre / collapse 100%)", 8 * 3600, STEP_SECONDS, "prudent_with_infra"));
results.push(await runScenario("longGame", "Joueur Prudent (Avec infra + équilibre / tenir long)", 8 * 3600, STEP_SECONDS, "prudent_with_infra"));

console.table(results);
