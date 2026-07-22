"use strict";

// Pile du multiplicateur GLOBAL de production (ruines, institutions, infra, marché,
// réseau routier, grand-reset, ruines non dépensées, Sève de braise) et ses miroirs
// Decimal, plus le cap d'infrastructure du nomadisme. Niveau L1 du DAG : ne dépend
// que des feuilles (olympusProd) et de state/data/shared/balance. Les produits
// finaux conservent leur ORDRE exact pour préserver la parité bit-à-bit
// (cf. decimal.parity / economy.golden).
import { state, renderCache } from '../../state.js';
import { eraTier } from '../../../data/world.js';
import { Decimal, D, toNum } from '../../num.js';
import {
  RUIN_POWER_EXP,
  RUIN_POWER_COEF,
  RUIN_BRAISE_PER_NODE,
  RUIN_BRAISE_LOG_SPENT_COEF,
  VESTIGE_POWER_CAP,
  REGROWTH_RUSH_MS,
  ABYSS_DOGMA_THRESHOLD,
  ABYSS_DOGMA_PROD_BONUS,
  RECURRING_AGE_ERA_ANCHOR,
  grandResetProductionMult
} from '../../balance.js';
import {
  ICARE_CLIMB_PROD_MULT,
  ATRIDES_NEXT_RUN_PENALTY_MULT,
  ENEE_HERITAGE_DURATION_MS,
  ENEE_HERITAGE_BOOST_PER_COLLAPSE,
  ragnarokWinterMult,
  isMythEffectActive
} from '../../../data/myths.js';
import {
  has,
  ruinEffectSum,
  ruinEffectMultiplier,
  ownedRuinUpgradeCount,
  ruinSpentTotal,
  totalBuildingCount,
  crisisOpen
} from '../shared.js';
import { olympusAbyssProductionMultiplier } from './olympusProd.js';

export function ruinMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  const base = 1 + Math.pow(toNum(state.ruins), RUIN_POWER_EXP) * RUIN_POWER_COEF;
  return has("oral_tradition") ? 1 + (base - 1) * 1.2 : base;
}

// Miroir Decimal de ruinMultiplier, pour le chemin tardif où ruins^0.62
// déborde le float. Doit évoluer en parallèle de la version float.
export function ruinMultiplierDec() {
  if (isMythEffectActive("mythe_du_chaos")) return new Decimal(1);
  const base = D(state.ruins).pow(RUIN_POWER_EXP).mul(RUIN_POWER_COEF).add(1);
  return has("oral_tradition") ? base.sub(1).mul(1.2).add(1) : base;
}

// Sève de braise (refonte Arbre des Ruines) : le scaling méta ne vient plus des
// nœuds « +X % ressource » mais de l'arbre lui-même — chaque nœud allumé et
// chaque ruine dépensée chauffent la production globale. « Machine chronique »
// (capstone Mémoire, effectType braiseAmp) amplifie le bonus. Borné (≤ ~×10),
// nul sous Chaos (ruinEffects renvoie 0 nœud) → number sûr dans les deux chemins.
function braiseMultiplier() {
  const owned = ownedRuinUpgradeCount();
  if (owned <= 0) return 1;
  const bonus = owned * RUIN_BRAISE_PER_NODE
    + Math.log10(1 + ruinSpentTotal()) * RUIN_BRAISE_LOG_SPENT_COEF;
  return 1 + bonus * (1 + ruinEffectSum("braiseAmp"));
}

export function unspentRuinsPowerMultiplier() {
  return 1 + toNum(state.ruins) * ruinEffectSum("unspentRuinsPower");
}

export function unspentRuinsPowerMultiplierDec() {
  return D(state.ruins).mul(ruinEffectSum("unspentRuinsPower")).add(1);
}

function grandResetMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  return grandResetProductionMult(state.grandResetCount);
}

function marketMultiplier() {
  return 1 + state.buildings.bureaucracy * 0.08;
}

