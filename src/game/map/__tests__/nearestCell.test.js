"use strict";
// REMAP DES PASSANTS HORS RÉSEAU (PERF-43, audit du 2026-10-05). Un passant dont la
// case a disparu au recalcul du plan cherchait la route survivante la plus proche en
// parcourant TOUTE la liste : 43 ms pour 1 000 passants sur 4 576 cases. nearestCell
// (citizenRoute.js) cherche par seaux — et doit rendre EXACTEMENT la même case,
// égalités comprises (la première de la liste), sinon des passants changeraient de rue.
import { describe, it, expect } from "vitest";
import { nearestCell } from "../citizenRoute.js";

// Le balayage d'origine (agents.js, updateCitizens / vehicleRemap).
function scan(list, gx, gy, skip = null) {
  let r = null, bestD = Infinity;
  for (const c of list) {
    if (skip && skip(c)) continue;
    const d = (c.gx - gx) * (c.gx - gx) + (c.gy - gy) * (c.gy - gy);
    if (d < bestD) { bestD = d; r = c; }
  }
  return r;
}
// Aléa à graine (mulberry32) : un échec se rejoue.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Grille de rues tous les 4 cases (la ville du banc de l'audit), ordre de balayage.
function streetGrid(N, x0 = 0, y0 = 0) {
  const list = [];
  for (let gy = 0; gy <= N; gy += 1) for (let gx = 0; gx <= N; gx += 1) {
    if (gx % 4 && gy % 4) continue;
    list.push({ gx: gx + x0, gy: gy + y0, rank: (gx + gy) % 9 === 0 ? "plaza" : "secondary" });
  }
  return list;
}

describe("nearestCell : la case du balayage linéaire, sans le balayage", () => {
  it("même case que le balayage, égalités comprises, partout autour de la grille", () => {
    const list = streetGrid(100);
    const rand = rng(7);
    for (let n = 0; n < 3000; n += 1) {
      // dans la ville, sur ses bords, et loin dehors (ville rasée, case lointaine)
      const gx = Math.floor(rand() * 180) - 40, gy = Math.floor(rand() * 180) - 40;
      expect(nearestCell(list, gx, gy)).toBe(scan(list, gx, gy));
    }
  });

  it("les égalités se tranchent par l'ordre de la liste, quel qu'il soit", () => {
    // Cible au centre d'un carré de rues : 4 cases à égale distance, liste mélangée.
    const rand = rng(11);
    const list = streetGrid(40).sort(() => rand() - 0.5);
    for (const [gx, gy] of [[2, 2], [6, 6], [10, 14], [22, 2], [38, 38]]) {
      const got = nearestCell(list, gx, gy);
      expect(got).toBe(scan(list, gx, gy));
    }
  });

  it("cases exclues (véhicule : ni esplanade) et coordonnées négatives", () => {
    const list = streetGrid(60, -30, -25);
    const skip = (c) => c.rank === "plaza";
    const rand = rng(3);
    for (let n = 0; n < 1500; n += 1) {
      const gx = Math.floor(rand() * 120) - 60, gy = Math.floor(rand() * 120) - 60;
      expect(nearestCell(list, gx, gy, skip)).toBe(scan(list, gx, gy, skip));
    }
    // Tout exclu : rien (le véhicule reste où il est, comme avant).
    expect(nearestCell(list, 3, 3, () => true)).toBe(null);
    expect(nearestCell([], 3, 3)).toBe(null);
  });

  it("recherche LOCALE : quelques dizaines de cases examinées, pas toute la liste", () => {
    const list = streetGrid(150);          // 150×150 cases, rues tous les 4 : ~11 000 cases
    let seen = 0;
    const count = () => { seen += 1; return false; };
    const rand = rng(5);
    const Q = 1000;
    for (let n = 0; n < Q; n += 1) nearestCell(list, Math.floor(rand() * 150), Math.floor(rand() * 150), count);
    // `skip` n'est appelé que pour une case au moins aussi proche que la meilleure :
    // c'est un majorant du travail utile, borné bien sous la taille de la liste.
    expect(seen / Q).toBeLessThan(40);
    expect(list.length).toBeGreaterThan(10000);
  });

  it("une nouvelle liste (recalcul du plan) a sa propre grille", () => {
    const a = streetGrid(20);
    expect(nearestCell(a, 1, 1)).toBe(scan(a, 1, 1));
    const b = a.map((c) => ({ gx: c.gx, gy: c.gy + 1 }));   // tout le plan décalé d'une case
    expect(nearestCell(b, 1, 1)).toBe(scan(b, 1, 1));
    // Une case ajoutée après coup (anneau du foyer) est vue.
    a.push({ gx: 1, gy: 2 });
    expect(nearestCell(a, 1, 2)).toBe(a[a.length - 1]);
  });
});
