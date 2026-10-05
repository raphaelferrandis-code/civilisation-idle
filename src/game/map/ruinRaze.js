// LA CHUTE — l'ARASEMENT d'un dessin (module feuille, aucun import).
//
// Repli des sprites sans ruine dessinée (habitations, scènes moteur) et vieillissement
// des ruines du cycle précédent (docs/PLAN-CHUTE.md). Travaille sur un ImageData.
//
// ARASEMENT : on ne garde que le pied du dessin, colonne par colonne (le pied d'un
// bâtiment iso est en V), sur une hauteur qui varie par paliers — des pans de mur
// bas, cassés. Déterministe par image : la même ruine s'arase toujours pareil.
export function razeImageData(img, keepK = 0.18) {
  const W = img.width, H = img.height, d = img.data;
  const base = new Int32Array(W).fill(-1);
  let top = H;
  for (let x = 0; x < W; x += 1) {
    for (let y = H - 1; y >= 0; y -= 1) if (d[(y * W + x) * 4 + 3] > 128) { base[x] = y; break; }
    for (let y = 0; y < H; y += 1) if (d[(y * W + x) * 4 + 3] > 128) { if (y < top) top = y; break; }
  }
  let bot = 0;
  for (const v of base) if (v > bot) bot = v;
  const inkH = Math.max(8, bot - top);
  let s = 0x2545f491, h = 0, run = 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let x = 0; x < W; x += 1) {
    if (run <= 0) { h = Math.round(inkH * (keepK * 0.55 + rnd() * keepK * 0.9)); run = 2 + Math.floor(rnd() * 4); }
    run -= 1;
    if (base[x] < 0) continue;
    const cut = base[x] - h;
    for (let y = 0; y < cut; y += 1) d[(y * W + x) * 4 + 3] = 0;
  }
  return img;
}

