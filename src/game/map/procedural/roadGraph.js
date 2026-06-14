/* ============================================================================
 * roadGraph.js — RoadGraphGenerator (moteur de routes v2)
 *   Construit le réseau viaire comme un GRAPHE CONNEXE par construction, en
 *   remplacement de roadGenerator.js. Différences clés :
 *     - aucune route n'est « coupée » par la silhouette : organicLimit ne décide
 *       plus que de la LONGUEUR d'une antenne/ligne (on tronque le BOUT, jamais
 *       le milieu), il ne perce pas de trou dans un connecteur ;
 *     - les axes et grilles sont bornés à la silhouette (clampRay / runLine) →
 *       plus de chaussées dans le vide quand la ville grandit vite ;
 *     - une passe de couture (stitchComponents) RELIE — sans jamais supprimer —
 *       les rares composantes égarées à la composante du cœur : connexité
 *       garantie même si une recette d'archétype laisse un fragment.
 *   Sortie strictement identique à generateRoads ({ roads, roadKey, roadMeta,
 *   bridgeCols }) : c'est un drop-in piloté par un flag dans layout.js.
 *   La validation finale (ponts droits) reste assurée par cmBuildRoadGraph.
 * ============================================================================ */

import { rngFrom } from "./seedManager.js";

// Drapeau d'activation. v2=true : moteur graphe par défaut. Surchargé en jeu par
// state.devFlags.legacyRoads pour comparer v1/v2 sur une même seed.
export const ROAD_ENGINE = { v2: true };

