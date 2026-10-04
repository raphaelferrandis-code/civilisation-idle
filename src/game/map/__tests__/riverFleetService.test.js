// Revue du 2026-10-04 : quand l'effectif voulu des bateaux de service baisse
// (bande 6 → 7 : 2 → 1), le bateau RESTANT recevait lui aussi son congé à la frame
// suivante — `have` comptait les partants, `extra` ne choisissait que parmi les autres.
import { describe, it, expect } from "vitest";
import { makeFleetCtl, updateRiverFleet } from "../riverFleet.js";

const DT = 1 / 60;
const ONLY_SERVICE = (n) => ({ trade: 0, fisher: 0, barge: 0, ferry: 0, service: n, shuttle: 0 });

describe("flotte du fleuve — congé des bateaux de service", () => {
  it("un effectif qui baisse d'un ne congédie qu'un bateau", () => {
    const ships = [], ctl = makeFleetCtl();
    for (let i = 0; i < 60 * 600 && ships.filter((s) => s.kind === "service").length < 2; i += 1) {
      updateRiverFleet(ships, ctl, ONLY_SERVICE(2), DT, {});
    }
    const service = () => ships.filter((s) => s.kind === "service");
    expect(service().length).toBe(2);
    for (let i = 0; i < 10; i += 1) updateRiverFleet(ships, ctl, ONLY_SERVICE(1), DT, {});
    expect(service().filter((s) => s.leave).length).toBe(1);
    expect(service().filter((s) => !s.leave).length).toBe(1);
  });
});
