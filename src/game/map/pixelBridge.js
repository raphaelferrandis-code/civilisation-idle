/* ============================================================================
 * pixelBridge.js — PONTS pixel-art (derrière flag pixelBridgeFlag.on)
 *
 *   Direction B (validée 2026-07-06) : TABLIER À PLAT vu de dessus, orienté pour
 *   le pont central (colonne verticale N-S). 5 stades matière par bande d'ère :
 *   bois → pierre → fer → béton → énergie. Double-voie (2 tuiles) dès la bande 2,
 *   assurée MÉCANIQUEMENT par bridgeCrossing (roadGraph.js) — ici on ne fait que
 *   remplir la largeur RÉELLE du span (1 ou 2 cellules).
 *
 *   Méthode = « scène large → tuilage » (comme les aqueducs) mais SANS fichiers
 *   découpés : on charge une scène verticale par ère (public/pixelart/bridges/
 *   bridge-<era>-scene.png, tablier continu bord-à-bord) et on blitte par sous-rects
 *   [culée-haut | travée répétée | culée-bas] pour couvrir un fleuve de largeur
 *   quelconque. La travée continue = ce qui fait raccorder les répétitions.
 *
 *   Câblage : cityMapRuntime.js, à la place EXACTE de cityMapDrawBridges() (bake
 *   statique ET repli live), même z-order. Si le flag est OFF, l'asset pas chargé,
 *   ou drawPixelBridges renvoie false → repli sur cityMapDrawBridges procédural.
 *   Les lampes de pont (cityMapDrawBridgeLights) restent procédurales par-dessus.
 *
 *   Orientation : le tablier est authored VERTICAL. Les rares traversées HORIZONTALES
 *   (secondaires) réutilisent une version pivotée 90° (compromis lumière assumé).
 * ============================================================================ */

export const pixelBridgeFlag = { on: true };

// Dev : window.__pixelBridge(on) bascule pont pixel <-> pont vectoriel (A/B test).
export function setPixelBridge(on) { pixelBridgeFlag.on = !!on; }
if (typeof window !== 'undefined') window.__pixelBridge = setPixelBridge;

// Callback d'invalidation du cache statique (le pont est baké) : appelé quand une
// scène finit de décoder, sinon le pont procédural de repli resterait baké jusqu'au
// prochain re-bake fortuit (caméra/nuit/santé). Cf. onPavingLoad dans plazaProps.
let onLoad = null;
export function setBridgeOnLoad(cb) { onLoad = cb; }

// Bande d'ère (0..9) → stade matière du pont. La bascule bois→pierre coïncide avec
// le passage 1→2 voies (bande 2) : bois est le seul tablier 1-voie, les autres 2-voies.
//   0-1 Feu/Bois → bois   ·   2-3 Pierre/Couronne → pierre   ·   4-5 → fer
//   6 → béton                ·   7-9 cosmiques → énergie
export function bridgeEraForBand(band) {
  const b = band | 0;
  if (b <= 1) return 'bois';
  if (b <= 3) return 'pierre';
  if (b <= 5) return 'fer';
  if (b === 6) return 'beton';
  return 'energie';
}

// --- Chargement paresseux par ère + pré-calcul (bornes de contenu + version pivotée) ---
const img = {};      // era -> Image (scène verticale)
const ready = {};    // era -> 1 quand décodée
const bnd = {};      // era -> {x0,y0,x1,y1,w,h} bornes opaques (marge transparente retirée)
const rot = {};      // era -> { canvas, bounds } version pivotée 90° (ponts horizontaux)

