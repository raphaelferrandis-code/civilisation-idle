export const EPITAPH_LEGACY_DURATION_MS = 8 * 60 * 1000;

export const EPITAPH_LEGACIES = [
  {
    id: "granaries",
    label: "Graver les Granges",
    logLabel: "les Granges",
    ruinMult: 0.9,
    favoredCause: "famine",
    detail: "-10% ruines. Prochaine run: +25% nourriture en debut de cycle, mais -8% tresor.",
    causeDetail: "Si la chute vient de la famine, le bonus nourriture monte a +40%.",
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
    ruinMult: 1,
    favoredCause: "time",
    detail: "Ruines normales. Prochaine run: +18% savoir et +10% infrastructure de savoir, mais Rupture +6%.",
    causeDetail: "Si la chute vient du temps, le bonus savoir monte a +28%.",
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
    ruinMult: 0.85,
    favoredCause: "rupture",
    detail: "-15% ruines. Prochaine run: Rupture -22%, mais production globale -5%.",
    causeDetail: "Si la chute vient de la Rupture, la reduction monte a -34%.",
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
    ruinMult: 1.25,
    favoredCause: "avarice",
    detail: "+25% ruines immediates. Prochaine run: aucun legs productif, Rupture de depart +10%.",
    causeDetail: "Si la chute vient de l'avarice, le pillage donne +35% ruines.",
    effects: {
      startingInstability: 0.1
    },
    favoredRuinMult: 1.35
  }
];

export function epitaphLegacyById(id) {
  return EPITAPH_LEGACIES.find((legacy) => legacy.id === id) || null;
}

export function epitaphRuinMultiplier(legacy, cause) {
  if (!legacy) return 1;
  if (legacy.favoredCause === cause && legacy.favoredRuinMult) return legacy.favoredRuinMult;
  return legacy.ruinMult || 1;
}

export function describeEpitaphLegacy(legacy, cause) {
  const mult = epitaphRuinMultiplier(legacy, cause);
  const ruinText = mult === 1
    ? "ruines normales"
    : `${mult > 1 ? "+" : ""}${Math.round((mult - 1) * 100)}% ruines`;
  const favored = legacy.favoredCause === cause ? " Affinite avec cette chute active." : "";
  return `${ruinText}. ${legacy.detail} ${legacy.causeDetail}${favored}`;
}
