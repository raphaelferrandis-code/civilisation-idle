"use strict";

// LES FAITS DIVERS — les décors, pixel par pixel (docs/PLAN-FAITS-DIVERS.md).
//
// Même main que la petite vie (iso/vieArt.js) : de très petits objets — un feu de
// camp, un menhir, un tonneau — dessinés ICI, un caractère par pixel, à leur taille
// d'affichage. Un pixel d'art = le grain des maisons (vieK : 1,135 px au zoom 1),
// agrandi par un facteur ENTIER au blit. À cette échelle un habitant fait ~10 pixels
// de haut : un tonneau en fait 6, un menhir 7.
//
// Charte du vivant (PLAN-VIVANT §3) : aplats francs, contour sombre d'un pixel. La
// couleur vive reste rare — ce sont des éléments de la ville, discrets (décision de
// Raph) : on les remarque parce qu'ils ne sont pas à leur place, pas parce qu'ils
// brillent.
//
// ⚠ MODULE PUR : aucun import, aucun DOM. Convention : '.' = transparent, toute
// autre lettre = une couleur de FD_PAL. `foot` = rangée posée au sol.

export const FD_PAL = {
  k: [34, 26, 22],                       // contour
  // feu
  y: [255, 226, 120], o: [247, 150, 46], r: [214, 62, 30], R: [140, 28, 16],
  b: [112, 76, 46], B: [70, 46, 28],     // bûches
  s: [150, 144, 136], S: [98, 94, 90],   // pierres du foyer
  // pierre levée
  g: [158, 154, 146], G: [112, 108, 102], m: [104, 128, 76],   // m : mousse
  // marbre
  w: [236, 230, 214], W: [196, 188, 170],
  // fonte
  i: [66, 68, 76], I: [128, 132, 140],
  // néon
  n: [255, 64, 92], N: [255, 214, 222], p: [70, 70, 78],
  // bois clair (boîte, piquets)
  t: [168, 122, 72], T: [120, 84, 50],
  // terre cuite (la jarre de Diogène)
  c: [196, 112, 64], C: [146, 74, 40], d: [52, 30, 22],
  // douelles et cerclages du tonneau
  h: [150, 102, 58], H: [104, 68, 38], e: [96, 98, 104],
  // le poulet plumé (rose pâle, crête rouge)
  q: [244, 196, 178], Q: [214, 150, 132],
  // la capsule (blanc de coque, hublot bleu nuit)
  v: [214, 220, 228], V: [150, 158, 170], u: [40, 66, 110], U: [110, 170, 220],
};

