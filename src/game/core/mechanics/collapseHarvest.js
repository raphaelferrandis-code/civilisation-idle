"use strict";

// Moisson VERSÉE à la chute (audit du 05/10, BUG-33) : ruinGain × Rite de
// Passage × legs d'épitaphe × vœu du cycle. Source UNIQUE des chemins de chute
// (stèle, Édit ou testament, farm hors ligne) : la composition était recopiée
// à quatre endroits (events.js ×3, main.js). Le bonus Apocalypse de l'Olympe
// s'ajoute ENSUITE, dans completeCollapse : il dépend du chemin (manuel) et de
// l'instant de la chute, et il a sa propre ligne de chronique.
//
// Hors du baril mechanics, comme purchaseEta : vows.js remonte jusqu'à
// actions/utils.js, qui importe le baril — l'y exporter fermerait un cycle.
import { state } from '../state.js';
import { D } from '../num.js';
import { has } from './shared.js';
import { epitaphRuinMultiplier, epitaphLegacyById } from '../../data/epitaphs.js';
import { cycleVowRuinMult } from '../../data/vows.js';

// « Rite de Passage » (nœud rituel_effondrement) : +25 % de Ruines à la chute.
export const RITE_RUIN_MULT = 1.25;

// Moisson après le rite, AVANT legs et vœu. `gain` vient de ruinGain() (entier
// ≥ 0) : le floor/max ne change rien à ce chemin, il ne sert qu'à borner.
export function collapseHarvestBase(gain) {
  return D(gain).floor().max(0).mul(has("rituel_effondrement") ? RITE_RUIN_MULT : 1).round();
}

// Moisson versée pour un legs donné (null = sans legs) et la cause de la chute
// (affinité du legs). Lit le vœu COURANT : à appeler avant completeCollapse,
// qui remet le vœu à zéro.
export function collapseHarvest(gain, legacy, cause) {
  return collapseHarvestBase(gain)
    .mul(epitaphRuinMultiplier(legacy, cause))
    .mul(cycleVowRuinMult(state))
    .round();
}

// Legs que la PROCHAINE chute appliquera : le testament gravé, sinon la
// dernière volonté — ce que runCollapseSequence retient sur le chemin de
// l'Édit. Sans testament, la stèle laissera choisir un autre legs : le chiffre
// affiché peut alors changer au moment de graver.
export function projectedCollapseLegacy() {
  return epitaphLegacyById(state.testamentLegacyId) || epitaphLegacyById(state.nextEpitaphLegacy?.id);
}

// Moisson AFFICHÉE avant la chute (autel, jauge de la Cité, Bilan ; décision de
// Raph sur BUG-33 : A) : la même composition que la moisson versée, legs
// projeté compris, et non plus le ruinGain brut (jusqu'à ×2,1 d'écart). Le
// bonus Apocalypse de l'Olympe reste hors du chiffre : chute manuelle rapide
// seulement, il a sa propre ligne de chronique. `cause` : collapseCause()
// (events.js, que ce module ne peut pas importer sans cycle).
export function projectedCollapseHarvest(gain, cause) {
  return collapseHarvest(gain, projectedCollapseLegacy(), cause);
}
