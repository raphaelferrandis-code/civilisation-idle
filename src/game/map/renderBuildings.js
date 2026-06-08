/* eslint-disable */
import { state } from '../core/state.js';
import {
  CM,
  CM_TINTS,
  cmHash,
  cmWonderSlot
} from './layout.js';
import { cityMapTileScreen } from './legacyRuntime.js';
import { drawEngineSprite, drawHouseShape, drawPublicShape } from './buildingShapes.js';
import { baseColor, cmLitColor } from './renderWorld.js';

/* ---- legacy citymap rendering\buildings.js ---- */


/* ============================================================================
 * citymap-render-buildings.js - Rendu des tuiles, batiments, districts et merveilles.
 *   drawDistrict, drawTile et helpers de forme (drawHouseShape, drawPublicShape,
 *   drawEngineSprite, drawTinyCamp). Depend de CM, citymap-camera et citymap-draw-utils.
 * ============================================================================ */

// Constantes module — allouées une fois, jamais à chaque frame
const CM_DISTRICT_PALETTE = {
  dense:      ["#5c4521", "#2f2110"],
  market:     ["#8a6622", "#e8c96a"],
  monument:   ["#c9a84c", "#fff1bd"],
  archive:    ["#6a5a34", "#e8dcae"],
  temple:     ["#a58a3f", "#f0d98d"],
  keep:       ["#77715d", "#d8cfb0"],
  forum:      ["#9f7b2a", "#f0d98d"],
  palace:     ["#b19042", "#fff1bd"],
  tower:      ["#60594c", "#e8dcae"],
  station:    ["#5e5746", "#e8dcae"],
  spire:      ["#625a49", "#f0d98d"],
  observatory:["#534a34", "#e8dcae"],
  arcology:   ["#5e5746", "#e8dcae"],
  grid:       ["#544e3e", "#e8dcae"]
};
const CM_DISTRICT_PALETTE_DEFAULT = ["#5c4521", "#2f2110"];
const CM_FREESTANDING_KINDS = new Set(["tower", "spire", "arcology", "station", "grid", "observatory"]);

