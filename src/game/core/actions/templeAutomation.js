"use strict";

// Moteur d'AUTOMATISATION du Temple (Phase 2, 2026-07-15) — un petit moteur
// PASSIF. Quand le joueur a débloqué et activé une automatisation, le tick joue
// À SA PLACE, aux CADRANS qu'il règle. Gouverné comme l'Intendance (tickSteward) :
//   - cooldown Date.now() par jeu (offline-safe : la sim monkeypatch Date.now) ;
//   - UNE partie par jeu et par tick (jamais de rafale) ;
//   - plancher = réserve à NE PAS entamer (l'auto se met en veille dessous).
// Trois automatisations, TOUTES en monnaie fermée (2026-07-16) :
//   - TRONC : auto-relève des offrandes quand elles frôlent le plafond —
//     ne crée rien, évite le gaspillage (le tronc plafonne, cf. offeringTrunk) ;
//   - OSSELETS et ICARE : mise en FAVEUR, plancher de Faveur. L'auto joue À
//     PERTE en espérance (edge maison) : un divertissement automatisé qui
//     chasse les Vénus / joue les vols offerts et nourrit la cagnotte — pas un
//     revenu.
// ONLINE pour l'instant : early-return si isNotifyPaused() (offline/sim). Un
// crédit offline serait un hook dédié dans applyOfflineProgress — le TRONC,
// lui, est déjà offline-safe par construction (calcul à la volée).
//
// Les jeux sont appelés en HEADLESS (moteur pur, jamais la scène UI) :
//   - osselets : castAugury(id, rite, { render:false, silent:true }) — débite
//     la mise et crédite le gain synchro, sans float ni scène ;
//   - Icare : resolveIcarusHeadless(stakeId, cible) — même loi que le jeu
//     interactif, sans état de vol ni timer.

import { state, render, save, saveSoon, isNotifyPaused, isOfflineSim, defaultTempleAuto } from '../state.js';
import { regulationActionUnlocked } from '../mechanics.js';
import { castAugury, auguryStake, auguryPaytable, AUGURY_RITES } from './augures.js';
import { collectTrunk, trunkValue } from './offeringTrunk.js';
import { resolveIcarusHeadless, icarusStakes, icarusEffectiveEdge, icarusUnlocked, icarusCrashConsolation } from './icarus.js';
import { playScratch, scratchUnlocked, scratchRtpRef } from './scratch.js';
import { resolveBlackjackHeadless, blackjackUnlocked } from './blackjack.js';
import { buyFaveurItem, buyTempleArtifact } from './faveurShop.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { hasFreeFlight } from './templeFlights.js';
import { clampStakeMult } from './templePot.js';
import { ARTIFACT_LINEAGES, ARTIFACT_NODES } from '../../data/artifacts.js';
import { chronicle } from './utils.js';
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
  AUTO_OSSELETS_UNLOCK_COST,
  AUTO_ICARUS_UNLOCK_COST,
  AUTO_TRUNK_UNLOCK_COST,
  AUTO_SCRATCH_UNLOCK_COST,
  AUTO_BLACKJACK_UNLOCK_COST,
  TRUNK_CAP,
  TRUNK_RATE_PER_S,
  ICARUS_STAKES,
  SCRATCH_STAKES,
  BLACKJACK_STAKES,
  BLACKJACK_RTP_AUTO,
  OFFLINE_MAX_TEMPLE_PLAYS_PER_GAME
} from '../balance.js';

// La table d'osselets fusionnée conserve cet id interne (cf. regulationActions).
const AUGURY_TABLE_ID = "prayForRain";

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

