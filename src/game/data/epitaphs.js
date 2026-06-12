export const EPITAPH_LEGACY_DURATION_MS = 8 * 60 * 1000;

export const EPITAPH_LEGACIES = [
  {
    id: "granaries",
    label: "Graver les Granges",
    logLabel: "les Granges",
    icon: "🌾",
    tagline: "Les survivants gravent l'art de nourrir : la prochaine cité mangera à sa faim.",
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
    label: "Graver les Archives",
    logLabel: "les Archives",
    icon: "📜",
    tagline: "Le savoir survit aux pierres : la prochaine cité apprendra plus vite.",
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
    label: "Graver les Lois",
    logLabel: "les Lois",
    icon: "⚖️",
    tagline: "Un ordre hérité : la prochaine cité tiendra plus longtemps avant de céder.",
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
    label: "Piller les Restes",
    logLabel: "le Pillage",
    icon: "🔥",
    tagline: "Tout prendre maintenant : plus de ruines, mais rien ne sera transmis.",
    ruinMult: 1.25,
    favoredCause: "avarice",
    effects: {
      startingInstability: 0.1
    },
    favoredRuinMult: 1.35
  }
];

export const FAVORED_CAUSE_LABELS = {
  famine: "chute par famine",
  time: "chute par usure du temps",
  rupture: "chute par rupture",
  avarice: "chute par avarice"
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
  ["foodMult", "Nourriture"],
  ["knowledgeMult", "Savoir"],
  ["goldMult", "Trésor"],
  ["infraMult", "Infrastructure"],
  ["globalMult", "Production globale"],
  ["ruptureMult", "Montée de la Rupture"]
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
      label: `${label} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}%`,
      kind: beneficial ? "gain" : "cost"
    });
  }
  if (fx.startingInstability) {
    chips.push({ label: `Rupture de départ +${Math.round(fx.startingInstability * 100)}%`, kind: "cost" });
  }
  if (!chips.length) {
    chips.push({ label: "Aucun legs productif", kind: "info" });
  }
  return chips;
}
