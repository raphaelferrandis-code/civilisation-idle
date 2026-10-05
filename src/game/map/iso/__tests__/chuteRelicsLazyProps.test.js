// LE NOIR DE LA CHUTE ATTEND LES DÉCORS DES SCÈNES JAMAIS VUES (audit du 05/10, ASSET-5).
// Les décors des scènes moteur se chargent désormais à la demande. Avant, les 211 PNG
// partaient au premier dessin de la partie : au relevé des ruines (le noir), toute la
// cité était décodée, scènes jamais vues comprises. Maintenant, une scène restée hors
// de l'écran ne demande les siens qu'au relevé à blanc du début de la chute — et tant
// que son décor de tête manque, elle se dessine en repli, sans demander ses autres
// pièces ni leurs ruines. Garde : le noir attend les décors en route, et refait son
// relevé à blanc quand il en est arrivé (version des props changée).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({ ver: 1, loading: 0 }));
vi.mock("../../cityEngineSprites.js", async (orig) => ({
  ...(await orig()), getPropVersion: () => h.ver, propsLoading: () => h.loading,
}));
vi.mock("../isoChuteScene.js", async (orig) => ({ ...(await orig()), drawEngineRuin: vi.fn(() => true) }));

import { CM } from "../../layout.js";
import { state } from "../../../core/state.js";
import { chuteFrame } from "../isoChute.js";
import { drawEngineRuin } from "../isoChuteScene.js";
import { CHUTE } from "../chuteState.js";
import { abortCityFall, playCityFall } from "../../cityMapBridge.js";

const T = CM.TILE;
const saved = {};
beforeEach(() => {
  vi.useFakeTimers();
  for (const k of ["layout", "canvas", "cam", "cw", "ch", "citizens", "vehicles", "citizenTarget", "nightF", "focus", "camGoal", "zoomGoal"]) saved[k] = CM[k];
  // Une cité d'UNE scène moteur, cœur en 20,20 : chaque relevé (à blanc ou au noir) la
  // dessine en ruine une fois — drawEngineRuin compte les relevés.
  CM.layout = {
    tiles: [{ type: "engine", buildingId: "markets", gx: 12, gy: 12, size: 2 }],
    gridN: 40, cx: 20, cy: 20, plan: { core: { x: 20, y: 20 } }, mapSeed: state.mapSeed >>> 0,
  };
  CM.canvas = { isConnected: true };
  CM.cam = { x: 20.5 * T, y: 20.5 * T, zoom: 1 };
  CM.cw = 1200; CM.ch = 700;
  drawEngineRuin.mockClear();
  h.ver = 1; h.loading = 0;
});
afterEach(() => {
  abortCityFall();
  vi.useRealTimers();
  Object.assign(CM, saved);
  CHUTE.scrub = null;
});

// Joue la chute jusqu'au noir ; rend l'état de la promesse (null tant qu'elle attend).
function fallToBlack() {
  const out = { done: null };
  playCityFall().then((v) => { out.done = v; });
  CHUTE.scrub = 1e6;                       // bien après le fondu : le noir est atteint
  chuteFrame();
  return out;
}

describe("le noir de la chute et les décors chargés à la demande", () => {
  it("rien en route, rien d'arrivé : un seul relevé à blanc, le noir passe aussitôt", async () => {
    const st = fallToBlack();
    await vi.advanceTimersByTimeAsync(0);
    expect(drawEngineRuin).toHaveBeenCalledTimes(1);   // le relevé à blanc du début
    expect(st.done).toBe(true);
  });

  it("des décors en route : le noir les attend, puis refait le relevé à blanc", async () => {
    h.loading = 3;                         // le relevé à blanc vient de les demander
    const st = fallToBlack();
    await vi.advanceTimersByTimeAsync(300);
    expect(st.done).toBe(null);            // le noir tient
    expect(drawEngineRuin).toHaveBeenCalledTimes(1);
    h.loading = 0; h.ver = 2;              // arrivés : la scène ouvre sa branche peinte
    await vi.advanceTimersByTimeAsync(100);
    // Le relevé refait demande ses autres pièces et leurs ruines…
    expect(drawEngineRuin).toHaveBeenCalledTimes(2);
    // … et rien n'étant plus en route, le noir rend la main au relevé définitif.
    expect(st.done).toBe(true);
  });

  it("un relevé refait qui demande encore : le noir attend aussi ceux-là", async () => {
    h.loading = 1;
    const st = fallToBlack();
    await vi.advanceTimersByTimeAsync(100);
    h.ver = 2;                             // le décor de tête est là, ses pièces partent
    drawEngineRuin.mockImplementationOnce(() => { h.loading = 2; return false; });
    h.loading = 0;
    await vi.advanceTimersByTimeAsync(100);
    expect(drawEngineRuin).toHaveBeenCalledTimes(2);
    expect(st.done).toBe(null);
    h.loading = 0; h.ver = 3;
    await vi.advanceTimersByTimeAsync(100);
    expect(drawEngineRuin).toHaveBeenCalledTimes(3);
    expect(st.done).toBe(true);
  });
});
