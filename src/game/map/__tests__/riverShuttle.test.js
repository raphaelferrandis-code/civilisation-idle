// LA NAVETTE DES PLAISIRS (docs/PLAN-BATEAUX.md §8) : un bateau-lanterne fait
// l'aller-retour entre son ponton en ville et l'embarcadère de la Maison, au pied de
// son escalier — surtout la nuit. Elle navigue avec les autres (file, passes) ; on
// vérifie ici sa ligne, son accostage, qu'elle ne passe jamais sur l'îlot de la
// Maison, et que la nuit raccourcit son attente.
import { describe, it, expect } from "vitest";
import { updateRiverFleet, makeFleetCtl, ribbonLength, shuttleSite, riverFleetBudget, FLEET_TUNE } from "../riverFleet.js";
import { riverDodge } from "../iso/isoFleet.js";
import { bakePlaisirs } from "../iso/plaisirsBake.js";
import { wonderKitForBand } from "../iso/wonderKits.js";
import { MAISON_LANDING_PX } from "../iso/boatKitsPlaisirs.js";
import { stairPontoon, edgePontoon, pontoonAt, pontoonFace, visibleSide, PONTOON_LEN } from "../iso/boatLandings.js";
import { FLOAT_W } from "../iso/boatFamilies.js";

// Un fleuve droit d'ouest en est, 120 tuiles, demi-largeur 6 ; la Maison à x = 90.
const SM = Array.from({ length: 121 }, (_, i) => ({ x: i, y: 20, hw: 6 }));
const L = ribbonLength(SM);
const DT = 0.1;
const SIZE = { len: 1.25, beam: 0.41, speed: [0.85, 1.0] };
const MAISON = { t: 0.75, lat: 3.3, th: 0 };
const CITY = { t: 0.4, lat: 6 - 10 / 32 - 1 / 32 - SIZE.beam / 2, th: 0, side: 1, hw: 6 };
const ENV = {
  samples: SM, gates: [], sizeOf: () => SIZE, dodge: riverDodge,
  obstacles: [{ t: 0.75, lat: 0, r: 3.1, id: "plaisirs" }],
  shuttle: { city: CITY, maison: MAISON },
};
const BUDGET = { trade: 0, fisher: 0, barge: 0, ferry: 0, service: 0, shuttle: 1 };

// Rejoue `sec` secondes ; `each(sh, s)` à chaque pas (s = temps écoulé).
function play(sec, env = {}, each = null) {
  const ships = [];
  const ctl = makeFleetCtl();
  for (let k = 0; k < sec / DT; k += 1) {
    updateRiverFleet(ships, ctl, BUDGET, DT, { ...ENV, ...env });
    if (each && ships[0]) each(ships[0], k * DT);
  }
  return ships;
}

describe("la navette des Plaisirs", () => {
  it("elle n'existe que si la Maison est sur la carte", () => {
    const L0 = { river: { present: true }, counts: { eraBand: 4 } };
    expect(riverFleetBudget({ buildings: {} }, L0, ["trade", "shuttle"]).shuttle).toBe(0);
    const L1 = { river: { present: true, plaisirs: { x: 1, y: 1 } }, counts: { eraBand: 4 } };
    expect(riverFleetBudget({ buildings: {} }, L1, ["trade", "shuttle"]).shuttle).toBe(1);
    expect(riverFleetBudget({ buildings: {} }, L1, ["trade"]).shuttle).toBe(0);
  });

  it("elle naît à son ponton, va accoster au pied de l'escalier de la Maison, puis revient", () => {
    const seen = [];
    let atMaison = null, backHome = null;
    play(200, {}, (sh, s) => {
      if (!seen.length || seen[seen.length - 1] !== (sh.state + ':' + (sh.at || sh.dest))) seen.push(sh.state + ':' + (sh.at || sh.dest));
      if (sh.state === "dock" && sh.at === "maison" && !atMaison) atMaison = { t: sh.t, lat: sh.lat, s };
      if (atMaison && sh.state === "dock" && sh.at === "city" && !backHome) backHome = { trip: sh.trip, lat: sh.lat };
    });
    expect(seen.slice(0, 5)).toEqual(["dock:city", "cruise:maison", "dock:maison", "cruise:city", "dock:city"]);
    expect(atMaison.t).toBeCloseTo(MAISON.t, 6);
    expect(atMaison.lat).toBeCloseTo(MAISON.lat, 1);
    expect(backHome.lat).toBeCloseTo(CITY.lat, 1);
    expect(backHome.trip).toBe(1);
  });

  it("à quai à la Maison, la coque se met en travers (le long du pied de l'escalier)", () => {
    let th = null;
    play(120, {}, (sh) => { if (sh.state === "dock" && sh.at === "maison") th = sh.th; });
    expect(th).not.toBeNull();
    expect(Math.abs(Math.sin(th))).toBeLessThan(0.12);
  });

  it("elle ne passe jamais sur l'îlot de la Maison, à l'aller comme au retour", () => {
    let closest = Infinity;
    play(200, {}, (sh) => {
      const along = (sh.t - MAISON.t) * L;
      if (Math.abs(along) < 4) closest = Math.min(closest, Math.hypot(along, sh.lat));
    });
    // Pied de 2,8 tuiles + la demi-largeur de la coque.
    expect(closest).toBeGreaterThan(2.8 + SIZE.beam / 2 - 0.05);
  });

  it("la nuit, elle repart du ponton bien plus vite que le jour", () => {
    const wait = (night) => {
      let arrived = null, left = null;
      play(320, { night }, (sh, s) => {
        if (sh.trip === 1 && sh.state === "dock" && sh.at === "city" && arrived == null) arrived = s;
        if (arrived != null && left == null && sh.state === "cruise") left = s;
      });
      return left - arrived;
    };
    const day = wait(0), night = wait(1);
    expect(day).toBeGreaterThanOrEqual(FLEET_TUNE.shuttleBoard[0] - 1);
    expect(night).toBeLessThan(day / (FLEET_TUNE.shuttleNight - 2));
  });

  it("son ponton : en ville, entre le cœur et la Maison, loin des ponts et de la Maison", () => {
    const win = [0, 1];
    const s = shuttleSite(SM, win, [0.5], 0.3, 0.75);
    expect(s).not.toBeNull();
    expect(s.t).toBeGreaterThan(0.3);
    expect(s.t).toBeLessThan(0.75);
    expect(Math.abs(s.t - 0.5) * L).toBeGreaterThanOrEqual(12);
    expect((0.75 - s.t) * L).toBeGreaterThanOrEqual(18);
    // Pas de place (un pont tous les 10 tuiles) : pas de navette.
    const all = Array.from({ length: 12 }, (_, i) => i / 12);
    expect(shuttleSite(SM, win, all, 0.3, 0.75)).toBeNull();
  });
});

