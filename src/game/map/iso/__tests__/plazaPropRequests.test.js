// GARDE DES REQUÊTES DU MOBILIER DE PLACE (audit du 05/10, ASSET-2 et ASSET-6).
// propImage demandait D'UN COUP la variante orientée (`banc-s-<ère>.png`) et le nom nu
// (`banc-<ère>.png`) : un banc n'a pas de nom nu, une corbeille n'a pas de face — une
// requête en échec par prop, que le .exe compte en ERR_FILE_NOT_FOUND. Ici un faux
// `Image` répond comme le disque (onload si le fichier existe, onerror sinon) et chaque
// prop livré est demandé sous toutes les formes qu'un appelant peut réclamer.
// Fichier à part : le registre d'art est un cache de MODULE, il doit naître avec ce faux
// `Image` (dans isoPlaza.test.js, sans `Image`, ses entrées ne se chargeraient jamais).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const KIT = path.join("public", "pixelart", "iso", "plaza");
const ERAS = ["primitive", "medieval", "antique", "industrial", "modern", "cosmic"];
const FACES = ["n", "s", "e", "w"];

const requested = [];
const queue = [];
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this._src = ""; }
  get src() { return this._src; }
  set src(v) {
    this._src = v;
    requested.push(v);
    const file = path.join("public", v.split("?")[0]);
    queue.push(() => {
      this.complete = true;
      if (fs.existsSync(file)) { this.naturalWidth = 1; this.naturalHeight = 1; if (this.onload) this.onload(); }
      else if (this.onerror) this.onerror();
    });
  }
}
const flush = () => { while (queue.length) queue.shift()(); };

let plazaPropImage;
let prevImage;
beforeAll(async () => {
  prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  ({ plazaPropImage } = await import("../isoPlaza.js"));
});
afterAll(() => { globalThis.Image = prevImage; });

// Les props livrés, lus sur le disque : { prop → { era → { nu, faces } } }.
function shippedProps() {
  const out = new Map();
  const eraRe = ERAS.join("|");
  for (const f of fs.readdirSync(KIT)) {
    let m = f.match(new RegExp(`^(.+)-([nsew])-(${eraRe})\\.png$`));
    const faced = !!m;
    if (!m) m = f.match(new RegExp(`^(.+)-(${eraRe})\\.png$`));
    if (!m) continue;
    const prop = m[1], era = faced ? m[3] : m[2];
    if (!out.has(prop)) out.set(prop, {});
    const e = (out.get(prop)[era] ||= { nu: false, faces: false });
    if (faced) e.faces = true; else e.nu = true;
  }
  return out;
}

// Demande jusqu'au verdict (variante, échec, puis repli) et rend l'image ou null.
function resolve(prop, era, variant) {
  for (let i = 0; i < 4; i += 1) {
    const im = plazaPropImage(prop, era, variant);
    if (im) return im;
    flush();
  }
  return null;
}

describe("mobilier de place : aucune demande d'un fichier absent", () => {
  it("chaque prop livré se résout sans un seul 404, avec ou sans face", () => {
    const props = shippedProps();
    expect(props.size, "aucun prop trouvé sur le disque").toBeGreaterThan(15);
    const missing = [];
    const unresolved = [];
    let asked = 0;
    for (const [prop, byEra] of props) {
      for (const [era, has] of Object.entries(byEra)) {
        // Un prop À FACES est toujours posé avec sa face (garde « aucun prop de place
        // ne retombe sur le kit top-down ») ; un prop nu peut l'être avec une face
        // (les rues donnent une face à tout ce qu'elles posent).
        const variants = has.faces ? FACES : [null, ...FACES];
        for (const v of variants) {
          const from = requested.length;
          if (!resolve(prop, era, v)) unresolved.push(`${prop}${v ? "-" + v : ""}-${era}`);
          for (const src of requested.slice(from)) {
            if (!fs.existsSync(path.join("public", src))) missing.push(src);
          }
          asked += 1;
        }
      }
    }
    expect(asked).toBeGreaterThan(100);
    expect(unresolved).toEqual([]);
    expect(missing).toEqual([]);
  });

  it("une variante ABSENTE retombe encore sur le nom nu, après son échec seulement", () => {
    // Un banc dont la face manquerait demande son nom nu, mais seulement APRÈS l'échec
    // de la face — le filet « un banc non directionnel vaut mieux que pas de banc ».
    const from = requested.length;
    const im = resolve("bench", "medieval", "x");
    const asked = requested.slice(from);
    expect(im).toBeNull();
    expect(asked).toEqual(["/pixelart/iso/plaza/bench-x-medieval.png", "/pixelart/iso/plaza/bench-medieval.png"]);
  });
});
