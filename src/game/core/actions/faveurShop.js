"use strict";

// La Boutique de Faveur (couche 2) — dépenser la FAVEUR gagnée aux jeux.
//   • Dés pipés   : boost PERMANENT des chances aux osselets (state.diceLevel).
//   • Ailes cirées: abaisse PERMANENT l'edge du Vol d'Icare (state.wingLevel).
//   • Bénédiction : bonus TEMPORAIRE de production (multiplicateur global N s).
// Les deux boosters permanents justifient les odds volontairement bas en early
// game : on remonte ses chances en investissant. Effets lus par auguryBaseOdds
// (odds osselets), launchIcarus (edge) et crisisProductionMultiplier (prod).

import { state, save, render } from '../state.js';
import {
  DICE_BOOST_STEP,
  DICE_BOOST_MAX_LEVEL,
  DICE_COST_BASE,
  DICE_COST_GROWTH,
  WING_STEP,
  WING_MAX_LEVEL,
  WING_COST_BASE,
  WING_COST_GROWTH,
  STYLET_MAX_LEVEL,
  STYLET_COST_BASE,
  STYLET_COST_GROWTH,
  GRAVEUR_MAX_LEVEL,
  GRAVEUR_COST_BASE,
  GRAVEUR_COST_GROWTH,
  COFFRE_MAX_LEVEL,
  COFFRE_COST_BASE,
  COFFRE_COST_GROWTH,
  RELIC_CORNE_PROD_MULT,
  RELIC_OEIL_PROD_MULT,
  BLESSING_MULT,
  BLESSING_DURATION_S,
  BLESSING_COST
} from '../balance.js';
import { chronicle } from './utils.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { ARTIFACT_NODES } from '../../data/artifacts.js';
import { hasTempleArtifact } from './templeArtifacts.js';

// Coût du PROCHAIN niveau d'un booster (croissant). Arrondi.
function tierCost(base, growth, level) {
  return Math.round(base * Math.pow(growth, level));
}

// Multiplicateur de mise en clair (×10, ×100, ×1k…).
function fmtMult(m) {
  return m >= 1000 ? `${m / 1000}k` : String(m);
}

// LES RELIQUES (le trésor, 2026-07-17) : le multiplicateur de PRODUCTION global
// des objets légendaires — le but final de l'imprimante (arbitrage Raphaël : les
// jeux financent la cité). Multiplicatif : Corne ×2 puis Œil ×4 → ×8. Le Char,
// lui, rend la Bénédiction PERMANENTE (cf. blessingMultiplier). Lu par la
// production aux côtés de blessingMultiplier.
export function templeRelicProdMult() {
  let mult = 1;
  if (hasTempleArtifact("corne")) mult *= RELIC_CORNE_PROD_MULT;
  if (hasTempleArtifact("oeil")) mult *= RELIC_OEIL_PROD_MULT;
  return mult;
}

// Multiplicateur de Bénédiction actif (1 hors bénédiction) — lu par la
// production (crisisProductionMultiplier). Expire tout seul (Date.now()).
// LE CHAR DU SOLEIL (relique) la rend PERMANENTE : plus rien n'expire.
export function blessingMultiplier() {
  if (hasTempleArtifact("char")) return Math.max(BLESSING_MULT, (state.blessingUntil || 0) > Date.now() ? (state.blessingMult || 1) : 1);
  return (state.blessingUntil || 0) > Date.now() ? (state.blessingMult || 1) : 1;
}

// Bonus d'odds permanent des dés pipés (osselets).
export function diceOddsBonus() {
  return Math.min(DICE_BOOST_MAX_LEVEL, state.diceLevel || 0) * DICE_BOOST_STEP;
}

// Réduction permanente de l'edge d'Icare (ailes cirées).
export function wingEdgeReduction() {
  return Math.min(WING_MAX_LEVEL, state.wingLevel || 0) * WING_STEP;
}

// Descripteurs pour l'UI : { id, kind, level, maxLevel, maxed, cost, canAfford,
// active? (bénédiction) }.
export function faveurShopItems() {
  const faveur = state.faveur || 0;
  const diceLevel = state.diceLevel || 0;
  const wingLevel = state.wingLevel || 0;
  const diceCost = diceLevel >= DICE_BOOST_MAX_LEVEL ? null : tierCost(DICE_COST_BASE, DICE_COST_GROWTH, diceLevel);
  const wingCost = wingLevel >= WING_MAX_LEVEL ? null : tierCost(WING_COST_BASE, WING_COST_GROWTH, wingLevel);
  return [
    {
      id: "dice", kind: "dice", level: diceLevel, maxLevel: DICE_BOOST_MAX_LEVEL,
      maxed: diceLevel >= DICE_BOOST_MAX_LEVEL, cost: diceCost,
      canAfford: diceCost != null && faveur >= diceCost
    },
    {
      id: "wing", kind: "wing", level: wingLevel, maxLevel: WING_MAX_LEVEL,
      maxed: wingLevel >= WING_MAX_LEVEL, cost: wingCost,
      canAfford: wingCost != null && faveur >= wingCost
    },
    {
      id: "blessing", kind: "blessing", cost: BLESSING_COST,
      canAfford: faveur >= BLESSING_COST,
      active: (state.blessingUntil || 0) > Date.now(),
      endsAt: state.blessingUntil || 0
    }
  ];
}

