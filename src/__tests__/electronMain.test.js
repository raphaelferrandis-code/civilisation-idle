// LE PROCESSUS PRINCIPAL DE L'.EXE (audit 2026-10-05, BUG-18) : main.cjs n'écoutait
// ni `render-process-gone` ni `unresponsive` — un plantage du moteur de rendu
// laissait une fenêtre blanche, sans aucune trace pour le support. main.cjs est
// chargé ici tel quel, avec un faux module `electron` : ce test garde le câblage
// (journal dans userData/logs, rechargement borné, question sans fermeture), puis
// ceux de la sortie Steam (audit 2026-10-05) : dossier de la save figé (STEAM-4),
// save en fichier par IPC, menu et DevTools retirés de l'.exe (ELEC-1), fenêtre
// retrouvée, plein écran (ELEC-2), Drive cherché hors du préload (ELEC-3).
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const MAIN = path.resolve(__dirname, "../../main.cjs");
const realExists = fs.existsSync;
const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1040 };

// `appData` : dossier temporaire du test — %APPDATA% n'est JAMAIS touché.
function fakeElectron(appData, { packaged = false } = {}) {
  const ready = [];
  const windows = [];
  const calls = []; // ordre des appels qui comptent (setPath avant le verrou)
  const switches = [];
  const paths = { appData, userData: path.join(appData, "Electron"), documents: path.join(appData, "Documents") };
  const app = Object.assign(new EventEmitter(), {
    isPackaged: packaged,
    commandLine: { appendSwitch: (name) => { switches.push(name); } },
    requestSingleInstanceLock: () => { calls.push("lock"); return true; },
    quit: vi.fn(),
    whenReady: () => ({ then: (fn) => { ready.push(fn); } }),
    getPath: (name) => paths[name] || os.tmpdir(),
    setPath: (name, value) => { calls.push(`setPath:${name}`); paths[name] = value; },
  });
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.fullscreen = false;
      this.maximized = false;
      this.visible = false;
      this.webContents = Object.assign(new EventEmitter(), {
        reload: vi.fn(),
        setWindowOpenHandler() {},
        setVisualZoomLevelLimits: vi.fn(() => Promise.resolve()),
        send: vi.fn(),
        toggleDevTools: vi.fn(),
        getURL: () => "app://localhost/",
      });
      this.close = vi.fn();
      this.maximize = vi.fn(() => { this.maximized = true; this.visible = true; });
      this.show = vi.fn(() => { this.visible = true; });
      this.setFullScreen = vi.fn((on) => { this.fullscreen = on; });
      windows.push(this);
    }
    loadURL() {}
    isDestroyed() { return false; }
    isVisible() { return this.visible; }
    isMinimized() { return false; }
    isMaximized() { return this.maximized; }
    isFullScreen() { return this.fullscreen; }
    getNormalBounds() { return { x: 100, y: 80, width: 1280, height: 720 }; }
    static getAllWindows() { return windows; }
    static fromWebContents(contents) { return windows.find((w) => w.webContents === contents) || null; }
  }
  // Une question reste ouverte tant que le test ne la tranche pas.
  const asked = [];
  const dialog = {
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn((_win, options) => new Promise((resolve) => {
      asked.push({ options, answer: (response) => resolve({ response }) });
      options.signal?.addEventListener("abort", () => resolve({ response: options.cancelId ?? 0 }));
    })),
    // Réponse du dialogue d'enregistrement : posée par le test (saveDialogAnswer).
    showSaveDialog: vi.fn(async () => dialog.saveDialogAnswer || { canceled: true }),
  };
  const ipcHandlers = {};
  const ipcMain = {
    on: (channel, fn) => { ipcHandlers[channel] = fn; },
    handle: (channel, fn) => { ipcHandlers[channel] = fn; },
  };
  const Menu = { setApplicationMenu: vi.fn() };
  const screen = {
    getPrimaryDisplay: () => ({ workArea: WORK_AREA }),
    getAllDisplays: () => [{ workArea: WORK_AREA }],
  };
  const schemes = [];
  const protocol = {
    registerSchemesAsPrivileged: (list) => { schemes.push(...list); },
    handle: (scheme, fn) => { protocol.handlers[scheme] = fn; },
    handlers: {},
  };
  // net.fetch(file://…) : le contenu « servi », sans toucher au disque.
  const net = { fetch: vi.fn(async () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } })) };
  const permissions = {};
  const session = { defaultSession: { setPermissionRequestHandler: (fn) => { permissions.handler = fn; } } };
  const electron = { app, BrowserWindow, Menu, dialog, ipcMain, screen, protocol, net, session };
  return { ready, windows, asked, dialog, electron, calls, paths, ipcHandlers, Menu, switches, schemes, protocol, net, permissions };
}

