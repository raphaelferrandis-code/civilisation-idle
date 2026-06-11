// Simulation headless du Mythe de l'Olympe.
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
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { addEventListener() {}, appendChild() {}, remove() {} }; },
  getElementById() { return null; }
};

const stateModule = await import("../src/game/core/state.js");
const {
  state,
  defaultState,
  setState,
  invalidateRenderCache
} = stateModule;

const {
  OLYMPUS_COMPLETION_SCORE,
  OLYMPUS_MIN_DOMINANT_SCORE,
  defaultOlympusState,
  dominantOlympusProfile,
  olympusMetrics
} = await import("../src/game/data/olympus.js");

const {
  registerOlympusCollapse,
  registerOlympusCrisisResolved,
  registerOlympusCrisisIgnored,
  tickOlympus,
  olympusAbyssProductionMultiplier,
  olympusRuinBonus
} = await import("../src/game/core/actions/olympus.js");

const BASE_NOW = Date.now();
Date.now = () => BASE_NOW + currentTimeSeconds * 1000;
let currentTimeSeconds = 0;

function resetOlympus() {
  setState(defaultState());
  state.olympus = defaultOlympusState(Date.now());
  state.cycleStartedAt = Date.now();
  state.ruins = 0;
  state.knowledge = 0;
  state.instability = 0;
  invalidateRenderCache("all");
}

function advance(seconds, { rupture = 0, idle = false } = {}) {
  const slice = 30;
  if (!idle) state.olympus.lastInteractionAt = Date.now();
  for (let elapsed = 0; elapsed < seconds; elapsed += slice) {
    const dt = Math.min(slice, seconds - elapsed);
    state.instability = rupture;
    if (!idle) state.olympus.lastInteractionAt = Date.now();
    tickOlympus(dt);
    currentTimeSeconds += dt;
  }
}

function runScenario(config) {
  resetOlympus();
  currentTimeSeconds = 0;

  const rows = [];
  let unlockedAt = null;

  for (let run = 1; run <= config.maxRuns; run += 1) {
    state.cycleStartedAt = Date.now();
    const rupture = config.rupture(run);

    for (let i = 0; i < config.resolvedCrises(run); i += 1) {
      registerOlympusCrisisResolved();
    }
    for (let i = 0; i < config.ignoredCrises(run); i += 1) {
      registerOlympusCrisisIgnored();
    }

    advance(config.activeSeconds(run), { rupture, idle: false });
    if (config.idleSeconds(run) > 0) {
      advance(config.idleSeconds(run), { rupture: config.idleRupture?.(run) ?? rupture, idle: true });
    }

    state.instability = rupture;
    registerOlympusCollapse(config.collapseReason(run));

    const dominant = dominantOlympusProfile(state.olympus);
    rows.push({
      run,
      dominant: dominant.profile.name,
      score: dominant.score,
      progress: Number((state.olympus.profileProgress[dominant.profile.id] || 0).toFixed(2)),
      unlocked: state.olympus.unlockedProfile || ""
    });

    if (state.olympus.unlockedProfile && !unlockedAt) {
      unlockedAt = run;
      if (config.stopOnUnlock !== false) break;
    }
  }

  const dominant = dominantOlympusProfile(state.olympus);
  const metrics = olympusMetrics(state.olympus);

  return {
    label: config.label,
    unlockedAt,
    unlockedProfile: state.olympus.unlockedProfile || "",
    dominant: dominant.profile.name,
    score: dominant.score,
    progress: Number((state.olympus.profileProgress[dominant.profile.id] || 0).toFixed(2)),
    collapseFrequency: Number(metrics.collapseFrequency.toFixed(2)),
    crisisResolutionRatio: Number(metrics.crisisResolutionRatio.toFixed(2)),
    idleRatio: Number(metrics.idleRatio.toFixed(2)),
    averageCollapseRupture: Number(metrics.averageCollapseRupture.toFixed(2)),
    highRuptureRatio: Number(metrics.highRuptureRatio.toFixed(2)),
    totalPlayedMinutes: Math.round(state.olympus.totalPlayedSeconds / 60),
    lastRows: rows.slice(-5)
  };
}

