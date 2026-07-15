"use strict";

// Moteur d'AUTOMATISATION du Temple (Phase 2, 2026-07-15) — un petit moteur de
// production PASSIF. Quand le joueur a débloqué et activé une automatisation, le
// tick joue À SA PLACE, aux CADRANS qu'il règle (rite, multiplicateur cible,
// mise, plancher d'or). Gouverné comme l'Intendance (tickSteward) :
//   - cooldown Date.now() par jeu (offline-safe : la sim monkeypatch Date.now) ;
//   - UNE partie par jeu et par tick (jamais de rafale qui viderait l'or) ;
//   - plancher d'or = réserve à NE PAS entamer (l'auto se met en veille dessous).
// La mise coûte de l'OR (le puits) → le moteur est un CONVERTISSEUR borné par
// l'économie, pas de l'argent gratuit. Réglé bas = revenu de fond régulier ;
// réglé haut = la machine tente les gros coups (à toi de doser le risque).
//
// ONLINE pour l'instant : early-return si isNotifyPaused() (offline/sim). Un
// crédit offline serait un hook dédié dans applyOfflineProgress (chemin linéaire
// qui n'appelle pas tick()) — à ajouter si voulu, avec un plafond de parties.
//
// Les jeux sont appelés en HEADLESS (moteur pur, jamais la scène UI) :
//   - osselets : castAugury(id, rite, { render:false, silent:true }) — crédite
//     la Faveur synchro, sans float ni scène ;
//   - Icare : resolveIcarusHeadless(stakeId, cible) — même loi que le jeu
//     interactif, sans état de vol ni timer.

import { state, render, save, isNotifyPaused, defaultTempleAuto } from '../state.js';
import { rates, regulationActionUnlocked } from '../mechanics.js';
import { D } from '../num.js';
import { castAugury, auguryCost, auguryBaseOdds, auguryTierOdds, AUGURY_RITES } from './augures.js';
import { resolveIcarusHeadless, icarusStakes, icarusEffectiveEdge, icarusUnlocked, icarusCrashConsolation } from './icarus.js';
import { buyFaveurItem, buyTempleArtifact } from './faveurShop.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { ARTIFACT_LINEAGES, ARTIFACT_NODES } from '../../data/artifacts.js';
import { chronicle } from './utils.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import {
  AUTO_AUGURY_INTERVAL_MS,
  AUTO_ICARUS_INTERVAL_MS,
  AUTO_ICARUS_TARGET_MIN,
  AUTO_ICARUS_TARGET_MAX,
  AUTO_TEMPLE_GOLD_FLOOR_MAX_S,
  AUTO_OSSELETS_UNLOCK_COST,
  AUTO_ICARUS_UNLOCK_COST,
  AUGURY_FAVEUR,
  ICARUS_STAKES,
  ICARUS_FAVEUR_K
} from '../balance.js';

// La table d'osselets fusionnée conserve cet id interne (cf. regulationActions).
const AUGURY_TABLE_ID = "prayForRain";

// Réserve d'or à conserver APRÈS la mise : `seconds` secondes de production d'or
// COURANTE. On ne joue que si l'or RESTE au-dessus (vraie réserve, pas une simple
// porte de démarrage). Cohérent avec la convention « N s de prod » du jeu.
function goldFloor(seconds) {
  return D(rates().gold || 0).mul(Math.max(0, seconds || 0));
}

