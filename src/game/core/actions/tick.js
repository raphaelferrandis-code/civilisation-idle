"use strict";

import {
  state,
  gamePaused,
  collapseInProgress,
  bumpFrame,
  isNotifyPaused,
  isOfflineSim
} from '../state.js';

import {
  cityVitals,
  pressureBreakdown,
  rates,
  timeWearRate,
  crisisOpen,
  crisisCosts,
  currentEraIndex,
  enforceInfrastructureCap,
  has,
  ruinEffectSum,
  policyRiseSlow,
  policyOvershootDamp,
  scarcityRawInstant,
  totalBuildingCount,
  activeEpitaphLegacy,
  refreshGrandResetReveal,
  refreshBuildingReveal,
  GRAND_RESET_MILESTONES
} from '../mechanics.js';

import { tr } from '../i18n.js';
import { refreshOnboarding } from '../onboarding.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { BOONS } from '../../data/boons.js';

import {
  checkCrisisThresholds,
  triggerCollapseChoices,
  runCrisisAction
} from './crisis.js';

import { tickOlympus } from './olympus.js';
import { runMythTicks } from './mythTicks.js';
import { tickSteward } from './steward.js';
import { resolveBuyQueue } from './buyQueue.js';
import { tickTempleAutomation } from './templeAutomation.js';
import { pushAnnalsSample } from '../annals.js';

import {
  checkAutomateRules,
  checkAutoScriptRules
} from './automation.js';

import { log, chronicle } from './utils.js';
import { eras, eraTier } from '../../data/world.js';
import { epitaphLegacyById } from '../../data/epitaphs.js';
import { refreshCycleVowDone, cycleVowStatus, rollCycleVow } from '../../data/vows.js';
import { clamp01, canPayCost, fmt } from '../utils.js';
import { D, toNum } from '../num.js';
import { checkAndTriggerChronicleEntries } from '../chronicleEvaluator.js';
import { recordEraGain } from '../chronicleStats.js';
import {
  INSTABILITY_DRIFT_SPEED,
  INSTABILITY_OVERSHOOT_CAP,
  INSTABILITY_MAX_RISE_PER_SEC,
  AUTO_CRISIS_COOLDOWN_MS,
  FOYER_RELIEF_HALF_LIFE_S,
  FATIGUE_HALF_LIFE_S,
  SCARCITY_EASE_HALF_LIFE_S,
  INEQUALITY_EASE_HALF_LIFE_S,
  INEQUALITY_RESERVE_CAP_S,
  INFRA_COVERAGE_POP_FACTOR,
  INFRA_COVERAGE_BUILDING_FACTOR,
  INFRA_COVERAGE_MIN_BASE,
  INFRA_UPKEEP_TOLERANCE,
  INFRA_UPKEEP_DECAY_RATE,
  STAGNATION_RUPTURE_THRESHOLD,
  STAGNATION_RECOVER_MULT,
  STAGNATION_BOON_EVERY_SEC,
  OFFLINE_MAX_BOONS,
  BOON_INTERVAL_MIN_SEC,
  BOON_INTERVAL_MAX_SEC
} from '../balance.js';
import {
  isMythEffectActive,
  RAGNAROK_ID,
  RAGNAROK_DURATION_MS,
  ragnarokAge
} from '../../data/myths.js';
import {
  hasActiveRuin,
  ACTIVE_RUIN_ICARE_AUTO_BURN,
  ACTIVE_RUIN_PHENIX_FORCED_SEC
} from '../../data/activeRuins.js';
import { icareClimb, checkMythLiveCompletion } from './myths.js';
import { collapse } from './crisis.js';

// Dernier déclenchement automatique de protocoles_urgence (cooldown anti-verrou :
// l'automation seule ne doit pas pouvoir maintenir la jauge sous le seuil de crise).
let lastAutoCrisisAt = 0;

