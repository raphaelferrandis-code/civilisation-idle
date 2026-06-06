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
    results: null, // Déclaré dans le scope global du sandbox pour compatibilité strict mode
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

function simAutoBuyBuildings(profile) {
  const visible = buildings
    .filter((building) => isUnlocked(building))
    .filter((building) => {
      if (profile === "noInfra") return building.category !== "infra";
      if (profile === "cityOnly") return building.category === "city";
      if (profile === "knowledgeOnly") return building.category === "knowledge";
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

function runSimulation(profile, policy, durationHours, activeMythId = null) {
  state = defaultState();
  gamePaused = false;
  collapseInProgress = false;
  buyAmount = 100;
  
  if (activeMythId) {
    activateMyth(activeMythId);
  }
  
  invalidateRenderCache("all");

  const durationSeconds = durationHours * 3600;
  const stepSeconds = 120;
  const tickSlice = 5;
  const startedAt = Date.now();

  const report = [];
  let currentBlockageStart = null;
  let totalBlockageSeconds = 0;
  let unlockedBuildings = new Set();
  let completedMyth = false;
  
  for (let t = 0; t < durationSeconds; t += stepSeconds) {
    const elapsedHours = t / 3600;
    
    buildings.forEach(b => {
      if (isUnlocked(b) && !unlockedBuildings.has(b.id)) {
        unlockedBuildings.add(b.id);
        report.push({
          time: elapsedHours,
          type: "unlock",
          message: \`Déblocage de \${b.name} (\${b.category})\`
        });
      }
    });

    const boughtAmount = simAutoBuyBuildings(profile);
    
    for (let slice = 0; slice < stepSeconds; slice += tickSlice) {
      fakeClock.now = startedAt + (t + slice) * 1000;
      tick(tickSlice);
      
      if (gamePaused || crisisOpen()) {
        const actionResult = resolveCrisis(policy);
        if (actionResult === "collapsed") {
          report.push({
            time: elapsedHours,
            type: "collapse",
            message: \`Effondrement de la cité (Cycle \${state.cycles}). Ruines gagnées: \${state.ruins.toFixed(0)}\`
          });
        }
      }
    }
    
    simAutoBuyRuins();
    
    const isStagnant = boughtAmount === 0 && rates(cityVitals(), pressureBreakdown()).population < 0.1;
    if (isStagnant) {
      if (currentBlockageStart === null) {
        currentBlockageStart = elapsedHours;
      }
    } else {
      if (currentBlockageStart !== null) {
        const duration = elapsedHours - currentBlockageStart;
        if (duration >= 0.25) { 
          totalBlockageSeconds += duration * 3600;
          report.push({
            time: currentBlockageStart,
            type: "blockage",
            duration: duration,
            message: \`Point de blocage détecté ! Le joueur stagne pendant \${(duration * 60).toFixed(0)} minutes par manque de ressources.\`
          });
        }
        currentBlockageStart = null;
      }
    }
    
    if (activeMythId && state.mythsCompleted[activeMythId] && !completedMyth) {
      completedMyth = true;
      report.push({
        time: elapsedHours,
        type: "myth_complete",
        message: \`FÉLICITATIONS : Pacte du mythe "\${activeMythId}" complété avec succès !\`
      });
    }
  }

  return {
    profile,
    policy,
    activeMythId,
    finalState: {
      cycles: state.cycles,
      population: state.population,
      gold: state.gold,
      knowledge: state.knowledge,
      infra: state.infrastructure,
      ruins: state.ruins,
      bestEra: eras[state.bestEraIndex].name,
      mythsCompleted: state.mythsCompleted
    },
    totalBlockageHours: totalBlockageSeconds / 3600,
    report
  };
}

console.log("=== SIMULATION 1 : Profil Débutant (Focus Moteurs uniquement, sans infra, effondrement 100%) ===");
const sim1 = runSimulation("cityOnly", "collapse100", 6);

console.log("\\n=== SIMULATION 2 : Profil Technocrate (Équilibré avec Infrastructures, effondrement 100%) ===");
const sim2 = runSimulation("all", "collapse100", 6);

console.log("\\n=== SIMULATION 3 : Profil Optimisé (Équilibré, gestion active des crises pour prolonger) ===");
const sim3 = runSimulation("all", "longGame", 6);

console.log("\\n=== SIMULATION 4 : Simulation du Mythe de Prométhée (Atteindre 500 hab sans dépasser 80% Rupture) ===");
const sim4 = runSimulation("all", "longGame", 6, "mythe_de_promethee");

results = { sim1, sim2, sim3, sim4 };
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
vm.runInContext(source, sandbox, { filename: "simulate-game-custom.vm.js" });

const results = sandbox.results;

// Sauvegarde des résultats
fs.writeFileSync(path.join(__dirname, "sim_results.json"), JSON.stringify(results, null, 2));

// Génération du rapport formatté
console.log("\n=======================================================");
console.log("=== RAPPORT CHRONOLOGIQUE DES SIMULATIONS (6 heures) ===");
console.log("=======================================================");

function formatHour(h) {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${hours}h${minutes.toString().padStart(2, "0")}`;
}

const sims = [
  { data: results.sim1, title: "1. Profil Débutant (Focus Moteurs, Collapse 100%)" },
  { data: results.sim2, title: "2. Profil Technocrate (Équilibré, Collapse 100%)" },
  { data: results.sim3, title: "3. Profil Optimisé (Équilibré, Gestion de crise active)" },
  { data: results.sim4, title: "4. Défi Mythe : Le Mythe de Prométhée" }
];

sims.forEach((sim) => {
  console.log(`\n\n🔹 STRATÉGIE : ${sim.title}`);
  console.log(`-------------------------------------------------------`);
  console.log(`Résultats finaux : Cycles: ${sim.data.finalState.cycles} | Pop Max: ${Math.round(sim.data.finalState.population)} | Or: ${Math.round(sim.data.finalState.gold)} | Savoir: ${Math.round(sim.data.finalState.knowledge)} | Infra: ${Math.round(sim.data.finalState.infra)} | Ruines: ${Math.round(sim.data.finalState.ruins)} | Ère max: ${sim.data.finalState.bestEra}`);
  console.log(`Temps total bloqué (stagnation) : ${sim.data.totalBlockageHours.toFixed(2)} heures.`);
  console.log(`Chronologie des événements :`);
  
  if (sim.data.report.length === 0) {
    console.log("  (Aucun événement notable)");
  } else {
    const filteredReport = sim.data.report.filter((evt, idx, arr) => {
      if (evt.type === "blockage" || evt.type === "myth_complete") return true;
      if (evt.type === "unlock") {
        return ["granaries_city", "scribes", "aqueducts", "bureaucracy", "irrigated_fields", "universities"].some(id => evt.message.includes(id)) || idx < 5;
      }
      if (evt.type === "collapse") {
        return idx % 4 === 0 || idx === arr.length - 1;
      }
      return false;
    });

    filteredReport.slice(0, 15).forEach((evt) => {
      let icon = "⚪";
      if (evt.type === "unlock") icon = "🔓";
      if (evt.type === "collapse") icon = "💥";
      if (evt.type === "blockage") icon = "⏳";
      if (evt.type === "myth_complete") icon = "🎉";
      console.log(`  [${formatHour(evt.time)}] ${icon} ${evt.message}`);
    });
    
    if (filteredReport.length > 15) {
      console.log(`  ... et ${filteredReport.length - 15} autres événements.`);
    }
  }
});
