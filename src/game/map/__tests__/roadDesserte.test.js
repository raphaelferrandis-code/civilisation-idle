import { describe, it, expect } from "vitest";

import { cmBuildRoadGraph, connectBuildingsToNetwork, upgradeTrunkByUsage, computeRoadUsage, applyRoadWidenings } from "../layout.js";
import { generateRoadsGraph, trimDemandlessRoads, dissolveToSkeleton } from "../procedural/roadGraph.js";

// Desserte des archétypes ORGANIQUES (retour Raph 2026-07-28 : « les routes
// doivent être logiques, pas en amas ») : l'échafaudage de placement est
// dissous sur le squelette identitaire, puis chaque bâtiment rejoint le réseau
// existant par le plus court chemin. Invariants verrouillés ici :
//   1. le réseau terrestre est un ARBRE (nombre cyclomatique 0 hors places) ;
//   2. CONTRÔLE NÉGATIF : sans dissolution, l'ancien motif est bien un
//      labyrinthe (cyclomatique élevé) — la garde mord ;
//   3. toute impasse mène à une porte (feuille ⇒ borde un bâtiment) ;
//   4. toutes les habitations sont desservies ;
//   5. déterminisme ; 6. le tronc émerge (path → secondary) ;
//   7. une seule composante par masques (la connexité que voit le joueur).

const ORGANIC = ["scattered", "crossroads", "linear"];

function diskLimit(core, R) {
  return (x, y, m = 0) => Math.hypot(x - core.x, y - core.y) <= R + m;
}

// Harnais jumeau de roadMaskRepair.test.js (grain par seed).
function makeInputs(archetype, eraBand, seed, { R = 22, withRiver = false } = {}) {
  const N = 64;
  const core = { x: 32, y: 26 };
  const anchors = [];
  for (let band = 0; band <= eraBand; band += 1) {
    const n = band === 0 ? 1 : band <= 2 ? 2 : 3;
    for (let i = 0; i < n; i += 1) {
      const ang = (anchors.length * 1.7 + seed * 0.61) % (Math.PI * 2);
      const dist = R * (0.4 + 0.12 * (anchors.length % 4));
      anchors.push({
        label: `${band}-${i}`, band,
        gx: Math.round(core.x + Math.cos(ang) * dist),
        gy: Math.round(core.y + Math.sin(ang) * dist),
        r: 3.5, strength: 1,
      });
    }
  }
  const riverSet = new Set();
  if (withRiver) for (let x = 0; x < N; x += 1) for (let y = 40; y <= 42; y += 1) riverSet.add(x + "," + y);
  return {
    plan: { archetype, core, reachBase: R, anchors, plazas: [], chaos: 0, order: 1 },
    seed,
    counts: { eraBand, infraRings: Math.min(4, eraBand), urbanTier: eraBand * 2 },
    ageCfg: { roadRanks: { main: eraBand >= 1, avenue: eraBand >= 2, secondary: true, path: true } },
    N, riverSet, bankSet: new Set(), riverBridgeX: core.x + 4,
    organicLimit: diskLimit(core, R),
  };
}

// Placement synthétique : comme dans layout.js, les habitations se posent LE
// LONG de l'échafaudage (échantillonnage déterministe des cellules de route,
// bâtiment 1×1 sur une case libre adjacente).
function placeBuildings(out, inp, every = 3) {
  const { N, riverSet } = inp;
  const occ = new Set();
  const tiles = [];
  const keys = [...out.roadKey].sort();
  let i = 0;
  for (const k of keys) {
    i += 1;
    if (i % every !== 0) continue;
    const c = k.indexOf(","), gx = +k.slice(0, c), gy = +k.slice(c + 1);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const bx = gx + dx, by = gy + dy, bk = bx + "," + by;
      if (bx < 1 || by < 1 || bx >= N - 1 || by >= N - 1) continue;
      if (out.roadKey.has(bk) || riverSet.has(bk) || occ.has(bk)) continue;
      occ.add(bk);
      tiles.push({ gx: bx, gy: by, type: "deco" });
      break;
    }
  }
  return tiles;
}

