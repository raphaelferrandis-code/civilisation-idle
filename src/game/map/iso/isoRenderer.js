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
import {
  updateCitizens, updateVehicles, drawEraAgent, drawEraAgentIso, drawNamedAgent,
  vehicleLaneOffset, ensureVeh, vehReady, VEH_SIZES, VEH_PULL, VEH_PUSH,
  ensureBoat, boatReady, BOAT_SIZES, BOAT_LIFT, ensureDrone, drawDroneRotors,
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
      let kind = null, tone;
      if (isPlaza) { kind = 'plaza'; tone = PLAZA; }
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
      const texAlpha = kind === 'urban' ? 0.26 : kind === 'dirt' ? 0.5 : 1;
      const tile = kind ? ensureIsoTile(kind) : null;
      const tileReady = !!(tile && tile.ready);
      if (!tileReady || texAlpha < 1) {
        // Aplat (repli OU sous-couche du grain) : variance douce stable par seed.
        const v = 0.96 + ((cmHash(key) % 100) / 100) * 0.08;
        ctx.fillStyle = rgb(tone, v);
        diamondPath(ctx, p.x, p.y, hw, hh);
        ctx.fill();
        // Anti-couture : fin liseré de la même couleur par-dessus les bords partagés.
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
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
  const tp = L.terrePlein;
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
    const laneRoom = Math.max(0, hw - effSize * 0.25 - 0.25);
    const wave = Math.sin((now || 0) / 2600 + (sh.phase || 0)) * 0.12;
    const lateral = ((sh.lane || 0) + wave) * laneRoom;
    cgx += nx * lateral; cgy += ny * lateral;
    const p = worldToScreen(cgx * T, cgy * T);
    if (p.x < -s * 3 || p.x > CM.cw + s * 3 || p.y < -s * 3 || p.y > CM.ch + s * 3) continue;
    // Cap : tangente PROJETÉE ; coque « droite » (tilt sur |dx|) + miroir par sens.
    const a2 = worldToScreen(sm[i0].x * T, sm[i0].y * T);
    const b2 = worldToScreen(sm[i1].x * T, sm[i1].y * T);
    const tilt = Math.atan2(b2.y - a2.y, Math.abs(b2.x - a2.x) || 1e-6);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(tilt);
    ctx.scale((sh.dir < 0 ? -1 : 1) * sizeMul, sizeMul);
    // Sillage additif derrière la poupe (raccourci du legacy).
    {
      const spd01 = Math.max(0, Math.min(1, (sh.speed - 0.008) / 0.012));
      const WL = s * (0.85 + spd01 * 0.8) * (0.35 + 0.65 * moveF);
      const foam = vstage === 'cosmic' ? '150,220,255' : '225,238,245';
      const wa = (0.10 + spd01 * 0.10) * moveF;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gt = ctx.createLinearGradient(-s * 0.18, 0, -WL, 0);
      gt.addColorStop(0, `rgba(${foam},${wa.toFixed(2)})`);
      gt.addColorStop(1, `rgba(${foam},0)`);
      ctx.fillStyle = gt;
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, -s * 0.045);
      ctx.lineTo(-WL, -s * 0.02);
      ctx.lineTo(-WL, s * 0.02);
      ctx.lineTo(-s * 0.18, s * 0.045);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Ombre portée sur l'eau + coque (sprite du stade, bande animée éventuelle).
    ctx.fillStyle = 'rgba(10,25,35,0.20)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.1, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    if (chr && boatReady(chr)) {
      const bimg = chr.img;
      const bfh = bimg.naturalHeight || bimg.height || 64;
      const bnf = Math.max(1, Math.round((bimg.naturalWidth || bimg.width || bfh) / bfh));
      const bf = bnf > 1 ? Math.floor((now || 0) / 140 + sh.t * 7) % bnf : 0;
      const dw = s * BOAT_SIZES[vstage], dh = dw;
      const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bimg, bf * bfh, 0, bfh, bfh, -dw / 2, -dh / 2 - dh * BOAT_LIFT, dw, dh);
      ctx.imageSmoothingEnabled = prevSm;
    }
    ctx.restore();
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
function drawIsoNight(now) {
  const n = CM.nightF || 0;
  if (n <= 0.03) return;
  const ctx = CM.ctx, L = CM.layout;
  ctx.fillStyle = `rgba(8,11,26,${(0.62 * n).toFixed(2)})`;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (!L) return;
  const T = CM.TILE, z = CM.cam.zoom;
  const b = visibleCellBounds(0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let count = 0;
  for (const t of L.tiles) {
    if (count > 380) break;
    if (t.gx < b.gx0 || t.gx > b.gx1 || t.gy < b.gy0 || t.gy > b.gy1) continue;
    const h = cmHash('glow:' + t.gx + ':' + t.gy);
    if ((h % 10) < 3) continue;                    // ~30 % de bâtiments éteints
    const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
    const p = worldToScreen((t.gx + spanX / 2) * T, (t.gy + spanY / 2) * T);
    const r = Math.max(3, T * z * 0.7);
    const a = 0.12 + ((h >> 4) % 40) / 400;
    const g = ctx.createRadialGradient(p.x, p.y - r * 0.5, 0, p.x, p.y - r * 0.5, r);
    g.addColorStop(0, `rgba(255,205,110,${Math.min(0.5, a * n * 4).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,205,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, p.y - r * 1.5, r * 2, r * 2);
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
function drawIsoBridges() {
  const L = CM.layout;
  const cells = isoBridgeCells(L);
  if (!cells.length) return;
  const T = CM.TILE, ctx = CM.ctx;
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
  const chr = ensureVeh(v.type);
  if (!vehReady(chr)) return;
  const dh = s * size, dw = dh;
  // Vues poussées : timon vers l'arrière (échange sud↔nord, comme le legacy).
  const sdir = VEH_PUSH[v.type] ? ['east', 'west', 'north', 'south'][v.dir] : VEH_DIRS[v.dir];
  const img = chr.img[sdir] || chr.img.south;
  const fh = img.naturalHeight || img.height || 64;
  const nf = Math.max(1, Math.round((img.naturalWidth || img.width || fh) / fh));
  const fr = nf > 1 ? Math.floor((now || 0) / 130 + v.x * 0.1) % nf : 0;
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
      drawNamedAgent(ctx, ap.x, ap.y + dh * 0.24, z, pull.animal, pull.scale || 0.72, v.dir, true, now, v.x * 0.12);
    };
  }
  // Pousseur : humain de l'ère DERRIÈRE (charrette/brouette).
  let drawPusher = null, pusherBelow = false;
  if (VEH_PUSH[v.type]) {
    const D = 0.34 * T;
    const back = [[-D, 0], [D, 0], [0, -D], [0, D]][v.dir] || [0, 0];
    const pp = worldToScreen(wx + back[0], wy + back[1]);
    pusherBelow = pp.y > p.y;
    drawPusher = () => { drawEraAgent(ctx, pp.x, pp.y + dh * 0.24, z, v.dir, true, now, v.x * 0.1, 0); };
  }
  // Ordre nord → sud (peintre local de la petite scène).
  if (drawTeam && !teamBelow) drawTeam();
  if (drawPusher && !pusherBelow) drawPusher();
  drawBody();
  if (drawTeam && teamBelow) drawTeam();
  if (drawPusher && pusherBelow) drawPusher();
  ctx.imageSmoothingEnabled = prev;
}

function drawIsoLive(now) {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const hw = T * z * ISO_X, hh = T * z * ISO_Y;
  const b = visibleCellBounds(hw * 2);
  const band = (L.counts && L.counts.eraBand) | 0;
  const items = [];
  // Bâtiments (tuiles du layout) : maisons = sprite existant ; le reste = socle.
  for (const t of L.tiles) {
    if (t.gx < b.gx0 || t.gx > b.gx1 || t.gy < b.gy0 || t.gy > b.gy1) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    items.push({ d: depthOf((t.gx + sx) * T, (t.gy + sy) * T), kind: 'tile', t });
  }
  // Arbres (décor) — assez près de la ville seulement (le bake du sol couvre le reste).
  for (const tr of (L.trees || [])) {
    if (tr.gx < b.gx0 || tr.gx > b.gx1 || tr.gy < b.gy0 || tr.gy > b.gy1) continue;
    items.push({ d: depthOf((tr.gx + 0.5) * T, (tr.gy + 0.9) * T), kind: 'tree', tr });
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
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;  // largeur allouée au sprite (~78 % du losange)
      if (isHouse && pixelHouseReady(t)) {
        const hpx = wpx;                                    // seul y+h compte (ancre pieds)
        drawPixelHouse(t, anchor.x - wpx / 2, anchor.y - hpx - hh * 0.5, wpx, hpx);
      } else {
        // Bâtiment RIVERAIN (port/moulin : l'empreinte mord la berge/l'eau) : PAS
        // de socle — la dalle pleine « flottait » sur le fleuve. Comme en legacy,
        // les riverains ne posent que des sprites transparents (scènes Phase 3).
        const rc = (L.river && L.river.present && L.river.cells) || null;
        if (rc) {
          let wet = false;
          for (let ax = 0; ax < spanX && !wet; ax += 1) for (let ay = 0; ay < spanY && !wet; ay += 1) {
            if (rc.has((t.gx + ax) + ',' + (t.gy + ay))) wet = true;
          }
          if (wet) continue;
        }
        // Socle : BLOC iso extrudé (empreinte + 2 murs + toit plat) — le moteur
        // existe au jalon, ses scènes animées arrivent en Phase 3.
        const n = worldToScreen(t.gx * T, t.gy * T);
        const e = { x: n.x + spanX * hw, y: n.y + spanX * hh };
        const s = { x: n.x + (spanX - spanY) * hw, y: n.y + (spanX + spanY) * hh };
        const w = { x: n.x - spanY * hw, y: n.y + spanY * hh };
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
      const tr = it.tr;
      const p = worldToScreen((tr.gx + 0.5) * T, (tr.gy + 0.9) * T);
      drawTreeIso(ctx, p.x, p.y, T * z * (tr.r || 0.7) * 1.3);
    } else if (it.kind === 'veh') {
      drawIsoVehicle(ctx, it.v, now, z);
    } else {
      const p = it.p;
      const sp = worldToScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
      const walking = (p.pauseT || 0) <= 0;
      // Vue DIAGONALE (Phase 4) si la bande existe, sinon bande cardinale.
      if (!drawEraAgentIso(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0)) {
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
  // Fleuve LIVE (animé) par-dessus le sol baké → bateaux SUR l'eau → tabliers de
  // pont (les bateaux passent dessous) → scène vivante → drones (passe aérienne)
  // → nuit (voile + fenêtres chaudes).
  drawIsoRiver(now);
  drawIsoShips(dt, now);
  drawIsoBridges();
  drawIsoLive(now);
  drawIsoDrones(now);
  drawIsoNight(now);
  return true;
}
