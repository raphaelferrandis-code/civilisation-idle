"use strict";

import { state } from './state.js';
import { Decimal, D } from './num.js';
import { tr } from './i18n.js';

const NUMBER_FORMAT_KEY = "civ-opt-number-format";

export let numberFormatMode = (() => {
  try {
    const saved = localStorage.getItem(NUMBER_FORMAT_KEY);
    return ["compact", "full", "scientific"].includes(saved) ? saved : "compact";
  } catch {
    return "compact";
  }
})();

export function setNumberFormatMode(mode) {
  numberFormatMode = ["compact", "full", "scientific"].includes(mode) ? mode : "compact";
  try {
    localStorage.setItem(NUMBER_FORMAT_KEY, numberFormatMode);
  } catch {
    // La sauvegarde peut echouer en navigation privee; le choix reste actif en memoire.
  }
}

function formatFullNumber(value) {
  const abs = Math.abs(value);
  // Au-delà de 1e21, toFixed bascule de lui-même en notation exponentielle :
  // autant le faire proprement.
  if (abs >= 1e21) return formatScientificNumber(value);
  const sign = value < 0 ? "-" : "";
  const decimals = abs < 10 ? 1 : 0;
  const [integer, fraction] = abs.toFixed(decimals).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction ? `${sign}${grouped}.${fraction}` : `${sign}${grouped}`;
}

function formatScientificNumber(value) {
  const abs = Math.abs(value);
  if (abs < 1000) return value.toFixed(abs < 10 ? 1 : 0);
  return value.toExponential(2).replace("e+", "e");
}

// Suffixes du format compact — partagés avec l'odomètre (OdometerNumber.jsx).
export const COMPACT_UNITS = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

// Compact à suffixes (K/M/B…Dc), puis scientifique au-delà du décillion (1e36).
// Empiler des suffixes exotiques plus loin n'aide personne.
// `extraDecimals` : décimales de mantisse en plus (voir fmtShortLive).
function formatCompactNumber(value, extraDecimals = 0) {
  const sign = value < 0 ? "-" : "";
  let v = Math.abs(value);
  if (v < 1000) return `${sign}${v.toFixed((v < 10 ? 1 : 0) + (extraDecimals ? 1 : 0))}`;
  if (v >= 1e36) return formatScientificNumber(value);
  let i = -1;
  while (v >= 1000 && i < COMPACT_UNITS.length - 1) {
    v /= 1000;
    i += 1;
  }
  // MANTISSE À 3 CHIFFRES SIGNIFICATIFS (B12) : 8.70K / 87.0K / 870K, au lieu de
  // 8.70K / 87.0K / 870.0K. Seule la bande 100-999 change, et elle y perdait un
  // « .0 » qui n'apportait rien qu'un caractère de plus dans des colonnes déjà
  // serrées (coûts de boutique, badges de palier, débits de la topbar).
  // `extraDecimals` (le compact « vivant » de fmtShortLive) reste ajouté par
  // dessus, pour que le count-up garde un chiffre qui bouge.
  return `${sign}${v.toFixed((v < 10 ? 2 : v < 100 ? 1 : 0) + extraDecimals)}${COMPACT_UNITS[i]}`;
}

export const fmt = (value) => {
  if (value instanceof Decimal) {
    const n = value.toNumber();
    // Dans le domaine float, on réutilise les chemins existants à l'identique.
    if (Number.isFinite(n)) return fmt(n);
    // Au-delà de ~1.8e308 : notation scientifique depuis mantisse/exposant.
    return value.toExponential(2).replace("e+", "e");
  }
  if (!Number.isFinite(value)) return "inf";
  if (numberFormatMode === "full") return formatFullNumber(value);
  if (numberFormatMode === "scientific") return formatScientificNumber(value);
  return formatCompactNumber(value);
};

// Toujours compact, quel que soit le mode global (compact/full/scientific).
// Réservé aux zones denses à largeur contrainte (rangées de la boutique) où un
// nombre « full » de 20 chiffres déborderait sa cellule et chevaucherait les
// rangées voisines. La valeur exacte reste accessible via les tooltips (title).
export const fmtShort = (value) => {
  if (value instanceof Decimal) {
    const n = value.toNumber();
    if (Number.isFinite(n)) return formatCompactNumber(n);
    return value.toExponential(2).replace("e+", "e");
  }
  if (!Number.isFinite(value)) return "inf";
  return formatCompactNumber(value);
};

