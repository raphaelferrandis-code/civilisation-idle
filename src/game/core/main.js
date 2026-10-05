"use strict";

import {
  state,
  renderCache,
  collapseInProgress,
  collapseUnderway,
  gamePaused,
  save,
  invalidateRenderCache,
  render,
  setGamePaused,
  setCollapseInProgress,
  setNotifyPaused,
  setOfflineSim,
  notify,
  hydrateState
} from './state.js';
import { cloudMirrorSave } from './cloudSave.js';
import { stripBom, newSaveEpoch, isFutureSave, looksLikeSave } from './saveKey.js';
import { BEFORE_IMPORT_KEY } from './saveBackups.js';
import { replaceGameByReload } from './saveSlots.js';
import { MUSIQUES, musiqueParId } from '../audio/musiques.js';

import {
  has,
  crisisCosts,
  autoCollapseDelay,
  ruinGain,
  ruinEffectSum,
  timeWearRate,
  rates,
  crisisOpen,
  currentEraIndex,
  addProductionPenalty
} from './mechanics.js';

import {
  IDLE_BASE_CAP_SECONDS, IDLE_CAP_PALIERS, OFFLINE_MAX_COLLAPSES, OFFLINE_UNCAPPED_COLLAPSES,
  CLEPSYDRE_CAP_MULT, CLEPSYDRE_MIN_POUR_SECONDS, REGROWTH_RUSH_MS, MAISON_RANKS
} from './balance.js';
import { RANK_LABELS } from './actions/maisonRang.js';
import { maisonRank } from './actions/maisonTable.js';
import { idleResumeNarrative } from '../data/idleNarrative.js';
import { publishIdleReport } from './idleReport.js';

import {
  tick,
  resetOfflineBoonQuota,
  resetOfflineTempleQuota,
  log,
  chronicle,
  runCrisisAction,
  completeCollapse,
  registerOlympusInteraction,
  resumeAfterCrisisOutcome
} from './actions.js';

import { shiftAutoCrisisClock, decayRegulationRelief, ragnarokEndDue } from './actions/tick.js';
import { tickRoadWorks } from './actions/roadWorks.js';
import { runCollapseSequence, generateEpitaph, collapseCause } from './events.js';
import { resumeActiveRuinsChoiceIfPending } from './actions/myths.js';
import { dynastyNames } from '../data/buildings.js';
import { epitaphLegacyById } from '../data/epitaphs.js';
import { cycleVowChoosable } from '../data/vows.js';
import { collapseHarvest } from './mechanics/collapseHarvest.js';
import { BRAISIERS_DURATION_MS, ENEE_HERITAGE_DURATION_MS, HEPH_POP_DECAY_START_MIN, RAGNAROK_ID, RAGNAROK_WINTER_AT_MS, isMythEffectActive, getMythById } from '../data/myths.js';
import { D } from './num.js';
import { decideTickCredit, shiftStateTimestamps } from './offlineCredit.js';

import {
  encodeSaveText,
  decodeSaveText,
  fmt,
  fmtSecs,
  labelFor,
  clamp,
  clamp01,
  canPayCost
} from './utils.js';

import { upgrades } from '../data/upgrades.js';
import { tr } from './i18n.js';

import { registerWorldEffects } from '../data/worldEffects.js';

// Injection des implémentations de core/ dans le pont d'effets de world.js
// (casse le cycle d'imports world.js ↔ core/).
registerWorldEffects({ addProductionPenalty, chronicle, clamp01, state });

export async function exportSave() {
  const text = encodeSaveText(JSON.stringify(state));
  try {
    if (!navigator.clipboard) throw new Error("clipboard indisponible");
    await navigator.clipboard.writeText(text);
    log(tr({ fr: "Sauvegarde exportée dans le presse-papiers.", en: "Save exported to the clipboard." }));
    render();
    return { ok: true, text };
  } catch {
    log(tr({ fr: "Copie automatique impossible, copie le texte manuellement.", en: "Automatic copy failed: copy the text manually." }));
    render();
    return { ok: false, text };
  }
}

// Pourquoi le dernier import a été refusé ("" = accepté, ou rien tenté) :
// 'newer' (save d'une version plus récente du jeu) se dit autrement qu'un code
// invalide — le joueur doit mettre le jeu à jour, pas chercher un autre code.
let lastImportRefusal = "";
export const getLastImportRefusal = () => lastImportRefusal;

export function importSave(text) {
  lastImportRefusal = "";
  // Pas pendant une chute (collapseUnderway, state.js) : on la laisse aller à la
  // stèle — le rechargement qui met la partie importée en place la couperait net.
  // Refus muet côté Journal — rien ne s'écrit dans l'état avant la stèle
  // (invariant §1.3 d'events.js) ; l'interface grise ses boutons.
  if (collapseUnderway()) { lastImportRefusal = "chute"; return false; }
  try {
    // Deux formes acceptées : le code de l'export (base64) et le JSON BRUT — une
    // copie de secours, le fichier nuage ou une save relevée à la main dans le
    // localStorage, qu'on refusait (SAV-3). BOM retiré dans les deux cas : un
    // fichier passé par un éditeur en porte un, et JSON.parse le refuse (SAV-1).
    const trimmed = stripBom(String(text).trim());
    const raw = trimmed.startsWith("{") ? trimmed : stripBom(decodeSaveText(trimmed));
    const parsed = JSON.parse(raw);
    // FORME D'ABORD (SAV-7) : n'importe quel JSON en base64 passait — 42, [],
    // null, le code d'un autre jeu — et devenait une partie NEUVE, écrite partout.
    if (!looksLikeSave(parsed)) throw new Error("pas une sauvegarde de ce jeu");
    // Version PLUS RÉCENTE que ce build (SAV-6) : l'importer la rétrograderait
    // (champs inconnus jetés), puis l'écrirait de force dans le nuage. Refusée.
    if (isFutureSave(parsed)) {
      lastImportRefusal = "newer";
      log(tr({
        fr: "Import refusé : cette sauvegarde vient d'une version plus récente du jeu. Mets le jeu à jour pour la charger.",
        en: "Import refused: this save comes from a newer version of the game. Update the game to load it."
      }));
      render();
      return false;
    }
    const imported = hydrateState(parsed);
    // Époque fraîche (saveKey.js, SAV-4) : l'import REMPLACE la partie, les autres
    // postes l'adopteront au lancement au lieu de remettre l'ancienne dans Drive.
    imported.saveEpoch = newSaveEpoch();
    // La ligne du Journal voyage avec la partie importée : c'est elle qu'on verra.
    imported.history = [...(imported.history || []), tr({ fr: "Une civilisation importée reprend son cycle.", en: "An imported civilization resumes its cycle." })].slice(-48);
    // Mise en place PAR UN RECHARGEMENT (saveSlots.js, SAV-8) : sur place, la main
    // de vingt-et-un, le vol d'Icare et les séquences en vol de la partie quittée
    // se réglaient dans la partie importée. Le démarrage pousse aussi le nuage :
    // un import VOLONTAIRE fait autorité, même moins avancé.
    const ok = replaceGameByReload(imported, {
      // La partie remplacée est gardée de côté (Options › Autres, saveBackups.js),
      // dans un essai À PART et APRÈS la partie en attente : un stockage plein ne
      // doit pas empêcher l'import — la copie est un filet, pas un préalable (SAV-7).
      beforeReload: () => localStorage.setItem(BEFORE_IMPORT_KEY, JSON.stringify(state))
    });
    if (!ok) {
      lastImportRefusal = "storage";
      log(tr({ fr: "Import impossible : le stockage est plein.", en: "Import failed: storage is full." }));
      render();
      return false;
    }
    return true;
  } catch {
    lastImportRefusal = "invalid";
    log(tr({ fr: "Import impossible : le texte ne ressemble pas à une sauvegarde valide.", en: "Import failed: the text does not look like a valid save." }));
    render();
    return false;
  }
}

// Les outils de triche du menu « Mode debug » (addDebug*, debugBuyEarlyRuins)
// vivent dans debugTools.js, importé par le seul DebugDialog : ici, ils
// partaient dans le build de production (audit du 2026-10-05, DEV-1).

