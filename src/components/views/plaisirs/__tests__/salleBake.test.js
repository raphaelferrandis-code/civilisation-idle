import { describe, it, expect, beforeAll } from "vitest";

// MEM-5 / PERF-38 (audit du 2026-10-05) : le cache des cuissons de la salle des
// Plaisirs. Avant : sept entrées de 15 à 20 Mo (par âge × lieux ouverts), sorties dans
// l'ordre d'arrivée, rasters bruts compris ; la cuisson se faisait pendant le rendu.
// Ici (Node, sans Worker) la cuisson passe par le repli hors rendu ; les toiles sont
// factices, on ne compte que les entrées et ce qu'elles gardent.

beforeAll(() => {
  globalThis.ImageData = class {
    constructor(d, w, h) {
      if (typeof d === "number") { h = w; w = d; d = new Uint8ClampedArray(w * h * 4); }
      this.data = d; this.width = w; this.height = h;
    }
  };
  globalThis.document = {
    createElement: () => {
      const cv = { width: 0, height: 0 };
      cv.getContext = () => ({ putImageData() {}, drawImage() {} });
      return cv;
    },
  };
});

describe("cache des cuissons de la salle", () => {
  it("retenir garde les plus récentes, la plus anciennement vue sort", async () => {
    const { retenir } = await import("../salleBake.js");
    const m = new Map();
    for (let k = 0; k < 10; k += 1) retenir(m, k, { k }, 2);
    expect([...m.keys()]).toEqual([8, 9]);
    retenir(m, 8, m.get(8), 2);           // revue : redevient la plus récente
    retenir(m, 10, {}, 2);
    expect([...m.keys()]).toEqual([8, 10]);
  });

  it("deux âges au plus, sans les rasters bruts, une cuisson par âge", async () => {
    const { cuireSalleBake, sallesEnCache } = await import("../salleBake.js");
    // Deux demandes du même âge : une seule cuisson (la même promesse).
    const p0 = cuireSalleBake(0);
    expect(cuireSalleBake(0)).toBe(p0);
    const e0 = await p0;
    for (const b of [1, 2]) await cuireSalleBake(b);
    expect(sallesEnCache()).toEqual([1, 2]);
    for (const k of ["R", "F", "N", "fond"]) expect(e0[k], k).toBeUndefined();
    expect(e0.cv && e0.cvF && e0.cvN && e0.lumiere && e0.lumiere.cv && e0.lumiere.rais).toBeTruthy();
    // Le clic tombe toujours au pixel : les lieux restent, en un octet par pixel.
    expect(e0.ids).toBeInstanceOf(Uint8Array);
    expect(e0.idNames).toContain("scene");
  });
});
