/* ============================================================================
 * roadGraph.js — RoadGraphGenerator (moteur de routes)
 *   Construit le réseau viaire comme un GRAPHE CONNEXE par construction.
 *   Principes :
 *     - aucune route n'est « coupée » par la silhouette : organicLimit ne décide
 *       plus que de la LONGUEUR d'une antenne/ligne (on tronque le BOUT, jamais
 *       le milieu), il ne perce pas de trou dans un connecteur ;
 *     - les axes et grilles sont bornés à la silhouette (clampRay / runLine) →
 *       plus de chaussées dans le vide quand la ville grandit vite ;
 *     - une passe de couture (stitchComponents) RELIE — sans jamais supprimer —
 *       les rares composantes égarées à la composante du cœur : connexité
 *       garantie même si une recette d'archétype laisse un fragment.
 *   Sortie : { roads, roadKey, roadMeta, bridgeCols }, consommée par layout.js.
 *   La validation finale (ponts droits) reste assurée par cmBuildRoadGraph.
 * ============================================================================ */

import { rngFrom } from "./seedManager.js";
import { TERRAIN } from "./terrainField.js";

// "plaza" = rang le plus fort (esplanade dallée, exclue du rendu de chaussée).
const RANK_WEIGHT = { path: 0, secondary: 1, avenue: 2, main: 3, plaza: 4 };
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Archétypes ORGANIQUES : leur réseau final est retracé par la DESSERTE
// (layout.js) — le générateur ne fournit que le squelette identitaire + un
// échafaudage de placement dissous ensuite. Les archétypes géométriques
// (radial, districts, capital, megalopolis) gardent leur réseau tel quel :
// rocades et grilles sont des tracés voulus, pas des résidus.
const ORGANIC_ARCHETYPES = new Set(["scattered", "crossroads", "linear"]);

