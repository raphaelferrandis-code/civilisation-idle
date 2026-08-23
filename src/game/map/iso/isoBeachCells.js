"use strict";
// OÙ EST LA GRÈVE — la règle, en un seul exemplaire.
//
// Extraite d'`isoGroundResolve` le 2026-08-24, et pas par goût du rangement : la pente
// de grève (lot 1 du relief, cf. `isoRelief.GREVE`) est peinte dans la passe VIVE du
// fleuve, alors que le sable, lui, est cuit dans le SOL. Deux peintres, deux moments,
// et une seule question — « cette cellule de berge est-elle du sable ? ». Tant que la
// réponse vivait dans le bake, le fleuve ne pouvait que la deviner.
//
// ⚠⚠ ET LA DEVINER NE MARCHE PAS. Premier jet : le fleuve rejouait la seule proximité
// d'un trou de quai, sans les exclusions. Mesuré au masque de différence : la pente se
// posait aussi devant le QUARTIER PAVÉ de la rive opposée, là où le sol cuit est de la
// pierre — une plage sous des maisons. Les exclusions ne sont pas un détail de la
// règle, elles SONT la règle.
//
// ⚠ Ce module ne dit PAS tout le classement : la priorité de l'eau, du parvis de
// merveille et des places reste dans la chaîne de `kindAt`, où elle se lit. Il ne porte
// que ce qui est propre à la grève de BERGE.
import { CM } from '../layout.js';
import { BEACH } from './isoGroundTiles.js';
import { builtCells } from './isoTissu.js';
import { ensureQuayGate } from '../quaysAndRiot.js';

// ⚠ LE PORT EST EXEMPTÉ DE L'EXCLUSION DES CELLULES BÂTIES. Retour Raph : « il y a une
// bande de gazon au port qui coupe la plage en 2 ». Mesuré à l'époque : sur les 72
// cellules de berge concernées, 4 étaient écartées comme bâties — et les 4 appartiennent
// au port, dont l'emprise (4×5) mord la berge en plein milieu de la grève. Un port de
// rivière est un PONTON posé sur le rivage : du sable dessous est juste, et son sprite
// recouvre les cellules de toute façon. Mémoïsé par layout, comme `builtCells`.
export function beachPortCells(L) {
  if (L._beachPortCells) return L._beachPortCells;
  const s = new Set();
  for (const t of (L.tiles || [])) {
    if (t.buildingId !== 'river_ports') continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) s.add((t.gx + ax) + ',' + (t.gy + ay));
  }
  L._beachPortCells = s;
  return s;
}

// Cette cellule de BERGE est-elle de la grève ?
//
// Une cellule de `river.banks` — donc qui TOUCHE l'eau par construction, impossible de
// dériver vers l'intérieur des terres — proche d'un point où le quai ne trace pas, et
// qui n'est ni une route ni du bâti (le port excepté). Le rayon fait de la coupe de
// 4 samples du port une grève d'une douzaine de tuiles, assez pour se lire, et fond la
// plage dans la maçonnerie au lieu de l'arrêter net contre elle.
//
// ⚠ Le gate doit être FRAIS : le sol est baké AVANT le fleuve dans la frame, donc
// personne ne l'a encore calculé au premier passage. Idempotent et caché par layout.
export function isBeachBankCell(L, gx, gy) {
  if (!BEACH.on || !L) return false;
  const banks = (L.river && L.river.banks) || null;
  if (!banks) return false;
  const key = gx + ',' + gy;
  if (!banks.has(key)) return false;
  if (L.roadSet && L.roadSet.has(key)) return false;               // une rampe vers le quai reste une rampe
  if (builtCells(L).has(key) && !beachPortCells(L).has(key)) return false;
  ensureQuayGate();
  const pts = (CM.quayGate && CM.quayGate.gapPts) || null;
  if (!pts || !pts.length) return false;
  const cx = gx + 0.5, cy = gy + 0.5, r2 = BEACH.bankR * BEACH.bankR;
  for (const p of pts) {
    const dx = cx - p.x, dy = cy - p.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

