/**
 * LA CUISSON ÷N DES BANDES D'AGENTS (les `-half.png` du lot G1,
 * docs/PLAN-GRILLE-PIXELS.md) — en UN exemplaire.
 * ---------------------------------------------------------------------------
 * Elle existait en trois copies (scripts/bakeHalfBands.mjs, fetchAgentFlat.mjs
 * `half`, fetchAgentIdle.mjs) qui avaient déjà divergé : seule la première
 * savait garder les braises (audit 2026-10-05, SCRIPT-11). Les trois passent
 * maintenant par ici ; à réglages égaux elles rendent les mêmes PNG qu'avant.
 *
 * La recette (les essais ratés qui l'ont fixée sont racontés dans
 * bakeHalfBands.mjs, « LA RÈGLE DE COULEUR ») :
 *   · moyenne PRÉMULTIPLIÉE du bloc N×N — sans pondérer par l'alpha, les pixels
 *     transparents du bord tirent la couleur vers le noir et le sprite se cerne
 *     d'un liseré ;
 *   · rabattue sur une PALETTE (par défaut celle de la source) pour n'inventer
 *     aucune teinte intermédiaire ;
 *   · alpha BINAIRE au seuil `alpha` (le blit est au plus proche voisin, un bord
 *     semi-opaque n'y gagne rien) ;
 *   · `hot` (jeu de couleurs 0xRRGGBB) : si une couleur chaude occupe au moins
 *     `hotShare` de l'alpha du bloc, elle l'emporte sur la moyenne — une flamme
 *     de torche survit au ÷4.
 */
import { PNG } from 'pngjs';

// Palette d'ARRIVÉE = les couleurs pleines (alpha > 128) de l'image, dans l'ordre
// de lecture (l'ordre départage les égalités de distance : il fait partie du résultat).
export function paletteOf(img) {
  const seen = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] > 128) seen.set((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2], [img.data[i], img.data[i + 1], img.data[i + 2]]);
  }
  return [...seen.values()];
}

// Couleur de `pal` la plus proche de (r, g, b) en RGB ; la première l'emporte à égalité.
export function nearest(pal, r, g, b) {
  let best = pal[0], bd = Infinity;
  for (const c of pal) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// src : PNG (pngjs). Rend un PNG de floor(w/div) × floor(h/div).
export function bakeHalf(src, { div = 2, alpha = 128, pal = paletteOf(src), hot = null, hotShare = 0.12 } = {}) {
  const w = Math.floor(src.width / div), h = Math.floor(src.height / div);
  const out = new PNG({ width: w, height: h });
  const n2 = div * div, d = src.data;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let r = 0, g = 0, b = 0, a = 0, hotW = 0, hotK = -1, hotBest = -1;
    for (let dy = 0; dy < div; dy += 1) for (let dx = 0; dx < div; dx += 1) {
      const i = ((y * div + dy) * src.width + x * div + dx) * 4;
      const pr = d[i], pg = d[i + 1], pb = d[i + 2], pa = d[i + 3];
      r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
      if (hot && pa > 16) {
        const k = (pr << 16) | (pg << 8) | pb;
        if (hot.has(k)) { hotW += pa; if (pa > hotBest) { hotBest = pa; hotK = k; } }
      }
    }
    const o = (y * w + x) * 4;
    if (a / n2 < alpha) { out.data[o] = 0; out.data[o + 1] = 0; out.data[o + 2] = 0; out.data[o + 3] = 0; continue; }
    const best = hotK >= 0 && hotW >= hotShare * a
      ? [(hotK >> 16) & 255, (hotK >> 8) & 255, hotK & 255]
      : nearest(pal, r / a, g / a, b / a);
    out.data[o] = best[0]; out.data[o + 1] = best[1]; out.data[o + 2] = best[2]; out.data[o + 3] = 255;
  }
  return out;
}
