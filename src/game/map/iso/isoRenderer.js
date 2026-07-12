"use strict";
// ── CHANTIER ISO — Phase 1 : renderer du JALON go/no-go ─────────────────────
// Rendu isométrique SÉPARÉ du pipeline legacy (leçon greybox : ne pas infecter
// renderWorld de demi-conversions). Branché dans la frame par `CM.iso` ; le
// legacy reste intact au flag près. Ce renderer réutilise LE MÊME layout et les
// helpers de sprites existants — il ne re-calcule rien côté jeu.
//
// Périmètre Phase 1 (voulu MINCE, on juge le SOL et la LISIBILITÉ) :
//   - sol en losanges flat-shaded (herbe/urbain/place/eau) + routes par matière d'ère ;
//   - habitations posées TELLES QUELLES (sprites actuels, ancrés au coin sud) ;
//   - tuiles moteur/civiques = SOCLE teinté (scènes → Phase 3) ;
//   - arbres = sapin minimal ; habitants = sprites actuels (4 dirs cardinales,
//     re-générés en diagonales en Phase 4) ; véhicules mis à jour mais PAS dessinés ;
//   - PAS de nuit/santé/LOD/lumières/ponts/quais/merveilles ici (Phases 3-5).
// Tuiles PixelLab iso : APRÈS le go (le jalon protège le budget d'art).
import { CM, cmHash, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from '../layout.js';
import { worldToScreen, visibleCellBounds, depthOf, ISO_X, ISO_Y } from './projection.js';
import { drawPixelHouse, pixelHouseReady } from '../pixelHouses.js';
import { drawEngineSprite } from '../buildingShapes.js';
import { propReady, blitProp, propBBox, propImage } from '../cityEngineSprites.js';
import { cityMapDrawQuays } from '../renderWorld.js';
import { drawPixelBridges } from '../pixelBridge.js';
import {
  updateCitizens, updateVehicles, drawEraAgent, drawEraAgentIso, drawNamedAgent,
  vehicleLaneOffset, ensureVeh, vehReady, VEH_SIZES, VEH_PULL, VEH_PUSH,
  ensureBoat, boatReady, BOAT_SIZES, BOAT_LIFT, ensureDrone, drawDroneRotors,
  ensureVehDiag, vehDiagReady,
} from '../agents.js';

// ── Palette Phase 1 (flat, calée sur les teintes du rendu actuel) ────────────
const GRASS = [116, 138, 84];        // herbe / nature
const GRASS_WILD = [98, 120, 76];    // hors ville (léger contraste)
const WATER = [74, 98, 109];         // eau ardoise (cf. fleuve)
const PLAZA = [214, 206, 182];       // dallage d'esplanade
// Sol urbain + chaussée par grande bande d'ère (0-2 antique, 3-6 classique/indus, 7+ moderne+).
// Contraste volontairement marqué (1er jet trop plat au jalon) : la rue doit se LIRE.
function urbanTone(band) {
  return band >= 7 ? [156, 154, 146] : band >= 3 ? [176, 166, 138] : [158, 144, 110];
}
// Matière de chaussée par ère (calée sur la progression du jeu) :
// terre battue → pavé de pierre → asphalte industriel → voie sombre futuriste.
function roadTone(band) {
  return band >= 7 ? [58, 60, 70]
    : band >= 5 ? [86, 86, 90]
      : band >= 3 ? [118, 110, 96]
        : [134, 114, 80];
}
const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// ── Tuiles de SOL PixelLab (post-GO) — /pixelart/iso/<key>.png ────────────────
// Chargées paresseusement ; tant qu'un PNG n'est pas prêt, le losange garde son
// APLAT (repli) → aucune dépendance dure à l'art. bbox mesurée une fois (alpha>16,
// même geste que pixelHouses.contentBBox) : le HAUT du contenu = sommet NORD du
// losange, largeur du contenu → largeur du losange (2·hw). L'épaisseur « thin
// tile » déborde vers le sud : recouverte par les rangées suivantes (le bake
// balaie gy croissant) → lisière naturelle sur les bords sud. Invalide le bake
// sol iso à chaque PNG décodé (sinon l'aplat reste gelé dans le cache).
const ISO_TILE_KEYS = { grass: 'iso-grass', dirt: 'iso-dirt', urban: 'iso-pavement', plaza: 'iso-plaza' };
const isoTileCache = new Map();   // key -> { img, ready, bbox }
function isoTileBBox(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return null;
  let c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  else { c = document.createElement('canvas'); c.width = w; c.height = h; }
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0);
  let data;
  try { data = cx.getImageData(0, 0, w, h).data; } catch { return { x0: 0, y0: 0, w, h }; }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (data[(y * w + x) * 4 + 3] > 16) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, w, h };
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function ensureIsoTile(kind) {
  const key = ISO_TILE_KEYS[kind];
  if (!key) return null;
  let e = isoTileCache.get(key);
  if (e) return e;
  e = { img: null, ready: false, bbox: null };
  isoTileCache.set(key, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      e.bbox = isoTileBBox(im);
      e.ready = !!e.bbox;
      CM._isoGroundBake = null;   // re-bake : remplace l'aplat de repli
    };
    im.src = '/pixelart/iso/' + key + '.png';
    e.img = im;
  }
  return e;
}
// Blit une tuile de sol sur la cellule dont le coin NORD projeté est (nx, ny).
// ⚠ FACE SEULE : on ne prend que le haut 2:1 du contenu (bb.w × bb.w/2) et on
// laisse l'ÉPAISSEUR du « thin tile » de côté — la dessiner peignait un liseré
// sombre au sud de CHAQUE cellule → quadrillage criard sur tout le sol (1er jet).
// Un sol plat doit être une SURFACE continue, pas un empilement de tuiles.
// Renvoie false si pas prête (l'appelant garde l'aplat).
function blitIsoTile(ctx, kind, nx, ny, hw, mirror = false) {
  const e = ensureIsoTile(kind);
  if (!e || !e.ready) return false;
  const bb = e.bbox;
  const faceH = Math.max(1, Math.round(bb.w / 2));   // face iso 2:1 du contenu
  const k = (hw * 2) / bb.w;
  const dw = Math.ceil(bb.w * k) + 1;          // +1 px : anti-couture entre losanges
  const dh = Math.ceil(faceH * k) + 1;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (mirror) {
    // Miroir horizontal 1 cellule sur ~2 (hash) : casse la répétition du motif
    // sans 2e asset — légitime pour une FACE de sol (pas d'ombrage directionnel fort).
    ctx.save();
    ctx.translate(Math.round(nx - hw) + dw, Math.round(ny));
    ctx.scale(-1, 1);
    ctx.drawImage(e.img, bb.x0, bb.y0, bb.w, faceH, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(e.img, bb.x0, bb.y0, bb.w, faceH, Math.round(nx - hw), Math.round(ny), dw, dh);
  }
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// Losange d'une cellule à partir de son coin NORD projeté (évite 4 worldToScreen :
// les 4 sommets se déduisent du pas de grille, constant à zoom fixe).
function diamondPath(ctx, nx, ny, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx + hw, ny + hh);
  ctx.lineTo(nx, ny + hh * 2);
  ctx.lineTo(nx - hw, ny + hh);
  ctx.closePath();
}

// Quad monde → écran (la projection est linéaire : un rectangle monde reste un
// parallélogramme écran). Sert aux rubans de chaussée.
function fillWorldQuad(ctx, x0, y0, x1, y1) {
  const a = worldToScreen(x0, y0), b = worldToScreen(x1, y0);
  const c = worldToScreen(x1, y1), d = worldToScreen(x0, y1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

// ── SOL (baké : ~10-30 ms une fois par zoom/marge, blitté ensuite) ────────────
// Les cellules-route ne remplissent PLUS tout leur losange (1er jet : rue aussi
// large qu'un îlot → grille illisible). Comme en legacy : fond de TROTTOIR (ton
// urbain) + RUBAN de chaussée plus étroit le long des connexions (masque E/O/S/N).
const ROAD_BAND = 0.30;   // demi-largeur du ruban (fraction de tuile)
function drawIsoGround() {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const hw = T * z * ISO_X;            // demi-largeur du losange
  const hh = T * z * ISO_Y;            // demi-hauteur
  const b = visibleCellBounds(hw * 2);
  const band = (L.counts && L.counts.eraBand) | 0;
  const urb = urbanTone(band), road = roadTone(band);
  const riverCells = (L.river && L.river.present && L.river.cells) || null;
  const roadMap = L.roadMap;
  const N = L.gridN | 0;
  const roads = [];                    // cellules-route de la passe (rubans après le fond)
  ctx.save();
  ctx.lineJoin = 'round';
  for (let gy = b.gy0; gy <= b.gy1; gy += 1) {
    for (let gx = b.gx0; gx <= b.gx1; gx += 1) {
      const key = gx + ',' + gy;
      const isRoad = L.roadSet.has(key);
      const cell = isRoad && roadMap ? roadMap.get(key) : null;
      const isPlaza = !!(cell && cell.rank === 'plaza');       // ⚠ piège places-dans-roadSet
      const isBridge = !!(cell && cell.roadSurface === 'bridge');
      const isWater = !!(riverCells && riverCells.has(key));
      const inGrid = gx >= 0 && gy >= 0 && gx < N && gy < N;
      const isUrban = (isRoad && !isBridge) || (L.urbanSet && L.urbanSet.has(key));
      // kind = tuile PixelLab ; tone = repli aplat tant que le PNG n'est pas prêt.
      // L'EAU n'est plus peinte ici : le fleuve est un RUBAN LIVE lissé par-dessus
      // le bake (drawIsoRiver) — le sol sous l'eau reste de l'herbe (berges douces).
      let kind, tone;
      // Quand la SCÈNE de place de l'ère est décodée, la dalle claire disparaît
      // (la scène porte son propre dallage — l'ancienne dalle dépassait autour,
      // retour Raph) : les cellules plaza redeviennent du sol urbain calme.
      const plazaSceneUp = isPlaza && plazaEraForBand(band) && isoArt('plaza-' + plazaEraForBand(band)).ready;
      if (isPlaza && !plazaSceneUp) { kind = 'plaza'; tone = PLAZA; }
      else if (plazaSceneUp) { kind = 'urban'; tone = urb; }
      else if (isUrban && !isWater) { kind = (L.urbanSet && L.urbanSet.has(key)) ? 'urban' : 'dirt'; tone = urb; }
      else if (!isWater && riverCells && L.river.banks && L.river.banks.has(key) && L.urbanSet
        && (L.urbanSet.has((gx + 1) + ',' + gy) || L.urbanSet.has((gx - 1) + ',' + gy)
          || L.urbanSet.has(gx + ',' + (gy + 1)) || L.urbanSet.has(gx + ',' + (gy - 1)))) {
        // QUAI-LITE : une berge qui touche le tissu urbain se pave (berge bâtie) —
        // esquisse des quais legacy ; le vrai quai par ère viendra avec l'art Phase 5.
        kind = 'urban'; tone = urb;
      } else { kind = 'grass'; tone = inGrid ? GRASS : GRASS_WILD; }
      const p = worldToScreen(gx * T, gy * T);   // coin NORD du losange
      const mir = ((cmHash(key) >>> 3) & 1) === 1;
      // Dosage par matière : l'URBAIN reste un aplat CALME avec un simple GRAIN de
      // texture (alpha faible) — la tuile pleine tapissait la ville d'un motif
      // fissuré qui concurrençait les bâtiments (v2 refusée à la capture). Herbe
      // et place gardent leur tuile pleine (elles portent bien le détail).
      const texAlpha = kind === 'urban' ? 0.3 : kind === 'dirt' ? 0.5 : 1;
      const tile = kind ? ensureIsoTile(kind) : null;
      const tileReady = !!(tile && tile.ready);
      if (!tileReady || texAlpha < 1) {
        // Aplat (repli OU sous-couche du grain) : variance douce stable par seed,
        // MODULÉE PAR ÎLOT (blocs ~6×6) — retour Raph « sols très plats » : le
        // patchwork de quartiers casse la grande nappe uniforme.
        const blockV = 0.95 + ((cmHash('blk:' + (gx >> 2) + ':' + (gy >> 2)) % 100) / 100) * 0.1;
        const v = (0.96 + ((cmHash(key) % 100) / 100) * 0.08) * (kind === 'urban' ? blockV : 1);
        ctx.fillStyle = rgb(tone, v);
        diamondPath(ctx, p.x, p.y, hw, hh);
        ctx.fill();
        // Anti-couture : fin liseré de la même couleur par-dessus les bords partagés.
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
        // Usure éparse : petite tache sombre sur ~1 cellule urbaine sur 9 (plaque,
        // regard, réparation) — brise la platitude sans bruit systématique.
        if (kind === 'urban' && !isRoad && (cmHash('wear:' + key) % 9) === 0) {
          ctx.fillStyle = 'rgba(40,38,30,0.14)';
          const wx0 = (gx + 0.3 + ((cmHash('wx:' + key) % 40) / 100)) * T;
          const wy0 = (gy + 0.3 + ((cmHash('wy:' + key) % 40) / 100)) * T;
          const q = worldToScreen(wx0, wy0);
          ctx.beginPath();
          ctx.ellipse(q.x, q.y, hw * 0.3, hh * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (tileReady) {
        if (texAlpha < 1) ctx.globalAlpha = texAlpha;
        blitIsoTile(ctx, kind, p.x, p.y, hw, mir);
        if (texAlpha < 1) ctx.globalAlpha = 1;
        if (kind === 'grass' && !inGrid) {
          // Nature sauvage : même tuile d'herbe, assombrie (contraste ville/forêt).
          ctx.fillStyle = 'rgba(20,30,14,0.18)';
          diamondPath(ctx, p.x, p.y, hw, hh);
          ctx.fill();
        }
      }
      // Les cellules-PONT ne reçoivent ni fond ni ruban ici : leur tablier est
      // dessiné APRÈS le fleuve (drawIsoBridges), au-dessus de l'eau.
      if (isRoad && !isPlaza && !isBridge && !isWater) roads.push({ gx, gy, cell });
    }
  }
  // Rubans de chaussée par-dessus le fond : pavé central + un bras vers chaque
  // connexion (rectangles MONDE projetés → parallélogrammes écran continus).
  const motorized = band >= 5;   // marquages routiers à partir de l'ère industrielle
  for (const r of roads) {
    const cx = (r.gx + 0.5) * T, cy = (r.gy + 0.5) * T;
    const wb = T * ROAD_BAND;
    const mask = r.cell ? (r.cell.mask | 0) : 0;
    const v = 0.97 + ((cmHash('rb:' + r.gx + ',' + r.gy) % 100) / 100) * 0.06;
    // BORDURE de trottoir : même géométrie légèrement élargie, en plus sombre,
    // SOUS le ruban — structure les rues (retour Raph « sols très plats »).
    const cb = T * 0.05;
    ctx.fillStyle = rgb(road, 0.62);
    fillWorldQuad(ctx, cx - wb - cb, cy - wb - cb, cx + wb + cb, cy + wb + cb);
    if (mask & ROAD_E) fillWorldQuad(ctx, cx + wb, cy - wb - cb, (r.gx + 1) * T, cy + wb + cb);
    if (mask & ROAD_W) fillWorldQuad(ctx, r.gx * T, cy - wb - cb, cx - wb, cy + wb + cb);
    if (mask & ROAD_S) fillWorldQuad(ctx, cx - wb - cb, cy + wb, cx + wb + cb, (r.gy + 1) * T);
    if (mask & ROAD_N) fillWorldQuad(ctx, cx - wb - cb, r.gy * T, cx + wb + cb, cy - wb);
    ctx.fillStyle = rgb(road, v);
    fillWorldQuad(ctx, cx - wb, cy - wb, cx + wb, cy + wb);                       // pavé central
    if (mask & ROAD_E) fillWorldQuad(ctx, cx + wb, cy - wb, (r.gx + 1) * T, cy + wb);
    if (mask & ROAD_W) fillWorldQuad(ctx, r.gx * T, cy - wb, cx - wb, cy + wb);
    if (mask & ROAD_S) fillWorldQuad(ctx, cx - wb, cy + wb, cx + wb, (r.gy + 1) * T);
    if (mask & ROAD_N) fillWorldQuad(ctx, cx - wb, r.gy * T, cx + wb, cy - wb);
    if (!mask) fillWorldQuad(ctx, cx - wb, cy - wb, cx + wb, cy + wb);            // isolée : pavé seul
    // Pointillés centraux des GRANDS AXES (ères motorisées). « Traversant » =
    // les DEUX bits de l'axe (E ET O, ou S ET N) — les boulevards 2-cellules
    // portent AUSSI le bit de couture vers leur voie jumelle (mask E|O|S p.ex.),
    // le premier test « axe pur » ne matchait que 5 cellules sur 406. Les vrais
    // carrefours (les deux axes traversants) restent nus.
    if (motorized && r.cell && (r.cell.rank === 'main' || r.cell.rank === 'avenue')) {
      const throughH = !!((mask & ROAD_E) && (mask & ROAD_W));
      const throughV = !!((mask & ROAD_S) && (mask & ROAD_N));
      if (throughH !== throughV) {                    // un seul axe traversant
        ctx.fillStyle = 'rgba(228,222,198,0.55)';
        const dl = T / 6, dg = T / 6, dw2 = T * 0.045;   // tiret, trou, demi-largeur
        for (let o = dg / 2; o + dl <= T; o += dl + dg) {
          if (throughH) fillWorldQuad(ctx, r.gx * T + o, cy - dw2, r.gx * T + o + dl, cy + dw2);
          else fillWorldQuad(ctx, cx - dw2, r.gy * T + o, cx + dw2, r.gy * T + o + dl);
        }
      }
    }
  }
  // Terre-plein PLANTÉ des boulevards 2-cellules (couture L.terrePlein) : bande
  // de gazon centrée sur la couture + touffes sombres espacées. Statique → dans
  // le bake. (Le vrai pixel-art planté du legacy viendra avec l'art Phase 5.)
  // Quand les SEGMENTS plantés PixelLab sont décodés, la bande gazon + touffes
  // du bake est SAUTÉE (elle restait visible sous/à côté de l'art — retour Raph).
  // Gazon procédural sauté dès que les pièces 3-slice d'une orientation sont là
  // (le sprite porte sa propre base) — vaut par orientation, mais on coupe la
  // bande dès que l'UNE est prête (les segments de l'autre gardent le repli buisson).
  const medUp = isoArt('median-se-mid').ready || isoArt('median-sw-mid').ready;
  const tp = medUp ? null : L.terrePlein;
  if (tp && tp.length) {
    const wtp = T * 0.2;
    for (const seg of tp) {
      ctx.fillStyle = rgb([96, 118, 66], 1);
      if (seg.axis === 'h') fillWorldQuad(ctx, seg.x0 * T, (seg.y + 1) * T - wtp, (seg.x1 + 1) * T, (seg.y + 1) * T + wtp);
      else fillWorldQuad(ctx, (seg.x + 1) * T - wtp, seg.y0 * T, (seg.x + 1) * T + wtp, (seg.y1 + 1) * T);
      ctx.fillStyle = 'rgba(58,82,44,0.9)';
      if (seg.axis === 'h') {
        const sy = (seg.y + 1) * T;
        for (let x = seg.x0 + 0.5; x <= seg.x1 + 0.5; x += 1.25) {
          const q = worldToScreen(x * T, sy);
          ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(1, z * 2.6), Math.max(1, z * 1.4), 0, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        const sx = (seg.x + 1) * T;
        for (let y = seg.y0 + 0.5; y <= seg.y1 + 0.5; y += 1.25) {
          const q = worldToScreen(sx, y * T);
          ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(1, z * 2.6), Math.max(1, z * 1.4), 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  ctx.restore();
  return true;
}

// ── FLEUVE : ruban lissé LIVE (par-dessus le bake, sous ponts et agents) ─────
// Même philosophie que pixelRiver legacy (Approche A : ruban continu depuis
// L.river.samples, zéro escalier de cellules) mais en projection iso : gauche/
// droite calculées en MONDE (pos ± normale·hw) puis projetées. Dessin LIVE à
// chaque frame (un polygone + liserés + reflets) → l'eau peut s'animer alors
// que le sol reste baké. Bateaux/quais : Phase 5 complète.
function riverRibbonPath(ctx, pts, T) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const o = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    left.push(worldToScreen((p.x + nx * p.hw) * T, (p.y + ny * p.hw) * T));
    right.push(worldToScreen((p.x - nx * p.hw) * T, (p.y - ny * p.hw) * T));
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
}
function drawIsoRiver(now) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  const T = CM.TILE, ctx = CM.ctx, z = CM.cam.zoom;
  const pts = rv.samples;
  // Corps d'eau (ardoise) + bord de profondeur sombre.
  riverRibbonPath(ctx, pts, T);
  ctx.fillStyle = rgb(WATER, 1);
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,44,52,0.55)';
  ctx.lineWidth = Math.max(1, z * 2.2);
  ctx.stroke();
  // Reflets : courtes virgules claires qui DÉRIVENT le long du courant (clippées
  // au ruban). Phases par sample (hash stable) → pas de vague synchrone.
  ctx.save();
  riverRibbonPath(ctx, pts, T);
  ctx.clip();
  const t = (now || 0) * 0.00028;
  ctx.lineWidth = Math.max(1, z * 1.1);
  for (let i = 0; i < pts.length; i += 1) {
    if (i % 3 !== 0) continue;
    const p = pts[i];
    const o = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    for (let s = -1; s <= 1; s += 2) {
      const ph = ((i * 37 + (s > 0 ? 19 : 53)) % 100) / 100;
      const cycle = (t * 2 + ph) % 1;
      const drift = cycle * 2.4 - 1.2;                       // glisse le long de la tangente (cellules)
      const lat = s * p.hw * (0.2 + ((i * 13) % 45) / 100);  // écart latéral stable
      const wx = (p.x + tx * drift + nx * lat) * T, wy = (p.y + ty * drift + ny * lat) * T;
      const a = worldToScreen(wx, wy);
      const b = worldToScreen(wx + tx * T * 0.5, wy + ty * T * 0.5);
      // fondu d'apparition/disparition aux bouts du cycle
      const fade = Math.sin(cycle * Math.PI);
      ctx.strokeStyle = `rgba(214,232,238,${(0.34 * fade).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.restore();
}

// ── Art iso dédié (/pixelart/iso/<name>.png) : cache paresseux ───────────────
// Roues de moulin animées (bandes 6 frames) + bateaux par stade (8 rotations).
// Tant qu'un PNG manque, chaque consommateur garde son repli (skew / profil).
const isoArtCache = new Map();
function isoArt(name) {
  let e = isoArtCache.get(name);
  if (e) return e;
  e = { img: null, ready: false, bbox: null };
  isoArtCache.set(name, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      e.img = im; e.ready = true;
      // Le BAKE du sol dépend de l'art décodé (dalle de place remplacée, bande
      // gazon des terre-pleins sautée) → re-bake au décodage.
      CM._isoGroundBake = null;
    };
    im.src = '/pixelart/iso/' + name + '.png';
  }
  return e;
}
// Pose un art iso « AU SOL » : le CONTENU opaque est mis à targetW px de large
// et le COIN BAS de son losange de base tombe un quart sous (px, py) = centre
// du losange visé. Corrige les décalages « ancienne dalle qui dépasse » (Raph) :
// on cale la GÉOMÉTRIE MESURÉE du PNG, pas le canvas brut.
function drawIsoGroundedArt(ctx, e, px, py, targetW) {
  if (!e.bbox) {
    const bpx = isoTileBBox(e.img);
    const w = e.img.naturalWidth || 1, h = e.img.naturalHeight || 1;
    e.bbox = bpx ? { x0f: bpx.x0 / w, y0f: bpx.y0 / h, wf: bpx.w / w, hf: bpx.h / h } : { x0f: 0, y0f: 0, wf: 1, hf: 1 };
  }
  const bb = e.bbox;
  const imgW = e.img.naturalWidth || 1, imgH = e.img.naturalHeight || 1;
  // ⚠ canvases NON carrés depuis la normalisation (normalizeIsoScenes) :
  // la hauteur suit l'ASPECT NATUREL, plus jamais boxH = boxW.
  const boxW = targetW / (bb.wf || 1), boxH = boxW * (imgH / imgW);
  const cxf = bb.x0f + bb.wf / 2, cbf = bb.y0f + bb.hf;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(e.img, px - boxW * cxf, py + targetW / 4 - boxH * cbf, boxW, boxH);
  ctx.imageSmoothingEnabled = prev;
}
// Arbres pixel iso : tree-1..tree-N (feuillus + conifères, choisis par hash).
const ISO_TREE_VARIANTS = 4;

// ── PLACE : scène complète par ère (DA validée par Raph 2026-07-12 : fontaine
// monumentale évolutive + parterres fleuris + bancs/réverbères, minérale
// claire, UNE scène PixelLab par grande ère posée sur la dalle) ──────────────
let _isoPlazaCache = { at: -1, box: null };
function isoPlazaBox(L) {
  if (_isoPlazaCache.at === CM.layoutRecomputeAt) return _isoPlazaCache.box;
  // ⚠ Composante CONNEXE de la dalle centrale (flood-fill depuis la cellule
  // médiane), PAS la bbox de toutes les cellules 'plaza' : des cellules plaza
  // isolées existent ailleurs et gonflaient la bbox à la ville entière (scène
  // géante en fond d'écran, vu à la capture).
  const cells = new Set();
  if (L.roadMap) for (const c of L.roadMap.values()) if (c.rank === 'plaza') cells.add(c.gx + ',' + c.gy);
  let box = null;
  if (cells.size) {
    const arr = [...cells].map((k) => k.split(',').map(Number)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    const seed = arr[Math.floor(arr.length / 2)];
    const comp = new Set([seed.join(',')]);
    const stack = [seed];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (x + dx) + ',' + (y + dy);
        if (cells.has(k) && !comp.has(k)) { comp.add(k); stack.push([x + dx, y + dy]); }
      }
    }
    let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
    for (const k of comp) {
      const [x, y] = k.split(',').map(Number);
      if (x < gx0) gx0 = x; if (x > gx1) gx1 = x;
      if (y < gy0) gy0 = y; if (y > gy1) gy1 = y;
    }
    box = { gx0, gx1, gy0, gy1 };
  }
  _isoPlazaCache = { at: CM.layoutRecomputeAt, box };
  return _isoPlazaCache.box;
}
// Pas de scène aux stades primitifs (cohérence, comme les lampadaires).
const plazaEraForBand = (band) => (band >= 7 ? 'cosmic' : band >= 6 ? 'modern' : band >= 5 ? 'industrial' : band >= 4 ? 'medieval' : band >= 2 ? 'antique' : null);

// Cap écran (rad, 0 = est, +π/2 = sud/bas) → nom de rotation d'objet PixelLab.
const BOAT_SECTORS = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
function boatSector(angle) {
  const k = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return BOAT_SECTORS[k];
}
// Stades couverts par l'art iso (cosmique : repli legacy/procédural conservé).
const BOAT_ISO = { raft: 1, sail: 1, steam: 1, container: 1 };

// ── BATEAUX : flotte legacy (CM.ships) sur le ruban projeté ──────────────────
// Reprend la recette drawShips (stade par ère, voie latérale, louvoiement,
// sillage additif, coque « toujours droite ») mais TOUT passe par la projection :
// position monde → worldToScreen, inclinaison = tangente PROJETÉE. Escales
// simplifiées (ralentit près d'un quai, pas d'arrêt long). Dessinés APRÈS le
// fleuve et AVANT les ponts → ils passent sous les tabliers.
function drawIsoShips(dt, now) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !CM.ships || !CM.ships.length) return;
  const sm = rv.samples;
  if (!sm || sm.length < 2) return;
  const T = CM.TILE, ctx = CM.ctx, z = CM.cam.zoom, s = T * z;
  const band = (L.counts && L.counts.eraBand) | 0, ei = (L.counts && L.counts.eraIndex) | 0;
  const vstage = band >= 7 ? 'cosmic' : ei >= 30 ? 'container' : ei >= 20 ? 'steam' : ei >= 10 ? 'sail' : 'raft';
  const sizeMul = vstage === 'cosmic' ? (band >= 9 ? 5.6 : band >= 8 ? 4.8 : 4.0)
    : vstage === 'container' ? 3.2 : vstage === 'steam' ? 2.4 : vstage === 'sail' ? 1.8 : 1.36;
  const boatKey = vstage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, band)) : vstage;
  const chr = BOAT_SIZES[vstage] ? ensureBoat(boatKey) : null;
  const docks = CM.shipDocks || [];
  for (const sh of CM.ships) {
    let prox = 0;
    for (const d of docks) { let dd = Math.abs(sh.t - d.t); if (dd > 0.5) dd = 1 - dd; prox = Math.max(prox, Math.max(0, 1 - dd / 0.05)); }
    const moveF = 1 - 0.7 * prox;
    sh.t += sh.dir * sh.speed * moveF * dt;
    if (sh.t > 1) sh.t -= 1; if (sh.t < 0) sh.t += 1;
    const fi = sh.t * (sm.length - 1);
    const i0 = Math.max(0, Math.min(sm.length - 1, Math.floor(fi)));
    const i1 = Math.min(sm.length - 1, i0 + 1);
    const f = fi - i0;
    let cgx = sm[i0].x + (sm[i1].x - sm[i0].x) * f;
    let cgy = sm[i0].y + (sm[i1].y - sm[i0].y) * f;
    // Voie latérale propre + louvoiement (repris du legacy).
    const hw = sm[i0].hw || 2;
    let nx = -(sm[i1].y - sm[i0].y), ny = sm[i1].x - sm[i0].x;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const effSize = (BOAT_SIZES[vstage] || 0.7) * sizeMul;
    // Voie RESSERRÉE (hw×0.78) : dans les coudes, l'interpolation linéaire des
    // samples dérive du ruban lissé → à pleine demi-largeur les coques
    // mordaient la berge près du pont (vu à la capture).
    const laneRoom = Math.max(0, hw * 0.78 - effSize * 0.3 - 0.25);
    const wave = Math.sin((now || 0) / 2600 + (sh.phase || 0)) * 0.12;
    const lateral = ((sh.lane || 0) + wave) * laneRoom;
    cgx += nx * lateral; cgy += ny * lateral;
    const p = worldToScreen(cgx * T, cgy * T);
    if (p.x < -s * 3 || p.x > CM.cw + s * 3 || p.y < -s * 3 || p.y > CM.ch + s * 3) continue;
    // Cap PROJETÉ complet (rad écran), signé par le sens de navigation.
    const a2 = worldToScreen(sm[i0].x * T, sm[i0].y * T);
    const b2 = worldToScreen(sm[i1].x * T, sm[i1].y * T);
    const sgn = sh.dir < 0 ? -1 : 1;
    const heading = Math.atan2(sgn * (b2.y - a2.y), sgn * (b2.x - a2.x));
    const spd01 = Math.max(0, Math.min(1, (sh.speed - 0.008) / 0.012));
    // Sillage additif derrière la poupe + ombre : pivotés au CAP COMPLET (l'eau
    // suit la pente, seul le sprite de coque reste droit).
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(heading);
    {
      const WL = s * (0.85 + spd01 * 0.8) * (0.35 + 0.65 * moveF) * sizeMul * 0.7;
      const foam = vstage === 'cosmic' ? '150,220,255' : '225,238,245';
      const wa = (0.10 + spd01 * 0.10) * moveF;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gt = ctx.createLinearGradient(-s * 0.18 * sizeMul, 0, -WL, 0);
      gt.addColorStop(0, `rgba(${foam},${wa.toFixed(2)})`);
      gt.addColorStop(1, `rgba(${foam},0)`);
      ctx.fillStyle = gt;
      ctx.beginPath();
      ctx.moveTo(-s * 0.18 * sizeMul, -s * 0.045 * sizeMul);
      ctx.lineTo(-WL, -s * 0.02 * sizeMul);
      ctx.lineTo(-WL, s * 0.02 * sizeMul);
      ctx.lineTo(-s * 0.18 * sizeMul, s * 0.045 * sizeMul);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(10,25,35,0.20)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.06 * sizeMul, s * 0.24 * sizeMul, s * 0.08 * sizeMul, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // COQUE : rotation d'objet PixelLab au SECTEUR du cap (8 vues, Phase 5 —
    // fini le profil penché « qui tombe »), sinon repli profil legacy amorti.
    const isoBoat = BOAT_ISO[vstage] ? isoArt('boat-' + vstage + '-' + boatSector(heading)) : null;
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    if (isoBoat && isoBoat.ready) {
      const dw = s * (BOAT_SIZES[vstage] || 0.7) * sizeMul * 1.15;
      const bob = Math.sin((now || 0) / 1600 + (sh.phase || 0)) * s * 0.015;
      ctx.drawImage(isoBoat.img, p.x - dw / 2, p.y - dw * 0.58 + bob, dw, dw);
    } else if (chr && boatReady(chr)) {
      const tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(b2.y - a2.y, Math.abs(b2.x - a2.x) || 1e-6) * 0.45));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(tilt);
      ctx.scale((sh.dir < 0 ? -1 : 1) * sizeMul, sizeMul);
      const bimg = chr.img;
      const bfh = bimg.naturalHeight || bimg.height || 64;
      const bnf = Math.max(1, Math.round((bimg.naturalWidth || bimg.width || bfh) / bfh));
      const bf = bnf > 1 ? Math.floor((now || 0) / 140 + sh.t * 7) % bnf : 0;
      const dw = s * BOAT_SIZES[vstage], dh = dw;
      ctx.drawImage(bimg, bf * bfh, 0, bfh, bfh, -dw / 2, -dh / 2 - dh * BOAT_LIFT, dw, dh);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = prevSm;
  }
}

// ── DRONES : passe aérienne (sprite top-down pivoté au cap projeté) ──────────
function drawIsoDrones(now) {
  if (CM.lodActive) return;
  const T = CM.TILE, z = CM.cam.zoom, s = T * z, ctx = CM.ctx;
  let dchr = null;
  for (const v of CM.vehicles) {
    if (v.type !== 'drone') continue;
    if (!dchr) dchr = ensureDrone();
    const p = worldToScreen(v.x, v.y);
    if (p.x < -s || p.y < -s * 2 || p.x > CM.cw + s || p.y > CM.ch + s) continue;
    const t2 = now || 0;
    const hover = Math.sin(t2 / 380 + v.x * 0.04) * s * 0.04;
    const dScale = CM.droneSize || 0.58;
    // Ombre AU SOL (à la position projetée), drone en altitude au-dessus.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, s * dScale * 0.2, s * dScale * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    if (!(dchr && dchr.ready && dchr.img)) continue;
    const q = worldToScreen(v.tx, v.ty);
    let hx = q.x - p.x, hy = q.y - p.y;
    const hd = Math.hypot(hx, hy);
    if (hd > 0.5) { hx /= hd; hy /= hd; } else { hx = 1; hy = 0; }
    const dsz = s * dScale;
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(p.x, p.y - s * 0.55 + hover);
    ctx.rotate(Math.atan2(hy, hx) + Math.PI / 2);
    ctx.drawImage(dchr.img, -dsz / 2, -dsz / 2, dsz, dsz);
    drawDroneRotors(ctx, dsz, t2, v.x * 0.1);
    ctx.restore();
    ctx.imageSmoothingEnabled = prevSm;
  }
}

// ── NUIT : voile bleu + fenêtres chaudes (halos additifs seedés) ─────────────
// Lit CM.nightF (cycle jour/nuit du runtime, forcé par les captures). Halos
// APRÈS le voile = lumières (même ordre que le legacy). Plafonné pour la perf.
// ── LAMPADAIRES par ère (retour Raph : points lumineux ANCRÉS aux mâts) ──────
// Liste déterministe par layout : cellules-route TRAVERSANTES (pas carrefour,
// pas pont, pas place), 1 sur 3, côté de chaussée par hash. band ≥ 2 : pas de
// lampadaires aux stades primitifs (cohérence demandée). Sprites
// /pixelart/iso/lamp-{antique|gas|electric|energy}.png, posés au PEINTRE
// (drawIsoLive) ; la nuit, le halo se dessine À LA TÊTE de chaque mât.
let _isoLampCache = { at: -1, lamps: null };
function isoLamps(L, band) {
  if (band < 2 || !L.roadMap) return [];
  if (_isoLampCache.at === CM.layoutRecomputeAt && _isoLampCache.lamps) return _isoLampCache.lamps;
  const T = CM.TILE, lamps = [];
  for (const c of L.roadMap.values()) {
    if (c.roadSurface === 'bridge' || c.rank === 'plaza') continue;
    const mask = c.mask | 0;
    const thH = !!((mask & ROAD_E) && (mask & ROAD_W));
    const thV = !!((mask & ROAD_S) && (mask & ROAD_N));
    if (thH === thV) continue;                    // carrefour / impasse : pas de mât
    if (((c.gx + c.gy) % 3) !== 0) continue;      // espacement ~3 cellules
    const side = (cmHash('lmp:' + c.gx + ':' + c.gy) & 1) ? 0.86 : 0.14;
    lamps.push({
      wx: (thH ? c.gx + 0.5 : c.gx + side) * T,
      wy: (thH ? c.gy + side : c.gy + 0.5) * T,
      gx: c.gx, gy: c.gy,
    });
  }
  _isoLampCache = { at: CM.layoutRecomputeAt, lamps };
  return lamps;
}
const lampEraForBand = (band) => (band >= 7 ? 'energy' : band >= 6 ? 'electric' : band >= 4 ? 'gas' : 'antique');
const LAMP_H = 1.15;   // hauteur du mât en tuiles (tête ≈ 0.8 × H)

function drawIsoNight() {
  const n = CM.nightF || 0;
  if (n <= 0.03) return;
  const ctx = CM.ctx, L = CM.layout;
  ctx.fillStyle = `rgba(8,11,26,${(0.62 * n).toFixed(2)})`;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (!L) return;
  const T = CM.TILE, z = CM.cam.zoom;
  const b = visibleCellBounds(0);
  const band = (L.counts && L.counts.eraBand) | 0;
  // Halos ANCRÉS aux têtes de lampadaires (les orbes flottants au centre des
  // bâtiments sont RETIRÉS — retour Raph). Chaud, cyan à l'ère de l'énergie.
  const lamps = isoLamps(L, band);
  if (!lamps.length) return;
  const col = lampEraForBand(band) === 'energy' ? '140,225,255' : '255,205,110';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let count = 0;
  for (const lp of lamps) {
    if (count > 320) break;
    if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
    const p = worldToScreen(lp.wx, lp.wy);
    const hy = p.y - T * z * LAMP_H * 0.8;
    const r = Math.max(4, T * z * 0.85);
    const g = ctx.createRadialGradient(p.x, hy, 0, p.x, hy, r);
    g.addColorStop(0, `rgba(${col},${Math.min(0.55, 0.5 * n).toFixed(2)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, hy - r, r * 2, r * 2);
    // flaque de lumière au pied du mât
    const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 0.8);
    g2.addColorStop(0, `rgba(${col},${(0.16 * n).toFixed(2)})`);
    g2.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 0.8, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    count += 1;
  }
  ctx.restore();
}

// ── PONT : tablier par ère au-dessus de l'eau (cellules roadSurface 'bridge') ─
// Matière par bande, calquée sur les 5 stades du pont pixel legacy
// (bois → pierre → fer → béton/énergie). Le tablier d'une voie s'étend jusqu'au
// bord mitoyen quand la voie JUMELLE est aussi un pont (double-voie dès band 2)
// → un seul tablier continu, garde-corps seulement sur les bords EXTÉRIEURS.
let _isoBridgeCache = { at: -1, cells: null };
function isoBridgeCells(L) {
  if (_isoBridgeCache.at === CM.layoutRecomputeAt && _isoBridgeCache.cells) return _isoBridgeCache.cells;
  const cells = [];
  for (const c of L.roadMap.values()) if (c.roadSurface === 'bridge') cells.push(c);
  _isoBridgeCache = { at: CM.layoutRecomputeAt, cells };
  return cells;
}
function bridgeTone(band) {
  return band >= 7 ? [104, 110, 128]
    : band >= 5 ? [92, 88, 86]
      : band >= 3 ? [132, 126, 112]
        : [126, 96, 58];
}
// Rejoue un rendu ÉCRAN LEGACY en iso : P_iso = A ∘ P_legacy, avec A l'affine
// écran autour du centre, de colonnes (ISO_X, ISO_Y) et (−ISO_X, ISO_Y). Tout
// art PLAT dessiné par le pipeline legacy (tablier de pont, terre-plein planté)
// se projette ainsi EXACTEMENT sur le plan du sol en losange — zéro re-art.
// ⚠ Réservé à l'art « à plat » : un décor avec verticalité bakée se coucherait.
function withLegacyToIso(ctx, fn) {
  ctx.save();
  ctx.translate(CM.cw / 2, CM.ch / 2);
  ctx.transform(ISO_X, ISO_Y, -ISO_X, ISO_Y, 0, 0);
  ctx.translate(-CM.cw / 2, -CM.ch / 2);
  const out = fn();
  ctx.restore();
  return out;
}

// Polygone MONDE (px) projeté puis rempli — quads non alignés aux axes
// (rampes d'accès des ponts, etc.).
function fillWorldPoly(ctx, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 1) {
    const q = worldToScreen(pts[i][0], pts[i][1]);
    if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();
  ctx.fill();
}

// RAMPES D'ACCÈS (retour Raph : « la jonction pont/routes n'est pas fluide »).
// À chaque bout de travée, un trapèze en matière de CHAUSSÉE qui s'évase de la
// largeur du ruban de route vers la largeur du tablier — l'asphalte « monte »
// sur le pont et couvre la couture dure de la culée. Bordure sombre dessous,
// même grammaire que les rubans de rue. Dessiné APRÈS le tablier (pixel ou
// procédural), AVANT la passe vivante (les véhicules roulent dessus).
function drawBridgeAprons(ctx, band, T) {
  const spans = CM.bridgeSpans;
  if (!spans || !spans.length) return;
  const road = roadTone(band);
  const wr = T * (ROAD_BAND + 0.05);           // demi-largeur du ruban (avec bordure)
  const deck = bridgeTone(band);
  // Rampe AFFINÉE (retour Raph « trop brute ») : DÉGRADÉ de matière
  // chaussée→tablier le long de l'axe (fini l'aplat qui tranchait), gabarit
  // réduit, fines bordures sombres sur les flancs (grammaire des rubans).
  const drawApron = (outer, inner, cOutL, cOutR, cInL, cInR) => {
    const p0 = worldToScreen(outer[0], outer[1]);   // milieu du bord côté route
    const p1 = worldToScreen(inner[0], inner[1]);   // milieu du bord côté tablier
    const gr = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    gr.addColorStop(0, rgb(road, 0.95));
    gr.addColorStop(1, rgb(deck, 0.95));
    ctx.fillStyle = gr;
    fillWorldPoly(ctx, [cOutL, cInL, cInR, cOutR]);
    // bordures des flancs (liseré sombre fin)
    ctx.strokeStyle = 'rgba(20,20,24,0.4)';
    ctx.lineWidth = 1;
    const qa = worldToScreen(cOutL[0], cOutL[1]), qb = worldToScreen(cInL[0], cInL[1]);
    const qc = worldToScreen(cOutR[0], cOutR[1]), qd = worldToScreen(cInR[0], cInR[1]);
    ctx.beginPath(); ctx.moveTo(qa.x, qa.y); ctx.lineTo(qb.x, qb.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(qc.x, qc.y); ctx.lineTo(qd.x, qd.y); ctx.stroke();
  };
  // ⚠ Le tablier PIXEL s'étend jusqu'aux routes d'atterrissage (drawSpan
  // prolonge ses bornes aux exits) : la rampe se cale sur ces bornes
  // ÉTENDUES, sinon elle coupe le tablier en biais (vu à la capture).
  for (const sp of spans) {
    if (!sp.exits || !sp.exits.length) continue;
    if (!sp.vertical) {
      const cy = (sp.gy0 + (sp.gy1 - sp.gy0 + 1) / 2) * T;
      const wd = ((sp.gy1 - sp.gy0 + 1) / 2) * T * 0.5;    // demi-largeur de CHAUSSÉE du tablier
      const xs = sp.exits.map((r) => r.gx);
      const ex0 = Math.min(sp.gx0, ...xs), ex1 = Math.max(sp.gx1, ...xs) + 1;
      if (ex0 < sp.gx0) {
        const xo = (ex0 - 0.4) * T, xi = (ex0 + 0.6) * T;
        drawApron([xo, cy], [xi, cy], [xo, cy - wr], [xo, cy + wr], [xi, cy - wd], [xi, cy + wd]);
      }
      if (ex1 > sp.gx1 + 1) {
        const xo = (ex1 + 0.4) * T, xi = (ex1 - 0.6) * T;
        drawApron([xo, cy], [xi, cy], [xo, cy - wr], [xo, cy + wr], [xi, cy - wd], [xi, cy + wd]);
      }
    } else {
      const cx = (sp.gx0 + (sp.gx1 - sp.gx0 + 1) / 2) * T;
      const wd = ((sp.gx1 - sp.gx0 + 1) / 2) * T * 0.5;
      const ys = sp.exits.map((r) => r.gy);
      const ey0 = Math.min(sp.gy0, ...ys), ey1 = Math.max(sp.gy1, ...ys) + 1;
      if (ey0 < sp.gy0) {
        const yo = (ey0 - 0.4) * T, yi = (ey0 + 0.6) * T;
        drawApron([cx, yo], [cx, yi], [cx - wr, yo], [cx + wr, yo], [cx - wd, yi], [cx + wd, yi]);
      }
      if (ey1 > sp.gy1 + 1) {
        const yo = (ey1 + 0.4) * T, yi = (ey1 - 0.6) * T;
        drawApron([cx, yo], [cx, yi], [cx - wr, yo], [cx + wr, yo], [cx - wd, yi], [cx + wd, yi]);
      }
    }
  }
}

function drawIsoBridges(now) {
  const L = CM.layout;
  const cells = isoBridgeCells(L);
  if (!cells.length) return;
  const T = CM.TILE, ctx = CM.ctx;
  const bandA = (L.counts && L.counts.eraBand) | 0;
  // PONTS : retour au TABLIER PLAT PROJETÉ + rampes (décision Raph 2026-07-12 :
  // les sprites de pont complet, même normalisés en angle, gardent leur
  // PERSPECTIVE interne — re-tournés ils paraissent tordus ; « annule et remet
  // comme avant »). Les sprites bridge-full-* restent sur disque, débranchés.
  if (withLegacyToIso(ctx, () => drawPixelBridges(CM, now))) {
    drawBridgeAprons(ctx, bandA, T);
    return;
  }
  const band = (L.counts && L.counts.eraBand) | 0;
  const tone = bridgeTone(band);
  const isB = (x, y) => { const c = L.roadMap.get(x + ',' + y); return !!(c && c.roadSurface === 'bridge'); };
  const wD = 0.44, wR = 0.07;   // demi-largeur tablier / épaisseur garde-corps (fraction tuile)
  for (const b of cells) {
    const throughH = !!((b.mask & ROAD_E) && (b.mask & ROAD_W));
    const cx = (b.gx + 0.5) * T, cy = (b.gy + 0.5) * T;
    const v = 0.96 + ((cmHash('br:' + b.gx + ',' + b.gy) % 100) / 100) * 0.07;
    ctx.fillStyle = rgb(tone, v);
    if (throughH) {
      // voie jumelle au nord/sud → tablier étendu jusqu'à la couture, rail sauté.
      const twinN = isB(b.gx, b.gy - 1), twinS = isB(b.gx, b.gy + 1);
      const y0 = twinN ? b.gy * T : cy - T * wD, y1 = twinS ? (b.gy + 1) * T : cy + T * wD;
      fillWorldQuad(ctx, b.gx * T, y0, (b.gx + 1) * T, y1);
      ctx.fillStyle = rgb(tone, 0.55);
      if (!twinN) fillWorldQuad(ctx, b.gx * T, y0, (b.gx + 1) * T, y0 + T * wR);
      if (!twinS) fillWorldQuad(ctx, b.gx * T, y1 - T * wR, (b.gx + 1) * T, y1);
    } else {
      const twinW = isB(b.gx - 1, b.gy), twinE = isB(b.gx + 1, b.gy);
      const x0 = twinW ? b.gx * T : cx - T * wD, x1 = twinE ? (b.gx + 1) * T : cx + T * wD;
      fillWorldQuad(ctx, x0, b.gy * T, x1, (b.gy + 1) * T);
      ctx.fillStyle = rgb(tone, 0.55);
      if (!twinW) fillWorldQuad(ctx, x0, b.gy * T, x0 + T * wR, (b.gy + 1) * T);
      if (!twinE) fillWorldQuad(ctx, x1 - T * wR, b.gy * T, x1, (b.gy + 1) * T);
    }
  }
  drawBridgeAprons(ctx, band, T);
}

// ── Drawables triés au peintre (profondeur = wx + wy) ────────────────────────
function drawTreeIso(ctx, sx, sy, h) {
  // Sapin minimal Phase 1 : tronc + 2 étages de feuillage, ombre portée SE.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(sx + h * 0.16, sy, h * 0.30, h * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d4630';
  ctx.fillRect(sx - h * 0.045, sy - h * 0.22, h * 0.09, h * 0.22);
  ctx.fillStyle = '#3f5a35';
  ctx.beginPath(); ctx.moveTo(sx, sy - h); ctx.lineTo(sx + h * 0.34, sy - h * 0.36); ctx.lineTo(sx - h * 0.34, sy - h * 0.36); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a6a3e';
  ctx.beginPath(); ctx.moveTo(sx, sy - h * 0.72); ctx.lineTo(sx + h * 0.42, sy - h * 0.16); ctx.lineTo(sx - h * 0.42, sy - h * 0.16); ctx.closePath(); ctx.fill();
}

// ── Véhicule en iso (Phase 1.5) : corps sprite 4-dirs + attelage/pousseur ────
// Réutilise les briques legacy (ensureVeh, VEH_PULL/PUSH, bandes de marche) mais
// TOUTES les positions passent par la projection : offsets de file/attelage
// calculés en MONDE puis projetés. Drones exclus (tri aérien, plus tard) ;
// vues encore cardinales — les diagonales arrivent avec l'art Phase 4.
const VEH_DIRS = ['east', 'west', 'south', 'north'];
// Corrections d'orientation PAR TYPE (audit visuel des rotations d'objets PixelLab,
// planches .preview-shots/<type>-4views.png, bug vu par Raph « profil d'ouest en
// est ») : le générateur INVERSE les deux vues SUD sur certains objets (voiture,
// char, caravane, tram), et les BRANCARDS de la charrette sont son « avant » pour
// le générateur alors que NOUS la poussons (brancards à l'arrière). Tableau =
// fichier à afficher pour la dir MONDE 0..3 (E,O,S,N → écran SE,NO,SO,NE).
// wagon et barrow sont corrects tels quels (default).
const VEH_DIAG_MAP = {
  default: ['southeast', 'northwest', 'southwest', 'northeast'],
  car: ['southwest', 'northwest', 'southeast', 'northeast'],
  chariot: ['southwest', 'northwest', 'southeast', 'northeast'],
  // caravan : labels devenus VRAIS après la régénération d'animation (le modèle
  // v3 a « redressé » l'orientation, re-audit veh-audit2.png 2026-07-11) → map
  // par défaut. ⚠ RE-AUDITER après toute régénération : les labels bougent.
  tram: ['southwest', 'northwest', 'southeast', 'northeast'],
  cart: ['northwest', 'southwest', 'northeast', 'southeast'],
};
// Pas de roue (fraction de tuile parcourue par frame de bande diagonale) —
// molette __vehStride(0.09) pour caler la vitesse de rotation apparente.
const vehStrideT = { v: 0.09 };
if (typeof window !== 'undefined') window.__vehStride = (x) => { if (x > 0) vehStrideT.v = x; return vehStrideT.v; };

// Bête de trait (cheval/bœuf) en VUE DIAGONALE : bandes veh-{animal}-{diag}.png
// (objets 8-dir PixelLab animés « walking » 6 frames), frame par DISTANCE
// (v.rollDist, même odomètre que les roues). Renvoie false si les bandes ne
// sont pas prêtes → repli sur la bande cardinale legacy (drawNamedAgent).
const DRAFT_DIAG_MAP = { default: ['southeast', 'northwest', 'southwest', 'northeast'] };
function drawDraftIso(ctx, x, yFeet, z, animal, v) {
  const dchr = ensureVehDiag(animal);
  if (!vehDiagReady(dchr)) return false;
  const map = DRAFT_DIAG_MAP[animal] || DRAFT_DIAG_MAP.default;
  const img = dchr.img[map[v.dir]] || dchr.img[map[0]];
  if (!img || !(img.naturalWidth > 0)) return false;
  const fh = img.naturalHeight || 68;
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  const fr = nf > 1 ? Math.floor((v.rollDist || 0) / (CM.TILE * vehStrideT.v)) % nf : 0;
  const s = CM.TILE * z;
  const dh2 = s * 0.78, dw2 = dh2;   // ≈ bêtes legacy (scale 0.72-0.74), l'objet a du vide autour
  ctx.drawImage(img, fr * fh, 0, fh, fh, x - dw2 / 2, yFeet - dh2 * 0.82, dw2, dh2);
  return true;
}

function drawIsoVehicle(ctx, v, now, z) {
  const T = CM.TILE, s = T * z;
  const lo = vehicleLaneOffset(v, T);              // offset en px MONDE (s = TILE)
  const wx = v.x + lo.x, wy = v.y + lo.y;
  const p = worldToScreen(wx, wy);
  if (p.x < -s * 2 || p.y < -s * 2 || p.x > CM.cw + s * 2 || p.y > CM.ch + s * 2) return;
  if (v.type === 'basket') {                       // porteurs de panier (ères anciennes)
    drawNamedAgent(ctx, p.x, p.y, z, v.woman ? 'basket-woman' : 'basket-man', 0.85, v.dir, (v.pauseT || 0) <= 0, now, v.x * 0.02);
    return;
  }
  const size = VEH_SIZES[v.type];
  if (!size) return;                               // type sans sprite (broken_cart…) : rien en iso
  const dh = s * size, dw = dh;
  // VUE DIAGONALE si disponible (rotations d'objets PixelLab, direction-correcte,
  // multi-frames « rolling » quand la bande animée est livrée), sinon repli sur
  // la bande CARDINALE (animée mais orientée écran).
  let img = null, usedDiag = false;
  const dchr = ensureVehDiag(v.type);
  if (vehDiagReady(dchr)) {
    const map = VEH_DIAG_MAP[v.type] || VEH_DIAG_MAP.default;
    img = dchr.img[map[v.dir]] || dchr.img[map[0]];
    usedDiag = true;
  } else {
    const chr = ensureVeh(v.type);
    if (!vehReady(chr)) return;
    // Vues poussées : timon vers l'arrière (échange sud↔nord, comme le legacy).
    const sdir = VEH_PUSH[v.type] ? ['east', 'west', 'north', 'south'][v.dir] : VEH_DIRS[v.dir];
    img = chr.img[sdir] || chr.img.south;
  }
  const fh = img.naturalHeight || img.height || 64;
  const nf = Math.max(1, Math.round((img.naturalWidth || img.width || fh) / fh));
  // Diagonales : frame par DISTANCE parcourue (odomètre v.rollDist — anti-
  // patinage, molette __vehStride en fraction de tuile/frame). Cardinales :
  // cadence temporelle legacy inchangée.
  const fr = nf <= 1 ? 0
    : usedDiag ? Math.floor((v.rollDist || 0) / (T * vehStrideT.v)) % nf
      : Math.floor((now || 0) / 130 + v.x * 0.1) % nf;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const drawBody = () => {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + dh * 0.30, dw * 0.30, dh * 0.085, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(img, fr * fh, 0, fh, fh, p.x - dw / 2, p.y - dh / 2, dw, dh);
  };
  // Attelage : bête(s) de trait DEVANT dans le sens de marche (monde → projeté).
  const pull = VEH_PULL[v.type];
  let drawTeam = null, teamBelow = false;
  if (pull) {
    const D = (pull.dist || 0.44) * T;
    const front = [[D, 0], [-D, 0], [0, D], [0, -D]][v.dir] || [0, 0];
    const ap = worldToScreen(wx + front[0], wy + front[1]);
    teamBelow = ap.y > p.y;
    drawTeam = () => {
      ctx.strokeStyle = 'rgba(38,26,15,0.72)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + (ap.x - p.x) * 0.82, p.y + (ap.y - p.y) * 0.82);
      ctx.stroke();
      // Bête en VUE DIAGONALE (retour Raph : cheval de profil ouest→est) si les
      // bandes sont livrées, sinon bande cardinale legacy.
      if (!drawDraftIso(ctx, ap.x, ap.y + dh * 0.24, z, pull.animal, v)) {
        drawNamedAgent(ctx, ap.x, ap.y + dh * 0.24, z, pull.animal, pull.scale || 0.72, v.dir, true, now, v.x * 0.12);
      }
    };
  }
  // Pousseur : humain de l'ère DERRIÈRE (charrette/brouette).
  let drawPusher = null, pusherBelow = false;
  if (VEH_PUSH[v.type]) {
    const D = 0.34 * T;
    const back = [[-D, 0], [D, 0], [0, -D], [0, D]][v.dir] || [0, 0];
    const pp = worldToScreen(wx + back[0], wy + back[1]);
    pusherBelow = pp.y > p.y;
    drawPusher = () => {
      // Vue diagonale du pousseur (nouvelle DA) si dispo, sinon bande cardinale.
      if (!drawEraAgentIso(ctx, pp.x, pp.y + dh * 0.24, z, v.dir, true, now, v.x * 0.1, 0)) {
        drawEraAgent(ctx, pp.x, pp.y + dh * 0.24, z, v.dir, true, now, v.x * 0.1, 0);
      }
    };
  }
  // Ordre nord → sud (peintre local de la petite scène).
  if (drawTeam && !teamBelow) drawTeam();
  if (drawPusher && !pusherBelow) drawPusher();
  drawBody();
  if (drawTeam && teamBelow) drawTeam();
  if (drawPusher && pusherBelow) drawPusher();
  ctx.imageSmoothingEnabled = prev;
}

// ── SCÈNES MOTEUR legacy posées sur le losange (Phase 3-lite) ────────────────
// Expérience validée à la capture : les scènes de cityEngineSprites (props
// PixelLab transparents + personnages + détails procéduraux) se dessinent dans
// une BOÎTE (x, y, w, h) — on leur donne une boîte CARRÉE ancrée au coin sud du
// losange (même geste que drawPixelHouse). Le contenu carré déborde un peu des
// coins du lot en losange (accepté : la référence fait pareil) ; le sol dur sous
// les scènes est déjà coupé game-wide (DRAW_BUILDING_GROUND=false). Molette
// __isoEngineScenes(false) → retour aux socles ; une scène qui jette est mise en
// quarantaine (socle) pour la session, sans casser la frame.
const isoEngineScenesFlag = { on: true };
if (typeof window !== 'undefined') window.__isoEngineScenes = (on) => { isoEngineScenesFlag.on = on !== false; return isoEngineScenesFlag.on; };
const _isoSceneQuarantine = new Set();   // buildingIds dont la scène a jeté (repli socle)
function drawIsoEngineScene(ctx, t, anchor, spanX, spanY, T, z, hh, now) {
  const id = t.buildingId || t.variant || '?';
  if (_isoSceneQuarantine.has(id)) return false;
  // Scènes DE SOL (champs irrigués, aqueducs…) : elles PEIGNENT leur emprise en
  // repère carré → posées en boîte, elles font une dalle qui déborde du lot (vu à
  // la capture : irrigated_fields 10×6 par-dessus le fleuve). Elles retombent sur
  // le rendu d'emprise iso dédié (parcelle plate à sillons / bloc bas).
  if (/field|farm|crop|orchard|aqueduct/i.test(id)) return false;
  const bw = (spanX + spanY) * T * z * ISO_X * 0.72;
  const bx = anchor.x - bw / 2;
  const by = anchor.y - bw + hh * 0.5;   // bas de boîte ≈ coin sud du lot
  try {
    drawEngineSprite(t, bx, by, bw, bw, now);
    return true;
  } catch (e) {
    _isoSceneQuarantine.add(id);
    if (typeof console !== 'undefined') console.warn('[iso] scène moteur en quarantaine:', id, e);
    return false;
  }
}

// ── RIVERAINS (port fluvial / moulin à eau) posés sur le RUBAN (Phase 5) ─────
// Leur scène legacy suppose l'eau « en bas de la boîte » (repère carré) → posée
// en boîte iso, le bassin flottait à côté du ruban. Ici on DÉCOMPOSE : bâtiment
// (sprite transparent, JAMAIS de procédural — leçon carré brun) sur la berge,
// ponton/roue plongeant vers le SUD monde (garanti par layout : waterSide "S",
// bord sud du lot ≈ centre du fleuve), bateau de l'ère amarré SUR le ruban.
// ⚠ Bord d'eau calé sur le RUBAN (samples), pas le riverSet cellulaire : les
// deux divergent et c'est le ruban qu'on voit.
// Ruban AU DROIT d'une colonne x (cellules) : interpole y/hw entre les deux
// samples qui l'encadrent (le fleuve coule ~ouest→est, x ~monotone ; repli =
// sample le plus proche en x). Le sample « le plus proche du lot » ne suffit
// pas : dans un coude, son bord d'eau n'est pas celui du droit du lot (vu à la
// capture : ponton qui démarrait sur l'herbe).
function ribbonAtX(rv, x) {
  const sm = rv.samples;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < sm.length - 1; i += 1) {
    const a = sm[i], b = sm[i + 1];
    if ((a.x - x) * (b.x - x) <= 0 && Math.abs(b.x - a.x) > 1e-6) {
      const f = (x - a.x) / (b.x - a.x);
      return { y: a.y + (b.y - a.y) * f, hw: (a.hw || 2) + ((b.hw || 2) - (a.hw || 2)) * f, i };
    }
    const d = Math.abs(a.x - x);
    if (d < bd) { bd = d; bi = i; }
  }
  return { y: sm[bi].y, hw: sm[bi].hw || 2, i: bi };
}

// Pose un prop par le BAS DE SON CONTENU opaque : contenu large de cw px, haut
// de ch px, bas du contenu à (bx, by). Les PNG PixelLab embarquent souvent ~25 %
// de vide transparent sous les pieds (vu à la capture : moulin « flottant »
// 90 px au-dessus de sa boîte) → ancrer le PNG brut ment sur la position.
// Renvoie le rectangle ÉCRAN du contenu dessiné {x, y, w, h} (pour attacher des
// pièces au flanc : roue de moulin…). ch omis/null → hauteur à l'ASPECT NATUREL
// du contenu (imposer les deux déforme le sprite : l'aspect du contenu n'est pas
// celui du PNG).
function blitPropAnchored(ctx, name, bx, by, cw, ch) {
  const bb = propBBox(name);
  if (!bb) {
    const hh2 = ch || cw;
    blitProp(ctx, bx - cw / 2, by - hh2, cw, hh2, name, 0.5, 0.5, 1, 1);
    return { x: bx - cw / 2, y: by - hh2, w: cw, h: hh2 };
  }
  const cH = ch || cw * (bb.ch / Math.max(1, bb.cw));
  const boxW = cw / (bb.wf || 1), boxH = cH / (bb.hf || 1);
  const cxf = bb.x0f + bb.wf / 2, cbf = bb.y0f + bb.hf;
  blitProp(ctx, bx - boxW * cxf, by - boxH * cbf, boxW, boxH, name, 0.5, 0.5, 1, 1);
  return { x: bx - cw / 2, y: by - cH, w: cw, h: cH };
}

function drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, ei) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  const isMill = t.buildingId === 'water_mills';
  const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
  // Échelle : 1 « cellule legacy » → px iso (entre la cellule stricte T·z et la
  // pose des maisons ~1.56·T·z) ; jugée à la capture.
  const cpx = T * z * 1.3;
  const ccx = t.gx + spanX / 2;
  const rb = ribbonAtX(rv, ccx);
  const si = rb.i;
  const rhw = rb.hw;
  const yEdge = rb.y - rhw;              // rive NORD du ruban AU DROIT du lot
  // Tailles par ère : mêmes formules que la scène legacy (tout grandit ensemble).
  const vstage = band >= 7 ? 'cosmic' : ei >= 30 ? 'container' : ei >= 20 ? 'steam' : ei >= 10 ? 'sail' : 'raft';
  const sizeMul = vstage === 'cosmic' ? (band >= 9 ? 5.6 : band >= 8 ? 4.8 : 4.0)
    : vstage === 'container' ? 3.2 : vstage === 'steam' ? 2.4 : vstage === 'sail' ? 1.8 : 1.36;

  if (isMill) {
    // ── MOULIN : corps sur la berge + roue à aubes sur le flanc ouest, moitié
    //    basse dans l'eau, qui tourne (blitPropRot = pivot au centroïde opaque).
    const stageHouse = ['mill-prop-house', 'mill-house-stone', 'mill-house-industrial', 'mill-house-hydro'][stage];
    const ckM = 'mill-cosmic-' + band;
    const HOUSE = band >= 7 && propReady(ckM) ? ckM
      : propReady(stageHouse) ? stageHouse : (propReady('mill-prop-house') ? 'mill-prop-house' : null);
    if (!HOUSE) return;                  // sprites pas décodés : rien (pas de procédural)
    const twWc = band >= 7 ? Math.min(spanX * 0.94, 1.1 + sizeMul * 0.42) : [1.5, 1.7, 1.95, 2.2][stage];
    const W = twWc * cpx;
    // Base SUR le bord du ruban (le sprite embarque déjà son pied de berge).
    // Ancrage par le BAS DU CONTENU, hauteur à l'aspect naturel du sprite.
    const base = worldToScreen((ccx + 0.3) * T, (yEdge + 0.05) * T);
    const rect = blitPropAnchored(ctx, HOUSE, base.x, base.y, W);
    // ROUE : sprite iso DÉDIÉ animé (bande « turning » 6 frames, refonte
    // demandée par Raph — le skew d'un sprite de face faisait « bizarre »).
    // Stades : bois (0-1) → fonte (2) → turbine (3 et cosmique).
    const wheelKey = band >= 7 || stage === 3 ? 'turbine' : stage === 2 ? 'metal' : 'wood';
    const wArt = isoArt('mill-wheel-' + wheelKey);
    if (wArt.ready) {
      const im2 = wArt.img;
      const fh2 = im2.naturalHeight || 96;
      const nf2 = Math.max(1, Math.round((im2.naturalWidth || fh2) / fh2));
      const period = wheelKey === 'turbine' ? 90 : wheelKey === 'metal' ? 130 : 160;
      // Frames jouées À L'ENVERS : l'anim PixelLab tourne dans le mauvais sens
      // pour un courant ouest→est (retour Raph).
      const fr2 = nf2 > 1 ? (nf2 - 1) - (Math.floor((now || 0) / period) % nf2) : 0;
      const wpx2 = W * 0.66;
      const hubX = rect.x + wpx2 * 0.22, hubY = base.y - wpx2 * 0.30;
      const prevSm3 = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(im2, fr2 * fh2, 0, fh2, fh2, hubX - wpx2 / 2, hubY - wpx2 / 2, wpx2, wpx2);
      ctx.imageSmoothingEnabled = prevSm3;
      return;
    }
    const stageWheel = band >= 7 ? 'mill-turbine' : ['mill-prop-wheel', 'mill-prop-wheel', 'mill-wheel-metal', 'mill-turbine'][stage];
    const WHEEL = propReady(stageWheel) ? stageWheel : (propReady('mill-prop-wheel') ? 'mill-prop-wheel' : null);
    if (WHEEL) {
      // Roue projetée DANS LE PLAN DU MUR SUD (retour Raph : « sprite de face
      // ça ne va pas »). La face visible côté eau d'un bâtiment iso est le mur
      // SUD (le long de l'axe monde +x) : base écran e1=(+1, +ISO_Y)
      // (horizontale du mur, vers le coin sud) et e2=(0, +1) (verticale). Un
      // cercle dessiné sous cette transform devient l'ELLIPSE correcte, et
      // rotate() tourne DANS le plan du mur (rotation continue conservée).
      // Moyeu adossé au flanc, un peu au-dessus de la base → moitié basse à l'eau.
      const im = propImage(WHEEL);
      if (im && im.naturalWidth > 0) {
        const wpx2 = W * 0.6;
        const wbb = propBBox(WHEEL) || { x0f: 0, y0f: 0, wf: 1, hf: 1 };
        const boxW = wpx2 / (wbb.wf || 1), boxH = wpx2 / (wbb.hf || 1);
        const wAng = -(now || 0) / (stage === 3 || band >= 7 ? 320 : 900);
        const hubX = rect.x + wpx2 * 0.45;
        const hubY = base.y - wpx2 * 0.35;
        const prevSm2 = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.translate(hubX, hubY);
        ctx.transform(1, ISO_Y, 0, 1, 0, 0);
        ctx.rotate(wAng);
        ctx.drawImage(im, -boxW * (wbb.x0f + wbb.wf / 2), -boxH * (wbb.y0f + wbb.hf / 2), boxW, boxH);
        ctx.restore();
        ctx.imageSmoothingEnabled = prevSm2;
      }
    }
    return;
  }

  // ── PORT : ponton nord→sud (diagonale à l'écran) + corps de quai + bateau ───
  const stageHouse = ['port-prop-house', 'port-house-medieval', 'port-house-industrial', 'port-house-modern'][stage];
  const ckP = 'port-cosmic-' + band;
  const HOUSE = band >= 7 && propReady(ckP) ? ckP
    : propReady(stageHouse) ? stageHouse : (propReady('port-prop-house') ? 'port-prop-house' : null);
  if (!HOUSE) return;
  // PONTON : bande monde plein sud, de sous le bâtiment jusqu'en pleine eau.
  const dockW = stage === 0 ? 0.72 : Math.min(spanX * 0.5, 0.8 + sizeMul * 0.2);
  // Départ bien SOUS la plateforme du bâtiment (qui le recouvre) : à -0.35 il
  // restait un filet d'eau entre plateforme et ponton à la capture.
  const dockY0 = yEdge - 0.8, dockY1 = yEdge + Math.max(1.0, rhw * 0.6);
  // PONTON EN VRAIE VUE ISO (retour Raph : « les pontons sont tout plats ») :
  // objet 8-dir sur pilotis, rotation qui court en SW écran (= N-S monde).
  // ⚠ labels par objet : bois = paire NORD (nw), pierre = sw ; béton généré
  // avec une flaque d'eau bakée → REBUT, la pierre sert aussi au stade 3+.
  // Repli : planches procédurales.
  const pontKey = stage >= 2 ? 'pontoon-pierre-sw' : 'pontoon-bois-nw';
  const pontArt = isoArt(pontKey);
  if (pontArt.ready) {
    const pd = worldToScreen(ccx * T, ((dockY0 + dockY1) / 2) * T);
    const W3 = (dockY1 - dockY0) * T * z * 1.35;   // contenu diagonal ~74 % du canvas
    const prevDS = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pontArt.img, pd.x - W3 / 2, pd.y - W3 * 0.55, W3, W3);
    ctx.imageSmoothingEnabled = prevDS;
  } else {
    const deck = stage >= 3 ? [126, 128, 132] : stage === 2 ? [148, 140, 122] : [122, 88, 48];
    ctx.fillStyle = rgb(deck, 1);
    fillWorldQuad(ctx, (ccx - dockW / 2) * T, dockY0 * T, (ccx + dockW / 2) * T, dockY1 * T);
    ctx.fillStyle = 'rgba(30,20,10,0.28)';
    for (let py = dockY0 + 0.3; py < dockY1 - 0.1; py += 0.34) {
      fillWorldQuad(ctx, (ccx - dockW / 2 + 0.04) * T, py * T, (ccx + dockW / 2 - 0.04) * T, (py + 0.06) * T);
    }
    ctx.fillStyle = 'rgba(15,20,25,0.30)';
    fillWorldQuad(ctx, (ccx + dockW / 2 - 0.07) * T, (dockY0 + 0.2) * T, (ccx + dockW / 2) * T, dockY1 * T);
  }
  // CORPS de quai sur la berge (recouvre le raccord du ponton).
  const bWc = stage === 0 ? Math.min(1.6, spanX * 0.8) : Math.min(spanX * 1.05, 1.25 + sizeMul * 0.42);
  const W = bWc * cpx;
  // Base qui mord le bord du ruban : le corps de quai s'assoit SUR la rive, sa
  // frange basse (cale/vaguelettes bakées) touche l'eau et recouvre le départ du
  // ponton. Ancrage par le BAS DU CONTENU, hauteur à l'aspect naturel.
  const base = worldToScreen(ccx * T, (yEdge + 0.1) * T);
  blitPropAnchored(ctx, HOUSE, base.x, base.y, W);
  // BATEAU de l'ère amarré au bout du ponton, côté ouest, aligné à la tangente
  // projetée du ruban (même trait que drawIsoShips ; clapot, pas de sillage).
  if (BOAT_SIZES[vstage]) {
    const s = T * z;
    const o = rv.samples[Math.max(0, si - 1)], q = rv.samples[Math.min(rv.samples.length - 1, si + 1)];
    const a2 = worldToScreen(o.x * T, o.y * T), b2 = worldToScreen(q.x * T, q.y * T);
    const effSize = (BOAT_SIZES[vstage] || 0.7) * sizeMul;
    const yBoat = Math.min(rb.y - 0.15, dockY1 - effSize * 0.1);
    // 0.62 : demi-longueur de coque + jeu — à 0.4 la poupe mordait les planches.
    const p = worldToScreen((ccx - dockW / 2 - effSize * 0.62) * T, yBoat * T);
    const bob = Math.sin((now || 0) / 1400 + ccx) * s * 0.02;
    const heading = Math.atan2(b2.y - a2.y, b2.x - a2.x);
    const isoBoat = BOAT_ISO[vstage] ? isoArt('boat-' + vstage + '-' + boatSector(heading)) : null;
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(10,25,35,0.20)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + s * 0.06 * sizeMul, s * 0.24 * sizeMul, s * 0.08 * sizeMul, 0, 0, Math.PI * 2); ctx.fill();
    if (isoBoat && isoBoat.ready) {
      // Rotation iso au secteur du cap local du ruban (amarré parallèle au quai).
      const dw = s * (BOAT_SIZES[vstage] || 0.7) * sizeMul * 1.15;
      ctx.drawImage(isoBoat.img, p.x - dw / 2, p.y - dw * 0.58 + bob, dw, dw);
    } else {
      const boatKey = vstage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, band)) : vstage;
      const chr = ensureBoat(boatKey);
      if (chr && boatReady(chr)) {
        // Repli profil legacy, tilt amorti comme la flotte.
        const tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(b2.y - a2.y, Math.abs(b2.x - a2.x) || 1e-6) * 0.45));
        ctx.save();
        ctx.translate(p.x, p.y + bob);
        ctx.rotate(tilt);
        ctx.scale(sizeMul, sizeMul);
        const bimg = chr.img;
        const bfh = bimg.naturalHeight || bimg.height || 64;
        const bnf = Math.max(1, Math.round((bimg.naturalWidth || bimg.width || bfh) / bfh));
        const bf = bnf > 1 ? Math.floor((now || 0) / 260) % bnf : 0;
        const dw = s * BOAT_SIZES[vstage], dh = dw;
        ctx.drawImage(bimg, bf * bfh, 0, bfh, bfh, -dw / 2, -dh / 2 - dh * BOAT_LIFT, dw, dh);
        ctx.restore();
      }
    }
    ctx.imageSmoothingEnabled = prevSm;
  }
}

function drawIsoLive(now) {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const hw = T * z * ISO_X, hh = T * z * ISO_Y;
  const b = visibleCellBounds(hw * 2);
  const band = (L.counts && L.counts.eraBand) | 0;
  const eraIdx = (L.counts && L.counts.eraIndex) | 0;
  const items = [];
  // Bâtiments (tuiles du layout) : maisons = sprite existant ; le reste = socle.
  for (const t of L.tiles) {
    if (t.gx < b.gx0 || t.gx > b.gx1 || t.gy < b.gy0 || t.gy > b.gy1) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    items.push({ d: depthOf((t.gx + sx) * T, (t.gy + sy) * T), kind: 'tile', t });
  }
  // Arbres (décor) — assez près de la ville seulement (le bake du sol couvre le
  // reste). AÉRATION (retour Raph « tout est trop collé ») : pas d'arbre décoratif
  // à moins de 1.5 cellule de la place ni à moins de 1 cellule d'un terre-plein
  // (ils chevauchaient la fontaine et les haies).
  const pbT = isoPlazaBox(L);
  const segsT = L.terrePlein || [];
  const treeBlocked = (gx, gy) => {
    if (pbT && gx >= pbT.gx0 - 1.5 && gx <= pbT.gx1 + 1.5 && gy >= pbT.gy0 - 1.5 && gy <= pbT.gy1 + 1.5) return true;
    for (const sg of segsT) {
      if (sg.axis === 'v') {
        if (Math.abs(gx + 0.5 - (sg.x + 1)) < 1.0 && gy >= sg.y0 - 1 && gy <= sg.y1 + 1.5) return true;
      } else if (Math.abs(gy + 0.5 - (sg.y + 1)) < 1.0 && gx >= sg.x0 - 1 && gx <= sg.x1 + 1.5) return true;
    }
    return false;
  };
  for (const tr of (L.trees || [])) {
    if (tr.gx < b.gx0 || tr.gx > b.gx1 || tr.gy < b.gy0 || tr.gy > b.gy1) continue;
    if (treeBlocked(tr.gx, tr.gy)) continue;
    items.push({ d: depthOf((tr.gx + 0.5) * T, (tr.gy + 0.9) * T), kind: 'tree', tr });
  }
  // PLACE : scène complète de l'ère posée sur la dalle (profondeur au CENTRE :
  // les passants au sud de la fontaine passent devant, ceux au nord derrière).
  {
    const pb = isoPlazaBox(L);
    const pKey = plazaEraForBand(band);
    if (pb && pKey) {
      const pArt = isoArt('plaza-' + pKey);
      if (pArt.ready) {
        const cxw = ((pb.gx0 + pb.gx1 + 1) / 2) * T, cyw = ((pb.gy0 + pb.gy1 + 1) / 2) * T;
        items.push({
          d: depthOf(cxw, cyw), kind: 'plazaScene', wx: cxw, wy: cyw,
          px: pb.gx1 - pb.gx0 + 1, py: pb.gy1 - pb.gy0 + 1, art: pArt,
        });
      }
    }
  }
  // LAMPADAIRES : mâts de l'ère le long des routes (liste déterministe
  // isoLamps), posés au peintre ; leurs halos de nuit se dessinent dans
  // drawIsoNight à la MÊME position (points lumineux ancrés, retour Raph).
  if (!CM.lodActive) {
    const lampArt = isoArt('lamp-' + lampEraForBand(band));
    if (lampArt.ready) {
      for (const lp of isoLamps(L, band)) {
        if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
        items.push({ d: depthOf(lp.wx, lp.wy), kind: 'lamp', wx: lp.wx, wy: lp.wy, art: lampArt });
      }
    }
  }
  // TERRE-PLEIN RICHE : UNE bande CONTINUE par segment (kind 'medianRun'), rendue
  // en 3-SLICE cap/milieu/cap (cf. rendu) — largeur route, vraie longueur, plus
  // d'empilement. 3 pièces par orientation : median-{se,sw}-{start,mid,end}.
  // Repli buissons épars tant que les pièces ne sont pas décodées.
  if (!CM.lodActive) {
    // UNE seule paire de pièces (SE, jugée « nettement plus jolie » par Raph)
    // sert aux DEUX orientations : le rendu pivote pour rester « dessus en haut »
    // (flip d'angle θ-180 sur l'axe vertical) — plus de médian à l'envers.
    const seP = { s: isoArt('median-se-start'), m: isoArt('median-se-mid'), e: isoArt('median-se-end') };
    const seReady = seP.s.ready && seP.m.ready && seP.e.ready;
    for (const sg of (L.terrePlein || [])) {
      if (sg.axis === 'v') {
        if (sg.x + 1 < b.gx0 - 1 || sg.x + 1 > b.gx1 + 1) continue;
        if (sg.y1 < b.gy0 - 2 || sg.y0 > b.gy1 + 2) continue;
        const wx = (sg.x + 1) * T;
        if (seReady) {
          const cyM = ((sg.y0 + sg.y1 + 1) / 2) * T;
          items.push({ d: depthOf(wx, cyM), kind: 'medianRun', axis: 'v', wx, y0: sg.y0, y1: sg.y1, pieces: seP });
        } else {
          for (let y = sg.y0 + 0.55; y < sg.y1 + 1; y += 1.15) {
            const jj = ((cmHash('tp:' + sg.x + ':' + Math.round(y * 10)) % 100) / 100);
            items.push({ d: depthOf(wx, (y + 0.06) * T), kind: 'bush', wx, wy: (y + 0.06) * T, r: 0.24 + jj * 0.1, v: 1 + (cmHash('tv:' + sg.x + ':' + Math.round(y * 10)) % 2) });
          }
        }
      } else {
        if (sg.y + 1 < b.gy0 - 1 || sg.y + 1 > b.gy1 + 1) continue;
        if (sg.x1 < b.gx0 - 2 || sg.x0 > b.gx1 + 2) continue;
        const wy = (sg.y + 1) * T;
        if (seReady) {
          const cxM = ((sg.x0 + sg.x1 + 1) / 2) * T;
          items.push({ d: depthOf(cxM, wy), kind: 'medianRun', axis: 'h', wy, x0: sg.x0, x1: sg.x1, pieces: seP });
        } else {
          for (let x = sg.x0 + 0.55; x < sg.x1 + 1; x += 1.15) {
            const jj = ((cmHash('tp:' + Math.round(x * 10) + ':' + sg.y) % 100) / 100);
            items.push({ d: depthOf((x + 0.06) * T, wy), kind: 'bush', wx: (x + 0.06) * T, wy, r: 0.24 + jj * 0.1, v: 1 + (cmHash('tv:' + Math.round(x * 10) + ':' + sg.y) % 2) });
          }
        }
      }
    }
  }
  // Habitants : sprites actuels (dirs cardinales — Phase 4 les passera en diagonales).
  if (!CM.lodActive) {
    for (const p of CM.citizens) {
      if (p._nightHidden) continue;
      items.push({ d: depthOf(p.x + (p.lox || 0), p.y + (p.loy || 0)), kind: 'cit', p });
    }
    // Véhicules : mêmes règles (drones = passe aérienne, plus tard).
    for (const v of CM.vehicles) {
      if (v.type === 'drone') continue;
      const lo = vehicleLaneOffset(v, T);
      items.push({ d: depthOf(v.x + lo.x, v.y + lo.y), kind: 'veh', v });
    }
  }
  items.sort((a, bb) => a.d - bb.d);
  const prevSmooth = ctx.imageSmoothingEnabled;
  for (const it of items) {
    if (it.kind === 'tile') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      // Ancre = coin SUD de l'empreinte (point monde (gx+spanX, gy+spanY)).
      const anchor = worldToScreen((t.gx + spanX) * T, (t.gy + spanY) * T);
      const isHouse = t.type === 'house' || t.type === 'enginehome';
      // Bâtiment RIVERAIN (port/moulin : l'empreinte mord la berge/l'eau) :
      // scène iso DÉDIÉE (drawIsoRiverside — bâtiment sur berge, ponton/roue vers
      // le ruban, bateau amarré). Ni scène-boîte legacy ni socle : la boîte
      // legacy embarque son eau en repère carré (bassin flottant, vu à la capture).
      if (t.type === 'engine') {
        const rc = (L.river && L.river.present && L.river.cells) || null;
        if (rc) {
          let wet = false;
          for (let ax = 0; ax < spanX && !wet; ax += 1) for (let ay = 0; ay < spanY && !wet; ay += 1) {
            if (rc.has((t.gx + ax) + ',' + (t.gy + ay)) || (L.river.banks && L.river.banks.has((t.gx + ax) + ',' + (t.gy + ay)))) wet = true;
          }
          if (wet) {
            if ((t.buildingId === 'river_ports' || t.buildingId === 'water_mills') && isoEngineScenesFlag.on) {
              drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, eraIdx);
            }
            continue;
          }
        }
      }
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;  // largeur allouée au sprite (~78 % du losange)
      if (isHouse && pixelHouseReady(t)) {
        const hpx = wpx;                                    // seul y+h compte (ancre pieds)
        drawPixelHouse(t, anchor.x - wpx / 2, anchor.y - hpx - hh * 0.5, wpx, hpx);
      } else if (t.type === 'engine' && isoEngineScenesFlag.on && drawIsoEngineScene(ctx, t, anchor, spanX, spanY, T, z, hh, now)) {
        // Scène moteur legacy posée sur le losange (Phase 3-lite) — cf. helper.
      } else {
        const id2 = t.buildingId || t.variant || '';
        const n = worldToScreen(t.gx * T, t.gy * T);
        const e = { x: n.x + spanX * hw, y: n.y + spanX * hh };
        const s = { x: n.x + (spanX - spanY) * hw, y: n.y + (spanX + spanY) * hh };
        const w = { x: n.x - spanY * hw, y: n.y + spanY * hh };
        if (/field|farm|crop|orchard/i.test(id2)) {
          // CHAMPS : parcelle PLATE cultivée dans l'emprise (losange) + SILLONS
          // projetés — la scène legacy (peinture carrée du sol) ne se pose pas.
          ctx.fillStyle = rgb([118, 118, 72], 0.96 + ((cmHash('fld:' + t.gx + ':' + t.gy) % 100) / 100) * 0.08);
          ctx.beginPath();
          ctx.moveTo(n.x, n.y); ctx.lineTo(e.x, e.y); ctx.lineTo(s.x, s.y); ctx.lineTo(w.x, w.y);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(66,66,40,0.5)';
          for (let ry = 0.45; ry < spanY; ry += 0.55) {
            fillWorldQuad(ctx, (t.gx + 0.12) * T, (t.gy + ry) * T, (t.gx + spanX - 0.12) * T, (t.gy + ry + 0.14) * T);
          }
          continue;
        }
        if (/aqueduct/i.test(id2)) {
          // AQUEDUC : CANAL plat étroit le long de l'axe long de l'emprise (le
          // bloc extrudé 10×1 faisait un mur qui chevauchait champs et berge).
          const horizA = spanX >= spanY;
          const ax0 = t.gx * T, ay0 = t.gy * T;
          const cxA = (t.gx + spanX / 2) * T, cyA = (t.gy + spanY / 2) * T;
          ctx.fillStyle = rgb([168, 162, 140], 1);
          if (horizA) fillWorldQuad(ctx, ax0, cyA - T * 0.22, ax0 + spanX * T, cyA + T * 0.22);
          else fillWorldQuad(ctx, cxA - T * 0.22, ay0, cxA + T * 0.22, ay0 + spanY * T);
          ctx.fillStyle = rgb([96, 118, 128], 1);   // filet d'eau au centre
          if (horizA) fillWorldQuad(ctx, ax0 + T * 0.1, cyA - T * 0.09, ax0 + spanX * T - T * 0.1, cyA + T * 0.09);
          else fillWorldQuad(ctx, cxA - T * 0.09, ay0 + T * 0.1, cxA + T * 0.09, ay0 + spanY * T - T * 0.1);
          continue;
        }
        // Socle : BLOC iso extrudé (empreinte + 2 murs + toit plat) — repli des
        // scènes en quarantaine / molette __isoEngineScenes(false).
        const c = t.type === 'engine' ? [172, 152, 112] : [150, 142, 120];
        const v = 0.96 + ((cmHash(t.gx + ':' + t.gy) % 100) / 100) * 0.08;
        // Extrusion discrète, plafonnée : les grandes empreintes moteur ne doivent pas
        // écraser les habitations au jalon (leurs scènes arrivent en Phase 3).
        const hgt = hh * 1.1;
        // mur ouest (ombré) puis mur est (plus sombre — lumière haut-gauche), puis toit.
        ctx.fillStyle = rgb(c, 0.78 * v);
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(c, 0.6 * v);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(c, v);
        ctx.beginPath(); ctx.moveTo(n.x, n.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
      }
    } else if (it.kind === 'tree') {
      // ARBRES PIXEL (retour Raph : les sapins-triangles « pas faits
      // correctement du tout ») : sprite PixelLab /pixelart/iso/tree-N.png,
      // variante stable par hash de cellule ; repli = triangle procédural.
      const tr = it.tr;
      const p = worldToScreen((tr.gx + 0.5) * T, (tr.gy + 0.9) * T);
      const tv = 1 + (cmHash('tree:' + tr.gx + ':' + tr.gy) % ISO_TREE_VARIANTS);
      const tArt = isoArt('tree-' + tv);
      if (tArt.ready) {
        const hpx = T * z * (tr.r || 0.7) * 2.7;
        const prevTS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tArt.img, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
        ctx.imageSmoothingEnabled = prevTS;
      } else {
        drawTreeIso(ctx, p.x, p.y, T * z * (tr.r || 0.7) * 1.3);
      }
    } else if (it.kind === 'plazaScene') {
      // Losange de CONTENU mesuré calé pile sur l'emprise de la dalle (le
      // canvas brut décalait la scène — retour Raph).
      const p = worldToScreen(it.wx, it.wy);
      drawIsoGroundedArt(ctx, it.art, p.x, p.y, (it.px + it.py) * T * z * ISO_X * 0.98);
    } else if (it.kind === 'medianRun') {
      // Bande de terre-plein CONTINUE en 3-SLICE (retour Raph : répéter le sprite
      // ENTIER empilait ses bouts + son arbre). start (cap) → mid (période) ×N →
      // end (cap), posés dans un repère PIVOTÉ sur la couture (angle iso réel de
      // A→B) : le mid tuile sans empilement, largeur = chaussée, longueur de bout
      // en bout. Anti-couture/anti-trou : un nombre ENTIER de mids remplit pile
      // la travée, chacun très légèrement étiré (< 1 période, invisible).
      const P = it.pieces;
      let A, B;
      if (it.axis === 'h') { A = worldToScreen(it.x0 * T, it.wy); B = worldToScreen((it.x1 + 1) * T, it.wy); }
      else { A = worldToScreen(it.wx, it.y0 * T); B = worldToScreen(it.wx, (it.y1 + 1) * T); }
      // Garder le DESSUS EN HAUT : si la couture « pointe vers la gauche »
      // (|θ| > 90°, cas de l'axe vertical → bas-gauche), on inverse les deux bouts
      // pour ramener l'angle dans (−90°, 90°] — petite rotation, plus de médian
      // à l'envers, éclairage haut-gauche conservé.
      if (Math.abs(Math.atan2(B.y - A.y, B.x - A.x)) > Math.PI / 2) { const tmp = A; A = B; B = tmp; }
      const Lpx = Math.hypot(B.x - A.x, B.y - A.y);
      const th = Math.atan2(B.y - A.y, B.x - A.x);
      const roadW = T * z * 0.62;               // largeur ≈ chaussée
      const ph = P.s.img.naturalHeight || 1;
      const sc = roadW / ph;
      const wS = (P.s.img.naturalWidth || 1) * sc;
      const wM = (P.m.img.naturalWidth || 1) * sc;
      const wE = (P.e.img.naturalWidth || 1) * sc;
      const lift = roadW * 0.30;                 // remonte : le relief déborde vers le HAUT, pas sur la chaussée
      const prevMS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.translate(A.x, A.y);
      ctx.rotate(th);
      ctx.beginPath();
      ctx.rect(-1, -roadW * 3, Lpx + 2, roadW * 6);   // borne la LONGUEUR (bouts nets), large en hauteur pour le relief
      ctx.clip();
      const put = (art, x, w) => ctx.drawImage(art.img, x, -(art.img.naturalHeight || 1) * sc / 2 - lift, w, (art.img.naturalHeight || 1) * sc);
      if (Lpx <= wS + wE) {
        put(P.s, 0, wS);
        put(P.e, Lpx - wE, wE);
      } else {
        put(P.s, 0, wS);
        const midSpan = Lpx - wS - wE;
        const nMid = Math.max(1, Math.round(midSpan / wM));
        const step = midSpan / nMid;             // remplit PILE : chaque mid étiré à `step` (< 1 période d'écart)
        for (let i = 0; i < nMid; i += 1) put(P.m, wS + i * step, step + 0.6);
        put(P.e, Lpx - wE, wE);
      }
      ctx.restore();
      ctx.imageSmoothingEnabled = prevMS;
    } else if (it.kind === 'lamp') {
      const p = worldToScreen(it.wx, it.wy);
      const hpx = T * z * LAMP_H;
      const prevLS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(it.art.img, p.x - hpx / 2, p.y - hpx * 0.94, hpx, hpx);
      ctx.imageSmoothingEnabled = prevLS;
    } else if (it.kind === 'bush') {
      // Buisson de terre-plein : feuillu réutilisé petit, pied sur la couture.
      const p = worldToScreen(it.wx, it.wy);
      const bArt = isoArt('tree-' + it.v);
      if (bArt.ready) {
        const hpx = T * z * it.r * 2.7;
        const prevBS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bArt.img, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
        ctx.imageSmoothingEnabled = prevBS;
      }
    } else if (it.kind === 'veh') {
      drawIsoVehicle(ctx, it.v, now, z);
    } else {
      const p = it.p;
      const sp = worldToScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
      const walking = (p.pauseT || 0) <= 0;
      // Vue DIAGONALE (Phase 4) si la bande existe, sinon bande cardinale.
      // p.walkDist = odomètre → animation par DISTANCE (anti-patinage).
      if (!drawEraAgentIso(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0, 1, p.walkDist != null ? p.walkDist : null)) {
        drawEraAgent(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0);
      }
    }
  }
  ctx.imageSmoothingEnabled = prevSmooth;
}