// Achat d'un item. Retourne true si l'achat a eu lieu.
export function buyFaveurItem(id) {
  const faveur = state.faveur || 0;
  if (id === "dice") {
    if ((state.diceLevel || 0) >= DICE_BOOST_MAX_LEVEL) return false;
    const cost = tierCost(DICE_COST_BASE, DICE_COST_GROWTH, state.diceLevel || 0);
    if (faveur < cost) return false;
    state.faveur = faveur - cost;
    state.diceLevel = (state.diceLevel || 0) + 1;
    pushOutcomeFloat({ label: `🎲 Dés pipés niveau ${state.diceLevel}`, kind: "gain" });
    chronicle(`Le temple bénit de nouveaux osselets pipés : les augures deviennent un peu plus cléments (dés pipés, niveau ${state.diceLevel}).`);
  } else if (id === "wing") {
    if ((state.wingLevel || 0) >= WING_MAX_LEVEL) return false;
    const cost = tierCost(WING_COST_BASE, WING_COST_GROWTH, state.wingLevel || 0);
    if (faveur < cost) return false;
    state.faveur = faveur - cost;
    state.wingLevel = (state.wingLevel || 0) + 1;
    pushOutcomeFloat({ label: `🪽 Ailes cirées niveau ${state.wingLevel}`, kind: "gain" });
    chronicle(`De la cire plus fine est offerte à Icare : ses ailes tiennent plus longtemps face au soleil (ailes cirées, niveau ${state.wingLevel}).`);
  } else if (id === "stylet") {
    if ((state.styletLevel || 0) >= STYLET_MAX_LEVEL) return false;
    const cost = tierCost(STYLET_COST_BASE, STYLET_COST_GROWTH, state.styletLevel || 0);
    if (faveur < cost) return false;
    state.faveur = faveur - cost;
    state.styletLevel = (state.styletLevel || 0) + 1;
    pushOutcomeFloat({ label: `🎟️ Stylet niveau ${state.styletLevel}`, kind: "gain" });
    chronicle(`Un stylet mieux taillé pour racler le vernis : le grattage gagne en aisance (stylet, niveau ${state.styletLevel}).`);
  } else if (id === "coffre") {
    if ((state.coffreLevel || 0) >= COFFRE_MAX_LEVEL) return false;
    const cost = tierCost(COFFRE_COST_BASE, COFFRE_COST_GROWTH, state.coffreLevel || 0);
    if (faveur < cost) return false;
    state.faveur = faveur - cost;
    state.coffreLevel = (state.coffreLevel || 0) + 1;
    pushOutcomeFloat({ label: `🏺 Coffre du temple : mise ×${fmtMult(10 ** state.coffreLevel)}`, kind: "gain" });
    chronicle(`Le temple ouvre un coffre plus profond : les tables acceptent des mises dix fois plus lourdes (coffre, rang ${state.coffreLevel}).`);
  } else if (id === "graveur") {
    if ((state.graveurLevel || 0) >= GRAVEUR_MAX_LEVEL) return false;
    const cost = tierCost(GRAVEUR_COST_BASE, GRAVEUR_COST_GROWTH, state.graveurLevel || 0);
    if (faveur < cost) return false;
    state.faveur = faveur - cost;
    state.graveurLevel = (state.graveurLevel || 0) + 1;
    pushOutcomeFloat({ label: `🎟️ Planches du graveur niveau ${state.graveurLevel}`, kind: "gain" });
    chronicle(`Le graveur frappe des planches plus fines : les tickets gagnants se font moins rares (planches, niveau ${state.graveurLevel}).`);
  } else if (id === "blessing") {
    if (faveur < BLESSING_COST) return false;
    state.faveur = faveur - BLESSING_COST;
    // Cumul : une bénédiction en cours PROLONGE la durée (ne remplace pas).
    const base = Math.max(Date.now(), state.blessingUntil || 0);
    state.blessingUntil = base + BLESSING_DURATION_S * 1000;
    state.blessingMult = BLESSING_MULT;
    pushOutcomeFloat({ label: `🌾 Bénédiction : +${Math.round((BLESSING_MULT - 1) * 100)}% production`, kind: "gain" });
    chronicle(`Une bénédiction du temple se répand sur la cité : la production s'élève pour un temps (+${Math.round((BLESSING_MULT - 1) * 100)} %).`);
  } else {
    return false;
  }
  save();
  render();
  return true;
}

// Achat d'un ARTEFACT booléen du Temple (dé d'ivoire, osselet du noyé, plumes,
// ailes solaires — Phase 4). La garde d'échelle (rang précédent acquis) est faite
// par buyArtifactNode (templeAutomation.js) ; ici on ne gère que le débit + le flag.
// Retourne true si l'achat a eu lieu.
export function buyTempleArtifact(id) {
  const node = ARTIFACT_NODES[id];
  if (!node || node.kind !== "artifact") return false;
  if (hasTempleArtifact(id)) return false; // déjà acquis
  const cost = node.cost || 0;
  const faveur = state.faveur || 0;
  if (faveur < cost) return false;
  state.faveur = faveur - cost;
  if (!state.templeArtifacts) state.templeArtifacts = {};
  state.templeArtifacts[id] = true;
  const label = (node.label && node.label.fr) || id;
  pushOutcomeFloat({ label: `⚜️ ${label}`, kind: "gain" });
  chronicle(`Le temple s'enrichit d'un artefact : ${label}.`);
  save();
  render();
  return true;
}
