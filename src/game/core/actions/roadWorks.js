"use strict";

// ── Chantiers de voirie ──────────────────────────────────────────────────────
// La rangée Routes ne vend plus « +1 tuile » à coût géométrique : 1 achat = 1
// CHANTIER, un objet fini et nommé. Tant qu'un moteur n'est pas relié, le
// chantier RACCORDE le plus proche (le corridor entier) ; quand tout est relié,
// il ÉLARGIT le tronçon le plus emprunté d'un rang (rue → avenue → boulevard).
// Le coût est ∝ tuiles du chantier (prix de la tuile ancré sur l'ère) ; la
// cadence vient du TEMPS de pose (une équipe, une petite file), pas du prix.
//
// Répartition des rôles :
//   - la CARTE écrit state.roadNext (prochain chantier : nature, tuiles, cible)
//     et state.roadWidened, comme elle écrit déjà roadCoverage ;
//   - ICI on encaisse, on met en file, et le tick fait avancer le chantier sur
//     l'horloge virtuelle (hors-ligne compris) ;
//   - à la complétion, state.buildings.roads += 1 : la carte rejoue alors les
//     K chantiers de façon déterministe (connect + élargissements) — le compteur
//     reste la seule vérité, les saves restent compatibles.

import { state, invalidateRenderCache, render } from '../state.js';
import { D } from '../num.js';
import { currentEraIndex } from '../mechanics/shared.js';
import {
  ROAD_WORK_QUEUE_MAX,
  ROAD_TILE_COST_BASE,
  ROAD_TILE_COST_GROWTH,
  ROAD_WIDEN_COST_MULT,
  ROAD_TILE_SECONDS,
  ROAD_CREW_SPEED_PER_ERA,
  ROAD_WORK_BASE_SECONDS,
  ROAD_WORK_TIME_RAMP,
  ROAD_WORK_TIME_MAX,
  ROAD_WORKS_BANK_MAX,
  ROAD_NEXT_FALLBACK_TILES
} from '../balance.js';

// File toujours saine, même sur une vieille save hydratée sans le champ.
export function roadWorksState() {
  let rw = state.roadWorks;
  if (!rw || typeof rw !== 'object') { rw = { active: null, queue: [] }; state.roadWorks = rw; }
  if (!Array.isArray(rw.queue)) rw.queue = [];
  return rw;
}

export function roadWorksCount() {
  const rw = roadWorksState();
  return (rw.active ? 1 : 0) + rw.queue.length;
}

// Prochain chantier : la carte fait foi ; avant son premier calcul (boot,
// carte jamais montée), une estimation raisonnable pour afficher un prix.
export function roadNextInfo() {
  const n = state.roadNext;
  if (n && typeof n === 'object') {
    if (n.kind === 'done') return n;
    if (Number.isFinite(n.tiles) && n.tiles > 0) return n;
  }
  return { kind: 'link', tiles: ROAD_NEXT_FALLBACK_TILES, targetId: null, toRank: null };
}

// Réserve de chantiers prépayés (réseau achevé) : toujours un entier sain.
export function roadWorksBank() {
  const b = state.roadWorksBank;
  return Number.isFinite(b) ? Math.max(0, Math.min(ROAD_WORKS_BANK_MAX, Math.floor(b))) : 0;
}

// Coût du prochain chantier : tuiles × prix de la tuile de l'ère, rang visé en
// facteur pour les élargissements. Decimal de bout en bout (les ères tardives
// dépassent le float). Réseau achevé : prix PLAT d'un chantier moyen — l'achat
// part en RÉSERVE ; null seulement quand la réserve est pleine.
export function roadWorkCost() {
  const n = roadNextInfo();
  if (n.kind === 'done') {
    if (roadWorksBank() >= ROAD_WORKS_BANK_MAX) return null;
    return D(ROAD_TILE_COST_BASE)
      .mul(D(ROAD_TILE_COST_GROWTH).pow(Math.max(0, currentEraIndex())))
      .mul(ROAD_NEXT_FALLBACK_TILES);
  }
  const mult = n.kind === 'widen' ? (ROAD_WIDEN_COST_MULT[n.toRank] || ROAD_WIDEN_COST_MULT.avenue) : 1;
  return D(ROAD_TILE_COST_BASE)
    .mul(D(ROAD_TILE_COST_GROWTH).pow(Math.max(0, currentEraIndex())))
    .mul(Math.max(1, n.tiles) * mult);
}

