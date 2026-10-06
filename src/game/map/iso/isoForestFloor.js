// LE SOL DE LA FORÊT — le sous-bois (docs/PLAN-VEGETATION.md, lot 3, 2026-10-04).
//
// Sous les fourrés, le sol était la même pelouse fleurie que dans le pré : les arbres
// avaient l'air POSÉS SUR UN GAZON. Le sous-bois est maintenant plus sombre et plus
// froid, et ne fleurit pas.
//
// ⛔ PAS DE TON PAR CELLULE. Quatre refus de Raph (jitter d'aplat, voile en plaques,
// usure en ellipses, damier) : un voile dosé losange par losange montre la grille dès
// que son alpha dépasse quelques pour cent — et le sous-bois en demande trente. Le
// voile est donc peint en UNE image : un pixel par cellule (la part de sous-bois),
// posée sous la transformée iso de la carte avec le LISSAGE du navigateur. Le
// bilinéaire fait un dégradé continu d'un centre de cellule à l'autre : aucune marche,
// aucun losange.
//
// LA PART DE SOUS-BOIS d'une cellule suit la forêt elle-même : la densité des fourrés
// (forestDensity, celle qui plante les arbres) et la distance à la vie (TREE_LIFE : pas
// d'arbre au ras des maisons, donc pas d'ombre non plus). Une cellule de ville, de route
// ou d'eau n'en a pas.
//
// Cuit dans les tuiles du sol (pyramide) : la distance à la vie dépend des routes et des
// emprises jusqu'à 5 cellules — tileSig la signe (cf. forestFloorSig).
// Molette : __forestFloor(false) | ({ alpha, col, from, span, flowerCut }).
import { CM, TREE_LIFE, treeLifeKeep } from '../layout.js';
import { WINTER } from '../seasonMode.js';
import { worldToScreen } from './projection.js';
import { FOREST, forestDensity, forestLifeDist } from './isoWildForest.js';
import { solInvalidate } from './solInvalidate.js';
import { meadowPixel, townLawnAt } from './isoMeadow.js';
import { courOf } from './isoTissu.js';
import { mkCanvas } from '../pixelUtil.js';

export const FOREST_FLOOR = {
  on: true,
  alpha: 0.32,              // voile au cœur d'un fourré dense
  col: [20, 36, 26],        // vert froid, presque noir : l'ombre sous les couronnes
  from: 0.42, span: 0.36,   // densité où le sous-bois commence, et sur quelle plage il s'installe
  flowerCut: 0.3,           // au-delà, les fleurs s'éteignent (plus aucune à from + 2·flowerCut·span)
  winter: 0.55,             // sur la neige, l'ombre reste plus légère
};
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__forestFloor = (o) => {
    if (o === false) FOREST_FLOOR.on = false;
    else if (o && typeof o === 'object') Object.assign(FOREST_FLOOR, { on: true }, o);
    else FOREST_FLOOR.on = true;
    solInvalidate('all');
    return { ...FOREST_FLOOR };
  };
}

// Part de sous-bois (0..1) des cellules de ce layout. Mémoïsée sur le layout ET les
// réglages (la forêt peut être retouchée à chaud).
export function forestFloorAt(L) {
  const sig = FOREST.on + ':' + FOREST.holeScale + ':' + FOREST.contrast + ':' + FOREST_FLOOR.from + ':' + FOREST_FLOOR.span
    + ':' + (TREE_LIFE.on ? TREE_LIFE.clear + '/' + TREE_LIFE.keep.join('/') : 'off');
  if (L._forestFloor && L._forestFloor.sig === sig) return L._forestFloor.at;
  const lifeD = forestLifeDist(L);
  const urban = L.urbanSet, roads = L.roadSet;
  const river = (L.river && L.river.present && L.river.cells) || null;
  const { from, span } = FOREST_FLOOR;
  const at = (gx, gy) => {
    let keep = 1;
    if (lifeD) { keep = treeLifeKeep(lifeD.at(gx, gy)); if (keep <= 0) return 0; }
    const k = gx + ',' + gy;
    if ((roads && roads.has(k)) || (river && river.has(k))) return 0;
    if (!lifeD && urban && urban.has(k)) return 0;
    const d = (forestDensity(gx, gy) - from) / span;
    return d <= 0 ? 0 : (d >= 1 ? 1 : d) * keep;
  };
  L._forestFloor = { sig, at };
  return at;
}

// Les fleurs s'éteignent sous les couronnes. `base` : le multiplicateur déjà en place
// (camp : herbe piétinée), ou null.
export function forestFlowerK(L, base) {
  if (!FOREST_FLOOR.on) return base;
  const at = forestFloorAt(L), cut = FOREST_FLOOR.flowerCut;
  return (gx, gy) => {
    const f = at(gx, gy);
    const k = f <= cut ? 1 : Math.max(0, 1 - (f - cut) / cut);
    return base ? base(gx, gy) * k : k;
  };
}