// Cap d'absence créditée (production + Usure), en secondes : 2 h gratuites pour
// tous + paliers « Veilleurs de nuit » possédés (cf. CE-spec-idle-crises.md §B.3).
export function idleCapSeconds() {
  let cap = IDLE_BASE_CAP_SECONDS;
  for (const [id, seconds] of Object.entries(IDLE_CAP_PALIERS)) if (has(id)) cap += seconds;
  return cap;
}

// Prochain palier d'absence non possédé : { id, nom, cap } où `cap` est la
// réserve TOTALE une fois ce palier acquis. null quand tout est pris.
// Sert à faire du plafond un OBJECTIF nommé plutôt qu'une punition découverte
// après coup, au retour d'une longue absence.
export function nextIdleCapPalier() {
  let cap = IDLE_BASE_CAP_SECONDS;
  let pending = null;
  for (const [id, seconds] of Object.entries(IDLE_CAP_PALIERS)) {
    if (has(id)) { cap += seconds; continue; }
    // Les paliers se cumulent : le premier non possédé est le prochain objectif,
    // et son cap se calcule sur la base courante, pas sur le total final.
    if (!pending) pending = { id, seconds };
  }
  if (!pending) return null;
  const upgrade = upgrades.find((u) => u.id === pending.id);
  return { id: pending.id, name: upgrade ? tr(upgrade.name) : pending.id, cap: cap + pending.seconds };
}

// Contenance de la CLEPSYDRE (C7), en secondes : le temps d'absence reçu
// au-dessus du plafond n'est plus jeté, il attend ici que le joueur le verse.
// Indexée sur la réserve d'absence : les « Veilleurs de nuit » agrandissent les
// deux d'un coup, il n'y a donc qu'un seul chiffre à faire grandir.
export function clepsydreCapSeconds() {
  return Math.round(idleCapSeconds() * CLEPSYDRE_CAP_MULT);
}

// Pas (s. virtuelles) de la simulation hors-ligne. Petit → l'auto-achat (1 bâtiment
// par tick) rebâtit correctement ; borné par OFFLINE_MAX_COLLAPSES + le cap d'idle.
const OFFLINE_STEP_SECONDS = 10;

// Crédite `seconds` de production aux taux `r` (un relevé de rates(), le taux
// COURANT par défaut) sur les 5 ressources. Fonction de MODULE et non plus une
// closure de simulateAwayCrises : la clepsydre (C7) crédite le même temps par le
// même chemin, et deux arithmétiques parallèles finiraient par diverger. Decimal
// de bout en bout, jamais de coercition.
function creditSpan(seconds, r = rates()) {
  if (seconds <= 0) return;
  state.population = D(state.population).add(D(r.population).mul(seconds));
  state.food = D(state.food).add(D(r.food).mul(seconds));
  state.gold = D(state.gold).add(D(r.gold).mul(seconds));
  state.knowledge = D(state.knowledge).add(D(r.knowledge).mul(seconds));
  state.infrastructure = D(state.infrastructure).add(D(r.infrastructure).mul(seconds));
}

// Farm hors-ligne (cf. CE-spec §B.5, v2) : rejoue la VRAIE boucle tick() par pas
// grossiers sur le temps d'absence → l'auto-achat (Héphaïstos) rebâtit, l'Usure et
// la Rupture montent, et l'Édit d'effondrement effondre au déclencheur choisi, en
// banquant les ruines. Plafonné à OFFLINE_MAX_COLLAPSES.
// Éligibilité : auto-achat (hephHeritage) + auto-effondrement activé — sinon la
// cité ne se rebâtit pas seule et on retombe sur le crédit linéaire (return null).
// Effets de bord neutralisés : notifications React suspendues, crises narratives
// 25/50/75 supprimées (évite les dialogues async), spam de Chronique jeté.
// Éligibilité au farm, partagée avec applyOfflineProgress (crise terminale, BUG-9).
function farmEligible() {
  const ac = state.crisisDoctrine && state.crisisDoctrine.autoCollapse;
  return Boolean(state.hephHeritage && has("edit_effondrement") && ac && ac.enabled);
}

// Atlas (« on ne repose pas le monde ») : tant que l'essai vit — ni sacré, ni
// écrasé —, les seuils « usure » et « temps » de l'Édit ne tirent pas (BUG-79).
// PARTAGÉ par checkAutoCollapse et le farm hors ligne : retenu en ligne seulement,
// fermer le jeu quelques secondes faisait tirer le seuil au premier pas du farm,
// Fardeau encore sous 100, et sacrait l'essai sans le tenir.
function atlasHoldsEdict() {
  return isMythEffectActive("mythe_d_atlas") && !state.atlasCrushed;
}

