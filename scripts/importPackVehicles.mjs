/**
 * IMPORT DE LA FLOTTE MODERNE — pack « Pixel Vehicles » (MinZinn, CC-BY 4.0).
 * ---------------------------------------------------------------------------
 * Le pack livre 23 modèles × 8 teintes × 8 directions × 12 frames en canevas
 * 100×100, soit 30 105 fichiers. Le jeu, lui, mange des BANDES carrées :
 * veh-<type>[-<skin>]-<direction>.png, N frames de côté FRAME, animées par
 * l'odomètre (cf. drawIsoVehicle). Ce script fait la conversion, et rien
 * d'autre — l'archive reste hors dépôt (.gitignore), seuls les dérivés sont
 * versionnés.
 *
 * CE QUI SE JOUE ICI, ET QUI NE SE VOIT QU'À LA TAILLE DE RENDU. Une voiture
 * fait ~18 px de long à l'écran (32 px de tuile × zoom 1,3 × 0,72 × 0,625). On
 * part de 83 px d'encre : c'est une division par 4,6. Trois pièges :
 *
 *   1. LE NEAREST MANGE UNE ROUE SUR DEUX. Le canvas dessine en
 *      imageSmoothingEnabled=false ; laisser le runtime réduire 100 px → 18 px
 *      au plus proche voisin efface une ligne de pixels sur quatre, au hasard
 *      de la position. On réduit donc ICI, par MOYENNE DE BOÎTE, et on livre du
 *      sprite déjà à l'échelle.
 *
 *   2. RECADRER FRAME PAR FRAME FAIT TREMBLER LA VOITURE. La boîte d'encre
 *      change d'un pixel entre deux frames (la roue tourne) ; recadrée frame
 *      par frame, la carrosserie sautille sur place. La boîte est donc l'UNION
 *      des frames d'une même direction.
 *
 *   3. UNE ENCRE CENTRÉE FLOTTE AU-DESSUS DE SON OMBRE. Le rendu pose l'ombre
 *      à +0,30 × hauteur depuis le CENTRE de la frame, calibrée sur l'ancien
 *      sprite dont le bas d'encre tombait à 0,88. La voiture du pack est bien
 *      plus plate (0,45 de haut contre 0,73) : centrée, ses roues atterrissent
 *      à 0,72 et l'ombre sort de dessous. On aligne donc le BAS d'encre sur
 *      FOOT_FRAC, jamais le centre.
 *
 * COULEUR (choix Raph 2026-08-05, « désaturer sans rabattre »). Pas de passage
 * par remapPalette : les teintes du pack restent reconnaissables, on baisse
 * seulement la saturation d'un cran et on plafonne la valeur pour que les
 * carrosseries blanches ne brûlent pas au milieu d'une carte sourde. Le nombre
 * de teintes, lui, est ramené à K par MÉDIANE COUPÉE — le pack en compte ~430
 * par sprite (dégradés de rendu 3D) contre 12 à 14 pour l'art du jeu, et cet
 * écart de GRAIN se voit même quand la teinte est juste.
 *
 * LA PALETTE EST CALCULÉE PAR SKIN, PAS PAR FICHIER. Quantifier chaque
 * direction séparément donne 4 palettes voisines mais distinctes : la voiture
 * change de rouge en tournant. Toutes les frames de toutes les directions d'un
 * même skin partagent donc une seule palette.
 *
 *   node scripts/importPackVehicles.mjs [--zip <archive>] [--sat 0.7] [--vmax 0.92]
 *                                       [--colors 24] [--frames 6] [--only car] [--dry]
 *
 * Écrit aussi src/game/map/vehicleSkins.js : le manifeste des skins livrés, lu
 * par le tirage au spawn. Il est GÉNÉRÉ pour qu'il ne puisse pas mentir sur ce
 * qui est réellement sur le disque.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import { bakeFrameSize, unionInk, areaScale, desaturate, quantize, placeInFrame, writeBand } from './lib/packBake.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, 'public', 'pixelart', 'agents', 'vehicles');
const MANIFEST = path.join(ROOT, 'src', 'game', 'map', 'vehicleSkins.js');

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const ZIP = flag('zip', path.join(ROOT, 'TopDown Vehicles v1.17.zip'));
const SAT = Number(flag('sat', 0.7));         // saturation × (1 = teintes du pack)
const VMAX = Number(flag('vmax', 0.88));      // plafond de valeur (blancs cassés)
const COLORS = Number(flag('colors', 24));    // teintes par skin (0 = ne pas quantifier)
const NFRAMES = Number(flag('frames', 6));    // frames gardées sur les 12 du pack
const ONLY = flag('only', null);
const DRY = argv.includes('--dry');

// TAILLE DE CUISSON. Le rendu dessine la frame dans une boîte de
// TILE × zoom × VEH_SIZES × VEH_SCALE pixels, au plus proche voisin. Cuire tout
// le monde à 64 px comme l'art historique ferait re-réduire 64 → 19 par le
// canvas, c'est-à-dire exactement le piège 1 qu'on prétend éviter. On cuit donc
// chaque type à la taille qu'il OCCUPE au zoom de référence : à Z_REF le blit
// est 1:1, au zoom par défaut (1,3) tout le monde descend du même facteur, et
// la densité de pixels devient la MÊME pour un bus et pour une berline.
const VEH_SCALE = 0.625;
const frameFor = (size) => bakeFrameSize(size, VEH_SCALE);
// Longueur du PROFIL en fraction de la frame. Volontairement sous 0,9 : la boîte
// d'encre d'une voiture de trois quarts est ~11 % plus large que son profil (la
// diagonale d'un rectangle dépasse son côté), et c'est cette vue-là qui doit
// tenir dans la frame. À 0,94 les trois quarts débordaient et se faisaient
// rogner d'un pare-chocs.
const INK_FRAC = 0.84;
const FOOT_FRAC = 0.86;    // bas de l'encre en fraction de la frame (cf. piège 3)

// Diagonales d'abord : ce sont les SEULES que la vue iso utilise (VEH_DIAG_MAP).
// Les cardinales ne servent que de repli au rendu legacy, mais `vehReady` les
// exige toutes les quatre — un type sans cardinales disparaîtrait en silence si
// ses diagonales tardaient à charger.
const DIAG = ['SOUTHEAST', 'SOUTHWEST', 'NORTHWEST', 'NORTHEAST'];
const CARD = ['EAST', 'WEST', 'SOUTH', 'NORTH'];

// ── L'ANGLE, ET POURQUOI IL NE FAUT PAS PRENDRE LES DIAGONALES DU PACK ────────
// Le pack livre deux jeux : MOVE (8 caps, 12 frames de roulage chacun) et un jeu
// « All » de 48 angles à 7,5°, une frame chacun. Calibré par silhouette contre
// les caps nommés : l'index 0 est plein EST et les index tournent dans le sens
// des aiguilles (6 = sud-est, 12 = sud…). Les « diagonales » du pack sont donc à
// 45° pile.
//
// Or une route iso ne file pas à 45° mais à atan(1/2) = 26,57° : un pas de monde
// (1,0) se projette en (+32,+16) écran. Une carrosserie de 18 px posée à 45° sur
// une route à 26,57° pointe 5,5 px trop bas — sur un sprite haut de 9 px, elle
// n'a pas l'air de rouler, elle a l'air de déraper. On prend donc dans le jeu
// « All » l'angle le PLUS PROCHE de la projection (30° au lieu de 45°, il reste
// 3,4° d'écart, invisibles), au prix de l'animation de roue : à cette taille
// elle bouge 30 pixels sur 162, et seulement quand on fixe une voiture à l'arrêt.
//   --angles move  rend les diagonales animées à 45° si l'arbitrage doit changer.
const ISO_ANGLE = { SOUTHEAST: 4, SOUTHWEST: 20, NORTHWEST: 28, NORTHEAST: 44 };
const CARD_ANGLE = { EAST: 0, SOUTH: 12, WEST: 24, NORTH: 36 };
const ANGLES = flag('angles', 'iso');

// La FLOTTE : quel dossier du pack devient quel type de véhicule du jeu.
// `size` est la valeur VEH_SIZES correspondante (hauteur de boîte en tuiles) —
// elle est reportée dans le manifeste pour que le runtime et l'art ne puissent
// pas diverger. Teintes retenues : ni jaune ni magenta (palette anti-jaune).
// `keepBase` : le type possède DÉJÀ une bande nue peinte à la main (la vieille
// automobile PixelLab de veh-car-*.png). On ne l'écrase pas — elle reste le repli
// si un skin manque, et l'art ancien ne se perd pas parce qu'un pack est arrivé.
const FLEET = [
  {
    type: 'car', size: 0.72, keepBase: true,
    models: [['sedan', 'SEDAN'], ['hatchback', 'HATCHBACK'], ['suv', 'SUV'], ['coupe', 'COUPE'], ['minivan', 'MINIVAN']],
    colors: ['Black', 'Blue', 'Red', 'White'],
  },
  { type: 'van', size: 0.9, models: [['', 'VAN TOP DOWN']], colors: ['White', 'Blue', 'Green'] },
  { type: 'truck', size: 1.05, models: [['', 'BOX TRUCK']], colors: ['White', 'Red', 'Blue'] },
  { type: 'bus', size: 1.3, models: [['', 'BUS']], colors: ['Blue', 'Red', 'White'] },
  { type: 'taxi', size: 0.72, models: [['', 'TAXI']], colors: [] },
  { type: 'police', size: 0.72, models: [['', 'POLICE']], colors: [] },
  { type: 'ambulance', size: 0.8, models: [['', 'AMBULANCE']], colors: [] },
];

// ── Archive ──────────────────────────────────────────────────────────────────
if (!fs.existsSync(ZIP)) {
  console.error(`archive introuvable : ${ZIP}\n(elle n'est pas versionnée — la retélécharger sur minzinn.itch.io/pixelvehicles)`);
  process.exit(1);
}
const zip = new AdmZip(ZIP);
const entries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.endsWith('.png'));

// Le pack est nommé À LA MAIN : « Magento » pour magenta, « HatchBack », et le
// bus bleu perd son préfixe de couleur. Aucun nom de fichier ne se CALCULE, on
// filtre sur le CHEMIN (dossier modèle / couleur / direction) et on trie.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sorted = (rx) => entries.filter((e) => rx.test(e.entryName)).sort((a, b) => a.entryName.localeCompare(b.entryName));

function framesOf(model, color, dir) {
  const head = color ? `${model} ${color}` : model;
  if (ANGLES === 'iso') {
    // Jeu « All » : 48 angles, une frame chacun. Les modèles teintés le rangent
    // sous <couleur>/SEPARATED, les véhicules de service sous ALL DIRECTION/.
    // Numérotation flottante : « …_All_000.png » chez les modèles teintés, mais
    // « …_ALLD0000.png » pour le bus bleu et les véhicules de service. On accroche
    // les CHIFFRES DE FIN, pas un séparateur qui n'existe pas partout.
    const rx = new RegExp(`^${esc(model)}[^/]*/${color ? color + '/' : 'ALL DIRECTION/'}SEPARATED/[^/]+\\d{3,4}\\.png$`, 'i');
    const all = sorted(rx);
    if (all.length < 48) throw new Error(`jeu « All » incomplet pour ${head} (${all.length} angles)`);
    const idx = (ISO_ANGLE[dir] != null ? ISO_ANGLE[dir] : CARD_ANGLE[dir]) % all.length;
    return [PNG.sync.read(all[idx].getData())];
  }
  const rx = new RegExp(`^${esc(model)}[^/]*/${color ? color + '/' : ''}MOVE/${dir}/SEPARATED/[^/]+_(\\d{3})\\.png$`, 'i');
  const hits = sorted(rx);
  if (!hits.length) throw new Error(`aucune frame pour ${head} ${dir}`);
  // 12 frames à 12 fps dans le pack ; on en garde NFRAMES réparties sur le cycle
  // (le jeu re-cadence de toute façon à l'odomètre).
  const step = Math.max(1, Math.floor(hits.length / NFRAMES));
  const kept = [];
  for (let i = 0; kept.length < NFRAMES && i < hits.length; i += step) kept.push(hits[i]);
  return kept.map((e) => PNG.sync.read(e.getData()));
}

// ÉCHELLE UNIQUE PAR VÉHICULE, MESURÉE SUR LE PROFIL. Normaliser la largeur de
// chaque direction séparément revient à dire « toutes les vues font la même
// longueur » : une voiture vue de face, dont la boîte est étroite, serait alors
// gonflée jusqu'à remplir la frame — elle changerait de taille en tournant. Les
// 48 angles sont des rendus du MÊME modèle à la MÊME distance : un seul facteur,
// pris sur la vue de profil, les remet tous d'équerre.
function refScale(model, color, FRAME) {
  const box = unionInk(framesOf(model, color, 'EAST'));
  return (FRAME * INK_FRAC) / box.w;
}

// Une direction → une bande de NFRAMES frames carrées, encre calée sur FOOT_FRAC.
function buildBand(model, color, dir, FRAME, scale) {
  const frames = framesOf(model, color, dir);
  const box = unionInk(frames);                       // union : cf. piège 2
  const tw = Math.max(1, Math.min(FRAME, Math.round(box.w * scale)));
  const th = Math.max(1, Math.min(FRAME, Math.round(box.h * scale)));
  // Le placement (bas d'encre calé, cf. piège 3) et l'écriture sont dans
  // scripts/lib/packBake.mjs : c'est le même geste pour tous les packs.
  return frames.map((p) => {
    const small = areaScale(p, box, tw, th);
    desaturate(small, SAT, VMAX);
    return placeInFrame(small, tw, th, FRAME, FOOT_FRAC);
  });
}

// ── Passe principale ─────────────────────────────────────────────────────────
if (!DRY) fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
let written = 0;

for (const entry of FLEET) {
  if (ONLY && entry.type !== ONLY) continue;
  const skins = [];
  const combos = entry.colors.length
    ? entry.models.flatMap(([key, model]) => entry.colors.map((c) => ({ model, color: c, skin: [key, c.toLowerCase()].filter(Boolean).join('-') })))
    : entry.models.map(([key, model]) => ({ model, color: '', skin: key || '' }));

  const FRAME = frameFor(entry.size);
  for (const combo of combos) {
    // Cardinales cuites seulement pour le repli (bande nue) : elles ne servent
    // qu'au rendu legacy, la vue iso ne lit que les diagonales.
    const needsCard = (!combo.skin || combo === combos[0]) && !entry.keepBase;
    const dirs = needsCard ? [...DIAG, ...CARD] : DIAG;
    // Toutes les directions d'un skin partagent UNE palette (cf. en-tête).
    const bands = {};
    const scale = refScale(combo.model, combo.color, FRAME);
    for (const dir of dirs) bands[dir] = buildBand(combo.model, combo.color, dir, FRAME, scale);
    quantize(Object.values(bands).flat(), COLORS);

    // Un skin ne livre que ses DIAGONALES : la vue iso ne lit rien d'autre, et
    // quatre cardinales par teinte feraient 80 fichiers morts pour les seules
    // voitures. Le repli, lui, est complet.
    const suffix = combo.skin ? `-${combo.skin}` : '';
    for (const dir of (combo.skin ? DIAG : [...DIAG, ...CARD])) {
      writeBand(path.join(OUT, `veh-${entry.type}${suffix}-${dir.toLowerCase()}.png`), bands[dir], FRAME, DRY);
      written++;
    }
    if (combo.skin) skins.push(combo.skin);

    // Le PREMIER skin sert aussi de bande NUE (veh-<type>-<dir>.png) : c'est le
    // repli quand un skin manque, et ce que `ensureVeh` charge au démarrage.
    if (combo === combos[0] && combo.skin && !entry.keepBase) {
      for (const dir of [...DIAG, ...CARD]) {
        writeBand(path.join(OUT, `veh-${entry.type}-${dir.toLowerCase()}.png`), bands[dir], FRAME, DRY);
        written++;
      }
    }
    console.log(`  ${entry.type}${suffix} — ${Object.keys(bands).length} directions à ${FRAME}px`);
  }
  manifest[entry.type] = { size: entry.size, skins };
}

const header = `// GÉNÉRÉ par scripts/importPackVehicles.mjs — ne pas éditer à la main.
// Skins livrés pour la flotte moderne (pack « Pixel Vehicles », MinZinn, CC-BY 4.0).
// Un skin = un fichier veh-<type>-<skin>-<diagonale>.png sur le disque ; le tirage
// au spawn n'a le droit de nommer QUE ce qui est listé ici.
`;
const body = `export const VEH_SKINS = ${JSON.stringify(manifest, null, 2)};\n`;
if (!DRY) fs.writeFileSync(MANIFEST, header + body);

console.log(`\n${written} bandes écrites dans public/pixelart/agents/vehicles${DRY ? ' (DRY)' : ''}`);
console.log(`manifeste : ${path.relative(ROOT, MANIFEST)}`);