export function tickTempleAutomation() {
  // Hors ligne, la MÉCANIQUE tourne (c'est la promesse des cadrans qu'on a
  // payés) mais PLAFONNÉE par jeu, et sans le moindre retour visuel : les jeux
  // sont déjà appelés en headless, et la Chronique hors ligne est jetée par
  // simulateAwayCrises. Une pause de notification SANS simulation (cas futur)
  // continue, elle, de tout arrêter.
  if (isNotifyPaused() && !isOfflineSim()) return;
  const auto = state.templeAuto;
  if (!auto) return;
  const now = Date.now();
  let played = false;

  // ── TRONC — auto-relève quand il frôle le plafond (AVANT les osselets : la
  // relève peut financer le jet du même tick). Pas de cooldown : la condition
  // « quasi plein » n'est vraie qu'une fois par ~remplissage (~29 min).
  const t = auto.tronc;
  if (t && t.on && t.unlocked && trunkValue(now) >= TRUNK_CAP - 1) {
    if (collectTrunk({ render: false }) > 0) played = true;
  }

  // ── OSSELETS — auto-lancé au rite choisi, mise en FAVEUR ──
  const o = auto.osselets;
  if (o && o.on && o.unlocked && offlineQuotaLeft("osselets") && now - (o.lastAt || 0) >= autoInterval("osselets")) {
    // Un rite gaté par artefact (le rite interdit) retombe sur le classique si
    // l'artefact manque (save trafiquée) : castAugury refuserait, ne pas bloquer.
    const riteId = riteAllowed(o.rite) ? o.rite : "classique";
    const mult = autoStakeMult(o);
    const stake = auguryStake(AUGURY_TABLE_ID, riteId).stake * mult;
    // Vraie RÉSERVE : jouer seulement si la Faveur reste au-dessus du plancher
    // APRÈS la mise (mise du coffre comprise).
    if ((state.faveur || 0) - stake >= (o.faveurFloor || 0)) {
      const res = castAugury(AUGURY_TABLE_ID, riteId, { render: false, silent: true, stakeMult: mult });
      // Cooldown consommé SEULEMENT si le jet a eu lieu (castAugury renvoie null
      // si verrouillé/impayable — ne pas brûler le cooldown sur un no-op).
      if (res) { o.lastAt = now; played = true; countOfflinePlay("osselets"); }
    }
  }

  // ── ICARE — autopush au multiplicateur cible, mise en FAVEUR ──
  const i = auto.icarus;
  if (i && i.on && i.unlocked && offlineQuotaLeft("icarus") && now - (i.lastAt || 0) >= autoInterval("icarus")) {
    const stakeId = i.stakeId || "plume";
    const mult = autoStakeMult(i);
    // Vol OFFERT à CETTE mise (au coffre ×1 seulement) : coût nul → ignore le
    // plancher ; sinon vraie réserve de Faveur préservée APRÈS la mise. Lecture
    // SEULE ici : c'est resolveIcarusHeadless qui consomme.
    const freeFlight = mult === 1 && hasFreeFlight(stakeId);
    const found = icarusStakes().find((s) => s.id === stakeId);
    if (freeFlight || (found && (state.faveur || 0) - found.faveur * mult >= (i.faveurFloor || 0))) {
      const target = Math.min(AUTO_ICARUS_TARGET_MAX, Math.max(AUTO_ICARUS_TARGET_MIN, i.target || 2));
      const res = resolveIcarusHeadless(stakeId, target, { stakeMult: mult });
      if (res) { i.lastAt = now; played = true; countOfflinePlay("icarus"); }
    }
  }

  // ── GRATTEUX — un ticket à la mise choisie (capstone 2026-07-17). Depuis que
  // le Soleil ne rafle plus, c'est le seul jeu automatisable sans rien détruire :
  // zéro décision en cours de partie, zéro rafle. Le billet du Soleil (vol offert)
  // s'accumule dans la file, l'auto-Icare ou la main le joueront.
  const g = auto.gratteux;
  if (g && g.on && g.unlocked && offlineQuotaLeft("gratteux") && now - (g.lastAt || 0) >= autoInterval("gratteux")) {
    const found = SCRATCH_STAKES.find((s) => s.id === (g.stakeId || "obole")) || SCRATCH_STAKES[0];
    const mult = autoStakeMult(g);
    if ((state.faveur || 0) - found.faveur * mult >= (g.faveurFloor || 0)) {
      const res = playScratch(found.id, { render: false, silent: true, stakeMult: mult });
      if (res) { g.lastAt = now; played = true; countOfflinePlay("gratteux"); }
    }
  }

  // ── VINGT-ET-UN — une main à la stratégie de base (capstone 2026-07-17).
  // L'auto joue hit/stand (basicAction), JAMAIS le double ni la refente (les
  // leviers de skill restent à la main), ni série ni historique.
  const v = auto.vingtetun;
  if (v && v.on && v.unlocked && offlineQuotaLeft("vingtetun") && now - (v.lastAt || 0) >= autoInterval("vingtetun")) {
    const found = BLACKJACK_STAKES.find((s) => s.id === (v.stakeId || "legere")) || BLACKJACK_STAKES[0];
    const mult = autoStakeMult(v);
    if ((state.faveur || 0) - found.faveur * mult >= (v.faveurFloor || 0)) {
      const res = resolveBlackjackHeadless(found.id, { stakeMult: mult });
      if (res) { v.lastAt = now; played = true; countOfflinePlay("vingtetun"); }
    }
  }

  // Hors ligne, un render par tick figerait le boot : la simulation re-rend une
  // seule fois à la fin, c'est tout l'objet de notifyPaused.
  if (played && !isNotifyPaused()) render();
}

