import { tr, localizeData } from '../core/i18n.js';

// LES LEGS (« Choisir sa chute », 2026-10). Un legs agit sur TOUT le cycle
// suivant (avant : 8 min, négligeable sur des cycles de plusieurs heures) et se
// paie MAINTENANT (ruinMult) ou PLUS TARD. Comme les crises qui comptent, il agit
// sur ce qui décide vraiment de la durée d'une cité — un FOYER de la cible de
// Rupture (foyerShift, part absolue jusqu'à la chute) ou l'Usure (wearMult) —
// plus un petit bonus de production. Logique : la cité lègue ce qui l'a tuée.
//   Grain   (famine)  : Subsistance allégée, Nourriture +
//   Mémoire (temps)   : Usure ralentie, Savoir + — le legs des cités qui durent
//   Ordre   (rupture) : Complexité et Dissidence allégées
//   Pillage (avarice) : Ruines + TOUT DE SUITE, Inégalités endettées ensuite
// L'AFFINITÉ (favoredCause) renforce le legs assorti à la cause de la chute,
// qui suit le foyer dominant (events.collapseCause) : elle se pilote par les
// crises, les réformes et les réserves → choisir comment tomber.
// Montants calibrés par bench-crises.js (--legacy / --legfx, 24 h, 6 graines,
// joueur lucide) : sans legs 1 842 Ruines ; EN AFFINITÉ Grain 2 084, Pillage
// 2 120, Ordre 2 251 ; hors affinité ≈ +4 %. La Mémoire (Usure) n'est pas
// mesurable par le banc, qui coupe ses cycles à 4 h, avant l'échéance d'Usure.
//
// `icon` (emoji) sert aux libellés TEXTE (stèle, logs) ; `pixIcon` est
// l'icône pixel-art maison (PixelIcon, /pixelart/ui/) pour les sceaux d'UI.
export const EPITAPH_LEGACIES = [
  {
    id: "granaries",
    label: { fr: "Le Grain", en: "Grain" },
    logLabel: { fr: "le Grain", en: "Grain" },
    icon: "🌾",
    pixIcon: "res/food",
    tagline: { fr: "La prochaine cité mangera à sa faim.", en: "The next city will eat its fill." },
    ruinMult: 0.9,
    favoredCause: "famine",
    effects: {
      foyerShift: { scarcity: -0.03 },
      foyerShiftFavored: { scarcity: -0.05 },
      foodMult: 1.1
    }
  },
  {
    id: "archives",
    label: { fr: "La Mémoire", en: "Memory" },
    logLabel: { fr: "la Mémoire", en: "Memory" },
    icon: "📜",
    pixIcon: "prep/archives",
    tagline: { fr: "La prochaine cité apprendra à durer.", en: "The next city will learn to last." },
    // Sans coût en Ruines : son bienfait (l'Usure) ne joue que pour une cité
    // qui tient jusqu'à son échéance — situationnel par nature.
    ruinMult: 1,
    favoredCause: "time",
    effects: {
      wearMult: 0.85,
      wearMultFavored: 0.75,
      knowledgeMult: 1.1
    }
  },
  {
    id: "laws",
    label: { fr: "L'Ordre", en: "Order" },
    logLabel: { fr: "l'Ordre", en: "Order" },
    icon: "⚖️",
    pixIcon: "seals/neighborhoodMilitia",
    tagline: { fr: "La prochaine cité tiendra plus longtemps avant de céder.", en: "The next city will hold longer before it yields." },
    ruinMult: 0.9,
    favoredCause: "rupture",
    effects: {
      foyerShift: { complexity: -0.02, dissent: -0.02 },
      foyerShiftFavored: { complexity: -0.03, dissent: -0.03 }
    }
  },
  {
    id: "plunder",
    label: { fr: "Le Pillage", en: "Plunder" },
    logLabel: { fr: "le Pillage", en: "Plunder" },
    icon: "🔥",
    pixIcon: "ruins/gold-keep",
    tagline: { fr: "Tout est pris maintenant. Plus de ruines ; la prochaine cité naîtra endettée.", en: "Everything is taken now. More ruins; the next city will be born in debt." },
    ruinMult: 1.25,
    favoredCause: "avarice",
    effects: {
      foyerShift: { inequality: 0.06 }
    },
    favoredRuinMult: 1.35
  }
];

