// ── LES BUREAUX S'ALLUMENT LA NUIT (bande 6) ────────────────────────────────
// 2026-10-01 (Raph : « oui » à la question de la planche). Aux bandes 7-9, le verre des
// scènes moteur porte la teinte de l'ère et sceneEmissive.js le relève par sa TEINTE.
// À la bande 6, impossible : le verre moderne est bleu, mais les murs à l'ombre aussi
// (lumière haut-gauche, ombre bleutée) — une fenêtre de teinte allumait des façades
// entières. Le verre est donc NOMMÉ, sprite par sprite : ses couleurs exactes, relevées
// sur l'art livré (planches de nuit simulée, scratchpad du 2026-10-01).
//
// Une vitre allumée n'est pas un aplat : les pixels de verre sont groupés en CARREAUX
// (taches 4-connexes ; au-delà de 12 px, une grande surface vitrée est découpée en
// ÉTAGES de 3 px, jamais en damier) et trois carreaux sur cinq s'allument, avec une
// phase par bâtiment — deux académies voisines n'ont pas les mêmes bureaux allumés.
// La lumière garde la nuance du verre, tirée vers un blanc chaud, et passe par le
// calque de lumière (lightLayer.js), comme les fenêtres des maisons (houseWindows.js).
//
// Restent ÉTEINTS, par choix : le dépôt municipal, le centre de données, la station
// d'épuration, l'école et l'hôtel des monnaies (fermés la nuit), l'observatoire (il lui
// faut le noir).
import { CM } from './layout.js';
import { lightCtx } from './lightLayer.js';

// Couleurs de verre par clé de sprite (hex sans #, séparées par une espace).
const GLASS = {
  'scribes-data': '454d62 4e576b 566277',
  'ministries-tower': '505a6d 5c798e 708e9d',
  'courthouses-modern': '35404e',
  'ruins-lab': '47586a 586a7f',
  'think-modern': '2c334d 374362 3d4a67 4c5a77 5f6b84 627d9b 7797b1 8db4c8',
  'printing-media': '2e4068 32538a 474f6c 4b7fb0 5c698d 5c6e97 7e9fbf 7fbce7',
  'universities-modern': '333945 434b56 4c5a65 5e6d77 728990',
  'libraries-modern': '454c5d 4f5260 565d6f 626d7b 737d88',
  'academies-modern': '384254 41566b 515a6c 5d768b 708fa5 789ab2 7fa6c4 90b9d8',
  'storyteller-media': '40495f 6a85a3',
  'bank-house-glass': '1c2e53 2d5894 32466d 3869a5 3a3e54 427ebd 7092b6',
  'ministries-tower-grand': '4e667e 588aa0 6a7584 7c8b97 809ba6',
  'courthouses-modern-grand': '2a333c',
  'ruins-lab-grand': '4a5665 52687e 5d6c82 627c94 748fa7 90adc3',
  'think-modern-grand': '2e324a 38425e 3c4866 3f5160 495a79 61728c 6390ae 6c9eb9 77a9c0 90b7c5',
  'printing-media-grand': '335286 3968a6 407fb9 4a9dde 4d608a 5277a5 729dc7 a2c3df',
  'universities-modern-grand': '2d2f3a 3e464b 738d92',
  'libraries-modern-grand': '3e4753 495862 5b6678',
  // Le logo et la sculpture d'or de la tour de la banque s'éclairent aussi.
  'bank-house-glass-grand': '172651 17407e 1d3464 2663ac 2f538a 3f4961 6a7691 7d9bc0 deb469 efd28f',
};
// Lecture seule, pour la garde (chaque couleur nommée doit exister dans son PNG).
export const SCENE_GLASS = GLASS;
const glassSets = new Map();
function glassOf(key) {
  if (!glassSets.has(key)) glassSets.set(key, new Set(GLASS[key].split(' ').map((h) => parseInt(h, 16))));
  return glassSets.get(key);
}

// Même lumière que les fenêtres des maisons (houseWindows.js : 244,168,72) : un premier
// essai en blanc chaud (255,206,130 ; mélange 0,6 ; 0,78) sortait BLANC BLEUTÉ sur le
// verre bleu et deux fois plus fort que les maisons voisines — des bâtiments-lanternes.
export const SCENE_WINDOWS = { on: true, lit: 3, mix: 0.8, glow: [244, 168, 72], alpha: 0.6 };
const PANE_MAX = 12;   // au-delà, une tache de verre est une surface vitrée → par étages
const FLOOR = 3;       // hauteur d'un étage, en pixels du sprite

// Carreaux d'un sprite (pur, testable) : listes d'indices de pixels.
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

const masks = new WeakMap();   // img → Map(phase:lit:mix → canvas|null)
function maskFor(img, key, phase) {
  let m = masks.get(img);
  if (!m) { m = new Map(); masks.set(img, m); }
  const id = `${phase}:${SCENE_WINDOWS.lit}:${SCENE_WINDOWS.mix}`;
  if (m.has(id)) return m.get(id);
  const w = img.naturalWidth | 0, h = img.naturalHeight | 0;
  if (!w || !h) { m.set(id, null); return null; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const src = x.getImageData(0, 0, w, h);
  const out = x.createImageData(w, h);
  const { lit, mix, glow } = SCENE_WINDOWS;
  let n = 0;
  sceneWindowUnits(src.data, w, h, glassOf(key)).forEach((pixels, index) => {
    if ((index * 7 + phase * 3) % 5 >= lit) return;
    for (const p of pixels) {
      n += 1;
      for (let ch = 0; ch < 3; ch += 1) out.data[p * 4 + ch] = Math.round(src.data[p * 4 + ch] + (glow[ch] - src.data[p * 4 + ch]) * mix);
      out.data[p * 4 + 3] = 255;
    }
  });
  x.clearRect(0, 0, w, h);
  x.putImageData(out, 0, 0);
  const res = n ? c : null;
  m.set(id, res);
  return res;
}

// Dépose les bureaux allumés d'une scène blittée en (dx, dy, dw, dh). `seed` = graine
// stable de l'instance (coordonnées de tuile). Sans effet le jour, en vue lointaine,
// pendant une passe hors écran (calque suspendu) ou pour un sprite sans verre nommé.
export function drawSceneWindows(img, key, dx, dy, dw, dh, seed = 0) {
  if (!SCENE_WINDOWS.on || !GLASS[key] || typeof document === 'undefined') return;
  const night = Math.max(0, Math.min(1, ((CM.nightF || 0) - 0.22) / 0.65));
  if (!night || CM.lodActive) return;
  const mask = maskFor(img, key, (seed >>> 0) % 5);
  if (!mask) return;
  const ctx = lightCtx(dx, dy, dx + dw, dy + dh);
  if (!ctx) return;
  ctx.save();
  ctx.globalAlpha = night * SCENE_WINDOWS.alpha * (CM.ctx ? CM.ctx.globalAlpha : 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mask, dx, dy, dw, dh);
  ctx.restore();
}

if (typeof window !== 'undefined') {
  // Molette : __sceneWindows({ on, lit, mix, alpha }) — `lit` = carreaux allumés sur 5.
  window.__sceneWindows = (o = {}) => { Object.assign(SCENE_WINDOWS, o); return { ...SCENE_WINDOWS }; };
}
