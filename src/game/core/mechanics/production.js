"use strict";

// Pipeline de production : multiplicateurs (ruines/institution/infra/marché/global
// + miroirs Decimal), sommes de bâtiments, pression (Rupture), vitals, et rates().
// Plus gros sous-module mais cohésif : rates() consomme ~20 helpers locaux, les
// séparer créerait de lourds cross-imports. Dépend uniquement de shared.
import { state, renderCache, buildingById } from '../state.js';
import { buildings } from '../../data/buildings.js';
import { POLICY_BY_ID } from '../../data/regulationActions.js';
import { eraTier } from '../../data/world.js';
import { getCityMapEngineTileMap } from '../../map/cityMapBridge.js';
import { clamp01, clamp, fmt } from '../utils.js';
import { Decimal, D, toNum } from '../num.js';
import {
  RUIN_POWER_EXP,
  RUIN_POWER_COEF,
  LEGITIMACY_POWER_EXP,
  LEGITIMACY_COEF,
  FOUNDING_GRACE_BUILDINGS,
  RECURRING_AGE_ERA_ANCHOR,
  INFRA_COVERAGE_POP_FACTOR,
  INFRA_COVERAGE_BUILDING_FACTOR,
  INFRA_COVERAGE_MIN_BASE,
  INFRA_COVERAGE_EFFECTIVE_CAP,
  INFRA_COVERAGE_MITIGATION_MULT,
  MITIGATION_LOG_COEF,
  MITIGATION_CAP,
  STABILIZER_DIRECT_FACTOR,
  STRUCTURAL_COVERAGE_DAMP,
  COMPLEXITY_COVERAGE_ABSORB,
  FOYER_RELIEF_CAP,
  INEQUALITY_RESERVE_REF_S,
  INEQUALITY_RESERVE_SCALE_S,
  DEMESURE_FREE_LOG_POP,
  DEMESURE_COEF
} from '../balance.js';
import {
  ICARE_PROD_MULT,
  SURCHAUFFE_PROD_MULT,
  ICARE_RUPTURE_MULT,
  BABEL_RUPTURE_MULT,
  PROMETHEE_FOOD_MULT,
  BRAISIERS_DURATION_MS,
  BRAISIERS_FOOD_MULT,
  BABEL_PROD_BASE_MULT,
  BABEL_ADJ_BONUS,
  OR_POP_THRESHOLD,
  OR_POP_PENALTY_PCT,
  OR_POP_CAP,
  OR_POP_CAP_GROWTH,
  HEPH_INFRA_MULT_BASE,
  HEPH_INFRA_MULT_GROWTH,
  HEPH_POP_DECAY_START_MIN,
  HEPH_POP_PROD_MULT,
  OR_RUPTURE_CAP,
  ATLAS_LEGIT_MAX_REDUCTION,
  ATRIDES_NEXT_RUN_PENALTY_MULT,
  ENEE_HERITAGE_DURATION_MS,
  ENEE_HERITAGE_BOOST_PER_COLLAPSE,
  CADMOS_CYCLE_BONUS_PCT,
  CADMOS_EPITAPH_BONUS_PCT,
  isMythEffectActive
} from '../../data/myths.js';
import { ACTIVE_RUIN_GOLD_PROD_MULT, hasActiveRuin } from '../../data/activeRuins.js';
import { EPITAPH_LEGACY_DURATION_MS, epitaphLegacyById } from '../../data/epitaphs.js';
import { olympusAbyssProductionMultiplier } from '../actions/olympus.js';
import {
  has,
  hasDoctrine,
  ruinEffectSum,
  ruinEffectMultiplier,
  ownedRuinUpgradeCount,
  totalBuildingCount,
  crisisOpen
} from './shared.js';

// Invariant dev-only (coût nul en prod) : les ids lus en accès DIRECT plus bas
// (marketMultiplier → bureaucracy ; rates → markets, guilds) doivent exister.
// Un renommage silencieux donnerait state.buildings.<id> = undefined → NaN propagé
// dans toute la production (cf. revue 0.4 §1.2). Casse au chargement en DEV/test.
if (import.meta.env?.DEV) {
  for (const id of ["bureaucracy", "markets", "guilds"]) {
    if (!buildingById[id]) {
      throw new Error(`Bâtiment "${id}" introuvable : lu en direct par production.js (marketMultiplier/rates) → NaN si renommé.`);
    }
  }
}

export function ruinMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  const effectiveRuins = toNum(state.ruins) + toNum(state.chaosRuinsBonus || 0);
  const base = 1 + Math.pow(effectiveRuins, RUIN_POWER_EXP) * RUIN_POWER_COEF;
  return has("oral_tradition") ? 1 + (base - 1) * 1.2 : base;
}

// Miroir Decimal de ruinMultiplier, pour le chemin tardif où ruins^0.62
// déborde le float. Doit évoluer en parallèle de la version float.
export function ruinMultiplierDec() {
  if (isMythEffectActive("mythe_du_chaos")) return new Decimal(1);
  const effectiveRuins = D(state.ruins).add(state.chaosRuinsBonus || 0);
  const base = effectiveRuins.pow(RUIN_POWER_EXP).mul(RUIN_POWER_COEF).add(1);
  return has("oral_tradition") ? base.sub(1).mul(1.2).add(1) : base;
}

function chronicleEngineMultiplier() {
  if (!has("chronicle_engine")) return 1;
  const ownedBonus = ownedRuinUpgradeCount() * 0.03;
  // log10 Decimal : reste fini même quand les ruines dépassent le domaine float.
  const unspentBonus = D(state.ruins).add(1).log10() * 0.08;
  return 1 + ownedBonus + unspentBonus;
}

export function unspentRuinsPowerMultiplier() {
  return 1 + toNum(state.ruins) * ruinEffectSum("unspentRuinsPower");
}

export function unspentRuinsPowerMultiplierDec() {
  return D(state.ruins).mul(ruinEffectSum("unspentRuinsPower")).add(1);
}

