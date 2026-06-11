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
const { state, defaultState, invalidateRenderCache, setGamePaused, setCollapseInProgress, setBuyAmount, setState } = stateModule;

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
  legitimacyGain,
  has
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
  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;
    for (const building of visible) {
      for (const amount of [100, 25, 10, 1]) {
        if (simBuyBuilding(building, amount)) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
}

function simAutoBuyRuins() {
  const affordable = upgrades
    .filter((upgrade) => upgrade.group === "ruins" && !dogmaIds.has(upgrade.id))
    .sort((a, b) => a.cost.ruins - b.cost.ruins);
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const upgrade of affordable) {
      if (!canBuyUpgrade(upgrade)) continue;
      buyUpgrade(upgrade.id);
      changed = true;
    }
    for (const dogma of PRESTIGE_DOGMAS) {
      if (checkDogmaAvailability(dogma.id) !== "available") continue;
      buyUpgrade(dogma.id);
      changed = true;
    }
    if (!changed) break;
  }
}

function simBuyHeritageUpgrades() {
  const affordable = upgrades
    .filter(u => u.group === "heritage" && !state.upgrades[u.id])
    .sort((a, b) => a.cost.legitimacy - b.cost.legitimacy);
  for (const u of affordable) {
    if (state.legitimacy >= u.cost.legitimacy) {
      state.legitimacy -= u.cost.legitimacy;
      state.upgrades[u.id] = true;
    }
  }
}

