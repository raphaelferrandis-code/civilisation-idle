"use strict";

/* ============================================================================
 * helpBubbleCore.js — la part CALCULABLE de l'infobulle unique (B1).
 *
 * Séparé de HelpBubble.jsx pour deux raisons, pas une seule de confort :
 *   - le dépôt n'a ni jsdom ni testing-library, aucun composant React n'est
 *     monté dans les 82 fichiers de test. Ce qui vit dans un .jsx n'est donc
 *     testable qu'en important le module entier, React compris ;
 *   - une constante exportée depuis un .jsx casse le rafraîchissement à chaud
 *     (react-refresh/only-export-components).
 *
 * Ici : aucune dépendance, aucun accès au DOM. On reçoit des nombres, on rend
 * des nombres. Le .jsx garde les écouteurs et le rendu.
 * ==========================================================================*/

// Le survol n'ouvre pas au quart de tour : traverser un panneau dense allumait
// une bulle par élément touché au passage. 120 ms suffisent à distinguer « je
// survole » de « je traverse ».
export const OPEN_DELAY_MS = 120;

// ... SAUF si le joueur vient d'en fermer une : il lit une rangée après l'autre,
// et lui réimposer le délai à chaque saut donne une interface qui traîne.
export const REOPEN_GRACE_MS = 400;

// Cadence du contrôle de survie de la cible (voir tipStillAlive). Assez lent
// pour ne rien coûter, assez rapide pour qu'une bulle orpheline ne se voie pas.
export const ALIVE_POLL_MS = 250;

export const BUBBLE_WIDTH = 280;
export const BUBBLE_MARGIN = 8;   // marge minimale au bord de l'écran
export const BUBBLE_GAP = 10;     // écart entre la cible et la bulle
export const FLIP_ZONE = 150;     // hauteur sous laquelle on bascule au-dessus

/**
 * Place la bulle sous la cible, ou au-dessus si le bas de l'écran approche.
 * Fonction PURE : le rect et la taille de fenêtre sont passés, jamais lus.
 *
 * `flip` ne déplace pas le point d'ancrage, il dit au CSS d'appliquer
 * translateY(-100%) : le `top` rendu reste le haut de la cible.
 */
export function placeTip(rect, viewportW, viewportH) {
  const maxLeft = viewportW - BUBBLE_WIDTH - 2 * BUBBLE_MARGIN;
  const left = Math.max(BUBBLE_MARGIN, Math.min(rect.left, maxLeft));
  const below = rect.bottom + BUBBLE_GAP;
  if (below > viewportH - FLIP_ZONE) {
    return { left, top: Math.max(BUBBLE_MARGIN, rect.top - BUBBLE_GAP), flip: true };
  }
  return { left, top: below, flip: false };
}

/**
 * Normalise le contenu accepté par tipProps. Trois formes, une seule sortie :
 *   - une chaîne            → { kind: "text" }
 *   - un tableau de lignes  → { kind: "rows" }, chaque ligne { label, value }
 *   - null / vide / que des lignes vides → null, et l'appelant ne pose alors
 *     AUCUN écouteur (c'est le garde-fou d'origine `if (!text) return {}`,
 *     conservé : un libellé absent ne doit pas produire une bulle vide).
 *
 * Les lignes sans `label` ni `value` sont jetées : elles viennent des appels
 * conditionnels (`cond && { label, value }`), qui rendent false ou undefined.
 */
export function normalizeTipContent(value) {
  if (value == null || value === false) return null;
  if (Array.isArray(value)) {
    const rows = value
      .filter((row) => row && typeof row === "object")
      .map((row) => ({ label: String(row.label ?? ""), value: String(row.value ?? "") }))
      .filter((row) => row.label !== "" || row.value !== "");
    return rows.length ? { kind: "rows", rows } : null;
  }
  const text = String(value);
  return text.trim() === "" ? null : { kind: "text", text };
}

/**
 * Délai d'ouverture à appliquer maintenant. Voir REOPEN_GRACE_MS.
 * `lastHideAt` vaut 0 tant qu'aucune bulle n'a été fermée dans la session.
 */
export function openDelayFor(now, lastHideAt) {
  if (!lastHideAt) return OPEN_DELAY_MS;
  return now - lastHideAt < REOPEN_GRACE_MS ? 0 : OPEN_DELAY_MS;
}

/**
 * La cible est-elle toujours à l'écran ? C'est le correctif de la BULLE
 * ORPHELINE (audit 2026-07-21) : tipProps ne pose que onMouseLeave et onBlur,
 * or un démontage de la cible ne tire NI l'un NI l'autre. Une bulle survivait
 * donc à la fermeture d'un dialogue par Échap, seule au milieu de l'écran.
 * Le montage global de la couche aggrave le cas, puisqu'elle ne se démonte
 * plus en changeant de vue.
 *
 * `isConnected` est le seul signal fiable : un élément retiré de l'arbre le
 * passe à false, même s'il reste référencé par la fermeture d'un écouteur.
 */
export function tipStillAlive(el) {
  return Boolean(el && el.isConnected);
}