// Multiplicateur d'institutions — BORNÉ : `legitimacy` est un number natif (jamais
// Decimal, toujours fini) et l'exposant 0.7 < 1, donc la version float ne déborde
// jamais. La variante Decimal n'est dès lors qu'un enveloppage au point d'usage
// (globalMultiplierDec) : une seule formule à maintenir, plus de paire en lockstep.
export function institutionMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  return 1 + Math.pow(state.legitimacy, LEGITIMACY_POWER_EXP) * LEGITIMACY_COEF;
}

export function institutionMultiplierDec() {
  return new Decimal(institutionMultiplier());
}

function grandResetMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  return Math.pow(2, state.grandResetCount || 0);
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
  return 1 + c * 0.10;
}

export function addProductionPenalty(type, amount) {
  let effectiveAmount = amount;
  // Héritage Atlas — Légitimité haute atténue les effets négatifs des crises
  if (state.atlasHeritage && (state.atlasLegitimite || 0) > 50) {
    const legBonus = ((state.atlasLegitimite || 50) - 50) / 50; // 0→1
    effectiveAmount *= (1 - legBonus * ATLAS_LEGIT_MAX_REDUCTION);
  }
  const current = state.crisisProduction[type] ?? 1;
  state.crisisProduction[type] = Math.max(0.1, current * (1 - effectiveAmount));
}

function crisisProductionMultiplier(type) {
  const global = state.crisisProduction.global ?? 1;
  return global * (state.crisisProduction[type] ?? 1) * policyProductionMultiplier(type);
}

// Levier C — coût de production CONTINU et RÉCUPÉRABLE des politiques actives
// (revient à 1 dès qu'on les désactive, contrairement à crisisProduction qui ne
// se rétablit jamais). Replié dans crisisProductionMultiplier → s'applique à
// toutes les ressources, chemins float et Decimal. Plancher 0.1 (max 90 % malus).
export function policyProductionMultiplier(type) {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 1;
  let m = 1;
  for (const id of policies) {
    const cost = POLICY_BY_ID[id]?.cost;
    if (!cost) continue;
    if (cost.global) m *= (1 - cost.global);
    if (cost[type]) m *= (1 - cost[type]);
  }
  return Math.max(0.1, m);
}

// Levier C — ralentissement de la MONTÉE de la Rupture par les politiques actives
// (ajouté à orderSlow dans tick.js, plafonné en commun à 0.8 → jamais un gel).
export function policyRiseSlow() {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.riseSlow || 0;
  return s;
}

// Levier C — atténuation de la SURCHARGE par les politiques actives (plafond 0.8).
// La surcharge accélère la montée quand la cible dépasse 100 % ; la réduire ne fait
// que gagner du temps (la cible ne bouge pas) → sûr.
export function policyOvershootDamp() {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.overshootDamp || 0;
  return Math.min(0.8, s);
}

// Levier C — étouffement CONTINU d'un foyer par les politiques actives (entre dans
// le plafond partagé foyerCut → jamais d'immortalité). Récupérable à l'extinction.
export function policyFoyerDamp(foyer) {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.foyerDamp?.[foyer] || 0;
  return s;
}

function theocracyKnowledgeRate() {
  return has("trait_theocracy") ? toNum(state.gold) * 0.01 : 0;
}

function ruptureGrowthMultiplier() {
  return has("trait_theocracy") ? 1.25 : 1;
}

export function amplifyRuptureFactor(factor) {
  if (factor <= 1 || !has("trait_theocracy")) return factor;
  return 1 + (factor - 1) * ruptureGrowthMultiplier();
}

function cadmosPermanentBonus(orientation) {
  return (state.cadmosPermanentEpitaphs || [])
    .filter((entry) => entry.orientation === orientation)
    .length * CADMOS_EPITAPH_BONUS_PCT;
}

function cadmosCycleBonus(orientation) {
  return isMythEffectActive("mythe_de_cadmos")
    ? (state.cadmosCycleBonuses?.[orientation] || 0) * CADMOS_CYCLE_BONUS_PCT
    : 0;
}

function cadmosProductionMultiplier(orientation) {
  return 1 + cadmosPermanentBonus(orientation) + cadmosCycleBonus(orientation);
}

function cadmosStabilityMultiplier() {
  const reduction = cadmosPermanentBonus("stability") + cadmosCycleBonus("stability");
  return Math.max(0.25, 1 - reduction);
}

export function activeEpitaphLegacy() {
  const active = state.activeEpitaphLegacy;
  const legacy = active ? epitaphLegacyById(active.id) : null;
  if (!legacy) return null;
  const startedAt = active.startedAt || state.cycleStartedAt || Date.now();
  const elapsed = Date.now() - startedAt;
  if (elapsed > EPITAPH_LEGACY_DURATION_MS) return null;
  return { ...active, definition: legacy, elapsed };
}

function epitaphLegacyEffect() {
  const active = activeEpitaphLegacy();
  if (!active) {
    return { globalMult: 1, foodMult: 1, goldMult: 1, knowledgeMult: 1, infraMult: 1, ruptureMult: 1 };
  }
  const { definition } = active;
  const effects = definition.effects || {};
  const favored = active.cause === definition.favoredCause;
  return {
    globalMult: effects.globalMult || 1,
    foodMult: favored && effects.foodMultFavored ? effects.foodMultFavored : (effects.foodMult || 1),
    goldMult: effects.goldMult || 1,
    knowledgeMult: favored && effects.knowledgeMultFavored ? effects.knowledgeMultFavored : (effects.knowledgeMult || 1),
    infraMult: effects.infraMult || 1,
    ruptureMult: favored && effects.ruptureMultFavored ? effects.ruptureMultFavored : (effects.ruptureMult || 1)
  };
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
  const icareMult       = isMythEffectActive("mythe_d_icare") ? ICARE_PROD_MULT : 1;
  const surchauffeMult  = (state.surchauffeEndTime && Date.now() < state.surchauffeEndTime) ? SURCHAUFFE_PROD_MULT : 1;
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
  return { recurringAgeBonus, icareMult, surchauffeMult, atridesMult, pactMult, nextRunPenaltyMult, eneeBoost };
}

