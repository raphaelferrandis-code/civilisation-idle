"use strict";

// Moteur d'AUTOMATISATION de la Maison (Phase 2, 2026-07-15) — un petit moteur
// PASSIF. Quand le joueur a débloqué et activé une automatisation, le tick joue
// À SA PLACE, aux CADRANS qu'il règle. Gouverné comme l'Intendance (tickSteward) :
//   - cooldown Date.now() par jeu (offline-safe : la sim monkeypatch Date.now) ;
//   - UNE partie par jeu et par tick (jamais de rafale) ;
//   - plancher = réserve de Faveur à NE PAS entamer (l'auto se met en veille dessous).
// Les automatisations :
//   - CAISSE (ex-tronc) : auto-relève quand elle frôle le plafond — ne crée rien,
//     évite le gaspillage (la caisse plafonne, cf. offeringTrunk) ;
//   - les JEUX : mise en FAVEUR, cotes fixes. L'auto joue À PERTE en espérance
//     (avantage de la maison) : un divertissement automatisé qui chasse les Vénus,
//     joue les vols offerts et nourrit la cagnotte — pas un revenu.
// Lot 1 des gains « vrai casino » (2026-10-04) : le cadran de mise est une PART DE
// LA LIMITE de la table (min, ¼, ½, max — cf. autoStake), qui grandit avec la ville.
//
// Les jeux sont appelés en HEADLESS (moteur pur, jamais la scène UI) :
//   - osselets : castAugury(id, rite, { stake, render:false, silent:true }) ;
//   - Icare : resolveIcarusHeadless(stake, cible) — même loi que le jeu
//     interactif, sans état de vol ni timer.

import { state, render, save, saveSoon, isNotifyPaused, isOfflineSim, defaultTempleAuto } from '../state.js';
import { regulationActionUnlocked } from '../mechanics.js';
import { castAugury, auguryPaytable, AUGURY_RITES } from './augures.js';
import { collectTrunk, trunkValue, trunkCap } from './offeringTrunk.js';
import { resolveIcarusHeadless, icarusEffectiveEdge, icarusUnlocked } from './icarus.js';
import { playScratch, scratchUnlocked, scratchRtpRef } from './scratch.js';
import { resolveBlackjackHeadless, blackjackUnlocked } from './blackjack.js';
import { buyFaveurItem, buyTempleArtifact, artifactCost } from './faveurShop.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { hasFreeFlight } from './templeFlights.js';
import { autoStake, recettesPerHour } from './maisonTable.js';
import { tickNuit } from './nuitGrandJeu.js';
import { ARTIFACT_LINEAGES, ARTIFACT_NODES } from '../../data/artifacts.js';
import { RANK_LABELS } from './maisonRang.js';
import { chronicle } from './utils.js';
import { tr } from '../i18n.js';
import { recordShopSpend } from '../chronicleStats.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import {
  AUTO_AUGURY_INTERVAL_MS,
  AUTO_ICARUS_INTERVAL_MS,
  AUTO_SCRATCH_INTERVAL_MS,
  AUTO_BLACKJACK_INTERVAL_MS,
  AUTO_TEMPO_MULT,
  AUTO_ICARUS_TARGET_MIN,
  AUTO_ICARUS_TARGET_MAX,
  AUTO_TEMPLE_FAVEUR_FLOOR_MAX,
  AUTO_STAKE_STEPS,
  AUTO_OSSELETS_UNLOCK_COST,
  AUTO_ICARUS_UNLOCK_COST,
  AUTO_TRUNK_UNLOCK_COST,
  AUTO_SCRATCH_UNLOCK_COST,
  AUTO_BLACKJACK_UNLOCK_COST,
  BLACKJACK_RTP_AUTO,
  OFFLINE_MAX_TEMPLE_PLAYS_PER_GAME,
  MAISON_RANKS,
  RANK_GIFT_AUTOS
} from '../balance.js';

// La table d'osselets fusionnée conserve cet id interne (cf. regulationActions).
const AUGURY_TABLE_ID = "prayForRain";

