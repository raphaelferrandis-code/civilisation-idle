"use strict";

/* ============================================================================
 * uiReveal.js — LE JEU QUI SE DÉVOILE (2026-09-29, demande de Raph).
 *
 * Pendant la TOUTE PREMIÈRE partie, l'interface ne montre que ce qui sert : à
 * la première minute, la ville, deux ressources et les Cueilleurs. Chaque
 * élément entre en scène au moment où il devient utile — le Trésor avec le
 * premier or, la jauge de Rupture avec la deuxième étape des Premiers pas, la
 * Régulation et l'Effondrement quand la tension devient un sujet, les Plaisirs
 * avec le premier jeu jouable. Avant ce chantier, un nouveau joueur trouvait à
 * la seconde 0 trois ressources à 0.0, « Cycles 0.0 », « Multi ×1.0 », une
 * Régulation pleine de 0 % et dix sceaux de Grand Reset.
 *
 * ⚠ SEULEMENT la toute première partie (isFirstGame). Dès le premier
 * effondrement — ou pour toute sauvegarde qui en a déjà un derrière elle —
 * TOUT est visible, exactement comme avant. Un joueur installé ne perd rien.
 *
 * ⚠ LATCHES À SENS UNIQUE, posés par le tick (même patron que les Premiers pas
 * et les bâtiments révélés) : une fois montré, un élément ne se cache plus
 * jamais, même si sa condition retombe (l'or dépensé jusqu'au dernier sou).
 * La valeur stockée est l'HORODATAGE du dévoilement : il sert de drapeau ET
 * permet d'animer l'entrée de l'élément les premières secondes seulement.
 *
 * Module PUR : il lit l'état qu'on lui passe, n'importe que isFirstGame, et
 * reçoit du tick les « faits » qu'il ne peut pas calculer seul (ressources,
 * jeux du temple, bâtiments). Il peut donc être importé par state.js sans
 * cycle d'import.
 * ==========================================================================*/

import { isFirstGame } from "./onboarding.js";

// L'ordre ne compte que pour la signature d'abonnement.
export const UI_REVEAL_KEYS = [
  "gold",            // case Trésor de la barre du haut
  "knowledge",       // case Savoir
  "infrastructure",  // case Infrastructure
  "gauge",           // jauge de Rupture sous le nom de la cité
  "tension",         // Régulation (onglet + encart de la carte), onglet Effondrement, Usure, Vœu
  "meta",            // Temps du cycle, Réserve d'absence, Sauver / Exporter / Importer
  "plaisirs",        // onglet Plaisirs
  "shopKnowledge",   // onglet Savoir de la boutique
  "shopInfra",       // onglet Infrastructure de la boutique
  "buyAmounts",      // multiplicateurs d'achat (×10, ×25…) et « Tout acheter »
];

// Durée pendant laquelle un élément tout juste dévoilé porte sa classe
// d'entrée (`is-fresh`). Largement plus que l'animation elle-même : la classe
// n'a d'effet qu'au moment où elle est posée, la laisser traîner est sans
// conséquence, la retirer trop tôt couperait l'animation d'un rendu tardif.
export const REVEAL_FRESH_MS = 4000;

// Âge à partir duquel le temps du cycle, la réserve d'absence et les boutons de
// sauvegarde apparaissent : le Grand Feu (ère 1), vers 2 min dans une partie
// type. Le joueur y a quelque chose à perdre, et donc à sauver.
export const REVEAL_META_ERA = 1;

// Nombre d'exemplaires d'un même bâtiment à partir duquel les multiplicateurs
// d'achat servent : sous 10, « ×10 » n'a encore rien à acheter en bloc.
export const REVEAL_BUY_AMOUNTS_COUNT = 10;

/**
 * Latch des dévoilements, appelé au tick. Rend la liste des clés TOUT JUSTE
 * dévoilées (pour que l'appelant puisse les annoncer).
 *
 * `facts` : { gold, knowledge, infrastructure, plaisirs, shopKnowledge,
 * shopInfra, buyAmounts } — des booléens calculés par l'appelant. Les autres
 * clés se déduisent de drapeaux déjà latchés dans l'état.
 */
