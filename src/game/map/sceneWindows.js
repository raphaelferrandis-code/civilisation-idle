// ── LES BÂTIMENTS-MOTEUR S'ALLUMENT LA NUIT ─────────────────────────────────
// 2026-10-01 (Raph : « oui » à la question de la planche, puis « l'allumage de nuit est à
// fignoler pour un rendu parfait »). Aux bandes 7-9, le verre des scènes moteur porte la
// teinte de l'ère et sceneEmissive.js le relève par sa TEINTE. Ailleurs, deux façons de
// trouver les fenêtres d'un sprite :
//   - VERRE NOMMÉ (bande 6) : le verre moderne est bleu, mais les murs à l'ombre aussi
//     (lumière haut-gauche, ombre bleutée) — une fenêtre de teinte allumait des façades
//     entières. Ses couleurs exactes sont donc relevées sprite par sprite (`GLASS`).
//   - FENÊTRES SOMBRES (médiéval, romain, XIXe) : RELEVÉES À LA MAIN dessin par dessin
//     (sceneWindowsData.js, 2026-10-03, Raph : « les lumières arrivent n'importe où ») —
//     les 113 dessins, « -grand » compris. L'ancien détecteur de taches sombres prenait
//     ardoises, ombres de colonnes et portes pour des vitres : il est retiré, et la garde
//     (__tests__/sceneWindows.test.js) exige un relevé pour chaque dessin de la liste.
//
// Une vitre allumée n'est pas un aplat : les pixels de verre sont groupés en CARREAUX
// (taches 4-connexes ; au-delà de 12 px, une grande surface vitrée est découpée en
// ÉTAGES de 3 px, jamais en damier) et une partie s'allume, avec une phase par bâtiment
// — deux académies voisines n'ont pas les mêmes bureaux allumés.
//
// ⚠ LE VERRE EST D'ABORD ASSOMBRI. La lumière passe par le calque additif
// (lightLayer.js), APRÈS le voile de nuit : ajoutée sur un verre bleu-gris resté clair,
// elle sortait BEIGE PÂLE, pas orange. Les carreaux allumés sont donc d'abord peints
// presque noirs sur la scène (avant le voile), puis reçoivent la lumière des maisons
// (244,168,72) : la même fenêtre allumée partout dans la ville.
// ⚠ UNE COUPOLE N'A PAS D'ÉTAGES : allumée par bandes, celle de l'académie sortait
// en boule rayée de blanc. Le verre au-dessus de `DOME[clé]` (fraction de la hauteur
// d'encre) reçoit une lueur douce et uniforme, ni assombri ni rayé.
//
// Restent ÉTEINTS, par choix : le dépôt municipal, le centre de données, la station
// d'épuration, l'école et l'hôtel des monnaies (fermés la nuit), l'observatoire (il lui
// faut le noir).
import { CM } from './layout.js';
import { LIGHT_LAYER, lightCtx, litBox } from './lightLayer.js';
import { SCENE_WINDOWS_DATA } from './sceneWindowsData.js';