const scenarios = [
  {
    label: "Culte Apocalyptique - collapses manuels rapides a Rupture haute",
    maxRuns: 25,
    collapseReason: () => "manual",
    activeSeconds: () => 7 * 60,
    idleSeconds: () => 0,
    rupture: () => 0.9,
    resolvedCrises: () => 0,
    ignoredCrises: () => 1
  },
  {
    label: "Bureaucratie Sacree - runs actifs avec crises resolues",
    maxRuns: 25,
    collapseReason: () => "auto",
    activeSeconds: () => 18 * 60,
    idleSeconds: () => 0,
    rupture: () => 0.45,
    resolvedCrises: () => 4,
    ignoredCrises: () => 0
  },
  {
    label: "Religion du Sommeil - longues sessions idle, collapses rares",
    maxRuns: 25,
    collapseReason: () => "auto",
    activeSeconds: () => 4 * 60,
    idleSeconds: () => 34 * 60,
    rupture: () => 0.25,
    resolvedCrises: () => 0,
    ignoredCrises: () => 0
  },
  {
    label: "Secte de l'Abime - Rupture haute maintenue, crises ignorees",
    maxRuns: 25,
    collapseReason: () => "auto",
    activeSeconds: () => 24 * 60,
    idleSeconds: () => 0,
    rupture: () => 0.88,
    resolvedCrises: () => 0,
    ignoredCrises: () => 3
  },
  {
    label: "Style mixte - peu coherent",
    maxRuns: 40,
    collapseReason: (run) => run % 3 === 0 ? "manual" : "auto",
    activeSeconds: (run) => (run % 2 === 0 ? 20 : 12) * 60,
    idleSeconds: (run) => (run % 4 === 0 ? 15 : 0) * 60,
    rupture: (run) => [0.35, 0.75, 0.55, 0.9][run % 4],
    resolvedCrises: (run) => run % 2 === 0 ? 2 : 0,
    ignoredCrises: (run) => run % 2 === 0 ? 0 : 1,
    stopOnUnlock: false
  }
];

const results = scenarios.map(runScenario);
console.log(`Completion placeholder: ${OLYMPUS_COMPLETION_SCORE} points de progression sur un profil, score dominant minimum ${OLYMPUS_MIN_DOMINANT_SCORE}/100.`);
console.table(results.map((result) => ({
  Scenario: result.label,
  "Debloque run": result.unlockedAt || "-",
  "Profil debloque": result.unlockedProfile || "-",
  Dominant: result.dominant,
  Score: result.score,
  Progression: result.progress,
  "Collapses/h": result.collapseFrequency,
  "Crises resolues": result.crisisResolutionRatio,
  Idle: result.idleRatio,
  "Rupture collapse": result.averageCollapseRupture,
  "Rupture haute": result.highRuptureRatio,
  "Minutes jouees": result.totalPlayedMinutes
})));

for (const result of results) {
  console.log(`\n${result.label}`);
  console.table(result.lastRows);
}

resetOlympus();
state.olympus.unlockedProfile = "abyss";
state.instability = 0.9;
const abyssMult = olympusAbyssProductionMultiplier();

resetOlympus();
state.olympus.unlockedProfile = "apocalypse";
state.cycleStartedAt = Date.now() - 4 * 60_000;
const apocalypseGain = olympusRuinBonus(100, "manual");

console.log("\nVerification bonus heritage:");
console.table([
  { bonus: "Secte de l'Abime production a 90% Rupture", value: Number(abyssMult.toFixed(3)) },
  { bonus: "Culte Apocalyptique ruines sur gain 100, collapse 4 min", value: apocalypseGain }
]);