// Réseau routier : couverture (bâtiments-moteur reliés au réseau / total) → jusqu'à
// +10 % de production globale. La couverture est GÉOMÉTRIQUE (dépend des distances
// réelles → « 1 route achetée = 1 tuile de connecteur, du plus proche au plus loin »),
// donc calculée par la carte (connectBuildingsToNetwork) et déposée dans
// `state.roadCoverage` ; le sim ne fait que la lire (défaut 0 : pas encore calculée).
function roadNetworkMultiplier() {
  const cov = state.roadCoverage;
  const c = (typeof cov === "number" && cov > 0) ? Math.min(1, cov) : 0;
  // « Grand cadastre » (roadCapBonus) relève le plafond de +10 % à +15 %.
  return 1 + c * (0.10 + ruinEffectSum("roadCapBonus"));
}

// Multiplicateur d'infra : 1 + log10(infra+1)·0.018. La SORTIE est toujours petite,
// mais l'ENTRÉE (stock d'infra) peut franchir le plafond float — d'où deux sources
// de log (Math.log10 natif, ou Decimal.log10 au-delà). Seule la formule (et son
// coefficient, unique levier d'équilibrage) est partagée → un seul endroit à toucher.
// La version float garde VOLONTAIREMENT son débordement à Infinity quand l'infra
// dépasse le plafond : c'est ce qui bascule rates() sur le chemin Decimal.
function infraMultFromLog(log10) {
  return 1 + log10 * 0.018;
}

export function infraMultiplier() {
  return infraMultFromLog(Math.log10(toNum(state.infrastructure) + 1));
}

export function infraMultiplierDec() {
  return new Decimal(infraMultFromLog(D(state.infrastructure).add(1).log10()));
}

export function nomadInfrastructureCap() {
  if (!has("trait_nomadism")) return null;
  return D(state.population).mul(0.015)
    .add(D(state.knowledge).mul(0.003))
    .add(80 + totalBuildingCount() * 5)
    .mul(0.7);
}

export function enforceInfrastructureCap() {
  const cap = nomadInfrastructureCap();
  if (cap !== null) state.infrastructure = D(state.infrastructure).min(cap);
}

// Facteurs scalaires bornés du multiplicateur global, communs aux chemins float
// ET Decimal. Source unique : un futur modificateur de prod global ne s'ajoute
// qu'ICI (avant, le bloc était dupliqué entre globalMultiplier/globalMultiplierDec
// et un oubli côté Decimal créait une divergence silencieuse). Tous bornés (pas
// de débordement) → number. Les produits finaux conservent leur ordre exact pour
// préserver la parité bit-à-bit (cf. decimal.parity / economy.golden).
function globalScalarFactors() {
  // Ancré sur RECURRING_AGE_ERA_ANCHOR (34, longueur d'origine) et NON sur
  // eras.length : les ères transcendantes ajoutées paient en prod au lieu de
  // diluer l'incrément. Délié (pas de plafond) → tier > 34 continue de monter
  // linéairement. Calé sur eraTier (palier MAJEUR équivalent) et non l'index
  // brut : les ères « factices » ne gonflent pas le bonus. Identique bit-à-bit à
  // l'ancien pour bestEraIndex ≤ 34 (tier = index).
  const normalizedBestEraIndex = eraTier(state.bestEraIndex || 0) * (19 / RECURRING_AGE_ERA_ANCHOR);
  const recurringAgeBonus = has("recurring_ages") ? 1 + normalizedBestEraIndex * 0.035 : 1;
  // « Vol par paliers » (Mythe d'Icare) / « l'Aile » (son héritage) : ×2 par
  // altitude, cumulatif, SANS plafond — la contrepartie vit dans rates.js (la
  // Rupture grimpe plus vite par altitude) et dans le coût immédiat de chaque
  // montée (icareClimb). Remplace l'ancien ×100 subi et la Surchauffe.
  const icareAltitude   = (isMythEffectActive("mythe_d_icare") || state.icareHeritage) ? (state.icareAltitude || 0) : 0;
  const icareMult       = icareAltitude > 0 ? Math.pow(ICARE_CLIMB_PROD_MULT, icareAltitude) : 1;
  const elapsed = Date.now() - (state.cycleStartedAt || Date.now());
  const atridesMult = (isMythEffectActive("mythe_atrides") && elapsed < 120_000) ? 3 : 1;
  let pactMult = 1;
  if (state.atridesPactActive) {
    if (elapsed < 120_000) pactMult = 2.0;
    else if (crisisOpen()) pactMult = 0.5;
  }
  const nextRunPenaltyMult = state.atridesNextRunPenaltyActive ? ATRIDES_NEXT_RUN_PENALTY_MULT : 1;
  let eneeBoost = 1;
  if (state.eneeHeritage && elapsed < ENEE_HERITAGE_DURATION_MS) {
    eneeBoost = 1 + ENEE_HERITAGE_BOOST_PER_COLLAPSE * Math.min(10, state.eneeCollapseCount || 0);
  }
  // Facteurs de l'Arbre des Ruines refondu (tous bornés → un seul produit,
  // partagé bit-à-bit entre les chemins float et Decimal) :
  //   braise    — Sève de braise (scaling méta par nœud/ruines dépensées) ;
  //   vestiges  — Nécropole vivante (+2 %/vestige, cap VESTIGE_POWER_CAP) ;
  //   regrowth  — Cendres fertiles (×3 pendant les 3 premières minutes du cycle) ;
  //   abîme     — dogme Abîme assumé (+20 % tant que la Rupture ≥ 70 %).
  const vestigeMult = 1 + ruinEffectSum("vestigePower") * Math.min(VESTIGE_POWER_CAP, (state.vestiges || []).length);
  const rushSum = ruinEffectSum("regrowthRush");
  const regrowthMult = (rushSum > 0 && elapsed < REGROWTH_RUSH_MS) ? 1 + rushSum : 1;
  const abyssDogmaMult = (has("dogma_abime_assume") && (state.instability || 0) >= ABYSS_DOGMA_THRESHOLD)
    ? 1 + ABYSS_DOGMA_PROD_BONUS
    : 1;
  const braise = braiseMultiplier();
  const ruinTreeMult = braise * vestigeMult * regrowthMult * abyssDogmaMult;
  // « L'Hiver Fimbul » (Ragnarok) : dès 8 min, toute la production est gelée de
  // moitié — c'est la pression centrale du boss final (le revenu passif ne suffit
  // plus, il faut le Comptoir, les jeux du temple et les héritages).
  const fimbulMult = ragnarokWinterMult();
  return { recurringAgeBonus, icareMult, atridesMult, pactMult, nextRunPenaltyMult, eneeBoost, ruinTreeMult, fimbulMult };
}