// UN VOILE LISSÉ sur les cellules `b` (gx0..gx1, gy0..gy1) : `fill(gx, gy, d, o)`
// écrit le pixel RGBA d'une cellule dans d[o..o+3] et rend true s'il y a quelque chose.
// Pixel (i, j) = cellule (gx0 + i, gy0 + j) : la transformée iso envoie le carré
// [i, i+1]×[j, j+1] sur le losange de la cellule, et le lissage du navigateur fait le
// dégradé d'un centre de cellule à l'autre. Partagé avec les prés (isoMeadow).
export function drawCellVeil(ctx, b, T, fill) {
  const W = b.gx1 - b.gx0 + 1, H = b.gy1 - b.gy0 + 1;
  if (W <= 0 || H <= 0 || W * H > 400000) return;
  let any = false;
  const img = new ImageData(W, H);
  const d = img.data;
  for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) {
    if (fill(b.gx0 + i, b.gy0 + j, d, (j * W + i) * 4)) any = true;
  }
  if (!any) return;
  const c = mkCanvas(W, H);
  c.getContext('2d').putImageData(img, 0, 0);
  const O = worldToScreen(b.gx0 * T, b.gy0 * T);
  const X = worldToScreen((b.gx0 + 1) * T, b.gy0 * T), Y = worldToScreen(b.gx0 * T, (b.gy0 + 1) * T);
  ctx.save();
  ctx.transform(X.x - O.x, X.y - O.y, Y.x - O.x, Y.y - O.y, O.x, O.y);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0);
  ctx.restore();
}

// Le voile du sous-bois, peint une fois par cuisson.
function drawForestFloor(ctx, b, L, T) {
  if (!FOREST_FLOOR.on || !L) return;
  const at = forestFloorAt(L);
  const A = FOREST_FLOOR.alpha * (CM.season === WINTER ? FOREST_FLOOR.winter : 1);
  const [r, g, bl] = FOREST_FLOOR.col;
  drawCellVeil(ctx, b, T, (gx, gy, d, o) => {
    const f = at(gx, gy);
    d[o] = r; d[o + 1] = g; d[o + 2] = bl;
    if (f <= 0) return false;
    d[o + 3] = Math.round(f * A * 255);
    return true;
  });
}

// LES VOILES LISSÉS DE L'HERBE — prés et pelouse de ville (isoMeadow) puis sous-bois —
// DANS l'herbe seule :
// le lissage déborderait d'une demi-cellule sur le trottoir voisin. `mask` : coins nord
// des losanges d'herbe (x, y à plat) ; `maskR` : rectangles d'herbe des cellules de
// lisière arrondie (x0, y0, x1, y1 à plat) — la géométrie même des voiles de prés.
export function drawGrassVeils(ctx, b, L, T, hw, hh, mask, maskR) {
  if (!L || (!mask.length && !maskR.length)) return;
  const meadow = meadowPixel(L, townLawnAt(L, courOf(L)));
  if (!meadow && !FOREST_FLOOR.on) return;
  ctx.save();
  // ⚠ Pas diamondPath (isoQuad) : il ouvre un NOUVEAU chemin à chaque losange, le
  // gabarit n'aurait gardé que le dernier.
  ctx.beginPath();
  for (let i = 0; i < mask.length; i += 2) {
    const x = mask[i], y = mask[i + 1];
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y + hh); ctx.lineTo(x, y + 2 * hh); ctx.lineTo(x - hw, y + hh); ctx.closePath();
  }
  for (let i = 0; i < maskR.length; i += 4) ctx.rect(maskR[i], maskR[i + 1], maskR[i + 2] - maskR[i], maskR[i + 3] - maskR[i + 1]);
  ctx.clip();
  if (meadow) drawCellVeil(ctx, b, T, meadow);
  drawForestFloor(ctx, b, L, T);
  ctx.restore();
}

// Signature de tuile : la part de sous-bois dépend de la distance à la vie, qui bouge
// quand une route ou une emprise apparaît jusqu'à 5 cellules HORS de la tuile.
export function forestFloorSig(L, mix, gx0, gx1, gy0, gy1) {
  if (!FOREST_FLOOR.on) return;
  const lifeD = forestLifeDist(L);
  if (!lifeD) return;
  for (let gy = gy0; gy <= gy1; gy += 1) for (let gx = gx0; gx <= gx1; gx += 1) {
    const v = lifeD.at(gx, gy);
    if (v !== 255) { mix(gx * 31 + gy * 977); mix(v); }
  }
}