function simulateAwayCrises(elapsedSeconds) {
  if (!farmEligible()) return null;
  const ac = state.crisisDoctrine.autoCollapse;

  const realDateNow = Date.now;
  const savedHistory = state.history;
  // Les 3 paliers de crise sont pré-latchés ci-dessous pour éviter les dialogues
  // async hors-ligne. Ce latch ne doit PAS fuir dans le cycle en ligne qui suit
  // (cf. le `finally`), sinon le joueur revient sans aucune crise narrative.
  const savedThresholds = { ...state.crisisThresholds };
  const ruinsBefore = D(state.ruins);
  let virtual = realDateNow.call(Date) - elapsedSeconds * 1000;
  let collapses = 0;
  let frozenSec = 0; // reliquat d'une cité restée gelée en crise terminale (plus bas)
  const markThresholds = () => { state.crisisThresholds = { _25: true, _50: true, _75: true }; };

  // (Versement de clepsydre : les horodatages ont déjà été rebasés de −spend par
  // advanceWorldBy — rebaseWorldClock —, l'horloge virtuelle part donc bien de
  // l'instant où l'état « a été quitté ».)

  // Capstone « Phénix calendaire » : le plafond d'effondrements saute (il ne
  // reste qu'une borne de sécurité perf).
  const maxCollapses = has("phenix_calendaire") ? OFFLINE_UNCAPPED_COLLAPSES : OFFLINE_MAX_COLLAPSES;
  Date.now = () => virtual;
  setNotifyPaused(true);
  // Les deux drapeaux se lèvent ENSEMBLE : « pas de bruit visuel » et « on
  // rejoue du temps » sont deux choses différentes, et c'est le second qui
  // autorise le Temple et les aubaines à tourner, plafonnés, pendant l'absence.
  setOfflineSim(true);
  resetOfflineTempleQuota();
  resetOfflineBoonQuota();
  try {
    markThresholds(); // pas de crises narratives hors-ligne (flavor foreground)
    let remaining = elapsedSeconds;
    while (remaining > 0 && collapses < maxCollapses) {
      const step = Math.min(OFFLINE_STEP_SECONDS, remaining);
      remaining -= step;
      virtual += step * 1000;
      tick(step); // prod + Usure + dérive Rupture + auto-achat + maj des pics
      if (gamePaused) { setGamePaused(false); break; } // sécurité : aucun dialogue ne doit s'ouvrir

      const cycleAge = (virtual - (state.cycleStartedAt || virtual)) / 1000;
      // Même retenue d'Atlas qu'en ligne (atlasHoldsEdict) : personne n'épaule
      // hors ligne, le ciel finit par écraser l'essai, et l'Édit reprend alors.
      const triggered = atlasHoldsEdict() ? false
        : ac.trigger === "usure" ? (state.timeWear || 0) >= (ac.usureThreshold ?? 0.9)
        : ac.trigger === "temps" ? cycleAge >= (ac.timeSeconds ?? 600)
        : false;
      // La crise terminale (tick() a posé le drapeau) est une FIN DE CYCLE pour
      // TOUS les déclencheurs, pas seulement rupture100 : elle gèle le tick, donc
      // l'Usure — le déclencheur « usure » n'y aurait plus jamais tiré, et toute
      // l'absence restante passait sans production ni chute (BUG-10).
      // « L'Hiver Fimbul » échu (BUG-28) : en ligne, le tick effondre de force à
      // 24 min ; sous la sim il s'en garde (deuil async), la Fin tombe donc ICI,
      // par le chemin synchrone — sinon le cycle survivait à la Fin pendant
      // l'absence, et le pacte ne se brisait qu'à la chute suivante de l'Édit.
      const endDue = ragnarokEndDue();
      const fire = triggered || state.crisisLimitAnnounced || endDue;
      if (!fire) continue;

      // Chaque effondrement hors-ligne grave le testament s'il existe, sinon
      // répète la dernière volonté (dernier legs choisi) — même règle que l'Édit
      // en ligne, même arithmétique de gain que le dialogue (rite d'effondrement
      // puis multiplicateur du legs, affinité recalculée sur la cause de CETTE chute).
      const cause = collapseCause();
      const legacy = epitaphLegacyById(state.testamentLegacyId) || epitaphLegacyById(state.nextEpitaphLegacy?.id);
      // Rite × legs × vœu : collapseHarvest, même source que la stèle et l'Édit
      // (BUG-33). Le vœu du cycle (D2), reconduit hors ligne, y est lu avant que
      // completeCollapse ne le remette à zéro (et n'en reconduise un).
      const gain = collapseHarvest(ruinGain(true), legacy, cause);
      if (D(gain).gt(0)) {
        if (legacy) state.nextEpitaphLegacy = { id: legacy.id, cause, chosenCycle: state.cycles || 0, startedAt: Date.now() };
        completeCollapse(gain, dynastyNames[state.cycles % dynastyNames.length], generateEpitaph(), endDue ? "forced" : "auto_collapse");
        collapses += 1;
        markThresholds(); // completeCollapse a remis crisisThresholds à {}
      } else if (state.crisisLimitAnnounced) {
        break; // crise terminale mais gain nul (cité trop jeune) : on évite de boucler à vide
      }
    }
    // Temps restant après le plafond d'effondrements : crédit linéaire (pas de gâchis).
    // Même chemin que l'absence sans farm (creditSpanSegmented) : scindé aux bornes
    // des fenêtres ACTIVES (Braisiers de Prométhée, Cendres fertiles…) d'un cycle
    // souvent tout neuf, chaque taux relevé avant le moindre crédit. Le reliquat
    // court de l'instant virtuel courant jusqu'à maintenant.
    // Sauf pour une cité restée GELÉE en crise terminale (gain nul, la sortie
    // `break` ci-dessus) : l'Édit ne peut pas l'effondrer, et en ligne rien n'y
    // tourne — ni production, ni voirie, ni fatigue. Ce reliquat était crédité au
    // taux plein à une cité figée (deux heures de production, depuis que BUG-9 et
    // BUG-10 mènent aussi ici une absence partie en crise terminale). Il n'est
    // pas jeté pour autant : advanceWorldBy le verse dans la clepsydre, comme
    // l'absence d'une cité déjà gelée au départ (stashFrozenAbsence).
    if (remaining > 0 && state.crisisLimitAnnounced) {
      frozenSec = remaining;
    } else if (remaining > 0) {
      creditSpanSegmented(remaining, virtual + remaining * 1000);
      // Voirie et fatigue suivent le même reliquat (BUG-72).
      advanceIdleClocks(remaining);
    }
  } finally {
    Date.now = realDateNow;
    // L'état est rendu AVANT les notifications (setNotifyPaused, setGamePaused) :
    // le premier rendu réveillé ne doit voir ni le journal de la simulation ni ses
    // paliers pré-latchés (BUG-31).
    state.history = savedHistory; // on jette le spam de Chronique hors-ligne
    // On rend ses crises au cycle EN LIGNE. Sans ça, markThresholds() survivait à
    // la simulation et applyOfflineProgress le persistait par save() : plus aucune
    // crise narrative jusqu'au prochain effondrement (donc plus de dialogues, plus
    // de Moisson de crise, et les compteurs d'Olympe gelés). Si des effondrements
    // ont eu lieu, le cycle courant est NEUF : il repart avec ses 3 paliers vierges,
    // exactement ce que laissait completeCollapse.
    state.crisisThresholds = collapses > 0 ? {} : savedThresholds;
    invalidateRenderCache("all");
    setNotifyPaused(false);
    setOfflineSim(false);
    setGamePaused(false);
  }
  return { collapses, ruinsGained: D(state.ruins).sub(ruinsBefore).max(0), frozenSec };
}

// Progression hors-ligne (cf. §B). Deux régimes :
//  - FARM (Héphaïstos + Édit d'effondrement actif) : la vraie boucle est rejouée,
//    la cité s'effondre et se relève en banquant des ruines (simulateAwayCrises).
//  - LINÉAIRE (sinon) : la cité PRODUIT et vieillit au taux courant, bornés par le
//    MÊME cap (idleCapSeconds) — au-delà, tout gèle. Rupture gelée.
// Remplace l'ancien hors-ligne « Usure seule ×0.35 », qui ne produisait rien.
// Les 5 ressources suivies par le rapport de reprise.
const REPORT_RESOURCES = ["population", "food", "gold", "knowledge", "infrastructure"];
// Sous ce seuil, aucun rapport : un aller-retour d'onglet de quelques secondes
// n'est pas une absence, et le crédit de visibilitychange applique déjà 60 s.
const REPORT_MIN_SEC = 60;

// Un TITRE de la Maison gagné pendant l'absence (les autos du temple jouent sur le
// chemin farm) : son annonce passait à la trappe — float coupé, ligne de Chronique
// jetée avec l'historique hors ligne. Une ligne ici, une ligne au rapport.
function awayRankLabel(before) {
  const r = maisonRank();
  if (!(r > (before.maisonRank || 0))) return null;
  const labels = RANK_LABELS[MAISON_RANKS[r].id];
  return labels ? tr(labels) : null;
}
function chronicleAwayRank(before) {
  const label = awayRankLabel(before);
  if (label) chronicle(tr({ fr: `Pendant ton absence, la Maison des Plaisirs t'a élevé au rang de ${label}.`, en: `While you were away, the House of Pleasures raised you to the rank of ${label}.` }));
}

// Même trappe pour les MYTHES (BUG-31) : sur le chemin farm, la vraie boucle sacre
// un Mythe en direct, ou l'Édit effondre avant qu'il soit honoré — et « Pacte
// honoré » / « Pacte brisé » partaient avec le journal de la simulation. Noms des
// pactes honorés, et celui qui s'est brisé (le Mythe actif au départ, levé sans
// avoir été accompli : seule une chute le lève hors ligne).
function awayMythLabels(before) {
  const done = state.mythsCompleted || {};
  const crowned = Object.keys(done)
    .filter((id) => done[id] && !before.mythsCompleted?.[id])
    .map((id) => getMythById(id))
    .filter(Boolean)
    .map((myth) => tr(myth.name));
  const was = before.activeMythId;
  const brokenMyth = was && state.activeMythId !== was && !done[was] ? getMythById(was) : null;
  return { crowned, broken: brokenMyth ? tr(brokenMyth.name) : null };
}
function chronicleAwayMyths(before) {
  const { crowned, broken } = awayMythLabels(before);
  for (const name of crowned) {
    chronicle(tr({ fr: `Pendant ton absence, le pacte « ${name} » a été honoré.`, en: `While you were away, the pact “${name}” was honored.` }));
  }
  if (broken) {
    chronicle(tr({ fr: `Pendant ton absence, la cité est tombée avant d'honorer le pacte « ${broken} » : il est brisé.`, en: `While you were away, the city fell before honoring the pact “${broken}”: it is broken.` }));
  }
}

// Instantané pris AVANT d'avancer le monde, lu par le rapport et les annonces.
function awaySnapshot() {
  const before = {};
  for (const key of REPORT_RESOURCES) before[key] = D(state[key]);
  before.maisonRank = maisonRank();
  before.mythsCompleted = { ...(state.mythsCompleted || {}) };
  before.activeMythId = state.activeMythId || null;
  return before;
}