export const FD_ART = {
  // ── Le feu de camp : flamme sur trois images, cercle de pierres couché.
  feu: { foot: 5, frames: [[
    '...y...',
    '..yoy..',
    '..oro..',
    '.orRro.',
    'SbBbBbS',
    '.SsSsS.',
  ], [
    '..y....',
    '..oy...',
    '.yoro..',
    '.orRo..',
    'SbBbBbS',
    '.SsSsS.',
  ], [
    '....y..',
    '...yo..',
    '..orRy.',
    '.orRro.',
    'SbBbBbS',
    '.SsSsS.',
  ]] },
  // Le même, réduit à des braises (la nuit finissante, ou un feu qu'on garde).
  braises: { foot: 2, frames: [[
    '.r.o.',
    'SbRbS',
    '.SsS.',
  ], [
    '.o.r.',
    'SbRbS',
    '.SsS.',
  ]] },
  // ── Les pierres levées (deux silhouettes, la mousse au pied).
  menhir: { foot: 6, frames: [[
    '.kk.',
    'kgGk',
    'kgGk',
    'kggk',
    'kgGk',
    'kmgk',
    'kkkk',
  ]] },
  menhir2: { foot: 5, frames: [[
    '.kk..',
    'kggk.',
    'kgGGk',
    'kggGk',
    'kmgmk',
    'kkkkk',
  ]] },
  // ── Le temple des braises (âge du Marbre) : fronton, quatre colonnes, le feu
  // au fond. Pas plus grand qu'une cabane — c'est le gag.
  temple: { foot: 10, frames: [[
    '......k......',
    '....kkwkk....',
    '..kkwwwwwkk..',
    'kkkkkkkkkkkkk',
    '.kwk.kRk.kwk.',
    '.kwk.kok.kwk.',
    '.kwk.kyk.kwk.',
    '.kWk.krk.kWk.',
    'kkkkkkkkkkkkk',
    'kWWWWWWWWWWWk',
    'kkkkkkkkkkkkk',
  ], [
    '......k......',
    '....kkwkk....',
    '..kkwwwwwkk..',
    'kkkkkkkkkkkkk',
    '.kwk.kRk.kwk.',
    '.kwk.kRk.kwk.',
    '.kwk.kok.kwk.',
    '.kWk.kyk.kWk.',
    'kkkkkkkkkkkkk',
    'kWWWWWWWWWWWk',
    'kkkkkkkkkkkkk',
  ]] },
  // ── La chaudière (âge de la Fonte) : cuve rivetée, tuyau, foyer ouvert.
  chaudiere: { foot: 10, frames: [[
    '.....kk.',
    '.....kk.',
    '.....kk.',
    '.kkkkkk.',
    'kiIiiIik',
    'kiiiiiik',
    'kiIiiIik',
    'kiikkiik',
    'kiioyiik',
    'kiirRiik',
    'kkkkkkkk',
  ], [
    '.....kk.',
    '.....kk.',
    '.....kk.',
    '.kkkkkk.',
    'kiIiiIik',
    'kiiiiiik',
    'kiIiiIik',
    'kiikkiik',
    'kiiyoiik',
    'kiiRriik',
    'kkkkkkkk',
  ]] },
  // ── L'enseigne (âge du Néon) : une flamme de néon sur son mât. La seconde
  // image est le tube éteint (le faux contact qui « parle »).
  enseigne: { foot: 11, frames: [[
    '..n....',
    '.nNn...',
    '.nNNn..',
    'nNNNn..',
    'nNNNNn.',
    '.nnnn..',
    '...k...',
    '...k...',
    '...k...',
    '...k...',
    '...k...',
    '..kkk..',
  ], [
    '..p....',
    '.pkp...',
    '.pkkp..',
    'pkkkp..',
    'pkkkkp.',
    '.pppp..',
    '...k...',
    '...k...',
    '...k...',
    '...k...',
    '...k...',
    '..kkk..',
  ]] },
  // ── La boîte où dort une braise du premier feu (âge stellaire).
  boite: { foot: 2, frames: [[
    'kkkk',
    'ktok',
    'kTTk',
  ]] },

  // ── DIOGÈNE ──────────────────────────────────────────────────────────────
  // Les logis de Diogène, vus PAR L'OUVERTURE (tournée vers l'œil) : image 0 = le
  // fond (la panse et l'intérieur sombre), posé AVANT lui ; image 1 = la lèvre du
  // bas, posée APRÈS — il est assis dedans, on ne voit que sa tête et ses épaules.
  // La jarre couchée (un pithos : c'était une jarre, pas un tonneau).
  jarre: { foot: 10, frames: [[
    '...kkkkkk...',
    '.kkcccccCkk.',
    'kccckkkkcCck',
    'kcckddddkcCk',
    'kckddddddkck',
    'kckddddddkck',
    'kckddddddkck',
    'kcckddddkcck',
    'kCcckkkkccCk',
    '.kkCCccCCkk.',
    '...kkkkkk...',
  ], [
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    'kcckddddkcck',
    'kCcckkkkccCk',
    '.kkCCccCCkk.',
    '...kkkkkk...',
  ]] },
  // Le tonneau couché, cerclé de fer, fond ouvert vers l'œil.
  tonneau: { foot: 10, frames: [[
    '...eeeeee...',
    '.eehhhhhHee.',
    'ehhhkkkkhHhe',
    'ehhkddddkhHe',
    'ehkddddddkhe',
    'ehkddddddkhe',
    'ehkddddddkhe',
    'ehhkddddkhhe',
    'eHhhkkkkhhHe',
    '.eeHHhhHHee.',
    '...eeeeee...',
  ], [
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    'ehhkddddkhhe',
    'eHhhkkkkhhHe',
    '.eeHHhhHHee.',
    '...eeeeee...',
  ]] },
  // La capsule de survie (âge stellaire), écoutille ouverte.
  capsuleLogis: { foot: 10, frames: [[
    '...kkkkkk...',
    '.kkvvvvvVkk.',
    'kvvvkkkkvVvk',
    'kvvkuuuukvVk',
    'kvkuuuuuukvk',
    'kvkuuuuuukvk',
    'kvkuuuuuukvk',
    'kvvkuuuukvvk',
    'kVvvkkkkvvVk',
    '.kkVVvvVVkk.',
    '...kkkkkk...',
  ], [
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    'kvvkuuuukvvk',
    'kVvvkkkkvvVk',
    '.kkVVvvVVkk.',
    '...kkkkkk...',
  ]] },
  // L'écuelle jetée : deux morceaux par terre.
  ecuelle: { foot: 1, frames: [[
    'kc...kc',
    'kCk..kk',
  ]] },
  // La statue à qui il tend la main : un personnage de pierre sur son socle.
  statue: { foot: 11, frames: [[
    '..kk..',
    '.kgGk.',
    '..kgk.',
    '.kggGk',
    'kgggGk',
    '.kgGk.',
    '.kgGk.',
    '.kg.k.',
    'kkkkkk',
    'kGgggk',
    'kGgggk',
    'kkkkkk',
  ]] },
  // Le poulet plumé, brandi à bout de bras.
  poulet: { foot: 3, frames: [[
    '.r..',
    'kqqk',
    'qqQq',
    '.kk.',
  ]] },
  // La lanterne allumée en plein midi.
  lanterne: { foot: 3, frames: [[
    '.k.',
    'kyk',
    'kok',
    '.k.',
  ]] },

  // ── NANCY ET WILLIAM ─────────────────────────────────────────────────────
  // L'arche fleurie du mariage : du lierre et des fleurs sur un arc de bois.
  arche: { foot: 13, frames: [[
    '...mrmymm...',
    '..mymk.kmrm.',
    '.mrk.....kym',
    '.mk.......km',
    'mrk.......kr',
    'mk.........m',
    'tk.........t',
    'mt.........m',
    'tk.........t',
    'mt.........r',
    'tk.........t',
    'mt.........m',
    'tk.........t',
    'kk.........k',
  ]] },
  // Le banc au bord de l'eau (âge quelconque : du bois et deux pieds).
  banc: { foot: 3, frames: [[
    'kkkkkkkkk',
    'kthththtk',
    'kkkkkkkkk',
    '.kT...Tk.',
  ]] },
};

// La bonne image d'une planche, ou null (nom inconnu).
export function fdArtRows(name, fi = 0) {
  const def = FD_ART[name];
  if (!def) return null;
  const n = def.frames.length;
  return def.frames[((fi % n) + n) % n];
}