// Couleurs de verre par clé de sprite (hex sans #, séparées par une espace).
const GLASS = {
  'scribes-data': '3b4257 5c697d',
  'ministries-tower': '45546a 566a7e 5f899e 6aa2b2 8cc1c6',
  'courthouses-modern': '576176',
  'ruins-lab': '4b6275',
  'think-modern': '292d41 313952 374565 405274 4d6283 50586d 5e7696 6e8aa8 7c99b3 8badc3',
  'printing-media': '243567 2d4681 3b5082 4d88c6 52516e 52608a 5c9bd2 81c0e8',
  'universities-modern': '252d3a 323a48 353d4c 3a464f 425056 4f5e61 758993',
  'libraries-modern': '383848 444e62 4f5c71 5f7183 626574',
  'academies-modern': '3a4354 405468 517188 678ca3 79a1bb 90b0c5 96c0dd a4c9e2',
  'storyteller-media': '3e5b76 485062 545d70 5a97c6 f59149',
  'bank-house-glass': '23375d 243f6e 284e8b 343850 3873bb 4a5b7e 5ca1d8 f5cb78',
  'ministries-tower-grand': '516478 5f8a9e 699aad',
  'courthouses-modern-grand': '576373',
  'ruins-lab-grand': '576b7e 698094 8ca7bb',
  'think-modern-grand': '2e324a 38425e 3c4866 3f5160 495a79 61728c 6390ae 6c9eb9 77a9c0 90b7c5',
  'printing-media-grand': '376cad 385d97 3a5280 3e7db9 4491cc 697698',
  'universities-modern-grand': '3b4148 6b8084 82a1a4',
  'libraries-modern-grand': '545e62 7d8990',
  // Le logo et la sculpture d'or de la tour de la banque s'éclairent aussi.
  'bank-house-glass-grand': '16407c 1b2c54 1f5ba2 49526f 5b627d 6c7792 d7ab62 e8b052 f8d88e',
  // Passe « tous les bâtiments » (2026-10-01, soir) : la tour administrative et le
  // siège du consortium, redessinés, ont eux aussi leurs bureaux.
  'bureau-tower': '3f4f62 54677a 5c6d7b 627d96 6d859b',
  'bureau-tower-grand': '344355 425164 576a7f 657a8f',
  'guild-consortium': '3e4c5e 486078 507d94 dcb970',
};
// Coupoles de verre : au-dessus de cette fraction de la hauteur d'encre, lueur douce.
const DOME = { 'academies-modern': 0.5 };

// Bâtiments à FENÊTRES SOMBRES : stades médiéval (1) et industriel (2), et la série
// romaine de la bande 4 — leurs halles (`-grand`) suivent d'office.
const DARK_BASE = [
  // économie
  'granary-hall', 'guild-house', 'mint-prop-house', 'bank-house-renaissance', 'market-hall-tent',
  'granary-warehouse', 'guild-chamber', 'mint-house-steam', 'bank-house-neoclassical',
  'granary-horreum-classical', 'guild-collegium', 'mint-moneta', 'bank-basilica-roman', 'market-macellum',
  // savoir et infrastructures, stade médiéval
  'storyteller-hall', 'scribes-scriptorium', 'schools-schoolhouse', 'academies-renaissance', 'cult-shrine',
  'observatories-tower', 'libraries-monastic', 'universities-gothic', 'printing-press-shop', 'think-chancellery',
  'watch-stone', 'bureau-chancery', 'courthouses-tribunal', 'works-yard', 'ministries-palace', 'archive-vault',
  'ruins-lodge',
  // stade industriel
  'storyteller-theater', 'scribes-archive', 'schools-victorian', 'academies-institute', 'cult-mausoleum',
  'libraries-grand', 'universities-collegiate', 'printing-factory', 'think-institute', 'watch-industrial',
  'sewers-works', 'bureau-office', 'courthouses-neoclassical', 'works-industrial', 'ministries-capitol',
  'archive-records', 'ruins-institute',
  // série romaine (bande 4)
  'storyteller-odeon', 'scribes-tabularium', 'schools-ludus', 'academies-athenaeum', 'cult-vesta',
  'observatories-horologium', 'libraries-classical', 'universities-classical', 'printing-scriptorium',
  'think-stoa-roman', 'watch-classical', 'bureau-tabularium', 'courthouses-basilica', 'works-classical',
  'ministries-curia', 'archive-tabularium', 'ruins-restoration-roman',
];
const DARK = new Set(DARK_BASE.flatMap((k) => [k, k + '-grand']));

// Lecture seule, pour la garde (chaque couleur nommée doit exister dans son PNG).
export const SCENE_GLASS = GLASS;
export const SCENE_DARK = DARK_BASE;
const glassSets = new Map();
function glassOf(key) {
  if (!glassSets.has(key)) glassSets.set(key, new Set(GLASS[key].split(' ').map((h) => parseInt(h, 16))));
  return glassSets.get(key);
}

// La lumière des fenêtres de maison (houseWindows.js) : 244,168,72 à 210/255, ×0,72.
// `litGlass` / `litDark` = carreaux allumés sur 5 ; `dark` = assombrissement du verre
// allumé avant le voile ; `dome` = lueur d'une coupole de verre.
export const SCENE_WINDOWS = { on: true, litGlass: 3, litDark: 2, glow: [244, 168, 72], level: 210, alpha: 0.72, dark: 0.9, dome: 0.28 };
const PANE_MAX = 12;   // au-delà, une tache de verre est une surface vitrée → par étages
const FLOOR = 3;       // hauteur d'un étage, en pixels du sprite

