import { describe, it, expect, afterEach } from "vitest";

import { CM } from "../layout.js";
import { dockPorters } from "../iso/boatBerths.js";
import { idlerNow } from "../iso/isoBridge.js";
import { pushTerroirTeams } from "../iso/terroirLife.js";
import { ferryBoardEl, ferryDeckHidden, FERRY_WALK } from "../riverFleet.js";
import { SUMMER, AUTUMN, WINTER } from "../seasonMode.js";

// docs/PLAN-COMPORTEMENTS.md, LOT 5 — « les scènes vivent mieux ». Constats de l'audit
// du 2026-10-04 que ces gardes ferment :
//  · au bac, personne ne montait ni ne descendait (et ceux du pont n'étaient pas ceux
//    qui attendaient) ;
//  · les porteurs allaient au métronome, apparaissaient au bout du ponton, disparaissaient
//    en plein pas, portaient l'amphore à toutes les ères, et n'étaient que des hommes ;
//  · le laboureur labourait le même sillon pour toujours, sa bête sautait de côté à
//    chaque bout, et il labourait la nuit ;
//  · les accoudés des ponts : même ordre partout, figés, présents jour et nuit.

afterEach(() => { CM.nightF = 0; CM.season = AUTUMN; });

describe("lot 5 — les porteurs du ponton", () => {
  const berth = (band = 4) => ({ id: "b", band, pier: { rx: 10, ry: 10, dx: 1, dy: 0, reach: 3, deckZ: 2 } });
  const track = (seed, dwell = Infinity, until = 80, band = 4) => {
    const out = [];
    for (let e = 0; e < until; e += 0.05) out.push({ e, q: dockPorters(berth(band), e, seed, dwell) });
    return out;
  };

  it("leurs haltes changent d'un aller-retour à l'autre (fini le métronome)", () => {
    const halts = [];
    let run = 0;
    for (const { q } of track(7)) {
      const p = q.find((x) => x.k === 0);
      if (p && !p.walking) run += 0.05;
      else if (run > 0) { halts.push(run); run = 0; }
    }
    expect(halts.length).toBeGreaterThan(6);
    expect(Math.max(...halts) - Math.min(...halts)).toBeGreaterThan(0.5);
  });

  it("ils arrivent de la rive en fondu et y sont rentrés avant que le bateau ne largue", () => {
    const tr = track(3, 20, 20);
    const first = tr.find((x) => x.q.length);
    expect(first.q[0].alpha).toBeLessThan(1);
    for (const { e, q } of tr) if (e > 19.4) expect(q.length).toBe(0);
    // Pendant les dernières secondes, ce qui reste en vie marche vers la rive.
    const late = tr.filter((x) => x.e > 16 && x.q.length);
    expect(late.length).toBeGreaterThan(0);
  });

  it("une escale trop courte : personne ne descend (plus de pop)", () => {
    for (let e = 0; e < 2.5; e += 0.1) expect(dockPorters(berth(), e, 1, 2.5)).toEqual([]);
  });

  it("la charge est celle de l'ère, et il y a des porteuses", () => {
    const loadAt = (band) => track(5, Infinity, 20, band).flatMap((x) => x.q)[0].load;
    expect(loadAt(0)).toBe("bundle");
    expect(loadAt(4)).toBe("amphora");
    expect(loadAt(5)).toBe("crate");
    expect(loadAt(8)).toBe("case");
    const types = new Set();
    for (let s = 0; s < 40; s += 1) for (const q of dockPorters(berth(), 30, s)) types.add(q.charType);
    expect([...types].sort()).toEqual([0, 1]);
  });
});