function resolveCrisis() {
  if (!crisisOpen()) return;

  const age = (Date.now() - state.cycleStartedAt) / 1000;
  const gain = ruinGain();

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

async function runLongSimulation(strategy) {
  setState(defaultState());
  setGamePaused(false);
  setCollapseInProgress(false);
  setBuyAmount(100);
  
  const maxHours = 300;
  const durationSeconds = maxHours * 3600;
  const stepSeconds = 300;
  const tickSlice = 60;
  const startedAt = Date.now();

  const totalRuinsUpgradesCount = upgrades.filter(u => u.group === "ruins").length;

  let firstDynastyTime = null;
  let grandResetTime = null;
  let allRuinsUpgradesTime = null;
  
  let stopDynasties = false;

  for (let t = 0; t < durationSeconds; t += stepSeconds) {
    const elapsedHours = t / 3600;

    simAutoBuyBuildings();
    
    for (let slice = 0; slice < stepSeconds; slice += tickSlice) {
      Date.now = () => startedAt + (t + slice) * 1000;
      tick(tickSlice);
      await new Promise((resolve) => setImmediate(resolve));
      
      if (stateModule.gamePaused || crisisOpen()) {
        resolveCrisis();
      }
    }
    
    simAutoBuyRuins();

    const legGain = legitimacyGain();
    
    if (strategy === "noGrandReset") {
      if (state.dynastyCount >= 8) {
        stopDynasties = true;
      }
    } else if (strategy === "withGrandReset") {
      if (state.grandResetCount >= 1 && state.dynastyCount >= 8) {
        stopDynasties = true;
      }
    }

    if (legGain >= 6 && !stopDynasties) {
      state.dynastyDoctrine = "sillon";
      state.legitimacy += legGain;
      state.dynastyCount += 1;
      state.ruins = 0;
      resetCivilization();
      simBuyHeritageUpgrades();
      
      if (firstDynastyTime === null) {
        firstDynastyTime = elapsedHours;
      }
    }

    if (strategy === "withGrandReset" && state.grandResetCount === 0) {
      simBuyHeritageUpgrades();
      
      if (has("grand_reset") && grandResetTime === null) {
        const nextCount = (state.grandResetCount || 0) + 1;
        const savedMythsCompleted = { ...(state.mythsCompleted || {}) };
        const savedMythActsAnnounced = { ...(state.mythActsAnnounced || {}) };
        const savedLegitimacy = state.legitimacy || 0;
        const savedDynastyCount = state.dynastyCount || 0;
        const savedDynastyDoctrine = state.dynastyDoctrine || null;
        
        const fresh = defaultState();
        fresh.grandResetCount = nextCount;
        fresh.mythsCompleted = savedMythsCompleted;
        fresh.mythActsAnnounced = savedMythActsAnnounced;
        fresh.legitimacy = savedLegitimacy;
        fresh.dynastyCount = savedDynastyCount;
        fresh.dynastyDoctrine = savedDynastyDoctrine;
        
        setState(fresh);
        grandResetTime = elapsedHours;
        simBuyHeritageUpgrades();
      }
    }

    const ownedRuinsCount = upgrades.filter((u) => u.group === "ruins" && state.upgrades[u.id]).length;
    if (ownedRuinsCount >= totalRuinsUpgradesCount && allRuinsUpgradesTime === null) {
      allRuinsUpgradesTime = elapsedHours;
    }
    
    if (strategy === "noGrandReset" && allRuinsUpgradesTime !== null) {
      break;
    }
    if (strategy === "withGrandReset" && grandResetTime !== null && allRuinsUpgradesTime !== null) {
      break;
    }
  }

  const ownedRuinsCount = upgrades.filter((u) => u.group === "ruins" && state.upgrades[u.id]).length;

  return {
    firstDynastyTime,
    grandResetTime,
    allRuinsUpgradesTime,
    totalRuinsUpgradesCount,
    ownedRuinsCount,
    finalState: {
      cycles: state.cycles,
      population: state.population,
      gold: state.gold,
      ruins: state.ruins,
      legitimacy: state.legitimacy,
      dynastyCount: state.dynastyCount,
      grandResetCount: state.grandResetCount,
      bestEra: eras[state.bestEraIndex || 0].name
    }
  };
}

console.log("Exécution de la simulation A (Sans Grand Reset)...");
const r1 = await runLongSimulation("noGrandReset");

console.log("Exécution de la simulation B (Avec Grand Reset)...");
const r2 = await runLongSimulation("withGrandReset");

console.log("\n=========================================================================");
console.log("=== COMPARAISON DES STRATÉGIES DE JEU À LONG TERME (APRÈS AJUSTEMENT) ===");
console.log("=========================================================================");

console.log("\n🔹 STRATÉGIE A : Sans Grand Reset (Arrêt des dynasties à D8 pour accumuler)");
console.log(`  • Temps 1ère Dynastie: ${r1.firstDynastyTime ? r1.firstDynastyTime.toFixed(1) + "h" : "Non atteint"}`);
console.log(`  • Temps toutes les ruines achetées: ${r1.allRuinsUpgradesTime ? r1.allRuinsUpgradesTime.toFixed(1) + "h" : "Non atteint (Possédées: " + r1.ownedRuinsCount + "/" + r1.totalRuinsUpgradesCount + ")"}`);
console.log(`  • Cycles finaux: ${r1.finalState.cycles} | Dynasties: ${r1.finalState.dynastyCount}`);
console.log(`  • Meilleure ère: ${r1.finalState.bestEra}`);

console.log("\n🔹 STRATÉGIE B : Avec Grand Reset (Grand Reset dès 300 légitimité, puis arrêt à D8)");
console.log(`  • Temps 1ère Dynastie: ${r2.firstDynastyTime ? r2.firstDynastyTime.toFixed(1) + "h" : "Non atteint"}`);
console.log(`  • Temps du 1er Grand Reset: ${r2.grandResetTime ? r2.grandResetTime.toFixed(1) + "h" : "Non atteint"}`);
console.log(`  • Temps toutes les ruines achetées: ${r2.allRuinsUpgradesTime ? r2.allRuinsUpgradesTime.toFixed(1) + "h" : "Non atteint (Possédées: " + r2.ownedRuinsCount + "/" + r2.totalRuinsUpgradesCount + ")"}`);
console.log(`  • Cycles finaux: ${r2.finalState.cycles} | Dynasties: ${r2.finalState.dynastyCount}`);
console.log(`  • Meilleure ère: ${r2.finalState.bestEra}`);
