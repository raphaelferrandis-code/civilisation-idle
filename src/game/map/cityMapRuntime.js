/* eslint-disable */
import { state, collapseInProgress, buildingById, renderCache } from '../core/state.js';
import { toNum, D } from '../core/num.js';
import { pressureBreakdown, cityVitals } from '../core/mechanics.js';
import {
  CM,
  CM_MAP_BUILDINGS,
  CM_WONDERS,
  ROAD_E,
  ROAD_N,
  ROAD_S,
  ROAD_W,
  cmWonderSlot,
  cmWonderActiveIds,
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
  WONDER_CLEAR_R,
  WONDER_TIER_NAMES
} from './layout.js';
import { setCityMapEngineTileMap, setResetCameraCenterHandler } from './cityMapBridge.js';
import {
  cityMapDrawGround,
  cityMapDrawTerrain,
  cityMapDrawRiver,
  cityMapDrawTrees,
  cityMapDrawVestiges,
  cityMapDrawUrbanMass,
  cityMapDrawNight,
  cityMapDrawStreetLights,
  cityMapDrawBridges,
  cityMapDrawBridgeLights,
  cityMapDrawWalls,
  cityMapDrawPlazaSurface,
  cityMapDrawPlazas,
  cityMapDrawMist,
  cityMapDrawQuays,
  cityMapDrawCityReflections,
  cityMapDrawHealthTint,
  cityMapDrawCityLights,
  cityMapDrawEraDetails,
  cityMapDrawEraGlow,
  drawCrisis,
  cityMapDrawRoad,
  cityMapDrawRoadMarkings,
  cityMapCalmRioterAt
} from './renderWorld.js';
import { drawTile, drawWonder, drawCentralFire, drawCentralFireGlow, drawMinimap } from './renderBuildings.js';
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
  // Caméra centrée sur le cœur urbain du plan procédural.
  CM.cam.x = (layout.plan?.core?.x ?? layout.gridN / 2) * CM.TILE;
  CM.cam.y = (layout.plan?.core?.y ?? layout.gridN / 2) * CM.TILE;
  // Zoom recule avec la taille de la ville : village (22 tuiles visibles) → mégalopole (36 tuiles)
  const targetTiles = 22 + Math.min(14, Math.max(0, (layout.gridN - 20) * 0.07));
  CM.cam.zoom = Math.max(0.35, Math.min(1.6, CM.cw / (targetTiles * CM.TILE)));
}

// Borne la caméra sur la zone de contenu : fleuve (amont→aval) en X, grille
// jouable en Y. Empêche de paner ou de dézoomer au point de voir le bout net du
// ruban OU de dériver dans la nature infinie — le contenu remplit toujours le
// cadre. Marge en X pour garder le biseau du bout hors-champ ; léger anneau de
// nature en Y. (Pas de fleuve = boîte X repliée sur la grille.)
function cmClampCamera() {
  const L = CM.layout;
  if (!L || !CM.cw || !CM.ch) return;
  const T = CM.TILE, N = L.gridN || 0;
  const sm = (L.river && L.river.present && L.river.samples && L.river.samples.length) ? L.river.samples : null;
  // Boîte de cadrage (px monde).
  const bx0 = (sm ? sm[0].x * T : 0) + (sm ? 3 * T : 0);
  const bx1 = (sm ? sm[sm.length - 1].x * T : N * T) - (sm ? 3 * T : 0);
  // Marge verticale ample : largement au-dessus de la hauteur d'un sprite de
  // bâtiment (les bâtiments montent au-dessus de leur tuile) -> aucun n'est rogné
  // en haut/bas, et on garde du mou pour ne pas se sentir coincé.
  const by0 = -0.5 * N * T;       // ~½ grille de nature au-dessus
  const by1 = (N + 0.5 * N) * T;  // ... et en dessous
  const boxW = bx1 - bx0, boxH = by1 - by0;
  if (boxW <= 0 || boxH <= 0) return;
  // Plancher de zoom : la boîte contient toujours le viewport (axe contraignant
  // ajusté pile -> on prend le max des deux ajustements).
  const zoomFloor = Math.min(3.2, Math.max(CM.cw / boxW, CM.ch / boxH));
  if (CM.cam.zoom < zoomFloor) CM.cam.zoom = zoomFloor;
  // Pan : chaque bord d'écran reste dans la boîte (centré si l'écran dépasse la
  // boîte sur cet axe).
  const halfW = (CM.cw / 2) / CM.cam.zoom, halfH = (CM.ch / 2) / CM.cam.zoom;
  const loX = bx0 + halfW, hiX = bx1 - halfW;
  const loY = by0 + halfH, hiY = by1 - halfH;
  CM.cam.x = loX > hiX ? (bx0 + bx1) / 2 : Math.max(loX, Math.min(hiX, CM.cam.x));
  CM.cam.y = loY > hiY ? (by0 + by1) / 2 : Math.max(loY, Math.min(hiY, CM.cam.y));
}

