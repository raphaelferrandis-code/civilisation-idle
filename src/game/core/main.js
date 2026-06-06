"use strict";

import {
  state,
  gamePaused,
  collapseInProgress,
  save,
  invalidateRenderCache,
  openView,
  render,
  setGamePaused,
  setCollapseInProgress,
  setState,
  notify,
  SAVE_KEY,
  defaultState,
  hydrateState,
  buildingById,
  upgradeById
} from './state.js';

import {
  has,
  crisisCosts,
  autoCollapseDelay,
  ruinGain,
  timeWearRate,
  crisisOpen,
  hasDoctrine,
  cityVitals,
  pressureBreakdown,
  rates,
  nomadInfrastructureCap,
  isUnlocked
} from './mechanics.js';

import {
  tick,
  log,
  chronicle,
  runCrisisAction,
  completeCollapse,
  resumeAfterCrisisOutcome,
  gather
} from './actions.js';

import { runCollapseSequence } from './events.js';

import {
  encodeSaveText,
  decodeSaveText,
  fmt,
  clamp,
  canPayCost,
  payCost,
  numberFormatMode,
  setNumberFormatMode,
  seededRng,
  pct
} from './utils.js';

import { upgrades } from '../data/upgrades.js';
import { dynastyNames, buildings } from '../data/buildings.js';
import { eras, DOCTRINES, CRISIS_EVENTS, CRISIS_POOL } from '../data/world.js';
import { clamp01 } from './utils.js';

export function exportSave() {
  const text = encodeSaveText(JSON.stringify(state));
  navigator.clipboard?.writeText(text);
  log("Sauvegarde exportee dans le presse-papiers.");
  render();
}

export function importSave(text) {
  try {
    const raw = decodeSaveText(text.trim());
    const parsed = JSON.parse(raw);
    setState(hydrateState(parsed));
    setGamePaused(false);
    setCollapseInProgress(false);
    invalidateRenderCache("all");
    save();
    log("Une civilisation importee reprend son cycle.");
    render();
    return true;
  } catch {
    log("Import impossible: le texte ne ressemble pas a une sauvegarde valide.");
    render();
    return false;
  }
}

export function addDebugRuins(amount) {
  state.ruins += amount;
  state.cycles = Math.max(state.cycles, 1);
  log(`Debug: +${fmt(amount)} ruines ajoutees.`);
  render();
}

export function addDebugCycles(amount) {
  state.cycles += amount;
  state.dynastyCount = Math.max(state.dynastyCount, Math.floor(state.cycles / 6));
  log(`Debug: ${fmt(amount)} cycles ajoutes.`);
  render();
}

export function addDebugResources() {
  state.population = Math.max(state.population, 1000000);
  state.food = Math.max(state.food, 10000000000);
  state.gold = Math.max(state.gold, 10000000000);
  state.knowledge = Math.max(state.knowledge, 1000000000);
  state.infrastructure = Math.max(state.infrastructure, 1000000);
  log("Debug: ressources late game injectees.");
  render();
}

export function debugBuyEarlyRuins() {
  const affordable = upgrades
    .filter((upgrade) => upgrade.group === "ruins" && upgrade.cost.ruins <= 10000)
    .sort((a, b) => a.cost.ruins - b.cost.ruins);

  for (const upgrade of affordable) {
    const costRuins = upgrade.cost.ruins || 0;
    if (has(upgrade.id) || state.ruins < costRuins || !isUnlocked(upgrade)) continue;
    state.ruins -= costRuins;
    state.upgrades[upgrade.id] = true;
  }
  log("Debug: achats de ruines de debut appliques quand possible.");
  render();
}

export function applyOfflineProgress() {
  const elapsed = Math.min(60 * 60 * 6, Math.max(0, (Date.now() - state.lastTick) / 1000));
  if (elapsed > 10) {
    const usefulSeconds = elapsed * 0.35;
    const wearBefore = state.timeWear || 0;
    state.timeWear = clamp(wearBefore + timeWearRate() * usefulSeconds, 0, 1);
    if (state.timeWear >= 1 && wearBefore < 1) {
      log(`En ton absence, l'usure du temps a atteint son terme. La cite attend ta decision dans l'onglet Crises.`);
    } else {
      log(`Pendant ton absence, l'usure du temps a progresse pendant ${fmt(Math.round(usefulSeconds))} secondes.`);
    }
    save();
  }
}

export function checkAutoCollapse() {
  if (!state.crisisLimitAnnounced || collapseInProgress) return;
  if (!has("intendant_de_crise")) return;
  if (!state.crisisOpenedAt) {
    state.crisisOpenedAt = Date.now();
    return;
  }

  const delay = autoCollapseDelay();

  if (Date.now() - state.crisisOpenedAt < delay) return;

  const hasTier3 = has("memoire_institutionnelle");
  const hasTier2 = hasTier3 || has("conseil_de_regence");

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
  setCollapseInProgress(true);
  state.crisisOpenedAt = null;
  const penaltyNote = mult < 1.0 ? ` (${Math.round(mult * 100)}% des ruines recuperees)` : "";
  chronicle(`Effondrement automatique: la cite s'est effondree sans decision active${penaltyNote}.`);
  runCollapseSequence(gain, "auto_collapse");
}