// Assemble le rapport à partir de l'instantané pris avant la simulation. Les
// montants sortent en CHAÎNES : ils dépassent le float, et la vue n'a qu'à les
// afficher. Rien de ce qui est calculé ici n'est relu par le moteur.
function buildIdleReport({ narrative, heading, before, farm, elapsedSeconds, elapsed, wearBefore, storedSec = 0 }) {
  const deltas = [];
  for (const key of REPORT_RESOURCES) {
    const diff = D(state[key]).sub(before[key]);
    // Les variations nulles ne disent rien : une ligne « +0 » par ressource
    // ferait un tableau que personne ne lit.
    if (diff.abs().lt(1)) continue;
    deltas.push({ key, label: labelFor(key), amount: fmt(diff), negative: diff.lt(0) });
  }
  // Ce qui NE tourne PAS pendant l'absence. Sans cette liste, l'écart avec
  // l'attente se lit comme un bug. Le Temple et les aubaines ne tournent (C12)
  // que sur le chemin FARM (la vraie boucle rejouée) : sur le chemin linéaire,
  // les cadrans payés ne jouent pas et aucune aubaine ne tombe — le taire
  // ferait chercher un bug à qui a payé ses automatisations 500-700 ✦.
  const idle = [
    { label: tr({ fr: "les fêtes de jalon", en: "milestone celebrations" }) },
    { label: tr({ fr: "les bulles d'habitants", en: "citizen bubbles" }) }
  ];
  if (!farm) {
    idle.push(
      { label: tr({ fr: "les cadrans du temple et les aubaines", en: "temple dials and boons" }) },
      { label: tr({ fr: "la Rupture, gelée hors ligne", en: "Rupture, frozen while away" }) }
    );
  }
  return {
    title: narrative,
    // En-tête alternatif : un versement de clepsydre n'est pas une absence.
    heading: heading || null,
    awaySec: Math.max(0, Math.round(elapsedSeconds)),
    creditedSec: Math.round(elapsed),
    capSec: idleCapSeconds(),
    // Ce qui a débordé du plafond et qui n'est PLUS perdu : versé dans la
    // clepsydre. Le rapport doit le dire, sinon le joueur lit encore « perdu »
    // sur du temps que le jeu vient de lui mettre de côté.
    storedSec: Math.round(storedSec),
    farm: !!farm,
    collapses: farm ? farm.collapses : 0,
    ruinsGained: farm && farm.collapses > 0 ? fmt(farm.ruinsGained) : null,
    wearDelta: Math.round(((state.timeWear || 0) - wearBefore) * 100),
    rank: awayRankLabel(before),
    myths: awayMythLabels(before),
    deltas,
    idle
  };
}

// AVANCER LE MONDE de `seconds`, par le régime qui convient à la partie : la
// vraie boucle rejouée sous horloge virtuelle (farm) quand le joueur l'a
// débloquée, sinon le crédit linéaire. Facteur COMMUN à l'absence et au
// versement de clepsydre — c'est la garantie que verser une heure vaut
// exactement une heure d'absence, et pas une seconde arithmétique parallèle qui
// dériverait à la première correction d'équilibrage.
// Crédit linéaire SCINDÉ aux bornes des fenêtres temporelles (Bénédiction,
// Braisiers, Atrides/pacte, Cendres fertiles, Énée, legs d'épitaphe). rates()
// évalué une seule fois à l'heure du retour ne voyait plus les fenêtres
// expirées PENDANT l'absence : les minutes bénies restantes à la fermeture
// étaient créditées ×1 (l'inverse du piège que la clepsydre refuse). Les
// fenêtres sont des fonctions en ESCALIER de Date.now : chaque segment est
// évalué sous son instant d'ouverture, ce qui suffit à les faire (dé)tomber
// juste — même recette d'horloge virtuelle que la sim, sans rejouer de ticks.
// `end` : fin du crédit (maintenant, ou l'instant visé par la sim pour son reliquat).
// ⚠ TOUS les taux sont relevés AVANT le premier crédit (BUG-7). Créditer segment
// par segment faisait relire rates() au segment suivant sur des stocks déjà
// gonflés — la Nourriture de base suit la population — : une coupe à 30 s du
// départ suffisait à payer les deux heures restantes ×2,3. Et une coupe ne se
// pose que si la fenêtre qu'elle ferme est ACTIVE : sans effet, elle ne fait que
// multiplier les relevés.
function creditSpanSegmented(seconds, end = Date.now()) {
  const clockBefore = Date.now;
  const start = end - seconds * 1000;
  const cs = state.cycleStartedAt || 0;
  const windows = [];
  if ((state.blessingUntil || 0) > start) windows.push(state.blessingUntil);
  if (state.prometheeBraisiers) windows.push(cs + BRAISIERS_DURATION_MS);
  if (isMythEffectActive("mythe_atrides") || state.atridesPactActive) windows.push(cs + 120_000); // Atrides / pacte
  if (ruinEffectSum("regrowthRush") > 0) windows.push(cs + REGROWTH_RUSH_MS);
  if (state.eneeHeritage) windows.push(cs + ENEE_HERITAGE_DURATION_MS);
  // Mêmes escaliers de Date.now, côté Mythes, absents de la liste : le Rayonnement
  // d'Héphaïstos s'éteint APRÈS 3 min (hephPopProdMult ×0, test strict `>` : d'où
  // la milliseconde) — un départ avant 3 min payait deux heures de Rayonnement
  // plein au Mythe du déclin. Et l'Hiver Fimbul gèle la production de moitié dès
  // 8 min (ragnarokWinterMult).
  if (isMythEffectActive("mythe_d_hephaistos")) windows.push(cs + HEPH_POP_DECAY_START_MIN * 60_000 + 1);
  if (state.activeMythId === RAGNAROK_ID) windows.push(cs + RAGNAROK_WINTER_AT_MS);
  const cuts = windows.filter((t) => t > start && t < end).sort((a, b) => a - b);
  const points = [start, ...cuts, end];
  const spans = [];
  try {
    for (let i = 0; i < points.length - 1; i++) {
      Date.now = () => points[i];
      invalidateRenderCache("all"); // rates() est cachée par frame
      const r = rates();
      spans.push({
        seconds: (points[i + 1] - points[i]) / 1000,
        r: { population: r.population, food: r.food, gold: r.gold, knowledge: r.knowledge, infrastructure: r.infrastructure }
      });
    }
  } finally {
    Date.now = clockBefore;
    invalidateRenderCache("all");
  }
  for (const span of spans) creditSpan(span.seconds, span.r);
}

// L'HORLOGE DU MONDE décalée d'un bloc (offlineCredit.js, shiftStateTimestamps) :
// les horodatages de l'état ET l'horloge de module du tick (protocoles_urgence).
// Versement de clepsydre (−spend) et horloge système reculée (SAV-12).
function rebaseWorldClock(deltaMs) {
  shiftStateTimestamps(state, deltaMs);
  shiftAutoCrisisClock(deltaMs);
}

// Ce que le crédit LINÉAIRE ne faisait pas, et que le tick fait (BUG-72) : les
// chantiers de voirie avancent sur le temps crédité (un grand dt traverse la
// file), la fatigue de régulation et l'apaisement des foyers s'estompent. Les
// MÊMES fonctions que le tick, appelées APRÈS le crédit et l'Usure : une route
// posée pendant l'absence ne rejoue pas le taux déjà payé. Sans ça, cinq
// chantiers en file et deux heures d'absence ne posaient aucune route.
function advanceIdleClocks(seconds) {
  if (!(seconds > 0)) return;
  const roadsBefore = state.buildings.roads || 0;
  tickRoadWorks(seconds);
  decayRegulationRelief(seconds);
  if ((state.buildings.roads || 0) !== roadsBefore) invalidateRenderCache("buildings");
}