// Plafond du curseur de réserve : jamais sous l'ancien plafond fixe, et 24 h de
// recettes ensuite (la réserve doit pouvoir suivre une Maison qui grandit).
export function autoFloorMax() {
  return Math.max(AUTO_TEMPLE_FAVEUR_FLOOR_MAX, Math.round(recettesPerHour() * 24));
}

// Appelé à chaque tick (1 Hz) juste après tickSteward, sous les mêmes gardes
// (pause / effondrement / crise terminale). Ne fait rien tant qu'aucune
// automatisation n'est débloquée + activée.
// Quota de parties rejouées PENDANT UNE absence, compté PAR JEU. Un plafond
// global serait avalé en entier par le premier jeu de la liste, et les autres
// cadrans — payés eux aussi — ne tourneraient jamais. Remis à zéro au début de
// chaque simulation par resetOfflineTempleQuota().
let offlinePlays = {};
export function resetOfflineTempleQuota() { offlinePlays = {}; }
function offlineQuotaLeft(game) {
  if (!isOfflineSim()) return true;
  return (offlinePlays[game] || 0) < OFFLINE_MAX_TEMPLE_PLAYS_PER_GAME;
}
function countOfflinePlay(game) {
  if (isOfflineSim()) offlinePlays[game] = (offlinePlays[game] || 0) + 1;
}

// La mise d'une auto (cadran min/¼/½/max de la limite haute).
function autoStakeOf(g) {
  return autoStake(g && g.stakeStep);
}

// La réserve EFFECTIVE d'une auto : celle réglée, bornée par le maximum du curseur du
// moment. Les cadrans survivent au Grand Reset alors que l'ère record y retombe : une
// grosse réserve de fin de partie (1 000 000) endormait sinon les autos jusqu'à ce que
// le joueur retouche le curseur, devenu bien plus court.
function floorOf(g) {
  return Math.min(Math.max(0, (g && g.faveurFloor) || 0), autoFloorMax());
}

