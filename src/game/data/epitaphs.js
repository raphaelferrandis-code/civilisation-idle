import { tr, localizeData } from '../core/i18n.js';

export const EPITAPH_LEGACY_DURATION_MS = 8 * 60 * 1000;

export const EPITAPH_LEGACIES = [
  {
    id: "granaries",
    label: { fr: "Graver les Granges", en: "Engrave the Granaries" },
    logLabel: { fr: "les Granges", en: "the Granaries" },
    icon: "🌾",
    tagline: { fr: "Les survivants gravent l'art de nourrir : la prochaine cité mangera à sa faim.", en: "The survivors engrave the art of feeding: the next city will eat its fill." },
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
    label: { fr: "Graver les Archives", en: "Engrave the Archives" },
    logLabel: { fr: "les Archives", en: "the Archives" },
    icon: "📜",
    tagline: { fr: "Le savoir survit aux pierres : la prochaine cité apprendra plus vite.", en: "Knowledge outlasts the stones: the next city will learn faster." },
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
    label: { fr: "Graver les Lois", en: "Engrave the Laws" },
    logLabel: { fr: "les Lois", en: "the Laws" },
    icon: "⚖️",
    tagline: { fr: "Un ordre hérité : la prochaine cité tiendra plus longtemps avant de céder.", en: "An inherited order: the next city will hold longer before it yields." },
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
    label: { fr: "Piller les Restes", en: "Plunder the Remains" },
    logLabel: { fr: "le Pillage", en: "the Plunder" },
    icon: "🔥",
    tagline: { fr: "Tout prendre maintenant : plus de ruines, mais rien ne sera transmis.", en: "Take everything now: more ruins, but nothing will be passed on." },
    ruinMult: 1.25,
    favoredCause: "avarice",
    effects: {
      startingInstability: 0.1
    },
    favoredRuinMult: 1.35
  }
];

export const FAVORED_CAUSE_LABELS = {
  famine: { fr: "chute par famine", en: "fall by famine" },
  time: { fr: "chute par usure du temps", en: "fall by the wear of time" },
  rupture: { fr: "chute par rupture", en: "fall by rupture" },
  avarice: { fr: "chute par avarice", en: "fall by avarice" }
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
export function epitaphLegacyChips(legacy, cause) {
  const fx = legacy?.effects || {};
  const favored = legacy?.favoredCause === cause;
  const chips = [];
  for (const [key, label] of LEGACY_EFFECT_LABELS) {
    if (fx[key] == null) continue;
    const value = favored && fx[`${key}Favored`] != null ? fx[`${key}Favored`] : fx[key];
    const delta = Math.round((value - 1) * 100);
    if (!delta) continue;
    const beneficial = key === "ruptureMult" ? delta < 0 : delta > 0;
    chips.push({
      label: `${tr(label)} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}%`,
      kind: beneficial ? "gain" : "cost"
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
