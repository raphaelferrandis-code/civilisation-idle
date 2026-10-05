// LES FICHIERS DU .EXE (audit 2026-10-05) — desktopFiles.cjs, chargé tel quel :
//   STEAM-4 : la save n'existait que dans le LevelDB de Chromium, impossible à
//             synchroniser par Steam Cloud. Désormais aussi userData/saves/save.json,
//             écrit atomiquement, avec une copie .bak relue si le fichier s'abîme ;
//   ELEC-3  : Google Drive cherché en synchrone dans le préload (jusqu'à 46 tests
//             de lecteurs) — un lecteur réseau déconnecté gelait la fenêtre ;
//   ELEC-2  : la fenêtre rouvre là où le joueur l'a laissée, sur un écran branché.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  createSaveStore, saveFilePaths, detectGoogleDriveRoot, driveCandidates, probeDir,
  readWindowState, writeWindowState, fitWindowBounds,
  createCloudStore, CLOUD_DIR_NAME, safeExportName, exportTarget, resolveAppRequest, parseByteRange, APP_CSP,
} = require("../../desktopFiles.cjs");

const tempDirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civ-desktop-files-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("save en fichier (STEAM-4)", () => {
  it("absente au premier lancement, écrite puis relue ; aucun fichier temporaire ne traîne", () => {
    const userData = tempDir();
    const store = createSaveStore(userData);
    const { file, tmp, bak } = saveFilePaths(userData);
    expect(store.read()).toEqual({ status: "none", text: null });
    expect(store.write('{"life":1}')).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe('{"life":1}');
    expect(fs.existsSync(tmp)).toBe(false);
    // Première save : rien à garder en .bak.
    expect(fs.existsSync(bak)).toBe(false);
    expect(createSaveStore(userData).read()).toEqual({ status: "ok", text: '{"life":1}' });
  });

  it("chaque écriture garde la précédente en .bak ; une écriture identique est sautée", () => {
    const userData = tempDir();
    const store = createSaveStore(userData);
    const { file, bak } = saveFilePaths(userData);
    store.write('{"life":1}');
    store.write('{"life":2}');
    expect(fs.readFileSync(bak, "utf8")).toBe('{"life":1}');
    expect(fs.readFileSync(file, "utf8")).toBe('{"life":2}');
    expect(store.write('{"life":2}')).toBe(true);
    expect(fs.readFileSync(bak, "utf8")).toBe('{"life":1}');
  });

  it("save.json abîmée : la copie .bak est relue ; et l'abîmée ne chasse pas la bonne copie", () => {
    const userData = tempDir();
    const { dir, file, bak } = saveFilePaths(userData);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(bak, '{"life":1}');
    fs.writeFileSync(file, '{"life":2, tronqu'); // disque abîmé, fichier retouché à la main…
    const store = createSaveStore(userData);
    expect(store.read()).toEqual({ status: "ok", text: '{"life":1}', recovered: true });
    store.write('{"life":3}');
    expect(fs.readFileSync(bak, "utf8")).toBe('{"life":1}');
    expect(fs.readFileSync(file, "utf8")).toBe('{"life":3}');
  });

  it("vide = illisible (jamais « pas de partie ») ; abîmée sans copie = rendue telle quelle au jeu, qui l'archive", () => {
    const userData = tempDir();
    const { dir, file } = saveFilePaths(userData);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, "");
    expect(createSaveStore(userData).read()).toEqual({ status: "error", text: null });
    fs.writeFileSync(file, "{pas du json");
    expect(createSaveStore(userData).read()).toEqual({ status: "ok", text: "{pas du json" });
  });

  it("fichier impossible à lire (ici un dossier à sa place) : 'error', pour que le jeu ne l'écrase pas", () => {
    const userData = tempDir();
    fs.mkdirSync(saveFilePaths(userData).file, { recursive: true });
    expect(createSaveStore(userData).read()).toEqual({ status: "error", text: null });
  });

  it("BOM toléré à la relecture (fichier réécrit par un éditeur ou PowerShell)", () => {
    const userData = tempDir();
    const { dir, file } = saveFilePaths(userData);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, '\uFEFF{"life":5}');
    expect(createSaveStore(userData).read().status).toBe("ok");
  });

  it("effacement : la partie ne se relit plus ; écritures invalides refusées", () => {
    const userData = tempDir();
    const store = createSaveStore(userData);
    store.write('{"life":1}');
    expect(store.clear()).toBe(true);
    expect(store.read()).toEqual({ status: "none", text: null });
    expect(store.write("")).toBe(false);
    expect(store.write(null)).toBe(false);
    expect(store.write({ life: 1 })).toBe(false);
  });
});

