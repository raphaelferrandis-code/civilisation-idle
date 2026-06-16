"use strict";

import {
  state,
  renderCache,
  collapseInProgress,
  gamePaused,
  save,
  invalidateRenderCache,
  render,
  setGamePaused,
  setCollapseInProgress,
  setNotifyPaused,
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
  rates,
  crisisOpen,
  currentEraIndex,
  isUnlocked,
  addProductionPenalty,
  amplifyRuptureFactor
} from './mechanics.js';

import { IDLE_BASE_CAP_SECONDS, IDLE_CAP_PALIERS, OFFLINE_MAX_COLLAPSES } from './balance.js';
import { idleResumeNarrative } from '../data/idleNarrative.js';

import {
  tick,
  log,
  chronicle,
  runCrisisAction,
  completeCollapse,
  registerOlympusInteraction,
  resumeAfterCrisisOutcome
} from './actions.js';

import { runCollapseSequence, generateEpitaph } from './events.js';
import { dynastyNames } from '../data/buildings.js';
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

// Cap d'absence créditée (production + Usure), en secondes : 2 h gratuites pour
// tous + paliers « Veilleurs de nuit » possédés (cf. CE-spec-idle-crises.md §B.3).
export function idleCapSeconds() {
  let cap = IDLE_BASE_CAP_SECONDS;
  for (const [id, seconds] of Object.entries(IDLE_CAP_PALIERS)) if (has(id)) cap += seconds;
  return cap;
}

// Pas (s. virtuelles) de la simulation hors-ligne. Petit → l'auto-achat (1 bâtiment
// par tick) rebâtit correctement ; borné par OFFLINE_MAX_COLLAPSES + le cap d'idle.
const OFFLINE_STEP_SECONDS = 10;

// Farm hors-ligne (cf. CE-spec §B.5, v2) : rejoue la VRAIE boucle tick() par pas
// grossiers sur le temps d'absence → l'auto-achat (Héphaïstos) rebâtit, l'Usure et
// la Rupture montent, et l'Édit d'effondrement effondre au déclencheur choisi, en
// banquant les ruines. Plafonné à OFFLINE_MAX_COLLAPSES.
// Éligibilité : auto-achat (hephHeritage) + auto-effondrement activé — sinon la
// cité ne se rebâtit pas seule et on retombe sur le crédit linéaire (return null).
// Effets de bord neutralisés : notifications React suspendues, crises narratives
// 25/50/75 supprimées (évite les dialogues async), spam de Chronique jeté.
function simulateAwayCrises(elapsedSeconds) {
  const ac = state.crisisDoctrine && state.crisisDoctrine.autoCollapse;
  if (!state.hephHeritage || !has("edit_effondrement") || !ac || !ac.enabled) return null;

  const realDateNow = Date.now;
  const savedHistory = state.history;
  const ruinsBefore = D(state.ruins);
  let virtual = realDateNow.call(Date) - elapsedSeconds * 1000;
  let collapses = 0;
  const markThresholds = () => { state.crisisThresholds = { _25: true, _50: true, _75: true }; };

  Date.now = () => virtual;
  setNotifyPaused(true);
  try {
    markThresholds(); // pas de crises narratives hors-ligne (flavor foreground)
    let remaining = elapsedSeconds;
    while (remaining > 0 && collapses < OFFLINE_MAX_COLLAPSES) {
      const step = Math.min(OFFLINE_STEP_SECONDS, remaining);
      remaining -= step;
      virtual += step * 1000;
      tick(step); // prod + Usure + dérive Rupture + auto-achat + maj des pics
      if (gamePaused) { setGamePaused(false); break; } // sécurité : aucun dialogue ne doit s'ouvrir

      const cycleAge = (virtual - (state.cycleStartedAt || virtual)) / 1000;
      const fire = ac.trigger === "usure" ? (state.timeWear || 0) >= (ac.usureThreshold ?? 0.9)
        : ac.trigger === "temps" ? cycleAge >= (ac.timeSeconds ?? 600)
        : state.crisisLimitAnnounced; // rupture100 : tick() a posé le drapeau terminal
      if (!fire) continue;

      const gain = ruinGain(true).floor().max(0);
      if (D(gain).gt(0)) {
        completeCollapse(gain, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), "auto_collapse");
        collapses += 1;
        markThresholds(); // completeCollapse a remis crisisThresholds à {}
      } else if (ac.trigger === "rupture100" && state.crisisLimitAnnounced) {
        break; // crise terminale mais gain nul (cité trop jeune) : on évite de boucler à vide
      }
    }
    // Temps restant après le plafond d'effondrements : crédit linéaire (pas de gâchis).
    if (remaining > 0) {
      const r = rates();
      state.population = D(state.population).add(D(r.population).mul(remaining));
      state.food = D(state.food).add(D(r.food).mul(remaining));
      state.gold = D(state.gold).add(D(r.gold).mul(remaining));
      state.knowledge = D(state.knowledge).add(D(r.knowledge).mul(remaining));
      state.infrastructure = D(state.infrastructure).add(D(r.infrastructure).mul(remaining));
    }
  } finally {
    Date.now = realDateNow;
    setNotifyPaused(false);
    setGamePaused(false);
    state.history = savedHistory; // on jette le spam de Chronique hors-ligne
    invalidateRenderCache("all");
  }
  return { collapses, ruinsGained: D(state.ruins).sub(ruinsBefore).max(0) };
}

