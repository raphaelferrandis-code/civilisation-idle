import fs from "fs";
import path from "path";

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    let srcPath = path.join(src, entry.name);
    let destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper to replace content in file
function replaceInFileSync(filePath, target, replacement) {
  let content = fs.readFileSync(filePath, "utf8");
  if (!content.includes(target)) {
    throw new Error(`Target string not found in ${filePath}:\n${target}`);
  }
  fs.writeFileSync(filePath, content.replace(target, replacement), "utf8");
}

async function runSimForConfig(id, denominatorFactor, baseline = 220, usePower = false, powerVal = 1.0) {
  const tempDirName = `game_temp_${id}`;
  const tempDir = path.resolve(`./scratch/${tempDirName}`);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  copyDirSync("./src/game", tempDir);

  // Apply modification
  const mechanicsPath = path.join(tempDir, "core/mechanics.js");
  const targetStr = "const foodScore = state.food / Math.max(220, state.population * 8);";
  let replacementStr = "";
  if (usePower) {
    replacementStr = `const foodScore = state.food / Math.max(${baseline}, Math.pow(state.population, ${powerVal}) * 8);`;
  } else {
    replacementStr = `const foodScore = state.food / Math.max(${baseline}, state.population * ${denominatorFactor});`;
  }
  replaceInFileSync(mechanicsPath, targetStr, replacementStr);

  // Setup globals for simulator
  global.fakeClock = { now: Date.now() };
  global.window = {};
  global.localStorage = {
    getItem() { return null; },
    setItem() {}
  };
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
  global.openChoiceDialog = async () => ({ apply() {} });

  // Dynamic imports from the specific unique temp directory
  const { buildings, dynastyNames } = await import(`./${tempDirName}/data/buildings.js`);
  const { upgrades, dogmaIds, PRESTIGE_DOGMAS } = await import(`./${tempDirName}/data/upgrades.js`);
  const { eras } = await import(`./${tempDirName}/data/world.js`);
  const stateModule = await import(`./${tempDirName}/core/state.js`);
  const {
    state,
    defaultState,
    invalidateRenderCache,
    setGamePaused,
    setCollapseInProgress,
    setBuyAmount,
    setState
  } = stateModule;

  const { registerChoiceDialog } = await import(`./${tempDirName}/core/choiceDialog.js`);
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
  } = await import(`./${tempDirName}/core/mechanics.js`);
  const {
    canPayCost,
    payCost
  } = await import(`./${tempDirName}/core/utils.js`);
  const {
    buyUpgrade,
    completeCollapse,
    runTerminalCrisisAction,
    tick,
    cycleYear
  } = await import(`./${tempDirName}/core/actions.js`);
  const { generateEpitaph } = await import(`./${tempDirName}/core/events.js`);

  const DEFAULT_HOURS = 20;
  const STEP_SECONDS = 120;
  const TICK_SLICE_SECONDS = 5;

  const hours = DEFAULT_HOURS;
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

  async function runScenario(policy, label, durationSeconds, stepSeconds, buyProfile = "all") {
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
        await new Promise((resolve) => setImmediate(resolve));
        if (stateModule.gamePaused || crisisOpen()) resolveCrisis(policy);
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

  // Run only the standard "Tout acheter / effondrer a 100%" scenario to compare
  const label = usePower
    ? `Factor 8 (Power ${powerVal}, Base ${baseline})`
    : `Factor ${denominatorFactor} (Base ${baseline})`;
  const res = await runScenario("collapse100", label, durationSeconds, STEP_SECONDS, "all");

  // Clean up after run
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (e) {
    // Ignore
  }

  return res;
}

async function run() {
  console.log("Running comparative simulations with unique directory imports...");
  const configs = [
    { id: 1, factor: 8, baseline: 220, power: false },
    { id: 2, factor: 16, baseline: 440, power: false },
    { id: 3, factor: 24, baseline: 660, power: false },
    { id: 4, factor: 32, baseline: 880, power: false },
    { id: 5, factor: 48, baseline: 1320, power: false }
  ];

  const results = [];
  for (let config of configs) {
    const res = await runSimForConfig(config.id, config.factor, config.baseline, config.power, config.powerVal);
    results.push(res);
  }

  console.table(results.map((result) => ({
    Configuration: result.label,
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
}

run().catch(console.error);
