import { pressureBreakdown, crisisCosts, regulationContext, regulationActionUnlocked, regulationPolicyUnlocked } from '../../game/core/mechanics.js';
import { state } from '../../game/core/state.js';
import { FOYER_RELIEF_ADD, FOYER_MALUS_RESOURCE, FOYER_MALUS_PCT, FOYER_REFORM, FOYER_REFORM_CAP, POLICY_MAX_ACTIVE } from '../../game/core/balance.js';
import { REGULATION_ACTIONS, REGULATION_POLICIES } from '../../game/data/regulationActions.js';
import { tr } from '../../game/core/i18n.js';

/**
 * LA RÉGULATION EN DONNÉES D'AFFICHAGE : les quatre foyers avec leurs décrets,
 * et les politiques permanentes. SOURCE UNIQUE pour la poignée de la Cité
 * (CrisisActionBar) et pour le Conseil (RegulationView) — deux copies de ces
 * listes finiraient par annoncer des décrets différents au même instant.
 * Lit l'état courant : à appeler au rendu d'un composant abonné au tick.
 */

export const RES_LABEL = {
  food: { fr: 'nourriture', en: 'food' },
  gold: { fr: 'trésor', en: 'treasury' },
  knowledge: { fr: 'savoir', en: 'knowledge' },
  infrastructure: { fr: 'infrastructure', en: 'infrastructure' }
};

// Métadonnées d'affichage des 4 foyers. SOURCE UNIQUE, partagée par le panneau
// déplié (tableau d'actions), sa POIGNÉE repliée (RegulSummary) et le Conseil :
// sans elle, renommer un foyer d'un côté le ferait mentir de l'autre.
export const FOYER_META = [
  { key: 'scarcity',   tone: 'food',  label: { fr: 'Subsistance', en: 'Subsistence' } },
  { key: 'inequality', tone: 'gold',  label: { fr: 'Inégalités',  en: 'Inequality' } },
  { key: 'complexity', tone: 'know',  label: { fr: 'Complexité',  en: 'Complexity' } },
  { key: 'dissent',    tone: 'usure', label: { fr: 'Dissidence',  en: 'Dissent' } }
];
const FOYER_BY_KEY = Object.fromEntries(FOYER_META.map((m) => [m.key, m]));

// LE FOYER QUI PÈSE LE PLUS, désigné seulement à partir de la crise profonde (75 %,
// le palier de la jauge de Rupture) : la barre de la Cité le peint en rouge et met
// son édit en or. Plus tôt aucun foyer n'est un danger, et le rouge comme l'or
// restent réservés au danger et au geste à faire maintenant (retour extérieur du
// 2026-10-07, maquette « Lisibilité de la Cité »).
export const DOMINANT_FOYER_FROM = 0.75;

// `entries` : [clé, pression] de chaque foyer. null sous le seuil, ou si aucun ne pèse.
export function dominantFoyerKey(entries, instability) {
  if (!(instability >= DOMINANT_FOYER_FROM)) return null;
  let best = null;
  for (const [key, value] of entries) {
    if ((value || 0) > 0 && (best === null || value > best[1])) best = [key, value];
  }
  return best ? best[0] : null;
}

// Action id de la réforme de fond par foyer.
const REFORM_ID = {
  scarcity: 'reformScarcity',
  inequality: 'reformInequality',
  complexity: 'reformComplexity',
  dissent: 'reformDissent'
};

// Descripteur d'affichage d'une action d'apaisement : ce qu'elle calme (relief
// temporaire) et sa contrepartie (malus de production).
function describeAction(id, cost) {
  return {
    id,
    cost,
    relief: FOYER_RELIEF_ADD[id] || 0,
    malusRes: FOYER_MALUS_RESOURCE[id],
    malusPct: FOYER_MALUS_PCT[id] || 0
  };
}

// Descripteur d'une réforme de fond : recul DURABLE déposé sur le foyer, déjà
// acquis (currentReform), et saturation au plafond de la RÉFORME (atCap) —
// FOYER_REFORM_CAP (0.72), le même que le moteur (crisis.js) : griser à
// FOYER_RELIEF_CAP (0.45, celui de l'apaisement) bloquait le joueur à mi-chemin.
function describeReform(foyer, cost, currentReform) {
  return {
    id: REFORM_ID[foyer],
    cost,
    reform: true,
    durableAdd: FOYER_REFORM[foyer]?.add || 0,
    currentReform: currentReform || 0,
    atCap: (currentReform || 0) >= FOYER_REFORM_CAP - 1e-6
  };
}

// Descripteur d'une action déblocable (registre) : apaisement ou réforme, avec
// éventuel effet économique (bonus), et état verrouillé/débloqué.
function describeRegAction(action, cost, ctx, currentReform) {
  const unlocked = regulationActionUnlocked(action.id, ctx);
  const isReform = action.kind === 'reform';
  return {
    id: action.id,
    label: action.label,
    cost,
    locked: !unlocked,
    unlockLabel: action.unlockLabel,
    reform: isReform,
    relief: isReform ? 0 : (action.relief || 0),
    note: action.note,
    durableAdd: action.reformAdd || 0,
    currentReform: currentReform || 0,
    atCap: isReform && (currentReform || 0) >= FOYER_REFORM_CAP - 1e-6,
    malusRes: action.malusRes,
    malusPct: action.malusPct || 0,
    bonus: action.infraAdd ? 'infra' : null,
    gamble: action.kind === 'gamble'
  };
}

