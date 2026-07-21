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
import { cloudMirrorSave } from './cloudSave.js';

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

import { IDLE_BASE_CAP_SECONDS, IDLE_CAP_PALIERS, OFFLINE_MAX_COLLAPSES, OFFLINE_UNCAPPED_COLLAPSES } from './balance.js';
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

import { runCollapseSequence, generateEpitaph, collapseCause } from './events.js';
import { resumeActiveRuinsChoiceIfPending } from './actions/myths.js';
import { dynastyNames } from '../data/buildings.js';
import { epitaphLegacyById, epitaphRuinMultiplier } from '../data/epitaphs.js';
import { BRAISIERS_DURATION_MS } from '../data/myths.js';
import { D } from './num.js';
import { decideTickCredit } from './offlineCredit.js';

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
    log("Copie automatique impossible, copie le texte manuellement.");
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
    // Import VOLONTAIRE : il fait autorité, même si la partie importée est moins
    // avancée — on pousse tout de suite le nuage, sinon l'arbitrage « la plus
    // avancée gagne » ressusciterait l'ancienne partie au prochain lancement.
    cloudMirrorSave({ force: true });
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

export function addDebugFaveur(amount) {
  state.faveur = (state.faveur || 0) + amount;
  log(`Debug: +${fmt(amount)} faveur ajoutee.`);
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
  // Les 3 paliers de crise sont pré-latchés ci-dessous pour éviter les dialogues
  // async hors-ligne. Ce latch ne doit PAS fuir dans le cycle en ligne qui suit
  // (cf. le `finally`), sinon le joueur revient sans aucune crise narrative.
  const savedThresholds = { ...state.crisisThresholds };
  const ruinsBefore = D(state.ruins);
  let virtual = realDateNow.call(Date) - elapsedSeconds * 1000;
  let collapses = 0;
  const markThresholds = () => { state.crisisThresholds = { _25: true, _50: true, _75: true }; };

  // Capstone « Phénix calendaire » : le plafond d'effondrements saute (il ne
  // reste qu'une borne de sécurité perf).
  const maxCollapses = has("phenix_calendaire") ? OFFLINE_UNCAPPED_COLLAPSES : OFFLINE_MAX_COLLAPSES;
  Date.now = () => virtual;
  setNotifyPaused(true);
  try {
    markThresholds(); // pas de crises narratives hors-ligne (flavor foreground)
    let remaining = elapsedSeconds;
    while (remaining > 0 && collapses < maxCollapses) {
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

      // Chaque effondrement hors-ligne grave le testament s'il existe, sinon
      // répète la dernière volonté (dernier legs choisi) — même règle que l'Édit
      // en ligne, même arithmétique de gain que le dialogue (rite d'effondrement
      // puis multiplicateur du legs, affinité recalculée sur la cause de CETTE chute).
      const cause = collapseCause();
      const legacy = epitaphLegacyById(state.testamentLegacyId) || epitaphLegacyById(state.nextEpitaphLegacy?.id);
      const riteBonus = has("rituel_effondrement") ? 1.25 : 1;
      const gainBase = ruinGain(true).floor().max(0).mul(riteBonus).round();
      const gain = gainBase.mul(epitaphRuinMultiplier(legacy, cause)).round();
      if (D(gain).gt(0)) {
        if (legacy) state.nextEpitaphLegacy = { id: legacy.id, cause, chosenCycle: state.cycles || 0, startedAt: Date.now() };
        completeCollapse(gain, dynastyNames[state.cycles % dynastyNames.length], generateEpitaph(), "auto_collapse");
        collapses += 1;
        markThresholds(); // completeCollapse a remis crisisThresholds à {}
      } else if (ac.trigger === "rupture100" && state.crisisLimitAnnounced) {
        break; // crise terminale mais gain nul (cité trop jeune) : on évite de boucler à vide
      }
    }
    // Temps restant après le plafond d'effondrements : crédit linéaire (pas de gâchis).
    if (remaining > 0) {
      const creditSpan = (seconds) => {
        if (seconds <= 0) return;
        const r = rates();
        state.population = D(state.population).add(D(r.population).mul(seconds));
        state.food = D(state.food).add(D(r.food).mul(seconds));
        state.gold = D(state.gold).add(D(r.gold).mul(seconds));
        state.knowledge = D(state.knowledge).add(D(r.knowledge).mul(seconds));
        state.infrastructure = D(state.infrastructure).add(D(r.infrastructure).mul(seconds));
      };
      // Les Braisiers de Prométhée ne valent que BRAISIERS_DURATION_MS après le
      // début du cycle (rates.js). Un crédit calculé à TAUX CONSTANT étalerait leur
      // ×2 Nourriture sur tout le reliquat — des heures au lieu de deux minutes. On
      // scinde donc à la sortie de la fenêtre, en avançant l'horloge virtuelle entre
      // les deux segments pour que rates() cesse de les voir.
      const braisiersLeftSec = state.prometheeBraisiers
        ? Math.max(0, (BRAISIERS_DURATION_MS - (virtual - (state.cycleStartedAt || virtual))) / 1000)
        : 0;
      const boosted = Math.min(remaining, braisiersLeftSec);
      creditSpan(boosted);
      virtual += boosted * 1000;
      creditSpan(remaining - boosted);
    }
  } finally {
    Date.now = realDateNow;
    setNotifyPaused(false);
    setGamePaused(false);
    state.history = savedHistory; // on jette le spam de Chronique hors-ligne
    // On rend ses crises au cycle EN LIGNE. Sans ça, markThresholds() survivait à
    // la simulation et applyOfflineProgress le persistait par save() : plus aucune
    // crise narrative jusqu'au prochain effondrement (donc plus de dialogues, plus
    // de Moisson de crise, et les compteurs d'Olympe gelés). Si des effondrements
    // ont eu lieu, le cycle courant est NEUF : il repart avec ses 3 paliers vierges,
    // exactement ce que laissait completeCollapse.
    state.crisisThresholds = collapses > 0 ? {} : savedThresholds;
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
  // Crise terminale déjà ouverte / effondrement en cours / dialogue bloquant
  // (gamePaused) : on ne touche à rien. Sans le garde gamePaused, un retour
  // d'onglet pendant une crise narrative (openCrisisEvent) faisait tourner la
  // sim, qui forçait setGamePaused(false) derrière la modale encore ouverte.
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return;
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
  // Crédité jusqu'à MAINTENANT : on recale l'ancre du hors-ligne. save() et le
  // tick ne posent plus lastTick ailleurs → sans ceci, le prochain calcul
  // (visibilitychange / boot) recréditerait ce même intervalle (double-comptage).
  state.lastTick = Date.now();
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
  setGamePaused(true); // comme collapse() : geler l'UI pendant le deuil (sinon on peut sceller un pacte, M10)
  state.crisisOpenedAt = null;
  // « L'Édit s'applique » est écrite par runCollapseSequence APRÈS le point de
  // non-retour (crisis.js:510 de l'audit) — plus de ligne persistée avant le deuil.
  runCollapseSequence(gain, "auto_collapse").catch((err) => console.error("Séquence d'effondrement (Édit) interrompue :", err));
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
  // Un choix de Ruines actives interrompu par un reload (F5 / onglet fermé pendant
  // la modale) est rouvert ici — sinon le cycle tournait sans Ruines actives et
  // sans recours, rendant Antée inaccomplissable (M15).
  resumeActiveRuinsChoiceIfPending().catch((err) => console.error("Reprise du choix des Ruines actives :", err));
  const trackInteraction = () => registerOlympusInteraction();
  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", trackInteraction, { passive: true });
    window.addEventListener("keydown", trackInteraction);
  }
  
  const isTabHidden = () => typeof document !== "undefined" && document.hidden;
  // lastWall = horloge murale du dernier crédit. N'AVANCE QUE quand on crédite :
  // un tick 'skip' (onglet caché) le laisse figé, si bien que le premier tick
  // visible — ou le visibilitychange — crédite TOUTE l'absence, une seule fois.
  let lastWall = Date.now();
  const tickInterval = setInterval(() => {
    const nowWall = Date.now();
    const decision = decideTickCredit((nowWall - lastWall) / 1000, isTabHidden());
    renderCache.tickNow = nowWall; // horloge lue par les composants (pas de Date.now() en rendu)
    if (decision.mode === "skip") return; // caché : lastWall reste figé, le retour créditera
    lastWall = nowWall;
    if (decision.mode === "offline") {
      // Veille système / gel d'onglet VISIBLE : aucun visibilitychange n'est émis,
      // et clamper à 1 s jetterait des heures. On route l'écart réel vers la
      // progression hors-ligne (elle recale state.lastTick elle-même).
      applyOfflineProgress(decision.seconds);
      checkAutoCollapse();
      notify();
      return;
    }
    // Temps de jeu actif cumulé (jalon de merveille) — survit aux effondrements
    // mais REPART À 0 au Grand Reset. lifetimePlaySec, lui, est l'horloge À VIE
    // (registre de la Chronique) : elle ne se réinitialise jamais et horodate les
    // déblocages de GR et les accomplissements de Mythes de façon continue.
    state.playTimeSec = (state.playTimeSec || 0) + decision.seconds;
    if (state.chronicleStats) {
      state.chronicleStats.lifetimePlaySec = (state.chronicleStats.lifetimePlaySec || 0) + decision.seconds;
    }
    state.lastTick = nowWall; // ancre du hors-ligne : temps réellement crédité jusqu'ici
    tick(decision.seconds);
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
      // Retour d'onglet : lastTick est resté figé au masquage (ticks cachés sautés
      // + save() ne le rafraîchit plus) → l'écart mesure vraiment toute l'absence.
      // applyOfflineProgress crédite ET recale lastTick ; on recale aussi lastWall
      // pour que le prochain tick reparte d'un écart nul (pas de re-crédit).
      const elapsed = (Date.now() - state.lastTick) / 1000;
      if (elapsed > 60) {
        applyOfflineProgress(elapsed);
        lastWall = Date.now();
      }
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Sauvegarder avant F5 / fermeture de l'onglet. On FORCE le miroir nuage juste
  // après save() : ce handler (posé dans l'effet App) tourne APRÈS le flush que
  // cloudSave.js pose à l'import, lequel lisait donc le localStorage AVANT cette
  // save() finale — le nuage ratait les dernières secondes (cloudSave.js:88 de
  // l'audit). En re-mirrorant ici, la dernière save gagne.
  const handleBeforeUnload = () => { save(); cloudMirrorSave({ force: true }); };
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
