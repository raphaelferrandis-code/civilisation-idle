"use strict";

/* ============================================================================
 * citymap-render-ground.js - Rendu du fond de carte Canvas.
 *   Sol, masse urbaine, fleuve, foret, vestiges et voile nocturne.
 * ============================================================================ */

const CITY_MAP_GREENS = ["#2d5a1b", "#3a6b22", "#4a7a2a", "#255018", "#1e4010", "#3d7220", "#5a8c2e", "#223d14"];

function cityMapDrawUrbanMass(layout) {
  if (!layout || layout.counts.eraBand < 2) return;
  const ctx = CM.ctx;
  const worldCx = layout.cx * CM.TILE;
  const worldCy = layout.cy * CM.TILE;
  const rx = Math.min(layout.gridN * CM.TILE * 0.49, (6 + layout.counts.eraIndex * 3.8 + layout.counts.urbanTier * 7) * CM.TILE);
  const ry = rx * 0.78;
  const sx = (worldCx - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (worldCy - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, rx * CM.cam.zoom));
  g.addColorStop(0, "rgba(54,42,24,0.68)");
  g.addColorStop(0.58, "rgba(42,33,20,0.42)");
  g.addColorStop(1, "rgba(42,33,20,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx * CM.cam.zoom, ry * CM.cam.zoom, 0, 0, Math.PI * 2);
  ctx.fill();
}

function cityMapDrawGround(layout) {
  const ctx = CM.ctx;
  const tier = layout?.counts?.eraIndex || 0;
  ctx.fillStyle = "#2d3a1e";
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (!layout || layout.counts.eraBand <= 1) return;
  const sx = (layout.cx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (layout.cy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const radius = (10 + tier * 12) * CM.TILE * CM.cam.zoom;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, radius));
  g.addColorStop(0, "rgba(72,58,33,0.58)");
  g.addColorStop(0.45, "rgba(54,44,28,0.36)");
  g.addColorStop(1, "rgba(45,58,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
}

function cityMapDrawVestiges() {
  if (!Array.isArray(state.vestiges) || !state.vestiges.length) return;
  const ctx = CM.ctx, s = CM.TILE * CM.cam.zoom;
  for (let v = 0; v < state.vestiges.length; v += 1) {
    const ves = state.vestiges[v];
    if (!ves || !ves.ruins) continue;
    const off = (CM.gridN - (ves.gridN || CM.gridN)) / 2;
    ctx.globalAlpha = 0.16 + v * 0.05;
    ctx.fillStyle = "#1a1510";
    for (const c of ves.ruins) {
      const gx = c.x + off, gy = c.y + off;
      const sx = (gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
      const sy = (gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
      if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
      ctx.fillRect(sx + s * 0.2, sy + s * 0.2, s * 0.6, s * 0.6);
    }
  }
  ctx.globalAlpha = 1;
}

function cityMapDrawRiver(now) {
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const sm = L.river.samples;
  const SX = (gx) => (gx * T - CM.cam.x) * z + CM.cw / 2;
  const SY = (gy) => (gy * T - CM.cam.y) * z + CM.ch / 2;

  const tw = state.timeWear || 0;
  const collapsed = CM.collapseAt ? true : false;
  let edge, mid, refA;
  if (collapsed) { edge = "#0a1a0a"; mid = "#0a1a0a"; refA = 0; }
  else if (tw > 0.7) { edge = "#142a1e"; mid = "#1a3a2a"; refA = 0.05; }
  else { edge = "#1a3a5c"; mid = "#2a5a8b"; refA = 0.16; }

  const normalAt = (i) => {
    const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1;
    return { nx: -ty / tl, ny: tx / tl };
  };
  const ribbon = (mult, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < sm.length; i += 1) { const n = normalAt(i); const x = SX(sm[i].x + n.nx * sm[i].hw * mult), y = SY(sm[i].y + n.ny * sm[i].hw * mult); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for (let i = sm.length - 1; i >= 0; i -= 1) { const n = normalAt(i); ctx.lineTo(SX(sm[i].x - n.nx * sm[i].hw * mult), SY(sm[i].y - n.ny * sm[i].hw * mult)); }
    ctx.closePath(); ctx.fill();
  };
  ribbon(1, edge);
  ribbon(0.55, mid);

  if (!collapsed) {
    ctx.strokeStyle = `rgba(255,255,255,${(refA * 0.6).toFixed(3)})`; ctx.lineWidth = 1;
    for (let w2 = 0; w2 < 3; w2 += 1) {
      ctx.beginPath();
      for (let i = 0; i < sm.length; i += 1) {
        const n = normalAt(i);
        const off = (w2 - 1) * sm[i].hw * 0.45 + Math.sin(i * 0.5 + (now || 0) / 650 + w2 * 2) * sm[i].hw * 0.25;
        const x = SX(sm[i].x + n.nx * off), y = SY(sm[i].y + n.ny * off);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 9; i += 1) {
      const t = (((now || 0) / 1000 * (0.03 + (i % 3) * 0.015)) + i * 0.11) % 1;
      const idx = Math.floor(t * (sm.length - 1));
      const flick = 0.4 + 0.6 * Math.abs(Math.sin((now || 0) / 320 + i * 1.7));
      ctx.fillStyle = `rgba(255,255,255,${(refA * flick).toFixed(3)})`;
      ctx.fillRect(SX(sm[idx].x) - 1, SY(sm[idx].y) - 1, Math.max(2, 2.6 * z), Math.max(2, 2.6 * z));
    }
  }

  const reedOk = tw < 0.7 && !collapsed;
  for (const k of L.river.banks) {
    const c = k.indexOf(","); const bgx = +k.slice(0, c), bgy = +k.slice(c + 1);
    const px = SX(bgx), py = SY(bgy), ts = T * z;
    if (px < -ts || px > CM.cw || py < -ts || py > CM.ch) continue;
    if (reedOk && (bgx * 7 + bgy * 13) % 3 === 0) {
      const waterBelow = L.river.cells.has(bgx + "," + (bgy + 1));
      const waterAbove = L.river.cells.has(bgx + "," + (bgy - 1));
      const baseY = waterBelow ? py + ts * 0.28 : waterAbove ? py + ts * 0.78 : py + ts * 0.54;
      const tipY = waterBelow ? py + ts * 0.08 : waterAbove ? py + ts * 0.96 : py + ts * 0.38;
      ctx.strokeStyle = "rgba(90,138,42,0.72)";
      ctx.lineWidth = Math.max(1, z * 0.75);
      for (let rd = 0; rd < 2; rd += 1) {
        const rx = px + ts * (0.38 + rd * 0.2);
        ctx.beginPath(); ctx.moveTo(rx, baseY); ctx.lineTo(rx + (rd ? 1 : -1) * z, tipY); ctx.stroke();
      }
    }
  }

  if (tw > 0.7 && !collapsed) {
    ctx.fillStyle = "rgba(96,72,32,0.28)";
    for (let i = 0; i < 6; i += 1) { const s0 = sm[Math.floor((i / 6) * (sm.length - 1))]; ctx.beginPath(); ctx.arc(SX(s0.x), SY(s0.y), Math.max(2, 3 * z), 0, Math.PI * 2); ctx.fill(); }
  }
}

function cityMapDrawTrees() {
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const occ = CM.occupied || new Set();
  const rr = CM.riverRow;
  const pad = 2;
  const gx0 = Math.floor((CM.cam.x - CM.cw / 2 / z) / CM.TILE) - pad;
  const gx1 = Math.ceil((CM.cam.x + CM.cw / 2 / z) / CM.TILE) + pad;
  const gy0 = Math.floor((CM.cam.y - CM.ch / 2 / z) / CM.TILE) - pad;
  const gy1 = Math.ceil((CM.cam.y + CM.ch / 2 / z) / CM.TILE) + pad;

  const isRiver = (gx, gy) => gy === rr || gy === rr + 1;
  const nearCity = (gx, gy) =>
    occ.has((gx - 1) + "," + gy) || occ.has((gx + 1) + "," + gy) ||
    occ.has(gx + "," + (gy - 1)) || occ.has(gx + "," + (gy + 1));

  const hasTree = (gx, gy) => {
    if (isRiver(gx, gy) || occ.has(gx + "," + gy)) return false;
    const h = cmHash(gx + "f" + gy) % 100;
    return h < 68 || nearCity(gx, gy);
  };

  // Parametres par arbre (stables, calculés une fois)
  const trees = [];
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      if (!hasTree(gx, gy)) continue;
      const h = cmHash(gx + "f" + gy) % 100;
      const edge = nearCity(gx, gy);
      // Léger décalage pseudo-aléatoire dans la case pour casser la grille
      const jx = ((h * 17 + gx * 3) % 30 - 15) / 100;
      const jy = ((h * 13 + gy * 7) % 30 - 15) / 100;
      const cx = (gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * z + CM.cw / 2 + jx * s;
      const cy = (gy * CM.TILE + CM.TILE / 2 - CM.cam.y) * z + CM.ch / 2 + jy * s;
      // Rayon: lisière = petit, intérieur = grand (chevauche les voisins)
      const r = edge
        ? s * (0.20 + (h % 4) * 0.025)
        : s * (0.36 + (h % 5) * 0.04);
      // Couleurs: base sombre, canopée, surbrillance
      const colBase  = CITY_MAP_GREENS[(h % 4) + 4];      // verts sombres index 4-7
      const colTop   = CITY_MAP_GREENS[h % 4];             // verts moyens  index 0-3
      trees.push({ cx, cy, r, colBase, colTop, h, edge });
    }
  }

  // Passe 1 — ombres portées sous chaque arbre
  for (const t of trees) {
    // L'ombre se place sous le pied du tronc, décalée à droite
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(
      t.cx + t.r * 0.18, t.cy + t.r * 0.80,
      t.r * 0.90, t.r * 0.32,
      0, 0, Math.PI * 2
    );
    ctx.fill();
  }

  // Passe 2 — troncs + couronnes
  // Géométrie : couronne centrée à cy - r*0.50  →  bas de la couronne = cy + r*0.50
  //             tronc descend jusqu'à cy + r*0.90  →  r*0.40 de tronc visible en bas
  for (const t of trees) {
    // --- Tronc ---
    const tw = Math.max(1.5, t.r * (t.edge ? 0.11 : 0.16));
    const trunkTop = t.cy - t.r * 0.15;   // part juste sous la couronne (sera caché)
    const trunkBot = t.cy + t.r * (t.edge ? 0.72 : 0.90); // dépasse sous la couronne
    ctx.fillStyle = "#3a1e06";
    ctx.fillRect(t.cx - tw / 2, trunkTop, tw, trunkBot - trunkTop);
    // Face gauche plus claire pour donner du volume cylindrique
    ctx.fillStyle = "rgba(100,55,15,0.55)";
    ctx.fillRect(t.cx - tw / 2, trunkTop, tw * 0.42, trunkBot - trunkTop);

    // --- Couronne : montée haut pour laisser le tronc visible en bas ---
    // Cercle sombre (bord de la couronne)
    ctx.fillStyle = t.colBase;
    ctx.beginPath();
    ctx.arc(t.cx, t.cy - t.r * 0.50, t.r, 0, Math.PI * 2);
    ctx.fill();

    // Cercle principal (couleur vive), légèrement décalé haut-gauche
    ctx.fillStyle = t.colTop;
    ctx.beginPath();
    ctx.arc(t.cx - t.r * 0.09, t.cy - t.r * 0.60, t.r * 0.82, 0, Math.PI * 2);
    ctx.fill();

    // Reflet solaire haut-gauche
    ctx.fillStyle = "rgba(210,255,140,0.15)";
    ctx.beginPath();
    ctx.arc(t.cx - t.r * 0.28, t.cy - t.r * 0.72, t.r * 0.40, 0, Math.PI * 2);
    ctx.fill();
  }
}

function cityMapDrawNight(now) {
  const n = CM.nightF;
  if (n < 0.05) return;
  const ctx = CM.ctx;
  ctx.fillStyle = `rgba(10,16,34,${(n * 0.5).toFixed(3)})`;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (CM.layout && CM.layout.counts.eraBand >= 2) {
    const sx = (CM.layout.cx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
    const sy = (CM.layout.cy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
    const r = (8 + CM.layout.counts.eraIndex * 2.4) * CM.TILE * CM.cam.zoom;
    const warm = CM.layout.counts.eraBand >= 5 ? "255,215,150" : "255,200,120";
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, r));
    g.addColorStop(0, `rgba(${warm},${(n * 0.16).toFixed(3)})`);
    g.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = prev;
  }
}
