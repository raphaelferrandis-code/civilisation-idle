import { tr, localizeData } from '../core/i18n.js';

export const EPITAPH_LEGACY_DURATION_MS = 8 * 60 * 1000;

// `icon` (emoji) sert aux libellés TEXTE (stèle, logs) ; `pixIcon` est
// l'icône pixel-art maison (PixelIcon, /pixelart/ui/) pour les sceaux d'UI.
export const EPITAPH_LEGACIES = [
  {
    id: "granaries",
    label: { fr: "Le Grain", en: "Grain" },
    logLabel: { fr: "le Grain", en: "Grain" },
    icon: "🌾",
    pixIcon: "ruins/food",
    tagline: { fr: "La prochaine cité mangera à sa faim.", en: "The next city will eat its fill." },
    ruinMult: 0.9,
    favoredCause: "famine",
    effects: {
      foodMult: 1.25,
      foodMultFavored: 1.4,
      goldMult: 0.92
    }
  },
  {
    id: "archives",
    label: { fr: "La Mémoire", en: "Memory" },
    logLabel: { fr: "la Mémoire", en: "Memory" },
    icon: "📜",
    pixIcon: "prep/archives",
    tagline: { fr: "La prochaine cité apprendra plus vite.", en: "The next city will learn faster." },
    ruinMult: 1,
    favoredCause: "time",
    effects: {
      knowledgeMult: 1.18,
      knowledgeMultFavored: 1.28,
      infraMult: 1.1,
      ruptureMult: 1.06
    }
  },
  {
    id: "laws",
    label: { fr: "L'Ordre", en: "Order" },
    logLabel: { fr: "l'Ordre", en: "Order" },
    icon: "⚖️",
    pixIcon: "ruins/stability",
    tagline: { fr: "La prochaine cité tiendra plus longtemps avant de céder.", en: "The next city will hold longer before it yields." },
    ruinMult: 0.85,
    favoredCause: "rupture",
    effects: {
      globalMult: 0.95,
      ruptureMult: 0.78,
      ruptureMultFavored: 0.66
    }
  },
  {
    id: "plunder",
    label: { fr: "Le Pillage", en: "Plunder" },
    logLabel: { fr: "le Pillage", en: "Plunder" },
    icon: "🔥",
    pixIcon: "ruins/node-autel_du_culte",
    tagline: { fr: "Tout est pris maintenant. Plus de ruines, rien ne sera transmis.", en: "Everything is taken now. More ruins, nothing passed on." },
    ruinMult: 1.25,
    favoredCause: "avarice",
    effects: {
      startingInstability: 0.1
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
  ["ruptureMult", { fr: "Montée de la Rupture", en: "Rise of Rupture" }]
];

// Décrit le legs d'un point de vue joueur : un chip par effet, signé et
// coloré (gain/coût), en tenant compte de l'affinité avec la cause de chute.
// Sur un legs favorisé, le renfort est MATÉRIALISÉ (« +25% → +40% ») : la
// valeur renforcée seule ne montrerait pas ce que l'affinité apporte.
export function epitaphLegacyChips(legacy, cause) {
  const fx = legacy?.effects || {};
  const favored = legacy?.favoredCause === cause;
  const chips = [];
  const signed = (d) => `${d > 0 ? "+" : "−"}${Math.abs(d)}%`;
  for (const [key, label] of LEGACY_EFFECT_LABELS) {
    if (fx[key] == null) continue;
    const boosted = favored && fx[`${key}Favored`] != null;
    const value = boosted ? fx[`${key}Favored`] : fx[key];
    const delta = Math.round((value - 1) * 100);
    if (!delta) continue;
    const beneficial = key === "ruptureMult" ? delta < 0 : delta > 0;
    const baseDelta = Math.round((fx[key] - 1) * 100);
    chips.push({
      label: boosted
        ? `${tr(label)} ${signed(baseDelta)} → ${signed(delta)}`
        : `${tr(label)} ${signed(delta)}`,
      kind: beneficial ? "gain" : "cost",
      boosted
    });
  }
  if (fx.startingInstability) {
    chips.push({ label: `${tr({ fr: "Rupture de départ", en: "Starting Rupture" })} +${Math.round(fx.startingInstability * 100)}%`, kind: "cost" });
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
