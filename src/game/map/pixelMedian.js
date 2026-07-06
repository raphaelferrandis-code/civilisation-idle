/* ============================================================================
 * pixelMedian.js — TERRE-PLEIN (refuge central) pixel-art des grands axes
 *   (derrière flag pixelMedianFlag.on)
 *
 *   Remplace le mince ruban plat procédural (medianCol) du refuge central des
 *   avenues/boulevards (L.median.segments) par un TERRE-PLEIN PLANTÉ pixel-art,
 *   modérément élargi, évoluant par bande d'ère (5 stades : antique → classique →
 *   industriel → moderne → futuriste). Les lampadaires (drawMedianLamps) et les
 *   bandes de voie pointillées restent PROCÉDURAUX par-dessus (glow de nuit).
 *
 *   Méthode = « scène verticale → tuilage » (comme pixelBridge) : une bande plantée
 *   verticale par ère (public/pixelart/medians/median-<era>-scene.png), blittée par
 *   sous-rects [culée | travée×N | culée] le long du segment. Orientation verticale
 *   directe ; segments horizontaux via version pivotée 90° (végétation = rotation OK).
 *
 *   Câblage : renderWorld.js, dans cityMapDrawRoadMarkings — on appelle drawPixelMedians
 *   AVANT la boucle des segments, qui n'imprime alors plus l'aplat medianCol (mais garde
 *   dashes + lampes). Repli : flag off / asset absent → ruban plat procédural intact.
 * ============================================================================ */

export const pixelMedianFlag = { on: true };
export function setPixelMedian(on) { pixelMedianFlag.on = !!on; }
if (typeof window !== 'undefined') window.__pixelMedian = setPixelMedian;

// Invalidation du cache statique (le refuge est baké) quand une scène décode.
let onLoad = null;
export function setMedianOnLoad(cb) { onLoad = cb; }

// Bande d'ère → stade du terre-plein (calé sur plazaEraForBand pour cohérence avec
// le mobilier des places). Les refuges n'existent qu'à partir des avenues (~band 2).
function medianEraForBand(band) {
  const b = band | 0;
  if (b <= 3) return 'antique';
  if (b === 4) return 'classique';
  if (b === 5) return 'industriel';
  if (b === 6) return 'moderne';
  return 'futuriste';
}

const img = {}, ready = {}, bnd = {}, rot = {};

