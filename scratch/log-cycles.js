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

global.render = () => {};
global.save = () => {};
global.openView = () => {};
global.checkCrisisThresholds = () => {};
global.openChoiceDialog = async () => ({ apply() {} });

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
const { canPayCost, payCost } = await import("../src/game/core/utils.js");
const {
  buyUpgrade,
  completeCollapse,
  runTerminalCrisisAction,
  tick,
  resetCivilization
} = await import("../src/game/core/actions.js");
const { generateEpitaph } = await import("../src/game/core/events.js");

const durationSeconds = 12 * 3600;
const STEP_SECONDS = 120;
const TICK_SLICE_SECONDS = 5;

function simBuyBuilding(building, amount) {
  const cost = buildingBatchCost(building, amount);
  if (!canPayCost(cost)) return false;
  payCost(cost);
  state.buildings[building.id] = (state.buildings[building.id] || 0) + amount;
  return true;
}

function simAutoBuyBuildings() {
  const visible = buildings
    .filter((building) => isUnlocked(building))
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

const cycleLogs = [];

function resolveCrisis() {
  if (!crisisOpen()) return;

  const age = (Date.now() - state.cycleStartedAt) / 1000;
  const gain = ruinGain();

  // Try to hold
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

  // Collapse
  const maxEraIndex = state.cyclePeaks.eraIndex || 0;
  const eraName = eras[maxEraIndex].name;
  
  cycleLogs.push({
    cycle: state.cycles,
    durationMinutes: (age / 60).toFixed(1),
    gain: gain,
    popPeak: Math.round(state.cyclePeaks.population || state.population),
    era: eraName,
    unspentRuins: state.ruins + gain
  });

  completeCollapse(gain, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), "forced");
  setGamePaused(false);
  setCollapseInProgress(false);
  simAutoBuyRuins();
}

setState(defaultState());
setGamePaused(false);
setCollapseInProgress(false);
setBuyAmount(100);

const startedAt = Date.now();

for (let t = 0; t < durationSeconds; t += STEP_SECONDS) {
  simAutoBuyBuildings();
  for (let slice = 0; slice < STEP_SECONDS; slice += TICK_SLICE_SECONDS) {
    Date.now = () => startedAt + (t + slice) * 1000;
    tick(TICK_SLICE_SECONDS);
    await new Promise((resolve) => setImmediate(resolve));
    if (stateModule.gamePaused || crisisOpen()) {
      resolveCrisis();
    }
  }
  simAutoBuyRuins();
}

console.log("=== COMPTE RENDU DES CYCLES (12 HEURES) ===");
console.table(cycleLogs.slice(0, 40).map(c => ({
  "Cycle": c.cycle,
  "Durée (min)": c.durationMinutes + " min",
  "Gain Ruines": c.gain,
  "Pop Peak": c.popPeak,
  "Ère atteinte": c.era,
  "Ruines dispo après reset": c.unspentRuins
})));

if (cycleLogs.length > 40) {
  console.log(`... et ${cycleLogs.length - 40} autres cycles.`);
  console.log("Derniers cycles :");
  console.table(cycleLogs.slice(-10).map(c => ({
    "Cycle": c.cycle,
    "Durée (min)": c.durationMinutes + " min",
    "Gain Ruines": c.gain,
    "Pop Peak": c.popPeak,
    "Ère atteinte": c.era,
    "Ruines dispo après reset": c.unspentRuins
  })));
}