function computeBounds(canvasLike, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(canvasLike, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Pivote la scène verticale de 90° horaire → tablier horizontal (pour les ponts H).
function makeRotated(im) {
  const c = document.createElement('canvas'); c.width = im.height; c.height = im.width;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(im, 0, 0);
  return { canvas: c, bounds: computeBounds(c, c.width, c.height) };
}

function ensure(era) {
  if (img[era] || typeof Image === 'undefined') return;
  const im = new Image();
  im.onload = () => {
    bnd[era] = computeBounds(im, im.width, im.height);
    rot[era] = makeRotated(im);
    ready[era] = 1;
    if (onLoad) onLoad();   // invalide le bake statique → re-bake avec le pont pixel
  };
  im.onerror = () => { console.warn('[pixelBridge] bridge-' + era + '-scene.png introuvable → repli pont vectoriel'); };
  im.src = '/pixelart/bridges/bridge-' + era + '-scene.png';
  img[era] = im;
}

// Tuile le tablier le long d'un axe pour remplir (dx,dy,dw,dh).
//   along='y' : travée verticale (axe long = Y, largeur = X) ;
//   along='x' : travée horizontale (axe long = X, largeur = Y).
// La tranche du milieu (hors 2 culées) est répétée ; la dernière est rognée pile.
function drawTiled(ctx, src, b, dx, dy, dw, dh, along) {
  const CAP = 0.16; // fraction de l'axe long réservée à chaque culée
  if (along === 'y') {
    const capS = Math.max(1, Math.round(b.h * CAP));
    const midY0 = b.y0 + capS, midY1 = b.y1 - capS, midH = Math.max(1, midY1 - midY0);
    const scale = dw / b.w, capD = capS * scale, midD = Math.max(1, midH * scale);
    if (dh <= capD * 2 + 2) { ctx.drawImage(src, b.x0, b.y0, b.w, b.h, dx, dy, dw, dh); return; }
    ctx.drawImage(src, b.x0, b.y0, b.w, capS, dx, dy, dw, capD);                    // culée haut
    let yy = dy + capD; const endY = dy + dh - capD;
    while (yy < endY - 0.5) {
      const dHt = Math.min(midD, endY - yy), sHt = midH * (dHt / midD);
      ctx.drawImage(src, b.x0, midY0, b.w, sHt, dx, yy, dw, dHt);
      yy += dHt;
    }
    ctx.drawImage(src, b.x0, midY1, b.w, capS, dx, dy + dh - capD, dw, capD);         // culée bas
  } else {
    const capS = Math.max(1, Math.round(b.w * CAP));
    const midX0 = b.x0 + capS, midX1 = b.x1 - capS, midW = Math.max(1, midX1 - midX0);
    const scale = dh / b.h, capD = capS * scale, midD = Math.max(1, midW * scale);
    if (dw <= capD * 2 + 2) { ctx.drawImage(src, b.x0, b.y0, b.w, b.h, dx, dy, dw, dh); return; }
    ctx.drawImage(src, b.x0, b.y0, capS, b.h, dx, dy, capD, dh);                      // culée gauche
    let xx = dx + capD; const endX = dx + dw - capD;
    while (xx < endX - 0.5) {
      const dWt = Math.min(midD, endX - xx), sWt = midW * (dWt / midD);
      ctx.drawImage(src, midX0, b.y0, sWt, b.h, xx, dy, dWt, dh);
      xx += dWt;
    }
    ctx.drawImage(src, midX1, b.y0, capS, b.h, dx + dw - capD, dy, capD, dh);         // culée droite
  }
}

function drawSpan(CM, sp, era) {
  if (!sp || !sp.cells || !sp.cells.length) return;
  const vertical = sp.vertical, exits = sp.exits;
  let g0x = sp.gx0, g1x = sp.gx1, g0y = sp.gy0, g1y = sp.gy1;
  if (exits && exits.length) {                       // prolonge jusqu'aux routes d'atterrissage
    const xs = exits.map((r) => r.gx), ys = exits.map((r) => r.gy);
    if (vertical) { g0y = Math.min(g0y, ...ys); g1y = Math.max(g1y, ...ys); }
    else { g0x = Math.min(g0x, ...xs); g1x = Math.max(g1x, ...xs); }
  }
  const T = CM.TILE, z = CM.cam.zoom, s = T * z;
  const sx = (g0x * T - CM.cam.x) * z + CM.cw / 2;
  const sy = (g0y * T - CM.cam.y) * z + CM.ch / 2;
  const w = (g1x - g0x + 1) * s, h = (g1y - g0y + 1) * s;
  if (sx < -w - s || sy < -h - s || sx > CM.cw + s || sy > CM.ch + s) return;
  const ctx = CM.ctx;
  // Ombre de contact sur l'eau (léger décalage bas-droite, cf. lumière haut-gauche).
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.fillRect(sx + s * 0.06, sy + s * 0.06, w, h);
  if (vertical) drawTiled(ctx, img[era], bnd[era], sx, sy, w, h, 'y');
  else drawTiled(ctx, rot[era].canvas, rot[era].bounds, sx, sy, w, h, 'x');
}

// Entrée principale : dessine TOUS les spans de pont en pixel-art. Renvoie false
// (asset pas prêt / pas de span / flag off) → l'appelant retombe sur le procédural.
export function drawPixelBridges(CM) {
  if (!pixelBridgeFlag.on) return false;
  const L = CM.layout; if (!L) return false;
  const spans = CM.bridgeSpans; if (!spans || !spans.length) return false;
  const band = (L.counts && L.counts.eraBand) || 0;
  const era = bridgeEraForBand(band);
  ensure(era);
  if (!ready[era]) return false;
  const prev = CM.ctx.imageSmoothingEnabled;
  CM.ctx.imageSmoothingEnabled = false;   // pixel-art net (nearest)
  for (const sp of spans) drawSpan(CM, sp, era);
  CM.ctx.imageSmoothingEnabled = prev;
  return true;
}