// ── DÉBITS À UNITÉ ADAPTATIVE (B4) ───────────────────────────────────────────
// Un débit de 0,0004/s s'affichait « 0.0/s » : un zéro mort, alors que la valeur
// vaut 1,4 par heure. Tous les petits débits du début de partie et les effets
// indirects de la boutique redeviennent lisibles, sans toucher à une formule.
//
// On renvoie la valeur MISE À L'ÉCHELLE et son unité, jamais une chaîne déjà
// signée : la topbar compose son signe à part (rateSign) et la boutique passe
// par signedShort. Rendre une chaîne signée ferait DOUBLER le signe d'un côté ou
// DISPARAÎTRE celui de l'autre — c'est le piège de la proposition d'origine, qui
// ne prévoyait qu'une seule sortie.
//
// ⚠ ENTRÉE MIXTE, et c'est le vrai piège : la topbar passe des Decimal (rates()),
// la boutique des NUMBERS natifs (buildingProductionSegments fait son produit en
// flottant). Écrire ce code en .abs()/.mul() comme le demandait la fiche ferait
// lever « value.abs is not a function » sur chaque rangée. On branche donc sur
// instanceof, exactement comme fmtShort juste au-dessus.
const RATE_UNITS = [
  [1, 1],        // au moins 1 par seconde → /s
  [1 / 60, 60],  // au moins 1 par minute → /min
  [0, 3600]      // sinon → /h
];

export function rateScale(value) {
  const estDec = value instanceof Decimal;
  const n = estDec ? value.toNumber() : value;
  // Un débit nul est l'état NOMINAL en début de partie (l'Or vaut 0/s tant que
  // le Rayonnement est sous 25) : « 0.0/h » serait plus absurde que « 0.0/s ».
  // Non fini : fmtShort rend déjà « inf », on ne lui colle pas « /h ».
  if (!Number.isFinite(n) || n === 0) return { value, unit: "/s", perSecond: true };
  const abs = Math.abs(n);
  for (const [seuil, facteur] of RATE_UNITS) {
    if (abs >= seuil) {
      if (facteur === 1) return { value, unit: "/s", perSecond: true };
      const mis = estDec ? value.mul(facteur) : value * facteur;
      return { value: mis, unit: facteur === 60 ? "/min" : "/h", perSecond: false };
    }
  }
  return { value, unit: "/s", perSecond: true };
}

// Habitants « crédibles » (compteur cosmétique dérivé de crediblePopulation) :
// exacts avec séparateurs jusqu'au million (17, 3 000, 560 000), compacts au-delà.
export const fmtHabitants = (n) => (n < 1e6 ? Math.round(n).toLocaleString("fr-FR") : fmtShort(n));

// Compact « vivant » : mantisse enrichie de 2 décimales pour que le count-up
// de RollingNumber reste VISIBLE sur les grands nombres — avec 3 chiffres
// significatifs (« 8.19No »), l'affichage paraît figé entre deux ticks alors
// que la valeur roule. Réservé aux gros compteurs animés (topbar).
export const fmtShortLive = (value) => {
  if (value instanceof Decimal) {
    const n = value.toNumber();
    if (Number.isFinite(n)) return formatCompactNumber(n, 2);
    return value.toExponential(4).replace("e+", "e");
  }
  if (!Number.isFinite(value)) return "inf";
  return formatCompactNumber(value, 2);
};

export const pct = (value) => `${Math.max(0, Math.min(999, value * 100)).toFixed(1)}%`;

// Durée APPROCHÉE en langage courant : « 3j 4h », « 8h 12min », « 45min ». On ne
// descend jamais sous la minute — c'est un ordre de grandeur (réserve d'absence,
// délai avant un palier), pas un chronomètre. Pour un compte à rebours précis,
// voir fmtCycleTime dans CityStatusPanel, qui zéro-padde façon horloge.
// Remontée ici depuis CityStatusPanel : le rapport de reprise en a besoin aussi,
// et deux copies de ce formatage finiraient par diverger d'une unité.
// ⚠ BILINGUE depuis B5. Ce formateur était en FRANÇAIS EN DUR alors qu'il est
// déjà consommé à l'intérieur de phrases anglaises (CityStatusPanel,
// IdleReportPanel) : une partie en anglais affichait « up to moins d'1 min ».
export function fmtSecs(s) {
  const total = Math.max(0, Math.floor(s));
  if (total < 60) return tr({ fr: "moins d'1 min", en: "less than 1 min" });
  // Une unité inférieure NULLE ne s'écrit pas : « 8 h » et non « 8h 0min ». La
  // version d'origine la gardait toujours, ce qui allongeait inutilement une
  // valeur affichée dans une gouttière de barre latérale.
  const j = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const min = Math.floor((total % 3600) / 60);
  const uJ = tr({ fr: "j", en: "d" });
  if (j > 0) return h > 0 ? `${j} ${uJ} ${h} h` : `${j} ${uJ}`;
  if (h > 0) return min > 0 ? `${h} h ${min} min` : `${h} h`;
  return `${min} min`;
}

