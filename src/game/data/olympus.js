"use strict";

import { clamp } from "../core/utils.js";
import { localizeData } from "../core/i18n.js";

export const OLYMPUS_IDLE_THRESHOLD_MS = 3 * 60_000;
export const OLYMPUS_HIGH_RUPTURE = 0.72;
export const OLYMPUS_COMPLETION_SCORE = 12;
export const OLYMPUS_MIN_DOMINANT_SCORE = 75;
export const OLYMPUS_QUICK_COLLAPSE_MS = 8 * 60_000;
export const OLYMPUS_SLEEP_KNOWLEDGE_PER_IDLE_HOUR = 8;
export const OLYMPUS_BUREAUCRACY_KNOWLEDGE = 3;
export const OLYMPUS_ABYSS_PROD_MAX = 1.35;

export const OLYMPUS_PROFILES = {
  apocalypse: {
    id: "apocalypse",
    name: { fr: "Culte Apocalyptique", en: "Apocalyptic Cult" },
    short: { fr: "Dieu de la Fin", en: "God of the End" },
    description: { fr: "Tes habitants t'adorent comme le Dieu de la Fin. Ils construisent des temples aux ruines et comptent les annees en effondrements.", en: "Your people worship you as the God of the End. They build temples to ruins and count the years in collapses." },
    heritageDescription: { fr: "Les effondrements rapides accordent un bonus de Ruines.", en: "Swift collapses grant a Ruins bonus." }
  },
  bureaucracy: {
    id: "bureaucracy",
    name: { fr: "Bureaucratie Sacree", en: "Sacred Bureaucracy" },
    short: { fr: "Dieu des Registres", en: "God of Records" },
    description: { fr: "La cite voit tes decisions comme des decrets sacres. Chaque crise classee, payee, resolue devient une priere administrative.", en: "The city sees your decisions as sacred decrees. Every crisis filed, paid, resolved becomes an administrative prayer." },
    heritageDescription: { fr: "Les crises resolues donnent un petit bonus de Savoir.", en: "Resolved crises grant a small Knowledge bonus." }
  },
  sleep: {
    id: "sleep",
    name: { fr: "Religion du Sommeil", en: "Religion of Sleep" },
    short: { fr: "Dieu qui Reve", en: "Dreaming God" },
    description: { fr: "Tes habitants pensent que le monde avance pendant que tu dors. Les veilleurs parlent bas pour ne pas reveiller la divinite.", en: "Your people believe the world moves forward while you sleep. The watchmen speak low so as not to wake the divinity." },
    heritageDescription: { fr: "Les longues sessions idle generent un micro-bonus passif.", en: "Long idle sessions generate a passive micro-bonus." }
  },
  abyss: {
    id: "abyss",
    name: { fr: "Secte de l'Abime", en: "Cult of the Abyss" },
    short: { fr: "Dieu du Bord", en: "God of the Brink" },
    description: { fr: "La cite apprend a prier au bord du gouffre. Elle aime la Rupture haute, les murs qui tremblent, les decisions qui viennent trop tard.", en: "The city learns to pray at the edge of the chasm. It loves high Rupture, trembling walls, decisions that come too late." },
    heritageDescription: { fr: "Tenir avec une Rupture haute donne un multiplicateur de production.", en: "Holding on with high Rupture grants a production multiplier." }
  }
};

export function defaultOlympusState(now = Date.now()) {
  return {
    totalPlayedSeconds: 0,
    manualCollapses: 0,
    totalCollapses: 0,
    collapseRuptureSum: 0,
    crisesResolved: 0,
    crisesIgnored: 0,
    idleSessions: 0,
    idleSeconds: 0,
    highRuptureSeconds: 0,
    profileProgress: {
      apocalypse: 0,
      bureaucracy: 0,
      sleep: 0,
      abyss: 0
    },
    unlockedProfile: null,
    lastDominantProfile: null,
    lastInteractionAt: now,
    idleStartedAt: null,
    idleCredited: false
  };
}