export function tickTempleAutomation() {
  // Hors ligne, la MÉCANIQUE tourne (c'est la promesse des cadrans qu'on a
  // payés) mais PLAFONNÉE par jeu, et sans le moindre retour visuel : les jeux
  // sont déjà appelés en headless, et la Chronique hors ligne est jetée par
  // simulateAwayCrises. Une pause de notification SANS simulation (cas futur)
  // continue, elle, de tout arrêter.
  if (isNotifyPaused() && !isOfflineSim()) return;
  announceMaisonRefund();
  // La Nuit du Grand Jeu s'ouvre à son heure (nuitGrandJeu.js), autos ou pas.
  tickNuit();
  const auto = state.templeAuto;
  if (!auto) return;
  const now = Date.now();
  let played = false;

  // ── CAISSE — auto-relève quand elle frôle le plafond (AVANT les jeux : la
  // relève peut financer la partie du même tick). Pas de cooldown : la condition
  // « quasi pleine » n'est vraie qu'une fois par remplissage (~30 min).
  const t = auto.tronc;
  if (t && t.on && t.unlocked) {
    const cap = trunkCap();
    if (trunkValue(now) >= cap - Math.max(1, cap * 0.02)) {
      if (collectTrunk({ render: false }) > 0) played = true;
    }
  }

  // ── OSSELETS — auto-lancé au rite choisi ──
  const o = auto.osselets;
  if (o && o.on && o.unlocked && offlineQuotaLeft("osselets") && now - (o.lastAt || 0) >= autoInterval("osselets")) {
    // Un rite gaté par artefact (le rite interdit) retombe sur le classique si
    // l'artefact manque (save trafiquée) : castAugury refuserait, ne pas bloquer.
    const riteId = riteAllowed(o.rite) ? o.rite : "classique";
    const stake = autoStakeOf(o);
    // Vraie RÉSERVE : jouer seulement si la Faveur reste au-dessus du plancher
    // APRÈS la mise.
    if ((state.faveur || 0) - stake >= floorOf(o)) {
      const res = castAugury(AUGURY_TABLE_ID, riteId, { stake, render: false, silent: true });
      // Cooldown consommé SEULEMENT si le jet a eu lieu (castAugury renvoie null
      // si verrouillé/impayable — ne pas brûler le cooldown sur un no-op).
      if (res) { o.lastAt = now; played = true; countOfflinePlay("osselets"); }
    }
  }

  // ── ICARE — autopush au multiplicateur cible ──
  const i = auto.icarus;
  if (i && i.on && i.unlocked && offlineQuotaLeft("icarus") && now - (i.lastAt || 0) >= autoInterval("icarus")) {
    // Un vol OFFERT en attente passe d'abord : coût nul → ignore le plancher.
    // Lecture SEULE ici : c'est resolveIcarusHeadless qui consomme.
    const free = hasFreeFlight();
    const stake = autoStakeOf(i);
    if (free || (state.faveur || 0) - stake >= floorOf(i)) {
      const target = Math.min(AUTO_ICARUS_TARGET_MAX, Math.max(AUTO_ICARUS_TARGET_MIN, i.target || 2));
      const res = resolveIcarusHeadless(stake, target, { free });
      if (res) { i.lastAt = now; played = true; countOfflinePlay("icarus"); }
    }
  }

  // ── GRATTEUX — un ticket à la mise choisie : zéro décision en cours de
  // partie, zéro rafle. Le vol offert de Vénus s'accumule dans la file, l'auto-Icare
  // ou la main le joueront.
  const g = auto.gratteux;
  if (g && g.on && g.unlocked && offlineQuotaLeft("gratteux") && now - (g.lastAt || 0) >= autoInterval("gratteux")) {
    const stake = autoStakeOf(g);
    if ((state.faveur || 0) - stake >= floorOf(g)) {
      const res = playScratch(stake, { render: false, silent: true });
      if (res) { g.lastAt = now; played = true; countOfflinePlay("gratteux"); }
    }
  }

  // ── VINGT-ET-UN — une main à la stratégie de base avec le double, jamais la
  // refente (le levier de skill reste à la main), ni série ni historique. Le double
  // engage une seconde mise : il ne se joue que si la réserve tient encore après.
  const v = auto.vingtetun;
  if (v && v.on && v.unlocked && offlineQuotaLeft("vingtetun") && now - (v.lastAt || 0) >= autoInterval("vingtetun")) {
    const stake = autoStakeOf(v);
    if ((state.faveur || 0) - stake >= floorOf(v)) {
      const res = resolveBlackjackHeadless(stake, { floor: floorOf(v) });
      if (res) { v.lastAt = now; played = true; countOfflinePlay("vingtetun"); }
    }
  }

  // Hors ligne, un render par tick figerait le boot : la simulation re-rend une
  // seule fois à la fin, c'est tout l'objet de notifyPaused.
  if (played && !isNotifyPaused()) render();
}

// Le remboursement des achats supprimés au lot 1 (migration 4 → 5 de state.js) est
// annoncé UNE fois, au premier tick en ligne : la migration court avant que l'état
// n'existe, elle ne peut ni chroniquer ni afficher.
function announceMaisonRefund() {
  if (isOfflineSim()) return;
  const refund = state.maisonRefund || 0;
  const gifts = state.maisonGiftRefund || 0;
  if (refund <= 0 && gifts <= 0) return;
  if (refund > 0) {
    state.maisonRefund = 0;
    chronicle(tr({
      fr: `La Maison des Plaisirs change ses règles : les chances ne s'achètent plus. Elle rend ${Math.round(refund).toLocaleString("fr-FR")} faveur dépensée en dés pipés, ailes cirées, planches et coffres.`,
      en: `The House of Pleasures changes its rules: luck can no longer be bought. It refunds ${Math.round(refund).toLocaleString("en-US")} favor spent on loaded dice, waxed wings, boards and chests.`
    }));
  }
  // Lot 2 (migration 5 → 6) : les cadeaux de rang qu'on avait achetés restent à soi.
  if (gifts > 0) {
    state.maisonGiftRefund = 0;
    chronicle(tr({
      fr: `La Maison des Plaisirs récompense désormais ses habitués : ce qu'elle offre à ses titres ne se vend plus. Tu gardes ce que tu avais acheté, et elle te rend ${Math.round(gifts).toLocaleString("fr-FR")} faveur.`,
      en: `The House of Pleasures now rewards its regulars: what it gives its titles is no longer for sale. You keep what you had bought, and it refunds you ${Math.round(gifts).toLocaleString("en-US")} favor.`
    }));
  }
  pushOutcomeFloat({
    label: tr({
      fr: `🏺 +${Math.round(refund + gifts).toLocaleString("fr-FR")} faveur rendue`,
      en: `🏺 +${Math.round(refund + gifts).toLocaleString("en-US")} favor refunded`
    }),
    kind: "gain"
  });
  saveSoon();
}

