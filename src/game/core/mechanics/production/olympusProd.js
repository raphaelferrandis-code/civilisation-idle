"use strict";

// Multiplicateur de production « Abîme » du culte de l'Olympe.
//
// Extrait de actions/olympus.js (audit G‑18) : c'est un multiplicateur de
// PRODUCTION, donc sa place est côté mechanics/production. Sa présence dans
// actions/ forçait production.js à importer VERS LE HAUT (mechanics → actions),
// une inversion de couche / cycle ES latent. Ramené « chez lui » ici, la
// dépendance repart dans le bon sens : le baril production le consomme, actions
// n'a plus rien à exposer (le seul appelant était globalMultiplier).
//
// Feuille du DAG : dépend uniquement de state, shared et data/olympus — jamais
// d'actions. Les deux accesseurs (olympusState, cultAmpMult) sont des jumeaux
// volontairement locaux de ceux d'actions/olympus.js : 4 lignes de formule pure
// dupliquées valent mieux qu'une arête mechanics→actions ré-introduite.
import { state } from '../../state.js';
import { ruinEffectSum } from '../shared.js';
import { OLYMPUS_ABYSS_PROD_MAX, OLYMPUS_HIGH_RUPTURE, defaultOlympusState } from '../../../data/olympus.js';

function olympusState() {
  if (!state.olympus) state.olympus = defaultOlympusState();
  return state.olympus;
}

// « Autel du culte » (cultAmp) : effets du culte renforcés. ×1 sans le nœud.
function cultAmpMult() {
  return 1 + ruinEffectSum("cultAmp");
}

export function olympusAbyssProductionMultiplier() {
  const o = olympusState();
  if (o.unlockedProfile !== "abyss") return 1;
  const rupture = Math.max(0, state.instability || 0);
  if (rupture < OLYMPUS_HIGH_RUPTURE) return 1;
  const pressure = (rupture - OLYMPUS_HIGH_RUPTURE) / Math.max(0.01, 1 - OLYMPUS_HIGH_RUPTURE);
  const amp = cultAmpMult();
  return 1 + Math.min((OLYMPUS_ABYSS_PROD_MAX - 1) * amp, pressure * 0.35 * amp);
}