export function globalMultiplier() {
  if (renderCache._frameGlobalMultVer === renderCache.frameVersion) return renderCache._frameGlobalMult;
  const { recurringAgeBonus, icareMult, surchauffeMult, atridesMult, pactMult, nextRunPenaltyMult, eneeBoost } = globalScalarFactors();
  renderCache._frameGlobalMult = ruinMultiplier() * institutionMultiplier() * marketMultiplier() * roadNetworkMultiplier() * infraMultiplier() * recurringAgeBonus * ruinEffectMultiplier("globalMult") * chronicleEngineMultiplier() * unspentRuinsPowerMultiplier() * grandResetMultiplier() * icareMult * surchauffeMult * atridesMult * pactMult * nextRunPenaltyMult * eneeBoost * olympusAbyssProductionMultiplier();
  renderCache._frameGlobalMultVer = renderCache.frameVersion;
  return renderCache._frameGlobalMult;
}

// Miroir Decimal de globalMultiplier pour le chemin tardif (au-delà du float).
// Seuls ruinMultiplier, institutionMultiplier et unspentRuinsPowerMultiplier
// peuvent déborder : ils ont leur variante Decimal, le reste est borné.
export function globalMultiplierDec() {
  if (renderCache._frameGlobalMultDecVer === renderCache.frameVersion) return renderCache._frameGlobalMultDec;
  const { recurringAgeBonus, icareMult, surchauffeMult, atridesMult, pactMult, nextRunPenaltyMult, eneeBoost } = globalScalarFactors();
  renderCache._frameGlobalMultDec = ruinMultiplierDec()
    .mul(institutionMultiplierDec())
    .mul(unspentRuinsPowerMultiplierDec())
    .mul(infraMultiplierDec())
    .mul(marketMultiplier() * roadNetworkMultiplier() * recurringAgeBonus * ruinEffectMultiplier("globalMult") * chronicleEngineMultiplier() * grandResetMultiplier() * icareMult * surchauffeMult * atridesMult * pactMult * nextRunPenaltyMult * eneeBoost * olympusAbyssProductionMultiplier());
  renderCache._frameGlobalMultDecVer = renderCache.frameVersion;
  return renderCache._frameGlobalMultDec;
}

function getBuildingSums() {
  if (renderCache._buildingSums) return renderCache._buildingSums;

  let positiveInstability = 0;
  let negativeInstability = 0;
  let buildingCount = 0;
  let stabilizerCount = 0; // bâtiments à instabilité négative (égouts, tribunaux…)
  const baseSumsByCategory = {};

  for (const b of buildings) {
    const count = state.buildings[b.id] || 0;
    buildingCount += count;

    if (b.instability > 0) {
      positiveInstability += b.instability * count;
    } else if (b.instability < 0) {
      negativeInstability += b.instability * count;
      stabilizerCount += count;
    }

    if (count > 0) {
      const synergy = buildingOutputMultiplier(b, count);
      const cat = b.category || "other";
      if (!baseSumsByCategory[cat]) {
        baseSumsByCategory[cat] = { pop: 0, food: 0, gold: 0, knowledge: 0, infra: 0 };
      }
      baseSumsByCategory[cat].pop += (b.pop || 0) * count * synergy;
      baseSumsByCategory[cat].food += (b.food || 0) * count * synergy;
      baseSumsByCategory[cat].gold += (b.gold || 0) * count * synergy;
      baseSumsByCategory[cat].knowledge += (b.knowledge || 0) * count * synergy;
      baseSumsByCategory[cat].infra += (b.infra || 0) * count * synergy;
    }
  }

  // Détection de débordement float : très tard, les synergies exponentielles
  // (1.025^count * 2^paliers) dépassent 1.8e308. On rebascule alors les sommes
  // en Decimal — rates() suivra le chemin Decimal.
  let overflow = false;
  for (const catSums of Object.values(baseSumsByCategory)) {
    if (!Number.isFinite(catSums.pop + catSums.food + catSums.gold + catSums.knowledge + catSums.infra)) {
      overflow = true;
      break;
    }
  }
  if (overflow) {
    for (const b of buildings) {
      const count = state.buildings[b.id] || 0;
      if (count <= 0) continue;
      const cat = b.category || "other";
      const catSums = baseSumsByCategory[cat];
      if (!(catSums.pop instanceof Decimal)) {
        baseSumsByCategory[cat] = { pop: D(0), food: D(0), gold: D(0), knowledge: D(0), infra: D(0) };
      }
      const target = baseSumsByCategory[cat];
      const synergy = buildingOutputMultiplierDec(b, count);
      target.pop = target.pop.add(synergy.mul((b.pop || 0) * count));
      target.food = target.food.add(synergy.mul((b.food || 0) * count));
      target.gold = target.gold.add(synergy.mul((b.gold || 0) * count));
      target.knowledge = target.knowledge.add(synergy.mul((b.knowledge || 0) * count));
      target.infra = target.infra.add(synergy.mul((b.infra || 0) * count));
    }
  }

  renderCache._buildingSums = {
    positiveInstability,
    negativeInstability,
    buildingCount,
    stabilizerCount,
    baseSumsByCategory,
    overflow
  };
  return renderCache._buildingSums;
}

