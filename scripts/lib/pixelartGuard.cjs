// Garde-fous COMMUNS des passes de palette EN LOT : scripts/quantize.cjs et
// scripts/remapPalette.mjs (--dir). Une seule liste au lieu de deux copies qui
// dérivaient : au 05/10, 166 PNG de public/pixelart (256 le 06/10) dépassaient le
// plafond de 24 teintes PAR CHOIX (fresque et emblèmes de l'Arbre des Ruines, scènes de la
// Boutique, lieux de la Cité, enseignes néon, fontaines et clôtures des places…) et
// un passage sur un dossier parent les aurait tous écrasés, en silence — la
// médiane de quantize.cjs invente des teintes, et bakeRuinsEmblems.mjs lève une
// erreur dès qu'un de ses tons disparaît (audit du 05/10, SCRIPT-9).
//
// Deux règles, appliquées par les deux scripts :
//   1. le parcours d'un dossier saute TOUJOURS (même sous --force) les
//      sous-dossiers SKIP_DIRS, les fichiers PROTECTED_FILES et les feux (SKIP_FIRE) ;
//   2. un dossier de public/pixelart (lui compris) n'est pas passé en lot sans
//      --force : c'est de l'art LIVRÉ. Dans un dossier déjà passé, tout fichier
//      au-dessus du plafond l'est PAR CHOIX — sinon il aurait été passé — et le
//      lot ne réécrirait QUE ceux-là. Un fichier neuf se passe seul ; --dry reste
//      permis, pour voir ce qu'un lot réécrirait.
// Hors de public/pixelart (un lot brut dans un dossier de travail), rien n'est
// refusé : ce n'est pas encore de l'art du jeu.
//
// CommonJS pour servir aux deux : quantize.cjs le `require`, remapPalette.mjs
// l'importe par défaut.

const fs = require('fs');
const path = require('path');

const PIXELART = path.resolve(__dirname, '..', '..', 'public', 'pixelart');

// Sous-dossiers TOUJOURS ignorés en lot :
//   _orig, _archive, palettes : sources et palettes, jamais de l'art livré ;
//   wonders  : calibrées à 32 teintes, or et pourpre signature (pipeline
//              scripts/wonders/lock-palette.cjs, retiré dans b1437a6a — il reste
//              dans l'historique git ; ou remapPalette --extra, un fichier à la fois) ;
//   ruins    : la passe OKLab de 913 sprites a rabattu les flammes de la fresque
//              et de ses emblèmes sur de la terre cuite (#ec360f → #b06a48) — le
//              cœur anti-jaune n'a pas de rampe d'incandescence ; leur pipeline
//              était scratch/install-tree.cjs (cf. scratch/fireRamp.cjs), outils
//              locaux hors dépôt (scratch/ n'est pas versionné) ;
//   ruins-tree : illustrations de l'Arbre (memoire.png, 31 teintes, lues par
//              bakeRuinsEmblems.mjs) — `ruins` ne la couvre pas : la comparaison
//              porte sur le nom EXACT du dossier ;
//   places, boutique, prestige : scènes PEINTES (bibliotheque.png 107 teintes,
//              echoppe-neuve.png 56, collapse-skyline.png 309) ;
//   ui       : icônes cuites par bakeUiIcons.cjs / bakeUiIconSizes.cjs, maîtres et
//              tailles @N vont ensemble ; bandeaux d'augures peints (200+ teintes) ;
//   anim     : bandes de fontaines découpées sur l'eau, dont les zones (anim/zone/)
//              doivent rester au pixel près (garde isoPlaza.test.js) ;
//   splash   : historique (splash-arts retirés le 04/10).
const SKIP_DIRS = ['_orig', '_archive', 'splash', 'palettes', 'wonders', 'ruins', 'ruins-tree',
  'places', 'boutique', 'prestige', 'ui', 'anim'];

// Fichiers protégés partout : la fresque peinte de l'Arbre (~1150 teintes),
// l'indexer la détruirait.
const PROTECTED_FILES = ['tree-base.png'];

// Les FEUX de la cité (bandes de flamme des scènes moteur, foyers, torches
// d'émeutier) vivent dans des dossiers qu'on repasse. La passe du 2026-07-01 les
// a rabattus sur les rampes bois/argile/PEAU (la flamme de la tour de guet
// peinte en skin-lit) ; ils ont leur rampe
// (public/pixelart/fire-ramp.json) et leur outil (scripts/reflame.mjs), et la
// garde __tests__/flameHue.test.js tombe si une passe les touche.
const SKIP_FIRE = /(-fire\.png$|-torch-|^(?:watch-prop|ancestralcult-prop|mint-prop-forge|cult-vesta)\.png$)/;

// Les PNG d'un dossier qu'une passe EN LOT peut réécrire (parcours récursif).
// `.remap.png` = sorties de remapPalette sans --inplace, jamais une entrée.
function batchPngs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.includes(e.name) ? [] : batchPngs(p);
    const low = e.name.toLowerCase();
    if (!low.endsWith('.png') || low.endsWith('.remap.png')) return [];
    if (PROTECTED_FILES.includes(low) || SKIP_FIRE.test(e.name)) return [];
    return [p];
  });
}

// Pourquoi ce dossier ne peut pas être passé en lot sans --force (null = permis).
function batchRefusal(dir) {
  const rel = path.relative(PIXELART, path.resolve(dir));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const prot = (rel ? rel.split(path.sep) : []).find((s) => SKIP_DIRS.includes(s));
  if (prot) return `${dir} est dans un dossier protégé (${prot}/) : son art dépasse le plafond PAR CHOIX.`;
  const subs = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_DIRS.includes(e.name)).map((e) => e.name);
  return `${dir} est de l'art LIVRÉ${subs.length ? `, et un dossier PARENT (${subs.join(', ')})` : ''} :`
    + ' un fichier y dépasse le plafond PAR CHOIX (sinon il aurait déjà été passé). Passer les fichiers neufs un par un.';
}

module.exports = { PIXELART, SKIP_DIRS, PROTECTED_FILES, SKIP_FIRE, batchPngs, batchRefusal };
