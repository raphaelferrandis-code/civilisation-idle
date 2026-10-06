// LA CIRCULATION DE L'AUTOROUTE RACCORDÉE AUX RUES (retour Raph du 2026-10-06, « les
// voitures disparaissent au bout du bras d'autoroute plutôt que de suivre la route »).
// Le tablier faisait rouler un pur f(now) bouclé sur chaque voie : au pied d'une rampe
// la voiture s'effaçait, une autre naissait sur la rampe d'en face, et chaque boucle de
// l'échangeur faisait naître les siennes en plein tablier. Désormais une voiture qui
// descend entre dans la flotte des rues, là où elle est, et remonte plus loin par une
// rampe d'accès : aucune n'apparaît ni ne disparaît, aucune ne saute.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state } from "../../core/state.js";
import { CM } from "../layout.js";
import { cmSyncRoadFleet } from "../cityMapRuntime.js";
import { updateVehicles, cityMapWalkRoadKey, chooseRoadVehicleType, getVehicleDensity, vehSkinFor } from "../agents.js";
import { planHighway } from "../procedural/highwayPlan.js";
import { updateHighwayTraffic, highwayTrafficLanes, HTR } from "../highwayTraffic.js";
import { highwayActors, HWY } from "../iso/isoHighway.js";

const T = 32, AX = 40;
const wet = (x, y) => y >= 48 && y <= 52;
// Une ville en damier : l'artère du pont (x = 40, 41 : deux voies séparées, reliées
// aux carrefours seulement, comme le cardo), des rues tous les 5 rangs, des rues
// verticales qui ferment les pâtés.
const isRoad = (x, y) => !wet(x, y) && y >= 5 && y <= 95 && ((x === AX || x === AX + 1) || (y % 5 === 0 && x >= 30 && x <= 52) || ((x === 30 || x === 35 || x === 46 || x === 52) && y >= 5));
function city() {
  const roads = [];
  for (let y = 0; y < 100; y += 1) {
    for (let x = 0; x < 100; x += 1) {
      if (!isRoad(x, y)) continue;
      let mask = (isRoad(x, y - 1) ? 1 : 0) | (isRoad(x + 1, y) ? 2 : 0) | (isRoad(x, y + 1) ? 4 : 0) | (isRoad(x - 1, y) ? 8 : 0);
      if ((x === AX || x === AX + 1) && y % 5 !== 0) mask &= 5;   // terre-plein : pas de demi-tour hors carrefour
      roads.push({ gx: x, gy: y, mask, rank: x === AX || x === AX + 1 ? "main" : "secondary" });
    }
  }
  const H = planHighway({ N: 100, ax: AX, cx: 50, cy: 50, isWet: wet, isRoad, inCity: (x, y) => y >= 8 && y <= 92, band: 6 });
  CM.TILE = T;
  CM.layout = { counts: { eraIndex: 30, eraBand: 6, houses: 0 }, roads, roadMap: new Map(roads.map((r) => [r.gx + "," + r.gy, r])), highway: H };
  CM.walkRoadList = roads.slice();
  CM.walkRoadSet = new Set(roads.map((r) => cityMapWalkRoadKey(r.gx, r.gy)));
  CM.wonderWalkSet = new Set();
  return H;
}
// Toutes les voitures de l'autoroute, où qu'elles soient : sur une voie (position
// dessinée) ou dans la flotte des rues (position rendue, file comprise).
function census() {
  const at = new Map();
  for (const l of highwayTrafficLanes() || []) for (const c of l.cars) at.set(c.v, { x: c.x, y: c.y, z: c.z, deck: true });
  for (const v of CM.vehicles) if (v.hwy) at.set(v, { x: v.x + (v._lox || 0) * T, y: v.y + (v._loy || 0) * T, z: 0, deck: false });
  return at;
}

const saved = { ...HTR };
beforeEach(() => {
  state.timeWear = 0; state.instability = 0;
  CM.vehicles = []; CM.cw = 0; CM.collapseAt = null; CM.frameRuined = false; CM.focus = null; CM.fenceWalkBlock = null;
  updateHighwayTraffic(0);   // le plan d'avant (autre test) s'en va
});
afterEach(() => {
  Object.assign(HTR, saved);
  CM.layout = null;
  updateHighwayTraffic(0);
  CM.vehicles = []; CM.walkRoadList = []; CM.walkRoadSet = new Set();
});