function advanceWorldBy(seconds, opts = {}) {
  const wearBefore = state.timeWear || 0;
  // VERSEMENT DE CLEPSYDRE (BUG-8) : l'état vient d'être écrit en temps RÉEL, mais
  // le temps versé se rejoue de now − spend à now. On ramène tout le référentiel
  // (âge du cycle, legs, Intendance, temple, aubaines, Nuit…) à l'instant où une
  // absence de même durée l'aurait trouvé — sinon le cycle aurait un âge NÉGATIF
  // pendant presque tout le versement (déclencheur « temps » muet, moisson à
  // patience minimale, legs coupé). Avant la sim ET avant le crédit linéaire. JAMAIS
  // sur le chemin absence, où les horodatages datent déjà d'avant le départ.
  if (opts.fromStore) rebaseWorldClock(-seconds * 1000);
  const farm = simulateAwayCrises(seconds); // null si non éligible → chemin linéaire
  if (!farm) {
    // Production au taux courant (bâtiments constants hors-ligne → rates() stable),
    // scindée aux bornes des fenêtres de bonus actives au départ.
    invalidateRenderCache("all");
    creditSpanSegmented(seconds);
    invalidateRenderCache("all");
    // Usure, MÊME durée que la prod (couplage : on ne vieillit jamais plus que ce
    // qu'on a produit). Plus de facteur ×0.35.
    state.timeWear = clamp(wearBefore + timeWearRate() * seconds, 0, 1);
    advanceIdleClocks(seconds);
  }
  // Reliquat d'une cité restée gelée en crise terminale pendant la sim : ni
  // crédité ni jeté, il part dans la clepsydre (sous sa contenance). Versement
  // compris : le temps qui n'a pas pu être joué y retourne. `credited` = le temps
  // réellement joué, pour le rapport.
  const frozenSec = farm ? farm.frozenSec : 0;
  const clepsydreBefore = state.storedSeconds || 0;
  if (frozenSec > 0) state.storedSeconds = Math.min(clepsydreCapSeconds(), clepsydreBefore + frozenSec);
  const frozenStored = Math.max(0, (state.storedSeconds || 0) - clepsydreBefore);
  return { farm, wearBefore, credited: seconds - frozenSec, frozenStored };
}

// Raisons de REFUS d'un versement, dans l'ordre où on les teste. La vue les
// traduit en une phrase sur le bouton : un bouton grisé sans motif se lit comme
// un bug, et le joueur ne peut pas deviner qu'il doit attendre la fin d'un bonus.
export const CLEPSYDRE_REFUSALS = ["busy", "crisis", "bonus", "empty"];

// Pourquoi le versement est impossible, ou null s'il est permis. Séparé de
// spendStoredTime pour que la vue puisse afficher le motif AVANT le clic.
export function clepsydreRefusal() {
  // Effondrement en cours, dialogue bloquant, crise terminale : la sim a déjà
  // ces gardes hors-ligne, et rejouer du temps par-dessus une modale ouverte
  // forcerait setGamePaused(false) derrière elle (bug vécu, cf. ci-dessus).
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return "busy";
  if (crisisOpen()) return "crisis";
  // FENÊTRE DE BONUS. Le versement crédite à TAUX CONSTANT : verser 8 h pendant
  // une Bénédiction de 2 min étalerait son multiplicateur sur les 8 h. C'est le
  // même piège que les Braisiers de Prométhée hors-ligne, que la sim scinde à
  // la sortie de fenêtre — ici on refuse tout court, c'est deux minutes à
  // attendre et ça évite un pic hors courbe payé une fois pour toutes.
  if ((state.blessingUntil || 0) > Date.now()) return "bonus";
  if (state.prometheeBraisiers
      && Date.now() - (state.cycleStartedAt || 0) < BRAISIERS_DURATION_MS) return "bonus";
  // MÊME PIÈGE, AUTRES SOURCES : toutes les fenêtres temporelles que rates()
  // évalue au temps réel. Cendres fertiles (3 premières minutes du cycle),
  // Atrides et son pacte (2 premières), l'essor d'Énée (30 s), et le legs
  // d'épitaphe quand il porte un multiplicateur de PRODUCTION. Sans ces refus,
  // verser 24 h pendant la fenêtre payait tout le trajet au taux ×3.
  const cycleElapsed = Date.now() - (state.cycleStartedAt || 0);
  if (ruinEffectSum("regrowthRush") > 0 && cycleElapsed < REGROWTH_RUSH_MS) return "bonus";
  if ((isMythEffectActive("mythe_atrides") || state.atridesPactActive) && cycleElapsed < 120_000) return "bonus";
  if (state.eneeHeritage && cycleElapsed < ENEE_HERITAGE_DURATION_MS) return "bonus";
  // Le legs d'épitaphe n'est plus une fenêtre (il dure tout le cycle) : verser
  // au taux qu'il donne est juste, il ne bloque donc plus la Clepsydre.
  if (Math.floor(state.storedSeconds || 0) < CLEPSYDRE_MIN_POUR_SECONDS) return "empty";
  return null;
}

// VERSER LA CLEPSYDRE (C7). Le temps mis de côté est rejoué ici, exactement
// comme une absence de la même durée — mêmes gardes, même moteur, même rapport.
// Renvoie { ok } ou { ok: false, reason }.
export function spendStoredTime(seconds = Infinity) {
  const refusal = clepsydreRefusal();
  if (refusal) return { ok: false, reason: refusal };

  const spend = Math.floor(Math.min(seconds, state.storedSeconds || 0));
  if (spend < CLEPSYDRE_MIN_POUR_SECONDS) return { ok: false, reason: "empty" };

  // DÉBITÉE D'ABORD : la simulation peut effondrer la cité et repartir d'un
  // state reconstruit. Débiter après, c'est risquer de rendre le temps déjà
  // dépensé — une clepsydre qui se remplit toute seule.
  state.storedSeconds = Math.max(0, (state.storedSeconds || 0) - spend);

  const before = awaySnapshot();
  const { farm, wearBefore, credited, frozenStored } = advanceWorldBy(spend, { fromStore: true });

  // Même récit que la reprise d'absence : c'est le même temps, joué au même
  // taux. Seul l'en-tête du rapport dit que c'est la clepsydre qui l'a rendu.
  const narrative = idleResumeNarrative({
    elapsedSeconds: spend,
    eraIndex: currentEraIndex(),
    instability: state.instability || 0,
    terminalUsure: state.timeWear >= 1 && wearBefore < 1,
    collapses: farm ? farm.collapses : 0,
    ruinsGained: farm && farm.collapses > 0 ? fmt(farm.ruinsGained) : null
  });
  chronicle(narrative);
  chronicleAwayRank(before);
  chronicleAwayMyths(before);
  publishIdleReport(buildIdleReport({
    narrative,
    heading: tr({ fr: "La clepsydre s'est vidée", en: "The clepsydra has emptied" }),
    before, farm, elapsedSeconds: spend, elapsed: credited, wearBefore, storedSec: frozenStored
  }));
  // lastTick n'est PAS touché : aucun temps réel ne s'est écoulé, et le recaler
  // ferait perdre l'absence en cours de comptage par la boucle de tick.
  save();
  render();
  return { ok: true, spent: credited, collapses: farm ? farm.collapses : 0 };
}

// Le joueur prête son vœu du cycle (D2) parmi les trois proposés. Rendu immédiat
// pour que la rangée bascule de « choisir » à « en cours » au clic, sans attendre
// le prochain tick. Idempotent : une fois choisi, le vœu ne se rechange plus.
// Seulement dans la fenêtre du début de cycle (cycleVowChoosable).
export function chooseCycleVow(id) {
  const cv = state.cycleVow;
  if (collapseInProgress || !cycleVowChoosable(state)) return false;
  const entry = cv.offered.find((o) => o.id === id);
  if (!entry) return false;
  // Nouvelle RÉFÉRENCE : le sélecteur plat de useCityViewState compare en surface.
  state.cycleVow = { ...cv, chosen: { id: entry.id, target: entry.target, base: entry.base }, done: false };
  save();
  render();
  return true;
}

// Absence d'une cité GELÉE (BUG-9) : dialogue bloquant, ou crise terminale hors
// farm. En ligne non plus rien n'y tourne, donc on ne crédite rien — et surtout on
// ne rejoue rien derrière une modale (la sim forçait setGamePaused(false) sous
// elle). Mais l'absence ne se jette plus : elle va TOUTE dans la clepsydre (sous
// sa contenance), à verser une fois la cité relancée. Avant, elle était perdue
// sans un mot, puis le premier tick recalait l'ancre. Même plancher que le crédit.
function stashFrozenAbsence(elapsedSeconds) {
  const away = Math.max(0, elapsedSeconds);
  if (away <= 10) return;
  const clepsydreBefore = state.storedSeconds || 0;
  state.storedSeconds = Math.min(clepsydreCapSeconds(), clepsydreBefore + away);
  const stored = state.storedSeconds - clepsydreBefore;
  if (stored >= REPORT_MIN_SEC) {
    chronicle(tr({
      fr: `Pendant ton absence, la cité est restée figée : ${fmtSecs(stored)} versées dans la clepsydre.`,
      en: `While you were away, the city stood still: ${fmtSecs(stored)} poured into the clepsydra.`
    }));
  }
  state.lastTick = Date.now();
  save();
}

