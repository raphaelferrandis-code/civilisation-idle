"use strict";
// ── LA MATIÈRE DES MERVEILLES, PAR ÈRE (docs/PLAN-MERVEILLES.md §4) ──────────
//
// Décision de Raph (2026-10-01) : une merveille grandit avec son RANG et prend la
// MATIÈRE DE L'ÈRE où en est la ville. Une seule main : la pierre est celle des
// quais et du pont de la même ère (bridgeKits.js) — on la reprend telle quelle,
// on n'y ajoute que ce qu'un monument porte en plus : un métal d'apparat, une
// couverture de toit, du verre, une lueur.
//
// Rampe `stone` : 0 reflet · 1 dessus · 2 face éclairée · 3 mi-teinte · 4 face à
// l'ombre · 5 ombre · 6 ombre profonde · 7 joint · 8 encre (cf. bridgeKits).
import { bridgeKitForBand } from './bridgeKits.js';

// Métal d'apparat (clés, statues, épis, pointes) : bronze aux âges anciens, or au
// marbre, laiton à la fonte, acier poli puis lumière.
const METAL = [
  ['#c89a5a', '#9a6e3a', '#6a4a24'],        // 0 feu — cuivre martelé
  ['#c89a5a', '#9a6e3a', '#6a4a24'],        // 1 bois
  ['#c9a35e', '#9d7a3c', '#6c5226'],        // 2 pierre — bronze
  ['#d8b265', '#a57a3a', '#6d4c25'],        // 3 couronne — or terni
  ['#f0cf6a', '#d2a53e', '#9c7524'],        // 4 marbre — or
  ['#f0cf6a', '#d2a53e', '#9c7524'],        // 5 fonte — or et laiton
  ['#e6ebf0', '#b4bcc6', '#7f8892'],        // 6 néon — acier poli
  ['#cff7e6', '#7fdcb8', '#3f8f72'],        // 7 noosphère — jade lumineux
  ['#ffe9b0', '#ffcd78', '#b8873a'],        // 8 stellaire — or de lumière
  ['#e6dcff', '#aa8cff', '#6a52b8'],        // 9 démiurge — améthyste
];
// Couverture des toits : chaume, tuiles, ardoise, cuivre vert-de-gris, verre.
const ROOF = [
  ['#cfa95e', '#a8823f', '#7c5b2a', '#523a1a'],   // chaume
  ['#cfa95e', '#a8823f', '#7c5b2a', '#523a1a'],
  ['#c56a45', '#a3502f', '#7c3a22', '#552616'],   // tuiles
  ['#6a7182', '#525867', '#3b404c', '#282b33'],   // ardoise
  ['#c56a45', '#a3502f', '#7c3a22', '#552616'],   // tuiles romaines
  ['#79b3a0', '#5a8f7e', '#40695c', '#2b4840'],   // cuivre vert-de-gris
  ['#a9c6dc', '#7fa2bf', '#56778f', '#3a5163'],   // verre
  ['#cfeadf', '#a2cbbb', '#76a291', '#4c7566'],   // noosphère : jade poli
  ['#f2e3c4', '#d8c090', '#ae9462', '#7b6741'],   // stellaire : laiton clair
  ['#ddd6f2', '#b6aadf', '#8b7dbd', '#605591'],   // démiurge : améthyste pâle
];
// Lueur (vitraux de nuit, lanternes, cœur de l'Œil) : feu chaud jusqu'au marbre,
// gaz, électricité, puis la couleur de l'ère cosmique (celle de ses quais).
const GLOW = ['#ffb35c', '#ffb35c', '#ffbf6a', '#ffbf6a', '#ffc978', '#ffd28c', '#8fdcff', '#5af0b4', '#ffcd78', '#aa8cff'];

