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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
