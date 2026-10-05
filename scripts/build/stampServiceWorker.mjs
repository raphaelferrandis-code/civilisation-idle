// Date le service worker de la version web (audit 2026-10-05, WEB-1).
//
// public/sw.js nomme son cache `civ-effondrement-v3-__BUILD_ID__`. Ici, en fin
// de build, le repère devient l'empreinte du CONTENU de dist/ (tout sauf sw.js
// lui-même) : dès qu'un script, un style OU UN SPRITE change, sw.js change
// d'au moins un octet, le navigateur installe le nouveau service worker, et son
// `activate` purge l'ancien cache. Sans ça, sw.js restait identique d'un
// déploiement à l'autre : aucun nouveau service worker, et les sprites servis
// « cache d'abord » restaient ceux de la première visite, à vie.
//
// Empreinte de contenu et non horodatage : reconstruire le même commit redonne
// le même repère, et un redéploiement à l'identique ne vide le cache de personne.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

export const BUILD_ID_TOKEN = '__BUILD_ID__';

function listFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// Empreinte (12 caractères hexa) des fichiers de `dir`, sw.js exclu. Chemins
// triés et séparateurs normalisés : même résultat sous Windows et sous Linux.
export function distBuildId(dir, swName = 'sw.js') {
  const hash = createHash('sha1');
  const files = listFiles(dir)
    .map((p) => ({ p, rel: relative(dir, p).split('\\').join('/') }))
    .filter((f) => f.rel !== swName)
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const f of files) {
    hash.update(f.rel + '\0');
    hash.update(readFileSync(f.p));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

// Remplace le repère dans <dir>/sw.js. → l'empreinte posée, ou null s'il n'y a
// pas de service worker (ou plus de repère) à dater.
export function stampServiceWorker(dir, swName = 'sw.js') {
  const swPath = join(dir, swName);
  if (!existsSync(swPath)) return null;
  const src = readFileSync(swPath, 'utf8');
  if (!src.includes(BUILD_ID_TOKEN)) return null;
  const id = distBuildId(dir, swName);
  writeFileSync(swPath, src.split(BUILD_ID_TOKEN).join(id));
  return id;
}