// Point d'entrée : rend la frame iso. Renvoie false si layout absent (repli legacy).
// helpers = { bakeMargin, blitMargin } (les caches offscreen du runtime, déjà
// compatibles iso : le pan est projeté dans cityMapBakeMargin/BlitMargin).
export function drawIsoWorld(dt, now, helpers) {
  const L = CM.layout;
  if (!L) return false;
  // Sim : mêmes mises à jour que le pipeline legacy (les agents vivent).
  updateCitizens(dt);
  updateVehicles(dt);
  // Fond hors-monde (nature sombre) puis sol baké.
  const ctx = CM.ctx;
  ctx.fillStyle = rgb(GRASS_WILD, 0.9);
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (CM.groundCanvas && helpers) {
    const key = 'iso:' + CM.layoutRecomputeAt + ':' + CM.cam.zoom.toFixed(3) + ':' + ((L.counts && L.counts.eraBand) | 0);
    helpers.bakeMargin(CM.groundCanvas, CM.gctx, '_isoGroundBake', key, drawIsoGround);
    helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');
  } else {
    drawIsoGround();
  }
  // Fleuve LIVE (animé) par-dessus le sol baké → QUAIS par ère (promenade le
  // long du ruban, partagés avec le legacy : cityMapDrawQuays projette via le
  // module iso) → bateaux SUR l'eau → tabliers de pont (les bateaux passent
  // dessous) → scène vivante → drones (passe aérienne) → nuit.
  // Terre-plein : le gazon du bake porte le SOL ; le RELIEF vient de buissons
  // DEBOUT plantés dans la passe vivante (drawIsoLive) — la projection à plat
  // de l'art legacy « couchait » les plantes bakées (retour Raph).
  drawIsoRiver(now);
  cityMapDrawQuays(now);
  drawIsoShips(dt, now);
  drawIsoBridges(now);
  drawIsoLive(now);
  drawIsoDrones(now);
  drawIsoNight(now);
  return true;
}
