"use strict";

import { state, isOfflineSim } from "../state.js";
import { chronicle, log } from "./utils.js";
import { fmt } from "../utils.js";
import { tr } from "../i18n.js";
import { D } from "../num.js";
import { ruinEffectSum } from "../mechanics/shared.js";
import { rates } from "../mechanics.js";
import {
  OLYMPUS_BUREAUCRACY_KNOWLEDGE,
  OLYMPUS_BUREAUCRACY_RATE_SECONDS,
  OLYMPUS_COMPLETION_SCORE,
  OLYMPUS_HIGH_RUPTURE,
  OLYMPUS_IDLE_THRESHOLD_MS,
  OLYMPUS_MIN_DOMINANT_SCORE,
  OLYMPUS_QUICK_COLLAPSE_MS,
  OLYMPUS_SLEEP_KNOWLEDGE_RATE_SHARE,
  defaultOlympusState,
  dominantOlympusProfile
} from "../../data/olympus.js";

function olympus() {
  if (!state.olympus) state.olympus = defaultOlympusState();
  return state.olympus;
}

// « Autel du culte » (cultAmp) : les effets du culte de l'Olympe sont renforcés
// et le profil se révèle plus vite. ×1 sans le nœud.
function cultAmpMult() {
  return 1 + ruinEffectSum("cultAmp");
}

// Bureaucratie Sacrée : chaque acte de régulation verse son savoir sur-le-champ,
// mais la Chronique n'en écrit qu'UNE ligne par minute au plus, qui cumule les
// versements. Une ligne par appel noyait le Journal (48 lignes) : l'Intendance
// signe un édit toutes les 20 s par consigne, et chaque édit a déjà sa propre
// dépêche (audit 2026-10-05, BUG-26). Cumul en mémoire seulement : un
// rechargement perd au pire une ligne, jamais le savoir, déjà versé.
const BUREAUCRACY_CHRONICLE_MS = 60_000;
// `gain` en Decimal : indexé sur la production de Savoir (BUG-26), il dépasse le float.
let bureaucracyPending = { gain: D(0), crises: 0 };
let bureaucracyChronicledAt = -Infinity;

// `force` : la chute écrit le reliquat du cycle qui tombe, sans attendre la minute.
function flushBureaucracyChronicle(force = false) {
  // Hors ligne, le Journal de la simulation est jeté (simulateAwayCrises) : le
  // cumul d'avant l'absence attend le retour au lieu d'y disparaître.
  if (bureaucracyPending.crises <= 0 || isOfflineSim()) return;
  // Import d'une autre sauvegarde entre-temps : ce cumul n'est pas le sien.
  if (state.olympus?.unlockedProfile !== "bureaucracy") { bureaucracyPending = { gain: D(0), crises: 0 }; return; }
  const now = Date.now();
  // Horloge reculée (now < dernière ligne) : on écrit plutôt que de se taire
  // jusqu'à ce qu'elle rattrape l'ancienne échéance.
  if (!force && now >= bureaucracyChronicledAt && now - bureaucracyChronicledAt < BUREAUCRACY_CHRONICLE_MS) return;
  const { crises } = bureaucracyPending;
  const gain = fmt(bureaucracyPending.gain);
  bureaucracyPending = { gain: D(0), crises: 0 };
  bureaucracyChronicledAt = now;
  // Le nombre de crises en entier brut (fmt écrirait « 2.0 crises ») ; le savoir,
  // indexé sur la production, passe par fmt.
  chronicle(crises > 1
    ? tr({
        fr: `Les parchemins de la Bureaucratie Sacrée enregistrent la résolution de ${crises} crises : +${gain} savoirs sont versés à nos archives.`,
        en: `The scrolls of the Sacred Bureaucracy record the resolution of ${crises} crises: +${gain} knowledge is added to our archives.`
      })
    : tr({
        fr: `Les parchemins de la Bureaucratie Sacrée enregistrent la résolution de la crise : +${gain} savoirs sont versés à nos archives.`,
        en: `The scrolls of the Sacred Bureaucracy record the crisis's resolution: +${gain} knowledge is added to our archives.`
      }));
}

export function registerOlympusInteraction() {
  const o = olympus();
  o.lastInteractionAt = Date.now();
  o.idleStartedAt = null;
  o.idleCredited = false;
}

// `r` : le relevé de rates() que le tick vient de prendre (le Sommeil s'y indexe).
export function tickOlympus(dt, r = null) {
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
    applyOlympusSleepHeritage(dt, r);
  }

  if ((state.instability || 0) >= OLYMPUS_HIGH_RUPTURE) {
    o.highRuptureSeconds = (o.highRuptureSeconds || 0) + dt;
  }

  // Le dernier cumul de la Bureaucratie s'écrit une fois sa minute passée, même
  // si aucun autre acte ne vient le pousser.
  flushBureaucracyChronicle();
}