// Progression hors-ligne (cf. §B). Deux régimes :
//  - FARM (Héphaïstos + Édit d'effondrement actif) : la vraie boucle est rejouée,
//    la cité s'effondre et se relève en banquant des ruines (simulateAwayCrises).
//  - LINÉAIRE (sinon) : la cité PRODUIT et vieillit au taux courant, bornés par le
//    MÊME cap (idleCapSeconds) — au-delà, tout gèle. Rupture gelée.
// Remplace l'ancien hors-ligne « Usure seule ×0.35 », qui ne produisait rien.
export function applyOfflineProgress(elapsedSeconds = (Date.now() - state.lastTick) / 1000) {
  // Crise terminale déjà ouverte / effondrement en cours : on ne touche à rien.
  if (collapseInProgress || state.crisisLimitAnnounced) return;
  const elapsed = Math.min(idleCapSeconds(), Math.max(0, elapsedSeconds));
  if (elapsed <= 10) return;

  const wearBefore = state.timeWear || 0;
  const farm = simulateAwayCrises(elapsed); // null si non éligible → chemin linéaire

  if (!farm) {
    // Production au taux courant (bâtiments constants hors-ligne → rates() stable).
    invalidateRenderCache("all");
    const r = rates();
    state.population = D(state.population).add(D(r.population).mul(elapsed));
    state.food = D(state.food).add(D(r.food).mul(elapsed));
    state.gold = D(state.gold).add(D(r.gold).mul(elapsed));
    state.knowledge = D(state.knowledge).add(D(r.knowledge).mul(elapsed));
    state.infrastructure = D(state.infrastructure).add(D(r.infrastructure).mul(elapsed));
    invalidateRenderCache("all");
    // Usure, MÊME elapsed que la prod (couplage : on ne vieillit jamais plus que ce
    // qu'on a produit). Plus de facteur ×0.35.
    state.timeWear = clamp(wearBefore + timeWearRate() * elapsed, 0, 1);
  }

  // Habillage narratif de la reprise (dépêche datée dans la Chronique) — cosmétique.
  chronicle(idleResumeNarrative({
    elapsedSeconds,
    eraIndex: currentEraIndex(),
    instability: state.instability || 0,
    terminalUsure: state.timeWear >= 1 && wearBefore < 1,
    collapses: farm ? farm.collapses : 0,
    ruinsGained: farm && farm.collapses > 0 ? fmt(farm.ruinsGained) : null
  }));
  save();
}

// Effondrement automatique configurable (Édit d'effondrement / Doctrine de crise,
// cf. CE-spec-idle-crises.md §A.4). Trigger au choix : "rupture100" (crise
// terminale + grâce), "usure" (seuil d'Usure), "temps" (durée de cycle). Les deux
// derniers peuvent effondrer une cité NON terminale — d'où ruinGain(projected).
export function checkAutoCollapse() {
  if (collapseInProgress || gamePaused) return;
  const ac = state.crisisDoctrine?.autoCollapse;
  if (!ac || !ac.enabled || !has("edit_effondrement")) return;

  let shouldCollapse = false;
  let projected = false; // gain "comme si on s'effondrait maintenant" hors crise terminale
  if (ac.trigger === "rupture100") {
    // Comportement historique : on attend la crise terminale, puis un délai de grâce.
    if (!state.crisisLimitAnnounced) { state.crisisOpenedAt = state.crisisOpenedAt || null; return; }
    if (!state.crisisOpenedAt) { state.crisisOpenedAt = Date.now(); return; }
    if (Date.now() - state.crisisOpenedAt < autoCollapseDelay()) return;
    shouldCollapse = true;
  } else if (ac.trigger === "usure") {
    if ((state.timeWear || 0) >= (ac.usureThreshold ?? 0.9)) { shouldCollapse = true; projected = !crisisOpen(); }
  } else if (ac.trigger === "temps") {
    const elapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 1000;
    if (elapsed >= (ac.timeSeconds ?? 600)) { shouldCollapse = true; projected = !crisisOpen(); }
  }
  if (!shouldCollapse) return;

  // Option "prepare" : si la crise terminale est ouverte ET résoluble (Rupture, pas
  // Usure), on tente Rationner puis Réformes avant d'effondrer. Une action baisse
  // l'instabilité mais PAS l'usure → on ne tente que si ça peut réellement résoudre.
  if (ac.prepare && state.crisisLimitAnnounced) {
    const canAutoResolve = state.instability >= 1 && (state.timeWear || 0) < 1;
    const costs = crisisCosts();
    if (canAutoResolve && canPayCost(costs.rationing)) {
      runCrisisAction("rationing", { render: false, force: true });
      state.crisisOpenedAt = Date.now();
      if (!crisisOpen()) resumeAfterCrisisOutcome();
      return;
    }
    if (canAutoResolve && canPayCost(costs.reforms)) {
      runCrisisAction("reforms", { render: false, force: true });
      state.crisisOpenedAt = Date.now();
      if (!crisisOpen()) resumeAfterCrisisOutcome();
      return;
    }
  }

  const gain = ruinGain(projected).floor().max(0);
  if (D(gain).lte(0)) return; // cité trop jeune/petite : rien à récolter, on n'effondre pas à vide
  setCollapseInProgress(true);
  state.crisisOpenedAt = null;
  chronicle("L'Édit d'effondrement s'applique : la cité tombe au moment choisi, son héritage préservé.");
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

  // Sauvegarder quand l'onglet perd le focus (switch d'onglet, etc.) et créditer
  // la progression hors-ligne (prod + Usure, capées) quand il redevient visible
  // (le tick est throttlé par le navigateur en arrière-plan, d'où la perte de temps).
  const handleVisibilityChange = () => {
    if (document.hidden) {
      save();
    } else if (!collapseInProgress && !state.crisisLimitAnnounced) {
      const elapsed = (Date.now() - state.lastTick) / 1000;
      if (elapsed > 60) {
        applyOfflineProgress(elapsed);
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
