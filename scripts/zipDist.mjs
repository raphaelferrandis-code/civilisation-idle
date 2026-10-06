// Fabrique l'archive du build web, prête à déposer sur un hébergeur statique
// (Netlify Drop, Cloudflare Pages, itch.io).
//
//   npm run build ; npm run zip:web
//   node scripts/zipDist.mjs [sortie.zip]
//
// Sortie par défaut : civilisation-idle-web.zip à la racine du dépôt (ignorée par
// git : `/*.zip` dans .gitignore). C'est le SEUL script d'archive web : l'ancien
// scripts/zip-netlify.ps1 (même archive, en PowerShell) est supprimé, sa relecture
// de contrôle est reprise ici (audit 2026-10-05, SCRIPT-14).
//
// ⚠⚠ POURQUOI CE SCRIPT EXISTE, ET NON `Compress-Archive` : les outils ZIP de
// Windows (`Compress-Archive` de PowerShell 5.1, comme
// `ZipFile.CreateFromDirectory` de .NET Framework) écrivent les noms d'entrée
// avec des ANTISLASHS — `assets\index-abc.js`. La spécification ZIP impose la
// barre oblique (APPNOTE 4.4.17.1). Beaucoup d'outils tolèrent l'écart ; les
// hébergeurs statiques, non : ils prennent `assets\index-abc.js` pour un NOM DE
// FICHIER PLAT, posent tout à la racine, et le site répond 404 sur chacun de ses
// scripts. Vécu le 2026-07-31 sur Netlify : l'index se chargeait (son nom n'a pas
// de séparateur), la page restait blanche, et rien dans la console ne désignait
// la cause.
// ⚠ `tar -a -c -f sortie.zip` (bsdtar de Windows) ne marche pas non plus : il
// ignore l'extension et produit un TAR nommé .zip (« End of Central Directory
// introuvable »). Essayé, écarté.
//
// On écrit donc l'archive à la main, en normalisant chaque chemin. Le zip contient
// le CONTENU de dist/, pas le dossier : l'hébergeur attend index.html à la racine.
// Pas de ZIP64 : au-delà de 65 535 fichiers ou de 4 Gio, le script refuse (dist/
// pèse ~35 Mo pour ~2 000 fichiers).
import { createWriteStream, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDeflateRaw } from "node:zlib";
import { Buffer } from "node:buffer";
import AdmZip from "adm-zip";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_16 = 0xffff, MAX_32 = 0xffffffff;

