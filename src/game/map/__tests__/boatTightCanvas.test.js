// COQUES ET REFLETS DES BATEAUX DANS DES CANVAS SERRÉS (audit du 05/10, PERF-36, choix
// A de Raph). Cuits au CARRÉ (côté = la plus grande dimension), ils pesaient 1,8 fois
// la mémoire et les pixels composés de la coque, de son ombre et de son reflet. Ce que
// ce test tient :
//   · le canvas fait la coque + UNE colonne et UNE rangée vides (la marge obligatoire :
//     le bord de la pose tombe entre deux pixels device, c'est elle qui s'y étire) ;
//   · l'échelle de pose est celle de l'ancien carré, snapDev(côté · z) / côté, pour la
//     coque comme pour le reflet : chaque pixel source retombe où il tombait ;
//   · la coque se pose en (bx, by, dw, dh) avec dh propre (le pont, l'île, la fiche du
//     bac la lisaient carrée).
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const refl = vi.hoisted(() => []);
vi.mock("../iso/isoReflect.js", async (importOriginal) => ({
  ...(await importOriginal()),
  noteReflectionImage: (ctx, cv, x, y, w, h) => { refl.push({ cv, x, y, w, h }); },
}));
// L'ombre : ses arguments, pour vérifier qu'elle se lit encore sur l'ancien carré.
const shad = vi.hoisted(() => []);
vi.mock("../iso/isoSunShadow.js", async (importOriginal) => ({
  ...(await importOriginal()),
  drawSunShadow: (...a) => { shad.push(a); },
}));

import { CM } from "../layout.js";
import { drawBoat } from "../iso/boatKit.js";
import { snapDev } from "../blitSnap.js";

// Canvas muets ; on garde la taille de chacun.
const ctx2d = (log = null) => new Proxy({ globalAlpha: 1, imageSmoothingEnabled: false }, {
  get(t, k) {
    if (k === "drawImage" && log) return (...a) => log.push(a);
    if (k in t) return t[k];
    return typeof k === "string" ? () => {} : undefined;
  },
  set(t, k, v) { t[k] = v; return true; },
});
class FakeImageData {
  constructor(a, b, c) {
    if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c || a.length / 4 / b; }
    else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
  }
}

let saved;
beforeAll(() => {
  saved = { doc: globalThis.document, id: globalThis.ImageData, dpr: CM.dpr };
  globalThis.document = { createElement: () => { const g = ctx2d(); return { width: 0, height: 0, getContext: () => g }; } };
  globalThis.ImageData = FakeImageData;
});
afterAll(() => {
  globalThis.document = saved.doc; globalThis.ImageData = saved.id; CM.dpr = saved.dpr;
});

describe("PERF-36 — coques et reflets cuits serrés, posés à l'échelle de l'ancien carré", () => {
  it("canvas = coque + 1 × 1 de marge, échelle snapDev(côté · z) / côté", () => {
    let flat = 0, n = 0;
    for (const dpr of [1, 1.25, 2]) {
      CM.dpr = dpr;
      for (const [id, band] of [["scapha", 2], ["cargo-vapeur", 5], ["porte-conteneurs-quai", 6], ["pirogue", 0]]) {
        for (const [th, z] of [[0.4, 1], [1.9, 1.37], [3.3, 0.62], [5.1, 2.5]]) {
          const log = [];
          refl.length = 0;
          const r = drawBoat(ctx2d(log), { id, seed: 7 }, 300.3, 200.6, th, z, 0, { state: "cruise", band });
          expect(r, `${id} posé`).toBeTruthy();
          const cv = r.img;
          expect([cv.width, cv.height], `${id} : coque + marge`).toEqual([r.iw + 1, r.ih + 1]);
          const side = Math.max(r.iw, r.ih), k = snapDev(side * z) / side;
          expect(r.dw / cv.width).toBeCloseTo(k, 12);
          expect(r.dh / cv.height).toBeCloseTo(k, 12);
          // Le pixel source u retombe où le posait le carré (bx + u · dwCarré / côté).
          for (const u of [0, r.iw, r.ih]) expect(r.bx + u * (r.dw / cv.width)).toBeCloseTo(r.bx + u * (snapDev(side * z) / side), 9);
          // La coque est posée telle quelle, (bx, by, dw, dh).
          const hull = log.find((a) => a[0] === cv && a.length === 5);
          expect(hull, `${id} : pose de la coque`).toEqual([cv, r.bx, r.by, r.dw, r.dh]);
          // Le reflet : son canvas serré, à l'échelle de SON ancien carré.
          expect(refl.length).toBe(1);
          const R = refl[0], rw = R.cv.width - 1, rh = R.cv.height - 1, rs = Math.max(rw, rh);
          expect(R.w / R.cv.width).toBeCloseTo(snapDev(rs * z) / rs, 12);
          expect(R.h / R.cv.height).toBeCloseTo(snapDev(rs * z) / rs, 12);
          if (cv.width !== cv.height) flat += 1;
          n += 1;
        }
      }
    }
    // Un bateau est plus long que haut, ou l'inverse : les carrés étaient pleins de vide.
    expect(flat).toBe(n);
  });

  // L'ombre se calcule et se SEUILLE sur l'ancien carré : son seuil de taille
  // (SUN_SHADOW.minH, 12 px) lit la hauteur posée. Avec la hauteur serrée, une pirogue
  // vue de flanc (48 × 11) perdait son ombre au zoom 0,8 (contre-expertise du lot 11).
  it("l'ombre garde le rectangle de l'ancien carré (pirogue de flanc au zoom 0,8)", () => {
    CM.dpr = 1;
    let flatSeen = 0;
    for (let d = 0; d < 8; d += 1) {
      shad.length = 0;
      const z = 0.8;
      const r = drawBoat(ctx2d([]), { id: "pirogue", seed: 7 }, 300, 200, (d * Math.PI) / 4, z, 0, { state: "cruise", band: 0 });
      expect(r).toBeTruthy();
      const side = Math.max(r.iw, r.ih), dS = snapDev(side * z);
      expect(shad).toHaveLength(1);
      const [, img, bx, by, dw, dh, sx, sy, sw, sh] = shad[0];
      expect([img, bx, by]).toEqual([r.img, r.bx, r.by]);
      expect([dw, dh, sx, sy, sw, sh]).toEqual([dS, dS, 0, 0, side, side]);
      if ((r.ih + 1) * (dS / side) < 12 && dS >= 12) flatSeen += 1;
    }
    expect(flatSeen, "au moins un cap où la hauteur serrée passait sous le seuil").toBeGreaterThan(0);
  });
});
