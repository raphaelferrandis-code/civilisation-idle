// RABAT un sprite d'habitation sur la rampe de sa teinte.
//
//   node scripts/snapTintRamp.mjs <variante...> [--seuil 12] [--dry]
//   node scripts/snapTintRamp.mjs manor --dry
//
// POURQUOI. La variation d'instance (housePalette.js) ne CALCULE pas une
// couleur : elle lit chaque pixel dans une table de correspondance EXACTE,
// hexadécimal par hexadécimal. Un pixel à 3 unités de sa rampe n'est donc pas
// « un peu moins bien repeint », il n'est PAS repeint du tout. Une passe de
// retouche qui décale imperceptiblement les tons (le manoir a perdu sa
// variation dans la passe « ombre au sol », commit 52e65d2 : #aa6545 au lieu
// de #b06a48, distance 8) fait tomber l'archétype à 0 % en silence.
//
// Cet outil ne redéfinit aucune couleur : il ne DÉPLACE que les pixels déjà
// tout près d'un ton de leur rampe, et laisse tout le reste intact (feuillage,
// crépi blanc, gris de toiture). Au-delà du seuil, il ne touche à rien —
// mieux vaut un archétype non repeint qu'un vert rabattu sur de la brique.
//
// La rampe vient de HOUSE_TINTS, la table que le RENDU consomme : jamais une
// recopie, sinon l'outil pourrait « réparer » vers des couleurs périmées.
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { HOUSE_TINTS, HOUSE_FAMILY, COULEURS_PROTEGEES } from '../src/game/map/housePalette.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DIR = path.join(ROOT, 'public', 'pixelart', 'houses');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const iS = args.indexOf('--seuil');
const SEUIL = iS >= 0 && args[iS + 1] ? Number(args[iS + 1]) : 12;
const variantes = args.filter((a, i) => !a.startsWith('--') && !(iS >= 0 && i === iS + 1));
if (!variantes.length) {
  console.error('usage: node scripts/snapTintRamp.mjs <variante...> [--seuil 12] [--dry]');
  process.exit(1);
}

for (const nom of variantes) {
  const idx = HOUSE_FAMILY[nom] | 0;
  const tint = HOUSE_TINTS[idx];
  if (!tint || !tint.map) { console.log(`${nom} : aucune teinte (famille ${idx}) — rien à rabattre`); continue; }
  // Les CLÉS de la table de teinte sont exactement les tons de la rampe. Les couleurs
  // PROTÉGÉES entrent dans la comparaison comme RÉPULSIF : un pixel plus proche d'un
  // contour ou d'un feuillage que d'un ton de rampe est LAISSÉ TEL QUEL. Sans ça, le
  // noir de contour du manoir (#211a1c, à 1 unité de son canonique #211a1d mais à 11
  // du ton de brique le plus sombre) serait aspiré dans la rampe : le trait
  // deviendrait échangeable et changerait de couleur avec la teinte — exactement ce
  // que la garde interdit. On ne les DÉPLACE pas non plus : hors rampe, ils sont déjà
  // hors d'atteinte de l'échange, et les bouger serait retoucher l'art sans raison.
  const cible = (c, protege) => ({ c, protege, r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 });
  const rampe = [...tint.map.keys()].map((c) => cible(c, false));
  const proteges = Object.keys(COULEURS_PROTEGEES).map((h) => cible(parseInt(h.slice(1), 16), true));
  for (const p of proteges) {
    if (tint.map.has(p.c)) throw new Error(`incoherence : ${'#' + p.c.toString(16)} est a la fois protege et dans la rampe ${tint.id}`);
  }
  const candidats = rampe.concat(proteges);
  const f = path.join(DIR, nom + '.png');
  const p = PNG.sync.read(fs.readFileSync(f));
  const cache = new Map();                  // couleur source -> { c } | null
  const repousses = new Set();              // couleurs laissées telles quelles (protégées)
  let opaques = 0, avant = 0, versRampe = 0, apres = 0;
  const detail = new Map();
  for (let i = 0; i < p.data.length; i += 4) {
    if (p.data[i + 3] < 128) continue;
    opaques++;
    const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
    const c = (r << 16) | (g << 8) | b;
    if (tint.map.has(c)) { avant++; apres++; continue; }
    let choix = cache.get(c);
    if (choix === undefined) {
      let best = null, bd = Infinity;
      for (const k of candidats) {
        const d = Math.hypot(r - k.r, g - k.g, b - k.b);
        if (d < bd) { bd = d; best = k; }
      }
      choix = (bd <= SEUIL && !best.protege) ? { c: best.c, protege: false, d: bd } : null;
      if (bd <= SEUIL && best.protege) repousses.add(c);
      cache.set(c, choix);
      if (choix) {
        detail.set(c, { vers: choix.c, d: bd, protege: choix.protege, n: 0 });
      }
    }
    if (!choix) continue;
    detail.get(c).n += 1;
    if (!dry) { p.data[i] = (choix.c >> 16) & 255; p.data[i + 1] = (choix.c >> 8) & 255; p.data[i + 2] = choix.c & 255; }
    versRampe++; apres++;
  }
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  console.log(`${nom} (teinte « ${tint.id} », seuil ${SEUIL}) : ${(100 * avant / opaques).toFixed(0)} % → ${(100 * apres / opaques).toFixed(0)} % de surface repeinte, ${versRampe} px déplacés`);
  for (const [src, d] of [...detail.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`   ${hex(src)} → ${hex(d.vers)} (d=${d.d.toFixed(1)}) ×${d.n}`);
  }
  if (repousses.size) console.log(`   (${repousses.size} teinte(s) laissée(s) intacte(s) car plus proches d'une couleur protégée : ${[...repousses].map(hex).join(', ')})`);
  if (!dry) fs.writeFileSync(f, PNG.sync.write(p));
}
if (dry) console.log('\n(--dry : rien écrit)');
