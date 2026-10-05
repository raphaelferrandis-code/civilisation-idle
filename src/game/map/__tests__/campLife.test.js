import { describe, it, expect, afterEach } from "vitest";

import { computeCityLayout, CAMP_LIFE, CM, TREE_LIFE } from "../layout.js";
import { defaultState, setState } from "../../core/state.js";
import { D } from "../../core/num.js";
import { courOf } from "../iso/isoTissu.js";
import { isoWildForest } from "../iso/isoWildForest.js";
import { ISO_TREE_VARIANTS, TREE_DEAD_VARIANT, TREE_SPRITES, TREE_ADULTS, CITY_TREES, treeAliveVariant, cityTreeVariant } from "../iso/isoGroundProps.js";

// LE CAMPEMENT SE LIT COMME UN LIEU (2026-09-29) — cf. CAMP_LIFE (layout.js).
// Raph : « que tout l'univers soit plus cohérent, et pas juste des éléments
// copiés-collés les uns sur les autres ». Ce qui ne se voit pas à l'œil et que ces
// gardes tiennent, sur 5 graines × 3 populations de camp (bande 0) :
//   1. chaque tente a un sentier à sa porte, et le réseau touche le foyer ;
//   2. aucune maison de RÉSERVE (maison-moteur pré-posée, jamais montrée au camp)
//      — c'étaient elles qui creusaient les sentiers « qui ne mènent nulle part » ;
//   3. les tentes gardent leurs distances (ni collées, ni l'une derrière l'autre) ;
//   4. la terre battue ne couvre que les traces de vie, le reste est du pré ;
//   5. la forêt laisse une clairière autour des sentiers, des tentes et du foyer ;
//   6. le sapin mort n'est ni l'essence vivante qui le remplace hors hiver et hors
//      ruines, ni un arbre de ville (qui prend une essence de son époque).
// Le témoin (CAMP_LIFE coupé) prouve que la garde 1 mord : l'ancien camp laissait
// des tentes sans sentier sur ces mêmes graines.
//
// ⚠ computeCityLayout lit l'ère sur l'état GLOBAL : d'où setState (cf. campHearth).

const GRAINES = [1234567, 987654321, 55555, 204429183, 0x51a7c0de];
const POPS = ["10", "3e4", "3e6"];
const K = (x, y) => x + "," + y;
const O4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Plans MÉMOÏSÉS dans le fichier (audit 2026-10-05, TEST-8) : plusieurs gardes
// relisent les mêmes villes (60 campements pour 20 plans distincts). La clé porte
// les réglages que coupent les témoins (CAMP_LIFE, TREE_LIFE) ; un plan repris
// remet SON état global, comme au premier calcul.
const plans = new Map();
function plan(key, make) {
  const vu = plans.get(key);
  if (vu) { setState(vu.s); return vu.L; }
  const s = make();
  setState(s);
  const L = computeCityLayout(s);
  plans.set(key, { s, L });
  return L;
}
function camp(seed, pop) {
  return plan(`camp|${seed}|${pop}|${CAMP_LIFE.on}`, () => {
    const s = defaultState();
    s.mapSeed = seed;
    s.population = D(pop);
    return s;
  });
}
const tentesSansSentier = (L) => L.tiles.filter((t) => t.type === "house"
  && !O4.some(([dx, dy]) => L.roadSet.has(K(t.gx + dx, t.gy + dy))));
// Cellules de vie : sentiers terrestres, emprises bâties, carré du foyer.
function vie(L) {
  const s = new Set();
  const eau = L.river && L.river.cells;
  for (const k of L.roadSet) if (!(eau && eau.has(k))) s.add(k);
  for (const t of L.tiles) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) s.add(K(t.gx + ax, t.gy + ay));
  }
  const h = L.campHearth;
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) s.add(K(h.gx + dx, h.gy + dy));
  return s;
}

afterEach(() => {
  CAMP_LIFE.on = true;
  CM._isoWildForest = null;
  setState(defaultState());
});