function computeBounds(src, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function makeRotated(im) {
  const c = document.createElement('canvas'); c.width = im.height; c.height = im.width;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(im, 0, 0);
  return { canvas: c, bounds: computeBounds(c, c.width, c.height) };
}

function ensure(era) {
  if (img[era] || typeof Image === 'undefined') return;
  const im = new Image();
  im.onload = () => { bnd[era] = computeBounds(im, im.width, im.height); rot[era] = makeRotated(im); ready[era] = 1; if (onLoad) onLoad(); };
  im.onerror = () => { console.warn('[pixelMedian] median-' + era + '-scene.png introuvable → repli ruban plat'); };
  im.src = '/pixelart/medians/median-' + era + '-scene.png';
  img[era] = im;
}

// Tuile la bande le long d'un axe (voir pixelBridge.drawTiled — même logique).
function drawTiled(ctx, src, b, dx, dy, dw, dh, along) {
  const CAP = 0.14;
  if (along === 'y') {
    const capS = Math.max(1, Math.round(b.h * CAP));
    const midY0 = b.y0 + capS, midY1 = b.y1 - capS, midH = Math.max(1, midY1 - midY0);
    const scale = dw / b.w, capD = capS * scale, midD = Math.max(1, midH * scale);
    if (dh <= capD * 2 + 2) { ctx.drawImage(src, b.x0, b.y0, b.w, b.h, dx, dy, dw, dh); return; }
    ctx.drawImage(src, b.x0, b.y0, b.w, capS, dx, dy, dw, capD);
    let yy = dy + capD; const endY = dy + dh - capD;
    while (yy < endY - 0.5) { const dHt = Math.min(midD, endY - yy), sHt = midH * (dHt / midD); ctx.drawImage(src, b.x0, midY0, b.w, sHt, dx, yy, dw, dHt); yy += dHt; }
    ctx.drawImage(src, b.x0, midY1, b.w, capS, dx, dy + dh - capD, dw, capD);
  } else {
    const capS = Math.max(1, Math.round(b.w * CAP));
    const midX0 = b.x0 + capS, midX1 = b.x1 - capS, midW = Math.max(1, midX1 - midX0);
    const scale = dh / b.h, capD = capS * scale, midD = Math.max(1, midW * scale);
    if (dw <= capD * 2 + 2) { ctx.drawImage(src, b.x0, b.y0, b.w, b.h, dx, dy, dw, dh); return; }
    ctx.drawImage(src, b.x0, b.y0, capS, b.h, dx, dy, capD, dh);
    let xx = dx + capD; const endX = dx + dw - capD;
    while (xx < endX - 0.5) { const dWt = Math.min(midD, endX - xx), sWt = midW * (dWt / midD); ctx.drawImage(src, midX0, b.y0, sWt, b.h, xx, dy, dWt, dh); xx += dWt; }
    ctx.drawImage(src, midX1, b.y0, capS, b.h, dx + dw - capD, dy, capD, dh);
  }
}

// Dessine TOUS les refuges plantés. Renvoie false (asset pas prêt / rien à faire /
// flag off) → l'appelant garde le ruban plat procédural.
export function drawPixelMedians(CM) {
  if (!pixelMedianFlag.on) return false;
  const L = CM.layout; if (!L) return false;
  // Le refuge planté se pose sur la COUTURE (L.terrePlein) des BOULEVARDS 2 cellules
  // (axes main élargis via runLineWide) — une vraie voie de chaque côté, refuge au
  // milieu, personne dessus. `{axis:"v", x, y0, y1}` = couture entre colonnes x|x+1 ;
  // `{axis:"h", y, x0, x1}` = couture entre rangées y|y+1.
  const segs = L.terrePlein;
  if (!Array.isArray(segs) || !segs.length) return false;
  const band = (L.counts && L.counts.eraBand) || 0;
  const era = medianEraForBand(band);
  ensure(era);
  if (!ready[era]) return false;
  const T = CM.TILE, z = CM.cam.zoom, s = T * z;
  const SX = (gx) => (gx * T - CM.cam.x) * z + CM.cw / 2;
  const SY = (gy) => (gy * T - CM.cam.y) * z + CM.ch / 2;
  const ctx = CM.ctx; const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  const medW = Math.max(3, s * 0.5);    // largeur du refuge planté centré sur la couture
  for (const sg of segs) {
    if (sg.axis === 'v') {                       // couture verticale (colonnes x|x+1)
      const cen = SX(sg.x + 1);
      const pa = SY(sg.y0), pb = SY(sg.y1 + 1);
      if (pb < -s || pa > CM.ch + s || cen < -s || cen > CM.cw + s) continue;
      const x0 = cen - medW / 2, len = pb - pa;
      capsuleClip(ctx, x0, pa, medW, len);        // pilule : les DEUX bouts arrondis
      drawTiled(ctx, img[era], bnd[era], x0, pa, medW, len, 'y');
      ctx.restore();
    } else {                                     // couture horizontale (rangées y|y+1)
      const cen = SY(sg.y + 1);
      const pa = SX(sg.x0), pb = SX(sg.x1 + 1);
      if (pb < -s || pa > CM.cw + s || cen < -s || cen > CM.ch + s) continue;
      const y0 = cen - medW / 2, len = pb - pa;
      capsuleClip(ctx, pa, y0, len, medW);
      drawTiled(ctx, rot[era].canvas, rot[era].bounds, pa, y0, len, medW, 'x');
      ctx.restore();
    }
  }
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// Clippe le contexte à une PILULE (stade/rounded-rect) autour du rect (x,y,w,h) : les
// deux extrémités (dans le sens LONG) deviennent des demi-cercles → refuge aux bouts
// ARRONDIS. Le rayon = demi petit-côté. ctx.save() ici → l'appelant fait ctx.restore().
function capsuleClip(ctx, x, y, w, h) {
  const r = Math.max(1, Math.min(w, h) / 2);
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else { // repli manuel (arcs)
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  ctx.clip();
}
