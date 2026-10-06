// LE DÉCODAGE D'UN PNG DE PLACE NE RECOMPOSE PLUS TOUTES LES PLACES (audit du 05/10,
// PERF-26). Chaque image décodée du registre (banc, étal, bande animée…) refaisait la
// composition de TOUTES les places, flâneurs compris (5 à 19 ms, ~50 fois par ère), et
// relançait la cuisson du sol. Or la composition ne lit qu'une image : le pied MESURÉ
// des arbres (treeFootMetrics) ; et aucun PNG de ce registre n'est cuit dans le sol.
// Fichier à part : le registre d'art est un cache de MODULE, il doit naître avec ce
// faux `Image` (cf. plazaPropRequests.test.js).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CM } from "../../layout.js";
import { setSolPyramideInvalidator } from "../solInvalidate.js";
import { plazaSquare } from "../../../../test/plaza.js";

const loads = new Map();   // src → déclencheur de onload
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; this._src = ""; }
  get src() { return this._src; }
  set src(v) { this._src = v; loads.set(v, () => { if (this.onload) this.onload(); }); }
}
const fire = (pred) => { for (const [src, go] of loads) if (pred(src)) { go(); loads.delete(src); } };

let mod, isoArt, prevImage;
beforeAll(async () => {
  prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  mod = await import("../isoPlaza.js");
  ({ isoArt } = await import("../isoArt.js"));
});
afterAll(() => { globalThis.Image = prevImage; setSolPyramideInvalidator(null); });

const plazaLayout = plazaSquare;

describe("registre d'art des places", () => {
  it("un banc décodé ne recompose rien et ne touche pas au sol ; un arbre recale les places", () => {
    CM.TILE = 32; CM.cw = 800; CM.ch = 600; CM.cam = { x: 0, y: 0, zoom: 1 };
    CM.layoutRecomputeAt = 1;
    const sol = [];
    setSolPyramideInvalidator((kind) => sol.push(kind));
    const L = plazaLayout(5);
    const c0 = mod.isoPlazaCompositions(L, 3);
    expect(c0.length).toBe(1);
    // Les arbres sont demandés à la composition (amorçage des pieds mesurés).
    expect([...loads.keys()].some((s) => s.startsWith("/pixelart/iso/tree-"))).toBe(true);
    // Du mobilier, une bande animée : décodés, la composition reste LA MÊME.
    mod.plazaPropImage("bench", "antique", "s");
    mod.plazaPropImage("fountain", "antique");
    const props = [...loads.keys()].filter((s) => s.includes("/plaza/"));
    expect(props.length).toBeGreaterThan(0);
    fire((s) => s.includes("/plaza/"));
    expect(mod.isoPlazaCompositions(L, 3)).toBe(c0);
    expect(sol).toEqual([]);
    // Un arbre de la FORÊT (registre partagé avec isoArt depuis STRUCT-4) : la place ne
    // l'a pas demandé, son décodage ne la recompose pas.
    isoArt("tree-chene-j1");
    fire((s) => s.startsWith("/pixelart/iso/tree-chene-j1"));
    expect(mod.isoPlazaCompositions(L, 3)).toBe(c0);
    // Un arbre décodé : la place se recale sur son pied mesuré, à la frame suivante.
    fire((s) => s.startsWith("/pixelart/iso/tree-1"));
    expect(mod.isoPlazaCompositions(L, 3)).not.toBe(c0);
    expect(sol).toEqual([]);
  });
});
