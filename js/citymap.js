"use strict";

/* ============================================================================
 * citymap.js — Initialisation Canvas, boucle rAF.
 *   Contient uniquement initCityMap() et la boucle frame().
 *   Rendu terrain/routes/agents/batiments : modules citymap-render-*.js charges avant.
 * ============================================================================ */
// ── Initialisation navigateur (Canvas + interactions + boucle rAF) ──────────
function initCityMap() {
  if (CM.inited) return;
  const canvas = document.getElementById("cityCanvas");
  if (!canvas || typeof canvas.getContext !== "function") return;
  CM.inited = true;
  CM.canvas = canvas;
  CM.ctx = canvas.getContext("2d");
  CM.mini = document.getElementById("cityMinimap");
  CM.mctx = CM.mini ? CM.mini.getContext("2d") : null;
  const mapRoot = document.getElementById("civilizationMap") || canvas.parentElement;
  cityMapEnsureTooltip(mapRoot);

  const resize = () => cityMapResizeCanvas(canvas);
  resize();
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", resize);
  bindCityMapInput(canvas, mapRoot, {
    showHover: (sx, sy) => cityMapShowTooltip(cityMapHitTest(sx, sy), sx, sy),
    clearHover: () => cityMapShowTooltip(null)
  });
  const cityMapRuntimeDeps = { getVehicleDensity, chooseRoadVehicleType };
  // Cache hors boucle rAF — évite 60 querySelector/sec
  const appEl = document.querySelector('.app');

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const active = appEl?.getAttribute("data-active-view") === "city";
    if (active && CM.canvas && CM.cw > 0) {
      if (!CM.cw) resize();
      cityMapEnsureLayout(now, cityMapRuntimeDeps);
      cmCheckWonders(now);
      // Cycle jour/nuit lent (~5 min).
      CM.nightF = 0.5 - 0.5 * Math.cos((now || 0) / 300000 * Math.PI * 2);
      // Detection d'effondrement (anim de destruction centre -> exterieur).
      if (typeof collapseInProgress !== "undefined" && collapseInProgress) { if (!CM.collapseAt) CM.collapseAt = now; }
      else { CM.collapseAt = 0; }
      cityMapDrawGround(CM.layout);
      cityMapDrawRiver(now);
      cityMapDrawTrees();
      cityMapDrawVestiges();
      cityMapDrawUrbanMass(CM.layout);
      for (const r of CM.roadList) cityMapDrawRoad(r);
      cityMapDrawStreetLights(now);
      // Agents AVANT les batiments -> charrettes/pietons/navires passent derriere.
      updateVehicles(dt);
      drawShips(dt);
      drawCentralFire(now);
      cityMapDrawBridges();
      drawCitizens(dt, now);
      drawVehicles(now, "ground");
      const tw = state.timeWear || 0, maxD2 = CM.layout ? CM.layout.maxD2 : 1;
      if (CM.layout) {
        // tries du fond vers l'avant (par profondeur)
        for (const t of CM.layout.tiles) drawTile(t, now, tw, maxD2);
      }
      // Nuit : assombrit la scene, les villes avancees se mettent a briller.
      cityMapDrawNight(now);
      // Merveilles (trophees) par-dessus la nuit : elles restent eclatantes.
      if (CM.layout && Array.isArray(state.wonders)) {
        for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
          if (state.wonders.includes(CM_WONDERS[wi].id)) drawWonder(CM_WONDERS[wi], wi, now);
        }
      }
      drawVehicles(now, "air"); // drones au-dessus
      drawCrisis(dt, now);
    }
    CM.raf = requestAnimationFrame(frame);
  }
  // Premiere mise en page immediate puis boucle.
  if (CM.cw === 0) resize();
  // Hook de diagnostic : force une frame (utile quand rAF est gele en arriere-plan).
  CM.forceFrame = () => { resize(); frame(performance.now()); };
  CM.raf = requestAnimationFrame(frame);
}
