// buildPalette.mjs — SOURCE DE VÉRITÉ de la palette pixel-art du jeu.
//   Émet :
//     public/pixelart/master-palette.json   (la « liste » consommée par le code + remapPalette.mjs)
//     public/pixelart/master-palette.gpl     (palette GIMP/Aseprite/Lospec — importable comme Target Palette PixelLab)
//     public/pixelart/palettes/epoch-<id>.png (color_image = palette forcée à passer à l'API pixflux/bitforge)
//     public/pixelart/palettes/_contact.png   (planche-contact visuelle de contrôle)
//
//   Lancer : node scripts/buildPalette.mjs
//
//   PRINCIPE — UNE palette maître pour tout le jeu :
//     • un CŒUR neutre (~36 teintes) PARTAGÉ par TOUS les sprites, toutes époques —
//       c'est lui qui garantit la cohésion (bois/pierre/peau/feuillage/métal/eau identiques partout) ;
//     • un ACCENT par ÉPOQUE (3 pas : deep/mid/bright) calculé depuis les ancres HSL de
//       src/game/data/eraThemes.js → le sprite, le chrome UI et le sol de carte parlent la même couleur ;
//     • palette UTILISABLE d'une époque = cœur (36) + accent (3) = 39 teintes (≤ 48).
//       Cible APRÈS remap : 16-24 teintes par sprite (cf. remapPalette.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const PUB = path.join(ROOT, 'public', 'pixelart');
const PAL_DIR = path.join(PUB, 'palettes');

/* ---- utilitaires couleur ------------------------------------------------- */
// Identique à eraThemes.js (cohérence stricte avec le chrome/sol).
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');

/* ---- CŒUR partagé (36) — ancré sur les teintes RÉELLEMENT dominantes ------ */
// (mesurées sur les sprites existants : voir l'audit de bloat). Rampes nommées,
// du plus sombre au plus clair. Tout sprite, quelle que soit l'époque, n'utilise
// que ces teintes + l'accent de son époque.
const CORE = {
  // Noirs / ombres (chaud ET froid) — contours + occlusion. 4
  inkShadow:   [['#0d0b0c', 'ink'], ['#211a1d', 'umbra'], ['#2a1c16', 'bistre'], ['#3a3534', 'ash']],
  // Bois & argile — le matériau dominant du jeu. 5
  timberClay:  [['#4a2f22', 'wood-deep'], ['#6b4530', 'wood-dark'], ['#8a5a3d', 'wood'], ['#a8704a', 'wood-lit'], ['#c98f5c', 'clay-lit']],
  // Terre & pierre — neutres grège. 5
  earthStone:  [['#4d4338', 'earth-dark'], ['#6f6354', 'earth'], ['#8f8475', 'stone'], ['#b4a890', 'stone-lit'], ['#d8cdb4', 'stone-pale']],
  // Argile / terre cuite / cuivre — la chaleur « brûlée » de la DA (remplace l'ancien or/sable jaune). 4
  clayCopper:  [['#8a4c33', 'clay-deep'], ['#b06a48', 'copper'], ['#cf9068', 'copper-lit'], ['#ecc6a8', 'clay-pale']],
  // Peau (agents). 3
  skin:        [['#7a4a39', 'skin-shadow'], ['#c98a68', 'skin'], ['#f2c2a3', 'skin-lit']],
  // Feuillage / cultures vertes / parcs. 4
  foliage:     [['#243a22', 'leaf-deep'], ['#3c5a2c', 'leaf-dark'], ['#5c7d38', 'leaf'], ['#8aa24a', 'leaf-lit']],
  // Eau / fleuve / port. 3
  water:       [['#1f3a44', 'water-deep'], ['#356b78', 'water'], ['#6fb0b8', 'water-lit']],
  // Métal / fer / ardoise (outils, industrie, toits). 4
  metalSlate:  [['#2c2f36', 'iron-dark'], ['#4f545e', 'iron'], ['#7c828c', 'steel'], ['#aab0b8', 'steel-lit']],
  // Os / blanc cassé / éclat. 2
  boneWhite:   [['#e9e4d6', 'bone'], ['#fbfaf4', 'white']],
  // Universels : base de nuit froide + terre cuite chaude (toits, bannières, danger). 2
  universal:   [['#15161f', 'night-base'], ['#8c3b2a', 'terracotta']]
};
const CORE_FLAT = Object.values(CORE).flat(); // [[hex,name], ...] 36

