/* eslint-disable */
import { state } from '../core/state.js';
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
  const widthByRank = {
    path: eraIndex >= 7 ? 0.24 : 0.2,
    secondary: eraIndex >= 12 ? 0.34 : eraIndex >= 7 ? 0.31 : 0.26,
    avenue: eraIndex >= 12 ? 0.4 : eraIndex >= 7 ? 0.36 : 0.3,
    main: eraIndex >= 12 ? 0.46 : eraIndex >= 7 ? 0.42 : 0.36
  };
  const detailRate = rank === "main" ? 5 : rank === "avenue" ? 7 : rank === "secondary" ? 9 : 13;
  return {
    palette,
    width: widthByRank[rank] || widthByRank.secondary,
    detailRate,
    borderStrength: rank === "main" ? 1 : rank === "avenue" ? 0.8 : rank === "secondary" ? 0.55 : 0.35
  };
}

/* ---- legacy citymap rendering\ground.js ---- */


/* ============================================================================
 * citymap-render-ground.js - Rendu du fond de carte Canvas.
 *   Sol, masse urbaine, fleuve, foret, vestiges et voile nocturne.
 * ============================================================================ */

const CITY_MAP_GREENS = ["#2d5a1b", "#3a6b22", "#4a7a2a", "#255018", "#1e4010", "#3d7220", "#5a8c2e", "#223d14"];

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
  const sx = ((layout.plan?.core?.x ?? layout.cx) * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = ((layout.plan?.core?.y ?? layout.cy) * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const radius = (10 + tier * 12) * CM.TILE * CM.cam.zoom;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, radius));
  g.addColorStop(0, "rgba(72,58,33,0.58)");
  g.addColorStop(0.45, "rgba(54,44,28,0.36)");
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

  // Quais de pierre : aux ères urbaines, les berges proches de la ville sont
  // maçonnées (bande claire côté eau) ; les berges sauvages gardent leurs roseaux.
  const band = L.counts ? L.counts.eraBand : 0;
  const occ = CM.occupied;
  const reedOk = tw < 0.7 && !collapsed;
  for (const k of L.river.banks) {
    const c = k.indexOf(","); const bgx = +k.slice(0, c), bgy = +k.slice(c + 1);
    const px = SX(bgx), py = SY(bgy), ts = T * z;
    if (px < -ts || px > CM.cw || py < -ts || py > CM.ch) continue;
    const isQuay = band >= 3 && !collapsed && tw < 0.7 && occ && (
      occ.has((bgx - 1) + "," + bgy) || occ.has((bgx + 1) + "," + bgy) ||
      occ.has(bgx + "," + (bgy - 1)) || occ.has(bgx + "," + (bgy + 1)));
    if (isQuay) {
      const waterBelow = L.river.cells.has(bgx + "," + (bgy + 1));
      const waterAbove = L.river.cells.has(bgx + "," + (bgy - 1));
      const qy = waterBelow ? py + ts * 0.62 : waterAbove ? py + ts * 0.06 : py + ts * 0.34;
      ctx.fillStyle = band >= 5 ? "#857e70" : "#776f60";
      ctx.fillRect(px, qy, ts + 1, ts * 0.32);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(px, qy, ts + 1, Math.max(1, ts * 0.07));
      // Bittes d'amarrage espacées
      if ((bgx * 5 + bgy * 11) % 3 === 0) {
        ctx.fillStyle = "#3c362c";
        ctx.fillRect(px + ts * 0.42, qy + ts * 0.1, Math.max(1.5, ts * 0.1), Math.max(1.5, ts * 0.1));
      }
      continue;
    }
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
function cityMapDrawWalls() {
  const L = CM.layout;
  if (!L || !L.walls || !L.walls.cells.length) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE, s = T * z;
  const band = L.counts.eraBand;
  const ruined = CM.frameRuined;
  const stone = ruined ? "#4f4a40" : band >= 5 ? "#8a8378" : band >= 4 ? "#7d7668" : "#6f6b5e";
  const stoneDark = ruined ? "#332f28" : "#46423a";
  const stoneLight = "rgba(255,255,255,0.16)";
  const all = new Set(L.walls.cells.map((c) => c.gx + "," + c.gy));
  const SXY = (gx, gy) => [(gx * T - CM.cam.x) * z + CM.cw / 2, (gy * T - CM.cam.y) * z + CM.ch / 2];

  // Passe 1 : ombre portée du rempart
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  for (const c of L.walls.cells) {
    if (c.kind === "gate") continue;
    const [x, y] = SXY(c.gx, c.gy);
    if (x < -s * 2 || y < -s * 2 || x > CM.cw + s || y > CM.ch + s) continue;
    ctx.fillRect(x + s * 0.22, y + s * 0.3, s * 0.72, s * 0.72);
  }
  // Passe 2 : corps du mur, prolongé vers les voisins pour une bande continue
  for (const c of L.walls.cells) {
    const [x, y] = SXY(c.gx, c.gy);
    if (x < -s * 2 || y < -s * 2 || x > CM.cw + s || y > CM.ch + s) continue;
    const nN = all.has(c.gx + "," + (c.gy - 1)), nS = all.has(c.gx + "," + (c.gy + 1));
    const nE = all.has((c.gx + 1) + "," + c.gy), nW = all.has((c.gx - 1) + "," + c.gy);
    if (c.kind === "gate") {
      // Porte : deux montants encadrant la route + linteau sombre
      ctx.fillStyle = stoneDark;
      if (nE || nW) { // mur horizontal → montants haut/bas
        ctx.fillRect(x + s * 0.02, y + s * 0.18, s * 0.24, s * 0.3);
        ctx.fillRect(x + s * 0.74, y + s * 0.18, s * 0.24, s * 0.3);
      } else {
        ctx.fillRect(x + s * 0.18, y + s * 0.02, s * 0.3, s * 0.24);
        ctx.fillRect(x + s * 0.18, y + s * 0.74, s * 0.3, s * 0.24);
      }
      continue;
    }
    const th = 0.52; // épaisseur du mur
    let x0 = x + s * (0.5 - th / 2), y0 = y + s * (0.5 - th / 2);
    let wPx = s * th, hPx = s * th;
    if (nW) { x0 -= s * (0.5 - th / 2); wPx += s * (0.5 - th / 2); }
    if (nE) { wPx += s * (0.5 - th / 2) + 1; }
    if (nN) { y0 -= s * (0.5 - th / 2); hPx += s * (0.5 - th / 2); }
    if (nS) { hPx += s * (0.5 - th / 2) + 1; }
    const tower = c.kind === "tower";
    if (tower) { x0 = x + s * 0.08; y0 = y + s * 0.08; wPx = s * 0.84; hPx = s * 0.84; }
    ctx.fillStyle = tower ? stoneDark : stone;
    ctx.fillRect(x0, y0, wPx, hPx);
    // Chemin de ronde (liseré clair côté nord)
    ctx.fillStyle = stoneLight;
    ctx.fillRect(x0, y0, wPx, Math.max(1, s * 0.1));
    // Créneaux : pointillés sombres le long du mur
    ctx.fillStyle = stoneDark;
    const dotS = Math.max(1, s * 0.1);
    if (nE || nW) {
      for (let dx = s * 0.12; dx < wPx - dotS; dx += s * 0.3) ctx.fillRect(x0 + dx, y0 + 1, dotS, dotS);
    } else {
      for (let dy = s * 0.12; dy < hPx - dotS; dy += s * 0.3) ctx.fillRect(x0 + 1, y0 + dy, dotS, dotS);
    }
    if (tower) {
      // Toit de tour + fanion
      ctx.fillStyle = stone;
      ctx.fillRect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56);
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

// ── Esplanade des places : dallage continu (couche statique) ────────────────
// Une vraie place : surface pavée d'un seul tenant, rosace centrale, bordure
// de pierre et dalles irrégulières — pas un carré de routes.
function cityMapDrawPlazaSurface() {
  const L = CM.layout;
  if (!L || !L.plan || !Array.isArray(L.plan.plazas) || !L.plan.plazas.length) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const band = L.counts ? L.counts.eraBand : 0;
  const ruined = CM.frameRuined;
  const base = ruined ? "#4a4336" : band >= 5 ? "#8d8473" : band >= 3 ? "#a08e6e" : "#8f7a55";
  const dark = "rgba(40,30,16,0.3)";
  const light = "rgba(255,240,210,0.14)";
  for (const p of L.plan.plazas) {
    if (!p.size || p.size < 2) continue;
    const half = Math.floor(p.size / 2);
    // Emprise réelle des cellules (alignée sur la grille de la place)
    const x0 = ((p.gx - half) * T - CM.cam.x) * z + CM.cw / 2;
    const y0 = ((p.gy - half) * T - CM.cam.y) * z + CM.ch / 2;
    const wPx = p.size * T * z, hPx = p.size * T * z;
    if (x0 > CM.cw + wPx || y0 > CM.ch + hPx || x0 + wPx < -wPx || y0 + hPx < -hPx) continue;
    const cx = x0 + wPx / 2, cy = y0 + hPx / 2;
    const inset = T * z * 0.06;
    // Dalle de fond aux coins adoucis
    ctx.fillStyle = base;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0 + inset, y0 + inset, wPx - inset * 2, hPx - inset * 2, T * z * 0.3);
    else ctx.rect(x0 + inset, y0 + inset, wPx - inset * 2, hPx - inset * 2);
    ctx.fill();
    // Bordure de pierre
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, T * z * 0.08);
    ctx.stroke();
    // Dalles irrégulières (grille décalée une rangée sur deux)
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
    // Rosace centrale (deux anneaux + dalle claire)
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(cx, cy, wPx * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, T * z * 0.05);
    ctx.beginPath(); ctx.arc(cx, cy, wPx * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, wPx * 0.16, 0, Math.PI * 2); ctx.stroke();
    // Rayons de la rosace
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * wPx * 0.16, cy + Math.sin(a) * wPx * 0.16);
      ctx.lineTo(cx + Math.cos(a) * wPx * 0.3, cy + Math.sin(a) * wPx * 0.3);
      ctx.stroke();
    }
    // Bornes de pierre aux quatre coins
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

// ── Places publiques : monument central selon la personnalité de la ville ──
function cityMapDrawPlazas(now) {
  const L = CM.layout;
  if (!L || !L.plan || !Array.isArray(L.plan.plazas)) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const pid = L.personality ? L.personality.id : "marchande";
  const t = now || 0;
  for (const p of L.plan.plazas) {
    if (!p.size || p.size < 2) continue;
    const cx = ((p.gx + 0.5) * T - CM.cam.x) * z + CM.cw / 2;
    const cy = ((p.gy + 0.5) * T - CM.cam.y) * z + CM.ch / 2;
    const s = T * z;
    if (cx < -s * 3 || cy < -s * 3 || cx > CM.cw + s * 3 || cy > CM.ch + s * 3) continue;
    // (le dallage est dessiné par cityMapDrawPlazaSurface en couche statique)
    if (pid === "marchande" || pid === "pauvre") {
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
  const want = inst > 0.55 && CM.walkRoadList.length ? Math.floor((inst - 0.55) / 0.45 * 36) + 8 : 0;
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
    while (CM.rioters.length < want) {
      const r = cityMapPickRiotRoadNear(spawnAnchor, 2 + Math.round(inst));
      if (!r) break;
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
        lane: (Math.random() - 0.5) * CM.TILE * 0.38
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
        if (sx < -4 || sy < -4 || sx > CM.cw + 4 || sy > CM.ch + 4) continue;
        ctx.fillStyle = "rgba(205,45,35,0.92)";
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1.4, 2.1 * z), 0, Math.PI * 2);
        ctx.fill();
        if (i % 5 === 0) {
          ctx.fillStyle = `rgba(255,150,40,${(0.7 + 0.3 * pulse).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy - 3 * z, Math.max(1, 1.3 * z), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  const famine = (state.population || 0) > 60 && (state.food || 0) < (state.population || 0) * 1.1;
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

export {
  baseColor,
  cityMapDrawBridges,
  cityMapDrawGround,
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