export function applyOfflineProgress(elapsedSeconds = (Date.now() - state.lastTick) / 1000) {
  // Effondrement en cours : la séquence (deuil, chute sur la carte, stèle) tient
  // la cité et la reconstruit — on ne touche à rien.
  if (collapseInProgress) return;
  // Dialogue bloquant (gamePaused) ou crise terminale HORS farm : cité gelée, le
  // temps part dans la clepsydre (stashFrozenAbsence). En FARM, la crise terminale
  // n'est qu'une fin de cycle : la simulation laisse l'Édit effondrer dès le
  // premier pas, quel que soit son déclencheur (BUG-9, BUG-10) — avant, toute la
  // nuit du farm était jetée si l'on quittait pendant la grâce terminale.
  if (gamePaused || (state.crisisLimitAnnounced && !farmEligible())) {
    stashFrozenAbsence(elapsedSeconds);
    return;
  }
  const elapsed = Math.min(idleCapSeconds(), Math.max(0, elapsedSeconds));
  if (elapsed <= 10) return;

  // LE DÉBORDEMENT NE SE JETTE PLUS (C7) : ce qui dépasse le plafond va dans la
  // clepsydre, où il attend que le joueur le verse. Banqué AVANT la simulation :
  // celle-ci peut effondrer la cité et rendre `elapsed` incomparable après coup.
  const before = awaySnapshot();
  const clepsydreBefore = state.storedSeconds || 0;
  const overflow = Math.max(0, elapsedSeconds - elapsed);
  if (overflow > 0) {
    state.storedSeconds = Math.min(clepsydreCapSeconds(), clepsydreBefore + overflow);
  }
  const storedSec = Math.max(0, (state.storedSeconds || 0) - clepsydreBefore);

  const { farm, wearBefore, credited, frozenStored } = advanceWorldBy(elapsed);

  // Habillage narratif de la reprise. La MÊME phrase sert de ligne de Chronique
  // et de titre au rapport : la dupliquer en deux textes distincts donnerait
  // deux versions de la même chose à tenir à jour.
  const narrative = idleResumeNarrative({
    elapsedSeconds,
    eraIndex: currentEraIndex(),
    instability: state.instability || 0,
    terminalUsure: state.timeWear >= 1 && wearBefore < 1,
    collapses: farm ? farm.collapses : 0,
    ruinsGained: farm && farm.collapses > 0 ? fmt(farm.ruinsGained) : null
  });
  // Même seuil que le rapport (BUG-52) : un aller-retour d'onglet de 15 s, ou un
  // gel d'onglet visible, n'a pas à écrire un récit d'absence dans la Chronique.
  // Le titre gagné, les pactes et une chute du farm, eux, sont de vrais
  // événements : toujours dits.
  if (elapsedSeconds >= REPORT_MIN_SEC || (farm && farm.collapses > 0)) chronicle(narrative);
  chronicleAwayRank(before);
  chronicleAwayMyths(before);
  // Pas de rapport pour un aller-retour d'onglet : on n'annonce une récolte que
  // s'il y a eu une vraie absence.
  if (elapsedSeconds >= REPORT_MIN_SEC) {
    publishIdleReport(buildIdleReport({ narrative, before, farm, elapsedSeconds, elapsed: credited, wearBefore, storedSec: storedSec + frozenStored }));
  }
  // Crédité jusqu'à MAINTENANT : on recale l'ancre du hors-ligne. save() et le
  // tick ne posent plus lastTick ailleurs → sans ceci, le prochain calcul
  // (visibilitychange / boot) recréditerait ce même intervalle (double-comptage).
  state.lastTick = Date.now();
  save();
}

// Rattrapage hors-ligne GARDÉ (audit 2026-10-05, BUG-30) — démarrage, tick
// « offline » (veille système) et retour d'onglet. La simulation rejoue des
// milliers de ticks de toute la logique sous une horloge virtuelle, dans des états
// rares : le jour où elle lève, l'exception remontait dans l'effet d'App qui lance
// la boucle — écran blanc, intervalles jamais posés, et chaque relance rejouait la
// même absence. On journalise et on recale l'ancre : cette absence est perdue,
// mais la partie, la boucle et l'autosave tournent. Les `finally` de la sim ont
// déjà rendu l'horloge, les notifications et la pause. Exportée pour les tests.
export function applyOfflineProgressSafely(elapsedSeconds) {
  try {
    applyOfflineProgress(elapsedSeconds);
  } catch (err) {
    console.error("Rattrapage hors-ligne interrompu, absence non créditée :", err);
    state.lastTick = Date.now();
  }
}

// Effondrement automatique configurable (Édit d'effondrement / Doctrine de crise,
// cf. CE-spec-idle-crises.md §A.4). Trigger au choix : "rupture100" (crise
// terminale + grâce), "usure" (seuil d'Usure), "temps" (durée de cycle). Les deux
// derniers peuvent effondrer une cité NON terminale — d'où ruinGain(projected).
// La crise terminale reste, pour TOUS, une fin de cycle (grâce puis chute).
export function checkAutoCollapse() {
  if (collapseInProgress || gamePaused) return;
  const ac = state.crisisDoctrine?.autoCollapse;
  if (!ac || !ac.enabled || !has("edit_effondrement")) return;

  // Chaque branche qui n'effondre pas sort ; au-delà, la chute est décidée.
  let projected = false; // gain "comme si on s'effondrait maintenant" hors crise terminale
  const cycleSec = (Date.now() - (state.cycleStartedAt || Date.now())) / 1000;
  // Atlas (« on ne repose pas le monde ») : tant que l'essai vit — ni sacré, ni
  // écrasé —, les seuils « usure » et « temps » ne tirent pas. Ce serait une chute
  // manuelle programmée d'avance, que le Mythe refuse (audit 2026-10-05, BUG-79).
  // La crise terminale, elle, tranche encore après sa grâce : le tick y gèle le
  // Fardeau et ÉPAULER, l'essai ne peut plus avancer, et l'Édit est alors la SEULE
  // sortie (collapse() refuse la chute manuelle sous Atlas). Même règle pour le
  // farm hors ligne (atlasHoldsEdict, simulateAwayCrises).
  const atlasHolds = atlasHoldsEdict();
  if (!atlasHolds && ac.trigger === "usure" && (state.timeWear || 0) >= (ac.usureThreshold ?? 0.9)) {
    projected = !crisisOpen();
  } else if (!atlasHolds && ac.trigger === "temps" && cycleSec >= (ac.timeSeconds ?? 600)) {
    projected = !crisisOpen();
  } else if (state.crisisLimitAnnounced) {
    // Crise terminale : on attend un délai de grâce, puis on effondre — le
    // comportement historique de rupture100, étendu aux deux autres déclencheurs
    // (BUG-10). La crise terminale gèle le tick, donc l'Usure : sur « usure », un
    // cycle arrivé à 100 % de Rupture avant le seuil restait gelé pour toujours,
    // l'Édit payé ne tirait plus jamais.
    if (!state.crisisOpenedAt) { state.crisisOpenedAt = Date.now(); return; }
    if (Date.now() - state.crisisOpenedAt < autoCollapseDelay()) return;
  } else {
    if (ac.trigger === "rupture100") state.crisisOpenedAt = state.crisisOpenedAt || null;
    return;
  }

  // Option "prepare" : si la crise terminale est ouverte ET résoluble (Rupture, pas
  // Usure), on tente Rationner puis Réformes avant d'effondrer. Une action baisse
  // l'instabilité mais PAS l'usure → on ne tente que si ça peut réellement résoudre.
  if (ac.prepare && state.crisisLimitAnnounced) {
    const canAutoResolve = state.instability >= 1 && (state.timeWear || 0) < 1;
    const costs = crisisCosts();
    if (canAutoResolve && canPayCost(costs.rationing)) {
      runCrisisAction("rationing", { render: false, force: true });
      state.crisisOpenedAt = Date.now();
      if (!crisisOpen()) resumeAfterCrisisOutcome();
      return;
    }
    if (canAutoResolve && canPayCost(costs.reforms)) {
      runCrisisAction("reforms", { render: false, force: true });
      state.crisisOpenedAt = Date.now();
      if (!crisisOpen()) resumeAfterCrisisOutcome();
      return;
    }
  }

  const gain = ruinGain(projected).floor().max(0);
  if (D(gain).lte(0)) return; // cité trop jeune/petite : rien à récolter, on n'effondre pas à vide
  setCollapseInProgress(true);
  setGamePaused(true); // comme collapse() : geler l'UI pendant le deuil (sinon on peut sceller un pacte, M10)
  state.crisisOpenedAt = null;
  // « L'Édit s'applique » est écrite par runCollapseSequence APRÈS le point de
  // non-retour (crisis.js:510 de l'audit) — plus de ligne persistée avant le deuil.
  runCollapseSequence(gain, "auto_collapse").catch((err) => console.error("Séquence d'effondrement (Édit) interrompue :", err));
}

