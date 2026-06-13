"use strict";

import {
  state,
  renderCache,
  collapseInProgress,
  save,
  invalidateRenderCache,
  render,
  setGamePaused,
  setCollapseInProgress,
  setState,
  notify,
  hydrateState
} from './state.js';

import {
  has,
  crisisCosts,
  autoCollapseDelay,
  ruinGain,
  timeWearRate,
  crisisOpen,
  isUnlocked,
  addProductionPenalty,
  amplifyRuptureFactor
} from './mechanics.js';

import {
  tick,
  log,
  chronicle,
  runCrisisAction,
  registerOlympusInteraction,
  resumeAfterCrisisOutcome
} from './actions.js';

import { runCollapseSequence } from './events.js';
import { D } from './num.js';

import {
  encodeSaveText,
  decodeSaveText,
  fmt,
  clamp,
  clamp01,
  canPayCost
} from './utils.js';

import { upgrades } from '../data/upgrades.js';

import { registerWorldEffects } from '../data/worldEffects.js';

// Injection des implémentations de core/ dans le pont d'effets de world.js
// (casse le cycle d'imports world.js ↔ core/).
registerWorldEffects({ addProductionPenalty, chronicle, amplifyRuptureFactor, clamp01, state });

export async function exportSave() {
  const text = encodeSaveText(JSON.stringify(state));
  try {
    if (!navigator.clipboard) throw new Error("clipboard indisponible");
    await navigator.clipboard.writeText(text);
    log("Sauvegarde exportee dans le presse-papiers.");
    render();
    return { ok: true, text };
  } catch {
    log("Copie automatique impossible — copie le texte manuellement.");
    render();
    return { ok: false, text };
  }
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
  state.ruins = D(state.ruins).add(amount);
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
  state.population = D(state.population).max(1000000);
  state.food = D(state.food).max(10000000000);
  state.gold = D(state.gold).max(10000000000);
  state.knowledge = D(state.knowledge).max(1000000000);
  state.infrastructure = D(state.infrastructure).max(1000000);
  log("Debug: ressources late game injectees.");
  render();
}

export function debugBuyEarlyRuins() {
  const affordable = upgrades
    .filter((upgrade) => upgrade.group === "ruins" && upgrade.cost.ruins <= 10000)
    .sort((a, b) => a.cost.ruins - b.cost.ruins);

  for (const upgrade of affordable) {
    const costRuins = upgrade.cost.ruins || 0;
    if (has(upgrade.id) || D(state.ruins).lt(costRuins) || !isUnlocked(upgrade)) continue;
    state.ruins = D(state.ruins).sub(costRuins);
    state.upgrades[upgrade.id] = true;
  }
  log("Debug: achats de ruines de debut appliques quand possible.");
  render();
}

export function applyElapsedWear(elapsedSeconds) {
  const elapsed = Math.min(60 * 60 * 6, Math.max(0, elapsedSeconds));
  if (elapsed <= 10) return;
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

export function applyOfflineProgress() {
  applyElapsedWear((Date.now() - state.lastTick) / 1000);
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

  // Une action de crise baisse l'instabilité mais PAS l'usure : si la crise
  // terminale vient de l'usure (timeWear >= 1), l'auto-résolution ne peut rien
  // faire et reboucle. On ne tente rationing/reforms que si elle peut résoudre.
  const canAutoResolve = state.instability >= 1 && (state.timeWear || 0) < 1;
  const costs = crisisCosts();
  if (canAutoResolve && hasTier2 && canPayCost(costs.rationing)) {
    runCrisisAction("rationing", { render: false, force: true });
    state.crisisOpenedAt = Date.now();
    if (!crisisOpen()) resumeAfterCrisisOutcome();
    return;
  }
  if (canAutoResolve && hasTier3 && canPayCost(costs.reforms)) {
    runCrisisAction("reforms", { render: false, force: true });
    state.crisisOpenedAt = Date.now();
    if (!crisisOpen()) resumeAfterCrisisOutcome();
    return;
  }

  const mult = hasTier3 ? 1.0 : hasTier2 ? 0.80 : 0.55;
  const gain = ruinGain().mul(mult).floor().max(0);
  setCollapseInProgress(true);
  state.crisisOpenedAt = null;
  const penaltyNote = mult < 1.0 ? ` (seulement ${Math.round(mult * 100)}% de notre héritage a pu être préservé)` : "";
  chronicle(`L'absence de décision de nos chefs nous a menés à la ruine : la cité s'est effondrée d'elle-même sous le poids de son inaction${penaltyNote}.`);
  runCollapseSequence(gain, "auto_collapse");
}

// ──────────────── Gestion de l'audio ─────────────────────────────────────────

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
  state.notifEnabled = enabled;
  try {
    localStorage.setItem("civ-opt-notif", String(optNotif));
  } catch { /* Option persistence may be unavailable. */ }
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
  } catch { /* Option persistence may be unavailable. */ }
}

