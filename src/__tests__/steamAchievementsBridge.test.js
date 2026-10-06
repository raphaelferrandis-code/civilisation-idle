// LE PONT DES SUCCÈS STEAM (audit 2026-10-05, STEAM-9) — desktopFiles.cjs, chargé
// tel quel. Pont OPTIONNEL : steamworks.js n'est pas installé, l'App ID pas encore
// attribué. Ce qui doit tenir : rien ne casse sans module, sans App ID ou sans
// Steam ; un succès déjà actif n'est pas réactivé ; la page ne peut envoyer que des
// noms d'API bien formés.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { resolveSteamAppId, sanitizeAchievementIds, createSteamAchievements } = require("../../desktopFiles.cjs");

const tempDirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civ-steam-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

// Un steamworks.js de théâtre : init(appId) rend l'API des succès.
function fakeSteamworks(active = []) {
  const unlocked = new Set(active);
  const api = {
    achievement: {
      isActivated: vi.fn((id) => unlocked.has(id)),
      activate: vi.fn((id) => { if (id === "INCONNU") return false; unlocked.add(id); return true; }),
    },
  };
  return { init: vi.fn(() => api), api, unlocked };
}

describe("App ID", () => {
  it("constante, sinon SteamAppId du client Steam, sinon steam_appid.txt ; rien de valide = pas de pont", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "steam_appid.txt"), " 480\n");
    expect(resolveSteamAppId({ constant: "123", env: { SteamAppId: "456" }, dirs: [dir] })).toBe(123);
    expect(resolveSteamAppId({ constant: "", env: { SteamAppId: "456" }, dirs: [dir] })).toBe(456);
    expect(resolveSteamAppId({ constant: "", env: {}, dirs: [path.join(dir, "absent"), dir] })).toBe(480);
    expect(resolveSteamAppId({ constant: "abc", env: { SteamAppId: "0" }, dirs: [] })).toBe(null);
  });
});

describe("noms d'API reçus de la page", () => {
  it("garde les noms bien formés, sans doublon", () => {
    expect(sanitizeAchievementIds(["CHUTE_10", "CHUTE_10", "pas bon", 7, null, "ERE_HAMEAU"])).toEqual(["CHUTE_10", "ERE_HAMEAU"]);
    expect(sanitizeAchievementIds("CHUTE_10")).toEqual([]);
    expect(sanitizeAchievementIds(new Array(400).fill(0).map((_, i) => `A_${i}`))).toHaveLength(256);
  });
});

describe("le pont", () => {
  it("active seulement ce qui manque, une seule initialisation", () => {
    const sw = fakeSteamworks(["CHUTE_PREMIERE"]);
    const log = vi.fn();
    const bridge = createSteamAchievements({ appId: 480, load: () => sw, log });
    expect(bridge.unlock(["CHUTE_PREMIERE", "CHUTE_10"])).toBe(1);
    expect(sw.api.achievement.activate).toHaveBeenCalledTimes(1);
    expect(sw.api.achievement.activate).toHaveBeenCalledWith("CHUTE_10");
    expect(bridge.unlock(["CHUTE_10"])).toBe(0);
    expect(sw.init).toHaveBeenCalledTimes(1);
    expect(sw.init).toHaveBeenCalledWith(480);
    expect(bridge.isReady()).toBe(true);
  });

  it("un nom inconnu de Steamworks est noté une seule fois au journal", () => {
    const sw = fakeSteamworks();
    const log = vi.fn();
    const bridge = createSteamAchievements({ appId: 480, load: () => sw, log });
    bridge.unlock(["INCONNU"]);
    bridge.unlock(["INCONNU"]);
    expect(log.mock.calls.filter(([line]) => line.includes("INCONNU"))).toHaveLength(1);
  });

  it("sans App ID : steamworks.js n'est même pas chargé", () => {
    const load = vi.fn();
    const bridge = createSteamAchievements({ appId: null, load });
    expect(bridge.start()).toBe(null);
    expect(bridge.unlock(["CHUTE_10"])).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });

  it("module absent ou Steam fermé : le pont s'éteint pour la session, sans jeter", () => {
    const log = vi.fn();
    const load = vi.fn(() => { throw new Error("Cannot find module 'steamworks.js'"); });
    const bridge = createSteamAchievements({ appId: 480, load, log });
    expect(() => bridge.start()).not.toThrow();
    expect(bridge.unlock(["CHUTE_10"])).toBe(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(bridge.isReady()).toBe(false);
    // init qui jette (client Steam fermé) : même issue.
    const closed = createSteamAchievements({ appId: 480, load: () => ({ init: () => { throw new Error("Steam is not running"); } }), log: () => {} });
    expect(closed.unlock(["CHUTE_10"])).toBe(0);
  });
});
