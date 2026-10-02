// ── LES FENÊTRES ALLUMÉES LA NUIT ────────────────────────────────────────────
// docs/PLAN-MAQUETTE-VIVANTE.md, lot 4 (audit du 2026-09-30 : « la nuit est belle mais
// AUCUNE fenêtre n'est allumée »). Repris de la branche `passe-visuelle-21-09`, où il
// avait été posé le 2026-09-21 sans verdict de Raph.
//
// Les fenêtres éclairées suivent les pixels des ouvertures du sprite : des taches
// SOMBRES, fermées (elles ne touchent pas le vide), petites, dans la bande des étages.
// Pas de rectangles flottants, pas de halo diffus, aucune modification de l'art. La
// lumière est déposée dans le calque de lumière (lightLayer) : elle s'ajoute APRÈS le
// voile de nuit, comme celle des lampadaires, et deux fenêtres sur cinq s'allument —
// une phase par maison, donc jamais le même motif d'une façade à la voisine.
import { CM, cmHash } from './layout.js';
import { lightCtx } from './lightLayer.js';

// Élargie la nuit du 2026-10-01 (« finis toutes les époques ») : la nuit des bandes 6 à 9
// ne s'allumait nulle part. Le détecteur trouve 2 à 127 ouvertures sombres sur crafthouse,
// courtyard, megablock, arcologyhome et les skins cosmiques de la tour (8 et 9 ; la tour de
// verre des bandes 6-7 n'en a aucune, elle reste éteinte — ses vitres sont CLAIRES).
const HOMES = new Set(['townhouse', 'stonehouse', 'manor', 'block', 'tenement', 'insula', 'terrace', 'towerhouse',
  'domus', 'taberna', 'villa', 'insula2', 'crafthouse', 'courtyard', 'megablock', 'arcologyhome', 'tower',
  'haussmann', 'townhouse', 'podstack', 'domehome', 'gardentower', 'skytower', 'skytower2']);
// SEUIL D'OUVERTURE PAR DESSIN (même nuit). Le détecteur prend pour vitre une tache
// fermée dont le canal le plus fort reste sous 68. Deux dessins peignent leurs vitres
// un cran plus clair et n'en livraient AUCUNE : la maison de ville (la moitié des maisons
// de la bande 2) et la tour de verre (bandes 6-7). À 80 : 5 et 39 ouvertures — mesuré
// sur l'art, sans toucher au seuil des autres (qui prendraient alors des pans de mur).
const DARK_MAX = { townhouse: 80, tower: 80 };
// VERRE PAR COULEUR (2026-10-01, « le meilleur rendu futuriste ») : les maisons en nacre
// des ères cosmiques ont des vitres CLAIRES — verre gris-bleu des capsules et de la
// tour-jardin, hublots jaune chaud du dôme —, qu'aucun seuil de noirceur ne peut
// prendre sans prendre aussi les faces à l'ombre. On nomme leurs couleurs de verre,
// relevées sur l'art livré : la tache doit être de CETTE couleur, fermée et petite.
// Sans elles, la ville cosmique s'éteignait la nuit autour de ses bâtiments allumés.
// ⚠ Relevées À NOUVEAU après la passe netteté (même jour) : l'art redessiné net n'a plus
// les couleurs de l'ancien — vitres turquoise et hublots des capsules, hublots chauds du
// dôme, vitres d'étage de la tour-jardin.
const GLASS = {
  podstack: [[128, 200, 197], [145, 221, 224], [51, 51, 52]],
  domehome: [[239, 220, 143], [203, 161, 102], [239, 201, 123]],
  gardentower: [[85, 118, 112], [123, 154, 149], [86, 99, 97]],
};
const glassSet = (v) => (GLASS[v] ? new Set(GLASS[v].map(([r, g, b]) => (r << 16) | (g << 8) | b)) : null);
const masks = new WeakMap();

export function windowPixels(data, width, height, darkMax = 68, glass = null) {
  const seen = new Uint8Array(width * height);
  const groups = [];
  const dark = glass
    ? (i) => data[i * 4 + 3] > 240 && glass.has((data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2])
    : (i) => data[i * 4 + 3] > 240
      && Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < darkMax;
  for (let i = 0; i < seen.length; i += 1) {
    if (seen[i] || !dark(i)) continue;
    const stack = [i], pixels = [];
    seen[i] = 1;
    let x0 = width, x1 = 0, y0 = height, y1 = 0, open = false;
    while (stack.length) {
      const p = stack.pop(), x = p % width, y = Math.floor(p / width);
      pixels.push(p);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) { open = true; continue; }
        const q = ny * width + nx;
        if (data[q * 4 + 3] < 240) open = true;
        if (!seen[q] && dark(q)) { seen[q] = 1; stack.push(q); }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    // Écarte contour extérieur, toiture, grandes portes et masses de façade.
    // Verre nommé : la couleur suffit à écarter les murs, on admet des vitres plus
    // larges (hublots ronds, baies de la tour-jardin) et plus haut sur la façade.
    if (glass) {
      if (!open && y0 > height * 0.12 && y1 < height * 0.95
        && pixels.length >= 2 && w <= 12 && h <= 14 && pixels.length <= 90) groups.push(pixels);
    } else if (!open && y0 > height * 0.3 && y1 < height * 0.88
      && pixels.length >= 3 && w <= 7 && h >= 2 && h <= 12
      && h >= w * 0.65 && pixels.length <= 50) groups.push(pixels);
  }
  return groups;
}

function maskFor(g, phase, darkMax = 68, variant = '') {
  let entries = masks.get(g.img);
  if (!entries) { entries = new Map(); masks.set(g.img, entries); }
  const { x0, y0, w, h } = g.bb;
  const key = `${x0}:${y0}:${w}:${h}:${phase}:${darkMax}:${variant}`;
  if (entries.has(key)) return entries.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(g.img, x0, y0, w, h, 0, 0, w, h);
  const source = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const groups = windowPixels(source.data, w, h, darkMax, glassSet(variant));
  let count = 0;
  groups.forEach((pixels, index) => {
    if ((index * 7 + phase * 3) % 5 > 1) return;
    count += 1;
    for (const p of pixels) {
      out.data[p * 4] = 244; out.data[p * 4 + 1] = 168;
      out.data[p * 4 + 2] = 72; out.data[p * 4 + 3] = 210;
    }
  });
  ctx.putImageData(out, 0, 0);
  const result = count ? canvas : null;
  entries.set(key, result);
  return result;
}

export function drawHouseWindows(t, g) {
  const night = Math.max(0, Math.min(1, ((CM.nightF || 0) - 0.22) / 0.65));
  if (!night || CM.lodActive || !HOMES.has(t.variant) || typeof document === 'undefined') return;
  // Le verre nommé suit la CLÉ DE SPRITE, pas la variante : les skins d'ère des maisons
  // en nacre (« domehome-cosmic-7 »…) n'ont pas les couleurs de verre de leur dessin de
  // base — leur verre teinté s'allume par sceneEmissive.js.
  const glassKey = GLASS[g.key || t.variant] ? (g.key || t.variant) : '';
  const mask = maskFor(g, cmHash(`windows:${t.gx}:${t.gy}`) % 5, DARK_MAX[t.variant] || 68, glassKey);
  if (!mask) return;
  const ctx = lightCtx(g.dx, g.dy, g.dx + g.dw, g.dy + g.dh);
  if (!ctx) return;
  ctx.save();
  ctx.globalAlpha = night * 0.72 * CM.ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mask, g.dx, g.dy, g.dw, g.dh);
  ctx.restore();
}
