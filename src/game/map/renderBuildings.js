/* eslint-disable */
import { state } from '../core/state.js';
import {
  CM,
  CM_TINTS,
  cmHash,
  cmWonderSlot
} from './layout.js';
import { cityMapTileScreen } from './legacyRuntime.js';
import { drawEngineSprite, drawHouseShape, drawPublicShape, BUILDING_HEIGHTS } from './buildingShapes.js';
import { baseColor, cmLitColor } from './renderWorld.js';

/* ---- legacy citymap rendering\buildings.js ---- */


/* ============================================================================
 * citymap-render-buildings.js - Rendu des tuiles, batiments, districts et merveilles.
 *   drawTile et helpers de forme (drawHouseShape, drawPublicShape,
 *   drawEngineSprite, drawTinyCamp). Depend de CM, citymap-camera et citymap-draw-utils.
 * ============================================================================ */

// Teintes de quartier (qkind) : dominante marquée pour que les quartiers se
// distinguent d'un coup d'œil — toits de tuile en habitat, souk doré, marbre
// lavande au sanctuaire, garnison rouge sombre, quartier savant bleuté...
const CM_QTINT = {
  habitat: "rgba(205,92,58,0.16)",
  marchand: "rgba(235,180,60,0.17)",
  religieux: "rgba(206,188,255,0.18)",
  militaire: "rgba(190,60,46,0.16)",
  savant: "rgba(96,150,255,0.17)",
  agricole: "rgba(150,200,80,0.14)",
  prestige: "rgba(255,226,150,0.2)"
};

// Masses de quartier pour le rendu dézoomé (LOD) : une couleur pleine par
// type de quartier/catégorie, lisible de très haut.
const CM_LOD_COLORS = {
  habitat: "#9c5a40",
  marchand: "#b08a3a",
  religieux: "#9a8cb8",
  militaire: "#84443a",
  savant: "#5a7aa8",
  agricole: "#6f8a3c",
  prestige: "#c2a868"
};
const CM_LOD_BY_TYPE = {
  house: "#8a6044",
  public: "#b09050",
  library: "#7a86a0",
  farm: "#55772e",
  engine: "#c0a050"
};

// Tuile en mode LOD : un seul aplat coloré (quartier puis catégorie), aucune
// micro-géométrie — la métropole vue de haut devient des masses lisibles.
function drawTileLOD(t, ctx, x, y, w, h) {
  const col = (t.type !== "farm" && t.type !== "engine" && t.qkind && CM_LOD_COLORS[t.qkind])
    || CM_LOD_BY_TYPE[t.type] || "#8a6044";
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
}

/* Building shape helpers moved to buildingShapes.js. */

