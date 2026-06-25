/* ============================================================================
 * pixelRiver.js — FLEUVE pixel-art (derrière flag pixelWaterFlag.on)
 *
 *   APPROCHE A — « ruban texture clippé » :
 *   On NE rasterise PAS le fleuve sur la grille (riverSet) — ça recopierait
 *   l'effet escalier (cf. mémoire map-water-placement). On garde la SILHOUETTE
 *   vectorielle lisse exacte du fleuve (le polygone de `ribbon(1)` =
 *   samples ± normale·hw, cf. cityMapDrawRiver dans renderWorld.js) et on s'en
 *   sert comme MASQUE (ctx.clip()). À l'intérieur du clip on tile une texture
 *   d'eau pixel-art (protocole identique à drawPixelTerrain : nearest +
 *   dx/dy=floor + sz=ceil(...)+1). Le contour reste la spline anti-aliasée par
 *   le canvas → ZÉRO escalier ; seul le grain intérieur devient pixel-art.
 *
 *   PHASE 2 : tuile d'eau saine 64px tileable (PixelLab create_tiles_pro,
 *   public/pixelart/water/water.png). ANIMATION PROCÉDURALE — l'animation-objet
 *   PixelLab (create_1_direction_object + animate_object) ne sait PAS produire de
 *   texture pleine-cadre tileable (elle fabrique des objets centrés à marge
 *   transparente : 16 candidats vides/blob vérifiés). On anime donc en code :
 *   deux couches de la tuile défilant à vitesses différentes (parallaxe/courant)
 *   + les overlays vectoriels de cityMapDrawRiver (filets + étincelles), fins,
 *   qui animent la surface sans masquer le pixel-art.
 *
 *   Déclin (Phase 4) : en cité usée (timeWear>0.7) ou effondrée (CM.collapseAt) on
 *   GARDE le pixel-art et on le TEINTE en multiply — vert stagnant / noir — sans
 *   écume ni roseaux (drawPixelRiver renvoie toujours true). Le fallback vectoriel
 *   cityMapDrawRiver ne sert plus que si le flag est OFF ou l'asset est absent.
 *
 *   Câblage : cityMapRuntime.js, à la place exacte de cityMapDrawRiver(now)
 *   (même z-order → ponts/bateaux du blit statique recouvrent l'eau gratuitement).
 *   Si le flag est OFF, si l'asset n'est pas chargé, ou si drawPixelRiver renvoie
 *   false, on retombe sur le rendu vectoriel cityMapDrawRiver intact (fallback).
 * ============================================================================ */

import { state } from '../core/state.js';
import { ensureQuayGate } from './renderWorld.js';

export const pixelWaterFlag = { on: true };

// Dev : window.__pixelWater(on) bascule eau pixel <-> eau vectorielle (A/B test).
export function setPixelWater(on) { pixelWaterFlag.on = !!on; }

// --- Paramètres (réglables) --------------------------------------------------
const SRC = 32;              // taille source de la tuile d'eau (px) — water.png est 32×32
const WATER_TILE_WORLD = 32; // emprise monde d'une tuile (px) : 32 = densité 1:1 EXACTE comme grass.png (T=32)
// Animation procédurale = 2 couches de la même tuile défilant à des vitesses
// différentes (le courant + une parallaxe lente qui « vit »). Vitesses en tuiles/s.
const LAYERS = [
  { speed: 0.35, dirX: 1, dirY: 0, alpha: 1 },     // courant principal (X+)
  { speed: 0.18, dirX: 0.6, dirY: 0.25, alpha: 0.4 } // parallaxe lente (diagonale douce)
];

// --- Chargement de la tuile d'eau saine -------------------------------------
let waterImg = null, waterReady = false;
function ensureWater() {
  if (waterImg || typeof Image === 'undefined') return;
  waterImg = new Image();
  waterImg.onload = () => { waterReady = true; };
  waterImg.onerror = () => { console.warn('[pixelRiver] /pixelart/water/water.png introuvable → fallback eau vectorielle'); };
  waterImg.src = '/pixelart/water/water.png';
}
ensureWater();

