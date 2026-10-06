"use strict";

// LA TABLE DE LA MAISON — l'économie commune des jeux (lot 1 des gains « vrai
// casino », 2026-10-04, docs/PLAN-GAINS-CASINO.md).
//
// Les cotes ne bougent plus ; ce qui grandit, c'est la Maison :
//   - ses RECETTES (la caisse qu'on relève, ex-tronc des offrandes) suivent l'ère
//     record de la ville ;
//   - la LIMITE HAUTE des tables suit les recettes (15 min de recettes) ;
//   - le prix de la Bénédiction et le plafond de la cagnotte aussi.
// Le RANG (lot 2, actions/maisonRang.js) multiplie la limite haute par 10 à chaque
// titre ; la salle commune des automatisations et la rafle de la cagnotte restent
// à la limite de base.
//
// Module FEUILLE : n'importe que state, balance et les données d'ères — les
// moteurs de jeu, la cagnotte et la caisse l'importent sans cycle.

import { state } from '../state.js';
import { eras } from '../../data/world.js';
import {
  MAISON_RECETTES_BASE_H,
  MAISON_RECETTES_POP_REF,
  MAISON_RECETTES_EXP,
  CAISSE_CAP_H,
  CAISSE_INITIAL,
  TABLE_MAX_H,
  TABLE_MIN,
  BLESSING_COST_H,
  POT_CAP_MIN,
  POT_CAP_H,
  AUTO_STAKE_STEPS,
  MAISON_RANKS
} from '../balance.js';

// L'ère record de la ville (et non l'ère du moment) : un effondrement ne vide pas
// la salle ; le Grand Reset, si (bestEraIndex y retombe, comme la Faveur à zéro).
export function maisonEraIndex() {
  const i = Math.max(0, Math.floor(Number(state.bestEraIndex) || 0));
  return Math.min(eras.length - 1, i);
}

// log10 d'un seuil d'ère : number pour les premières ères, Decimal au-delà de 1e308
// (ères transcendantes). Jamais de coercition d'un Decimal (num.js la fait échouer
// exprès en dev).
function log10Of(v) {
  if (typeof v === "number") return v > 0 ? Math.log10(v) : 0;
  if (v && typeof v.log10 === "function") {
    const l = v.log10();
    return Number.isFinite(l) ? l : 0;
  }
  return 0;
}

// Recettes de la Maison, en Faveur par heure, pour une ère donnée (l'ère record par
// défaut) : 120/h à l'Ère II, ~×1,4 par ère (la population gagne ~×10 par ère).
export function recettesPerHour(eraIndex = maisonEraIndex()) {
  const era = eras[Math.max(0, Math.min(eras.length - 1, eraIndex))];
  const lg = log10Of(era && era.at) - Math.log10(MAISON_RECETTES_POP_REF);
  return MAISON_RECETTES_BASE_H * (lg > 0 ? Math.pow(10, MAISON_RECETTES_EXP * lg) : 1);
}

export function recettesPerSecond() {
  return recettesPerHour() / 3600;
}

// Plafond de la caisse : 30 min de recettes (60 à l'Ère II, comme l'ancien tronc).
export function caisseCap() {
  return Math.max(CAISSE_INITIAL, Math.round(recettesPerHour() * CAISSE_CAP_H));
}
export { CAISSE_INITIAL };

// Deux chiffres significatifs, vers le bas : une limite se lit « 15 000 », pas
// « 15 469 ».
function twoSignificant(x) {
  if (!(x >= 100)) return Math.floor(x);
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.floor(x / p) * p;
}

// Le RANG atteint (index dans MAISON_RANKS) : il ne redescend jamais. Lu ici (et non
// dans maisonRang.js) pour que les limites restent un module feuille.
export function maisonRank() {
  const r = Math.floor(Number(state.maisonRank) || 0);
  return Math.max(0, Math.min(MAISON_RANKS.length - 1, r));
}
function rankMult() {
  return MAISON_RANKS[maisonRank()].mult;
}

// Les limites de la table : { min, max, base } en Faveur. Toutes les tables de la
// Maison partagent la même. `base` = la salle commune (15 min de recettes) ; `max` =
// celle que le rang ouvre (base × 10 par titre).
export function tableLimits() {
  const base = Math.max(TABLE_MIN, twoSignificant(recettesPerHour() * TABLE_MAX_H));
  return { min: TABLE_MIN, max: base * rankMult(), base };
}

// Ramène une mise demandée dans les limites : entière, au plus la limite haute.
// Rend 0 si elle est sous la limite basse (ou invalide) : la partie est refusée.
export function clampStake(amount) {
  const { min, max } = tableLimits();
  const a = Math.floor(Number(amount));
  if (!Number.isFinite(a) || a < min) return 0;
  return Math.min(max, a);
}

// La mise d'une automatisation : une part de la limite de la SALLE COMMUNE (cadran
// min/¼/½/max) — le rang ouvre les grandes tables à la main, pas aux automates.
export function autoStake(step) {
  const { min, base } = tableLimits();
  const frac = AUTO_STAKE_STEPS[step] ?? 0;
  return Math.max(min, Math.floor(base * frac));
}

// Bénédiction : 30 min de recettes.
export function blessingCost() {
  return Math.max(1, Math.round(recettesPerHour() * BLESSING_COST_H));
}

// Plafond de la cagnotte : 24 h de recettes, jamais sous l'ancien plafond fixe.
export function potCap() {
  return Math.max(POT_CAP_MIN, recettesPerHour() * POT_CAP_H);
}

// ── Les jetons ─────────────────────────────────────────────────────────────────
// La série des casinos : 1, 5, 25, 100, 500, 2 500, 10 000… soit {1, 5, 25} × 100^k.
export function chipValueAt(i) {
  const k = Math.floor(i / 3);
  return [1, 5, 25][((i % 3) + 3) % 3] * Math.pow(100, k);
}

// Le rang d'une valeur dans la série (la couleur du jeton en dépend), ou -1.
export function chipIndexOf(value) {
  if (!(value >= 1)) return -1;
  for (let i = 0; i < 2000; i += 1) {
    const v = chipValueAt(i);
    if (v === value) return i;
    if (v > value) return -1;
  }
  return -1;
}

// Le râtelier : les `count` plus gros jetons qui tiennent sous la limite haute.
export function chipRack(max = tableLimits().max, count = 5) {
  let i = 0;
  while (i < 2000 && chipValueAt(i + 1) <= max) i += 1;
  const out = [];
  for (let j = Math.max(0, i - count + 1); j <= i; j += 1) out.push(chipValueAt(j));
  return out;
}

// La pile posée sur le tapis : la mise décomposée en jetons du râtelier, du plus gros
// au plus petit (pour la dessiner). Bornée : au-delà de `limit` jetons, la pile est
// tronquée (le montant, lui, reste exact).
export function chipPile(amount, rack = chipRack(), limit = 14) {
  const pile = [];
  let rest = Math.floor(Number(amount) || 0);
  const vals = rack.slice().sort((a, b) => b - a);
  for (const v of vals) {
    while (rest >= v && pile.length < limit) { pile.push(v); rest -= v; }
  }
  return pile;
}