function drawTile(t, now, timeWear, maxD2) {
  const spanX = t.spanX || t.size || 1;
  const spanY = t.spanY || t.size || 1;
  const s = CM.TILE * CM.cam.zoom;
  const sx = (t.gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (t.gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const boxW = s * spanX, boxH = s * spanY;
  if (sx < -boxW || sy < -boxH || sx > CM.cw + boxW || sy > CM.ch + boxH) return;
  const ctx = CM.ctx;

  // Niveau de détail : très dézoomé, chaque tuile devient un aplat de masse
  // de quartier — pas de sprites, pas d'ombres, pas d'animations.
  if (CM.lodActive && !CM.collapseAt) {
    const padL = Math.max(0.5, s * 0.08);
    drawTileLOD(t, ctx, sx + padL, sy + padL, boxW - padL * 2, boxH - padL * 2);
    return;
  }

  // Degradation peripherique (usure > 50%).
  const degradeFrac = timeWear > 0.5 ? (timeWear - 0.5) / 0.5 : 0;
  const norm = t.d2 / maxD2;
  const degraded = degradeFrac > 0 && norm > (1 - degradeFrac);

  // Anim de construction.
  const born = CM.born[t.key] || now;
  const appearMs = t.type === "engine" ? 700 : 500;
  const prog = Math.max(0, Math.min(1, (now - born) / appearMs));
  const e = prog * prog * (3 - 2 * prog); // smoothstep opacity 0→1
  // Tiles classiques : shrink depuis le centre (visible car les tuiles sont grandes)
  // Tuiles moteur (engine) : pleine taille immédiate + opacity only (sprites trop détaillés pour shrink)
  let inset = 0;
  if (t.type !== "engine") inset = (1 - e) * Math.min(boxW, boxH) * 0.5;
  let x = sx + inset, y = sy + inset, w = boxW - inset * 2, h = boxH - inset * 2;
  if (w <= 0.5) return;
  ctx.globalAlpha = e;
  const pad = s * 0.12;
  const zc = CM.cam.zoom;
  let tileLumDelta = 0;

  // Effondrement : la ville s'ecroule du centre vers l'exterieur (shrink puis ruine).
  if (CM.collapseAt) {
    const ct = (now - CM.collapseAt) / 1000;
    const sp = Math.max(0, Math.min(1, (ct - norm * 1.1) / 0.6));
    if (sp >= 1) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#2a2018";
      ctx.fillRect(x + pad, y + h * 0.52, w - pad * 2, h * 0.4);
      ctx.fillStyle = "#4a4030";
      ctx.fillRect(x + w * 0.3, y + h * 0.58, w * 0.18, h * 0.16);
      ctx.fillRect(x + w * 0.56, y + h * 0.66, w * 0.16, h * 0.14);
      return;
    }
    const k = 1 - sp * 0.85;
    const fx = x + w / 2, fy = y + h;     // se tasse vers le sol
    w *= k; h *= k; x = fx - w / 2; y = fy - h;
  }

  // Variation par batiment (seed stable sur x,y) : taille, decalage 1px, luminosite, micro-ombre.
  if (t.type !== "farm" && t.type !== "engine") {
    const seedV = cmHash(t.gx + ":" + t.gy);
    const sizeVar = 0.82 + (seedV % 37) / 37 * 0.28;   // 0.82..1.10
    const offX = (((seedV >> 5) % 3) - 1);             // -1..1 px
    const offY = (((seedV >> 7) % 3) - 1);
    const ccx = x + w / 2, ccy = y + h / 2;
    w *= sizeVar; h *= sizeVar;
    x = ccx - w / 2 + offX; y = ccy - h / 2 + offY;
    tileLumDelta = (((seedV >> 9) % 31) / 31 - 0.5) * 0.3; // ~ +/-15%
    // Ombre portée bas-droite : s'allonge avec la hauteur du bâtiment
    // (pseudo-3D — une tour projette beaucoup plus loin qu'une hutte).
    const bh = BUILDING_HEIGHTS[t.variant] ?? 1;
    const sh = Math.max(1.2, (1.4 + bh * 1.7) * zc);
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.34, 0.2 + bh * 0.05).toFixed(2)})`;
    ctx.fillRect(x + pad + sh, y + pad + sh, w - pad * 2, h - pad * 2);
  }

  if (t.type === "engine") {
    drawEngineSprite(t, x, y, w, h, now);
    // ── Héritage Babel : halo doré pour les tuiles adjacentes du même type ──
    if (state?.babelHeritage && t.buildingId) {
      const tileMap = CM.layout?.engineTileMap;
      if (tileMap) {
        const tileCat = buildingById?.[t.buildingId]?.category;
        if (tileCat) {
          const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          let adjCount = 0;
          for (const [dx, dy] of DIRS) {
            const nb = tileMap.get((t.gx + dx) + "," + (t.gy + dy));
            if (nb && buildingById?.[nb.buildingId]?.category === tileCat) adjCount++;
          }
          if (adjCount > 0) {
            const ctx = CM.ctx;
            ctx.save();
            ctx.globalAlpha = Math.min(0.45, 0.15 + adjCount * 0.10);
            ctx.fillStyle = "#c9a840";
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = Math.min(0.75, 0.28 + adjCount * 0.16);
            ctx.strokeStyle = "#f0d070";
            ctx.lineWidth = Math.max(1, w * 0.055);
            ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
            ctx.restore();
          }
        }
      }
    }
  } else if (t.type === "farm") {
    ctx.fillStyle = t.variant === "industrial" ? "#657239" : t.variant === "patch" ? "#3f6424" : "#4a7a2a";
    ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    ctx.strokeStyle = t.variant === "industrial" ? "#9a8f48" : "#3a6a1a";
    ctx.lineWidth = Math.max(1, s * 0.05);
    if (t.variant === "industrial") {
      ctx.strokeRect(x + w * 0.24, y + h * 0.24, w * 0.52, h * 0.52);
      ctx.fillStyle = "rgba(25,18,8,0.35)";
      ctx.fillRect(x + w * 0.4, y + h * 0.12, w * 0.2, h * 0.74);
    } else {
      for (let li = 1; li <= 3; li += 1) {
        const ly = y + pad + (h - pad * 2) * li / 4;
        ctx.beginPath(); ctx.moveTo(x + pad, ly); ctx.lineTo(x + w - pad, ly); ctx.stroke();
      }
    }
  } else {
    // Corps du batiment
    if (t.type === "house") {
      drawHouseShape(x, y, w, h, pad, CM.layout?.counts?.urbanTier || 0, t.gx * 13 + t.gy * 7, t.variant, now);
    } else if (t.type === "public") {
      drawPublicShape(t.type, x, y, w, h, pad, CM.layout?.counts?.urbanTier || 0, t.variant, now);
    } else if (t.type === "library") {
      drawPublicShape(t.type, x, y, w, h, pad, CM.layout?.counts?.urbanTier || 0, t.variant, now);
    } else {
      ctx.fillStyle = baseColor(t.type, t.variant);
      ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    }
  }

  // Variation de luminosite (clair/sombre selon le seed).
  if (t.type !== "farm" && Math.abs(tileLumDelta) > 0.02) {
    ctx.fillStyle = tileLumDelta > 0 ? `rgba(255,240,210,${tileLumDelta.toFixed(2)})` : `rgba(0,0,0,${(-tileLumDelta).toFixed(2)})`;
    ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
  }

  // Teinte de quartier : dominante selon le quartier d'appartenance
  // (rend la structure procédurale lisible : souk doré, quartier savant bleuté...).
  if (t.qkind && t.type !== "engine" && t.type !== "farm") {
    const tint = CM_QTINT[t.qkind];
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    }
  }

  // Surcouche de degradation (usure > 60% : assombrissement + fissures diagonales).
  if (degraded) {
    ctx.fillStyle = "rgba(20,14,8,0.45)"; ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    ctx.strokeStyle = "rgba(10,6,3,0.7)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + pad); ctx.lineTo(x + w * 0.55, y + h - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w * 0.62, y + pad); ctx.lineTo(x + w * 0.42, y + h - pad); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Fumee industrielle (ere avancee) sur certains batiments.
  const eb = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  if (eb >= 4 && (t.variant === "block" || t.variant === "tenement" || t.variant === "industrial" || t.type === "public") && ((t.gx * 7 + t.gy * 13) % 3 === 0)) {
    const cxs = x + w * 0.5;
    for (let k = 0; k < 2; k += 1) {
      const ph = ((now / 1400) + k * 0.5 + t.gx * 0.13) % 1;
      const py = y + h * 0.12 - ph * h * 1.1;
      ctx.fillStyle = `rgba(72,66,60,${((1 - ph) * 0.3).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cxs + Math.sin(ph * 6 + t.gx) * w * 0.12, py, w * (0.1 + ph * 0.16), 0, Math.PI * 2); ctx.fill();
    }
  }

  // Feu (usure > 80% sur batiments degrades).
  if (timeWear > 0.8 && degraded && t.type !== "farm") {
    const fireSeed = (t.gx * 31 + t.gy * 17);
    if ((fireSeed % 5) < 3) {
      const fl = 0.55 + 0.45 * Math.abs(Math.sin(now / 130 + fireSeed));
      const fx = x + w / 2, fy = y + h * 0.55, fr = w * 0.42;
      // Cache gradient par position écran — recréé seulement si la caméra bouge
      const fxR = Math.round(fx), fyR = Math.round(fy), frR = Math.round(fr * 10);
      if (!t._fireGrad || t._fireGrad.x !== fxR || t._fireGrad.y !== fyR || t._fireGrad.r !== frR) {
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
        g.addColorStop(0, "rgba(255,228,120,1)");
        g.addColorStop(0.5, "rgba(240,120,30,0.8)");
        g.addColorStop(1, "rgba(180,40,20,0)");
        t._fireGrad = { x: fxR, y: fyR, r: frR, g };
      }
      ctx.globalAlpha = fl;
      ctx.fillStyle = t._fireGrad.g;
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = e;
    }
  }
}