function cityMapEnsureTooltip(mapRoot, tooltipElement = null) {
  CM.tooltip = tooltipElement || mapRoot?.querySelector(".city-map-tooltip") || null;
}

function cityMapVariantLabel(type, variant) {
  const labels = {
    firepit: "Grange commune",
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
  // Les émeutiers se déplacent en groupe : survoler l'un d'eux signale l'émeute.
  if (Array.isArray(CM.rioters) && CM.rioters.length) {
    for (const p of CM.rioters) {
      const sp = cityMapScreenFromWorld(p.x, p.y);
      if (Math.hypot(sp.x - sx, sp.y - sy) < citizenRadius) {
        return { title: "Une émeute est en cours !", body: "Des habitants en colère défilent, torches et fourches levées. Cliquez sur un émeutier pour l'apaiser.", kind: "Émeute" };
      }
    }
  }
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
    const activeWonders = cmWonderActiveIds(state);
    for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
      const w = CM_WONDERS[wi];
      if (!activeWonders.has(w.id)) continue;
      const slot = cmWonderSlot(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy);
      const wsx = (slot.gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
      const wsy = (slot.gy * CM.TILE + CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
      if (Math.hypot(wsx - sx, wsy - sy) < Math.max(32, CM.TILE * CM.cam.zoom * 2.5)) {
        const tier = (state.wonderTiers && state.wonderTiers[w.id]) || 1;
        const next = w.tiers && tier < w.tiers.length ? ` — prochain rang : ${w.tierLabel(w.tiers[tier])}` : " — rang maximal";
        return { title: `${w.name} (rang ${WONDER_TIER_NAMES[tier]})`, body: `${w.unlockedBy || ""}${next}`, kind: "Merveille" };
      }
    }
  }
  // Portes de l'enceinte : chacune a son nom.
  if (CM.layout && CM.layout.walls && Array.isArray(CM.layout.walls.gates)) {
    for (const g of CM.layout.walls.gates) {
      if (Math.hypot(gx - g.gx, gy - g.gy) <= 1.6) {
        return { title: g.name, body: "L'un des rares accès fortifiés de la vieille ville.", kind: "Porte" };
      }
    }
  }
  const tile = CM.tileGrid?.get(gx + "," + gy);
  if (tile) {
    const info = cityMapDescribeTile(tile);
    return { ...info, kind: tile.type === "house" ? "Logement" : "Batiment" };
  }
  if (CM.roadSet.has(`${gx},${gy}`)) {
    const road = CM.layout.roadMap && CM.layout.roadMap.get(gx + "," + gy);
    return { title: cmRoadName(gx, gy), kind: road && road.rank === "plaza" ? "Place" : "Voie" };
  }
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
    // Émeutiers : un clic apaise l'individu visé (prioritaire sur le reste).
    if (cityMapCalmRioterAt(mx, my)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
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
  const _popKey = Math.floor(toNum(state.population) / 500) + '|' + Math.floor(toNum(state.infrastructure) / 200) + '|' + Math.floor(toNum(state.knowledge) / 200) + '|' + (state.cycles || 0);
  if (!_cachedCityCounts || _popKey !== _cachedCityCountsPopKey) {
    _cachedCityCounts = cityCounts(state);
    _cachedCityCountsPopKey = _popKey;
  }
  const cc = _cachedCityCounts;
  const engineSig = _cachedEngineSig;

  // Bande de crise : 0 normal, 1 crise, 2 effondrement imminent — force une
  // régénération du layout quand l'état de la ville bascule (chaos procédural).
  const crisisBand = ((state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1) ? 2
    : ((state.timeWear || 0) > 0.6 || (state.instability || 0) >= 0.6) ? 1 : 0;
  // Les merveilles réservent leur clairière au prochain calcul du plan : leur
  // érection doit donc invalider le layout, sinon elles s'affichent par-dessus
  // les bâtiments existants jusqu'à la régénération suivante.
  const wonderSig = cmWonderActiveIds(state).size;
  const sig = cc.eraIndex + '|' + cc.eraFrac.toFixed(2) + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + engineSig;
  if (sig === CM.layoutSig && CM.layout) return;
  // Bâtiments achetés → recompute immédiat (pas de throttle) pour que l'animation démarre sans délai.
  // Pour les changements de eraFrac seuls, on limite à 1 recompute par 1500ms.
  const coreSig = cc.eraIndex + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + engineSig;
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
  // Les clés "wonder:*" sont gérées par la boucle de rendu (animation de levée à
  // la (ré)érection) et NON par cette comptabilité de naissance des tuiles : ne
  // pas les purger ici, sinon l'horodatage de naissance est effacé à chaque
  // recalcul (donc à chaque achat) et l'animation d'apparition rejoue.
  for (const k in CM.born) if (!seen[k] && !k.startsWith("wonder:")) delete CM.born[k];

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
  // Cellules de route appartenant aux places : cibles de flânerie des piétons.
  CM.plazaRoadCells = [];
  if (L.plan && Array.isArray(L.plan.plazas)) {
    for (const p of L.plan.plazas) {
      for (const r of CM.walkRoadList) {
        if (Math.abs(r.gx - p.gx) <= p.size && Math.abs(r.gy - p.gy) <= p.size) CM.plazaRoadCells.push(r);
      }
    }
  }
  // Clés numériques : évite les allocations string à chaque lookup dans les boucles agents
  CM.walkRoadSet = new Set(CM.walkRoadList.map((r) => r.gx * 10000 + r.gy));
  // Ponts précalculés : évite Array.filter à chaque frame dans cityMapDrawBridges
  CM.bridgeList = CM.roadList.filter((r) => r.roadSurface === "bridge");
  // Spans de pont (composantes connexes) + repérage du pont HISTORIQUE (le plus
  // proche du cœur, cf. river.bridge). Partagé par le rendu statique ET les
  // lampes nocturnes live. Adjacence orthogonale sur l'ensemble des cellules-pont.
  CM.bridgeSpans = [];
  CM.historicBridgeCells = new Set();
  {
    const bmap = new Map();
    for (const r of CM.bridgeList) bmap.set(r.gx + "," + r.gy, r);
    const seen = new Set();
    const ortho = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const start of CM.bridgeList) {
      const sk = start.gx + "," + start.gy;
      if (seen.has(sk)) continue;
      seen.add(sk);
      const stack = [start], cells = [], exits = [];
      while (stack.length) {
        const r = stack.pop(); cells.push(r);
        for (const [dx, dy] of ortho) {
          const nk = (r.gx + dx) + "," + (r.gy + dy);
          const nb = bmap.get(nk);
          if (nb) { if (!seen.has(nk)) { seen.add(nk); stack.push(nb); } }
          else { const nr = L.roadMap && L.roadMap.get(nk); if (nr) exits.push(nr); }
        }
      }
      let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
      for (const c of cells) { if (c.gx < gx0) gx0 = c.gx; if (c.gx > gx1) gx1 = c.gx; if (c.gy < gy0) gy0 = c.gy; if (c.gy > gy1) gy1 = c.gy; }
      CM.bridgeSpans.push({ cells, exits, gx0, gx1, gy0, gy1, vertical: (gy1 - gy0) >= (gx1 - gx0), historic: false, cx: (gx0 + gx1) / 2 });
    }
    if (CM.bridgeSpans.length && L.river && L.river.bridge) {
      const bx = L.river.bridge.x;
      let best = CM.bridgeSpans[0], bd = Infinity;
      for (const sp of CM.bridgeSpans) { const d = Math.abs(sp.cx - bx); if (d < bd) { bd = d; best = sp; } }
      best.historic = true;
      for (const c of best.cells) CM.historicBridgeCells.add(c.gx + "," + c.gy);
    }
  }
  // Routes par rive (hors cellules-pont) : cibles pour biaiser le trafic vers la
  // rive opposée → traversées de pont fréquentes et visibles.
  CM.bankRoads = { n: [], s: [] };
  if (L.river && L.river.present && L.river.riverYAt) {
    const ry = L.river.riverYAt;
    for (const r of CM.walkRoadList) {
      if (L.river.cells && L.river.cells.has(r.gx + "," + r.gy)) continue;
      (r.gy < ry(r.gx) ? CM.bankRoads.n : CM.bankRoads.s).push(r);
    }
  }
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
  const activeWonderOcc = cmWonderActiveIds(state);
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    if (!activeWonderOcc.has(CM_WONDERS[wi].id)) continue;
    const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
    for (let dy = -WONDER_CLEAR_R; dy <= WONDER_CLEAR_R; dy += 1)
      for (let dx = -WONDER_CLEAR_R; dx <= WONDER_CLEAR_R; dx += 1)
        if (Math.hypot(dx, dy) <= WONDER_CLEAR_R) occ.add((slot.gx + dx) + "," + (slot.gy + dy));
  }
  if (L.river && L.river.cells) {
    for (const k of L.river.cells) occ.add(k);
    for (const k of L.river.banks) occ.add(k);
  }
  if (L.walls) for (const wc of L.walls.cells) occ.add(wc.gx + "," + wc.gy);
  CM.occupied = occ;
  CM.riverRow = -999;

  if (!CM.centered) {
    cityMapCenterCamera(L);
    CM.centered = true;
  }

  // Calcule la cible et supprime l'excédent — l'ajout progressif se fait dans la boucle frame.
  const lateCrowd = Math.max(0, (L.counts.eraIndex || 0) - 11);
  const eraFrac = Math.min(1, (L.counts.eraIndex || 0) / 22);
  // Foule de fin de partie : ~10 piétons à l'ère 0, jusqu'à ~450 en mégalopole.
  const citizenCap = Math.round(10 + Math.pow(eraFrac, 0.55) * 440);
  // La personnalité de la ville module l'animation des rues (cité marchande
  // grouillante vs cité agricole paisible vs ville en crise désertée).
  const densityMul = (L.personality && L.personality.densityMul) || 1;
  const want = Math.round(cmClamp((2 + L.counts.houses / 5 + Math.pow(eraFrac, 1.9) * 360 + L.counts.megaDistricts * 9) * densityMul, 2, citizenCap));
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
      if (r.rank === "plaza") continue; // les esplanades sont piétonnes
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
        fade: 0, // la flotte est reconstruite à chaque recalcul du plan : fondu d'apparition
        dir: n % 2 ? 0 : 2, goal: null, pauseT: 0,
        // Une partie des voitures apparaît garée en bord de rue, puis démarre.
        parkT: vehicleType === "car" && n % 3 === 0 ? 4 + (n % 7) * 3 : 0,
        parkSide: n % 2 ? 1 : -1,
        type: vehicleType,
        speed: vehicleType === "drone" ? 58 + (n % 5) * 7 : vehicleType === "car" || vehicleType === "tram" ? 34 + (n % 6) * 4 : vehicleType === "basket" ? 11 + (n % 3) * 2 : vehicleType === "chariot" ? 24 + (n % 4) * 3 : vehicleType === "caravan" ? 16 + (n % 4) * 2 : 14 + (n % 4) * 2,
        col: vehicleType === "car" || vehicleType === "tram" ? ["#9b4d38", "#c0a85d", "#6f8490", "#a8a092", "#5f6f7c", "#8f6544"][n % 6] : ["#8f6534", "#b08a4a", "#7b5b35", "#c0a46a", "#6f5636", "#9a7440"][n % 6]
      });
    }
  }

  // Trafic fluvial lié au PORT : la flotte grandit avec le niveau de river_ports
  // (+ un peu de marchés/ère pour la variété). Sans port, juste une barque isolée
  // sur un fleuve de village. Pas de fleuve → rien.
  const hasRiver = !!(L.river && L.river.present);
  const portLvl = hasRiver ? Math.floor((state.buildings && state.buildings.river_ports) || 0) : 0;
  const mktLvl = Math.floor((state.buildings && state.buildings.markets) || 0);
  let wantShips = 0;
  if (hasRiver) {
    if (portLvl > 0) wantShips = cmClamp(Math.round(1 + portLvl * 0.7 + mktLvl * 0.12 + L.counts.eraIndex * 0.2), 2, 12);
    else if (L.counts.eraBand >= 2) wantShips = 1;
  }
  if (CM.ships.length !== wantShips) {
    CM.ships = [];
    for (let n = 0; n < wantShips; n += 1) {
      CM.ships.push({ t: (n / Math.max(1, wantShips)), dir: n % 2 ? 1 : -1, speed: 0.008 + (n % 4) * 0.003 });
    }
  }

  // Quais d'escale : position sur le ruban de chaque PORT fluvial (pas les moulins),
  // mis en cache par layout. side = vers quelle berge le bateau dérive pour accoster
  // (normale en convention increasing-sample, identique à celle de drawShips).
  if (CM.shipDocksKey !== CM.layoutRecomputeAt) {
    CM.shipDocksKey = CM.layoutRecomputeAt;
    CM.shipDocks = [];
    if (hasRiver && portLvl > 0 && L.river.samples) {
      const sm = L.river.samples, len = sm.length;
      for (const tile of (L.tiles || [])) {
        if (tile.buildingId !== "river_ports") continue;
        const px = tile.gx + (tile.spanX || tile.size || 1) / 2;
        const py = tile.gy + (tile.spanY || tile.size || 1) / 2;
        let bi = 0, bd = Infinity;
        for (let i = 0; i < len; i += 1) { const dd = (sm[i].x - px) ** 2 + (sm[i].y - py) ** 2; if (dd < bd) { bd = dd; bi = i; } }
        const a = sm[Math.max(0, bi - 1)], b = sm[Math.min(len - 1, bi + 1)];
        let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;
        const side = ((px - sm[bi].x) * nx + (py - sm[bi].y) * ny) >= 0 ? 1 : -1;
        CM.shipDocks.push({ t: bi / Math.max(1, len - 1), side });
      }
    }
  }
}

