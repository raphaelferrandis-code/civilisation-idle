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
const { buildings, dynastyNames } = await import("./src/game/data/buildings.js");
const { upgrades, dogmaIds, PRESTIGE_DOGMAS } = await import("./src/game/data/upgrades.js");
const { eras } = await import("./src/game/data/world.js");
const {
  state,
  defaultState,
  invalidateRenderCache,
  setGamePaused,
  setCollapseInProgress,
  setBuyAmount,
  setState
} = await import("./src/game/core/state.js");
const {
  isUnlocked,
  canBuyUpgrade,
  checkDogmaAvailability,
  ruinGain,
  crisisOpen,
  terminalCrisisReady,
  buildingBatchCost
} = await import("./src/game/core/mechanics.js");
const {
  canPayCost,
  payCost
} = await import("./src/game/core/utils.js");
const {
  buyUpgrade,
  completeCollapse,
  runTerminalCrisisAction,
  tick,
  cycleYear
} = await import("./src/game/core/actions.js");
const { generateEpitaph } = await import("./src/game/core/events.js");

const DEFAULT_HOURS = 4;
const STEP_SECONDS = 120;
const TICK_SLICE_SECONDS = 5;

const hours = Number(process.argv[2]) || DEFAULT_HOURS;
const durationSeconds = hours * 3600;

function simCost(building, amount) {
  return buildingBatchCost(building, amount);
}

function simBuyBuilding(building, amount) {
  const cost = simCost(building, amount);
  if (!canPayCost(cost)) return false;
  payCost(cost);
  state.buildings[building.id] = (state.buildings[building.id] || 0) + amount;
  return true;
}

function simAutoBuyBuildings(currentBuyProfile) {
  const visible = buildings
    .filter((building) => isUnlocked(building))
    .filter((building) => {
      if (currentBuyProfile === "noInfra") return building.category !== "infra";
      if (currentBuyProfile === "cityOnly") return building.category === "city";
      return true;
    })
    .sort((a, b) => a.base - b.base);
  let bought = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;
    for (const building of visible) {
      for (const amount of [100, 25, 10, 1]) {
        if (simBuyBuilding(building, amount)) {
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

function runScenario(policy, label, durationSeconds, stepSeconds, buyProfile = "all") {
  setState(defaultState());
  setGamePaused(false);
  setCollapseInProgress(false);
  setBuyAmount(100);
  const currentBuyProfile = buyProfile;
  simCycleAges = [];
  invalidateRenderCache("all");

  const result = {
    label,
    cycles: 0,
    ruinsEarned: 0,
    ruinPurchases: 0,
    bestEra: eras[0].name,
    maxPopulation: state.population,
    maxKnowledge: state.knowledge,
    maxInfrastructure: state.infrastructure,
    averageCycleAge: 0,
    finalRuins: 0
  };
  let previousCycles = 0;
  let previousTotalRuins = 0;
  const startedAt = Date.now();

  for (let t = 0; t < durationSeconds; t += stepSeconds) {
    simAutoBuyBuildings(currentBuyProfile);
    for (let slice = 0; slice < stepSeconds; slice += TICK_SLICE_SECONDS) {
      Date.now = () => startedAt + (t + slice) * 1000;
      tick(TICK_SLICE_SECONDS);
      if (state.gamePaused || crisisOpen()) resolveCrisis(policy);
    }
    simAutoBuyRuins();

    if (state.cycles > previousCycles) {
      previousCycles = state.cycles;
    }
    const totalRuins = state.ruins + upgrades
      .filter((upgrade) => upgrade.group === "ruins" && state.upgrades[upgrade.id] && !dogmaIds.has(upgrade.id))
      .reduce((sum, upgrade) => sum + upgrade.cost.ruins, 0);
    result.ruinsEarned += Math.max(0, totalRuins - previousTotalRuins);
    previousTotalRuins = totalRuins;
    result.maxPopulation = Math.max(result.maxPopulation, state.population, state.cyclePeaks.population || 0);
    result.maxKnowledge = Math.max(result.maxKnowledge, state.knowledge, state.cyclePeaks.knowledge || 0);
    result.maxInfrastructure = Math.max(result.maxInfrastructure, state.infrastructure, state.cyclePeaks.infrastructure || 0);
    result.bestEra = eras[state.bestEraIndex || 0].name;
  }

  result.cycles = state.cycles;
  result.finalRuins = state.ruins;
  result.instability = state.instability;
  result.timeWear = state.timeWear;
  result.pendingGain = ruinGain();
  result.ruinPurchases = upgrades.filter((upgrade) => upgrade.group === "ruins" && state.upgrades[upgrade.id]).length;
  result.averageCycleAge = simCycleAges.length
    ? Math.round(simCycleAges.reduce((sum, age) => sum + age, 0) / simCycleAges.length)
    : 0;
  return result;
}

const scenarios = [
  ["collapse100", "Tout acheter / effondrer a 100%", "all"],
  ["collapse100", "Sans infra / effondrer a 100%", "noInfra"],
  ["longGame", "Sans infra / tenir long", "noInfra"],
  ["collapse100", "Moteurs seuls / effondrer a 100%", "cityOnly"],
  ["longGame", "Moteurs seuls / tenir long", "cityOnly"]
];

console.log(`Lancement des simulations pour ${hours}h de temps de jeu virtuel...`);
const results = scenarios.map(([policy, label, buyProfile]) => runScenario(policy, label, durationSeconds, STEP_SECONDS, buyProfile));
console.table(results.map((result) => ({
  Strategie: result.label,
  Cycles: result.cycles,
  "Ruines totales": result.ruinsEarned,
  "Ruines dispo": result.finalRuins,
  "Achats ruines": result.ruinPurchases,
  "Age moyen cycle": result.averageCycleAge + "s",
  "Pop max": Math.round(result.maxPopulation),
  "Savoir max": Math.round(result.maxKnowledge),
  "Infra max": Math.round(result.maxInfrastructure),
  Rupture: (result.instability * 100).toFixed(1) + "%",
  Usure: (result.timeWear * 100).toFixed(1) + "%",
  "Gain actuel": result.pendingGain,
  "Meilleure ere": result.bestEra
})));