describe("lot 5 — les accoudés des ponts", () => {
  const q = (o = {}) => ({ l: 100, dir: 0, t: 0, cyc: 100, stay: 50, ph: 0, from: 1, night: 0.9, along: [2, 3], ...o });

  it("un habitué arrive en longeant le parapet, s'accoude, repart, puis n'est plus là", () => {
    const a = idlerNow(q(), 1000);
    expect(a.walking).toBe(true);
    expect(a.l).toBeGreaterThan(100);
    expect(a.alpha).toBeLessThan(1);
    const b = idlerNow(q(), 20000);
    expect(b.walking).toBe(false);
    expect(b.l).toBe(100);
    const c = idlerNow(q(), (4.5 + 50 + 2) * 1000);
    expect(c.walking).toBe(true);
    expect(c.l).toBeLessThan(100);
    expect(idlerNow(q(), 80000)).toBe(null);
  });

  it("il jette des regards le long du pont pendant qu'il est accoudé", () => {
    const dirs = new Set();
    for (let t = 5; t < 54; t += 0.2) dirs.add(idlerNow(q(), t * 1000).dir);
    expect(dirs.size).toBeGreaterThan(1);
  });

  it("la nuit, la plupart sont rentrés ; le pêcheur reste à sa ligne", () => {
    CM.nightF = 1;
    expect(idlerNow(q({ night: 0.4 }), 20000)).toBe(null);
    expect(idlerNow(q({ night: 0.95 }), 20000)).not.toBe(null);
    expect(idlerNow(q({ fisher: true, night: 0.1 }), 20000).alpha).toBe(1);
  });
});

describe("lot 5 — le laboureur et les moissonneurs", () => {
  const L = { tiles: [{ buildingId: "irrigated_fields", rural: true, parcel: 0, gx: 10, gy: 10, spanX: 2, spanY: 7 }] };
  const at = (s) => { const it = []; pushTerroirTeams(it, L, 2, s * 1000); return it; };

  it("il change de sillon, souffle au bout, et tourne sans sauter", () => {
    CM.TILE = 32; CM.season = AUTUMN; CM.nightF = 0;
    let prev = null, maxStep = 0, rests = 0;
    const lanes = new Set();
    for (let s = 0; s < 200; s += 0.1) {
      const [it] = at(s);
      const q = it.team;
      if (prev) maxStep = Math.max(maxStep, Math.hypot(q.x - prev.x, q.y - prev.y));
      if (!q.walking) rests += 1;
      if (q.walking && Math.abs(q.uy) > 0.99) lanes.add(q.x.toFixed(2));
      // La bête est devant le laboureur dans le sens de la marche : le cap est unitaire.
      expect(Math.hypot(q.ux, q.uy)).toBeCloseTo(1, 5);
      prev = q;
    }
    expect(maxStep).toBeLessThan(0.1);          // 0,1 s à 0,3 case/s : aucun saut
    expect(rests).toBeGreaterThan(20);
    expect(lanes.size).toBeGreaterThan(1);
  });

  it("le soir il rentre ; l'hiver, personne ; l'été, des moissonneurs et une lieuse", () => {
    CM.TILE = 32; CM.season = AUTUMN; CM.nightF = 0.9;
    expect(at(10)).toEqual([]);
    CM.nightF = 0.4;
    expect(at(10)[0].team.alpha).toBeLessThan(1);
    CM.nightF = 0; CM.season = WINTER;
    expect(at(10)).toEqual([]);
    CM.season = SUMMER;
    expect(at(10).map((i) => i.team.role)).toEqual(["reap", "reap", "bind"]);
  });
});

describe("lot 5 — le bac : monter, descendre", () => {
  it("le pont cuit cache ses voyageurs le temps de la montée, pas plus", () => {
    const sh = { state: "board", boardD: 12, stateT: 11 };
    expect(ferryBoardEl(sh)).toBeCloseTo(1, 5);
    expect(ferryDeckHidden(sh)).toBe(true);
    sh.stateT = 12 - FERRY_WALK.reveal - 0.1;
    expect(ferryDeckHidden(sh)).toBe(false);
    sh._revealAt = 3; sh.stateT = 8;
    expect(ferryDeckHidden(sh)).toBe(false);
    expect(ferryDeckHidden({ state: "cross", stateT: 0 })).toBe(false);
  });
});
