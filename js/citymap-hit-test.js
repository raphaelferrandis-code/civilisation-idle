"use strict";

/* ============================================================================
 * citymap-hit-test.js - Detection sous souris et infobulles de la carte.
 *   Depend de CM, state, citymap-layout.js et citymap-camera.js.
 * ============================================================================ */

function cityMapEnsureTooltip(mapRoot) {
  if (!mapRoot) return;
  if (!mapRoot.querySelector(".city-map-tooltip")) {
    CM.tooltip = document.createElement("div");
    CM.tooltip.className = "city-map-tooltip";
    CM.tooltip.setAttribute("aria-hidden", "true");
    mapRoot.appendChild(CM.tooltip);
  } else {
    CM.tooltip = mapRoot.querySelector(".city-map-tooltip");
  }
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
      if (Math.hypot(wsx - sx, wsy - sy) < Math.max(32, CM.TILE * CM.cam.zoom * 2.5)) return { title: w.name, kind: "Merveille" };
    }
  }
  const tile = CM.layout.tiles.find((t) => t.type === "engine" && gx >= t.gx && gy >= t.gy && gx < t.gx + (t.size || 1) && gy < t.gy + (t.size || 1))
    || CM.layout.tiles.find((t) => gx >= t.gx && gy >= t.gy && gx < t.gx + (t.size || 1) && gy < t.gy + (t.size || 1));
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
  CM.tooltip.innerHTML = `<span>${hit.kind}</span><strong>${hit.title}</strong>${hit.body ? `<em>${hit.body}</em>` : ""}`;
  CM.tooltip.style.left = `${Math.min(CM.cw - 18, sx + 14)}px`;
  CM.tooltip.style.top = `${Math.max(12, sy - 8)}px`;
  CM.tooltip.classList.add("visible");
}