function drawCentralFire(now) {
  const L = CM.layout;
  if (!L || !L.counts || L.counts.eraBand > 0) return;
  const z = CM.cam.zoom, s = CM.TILE * z;
  // Le grand feu brûle au cœur de ville du plan (décalé du centre de grille).
  const coreX = L.plan?.core?.x ?? L.cx;
  const coreY = L.plan?.core?.y ?? L.cy;
  const cx = ((coreX + 0.5) * CM.TILE - CM.cam.x) * z + CM.cw / 2;
  const cy = ((coreY + 0.5) * CM.TILE - CM.cam.y) * z + CM.ch / 2;
  if (cx < -s * 2 || cx > CM.cw + s * 2 || cy < -s * 2 || cy > CM.ch + s * 2) return;
  const ctx = CM.ctx;
  const t = now || 0;
  const r = s * 0.55; // rayon du feu proportionnel au zoom

  // Halo rayonnant
  const halo = 0.22 + 0.10 * Math.abs(Math.sin(t / 520));
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
  rg.addColorStop(0, `rgba(255,165,35,${halo.toFixed(2)})`);
  rg.addColorStop(0.6, `rgba(255,80,10,${(halo * 0.35).toFixed(2)})`);
  rg.addColorStop(1, "rgba(255,60,5,0)");
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2); ctx.fill();

  // Cercle de pierres
  ctx.fillStyle = "#5a4830";
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.4, Math.max(1.5, r * 0.1), 0, Math.PI * 2); ctx.fill();
  }
  // Bûches en croix
  ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = "round";
  ctx.strokeStyle = "#6a3c0c";
  ctx.beginPath(); ctx.moveTo(cx - r*0.38, cy + r*0.14); ctx.lineTo(cx + r*0.38, cy - r*0.14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + r*0.38, cy + r*0.14); ctx.lineTo(cx - r*0.38, cy - r*0.14); ctx.stroke();
  ctx.lineCap = "square";
  // Braises
  ctx.fillStyle = "rgba(200,60,5,0.82)";
  ctx.beginPath(); ctx.ellipse(cx, cy + r*0.05, r*0.28, r*0.2, 0, 0, Math.PI*2); ctx.fill();
  // 3 flammes animées
  const f1 = 0.5+0.5*Math.sin(t/170), f2 = 0.5+0.5*Math.sin(t/140+1.3), f3 = 0.5+0.5*Math.sin(t/200+2.7);
  ctx.fillStyle = `rgba(255,88,10,${(0.78+f1*0.22).toFixed(2)})`;
  ctx.beginPath(); ctx.moveTo(cx-r*0.22,cy+r*0.1); ctx.quadraticCurveTo(cx-r*0.32,cy-r*(0.38+f1*0.18),cx,cy-r*(0.55+f1*0.15)); ctx.quadraticCurveTo(cx+r*0.32,cy-r*(0.38+f2*0.14),cx+r*0.22,cy+r*0.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(255,200,22,${(0.82+f2*0.18).toFixed(2)})`;
  ctx.beginPath(); ctx.moveTo(cx-r*0.14,cy+r*0.1); ctx.quadraticCurveTo(cx-r*0.08,cy-r*(0.44+f2*0.22),cx,cy-r*(0.66+f2*0.18)); ctx.quadraticCurveTo(cx+r*0.08,cy-r*(0.44+f3*0.15),cx+r*0.14,cy+r*0.1); ctx.closePath(); ctx.fill();
  // Étincelle au sommet
  ctx.fillStyle = `rgba(255,252,210,${(0.65+f3*0.35).toFixed(2)})`;
  ctx.beginPath(); ctx.arc(cx, cy - r*(0.64+f2*0.17), Math.max(1, r*0.09), 0, Math.PI*2); ctx.fill();
}

function drawMinimap() {
  if (!CM.mctx) return;
  const m = CM.mctx, size = 150, world = CM.gridN * CM.TILE, sc = size / world;
  m.clearRect(0, 0, size, size);
  m.fillStyle = "#1a1208"; m.fillRect(0, 0, size, size);
  if (CM.layout) {
    m.fillStyle = "#3a3326";
    for (const r of CM.layout.roads) m.fillRect(r.gx * CM.TILE * sc, r.gy * CM.TILE * sc, Math.max(1, CM.TILE * sc), Math.max(1, CM.TILE * sc));
    for (const t of CM.layout.tiles) {
      m.fillStyle = t.type === "engine" ? (CM_INFRA_IDS.has(t.buildingId) ? "#b8a882" : CM_KNOWLEDGE_IDS.has(t.buildingId) ? "#6bb6ff" : "#d4a017") : t.type === "farm" ? "#4a7a2a" : t.type === "public" || t.type === "library" ? "#c9a84c" : "#8b6914";
      const span = t.size || 1;
      m.fillRect(t.gx * CM.TILE * sc, t.gy * CM.TILE * sc, Math.max(1, span * CM.TILE * sc), Math.max(1, span * CM.TILE * sc));
    }
  }
  // Rectangle de la zone visible.
  const vx = (CM.cam.x - CM.cw / 2 / CM.cam.zoom) * sc;
  const vy = (CM.cam.y - CM.ch / 2 / CM.cam.zoom) * sc;
  const vw = (CM.cw / CM.cam.zoom) * sc, vh = (CM.ch / CM.cam.zoom) * sc;
  m.strokeStyle = "#ffffff"; m.lineWidth = 1;
  m.strokeRect(vx, vy, vw, vh);
}

function drawWonder(w, idx, now) {
  const L = CM.layout; if (!L) return;
  const slot = cmWonderSlot(idx, L.gridN, L.cx, L.cy);
  const z = CM.cam.zoom, s = CM.TILE * z;
  const cxs = (slot.gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * z + CM.cw / 2;
  const baseY = (slot.gy * CM.TILE + CM.TILE - CM.cam.y) * z + CM.ch / 2;
  let H_MAX = s * 7, W = s * 3.6;
  if (w.id === "pop1m")          { H_MAX = s * 5.5; W = s * 4.8; }
  if (w.id === "era_kingdom")    { H_MAX = s * 8;   W = s * 3.8; }
  if (w.id === "era_empire")     { H_MAX = s * 6;   W = s * 5.2; }
  if (w.id === "era_mega")       { H_MAX = s * 9;   W = s * 2.6; }
  if (w.id === "era_singularity"){ H_MAX = s * 8.5; W = s * 3.2; }
  // Palier d'évolution (1..5) : le monument grandit à chaque jalon franchi.
  const tier = Math.max(1, Math.min(5, (state && state.wonderTiers && state.wonderTiers[w.id]) || 1));
  const tierMul = 0.78 + tier * 0.11; // rang I : ×0.89 → rang V : ×1.33
  H_MAX *= tierMul;
  W *= tierMul;
  if (cxs < -W * 3 || cxs > CM.cw + W * 3 || baseY < -H_MAX * 1.5 || baseY > CM.ch + s * 3) return;

  const born = CM.born["wonder:" + w.id];
  const prog = born ? Math.max(0, Math.min(1, (now - born) / 1400)) : 1;
  const e = prog * prog * (3 - 2 * prog);
  const H = H_MAX * e;
  const topY = baseY - H;
  const ctx = CM.ctx;
  const glow = 0.5 + 0.25 * Math.sin(now / 700 + idx * 1.3);
  const tint = CM_TINTS[CM.dynastyIdx % CM_TINTS.length];

  // Esplanade pavée
  const plazaRx = W * 1.15, plazaRy = plazaRx * 0.36;
  const pg = ctx.createRadialGradient(cxs, baseY, 0, cxs, baseY, plazaRx);
  pg.addColorStop(0, "rgba(178,158,105,0.92)");
  pg.addColorStop(0.55, "rgba(148,130,88,0.6)");
  pg.addColorStop(1, "rgba(112,98,64,0)");
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(cxs, baseY, plazaRx, plazaRy, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(100,84,52,0.28)";
  ctx.lineWidth = Math.max(0.5, s * 0.016);
  for (let ri = 1; ri <= 3; ri++) {
    ctx.beginPath();
    ctx.ellipse(cxs, baseY, plazaRx * ri / 3.8, plazaRy * ri / 3.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Aura
  const auraR = Math.max(1, W * 1.55);
  const ag = ctx.createRadialGradient(cxs, topY + H * 0.3, 0, cxs, topY + H * 0.3, auraR);
  ag.addColorStop(0, `rgba(255,232,120,${(0.36 * glow * e).toFixed(2)})`);
  ag.addColorStop(0.5, `rgba(255,200,60,${(0.11 * glow * e).toFixed(2)})`);
  ag.addColorStop(1, "rgba(255,218,80,0)");
  ctx.fillStyle = ag;
  ctx.beginPath(); ctx.arc(cxs, topY + H * 0.3, auraR, 0, Math.PI * 2); ctx.fill();

  if (H < 3) return;
  ctx.globalAlpha = e;

  ctx.fillStyle = "rgba(0,0,0,0.36)";
  ctx.beginPath(); ctx.ellipse(cxs + s * 0.2, baseY + s * 0.07, W * 0.5, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();

  if (w.id === "dynasty1") {
    // ── LE PREMIER MAUSOLÉE — pyramide / mastaba / obélisque ──────────
    const nSt = 5, stH = H * 0.24;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.08 + (i / nSt) * 0.92), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#c8a040" : "#d8b050";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const chamberW = W * 0.52, chamberH = H * 0.28, chamberY = baseY - stH;
    ctx.fillStyle = "#b89030"; ctx.fillRect(cxs - chamberW / 2, chamberY - chamberH, chamberW, chamberH);
    ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.fillRect(cxs + chamberW * 0.28, chamberY - chamberH, chamberW * 0.22, chamberH);
    ctx.fillStyle = "#5a3808"; ctx.fillRect(cxs - W * 0.065, chamberY - chamberH * 0.72, W * 0.13, chamberH * 0.54);
    ctx.fillStyle = "#8a6030"; ctx.fillRect(cxs - W * 0.048, chamberY - chamberH * 0.68, W * 0.096, chamberH * 0.42);
    ctx.fillStyle = "#e8c840";
    ctx.beginPath(); ctx.ellipse(cxs, chamberY - chamberH * 0.82, W * 0.055, H * 0.022, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a1a08"; ctx.beginPath(); ctx.arc(cxs, chamberY - chamberH * 0.82, W * 0.022, 0, Math.PI * 2); ctx.fill();
    const obBase = chamberY - chamberH, sw0 = W * 0.09, sw1 = W * 0.018;
    ctx.fillStyle = "#e0b840";
    ctx.beginPath(); ctx.moveTo(cxs - sw0 / 2, obBase); ctx.lineTo(cxs - sw1 / 2, topY + H * 0.07);
    ctx.lineTo(cxs + sw1 / 2, topY + H * 0.07); ctx.lineTo(cxs + sw0 / 2, obBase); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,230,130,0.22)";
    ctx.beginPath(); ctx.moveTo(cxs - sw0 / 2, obBase); ctx.lineTo(cxs - sw0 / 2 + W * 0.022, obBase);
    ctx.lineTo(cxs - sw1 / 2 + W * 0.022, topY + H * 0.07); ctx.lineTo(cxs - sw1 / 2, topY + H * 0.07); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(140,100,10,0.45)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    for (let li = 1; li < 8; li++) {
      const fy = obBase + (topY + H * 0.07 - obBase) * (li / 8);
      const fw = sw0 + (sw1 - sw0) * (li / 8);
      ctx.beginPath(); ctx.moveTo(cxs - fw / 2, fy); ctx.lineTo(cxs + fw / 2, fy); ctx.stroke();
    }
    ctx.fillStyle = "#ffe860";
    ctx.beginPath(); ctx.moveTo(cxs - sw1 * 1.2, topY + H * 0.07); ctx.lineTo(cxs, topY); ctx.lineTo(cxs + sw1 * 1.2, topY + H * 0.07); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,250,180,${(0.92 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.16), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "pop1m") {
    // ── LA COLONNE DU MILLION — colonne triomphale, frise spiralée,
    //    statue dorée au sommet, quatre lions de bronze au pied ─────────
    const nSt = 4, stH = H * 0.14;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.22 + (i / nSt) * 0.78), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#c8c0a0" : "#d8d0b0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH;
    // Lions de bronze aux quatre coins du socle
    ctx.fillStyle = "#8a6a28";
    for (const lx of [-0.38, 0.38]) {
      ctx.beginPath(); ctx.ellipse(cxs + W * lx, podY - H * 0.015, W * 0.06, H * 0.035, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cxs + W * lx + W * 0.04, podY - H * 0.05, W * 0.032, 0, Math.PI * 2); ctx.fill();
    }
    // Dé de la colonne (piédestal sculpté)
    const dieW = W * 0.26, dieH = H * 0.12;
    ctx.fillStyle = "#cfc4a0"; ctx.fillRect(cxs - dieW / 2, podY - dieH, dieW, dieH);
    ctx.strokeStyle = "rgba(120,95,40,0.5)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    ctx.strokeRect(cxs - dieW * 0.38, podY - dieH * 0.8, dieW * 0.76, dieH * 0.6);
    // Fût de la colonne
    const colW = W * 0.155, colTop = topY + H * 0.2, colBase = podY - dieH;
    const cGrad = ctx.createLinearGradient(cxs - colW / 2, 0, cxs + colW / 2, 0);
    cGrad.addColorStop(0, "#e6dcba"); cGrad.addColorStop(0.4, "#f2ead0"); cGrad.addColorStop(1, "#c8bc94");
    ctx.fillStyle = cGrad;
    ctx.fillRect(cxs - colW / 2, colTop, colW, colBase - colTop);
    // Frise spiralée (bandes diagonales sculptées qui montent)
    ctx.strokeStyle = "rgba(130,105,50,0.55)"; ctx.lineWidth = Math.max(0.8, s * 0.022);
    const spirals = 9;
    for (let li = 0; li <= spirals; li++) {
      const y0 = colBase - (colBase - colTop) * (li / (spirals + 1));
      const y1 = colBase - (colBase - colTop) * ((li + 0.85) / (spirals + 1));
      ctx.beginPath(); ctx.moveTo(cxs - colW / 2, y0); ctx.lineTo(cxs + colW / 2, y1); ctx.stroke();
    }
    // Reliefs : petits points de foule sculptée le long de la spirale
    ctx.fillStyle = "rgba(110,88,40,0.5)";
    for (let li = 0; li < spirals; li++) {
      const ym = colBase - (colBase - colTop) * ((li + 0.45) / (spirals + 1));
      for (let dx = -1; dx <= 1; dx++) {
        ctx.fillRect(cxs + dx * colW * 0.26 - s * 0.012, ym - s * 0.012, Math.max(1, s * 0.024), Math.max(1, s * 0.024));
      }
    }
    // Chapiteau
    ctx.fillStyle = "#d8cda8"; ctx.fillRect(cxs - colW * 0.85, colTop - H * 0.035, colW * 1.7, H * 0.035);
    ctx.fillStyle = "#c4b88e"; ctx.fillRect(cxs - colW * 0.65, colTop - H * 0.06, colW * 1.3, H * 0.028);
    // Statue dorée au sommet (figure ailée levant une couronne)
    const statY = colTop - H * 0.06;
    ctx.fillStyle = "#e8c645";
    ctx.fillRect(cxs - W * 0.022, statY - H * 0.1, W * 0.044, H * 0.1);             // corps
    ctx.beginPath(); ctx.arc(cxs, statY - H * 0.115, W * 0.026, 0, Math.PI * 2); ctx.fill(); // tête
    // Ailes
    ctx.fillStyle = "#f2d870";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.02, statY - H * 0.08); ctx.lineTo(cxs - W * 0.1, statY - H * 0.12); ctx.lineTo(cxs - W * 0.025, statY - H * 0.055); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cxs + W * 0.02, statY - H * 0.08); ctx.lineTo(cxs + W * 0.1, statY - H * 0.12); ctx.lineTo(cxs + W * 0.025, statY - H * 0.055); ctx.closePath(); ctx.fill();
    // Couronne brandie, scintillante
    ctx.strokeStyle = `rgba(255,235,140,${(0.8 + 0.2 * Math.sin(now / 400)).toFixed(2)})`;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath(); ctx.arc(cxs, statY - H * 0.16, W * 0.035, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,250,200,${(0.85 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, statY - H * 0.16, Math.max(2, s * 0.1), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_kingdom") {
    // ── LA COURONNE DE PIERRE — cathédrale gothique ───────────────────
    const nSt = 3, stH = H * 0.08;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.2 + (i / nSt) * 0.8), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#888098" : "#9890a8";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, naveW = W * 0.38, naveH = H * 0.54;
    ctx.fillStyle = "#7a7090"; ctx.fillRect(cxs - naveW / 2, podY - naveH, naveW, naveH);
    ctx.fillStyle = "#6a6080";
    ctx.fillRect(cxs - W * 0.46, podY - naveH * 0.58, W * 0.082, naveH * 0.44);
    ctx.fillRect(cxs + W * 0.378, podY - naveH * 0.58, W * 0.082, naveH * 0.44);
    ctx.fillStyle = "rgba(180,200,255,0.35)";
    for (let wi2 = 0; wi2 < 3; wi2++) {
      const wx2 = cxs - naveW * 0.3 + wi2 * naveW * 0.3;
      const wyTop = podY - naveH * 0.9, wh = naveH * 0.38;
      ctx.fillRect(wx2 - W * 0.04, wyTop, W * 0.08, wh * 0.75);
      ctx.beginPath(); ctx.arc(wx2, wyTop, W * 0.04, Math.PI, 0); ctx.fill();
    }
    const roseY = podY - naveH * 0.38;
    ctx.fillStyle = "rgba(160,180,255,0.45)"; ctx.beginPath(); ctx.arc(cxs, roseY, W * 0.095, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#9890b8"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    for (let ri = 0; ri < 8; ri++) {
      const ra = ri * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(cxs, roseY); ctx.lineTo(cxs + Math.cos(ra) * W * 0.095, roseY + Math.sin(ra) * W * 0.095); ctx.stroke();
    }
    ctx.strokeStyle = "#a8a0c0"; ctx.lineWidth = Math.max(0.5, s * 0.022);
    ctx.beginPath(); ctx.arc(cxs, roseY, W * 0.095, 0, Math.PI * 2); ctx.stroke();
    const towerW = W * 0.2, towerH = H * 0.8;
    for (const tx of [-1, 1]) {
      const tcx = cxs + tx * (naveW / 2 + towerW / 2);
      ctx.fillStyle = "#7a7090"; ctx.fillRect(tcx - towerW / 2, podY - towerH, towerW, towerH);
      ctx.fillStyle = "rgba(160,180,255,0.35)";
      for (let ti = 1; ti <= 3; ti++) {
        const twy = podY - towerH * (0.2 + ti * 0.2);
        ctx.fillRect(tcx - W * 0.048, twy - H * 0.058, W * 0.096, H * 0.058 * 0.75);
        ctx.beginPath(); ctx.arc(tcx, twy - H * 0.058, W * 0.048, Math.PI, 0); ctx.fill();
      }
      ctx.fillStyle = "#9890a8";
      ctx.beginPath(); ctx.moveTo(tcx - towerW / 2, podY - towerH); ctx.lineTo(tcx, podY - towerH - H * 0.16); ctx.lineTo(tcx + towerW / 2, podY - towerH); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d4b840"; ctx.beginPath(); ctx.arc(tcx, podY - towerH - H * 0.16, Math.max(2, s * 0.07), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#888098";
    ctx.beginPath(); ctx.moveTo(cxs - naveW * 0.32, podY - naveH); ctx.lineTo(cxs, topY + H * 0.02); ctx.lineTo(cxs + naveW * 0.32, podY - naveH); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8c830"; ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffe860"; ctx.lineWidth = Math.max(1.5, s * 0.042); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cxs, topY - Math.max(3, s * 0.1)); ctx.lineTo(cxs, topY - H * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.054, topY - H * 0.084); ctx.lineTo(cxs + W * 0.054, topY - H * 0.084); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = `rgba(200,215,255,${(0.74 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY - H * 0.12, Math.max(2, s * 0.15), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_empire") {
    // ── LE FORUM IMPÉRIAL — arc de triomphe + ailes + quadrige ────────
    const nSt = 5, stH = H * 0.13;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.1 + (i / nSt) * 0.9), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#d0c090" : "#e0d0a0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, wingW = W * 0.28, wingH = H * 0.42;
    for (const side of [-1, 1]) {
      const wx = cxs + side * W * 0.22;
      ctx.fillStyle = "#c8b878"; ctx.fillRect(wx - wingW / 2, podY - wingH, wingW, wingH);
      const nWC = 5;
      for (let ci = 0; ci < nWC; ci++) {
        const cx2 = wx - wingW * 0.42 + ci * (wingW * 0.84 / (nWC - 1));
        ctx.fillStyle = "#dcd098"; ctx.fillRect(cx2 - s * 0.04, podY - wingH, s * 0.08, wingH);
        ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.fillRect(cx2 + s * 0.014, podY - wingH, s * 0.018, wingH);
      }
      ctx.fillStyle = "#b0a060"; ctx.fillRect(wx - wingW / 2, podY - wingH - H * 0.028, wingW, H * 0.028);
    }
    const archW = W * 0.44, archH = H * 0.56;
    ctx.fillStyle = "#d4c080"; ctx.fillRect(cxs - archW / 2, podY - archH, archW, archH);
    const mainR = archW * 0.22;
    ctx.fillStyle = "#c0aa60";
    ctx.beginPath(); ctx.arc(cxs, podY - archH + archH * 0.48, mainR, Math.PI, 0);
    ctx.rect(cxs - mainR, podY - archH + archH * 0.48, mainR * 2, archH * 0.48); ctx.fill();
    ctx.fillStyle = "rgba(20,14,4,0.58)";
    ctx.beginPath(); ctx.arc(cxs, podY - archH + archH * 0.48, mainR * 0.84, Math.PI, 0);
    ctx.rect(cxs - mainR * 0.84, podY - archH + archH * 0.48, mainR * 1.68, archH * 0.48); ctx.fill();
    for (const side of [-1, 1]) {
      const ax = cxs + side * archW * 0.32, sR = archW * 0.1;
      ctx.fillStyle = "#b89050";
      ctx.beginPath(); ctx.arc(ax, podY - archH + archH * 0.38, sR, Math.PI, 0);
      ctx.rect(ax - sR, podY - archH + archH * 0.38, sR * 2, archH * 0.38); ctx.fill();
      ctx.fillStyle = "rgba(20,14,4,0.52)";
      ctx.beginPath(); ctx.arc(ax, podY - archH + archH * 0.38, sR * 0.82, Math.PI, 0);
      ctx.rect(ax - sR * 0.82, podY - archH + archH * 0.38, sR * 1.64, archH * 0.38); ctx.fill();
    }
    const atticY = podY - archH;
    ctx.fillStyle = "#c0a868"; ctx.fillRect(cxs - archW / 2, atticY - H * 0.14, archW, H * 0.14);
    ctx.strokeStyle = "rgba(150,120,40,0.6)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    for (let li = 0; li < 3; li++) {
      const lx = cxs - archW * 0.35 + li * archW * 0.35;
      ctx.beginPath(); ctx.moveTo(lx, atticY - H * 0.04); ctx.lineTo(lx + archW * 0.28, atticY - H * 0.04); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx, atticY - H * 0.09); ctx.lineTo(lx + archW * 0.22, atticY - H * 0.09); ctx.stroke();
    }
    const quadY = atticY - H * 0.14;
    ctx.fillStyle = "#d4b040"; ctx.fillRect(cxs - W * 0.1, quadY - H * 0.11, W * 0.2, H * 0.06);
    for (let hi = 0; hi < 4; hi++) {
      const hx = cxs - W * 0.15 + hi * W * 0.1;
      ctx.fillStyle = "#e0c040"; ctx.beginPath(); ctx.ellipse(hx, quadY - H * 0.14, W * 0.028, H * 0.034, 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,240,140,${(0.72 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, quadY - H * 0.18, Math.max(2, s * 0.14), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_mega") {
    // ── LA SPIRE DES MONDES — gratte-ciel futuriste, Art déco ─────────
    const nSt = 3, stH = H * 0.07;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.3 + (i / nSt) * 0.7), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#b0b8c0" : "#c0c8d0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    let currY = baseY - stH;
    const setbacks = [
      { w: W * 0.86, h: H * 0.18, col: "#b8c0cc" },
      { w: W * 0.62, h: H * 0.15, col: "#c0c8d4" },
      { w: W * 0.44, h: H * 0.14, col: "#c8d0dc" },
      { w: W * 0.30, h: H * 0.16, col: "#d0d8e4" },
      { w: W * 0.18, h: H * 0.14, col: "#d8e0ec" }
    ];
    for (const sb of setbacks) {
      ctx.fillStyle = sb.col; ctx.fillRect(cxs - sb.w / 2, currY - sb.h, sb.w, sb.h);
      ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(cxs + sb.w * 0.28, currY - sb.h, sb.w * 0.22, sb.h);
      ctx.fillStyle = `rgba(120,200,255,${(0.55 * glow).toFixed(2)})`;
      ctx.fillRect(cxs - sb.w / 2, currY - sb.h, sb.w, Math.max(1.5, s * 0.024));
      ctx.fillStyle = `rgba(160,220,255,${(0.35 + 0.15 * glow).toFixed(2)})`;
      const nLines = Math.max(2, Math.round(sb.h / Math.max(1, s * 0.1)));
      for (let li = 1; li < nLines; li++) {
        const ly = currY - sb.h + sb.h * (li / nLines);
        ctx.fillRect(cxs - sb.w * 0.42, ly - Math.max(0.5, s * 0.012), sb.w * 0.84, Math.max(1, s * 0.018));
      }
      currY -= sb.h;
    }
    ctx.fillStyle = "#d0d8e8";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.04, currY); ctx.lineTo(cxs - W * 0.008, topY + H * 0.04);
    ctx.lineTo(cxs + W * 0.008, topY + H * 0.04); ctx.lineTo(cxs + W * 0.04, currY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8f0f8";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.006, topY + H * 0.04); ctx.lineTo(cxs, topY); ctx.lineTo(cxs + W * 0.006, topY + H * 0.04); ctx.closePath(); ctx.fill();
    const blinkA = 0.4 + 0.6 * Math.abs(Math.sin(now / 800));
    ctx.fillStyle = `rgba(255,60,60,${blinkA.toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.08), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(120,200,255,${(0.88 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, currY + setbacks[setbacks.length - 1].h * 0.5, Math.max(1, s * 0.06), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_singularity") {
    // ── L'AXE CIVIQUE — monolithe cristallin, anneau flottant ─────────
    const nSt = 3, stH = H * 0.1;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.2 + (i / nSt) * 0.8), sh = stH / nSt;
      ctx.fillStyle = `rgba(200,230,255,${(0.7 + (i / nSt) * 0.3).toFixed(2)})`;
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, monoW = W * 0.3, monoH = H * 0.54;
    const mGrad = ctx.createLinearGradient(cxs - monoW / 2, 0, cxs + monoW / 2, 0);
    mGrad.addColorStop(0, "rgba(180,220,255,0.95)"); mGrad.addColorStop(0.35, "rgba(240,250,255,0.98)");
    mGrad.addColorStop(0.65, "rgba(200,235,255,0.92)"); mGrad.addColorStop(1, "rgba(160,200,240,0.88)");
    ctx.fillStyle = mGrad; ctx.fillRect(cxs - monoW / 2, podY - monoH, monoW, monoH);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(cxs - monoW * 0.42, podY - monoH, monoW * 0.08, monoH);
    ctx.fillStyle = "rgba(140,190,240,0.7)";
    ctx.beginPath(); ctx.moveTo(cxs - monoW / 2, podY - monoH); ctx.lineTo(cxs - monoW / 2 - W * 0.06, podY - monoH * 0.7);
    ctx.lineTo(cxs - monoW / 2 - W * 0.06, podY); ctx.lineTo(cxs - monoW / 2, podY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,0.5)";
    ctx.beginPath(); ctx.moveTo(cxs + monoW / 2, podY - monoH); ctx.lineTo(cxs + monoW / 2 + W * 0.06, podY - monoH * 0.7);
    ctx.lineTo(cxs + monoW / 2 + W * 0.06, podY); ctx.lineTo(cxs + monoW / 2, podY); ctx.closePath(); ctx.fill();
    const lineGlow = 0.3 + 0.5 * Math.abs(Math.sin(now / 600 + idx));
    ctx.strokeStyle = `rgba(100,200,255,${lineGlow.toFixed(2)})`; ctx.lineWidth = Math.max(0.5, s * 0.015);
    for (let li = 1; li < 6; li++) {
      const ly = podY - monoH * (li / 6);
      ctx.beginPath(); ctx.moveTo(cxs - monoW * 0.38, ly); ctx.lineTo(cxs + monoW * 0.38, ly); ctx.stroke();
    }
    const ringY = podY - monoH - H * 0.12, ringRx = W * 0.36, ringRy = W * 0.12;
    const ringG = 0.4 + 0.4 * Math.abs(Math.sin(now / 500));
    ctx.strokeStyle = `rgba(80,220,255,${(0.8 * ringG).toFixed(2)})`; ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath(); ctx.ellipse(cxs, ringY, ringRx, ringRy, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(200,240,255,${(0.55 * ringG).toFixed(2)})`; ctx.lineWidth = Math.max(0.5, s * 0.015);
    ctx.beginPath(); ctx.ellipse(cxs, ringY, ringRx * 0.8, ringRy * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    const bGrad = ctx.createLinearGradient(cxs, ringY, cxs, topY);
    bGrad.addColorStop(0, `rgba(80,220,255,${(0.7 * glow).toFixed(2)})`); bGrad.addColorStop(1, "rgba(80,220,255,0)");
    ctx.fillStyle = bGrad;
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.024, ringY); ctx.lineTo(cxs + W * 0.024, ringY);
    ctx.lineTo(cxs + W * 0.004, topY); ctx.lineTo(cxs - W * 0.004, topY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(220,245,255,0.95)";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.06, topY + H * 0.06); ctx.lineTo(cxs, topY);
    ctx.lineTo(cxs + W * 0.06, topY + H * 0.06); ctx.lineTo(cxs + W * 0.04, topY + H * 0.1); ctx.lineTo(cxs - W * 0.04, topY + H * 0.1); ctx.closePath(); ctx.fill();
    const prism = 0.6 + 0.4 * Math.sin(now / 300 + idx);
    ctx.fillStyle = `rgba(80,230,255,${(prism * 0.9).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.18), 0, Math.PI * 2); ctx.fill();
  }

  // ── Ornements de palier : chaque rang ajoute sa parure ────────────────────
  if (tier >= 2) {
    // Rang II+ : cercle de torches autour de l'esplanade.
    const nT = 4 + tier;
    for (let ti = 0; ti < nT; ti += 1) {
      const a = (ti / nT) * Math.PI * 2 + 0.4;
      const tx = cxs + Math.cos(a) * plazaRx * 0.82;
      const ty = baseY + Math.sin(a) * plazaRy * 0.82;
      ctx.strokeStyle = "#4a3a22"; ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - s * 0.42); ctx.stroke();
      const fl = 0.55 + 0.45 * Math.abs(Math.sin(now / 180 + ti * 1.9));
      ctx.fillStyle = `rgba(255,170,50,${(0.55 + fl * 0.45).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(tx, ty - s * 0.46, Math.max(1.5, s * 0.07) * (0.8 + fl * 0.3), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (tier >= 3) {
    // Rang III+ : stèles satellites encadrant le monument.
    for (const side of [-1, 1]) {
      const ox = cxs + side * W * 0.72;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.ellipse(ox + s * 0.05, baseY + s * 0.03, s * 0.22, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#b9a878";
      ctx.beginPath();
      ctx.moveTo(ox - s * 0.1, baseY); ctx.lineTo(ox - s * 0.035, baseY - H * 0.22);
      ctx.lineTo(ox + s * 0.035, baseY - H * 0.22); ctx.lineTo(ox + s * 0.1, baseY);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,240,180,0.3)";
      ctx.fillRect(ox - s * 0.08, baseY - H * 0.2, s * 0.04, H * 0.19);
      ctx.fillStyle = `rgba(255,235,140,${(0.6 * glow).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox, baseY - H * 0.24, Math.max(1.5, s * 0.05), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (tier >= 4) {
    // Rang IV+ : particules dorées en ascension le long du monument.
    for (let pi = 0; pi < 7; pi += 1) {
      const ph = ((now / 2400) + pi / 7) % 1;
      const px = cxs + Math.sin(pi * 2.4 + now / 900) * W * 0.3;
      const py = baseY - ph * H * 1.05;
      ctx.fillStyle = `rgba(255,226,120,${((1 - ph) * 0.65).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(px, py, Math.max(1, s * 0.035) * (1 - ph * 0.5), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (tier >= 5) {
    // Rang V : couronne lumineuse en orbite au sommet.
    const ringY = topY - H * 0.05;
    const spin = now / 1100;
    ctx.strokeStyle = `rgba(255,235,150,${(0.5 + 0.3 * Math.sin(now / 500)).toFixed(2)})`;
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath(); ctx.ellipse(cxs, ringY, W * 0.5, W * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
    for (let oi = 0; oi < 6; oi += 1) {
      const oa = spin + oi * Math.PI / 3;
      ctx.fillStyle = `rgba(255,245,190,${(0.55 + 0.45 * Math.sin(oa * 2)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cxs + Math.cos(oa) * W * 0.5, ringY + Math.sin(oa) * W * 0.14, Math.max(1.5, s * 0.055), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Faisceau de lumière nocturne : les merveilles dominent la ville la nuit.
  const nf = CM.nightF || 0;
  if (nf > 0.25) {
    const beamA = (nf - 0.25) * 0.5 * glow;
    const bg = ctx.createLinearGradient(cxs, baseY, cxs, topY - H * 0.6);
    bg.addColorStop(0, `rgba(255,235,150,${(beamA * 0.55).toFixed(3)})`);
    bg.addColorStop(0.6, `rgba(255,235,160,${(beamA * 0.25).toFixed(3)})`);
    bg.addColorStop(1, "rgba(255,235,170,0)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(cxs - W * 0.2, baseY);
    ctx.lineTo(cxs - W * 0.42, topY - H * 0.6);
    ctx.lineTo(cxs + W * 0.42, topY - H * 0.6);
    ctx.lineTo(cxs + W * 0.2, baseY);
    ctx.closePath(); ctx.fill();
  }

  // Bannière de dynastie
  ctx.strokeStyle = "#3a2a12"; ctx.lineWidth = Math.max(1.5, s * 0.048);
  ctx.beginPath(); ctx.moveTo(cxs, topY); ctx.lineTo(cxs, topY - H * 0.13); ctx.stroke();
  ctx.fillStyle = tint;
  ctx.beginPath(); ctx.moveTo(cxs, topY - H * 0.13); ctx.lineTo(cxs + W * 0.36, topY - H * 0.075); ctx.lineTo(cxs, topY - H * 0.02); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,240,178,0.52)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
  ctx.beginPath(); ctx.moveTo(cxs, topY - H * 0.13); ctx.lineTo(cxs + W * 0.36, topY - H * 0.075); ctx.lineTo(cxs, topY - H * 0.02); ctx.stroke();

  ctx.globalAlpha = 1;
}

export { drawCentralFire, drawMinimap, drawTile, drawWonder };
