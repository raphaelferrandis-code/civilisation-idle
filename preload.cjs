// Pont « sauvegarde nuage » du .exe : la partie voyage entre les postes via un
// fichier déposé dans Google Drive (« Google Drive pour ordinateur », le client
// PC de Google One) — aucun serveur, aucun compte à créer : c'est Drive qui
// fait le transport. La version navigateur (dev, web) ne passe jamais ici →
// window.civCloud n'existe pas et le jeu reste 100 % localStorage. La version
// Steam n'a pas ce miroir (Steam Cloud transporte la save en fichier, STEAM-4) :
// civCloud y existe, éteint (`dir: null`, `steam: true`).
//
// L'arbitrage « quelle save gagne » ne vit PAS ici : il est dans
// src/game/core/cloudSave.js (la plus avancée gagne, horloge à vie).
//
// Préload SANDBOXÉ (sandbox: true dans main.cjs, audit 2026-10-05, ELEC-4) : ni
// fs, ni path, ni os — seulement contextBridge et ipcRenderer. Tout ce qui touche
// au disque (fichier nuage, save en fichier, export) est fait par le process
// principal (main.cjs, desktopFiles.cjs). Quatre ponts :
//   window.civCloud  — le fichier nuage Google Drive, et l'export vers un fichier ;
//   window.civSave   — la save canonique en FICHIER (userData/saves/save.json,
//                      Steam Cloud ; src/game/core/fileSave.js, STEAM-4) ;
//   window.civWindow — le plein écran (interrupteur des Options, ELEC-2) et la
//                      fenêtre réduite (rendu de la carte suspendu, ELEC-6) ;
//   window.civSteam  — les succès débloqués, vers Steamworks (STEAM-9).
const { contextBridge, ipcRenderer } = require("electron");

// Dossier nuage et fichier lu AU LANCEMENT, en SYNCHRONE : le jeu arbitre nuage
// vs local AVANT de charger la partie — un aller-retour asynchrone arriverait
// trop tard. Google Drive est cherché par le process principal, en asynchrone,
// dès le lancement (desktopFiles.cjs, ELEC-3) : la réponse est le plus souvent
// déjà là. { status: 'off'|'none'|'ok'|'error', text } — cf. createCloudStore.
// Version Steam (STEAM-4 / ELEC-3) : pas de Drive du tout, `steam: true`.
function askCloud() {
  try {
    const res = ipcRenderer.sendSync("cloud:init");
    if (res && typeof res.dir === "string" && res.dir) return res;
    if (res && res.steam === true) return { dir: null, initial: { status: "off", text: null }, steam: true };
  } catch { /* canal indisponible : pas de nuage pour cette session */ }
  return { dir: null, initial: { status: "off", text: null } };
}
const cloud = askCloud();

contextBridge.exposeInMainWorld("civCloud", {
  dir: cloud.dir,                                      // null = pas de Google Drive détecté sur ce poste
  steam: cloud.steam === true,                         // version Steam : la partie voyage par Steam Cloud, pas de Drive
  initial: cloud.initial,                              // { status, text } AU LANCEMENT
  read: () => ipcRenderer.sendSync("cloud:read"),      // re-lecture (Drive revenu en ligne en cours de partie)
  write: (text) => ipcRenderer.sendSync("cloud:write", typeof text === "string" ? text : "") === true,
  clear: () => ipcRenderer.sendSync("cloud:clear") === true,
  // Export vers un FICHIER choisi par le joueur (C9, SAV-14) : dialogue
  // d'enregistrement natif, .txt ou .json. Promesse de { ok, path } ou
  // { ok: false, canceled? }.
  saveAs: (text, filename) => ipcRenderer.invoke("file:save-as", typeof text === "string" ? text : "", String(filename || "")),
});

// Save canonique en FICHIER (STEAM-4). Lecture et effacement SYNCHRONES : le jeu
// arbitre fichier vs localStorage AVANT de charger la partie (state = load()).
// Écriture asynchrone à chaque sauvegarde (le rendu n'attend pas le disque),
// synchrone à la fermeture (la dernière save doit être sur le disque quand la
// page disparaît). Le texte passe tel quel : main.cjs l'écrit atomiquement.
contextBridge.exposeInMainWorld("civSave", {
  read: () => ipcRenderer.sendSync("save:read"),        // { status: 'none'|'ok'|'error', text }
  write: (text) => { ipcRenderer.send("save:write", String(text)); },
  writeSync: (text) => ipcRenderer.sendSync("save:write-sync", String(text)) === true,
  clear: () => ipcRenderer.sendSync("save:clear") === true,
});

// Plein écran de la fenêtre (ELEC-2) : l'interrupteur des Options, tenu à jour
// quand F11 ou Alt+Entrée le basculent (main.cjs, before-input-event).
// Fenêtre réduite (ELEC-6) : la cité vit en arrière-plan (backgroundThrottling
// coupé, main.cjs) ; seul le rendu de la carte s'arrête quand la fenêtre est
// réduite (src/game/core/desktopWindow.js).
contextBridge.exposeInMainWorld("civWindow", {
  livesInBackground: true,
  isMinimized: () => ipcRenderer.sendSync("window:get-minimized") === true,
  onMinimizedChange: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, on) => callback(Boolean(on));
    ipcRenderer.on("window:minimized", listener);
    return () => ipcRenderer.removeListener("window:minimized", listener);
  },
  isFullScreen: () => ipcRenderer.sendSync("window:get-fullscreen") === true,
  setFullScreen: (on) => { ipcRenderer.send("window:set-fullscreen", Boolean(on)); },
  // Rend la fonction de désabonnement.
  onFullScreenChange: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, on) => callback(Boolean(on));
    ipcRenderer.on("window:fullscreen", listener);
    return () => ipcRenderer.removeListener("window:fullscreen", listener);
  },
});

// Succès Steam (STEAM-9) : les noms d'API des succès débloqués partent vers le
// process principal, qui les active si Steamworks répond (main.cjs) — sinon rien,
// le jeu les renvoie tous au lancement suivant (src/game/core/achievements.js).
// Envoi sans réponse : le jeu n'attend jamais Steam.
contextBridge.exposeInMainWorld("civSteam", {
  unlock: (ids) => {
    const list = Array.isArray(ids) ? ids.filter((id) => typeof id === "string").slice(0, 256) : [];
    if (list.length) ipcRenderer.send("steam:achievements", list);
  },
});
