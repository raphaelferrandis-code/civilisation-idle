/* eslint-disable */
import { state } from '../core/state.js';
import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from './layout.js';

/* ---- legacy citymap rendering\agents.js ---- */


/* ============================================================================
 * citymap-render-agents.js - Pietons, vehicules et bateaux de la carte.
 * ============================================================================ */

function getVehicleDensity(eraIndex, rank) {
  const rankBase = rank === "main" ? 1.15 : rank === "avenue" ? 0.78 : rank === "secondary" ? 0.35 : 0.05;
  const ageBase = eraIndex < 3 ? 0.02 : eraIndex < 7 ? 0.22 : eraIndex < 11 ? 0.42 : eraIndex < 13 ? 0.72 : eraIndex < 18 ? 0.98 : 1.12;
  const ruined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
  return ruined ? rankBase * 0.08 : rankBase * ageBase;
}

function chooseRoadVehicleType(eraIndex, rank, seed) {
  const ruined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
  if (ruined) return "broken_cart";
  if (eraIndex < 3) return "basket";
  if (eraIndex < 6) return seed % 3 === 0 ? "barrow" : "cart";
  if (eraIndex < 9) return seed % 3 === 0 ? "chariot" : seed % 3 === 1 ? "wagon" : "cart";
  if (eraIndex < 11) return seed % 3 === 0 ? "caravan" : seed % 3 === 1 ? "wagon" : "chariot";
  if (eraIndex >= 13 && seed % 4 === 0) return "drone";
  if (eraIndex >= 11 && (rank === "main" || rank === "avenue")) return seed % 3 === 0 ? "tram" : "car";
  if (eraIndex >= 11) return seed % 2 === 0 ? "car" : "wagon";
  if (rank === "main" && seed % 4 === 0) return "chariot";
  if ((rank === "main" || rank === "avenue") && seed % 3 === 0) return "caravan";
  return "wagon";
}

const CM_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function cityMapWalkRoadKey(gx, gy) {
  return gx * 10000 + gy;
}

function cityMapDirBit(dirIndex) {
  return dirIndex === 0 ? ROAD_E : dirIndex === 1 ? ROAD_W : dirIndex === 2 ? ROAD_S : ROAD_N;
}

function roadStepAllowed(gx, gy, dirIndex) {
  const road = CM.layout && CM.layout.roadMap && CM.layout.roadMap.get(gx + "," + gy);
  if (road) return !!(road.mask & cityMapDirBit(dirIndex));
  const nx = gx + CM_DIRS[dirIndex][0], ny = gy + CM_DIRS[dirIndex][1];
  return CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny));
}

function citizenChooseNext(p) {
  if (!CM.walkRoadList.length) return;
  if (Math.random() < 0.12) {
    p.pauseT = 0.3 + Math.random() * 1.5;
    return;
  }
  if (!p.goal || Math.random() < 0.05 || (p.goal.gx === p.gx && p.goal.gy === p.gy)) {
    const r = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
    p.goal = { gx: r.gx, gy: r.gy };
  }
  const rev = p.dir >= 0 ? (p.dir ^ 1) : -1;
  const opts = [];
  for (let i = 0; i < 4; i += 1) {
    const nx = p.gx + CM_DIRS[i][0], ny = p.gy + CM_DIRS[i][1];
    if (CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny)) && roadStepAllowed(p.gx, p.gy, i)) opts.push({ i, nx, ny });
  }
  if (!opts.length) return;
  const forward = opts.filter((o) => o.i !== rev);
  const pool = forward.length ? forward : opts;
  let best = pool[0], bestScore = -Infinity;
  for (const o of pool) {
    let score = -(Math.abs(p.goal.gx - o.nx) + Math.abs(p.goal.gy - o.ny));
    if (o.i === p.dir) score += 1.6;
    score += Math.random() * 2.4;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  p.gx = best.nx;
  p.gy = best.ny;
  p.dir = best.i;
  p.tx = (p.gx + 0.5) * CM.TILE;
  p.ty = (p.gy + 0.5) * CM.TILE;
}

