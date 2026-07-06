import { describe, it, expect } from "vitest";

import { cmBuildRoadGraph } from "../layout.js";

// Sanctuarisation du pont central : la traversée la plus proche du cœur
// (river.bridge) doit être TOUJOURS présente, même si une rive n'a encore aucun
// bâtiment — cas où la validation « pont droit » supprimait historiquement tout
// le span (approche vers le vide). Un pont NON central dans le même état reste,
// lui, écarté : on ne teste pas seulement « ça survit », on teste que c'est bien
// l'exemption du pont central qui fait la différence.

// Traversée verticale minimale, colonne `bx` :
//   (bx,0) continuation nord — (bx,1) berge nord — (bx,2) EAU=pont —
//   (bx,3) berge sud — [(bx,4) continuation sud, optionnelle].
// Sans continuation sud, l'atterrissage sud n'a pas de « route derrière » →
// exit sud invalide → span invalidé (sauf s'il est le pont central).
function crossing({ bx = 2, southContinues = false, bridgeX = null } = {}) {
  const cells = [
    { gx: bx, gy: 0 },
    { gx: bx, gy: 1 },
    { gx: bx, gy: 2 },
    { gx: bx, gy: 3 },
  ];
  if (southContinues) cells.push({ gx: bx, gy: 4 });
  const roadSet = new Set(cells.map((c) => c.gx + "," + c.gy));
  const roadMeta = new Map();
  for (const c of cells) roadMeta.set(c.gx + "," + c.gy, { h: false, v: true, rank: "main" });
  const river = {
    isWater: (x, y) => y === 2,
    cells: new Set([bx + ",2"]),
    banks: new Set([bx + ",1", bx + ",3"]),
    bridge: bridgeX == null ? null : { x: bridgeX },
  };
  return { roads: cells.map((c) => ({ ...c })), roadSet, roadMeta, river };
}

function run(cfg) {
  const bx = cfg.bx ?? 2;
  const { roads, roadSet, roadMeta, river } = crossing(cfg);
  // cœur au nord (bx,0) → seed de connectivité côté rive nord.
  const res = cmBuildRoadGraph(roads, roadSet, roadMeta, river, bx, 0);
  const k = bx + ",2";
  return { hasBridge: res.roadSet.has(k), surface: res.roadMap.get(k) && res.roadMap.get(k).roadSurface };
}

describe("pont central — sanctuarisation (toujours présent)", () => {
  it("écarte un pont borgne NON central (rive sud non desservie)", () => {
    // river.bridge sur une autre colonne → la travée x=2 n'est pas protégée.
    expect(run({ bx: 2, southContinues: false, bridgeX: 0 }).hasBridge).toBe(false);
  });

  it("CONSERVE ce même pont borgne quand c'est le pont central", () => {
    const r = run({ bx: 2, southContinues: false, bridgeX: 2 });
    expect(r.hasBridge).toBe(true);
    expect(r.surface).toBe("bridge");
  });

  it("laisse intact un pont normal (deux rives desservies), non protégé", () => {
    const r = run({ bx: 2, southContinues: true, bridgeX: 0 });
    expect(r.hasBridge).toBe(true);
    expect(r.surface).toBe("bridge");
  });

  it("sans fleuve (river.bridge nul) : aucune régression, pas de plantage", () => {
    // pont normal, river.bridge nul → chemin protectedBridgeX===null.
    expect(run({ bx: 2, southContinues: true, bridgeX: null }).hasBridge).toBe(true);
  });
});