// Un message du préload : `returnValue` (envoi synchrone) se lit dans `reply`,
// une promesse — main.cjs peut le poser plus tard (recherche de Drive).
function ipc(fake, channel, { url = "app://localhost/", sender } = {}, ...args) {
  let resolve;
  const reply = new Promise((r) => { resolve = r; });
  const event = {
    senderFrame: { url },
    sender: sender || fake.windows[0]?.webContents,
    set returnValue(value) { resolve(value); },
  };
  fake.ipcHandlers[channel](event, ...args);
  return reply;
}

// Charge main.cjs avec le faux `electron`, déclenche app.whenReady, rend la fenêtre.
const tempDirs = [];
const booted = [];
function boot({ packaged = false, env = {} } = {}) {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), "civ-electron-test-"));
  tempDirs.push(appData);
  const fake = fakeElectron(appData, { packaged });
  const electronId = require.resolve("electron");
  require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: fake.electron };
  delete require.cache[MAIN];
  // dist/ n'est pas construit en CI au moment des tests : on le dit présent.
  vi.spyOn(fs, "existsSync").mockImplementation((p) => (String(p).endsWith("index.html") ? true : realExists(p)));
  const savedEnv = {
    CE_USER_DATA: process.env.CE_USER_DATA, CIV_DEVTOOLS: process.env.CIV_DEVTOOLS,
    SteamAppId: process.env.SteamAppId, SteamGameId: process.env.SteamGameId,
  };
  // Le poste de test n'est jamais « lancé par Steam », sauf si le test le demande.
  delete process.env.SteamAppId;
  delete process.env.SteamGameId;
  Object.assign(process.env, env);
  try {
    require(MAIN);
  } finally {
    for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  booted.push(fake);
  // Après un setPath éventuel : c'est là que vit la partie.
  const userData = fake.paths.userData;
  fake.ready.forEach((fn) => fn());
  const logFile = path.join(userData, "logs", "civilisation.log");
  const journal = () => (realExists(logFile) ? fs.readFileSync(logFile, "utf8") : "");
  return { ...fake, win: fake.windows[0], journal, userData, appData };
}

