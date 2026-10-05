"use strict";

// ── Merveilles : la partie ÉTAT (BUG-12 de l'audit du 2026-10-05) ────────────
// Les rangs de merveille (state.wonders / state.wonderTiers) étaient gravés par
// la boucle rAF de la carte (cmCheckWonders, layout.js) : rien n'était crédité
// hors de l'onglet Cité, fenêtre réduite, onglet caché ou dialogue ouvert. Un
// joueur AFK sous l'Édit d'effondrement enchaînait les cycles sans graver un
// seul rang Population ou Ère, et le sceau GR II (3 merveilles) attendait.
// Le cœur grave désormais les rangs (checkWonderTiers, appelé par le tick et au
// seuil de completeCollapse) ; la carte ne garde que l'animation d'érection.
//
// Chaque merveille a une identité propre : nom, monument construit par le code
// (iso/wonderBake.js, docs/PLAN-MERVEILLES.md),
// emplacement thématique, et 5 PALIERS d'évolution : franchir un nouveau jalon
// (population ×10, dynastie suivante, ère plus avancée...) fait grandir le
// monument et l'orne de nouveaux attributs. `metric` extrait la valeur de
// progression, `tiers` liste les 5 seuils, `tierLabel` nomme le jalon.
// `name`, `unlockedBy` et ce que rend `tierLabel` sont des unités { fr, en } :
// tout lecteur passe par tr() (infobulle de la carte, chronique).
// `icon`, `slot` et `reEra` ne servent qu'à la carte (layout.js les relit sous
// le nom historique CM_WONDERS) : une seule liste, pas deux à tenir alignées.

import { eras } from '../../data/world.js';
import { fmtShort } from '../utils.js';
import { toNum } from '../num.js';
import { currentEraIndex } from './shared.js';

// Le PIC du cycle (state.cyclePeaks, tenu à jour par tick.js) et non la valeur
// de l'instant : la vérification ne dépend plus du moment où elle tourne. Lue
// juste après un retour d'absence, ou au seuil de la chute, elle voit encore le
// sommet que la cité a réellement atteint.
function peakPopulation(s) {
  return Math.max(toNum(s.population) || 0, toNum(s.cyclePeaks && s.cyclePeaks.population) || 0);
}
function peakEraIndex(s) {
  return Math.max(currentEraIndex(), (s.cyclePeaks && s.cyclePeaks.eraIndex) | 0);
}

