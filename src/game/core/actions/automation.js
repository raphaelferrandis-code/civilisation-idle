"use strict";

import {
  state,
  defaultAutoScriptRules,
  defaultAutomateRules,
  RULE_LABELS,
  AUTOMATE_FIELD_BOUNDS,
  invalidateRenderCache,
  render,
  save,
  saveSoon,
  isOfflineSim,
  buildingById
} from '../state.js';

import {
  buildingBatchCost,
  isUnlocked,
  crisisCosts
} from '../mechanics.js';

import { buildings } from '../../data/buildings.js';
import { AUTO_COLLAPSE_MIN_SECONDS } from '../balance.js';
import { canPayCost, clamp } from '../utils.js';
import { buyBuildingCore, buyableInMass } from './building.js';
import { roadWorkCost } from './roadWorks.js';
import { stewardFatigued, stewardCoolingDown } from './steward.js';
import { tr } from '../i18n.js';
import { D } from '../num.js';
import { collapse, runCrisisAction } from './crisis.js';
import { log, chronicle } from './utils.js';

export function initAutoScriptRules() {
  state.autoScriptRules = defaultAutoScriptRules();
  return state.autoScriptRules;
}

export function getAutoScriptRules() {
  if (!state.autoScriptRules) initAutoScriptRules();
  return state.autoScriptRules;
}

export function toggleAutoScriptRule(id) {
  const rule = getAutoScriptRules().find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  save();
  invalidateRenderCache("all");
  render();
}

export function setAutoScriptThreshold(id, raw) {
  const rule = getAutoScriptRules().find((r) => r.id === id);
  if (!rule) return;
  const val = parseFloat(raw);
  // La règle « minutes » ne descend pas sous le plancher des minuteurs d'effondrement.
  const floor = rule.type === "time" ? AUTO_COLLAPSE_MIN_SECONDS / 60 : 1;
  if (!isNaN(val)) rule.threshold = Math.max(floor, Math.min(9999, val));
  save();
  render();
}

export function checkAutoScriptRules() {
  // Pendant la simulation hors-ligne, seul l'Édit effondre (chemin synchrone de
  // simulateAwayCrises) : collapse() y lancerait une séquence async qui pose
  // gamePaused et casse la boucle de sim (même garde que le Bûcher, tick.js).
  if (isOfflineSim()) return;
  for (const rule of getAutoScriptRules()) {
    if (!rule.enabled) continue;
    let triggered = false;
    if (rule.type === "rupture") triggered = state.instability * 100 >= rule.threshold;
    if (rule.type === "usure")   triggered = (state.timeWear || 0) * 100 >= rule.threshold;
    if (rule.type === "time") {
      const elapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
      triggered = elapsed >= rule.threshold;
    }
    if (triggered) {
      // collapse() refuse une chute à gain nul (petite cité de moins de 2 min de
      // cycle) : la ligne ne s'écrit que si la chute part VRAIMENT. Écrite avant l'appel,
      // elle mentait et se répétait à chaque tick, jusqu'à vider les 48 lignes
      // du journal (audit 2026-10-05, BUG-74). Les autres règles feraient le
      // même calcul de gain : on s'arrête là dans les deux cas.
      if (!collapse("auto_script")) return;
      // Libellé lu dans la table par id, comme les Options (I18N-7).
      const label = RULE_LABELS[rule.id] || { fr: rule.id, en: rule.id };
      const amountEn = rule.unit === "%" ? `${rule.threshold}%` : `${rule.threshold} ${rule.unit}`;
      log(tr({
        fr: `Script : « ${label.fr} ${rule.threshold} ${rule.unit} », effondrement déclenché.`,
        en: `Script: “${label.en} ${amountEn}”, collapse triggered.`
      }));
      return;
    }
  }
}

export function initAutomateRules() {
  state.automateRules = defaultAutomateRules();
  return state.automateRules;
}

export function getAutomateRules() {
  if (!state.automateRules) initAutomateRules();
  return state.automateRules;
}

export function toggleAutomate(id) {
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  save();
  invalidateRenderCache("all");
  render();
}

// Champ numérique d'un automate (réserve, débit). Bornes prises dans
// AUTOMATE_FIELD_BOUNDS, la MÊME table que l'hydratation : une valeur acceptée
// ici mais rejetée au rechargement serait un réglage qui s'évapore.
export function setAutomateField(id, field, raw) {
  const bounds = AUTOMATE_FIELD_BOUNDS[field];
  if (!bounds) return;
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule || !(field in rule)) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule[field] = clamp(Math.round(val), bounds[0], bounds[1]);
  // saveSoon : même motif que setTempleAuto, une save() pleine par réglage est un
  // gaspillage (audit A.8). Les champs réserve/débit des Options ne l'appellent
  // plus qu'à la validation (DraftNumberInput, BUG-113), mais le filet reste.
  saveSoon();
  render();
}

