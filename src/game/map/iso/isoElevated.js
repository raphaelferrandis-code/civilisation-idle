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
import { metroActors } from './isoMetro.js';
import { floatIsleActors } from './isoFloatIsle.js';

// LA CHUTE DES ÉTAGES (lot 4) : 0 = ville debout ; ~0,65 = ville en ruine (usure,
// instabilité au maximum : CM.frameRuined) ; 1 = effondrement en cours
// (CM.collapseAt). Les étages tombent en premier : trafic éteint, tronçons brisés,
// îlot qui descend vers l'eau. Lu par chaque étage.
export function elevDecay() {
  if (CM.collapseAt) return 1;
  return CM.frameRuined ? 0.65 : 0;
}

const _out = [];
export function elevatedActors(now) {
  _out.length = 0;
  if (!CM.layout || CM.lodActive) return _out;
  try {
    const decay = elevDecay();
    highwayActors(now, _out, decay);
    metroActors(now, _out, decay);
    floatIsleActors(now, _out, decay);
    skyTrafficActors(now, _out, decay);
  } catch (e) {
    // Un étage qui plante ne doit jamais emporter la frame de la carte.
    if (!CM._elevErr) { CM._elevErr = true; console.warn('étages', e); }
  }
  return _out;
}
