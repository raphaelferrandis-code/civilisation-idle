// LE BORD DU MONDE : le fleuve prolongé à l'écran, et le fond d'herbe.
//
// Capture de Raph (2026-09-29) : « pourquoi mon bout de fleuve est comme ça ? et
// pourquoi l'herbe ne charge pas ? ». Le ruban s'arrêtait net à cx ± 1,8 N, et au-
// delà du rectangle cuit le sol n'était qu'un aplat. Ces tests gardent la
// géométrie de la correction — ce qui casserait EN SILENCE :
//   • une rallonge qui déplace le fleuve du layout (îles, quais, bateaux s'y
//     réfèrent par index) ;
//   • une onde dont l'origine recule avec la rallonge (le ressac du ruban
//     décollerait du liseré que les autres couches tracent sur le fleuve seul) ;
//   • un bateau qui s'évapore en pleine eau au lieu de s'effacer ;
//   • un motif d'herbe qui ne se répète pas exactement (une couture tous les
//     8 losanges) ;
//   • la grève des extrémités, qui ne peut plus être peinte qu'à moitié.
import { describe, it, expect, beforeEach } from "vitest";

import {
  riverExtensionLength, riverViewRadius, extendRiverSamples, extendRiverRuns, riverArc,
} from "../iso/isoRiver.js";
import { riverEndRays, nearRiverEndRay } from "../iso/riverEnds.js";
import { shipAlpha, FLEET_TUNE } from "../riverFleet.js";
import { wildBackdropCells, WILD_BACKDROP_PERIOD } from "../iso/isoWildBackdrop.js";
import { ensureQuayGate, quayWallTune } from "../quaysAndRiot.js";
import { CM } from "../layout.js";

// Un petit fleuve en ligne brisée, samples espacés d'1,5 cellule comme le layout.
const river = (n = 20) => Array.from({ length: n }, (_, i) => ({ x: i * 1.5, y: 10 + Math.sin(i / 4) * 2, hw: 2 + (i % 3) * 0.1 }));

describe("prolongement — géométrie", () => {
  it("la rallonge sort exactement du disque de la vue", () => {
    // Bout à l'origine, axe +x, vue centrée en (10, 0) de rayon 4 : il faut aller
    // jusqu'à x = 14.
    expect(riverExtensionLength({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 0 }, 4)).toBeCloseTo(14, 9);
    // Vue derrière le bout : rien à prolonger.
    expect(riverExtensionLength({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -10, y: 0 }, 4)).toBe(0);
    // Demi-droite qui passe à côté de la vue : rien non plus.
    expect(riverExtensionLength({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 9 }, 4)).toBe(0);
  });

  it("le rayon de vue contient les quatre coins de l'écran", () => {
    const cw = 1600, ch = 900, z = 0.5, T = 32;
    const R = riverViewRadius(cw, ch, z, T);
    // Coin d'écran → monde (projection iso : a = dx − dy, b = dx + dy).
    for (const [sx, sy] of [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [-cw / 2, ch / 2], [cw / 2, ch / 2]]) {
      const a = sx / z, b = sy / (0.5 * z);
      const dx = (a + b) / 2, dy = (b - a) / 2;
      expect(Math.hypot(dx, dy) / T).toBeLessThanOrEqual(R + 1e-9);
    }
  });

  it("le fleuve du layout est gardé à l'identique, au milieu du tableau rallongé", () => {
    const core = river();
    const ext = extendRiverSamples(core, 16, 32);
    expect(ext.length).toBe(core.length + 48);
    expect(ext.core0).toBe(16);
    expect(ext.core1).toBe(16 + core.length - 1);
    for (let i = 0; i < core.length; i += 1) expect(ext[16 + i]).toBe(core[i]);
  });

  it("les rallonges sont dans l'axe du dernier segment, au pas du bout", () => {
    const core = river();
    const ext = extendRiverSamples(core, 8, 8);
    const [h, e] = riverEndRays(core);
    for (let k = 1; k <= 8; k += 1) {
      const up = ext[8 - k], dn = ext[ext.core1 + k];
      expect(up.x).toBeCloseTo(h.x + h.ux * h.step * k, 9);
      expect(up.y).toBeCloseTo(h.y + h.uy * h.step * k, 9);
      expect(dn.x).toBeCloseTo(e.x + e.ux * e.step * k, 9);
      expect(dn.y).toBeCloseTo(e.y + e.uy * e.step * k, 9);
    }
  });

  it("sans rallonge, c'est le tableau du layout lui-même (rien ne change, rien ne coûte)", () => {
    const core = river();
    expect(extendRiverSamples(core, 0, 0)).toBe(core);
  });

  it("l'onde garde son origine au premier sample du VRAI fleuve", () => {
    const core = river();
    const ext = extendRiverSamples(core, 16, 16);
    const a0 = riverArc(core), a1 = riverArc(ext);
    for (let i = 0; i < core.length; i += 1) expect(a1[16 + i]).toBeCloseTo(a0[i], 9);
    for (let i = 0; i < 16; i += 1) expect(a1[i]).toBeLessThan(0);
  });

  it("les tronçons de berge se reportent sur le tableau rallongé, rallonges comprises", () => {
    // Fleuve de 10 samples, relais sur [0,2] et [7,9] (bouts sans quai), 4 samples
    // de rallonge de chaque côté : les rallonges prolongent les tronçons des bouts.
    expect(extendRiverRuns([[0, 2], [7, 9]], 4, 10, 18)).toEqual([[0, 6], [11, 17]]);
    // Quai jusqu'aux bouts : les rallonges ouvrent leur propre tronçon.
    expect(extendRiverRuns([[4, 5]], 4, 10, 18)).toEqual([[0, 4], [8, 9], [13, 17]]);
    // Rien à reporter sans rallonge.
    const runs = [[1, 3]];
    expect(extendRiverRuns(runs, 0, 10, 10)).toBe(runs);
  });

  it("la forêt reconnaît l'eau des rallonges, et seulement au-delà des bouts", () => {
    const core = river();
    const rays = riverEndRays(core);
    const [h, e] = rays;
    // Sur l'axe, loin au-delà du bout aval : de l'eau.
    expect(nearRiverEndRay(rays, e.x + e.ux * 30, e.y + e.uy * 30, 1.4)).toBe(true);
    // Sur l'axe prolongé mais EN DEÇÀ du bout amont (dans le vrai fleuve) : pas
    // l'affaire des rallonges.
    expect(nearRiverEndRay([h], h.x - h.ux * 3, h.y - h.uy * 3, 1.4)).toBe(false);
    // À côté de la rallonge, au-delà de la berge : de l'herbe.
    expect(nearRiverEndRay(rays, e.x + e.ux * 30 - e.uy * (e.hw + 3), e.y + e.uy * 30 + e.ux * (e.hw + 3), 1.4)).toBe(false);
  });
});

