// LES COMPTEURS DE LA PETITE VIE NE TOURNENT PLUS EN PROD (audit du 05/10, MORT-6).
// vieCount incrémentait une clé et poussait jusqu'à six tableaux neufs par couche et
// par frame, depuis ~25 sites, pour la seule console de dev (__vieStats). La sonde est
// éteinte au chargement et armée par le premier __vieStats(), qui n'existe qu'en dev —
// rejoué ici en changeant import.meta.env.DEV avant de réimporter le module.
import { describe, it, expect, vi, afterEach } from "vitest";

let prevWindow;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("../layout.js");
  if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
});
async function freshVie(dev) {
  prevWindow = globalThis.window;
  globalThis.window = {};
  vi.resetModules();
  // isoVie ne lit du plan que CM (taille d'un pixel d'art) : sans le vrai layout.js,
  // le test ne charge pas la partie entière à chaque réimport.
  vi.doMock("../layout.js", () => ({ CM: {} }));
  vi.stubEnv("DEV", dev);
  return import("../iso/isoVie.js");
}

describe("compteurs de la petite vie", () => {
  it("hors dev : ni __vieStats, et vieCount ne compte rien", async () => {
    const m = await freshVie(false);
    expect(globalThis.window.__vieStats).toBeUndefined();
    expect(m.vieProbe.on).toBe(false);
    m.vieCount("canards");
    m.vieCount("canards", 3);
    expect(m.vieStats.canards).toBeUndefined();
  });

  it("en dev : éteinte au chargement, armée par le premier __vieStats(), puis compte et se remet à zéro", async () => {
    const m = await freshVie(true);
    expect(m.vieProbe.on).toBe(false);
    m.vieCount("canards");
    expect(m.vieStats.canards).toBeUndefined();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      globalThis.window.__vieStats();
    } finally {
      info.mockRestore();
    }
    expect(m.vieProbe.on).toBe(true);
    m.vieCount("canards");
    m.vieCount("canards", 2);
    expect(globalThis.window.__vieStats().canards).toBe(3);
    m.vieResetStats();
    expect(m.vieStats.canards).toBe(0);
  });
});
