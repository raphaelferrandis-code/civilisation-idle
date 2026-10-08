"use strict";

// LES SUCCÈS — conditions, suivi, annonce, pont Steam (audit 2026-10-05, STEAM-9).
//
// La LISTE (ids, noms et descriptions FR/EN, familles, secrets) vit dans
// data/achievements.js, module pur. Ici : la condition de chaque succès, lue sur
// l'état courant, et ce qui se passe au déblocage.
//
// SUIVI : state.achievements = { [id]: horodatage mural (ms) du déblocage } —
// ÉTERNEL (GR_PERSISTENT_FIELDS), normalisé par state.js (normalizeAchievements).
// Un succès ne se reperd jamais : rien ne retire une clé.
//
// COÛT : toutes les conditions sont des lectures directes de champs déjà tenus à
// jour (registre de la Chronique, sceaux, Mythes, pics du cycle…) — aucune ne
// recalcule la production. Elles ne sont pas lues à chaque tick mais toutes les
// ACHIEVEMENTS_CHECK_MS par la boucle de jeu (main.js), plus une fois au lancement
// (une ancienne sauvegarde y reçoit d'un coup tout ce qu'elle a déjà mérité). Le
// rattrapage hors ligne ne les lit pas cliché par cliché : ce qui compte se garde
// dans des registres à vie (effondrements, records), relus au retour.
//
// STEAM : chaque déblocage part vers le process principal (window.civSteam, préload
// de l'.exe) ; au lancement, toute la liste débloquée y repart (syncSteamAchievements)
// — un succès gagné hors Steam, ou avant l'App ID, rejoint ainsi Steam au premier
// lancement où le client répond. Le navigateur n'a pas ce pont : rien ne change.
//
// POUR L'INTERFACE : achievementList() rend la liste ordonnée avec l'état de chacun
// (débloqué, date, caché) — un secret reste caché tant qu'il n'est ni débloqué ni
// « révélé » par le jeu (un sceau découvert, le pacte du Ragnarök ouvert…).

import { state, isNotifyPaused, saveSoon } from './state.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../data/achievements.js';
import { eraTier } from '../data/world.js';
import { PRESTIGE_TREE } from '../data/upgrades.js';
import { FD_STORY_LIST, FD_CURIOS } from '../data/faitsDivers.js';
import { AMOUREUX } from '../data/faitsDiversAmoureux.js';
import { fdProgress, fdLoversProgress } from './faitsDivers.js';
import { WONDERS } from './mechanics/wonders.js';
import { MAISON_RANKS } from './balance.js';
import { D } from './num.js';
import { tr } from './i18n.js';
import { pushOutcomeFloat } from './outcomeFloat.js';
import { log } from './log.js';
import { annoncer } from '../audio/moments/annonces.js';

// Cadence de relecture par la boucle de jeu (main.js).
export const ACHIEVEMENTS_CHECK_MS = 5000;

const HOUR = 3600;

// Registre de la Chronique, ou un objet vide (save mi-migration, état de test brut).
const stats = (s) => s.chronicleStats || {};
const game = (s, id) => (stats(s).games && stats(s).games[id]) || {};
const atLeast = (value, n) => (Number(value) || 0) >= n;

// Merveilles érigées : un rang gravé (wonderTiers) ou l'ancienne liste (wonders).
function wondersErected(s) {
  const out = new Set(Array.isArray(s.wonders) ? s.wonders : []);
  for (const [id, tier] of Object.entries(s.wonderTiers || {})) if ((Number(tier) || 0) >= 1) out.add(id);
  return out.size;
}

// Feuilletons des rues encore au programme (une histoire `off` est éteinte).
const liveStories = () => FD_STORY_LIST.filter((story) => !story.off);
// Rang du rendez-vous du mariage de Nancy et William.
const MARIAGE_STEP = AMOUREUX.steps.findIndex((step) => step.where === "mariage");

