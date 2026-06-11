/* eslint-disable */
import { state } from '../core/state.js';
import { toNum } from '../core/num.js';
import {
  CM,
  CM_WONDERS,
  ROAD_E,
  ROAD_N,
  ROAD_S,
  ROAD_W,
  cmHash,
  cmIsBridgeRoad,
  cmWonderSlot,
  WONDER_CLEAR_R
} from './layout.js';
import { CM_DIRS, cityMapWalkRoadKey, roadStepAllowed } from './agents.js';

/* ---- legacy citymap rendering\draw-utils.js ---- */


/* ============================================================================
 * citymap-draw-utils.js - Petits helpers visuels partages par les renderers.
 *   Pas de boucle, pas de listeners, pas de gros rendu de scene.
 * ============================================================================ */

function baseColor(type, variant) {
  return type === "house" ? "#8b6914"
    : type === "farm" ? (variant === "industrial" ? "#6b7b33" : "#4a7a2a")
    : type === "public" ? "#c9a84c"
    : type === "library" ? "#b58f3a"
    : "#8b6914";
}

function cmLitColor(band) {
  return CM.cmLitColorStr || `rgba(255,204,68,0.32)`;
}

// ── Émission lumineuse : halo radial ADDITIF, mis en cache par couleur ──────
// Un seul créateRadialGradient par teinte (sprite offscreen 64px), puis un
// drawImage en "lighter" par point de lumière — une vraie lumière, pas un
// aplat. L'appelant module l'alpha par CM.nightF.
const CM_GLOW_SPRITES = new Map();
function cmGlowSprite(r, g, b) {
  const key = r + "," + g + "," + b;
  let c = CM_GLOW_SPRITES.get(key);
  if (!c) {
    const SZ = 64;
    c = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(SZ, SZ)
      : (() => { const el = document.createElement("canvas"); el.width = SZ; el.height = SZ; return el; })();
    const g2 = c.getContext("2d");
    const grad = g2.createRadialGradient(SZ / 2, SZ / 2, 0, SZ / 2, SZ / 2, SZ / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},0.4)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    g2.fillStyle = grad;
    g2.fillRect(0, 0, SZ, SZ);
    CM_GLOW_SPRITES.set(key, c);
  }
  return c;
}
function cmDrawGlow(ctx, x, y, radius, r, g, b, alpha) {
  if (alpha <= 0.015 || radius < 0.5) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(cmGlowSprite(r, g, b), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prev;
}

function cmRoadPalette(eraIndex, major, ruined) {
  if (ruined) {
    return {
      base: major ? "#29251c" : "#242119",
      core: major ? "#5d5646" : "#4d4739",
      edge: "rgba(32,24,16,0.45)",
      line: "rgba(115,104,82,0.38)",
      detail: "rgba(83,105,58,0.5)",
      track: "rgba(28,22,15,0.65)"
    };
  }
  if (eraIndex >= 18) {
    return {
      base: major ? "#4c4638" : "#443f34",
      core: major ? "#706852" : "#625b49",
      edge: "rgba(34,30,22,0.42)",
      line: "rgba(224,205,142,0.34)",
      detail: "rgba(230,214,160,0.24)",
      track: "rgba(55,43,25,0.35)"
    };
  }
  if (eraIndex >= 14) {
    return {
      base: major ? "#514936" : "#463f31",
      core: major ? "#786b4c" : "#695d45",
      edge: "rgba(43,34,22,0.42)",
      line: "rgba(220,202,120,0.34)",
      detail: "rgba(210,190,130,0.22)",
      track: "rgba(55,43,25,0.38)"
    };
  }
  if (eraIndex >= 11) {
    return {
      base: major ? "#6b5f43" : "#5b5038",
      core: major ? "#817354" : "#706449",
      edge: "rgba(54,43,27,0.38)",
      line: "rgba(218,190,105,0.42)",
      detail: "rgba(228,207,151,0.22)",
      track: "rgba(72,56,34,0.34)"
    };
  }
  if (eraIndex >= 7) {
    return {
      base: major ? "#5c5037" : "#51442e",
      core: major ? "#746342" : "#66573a",
      edge: "rgba(58,47,31,0.36)",
      line: "rgba(185,155,82,0.36)",
      detail: "rgba(214,190,132,0.2)",
      track: "rgba(64,48,29,0.34)"
    };
  }
  if (eraIndex >= 3) {
    return {
      base: major ? "#5a4728" : "#4c3b24",
      core: major ? "#795f38" : "#684f30",
      edge: "rgba(47,37,24,0.34)",
      line: "rgba(132,96,48,0.34)",
      detail: "rgba(176,136,72,0.2)",
      track: "rgba(58,42,23,0.34)"
    };
  }
  return {
    base: "#334020",
    core: major ? "#7a6035" : "#6c5531",
    edge: "rgba(31,39,18,0.34)",
    line: "rgba(125,96,50,0.45)",
    detail: "rgba(108,135,58,0.35)",
    track: "rgba(62,45,24,0.34)"
  };
}

function getRoadVisualStyle(eraIndex, rank, ruined, major) {
  const palette = cmRoadPalette(eraIndex, major || rank === "main", ruined);
  // Hiérarchie viaire lisible d'un coup d'œil : sentier discret (presque un
  // trait) → rue → avenue → boulevard large et pavé. L'écart entre rangs est
  // volontairement marqué — c'est lui qui structure la lecture de la ville.
  const widthByRank = {
    path: eraIndex >= 7 ? 0.16 : 0.13,
    secondary: eraIndex >= 12 ? 0.3 : eraIndex >= 7 ? 0.28 : 0.24,
    avenue: eraIndex >= 12 ? 0.46 : eraIndex >= 7 ? 0.42 : 0.36,
    main: eraIndex >= 12 ? 0.62 : eraIndex >= 7 ? 0.56 : 0.48
  };
  const detailRate = rank === "main" ? 5 : rank === "avenue" ? 7 : rank === "secondary" ? 9 : 13;
  return {
    palette,
    width: widthByRank[rank] || widthByRank.secondary,
    detailRate,
    borderStrength: rank === "main" ? 1.2 : rank === "avenue" ? 0.85 : rank === "secondary" ? 0.5 : 0.2
  };
}

/* ---- legacy citymap rendering\ground.js ---- */


/* ============================================================================
 * citymap-render-ground.js - Rendu du fond de carte Canvas.
 *   Sol, masse urbaine, fleuve, foret, vestiges et voile nocturne.
 * ============================================================================ */

const CITY_MAP_GREENS = ["#2d5a1b", "#3a6b22", "#4a7a2a", "#255018", "#1e4010", "#3d7220", "#5a8c2e", "#223d14"];

// Mélange linéaire de deux couleurs [r,g,b] — t=0 → a, t=1 → b.
function cmLerpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

// Sol urbain par ère : terre battue → pavé chaud → pierre claire → asphalte.
// La santé tire vers le brun terne : le brun est un signal de crise, pas
// l'état par défaut d'une grande ville.
function cmUrbanGroundRgb(band, health) {
  const byBand = band >= 6 ? [92, 94, 99]      // asphalte de mégalopole
    : band >= 5 ? [134, 128, 112]              // esplanades de pierre claire
    : band >= 4 ? [122, 112, 88]               // dallage impérial
    : band >= 3 ? [104, 92, 64]                // pavé de cité fortifiée
    : [88, 72, 42];                            // terre battue chaude
  const sick = [62, 50, 30];                   // brun-crotte de crise
  const k = 1 - Math.max(0, Math.min(1, (health - 0.18) / 0.5)); // 0 sain → 1 malade
  return cmLerpRgb(byBand, sick, k * 0.85);
}

function cityMapDrawUrbanMass(layout) {
  if (!layout || layout.counts.eraBand < 2) return;
  const ctx = CM.ctx;
  // Le halo urbain suit le cœur de ville du plan procédural (pas le centre de grille).
  const coreX = layout.plan?.core?.x ?? layout.cx;
  const coreY = layout.plan?.core?.y ?? layout.cy;
  const worldCx = coreX * CM.TILE;
  const worldCy = coreY * CM.TILE;
  const rx = Math.min(layout.gridN * CM.TILE * 0.49, (6 + layout.counts.eraIndex * 3.8 + layout.counts.urbanTier * 7) * CM.TILE);
  const ry = rx * 0.78;
  const sx = (worldCx - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (worldCy - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const [ur, ug, ub] = cmUrbanGroundRgb(layout.counts.eraBand, CM.healthF);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, rx * CM.cam.zoom));
  g.addColorStop(0, `rgba(${ur},${ug},${ub},0.62)`);
  g.addColorStop(0.58, `rgba(${Math.round(ur * 0.8)},${Math.round(ug * 0.8)},${Math.round(ub * 0.8)},0.4)`);
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
  const sx = ((layout.plan?.core?.x ?? layout.cx) * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = ((layout.plan?.core?.y ?? layout.cy) * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const radius = (10 + tier * 12) * CM.TILE * CM.cam.zoom;
  const [ur, ug, ub] = cmUrbanGroundRgb(layout.counts.eraBand, CM.healthF);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, radius));
  g.addColorStop(0, `rgba(${ur},${ug},${ub},0.55)`);
  g.addColorStop(0.45, `rgba(${Math.round(ur * 0.78)},${Math.round(ug * 0.78)},${Math.round(ub * 0.78)},0.34)`);
  g.addColorStop(1, "rgba(45,58,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
}

function cityMapDrawVestiges() {
  // Ruines des civilisations passées : colonnes brisées, pans de murs,
  // gravats et végétation qui reprend ses droits — pas de simples carrés.
  if (!Array.isArray(state.vestiges) || !state.vestiges.length) return;
  const ctx = CM.ctx, s = CM.TILE * CM.cam.zoom;
  for (let v = 0; v < state.vestiges.length; v += 1) {
    const ves = state.vestiges[v];
    if (!ves || !ves.ruins) continue;
    const off = (CM.gridN - (ves.gridN || CM.gridN)) / 2;
    // Les vestiges récents (v élevé) sont plus visibles que les anciens.
    const age = 0.3 + v * 0.16;
    for (const c of ves.ruins) {
      const gx = c.x + off, gy = c.y + off;
      const sx = (gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
      const sy = (gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
      if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
      const h = ((gx * 31 + gy * 17 + v * 7) >>> 0) % 5;
      ctx.globalAlpha = age;
      if (h === 0) {
        // Colonne brisée : fût clair + chapiteau tombé
        ctx.fillStyle = "#8a8070";
        ctx.fillRect(sx + s * 0.38, sy + s * 0.3, s * 0.16, s * 0.4);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(sx + s * 0.38, sy + s * 0.3, s * 0.06, s * 0.4);
        ctx.fillStyle = "#6e6455";
        ctx.fillRect(sx + s * 0.58, sy + s * 0.6, s * 0.2, s * 0.12);
      } else if (h === 1) {
        // Pan de mur en L
        ctx.fillStyle = "#5d564a";
        ctx.fillRect(sx + s * 0.2, sy + s * 0.26, s * 0.5, s * 0.14);
        ctx.fillRect(sx + s * 0.2, sy + s * 0.26, s * 0.14, s * 0.46);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(sx + s * 0.2, sy + s * 0.36, s * 0.5, s * 0.04);
      } else if (h === 2) {
        // Gravats épars
        ctx.fillStyle = "#534c40";
        ctx.fillRect(sx + s * 0.25, sy + s * 0.5, s * 0.18, s * 0.14);
        ctx.fillRect(sx + s * 0.52, sy + s * 0.34, s * 0.14, s * 0.12);
        ctx.fillRect(sx + s * 0.45, sy + s * 0.62, s * 0.1, s * 0.09);
      } else if (h === 3) {
        // Fondations envahies de végétation
        ctx.fillStyle = "#473f33";
        ctx.fillRect(sx + s * 0.22, sy + s * 0.22, s * 0.56, s * 0.56);
        ctx.fillStyle = "rgba(74,110,42,0.55)";
        ctx.beginPath(); ctx.arc(sx + s * 0.36, sy + s * 0.4, s * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + s * 0.62, sy + s * 0.6, s * 0.12, 0, Math.PI * 2); ctx.fill();
      } else {
        // Dalle fissurée
        ctx.fillStyle = "#4e4639";
        ctx.fillRect(sx + s * 0.24, sy + s * 0.28, s * 0.52, s * 0.46);
        ctx.strokeStyle = "rgba(20,14,8,0.6)"; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.moveTo(sx + s * 0.32, sy + s * 0.3); ctx.lineTo(sx + s * 0.6, sy + s * 0.7); ctx.stroke();
      }
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
      // La nuit, l'eau reflète les lumières chaudes de la ville.
      const nf = CM.nightF || 0;
      ctx.fillStyle = nf > 0.3
        ? `rgba(255,210,130,${(refA * flick * (0.8 + nf)).toFixed(3)})`
        : `rgba(255,255,255,${(refA * flick).toFixed(3)})`;
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

  // Parametres par arbre (stables, calculÃ©s une fois)
  const trees = [];
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      if (!hasTree(gx, gy)) continue;
      const h = cmHash(gx + "f" + gy) % 100;
      const edge = nearCity(gx, gy);
      // LÃ©ger dÃ©calage pseudo-alÃ©atoire dans la case pour casser la grille
      const jx = ((h * 17 + gx * 3) % 30 - 15) / 100;
      const jy = ((h * 13 + gy * 7) % 30 - 15) / 100;
      const cx = (gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * z + CM.cw / 2 + jx * s;
      const cy = (gy * CM.TILE + CM.TILE / 2 - CM.cam.y) * z + CM.ch / 2 + jy * s;
      // Rayon: lisiÃ¨re = petit, intÃ©rieur = grand (chevauche les voisins)
      const r = edge
        ? s * (0.20 + (h % 4) * 0.025)
        : s * (0.36 + (h % 5) * 0.04);
      // Couleurs: base sombre, canopÃ©e, surbrillance
      const colBase  = CITY_MAP_GREENS[(h % 4) + 4];      // verts sombres index 4-7
      const colTop   = CITY_MAP_GREENS[h % 4];             // verts moyens  index 0-3
      trees.push({ cx, cy, r, colBase, colTop, h, edge });
    }
  }

  // LOD : un seul disque plein par arbre — la forêt reste une masse verte
  // lisible sans payer ombre + tronc + couronne + reflet par arbre.
  if (CM.lodActive) {
    for (const t of trees) {
      ctx.fillStyle = t.colBase;
      ctx.beginPath();
      ctx.arc(t.cx, t.cy - t.r * 0.5, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Passe 1 â€” ombres portÃ©es sous chaque arbre
  for (const t of trees) {
    // L'ombre se place sous le pied du tronc, dÃ©calÃ©e Ã  droite
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(
      t.cx + t.r * 0.18, t.cy + t.r * 0.80,
      t.r * 0.90, t.r * 0.32,
      0, 0, Math.PI * 2
    );
    ctx.fill();
  }

  // Passe 2 â€” troncs + couronnes
  // GÃ©omÃ©trie : couronne centrÃ©e Ã  cy - r*0.50  â†’  bas de la couronne = cy + r*0.50
  //             tronc descend jusqu'Ã  cy + r*0.90  â†’  r*0.40 de tronc visible en bas
  for (const t of trees) {
    // --- Tronc ---
    const tw = Math.max(1.5, t.r * (t.edge ? 0.11 : 0.16));
    const trunkTop = t.cy - t.r * 0.15;   // part juste sous la couronne (sera cachÃ©)
    const trunkBot = t.cy + t.r * (t.edge ? 0.72 : 0.90); // dÃ©passe sous la couronne
    ctx.fillStyle = "#3a1e06";
    ctx.fillRect(t.cx - tw / 2, trunkTop, tw, trunkBot - trunkTop);
    // Face gauche plus claire pour donner du volume cylindrique
    ctx.fillStyle = "rgba(100,55,15,0.55)";
    ctx.fillRect(t.cx - tw / 2, trunkTop, tw * 0.42, trunkBot - trunkTop);

    // --- Couronne : montÃ©e haut pour laisser le tronc visible en bas ---
    // Cercle sombre (bord de la couronne)
    ctx.fillStyle = t.colBase;
    ctx.beginPath();
    ctx.arc(t.cx, t.cy - t.r * 0.50, t.r, 0, Math.PI * 2);
    ctx.fill();

    // Cercle principal (couleur vive), lÃ©gÃ¨rement dÃ©calÃ© haut-gauche
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
  // Aube/crépuscule : voile chaud quand la nuit monte ou descend (pic à n=0.5).
  const twilight = 4 * n * (1 - n);
  if (twilight > 0.25) {
    const ctx2 = CM.ctx;
    // L'aube (nuit qui tombe → fausse : phase montante = crépuscule, descendante = aube)
    const dawn = CM.dayRising === false;
    const warmCol = dawn ? "255,170,90" : "255,120,50";
    ctx2.fillStyle = `rgba(${warmCol},${((twilight - 0.25) * 0.16).toFixed(3)})`;
    ctx2.fillRect(0, 0, CM.cw, CM.ch);
  }
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

// ── Enceinte urbaine : muraille continue, tours, portes ─────────────────────
// L'enceinte évolue avec l'ère : palissade de bois (cité fortifiée naissante),
// mur de pierre (royaume/empire), remparts monumentaux clairs (métropole+).
// Contraste assumé : liseré sombre sous le corps du mur pour qu'elle se
// détache nettement du sol, quel que soit l'âge.
function cityMapDrawWalls() {
  const L = CM.layout;
  if (!L || !L.walls || !L.walls.cells.length) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE, s = T * z;
  const band = L.counts.eraBand;
  const ruined = CM.frameRuined;
  const wooden = !ruined && band <= 3 && (L.walls.tier || 1) <= 1;
  const stone = ruined ? "#555046"
    : wooden ? "#8a6432"
    : band >= 5 ? "#b3ac9b"
    : band >= 4 ? "#a39a85"
    : "#92897a";
  const stoneDark = ruined ? "#332f28" : wooden ? "#4f3a1a" : "#3e3a30";
  const stoneLight = wooden ? "rgba(255,222,160,0.22)" : "rgba(255,255,255,0.28)";
  const outline = "rgba(16,13,9,0.6)";
  const SXY = (gx, gy) => [(gx * T - CM.cam.x) * z + CM.cw / 2, (gy * T - CM.cam.y) * z + CM.ch / 2];

  // ── Corps du rempart : polyligne CONTINUE le long du contour ─────────────
  // (les cellules rasterisées en diagonale ne se touchent que par les coins ;
  // seul un tracé continu donne une enceinte lisible qui ceinture la ville)
  const ol = L.walls.outline;
  const gates = Array.isArray(L.walls.gates) ? L.walls.gates : [];
  // Extrémités exactes des segments de mur interrompus par chaque porte :
  // les tours de porte se posent dessus (le mur va JUSQU'À la tour).
  const towerAnchors = new Map(); // gate -> [{x,y}, ...]
  if (Array.isArray(ol) && ol.length > 2) {
    // Segments : on coupe la boucle aux points en eau (brèche du fleuve) et
    // aux portes. La coupe de porte est INTERPOLÉE pile au bord de
    // l'ouverture — supprimer des points entiers laissait des trous de
    // plusieurs tuiles entre le bout du mur et les tours.
    const GATE_R = 1.15; // demi-ouverture (tuiles)
    const gateOf = (p) => {
      for (const g of gates) if (Math.hypot(p.x - g.gx, p.y - g.gy) < GATE_R) return g;
      return null;
    };
    // Point du segment [pOut→pIn] à distance GATE_R du centre de la porte.
    const clipTo = (pOut, pIn, g) => {
      const dOut = Math.hypot(pOut.x - g.gx, pOut.y - g.gy);
      const dIn = Math.hypot(pIn.x - g.gx, pIn.y - g.gy);
      const t = Math.max(0, Math.min(1, (dOut - GATE_R) / Math.max(0.0001, dOut - dIn)));
      return { x: pOut.x + (pIn.x - pOut.x) * t, y: pOut.y + (pIn.y - pOut.y) * t };
    };
    const addAnchor = (g, pt) => {
      const arr = towerAnchors.get(g) || [];
      if (!arr.some((a) => Math.hypot(a.x - pt.x, a.y - pt.y) < 0.5)) arr.push(pt);
      towerAnchors.set(g, arr);
    };
    const segs = [];
    let cur = [];
    let prev = null, prevGate = null;
    for (let i = 0; i <= ol.length; i += 1) {
      const p = ol[i % ol.length];
      const g = p.water ? null : gateOf(p);
      if (p.water || g) {
        if (cur.length) {
          // Le mur entre dans l'ouverture : prolonge jusqu'au bord exact.
          if (g && prev && !prev.water) {
            const cp = clipTo(prev, p, g);
            cur.push(cp);
            addAnchor(g, cp);
          }
          if (cur.length > 1) segs.push(cur);
          cur = [];
        }
      } else {
        // Le mur ressort d'une ouverture : repart du bord exact.
        if (prevGate && prev) {
          const cp = clipTo(p, prev, prevGate);
          cur.push(cp);
          addAnchor(prevGate, cp);
        }
        cur.push(p);
        if (i === ol.length && cur.length > 1) { segs.push(cur); cur = []; }
      }
      prev = p;
      prevGate = g;
    }
    if (cur.length > 1) segs.push(cur);
    // Le contour peut effleurer le rayon d'ouverture et ressortir brièvement :
    // on jette les mini-tronçons orphelins coincés dans l'ouverture, et on ne
    // garde par porte que les deux ancres les plus écartées — les VRAIES
    // extrémités du mur interrompu.
    for (let si = segs.length - 1; si >= 0; si -= 1) {
      const seg = segs[si];
      if (seg.length <= 3 && gates.some((g) => seg.every((p) => Math.hypot(p.x - g.gx, p.y - g.gy) < GATE_R + 1.2))) {
        segs.splice(si, 1);
      }
    }
    for (const [g, arr] of towerAnchors) {
      if (arr.length <= 2) continue;
      let bi = 0, bj = 1, bd = -1;
      for (let i = 0; i < arr.length; i += 1) {
        for (let j = i + 1; j < arr.length; j += 1) {
          const d = Math.hypot(arr[i].x - arr[j].x, arr[i].y - arr[j].y);
          if (d > bd) { bd = d; bi = i; bj = j; }
        }
      }
      towerAnchors.set(g, [arr[bi], arr[bj]]);
    }
    const trace = (seg) => {
      ctx.beginPath();
      const [x0, y0] = SXY(seg[0].x + 0.5, seg[0].y + 0.5);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < seg.length; i += 1) {
        const [x, y] = SXY(seg[i].x + 0.5, seg[i].y + 0.5);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const seg of segs) {
      // Ombre portée, liseré sombre, corps, puis chemin de ronde clair.
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = Math.max(2, s * 0.5);
      ctx.save(); ctx.translate(s * 0.1, s * 0.14); trace(seg); ctx.restore();
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(2.5, s * (band >= 5 ? 0.56 : 0.5));
      trace(seg);
      ctx.strokeStyle = stone;
      ctx.lineWidth = Math.max(1.5, s * (band >= 5 ? 0.4 : 0.34));
      trace(seg);
      ctx.strokeStyle = stoneLight;
      ctx.lineWidth = Math.max(1, s * 0.1);
      trace(seg);
    }
    ctx.lineJoin = "miter";
    ctx.lineCap = "square";
    // Créneaux / rondins : pointillés sombres réguliers le long du tracé.
    if (s > 9) {
      ctx.fillStyle = stoneDark;
      const dotS = Math.max(1.2, s * (wooden ? 0.1 : band >= 5 ? 0.16 : 0.13));
      const step = wooden ? 0.34 : 0.55; // en tuiles
      for (const seg of segs) {
        for (let i = 1; i < seg.length; i += 1) {
          const a = seg[i - 1], b = seg[i];
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          const n = Math.max(1, Math.round(d / step));
          for (let k = 0; k < n; k += 1) {
            const t2 = k / n;
            const [px, py] = SXY(a.x + (b.x - a.x) * t2 + 0.5, a.y + (b.y - a.y) * t2 + 0.5);
            ctx.fillRect(px - dotS / 2, py - dotS / 2, dotS, dotS);
          }
        }
      }
    }
  }

  // ── Portes : deux tours encadrant l'ouverture, sur les grands axes ──────
  for (const g of gates) {
    const [gx, gy] = SXY(g.gx + 0.5, g.gy + 0.5);
    if (gx < -s * 3 || gy < -s * 3 || gx > CM.cw + s * 3 || gy > CM.ch + s * 3) continue;
    // Les tours flanquent l'ouverture LE LONG du rempart : on suit la tangente
    // du contour au point de porte (le mask de route trompe aux carrefours).
    let tdx = Math.abs(Math.cos(g.angle)) < 0.7 ? 1 : 0, tdy = tdx ? 0 : 1;
    if (Array.isArray(ol) && ol.length > 2) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < ol.length; i += 1) {
        const d = Math.hypot(ol[i].x - g.gx, ol[i].y - g.gy);
        if (d < bd) { bd = d; bi = i; }
      }
      const pa = ol[(bi - 1 + ol.length) % ol.length], pb = ol[(bi + 1) % ol.length];
      const tl = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
      tdx = (pb.x - pa.x) / tl; tdy = (pb.y - pa.y) / tl;
    }
    const tw2 = s * 0.66; // côté d'une tour
    const towerCol = wooden ? "#9a7438" : band >= 5 ? "#c4bda9" : stone;
    // Une tour à CHAQUE extrémité du mur interrompu (point de coupe exact du
    // tracé). Repli sur la tangente si la porte n'a pas borné de segment.
    let anchors = towerAnchors.get(g) || [];
    if (anchors.length < 2) {
      anchors = [
        { x: g.gx + tdx * 1.05, y: g.gy + tdy * 1.05 },
        { x: g.gx - tdx * 1.05, y: g.gy - tdy * 1.05 }
      ];
    }
    for (const a of anchors) {
      const [ax, ay] = SXY(a.x + 0.5, a.y + 0.5);
      const tx = ax - tw2 / 2;
      const ty = ay - tw2 / 2;
      // Ombre + liseré + corps
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(tx + s * 0.08, ty + s * 0.1, tw2, tw2);
      ctx.fillStyle = outline;
      const o2 = Math.max(1, s * 0.06);
      ctx.fillRect(tx - o2, ty - o2, tw2 + o2 * 2, tw2 + o2 * 2);
      ctx.fillStyle = stoneDark;
      ctx.fillRect(tx, ty, tw2, tw2);
      ctx.fillStyle = towerCol;
      ctx.fillRect(tx + tw2 * 0.14, ty + tw2 * 0.14, tw2 * 0.72, tw2 * 0.72);
      // Merlons d'angle
      ctx.fillStyle = stoneDark;
      const ms2 = Math.max(1, tw2 * 0.18);
      for (const [mx, my] of [[0.06, 0.06], [0.76, 0.06], [0.06, 0.76], [0.76, 0.76]]) {
        ctx.fillRect(tx + tw2 * mx, ty + tw2 * my, ms2, ms2);
      }
      // Fanion
      ctx.strokeStyle = "#2a2620"; ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath(); ctx.moveTo(tx + tw2 / 2, ty - s * 0.16); ctx.lineTo(tx + tw2 / 2, ty + tw2 * 0.2); ctx.stroke();
      ctx.fillStyle = ruined ? "rgba(120,60,40,0.5)" : "#9a3c28";
      ctx.beginPath();
      ctx.moveTo(tx + tw2 / 2, ty - s * 0.16);
      ctx.lineTo(tx + tw2 / 2 + s * 0.2, ty - s * 0.08);
      ctx.lineTo(tx + tw2 / 2, ty - s * 0.01);
      ctx.closePath(); ctx.fill();
    }
    // Entre les deux tours : RIEN — l'ouverture laisse voir le sol et la
    // route qui passe (pas de remplissage, pas de halo).
  }

  // ── Tours de courtine : structures ponctuelles par-dessus le rempart ────
  for (const c of L.walls.cells) {
    if (c.kind !== "tower") continue;
    const [x, y] = SXY(c.gx, c.gy);
    if (x < -s * 2 || y < -s * 2 || x > CM.cw + s || y > CM.ch + s) continue;
    // Socle de tour : masse sombre détachée du sol
    const o = Math.max(1, s * 0.06);
    ctx.fillStyle = outline;
    ctx.fillRect(x + s * 0.08 - o, y + s * 0.08 - o, s * 0.84 + o * 2, s * 0.84 + o * 2);
    ctx.fillStyle = stoneDark;
    ctx.fillRect(x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84);
    {
      if (wooden) {
        // Tour de guet en bois : plateforme claire + toit pointu sombre
        ctx.fillStyle = "#9a7438";
        ctx.fillRect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56);
        ctx.fillStyle = "#4f3a1a";
        ctx.beginPath();
        ctx.moveTo(x + s * 0.5, y - s * 0.1);
        ctx.lineTo(x + s * 0.76, y + s * 0.26);
        ctx.lineTo(x + s * 0.24, y + s * 0.26);
        ctx.closePath(); ctx.fill();
      } else {
        // Toit de tour + fanion
        ctx.fillStyle = band >= 5 ? "#c4bda9" : stone;
        ctx.fillRect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56);
        // Merlons d'angle sur les grandes tours de métropole
        if (band >= 5) {
          ctx.fillStyle = stoneDark;
          const ms = Math.max(1, s * 0.12);
          for (const [mx, my] of [[0.16, 0.16], [0.72, 0.16], [0.16, 0.72], [0.72, 0.72]]) {
            ctx.fillRect(x + s * mx, y + s * my, ms, ms);
          }
        }
        ctx.fillStyle = ruined ? "rgba(120,60,40,0.5)" : "#9a3c28";
        ctx.beginPath();
        ctx.moveTo(x + s * 0.5, y - s * 0.18);
        ctx.lineTo(x + s * 0.78, y - s * 0.06);
        ctx.lineTo(x + s * 0.5, y + s * 0.04);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#2a2620"; ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath(); ctx.moveTo(x + s * 0.5, y - s * 0.18); ctx.lineTo(x + s * 0.5, y + s * 0.3); ctx.stroke();
      }
    }
  }
}

// ── Esplanade des places : dallage continu (couche statique) ────────────────
// Une vraie place : surface pavée d'un seul tenant, rosace centrale, bordure
// de pierre et dalles irrégulières — pas un carré de routes.
function cityMapDrawPlazaSurface() {
  const L = CM.layout;
  if (!L || !L.plan || !Array.isArray(L.plan.plazas) || !L.plan.plazas.length) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const band = L.counts ? L.counts.eraBand : 0;
  const ruined = CM.frameRuined;
  const dark = "rgba(40,30,16,0.3)";
  const light = "rgba(255,240,210,0.14)";
  for (const p of L.plan.plazas) {
    if (!p.size || p.size < 2) continue;
    const kind = p.kind || "centrale";
    const seedH = ((p.gx * 73856093) ^ (p.gy * 19349663)) >>> 0;
    const half = Math.floor(p.size / 2);
    const x0 = ((p.gx - half) * T - CM.cam.x) * z + CM.cw / 2;
    const y0 = ((p.gy - half) * T - CM.cam.y) * z + CM.ch / 2;
    const wPx = p.size * T * z, hPx = p.size * T * z;
    if (x0 > CM.cw + wPx || y0 > CM.ch + hPx || x0 + wPx < -wPx || y0 + hPx < -hPx) continue;
    const cx = x0 + wPx / 2, cy = y0 + hPx / 2;
    const inset = T * z * 0.06;
    const rr = (n) => ((Math.imul(seedH, 2654435761 + n * 97) >>> 0) % 1000) / 1000;

    // ── Sol selon l'âge ─────────────────────────────────────────────────
    const base = ruined ? "#4a4336"
      : band <= 1 ? "#7c6238"               // terre battue
      : band <= 3 ? "#94815c"               // pavé rustique
      : band >= 6 ? "#9a958a"               // esplanade moderne
      : "#a08e6e";                          // dallage classique
    ctx.fillStyle = base;
    ctx.beginPath();
    const corner = band <= 1 ? T * z * 0.55 : T * z * 0.3;
    if (ctx.roundRect) ctx.roundRect(x0 + inset, y0 + inset, wPx - inset * 2, hPx - inset * 2, corner);
    else ctx.rect(x0 + inset, y0 + inset, wPx - inset * 2, hPx - inset * 2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, T * z * 0.08);
    ctx.stroke();

    if (band <= 1) {
      // Terre battue : taches d'usure + cercle de pierres au bord
      ctx.fillStyle = "rgba(60,44,20,0.25)";
      for (let i = 0; i < 7; i += 1) {
        ctx.beginPath();
        ctx.ellipse(x0 + inset + rr(i) * (wPx - inset * 2), y0 + inset + rr(i + 9) * (hPx - inset * 2),
          T * z * (0.12 + rr(i + 20) * 0.14), T * z * (0.07 + rr(i + 31) * 0.08), rr(i) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#5d5142";
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 + rr(40) * 0.6;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (wPx / 2 - inset * 3), cy + Math.sin(a) * (hPx / 2 - inset * 3), Math.max(1, T * z * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (band <= 3) {
      // Pavé rustique : galets épars (pointillisme), pas de joints réguliers
      ctx.fillStyle = "rgba(70,56,34,0.3)";
      const nCobbles = Math.round(p.size * p.size * 9);
      for (let i = 0; i < nCobbles; i += 1) {
        ctx.fillRect(
          x0 + inset + rr(i * 2) * (wPx - inset * 2 - 2),
          y0 + inset + rr(i * 2 + 1) * (hPx - inset * 2 - 2),
          Math.max(1, T * z * 0.07), Math.max(1, T * z * 0.05));
      }
    } else if (band >= 6) {
      // Esplanade moderne : grandes dalles lisses ; les joints ne s'illuminent
      // que la nuit (joints sombres discrets le jour).
      ctx.strokeStyle = (CM.nightF || 0) > 0.05
        ? `rgba(120,200,230,${((CM.nightF || 0) * 0.36).toFixed(2)})`
        : "rgba(60,70,78,0.25)";
      ctx.lineWidth = Math.max(0.5, T * z * 0.03);
      const cell2 = T * z;
      for (let ry = y0 + cell2; ry < y0 + hPx - inset; ry += cell2) {
        ctx.beginPath(); ctx.moveTo(x0 + inset, ry); ctx.lineTo(x0 + wPx - inset, ry); ctx.stroke();
      }
      for (let rx = x0 + cell2; rx < x0 + wPx - inset; rx += cell2) {
        ctx.beginPath(); ctx.moveTo(rx, y0 + inset); ctx.lineTo(rx, y0 + hPx - inset); ctx.stroke();
      }
    } else {
      // Dallage classique en appareil décalé
      ctx.strokeStyle = "rgba(55,42,24,0.22)";
      ctx.lineWidth = Math.max(0.5, T * z * 0.025);
      const cell = T * z * 0.5;
      for (let ry = y0 + inset + cell; ry < y0 + hPx - inset; ry += cell) {
        ctx.beginPath(); ctx.moveTo(x0 + inset, ry); ctx.lineTo(x0 + wPx - inset, ry); ctx.stroke();
      }
      let off = 0;
      for (let ry = y0 + inset; ry < y0 + hPx - inset; ry += cell) {
        for (let rx = x0 + inset + cell * (0.5 + off); rx < x0 + wPx - inset; rx += cell) {
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, Math.min(ry + cell, y0 + hPx - inset)); ctx.stroke();
        }
        off = off ? 0 : 0.5;
      }
    }

    // ── Motifs selon le type de place ───────────────────────────────────
    if (kind === "jardin") {
      // Square public : pelouse centrale, allées en croix, bassin
      ctx.fillStyle = ruined ? "rgba(86,96,52,0.6)" : "#5d7a34";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0 + inset * 3, y0 + inset * 3, wPx - inset * 6, hPx - inset * 6, T * z * 0.35);
      else ctx.rect(x0 + inset * 3, y0 + inset * 3, wPx - inset * 6, hPx - inset * 6);
      ctx.fill();
      // Allées
      ctx.fillStyle = base;
      const pw = Math.max(2, T * z * 0.22);
      ctx.fillRect(x0 + inset, cy - pw / 2, wPx - inset * 2, pw);
      ctx.fillRect(cx - pw / 2, y0 + inset, pw, hPx - inset * 2);
      // Bassin central
      ctx.fillStyle = "#2a5a8b";
      ctx.beginPath(); ctx.arc(cx, cy, wPx * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#6e6354"; ctx.lineWidth = Math.max(1, T * z * 0.05);
      ctx.beginPath(); ctx.arc(cx, cy, wPx * 0.13, 0, Math.PI * 2); ctx.stroke();
    } else if (kind === "parvis" && band >= 2) {
      // Parvis : rayons convergeant vers le sanctuaire (motif solaire)
      ctx.strokeStyle = "rgba(232,210,160,0.3)";
      ctx.lineWidth = Math.max(0.5, T * z * 0.04);
      for (let i = 0; i < 12; i += 1) {
        const a = i * Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * wPx * 0.1, cy + Math.sin(a) * wPx * 0.1);
        ctx.lineTo(cx + Math.cos(a) * wPx * 0.42, cy + Math.sin(a) * wPx * 0.42);
        ctx.stroke();
      }
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.arc(cx, cy, wPx * 0.1, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "centrale" && band >= 3) {
      // Rosace de la grande place
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.arc(cx, cy, wPx * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, T * z * 0.05);
      ctx.beginPath(); ctx.arc(cx, cy, wPx * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, wPx * 0.16, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i += 1) {
        const a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * wPx * 0.16, cy + Math.sin(a) * wPx * 0.16);
        ctx.lineTo(cx + Math.cos(a) * wPx * 0.3, cy + Math.sin(a) * wPx * 0.3);
        ctx.stroke();
      }
    }

    // Bornes de pierre aux quatre coins (à partir du pavé)
    if (band >= 2) {
      ctx.fillStyle = ruined ? "#3c362c" : "#6e6354";
      const bs = Math.max(1.5, T * z * 0.14);
      for (const [bx, by] of [[x0 + inset * 3, y0 + inset * 3], [x0 + wPx - inset * 3 - bs, y0 + inset * 3], [x0 + inset * 3, y0 + hPx - inset * 3 - bs], [x0 + wPx - inset * 3 - bs, y0 + hPx - inset * 3 - bs]]) {
        ctx.fillRect(bx, by, bs, bs);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(bx, by, bs, Math.max(0.5, bs * 0.3));
        ctx.fillStyle = ruined ? "#3c362c" : "#6e6354";
      }
    }
  }
}

// ── Mobilier de place : bancs, lanternes, parterres de fleurs ───────────────
function cityMapDrawPlazaFurniture(ctx, cx, cy, ext, s, band, night, seedH, kind) {
  const rr = (n) => ((Math.imul(seedH, 2654435761 + n * 131) >>> 0) % 1000) / 1000;
  // Bancs (dès le bourg) : à intervalles RÉGULIERS et symétriques le long des
  // quatre bords, tournés vers le centre — une place est un espace ordonné.
  if (band >= 2) {
    ctx.fillStyle = "#5d4226";
    const bw = s * 0.34, bh = s * 0.09;
    const off = ext * 0.74; // distance du bord (laisse les angles aux lanternes)
    // Grandes places : deux bancs par côté (±), petites : un banc centré.
    const slots = ext > s * 1.2 ? [-0.56, 0.56] : [0];
    for (const t of slots) {
      const along = t * ext;
      ctx.fillRect(cx + along - bw / 2, cy - off, bw, bh);      // bord nord
      ctx.fillRect(cx + along - bw / 2, cy + off - bh, bw, bh); // bord sud
      ctx.fillRect(cx - off, cy + along - bw / 2, bh, bw);      // bord ouest
      ctx.fillRect(cx + off - bh, cy + along - bw / 2, bh, bw); // bord est
    }
  }
  // Lanternes d'angle (dès la cité fortifiée) : éteintes le jour (verre
  // sombre), émission additive qui monte avec la nuit.
  if (band >= 3) {
    for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = cx + lx * ext * 0.62, py = cy + ly * ext * 0.62;
      ctx.strokeStyle = "#3c342a"; ctx.lineWidth = Math.max(1, s * 0.045);
      ctx.beginPath(); ctx.moveTo(px, py + s * 0.1); ctx.lineTo(px, py - s * 0.26); ctx.stroke();
      // Tête physique de la lanterne : verre sombre, toujours visible.
      ctx.fillStyle = "#4a4034";
      ctx.beginPath(); ctx.arc(px, py - s * 0.3, Math.max(1.2, s * 0.06), 0, Math.PI * 2); ctx.fill();
      // Émission : cœur vif + halo radial, tous deux ∝ nightF (0 le jour).
      cmDrawGlow(ctx, px, py - s * 0.3, Math.max(2, s * 0.1), 255, 215, 120, night * 1.1);
      cmDrawGlow(ctx, px, py - s * 0.3, s * 0.36, 255, 195, 90, night * 0.55);
    }
  }
  // Parterres de fleurs (ères riches, et toujours dans les jardins)
  if (band >= 4 || kind === "jardin") {
    const FLOWERS = ["#d05a8a", "#e8c64a", "#c84a3a", "#9a6ac8", "#e88a3a"];
    const nBeds = kind === "jardin" ? 5 : 2;
    for (let b = 0; b < nBeds; b += 1) {
      const a = rr(b + 11) * Math.PI * 2;
      const d = ext * (kind === "jardin" ? 0.3 + rr(b + 17) * 0.3 : 0.55);
      const fx = cx + Math.cos(a) * d, fy = cy + Math.sin(a) * d;
      ctx.fillStyle = "rgba(74,98,44,0.8)";
      ctx.beginPath(); ctx.ellipse(fx, fy, s * 0.13, s * 0.09, a, 0, Math.PI * 2); ctx.fill();
      for (let f = 0; f < 4; f += 1) {
        ctx.fillStyle = FLOWERS[(b * 3 + f + (seedH % 5)) % FLOWERS.length];
        ctx.beginPath();
        ctx.arc(fx + (rr(b * 7 + f) - 0.5) * s * 0.2, fy + (rr(b * 9 + f) - 0.5) * s * 0.13, Math.max(0.8, s * 0.025), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ── Places publiques : pièce maîtresse selon le TYPE de place, puis selon la
//    personnalité de la ville pour la place centrale + mobilier par ère ──────
function cityMapDrawPlazas(now) {
  const L = CM.layout;
  if (!L || !L.plan || !Array.isArray(L.plan.plazas)) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const band = L.counts ? L.counts.eraBand : 0;
  const night = CM.nightF || 0;
  const basePid = L.personality ? L.personality.id : "marchande";
  const t = now || 0;
  for (const p of L.plan.plazas) {
    if (!p.size || p.size < 2) continue;
    const kind = p.kind || "centrale";
    const seedH = ((p.gx * 73856093) ^ (p.gy * 19349663)) >>> 0;
    const cx = ((p.gx + 0.5) * T - CM.cam.x) * z + CM.cw / 2;
    const cy = ((p.gy + 0.5) * T - CM.cam.y) * z + CM.ch / 2;
    const s = T * z;
    const ext = p.size * s / 2; // demi-étendue de la place à l'écran
    if (cx < -ext * 2 || cy < -ext * 2 || cx > CM.cw + ext * 2 || cy > CM.ch + ext * 2) continue;
    // Pièce maîtresse : le type de place prime ; la place centrale reflète la
    // personnalité de la ville.
    const pid = kind === "marche" ? "marchande"
      : kind === "parvis" ? "religieuse"
      : kind === "jardin" ? "jardin"
      : basePid;
    if (pid === "jardin") {
      // Square : reflets animés du bassin + saules en coin
      const shimmer = 0.2 + 0.15 * Math.sin(t / 700 + seedH);
      ctx.fillStyle = `rgba(200,230,255,${shimmer.toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cx - ext * 0.04, cy - ext * 0.04, ext * 0.1, 0, Math.PI * 2); ctx.fill();
      for (const [txd, tyd] of [[-0.55, -0.55], [0.55, 0.5]]) {
        const txp = cx + txd * ext, typ = cy + tyd * ext;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath(); ctx.ellipse(txp + s * 0.05, typ + s * 0.16, s * 0.18, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a2008"; ctx.fillRect(txp - s * 0.025, typ - s * 0.04, s * 0.05, s * 0.2);
        ctx.fillStyle = "#476b24";
        ctx.beginPath(); ctx.arc(txp, typ - s * 0.12, s * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(120,160,70,0.6)";
        ctx.beginPath(); ctx.arc(txp - s * 0.05, typ - s * 0.17, s * 0.1, 0, Math.PI * 2); ctx.fill();
      }
    } else if (pid === "marchande" || pid === "pauvre") {
      // Étals de marché : auvents rayés autour du centre
      const stalls = pid === "marchande" ? 4 : 2;
      for (let i = 0; i < stalls; i += 1) {
        const a = (i / stalls) * Math.PI * 2 + 0.6;
        const sx = cx + Math.cos(a) * s * 0.55, sy = cy + Math.sin(a) * s * 0.42;
        ctx.fillStyle = i % 2 ? "#a33c2a" : "#b08a3a";
        ctx.fillRect(sx - s * 0.18, sy - s * 0.13, s * 0.36, s * 0.26);
        ctx.fillStyle = "rgba(255,245,225,0.55)";
        ctx.fillRect(sx - s * 0.18, sy - s * 0.13, s * 0.36, s * 0.07);
        ctx.fillStyle = "rgba(40,22,8,0.6)";
        ctx.fillRect(sx - s * 0.16, sy + s * 0.08, s * 0.05, s * 0.07);
        ctx.fillRect(sx + s * 0.11, sy + s * 0.08, s * 0.05, s * 0.07);
      }
    } else if (pid === "religieuse") {
      // Statue votive sur socle + lueur
      ctx.fillStyle = "#6a6458"; ctx.fillRect(cx - s * 0.16, cy - s * 0.1, s * 0.32, s * 0.26);
      ctx.fillStyle = "#cfc6b0";
      ctx.fillRect(cx - s * 0.06, cy - s * 0.52, s * 0.12, s * 0.46);
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.58, s * 0.09, 0, Math.PI * 2); ctx.fill();
      const halo = 0.25 + 0.15 * Math.sin(t / 600) + (CM.nightF || 0) * 0.3;
      ctx.fillStyle = `rgba(255,228,150,${halo.toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.4, s * 0.13, 0, Math.PI * 2); ctx.fill();
    } else if (pid === "agricole") {
      // Puits communal : margelle + potence + seau
      ctx.fillStyle = "#6e6356"; ctx.beginPath(); ctx.arc(cx, cy, s * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#23303c"; ctx.beginPath(); ctx.arc(cx, cy, s * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#5a3c16"; ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.26, cy); ctx.lineTo(cx - s * 0.26, cy - s * 0.42); ctx.lineTo(cx + s * 0.26, cy - s * 0.42); ctx.lineTo(cx + s * 0.26, cy); ctx.stroke();
      ctx.strokeStyle = "#3a2a14"; ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.42); ctx.lineTo(cx, cy - s * 0.18); ctx.stroke();
    } else if (pid === "militaire") {
      // Mât à bannière + braseros
      ctx.strokeStyle = "#4a4438"; ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.15); ctx.lineTo(cx, cy - s * 0.6); ctx.stroke();
      const wave = Math.sin(t / 300) * s * 0.05;
      ctx.fillStyle = "#9a2c20";
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.6); ctx.lineTo(cx + s * 0.34, cy - s * 0.52 + wave); ctx.lineTo(cx, cy - s * 0.42);
      ctx.closePath(); ctx.fill();
      for (const bx of [-0.5, 0.5]) {
        const fx = cx + bx * s, fy = cy + s * 0.1;
        ctx.fillStyle = "#3c342a"; ctx.fillRect(fx - s * 0.07, fy, s * 0.14, s * 0.12);
        const fl = 0.55 + 0.45 * Math.abs(Math.sin(t / 170 + bx * 3));
        ctx.fillStyle = `rgba(255,150,40,${fl.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(fx, fy - s * 0.04, s * 0.08, 0, Math.PI * 2); ctx.fill();
      }
    } else if (pid === "savante") {
      // Cadran solaire / sphère armillaire
      ctx.strokeStyle = "#b8a060"; ctx.lineWidth = Math.max(1, s * 0.045);
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.18, s * 0.24, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.18, s * 0.24, s * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.18, s * 0.09, s * 0.24, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#6a6458"; ctx.fillRect(cx - s * 0.07, cy + s * 0.02, s * 0.14, s * 0.16);
    } else {
      // Fontaine (luxueuse / impériale / défaut) : bassin + jets animés
      ctx.fillStyle = "#7d7668"; ctx.beginPath(); ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2a5a8b"; ctx.beginPath(); ctx.arc(cx, cy, s * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8d867a"; ctx.beginPath(); ctx.arc(cx, cy, s * 0.08, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i += 1) {
        const ph = ((t / 900) + i / 5) % 1;
        const a = i * Math.PI * 2 / 5;
        const jr = s * (0.08 + ph * 0.16);
        ctx.fillStyle = `rgba(200,230,255,${(0.7 - ph * 0.6).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * jr, cy + Math.sin(a) * jr * 0.7 - s * (0.1 - ph * 0.1), Math.max(1, s * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Mobilier urbain : bancs, lanternes, parterres (selon l'ère et le type)
    cityMapDrawPlazaFurniture(ctx, cx, cy, ext, s, band, night, seedH, kind);
  }
}

// ── Brume matinale : nappes translucides dérivant le long du fleuve ────────
function cityMapDrawMist(now) {
  const L = CM.layout;
  const mist = CM.mistF || 0;
  if (mist < 0.04 || !L || !L.river || !L.river.samples) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const sm = L.river.samples;
  const t = now || 0;
  ctx.save();
  for (let i = 0; i < 14; i += 1) {
    const drift = ((t / 14000 + i * 0.13) % 1);
    const idx = Math.floor(drift * (sm.length - 1));
    const sp = sm[idx];
    const wob = Math.sin(t / 2600 + i * 1.9);
    const mx = (sp.x * T - CM.cam.x) * z + CM.cw / 2 + wob * 14 * z;
    const my = (sp.y * T - CM.cam.y) * z + CM.ch / 2 - (i % 3) * 8 * z;
    const rx = (34 + (i % 4) * 14) * z, ry = (10 + (i % 3) * 4) * z;
    if (mx < -rx || mx > CM.cw + rx || my < -ry || my > CM.ch + ry) continue;
    ctx.fillStyle = `rgba(214,224,228,${(mist * (0.1 + (i % 3) * 0.035)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(mx, my, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* ---- legacy citymap rendering\roads.js ---- */


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
  // Les cellules de place ne sont pas des chaussées : l'esplanade dallée est
  // dessinée d'un seul tenant par cityMapDrawPlazaSurface.
  if (r.rank === "plaza") return;
  const s = CM.TILE * CM.cam.zoom;
  const sx = (r.gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (r.gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) return;
  const ctx = CM.ctx;
  const layout = CM.layout;
  const eraIndex = CM.frameEraIndex || 0;
  const major = layout && (r.gx === layout.cx || r.gy === layout.cy);
  const ruined = CM.frameRuined || false;
  const roadRank = r.rank || "secondary";
  const roadStyle = getRoadVisualStyle(eraIndex, roadRank, ruined, major);
  const pal = roadStyle.palette;
  if (r.roadSurface === "bridge") return;

  const mask = cmRoadMask(layout, r.gx, r.gy);
  const degree = (mask.n ? 1 : 0) + (mask.e ? 1 : 0) + (mask.s ? 1 : 0) + (mask.w ? 1 : 0);
  const pathWidth = roadStyle.width;
  const half = s * pathWidth * 0.5;
  const cxp = sx + s / 2, cyp = sy + s / 2;
  const seed = r._seed ?? cmHash(`road:${r.gx}:${r.gy}:${eraIndex}`);

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
  // Boulevard : bande centrale pavée plus claire, signature des grands axes.
  if (roadRank === "main") drawAxis(pal.detail, half * 1.05);

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
  ctx.lineJoin = "miter"; // reset explicite â€” drawAxis pose "round" dans le save block

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
  // En vue LOD, les mâts de 2px sont du bruit — la couche de lumières
  // nocturnes assure seule l'éclairage vu de haut.
  if (CM.lodActive) return;
  const ei = L.counts.eraIndex;
  if (ei < 7) return;
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const night = CM.nightF || 0;
  const glowA = 0.45 + 0.55 * night;
  // La lanterne classique (style des places) est le look par défaut de la
  // ville ; les variantes futuriste/néon n'arrivent qu'aux ères avancées
  // (~35 ères au total : futuriste vers la métropole, néon en mégalopole).
  const cyberpunk = ei >= 30;
  const futuristic = ei >= 24;
  // Les esplanades ont leurs propres lanternes d'angle (positions fixes) :
  // aucun mât de RUE ne doit tomber sur l'emprise d'une place.
  const plazas = (L.plan && L.plan.plazas) || [];
  const onPlaza = (gx, gy) => {
    for (const p of plazas) {
      const half = Math.floor(p.size / 2);
      if (gx >= p.gx - half - 1 && gx <= p.gx - half + p.size
        && gy >= p.gy - half - 1 && gy <= p.gy - half + p.size) return true;
    }
    return false;
  };

  for (const r of CM.roadList) {
    if (r.rank !== "main" && r.rank !== "avenue") continue;
    if (onPlaza(r.gx, r.gy)) continue;
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
        // Tube néon : éteint (sombre) le jour, couleur + halo ∝ nuit.
        const hue = seed % 2 === 0 ? [50, 210, 255] : [255, 50, 200];
        const pulse = 0.65 + 0.25 * Math.sin(t2 / 500 + r.gx * 0.3 + r.gy * 0.4);
        ctx.strokeStyle = "#28303a"; ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.38); ctx.stroke();
        ctx.strokeStyle = "#1e2630"; ctx.lineWidth = Math.max(1.5, s * 0.03);
        ctx.beginPath(); ctx.moveTo(lx - s * 0.09, ly - s * 0.38); ctx.lineTo(lx + s * 0.09, ly - s * 0.38); ctx.stroke();
        if (night > 0.02) {
          const prev2 = ctx.globalCompositeOperation;
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${(night * pulse).toFixed(2)})`;
          ctx.lineWidth = Math.max(1.5, s * 0.03);
          ctx.beginPath(); ctx.moveTo(lx - s * 0.09, ly - s * 0.38); ctx.lineTo(lx + s * 0.09, ly - s * 0.38); ctx.stroke();
          ctx.globalCompositeOperation = prev2;
          cmDrawGlow(ctx, lx, ly - s * 0.38, s * 0.26, hue[0], hue[1], hue[2], night * pulse * 0.55);
        }
      } else if (futuristic) {
        // Mât moderne : tête sombre le jour, lumière froide ∝ nuit.
        ctx.strokeStyle = "#545e6a"; ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.34); ctx.stroke();
        ctx.strokeStyle = "#606a78"; ctx.lineWidth = Math.max(0.5, s * 0.013);
        ctx.beginPath(); ctx.moveTo(lx, ly - s * 0.34); ctx.lineTo(lx + s * 0.07, ly - s * 0.39); ctx.stroke();
        ctx.fillStyle = "#3a424e";
        ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.39, Math.max(1, s * 0.036), 0, Math.PI * 2); ctx.fill();
        cmDrawGlow(ctx, lx + s * 0.07, ly - s * 0.39, Math.max(2, s * 0.07), 210, 235, 255, night * 1.05);
        cmDrawGlow(ctx, lx + s * 0.07, ly - s * 0.39, s * 0.24, 190, 225, 255, night * 0.5);
      } else {
        // Lanterne classique — exactement le style des lanternes des places :
        // verre sombre le jour, cœur chaud + halo radial ∝ nuit.
        ctx.strokeStyle = "#3c342a"; ctx.lineWidth = Math.max(1, s * 0.045);
        ctx.beginPath(); ctx.moveTo(lx, ly + s * 0.1); ctx.lineTo(lx, ly - s * 0.26); ctx.stroke();
        ctx.fillStyle = "#4a4034";
        ctx.beginPath(); ctx.arc(lx, ly - s * 0.3, Math.max(1.2, s * 0.06), 0, Math.PI * 2); ctx.fill();
        cmDrawGlow(ctx, lx, ly - s * 0.3, Math.max(2, s * 0.1), 255, 215, 120, night * 1.1);
        cmDrawGlow(ctx, lx, ly - s * 0.3, s * 0.36, 255, 195, 90, night * 0.55);
      }
    }
  }
}

/* ---- legacy citymap rendering\agents.js ---- */
/* Moved to agents.js. */

/* ---- legacy citymap rendering\crisis.js ---- */


/* ============================================================================
 * citymap-render-crisis.js - Evenements visuels lies a l'instabilite.
 * ============================================================================ */

const RIOT_WONDER_CLEAR_R = WONDER_CLEAR_R + 2;

function cityMapRiotBlocked(gx, gy) {
  if (!CM.layout || !Array.isArray(state.wonders) || !state.wonders.length) return false;
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const w = CM_WONDERS[wi];
    if (!state.wonders.includes(w.id)) continue;
    const slot = cmWonderSlot(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy);
    if (Math.hypot(gx - slot.gx, gy - slot.gy) <= RIOT_WONDER_CLEAR_R) return true;
  }
  return false;
}

function cityMapPickRiotRoadNear(origin, radius) {
  if (!CM.walkRoadList.length) return null;
  const safeRoads = CM.walkRoadList.filter((r) => !cityMapRiotBlocked(r.gx, r.gy));
  if (!safeRoads.length) return null;
  if (!origin) return safeRoads[Math.floor(Math.random() * safeRoads.length)];

  const near = [];
  for (const r of safeRoads) {
    const dist = Math.abs(r.gx - origin.gx) + Math.abs(r.gy - origin.gy);
    if (dist <= radius) near.push(r);
  }
  const pool = near.length ? near : safeRoads;
  return pool[Math.floor(Math.random() * pool.length)];
}

function cityMapRiotGroupCenter(rioters) {
  if (!rioters || !rioters.length) return null;
  let gx = 0, gy = 0;
  for (const p of rioters) {
    gx += p.x / CM.TILE - 0.5;
    gy += p.y / CM.TILE - 0.5;
  }
  return { gx: gx / rioters.length, gy: gy / rioters.length };
}

function drawCrisis(dt, now) {
  if (!CM.layout) return;
  const ctx = CM.ctx, z = CM.cam.zoom;
  const inst = state.instability || 0;
  const cs = (wx, wy) => ({ x: (wx - CM.cam.x) * z + CM.cw / 2, y: (wy - CM.cam.y) * z + CM.ch / 2 });

  if (!CM.rioters) CM.rioters = [];
  // Les émeutes n'éclatent que l'après-midi (jour montant vers le crépuscule).
  const afternoon = CM.dayRising === true && (CM.nightF || 0) < 0.45;
  const want = afternoon && inst > 0.55 && CM.walkRoadList.length ? Math.floor((inst - 0.55) / 0.45 * 36) + 8 : 0;
  if (want === 0) {
    CM.rioters.length = 0;
    CM.riotGoal = null;
  } else {
    const isRoad = (x, y) => CM.walkRoadSet.has(cityMapWalkRoadKey(x, y)) && !cityMapRiotBlocked(x, y);
    const groupCenter = cityMapRiotGroupCenter(CM.rioters);
    if (!CM.riotGoal || !isRoad(CM.riotGoal.gx, CM.riotGoal.gy) || (now - (CM.riotGoalAt || 0)) > 5000) {
      CM.riotGoal = cityMapPickRiotRoadNear(groupCenter || CM.rioters[0], 6 + Math.round(inst * 8));
      CM.riotGoalAt = now;
    }
    const spawnAnchor = groupCenter || CM.riotGoal;
    // Même garde-robe que les habitants : tuniques teintes + teints de peau.
    const RIOT_OUTFITS = ["#9a4d38", "#3f6a8a", "#7a8a3c", "#8a5d9a", "#b08a3a", "#5d7a6a"];
    const RIOT_SKINS = ["#e8c8a0", "#d4a878", "#b88a58", "#8a5c38"];
    while (CM.rioters.length < want) {
      const r = cityMapPickRiotRoadNear(spawnAnchor, 2 + Math.round(inst));
      if (!r) break;
      const n = CM.rioters.length;
      CM.rioters.push({
        gx: r.gx,
        gy: r.gy,
        x: (r.gx + 0.5) * CM.TILE,
        y: (r.gy + 0.5) * CM.TILE,
        tx: (r.gx + 0.5) * CM.TILE,
        ty: (r.gy + 0.5) * CM.TILE,
        dir: -1,
        pauseT: 0,
        speed: 24 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        lane: (Math.random() - 0.5) * CM.TILE * 0.38,
        col: RIOT_OUTFITS[n % RIOT_OUTFITS.length],
        skin: RIOT_SKINS[(n * 7 + 3) % RIOT_SKINS.length],
        weapon: n % 2 === 0 ? "torch" : "fork"
      });
    }
    if (CM.rioters.length > want) CM.rioters.length = want;
    const goal = CM.riotGoal;
    const cohesion = cityMapRiotGroupCenter(CM.rioters) || goal;
    let mx = 0, my = 0;
    const pts = [];
    for (const p of CM.rioters) {
      if (!isRoad(p.gx, p.gy)) {
        const r = cityMapPickRiotRoadNear(cohesion, 6 + Math.round(inst * 4));
        if (!r) continue;
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
        const ddx = p.tx - p.x, ddy = p.ty - p.y, dd = Math.hypot(ddx, ddy);
        if (dd < 2.4) {
          if (Math.random() < 0.035) {
            p.pauseT = 0.12 + Math.random() * 0.35;
          } else {
            const rev = p.dir >= 0 ? (p.dir ^ 1) : -1;
            const opts = [];
            for (let i = 0; i < 4; i += 1) {
              const nx = p.gx + CM_DIRS[i][0], ny = p.gy + CM_DIRS[i][1];
              if (isRoad(nx, ny) && roadStepAllowed(p.gx, p.gy, i)) opts.push({ i, nx, ny });
            }
            const pool = opts.filter((o) => o.i !== rev);
            const use = pool.length ? pool : opts;
            let best = use[0], bs = -Infinity;
            const groupDistNow = Math.abs(cohesion.gx - p.gx) + Math.abs(cohesion.gy - p.gy);
            const personalGoal = groupDistNow > 4.5 ? cohesion : goal;
            for (const o of use) {
              const groupDistNext = Math.abs(cohesion.gx - o.nx) + Math.abs(cohesion.gy - o.ny);
              let sc = -(Math.abs(personalGoal.gx - o.nx) + Math.abs(personalGoal.gy - o.ny));
              sc -= groupDistNext * (personalGoal === cohesion ? 0.25 : 0.85);
              if (o.i === p.dir) sc += 1.25;
              sc += Math.random() * 0.9;
              if (sc > bs) {
                bs = sc;
                best = o;
              }
            }
            if (best) {
              p.gx = best.nx;
              p.gy = best.ny;
              p.dir = best.i;
              p.tx = (p.gx + 0.5) * CM.TILE;
              p.ty = (p.gy + 0.5) * CM.TILE;
            }
          }
        } else {
          const sp = p.speed * dt;
          p.x += ddx / dd * sp;
          p.y += ddy / dd * sp;
        }
      }
      mx += p.x;
      my += p.y;
      pts.push(p);
    }
    if (pts.length) {
      mx /= pts.length;
      my /= pts.length;
      const c = cs(mx, my);
      const pulse = 0.5 + 0.5 * Math.sin(now / 320);
      const R = (1.6 + inst * 1.4) * CM.TILE * z;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(1, R));
      g.addColorStop(0, `rgba(200,40,30,${(0.16 + 0.12 * pulse).toFixed(2)})`);
      g.addColorStop(1, "rgba(200,40,30,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(1, R), 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const laneX = (p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0;
        const laneY = (p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0;
        const wob = Math.sin(now / 170 + (p.phase || 0)) * 0.8;
        const sx = (p.x + laneX - CM.cam.x) * z + CM.cw / 2;
        const sy = (p.y + laneY - CM.cam.y) * z + CM.ch / 2 + wob * z;
        if (sx < -8 || sy < -8 || sx > CM.cw + 8 || sy > CM.ch + 8) continue;

        // ── Même silhouette que les habitants : ombre, jambes, tunique, tête ──
        const ph = Math.max(1.5, 2.1 * z);
        const walking = p.pauseT <= 0;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath(); ctx.ellipse(sx, sy + ph * 1.35, ph * 0.85, ph * 0.32, 0, 0, Math.PI * 2); ctx.fill();
        if (ph > 2 && walking) {
          const step = Math.sin(now / 110 + (p.phase || 0) * 3) * ph * 0.45;
          ctx.strokeStyle = "#241a10";
          ctx.lineWidth = Math.max(1, ph * 0.28);
          ctx.beginPath(); ctx.moveTo(sx - ph * 0.12, sy + ph * 0.35); ctx.lineTo(sx - ph * 0.15 + step * 0.5, sy + ph * 1.3); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sx + ph * 0.12, sy + ph * 0.35); ctx.lineTo(sx + ph * 0.15 - step * 0.5, sy + ph * 1.3); ctx.stroke();
        }
        ctx.fillStyle = p.col || "#9a4d38";
        ctx.beginPath();
        ctx.moveTo(sx - ph * 0.62, sy - ph * 0.45);
        ctx.quadraticCurveTo(sx - ph * 0.5, sy + ph * 0.65, sx - ph * 0.3, sy + ph * 0.62);
        ctx.lineTo(sx + ph * 0.3, sy + ph * 0.62);
        ctx.quadraticCurveTo(sx + ph * 0.5, sy + ph * 0.65, sx + ph * 0.62, sy - ph * 0.45);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(sx - ph * 0.5, sy - ph * 0.45, ph, Math.max(0.5, ph * 0.2));
        ctx.fillStyle = p.skin || "#e0b890";
        ctx.beginPath(); ctx.arc(sx, sy - ph * 0.85, ph * 0.5, 0, Math.PI * 2); ctx.fill();

        // ── Torche ou fourche brandie, bras levé qui s'agite ──────────────
        if (ph > 1.8) {
          const wave = Math.sin(now / 200 + (p.phase || 0) * 2) * ph * 0.18;
          const hx = sx + ph * 0.55;                // main côté droit
          const hy = sy - ph * 0.2;
          ctx.strokeStyle = "#6b4a26";
          ctx.lineWidth = Math.max(1, ph * 0.18);
          if (p.weapon === "fork") {
            // Manche de fourche
            const tipX = hx + ph * 0.25 + wave, tipY = hy - ph * 1.7;
            ctx.beginPath(); ctx.moveTo(hx - ph * 0.15, hy + ph * 0.5); ctx.lineTo(tipX, tipY); ctx.stroke();
            // Trois dents métalliques
            ctx.strokeStyle = "#aab2bc";
            ctx.lineWidth = Math.max(0.8, ph * 0.12);
            for (let d = -1; d <= 1; d += 1) {
              ctx.beginPath();
              ctx.moveTo(tipX + d * ph * 0.22, tipY);
              ctx.lineTo(tipX + d * ph * 0.22, tipY - ph * 0.45);
              ctx.stroke();
            }
          } else {
            // Manche de torche
            const tipX = hx + ph * 0.2 + wave, tipY = hy - ph * 1.2;
            ctx.beginPath(); ctx.moveTo(hx - ph * 0.1, hy + ph * 0.3); ctx.lineTo(tipX, tipY); ctx.stroke();
            // Flamme vacillante + halo chaud
            const flick = 0.75 + 0.25 * Math.sin(now / 90 + (p.phase || 0) * 5);
            ctx.fillStyle = `rgba(255,170,40,${(0.18 * flick).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(tipX, tipY - ph * 0.2, ph * 0.9 * flick, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(255,150,40,${(0.65 + 0.3 * pulse).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(tipX, tipY - ph * 0.15, ph * 0.32 * flick, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(255,230,120,0.9)";
            ctx.beginPath(); ctx.arc(tipX, tipY - ph * 0.12, ph * 0.16 * flick, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }
  }

  const famine = toNum(state.population) > 60 && toNum(state.food) < toNum(state.population) * 1.1;
  if (famine) {
    const target = CM.layout.tiles.find((t) => t.type === "public") || CM.layout.tiles.find((t) => t.type === "house");
    if (target) {
      for (let i = 0; i < 10; i += 1) {
        const p = cs((target.gx + 0.5) * CM.TILE + (i + 1) * CM.TILE * 0.5, (target.gy + 0.5) * CM.TILE + Math.sin(i * 1.3) * 3);
        ctx.fillStyle = "rgba(220,200,150,0.85)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, 1.6 * z), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ── Voile de santé : la taille pilote l'échelle, la santé pilote l'ambiance ──
// Santé basse → désaturation + dominante brune (le brun-crotte devient un
// signal de crise). Santé haute → légère vibrance : une grande ville équilibrée
// est éclatante. Appliqué plein écran, avant la nuit.
function cityMapDrawHealthTint() {
  if (!CM.layout) return;
  const h = CM.healthF;
  const ctx = CM.ctx;
  const prev = ctx.globalCompositeOperation;
  if (h < 0.45) {
    const k = Math.min(1, (0.45 - h) / 0.45);
    ctx.globalCompositeOperation = "saturation";
    ctx.fillStyle = `rgba(128,128,128,${(k * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgba(${Math.round(214 - k * 34)},${Math.round(196 - k * 50)},${Math.round(170 - k * 66)},${(k * 0.42).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
  } else if (h > 0.66) {
    const k = Math.min(1, (h - 0.66) / 0.34);
    // Vibrance : la teinte du fond est conservée, seule la saturation monte.
    ctx.globalCompositeOperation = "saturation";
    ctx.fillStyle = `rgba(255,0,0,${(k * 0.12).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = `rgba(186,226,160,${(k * 0.18).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
  }
  ctx.globalCompositeOperation = prev;
}

// ── Tapis de lumières nocturnes ──────────────────────────────────────────────
// Calque additif au-dessus du voile de nuit : fenêtres chaudes sur les
// bâtiments (densité ∝ population, éteintes quand la ville agonise), rangées
// de fenêtres sur les grands districts, phares des véhicules motorisés.
// Tout est seedé par tuile : aucun scintillement non maîtrisé, juste une
// respiration lente par foyer.
function cityMapDrawCityLights(now) {
  const L = CM.layout;
  const n = CM.nightF || 0;
  if (!L || n < 0.1 || !L.counts || L.counts.eraBand < 1) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const seed = (L.mapSeed || 0) >>> 0;
  const health = CM.healthF;
  const ruined = CM.frameRuined;
  // Densité de foyers éclairés : croît avec la population (log) et s'éteint
  // avec la santé — une ville en crise est une ville sombre.
  const pop = toNum(state.population);
  let density = Math.max(0.1, Math.min(0.92, 0.16 + Math.log10(Math.max(1, pop)) * 0.075))
    * (0.35 + health * 0.65);
  if (ruined) density *= 0.22;
  const a = Math.min(1, (n - 0.1) / 0.7); // montée progressive au crépuscule
  const warm = L.counts.eraBand >= 5 ? "255,224,160" : "255,196,108";
  const [wr, wg, wb] = warm.split(",").map(Number);
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";

  // Fenêtres des bâtiments (maisons, publics, savoirs — pas les champs).
  const t9 = now / 5200;
  for (const t of L.tiles) {
    if (t.type === "farm") continue;
    const span = t.size || 1;
    const sx = (t.gx * T - CM.cam.x) * z + CM.cw / 2;
    const sy = (t.gy * T - CM.cam.y) * z + CM.ch / 2;
    const s = T * z * span;
    if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
    const h = (Math.imul(t.gx | 0, 73856093) ^ Math.imul(t.gy | 0, 19349663) ^ seed) >>> 0;
    if ((h % 100) >= density * 100) continue;
    // 1 fenêtre par tuile simple, jusqu'à 4 sur les grandes emprises moteur.
    const nW = span >= 3 ? 4 : span >= 2 ? 2 : 1;
    const ws = Math.max(1, T * z * 0.085);
    // Respiration lente et stable par foyer (pas de scintillement).
    const breathe = 0.8 + 0.2 * Math.sin(t9 + (h % 628) / 100);
    const alpha = a * breathe;
    for (let wi = 0; wi < nW; wi += 1) {
      const hx = (h >> (3 + wi * 5)) % 100, hy = (h >> (5 + wi * 5)) % 100;
      const wx = sx + s * (0.18 + (hx / 100) * 0.6);
      const wy = sy + s * (0.16 + (hy / 100) * 0.55);
      // Halo radial doux (sprite de glow mis en cache) + cœur chaud carré
      // (la fenêtre elle-même) — intensité entièrement pilotée par la nuit.
      cmDrawGlow(ctx, wx + ws / 2, wy + ws / 2, ws * 2.3, wr, wg, wb, alpha * 0.35);
      ctx.fillStyle = `rgba(${warm},${(alpha * 0.6).toFixed(3)})`;
      ctx.fillRect(wx, wy, ws, ws);
    }
  }

  // Phares des véhicules motorisés sur les grands axes.
  if (n > 0.3 && Array.isArray(CM.vehicles) && (L.counts.eraIndex || 0) >= 14) {
    const hl = Math.max(1, T * z * 0.06);
    for (const v of CM.vehicles) {
      if (v.type !== "car" && v.type !== "tram") continue;
      if ((v.parkT || 0) > 0 || v.pauseT > 0) continue; // garé/arrêté : phares éteints
      const sx = (v.x - CM.cam.x) * z + CM.cw / 2;
      const sy = (v.y - CM.cam.y) * z + CM.ch / 2;
      if (sx < -8 || sy < -8 || sx > CM.cw + 8 || sy > CM.ch + 8) continue;
      // Cap réel du véhicule (vitesse, sinon direction de grille : 0=E 1=W 2=S 3=N).
      let hx = v.tx - v.x, hy = v.ty - v.y;
      const hd = Math.hypot(hx, hy);
      if (hd > 0.5) { hx /= hd; hy /= hd; }
      else { hx = v.dir === 0 ? 1 : v.dir === 1 ? -1 : 0; hy = v.dir === 2 ? 1 : v.dir === 3 ? -1 : 0; }
      const px = -hy, py = hx; // perpendiculaire (écart entre les deux phares)
      const off = T * z * 0.2;
      // Deux phares ronds à l'AVANT + faisceau elliptique orienté devant.
      ctx.fillStyle = `rgba(255,244,210,${(a * 0.75).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx + hx * off + px * hl, sy + hy * off + py * hl, hl * 0.55, 0, Math.PI * 2);
      ctx.arc(sx + hx * off - px * hl, sy + hy * off - py * hl, hl * 0.55, 0, Math.PI * 2);
      ctx.fill();
      // Faisceau : halo radial étiré dans l'axe du véhicule.
      ctx.save();
      ctx.translate(sx + hx * off * 2.6, sy + hy * off * 2.6);
      ctx.rotate(Math.atan2(hy, hx));
      ctx.globalAlpha = a * 0.4;
      ctx.drawImage(cmGlowSprite(255, 238, 180), -hl * 3.4, -hl * 1.8, hl * 6.8, hl * 3.6);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalCompositeOperation = prev;
}

export {
  baseColor,
  cityMapDrawBridges,
  cityMapDrawGround,
  cityMapDrawHealthTint,
  cityMapDrawCityLights,
  cityMapDrawMist,
  cityMapDrawNight,
  cityMapDrawPlazaSurface,
  cityMapDrawPlazas,
  cityMapDrawRiver,
  cityMapDrawRoad,
  cityMapDrawStreetLights,
  cityMapDrawTrees,
  cityMapDrawUrbanMass,
  cityMapDrawVestiges,
  cityMapDrawWalls,
  cmLitColor,
  drawCrisis
};