// "plaza" = rang le plus fort (esplanade dallée, exclue du rendu de chaussée).
const RANK_WEIGHT = { path: 0, secondary: 1, avenue: 2, main: 3, plaza: 4 };
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generateRoadsGraph({
  plan, seed, counts, ageCfg, N,
  riverSet, bankSet, riverBridgeX, organicLimit
}) {
  const cells = new Set();          // "gx,gy" — source de vérité de la connexité
  const meta = new Map();           // "gx,gy" -> { h, v, rank }
  const core = { x: Math.round(plan.core.x), y: Math.round(plan.core.y) };
  const span = Math.ceil((plan.reachBase || 8) + 6);
  const mainRank = ageCfg.roadRanks.main ? "main" : "secondary";

  // Colonnes de pont : pont historique + 1-2 traversées seedées aux ères avancées.
  const bridgeCols = new Set([Math.round(riverBridgeX)]);
  if (counts.eraBand >= 3) {
    const bRng = rngFrom(seed, "bridges");
    const extra = counts.eraBand >= 5 ? 2 : 1;
    for (let i = 0; i < extra; i += 1) {
      bridgeCols.add(Math.round(riverBridgeX + (bRng() - 0.5) * N * 0.45));
    }
  }

  const inBounds = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const inWater = (x, y) => riverSet.has(x + "," + y) || bankSet.has(x + "," + y);

  // ── Primitives de rastérisation ─────────────────────────────────────────────
  // Pose une cellule (sauf eau, hors colonne de pont verticale). PAS de gate
  // organicLimit ici : la borne d'étendue est gérée par les appelants (runLine /
  // clampRay), de sorte qu'un connecteur n'est jamais percé en son milieu.
  function addCell(x, y, axis, rank, allowWater = false) {
    if (!inBounds(x, y)) return false;
    if (inWater(x, y) && !(allowWater && axis === "v" && bridgeCols.has(x))) return false;
    const k = x + "," + y;
    const m = meta.get(k) || { h: false, v: false, rank: "path" };
    if (axis === "h") m.h = true;
    if (axis === "v") m.v = true;
    if ((RANK_WEIGHT[rank] || 0) > (RANK_WEIGHT[m.rank] || 0)) m.rank = rank;
    meta.set(k, m);
    cells.add(k);
    return true;
  }

  // Segment droit (H ou V) — toutes les cellules entre A et B.
  function addEdge(ax, ay, bx, by, rank, allowWater = false) {
    const axis = ay === by ? "h" : "v";
    const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
    let x = ax, y = ay;
    for (;;) {
      addCell(x, y, axis, rank, allowWater);
      if (x === bx && y === by) break;
      x += sx; y += sy;
    }
  }

  // Ligne contiguë autour d'un centre, BORNÉE par la silhouette : on s'arrête au
  // premier échec organicLimit de chaque côté (tronque le bout, pas de trou).
  // Ne traverse jamais l'eau (le franchissement passe par bridgeCrossing).
  function runLine(axis, fixed, center, rank, margin = 2.2) {
    const put = (p) => {
      const gx = axis === "h" ? p : fixed;
      const gy = axis === "h" ? fixed : p;
      if (!inBounds(gx, gy) || inWater(gx, gy) || !organicLimit(gx, gy, margin)) return false;
      addCell(gx, gy, axis, rank);
      return true;
    };
    if (!put(center)) return;
    for (const dir of [1, -1]) for (let p = center + dir; put(p); p += dir) { /* extend */ }
  }

  // Point le plus éloigné le long d'un rayon depuis le cœur encore DANS la
  // silhouette : sert à borner les axes traversants / rayons / diagonales sans
  // les couper en chemin (on vise un endpoint propre, puis on relie en plein).
  function clampRay(angle, maxR, margin = 2.2) {
    let last = { x: core.x, y: core.y };
    for (let r = 1; r <= maxR; r += 1) {
      const x = Math.round(core.x + Math.cos(angle) * r);
      const y = Math.round(core.y + Math.sin(angle) * r);
      if (!inBounds(x, y) || !organicLimit(x, y, margin)) break;
      last = { x, y };
    }
    return last;
  }

  // Chemin en escalier (rues sinueuses) — chaîne de segments droits. Le point de
  // départ est toujours dans le graphe (cœur/ancre), la chaîne hérite donc de la
  // connexité ; les coins sont marqués h+v pour des jonctions nettes.
  function staircase(x0, y0, x1, y1, rank, label) {
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
        addEdge(x, y, x + step * len, y, rank);
        x += step * len;
      } else {
        const step = Math.sign(dy) || 1;
        const len = Math.min(run, Math.abs(dy));
        addEdge(x, y, x, y + step * len, rank);
        y += step * len;
      }
      addCell(x, y, "h", rank);
      addCell(x, y, "v", rank);
      horizontalFirst = !horizontalFirst;
    }
  }

  // Anneau rectangulaire borné à la silhouette (rocades, enceintes).
  function ring(rcx, rcy, r, rank) {
    const put = (x, y, axis) => {
      if (!inBounds(x, y) || inWater(x, y) || !organicLimit(x, y, 2.2)) return;
      addCell(x, y, axis, rank);
    };
    for (let x = rcx - r; x <= rcx + r; x += 1) { put(x, rcy - r, "h"); put(x, rcy + r, "h"); }
    for (let y = rcy - r; y <= rcy + r; y += 1) { put(rcx - r, y, "v"); put(rcx + r, y, "v"); }
  }

  // Grille locale de quartier (bornée silhouette).
  function localGrid(gx0, gy0, half, spacing, rank, label) {
    const rng = rngFrom(seed, "grid:" + label);
    const off = Math.floor(rng() * spacing);
    const put = (x, y, axis) => {
      if (!inBounds(x, y) || inWater(x, y) || !organicLimit(x, y, 2.2)) return;
      addCell(x, y, axis, rank);
    };
    for (let y = gy0 - half + off; y <= gy0 + half; y += spacing)
      for (let x = gx0 - half; x <= gx0 + half; x += 1) put(x, y, "h");
    for (let x = gx0 - half + off; x <= gx0 + half; x += spacing)
      for (let y = gy0 - half; y <= gy0 + half; y += 1) put(x, y, "v");
  }

  // Place : bloc marchable h+v au rang "plaza" (eau interdite).
  function plaza(p) {
    const half = Math.floor(p.size / 2);
    for (let dx = -half; dx < p.size - half; dx += 1)
      for (let dy = -half; dy < p.size - half; dy += 1) {
        addCell(p.gx + dx, p.gy + dy, "h", "plaza");
        addCell(p.gx + dx, p.gy + dy, "v", "plaza");
      }
  }

  // Traversée du fleuve, BORNÉE : de quelques cases au nord du fleuve à quelques
  // cases au sud (pas la longue avenue vers le vide de v1). Le tip nord est
  // ensuite raccroché à la ville par la couture. Sans fleuve : court tronçon.
  function bridgeCrossing(rank) {
    const x = Math.round(riverBridgeX);
    let y0 = N, y1 = -1;
    for (const k of riverSet) {
      const c = k.indexOf(",");
      if (Number(k.slice(0, c)) !== x) continue;
      const gy = Number(k.slice(c + 1));
      if (gy < y0) y0 = gy;
      if (gy > y1) y1 = gy;
    }
    if (y1 < y0) {
      addEdge(x, Math.max(0, core.y - 3), x, Math.min(N - 1, core.y + 1), rank);
      return;
    }
    addEdge(x, Math.max(0, y0 - 3), x, Math.min(N - 1, y1 + 3), rank, true);
  }

  // ── Squelette par archétype ─────────────────────────────────────────────────
  const A = plan.archetype;
  // Racine : garantit une cellule au cœur à laquelle tout se raccroche.
  addCell(core.x, core.y, "h", "path");
  addCell(core.x, core.y, "v", "path");

  if (A === "scattered") {
    bridgeCrossing("path");
    let prevA = null;
    for (const a of plan.anchors) {
      staircase(core.x, core.y, a.gx, a.gy, "path", "sc:" + a.label);
      const ar = Math.max(1, Math.round((a.r || 2) * 0.5));
      ring(Math.round(a.gx), Math.round(a.gy), ar, "path");
      if (prevA) staircase(prevA.gx, prevA.gy, a.gx, a.gy, "path", "sc-link:" + prevA.label + ">" + a.label);
      prevA = a;
    }
    ring(core.x, core.y, 2, "path");
  } else if (A === "crossroads") {
    const rng = rngFrom(seed, "crossroads");
    const bendY = core.y + Math.round((rng() - 0.5) * 4);
    const bendX = core.x + Math.round((rng() - 0.5) * 4);
    const west = clampRay(Math.PI, span), east = clampRay(0, span);
    staircase(west.x, bendY, east.x, core.y, mainRank, "cr:h");
    bridgeCrossing(mainRank);
    const north = clampRay(-Math.PI / 2, Math.min(span, 6 + span * 0.3));
    staircase(bendX, north.y, core.x, core.y, "secondary", "cr:v");
    for (const a of plan.anchors)
      staircase(core.x, core.y, a.gx, a.gy, a.band <= 1 ? "path" : "secondary", "cr:" + a.label);
  } else if (A === "linear") {
    linearMainStreet(mainRank);
    bridgeCrossing("secondary");
    for (const a of plan.anchors)
      staircase(a.gx, core.y, a.gx, a.gy, "path", "ln:" + a.label);
  } else if (A === "radial") {
    const rng = rngFrom(seed, "radial");
    const spokes = 5 + Math.floor(rng() * 3);
    const a0 = rng() * Math.PI * 2;
    for (let i = 0; i < spokes; i += 1) {
      const ang = a0 + (i / spokes) * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const end = clampRay(ang, span);
      staircase(core.x, core.y, end.x, end.y, i < 2 ? mainRank : "secondary", "ray:" + i);
    }
    bridgeCrossing(mainRank);
    const rings = Math.min(4, 1 + counts.infraRings);
    for (let ri = 1; ri <= rings; ri += 1) ring(core.x, core.y, 3 + ri * 4, ri <= 1 ? "avenue" : "secondary");
    for (const a of plan.anchors) staircase(core.x, core.y, a.gx, a.gy, "path", "rd:" + a.label);
  } else if (A === "districts") {
    bridgeCrossing(mainRank);
    runLine("h", core.y, core.x, mainRank);
    for (const a of plan.anchors) {
      staircase(core.x, core.y, a.gx, a.gy, a.band >= 3 ? "avenue" : "secondary", "dt:" + a.label);
      localGrid(Math.round(a.gx), Math.round(a.gy), Math.round(a.r + 1), 3, "secondary", "dt:" + a.label);
    }
    const rng = rngFrom(seed, "districts-extra");
    for (let ri = 1; ri <= Math.min(3, counts.infraRings); ri += 1)
      ring(core.x, core.y, 4 + ri * 5 + Math.floor(rng() * 2), "secondary");
  } else { // capital / megalopolis
    const rng = rngFrom(seed, "capital");
    const spacing = A === "megalopolis" ? 4 : 5;
    runLine("h", core.y, core.x, mainRank);
    bridgeCrossing(mainRank);
    runLine("v", core.x, core.y, mainRank);
    const lanes = Math.min(7, 2 + counts.eraBand + Math.floor(counts.urbanTier / 5));
    const off = Math.floor(rng() * spacing);
    for (let li = -lanes; li <= lanes; li += 1) {
      if (li === 0) continue;
      const d = li * spacing + (li > 0 ? off : -off);
      const rank = Math.abs(li) <= 2 ? "avenue" : "secondary";
      runLine("h", core.y + d, core.x, rank);
      runLine("v", core.x + d, core.y, rank);
    }
    if (A === "megalopolis") {
      ring(core.x, core.y, Math.min(Math.floor(N / 2) - 2, Math.round((plan.reachBase || 8) * 0.9)), "avenue");
      for (let di = 0; di < 4; di += 1) {
        const ang = Math.PI / 4 + di * Math.PI / 2;
        const end = clampRay(ang, plan.reachBase || 8);
        staircase(core.x, core.y, end.x, end.y, "avenue", "diag:" + di);
      }
    }
    for (const a of plan.anchors)
      if (a.band <= 1) staircase(core.x, core.y, a.gx, a.gy, "path", "cp:" + a.label);
  }

  // Vieux centre : sentiers fondateurs des villes avancées.
  if (A !== "scattered" && counts.eraBand >= 2) {
    const founders = plan.anchors.filter((a) => a.band <= 1).slice(0, 3);
    for (const a of founders) staircase(core.x, core.y, a.gx, a.gy, "path", "old:" + a.label);
  }

  for (const p of plan.plazas || []) plaza(p);

  // ── Ville-rue : grand-rue E-O sinueuse + traverses, en polyligne connexe ────
  function linearMainStreet(rank) {
    const rng = rngFrom(seed, "linear");
    const drawDir = (dir) => {
      let yy = core.y;
      addCell(core.x, yy, "h", rank);
      for (let stepN = 1; stepN <= span; stepN += 1) {
        const x = core.x + dir * stepN;
        if (!inBounds(x, yy) || inWater(x, yy) || !organicLimit(x, yy, 2.2)) break;
        addCell(x, yy, "h", rank);
        if (rng() < 0.18) {
          const ny = yy + (rng() < 0.5 ? -1 : 1);
          if (inBounds(x, ny) && !inWater(x, ny) && organicLimit(x, ny, 2.2)) {
            addCell(x, yy, "v", rank); addCell(x, ny, "v", rank); addCell(x, ny, "h", rank);
            yy = ny;
          }
        }
        if (Math.abs(x - core.x) % 4 === 2) {
          const len = 2 + Math.floor(rng() * (2 + counts.eraBand * 1.5));
          addCell(x, yy, "v", "secondary");
          for (const sdir of [1, -1]) {
            for (let t = 1; t <= len; t += 1) {
              const ty = yy + sdir * t;
              if (!inBounds(x, ty) || inWater(x, ty) || !organicLimit(x, ty, 2.2)) break;
              addCell(x, ty, "v", "secondary");
            }
          }
        }
      }
    };
    drawDir(1);
    drawDir(-1);
  }

  // ── Couture : RELIE (sans supprimer) toute composante égarée au cœur ─────────
  // Une seule BFS terrestre multi-source depuis la composante du cœur ; chaque
  // fragment descend l'arbre `from` jusqu'au réseau. (Les fragments d'outre-fleuve
  // sans pont terrestre restent rares et seront écartés par cmBuildRoadGraph.)
  stitchComponents();

  function components() {
    const seen = new Set();
    const comps = [];
    for (const k of cells) {
      if (seen.has(k)) continue;
      const comp = [];
      const stack = [k];
      seen.add(k);
      while (stack.length) {
        const cur = stack.pop();
        comp.push(cur);
        const c = cur.indexOf(",");
        const gx = +cur.slice(0, c), gy = +cur.slice(c + 1);
        for (const [dx, dy] of ORTHO) {
          const nk = (gx + dx) + "," + (gy + dy);
          if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
      comps.push(comp);
    }
    return comps;
  }

  function stitchComponents() {
    const comps = components();
    if (comps.length <= 1) return;
    // Composante du cœur = celle qui contient la cellule la plus proche du cœur.
    let coreIdx = 0, bestD = Infinity;
    comps.forEach((comp, i) => {
      for (const k of comp) {
        const c = k.indexOf(",");
        const d = (+k.slice(0, c) - core.x) ** 2 + (+k.slice(c + 1) - core.y) ** 2;
        if (d < bestD) { bestD = d; coreIdx = i; }
      }
    });
    const coreSet = new Set(comps[coreIdx]);
    // BFS terrestre multi-source depuis la composante du cœur.
    const fdist = new Map(), from = new Map(), q = [];
    for (const k of comps[coreIdx]) { fdist.set(k, 0); q.push(k); }
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const c = cur.indexOf(",");
      const gx = +cur.slice(0, c), gy = +cur.slice(c + 1);
      const d = fdist.get(cur);
      for (const [dx, dy] of ORTHO) {
        const ngx = gx + dx, ngy = gy + dy;
        if (!inBounds(ngx, ngy) || inWater(ngx, ngy)) continue;
        const nk = ngx + "," + ngy;
        if (fdist.has(nk)) continue;
        fdist.set(nk, d + 1);
        from.set(nk, cur);
        q.push(nk);
      }
    }
    const axisBetween = (a, b) => (a.slice(0, a.indexOf(",")) === b.slice(0, b.indexOf(","))) ? "v" : "h";
    const markPath = (x, y, axis) => {
      const k = x + "," + y;
      const m = meta.get(k) || { h: false, v: false, rank: "path" };
      if (axis === "h") m.h = true; else m.v = true;
      meta.set(k, m);
      cells.add(k);
    };
    for (let i = 0; i < comps.length; i += 1) {
      if (i === coreIdx) continue;
      // Cellule de frange du fragment dont un voisin terrestre est le plus proche.
      let entry = null, entryD = Infinity, strayKey = null;
      for (const k of comps[i]) {
        const c = k.indexOf(",");
        const gx = +k.slice(0, c), gy = +k.slice(c + 1);
        for (const [dx, dy] of ORTHO) {
          const nk = (gx + dx) + "," + (gy + dy);
          const d = fdist.get(nk);
          if (d !== undefined && d < entryD) { entryD = d; entry = nk; strayKey = k; }
        }
      }
      if (!entry) continue; // fragment enclavé (outre-fleuve) : laissé à cmBuildRoadGraph
      let cur = entry, child = strayKey;
      while (cur && !coreSet.has(cur)) {
        const c = cur.indexOf(",");
        const cgx = +cur.slice(0, c), cgy = +cur.slice(c + 1);
        const parent = from.get(cur);
        if (parent) markPath(cgx, cgy, axisBetween(cur, parent));
        if (child) markPath(cgx, cgy, axisBetween(cur, child));
        child = cur;
        cur = parent;
      }
    }
  }

  // ── Rastérisation : sortie drop-in identique à generateRoads ────────────────
  const roads = [], roadKey = new Set(), roadMeta = new Map();
  for (const k of cells) {
    const c = k.indexOf(",");
    roads.push({ gx: +k.slice(0, c), gy: +k.slice(c + 1) });
    roadKey.add(k);
    roadMeta.set(k, meta.get(k) || { h: false, v: false, rank: "path" });
  }
  return { roads, roadKey, roadMeta, bridgeCols };
}