// Conditions écrites à la main (succès sans `need`). Une entrée par id : un test
// vérifie qu'aucun succès n'en manque et qu'aucune ne reste orpheline.
const CUSTOM = {
  CYCLE_UNE_HEURE: (s) => atLeast(stats(s).longestCycleSec, HOUR),
  // Le record n'est gravé qu'à la chute : le cycle en cours compte aussi, pour que
  // le succès tombe à la troisième crise stabilisée et pas une chute plus tard.
  CRISES_TROIS: (s) => atLeast(stats(s).mostCrisesInCycle, 3) || atLeast(s.cycleCrisesResolved, 3),
  VOEU_TENU: (s) => Boolean(s.cycleVow && s.cycleVow.done),
  TESTAMENT: (s) => typeof s.testamentLegacyId === "string" && s.testamentLegacyId.length > 0,

  RUINES_CENT: (s) => D(stats(s).biggestRuinGain || 0).gte(100),
  RUINES_MILLION: (s) => D(stats(s).biggestRuinGain || 0).gte(1e6),
  RUINES_BILLIARD: (s) => D(stats(s).biggestRuinGain || 0).gte(1e15),
  ARBRE_RACINE: (s) => PRESTIGE_TREE.some((node) => s.upgrades && s.upgrades[node.id]),
  ARBRE_COURONNE: (s) => PRESTIGE_TREE.some((node) => node.capstone && s.upgrades && s.upgrades[node.id]),
  RAYONNEMENT_GOGOL: (s) => D((s.cyclePeaks && s.cyclePeaks.population) || s.population || 0).gte("1e100"),
  MERVEILLE_PREMIERE: (s) => wondersErected(s) >= 1,
  MERVEILLES_TOUTES: (s) => wondersErected(s) >= WONDERS.length,
  MERVEILLE_RANG_V: (s) => Object.values(s.wonderTiers || {}).some((tier) => (Number(tier) || 0) >= 5),
  CITE_BAPTISEE: (s) => s.cityNameCustom === true,

  CIEL_TOMBE: (s) => s.atlasCrushed === true,

  OSSELETS_VENUS: (s) => atLeast(game(s, "osselets").venus, 1),
  OSSELETS_CHIEN: (s) => atLeast(game(s, "osselets").dog, 1),
  ICARE_X10: (s) => atLeast(game(s, "icarus").bestMult, 10),
  GRATTEUX_SOLEIL: (s) => atLeast(game(s, "scratch").soleil, 1),
  VINGTETUN_NATUREL: (s) => atLeast(game(s, "blackjack").naturals, 1),
  VINGTETUN_SERIE: (s) => atLeast(game(s, "blackjack").bestStreak, 5),
  // L'heure de fin du bannissement reste posée après son échéance (videur.js) :
  // non nulle = le videur a déjà raccompagné le joueur.
  VIDEUR: (s) => atLeast(s.bjBarreJusqua, 1),
  MACHINE_HOLD: (s) => atLeast(game(s, "slots").holdWins, 1),
  MACHINE_JACKPOT: (s) => atLeast(game(s, "slots").jackpots, 1),
  DUEL_GAGNE: (s) => atLeast(game(s, "duel").gagnes, 1),
  COURSE_OUTSIDER: (s) => atLeast(game(s, "courses").outsiders, 1),
  ROUE_MAISON: (s) => atLeast(stats(s).roueSpins, 1),
  NUIT_GRAND_JEU: (s) => atLeast(s.nuitCompte, 1),
  MAISON_FAMILIER: (s) => atLeast(s.maisonRank, 1),
  MAISON_MECENE: (s) => atLeast(s.maisonRank, 3),
  MAISON_PRINCE: (s) => atLeast(s.maisonRank, MAISON_RANKS.length - 1),

  FD_PREMIER: (s) => Boolean(s.faitsDivers && s.faitsDivers.firstAt != null),
  FD_HISTOIRE: () => liveStories().some((story) => fdProgress(story).done),
  FD_TOUTES: () => liveStories().every((story) => fdProgress(story).done) && fdLoversProgress().done,
  FD_CURIOSITES: (s) => FD_CURIOS.every((curio) => Boolean(s.faitsDivers && s.faitsDivers.curios && s.faitsDivers.curios[curio.id])),
  FD_AMOUREUX: (s) => MARIAGE_STEP >= 0 && atLeast(s.faitsDivers && s.faitsDivers.lovers && s.faitsDivers.lovers.step, MARIAGE_STEP + 1),

  TEMPS_UNE_HEURE: (s) => atLeast(stats(s).lifetimePlaySec, HOUR),
  TEMPS_DIX_HEURES: (s) => atLeast(stats(s).lifetimePlaySec, 10 * HOUR),
  TEMPS_CENT_HEURES: (s) => atLeast(stats(s).lifetimePlaySec, 100 * HOUR)
};

