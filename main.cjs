const { app, BrowserWindow, dialog, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

// Autorise la musique de fond à démarrer sans clic préalable de l'utilisateur.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Une seule instance à la fois : deux fenêtres partageraient le même userData
// (la save vit dans localStorage — verrou LevelDB exclusif) et se disputeraient
// l'écriture. Au mieux la session la plus avancée est perdue (dernier fermé
// gagne), au pire le stockage se corrompt. Si le verrou est refusé, une instance
// tourne déjà : on la ramène au premier plan et on rend la main.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// On sert le jeu via un protocole interne « app:// » (comme un serveur web local)
// au lieu de file://. C'EST INDISPENSABLE : les sprites pixel-art sont chargés
// avec des chemins absolus ('/pixelart/...') et le terrain fait un fetch() de JSON.
// En file:// ces deux mécanismes échouent (racine disque + fetch local interdit),
// les images ne se chargent pas et le jeu retombe sur l'ancien rendu procédural.
// En app:// tout fonctionne exactement comme dans `npm run dev`.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

// JOURNAL D'ERREURS (audit 2026-10-05, BUG-18) : userData/logs/civilisation.log.
// Sans lui, un plantage du moteur de rendu laissait une fenêtre blanche sans
// aucune trace pour le support. Bascule en .old au-delà de 1 Mo ; une même
// ligne répétée en rafale (erreur rejouée à chaque image) n'est écrite qu'une
// fois, avec son compte.
const LOG_MAX_BYTES = 1024 * 1024;
let logFile = null;
let lastLogLine = "";
let lastLogRepeats = 0;
function journal(line) {
  try {
    if (line === lastLogLine) {
      lastLogRepeats += 1;
      return;
    }
    if (!logFile) {
      const dir = path.join(app.getPath("userData"), "logs");
      fs.mkdirSync(dir, { recursive: true });
      logFile = path.join(dir, "civilisation.log");
    }
    try {
      if (fs.statSync(logFile).size > LOG_MAX_BYTES) fs.renameSync(logFile, logFile + ".old");
    } catch { /* pas encore de journal */ }
    const repeats = lastLogRepeats ? `  (ligne précédente répétée ${lastLogRepeats} fois)\n` : "";
    lastLogLine = line;
    lastLogRepeats = 0;
    fs.appendFileSync(logFile, `${repeats}[${new Date().toISOString()}] ${line}\n`, "utf8");
  } catch { /* disque plein, droits : le jeu continue sans journal */ }
}

// Garde-fous du moteur de rendu (BUG-18). Rien n'y ferme la fenêtre d'office :
// la partie vit dans le localStorage, l'autosave la garde à 10 s près.
function watchRenderer(win) {
  const contents = win.webContents;
  // Erreurs de la page (console.error, exceptions non rattrapées, frontières
  // d'erreur React) : recopiées dans le journal. Electron 42 passe le détail dans
  // l'évènement lui-même (les arguments positionnels sont dépréciés).
  contents.on("console-message", (event) => {
    if (event?.level !== "error") return;
    const source = event.sourceId ? ` (${event.sourceId}:${event.lineNumber})` : "";
    journal(`[page] ${String(event.message).slice(0, 2000)}${source}`);
  });
  contents.on("preload-error", (_event, preloadPath, error) => {
    journal(`[préload] ${preloadPath} : ${error?.stack || error}`);
  });
  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) journal(`[chargement] ${url} : ${description} (${code})`);
  });

  // Langue des questions ci-dessous : celle du jeu (réglage « civ-opt-lang »,
  // français par défaut comme i18n.js), relevée à chaque chargement de page — au
  // moment de demander, la page figée ou disparue ne peut plus répondre.
  let lang = "fr";
  const say = (fr, en) => (lang === "en" ? en : fr);
  contents.on("did-finish-load", () => {
    if (typeof contents.executeJavaScript !== "function") return;
    contents.executeJavaScript('localStorage.getItem("civ-opt-lang")')
      .then((value) => { lang = value === "en" ? "en" : "fr"; })
      .catch(() => { /* page déjà repartie : on garde la langue connue */ });
  });

  // Moteur de rendu disparu (plantage, mémoire, tué par le système) : on le note
  // et on RECHARGE — la partie repart de la dernière sauvegarde au lieu d'une
  // fenêtre blanche définitive. Trois chutes en une minute : on cesse de boucler
  // et on demande.
  const goneAt = [];
  contents.on("render-process-gone", (_event, details) => {
    journal(`[rendu] moteur de rendu disparu : ${details?.reason} (code ${details?.exitCode})`);
    if (details?.reason === "clean-exit" || win.isDestroyed()) return;
    const now = Date.now();
    while (goneAt.length && now - goneAt[0] > 60000) goneAt.shift();
    goneAt.push(now);
    if (goneAt.length < 3) {
      contents.reload();
      return;
    }
    dialog.showMessageBox(win, {
      type: "error",
      title: "Civilisation Idle",
      message: say("Le jeu s'est arrêté plusieurs fois de suite.", "The game stopped several times in a row."),
      detail: logFile ? say(`Journal : ${logFile}`, `Log: ${logFile}`) : undefined,
      buttons: [say("Recharger", "Reload"), say("Fermer", "Close")],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }).then(({ response }) => {
      if (win.isDestroyed()) return;
      if (response === 1) win.close();
      else { goneAt.length = 0; contents.reload(); }
    }).catch(() => {});
  });

  // Page figée : on DEMANDE au lieu de tuer — le rendu reprend souvent seul, et
  // la question se referme alors d'elle-même ('responsive').
  let unresponsiveAsk = null;
  win.on("unresponsive", () => {
    journal("[rendu] la page ne répond plus");
    if (unresponsiveAsk || win.isDestroyed()) return;
    unresponsiveAsk = new AbortController();
    dialog.showMessageBox(win, {
      type: "warning",
      title: "Civilisation Idle",
      message: say("Le jeu ne répond plus.", "The game is not responding."),
      buttons: [say("Attendre", "Wait"), say("Recharger", "Reload")],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      signal: unresponsiveAsk.signal,
    }).then(({ response }) => {
      unresponsiveAsk = null;
      if (response === 1 && !win.isDestroyed()) contents.reload();
    }).catch(() => { unresponsiveAsk = null; });
  });
  win.on("responsive", () => {
    journal("[rendu] la page répond de nouveau");
    unresponsiveAsk?.abort();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:false UNIQUEMENT pour que le préload accède à fs (sauvegarde
      // nuage Google Drive) — la page, elle, reste isolée (contextIsolation).
      sandbox: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  watchRenderer(win);
  win.loadURL("app://localhost/");

  // Durcissement (audit G-42) : le jeu est mono-page et local → on refuse toute
  // fenêtre externe (window.open) et toute navigation hors du protocole app://.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://")) event.preventDefault();
  });
}