export function generateRoadsGraph({
  plan, seed, counts, ageCfg, N,
  riverSet, bankSet, riverBridgeX, organicLimit, bridgeAvoid,
  // Champ de terrain (terrainField.js), en unités U au centre de cellule —
  // OPTIONNEL : absent, les tracés longs gardent le staircase historique au bit
  // près (c'est le contrat des tests existants, qui ne le passent pas).
  fieldAt = null,
}) {
  const cells = new Set();          // "gx,gy" — source de vérité de la connexité
  const meta = new Map();           // "gx,gy" -> { h, v, rank }
  const core = { x: Math.round(plan.core.x), y: Math.round(plan.core.y) };
  const span = Math.ceil((plan.reachBase || 8) + 6);
  const mainRank = ageCfg.roadRanks.main ? "main" : "secondary";
  const A = plan.archetype;
  // ── SUPERBLOCKS cosmiques (chantier tissu urbain, reprise mégalopole
  // 2026-08-03, docs/PLAN-TISSU-URBAIN.md §10). Aux bandes 7+, le bâti fait
  // 7-14 tuiles de haut sur des empreintes de 2-3 tuiles : une rue toutes les
  // 4-6 cellules se lisait « une route par immeuble » (retour Raph). Ce bump
  // élargit d'un même geste les pas d'ARTÈRES (capital/mégalopole, grilles de
  // quartier « districts ») et le TREILLIS de perméabilité : les îlots passent
  // à ~7-8 cellules — la place de rangées entières d'immeubles identiques.
  // ⚠ Le treillis est plafonné à +2 (pas 6) : HOUSE_ROAD_RADIUS = 4 doit
  // continuer de couvrir l'intérieur des îlots (6/2 = 3 ≤ 4), sinon le cœur
  // des superblocks refuserait les maisons. Avant la bande 7 : zéro changement.
  // Molette : globalThis.__superMesh (défaut +2 ; 0 = trame historique) —
  // recompute nécessaire (__cityRecompute), c'est du layout.
  const superMesh = (counts.eraBand >= 7) ? (globalThis.__superMesh ?? 2) : 0;

  // ── Squelette identitaire vs échafaudage (archétypes organiques) ────────────
  // Deux natures de cellules pour scattered/crossroads/linear :
  //   - SQUELETTE (racine du cœur, traversée du pont, axes identitaires, places) :
  //     ce que la ville a « toujours eu », conservé tel quel ;
  //   - ÉCHAFAUDAGE (anneaux d'ancres, escaliers vers/entre les ancres, traverses,
  //     vieux sentiers) : il ne sert qu'à guider le PLACEMENT des bâtiments, puis
  //     layout.js le DISSOUT (dissolveToSkeleton) et retrace la desserte réelle
  //     bâtiment par bâtiment. Fini le labyrinthe résiduel des motifs que
  //     l'émondage ne sait pas manger (une boucle n'a pas de feuille).
  const skeleton = ORGANIC_ARCHETYPES.has(A) ? new Set() : null;
  let skel = false;                 // vrai pendant la pose d'une primitive du squelette
  const asSkel = (fn) => { if (!skeleton) { fn(); return; } skel = true; fn(); skel = false; };

  // Largeur du pont : DOUBLE-VOIE (2 tuiles) dès la bande 2 (Pierre) ; 1 voie aux
  // âges Feu/Bois. Chaque colonne de voie est un pont droit 1-large INDÉPENDANT
  // (jamais reliées en H) → la validation « pont droit » les traite séparément
  // (2 chaussées parallèles), sans changement. Le rendu les regroupe en un span.
  const bridgeLaneW = counts.eraBand >= 2 ? 2 : 1;
  // Colonnes de pont : pont historique + 1-2 traversées seedées aux ères avancées.
  const bridgeBaseCols = [Math.round(riverBridgeX)];
  if (counts.eraBand >= 3) {
    const bRng = rngFrom(seed, "bridges");
    const extra = counts.eraBand >= 5 ? 2 : 1;
    // DOMAINE INTERDIT (Maison des Plaisirs) : la colonne tirée y est repoussée
    // au bord, DU CÔTÉ OÙ ELLE ÉTAIT — la rabattre de l'autre côté la ferait
    // tomber sur le pont historique une fois sur deux. Si le bord sort de la
    // carte, on RENONCE à cette traversée : une ville avec un pont de moins se
    // lit, une traversée plantée en travers du monument, non.
    // ⚠ Le rayon inclut `bridgeLaneW` : la base occupe les colonnes bx..bx+w-1.
    const avoidR = bridgeAvoid ? bridgeAvoid.r + bridgeLaneW : 0;
    for (let i = 0; i < extra; i += 1) {
      let bx = Math.round(riverBridgeX + (bRng() - 0.5) * N * 0.45);
      if (bridgeAvoid) {
        const d = bx - bridgeAvoid.x;
        if (Math.abs(d) < avoidR) bx = Math.round(bridgeAvoid.x + (d >= 0 ? 1 : -1) * avoidR);
        bx = Math.max(1, Math.min(N - 2, bx));
        if (Math.abs(bx - bridgeAvoid.x) < avoidR) continue;
      }
      bridgeBaseCols.push(bx);
    }
  }
  // Chaque base occupe `bridgeLaneW` colonnes adjacentes (la 2e voie doit être
  // permise sur l'eau, sinon addCell la bloque).
  const bridgeCols = new Set();
  for (const bx of bridgeBaseCols) for (let dx = 0; dx < bridgeLaneW; dx += 1) bridgeCols.add(bx + dx);

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
    if (skel && skeleton) skeleton.add(k);
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

  // Grand axe LARGE = boulevard de 2 cellules : deux lignes COLLÉES (fixed & fixed+1).
  // En pixel la chaussée fait alors 2 tuiles pleines, et le terre-plein planté se pose
  // sur la COUTURE entre les deux (terrePlein) → une vraie voie de chaque côté. Réservé
  // au rang "main" (les avenues/rues restent fines → densité maîtrisée).
  function runLineWide(axis, fixed, center, rank, margin = 2.2) {
    runLine(axis, fixed, center, rank, margin);
    if (rank === "main") runLine(axis, fixed + 1, center, rank, margin);
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
      // Segments de 4 à 7 cellules (avant : 2 à 4) : un axe qui tourne toutes les
      // deux cellules tricotait des « pâtés zigzag » une fois les rubans dessinés
      // (Raph 2026-07-28) — une route se lit par ses longues jambes droites.
      const run = 4 + Math.floor(rng() * 4);
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

  // ── CHEMIN SILLONNANT (lot « routes entre les collines », 2026-08-24) ───────
  // Remplace le staircase pour les TRACÉS LONGS quand le champ de terrain est
  // fourni et vivant : un A* orienté (état = cellule + direction d'arrivée) où
  //   · TOURNER coûte (les longues jambes droites de Raph tombent du coût, plus
  //     du RNG) ;
  //   · MONTER coûte au CARRÉ de la pente — la route suit les vallées, contourne
  //     les massifs, et quand elle DOIT grimper, elle fait des lacets : le
  //     serpentin sort du coût, personne ne le dessine ;
  //   · un souffle de bruit haché par cellule garde le pittoresque du staircase
  //     (sans lui, deux tracés en plaine seraient au cordeau), DÉTERMINISTE.
  // La recherche est BORNÉE à la boîte des extrémités + WIND_M de marge : un
  // détour reste un détour, pas une errance. Échec (eau infranchissable, boîte
  // trop petite) → repli staircase : la connexité ne se négocie pas.
  // ⚠ Sans champ (tests, terrain coupé) → staircase, au bit près.
  const WIND_M = 16, WIND_TURN = 2.4, WIND_SLOPE = 3.2, WIND_NOISE = 0.25;
  const windHash = (x, y) => {
    let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (seed | 0)) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0;
    return ((h >>> 8) & 0xffff) / 65536;
  };
  function windingPath(x0, y0, x1, y1, rank, label) {
    if (!fieldAt || !TERRAIN.amp) { staircase(x0, y0, x1, y1, rank, label); return; }
    const ax = Math.round(x0), ay = Math.round(y0), tx = Math.round(x1), ty = Math.round(y1);
    if (ax === tx && ay === ty) { addCell(tx, ty, "h", rank); addCell(tx, ty, "v", rank); return; }
    const bx0 = Math.max(0, Math.min(ax, tx) - WIND_M), bx1 = Math.min(N - 1, Math.max(ax, tx) + WIND_M);
    const by0 = Math.max(0, Math.min(ay, ty) - WIND_M), by1 = Math.min(N - 1, Math.max(ay, ty) + WIND_M);
    const W = bx1 - bx0 + 1, H = by1 - by0 + 1;
    const idOf = (x, y, d) => (((y - by0) * W) + (x - bx0)) * 4 + d;
    const best = new Float64Array(W * H * 4).fill(Infinity);
    const from = new Int32Array(W * H * 4).fill(-1);
    // Tas binaire minimal [f, tie, id, g] à plat — le tie d'insertion rend
    // l'ordre TOTAL, donc le tracé identique d'une exécution à l'autre.
    const hp = [];
    let tie = 0;
    const push = (f, id, g) => {
      hp.push([f, tie += 1, id, g]);
      let i = hp.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hp[p][0] < hp[i][0] || (hp[p][0] === hp[i][0] && hp[p][1] < hp[i][1])) break;
        const t = hp[p]; hp[p] = hp[i]; hp[i] = t; i = p;
      }
    };
    const pop = () => {
      const top = hp[0], last = hp.pop();
      if (hp.length) {
        hp[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < hp.length && (hp[l][0] < hp[m][0] || (hp[l][0] === hp[m][0] && hp[l][1] < hp[m][1]))) m = l;
          if (r < hp.length && (hp[r][0] < hp[m][0] || (hp[r][0] === hp[m][0] && hp[r][1] < hp[m][1]))) m = r;
          if (m === i) break;
          const t = hp[m]; hp[m] = hp[i]; hp[i] = t; i = m;
        }
      }
      return top;
    };
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
    const fld = (x, y) => fieldAt(x + 0.5, y + 0.5);
    const okCell = (x, y) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1 && !inWater(x, y);
    const hMan = (x, y) => Math.abs(tx - x) + Math.abs(ty - y);
    // Amorce : les 4 premiers pas depuis le départ (pas de pénalité de virage).
    const f0 = fld(ax, ay);
    for (let d = 0; d < 4; d += 1) {
      const nx = ax + DX[d], ny = ay + DY[d];
      if (!okCell(nx, ny)) continue;
      const dz = fld(nx, ny) - f0;
      const g = 1 + WIND_SLOPE * dz * dz + WIND_NOISE * windHash(nx, ny);
      const id = idOf(nx, ny, d);
      if (g < best[id]) { best[id] = g; from[id] = -2 - d; push(g + hMan(nx, ny), id, g); }
    }
    let goal = -1, guard = W * H * 4;
    while (hp.length && guard-- > 0) {
      const [, , id, g] = pop();
      if (g > best[id] + 1e-9) continue;                 // entrée périmée du tas
      const d = id % 4, ci = (id - d) / 4;
      const x = bx0 + (ci % W), y = by0 + ((ci - (ci % W)) / W);
      if (x === tx && y === ty) { goal = id; break; }
      const fz = fld(x, y);
      for (let nd = 0; nd < 4; nd += 1) {
        if ((nd + 2) % 4 === d) continue;                // pas de demi-tour
        const nx = x + DX[nd], ny = y + DY[nd];
        if (!okCell(nx, ny)) continue;
        const dz = fld(nx, ny) - fz;
        const ng = g + 1 + (nd !== d ? WIND_TURN : 0)
          + WIND_SLOPE * dz * dz + WIND_NOISE * windHash(nx, ny);
        const nid = idOf(nx, ny, nd);
        if (ng < best[nid] - 1e-9) { best[nid] = ng; from[nid] = id; push(ng + hMan(nx, ny), nid, ng); }
      }
    }
    if (goal < 0) { staircase(x0, y0, x1, y1, rank, label); return; }
    // Remontée → cellules du chemin (cible → départ), puis pose en JAMBES :
    // un addEdge par run droit, coins marqués h+v — même vocabulaire de cellules
    // que le staircase, les passes aval (trim/prune/dissolve) n'y voient rien.
    const px = [], py = [];
    for (let id = goal; id >= 0; id = from[id]) {
      const d = id % 4, ci = (id - d) / 4;
      px.push(bx0 + (ci % W)); py.push(by0 + ((ci - (ci % W)) / W));
      if (from[id] <= -2) break;                         // amorce atteinte
    }
    px.push(ax); py.push(ay);
    px.reverse(); py.reverse();
    // Un run se ferme quand l'AXE du pas change ; chaque coin est marqué h+v.
    let s = 0;
    let axis = px[1] === px[0] ? "v" : "h";
    for (let i = 2; i < px.length; i += 1) {
      const a = px[i] === px[i - 1] ? "v" : "h";
      if (a !== axis) {
        addEdge(px[s], py[s], px[i - 1], py[i - 1], rank);
        addCell(px[i - 1], py[i - 1], "h", rank);
        addCell(px[i - 1], py[i - 1], "v", rank);
        s = i - 1; axis = a;
      }
    }
    addEdge(px[s], py[s], px[px.length - 1], py[py.length - 1], rank);
    addCell(px[px.length - 1], py[px.length - 1], "h", rank);
    addCell(px[px.length - 1], py[px.length - 1], "v", rank);
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
    // Étendue d'eau = UNION sur les colonnes de voie (les deux traversent en entier).
    let y0 = N, y1 = -1;
    for (const k of riverSet) {
      const c = k.indexOf(",");
      const kx = Number(k.slice(0, c));
      if (kx < x || kx >= x + bridgeLaneW) continue;
      const gy = Number(k.slice(c + 1));
      if (gy < y0) y0 = gy;
      if (gy > y1) y1 = gy;
    }
    for (let dx = 0; dx < bridgeLaneW; dx += 1) {
      if (y1 < y0) addEdge(x + dx, Math.max(0, core.y - 3), x + dx, Math.min(N - 1, core.y + 1), rank);
      else addEdge(x + dx, Math.max(0, y0 - 3), x + dx, Math.min(N - 1, y1 + 3), rank, true);
    }
  }

  // ── Squelette par archétype ─────────────────────────────────────────────────
  // Racine : garantit une cellule au cœur à laquelle tout se raccroche.
  asSkel(() => {
    addCell(core.x, core.y, "h", "path");
    addCell(core.x, core.y, "v", "path");
  });

  if (A === "scattered") {
    asSkel(() => bridgeCrossing("path"));
    let prevA = null;
    for (const a of plan.anchors) {
      windingPath(core.x, core.y, a.gx, a.gy, "path", "sc:" + a.label);
      const ar = Math.max(1, Math.round((a.r || 2) * 0.5));
      ring(Math.round(a.gx), Math.round(a.gy), ar, "path");
      if (prevA) windingPath(prevA.gx, prevA.gy, a.gx, a.gy, "path", "sc-link:" + prevA.label + ">" + a.label);
      prevA = a;
    }
    ring(core.x, core.y, 2, "path");
  } else if (A === "crossroads") {
    const rng = rngFrom(seed, "crossroads");
    const bendY = core.y + Math.round((rng() - 0.5) * 4);
    const bendX = core.x + Math.round((rng() - 0.5) * 4);
    const west = clampRay(Math.PI, span), east = clampRay(0, span);
    asSkel(() => windingPath(west.x, bendY, east.x, core.y, mainRank, "cr:h"));
    asSkel(() => bridgeCrossing(mainRank));
    const north = clampRay(-Math.PI / 2, Math.min(span, 6 + span * 0.3));
    asSkel(() => windingPath(bendX, north.y, core.x, core.y, "secondary", "cr:v"));
    for (const a of plan.anchors)
      windingPath(core.x, core.y, a.gx, a.gy, a.band <= 1 ? "path" : "secondary", "cr:" + a.label);
  } else if (A === "linear") {
    asSkel(() => linearMainStreet(mainRank));
    asSkel(() => bridgeCrossing("secondary"));
    for (const a of plan.anchors)
      windingPath(a.gx, core.y, a.gx, a.gy, "path", "ln:" + a.label);
  } else if (A === "radial") {
    const rng = rngFrom(seed, "radial");
    const spokes = 5 + Math.floor(rng() * 3);
    const a0 = rng() * Math.PI * 2;
    for (let i = 0; i < spokes; i += 1) {
      const ang = a0 + (i / spokes) * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const end = clampRay(ang, span);
      windingPath(core.x, core.y, end.x, end.y, i < 2 ? mainRank : "secondary", "ray:" + i);
    }
    bridgeCrossing(mainRank);
    const rings = Math.min(4, 1 + counts.infraRings);
    for (let ri = 1; ri <= rings; ri += 1) ring(core.x, core.y, 3 + ri * 4, ri <= 1 ? "avenue" : "secondary");
    for (const a of plan.anchors) windingPath(core.x, core.y, a.gx, a.gy, "path", "rd:" + a.label);
  } else if (A === "districts") {
    bridgeCrossing(mainRank);
    runLineWide("h", core.y, core.x, mainRank);
    for (const a of plan.anchors) {
      windingPath(core.x, core.y, a.gx, a.gy, a.band >= 3 ? "avenue" : "secondary", "dt:" + a.label);
      localGrid(Math.round(a.gx), Math.round(a.gy), Math.round(a.r + 1), 3 + superMesh, "secondary", "dt:" + a.label);
    }
    const rng = rngFrom(seed, "districts-extra");
    for (let ri = 1; ri <= Math.min(3, counts.infraRings); ri += 1)
      ring(core.x, core.y, 4 + ri * 5 + Math.floor(rng() * 2), "secondary");
  } else { // capital / megalopolis
    const rng = rngFrom(seed, "capital");
    // Espacement ÉLARGI + moins de lanes + décalage SYMÉTRIQUE : évite les paquets de
    // routes serrées qui se soudaient en grands aplats gris (cf. plafond roadMedian).
    const spacing = (A === "megalopolis" ? 5 : 6) + superMesh;
    runLineWide("h", core.y, core.x, mainRank);
    bridgeCrossing(mainRank);
    runLineWide("v", core.x, core.y, mainRank);
    const lanes = Math.min(5, 2 + counts.eraBand + Math.floor(counts.urbanTier / 5));
    const off = Math.floor(rng() * 2);   // léger décalage GLOBAL (symétrique), pas asymétrique
    for (let li = -lanes; li <= lanes; li += 1) {
      if (li === 0) continue;
      const d = li * spacing + off;      // même off des deux côtés → espacement régulier
      const rank = Math.abs(li) <= 2 ? "avenue" : "secondary";
      runLine("h", core.y + d, core.x, rank);
      runLine("v", core.x + d, core.y, rank);
    }
    if (A === "megalopolis") {
      ring(core.x, core.y, Math.min(Math.floor(N / 2) - 2, Math.round((plan.reachBase || 8) * 0.9)), "avenue");
      for (let di = 0; di < 4; di += 1) {
        const ang = Math.PI / 4 + di * Math.PI / 2;
        const end = clampRay(ang, plan.reachBase || 8);
        windingPath(core.x, core.y, end.x, end.y, "avenue", "diag:" + di);
      }
    }
    for (const a of plan.anchors)
      if (a.band <= 1) windingPath(core.x, core.y, a.gx, a.gy, "path", "cp:" + a.label);
  }

  // Vieux centre : sentiers fondateurs des villes avancées.
  if (A !== "scattered" && counts.eraBand >= 2) {
    const founders = plan.anchors.filter((a) => a.band <= 1).slice(0, 3);
    for (const a of founders) windingPath(core.x, core.y, a.gx, a.gy, "path", "old:" + a.label);
  }

  // ÉCHAFAUDAGE DE PERMÉABILITÉ (organiques denses) : un quadrillage de ruelles
  // en RÉSERVE sur toute la silhouette, dissous après le placement comme le
  // reste de l'échafaudage. Le placement ne bâtit jamais sur une cellule de
  // route : ces couloirs restent donc du sol LIBRE qui traverse chaque quartier
  // — la desserte peut atteindre chaque bâtiment, et les blocs-moteurs ne se
  // soudent plus en dalles scellées. Sans lui, à forte densité, la moitié de la
  // ville devenait injoignable (mesuré : 76 tuiles-moteur sur 809 au contact,
  // 120 maisons sur 232 sans venelle) pendant que la couverture affichait
  // 100 %. GATE par la taille : un petit hameau ne peut rien sceller, et son
  // arbre de desserte à main levée est plus beau sans trame sous-jacente.
  const permSize = (counts.houses || 0) + (counts.engineHomesRaw || 0);
  if (skeleton && permSize > 150) {
    const rngP = rngFrom(seed, "perm");
    const spacing = 4 + Math.min(2, superMesh);   // plafonné : cf. superMesh (HOUSE_ROAD_RADIUS)
    const off = Math.floor(rngP() * spacing);
    for (let gy = off; gy < N; gy += spacing) runLine("h", gy, core.x, "path");
    for (let gx = off; gx < N; gx += spacing) runLine("v", gx, core.y, "path");
  }

  asSkel(() => { for (const p of plan.plazas || []) plaza(p); });

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
          // Traverses = ÉCHAFAUDAGE (guides de placement), pas le squelette : la
          // desserte les remplace par de vraies venelles tracées à la demande.
          const wasSkel = skel; skel = false;
          const len = 2 + Math.floor(rng() * (2 + counts.eraBand * 1.5));
          addCell(x, yy, "v", "secondary");
          for (const sdir of [1, -1]) {
            for (let t = 1; t <= len; t += 1) {
              const ty = yy + sdir * t;
              if (!inBounds(x, ty) || inWater(x, ty) || !organicLimit(x, ty, 2.2)) break;
              addCell(x, ty, "v", "secondary");
            }
          }
          skel = wasSkel;
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
  stitchComponents(cells, false);
  // Couture du SQUELETTE seul : les archétypes organiques seront DISSOUS sur lui
  // (layout.js) — il doit être connexe PAR LUI-MÊME (cœur ↔ pont ↔ places), sinon
  // l'élagage de cmBuildRoadGraph jetterait le pont et tout son quartier. Les
  // liens tracés ici rejoignent cells ET skeleton (nouvelles cellules comprises).
  if (skeleton) stitchComponents(skeleton, true);

  function components(target) {
    const seen = new Set();
    const comps = [];
    for (const k of target) {
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
          if (target.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
      comps.push(comp);
    }
    return comps;
  }

  function stitchComponents(target, markSkel) {
    const comps = components(target);
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
      if (markSkel) skeleton.add(k);
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

  // ── Rastérisation : { roads, roadKey, roadMeta, bridgeCols, skeletonKey } ───
  const roads = [], roadKey = new Set(), roadMeta = new Map();
  for (const k of cells) {
    const c = k.indexOf(",");
    roads.push({ gx: +k.slice(0, c), gy: +k.slice(c + 1) });
    roadKey.add(k);
    roadMeta.set(k, meta.get(k) || { h: false, v: false, rank: "path" });
  }
  // skeletonKey ≠ null ⇔ archétype organique : layout.js dissout l'échafaudage
  // après le placement (dissolveToSkeleton) puis retrace la desserte réelle.
  return { roads, roadKey, roadMeta, bridgeCols, skeletonKey: skeleton };
}

/* ----------------------------------------------------------------------------
 * dissolveToSkeleton — dissolution de l'échafaudage (archétypes organiques)
 *   Après le PLACEMENT des bâtiments (qui s'est appuyé sur l'échafaudage pour
 *   créer les slots), on ne garde que le squelette identitaire : racine du
 *   cœur, traversée(s) de pont, axes, places, et leurs coutures. Le réseau
 *   réel est ensuite RETRACÉ par la desserte (connectBuildingsToNetwork) :
 *   chaque bâtiment se raccorde au réseau existant par le plus court chemin →
 *   un ARBRE de sentiers qui mènent quelque part, au lieu du labyrinthe
 *   résiduel du motif. Mute roadKey/roadMeta et compacte `roads` en place.
 * -------------------------------------------------------------------------- */
export function dissolveToSkeleton({ roads, roadKey, roadMeta, skeletonKey }) {
  if (!skeletonKey) return roads;
  for (const k of Array.from(roadKey)) {
    if (skeletonKey.has(k)) continue;
    roadKey.delete(k);
    roadMeta.delete(k);
  }
  const kept = roads.filter((r) => roadKey.has(r.gx + "," + r.gy));
  roads.length = 0;
  for (const r of kept) roads.push(r);
  return roads;
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
  // Voisinage ORTHOGONAL (pas diagonal) : une feuille n'est conservée que si elle
  // borde DIRECTEMENT un bâtiment. En 8-voisins, une antenne qui ne desservait un
  // bâtiment qu'en DIAGONALE laissait un stub à 1 cellule du bâtiment (chemin qui
  // s'arrête « dans le vide »). En ortho-seul, cette antenne est émondée en entier.
  const touchesDemand = (gx, gy) => {
    for (const [dx, dy] of ORTHO) if (demand.has((gx + dx) + "," + (gy + dy))) return true;
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

/* ── ÉMONDAGE DES QUARTIERS DE RUES VIDES ─────────────────────────────────────
 * Lot L8 de docs/PLAN-TISSU-URBAIN.md, demandé par Raph le 2026-07-29 devant une
 * capture : « on a encore des carrés 2×2 pas très cohérents, il faudrait que ça
 * n'arrive plus ». Une fois le sol vide repeint en herbe (lot L2), ce qui reste
 * saute aux yeux : des pans entiers de maillage viaire posés sur de la friche,
 * qui ne mènent nulle part et ne desservent personne.
 *
 * `trimDemandlessRoads`, juste au-dessus, ne peut PAS les enlever, et son
 * commentaire le dit déjà : « l'émondage ne mange que des feuilles, et une
 * boucle n'en a pas ». Un quadrillage est fait de boucles — chaque cellule y a
 * deux voisines ou plus, donc aucune n'est jamais une feuille. Le maillage était
 * littéralement immortel.
 *
 * Mesuré sur une ville de 1 528 bâtiments (4 000 cellules de rue) : 2 250
 * cellules touchent un bâtiment, mais **471 sont à quatre pas ou plus de la
 * moindre porte**, et l'arbre minimal qui dessert tout ne pèse que 3 369
 * cellules — **631 de surplus, 15,8 %**. Peu en proportion, très visible en
 * pratique : ce surplus n'est pas saupoudré, il est groupé en quartiers entiers.
 *
 * LA RÈGLE, et pourquoi elle est SÛRE. On garde deux choses :
 *   1. tout ce qui est à `reach` pas ou moins d'une porte (le tissu de desserte
 *      local, BOUCLES COMPRISES — une ville bâtie garde son quadrillage) ;
 *   2. l'arbre des plus courts chemins de chaque porte vers le cœur (la route
 *      qui va à la ferme isolée reste, même sur dix cellules de friche).
 * L'union des deux est CONNEXE par construction : un chemin de longueur ≤ reach
 * vers une porte n'est fait que de cellules elles aussi à ≤ reach d'une porte,
 * donc conservées, et il aboutit sur une porte, qui est dans l'arbre. Ce n'est
 * pas une propriété qu'on espère, c'est une propriété qu'on démontre — d'où
 * l'absence de vérification de connexité par candidat, qui aurait été en O(n²).
 *
 * ⚠ Ce qui est SANCTUARISÉ (jamais émondé) : les cellules de `demand`
 * elles-mêmes — la travée du pont y est semée par l'appelant — et les places
 * (rang `plaza`), qui appartiennent au réseau sans desservir de porte.
 * ------------------------------------------------------------------------- */
export const ROAD_PRUNE = { on: true, reach: 2 };
export function pruneUnservedRoads({ roads, roadKey, roadMeta, demand, coreX, coreY }) {
  const cfg = ROAD_PRUNE;
  const reach = Math.max(0, (typeof globalThis !== "undefined" && globalThis.__roadPruneReach != null)
    ? globalThis.__roadPruneReach | 0 : cfg.reach | 0);
  if (!cfg.on || !roadKey.size) return roads;
  const isPlaza = (k) => { const m = roadMeta.get(k); return !!(m && m.rank === "plaza"); };
  const at = (k, fn) => { const c = k.indexOf(","); return fn(+k.slice(0, c), +k.slice(c + 1)); };

  // SEEDS = les cellules de rue qui ont une raison d'exister par elles-mêmes.
  const seeds = [];
  for (const k of roadKey) {
    const served = demand.has(k) || isPlaza(k)
      || at(k, (gx, gy) => ORTHO.some(([dx, dy]) => demand.has((gx + dx) + "," + (gy + dy))));
    if (served) seeds.push(k);
  }
  if (!seeds.length) return roads;   // réseau sans aucune demande : on n'y touche pas

  // 1. Distance de chaque rue à la porte la plus proche, EN SUIVANT LES RUES.
  const dist = new Map();
  for (const k of seeds) dist.set(k, 0);
  for (let i = 0, q = seeds.slice(); i < q.length; i += 1) {
    const cur = q[i], d = dist.get(cur);
    at(cur, (gx, gy) => {
      for (const [dx, dy] of ORTHO) {
        const nk = (gx + dx) + "," + (gy + dy);
        if (dist.has(nk) || !roadKey.has(nk)) continue;
        dist.set(nk, d + 1);
        q.push(nk);
      }
    });
  }

  // 2. Arbre des plus courts chemins depuis le cœur (ou, à défaut, une porte).
  const core = coreX + "," + coreY;
  const root = roadKey.has(core) ? core : seeds[0];
  const par = new Map([[root, null]]);
  for (let i = 0, q = [root]; i < q.length; i += 1) {
    const cur = q[i];
    at(cur, (gx, gy) => {
      for (const [dx, dy] of ORTHO) {
        const nk = (gx + dx) + "," + (gy + dy);
        if (par.has(nk) || !roadKey.has(nk)) continue;
        par.set(nk, cur);
        q.push(nk);
      }
    });
  }

  const keep = new Set();
  for (const [k, d] of dist) if (d <= reach) keep.add(k);
  // ⚠ La remontée vers le cœur se garde par `linked`, PAS par `keep`. Toute
  // porte est à distance 0 d'elle-même, donc déjà dans `keep` : s'arrêter « quand
  // c'est déjà gardé » faisait sortir la boucle au premier pas et aucun chemin
  // n'était jamais tracé. Les quartiers lointains restaient conservés mais
  // DÉTACHÉS du reste — le réseau se cassait en morceaux, et la preuve de
  // connexité ci-dessus n'y pouvait rien puisque son hypothèse était fausse.
  // `linked` = cellules dont le chemin jusqu'au cœur est acquis.
  const linked = new Set([root]);
  keep.add(root);
  for (const sk of seeds) {
    const path = [];
    let cur = sk;
    while (cur != null && !linked.has(cur)) { path.push(cur); cur = par.get(cur); }
    // cur == null : porte d'une composante séparée du cœur (réseau pas encore
    // recollé). On garde son chemin tel quel ; l'élagage de connectivité de
    // cmBuildRoadGraph tranchera, c'est son métier.
    for (const p of path) { keep.add(p); linked.add(p); }
  }

  let cut = 0;
  for (const k of [...roadKey]) {
    if (keep.has(k)) continue;
    roadKey.delete(k);
    roadMeta.delete(k);
    cut += 1;
  }
  if (!cut) return roads;
  const kept = roads.filter((r) => roadKey.has(r.gx + "," + r.gy));
  roads.length = 0;
  for (const r of kept) roads.push(r);
  return roads;
}
