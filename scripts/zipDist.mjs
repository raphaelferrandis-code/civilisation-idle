// Fabrique l'archive du build web, prête à déposer sur un hébergeur statique.
//
//   node scripts/zipDist.mjs
//
// ⚠⚠ POURQUOI CE SCRIPT EXISTE, ET NON `Compress-Archive` : les outils ZIP de
// Windows (`Compress-Archive` de PowerShell 5.1, comme
// `ZipFile.CreateFromDirectory` de .NET Framework) écrivent les noms d'entrée
// avec des ANTISLASHS — `assets\index-abc.js`. La spécification ZIP impose la
// barre oblique. Beaucoup d'outils tolèrent l'écart ; les hébergeurs statiques,
// non : ils prennent `assets\index-abc.js` pour un NOM DE FICHIER PLAT, posent
// tout à la racine, et le site répond 404 sur chacun de ses scripts. Vécu le
// 2026-07-31 sur Netlify : l'index se chargeait (son nom n'a pas de séparateur),
// la page restait blanche, et rien dans la console ne désignait la cause.
//
// On écrit donc l'archive à la main, en normalisant chaque chemin.
import { createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeflateRaw } from "node:zlib";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(racine, "dist");
const SORTIE = process.argv[2] || join(racine, "civilisation-idle-web.zip");

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

const fichiers = (await lister(SOURCE)).sort();
const flux = createWriteStream(SORTIE);
const ecrire = (b) => new Promise((r) => (flux.write(b) ? r() : flux.once("drain", r)));

let offset = 0;
const centrales = [];

for (const f of fichiers) {
  // ⚠ LA LIGNE QUI COMPTE : séparateurs normalisés en barres obliques.
  const nom = relative(SOURCE, f).split("\\").join("/");
  const brut = await readFile(f);
  const comp = await deflate(brut);
  const nomBuf = Buffer.from(nom, "utf8");
  const crc = crc32(brut);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);          // version requise
  local.writeUInt16LE(0x0800, 6);      // nom en UTF-8
  local.writeUInt16LE(8, 8);           // deflate
  local.writeUInt32LE(0, 10);          // heure/date : indifférentes ici
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
  centrale.writeUInt32LE(0, 12);
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

const fin = Buffer.alloc(22);
fin.writeUInt32LE(0x06054b50, 0);
fin.writeUInt16LE(centrales.length, 8);
fin.writeUInt16LE(centrales.length, 10);
fin.writeUInt32LE(offset - debutCentral, 12);
fin.writeUInt32LE(debutCentral, 16);
await ecrire(fin);

await new Promise((r) => flux.end(r));
console.log(`écrit ${SORTIE} — ${fichiers.length} fichiers, séparateurs « / »`);