afterEach(async () => {
  vi.restoreAllMocks();
  // La recherche de Drive (asynchrone) écrit sa mémoire dans userData : on
  // l'attend avant d'effacer les dossiers du test.
  for (const fake of booted.splice(0)) {
    if (fake.ipcHandlers["cloud:init"]) await ipc(fake, "cloud:init", { sender: {} });
  }
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

describe("main.cjs — dossier et fichier de la save (STEAM-4)", () => {
  it("userData figé sur %APPDATA%\\civilisation-effondrement, AVANT le verrou d'instance unique", () => {
    const { calls, userData, appData } = boot();
    expect(userData).toBe(path.join(appData, "civilisation-effondrement"));
    expect(calls.indexOf("setPath:userData")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("setPath:userData")).toBeLessThan(calls.indexOf("lock"));
  });

  it("CE_USER_DATA (tests) remplace le dossier — jamais la vraie partie", () => {
    const dir = path.join(os.tmpdir(), `civ-ce-user-data-${process.pid}`);
    tempDirs.push(dir);
    const { userData } = boot({ env: { CE_USER_DATA: dir } });
    expect(userData).toBe(path.resolve(dir));
  });

  it("l'hôte de la page reste app://localhost/ (origine du localStorage = la save)", () => {
    const source = fs.readFileSync(MAIN, "utf8");
    expect(source).toMatch(/win\.loadURL\("app:\/\/localhost\/"\)/);
  });

  it("save en fichier par IPC : écrite dans userData/saves/save.json, relue, effacée ; refusée hors du jeu", async () => {
    const fake = boot();
    const file = path.join(fake.userData, "saves", "save.json");
    expect(await ipc(fake, "save:read")).toEqual({ status: "none", text: null });
    // `save:write` n'attend pas de réponse (envoi asynchrone côté page).
    fake.ipcHandlers["save:write"]({ senderFrame: { url: "app://localhost/" } }, '{"a":2}');
    expect(fs.readFileSync(file, "utf8")).toBe('{"a":2}');
    expect(await ipc(fake, "save:write-sync", {}, '{"a":3}')).toBe(true);
    expect(await ipc(fake, "save:read")).toEqual({ status: "ok", text: '{"a":3}' });
    // Une page qui ne serait pas le jeu n'y touche pas.
    expect(await ipc(fake, "save:write-sync", { url: "https://exemple.test/" }, '{"pirate":1}')).toBe(false);
    expect(await ipc(fake, "save:read", { url: "https://exemple.test/" })).toEqual({ status: "error", text: null });
    expect(fs.readFileSync(file, "utf8")).toBe('{"a":3}');
    expect(await ipc(fake, "save:clear")).toBe(true);
    expect(realExists(file)).toBe(false);
  });

  it("Google Drive : la réponse au préload arrive de la recherche asynchrone (dossier nuage et cliché, ou éteint)", async () => {
    const fake = boot();
    const { dir, initial } = await ipc(fake, "cloud:init");
    if (dir === null) expect(initial).toEqual({ status: "off", text: null });
    else {
      expect(path.basename(dir)).toBe("Civilisation Idle"); // nom STABLE (STEAM-10)
      expect(["none", "ok", "error"]).toContain(initial.status);
    }
    // Une page qui ne serait pas le jeu n'apprend rien.
    expect(await ipc(fake, "cloud:init", { url: "https://exemple.test/" })).toEqual({ dir: null, initial: { status: "off", text: null } });
    expect(await ipc(fake, "cloud:write", { url: "https://exemple.test/" }, '{"pirate":1}')).toBe(false);
  });
});

describe("main.cjs — surface de sécurité (ELEC-4)", () => {
  it("moteur de rendu dans le bac à sable de l'OS, isolé, sans Node", () => {
    const { win } = boot();
    expect(win.options.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false });
  });

  it("le préload ne charge plus que contextBridge et ipcRenderer (compatible sandbox)", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../preload.cjs"), "utf8");
    const requires = [...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    expect(requires).toEqual(["electron"]);
  });

  it("permissions : seul le presse-papiers (écriture) est accordé, et seulement à la page du jeu", () => {
    const { permissions } = boot();
    const ask = (permission, requestingUrl = "app://localhost/") => {
      let granted;
      permissions.handler({ getURL: () => requestingUrl }, permission, (ok) => { granted = ok; }, { requestingUrl });
      return granted;
    };
    expect(ask("clipboard-sanitized-write")).toBe(true);
    for (const p of ["media", "geolocation", "notifications", "openExternal", "clipboard-read"]) expect(ask(p)).toBe(false);
    expect(ask("clipboard-sanitized-write", "https://exemple.test/")).toBe(false);
  });

  it("la page servie par app:// porte la Content-Security-Policy ; les autres fichiers passent tels quels", async () => {
    const realStat = fs.statSync;
    vi.spyOn(fs, "statSync").mockImplementation((p, ...rest) => (
      /index\.html$|\.js$|\.ogg$/.test(String(p)) ? { isFile: () => true, size: 4000 } : realStat(p, ...rest)
    ));
    const fake = boot();
    const handler = fake.protocol.handlers.app;
    const get = (url, headers = {}) => handler({ url, headers: new Headers(headers) });
    const page = await get("app://localhost/");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toMatch(/script-src 'self'/);
    expect(await page.text()).toBe("<!doctype html>");
    fake.net.fetch.mockResolvedValueOnce(new Response("export {}", { status: 200 }));
    const script = await get("app://localhost/assets/index.js");
    expect(script.headers.get("content-security-policy")).toBe(null);
    // Refus francs (ELEC-5) : pourcentage mal formé, traversée.
    expect((await get("app://localhost/%E0%A4%A")).status).toBe(400);
    expect((await get("app://localhost/%2e%2e%2f%2e%2e%2fmain.cjs")).status).toBe(404);
  });

  it("musique : plages d'octets servies en 206 avec leur taille (durée connue, boucle possible)", async () => {
    const realStat = fs.statSync;
    vi.spyOn(fs, "statSync").mockImplementation((p, ...rest) => (
      /\.ogg$/.test(String(p)) ? { isFile: () => true, size: 4000 } : realStat(p, ...rest)
    ));
    const fake = boot();
    const handler = fake.protocol.handlers.app;
    const get = (headers = {}) => handler({ url: "app://localhost/assets/piste.ogg", headers: new Headers(headers) });
    fake.net.fetch.mockResolvedValueOnce(new Response("x".repeat(4000), { status: 200, headers: { "content-type": "audio/ogg" } }));
    const whole = await get();
    expect(whole.status).toBe(200);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(whole.headers.get("content-length")).toBe("4000");
    // La fin du fichier (le lecteur y lit la durée d'un .ogg).
    fake.net.fetch.mockResolvedValueOnce(new Response("x".repeat(500), { status: 200, headers: { "content-type": "audio/ogg" } }));
    const tail = await get({ Range: "bytes=-500" });
    expect(tail.status).toBe(206);
    expect(tail.headers.get("content-range")).toBe("bytes 3500-3999/4000");
    expect(tail.headers.get("content-length")).toBe("500");
    expect(tail.headers.get("content-type")).toBe("audio/ogg");
    expect(fake.net.fetch.mock.calls.at(-1)[1]).toEqual({ headers: { Range: "bytes=3500-3999" } });
    expect((await get({ Range: "bytes=9000-" })).status).toBe(416);
  });
});

describe("main.cjs — export vers un fichier (SAV-14, ELEC-4)", () => {
  it("dialogue natif ouvert sur les Documents ; extension ramenée à .txt/.json ; dialogue fermé = rien d'écrit", async () => {
    const fake = boot();
    const save = (url, text, name) => fake.ipcHandlers["file:save-as"]({ senderFrame: { url }, sender: fake.win.webContents }, text, name);
    // Fermé sans choisir.
    expect(await save("app://localhost/", "CODE", "civilisation-2026.txt")).toEqual({ ok: false, canceled: true });
    const options = fake.dialog.showSaveDialog.mock.calls[0][1];
    expect(options.defaultPath).toBe(path.join(fake.paths.documents, "civilisation-2026.txt"));
    expect(options.filters[0].extensions).toEqual(["txt"]);
    // Le joueur tape « x.bat » : c'est un .txt qui s'écrit.
    fs.mkdirSync(fake.paths.documents, { recursive: true });
    fake.dialog.saveDialogAnswer = { canceled: false, filePath: path.join(fake.paths.documents, "x.bat") };
    const res = await save("app://localhost/", "CODE", "civilisation-2026.txt");
    expect(res).toEqual({ ok: true, path: path.join(fake.paths.documents, "x.bat.txt") });
    expect(fs.readFileSync(res.path, "utf8")).toBe("CODE");
    expect(realExists(path.join(fake.paths.documents, "x.bat"))).toBe(false);
    // Copie de secours en JSON : l'extension proposée est gardée.
    fake.dialog.saveDialogAnswer = { canceled: false, filePath: path.join(fake.paths.documents, "copie.json") };
    expect((await save("app://localhost/", "{}", "civilisation-copie.json")).path).toBe(path.join(fake.paths.documents, "copie.json"));
    // Hors du jeu : refusé sans dialogue.
    const asked = fake.dialog.showSaveDialog.mock.calls.length;
    expect(await save("https://exemple.test/", "CODE", "x.txt")).toEqual({ ok: false });
    expect(fake.dialog.showSaveDialog.mock.calls.length).toBe(asked);
  });
});

describe("main.cjs — protocole app:// et Steam (ELEC-5, STEAM-9)", () => {
  it("privilèges du protocole : stream (musique) et codeCache (cache V8), jamais allowServiceWorkers", () => {
    const { schemes } = boot();
    const app = schemes.find((s) => s.scheme === "app");
    expect(app.privileges).toMatchObject({ standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true });
    expect(app.privileges.allowServiceWorkers).toBeFalsy();
  });

  it("drapeaux d'overlay Steam seulement lancé par Steam ; --no-steam-overlay les retire", () => {
    expect(boot().switches).not.toContain("in-process-gpu");
    const steam = boot({ env: { SteamAppId: "480" } });
    expect(steam.switches).toEqual(expect.arrayContaining(["in-process-gpu", "disable-direct-composition"]));
    process.argv.push("--no-steam-overlay");
    try {
      expect(boot({ env: { SteamGameId: "480" } }).switches).not.toContain("in-process-gpu");
    } finally {
      process.argv.pop();
    }
  });
});

describe("src/main.jsx — pas de service worker dans l'.exe (ELEC-7)", () => {
  it("app:// est exclu avant le test « localhost » (l'.exe sert app://localhost/)", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../main.jsx"), "utf8");
    expect(source).toMatch(/'serviceWorker' in navigator && location\.protocol !== 'app:'/);
  });
});