// ──────────────── Gestion de l'audio ─────────────────────────────────────────

let bgAudio = null;
let optMusic = true;
let optMusicActiveTabOnly = true;
let optMusicVolume = 1;
let musicRetryArmed = false;
// Le MORCEAU choisi (nom de son fichier, cf. audio/musiques.js) : null = le premier.
let optMusicTrack = null;
// Deux facteurs sur le volume réglé : le FONDU d'un changement de morceau et
// l'EFFACEMENT pendant la mélodie de la scène. Chacun glisse vers sa cible.
const musicGain = { fondu: 1, efface: 1 };
const musicRamps = { fondu: null, efface: null };
let musicDuckTimer = null;
// Échéance de l'effacement : la PLUS TARDIVE des demandes en cours (0 = aucune).
let musicDuckUntil = 0;

function applyMusicVolume() {
  if (bgAudio) bgAudio.volume = clamp(optMusicVolume * musicGain.fondu * musicGain.efface, 0, 1);
}

function rampMusic(key, to, ms, done) {
  clearInterval(musicRamps[key]);
  musicRamps[key] = null;
  const from = musicGain[key];
  if (!(ms > 0) || from === to) {
    musicGain[key] = to;
    applyMusicVolume();
    if (done) done();
    return;
  }
  const t0 = Date.now();
  musicRamps[key] = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    musicGain[key] = from + (to - from) * k;
    applyMusicVolume();
    if (k >= 1) {
      clearInterval(musicRamps[key]);
      musicRamps[key] = null;
      if (done) done();
    }
  }, 30);
}

function currentTrack() {
  return musiqueParId(optMusicTrack) || MUSIQUES[0] || null;
}

function retryMusicStart() {
  musicRetryArmed = false;
  document.removeEventListener("pointerdown", retryMusicStart, true);
  document.removeEventListener("keydown", retryMusicStart, true);
  playMusic();
}

function shouldPlayMusic() {
  return optMusic && (!optMusicActiveTabOnly || (typeof document !== 'undefined' && !document.hidden));
}

export function playMusic() {
  if (!bgAudio) return;
  if (!shouldPlayMusic()) return;
  bgAudio.play().catch(() => {
    if (musicRetryArmed) return;
    musicRetryArmed = true;
    document.addEventListener("pointerdown", retryMusicStart, true);
    document.addEventListener("keydown", retryMusicStart, true);
  });
}

export function pauseMusic() {
  if (bgAudio) bgAudio.pause();
}

let optNotif = true;

export function getNotifEnabled() {
  return optNotif;
}

export function setNotifEnabled(enabled) {
  optNotif = enabled;
  try {
    localStorage.setItem("civ-opt-notif", String(optNotif));
  } catch { /* Option persistence may be unavailable. */ }
  notify();
}

export function getMusicVolume() {
  return optMusicVolume;
}

export function getMusicEnabled() {
  return optMusic;
}

export function getMusicActiveTabOnly() {
  return optMusicActiveTabOnly;
}

// Les morceaux : tout fichier du dossier `src/assets/musiques/` (audio/musiques.js).
export function getMusicTracks() {
  return MUSIQUES;
}

export function getMusicTrack() {
  const t = currentTrack();
  return t ? t.id : null;
}

// Change de morceau : fondu de sortie, nouveau fichier, fondu d'entrée. Le choix est
// retenu comme les autres réglages de la musique.
export function setMusicTrack(id) {
  const t = musiqueParId(id);
  if (!t) return;
  optMusicTrack = t.id;
  try {
    localStorage.setItem("civ-opt-music-track", t.id);
  } catch { /* Option persistence may be unavailable. */ }
  notify();
  if (!bgAudio || bgAudio.dataset.track === t.id) return;
  const swap = () => {
    bgAudio.src = t.url;
    bgAudio.dataset.track = t.id;
    bgAudio.currentTime = 0;
    musicGain.fondu = 0;
    applyMusicVolume();
    if (shouldPlayMusic()) playMusic();
    rampMusic("fondu", 1, 700);
  };
  if (bgAudio.paused) swap();
  else rampMusic("fondu", 0, 450, swap);
}

export function stepMusicTrack(dir) {
  const n = MUSIQUES.length;
  if (n < 2) return;
  const i = Math.max(0, MUSIQUES.findIndex((m) => m.id === getMusicTrack()));
  setMusicTrack(MUSIQUES[(i + (dir < 0 ? n - 1 : 1)) % n].id);
}

// ── Les BRUITAGES (2026-10-03 : la machine à sous) — un réglage À PART de la musique :
// on peut couper l'une et garder l'autre. Joués par le code (audio/slotsSound.js).
let optSfx = true;
let optSfxVolume = 0.8;
export function getSfxEnabled() {
  return optSfx;
}
export function getSfxVolume() {
  return optSfxVolume;
}
export function setSfxEnabled(enabled) {
  optSfx = Boolean(enabled);
  try {
    localStorage.setItem("civ-opt-sfx", String(optSfx));
  } catch { /* Option persistence may be unavailable. */ }
}
export function setSfxVolume(vol) {
  optSfxVolume = clamp(vol, 0, 1);
  try {
    localStorage.setItem("civ-opt-sfx-volume", String(optSfxVolume));
  } catch { /* Option persistence may be unavailable. */ }
}

// La musique s'efface sous la mélodie de la scène, puis revient (audio/melodieScene.js).
// Un appel court qui suit un appel long ne raccourcit plus l'effacement : la
// roue des Plaisirs (~1,4 s) pendant la mélodie de la scène (~6 s) faisait
// remonter la musique par-dessus la mélodie encore en cours (audit 2026-10-05,
// BUG-84). La remontée part à l'échéance la plus tardive.
export function duckMusic(ms) {
  rampMusic("efface", 0.2, 250);
  musicDuckUntil = Math.max(musicDuckUntil, Date.now() + Math.max(0, ms));
  clearTimeout(musicDuckTimer);
  musicDuckTimer = setTimeout(() => {
    musicDuckUntil = 0;
    rampMusic("efface", 1, 1200);
  }, Math.max(0, musicDuckUntil - Date.now()));
}

export function setMusicVolume(vol) {
  optMusicVolume = clamp(vol, 0, 1);
  applyMusicVolume();
  try {
    localStorage.setItem("civ-opt-music-volume", String(optMusicVolume));
  } catch { /* Option persistence may be unavailable. */ }
}

export function setMusicEnabled(enabled) {
  optMusic = enabled;
  try {
    localStorage.setItem("civ-opt-music", String(optMusic));
  } catch { /* Option persistence may be unavailable. */ }
  if (optMusic) playMusic();
  else {
    pauseMusic();
    if (bgAudio) bgAudio.currentTime = 0;
  }
}