app.whenReady().then(() => {
  // Instance perdante (verrou refusé) : app.quit() est déjà en cours, ne rien monter.
  if (!gotSingleInstanceLock) return;
  const distRoot = path.join(__dirname, "dist");
  // app://localhost/<chemin>  ->  dist/<chemin>  (index.html par défaut).
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "") pathname = "/index.html";
    // Anti-traversal (audit G-42) : les « ../ » percent-encodés (%2e%2e) survivent
    // à la normalisation d'URL puis reviennent via decodeURIComponent → path.resolve
    // pourrait sortir de dist/. On refuse tout chemin résolu hors de dist/.
    const filePath = path.resolve(distRoot, "." + pathname);
    if (filePath !== distRoot && !filePath.startsWith(distRoot + path.sep)) {
      return new Response("Not found", { status: 404 });
    }
    // Fichier absent : net.fetch sur un file:// inexistant REJETTE, et la
    // fenêtre restait blanche sans un mot. Un 404 franc laisse la page vivre
    // et l'absence se lit dans la console au lieu d'être avalée.
    if (!fs.existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  // dist/ pas construit : sans ce contrôle, la fenêtre s'ouvrait blanche et
  // muette (le 404 ci-dessus ne dit rien à qui n'ouvre pas les DevTools).
  if (!fs.existsSync(path.join(distRoot, "index.html"))) {
    dialog.showErrorBox(
      "Civilisation Idle — fichiers manquants",
      "dist/index.html est introuvable. Lancer `npm run build` d'abord, puis relancer le jeu."
    );
    app.quit();
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Processus annexes (GPU, réseau, utilitaires) : un GPU qui tombe fait clignoter
// ou figer la carte sans rien dire — au moins une ligne au journal (BUG-18).
app.on("child-process-gone", (_event, details) => {
  journal(`[processus] ${details?.type} disparu : ${details?.reason} (code ${details?.exitCode})`);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
