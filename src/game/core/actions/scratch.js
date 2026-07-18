"use strict";

// Les tickets à gratter — MOTEUR du jeu de grattage du temple (cf. constantes
// SCRATCH_* de balance.js). MONNAIE FERMÉE (2026-07-16) : mise et gain en
// FAVEUR. INSTANTANÉ (pas de timer moteur comme Icare) → calqué sur augures.js :
// l'issue est tirée tout de suite, mais l'EFFET est DIFFÉRÉ (option defer +
// apply() idempotent) jusqu'à ce que l'UI ait fini de « gratter » les 9 cases
// — zéro spoiler, float + Faveur synchronisés à la révélation.
//   - playScratch(stakeId) : paie la mise (Faveur), tire UN symbole d'issue
//     contre les poids de SCRATCH_PRIZES, génère une grille 3×3 COSMÉTIQUE qui
//     matche (le symbole gagnant y apparaît 3 fois ; une perte n'aligne aucun
//     triple).
//   - Gagner = round(mise × payoutMult) en Faveur ; `venus` offre en plus un vol
//     d'Icare (Plume), `soleil` en offre un À LA HAUTEUR DU TICKET (2026-07-17 :
//     il NE RAFLE PLUS la cagnotte — Icare en est le seul rafleur).
//     Un ticket perdant épaissit la cagnotte (SCRATCH_POT_SHARE).
// Ni fatigue ni registre : le temple est sa propre économie. L'edge maison
// (~18 %, cf. balance.js) est le seul frein — recyclé en cagnotte.

import { state, render, gamePaused, collapseInProgress } from '../state.js';
import { regulationContext } from '../mechanics.js';
import { fmt } from '../utils.js';
import { tr } from '../i18n.js';
import {
  ICARUS_STAKES,
  ICARUS_EDGE_FLOOR,
  SCRATCH_STAKES,
  SCRATCH_PRIZES,
  SCRATCH_SUN_FLIGHT,
  SCRATCH_HISTORY_LEN,
  GRAVEUR_MAX_LEVEL,
  GRAVEUR_WEIGHT_SHIFT
} from '../balance.js';
import { chronicle } from './utils.js';
import { grantFreeFlight } from './templeFlights.js';
import { feedPot, drawFromPot, payRound, clampStakeMult } from './templePot.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { recordScratch } from '../chronicleStats.js';

// Les symboles sont rendus par des icônes pixel-art RÉUTILISÉES du jeu côté
// scène (scratchSymbols.js mappe chaque clé sur un sprite existant). `tesson`
// est un symbole INERTE de remplissage : jamais une issue, il épaissit
// seulement les grilles sans créer de triple.

const SCRATCH_WEIGHT_TOTAL = SCRATCH_PRIZES.reduce((s, p) => s + p.weight, 0);
const SCRATCH_BY_SYMBOL = Object.fromEntries(SCRATCH_PRIZES.map((p) => [p.symbol, p]));
// Cases de remplissage cosmétique (tous les symboles à lot + le tesson inerte),
// jamais utilisées pour DÉCIDER l'issue.
const FILL_SYMBOLS = ["olive", "amphore", "laurier", "trepied", "chouette", "venus", "soleil", "tesson"];

export function scratchUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= 2;
}

// Mises proposées (FAVEUR, fixes — cf. SCRATCH_STAKES).
export function scratchStakes() {
  return SCRATCH_STAKES.map((s) => ({ ...s }));
}

// Table EFFECTIVE des lots : les planches du graveur (state.graveurLevel)
// déplacent du poids du « blank » vers les symboles gagnants, AU PRORATA de
// leurs poids de base — le winrate monte, les PAIEMENTS ne bougent jamais
// (contrat des dés pipés, garde-fou A12 du bench). Le total reste exactement
// SCRATCH_WEIGHT_TOTAL : (730 − s) + 270 × (270 + s)/270 = 1000.
export function scratchPrizesEff() {
  const shift = Math.min(GRAVEUR_MAX_LEVEL, state.graveurLevel || 0) * GRAVEUR_WEIGHT_SHIFT;
  if (shift <= 0) return SCRATCH_PRIZES;
  const winMass = SCRATCH_WEIGHT_TOTAL - SCRATCH_BY_SYMBOL.blank.weight;
  const k = (winMass + shift) / winMass;
  return SCRATCH_PRIZES.map((p) => p.symbol === "blank"
    ? { ...p, weight: p.weight - shift }
    : { ...p, weight: p.weight * k });
}

