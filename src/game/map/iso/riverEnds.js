"use strict";
// ── LES BOUTS DU FLEUVE, PROLONGÉS ───────────────────────────────────────────
//
// Le cours d'eau du layout (`L.river.samples`) s'arrête à cx ± 1,8 N ; à l'écran,
// il continue tout droit dans l'axe de ses derniers samples (isoRiver,
// riverDrawPts), pour qu'on n'en voie jamais le bout. Ces deux demi-droites
// doivent être CONNUES de ce qui pose des choses sur l'herbe : sans elles, la
// forêt sauvage plantait ses arbres en pleine rivière (vu le 2026-09-29 à la
// première capture du prolongement).
//
// Module PUR, sans import : le fleuve et la forêt en dépendent tous deux, et
// aucun des deux ne doit dépendre de l'autre.

// Les deux demi-droites : origine au bout, direction SORTANTE (dans l'axe du
// dernier segment), demi-largeur du bout, pas d'échantillonnage du bout.
export function riverEndRays(core) {
  const n = core ? core.length : 0;
  if (n < 2) return [];
  const ray = (P, Q) => {
    const dx = P.x - Q.x, dy = P.y - Q.y, l = Math.hypot(dx, dy) || 1;
    return { x: P.x, y: P.y, ux: dx / l, uy: dy / l, hw: P.hw || 2, step: Math.max(0.5, l) };
  };
  return [ray(core[0], core[1]), ray(core[n - 1], core[n - 2])];
}

// Le point (px, py) est-il à moins de `hw + pad` d'une des demi-droites, AU-DELÀ
// de son bout ? (En deçà, c'est le fleuve du layout, déjà connu de tous.)
export function nearRiverEndRay(rays, px, py, pad = 0) {
  for (const r of rays) {
    const dx = px - r.x, dy = py - r.y;
    const t = dx * r.ux + dy * r.uy;
    if (t <= 0) continue;
    const cx = dx - t * r.ux, cy = dy - t * r.uy;
    const lim = r.hw + pad;
    if (cx * cx + cy * cy <= lim * lim) return true;
  }
  return false;
}
