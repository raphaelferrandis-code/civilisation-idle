// Revue du 2026-10-04 : normalizeCityMapSlots ne gardait que {dx, dy, zone, id} —
// les parcelles du terroir (et la hauteur du port de la grève) disparaissaient au
// chargement, et champs et moulins se refondaient à chaque F5.
import { describe, it, expect } from "vitest";
import { normalizeCityMapSlots } from "../state.js";

describe("mémoire de placement : parcelles et hauteur de port", () => {
  it("garde les parcelles du terroir et la hauteur du port à l'aller-retour JSON", () => {
    const slots = {
      "1:irrigated_fields:0": { dx: 12, dy: -4, zone: "rural", id: "irrigated_fields", parcels: [[12, -4, 5, 3], [18, -4, 4, 3], [12, 0, 6, 2]] },
      "1:river_ports:0": { dx: -9, dy: 6, sy: 4, zone: "bank", id: "river_ports" },
    };
    const back = normalizeCityMapSlots(JSON.parse(JSON.stringify(slots)));
    expect(back["1:irrigated_fields:0"].parcels).toEqual([[12, -4, 5, 3], [18, -4, 4, 3], [12, 0, 6, 2]]);
    expect(back["1:river_ports:0"].sy).toBe(4);
  });

  it("écarte des parcelles abîmées, sans perdre le slot", () => {
    const back = normalizeCityMapSlots({
      "1:irrigated_fields:0": { dx: 1, dy: 2, zone: "", id: "", parcels: [[1, 2, 0, 3]] },
      "1:water_mills:0": { dx: 1, dy: 2, zone: "", id: "", parcels: "x", sy: 99 },
    });
    expect(back["1:irrigated_fields:0"]).toEqual({ dx: 1, dy: 2, zone: "", id: "" });
    expect(back["1:water_mills:0"]).toEqual({ dx: 1, dy: 2, zone: "", id: "" });
  });
});