export function setMusicActiveTabOnly(enabled) {
  optMusicActiveTabOnly = enabled;
  try {
    localStorage.setItem("civ-opt-music-active-tab", String(optMusicActiveTabOnly));
  } catch { /* Option persistence may be unavailable. */ }
  syncMusicVisibility();
}

function syncMusicVisibility() {
  if (shouldPlayMusic()) playMusic();
  else if (optMusic && optMusicActiveTabOnly && bgAudio) bgAudio.pause();
}

export function initAudio() {
  if (typeof Audio === 'undefined') return; // Support Headless
  if (bgAudio) return; // Évite les double-init
  
  try {
    const savedNotif = localStorage.getItem("civ-opt-notif");
    if (savedNotif !== null) {
      optNotif = savedNotif !== "false";
    }

    const savedMusic = localStorage.getItem("civ-opt-music");
    if (savedMusic !== null) optMusic = savedMusic !== "false";
    
    const savedActiveTab = localStorage.getItem("civ-opt-music-active-tab");
    if (savedActiveTab !== null) optMusicActiveTabOnly = savedActiveTab !== "false";
    
    const savedVol = localStorage.getItem("civ-opt-music-volume");
    if (savedVol !== null) optMusicVolume = clamp(Number(savedVol), 0, 1);

    optMusicTrack = localStorage.getItem("civ-opt-music-track");

    const savedSfx = localStorage.getItem("civ-opt-sfx");
    if (savedSfx !== null) optSfx = savedSfx !== "false";
    const savedSfxVol = localStorage.getItem("civ-opt-sfx-volume");
    if (savedSfxVol !== null) optSfxVolume = clamp(Number(savedSfxVol), 0, 1);
  } catch { /* Option persistence may be unavailable. */ }

  // Le morceau vient du dossier des musiques (audio/musiques.js) : Vite en donne
  // l'adresse RELATIVE au document (base './'), ce qu'exige l'exe Electron.
  const track = currentTrack();
  if (!track) return;
  bgAudio = new Audio(track.url);
  bgAudio.dataset.track = track.id;
  bgAudio.loop = true;
  bgAudio.preload = "auto";
  applyMusicVolume();

  document.addEventListener("visibilitychange", syncMusicVisibility);
  
  if (optMusic) {
    playMusic();
  }
}

// ──────────────── Démarrage de la boucle de jeu ─────────────────────────────

// Sortie (F5, fermeture de la fenêtre) : dernière save, puis on VIDE le miroir
// nuage. Ce handler (posé dans l'effet App) tourne APRÈS le flush que
// cloudSave.js pose à l'import, lequel lisait donc le localStorage AVANT cette
// save() finale — le nuage ratait les dernières secondes (cloudSave.js:88 de
// l'audit). En re-mirrorant ici, la dernière save gagne.
// ⚠ flush, JAMAIS force : force passe outre la garde d'écriture, et un nuage
// redevenu lisible en cours de session (plus avancé que la partie jouée) était
// écrasé à chaque fermeture (audit 2026-10-05, SAV-2). force = import/emplacement.
// Exportée pour les tests.
export function saveOnExit() {
  save();
  cloudMirrorSave({ flush: true });
}

export function startGameLoop() {
  // Gardé (BUG-30) : une exception ici ne doit pas empêcher de poser la boucle.
  applyOfflineProgressSafely();
  // Un choix de Ruines actives interrompu par un reload (F5 / onglet fermé pendant
  // la modale) est rouvert ici — sinon le cycle tournait sans Ruines actives et
  // sans recours, rendant Antée inaccomplissable (M15).
  resumeActiveRuinsChoiceIfPending().catch((err) => console.error("Reprise du choix des Ruines actives :", err));
  const trackInteraction = () => registerOlympusInteraction();
  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", trackInteraction, { passive: true });
    window.addEventListener("keydown", trackInteraction);
  }
  
  const isTabHidden = () => typeof document !== "undefined" && document.hidden;
  // lastWall = horloge murale du dernier crédit. N'AVANCE QUE quand on crédite :
  // un tick 'skip' (onglet caché) le laisse figé, si bien que le premier tick
  // visible — ou le visibilitychange — crédite TOUTE l'absence, une seule fois.
  let lastWall = Date.now();
  const tickInterval = setInterval(() => {
    const nowWall = Date.now();
    const decision = decideTickCredit((nowWall - lastWall) / 1000, isTabHidden());
    renderCache.tickNow = nowWall; // horloge lue par les composants (pas de Date.now() en rendu)
    if (decision.mode === "rewind") {
      // Horloge système RECULÉE (SAV-12) : rien à créditer. L'ancre et toutes les
      // minuteries suivent le recul — sans ça, elles restaient figées « dans le
      // futur » pendant tout l'écart, et la remise à l'heure était créditée comme
      // une absence. Une simple AVANCE d'horloge reste, elle, une absence (veille).
      const shiftMs = nowWall - lastWall;
      rebaseWorldClock(shiftMs);
      state.lastTick = (state.lastTick || lastWall) + shiftMs;
      lastWall = nowWall;
      notify();
      return;
    }
    if (decision.mode === "skip") return; // caché : lastWall reste figé, le retour créditera
    lastWall = nowWall;
    if (decision.mode === "offline") {
      // Veille système / gel d'onglet VISIBLE : aucun visibilitychange n'est émis,
      // et le tick 'live' (borné au seuil) jetterait des heures. On route l'écart réel vers la
      // progression hors-ligne (elle recale state.lastTick elle-même).
      applyOfflineProgressSafely(decision.seconds);
      checkAutoCollapse();
      notify();
      return;
    }
    // Temps de jeu actif cumulé (jalon de merveille) — survit aux effondrements
    // mais REPART À 0 au Grand Reset. lifetimePlaySec, lui, est l'horloge À VIE
    // (registre de la Chronique) : elle ne se réinitialise jamais et horodate les
    // déblocages de GR et les accomplissements de Mythes de façon continue.
    state.playTimeSec = (state.playTimeSec || 0) + decision.seconds;
    if (state.chronicleStats) {
      state.chronicleStats.lifetimePlaySec = (state.chronicleStats.lifetimePlaySec || 0) + decision.seconds;
    }
    state.lastTick = nowWall; // ancre du hors-ligne : temps réellement crédité jusqu'ici
    tick(decision.seconds);
    checkAutoCollapse();
    notify(); // Notifie React du changement d'etat a chaque tick
  }, 1000);

  // Auto-save toutes les 10 secondes
  const saveInterval = setInterval(() => {
    save();
  }, 10000);

  // Sauvegarde rapide 2s après le lancement pour capturer la progression initiale
  const earlySaveTimeout = setTimeout(() => {
    save();
  }, 2000);

  // Sauvegarder quand l'onglet perd le focus (switch d'onglet, etc.) et créditer
  // la progression hors-ligne (prod + Usure, capées) quand il redevient visible
  // (le tick est throttlé par le navigateur en arrière-plan, d'où la perte de temps).
  const handleVisibilityChange = () => {
    if (document.hidden) {
      save();
    } else if (!collapseInProgress) {
      // Retour d'onglet : lastTick est resté figé au masquage (ticks cachés sautés
      // + save() ne le rafraîchit plus) → l'écart mesure vraiment toute l'absence.
      // Crise terminale comprise : applyOfflineProgress décide (farm ou clepsydre,
      // BUG-9) — elle ne doit plus manger l'absence en silence.
      // applyOfflineProgress crédite ET recale lastTick ; on recale aussi lastWall
      // pour que le prochain tick reparte d'un écart nul (pas de re-crédit).
      const elapsed = (Date.now() - state.lastTick) / 1000;
      if (elapsed > 60) {
        applyOfflineProgressSafely(elapsed);
        lastWall = Date.now();
      }
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Sauvegarder avant F5 / fermeture de l'onglet (saveOnExit, plus haut).
  const handleBeforeUnload = () => saveOnExit();
  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", trackInteraction);
      window.removeEventListener("keydown", trackInteraction);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }
    clearInterval(tickInterval);
    clearInterval(saveInterval);
    clearTimeout(earlySaveTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