// Verre (lanternes, lentilles, verrières) : du clair au sombre.
const GLASS = [
  ['#e8eef2', '#b9cad6', '#7d93a6', '#4a5d70'],
  ['#e8eef2', '#b9cad6', '#7d93a6', '#4a5d70'],
  ['#e8eef2', '#b9cad6', '#7d93a6', '#4a5d70'],
  ['#e4ecf2', '#a9bfd2', '#6c86a0', '#3e526a'],
  ['#e8f0f4', '#b4cadb', '#7898b2', '#47627c'],
  ['#e0ecf2', '#a6c2d4', '#6a8ca6', '#3b5670'],
  ['#e4f6ff', '#9fd8f4', '#5aa6cf', '#2f6a92'],
  ['#e0fff2', '#9ff0d0', '#4fc09a', '#22735a'],
  ['#fff4dc', '#ffdc9a', '#d8a456', '#8a6428'],
  ['#f0eaff', '#c8b4ff', '#8e70e0', '#55409a'],
];
// Gazon des tertres et des parterres (une rampe, la lumière choisit le cran).
const TURF = ['#a6bf70', '#8ca85e', '#71904b', '#5b7741', '#475e34'];
// Fenêtres : vitre sombre, côté soleil puis côté ombre.
const WIN = ['#3c4556', '#2b3240'];
// MATIÈRE DES MURS par ère — ce qui fait qu'on reconnaît l'âge d'un monument au
// premier coup d'œil, bien plus que la teinte :
//   rough  moellons irréguliers (feu, bois)       ashlar  pierre de taille
//   brick  brique et chaînages de pierre (fonte)  panel   béton en panneaux (néon)
//   tech   panneaux lisses à filets lumineux (cosmiques)
const WALL = ['rough', 'rough', 'ashlar', 'ashlar', 'ashlar', 'brick', 'panel', 'tech', 'tech', 'tech'];
// Brique de l'âge industriel (9 crans, comme la pierre).
const BRICK = ['#e4ae8c', '#cf9070', '#b87658', '#9e6046', '#844d37', '#6b3d2b', '#552f21', '#3f2218', '#2a160f'];
// Vitres : sombres aux âges anciens, verre qui reflète (fonte, néon), verre
// teinté de la lumière de l'ère (cosmiques).
const WINSTYLE = ['dark', 'dark', 'dark', 'dark', 'dark', 'glass', 'glass', 'glow', 'glow', 'glow'];
// Lumière des fenêtres la nuit : chandelle, gaz, électricité, lumière de l'ère.
const NIGHT = ['#ffb860', '#ffb860', '#ffbf6a', '#ffc472', '#ffca7c', '#ffd690', '#d6ecff', '#8ff5cf', '#ffd99a', '#c9b4ff'];
// Bannières des âges qui n'en ont pas dans le kit du pont.
const BANNER = ['#b2382d', '#7e2620', '#e2b444'];

// Âges cosmiques : la même pierre blanche pour les trois chez le pont ; un monument
// la teinte de la lumière de son ère (jade, or, améthyste) pour qu'on les distingue.
function tintRamp(ramp, hex, k) {
  const t = parseInt(hex.slice(1), 16), tr = (t >> 16) & 255, tg = (t >> 8) & 255, tb = t & 255;
  return ramp.map((c) => {
    const n = parseInt(c.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = (a, z) => Math.round(a + (z - a) * k).toString(16).padStart(2, '0');
    return '#' + m(r, tr * r / 255) + m(g, tg * g / 255) + m(b, tb * b / 255);
  });
}

const _cache = new Map();
// `winter` : la neige tient sur les dessus, les toits au soleil et les gazons.
export function wonderKitForBand(band, winter = false) {
  const b = Math.max(0, Math.min(9, band | 0));
  const key = b + (winter ? ':w' : '');
  let k = _cache.get(key);
  if (k) return k;
  const B = bridgeKitForBand(b);
  k = {
    band: b, snow: !!winter,
    pal: {
      stone: b >= 7 ? tintRamp(B.pal.stone, GLOW[b], 0.12) : B.pal.stone,
      marble: B.pal.marble || [B.pal.stone[0], B.pal.stone[1], B.pal.stone[3]],
      wet: B.pal.wet,
      wood: B.pal.wood || ['#a47a4c', '#86613a', '#6b4b2b', '#4a321c'],
      metal: METAL[b],
      roof: ROOF[b],
      glow: GLOW[b],
      glass: B.pal.glass || '#a9bfd6',
      glassRamp: GLASS[b], turf: TURF, win: WIN,
      banner: B.pal.banner || BANNER,
      brick: BRICK, night: NIGHT[b],
    },
    wall: WALL[b], winStyle: WINSTYLE[b],
    // Un monument tranche plus que le pont : sa face à l'ombre descend d'un cran.
    litBase: B.litBase || 2, shadeBase: Math.min(6, (B.shadeBase || 4) + 1),
    course: B.course || 5, block: B.block || 12, joint: B.joint != null ? B.joint : 2, rough: !!B.rough,
    // Ce qu'une ère sait bâtir : la grue de la cathédrale, la lanterne du phare.
    crane: b <= 3 ? 'roue' : b <= 5 ? 'vapeur' : b <= 6 ? 'tour' : 'lumiere',
    lantern: b <= 4 ? 'feu' : b <= 5 ? 'gaz' : 'lampe',
    // Planche des statues et braseros (art des places, plaza/<objet>-<ère>).
    propEra: b <= 2 || b === 4 ? 'antique' : b === 3 ? 'medieval' : b === 5 ? 'industrial' : b === 6 ? 'modern' : 'cosmic',
    // Statue d'une merveille : toujours une FIGURE (la planche moderne est une arche
    // abstraite, la cosmique un cristal — absurdes au sommet d'une colonne) ; le
    // métal de l'ère la teinte (or, chrome, lumière).
    statueEra: b <= 2 || b === 4 ? 'antique' : b === 3 ? 'medieval' : 'industrial',
  };
  _cache.set(key, k);
  return k;
}