function drawDistrict(d, now, timeWear) {
  const span = d.size;
  const box = cityMapTileScreen(d.gx, d.gy, span);
  if (box.x < -box.w || box.y < -box.h || box.x > CM.cw + box.w || box.y > CM.ch + box.h) return;
  const ctx = CM.ctx;
  const pad = box.s * 0.12;
  const born = CM.born[d.key] || now;
  const prog = Math.max(0, Math.min(1, (now - born) / 650));
  const e = prog * prog * (3 - 2 * prog);
  const inset = (1 - e) * Math.min(box.w, box.h) * 0.35;
  const x = box.x + inset, y = box.y + inset, w = box.w - inset * 2, h = box.h - inset * 2;
  if (w <= 1 || h <= 1) return;
  const palette = CM_DISTRICT_PALETTE[d.kind] || CM_DISTRICT_PALETTE_DEFAULT;

  ctx.globalAlpha = e;
  ctx.fillStyle = "rgba(8,5,2,0.28)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 0.76, w * 0.43, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  const bx = x + pad, by = y + pad, bw = w - pad * 2, bh = h - pad * 2;
  const freestanding = CM_FREESTANDING_KINDS.has(d.kind);
  if (!freestanding) {
    // Masse batie avec ombrage lateral + bandeau de toit (plus de cadre carre dur).
    ctx.fillStyle = palette[0];
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = "rgba(255,235,190,0.07)";
    ctx.fillRect(bx, by, bw * 0.24, bh);
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.fillRect(bx + bw * 0.76, by, bw * 0.24, bh);
    ctx.fillStyle = "rgba(18,11,4,0.55)";
    ctx.fillRect(bx, by, bw, bh * 0.13);
  }

  if (d.kind === "spire" || d.kind === "tower" || d.kind === "arcology") {
    const towers = d.kind === "arcology" ? 5 : d.kind === "spire" ? 3 : 4;
    for (let twr = 0; twr < towers; twr += 1) {
      const ratio = towers === 1 ? 0.5 : twr / (towers - 1);
      const tw = bw * (d.kind === "arcology" ? 0.18 : 0.16);
      const th = bh * (0.46 + ((twr * 37) % 5) * 0.08 + (d.kind === "spire" ? 0.2 : 0));
      const tx = bx + bw * (0.18 + ratio * 0.64) - tw / 2;
      const ty = by + bh * 0.88 - th;
      ctx.fillStyle = palette[0];
      ctx.fillRect(tx, ty, tw, th);
      ctx.strokeStyle = "rgba(215,243,255,0.48)";
      ctx.lineWidth = Math.max(1, box.s * 0.035);
      ctx.strokeRect(tx, ty, tw, th);
      ctx.fillStyle = palette[1];
      for (let row = 0; row < 5; row += 1) {
        const wy = ty + th * (0.18 + row * 0.14);
        if (wy > ty + th * 0.84) continue;
        ctx.fillRect(tx + tw * 0.28, wy, tw * 0.16, Math.max(1, th * 0.045));
        ctx.fillRect(tx + tw * 0.58, wy, tw * 0.16, Math.max(1, th * 0.045));
      }
    }
    ctx.fillStyle = "rgba(20,12,5,0.32)";
    ctx.fillRect(bx + bw * 0.18, by + bh * 0.78, bw * 0.64, bh * 0.12);
    ctx.fillStyle = palette[1];
    if (d.kind === "spire") {
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.42, by + bh * 0.2);
      ctx.lineTo(bx + bw * 0.5, by - bh * 0.06);
      ctx.lineTo(bx + bw * 0.58, by + bh * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  } else if (d.kind === "station" || d.kind === "grid") {
    ctx.fillStyle = palette[0];
    ctx.beginPath();
    ctx.moveTo(bx + bw * 0.16, by + bh * 0.32);
    ctx.lineTo(bx + bw * 0.84, by + bh * 0.22);
    ctx.lineTo(bx + bw * 0.92, by + bh * 0.7);
    ctx.lineTo(bx + bw * 0.28, by + bh * 0.88);
    ctx.lineTo(bx + bw * 0.1, by + bh * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = palette[1];
    ctx.lineWidth = Math.max(1, box.s * 0.05);
    for (let i = 1; i < 4; i += 1) {
      const lx = bx + bw * i / 4;
      const ly = by + bh * i / 4;
      ctx.beginPath(); ctx.moveTo(lx, by + bh * 0.12); ctx.lineTo(lx, by + bh * 0.88); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + bw * 0.12, ly); ctx.lineTo(bx + bw * 0.88, ly); ctx.stroke();
    }
  } else if (d.kind === "dense" || d.kind === "market" || d.kind === "forum") {
    ctx.fillStyle = "rgba(20,12,5,0.32)";
    ctx.fillRect(bx + bw * 0.18, by + bh * 0.18, bw * 0.64, bh * 0.64);
    ctx.fillStyle = "rgba(255,232,180,0.24)";
    const cols = Math.max(3, Math.floor(span * 2.2));
    for (let i = 1; i < cols; i += 1) {
      const lx = bx + bw * i / cols;
      ctx.fillRect(lx, by + bh * 0.08, Math.max(1, box.s * 0.045), bh * 0.84);
    }
    if (d.kind === "market" || d.kind === "forum") {
      ctx.fillStyle = "rgba(232,201,106,0.55)";
      ctx.fillRect(bx + bw * 0.28, by + bh * 0.36, bw * 0.44, bh * 0.28);
    }
  } else {
    if (freestanding) {
      ctx.fillStyle = palette[0];
      ctx.beginPath();
      ctx.ellipse(bx + bw * 0.5, by + bh * 0.52, bw * 0.36, bh * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(18,10,4,0.28)";
      ctx.fillRect(bx + bw * 0.22, by + bh * 0.22, bw * 0.56, bh * 0.56);
    }
    ctx.fillStyle = palette[1];
    if (d.kind === "archive" || d.kind === "observatory") {
      ctx.fillRect(bx + bw * 0.18, by + bh * 0.2, bw * 0.64, bh * 0.16);
      ctx.fillRect(bx + bw * 0.18, by + bh * 0.64, bw * 0.64, bh * 0.16);
      for (let ci = 0; ci < 4; ci += 1) ctx.fillRect(bx + bw * (0.24 + ci * 0.14), by + bh * 0.28, bw * 0.045, bh * 0.34);
      if (d.kind === "observatory") {
        ctx.beginPath();
        ctx.arc(bx + bw * 0.5, by + bh * 0.2, bw * 0.18, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.max(2, Math.min(w, h) * 0.18), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,241,189,0.45)";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.max(4, Math.min(w, h) * 0.32), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(bx + bw * 0.45, by + bh * 0.08, bw * 0.1, bh * 0.84);
    }
  }

  // Banniere aux couleurs de la dynastie au sommet du grand batiment.
  const tint = CM_TINTS[CM.dynastyIdx % CM_TINTS.length];
  ctx.strokeStyle = "#2a1c0c"; ctx.lineWidth = Math.max(1, box.s * 0.04);
  ctx.beginPath(); ctx.moveTo(x + w * 0.5, by); ctx.lineTo(x + w * 0.5, by - box.s * 0.55); ctx.stroke();
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, by - box.s * 0.55);
  ctx.lineTo(x + w * 0.5 + box.s * 0.42, by - box.s * 0.46);
  ctx.lineTo(x + w * 0.5, by - box.s * 0.37);
  ctx.closePath(); ctx.fill();

  if (timeWear > 0.65) {
    ctx.fillStyle = `rgba(20,14,8,${Math.min(0.36, (timeWear - 0.65) * 0.9)})`;
    ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
  }
  ctx.globalAlpha = 1;
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
    const sh = Math.max(1.2, 2.4 * zc);                // micro-ombre portee bas-droite
    ctx.fillStyle = "rgba(0,0,0,0.28)";
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
  const cx = ((L.cx + 0.5) * CM.TILE - CM.cam.x) * z + CM.cw / 2;
  const cy = ((L.cy + 0.5) * CM.TILE - CM.cam.y) * z + CM.ch / 2;
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
    // ── LA GRANDE HALLE — basilique romaine, panthéon, oculus ─────────
    const nSt = 4, stH = H * 0.12;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.14 + (i / nSt) * 0.86), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#c8c0a0" : "#d8d0b0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, bodyH = H * 0.46;
    ctx.fillStyle = "#d0c898"; ctx.fillRect(cxs - W * 0.46, podY - bodyH, W * 0.92, bodyH);
    ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(cxs + W * 0.28, podY - bodyH, W * 0.18, bodyH);
    const nC = 12;
    for (let ci = 0; ci < nC; ci++) {
      const cx2 = cxs - W * 0.44 + ci * (W * 0.88 / (nC - 1));
      ctx.fillStyle = "#e8e0c0"; ctx.fillRect(cx2 - s * 0.038, podY - bodyH, s * 0.076, bodyH);
      ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.fillRect(cx2 + s * 0.015, podY - bodyH, s * 0.02, bodyH);
      ctx.fillStyle = "#d8d0a8"; ctx.fillRect(cx2 - s * 0.08, podY - s * 0.06, s * 0.16, s * 0.06);
      ctx.fillRect(cx2 - s * 0.08, podY - bodyH, s * 0.16, s * 0.06);
    }
    ctx.fillStyle = "#b8b090"; ctx.fillRect(cxs - W * 0.47, podY - bodyH - H * 0.035, W * 0.94, H * 0.035);
    const friezeY = podY - bodyH - H * 0.07;
    ctx.fillStyle = "#c8c0a0"; ctx.fillRect(cxs - W * 0.47, friezeY, W * 0.94, H * 0.035);
    const frontH = H * 0.14;
    ctx.fillStyle = "#888060";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.48, friezeY); ctx.lineTo(cxs, friezeY - frontH); ctx.lineTo(cxs + W * 0.48, friezeY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b0a878";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.44, friezeY - H * 0.008); ctx.lineTo(cxs, friezeY - frontH + H * 0.018); ctx.lineTo(cxs + W * 0.44, friezeY - H * 0.008); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(20,16,8,0.55)"; ctx.beginPath(); ctx.arc(cxs, friezeY - frontH * 0.42, W * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#d0c888"; ctx.lineWidth = Math.max(1, s * 0.028);
    ctx.beginPath(); ctx.arc(cxs, friezeY - frontH * 0.42, W * 0.07, 0, Math.PI * 2); ctx.stroke();
    for (const ax of [-0.48, 0, 0.48]) {
      const ay2 = ax === 0 ? friezeY - frontH : friezeY;
      ctx.fillStyle = "#d4c870";
      ctx.beginPath(); ctx.moveTo(cxs + W * ax - W * 0.034, ay2); ctx.lineTo(cxs + W * ax, ay2 - H * 0.062); ctx.lineTo(cxs + W * ax + W * 0.034, ay2); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "rgba(15,12,5,0.65)";
    for (let wi2 = 0; wi2 < 6; wi2++) {
      const wx2 = cxs - W * 0.38 + wi2 * (W * 0.76 / 5);
      ctx.beginPath(); ctx.arc(wx2, podY - bodyH * 0.5, W * 0.044, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,245,200,${(0.65 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, friezeY - frontH, Math.max(2, s * 0.13), 0, Math.PI * 2); ctx.fill();

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