describe("le campement se lit comme un lieu", () => {
  it("chaque tente a son sentier, sans maison de réserve, et le réseau touche le foyer", () => {
    for (const pop of POPS) for (const seed of GRAINES) {
      const L = camp(seed, pop);
      const cas = `pop ${pop}, graine ${seed}`;
      expect(L.counts.eraBand, cas).toBe(0);
      expect(L.tiles.filter((t) => t.type === "enginehome").length, `${cas} : maison de réserve`).toBe(0);
      expect(tentesSansSentier(L).map((t) => K(t.gx, t.gy)), `${cas} : tente sans sentier`).toEqual([]);
      const h = L.campHearth;
      let auFeu = false;
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) if (L.roadSet.has(K(h.gx + dx, h.gy + dy))) auFeu = true;
      expect(auFeu, `${cas} : aucun sentier n'arrive au foyer`).toBe(true);
    }
  });

  it("témoin : sans CAMP_LIFE, l'ancien camp laisse des tentes sans sentier (la garde mord)", () => {
    CAMP_LIFE.on = false;
    let orphelines = 0;
    for (const seed of GRAINES) orphelines += tentesSansSentier(camp(seed, "10")).length;
    expect(orphelines).toBeGreaterThan(0);
  });

  it("les tentes gardent leurs distances : ni losanges qui se touchent, ni l'une derrière l'autre", () => {
    const INTERDITES = [[1, 0], [0, 1], [1, 1]];   // + leurs opposées, par symétrie du test
    for (const pop of POPS) for (const seed of GRAINES) {
      const L = camp(seed, pop);
      const tentes = new Set(L.tiles.filter((t) => t.type === "house").map((t) => K(t.gx, t.gy)));
      for (const k of tentes) {
        const [x, y] = k.split(",").map(Number);
        for (const [dx, dy] of INTERDITES) {
          expect(tentes.has(K(x + dx, y + dy)), `pop ${pop}, graine ${seed} : tentes ${k} et ${K(x + dx, y + dy)} collées`).toBe(false);
        }
      }
    }
  });

  it("aucune tente ne se plante sur une tête du pont", () => {
    for (const pop of POPS) for (const seed of GRAINES) {
      const L = camp(seed, pop);
      const bx = Math.round(L.river.bridge.x);
      let wy0 = Infinity, wy1 = -Infinity;
      for (const k of L.river.cells) {
        const [x, y] = k.split(",").map(Number);
        if (x === bx) { wy0 = Math.min(wy0, y); wy1 = Math.max(wy1, y); }
      }
      // Exigée (audit 2026-10-05, TEST-13) : un `continue` muet sautait le cas.
      expect(wy1 >= wy0, `pop ${pop}, graine ${seed} : pas de colonne d'eau au pont (colonne ${bx})`).toBe(true);
      for (const t of L.tiles) {
        if (t.type !== "house") continue;
        const tete = t.gx >= bx - 2 && t.gx <= bx + 2
          && ((t.gy >= wy0 - 3 && t.gy < wy0) || (t.gy > wy1 && t.gy <= wy1 + 3));
        expect(tete, `pop ${pop}, graine ${seed} : tente ${K(t.gx, t.gy)} sur la tête du pont (colonne ${bx})`).toBe(false);
      }
    }
  });

  it("la terre battue ne couvre que les traces de vie ; le reste de l'emprise est du pré", () => {
    for (const seed of GRAINES) {
      const L = camp(seed, "3e4");
      const f = courOf(L);
      expect(f.camp, `graine ${seed} : pas de champ de camp`).toBe(true);
      const h = L.campHearth;
      const tentes = new Set(L.tiles.filter((t) => t.type === "house").map((t) => K(t.gx, t.gy)));
      let pre = 0;
      for (const [k, v] of f) {
        if (v === "grass") { pre += 1; continue; }
        const [x, y] = k.split(",").map(Number);
        const pres = Math.hypot(x + 0.5 - (h.gx + 0.5), y + 0.5 - (h.gy + 0.5)) <= 2.3;
        expect(tentes.has(k) || L.roadSet.has(k) || pres, `graine ${seed} : terre battue sans raison en ${k}`).toBe(true);
      }
      for (const k of tentes) expect(f.get(k), `graine ${seed} : tente ${k} hors terre battue`).toBe("urban");
      // Le camp est une clairière : l'ancienne nappe de terre est redevenue du pré.
      expect(pre / f.size, `graine ${seed} : part de pré`).toBeGreaterThan(0.3);
    }
  });

  it("la forêt laisse une clairière autour des sentiers, des tentes et du foyer", () => {
    for (const seed of GRAINES) {
      const L = camp(seed, "3e4");
      CM._isoWildForest = null;
      const N = L.gridN;
      const arbres = isoWildForest(L, { gx0: 0, gx1: N - 1, gy0: 0, gy1: N - 1 });
      const v = vie(L);
      expect(arbres.length, `graine ${seed} : pas de forêt`).toBeGreaterThan(0);
      // Les fautifs d'abord, puis UN expect (un par cellule coûtait cher, TEST-8).
      const R = TREE_LIFE.clear;
      const proches = arbres.filter((a) => pres(v, a.gx, a.gy, R)).map((a) => K(a.gx, a.gy));
      expect(proches, `graine ${seed} : arbres à moins de ${R + 1} cellules d'une trace de vie`).toEqual([]);
      // Plus d'arbres « de ville » au camp : la forêt sauvage replante seule.
      expect((L.trees || []).length, `graine ${seed} : arbres de ville au camp`).toBe(0);
    }
  });
});

