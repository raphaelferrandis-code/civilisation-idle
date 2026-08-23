"use strict";
// LE RELIEF — l'unité, et les altitudes qui s'en déduisent.
//
// Lot 1 de `docs/PLAN-RELIEF.md` (2026-08-23). Le fleuve s'enfonce : sa nappe descend
// sous le niveau du sol, et la berge devient une vraie marche au lieu d'un autocollant.
//
// ⚠⚠ L'UNITÉ EST `T/4`, ET RIEN D'AUTRE (§ 2.1 du plan, non re-litigable). Une marche
// qui n'est pas un multiple entier de `T/4` rouvre la couture entre losanges — le sol
// est bâti sur cette grille, et un décalage fractionnaire y laisse un liseré d'un pixel
// qui court sur toute la rive. Les altitudes sont donc des ENTIERS d'unités.
//
// ⚠ LA VILLE RESTE À L'ALTITUDE 0 (§ 3, décision de Raph, non re-litigable). Ce module
// ne porte que ce qui descend SOUS elle, ou monte HORS d'elle.
//
// ⚠ Convention d'altitude, celle du pont (`bridgeLiftWorld`) : une ALTITUDE est un
// nombre de px MONDE positif vers le HAUT, qu'on passe en 3e argument de la projection
// — c'est elle qui applique le zoom et qui SOUSTRAIT pour monter. La projection iso
// n'écrase pas la verticale : un pas d'altitude vaut un pas d'écran.
import { CM } from '../layout.js';

// `water` = profondeur de la nappe, en unités. **0 = l'état d'avant le lot 1**, au
// pixel près — c'est la molette qui rejoue l'ancien rendu, et le défaut tant que Raph
// n'a pas tranché sur pièces. Le plan vise −3 U.
export const RELIEF = { water: 0 };

// Un pas de relief, en px MONDE. Lu à chaque appel : `CM.TILE` peut changer.
export function reliefUnit() { return CM.TILE / 4; }

// ALTITUDE de la nappe, en px MONDE, à passer en 3e argument de `worldToScreen`.
// NÉGATIVE : l'eau est SOUS le sol. C'est la forme à préférer partout où l'on projette
// un POINT — l'axe fait le reste, et on ne peut plus oublier de l'appliquer.
export function waterZ() {
  const w = RELIEF.water | 0;
  return w > 0 ? -w * reliefUnit() : 0;
}

// Décalage ÉCRAN de la nappe, en px. ⚠ CE N'EST PAS UNE POSITION MAIS UNE HAUTEUR : il
// sert à ceux qui ont besoin de la TAILLE de la marche, pas de l'endroit où elle est —
// le parement de quai, qui pend de cette hauteur, et la face de berge, tendue entre
// deux bords. Un point qui se PROJETTE doit passer par `waterZ()` et l'axe, jamais par
// ceci : c'est la distinction qui empêche les rustines de revenir.
export function waterSinkPx() {
  const w = RELIEF.water | 0;
  return w > 0 ? w * reliefUnit() * CM.cam.zoom : 0;
}

// ⚠⚠ FRAGMENT DE CLÉ DE BAKE — le piège n° 1 du plan, qui a déjà mordu ce projet TROIS
// fois (plage gelée, bas-fond de quai, saison). Le relief entre dans le sol cuit ET
// dans le cache de crans : sans ce fragment dans `key` ET dans `cacheBase`, changer la
// profondeur laisserait un sol d'avant, et la molette paraîtrait sans effet.
// Vide quand le relief est à 0 : les clés d'avant le lot 1 restent identiques, donc
// aucun cache existant n'est invalidé pour rien.
export function reliefKey() {
  const w = RELIEF.water | 0;
  return w > 0 ? ':rl1.' + w : '';
}

// Matière de la FACE DE BERGE NATURELLE — deux assises, haut clair vers bas sombre,
// exactement la lecture de profondeur du parement de quai (cf. quaysAndRiot). Terre et
// roche mouillée, jamais de la pierre taillée : c'est une berge, pas un ouvrage.
export const BANK_FACE = { on: true, top: '#7a6a52', bot: '#4a3f31' };

if (typeof window !== 'undefined') {
  // __relief({ water: 3 }) enfonce la nappe de 3 unités. __relief({ water: 0 }) rejoue
  // l'état d'avant. Invalide le sol cuit ET le cache de crans (cf. reliefKey).
  window.__relief = (o) => {
    if (o && typeof o === 'object') Object.assign(RELIEF, o);
    CM._isoGroundBake = null;
    CM._groundZoomCache = null;
    return { ...RELIEF, unitePx: reliefUnit(), decalageEcran: waterSinkPx() };
  };
}
