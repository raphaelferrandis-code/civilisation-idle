"use strict";

/* ============================================================================
 * utils.js - Helpers purs sans etat: el/fmt/pct, clamp, signed, multLabel, roman, seededRng, labelFor, costLabel, canPayCost/payCost, encode/decodeSaveText.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

const el = (id) => document.getElementById(id);
const NUMBER_FORMAT_KEY = "civ-opt-number-format";
let numberFormatMode = (() => {
  try {
    const saved = localStorage.getItem(NUMBER_FORMAT_KEY);
    return ["compact", "full", "scientific"].includes(saved) ? saved : "compact";
  } catch {
    return "compact";
  }
})();

function setNumberFormatMode(mode) {
  numberFormatMode = ["compact", "full", "scientific"].includes(mode) ? mode : "compact";
  try {
    localStorage.setItem(NUMBER_FORMAT_KEY, numberFormatMode);
  } catch {
    // La sauvegarde peut echouer en navigation privee; le choix reste actif en memoire.
  }
}

function formatFullNumber(value) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
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

const fmt = (value) => {
  if (!Number.isFinite(value)) return "inf";
  if (numberFormatMode === "full") return formatFullNumber(value);
  if (numberFormatMode === "scientific") return formatScientificNumber(value);
  const sign = value < 0 ? "-" : "";
  let v = Math.abs(value);
  if (v < 1000) return `${sign}${v.toFixed(v < 10 ? 1 : 0)}`;
  const units = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];
  let i = -1;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${sign}${v.toFixed(v < 10 ? 2 : 1)}${units[i]}`;
};

const pct = (value) => `${Math.max(0, Math.min(999, value * 100)).toFixed(1)}%`;

function labelFor(key) {
  return {
    population: "pop.",
    food: "nourriture",
    gold: "tresor",
    knowledge: "savoir",
    infrastructure: "infra.",
    ruins: "ruines",
    legitimacy: "legitimite",
    myths: "mythes"
  }[key] || key;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function signed(value) {
  return `${value >= 0 ? "+" : ""}${fmt(value)}`;
}

function multLabel(value) {
  const delta = (value - 1) * 100;
  return `${delta >= 0 ? "+" : ""}${fmt(delta)}%`;
}

function canPayCost(cost) {
  return Object.entries(cost).every(([currency, amount]) => state[currency] >= amount);
}

function payCost(cost) {
  for (const [currency, amount] of Object.entries(cost)) state[currency] -= amount;
}

function costLabel(cost) {
  return Object.entries(cost).map(([currency, amount]) => `${fmt(amount)} ${labelFor(currency)}`).join(" + ");
}

function roman(value) {
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

function seededRng(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function encodeSaveText(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function decodeSaveText(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
