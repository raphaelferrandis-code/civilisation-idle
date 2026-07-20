// Pont « sauvegarde nuage » du .exe : la partie voyage entre les postes via un
// fichier déposé dans Google Drive (« Google Drive pour ordinateur », le client
// PC de Google One) — aucun serveur, aucun compte à créer : c'est Drive qui
// fait le transport. Préload NON sandboxé (sandbox:false dans main.cjs) : il a
// accès à fs. La version navigateur (dev, web) ne passe jamais ici →
// window.civCloud n'existe pas et le jeu reste 100 % localStorage.
//
// L'arbitrage « quelle save gagne » ne vit PAS ici : il est dans
// src/game/core/cloudSave.js (la plus avancée gagne, horloge à vie).
const { contextBridge } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

// « Google Drive pour ordinateur » n'expose AUCUNE variable d'environnement
// (contrairement à %OneDrive%) : on cherche ses deux visages, dans les deux
// langues — d'abord le lecteur virtuel monté (mode « streaming », le défaut :
// G:\Mon Drive / G:\My Drive, lettre variable), puis les dossiers miroir dans
// le profil utilisateur (mode « mirroring » et anciennes installations).
function detectGoogleDriveRoot() {
  const names = ["Mon Drive", "My Drive"];
  for (let c = 68; c <= 90; c += 1) { // lettres D: à Z: (jamais A/B/C)
    for (const name of names) {
      const p = String.fromCharCode(c) + ":\\" + name;
      try { if (fs.existsSync(p)) return p; } catch { /* lecteur capricieux */ }
    }
  }
  const home = os.homedir();
  for (const name of ["Google Drive", "Mon Drive", "My Drive"]) {
    const p = path.join(home, name);
    try { if (fs.existsSync(p)) return p; } catch { /* — */ }
  }
  return null;
}

const driveRoot = detectGoogleDriveRoot();
const cloudDir = driveRoot ? path.join(driveRoot, "Civilisation Idle") : null;
const cloudFile = cloudDir ? path.join(cloudDir, "civilisation-idle-save.json") : null;

// Lecture SYNCHRONE au lancement : le jeu arbitre nuage vs local AVANT de
// charger la partie — un aller-retour asynchrone arriverait trop tard.
// (Fichier Drive « en ligne seulement » : Windows le télécharge de façon
// transparente pendant le readFileSync ; hors ligne, le catch rend null.)
function readInitial() {
  if (!cloudFile) return null;
  try {
    return fs.readFileSync(cloudFile, "utf8");
  } catch {
    return null; // absent au premier lancement, ou hors ligne : save locale
  }
}

function writeCloud(text) {
  if (!cloudFile || typeof text !== "string" || !text) return false;
  try {
    fs.mkdirSync(cloudDir, { recursive: true });
    // Écriture atomique (temp + rename) : Drive ne doit jamais synchroniser
    // un fichier à moitié écrit.
    const tmp = cloudFile + ".tmp";
    fs.writeFileSync(tmp, text, "utf8");
    fs.renameSync(tmp, cloudFile);
    return true;
  } catch {
    return false; // disque plein, verrou Drive… : le jeu continue en local
  }
}

function clearCloud() {
  if (!cloudFile) return false;
  try {
    fs.rmSync(cloudFile, { force: true });
    return true;
  } catch {
    return false;
  }
}

contextBridge.exposeInMainWorld("civCloud", {
  dir: cloudDir,            // null = pas de Google Drive détecté sur ce poste
  initial: readInitial(),   // contenu du fichier nuage AU LANCEMENT (ou null)
  write: (text) => writeCloud(text),
  clear: () => clearCloud(),
});