export function tick(dt) {
  if (gamePaused || collapseInProgress) return;

  bumpFrame(); // invalide les 5 caches de frame en une fois (cf. state.js)

  // PREMIERS PAS (E1). ⚠ AVANT le retour anticipé de la crise terminale, et
  // c'est la seule place correcte : placé plus bas, le latch ne tournait pas
  // pendant toute une crise terminale — c'est-à-dire pile au moment où la
  // Rupture est au maximum et où le joueur attend que l'étape se coche. Vu en
  // jeu sur une partie à 21 cycles dont les trois drapeaux restaient à false.
  // Latch à sens unique, une lecture de booléen par tick une fois les trois
  // posés, donc gratuit à mettre si haut.
  refreshOnboarding(state, totalBuildingCount());

  if (state.crisisLimitAnnounced) {
    if (state.instability >= 1) state.instability = 1;
    if ((state.timeWear || 0) >= 1) state.timeWear = 1;
    // « L'Hiver Fimbul » : la FIN est inéluctable — même la crise terminale,
    // dont le gel fige tout le reste, ne la retient pas. Sans ce passage, le Feu
    // ouvrait la crise vers ~21 min et le cycle pourrissait, gelé (harnais :
    // âge 6 h). Miroir du bloc principal plus bas dans le tick.
    if (isMythEffectActive(RAGNAROK_ID) && !collapseInProgress && ragnarokAge() >= RAGNAROK_DURATION_MS) {
      log("La Fin est là. Le ciel se déchire, et le monde des dieux s'éteint.");
      collapse("forced");
    }
    return;
  }

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);
  tickOlympus(dt);

  state.population = D(state.population).add(r.population.mul(dt)).max(1);
  state.food = D(state.food).add(r.food.mul(dt)).max(0);
  state.gold = D(state.gold).add(r.gold.mul(dt)).max(0);
  state.knowledge = D(state.knowledge).add(r.knowledge.mul(dt)).max(0);
  state.infrastructure = D(state.infrastructure).add(r.infrastructure.mul(dt)).max(0);

  enforceInfrastructureCap();

  // A2 — Entretien : l'infra excédentaire (au-delà de INFRA_UPKEEP_TOLERANCE × la
  // demande de couverture) se dégrade. Le stock n'étant jamais consommé, il
  // saturait sinon la couverture et éteignait la Rupture. La part « utile » (sous
  // le seuil) n'est JAMAIS touchée → aucune spirale de mort pour une cité
  // sous-équipée. Calcul Decimal : sûr au-delà du float.
  // Dogme « Enracinement » : fin de l'entretien (contrepartie : bâtiments +15 %).
  if (!has("trait_enracinement")) {
    const infraDemand = D(state.population).mul(INFRA_COVERAGE_POP_FACTOR)
      .max(totalBuildingCount() * INFRA_COVERAGE_BUILDING_FACTOR)
      .max(INFRA_COVERAGE_MIN_BASE);
    const surplus = D(state.infrastructure).sub(infraDemand.mul(INFRA_UPKEEP_TOLERANCE));
    if (surplus.gt(0)) {
      const decay = surplus.mul(Math.min(1, INFRA_UPKEEP_DECAY_RATE * dt));
      state.infrastructure = D(state.infrastructure).sub(decay).max(0);
    }
  }

  if (isMythEffectActive("mythe_atrides")) {
    // La dette Atrides reste un number natif (mythe de milieu de partie) :
    // on borne à MAX_VALUE pour ne jamais propager Infinity.
    const totalProd = Math.max(0, toNum(r.food.add(r.gold).add(r.knowledge).add(r.infrastructure)));
    const growthPerSec = Math.min(Number.MAX_VALUE, Math.max(10, totalProd * 0.01) * (state.atridesDebtGrowthMultiplier || 1));
    state.atridesDebt = Math.min(Number.MAX_VALUE, (state.atridesDebt || 0) + growthPerSec * dt);

    if (state.atridesDebtGrowthMultiplier < 1 && Date.now() >= (state.atridesRenegotiateActiveUntil || 0)) {
      state.atridesDebtGrowthMultiplier = 1;
      log("Les accords de renegociation ont expire. La dette de la cite reprend sa croissance normale.");
    }
  }

  // A6 — Stagnation : tant que la Rupture reste sous le seuil, la cité « stagne »
  // et le compteur monte (timeWearRate l'utilise pour accélérer l'Usure) ; dès
  // que la tension repasse au-dessus, il retombe STAGNATION_RECOVER_MULT× plus vite.
  if (state.instability < STAGNATION_RUPTURE_THRESHOLD) {
    state.stagnationSec = (state.stagnationSec || 0) + dt;
  } else {
    state.stagnationSec = Math.max(0, (state.stagnationSec || 0) - dt * STAGNATION_RECOVER_MULT);
  }
  // « Stagnation féconde » : la stagnation n'accélère plus l'Usure (cf.
  // timeWearRate) — à la place, chaque longue accalmie CHARGE une aubaine.
  if (has("stagnation_feconde") && (state.stagnationSec || 0) >= STAGNATION_BOON_EVERY_SEC) {
    state.stagnationSec = 0;
    // La récompense d'une longue accalmie est MÉCANIQUE : elle est due même si
    // l'accalmie a eu lieu pendant l'absence. Muette et plafonnée dans ce cas.
    if (!isOfflineSim()) fireBoon(r);
    else if (offlineBoonsLeft()) fireBoon(r, true);
  }

  state.timeWear = clamp01((state.timeWear || 0) + timeWearRate() * dt);

  const rawTarget = Math.max(0, r.instability);
  const instabilityTarget = clamp01(rawTarget);
  const instabilityDrift = instabilityTarget - state.instability;
  // "Maintenir l'ordre" (prépa terminale) + politiques permanentes (Levier C)
  // ralentissent la MONTÉE de la rupture (jamais sa descente). Plafond commun 0.8
  // → même tout ralenti, la jauge monte encore : jamais un gel (anti-immortalité).
  const orderSlow = instabilityDrift > 0
    ? 1 - Math.min(0.8, (state.terminalPreparations?.ruptureSlow || 0) + policyRiseSlow())
    : 1;
  // Surcharge : au-delà du seuil, la dérive accélère proportionnellement au
  // dépassement (plafonné) — une cité en pression x3 ne peut plus être tenue
  // indéfiniment sous 100 % à coups d'actions de crise.
  const overshootRaw = instabilityDrift > 0
    ? Math.min(INSTABILITY_OVERSHOOT_CAP, Math.max(1, rawTarget))
    : 1;
  // Politique « Diplomatie de crise » : atténue la surcharge (gagne du temps).
  const overshoot = 1 + (overshootRaw - 1) * (1 - policyOvershootDamp());
  let instabilityDelta = instabilityDrift * INSTABILITY_DRIFT_SPEED * orderSlow * overshoot * dt;
  // Montée incompressible : garantit un cycle d'au moins ~2-3 min, le temps que
  // les pics se reconstruisent (sinon effondrement à gain nul en fin de partie).
  if (instabilityDelta > 0) {
    instabilityDelta = Math.min(instabilityDelta, INSTABILITY_MAX_RISE_PER_SEC * dt);
  }
  const nextInstability = state.instability + instabilityDelta;
  state.instability = instabilityTarget >= 1 && nextInstability >= 0.995
    ? 1
    : clamp01(nextInstability);

  // Annales (onglet Régulation) : un point de courbe par tick réel. Suspendu
  // pendant la simulation hors-ligne (comme les floats/jalons) — le throttle
  // interne (~1 Hz) borne de toute façon les rafales.
  if (!isNotifyPaused()) pushAnnalsSample(state.instability);

  // Extinction du legs d'épitaphe : sans ça, la fenêtre expire en silence. Une
  // ligne de Chronique clôt la boucle, puis l'état est CONSOMMÉ (null) — jamais
  // de double post, même après rechargement. Le Pillage, sans effet fenêtré,
  // s'éteint sans ligne (rien n'était « actif » à annoncer).
  if (state.activeEpitaphLegacy && !activeEpitaphLegacy()) {
    const expiredLegacy = epitaphLegacyById(state.activeEpitaphLegacy.id);
    const hadTimedEffects = expiredLegacy && Object.keys(expiredLegacy.effects || {}).some((key) => key !== "startingInstability");
    if (hadTimedEffects) {
      chronicle(`Le legs gravé « ${expiredLegacy.logLabel} » s'efface ; la cité vole désormais de ses propres ailes.`);
    }
    state.activeEpitaphLegacy = null;
  }

  // Étape 2 : déclin du relief temporaire des foyers (demi-vie FOYER_RELIEF_HALF_LIFE_S)
  // — l'apaisement obtenu en cliquant s'estompe, il faut ré-intervenir.
  const fr = state.foyerRelief;
  if (fr) {
    const keep = Math.pow(0.5, dt / FOYER_RELIEF_HALF_LIFE_S);
    fr.scarcity *= keep;
    fr.inequality *= keep;
    fr.complexity *= keep;
    fr.dissent *= keep;
  }

  // Fatigue de régulation : redescend avec le temps (demi-vie FATIGUE_HALF_LIFE_S)
  // → espacer ses interventions restaure l'efficacité et baisse les coûts.
  if (state.regulFatigue > 0) {
    state.regulFatigue *= Math.pow(0.5, dt / FATIGUE_HALF_LIFE_S);
    if (state.regulFatigue < 1e-4) state.regulFatigue = 0;
  }

  // Lissage du foyer Subsistance (EMA) : amortit les pics de déficit de nourriture
  // → la barre ne clignote plus, mais un manque DURABLE finit par compter.
  const scarcityNow = scarcityRawInstant();
  state.scarcityRawEase = state.scarcityRawEase == null
    ? scarcityNow
    : state.scarcityRawEase + (scarcityNow - state.scarcityRawEase) * (1 - Math.pow(0.5, dt / SCARCITY_EASE_HALF_LIFE_S));

  // Foyer Inégalités : réserve d'or en SECONDES DE REVENU (gold / revenu_or),
  // lissée (EMA). Stable à toute échelle ; thésauriser monte, dépenser baisse.
  const goldRateNow = toNum(r.gold);
  const reserveNow = goldRateNow > 1e-9
    ? Math.min(INEQUALITY_RESERVE_CAP_S, Math.max(0, toNum(D(state.gold).div(r.gold))))
    : 0;
  state.goldReserveEase = state.goldReserveEase == null
    ? reserveNow
    : state.goldReserveEase + (reserveNow - state.goldReserveEase) * (1 - Math.pow(0.5, dt / INEQUALITY_EASE_HALF_LIFE_S));

  const peaks = state.cyclePeaks;
  if (D(state.population).gt(peaks.population)) peaks.population = state.population;
  if (D(state.food).gt(peaks.food ?? 0)) peaks.food = state.food;
  if (D(state.gold).gt(peaks.gold ?? 0)) peaks.gold = state.gold;
  if (D(state.knowledge).gt(peaks.knowledge)) peaks.knowledge = state.knowledge;
  if (D(state.infrastructure).gt(peaks.infrastructure)) peaks.infrastructure = state.infrastructure;
  const currentEra = currentEraIndex();
  if (currentEra > peaks.eraIndex) {
    peaks.eraIndex = currentEra;
    // B1 — Célébration : chaque nouvelle ère franchie ce cycle (float doré).
    if (!isNotifyPaused()) pushOutcomeFloat({ label: `🏛️ Ère : ${eras[currentEra].name}`, kind: "gain" });
    if (currentEra > (state.bestEraIndex || 0)) {
      const prevTier = eraTier(state.bestEraIndex || 0);
      state.bestEraIndex = currentEra;
      // Registre de la Chronique : montée d'ère la plus rapide (temps de cycle
      // pour décrocher ce sommet). Hors-ligne exclu (elapsed non pertinent).
      if (!isNotifyPaused()) {
        recordEraGain((Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
      }
      const newTier = eraTier(currentEra);
      // Récompense visible de chaque nouveau sommet : +1 ruine plate par palier
      // d'ère MAJEUR (cf. ERA_RUIN_BONUS_PER_INDEX). Les ères « factices »
      // (tier inchangé) avancent le compteur sans log ni récompense.
      if (newTier > prevTier) {
        log(`Sommet historique : l'ère ${eras[currentEra].name} est atteinte pour la première fois. Chaque effondrement rapportera désormais +${newTier} ruines.`);
      }
    }
  }

  // Découverte de jalon de Grand Reset : dès que le jalon du PROCHAIN GR est
  // atteint, on le grave (persistant) et — en direct seulement — on le révèle.
  const grDiscoveredId = refreshGrandResetReveal();
  if (grDiscoveredId && !isNotifyPaused()) {
    const mm = GRAND_RESET_MILESTONES.find((x) => x.id === grDiscoveredId);
    if (mm) {
      pushOutcomeFloat({ label: `👑 Grand Reset à portée : ${tr(mm.name)}`, kind: "gain" });
      log(`Un seuil s'illumine : « ${tr(mm.name)} ». Un Grand Reset s'offre désormais à toi (page Effondrement).`);
    }
  }

  // APPARITION D'UN BÂTIMENT (D6). Elle était totalement muette : le joueur
  // pouvait passer des heures sans voir qu'une rangée neuve l'attendait. Même
  // patron que le sceau ci-dessus — le latch se pose inconditionnellement, la
  // garde ne porte que sur l'ANNONCE, sinon le rattrapage hors ligne
  // n'enregistrerait rien et déballerait tout au retour.
  //
  // MESSAGE GROUPÉ, pas un par bâtiment : en début de partie plusieurs seuils
  // tombent dans le même tick, et sur une sauvegarde d'avant D6 le premier tick
  // en trouve une poignée d'un coup.
  const freshBuildings = refreshBuildingReveal();
  if (freshBuildings.length && !isNotifyPaused()) {
    const noms = freshBuildings.map((b) => tr(b.name));
    const tete = noms.slice(0, 3).join(", ");
    const reste = noms.length - 3;
    const liste = reste > 0
      ? tr({ fr: `${tete} et ${reste} autre${reste > 1 ? "s" : ""}`, en: `${tete} and ${reste} more` })
      : tete;
    pushOutcomeFloat({
      label: tr({ fr: `🏗️ À portée : ${noms[0]}`, en: `🏗️ Within reach: ${noms[0]}` }),
      kind: "gain"
    });
    log(tr({ fr: `La cité sait désormais bâtir : ${liste}.`, en: `The city now knows how to build: ${liste}.` }));
  }

  // VŒU DU CYCLE (D2). Amorce paresseuse : le PREMIER cycle (et les vieilles
  // sauvegardes, et l'après-pacte) n'ont pas de vœu tiré par completeCollapse —
  // on en propose un ici pour qu'il y en ait toujours un à prêter.
  if (!state.cycleVow) state.cycleVow = rollCycleVow(state);
  // Latch dès l'objectif atteint. Posé INCONDITIONNELLEMENT (le vœu se tient aussi
  // pendant le rattrapage hors ligne, pour que le joueur qui revient le trouve
  // accompli) ; l'ANNONCE seule passe sous garde — même patron que les sceaux et
  // les bâtiments juste au-dessus.
  if (refreshCycleVowDone(state) && !isNotifyPaused()) {
    const vowSt = cycleVowStatus(state);
    if (vowSt) {
      pushOutcomeFloat({ label: tr({ fr: `🕊️ Vœu tenu : ${tr(vowSt.def.name)}`, en: `🕊️ Vow kept: ${tr(vowSt.def.name)}` }), kind: "gain" });
      log(tr({
        fr: `Le vœu du cycle est tenu : la moisson de la prochaine chute sera majorée de ${Math.round((vowSt.ruinMult - 1) * 100)} %.`,
        en: `The cycle's vow is kept: the next collapse's harvest will be raised by ${Math.round((vowSt.ruinMult - 1) * 100)}%.`
      }));
    }
  }

  // Ruine active « Fardeau du ciel » : voir crisis.js — « Atlas prend le coup »
  // part d'office sur la PREMIÈRE crise du cycle (le joueur perd le choix de
  // laquelle). Rien à faire au tick.

  // Ruine active « Cire fondante » : l'Aile MONTE toute seule au seuil de Rupture.
  // Le joueur garde le vol, perd le choix du moment. Latché par franchissement :
  // sans le latch, la montée (+15 % de Rupture immédiate) re-déclencherait la
  // condition au tick suivant — spirale de mort en trois secondes.
  if (hasActiveRuin(state, "icare")) {
    if (state.instability >= ACTIVE_RUIN_ICARE_AUTO_BURN) {
      if (!state.icareAutoBurnLatched) {
        state.icareAutoBurnLatched = true;
        icareClimb();
      }
    } else {
      state.icareAutoBurnLatched = false;
    }
  }

  // Ruine active « Bûcher programmé » : la chute s'impose à heure fixe, quels que
  // soient les réglages du Script. On passe par le chemin d'effondrement normal.
  if (hasActiveRuin(state, "phenix") && !collapseInProgress) {
    const ageSec = (Date.now() - (state.cycleStartedAt || Date.now())) / 1000;
    if (ageSec >= ACTIVE_RUIN_PHENIX_FORCED_SEC) {
      log("Bûcher programmé : l'heure est venue, la cité s'embrase sans attendre ton ordre.");
      collapse("forced");
      return;
    }
  }

  // « L'Hiver Fimbul » : la FIN à 24 minutes — effondrement forcé, même chemin
  // que le bûcher du Phénix. Si l'Arche n'est pas prête, le pacte se brise
  // (checkMythOnCollapse le constatera) ; si elle l'est, le Mythe s'est déjà
  // sacré en direct et ce bloc ne tourne plus (le pacte est levé).
  if (isMythEffectActive(RAGNAROK_ID) && !collapseInProgress) {
    if (ragnarokAge() >= RAGNAROK_DURATION_MS) {
      log("La Fin est là. Le ciel se déchire, et le monde des dieux s'éteint.");
      collapse("forced");
      return;
    }
  }

  // B1/B2 — Récompenses régulières. Les deux ne se traitent PAS pareil :
  //   - la fête de jalon est une CÉLÉBRATION, elle n'a aucun sens rejouée en
  //     masse et reste coupée hors ligne ;
  //   - l'aubaine est un CRÉDIT dû au joueur, dont la cadence vit déjà sur
  //     l'horloge virtuelle. Elle tourne pendant l'absence, muette et plafonnée.
  if (!isNotifyPaused()) celebratePopMilestone();
  if (!isOfflineSim()) maybeFireBoon(r);
  else if (offlineBoonsLeft()) maybeFireBoon(r, true);

  if (runMythTicks(state, dt) === "abort") return;
  // Validation VIVANTE : les handlers ci-dessus viennent de poser les drapeaux de
  // réussite — on sacre immédiatement, sans attendre l'effondrement.
  checkMythLiveCompletion();

  if (state.cadmosPromptPending) return;

  if (state.hephHeritage && !collapseInProgress && !gamePaused) {
    checkAutomateRules();
  }

  if (state.phoenixHeritage && !collapseInProgress && !gamePaused) {
    checkAutoScriptRules();
  }

  // FILE D'ACHATS (C8) — après les automatismes, avant les protocoles d'urgence.
  // Cet ordre est un choix : ce que le joueur a épinglé à la main passe APRÈS
  // ce que ses automates achètent d'eux-mêmes (ils entretiennent la cité, la
  // file la fait grandir), mais AVANT les dépenses de crise, qui ne doivent pas
  // se voir souffler leur trésorerie par un achat planifié.
  if (!collapseInProgress && !gamePaused) resolveBuyQueue();

  if (has("protocoles_urgence") && !crisisOpen() && !gamePaused && !collapseInProgress
    && Date.now() - lastAutoCrisisAt >= AUTO_CRISIS_COOLDOWN_MS) {
    const inst = state.instability;
    const costs = crisisCosts();
    if (inst >= 0.82 && canPayCost(costs.census)) {
      runCrisisAction("census", { render: false });
      lastAutoCrisisAt = Date.now();
    } else if (inst >= 0.65 && canPayCost(costs.rationing)) {
      runCrisisAction("rationing", { render: false });
      lastAutoCrisisAt = Date.now();
    }
  }

  // L'Intendance (consignes configurées dans l'onglet Régulation) — après
  // protocoles_urgence : ses propres gardes (fatigue, cooldown, coûts) dedans.
  if (!gamePaused && !collapseInProgress) tickSteward();

  // Le moteur d'automatisation du Temple (osselets/Icare aux cadrans du joueur).
  // Mêmes gardes que l'Intendance ; ses propres cooldowns/plancher d'or dedans.
  if (!gamePaused && !collapseInProgress) tickTempleAutomation();

  checkAndTriggerChronicleEntries(state, dt);

  checkCrisisThresholds();
  if (gamePaused || collapseInProgress) return;

  if (crisisOpen() && !state.crisisLimitAnnounced && !collapseInProgress) {
    triggerCollapseChoices(false);
  }
}

// B1 — Célèbre chaque puissance de 10 de population franchie ce cycle (float
// doré). `popMilestoneExp` retient le dernier palier fêté (reset au cycle) pour
// ne pas répéter le même. Seuil ≥ 2 (100 hab) pour ignorer les pics minuscules.
function celebratePopMilestone() {
  const popF = toNum(state.population);
  const popExp = Number.isFinite(popF)
    ? Math.floor(Math.log10(Math.max(1, popF)))
    : Math.floor(toNum(D(state.population).max(1).log10()));
  if (popExp >= 2 && popExp > (state.popMilestoneExp || 0)) {
    state.popMilestoneExp = popExp;
    pushOutcomeFloat({ label: `✨ ${fmt(state.population)} de Rayonnement !`, kind: "gain" });
  }
}

// B2 — Délai aléatoire (ms) avant la prochaine aubaine (fenêtre douce).
// « Caravanes d'aubaine » (boonFrequency) : la fenêtre se resserre d'autant.
function scheduleBoonDelay() {
  const span = BOON_INTERVAL_MAX_SEC - BOON_INTERVAL_MIN_SEC;
  const freq = 1 + ruinEffectSum("boonFrequency");
  return ((BOON_INTERVAL_MIN_SEC + Math.random() * span) / freq) * 1000;
}

// B2 — Crédite immédiatement une aubaine tirée au sort : N secondes de la
// PRODUCTION COURANTE d'une ressource, float doré + dépêche. Partagé par
// l'horloge douce (maybeFireBoon) et la « Stagnation féconde » (tick).
// Hors ligne, l'aubaine CRÉDITE toujours mais reste muette : la Chronique de la
// simulation est jetée, et empiler des dizaines de floats au retour ferait un mur.
// ⚠ ON NE TIRE QUE PARMI LES AUBAINES QUI RAPPORTERAIENT VRAIMENT.
//
// Avant, le tirage était uniforme sur les cinq et abandonnait ensuite si la
// ressource choisie ne produisait rien. Or c'est un état COURANT, pas un cas
// limite : l'Or vaut 0/s tant que le Rayonnement est sous 25, ce qui est la
// situation de départ de chaque cycle. Une aubaine sur cinq tombait donc dans
// le vide — et, pire, l'horloge avait déjà été reprogrammée (voir
// maybeFireBoon) : le joueur repartait pour un intervalle complet sans avoir
// rien reçu ni rien vu.
//
// Le filtre porte sur le GAIN ARRONDI, pas sur le débit : un débit minuscule
// (0,001/s sur 110 s) donne 0,11, que `floor()` ramène à zéro. Filtrer sur
// « le débit est positif » aurait laissé passer exactement le même trou.
//
// Rend true si l'aubaine a été créditée, ce dont dépend la reprogrammation.
function fireBoon(r, silent = false) {
  const eligibles = [];
  for (const b of BOONS) {
    const gain = D(r[b.resource]).max(0).mul(b.seconds).floor();
    if (gain.gt(0)) eligibles.push({ boon: b, gain });
  }
  // Rien ne produit assez pour valoir une aubaine (tout début de partie, ou
  // Énée qui met la Nourriture et l'Or à zéro) : on ne crédite rien ET on ne
  // consomme pas l'attente.
  if (!eligibles.length) return false;
  const { boon, gain } = eligibles[Math.floor(Math.random() * eligibles.length)];
  state[boon.resource] = D(state[boon.resource]).add(gain);
  if (silent) { offlineBoons += 1; return true; }
  pushOutcomeFloat({ label: `${boon.icon} +${fmt(gain)}`, kind: "gain" });
  chronicle(boon.chronicle(fmt(gain)));
  return true;
}

// Aubaines créditées pendant l'absence en cours. Leur cadence les borne déjà
// (nextBoonAt vit sur l'horloge virtuelle), ce compteur est la ceinture.
let offlineBoons = 0;
export function resetOfflineBoonQuota() { offlineBoons = 0; }
const offlineBoonsLeft = () => offlineBoons < OFFLINE_MAX_BOONS;

// B2 — Déclenche une aubaine quand son horloge est échue, puis reprogramme.
function maybeFireBoon(r, silent = false) {
  const now = Date.now();
  if (!state.nextBoonAt) { state.nextBoonAt = now + scheduleBoonDelay(); return; }
  if (now < state.nextBoonAt) return;
  // ⚠ ON NE REPROGRAMME QUE SI L'AUBAINE A ÉTÉ CRÉDITÉE. L'ordre inverse était
  // le bug : l'horloge repartait AVANT le tirage, donc une aubaine tombée dans
  // le vide coûtait au joueur un intervalle entier — jusqu'à trente minutes
  // d'attente pour rien, et sans le moindre signe que quelque chose avait été
  // tenté. Ici l'échéance reste échue tant que rien ne peut être crédité : dès
  // que la cité produit à nouveau, l'aubaine due tombe.
  if (fireBoon(r, silent)) state.nextBoonAt = now + scheduleBoonDelay();
}
