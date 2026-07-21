"use strict";

// Cible de Rupture (pressureBreakdown), déficit de subsistance instantané et scores
// de vitalité de la cité (cityVitals). Niveau L1 : consomme getBuildingSums
// (buildingOutput) et les leviers de crise (crisisLevers), plus state/shared/balance.
import { state, renderCache } from '../../state.js';
import { clamp01, clamp } from '../../utils.js';
import { D, toNum } from '../../num.js';
import {
  FOUNDING_GRACE_BUILDINGS,
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
  FOYER_REFORM_CAP,
  INEQUALITY_RESERVE_REF_S,
  INEQUALITY_RESERVE_SCALE_S,
  DEMESURE_FREE_LOG_POP,
  DEMESURE_COEF,
  DEMESURE_SOFT_CAP,
  DEMESURE_CUT_CAP
} from '../../balance.js';
import { has, ruinEffectSum } from '../shared.js';
import { getBuildingSums } from './buildingOutput.js';
import { ruptureGrowthMultiplier, policyFoyerDamp, policyDemesureDamp } from './crisisLevers.js';

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
// forceDecimalPath : séam réservé aux tests de parité (force la branche Decimal
// sur un état SOUS le plafond float, cf. decimal.parity.test.js). Sans effet en prod.
export function scarcityRawInstant(forceDecimalPath = false) {
  const popF = toNum(state.population);
  const foodF = toNum(state.food);
  const population = Math.max(1, popF);
  const demand = population * 2.4;
  // `demand` peut déborder à +Infinity (population ~1e308) alors que food reste
  // fini → Infinity/Infinity = NaN. On ne prend le chemin float que s'il rend un
  // nombre fini ; sinon on bascule sur le Decimal (borné) ci-dessous.
  if (!forceDecimalPath && Number.isFinite(popF) && Number.isFinite(foodF) && Number.isFinite(demand)) {
    return Math.max(0, (demand - foodF) / Math.max(120, demand));
  }
  const popDec = D(state.population).max(1);
  return Math.max(0, popDec.mul(2.4).sub(state.food).div(popDec.mul(2.4).max(120)).toNumber());
}

