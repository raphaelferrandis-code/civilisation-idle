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

const { buildings } = await import("../src/game/data/buildings.js");
const { upgrades } = await import("../src/game/data/upgrades.js");
const { eras } = await import("../src/game/data/world.js");
const { registerWorldEffects } = await import("../src/game/data/worldEffects.js");
const stateModule = await import("../src/game/core/state.js");
const { state, defaultState, invalidateRenderCache, setGamePaused, setCollapseInProgress, setBuyAmount, setState } = stateModule;
const { registerChoiceDialog } = await import("../src/game/core/choiceDialog.js");
registerChoiceDialog((dialog) => dialog.options[0]);
const {
  addProductionPenalty,
  amplifyRuptureFactor,
  isUnlocked,
  canBuyUpgrade,
  buildingBatchCost,
  currentEraIndex,
  crisisOpen,
  ruinGain
} = await import("../src/game/core/mechanics.js");
const { canPayCost, payCost } = await import("../src/game/core/utils.js");
const { buyUpgrade, chronicle, tick } = await import("../src/game/core/actions.js");
const { clamp01 } = await import("../src/game/core/utils.js");

const STEP_SECONDS = 120;
const TICK_SLICE_SECONDS = 5;
const MAX_SECONDS = 8 * 3600;
const startedAt = Date.now();
const originalDateNow = Date.now;
const buyNormalUpgrades = !process.argv.includes("--no-upgrades");
const reportOnly = process.argv.includes("--report-only");

setState(defaultState());
setGamePaused(false);
setCollapseInProgress(false);
setBuyAmount(100);
invalidateRenderCache("all");
registerWorldEffects({ addProductionPenalty, chronicle, amplifyRuptureFactor, clamp01, state });

function buyBuilding(building, amount) {
  const cost = buildingBatchCost(building, amount);
  if (!canPayCost(cost)) return false;
  payCost(cost);
  state.buildings[building.id] = (state.buildings[building.id] || 0) + amount;
  invalidateRenderCache("all");
  return true;
}

function autoBuyBuildings() {
  const visible = buildings
    .filter((building) => isUnlocked(building))
    .sort((a, b) => a.base - b.base);
  let bought = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;
    for (const building of visible) {
      for (const amount of [100, 25, 10, 1]) {
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

function autoBuyNormalUpgrades() {
  let bought = 0;
  const affordable = upgrades
    .filter((upgrade) => upgrade.group !== "ruins" && upgrade.group !== "heritage")
    .sort((a, b) => {
      const ac = Object.values(a.cost || {})[0] || 0;
      const bc = Object.values(b.cost || {})[0] || 0;
      return ac - bc;
    });
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const upgrade of affordable) {
      if (!canBuyUpgrade(upgrade)) continue;
      buyUpgrade(upgrade.id);
      bought += 1;
      changed = true;
      invalidateRenderCache("all");
    }
    if (!changed) break;
  }
  return bought;
}

const milestones = new Map();
const logRows = [];

for (let elapsed = 0; elapsed <= MAX_SECONDS; elapsed += STEP_SECONDS) {
  autoBuyBuildings();
  if (buyNormalUpgrades) autoBuyNormalUpgrades();

  for (let slice = 0; slice < STEP_SECONDS; slice += TICK_SLICE_SECONDS) {
    const nowSeconds = elapsed + slice;
    Date.now = () => startedAt + nowSeconds * 1000;
    tick(TICK_SLICE_SECONDS);
    await new Promise((resolve) => setImmediate(resolve));

    const eraIndex = currentEraIndex();
    if (!milestones.has(eraIndex)) {
      milestones.set(eraIndex, nowSeconds + TICK_SLICE_SECONDS);
      logRows.push({
        index: eraIndex,
        name: eras[eraIndex]?.name,
        threshold: eras[eraIndex]?.at,
        seconds: nowSeconds + TICK_SLICE_SECONDS,
        population: state.population.toString()
      });
    }

    if (!reportOnly && milestones.has(9) && milestones.has(10)) {
      Date.now = originalDateNow;
      console.log(JSON.stringify({
        interpretation10thEra: { index: 9, name: eras[9].name, threshold: eras[9].at, seconds: milestones.get(9) },
        eraIndex10: { index: 10, name: eras[10].name, threshold: eras[10].at, seconds: milestones.get(10) },
        current: {
          eraIndex,
          eraName: eras[eraIndex]?.name,
          population: state.population.toString(),
          instability: state.instability,
          timeWear: state.timeWear,
          crisisOpen: crisisOpen(),
        pendingRuinGain: ruinGain()
      },
      buyNormalUpgrades,
      milestones: logRows
    }, null, 2));
      process.exit(0);
    }
  }
}

Date.now = originalDateNow;
console.log(JSON.stringify({
  reached: Object.fromEntries(milestones),
  currentEraIndex: currentEraIndex(),
  currentEraName: eras[currentEraIndex()]?.name,
  population: state.population.toString(),
  buyNormalUpgrades,
  milestones: logRows
}, null, 2));
