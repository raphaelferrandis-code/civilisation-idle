"use strict";

// LA CAISSE DE LA MAISON (ex-tronc des offrandes) — la source de Faveur HORS jeux.
// Les habitants jouent, la Maison verse sa part à la cité : la caisse se remplit en
// continu au rythme des RECETTES (actions/maisonTable.js), qui suivent l'ère record
// de la ville depuis le lot 1 des gains « vrai casino » (2026-10-04) — 120/h à
// l'Ère II comme l'ancien tronc, ~×1,4 par ère ensuite. Elle PLAFONNE à 30 min de
// recettes (l'AFK ne farme pas) et se relève d'un clic.
// Calculée À LA VOLÉE depuis un timestamp (state.trunkAt) → offline-safe sans tick
// ni hook dédié. Le débit et le plafond sont lus AU MOMENT du calcul : quand la
// ville franchit une ère, la caisse en cours profite du nouveau débit — borné par
// le plafond, donc au plus 30 min de recettes « rétroactives ». Pleine au départ
// (amorce : on joue dès le déblocage de la table) ; survit à l'effondrement comme
// la Faveur ; repart pleine au Grand Reset (defaultState). L'auto-relève
// (templeAutomation) appelle collectTrunk quand la caisse frôle le plafond.

import { state, save, render, isNotifyPaused, isOfflineSim } from '../state.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { recordOffering } from '../chronicleStats.js';
import { fmt } from '../utils.js';
import { tr } from '../i18n.js';
import { recettesPerSecond, caisseCap, CAISSE_INITIAL } from './maisonTable.js';
import { affluenceEntre } from './affluence.js';

// Contenu courant de la caisse (Faveur, fractionnaire). Une save d'avant le tronc
// (trunkFaveur absent) la découvre PLEINE — l'amorce vaut aussi pour les
// migrations.
export function trunkValue(now = Date.now()) {
  const cap = caisseCap();
  // Jamais relevée (trunkAt = 0 : partie neuve, Grand Reset) : PLEINE au plafond du
  // moment. Avant le lot 1, l'amorce (60) valait le plafond ; depuis que le plafond
  // suit l'ère record, une caisse jamais relevée restait figée à 60 sous un plafond
  // de 190 — et l'auto-relève, qui attend le plafond, ne la relevait jamais.
  if (!(Number.isFinite(state.trunkAt) && state.trunkAt > 0)) return cap;
  const base = Number.isFinite(state.trunkFaveur) ? state.trunkFaveur : CAISSE_INITIAL;
  // La salle pleine (spectacle, Nuit du Grand Jeu — affluence.js) remplit plus vite.
  const elapsed = Math.max(0, (now - state.trunkAt) / 1000) + affluenceEntre(state.trunkAt, now);
  return Math.max(0, Math.min(cap, base + elapsed * recettesPerSecond()));
}

// FIGE la caisse : ce qu'elle contient devient sa base, l'horloge repart d'ici — sans
// rien relever. Avant de changer le débit (un spectacle, une Nuit), pour que le
// nouveau débit ne vaille que pour la suite.
export function figerCaisse(now = Date.now()) {
  if (!(Number.isFinite(state.trunkAt) && state.trunkAt > 0)) return;
  state.trunkFaveur = trunkValue(now);
  state.trunkAt = now;
}

// Le plafond courant (pour la jauge de l'UI et l'auto-relève).
export function trunkCap() {
  return caisseCap();
}

// Relève de la caisse : encaisse les Faveurs ENTIÈRES, laisse la fraction dedans
// (rien n'est perdu à l'arrondi). Retourne le gain (0 si rien à relever).
export function collectTrunk(options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { silent = false, render: doRender = true } = opts;
  const now = Date.now();
  const value = trunkValue(now);
  const gain = Math.floor(value);
  if (gain <= 0) return 0;
  state.faveur = Math.max(0, (state.faveur || 0) + gain);
  state.trunkFaveur = value - gain;
  state.trunkAt = now;
  // Registre de la Chronique : offrandes récoltées (et Faveur gagnée à vie).
  recordOffering(gain);
  // isNotifyPaused : l'auto-relève tourne aussi pendant la simulation hors-ligne
  // (C12) — sans ce garde, chaque relève virtuelle empilait un float, et le
  // retour d'une longue absence ouvrait sur une rafale de « +N faveur ».
  if (!silent && !isNotifyPaused()) pushOutcomeFloat({ label: tr({ fr: `🏺 +${fmt(gain)} faveur`, en: `🏺 +${fmt(gain)} favor` }), kind: "gain" });
  // La sim hors-ligne sauve UNE fois à la fin : un save() par relève sous
  // horloge virtuelle écrivait des dizaines d'états antidatés (miroir compris).
  if (!isOfflineSim()) save();
  if (doRender) render();
  return gain;
}