export function globalMultiplier() {
  if (renderCache._frameGlobalMultVer === renderCache.frameVersion) return renderCache._frameGlobalMult;
  const { recurringAgeBonus, icareMult, atridesMult, pactMult, nextRunPenaltyMult, eneeBoost, ruinTreeMult, fimbulMult } = globalScalarFactors();
  renderCache._frameGlobalMult = ruinMultiplier() * marketMultiplier() * roadNetworkMultiplier() * infraMultiplier() * recurringAgeBonus * ruinEffectMultiplier("globalMult") * ruinTreeMult * unspentRuinsPowerMultiplier() * grandResetMultiplier() * icareMult * atridesMult * pactMult * nextRunPenaltyMult * eneeBoost * olympusAbyssProductionMultiplier() * fimbulMult;
  renderCache._frameGlobalMultVer = renderCache.frameVersion;
  return renderCache._frameGlobalMult;
}

// Miroir Decimal de globalMultiplier pour le chemin tardif (au-delà du float).
// Seuls ruinMultiplier et unspentRuinsPowerMultiplier peuvent déborder : ils
// ont leur variante Decimal, le reste est borné.
export function globalMultiplierDec() {
  if (renderCache._frameGlobalMultDecVer === renderCache.frameVersion) return renderCache._frameGlobalMultDec;
  const { recurringAgeBonus, icareMult, atridesMult, pactMult, nextRunPenaltyMult, eneeBoost, ruinTreeMult, fimbulMult } = globalScalarFactors();
  renderCache._frameGlobalMultDec = ruinMultiplierDec()
    .mul(unspentRuinsPowerMultiplierDec())
    .mul(infraMultiplierDec())
    .mul(marketMultiplier() * roadNetworkMultiplier() * recurringAgeBonus * ruinEffectMultiplier("globalMult") * ruinTreeMult * grandResetMultiplier() * icareMult * atridesMult * pactMult * nextRunPenaltyMult * eneeBoost * olympusAbyssProductionMultiplier() * fimbulMult);
  renderCache._frameGlobalMultDecVer = renderCache.frameVersion;
  return renderCache._frameGlobalMultDec;
}
