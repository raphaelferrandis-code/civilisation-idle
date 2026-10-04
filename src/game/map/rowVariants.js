// ── LES RANGÉES ALTERNENT (ville par îlots, docs/PLAN-ILOTS.md) ─────────────────
// Raph 2026-10-04 : « vas-y pour alterner des dessins de même hauteur ». Une rangée
// répète UN modèle (un côté d'îlot, un modèle : les toits se suivent) ; ce qui varie
// d'une maison à l'autre, c'est la MATIÈRE — l'enduit entre les colombages, la brique,
// l'auvent de la boutique, le néon de l'enseigne. Même dessin, donc même hauteur, même
// emprise : rien ne casse la ligne des toits.
//
// Une variante = une liste de règles. Une règle choisit des couleurs par teinte /
// saturation / luminosité (HSL) et les déplace : nouvelle teinte, saturation
// multipliée ou fixée, luminosité multipliée. La rampe d'ombre est conservée (chaque
// ton garde sa luminosité relative). La variante 0 est toujours le dessin d'origine.
// Pur : aucun accès au DOM (recolorData travaille sur un tampon RGBA).

const P = (h0, h1, sMin = 0, lMin = 0, lMax = 101, sMax = 101) => ({ h0, h1, sMin, sMax, lMin, lMax });

export const ROW_VARIANTS = {
  // Colombages : l'enduit entre les pans de bois (crème) — ocre, rose, bleu pâle, sauge.
  colombage: [
    [{ ...P(30, 55, 20, 60), h: 40, s: 66, lMul: 0.92 }],
    [{ ...P(30, 55, 20, 60), h: 6, s: 52, lMul: 0.97 }],
    [{ ...P(30, 55, 20, 60), h: 208, s: 34, lMul: 1.0 }],
    [{ ...P(30, 55, 20, 60), h: 92, s: 30, lMul: 0.96 }],
  ],
  // Rangée victorienne : la brique — jaune de Londres, rouge sombre, brun gris.
  terrace: [
    [{ ...P(5, 32, 30, 15), h: 40, sMul: 0.55, lMul: 1.04 }],
    [{ ...P(5, 32, 30, 15), h: 6, sMul: 0.82, lMul: 0.88 }],
    [{ ...P(5, 32, 30, 15), h: 24, sMul: 0.4, lMul: 0.95 }],
  ],
  // Haussmannien : l'auvent et la devanture (vert sombre) — bordeaux, bleu nuit, noir ;
  // la pierre un peu plus grise sur l'une.
  haussmann: [
    [{ ...P(150, 190, 15), h: 350, s: 42 }],
    [{ ...P(150, 190, 15), h: 222, s: 38 }],
    [{ ...P(150, 190, 15), h: 0, s: 0, lMul: 0.8 }, { ...P(25, 45, 40, 70), sMul: 0.45 }],
  ],
  // Boutique néon : l'enseigne et l'auvent (magenta) — cyan, jaune, vert, orange.
  neonshop: [
    [{ ...P(275, 335, 45), h: 188, sMul: 1.0 }],
    [{ ...P(275, 335, 45), h: 50, sMul: 1.0 }],
    [{ ...P(275, 335, 45), h: 140, sMul: 0.9 }],
    [{ ...P(275, 335, 45), h: 22, sMul: 1.0 }],
  ],
  // Marbre : les enduits romains — blanc de chaux, ocre jaune, terre rose.
  domus: [
    [{ ...P(20, 48, 18, 50), sMul: 0.35, lMul: 1.06 }],
    [{ ...P(20, 48, 18, 50), h: 42, sMul: 1.25 }],
    [{ ...P(20, 48, 18, 50), h: 10, sMul: 0.9 }],
  ],
  // Échoppe et popina : leur toit est de la MÊME teinte que leurs murs (un même ton les
  // dessine) — changer la teinte repeignait le toit. On n'y joue que sur l'éclat de
  // l'enduit : passé au soleil, ou frais.
  taberna: [
    [{ ...P(12, 32, 35, 40), sMul: 0.8, lMul: 1.07 }],
    [{ ...P(12, 32, 35, 40), sMul: 1.12, lMul: 0.95 }],
  ],
  popina: [
    [{ ...P(12, 30, 30, 40), sMul: 0.78, lMul: 1.07 }],
    [{ ...P(12, 30, 30, 40), sMul: 1.15, lMul: 0.95 }],
  ],
  insula: [
    [{ ...P(34, 48, 40, 60), h: 14, sMul: 0.7 }],
    [{ ...P(34, 48, 40, 60), sMul: 0.4, lMul: 1.04 }],
    [{ ...P(34, 48, 40, 60), h: 50, sMul: 1.0 }],
  ],
};

// Nombre de dessins d'une rangée de ce modèle (l'original compris).
export function rowVariantCount(model) {
  return 1 + ((ROW_VARIANTS[model] && ROW_VARIANTS[model].length) || 0);
}

// Variante d'une maison de rangée : un ORDRE propre au côté (tiré de `rowSide`), parcouru
// le long de la rangée — deux voisines n'ont jamais le même dessin, et deux côtés
// d'îlot ne répètent pas la même suite.
export function rowVariantIndex(model, rowSide, along) {
  const n = rowVariantCount(model);
  if (n < 2) return 0;
  const order = [];
  for (let v = 0; v < n; v += 1) order.push(v);
  let h = (rowSide >>> 0) || 1;
  for (let i = n - 1; i > 0; i -= 1) {            // mélange de Fisher-Yates, graine du côté
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    const j = h % (i + 1);
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }
  return order[((along % n) + n) % n];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const M = Math.max(r, g, b), m = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (M + m) / 2;
  if (M !== m) {
    const d = M - m;
    s = l > 0.5 ? d / (2 - M - m) : d / (M + m);
    h = M === r ? (g - b) / d + (g < b ? 6 : 0) : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h / 360 + 1 / 3) * 255), Math.round(f(h / 360) * 255), Math.round(f(h / 360 - 1 / 3) * 255)];
}

const inHue = (h, h0, h1) => (h0 <= h1 ? h >= h0 && h <= h1 : h >= h0 || h <= h1);

// Recolore un tampon RGBA (en place) selon les règles d'une variante. Les couleurs sont
// traitées une fois chacune (une palette de pixel art compte quelques dizaines de tons).
export function recolorData(data, rules) {
  if (!rules || !rules.length) return data;
  const memo = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let out = memo.get(key);
    if (out === undefined) {
      out = null;
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      for (const r of rules) {
        if (!inHue(h, r.h0, r.h1) || s < r.sMin || s > r.sMax || l < r.lMin || l > r.lMax) continue;
        const nh = r.h != null ? r.h : h;
        const ns = r.s != null ? r.s : s * (r.sMul != null ? r.sMul : 1);
        const nl = l * (r.lMul != null ? r.lMul : 1);
        out = hslToRgb(nh, ns, nl);
        break;
      }
      memo.set(key, out);
    }
    if (out) { data[i] = out[0]; data[i + 1] = out[1]; data[i + 2] = out[2]; }
  }
  return data;
}
