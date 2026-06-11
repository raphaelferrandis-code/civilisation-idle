"use strict";
// Frontière numérique Decimal (break_infinity.js).
// Réservé aux valeurs qui croissent sans plafond : ressources principales,
// coûts, ruines, multiplicateurs cumulés. Les jauges bornées (instabilité,
// usure, légitimité, ratios de vitals…) restent des number natifs — créer des
// Decimal dans le hot path du tick pour des valeurs bornées est une perte
// de perf pure.
//
// Règle de précision : sous 2^53 (et plus largement tant qu'un calcul float
// reste fini), on conserve le résultat float bit-à-bit en l'enveloppant dans
// un Decimal. L'arithmétique mantisse/exposant de break_infinity diverge des
// floats dans les derniers ulps (vérifié sur geomSum) : on ne bascule sur ses
// opérations que là où le float déborde (~1.8e308).

import Decimal from "break_infinity.js";

export { Decimal };

// Fil-piège (dev et tests uniquement) : un Decimal coercé en primitif par une
// opération native est presque toujours un bug silencieux — `a > b` compare
// des strings (lexicographique !), `a + x` concatène, `Math.max(a, x)` produit
// du NaN au-delà du float. On fait donc échouer bruyamment à la source.
// String(decimal), `${decimal}` côté affichage volontaire et JSON.stringify
// restent interdits aussi par ce piège quand ils passent par valueOf — utiliser
// fmt()/.toString()/toJSON, qui n'y passent pas. Inactif en production : la
// coercition y reste un filet de sécurité dégradé plutôt qu'un crash.
if (import.meta.env?.DEV) {
  Decimal.prototype.valueOf = function () {
    throw new TypeError(
      "Decimal coercé en primitif natif (+, -, <, >=, Math.*, `${}`). " +
      "Utilise .add/.sub/.mul/.div, .gt/.gte/.lt/.lte, ou toNum()/fmt() — voir src/game/core/num.js."
    );
  };
}

// Convertit toute valeur (Decimal, number, string sérialisée) en Decimal,
// sans réallocation si c'en est déjà un. Valeur invalide → 0.
export function D(value) {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Decimal(value) : new Decimal(0);
  }
  if (typeof value === "string" && value) {
    const parsed = new Decimal(value);
    return Number.isFinite(parsed.mantissa) ? parsed : new Decimal(0);
  }
  return new Decimal(0);
}

// Ramène une valeur potentiellement Decimal vers un number natif.
// Au-delà de ~1.8e308 le résultat est Infinity : à n'utiliser que pour des
// valeurs bornées par construction (ratios, jauges) ou tolérantes à Infinity.
export function toNum(value) {
  return value instanceof Decimal ? value.toNumber() : Number(value);
}
