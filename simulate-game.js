"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

// Le jeu est désormais découpé en plusieurs fichiers chargés dans cet ordre
// (cf. index.html). On les concatène pour reconstituer une source unique exécutable
// dans le VM, exactement comme l'ancien game.js monolithique.
const GAME_FILES = [
  "core/utils.js",
  "data/buildings.js",
  "data/upgrades.js",
  "data/world.js",
  "core/state.js",
  "core/mechanics.js",
  "core/events.js",
  "core/actions.js",
  "ui/render.js",
  "citymap/core/camera.js",
  "citymap/core/hit-test.js",
  "citymap/core/input.js",
  "citymap/core/runtime.js",
  "citymap/rendering/draw-utils.js",
  "citymap/rendering/ground.js",
  "citymap/rendering/roads.js",
  "citymap/rendering/agents.js",
  "citymap/rendering/crisis.js",
  "citymap/citymap.js",
  "core/main.js"
];
const DEFAULT_HOURS = 4;
const STEP_SECONDS = 120;
const TICK_SLICE_SECONDS = 5;

const hours = Number(process.argv[2]) || DEFAULT_HOURS;
const durationSeconds = hours * 3600;

function browserStubs(fakeClock) {
  return {
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

function simAutoBuyBuildings() {
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
  gamePaused = false;
  collapseInProgress = false;
  simAutoBuyRuins();
  return true;
}

function resolveCrisis(policy) {
  if (!crisisOpen()) {
    gamePaused = false;
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

let currentBuyProfile = "all";

function runScenario(policy, label, durationSeconds, stepSeconds, buyProfile = "all") {
  state = defaultState();
  gamePaused = false;
  collapseInProgress = false;
  buyAmount = 100;
  currentBuyProfile = buyProfile;
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
    simAutoBuyBuildings();
    for (let slice = 0; slice < stepSeconds; slice += ${TICK_SLICE_SECONDS}) {
      fakeClock.now = startedAt + (t + slice) * 1000;
      tick(${TICK_SLICE_SECONDS});
      if (gamePaused || crisisOpen()) resolveCrisis(policy);
    }
    simAutoBuyRuins();

    if (state.cycles > previousCycles) {
      previousCycles = state.cycles;
    }
    const totalRuins = state.ruins + upgrades
      .filter((upgrade) => upgrade.group === "ruins" && has(upgrade.id) && !dogmaIds.has(upgrade.id))
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
  result.ruinPurchases = upgrades.filter((upgrade) => upgrade.group === "ruins" && has(upgrade.id)).length;
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

const results = scenarios.map(([policy, label, buyProfile]) => runScenario(policy, label, ${durationSeconds}, ${STEP_SECONDS}, buyProfile));
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
`;

const fakeClock = { now: 0 };
const concatenated = GAME_FILES
  .map((file) => fs.readFileSync(path.join(__dirname, "js", file), "utf8"))
  .join("\n");
// Retire la séquence d'initialisation (à partir de l'appel `bind();` dans main.js)
// pour que le runner pilote la simulation à la place.
const source = concatenated.replace(/\r?\nbind\(\);[\s\S]*$/, "") + runner;
const sandbox = browserStubs(fakeClock);
sandbox.fakeClock = fakeClock;

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "simulate-game.vm.js" });