// --- Sprites de ROSEAUX (PixelLab, objets 64×64 à fond transparent) ----------
// 3 variantes posées au bord d'eau (ancrées par la base) pour casser la répétition.
const REED_FILES = ['water/reeds-0', 'water/reeds-1', 'water/reeds-2'];
let reedImgs = null, reedReady = 0;
function ensureReeds() {
  if (reedImgs || typeof Image === 'undefined') return;
  reedImgs = REED_FILES.map((name) => {
    const img = new Image();
    img.onload = () => { reedReady += 1; };
    img.onerror = () => { console.warn('[pixelRiver] /pixelart/' + name + '.png introuvable → pas de roseaux'); };
    img.src = '/pixelart/' + name + '.png';
    return img;
  });
}
ensureReeds();

// Normale unitaire à la tangente centrée, EN CONVENTION « increasing-sample » :
// rigoureusement identique à cmRiverNormalAt de renderWorld.js (non exporté, et
// déjà dupliqué inline plusieurs fois là-bas). +n / -n désignent les deux rives
// de façon cohérente avec les quais/docks/bateaux — ne PAS changer le signe.
function riverNormalAt(sm, i) {
  const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
  let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1;
  return { nx: -ty / tl, ny: tx / tl };
}

/**
 * Dessine le CORPS d'eau du fleuve en pixel-art (clippé au ruban lisse).
 * @returns {boolean} true si dessiné (skip cityMapDrawRiver) ; false = fallback.
 */