// Carreaux de VERRE d'un sprite (pur, testable) : listes d'indices de pixels.
export function sceneWindowUnits(data, width, height, glass) {
  const on = (i) => data[i * 4 + 3] >= 240 && glass.has((data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2]);
  const seen = new Uint8Array(width * height);
  const units = [];
  for (let i = 0; i < seen.length; i += 1) {
    if (seen[i] || !on(i)) continue;
    const stack = [i], pixels = [];
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % width, y = (p / width) | 0;
      pixels.push(p);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const q = ny * width + nx;
        if (!seen[q] && on(q)) { seen[q] = 1; stack.push(q); }
      }
    }
    if (pixels.length <= PANE_MAX) { units.push(pixels); continue; }
    const floors = new Map();
    for (const p of pixels) {
      const f = Math.floor(((p / width) | 0) / FLOOR);
      if (!floors.has(f)) floors.set(f, []);
      floors.get(f).push(p);
    }
    for (const f of floors.values()) units.push(f);
  }
  return units;
}

// Fenêtres SOMBRES d'un sprite : relevées à la main (une fenêtre = des rectangles
// [x, y, w, h, …]) ; un dessin sans relevé n'allume rien. Listes d'indices de pixels,
// comme le verre nommé.
function darkWindowUnits(key, width) {
  const wins = SCENE_WINDOWS_DATA[key];
  if (!wins) return [];
  return wins.map((r) => {
    const px = [];
    for (let i = 0; i < r.length; i += 4) {
      for (let y = r[i + 1]; y < r[i + 1] + r[i + 3]; y += 1) for (let x = r[i]; x < r[i] + r[i + 2]; x += 1) px.push(y * width + x);
    }
    return px;
  });
}

// Haut de l'encre (première rangée opaque) et hauteur d'encre d'une image RGBA.
function inkRows(data, w, h) {
  let y0 = -1, y1 = -1;
  for (let y = 0; y < h && y0 < 0; y += 1) for (let x = 0; x < w; x += 1) if (data[(y * w + x) * 4 + 3] >= 128) { y0 = y; break; }
  for (let y = h - 1; y >= 0 && y1 < 0; y -= 1) for (let x = 0; x < w; x += 1) if (data[(y * w + x) * 4 + 3] >= 128) { y1 = y; break; }
  return [y0, y1];
}

