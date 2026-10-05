// L'IMAGE D'UN PROP GARDÉE SUR SON REC (audit du 05/10, PERF-49 point 1). Le dessin
// d'un prop de place ou de trottoir refaisait à chaque frame deux à quatre chaînes
// (chemin du PNG, pivot, « étal qui a un art vide ») et une recherche dans le registre :
// ~0,4 ms pour 1 000 props. recArt garde le résultat sur le rec pour son ère ; ce test
// tient qu'il rend toujours ce que propImage rendrait : rien tant que la variante attend
// son verdict, la variante une fois décodée, le nom nu si elle manque, et l'image de la
// nouvelle ère si l'ère change.
// Fichier à part : le registre d'art est un cache de MODULE, il doit naître avec ce
// faux `Image` (cf. plazaArtRev.test.js).
import { it, expect, beforeAll, afterAll } from "vitest";

const loads = new Map();   // src → { ok, ko }
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this._src = ""; }
  get src() { return this._src; }
  set src(v) {
    this._src = v;
    loads.set(v, { ok: () => this.onload && this.onload(), ko: () => this.onerror && this.onerror() });
  }
}
const fire = (src, how) => { const l = loads.get(src); expect(l).toBeTruthy(); l[how](); loads.delete(src); };

let mod, prevImage;
beforeAll(async () => {
  prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  mod = await import("../isoPlaza.js");
});
afterAll(() => { globalThis.Image = prevImage; });

const P = "/pixelart/iso/plaza/";

it("la variante attendue, puis trouvée : gardée sur le rec", () => {
  const rec = { prop: "bench", variant: "s" };
  mod.plazaRecArt(rec, "antique");
  expect(rec._artIm).toBe(null);                          // pas encore décodée
  expect(mod.plazaPropImage("bench", "antique", "s")).toBe(null);
  fire(P + "bench-s-antique.png", "ok");
  mod.plazaRecArt(rec, "antique");
  const im = rec._artIm;
  expect(im).toBeTruthy();
  expect(im).toBe(mod.plazaPropImage("bench", "antique", "s"));
  mod.plazaRecArt(rec, "antique");
  expect(rec._artIm).toBe(im);                            // la même, sans la redemander
  expect(rec._artVide).toBe(false);
  expect(rec._artPiv).toBe(null);
});

it("une variante absente retombe sur le nom nu, comme propImage", () => {
  const rec = { prop: "crates", variant: "e" };
  mod.plazaRecArt(rec, "medieval");
  fire(P + "crates-e-medieval.png", "ko");                // verdict : pas de variante
  mod.plazaRecArt(rec, "medieval");
  expect(rec._artIm).toBe(null);                          // le nom nu est demandé, pas décodé
  fire(P + "crates-medieval.png", "ok");
  mod.plazaRecArt(rec, "medieval");
  expect(rec._artIm).toBeTruthy();
  expect(rec._artIm).toBe(mod.plazaPropImage("crates", "medieval", "e"));
});

it("changer d'ère refait l'image, l'étal vide et le pivot", () => {
  const rec = { prop: "stall-red", variant: "n" };
  mod.plazaRecArt(rec, "antique");
  fire(P + "stall-red-n-antique.png", "ok");
  mod.plazaRecArt(rec, "antique");
  const antique = rec._artIm;
  expect(antique).toBeTruthy();
  expect(rec._artVide).toBe(true);                        // légumes et fruits (STALLS_VIDES)
  mod.plazaRecArt(rec, "industrial");
  expect(rec._artIm).toBe(null);
  expect(rec._artVide).toBe(false);                       // fleurs : pas d'art vide
  fire(P + "stall-red-n-industrial.png", "ok");
  mod.plazaRecArt(rec, "industrial");
  expect(rec._artIm).toBeTruthy();
  expect(rec._artIm).not.toBe(antique);
  const f = { prop: "fountain", variant: null };
  mod.plazaRecArt(f, "forum-modern");
  expect(f._artPiv).toEqual([0.49, 0.61]);
});
