"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const GAME_FILES = [
  "utils.js",
  "data-buildings.js",
  "data-upgrades.js",
  "data-world.js",
  "state.js",
  "mechanics.js",
  "events.js",
  "actions.js",
  "render.js",
  "myths/data-myths.js",
  "citymap-layout.js",
  "citymap-camera.js",
  "citymap-hit-test.js",
  "citymap-input.js",
  "citymap-runtime.js",
  "citymap-draw-utils.js",
  "citymap-render-ground.js",
  "citymap-render-roads.js",
  "citymap-render-agents.js",
  "citymap-render-crisis.js",
  "citymap-render-buildings.js",
  "citymap.js",
  "main.js"
];

function browserStubs(fakeClock) {
  return {
    results: null,
    console,
    Math,
    Uint8Array,
    TextEncoder,
    TextDecoder,
    btoa: (text) => Buffer.from(text, "binary").toString("base64"),
    atob: (text) => Buffer.from(text, "base64").toString("binary"),
    Date: { now: () => fakeClock.now },
    setInterval() {},
    setTimeout(fn) { fn(); return 0; },
    clearTimeout() {},
    localStorage: {
      getItem() { return null; },
      setItem() {}
    },
    navigator: { clipboard: { writeText() {} } },
    document: {
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
    },
    window: {}
  };
}

const runner = `
render = () => {};
save = () => {};
openView = () => {};
checkCrisisThresholds = () => {};
captureVestige = () => {};
openChoiceDialog = async () => ({ apply() {} });

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

function simAutoBuyBuildings(profile) {
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

function resolveCrisis(policy) {
  if (!crisisOpen()) {
    gamePaused = false;
    return;
  }

  const age = (Date.now() - state.cycleStartedAt) / 1000;
  const gain = ruinGain();

  if (policy === "collapse100") {
    const fallenDynasty = dynastyNames[state.dynastyCount % dynastyNames.length];
    completeCollapse(gain, fallenDynasty, generateEpitaph(), "auto");
    gamePaused = false;
    collapseInProgress = false;
    simAutoBuyRuins();
    return "collapsed";
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
        return "extended";
      }
    }
    const fallenDynasty = dynastyNames[state.dynastyCount % dynastyNames.length];
    completeCollapse(gain, fallenDynasty, generateEpitaph(), "forced");
    gamePaused = false;
    collapseInProgress = false;
    simAutoBuyRuins();
    return "collapsed";
  }

  return "waiting";
}

function simBuyHeritageUpgrades() {
  const affordable = upgrades
    .filter(u => u.group === "heritage" && !has(u.id))
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

function runLongSimulation(strategy) {
  state = defaultState();
  gamePaused = false;
  collapseInProgress = false;
  buyAmount = 100;
  
  const maxHours = 1200;
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
      fakeClock.now = startedAt + (t + slice) * 1000;
      tick(tickSlice);
      
      if (gamePaused || crisisOpen()) {
        resolveCrisis("longGame");
      }
    }
    
    simAutoBuyRuins();

    const legGain = legitimacyGain();
    
    // Stratégie d'arrêt pour accumuler les ruines
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
        
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, fresh);
        
        grandResetTime = elapsedHours;
        
        simBuyHeritageUpgrades();
      }
    }

    const ownedRuinsCount = upgrades.filter((u) => u.group === "ruins" && has(u.id)).length;
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

  const ownedRuinsCount = upgrades.filter((u) => u.group === "ruins" && has(u.id)).length;

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
      bestEra: eras[state.bestEraIndex].name
    }
  };
}

results = {
  noGrandReset: runLongSimulation("noGrandReset"),
  withGrandReset: runLongSimulation("withGrandReset")
};
`;

const concatenated = GAME_FILES
  .map((file) => {
    const fullPath = path.join(__dirname, "..", "js", file);
    try {
      return fs.readFileSync(fullPath, "utf8");
    } catch (err) {
      console.error(`Erreur lors de la lecture de ${file} à l'emplacement ${fullPath}`);
      throw err;
    }
  })
  .join("\n");

const source = concatenated.replace(/\r?\nbind\(\);[\s\S]*$/, "") + runner;

const fakeClock = { now: Date.now() };
const sandbox = browserStubs(fakeClock);
sandbox.fakeClock = fakeClock;

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "simulate-game-long.vm.js" });

const results = sandbox.results;

fs.writeFileSync(path.join(__dirname, "sim_long_results.json"), JSON.stringify(results, null, 2));

console.log("\n=========================================================================");
console.log("=== COMPARAISON DES STRATÉGIES DE JEU À LONG TERME (JUSQU'À 1200 HEURES) ===");
console.log("=========================================================================");

const r1 = results.noGrandReset;
const r2 = results.withGrandReset;

console.log("\n🔹 STRATÉGIE A : Sans Grand Reset (Arrêt des dynasties à D8 pour accumuler)");
console.log(`  • Temps 1ère Dynastie: ${r1.firstDynastyTime ? r1.firstDynastyTime.toFixed(1) + "h" : "Non atteint"}`);
console.log(`  • Temps toutes les ruines achetées: ${r1.allRuinsUpgradesTime ? r1.allRuinsUpgradesTime.toFixed(1) + "h" : "Non atteint (Possédées: " + r1.ownedRuinsCount + "/" + r1.totalRuinsUpgradesCount + ")"}`);
console.log(`  • Cycles finaux: ${r1.finalState.cycles} | Dynasties: ${r1.finalState.dynastyCount}`);

console.log("\n🔹 STRATÉGIE B : Avec Grand Reset (Grand Reset dès 300 légitimité, puis arrêt à D8)");
console.log(`  • Temps 1ère Dynastie: ${r2.firstDynastyTime ? r2.firstDynastyTime.toFixed(1) + "h" : "Non atteint"}`);
console.log(`  • Temps du 1er Grand Reset: ${r2.grandResetTime ? r2.grandResetTime.toFixed(1) + "h" : "Non atteint"}`);
console.log(`  • Temps toutes les ruines achetées: ${r2.allRuinsUpgradesTime ? r2.allRuinsUpgradesTime.toFixed(1) + "h" : "Non atteint (Possédées: " + r2.ownedRuinsCount + "/" + r2.totalRuinsUpgradesCount + ")"}`);
console.log(`  • Cycles finaux: ${r2.finalState.cycles} | Dynasties: ${r2.finalState.dynastyCount}`);
