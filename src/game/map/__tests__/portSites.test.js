// LES DEUX PORTS DU XIXe — où ils se posent, et qu'ils ne glissent pas.
//
// Raph, 2026-10-01 : « un port commercial en périphérie de la ville, et un
// plaisancier type port de Marseille » ; choix du soir : dédoublement au XIXe, VRAI
// bassin creusé. docs/PLAN-PORTS.md fait foi. Ces tests gardent :
//   • le bassin touche le fleuve sur toute sa largeur, se tient loin du pont et de
//     l'artère, et sort long et étroit (ouvert par son petit côté, comme le Vieux-Port) ;
//   • le port de commerce se pose en PÉRIPHÉRIE, de préférence en aval et sur la rive
//     nord (ses navires passent devant ses portiques), au bord de l'eau ;
//   • la fiche figée survit au rechargement (normalizeCityCore la reconstruit champ
//     par champ : un champ oublié y disparaîtrait et le port se refonderait ailleurs).
import { describe, it, expect } from "vitest";
import { PORT_SITES, BASIN_NORTH_QUAY, oldPortBasinFor, basinCells, tradePortSiteFor, tradeCells } from "../portSites.js";
import { normalizeCityCore } from "../../core/state.js";

// Un fleuve droit ouest → est, axe y = 40, demi-largeur 3 : rangées d'eau 36 à 43.
const N = 80;
const isWater = (x, y) => Math.abs(y + 0.5 - 40) <= 3.5;
const geo = { N, isWater, riverYAt: () => 40, riverHwAt: () => 3, bridgeX: 40, arteryAx: 40 };

describe("le bassin du Vieux-Port", () => {
  it("touche le fleuve, long et étroit, loin du pont et de l'artère", () => {
    const b = oldPortBasinFor({ ...geo, preferX: 30, free: () => true });
    expect(b).not.toBe(null);
    expect(b.w).toBe(PORT_SITES.basinW);
    expect(b.h).toBe(PORT_SITES.basinD);
    expect(b.h).toBeGreaterThan(b.w);                              // ouvert par son petit côté
    for (let x = b.gx; x < b.gx + b.w; x += 1) {
      expect(isWater(x, b.gy + b.h - 1)).toBe(false);              // le bassin est creusé dans la berge…
      expect(isWater(x, b.gy + b.h)).toBe(true);                   // …et s'ouvre sur le fleuve
    }
    expect(Math.abs(b.gx + b.w / 2 - geo.bridgeX)).toBeGreaterThanOrEqual(PORT_SITES.bridgeGap + b.w / 2 + 1);
  });

  it("préféré au droit de l'ancien port, il s'écarte du pont s'il le faut", () => {
    const b = oldPortBasinFor({ ...geo, preferX: 40, free: () => true });
    expect(Math.abs(b.gx + b.w / 2 - 40)).toBeGreaterThanOrEqual(PORT_SITES.bridgeGap + b.w / 2 + 1);
  });

  it("respecte les cellules interdites (merveilles, Plaisirs)", () => {
    const banned = (x) => x >= 20 && x <= 34;
    const b = oldPortBasinFor({ ...geo, preferX: 27, free: (x) => !banned(x) });
    const { water, quay } = basinCells(b, isWater);
    for (const [x] of water.concat(quay)) expect(banned(x)).toBe(false);
  });

  it("son quai fait deux rangées au nord (la capitainerie) et descend jusqu'au fleuve", () => {
    const b = { gx: 27, gy: 29, w: 5, h: 7 };
    const { quay } = basinCells(b, isWater);
    const k = new Set(quay.map(([x, y]) => x + "," + y));
    for (let r = 1; r <= BASIN_NORTH_QUAY; r += 1) expect(k.has("29," + (29 - r))).toBe(true);
    for (const x of [26, 32]) for (let y = 29; y <= 35; y += 1) expect(k.has(x + "," + y)).toBe(true);
    expect(k.has("26,36")).toBe(false);                            // l'eau du fleuve n'est pas du quai
  });
});

describe("le port de commerce", () => {
  const inCity = (x, y) => Math.hypot(x - 30, y - 30) < 15;
  it("se pose en périphérie, en aval, sur la rive nord, au bord de l'eau", () => {
    const t = tradePortSiteFor({ ...geo, inCity, free: () => true, coreX: 30, downX: 70 });
    expect(t).not.toBe(null);
    expect(t.side).toBe("N");
    expect(t.x0 + t.len / 2).toBeGreaterThan(30);                  // en aval (vers les Plaisirs)
    const cells = tradeCells(t);
    expect(cells.length).toBe(t.len * t.depth);
    const inside = cells.filter(([x, y]) => inCity(x, y)).length;
    expect(inside).toBeLessThanOrEqual(cells.length * PORT_SITES.tradeCityMax);
    for (const [x, y] of cells) expect(isWater(x, y)).toBe(false);
    for (let i = 0; i < t.len; i += 1) expect(isWater(t.x0 + i, t.edge[i] + 1)).toBe(true);   // bord = berge
  });

  it("ne se pose jamais sur une cellule tenue", () => {
    const held = (x) => x >= 44 && x <= 60;
    const t = tradePortSiteFor({ ...geo, inCity, free: (x) => !held(x), coreX: 30, downX: 70 });
    for (const [x] of tradeCells(t)) expect(held(x)).toBe(false);
  });
});

describe("la fiche figée des ports survit au rechargement", () => {
  const base = { seed: 7, dx: 0, dy: -3, bx: 2 };
  it("aller-retour", () => {
    const ports = { old: { dx: -9, dy: -6, w: 5, h: 7 }, trade: { dx: 14, len: 3, side: "N", depth: 4, edge: [4, 5, 4] } };
    const out = normalizeCityCore(JSON.parse(JSON.stringify({ ...base, ports })));
    expect(out.ports).toEqual(ports);
  });
  it("une emprise abîmée est oubliée (elle se refondera)", () => {
    const out = normalizeCityCore({ ...base, ports: { old: { dx: 1, dy: 2, w: 0, h: 7 }, trade: { dx: 1, len: 3, side: "N", depth: 4, edge: [1, 2] } } });
    expect(out.ports).toBeUndefined();
  });
});
