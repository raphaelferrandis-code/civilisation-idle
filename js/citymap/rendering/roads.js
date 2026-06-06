"use strict";

/* ============================================================================
 * citymap-render-roads.js - Rendu des routes, ponts et lampadaires.
 * ============================================================================ */

function cmRoadConnects(layout, gx, gy) {
  if (!layout || !layout.roadSet || !layout.roadSet.has(gx + "," + gy)) return false;
  if (layout.river && layout.river.cells && layout.river.cells.has(gx + "," + gy)) {
    return cmIsBridgeRoad(layout, gx, gy);
  }
  return true;
}

function cmRoadMask(layout, gx, gy) {
  const road = layout && layout.roadMap && layout.roadMap.get(gx + "," + gy);
  if (road) {
    return {
      n: !!(road.mask & ROAD_N),
      e: !!(road.mask & ROAD_E),
      s: !!(road.mask & ROAD_S),
      w: !!(road.mask & ROAD_W)
    };
  }
  return {
    n: cmRoadConnects(layout, gx, gy - 1),
    e: cmRoadConnects(layout, gx + 1, gy),
    s: cmRoadConnects(layout, gx, gy + 1),
    w: cmRoadConnects(layout, gx - 1, gy)
  };
}

function cityMapDrawRoad(r) {
  const s = CM.TILE * CM.cam.zoom;
  const sx = (r.gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (r.gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) return;
  const ctx = CM.ctx;
  const layout = CM.layout;
  const eraIndex = layout && layout.counts ? layout.counts.eraIndex : 0;
  const major = layout && (r.gx === layout.cx || r.gy === layout.cy);
  const ruined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
  const roadRank = r.rank || "secondary";
  const roadStyle = getRoadVisualStyle(eraIndex, roadRank, ruined, major);
  const pal = roadStyle.palette;
  const rk = r.gx + "," + r.gy;
  if (r.roadSurface === "bridge") return;
  if (layout.river && layout.river.cells && layout.river.cells.has(rk)) return;
  if (layout.river && layout.river.banks && layout.river.banks.has(rk)) {
    const rm = layout.roadMap;
    const adjBridge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nr = rm && rm.get((r.gx + dx) + "," + (r.gy + dy));
      return nr && nr.roadSurface === "bridge";
    });
    if (!adjBridge) return;
  }

  const mask = cmRoadMask(layout, r.gx, r.gy);
  const degree = (mask.n ? 1 : 0) + (mask.e ? 1 : 0) + (mask.s ? 1 : 0) + (mask.w ? 1 : 0);
  const pathWidth = roadStyle.width;
  const half = s * pathWidth * 0.5;
  const cxp = sx + s / 2, cyp = sy + s / 2;
  const seed = cmHash(`road:${r.gx}:${r.gy}:${eraIndex}`);

  const shoulder = Math.max(1, s * 0.018 * roadStyle.borderStrength);
  const drawAxis = (color, width, cap = "square") => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width);
    ctx.lineCap = cap;
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (degree === 0) {
      ctx.moveTo(cxp - half * 0.35, cyp);
      ctx.lineTo(cxp + half * 0.35, cyp);
    } else {
      if (mask.n) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy); }
      if (mask.s) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s); }
      if (mask.w) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx, cyp); }
      if (mask.e) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s, cyp); }
    }
    ctx.stroke();
  };

  ctx.save();
  drawAxis(pal.edge, half * 2 + shoulder);
  drawAxis(pal.core, half * 2);

  const drawPebble = (px, py, rScale, color) => {
    const r = s * rScale;
    if (r < 0.5) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const horizontal = mask.e || mask.w;
  const vertical = mask.n || mask.s;
  const sideSign = seed % 2 ? 1 : -1;
  if (seed % Math.max(3, roadStyle.detailRate - 2) === 0) {
    const px = horizontal ? sx + s * (0.22 + ((seed >> 4) % 44) / 100) : cxp + sideSign * half * (0.62 + ((seed >> 7) % 20) / 100);
    const py = vertical ? sy + s * (0.22 + ((seed >> 5) % 44) / 100) : cyp + sideSign * half * (0.62 + ((seed >> 8) % 20) / 100);
    drawPebble(px, py, 0.018, "rgba(226,200,142,0.32)");
  }
  if (seed % roadStyle.detailRate === 0) {
    ctx.strokeStyle = "rgba(38,30,18,0.18)";
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    if (horizontal) {
      const y = cyp + sideSign * (half + s * 0.035);
      ctx.moveTo(sx + s * 0.18, y);
      ctx.lineTo(sx + s * 0.34, y + sideSign * s * 0.012);
    } else if (vertical) {
      const x = cxp + sideSign * (half + s * 0.035);
      ctx.moveTo(x, sy + s * 0.18);
      ctx.lineTo(x + sideSign * s * 0.012, sy + s * 0.34);
    }
    ctx.stroke();
  }

  ctx.lineWidth = Math.max(1, s * 0.016);
  if (eraIndex < 7) {
    ctx.strokeStyle = pal.track;
    if (mask.e || mask.w) {
      ctx.beginPath(); ctx.moveTo(sx + s * 0.22, cyp - half * 0.28); ctx.lineTo(sx + s * 0.46, cyp - half * 0.24); ctx.stroke();
    }
    if (mask.n || mask.s) {
      ctx.beginPath(); ctx.moveTo(cxp - half * 0.28, sy + s * 0.22); ctx.lineTo(cxp - half * 0.24, sy + s * 0.46); ctx.stroke();
    }
  } else if (eraIndex < 14) {
    if (seed % roadStyle.detailRate === 0) {
      ctx.strokeStyle = pal.detail;
      ctx.beginPath();
      if (mask.e || mask.w) {
        ctx.moveTo(sx + s * 0.28, cyp + ((seed % 2) ? 1 : -1) * half * 0.22);
        ctx.lineTo(sx + s * 0.4, cyp + ((seed % 2) ? 1 : -1) * half * 0.22);
      } else if (mask.n || mask.s) {
        ctx.moveTo(cxp + ((seed % 2) ? 1 : -1) * half * 0.22, sy + s * 0.28);
        ctx.lineTo(cxp + ((seed % 2) ? 1 : -1) * half * 0.22, sy + s * 0.4);
      }
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = Math.max(1, s * 0.014);
    if ((mask.e || mask.w) && major) { ctx.beginPath(); ctx.moveTo(sx + s * 0.26, cyp); ctx.lineTo(sx + s * 0.5, cyp); ctx.stroke(); }
    if ((mask.n || mask.s) && major) { ctx.beginPath(); ctx.moveTo(cxp, sy + s * 0.26); ctx.lineTo(cxp, sy + s * 0.5); ctx.stroke(); }
  }
  ctx.restore();
  ctx.lineJoin = "miter"; // reset explicite — drawAxis pose "round" dans le save block

  if (ruined && seed % 2 === 0) {
    ctx.strokeStyle = "rgba(20,14,9,0.72)";
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(sx + s * 0.2, sy + s * 0.25);
    ctx.lineTo(sx + s * 0.45, sy + s * 0.48);
    ctx.lineTo(sx + s * 0.36, sy + s * 0.8);
    ctx.stroke();
  }

  if (CM.debugRoads) {
    ctx.save();
    ctx.strokeStyle = "rgba(80,220,255,0.9)";
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    if (mask.n) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s * 0.12); }
    if (mask.e) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s * 0.88, cyp); }
    if (mask.s) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s * 0.88); }
    if (mask.w) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s * 0.12, cyp); }
    ctx.stroke();
    ctx.fillStyle = r.roadType === "intersection" ? "rgba(255,90,90,0.9)" : r.roadType === "junction" ? "rgba(255,210,80,0.9)" : "rgba(80,220,255,0.9)";
    ctx.fillRect(cxp - Math.max(1, s * 0.045), cyp - Math.max(1, s * 0.045), Math.max(2, s * 0.09), Math.max(2, s * 0.09));
    ctx.restore();
  }
}

