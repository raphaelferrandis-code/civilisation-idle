"use strict";

import { state } from "../state.js";
import { chronicle, log } from "./utils.js";
import { fmt } from "../utils.js";
import { D } from "../num.js";
import {
  OLYMPUS_ABYSS_PROD_MAX,
  OLYMPUS_BUREAUCRACY_KNOWLEDGE,
  OLYMPUS_COMPLETION_SCORE,
  OLYMPUS_HIGH_RUPTURE,
  OLYMPUS_IDLE_THRESHOLD_MS,
  OLYMPUS_MIN_DOMINANT_SCORE,
  OLYMPUS_PROFILES,
  OLYMPUS_QUICK_COLLAPSE_MS,
  OLYMPUS_SLEEP_KNOWLEDGE_PER_IDLE_HOUR,
  defaultOlympusState,
  dominantOlympusProfile
} from "../../data/olympus.js";

function olympus() {
  if (!state.olympus) state.olympus = defaultOlympusState();
  return state.olympus;
}

export function registerOlympusInteraction() {
  const o = olympus();
  o.lastInteractionAt = Date.now();
  o.idleStartedAt = null;
  o.idleCredited = false;
}

export function tickOlympus(dt) {
  const o = olympus();
  const now = Date.now();
  o.totalPlayedSeconds = (o.totalPlayedSeconds || 0) + dt;

  if (!o.lastInteractionAt) o.lastInteractionAt = now;
  const idleFor = now - o.lastInteractionAt;
  if (idleFor >= OLYMPUS_IDLE_THRESHOLD_MS) {
    if (!o.idleStartedAt) o.idleStartedAt = o.lastInteractionAt + OLYMPUS_IDLE_THRESHOLD_MS;
    if (!o.idleCredited) {
      o.idleSessions = (o.idleSessions || 0) + 1;
      o.idleCredited = true;
    }
    o.idleSeconds = (o.idleSeconds || 0) + dt;
    applyOlympusSleepHeritage(dt);
  }

  if ((state.instability || 0) >= OLYMPUS_HIGH_RUPTURE) {
    o.highRuptureSeconds = (o.highRuptureSeconds || 0) + dt;
  }
}

export function registerOlympusCrisisResolved() {
  const o = olympus();
  o.crisesResolved = (o.crisesResolved || 0) + 1;
  if (o.unlockedProfile === "bureaucracy") {
    state.knowledge = D(state.knowledge).add(OLYMPUS_BUREAUCRACY_KNOWLEDGE);
    chronicle(`Les parchemins de la Bureaucratie Sacrée enregistrent la résolution de la crise : +${OLYMPUS_BUREAUCRACY_KNOWLEDGE} savoirs sont versés à nos archives.`);
  }
}

export function registerOlympusCrisisIgnored() {
  const o = olympus();
  o.crisesIgnored = (o.crisesIgnored || 0) + 1;
}

export function registerOlympusCollapse(reason) {
  const o = olympus();
  o.totalCollapses = (o.totalCollapses || 0) + 1;
  o.collapseRuptureSum = (o.collapseRuptureSum || 0) + Math.max(0, Math.min(1, state.instability || 0));
  if (reason === "manual") o.manualCollapses = (o.manualCollapses || 0) + 1;

  const dominant = dominantOlympusProfile(o);
  o.lastDominantProfile = dominant.profile.id;
  if (dominant.score >= OLYMPUS_MIN_DOMINANT_SCORE && !o.unlockedProfile) {
    o.profileProgress[dominant.profile.id] = (o.profileProgress[dominant.profile.id] || 0) + dominant.score / 100;
    if (o.profileProgress[dominant.profile.id] >= OLYMPUS_COMPLETION_SCORE) {
      o.unlockedProfile = dominant.profile.id;
      log(`L'Olympe s'est prononce: ${dominant.profile.name}. ${dominant.profile.heritageDescription}`);
    }
  }
}

export function olympusRuinBonus(gain, reason) {
  const o = olympus();
  if (o.unlockedProfile !== "apocalypse") return gain;
  const cycleAge = Date.now() - (state.cycleStartedAt || Date.now());
  if (reason !== "manual" || cycleAge > OLYMPUS_QUICK_COLLAPSE_MS) return gain;
  const speed = 1 - cycleAge / OLYMPUS_QUICK_COLLAPSE_MS;
  const bonus = D(gain).mul(0.12 + speed * 0.18).floor();
  if (bonus.gt(0)) {
    chronicle(`Le Culte Apocalyptique glorifie notre fin précipitée : les prêtres nous guident à travers le chaos, révélant +${fmt(bonus)} ruines sacrées sous les cendres.`);
  }
  return D(gain).add(bonus);
}

export function olympusAbyssProductionMultiplier() {
  const o = olympus();
  if (o.unlockedProfile !== "abyss") return 1;
  const rupture = Math.max(0, state.instability || 0);
  if (rupture < OLYMPUS_HIGH_RUPTURE) return 1;
  const pressure = (rupture - OLYMPUS_HIGH_RUPTURE) / Math.max(0.01, 1 - OLYMPUS_HIGH_RUPTURE);
  return 1 + Math.min(OLYMPUS_ABYSS_PROD_MAX - 1, pressure * 0.35);
}

function applyOlympusSleepHeritage(dt) {
  const o = olympus();
  if (o.unlockedProfile !== "sleep") return;
  const gain = OLYMPUS_SLEEP_KNOWLEDGE_PER_IDLE_HOUR * (dt / 3600);
  state.knowledge = D(state.knowledge).add(gain);
}

export function olympusUnlockedProfile() {
  const o = olympus();
  return o.unlockedProfile ? OLYMPUS_PROFILES[o.unlockedProfile] : null;
}
