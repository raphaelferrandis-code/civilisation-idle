"use strict";
// ── LA JOURNÉE D'UN PASSANT ──────────────────────────────────────────────────
//
// docs/PLAN-COMPORTEMENTS.md, lot 2. La journée n'avait pas de rythme : le lieu de
// travail était tiré n'importe où dans la ville, on y arrivait et on repartait aussitôt
// sans jamais entrer ; la nuit, un tiers « dormait » devant n'importe quelle porte et
// les autres erraient.
//
// Désormais chacun a une MAISON (sa porte de naissance) et un TRAVAIL PROCHE, et vit
// sur l'horloge du jour de la carte (CM.dayP, cycle de 9 minutes : jour 0-0,55,
// crépuscule 0,55-0,65, nuit 0,65-0,90, aube 0,90-1) :
//   · à l'aube on sort de chez soi, le matin on va travailler — on ENTRE par la
//     porte, on ressort un peu plus tard ;
//   · vers midi, la place et le marché ; l'après-midi, le travail et les courses ;
//   · au crépuscule on rentre, et on reste chez soi jusqu'à l'aube ;
//   · un quart des gens sont des « couche-tard » : la nuit, ils flânent encore.
// Pur : ne lit que ce qu'on lui passe.

// Phase du jour utilisable : CM.dayP, ou une heure fixe quand le ciel est figé
// (capture, option « Jour » / « Nuit »).
export function dayPhase(dayP, nightF) {
  if (dayP != null) return dayP;
  return (nightF || 0) > 0.5 ? 0.8 : 0.3;
}

// Traits d'un passant, tirés de sa phase (stables toute sa vie).
const frac = (v) => ((v % 1) + 1) % 1;
export function citizenTraits(p) {
  const ph = p.phase || 0;
  return {
    owl: frac(ph * 517.31) < 0.25,          // couche-tard
    slow: p.charType !== 2 && frac(ph * 211.73) < 0.15,   // pas lent (un vieux, un flâneur)
    stagger: frac(ph * 97.13),              // l'heure à laquelle il sort de chez lui, à l'aube
  };
}

// Le soir et la nuit : l'heure de rentrer (et de rester) chez soi.
export const homeTime = (dp) => dp >= 0.55 && dp < 0.92;
// L'aube est-elle venue POUR LUI ? Les sorties s'étalent sur l'aube (et un peu après).
export const dawnFor = (dp, stagger) => !homeTime(dp) && (dp >= 0.9 + stagger * 0.08 || dp < 0.5);

// Envies selon l'heure. Rend le genre de but : 'work' | 'errand' | 'plaza' | 'wonder'
// | 'cross' | 'wander' | 'home' | 'night'. `r` = tirage uniforme dans [0, 1).
export function pickAgenda(dp, traits, r, wonderPull = 0) {
  if (homeTime(dp)) {
    if (!traits.owl) return 'home';
    return r < 0.15 ? 'home' : r < 0.6 ? 'night' : 'plaza';
  }
  let w;
  if (dp >= 0.9 || dp < 0.12) w = { work: 0.6, errand: 0.1, plaza: 0.05, wonder: 0.02, cross: 0.05, wander: 0.18 };
  else if (dp < 0.25) w = { work: 0.45, errand: 0.18, plaza: 0.14, wonder: 0.05, cross: 0.05, wander: 0.13 };
  else if (dp < 0.38) w = { work: 0.18, errand: 0.2, plaza: 0.34, wonder: 0.1, cross: 0.05, wander: 0.13 };
  else w = { work: 0.34, errand: 0.2, plaza: 0.2, wonder: 0.05, cross: 0.05, wander: 0.16 };
  // Les vagues d'attroupement aux merveilles (CM.wonderPull) gardent leur force.
  w.wonder += 0.55 * wonderPull;
  let tot = 0;
  for (const k in w) tot += w[k];
  let x = r * tot;
  for (const k in w) { x -= w[k]; if (x < 0) return k; }
  return 'wander';
}

// Combien de temps reste-t-on à l'intérieur (secondes), selon ce qu'on est venu faire.
// `dawn` : rentré pour la nuit, on ne ressort qu'à l'aube.
export function dwellFor(kind, dp, traits, r) {
  if (kind === 'work') return { t: 16 + r * 26 };
  if (kind === 'errand') return { t: 5 + r * 8 };
  if (kind === 'home') return homeTime(dp) && !traits.owl ? { dawn: true } : { t: 6 + r * 14 };
  return null;
}

// Allure : multiplicateur de la vitesse propre selon le moment et le passant.
export function paceFor(p, traits, dp, goalKind) {
  let k = traits.slow ? 0.78 : 1;
  if (goalKind === 'home' && homeTime(dp)) k *= 1.12;          // on rentre d'un bon pas
  else if (goalKind === 'work' && dp >= 0.1 && dp < 0.25) k *= 1.08;   // un peu en retard
  else if (goalKind === 'night') k *= 0.88;                     // la flânerie du soir
  return k;
}