function cityMapDrawBridgeSpan(component, exits) {
  const layout = CM.layout;
  if (!layout || !component || !component.length) return;
  const xs = component.map((r) => r.gx);
  const ys = component.map((r) => r.gy);
  const gx0 = Math.min(...xs), gx1 = Math.max(...xs);
  const gy0 = Math.min(...ys), gy1 = Math.max(...ys);
  const vertical = (gy1 - gy0) >= (gx1 - gx0);
  let drawGx0 = gx0, drawGx1 = gx1, drawGy0 = gy0, drawGy1 = gy1;
  if (exits && exits.length) {
    const exXs = exits.map((r) => r.gx), exYs = exits.map((r) => r.gy);
    if (vertical) { drawGy0 = Math.min(gy0, ...exYs); drawGy1 = Math.max(gy1, ...exYs); }
    else           { drawGx0 = Math.min(gx0, ...exXs); drawGx1 = Math.max(gx1, ...exXs); }
  }
  const s = CM.TILE * CM.cam.zoom;
  const sx = (drawGx0 * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (drawGy0 * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const totalW = (drawGx1 - drawGx0 + 1) * s;
  const totalH = (drawGy1 - drawGy0 + 1) * s;
  if (sx < -totalW - s || sy < -totalH - s || sx > CM.cw + s || sy > CM.ch + s) return;
  const ctx = CM.ctx;
  const eraIndex = layout.counts ? layout.counts.eraIndex : 0;

  const deckFrac = 0.54;
  const bw = s * deckFrac;
  const bx = vertical ? sx + (totalW - bw) / 2 : sx;
  const by = vertical ? sy : sy + (totalH - bw) / 2;
  const deckW = vertical ? bw : totalW;
  const deckH = vertical ? totalH : bw;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  const shOff = s * 0.06;
  ctx.fillRect(bx + shOff, by + shOff, deckW, deckH);

  const woodMain = eraIndex >= 16 ? "#6b6050" : eraIndex >= 10 ? "#9a7428" : "#a07830";
  ctx.fillStyle = woodMain;
  ctx.fillRect(bx, by, deckW, deckH);

  const plankColor = eraIndex >= 16 ? "rgba(40,34,28,0.65)" : "rgba(74,44,12,0.6)";
  ctx.strokeStyle = plankColor;
  ctx.lineWidth = Math.max(1, s * 0.04);
  const plankSpacing = s * 0.18;
  if (vertical) {
    const plankStart = by + plankSpacing * 0.5;
    for (let p = plankStart; p < by + deckH; p += plankSpacing) {
      ctx.beginPath(); ctx.moveTo(bx, p); ctx.lineTo(bx + deckW, p); ctx.stroke();
    }
  } else {
    const plankStart = bx + plankSpacing * 0.5;
    for (let p = plankStart; p < bx + deckW; p += plankSpacing) {
      ctx.beginPath(); ctx.moveTo(p, by); ctx.lineTo(p, by + deckH); ctx.stroke();
    }
  }

  const railW = Math.max(2, s * 0.085);
  const railColor = eraIndex >= 16 ? "#504844" : eraIndex >= 10 ? "#7a5a1a" : "#6a4a10";
  ctx.fillStyle = railColor;
  if (vertical) {
    ctx.fillRect(bx, by, railW, deckH);
    ctx.fillRect(bx + deckW - railW, by, railW, deckH);
  } else {
    ctx.fillRect(bx, by, deckW, railW);
    ctx.fillRect(bx, by + deckH - railW, deckW, railW);
  }

  ctx.fillStyle = "rgba(20,14,8,0.30)";
  const jointW = Math.max(1, s * 0.028);
  if (vertical) ctx.fillRect(bx + (deckW - jointW) / 2, by, jointW, deckH);
  else ctx.fillRect(bx, by + (deckH - jointW) / 2, deckW, jointW);

  ctx.fillStyle = "rgba(255,220,150,0.28)";
  const hilW = Math.max(1, s * 0.022);
  if (vertical) {
    ctx.fillRect(bx + railW, by, hilW, deckH);
    ctx.fillRect(bx + deckW - railW - hilW, by, hilW, deckH);
  } else {
    ctx.fillRect(bx, by + railW, deckW, hilW);
    ctx.fillRect(bx, by + deckH - railW - hilW, deckW, hilW);
  }

  if (component.length > 1) {
    const postColor = eraIndex >= 14 ? "#3a3230" : "#5a3a10";
    const postSize = Math.max(2, s * 0.11);
    ctx.fillStyle = postColor;
    ctx.fillRect(bx, by, postSize, postSize);
    ctx.fillRect(bx + deckW - postSize, by, postSize, postSize);
    ctx.fillRect(bx, by + deckH - postSize, postSize, postSize);
    ctx.fillRect(bx + deckW - postSize, by + deckH - postSize, postSize, postSize);
  }
}

function cityMapDrawBridges() {
  if (!CM.layout || !CM.roadList.length) return;
  const bridges = CM.bridgeList || CM.roadList.filter((r) => r.roadSurface === "bridge");
  const seen = new Set();
  const key = (r) => r.gx + "," + r.gy;
  const dirs = [
    { bit: ROAD_N, dx: 0, dy: -1 },
    { bit: ROAD_E, dx: 1, dy: 0 },
    { bit: ROAD_S, dx: 0, dy: 1 },
    { bit: ROAD_W, dx: -1, dy: 0 }
  ];
  for (const start of bridges) {
    const sk = key(start);
    if (seen.has(sk)) continue;
    const stack = [start], component = [];
    seen.add(sk);
    const exits = [];
    while (stack.length) {
      const r = stack.pop();
      component.push(r);
      for (const d of dirs) {
        if (!(r.mask & d.bit)) continue;
        const nr = CM.layout.roadMap.get((r.gx + d.dx) + "," + (r.gy + d.dy));
        if (nr && nr.roadSurface === "bridge") {
          const nk = key(nr);
          if (!seen.has(nk)) { seen.add(nk); stack.push(nr); }
        } else if (nr) {
          exits.push(nr);
        }
      }
    }
    cityMapDrawBridgeSpan(component, exits);
  }
}

function cityMapDrawStreetLights(now) {
  const L = CM.layout;
  if (!L || !L.counts) return;
  const ei = L.counts.eraIndex;
  if (ei < 7) return;
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const night = CM.nightF || 0;
  const glowA = 0.45 + 0.55 * night;
  const cyberpunk = ei >= 13;
  const futuristic = ei >= 9;

  for (const r of CM.roadList) {
    if (r.rank !== "main" && r.rank !== "avenue") continue;
    const seed = cmHash(`lamp:${r.gx}:${r.gy}`);
    if (seed % 3 !== 0) continue;
    const mask = cmRoadMask(L, r.gx, r.gy);
    const degree = (mask.n ? 1 : 0) + (mask.e ? 1 : 0) + (mask.s ? 1 : 0) + (mask.w ? 1 : 0);
    if (degree >= 3) continue;
    const cxs = (r.gx * CM.TILE + CM.TILE * 0.5 - CM.cam.x) * z + CM.cw / 2;
    const cys = (r.gy * CM.TILE + CM.TILE * 0.5 - CM.cam.y) * z + CM.ch / 2;
    if (cxs < -s * 2 || cys < -s * 2 || cxs > CM.cw + s * 2 || cys > CM.ch + s * 2) continue;
    const isVert = (mask.n || mask.s) && !(mask.e || mask.w);
    const off = s * 0.34;

    for (let side = -1; side <= 1; side += 2) {
      const lx = cxs + (isVert ? side * off : 0);
      const ly = cys + (isVert ? 0 : side * off);
      const t2 = now || 0;

      if (cyberpunk) {
        const hue = seed % 2 === 0 ? [50, 210, 255] : [255, 50, 200];
        const pulse = 0.65 + 0.25 * Math.sin(t2 / 500 + r.gx * 0.3 + r.gy * 0.4);
        ctx.strokeStyle = "#28303a"; ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.38); ctx.stroke();
        const nAlpha = (pulse * glowA).toFixed(2);
        ctx.strokeStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${nAlpha})`; ctx.lineWidth = Math.max(1.5, s * 0.03);
        ctx.beginPath(); ctx.moveTo(lx - s * 0.09, ly - s * 0.38); ctx.lineTo(lx + s * 0.09, ly - s * 0.38); ctx.stroke();
        if (night > 0.15) {
          const hg = ctx.createRadialGradient(lx, ly - s * 0.38, 0, lx, ly - s * 0.38, s * 0.24);
          hg.addColorStop(0, `rgba(${hue[0]},${hue[1]},${hue[2]},${(0.30 * night * pulse).toFixed(2)})`);
          hg.addColorStop(1, `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(lx, ly - s * 0.38, s * 0.24, 0, Math.PI * 2); ctx.fill();
        }
      } else if (futuristic) {
        ctx.strokeStyle = "#545e6a"; ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.34); ctx.stroke();
        ctx.strokeStyle = "#606a78"; ctx.lineWidth = Math.max(0.5, s * 0.013);
        ctx.beginPath(); ctx.moveTo(lx, ly - s * 0.34); ctx.lineTo(lx + s * 0.07, ly - s * 0.39); ctx.stroke();
        const gc = `rgba(200,230,255,${glowA.toFixed(2)})`;
        ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.39, Math.max(1, s * 0.036), 0, Math.PI * 2); ctx.fill();
        if (night > 0.25) {
          const hg = ctx.createRadialGradient(lx + s * 0.07, ly - s * 0.39, 0, lx + s * 0.07, ly - s * 0.39, s * 0.19);
          hg.addColorStop(0, `rgba(200,230,255,${(0.22 * night).toFixed(2)})`);
          hg.addColorStop(1, "rgba(200,230,255,0)");
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.39, s * 0.19, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.strokeStyle = "#302820"; ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.3); ctx.lineTo(lx + s * 0.07, ly - s * 0.36); ctx.stroke();
        const gc = `rgba(255,210,80,${glowA.toFixed(2)})`;
        ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.36, Math.max(1, s * 0.04), 0, Math.PI * 2); ctx.fill();
        if (night > 0.25) {
          const hg = ctx.createRadialGradient(lx + s * 0.07, ly - s * 0.36, 0, lx + s * 0.07, ly - s * 0.36, s * 0.17);
          hg.addColorStop(0, `rgba(255,200,50,${(0.2 * night).toFixed(2)})`);
          hg.addColorStop(1, "rgba(255,200,50,0)");
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.36, s * 0.17, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
}