function spawnOneCitizen(L) {
  const n = CM.citizens.length;
  const r = CM.walkRoadList[(n * 37) % CM.walkRoadList.length];
  const seed = cmHash(`${state.cycles || 0}:${n}:${r.gx},${r.gy}`);
  // Rôles définis par la config d'âge (huttes → tours), fallback legacy.
  const roleList = (L.ageCfg && L.ageCfg.citizenRoles)
    || CM_ROLES[Math.min(L.counts.eraBand || 0, CM_ROLES.length - 1)];
  const band = L.counts.eraBand || 0;
  // Garde-robe par ère : peaux/lin aux ères primitives, étoffes teintes ensuite.
  // Tons FONCÉS aux ères 0-1 : les teintes claires lisaient comme des points
  // blancs sur les routes sombres (bug "petits points" CE 0.2/0.3).
  const OUTFITS = band <= 1
    ? ["#6e5238", "#5d4630", "#7a5a3c", "#4e3c28", "#66503a", "#54422e"]
    : band <= 3
      ? ["#9a4d38", "#3f6a8a", "#7a8a3c", "#8a5d9a", "#b08a3a", "#5d7a6a"]
      : ["#7a4a68", "#3a6a9a", "#9a3a3a", "#4a8a6a", "#b0883a", "#5a5a8a"];
  const SKINS = ["#e8c8a0", "#d4a878", "#b88a58", "#8a5c38"];
  // Couvre-chefs : capuche sombre, paille, casque selon l'ère (1 sur 3 environ).
  const hatRoll = seed % 9;
  const hat = hatRoll === 0 ? (band <= 1 ? "#5d4226" : "#3c3228")
    : hatRoll === 1 ? (band >= 3 ? "#8a8a92" : "#c8a85a")
    : null;
  CM.citizens.push({
    gx: r.gx, gy: r.gy,
    x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
    tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
    fade: 0, // fondu d'apparition — pas de "point" qui surgit
    dir: -1, goal: null, pauseT: (seed % 5) * 0.2, phase: (seed % 628) / 100,
    speed: 22 + (n % 7) * 4 + L.counts.urbanTier * 1.8,
    col: OUTFITS[seed % OUTFITS.length],
    skin: SKINS[(seed >> 3) % SKINS.length],
    hat,
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
    if (now - last < FRAME_MS && !CM.capture) return; // capture : court-circuite le throttle
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    const active = isActive();
    if (active && CM.canvas && CM.cw > 0) {
      if (!CM.cw) resize();
      cityMapEnsureLayout(now, cityMapRuntimeDeps);
      cmClampCamera();
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
      // Cycle jour/nuit lent (~5 min) + phase (montante = crépuscule,
      // descendante = aube) + brume matinale autour de l'aube.
      if (CM.capture) {
        // Capture déterministe : plein jour (ou nuit forcée), pas de brume.
        CM.nightF = CM.capture.night; CM.dayRising = false; CM.mistF = 0;
      } else {
        const dayP = ((now || 0) / 300000) % 1;
        CM.nightF = 0.5 - 0.5 * Math.cos(dayP * Math.PI * 2);
        CM.dayRising = dayP < 0.5;
        CM.mistF = !CM.dayRising && CM.nightF > 0.1 && CM.nightF < 0.62
          ? Math.sin(((0.62 - CM.nightF) / 0.52) * Math.PI) : 0;
      }
      // Indice de santé de la cité (0 = agonie, 1 = prospérité) : la taille
      // pilote l'échelle, la santé pilote l'ambiance (palette, lumières).
      if (CM.capture) { CM.healthF = CM.capture.health; } else {
        let healthT;
        try {
          const pr = pressureBreakdown();
          const vt = cityVitals();
          const prosper = Math.max(0, Math.min(1, 0.55 + vt.foodBonus * 1.6 + vt.goldBonus * 0.9 + vt.knowledgeBonus * 0.9));
          const strain = Math.max(0, Math.min(1, pr.total * 0.5 + (state.instability || 0) * 0.55 + (state.timeWear || 0) * 0.6));
          healthT = Math.max(0, Math.min(1, prosper * 0.45 + (1 - strain) * 0.55));
        } catch (e) { healthT = CM.healthF; }
        // Lissage : la palette glisse au fil des secondes, elle ne saute pas.
        CM.healthF += (healthT - CM.healthF) * Math.min(1, dt * 0.8);
      }
      // LOD : sous ce zoom, les sprites individuels deviennent du bruit — on
      // bascule sur des masses de quartier + la couche de lumières.
      CM.lodActive = CM.cam.zoom < 0.55;
      // Cache per-frame derived values — constant within a frame, avoids recompute par sprite/route
      // Les fenêtres « allumées » des sprites sont de VRAIES lumières :
      // alpha entièrement piloté par la nuit (0 en plein jour).
      const _n = CM.nightF;
      CM.litWarm = `rgba(255,204,68,${(_n * 0.9).toFixed(2)})`;
      CM.litGold = `rgba(255,220,120,${(_n * 0.95).toFixed(2)})`;
      CM.cmLitColorStr = `rgba(255,${Math.round(204 + (1 - _n) * 28)},${Math.round(68 + (1 - _n) * 64)},${(_n * 0.94).toFixed(2)})`;
      if (CM.layout && CM.layout.counts) {
        CM.frameEraIndex = CM.layout.counts.eraIndex || 0;
        CM.frameRuined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
      }
      // Detection d'effondrement (anim de destruction centre -> exterieur).
      if (typeof collapseInProgress !== "undefined" && collapseInProgress) { if (!CM.collapseAt) CM.collapseAt = now; }
      else { CM.collapseAt = 0; }
      // --- Couches statiques (rebake uniquement si camera ou layout change) ---
      const _camKey = Math.round(CM.cam.x) + ':' + Math.round(CM.cam.y) + ':' + CM.cam.zoom.toFixed(2) + ':' + CM.layoutRecomputeAt + ':' + CM.nightF.toFixed(1) + ':' + CM.healthF.toFixed(1);
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
        cityMapDrawPlazaSurface();
        for (const r of CM.roadList) cityMapDrawRoad(r);
        cityMapDrawRoadMarkings();
        cityMapDrawBridges();
        cityMapDrawWalls();
        cityMapDrawStreetLights(now);
        CM.ctx = _mainCtx;
        CM.staticCamKey = _camKey;
      }
      // Sol + rivière d'abord (sous le canvas statique), puis blit
      cityMapDrawGround(CM.layout);
      // Relief en trompe-l'œil (option B) : ombrage de pente sur le sol sauvage
      // + berges, SOUS le fleuve et la ville (qui restent plats).
      cityMapDrawTerrain();
      cityMapDrawRiver(now);
      // Quais : berge construite (pierre/béton/énergie) là où la ville borde l'eau,
      // SUR le bord du fleuve mais SOUS le blit statique (ponts/routes/bâtiments).
      cityMapDrawQuays(now);
      // Reflets nocturnes des bâtiments riverains sur l'eau (nappes lumineuses
      // clippées au ruban), sous la brume/bateaux/blit statique.
      cityMapDrawCityReflections(now);
      // Brume/reflets : voiles clippés à l'eau, sous les bateaux, ponts,
      // routes et bâtiments.
      cityMapDrawMist(now);
      // Bateaux SUR la couche eau : ils passent sous les ponts, routes et
      // bâtiments (le blit statique les recouvre aux croisements).
      drawShips(dt);
      if (CM.staticCanvas) {
        CM.ctx.drawImage(CM.staticCanvas, 0, 0, CM.cw, CM.ch);
      } else {
        // sol + rivière déjà dessinés live au-dessus
        cityMapDrawTrees();
        cityMapDrawVestiges();
        cityMapDrawUrbanMass(CM.layout);
        cityMapDrawPlazaSurface();
        for (const r of CM.roadList) cityMapDrawRoad(r);
        cityMapDrawRoadMarkings();
        cityMapDrawBridges();
        cityMapDrawWalls();
        cityMapDrawStreetLights(now);
      }
      // --- Couches dynamiques (animees, chaque frame) ---
      // Agents AVANT les batiments -> charrettes/pietons/navires passent derriere.
      cityMapDrawPlazas(now);
      updateVehicles(dt);
      drawCentralFire(now);
      // En vue dézoomée (LOD), piétons et trafic au sol ne sont plus que du
      // bruit de 1-2px : on ne les dessine pas (ils continuent d'exister).
      if (!CM.lodActive) {
        drawCitizens(dt, now);
        drawVehicles(now, "ground");
      }
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
      // Détails signature d'ère (totem, puits, bannières...) : objets physiques,
      // ils subissent le voile santé/nuit comme le reste de la ville.
      cityMapDrawEraDetails(now);
      // Santé : voile global (désaturation/brun en crise, vibrance en prospérité)
      // appliqué AVANT la nuit — les merveilles, dessinées après, y échappent.
      cityMapDrawHealthTint();
      // Nuit : assombrit la scene, les villes avancees se mettent a briller.
      cityMapDrawNight(now);
      // Lumière du grand feu de camp (âge 0) : éclaire les alentours par-dessus
      // le voile de nuit (additif).
      drawCentralFireGlow(now);
      // Tapis de lumières nocturnes : fenêtres, districts, phares (additif).
      cityMapDrawCityLights(now);
      // Lampes de pont (additif) : par-dessus le voile de nuit, comme les fenêtres.
      cityMapDrawBridgeLights(now);
      // Lueurs signature d'ère : feux satellites, grille néon, cœur qui respire.
      cityMapDrawEraGlow(now);
      drawCrisis(dt, now);
      // Merveilles (trophees) par-dessus la nuit : elles restent eclatantes.
      // Seules les merveilles RÉÉRIGÉES ce cycle (cf. cmWonderActive) sont dessinées ;
      // une merveille en sommeil (cité pas encore assez grande) rejouera son
      // animation de levée quand l'ère atteindra son seuil — on (re)cale alors son
      // horodatage de naissance, et on l'efface quand elle redevient dormante.
      if (CM.layout && Array.isArray(state.wonders)) {
        const activeWonders = cmWonderActiveIds(state);
        for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
          const w = CM_WONDERS[wi];
          if (activeWonders.has(w.id)) {
            if (!CM.born["wonder:" + w.id]) CM.born["wonder:" + w.id] = now;
            drawWonder(w, wi, now);
          } else if (CM.born["wonder:" + w.id]) {
            delete CM.born["wonder:" + w.id];
          }
        }
      }
      drawVehicles(now, "air"); // drones au-dessus
      if (!CM.lodActive) drawCitizenThoughts(now);
    }
  }
  // Premiere mise en page immediate puis boucle.
  if (CM.cw === 0) resize();
  // Hook de diagnostic : force une frame (utile quand rAF est gele en arriere-plan).
  CM.forceFrame = () => { resize(); frame(performance.now()); };
  // Capture DÉTERMINISTE d'une frame (vérif visuelle) : court-circuite le throttle,
  // force le plein jour (pas de voile nuit qui fausse les pixels) et une santé fixe,
  // fige le temps d'animation. N'altère PAS le rendu normal (tout est gardé par le
  // flag CM.capture, nul en fonctionnement). Renvoie un dataURL (PNG par défaut).
  CM.captureFrame = (opts = {}) => {
    if (!CM.canvas) return null;
    const saved = { night: CM.nightF, mist: CM.mistF, health: CM.healthF, last };
    CM.capture = { night: opts.night ?? 0, health: opts.health ?? 1 };
    if (opts.citizens === 'none') { CM.citizens.length = 0; CM.vehicles.length = 0; CM.ships.length = 0; }
    last = -1e9; // by-passe le throttle pour forcer un vrai rendu
    resize();
    frame(opts.now ?? 0);
    CM.capture = null;
    let out = CM.canvas;
    const scale = opts.scale || 1;
    if (scale !== 1) {
      out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(CM.canvas.width * scale));
      out.height = Math.max(1, Math.round(CM.canvas.height * scale));
      const g = out.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(CM.canvas, 0, 0, out.width, out.height);
    }
    const url = opts.jpeg ? out.toDataURL('image/jpeg', opts.quality || 0.82) : out.toDataURL('image/png');
    CM.nightF = saved.night; CM.mistF = saved.mist; CM.healthF = saved.health; last = saved.last;
    return url;
  };
  // Hook dev : capture puis POST au middleware Vite -> écrit .preview-shots/<name>.png.
  if (typeof window !== 'undefined' && import.meta && import.meta.env && import.meta.env.DEV) {
    window.__cityShot = async (opts = {}) => {
      const url = CM.captureFrame(opts);
      if (!url) return { err: 'no frame' };
      const blob = await (await fetch(url)).blob();
      const res = await fetch('/__shot?name=' + encodeURIComponent(opts.name || 'shot'), { method: 'POST', body: blob });
      return res.ok ? await res.json() : { err: 'post ' + res.status };
    };
    // Aides de vérif : accès à l'état + forçage d'un recalcul de carte. Permet de
    // monter une ville de démo (population/bâtiments) puis de capturer une frame.
    window.__state = state;
    window.__D = D;
    window.__cityRecompute = () => { CM.layout = null; CM.centered = false; CM.staticCamKey = ''; CM.tileCamKey = ''; };
  }
  CM.raf = requestAnimationFrame(frame);
}


setResetCameraCenterHandler(() => { CM.centered = false; });

export { CM, initCityMap, cityMapTileScreen };