// Multiplicateur de mise d'une auto : 10^stakePow, re-clampé au rang de coffre
// POSSÉDÉ (le cadran a pu être réglé avant un Grand Reset qui garde le réglage).
function autoStakeMult(g) {
  return clampStakeMult(10 ** Math.max(0, g.stakePow || 0));
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
const VALID_STAKES_BY_GAME = {
  icarus: ICARUS_STAKES.map((s) => s.id),
  gratteux: SCRATCH_STAKES.map((s) => s.id),
  vingtetun: BLACKJACK_STAKES.map((s) => s.id)
};
const AUTO_GAMES = ["osselets", "icarus", "gratteux", "vingtetun", "tronc"];
const VALID_TEMPOS = Object.keys(AUTO_TEMPO_MULT);

export function setTempleAuto(game, patch) {
  if (!AUTO_GAMES.includes(game)) return;
  if (!state.templeAuto) state.templeAuto = defaultTempleAuto();
  const g = state.templeAuto[game];
  const p = (patch && typeof patch === "object") ? patch : {};
  if ("on" in p) g.on = Boolean(p.on);
  if (game !== "tronc" && "faveurFloor" in p) {
    g.faveurFloor = Math.round(Math.max(0, Math.min(AUTO_TEMPLE_FAVEUR_FLOOR_MAX, Number(p.faveurFloor) || 0)));
  }
  if (game !== "tronc" && typeof p.tempo === "string" && VALID_TEMPOS.includes(p.tempo)) {
    g.tempo = p.tempo;
  }
  // Le cadran de coffre : la PUISSANCE de mise de l'auto (mise × 10^stakePow),
  // bornée au rang de coffre possédé — re-clampée au tick par clampStakeMult.
  if (game !== "tronc" && "stakePow" in p) {
    g.stakePow = Math.round(Math.max(0, Math.min(state.coffreLevel || 0, Number(p.stakePow) || 0)));
  }
  if (game === "osselets" && typeof p.rite === "string" && VALID_RITES.includes(p.rite)) {
    g.rite = p.rite;
  }
  if (game in VALID_STAKES_BY_GAME && typeof p.stakeId === "string" && VALID_STAKES_BY_GAME[game].includes(p.stakeId)) {
    g.stakeId = p.stakeId;
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
  osselets: { verbe: "l'auto-lancé des osselets", court: "Osselets auto" },
  tronc: { verbe: "l'auto-relève des offrandes", court: "Offrandes auto" },
  icarus: { verbe: "l'autopush d'Icare", court: "Icare auto" },
  gratteux: { verbe: "l'auto-gratteux", court: "Gratteux auto" },
  vingtetun: { verbe: "l'auto-vingt-et-un", court: "Vingt-et-un auto" }
};

export function unlockTempleAuto(game) {
  if (!(game in AUTO_UNLOCK_COSTS)) return false;
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
  chronicle(`Le temple prend vie : ${label.verbe} tourne désormais tout seul${game === "tronc" ? "" : ", aux cadrans que tu règles"}.`);
  pushOutcomeFloat({ label: `⚙️ ${label.court}`, kind: "gain" });
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
// une BORNE HAUTE (le plancher peut la réduire). Depuis la monnaie fermée, le
// débit des OSSELETS et du VINGT-ET-UN est NÉGATIF (edge maison) : l'estimation
// est honnête — l'auto-jeu consomme de la Faveur en espérance. Le rabais Clémence est ignoré
// (il ne change pas le RTP, seulement l'échelle des mises en série noire).
export function templeAutoThroughput(game) {
  const auto = state.templeAuto;
  if (!auto) return 0;
  const g = auto[game];
  if (!g || !g.on) return 0; // à l'arrêt → aucune production réelle
  if (game === "tronc") {
    if (!regulationActionUnlocked(AUGURY_TABLE_ID)) return 0; // Ère II requise
    return TRUNK_RATE_PER_S * 60; // le goutte-à-goutte, sans plus jamais déborder
  }
  if (!autoGamePlayable(game)) return 0; // l'ère du jeu n'est pas atteinte
  const perMin = 60000 / autoInterval(game); // le tempo entre dans la cadence
  const mult = autoStakeMult(g);            // le coffre entre dans la mise
  if (game === "osselets") {
    const riteId = riteAllowed(g.rite) ? g.rite : "classique";
    const pay = auguryPaytable(AUGURY_TABLE_ID, riteId);
    // Aux dés 11+ (la bascule), rtp > 1 : le badge devient POSITIF — le débit
    // de l'imprimante, borné par cadence × mise × marge (garde A14 du banc).
    const evPerGame = (pay.rtp - 1) * pay.stake * mult;
    return evPerGame * perMin;
  }
  if (game === "icarus") {
    const T = Math.min(AUTO_ICARUS_TARGET_MAX, Math.max(AUTO_ICARUS_TARGET_MIN, g.target || 2));
    const Tr = Math.floor(T * 100) / 100;
    const pWin = Math.min(1, (1 - icarusEffectiveEdge()) / T);
    const stake = ICARUS_STAKES.find((s) => s.id === (g.stakeId || "plume")) || ICARUS_STAKES[0];
    const stakeF = stake.faveur * mult;
    // EV NETTE = payout espéré + consolation (plumes, bornée par la cella) − mise.
    // Espérance EXACTE : le payout passe par payRound (E = x). Positive aux
    // ailes 7-8 (edge négatif : la bascule d'Icare).
    const win = stakeF * Tr;
    const loss = icarusCrashConsolation(stakeF);
    const evPerGame = pWin * win + (1 - pWin) * loss - stakeF;
    return evPerGame * perMin;
  }
  if (game === "gratteux") {
    const stake = SCRATCH_STAKES.find((s) => s.id === (g.stakeId || "obole")) || SCRATCH_STAKES[0];
    // Le RTP de référence suit les planches du graveur : positif aux planches 6+.
    const evPerGame = (scratchRtpRef(stake.id) - 1) * stake.faveur * mult;
    return evPerGame * perMin;
  }
  if (game === "vingtetun") {
    const stake = BLACKJACK_STAKES.find((s) => s.id === (g.stakeId || "legere")) || BLACKJACK_STAKES[0];
    // L'auto joue la base SANS double ni refente : son RTP est SOUS 1, donc le
    // badge est NÉGATIF comme celui des osselets et d'Icare. Lire ici le RTP de
    // référence (le jeu parfait, > 1) ne majorait pas « légèrement » : il
    // INVERSAIT le signe et promettait un gain là où l'auto consomme.
    const evPerGame = (BLACKJACK_RTP_AUTO - 1) * stake.faveur * mult;
    return evPerGame * perMin;
  }
  return 0;
}

// ── L'ARBRE D'ARTEFACTS (Phase 4) — dispatcher d'achat + descripteur UI ──────
// Deux lignées en ÉCHELLE : le rang N n'est achetable que si le rang N-1 est
// ACQUIS (le rang 1 exige l'ère du jeu). Trois kinds routés vers leur achat :
// level → buyFaveurItem (dés/ailes), artifact → buyTempleArtifact (booléen),
// automation → unlockTempleAuto (capstone). Tout reste DÉCOUPLÉ de la Rupture.

function lineageEraOk(lineageId) {
  if (lineageId === "osselets") return regulationActionUnlocked(AUGURY_TABLE_ID);
  if (lineageId === "icarus") return icarusUnlocked();
  if (lineageId === "gratteux") return scratchUnlocked();
  if (lineageId === "vingtetun") return blackjackUnlocked();
  // Le Trésor (coffres + reliques) ouvre avec les tables de l'Ère III : il
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

function nodeUnlocked(node) {
  const lin = ARTIFACT_LINEAGES.find((l) => l.id === node.lineage);
  if (!lin) return false;
  // Garde d'ère pour TOUT rang, pas seulement le premier : après un Grand Reset,
  // les artefacts/niveaux persistent (éternels) mais l'ère retombe à 0. Sans ce
  // filtre, un rang N>1 paraîtrait déverrouillé (rang N-1 persisté) alors que
  // l'action terminale (unlockTempleAuto) refuse sur sa propre garde d'ère →
  // descripteur et achat resteraient désynchronisés tant que l'ère n'est pas
  // re-atteinte. On aligne la garde d'échelle sur la garde d'ère.
  if (!lineageEraOk(node.lineage)) return false;
  const idx = lin.nodes.findIndex((n) => n.id === node.id);
  if (idx <= 0) return true; // rang 1 : l'ère suffit
  return nodeAcquired({ ...lin.nodes[idx - 1], lineage: lin.id });
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
      // Miroir de nodeUnlocked : l'ère de la lignée conditionne TOUT rang (les
      // rangs persistés après un GR ne rouvrent pas la voie tant que l'ère n'est
      // pas re-atteinte) → descripteur cohérent avec buyArtifactNode.
      const unlocked = eraOk && (idx === 0 ? true : nodeAcquired({ ...lin.nodes[idx - 1], lineage: lin.id }));
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
        cost = owned ? null : node.cost;
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
