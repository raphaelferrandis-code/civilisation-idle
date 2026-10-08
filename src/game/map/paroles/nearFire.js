"use strict";

// LE FEU LE PLUS PROCHE d'un passant (docs/PLAN-ECOUTER-PARLER.md, lots 4 et 5) : une des
// lueurs de feu peintes à la dernière frame (flameGlow.flameFires), ramenée au sol. `W` =
// son point de lueur en monde, ce qui permet de la retrouver frame après frame quelle que
// soit la caméra ; `G` son pied. Le signe du feu le fait monter (signs.js) ; on ne demande
// à voir monter que celui qu'on a sous les yeux (listen.js, les demandes du lot 5).
import { CM } from '../layout.js';
import { screenToWorld } from '../iso/projection.js';
import { flameFires } from '../flameGlow.js';

export function nearestFire(p, fires = flameFires(), reachTiles = 8) {
  if (!p || !fires || !fires.length || !CM.cam) return null;
  const T = CM.TILE || 32, reach = reachTiles * T;
  const fx = p.x + (p.lox || 0), fy = p.y + (p.loy || 0);
  let best = null, bd = Infinity;
  for (const g of fires) {
    const W = screenToWorld(g.x, g.y);
    // La lueur est à mi-flamme : son pied est un peu plus bas à l'écran, plus au sud.
    const G = screenToWorld(g.x, g.y + g.r * 0.4);
    const d = Math.hypot(G.x - fx, G.y - fy);
    if (d < bd && d <= reach) { bd = d; best = { W, G, r: g.r }; }
  }
  return best;
}