// Cible de Rupture (instabilité) décomposée en sources additives, chacune bornée
// individuellement avant sommation :
//   - scarcity    : pénurie alimentaire face à la population
//   - inequality  : inégalité de richesse (or)
//   - complexity  : complexité administrative (bâtiments/savoir)
//   - dissent     : dissidence/légitimité insuffisante
//   - structural  : instabilité intrinsèque des bâtiments, portée par l'infra
//     et réduite en prise directe par les bâtiments stabilisants
// De cette somme on retranche la mitigation (couverture d'infrastructure en
// RATIO + légitimité, ruines, grâces de fondation/installation). Complexity,
// inequality et structural utilisent des plafonds DOUX (cap·x/(x+cap)) : la
// jauge reste sensible aux achats à toutes les échelles. Les constantes nues
// ci-dessous (0.55, 0.34, 0.22, 2.2, …) sont des poids/plafonds locaux non
// extraits ; les leviers d'équilibrage sont dans balance.js.
// Déficit de nourriture instantané (0..1) — entrée brute du foyer Subsistance.
// Lissé par EMA dans tick.js (state.scarcityRawEase) pour réduire la volatilité.
export function scarcityRawInstant() {
  const popF = toNum(state.population);
  const foodF = toNum(state.food);
  const population = Math.max(1, popF);
  if (Number.isFinite(popF) && Number.isFinite(foodF)) {
    return Math.max(0, (population * 2.4 - foodF) / Math.max(120, population * 2.4));
  }
  const popDec = D(state.population).max(1);
  return Math.max(0, popDec.mul(2.4).sub(state.food).div(popDec.mul(2.4).max(120)).toNumber());
}