// Exportée pour les tests (complétude des conditions).
export const ACHIEVEMENT_CUSTOM_IDS = Object.freeze(Object.keys(CUSTOM));

// La condition d'un succès est-elle remplie sur `s` ? Jamais de throw : une
// condition qui casse (état abîmé) compte simplement comme non remplie.
export function achievementMet(def, s = state) {
  if (!def || !s) return false;
  try {
    const need = def.need;
    if (need) {
      if (need.era != null) return eraTier(s.bestEraIndex || 0) >= need.era;
      if (need.collapses != null) return atLeast(stats(s).collapses, need.collapses);
      if (need.seal != null) return Boolean(s.grClaimed && s.grClaimed[need.seal]);
      if (need.seals != null) return Object.values(s.grClaimed || {}).filter(Boolean).length >= need.seals;
      if (need.myth) return Boolean(s.mythsCompleted && s.mythsCompleted[need.myth]);
    }
    const custom = CUSTOM[def.id];
    return custom ? Boolean(custom(s)) : false;
  } catch {
    return false;
  }
}

// Un succès SECRET peut être « révélé » avant d'être débloqué : le jeu en montre
// déjà le nom ailleurs (un sceau découvert dans la table des Grands Resets, le
// pacte du Ragnarök annoncé, Nancy et William déjà croisés).
function achievementRevealed(def, s) {
  if (!def.secret) return true;
  if (def.need && def.need.seal != null) {
    const gr = def.need.seal;
    return Boolean((s.grRevealed && s.grRevealed[gr]) || (s.grClaimed && s.grClaimed[gr]));
  }
  if (def.id === "MYTHE_RAGNAROK") return Boolean(s.mythActsAnnounced && s.mythActsAnnounced.ragnarok);
  if (def.id === "FD_AMOUREUX") return atLeast(s.faitsDivers && s.faitsDivers.lovers && s.faitsDivers.lovers.step, 1);
  return false;
}

export function isAchievementUnlocked(id, s = state) {
  return Boolean(s && s.achievements && Object.prototype.hasOwnProperty.call(s.achievements, id));
}

export function unlockedAchievementCount(s = state) {
  return ACHIEVEMENTS.filter((def) => isAchievementUnlocked(def.id, s)).length;
}

// La liste pour l'interface, dans l'ordre de data/achievements.js :
// { ...définition, unlocked, at (ms ou null), hidden (secret encore caché) }.
export function achievementList(s = state) {
  return ACHIEVEMENTS.map((def) => {
    const unlocked = isAchievementUnlocked(def.id, s);
    const at = unlocked ? (Number(s.achievements[def.id]) || null) : null;
    return { ...def, unlocked, at, hidden: !unlocked && !achievementRevealed(def, s) };
  });
}

// Signature de l'affichage, un caractère par succès (« 1 » débloqué, « 0 »
// verrouillé, « _ » secret caché) : la liste de la Chronique s'y abonne et ne se
// redessine que quand un succès se débloque ou qu'un secret se révèle — sans
// fabriquer 80 objets à chaque notification de l'état.
export function achievementDisplaySignature(s = state) {
  let sig = "";
  for (const def of ACHIEVEMENTS) sig += isAchievementUnlocked(def.id, s) ? "1" : achievementRevealed(def, s) ? "0" : "_";
  return sig;
}

