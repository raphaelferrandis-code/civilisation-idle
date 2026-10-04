"use strict";
// ── QUI EST À BORD — les habitants de l'ère, par métier du bateau ────────────────
// (docs/PLAN-BATEAUX.md §8, 2026-10-03 : « faut revoir les personnages sur les
// bateaux »)
//
// Le kit dit où se tiennent les marins (boatBake.crewSlot) ; ce module dit QUI ils
// sont : un dessin des habitants de l'ère (agents.js), choisi par métier. Pas le
// chaman ni le moine aux rames, pas le joggeur à la barre d'un remorqueur : chaque
// ère prête ceux de ses gens qui ont l'air d'y être à leur place.
//   crew   : marins (barre, rames, perche, manœuvre)
//   fisher : le pêcheur (le pêcheur au poisson sur l'épaule de l'âge de pierre)
//   pass   : passagers du bac (assis, debout, qui saluent)
//   police : la vedette de police, quand l'ère a son uniforme
//   hostess: l'hôtesse de la navette des Plaisirs, une fille de la troupe de la
//            Maison (plaisirsCast), à son âge
// Pur : aucun DOM, aucun CM (les planches de scripts/ s'en servent aussi).

import { plaisirsCast } from './plaisirsCast.js';

const STONE = { crew: ['caveman', 'caveman2'], fisher: ['caveman3'], pass: ['cavewoman', 'cavewoman2', 'cavewoman3', 'caveman'] };
const MEDIEVAL = { crew: ['villager', 'villager2'], fisher: ['villager', 'villager2'], pass: ['villagerwoman', 'villagerwoman2', 'villagerwoman3', 'villager'] };
export const BOAT_CAST = {
  0: STONE,
  1: STONE,
  2: MEDIEVAL,
  3: MEDIEVAL,
  4: { crew: ['romanman2', 'romanman4'], fisher: ['romanman2'], pass: ['romanman', 'romanwoman', 'romanwoman3', 'romanwoman2'] },
  5: { crew: ['industrialman', 'industrialman2', 'industrialman4'], fisher: ['industrialman', 'industrialman2'], pass: ['industrialwoman', 'industrialwoman2', 'industrialwoman3', 'industrialman'], police: ['industrialman3'] },
  6: { crew: ['modernman3', 'modernman2'], fisher: ['modernman2'], pass: ['modernman', 'modernwoman', 'modernwoman3', 'modernman2'] },
  7: { crew: ['jademan3', 'jadewoman3', 'jademan'], fisher: ['jademan'], pass: ['jadewoman', 'jadewoman2', 'jademan4', 'jademan'] },
  8: { crew: ['stellarman4', 'stellarwoman2'], fisher: ['stellarman4'], pass: ['stellarman', 'stellarman3', 'stellarwoman', 'stellarwoman3'] },
  9: { crew: ['crystalman4', 'crystalman3', 'crystalwoman2'], fisher: ['crystalman3'], pass: ['crystalwoman', 'crystalwoman3', 'crystalman', 'crystalman2'] },
};

// Ceux qui mènent le bac ; les autres poses y sont des passagers.
const HANDS = new Set(['steer', 'pole', 'row', 'paddle', 'haul']);
// Un VOYAGEUR du bac (pas le passeur) : sa place reçoit les gens qui attendaient au
// ponton (boatKit.drawBoat, opts.passNames ; lot 5 de PLAN-COMPORTEMENTS).
export const isFerryPassenger = (M, cr) => !!M && M.role === 'ferry' && !HANDS.has(cr.pose);

// Le dessin d'un membre d'équipage `cr` (place cuite : pose, id, role) sur le bateau
// `M` : { name, scale } — scale nulle = celle du jeu d'habitants (agents.js).
export function crewSpec(band, M, cr) {
  const b = Math.max(0, Math.min(9, band | 0));
  if (cr.role === 'hostess') {
    const girls = (plaisirsCast(b) || {}).girls;
    if (girls && girls.length) { const g = girls[(cr.id >>> 0) % girls.length]; return { name: g.name, scale: g.scale }; }
  }
  const C = BOAT_CAST[b];
  let list = C.crew;
  if (M && M.role === 'fisher') list = C.fisher;
  else if (M && M.beacon && C.police) list = C.police;
  else if (M && M.role === 'ferry' && !HANDS.has(cr.pose)) list = C.pass;
  else if (M && M.role === 'shuttle') list = C.pass;   // les passagers de la navette
  return { name: list[(cr.id >>> 0) % list.length], scale: null };
}
export const crewName = (band, M, cr) => crewSpec(band, M, cr).name;

// Cap MONDE (rad) → bande diagonale des habitants (agents.ISO_DIAG : 0 = est → sud-
// est, 1 = ouest → nord-ouest, 2 = sud → sud-ouest, 3 = nord → nord-est).
export function crewDir(phi) {
  const q = ((Math.round(phi / (Math.PI / 2)) % 4) + 4) % 4;   // 0 E, 1 S, 2 O, 3 N
  return [0, 2, 1, 3][q];
}
