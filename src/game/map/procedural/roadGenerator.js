/* ============================================================================
 * roadGenerator.js — RoadGenerator
 *   Construit le réseau viaire à partir du plan de ville : grands axes, rues
 *   secondaires, sentiers, places pavées, ponts. Chaque archétype a sa logique
 *   (sentiers sinueux, étoile de faubourgs, grille de capitale...) mais tout
 *   passe par les mêmes primitives, qui garantissent :
 *     - des cellules de route alignées sur la grille avec méta h/v cohérente
 *       (le moteur de rendu en déduit masques, croisements et jonctions) ;
 *     - aucun tronçon dans l'eau hors colonnes de pont désignées ;
 *     - un réseau connecté au cœur urbain (les piétons/véhicules circulent).
 *   La validation finale (ponts droits, segments orphelins) reste assurée par
 *   cmBuildRoadGraph dans layout.js.
 * ============================================================================ */

import { rngFrom } from "./seedManager.js";

// "plaza" est le rang le plus fort : une esplanade absorbe les routes qui la
// traversent (rendue comme dallage continu, pas comme une chaussée).
const RANK_WEIGHT = { path: 0, secondary: 1, avenue: 2, main: 3, plaza: 4 };

export function generateRoads({
  plan, seed, counts, ageCfg, N,
  riverSet, bankSet, riverBridgeX, organicLimit
}) {
  const roadKey = new Set();
  const roadMeta = new Map();
  const roads = [];
  const core = { x: Math.round(plan.core.x), y: Math.round(plan.core.y) };
  const chaosRng = rngFrom(seed, "road-chaos");

  // Colonnes de pont : celle du pont "historique" + 1-2 traversées seedées
  // aux ères avancées. Seules ces colonnes ont le droit de franchir l'eau.
  const bridgeCols = new Set([Math.round(riverBridgeX)]);
  if (counts.eraBand >= 3) {
    const bRng = rngFrom(seed, "bridges");
    const extra = counts.eraBand >= 5 ? 2 : 1;
    for (let i = 0; i < extra; i += 1) {
      bridgeCols.add(Math.round(riverBridgeX + (bRng() - 0.5) * N * 0.45));
    }
  }

  const inWater = (x, y) => riverSet.has(x + "," + y) || bankSet.has(x + "," + y);

  function addRoad(x, y, axis, rank, { force = false, allowWater = false } = {}) {
    if (x < 0 || y < 0 || x >= N || y >= N) return false;
    const k = x + "," + y;
    if (inWater(x, y) && !(allowWater && axis === "v" && bridgeCols.has(x))) return false;
    if (!force && !organicLimit(x, y, 2.2)) return false;
    // Chaos (crise/effondrement) : des tronçons mineurs manquent.
    if (plan.chaos > 0 && (rank === "path" || rank === "secondary") && !force) {
      if (chaosRng() < plan.chaos * 0.22) return false;
    }
    const meta = roadMeta.get(k) || { h: false, v: false, rank: "path" };
    if (axis === "h") meta.h = true;
    if (axis === "v") meta.v = true;
    if ((RANK_WEIGHT[rank] || 0) > (RANK_WEIGHT[meta.rank] || 0)) meta.rank = rank;
    roadMeta.set(k, meta);
    if (!roadKey.has(k)) {
      roadKey.add(k);
      roads.push({ gx: x, gy: y });
    }
    return true;
  }

  function hLine(x0, x1, y, rank, opts) {
    const s = Math.sign(x1 - x0) || 1;
    for (let x = x0; x !== x1 + s; x += s) addRoad(x, y, "h", rank, opts);
  }
  function vLine(y0, y1, x, rank, opts) {
    const s = Math.sign(y1 - y0) || 1;
    for (let y = y0; y !== y1 + s; y += s) addRoad(x, y, "v", rank, opts);
  }

  // Chemin en escalier : alterne des segments h/v de longueur seedée vers la
  // cible. C'est lui qui donne les rues sinueuses des vieux quartiers.
  function staircase(x0, y0, x1, y1, rank, label, opts = {}) {
    const rng = rngFrom(seed, "stair:" + label);
    let x = Math.round(x0), y = Math.round(y0);
    const tx = Math.round(x1), ty = Math.round(y1);
    let guard = N * 4;
    let horizontalFirst = rng() < 0.5;
    while ((x !== tx || y !== ty) && guard-- > 0) {
      const dx = tx - x, dy = ty - y;
      const goH = dy === 0 ? true : dx === 0 ? false
        : horizontalFirst ? Math.abs(dx) >= Math.abs(dy) * (0.5 + rng()) : Math.abs(dx) * (0.5 + rng()) > Math.abs(dy);
      const run = 2 + Math.floor(rng() * 3);
      if (goH) {
        const step = Math.sign(dx) || 1;
        const len = Math.min(run, Math.abs(dx));
        hLine(x, x + step * len, y, rank, opts);
        x += step * len;
      } else {
        const step = Math.sign(dy) || 1;
        const len = Math.min(run, Math.abs(dy));
        vLine(y, y + step * len, x, rank, opts);
        y += step * len;
      }
      // Marque le coin dans les deux axes pour une jonction propre.
      addRoad(x, y, "h", rank, opts);
      addRoad(x, y, "v", rank, opts);
      horizontalFirst = !horizontalFirst;
    }
  }

  // Anneau rectangulaire (rocades, enceintes).
  function ring(rcx, rcy, r, rank, opts) {
    hLine(rcx - r, rcx + r, rcy - r, rank, opts);
    hLine(rcx - r, rcx + r, rcy + r, rank, opts);
    vLine(rcy - r, rcy + r, rcx - r, rank, opts);
    vLine(rcy - r, rcy + r, rcx + r, rank, opts);
  }

  // Grille locale de quartier : rues parallèles espacées, ancrées sur un point.
  function localGrid(gx0, gy0, half, spacing, rank, label) {
    const rng = rngFrom(seed, "grid:" + label);
    const off = Math.floor(rng() * spacing);
    for (let y = gy0 - half + off; y <= gy0 + half; y += spacing) {
      hLine(gx0 - half, gx0 + half, y, rank);
    }
    for (let x = gx0 - half + off; x <= gx0 + half; x += spacing) {
      vLine(gy0 - half, gy0 + half, x, rank, { allowWater: false });
    }
  }

  // Place : bloc de cellules marchables h+v au rang "plaza" — exclues du rendu
  // de routes, dessinées comme une vraie esplanade dallée (renderWorld).
  function plaza(p) {
    const half = Math.floor(p.size / 2);
    for (let dx = -half; dx < p.size - half; dx += 1) {
      for (let dy = -half; dy < p.size - half; dy += 1) {
        addRoad(p.gx + dx, p.gy + dy, "h", "plaza", { force: true });
        addRoad(p.gx + dx, p.gy + dy, "v", "plaza", { force: true });
      }
    }
  }

  const reachBase = plan.reachBase;
  const span = Math.ceil(reachBase + 6);
  const mainRank = ageCfg.roadRanks.main ? "main" : "secondary";

  // ── Axes principaux selon l'archétype ────────────────────────────────────
  const A = plan.archetype;

  // Traversée du fleuve : axe nord-sud passant par la colonne de pont
  // historique (présent dès qu'un grand axe existe).
  function bridgeAxis(rank) {
    const x = Math.round(riverBridgeX);
    vLine(Math.max(0, core.y - span), Math.min(N - 1, core.y + span), x, rank,
      { allowWater: true, force: counts.eraBand >= 1 });
  }

  function riverCrossing(rank) {
    const x = Math.round(riverBridgeX);
    let y0 = N, y1 = -1;
    for (const k of riverSet) {
      const comma = k.indexOf(",");
      const gx = Number(k.slice(0, comma));
      if (gx !== x) continue;
      const gy = Number(k.slice(comma + 1));
      if (gy < y0) y0 = gy;
      if (gy > y1) y1 = gy;
    }
    if (y1 < y0) return;
    vLine(Math.max(0, y0 - 2), Math.min(N - 1, y1 + 2), x, rank, { allowWater: true, force: true });
  }

  if (A === "scattered") {
    // Sentiers sinueux du cœur vers chaque poche d'habitat. Pas de grands axes.
    riverCrossing("path");
    let prevA = null;
    for (const a of plan.anchors) {
      staircase(core.x, core.y, a.gx, a.gy, "path", "sc:" + a.label);
      // Boucle locale dans la poche : les habitations se massent autour de
      // l'ancre (anchorAffinity) — sans desserte locale, toute la périphérie de
      // la poche « flotte » loin du sentier. Le petit anneau la longe.
      const ar = Math.max(1, Math.round((a.r || 2) * 0.5));
      ring(Math.round(a.gx), Math.round(a.gy), ar, "path");
      // Chemin de hameau à hameau : relie les poches entre elles, pas seulement
      // au cœur — donne un vrai maillage de village dispersé et évite les poches
      // accessibles uniquement par une longue antenne unique.
      if (prevA) staircase(prevA.gx, prevA.gy, a.gx, a.gy, "path", "sc-link:" + prevA.label + ">" + a.label);
      prevA = a;
    }
    // Petite boucle autour du foyer.
    ring(core.x, core.y, 2, "path");
  } else if (A === "crossroads") {
    // Deux routes de passage qui se croisent près du cœur — le bourg est né là.
    const rng = rngFrom(seed, "crossroads");
    const bendY = core.y + Math.round((rng() - 0.5) * 4);
    const bendX = core.x + Math.round((rng() - 0.5) * 4);
    staircase(core.x - span, bendY, core.x + span, core.y, mainRank, "cr:h", { force: true });
    bridgeAxis(mainRank);
    staircase(bendX, core.y - span, core.x, core.y + Math.min(span, 6), "secondary", "cr:v");
    for (const a of plan.anchors) {
      staircase(core.x, core.y, a.gx, a.gy, a.band <= 1 ? "path" : "secondary", "cr:" + a.label);
    }
  } else if (A === "linear") {
    // Ville-rue : la grand-rue suit l'axe est-ouest, l'habitat s'y accroche
    // par de courtes traverses perpendiculaires.
    const rng = rngFrom(seed, "linear");
    let y = core.y;
    for (let x = Math.max(0, core.x - span); x <= Math.min(N - 1, core.x + span); x += 1) {
      addRoad(x, y, "h", mainRank, { force: Math.abs(x - core.x) < reachBase });
      if (rng() < 0.18) {
        const ny = y + (rng() < 0.5 ? -1 : 1);
        addRoad(x, y, "v", mainRank, { force: Math.abs(x - core.x) < reachBase });
        addRoad(x, ny, "v", mainRank, { force: Math.abs(x - core.x) < reachBase });
        addRoad(x, ny, "h", mainRank, { force: Math.abs(x - core.x) < reachBase });
        y = ny;
      }
      // Traverses perpendiculaires espacées.
      if (x % 4 === 2) {
        const len = 2 + Math.floor(rng() * (2 + counts.eraBand * 1.5));
        vLine(y - len, y - 1, x, "secondary");
        vLine(y + 1, y + len, x, "secondary");
      }
    }
    bridgeAxis("secondary");
    for (const a of plan.anchors) {
      staircase(a.gx, core.y, a.gx, a.gy, "path", "ln:" + a.label);
    }
  } else if (A === "radial") {
    // Étoile : faubourgs reliés au cœur par des rayons, anneaux concentriques.
    const rng = rngFrom(seed, "radial");
    const spokes = 5 + Math.floor(rng() * 3);
    const a0 = rng() * Math.PI * 2;
    for (let i = 0; i < spokes; i += 1) {
      const ang = a0 + (i / spokes) * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const rank = i < 2 ? mainRank : "secondary";
      staircase(core.x, core.y, core.x + Math.cos(ang) * span, core.y + Math.sin(ang) * span, rank, "ray:" + i);
    }
    bridgeAxis(mainRank);
    const rings = Math.min(4, 1 + counts.infraRings);
    for (let ri = 1; ri <= rings; ri += 1) {
      ring(core.x, core.y, 3 + ri * 4, ri <= 1 ? "avenue" : "secondary");
    }
    for (const a of plan.anchors) {
      staircase(core.x, core.y, a.gx, a.gy, "path", "rd:" + a.label);
    }
  } else if (A === "districts") {
    // Quartiers reliés par avenues, chacun avec sa petite grille décalée.
    bridgeAxis(mainRank);
    hLine(core.x - span, core.x + span, core.y, mainRank, { force: true });
    for (const a of plan.anchors) {
      staircase(core.x, core.y, a.gx, a.gy, a.band >= 3 ? "avenue" : "secondary", "dt:" + a.label);
      localGrid(Math.round(a.gx), Math.round(a.gy), Math.round(a.r + 1), 3, "secondary", "dt:" + a.label);
    }
    const rng = rngFrom(seed, "districts-extra");
    for (let ri = 1; ri <= Math.min(3, counts.infraRings); ri += 1) {
      ring(core.x, core.y, 4 + ri * 5 + Math.floor(rng() * 2), "secondary");
    }
  } else { // capital / megalopolis
    // Grille planifiée : grands axes en croix, trame régulière, rocades.
    const rng = rngFrom(seed, "capital");
    const spacing = A === "megalopolis" ? 4 : 5;
    hLine(0, N - 1, core.y, mainRank, { force: true });
    bridgeAxis(mainRank);
    vLine(Math.max(0, core.y - span), Math.min(N - 1, core.y + span), core.x, mainRank, { force: true });
    const lanes = Math.min(7, 2 + counts.eraBand + Math.floor(counts.urbanTier / 5));
    const off = Math.floor(rng() * spacing);
    for (let li = -lanes; li <= lanes; li += 1) {
      if (li === 0) continue;
      const d = li * spacing + (li > 0 ? off : -off);
      const rank = Math.abs(li) <= 2 ? "avenue" : "secondary";
      hLine(core.x - span, core.x + span, core.y + d, rank);
      vLine(core.y - span, core.y + span, core.x + d, rank, { allowWater: bridgeCols.has(core.x + d) });
    }
    if (A === "megalopolis") {
      // Rocade externe + diagonales en escalier (boulevards de liaison).
      ring(core.x, core.y, Math.min(Math.floor(N / 2) - 2, Math.round(reachBase * 0.9)), "avenue");
      for (let di = 0; di < 4; di += 1) {
        const ang = Math.PI / 4 + di * Math.PI / 2;
        staircase(core.x, core.y, core.x + Math.cos(ang) * reachBase, core.y + Math.sin(ang) * reachBase, "avenue", "diag:" + di);
      }
    }
    for (const a of plan.anchors) {
      if (a.band <= 1) staircase(core.x, core.y, a.gx, a.gy, "path", "cp:" + a.label);
    }
  }

  // ── Vieux centre : les sentiers fondateurs survivent aux replanifications ─
  // (donne aux villes avancées un noyau ancien aux rues irrégulières)
  if (A !== "scattered" && counts.eraBand >= 2) {
    const founders = plan.anchors.filter((a) => a.band <= 1).slice(0, 3);
    for (const a of founders) {
      staircase(core.x, core.y, a.gx, a.gy, "path", "old:" + a.label);
    }
  }

  // ── Places pavées ─────────────────────────────────────────────────────────
  for (const p of plan.plazas || []) plaza(p);

  return { roads, roadKey, roadMeta, bridgeCols };
}