// RTP de RÉFÉRENCE d'une mise, DÉRIVÉ de la table effective — jamais saisi à la
// main. Il inclut : (1) l'ARRONDI RÉEL du payout (round(4 × 1,2) = 5, pas 4,8 :
// l'obole rend plus que le nominal) ; (2) la VALEUR DES VOLS OFFERTS (Vénus →
// Plume, Soleil → la mise du ticket), comptée au PLANCHER d'edge d'Icare — elle
// MAJORE la valeur réelle. C'est ce total-là que feedPot doit connaître : le
// sous-estimer gonflerait le versement à la cagnotte et rongerait l'invariant
// rtp_base + recycle × (1 − rtp_base) < 1.
export function scratchRtpRef(stakeId) {
  const stake = SCRATCH_STAKES.find((s) => s.id === stakeId) || SCRATCH_STAKES[0];
  const flightEv = (id) => (ICARUS_STAKES.find((s) => s.id === id)?.faveur || 0) * (1 - ICARUS_EDGE_FLOOR);
  let rtp = 0;
  for (const p of scratchPrizesEff()) {
    if (p.symbol === "blank") continue;
    const w = p.weight / SCRATCH_WEIGHT_TOTAL;
    rtp += w * (Math.round(stake.faveur * p.payoutMult) / stake.faveur);
    if (p.freeFlight) rtp += w * (flightEv("plume") / stake.faveur);
    if (p.sunFlight) rtp += w * (flightEv(SCRATCH_SUN_FLIGHT[stake.id]) / stake.faveur);
  }
  return rtp;
}

// Tirage de l'issue : UN SEUL Math.random() (les tests le pilotent). Retourne
// l'entrée de la table EFFECTIVE (`blank` ou un symbole gagnant).
function drawPrize() {
  const prizes = scratchPrizesEff();
  const r = Math.random() * SCRATCH_WEIGHT_TOTAL;
  let acc = 0;
  for (const p of prizes) {
    acc += p.weight;
    if (r < acc) return p;
  }
  return prizes[0];
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Grille 3×3 (9 cases) PEINTE pour matcher l'issue déjà tirée : si `winSymbol`
// (≠ null), il apparaît EXACTEMENT 3 fois et aucun autre symbole n'atteint 3 ;
// si null (perte), aucun symbole n'atteint 3 (near-miss ≤2 autorisé pour le
// suspense). Cosmétique pur — n'utilise le hasard qu'APRÈS le tirage d'issue
// (les tests stubbent le 1er random, celui de drawPrize, et laissent celui-ci).
export function scratchGrid(winSymbol) {
  const cells = new Array(9).fill(null);
  if (winSymbol) {
    for (const p of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3)) cells[p] = winSymbol;
  }
  // NEAR-MISS CONTRÔLÉ (2026-07-17, phase 7). L'ancien remplissage (« ≤2 par
  // symbole, repli tesson ») forçait ~2,94 paires sur CHAQUE ticket perdant
  // contre ~1,57 sur un gagnant : le presque-gagné était un bruit de fond
  // constant, et un PERDANT paraissait plus chaud qu'un gagnant. Le nombre de
  // paires-leurres est désormais TIRÉ dans la même distribution des deux côtés
  // (0 : 25 %, 1 : 55 %, 2 : 20 %) : la paire redevient un signal, et il pointe
  // dans le bon sens. Toujours cosmétique pur — appelé APRÈS drawPrize, aucun
  // triple accidentel possible (paires à 2 exactement, le reste en symboles
  // distincts, tesson en repli).
  const r = Math.random();
  // Un PERDANT remplit 9 cases avec 8 symboles : zéro paire y est impossible —
  // son plancher est 1 (le gagnant, à 6 cases libres, peut être net).
  const pairsTarget = Math.max(winSymbol ? 0 : 1, r < 0.25 ? 0 : r < 0.80 ? 1 : 2);
  const pool = shuffle(FILL_SYMBOLS.filter((s) => s !== winSymbol));
  const fillers = [];
  for (let i = 0; i < pairsTarget && i < pool.length; i++) fillers.push(pool[i], pool[i]);
  let si = pairsTarget;
  const empties = shuffle(cells.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0));
  for (const idx of empties) {
    cells[idx] = fillers.length ? fillers.shift() : (pool[si++] ?? "tesson");
  }
  return cells;
}

