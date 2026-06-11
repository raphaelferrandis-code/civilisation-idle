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
const { upgrades, dogmaIds, PRESTIGE_DOGMAS, PRESTIGE_TREE } = await import("../src/game/data/upgrades.js");
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
  payCost,
  has
} = await import("../src/game/core/utils.js");
const {
  buyUpgrade,
  completeCollapse,
  runTerminalCrisisAction,
  tick,
  cycleYear,
  resetCivilization
} = await import("../src/game/core/actions.js");
const { generateEpitaph } = await import("../src/game/core/events.js");

const STEP_SECONDS = 60;
const TICK_SLICE_SECONDS = 5;

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

function simBuyHeritageUpgrades() {
  const affordable = upgrades
    .filter(u => u.group === "heritage" && !state.upgrades[u.id])
    .sort((a, b) => a.cost.legitimacy - b.cost.legitimacy);
  let bought = 0;
  for (const u of affordable) {
    if (state.legitimacy >= u.cost.legitimacy) {
      state.legitimacy -= u.cost.legitimacy;
      state.upgrades[u.id] = true;
      bought += 1;
    }
  }
  return bought;
}

function resolveCrisis(policy) {
  if (!crisisOpen()) {
    setGamePaused(false);
    return;
  }

  const age = (Date.now() - state.cycleStartedAt) / 1000;
  const gain = ruinGain();

  if (policy === "collapse100") {
    const gain = ruinGain();
    completeCollapse(gain, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), "auto");
    setGamePaused(false);
    setCollapseInProgress(false);
    simAutoBuyRuins();
    return;
  }

  if (policy === "longGame") {
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
    completeCollapse(gain, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), "forced");
    setGamePaused(false);
    setCollapseInProgress(false);
    simAutoBuyRuins();
  }
}

async function runProgressionSimulation(policy, durationHours, foundDynastyMinLegitimacy = 1) {
  setState(defaultState());
  setGamePaused(false);
  setCollapseInProgress(false);
  setBuyAmount(100);
  
  const durationSeconds = durationHours * 3600;
  const startedAt = Date.now();
  
  const eventsLog = [];
  const unlockedBuildings = new Set();
  const reachedEras = new Set();
  let lastCollapseTime = 0;
  let cycleCount = 0;
  
  eventsLog.push({ time: 0, type: "start", msg: "Début de la simulation." });

  for (let t = 0; t < durationSeconds; t += STEP_SECONDS) {
    const elapsedMinutes = t / 60;
    const elapsedHours = t / 3600;
    
    // Track building unlocks
    for (const b of buildings) {
      if (isUnlocked(b) && !unlockedBuildings.has(b.id)) {
        unlockedBuildings.add(b.id);
        eventsLog.push({ time: elapsedHours, type: "building_unlock", id: b.id, msg: `Bâtiment débloqué: ${b.name} (${b.category})` });
      }
    }
    
    // Track era unlocks
    let maxEraIndex = 0;
    for (let i = 0; i < eras.length; i += 1) {
      if (state.population >= eras[i].at) maxEraIndex = i;
    }
    const currentEraName = eras[maxEraIndex].name;
    if (!reachedEras.has(currentEraName)) {
      reachedEras.add(currentEraName);
      eventsLog.push({ time: elapsedHours, type: "era_unlock", name: currentEraName, msg: `Ère atteinte: ${currentEraName} (pop: ${Math.round(state.population)})` });
    }
    
    // Auto-buy buildings
    simAutoBuyBuildings();
    
    // Tick time
    for (let slice = 0; slice < STEP_SECONDS; slice += TICK_SLICE_SECONDS) {
      Date.now = () => startedAt + (t + slice) * 1000;
      const prevCycles = state.cycles;
      tick(TICK_SLICE_SECONDS);
      
      if (state.cycles > prevCycles) {
        cycleCount++;
        const timeSinceLastCollapse = elapsedHours - lastCollapseTime;
        lastCollapseTime = elapsedHours;
      }
      
      await new Promise((resolve) => setImmediate(resolve));
      if (stateModule.gamePaused || crisisOpen()) {
        resolveCrisis(policy);
      }
    }
    
    // Buy upgrades
    simAutoBuyRuins();
    simBuyHeritageUpgrades();
    
    // Dynasty founding logic
    const legGain = legitimacyGain();
    if (legGain >= foundDynastyMinLegitimacy) {
      const oldDynasty = state.dynastyCount;
      // Proclaim doctrine
      state.dynastyDoctrine = "sillon";
      state.legitimacy += legGain;
      state.dynastyCount += 1;
      state.ruins = 0;
      resetCivilization();
      simBuyHeritageUpgrades();
      eventsLog.push({
        time: elapsedHours,
        type: "dynasty_found",
        count: state.dynastyCount,
        msg: `Dynastie fondée: #${state.dynastyCount} (Gain légitimité: +${legGain}, totale: ${state.legitimacy})`
      });
    }
  }
  
  return {
    events: eventsLog,
    finalState: {
      cycles: state.cycles,
      population: state.population,
      gold: state.gold,
      knowledge: state.knowledge,
      infra: state.infrastructure,
      ruins: state.ruins,
      legitimacy: state.legitimacy,
      dynastyCount: state.dynastyCount,
      grandResetCount: state.grandResetCount,
      bestEra: eras[state.bestEraIndex || 0].name
    }
  };
}