const masks = new WeakMap();   // img → Map(réglage → { light, dark, u0, v0, u1, v1 } | null)
// (u0, v0)-(u1, v1) = boîte des carreaux posés (audit du 2026-10-05, PERF-2) : les deux
// masques ont la taille de l'image entière, blittée chaque nuit (lumière dans le calque,
// assombrissement sur la scène) — cf. lightLayer.litBox.
function masksFor(img, key, mode, phase) {
  let m = masks.get(img);
  if (!m) { m = new Map(); masks.set(img, m); }
  const S = SCENE_WINDOWS;
  const id = `${key}:${phase}:${S.litGlass}:${S.litDark}:${S.level}:${S.dome}`;
  if (m.has(id)) return m.get(id);
  const w = (img.naturalWidth || img.width) | 0, h = (img.naturalHeight || img.height) | 0;
  if (!w || !h) { m.set(id, null); return null; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const src = x.getImageData(0, 0, w, h);
  const light = x.createImageData(w, h), dark = x.createImageData(w, h);
  const units = mode === 'glass' ? sceneWindowUnits(src.data, w, h, glassOf(key)) : darkWindowUnits(key, w);
  const lit = mode === 'glass' ? S.litGlass : S.litDark;
  const [iy0, iy1] = inkRows(src.data, w, h);
  const domeY = DOME[key] != null && iy0 >= 0 ? iy0 + (iy1 - iy0) * DOME[key] : -1;
  const g = S.glow;
  let n = 0;
  units.forEach((pixels, index) => {
    // Coupole : le carreau dont le haut est au-dessus de la ligne de coupole.
    let top = h;
    for (const p of pixels) top = Math.min(top, (p / w) | 0);
    if (top < domeY) {
      for (const p of pixels) {
        light.data[p * 4] = g[0]; light.data[p * 4 + 1] = g[1]; light.data[p * 4 + 2] = g[2];
        light.data[p * 4 + 3] = Math.round(S.level * S.dome);
      }
      n += 1;
      return;
    }
    if ((index * 7 + phase * 3) % 5 >= lit) return;
    // Pas deux bureaux de la même intensité : trois niveaux, tirés sur le carreau.
    const k = [1, 0.86, 0.72][(index * 5 + phase) % 3];
    for (const p of pixels) {
      light.data[p * 4] = g[0]; light.data[p * 4 + 1] = g[1]; light.data[p * 4 + 2] = g[2];
      light.data[p * 4 + 3] = Math.round(S.level * k);
      if (mode === 'glass') { dark.data[p * 4] = 16; dark.data[p * 4 + 1] = 14; dark.data[p * 4 + 2] = 20; dark.data[p * 4 + 3] = 255; }
    }
    n += 1;
  });
  if (!n) { m.set(id, null); return null; }
  // Boîte des pixels posés, lumière OU assombrissement (un carreau vide la laisse vide).
  let u0 = w, v0 = h, u1 = 0, v1 = 0;
  for (let p = 0; p < w * h; p += 1) {
    if (!light.data[p * 4 + 3] && !dark.data[p * 4 + 3]) continue;
    const px = p % w, py = (p / w) | 0;
    if (px < u0) u0 = px; if (px + 1 > u1) u1 = px + 1;
    if (py < v0) v0 = py; if (py + 1 > v1) v1 = py + 1;
  }
  const mk = (img2) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').putImageData(img2, 0, 0); return cv; };
  const res = { light: mk(light), dark: mode === 'glass' ? mk(dark) : null, u0, v0, u1: Math.max(u0, u1), v1: Math.max(v0, v1) };
  m.set(id, res);
  return res;
}

// Dépose les fenêtres allumées d'une scène blittée en (dx, dy, dw, dh) sur `ctx`.
// `seed` = graine stable de l'instance (coordonnées de tuile). Sans effet le jour, en vue
// lointaine, pendant une passe hors écran (calque suspendu) ou pour un sprite sans fenêtre
// connue. L'assombrissement du verre n'est peint que si la lumière, elle, est déposée.
export function drawSceneWindows(ctx, img, key, dx, dy, dw, dh, seed = 0) {
  if (!SCENE_WINDOWS.on || typeof document === 'undefined') return;
  const mode = GLASS[key] ? 'glass' : DARK.has(key) ? 'dark' : null;
  if (!mode) return;
  const night = Math.max(0, Math.min(1, ((CM.nightF || 0) - 0.22) / 0.65));
  if (!night || CM.lodActive) return;
  const m = masksFor(img, key, mode, (seed >>> 0) % 5);
  if (!m) return;
  // Emprise serrée sur les carreaux posés (molette tight: false = la scène entière,
  // comme avant) ; les blits, eux, ne changent pas.
  const b = LIGHT_LAYER.tight !== false
    ? litBox(dx, dy, dw / m.light.width, dh / m.light.height, m.u0, m.v0, m.u1, m.v1)
    : { x0: dx, y0: dy, x1: dx + dw, y1: dy + dh };
  const lc = lightCtx(b.x0, b.y0, b.x1, b.y1);
  if (!lc) return;
  const fade = ctx ? ctx.globalAlpha : 1;
  if (m.dark && ctx) {
    ctx.save();
    ctx.globalAlpha = night * SCENE_WINDOWS.dark * fade;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(m.dark, dx, dy, dw, dh);
    ctx.restore();
  }
  lc.save();
  lc.globalAlpha = night * SCENE_WINDOWS.alpha * fade;
  lc.imageSmoothingEnabled = false;
  lc.drawImage(m.light, dx, dy, dw, dh);
  lc.restore();
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  // Molette : __sceneWindows({ on, litGlass, litDark, level, alpha, dark, dome }).
  window.__sceneWindows = (o = {}) => { Object.assign(SCENE_WINDOWS, o); return { ...SCENE_WINDOWS }; };
}