// Achat + jet d'un ticket. La mise (Faveur) est PAYÉE et l'issue TIRÉE
// immédiatement (la grille est figée pour le grattage), mais tous les EFFETS
// (Faveur, cagnotte, vol offert, float, chronique, historique) sont regroupés
// dans un `apply()` IDEMPOTENT. Sans option `defer`, apply() court aussitôt
// (chemin programmatique, tests). Avec `defer: true`, l'UI le tient jusqu'à la
// révélation par grattage → aucun spoiler. Retourne { stakeId, symbol, win,
// payoutMult, grid, stakeFaveur, faveurGain, freeFlight, sunFlight, apply } —
// faveurGain/freeFlight/sunFlight peuplés PAR apply() (sur le même objet), lus par
// l'UI après la révélation. `jackpotFaveur` et `sweep` ont disparu avec la rafle du
// Soleil (2026-07-17) : ce jeu ne touche plus jamais à la cagnotte, il la nourrit.
export function playScratch(stakeId, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false, silent = false, potFunded = false, stakeMult = 1 } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null; // la crise terminale a ses propres autels
  if (!scratchUnlocked()) return null;
  const stake = scratchStakes().find((s) => s.id === stakeId);
  if (!stake) return null;
  // LES COFFRES : mise × 10^rang (clampée au moteur), gains au prorata.
  const mult = clampStakeMult(stakeMult);
  const stakeFaveur = stake.faveur * mult;
  if (potFunded) {
    // LA RELANCE (artefact, 2026-07-17) : la CELLA paie la mise, pas le joueur.
    // C'est un TRANSFERT (drawFromPot), jamais un mint — A9-neutre par
    // construction. STRICT : si la cella ne couvre pas la mise ENTIÈRE, pas de
    // relance (un financement partiel minterait la différence). Aux gros coffres,
    // la cella ne couvre plus : la relance reste un filet d'échelle humaine.
    if (!hasTempleArtifact("relance")) return null;
    if (Math.floor(Math.max(0, state.icarusPotFaveur || 0)) < stakeFaveur) return null;
    drawFromPot(stakeFaveur);
  } else {
    if ((state.faveur || 0) < stakeFaveur) return null;
    state.faveur = Math.max(0, (state.faveur || 0) - stakeFaveur);
  }

  const prize = drawPrize();                 // ← LE seul random d'issue
  const win = prize.symbol !== "blank";
  const grid = scratchGrid(win ? prize.symbol : null);

  const result = {
    stakeId,
    symbol: prize.symbol,
    win,
    payoutMult: prize.payoutMult,
    grid,
    stakeFaveur,
    potFunded: Boolean(potFunded),
    faveurGain: 0,
    freeFlight: false,
    sunFlight: false
  };

  let applied = false;
  result.apply = () => {
    if (applied) return result; // idempotent : révélation OU flush à la fermeture
    applied = true;

    const hist = Array.isArray(state.scratchHistory) ? state.scratchHistory : (state.scratchHistory = []);
    hist.push(prize.symbol);
    if (hist.length > SCRATCH_HISTORY_LEN) hist.splice(0, hist.length - SCRATCH_HISTORY_LEN);

    if (win) {
      // payRound : E exact — au coffre ×1 c'est l'arrondi non biaisé, aux gros
      // coffres la fraction devient négligeable mais l'exactitude ne coûte rien.
      result.faveurGain = payRound(stakeFaveur * prize.payoutMult);
      state.faveur = Math.max(0, (state.faveur || 0) + result.faveurGain);
      if (prize.freeFlight) {
        // Trois Vénus → vol d'Icare offert (mise Plume payée par le temple),
        // comme le Coup de Vénus aux osselets.
        result.freeFlight = grantFreeFlight("plume");
        if (result.freeFlight) chronicle(`Trois Vénus sous le vernis : le temple offre un vol d'Icare.`);
      }
      if (prize.sunFlight) {
        // Trois Soleils → le temple ne verse pas son trésor, il t'envoie le
        // CHERCHER : un vol d'Icare offert À LA HAUTEUR DU TICKET (obole → plume,
        // talent → hécatombe). Le Soleil ne rafle plus lui-même (cf. balance.js) :
        // il brade sinon à 4 Faveur et deux clics ce qu'Icare réserve au jeu manuel,
        // et sa rafle ignorait la mise, ce qui tuait le talent.
        const flightId = SCRATCH_SUN_FLIGHT[stakeId] || "plume";
        result.sunFlight = grantFreeFlight(flightId);
        if (result.sunFlight) {
          const label = ICARUS_STAKES.find((s) => s.id === flightId);
          chronicle(`Trois Soleils ! Le temple ne rend pas son or : il t'ouvre le ciel. Vol d'Icare offert (mise « ${tr(label.label)} »).`);
        }
      }
    }
    // La cagnotte est nourrie sur l'EDGE du ticket, à CHAQUE tirage (gagné comme
    // perdu, cf. feedPot). Avant, un ticket perdant versait 30 % de la MISE contre
    // un edge de ~18 % : la table imprimait (105,5 % sur l'obole). Cette table ne
    // reprend JAMAIS ce qu'elle verse : le pot se rafle au Vol d'Icare. Le RTP de
    // référence suit le niveau des planches du graveur (moins d'edge à recycler).
    feedPot(stakeFaveur, scratchRtpRef(stakeId));
    // Registre de la Chronique : un ticket de plus (mise, gain, temps forts
    // trois-Vénus / trois-Soleils via le symbole d'issue).
    recordScratch({ wagered: stakeFaveur, won: result.faveurGain, symbol: prize.symbol });

    if (!silent) {
      const floatLabel = win
        ? (result.sunFlight ? `🎟️ +${fmt(result.faveurGain)} faveur · vol offert` : `🎟️ +${fmt(result.faveurGain)} faveur`)
        : "🎟️ vernis nu";
      pushOutcomeFloat({ label: floatLabel, kind: win ? "gain" : "cost" });
    }
    if (doRender) render();
    return result;
  };

  if (!defer) result.apply();
  return result;
}

// Faveur qu'aurait payée une case gagnante pour un symbole donné et une mise
// en Faveur (utile à l'UI pour la légende des lots). Pur.
export function scratchPayout(symbol, stakeFaveur) {
  const p = SCRATCH_BY_SYMBOL[symbol];
  if (!p || p.payoutMult <= 0) return 0;
  return Math.round((stakeFaveur || 0) * p.payoutMult);
}
