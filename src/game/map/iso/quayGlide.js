"use strict";
// ── LE QUAI PENDANT LA RAFALE DE MOLETTE ─────────────────────────────────────
//
// Mesuré chez Raph le 2026-09-14 (sonde de geste, scripts/sondeGeste.js, ville
// mégapole) : pendant un dézoom, le poste `quais` passait de 0 à 55-60 ms PAR
// FRAME, six frames de suite, avec un canvas créé à chaque fois. Cause : la clé
// du bake de quai porte le zoom au millième, et un zoom qui GLISSE (cmCameraGlide)
// change à chaque frame → recuisson intégrale à chaque frame, calque d'art
// réalloué à chaque frame. Le sol, lui, a la règle du lot 3 anti-clignotement :
// « une seule apparence par geste » — compensé pendant la rafale, net à l'arrêt.
// Le quai n'y avait jamais été soumis.
//
// Ici, la même règle, en deux fonctions PURES (testées) :
//   · `quayGlideStale`  — faut-il servir le bake existant étiré plutôt que
//     recuire ? Oui si le bake est ancré à un AUTRE zoom et que la rafale de
//     molette est en cours (horloge `CM._igZoomAt`, posée par le sol dans la
//     même frame, avant les quais).
//   · `quayGlideRect`   — le rectangle de destination du blit compensé : les
//     mêmes maths que la branche « ZOOM en cours » du sol (isoGroundBake.js),
//     échelle zoom/zoomB autour du centre écran, moins le delta de pan.
//
// ⚠ L'horloge de rafale est CELLE DU SOL (ISO_CRISP_SETTLE_MS = 400 ms) : les
// deux calques doivent basculer ensemble, sinon le quai serait net sur un sol
// flou, ou l'inverse — une alternance de plus, pas une de moins.
// A/B : globalThis.__quayGlide = false → recuisson à chaque frame (l'avant).

export const QUAY_GLIDE_SETTLE_MS = 400;   // = ISO_CRISP_SETTLE_MS du sol

// qb : CM._quayBake ({ camX, camY, other, zoomB }) ou null.
export function quayGlideStale(qb, zoom, nowMs, zoomAt, settleMs = QUAY_GLIDE_SETTLE_MS) {
  if (!qb || qb.zoomB == null || qb.other === '__unstable__') return false;
  if (qb.zoomB === zoom) return false;
  return nowMs - (zoomAt || 0) < settleMs;
}

// Rectangle écran du bake étiré. cw/ch = écran, M = marge de bake, pd = delta de
// pan projeté (bake → caméra courante, en px écran au zoom courant).
export function quayGlideRect(zoom, zoomB, cw, ch, M, pd) {
  const s = zoom / zoomB;
  const cx = cw / 2, cy = ch / 2;
  return {
    x: cx - s * (cx + M) - pd.x,
    y: cy - s * (cy + M) - pd.y,
    w: (cw + 2 * M) * s,
    h: (ch + 2 * M) * s,
  };
}
