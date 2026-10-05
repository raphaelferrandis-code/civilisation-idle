// LE PROCESSUS PRINCIPAL DE L'.EXE (audit 2026-10-05, BUG-18) : main.cjs n'écoutait
// ni `render-process-gone` ni `unresponsive` — un plantage du moteur de rendu
// laissait une fenêtre blanche, sans aucune trace pour le support. main.cjs est
// chargé ici tel quel, avec un faux module `electron` : ce test garde le câblage
// (journal dans userData/logs, rechargement borné, question sans fermeture).
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const MAIN = path.resolve(__dirname, "../../main.cjs");
const realExists = fs.existsSync;

function fakeElectron(userData) {
  const ready = [];
  const windows = [];
  const app = Object.assign(new EventEmitter(), {
    commandLine: { appendSwitch() {} },
    requestSingleInstanceLock: () => true,
    quit: vi.fn(),
    whenReady: () => ({ then: (fn) => { ready.push(fn); } }),
    getPath: (name) => (name === "userData" ? userData : os.tmpdir()),
  });
  class BrowserWindow extends EventEmitter {
    constructor() {
      super();
      this.webContents = Object.assign(new EventEmitter(), { reload: vi.fn(), setWindowOpenHandler() {} });
      this.close = vi.fn();
      windows.push(this);
    }
    loadURL() {}
    isDestroyed() { return false; }
    static getAllWindows() { return windows; }
  }
  // Une question reste ouverte tant que le test ne la tranche pas.
  const asked = [];
  const dialog = {
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn((_win, options) => new Promise((resolve) => {
      asked.push({ options, answer: (response) => resolve({ response }) });
      options.signal?.addEventListener("abort", () => resolve({ response: options.cancelId ?? 0 }));
    })),
  };
  const electron = { app, BrowserWindow, dialog, protocol: { registerSchemesAsPrivileged() {}, handle() {} }, net: { fetch() {} } };
  return { ready, windows, asked, dialog, electron };
}

// Charge main.cjs avec le faux `electron`, déclenche app.whenReady, rend la fenêtre.
const tempDirs = [];
function boot() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "civ-electron-test-"));
  tempDirs.push(userData);
  const fake = fakeElectron(userData);
  const electronId = require.resolve("electron");
  require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: fake.electron };
  delete require.cache[MAIN];
  // dist/ n'est pas construit en CI au moment des tests : on le dit présent.
  vi.spyOn(fs, "existsSync").mockImplementation((p) => (String(p).endsWith("index.html") ? true : realExists(p)));
  require(MAIN);
  fake.ready.forEach((fn) => fn());
  const logFile = path.join(userData, "logs", "civilisation.log");
  const journal = () => (realExists(logFile) ? fs.readFileSync(logFile, "utf8") : "");
  return { ...fake, win: fake.windows[0], journal, userData };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete require.cache[MAIN];
  delete require.cache[require.resolve("electron")];
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("main.cjs — garde-fous du moteur de rendu", () => {
  it("moteur de rendu disparu : journalisé, page rechargée ; trois fois en une minute, on demande au lieu de boucler", () => {
    const { win, journal, dialog } = boot();
    expect(win).toBeTruthy();
    win.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: -1 });
    expect(win.webContents.reload).toHaveBeenCalledTimes(1);
    expect(journal()).toMatch(/moteur de rendu disparu : crashed/);
    // Sortie propre (fermeture) : rien à recharger.
    win.webContents.emit("render-process-gone", {}, { reason: "clean-exit", exitCode: 0 });
    expect(win.webContents.reload).toHaveBeenCalledTimes(1);
    win.webContents.emit("render-process-gone", {}, { reason: "oom", exitCode: -2 });
    expect(win.webContents.reload).toHaveBeenCalledTimes(2);
    win.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: -1 });
    expect(win.webContents.reload).toHaveBeenCalledTimes(2);
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(win.close).not.toHaveBeenCalled();
  });

  it("page figée : une seule question, refermée d'elle-même quand la page répond de nouveau", async () => {
    const { win, journal, dialog, asked } = boot();
    win.emit("unresponsive");
    win.emit("unresponsive");
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(asked[0].options.signal).toBeTruthy();
    win.emit("responsive");
    await Promise.resolve();
    await Promise.resolve();
    expect(asked[0].options.signal.aborted).toBe(true);
    expect(win.webContents.reload).not.toHaveBeenCalled();
    expect(win.close).not.toHaveBeenCalled();
    expect(journal()).toMatch(/ne répond plus[\s\S]*répond de nouveau/);
    // Figée de nouveau, le joueur choisit « Recharger ».
    win.emit("unresponsive");
    asked[1].answer(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(win.webContents.reload).toHaveBeenCalledTimes(1);
  });

  it("les questions suivent la langue du jeu, relevée au chargement de la page (français par défaut)", async () => {
    const { win, asked } = boot();
    win.emit("unresponsive");
    expect(asked[0].options.message).toBe("Le jeu ne répond plus.");
    asked[0].answer(0);
    await new Promise((r) => setTimeout(r, 0));
    // Jeu réglé en anglais : la page le dit à chaque chargement.
    win.webContents.executeJavaScript = vi.fn(() => Promise.resolve("en"));
    win.webContents.emit("did-finish-load");
    await new Promise((r) => setTimeout(r, 0));
    win.emit("unresponsive");
    expect(asked[1].options.message).toBe("The game is not responding.");
    expect(asked[1].options.buttons).toEqual(["Wait", "Reload"]);
  });

  it("erreurs de la page recopiées au journal, une rafale identique écrite une fois avec son compte", () => {
    const { win, journal } = boot();
    win.webContents.emit("console-message", { level: "info", message: "bavardage" });
    for (let i = 0; i < 50; i += 1) {
      win.webContents.emit("console-message", { level: "error", message: "TypeError: x is undefined", sourceId: "app://localhost/assets/index.js", lineNumber: 12 });
    }
    win.webContents.emit("console-message", { level: "error", message: "Autre erreur" });
    const text = journal();
    expect(text).not.toMatch(/bavardage/);
    expect(text.match(/TypeError: x is undefined/g)).toHaveLength(1);
    expect(text).toMatch(/répétée 49 fois/);
    expect(text).toMatch(/Autre erreur/);
  });
});