describe("prolongement — les bateaux s'effacent au lieu de s'évaporer", () => {
  const sh = (t, dir, extra = {}) => ({ t, dir, speed: 0.01, fade: 1, ...extra });

  it("en plein fleuve, pleine opacité", () => {
    expect(shipAlpha(sh(0.5, 1))).toBe(1);
  });

  it("à l'approche de la borne de sortie, l'opacité tombe à zéro", () => {
    // T_HI = 1,015 ; un pas de fondu = speed × fadeIn.
    const w = 0.01 * FLEET_TUNE.fadeIn;
    expect(shipAlpha(sh(1.015, 1))).toBe(0);
    expect(shipAlpha(sh(1.015 - w / 2, 1))).toBeCloseTo(0.5, 6);
    expect(shipAlpha(sh(-0.015, -1))).toBe(0);
  });

  it("le fondu d'entrée n'est pas écrasé par celui de sortie", () => {
    expect(shipAlpha(sh(0.5, 1, { fade: 0.3 }))).toBeCloseTo(0.3, 9);
  });

  it("un pêcheur à l'arrêt ou en orbite ne s'efface pas", () => {
    expect(shipAlpha(sh(0.5, 1, { speed: 0 }))).toBe(1);
    expect(shipAlpha(sh(1.01, 1, { orbit: { ang: 0 } }))).toBe(1);
  });
});

describe("fond d'herbe — un motif qui se répète sans couture", () => {
  const P = WILD_BACKDROP_PERIOD;
  const cells = wildBackdropCells();

  it("chaque cellule ne dépend que de sa position dans la période", () => {
    for (const c of cells) {
      expect(c.mi).toBe(((c.i % P) + P) % P);
      expect(c.mj).toBe(((c.j % P) + P) % P);
    }
  });

  it("le rectangle du motif est entièrement couvert de losanges", () => {
    // En unités de demi-losange (hw = 1, hh = 1/2) : le rectangle fait 2P × P.
    // Un point y est couvert si l'une des cellules le contient.
    const inside = (px, py, i, j) => {
      const cx = i - j, cy = (i + j) / 2 + 0.5;     // centre du losange (coin nord + hh)
      return Math.abs(px - cx) + 2 * Math.abs(py - cy) <= 1 + 1e-9;
    };
    for (let py = 0.05; py < P; py += 0.25) {
      for (let px = 0.05; px < 2 * P; px += 0.25) {
        expect(cells.some((c) => inside(px, py, c.i, c.j)), `(${px}, ${py}) sans losange`).toBe(true);
      }
    }
  });

  it("les cellules sont peintes du nord au sud (les brins débordent vers le nord)", () => {
    for (let k = 1; k < cells.length; k += 1) {
      expect(cells[k].i + cells[k].j).toBeGreaterThanOrEqual(cells[k - 1].i + cells[k - 1].j);
    }
  });
});

describe("grève — plus de sable aux extrémités", () => {
  let saved;
  beforeEach(() => {
    saved = { layout: CM.layout, at: CM.layoutRecomputeAt, gate: CM.quayGate, full: quayWallTune.full };
    return () => {
      CM.layout = saved.layout; CM.layoutRecomputeAt = saved.at; CM.quayGate = saved.gate; quayWallTune.full = saved.full;
    };
  });

  it("les points de brèche ne comptent plus les 3 premiers et 3 derniers samples", () => {
    quayWallTune.full = true;
    const samples = river(30);
    samples[15].hw = 1.2;             // un passage trop étroit pour un mur : il reste une brèche
    CM.layout = { river: { present: true, samples }, roadSet: new Set(), tiles: [] };
    CM.layoutRecomputeAt = 'test-bouts-' + Math.random();
    CM.quayGate = null;
    ensureQuayGate();
    const g = CM.quayGate;
    // Le quai garde son bout carré aux extrémités…
    for (const i of [0, 1, 2, 27, 28, 29]) expect(g.naturalOff[i]).toBe(1);
    // …mais la grève n'y est plus : seul le passage étroit reste une brèche.
    expect(g.gapPts).toEqual([{ x: samples[15].x, y: samples[15].y }]);
  });
});
