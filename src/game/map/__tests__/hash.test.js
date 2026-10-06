// LES HACHAGES PARTAGÉS RENDENT, BIT POUR BIT, CE QUE RENDAIENT LES COPIES (audit du
// 05/10, STRUCT-8). Chaque copie remplacée par un import de ../hash.js est gelée ici
// telle qu'elle était écrite dans son fichier, et comparée à la variante partagée sur
// des milliers d'entrées (entiers, négatifs, grands, flottants, valeurs limites). Une
// seule différence redistribuerait la ville — arbres, teintes, variantes, passants : la
// preuve que le remplacement ne change aucun pixel est là, pas dans une capture.
import { describe, it, expect } from "vitest";
import { fmix32, hash01Lowbias, h32, h01Pair, h01Imul } from "../hash.js";
import { _rnd } from "../iso/isoMath.js";
import { h32 as h32PixelPaint } from "../iso/isoPixelPaint.js";
import { h32 as h32HDKit } from "../iso/plaisirsHDKit.js";
import { h01 as h01BoxBake } from "../iso/isoBoxBake.js";
import { hash01 as hash01VieArt } from "../iso/vieArt.js";
import { vegHash } from "../iso/vegNoise.js";

// ── Les copies d'origine, gelées ────────────────────────────────────────────
// isoPlaza, plazaFolk, isoQuayWalk, fdSpots.
function fmixPlaza(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16; return h >>> 0;
}
// agents, housePalette.
function fmixAgents(x) {
  let h = x >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}
// engineAnim.
function fmixEngineAnim(h) {
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
// isoStreetProps.
function fmixStreetProps(h) {
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}
// isoRiverLife, isoVieOiseaux, isoVieTerre (h32), vieArt (hash01).
function lowbiasCopy(n) {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}
// isoPixelPaint, plaisirsHDKit.
function h32Copy(a, b = 0, c = 0) {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
}
// plaisirsMaterial (sans défaut sur b).
const h32Material = (a, b, c = 0) => {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
};
// coursesArt (h32), SalleCanvas (hashP).
const pairCopy = (a, b) => {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
// isoBoxBake, isoQuay.
function h01ImulCopy(x, y, s = 0) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + s * 982451653;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
// isoLisiere (h01), remplacée par vegHash (vegNoise) — STRUCT-12.
function lisiereCopy(ix, iy, s) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// isoPlaisirs.
const fracCopy = (x) => x - Math.floor(x);
const rndPlaisirs = (i, j) => fracCopy(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453);

// ── Les entrées ─────────────────────────────────────────────────────────────
// Déterministes (aucun Math.random) : entiers petits et grands, négatifs, uint32,
// flottants, et les valeurs que la conversion 32 bits traite à part.
function inputs() {
  const out = [0, -0, 1, -1, 2, 3, 7, 255, 256, 65535, 65536, 0x7fffffff, 0x80000000, 0xffffffff,
    -0x80000000, 2 ** 32, 2 ** 33 + 5, -(2 ** 33) - 7, 2 ** 53, 0.5, -0.5, 1.999, -1.999, 12.75, 1e-9,
    NaN, Infinity, -Infinity];
  let s = 2166136261;
  for (let i = 0; i < 6000; i += 1) {
    s = Math.imul(s ^ i, 16777619) >>> 0;
    out.push(s, s | 0, (s % 2000) - 1000, s / 7, -s * 3.25, (s >>> 3) * 1024 + 0.375);
  }
  return out;
}
const IN = inputs();
const same = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));
function mismatches(f, g, arity) {
  const bad = [];
  for (let i = 0; i < IN.length && bad.length < 5; i += 1) {
    const a = IN[i], b = IN[(i * 7 + 3) % IN.length], c = IN[(i * 13 + 5) % IN.length];
    const args = [a, b, c].slice(0, arity);
    if (!same(f(...args), g(...args))) bad.push(args);
  }
  return bad;
}

describe("STRUCT-8 — les variantes partagées sont les copies, bit pour bit", () => {
  it("fmix32 : les quatre écritures du finaliseur de murmur3", () => {
    expect(mismatches(fmix32, fmixPlaza, 1)).toEqual([]);
    expect(mismatches(fmix32, fmixAgents, 1)).toEqual([]);
    expect(mismatches(fmix32, fmixEngineAnim, 1)).toEqual([]);
    expect(mismatches(fmix32, fmixStreetProps, 1)).toEqual([]);
  });
  it("hash01Lowbias : la petite vie (fleuve, oiseaux, papillons, brume)", () => {
    expect(mismatches(hash01Lowbias, lowbiasCopy, 1)).toEqual([]);
    expect(hash01VieArt).toBe(hash01Lowbias);
  });
  it("h32 : peintres de pixels, coupe et matériel des Plaisirs, à 1, 2 et 3 arguments", () => {
    for (const n of [1, 2, 3]) {
      expect(mismatches(h32, h32Copy, n)).toEqual([]);
      expect(mismatches(h32, h32Material, n)).toEqual([]);
    }
    expect(h32PixelPaint).toBe(h32);
    expect(h32HDKit).toBe(h32);
  });
  it("h01Pair : pistes des courses et étoiles de la salle", () => {
    expect(mismatches(h01Pair, pairCopy, 2)).toEqual([]);
  });
  it("h01Imul : boîtes cuites des ports et des quais (graine flottante comprise)", () => {
    expect(mismatches(h01Imul, h01ImulCopy, 2)).toEqual([]);
    expect(mismatches(h01Imul, h01ImulCopy, 3)).toEqual([]);
    expect(h01BoxBake).toBe(h01Imul);
  });
  it("_rnd d'isoMath : celui que recopiait la Maison des Plaisirs", () => {
    expect(mismatches(_rnd, rndPlaisirs, 2)).toEqual([]);
  });
  it("vegHash : celui que recopiait la lisière arrondie", () => {
    expect(mismatches(vegHash, lisiereCopy, 3)).toEqual([]);
  });
});