/* ---- Accents par ÉPOQUE — miroir des ancres HSL de eraThemes.EPOCHS ------- */
// ⚠ Si tu modifies une teinte d'époque dans eraThemes.js, reporte-la ici (couplage assumé).
const EPOCHS = [
  { band: 0, id: 'feu',       label: 'Âge du Feu',        hsl: [24, 62, 55] },
  { band: 1, id: 'bois',      label: 'Âge du Bois',       hsl: [18, 52, 50] },
  { band: 2, id: 'pierre',    label: 'Âge de la Pierre',  hsl: [14, 46, 55] },
  { band: 3, id: 'couronne',  label: 'Âge de la Couronne',hsl: [292, 22, 66] },
  { band: 4, id: 'marbre',    label: 'Âge du Marbre',     hsl: [214, 55, 64] },
  { band: 5, id: 'fonte',     label: 'Âge de la Fonte',   hsl: [17, 48, 58] },
  { band: 6, id: 'neon',      label: 'Âge du Néon',       hsl: [185, 64, 58] },
  { band: 7, id: 'noosphere', label: 'Âge de la Noosphère',hsl: [155, 68, 52] },
  { band: 8, id: 'stellaire', label: 'Âge stellaire',     hsl: [42, 80, 58] },
  { band: 9, id: 'demiurge',  label: 'Âge du Démiurge',   hsl: [282, 30, 76] }
];

function accentRamp([h, s, l]) {
  const deep   = hslToRgb(h, Math.min(100, s + 10), Math.max(15, l - 28));
  const mid    = hslToRgb(h, s, l);
  const bright = hslToRgb(h, Math.max(18, s - 8), Math.min(90, l + 24));
  return { deep: hex(deep), mid: hex(mid), bright: hex(bright) };
}

/* ---- Tags : sprite -> époque (cohérence intra-époque, cf. remapPalette) --- */
// L'art ACTUEL des bâtiments-moteur est de stade 0 (Néolithique / Âge de pierre)
// → bande 0-1. Pour un futur stade 2 (bourg) on taggerait « pierre », etc.
// band -> id (mapping eraThemes) pour générer un tag par défaut quand absent.
const BAND_TO_EPOCH = Object.fromEntries(EPOCHS.map((e) => [e.band, e.id]));
const SPRITE_EPOCH_TAGS = {
  // Bâtiments / props de scène (la demande explicite : tagger chaque bâtiment)
  'forager-prop-tree': 'feu', 'forager-prop-basket': 'feu',
  'market-prop-stall': 'feu', 'guild-prop-lodge': 'feu',
  'granary-prop-silo': 'bois', 'caravan-prop-sacks': 'bois',
  'field-prop-crop-green': 'bois', 'field-prop-crop-gold': 'bois', 'field-prop-fallow': 'bois',
  'mill-prop-house': 'bois', 'mill-prop-wheel': 'bois',
  'port-prop-house': 'bois', 'port-prop-pontoon': 'bois',
  'mint-prop-house': 'pierre', 'mint-prop-forge': 'feu', 'exchange-prop-stall': 'feu',
  'storyteller-prop-fire': 'feu', 'storyteller-fire': 'feu', 'storyteller-reader': 'feu', 'storyteller-back': 'feu',
  'scribes-prop-hall': 'feu', 'schools-prop-yard': 'feu', 'academies-prop-yard': 'feu',
  'ancestralcult-back': 'feu', 'ancestralcult-fire': 'feu', 'ancestralcult-prop': 'feu',
  'observatories-prop-dial': 'feu', 'libraries-prop-archive': 'feu', 'universities-prop-hall': 'feu',
  'printing-prop-workshop': 'feu', 'think-prop-council': 'feu',
  'aqueduct-outlet': 'feu', 'aqueduct-seg': 'feu', 'aqueduct-intake': 'feu',
  'aqueduct-water-outlet': 'feu', 'aqueduct-water-seg': 'feu', 'aqueduct-water-intake': 'feu',
  'watch-back': 'feu', 'watch-fire': 'feu', 'watch-prop': 'feu',
  // Agents (bonus — même cohérence par époque)
  'caveman': 'feu', 'cavewoman': 'feu', 'cavechild': 'feu', 'forager': 'feu',
  'villager': 'bois', 'villagerwoman': 'bois', 'villagerchild': 'bois', 'farmer': 'bois', 'ox': 'bois', 'horse': 'bois',
  'greekman': 'marbre', 'greekwoman': 'marbre', 'greekchild': 'marbre',
  'industrialman': 'fonte', 'industrialwoman': 'fonte', 'industrialchild': 'fonte',
  'futureman': 'neon', 'futurewoman': 'neon', 'futurechild': 'neon',
  // Bateaux
  'boat-raft': 'feu', 'boat-sail': 'pierre', 'boat-steam': 'fonte', 'boat-container': 'neon',
  'boat-cosmic-7': 'noosphere', 'boat-cosmic-8': 'stellaire', 'boat-cosmic-9': 'demiurge'
};

