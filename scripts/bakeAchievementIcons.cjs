// bakeAchievementIcons.cjs — les icônes des SUCCÈS, 64×64, pour Steam et la Chronique
// (audit 2026-10-05, SUCCES-AFFICHAGE, décision de Raph).
//
// Pour chaque succès de src/game/data/achievements.js, deux fichiers dans
// public/pixelart/ui/achievements/ :
//   <ID>.png       l'icône débloquée (Steam : « Achieved icon ») ;
//   <ID>-gris.png  la même en gris assombri (Steam : « Unachieved icon »), aussi
//                  montrée dans la Chronique pour un succès encore verrouillé.
//
// D'OÙ VIENT L'ART. D'abord l'art DÉJÀ dans le jeu (fichiers suivis par git, d'origine
// connue) : emblèmes de l'arbre des Ruines (maîtres 64 px rangés dans
// art/emblemes-ruines/), icônes des Mythes, couronne, colonne, Icare, amphore de la
// Faveur, mises et faces des osselets (dessinées par Raph), cartes du vingt-et-un
// (pack Bit Digitalis, crédité), icônes de la boutique (32 px). Les symboles de
// tickets de public/pixelart/ui/scratch/ ne servent PAS : jamais committés, d'origine
// inconnue (ASSET-9). Puis, pour ce qui n'avait aucun art (Mythes sans emblème,
// Maison, quelques jalons), 22 icônes PixelLab générées DIRECTEMENT en 64×64
// (create_image_pixflux, palette forcée sur public/pixelart/master-palette.gpl),
// gardées telles quelles dans art/succes/<ID>.png.
//
// RÈGLE DE NETTETÉ : AUCUNE réduction (jamais de moyenne de pixels). Une source de
// 64 px est recopiée 1:1 ; une plus petite est soit agrandie d'un facteur ENTIER au
// plus proche voisin (les icônes 32 px de la boutique : ×2 ; `scale` pour les autres),
// soit posée 1:1 au centre (boîte des pixels opaques recentrée). Une source plus
// grande que 64 px après rognage est REFUSÉE (le script s'arrête) : il faudrait la
// redessiner, pas la réduire.
//
// Lancer (régénérable à l'identique, ÉCRASE ses sorties) :
//   node scripts/bakeAchievementIcons.cjs
// Ajouter un succès : une ligne dans SOURCES ci-dessous, puis relancer ; le test
// (achievementIcons.test.js) refuse un succès sans ses deux icônes.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public/pixelart/ui/achievements');
const SIZE = 64;

const ui = (p) => `public/pixelart/ui/${p}.png`;
const emblem = (id) => `art/emblemes-ruines/node-${id}.png`;
const gen = (id) => `art/succes/${id}.png`;

