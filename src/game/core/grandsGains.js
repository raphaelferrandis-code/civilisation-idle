"use strict";

// LES GRANDS GAINS — lot 3 des gains « vrai casino » (2026-10-04,
// docs/PLAN-GAINS-CASINO.md). Quatre paliers, sur TOUTES les tables, au multiple de la
// mise que paie le coup : ×5 un beau coup (ajouté le 2026-10-04, « la sensation de
// gagner »), ×10 un gros gain, ×50 un énorme, ×250 un COUP DE LÉGENDE — celui-là
// s'écrit dans la Chronique. La table qui RÉVÈLE un gain appelle
// celebrerGain ; l'effet à l'écran (components/ui/GrandGain.jsx) s'y abonne. Les
// automatisations ne fêtent rien : le spectacle est pour la main.

import { chronicle } from './actions/utils.js';
import { fmt } from './utils.js';

export const PALIERS = [
  { x: 250, id: "legende", label: { fr: "COUP DE LÉGENDE", en: "LEGENDARY WIN" } },
  { x: 50, id: "enorme", label: { fr: "ÉNORME GAIN", en: "HUGE WIN" } },
  { x: 10, id: "gros", label: { fr: "GROS GAIN", en: "BIG WIN" } },
  { x: 5, id: "beau", label: { fr: "BEAU COUP", en: "NICE WIN" } }
];

// Le palier d'un multiple de la mise (le plus haut atteint), ou null.
export function palierOf(mult) {
  const m = Number(mult);
  return Number.isFinite(m) ? PALIERS.find((p) => m >= p.x) || null : null;
}

const OU = {
  osselets: "aux osselets",
  icare: "au Vol d'Icare",
  tickets: "aux tickets",
  vingtetun: "au vingt-et-un",
  machine: "à la machine à sous",
  roulette: "à la roulette",
  duel: "au duel des grands flambeurs",
  courses: "aux courses"
};

let listener = null;
// Un seul abonné : l'effet de la scène des jeux. Rend de quoi se désabonner.
export function onGrandGain(fn) {
  listener = typeof fn === "function" ? fn : null;
  return () => { if (listener === fn) listener = null; };
}

// Un gain RÉVÉLÉ à une table : `gain` = ce que paie le coup (mise comprise), `stake` =
// la mise qui l'a joué. Au palier, l'effet s'affiche (sauf `show: false`, quand la table
// a déjà le sien, comme la machine à sous) ; au-delà de ×250, la Chronique le retient.
// Rend le palier atteint, ou null.
export function celebrerGain({ gain, stake, game, show = true } = {}) {
  const g = Number(gain), s = Number(stake);
  if (!(g > 0) || !(s > 0)) return null;
  const mult = g / s;
  const palier = palierOf(mult);
  if (!palier) return null;
  if (palier.id === "legende") {
    chronicle(`Coup de légende ${OU[game] || "à la Maison des Plaisirs"} : ×${Math.floor(mult).toLocaleString("fr-FR")} la mise, ${fmt(g)} faveur.`);
  }
  if (show && listener) listener({ palier, gain: g, stake: s, mult, game });
  return palier;
}
