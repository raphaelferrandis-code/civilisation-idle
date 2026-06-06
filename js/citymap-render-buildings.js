"use strict";

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

function drawTinyCamp(x, y, w, h, pad, seed, variant, now) {
  const ctx = CM.ctx;
  const t = now || 0;
  if (variant === "firepit") {
    // Grand feu central — halo, bûches, braises, 3 flammes animées
    const cx = x + w * 0.5, cy = y + h * 0.5;
    // Halo rayonnant (grand, en premier pour rester derrière)
    const halo = 0.20 + 0.10 * Math.abs(Math.sin(t / 520));
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.46);
    rg.addColorStop(0, `rgba(255,160,30,${halo.toFixed(2)})`);
    rg.addColorStop(1, "rgba(255,80,5,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2); ctx.fill();
    // Cercle de pierres
    ctx.fillStyle = "#5a4830";
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.22, cy + Math.sin(a) * h * 0.18, w * 0.044, 0, Math.PI * 2); ctx.fill();
    }
    // Bûches en croix
    ctx.lineWidth = Math.max(2, w * 0.06); ctx.lineCap = "round";
    ctx.strokeStyle = "#6a3c0c";
    ctx.beginPath(); ctx.moveTo(cx - w*0.18, cy + h*0.06); ctx.lineTo(cx + w*0.18, cy - h*0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w*0.18, cy + h*0.06); ctx.lineTo(cx - w*0.18, cy - h*0.06); ctx.stroke();
    ctx.lineCap = "square";
    // Braises
    ctx.fillStyle = "rgba(200,60,5,0.8)";
    ctx.beginPath(); ctx.ellipse(cx, cy + h*0.02, w*0.13, h*0.09, 0, 0, Math.PI*2); ctx.fill();
    // 3 flammes animées
    const f1 = 0.5+0.5*Math.sin(t/170), f2 = 0.5+0.5*Math.sin(t/140+1.3), f3 = 0.5+0.5*Math.sin(t/200+2.7);
    ctx.fillStyle = `rgba(255,85,8,${(0.78+f1*0.22).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(cx-w*0.1,cy+h*0.04); ctx.quadraticCurveTo(cx-w*0.16,cy-h*(0.18+f1*0.08),cx,cy-h*(0.26+f1*0.07)); ctx.quadraticCurveTo(cx+w*0.16,cy-h*(0.18+f2*0.06),cx+w*0.1,cy+h*0.04); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,195,20,${(0.82+f2*0.18).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(cx-w*0.07,cy+h*0.04); ctx.quadraticCurveTo(cx-w*0.04,cy-h*(0.22+f2*0.1),cx,cy-h*(0.32+f2*0.08)); ctx.quadraticCurveTo(cx+w*0.04,cy-h*(0.22+f3*0.07),cx+w*0.07,cy+h*0.04); ctx.closePath(); ctx.fill();
    // Étincelle centrale
    ctx.fillStyle = `rgba(255,250,200,${(0.7+f3*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cx, cy - h*(0.3+f2*0.07), Math.max(1, w*0.04), 0, Math.PI*2); ctx.fill();
  } else {
    // TENTE — vue de dessus : polygone avec coutures
    ctx.fillStyle = "#c89a3a";
    ctx.beginPath();
    ctx.moveTo(x+w*0.5, y+h*0.18); ctx.lineTo(x+w*0.82, y+h*0.66);
    ctx.lineTo(x+w*0.5, y+h*0.74); ctx.lineTo(x+w*0.18, y+h*0.66);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(80,48,10,0.28)";
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.82,y+h*0.66); ctx.lineTo(x+w*0.5,y+h*0.46); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(90,55,10,0.45)"; ctx.lineWidth = Math.max(0.5,w*0.022);
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.5,y+h*0.74); ctx.stroke();
    ctx.fillStyle = "rgba(30,16,4,0.6)";
    ctx.beginPath(); ctx.moveTo(x+w*0.43,y+h*0.66); ctx.lineTo(x+w*0.5,y+h*0.58); ctx.lineTo(x+w*0.57,y+h*0.66); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#7a4e10"; ctx.fillRect(x+w*0.483,y+h*0.14,w*0.034,h*0.1);
  }
}