export function setMusicEnabled(enabled) {
  optMusic = enabled;
  try {
    localStorage.setItem("civ-opt-music", String(optMusic));
  } catch { /* Option persistence may be unavailable. */ }
  if (optMusic) playMusic();
  else {
    pauseMusic();
    if (bgAudio) bgAudio.currentTime = 0;
  }
}

export function setMusicActiveTabOnly(enabled) {
  optMusicActiveTabOnly = enabled;
  try {
    localStorage.setItem("civ-opt-music-active-tab", String(optMusicActiveTabOnly));
  } catch { /* Option persistence may be unavailable. */ }
  syncMusicVisibility();
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
    if (savedNotif !== null) {
      optNotif = savedNotif !== "false";
      state.notifEnabled = optNotif;
    }

    const savedMusic = localStorage.getItem("civ-opt-music");
    if (savedMusic !== null) optMusic = savedMusic !== "false";
    
    const savedActiveTab = localStorage.getItem("civ-opt-music-active-tab");
    if (savedActiveTab !== null) optMusicActiveTabOnly = savedActiveTab !== "false";
    
    const savedVol = localStorage.getItem("civ-opt-music-volume");
    if (savedVol !== null) optMusicVolume = clamp(Number(savedVol), 0, 1);
  } catch { /* Option persistence may be unavailable. */ }

  // Chemin relatif au document : indispensable pour l'exe Electron (file://),
  // où un chemin absolu "/audio/…" pointe hors du dossier dist.
  bgAudio = new Audio(`${import.meta.env.BASE_URL}audio/ludum-dare-30-05.ogg`);
  bgAudio.loop = true;
  bgAudio.preload = "auto";
  bgAudio.volume = optMusicVolume;

  document.addEventListener("visibilitychange", syncMusicVisibility);
  
  if (optMusic) {
    playMusic();
  }
}

// ──────────────── Démarrage de la boucle de jeu ─────────────────────────────

export function startGameLoop() {
  applyOfflineProgress();
  const trackInteraction = () => registerOlympusInteraction();
  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", trackInteraction, { passive: true });
    window.addEventListener("keydown", trackInteraction);
  }
  
  let last = performance.now();
  const tickInterval = setInterval(() => {
    const now = performance.now();
    const seconds = Math.min(1.0, (now - last) / 1000);
    last = now;
    // Temps de jeu actif cumulé (jalon de merveille) — survit aux effondrements.
    state.playTimeSec = (state.playTimeSec || 0) + seconds;
    renderCache.tickNow = Date.now(); // horloge lue par les composants (pas de Date.now() en rendu)
    tick(seconds);
    checkAutoCollapse();
    notify(); // Notifie React du changement d'etat a chaque tick
  }, 1000);

  // Auto-save toutes les 10 secondes
  const saveInterval = setInterval(() => {
    save();
  }, 10000);

  // Sauvegarde rapide 2s après le lancement pour capturer la progression initiale
  const earlySaveTimeout = setTimeout(() => {
    save();
  }, 2000);

  // Sauvegarder quand l'onglet perd le focus (switch d'onglet, etc.) et
  // rattraper l'usure du temps écoulé quand l'onglet redevient visible (le tick
  // est throttlé par le navigateur en arrière-plan, d'où la perte de temps).
  const handleVisibilityChange = () => {
    if (document.hidden) {
      save();
    } else if (!collapseInProgress && !state.crisisLimitAnnounced) {
      const elapsed = (Date.now() - state.lastTick) / 1000;
      if (elapsed > 60) {
        applyElapsedWear(elapsed);
        last = performance.now();
      }
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Sauvegarder avant F5 / fermeture de l'onglet
  const handleBeforeUnload = () => save();
  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", trackInteraction);
      window.removeEventListener("keydown", trackInteraction);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }
    clearInterval(tickInterval);
    clearInterval(saveInterval);
    clearTimeout(earlySaveTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
