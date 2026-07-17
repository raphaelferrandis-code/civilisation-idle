"use strict";

// Le TRONC DES OFFRANDES — la source de Faveur HORS jeux (2026-07-16) : les
// habitants déposent des oboles en continu (TRUNK_RATE_PER_S), le tronc
// PLAFONNE à TRUNK_CAP (l'AFK ne farme pas) et se relève d'un clic. C'est lui
// qui finance les mises des osselets (monnaie fermée, cf. augures.js) — et le
// filet anti-ruine : à sec, il regoutte toujours.
// Calculé À LA VOLÉE depuis un timestamp (state.trunkAt) → offline-safe sans
// tick ni hook dédié. Plein au départ (amorce : on joue dès le déblocage de la
// table) ; survit à l'effondrement comme la Faveur ; repart plein au Grand
// Reset (defaultState). L'auto-relève (templeAutomation) appelle collectTrunk
// quand le tronc frôle le plafond.

import { state, save, render } from '../state.js';
import { TRUNK_RATE_PER_S, TRUNK_CAP } from '../balance.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';

// Contenu courant du tronc (Faveur, fractionnaire). Une save d'avant le tronc
// (trunkFaveur absent) le découvre PLEIN — l'amorce vaut aussi pour les
// migrations.
export function trunkValue(now = Date.now()) {
  const base = Number.isFinite(state.trunkFaveur) ? state.trunkFaveur : TRUNK_CAP;
  const at = Number.isFinite(state.trunkAt) && state.trunkAt > 0 ? state.trunkAt : now;
  const elapsed = Math.max(0, (now - at) / 1000);
  return Math.max(0, Math.min(TRUNK_CAP, base + elapsed * TRUNK_RATE_PER_S));
}

// Relève du tronc : encaisse les Faveurs ENTIÈRES, laisse la fraction dedans
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
  if (!silent) pushOutcomeFloat({ label: `🏺 +${gain} faveur`, kind: "gain" });
  save();
  if (doRender) render();
  return gain;
}
