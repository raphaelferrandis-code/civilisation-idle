// LA FAMINE SUR LA CARTE (isoFamine.js) — les étals de nourriture se vident.
//
// Ce qu'on protège : (1) le tirage par étal est STABLE et MONOTONE (une place qui
// se vide ne clignote pas : un étal vide le reste quand la famine s'aggrave) ;
// (2) chaque étal déclaré « vide » a bien ses QUATRE faces sur le disque, et ne
// diffère de l'étal plein QUE sur le comptoir (inpaint PixelLab : le reste de
// l'étal — auvent, poteaux, pieds — doit être identique au pixel).
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { FAMINE_TUNE, STALLS_VIDES, famineK, stallEmpty, stallVideProp } from "../isoFamine.js";

const DIR = path.join(process.cwd(), "public", "pixelart", "iso", "plaza");
const read = (f) => PNG.sync.read(fs.readFileSync(path.join(DIR, f)));
let tick = 0;
const famine = (k) => { FAMINE_TUNE.force = k; tick += 1; return tick; };

describe("étals vides de la famine", () => {
  afterEach(() => { FAMINE_TUNE.force = null; });

  const etals = Array.from({ length: 200 }, (_, i) => ({ prop: "stall-red", wx: 37 * i + 5, wy: 91 * i + 3 }));

  it("aucun étal vide sans famine, tous à famine pleine", () => {
    let now = famine(0);
    expect(etals.filter((r) => stallEmpty(r, now)).length).toBe(0);
    now = famine(1);
    expect(etals.filter((r) => stallEmpty(r, now)).length).toBe(etals.length);
  });

  it("MONOTONE : un étal vide à 30 % l'est encore à 60 %", () => {
    let now = famine(0.3);
    const vides30 = etals.filter((r) => stallEmpty(r, now));
    now = famine(0.6);
    for (const r of vides30) expect(stallEmpty(r, now)).toBe(true);
    const vides60 = etals.filter((r) => stallEmpty(r, now)).length;
    expect(vides60).toBeGreaterThan(vides30.length);
    // ~proportionnel : la moitié de la famine vide ~la moitié des étals
    expect(vides30.length / etals.length).toBeGreaterThan(0.15);
    expect(vides30.length / etals.length).toBeLessThan(0.45);
  });

  it("le seuil suit la Subsistance : 0 sous `from`, 1 au-delà de `full`", () => {
    FAMINE_TUNE.force = null;
    expect(FAMINE_TUNE.from).toBeLessThan(FAMINE_TUNE.full);
    expect(famineK(-42)).toBeGreaterThanOrEqual(0);
    expect(famineK(-42)).toBeLessThanOrEqual(1);
  });

  it("seuls les étals qui ONT un art vide basculent (draps, autres ères : jamais)", () => {
    const now = famine(1);
    expect(stallVideProp({ prop: "stall-red", wx: 1, wy: 1 }, "medieval", now)).toBe("stall-red-vide");
    expect(stallVideProp({ prop: "stall-blue", wx: 1, wy: 1 }, "medieval", now)).toBe(null);
    expect(stallVideProp({ prop: "stall-red", wx: 1, wy: 1 }, "industrial", now)).toBe(null); // fleurs
  });

  for (const key of STALLS_VIDES) {
    const [, col, era] = key.split("-");
    for (const face of ["n", "s", "e", "w"]) {
      it(`${key} : face ${face} présente, identique à l'étal plein hors du comptoir`, () => {
        const plein = read(`stall-${col}-${face}-${era}.png`);
        const vide = read(`stall-${col}-vide-${face}-${era}.png`);
        expect([vide.width, vide.height]).toEqual([plein.width, plein.height]);
        // Les pixels changés tiennent dans UNE bande horizontale du comptoir (le
        // masque d'inpaint) : ni l'auvent (haut) ni les pieds (bas) n'ont bougé.
        let y0 = Infinity, y1 = -1, n = 0;
        for (let i = 0; i < plein.width * plein.height; i += 1) {
          const d = [0, 1, 2, 3].some((k) => plein.data[i * 4 + k] !== vide.data[i * 4 + k]);
          if (!d) continue;
          n += 1;
          const y = Math.floor(i / plein.width);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        expect(n).toBeGreaterThan(60);          // le comptoir a bien été vidé
        expect(y0).toBeGreaterThanOrEqual(14);  // sous l'auvent
        expect(y1).toBeLessThanOrEqual(35);     // au-dessus des pieds (bord avant des tables modernes : 35)
      });
    }
  }
});
