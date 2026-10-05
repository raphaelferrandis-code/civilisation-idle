// PALIER « AUTO » ET MOTEUR DE RENDU AFFICHÉS DANS LES OPTIONS (audit du
// 2026-10-05, PERF-4). Le palier choisi et le rendu logiciel n'étaient dits nulle
// part : un PC à 16 cœurs au GPU coupé tournait en « Élevée » sans le savoir.
// On ne CHOISIT rien ici (décision à prendre avec Raph) : on le dit.
import { describe, it, expect, afterEach, vi } from "vitest";

import { isSoftwareRenderer } from "../rendererProbe.js";
import { autoQualityTier, qualitySettings, setQualityMode } from "../qualityMode.js";

afterEach(() => vi.unstubAllGlobals());

describe("rendu logiciel reconnu à son nom de pilote", () => {
  it("WARP, SwiftShader, llvmpipe : logiciel", () => {
    expect(isSoftwareRenderer("ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
  });

  it("une vraie carte graphique : non", () => {
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
    expect(isSoftwareRenderer("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
    expect(isSoftwareRenderer("")).toBe(false);
  });
});

describe("sonde WebGL : une fois, contexte rendu aussitôt", () => {
  it("lit le pilote démasqué, libère le contexte, garde le résultat", async () => {
    const lose = vi.fn();
    let created = 0;
    const gl = {
      RENDERER: 0x1f01,
      getExtension: (n) => (n === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : n === "WEBGL_lose_context" ? { loseContext: lose } : null),
      getParameter: (p) => (p === 0x9246 ? "ANGLE (Microsoft, Microsoft Basic Render Driver, D3D11)" : "WebKit WebGL"),
    };
    vi.stubGlobal("document", { createElement: () => { created += 1; return { getContext: () => gl }; } });
    vi.resetModules();
    const { probeRenderer } = await import("../rendererProbe.js");
    const r = probeRenderer();
    expect(r).toEqual({ name: "ANGLE (Microsoft, Microsoft Basic Render Driver, D3D11)", webgl: true, software: true });
    expect(lose).toHaveBeenCalledTimes(1);
    expect(probeRenderer()).toBe(r);
    expect(created).toBe(1);
  });

  it("sans WebGL : dit « indisponible », ne lève pas", async () => {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    vi.resetModules();
    const { probeRenderer } = await import("../rendererProbe.js");
    expect(probeRenderer()).toEqual({ name: null, webgl: false, software: false });
  });
});

describe("palier retenu par « Auto »", () => {
  it("un PC de bureau à 16 cœurs : Élevée — et c'est bien ce que la carte applique", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", { hardwareConcurrency: 16, maxTouchPoints: 0 });
    setQualityMode("auto");
    expect(autoQualityTier()).toBe("high");
    expect(qualitySettings().fps).toBe(60);
  });

  it("un portable HiDPI à 4 cœurs : Équilibrée", () => {
    vi.stubGlobal("window", { devicePixelRatio: 2, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", { hardwareConcurrency: 4, maxTouchPoints: 0 });
    expect(autoQualityTier()).toBe("balanced");
  });
});