export function drawPixelRiver(CM, now) {
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) return false;
  const sm = L.river.samples;
  if (sm.length < 2) return false;
  ensureWater();
  if (!waterReady) return false;              // asset pas prêt -> fallback vectoriel
  ensureQuayGate();                           // rafraîchit CM.quayGate (gating roseaux), idempotent
  // États de DÉCLIN : on GARDE le pixel-art (texture visible) en le teintant —
  // usé = vert stagnant, effondré = noir (au lieu d'un fallback vectoriel).
  const collapsed = !!CM.collapseAt;
  const worn = !collapsed && (state.timeWear || 0) > 0.7;

  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const SX = (gx) => (gx * T - CM.cam.x) * z + CM.cw / 2;
  const SY = (gy) => (gy * T - CM.cam.y) * z + CM.ch / 2;

  ctx.save();

  // --- 1) MASQUE = silhouette vectorielle exacte (copie de ribbon(1)) ---------
  ctx.beginPath();
  for (let i = 0; i < sm.length; i += 1) {
    const n = riverNormalAt(sm, i), s = sm[i];
    const x = SX(s.x + n.nx * s.hw), y = SY(s.y + n.ny * s.hw);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = sm.length - 1; i >= 0; i -= 1) {
    const n = riverNormalAt(sm, i), s = sm[i];
    ctx.lineTo(SX(s.x - n.nx * s.hw), SY(s.y - n.ny * s.hw));
  }
  ctx.closePath();
  ctx.clip();

  // --- 2) TILING ANIMÉ sous le clip -------------------------------------------
  // Boîte monde du ruban (en px), intersectée à la fenêtre caméra.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of sm) {
    const r = s.hw + 1;
    if (s.x - r < minX) minX = s.x - r;
    if (s.x + r > maxX) maxX = s.x + r;
    if (s.y - r < minY) minY = s.y - r;
    if (s.y + r > maxY) maxY = s.y + r;
  }
  const halfW = (CM.cw / 2) / z, halfH = (CM.ch / 2) / z;
  const wx0 = Math.max(minX * T, CM.cam.x - halfW), wx1 = Math.min(maxX * T, CM.cam.x + halfW);
  const wy0 = Math.max(minY * T, CM.cam.y - halfH), wy1 = Math.min(maxY * T, CM.cam.y + halfH);

  const P = WATER_TILE_WORLD;
  const sz = Math.ceil(P * z) + 1;                   // +1px : masque les coutures au zoom fractionnaire
  const tsec = (now || 0) / 1000;

  const prevSmoothing = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;                 // nearest-neighbor (pixels nets)
  // Deux couches de la même tuile, défilant à des vitesses/directions différentes :
  // le courant principal + une parallaxe lente translucide -> surface vivante.
  for (const ly of LAYERS) {
    const sx = tsec * ly.speed * T * ly.dirX;        // décalage monde X (px)
    const sy = tsec * ly.speed * T * ly.dirY;        // décalage monde Y (px)
    const c0 = Math.floor((wx0 - sx) / P) - 1, c1 = Math.ceil((wx1 - sx) / P) + 1;
    const r0 = Math.floor((wy0 - sy) / P) - 1, r1 = Math.ceil((wy1 - sy) / P) + 1;
    ctx.globalAlpha = ly.alpha;
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        const dx = Math.floor((col * P + sx - CM.cam.x) * z + CM.cw / 2);
        const dy = Math.floor((row * P + sy - CM.cam.y) * z + CM.ch / 2);
        ctx.drawImage(waterImg, 0, 0, SRC, SRC, dx, dy, sz, sz);
      }
    }
  }
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmoothing;

  // --- 2a) TEINTE D'ÉTAT (multiply, dans le clip) : la texture pixel reste
  // visible, seule sa couleur vire. Usé -> vert stagnant ; effondré -> noir.
  if (worn || collapsed) {
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = collapsed ? 'rgb(40,54,34)' : 'rgb(150,188,116)';
    ctx.fillRect(0, 0, CM.cw, CM.ch);
    ctx.globalCompositeOperation = prevOp;
  }

  // --- 2b) BORD : EFFET DE PROFONDEUR (bas-fond clair -> eau sombre) ----------
  // Plusieurs liserés clairs superposés le long de la rive, DANS le clip (moitié
  // externe coupée). Du plus large/sombre au plus fin/vif : lecture "eau peu
  // profonde claire au bord, profonde sombre au centre" + écume au tout bord.
  // Suit le ruban lisse (jamais la cellule) -> aucun escalier.
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const strokeEdge = (off, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    for (const side of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i < sm.length; i += 1) {
        const n = riverNormalAt(sm, i), s = sm[i];
        const o = s.hw + off;
        const x = SX(s.x + side * n.nx * o), y = SY(s.y + side * n.ny * o);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
  if (!collapsed && !worn) {                          // écume/profondeur : eau saine
    strokeEdge(-0.32, 'rgba(72,114,134,0.26)', Math.max(3, z * 6.5));  // bas-fond (large, doux)
    strokeEdge(-0.14, 'rgba(114,160,178,0.40)', Math.max(2, z * 3.6)); // eau peu profonde
    strokeEdge(-0.04, 'rgba(150,190,204,0.55)', Math.max(2, z * 2.2)); // écume large
    strokeEdge(-0.01, 'rgba(200,228,236,0.78)', Math.max(1, z * 1.4)); // liseré d'écume vif
  } else if (worn) {                                  // eau stagnante : bord assombri, pas d'écume
    strokeEdge(-0.10, 'rgba(12,22,14,0.32)', Math.max(2, z * 3));
  }                                                   // effondré : aucun bord (eau morte)

  ctx.restore();                                     // libère le clip

  // --- 3+4) OVERLAYS + ROSEAUX, par-dessus la texture (clip déjà relâché). Ils
  // mutent strokeStyle/lineWidth/fillStyle ; encadrés d'un save/restore pour ne
  // PAS laisser fuiter d'état canvas vers cityMapDrawQuays/reflets/ships dessinés
  // juste après (hygiène — inoffensif aujourd'hui car ils réassignent, mais c'est
  // la convention du projet).
  ctx.save();
  // Filets/étincelles : pleins en eau saine, atténués en usé, rien en effondré.
  if (!collapsed) drawRiverOverlays(CM, now, sm, SX, SY, worn ? 0.05 : 0.16);
  // Roseaux : seulement en eau saine (secs/absents en déclin), sur les berges NON
  // urbaines (le gate du quai les masque là où il y a une promenade).
  if (!collapsed && !worn) drawRiverReeds(CM, sm, SX, SY);
  ctx.restore();
  return true;
}

// Hash entier -> [0,1) stable (pas de Math.random : capture déterministe + pas de
// scintillement d'une frame à l'autre).
function reedHash(n) {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 13; x = (Math.imul(x, 2246822519)) >>> 0; x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Roseaux ruban-following : sprites PixelLab posés au bord d'eau (jamais par
// cellule). Placement PSEUDO-ALÉATOIRE par ZONES -> groupes serrés + trous (pas
// un motif régulier). Variante / échelle / position scatterées par hash. Sur les
// rives NON urbaines (CM.quayGate), ancrés par la base.
const REED_SPRITE = 64;       // taille source des sprites
const REED_TILES = 0.7;       // hauteur cible de la frame, en tuiles (roseaux petits)
const REED_CLUSTER = 7;       // longueur d'une zone (en samples)
function drawRiverReeds(CM, sm, SX, SY) {
  ensureReeds();
  if (reedReady < REED_FILES.length) return;           // sprites pas prêts -> rien (pas de fallback laid)
  const ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom, ts = T * z;
  const gate = CM.quayGate, nImg = reedImgs.length;
  const prevS = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;                   // sprites nets
  for (let i = 0; i < sm.length; i += 1) {
    const s = sm[i], n = riverNormalAt(sm, i);
    const tx = -n.ny, ty = n.nx;                        // tangente unitaire
    for (let si = 0; si < 2; si += 1) {
      const side = si ? -1 : 1;
      const urban = gate && (si ? gate.minus : gate.plus);
      if (urban && urban[i]) continue;                 // pas de roseaux sous le quai
      const key = i * 2 + si;
      // Zones basse fréquence : ~30% des tronçons sont des "bancs de roseaux"
      // (denses), le reste nu sauf rares touffes isolées -> groupes + trous.
      const inZone = reedHash(((i / REED_CLUSTER) | 0) * 2 + si + 101) > 0.70;
      const place = inZone ? (reedHash(key * 2 + 7) < 0.55) : (reedHash(key * 2 + 999) < 0.035);
      if (!place) continue;
      const along = (reedHash(key + 23) - 0.5) * 0.8;   // scatter le long du ruban
      const inn = 0.02 + reedHash(key + 71) * 0.12;     // un peu côté terre, variable
      const bx = s.x + side * n.nx * (s.hw + inn) + tx * along;
      const by = s.y + side * n.ny * (s.hw + inn) + ty * along;
      const px = SX(bx), py = SY(by);
      if (px < -ts || px > CM.cw + ts || py < -2 * ts || py > CM.ch + ts) continue;
      const img = reedImgs[Math.min(nImg - 1, (reedHash(key + 5) * nImg) | 0)]; // variante alea
      const jit = 0.72 + reedHash(key + 41) * 0.60;     // échelle 0.72..1.32
      const h = REED_TILES * ts * jit, w = h;           // sprite carré
      const dx = Math.round(px - w / 2);
      const dy = Math.round(py - h + ts * 0.12);         // base ancrée au bord d'eau
      // petite ombre portée au pied (ancre la touffe au sol)
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(px, py + ts * 0.06, Math.max(2, w * 0.24), Math.max(1, w * 0.09), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(img, 0, 0, REED_SPRITE, REED_SPRITE, dx, dy, Math.round(w), Math.round(h));
    }
  }
  ctx.imageSmoothingEnabled = prevS;
}

// Filets de courant + étincelles — copie de cityMapDrawRiver (état sain), tracés
// PAR-DESSUS la texture. refA = 0.16 (eau saine).
function drawRiverOverlays(CM, now, sm, SX, SY, refA) {
  const ctx = CM.ctx, z = CM.cam.zoom;
  // Filets : 3 ondulations lentes le long de la normale.
  ctx.strokeStyle = `rgba(255,255,255,${(refA * 0.5).toFixed(3)})`; ctx.lineWidth = 1;
  for (let w2 = 0; w2 < 3; w2 += 1) {
    ctx.beginPath();
    for (let i = 0; i < sm.length; i += 1) {
      const n = riverNormalAt(sm, i);
      const off = (w2 - 1) * sm[i].hw * 0.45 + Math.sin(i * 0.35 + (now || 0) / 2400 + w2 * 2) * sm[i].hw * 0.22;
      const x = SX(sm[i].x + n.nx * off), y = SY(sm[i].y + n.ny * off);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Étincelles : 9 points doux qui glissent ; chauds (reflets ville) la nuit.
  const nf = CM.nightF || 0;
  for (let i = 0; i < 9; i += 1) {
    const t = (((now || 0) / 1000 * (0.012 + (i % 3) * 0.006)) + i * 0.11) % 1;
    const idx = Math.floor(t * (sm.length - 1));
    const flick = 0.4 + 0.6 * Math.abs(Math.sin((now || 0) / 1100 + i * 1.7));
    ctx.fillStyle = nf > 0.3
      ? `rgba(255,210,130,${(refA * flick * (0.8 + nf)).toFixed(3)})`
      : `rgba(255,255,255,${(refA * flick).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(SX(sm[idx].x), SY(sm[idx].y), Math.max(1, 1.3 * z), 0, Math.PI * 2);
    ctx.fill();
  }
}