async function lister(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await lister(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function deflate(buf) {
  return new Promise((res, rej) => {
    const z = createDeflateRaw({ level: 9 });
    const morceaux = [];
    z.on("data", (d) => morceaux.push(d));
    z.on("end", () => res(Buffer.concat(morceaux)));
    z.on("error", rej);
    z.end(buf);
  });
}

// Date et heure MS-DOS (heure locale, secondes paires) : la date 0 de l'ancienne
// version (mois 0, jour 0) n'existe pas, et certains décompresseurs l'affichent
// en 1979 ou la refusent. Avant 1980 (horloge cassée), on pose le 1er janvier 1980.
function dateDos(d) {
  if (d.getFullYear() < 1980) return { date: (1 << 5) | 1, heure: 0 };
  return {
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

// Écrit `sortie` avec le contenu de `source`. Rend les noms écrits et leur taille.
export async function zipDossier(source, sortie) {
  const fichiers = (await lister(source)).sort();
  if (fichiers.length > MAX_16) throw new Error(`${fichiers.length} fichiers : au-delà de 65 535, il faudrait du ZIP64`);
  const flux = createWriteStream(sortie);
  let erreurFlux = null;
  flux.on("error", (e) => { erreurFlux = e; });
  const ecrire = (b) => new Promise((r, rej) => {
    if (erreurFlux) return rej(erreurFlux);
    if (flux.write(b)) return r();
    // disque plein, dossier absent… : rejeter au lieu d'attendre un `drain` qui ne viendra pas
    const fini = (e) => { flux.off("drain", fini); flux.off("error", fini); e ? rej(e) : r(); };
    flux.once("drain", fini); flux.once("error", fini);
  });

  let offset = 0;
  const centrales = [];
  const tailles = new Map();

  for (const f of fichiers) {
    // ⚠ LA LIGNE QUI COMPTE : séparateurs normalisés en barres obliques.
    const nom = relative(source, f).split("\\").join("/");
    const brut = await readFile(f);
    const comp = await deflate(brut);
    const nomBuf = Buffer.from(nom, "utf8");
    const crc = crc32(brut);
    const { date, heure } = dateDos((await stat(f)).mtime);
    if (brut.length > MAX_32 || offset > MAX_32) throw new Error(`${nom} : au-delà de 4 Gio, il faudrait du ZIP64`);
    tailles.set(nom, brut.length);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version requise
    local.writeUInt16LE(0x0800, 6);      // nom en UTF-8
    local.writeUInt16LE(8, 8);           // deflate
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(nomBuf.length, 26);
    local.writeUInt16LE(0, 28);
    await ecrire(local); await ecrire(nomBuf); await ecrire(comp);

    const centrale = Buffer.alloc(46);
    centrale.writeUInt32LE(0x02014b50, 0);
    centrale.writeUInt16LE(20, 4); centrale.writeUInt16LE(20, 6);
    centrale.writeUInt16LE(0x0800, 8); centrale.writeUInt16LE(8, 10);
    centrale.writeUInt16LE(heure, 12);
    centrale.writeUInt16LE(date, 14);
    centrale.writeUInt32LE(crc, 16);
    centrale.writeUInt32LE(comp.length, 20);
    centrale.writeUInt32LE(brut.length, 24);
    centrale.writeUInt16LE(nomBuf.length, 28);
    centrale.writeUInt32LE(offset, 42);
    centrales.push(Buffer.concat([centrale, nomBuf]));

    offset += local.length + nomBuf.length + comp.length;
  }

  const debutCentral = offset;
  for (const c of centrales) { await ecrire(c); offset += c.length; }
  if (offset > MAX_32) throw new Error("archive au-delà de 4 Gio : il faudrait du ZIP64");

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(centrales.length, 8);
  fin.writeUInt16LE(centrales.length, 10);
  fin.writeUInt32LE(offset - debutCentral, 12);
  fin.writeUInt32LE(debutCentral, 16);
  await ecrire(fin);

  await new Promise((r, rej) => flux.end((e) => (e || erreurFlux ? rej(e || erreurFlux) : r())));
  return tailles;
}

// GARDE : on relit ce qu'on vient d'écrire. Un zip cassé ne se voit qu'une fois en
// ligne, et « ça marchait chez moi » ne s'applique pas à une archive.
//   1. les noms BRUTS du répertoire central (lus ici, octet par octet : un lecteur
//      qui normaliserait les antislashs masquerait justement la panne) : aucun
//      antislash, index.html à la racine, autant d'entrées que de fichiers ;
//   2. une lecture COMPLÈTE par une autre implémentation (adm-zip) : chaque entrée
//      se décompresse, son CRC est contrôlé et sa taille est celle du fichier.
// `tailles` (nom → octets) est optionnel : sans lui, seuls les contrôles de forme.
export function verifierArchive(sortie, tailles = null) {
  const buf = readFileSync(sortie);
  // La fin de répertoire central (22 octets + un commentaire de 64 Kio au plus),
  // cherchée depuis la fin : c'est ainsi que la trouvent les décompresseurs.
  let eocd = -1;
  for (let p = buf.length - 22; p >= Math.max(0, buf.length - 22 - MAX_16); p--) {
    if (buf.readUInt32LE(p) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error("fin de répertoire central introuvable : ce n'est pas un ZIP");
  const n = buf.readUInt16LE(eocd + 10);
  const noms = [];
  for (let p = buf.readUInt32LE(eocd + 16), i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`répertoire central corrompu à l'entrée ${i}`);
    const lNom = buf.readUInt16LE(p + 28), lExtra = buf.readUInt16LE(p + 30), lCom = buf.readUInt16LE(p + 32);
    noms.push(buf.toString("utf8", p + 46, p + 46 + lNom));
    p += 46 + lNom + lExtra + lCom;
  }
  const antislash = noms.filter((s) => s.includes("\\")).length;
  if (antislash > 0) throw new Error(`${antislash} entrées en antislash — archive inutilisable`);
  if (!noms.includes("index.html")) throw new Error("index.html absent de la racine de l'archive");
  if (tailles && noms.length !== tailles.size) throw new Error(`${noms.length} entrées pour ${tailles.size} fichiers`);
  for (const e of new AdmZip(buf).getEntries()) {
    const data = e.getData(); // lève une erreur si le CRC ne correspond pas
    if (tailles && data.length !== tailles.get(e.entryName)) throw new Error(`${e.entryName} : ${data.length} octets relus pour ${tailles.get(e.entryName)}`);
  }
  return noms;
}

const lanceDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  const SOURCE = join(racine, "dist");
  const SORTIE = process.argv[2] || join(racine, "civilisation-idle-web.zip");
  if (!existsSync(join(SOURCE, "index.html"))) {
    console.error("dist/index.html absent — lance d'abord : npm run build");
    process.exit(1);
  }
  try {
    const tailles = await zipDossier(SOURCE, SORTIE);
    verifierArchive(SORTIE, tailles);
    const mo = (statSync(SORTIE).size / 1048576).toFixed(1);
    console.log(`écrit ${SORTIE} — ${mo} Mo, ${tailles.size} fichiers, index.html à la racine, 0 antislash`);
  } catch (e) {
    // Une archive qui a échoué à la relecture ne doit pas rester là, prête à déposer.
    rmSync(SORTIE, { force: true });
    console.error(`archive refusée : ${e.message}`);
    process.exit(1);
  }
}