export function registerOlympusCrisisResolved() {
  const o = olympus();
  o.crisesResolved = (o.crisesResolved || 0) + 1;
  if (o.unlockedProfile === "bureaucracy") {
    // max(3, 2 s de production de Savoir) par acte, renforcé par l'Autel du culte
    // (BUG-26). En Decimal de bout en bout.
    const gain = D(rates().knowledge).max(0).mul(OLYMPUS_BUREAUCRACY_RATE_SECONDS)
      .max(OLYMPUS_BUREAUCRACY_KNOWLEDGE).mul(cultAmpMult()).round();
    state.knowledge = D(state.knowledge).add(gain);
    // Hors ligne, rien à cumuler pour un Journal jeté : le savoir est versé quand même.
    if (isOfflineSim()) return;
    bureaucracyPending.gain = bureaucracyPending.gain.add(gain);
    bureaucracyPending.crises += 1;
    flushBureaucracyChronicle();
  }
}

export function registerOlympusCrisisIgnored() {
  const o = olympus();
  o.crisesIgnored = (o.crisesIgnored || 0) + 1;
}

export function registerOlympusCollapse(reason) {
  const o = olympus();
  // Le cumul en attente de la Bureaucratie appartient au cycle qui tombe.
  flushBureaucracyChronicle(true);
  o.totalCollapses = (o.totalCollapses || 0) + 1;
  o.collapseRuptureSum = (o.collapseRuptureSum || 0) + Math.max(0, Math.min(1, state.instability || 0));
  if (reason === "manual") o.manualCollapses = (o.manualCollapses || 0) + 1;

  const dominant = dominantOlympusProfile(o);
  o.lastDominantProfile = dominant.profile.id;
  if (dominant.score >= OLYMPUS_MIN_DOMINANT_SCORE && !o.unlockedProfile) {
    // « Autel du culte » : la révélation du profil progresse plus vite.
    o.profileProgress[dominant.profile.id] = (o.profileProgress[dominant.profile.id] || 0) + (dominant.score / 100) * cultAmpMult();
    if (o.profileProgress[dominant.profile.id] >= OLYMPUS_COMPLETION_SCORE) {
      o.unlockedProfile = dominant.profile.id;
      log(tr({
        fr: `L'Olympe s'est prononcé : ${tr(dominant.profile.name)}. ${tr(dominant.profile.heritageDescription)}`,
        en: `Olympus has spoken: ${tr(dominant.profile.name)}. ${tr(dominant.profile.heritageDescription)}`
      }));
    }
  }
}

export function olympusRuinBonus(gain, reason) {
  const o = olympus();
  if (o.unlockedProfile !== "apocalypse") return gain;
  const cycleAge = Date.now() - (state.cycleStartedAt || Date.now());
  if (reason !== "manual" || cycleAge > OLYMPUS_QUICK_COLLAPSE_MS) return gain;
  const speed = 1 - cycleAge / OLYMPUS_QUICK_COLLAPSE_MS;
  const bonus = D(gain).mul((0.12 + speed * 0.18) * cultAmpMult()).floor();
  if (bonus.gt(0)) {
    chronicle(tr({
      fr: `Le Culte Apocalyptique glorifie notre fin précipitée : les prêtres nous guident à travers le chaos, révélant +${fmt(bonus)} ruines sacrées sous les cendres.`,
      en: `The Apocalyptic Cult glorifies our hastened end: the priests guide us through the chaos, revealing +${fmt(bonus)} sacred ruins beneath the ashes.`
    }));
  }
  return D(gain).add(bonus);
}

// olympusAbyssProductionMultiplier() a migré vers mechanics/production/olympusProd.js
// (audit G‑18 : un multiplicateur de production n'a rien à faire côté actions).

// Religion du Sommeil : 10 % de la production de Savoir en plus pendant
// l'inactivité, renforcés par l'Autel du culte (BUG-26). Paie aussi pendant le
// farm hors ligne, qui rejoue tick() : c'est le cœur du culte (« le monde avance
// pendant que tu dors »).
function applyOlympusSleepHeritage(dt, r) {
  const o = olympus();
  if (o.unlockedProfile !== "sleep") return;
  const gain = D((r || rates()).knowledge).max(0).mul(OLYMPUS_SLEEP_KNOWLEDGE_RATE_SHARE * dt * cultAmpMult());
  state.knowledge = D(state.knowledge).add(gain);
}