describe("l'embarcadère de la Maison (MAISON_LANDING_PX)", () => {
  // Le pied de l'escalier mesuré sur la cuisson de la Maison : si la Maison change
  // d'escalier, la navette accosterait dans le vide ou dans la pierre.
  it("la table suit le bâti de la Maison, âge par âge", () => {
    const g = { osselets: true, tickets: true, cartes: true, icare: true, boutique: true };
    for (let band = 0; band <= 9; band += 1) {
      const out = bakePlaisirs(wonderKitForBand(band, false), g);
      const R = out.R, D = out.D;
      let last = null;
      for (let y = 30; y <= 150; y += 1) {
        for (let h = 0; h <= 14; h += 1) {
          const i = Math.floor(-y - R.ox), j = Math.floor(y / 2 - h - R.oy);
          if (i < 0 || j < 0 || i >= R.w || j >= R.h) continue;
          const k = j * R.w + i;
          if (R.data[k * 4 + 3] && D && Math.abs(D[k] - (y + h)) <= 2.5) last = y;
        }
      }
      const foot = Math.max(last || 0, out.foot || 0);
      expect(MAISON_LANDING_PX[band], "bande " + band).toBeGreaterThanOrEqual(foot - 4);
      expect(MAISON_LANDING_PX[band], "bande " + band).toBeLessThanOrEqual(Math.max(last || 0, out.foot || 0) + 6);
    }
  });
});

describe("les pontons (iso/boatLandings.js)", () => {
  // Fleuve d'ouest en est : la rive −1 est au nord (on voit son mur), +1 au sud.
  it("au pied de l'escalier : le ponton colle au mur et file dans le sens de la volée", () => {
    const foot = { x: 50, y: 20 - 4, dir: 1 };          // pied du mur, rive nord (hw 6 → bord à y = 14)
    const P = stairPontoon(SM, foot, -1, 30);
    expect(P.dx).toBeCloseTo(1, 6);                        // vers l'aval, comme la volée
    expect(P.ay).toBeCloseTo(1, 6);                        // en travers : vers le large (sud)
    // Son flanc intérieur passe par le pied du mur, l'extérieur FLOAT_W plus loin.
    expect(pontoonAt(P, 0, -FLOAT_W / 2).y).toBeCloseTo(foot.y, 6);
    const face = pontoonFace(SM, P);
    expect(face.lat).toBeCloseTo(-4 + FLOAT_W / 32, 6);
    expect((face.t * 120) - 50).toBeCloseTo(15 / 32, 6);  // au milieu du ponton
  });
  it("au bord d'une rive au mur caché : au niveau de l'eau, sa racine sous le quai", () => {
    // Retour Raph : « faut respecter la profondeur ». Mur de 0,7 tuile : le ponton est
    // enfoncé d'autant, et la part cachée derrière le bord (0,7 tuile ici) s'ajoute à ce
    // qu'on en voit.
    const P = edgePontoon(SM, 0.5, 1, 0.7);
    expect(P.dy).toBeCloseTo(-1, 6);                       // rive sud : le large est au nord
    expect(P.y).toBeCloseTo(20 + 6, 6);                    // il part du bord
    expect(P.sink).toBeCloseTo(0.7 * 32, 6);
    expect(P.hid).toBeCloseTo(0.7, 6);
    expect(P.len).toBe(Math.round(0.7 * 32) + PONTOON_LEN.edge);
    // Le bateau l'aborde au bout TEL QU'ON LE VOIT : la part visible, depuis le bord.
    expect(6 - pontoonFace(SM, P).lat).toBeCloseTo((P.len - 0.7 * 32) / 32, 6);
  });
  it("on voit le mur de la rive nord d'un fleuve qui coule vers l'est", () => {
    expect(visibleSide(SM, 0.5)).toBe(-1);
  });
});
