// pruneWorkFiles.mjs — retire de dist/ les FICHIERS DE TRAVAIL que Vite y a recopiés
// depuis public/ (audit du 05/10, ASSET-7).
//
// public/ sert aussi d'atelier : originaux `_orig/`, archives `_archive/`, source
// Aseprite, palettes .gpl, README et guides des osselets, masques de zone des places
// (lus par les seuls scripts), faces `die-N` sorties par makeDesTemple.mjs (le jeu ne lit
// que bones.png), JSON de référence des scripts… Vite copie public/ TEL QUEL dans dist/ :
// tout partait chez les joueurs. package.json n'en excluait qu'une partie, et de l'.exe
// seulement ; le site (Netlify, zipDist.mjs) publiait tout, y compris les dossiers
// IGNORÉS par git présents sur le poste (`_archive`, `palettes/`, `ui/scratch`…).
//
// On ne regarde QUE ce qui vient de public/ : un fichier produit par le build (assets/,
// licenses/THIRD-PARTY-LICENSES.md) n'est jamais candidat, même s'il commence par « _ »
// ou finit en .md. public/ lui-même n'est jamais touché : les scripts et les tests
// continuent d'y lire leurs sources.
//
// ⚠ Une règle de plus ici retire le fichier du JEU : vérifier d'abord qu'aucun code de
// src/ ne le charge (pruneWorkFiles.test.js garde les cas connus).
import fs from 'node:fs';
import path from 'node:path';

// Gardés malgré la règle « _ / . » : les fichiers de configuration de Netlify et le
// dossier des vérifications de domaine, s'ils apparaissent un jour dans public/.
const KEEP = new Set(['_headers', '_redirects']);
const KEEP_DIRS = ['.well-known/'];
// Dossiers de travail, où qu'ils soient.
const WORK_DIR_NAMES = new Set(['Asepritelayers', 'arc-t5-candidats']);
// Dossiers de travail à un endroit précis (un nom trop courant pour valoir partout).
const WORK_DIR_PATHS = [
  'pixelart/palettes/',              // nuanciers de buildPalette.mjs (ignorés par git)
  'pixelart/ui/scratch/',            // symboles de tickets jamais branchés (ASSET-9)
  'pixelart/iso/plaza/anim/zone/',   // masques lus par plazaAnim*.mjs et isoPlaza.test.js
];
// Sources et notes, jamais chargées par le jeu.
const WORK_EXT = new Set(['.md', '.gpl', '.aseprite', '.ase']);
// Données des scripts et des tests (fire-ramp.json est accordé à flameGlow.js, qui en
// recopie les teintes : le jeu ne le lit jamais).
const WORK_FILES = new Set([
  'pixelart/master-palette.json',
  'pixelart/grass-ref.png',
  'pixelart/grass-ref.json',
  'pixelart/fire-ramp.json',
]);
// Faces séparées des osselets : instantanés de makeDesTemple.mjs (cf. leur _LISEZMOI.md).
const WORK_RE = [/^pixelart\/ui\/augures\/bones\/die-\d+\.png$/];

// `rel` : chemin relatif à public/, séparateurs « / ».
export function isWorkFile(rel) {
  if (KEEP.has(rel) || KEEP_DIRS.some((d) => rel.startsWith(d))) return false;
  const parts = rel.split('/');
  // `_orig/`, `_archive/`, `_zoom/`, `_guide.png`, `_LISEZMOI.md`, `.bones.stamp`…
  if (parts.some((p) => p.startsWith('_') || p.startsWith('.'))) return true;
  if (parts.slice(0, -1).some((p) => WORK_DIR_NAMES.has(p))) return true;
  if (WORK_DIR_PATHS.some((d) => rel.startsWith(d))) return true;
  if (WORK_EXT.has(path.posix.extname(rel).toLowerCase())) return true;
  if (WORK_FILES.has(rel)) return true;
  return WORK_RE.some((re) => re.test(rel));
}

// Tous les fichiers sous `dir`, en chemins relatifs « / ».
export function listFiles(dir, base = dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(full, base, out);
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// Retire de `outDir` les fichiers de travail venus de `publicDir`, puis les dossiers
// qu'ils laissent vides. Rend { files, bytes, removed }.
export function pruneWorkFiles(outDir, publicDir) {
  const removed = [];
  let bytes = 0;
  const dirs = new Set();
  for (const rel of listFiles(publicDir)) {
    if (!isWorkFile(rel)) continue;
    const f = path.join(outDir, ...rel.split('/'));
    let st;
    try { st = fs.statSync(f); } catch { continue; }
    if (!st.isFile()) continue;
    fs.rmSync(f, { force: true });
    removed.push(rel);
    bytes += st.size;
    for (let d = path.dirname(f); d.length > outDir.length && d.startsWith(outDir); d = path.dirname(d)) dirs.add(d);
  }
  // Les plus profonds d'abord : `_orig/` vidé, puis son parent s'il ne restait que lui.
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch { /* déjà parti ou non vide */ }
  }
  return { files: removed.length, bytes, removed };
}

// Plugin BUILD-ONLY. `order: 'pre'` : il passe AVANT les autres closeBundle (dist-finish
// de vite.config.js) — la recompression des PNG ne perd pas son temps sur des fichiers
// qui vont partir, et l'empreinte du service worker se calcule sur le dist/ final.
export function pruneWorkFilesPlugin() {
  let outDir = 'dist';
  let publicDir = '';
  let logger = console;
  return {
    name: 'prune-work-files',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      publicDir = config.publicDir || '';
      logger = config.logger;
    },
    closeBundle: {
      order: 'pre',
      handler() {
        if (!publicDir || !fs.existsSync(publicDir)) return;
        const r = pruneWorkFiles(outDir, publicDir);
        if (r.files) logger.info(`Fichiers de travail retirés de dist/ : ${r.files} (${(r.bytes / 1024).toFixed(0)} Ko)`);
      },
    },
  };
}
