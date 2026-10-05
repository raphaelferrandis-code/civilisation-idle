"use strict";
// LA CHUTE (docs/PLAN-CHUTE.md) — une scène moteur en RUINE n'est plus redessinée en
// entier à chaque frame : ses ruines sont rejouées, aux MÊMES pixels, une fois le
// relevé vérifié. (Audit du 05/10 : CHUTE-13.)
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

// La scène factice : en ruine, elle « blitte » ses bâtiments comme blitRuin
// (cityEngineSprites.js) — sur le contexte de la ruine, relevés dans `rec`.
const h = vi.hoisted(() => ({ scene: null, draws: 0 }));
vi.mock("../../engineSprites.js", () => ({
  drawEngineSprite: (...a) => { h.draws += 1; return h.scene && h.scene(...a); },
}));

import { ENGINE_RUIN } from "../../cityEngineSprites.js";
import { paintEngineFall } from "../isoChuteScene.js";
import { CHUTE } from "../chuteState.js";

const recorder = () => {
  const calls = [];
  return { calls, imageSmoothingEnabled: true, drawImage: (...a) => calls.push(a.map((v) => (typeof v === "number" ? v : v.id))) };
};
const SRC = { id: "ruine-a", naturalWidth: 20, naturalHeight: 10, width: 20, height: 10 };
const SRC2 = { id: "ruine-b", naturalWidth: 8, naturalHeight: 8, width: 8, height: 8 };
// Deux bâtiments posés en fractions de la boîte, comme le fait une scène.
function staticScene(t, bx, by, bw) {
  if (!ENGINE_RUIN.on) return;
  for (const [src, fx, fy, fw] of [[SRC, 0.1, 0.2, 0.5], [SRC2, 0.6, 0.55, 0.25]]) {
    const x = bx + bw * fx, y = by + bw * fy, w = bw * fw, hh = w * src.height / src.width;
    ENGINE_RUIN.ctx.drawImage(src, Math.round(x), Math.round(y), Math.round(w), Math.round(hh));
    if (ENGINE_RUIN.rec) ENGINE_RUIN.rec.push({ p: src.id, razed: false, x, y, w, h: hh, kx: 1, ky: 1, im: src, src });
  }
}
const RUIN = { ph: "ruin", dust: -1 };

beforeAll(() => {
  const mute = recorder();
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => mute }) });
});
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => { h.draws = 0; h.scene = staticScene; CHUTE.fall = new WeakMap(); CHUTE.fade = 0; });

describe("une scène en ruine", () => {
  it("est rejouée aux mêmes pixels une fois vérifiée, sans redessiner la scène", () => {
    const t = { gx: 3, gy: 4 };
    const frames = [];
    for (let i = 0; i < 4; i += 1) {
      const ctx = recorder();
      paintEngineFall(ctx, t, 100.3, 50.7, 96, 1000 + i * 16, RUIN);
      frames.push(ctx.calls);
    }
    expect(h.draws).toBe(2);                 // dessin, vérification, puis rejeu
    for (const f of frames) expect(f).toEqual(frames[0]);
    expect(frames[0]).toHaveLength(2);
  });

  it("redessine (et revérifie) quand la caméra bouge la boîte", () => {
    const t = { gx: 5, gy: 4 };
    for (let i = 0; i < 3; i += 1) paintEngineFall(recorder(), t, 10, 10, 96, 0, RUIN);
    expect(h.draws).toBe(2);
    const moved = recorder();
    paintEngineFall(moved, t, 12, 10, 96, 0, RUIN);
    expect(h.draws).toBe(3);
    expect(moved.calls).toHaveLength(2);
    expect(moved.calls[0][1]).toBe(Math.round(12 + 96 * 0.1));   // à la nouvelle place
  });

  it("ne rejoue jamais une scène qui bouge, ni un dessin incomplet", () => {
    const moving = { gx: 7, gy: 1 };
    h.scene = (t, bx, by, bw, bh, now) => staticScene(t, bx + (now % 3), by, bw);
    for (let i = 0; i < 5; i += 1) paintEngineFall(recorder(), moving, 10, 10, 96, i, RUIN);
    expect(h.draws).toBe(5);
    h.draws = 0;
    const loading = { gx: 8, gy: 1 };
    h.scene = (...a) => { staticScene(...a); if (ENGINE_RUIN.on) ENGINE_RUIN.miss = true; };
    for (let i = 0; i < 4; i += 1) paintEngineFall(recorder(), loading, 10, 10, 96, 0, RUIN);
    expect(h.draws).toBe(4);
  });

  it("sous le noir opaque, rien n'est peint", () => {
    CHUTE.fade = 1;
    const ctx = recorder();
    paintEngineFall(ctx, { gx: 9, gy: 9 }, 10, 10, 96, 0, RUIN);
    expect(ctx.calls).toHaveLength(0);
    expect(h.draws).toBe(0);
  });

  it("une nouvelle chute oublie les relevés de la précédente", () => {
    const t = { gx: 2, gy: 2 };
    for (let i = 0; i < 3; i += 1) paintEngineFall(recorder(), t, 10, 10, 96, 0, RUIN);
    expect(h.draws).toBe(2);
    CHUTE.fall = new WeakMap();
    paintEngineFall(recorder(), t, 10, 10, 96, 0, RUIN);
    expect(h.draws).toBe(3);
  });
});