export function pressureBreakdown(forceDecimalPath = false) {
  // Retourne le cache frame s'il a été calculé sur la frame courante (cf. bumpFrame).
  // forceDecimalPath (tests de parité) : bypasse la lecture ET l'écriture du cache.
  if (!forceDecimalPath && renderCache._framePressureVer === renderCache.frameVersion) return renderCache._framePressure;
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
  // `population * 2.4` peut déborder à +Infinity (ères transcendantes) alors que
  // food/gold restent finis → Infinity/Infinity = NaN, qui contaminerait la
  // Rupture à vie (scarcityRawEase puis instability). On bascule alors sur le
  // Decimal, comme le fait déjà infraCoverage juste en dessous.
  if (!forceDecimalPath && Number.isFinite(popF) && Number.isFinite(foodF) && Number.isFinite(goldF) && Number.isFinite(knowF) && Number.isFinite(infraF) && Number.isFinite(population * 2.4)) {
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
  // x = +Infinity (ratio au-delà du float) : cap·∞/(∞+cap) = NaN → on rend la
  // limite asymptotique du plafond doux, qui est `cap`.
  const softCap = (x, cap) => (x <= 0 ? 0 : Number.isFinite(x) ? cap * x / (x + cap) : cap);

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
  // Plafond du recul combiné d'un foyer = FOYER_REFORM_CAP (durable, rework cadence) :
  // l'apaisement temporaire (fr) reste borné à FOYER_RELIEF_CAP à son dépôt, mais une
  // cité PLEINEMENT réformée descend plus bas (0.72). Anti-immortalité portée par l'Usure.
  const foyerCut = (key) => Math.min(FOYER_REFORM_CAP, (fr[key] || 0) + (rf[key] || 0) + policyFoyerDamp(key));
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
  // « Franchises marchandes » (inequalityDamp) et « Académies libres »
  // (complexityDamp) : amortissement PERMANENT du foyer, multiplicatif avec les
  // reliefs/réformes (plafonné pour ne jamais annuler un foyer).
  const inequality = softCap(inequalityArg, 0.55) * (1 - foyerCut("inequality")) * (1 - Math.min(0.8, ruinEffectSum("inequalityDamp")));
  const complexity = softCap(complexityRaw * 0.34, 0.75) * (1 - foyerCut("complexity")) * (1 - Math.min(0.8, ruinEffectSum("complexityDamp")));
  const dissentRelief = has("ruin_liturgy") ? 0.035 + Math.min(0.06, toNum(state.ruins) * 0.0007) : 0;
  const dissent = Math.max(0, Math.min(0.55, dissentRaw * 0.22) - dissentRelief) * (1 - foyerCut("dissent"));
  // Charge structurelle : les bâtiments stabilisants (instabilité négative)
  // soustraient en PRISE DIRECTE, et l'infrastructure « porte » la charge.
  const structuralNet = Math.max(0, positiveInstability + negativeInstability * STABILIZER_DIRECT_FACTOR);
  const structural = softCap(structuralNet * 2.2 / (1 + effCoverage * STRUCTURAL_COVERAGE_DAMP), 0.75);
  const institutionalLog = Math.log10(1 + effCoverage * INFRA_COVERAGE_MITIGATION_MULT);
  const mitigation = Math.min(MITIGATION_CAP, institutionalLog * MITIGATION_LOG_COEF + ruinEffectSum("stability") + foundingGrace + settlingGrace);
  // A1 — Démesure (hubris d'échelle) : socle d'instabilité qui croît avec la taille
  // de la cité, ajouté APRÈS la mitigation. Rework cadence late-game — désormais :
  //   • BORNÉ par un soft cap (Michaelis-Menten) → contribution max ~DEMESURE_SOFT_CAP
  //     (avant : non borné → 1.56 à 10^30, épinglant la cible à 2-4× le seuil).
  //   • RÉDUCTIBLE par la GOUVERNANCE : la politique « Gouvernance impériale »
  //     (demesureDamp), plafonnée à DEMESURE_CUT_CAP → jamais totalement effacée.
  // Reste à 0 sous le seuil (early game intact). Sûr au-delà du float (log10 Decimal fini).
  const popLog = Number.isFinite(popF) ? Math.log10(Math.max(10, popF)) : toNum(D(state.population).max(10).log10());
  // « Gouvernail des millions » (demesureSlow) : l'hubris d'échelle croît moins vite.
  const demesureRaw = Math.max(0, (popLog - DEMESURE_FREE_LOG_POP) * DEMESURE_COEF)
    * (1 - Math.min(0.8, ruinEffectSum("demesureSlow")));
  const demesureCut = Math.min(
    DEMESURE_CUT_CAP,
    policyDemesureDamp()
  );
  const demesure = softCap(demesureRaw, DEMESURE_SOFT_CAP) * (1 - demesureCut);
  const baseTotal = Math.max(0, (scarcity + inequality + complexity + dissent + structural + ruinEffectSum("ruptureHaste")) * ruptureGrowthMultiplier() - mitigation);
  const total = baseTotal + demesure;

  const result = {
    scarcity, inequality, complexity, dissent, structural, demesure, mitigation, total,
    // Sous-moteurs exposés pour l'Anatomie de la Rupture (onglet Régulation) :
    // valeurs intermédiaires DÉJÀ calculées ci-dessus, affichage seul. Champ
    // purement additif — les 8 clés historiques restent le contrat (golden
    // master + parité Decimal ne comparent qu'elles).
    gauges: {
      scarcityDeficit: scarcityRawUsed,
      goldReserveSeconds: state.goldReserveEase,
      riskyBuildingCount,
      stabilizerCount: sums.stabilizerCount || 0,
      knowledgeStrain,
      infraCoverage: effCoverage,
      structuralNet,
      popLog,
      demesureCut,
      ruinStability: ruinEffectSum("stability"),
      graces: foundingGrace + settlingGrace
    }
  };
  if (!forceDecimalPath) {
    renderCache._framePressure = result;
    renderCache._framePressureVer = renderCache.frameVersion;
  }
  return result;
}

export function cityVitals(forceDecimalPath = false) {
  // Retourne le cache frame s'il a été calculé sur la frame courante (cf. bumpFrame).
  // forceDecimalPath (tests de parité) : bypasse la lecture ET l'écriture du cache.
  if (!forceDecimalPath && renderCache._frameVitalsVer === renderCache.frameVersion) return renderCache._frameVitals;
  const popF = toNum(state.population);
  const foodF = toNum(state.food);
  const goldF = toNum(state.gold);
  const knowF = toNum(state.knowledge);
  let foodScore, goldScore, knowledgeScore;
  if (!forceDecimalPath && Number.isFinite(popF) && Number.isFinite(foodF) && Number.isFinite(goldF) && Number.isFinite(knowF)) {
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

  const result = {
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
    instabilityRelief: Math.max(0, clamp01(foodScore - 0.92) * 0.018 + knowledgeBonus * 0.06)
  };
  if (!forceDecimalPath) {
    renderCache._frameVitals = result;
    renderCache._frameVitalsVer = renderCache.frameVersion;
  }
  return result;
}