describe("Google Drive cherché en asynchrone, borné (ELEC-3)", () => {
  it("toutes les pistes à la fois ; la première trouvée DANS L'ORDRE de priorité gagne, puis elle est retenue", async () => {
    const cacheFile = path.join(tempDir(), "drive.json");
    const present = new Set(["H:\\My Drive", "G:\\Mon Drive"]);
    const probe = vi.fn(async (p) => present.has(p));
    const candidates = driveCandidates({ platform: "win32", home: "C:\\Users\\joueur" });
    expect(candidates.slice(0, 2)).toEqual(["D:\\Mon Drive", "D:\\My Drive"]);
    expect(candidates).toHaveLength(23 * 2 + 3);
    expect(await detectGoogleDriveRoot({ cacheFile, candidates, probe })).toBe("G:\\Mon Drive");
    expect(JSON.parse(fs.readFileSync(cacheFile, "utf8"))).toEqual({ root: "G:\\Mon Drive" });
    // Lancement suivant : le chemin retenu d'abord — une seule piste testée.
    probe.mockClear();
    expect(await detectGoogleDriveRoot({ cacheFile, candidates, probe })).toBe("G:\\Mon Drive");
    expect(probe).toHaveBeenCalledTimes(1);
    // Drive désinstallé : retour à la recherche complète, rien trouvé.
    present.clear();
    expect(await detectGoogleDriveRoot({ cacheFile, candidates, probe })).toBe(null);
  });

  it("hors Windows, pas de lettres de lecteur : seulement les dossiers du profil", () => {
    expect(driveCandidates({ platform: "linux", home: "/home/joueur" })).toEqual([
      path.join("/home/joueur", "Google Drive"), path.join("/home/joueur", "Mon Drive"), path.join("/home/joueur", "My Drive"),
    ]);
  });

  it("un lecteur qui ne répond jamais (réseau déconnecté) répond « non » au bout du délai", async () => {
    const dir = tempDir();
    const realStat = fs.promises.stat;
    vi.spyOn(fs.promises, "stat").mockImplementation((p) => (String(p).startsWith("Z:") ? new Promise(() => {}) : realStat(p)));
    const t0 = Date.now();
    expect(await probeDir("Z:\\Mon Drive", 40)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
    // Délai large pour les vrais dossiers : la CI chargée peut être lente.
    expect(await probeDir(dir, 5000)).toBe(true);
    expect(await probeDir(path.join(dir, "absent"), 5000)).toBe(false);
  });
});

describe("fichier nuage Google Drive, tenu par le process principal (ELEC-4)", () => {
  it("dossier au nom STABLE ; absent, écrit atomiquement, relu, effacé ; vide = illisible, jamais « pas de partie »", () => {
    const root = tempDir();
    const cloud = createCloudStore(root);
    expect(CLOUD_DIR_NAME).toBe("Civilisation Idle");
    expect(cloud.dir).toBe(path.join(root, "Civilisation Idle"));
    expect(cloud.file).toBe(path.join(root, "Civilisation Idle", "civilisation-idle-save.json"));
    expect(cloud.read()).toEqual({ status: "none", text: null });
    expect(cloud.write('{"life":5}')).toBe(true);
    expect(fs.existsSync(cloud.file + ".tmp")).toBe(false);
    expect(cloud.read()).toEqual({ status: "ok", text: '{"life":5}' });
    fs.writeFileSync(cloud.file, ""); // placeholder « en ligne seulement » non hydraté
    expect(cloud.read()).toEqual({ status: "error", text: null });
    expect(cloud.write("")).toBe(false);
    expect(cloud.clear()).toBe(true);
    expect(cloud.read()).toEqual({ status: "none", text: null });
  });

  it("sans Google Drive : éteint, rien ne s'écrit nulle part", () => {
    const off = createCloudStore(null);
    expect(off.dir).toBe(null);
    expect(off.read()).toEqual({ status: "off", text: null });
    expect(off.write('{"a":1}')).toBe(false);
    expect(off.clear()).toBe(false);
  });
});

describe("export vers un fichier (SAV-14, ELEC-4)", () => {
  it("nom proposé sûr, extension .txt ou .json seulement", () => {
    expect(safeExportName("civilisation-2026-10-05-12-00-00.txt")).toBe("civilisation-2026-10-05-12-00-00.txt");
    expect(safeExportName("civilisation-copie.json")).toBe("civilisation-copie.json");
    expect(safeExportName("../../x.bat")).toBe("..-..-x.bat.txt");
    expect(safeExportName("")).toBe("civilisation.txt");
  });

  it("chemin choisi ramené à une extension permise", () => {
    const docs = path.join("C:", "Users", "joueur", "OneDrive", "Documents");
    expect(exportTarget(path.join(docs, "ma-partie.TXT"), "civ.txt")).toBe(path.join(docs, "ma-partie.TXT"));
    expect(exportTarget(path.join(docs, "x.exe"), "civ.txt")).toBe(path.join(docs, "x.exe.txt"));
    expect(exportTarget(path.join(docs, "copie"), "civ-copie.json")).toBe(path.join(docs, "copie.json"));
  });
});

describe("protocole app:// (ELEC-5) et CSP (ELEC-4)", () => {
  it("fichier servi ; index.html par défaut ; dossier, absent ou hors de dist/ : 404 ; pourcentage mal formé : 400", () => {
    const base = tempDir();
    const dist = path.join(base, "dist");
    fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
    fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html>");
    fs.writeFileSync(path.join(dist, "assets", "a b.js"), "");
    fs.writeFileSync(path.join(base, "secret.txt"), "hors de dist");
    expect(resolveAppRequest(dist, "app://localhost/")).toEqual({ status: 200, filePath: path.join(dist, "index.html"), size: 15 });
    expect(resolveAppRequest(dist, "app://localhost/assets/a%20b.js")).toEqual({ status: 200, filePath: path.join(dist, "assets", "a b.js"), size: 0 });
    expect(resolveAppRequest(dist, "app://localhost/assets")).toEqual({ status: 404 }); // dossier
    expect(resolveAppRequest(dist, "app://localhost/assets/")).toEqual({ status: 404 });
    expect(resolveAppRequest(dist, "app://localhost/absent.png")).toEqual({ status: 404 });
    expect(resolveAppRequest(dist, "app://localhost/%2e%2e%2fsecret.txt")).toEqual({ status: 404 });
    expect(resolveAppRequest(dist, "app://localhost/%E0%A4%A")).toEqual({ status: 400 });
  });

  // Audit du 05/10 (TEST-4) : la garde anti-traversée sous toutes ses formes — `..`
  // en clair (l'URL le résout avant nous), encodé, avec l'antislash de Windows
  // (%5c : séparateur pour path.resolve sous Windows, simple caractère ailleurs),
  // et un dossier VOISIN dont le nom commence comme dist/ (« dist-voisin »).
  it("traversée : .. en clair, encodé, par antislash ou vers un voisin au même préfixe : jamais hors de dist/", () => {
    const base = tempDir();
    const dist = path.join(base, "dist");
    fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
    fs.mkdirSync(path.join(base, "dist-voisin"), { recursive: true });
    fs.writeFileSync(path.join(base, "secret.txt"), "hors de dist");
    fs.writeFileSync(path.join(base, "dist-voisin", "x.txt"), "hors de dist");
    for (const url of [
      "app://localhost/../secret.txt",
      "app://localhost/assets/../../secret.txt",
      "app://localhost/assets/..%2f..%2fsecret.txt",
      "app://localhost/%2E%2E/secret.txt",
      "app://localhost/%2e%2e%5csecret.txt",
      "app://localhost/assets%5c..%5c..%5csecret.txt",
      "app://localhost/%2e%2e%2fdist-voisin%2fx.txt",
    ]) {
      const r = resolveAppRequest(dist, url);
      expect(r.status, url).toBe(404);
      expect(r.filePath, url).toBeUndefined();
    }
  });

  it("plages d'octets (musique) : début, fin, suffixe ; hors fichier = 416 ; absente ou multiple = fichier entier", () => {
    expect(parseByteRange("bytes=0-99", 4000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=100-", 4000)).toEqual({ start: 100, end: 3999 });
    expect(parseByteRange("bytes=-500", 4000)).toEqual({ start: 3500, end: 3999 });
    expect(parseByteRange("bytes=3000-9999", 4000)).toEqual({ start: 3000, end: 3999 });
    expect(parseByteRange("bytes=4000-", 4000)).toEqual({ unsatisfiable: true });
    expect(parseByteRange("bytes=50-10", 4000)).toEqual({ unsatisfiable: true });
    expect(parseByteRange(null, 4000)).toBe(null);
    expect(parseByteRange("bytes=0-1,5-9", 4000)).toBe(null);
  });

  it("CSP : rien que le local ; polices et images data: permises (CSS inliné par Vite, toDataURL)", () => {
    const rules = Object.fromEntries(APP_CSP.split(";").map((r) => r.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
    expect(rules["default-src"]).toEqual(["'self'"]);
    expect(rules["script-src"]).toEqual(["'self'"]);
    expect(rules["font-src"]).toContain("data:");
    expect(rules["img-src"]).toEqual(expect.arrayContaining(["data:", "blob:"]));
    expect(rules["object-src"]).toEqual(["'none'"]);
    expect(APP_CSP).not.toMatch(/unsafe-eval|https?:/);
  });
});

describe("état de la fenêtre (ELEC-2)", () => {
  const screen = [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: 1920, y: 0, width: 1280, height: 760 }];

  it("relu tel qu'écrit ; illisible ou absent = premier lancement", () => {
    const file = path.join(tempDir(), "window.json");
    expect(readWindowState(file)).toBe(null);
    writeWindowState(file, { bounds: { x: 10, y: 20, width: 1280, height: 720 }, maximized: true, fullscreen: false });
    expect(readWindowState(file)).toEqual({ bounds: { x: 10, y: 20, width: 1280, height: 720 }, maximized: true, fullscreen: false });
    fs.writeFileSync(file, "{oups");
    expect(readWindowState(file)).toBe(null);
  });

  it("sur un écran branché : gardée ; à cheval : ramenée dedans ; trop grande : rognée ; écran débranché : abandonnée", () => {
    expect(fitWindowBounds({ x: 100, y: 50, width: 1280, height: 720 }, screen)).toEqual({ x: 100, y: 50, width: 1280, height: 720 });
    // Sur le second écran, débordant à droite.
    expect(fitWindowBounds({ x: 2400, y: 100, width: 1000, height: 600 }, screen)).toEqual({ x: 2200, y: 100, width: 1000, height: 600 });
    expect(fitWindowBounds({ x: 0, y: 0, width: 2560, height: 1440 }, screen)).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
    // Troisième écran d'hier, débranché aujourd'hui.
    expect(fitWindowBounds({ x: 4000, y: 0, width: 1280, height: 720 }, screen)).toBe(null);
    expect(fitWindowBounds(null, screen)).toBe(null);
  });
});