// Intervalle EFFECTIF d'une auto : la base du jeu × le tempo choisi (recueilli
// ×2, mesuré ×1, fervent ×0.5). Le tempo ne change rien à l'espérance par
// partie : c'est le cadran « temps » de l'arbitrage gain/temps/risque.
const AUTO_BASE_INTERVALS = {
  osselets: AUTO_AUGURY_INTERVAL_MS,
  icarus: AUTO_ICARUS_INTERVAL_MS,
  gratteux: AUTO_SCRATCH_INTERVAL_MS,
  vingtetun: AUTO_BLACKJACK_INTERVAL_MS
};
function autoInterval(game) {
  const g = state.templeAuto && state.templeAuto[game];
  const mult = AUTO_TEMPO_MULT[g && g.tempo] ?? 1;
  return (AUTO_BASE_INTERVALS[game] || 10_000) * mult;
}

// Le rite demandé est-il jouable (artefact possédé pour un rite gaté) ?
function riteAllowed(riteId) {
  const rite = AUGURY_RITES[riteId];
  if (!rite) return false;
  return !rite.artifact || hasTempleArtifact(rite.artifact);
}

// ── Écriture des réglages depuis l'UI (tableau de bord) ──────────────────────
// Aucune mutation directe de state.templeAuto côté composant : on passe par ce
// setter (validation/bornage calqués sur normalizeTempleAuto) puis save+render,
// exactement comme setStewardClause pour l'Intendance.
const VALID_RITES = Object.keys(AUGURY_RITES);
const VALID_STAKE_STEPS = Object.keys(AUTO_STAKE_STEPS);
const AUTO_GAMES = ["osselets", "icarus", "gratteux", "vingtetun", "tronc"];
const VALID_TEMPOS = Object.keys(AUTO_TEMPO_MULT);

export function setTempleAuto(game, patch) {
  if (!AUTO_GAMES.includes(game)) return;
  if (!state.templeAuto) state.templeAuto = defaultTempleAuto();
  const g = state.templeAuto[game];
  const p = (patch && typeof patch === "object") ? patch : {};
  if ("on" in p) g.on = Boolean(p.on);
  if (game !== "tronc" && "faveurFloor" in p) {
    g.faveurFloor = Math.round(Math.max(0, Math.min(autoFloorMax(), Number(p.faveurFloor) || 0)));
  }
  if (game !== "tronc" && typeof p.tempo === "string" && VALID_TEMPOS.includes(p.tempo)) {
    g.tempo = p.tempo;
  }
  // Le cadran de mise : une part de la limite haute de la table.
  if (game !== "tronc" && typeof p.stakeStep === "string" && VALID_STAKE_STEPS.includes(p.stakeStep)) {
    g.stakeStep = p.stakeStep;
  }
  if (game === "osselets" && typeof p.rite === "string" && VALID_RITES.includes(p.rite)) {
    g.rite = p.rite;
  }
  if (game === "icarus" && "target" in p) {
    g.target = Math.max(AUTO_ICARUS_TARGET_MIN, Math.min(AUTO_ICARUS_TARGET_MAX, Number(p.target) || AUTO_ICARUS_TARGET_MIN));
  }
  // saveSoon : le curseur « Cible » et le plancher de Faveur appellent ce verbe
  // à CHAQUE pas du geste — une save() pleine par événement d'input sérialisait
  // tout l'état des dizaines de fois par glissement (audit A.8).
  saveSoon();
  render();
}

