/* ============================================================================
 * roadPaving.js — CHAUSSÉE des routes = MATIÈRE DU PONT, par ère
 *   (derrière flag pixelRoadPavingFlag.on)
 *
 *   Choix joueur (2026-07-07) : « garder le look du pont et l'appliquer aux
 *   routes ». Au lieu de l'APLAT plat de la chaussée (streetRoadColors), la rue
 *   pixel prend la MATIÈRE de la travée du pont de l'ère — plateau bois / dalle
 *   pierre / tôle fer / béton / surface énergie. Le pont devient la référence,
 *   la route s'y aligne : pont et route sont alors la même surface.
 *
 *   Méthode : on découpe UNE tranche PROPRE de la voie roulable de
 *   bridge-<era>-scene.png (rects RECT ci-dessous — sans garde-corps, marquages,
 *   végétation ni rails lumineux), on en fait une tuile MIROIR 2×2 (sans couture)
 *   et on la RÉPÈTE via un canvas-pattern ANCRÉ AU MONDE (matrice cam) pour que le
 *   grain reste collé à la carte au pan de caméra (sinon il « glisse »).
 *
 *   Mapping ère→matière = bridgeEraForBand (importé de pixelBridge) → 5 stades
 *   répartis sur les 10 bandes, donc pont ET route changent EN MÊME TEMPS.
 *
 *   Câblage : pixelTerrain.drawPixelTerrain, à la place de l'aplat roadCol. La
 *   tuile est bakée dans le cache SOL → invalidation au décodage via
 *   setRoadPavingOnLoad (cf. renderWorld). Repli : flag off / asset pas prêt /
 *   pattern non supporté → aplat plat procédural intact.
 * ============================================================================ */

import { bridgeEraForBand } from './pixelBridge.js';

export const pixelRoadPavingFlag = { on: true };
// Dev : window.__roadPaving(on) bascule chaussée-matière-pont <-> aplat plat (A/B test).
export function setRoadPaving(on) { pixelRoadPavingFlag.on = !!on; }
if (typeof window !== 'undefined') window.__roadPaving = setRoadPaving;

// Invalidation du cache SOL (la chaussée est bakée) quand une scène décode.
let onLoad = null;
export function setRoadPavingOnLoad(cb) { onLoad = cb; }

// Tranche ROULABLE propre par matière (colonnes x de bridge-<era>-scene.png, hors
// garde-corps / marquages / végétation / rails). Calées à la main sur le profil des
// scènes ; à re-vérifier si une scène de pont est régénérée.
const RECT = { bois: [16, 30], pierre: [41, 57], fer: [42, 53], beton: [44, 60], energie: [42, 58] };

const scene = {};   // era -> Image
const tile = {};    // era -> { canvas (tuile miroir), mean:[r,g,b], edge:'rgb(...)' }
const ready = {};   // era -> 1 quand la tuile est prête

// Découpe la tranche, calcule la teinte moyenne (pour le liseré) et fabrique une
// tuile MIROIR 2×2 (réflexion → répétition sans couture).
function buildTile(era, im) {
  const [x0, x1] = RECT[era];
  const w = x1 - x0 + 1;
  const H = im.height;
  const py0 = Math.round(H * 0.40);
  const ph = Math.max(8, Math.min(48, H - py0));         // bande médiane propre (pas de culée)
  const c0 = document.createElement('canvas');
  c0.width = im.width; c0.height = im.height;
  const g0 = c0.getContext('2d'); g0.imageSmoothingEnabled = false; g0.drawImage(im, 0, 0);
  const d = g0.getImageData(x0, py0, w, ph).data;
  // teinte moyenne des pixels opaques
  let mr = 0, mg = 0, mb = 0, mn = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 60) { mr += d[i]; mg += d[i + 1]; mb += d[i + 2]; mn += 1; } }
  mn = mn || 1;
  const mean = [Math.round(mr / mn), Math.round(mg / mn), Math.round(mb / mn)];
  // tuile miroir 2w×2ph (opaque)
  const TW = w * 2, TH = ph * 2;
  const tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
  const tg = tc.getContext('2d');
  const out = tg.createImageData(TW, TH);
  for (let y = 0; y < TH; y += 1) {
    const sy = y < ph ? y : (TH - 1 - y);
    for (let x = 0; x < TW; x += 1) {
      const sx = x < w ? x : (TW - 1 - x);
      const si = (sy * w + sx) * 4, di = (y * TW + x) * 4;
      out.data[di] = d[si]; out.data[di + 1] = d[si + 1]; out.data[di + 2] = d[si + 2]; out.data[di + 3] = 255;
    }
  }
  tg.putImageData(out, 0, 0);
  const e = (v) => Math.round(v * 0.42);
  tile[era] = { canvas: tc, mean, edge: 'rgb(' + e(mean[0]) + ',' + e(mean[1]) + ',' + e(mean[2]) + ')' };
}

function ensure(era) {
  if (scene[era] || typeof Image === 'undefined') return;
  const im = new Image();
  im.onload = () => {
    try { buildTile(era, im); ready[era] = 1; if (onLoad) onLoad(); }
    catch (e) { console.warn('[roadPaving] extraction ' + era + ' échouée → aplat plat', e); }
  };
  im.onerror = () => { console.warn('[roadPaving] bridge-' + era + '-scene.png introuvable → aplat plat'); };
  im.src = '/pixelart/bridges/bridge-' + era + '-scene.png';
  scene[era] = im;
}

// Bandes SANS chaussée matière-pont → repli sur l'aplat plat. Le BOIS (bandes 0-1)
// rendait mal en route (choix Raphaël 2026-07-07) : on l'exclut. `ready` renvoie
// vrai (rien à extraire → le bake se fige direct), `tile` renvoie null (aplat).
const SKIP_PAVING = (band) => (band | 0) <= 1;

export function roadPavingReady(band) { if (SKIP_PAVING(band)) return true; const era = bridgeEraForBand(band); ensure(era); return !!ready[era]; }
export function roadPavingTile(band) { if (SKIP_PAVING(band)) return null; const era = bridgeEraForBand(band); ensure(era); return tile[era] || null; }
