// Simulation headless du Mythe d'Antee.
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
      querySelector() { return null; },
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
  addEventListener() {}
  play() { return Promise.resolve(); }
  pause() {}
};

const { buildings } = await import("../src/game/data/buildings.js");
const { getMythById, MYTHS } = await import("../src/game/data/myths.js");
const { registerChoiceDialog } = await import("../src/game/core/choiceDialog.js");
const stateModule = await import("../src/game/core/state.js");
const {
  state,
  defaultState,
  invalidateRenderCache,
  setBuyAmount,
  setCollapseInProgress,
  setGamePaused,
  setState
} = stateModule;
const {
  activateMyth,
  tick
} = await import("../src/game/core/actions.js");
const {
  buildingBatchCost,
  rates,
  timeWearRate,
  ruinGain,
  crisisOpen
} = await import("../src/game/core/mechanics.js");
const { canPayCost, payCost } = await import("../src/game/core/utils.js");
const {
  activeRuinMultiplier,
  ANTEE_POWER_THRESHOLD
} = await import("../src/game/data/activeRuins.js");

const SELECTED_RUINS = ["enee", "promethee", "age_or", "hephaistos"];

function resetForAntee() {
  setState(defaultState());
  setGamePaused(false);
  setCollapseInProgress(false);
  setBuyAmount(10);
  invalidateRenderCache("all");

  for (const myth of MYTHS.filter((m) => m.act === 1 || m.act === 2)) {
    state.mythsCompleted[myth.id] = true;
  }
  state.eneeHeritage = true;
  state.eneeCollapseCount = 6;
  state.prometheeBraisiers = true;
  state.orHeritage = true;
  state.hephHeritage = true;
  state.ruins = 1200;
}

function seedSampleEconomy() {
  state.population = 80;
  state.buildings.foragers = 8;
  state.buildings.caravans = 8;
  state.buildings.markets = 5;
  state.buildings.roads = 5;
  state.cyclePeaks = {
    population: 50000,
    knowledge: 10000,
    infrastructure: 10000,
    eraIndex: 5
  };
}

function totalCost(costs) {
  return Object.values(costs).reduce((sum, value) => sum + value, 0);
}

function buyBuilding(building, amount = 1) {
  const cost = buildingBatchCost(building, amount);
  if (!canPayCost(cost)) return false;
  payCost(cost);
  state.buildings[building.id] = (state.buildings[building.id] || 0) + amount;
  return true;
}

function autoBuy() {
  const visible = buildings
    .filter((building) => state.buildings[building.id] > 0 || !building.unlockBuilding || state.buildings[building.unlockBuilding.id] >= building.unlockBuilding.count)
    .sort((a, b) => a.base - b.base);
  let bought = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const building of visible) {
      for (const amount of [10, 5, 1]) {
        if (buyBuilding(building, amount)) {
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

function anteePower() {
  return Math.max(0, state.population || 0)
    + Math.max(0, state.food || 0) * 0.05
    + Math.max(0, state.gold || 0) * 0.1
    + Math.max(0, state.knowledge || 0) * 0.25
    + Math.max(0, state.infrastructure || 0);
}

async function checkActivationAndMaluses() {
  resetForAntee();
  seedSampleEconomy();
  const foragers = buildings.find((building) => building.id === "foragers" || building.food > 0);
  state.activeRuinIds = [];
  const normalFoodCost = totalCost(buildingBatchCost(foragers, 1));
  const normalGoldRate = rates().gold;
  const normalWear = timeWearRate();
  state.instability = 1;
  state.cycleStartedAt = Date.now() - 900_000;
  const normalRuinGain = ruinGain();

  resetForAntee();
  registerChoiceDialog((dialog) => Promise.resolve({
    ...dialog.options[0],
    selectedIds: SELECTED_RUINS
  }));
  await activateMyth("mythe_d_antee");
  seedSampleEconomy();

  const antee = getMythById("mythe_d_antee");
  const ruptureAfterActivation = state.instability;
  const activeFoodCost = totalCost(buildingBatchCost(foragers, 1));
  const activeGoldRate = rates().gold;
  const activeWear = timeWearRate();
  state.instability = 1;
  state.cycleStartedAt = Date.now() - 900_000;
  const activeRuinGain = ruinGain();

  return {
    activeMythId: state.activeMythId,
    activeRuinIds: [...state.activeRuinIds],
    ruptureAfterActivation: Number(ruptureAfterActivation.toFixed(3)),
    foodCostRatio: Number((activeFoodCost / normalFoodCost).toFixed(3)),
    goldRateRatio: normalGoldRate > 0 ? Number((activeGoldRate / normalGoldRate).toFixed(3)) : null,
    timeWearRatio: Number((activeWear / normalWear).toFixed(3)),
    ruinGainRatio: normalRuinGain > 0 ? Number((activeRuinGain / normalRuinGain).toFixed(3)) : null,
    activeRuinMultiplier: Number(activeRuinMultiplier(state).toFixed(3)),
    collapseSuccessAtStart: antee.onCollapse()
  };
}

async function runProgression(maxMinutes = 45) {
  resetForAntee();
  registerChoiceDialog((dialog) => Promise.resolve({
    ...dialog.options[0],
    selectedIds: SELECTED_RUINS
  }));
  const startedAt = Date.now();
  Date.now = () => startedAt;
  await activateMyth("mythe_d_antee");

  const antee = getMythById("mythe_d_antee");
  let maxPower = anteePower();
  let reachedAt = null;
  let bought = 0;

  for (let second = 0; second <= maxMinutes * 60; second += 5) {
    Date.now = () => startedAt + second * 1000;
    bought += autoBuy();
    tick(5);
    maxPower = Math.max(maxPower, anteePower());
    if (!reachedAt && antee.onCollapse()) {
      reachedAt = second;
      break;
    }
    if (crisisOpen()) break;
  }

  return {
    reached: Boolean(reachedAt),
    reachedAtSeconds: reachedAt,
    maxPower: Math.round(maxPower),
    targetPower: ANTEE_POWER_THRESHOLD,
    activeRuinCount: state.activeRuinIds.length,
    population: Math.round(state.population),
    food: Math.round(state.food),
    gold: Math.round(state.gold),
    knowledge: Math.round(state.knowledge),
    infrastructure: Math.round(state.infrastructure),
    instabilityPct: Number((state.instability * 100).toFixed(1)),
    timeWearPct: Number((state.timeWear * 100).toFixed(1)),
    buildingsBought: bought
  };
}

console.log("=== Simulation Antée : activation et malus ===");
console.table([await checkActivationAndMaluses()]);

console.log("\n=== Simulation Antée : faisabilité automatique ===");
console.table([await runProgression(45)]);
