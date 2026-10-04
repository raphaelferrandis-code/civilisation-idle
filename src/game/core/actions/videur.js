"use strict";

// LE VIDEUR DU VINGT-ET-UN (2026-10-04, lot 4 de docs/PLAN-NUIT-DES-PLAISIRS.md). Le
// sabot garde ses cartes d'une main à l'autre (blackjack.js) : le joueur attentif peut
// COMPTER — un sabot riche en 10 et en As favorise le joueur, et le compteur mise gros
// quand le compte monte. La Maison le sait. À chaque donne, elle rapporte la mise à la
// mise HABITUELLE du joueur (la médiane de ses dernières mises) et la range selon le
// vrai compte du sabot : sabot RICHE (vrai compte ≥ VIDEUR_COMPTE) ou PAUVRE (≤ 0). Elle
// tient la moyenne glissante de chacune ; le SOUPÇON est leur rapport. Un joueur qui
// varie ses mises au hasard, ou selon ses gains, mise autant des deux côtés (soupçon
// ≈ 1) ; un compteur mise bien plus sur les sabots riches. Au seuil VIDEUR_OEIL, le chef
// de salle a l'œil sur le joueur ; au seuil VIDEUR_PORTE, il est AVERTI une fois (l'œil
// toujours), et s'il continue, le videur le raccompagne : la
// table lui est fermée VIDEUR_BANNI_MIN minutes, et la Maison bat un sabot neuf. Un
// compteur DISCRET (un petit écart de mises) passe sous le radar — et gagne peu.
// Le soupçon et la porte vivent dans la sauvegarde ; les automatisations jouent leurs
// mains à part, sans sabot ni soupçon.

import { state } from '../state.js';
import {
  VIDEUR_MEMOIRE, VIDEUR_COMPTE, VIDEUR_LISSAGE, VIDEUR_ECHANTILLON, VIDEUR_OEIL, VIDEUR_PORTE, VIDEUR_BANNI_MIN
} from '../balance.js';
import { chronicle } from './utils.js';

const MIN = 60 * 1000;

export function videurBarre(now = Date.now()) {
  return (Number(state.bjBarreJusqua) || 0) > now;
}

// Les minutes avant de pouvoir revenir à la table (0 si elle est ouverte).
export function videurBarreMin(now = Date.now()) {
  if (!videurBarre(now)) return 0;
  return Math.max(1, Math.ceil(((Number(state.bjBarreJusqua) || 0) - now) / MIN));
}

// Le chef de salle a-t-il l'œil sur le joueur ?
export function videurOeil() {
  return (Number(state.bjSoupcon) || 0) >= VIDEUR_OEIL || !!state.bjAverti;
}

function mediane(xs) {
  if (!xs.length) return 0;
  const a = xs.slice().sort((p, q) => p - q), k = Math.floor(a.length / 2);
  return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2;
}

// La moyenne glissante d'un côté ({ m, n }), nourrie d'une mise relative `r`.
function nourrir(o, r) {
  const p = o && Number(o.n) > 0 ? o : null;
  return p ? { m: p.m + VIDEUR_LISSAGE * (r - p.m), n: p.n + 1 } : { m: r, n: 1 };
}

// Observe une mise AVANT la donne, au vrai compte `tc` du sabot. Rend 'porte' si le
// joueur est raccompagné (la donne n'a pas lieu), 'oeil' s'il est surveillé, null sinon.
export function observerMise(mise, tc, now = Date.now()) {
  const mises = Array.isArray(state.bjMises) ? state.bjMises.filter((x) => Number.isFinite(x) && x > 0) : [];
  const base = mediane(mises);
  state.bjMises = [...mises, mise].slice(-VIDEUR_MEMOIRE);
  // Il faut une habitude pour qu'une mise y fasse un écart : cinq mises au moins.
  if (mises.length < 5 || !(base > 0)) return videurOeil() ? 'oeil' : null;
  const r = mise / base;
  if (tc >= VIDEUR_COMPTE) state.bjHaut = nourrir(state.bjHaut, r);
  else if (tc <= 0) state.bjBas = nourrir(state.bjBas, r);
  const h = state.bjHaut, b = state.bjBas;
  const s = h && b && h.n >= VIDEUR_ECHANTILLON && b.n >= VIDEUR_ECHANTILLON ? h.m / Math.max(0.01, b.m) : 1;
  state.bjSoupcon = s;
  // Calmé : l'avertissement tombe.
  if (s < VIDEUR_OEIL) state.bjAverti = false;
  // Au seuil, une fois : l'avertissement (l'œil), la donne a lieu.
  if (s >= VIDEUR_PORTE && !state.bjAverti) {
    state.bjAverti = true;
    return 'oeil';
  }
  // Averti, il recommence : une nouvelle grosse mise sur un sabot riche.
  if (s >= VIDEUR_PORTE && tc >= VIDEUR_COMPTE && r >= 2) {
    state.bjBarreJusqua = now + VIDEUR_BANNI_MIN * MIN;
    state.bjSoupcon = 0;
    state.bjAverti = false;
    state.bjMises = [];
    state.bjHaut = null;
    state.bjBas = null;
    chronicle("Le videur te raccompagne à la porte de la salle du vingt-et-un : à la Maison, on n'aime pas les compteurs de cartes.");
    return 'porte';
  }
  return videurOeil() ? 'oeil' : null;
}
