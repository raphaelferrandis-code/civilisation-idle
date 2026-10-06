// PALIER « AUTO » ET MOTEUR DE RENDU AFFICHÉS DANS LES OPTIONS (audit du
// 2026-10-05, PERF-4). Le palier choisi et le rendu logiciel n'étaient dits nulle
// part : un PC à 16 cœurs au GPU coupé tournait en « Élevée » sans le savoir.
// Depuis la décision de Raph du 2026-10-05 (PERF-4 = b), « Auto » s'en sert aussi
// pour choisir : rendu logiciel ou WebGL absent → « Équilibrée sans effets ».
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

// PERF-4 = b (décision de Raph du 2026-10-05) : « Auto » sur un navigateur qui dessine
// sans carte graphique prend « Équilibrée sans effets » (70 % d'habitants, LOD sous
// 0,55, ni ombre, ni reflets, ni occultation des lumières). Jamais de descente en
// cours de partie : la sonde est faite une fois. Un palier choisi à la main gagne.
describe("« Auto » sans carte graphique : Équilibrée sans effets", () => {
  // Deux nappes de pluie au lieu de quatre (PERF-23, décision de Raph du 2026-10-06).
  const NO_FX = { dpr: 1.5, citizenMul: 0.7, fps: 30, lodZoom: 0.55, fx: false, rainVeils: 2 };
  let created = 0;
  // Un document dont le WebGL annonce `name` (null : pas de WebGL du tout).
  const glDoc = (name) => ({
    createElement: () => {
      created += 1;
      return {
        getContext: () => (name === null ? null : {
          RENDERER: 0x1f01,
          getExtension: (n) => (n === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
          getParameter: () => name,
        }),
      };
    },
  });
  async function auto(doc, { dpr = 1, cores = 16, doigt = false } = {}) {
    created = 0;
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { devicePixelRatio: dpr, matchMedia: (q) => ({ matches: doigt && q.includes("coarse") }) });
    vi.stubGlobal("navigator", { hardwareConcurrency: cores, maxTouchPoints: doigt ? 5 : 0 });
    vi.resetModules();
    const q = await import("../qualityMode.js");
    q.setQualityMode("auto");
    return q;
  }

  it("rendu logiciel (le Chrome de Raph, 16 cœurs) : Équilibrée sans effets", async () => {
    const q = await auto(glDoc("ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)"));
    expect(q.autoQualityTier()).toBe("balancedNoFx");
    expect(q.qualitySettings()).toEqual(NO_FX);
  });

  it("WebGL absent : idem", async () => {
    const q = await auto(glDoc(null));
    expect(q.qualitySettings()).toEqual(NO_FX);
  });

  it("une vraie carte graphique garde Élevée", async () => {
    const q = await auto(glDoc("ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)"));
    expect(q.autoQualityTier()).toBe("high");
    expect(q.qualitySettings().fx).toBe(true);
  });

  it("Performance, plus léger, reste Performance", async () => {
    const q = await auto(glDoc("SwiftShader"), { dpr: 2, cores: 4, doigt: true });
    expect(q.autoQualityTier()).toBe("perf");
  });

  it("un choix explicite est respecté", async () => {
    const q = await auto(glDoc("SwiftShader"));
    q.setQualityMode("high");
    expect(q.qualitySettings().fx).toBe(true);
    expect(q.qualitySettings().fps).toBe(60);
  });

  it("sondé une seule fois : le palier ne change pas en cours de partie", async () => {
    const q = await auto(glDoc("SwiftShader"));
    for (let i = 0; i < 5; i += 1) expect(q.autoQualityTier()).toBe("balancedNoFx");
    expect(created).toBe(1);
  });
});