// Pas de QUANTIFICATION du délai avant achat (B5), en secondes. Deux raisons,
// et la seconde est la plus importante :
//   - lisibilité : un compte à rebours qui bouge d'une seconde sur une échéance
//     de quarante minutes est du bruit ;
//   - PERF : la boutique est mémoïsée pour ne PAS se re-rendre au tick. La
//     signature d'abonnement est construite à partir du LIBELLÉ, donc de la
//     valeur quantifiée — sans ce pas, elle changerait chaque seconde pour
//     chaque rangée et on perdrait exactement l'optimisation qu'on protège.
const ETA_STEP_SECONDS = [
  [60, 5],       // sous la minute : au pas de 5 s
  [3600, 60],    // sous l'heure : à la minute
  [Infinity, 3600] // au-delà : à l'heure
];

export function quantizeEta(seconds) {
  const s = Math.max(0, seconds);
  for (const [limite, pas] of ETA_STEP_SECONDS) {
    if (s < limite) return Math.ceil(s / pas) * pas;
  }
  return s;
}

// Délai avant achat, quantifié puis mis en mots. Descend SOUS la minute, à la
// différence de fmtSecs — c'est un compte à rebours, pas un ordre de grandeur —
// mais lui délègue au-delà, pour qu'il n'existe qu'une seule écriture des
// heures et des jours dans le jeu.
export function fmtEta(seconds) {
  const q = quantizeEta(seconds);
  if (q < 60) return `${Math.max(5, q)} s`;
  return fmtSecs(q);
}

export function labelFor(key) {
  return {
    population: tr({ fr: "Ray.", en: "Rad." }),
    food: tr({ fr: "nourriture", en: "food" }),
    gold: tr({ fr: "tresor", en: "treasury" }),
    knowledge: tr({ fr: "savoir", en: "knowledge" }),
    infrastructure: tr({ fr: "infra.", en: "infra." }),
    ruins: tr({ fr: "ruines", en: "ruins" }),
    faveur: tr({ fr: "faveur", en: "favor" }),
    myths: tr({ fr: "mythes", en: "myths" })
  }[key] || key;
}

export function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function signed(value) {
  const isNegative = value instanceof Decimal ? value.lt(0) : value < 0;
  return `${isNegative ? "" : "+"}${fmt(value)}`;
}

// Variante toujours compacte (cf. fmtShort) pour les zones denses.
export function signedShort(value) {
  const isNegative = value instanceof Decimal ? value.lt(0) : value < 0;
  return `${isNegative ? "" : "+"}${fmtShort(value)}`;
}

export function multLabel(value) {
  const delta = (value - 1) * 100;
  return `${delta >= 0 ? "+" : ""}${fmt(delta)}%`;
}

export function canPayCost(cost) {
  return Object.entries(cost).every(([currency, amount]) => D(state[currency]).gte(amount));
}

export function payCost(cost) {
  for (const [currency, amount] of Object.entries(cost)) {
    if (!(currency in state)) throw new Error(`payCost: ressource inconnue "${currency}"`);
    const current = state[currency];
    if (current instanceof Decimal) {
      state[currency] = current.sub(amount);
    } else {
      // Ressource encore en number natif : soustraction float pour rester
      // bit-à-bit identique sous 2^53 (canPayCost garantit amount <= current).
      state[currency] = current - toNumberLoose(amount);
    }
  }
}

function toNumberLoose(value) {
  return value instanceof Decimal ? value.toNumber() : value;
}

export function costLabel(cost) {
  return Object.entries(cost).map(([currency, amount]) => `${fmt(amount)} ${labelFor(currency)}`).join(" + ");
}

export function roman(value) {
  const numerals = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];
  let output = "";
  let n = Math.max(1, Math.floor(value));
  for (const [amount, symbol] of numerals) {
    while (n >= amount) {
      output += symbol;
      n -= amount;
    }
  }
  return output;
}

export function seededRng(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function encodeSaveText(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export function decodeSaveText(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
