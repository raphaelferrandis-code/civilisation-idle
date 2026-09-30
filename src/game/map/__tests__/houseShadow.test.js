import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

import { HOUSE_CAST_SHADOW, houseCastShadow } from "../houseShadow.js";

// L'OMBRE PORTÉE DES HABITATIONS QUI N'EN ONT PAS (2026-09-29, cf. houseShadow.js).
// Ce qu'on ne voit pas à l'œil et que ces gardes tiennent, sur les VRAIS sprites :
//   1. l'ombre ne recouvre jamais le sprite (elle ne se pose que dans le vide) ;
//   2. elle reste AU SOL : sous la mi-hauteur de l'encre, et à droite du coin sud
//      (la lumière vient du haut-gauche) — le 1er jet posait des lignes sombres à
//      hauteur de toit (débords de corniche) ;
//   3. elle a une vraie taille (une tache, pas trois pixels) ;
//   4. les sprites qui ont DÉJÀ une ombre cuite ne sont pas dans la liste.

const DIR = path.join("public", "pixelart", "houses");

function sprite(name) {
  const p = PNG.sync.read(fs.readFileSync(path.join(DIR, name + ".png")));
  const W = p.width, H = p.height;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : p.data[(y * W + x) * 4 + 3];
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (alpha(x, y) > 16) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { alpha, bb: { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

describe("ombre portée calculée", () => {
  for (const name of HOUSE_CAST_SHADOW) {
    it(`${name} : une tache au sol, à droite, jamais sur le sprite`, () => {
      const { alpha, bb } = sprite(name);
      const sh = houseCastShadow(alpha, bb);
      expect(sh, "pas d'ombre").toBeTruthy();
      expect(sh.px.length).toBeGreaterThan(60);
      const mid = bb.y0 + bb.h * 0.5, cx = bb.x0 + bb.w * 0.35;
      for (const [x, y] of sh.px) {
        expect(alpha(x, y) > 16, `${name} : ombre sur le sprite en ${x},${y}`).toBe(false);
        expect(y, `${name} : ombre en l'air en ${x},${y}`).toBeGreaterThan(mid);
        expect(x, `${name} : ombre à gauche en ${x},${y}`).toBeGreaterThan(cx);
      }
    });
  }

  it("les sprites à ombre cuite restent tels quels (témoin de la liste)", () => {
    for (const n of ["tent", "townhouse", "stonehouse", "courtyard", "block", "tenement", "tower"]) {
      expect(HOUSE_CAST_SHADOW.has(n), n).toBe(false);
    }
  });
});
