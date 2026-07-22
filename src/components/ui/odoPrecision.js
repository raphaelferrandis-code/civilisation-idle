// Précision « lisible » du cadran (OdometerNumber) : le nombre de décimales de
// la mantisse est choisi d'après le VRAI débit de la ressource.
//
// Pourquoi : un compteur ne donne la sensation de monter que si le chiffre qui
// bouge bouge à un rythme que l'œil suit. À précision FIXE, le même cadran est
// tantôt mort (gros stock, petit débit : les décimales affichées ne changent
// plus) tantôt illisible (l'inverse). Les deux rustines qui « animaient » ces
// cas — rouleau 0-9 à vitesse constante, filet des deux derniers chiffres —
// affichaient des chiffres qui n'étaient PAS la valeur : ça se voit, et un
// compteur qui ment frustre au lieu de récompenser.
//
// Ici le cadran n'affiche que des chiffres vrais ; c'est la précision qui
// s'adapte pour qu'il y en ait toujours un qui tourne à bonne allure.

// Chiffres affichables (point et suffixe exclus). 6 = le budget de largeur
// d'avant (123.456K) : la police auto-dimensionnée de la topbar ne rétrécit
// donc jamais plus qu'aujourd'hui.
export const MAX_SLOTS = 6;

// Basculements par seconde visés sur le dernier chiffre. La précision étant
// entière, le rythme obtenu tombe dans [0.5, 5] par seconde selon l'arrondi —
// jamais figé, jamais un moulin.
export const TARGET_FLIPS = 1.6;

// Bande morte de l'hystérésis : tant que le rythme reste dedans, on ne
// retouche pas la forme du cadran (plus large que la plage atteignable pour
// qu'une simple fluctuation de débit ne déclenche rien).
export const BAND_LOW = 0.4;
export const BAND_HIGH = 8;

// Un changement de forme re-monte le cadran (toutes les colonnes claquent, la
// police se recalcule) : il faut que la sortie de bande dure, et qu'on ne
// recale pas deux fois coup sur coup.
export const SETTLE_MS = 2000;
export const COOLDOWN_MS = 5000;

// Cadran sans débit (production nulle, crise, valeur de prévisualisation) :
// rien ne peut bouger, alors on se cale sur la précision du format compact du
// jeu (fmtShort) — un cadran immobile ressemble aux autres nombres de l'écran
// au lieu d'afficher une précision qui ne sert à rien.
// ⚠ Recopie À LA MAIN la règle de mantisse de formatCompactNumber (utils.js) :
// ce module n'importe RIEN, pour rester une feuille testable sans le moteur.
// Depuis B12 la mantisse tient en 3 chiffres significatifs, donc la précision
// décroît d'un cran par chiffre entier gagné — 8.70K / 87.0K / 870K sous suffixe,
// 8.7 / 87 / 870 sans. Toute retouche de utils.js:61 doit repasser ici.
export function staticDecimals(div, intLen) {
  const base = div > 1 ? 2 : 1;
  const dec = base - (intLen - 1);
  return Math.max(0, Math.min(dec, MAX_SLOTS - intLen));
}

// Basculements/s du dernier chiffre : un pas de cadran vaut div / 10^dec
// unités brutes.
export function flipsPerSecond(rate, div, dec) {
  if (!(rate > 0) || !(div > 0)) return 0;
  return (rate * Math.pow(10, dec)) / div;
}

// Précision idéale pour ce débit, bornée par la largeur restante.
//
// Un cas ne rentre pas dans le budget : quand le stock représente plus d'une
// cinquantaine d'heures de production (héritage massif, ressource qu'on ne
// produit plus), même la précision maximale ne fait pas bouger le dernier
// chiffre. On ne déroule alors PAS une traîne de zéros figés pour faire
// semblant — on affiche un nombre court et net, et c'est la ligne « /s » sous
// la valeur qui dit la production. Un cadran immobile parce que le stock
// écrase le débit est une information juste, pas une panne.
export function idealDecimals(rate, div, intLen) {
  const max = Math.max(0, MAX_SLOTS - intLen);
  const stat = staticDecimals(div, intLen);
  if (!(rate > 0) || !(div > 0) || !Number.isFinite(rate)) return stat;
  const ideal = Math.round(Math.log10((TARGET_FLIPS * div) / rate));
  if (!Number.isFinite(ideal)) return stat;
  if (ideal > max && flipsPerSecond(rate, div, max) < BAND_LOW) return stat;
  return Math.max(0, Math.min(max, ideal));
}

/**
 * Réducteur d'hystérésis (pur) : renvoie l'état de précision suivant.
 * `state` = { dec, div, since, changedAt } — `since` = début de la sortie de
 * bande (0 = dans la bande), `changedAt` = dernier recalage.
 *
 * Recalage IMMÉDIAT quand la forme change de toute façon : franchissement de
 * palier (K→M, div différent) ou chiffre entier de plus qui pousse les
 * décimales hors du budget de largeur. Sinon il faut SETTLE_MS hors bande et
 * COOLDOWN_MS depuis le dernier recalage.
 */
export function reconcilePrecision(state, { rate, div, intLen, now }) {
  const max = Math.max(0, MAX_SLOTS - intLen);
  const ideal = idealDecimals(rate, div, intLen);
  if (state.div !== div || state.dec > max) {
    return { dec: ideal, div, since: 0, changedAt: now };
  }
  // Débit nul : plus rien ne bouge, on fige la forme telle quelle (sinon le
  // cadran se recalerait pile au moment où la cité se met en pause).
  if (!(rate > 0)) return state.since ? { ...state, since: 0 } : state;

  const flips = flipsPerSecond(rate, div, state.dec);
  if (flips >= BAND_LOW && flips <= BAND_HIGH) {
    return state.since ? { ...state, since: 0 } : state;
  }
  const since = state.since || now;
  if (now - since < SETTLE_MS || now - state.changedAt < COOLDOWN_MS) {
    return state.since === since ? state : { ...state, since };
  }
  return { dec: ideal, div, since: 0, changedAt: now };
}