// Une entrée : `src` (une image, `scale` = agrandissement entier optionnel) ou
// `pieces` (plusieurs images 1:1, [fichier sous ui/, x, y] dans le cadre 64×64, la
// dernière posée par-dessus : cartes en éventail, faces d'osselets).
const SOURCES = {
  // ── Les ères
  ERE_HAMEAU: { src: ui('buildings/roads') },
  ERE_VILLAGE: { src: ui('buildings/irrigated_fields') },
  ERE_BOURG_MARCHAND: { src: ui('buildings/markets') },
  ERE_CITE_FORTIFIEE: { src: ui('buildings/watch') },
  ERE_ROYAUME: { src: ui('glyphs/couronne') },
  ERE_EMPIRE: { src: ui('buildings/ministries') },
  ERE_METROPOLE: { src: emblem('ville_monde') },
  ERE_SINGULARITE: { src: ui('buildings/archive_grids') },
  ERE_CONSCIENCE: { src: gen('ERE_CONSCIENCE') },
  ERE_DYSON: { src: gen('ERE_DYSON') },
  // ── Les chutes
  CHUTE_PREMIERE: { src: gen('CHUTE_PREMIERE') },
  CHUTE_10: { src: emblem('recurring_ages') },
  CHUTE_50: { src: emblem('preparations_funebres') },
  CHUTE_100: { src: emblem('epitaphes_profondes') },
  CHUTE_250: { src: emblem('dogma_eternal_return') },
  CYCLE_UNE_HEURE: { src: emblem('rites_feu_court') },
  CRISES_TROIS: { src: emblem('conseil_de_crise') },
  VOEU_TENU: { src: ui('myths/pacte') },
  TESTAMENT: { src: emblem('edit_effondrement') },
  // ── La cité
  RUINES_CENT: { src: emblem('skill_archaeology') },
  RUINES_MILLION: { src: emblem('reliquaire_pics') },
  RUINES_BILLIARD: { src: emblem('fallen_roads') },
  ARBRE_RACINE: { src: emblem('trait_enracinement') },
  ARBRE_COURONNE: { src: gen('ARBRE_COURONNE') },
  RAYONNEMENT_GOGOL: { src: emblem('dogma_merchant_law') },
  MERVEILLE_PREMIERE: { src: ui('glyphs/merveille') },
  MERVEILLES_TOUTES: { src: gen('MERVEILLES_TOUTES') },
  // Le maître porte 4 pixels égarés dans le coin bas-droit, loin du socle : effacés.
  MERVEILLE_RANG_V: { src: emblem('foundation_ghosts'), erase: [57, 56, 63, 63] },
  CITE_BAPTISEE: { src: emblem('fetes_jalon') },
  // ── Les sceaux
  SCEAU_I: { src: emblem('veilleurs_nuit_4') },
  SCEAU_II: { src: emblem('dogma_public_works') },
  SCEAU_III: { src: emblem('autel_du_culte') },
  SCEAU_IV: { src: emblem('dogma_free_academies') },
  SCEAU_V: { src: gen('SCEAU_V') },
  SCEAU_VI: { src: emblem('chambres_scellees') },
  SCEAU_VII: { src: ui('icarus/icarus') },
  SCEAU_VIII: { src: emblem('dogma_reliquaire_scelle') },
  SCEAU_IX: { src: emblem('racine_mere') },
  SCEAU_X: { src: ui('myths/latente') },
  SCEAU_XI: { src: emblem('loi_des_temoins') },
  SCEAUX_TOUS: { src: gen('SCEAUX_TOUS') },
  // ── Les Mythes
  MYTHE_CHAOS: { src: gen('MYTHE_CHAOS') },
  MYTHE_PROMETHEE: { src: gen('MYTHE_PROMETHEE') },
  MYTHE_ENEE: { src: ui('myths/enee') },
  MYTHE_CADMOS: { src: gen('MYTHE_CADMOS') },
  MYTHE_HEPHAISTOS: { src: ui('myths/hephaistos') },
  MYTHE_SISYPHE: { src: ui('myths/sisyphe') },
  MYTHE_BABEL: { src: ui('myths/babel') },
  MYTHE_AGE_OR: { src: ui('myths/age-or') },
  MYTHE_ATLAS: { src: gen('MYTHE_ATLAS') },
  MYTHE_ICARE: { src: ui('myths/icare') },
  MYTHE_PHENIX: { src: ui('myths/phenix') },
  MYTHE_ATRIDES: { src: ui('myths/atrides') },
  MYTHE_ANTEE: { src: gen('MYTHE_ANTEE') },
  MYTHE_RAGNAROK: { src: gen('MYTHE_RAGNAROK') },
  CIEL_TOMBE: { src: gen('CIEL_TOMBE') },
  // ── La Maison des Plaisirs
  // Les quatre faces des osselets (augures/bones, le dessin de Raph) : quatre faces
  // différentes pour le coup de Vénus, quatre « 1 » pour le coup du Chien.
  OSSELETS_VENUS: { pieces: [['augures/bones/die-1', 0, 0], ['augures/bones/die-3', 32, 0], ['augures/bones/die-4', 0, 32], ['augures/bones/die-6', 32, 32]] },
  OSSELETS_CHIEN: { pieces: [['augures/bones/die-1', 0, 0], ['augures/bones/die-1', 32, 0], ['augures/bones/die-1', 0, 32], ['augures/bones/die-1', 32, 32]] },
  ICARE_X10: { src: gen('ICARE_X10') },
  GRATTEUX_SOLEIL: { src: gen('GRATTEUX_SOLEIL') },
  VINGTETUN_NATUREL: { pieces: [['cards/A-spades', 8, 6], ['cards/K-hearts', 24, 10]] },
  VINGTETUN_SERIE: { pieces: [['cards/10-hearts', 0, 12], ['cards/J-hearts', 8, 10], ['cards/Q-hearts', 16, 8], ['cards/K-hearts', 24, 6], ['cards/A-hearts', 32, 4]] },
  VIDEUR: { src: gen('VIDEUR') },
  MACHINE_HOLD: { src: gen('MACHINE_HOLD') },
  MACHINE_JACKPOT: { src: ui('buildings/mint_houses') },
  DUEL_GAGNE: { src: ui('plaisirs/mises/osselets-interdit') },
  COURSE_OUTSIDER: { src: ui('buildings/think_tanks') },
  ROUE_MAISON: { src: gen('ROUE_MAISON') },
  NUIT_GRAND_JEU: { src: emblem('veilleurs_nuit_1') },
  MAISON_FAMILIER: { src: gen('MAISON_FAMILIER') },
  // L'amphore de la Faveur (16×29), la monnaie de la Maison : ×2.
  MAISON_MECENE: { src: ui('faveur/amphore'), scale: 2 },
  MAISON_PRINCE: { src: gen('MAISON_PRINCE') },
  // ── Les faits divers
  FD_PREMIER: { src: ui('buildings/storytellers') },
  FD_HISTOIRE: { src: emblem('encre_indelebile') },
  FD_TOUTES: { src: ui('buildings/printing_houses') },
  FD_CURIOSITES: { src: ui('buildings/observatories') },
  FD_AMOUREUX: { src: gen('FD_AMOUREUX') },
  // ── La Chronique
  TEMPS_UNE_HEURE: { src: emblem('chronicle_engine') },
  TEMPS_DIX_HEURES: { src: ui('buildings/scribes') },
  TEMPS_CENT_HEURES: { src: emblem('grammaire_des_ruines') }
};