/**
 * Les quatre foyers et leurs décrets, dans l'ordre d'affichage. Chaque foyer :
 * { key, label, tone, value, actions } ; chaque décret porte de quoi s'afficher
 * (coût, effet, contrepartie) et de quoi se jouer (id → runCrisisAction).
 */
export function regulationFoyers() {
  const pressure = pressureBreakdown();
  const costs = crisisCosts();
  const reform = state.foyerReform || {};
  const ctx = regulationContext();
  const act = (id, label) => ({ label, ...describeAction(id, costs[id]) });
  const ref = (foyer) => ({ label: tr(FOYER_REFORM[foyer].label), ...describeReform(foyer, costs[REFORM_ID[foyer]], reform[foyer]) });
  // Actions déblocables du registre pour un foyer (triées par palier ; les
  // verrouillées s'affichent en aperçu « 🔒 Ère / mythe »).
  const regFor = (foyerKey) => REGULATION_ACTIONS
    .filter((a) => a.foyer === foyerKey)
    .sort((a, b) => a.tier - b.tier)
    .map((a) => describeRegAction(a, costs[a.id], ctx, reform[foyerKey]));
  const foyer = (key, actions) => ({
    key,
    label: tr(FOYER_BY_KEY[key].label),
    tone: FOYER_BY_KEY[key].tone,
    value: pressure[key],
    actions
  });
  return [
    foyer('scarcity', [act('rationing', tr({ fr: 'Rationner', en: 'Ration' })), ref('scarcity'), ...regFor('scarcity')]),
    foyer('inequality', [act('festivals', tr({ fr: 'Jeux civiques', en: 'Civic Games' })), ref('inequality'), ...regFor('inequality')]),
    foyer('complexity', [act('census', tr({ fr: 'Recenser', en: 'Census' })), act('reforms', tr({ fr: 'Réformes', en: 'Reforms' })), ref('complexity'), ...regFor('complexity')]),
    foyer('dissent', [
      // Paliers de cycle : la source moteur unique (crisis-cost.js), celle
      // qu'impose runCrisisAction — plus de seuils recopiés ici.
      regulationActionUnlocked('ancestorCrisis', ctx) && act('ancestorCrisis', tr({ fr: 'Culte des ancêtres', en: 'Ancestor Cult' })),
      regulationActionUnlocked('archiveCrisis', ctx) && act('archiveCrisis', tr({ fr: 'Catastrophes', en: 'Catastrophes' })),
      ref('dissent'),
      ...regFor('dissent')
    ].filter(Boolean))
  ];
}

/** Les politiques permanentes (Levier C) et l'occupation de leurs emplacements. */
export function regulationPolicies() {
  const ctx = regulationContext();
  const activePolicies = state.activePolicies || [];
  return {
    policies: REGULATION_POLICIES.map((p) => ({
      ...p,
      active: activePolicies.includes(p.id),
      locked: !regulationPolicyUnlocked(p.id, ctx)
    })),
    activeCount: activePolicies.length,
    max: POLICY_MAX_ACTIVE,
    slotsFull: activePolicies.length >= POLICY_MAX_ACTIVE
  };
}

// Effet d'une politique en libellé court (cumule riseSlow / surcharge / étouffement).
// Le nom d'un foyer vient de FOYER_META (la source unique — une table FOYER_SHORT le
// recopiait mot pour mot, audit du 05/10, STRUCT-12).
export function policyEffectLabel(p) {
  const parts = [];
  if (p.riseSlow) parts.push(`−${Math.round(p.riseSlow * 100)}% ${tr({ fr: 'montée de la Rupture', en: 'Rupture rise' })}`);
  if (p.overshootDamp) parts.push(`−${Math.round(p.overshootDamp * 100)}% ${tr({ fr: 'surcharge', en: 'overshoot' })}`);
  if (p.foyerDamp) {
    for (const [f, v] of Object.entries(p.foyerDamp)) {
      parts.push(`−${Math.round(v * 100)}% ${tr(FOYER_BY_KEY[f]?.label) || f} ${tr({ fr: '(continu)', en: '(continuous)' })}`);
    }
  }
  if (p.demesureDamp) parts.push(`−${Math.round(p.demesureDamp * 100)}% ${tr({ fr: 'Démesure (échelle)', en: 'Hubris (scale)' })}`);
  return parts.join(' · ');
}

// Coût continu d'une politique en libellé court (« −10% production · −15% trésor »).
export function policyCostLabel(cost) {
  const parts = [];
  if (cost.global) parts.push(`−${Math.round(cost.global * 100)}% ${tr({ fr: 'production', en: 'production' })}`);
  for (const [res, v] of Object.entries(cost)) {
    if (res === 'global') continue;
    parts.push(`−${Math.round(v * 100)}% ${tr(RES_LABEL[res]) || res}`);
  }
  return parts.join(' · ');
}