// Icône d'un succès (scripts/bakeAchievementIcons.cjs) : la couleur une fois
// débloqué, la version grise sinon — les mêmes fichiers que sur Steam.
export function achievementIconSrc(id, unlocked) {
  return `/pixelart/ui/achievements/${id}${unlocked ? "" : "-gris"}.png`;
}

// ── Pont Steam (préload de l'.exe ; absent du navigateur) ─────────────────────
function steamBridge() {
  try {
    const bridge = typeof window !== "undefined" ? window.civSteam : null;
    return bridge && typeof bridge.unlock === "function" ? bridge : null;
  } catch {
    return null;
  }
}

function sendToSteam(ids) {
  if (!ids.length) return;
  const bridge = steamBridge();
  if (!bridge) return;
  try { bridge.unlock(ids); } catch { /* process principal indisponible : resynchronisé au prochain lancement */ }
}

// Au lancement : toute la liste débloquée repart vers Steam (le process principal
// n'active que ce qui manque). Ids inconnus de cette version exclus.
export function syncSteamAchievements(s = state) {
  sendToSteam(Object.keys((s && s.achievements) || {}).filter((id) => ACHIEVEMENT_BY_ID[id]));
}

// ── Annonce ──────────────────────────────────────────────────────────────────
// Un succès : son nom. Plusieurs d'un coup (première lecture d'une ancienne
// sauvegarde, retour d'absence) : UN toast et UNE ligne de journal, pas une rafale.
function announce(ids) {
  const names = ids.map((id) => tr(ACHIEVEMENT_BY_ID[id].name));
  if (names.length === 1) {
    pushOutcomeFloat({ label: tr({ fr: `🏆 Succès : ${names[0]}`, en: `🏆 Achievement: ${names[0]}` }), kind: "gain", view: "history", priority: 1 });
    log(tr({ fr: `Succès débloqué : « ${names[0]} ».`, en: `Achievement unlocked: “${names[0]}”.` }));
    return;
  }
  const n = names.length;
  const head = names.slice(0, 3).join(", ");
  const rest = n - 3;
  pushOutcomeFloat({ label: tr({ fr: `🏆 ${n} succès`, en: `🏆 ${n} achievements` }), kind: "gain", view: "history", priority: 1 });
  log(rest > 0
    ? tr({ fr: `${n} succès débloqués : ${head} et ${rest} autre${rest > 1 ? "s" : ""}.`, en: `${n} achievements unlocked: ${head} and ${rest} more.` })
    : tr({ fr: `${n} succès débloqués : ${head}.`, en: `${n} achievements unlocked: ${head}.` }));
}

// ── Relecture ────────────────────────────────────────────────────────────────
// Débloque tout succès dont la condition est remplie : horodatage dans la save,
// envoi à Steam, annonce (sauf `announce: false` ou pendant une simulation hors
// ligne). Rend la liste des ids débloqués à cet appel.
export function checkAchievements({ announce: shout = true, now = Date.now() } = {}) {
  const s = state;
  if (!s) return [];
  // Pendant la chute (deuil, cinématique sur la carte), on attend la relecture
  // suivante : le premier effondrement ne s'annonce pas au milieu de sa propre scène.
  if (s.mourning || s.chute) return [];
  if (!s.achievements || typeof s.achievements !== "object") s.achievements = {};
  const fresh = [];
  for (const def of ACHIEVEMENTS) {
    if (Object.prototype.hasOwnProperty.call(s.achievements, def.id)) continue;
    if (achievementMet(def, s)) fresh.push(def.id);
  }
  if (!fresh.length) return fresh;
  // Nouvelle référence (les sélecteurs de l'interface comparent en surface).
  const next = { ...s.achievements };
  for (const id of fresh) next[id] = now;
  s.achievements = next;
  sendToSteam(fresh);
  if (shout && !isNotifyPaused()) {
    announce(fresh);
    annoncer('succes', { n: fresh.length });   // son carillon (audio/moments)
  }
  saveSoon();
  return fresh;
}
