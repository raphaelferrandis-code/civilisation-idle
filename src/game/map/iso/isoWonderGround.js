// LE PARVIS DES MERVEILLES, comme ENSEMBLE DE CELLULES.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Deux consommateurs le lisent : le
// sol, qui y pose un dallage dédié, et la forêt sauvage, qui refuse d'y planter des
// arbres. Le second devait donc importer depuis le premier — un cycle. Ce module
// coupe la question : il ne dépend que du layout.
//
// ⚠ Ce n'est PAS le peintre du parvis (`drawWonderPaving`), resté dans isoRenderer
// avec la machinerie de tuiles dont il dépend. Ici, seulement : la config, l'ensemble
// effectif des cellules, et la molette qui les pilote.
import { CM, CM_WONDERS, cmWonderSlot, cmForEachWonderCell } from '../layout.js';

export const WONDER_GROUND = { on: true, tone: [227, 206, 176], pave: 4, joint: 0, rim: 1.10, tileAlpha: 1 };

// Ensemble effectif des cellules-parvis : celui du layout, PLUS l'emprise de la
// merveille en APERÇU (__showWonder force le rendu sans recalcul du plan — le
// parvis suit pour que l'aperçu soit fidèle). Mémoïsé par (layout, id d'aperçu).
export function wonderGroundSet(L) {
  const pv = CM.previewWonder;
  if (!pv) return L.wonderGround || null;
  // Le RANG entre dans la clé de mémoïsation : __showWonder(id, rang) change
  // l'emprise sans recalculer le plan, et le cache renvoyait l'ancienne taille.
  const sig = (CM.layoutRecomputeAt || 0) + ':' + pv.id + ':' + pv.tier;
  const cache = CM._pvWonderGround;
  if (cache && cache.sig === sig) return cache.set;
  const set = new Set(L.wonderGround || []);
  const wi = CM_WONDERS.findIndex((w) => w.id === pv.id);
  if (wi >= 0 && pv.id !== 'era_mega' && L.gridN) {
    const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
    cmForEachWonderCell(slot, pv.id, L.gridN, (gx, gy, k) => set.add(k), pv.tier);
  }
  CM._pvWonderGround = { sig, set };
  return set;
}
if (typeof window !== 'undefined') {
  window.__wonderGround = (arg) => {
    if (arg === false) WONDER_GROUND.on = false;
    else if (arg && typeof arg === 'object') { WONDER_GROUND.on = true; Object.assign(WONDER_GROUND, arg); }
    else WONDER_GROUND.on = true;
    CM._isoGroundBake = null;
    return { ...WONDER_GROUND };
  };
}