function finite(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeOlympusState(raw, now = Date.now()) {
  const base = defaultOlympusState(now);
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const progress = source.profileProgress && typeof source.profileProgress === "object"
    ? source.profileProgress
    : {};

  const profileProgress = {};
  for (const id of Object.keys(OLYMPUS_PROFILES)) {
    profileProgress[id] = finite(progress[id], 0, 0, 999);
  }

  const unlockedProfile = OLYMPUS_PROFILES[source.unlockedProfile] ? source.unlockedProfile : null;
  const lastDominantProfile = OLYMPUS_PROFILES[source.lastDominantProfile] ? source.lastDominantProfile : null;

  return {
    ...base,
    totalPlayedSeconds: finite(source.totalPlayedSeconds, 0, 0),
    manualCollapses: finite(source.manualCollapses, 0, 0),
    totalCollapses: finite(source.totalCollapses, 0, 0),
    collapseRuptureSum: finite(source.collapseRuptureSum, 0, 0),
    crisesResolved: finite(source.crisesResolved, 0, 0),
    crisesIgnored: finite(source.crisesIgnored, 0, 0),
    idleSessions: finite(source.idleSessions, 0, 0),
    idleSeconds: finite(source.idleSeconds, 0, 0),
    highRuptureSeconds: finite(source.highRuptureSeconds, 0, 0),
    profileProgress,
    unlockedProfile,
    lastDominantProfile,
    lastInteractionAt: finite(source.lastInteractionAt, now, 0),
    idleStartedAt: source.idleStartedAt ? finite(source.idleStartedAt, now, 0) : null,
    idleCredited: Boolean(source.idleCredited)
  };
}

function scoreClamp(value) {
  return clamp(value, 0, 100);
}

export function olympusMetrics(olympus) {
  const playedHours = Math.max(0.05, (olympus.totalPlayedSeconds || 0) / 3600);
  const collapseFrequency = (olympus.manualCollapses || 0) / playedHours;
  const crisisTotal = (olympus.crisesResolved || 0) + (olympus.crisesIgnored || 0);
  const crisisResolutionRatio = crisisTotal > 0 ? olympus.crisesResolved / crisisTotal : 0.5;
  const idleRatio = olympus.totalPlayedSeconds > 0 ? olympus.idleSeconds / olympus.totalPlayedSeconds : 0;
  const averageCollapseRupture = olympus.totalCollapses > 0 ? olympus.collapseRuptureSum / olympus.totalCollapses : 0;
  const manualCollapseRatio = olympus.totalCollapses > 0 ? olympus.manualCollapses / olympus.totalCollapses : 0;
  const highRuptureRatio = olympus.totalPlayedSeconds > 0 ? olympus.highRuptureSeconds / olympus.totalPlayedSeconds : 0;

  return {
    collapseFrequency,
    crisisResolutionRatio,
    idleRatio: clamp(idleRatio, 0, 1),
    averageCollapseRupture: clamp(averageCollapseRupture, 0, 1),
    manualCollapseRatio: clamp(manualCollapseRatio, 0, 1),
    highRuptureRatio: clamp(highRuptureRatio, 0, 1)
  };
}

function olympusProfileScores(olympus) {
  const m = olympusMetrics(olympus);
  const freqScore = scoreClamp((m.collapseFrequency / 3) * 100);
  const rareCollapseScore = scoreClamp(100 - (m.collapseFrequency / 1.2) * 100);
  const activeScore = scoreClamp((1 - m.idleRatio) * 100);
  const ruptureScore = scoreClamp(m.averageCollapseRupture * 100);
  const manualScore = scoreClamp(m.manualCollapseRatio * 100);
  const lowManualScore = scoreClamp((1 - m.manualCollapseRatio) * 100);
  const highRuptureScore = scoreClamp(m.highRuptureRatio * 160);
  const resolutionScore = scoreClamp(m.crisisResolutionRatio * 100);
  const lowResolutionScore = scoreClamp((1 - m.crisisResolutionRatio) * 100);
  const idleScore = scoreClamp(m.idleRatio * 145);

  return {
    apocalypse: Math.round(freqScore * 0.45 + ruptureScore * 0.35 + manualScore * 0.20),
    bureaucracy: Math.round(resolutionScore * 0.65 + activeScore * 0.35),
    sleep: Math.round(idleScore * 0.7 + rareCollapseScore * 0.3),
    abyss: Math.round(highRuptureScore * 0.5 + ruptureScore * 0.2 + lowResolutionScore * 0.2 + lowManualScore * 0.1)
  };
}

export function dominantOlympusProfile(olympus) {
  const scores = olympusProfileScores(olympus);
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [id, score] = entries[0] || ["sleep", 0];
  return {
    profile: OLYMPUS_PROFILES[id],
    score,
    scores
  };
}

export function unlockedOlympusProfile(olympus) {
  if (!olympus?.unlockedProfile) return null;
  return OLYMPUS_PROFILES[olympus.unlockedProfile] || null;
}

// Aplatit les feuilles { fr, en } des profils en chaînes (cf. i18n.js).
localizeData(OLYMPUS_PROFILES);