export function setAutomateThreshold(id, raw) {
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule.threshold = Math.max(1, Math.min(99, val));
  // saveSoon, comme setAutomateField (audit A.8) : une save() pleine (~270 Ko)
  // par réglage n'a pas lieu d'être (audit 2026-10-05, BUG-113).
  saveSoon();
  render();
}

// ── Doctrine de crise (cf. CE-spec-idle-crises.md §A) ────────────────────────
// Setters UI : posture par palier + configuration de l'auto-effondrement.
export function setCrisisPosture(palier, stance) {
  if (!state.crisisDoctrine) return;
  if (!["p25", "p50", "p75"].includes(palier)) return;
  if (!["ask", "stabiliser", "temporiser"].includes(stance)) return;
  state.crisisDoctrine[palier] = stance;
  save();
  invalidateRenderCache("all");
  render();
}

export function setAutoCollapseConfig(patch) {
  const ac = state.crisisDoctrine && state.crisisDoctrine.autoCollapse;
  if (!ac || !patch) return;
  if ("enabled" in patch) ac.enabled = Boolean(patch.enabled);
  if ("trigger" in patch && ["rupture100", "usure", "temps"].includes(patch.trigger)) ac.trigger = patch.trigger;
  if ("usureThreshold" in patch) { const v = parseFloat(patch.usureThreshold); if (!isNaN(v)) ac.usureThreshold = Math.max(0.1, Math.min(1, v)); }
  if ("timeSeconds" in patch) { const v = parseInt(patch.timeSeconds, 10); if (!isNaN(v)) ac.timeSeconds = Math.max(AUTO_COLLAPSE_MIN_SECONDS, Math.min(24 * 3600, v)); }
  if ("prepare" in patch) ac.prepare = Boolean(patch.prepare);
  save();
  invalidateRenderCache("all");
  render();
}

// Le prix laisserait-il au moins `reserve` (fraction du stock courant) sur
// chaque devise dépensée ? Comparaisons en Decimal de bout en bout : les stocks
// dépassent vite le float.
function leavesReserve(prices, reserve) {
  for (const [currency, price] of Object.entries(prices)) {
    const stock = D(state[currency] || 0);
    if (stock.sub(D(price)).lt(stock.mul(reserve))) return false;
  }
  return true;
}

// Chronique de l'auto-achat AGRÉGÉE : une ligne par minute au plus, qui compte
// tout ce qui a été érigé depuis la précédente. À une ligne par tick (1 Hz),
// les 48 lignes gardées par log() — et les 5 du journal de l'Effondrement —
// n'étaient plus que des achats automatiques en moins d'une minute : crises,
// vœux, ères et Mythes en disparaissaient (audit 2026-10-05, BUG-75). État de
// MODULE, non sauvegardé : au pire, un rechargement perd le compte d'une minute.
const AUTO_BUY_CHRONICLE_MS = 60_000;
let autoBuyPending = 0;
let autoBuyLastName = "";
let autoBuyLastLineAt = 0;
let autoBuyCycle = -1;

function noteAutoBuys(count, lastName) {
  // La Chronique d'une simulation hors ligne est jetée à la fin : rien à compter.
  if (isOfflineSim()) return;
  // Un compte entamé dans la cité tombée ne se reporte pas dans la suivante.
  const cycle = state.cycles || 0;
  if (cycle !== autoBuyCycle) {
    autoBuyCycle = cycle;
    autoBuyPending = 0;
    autoBuyLastLineAt = 0;
  }
  if (count > 0) {
    autoBuyPending += count;
    autoBuyLastName = lastName;
  }
  if (autoBuyPending <= 0) return;
  const now = Date.now();
  if (now >= autoBuyLastLineAt && now - autoBuyLastLineAt < AUTO_BUY_CHRONICLE_MS) return;
  const n = autoBuyPending;
  const name = autoBuyLastName;
  autoBuyPending = 0;
  autoBuyLastLineAt = now;
  // Le nom n'est mis en minuscules que dans la phrase française.
  chronicle(n === 1
    ? tr({
        fr: `Les mécanismes automatiques ont discrètement érigé : ${name.toLowerCase()}.`,
        en: `The automatic mechanisms have quietly raised: ${name}.`
      })
    : tr({
        fr: `Les mécanismes automatiques ont discrètement érigé ${n} bâtiments, jusqu'à : ${name.toLowerCase()}.`,
        en: `The automatic mechanisms have quietly raised ${n} buildings, up to: ${name}.`
      }));
}

