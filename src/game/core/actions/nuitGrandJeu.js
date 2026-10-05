"use strict";

// LA NUIT DU GRAND JEU ET LE SPECTACLE (2026-10-04, Raph : « un véritable casino, lieu
// de luxure et d'argent hors du temps » — docs/PLAN-NUIT-DES-PLAISIRS.md).
//
// LA NUIT : toutes les NUIT_INTERVAL_H heures (la première une heure après l'ouverture
// de la Maison), pendant NUIT_DUREE_MIN minutes. À son ouverture la Maison verse
// NUIT_POT_H heures de recettes à la cagnotte, offre un tour de roue, et la troupe
// joue toute la nuit (la salle pleine : la caisse ×2). Tant qu'elle dure, toutes les
// portes sont ouvertes (roulette, salon privé, courses, le grand flambeur et son
// duel) et la réputation gagnée compte double. Un seul flambeur par nuit, tiré à
// l'ouverture.
//
// LE SPECTACLE : hors de la Nuit, la troupe se paie SPECTACLE_COUT_H heures de recettes
// pour SPECTACLE_DUREE_MIN minutes de salle pleine, puis se repose.

import { state, save, render, isNotifyPaused } from '../state.js';
import {
  NUIT_INTERVAL_H, NUIT_PREMIERE_H, NUIT_DUREE_MIN, NUIT_POT_H, NUIT_REPUTATION_MULT,
  SPECTACLE_COUT_H, SPECTACLE_DUREE_MIN, SPECTACLE_REPOS_MIN
} from '../balance.js';
import { recettesPerHour, potCap } from './maisonTable.js';
import { figerCaisse } from './offeringTrunk.js';
import { spectacleActif } from './affluence.js';
import { chronicle } from './utils.js';
import { fmt } from '../utils.js';
import { tr } from '../i18n.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';

export { spectacleActif };

const H = 3600 * 1000;
const MIN = 60 * 1000;

// Les grands flambeurs : un par nuit, tiré à l'ouverture. `femme` : la table met une
// fille de la Maison en face du joueur (sinon un homme de l'âge).
export const FLAMBEURS = [
  { nom: { fr: "le Prince de Tyr", en: "the Prince of Tyre" }, femme: false },
  { nom: { fr: "la Veuve noire", en: "the Black Widow" }, femme: true },
  { nom: { fr: "le Banquier de Gênes", en: "the Banker of Genoa" }, femme: false },
  { nom: { fr: "la Comtesse aux perles", en: "the Countess of Pearls" }, femme: true },
  { nom: { fr: "le Marchand de soie", en: "the Silk Merchant" }, femme: false },
  { nom: { fr: "la Favorite du roi", en: "the King's Favourite" }, femme: true },
  { nom: { fr: "l'Amiral déchu", en: "the Fallen Admiral" }, femme: false },
  { nom: { fr: "la Danseuse d'Ishtar", en: "the Dancer of Ishtar" }, femme: true }
];

// La Maison est ouverte (Ère II) : la Nuit avec elle.
export function nuitUnlocked() {
  return (state.bestEraIndex || 0) >= 2;
}

export function nuitActive(now = Date.now()) {
  const d = Number(state.nuitDebut) || 0;
  return d > 0 && now >= d && now < d + NUIT_DUREE_MIN * MIN;
}

// Les minutes qui restent à la Nuit (0 hors de la Nuit).
export function nuitResteMin(now = Date.now()) {
  if (!nuitActive(now)) return 0;
  return Math.max(1, Math.ceil(((Number(state.nuitDebut) || 0) + NUIT_DUREE_MIN * MIN - now) / MIN));
}

// Les minutes avant la prochaine Nuit (0 si elle est ouverte, ou pas encore prévue).
export function nuitAttenteMin(now = Date.now()) {
  if (nuitActive(now)) return 0;
  const p = Number(state.nuitProchaine) || 0;
  return p > 0 ? Math.max(0, Math.ceil((p - now) / MIN)) : 0;
}

// Le flambeur de la nuit en cours (ou de la dernière).
export function flambeurDeLaNuit() {
  const i = Math.max(0, Math.floor(Number(state.nuitFlambeur) || 0)) % FLAMBEURS.length;
  return FLAMBEURS[i];
}

// La réputation gagnée compte double pendant la Nuit (maisonRang.recordWager).
export function nuitReputationMult(now = Date.now()) {
  return nuitActive(now) ? NUIT_REPUTATION_MULT : 1;
}

const ecouteurs = new Set();
// L'interface s'abonne à l'ouverture d'une Nuit (le bandeau). Rend de quoi se désabonner.
export function onNuit(fn) {
  if (typeof fn !== 'function') return () => {};
  ecouteurs.add(fn);
  return () => ecouteurs.delete(fn);
}