// Appelé à chaque tick (1 Hz) juste après tickSteward, sous les mêmes gardes
// (pause / effondrement / crise terminale). Ne fait rien tant qu'aucune
// automatisation n'est débloquée + activée.
export function tickTempleAutomation() {
  // Offline/sim : notify en pause → on ne veut ni créditer des milliers de
  // parties d'un coup, ni spammer les floats. Le crédit offline (si voulu) sera
  // un hook séparé et plafonné.
  if (isNotifyPaused()) return;
  const auto = state.templeAuto;
  if (!auto) return;
  const now = Date.now();
  let played = false;

  // ── OSSELETS — auto-lancé au rite choisi ──
  const o = auto.osselets;
  if (o && o.on && o.unlocked && now - (o.lastAt || 0) >= AUTO_AUGURY_INTERVAL_MS) {
    const cost = auguryCost(AUGURY_TABLE_ID, o.rite || "classique");
    const stake = cost ? D(cost.gold || 0) : null;
    // Vraie RÉSERVE : jouer seulement si l'or reste au-dessus du plancher APRÈS la mise.
    if (stake && D(state.gold).sub(stake).gt(goldFloor(o.goldFloorS))) {
      const res = castAugury(AUGURY_TABLE_ID, o.rite || "classique", { render: false, silent: true });
      // Cooldown consommé SEULEMENT si le jet a eu lieu (castAugury renvoie null
      // si verrouillé/impayable — ne pas brûler le cooldown sur un no-op).
      if (res) { o.lastAt = now; played = true; }
    }
  }

  // ── ICARE — autopush au multiplicateur cible ──
  const i = auto.icarus;
  if (i && i.on && i.unlocked && now - (i.lastAt || 0) >= AUTO_ICARUS_INTERVAL_MS) {
    const stakeId = i.stakeId || "plume";
    // Vol OFFERT (mise Plume stockée par un Coup de Vénus) : coût nul → ignore le
    // plancher d'or ; sinon vraie réserve préservée APRÈS la mise.
    const freeFlight = stakeId === "plume" && (state.icarusFreeFlights || 0) > 0;
    const found = icarusStakes().find((s) => s.id === stakeId);
    const stake = freeFlight ? D(0) : (found ? D(found.gold) : null);
    if (freeFlight || (stake && D(state.gold).sub(stake).gt(goldFloor(i.goldFloorS)))) {
      const target = Math.min(AUTO_ICARUS_TARGET_MAX, Math.max(AUTO_ICARUS_TARGET_MIN, i.target || 2));
      const res = resolveIcarusHeadless(stakeId, target);
      if (res) { i.lastAt = now; played = true; }
    }
  }

  if (played) render();
}

// ── Écriture des réglages depuis l'UI (tableau de bord) ──────────────────────
// Aucune mutation directe de state.templeAuto côté composant : on passe par ce
// setter (validation/bornage calqués sur normalizeTempleAuto) puis save+render,
// exactement comme setStewardClause pour l'Intendance.
const VALID_RITES = Object.keys(AUGURY_RITES);
const VALID_STAKES = ICARUS_STAKES.map((s) => s.id);

export function setTempleAuto(game, patch) {
  if (game !== "osselets" && game !== "icarus") return;
  if (!state.templeAuto) state.templeAuto = defaultTempleAuto();
  const g = state.templeAuto[game];
  const p = (patch && typeof patch === "object") ? patch : {};
  if ("on" in p) g.on = Boolean(p.on);
  if ("goldFloorS" in p) {
    g.goldFloorS = Math.round(Math.max(0, Math.min(AUTO_TEMPLE_GOLD_FLOOR_MAX_S, Number(p.goldFloorS) || 0)));
  }
  if (game === "osselets" && typeof p.rite === "string" && VALID_RITES.includes(p.rite)) {
    g.rite = p.rite;
  }
  if (game === "icarus" && typeof p.stakeId === "string" && VALID_STAKES.includes(p.stakeId)) {
    g.stakeId = p.stakeId;
  }
  if (game === "icarus" && "target" in p) {
    g.target = Math.max(AUTO_ICARUS_TARGET_MIN, Math.min(AUTO_ICARUS_TARGET_MAX, Number(p.target) || AUTO_ICARUS_TARGET_MIN));
  }
  save();
  render();
}