describe("main.cjs — .exe sans menu ni DevTools (ELEC-1)", () => {
  it(".exe empaqueté : menu retiré, DevTools coupés, zoom de page bloqué au clavier", () => {
    const { win, Menu } = boot({ packaged: true });
    expect(Menu.setApplicationMenu).toHaveBeenCalledWith(null);
    expect(win.options.webPreferences.devTools).toBe(false);
    expect(win.webContents.setVisualZoomLevelLimits).toHaveBeenCalledWith(1, 1);
    for (const key of ["=", "+", "-", "0"]) {
      const event = { preventDefault: vi.fn() };
      win.webContents.emit("before-input-event", event, { type: "keyDown", key, control: true });
      expect(event.preventDefault).toHaveBeenCalled();
    }
    const devtools = { preventDefault: vi.fn() };
    win.webContents.emit("before-input-event", devtools, { type: "keyDown", key: "I", control: true, shift: true });
    expect(win.webContents.toggleDevTools).not.toHaveBeenCalled();
  });

  it("CIV_DEVTOOLS=1 rouvre les DevTools dans l'.exe (mesures de perf)", () => {
    const { win } = boot({ packaged: true, env: { CIV_DEVTOOLS: "1" } });
    expect(win.options.webPreferences.devTools).toBe(true);
    win.webContents.emit("before-input-event", { preventDefault() {} }, { type: "keyDown", key: "F12" });
    expect(win.webContents.toggleDevTools).toHaveBeenCalledTimes(1);
  });

  it("npm run electron (non empaqueté) garde le menu et les DevTools", () => {
    const { win, Menu } = boot();
    expect(Menu.setApplicationMenu).not.toHaveBeenCalled();
    expect(win.options.webPreferences.devTools).toBe(true);
    const event = { preventDefault: vi.fn() };
    win.webContents.emit("before-input-event", event, { type: "keyDown", key: "=", control: true });
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("main.cjs — fenêtre de jeu (ELEC-2)", () => {
  it("cachée jusqu'au premier rendu, fond sombre, plancher de taille ; agrandie au tout premier lancement", () => {
    const { win } = boot();
    expect(win.options.show).toBe(false);
    expect(win.options.backgroundColor).toBe("#0E1320");
    expect(win.options.minWidth).toBe(1024);
    expect(win.options.minHeight).toBe(640);
    expect(win.options.width).toBe(1600);
    expect(win.options.height).toBe(900);
    expect(win.show).not.toHaveBeenCalled();
    win.emit("ready-to-show");
    expect(win.maximize).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalledTimes(1);
  });

  it("taille, position et plein écran mémorisés à la fermeture, retrouvés au lancement suivant", () => {
    const first = boot();
    first.win.emit("ready-to-show");
    first.win.fullscreen = true;
    first.win.maximized = false;
    first.win.emit("close");
    const state = JSON.parse(fs.readFileSync(path.join(first.userData, "window.json"), "utf8"));
    expect(state).toEqual({ bounds: { x: 100, y: 80, width: 1280, height: 720 }, maximized: false, fullscreen: true });
    // Même dossier au lancement suivant (mêmes %APPDATA%).
    const again = fakeElectron(first.appData);
    const electronId = require.resolve("electron");
    require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: again.electron };
    delete require.cache[MAIN];
    require(MAIN);
    booted.push(again);
    again.ready.forEach((fn) => fn());
    const win = again.windows[0];
    expect(win.options).toMatchObject({ x: 100, y: 80, width: 1280, height: 720 });
    win.emit("ready-to-show");
    expect(win.maximize).not.toHaveBeenCalled();
    expect(win.setFullScreen).toHaveBeenCalledWith(true);
  });

  it("F11 et Alt+Entrée basculent le plein écran ; l'interrupteur des Options le pilote et en est averti", async () => {
    const fake = boot();
    const { win } = fake;
    const f11 = { preventDefault: vi.fn() };
    win.webContents.emit("before-input-event", f11, { type: "keyDown", key: "F11" });
    expect(f11.preventDefault).toHaveBeenCalled();
    expect(win.setFullScreen).toHaveBeenLastCalledWith(true);
    win.webContents.emit("before-input-event", { preventDefault() {} }, { type: "keyDown", key: "Enter", alt: true });
    expect(win.setFullScreen).toHaveBeenLastCalledWith(false);
    // Touche tenue enfoncée : une seule bascule.
    win.webContents.emit("before-input-event", { preventDefault() {} }, { type: "keyDown", key: "F11", isAutoRepeat: true });
    expect(win.setFullScreen).toHaveBeenCalledTimes(2);
    fake.ipcHandlers["window:set-fullscreen"]({ senderFrame: { url: "app://localhost/" }, sender: win.webContents }, true);
    expect(win.fullscreen).toBe(true);
    expect(await ipc(fake, "window:get-fullscreen")).toBe(true);
    win.emit("enter-full-screen");
    expect(win.webContents.send).toHaveBeenLastCalledWith("window:fullscreen", true);
  });
});
