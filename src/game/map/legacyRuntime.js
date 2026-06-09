/* eslint-disable */
import { state, collapseInProgress, buildingById, renderCache } from '../core/state.js';
import {
  CM,
  CM_MAP_BUILDINGS,
  CM_WONDERS,
  ROAD_E,
  ROAD_N,
  ROAD_S,
  ROAD_W,
  cmWonderSlot,
  cmRoadName,
  computeCityLayout,
  cmCheckWonders,
  cityCounts,
  cmIsWalkableRoad,
  cmClamp,
  cmHash,
  CM_ROLES,
  cmCitizenName,
  cmPick,
  WONDER_CLEAR_R
} from './layout.js';
import { setCityMapEngineTileMap } from './cityMapBridge.js';
import {
  cityMapDrawGround,
  cityMapDrawRiver,
  cityMapDrawTrees,
  cityMapDrawVestiges,
  cityMapDrawUrbanMass,
  cityMapDrawNight,
  cityMapDrawStreetLights,
  cityMapDrawBridges,
  drawCrisis,
  cityMapDrawRoad
} from './renderWorld.js';
import { drawTile, drawWonder, drawCentralFire, drawMinimap } from './renderBuildings.js';
import { drawCitizens, updateVehicles, drawShips, getVehicleDensity, chooseRoadVehicleType, drawVehicles, drawCitizenThoughts } from './agents.js';


// Plafond de résolution de rendu : sur écrans HiDPI (dpr 2/3), dessiner à pleine
// densité multiplie par dpr² le nombre de pixels des 3 canvas (principal + 2 offscreen)
// et de chaque remplissage plein écran par frame — principale cause de lag GPU
// "dès le début" sur portables HiDPI / GPU intégrés. 1.5 reste net à l'œil.
const CM_MAX_RENDER_DPR = 1.5;

function cityMapResizeCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, CM_MAX_RENDER_DPR);
  const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 600;
  const h = canvas.clientHeight || 320;
  CM.dpr = dpr;
  CM.cw = w;
  CM.ch = h;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  CM.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Sync static (offscreen) canvas dimensions on resize
  if (CM.staticCanvas) {
    CM.staticCanvas.width = Math.max(1, Math.round(w * dpr));
    CM.staticCanvas.height = Math.max(1, Math.round(h * dpr));
    CM.sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CM.staticCamKey = ""; // force re-bake after resize
  }
  if (CM.tileCanvas) {
    CM.tileCanvas.width = Math.max(1, Math.round(w * dpr));
    CM.tileCanvas.height = Math.max(1, Math.round(h * dpr));
    CM.tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CM.tileCamKey = '';
  }
}

function cityMapWorldAtScreen(sx, sy) {
  return {
    x: (sx - CM.cw / 2) / CM.cam.zoom + CM.cam.x,
    y: (sy - CM.ch / 2) / CM.cam.zoom + CM.cam.y
  };
}

function cityMapScreenFromWorld(wx, wy) {
  return {
    x: (wx - CM.cam.x) * CM.cam.zoom + CM.cw / 2,
    y: (wy - CM.cam.y) * CM.cam.zoom + CM.ch / 2
  };
}

