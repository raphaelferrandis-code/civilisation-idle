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
import { LIGHT_LAYER, lightCtx, litBox } from './lightLayer.js';
import { HOUSE_WINDOWS } from './houseWindowsData.js';

const masks = new Map();   // "clé:ox:oy:w:h:phase" → { cv, u0, v0, u1, v1 } | null

// Fenêtres allumées d'une maison pour une phase : rectangle par rectangle, dans le repère
// de la source dessinée (`ox`, `oy` = coin de la boîte d'encre dans le PNG de base — la
// variante teintée est recadrée sur cette boîte, cf. pixelHouses.pixelHouseGeom). Ne
// dépend ni de la teinte ni de la neige : le masque est partagé par toutes.
// (u0, v0)-(u1, v1) = boîte des vitres allumées dans le masque (audit du 2026-10-05,
// PERF-2) : le masque a la taille de la maison entière, et son emprise faisait payer une
// découpe à tout ce qui passait devant le TOIT. Cf. lightLayer.litBox.
function maskFor(key, wins, ox, oy, w, h, phase) {
  const id = `${key}:${ox}:${oy}:${w}:${h}:${phase}`;
  if (masks.has(id)) return masks.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(244, 168, 72, 0.824)';   // 210/255, la lumière de toujours
  let count = 0, u0 = w, v0 = h, u1 = 0, v1 = 0;
  wins.forEach((rects, index) => {
    if ((index * 7 + phase * 3) % 5 > 1) return;
    count += 1;
    for (let i = 0; i < rects.length; i += 4) {
      const rx = rects[i] - ox, ry = rects[i + 1] - oy;
      ctx.fillRect(rx, ry, rects[i + 2], rects[i + 3]);
      // Bornée au canevas, qui rogne les vitres de la même façon.
      u0 = Math.min(u0, Math.max(0, rx)); v0 = Math.min(v0, Math.max(0, ry));
      u1 = Math.max(u1, Math.min(w, rx + rects[i + 2])); v1 = Math.max(v1, Math.min(h, ry + rects[i + 3]));
    }
  });
  const result = count ? { cv: canvas, u0, v0, u1: Math.max(u0, u1), v1: Math.max(v0, v1) } : null;
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
  // Audit du 05/10 (PERF-21) : la phase (un hachage) et la clé du masque (une chaîne)
  // se refaisaient pour chaque maison à chaque frame de nuit. Gardées sur la tuile ; le
  // masque n'est recherché que si le dessin ou son cadre changent.
  const ox = g.ox ?? g.bb.x0, oy = g.oy ?? g.bb.y0, w = g.bb.w, h = g.bb.h;
  let m = t._winM;
  if (!m || m.gx !== t.gx || m.gy !== t.gy) {
    m = t._winM = { gx: t.gx, gy: t.gy, phase: (cmHash(`windows:${t.gx}:${t.gy}`) >>> 0) % 5, key: null, ox: 0, oy: 0, w: 0, h: 0, mask: null };
  }
  if (m.key !== g.key || m.ox !== ox || m.oy !== oy || m.w !== w || m.h !== h) {
    m.mask = maskFor(g.key, wins, ox, oy, w, h, m.phase);
    m.key = g.key; m.ox = ox; m.oy = oy; m.w = w; m.h = h;
  }
  const mask = m.mask;
  if (!mask) return;
  // Emprise serrée sur les vitres allumées (molette tight: false = la maison entière,
  // comme avant) ; le blit, lui, ne change pas.
  const b = LIGHT_LAYER.tight !== false
    ? litBox(g.dx, g.dy, g.dw / g.bb.w, g.dh / g.bb.h, mask.u0, mask.v0, mask.u1, mask.v1)
    : { x0: g.dx, y0: g.dy, x1: g.dx + g.dw, y1: g.dy + g.dh };
  const ctx = lightCtx(b.x0, b.y0, b.x1, b.y1);
  if (!ctx) return;
  ctx.save();
  ctx.globalAlpha = night * 0.72 * CM.ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mask.cv, g.dx, g.dy, g.dw, g.dh);
  ctx.restore();
}
