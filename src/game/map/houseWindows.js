// ── LES FENÊTRES ALLUMÉES LA NUIT ────────────────────────────────────────────
// docs/PLAN-MAQUETTE-VIVANTE.md, lot 4 (audit du 2026-09-30 : « la nuit est belle mais
// AUCUNE fenêtre n'est allumée »). Repris de la branche `passe-visuelle-21-09`, où il
// avait été posé le 2026-09-21 sans verdict de Raph.
//
// Les fenêtres d'une maison sont RELEVÉES À LA MAIN, dessin par dessin
// (houseWindowsData.js, 2026-10-03, Raph : « les lumières arrivent n'importe où sur les
// bâtiments »). Pas de halo diffus, aucune modification de l'art. La lumière est déposée
// dans le calque de lumière (lightLayer) : elle s'ajoute APRÈS le voile de nuit, comme
// celle des lampadaires, et deux fenêtres sur cinq s'allument — une phase par maison,
// donc jamais le même motif d'une façade à la voisine.
//
// L'ancien DÉTECTEUR de taches sombres (windowPixels, avec fillPane) est retiré : il
// prenait l'ardoise d'un toit, l'ombre d'une colonne ou le creux d'un colombage pour une
// vitre. Les bâtiments-moteur sont relevés à la main eux aussi (sceneWindowsData.js).
import { CM, cmHash } from './layout.js';
import { lightCtx } from './lightLayer.js';
import { HOUSE_WINDOWS } from './houseWindowsData.js';

const masks = new Map();   // "clé:ox:oy:w:h:phase" → canevas | null

// Fenêtres allumées d'une maison pour une phase : rectangle par rectangle, dans le repère
// de la source dessinée (`ox`, `oy` = coin de la boîte d'encre dans le PNG de base — la
// variante teintée est recadrée sur cette boîte, cf. pixelHouses.pixelHouseGeom). Ne
// dépend ni de la teinte ni de la neige : le masque est partagé par toutes.
function maskFor(key, wins, ox, oy, w, h, phase) {
  const id = `${key}:${ox}:${oy}:${w}:${h}:${phase}`;
  if (masks.has(id)) return masks.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(244, 168, 72, 0.824)';   // 210/255, la lumière de toujours
  let count = 0;
  wins.forEach((rects, index) => {
    if ((index * 7 + phase * 3) % 5 > 1) return;
    count += 1;
    for (let i = 0; i < rects.length; i += 4) ctx.fillRect(rects[i] - ox, rects[i + 1] - oy, rects[i + 2], rects[i + 3]);
  });
  const result = count ? canvas : null;
  masks.set(id, result);
  return result;
}

export function drawHouseWindows(t, g) {
  const night = Math.max(0, Math.min(1, ((CM.nightF || 0) - 0.22) / 0.65));
  if (!night || CM.lodActive || typeof document === 'undefined') return;
  // Par CLÉ DE SPRITE, pas par variante : un skin d'ère est un autre dessin.
  const wins = HOUSE_WINDOWS[g.key];
  if (!wins) return;
  // ⚠ cmHash est SIGNÉ : sans `>>> 0`, une phase négative allumait trois fenêtres sur
  // cinq au lieu de deux.
  const phase = (cmHash(`windows:${t.gx}:${t.gy}`) >>> 0) % 5;
  const mask = maskFor(g.key, wins, g.ox ?? g.bb.x0, g.oy ?? g.bb.y0, g.bb.w, g.bb.h, phase);
  if (!mask) return;
  const ctx = lightCtx(g.dx, g.dy, g.dx + g.dw, g.dy + g.dh);
  if (!ctx) return;
  ctx.save();
  ctx.globalAlpha = night * 0.72 * CM.ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mask, g.dx, g.dy, g.dw, g.dh);
  ctx.restore();
}