export function checkAutomateRules() {
  let builtThisTick = 0;
  let lastBuiltName = "";
  for (const rule of getAutomateRules()) {
    if (!rule.enabled) continue;
    if (rule.type === "buy_cheapest") {
      const [rMin, rMax] = AUTOMATE_FIELD_BOUNDS.reservePct;
      const [pMin, pMax] = AUTOMATE_FIELD_BOUNDS.perTick;
      const reserve = clamp(Number(rule.reservePct) || 0, rMin, rMax) / 100;
      const perTick = clamp(Math.floor(Number(rule.perTick) || 1), pMin, pMax);
      let bought = 0;
      for (let pass = 0; pass < perTick; pass += 1) {
        // Candidats : la MÊME garde que « Tout acheter » (buyableInMass). Elle
        // écarte la voirie, dont le prix de « bâtiment » est fictif : presque
        // toujours le moins cher, elle était choisie à chaque fois, refusée dès
        // que la file de chantiers était pleine, et l'automate s'arrêtait là —
        // plus aucun aqueduc, ni égout, ni ministère (audit 2026-10-05, BUG-6).
        // Elle écarte aussi toute devise de prestige (ruin_architects, M5). Prix
        // lu par buildingBatchCost, celui que buyBuildingCore fait payer, calculé
        // une fois par candidat et non dans le comparateur du tri.
        const candidates = [];
        for (const b of buildings) {
          if (b.category !== rule.category || !buyableInMass(b)) continue;
          const prices = buildingBatchCost(b, 1);
          // RÉSERVE : ce que l'automate ne touche pas. Sans elle, l'auto-achat
          // vidait la caisse et sabotait les autres branches, donc on le laissait
          // éteint. Testée sur TOUTES les devises du lot, coût principal et
          // extraCost compris, sinon la réserve fuit par la porte de derrière.
          if (reserve > 0 && !leavesReserve(prices, reserve)) continue;
          // Hors de prix : buyBuildingCore le refuserait sur ce MÊME prix, après
          // l'avoir recalculé. Écarté AVANT le tri : la plupart des ticks rien
          // n'est abordable, et trier puis re-chiffrer chaque candidat pesait la
          // moitié du rattrapage hors ligne (audit 2026-10-05, PERF-17). Le tri
          // est stable : l'ordre des restants ne change pas.
          if (!canPayCost(prices)) continue;
          candidates.push({ b, prices });
        }
        candidates.sort((x, y) => D(x.prices[x.b.currency]).cmp(y.prices[y.b.currency]));
        let built = null;
        for (const { b } of candidates) {
          // buyBuildingCore paie, incrémente ET applique les contraintes de Mythe
          // (Babel/Sisyphe/Prométhée) + lifetimePurchases — que l'ancien payCost
          // direct contournait. silent : l'automate garde sa propre chronique.
          // auto : le journal de Sisyphe dit qu'un automate a lâché le rocher.
          // Un refus passe au candidat suivant au lieu d'arrêter l'automate.
          if (buyBuildingCore(b.id, { amount: 1, silent: true, auto: true })) { built = b; break; }
        }
        if (!built) break;
        bought += 1;
        lastBuiltName = tr(built.name);
      }
      // VOIRIE, servie À PART et après les bâtiments : un chantier refusé (file
      // ou réserve de chantiers pleine) ne bloque plus rien. Un chantier par tick
      // au plus, sous la même réserve, lue sur le prix du chantier ; le verrou de
      // Babel est appliqué par buyBuildingCore.
      const roads = buildingById.roads;
      let roadWork = false;
      if (roads && rule.category === roads.category && isUnlocked(roads)) {
        const workCost = roadWorkCost();
        if (workCost && (reserve <= 0 || leavesReserve({ [roads.currency]: workCost }, reserve))) {
          roadWork = buyBuildingCore(roads.id, { amount: 1, silent: true });
        }
      }
      if (bought > 0 || roadWork) invalidateRenderCache("buildings");
      builtThisTick += bought;
    }
    if (rule.type === "crisis_action") {
      // Le SEUIL de la règle fait foi (1-99 %), PAS l'ouverture de crise :
      // crisisOpen() exige déjà instability >= 100 %, ce qui rendait le seuil
      // mort (l'automate ne pouvait tirer qu'à 100 % pile). On exclut la crise
      // terminale, où seul l'intendant (force) agit.
      if (state.crisisLimitAnnounced || state.instability * 100 < rule.threshold) continue;
      // Mêmes garde-fous que l'Intendance (audit 2026-10-05, BUG-29) : sans eux,
      // un saut de Rupture déclenchait un rationnement PAR TICK — 8 en 15 s, la
      // nourriture écrasée vers son plancher et l'Olympe gonflé à chaque tir.
      const now = Date.now();
      if (stewardFatigued() || stewardCoolingDown(rule.lastAt, now)) continue;
      const costs = crisisCosts();
      // Garde : un actionId absent de crisisCosts() donne `undefined` →
      // canPayCost fait Object.entries(undefined) → throw dans le tick.
      const cost = costs[rule.actionId];
      if (cost && canPayCost(cost)) {
        rule.lastAt = now;
        runCrisisAction(rule.actionId, { render: false });
      }
    }
  }
  noteAutoBuys(builtThisTick, lastBuiltName);
  // Pas de render() : checkAutomateRules ne tourne que dans le tick, et la boucle
  // notifie juste après — un second passage re-évaluait tous les sélecteurs pour
  // rien (audit 2026-10-05, PERF-69).
}