// Pipeline complet, miroir de computeCityLayout : génération → placement →
// [dissolution] → trim → desserte → hiérarchie → graphe final.
function runPipeline(A, band, seed, { withRiver = false, dissolve = true } = {}) {
  const inp = makeInputs(A, band, seed, { withRiver });
  const out = generateRoadsGraph(inp);
  const tiles = placeBuildings(out, inp);
  if (dissolve) dissolveToSkeleton(out);

  const demand = new Set();
  for (const t of tiles) demand.add(t.gx + "," + t.gy);
  const protectedCells = new Set();
  // Racine sanctuarisée (cellule + voisines), comme layout.js.
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    demand.add((32 + dx) + "," + (26 + dy));
    protectedCells.add((32 + dx) + "," + (26 + dy));
  }
  const laneW = band >= 2 ? 2 : 1;
  if (withRiver) {
    const bx = Math.round(inp.riverBridgeX);
    for (let dx = 0; dx < laneW; dx += 1)
      for (let gy = 40 - 3; gy <= 42 + 3; gy += 1) {
        demand.add((bx + dx) + "," + gy);
        protectedCells.add((bx + dx) + "," + gy);
      }
  }
  trimDemandlessRoads({ roads: out.roads, roadKey: out.roadKey, roadMeta: out.roadMeta, demand });

  connectBuildingsToNetwork({
    roads: out.roads, roadKey: out.roadKey, roadMeta: out.roadMeta,
    tiles, N: inp.N, riverSet: inp.riverSet, bankSet: inp.bankSet,
    claimed: new Set(), engineFootprint: new Set(), occupiedFoot: new Set(),
    roadBudget: 0, connectorRank: "path",
    freeCap: out.skeletonKey ? 60 : 0,
  });
  upgradeTrunkByUsage({ roadKey: out.roadKey, roadMeta: out.roadMeta, tiles, coreX: 32, coreY: 26 });

  const river = withRiver ? {
    isWater: (gx, gy) => inp.riverSet.has(gx + "," + gy),
    cells: inp.riverSet, banks: new Set(), bridge: { x: inp.riverBridgeX },
  } : null;
  const g = cmBuildRoadGraph(
    out.roads.map((r) => ({ ...r })), out.roadKey, out.roadMeta,
    river, 32, 26, laneW,
  );
  return { inp, out, tiles, g, protectedCells };
}

// Cellules « terrestres ordinaires » du graphe final : ni travée de pont, ni place.
const isLand = (r) => r.roadSurface !== "bridge" && r.rank !== "plaza";
const MASK_DIRS = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]]; // N,E,S,W

