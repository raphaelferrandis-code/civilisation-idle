/**
 * OKLAB — la distance perceptuelle des outils de palette, en UN exemplaire.
 * ---------------------------------------------------------------------------
 * Björn Ottosson : sRGB (0..255) → linéaire (table de 256) → LMS → racine
 * cubique → OKLab. Bien plus fidèle que le RGB ou le redmean : deux teintes
 * « proches à l'œil » le sont aussi dans l'espace.
 *
 * Elle était recopiée dans quatre scripts (remapPalette, bakeUiIcons,
 * bakeUiIconSizes, bakeRuinsEmblems — audit 2026-10-05, SCRIPT-11) ; les quatre
 * copies calculaient la même chose au bit près, celle-ci aussi : relancer un
 * de ces scripts rend les mêmes PNG qu'avant la mise en commun.
 *
 * CommonJS pour servir les scripts .cjs (require) comme les .mjs (import).
 */
'use strict';

const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

// r, g, b entiers 0..255 → [L, a, b].
function oklab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
          1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
          0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_];
}

// Distance au carré entre deux couleurs OKLab (on ne compare que des ordres).
const labD2 = (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; };

module.exports = { oklab, labD2 };