// Déblocage d'une automatisation contre de la FAVEUR (Phase 3 — la Phase 4
// intégrera ça à l'arbre d'artefacts). Payer débloque ET active d'emblée.
const AUTO_UNLOCK_COSTS = {
  tronc: AUTO_TRUNK_UNLOCK_COST,
  osselets: AUTO_OSSELETS_UNLOCK_COST,
  icarus: AUTO_ICARUS_UNLOCK_COST,
  gratteux: AUTO_SCRATCH_UNLOCK_COST,
  vingtetun: AUTO_BLACKJACK_UNLOCK_COST
};

// Le jeu de l'auto est-il jouable (ère atteinte) ? On ne vend pas un moteur qui
// produit 0 : Icare et le vingt-et-un à l'Ère III, le reste à l'Ère II.
function autoGamePlayable(game) {
  if (game === "icarus") return icarusUnlocked();
  if (game === "vingtetun") return blackjackUnlocked();
  if (game === "gratteux") return scratchUnlocked();
  return regulationActionUnlocked(AUGURY_TABLE_ID);
}

const AUTO_LABELS = {
  osselets: {
    verbe: { fr: "l'auto-lancé des osselets", en: "the knucklebones auto-cast" },
    court: { fr: "Osselets auto", en: "Auto knucklebones" }
  },
  tronc: {
    verbe: { fr: "l'auto-relève de la caisse", en: "the till auto-collect" },
    court: { fr: "Caisse auto", en: "Auto till" }
  },
  icarus: {
    verbe: { fr: "l'autopush d'Icare", en: "Icarus's autopush" },
    court: { fr: "Icare auto", en: "Auto Icarus" }
  },
  gratteux: {
    verbe: { fr: "l'auto-gratteux", en: "the auto-scratch" },
    court: { fr: "Gratteux auto", en: "Auto-scratch" }
  },
  vingtetun: {
    verbe: { fr: "l'auto-vingt-et-un", en: "the auto twenty-one" },
    court: { fr: "Vingt-et-un auto", en: "Auto twenty-one" }
  }
};

// Lot 2 : les automatisations des QUATRE JEUX sont des cadeaux de rang (maisonRang.js),
// elles ne s'achètent plus ; seule la sébile du tronc (la caisse) reste à vendre.
const GIFTED_AUTO_GAMES = new Set(Object.values(RANK_GIFT_AUTOS));
export function unlockTempleAuto(game) {
  if (!(game in AUTO_UNLOCK_COSTS)) return false;
  if (GIFTED_AUTO_GAMES.has(game)) return false;
  if (!state.templeAuto) state.templeAuto = defaultTempleAuto();
  const g = state.templeAuto[game];
  if (g.unlocked) return false;
  if (!autoGamePlayable(game)) return false;
  const cost = AUTO_UNLOCK_COSTS[game];
  if ((state.faveur || 0) < cost) return false;
  state.faveur = Math.max(0, (state.faveur || 0) - cost);
  // Registre de la Chronique : même déclaration que les deux autres kinds de
  // l'arbre d'artefacts (faveurShop.js) — sans elle, les cinq capstones
  // manquaient au compteur de dépenses à vie.
  recordShopSpend(cost);
  g.unlocked = true;
  g.on = true;
  const label = AUTO_LABELS[game];
  chronicle(game === "tronc"
    ? tr({
        fr: `La Maison prend vie : ${label.verbe.fr} tourne désormais tout seul.`,
        en: `The House comes alive: ${label.verbe.en} now runs on its own.`
      })
    : tr({
        fr: `La Maison prend vie : ${label.verbe.fr} tourne désormais tout seul, aux cadrans que tu règles.`,
        en: `The House comes alive: ${label.verbe.en} now runs on its own, on the dials you set.`
      }));
  pushOutcomeFloat({ label: `⚙️ ${tr(label.court)}`, kind: "gain" });
  save();
  render();
  return true;
}

// Coût de déblocage par jeu (pour l'UI).
export function templeAutoUnlockCost(game) {
  return AUTO_UNLOCK_COSTS[game] ?? AUTO_ICARUS_UNLOCK_COST;
}