function drawCitizens(dt, now) {
  if (!CM.walkRoadList.length) return;
  const ctx = CM.ctx, z = CM.cam.zoom;
  const eraI = CM.layout?.counts?.eraIndex ?? 0;

  // Gestion globale de l'apparition des bulles de pensée pour éviter le spam dû au nombre de citoyens
  if (CM.globalBubbleCooldown === undefined) {
    CM.globalBubbleCooldown = Math.random() * 15 + 10; // Première bulle apparaît après 10 à 25s
  }

  // Scan avec sortie anticipée — évite de construire idleCitizens[] à chaque frame
  let hasActiveThought = false;
  for (const c of CM.citizens) {
    if (c.thoughtType && c.thoughtTimer > 0) { hasActiveThought = true; break; }
  }

  CM.globalBubbleCooldown -= dt;
  if (CM.globalBubbleCooldown <= 0) {
    if (!hasActiveThought && CM.citizens.length > 0) {
      // Construction tardive — seulement toutes les 90-180s
      const idleCitizens = CM.citizens.filter(c => !c.thoughtType || c.thoughtTimer <= 0);
      if (idleCitizens.length > 0) {
        const p = idleCitizens[Math.floor(Math.random() * idleCitizens.length)];
        const types = ["thought", "scroll", "lightning"];
        p.thoughtType = types[Math.floor(Math.random() * types.length)];
        p.thoughtTimer = 18;
        CM.globalBubbleCooldown = Math.random() * 90 + 90;
      } else {
        CM.globalBubbleCooldown = 5;
      }
    } else {
      CM.globalBubbleCooldown = 5;
    }
  }

  for (const p of CM.citizens) {
    if (p.thoughtTimer === undefined) p.thoughtTimer = 0;
    if (p.thoughtType === undefined) p.thoughtType = null;

    if (!CM.walkRoadSet.has(cityMapWalkRoadKey(p.gx, p.gy))) {
      const r = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
      p.gx = r.gx;
      p.gy = r.gy;
      p.x = (r.gx + 0.5) * CM.TILE;
      p.y = (r.gy + 0.5) * CM.TILE;
      p.tx = p.x;
      p.ty = p.y;
      p.dir = -1;
    }
    if (p.pauseT > 0) {
      p.pauseT -= dt;
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
      if (dist < 2.4) {
        citizenChooseNext(p);
      } else {
        const sp = p.speed * dt;
        p.x += dx / dist * sp;
        p.y += dy / dist * sp;
      }
    }
    const wob = p.pauseT > 0 ? 0 : Math.sin((now || 0) / 240 + (p.phase || 0)) * 1.1;
    const perpX = (p.dir === 2 || p.dir === 3) ? 1 : 0;
    const perpY = perpX ? 0 : 1;
    const swSign = (p.phase > Math.PI) ? 1 : -1;
    const swOff = eraI >= 5 ? swSign * 0.27 * CM.TILE * z : 0;
    const sx = (p.x - CM.cam.x) * z + CM.cw / 2 + wob * perpX * z + swOff * perpX;
    const sy = (p.y - CM.cam.y) * z + CM.ch / 2 + wob * perpY * z + swOff * perpY;
    if (sx < 0 || sy < 0 || sx > CM.cw || sy > CM.ch) continue;

    // Met à jour la bulle de pensée au-dessus du citoyen si active
    if (p.thoughtType && p.thoughtTimer > 0) {
      p.thoughtTimer -= dt;
      if (p.thoughtTimer <= 0) {
        p.thoughtType = null;
      }
    }

    ctx.fillStyle = p.col;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1.1, 1.9 * z), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCitizenThoughts(now) {
  if (!CM.walkRoadList.length || !CM.citizens) return;
  const ctx = CM.ctx, z = CM.cam.zoom;
  const eraI = CM.layout?.counts?.eraIndex ?? 0;
  for (const p of CM.citizens) {
    if (p.thoughtType && p.thoughtTimer > 0) {
      const wob = p.pauseT > 0 ? 0 : Math.sin((now || 0) / 240 + (p.phase || 0)) * 1.1;
      const perpX = (p.dir === 2 || p.dir === 3) ? 1 : 0;
      const perpY = perpX ? 0 : 1;
      const swSign = (p.phase > Math.PI) ? 1 : -1;
      const swOff = eraI >= 5 ? swSign * 0.27 * CM.TILE * z : 0;
      const sx = (p.x - CM.cam.x) * z + CM.cw / 2 + wob * perpX * z + swOff * perpX;
      const sy = (p.y - CM.cam.y) * z + CM.ch / 2 + wob * perpY * z + swOff * perpY;
      if (sx < 0 || sy < 0 || sx > CM.cw || sy > CM.ch) continue;

      const emoji = p.thoughtType === "thought" ? "💭" : p.thoughtType === "scroll" ? "📜" : "⚡";
      const bx = sx;
      const by = sy - 14 * Math.max(0.6, z);
      
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(bx, by + 4);
      ctx.lineTo(bx - 3, by + 10);
      ctx.lineTo(bx + 3, by + 10);
      ctx.fillStyle = "rgba(18, 10, 5, 0.85)";
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(bx, by, 8 * Math.max(0.7, z), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 248, 230, 0.95)";
      ctx.strokeStyle = "rgba(201, 168, 76, 0.85)";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      
      ctx.font = `${Math.round(10 * Math.max(0.7, z))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, bx, by + 0.5);

      ctx.restore();
    }
  }
}

function updateVehicles(dt) {
  for (const v of CM.vehicles) {
    if (v.pauseT > 0) {
      v.pauseT -= dt;
      continue;
    }
    const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
    if (d < 2.4) {
      citizenChooseNext(v);
    } else {
      const sp = v.speed * dt;
      v.x += dx / d * sp;
      v.y += dy / d * sp;
    }
  }
}

function drawVehicleWheel(ctx, x, y, rx, ry, fill, rim) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!rim) return;
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(0.5, ry * 0.8);
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawVehicleWheelSet(ctx, s, axles, sideY, rx, ry, fill = "#1a1a20", rim = null) {
  for (const axleX of axles) {
    drawVehicleWheel(ctx, s * axleX, -s * sideY, Math.max(1, s * rx), Math.max(0.8, s * ry), fill, rim);
    drawVehicleWheel(ctx, s * axleX, s * sideY, Math.max(1, s * rx), Math.max(0.8, s * ry), fill, rim);
  }
}

function drawVehicles(now, pass) {
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const ei = CM.layout?.counts?.eraIndex ?? 13; // extrait une fois hors boucle
  for (const v of CM.vehicles) {
    if (pass === "ground" && v.type === "drone") continue;
    if (pass === "air" && v.type !== "drone") continue;
    const sx = (v.x - CM.cam.x) * z + CM.cw / 2;
    let sy = (v.y - CM.cam.y) * z + CM.ch / 2;
    if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
    if (v.type === "drone") {
      sy -= s * 0.5;
      const t2 = now || 0;
      const hover = Math.sin(t2 / 380 + v.x * 0.04) * s * 0.04;
      const pulse = 0.5 + 0.5 * Math.sin(t2 / 180 + v.x * 0.05);
      ctx.fillStyle = `rgba(0,0,0,${(0.1 + 0.06 * Math.sin(t2 / 380)).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy + s * 0.55 + hover, s * 0.18, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a4050";
      ctx.beginPath();
      ctx.arc(sx, sy + hover, Math.max(1.5, s * 0.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(80,200,255,0.7)";
      ctx.beginPath();
      ctx.arc(sx, sy + hover, Math.max(1, s * 0.04), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#505868";
      ctx.lineWidth = Math.max(1, s * 0.022);
      for (let arm = 0; arm < 4; arm += 1) {
        const aa = arm * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy + hover);
        ctx.lineTo(sx + Math.cos(aa) * s * 0.14, sy + hover + Math.sin(aa) * s * 0.1);
        ctx.stroke();
      }
      const rotA = `rgba(200,220,255,${(0.25 + pulse * 0.2).toFixed(2)})`;
      ctx.strokeStyle = rotA;
      ctx.lineWidth = Math.max(0.5, s * 0.014);
      for (let arm = 0; arm < 4; arm += 1) {
        const aa = arm * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(sx + Math.cos(aa) * s * 0.14, sy + hover + Math.sin(aa) * s * 0.1, Math.max(1, s * 0.06), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(80,255,100,${(0.7 + 0.3 * Math.sin(t2 / 200)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx + s * 0.1, sy + hover - s * 0.04, Math.max(1, s * 0.025), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,60,60,${(0.7 + 0.3 * Math.sin(t2 / 200 + Math.PI)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx - s * 0.1, sy + hover + s * 0.06, Math.max(1, s * 0.025), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.save();
    ctx.translate(sx, sy);
    const vdx = v.tx - v.x, vdy = v.ty - v.y;
    const vAngle = (Math.abs(vdx) > 0.5 || Math.abs(vdy) > 0.5)
      ? Math.atan2(vdy, vdx)
      : v.dir === 0 ? 0 : v.dir === 1 ? Math.PI : v.dir === 2 ? Math.PI / 2 : -Math.PI / 2;
    ctx.rotate(vAngle);
    ctx.fillStyle = "rgba(20,14,8,0.28)";
    ctx.fillRect(-s * 0.18, s * 0.08, s * 0.36, Math.max(1, s * 0.035));
    if (v.type === "car") {
      if (ei >= 14) {
        const t2 = now || 0;
        const gCol = v.col || "#4a6080";
        ctx.fillStyle = gCol;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.22, s * 0.078, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(140,210,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(-s * 0.02, -s * 0.02, s * 0.1, s * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
        const glow = 0.5 + 0.3 * Math.sin(t2 / 300 + v.x * 0.02);
        ctx.strokeStyle = `rgba(60,200,255,${glow.toFixed(2)})`;
        ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath();
        ctx.ellipse(0, s * 0.055, s * 0.2, s * 0.025, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(80,230,255,${(0.8 + 0.2 * Math.sin(t2 / 200)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s * 0.18, -s * 0.02, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.18, s * 0.03, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
      } else if (ei >= 11) {
        ctx.fillStyle = v.col || "#5a6878";
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-s * 0.2, -s * 0.07, s * 0.4, s * 0.13, s * 0.04) : ctx.fillRect(-s * 0.2, -s * 0.07, s * 0.4, s * 0.13);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(-s * 0.1, -s * 0.07, s * 0.22, s * 0.06);
        ctx.fillStyle = "rgba(160,220,240,0.55)";
        ctx.fillRect(-s * 0.08, -s * 0.065, s * 0.18, s * 0.05);
        ctx.fillStyle = "rgba(220,230,240,0.9)";
        ctx.fillRect(s * 0.15, -s * 0.05, s * 0.05, s * 0.02);
        ctx.fillRect(s * 0.15, s * 0.025, s * 0.05, s * 0.02);
        drawVehicleWheelSet(ctx, s, [-0.12, 0.12], 0.075, 0.026, 0.014, "#1a1a20", "rgba(100,120,160,0.6)");
      } else {
        ctx.fillStyle = v.col || "#9b4d38";
        ctx.fillRect(-s * 0.18, -s * 0.075, s * 0.36, s * 0.15);
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(-s * 0.1, -s * 0.075, s * 0.2, s * 0.065);
        ctx.fillStyle = "rgba(185,220,225,0.62)";
        ctx.fillRect(-s * 0.07, -s * 0.065, s * 0.14, s * 0.055);
        ctx.fillStyle = "rgba(255,240,180,0.9)";
        ctx.beginPath();
        ctx.arc(s * 0.14, -s * 0.04, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.14, s * 0.02, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
        drawVehicleWheelSet(ctx, s, [-0.11, 0.11], 0.075, 0.025, 0.014, "#21170f");
      }
    } else if (v.type === "tram") {
      if (ei >= 13) {
        const t2 = now || 0;
        ctx.fillStyle = "#e0e8f0";
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.01, s * 0.28, s * 0.065, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(100,180,255,0.5)";
        ctx.fillRect(-s * 0.2, -s * 0.06, s * 0.4, s * 0.055);
        ctx.strokeStyle = `rgba(40,200,255,${(0.5 + 0.3 * Math.sin(t2 / 250)).toFixed(2)})`;
        ctx.lineWidth = Math.max(1.5, s * 0.03);
        ctx.beginPath();
        ctx.moveTo(-s * 0.26, s * 0.06);
        ctx.lineTo(s * 0.26, s * 0.06);
        ctx.stroke();
        ctx.fillStyle = "rgba(60,220,255,0.7)";
        ctx.fillRect(-s * 0.24, s * 0.04, s * 0.48, s * 0.025);
      } else {
        ctx.fillStyle = v.col || "#a8a092";
        ctx.fillRect(-s * 0.24, -s * 0.075, s * 0.48, s * 0.15);
        ctx.fillStyle = "rgba(210,225,210,0.5)";
        ctx.fillRect(-s * 0.14, -s * 0.045, s * 0.08, s * 0.08);
        ctx.fillRect(s * 0.04, -s * 0.045, s * 0.08, s * 0.08);
        ctx.strokeStyle = "rgba(40,32,24,0.45)";
        ctx.lineWidth = Math.max(1, s * 0.014);
        ctx.beginPath();
        ctx.moveTo(-s * 0.24, s * 0.09);
        ctx.lineTo(s * 0.24, s * 0.09);
        ctx.stroke();
      }
    } else if (v.type === "basket") {
      ctx.fillStyle = "#b08a4a";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, s * 0.075), 0, Math.PI * 2);
      ctx.fill();
    } else if (v.type === "barrow") {
      ctx.fillStyle = "#8f6534";
      ctx.fillRect(-s * 0.11, -s * 0.07, s * 0.22, s * 0.12);
      drawVehicleWheelSet(ctx, s, [0.08], 0.065, 0.024, 0.013, "#2a1a0c");
    } else if (v.type === "chariot") {
      ctx.fillStyle = "#9a7440";
      ctx.fillRect(-s * 0.18, -s * 0.08, s * 0.3, s * 0.16);
      ctx.fillStyle = "#c0a46a";
      ctx.fillRect(s * 0.08, -s * 0.12, s * 0.1, s * 0.24);
      drawVehicleWheelSet(ctx, s, [-0.12, 0.1], 0.08, 0.03, 0.016, "#2a1a0c");
    } else if (v.type === "caravan") {
      ctx.fillStyle = "#7b5b35";
      ctx.fillRect(-s * 0.22, -s * 0.08, s * 0.18, s * 0.16);
      ctx.fillRect(s * 0.02, -s * 0.08, s * 0.18, s * 0.16);
      drawVehicleWheelSet(ctx, s, [-0.16, -0.02, 0.08, 0.22], 0.08, 0.024, 0.013, "#2a1a0c");
    } else if (v.type === "broken_cart" || v.type === "wheel") {
      ctx.strokeStyle = "rgba(52,35,20,0.65)";
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, -s * 0.055);
      ctx.lineTo(s * 0.12, s * 0.045);
      ctx.moveTo(-s * 0.06, s * 0.055);
      ctx.lineTo(s * 0.08, -s * 0.045);
      ctx.stroke();
      drawVehicleWheelSet(ctx, s, [-0.08, 0.08], 0.07, 0.024, 0.013, "rgba(42,26,12,0.85)");
    } else {
      ctx.fillStyle = v.col || "#8f6534";
      ctx.fillRect(-s * 0.17, -s * 0.08, s * 0.34, s * 0.16);
      drawVehicleWheelSet(ctx, s, [-0.1, 0.1], 0.08, 0.03, 0.016, "#2a1a0c");
    }
    ctx.restore();
  }
}

function drawShips(dt) {
  if (!CM.layout || !CM.layout.river || !CM.layout.river.present) return;
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z, T = CM.TILE;
  const sm = CM.layout.river.samples;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
  const ei = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
  const now = performance.now();
  for (const sh of CM.ships) {
    sh.t += sh.dir * sh.speed * dt;
    if (sh.t > 1) sh.t = 0;
    if (sh.t < 0) sh.t = 1;
    const fi = sh.t * (sm.length - 1);
    const i0 = Math.max(0, Math.min(sm.length - 1, Math.floor(fi)));
    const i1 = Math.min(sm.length - 1, i0 + 1);
    const f = fi - i0;
    const wx = (sm[i0].x + (sm[i1].x - sm[i0].x) * f) * T;
    const wy = (sm[i0].y + (sm[i1].y - sm[i0].y) * f) * T;
    const sx = (wx - CM.cam.x) * z + CM.cw / 2;
    const sy = (wy - CM.cam.y) * z + CM.ch / 2;
    if (sx < -s || sx > CM.cw + s || sy < -s || sy > CM.ch + s) continue;
    ctx.save();
    ctx.translate(sx, sy);
    if (sh.dir < 0) ctx.scale(-1, 1);

    ctx.fillStyle = "rgba(10,25,35,0.20)";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.1, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ei >= 11) {
      const pulse = 0.5 + 0.3 * Math.sin(now / 400 + sh.t * 8);
      ctx.fillStyle = ei >= 14 ? "#2a3848" : "#4a5060";
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, s * 0.05);
      ctx.lineTo(-s * 0.32, s * 0.14);
      ctx.lineTo(s * 0.32, s * 0.14);
      ctx.lineTo(s * 0.28, s * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = ei >= 14 ? "#1e2838" : "#38424e";
      ctx.fillRect(-s * 0.12, -s * 0.06, s * 0.28, s * 0.12);
      ctx.fillStyle = `rgba(100,200,255,${(0.5 + pulse * 0.3).toFixed(2)})`;
      for (let i = 0; i < 3; i += 1) ctx.fillRect(-s * 0.08 + i * s * 0.09, -s * 0.03, s * 0.05, s * 0.04);
      ctx.fillStyle = "#606878";
      ctx.fillRect(s * 0.08, -s * 0.18, s * 0.04, s * 0.14);
      if (ei >= 14) {
        ctx.strokeStyle = `rgba(60,200,255,${pulse.toFixed(2)})`;
        ctx.lineWidth = Math.max(1.5, s * 0.025);
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, s * 0.10);
        ctx.lineTo(-s * 0.5, s * 0.10);
        ctx.stroke();
        ctx.strokeStyle = `rgba(80,160,255,${(pulse * 0.5).toFixed(2)})`;
        ctx.lineWidth = Math.max(1, s * 0.016);
        ctx.beginPath();
        ctx.moveTo(-s * 0.28, s * 0.14);
        ctx.lineTo(s * 0.28, s * 0.14);
        ctx.stroke();
      } else {
        const smk = (now / 600) % 1;
        ctx.fillStyle = `rgba(160,150,140,${((1 - smk) * 0.28).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s * 0.10, -s * (0.18 + smk * 0.18), s * (0.04 + smk * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (band >= 4) {
      ctx.fillStyle = "#5a4838";
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, s * 0.02);
      ctx.quadraticCurveTo(0, s * 0.20, s * 0.26, s * 0.02);
      ctx.lineTo(s * 0.18, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.24, -s * 0.18, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7a6050";
      ctx.fillRect(-s * 0.10, -s * 0.06, s * 0.22, s * 0.10);
      ctx.strokeStyle = "#6a4a2a";
      ctx.lineWidth = Math.max(1, s * 0.022);
      const wRot = (now / 600) % (Math.PI * 2);
      for (let i = 0; i < 6; i += 1) {
        const wa = wRot + i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(s * 0.22, s * 0.08);
        ctx.lineTo(s * (0.22 + Math.cos(wa) * 0.10), s * (0.08 + Math.sin(wa) * 0.07));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(s * 0.22, s * 0.08, s * 0.10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#3a2818";
      ctx.fillRect(s * 0.04, -s * 0.22, s * 0.06, s * 0.18);
      const smk = (now / 700) % 1;
      ctx.fillStyle = `rgba(100,90,80,${((1 - smk) * 0.30).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s * 0.07, -s * (0.22 + smk * 0.20), s * (0.04 + smk * 0.08), 0, Math.PI * 2);
      ctx.fill();
    } else if (band >= 2) {
      ctx.fillStyle = "#4a3320";
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, s * 0.02);
      ctx.quadraticCurveTo(0, s * 0.19, s * 0.24, s * 0.02);
      ctx.lineTo(s * 0.16, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.22, -s * 0.16, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(28,18,10,0.55)";
      ctx.lineWidth = Math.max(1, s * 0.018);
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, s * 0.08);
      ctx.lineTo(s * 0.13, s * 0.08);
      ctx.stroke();
      ctx.fillStyle = "#d8cdb0";
      ctx.fillRect(-s * 0.01, -s * 0.24, Math.max(1, s * 0.022), s * 0.28);
      ctx.fillStyle = `rgba(230,215,180,${(0.7 + 0.2 * Math.sin(now / 900 + sh.t * 5)).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(s * 0.015, -s * 0.22);
      ctx.lineTo(s * 0.15, -s * 0.08);
      ctx.lineTo(s * 0.015, -s * 0.02);
      ctx.closePath();
      ctx.fill();
      if (band >= 3) {
        ctx.fillStyle = "rgba(210,195,158,0.65)";
        ctx.beginPath();
        ctx.moveTo(s * 0.015, -s * 0.22);
        ctx.lineTo(-s * 0.12, -s * 0.10);
        ctx.lineTo(s * 0.015, -s * 0.04);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#6a4a22";
      ctx.beginPath();
      ctx.moveTo(-s * 0.20, s * 0.04);
      ctx.quadraticCurveTo(0, s * 0.16, s * 0.20, s * 0.04);
      ctx.lineTo(s * 0.14, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.20, -s * 0.14, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#5a3818";
      ctx.lineWidth = Math.max(1, s * 0.022);
      ctx.lineCap = "round";
      const padA = Math.sin(now / 500 + sh.t * 6) * 0.4;
      ctx.beginPath();
      ctx.moveTo(s * 0.08, s * 0.06);
      ctx.lineTo(s * (0.20 + Math.cos(padA) * 0.12), s * (0.10 + Math.sin(padA) * 0.08));
      ctx.stroke();
      ctx.lineCap = "square";
      ctx.fillStyle = "#7a5828";
      ctx.fillRect(-s * 0.01, -s * 0.16, Math.max(1, s * 0.018), s * 0.20);
      ctx.fillStyle = "rgba(200,170,110,0.6)";
      ctx.beginPath();
      ctx.moveTo(s * 0.010, -s * 0.14);
      ctx.lineTo(s * 0.10, -s * 0.06);
      ctx.lineTo(s * 0.010, -s * 0.01);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

export { chooseRoadVehicleType, drawCitizens, drawShips, drawVehicles, getVehicleDensity, updateVehicles, CM_DIRS, cityMapWalkRoadKey, roadStepAllowed, drawCitizenThoughts };