const read = (rel) => PNG.sync.read(fs.readFileSync(path.join(ROOT, rel)));
const blank = () => new PNG({ width: SIZE, height: SIZE, fill: true });

// Boîte des pixels opaques (alpha > 8, comme scripts/lib/iconBake.cjs).
function bbox(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[((img.width * y + x) << 2) + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Pose `img` (la zone `box`) agrandie ×k au plus proche voisin, coin en (dx, dy).
// Composition « source-over » : une carte posée après recouvre la précédente.
function blit(out, img, box, k, dx, dy) {
  for (let y = 0; y < box.h * k; y++) for (let x = 0; x < box.w * k; x++) {
    const tx = dx + x, ty = dy + y;
    if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) throw new Error('débordement du cadre 64×64');
    const s = ((img.width * (box.y + Math.floor(y / k)) + box.x + Math.floor(x / k)) << 2);
    const a = img.data[s + 3];
    if (a === 0) continue;
    const o = ((SIZE * ty + tx) << 2);
    const fa = a / 255, ba = out.data[o + 3] / 255, oa = fa + ba * (1 - fa);
    for (let c = 0; c < 3; c++) out.data[o + c] = Math.round((img.data[s + c] * fa + out.data[o + c] * ba * (1 - fa)) / oa);
    out.data[o + 3] = Math.round(oa * 255);
  }
}

// `erase` : [x0, y0, x1, y1] (bornes comprises) remis à transparent après la pose.
function bakeOne(id, spec) {
  const out = compose(id, spec);
  if (spec.erase) {
    const [x0, y0, x1, y1] = spec.erase;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.data.fill(0, (SIZE * y + x) << 2, ((SIZE * y + x) << 2) + 4);
  }
  return out;
}

function compose(id, spec) {
  const out = blank();
  if (spec.pieces) {
    for (const [piece, x, y] of spec.pieces) {
      const img = read(ui(piece));
      blit(out, img, { x: 0, y: 0, w: img.width, h: img.height }, 1, x, y);
    }
    return out;
  }
  const img = read(spec.src);
  // Agrandissement entier demandé : la boîte opaque ×scale, recentrée.
  if (spec.scale) {
    const box = bbox(img);
    if (!box) throw new Error(`${id} : source vide (${spec.src})`);
    blit(out, img, box, spec.scale, Math.floor((SIZE - box.w * spec.scale) / 2), Math.floor((SIZE - box.h * spec.scale) / 2));
    return out;
  }
  // 64×64 : recopié tel quel (le cadrage du maître est voulu).
  if (img.width === SIZE && img.height === SIZE) {
    blit(out, img, { x: 0, y: 0, w: SIZE, h: SIZE }, 1, 0, 0);
    return out;
  }
  // Icône carrée de 32 px ou moins (boutique) : tout le canevas, ×entier.
  if (img.width === img.height && img.width <= SIZE / 2) {
    const k = Math.floor(SIZE / img.width);
    const off = Math.floor((SIZE - img.width * k) / 2);
    blit(out, img, { x: 0, y: 0, w: img.width, h: img.height }, k, off, off);
    return out;
  }
  // Sinon : la boîte opaque, 1:1, recentrée.
  const box = bbox(img);
  if (!box) throw new Error(`${id} : source vide (${spec.src})`);
  if (box.w > SIZE || box.h > SIZE) throw new Error(`${id} : ${box.w}×${box.h} après rognage, plus grand que ${SIZE} — à redessiner, pas à réduire`);
  blit(out, img, box, 1, Math.floor((SIZE - box.w) / 2), Math.floor((SIZE - box.h) / 2));
  return out;
}

// Version « verrouillée » : luminance (Rec. 601), contraste resserré et assombrie,
// sur la même silhouette (alpha inchangé).
function grayOf(img) {
  const out = blank();
  for (let i = 0; i < img.data.length; i += 4) {
    const l = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    const v = Math.round(18 + l * 0.55);
    out.data[i] = v; out.data[i + 1] = v; out.data[i + 2] = v;
    out.data[i + 3] = img.data[i + 3];
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [id, spec] of Object.entries(SOURCES)) {
  const icon = bakeOne(id, spec);
  fs.writeFileSync(path.join(OUT, `${id}.png`), PNG.sync.write(icon));
  fs.writeFileSync(path.join(OUT, `${id}-gris.png`), PNG.sync.write(grayOf(icon)));
  n++;
}
console.log(`${n} succès → ${n * 2} icônes dans public/pixelart/ui/achievements/`);