export function pressureBreakdown() {
  // Retourne le cache frame s'il a été calculé sur la frame courante (cf. bumpFrame).
  if (renderCache._framePressureVer === renderCache.frameVersion) return renderCache._framePressure;
  const popF = toNum(state.population);
  const foodF = toNum(state.food);
  const goldF = toNum(state.gold);
  const knowF = toNum(state.knowledge);
  const infraF = toNum(state.infrastructure);
  const population = Math.max(1, popF);

  const sums = getBuildingSums();
  const positiveInstability = sums.positiveInstability;
  const negativeInstability = sums.negativeInstability;
  const buildingCount = sums.buildingCount;
  // Les bâtiments stabilisants SONT de l'infrastructure : ils ne comptent ni
  // dans la demande de couverture, ni dans la charge administrative — sinon
  // acheter un égout AUGMENTERAIT paradoxalement la pression (mesuré : +0.116).
  const riskyBuildingCount = Math.max(0, buildingCount - (sums.stabilizerCount || 0));

  const cycleAgeSeconds = Math.max(0, (Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
  // Terme bâtiments : décroissance quadratique sur une portée étendue — la
  // protection s'efface progressivement au lieu de tomber en mur à 65 bâtiments.
  const foundingGrace = Math.max(0, 1 - Math.min(1, state.cycles / 12))
    * Math.max(0, 1 - Math.min(1, population / 450000))
    * Math.pow(Math.max(0, 1 - Math.min(1, buildingCount / FOUNDING_GRACE_BUILDINGS)), 2)
    * 0.34;
  const settlingGrace = Math.max(0, 1 - Math.min(1, cycleAgeSeconds / 420))
    * Math.max(0, 1 - Math.min(1, state.cycles / 10))
    * 0.18;

  // Couverture d'infrastructure : infra jugée RELATIVEMENT à la taille de la
  // cité (≈1 = bien équipée), comme la nourriture l'est face à la population.
  // C'est ce ratio — discriminant à toutes les échelles — qui donne à l'infra
  // ses trois canaux anti-Rupture (mitigation, structural, complexity).
  let scarcityRaw, inequalityRaw, knowledgeStrain, infraCoverage;
  const coverageDemandBase = Math.max(INFRA_COVERAGE_MIN_BASE, riskyBuildingCount * INFRA_COVERAGE_BUILDING_FACTOR);
  if (Number.isFinite(popF) && Number.isFinite(foodF) && Number.isFinite(goldF) && Number.isFinite(knowF) && Number.isFinite(infraF)) {
    // Chemin float.
    scarcityRaw = Math.max(0, (population * 2.4 - foodF) / Math.max(120, population * 2.4));
    inequalityRaw = Math.max(0, goldF / Math.max(80, population * 1.25) - 0.55);
    knowledgeStrain = knowF / Math.max(180, infraF * 38 + 180);
    infraCoverage = infraF / Math.max(coverageDemandBase, population * INFRA_COVERAGE_POP_FACTOR);
  } else {
    // Au-delà du float : mêmes formules en ratios Decimal (les sorties restent bornées).
    const popDec = D(state.population).max(1);
    scarcityRaw = Math.max(0, popDec.mul(2.4).sub(state.food).div(popDec.mul(2.4).max(120)).toNumber());
    inequalityRaw = Math.max(0, D(state.gold).div(popDec.mul(1.25).max(80)).toNumber() - 0.55);
    knowledgeStrain = D(state.knowledge).div(D(state.infrastructure).mul(38).add(180).max(180)).toNumber();
    infraCoverage = D(state.infrastructure).div(popDec.mul(INFRA_COVERAGE_POP_FACTOR).max(coverageDemandBase)).toNumber();
  }
  if (!Number.isFinite(infraCoverage)) infraCoverage = 1e6; // infra >> pop au-delà du float

  // Plafond doux (Michaelis-Menten) : approche le plafond sans jamais l'atteindre
  // → la dérivée n'est jamais nulle, chaque achat garde un effet mesurable.
  const softCap = (x, cap) => (x <= 0 ? 0 : cap * x / (x + cap));

  // Couverture EFFECTIVE plafonnée en doux : le stock d'infra (jamais consommé)
  // finit toujours par dépasser la demande sur un long cycle — sans ce plafond,
  // l'accumulation passive tue la Rupture (couverture 16 mesurée, cible 0.15).
  const effCoverage = softCap(infraCoverage, INFRA_COVERAGE_EFFECTIVE_CAP);
  const complexityRaw = Math.max(
    0,
    riskyBuildingCount / (26 * (1 + effCoverage * COMPLEXITY_COVERAGE_ABSORB)) + knowledgeStrain - 0.35
  );
  const dissentRaw = Math.max(0, state.cycles * 0.035 + Math.log10(toNum(state.ruins) + 1) * 0.04 + state.instability * 0.12);

  // Étape 2 : relief temporaire par foyer (multiplicatif, décroît dans le tick).
  // Chaque action de régulation calme SON foyer → la barre descend en prise
  // directe. `rationRelief` (ancien, propre à Rationner) est désormais unifié
  // dans fr.scarcity. Plafonné < 1 (cf. FOYER_RELIEF_CAP) : un foyer n'est jamais
  // annulé, donc tenir la jauge reste un délai et non une immortalité.
  const fr = state.foyerRelief || {};
  const rf = state.foyerReform || {};
  // Réduction d'un foyer = apaisement temporaire (fr, décline) + réforme durable
  // (rf, permanente), PLAFONNÉE en commun à FOYER_RELIEF_CAP. Le plafond partagé
  // garantit l'invariant anti-immortalité : la réforme rend le recul durable,
  // sans jamais dépasser le maximum déjà atteignable par l'apaisement (cf.
  // FOYER_REFORM dans balance.js, mesuré par measure-foyers.js).
  const foyerCut = (key) => Math.min(FOYER_RELIEF_CAP, (fr[key] || 0) + (rf[key] || 0) + policyFoyerDamp(key));
  // Subsistance lissée : utilise l'EMA (state.scarcityRawEase) si initialisée,
  // sinon l'instantané (repli — golden master inchangé tant que l'EMA est null).
  const scarcityRawUsed = state.scarcityRawEase != null ? state.scarcityRawEase : scarcityRaw;
  const scarcity = Math.max(0, Math.min(0.7, scarcityRawUsed * 0.55)) * (1 - foyerCut("scarcity"));
  // Inégalités ancrées sur la RÉSERVE D'OR en secondes de revenu (state.goldReserveEase,
  // lissée dans le tick) : stable à toute échelle, et la dépense la fait baisser
  // durablement. Repli sur l'ancienne formule gold/pop quand l'EMA n'est pas
  // initialisée → golden master inchangé. (cf. INEQUALITY_RESERVE_* dans balance.js)
  const inequalityArg = state.goldReserveEase != null
    ? Math.max(0, (state.goldReserveEase - INEQUALITY_RESERVE_REF_S) / INEQUALITY_RESERVE_SCALE_S) * 0.28
    : inequalityRaw * 0.28 + (state.buildings.markets || 0) * 0.006 + (state.buildings.guilds || 0) * 0.008;
  const inequality = softCap(inequalityArg, 0.55) * (1 - foyerCut("inequality"));
  const complexity = softCap(complexityRaw * 0.34, 0.75) * (1 - foyerCut("complexity"));
  const dissentRelief = has("ruin_liturgy") ? 0.035 + Math.min(0.06, toNum(state.ruins) * 0.0007) : 0;
  const dissent = Math.max(0, Math.min(0.55, dissentRaw * 0.22) - dissentRelief) * (1 - foyerCut("dissent"));
  // Charge structurelle : les bâtiments stabilisants (instabilité négative)
  // soustraient en PRISE DIRECTE, et l'infrastructure « porte » la charge.
  const structuralNet = Math.max(0, positiveInstability + negativeInstability * STABILIZER_DIRECT_FACTOR);
  const structural = softCap(structuralNet * 2.2 / (1 + effCoverage * STRUCTURAL_COVERAGE_DAMP), 0.75);
  const institutionalLog = Math.log10(1 + effCoverage * INFRA_COVERAGE_MITIGATION_MULT + state.legitimacy * 0.16);
  const mitigation = Math.min(MITIGATION_CAP, institutionalLog * MITIGATION_LOG_COEF + ruinEffectSum("stability") + foundingGrace + settlingGrace);
  // A1 — Démesure (hubris d'échelle) : socle d'instabilité NON mitigé qui croît
  // avec la taille de la cité. Ajouté APRÈS la mitigation (la couverture d'infra
  // et la légitimité ne peuvent pas l'effacer) et sans plafond : au-delà de
  // DEMESURE_FREE_LOG_POP décades d'habitants, « tout acheter » ne stabilise plus
  // — la grandeur elle-même engendre une tension irréductible. Sûr au-delà du
  // float (log10 Decimal reste fini). Reste à 0 sous le seuil → early game intact.
  const popLog = Number.isFinite(popF) ? Math.log10(Math.max(10, popF)) : D(state.population).max(10).log10();
  const demesure = Math.max(0, (popLog - DEMESURE_FREE_LOG_POP) * DEMESURE_COEF);
  const baseTotal = Math.max(0, (scarcity + inequality + complexity + dissent + structural + ruinEffectSum("ruptureHaste")) * ruptureGrowthMultiplier() - mitigation);
  const total = (hasDoctrine("acier") ? baseTotal * 1.25 : baseTotal) + demesure;

  renderCache._framePressure = { scarcity, inequality, complexity, dissent, structural, demesure, mitigation, total };
  renderCache._framePressureVer = renderCache.frameVersion;
  return renderCache._framePressure;
}

export function cityVitals() {
  // Retourne le cache frame s'il a été calculé sur la frame courante (cf. bumpFrame).
  if (renderCache._frameVitalsVer === renderCache.frameVersion) return renderCache._frameVitals;
  const popF = toNum(state.population);
  const foodF = toNum(state.food);
  const goldF = toNum(state.gold);
  const knowF = toNum(state.knowledge);
  let foodScore, goldScore, knowledgeScore;
  if (Number.isFinite(popF) && Number.isFinite(foodF) && Number.isFinite(goldF) && Number.isFinite(knowF)) {
    // Chemin float : identique bit-à-bit à l'implémentation pré-Decimal.
    foodScore = foodF / Math.max(660, popF * 24);
    goldScore = goldF / Math.max(80, popF * 1.4);
    knowledgeScore = knowF / Math.max(90, popF * 0.9);
  } else {
    // Au-delà du float : les ratios de deux Decimals restent significatifs.
    foodScore = D(state.food).div(D(state.population).mul(24).max(660)).toNumber();
    goldScore = D(state.gold).div(D(state.population).mul(1.4).max(80)).toNumber();
    knowledgeScore = D(state.knowledge).div(D(state.population).mul(0.9).max(90)).toNumber();
  }
  const foodBonus = clamp((foodScore - 0.32) * 0.45, -0.18, 0.12);
  const goldBonus = clamp(goldScore - 0.2, -0.12, 0.22);
  const knowledgeBonus = clamp(knowledgeScore - 0.18, -0.1, 0.26);

  renderCache._frameVitals = {
    foodScore,
    goldScore,
    knowledgeScore,
    foodBonus,
    goldBonus,
    knowledgeBonus,
    populationMult: Math.max(0.7, 1 + foodBonus),
    foodMult: 1,
    goldMult: Math.max(0.85, 1 + goldBonus),
    knowledgeMult: Math.max(0.85, 1 + knowledgeBonus),
    infraMult: Math.max(0.85, 1 + goldBonus * 0.35 + knowledgeBonus * 0.22),
    instabilityRelief: isMythEffectActive("mythe_d_atlas")
      ? 0
      : Math.max(0, clamp01(foodScore - 0.92) * 0.018 + knowledgeBonus * 0.06)
  };
  renderCache._frameVitalsVer = renderCache.frameVersion;
  return renderCache._frameVitals;
}

// rates() retourne les 5 taux de ressources en Decimal (le tick fait .add) et
// `instability` en number natif (jauge bornée 0-1).
// Deux chemins qui DOIVENT évoluer ensemble :
//   - float : identique bit-à-bit à l'implémentation pré-Decimal tant que tout
//     reste fini (cas de 99,9 % des parties — et garantie golden-master) ;
//   - Decimal : miroir activé dès qu'une valeur déborde ~1.8e308.
export function rates(vitals = cityVitals(), pressure = pressureBreakdown(), forceDecimalPath = false) {
  // forceDecimalPath : séam réservé aux tests de parité — force la branche Decimal
  // sur un état sous le plafond float, pour vérifier qu'elle égale la branche float.
  if (!forceDecimalPath && renderCache._frameRatesVer === renderCache.frameVersion) return renderCache._frameRates;

  const _babelExpMult  = babelExponentialMult();
  const _babelAdjMult  = babelAdjacencyMultiplier();
  const _hephInfraFactor = hephInfraMult();
  // Étouffement de la production de population par les Mythes (Héphaïstos : déclin ;
  // Âge d'Or : plafond). Neutre (×1) hors de ces Mythes.
  const _popSuppressFactor = hephPopProdMult() * orPopProdMult();
  const babelActive = isMythEffectActive("mythe_de_babel");

  const sums = getBuildingSums();
  const baseSumsByCategory = sums.baseSumsByCategory;

  // Facteurs « petits » partagés par les deux chemins (tous bornés).
  let prometheeFoodMult = 1;
  if (isMythEffectActive("mythe_de_promethee")) prometheeFoodMult *= PROMETHEE_FOOD_MULT;
  if (state.prometheeBraisiers) {
    const cycleElapsed = Date.now() - (state.cycleStartedAt || Date.now());
    if (cycleElapsed < BRAISIERS_DURATION_MS) prometheeFoodMult *= BRAISIERS_FOOD_MULT;
  }
  const _orPenaltyMult = orProdPenaltyMult();
  const _epitaphEffect = epitaphLegacyEffect();
  const _rawInstability = Math.max(0, pressure.total - vitals.instabilityRelief)
    * (isMythEffectActive("mythe_d_icare") ? ICARE_RUPTURE_MULT : 1)
    * (babelActive ? BABEL_RUPTURE_MULT : 1)
    * cadmosStabilityMultiplier()
    * _epitaphEffect.ruptureMult;
  const instability = isMythEffectActive("mythe_age_or")
    ? Math.min(OR_RUPTURE_CAP, _rawInstability)
    : _rawInstability;
  const atridesDrain = isMythEffectActive("mythe_atrides") && !state.atridesDrainDisabled;
  const eneeDegraded = isMythEffectActive("mythe_d_enee") && state.eneeDegraded;

  const popF = toNum(state.population);
  const knowF = toNum(state.knowledge);

  // ── Chemin float (rapide et exact sous le plafond float) ────────────────
  if (!forceDecimalPath && !sums.overflow) {
    let pop = 0.04;
    let food = popF * 0.012;
    let gold = Math.max(0, popF - 25) * 0.0015;
    let knowledge = 0;
    let infra = 0;

    for (const [cat, catSums] of Object.entries(baseSumsByCategory)) {
      const babelMult = (babelActive && cat === state.babelCategory) ? _babelExpMult : 1;
      const totalMult = babelMult * _babelAdjMult;
      const hephBonus = (_hephInfraFactor > 1 && cat === "infra") ? _hephInfraFactor : 1;

      pop += catSums.pop * totalMult;
      food += catSums.food * totalMult;
      gold += catSums.gold * totalMult;
      knowledge += catSums.knowledge * totalMult;
      infra += catSums.infra * totalMult * hephBonus;
    }

    food *= prometheeFoodMult;

    const mult = globalMultiplier();
    if (has("root_cellars")) food *= 1.6;
    if (has("buried_coins")) gold *= 1.6;
    if (has("charcoal_tablets")) knowledge *= 1.6;
    food *= ruinEffectMultiplier("foodMult");
    gold *= ruinEffectMultiplier("goldMult") * (hasDoctrine("parchemin") ? 0.85 : 1);
    knowledge *= ruinEffectMultiplier("knowledgeMult") * (hasDoctrine("parchemin") ? 1.3 : 1);
    infra *= ruinEffectMultiplier("infraMult") * (hasDoctrine("sillon") ? 1.25 : 1);

    let populationRate = pop * mult * _epitaphEffect.globalMult * vitals.populationMult * ruinEffectMultiplier("populationMult") * crisisProductionMultiplier("population") * _orPenaltyMult * _popSuppressFactor;
    let foodRate = food * Math.sqrt(mult) * _epitaphEffect.globalMult * _epitaphEffect.foodMult * vitals.foodMult * crisisProductionMultiplier("food") * terminalPrepMultiplier("food") * _orPenaltyMult * cadmosProductionMultiplier("food");
    let goldRate = gold * Math.sqrt(mult) * _epitaphEffect.globalMult * _epitaphEffect.goldMult * (1 + state.buildings.markets * 0.032 + state.buildings.guilds * 0.024) * vitals.goldMult * crisisProductionMultiplier("gold") * terminalPrepMultiplier("gold") * _orPenaltyMult * (hasActiveRuin(state, "age_or") ? ACTIVE_RUIN_GOLD_PROD_MULT : 1) * cadmosProductionMultiplier("gold");
    let knowledgeRate = knowledge * mult * _epitaphEffect.globalMult * _epitaphEffect.knowledgeMult * (1 + Math.log10(popF + 10) * 0.05) * vitals.knowledgeMult * crisisProductionMultiplier("knowledge") * terminalPrepMultiplier("knowledge") * _orPenaltyMult + theocracyKnowledgeRate();
    let infrastructureRate = infra * mult * _epitaphEffect.globalMult * _epitaphEffect.infraMult * (1 + Math.log10(knowF + 10) * 0.04) * vitals.infraMult * crisisProductionMultiplier("infrastructure") * terminalPrepMultiplier("infrastructure") * _orPenaltyMult;

    if (atridesDrain) {
      foodRate *= 0.9;
      goldRate *= 0.9;
      knowledgeRate *= 0.9;
      infrastructureRate *= 0.9;
    }
    if (eneeDegraded) {
      foodRate = 0;
      goldRate = 0;
    }

    if (Number.isFinite(populationRate) && Number.isFinite(foodRate) && Number.isFinite(goldRate)
      && Number.isFinite(knowledgeRate) && Number.isFinite(infrastructureRate)) {
      const baseRates = {
        population: new Decimal(populationRate),
        food: new Decimal(foodRate),
        gold: new Decimal(goldRate),
        knowledge: new Decimal(knowledgeRate),
        infrastructure: new Decimal(infrastructureRate),
        instability
      };
      renderCache._frameRates = baseRates;
      renderCache._frameRatesVer = renderCache.frameVersion;
      return baseRates;
    }
  }

  // ── Chemin Decimal (au-delà du plafond float) ────────────────────────────
  const babelExpD = babelExponentialMultDec();
  let popD = new Decimal(0.04);
  let foodD = D(state.population).mul(0.012);
  let goldD = D(state.population).sub(25).max(0).mul(0.0015);
  let knowledgeD = new Decimal(0);
  let infraD = new Decimal(0);

  for (const [cat, catSums] of Object.entries(baseSumsByCategory)) {
    const babelMultD = (babelActive && cat === state.babelCategory) ? babelExpD : new Decimal(1);
    const totalMultD = babelMultD.mul(_babelAdjMult);
    const hephBonus = (_hephInfraFactor > 1 && cat === "infra") ? _hephInfraFactor : 1;

    popD = popD.add(D(catSums.pop).mul(totalMultD));
    foodD = foodD.add(D(catSums.food).mul(totalMultD));
    goldD = goldD.add(D(catSums.gold).mul(totalMultD));
    knowledgeD = knowledgeD.add(D(catSums.knowledge).mul(totalMultD));
    infraD = infraD.add(D(catSums.infra).mul(totalMultD).mul(hephBonus));
  }

  foodD = foodD.mul(prometheeFoodMult);

  const multD = globalMultiplierDec();
  const sqrtMultD = multD.sqrt();
  if (has("root_cellars")) foodD = foodD.mul(1.6);
  if (has("buried_coins")) goldD = goldD.mul(1.6);
  if (has("charcoal_tablets")) knowledgeD = knowledgeD.mul(1.6);
  foodD = foodD.mul(ruinEffectMultiplier("foodMult"));
  goldD = goldD.mul(ruinEffectMultiplier("goldMult") * (hasDoctrine("parchemin") ? 0.85 : 1));
  knowledgeD = knowledgeD.mul(ruinEffectMultiplier("knowledgeMult") * (hasDoctrine("parchemin") ? 1.3 : 1));
  infraD = infraD.mul(ruinEffectMultiplier("infraMult") * (hasDoctrine("sillon") ? 1.25 : 1));

  const theocracyD = has("trait_theocracy") ? D(state.gold).mul(0.01) : new Decimal(0);
  const baseRates = {
    population: popD.mul(multD).mul(_epitaphEffect.globalMult * vitals.populationMult * ruinEffectMultiplier("populationMult") * crisisProductionMultiplier("population") * _orPenaltyMult * _popSuppressFactor),
    food: foodD.mul(sqrtMultD).mul(_epitaphEffect.globalMult * _epitaphEffect.foodMult * vitals.foodMult * crisisProductionMultiplier("food") * terminalPrepMultiplier("food") * _orPenaltyMult * cadmosProductionMultiplier("food")),
    gold: goldD.mul(sqrtMultD).mul(_epitaphEffect.globalMult * _epitaphEffect.goldMult * (1 + state.buildings.markets * 0.032 + state.buildings.guilds * 0.024) * vitals.goldMult * crisisProductionMultiplier("gold") * terminalPrepMultiplier("gold") * _orPenaltyMult * (hasActiveRuin(state, "age_or") ? ACTIVE_RUIN_GOLD_PROD_MULT : 1) * cadmosProductionMultiplier("gold")),
    knowledge: knowledgeD.mul(multD).mul(_epitaphEffect.globalMult * _epitaphEffect.knowledgeMult * (1 + D(state.population).add(10).log10() * 0.05) * vitals.knowledgeMult * crisisProductionMultiplier("knowledge") * terminalPrepMultiplier("knowledge") * _orPenaltyMult).add(theocracyD),
    infrastructure: infraD.mul(multD).mul(_epitaphEffect.globalMult * _epitaphEffect.infraMult * (1 + D(state.knowledge).add(10).log10() * 0.04) * vitals.infraMult * crisisProductionMultiplier("infrastructure") * terminalPrepMultiplier("infrastructure") * _orPenaltyMult),
    instability
  };

  if (atridesDrain) {
    baseRates.food = baseRates.food.mul(0.9);
    baseRates.gold = baseRates.gold.mul(0.9);
    baseRates.knowledge = baseRates.knowledge.mul(0.9);
    baseRates.infrastructure = baseRates.infrastructure.mul(0.9);
  }
  if (eneeDegraded) {
    baseRates.food = new Decimal(0);
    baseRates.gold = new Decimal(0);
  }

  renderCache._frameRates = baseRates;
  renderCache._frameRatesVer = renderCache.frameVersion;
  return baseRates;
}

export function babelExponentialMult() {
  if (!isMythEffectActive("mythe_de_babel") || !state.babelCategory) return 1;
  const cat = state.babelCategory;
  const n = buildings
    .filter((b) => b.category === cat)
    .reduce((sum, b) => sum + (state.buildings[b.id] || 0), 0);
  return Math.pow(BABEL_PROD_BASE_MULT, n);
}

export function babelExponentialMultDec() {
  if (!isMythEffectActive("mythe_de_babel") || !state.babelCategory) return new Decimal(1);
  const cat = state.babelCategory;
  const n = buildings
    .filter((b) => b.category === cat)
    .reduce((sum, b) => sum + (state.buildings[b.id] || 0), 0);
  return Decimal.pow(BABEL_PROD_BASE_MULT, n);
}

function babelAdjacencyMultiplier() {
  if (!state.babelHeritage) return 1;
  const tileMap = getCityMapEngineTileMap();
  if (!tileMap || tileMap.size === 0) return 1;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let totalBonus = 0;
  let count = 0;
  for (const tile of tileMap.values()) {
    const cat = buildingById[tile.buildingId]?.category;
    if (!cat) continue;
    let adj = 0;
    for (const [dx, dy] of DIRS) {
      const nb = tileMap.get((tile.gx + dx) + "," + (tile.gy + dy));
      if (nb && buildingById[nb.buildingId]?.category === cat) adj++;
    }
    totalBonus += adj * BABEL_ADJ_BONUS;
    count++;
  }
  return count > 0 ? 1 + totalBonus / count : 1;
}

function orProdPenaltyMult() {
  if (!isMythEffectActive("mythe_age_or")) return 1;
  if (D(state.population).lte(OR_POP_THRESHOLD)) return 1;
  const excess = toNum(state.population) - OR_POP_THRESHOLD;
  return Math.max(0.1, 1 - excess * OR_POP_PENALTY_PCT);
}

function hephInfraMult() {
  if (!isMythEffectActive("mythe_d_hephaistos")) return 1;
  const elapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
  return HEPH_INFRA_MULT_BASE + elapsed * HEPH_INFRA_MULT_GROWTH;
}

// Sous Héphaïstos, une fois le déclin enclenché, la production de population est
// étouffée : les machines remplacent les hommes, plus aucune main-d'œuvre nouvelle.
// Découple le déclin (HEPH_POP_DECAY_RATE) de la courbe de production → la pop
// chute réellement, à toutes les échelles. Hors Héphaïstos : neutre (×1).
function hephPopProdMult() {
  if (!isMythEffectActive("mythe_d_hephaistos")) return 1;
  const elapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
  return elapsed > HEPH_POP_DECAY_START_MIN ? HEPH_POP_PROD_MULT : 1;
}

// Sous l'Âge d'Or, la population est PLAFONNÉE : sa production tombe à 0 une fois
// le plafond atteint (max plancher absolu / relatif au départ du cycle). La cité
// dorée prospère sans s'étaler — sans cet arrêt dur, la pop explose (mesuré 10^45)
// et rend l'objectif « ne pas dépasser le plafond » injouable à l'échelle post-GR.
function orPopProdMult() {
  if (!isMythEffectActive("mythe_age_or")) return 1;
  const cap = D(state.orStartPop || 0).mul(OR_POP_CAP_GROWTH).max(OR_POP_CAP);
  return D(state.population).gte(cap) ? 0 : 1;
}

export function buildingOutputMultiplier(building, count) {
  if (count <= 0) return 1;
  const milestone = Math.floor(count / 25);
  if (building.category !== "city") {
    return Math.pow(1.015, count) * Math.pow(1.5, milestone) * (1 + Math.log10(count + 1) * 0.12);
  }
  const continuousGrowth = Math.pow(1.025, count);
  const milestoneGrowth = Math.pow(2, milestone);
  const earlySurge = 1 + Math.log10(count + 1) * 0.18;
  return continuousGrowth * milestoneGrowth * earlySurge;
}

// Miroir Decimal de buildingOutputMultiplier (synergies au-delà du float).
export function buildingOutputMultiplierDec(building, count) {
  if (count <= 0) return new Decimal(1);
  const milestone = Math.floor(count / 25);
  if (building.category !== "city") {
    return Decimal.pow(1.015, count).mul(Decimal.pow(1.5, milestone)).mul(1 + Math.log10(count + 1) * 0.12);
  }
  return Decimal.pow(1.025, count).mul(Decimal.pow(2, milestone)).mul(1 + Math.log10(count + 1) * 0.18);
}

export function buildingMilestoneInfo(building, count) {
  const milestone = Math.floor(count / 25);
  if (milestone <= 0) return null;
  const bonus = building.category === "city" ? Math.pow(2, milestone) : Math.pow(1.5, milestone);
  return {
    milestone,
    bonus,
    label: `x${fmt(bonus)} atteint`
  };
}

// Multiplicateur de production issu des préparations terminales (malus jusqu'à l'effondrement).
function terminalPrepMultiplier(resource) {
  const tp = state.terminalPreparations;
  if (!tp) return 1;
  if (resource === "infrastructure") return 1 + (tp.infraBonus || 0);
  const malus = resource === "food" ? tp.foodMalus
    : resource === "gold" ? tp.goldMalus
    : resource === "knowledge" ? tp.knowledgeMalus
    : 0;
  return Math.max(0.15, 1 - (malus || 0));
}
