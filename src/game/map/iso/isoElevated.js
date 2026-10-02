"use strict";
// ── LES ÉTAGES DE LA VILLE — point d'entrée unique (docs/PLAN-ETAGES.md) ──────
//
// Tout ce qui vit AU-DESSUS du sol — trafic aérien, viaducs, métro — passe par ici.
// Un seul branchement dans la collecte du peintre (isoLiveCollect, kind 'elev') et
// un seul dans la peinture (isoLivePaint) : chaque lot ajoute son fournisseur dans
// la liste ci-dessous, sans retoucher le peintre.
//
// Contrat d'un acteur (le même que la petite vie) : { wx, wy, d?, draw(ctx, now) }.
// `d` imposé quand l'aplomb du point (wx, wy) ne suffit pas (le dessus d'un tablier
// se trie à son coin arrière, sa tranche à son coin avant).
import { CM } from '../layout.js';
import { skyTrafficActors } from './isoSkyTraffic.js';
import { highwayActors } from './isoHighway.js';

const _out = [];
export function elevatedActors(now) {
  _out.length = 0;
  if (!CM.layout || CM.lodActive) return _out;
  try {
    highwayActors(now, _out);
    skyTrafficActors(now, _out);
  } catch (e) {
    // Un étage qui plante ne doit jamais emporter la frame de la carte.
    if (!CM._elevErr) { CM._elevErr = true; console.warn('étages', e); }
  }
  return _out;
}
