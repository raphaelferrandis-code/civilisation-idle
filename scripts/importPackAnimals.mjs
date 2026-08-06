/**
 * IMPORT DU BÉTAIL ET DES ANIMAUX DE RUE — pack « 2D Pixel Animal Character »
 * (LaserKiwi). ⚠ La page itch.io n'affiche AUCUNE licence : cf. CREDITS.md, à
 * confirmer auprès de l'auteur avant toute diffusion du jeu.
 * ---------------------------------------------------------------------------
 * Le pack est un export PixelLab (metadata.json le dit : « low top-down »,
 * 8 directions, 64×64) et ne contient QUE des poses fixes — `animations: {}`.
 * D'où le parti pris : ces bêtes ne marcheront pas. Elles broutent, elles
 * dorment au seuil d'une maison. Un mouton immobile dans un pré est juste ; un
 * mouton qui glisse sans bouger les pattes ne l'est pas.
 *
 * C'est aussi pourquoi les bêtes de trait du jeu (cheval et bœuf, bandes de six
 * frames) ne sont PAS remplacées : elles tirent des charrettes, il leur faut des
 * pattes qui bougent — et elles sont déjà dans la palette.
 *
 * ON NE GARDE QUE LES DIAGONALES. En vue iso une bête vue de face ou de dos
 * n'offre aucune silhouette : c'est un tas. Les quatre diagonales suffisent, et
 * le tirage d'orientation par cellule en fait de la variété gratuite.
 *
 *   node scripts/importPackAnimals.mjs [--zip <archive>] [--sat 0.72] [--colors 16] [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import { bakeFrameSize, unionInk, areaScale, desaturate, quantize, placeInFrame, writeBand } from './lib/packBake.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, 'public', 'pixelart', 'agents', 'animals');

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const ZIP = flag('zip', path.join(ROOT, 'Animal Characters.zip'));
const SAT = Number(flag('sat', 0.72));
const VMAX = Number(flag('vmax', 0.88));
const COLORS = Number(flag('colors', 16));
const DRY = argv.includes('--dry');

const AGENT_SCALE = 0.5;   // même facteur que les habitants (cf. agents.js)
const INK_FRAC = 0.82;     // longueur du profil en fraction de la frame
const FOOT_FRAC = 0.94;    // les pattes touchent presque le bas de la frame

// Le pack nomme ses directions en minuscules à tiret ; le jeu, en un seul mot.
const DIAG = [['south-east', 'southeast'], ['south-west', 'southwest'], ['north-west', 'northwest'], ['north-east', 'northeast']];

// Qui entre, et à quelle taille (en tuiles, AVANT AGENT_SCALE — même unité que
// les `scale` d'habitants et de bêtes de trait, où le bœuf vaut 0,975).
// Le cheval du pack est ROSE et le jeu en a déjà un, animé : il reste dehors.
const HERD = [
  { key: 'cow', src: 'Cow', size: 0.95 },
  { key: 'sheep', src: 'Sheep', size: 0.66 },
  { key: 'goat', src: 'Goat', size: 0.64 },
  // Chien et chat REMONTÉS d'un cran par rapport à leur taille réelle : à
  // l'échelle exacte (10 px pour un habitant), un chat fait 7 px de long, soit
  // une tache de quatre pixels une fois l'ombre enlevée. On triche de 20 %,
  // comme tous les jeux à cette échelle, sinon autant ne pas les poser.
  { key: 'dog', src: 'Dog', size: 0.55 },
  { key: 'cat', src: 'Cat', size: 0.42 },
];

if (!fs.existsSync(ZIP)) {
  console.error(`archive introuvable : ${ZIP}\n(elle n'est pas versionnée — la retélécharger sur laserkiwi.itch.io)`);
  process.exit(1);
}
const zip = new AdmZip(ZIP);
const entries = zip.getEntries();
const grab = (animal, dir) => {
  const hit = entries.find((e) => new RegExp(`${animal}/rotations/${dir}\\.png$`, 'i').test(e.entryName));
  if (!hit) throw new Error(`rotation absente : ${animal} ${dir}`);
  return PNG.sync.read(zip.readFile(hit));
};

if (!DRY) fs.mkdirSync(OUT, { recursive: true });
let written = 0;
for (const beast of HERD) {
  const FRAME = bakeFrameSize(beast.size, AGENT_SCALE);
  // Échelle mesurée sur le PROFIL (vue est), commune aux quatre diagonales :
  // normaliser chaque vue sur sa propre boîte ferait grossir la bête en tournant.
  const scale = (FRAME * INK_FRAC) / unionInk([grab(beast.src, 'east')]).w;
  const cells = {};
  for (const [src] of DIAG) {
    const p = grab(beast.src, src);
    const box = unionInk([p]);
    const tw = Math.max(1, Math.min(FRAME, Math.round(box.w * scale)));
    const th = Math.max(1, Math.min(FRAME, Math.round(box.h * scale)));
    const small = areaScale(p, box, tw, th);
    desaturate(small, SAT, VMAX);
    cells[src] = placeInFrame(small, tw, th, FRAME, FOOT_FRAC);
  }
  quantize(Object.values(cells), COLORS);   // une palette pour toute la bête
  for (const [src, out] of DIAG) {
    writeBand(path.join(OUT, `critter-${beast.key}-${out}.png`), [cells[src]], FRAME, DRY);
    written++;
  }
  console.log(`  ${beast.key} — 4 diagonales à ${FRAME}px`);
}
console.log(`\n${written} sprites écrits dans public/pixelart/agents/animals${DRY ? ' (DRY)' : ''}`);