/* ----------------------------------------------------------------------------
 * trimDemandlessRoads — émondage à la demande (PR3)
 *   Retire les cellules de route qui ne bordent AUCUN bâtiment (set `demand`) en
 *   n'enlevant QUE des feuilles (degré ≤1) : on émonde de proche en proche les
 *   antennes mortes (approche de pont vers le vide, tronçons sans rien autour)
 *   sans jamais couper un axe traversant (degré ≥2, jamais une feuille) ni
 *   isoler le réseau (retirer une feuille ne déconnecte rien). Les esplanades
 *   (rang "plaza") sont toujours conservées : ce sont des espaces publics.
 *   Mute roadKey/roadMeta et compacte `roads` en place ; pur (testable seul).
 * -------------------------------------------------------------------------- */
export function trimDemandlessRoads({ roads, roadKey, roadMeta, demand }) {
  const isPlaza = (k) => { const m = roadMeta.get(k); return !!(m && m.rank === "plaza"); };
  const touchesDemand = (gx, gy) => {
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      if (demand.has((gx + dx) + "," + (gy + dy))) return true;
    }
    return false;
  };
  const degree = (gx, gy) => {
    let d = 0;
    for (const [dx, dy] of ORTHO) if (roadKey.has((gx + dx) + "," + (gy + dy))) d += 1;
    return d;
  };
  const removable = (k, gx, gy) => !isPlaza(k) && !touchesDemand(gx, gy);
  const work = [];
  for (const k of roadKey) {
    const c = k.indexOf(",");
    const gx = +k.slice(0, c), gy = +k.slice(c + 1);
    if (removable(k, gx, gy) && degree(gx, gy) <= 1) work.push(k);
  }
  let head = 0;
  while (head < work.length) {
    const k = work[head++];
    if (!roadKey.has(k)) continue;
    const c = k.indexOf(",");
    const gx = +k.slice(0, c), gy = +k.slice(c + 1);
    if (!removable(k, gx, gy) || degree(gx, gy) > 1) continue;
    roadKey.delete(k);
    roadMeta.delete(k);
    for (const [dx, dy] of ORTHO) {
      const ngx = gx + dx, ngy = gy + dy, nk = ngx + "," + ngy;
      if (roadKey.has(nk) && removable(nk, ngx, ngy) && degree(ngx, ngy) <= 1) work.push(nk);
    }
  }
  // Compacte le tableau `roads` en cohérence avec roadKey (mutation en place).
  const kept = roads.filter((r) => roadKey.has(r.gx + "," + r.gy));
  roads.length = 0;
  for (const r of kept) roads.push(r);
  return roads;
}
