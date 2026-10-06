"use strict";

// LES GRANDS GAINS — lot 3 des gains « vrai casino » (2026-10-04,
// docs/PLAN-GAINS-CASINO.md). Quatre paliers, sur TOUTES les tables, au multiple de la
// mise que paie le coup : ×5 un beau coup (ajouté le 2026-10-04, « la sensation de
// gagner »), ×10 un gros gain, ×50 un énorme, ×250 un COUP DE LÉGENDE — celui-là
// s'écrit dans la Chronique. La table qui RÉVÈLE un gain appelle
// celebrerGain ; l'effet à l'écran (components/ui/GrandGain.jsx) s'y abonne. Les
// automatisations ne fêtent rien : le spectacle est pour la main.

import { chronicle } from './actions/utils.js';
import { fmt, numLocale } from './utils.js';
import { tr } from './i18n.js';

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

// Où le coup est tombé, dans les deux langues (audit du 05/10, I18N-5).
const OU = {
  osselets: { fr: "aux osselets", en: "at knucklebones" },
  icare: { fr: "au Vol d'Icare", en: "at Icarus's flight" },
  tickets: { fr: "aux tickets", en: "at the scratch tickets" },
  machine: { fr: "à la machine à sous", en: "at the slot machine" },
  roulette: { fr: "à la roulette", en: "at roulette" },
  duel: { fr: "au duel des grands flambeurs", en: "at the high rollers' duel" },
  courses: { fr: "aux courses", en: "at the races" }
};
const OU_MAISON = { fr: "à la Maison des Plaisirs", en: "at the House of Pleasures" };

// LES RÉACTIONS (2026-10-04, la luxure du lot 3 de docs/PLAN-NUIT-DES-PLAISIRS.md) :
// chaque beau gain (×3 la mise et plus) fait réagir la table — la croupière envoie un
// baiser. Plusieurs abonnés, et indépendant de l'effet des grands gains (`show`).
const REACTION_MULT = 3;
const reactions = new Set();
export function onGainReaction(fn) {
  if (typeof fn !== "function") return () => {};
  reactions.add(fn);
  return () => reactions.delete(fn);
}

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
  if (mult >= REACTION_MULT) for (const fn of reactions) { try { fn({ gain: g, stake: s, mult, game }); } catch { /* un plus */ } }
  const palier = palierOf(mult);
  if (!palier) return null;
  if (palier.id === "legende") {
    const ou = OU[game] || OU_MAISON;
    const x = Math.floor(mult).toLocaleString(numLocale());
    chronicle(tr({
      fr: `Coup de légende ${ou.fr} : ×${x} la mise, ${fmt(g)} faveur.`,
      en: `Legendary win ${ou.en}: ×${x} the stake, ${fmt(g)} favor.`
    }));
  }
  if (show && listener) listener({ palier, gain: g, stake: s, mult, game });
  return palier;
}
