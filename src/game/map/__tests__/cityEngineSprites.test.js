import { describe, it, expect } from "vitest";

import { drawCityEngineSprite } from "../cityEngineSprites.js";

// cityEngineSprites.js porte un `/* eslint-disable */` : no-undef n'y est PAS
// vérifié. Ce smoke-test exécute donc réellement le sprite pour attraper toute
// variable indéfinie / erreur runtime, sur tous les stades d'ère et tiers.

// Mini-mock de CanvasRenderingContext2D : no-op + compteur de fillRect pour
// vérifier qu'on dessine effectivement quelque chose.
function makeCtx() {
  const ctx = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt",
    globalAlpha: 1, globalCompositeOperation: "source-over",
    _fills: 0,
  };
  for (const m of [
    "beginPath", "moveTo", "lineTo", "arc", "ellipse", "closePath", "fill",
    "stroke", "save", "restore", "translate", "rotate", "scale",
    "quadraticCurveTo", "arcTo", "rect", "strokeRect",
  ]) ctx[m] = () => {};
  ctx.fillRect = () => { ctx._fills += 1; };
  return ctx;
}

// Reproduit la construction du contexte dans engineSprites.js (helpers px/strokeRect).
function makeContext({ id, ei, tier, now }) {
  const ctx = makeCtx();
  const ox = 0, oy = 0, sw = 64, sh = 80;          // emprise rectangulaire (large × profonde)
  const px = (rx, ry, rw, rh, col) => { ctx.fillStyle = col; ctx.fillRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  const strokeRect = (rx, ry, rw, rh, col) => { ctx.strokeStyle = col; ctx.strokeRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  return {
    ctx, id, tier, ox, oy, sw, sh, px, strokeRect, now,
    litWarm: `rgba(255,204,68,0.45)`, litGold: `rgba(255,220,120,0.50)`,
    band: 0, ei, gw: 4, gh: 4,
  };
}

describe("drawCityEngineSprite — water_mills", () => {
  // Un âge représentatif par stade (ei<10/<20/<30/sinon).
  const stages = [{ ei: 4 }, { ei: 14 }, { ei: 24 }, { ei: 32 }];

  it("dessine les 4 stades d'ère pour chaque tier sans planter", () => {
    for (const { ei } of stages) {
      for (const tier of [0, 1, 2]) {
        for (const now of [0, 1234]) {
          const c = makeContext({ id: "water_mills", ei, tier, now });
          let result;
          expect(() => { result = drawCityEngineSprite(c); }).not.toThrow();
          expect(result).toBe(true);          // le sprite est pris en charge
          expect(c.ctx._fills).toBeGreaterThan(0); // il a effectivement dessiné
        }
      }
    }
  });
});