// Débit ✦/min ESTIMÉ (espérance) d'une automatisation, aux réglages courants.
// Renvoie 0 si l'auto est À L'ARRÊT ou si le jeu n'est pas encore jouable (l'ère
// requise) — le badge reflète alors la production RÉELLE (nulle). La cadence est
// une BORNE HAUTE (le plancher peut la réduire). Les cotes étant fixes et sous
// 100 %, le débit des JEUX est NÉGATIF : l'estimation est honnête — l'auto-jeu
// consomme de la Faveur en espérance. Seule la caisse rapporte.
export function templeAutoThroughput(game) {
  const auto = state.templeAuto;
  if (!auto) return 0;
  const g = auto[game];
  if (!g || !g.on) return 0; // à l'arrêt → aucune production réelle
  if (game === "tronc") {
    if (!regulationActionUnlocked(AUGURY_TABLE_ID)) return 0; // Ère II requise
    return recettesPerHour() / 60; // les recettes, sans plus jamais déborder
  }
  if (!autoGamePlayable(game)) return 0; // l'ère du jeu n'est pas atteinte
  const perMin = 60000 / autoInterval(game); // le tempo entre dans la cadence
  const stake = autoStakeOf(g);             // la part de la limite entre dans la mise
  if (game === "osselets") {
    const riteId = riteAllowed(g.rite) ? g.rite : "classique";
    const pay = auguryPaytable(AUGURY_TABLE_ID, riteId);
    return (pay.rtp - 1) * stake * perMin;
  }
  if (game === "icarus") {
    const T = Math.min(AUTO_ICARUS_TARGET_MAX, Math.max(AUTO_ICARUS_TARGET_MIN, g.target || 2));
    const Tr = Math.floor(T * 100) / 100;
    const pWin = Math.min(1, (1 - icarusEffectiveEdge()) / T);
    // EV NETTE = payout espéré − mise. Espérance EXACTE : le payout passe par payRound
    // (E = x). La consolation des plumes N'EST PAS comptée : elle sort de la cagnotte,
    // que seul l'avantage des tables remplit — la compter comme un gain affichait un
    // débit POSITIF (jusqu'à +200/min avec le souffle), ce que le jeu ne rend jamais.
    const evPerGame = pWin * stake * Tr - stake;
    return evPerGame * perMin;
  }
  if (game === "gratteux") {
    return (scratchRtpRef() - 1) * stake * perMin;
  }
  if (game === "vingtetun") {
    // L'auto joue la base AVEC le double, SANS refente : BLACKJACK_RTP_AUTO, mesuré
    // sur ce chemin exact (sous 1 : le badge est négatif, et c'est honnête).
    return (BLACKJACK_RTP_AUTO - 1) * stake * perMin;
  }
  return 0;
}

// ── L'ARBRE D'ARTEFACTS (Phase 4) — dispatcher d'achat + descripteur UI ──────
// Deux lignées en ÉCHELLE : le rang N n'est achetable que si le rang N-1 est
// ACQUIS (le rang 1 exige l'ère du jeu). Trois kinds routés vers leur achat :
// level → buyFaveurItem (stylet), artifact → buyTempleArtifact (booléen),
// automation → unlockTempleAuto (capstone). Tout reste DÉCOUPLÉ de la Rupture.

function lineageEraOk(lineageId) {
  if (lineageId === "osselets") return regulationActionUnlocked(AUGURY_TABLE_ID);
  if (lineageId === "icarus") return icarusUnlocked();
  if (lineageId === "gratteux") return scratchUnlocked();
  if (lineageId === "vingtetun") return blackjackUnlocked();
  // Le Trésor (les reliques) ouvre avec les tables de l'Ère III : il
  // n'a de sens que quand les quatre jeux tournent.
  if (lineageId === "tresor") return icarusUnlocked();
  return false;
}

function nodeAcquired(node) {
  if (node.kind === "level") return (state[node.levelField] || 0) >= 1;
  if (node.kind === "artifact") return hasTempleArtifact(node.id);
  if (node.kind === "automation") {
    return Boolean(state.templeAuto && state.templeAuto[node.game] && state.templeAuto[node.game].unlocked);
  }
  return false;
}

// Le nœud ACHETABLE qui précède dans la lignée (les cadeaux de rang ne comptent pas
// dans l'échelle : on les reçoit, on ne les gravit pas). null pour le premier.
function previousBuyable(lin, idx) {
  for (let j = idx - 1; j >= 0; j -= 1) if (lin.nodes[j].gift == null) return lin.nodes[j];
  return null;
}