function cityMapTileScreen(gx, gy, span = 1) {
  const s = CM.TILE * CM.cam.zoom;
  return {
    s,
    x: (gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2,
    y: (gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2,
    w: s * span,
    h: s * span
  };
}

function cityMapCenterCamera(layout) {
  if (!layout) return;
  CM.cam.x = layout.gridN * CM.TILE / 2;
  CM.cam.y = layout.gridN * CM.TILE / 2;
  // Zoom recule avec la taille de la ville : village (22 tuiles visibles) → mégalopole (36 tuiles)
  const targetTiles = 22 + Math.min(14, Math.max(0, (layout.gridN - 20) * 0.07));
  CM.cam.zoom = Math.max(0.35, Math.min(1.6, CM.cw / (targetTiles * CM.TILE)));
}

function cityMapEnsureTooltip(mapRoot, tooltipElement = null) {
  CM.tooltip = tooltipElement || mapRoot?.querySelector(".city-map-tooltip") || null;
}

function cityMapVariantLabel(type, variant) {
  const labels = {
    firepit: "Foyer commun",
    tent: "Tente",
    hut: "Cabane",
    longhouse: "Longue maison",
    courtyard: "Maison a cour",
    townhouse: "Maison de ville",
    manor: "Manoir",
    stonehouse: "Maison de pierre",
    tenement: "Immeuble populaire",
    block: "Bloc residentiel",
    tower: "Tour d'habitation",
    megablock: "Grand ensemble",
    arcologyhome: "Logement d'arcologie",
    patch: "Lopin cultive",
    field: "Champ organise",
    industrial: "Ferme mecanisee",
    market: "Marche",
    granary: "Grenier public",
    temple: "Temple",
    hall: "Halle civique",
    keep: "Donjon",
    forum: "Forum",
    palace: "Palais",
    station: "Station civique",
    spire: "Fleche administrative",
    shrine: "Sanctuaire",
    school: "Ecole de scribes",
    library: "Bibliotheque",
    scribehall: "Salle des scribes",
    academy: "Academie",
    archive: "Archives",
    university: "Universite",
    observatory: "Observatoire",
    datavault: "Coffre de donnees",
    dense: "Quartier dense",
    arcology: "Arcologie",
    grid: "Quartier en grille"
  };
  if (labels[variant]) return labels[variant];
  if (type === "house") return "Logement";
  if (type === "farm") return "Zone agricole";
  if (type === "library") return "Lieu de savoir";
  if (type === "public") return "Batiment public";
  return "Batiment";
}

function cityMapDescribeTile(t) {
  if (t.type === "engine") {
    const density = t.tier >= 3 ? "quartier dense" : t.tier >= 2 ? "complexe" : t.tier >= 1 ? "groupe" : "unite";
    const spread = t.groupTotal > 1 ? ` | groupe ${t.groupIndex}/${t.groupTotal} (${t.groupLevel})` : "";
    return { title: t.buildingName || cityMapVariantLabel(t.type, t.variant), body: `Niveau total ${t.level || 1}${spread} - ${density}` };
  }
  const seed = cmHash(`${t.key}:${state.cycles || 0}`);
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
  const title = t.type === "house"
    ? `${cityMapVariantLabel(t.type, t.variant)} de ${cmCitizenName(seed, band)}`
    : cityMapVariantLabel(t.type, t.variant);
  return { title };
}

function cityMapHitTest(sx, sy) {
  if (!CM.layout) return null;
  const world = cityMapWorldAtScreen(sx, sy);
  const gx = Math.floor(world.x / CM.TILE);
  const gy = Math.floor(world.y / CM.TILE);
  let bestCitizen = null;
  let bestDist = Infinity;
  const citizenRadius = Math.max(8, 7 * CM.cam.zoom);
  for (const p of CM.citizens) {
    const sp = cityMapScreenFromWorld(p.x, p.y);
    const dist = Math.hypot(sp.x - sx, sp.y - sy);
    if (dist < citizenRadius && dist < bestDist) {
      bestCitizen = p;
      bestDist = dist;
    }
  }
  if (bestCitizen) {
    return { title: bestCitizen.name, body: bestCitizen.role, kind: "Habitant" };
  }
  if (Array.isArray(state.wonders)) {
    for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
      const w = CM_WONDERS[wi];
      if (!state.wonders.includes(w.id)) continue;
      const slot = cmWonderSlot(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy);
      const wsx = (slot.gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
      const wsy = (slot.gy * CM.TILE + CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
      if (Math.hypot(wsx - sx, wsy - sy) < Math.max(32, CM.TILE * CM.cam.zoom * 2.5)) {
        return { title: w.name, body: w.unlockedBy ? `Declencheur : ${w.unlockedBy}` : "", kind: "Merveille" };
      }
    }
  }
  const tile = CM.tileGrid?.get(gx + "," + gy);
  if (tile) {
    const info = cityMapDescribeTile(tile);
    return { ...info, kind: tile.type === "house" ? "Logement" : "Batiment" };
  }
  if (CM.roadSet.has(`${gx},${gy}`)) return { title: cmRoadName(gx, gy), kind: "Voie" };
  return null;
}

function cityMapShowTooltip(hit, sx, sy) {
  if (!CM.tooltip) return;
  if (!hit) {
    CM.tooltip.classList.remove("visible");
    CM.hover = null;
    return;
  }
  CM.hover = hit;
  const kindEl = CM.tooltip.querySelector("[data-citymap-tooltip-kind]");
  const titleEl = CM.tooltip.querySelector("[data-citymap-tooltip-title]");
  const bodyEl = CM.tooltip.querySelector("[data-citymap-tooltip-body]");
  if (kindEl) kindEl.textContent = hit.kind || "";
  if (titleEl) titleEl.textContent = hit.title || "";
  if (bodyEl) {
    bodyEl.textContent = hit.body || "";
    bodyEl.hidden = !hit.body;
  }
  CM.tooltip.style.left = `${Math.min(CM.cw - 18, sx + 14)}px`;
  CM.tooltip.style.top = `${Math.max(12, sy - 8)}px`;
  CM.tooltip.classList.add("visible");
}


function cityMapHitTestCitizenWithThought(sx, sy) {
  if (!CM.layout) return null;
  const z = CM.cam.zoom;
  let best = null;
  let bestDist = Infinity;
  const clickRadius = Math.max(16, 14 * z);
  const now = performance.now();
  const eraI = CM.layout?.counts?.eraIndex ?? 0;
  for (const p of CM.citizens) {
    if (!p.thoughtType || p.thoughtTimer <= 0) continue;
    const wob = p.pauseT > 0 ? 0 : Math.sin(now / 240 + (p.phase || 0)) * 1.1;
    const perpX = (p.dir === 2 || p.dir === 3) ? 1 : 0;
    const perpY = perpX ? 0 : 1;
    const swSign = (p.phase > Math.PI) ? 1 : -1;
    const swOff = eraI >= 5 ? swSign * 0.27 * CM.TILE * z : 0;
    const px = (p.x - CM.cam.x) * z + CM.cw / 2 + wob * perpX * z + swOff * perpX;
    const py = (p.y - CM.cam.y) * z + CM.ch / 2 + wob * perpY * z + swOff * perpY;
    const distBody = Math.hypot(px - sx, py - sy);
    const bx = px;
    const by = py - 14 * Math.max(0.6, z);
    const distBubble = Math.hypot(bx - sx, by - sy);
    const minDist = Math.min(distBody, distBubble);
    if (minDist < clickRadius && minDist < bestDist) {
      best = p;
      bestDist = minDist;
    }
  }
  return best;
}



function bindCityMapInput(canvas, mapRoot, callbacks = {}) {
  const showHover = callbacks.showHover || function () {};
  const clearHover = callbacks.clearHover || function () {};
  const controller = new AbortController();
  const { signal } = controller;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = cityMapWorldAtScreen(mx, my);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    CM.cam.zoom = Math.max(0.35, Math.min(3.2, CM.cam.zoom * factor));
    const after = cityMapWorldAtScreen(mx, my);
    CM.cam.x += before.x - after.x;
    CM.cam.y += before.y - after.y;
  }, { passive: false, signal });

  canvas.addEventListener("mousemove", (e) => {
    if (CM.drag) {
      clearHover();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    showHover(e.clientX - rect.left, e.clientY - rect.top);
  }, { signal });
  canvas.addEventListener("mouseleave", clearHover, { signal });

  canvas.addEventListener("mousedown", (e) => {
    CM.drag = { x: e.clientX, y: e.clientY, camx: CM.cam.x, camy: CM.cam.y, moved: 0 };
  }, { signal });

  window.addEventListener("mousemove", (e) => {
    if (!CM.drag) return;
    const dx = e.clientX - CM.drag.x;
    const dy = e.clientY - CM.drag.y;
    CM.drag.moved += Math.abs(dx) + Math.abs(dy);
    CM.cam.x = CM.drag.camx - dx / CM.cam.zoom;
    CM.cam.y = CM.drag.camy - dy / CM.cam.zoom;
    canvas.style.cursor = "grabbing";
  }, { signal });

  window.addEventListener("mouseup", () => {
    if (CM.drag && CM.drag.moved > 6) CM.dragged = true;
    CM.drag = null;
    canvas.style.cursor = "grab";
  }, { signal });

  if (mapRoot) mapRoot.addEventListener("click", (e) => {
    if (CM.dragged) {
      e.stopImmediatePropagation();
      CM.dragged = false;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hitCitizen = cityMapHitTestCitizenWithThought(mx, my);
    if (hitCitizen && callbacks.onCitizenThoughtClicked) {
      e.stopImmediatePropagation();
      e.preventDefault();
      const type = hitCitizen.thoughtType;
      hitCitizen.thoughtType = null;
      hitCitizen.thoughtTimer = 0;
      CM.globalBubbleCooldown = Math.random() * 90 + 90; // 1.5 - 3 minutes before next bubble
      callbacks.onCitizenThoughtClicked(hitCitizen, type);
    }
  }, { capture: true, signal });

  return () => controller.abort();
}


// Cache engineSig et cityCounts entre frames — ne recalculer que si les bâtiments changent.
let _cachedEngineSigBuildVer = -1;
let _cachedEngineSig = "";
let _cachedCityCounts = null;
let _cachedCityCountsPopKey = "";

function cityMapEnsureLayout(now, deps = {}) {
  const getVehicleDensity = deps.getVehicleDensity || function () { return 0; };
  const chooseRoadVehicleType = deps.chooseRoadVehicleType || function () { return "cart"; };

  // engineSig : ne reconstruire que si les bâtiments ont changé (renderCache._buildingsVersion)
  if (renderCache._buildingsVersion !== _cachedEngineSigBuildVer) {
    _cachedEngineSig = CM_MAP_BUILDINGS.map((meta) => `${meta.id}:${Math.floor((state.buildings && state.buildings[meta.id]) || 0)}`).join("|");
    _cachedEngineSigBuildVer = renderCache._buildingsVersion;
    _cachedCityCounts = null; // invalider aussi cityCounts
  }
  // cityCounts : ne recalculer que si population/infra/knowledge/cycles ont changé significativement
  const _popKey = Math.floor(state.population / 500) + '|' + Math.floor((state.infrastructure || 0) / 200) + '|' + Math.floor((state.knowledge || 0) / 200) + '|' + (state.cycles || 0);
  if (!_cachedCityCounts || _popKey !== _cachedCityCountsPopKey) {
    _cachedCityCounts = cityCounts(state);
    _cachedCityCountsPopKey = _popKey;
  }
  const cc = _cachedCityCounts;
  const engineSig = _cachedEngineSig;

  const sig = cc.eraIndex + '|' + cc.eraFrac.toFixed(2) + '|' + (state.cycles || 0) + '|' + engineSig;
  if (sig === CM.layoutSig && CM.layout) return;
  // Bâtiments achetés → recompute immédiat (pas de throttle) pour que l'animation démarre sans délai.
  // Pour les changements de eraFrac seuls, on limite à 1 recompute par 1500ms.
  const coreSig = cc.eraIndex + '|' + (state.cycles || 0) + '|' + engineSig;
  const coreChanged = coreSig !== CM.layoutCoreSig;
  if (CM.layout && !coreChanged && (now - CM.layoutRecomputeAt) < 1500) return;
  CM.layoutSig = sig;
  CM.layoutCoreSig = coreSig;
  CM.layoutRecomputeAt = now;
  CM.tileDirtyUntil = now + 1200; // grace birth animations (engine tiles take 800ms)
  CM.tileCamKey = '';             // force re-bake tile canvas après fenêtre de naissance
  const L = computeCityLayout(state);

  // Naissance des nouvelles tuiles (anim de construction 0.5s).
  const seen = {};
  for (const t of L.tiles) {
    seen[t.key] = true;
    if (!CM.born[t.key]) CM.born[t.key] = now;
  }
  for (const d of L.districts || []) {
    seen[d.key] = true;
    if (!CM.born[d.key]) CM.born[d.key] = now;
  }
  for (const k in CM.born) if (!seen[k]) delete CM.born[k];

  CM.layout = L;
  setCityMapEngineTileMap(L.engineTileMap);
  CM.gridN = L.gridN;

  // Map précalculée pour le hitTest — O(1) au lieu de deux find() O(n) à chaque mousemove
  CM.tileGrid = new Map();
  for (const t of L.tiles) {
    const span = t.size || 1;
    for (let ax = 0; ax < span; ax += 1) {
      for (let ay = 0; ay < span; ay += 1) {
        const key = (t.gx + ax) + "," + (t.gy + ay);
        const existing = CM.tileGrid.get(key);
        if (!existing || t.type === "engine") CM.tileGrid.set(key, t);
      }
    }
  }

  // Filtre : on ne dessine que les routes valides et les jonctions de pont.
  const validRoadSet = L.roadSet || new Set(L.roads.map((r) => `${r.gx},${r.gy}`));
  CM.roadList = L.roads.filter((r) => {
    const k = r.gx + "," + r.gy;
    if (!validRoadSet.has(k)) return false;
    const inWater = L.river && L.river.cells && L.river.cells.has(k);
    if (inWater && r.roadSurface !== "bridge") return false;
    const onBank = L.river && L.river.banks && L.river.banks.has(k);
    if (onBank && r.roadSurface !== "bridge") {
      const adjBridge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nr = L.roadMap && L.roadMap.get((r.gx + dx) + "," + (r.gy + dy));
        return nr && nr.roadSurface === "bridge";
      });
      if (!adjBridge) return false;
    }
    return true;
  });
  CM.roadSet = validRoadSet;
  CM.walkRoadList = L.roads.filter((r) => cmIsWalkableRoad(L, r.gx, r.gy));
  // ClÃ©s numÃ©riques : Ã©vite les allocations string Ã  chaque lookup dans les boucles agents
  CM.walkRoadSet = new Set(CM.walkRoadList.map((r) => r.gx * 10000 + r.gy));
  // Ponts prÃ©calculÃ©s : Ã©vite Array.filter Ã  chaque frame dans cityMapDrawBridges
  CM.bridgeList = CM.roadList.filter((r) => r.roadSurface === "bridge");
  // Précalcul des seeds de route — évite la string `road:${gx}:${gy}:${era}` à chaque frame
  const _eraForSeed = L.counts ? L.counts.eraIndex : 0;
  for (const r of CM.roadList) {
    r._seed = cmHash(`road:${r.gx}:${r.gy}:${_eraForSeed}`);
  }

  // Cellules "ville" : la foret (infinie) ne pousse pas dessus.
  const occ = new Set(L.roadSet ? Array.from(L.roadSet) : L.roads.map((r) => `${r.gx},${r.gy}`));
  for (const t of L.tiles) {
    const span = t.size || 1;
    for (let ax = 0; ax < span; ax += 1) for (let ay = 0; ay < span; ay += 1) occ.add((t.gx + ax) + "," + (t.gy + ay));
  }
  for (const d of (L.districts || [])) {
    for (let ax = 0; ax < d.size; ax += 1) for (let ay = 0; ay < d.size; ay += 1) occ.add((d.gx + ax) + "," + (d.gy + ay));
  }
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
    for (let dy = -WONDER_CLEAR_R; dy <= WONDER_CLEAR_R; dy += 1)
      for (let dx = -WONDER_CLEAR_R; dx <= WONDER_CLEAR_R; dx += 1)
        if (Math.hypot(dx, dy) <= WONDER_CLEAR_R) occ.add((slot.gx + dx) + "," + (slot.gy + dy));
  }
  if (L.river && L.river.cells) {
    for (const k of L.river.cells) occ.add(k);
    for (const k of L.river.banks) occ.add(k);
  }
  CM.occupied = occ;
  CM.riverRow = -999;

  if (!CM.centered) {
    cityMapCenterCamera(L);
    CM.centered = true;
  }

  // Calcule la cible et supprime l'excédent — l'ajout progressif se fait dans la boucle frame.
  const lateCrowd = Math.max(0, (L.counts.eraIndex || 0) - 11);
  const eraFrac = Math.min(1, (L.counts.eraIndex || 0) / 22);
  const citizenCap = Math.round(10 + Math.pow(eraFrac, 0.55) * 240); // ~10 ère 0, ~250 ère 22
  const want = Math.round(cmClamp(2 + L.counts.houses / 6 + Math.pow(eraFrac, 1.9) * 200 + L.counts.megaDistricts * 8, 2, citizenCap));
  CM.citizenTarget = CM.walkRoadList.length ? want : 0;
  if (!CM.walkRoadList.length) {
    CM.citizens = [];
  } else if (CM.citizens.length > want) {
    CM.citizens.splice(want);
  }

  // Trafic evolutif : paniers -> charrettes -> chars/convois -> voitures -> drones.
  const trafficBase = getVehicleDensity(L.counts.eraIndex, "main") * Math.max(1, L.counts.eraIndex) * 2.45 + L.counts.houses / 38 + lateCrowd * lateCrowd * 1.05;
  const wantVeh = cmClamp(trafficBase, 0, L.counts.eraIndex >= 18 ? 80 : L.counts.eraIndex >= 14 ? 55 : L.counts.eraIndex >= 8 ? 35 : 15);
  const trafficSig = `${L.counts.eraIndex}:${wantVeh}:${L.roads.length}:${L.roads.map((r) => r.rank).join("").length}`;
  if (CM.vehicles.length !== wantVeh || CM.vehicleSig !== trafficSig || !CM.walkRoadList.length) {
    CM.vehicleSig = trafficSig;
    CM.vehicles = [];
    const ranked = CM.walkRoadList.filter((r) => getVehicleDensity(L.counts.eraIndex, r.rank || "secondary") > 0.08);
    const weighted = [];
    for (const r of (ranked.length ? ranked : CM.walkRoadList)) {
      const weight = r.rank === "main" ? 11 : r.rank === "avenue" ? 7 : r.rank === "secondary" ? 3 : 0;
      for (let w = 0; w < Math.max(1, weight); w += 1) weighted.push(r);
    }
    const pool = weighted.length ? weighted : CM.walkRoadList;
    for (let n = 0; n < wantVeh && pool.length; n += 1) {
      const r = pool[(n * 53) % pool.length];
      const vehicleType = chooseRoadVehicleType(L.counts.eraIndex, r.rank || "secondary", n);
      CM.vehicles.push({
        gx: r.gx, gy: r.gy, x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
        tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
        dir: -1, goal: null, pauseT: 0,
        type: vehicleType,
        speed: vehicleType === "drone" ? 58 + (n % 5) * 7 : vehicleType === "car" || vehicleType === "tram" ? 34 + (n % 6) * 4 : vehicleType === "basket" ? 11 + (n % 3) * 2 : vehicleType === "chariot" ? 24 + (n % 4) * 3 : vehicleType === "caravan" ? 16 + (n % 4) * 2 : 14 + (n % 4) * 2,
        col: vehicleType === "car" || vehicleType === "tram" ? ["#9b4d38", "#c0a85d", "#6f8490", "#a8a092", "#5f6f7c", "#8f6544"][n % 6] : ["#8f6534", "#b08a4a", "#7b5b35", "#c0a46a", "#6f5636", "#9a7440"][n % 6]
      });
    }
  }

  const wantShips = (L.river && L.river.present && L.counts.eraBand >= 3) ? cmClamp(2 + L.counts.eraIndex * 0.5, 2, 10) : 0;
  if (CM.ships.length !== wantShips) {
    CM.ships = [];
    for (let n = 0; n < wantShips; n += 1) {
      CM.ships.push({ t: (n / Math.max(1, wantShips)), dir: n % 2 ? 1 : -1, speed: 0.008 + (n % 4) * 0.003 });
    }
  }
}

