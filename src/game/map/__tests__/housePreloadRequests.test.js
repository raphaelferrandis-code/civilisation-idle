// GARDE DU PRÉCHARGEMENT DES HABITATIONS (audit du 05/10, ASSET-2). preloadHouseSprites
// demandait le PNG de base de chaque variante d'AVAILABLE, y compris les gratte-ciel du
// cœur (skytower, skytower2) qui n'ont que leurs skins d'ère : deux requêtes en échec à
// chaque lancement, que le .exe compte en ERR_FILE_NOT_FOUND. Un faux `Image`, posé
// AVANT l'import du module, note tout ce que le préchargement demande, à chaque bande.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const requested = [];
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this._src = ""; }
  get src() { return this._src; }
  set src(v) { this._src = v; requested.push(v); }
}

let H;
let prevImage;
beforeAll(async () => {
  prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  H = await import("../pixelHouses.js");
});
afterAll(() => { globalThis.Image = prevImage; });

describe("préchargement des habitations : rien d'absent n'est demandé", () => {
  it("à chaque bande, chaque PNG préchargé existe (gratte-ciel du cœur compris)", () => {
    const from = requested.length;
    for (let b = 0; b <= 9; b += 1) H.preloadHouseSprites(b);
    const asked = requested.slice(from);
    expect(asked.length, "rien de demandé : la garde ne verrait rien").toBeGreaterThan(20);
    // Les skins cosmiques des gratte-ciel, eux, sont bien demandés.
    expect(asked).toContain("/pixelart/houses/skytower-cosmic-7.png");
    expect(asked.filter((s) => !fs.existsSync(path.join("public", s.split("?")[0])))).toEqual([]);
  });
});
