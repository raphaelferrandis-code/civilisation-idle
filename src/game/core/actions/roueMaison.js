"use strict";

// LA ROUE DE LA MAISON (2026-10-04, Raph : « comme les applis de casino qui ne font
// pas jouer d'argent réel », docs/PLAN-GAINS-CASINO.md). Un tour OFFERT par heure :
// seize cases ÉGALES (ce qu'on voit est la chance), chacune vaut un nombre d'heures de
// recettes (ROUE_SEGMENTS_H, balance.js — 1,125 h en moyenne). Mesuré sur 20 h
// (bench-plaisirs.js) : avec les bourses des titres, la bourse d'un joueur régulier
// monte à ~25 h de recettes au lieu de ~12, sans qu'aucun jeu ne rende plus de 100 %.
//
// Ce n'est PAS une mise : ni cagnotte, ni réputation. Le tour attend qu'on le prenne,
// une absence n'en accumule pas plusieurs (state.roueAt = l'heure du dernier tour).
// Ouverte avec la Maison (Ère II).

import { state, save, render, isNotifyPaused } from '../state.js';
import { ROUE_INTERVAL_S, ROUE_SEGMENTS_H } from '../balance.js';
import { recettesPerHour } from './maisonTable.js';
import { chronicle } from './utils.js';
import { fmt } from '../utils.js';
import { tr } from '../i18n.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { recordRoue } from '../chronicleStats.js';

// La Maison ouvre à l'Ère II (les osselets et les tickets) : la roue avec elle.
export function roueUnlocked() {
  return (state.bestEraIndex || 0) >= 2;
}

// L'instant où le prochain tour est prêt (ms).
export function roueReadyAt() {
  const at = Number(state.roueAt) || 0;
  return at > 0 ? at + ROUE_INTERVAL_S * 1000 : 0;
}

export function roueReady(now = Date.now()) {
  return roueUnlocked() && now >= roueReadyAt();
}

// Les minutes avant le prochain tour (0 = prêt).
export function roueWaitMinutes(now = Date.now()) {
  return Math.max(0, Math.ceil((roueReadyAt() - now) / 60000));
}

// La valeur EN FAVEUR de chaque case, au moment présent (les recettes suivent l'ère).
export function roueValues() {
  const r = recettesPerHour();
  return ROUE_SEGMENTS_H.map((h) => Math.max(1, Math.round(h * r)));
}

// Un tour : { index, h, gain, apply }, ou null si la roue n'est pas prête. La case est
// tirée ICI (l'animation se pose dessus) ; apply() verse le gain — l'UI le diffère
// jusqu'à l'arrêt de la roue, comme les tables.
export function spinRoue(options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { defer = false, silent = false, render: doRender = true } = opts;
  if (!roueReady()) return null;
  const index = Math.min(ROUE_SEGMENTS_H.length - 1, Math.floor(Math.random() * ROUE_SEGMENTS_H.length));
  const h = ROUE_SEGMENTS_H[index];
  const gain = Math.max(1, Math.round(h * recettesPerHour()));
  state.roueAt = Date.now();
  const result = { index, h, gain };
  let applied = false;
  result.apply = () => {
    if (applied) return result;
    applied = true;
    state.faveur = Math.max(0, (state.faveur || 0) + gain);
    recordRoue(gain);
    // La plus belle case de la roue s'écrit dans la Chronique.
    if (h >= Math.max(...ROUE_SEGMENTS_H)) {
      chronicle(tr({
        fr: `La roue de la Maison s'arrête sur sa plus belle case : ${fmt(gain)} faveur.`,
        en: `The House wheel stops on its finest slot: ${fmt(gain)} favor.`
      }));
    }
    if (!silent && !isNotifyPaused()) pushOutcomeFloat({ label: tr({ fr: `☸ +${fmt(gain)} faveur`, en: `☸ +${fmt(gain)} favor` }), kind: "gain" });
    save();
    if (doRender) render();
    return result;
  };
  if (!defer) result.apply();
  return result;
}