// Au tick (templeAutomation) : ouvre la Nuit quand son heure est venue. La première
// est fixée une heure après qu'on la découvre ; une absence ne fait pas « rattraper »
// les nuits manquées : la suivante s'ouvre au retour.
export function tickNuit(now = Date.now()) {
  if (!nuitUnlocked() || nuitActive(now)) return false;
  const p = Number(state.nuitProchaine) || 0;
  if (!(p > 0)) {
    state.nuitProchaine = now + NUIT_PREMIERE_H * H;
    return false;
  }
  if (now < p) return false;
  ouvrirNuit(now);
  return true;
}

// Ouvre la Nuit maintenant (le tick, ou les tests). Rend ce qu'elle a donné.
export function ouvrirNuit(now = Date.now()) {
  // La caisse se fige au débit d'avant : la salle pleine ne compte qu'à partir d'ici.
  figerCaisse(now);
  const fin = now + NUIT_DUREE_MIN * MIN;
  state.nuitDebut = now;
  state.nuitProchaine = fin + NUIT_INTERVAL_H * H;
  state.nuitFlambeur = Math.floor(Math.random() * FLAMBEURS.length);
  state.nuitCompte = (Number(state.nuitCompte) || 0) + 1;
  // La cagnotte de la Nuit (bornée par son plafond).
  const avant = Math.max(0, state.icarusPotFaveur || 0);
  state.icarusPotFaveur = Math.min(potCap(), avant + NUIT_POT_H * recettesPerHour());
  const verse = state.icarusPotFaveur - avant;
  // Un tour de roue offert, et la troupe joue toute la nuit.
  state.roueAt = 0;
  state.spectacleDebut = now;
  state.spectacleFin = fin;
  const fl = flambeurDeLaNuit();
  // Le flambeur dans chaque langue (I18N-9 : `.fr` était forcé).
  chronicle(tr({
    fr: `La Maison des Plaisirs ouvre la Nuit du Grand Jeu : toutes ses portes, la troupe sur scène, ${fl.nom.fr} au salon privé${verse > 0 ? `, ${fmt(verse)} faveur versés à la cagnotte` : ''} — et ce qui se passe à la Maison reste à la Maison.`,
    en: `The House of Pleasures opens the Night of High Play: every door, the troupe on stage, ${fl.nom.en || fl.nom.fr} in the private salon${verse > 0 ? `, ${fmt(verse)} favor poured into the pot` : ''} — and what happens at the House stays at the House.`
  }));
  if (!isNotifyPaused()) pushOutcomeFloat({ label: tr({ fr: '🎭 La Nuit du Grand Jeu', en: '🎭 The Night of High Play' }), kind: 'gain' });
  const info = { debut: now, fin, verse, flambeur: fl };
  for (const fn of ecouteurs) { try { fn(info); } catch { /* l'affichage est un plus */ } }
  save();
  render();
  return info;
}

// ── Le spectacle ─────────────────────────────────────────────────────────────

export function spectacleCout() {
  return Math.max(1, Math.round(SPECTACLE_COUT_H * recettesPerHour()));
}

// Le spectacle peut-il se lever ? (pas déjà sur scène, la troupe reposée)
export function spectaclePret(now = Date.now()) {
  if (!nuitUnlocked() || spectacleActif(now)) return false;
  const fin = Number(state.spectacleFin) || 0;
  return now >= fin + SPECTACLE_REPOS_MIN * MIN;
}

export function spectacleResteMin(now = Date.now()) {
  if (!spectacleActif(now)) return 0;
  return Math.max(1, Math.ceil(((Number(state.spectacleFin) || 0) - now) / MIN));
}

export function spectacleReposMin(now = Date.now()) {
  if (spectacleActif(now)) return 0;
  const fin = Number(state.spectacleFin) || 0;
  return Math.max(0, Math.ceil((fin + SPECTACLE_REPOS_MIN * MIN - now) / MIN));
}

// Lève le rideau (payant). Rend { cout, fin } ou null.
export function lancerSpectacle(now = Date.now()) {
  if (!spectaclePret(now)) return null;
  const cout = spectacleCout();
  if ((state.faveur || 0) < cout) return null;
  figerCaisse(now);
  state.faveur = (state.faveur || 0) - cout;
  state.spectacleDebut = now;
  state.spectacleFin = now + SPECTACLE_DUREE_MIN * MIN;
  if (!isNotifyPaused()) pushOutcomeFloat({ label: tr({ fr: `🎭 −${fmt(cout)} faveur`, en: `🎭 −${fmt(cout)} favor` }), kind: 'cost' });
  save();
  render();
  return { cout, fin: state.spectacleFin };
}
