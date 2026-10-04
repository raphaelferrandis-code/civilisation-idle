"use strict";

// La Boutique de Faveur — dépenser la FAVEUR gagnée aux tables de la Maison.
//   • Bénédiction : bonus TEMPORAIRE de production (multiplicateur global N s), au
//     prix de 30 min de recettes de la Maison (actions/maisonTable.js).
//   • Stylet du sacristain : augment de GESTE au gratteux (rayon du grattoir).
//   • Artefacts (refontes de risque, automatisations, reliques) : buyTempleArtifact.
// Lot 1 des gains « vrai casino » (2026-10-04) : les dés pipés, les ailes cirées,
// les planches du graveur et les Coffres ont disparu — ils achetaient des CHANCES
// (ou une imprimante). La Faveur dépensée a été remboursée (migration 4 → 5,
// state.js). Effets lus par la production (crisisProductionMultiplier).

import { state, save, render } from '../state.js';
import {
  STYLET_MAX_LEVEL,
  STYLET_COST_BASE,
  STYLET_COST_GROWTH,
  RELIC_CORNE_PROD_MULT,
  RELIC_OEIL_PROD_MULT,
  BLESSING_MULT,
  BLESSING_DURATION_S,
  RELIC_STEP_PROD_MULT
} from '../balance.js';
import { chronicle } from './utils.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { ARTIFACT_NODES } from '../../data/artifacts.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { blessingCost } from './maisonTable.js';
import { recordShopSpend } from '../chronicleStats.js';

// Coût du PROCHAIN niveau d'un augment à niveaux (croissant). Arrondi.
function tierCost(base, growth, level) {
  return Math.round(base * Math.pow(growth, level));
}

// LES RELIQUES (le trésor, 2026-07-17) : le multiplicateur de PRODUCTION global
// des objets légendaires — le but final des tables (arbitrage Raphaël : les jeux
// financent la cité). Multiplicatif : Corne ×2 puis Œil ×4 → ×8. Le Char, lui,
// rend la Bénédiction PERMANENTE (cf. blessingMultiplier). Lu par la production
// aux côtés de blessingMultiplier.
// Lot 3 : la Lyre, le Miroir, la Toison et la Pomme ajoutent chacune ×1,25.
export function templeRelicProdMult() {
  let mult = 1;
  if (hasTempleArtifact("corne")) mult *= RELIC_CORNE_PROD_MULT;
  if (hasTempleArtifact("oeil")) mult *= RELIC_OEIL_PROD_MULT;
  for (const id of ["lyre", "miroir", "toison", "pomme"]) {
    if (hasTempleArtifact(id)) mult *= RELIC_STEP_PROD_MULT;
  }
  return mult;
}

// Multiplicateur de Bénédiction actif (1 hors bénédiction) — lu par la
// production (crisisProductionMultiplier). Expire tout seul (Date.now()).
// LE CHAR DU SOLEIL (relique) la rend PERMANENTE : plus rien n'expire.
export function blessingMultiplier() {
  if (hasTempleArtifact("char")) return Math.max(BLESSING_MULT, (state.blessingUntil || 0) > Date.now() ? (state.blessingMult || 1) : 1);
  return (state.blessingUntil || 0) > Date.now() ? (state.blessingMult || 1) : 1;
}

// Descripteurs pour l'UI : { id, kind, cost, canAfford, active?, endsAt? }.
export function faveurShopItems() {
  const faveur = state.faveur || 0;
  const cost = blessingCost();
  return [
    {
      id: "blessing", kind: "blessing", cost,
      canAfford: faveur >= cost,
      active: (state.blessingUntil || 0) > Date.now(),
      endsAt: state.blessingUntil || 0
    }
  ];
}

// Achat d'un item (bénédiction, ou un rang d'augment à niveaux de l'arbre).
// Retourne true si l'achat a eu lieu.
export function buyFaveurItem(id) {
  const faveur = state.faveur || 0;
  if (id === "stylet") {
    if ((state.styletLevel || 0) >= STYLET_MAX_LEVEL) return false;
    const cost = tierCost(STYLET_COST_BASE, STYLET_COST_GROWTH, state.styletLevel || 0);
    if (faveur < cost) return false;
    state.faveur = faveur - cost;
    state.styletLevel = (state.styletLevel || 0) + 1;
    pushOutcomeFloat({ label: `🎟️ Stylet niveau ${state.styletLevel}`, kind: "gain" });
    chronicle(`Un stylet mieux taillé pour racler le vernis : le grattage gagne en aisance (stylet, niveau ${state.styletLevel}).`);
  } else if (id === "blessing") {
    const cost = blessingCost();
    if (faveur < cost) return false;
    state.faveur = faveur - cost;
    // Cumul : une bénédiction en cours PROLONGE la durée (ne remplace pas).
    const base = Math.max(Date.now(), state.blessingUntil || 0);
    state.blessingUntil = base + BLESSING_DURATION_S * 1000;
    state.blessingMult = BLESSING_MULT;
    pushOutcomeFloat({ label: `🌾 Bénédiction : +${Math.round((BLESSING_MULT - 1) * 100)}% production`, kind: "gain" });
    chronicle(`Une bénédiction de la Maison se répand sur la cité : la production s'élève pour un temps (+${Math.round((BLESSING_MULT - 1) * 100)} %).`);
  } else {
    return false;
  }
  // Registre de la Chronique : Faveur dépensée à la Boutique (le débit exact de
  // la branche = solde avant − solde après ; toutes les branches décrémentent).
  recordShopSpend(faveur - (state.faveur || 0));
  save();
  render();
  return true;
}

// Achat d'un ARTEFACT booléen du Temple (osselet du noyé, plumes, ailes solaires,
// reliques…). La garde d'échelle (rang précédent acquis) est faite par
// buyArtifactNode (templeAutomation.js) ; ici on ne gère que le débit + le flag.
// Retourne true si l'achat a eu lieu.
export function buyTempleArtifact(id) {
  const node = ARTIFACT_NODES[id];
  if (!node || node.kind !== "artifact") return false;
  if (node.gift != null) return false; // cadeau de rang (lot 2) : la Maison l'offre, il ne se vend pas
  if (hasTempleArtifact(id)) return false; // déjà acquis
  const cost = node.cost || 0;
  const faveur = state.faveur || 0;
  if (faveur < cost) return false;
  state.faveur = faveur - cost;
  recordShopSpend(cost);
  if (!state.templeArtifacts) state.templeArtifacts = {};
  state.templeArtifacts[id] = true;
  const label = (node.label && node.label.fr) || id;
  pushOutcomeFloat({ label: `⚜️ ${label}`, kind: "gain" });
  chronicle(`La Maison s'enrichit d'un artefact : ${label}.`);
  save();
  render();
  return true;
}
