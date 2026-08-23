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

// ── LA GRÈVE EN PENTE ────────────────────────────────────────────────────────
// La TROISIÈME situation du bord de l'eau, et la seule qui n'avait rien. Mesuré le
// 2026-08-24, `water: 3`, bande 4 : là où le quai maçonne, le parement fait la face ;
// là où la berge est nue, `BANK_FACE` la fait ; **là où c'est du SABLE, il n'y avait
// aucune face** — la grève s'arrêtait à plat sur le bleu, ce qui est exactement le
// grief « le fleuve est un autocollant » du plan.
//
// ⚠⚠ ET UNE FACE VERTICALE SERAIT FAUSSE ICI. Une berge de terre se casse net, une
// grève NON : elle descend. Elle a donc besoin d'une EMPRISE HORIZONTALE, que les deux
// autres faces n'ont pas — d'où `run`, pris vers l'intérieur des terres, sur le sable
// sec déjà cuit au sol. La pente s'y creuse au lieu de s'ajouter par-dessus.
//
// ⚠ SOUS-MARCHES, pas rampe lisse (§ lot 1 du plan) : les altitudes sont des entiers
// d'unités (cf. `reliefUnit`), une rampe continue rouvrirait le demi-pixel que l'unité
// `T/4` existe pour fermer. `steps` marches = `steps` contremarches assombries séparées
// par des replats de sable — le relief se lit par la GÉOMÉTRIE, pas par un dégradé.
export const GREVE = {
  on: true,
  // Emprise de la pente vers l'intérieur, en TUILES.
  //
  // ⚠⚠ EN ISO, UNE TUILE DE RETRAIT NE VAUT QU'UN QUART DE TUILE DE HAUTEUR D'ÉCRAN :
  // la verticale n'est pas écrasée par la projection, l'horizontale l'est (`ISO_Y` =
  // 0,25). Une pente de `run` tuiles contre un enfoncement de `water` unités sort donc
  // à `run / water` fois la pente d'un 45° — à `run: 1,2` et `water: 3` elle était 2,5
  // fois trop raide et se lisait comme un mur de sable, pas comme une grève.
  // ⚠ ET ON NE PEUT PAS L'ADOUCIR BEAUCOUP PLUS : `river.banks` ne contient que les
  // cellules qui TOUCHENT l'eau, donc la grève cuite fait UNE cellule de profondeur.
  // Au-delà de ~2 tuiles la pente déborde sur le pavé de la ville. Une grève vraiment
  // douce demanderait d'élargir la plage elle-même, ce qui est une décision de Raph.
  run: 2,
  steps: 2,
  // Assombrissement d'une contremarche. Les REPLATS ne sont pas teintés : ce sont des
  // surfaces horizontales de sable, elles prennent la lumière comme le sol — seule la
  // contremarche est une face, et c'est elle qui doit se voir.
  riser: 0.32,
};

if (typeof window !== 'undefined') {
  // __relief({ water: 3 }) enfonce la nappe de 3 unités. __relief({ water: 0 }) rejoue
  // l'état d'avant. Invalide le sol cuit ET le cache de crans (cf. reliefKey).
  window.__relief = (o) => {
    if (o && typeof o === 'object') Object.assign(RELIEF, o);
    CM._isoGroundBake = null;
    CM._groundZoomCache = null;
    return { ...RELIEF, unitePx: reliefUnit(), decalageEcran: waterSinkPx() };
  };
  // __bankFace({ on:false }) coupe la face, ({ top:'#f0f' }) la teint pour la LOCALISER
  // dans une capture. Aucun bake à invalider : la face est peinte dans la passe vive.
  window.__bankFace = (o) => { if (o && typeof o === 'object') Object.assign(BANK_FACE, o); return { ...BANK_FACE }; };
  // __greve({ run, steps, riser, on }) — pente vive, aucun bake à invalider.
  window.__greve = (o) => { if (o && typeof o === 'object') Object.assign(GREVE, o); return { ...GREVE }; };
}
