const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

// Autorise la musique de fond à démarrer sans clic préalable de l'utilisateur.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

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
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
