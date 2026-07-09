/* eslint-disable */
import { state, collapseInProgress, setCollapseInProgress, buildingById, renderCache } from '../core/state.js';
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
  cmEngineGroupSig,
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
import { buildNecropolis } from './necropolis.js';
import { preloadHouseSprites } from './pixelHouses.js';
import {
  cityMapDrawGround,
  cityMapDrawTerrain,
  cityMapDrawRiver,
  cityMapDrawTrees,
  cityMapDrawUrbanMass,
  cityMapDrawNight,
  cityMapDrawStreetLights,
  cityMapDrawBridges,
  cityMapDrawBridgeLights,
  cityMapDrawPlazaSurface,
  cityMapDrawPlazas,
  cityMapDrawPlazaTallProps,
  cityMapDrawMist,
  cityMapDrawQuays,
  cityMapDrawCityReflections,
  cityMapDrawHealthTint,
  cityMapDrawCityLights,
  drawCrisis,
  cityMapDrawRoad,
  cityMapDrawRoadMarkings,
  cityMapCalmRioterAt
} from './renderWorld.js';
import { drawTile, drawWonder, drawMinimap } from './renderBuildings.js';
import { drawCitizens, updateVehicles, drawShips, getVehicleDensity, chooseRoadVehicleType, drawVehicles, drawCitizenThoughts } from './agents.js';
import { drawPixelTerrain, pixelTerrainFlag, pixelRoadsFlag, pixelSidewalkFlag, sidewalkTune, setPixelTileset } from './pixelTerrain.js';
import { drawPixelRiver, pixelWaterFlag, setPixelWater } from './pixelRiver.js';
import { drawPixelBridges, pixelBridgeFlag, setBridgeOnLoad } from './pixelBridge.js';


// Plafond de résolution de rendu : sur écrans HiDPI (dpr 2/3), dessiner à pleine
// densité multiplie par dpr² le nombre de pixels des 3 canvas (principal + 2 offscreen)
// et de chaque remplissage plein écran par frame — principale cause de lag GPU
// "dès le début" sur portables HiDPI / GPU intégrés. 1.5 reste net à l'œil.
const CM_MAX_RENDER_DPR = 1.5;