function nodeUnlocked(node) {
  const lin = ARTIFACT_LINEAGES.find((l) => l.id === node.lineage);
  if (!lin) return false;
  if (node.gift != null) return false; // cadeau de rang : jamais à vendre
  // Garde d'ère pour TOUT rang, pas seulement le premier : après un Grand Reset,
  // les artefacts/niveaux persistent (éternels) mais l'ère retombe à 0. Sans ce
  // filtre, un rang N>1 paraîtrait déverrouillé (rang N-1 persisté) alors que
  // l'action terminale (unlockTempleAuto) refuse sur sa propre garde d'ère →
  // descripteur et achat resteraient désynchronisés tant que l'ère n'est pas
  // re-atteinte. On aligne la garde d'échelle sur la garde d'ère.
  if (!lineageEraOk(node.lineage)) return false;
  const idx = lin.nodes.findIndex((n) => n.id === node.id);
  const prev = previousBuyable(lin, idx);
  if (!prev) return true; // premier achat de la lignée : l'ère suffit
  return nodeAcquired({ ...prev, lineage: lin.id });
}

// Achat d'un nœud de l'arbre : garde d'échelle (rang précédent acquis) + routage.
export function buyArtifactNode(id) {
  const node = ARTIFACT_NODES[id];
  if (!node) return false;
  if (!nodeUnlocked(node)) return false;
  if (node.kind === "level") return buyFaveurItem(id);
  if (node.kind === "automation") return unlockTempleAuto(node.game);
  if (node.kind === "artifact") return buyTempleArtifact(id);
  return false;
}

// Descripteur de l'arbre pour l'UI : par lignée, l'état de chaque rang
// (acquis/niveau/coût/achetable/raison de verrou).
export function artifactTree() {
  const faveur = state.faveur || 0;
  return ARTIFACT_LINEAGES.map((lin) => {
    const eraOk = lineageEraOk(lin.id);
    const nodes = lin.nodes.map((node, idx) => {
      const withLin = { ...node, lineage: lin.id };
      // Cadeau de rang (lot 2) : ni prix ni achat, le titre qui l'offre.
      if (node.gift != null) {
        const owned = nodeAcquired(withLin);
        const rk = MAISON_RANKS[node.gift];
        return {
          id: node.id, kind: node.kind, label: node.label, desc: node.desc,
          level: null, maxLevel: null, owned, maxed: owned, cost: null, canAfford: false, buyable: false,
          unlocked: false, lockedReason: owned ? "owned" : "gift",
          gift: node.gift, giftLabel: rk ? RANK_LABELS[rk.id] : null
        };
      }
      // Miroir de nodeUnlocked : l'ère de la lignée conditionne TOUT rang (les
      // rangs persistés après un GR ne rouvrent pas la voie tant que l'ère n'est
      // pas re-atteinte) → descripteur cohérent avec buyArtifactNode. L'échelle saute
      // les cadeaux de rang.
      const prev = previousBuyable(lin, idx);
      const unlocked = eraOk && (prev ? nodeAcquired({ ...prev, lineage: lin.id }) : true);
      let level = null, maxLevel = null, cost, maxed, owned;
      if (node.kind === "level") {
        level = state[node.levelField] || 0;
        maxLevel = node.maxLevel;
        maxed = level >= maxLevel;
        owned = level >= 1;
        cost = maxed ? null : Math.round(node.costBase * Math.pow(node.costGrowth, level));
      } else {
        owned = nodeAcquired(withLin);
        maxed = owned;
        cost = owned ? null : artifactCost(node);
      }
      const canAfford = cost != null && faveur >= cost;
      const buyable = unlocked && !maxed && canAfford;
      const lockedReason = !unlocked ? "prereq" : (maxed ? "owned" : (!canAfford ? "faveur" : null));
      return {
        id: node.id, kind: node.kind, label: node.label, desc: node.desc,
        level, maxLevel, owned, maxed, cost, canAfford, buyable, unlocked, lockedReason
      };
    });
    return { id: lin.id, icon: lin.icon, label: lin.label, subtitle: lin.subtitle, eraOk, nodes };
  });
}
