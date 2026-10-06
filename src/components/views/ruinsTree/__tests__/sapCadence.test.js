// CADENCE DE LA SÈVE DE L'ARBRE DES RUINES (décision de Raph du 2026-10-05,
// PERF-40 = B) : ~15 i/s avec une carte graphique, ~8 i/s seulement quand le
// navigateur dessine sans (rendu logiciel reconnu ou WebGL absent) — là, chaque
// image du calque agrandi coûtait près d'un cœur.
import { describe, it, expect, afterEach, vi } from "vitest";

import { SAP_FRAME_MS, sapFrameMs } from "../sapRenderer.js";

afterEach(() => vi.unstubAllGlobals());

const glDoc = (name) => ({
  createElement: () => ({
    getContext: () => (name === null ? null : {
      RENDERER: 0x1f01,
      getExtension: (n) => (n === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
      getParameter: () => name,
    }),
  }),
});

async function cadence(doc) {
  vi.stubGlobal("document", doc);
  vi.resetModules();
  const { slowRenderer } = await import("../../../../game/map/rendererProbe.js");
  return sapFrameMs(slowRenderer());
}

describe("sève : 8 i/s sans carte graphique, 15 i/s sinon", () => {
  it("les deux cadences", () => {
    expect(SAP_FRAME_MS).toEqual({ gpu: 66, soft: 125 });
  });

  it("rendu logiciel ou WebGL absent : ~8 i/s", async () => {
    expect(await cadence(glDoc("ANGLE (Microsoft, Microsoft Basic Render Driver, D3D11)"))).toBe(125);
    expect(await cadence(glDoc(null))).toBe(125);
  });

  it("une vraie carte graphique : ~15 i/s, rien ne change", async () => {
    expect(await cadence(glDoc("ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)"))).toBe(66);
  });
});