// ── Toutes les ères (Raph, 2026-09-29 : « applique tout ça à toutes les ères ») ──
function ville(seed, pop, bld) {
  return plan(`ville|${seed}|${pop}|${bld}|${CAMP_LIFE.on}|${TREE_LIFE.on}`, () => {
    const s = defaultState();
    s.mapSeed = seed;
    s.population = D(pop); s.knowledge = D(pop); s.infrastructure = D(pop);
    for (const k of Object.keys(s.buildings)) s.buildings[k] = bld;
    return s;
  });
}
// Distance de Chebyshev à la vie la plus proche (routes, emprises), bornée à R.
function pres(v, gx, gy, R) {
  for (let dx = -R; dx <= R; dx += 1) for (let dy = -R; dy <= R; dy += 1) if (v.has(K(gx + dx, gy + dy))) return true;
  return false;
}
function vieVille(L, routes = true) {
  const s = new Set();
  const eau = L.river && L.river.cells;
  if (routes) for (const k of L.roadSet) if (!(eau && eau.has(k))) s.add(k);
  for (const t of L.tiles) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) s.add(K(t.gx + ax, t.gy + ay));
  }
  return s;
}

describe("le village de huttes (bande 1) garde son feu", () => {
  it("le foyer reste au cœur, rien n'y est bâti, les sentiers le rejoignent, et la forêt replante l'emprise", () => {
    for (const seed of GRAINES) {
      const L = ville(seed, "1e8", 6);
      const cas = `graine ${seed}`;
      expect(L.counts.eraBand, cas).toBe(1);
      const h = L.campHearth;
      expect(h, `${cas} : pas de foyer au village`).toBeTruthy();
      let auFeu = false;
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
        const k = K(h.gx + dx, h.gy + dy);
        if (L.roadSet.has(k)) auFeu = true;
        for (const t of L.tiles) {
          const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
          const dedans = h.gx + dx >= t.gx && h.gx + dx < t.gx + sx && h.gy + dy >= t.gy && h.gy + dy < t.gy + sy;
          expect(dedans, `${cas} : ${t.type} dans le foyer`).toBe(false);
        }
      }
      expect(auFeu, `${cas} : aucun sentier au foyer`).toBe(true);
      expect(courOf(L).camp, `${cas} : le sol du village ne suit pas la vie`).toBe(true);
      expect((L.trees || []).length, `${cas} : arbres de ville au village`).toBe(0);
    }
  });
});

describe("à toutes les ères, aucune habitation sur une tête du pont", () => {
  // Douze villes complètes (4 ères × 3 graines), que la garde des arbres reprend en
  // partie (plans mémoïsés). Le délai global de vite.config.js est fait pour la CI.
  it("bandes 1 à 4 : les têtes du pont restent libres", () => {
    for (const [pop, bld] of [["1e8", 6], ["1e13", 12], ["1e18", 20], ["1e23", 28]]) {
      for (const seed of GRAINES.slice(0, 3)) {
        const L = ville(seed, pop, bld);
        const bx = Math.round(L.river.bridge.x);
        let wy0 = Infinity, wy1 = -Infinity;
        for (const k of L.river.cells) {
          const [x, y] = k.split(",").map(Number);
          if (x === bx) { wy0 = Math.min(wy0, y); wy1 = Math.max(wy1, y); }
        }
        // Exigée (audit 2026-10-05, TEST-13) : un `continue` muet sautait la ville.
        expect(wy1 >= wy0, `bande ${L.counts.eraBand}, graine ${seed} : pas de colonne d'eau au pont (colonne ${bx})`).toBe(true);
        for (const t of L.tiles) {
          if (t.type !== "house" && t.type !== "enginehome") continue;
          const tete = t.gx >= bx - 2 && t.gx <= bx + 2
            && ((t.gy >= wy0 - 3 && t.gy < wy0) || (t.gy > wy1 && t.gy <= wy1 + 3));
          expect(tete, `bande ${L.counts.eraBand}, graine ${seed} : ${t.variant} ${K(t.gx, t.gy)} sur la tête du pont (colonne ${bx})`).toBe(false);
        }
      }
    }
  });
});

