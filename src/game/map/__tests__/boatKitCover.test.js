// LE KIT DE BATEAUX COUVRE TOUTE LA PARTIE — la garde qui a permis de retirer les
// sprites (audit du 05/10, MORT-6).
//
// La flotte, les bateaux à quai des ports et les feux de navigation avaient chacun un
// repli sur les coques PixelLab (boat-<stade>-<secteur>), avec leur calibreur de feux
// (navCalib) et l'A/B `__boatKit({ on: false })`. Ce repli ne servait plus qu'à la
// molette : chaque bande a sa flotte dessinée par le code. Il est parti — et ce test
// dit pourquoi on peut s'en passer : à chaque bande, chaque métier du fleuve et chaque
// rôle d'un plan de port trouve un modèle. Sans modèle, la coque ne serait plus
// dessinée du tout (isoPort.drawIsoShips, portBerths.drawMooredHull).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BOAT_MODELS, fleetFor } from "../iso/boatKits.js";
import { boatSpecFor, mooredFootprint } from "../iso/boatKit.js";

const BANDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

describe("le kit de bateaux couvre les dix bandes", () => {
  it("chaque métier du fleuve a un modèle, à chaque bande (un métier inconnu prend le marchand)", () => {
    for (const band of BANDS) {
      for (const kind of ["trade", "fisher", "barge", "ferry", "service", "shuttle", "inconnu"]) {
        for (const id of [1, 7, 42]) {
          const spec = boatSpecFor({ id, kind, svc: id }, band);
          expect(spec, `bande ${band}, ${kind}`).toBeTruthy();
          expect(BOAT_MODELS[spec.id], `bande ${band}, ${kind} : ${spec.id}`).toBeTruthy();
        }
      }
    }
  });

  it("chaque rôle d'un plan de port a sa coque à quai, à chaque bande", () => {
    // Les rôles que posent le terminal de commerce et le bassin du Vieux-Port.
    for (const band of BANDS) {
      for (const role of ["container", "steam", "sail", "fisher", "motorboat", "dinghy", "rowboat"]) {
        const fp = mooredFootprint(role, band);
        expect(fp, `bande ${band}, ${role}`).toBeTruthy();
        expect(fp.len, `bande ${band}, ${role}`).toBeGreaterThan(0);
      }
    }
  });

  it("chaque bande a ses marchands (les postes d'escale se cotent sur eux)", () => {
    for (const band of BANDS) expect(fleetFor(band).trade.length, `bande ${band}`).toBeGreaterThan(0);
  });

  it("les sprites de l'A/B ne sont plus livrés", () => {
    const ISO = path.resolve(__dirname, "../../../../public/pixelart/iso");
    const restes = fs.readdirSync(ISO).filter((f) => /^(boat|pontoon)-.*\.png$/.test(f));
    expect(restes).toEqual([]);
    expect(fs.existsSync(path.resolve(__dirname, "../iso/navCalib.js"))).toBe(false);
  });
});
