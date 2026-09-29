import { describe, it, expect, afterEach } from "vitest";

import { computeCityLayout, CAMP_LIFE, CM } from "../layout.js";
import { defaultState, setState } from "../../core/state.js";
import { D } from "../../core/num.js";
import { courOf } from "../iso/isoTissu.js";
import { isoWildForest, CAMP_LIFE_CLEAR } from "../iso/isoWildForest.js";
import { ISO_TREE_VARIANTS, TREE_DEAD_VARIANT, treeAliveVariant, treeBaseVariant } from "../iso/isoGroundProps.js";

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
//   6. le sapin mort ne sort qu'en hiver et dans les ruines.
// Le témoin (CAMP_LIFE coupé) prouve que la garde 1 mord : l'ancien camp laissait
// des tentes sans sentier sur ces mêmes graines.
//
// ⚠ computeCityLayout lit l'ère sur l'état GLOBAL : d'où setState (cf. campHearth).

const GRAINES = [1234567, 987654321, 55555, 204429183, 0x51a7c0de];
const POPS = ["10", "3e4", "3e6"];
const K = (x, y) => x + "," + y;
const O4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function camp(seed, pop) {
  const s = defaultState();
  s.mapSeed = seed;
  s.population = D(pop);
  setState(s);
  return computeCityLayout(s);
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
      if (!(wy1 >= wy0)) continue;
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
      for (const a of arbres) {
        const R = CAMP_LIFE_CLEAR;
        for (let dx = -R; dx <= R; dx += 1) for (let dy = -R; dy <= R; dy += 1) {
          expect(v.has(K(a.gx + dx, a.gy + dy)), `graine ${seed} : arbre ${K(a.gx, a.gy)} à moins de ${R + 1} cellules d'une trace de vie`).toBe(false);
        }
      }
      // Plus d'arbres « de ville » au camp : la forêt sauvage replante seule.
      expect((L.trees || []).length, `graine ${seed} : arbres de ville au camp`).toBe(0);
    }
  });
});

describe("le sapin mort", () => {
  it("n'est jamais une essence vivante, et reste un arbre sur quatre environ", () => {
    let morts = 0, n = 0;
    for (let gx = 0; gx < 60; gx += 1) for (let gy = 0; gy < 60; gy += 1) {
      const a = treeAliveVariant(gx, gy);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(ISO_TREE_VARIANTS);
      expect(a).not.toBe(TREE_DEAD_VARIANT);
      if (treeBaseVariant(gx, gy) === TREE_DEAD_VARIANT) morts += 1;
      n += 1;
    }
    expect(morts / n).toBeGreaterThan(0.15);
    expect(morts / n).toBeLessThan(0.35);
  });
});
