// L'OMBRE DES DRONES SUIT CELLE DU SOLEIL (audit 2026-10-05, BUG-99 ; choix (a) de Raph).
// C'était une ellipse noire fixe : la nuit, aux ères cosmiques, les drones gardaient une
// ombre au sol quand plus rien d'autre n'en projetait. Elle prend désormais la teinte,
// le mode et la force du moment de l'ombre solaire (sunShadowAlpha).
import { afterEach, describe, expect, it } from "vitest";
import { CM } from "../layout.js";
import { SUN_SHADOW } from "../iso/isoSunShadow.js";
import { drawIsoDrones } from "../iso/isoSky.js";

// Un contexte qui note chaque remplissage : couleur, alpha, mode.
function fakeCtx() {
  const fills = [];
  const ctx = {
    globalAlpha: 1, globalCompositeOperation: "source-over", fillStyle: "#000", imageSmoothingEnabled: false,
    beginPath() {}, ellipse() {},
    fill() { fills.push({ col: ctx.fillStyle, a: ctx.globalAlpha, op: ctx.globalCompositeOperation }); },
    save() {}, restore() {}, translate() {}, rotate() {}, drawImage() {},
  };
  return { ctx, fills };
}
const saved = { night: CM.nightF, lod: CM.lodActive, fx: CM.fxOn, cam: CM.cam, ctx: CM.ctx, veh: CM.vehicles, cw: CM.cw, ch: CM.ch, tile: CM.TILE };
afterEach(() => { Object.assign(CM, { nightF: saved.night, lodActive: saved.lod, fxOn: saved.fx, cam: saved.cam, ctx: saved.ctx, vehicles: saved.veh, cw: saved.cw, ch: saved.ch, TILE: saved.tile }); });

function frame({ night = 0, zoom = 1, fxOn = true } = {}) {
  const { ctx, fills } = fakeCtx();
  Object.assign(CM, { TILE: 32, cw: 800, ch: 600, ctx, nightF: night, lodActive: false, fxOn, cam: { x: 0, y: 0, zoom } });
  CM.vehicles = [{ type: "drone", x: 10, y: 10, tx: 40, ty: 10, fade: 1 }];
  drawIsoDrones(1000);
  return fills;
}

describe("l'ombre des drones", () => {
  it("de jour : la teinte et le mode de l'ombre du soleil, à sa force", () => {
    const f = frame();
    expect(f).toHaveLength(1);
    expect(f[0].col).toBe(SUN_SHADOW.col);
    expect(f[0].op).toBe(SUN_SHADOW.mode || "source-over");
    expect(f[0].a).toBeCloseTo(0.12, 5);
  });
  it("la nuit, au palier « perf » et en vue lointaine : plus d'ombre", () => {
    expect(frame({ night: 1 })).toHaveLength(0);
    expect(frame({ fxOn: false })).toHaveLength(0);
    expect(frame({ zoom: 0.5 })).toHaveLength(0);
  });
});