function cityMapResizeCanvas(canvas) {
  // Carte démontée (resetCityMapRuntime a nullifié ctx) : un forceFrame/resize
  // attardé crashait sur CM.ctx.setTransform (null). No-op propre.
  if (!CM.ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, CM_MAX_RENDER_DPR);
  const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 600;
  const h = canvas.clientHeight || 320;
  CM.dpr = dpr;
  CM.cw = w;
  CM.ch = h;
  const nw = Math.max(1, Math.round(w * dpr));
  const nh = Math.max(1, Math.round(h * dpr));
  // MARGE DE PAN : les 3 offscreen (sol/décor/tuiles) sont bakés PLUS GRANDS que
  // l'écran (marge M de chaque côté). Pendant un drag, on blitte la couche déjà
  // bakée DÉCALÉE (translation) au lieu de re-baker à chaque pixel → drag fluide,
  // re-bake seulement quand le pan dépasse la marge. Molette window.__panMargin
  // (px logiques ; 0 = ancien comportement re-bake/pixel). Cf. cityMapBlitMargin.
  const M = Math.max(0, Math.round((typeof window !== "undefined" && window.__panMargin != null) ? window.__panMargin : 256));
  CM._bakeMargin = M;
  const onw = Math.max(1, Math.round((w + 2 * M) * dpr));
  const onh = Math.max(1, Math.round((h + 2 * M) * dpr));
  // Réallouer un canvas — même à taille IDENTIQUE — l'efface et invalidait tous
  // les caches offscreen : forceFrame() (resize + frame) rebakait donc arbres,
  // tuiles et sol à CHAQUE appel. No-op si rien n'a changé.
  const mainSame = canvas.width === nw && canvas.height === nh;
  const offSame = !CM.staticCanvas || (CM.staticCanvas.width === onw && CM.staticCanvas.height === onh);
  if (mainSame && offSame) return;
  if (!mainSame) {
    canvas.width = nw;
    canvas.height = nh;
    CM.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // Offscreen dimensionnés AVEC la marge (onw/onh > écran). Invalide les bakes.
  if (CM.staticCanvas) {
    CM.staticCanvas.width = onw;
    CM.staticCanvas.height = onh;
    CM.sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CM.staticCamKey = ""; CM._staticBake = null;
  }
  if (CM.tileCanvas) {
    CM.tileCanvas.width = onw;
    CM.tileCanvas.height = onh;
    CM.tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CM.tileCamKey = ''; CM._tileBake = null;
  }
  if (CM.groundCanvas) {
    CM.groundCanvas.width = onw;
    CM.groundCanvas.height = onh;
    CM.gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CM.groundCamKey = ''; CM._groundBake = null;
  }
}

// ── BAKE AVEC MARGE (drag fluide) ────────────────────────────────────────────
// Bake une couche dans un offscreen PLUS GRAND que l'écran (marge M) : re-bake
// seulement si `otherKey` change (layout/zoom/nuit/…) OU si le pan a dépassé M.
// Entre-temps, `cityMapBlitMargin` translate le bake existant → aucun re-bake par
// pixel de pan (le vrai coupable du freeze au drag). drawFn peut renvoyer false
// (« pas encore stable » — tileset en chargement) → re-bake à la frame suivante.
function cityMapBakeMargin(canvas, offctx, stateName, otherKey, drawFn) {
  if (!canvas) return;
  const M = CM._bakeMargin || 0;
  const bm = CM[stateName];
  const px = bm ? (CM.cam.x - bm.camX) * CM.cam.zoom : Infinity;
  const py = bm ? (CM.cam.y - bm.camY) * CM.cam.zoom : Infinity;
  if (!bm || bm.other !== otherKey || !M || Math.abs(px) > M || Math.abs(py) > M) {
    const mainCtx = CM.ctx, cw = CM.cw, ch = CM.ch;
    CM.cw = cw + 2 * M; CM.ch = ch + 2 * M;   // viewport élargi → centre + culling couvrent la marge
    CM.ctx = offctx;
    offctx.setTransform(1, 0, 0, 1, 0, 0);
    offctx.clearRect(0, 0, canvas.width, canvas.height);
    offctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
    const st = drawFn();
    CM.ctx = mainCtx; CM.cw = cw; CM.ch = ch;
    CM[stateName] = { camX: CM.cam.x, camY: CM.cam.y, other: (st === false ? "__unstable__" : otherKey) };
  }
}
// Blit le bake, translaté du delta de pan depuis sa position de bake (-M pour cadrer
// la marge hors écran). Aligné au pixel quel que soit le pan tant qu'il reste < M.
function cityMapBlitMargin(canvas, stateName) {
  const b = CM[stateName]; if (!canvas || !b) return;
  const M = CM._bakeMargin || 0;
  const ox = (b.camX - CM.cam.x) * CM.cam.zoom - M;
  const oy = (b.camY - CM.cam.y) * CM.cam.zoom - M;
  CM.ctx.drawImage(canvas, ox, oy, CM.cw + 2 * M, CM.ch + 2 * M);
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
    // Grands complexes (districts) conservés :
    market: "Marche",
    temple: "Temple",
    keep: "Donjon",
    forum: "Forum",
    palace: "Palais",
    station: "Station civique",
    spire: "Fleche administrative",
    archive: "Archives",
    observatory: "Observatoire",
    dense: "Quartier dense",
    arcology: "Arcologie",
    grid: "Quartier en grille"
  };
  if (labels[variant]) return labels[variant];
  if (type === "house") return "Logement";
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
        return { title: "Une émeute est en cours !", body: "Des habitants en colère défilent, torches et armes de fortune levées. Cliquez sur un émeutier pour l'apaiser.", kind: "Émeute" };
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
  for (const p of CM.citizens) {
    if (!p.thoughtType || p.thoughtTimer <= 0 || p._nightHidden) continue;
    // Position écran IDENTIQUE au rendu (drawCitizens/drawCitizenThoughts) : décalage-
    // trottoir lissé p.lox/p.loy. L'ancien modèle wob/swOff n'existe plus au rendu →
    // sans cet alignement, le clic sur bulle tombe à côté (surtout ère ≥ 5, où le
    // « swagger » décalait le sprite de ~9 px sans que le hit-test le sache).
    const px = (p.x + (p.lox || 0) - CM.cam.x) * z + CM.cw / 2;
    const py = (p.y + (p.loy || 0) - CM.cam.y) * z + CM.ch / 2;
    const distBody = Math.hypot(px - sx, py - sy);
    const bx = px;
    const by = py - 18;
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
let _cachedEngineGroupSig = "";
let _cachedCityCounts = null;
let _cachedCityCountsPopKey = "";

function cityMapEnsureLayout(now, deps = {}) {
  const getVehicleDensity = deps.getVehicleDensity || function () { return 0; };
  const chooseRoadVehicleType = deps.chooseRoadVehicleType || function () { return "cart"; };

  // engineSig : ne reconstruire que si les bâtiments ont changé (renderCache._buildingsVersion)
  if (renderCache._buildingsVersion !== _cachedEngineSigBuildVer) {
    _cachedEngineSig = CM_MAP_BUILDINGS.map((meta) => `${meta.id}:${Math.floor((state.buildings && state.buildings[meta.id]) || 0)}`).join("|");
    _cachedEngineGroupSig = cmEngineGroupSig(state);   // structure des blocs (paliers), pas les comptes bruts
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
  const engineGroupSig = _cachedEngineGroupSig;

  // Bande de crise : 0 normal, 1 crise, 2 effondrement imminent — force une
  // régénération du layout quand l'état de la ville bascule (chaos procédural).
  const crisisBand = ((state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1) ? 2
    : ((state.timeWear || 0) > 0.6 || (state.instability || 0) >= 0.6) ? 1 : 0;
  // Les merveilles réservent leur clairière au prochain calcul du plan : leur
  // érection doit donc invalider le layout, sinon elles s'affichent par-dessus
  // les bâtiments existants jusqu'à la régénération suivante.
  const wonderSig = cmWonderActiveIds(state).size;
  // Routes achetées → budget de connexion du réseau (connectBuildingsToNetwork) : un
  // achat change la signature → recompute. Dans `sig` seulement (pas `coreSig`) → mis à
  // jour sur le chemin throttlé (≤1/1500ms), sûr même si une automation en achète en rafale.
  const roadCount = Math.floor((state.buildings && state.buildings.roads) || 0);
  const sig = cc.eraIndex + '|' + cc.eraFrac.toFixed(2) + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + roadCount + '|' + engineSig;
  if (sig === CM.layoutSig && CM.layout) return;
  // « 1 achat = 1 bâtiment » SANS le gel de ~240 ms : quand SEULS les comptes changent
  // (structure des blocs identique — cf. cmEngineGroupSig, stable entre paliers), on NE
  // recalcule PAS le layout (placement + connexion routière). On rafraîchit juste t.level
  // sur les tuiles moteur → la NAPPE (drawEngineSprawl) grandit d'UNE maison par achat,
  // gratuitement. Débrayable : window.__stableSkip = false.
  const structSig = cc.eraIndex + '|' + cc.eraFrac.toFixed(2) + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + roadCount + '|' + engineGroupSig;
  const skipStable = typeof window === 'undefined' || window.__stableSkip !== false;
  if (skipStable && CM.layout && structSig === CM.layoutStructSig) {
    const b = state.buildings || {};
    for (const tt of CM.layout.tiles) if (tt.type === 'engine' && tt.buildingId) tt.level = Math.floor(b[tt.buildingId] || 0);
    CM.layoutSig = sig;
    return;
  }
  // Changement STRUCTUREL (nouveau bloc / ère / merveille / route / prestige) → recompute
  // complet. Throttle : les changements de eraFrac SEULS sont limités à 1 recompute/1500ms.
  const coreSig = cc.eraIndex + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + engineGroupSig;
  const coreChanged = coreSig !== CM.layoutCoreSig;
  if (CM.layout && !coreChanged && (now - CM.layoutRecomputeAt) < 1500) return;
  CM.layoutSig = sig;
  CM.layoutStructSig = structSig;
  CM.layoutCoreSig = coreSig;
  CM.layoutRecomputeAt = now;
  CM.tileDirtyUntil = now + 1200; // grace birth animations (engine tiles take 800ms)
  CM.tileCamKey = '';             // force re-bake tile canvas après fenêtre de naissance
  const L = computeCityLayout(state);
  // Préchargement des sprites d'habitation de la bande courante AVANT la fenêtre de
  // naissance / le bake : supprime le flash procédural (« ancien sprite ») à la 1re
  // apparition d'une variante lors d'un achat (cf. preloadHouseSprites).
  preloadHouseSprites(L.counts && L.counts.eraBand || 0);
  // Garde-fou COORDS : quand la grille grandit (terme engineHomes / achats), cx=floor(N/2)
  // bouge → toute la ville se TRANSLATE en coords monde (slots core-relatifs, la ville n'a
  // pas bougé vs son cœur). On recale la caméra du delta de cœur pour supprimer le saut.
  if (CM._prevCore && CM.centered) {
    CM.cam.x += (L.cx - CM._prevCore.x) * CM.TILE;
    CM.cam.y += (L.cy - CM._prevCore.y) * CM.TILE;
  }
  CM._prevCore = { x: L.cx, y: L.cy };
  // Ordre painter's (arrière → avant) : indispensable depuis que les habitations
  // pixel-art dépassent leur tuile vers le haut — une tour au premier plan doit
  // recouvrir ce qui est derrière. Tri par gy puis gx ; les consommateurs de
  // L.tiles (naissance, tileGrid, maxD2) sont indépendants de l'ordre.
  if (Array.isArray(L.tiles)) L.tiles.sort((a, b) => (a.gy - b.gy) || (a.gx - b.gx));
  // Couverture du réseau routier (bâtiments-moteur reliés / total) → cache lu par le sim
  // (roadNetworkMultiplier, +10% max). GÉOMÉTRIQUE → ne peut venir que de la carte ; persiste
  // dans state (dernière valeur si la carte n'est pas montée / hors-ligne).
  {
    const rc = L.roadCover;
    state.roadCoverage = (rc && rc.engineTotal > 0) ? rc.engineConnected / rc.engineTotal : 0;
  }

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
  // Géométrie de la nécropole (cités mortes à l'ouest) — recalculée avec le layout
  // (mémoïsé par le throttle ci-dessus ; un effondrement change state.cycles → recompute).
  L.necropolis = buildNecropolis(state, L, CM.TILE);

  // Map précalculée pour le hitTest — O(1) au lieu de deux find() O(n) à chaque mousemove
  CM.tileGrid = new Map();
  for (const t of L.tiles) {
    const spanX = t.spanX || t.size || 1;
    const spanY = t.spanY || t.size || 1;
    for (let ax = 0; ax < spanX; ax += 1) {
      for (let ay = 0; ay < spanY; ay += 1) {
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
  // Cellules occupées par le MOBILIER de place (fontaine au centre + drapeaux/lampadaires
  // aux coins) → NON-marchables (sinon les piétons "marchent" dessus). Même géométrie que
  // cityMapDrawPlazas (renderWorld) : centre de dalle = (gx-half + size/2). On exclut ces
  // cellules de walkRoadList → tout l'aval (spawn, pas, flânerie) les évite automatiquement.
  //   • fountainCells : fontaine (centre, +0.34 au sud) — sert AUSSI au Y-SORT (occulteur, agents.js).
  //   • plazaPropCells : coins (drapeaux/lampadaires) — blocage SEUL (thème stable par seedH,
  //     répliqué à l'identique du rendu ; ⚠ garder synchro si cityMapDrawPlazas change).
  CM.fountainCells = new Set();
  CM.plazaPropCells = new Set();
  if (L.plan && Array.isArray(L.plan.plazas)) {
    const band = L.counts ? L.counts.eraBand : 0;
    const pid = L.personality ? L.personality.id : "";
    for (const p of L.plan.plazas) {
      if (!p.size || p.size < 2) continue;
      const half = Math.floor(p.size / 2);
      const cx = (p.gx - half) + p.size / 2, cy = (p.gy - half) + p.size / 2;
      // Fontaine (centre, décalée +0.34 au sud comme le sprite).
      const fwy = cy + 0.34, radX = 0.7, radY = 0.5;
      for (let gy = Math.floor(fwy - radY - 0.5); gy <= Math.ceil(fwy + radY + 0.5); gy += 1)
        for (let gx = Math.floor(cx - radX - 0.5); gx <= Math.ceil(cx + radX + 0.5); gx += 1)
          if (Math.abs((gx + 0.5) - cx) < radX && Math.abs((gy + 0.5) - fwy) < radY) CM.fountainCells.add(gx * 10000 + gy);
      // Coins (drapeaux/lampadaires) : band ≥ 2, thème + saut par coin stables (seedH).
      if (band >= 2) {
        const seedH = ((p.gx * 73856093) ^ (p.gy * 19349663)) >>> 0;
        const croll = ((Math.imul(seedH, 2654435761 + 97) >>> 0) % 1000) / 1000;
        const military = p.kind === "centrale" && pid === "militaire";
        const theme = military ? "flag" : croll < 0.34 ? "none" : croll < 0.67 ? "flag" : "lamp";
        if (theme !== "none") {
          const cd = (p.size / 2) * 0.66;
          let ci = 0;
          for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const skip = ((Math.imul(seedH, 2654435761 + 211 + ci * 17) >>> 0) % 1000) / 1000;
            ci += 1;
            if (skip < 0.16) continue;
            CM.plazaPropCells.add(Math.floor(cx + lx * cd) * 10000 + Math.floor(cy + ly * cd));
          }
        }
      }
    }
  }
  CM.walkRoadList = L.roads.filter((r) => { const k = r.gx * 10000 + r.gy; return cmIsWalkableRoad(L, r.gx, r.gy) && !CM.fountainCells.has(k) && !CM.plazaPropCells.has(k); });
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
  // ── Ancres domicile / travail ──────────────────────────────────────────────
  // Cellules-route bordant les LOGEMENTS (toute tuile non-moteur) vs les LIEUX
  // D'ACTIVITÉ (bâtiments-moteur « engine »). Cibles des trajets journaliers des
  // habitants (cf. citizenChooseNext) : le jour vers le travail et les places, le
  // soir vers le domicile. Les doublons sont volontairement gardés → les cellules
  // très bordées (cœur résidentiel, parvis d'atelier) sortent plus souvent au tirage.
  CM.homeRoadCells = [];
  CM.workRoadCells = [];
  if (Array.isArray(L.tiles)) {
    const edgeRoads = (t, out) => {
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      for (let ax = -1; ax <= sx; ax += 1) {
        for (let ay = -1; ay <= sy; ay += 1) {
          if (ax >= 0 && ax < sx && ay >= 0 && ay < sy) continue; // intérieur du bâti
          const gx = t.gx + ax, gy = t.gy + ay;
          if (CM.walkRoadSet.has(gx * 10000 + gy)) out.push({ gx, gy });
        }
      }
    };
    for (const t of L.tiles) edgeRoads(t, t.type === "engine" ? CM.workRoadCells : CM.homeRoadCells);
  }
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
  CM.occupied = occ;
  // Cellules occupées par un BÂTIMENT (tuiles + districts moteur) — sert au Y-SORT des
  // habitants/véhicules : un agent dont le voisin NORD est un bâtiment est « devant » lui
  // (dessiné en 2e passe pour ne pas être rogné). Recalculé au recompute (tuiles stables).
  const bcells = new Set();
  for (const t of L.tiles) {
    const bx = t.spanX || t.size || 1, by = t.spanY || t.size || 1;
    for (let ax = 0; ax < bx; ax += 1) for (let ay = 0; ay < by; ay += 1) bcells.add((t.gx + ax) + "," + (t.gy + ay));
  }
  for (const d of (L.districts || [])) {
    for (let ax = 0; ax < d.size; ax += 1) for (let ay = 0; ay < d.size; ay += 1) bcells.add((d.gx + ax) + "," + (d.gy + ay));
  }
  CM.buildingCells = bcells;
  CM.riverRow = -999;

  if (!CM.centered) {
    cityMapCenterCamera(L);
    CM.centered = true;
  }

  // Calcule la cible et supprime l'excédent — l'ajout progressif se fait dans la boucle frame.
  const lateCrowd = Math.max(0, (L.counts.eraIndex || 0) - 11);
  const eraFrac = Math.min(1, (L.counts.eraIndex || 0) / 22);
  // Foule de fin de partie : ~10 piétons à l'ère 0, jusqu'à ~450 en mégalopole.
  // Ville plus GROUILLANTE en milieu/fin (Raphaël) : plafond et cible relevés (~2×). Sûr côté
  // moteur — le rendu CULL déjà le hors-écran (drawCitizens, coût borné au visible) et l'update
  // par agent est O(1) (citizenChooseNext = pas glouton, pas de vrai pathfinding). Soupape/réglage
  // live : window.__citizenMul (multiplie cible ET plafond ; baisser si ça rame sur ta machine).
  const crowdMul = (typeof window !== "undefined" && window.__citizenMul) || 1;
  const citizenCap = Math.round((10 + Math.pow(eraFrac, 0.55) * 900) * crowdMul);
  // La personnalité de la ville module l'animation des rues (cité marchande
  // grouillante vs cité agricole paisible vs ville en crise désertée).
  const densityMul = (L.personality && L.personality.densityMul) || 1;
  const want = Math.round(cmClamp((2 + L.counts.houses / 3.5 + Math.pow(eraFrac, 1.65) * 540 + L.counts.megaDistricts * 10) * densityMul * crowdMul, 2, citizenCap));
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
      let vehicleType = chooseRoadVehicleType(L.counts.eraIndex, r.rank || "secondary", n);
      // Pas de tram sur les voies (véhicule rail) → retombe sur une voiture.
      if (vehicleType === "tram") vehicleType = "car";
      CM.vehicles.push({
        gx: r.gx, gy: r.gy, x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
        tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
        fade: 0, // la flotte est reconstruite à chaque recalcul du plan : fondu d'apparition
        dir: n % 2 ? 0 : 2, goal: null, pauseT: 0,
        // Plus de stationnement : les véhicules démarrent et restent en mouvement.
        parkT: 0,
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
      // lane = voie transversale propre (∈ [-0.8, 0.8]) → les bateaux s'étalent sur la
      // largeur du fleuve au lieu de suivre la ligne centrale ; phase = louvoiement.
      CM.ships.push({ t: (n / Math.max(1, wantShips)), dir: n % 2 ? 1 : -1, speed: 0.008 + (n % 4) * 0.003, lane: (Math.random() * 2 - 1) * 0.8, phase: Math.random() * Math.PI * 2 });
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
  // Type d'habitant : 0 homme (42 %) / 1 femme (42 %) / 2 enfant (16 %). Tiré via le
  // seed (déterministe, plus de scintillement) et fixé DÈS le spawn — nécessaire pour
  // moduler la vitesse des enfants et garder l'identité stable dès la 1re frame.
  const cr = (seed >> 6) % 100;
  const charType = cr < 42 ? 0 : cr < 84 ? 1 : 2;
  // Variante de skin (diversité) : 0 = originale, 1 = métisse. Fixée au spawn ; si l'ère
  // n'a pas encore la variante 1, le rendu retombe sur la 0 (agentSpecFor + repli agents.js).
  const skinVariant = (seed >> 13) % 2;
  // Domicile & lieu de travail : ancres fixes tirées via le seed (stables dans le
  // temps). Repli null tant que la ville n'a ni logement ni atelier bordé de route →
  // le piéton garde alors la flânerie libre (cf. citizenChooseNext).
  const homeCells = CM.homeRoadCells, workCells = CM.workRoadCells;
  const home = homeCells && homeCells.length ? homeCells[seed % homeCells.length] : null;
  const work = workCells && workCells.length ? workCells[(seed >> 8) % workCells.length] : null;
  CM.citizens.push({
    gx: r.gx, gy: r.gy,
    x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
    tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
    fade: 0, // fondu d'apparition — pas de "point" qui surgit
    dir: -1, goal: null, pauseT: (seed % 5) * 0.2, phase: (seed % 628) / 100,
    charType, skinVariant, home, work,
    // Allure de marche CALME — volontairement plus lente que les véhicules (qui,
    // eux, gardent leur vitesse, cf. CM.vehicles plus haut). La hausse avec la
    // densité urbaine est fortement tempérée pour que les piétons ne doublent plus
    // les charrettes en grande ville. Les enfants trottinent un peu moins vite (×0.85)
    // → les grappes familiales se lisent mieux à l'écran.
    speed: (9 + (n % 7) * 1.5 + L.counts.urbanTier * 0.6) * (charType === 2 ? 0.85 : 1),
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
    // Sol (procédural + pixel + relief) : statique à caméra fixe → baké ici,
    // blitté chaque frame (le sol pixel live coûtait ~7 ms/frame à lui seul).
    CM.groundCanvas = _mkOC(_pw, _ph);
    CM.gctx = CM.groundCanvas.getContext('2d');
    CM.gctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
    CM.groundCamKey = '';
  }
  // Préchargement des sprites d'habitation dès le MONTAGE (avant le 1er paint / bake) : les
  // PNG démarrent tout de suite → pixelHouseReady vrai à la 1re apparition d'un bâtiment,
  // donc pas de repli procédural visible à l'achat. Band de la save = couvre une ouverture
  // directe en ère cosmique. Le recompute rappelle preloadHouseSprites avec la band courante.
  preloadHouseSprites(((cityCounts(state) || {}).eraBand) || 0);
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
    // Carte démontée : ne PAS se replanifier (la boucle meurt proprement ;
    // initCityMap relance une boucle neuve au prochain montage).
    if (!CM.ctx || !CM.canvas) return;
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
        // Intervalle en ms : de 2400ms (ère 0) à 120ms (ère 20+), lié à l'ère.
        const msPerCitizen = Math.max(120, 2400 - eraIndex * 120);
        if (now - lastCitizenSpawn >= msPerCitizen) {
          lastCitizenSpawn = now;
          // Rattrapage par petits lots quand la ville est LOIN de sa cible → la foule
          // s'installe en ~30 s au lieu de plusieurs minutes (fondu → pas de pop brutal).
          const deficit = target - CM.citizens.length;
          const batch = deficit > 60 ? 4 : deficit > 20 ? 2 : 1;
          for (let b = 0; b < batch && CM.citizens.length < target; b += 1) spawnOneCitizen(CM.layout);
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
      // --- Couches statiques (rebake si layout/zoom/nuit change OU pan > marge) ---
      // NB: sol ET rivière ne sont PAS dans ce canvas — dessinés live pour l'ordre :
      // sol → rivière → (blit décor : arbres/routes/ponts/lumières).
      const _otherStatic = CM.cam.zoom.toFixed(2) + ':' + CM.layoutRecomputeAt + ':' + CM.nightF.toFixed(1) + ':' + CM.healthF.toFixed(1);
      cityMapBakeMargin(CM.staticCanvas, CM.sctx, '_staticBake', _otherStatic, () => {
        cityMapDrawTrees();
        cityMapDrawUrbanMass(CM.layout);
        cityMapDrawPlazaSurface();
        // Routes : pixel edge-Wang (dans drawPixelTerrain) si flag, sinon procédural.
        if (!(pixelTerrainFlag.on && pixelRoadsFlag.on)) {
          for (const r of CM.roadList) cityMapDrawRoad(r);
          cityMapDrawRoadMarkings();
        }
        if (!(pixelBridgeFlag.on && drawPixelBridges(CM, now))) cityMapDrawBridges();
        cityMapDrawStreetLights(now);
      });
      // Sol + rivière d'abord (sous le canvas statique), puis blit.
      // Le SOL (procédural + tuiles pixel + relief) est statique à caméra fixe :
      // baké dans un canvas offscreen et blitté chaque frame (en live, le sol
      // pixel coûtait ~7 ms/frame). La rivière et les couches animées restent
      // live PAR-DESSUS le blit — ordre inchangé.
      if (CM.groundCanvas) {
        const _otherGround = CM.cam.zoom.toFixed(2) + ':' + CM.layoutRecomputeAt + ':' + CM.healthF.toFixed(1) + ':'
          + (state.timeWear || 0).toFixed(2) + ':' + (CM.frameRuined ? 1 : 0) + ':' + (pixelTerrainFlag.on ? 1 : 0) + ':' + (pixelRoadsFlag.on ? 1 : 0)
          + ':' + (pixelSidewalkFlag.on ? 1 : 0);
        cityMapBakeMargin(CM.groundCanvas, CM.gctx, '_groundBake', _otherGround, () => {
          CM._groundBakeStable = true; // drawPixelTerrain le baisse si tileset de repli
          cityMapDrawGround(CM.layout);
          const _pg = pixelTerrainFlag.on && drawPixelTerrain(CM);
          if (!_pg) cityMapDrawTerrain();
          // Tilesets encore en chargement → renvoyer false = re-bake à la frame suivante.
          return (_pg || !pixelTerrainFlag.on) && CM._groundBakeStable;
        });
        cityMapBlitMargin(CM.groundCanvas, '_groundBake');
      } else {
        // Repli sans canvas offscreen : rendu live historique.
        cityMapDrawGround(CM.layout);
        // Prototype pixel-art : couche terrain en tuiles Wang (herbe + routes de
        // terre) par-dessus le sol procédural, derrière le flag pixelTerrainFlag.
        const _pixelGround = pixelTerrainFlag.on && drawPixelTerrain(CM);
        // Relief en trompe-l'œil (option B) : ombrage de pente sur le sol sauvage
        // + berges, SOUS le fleuve et la ville (qui restent plats).
        if (!_pixelGround) cityMapDrawTerrain();
      }
      // Prototype pixel-art : corps d'eau clippé au ruban (Approche A), derrière
      // le flag pixelWaterFlag. Renvoie false (layout/fleuve absent) -> fallback
      // sur le rendu vectoriel intact. Inséré à la place exacte de l'ancien appel
      // -> ordre de blit préservé (ponts/bateaux recouvrent l'eau gratuitement).
      if (!(pixelWaterFlag.on && drawPixelRiver(CM, now))) cityMapDrawRiver(now);
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
        cityMapBlitMargin(CM.staticCanvas, '_staticBake');
      } else {
        // sol + rivière déjà dessinés live au-dessus
        cityMapDrawTrees();
        cityMapDrawUrbanMass(CM.layout);
        cityMapDrawPlazaSurface();
        // Routes : tuiles pixel edge-Wang (dessinées dans drawPixelTerrain) si le flag
        // est actif ; sinon rendu procédural (voies doubles + marquages) PAR-DESSUS le sol.
        if (!(pixelTerrainFlag.on && pixelRoadsFlag.on)) {
          for (const r of CM.roadList) cityMapDrawRoad(r);
          cityMapDrawRoadMarkings();
        }
        if (!(pixelBridgeFlag.on && drawPixelBridges(CM, now))) cityMapDrawBridges();
        cityMapDrawStreetLights(now);
      }
      // --- Couches dynamiques (animees, chaque frame) ---
      // Agents AVANT les batiments -> charrettes/pietons/navires passent derriere.
      cityMapDrawPlazas(now);
      updateVehicles(dt);
      // En vue dézoomée (LOD), piétons et trafic au sol ne sont plus que du
      // bruit de 1-2px : on ne les dessine pas (ils continuent d'exister).
      if (!CM.lodActive) {
        drawCitizens(dt, now);
        drawVehicles(now, "ground");
      }
      // Props TALL des places (fontaines + drapeaux/lampadaires) dessinés ICI (entre les 2
      // passes d'habitants) → Y-SORT : au sud du prop = devant (2e passe), au nord = derrière
      // (déjà dessiné). Le mobilier bas (bancs/bacs) reste dans cityMapDrawPlazas (avant agents).
      cityMapDrawPlazaTallProps(now);
      const tw = state.timeWear || 0, maxD2 = CM.layout ? CM.layout.maxD2 : 1;
      // Révélation per-buy des maisons-MOTEUR : compteur = maisons du palier (engineHomes)
      // + achats depuis le dernier recompute (borné au LOOKAHEAD=44 du pool pré-placé).
      // Rafraîchi chaque frame (~29 additions) → « 1 achat = 1 bâtiment » qui apparaît
      // (drawTile masque revealIdx >= compteur), SANS recompute du layout.
      if (CM.layout && CM.layout.counts) {
        let rawNow = 0; const _b = state.buildings || {};
        for (const meta of CM_MAP_BUILDINGS) rawNow += Math.floor(_b[meta.id] || 0);
        const placed = CM.layout.engineHomePlaced || 0;
        const grown = rawNow - (CM.layout.counts.engineHomesRaw || 0);   // achats depuis le recompute
        // On révèle les 40 DERNIÈRES maisons placées une par une (le reste apparaît au
        // recompute). placed-40 masqué au départ ; chaque achat en révèle une de plus.
        CM.engineHomeReveal = Math.max(0, Math.min(placed, placed - 40 + grown));
      }
      if (CM.layout) {
        if (now >= CM.tileDirtyUntil && CM.tileCanvas) {
          // Hors fenêtre de naissance : bake les tuiles statiques (marge = pan fluide),
          // engine toujours live. La clé inclut engineHomeReveal → re-bake quand une
          // maison-moteur est révélée (per-buy, ~5 ms, pas les 800 ms du recompute).
          const _otherTile = CM.layoutRecomputeAt + ':' + CM.cam.zoom.toFixed(2) + ':' + tw.toFixed(2) + ':' + (CM.frameRuined ? 1 : 0) + ':' + (CM.engineHomeReveal || 0);
          cityMapBakeMargin(CM.tileCanvas, CM.tctx, '_tileBake', _otherTile, () => {
            for (const t of CM.layout.tiles) if (t.type !== "engine") drawTile(t, now, tw, maxD2);
          });
          cityMapBlitMargin(CM.tileCanvas, '_tileBake');
          // Tuiles engine toujours dessinées live : leurs sprites ont des animations (feu, roues...).
          for (const t of CM.layout.tiles) if (t.type === "engine") drawTile(t, now, tw, maxD2);
        } else {
          // Pendant la fenêtre de naissance : tout live
          for (const t of CM.layout.tiles) drawTile(t, now, tw, maxD2);
        }
      }
      // Y-SORT — 2e passe : agents DEVANT un bâtiment (voisin nord bâti), dessinés PAR-DESSUS
      // le blit des bâtiments pour ne pas être rognés. dt=0 → aucune MAJ (déjà faite plus haut).
      if (!CM.lodActive) {
        drawCitizens(0, now, true);
        drawVehicles(now, "ground", true);
      }
      // Santé : voile global (désaturation/brun en crise, vibrance en prospérité)
      // appliqué AVANT la nuit — les merveilles, dessinées après, y échappent.
      cityMapDrawHealthTint();
      // Nuit : assombrit la scene, les villes avancees se mettent a briller.
      cityMapDrawNight(now);
      // Tapis de lumières nocturnes : fenêtres, districts, phares (additif).
      cityMapDrawCityLights(now);
      // Lampes de pont (additif) : par-dessus le voile de nuit, comme les fenêtres.
      cityMapDrawBridgeLights(now);
      drawCrisis(dt, now);
      // Merveilles (trophees) par-dessus la nuit : elles restent eclatantes.
      // Seules les merveilles RÉÉRIGÉES ce cycle (cf. cmWonderActive) sont dessinées ;
      // une merveille en sommeil (cité pas encore assez grande) rejouera son
      // animation de levée quand l'ère atteindra son seuil — on (re)cale alors son
      // horodatage de naissance, et on l'efface quand elle redevient dormante.
      if (CM.layout && Array.isArray(state.wonders)) {
        const activeWonders = cmWonderActiveIds(state);
        const pv = CM.previewWonder; // aperçu dev (__showWonder) : force le rendu
        for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
          const w = CM_WONDERS[wi];
          if (activeWonders.has(w.id) || (pv && pv.id === w.id)) {
            if (!CM.born["wonder:" + w.id]) CM.born["wonder:" + w.id] = now;
            drawWonder(w, wi, now);
          } else if (CM.born["wonder:" + w.id]) {
            delete CM.born["wonder:" + w.id];
          }
        }
      }
      drawVehicles(now, "air"); // drones au-dessus
      if (!CM.lodActive) drawCitizenThoughts();
    }
  }
  // Premiere mise en page immediate puis boucle.
  if (CM.cw === 0) resize();
  // Hook de diagnostic : force une frame (utile quand rAF est gele en arriere-plan).
  CM.forceFrame = () => { if (!CM.ctx || !CM.canvas) return false; resize(); frame(performance.now()); return true; };
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
    window.__cityRecompute = () => { CM.layout = null; CM.centered = false; CM.staticCamKey = ''; CM.tileCamKey = ''; CM.groundCamKey = ''; };
    window.__pixelTerrain = (on) => { pixelTerrainFlag.on = !!on; CM.staticCamKey = ''; CM.tileCamKey = ''; CM.groundCamKey = ''; };
    window.__pixelRoads = (on) => { pixelRoadsFlag.on = !!on; CM.staticCamKey = ''; CM.tileCamKey = ''; CM.groundCamKey = ''; };
    // Trottoir : on/off + réglage live. __sidewalkTune({ widthK, curbK, desat, lift, minBand })
    // fusionne les clés passées ; les deux rebakent le sol. Ex. __sidewalkTune({ widthK: 7 }).
    window.__sidewalk = (on) => { pixelSidewalkFlag.on = on !== false; CM.groundCamKey = ''; };
    window.__sidewalkTune = (o) => { if (o) Object.assign(sidewalkTune, o); CM.groundCamKey = ''; return { ...sidewalkTune }; };
    // Densité de foule : multiplie cible ET plafond d'habitants (défaut 1). Force un refresh
    // du plan pour l'appliquer tout de suite. Baisser si ça rame. Ex. __crowd(1.5) / __crowd(0.6).
    window.__crowd = (m) => { window.__citizenMul = (m == null ? 1 : +m); CM.layout = null; CM.centered = false; return { citizenMul: window.__citizenMul, target: CM.citizenTarget }; };
    window.__pixelTileset = (name) => { setPixelTileset(name); CM.staticCamKey = ''; CM.tileCamKey = ''; CM.groundCamKey = ''; };
    window.__pixelWater = (on) => { setPixelWater(on); CM.staticCamKey = ''; CM.tileCamKey = ''; CM.groundCamKey = ''; };
    window.__pixelBridge = (on) => { pixelBridgeFlag.on = !!on; CM.staticCamKey = ''; };
    // Le pont pixel est baké dans le canvas statique → invalider ce cache quand une
    // scène de pont finit de décoder (sinon le pont vectoriel de repli reste baké).
    setBridgeOnLoad(() => { CM.staticCamKey = ''; });
    // Vérif états de déclin du fleuve : force le drapeau d'effondrement (l'usure se
    // force via window.__state.timeWear = 0.8). Remettre __collapse(false) après.
    window.__collapse = (on) => { setCollapseInProgress(!!on); CM.staticCamKey = ''; CM.tileCamKey = ''; CM.groundCamKey = ''; };
    window.__cityBand = () => (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : null;
    // Vérif véhicules : force le type de tous les véhicules présents (attelages, etc.).
    // __forceVehicles('chariot') | 'wagon' | 'caravan' ... ; __forceVehMix() = un de chaque.
    window.__forceVehicles = (type) => { for (const v of CM.vehicles) { v.type = type; v.fade = 1; } return CM.vehicles.length; };
    window.__forceVehMix = (types = ['chariot', 'wagon', 'caravan']) => { CM.vehicles.forEach((v, i) => { v.type = types[i % types.length]; v.fade = 1; }); return CM.vehicles.length; };
    // Aperçu des MERVEILLES à n'importe quel rang, sans toucher au save ni
    // attendre l'ère : __showWonder(id|index, rang 1..5) force le rendu de la
    // merveille (CM.previewWonder, runtime seulement) et centre la caméra.
    //   __showWonder("era_mega", 5)   __showWonder(2, 3)   __showWonder("arc", 4)
    //   __hideWonder()  pour arrêter.  ids : dynasty1 pop1m era_kingdom
    //   era_empire era_mega era_singularity.
    window.__showWonder = (id, tier = 5) => {
      const wi = typeof id === "number" ? id
        : CM_WONDERS.findIndex((w) => w.id === id || w.id.indexOf(id) === 0 || w.id.indexOf("_" + id) >= 0);
      if (wi < 0 || wi >= CM_WONDERS.length) return "inconnu. " + CM_WONDERS.map((w, i) => i + ":" + w.id).join("  ");
      const w = CM_WONDERS[wi];
      const t = Math.max(1, Math.min(5, tier | 0));
      CM.previewWonder = { id: w.id, tier: t };
      CM.born["wonder:" + w.id] = -1e6; // déjà érigée : pas d'animation de poussée
      const center = () => {
        if (!CM.layout || !CM.layout.wonderSlots) { requestAnimationFrame(center); return; }
        const slot = cmWonderSlot(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy);
        CM.cam.x = slot.gx * CM.TILE + CM.TILE / 2;
        CM.cam.y = slot.gy * CM.TILE - CM.TILE * 4;
        CM.cam.zoom = 1.3;
        CM.centered = true;
      };
      center();
      return w.name + " — rang " + WONDER_TIER_NAMES[t] + "  (rangs 1..5 ; __hideWonder() pour arrêter)";
    };
    window.__hideWonder = () => { CM.previewWonder = null; CM.centered = false; return "aperçu arrêté"; };
    // Accès direct au runtime carte (caméra, véhicules, layout) pour la vérif visuelle :
    // ex. centrer/zoomer sur un attelage avant __cityShot.
    window.__CM = CM;
  }
  CM.raf = requestAnimationFrame(frame);
}


setResetCameraCenterHandler(() => { CM.centered = false; });

// HMR : la boucle rAF et ses closures capturent les fonctions de rendu à l'init —
// un hot-update laissait tourner l'ANCIEN code en silence. Le full-reload des
// modules carte est forcé CÔTÉ SERVEUR par mapFullReloadPlugin (vite.config.js) ;
// import.meta.hot.decline() serait un no-op dans Vite moderne.

export { CM, initCityMap, cityMapTileScreen };