// LES QUATRE CAUSES DE CHUTE, registre unique. C'est l'ensemble EXACT des
// valeurs que rend collapseCause() (core/events.js) ; toute table indexée par
// une cause doit les couvrir toutes les quatre, et la porte de test
// cycleReport.test.js échoue sinon.
//
// ⚠ NE PAS CONFONDRE avec le `reason` d'un effondrement (« manual »,
// « auto_collapse », « forced », « auto_script »), qui dit par quel CHEMIN la
// cité est tombée et non de quoi elle est morte. Les deux voyagent côte à côte
// et sous le même nom de champ : state.lastCycleReport.cause porte la cause
// physique, state.prevCycle.cause porte le reason. Le bandeau de bilan a
// justement été écrit avec deux clés de reason dans sa table de causes, et
// imprimait la clé brute sur deux chutes sur quatre.
export const COLLAPSE_CAUSES = ["time", "famine", "avarice", "rupture"];

export const FAVORED_CAUSE_LABELS = {
  famine: { fr: "chute par famine", en: "fall by famine" },
  time: { fr: "chute par usure du temps", en: "fall by the wear of time" },
  rupture: { fr: "chute par rupture", en: "fall by rupture" },
  avarice: { fr: "chute par avarice", en: "fall by avarice" }
};

// Même clé, autre phrase. Le bandeau de bilan de cycle écrit « Emportée par X »,
// donc un groupe nominal avec son article, quand le sceau écrit X tout seul.
// Les deux tables vivent ici plutôt que dans leur composant pour que le registre
// et ses libellés se relisent d'un seul coup d'œil, et parce qu'une constante
// exportée depuis un .jsx casse le rafraîchissement à chaud (react-refresh).
export const COLLAPSE_CAUSE_LABELS = {
  time: { fr: "l'usure du temps", en: "the wear of time" },
  famine: { fr: "la famine", en: "famine" },
  avarice: { fr: "l'avarice de ses élites", en: "the avarice of its elites" },
  rupture: { fr: "la Rupture", en: "Rupture" }
};

export function epitaphLegacyById(id) {
  return EPITAPH_LEGACIES.find((legacy) => legacy.id === id) || null;
}

export function epitaphRuinMultiplier(legacy, cause) {
  if (!legacy) return 1;
  if (legacy.favoredCause === cause && legacy.favoredRuinMult) return legacy.favoredRuinMult;
  return legacy.ruinMult || 1;
}

const LEGACY_EFFECT_LABELS = [
  ["foodMult", { fr: "Nourriture", en: "Food" }],
  ["knowledgeMult", { fr: "Savoir", en: "Knowledge" }],
  ["goldMult", { fr: "Trésor", en: "Treasury" }],
  ["infraMult", { fr: "Infrastructure", en: "Infrastructure" }],
  ["globalMult", { fr: "Production globale", en: "Global production" }],
  ["ruptureMult", { fr: "Rupture visée", en: "Target Rupture" }],
  ["wearMult", { fr: "Usure", en: "Wear" }]
];
// Effets où « moins » est un bienfait.
const LOWER_IS_BETTER = new Set(["ruptureMult", "wearMult"]);
const FOYER_LABELS = {
  scarcity: { fr: "Subsistance", en: "Subsistence" },
  inequality: { fr: "Inégalités", en: "Inequality" },
  complexity: { fr: "Complexité", en: "Complexity" },
  dissent: { fr: "Dissidence", en: "Dissent" }
};

