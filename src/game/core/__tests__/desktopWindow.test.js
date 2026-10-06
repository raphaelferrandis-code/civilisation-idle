// LA CITÉ VIT FENÊTRE RÉDUITE DANS L'.EXE (audit 2026-10-05, ELEC-6, décision B de
// Raph). Avant : une fenêtre réduite — ou couverte, sous Windows — était un onglet
// caché ; le tick passait en 'skip' et le retour créditait l'absence, plafonnée.
// Désormais, dans l'.exe (pont civWindow du préload, backgroundThrottling coupé par
// main.cjs) : le tick ne tient jamais la page pour cachée, la carte seule cesse de
// peindre fenêtre réduite, et le navigateur garde l'ancien régime.
import { describe, it, expect, afterEach, vi } from "vitest";

import {
  livesInBackground, pageHiddenForTick, isWindowMinimized, onWindowMinimizedChange, resetDesktopWindowForTests,
} from "../desktopWindow.js";
import { decideTickCredit } from "../offlineCredit.js";
import { mapFrameMs, setEnergySaver } from "../../map/energySaver.js";

// Le pont du préload, tel que preload.cjs l'expose (minimize / restore relayés).
function fakeBridge({ minimized = false } = {}) {
  const listeners = new Set();
  const bridge = {
    livesInBackground: true,
    isMinimized: () => minimized,
    onMinimizedChange: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    emit(on) { minimized = on; for (const cb of listeners) cb(on); },
  };
  return bridge;
}

afterEach(() => {
  resetDesktopWindowForTests();
  vi.unstubAllGlobals();
  setEnergySaver(true);
});

describe("navigateur : rien ne change", () => {
  it("pas de pont : un onglet caché reste caché pour le tick (régime d'absence)", () => {
    vi.stubGlobal("document", { hidden: true, hasFocus: () => false });
    expect(livesInBackground()).toBe(false);
    expect(pageHiddenForTick()).toBe(true);
    expect(decideTickCredit(1, pageHiddenForTick()).mode).toBe("skip");
    expect(isWindowMinimized()).toBe(false);
  });
});

describe(".exe : la cité vit en arrière-plan", () => {
  it("le tick ne tient jamais la page pour cachée : fenêtre réduite = temps de jeu en direct", () => {
    vi.stubGlobal("window", { civWindow: fakeBridge({ minimized: true }) });
    vi.stubGlobal("document", { hidden: true, hasFocus: () => false });
    expect(livesInBackground()).toBe(true);
    expect(pageHiddenForTick()).toBe(false);
    expect(decideTickCredit(1, pageHiddenForTick())).toEqual({ mode: "live", seconds: 1 });
    // Une vraie veille reste une absence : l'écart mural passe au hors-ligne.
    expect(decideTickCredit(3600, pageHiddenForTick())).toEqual({ mode: "offline", seconds: 3600 });
  });

  it("réduite au lancement, puis rendue : l'état suit le pont, les écouteurs sont prévenus", () => {
    const bridge = fakeBridge({ minimized: true });
    vi.stubGlobal("window", { civWindow: bridge });
    const seen = [];
    onWindowMinimizedChange((on) => seen.push(on));
    expect(isWindowMinimized()).toBe(true);
    bridge.emit(false);
    expect(isWindowMinimized()).toBe(false);
    bridge.emit(true);
    expect(seen).toEqual([false, true]);
  });

  it("fenêtre réduite : la carte ne peint plus (cap infini), économiseur éteint ou chute en cours", () => {
    const bridge = fakeBridge();
    vi.stubGlobal("window", { civWindow: bridge });
    vi.stubGlobal("document", { hidden: false, hasFocus: () => true });
    const HIGH = 1000 / 60;
    expect(mapFrameMs(HIGH, 0)).toBe(HIGH);
    bridge.emit(true);
    expect(mapFrameMs(HIGH, 0)).toBe(Infinity);
    expect(mapFrameMs(HIGH, 0, true)).toBe(Infinity);
    setEnergySaver(false);
    expect(mapFrameMs(HIGH, 0)).toBe(Infinity);
    // Rendue : la cadence du préréglage revient à la frame suivante.
    bridge.emit(false);
    expect(mapFrameMs(HIGH, 0)).toBe(HIGH);
  });
});