// ── Gestion de l'audio ────────────────────────────────────────────────────────

let bgAudio = null;
let optMusic = true;
let optMusicActiveTabOnly = true;
let optMusicVolume = 1;
let musicRetryArmed = false;

function retryMusicStart() {
  musicRetryArmed = false;
  document.removeEventListener("pointerdown", retryMusicStart, true);
  document.removeEventListener("keydown", retryMusicStart, true);
  playMusic();
}

function shouldPlayMusic() {
  return optMusic && (!optMusicActiveTabOnly || (typeof document !== 'undefined' && !document.hidden));
}

export function playMusic() {
  if (!bgAudio) return;
  if (!shouldPlayMusic()) return;
  bgAudio.play().catch(() => {
    if (musicRetryArmed) return;
    musicRetryArmed = true;
    document.addEventListener("pointerdown", retryMusicStart, true);
    document.addEventListener("keydown", retryMusicStart, true);
  });
}

export function pauseMusic() {
  if (bgAudio) bgAudio.pause();
}

let optNotif = true;

export function getNotifEnabled() {
  return optNotif;
}

export function setNotifEnabled(enabled) {
  optNotif = enabled;
  try {
    localStorage.setItem("civ-opt-notif", String(optNotif));
  } catch {}
  notify();
}

export function getMusicVolume() {
  return optMusicVolume;
}

export function getMusicEnabled() {
  return optMusic;
}

export function getMusicActiveTabOnly() {
  return optMusicActiveTabOnly;
}

export function setMusicVolume(vol) {
  optMusicVolume = clamp(vol, 0, 1);
  if (bgAudio) bgAudio.volume = optMusicVolume;
  try {
    localStorage.setItem("civ-opt-music-volume", String(optMusicVolume));
  } catch {}
  notify();
}

export function setMusicEnabled(enabled) {
  optMusic = enabled;
  try {
    localStorage.setItem("civ-opt-music", String(optMusic));
  } catch {}
  if (optMusic) playMusic();
  else {
    pauseMusic();
    if (bgAudio) bgAudio.currentTime = 0;
  }
  notify();
}

export function setMusicActiveTabOnly(enabled) {
  optMusicActiveTabOnly = enabled;
  try {
    localStorage.setItem("civ-opt-music-active-tab", String(optMusicActiveTabOnly));
  } catch {}
  syncMusicVisibility();
  notify();
}

function syncMusicVisibility() {
  if (shouldPlayMusic()) playMusic();
  else if (optMusic && optMusicActiveTabOnly && bgAudio) bgAudio.pause();
}

export function initAudio() {
  if (typeof Audio === 'undefined') return; // Support Headless
  if (bgAudio) return; // Évite les double-init
  
  try {
    const savedNotif = localStorage.getItem("civ-opt-notif");
    if (savedNotif !== null) optNotif = savedNotif !== "false";

    const savedMusic = localStorage.getItem("civ-opt-music");
    if (savedMusic !== null) optMusic = savedMusic !== "false";
    
    const savedActiveTab = localStorage.getItem("civ-opt-music-active-tab");
    if (savedActiveTab !== null) optMusicActiveTabOnly = savedActiveTab !== "false";
    
    const savedVol = localStorage.getItem("civ-opt-music-volume");
    if (savedVol !== null) optMusicVolume = clamp(Number(savedVol), 0, 1);
  } catch {}

  bgAudio = new Audio("/audio/ludum-dare-30-05.ogg");
  bgAudio.loop = true;
  bgAudio.preload = "auto";
  bgAudio.volume = optMusicVolume;

  bgAudio.addEventListener("ended", () => {
    if (!optMusic) return;
    bgAudio.currentTime = 0;
    playMusic();
  });

  document.addEventListener("visibilitychange", syncMusicVisibility);
  
  if (optMusic) {
    playMusic();
  }
}

// ── Démarrage de la boucle de jeu ─────────────────────────────────────────────

export function startGameLoop() {
  applyOfflineProgress();
  
  let last = performance.now();
  const tickInterval = setInterval(() => {
    const now = performance.now();
    const seconds = Math.min(0.25, (now - last) / 1000);
    last = now;
    tick(seconds);
    checkAutoCollapse();
    notify(); // Notifie React du changement d'état à chaque tick
  }, 250);

  const saveInterval = setInterval(() => {
    save();
  }, 10000);

  return () => {
    clearInterval(tickInterval);
    clearInterval(saveInterval);
  };
}