describe("en ville, les arbres ne se collent pas aux maisons (TREE_LIFE)", () => {
  const CAS = [["1e13", 12], ["1e18", 20], ["1e23", 28]];   // bandes 2, 3, 4
  afterEach(() => { TREE_LIFE.on = true; });

  it("arbre de ville : jamais contre un bâtiment ; forêt : à plus de clear cellules d'une route ou d'un bâtiment", () => {
    for (const [pop, bld] of CAS) for (const seed of GRAINES.slice(0, 3)) {
      const L = ville(seed, pop, bld);
      const cas = `bande ${L.counts.eraBand}, graine ${seed}`;
      expect(L.counts.eraBand, cas).toBeGreaterThanOrEqual(2);
      const v = vieVille(L), bati = vieVille(L, false), R = TREE_LIFE.clear;
      expect((L.trees || []).length, `${cas} : plus aucun arbre de ville`).toBeGreaterThan(0);
      const contre = L.trees.filter((t) => pres(bati, t.gx, t.gy, TREE_LIFE.cityClear)).map((t) => K(t.gx, t.gy));
      expect(contre, `${cas} : arbres de ville contre un bâtiment`).toEqual([]);
      CM._isoWildForest = null;
      const N = L.gridN;
      const foret = isoWildForest(L, { gx0: -6, gx1: N + 5, gy0: -6, gy1: N + 5 });
      expect(foret.filter((a) => pres(v, a.gx, a.gy, R)).map((a) => K(a.gx, a.gy)), `${cas} : arbres de forêt contre la vie`).toEqual([]);
    }
  });

  it("témoin : règle coupée, des arbres de ville touchent des maisons (la garde mord)", () => {
    TREE_LIFE.on = false;
    let contre = 0;
    for (const [pop, bld] of CAS) {
      const L = ville(GRAINES[0], pop, bld);
      const bati = vieVille(L, false);
      for (const t of L.trees) if (pres(bati, t.gx, t.gy, TREE_LIFE.cityClear)) contre += 1;
    }
    expect(contre).toBeGreaterThan(0);
  });
});

describe("le sapin mort", () => {
  // Les arbres de ville passent par cityTreeVariant (isoLivePaint) : l'essence de
  // CITY_TREES de leur bande ; sans essence de ville (camp, village), une essence
  // vivante de la forêt. L'ancien tirage « un sur quatre » (treeBaseVariant) n'a
  // plus d'appelant (audit 2026-10-05, TEST-10).
  it("n'est jamais l'essence vivante qui le remplace, ni un arbre de ville", () => {
    const fautes = [];
    for (let gx = 0; gx < 60; gx += 1) for (let gy = 0; gy < 60; gy += 1) {
      const a = treeAliveVariant(gx, gy);
      if (!(a >= 1 && a <= ISO_TREE_VARIANTS) || a === TREE_DEAD_VARIANT) fautes.push(`vivant ${K(gx, gy)} : ${a}`);
      // Une bande au-delà de la table : bornée à la dernière.
      for (let band = 0; band <= CITY_TREES.length; band += 1) {
        const v = cityTreeVariant(gx, gy, band), t = TREE_SPRITES[v];
        const mix = CITY_TREES[Math.min(band, CITY_TREES.length - 1)];
        const ok = v !== TREE_DEAD_VARIANT && t && (mix ? mix.some(([sp]) => sp === t.sp) : TREE_ADULTS.includes(v));
        if (!ok) fautes.push(`ville bande ${band} ${K(gx, gy)} : ${v}`);
      }
    }
    expect(fautes.length, fautes.slice(0, 5).join(" ; ")).toBe(0);
  });
});
