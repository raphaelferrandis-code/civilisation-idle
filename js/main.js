"use strict";

/* ============================================================================
 * main.js - Orchestration / entree: import/export, debug, bind, applyOfflineProgress, checkAutoCollapse, init + setInterval.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

function exportSave() {
  const text = encodeSaveText(JSON.stringify(state));
  navigator.clipboard?.writeText(text);
  log("Sauvegarde exportee dans le presse-papiers.");
  render();
}

function importSave() {
  try {
    const raw = decodeSaveText(el("importText").value.trim());
    const parsed = JSON.parse(raw);
    state = hydrateState(parsed);
    gamePaused = false;
    collapseInProgress = false;
    invalidateRenderCache("all");
    save();
    log("Une civilisation importee reprend son cycle.");
    render();
  } catch {
    log("Import impossible: le texte ne ressemble pas a une sauvegarde valide.");
    render();
  }
}

function addDebugRuins(amount) {
  state.ruins += amount;
  state.cycles = Math.max(state.cycles, 1);
  log(`Debug: +${fmt(amount)} ruines ajoutees.`);
  render();
}

function addDebugCycles(amount) {
  state.cycles += amount;
  state.dynastyCount = Math.max(state.dynastyCount, Math.floor(state.cycles / 6));
  log(`Debug: ${fmt(amount)} cycles ajoutes.`);
  render();
}

function addDebugResources() {
  state.population = Math.max(state.population, 1000000);
  state.food = Math.max(state.food, 10000000000);
  state.gold = Math.max(state.gold, 10000000000);
  state.knowledge = Math.max(state.knowledge, 1000000000);
  state.infrastructure = Math.max(state.infrastructure, 1000000);
  log("Debug: ressources late game injectees.");
  render();
}

function debugBuyEarlyRuins() {
  const affordable = upgrades
    .filter((upgrade) => upgrade.group === "ruins" && upgrade.cost.ruins <= 10000)
    .sort((a, b) => a.cost.ruins - b.cost.ruins);

  for (const upgrade of affordable) {
    if (has(upgrade.id) || state.ruins < upgrade.cost.ruins || !isUnlocked(upgrade)) continue;
    payCost(upgrade.cost);
    state.upgrades[upgrade.id] = true;
  }
  log("Debug: achats de ruines de debut appliques quand possible.");
  render();
}

function openDebugDialog() {
  el("debugDialog").showModal();
}

function bind() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      openView(button.dataset.view);
    });
  });

  document.querySelectorAll("[data-buy-amount]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.buyAmount === "max") {
        buyAmount = "max";
      } else {
        buyAmount = clamp(Math.floor(Number(button.dataset.buyAmount) || 1), 1, 500);
      }
      invalidateRenderCache("buildings");
      document.querySelectorAll("[data-buy-amount]").forEach((mode) => mode.classList.toggle("active", mode === button));
      render();
    });
  });

  el("grandResetBtn")?.addEventListener("click", () => performGrandReset());

  document.querySelectorAll("[data-archive-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const viewId = button.dataset.archiveView;
      document.querySelectorAll("[data-archive-view]").forEach((tab) => tab.classList.toggle("active", tab === button));
      document.querySelectorAll(".archive-view").forEach((view) => view.classList.toggle("active", view.id === viewId));
    });
  });


  // Sous-onglets de construction (vue Cite) : Moteurs / Savoir / Infrastructures.
  document.querySelectorAll("[data-shop]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.shop;
      document.querySelectorAll("[data-shop]").forEach((tab) => tab.classList.toggle("active", tab === button));
      document.querySelectorAll(".shop-cat").forEach((cat) => cat.classList.toggle("active", cat.id === targetId));
    });
  });

  el("cityNameInput").addEventListener("input", (event) => {
    state.cityName = event.target.value.trim() || "NomVille";
    renderedVillagerMessage = "";
    renderVillagerMessage(rates(cityVitals(), pressureBreakdown()));
  });
  el("cityNameInput").addEventListener("change", () => {
    save();
  });

  el("instabilityResource").addEventListener("click", () => {
    if (state.instability >= 1) openView("prestige");
  });
  el("instabilityResource").addEventListener("keydown", (event) => {
    if (state.instability < 1 || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openView("prestige");
  });

  el("civilizationMap").addEventListener("click", gather);
  if (typeof initCityMap === "function") initCityMap();
  el("rationBtn").addEventListener("click", () => runCrisisAction("rationing"));
  el("festivalBtn").addEventListener("click", () => runCrisisAction("festivals"));
  el("censusBtn").addEventListener("click", () => runCrisisAction("census"));
  el("reformBtn").addEventListener("click", () => runCrisisAction("reforms"));
  el("archiveCrisisBtn").addEventListener("click", () => runCrisisAction("archiveCrisis"));
  el("ancestorCrisisBtn").addEventListener("click", () => runCrisisAction("ancestorCrisis"));
  el("exhumeBtn").addEventListener("click", exhumeVestige);
  el("collapseBtn").addEventListener("click", () => collapse("manual"));
  el("prepareArchivesBtn").addEventListener("click", () => runTerminalCrisisAction("prepareArchives"));
  el("exodusBtn").addEventListener("click", () => runTerminalCrisisAction("exodus"));
  el("holdOrderBtn").addEventListener("click", () => runTerminalCrisisAction("holdOrder"));
  el("dynastyBtn").addEventListener("click", foundDynasty);
  el("saveBtn").addEventListener("click", () => {
    save();
    log("Sauvegarde locale inscrite.");
    render();
  });
  el("exportBtn").addEventListener("click", exportSave);
  el("importBtn").addEventListener("click", () => el("importDialog").showModal());
  el("confirmImport").addEventListener("click", importSave);
  el("debugRuins1K").addEventListener("click", () => addDebugRuins(1000));
  el("debugRuins1M").addEventListener("click", () => addDebugRuins(1000000));
  el("debugRuins1B").addEventListener("click", () => addDebugRuins(1000000000));
  el("debugCrisis").addEventListener("click", () => {
    state.instability = 1;
    log("Debug: rupture forcee a 100%.");
    render();
    openView("prestige");
  });
  el("debugCycles").addEventListener("click", () => addDebugCycles(10));
  el("debugResources").addEventListener("click", addDebugResources);
  el("debugUnlockRuins").addEventListener("click", () => {
    state.cycles = Math.max(state.cycles, 1);
    state.ruins = Math.max(state.ruins, 1);
    log("Debug: onglet ruines debloque.");
    render();
    openView("ruinsView");
  });
  el("debugBuyEarlyRuins").addEventListener("click", debugBuyEarlyRuins);
  // --- Options ---
  const OPTS_NOTIF_KEY = "civ-opt-notif";
  const OPTS_MUSIC_KEY = "civ-opt-music";
  const OPTS_MUSIC_VOLUME_KEY = "civ-opt-music-volume";
  const OPTS_MUSIC_ACTIVE_TAB_KEY = "civ-opt-music-active-tab";
  let optNotif = localStorage.getItem(OPTS_NOTIF_KEY) !== "false";
  let optMusic = localStorage.getItem(OPTS_MUSIC_KEY) !== "false";
  let optMusicActiveTabOnly = localStorage.getItem(OPTS_MUSIC_ACTIVE_TAB_KEY) !== "false";
  let optMusicVolume = Number(localStorage.getItem(OPTS_MUSIC_VOLUME_KEY));
  if (!Number.isFinite(optMusicVolume)) optMusicVolume = 1;
  optMusicVolume = clamp(optMusicVolume, 0, 1);

  const bgAudio = new Audio("Ludum Dare 30 05.ogg");
  bgAudio.loop = true;
  bgAudio.preload = "auto";
  bgAudio.volume = optMusicVolume;
  let musicRetryArmed = false;

  function retryMusicStart() {
    musicRetryArmed = false;
    document.removeEventListener("pointerdown", retryMusicStart, true);
    document.removeEventListener("keydown", retryMusicStart, true);
    playMusic();
  }

  function shouldPlayMusic() {
    return optMusic && (!optMusicActiveTabOnly || !document.hidden);
  }

  function playMusic() {
    if (!shouldPlayMusic()) return;
    bgAudio.play().catch(() => {
      if (musicRetryArmed) return;
      musicRetryArmed = true;
      document.addEventListener("pointerdown", retryMusicStart, true);
      document.addEventListener("keydown", retryMusicStart, true);
    });
  }

  bgAudio.addEventListener("ended", () => {
    if (!optMusic) return;
    bgAudio.currentTime = 0;
    playMusic();
  });

  function applyNotif() {
    el("villagerFeed").classList.toggle("hidden-by-options", !optNotif);
    const btn = el("notifToggleBtn");
    btn.classList.toggle("on", optNotif);
    btn.textContent = optNotif ? "Activé" : "Désactivé";
    localStorage.setItem(OPTS_NOTIF_KEY, String(optNotif));
  }

  function applyNumberFormat() {
    document.querySelectorAll("[data-number-format]").forEach((button) => {
      button.classList.toggle("active", button.dataset.numberFormat === numberFormatMode);
    });
  }

  function applyMusic() {
    const btn = el("musicToggleBtn");
    btn.classList.toggle("on", optMusic);
    btn.textContent = optMusic ? "Activé" : "Désactivé";
    localStorage.setItem(OPTS_MUSIC_KEY, String(optMusic));
    if (optMusic) playMusic();
    else { bgAudio.pause(); bgAudio.currentTime = 0; }
  }

  function applyMusicVolume() {
    const percent = Math.round(optMusicVolume * 100);
    bgAudio.volume = optMusicVolume;
    el("musicVolumeSlider").value = String(percent);
    el("musicVolumeValue").textContent = `${percent}%`;
    localStorage.setItem(OPTS_MUSIC_VOLUME_KEY, String(optMusicVolume));
  }

  function syncMusicVisibility() {
    if (shouldPlayMusic()) playMusic();
    else if (optMusic && optMusicActiveTabOnly && document.hidden) bgAudio.pause();
  }

  function applyMusicActiveTabOnly() {
    const btn = el("musicActiveTabToggleBtn");
    btn.classList.toggle("on", optMusicActiveTabOnly);
    btn.textContent = optMusicActiveTabOnly ? "Actif" : "Inactif";
    localStorage.setItem(OPTS_MUSIC_ACTIVE_TAB_KEY, String(optMusicActiveTabOnly));
    syncMusicVisibility();
  }

  function openOptionsGroup(group) {
    document.querySelectorAll("[data-options-group]").forEach((button) => {
      button.classList.toggle("active", button.dataset.optionsGroup === group);
    });
    document.querySelectorAll("[data-options-group-panel]").forEach((row) => {
      row.classList.toggle("hidden", row.dataset.optionsGroupPanel !== group);
    });
  }

  applyNotif();
  applyNumberFormat();
  applyMusicVolume();
  applyMusicActiveTabOnly();
  applyMusic();
  openOptionsGroup("display");

  el("optionsBtn").addEventListener("click", () => {
    openOptionsGroup("display");
    el("optionsDialog").showModal();
  });
  el("optionsDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelectorAll("[data-options-group]").forEach((button) => {
    button.addEventListener("click", () => openOptionsGroup(button.dataset.optionsGroup));
  });
  document.querySelectorAll("[data-number-format]").forEach((button) => {
    button.addEventListener("click", () => {
      setNumberFormatMode(button.dataset.numberFormat);
      applyNumberFormat();
      invalidateRenderCache("all");
      render();
    });
  });
  el("notifToggleBtn").addEventListener("click", () => { optNotif = !optNotif; applyNotif(); });
  el("musicToggleBtn").addEventListener("click", () => { optMusic = !optMusic; applyMusic(); });
  el("musicActiveTabToggleBtn").addEventListener("click", () => {
    optMusicActiveTabOnly = !optMusicActiveTabOnly;
    applyMusicActiveTabOnly();
  });
  el("musicVolumeSlider").addEventListener("input", (event) => {
    optMusicVolume = clamp(Number(event.target.value) / 100, 0, 1);
    applyMusicVolume();
    if (optMusic) playMusic();
  });
  document.addEventListener("visibilitychange", syncMusicVisibility);
  el("optionsWipeBtn").addEventListener("click", () => {
    if (!confirm("Recommencer depuis le tout premier feu ?")) return;
    el("optionsDialog").close();
    localStorage.removeItem(SAVE_KEY);
    state = defaultState();
    render();
  });

  let debugSequence = "";
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    debugSequence = `${debugSequence}${event.key.toLowerCase()}`.slice(-5);
    if (debugSequence === "debug") {
      debugSequence = "";
      openDebugDialog();
    }
  });
}

function applyOfflineProgress() {
  const elapsed = Math.min(60 * 60 * 6, Math.max(0, (Date.now() - state.lastTick) / 1000));
  if (elapsed > 10) {
    const usefulSeconds = elapsed * 0.35;
    const wearBefore = state.timeWear || 0;
    state.timeWear = clamp01(wearBefore + timeWearRate() * usefulSeconds);
    if (state.timeWear >= 1 && wearBefore < 1) {
      log(`En ton absence, l'usure du temps a atteint son terme. La cite attend ta decision dans l'onglet Crises.`);
    } else {
      log(`Pendant ton absence, l'usure du temps a progresse pendant ${fmt(Math.round(usefulSeconds))} secondes.`);
    }
    save();
  }
}

bind();
applyOfflineProgress();
openView(document.querySelector(".tab.active")?.dataset.view || "city");
render();
if (crisisOpen()) triggerCollapseChoices();

function checkAutoCollapse() {
  if (!state.crisisLimitAnnounced || collapseInProgress) return;
  if (!has("intendant_de_crise")) return;
  if (!state.crisisOpenedAt) {
    state.crisisOpenedAt = Date.now();
    return;
  }

  const delay = autoCollapseDelay();

  if (Date.now() - state.crisisOpenedAt < delay) return;

  const costs = crisisCosts();
  if (hasTier2 && canPayCost(costs.rationing)) {
    runCrisisAction("rationing", { render: false });
    state.crisisOpenedAt = Date.now();
    if (!crisisOpen()) resumeAfterCrisisOutcome();
    return;
  }
  if (hasTier3 && canPayCost(costs.reforms)) {
    runCrisisAction("reforms", { render: false });
    state.crisisOpenedAt = Date.now();
    if (!crisisOpen()) resumeAfterCrisisOutcome();
    return;
  }

  const mult = hasTier3 ? 1.0 : hasTier2 ? 0.80 : 0.55;
  const gain = Math.max(0, Math.floor(ruinGain() * mult));
  collapseInProgress = true;
  state.crisisOpenedAt = null;
  const penaltyNote = mult < 1.0 ? ` (${Math.round(mult * 100)}% des ruines recuperees)` : "";
  chronicle(`Effondrement automatique: la cite s'est effondree sans decision active${penaltyNote}.`);
  runCollapseSequence(gain, "auto_collapse");
}

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const seconds = Math.min(0.25, (now - last) / 1000);
  last = now;
  tick(seconds);
  // Invalide le cache frame après tick() (l'état a changé) et avant render().
  // render() appelle cityVitals(), pressureBreakdown() et globalMultiplier() plusieurs fois —
  // le cache garantit qu'elles ne sont calculées qu'une fois par render().
  _frameVitals = null;
  _framePressure = null;
  _frameGlobalMult = null;
  checkAutoCollapse();
  render();
}, 250);

setInterval(save, 10000);
