/**
 * LA FLAMME EN LANGUES — le dessin des braseros des places
 * (scripts/plazaBrazierAnim.mjs), repris par les feux peints des scènes
 * vivantes (scripts/sceneLive.mjs). Les deux scripts en tenaient chacun une
 * copie ; les morceaux communs vivent ici (audit 2026-10-05, SCRIPT-11), les
 * réglages propres à chacun restent chez lui (souffle, balancement, langues,
 * cœur blanc). À réglages égaux, les mêmes PNG qu'avant.
 *
 * Les indices de couleur renvoient à public/pixelart/fire-ramp.json :
 *   0 braise-éteinte · 1 braise · 2 rouge-profond · 3 rouge-feu · 4 vermillon ·
 *   5 orange-ardent · 6 or-de-cœur · 7 cœur-blanc
 */

// Hash entier déterministe (pas de Math.random : relancer = mêmes PNG).
export const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Masque (1 = flamme) d'une flamme de langues à l'instant u ∈ [0,1) (boucle).
//   tongues : [{ dx, h, w, ph }] — décalage, hauteur, demi-largeur au pied, phase ;
//   cx/base : pied de la flamme (px d'art ; cx au centre d'un pixel = x + 0.5) ;
//   top     : rangée la plus haute permise ;
//   breath  : amplitude du souffle (la hauteur respire de ±breath) ;
//   sway    : amplitude du balancement de la pointe, en px.
export function tongueMask(W, H, tongues, { cx, base, top = 0, breath, sway }, u) {
  const m = new Uint8Array(W * H);
  const th = u * Math.PI * 2;
  for (const t of tongues) {
    const hh = t.h * (1 + breath * Math.sin(th + t.ph) + 0.07 * Math.sin(2 * th + 1.7 * t.ph));
    const sw = sway * Math.sin(th + t.ph + 1.3);
    for (let y = Math.max(top, Math.floor(base - hh - 1)); y <= base; y += 1) {
      const k = (base - y) / hh;     // 0 au pied → 1 à la pointe
      if (k < 0 || k > 1) continue;
      const xc = cx + t.dx + sw * k * k;
      const hw = t.w * Math.pow(1 - k, 0.75) + 0.2;
      for (let x = Math.max(0, Math.floor(xc - hw - 1)); x <= Math.min(W - 1, Math.ceil(xc + hw + 1)); x += 1) {
        if (Math.abs(x + 0.5 - xc) <= hw) m[y * W + x] = 1;
      }
    }
  }
  return m;
}

// Profondeur (érosion 4-voisins, 1 à 4). Le pied de la flamme sort des braises :
// le voisin du DESSOUS n'est jamais « dehors », sinon le pied virerait au rouge.
export function flameDepth(m, W, H, base) {
  const d = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i += 1) d[i] = m[i] ? 1 : 0;
  for (let pass = 1; pass < 4; pass += 1) {
    const prev = d.slice();
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (prev[i] < pass) continue;
      const at = (xx, yy) => (yy > base ? pass : (xx < 0 || xx >= W || yy < 0) ? 0 : prev[yy * W + xx]);
      if (at(x - 1, y) >= pass && at(x + 1, y) >= pass && at(x, y - 1) >= pass && at(x, y + 1) >= pass) d[i] = pass + 1;
    }
  }
  return d;
}

// Rangée de la pointe la plus haute (base si le masque est vide).
export function flameTop(m, W, base) {
  let top = base;
  for (let i = 0; i < m.length; i += 1) if (m[i]) { top = Math.min(top, Math.floor(i / W)); }
  return top;
}

// Indice de rampe d'un pixel de flamme. k : hauteur relative dans la flamme
// (0 pied → 1 sommet) ; core : le pixel est dans l'axe (le cœur blanc reste un
// point, pas une nappe sur toute la bouche).
export function flameRampIndex(depth, k, core) {
  if (depth <= 1) return k > 0.62 ? 2 : k > 0.3 ? 3 : 4;
  if (depth === 2) return k > 0.55 ? 4 : 5;
  if (depth === 3) return k > 0.4 ? 5 : 6;
  return k > 0.3 ? 6 : core ? 7 : 6;
}