export const WONDERS = [
  { id: "dynasty1",       name: { fr: "Le Grand Mausolée", en: "The Great Mausoleum" }, icon: "mausoleum", slot: { angle: -2.42, ring: 1.0 }, reEra: 2,
    unlockedBy: { fr: "Premier effondrement traversé.", en: "First collapse survived." },
    // Métrique = effondrements traversés (cycles) : un tombeau qui grandit avec
    // chaque cité tombée. Seule merveille indexée sur les cycles (unique).
    // Tiers recalés (calibrage 2026-07) sur les époques mesurées en sim
    // (100-600 cycles) : rang V = vraie fin de méta, plus un trivial à 100.
    metric: (s) => s.cycles || 0, tiers: [1, 15, 50, 150, 400],
    tierLabel: (v) => ({
      fr: `${v} effondrement${v > 1 ? "s" : ""} traversé${v > 1 ? "s" : ""}`,
      en: `${v} collapse${v > 1 ? "s" : ""} survived` }) },
  { id: "pop1m",          name: { fr: "La Colonne du Million", en: "The Column of the Million" }, icon: "column", slot: { angle: 1.15, ring: 0.62 }, reEra: 6,
    unlockedBy: { fr: "Rayonnement d'au moins 1 000 000.", en: "Radiance of at least 1,000,000." },
    metric: peakPopulation, tiers: [1e6, 1e13, 1e20, 1e27, 1e34],
    tierLabel: (v) => ({ fr: `${fmtShort(v)} de Rayonnement`, en: `${fmtShort(v)} Radiance` }) },
  { id: "era_kingdom",    name: { fr: "Le Palais de la Couronne", en: "The Palace of the Crown" }, icon: "crown", slot: { angle: -1.25, ring: 1.18 }, reEra: 9,
    unlockedBy: { fr: "Âge du royaume atteint.", en: "Kingdom age reached." },
    // Rééchelonné 2026-07-03 : « Royaume » = ère 19 depuis la refonte des ères
    // (les anciens seuils [9..25] faisaient naître la couronne au Bourg agricole).
    // Chaque rang tombe sur une ère iconique : Royaume, Royaume conquérant,
    // Empire, Métropole, Machination (fin de course juste avant la Singularité).
    metric: peakEraIndex, tiers: [19, 22, 25, 29, 33],
    // (Le nom d'ère est déjà dans la langue du joueur : localizeData sur `eras`.)
    tierLabel: (v) => {
      const era = eras[v] ? eras[v].name : v;
      return { fr: `ère « ${era} »`, en: `${era} era` };
    } },
  { id: "era_empire",     name: { fr: "La Cathédrale Inachevée", en: "The Unfinished Cathedral" }, icon: "arch", slot: { angle: 0.02, ring: 0.82 }, reEra: 13,
    unlockedBy: { fr: "500 achats accomplis (bâtiments et décrets).", en: "500 purchases made (buildings and decrees)." },
    // Rééchelonné 2026-07-03 (×10 par rang) : un achat ×100 compte 100
    // (lifetimePurchases += amount) et Héphaïstos auto-achète en fin de méta —
    // les anciens seuils [500..20000] tombaient avant GR1. Le rang V (5 M)
    // récompense l'automatisation de la construction sur la durée.
    metric: (s) => s.lifetimePurchases || 0, tiers: [500, 5000, 50000, 500000, 5000000],
    tierLabel: (v) => ({ fr: `${v.toLocaleString("fr-FR")} achats accomplis`, en: `${v.toLocaleString("en-US")} purchases made` }) },
  { id: "era_mega",       name: { fr: "L'Aiguille Céleste", en: "The Celestial Needle" }, icon: "needle", slot: { angle: 2.3, ring: 0.55 }, reEra: 17,
    unlockedBy: { fr: "30 minutes passées à veiller sur la cité.", en: "30 minutes spent watching over the city." },
    // Rééchelonné 2026-07-03 : playTimeSec = temps ACTIF à vie (pas d'offline).
    // Rang IV ≈ la course GR1 accomplie (~44 h sim), rang V = une semaine
    // entière de veille — aligné sur les rangs V « fin de méta » des autres.
    metric: (s) => s.playTimeSec || 0, tiers: [1800, 10800, 43200, 172800, 604800],
    tierLabel: (v) => v >= 3600
      ? { fr: `${Math.round(v / 3600)} heures de veille`, en: `${Math.round(v / 3600)} hours of vigil` }
      : { fr: `${Math.round(v / 60)} minutes de veille`, en: `${Math.round(v / 60)} minutes of vigil` } },
  { id: "era_singularity",name: { fr: "L'Œil de la Singularité", en: "The Eye of the Singularity" }, icon: "eye", slot: { angle: -0.6, ring: 0.42 }, reEra: 21,
    unlockedBy: { fr: "Premier mythe accompli.", en: "First myth completed." },
    // Rééchelonné 2026-07-03 : 14 mythes au total (le 14e = Ragnarök, terminal).
    // mythsCompleted survit aux Grand Resets (à vie). Rang V = TOUS les mythes
    // accomplis (Ragnarök compris) : la merveille finale culmine à la fin de tout.
    metric: (s) => Object.values(s.mythsCompleted || {}).filter(Boolean).length, tiers: [1, 4, 7, 10, 14],
    tierLabel: (v) => ({
      fr: `${v} mythe${v > 1 ? "s" : ""} accompli${v > 1 ? "s" : ""}`,
      en: `${v} myth${v > 1 ? "s" : ""} completed` }) }
];
export const WONDER_TIER_NAMES = ["", "I", "II", "III", "IV", "V"];

// Palier courant d'une merveille (0 = pas encore érigée, 1..5 sinon).
export function wonderTier(w, s) {
  const v = w.metric(s);
  let tier = 0;
  for (const threshold of w.tiers) { if (v >= threshold) tier += 1; else break; }
  return tier;
}

// Rang GRAVÉ d'une merveille (0 = jamais érigée). Une vieille sauvegarde peut
// lister une merveille sans rang : elle compte alors pour le rang I.
export function wonderTierOf(s, id) {
  const tiers = s && s.wonderTiers;
  return (tiers && tiers[id]) || (s && Array.isArray(s.wonders) && s.wonders.includes(id) ? 1 : 0);
}

// Grave dans `s` les rangs de merveille franchis : MÉMOIRE PERMANENTE, jamais
// perdue, survit aux cycles (les merveilles ne régressent jamais : la pierre
// garde la mémoire du sommet). Retourne la liste des montées
// [{ wonder, tier, erected }] — `erected` = première érection — pour que
// l'appelant les annonce (chronique) ; ce module ne publie rien lui-même.
export function checkWonderTiers(s) {
  const rises = [];
  if (!s) return rises;
  if (!Array.isArray(s.wonders)) s.wonders = [];
  if (!s.wonderTiers || typeof s.wonderTiers !== "object") s.wonderTiers = {};
  for (const w of WONDERS) {
    let tier;
    try { tier = wonderTier(w, s); } catch { tier = 0; }
    const prev = wonderTierOf(s, w.id);
    if (tier <= prev) {
      if (prev > 0 && !s.wonderTiers[w.id]) s.wonderTiers[w.id] = prev;
      continue;
    }
    s.wonderTiers[w.id] = tier;
    const erected = !s.wonders.includes(w.id);
    if (erected) s.wonders.push(w.id);
    rises.push({ wonder: w, tier, erected });
  }
  return rises;
}