function spawnOneCitizen(L) {
  const n = CM.citizens.length;
  const r = CM.walkRoadList[(n * 37) % CM.walkRoadList.length];
  const seed = cmHash(`${state.cycles || 0}:${n}:${r.gx},${r.gy}`);
  const roleList = CM_ROLES[Math.min(L.counts.eraBand || 0, CM_ROLES.length - 1)];
  CM.citizens.push({
    gx: r.gx, gy: r.gy,
    x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
    tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
    dir: -1, goal: null, pauseT: (seed % 5) * 0.2, phase: (seed % 628) / 100,
    speed: 22 + (n % 7) * 4 + L.counts.urbanTier * 1.8,
    col: ["#e8d2a0", "#cda36a", "#b58aa8", "#8fb8cf", "#c8b27a", "#9fb0c0"][n % 6],
    name: cmCitizenName(seed, L.counts.eraBand),
    role: cmPick(roleList, Math.floor(seed / 13))
  });
}

function initCityMap(canvas, options = {}) {
  if (CM.inited) return;
  if (!canvas || typeof canvas.getContext !== "function") return;
  const mapRoot = options.mapRoot || canvas.parentElement;
  const miniCanvas = options.minimap || null;
  const isActive = options.isActive || function () { return true; };

  CM.inited = true;
  CM.canvas = canvas;
  CM.ctx = canvas.getContext("2d");
  CM.mini = miniCanvas;
  CM.mctx = CM.mini ? CM.mini.getContext("2d") : null;
  cityMapEnsureTooltip(mapRoot, options.tooltip);
  const resize = () => cityMapResizeCanvas(canvas);
  resize();
  // Canvases offscreen : sol/routes/arbres (static) + tuiles bâtiments (tile)
  {
    const _pw = Math.max(1, Math.round(CM.cw * CM.dpr));
    const _ph = Math.max(1, Math.round(CM.ch * CM.dpr));
    const _mkOC = (w, h) => typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();
    CM.staticCanvas = _mkOC(_pw, _ph);
    CM.sctx = CM.staticCanvas.getContext('2d');
    CM.sctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
    CM.staticCamKey = '';
    CM.tileCanvas = _mkOC(_pw, _ph);
    CM.tctx = CM.tileCanvas.getContext('2d');
    CM.tctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
    CM.tileDirtyUntil = 0;
    CM.tileCamKey = '';
  }
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(canvas);
  window.addEventListener("resize", resize);
  const cleanupInput = bindCityMapInput(canvas, mapRoot, {
    showHover: (sx, sy) => cityMapShowTooltip(cityMapHitTest(sx, sy), sx, sy),
    clearHover: () => cityMapShowTooltip(null),
    onCitizenThoughtClicked: options.onCitizenThoughtClicked
  });
  CM.cleanup = () => {
    cleanupInput();
    resizeObserver?.disconnect();
    window.removeEventListener("resize", resize);
    cityMapShowTooltip(null);
  };
  const cityMapRuntimeDeps = { getVehicleDensity, chooseRoadVehicleType };

  const FRAME_MS = 1000 / 30; // cap à 30fps — suffisant pour un idle, évite la surcharge CPU
  let last = performance.now();
  let lastCitizenSpawn = 0;
  function frame(now) {
    CM.raf = requestAnimationFrame(frame);
    if (now - last < FRAME_MS) return;
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    const active = isActive();
    if (active && CM.canvas && CM.cw > 0) {
      if (!CM.cw) resize();
      cityMapEnsureLayout(now, cityMapRuntimeDeps);
      cmCheckWonders(now);

      // Arrivée progressive des citoyens : cadence selon l'ère et la population
      const target = CM.citizenTarget || 0;
      if (CM.layout && CM.walkRoadList.length && CM.citizens.length < target) {
        const eraIndex = CM.layout.counts ? (CM.layout.counts.eraIndex || 0) : 0;
        // Intervalle en ms : de 3000ms (ère 0) à 300ms (ère 20+), lié à l'ère
        const msPerCitizen = Math.max(300, 3000 - eraIndex * 135);
        if (now - lastCitizenSpawn >= msPerCitizen) {
          lastCitizenSpawn = now;
          spawnOneCitizen(CM.layout);
        }
      }
      // Cycle jour/nuit lent (~5 min).
      CM.nightF = 0.5 - 0.5 * Math.cos((now || 0) / 300000 * Math.PI * 2);
      // Cache per-frame derived values — constant within a frame, avoids recompute par sprite/route
      const _n = CM.nightF;
      CM.litWarm = `rgba(255,204,68,${(0.25 + _n * 0.65).toFixed(2)})`;
      CM.litGold = `rgba(255,220,120,${(0.35 + _n * 0.6).toFixed(2)})`;
      CM.cmLitColorStr = `rgba(255,${Math.round(204 + (1 - _n) * 28)},${Math.round(68 + (1 - _n) * 64)},${(0.32 + 0.62 * _n).toFixed(2)})`;
      if (CM.layout && CM.layout.counts) {
        CM.frameEraIndex = CM.layout.counts.eraIndex || 0;
        CM.frameRuined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
      }
      // Detection d'effondrement (anim de destruction centre -> exterieur).
      if (typeof collapseInProgress !== "undefined" && collapseInProgress) { if (!CM.collapseAt) CM.collapseAt = now; }
      else { CM.collapseAt = 0; }
      // --- Couches statiques (rebake uniquement si camera ou layout change) ---
      const _camKey = Math.round(CM.cam.x) + ':' + Math.round(CM.cam.y) + ':' + CM.cam.zoom.toFixed(2) + ':' + CM.layoutRecomputeAt + ':' + CM.nightF.toFixed(1);
      if (_camKey !== CM.staticCamKey && CM.staticCanvas) {
        const _mainCtx = CM.ctx;
        CM.ctx = CM.sctx;
        CM.sctx.setTransform(1, 0, 0, 1, 0, 0);
        CM.sctx.clearRect(0, 0, CM.staticCanvas.width, CM.staticCanvas.height);
        CM.sctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
        // NB: sol ET rivière ne sont PAS dans ce canvas — ils sont dessinés live
        // pour maintenir l'ordre : sol → rivière → (blit: arbres/routes/ponts/lumières)
        cityMapDrawTrees();
        cityMapDrawVestiges();
        cityMapDrawUrbanMass(CM.layout);
        for (const r of CM.roadList) cityMapDrawRoad(r);
        cityMapDrawBridges();
        cityMapDrawStreetLights(now);
        CM.ctx = _mainCtx;
        CM.staticCamKey = _camKey;
      }
      // Sol + rivière d'abord (sous le canvas statique), puis blit
      cityMapDrawGround(CM.layout);
      cityMapDrawRiver(now);
      if (CM.staticCanvas) {
        CM.ctx.drawImage(CM.staticCanvas, 0, 0, CM.cw, CM.ch);
      } else {
        // sol + rivière déjà dessinés live au-dessus
        cityMapDrawTrees();
        cityMapDrawVestiges();
        cityMapDrawUrbanMass(CM.layout);
        for (const r of CM.roadList) cityMapDrawRoad(r);
        cityMapDrawBridges();
        cityMapDrawStreetLights(now);
      }
      // --- Couches dynamiques (animees, chaque frame) ---
      // Agents AVANT les batiments -> charrettes/pietons/navires passent derriere.
      updateVehicles(dt);
      drawShips(dt);
      drawCentralFire(now);
      drawCitizens(dt, now);
      drawVehicles(now, "ground");
      const tw = state.timeWear || 0, maxD2 = CM.layout ? CM.layout.maxD2 : 1;
      if (CM.layout) {
        const _tileKey = CM.layoutRecomputeAt + ':' + Math.round(CM.cam.x) + ':' + Math.round(CM.cam.y) + ':' + CM.cam.zoom.toFixed(2) + ':' + tw.toFixed(2) + ':' + (CM.frameRuined ? 1 : 0);
        if (now >= CM.tileDirtyUntil && CM.tileCanvas) {
          // Hors fenêtre de naissance : bake les tuiles statiques, engine toujours live
          if (_tileKey !== CM.tileCamKey) {
            const _mainCtx2 = CM.ctx;
            CM.ctx = CM.tctx;
            CM.tctx.setTransform(1, 0, 0, 1, 0, 0);
            CM.tctx.clearRect(0, 0, CM.tileCanvas.width, CM.tileCanvas.height);
            CM.tctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
            for (const t of CM.layout.tiles) if (t.type !== "engine") drawTile(t, now, tw, maxD2);
            CM.ctx = _mainCtx2;
            CM.tileCamKey = _tileKey;
          }
          CM.ctx.drawImage(CM.tileCanvas, 0, 0, CM.cw, CM.ch);
          // Tuiles engine toujours dessinées live : leurs sprites ont des animations (feu, roues...).
          for (const t of CM.layout.tiles) if (t.type === "engine") drawTile(t, now, tw, maxD2);
        } else {
          // Pendant la fenêtre de naissance : tout live
          for (const t of CM.layout.tiles) drawTile(t, now, tw, maxD2);
        }
      }
      // Nuit : assombrit la scene, les villes avancees se mettent a briller.
      cityMapDrawNight(now);
      drawCrisis(dt, now);
      // Merveilles (trophees) par-dessus la nuit : elles restent eclatantes.
      if (CM.layout && Array.isArray(state.wonders)) {
        for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
          if (state.wonders.includes(CM_WONDERS[wi].id)) drawWonder(CM_WONDERS[wi], wi, now);
        }
      }
      drawVehicles(now, "air"); // drones au-dessus
      drawCitizenThoughts(now);
    }
  }
  // Premiere mise en page immediate puis boucle.
  if (CM.cw === 0) resize();
  // Hook de diagnostic : force une frame (utile quand rAF est gele en arriere-plan).
  CM.forceFrame = () => { resize(); frame(performance.now()); };
  CM.raf = requestAnimationFrame(frame);
}


export { CM, initCityMap, cityMapTileScreen };