// Déblocage d'une automatisation contre de la FAVEUR (Phase 3 — la Phase 4
// intégrera ça à l'arbre d'artefacts). Payer débloque ET active d'emblée.
export function unlockTempleAuto(game) {
  if (game !== "osselets" && game !== "icarus") return false;
  if (!state.templeAuto) state.templeAuto = defaultTempleAuto();
  const g = state.templeAuto[game];
  if (g.unlocked) return false;
  // Pas de déblocage avant que le jeu soit jouable (sinon on paie pour un moteur
  // qui produit 0) : Icare à l'Ère III, osselets à l'Ère II.
  if (game === "icarus" && !icarusUnlocked()) return false;
  if (game === "osselets" && !regulationActionUnlocked(AUGURY_TABLE_ID)) return false;
  const cost = game === "osselets" ? AUTO_OSSELETS_UNLOCK_COST : AUTO_ICARUS_UNLOCK_COST;
  if ((state.faveur || 0) < cost) return false;
  state.faveur = Math.max(0, (state.faveur || 0) - cost);
  g.unlocked = true;
  g.on = true;
  const label = game === "osselets" ? "l'auto-lancé des osselets" : "l'autopush d'Icare";
  chronicle(`Le temple prend vie : ${label} tourne désormais tout seul, aux cadrans que tu règles.`);
  pushOutcomeFloat({ label: `⚙️ ${game === "osselets" ? "Osselets auto" : "Icare auto"}`, kind: "gain" });
  save();
  render();
  return true;
}

// Coût de déblocage par jeu (pour l'UI).
export function templeAutoUnlockCost(game) {
  return game === "osselets" ? AUTO_OSSELETS_UNLOCK_COST : AUTO_ICARUS_UNLOCK_COST;
}

// Débit ✦/min ESTIMÉ (espérance) d'une automatisation, aux réglages courants.
// Renvoie 0 si l'auto est À L'ARRÊT ou si le jeu n'est pas encore jouable (l'ère
// requise) — le badge reflète alors la production RÉELLE (nulle). La cadence est
// une BORNE HAUTE (le plancher d'or peut la réduire). NB : la Clémence (bonus sur
// série noire) est ignorée — elle ne fait que RELEVER pEff, donc le gain réel des
// osselets est plutôt LÉGÈREMENT SUPÉRIEUR à cette estimation.
export function templeAutoThroughput(game) {
  const auto = state.templeAuto;
  if (!auto) return 0;
  const g = auto[game];
  if (!g || !g.on) return 0; // à l'arrêt → aucune production réelle
  if (game === "osselets") {
    if (!regulationActionUnlocked(AUGURY_TABLE_ID)) return 0; // Ère II requise
    const rite = AUGURY_RITES[g.rite] || AUGURY_RITES.classique;
    const pEff = auguryBaseOdds(AUGURY_TABLE_ID); // Clémence ignorée (cf. supra)
    const odds = auguryTierOdds(pEff, rite.spread);
    // Gains ×costMult (Vénus/triple/paire) ; consolations PLATES (creux/chien).
    const evPerGame =
      odds.venus * Math.round(AUGURY_FAVEUR.venus * rite.costMult) +
      odds.triple * Math.round(AUGURY_FAVEUR.triple * rite.costMult) +
      odds.pair * Math.round(AUGURY_FAVEUR.pair * rite.costMult) +
      odds.hollow * AUGURY_FAVEUR.hollow +
      odds.dog * AUGURY_FAVEUR.dog;
    return evPerGame * (60000 / AUTO_AUGURY_INTERVAL_MS);
  }
  if (game === "icarus") {
    if (!icarusUnlocked()) return 0; // Ère III requise (le moteur rend 0 avant)
    const T = Math.min(AUTO_ICARUS_TARGET_MAX, Math.max(AUTO_ICARUS_TARGET_MIN, g.target || 2));
    const Tr = Math.floor(T * 100) / 100;
    const pWin = Math.min(1, (1 - icarusEffectiveEdge()) / T);
    const stake = ICARUS_STAKES.find((s) => s.id === (g.stakeId || "plume")) || ICARUS_STAKES[0];
    // Gain = payout ; perte = 0 SAUF « plumes de secours » (consolation Faveur).
    // L'auto ne rafle JAMAIS le jackpot.
    const win = Math.round(stake.seconds * Tr * ICARUS_FAVEUR_K);
    const loss = icarusCrashConsolation(stake.seconds);
    const evPerGame = pWin * win + (1 - pWin) * loss;
    return evPerGame * (60000 / AUTO_ICARUS_INTERVAL_MS);
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