export function refreshUiReveal(s, facts, now) {
  const o = s?.onboarding;
  if (!o) return [];
  if (!o.reveal || typeof o.reveal !== "object") o.reveal = {};
  const r = o.reveal;
  const f = facts || {};
  const want = {
    gold: Boolean(f.gold),
    knowledge: Boolean(f.knowledge),
    infrastructure: Boolean(f.infrastructure),
    // La deuxième étape des Premiers pas dit « Laisse la Rupture monter » : la
    // jauge doit être là quand la phrase s'affiche, pas avant.
    gauge: Boolean(o.built),
    // La tension devient un sujet au premier quart de Rupture (première crise,
    // troisième étape des Premiers pas qui nomme l'onglet Effondrement). Une
    // crise terminale l'impose de toute façon : l'onglet Effondrement est alors
    // le SEUL accessible, il ne peut pas être caché.
    tension: Boolean(o.pressureSeen) || Boolean(s.crisisLimitAnnounced),
    meta: (s.bestEraIndex || 0) >= REVEAL_META_ERA,
    plaisirs: Boolean(f.plaisirs),
    shopKnowledge: Boolean(f.shopKnowledge),
    shopInfra: Boolean(f.shopInfra),
    buyAmounts: Boolean(f.buyAmounts),
  };
  const fresh = [];
  for (const key of UI_REVEAL_KEYS) {
    if (!r[key] && want[key]) {
      r[key] = now;
      fresh.push(key);
    }
  }
  return fresh;
}

/** Vrai quand plus rien n'est à dévoiler : le tick peut s'épargner les faits. */
export function uiRevealComplete(s) {
  const r = s?.onboarding?.reveal;
  return Boolean(r) && UI_REVEAL_KEYS.every((k) => r[k]);
}

/** L'élément `key` est-il visible ? Toujours vrai hors de la toute première partie. */
export function uiRevealed(s, key) {
  if (!isFirstGame(s)) return true;
  return Boolean(s?.onboarding?.reveal?.[key]);
}

/** Dévoilé il y a moins de `windowMs` ? Sert à poser la classe d'entrée. */
export function uiRevealFresh(s, key, now, windowMs = REVEAL_FRESH_MS) {
  if (!isFirstGame(s)) return false;
  const t = s?.onboarding?.reveal?.[key];
  return Boolean(t) && now - t < windowMs;
}

/**
 * Signature d'abonnement : ne change QUE lorsqu'un élément se dévoile. Même
 * raison que onboardingSignature : un sélecteur rendant un objet neuf à chaque
 * tick re-rendrait la vue une fois par seconde pour rien.
 */
export function uiRevealSignature(s) {
  if (!isFirstGame(s)) return "*";
  const r = s?.onboarding?.reveal || {};
  return UI_REVEAL_KEYS.map((k) => (r[k] ? "1" : "0")).join("");
}

/** Normalisation au chargement : seules les clés connues, horodatages valides. */
export function normalizeUiReveal(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of UI_REVEAL_KEYS) {
    const t = Number(raw[key]);
    if (Number.isFinite(t) && t > 0) out[key] = t;
  }
  return out;
}

// Ce que le tick annonce quand une clé se dévoile (toast). Les clés absentes
// entrent en silence : la jauge est annoncée par les Premiers pas, les onglets
// de la boutique par « À portée », les boutons de sauvegarde et les
// multiplicateurs n'ont pas besoin d'une fanfare.
export const UI_REVEAL_ANNOUNCE = {
  gold: { label: { fr: "✨ Nouvelle ressource : Trésor", en: "✨ New resource: Treasury" } },
  knowledge: { label: { fr: "✨ Nouvelle ressource : Savoir", en: "✨ New resource: Knowledge" } },
  infrastructure: { label: { fr: "✨ Nouvelle ressource : Infrastructure", en: "✨ New resource: Infrastructure" } },
  tension: { label: { fr: "🧭 Nouveaux onglets : Régulation, Effondrement", en: "🧭 New tabs: Regulation, Collapse" }, view: "regulation" },
  plaisirs: { label: { fr: "🎲 Nouvel onglet : Plaisirs", en: "🎲 New tab: Pleasures" }, view: "plaisirs" },
};
