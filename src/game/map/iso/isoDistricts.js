"use strict";
// ── LES REPÈRES CIVIQUES — la masse des districts ────────────────────────────
//
// Lot A du chantier « hiérarchie de masse » (PLAN-RENDU-VILLE §2/S12, lancé par
// Raph le 2026-08-24). Le diagnostic, remesuré le jour même : 361 bâtiments
// dessinés sur 369 tiennent sous 80 px (p50 = 56) — l'image n'a AUCUNE couche de
// repères entre la maison et la merveille. Or les emprises existent depuis
// toujours : 18-22 districts civiques typés (palace/forum/archive/keep/market/
// temple/tower/station/spire/arcology…), calculés, réservés, occultés, survolés —
// et dessinés nulle part.
//
// LE PRINCIPE : chaque district devient un PSEUDO-TILE moteur qui emprunte le
// chemin des scènes existant (drawIsoEngineScene — span-aware, 4 stades d'ère,
// hover publié) avec l'ART D'UN MOTEUR APPARENTÉ comme masse d'attente. Aucune
// image nouvelle : le calendrier de l'art (les 13 genres dédiés) se décide sur
// pièces, après que la COUCHE a prouvé sa lecture. C'est la méthode maquette du
// chantier relief : la direction d'abord, l'art ensuite.
//
// Molette : __districtMass(false) coupe la couche ; __districts({ parvis }) régit
// l'esplanade sous les masses (isoWonderGround).
import { CM } from '../layout.js';

export const DISTRICT_MASS = { on: true };

// Genre civique → moteur dont l'art PORTE la masse d'attente. Le choix est
// sémantique (un donjon garde, un forum juge, une archive lit) — quand l'art
// dédié arrivera, seule cette table changera.
const KIND_ART = {
  keep: 'watch', market: 'markets', temple: 'ancestral_cult',
  palace: 'ministries', forum: 'courthouses', archive: 'libraries',
  tower: 'universities', station: 'public_works', observatory: 'observatories',
  spire: 'think_tanks', arcology: 'archive_grids', dense: 'guilds',
  grid: 'archive_grids',
};

// Pseudo-tiles mémoïsés par layout : mêmes champs qu'une tuile moteur (le peintre
// et le survol n'y voient que du feu), plus `__district` — le marqueur qui coupe
// le POUSSÉ DE FRONT (une masse civique reste centrée sur son esplanade, elle ne
// se colle pas à la rue comme une échoppe).
let _tiles = null, _tilesAt = -1;
export function districtMassTiles(L) {
  if (!DISTRICT_MASS.on || !L || !L.districts || !L.districts.length) return null;
  const at = CM.layoutRecomputeAt || 0;
  if (_tiles && _tilesAt === at) return _tiles;
  _tiles = L.districts.map((d) => ({
    gx: d.gx, gy: d.gy, spanX: d.size, spanY: d.size,
    type: 'engine',
    buildingId: KIND_ART[d.kind] || 'courthouses',
    __district: d.kind,
  }));
  _tilesAt = at;
  return _tiles;
}

if (typeof window !== 'undefined') {
  window.__districtMass = (on) => {
    DISTRICT_MASS.on = on !== false;
    _tiles = null; _tilesAt = -1;
    return DISTRICT_MASS.on;
  };
}