// Chantiers de l'ÈRE COURANTE (rampe) : compteur remis à zéro quand l'ère
// change — la remontée éclair post-Effondrement traverse les ères sans traîner
// la rampe du cycle entier ; c'est en campant sur son ère de pointe qu'elle mord.
export function roadWorksEraIndex() {
  const era = Math.max(0, currentEraIndex());
  let we = state.roadWorksEra;
  if (!we || typeof we !== 'object' || we.era !== era) {
    we = { era, count: 0 };
    state.roadWorksEra = we;
  }
  return we;
}

// Durée du chantier : (base + tuiles ÷ vitesse d'équipe) × rampe de l'ère.
// L'équipe s'améliore avec l'ère (outils, engins) — les grandes vagues du late
// game se posent en minutes, pas en dizaines de minutes.
export function roadWorkDuration(tiles, index, eraIndex = null) {
  const era = Math.max(0, eraIndex == null ? currentEraIndex() : eraIndex);
  const crew = 1 + era * ROAD_CREW_SPEED_PER_ERA;
  const raw = (ROAD_WORK_BASE_SECONDS + (Math.max(1, tiles) * ROAD_TILE_SECONDS) / crew)
    * (1 + Math.max(0, index) * ROAD_WORK_TIME_RAMP);
  return Math.min(ROAD_WORK_TIME_MAX, raw);
}

export function buyRoadWorkCore() {
  const rw = roadWorksState();
  const n = roadNextInfo();
  // Réseau achevé : l'achat se STOCKE (chantier prépayé, lancé tout seul par le
  // tick dès qu'un nouveau bâtiment ouvre un raccord). Pas de file ici.
  if (n.kind === 'done') {
    if (roadWorksBank() >= ROAD_WORKS_BANK_MAX) return false;
    const bankCost = roadWorkCost();
    if (!bankCost || D(state.knowledge).lt(bankCost)) return false;
    state.knowledge = D(state.knowledge).sub(bankCost);
    state.roadWorksBank = roadWorksBank() + 1;
    return true;
  }
  if (roadWorksCount() >= ROAD_WORK_QUEUE_MAX) return false;
  const cost = roadWorkCost();
  if (!cost || D(state.knowledge).lt(cost)) return false;
  state.knowledge = D(state.knowledge).sub(cost);
  enqueueRoadWork(rw, n);
  return true;
}

// Mise en file d'un chantier pour le prochain objectif `n` (achat direct ou
// lancement depuis la réserve) : durée sur la rampe de l'ère courante.
function enqueueRoadWork(rw, n) {
  const we = roadWorksEraIndex();
  const total = roadWorkDuration(n.tiles, we.count);
  we.count += 1;
  const work = {
    kind: n.kind === 'widen' ? 'widen' : 'link',
    tiles: Math.max(1, n.tiles),
    targetId: n.targetId || null,
    toRank: n.toRank || null,
    total,
    left: total
  };
  if (!rw.active) rw.active = work; else rw.queue.push(work);
}

export function buyRoadWork() {
  const bought = buyRoadWorkCore();
  if (bought) {
    invalidateRenderCache('buildings');
    render();
  }
  return bought;
}

// Avancée des chantiers sur l'horloge virtuelle (appelé par tick, hors-ligne
// compris : un grand dt traverse la file, le reliquat passe au chantier
// suivant). Complétion → buildings.roads += 1 : le recompute de carte suit tout
// seul (roadCount fait partie de sa signature de layout).
export function tickRoadWorks(dt) {
  const rw = state.roadWorks;
  if (!rw || typeof rw !== 'object') return;
  if (!Array.isArray(rw.queue)) rw.queue = [];
  // RÉSERVE : un chantier prépayé se lance TOUT SEUL dès que la carte propose du
  // travail (nouveaux bâtiments après un achat ou une ère). Un par tick suffit,
  // la file se remplit en quelques battements.
  if (roadWorksBank() > 0 && roadWorksCount() < ROAD_WORK_QUEUE_MAX) {
    const n = state.roadNext;
    if (n && typeof n === 'object' && n.kind && n.kind !== 'done'
      && Number.isFinite(n.tiles) && n.tiles > 0) {
      state.roadWorksBank = roadWorksBank() - 1;
      enqueueRoadWork(roadWorksState(), n);
    }
  }
  if (!rw.active && rw.queue.length) rw.active = rw.queue.shift();
  if (!rw.active || !(dt > 0)) return;
  rw.active.left -= dt;
  let guard = 64;
  while (rw.active && rw.active.left <= 0 && guard-- > 0) {
    const spill = -rw.active.left;
    state.buildings.roads = Math.floor(state.buildings.roads || 0) + 1;
    state.lifetimePurchases = (state.lifetimePurchases || 0) + 1;
    rw.active = rw.queue.shift() || null;
    if (rw.active) rw.active.left -= spill;
  }
}