console.log("Exécution de la simulation pour 24 heures de jeu virtuel...");
const resultLeg1 = await runProgressionSimulation("longGame", 24, 1);
const resultLeg6 = await runProgressionSimulation("longGame", 24, 6);

fs.writeFileSync("./scratch/progression_leg1.json", JSON.stringify(resultLeg1, null, 2));
fs.writeFileSync("./scratch/progression_leg6.json", JSON.stringify(resultLeg6, null, 2));

console.log("\n=== COMPARAISON DES RÉSULTATS (24H DE JEU VIRTUEL) ===");
console.log(`\n🔹 Stratégie 1: Fonder Dynastie dès que Légitimité >= 1`);
console.log(`  • Dynasties fondées: ${resultLeg1.finalState.dynastyCount}`);
console.log(`  • Légitimité finale: ${resultLeg1.finalState.legitimacy}`);
console.log(`  • Ère max atteinte: ${resultLeg1.finalState.bestEra}`);
console.log(`  • Cycles totaux: ${resultLeg1.finalState.cycles}`);
console.log(`  • Population finale: ${Math.round(resultLeg1.finalState.population)}`);

console.log(`\n🔹 Stratégie 2: Fonder Dynastie seulement si Légitimité >= 6 (Comportement sim_long)`);
console.log(`  • Dynasties fondées: ${resultLeg6.finalState.dynastyCount}`);
console.log(`  • Légitimité finale: ${resultLeg6.finalState.legitimacy}`);
console.log(`  • Ère max atteinte: ${resultLeg6.finalState.bestEra}`);
console.log(`  • Cycles totaux: ${resultLeg6.finalState.cycles}`);
console.log(`  • Population finale: ${Math.round(resultLeg6.finalState.population)}`);

// Print timeline for Strategy 1
console.log("\n--- CHRONOLOGIE DE LA STRATÉGIE 1 (Légitimité >= 1) ---");
resultLeg1.events.filter(e => e.type !== "building_unlock").slice(0, 30).forEach(e => {
  console.log(`  [${e.time.toFixed(2)}h] ${e.msg}`);
});

// Print timeline for Strategy 2
console.log("\n--- CHRONOLOGIE DE LA STRATÉGIE 2 (Légitimité >= 6) ---");
resultLeg6.events.filter(e => e.type !== "building_unlock").slice(0, 30).forEach(e => {
  console.log(`  [${e.time.toFixed(2)}h] ${e.msg}`);
});