// Valeur EFFECTIVE d'un effet multiplicatif du legs (1 = sans effet) : la
// valeur d'affinité si la chute y correspond, puis « Épitaphes profondes »
// (amp = ruinEffectSum("epitaphAmp")) qui renforce les BIENFAITS seulement —
// un nœud acheté n'aggrave pas les contreparties. Source unique : le moteur
// (mythEffects.epitaphLegacyEffect) et les chips d'affichage la lisent.
export function legacyEffectValue(legacy, key, cause, amp = 0) {
  const fx = legacy?.effects || {};
  if (fx[key] == null) return 1;
  const favored = legacy.favoredCause === cause && fx[`${key}Favored`] != null;
  const value = favored ? fx[`${key}Favored`] : fx[key];
  const beneficial = LOWER_IS_BETTER.has(key) ? value < 1 : value > 1;
  return beneficial ? 1 + (value - 1) * (1 + amp) : value;
}

// Parts déposées sur les FOYERS au début du cycle suivant ({ foyer: part }) :
// négative = allègement (renforcé par l'affinité puis « Épitaphes profondes »),
// positive = dette (le Pillage), jamais amplifiée. Lu par completeCollapse.
export function legacyFoyerShift(legacy, cause, amp = 0) {
  const fx = legacy?.effects || {};
  const base = (legacy?.favoredCause === cause && fx.foyerShiftFavored) || fx.foyerShift || {};
  const out = {};
  for (const [foyer, shift] of Object.entries(base)) out[foyer] = shift < 0 ? shift * (1 + amp) : shift;
  return out;
}

// Décrit le legs d'un point de vue joueur : un chip par effet, signé et
// coloré (gain/coût), en tenant compte de l'affinité avec la cause de chute.
// Sur un legs favorisé, le renfort est MATÉRIALISÉ (« +25% → +40% ») : la
// valeur renforcée seule ne montrerait pas ce que l'affinité apporte.
// `amp` : renfort « Épitaphes profondes » (mythEffects.epitaphLegacyAmp()).
export function epitaphLegacyChips(legacy, cause, amp = 0) {
  const fx = legacy?.effects || {};
  const chips = [];
  const signed = (d) => `${d > 0 ? "+" : "−"}${Math.abs(d)}%`;
  for (const [key, label] of LEGACY_EFFECT_LABELS) {
    if (fx[key] == null) continue;
    const boosted = legacy.favoredCause === cause && fx[`${key}Favored`] != null;
    const delta = Math.round((legacyEffectValue(legacy, key, cause, amp) - 1) * 100);
    if (!delta) continue;
    const beneficial = LOWER_IS_BETTER.has(key) ? delta < 0 : delta > 0;
    const baseDelta = Math.round((legacyEffectValue(legacy, key, null, amp) - 1) * 100);
    chips.push({
      label: boosted
        ? `${tr(label)} ${signed(baseDelta)} → ${signed(delta)}`
        : `${tr(label)} ${signed(delta)}`,
      kind: beneficial ? "gain" : "cost",
      boosted
    });
  }
  const shifts = legacyFoyerShift(legacy, cause, amp);
  const baseShifts = legacyFoyerShift(legacy, null, amp);
  for (const [foyer, shift] of Object.entries(shifts)) {
    const pct = Math.round(shift * 100);
    const basePct = Math.round((baseShifts[foyer] || 0) * 100);
    const boosted = pct !== basePct;
    chips.push({
      label: boosted
        ? `${tr(FOYER_LABELS[foyer])} ${signed(basePct)} → ${signed(pct)}`
        : `${tr(FOYER_LABELS[foyer])} ${signed(pct)}`,
      kind: shift < 0 ? "gain" : "cost",
      boosted
    });
  }
  if (!chips.length) {
    chips.push({ label: tr({ fr: "Aucun legs productif", en: "No productive legacy" }), kind: "info" });
  }
  return chips;
}

// Aplatit les feuilles { fr, en } en chaînes de la langue courante (cf. i18n.js).
// LEGACY_EFFECT_LABELS reste en { fr, en } : il est résolu via tr() au point de
// lecture dans epitaphLegacyChips().
localizeData(EPITAPH_LEGACIES);
localizeData(FAVORED_CAUSE_LABELS);
localizeData(COLLAPSE_CAUSE_LABELS);