/* ---- Construction de l'objet palette -------------------------------------- */
const epochs = EPOCHS.map((e) => {
  const accent = accentRamp(e.hsl);
  const usable = [...CORE_FLAT.map(([h]) => h), accent.deep, accent.mid, accent.bright];
  return { band: e.band, id: e.id, label: e.label, srcHsl: e.hsl, accent, usable };
});

const palette = {
  meta: {
    generatedBy: 'scripts/buildPalette.mjs',
    coupledTo: 'src/game/data/eraThemes.js (EPOCHS hsl)',
    coreCount: CORE_FLAT.length,
    perSpriteTarget: [16, 24],
    note: 'UNE palette : cœur partagé (cohésion) + accent par époque (calculé depuis eraThemes). ' +
          'Cible 16-24 teintes/sprite via scripts/remapPalette.mjs.'
  },
  core: Object.fromEntries(Object.entries(CORE).map(([k, v]) => [k, v.map(([h, name]) => ({ hex: h, name }))])),
  coreFlat: CORE_FLAT.map(([h]) => h),
  bandToEpoch: BAND_TO_EPOCH,
  spriteEpochTags: SPRITE_EPOCH_TAGS,
  epochs
};

/* ---- Écritures ------------------------------------------------------------ */
fs.mkdirSync(PAL_DIR, { recursive: true });
fs.writeFileSync(path.join(PUB, 'master-palette.json'), JSON.stringify(palette, null, 2));

// .gpl (GIMP/Aseprite/Lospec)
const gplLines = ['GIMP Palette', 'Name: Civilisation Idle — Master', 'Columns: 8', '#'];
const toGpl = (h, name) => {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${name}`;
};
CORE_FLAT.forEach(([h, name]) => gplLines.push(toGpl(h, name)));
epochs.forEach((e) => {
  gplLines.push(toGpl(e.accent.deep, `${e.id}-deep`));
  gplLines.push(toGpl(e.accent.mid, `${e.id}-mid`));
  gplLines.push(toGpl(e.accent.bright, `${e.id}-bright`));
});
fs.writeFileSync(path.join(PUB, 'master-palette.gpl'), gplLines.join('\n') + '\n');

// color_image par époque : une rangée de pixels = la palette forcée à passer à l'API.
const writeStrip = (file, hexes, h = 8) => {
  const w = hexes.length;
  const png = new PNG({ width: w, height: h });
  for (let x = 0; x < w; x++) {
    const r = parseInt(hexes[x].slice(1, 3), 16), g = parseInt(hexes[x].slice(3, 5), 16), b = parseInt(hexes[x].slice(5, 7), 16);
    for (let y = 0; y < h; y++) { const i = (y * w + x) * 4; png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255; }
  }
  fs.writeFileSync(file, PNG.sync.write(png));
};
epochs.forEach((e) => writeStrip(path.join(PAL_DIR, `epoch-${e.id}.png`), e.usable));
writeStrip(path.join(PAL_DIR, 'core.png'), palette.coreFlat);

// Planche-contact visuelle (cœur en rampes + accents par époque) pour contrôle à l'œil.
(function contact() {
  const SW = 22, GAP = 2, PAD = 8;
  const ramps = Object.values(CORE).map((v) => v.map(([h]) => h));
  const accentRows = epochs.map((e) => [e.accent.deep, e.accent.mid, e.accent.bright]);
  const rows = [...ramps, [], ...accentRows];
  const maxCols = Math.max(...rows.map((r) => r.length || 1));
  const W = PAD * 2 + maxCols * (SW + GAP);
  const H = PAD * 2 + rows.length * (SW + GAP);
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 18; png.data[i + 1] = 16; png.data[i + 2] = 20; png.data[i + 3] = 255; }
  rows.forEach((row, ry) => row.forEach((h, cx) => {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    const x0 = PAD + cx * (SW + GAP), y0 = PAD + ry * (SW + GAP);
    for (let y = 0; y < SW; y++) for (let x = 0; x < SW; x++) {
      const i = ((y0 + y) * W + (x0 + x)) * 4; png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }));
  fs.writeFileSync(path.join(PAL_DIR, '_contact.png'), PNG.sync.write(png));
})();

const totalDistinct = new Set([...palette.coreFlat, ...epochs.flatMap((e) => [e.accent.deep, e.accent.mid, e.accent.bright])]).size;
console.log(`Cœur : ${CORE_FLAT.length} teintes · ${epochs.length} époques × 3 accents`);
console.log(`Total palette maître distincte : ${totalDistinct} teintes`);
console.log('Écrit : master-palette.json, master-palette.gpl, palettes/epoch-*.png, palettes/core.png, palettes/_contact.png');
epochs.forEach((e) => console.log(`  ${String(e.band).padStart(1)} ${e.id.padEnd(10)} accent ${e.accent.deep} ${e.accent.mid} ${e.accent.bright}  (usable ${e.usable.length})`));