// Nombre cyclomatique du graphe de MASQUES terrestre : E − V + C. 0 = forêt
// (aucune boucle) ; chaque unité au-dessus = une boucle indépendante.
function cyclomatic(roadMap) {
  const inSet = (k) => { const r = roadMap.get(k); return !!(r && isLand(r)); };
  let V = 0, E2 = 0;
  const seen = new Set();
  let comps = 0;
  for (const [k, r] of roadMap) {
    if (!isLand(r)) continue;
    V += 1;
    for (const [bit, dx, dy] of MASK_DIRS)
      if ((r.mask & bit) && inSet((r.gx + dx) + "," + (r.gy + dy))) E2 += 1;
    if (!seen.has(k)) {
      comps += 1;
      const stack = [k];
      seen.add(k);
      while (stack.length) {
        const cur = stack.pop();
        const rc = roadMap.get(cur);
        for (const [bit, dx, dy] of MASK_DIRS) {
          if (!(rc.mask & bit)) continue;
          const nk = (rc.gx + dx) + "," + (rc.gy + dy);
          if (inSet(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
    }
  }
  return E2 / 2 - V + comps;
}

function maskComponents(roadMap) {
  const seen = new Set();
  const comps = [];
  for (const k0 of roadMap.keys()) {
    if (seen.has(k0)) continue;
    const comp = [];
    const stack = [k0];
    seen.add(k0);
    while (stack.length) {
      const k = stack.pop();
      const r = roadMap.get(k);
      comp.push(k);
      for (const [bit, dx, dy] of MASK_DIRS) {
        if (!(r.mask & bit)) continue;
        const nk = (r.gx + dx) + "," + (r.gy + dy);
        if (roadMap.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    comps.push(comp);
  }
  return comps.sort((a, b) => b.length - a.length);
}

describe("desserte organique — le réseau raconte des trajets", () => {
  it("1. arbre : au plus UNE boucle émergente pour scattered (le hameau)", () => {
    // Scan 80 générations (2026-07-28) : nouveau pipeline max 1 (7/80 à 1, le
    // reste à 0) — la boucle résiduelle est une fusion bout à bout de deux
    // venelles colinéaires (un îlot, lisible) ; ancien pipeline min 2, moy 8,5,
    // max 17 (anneaux + recouvrements d'escaliers = labyrinthe). Les seuils 1/2
    // sont donc STRICTEMENT séparés.
    for (const band of [0, 1]) {
      for (let seed = 1; seed <= 5; seed += 1) {
        for (const withRiver of [false, true]) {
          const { g } = runPipeline("scattered", band, seed, { withRiver });
          expect(g.roadMap.size, `b${band}/s${seed}/r${withRiver}: réseau non vide`).toBeGreaterThan(0);
          expect(cyclomatic(g.roadMap), `b${band}/s${seed}/r${withRiver}: boucles`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("1b. crossroads/linear : quasi-arbre (les axes identitaires peuvent se recroiser)", () => {
    for (const A of ["crossroads", "linear"]) {
      for (const band of [1, 2]) {
        for (let seed = 1; seed <= 5; seed += 1) {
          const { g } = runPipeline(A, band, seed, { withRiver: true });
          expect(cyclomatic(g.roadMap), `${A}/b${band}/s${seed}: boucles`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("2. la garde mord : SANS dissolution, le motif est bien un labyrinthe", () => {
    let worst = Infinity;
    for (let seed = 1; seed <= 3; seed += 1) {
      const { g } = runPipeline("scattered", 1, seed, { withRiver: true, dissolve: false });
      worst = Math.min(worst, cyclomatic(g.roadMap));
    }
    // L'ancien pipeline laisse SYSTÉMATIQUEMENT des boucles (anneaux d'ancres,
    // recouvrements d'escaliers) que l'émondage ne sait pas manger : min mesuré
    // 2 sur 80 générations (moy 8,5) — toujours au-dessus du seuil du test 1.
    expect(worst).toBeGreaterThanOrEqual(2);
  });

  it("3. toute impasse mène à une porte (feuille ⇒ borde un bâtiment)", () => {
    for (const A of ORGANIC) {
      for (let seed = 1; seed <= 4; seed += 1) {
        const { g, tiles, protectedCells } = runPipeline(A, 1, seed, { withRiver: true });
        const foot = new Set(tiles.map((t) => t.gx + "," + t.gy));
        for (const [k, r] of g.roadMap) {
          if (!isLand(r) || protectedCells.has(k)) continue;
          let deg = 0;
          for (const [bit, dx, dy] of MASK_DIRS)
            if ((r.mask & bit) && g.roadMap.has((r.gx + dx) + "," + (r.gy + dy))) deg += 1;
          if (deg > 1) continue;
          const doorstep = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .some(([dx, dy]) => foot.has((r.gx + dx) + "," + (r.gy + dy)));
          expect(doorstep, `${A}/s${seed}: impasse ${k} dans le vide`).toBe(true);
        }
      }
    }
  });

  it("4. toutes les habitations sont desservies (une route au seuil)", () => {
    for (const A of ORGANIC) {
      for (let seed = 1; seed <= 4; seed += 1) {
        const { out, tiles } = runPipeline(A, 1, seed, { withRiver: true });
        const touches = (t) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([dx, dy]) => out.roadKey.has((t.gx + dx) + "," + (t.gy + dy)));
        const servis = tiles.filter(touches).length;
        expect(servis, `${A}/s${seed}: ${servis}/${tiles.length} desservis`).toBe(tiles.length);
      }
    }
  });

  it("5. déterminisme : mêmes entrées → mêmes cellules", () => {
    for (const A of ORGANIC) {
      const a = runPipeline(A, 1, 2, { withRiver: true });
      const b = runPipeline(A, 1, 2, { withRiver: true });
      expect([...a.out.roadKey].sort()).toEqual([...b.out.roadKey].sort());
    }
  });

  it("6. le tronc émerge : des cellules path passent secondary par l'usage", () => {
    const { g, tiles } = runPipeline("scattered", 1, 1, { withRiver: true });
    expect(tiles.length).toBeGreaterThanOrEqual(15);
    const ranks = new Set([...g.roadMap.values()].map((r) => r.rank));
    expect(ranks.has("secondary"), "au moins un tronçon de tronc").toBe(true);
    // La desserte n'invente ni avenue ni boulevard : le hameau reste un hameau.
    expect(ranks.has("avenue")).toBe(false);
    expect(ranks.has("main")).toBe(false);
  });

  it("7. une seule composante par masques (la connexité que voit le joueur)", () => {
    for (const A of ORGANIC) {
      for (let seed = 1; seed <= 4; seed += 1) {
        const { g } = runPipeline(A, 1, seed, { withRiver: true });
        expect(maskComponents(g.roadMap).length, `${A}/s${seed}`).toBe(1);
      }
    }
  });
});

// ── Échafaudage de perméabilité (villes denses) ─────────────────────────────
describe("perméabilité — les villes denses gardent des couloirs libres", () => {
  it("quadrillage présent en échafaudage, absent du squelette, dissous ensuite", () => {
    const dense = makeInputs("scattered", 1, 3, { withRiver: true });
    dense.counts.houses = 200;                  // au-delà du gate (150) → quadrillage
    const outD = generateRoadsGraph(dense);
    const small = makeInputs("scattered", 1, 3, { withRiver: true });
    const outS = generateRoadsGraph(small);     // harnais nu : pas de quadrillage
    // Le quadrillage densifie l'ÉCHAFAUDAGE, jamais le squelette.
    expect(outD.roadKey.size).toBeGreaterThan(outS.roadKey.size * 2);
    expect(outD.skeletonKey.size).toBeLessThan(outS.roadKey.size);
    // Après dissolution, il ne reste que le squelette : les couloirs sont du
    // sol LIBRE (le placement n'y bâtit pas), pas des routes.
    dissolveToSkeleton(outD);
    expect(outD.roadKey.size).toBe(outD.skeletonKey.size);
  }, 20000);
});

// ── Chantiers de voirie : le replay carte du compteur ───────────────────────
// 1 chantier payé = 1 moteur raccordé (corridor ENTIER, plus un budget de
// tuiles) ; les chantiers restants élargissent les tronçons les plus empruntés.
describe("chantiers de voirie — replay carte", () => {
  it("raccords : engineWorks compte des corridors entiers, pas des tuiles", () => {
    const { inp, out, tiles } = runPipeline("scattered", 1, 2, { withRiver: true });
    // Trois moteurs synthétiques posés LOIN du réseau (corridor garanti > 3
    // tuiles chacun : l'ancien budget-tuiles n'en aurait payé aucun à 2).
    const eng = [];
    for (let gy = 8; gy < 40 && eng.length < 3; gy += 1) {
      for (let gx = 8; gx < 56 && eng.length < 3; gx += 1) {
        const k = gx + "," + gy;
        if (out.roadKey.has(k) || inp.riverSet.has(k)) continue;
        if (!inp.organicLimit(gx, gy, 0)) continue;
        let nearRoad = false;
        for (let dy = -3; dy <= 3 && !nearRoad; dy += 1)
          for (let dx = -3; dx <= 3 && !nearRoad; dx += 1)
            if (out.roadKey.has((gx + dx) + "," + (gy + dy))) nearRoad = true;
        if (nearRoad) continue;
        if (tiles.some((t) => t.gx === gx && t.gy === gy)) continue;
        if (eng.some((e) => Math.abs(e.gx - gx) + Math.abs(e.gy - gy) < 6)) continue;
        eng.push({ gx, gy, type: "engine", buildingId: "granaries_city" });
      }
    }
    expect(eng.length).toBe(3);
    const res = connectBuildingsToNetwork({
      roads: out.roads, roadKey: out.roadKey, roadMeta: out.roadMeta,
      tiles: [...tiles, ...eng], N: inp.N, riverSet: inp.riverSet, bankSet: new Set(),
      claimed: new Set(), engineFootprint: new Set(), occupiedFoot: new Set(),
      engineWorks: 2, connectorRank: "secondary", freeCap: 0,
    });
    expect(res.engineTotal).toBe(3);
    // À petite échelle, une vague = ceil(manquants × 0.25) = 1 moteur : les 2
    // chantiers raccordent 2 moteurs, corridors ENTIERS quelle que soit leur
    // longueur (l'ancien budget-tuiles n'en aurait payé aucun à 2).
    expect(res.engineConnected, "2 chantiers = 2 moteurs raccordés").toBe(2);
    expect(res.engineWorksUsed).toBe(2);
    // Le 3e attend son chantier : proposé avec sa longueur de corridor.
    expect(res.nextEngine).toBeTruthy();
    expect(res.nextEngine.count).toBe(1);
    expect(res.nextEngine.tiles).toBeGreaterThan(1);
    expect(res.nextEngine.targetId).toBe("granaries_city");
  });

  it("raccords en VAGUE : à grande échelle, 1 chantier sert une fraction du manquant", () => {
    const { inp, out, tiles } = runPipeline("scattered", 1, 2, { withRiver: true });
    // Douze moteurs synthétiques : une vague = ceil(12 × 0.25) = 3 moteurs.
    const eng = [];
    for (let gy = 8; gy < 44 && eng.length < 12; gy += 1) {
      for (let gx = 8; gx < 56 && eng.length < 12; gx += 1) {
        const k = gx + "," + gy;
        if (out.roadKey.has(k) || inp.riverSet.has(k)) continue;
        if (!inp.organicLimit(gx, gy, 0)) continue;
        let nearRoad = false;
        for (let dy = -2; dy <= 2 && !nearRoad; dy += 1)
          for (let dx = -2; dx <= 2 && !nearRoad; dx += 1)
            if (out.roadKey.has((gx + dx) + "," + (gy + dy))) nearRoad = true;
        if (nearRoad) continue;
        if (tiles.some((t) => t.gx === gx && t.gy === gy)) continue;
        if (eng.some((e) => Math.abs(e.gx - gx) + Math.abs(e.gy - gy) < 4)) continue;
        eng.push({ gx, gy, type: "engine", buildingId: "granaries_city" });
      }
    }
    expect(eng.length).toBe(12);
    const res = connectBuildingsToNetwork({
      roads: out.roads, roadKey: out.roadKey, roadMeta: out.roadMeta,
      tiles: [...tiles, ...eng], N: inp.N, riverSet: inp.riverSet, bankSet: new Set(),
      claimed: new Set(), engineFootprint: new Set(), occupiedFoot: new Set(),
      engineWorks: 1, connectorRank: "secondary", freeCap: 0,
    });
    // 1 seul chantier : au moins la vague nominale (3), les carves pouvant en
    // relier d'autres au passage — mais jamais tout le monde.
    expect(res.engineWorksUsed).toBe(1);
    expect(res.engineConnected).toBeGreaterThanOrEqual(3);
    expect(res.engineConnected).toBeLessThan(12);
    // La prochaine vague proposée agrège plusieurs corridors.
    expect(res.nextEngine.count).toBeGreaterThanOrEqual(2);
    expect(res.nextEngine.tiles).toBeGreaterThanOrEqual(res.nextEngine.count);
  });

  // Harnais synthétique des élargissements : une ligne droite de rang donné,
  // usage décroissant depuis l'ouest — le contrôle total sur la géométrie que
  // le pipeline organique ne garantit pas (jambes d'escalier 4-7 < MIN_RUN).
  function makeLine({ y = 10, x0 = 4, x1 = 15, rank = "secondary" } = {}) {
    const roads = [], roadKey = new Set(), roadMeta = new Map();
    const use = new Map();
    for (let x = x0; x <= x1; x += 1) {
      const k = x + "," + y;
      roads.push({ gx: x, gy: y });
      roadKey.add(k);
      roadMeta.set(k, { h: true, v: false, rank });
      use.set(k, 100 - x);
    }
    return { roads, roadKey, roadMeta, usage: { use, served: 20 }, y, x0, x1, len: x1 - x0 + 1 };
  }

  it("élargissements : l'échelle monte rue → avenue → boulevard → AUTOROUTE (voie jumelle creusée)", () => {
    const L = makeLine();
    const free = () => true;
    const r = applyRoadWidenings({
      roads: L.roads, roadKey: L.roadKey, roadMeta: L.roadMeta, usage: L.usage,
      riverSet: new Set(), count: 3, cellFree: free
    });
    expect(r.applied).toBe(3);
    // Les cellules d'origine ont fini boulevard…
    for (let x = L.x0; x <= L.x1; x += 1) expect(L.roadMeta.get(x + "," + L.y).rank).toBe("main");
    // …et la voie JUMELLE a été creusée (autoroute 2 tuiles) : mêmes x, rangée
    // adjacente, rang main, axe h, présente dans roads/roadKey.
    let twinRow = null;
    for (const s of [1, -1]) if (L.roadKey.has(L.x0 + "," + (L.y + s))) twinRow = L.y + s;
    expect(twinRow, "voie jumelle creusée").not.toBeNull();
    for (let x = L.x0; x <= L.x1; x += 1) {
      const m = L.roadMeta.get(x + "," + twinRow);
      expect(m && m.rank).toBe("main");
      expect(m.h).toBe(true);
      expect(L.roads.some((c) => c.gx === x && c.gy === twinRow)).toBe(true);
    }
    // L'échelle se clôt : les deux voies se disqualifient mutuellement.
    expect(r.next).toBeNull();
  });

  it("anti-pâté : un tronçon collé à un axe déjà large n'est JAMAIS promu ; un bout court non plus", () => {
    // Deux lignes parallèles collées : la plus empruntée monte, l'autre reste
    // secondary pour toujours (au lieu de fusionner en pâté).
    const L = makeLine({ y: 10 });
    const other = makeLine({ y: 11 });
    for (const c of other.roads) L.roads.push(c);
    for (const k of other.roadKey) L.roadKey.add(k);
    for (const [k, m] of other.roadMeta) L.roadMeta.set(k, m);
    for (const [k, u] of other.usage.use) L.usage.use.set(k, u - 50);   // moins empruntée
    const r = applyRoadWidenings({
      roads: L.roads, roadKey: L.roadKey, roadMeta: L.roadMeta, usage: L.usage,
      riverSet: new Set(), count: 10, cellFree: () => true
    });
    // La ligne 10 monte avenue puis main ; dès « avenue », la ligne 11 est
    // disqualifiée (parallèle large) ET la jumelle de la 10 ne peut se creuser
    // que côté nord (le sud est occupé par la 11).
    expect(r.applied).toBeGreaterThanOrEqual(2);
    for (let x = 4; x <= 15; x += 1) expect(L.roadMeta.get(x + ",11").rank).toBe("secondary");
    // Bout court : une ligne de 4 (< MIN_RUN 6) n'est jamais éligible.
    const S = makeLine({ y: 30, x0: 4, x1: 7 });
    const rs = applyRoadWidenings({
      roads: S.roads, roadKey: S.roadKey, roadMeta: S.roadMeta, usage: S.usage,
      riverSet: new Set(), count: 5, cellFree: () => true
    });
    expect(rs.applied).toBe(0);
    expect(rs.next).toBeNull();
  });

  it("contrat : AUCUN bâtiment servable ne reste sans rue (ville en grille réelle)", async () => {
    // Raph 2026-07-29 : « les routes reliées à TOUS les bâtiments ». L'invariant
    // qui MORD n'est pas un pourcentage global (une jauge par blocs affichait
    // 100 % avec 163 bâtiments sans rue) mais : tout bâtiment qui a une case
    // LIBRE à sa porte finit sur une venelle. Seuls les murés par construction
    // (tous voisins bâtis) sont tolérés. Ville RÉELLE via computeCityLayout —
    // l'ère vient de l'état GLOBAL (currentEraIndex lit state, pas l'argument).
    const { computeCityLayout } = await import("../layout.js");
    const { state, setState, defaultState } = await import("../../core/state.js");
    const { D } = await import("../../core/num.js");
    const s = defaultState();
    s.cycles = 3;
    s.mapSeed = 0x51a7c0de;
    s.population = D("1e25");
    s.infrastructure = D("1e23");
    s.knowledge = D("1e22");
    for (const k of Object.keys(s.buildings)) s.buildings[k] = 40;
    // Budget de chantiers LARGE : on teste la desserte, pas le rationnement (à
    // 15 chantiers il reste normalement une poignée de bâtiments en attente de
    // leur vague — c'est le jeu, pas un défaut).
    s.buildings.roads = 60;
    s.cityArchetype = "capital";
    setState(s);
    const L = computeCityLayout(state);
    expect(L.plan.archetype).toBe("capital");
    const rs = L.roadSet;
    const O4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const touches = (t) => {
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1)
        for (const [dx, dy] of O4) if (rs.has((t.gx + ax + dx) + "," + (t.gy + ay + dy))) return true;
      return false;
    };
    // Occupation réelle : une case est LIBRE si aucun bâtiment, ni eau, ni route.
    const occ = new Set();
    for (const t of L.tiles) {
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) occ.add((t.gx + ax) + "," + (t.gy + ay));
    }
    const water = (L.river && L.river.cells) ? L.river.cells : new Set();
    const N = L.gridN;
    const freeCell = (x, y) => x >= 0 && y >= 0 && x < N && y < N
      && !occ.has(x + "," + y) && !water.has(x + "," + y) && !rs.has(x + "," + y);
    // ATTEIGNABILITÉ calculée ICI, indépendamment du moteur (une garde qui
    // redemande son verdict à l'algorithme testé ne mord pas) : BFS sur les
    // cases LIBRES depuis le réseau. Une case libre au fond d'une cour fermée
    // n'est PAS atteignable — le bâtiment qu'elle dessert est hors-jeu.
    const reach = new Set();
    {
      const q = [];
      for (const k of rs) {
        const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
        for (const [dx, dy] of O4) {
          const nk = (x + dx) + "," + (y + dy);
          if (freeCell(x + dx, y + dy) && !reach.has(nk)) { reach.add(nk); q.push([x + dx, y + dy]); }
        }
      }
      for (let h = 0; h < q.length; h += 1) {
        const [x, y] = q[h];
        for (const [dx, dy] of O4) {
          const nk = (x + dx) + "," + (y + dy);
          if (freeCell(x + dx, y + dy) && !reach.has(nk)) { reach.add(nk); q.push([x + dx, y + dy]); }
        }
      }
    }
    const audit = (types) => {
      let total = 0, onRoad = 0, servableOrphan = 0, walled = 0;
      for (const t of L.tiles) {
        if (!types.includes(t.type)) continue;
        total += 1;
        const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
        let openable = false;
        for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1)
          for (const [dx, dy] of O4) if (reach.has((t.gx + ax + dx) + "," + (t.gy + ay + dy))) openable = true;
        if (touches(t)) onRoad += 1;
        else if (openable) servableOrphan += 1;
        else walled += 1;
      }
      return { total, onRoad, servableOrphan, walled };
    };
    const eng = audit(["engine"]);
    const hou = audit(["house", "enginehome"]);
    expect(eng.total).toBeGreaterThan(300);
    expect(hou.total).toBeGreaterThan(300);
    // L'INVARIANT : personne de servable ne reste sans rue. (Avant le passage à
    // la desserte par bâtiment : 125 moteurs et 31 maisons dans ce cas.)
    expect(eng.servableOrphan, "moteurs servables sans rue").toBe(0);
    // Habitations : même invariant, à la marge des RÉSERVATIONS près (parvis de
    // merveille, emprises claimées) — libres à l'œil du test, interdites à la
    // pioche. Mesuré 8/888 ; le seuil mord bien avant le régime d'avant (31).
    expect(hou.servableOrphan / hou.total, "maisons servables sans rue").toBeLessThan(0.02);
    // Les MURÉS (aucune rue, aucune porte atteignable : entourés de bâtis) sont
    // le cœur des pâtés denses — ils se lisent comme un intérieur d'îlot, pas
    // comme un bâtiment perdu dans un champ. Ils restent minoritaires.
    expect(eng.walled / eng.total).toBeLessThan(0.15);
    expect(hou.walled / hou.total).toBeLessThan(0.15);
    // La couverture PUBLIÉE ne ment plus : elle colle à l'adjacence réelle.
    const cov = L.roadCover;
    expect(cov.engineConnected).toBe(eng.onRoad);
    setState(defaultState());
  }, 60000);

  it("élargissements : zéro chantier = zéro effet, et déterminisme sur le pipeline réel", () => {
    const b = runPipeline("scattered", 1, 1, { withRiver: true });
    const usageB = computeRoadUsage({ roadKey: b.out.roadKey, tiles: b.tiles, coreX: 32, coreY: 26 });
    const r0 = applyRoadWidenings({ roadKey: b.out.roadKey, roadMeta: b.out.roadMeta, usage: usageB, riverSet: b.inp.riverSet, count: 0, cellFree: () => true });
    expect(r0.applied).toBe(0);
    const ranksB = new Set([...b.out.roadMeta.values()].map((m) => m.rank));
    expect(ranksB.has("avenue") || ranksB.has("main")).toBe(false);

    // Déterminisme : mêmes entrées, mêmes promotions (même si rien n'est éligible).
    const a = runPipeline("scattered", 1, 1, { withRiver: true });
    const usageA = computeRoadUsage({ roadKey: a.out.roadKey, tiles: a.tiles, coreX: 32, coreY: 26 });
    applyRoadWidenings({ roadKey: a.out.roadKey, roadMeta: a.out.roadMeta, usage: usageA, riverSet: a.inp.riverSet, count: 2, cellFree: () => true });
    const c1 = runPipeline("scattered", 1, 1, { withRiver: true });
    const uC = computeRoadUsage({ roadKey: c1.out.roadKey, tiles: c1.tiles, coreX: 32, coreY: 26 });
    applyRoadWidenings({ roadKey: c1.out.roadKey, roadMeta: c1.out.roadMeta, usage: uC, riverSet: c1.inp.riverSet, count: 2, cellFree: () => true });
    const dump = (meta) => [...meta.entries()].map(([k, m]) => k + ":" + m.rank).sort().join("|");
    expect(dump(c1.out.roadMeta)).toBe(dump(a.out.roadMeta));
  });
});
