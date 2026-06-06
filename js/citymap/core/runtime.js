"use strict";

/* ============================================================================
 * citymap-runtime.js - Preparation runtime du layout Canvas.
 *   Transforme computeCityLayout(state) en listes pretes a dessiner/animer.
 * ============================================================================ */

function cityMapEnsureLayout(now, deps = {}) {
  const getVehicleDensity = deps.getVehicleDensity || function () { return 0; };
  const chooseRoadVehicleType = deps.chooseRoadVehicleType || function () { return "cart"; };

  const engineSig = CM_MAP_BUILDINGS.map((meta) => `${meta.id}:${Math.floor((state.buildings && state.buildings[meta.id]) || 0)}`).join("|");
  const sig = JSON.stringify(cityCounts(state)) + "|" + (state.cycles || 0) + "|" + engineSig;
  if (sig === CM.layoutSig && CM.layout) return;
  CM.layoutSig = sig;
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
  CM.gridN = L.gridN;

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
  // Clés numériques : évite les allocations string à chaque lookup dans les boucles agents
  CM.walkRoadSet = new Set(CM.walkRoadList.map((r) => r.gx * 10000 + r.gy));
  // Ponts précalculés : évite Array.filter à chaque frame dans cityMapDrawBridges
  CM.bridgeList = CM.roadList.filter((r) => r.roadSurface === "bridge");

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

  // (Re)cree les citoyens sur les routes.
  const lateCrowd = Math.max(0, (L.counts.eraIndex || 0) - 11);
  const citizenCap = Math.round(8 + Math.pow(L.counts.eraFrac || 0, 0.74) * 650);
  const want = cmClamp(2 + L.counts.houses / 3.7 + (L.counts.eraIndex || 0) * 5.8 + L.counts.megaDistricts * 6.6 + lateCrowd * lateCrowd * 2.1, 2, citizenCap);
  if (CM.citizens.length !== want || !CM.walkRoadList.length) {
    CM.citizens = [];
    for (let n = 0; n < want && CM.walkRoadList.length; n += 1) {
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
  }

  // Trafic evolutif : paniers -> charrettes -> chars/convois -> voitures -> drones.
  const trafficBase = getVehicleDensity(L.counts.eraIndex, "main") * Math.max(1, L.counts.eraIndex) * 2.45 + L.counts.houses / 38 + lateCrowd * lateCrowd * 1.05;
  const wantVeh = cmClamp(trafficBase, 0, L.counts.eraIndex >= 18 ? 210 : L.counts.eraIndex >= 14 ? 150 : L.counts.eraIndex >= 8 ? 72 : 20);
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