describe("l'autoroute raccordée aux rues", () => {
  it("les boucles de l'échangeur roulent dans leur sens : la sortie part de la voie, l'entrée y revient", () => {
    const H = city();
    expect(H && H.interchange, "échangeur").toBeTruthy();
    updateHighwayTraffic(1 / 30);
    const lanes = highwayTrafficLanes();
    const exit = lanes.find((l) => l.kind === "exit"), entry = lanes.find((l) => l.kind === "entry");
    expect(exit && entry).toBeTruthy();
    // La sortie quitte le tablier dans le sens de sa voie et finit dans la rue ; l'entrée
    // part de la rue et rejoint sa voie dans le même sens (elle roulait à contresens).
    const dir = (l, i) => { const a = l.pts[i], b = l.pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y); return [(b.x - a.x) / d, (b.y - a.y) / d]; };
    const main = lanes.find((l) => l.branch && l.branch.lane === exit);
    const mi = Math.max(0, main.cum.findIndex((c) => c >= main.branch.u) - 1);
    const [a1, a2] = dir(exit, 0), [m1, m2] = dir(main, mi);
    expect(a1 * m1 + a2 * m2).toBeGreaterThan(0.7);
    expect(exit.pts[0].z).toBeGreaterThan(T);
    expect(exit.pts[exit.pts.length - 1].z).toBe(0);
    const tgt = entry.merge.lane;
    const ti = Math.max(0, tgt.cum.findIndex((c) => c >= entry.merge.u) - 1);
    const [e1, e2] = dir(entry, entry.pts.length - 2), [t1, t2] = dir(tgt, ti);
    expect(e1 * t1 + e2 * t2).toBeGreaterThan(0.7);
    expect(entry.pts[0].z).toBe(0);
    expect(entry.pts[entry.pts.length - 1].z).toBeGreaterThan(T);
    // Leurs bouts de rue sont des chaussées.
    for (const e of [exit.exit, entry.entry]) expect(CM.walkRoadSet.has(cityMapWalkRoadKey(e.gx, e.gy))).toBe(true);
  });

  it("aucune voiture ne disparaît au bout d'une rampe : elle continue dans la rue, puis remonte — sans un saut", () => {
    city();
    const dt = 1 / 30;
    updateHighwayTraffic(dt);
    let prev = census();
    const n0 = prev.size;
    expect(n0).toBeGreaterThan(20);
    let down = 0, up = 0, maxJump = 0, born = 0, sizes = new Set();
    const cycled = new Set(), wentDown = new Set();
    for (let f = 0; f < 1200; f += 1) {   // 40 s de jeu
      updateVehicles(dt);
      updateHighwayTraffic(dt);
      const now = census();
      sizes.add(now.size);
      for (const [v, p] of now) {
        const q = prev.get(v);
        if (!q) { born += 1; continue; }
        maxJump = Math.max(maxJump, Math.hypot(p.x - q.x, p.y - q.y));
        if (q.deck && !p.deck) { down += 1; wentDown.add(v); }
        if (!q.deck && p.deck) { up += 1; if (wentDown.has(v)) cycled.add(v); }
      }
      prev = now;
    }
    // l'effectif ne bouge pas : personne ne s'efface, personne ne naît
    expect([...sizes]).toEqual([n0]);
    expect(born, "voitures apparues de nulle part").toBe(0);
    // Pas de téléportation : au plus l'allure du tablier sur une frame, plus les fondus
    // de file (quelques dixièmes de pixel).
    expect(maxJump).toBeLessThan(HTR.speed * T * dt * 1.5 + 1);
    // Des voitures descendent dans les rues, d'autres en remontent, et certaines font le
    // tour complet (descendre, rouler en ville, remonter).
    expect(down).toBeGreaterThan(10);
    expect(up).toBeGreaterThan(10);
    expect(cycled.size).toBeGreaterThan(5);
  });

  it("le tablier dessine chacune de ses voitures jusqu'au pied des rampes (plus d'effacement à ras du sol)", () => {
    // C'était le premier temps du bug : isoHighway sautait toute voiture sous 0,12 tuile
    // de haut (« au sol : les voitures du jeu y sont déjà »), elle s'effaçait au bas de
    // la rampe avant même de toucher la rue.
    city();
    const dt = 1 / 30;
    const low = () => (highwayTrafficLanes() || []).some((l) => l.cars.some((c) => c.z < 0.12 * T));
    updateHighwayTraffic(dt);
    for (let f = 0; f < 600 && !low(); f += 1) { updateVehicles(dt); updateHighwayTraffic(dt); }
    expect(low(), "une voiture au bas d'une rampe").toBe(true);
    const keep = { cam: CM.cam, ch: CM.ch, dpr: CM.dpr, lod: CM.lodActive, night: CM.nightF };
    try {
      // tout le plan dans le champ
      CM.cam = { x: AX * T, y: 50 * T, zoom: 0.5 }; CM.cw = CM.ch = 1e6; CM.dpr = 1; CM.lodActive = false; CM.nightF = 0;
      const count = (cars) => { HWY.cars = cars; const out = []; highwayActors(0, out, 0); return out.length; };
      const onDeck = highwayTrafficLanes().reduce((n, l) => n + l.cars.length, 0);
      expect(count(1) - count(0)).toBe(onDeck);
    } finally {
      HWY.cars = 1;
      CM.cam = keep.cam; CM.cw = 0; CM.ch = keep.ch; CM.dpr = keep.dpr; CM.lodActive = keep.lod; CM.nightF = keep.night;
    }
  });

  it("descendue, elle roule sur une chaussée de la flotte, jamais sous une rampe", () => {
    city();
    const dt = 1 / 30;
    updateHighwayTraffic(dt);
    const lanes = highwayTrafficLanes();
    // les cases de l'artère sous les rampes (tablier entre ras du sol et passage libre)
    const under = new Set();
    for (const l of lanes) {
      if (l.kind !== "main") continue;
      for (const p of l.pts) if (p.z > 0.02 * T && p.z < 1.45 * T) under.add(Math.floor(p.y / T));
    }
    // seules les cases des pieds de rampe (au sol) sont permises sur l'artère sous les rampes
    const feet = new Set(lanes.flatMap((l) => [l.entry, l.exit]).filter(Boolean).map((e) => e.gx + "," + e.gy));
    const offRoad = new Set(), underRamp = new Set();
    let seen = 0;
    for (let f = 0; f < 900; f += 1) {
      updateVehicles(dt);
      updateHighwayTraffic(dt);
      for (const v of CM.vehicles) {
        if (!v.hwy) continue;
        seen += 1;
        if (!CM.walkRoadSet.has(cityMapWalkRoadKey(v.gx, v.gy))) offRoad.add(v.gx + "," + v.gy);
        if ((v.gx === AX || v.gx === AX + 1) && under.has(v.gy) && !feet.has(v.gx + "," + v.gy)) underRamp.add(v.gx + "," + v.gy);
      }
    }
    expect(seen).toBeGreaterThan(100);
    expect([...offRoad], "hors chaussée").toEqual([]);
    expect([...underRamp], "sous une rampe").toEqual([]);
  });

  it("la flotte des rues ne les compte ni ne les retire (effectif à part)", () => {
    city();
    updateHighwayTraffic(1 / 30);
    // quelques secondes : des voitures sont descendues en ville
    for (let f = 0; f < 600; f += 1) { updateVehicles(1 / 30); updateHighwayTraffic(1 / 30); }
    const hw = CM.vehicles.filter((v) => v.hwy);
    expect(hw.length).toBeGreaterThan(0);
    const deps = { getVehicleDensity, chooseRoadVehicleType, vehSkinFor };
    cmSyncRoadFleet(CM.layout, 6, deps);
    expect(CM.vehicles.filter((v) => !v.hwy)).toHaveLength(6);
    expect(hw.every((v) => CM.vehicles.includes(v))).toBe(true);
    cmSyncRoadFleet(CM.layout, 2, deps);
    expect(CM.vehicles.filter((v) => !v.hwy)).toHaveLength(2);
    expect(hw.every((v) => CM.vehicles.includes(v))).toBe(true);
  });

  it("ville en ruine : le tablier se vide, et la ville de ses voitures d'autoroute", () => {
    city();
    for (let f = 0; f < 300; f += 1) { updateVehicles(1 / 30); updateHighwayTraffic(1 / 30); }
    expect(CM.vehicles.some((v) => v.hwy)).toBe(true);
    CM.frameRuined = true;
    updateHighwayTraffic(1 / 30);
    expect(highwayTrafficLanes()).toBeNull();
    expect(CM.vehicles.some((v) => v.hwy)).toBe(false);
  });
});