function drawHouseShape(x, y, w, h, pad, tier, seed, variant, now) {
  const ctx = CM.ctx;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  const lit = cmLitColor(band);
  const s = (seed || 0) % 100;
  const t = now || 0;

  if (variant === "tent" || variant === "firepit") {
    drawTinyCamp(x, y, w, h, pad, seed, variant, now); return;
  }

  if (variant === "hut") {
    // ── CABANE RONDE — vue de dessus, toit de chaume conique ──────────
    ctx.fillStyle = "#9a6e2a";
    ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.56,w*0.36,h*0.32,0,0,Math.PI*2); ctx.fill();
    // Anneaux de chaume (du bord vers le centre = de clair à foncé)
    const thatch = ["#8a5c18","#7a4e12","#6a400c","#522e08"];
    for (let ri=0; ri<4; ri++) {
      ctx.fillStyle = thatch[ri];
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.54,w*(0.32-ri*0.07),h*(0.29-ri*0.06),0,0,Math.PI*2); ctx.fill();
    }
    // Pointe centrale
    ctx.fillStyle = "#3a2008"; ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.055,0,Math.PI*2); ctx.fill();
    // Entrée
    ctx.fillStyle = "rgba(25,12,3,0.65)"; ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.76,w*0.065,Math.PI,0); ctx.fill();
    return;
  }

  if (variant === "longhouse") {
    // ── LONGUE MAISON — rectangle allongé, toit en bâtière ───────────
    ctx.fillStyle = "#8a6020";
    ctx.fillRect(x+w*0.1,y+h*0.36,w*0.8,h*0.46);
    // Arête faîtière
    ctx.fillStyle = "#5a3a0e"; ctx.fillRect(x+w*0.1,y+h*0.36,w*0.8,h*0.07);
    // Stries de chaume transversales
    ctx.strokeStyle = "rgba(40,22,6,0.32)"; ctx.lineWidth = Math.max(0.5,w*0.018);
    for (let i=1; i<6; i++) { ctx.beginPath(); ctx.moveTo(x+w*(0.12+i*0.13),y+h*0.36); ctx.lineTo(x+w*(0.12+i*0.13),y+h*0.82); ctx.stroke(); }
    // Pignons triangulaires (bout gauche + droit)
    ctx.fillStyle = "#7a5016";
    ctx.beginPath(); ctx.moveTo(x+w*0.1,y+h*0.36); ctx.lineTo(x+w*0.18,y+h*0.22); ctx.lineTo(x+w*0.26,y+h*0.36); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+w*0.74,y+h*0.36); ctx.lineTo(x+w*0.82,y+h*0.22); ctx.lineTo(x+w*0.9,y+h*0.36); ctx.closePath(); ctx.fill();
    // Porte
    ctx.fillStyle = "rgba(28,14,4,0.7)"; ctx.fillRect(x+w*0.45,y+h*0.62,w*0.1,h*0.2);
    return;
  }

  if (variant === "townhouse") {
    // ── MAISON À COLOMBAGES — torchis + pans de bois ─────────────────
    ctx.fillStyle = "#c8a060"; ctx.fillRect(x+w*0.17,y+h*0.4,w*0.66,h*0.44);
    // Colombages (croisillons)
    ctx.strokeStyle = "#5a3610"; ctx.lineWidth = Math.max(1,w*0.032);
    ctx.beginPath(); ctx.moveTo(x+w*0.17,y+h*0.4); ctx.lineTo(x+w*0.5,y+h*0.52); ctx.lineTo(x+w*0.83,y+h*0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+w*0.17,y+h*0.58); ctx.lineTo(x+w*0.83,y+h*0.58); ctx.stroke();
    // Toit à deux versants (face avant visible)
    ctx.fillStyle = "#8c3c1a";
    ctx.beginPath(); ctx.moveTo(x+w*0.13,y+h*0.43); ctx.lineTo(x+w*0.5,y+h*0.14); ctx.lineTo(x+w*0.87,y+h*0.43); ctx.lineTo(x+w*0.83,y+h*0.4); ctx.lineTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.17,y+h*0.4); ctx.closePath(); ctx.fill();
    // Faîtage
    ctx.fillStyle = "#6a2a0e"; ctx.fillRect(x+w*0.47,y+h*0.13,w*0.06,h*0.05);
    // Fenêtres
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.22,y+h*0.5,w*0.12,h*0.08); ctx.fillRect(x+w*0.66,y+h*0.5,w*0.12,h*0.08);
    // Porte
    ctx.fillStyle = "rgba(24,12,4,0.7)"; ctx.fillRect(x+w*0.44,y+h*0.66,w*0.12,h*0.18);
    return;
  }

  if (variant === "courtyard") {
    // ── MAISON À COUR — U visible depuis le ciel ─────────────────────
    ctx.fillStyle = "#c0a058"; ctx.fillRect(x+w*0.12,y+h*0.28,w*0.76,h*0.58);
    // Cour intérieure
    ctx.fillStyle = "#c4a462"; ctx.fillRect(x+w*0.3,y+h*0.44,w*0.4,h*0.3);
    // Toit des ailes (ardoise rouge)
    ctx.fillStyle = "#8c3820";
    ctx.fillRect(x+w*0.12,y+h*0.28,w*0.76,h*0.09);
    ctx.fillRect(x+w*0.12,y+h*0.28,w*0.11,h*0.58); ctx.fillRect(x+w*0.77,y+h*0.28,w*0.11,h*0.58);
    // Tuiles (lignes)
    ctx.strokeStyle = "rgba(55,18,6,0.3)"; ctx.lineWidth = Math.max(0.5,w*0.016);
    for (let i=1; i<4; i++) ctx.strokeRect(x+w*(0.14+i*0.05),y+h*0.3,w*(0.72-i*0.1),h*(0.54-i*0.05));
    // Fenêtres
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.18,y+h*0.46,w*0.08,h*0.07); ctx.fillRect(x+w*0.74,y+h*0.46,w*0.08,h*0.07);
    return;
  }

  if (variant === "stonehouse") {
    // ── MAISON DE PIERRE — murs en moellon, toit ardoise ─────────────
    ctx.fillStyle = "#9a8c78"; ctx.fillRect(x+w*0.15,y+h*0.38,w*0.7,h*0.46);
    // Joints de maçonnerie
    ctx.strokeStyle = "rgba(55,45,30,0.38)"; ctx.lineWidth = Math.max(0.5,w*0.018);
    for (let r=1; r<3; r++) { ctx.beginPath(); ctx.moveTo(x+w*0.15,y+h*(0.38+r*0.15)); ctx.lineTo(x+w*0.85,y+h*(0.38+r*0.15)); ctx.stroke(); }
    for (let c=1; c<4; c++) { ctx.beginPath(); ctx.moveTo(x+w*(0.15+c*0.17),y+h*0.38); ctx.lineTo(x+w*(0.15+c*0.17),y+h*0.84); ctx.stroke(); }
    // Toit ardoise (2 versants)
    ctx.fillStyle = "#58534a";
    ctx.beginPath(); ctx.moveTo(x+w*0.11,y+h*0.42); ctx.lineTo(x+w*0.5,y+h*0.14); ctx.lineTo(x+w*0.89,y+h*0.42); ctx.lineTo(x+w*0.84,y+h*0.38); ctx.lineTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.16,y+h*0.38); ctx.closePath(); ctx.fill();
    // Cheminée
    ctx.fillStyle = "#78685a"; ctx.fillRect(x+w*0.62,y+h*0.18,w*0.09,h*0.12);
    ctx.fillStyle = "rgba(60,50,38,0.65)"; ctx.fillRect(x+w*0.61,y+h*0.16,w*0.11,h*0.04);
    // Porte en arc brisé
    ctx.fillStyle = "rgba(18,10,4,0.72)";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.68,w*0.065,Math.PI,0); ctx.fill();
    ctx.fillRect(x+w*0.435,y+h*0.68,w*0.13,h*0.16);
    // Fenêtres à croisée
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.22,y+h*0.52,w*0.11,h*0.09); ctx.fillRect(x+w*0.67,y+h*0.52,w*0.11,h*0.09);
    ctx.strokeStyle = "rgba(80,60,30,0.5)"; ctx.lineWidth = Math.max(0.5,w*0.016);
    for (const wx of [0.22, 0.67]) { ctx.beginPath(); ctx.moveTo(x+w*(wx+0.055),y+h*0.52); ctx.lineTo(x+w*(wx+0.055),y+h*0.61); ctx.stroke(); }
    return;
  }

  if (variant === "manor") {
    // ── MANOIR — corps principal + aile + tour d'angle ───────────────
    ctx.fillStyle = "#8a7860"; ctx.fillRect(x+w*0.08,y+h*0.28,w*0.84,h*0.6);
    // Toit central ardoise foncée
    ctx.fillStyle = "#484440";
    ctx.beginPath(); ctx.moveTo(x+w*0.08,y+h*0.3); ctx.lineTo(x+w*0.5,y+h*0.1); ctx.lineTo(x+w*0.92,y+h*0.3); ctx.lineTo(x+w*0.88,y+h*0.26); ctx.lineTo(x+w*0.5,y+h*0.14); ctx.lineTo(x+w*0.12,y+h*0.26); ctx.closePath(); ctx.fill();
    // Tour d'angle (coin supérieur gauche)
    ctx.fillStyle = "#7a6858"; ctx.fillRect(x+w*0.08,y+h*0.2,w*0.22,h*0.28);
    ctx.fillStyle = "#404038"; ctx.fillRect(x+w*0.06,y+h*0.16,w*0.26,h*0.07);
    ctx.fillRect(x+w*0.1,y+h*0.1,w*0.06,h*0.09); ctx.fillRect(x+w*0.22,y+h*0.1,w*0.06,h*0.09);
    // Rangée de fenêtres
    ctx.fillStyle = lit;
    for (let i=0; i<4; i++) ctx.fillRect(x+w*(0.24+i*0.16),y+h*0.46,w*0.1,h*0.08);
    // Porte d'entrée
    ctx.fillStyle = "#3a2610"; ctx.fillRect(x+w*0.44,y+h*0.68,w*0.12,h*0.2);
    ctx.fillStyle = "rgba(210,170,80,0.5)"; ctx.fillRect(x+w*0.47,y+h*0.73,w*0.02,h*0.04);
    return;
  }

  if (variant === "block" || variant === "tenement") {
    // ── IMMEUBLE — brique, toit plat, grille de fenêtres ─────────────
    const tall = variant === "tenement";
    ctx.fillStyle = tall ? "#7a5028" : (band>=5 ? "#686448" : "#7a5820");
    ctx.fillRect(x+pad,y+h*(tall?0.12:0.18),w-pad*2,h*(tall?0.74:0.68));
    // Toit plat + rebord
    ctx.fillStyle = tall ? "#523210" : (band>=5 ? "#504830" : "#503810");
    ctx.fillRect(x+pad*0.6,y+h*(tall?0.08:0.14),w-pad*1.2,h*0.06);
    // Cheminées
    ctx.fillStyle = "#3c2a10";
    ctx.fillRect(x+w*0.28,y+h*(tall?0.04:0.09),w*0.07,h*0.07); ctx.fillRect(x+w*0.64,y+h*(tall?0.04:0.09),w*0.07,h*0.07);
    // Grille de fenêtres
    ctx.fillStyle = lit;
    const rows=tall?4:3, cols=3;
    for (let r=0; r<rows; r++) for (let c=0; c<cols; c++)
      if ((c+r+s)%3!==0) ctx.fillRect(x+w*(0.22+c*0.22),y+h*(tall?0.2:0.26)+r*h*0.15,w*0.1,Math.max(1,h*0.08));
    // Porte
    ctx.fillStyle = "rgba(18,10,3,0.7)"; ctx.fillRect(x+w*0.43,y+h*(tall?0.78:0.74),w*0.14,h*0.08);
    // Ombre côté droit
    ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(x+w*0.72,y+h*(tall?0.12:0.18),w*0.12,h*(tall?0.74:0.68));
    return;
  }

  if (variant === "tower") {
    // ── TOUR RÉSIDENTIELLE — moderniste, bandes vitrées ───────────────
    const cBody = band>=6 ? "#585855" : band>=5 ? "#5e5a4e" : "#646058";
    ctx.fillStyle = cBody; ctx.fillRect(x+w*0.24,y+h*0.1,w*0.52,h*0.82);
    // Couronnement
    ctx.fillStyle = band>=6 ? "rgba(100,190,255,0.55)" : "#323028";
    ctx.fillRect(x+w*0.2,y+h*0.04,w*0.6,h*0.08);
    if (band>=6) { ctx.strokeStyle = "rgba(90,190,255,0.75)"; ctx.lineWidth = Math.max(1,w*0.028); ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.04); ctx.lineTo(x+w*0.5,y-h*0.04); ctx.stroke(); }
    // Bandes vitrées horizontales (nuit = éclairées)
    ctx.fillStyle = lit;
    const rows = band>=5 ? 8 : 5;
    for (let r=0; r<rows; r++) ctx.fillRect(x+w*0.28,y+h*(0.16+r*(0.64/rows)),w*0.44,Math.max(1,h*0.038));
    // Reflet / ombre latérale
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x+w*0.64,y+h*0.1,w*0.12,h*0.82);
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(x+w*0.24,y+h*0.1,w*0.1,h*0.82);
    return;
  }

  if (variant === "megablock" || variant === "arcologyhome") {
    // ── MEGABLOCK / ARCO-HOME — haute densité futuriste ───────────────
    const tech = variant === "arcologyhome";
    ctx.fillStyle = tech ? "#485060" : "#525046";
    ctx.fillRect(x+w*0.08,y+h*0.16,w*0.84,h*0.74);
    // Retraits progressifs (setbacks)
    ctx.fillStyle = tech ? "#384050" : "#424038";
    ctx.fillRect(x+w*0.14,y+h*0.08,w*0.72,h*0.1);
    ctx.fillRect(x+w*0.2,y+h*0.02,w*0.6,h*0.08);
    // Grille de fenêtres
    ctx.fillStyle = tech ? `rgba(70,190,255,${(0.45+(CM.nightF||0)*0.45).toFixed(2)})` : lit;
    const rows2=tech?6:5, cols2=tech?5:4;
    for (let r=0; r<rows2; r++) for (let c=0; c<cols2; c++)
      if (tech||(r+c+s)%4!==0) ctx.fillRect(x+w*(0.16+c*(0.68/Math.max(1,cols2-1))),y+h*(0.22+r*0.1),w*0.07,Math.max(1,h*0.04));
    if (tech) {
      ctx.strokeStyle = `rgba(50,175,240,${(0.28+(CM.nightF||0)*0.42).toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.018);
      ctx.beginPath(); ctx.moveTo(x+w*0.12,y+h*0.82); ctx.lineTo(x+w*0.5,y+h*0.1); ctx.lineTo(x+w*0.88,y+h*0.82); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(x+w*0.74,y+h*0.16,w*0.18,h*0.74);
    return;
  }

  // fallback
  ctx.fillStyle = "#9a7426"; ctx.fillRect(x+pad,y+pad,w-pad*2,h-pad*2);
}

function drawPublicShape(type, x, y, w, h, pad, tier, variant, now) {
  const ctx = CM.ctx;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  const library = type === "library";
  const gold = library ? "#e8dcae" : "#e8c96a";
  const lit = cmLitColor(band);
  const body = library ? "#5a4a2e"
    : variant === "palace" ? "#a8893e"
    : variant === "keep" ? "#77715d"
    : band >= 5 ? "#5e5746"
    : "#9f7b2a";
  if (variant === "shrine" || variant === "firepit") {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.52, w * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(30,18,7,0.45)";
    ctx.fillRect(x + w * 0.38, y + h * 0.52, w * 0.24, h * 0.18);
    return;
  }
  if (variant === "keep") {
    ctx.fillStyle = body;
    ctx.fillRect(x + w * 0.2, y + h * 0.22, w * 0.6, h * 0.62);
    ctx.fillStyle = "#4a4639";
    ctx.fillRect(x + w * 0.14, y + h * 0.16, w * 0.18, h * 0.18);
    ctx.fillRect(x + w * 0.68, y + h * 0.16, w * 0.18, h * 0.18);
    return;
  }
  if (variant === "station") {
    // ── STATION CIVIQUE FUTURISTE — quai courbe, rail magnétique, écrans ──
    const t2 = now || 0;
    // Corps aérodynamique (profil en arc)
    ctx.fillStyle = "#303848";
    ctx.beginPath(); ctx.moveTo(x+w*0.08,y+h*0.72); ctx.quadraticCurveTo(x+w*0.5,y+h*0.24,x+w*0.92,y+h*0.72); ctx.lineTo(x+w*0.92,y+h*0.84); ctx.quadraticCurveTo(x+w*0.5,y+h*0.54,x+w*0.08,y+h*0.84); ctx.closePath(); ctx.fill();
    // Verrière vitrée
    ctx.fillStyle = "rgba(80,160,255,0.18)";
    ctx.beginPath(); ctx.moveTo(x+w*0.16,y+h*0.68); ctx.quadraticCurveTo(x+w*0.5,y+h*0.3,x+w*0.84,y+h*0.68); ctx.lineTo(x+w*0.84,y+h*0.74); ctx.quadraticCurveTo(x+w*0.5,y+h*0.42,x+w*0.16,y+h*0.74); ctx.closePath(); ctx.fill();
    // Rail magnétique lumineux
    const rPulse = 0.6+0.3*Math.sin(t2/350);
    ctx.strokeStyle = `rgba(60,200,255,${rPulse.toFixed(2)})`; ctx.lineWidth = Math.max(2,w*0.045); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x+w*0.06,y+h*0.78); ctx.lineTo(x+w*0.94,y+h*0.78); ctx.stroke();
    ctx.lineCap="square";
    // Panneaux d'info animés
    const scA = 0.4+0.25*Math.sin(t2/500);
    ctx.fillStyle = `rgba(40,180,255,${scA.toFixed(2)})`;
    ctx.fillRect(x+w*0.2,y+h*0.32,w*0.16,h*0.1);
    ctx.fillRect(x+w*0.64,y+h*0.32,w*0.16,h*0.1);
    ctx.fillStyle = `rgba(255,200,40,${(scA*0.8).toFixed(2)})`;
    ctx.fillRect(x+w*0.42,y+h*0.3,w*0.16,h*0.12);
    // Pylônes
    ctx.fillStyle = "#5a6070";
    ctx.fillRect(x+w*0.48,y+h*0.1,w*0.04,h*0.2);
    ctx.fillStyle = `rgba(60,200,255,${(0.5+0.4*Math.sin(t2/400)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.1,Math.max(1.5,w*0.05),0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "datavault") {
    // ── COFFRE DE DONNÉES — cylindre serveur, flux de données circulaires ──
    const t2 = now || 0;
    const flowA = (t2/700)%(Math.PI*2);
    // Tour cylindrique
    ctx.fillStyle = "#1e2830";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.35,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(0,220,150,0.45)"; ctx.lineWidth = Math.max(1,w*0.022);
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.35,0,Math.PI*2); ctx.stroke();
    // Anneaux de données animés
    for (let ri = 0; ri < 4; ri++) {
      const alpha = 0.3+0.3*Math.sin(flowA+ri*0.8);
      ctx.strokeStyle = `rgba(0,${200+ri*15},${130+ri*20},${alpha.toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.016);
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*(0.34+ri*0.1),w*(0.26-ri*0.02),h*0.034,0,0,Math.PI*2); ctx.stroke();
    }
    // Particules de données en orbite
    const dotA = 0.7+0.3*Math.abs(Math.sin(flowA));
    ctx.fillStyle = `rgba(0,255,160,${dotA.toFixed(2)})`;
    for (let di = 0; di < 5; di++) {
      const da = flowA + di*Math.PI*2/5;
      ctx.beginPath(); ctx.arc(x+w*(0.5+Math.cos(da)*0.26),y+h*(0.52+Math.sin(da)*0.18),Math.max(1.5,w*0.032),0,Math.PI*2); ctx.fill();
    }
    // Noyau central pulsant
    ctx.fillStyle = `rgba(0,200,140,${(0.5+0.35*Math.sin(flowA*2)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(180,255,230,${(0.7+0.3*Math.sin(flowA*3)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.04,0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "observatory") {
    // ── OBSERVATOIRE FUTURISTE — dôme, antenne scan rotative ──────────────
    const t2 = now || 0;
    const scanA = (t2/2200)%(Math.PI*2);
    // Base hexagonale
    ctx.fillStyle = "#2e3544";
    ctx.beginPath();
    for (let i=0; i<6; i++) { const a=i*Math.PI/3; const px2=x+w*(0.5+Math.cos(a)*0.42),py2=y+h*(0.62+Math.sin(a)*0.3); if(i===0)ctx.moveTo(px2,py2);else ctx.lineTo(px2,py2); }
    ctx.closePath(); ctx.fill();
    // Dôme vitré
    ctx.fillStyle = "rgba(80,110,200,0.28)";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.3,Math.PI,0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(140,180,255,0.65)"; ctx.lineWidth = Math.max(0.5,w*0.022);
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.3,Math.PI,0); ctx.stroke();
    // Nervures du dôme
    for (let ni=1; ni<4; ni++) { const na=Math.PI*(ni/4);
      ctx.strokeStyle = "rgba(100,150,220,0.35)"; ctx.lineWidth = Math.max(0.5,w*0.014);
      ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.52); ctx.lineTo(x+w*(0.5+Math.cos(na)*0.3),y+h*(0.52-Math.sin(na)*0.22)); ctx.stroke();
    }
    // Bras d'antenne rotatif
    const armX = x+w*(0.5+Math.cos(scanA-Math.PI/2)*0.22), armY = y+h*(0.52+Math.sin(scanA-Math.PI/2)*0.16);
    ctx.strokeStyle = "#7088a0"; ctx.lineWidth = Math.max(1,w*0.03); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.52); ctx.lineTo(armX,armY); ctx.stroke();
    ctx.lineCap="square";
    // Capteur parabolique
    ctx.fillStyle = "#a0b8cc";
    ctx.beginPath(); ctx.arc(armX,armY,Math.max(2,w*0.08),0,Math.PI*2); ctx.fill();
    // Faisceau de scan
    ctx.fillStyle = `rgba(100,200,255,${(0.5+0.4*Math.abs(Math.sin(scanA))).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(armX,armY,Math.max(1.5,w*0.05),0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "spire" || variant === "archive") {
    // ── FLÈCHE ADMIN / ARCHIVES — tour élancée cyberpunk ─────────────────
    const t2 = now || 0;
    const isArchive = variant === "archive";
    // Corps principal à setbacks
    const bCol = isArchive ? "#2a3848" : "#3a4050";
    ctx.fillStyle = bCol; ctx.fillRect(x+w*0.36,y+h*0.18,w*0.28,h*0.72);
    ctx.fillStyle = isArchive ? "#242f3c" : "#303848";
    ctx.fillRect(x+w*0.28,y+h*0.32,w*0.44,h*0.56);
    ctx.fillRect(x+w*0.2,y+h*0.5,w*0.6,h*0.38);
    // Ombre latérale
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(x+w*0.64,y+h*0.18,w*0.12,h*0.72);
    // Bandes LED horizontales
    const ledCol = isArchive ? "rgba(255,160,40," : "rgba(60,180,255,";
    for (let li=0; li<5; li++) {
      const lAlpha = 0.4+0.3*Math.sin(t2/400+li*0.7);
      ctx.fillStyle = ledCol+lAlpha.toFixed(2)+")";
      ctx.fillRect(x+w*0.22,y+h*(0.52+li*0.07),w*0.56,Math.max(1,h*0.022));
    }
    // Fenêtres grille
    ctx.fillStyle = lit;
    for (let ri=0; ri<4; ri++) for (let ci=0; ci<2; ci++)
      ctx.fillRect(x+w*(0.3+ci*0.22),y+h*(0.22+ri*0.07),w*0.1,Math.max(1,h*0.042));
    if (isArchive) {
      // Disques de stockage (hologramme)
      ctx.strokeStyle = `rgba(255,180,60,${(0.45+0.3*Math.sin(t2/600)).toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.018);
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.75,w*0.2,h*0.06,0,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.75,w*0.12,h*0.036,0,0,Math.PI*2); ctx.stroke();
    } else {
      // Spire pointue avec clignotant
      ctx.fillStyle = "#c0d0e0";
      ctx.beginPath(); ctx.moveTo(x+w*0.44,y+h*0.18); ctx.lineTo(x+w*0.5,y+h*0.04); ctx.lineTo(x+w*0.56,y+h*0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,80,80,${(0.5+0.5*Math.abs(Math.sin(t2/700))).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.04,Math.max(1.5,w*0.04),0,Math.PI*2); ctx.fill();
    }
    return;
  }
  // Batiment a colonnes (temple / marche / forum / hall / academie / palais)
  ctx.fillStyle = body;
  ctx.fillRect(x + pad, y + h * 0.26, w - pad * 2, h * 0.6);
  ctx.fillStyle = gold;                           // fronton triangulaire
  ctx.beginPath();
  ctx.moveTo(x + pad * 0.7, y + h * 0.26);
  ctx.lineTo(x + w * 0.5, y + h * 0.1);
  ctx.lineTo(x + w - pad * 0.7, y + h * 0.26);
  ctx.closePath();
  ctx.fill();
  const columns = tier >= 5 || variant === "palace" ? 5 : 3;
  ctx.fillStyle = "rgba(20,12,5,0.62)";
  for (let ci = 0; ci < columns; ci += 1) {
    const cx = x + w * (0.22 + ci * (0.56 / Math.max(1, columns - 1)));
    ctx.fillRect(cx - w * 0.025, y + h * 0.36, w * 0.05, h * 0.42);
  }
  if (variant === "palace" || variant === "temple" || variant === "forum" || band >= 4) {
    ctx.fillStyle = library ? "#e8dcae" : "#c0402f"; // banniere
    ctx.fillRect(x + w * 0.46, y + h * 0.28, w * 0.08, h * 0.3);
  }
  if (variant === "palace" || variant === "academy" || tier >= 6) {
    ctx.strokeStyle = gold;
    ctx.lineWidth = Math.max(1, w * 0.04);
    ctx.strokeRect(x + w * 0.16, y + h * 0.22, w * 0.68, h * 0.62);
  }
}

function drawEngineSprite(t, x, y, w, h, now) {
  const ctx = CM.ctx;
  const id = t.buildingId || t.variant;
  const tier = t.tier || 0;
  const night = CM.nightF || 0;
  const litWarm = `rgba(255,204,68,${(0.25 + night * 0.65).toFixed(2)})`;
  const litGold = `rgba(255,220,120,${(0.35 + night * 0.6).toFixed(2)})`;
  const ox = x, oy = y, sw = w, sh = h;
  const px = (rx, ry, rw, rh, col) => { ctx.fillStyle = col; ctx.fillRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  const strokeRect = (rx, ry, rw, rh, col) => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, sw * 0.025); ctx.strokeRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.84, w * 0.42, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (id === "storytellers") {
    // Sol
    px(0.0, 0.58, 1.0, 0.42, "#16100a");

    // === FEU DE CAMP (droite) ===
    const fx = 0.66, fy = 0.66;
    // Pierres du foyer
    ctx.fillStyle = "#3a2e20";
    for (const [da, dr] of [[0,0.09],[ 1.0,0.09],[ 2.1,0.085],[ 3.2,0.09],[ 4.3,0.085],[ 5.4,0.09]]) {
      ctx.beginPath(); ctx.arc(ox + sw*(fx + Math.cos(da)*0.1), oy + sh*(fy + Math.sin(da)*0.065), sw*dr*0.38, 0, Math.PI*2); ctx.fill();
    }
    // Bûches en croix
    ctx.lineWidth = Math.max(1.5, sw * 0.05); ctx.lineCap = "round";
    ctx.strokeStyle = "#6a3c10";
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx-0.14), oy+sh*(fy+0.04)); ctx.lineTo(ox+sw*(fx+0.14), oy+sh*(fy-0.04)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx+0.14), oy+sh*(fy+0.04)); ctx.lineTo(ox+sw*(fx-0.14), oy+sh*(fy-0.04)); ctx.stroke();
    ctx.lineCap = "square";
    // Braises
    ctx.fillStyle = "rgba(210,70,5,0.75)";
    ctx.beginPath(); ctx.ellipse(ox+sw*fx, oy+sh*(fy-0.01), sw*0.11, sh*0.04, 0, 0, Math.PI*2); ctx.fill();
    // Flammes (3 langues animées)
    const f1 = 0.5+0.5*Math.sin(now/190), f2 = 0.5+0.5*Math.sin(now/160+1.5), f3 = 0.5+0.5*Math.sin(now/220+2.9);
    ctx.fillStyle = `rgba(255,90,8,${(0.72+f1*0.28).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx-0.08), oy+sh*(fy-0.02)); ctx.quadraticCurveTo(ox+sw*(fx-0.14), oy+sh*(fy-0.14-f1*0.07), ox+sw*(fx-0.04), oy+sh*(fy-0.19-f1*0.05)); ctx.quadraticCurveTo(ox+sw*(fx+0.01), oy+sh*(fy-0.08), ox+sw*(fx+0.04), oy+sh*(fy-0.02)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,195,15,${(0.78+f2*0.22).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx-0.06), oy+sh*(fy-0.02)); ctx.quadraticCurveTo(ox+sw*(fx-0.01), oy+sh*(fy-0.2-f2*0.1), ox+sw*fx, oy+sh*(fy-0.25-f2*0.07)); ctx.quadraticCurveTo(ox+sw*(fx+0.01), oy+sh*(fy-0.12), ox+sw*(fx+0.06), oy+sh*(fy-0.02)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,130,15,${(0.7+f3*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx+0.04), oy+sh*(fy-0.02)); ctx.quadraticCurveTo(ox+sw*(fx+0.12), oy+sh*(fy-0.12-f3*0.06), ox+sw*(fx+0.06), oy+sh*(fy-0.17-f3*0.05)); ctx.quadraticCurveTo(ox+sw*(fx+0.01), oy+sh*(fy-0.07), ox+sw*(fx-0.03), oy+sh*(fy-0.02)); ctx.closePath(); ctx.fill();
    // Halo rayonnant
    const halo = 0.28 + 0.18*Math.abs(Math.sin(now/520));
    const rg = ctx.createRadialGradient(ox+sw*fx, oy+sh*fy, 0, ox+sw*fx, oy+sh*fy, sw*0.36);
    rg.addColorStop(0, `rgba(255,170,40,${halo.toFixed(2)})`); rg.addColorStop(1, "rgba(255,90,10,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(ox+sw*fx, oy+sh*fy, sw*0.36, 0, Math.PI*2); ctx.fill();

    // === LIVRE OUVERT (gauche) ===
    const bx = 0.1, by = 0.58, bw = 0.32, bh = 0.22;
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(ox+sw*(bx+bw*0.5), oy+sh*(by+bh+0.025), sw*bw*0.52, sh*0.04, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#5a2e06"; ctx.fillRect(ox+sw*(bx-0.012), oy+sh*(by-0.01), sw*(bw+0.024), sh*(bh+0.02));
    ctx.fillStyle = "#e8daaa"; ctx.fillRect(ox+sw*bx, oy+sh*by, sw*(bw*0.47), sh*bh);
    const pglo = 0.06+0.07*Math.sin(now/520);
    ctx.fillStyle = `rgba(255,155,35,${pglo.toFixed(2)})`; ctx.fillRect(ox+sw*bx, oy+sh*by, sw*(bw*0.47), sh*bh);
    ctx.fillStyle = "#f0dfc0"; ctx.fillRect(ox+sw*(bx+bw*0.53), oy+sh*by, sw*(bw*0.47), sh*bh);
    ctx.fillStyle = `rgba(255,180,60,${(pglo*1.6).toFixed(2)})`; ctx.fillRect(ox+sw*(bx+bw*0.53), oy+sh*by, sw*(bw*0.47), sh*bh);
    ctx.fillStyle = "#3a1a04"; ctx.fillRect(ox+sw*(bx+bw*0.487), oy+sh*by, sw*0.02, sh*bh);
    ctx.fillStyle = "rgba(70,45,15,0.5)";
    for (let li = 0; li < 4; li++) {
      ctx.fillRect(ox+sw*(bx+0.024), oy+sh*(by+0.038+li*0.044), sw*0.105, sh*0.014);
      ctx.fillRect(ox+sw*(bx+bw*0.555), oy+sh*(by+0.038+li*0.044), sw*0.105, sh*0.014);
    }

    // === PERSONNAGE ASSIS (centre) ===
    const cx2 = 0.46, cy2 = 0.54;
    ctx.fillStyle = "#2c1c0c"; ctx.fillRect(ox+sw*(cx2-0.032), oy+sh*(cy2+0.04), sw*0.064, sh*0.09);
    ctx.fillStyle = `rgba(190,130,70,${(0.7+halo*0.6).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(ox+sw*cx2, oy+sh*cy2, sw*0.048, 0, Math.PI*2); ctx.fill();

    // Tier 1+ : auditeurs
    if (tier >= 1) {
      const nb = tier >= 2 ? 4 : 2;
      for (let i = 0; i < nb; i++) {
        const ang = Math.PI*0.7 + (Math.PI*0.9)*(i/Math.max(1,nb-1));
        const px2 = fx + Math.cos(ang)*0.28, py2 = fy + Math.sin(ang)*0.2;
        if (px2 < 0.04 || px2 > 0.96) continue;
        ctx.fillStyle = "#1e140a"; ctx.fillRect(ox+sw*(px2-0.028), oy+sh*(py2+0.025), sw*0.056, sh*0.075);
        ctx.fillStyle = `rgba(170,110,55,${(0.6+halo*0.5).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*px2, oy+sh*py2, sw*0.038, 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }
  if (id === "scribes") {
    // Scriptorium : salle voûtée médiévale, scribes à la lueur des bougies
    px(0.08, 0.34, 0.84, 0.48, "#705230");
    ctx.fillStyle = "#4a3218";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.36); ctx.lineTo(ox+sw*0.5, oy+sh*0.14); ctx.lineTo(ox+sw*0.94, oy+sh*0.36); ctx.closePath(); ctx.fill();
    px(0.06, 0.33, 0.88, 0.05, "#382410");
    const nWin = 2 + Math.min(tier, 2);
    for (let i = 0; i < nWin; i++) {
      const wx = 0.17 + i * (0.66 / Math.max(1, nWin - 1));
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(ox+sw*(wx-0.036), oy+sh*0.40, sw*0.072, sh*0.16);
      ctx.fillStyle = "#1a1008"; ctx.beginPath(); ctx.arc(ox+sw*wx, oy+sh*0.40, sw*0.036, Math.PI, 0); ctx.fill();
      ctx.fillStyle = litWarm; ctx.beginPath(); ctx.arc(ox+sw*wx, oy+sh*0.40, sw*0.020, Math.PI, 0); ctx.fill();
      ctx.fillRect(ox+sw*(wx-0.016), oy+sh*0.40, sw*0.032, sh*0.12);
    }
    const nT = 2 + tier;
    for (let i = 0; i < nT && i < 4; i++) {
      const tx = 0.14 + (i % 2) * 0.44, ty = 0.56 + Math.floor(i / 2) * 0.10;
      px(tx, ty, 0.22, 0.07, "#c8b882");
      ctx.fillStyle = "rgba(40,22,6,0.55)"; ctx.beginPath(); ctx.arc(ox+sw*(tx+0.11), oy+sh*(ty-0.025), sw*0.022, 0, Math.PI*2); ctx.fill();
    }
    px(0.44, 0.64, 0.12, 0.18, "#1e1006");
    return;
  }
  if (id === "schools") {
    // École : cour à colonnades, rangées d'élèves, maître à l'avant
    px(0.08, 0.26, 0.84, 0.50, "#b8944a");
    ctx.fillStyle = "#6a4a10";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.28); ctx.lineTo(ox+sw*0.5, oy+sh*0.08); ctx.lineTo(ox+sw*0.94, oy+sh*0.28); ctx.closePath(); ctx.fill();
    px(0.20, 0.38, 0.60, 0.26, "#d4b86a");
    px(0.36, 0.34, 0.28, 0.06, "#c8a85a");
    const nRows = 1 + Math.min(tier, 2);
    for (let row = 0; row < nRows; row++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = "rgba(60,38,14,0.6)";
        ctx.beginPath(); ctx.arc(ox+sw*(0.26+c*0.14), oy+sh*(0.50+row*0.08), sw*0.018, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.fillStyle = "#2a1408"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.43, sw*0.026, 0, Math.PI*2); ctx.fill();
    const nCol = 3 + Math.min(tier, 2);
    for (let i = 0; i < nCol; i++) px(0.14 + i * (0.72 / Math.max(1, nCol - 1)) - 0.014, 0.28, 0.028, 0.14, "rgba(30,20,8,0.42)");
    px(0.44, 0.62, 0.12, 0.16, "#1e1006");
    return;
  }
  if (id === "academies") {
    // Académie : péristyle, jardin, philosophes en cercle de discussion
    px(0.06, 0.28, 0.88, 0.52, "#d4c5a0");
    ctx.fillStyle = "#b8a882";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.04, oy+sh*0.30); ctx.lineTo(ox+sw*0.5, oy+sh*0.08); ctx.lineTo(ox+sw*0.96, oy+sh*0.30); ctx.closePath(); ctx.fill();
    px(0.06, 0.27, 0.88, 0.05, "#9a8860");
    const nCol = 4 + Math.min(tier, 2);
    for (let i = 0; i < nCol; i++) px(0.12 + i * (0.76 / Math.max(1, nCol - 1)) - 0.014, 0.32, 0.028, 0.42, "rgba(30,20,8,0.38)");
    px(0.22, 0.44, 0.56, 0.22, "#c4b890");
    const nPhil = 4 + tier;
    for (let i = 0; i < nPhil; i++) {
      const a = (i / nPhil) * Math.PI * 2;
      ctx.fillStyle = "rgba(50,32,10,0.65)";
      ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.14), oy+sh*(0.56+Math.sin(a)*0.075), sw*0.022, 0, Math.PI*2); ctx.fill();
    }
    px(0.46, 0.48, 0.08, 0.10, "#b0a070");
    px(0.44, 0.66, 0.12, 0.14, "#1e1408");
    strokeRect(0.06, 0.28, 0.88, 0.52, "#c0b090");
    return;
  }
  if (id === "ancestral_cult") {
    // Culte des ancêtres : mégalithes en cercle, autel central, flamme rituelle
    px(0.0, 0.48, 1.0, 0.52, "#2e2416");
    const nStones = 5 + Math.min(tier, 3);
    for (let i = 0; i < nStones; i++) {
      const a = (i / nStones) * Math.PI * 2;
      const sx2 = 0.5 + Math.cos(a) * 0.34, sy2 = 0.62 + Math.sin(a) * 0.20;
      const sth = 0.10 + (i * 37 % 3) * 0.04;
      ctx.fillStyle = "#6a5a48"; ctx.fillRect(ox+sw*(sx2-0.024), oy+sh*(sy2-sth), sw*0.048, sh*sth);
      ctx.fillStyle = "rgba(180,160,120,0.38)"; ctx.fillRect(ox+sw*(sx2-0.022), oy+sh*(sy2-sth), sw*0.020, sh*sth);
    }
    px(0.46, 0.54, 0.08, 0.46, "#4a3c2a");
    px(0.40, 0.60, 0.20, 0.08, "#786040");
    const af1 = 0.5 + 0.5 * Math.sin(now / 180), af2 = 0.5 + 0.5 * Math.sin(now / 150 + 1.2);
    ctx.fillStyle = `rgba(255,120,10,${(0.7+af1*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*0.46, oy+sh*0.62); ctx.quadraticCurveTo(ox+sw*0.42, oy+sh*(0.46-af1*0.06), ox+sw*0.50, oy+sh*(0.40-af1*0.05)); ctx.quadraticCurveTo(ox+sw*0.58, oy+sh*(0.46-af2*0.05), ox+sw*0.54, oy+sh*0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,210,40,${(0.65+af2*0.25).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*0.48, oy+sh*0.62); ctx.quadraticCurveTo(ox+sw*0.45, oy+sh*(0.50-af2*0.08), ox+sw*0.50, oy+sh*(0.44-af2*0.06)); ctx.quadraticCurveTo(ox+sw*0.55, oy+sh*(0.50-af1*0.05), ox+sw*0.52, oy+sh*0.62); ctx.closePath(); ctx.fill();
    if (night > 0.2) {
      const hg = ctx.createRadialGradient(ox+sw*0.5, oy+sh*0.60, 0, ox+sw*0.5, oy+sh*0.60, sw*0.36);
      hg.addColorStop(0, `rgba(255,155,30,${(0.22*night).toFixed(2)})`); hg.addColorStop(1, "rgba(255,90,5,0)");
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.60, sw*0.36, 0, Math.PI*2); ctx.fill();
    }
    if (tier >= 1) {
      for (let i = 0; i < 2 + tier; i++) {
        const a = -Math.PI / 2 + (i / (1 + tier)) * Math.PI;
        ctx.fillStyle = "#d4c8a0"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.18), oy+sh*(0.61+Math.sin(a)*0.04), sw*0.022, 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }
  if (id === "observatories") {
    // Observatoire : dôme avec fente animée, bras de télescope pivotant, rose des vents
    ctx.fillStyle = "#3a3050"; ctx.beginPath(); ctx.ellipse(ox+sw*0.5, oy+sh*0.64, sw*0.42, sh*0.18, 0, 0, Math.PI*2); ctx.fill();
    px(0.36, 0.24, 0.28, 0.40, "#2a2840");
    ctx.fillStyle = "#3c3860"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.24, sw*0.18, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(150,160,220,0.6)"; ctx.lineWidth = Math.max(1, sw*0.022);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.24, sw*0.18, Math.PI, 0); ctx.stroke();
    const slitA = (now / 3200) % Math.PI;
    ctx.strokeStyle = "#0a0818"; ctx.lineWidth = Math.max(2, sw*0.030);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.24, sw*0.18, Math.PI + slitA, Math.PI + slitA + 0.38); ctx.stroke();
    const telA = slitA - Math.PI / 2;
    ctx.strokeStyle = "#8090a0"; ctx.lineWidth = Math.max(1.5, sw*0.028); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.24); ctx.lineTo(ox+sw*(0.5+Math.cos(telA)*0.15), oy+sh*(0.24+Math.sin(telA)*0.11)); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = "#a0b0c0"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(telA)*0.16), oy+sh*(0.24+Math.sin(telA)*0.12), Math.max(1.5, sw*0.036), 0, Math.PI*2); ctx.fill();
    const pulse = 0.4 + Math.abs(Math.sin(now / 800)) * 0.5;
    ctx.fillStyle = `rgba(107,182,255,${pulse.toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.22, sw*0.055, 0, Math.PI*2); ctx.fill();
    if (tier >= 1) {
      ctx.strokeStyle = "rgba(140,160,200,0.32)"; ctx.lineWidth = Math.max(0.5, sw*0.013);
      for (let i = 0; i < 4; i++) {
        const a2 = i * Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.64); ctx.lineTo(ox+sw*(0.5+Math.cos(a2)*0.36), oy+sh*(0.64+Math.sin(a2)*0.14)); ctx.stroke();
      }
    }
    if (tier >= 2) { px(0.68, 0.38, 0.18, 0.24, "#2a2840"); px(0.68, 0.32, 0.18, 0.08, "#3c3860"); }
    return;
  }
  if (id === "libraries") {
    // Bibliothèque : hall néoclassique, rayonnages colorés par rangées, lecteurs aux tables
    px(0.08, 0.26, 0.84, 0.54, "#c8b882");
    ctx.fillStyle = "#b0a070";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.28); ctx.lineTo(ox+sw*0.5, oy+sh*0.08); ctx.lineTo(ox+sw*0.94, oy+sh*0.28); ctx.closePath(); ctx.fill();
    px(0.06, 0.25, 0.88, 0.05, "#7a6434");
    const lCols = 4 + Math.min(tier, 2);
    for (let i = 0; i < lCols; i++) px(0.13 + i * (0.74 / Math.max(1, lCols - 1)) - 0.014, 0.30, 0.028, 0.42, "rgba(30,20,8,0.42)");
    const spines = ["#9c3b2f", "#7a5c2a", "#3a6a3a", "#b58f3a", "#8a4a6a", "#4a5a8a", "#c07a30"];
    const nShelves = 2 + Math.min(tier, 2);
    for (let row = 0; row < nShelves; row++) {
      for (let i = 0; i < 6; i++) px(0.18 + i * 0.108, 0.36 + row * 0.10, 0.088, 0.07, spines[(i + row) % spines.length]);
    }
    for (let i = 0; i < 1 + tier; i++) {
      px(0.22 + i * 0.22, 0.66, 0.14, 0.06, "#d8c898");
      ctx.fillStyle = "rgba(40,24,8,0.55)"; ctx.beginPath(); ctx.arc(ox+sw*(0.29+i*0.22), oy+sh*0.64, sw*0.018, 0, Math.PI*2); ctx.fill();
    }
    px(0.44, 0.60, 0.12, 0.20, "#2e1e0a");
    return;
  }
  if (id === "universities") {
    const band = CM.layout?.counts?.eraBand ?? 0;
    const t2 = now || 0;

    if (band <= 3) {
      // ── ÈRE MÉDIÉVALE/RENAISSANCE — quadrangle gothique, clocher, cour herbeuse ──
      // Pelouse de la cour
      px(0.0, 0.0, 1.0, 1.0, band >= 2 ? "#a89a60" : "#9a8e58");
      // Corps principal (4 ailes autour de la cour)
      const wallCol = band >= 2 ? "#c0a870" : "#b09860";
      px(0.06, 0.12, 0.88, 0.12, wallCol); // aile nord
      px(0.06, 0.76, 0.88, 0.12, wallCol); // aile sud
      px(0.06, 0.12, 0.12, 0.76, wallCol); // aile ouest
      px(0.82, 0.12, 0.12, 0.76, wallCol); // aile est
      // Cour intérieure (herbe)
      px(0.18, 0.24, 0.64, 0.52, band >= 2 ? "#5a7830" : "#4a6a28");
      // Allées en croix dans la cour
      px(0.18, 0.48, 0.64, 0.04, "#a89460"); px(0.48, 0.24, 0.04, 0.52, "#a89460");
      // Arbre central
      ctx.fillStyle = band >= 2 ? "#2a6018" : "#1e5014";
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.078, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = band >= 2 ? "#1c4a10" : "#163c0c";
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.038, 0, Math.PI*2); ctx.fill();
      // Clocher (nord-centre)
      const towerCol = band >= 2 ? "#8a7040" : "#7a6038";
      px(0.44, 0.0, 0.12, 0.16, towerCol);
      px(0.42, 0.0, 0.16, 0.04, "#5a4020");
      // Aiguille du clocher
      ctx.fillStyle = band >= 2 ? "#c8a850" : "#a88840";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy-sh*0.04); ctx.lineTo(ox+sw*0.46, oy+sh*0.03); ctx.lineTo(ox+sw*0.54, oy+sh*0.03); ctx.closePath(); ctx.fill();
      // Cloche (point lumineux)
      ctx.fillStyle = litGold; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.08, sw*0.028, 0, Math.PI*2); ctx.fill();
      // Fenêtres gothiques dans les ailes (en arc brisé)
      ctx.fillStyle = litWarm;
      const winY = [0.14, 0.14, 0.14]; const winX = [0.22, 0.38, 0.54, 0.70];
      for (const wx of winX) { ctx.fillRect(ox+sw*wx, oy+sh*0.14, sw*0.06, sh*0.06); ctx.beginPath(); ctx.arc(ox+sw*(wx+0.03), oy+sh*0.14, sw*0.03, Math.PI, 0); ctx.fill(); }
      // Portail principal (sud)
      px(0.44, 0.76, 0.12, 0.09, "#3a2810");
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.76, sw*0.06, Math.PI, 0); ctx.fillStyle="#3a2810"; ctx.fill();
      // Tier 1 : chapelle annexe (est)
      if (tier >= 1) {
        px(0.80, 0.28, 0.14, 0.44, "#b8a260");
        ctx.fillStyle = "#7a6030";
        ctx.beginPath(); ctx.moveTo(ox+sw*0.87, oy+sh*0.22); ctx.lineTo(ox+sw*0.94, oy+sh*0.28); ctx.lineTo(ox+sw*0.80, oy+sh*0.28); ctx.closePath(); ctx.fill();
        ctx.fillStyle = litWarm; ctx.fillRect(ox+sw*0.84, oy+sh*0.36, sw*0.06, sh*0.08);
      }
      // Tier 2 : salle de lecture avec verrière bleue (ouest)
      if (tier >= 2) {
        px(0.06, 0.28, 0.14, 0.44, "#9a8258");
        ctx.fillStyle = "rgba(100,140,200,0.38)"; ctx.fillRect(ox+sw*0.08, oy+sh*0.30, sw*0.10, sh*0.40);
        ctx.strokeStyle = "rgba(160,200,255,0.55)"; ctx.lineWidth = Math.max(0.5, sw*0.012);
        for (let li = 1; li < 4; li++) { ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*(0.30+li*0.10)); ctx.lineTo(ox+sw*0.18, oy+sh*(0.30+li*0.10)); ctx.stroke(); }
        // Lueur chaude la nuit (lampes dans la bibliothèque)
        if (night > 0.3) {
          ctx.fillStyle = `rgba(255,200,80,${(night*0.22).toFixed(2)})`;
          ctx.fillRect(ox+sw*0.08, oy+sh*0.30, sw*0.10, sh*0.40);
        }
      }

    } else if (band <= 5) {
      // ── ÈRE INDUSTRIELLE/MODERNE — campus néoclassique, bâtiments en brique ──
      const brickCol = band >= 5 ? "#8a7058" : "#9a7848";
      // Sol du campus (gris-vert)
      px(0.0, 0.0, 1.0, 1.0, band >= 5 ? "#6a7058" : "#786838");
      // Bâtiment principal (façade néoclassique)
      px(0.08, 0.16, 0.84, 0.58, brickCol);
      ctx.fillStyle = "#5a4a38"; ctx.fillRect(ox+sw*0.06, oy+sh*0.10, sw*0.88, sh*0.08);
      // Fronton triangulaire
      ctx.fillStyle = band >= 5 ? "#7a8868" : "#b89050";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*0.18); ctx.lineTo(ox+sw*0.5, oy+sh*0.04); ctx.lineTo(ox+sw*0.92, oy+sh*0.18); ctx.closePath(); ctx.fill();
      // Colonnes
      ctx.fillStyle = band >= 5 ? "#c8c8b0" : "#d4c080";
      const nCols = 4 + tier;
      for (let ci = 0; ci < nCols; ci++) { ctx.fillRect(ox+sw*(0.14+ci*(0.72/(nCols-1)))-sw*0.022, oy+sh*0.18, sw*0.044, sh*0.56); }
      // Escalier d'entrée
      for (let si = 0; si < 3; si++) { px(0.28+si*0.04, 0.74-si*0.02, 0.44-si*0.08, 0.04, band>=5?"#b0a888":"#c8aa60"); }
      // Portail central
      px(0.44, 0.54, 0.12, 0.22, "#2a1e0e");
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.54, sw*0.06, Math.PI, 0); ctx.fillStyle="#2a1e0e"; ctx.fill();
      // Grilles de fenêtres
      ctx.fillStyle = litWarm;
      const fRows = tier >= 1 ? 3 : 2;
      for (let r = 0; r < fRows; r++) for (let c = 0; c < 5; c++) {
        if (c === 2 && r === fRows-1) continue; // porte centrale
        ctx.fillRect(ox+sw*(0.16+c*0.14), oy+sh*(0.22+r*0.10), sw*0.08, sh*0.07);
        ctx.beginPath(); ctx.arc(ox+sw*(0.16+c*0.14+0.04), oy+sh*(0.22+r*0.10), sw*0.04, Math.PI, 0); ctx.fill();
      }
      // Tier 1 : aile de laboratoire (droite)
      if (tier >= 1) {
        px(0.78, 0.28, 0.22, 0.46, band>=5?"#7a8060":"#8a7048");
        ctx.fillStyle = litWarm;
        for (let ri = 0; ri < 3; ri++) ctx.fillRect(ox+sw*0.82, oy+sh*(0.30+ri*0.12), sw*0.12, sh*0.08);
        // Cheminée de labo
        px(0.84, 0.14, 0.06, 0.16, "#504838");
        const smoke2 = ((t2/1100) % 1);
        ctx.fillStyle = `rgba(100,90,75,${((1-smoke2)*0.3).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*0.87, oy+sh*(0.12-smoke2*0.12), sw*(0.03+smoke2*0.04), 0, Math.PI*2); ctx.fill();
      }
      // Tier 2 : coupole d'observatoire (toit)
      if (tier >= 2) {
        ctx.fillStyle = band >= 5 ? "#7890a8" : "#9090b8";
        ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.04, sw*0.14, Math.PI, 0); ctx.fill();
        const domeGlow = 0.4 + 0.25*Math.abs(Math.sin(t2/900));
        ctx.strokeStyle = `rgba(160,200,255,${domeGlow.toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.022);
        ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.04, sw*0.14, Math.PI, 0); ctx.stroke();
      }
      // Lueur nocturne
      if (night > 0.25) {
        ctx.fillStyle = `rgba(255,200,100,${(night*0.18).toFixed(2)})`;
        ctx.fillRect(ox+sw*0.08, oy+sh*0.16, sw*0.84, sh*0.58);
      }

    } else {
      // ── ÈRE FUTURISTE — campus technologique, verre et lumière ──
      const techPulse = 0.5 + 0.35*Math.abs(Math.sin(t2/800));
      // Dalle du campus (gris-bleu)
      px(0.0, 0.0, 1.0, 1.0, "#424850");
      // Grille de sol
      ctx.strokeStyle = "rgba(80,120,160,0.22)"; ctx.lineWidth = Math.max(0.5, sw*0.010);
      for (let gi = 1; gi < 5; gi++) { ctx.beginPath(); ctx.moveTo(ox+sw*gi*0.2, oy); ctx.lineTo(ox+sw*gi*0.2, oy+sh); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ox, oy+sh*gi*0.2); ctx.lineTo(ox+sw, oy+sh*gi*0.2); ctx.stroke(); }
      // Tour centrale de recherche (verre bleu-gris)
      px(0.32, 0.04, 0.36, 0.78, "#2a3848");
      ctx.fillStyle = `rgba(60,130,220,${(0.12+night*0.18).toFixed(2)})`;
      ctx.fillRect(ox+sw*0.32, oy+sh*0.04, sw*0.36, sh*0.78);
      // Reflet de façade
      ctx.fillStyle = "rgba(180,210,255,0.10)"; ctx.fillRect(ox+sw*0.33, oy+sh*0.04, sw*0.08, sh*0.78);
      ctx.fillStyle = "rgba(0,0,0,0.20)"; ctx.fillRect(ox+sw*0.60, oy+sh*0.04, sw*0.08, sh*0.78);
      // Bandes vitrées horizontales (fenêtres panoramiques)
      const fRows2 = 5 + Math.min(tier, 3);
      ctx.fillStyle = litWarm;
      for (let r = 0; r < fRows2; r++) ctx.fillRect(ox+sw*0.34, oy+sh*(0.08+r*(0.64/fRows2)), sw*0.32, Math.max(1, sh*0.038));
      // Bâtiments annexes (gauche et droite)
      for (const side of [-1, 1]) {
        const bx2 = side > 0 ? 0.72 : 0.06, bw2 = 0.22;
        px(bx2, 0.32, bw2, 0.50, "#303a48");
        ctx.fillStyle = `rgba(60,120,200,${(0.08+night*0.15).toFixed(2)})`;
        ctx.fillRect(ox+sw*bx2, oy+sh*0.32, sw*bw2, sh*0.50);
        ctx.fillStyle = litWarm;
        for (let ri = 0; ri < 3; ri++) ctx.fillRect(ox+sw*(bx2+0.03), oy+sh*(0.36+ri*0.13), sw*(bw2-0.06), sh*0.07);
      }
      // Bandes LED de façade (animées)
      for (let li = 0; li < 4; li++) {
        const lAlpha = 0.3+0.35*Math.abs(Math.sin(t2/500+li*0.9));
        ctx.fillStyle = li%2===0?`rgba(60,200,255,${lAlpha.toFixed(2)})`:`rgba(100,160,255,${(lAlpha*0.7).toFixed(2)})`;
        ctx.fillRect(ox+sw*0.32, oy+sh*(0.16+li*0.16), sw*0.36, Math.max(1.5, sh*0.018));
      }
      // Antenne / pylône de recherche (sommet)
      px(0.48, 0.0, 0.04, 0.08, "#4a5870");
      ctx.fillStyle = `rgba(60,200,255,${(0.55+0.45*Math.abs(Math.sin(t2/600))).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy, Math.max(2, sw*0.05), 0, Math.PI*2); ctx.fill();
      // Tier 1 : antennes latérales
      if (tier >= 1) {
        for (const ax2 of [0.28, 0.72]) {
          px(ax2, 0.24, 0.04, 0.10, "#3a4858");
          ctx.fillStyle = `rgba(100,220,255,${(0.4+techPulse*0.4).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(ox+sw*ax2, oy+sh*0.24, Math.max(1.5, sw*0.034), 0, Math.PI*2); ctx.fill();
        }
      }
      // Tier 2 : hologramme / anneau flottant
      if (tier >= 2) {
        ctx.strokeStyle = `rgba(60,220,255,${(techPulse*0.8).toFixed(2)})`; ctx.lineWidth = Math.max(1.5, sw*0.030);
        ctx.beginPath(); ctx.ellipse(ox+sw*0.5, oy+sh*0.50, sw*0.15, sh*0.055, 0, 0, Math.PI*2); ctx.stroke();
        const orbA = t2/1400;
        ctx.fillStyle = `rgba(140,240,255,${(0.55+techPulse*0.35).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(orbA)*0.14), oy+sh*(0.50+Math.sin(orbA)*0.052), Math.max(2, sw*0.04), 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }
  if (id === "printing_houses") {
    // Imprimerie : grande presse mécanique animée, feuilles, encriers, cheminée industrielle
    px(0.06, 0.24, 0.88, 0.56, "#6a5030");
    ctx.fillStyle = "#3a2818";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.04, oy+sh*0.26); ctx.lineTo(ox+sw*0.5, oy+sh*0.06); ctx.lineTo(ox+sw*0.96, oy+sh*0.26); ctx.closePath(); ctx.fill();
    px(0.04, 0.22, 0.92, 0.06, "#4a3420");
    px(0.26, 0.34, 0.48, 0.30, "#3a2e20");
    px(0.32, 0.38, 0.36, 0.22, "#8a7458");
    ctx.strokeStyle = "#c0a060"; ctx.lineWidth = Math.max(2, sw*0.032);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.34); ctx.lineTo(ox+sw*0.5, oy+sh*0.64); ctx.stroke();
    ctx.fillStyle = "#c0a060"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.34, sw*0.040, 0, Math.PI*2); ctx.fill();
    const pressRot = (now / 1200) % (Math.PI * 2);
    ctx.strokeStyle = "#b09050"; ctx.lineWidth = Math.max(1.5, sw*0.024);
    ctx.beginPath(); ctx.moveTo(ox+sw*(0.5+Math.cos(pressRot)*0.15), oy+sh*(0.34+Math.sin(pressRot)*0.06)); ctx.lineTo(ox+sw*(0.5-Math.cos(pressRot)*0.15), oy+sh*(0.34-Math.sin(pressRot)*0.06)); ctx.stroke();
    const nSheets = 2 + tier;
    for (let i = 0; i < nSheets && i < 4; i++) {
      const sx2 = 0.10 + i * 0.09, sy2 = 0.54 + i * 0.04;
      px(sx2, sy2, 0.13, 0.08, "#f0e8d0");
      ctx.fillStyle = "rgba(40,28,12,0.32)";
      for (let l = 0; l < 2; l++) ctx.fillRect(ox+sw*(sx2+0.014), oy+sh*(sy2+0.016+l*0.030), sw*0.10, sh*0.010);
    }
    px(0.76, 0.38, 0.08, 0.08, "#1a0c04"); px(0.76, 0.50, 0.08, 0.08, "#1a0c04");
    if (tier >= 1) px(0.64, 0.34, 0.08, 0.14, litWarm);
    if (tier >= 2) {
      px(0.80, 0.10, 0.08, 0.20, "#3a2a18");
      const smoke = (now / 900) % 1;
      ctx.fillStyle = `rgba(80,70,58,${((1 - smoke) * 0.28).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.84, oy+sh*(0.08 - smoke * 0.16), sw*(0.04 + smoke * 0.06), 0, Math.PI*2); ctx.fill();
    }
    return;
  }
  if (id === "think_tanks") {
    // Institut stratégique : verre et acier, écrans holographiques, antennes, hologramme
    px(0.08, 0.18, 0.84, 0.64, "#1e2434");
    px(0.06, 0.12, 0.88, 0.08, "#2a3248");
    ctx.fillStyle = "rgba(80,140,220,0.13)"; ctx.fillRect(ox+sw*0.12, oy+sh*0.22, sw*0.76, sh*0.55);
    ctx.strokeStyle = "rgba(60,100,180,0.25)"; ctx.lineWidth = Math.max(0.5, sw*0.013);
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(ox+sw*(0.12+i*0.152), oy+sh*0.22); ctx.lineTo(ox+sw*(0.12+i*0.152), oy+sh*0.77); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12, oy+sh*(0.22+i*0.11)); ctx.lineTo(ox+sw*0.88, oy+sh*(0.22+i*0.11)); ctx.stroke();
    }
    const pulse = 0.35 + Math.abs(Math.sin(now / 700)) * 0.45;
    const pStr = pulse.toFixed(2);
    for (let row = 0; row < 3 + tier; row++) {
      for (let col = 0; col < 4; col++) {
        const hue = (row + col) % 3 === 0 ? `rgba(60,200,255,${pStr})` : (row + col) % 3 === 1 ? `rgba(80,255,160,${(pulse*0.7).toFixed(2)})` : `rgba(255,180,40,${(pulse*0.5).toFixed(2)})`;
        px(0.18 + col * 0.16, 0.28 + row * 0.11, 0.10, 0.06, hue);
      }
    }
    ctx.strokeStyle = "#4a5870"; ctx.lineWidth = Math.max(1, sw*0.016);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.12); ctx.lineTo(ox+sw*0.5, oy+sh*0.0); ctx.stroke();
    ctx.strokeStyle = `rgba(107,182,255,${(0.5+Math.abs(Math.sin(now/600))*0.4).toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.022);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.0, sw*0.050, 0, Math.PI*2); ctx.stroke();
    if (tier >= 1) {
      ctx.strokeStyle = "#4a5870"; ctx.lineWidth = Math.max(0.5, sw*0.013);
      for (const ax2 of [0.28, 0.72]) {
        ctx.beginPath(); ctx.moveTo(ox+sw*ax2, oy+sh*0.12); ctx.lineTo(ox+sw*ax2, oy+sh*0.04); ctx.stroke();
        ctx.fillStyle = `rgba(107,182,255,${(0.4+pulse*0.4).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*ax2, oy+sh*0.04, Math.max(1, sw*0.028), 0, Math.PI*2); ctx.fill();
      }
    }
    if (tier >= 2) {
      ctx.strokeStyle = `rgba(60,200,255,${(pulse*0.6).toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.022);
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.12, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.06, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = `rgba(80,255,200,${(pulse*0.5).toFixed(2)})`;
      for (let i = 0; i < 3; i++) {
        const a = now / 1000 + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.50); ctx.lineTo(ox+sw*(0.5+Math.cos(a)*0.11), oy+sh*(0.50+Math.sin(a)*0.07)); ctx.stroke();
      }
    }
    return;
  }
  if (id === "aqueducts") {
    // Structure linéaire : spanX arches, 1 tile de haut. sw = largeur totale.
    const spanX = t.spanX || 3;
    const aw = 1 / spanX;          // fraction de sw par travée
    const pw = Math.max(0.008, aw * 0.20); // largeur relative d'un pilier

    // Soubassement
    px(0, 0.80, 1, 0.20, "#7a6a50");
    px(0, 0.78, 1, 0.04, "rgba(255,240,200,0.12)");

    // Piliers (spanX+1 piliers : un de chaque côté + un entre chaque travée)
    for (let i = 0; i <= spanX; i++) {
      const pxL = i * aw - pw / 2;
      const pxLc = Math.max(0, Math.min(1 - pw, pxL));
      px(pxLc, 0.32, pw, 0.48, "#c0aa80");
      px(pxLc, 0.32, pw * 0.30, 0.48, "rgba(255,240,200,0.22)"); // reflet
      px(pxLc, 0.78, pw, 0.04, "#d4c090");                        // chapiteau
      // Joints de maçonnerie
      ctx.fillStyle = "rgba(75,60,35,0.25)";
      for (let ji = 1; ji < 4; ji++) ctx.fillRect(ox + sw * pxLc, oy + sh * (0.32 + ji * 0.12), sw * pw, Math.max(1, sh * 0.012));
    }

    // Arches (entre chaque paire de piliers)
    for (let i = 0; i < spanX; i++) {
      const cx2 = ox + sw * ((i + 0.5) * aw);
      const archR = sw * aw * 0.44;
      const archY = oy + sh * 0.80;
      ctx.strokeStyle = "#9a8060"; ctx.lineWidth = Math.max(1, sw * aw * 0.06);
      ctx.beginPath(); ctx.arc(cx2, archY, archR, Math.PI, 0); ctx.stroke();
      // Archivolte (bordure de l'arc)
      ctx.strokeStyle = "rgba(200,180,130,0.35)"; ctx.lineWidth = Math.max(0.5, sw * aw * 0.025);
      ctx.beginPath(); ctx.arc(cx2, archY, archR * 0.82, Math.PI, 0); ctx.stroke();
    }

    // Canal sur le dessus (toute la longueur)
    px(0, 0.16, 1, 0.18, "#c8b490");  // couronnement pierre
    px(0, 0.12, 1, 0.06, "#6a5a38"); // bandeau supérieur
    px(0.015, 0.185, 0.97, 0.10, "#1e4a6e"); // eau dans le canal

    // Eau animée (deux vagues qui coulent)
    const stream = (now / 900) % 1;
    const ww = Math.min(0.35, 0.7 / spanX);
    px(0.015 + stream * (0.97 - ww), 0.200, ww, 0.065, "rgba(107,182,255,0.75)");
    px(0.015 + ((stream + 0.5) % 1) * (0.97 - ww * 0.7), 0.200, ww * 0.7, 0.065, "rgba(160,220,255,0.45)");

    // Reflets dans l'eau (scintillements statiques)
    ctx.fillStyle = `rgba(200,240,255,${(0.25 + 0.15 * Math.sin(now / 400)).toFixed(2)})`;
    for (let i = 0; i < spanX; i++) ctx.fillRect(ox + sw * ((i + 0.3) * aw + 0.015), oy + sh * 0.205, Math.max(1, sw * aw * 0.1), Math.max(1, sh * 0.025));

    return;
  }
  if (id === "watch") {
    // Veilleurs : tour de guet qui évolue du poste de feu primitif à la tourelle de surveillance
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      // Tourelle de surveillance moderne
      px(0.38, 0.68, 0.24, 0.22, "#2a3040"); // base
      px(0.30, 0.20, 0.40, 0.50, "#3a4050"); // corps
      px(0.26, 0.16, 0.48, 0.06, "#2a3040"); // toit plat
      ctx.fillStyle = `rgba(80,180,255,${(0.35+night*0.5).toFixed(2)})`;
      ctx.fillRect(ox+sw*0.34, oy+sh*0.24, sw*0.32, sh*0.26); // vitre
      const camA = (now/2200)%(Math.PI*2);
      ctx.strokeStyle = "#8a9090"; ctx.lineWidth = Math.max(1,sw*0.028);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.18); ctx.lineTo(ox+sw*(0.5+Math.cos(camA)*0.15), oy+sh*(0.18+Math.sin(camA)*0.06)); ctx.stroke();
      ctx.fillStyle = "#4a5a6a"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(camA)*0.15), oy+sh*(0.18+Math.sin(camA)*0.06), Math.max(2,sw*0.042), 0, Math.PI*2); ctx.fill();
      const sA = 0.4+0.3*Math.sin(now/400);
      px(0.36, 0.27, 0.12, 0.07, `rgba(60,200,255,${sA.toFixed(2)})`);
      px(0.52, 0.27, 0.12, 0.07, `rgba(80,255,120,${(sA*0.8).toFixed(2)})`);
      px(0.36, 0.38, 0.28, 0.08, `rgba(255,180,40,${(sA*0.6).toFixed(2)})`);
      if (night > 0.3) {
        ctx.strokeStyle = `rgba(255,255,200,${(night*0.32).toFixed(2)})`; ctx.lineWidth = Math.max(1,sw*0.04);
        ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.16); ctx.lineTo(ox+sw*(0.5+Math.cos(camA)*0.55), oy+sh*(0.16+Math.sin(camA)*0.38)); ctx.stroke();
      }
    } else if (tier >= 1) {
      // Tour de pierre fortifiée avec créneaux
      px(0.30, 0.22, 0.40, 0.56, "#8a8070");
      px(0.26, 0.58, 0.48, 0.22, "#7a7060");
      for (let i=0; i<3; i++) px(0.30+i*0.14, 0.16, 0.09, 0.08, "#8a8070");
      ctx.fillStyle = "#1a1208"; ctx.fillRect(ox+sw*0.36, oy+sh*0.30, sw*0.07, sh*0.14); ctx.fillRect(ox+sw*0.57, oy+sh*0.30, sw*0.07, sh*0.14);
      const glow = 0.5+0.4*Math.sin(now/600);
      ctx.fillStyle = `rgba(255,200,80,${(glow*(0.5+night*0.5)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.19, sw*0.11, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#c09030"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.19, sw*0.065, 0, Math.PI*2); ctx.fill();
    } else {
      // Tour de bois avec feu de signal
      px(0.40, 0.30, 0.20, 0.50, "#6a4a20");
      px(0.28, 0.58, 0.44, 0.12, "#5a3a18");
      ctx.strokeStyle = "#5a3a18"; ctx.lineWidth = Math.max(2,sw*0.04);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.28, oy+sh*0.70); ctx.lineTo(ox+sw*0.42, oy+sh*0.30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.72, oy+sh*0.70); ctx.lineTo(ox+sw*0.58, oy+sh*0.30); ctx.stroke();
      const f1=0.5+0.5*Math.sin(now/180), f2=0.5+0.5*Math.sin(now/150+1.2);
      ctx.fillStyle = `rgba(255,80,8,${(0.65+f1*0.35).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(ox+sw*0.42, oy+sh*0.32); ctx.quadraticCurveTo(ox+sw*0.36, oy+sh*(0.17-f1*0.06), ox+sw*0.5, oy+sh*(0.11-f1*0.04)); ctx.quadraticCurveTo(ox+sw*0.64, oy+sh*(0.17-f2*0.05), ox+sw*0.58, oy+sh*0.32); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,200,20,${(0.6+f2*0.3).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(ox+sw*0.46, oy+sh*0.32); ctx.quadraticCurveTo(ox+sw*0.44, oy+sh*(0.21-f2*0.08), ox+sw*0.5, oy+sh*(0.15-f1*0.05)); ctx.quadraticCurveTo(ox+sw*0.56, oy+sh*(0.21-f2*0.06), ox+sw*0.54, oy+sh*0.32); ctx.closePath(); ctx.fill();
      if (night > 0.2) { const hg=ctx.createRadialGradient(ox+sw*0.5,oy+sh*0.22,0,ox+sw*0.5,oy+sh*0.22,sw*0.3); hg.addColorStop(0,`rgba(255,150,20,${(0.18*night).toFixed(2)})`); hg.addColorStop(1,"rgba(255,80,5,0)"); ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.22,sw*0.3,0,Math.PI*2); ctx.fill(); }
    }
    return;
  }
  if (id === "sewers") {
    // Égouts : canaux ouverts → réseau de pierres → conduites modernes
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    const band2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
    if (ei2 >= 11) {
      px(0.06, 0.44, 0.88, 0.40, "#2a3040");
      ctx.strokeStyle = "#4a5870"; ctx.lineWidth = Math.max(2,sw*0.06);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.56); ctx.lineTo(ox+sw*0.94, oy+sh*0.56); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.72); ctx.lineTo(ox+sw*0.94, oy+sh*0.72); ctx.stroke();
      for (let i=0; i<3; i++) { const vx=ox+sw*(0.25+i*0.25); ctx.fillStyle="#6a7a8a"; ctx.fillRect(vx-sw*0.04,oy+sh*0.50,sw*0.08,sh*0.14); ctx.fillStyle="#3a4858"; ctx.fillRect(vx-sw*0.016,oy+sh*0.62,sw*0.032,sh*0.10); }
      const sA=0.5+0.3*Math.sin(now/500);
      for (let i=0; i<4; i++) px(0.16+i*0.2, 0.44, 0.07, 0.04, `rgba(80,220,100,${(sA*(i%2===0?1:0.6)).toFixed(2)})`);
      const str=(now/700)%1; ctx.fillStyle=`rgba(60,180,255,${(0.4+sA*0.2).toFixed(2)})`; ctx.fillRect(ox+sw*(0.08+str*0.55),oy+sh*0.545,sw*0.28,sh*0.028);
      px(0.08, 0.32, 0.28, 0.10, "#1e2434");
      for (let i=0; i<3; i++) ctx.fillRect(ox+sw*(0.11+i*0.08), oy+sh*0.35, sw*0.05, sh*0.04);
    } else if (band2 >= 3) {
      px(0.06, 0.46, 0.88, 0.30, "#3a3020"); px(0.10, 0.56, 0.80, 0.16, "#2a2015");
      const nG=2+tier;
      for (let i=0; i<nG; i++) {
        const gx2=0.18+i*(0.64/Math.max(1,nG-1));
        px(gx2-0.042, 0.45, 0.084, 0.04, "#1a1208");
        ctx.strokeStyle="#3a3020"; ctx.lineWidth=Math.max(0.5,sw*0.013);
        for (let j=0; j<3; j++) ctx.strokeRect(ox+sw*(gx2-0.038+j*0.026),oy+sh*0.45,sw*0.026,sh*0.04);
        const ph=((now/1400)+i*0.4)%1;
        ctx.fillStyle=`rgba(190,190,170,${((1-ph)*0.14).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*gx2,oy+sh*(0.43-ph*0.22),sw*(0.035+ph*0.06),0,Math.PI*2); ctx.fill();
      }
      px(0.06, 0.60, 0.88, 0.08, "#1e3050");
      const str2=(now/900)%1; ctx.fillStyle="rgba(80,150,200,0.55)"; ctx.fillRect(ox+sw*(0.08+str2*0.60),oy+sh*0.62,sw*0.20,sh*0.04);
    } else {
      px(0.06, 0.48, 0.88, 0.32, "#4a3820");
      px(0.10, 0.54, 0.32, 0.18, "#1e2818"); px(0.58, 0.54, 0.32, 0.18, "#1e2818");
      ctx.fillStyle=`rgba(50,120,80,${(0.4+0.15*Math.sin(now/800)).toFixed(2)})`; ctx.fillRect(ox+sw*0.11,oy+sh*0.56,sw*0.30,sh*0.14); ctx.fillRect(ox+sw*0.59,oy+sh*0.56,sw*0.30,sh*0.14);
      for (let i=0; i<3; i++) { const ph=((now/1800)+i*0.35)%1; ctx.fillStyle=`rgba(100,180,120,${((1-ph)*0.25).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*(0.20+i*0.10),oy+sh*(0.60-ph*0.16),sw*(0.02+ph*0.03),0,Math.PI*2); ctx.fill(); }
    }
    return;
  }
  if (id === "bureaucracy") {
    // Bureaucratie : salle des scribes → guichets → open space moderne
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      px(0.06, 0.18, 0.88, 0.64, "#3a4050"); px(0.06, 0.12, 0.88, 0.08, "#2a3040");
      ctx.fillStyle="rgba(100,150,200,0.12)"; ctx.fillRect(ox+sw*0.10,oy+sh*0.22,sw*0.80,sh*0.56);
      ctx.strokeStyle="rgba(80,110,160,0.28)"; ctx.lineWidth=Math.max(0.5,sw*0.012);
      for (let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.10+i*0.20),oy+sh*0.22); ctx.lineTo(ox+sw*(0.10+i*0.20),oy+sh*0.78); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ox+sw*0.10,oy+sh*0.50); ctx.lineTo(ox+sw*0.90,oy+sh*0.50); ctx.stroke();
      for (let i=0; i<4; i++) { ctx.fillStyle="rgba(50,65,90,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.20+i*0.20),oy+sh*0.37,sw*0.038,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(ox+sw*(0.20+i*0.20),oy+sh*0.64,sw*0.038,0,Math.PI*2); ctx.fill(); }
      const sA=0.35+0.25*Math.sin(now/600);
      for (let i=0; i<4; i++) px(0.13+i*0.20, 0.31, 0.12, 0.06, `rgba(80,160,255,${(sA*(i%3===0?1:0.6)).toFixed(2)})`);
      px(0.36, 0.06, 0.28, 0.08, "#d4a017");
    } else if (ei2 >= 5) {
      px(0.08, 0.24, 0.84, 0.54, "#c9a84c"); px(0.06, 0.16, 0.88, 0.10, "#6a4a10");
      const nW=2+Math.min(tier,2);
      for (let i=0; i<nW; i++) {
        const wx2=0.16+i*(0.68/Math.max(1,nW-1));
        px(wx2-0.06, 0.56, 0.12, 0.04, "#b8904a");
        ctx.fillStyle="rgba(40,25,8,0.55)"; ctx.beginPath(); ctx.arc(ox+sw*wx2,oy+sh*0.49,sw*0.026,0,Math.PI*2); ctx.fill();
        px(wx2-0.04, 0.51, 0.08, 0.04, "#e8dcc0");
      }
      const stampA=0.3+0.4*Math.abs(Math.sin(now/800));
      ctx.fillStyle=`rgba(180,40,20,${stampA.toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.42,sw*0.06,0,Math.PI*2); ctx.fill();
      px(0.33, 0.12, 0.34, 0.06, "#d4a017");
      px(0.44, 0.64, 0.12, 0.18, "#2a1a08");
      for (let i=0; i<2+tier; i++) px(0.17+i*0.18, 0.32, 0.10, 0.08, litWarm);
    } else {
      px(0.08, 0.28, 0.84, 0.50, "#8a6830");
      ctx.fillStyle="#5a3e18"; ctx.beginPath(); ctx.moveTo(ox+sw*0.06,oy+sh*0.30); ctx.lineTo(ox+sw*0.5,oy+sh*0.12); ctx.lineTo(ox+sw*0.94,oy+sh*0.30); ctx.closePath(); ctx.fill();
      const nR=1+tier;
      for (let row=0; row<nR&&row<3; row++) for (let i=0; i<4; i++) { px(0.18+i*0.16,0.38+row*0.10,0.12,0.07,"#d4c090"); ctx.strokeStyle="#6a4a10"; ctx.lineWidth=Math.max(0.5,sw*0.012); ctx.beginPath(); ctx.moveTo(ox+sw*(0.19+i*0.16),oy+sh*(0.38+row*0.10)); ctx.lineTo(ox+sw*(0.19+i*0.16),oy+sh*(0.38+row*0.10+0.07)); ctx.stroke(); }
      px(0.44, 0.62, 0.12, 0.18, "#1e1006");
    }
    return;
  }
  if (id === "courthouses") {
    // Tribunaux : cercle des anciens → tribunal à colonnes → palais de justice
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    const band2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
    if (ei2 >= 11) {
      px(0.06, 0.16, 0.88, 0.66, "#d8d0b8");
      ctx.fillStyle="#c8c0a0"; ctx.beginPath(); ctx.moveTo(ox+sw*0.04,oy+sh*0.18); ctx.lineTo(ox+sw*0.5,oy+sh*0.02); ctx.lineTo(ox+sw*0.96,oy+sh*0.18); ctx.closePath(); ctx.fill();
      px(0.04, 0.15, 0.92, 0.04, "#a0906a");
      ctx.fillStyle="rgba(80,140,220,0.16)"; ctx.fillRect(ox+sw*0.28,oy+sh*0.22,sw*0.44,sh*0.44);
      ctx.strokeStyle="rgba(180,200,240,0.38)"; ctx.lineWidth=Math.max(0.5,sw*0.016);
      for (let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.28+i*0.11),oy+sh*0.22); ctx.lineTo(ox+sw*(0.28+i*0.11),oy+sh*0.66); ctx.stroke(); }
      const balA=0.12*Math.sin(now/1400);
      ctx.strokeStyle="#d4a017"; ctx.lineWidth=Math.max(1,sw*0.024);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.38,oy+sh*0.28); ctx.lineTo(ox+sw*0.62,oy+sh*0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.20); ctx.lineTo(ox+sw*0.5,oy+sh*0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.38,oy+sh*0.28); ctx.lineTo(ox+sw*0.34,oy+sh*(0.36+balA)); ctx.lineTo(ox+sw*0.42,oy+sh*(0.36+balA)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.62,oy+sh*0.28); ctx.lineTo(ox+sw*0.58,oy+sh*(0.36-balA)); ctx.lineTo(ox+sw*0.66,oy+sh*(0.36-balA)); ctx.stroke();
      const nC=4+Math.min(tier,2); for (let i=0; i<nC; i++) px(0.09+i*(0.82/Math.max(1,nC-1))-0.016,0.18,0.032,0.62,"rgba(20,15,8,0.36)");
      px(0.44, 0.70, 0.12, 0.14, "#2a1a08");
    } else if (band2 >= 2) {
      px(0.08, 0.28, 0.84, 0.50, "#d4c5a0");
      ctx.fillStyle="#b8a882"; ctx.beginPath(); ctx.moveTo(ox+sw*0.06,oy+sh*0.30); ctx.lineTo(ox+sw*0.5,oy+sh*0.10); ctx.lineTo(ox+sw*0.94,oy+sh*0.30); ctx.closePath(); ctx.fill();
      const nC=3+Math.min(tier,2); for (let i=0; i<nC; i++) px(0.13+i*(0.74/Math.max(1,nC-1))-0.018,0.30,0.036,0.44,"rgba(30,20,8,0.40)");
      const balA2=0.10*Math.sin(now/1500);
      ctx.strokeStyle="#d4a017"; ctx.lineWidth=Math.max(1,sw*0.024);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.38,oy+sh*0.20); ctx.lineTo(ox+sw*0.62,oy+sh*0.20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.14); ctx.lineTo(ox+sw*0.5,oy+sh*0.20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.38,oy+sh*0.20); ctx.lineTo(ox+sw*0.34,oy+sh*(0.28+balA2)); ctx.lineTo(ox+sw*0.42,oy+sh*(0.28+balA2)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.62,oy+sh*0.20); ctx.lineTo(ox+sw*0.58,oy+sh*(0.28-balA2)); ctx.lineTo(ox+sw*0.66,oy+sh*(0.28-balA2)); ctx.stroke();
      px(0.44, 0.62, 0.12, 0.18, "#2a1a08");
    } else {
      px(0.0, 0.48, 1.0, 0.52, "#2e2416");
      for (let i=0; i<5+tier; i++) { const a=(i/(5+tier))*Math.PI*2; ctx.fillStyle="#7a6848"; ctx.beginPath(); ctx.ellipse(ox+sw*(0.5+Math.cos(a)*0.34),oy+sh*(0.65+Math.sin(a)*0.20),sw*0.048,sh*0.038,0,0,Math.PI*2); ctx.fill(); }
      for (let i=0; i<3; i++) { const a=-Math.PI/2+(i-1)*0.8; ctx.fillStyle="rgba(40,25,8,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.20),oy+sh*(0.65+Math.sin(a)*0.12),sw*0.030,0,Math.PI*2); ctx.fill(); }
      ctx.strokeStyle="#9a7848"; ctx.lineWidth=Math.max(1,sw*0.024); ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.38); ctx.lineTo(ox+sw*0.5,oy+sh*0.65); ctx.stroke();
      ctx.fillStyle="#d4a017"; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.38,sw*0.04,0,Math.PI*2); ctx.fill();
      const f1=0.5+0.5*Math.sin(now/180);
      ctx.fillStyle=`rgba(255,120,10,${(0.5+f1*0.3).toFixed(2)})`; ctx.beginPath(); ctx.moveTo(ox+sw*0.46,oy+sh*0.65); ctx.quadraticCurveTo(ox+sw*0.42,oy+sh*(0.52-f1*0.05),ox+sw*0.5,oy+sh*(0.47-f1*0.04)); ctx.quadraticCurveTo(ox+sw*0.58,oy+sh*(0.52-f1*0.04),ox+sw*0.54,oy+sh*0.65); ctx.closePath(); ctx.fill();
    }
    return;
  }
  if (id === "public_works") {
    // Grands travaux : chantier avec outils → grue → engins modernes
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      // Engins de construction modernes
      px(0.06, 0.62, 0.88, 0.22, "#5a5040"); // sol chantier
      // Grue mécanique moderne (jaune)
      px(0.56, 0.18, 0.06, 0.54, "#d4a020"); // mât vertical
      ctx.strokeStyle = "#d4a020"; ctx.lineWidth = Math.max(2, sw * 0.04);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.59, oy+sh*0.22); ctx.lineTo(ox+sw*0.90, oy+sh*0.18); ctx.stroke(); // bras
      ctx.beginPath(); ctx.moveTo(ox+sw*0.59, oy+sh*0.22); ctx.lineTo(ox+sw*0.34, oy+sh*0.30); ctx.stroke(); // contrepoids
      const bob2 = Math.sin(now/800)*sh*0.06;
      px(0.82, 0.20, 0.05, 0.50+bob2/sh, "#3a3020"); // câble
      px(0.76, 0.64+bob2/sh, 0.18, 0.10, "#a89070"); // charge suspendue
      // Engin de terrassement (foreground)
      px(0.10, 0.66, 0.28, 0.14, "#c08020"); // bulldozer
      px(0.08, 0.72, 0.30, 0.08, "#7a6030"); // chenilles
      // Matériaux empilés
      for (let i=0; i<3; i++) px(0.16+i*0.10, 0.56, 0.08, 0.08, i%2===0?"#b8a882":"#7a6040");
    } else if (tier >= 1) {
      // Grue à poulie + échafaudages
      px(0.10, 0.62, 0.80, 0.16, "#b8a882"); // sol/fondations
      for (let i=0; i<4; i++) px(0.18+i*0.16, 0.42, 0.04, 0.32, "#6a4a10"); // piliers
      ctx.strokeStyle="#6a4a10"; ctx.lineWidth=Math.max(1,sw*0.030);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.22,oy+sh*0.40); ctx.lineTo(ox+sw*0.78,oy+sh*0.40); ctx.lineTo(ox+sw*0.64,oy+sh*0.24); ctx.stroke();
      const bob3=Math.sin(now/700)*sh*0.028;
      px(0.62, 0.26, 0.036, 0.26+bob3/sh, "#6a4a10");
      px(0.54, 0.54+bob3/sh, 0.18, 0.10, "#b8a882");
      px(0.20, 0.52, 0.18, 0.08, "#b8a882");
      // Ouvriers
      for (let i=0; i<2; i++) { ctx.fillStyle="rgba(40,25,8,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.28+i*0.22),oy+sh*0.58,sw*0.025,0,Math.PI*2); ctx.fill(); }
    } else {
      // Constructeurs primitifs avec paniers et pelles
      px(0.08, 0.58, 0.84, 0.18, "#7a6040"); // sol
      // Blocs de pierre en cours de pose
      for (let i=0; i<3; i++) px(0.14+i*0.22, 0.44, 0.18, 0.16, "#b8a882");
      // Ouvriers (silhouettes)
      for (let i=0; i<2+tier; i++) {
        ctx.fillStyle="rgba(50,30,10,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.24+i*0.20),oy+sh*0.52,sw*0.026,0,Math.PI*2); ctx.fill();
        // Outil (pelle/levier)
        ctx.strokeStyle="#5a3818"; ctx.lineWidth=Math.max(1,sw*0.018);
        ctx.beginPath(); ctx.moveTo(ox+sw*(0.24+i*0.20),oy+sh*0.48); ctx.lineTo(ox+sw*(0.30+i*0.20),oy+sh*0.60); ctx.stroke();
      }
      // Corde tendue (palan primitif)
      ctx.strokeStyle="#8a6830"; ctx.lineWidth=Math.max(1,sw*0.018);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.20,oy+sh*0.30); ctx.lineTo(ox+sw*0.78,oy+sh*0.26); ctx.lineTo(ox+sw*0.72,oy+sh*0.46); ctx.stroke();
    }
    return;
  }
  if (id === "ministries") {
    // Ministères : salle du conseil → palais → ministère moderne
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      // Tour administrative moderne
      px(0.16, 0.08, 0.68, 0.76, "#2a3040"); px(0.14, 0.04, 0.72, 0.06, "#3a4258");
      ctx.fillStyle="rgba(80,140,220,0.14)"; ctx.fillRect(ox+sw*0.20,oy+sh*0.12,sw*0.60,sh*0.66);
      ctx.strokeStyle="rgba(60,100,180,0.24)"; ctx.lineWidth=Math.max(0.5,sw*0.013);
      for (let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.20+i*0.15),oy+sh*0.12); ctx.lineTo(ox+sw*(0.20+i*0.15),oy+sh*0.78); ctx.stroke(); }
      for (let i=1; i<6; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*0.20,oy+sh*(0.12+i*0.11)); ctx.lineTo(ox+sw*0.80,oy+sh*(0.12+i*0.11)); ctx.stroke(); }
      for (let row=0; row<3+tier; row++) for (let col=0; col<4; col++) px(0.22+col*0.15, 0.16+row*0.11, 0.09, 0.06, litWarm);
      // Drapeaux
      for (const fx of [0.20, 0.76]) { ctx.strokeStyle="#6a5060"; ctx.lineWidth=Math.max(1,sw*0.016); ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy+sh*0.04); ctx.lineTo(ox+sw*fx,oy-sh*0.06); ctx.stroke(); ctx.fillStyle="#c43a3a"; ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy-sh*0.06); ctx.lineTo(ox+sw*(fx+0.06),oy-sh*0.02); ctx.lineTo(ox+sw*fx,oy+sh*0.02); ctx.closePath(); ctx.fill(); }
    } else if (ei2 >= 5) {
      // Grand palais avec colonnes et drapeaux
      px(0.06, 0.22, 0.88, 0.56, "#d4c5a0"); px(0.14, 0.14, 0.72, 0.10, "#6a4a10");
      px(0.38, 0.12, 0.24, 0.68, "#c9a84c"); // tour centrale
      const nC=4+Math.min(tier,2); for (let i=0; i<nC; i++) px(0.10+i*(0.80/Math.max(1,nC-1))-0.016,0.22,0.032,0.54,"rgba(30,20,8,0.34)");
      for (let row=0; row<3+tier; row++) for (let col=0; col<4; col++) px(0.16+col*0.18, 0.32+row*0.09, 0.08, 0.048, litWarm);
      for (const fx of [0.24, 0.70]) { ctx.strokeStyle="#6a4060"; ctx.lineWidth=Math.max(1,sw*0.018); ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy+sh*0.14); ctx.lineTo(ox+sw*fx,oy+sh*0.0); ctx.stroke(); ctx.fillStyle="#b43a2f"; ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy+sh*0.0); ctx.lineTo(ox+sw*(fx+0.07),oy+sh*0.05); ctx.lineTo(ox+sw*fx,oy+sh*0.10); ctx.closePath(); ctx.fill(); }
    } else {
      // Salle du conseil primitif : grande table ronde, sièges
      px(0.08, 0.28, 0.84, 0.52, "#8a7030");
      ctx.fillStyle="#6a4a10"; ctx.beginPath(); ctx.moveTo(ox+sw*0.06,oy+sh*0.30); ctx.lineTo(ox+sw*0.5,oy+sh*0.10); ctx.lineTo(ox+sw*0.94,oy+sh*0.30); ctx.closePath(); ctx.fill();
      // Table du conseil (ronde)
      ctx.fillStyle="#b89040"; ctx.beginPath(); ctx.ellipse(ox+sw*0.5,oy+sh*0.58,sw*0.24,sh*0.16,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#6a4a10"; ctx.beginPath(); ctx.ellipse(ox+sw*0.5,oy+sh*0.58,sw*0.16,sh*0.10,0,0,Math.PI*2); ctx.fill();
      // Conseillers assis
      for (let i=0; i<4+tier; i++) { const a=(i/(4+tier))*Math.PI*2; ctx.fillStyle="rgba(40,24,8,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.28),oy+sh*(0.58+Math.sin(a)*0.18),sw*0.026,0,Math.PI*2); ctx.fill(); }
      // Trône / siège d'honneur
      px(0.44, 0.32, 0.12, 0.14, "#d4a017");
    }
    return;
  }
  if (id === "archive_grids") {
    // Réseaux d'archives : rayonnages → salle des archives → data center
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 10) {
      // Data center : tours de serveurs, flux de données
      px(0.06, 0.16, 0.88, 0.70, "#1e2434");
      px(0.06, 0.10, 0.88, 0.08, "#2a3248");
      const nRacks = 3 + Math.min(tier, 2);
      for (let i=0; i<nRacks; i++) {
        const rx2=0.12+i*(0.76/Math.max(1,nRacks-1));
        px(rx2-0.06, 0.20, 0.12, 0.58, "#0e1624"); // rack
        px(rx2-0.055, 0.22, 0.11, 0.04, "#1a2a3a"); // unité
        const rA=0.4+0.3*Math.sin(now/400+i*1.1);
        for (let j=0; j<5; j++) px(rx2-0.04, 0.27+j*0.09, 0.08, 0.04, `rgba(${j%2===0?"80,220,100":"60,180,255"},${(rA*(0.5+j*0.1)).toFixed(2)})`);
      }
      const pulse2=0.35+Math.abs(Math.sin(now/700))*0.45;
      ctx.strokeStyle=`rgba(107,182,255,${pulse2.toFixed(2)})`; ctx.lineWidth=Math.max(1,sw*0.020);
      for (let i=0; i<nRacks-1; i++) {
        const x1=ox+sw*(0.12+i*(0.76/Math.max(1,nRacks-1))), x2=ox+sw*(0.12+(i+1)*(0.76/Math.max(1,nRacks-1)));
        ctx.beginPath(); ctx.moveTo(x1,oy+sh*0.50); ctx.lineTo(x2,oy+sh*0.50); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1,oy+sh*0.60); ctx.lineTo(x2,oy+sh*0.60); ctx.stroke();
      }
      // Antenne de transmission
      ctx.strokeStyle="#4a5870"; ctx.lineWidth=Math.max(1,sw*0.016);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.10); ctx.lineTo(ox+sw*0.5,oy); ctx.stroke();
      ctx.fillStyle=`rgba(107,182,255,${(0.5+Math.abs(Math.sin(now/600))*0.4).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.5,oy,Math.max(2,sw*0.042),0,Math.PI*2); ctx.fill();
    } else {
      // Salle des archives physiques : rangées de rayonnages
      px(0.06, 0.22, 0.88, 0.62, "#5a4828");
      ctx.fillStyle="#3a2e18"; ctx.beginPath(); ctx.moveTo(ox+sw*0.04,oy+sh*0.24); ctx.lineTo(ox+sw*0.5,oy+sh*0.08); ctx.lineTo(ox+sw*0.96,oy+sh*0.24); ctx.closePath(); ctx.fill();
      const nS=2+Math.min(tier,2);
      for (let row=0; row<nS; row++) {
        px(0.10, 0.32+row*0.14, 0.80, 0.10, "#3a2c18"); // étagère
        const spines2=["#9c3b2f","#7a5c2a","#3a6a3a","#b58f3a","#8a4a6a","#4a5a8a"];
        for (let i=0; i<6; i++) px(0.14+i*0.12, 0.33+row*0.14, 0.10, 0.08, spines2[i%spines2.length]);
      }
      // Archiviste
      ctx.fillStyle="rgba(40,24,8,0.60)"; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.70,sw*0.026,0,Math.PI*2); ctx.fill();
      px(0.42, 0.74, 0.16, 0.08, "#e0d4aa"); // document
      px(0.44, 0.64, 0.12, 0.20, "#1e1408");
    }
    return;
  }
  if (id === "ruin_architects") {
    // Architectes des ruines : vestige en ruine + architectes + plans évolutifs
    // Ruine partielle (mur effondré)
    px(0.08, 0.54, 0.84, 0.24, "#4a4030");
    px(0.12, 0.28, 0.38, 0.32, "#5a5040"); // pan de mur gauche debout
    px(0.14, 0.22, 0.34, 0.08, "#3a3428"); // sommet effondré
    // Décombres
    for (let i=0; i<3; i++) { ctx.fillStyle=["#6a5a44","#5a4a38","#4a3c2c"][i]; ctx.beginPath(); ctx.ellipse(ox+sw*(0.54+i*0.12),oy+sh*(0.60-i*0.04),sw*(0.07-i*0.01),sh*(0.05-i*0.008),i*0.4,0,Math.PI*2); ctx.fill(); }
    // Plan / blueprint lumineux
    const bpA = 0.4+0.25*Math.sin(now/700);
    px(0.52, 0.26, 0.36, 0.24, `rgba(30,60,120,${bpA.toFixed(2)})`);
    ctx.strokeStyle=`rgba(120,180,255,${(bpA*0.8).toFixed(2)})`; ctx.lineWidth=Math.max(0.5,sw*0.014);
    ctx.beginPath(); ctx.rect(ox+sw*0.54,oy+sh*0.28,sw*0.32,sh*0.20); ctx.stroke();
    for (let i=1; i<3; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.54+i*0.11),oy+sh*0.28); ctx.lineTo(ox+sw*(0.54+i*0.11),oy+sh*0.48); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(ox+sw*0.54,oy+sh*0.38); ctx.lineTo(ox+sw*0.86,oy+sh*0.38); ctx.stroke();
    // Architectes qui étudient
    const nArch=1+tier;
    for (let i=0; i<nArch&&i<3; i++) {
      ctx.fillStyle="rgba(50,35,15,0.70)"; ctx.beginPath(); ctx.arc(ox+sw*(0.18+i*0.22),oy+sh*0.52,sw*0.028,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#8a7040"; ctx.lineWidth=Math.max(0.5,sw*0.016);
      ctx.beginPath(); ctx.moveTo(ox+sw*(0.18+i*0.22),oy+sh*0.48); ctx.lineTo(ox+sw*(0.24+i*0.22),oy+sh*0.60); ctx.stroke(); // outil/règle
    }
    // Tier 2+ : échafaudages de restauration
    if (tier >= 2) {
      ctx.strokeStyle="rgba(160,120,60,0.55)"; ctx.lineWidth=Math.max(1,sw*0.022);
      for (let i=0; i<3; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.14+i*0.10),oy+sh*0.28); ctx.lineTo(ox+sw*(0.14+i*0.10),oy+sh*0.54); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12,oy+sh*0.40); ctx.lineTo(ox+sw*0.36,oy+sh*0.40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12,oy+sh*0.50); ctx.lineTo(ox+sw*0.36,oy+sh*0.50); ctx.stroke();
    }
    return;
  }
  if (id === "foragers") {
    // Sol herbe sombre
    px(0.0, 0.58, 1.0, 0.42, "#131a09");

    // === BUISSON / ARBRE (droite) ===
    const tx = 0.70, ty = 0.60;
    // Tronc
    ctx.fillStyle = "#6a3c0e";
    ctx.fillRect(ox + sw * (tx - 0.024), oy + sh * (ty - 0.1), sw * 0.048, sh * 0.2);
    // Feuillage — cercles superposés plus ou moins denses selon le tier
    const foliageCfg = tier >= 2
      ? [[tx, ty-0.3, 0.19],[tx-0.11, ty-0.22, 0.16],[tx+0.11, ty-0.22, 0.15],[tx, ty-0.15, 0.17]]
      : tier >= 1
      ? [[tx, ty-0.26, 0.18],[tx-0.1, ty-0.18, 0.15],[tx+0.09, ty-0.18, 0.14]]
      : [[tx, ty-0.22, 0.17],[tx-0.09, ty-0.15, 0.13]];
    for (const [fx, fy, fr] of foliageCfg) {
      ctx.fillStyle = "#284e14";
      ctx.beginPath(); ctx.arc(ox + sw * fx, oy + sh * fy, sw * fr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(50,100,24,0.55)";
      ctx.beginPath(); ctx.arc(ox + sw * (fx - fr * 0.22), oy + sh * (fy - fr * 0.22), sw * fr * 0.62, 0, Math.PI * 2); ctx.fill();
    }
    // Fruits/baies (points colorés dans le feuillage)
    const allFruits = [
      [tx - 0.07, ty - 0.24, "#d03808"], [tx + 0.08, ty - 0.28, "#cc5010"],
      [tx - 0.01, ty - 0.32, "#c82808"], [tx + 0.13, ty - 0.20, "#d84010"],
      [tx + 0.02, ty - 0.17, "#e04818"], [tx - 0.12, ty - 0.17, "#c03210"]
    ];
    for (let fi = 0; fi < Math.min(allFruits.length, 2 + tier * 2); fi++) {
      const [ffx, ffy, ffc] = allFruits[fi];
      ctx.fillStyle = ffc;
      ctx.beginPath(); ctx.arc(ox + sw * ffx, oy + sh * ffy, sw * 0.029, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,210,160,0.4)";
      ctx.beginPath(); ctx.arc(ox + sw * (ffx - 0.008), oy + sh * (ffy - 0.008), sw * 0.011, 0, Math.PI * 2); ctx.fill();
    }

    // === PANIER (gauche, posé au sol) ===
    const bkx = 0.2, bky = 0.72;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * (bky + 0.045), sw * 0.13, sh * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8a5520";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * bky, sw * 0.12, sh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    // Tressage (lignes horizontales)
    ctx.strokeStyle = "#6a3c10"; ctx.lineWidth = Math.max(0.5, sw * 0.018);
    for (let bi = 1; bi <= 3; bi++) {
      const by2 = bky - 0.06 + bi * 0.036;
      const bwi = 0.12 * Math.sqrt(1 - Math.pow((by2 - bky) / 0.08, 2));
      ctx.beginPath(); ctx.moveTo(ox + sw * (bkx - bwi), oy + sh * by2); ctx.lineTo(ox + sw * (bkx + bwi), oy + sh * by2); ctx.stroke();
    }
    // Rebord supérieur
    ctx.fillStyle = "#5e3210";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * (bky - 0.045), sw * 0.12, sh * 0.038, 0, Math.PI, 0); ctx.fill();
    // Fruits déjà récoltés dans le panier
    if (tier >= 1) {
      ctx.fillStyle = "#c83010"; ctx.beginPath(); ctx.arc(ox + sw * (bkx - 0.04), oy + sh * (bky - 0.04), sw * 0.026, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d04818"; ctx.beginPath(); ctx.arc(ox + sw * (bkx + 0.03), oy + sh * (bky - 0.05), sw * 0.023, 0, Math.PI * 2); ctx.fill();
    }

    // === PERSONNAGE — bras animé en train de cueillir ===
    const pick = (now / 680) % (Math.PI * 2);
    const reach = 0.45 + 0.55 * Math.abs(Math.sin(pick));
    const px2 = 0.43, py2 = 0.50;
    // Ombre au sol
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(ox + sw * px2, oy + sh * (py2 + 0.2), sw * 0.07, sh * 0.028, 0, 0, Math.PI * 2); ctx.fill();
    // Jambes
    ctx.fillStyle = "#3a2614"; ctx.fillRect(ox + sw * (px2 - 0.032), oy + sh * (py2 + 0.06), sw * 0.062, sh * 0.14);
    // Corps
    ctx.fillStyle = "#5a3c1a"; ctx.fillRect(ox + sw * (px2 - 0.036), oy + sh * (py2 - 0.06), sw * 0.072, sh * 0.12);
    // Tête
    ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * px2, oy + sh * (py2 - 0.1), sw * 0.05, 0, Math.PI * 2); ctx.fill();
    // Bras tendu vers le buisson
    const aex = px2 + 0.08 + reach * 0.16, aey = py2 - 0.08 - reach * 0.09;
    ctx.strokeStyle = "#5a3c1a"; ctx.lineWidth = Math.max(1.5, sw * 0.042); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox + sw * (px2 + 0.032), oy + sh * (py2 - 0.02)); ctx.lineTo(ox + sw * aex, oy + sh * aey); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * aex, oy + sh * aey, sw * 0.032, 0, Math.PI * 2); ctx.fill();

    // Tier 2 : second cueilleur près du buisson
    if (tier >= 2) {
      const px3 = 0.54, py3 = 0.64;
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(ox + sw * px3, oy + sh * (py3 + 0.14), sw * 0.06, sh * 0.025, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2e1c0e"; ctx.fillRect(ox + sw * (px3 - 0.028), oy + sh * (py3 + 0.05), sw * 0.056, sh * 0.1);
      ctx.fillStyle = "#4a3014"; ctx.fillRect(ox + sw * (px3 - 0.032), oy + sh * (py3 - 0.04), sw * 0.064, sh * 0.1);
      ctx.fillStyle = "#b87848"; ctx.beginPath(); ctx.arc(ox + sw * px3, oy + sh * (py3 - 0.07), sw * 0.044, 0, Math.PI * 2); ctx.fill();
      const pick2 = (now / 620 + 1.8) % (Math.PI * 2);
      const reach2 = 0.4 + 0.5 * Math.abs(Math.sin(pick2));
      const ae2x = px3 + 0.06 + reach2 * 0.12, ae2y = py3 - 0.07 - reach2 * 0.08;
      ctx.strokeStyle = "#4a3014"; ctx.lineWidth = Math.max(1.5, sw * 0.038); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * (px3 + 0.028), oy + sh * (py3 - 0.01)); ctx.lineTo(ox + sw * ae2x, oy + sh * ae2y); ctx.stroke();
      ctx.lineCap = "square";
      ctx.fillStyle = "#b87848"; ctx.beginPath(); ctx.arc(ox + sw * ae2x, oy + sh * ae2y, sw * 0.028, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  if (id === "granaries_city") {
    px(0.12, 0.42, 0.76, 0.32, "#c9a84c");
    ctx.fillStyle = "#d8bd68";
    ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.43, sw * 0.38, sh * 0.16, 0, Math.PI, 0); ctx.fill();
    px(0.25, 0.57, 0.12, 0.17, "#6a4a10");
    px(0.63, 0.57, 0.12, 0.17, "#6a4a10");
    if (tier >= 1) strokeRect(0.08, 0.36, 0.84, 0.42, "#6a4a10");
    return;
  }
  if (id === "caravans") {
    // ── CHARRETTE MARCHANDE À L'ARRÊT ────────────────────────────────
    const cx2 = 0.5, cy2 = 0.5;
    // Ombre portée
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.02), oy+sh*(cy2+0.24), sw*0.3, sh*0.07, 0, 0, Math.PI*2); ctx.fill();
    // Timon (avant, part vers la gauche)
    ctx.strokeStyle = "#7a4a18"; ctx.lineWidth = Math.max(1.5, sw*0.032); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox+sw*(cx2-0.22), oy+sh*(cy2+0.06)); ctx.lineTo(ox+sw*(cx2-0.4), oy+sh*(cy2-0.02)); ctx.stroke();
    ctx.lineCap = "square";
    // Plancher de la charrette
    ctx.fillStyle = "#7a5018"; ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2-0.04), sw*0.44, sh*0.18);
    // Planches (texture bois)
    ctx.strokeStyle = "rgba(50,28,6,0.3)"; ctx.lineWidth = Math.max(0.5, sw*0.016);
    for (let pi = 1; pi < 4; pi++) ctx.strokeRect(ox+sw*(cx2-0.20+pi*0.09), oy+sh*(cy2-0.03), sw*0.08, sh*0.16);
    // Ridelles et montants
    ctx.fillStyle = "#5a3a0c";
    ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2-0.04), sw*0.44, sh*0.02);
    ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2+0.12), sw*0.44, sh*0.02);
    ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2-0.04), sw*0.02, sh*0.18);
    ctx.fillRect(ox+sw*(cx2+0.20), oy+sh*(cy2-0.04), sw*0.02, sh*0.18);
    // Bâche (toile de couverture bombée)
    ctx.fillStyle = "#c8a840";
    ctx.beginPath();
    ctx.moveTo(ox+sw*(cx2-0.19), oy+sh*(cy2-0.04));
    ctx.bezierCurveTo(ox+sw*(cx2-0.19), oy+sh*(cy2-0.22), ox+sw*(cx2+0.19), oy+sh*(cy2-0.22), ox+sw*(cx2+0.19), oy+sh*(cy2-0.04));
    ctx.closePath(); ctx.fill();
    // Plis de la bâche
    ctx.strokeStyle = "rgba(155,120,25,0.48)"; ctx.lineWidth = Math.max(0.5, sw*0.02);
    for (let bi = -1; bi <= 1; bi++) {
      const bpx = cx2 + bi * 0.1;
      ctx.beginPath(); ctx.moveTo(ox+sw*bpx, oy+sh*(cy2-0.04)); ctx.quadraticCurveTo(ox+sw*(bpx+0.015), oy+sh*(cy2-0.16), ox+sw*bpx, oy+sh*(cy2-0.22)); ctx.stroke();
    }
    // Grandes roues (vue de côté légèrement inclinée)
    for (const wrx of [cx2-0.17, cx2+0.17]) {
      ctx.fillStyle = "#2a1606";
      ctx.beginPath(); ctx.ellipse(ox+sw*wrx, oy+sh*(cy2+0.2), sw*0.065, sh*0.046, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#5a3210"; ctx.lineWidth = Math.max(0.5, sw*0.015);
      for (let ri = 0; ri < 4; ri++) {
        const ra = ri * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(ox+sw*wrx, oy+sh*(cy2+0.2)); ctx.lineTo(ox+sw*(wrx+Math.cos(ra)*0.06), oy+sh*(cy2+0.2+Math.sin(ra)*0.042)); ctx.stroke();
      }
      ctx.strokeStyle = "#4a2808"; ctx.lineWidth = Math.max(1, sw*0.022);
      ctx.beginPath(); ctx.ellipse(ox+sw*wrx, oy+sh*(cy2+0.2), sw*0.065, sh*0.046, 0, 0, Math.PI*2); ctx.stroke();
    }
    // Marchandises et barils à côté (tier 1+)
    if (tier >= 1) {
      // Baril
      ctx.fillStyle = "#6a3c10";
      ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.34), oy+sh*(cy2+0.12), sw*0.058, sh*0.048, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#8a5020";
      ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.34), oy+sh*(cy2+0.07), sw*0.058, sh*0.025, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#4a2808"; ctx.lineWidth = Math.max(0.5, sw*0.016);
      ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.34), oy+sh*(cy2+0.12), sw*0.058, sh*0.048, 0, 0, Math.PI*2); ctx.stroke();
      // Caisse
      ctx.fillStyle = "#9a6828"; ctx.fillRect(ox+sw*(cx2-0.42), oy+sh*(cy2+0.08), sw*0.1, sh*0.09);
      ctx.fillStyle = "#7a5018"; ctx.fillRect(ox+sw*(cx2-0.42), oy+sh*(cy2), sw*0.1, sh*0.09);
      ctx.strokeStyle = "rgba(50,28,8,0.45)"; ctx.lineWidth = Math.max(0.5, sw*0.014);
      ctx.strokeRect(ox+sw*(cx2-0.42), oy+sh*(cy2+0.08), sw*0.1, sh*0.09);
      ctx.strokeRect(ox+sw*(cx2-0.42), oy+sh*(cy2), sw*0.1, sh*0.09);
    }
    return;
  }
  if (id === "markets") {
    // ── ÉTALS DE MARCHÉ ──────────────────────────────────────────────
    const stallColors = ["#c03828","#2a6888","#d4a018","#386830"];
    const goodColors  = ["#e05030","#f0c040","#60a840","#e8804a","#9060c0","#e8e080"];
    const nStalls = tier >= 2 ? 4 : tier >= 1 ? 3 : 2;
    const cols = nStalls <= 2 ? 2 : 2;
    const rows = nStalls <= 2 ? 1 : 2;
    for (let si = 0; si < nStalls; si++) {
      const col = si % cols, row = Math.floor(si / cols);
      const sx2 = 0.1 + col * 0.48, sy2 = 0.14 + row * 0.46;
      // Table/comptoir
      ctx.fillStyle = "#7a5020"; ctx.fillRect(ox+sw*sx2, oy+sh*(sy2+0.18), sw*0.38, sh*0.16);
      ctx.fillStyle = "#9a6830"; ctx.fillRect(ox+sw*sx2, oy+sh*(sy2+0.18), sw*0.38, sh*0.04);
      // Auvent (canopée colorée, légère avancée)
      ctx.fillStyle = stallColors[si % stallColors.length];
      ctx.fillRect(ox+sw*(sx2-0.02), oy+sh*sy2, sw*0.42, sh*0.12);
      // Rayures sur l'auvent
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      for (let ri2 = 0; ri2 < 3; ri2++) ctx.fillRect(ox+sw*(sx2+ri2*0.12), oy+sh*sy2, sw*0.04, sh*0.12);
      // Ombre sous l'auvent
      ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(ox+sw*sx2, oy+sh*(sy2+0.12), sw*0.38, sh*0.04);
      // Marchandises sur le comptoir
      for (let gi = 0; gi < 4; gi++) {
        const gx2 = sx2 + 0.04 + gi * 0.08;
        ctx.fillStyle = goodColors[(si * 3 + gi) % goodColors.length];
        ctx.beginPath(); ctx.arc(ox+sw*(gx2+0.02), oy+sh*(sy2+0.22), sw*0.03, 0, Math.PI*2); ctx.fill();
      }
      // Vendeur (silhouette derrière le comptoir)
      ctx.fillStyle = "#4a3018";
      ctx.fillRect(ox+sw*(sx2+0.15), oy+sh*(sy2+0.34), sw*0.08, sh*0.1);
      ctx.fillStyle = "#c49060";
      ctx.beginPath(); ctx.arc(ox+sw*(sx2+0.19), oy+sh*(sy2+0.32), sw*0.04, 0, Math.PI*2); ctx.fill();
    }
    return;
  }
  if (id === "guilds") {
    // ── QG MILITAIRE / RELIGIEUX ──────────────────────────────────────
    // Corps principal (pierre massive)
    ctx.fillStyle = "#8a7860"; ctx.fillRect(ox+sw*0.12, oy+sh*0.26, sw*0.76, sh*0.6);
    // Ombre côté droit
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(ox+sw*0.72, oy+sh*0.26, sw*0.16, sh*0.6);
    // Tours d'angle
    ctx.fillStyle = "#7a6850";
    ctx.fillRect(ox+sw*0.08, oy+sh*0.2, sw*0.2, sh*0.66);
    ctx.fillRect(ox+sw*0.72, oy+sh*0.2, sw*0.2, sh*0.66);
    // Créneaux sur les tours
    ctx.fillStyle = "#6a5840";
    for (let ci = 0; ci < 3; ci++) {
      ctx.fillRect(ox+sw*(0.09+ci*0.055), oy+sh*0.16, sw*0.035, sh*0.07);
      ctx.fillRect(ox+sw*(0.73+ci*0.055), oy+sh*0.16, sw*0.035, sh*0.07);
    }
    // Mâchicoulis du corps principal
    ctx.fillStyle = "#6a5840"; ctx.fillRect(ox+sw*0.12, oy+sh*0.22, sw*0.76, sh*0.055);
    for (let ci = 0; ci < 5; ci++) ctx.fillRect(ox+sw*(0.16+ci*0.14), oy+sh*0.18, sw*0.06, sh*0.06);
    // Grande porte à arc en plein cintre
    ctx.fillStyle = "rgba(15,10,4,0.75)";
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.62, sw*0.1, Math.PI, 0); ctx.fill();
    ctx.fillRect(ox+sw*0.4, oy+sh*0.62, sw*0.2, sh*0.24);
    ctx.fillStyle = "#5a4030"; // herse/portail
    ctx.fillRect(ox+sw*0.42, oy+sh*0.64, sw*0.16, sh*0.14);
    ctx.strokeStyle = "rgba(80,55,20,0.6)"; ctx.lineWidth = Math.max(0.5, sw*0.02);
    for (let gi = 0; gi < 3; gi++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.44+gi*0.06), oy+sh*0.64); ctx.lineTo(ox+sw*(0.44+gi*0.06), oy+sh*0.78); ctx.stroke(); }
    // Fenêtres à meurtrières
    ctx.fillStyle = litWarm;
    ctx.fillRect(ox+sw*0.22, oy+sh*0.42, sw*0.06, sh*0.1);
    ctx.fillRect(ox+sw*0.72, oy+sh*0.42, sw*0.06, sh*0.1);
    ctx.fillRect(ox+sw*0.26, oy+sh*0.56, sw*0.05, sh*0.08);
    ctx.fillRect(ox+sw*0.69, oy+sh*0.56, sw*0.05, sh*0.08);
    // Croix / emblème sur le corps
    ctx.fillStyle = tier >= 2 ? "#c0a030" : "#9a8060";
    ctx.fillRect(ox+sw*0.47, oy+sh*0.3, sw*0.06, sh*0.18); // vertical
    ctx.fillRect(ox+sw*0.4, oy+sh*0.38, sw*0.2, sh*0.06);  // horizontal
    // Bannière
    ctx.fillStyle = "#a02020"; ctx.fillRect(ox+sw*0.46, oy+sh*0.12, sw*0.16, sh*0.1);
    ctx.strokeStyle = "#7a1010"; ctx.lineWidth = Math.max(0.5, sw*0.016);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.46, oy+sh*0.08); ctx.lineTo(ox+sw*0.46, oy+sh*0.22); ctx.stroke();
    return;
  }
  if (id === "irrigated_fields") {
    // ── CHAMPS IRRIGUÉS + ANIMATION D'ARROSAGE ───────────────────────
    const nRows = 4 + tier;
    // Rangées de cultures (alternance vert clair/foncé)
    for (let ri = 0; ri < nRows; ri++) {
      const fy = 0.1 + ri * (0.8 / nRows), fh = 0.8 / nRows * 0.82;
      ctx.fillStyle = ri % 2 === 0 ? "#4a7c28" : "#3c6820";
      ctx.fillRect(ox+sw*0.1, oy+sh*fy, sw*0.8, sh*fh);
      // Sillons (petits traits dans chaque rangée)
      ctx.strokeStyle = "rgba(28,50,12,0.3)"; ctx.lineWidth = Math.max(0.5, sw*0.012);
      for (let si2 = 1; si2 < 4; si2++) ctx.strokeRect(ox+sw*(0.12+si2*0.17), oy+sh*(fy+0.01), sw*0.15, sh*(fh-0.02));
    }
    // Canal vertical central (eau)
    ctx.fillStyle = "#2a5a8a"; ctx.fillRect(ox+sw*0.47, oy+sh*0.08, sw*0.06, sh*0.84);
    // Canal horizontal central
    ctx.fillStyle = "#2a5a8a"; ctx.fillRect(ox+sw*0.1, oy+sh*0.47, sw*0.8, sh*0.05);
    // Reflets d'eau animés sur les canaux
    ctx.fillStyle = "rgba(120,190,255,0.35)";
    ctx.fillRect(ox+sw*0.485, oy+sh*0.08, sw*0.03, sh*0.84);
    ctx.fillRect(ox+sw*0.1, oy+sh*0.476, sw*0.8, sh*0.022);
    // Animation : gouttelettes / vaguelettes qui se déplacent sur les canaux
    const waterFlow = (now / 600) % 1;
    ctx.fillStyle = "rgba(160,220,255,0.55)";
    for (let di = 0; di < 4; di++) {
      const dropY = ((waterFlow + di * 0.25) % 1);
      ctx.beginPath(); ctx.ellipse(ox+sw*0.5, oy+sh*(0.1+dropY*0.8), sw*0.018, sh*0.014, 0, 0, Math.PI*2); ctx.fill();
    }
    // Gouttelettes horizontales
    const flowH = (now / 700) % 1;
    for (let di = 0; di < 3; di++) {
      const dropX = ((flowH + di * 0.33) % 1);
      ctx.beginPath(); ctx.ellipse(ox+sw*(0.12+dropX*0.76), oy+sh*0.495, sw*0.014, sh*0.018, 0, 0, Math.PI*2); ctx.fill();
    }
    // Puits / vanne d'irrigation (coin)
    px(0.72, 0.08, 0.18, 0.16, "#6a4a1a");
    ctx.fillStyle = "#8a6428"; ctx.beginPath(); ctx.arc(ox+sw*0.81, oy+sh*0.16, sw*0.06, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#5a3810"; ctx.lineWidth = Math.max(1, sw*0.025);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.81, oy+sh*0.1); ctx.lineTo(ox+sw*0.81, oy+sh*0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox+sw*0.75, oy+sh*0.16); ctx.lineTo(ox+sw*0.87, oy+sh*0.16); ctx.stroke();
    return;
  }
  if (id === "river_ports") {
    px(0.1, 0.54, 0.8, 0.16, "#6a4a10");
    for (let i = 0; i < 5; i += 1) px(0.16 + i * 0.14, 0.42, 0.035, 0.34, "#5a3a10");
    ctx.fillStyle = "#5a4326";
    ctx.beginPath();
    ctx.moveTo(ox + sw * 0.38, oy + sh * 0.72); ctx.lineTo(ox + sw * 0.7, oy + sh * 0.72);
    ctx.lineTo(ox + sw * 0.62, oy + sh * 0.82); ctx.lineTo(ox + sw * 0.44, oy + sh * 0.82);
    ctx.closePath(); ctx.fill();
    px(0.54, 0.4, 0.035, 0.32, "#e8d5b0");
    ctx.fillStyle = "#e8d5b0";
    ctx.beginPath(); ctx.moveTo(ox + sw * 0.58, oy + sh * 0.43); ctx.lineTo(ox + sw * 0.72, oy + sh * 0.62); ctx.lineTo(ox + sw * 0.58, oy + sh * 0.66); ctx.closePath(); ctx.fill();
    return;
  }
  if (id === "water_mills") {
    px(0.06, 0.62, 0.86, 0.12, "#6a4a10");
    px(0.12, 0.72, 0.76, 0.05, "#5a3a10");
    px(0.16, 0.22, 0.36, 0.42, "#8b6914");
    ctx.fillStyle = "#5a3a10";
    ctx.beginPath(); ctx.moveTo(ox + sw * 0.12, oy + sh * 0.25); ctx.lineTo(ox + sw * 0.34, oy + sh * 0.06); ctx.lineTo(ox + sw * 0.56, oy + sh * 0.25); ctx.closePath(); ctx.fill();
    px(0.26, 0.43, 0.1, 0.18, "#2a1a0c");
    const cx = ox + sw * 0.68, cy = oy + sh * 0.68, rr = Math.min(sw, sh) * 0.24;
    ctx.strokeStyle = "#5a3a10"; ctx.lineWidth = Math.max(1, sw * 0.04);
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#7a5418";
    for (let i = 0; i < 6; i += 1) {
      const a = now / 450 + i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.stroke();
    }
    return;
  }
  if (id === "mint_houses") {
    // ── HÔTEL DES MONNAIES — coffres, pièces, balances ───────────────
    // Bâtiment sécurisé (murs épais, pierre)
    ctx.fillStyle = "#a89060"; ctx.fillRect(ox+sw*0.14, oy+sh*0.24, sw*0.72, sh*0.6);
    ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(ox+sw*0.7, oy+sh*0.24, sw*0.16, sh*0.6);
    // Toit mansardé (banque classique)
    ctx.fillStyle = "#6a5838"; ctx.fillRect(ox+sw*0.1, oy+sh*0.18, sw*0.8, sh*0.1);
    ctx.fillStyle = "#504430";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*0.28); ctx.lineTo(ox+sw*0.5, oy+sh*0.1); ctx.lineTo(ox+sw*0.92, oy+sh*0.28); ctx.lineTo(ox+sw*0.86, oy+sh*0.22); ctx.lineTo(ox+sw*0.5, oy+sh*0.14); ctx.lineTo(ox+sw*0.14, oy+sh*0.22); ctx.closePath(); ctx.fill();
    // Grilles de fenêtres (sécurité)
    ctx.fillStyle = litGold;
    ctx.fillRect(ox+sw*0.22, oy+sh*0.38, sw*0.14, sh*0.11);
    ctx.fillRect(ox+sw*0.64, oy+sh*0.38, sw*0.14, sh*0.11);
    ctx.strokeStyle = "rgba(60,40,10,0.6)"; ctx.lineWidth = Math.max(0.5, sw*0.018);
    for (const gx2 of [0.22, 0.64]) {
      ctx.strokeRect(ox+sw*gx2, oy+sh*0.38, sw*0.14, sh*0.11);
      ctx.beginPath(); ctx.moveTo(ox+sw*(gx2+0.07), oy+sh*0.38); ctx.lineTo(ox+sw*(gx2+0.07), oy+sh*0.49); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*gx2, oy+sh*0.445); ctx.lineTo(ox+sw*(gx2+0.14), oy+sh*0.445); ctx.stroke();
    }
    // Porte de coffre (centrale, ronde)
    ctx.fillStyle = "#4a3818"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.68, sw*0.1, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#c8a030"; ctx.lineWidth = Math.max(1.5, sw*0.03);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.68, sw*0.1, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = "#a07820"; ctx.lineWidth = Math.max(1, sw*0.022);
    for (let ri = 0; ri < 4; ri++) {
      const ra = ri * Math.PI/4;
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.68); ctx.lineTo(ox+sw*(0.5+Math.cos(ra)*0.09), oy+sh*(0.68+Math.sin(ra)*0.09)); ctx.stroke();
    }
    ctx.fillStyle = "#d4a828"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.68, sw*0.04, 0, Math.PI*2); ctx.fill();
    // Pièces d'or animées (sortent du toit en fumée d'activité)
    for (let k = 0; k < 2 + tier; k++) {
      const ph = ((now / 1400 + k * 0.38) % 1);
      const coinX = ox + sw*(0.34 + k*0.14);
      const coinY = oy + sh*(0.18 - ph*0.15);
      ctx.fillStyle = `rgba(210,165,20,${(Math.sin(ph*Math.PI)*0.85).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(coinX, coinY, Math.max(1.5, sw*0.036), 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = `rgba(160,110,10,${(Math.sin(ph*Math.PI)*0.6).toFixed(2)})`;
      ctx.lineWidth = Math.max(0.5, sw*0.012);
      ctx.beginPath(); ctx.arc(coinX, coinY, Math.max(1.5, sw*0.036), 0, Math.PI*2); ctx.stroke();
    }
    // Balance (symbole sur le fronton)
    ctx.fillStyle = "#c8a030"; ctx.fillRect(ox+sw*0.47, oy+sh*0.14, sw*0.06, sh*0.07);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.38, oy+sh*0.16); ctx.lineTo(ox+sw*0.62, oy+sh*0.16); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox+sw*0.38, oy+sh*0.19, sw*0.04, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox+sw*0.62, oy+sh*0.19, sw*0.04, 0, Math.PI); ctx.stroke();
    return;
  }
  if (id === "imperial_exchanges") {
    // ── GRANDE BANQUE NÉOCLASSIQUE (style Banque de France / FMI) ────
    // Escalier monumental
    const nSteps = 4;
    for (let si = nSteps; si >= 0; si--) {
      const sw2 = 0.1 + (si/nSteps)*0.8, sh2 = 0.04;
      ctx.fillStyle = si%2===0 ? "#d8d0b0" : "#e8e0c0";
      ctx.fillRect(ox+sw*(0.5-sw2/2), oy+sh*(0.76-si*sh2), sw*sw2, sh*(sh2+0.005));
    }
    const podY = 0.6;
    // Corps principal (marbre / pierre de taille)
    ctx.fillStyle = "#d4c898"; ctx.fillRect(ox+sw*0.06, oy+sh*podY, sw*0.88, sh*0.28);
    ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(ox+sw*0.78, oy+sh*podY, sw*0.16, sh*0.28);
    // Colonnes (proportionnelles au tier)
    const nCols = 6 + Math.min(4, tier * 2);
    ctx.fillStyle = "#e8e0c0";
    for (let ci = 0; ci < nCols; ci++) {
      const cx2 = ox + sw*(0.1 + ci*(0.8/(nCols-1)));
      ctx.fillRect(cx2 - sw*0.02, oy+sh*podY, sw*0.04, sh*0.28);
      ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(cx2+sw*0.01, oy+sh*podY, sw*0.012, sh*0.28);
      ctx.fillStyle = "#e8e0c0";
      // Chapiteau
      ctx.fillRect(cx2-sw*0.032, oy+sh*podY, sw*0.064, sh*0.026);
    }
    // Architrave
    ctx.fillStyle = "#b8b090"; ctx.fillRect(ox+sw*0.06, oy+sh*podY, sw*0.88, sh*0.03);
    // Frise
    ctx.fillStyle = "#c8c0a0"; ctx.fillRect(ox+sw*0.06, oy+sh*(podY-0.05), sw*0.88, sh*0.05);
    for (let fi = 0; fi < 8; fi++) {
      ctx.fillStyle = fi%2===0 ? "rgba(120,100,50,0.5)" : "rgba(200,180,100,0.4)";
      ctx.fillRect(ox+sw*(0.08+fi*0.11), oy+sh*(podY-0.048), sw*0.075, sh*0.045);
    }
    // Grand fronton triangulaire
    const frontH = 0.14;
    ctx.fillStyle = "#9a9070";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*(podY-0.05)); ctx.lineTo(ox+sw*0.5, oy+sh*(podY-0.05-frontH)); ctx.lineTo(ox+sw*0.94, oy+sh*(podY-0.05)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b0a880";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.1, oy+sh*(podY-0.05)); ctx.lineTo(ox+sw*0.5, oy+sh*(podY-0.05-frontH+0.02)); ctx.lineTo(ox+sw*0.9, oy+sh*(podY-0.05)); ctx.closePath(); ctx.fill();
    // Acrotères + ornements
    ctx.fillStyle = "#c8b858";
    for (const ax of [0.06, 0.5, 0.94]) {
      const ay = ax===0.5 ? podY-0.05-frontH : podY-0.05;
      ctx.beginPath(); ctx.moveTo(ox+sw*(ax-0.024), oy+sh*ay); ctx.lineTo(ox+sw*ax, oy+sh*(ay-0.048)); ctx.lineTo(ox+sw*(ax+0.024), oy+sh*ay); ctx.closePath(); ctx.fill();
    }
    // Dôme central (tiers élevés)
    if (tier >= 2) {
      const domeX = ox+sw*0.5, domeY = oy+sh*(podY-0.05-frontH);
      ctx.fillStyle = "#c0b870"; ctx.beginPath(); ctx.arc(domeX, domeY, sw*0.08, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#e8d880"; ctx.beginPath(); ctx.arc(domeX-sw*0.02, domeY-sh*0.02, sw*0.035, Math.PI*1.1, Math.PI*1.9); ctx.fill();
      ctx.strokeStyle = "#9a8840"; ctx.lineWidth = Math.max(0.5, sw*0.018);
      ctx.beginPath(); ctx.moveTo(domeX, domeY-sw*0.08); ctx.lineTo(domeX, domeY-sw*0.13); ctx.stroke();
    }
    // Grandes portes + fenêtres hautes
    ctx.fillStyle = "rgba(15,12,6,0.7)"; ctx.fillRect(ox+sw*0.42, oy+sh*(podY+0.14), sw*0.16, sh*0.14);
    ctx.fillStyle = litGold;
    for (let wi = 0; wi < 4; wi++) ctx.fillRect(ox+sw*(0.14+wi*0.18), oy+sh*(podY+0.05), sw*0.08, sh*0.1);
    return;
  }
}

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

  // Anim de construction (apparition 0.5s).
  const born = CM.born[t.key] || now;
  const appearMs = t.type === "engine" ? 800 : 500;
  const prog = Math.max(0, Math.min(1, (now - born) / appearMs));
  let e = prog * prog * (3 - 2 * prog); // smoothstep
  if (t.type === "engine" && prog < 1) e *= 1 + Math.sin(prog * Math.PI) * 0.08;
  const inset = (1 - e) * Math.min(boxW, boxH) * 0.5;
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
      const fx = x + w / 2, fy = y + h * 0.55, fr = w * 0.42 * fl;
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      g.addColorStop(0, "rgba(255,228,120," + fl.toFixed(2) + ")");
      g.addColorStop(0.5, "rgba(240,120,30," + (fl * 0.8).toFixed(2) + ")");
      g.addColorStop(1, "rgba(180,40,20,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
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
