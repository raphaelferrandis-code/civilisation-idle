// LA PETITE VIE — les dessins, pixel par pixel (docs/PLAN-MAQUETTE-VIVANTE.md §9).
//
// Oiseaux, canards, héron, poissons, feuilles : des bêtes de 2 à 10 pixels. À
// cette taille une IA ne dessine rien de lisible, et réduire un dessin fait pour
// une autre taille donne une tache (leçon G1a, PLAN-GRILLE-PIXELS). Ils sont donc
// dessinés ICI, à la main, un caractère par pixel, à leur taille d'affichage : un
// pixel d'art = un pixel d'écran au zoom 1 (le rendu les agrandit par un facteur
// ENTIER, jamais par rotation — cf. isoVie.js).
//
// ÉCHELLE : l'habitant fait ~10 px de haut au zoom 1 (sceneHumanInkH). Les bêtes
// sont un peu plus grandes que nature (×1,3 à ×1,6) pour rester lisibles — comme
// le bétail de critters.js — mais jamais plus grandes qu'un homme : un canard fait
// 6 px, un héron debout 9, un pigeon 5.
//
// ⚠ MODULE PUR : aucun DOM, et pour seul import le hachage partagé (../hash.js,
// une feuille pure lui aussi). Il est lu par le jeu (qui cuit les planches en
// canvas) ET par scripts/vieBoard.mjs (planche de contrôle en PNG).
//
// Convention : '.' = transparent ; toute autre lettre = une couleur de VIE_PAL.
// Les dessins regardent vers la DROITE ; la gauche est leur miroir.
import { hash01Lowbias as hash01 } from '../hash.js';

// ── PALETTE ─────────────────────────────────────────────────────────────────
// Couleurs de la vie : c'est là que la carte a droit à la couleur vive (règle
// « calme en grand, riche en petit »), mais en petites touches — une tête de
// colvert, un bec, un ventre de poisson.
const VIE_PAL = {
  // ombre sous l'eau (l'opacité se règle au blit)
  K: [14, 28, 36],
  // poisson qui saute
  d: [70, 92, 100], b: [150, 168, 170], w: [226, 236, 232],
  // colvert mâle
  G: [38, 84, 56], g: [70, 128, 80], y: [226, 180, 58], W: [238, 238, 230],
  c: [126, 78, 52], B: [150, 146, 136], D: [92, 84, 76], t: [44, 44, 48],
  // cane et canetons
  f: [158, 122, 84], F: [106, 80, 56], l: [210, 184, 100], L: [142, 114, 64],
  // cygne
  S: [190, 198, 204], o: [224, 118, 48], k: [30, 30, 34],
  // héron cendré
  H: [122, 132, 142], h: [178, 186, 192], Y: [214, 178, 74], P: [140, 124, 92],
  // libellule — ROUGE (sympétrum) : la bleue disparaissait sur le bleu du fleuve
  a: [206, 74, 52], A: [122, 40, 34], v: [232, 242, 248],
  // pigeon
  p: [124, 132, 146], q: [84, 90, 106], n: [88, 134, 120], j: [168, 174, 186],
  // mouette
  s: [160, 172, 184],
  // feuilles
  e: [196, 120, 45], E: [214, 158, 58], u: [168, 86, 38], m: [118, 148, 60],
  // chien (roux) et chat (gris tigré)
  // (robe foncée : le roux clair du premier jet se perdait dans le pavé)
  C: [124, 72, 42], R: [72, 42, 28], x: [34, 28, 26],
  T: [132, 128, 124], U: [84, 80, 80], V: [196, 190, 180],
  // éclat du soleil sur l'eau (blanc chaud, et son halo)
  Z: [255, 250, 226], X: [214, 228, 228],
  // papillons (piéride blanche, citron, petite tortue)
  i: [244, 242, 232], Q: [236, 208, 72], O: [222, 108, 44], z: [52, 44, 40],
};

// ── LES PLANCHES ────────────────────────────────────────────────────────────
// Une planche = une liste d'images de même taille (animation), regard à droite.
// `foot` = rangée où la bête touche le sol ou l'eau (pivot du blit).
export const VIE_ART = {
  // COLVERT mâle qui nage : tête verte, collier blanc, poitrine brune. La 2e
  // image avance la ligne d'eau d'un pixel : la bête « rame ».
  duckM: { foot: 3, frames: [[
    '...GG.',
    '...Ggy',
    'tDDW..',
    '.BBcc.',
  ], [
    '...GG.',
    '...Ggy',
    'tDDW..',
    'BBBcc.',
  ]] },
  // CANE : la même, en brun.
  duckF: { foot: 3, frames: [[
    '...FF.',
    '...ffy',
    'FfFf..',
    '.ffff.',
  ], [
    '...FF.',
    '...ffy',
    'FfFf..',
    'fffff.',
  ]] },
  // CANETON : deux pixels et demi — c'est la file derrière la mère qui le dit.
  duckling: { foot: 1, frames: [[
    '.l',
    'Ll',
  ], [
    '.l',
    'll',
  ]] },
  // CYGNE : cou en S, bec orange, ailes levées en coussin sur le dos.
  swan: { foot: 5, frames: [[
    '.....WW.',
    '.....Wko',
    '.....W..',
    '.SWW.W..',
    'SWWWWW..',
    '.SSSSS..',
  ]] },
  // HÉRON debout (l'attente), puis tête rentrée et bec pointé vers l'eau (le guet
  // avant la pique). Silhouette : aigrette noire, bec-poignard, pattes hautes.
  heron: { foot: 8, frames: [[
    '.kk..',
    'kWW..',
    '..WYY',
    '..W..',
    '.Wh..',
    'HHHh.',
    'kHH..',
    '.P...',
    '.P...',
  ], [
    '.....',
    '.....',
    '.kk..',
    'kWWh.',
    '.hHWY',
    'HHHhY',
    'kHH..',
    '.P...',
    '.P...',
  ]] },
  // HÉRON en vol : grandes ailes arrondies, cou replié, pattes qui traînent. Le corps
  // remonte d'un pixel au coup d'aile bas (c'est l'aile qui porte). Première version
  // à ailes d'un pixel : un bâton gris, illisible en vol.
  heronFly: { foot: 3, frames: [[
    '.....hH.....',
    '....HHHH....',
    '...HHHHHh...',
    'PPPHHHHHHhWY',
    '............',
    '............',
  ], [
    '............',
    '............',
    'PPPHHHHHHhWY',
    '...HHHHHh...',
    '....HHHH....',
    '.....HH.....',
  ]] },
  // LIBELLULE : corps rouge, deux ailes qui scintillent en alternance.
  dragonfly: { foot: 1, frames: [[
    '.v.',
    'Aaa',
  ], [
    'v.v',
    'Aaa',
  ]] },
  // POISSON QUI SAUTE, de flanc : il sort tête haute, file à plat, replonge.
  fishUp: { foot: 3, frames: [[
    '...bw',
    '..bb.',
    '.db..',
    'd....',
  ]] },
  fishTop: { foot: 1, frames: [[
    'd.dbw',
    '.dbww',
  ]] },
  fishDown: { foot: 3, frames: [[
    'd....',
    '.db..',
    '..bb.',
    '...bw',
  ]] },
  // LE PÊCHEUR DU PONT (isoBridge.drawRod). FLOTTEUR rouge à ceinture blanche :
  // posé, enfoncé d'un pixel (il dodeline), puis coulé (la touche — seule la pointe
  // dépasse). Pied = la ligne d'eau.
  bobber: { foot: 2, frames: [[
    '.a.',
    'aaa',
    '.W.',
  ], [
    '...',
    '.a.',
    'aaa',
  ], [
    '...',
    '...',
    '.a.',
  ]] },
  // La PRISE pendue à la ligne, bouche en haut : elle frétille (la queue bat).
  // C'est la SILHOUETTE qui dit « poisson » : museau, corps, queue étranglée puis
  // FOURCHUE. Toute en clair : sur l'eau sombre, un dos ou une queue foncés
  // disparaissaient et il restait un pavé (vu à la capture — « une lanterne »).
  // Il se tord : la 2e image montre l'autre flanc.
  fishHang: { foot: 0, frames: [[
    '.b.',
    'wbS',
    'wbS',
    'wbS',
    '.b.',
    'b.b',
  ], [
    '.b.',
    'Sbw',
    'Sbw',
    'Sbw',
    '.b.',
    'b.b',
  ]] },
  // FEUILLES : quatre poses d'une feuille qui vrille (à plat, de biais, de chant,
  // de l'autre biais). 3 px : à 2, elle ne se voyait qu'agrandie ×5.
  leaf: { foot: 1, frames: [['ee.', '.ee'], ['eee', '...'], ['.ee', 'ee.'], ['.e.', '.e.']] },
  // PIGEON posé (debout, puis tête baissée qui picore) et en vol (ailes hautes /
  // basses). Gris-bleu, gorge irisée d'un pixel.
  pigeon: { foot: 2, frames: [[
    '...pk',
    'qppn.',
    '.jpp.',
  ], [
    'q....',
    '.ppn.',
    '.jppk',
  ]] },
  // En vol : corps SOMBRE, dessous d'ailes CLAIR — gris sur gris, le premier jet ne
  // se voyait que sur le vert d'un sapin, jamais sur le pavé.
  pigeonFly: { foot: 1, frames: [[
    '.jj..',
    'qqpqn',
    '.....',
  ], [
    '.....',
    'qqpqn',
    '..jj.',
  ]] },
  // MOUETTE posée (dos gris, bout d'aile noir, bec jaune) et en vol : la
  // silhouette en M, lisible dans tous les caps.
  gull: { foot: 3, frames: [[
    '...WW',
    'kssWy',
    '.WWW.',
    '..P..',
  ]] },
  // (9 px d'envergure : à 7, le M se lisait comme un tiret.)
  gullFly: { foot: 1, frames: [[
    '.ss...ss.',
    'k..sWs..k',
    '.........',
  ], [
    'k.......k',
    '.s.....s.',
    '..ssWss..',
  ], [
    '.........',
    '..ssWss..',
    'ks.....sk',
  ]] },
};

// CHIEN qui trotte au pas de son maître (deux images de trot) et assis quand le
// maître s'arrête. 8 px de long : un peu moins que l'habitant n'est haut.
VIE_ART.dog = { foot: 4, frames: [[
  '......R.',
  'C....CCx',
  '.CCCCCC.',
  '.CCCCC..',
  '.R..R...',
], [
  '......R.',
  '.C...CCx',
  '.CCCCCC.',
  '.CCCCC..',
  'R..R..R.',
]] };
VIE_ART.dogSit = { foot: 4, frames: [[
  '....R.',
  '...CCx',
  '..CCC.',
  'CCCCC.',
  '.RRR..',
]] };
// CHAT assis sur le muret (le parapet du quai), tourné vers l'eau : la queue bat
// lentement (deux images), et de temps en temps il se lèche la patte (3e image).
VIE_ART.cat = { foot: 4, frames: [[
  '..U.U',
  '..TTT',
  'U.TVT',
  'UTTT.',
  '.TTT.',
], [
  '..U.U',
  '..TTT',
  '..TVT',
  'UTTT.',
  'UTTT.',
], [
  '.....',
  '..U.U',
  '..TTT',
  'UTTVT',
  '.TTT.',
]] };
// PAPILLONS : ailes ouvertes / fermées, trois espèces par la couleur.
// (5 × 3 : à 3 × 2, un papillon n'était qu'un point d'un pixel.)
const bfly = (c) => ({ foot: 2, frames: [[c + c + '.' + c + c, '.' + c + 'z' + c + '.', '..z..'], ['..' + c + '..', '.' + c + 'z' + c + '.', '..z..']] });
VIE_ART.bflyW = bfly('i');
VIE_ART.bflyY = bfly('Q');
VIE_ART.bflyO = bfly('O');
// Surtout du jaune et de l'orange : la piéride blanche disparaît sur le pavé clair.
export const BFLY_KINDS = ['bflyY', 'bflyO', 'bflyW', 'bflyY'];

// ÉCLAT DU SOLEIL sur l'eau : un point qui s'allume en petite croix, puis s'éteint.
VIE_ART.glint = { foot: 1, frames: [['...', '.X.', '...'], ['.X.', 'XZX', '.X.'], ['...', '.Z.', '...']] };

// Les feuilles en quatre teintes (ambre, or, rouille, vert qui traîne) : même
// vrille, autre couleur.
for (const [nm, ch] of [['leafE', 'E'], ['leafU', 'u'], ['leafM', 'm']]) {
  VIE_ART[nm] = { foot: 1, frames: VIE_ART.leaf.frames.map((f) => f.map((r) => r.replace(/e/g, ch))) };
}
export const LEAF_KINDS = ['leaf', 'leafE', 'leafU', 'leafM'];

// ── LA BRUME SELON L'HEURE ──────────────────────────────────────────────────
// Réponse de Raph (2026-10-01) : à l'aube et au soir, jamais en journée. Cycle de
// 9 min (cityMapRuntime) : jour 0-0,55, crépuscule 0,55-0,65, nuit 0,65-0,90,
// aube 0,90-1. La brume de rivière se forme au soir, culmine à l'AUBE et se lève
// dans la matinée — dans la lumière rasante, c'est là qu'on la voit le mieux.
// ⚠ RIEN EN PLEINE NUIT (Raph, 2026-10-01 : sa trame se lisait comme des points de
// lumière parasites sur l'eau sombre). Courbe continue, en densité 0..1.
export function mistOfDay(p) {
  const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  const q = (((p + 0.1) % 1) + 1) % 1;          // 0 = début de l'aube
  if (q < 0.07) return ss(0, 0.07, q);                     // aube : elle monte
  if (q < 0.12) return 1;                                  // lever du jour : au plus dense
  if (q < 0.2) return 1 - ss(0.12, 0.2, q);                // matinée : elle se lève
  if (q < 0.6) return 0;                                   // journée : rien
  if (q < 0.72) return 0.7 * ss(0.6, 0.72, q);             // soir : elle se forme
  if (q < 0.8) return 0.7 - 0.7 * ss(0.72, 0.8, q);        // nuit tombée : elle se défait
  return 0;                                                // nuit noire : rien
}

// ── OMBRES DE POISSONS (sous l'eau) ─────────────────────────────────────────
// Silhouette fuselée qui file le long d'une DIAGONALE ISO (2:1) — le fleuve suit
// les axes du monde, donc les poissons aussi, ± leur serpentage. Un seul dessin
// (tête en bas à droite) ; les trois autres caps sont ses miroirs : c'est la
// forme du sprite qui porte la direction, pas une rotation (elle casserait la
// grille des pixels). Deux calibres, deux poses de queue chacun.
// Queue fourchue, pédoncule mince, corps plein, tête ronde : la première version (un
// trait de deux pixels) se lisait comme un bâton à côté de l'ancienne ellipse.
export const FISH_SHADOW = {
  small: [[
    'K.K....',
    '.KK....',
    '..KKK..',
    '..KKKK.',
    '...KKKK',
    '.....KK',
  ], [
    '.KK....',
    '.KK....',
    '..KKK..',
    '..KKKK.',
    '...KKKK',
    '.....KK',
  ]],
  big: [[
    'K..K......',
    '.KKK......',
    '..KKK.....',
    '..KKKKK...',
    '...KKKKKK.',
    '....KKKKKK',
    '......KKKK',
    '........K.',
  ], [
    '.K.K......',
    '..KK......',
    '..KKK.....',
    '..KKKKK...',
    '...KKKKKK.',
    '....KKKKKK',
    '......KKKK',
    '........K.',
  ]],
};

// ── DÉCODAGE ────────────────────────────────────────────────────────────────
// Une image texte → { w, h, data } (RGBA, Uint8ClampedArray). `flip` = miroir
// horizontal, `flipY` = miroir vertical. Pur : le jeu en fait des canvas, la
// planche de contrôle des PNG.
export function decodeRows(rows, { flip = false, flipY = false, pal = VIE_PAL } = {}) {
  const h = rows.length;
  let w = 0;
  for (const r of rows) if (r.length > w) w = r.length;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const row = rows[flipY ? h - 1 - y : y];
    for (let x = 0; x < w; x += 1) {
      const ch = row[flip ? w - 1 - x : x];
      if (!ch || ch === '.') continue;
      const c = pal[ch];
      if (!c) continue;
      const i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3] ?? 255;
    }
  }
  return { w, h, data };
}

// ── ANNEAUX (ronds de pluie, saut, sillage) ─────────────────────────────────
// Un anneau COUCHÉ SUR L'EAU (ellipse 2:1), tracé pixel par pixel au rayon r
// (pixels d'art) : c'est le trait d'un pixel qui fait l'anneau pixel-art, là où
// l'ancien `ctx.ellipse().stroke()` lissé posait un filet flou sur une eau nette.
// Renvoie la liste des pixels [x, y] autour du centre (0, 0), sans doublon.
export function ringPixels(r) {
  const out = [];
  const seen = new Set();
  const rx = Math.max(1, r), ry = Math.max(0.5, r * 0.5);
  const n = Math.max(8, Math.ceil(rx * 7));
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(Math.cos(a) * rx), y = Math.round(Math.sin(a) * ry);
    const k = x + ',' + y;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([x, y]);
  }
  return out;
}

// ── BRUME : UN FILET EFFILOCHÉ ──────────────────────────────────────────────
// Trois essais refusés en juillet : des nappes douces (invisibles), des bancs à
// plateau (« plein de ronds »), un voile plein. Ce qui manquait aux trois, c'est
// une STRUCTURE : la brume de rivière se couche en longs filets, dans le sens du
// courant, qui s'effilochent aux bouts et se déchirent au milieu.
//
// Le filet est donc tracé au pixel le long d'une ligne, à l'angle du fleuve à
// l'écran (dessiné À cet angle, pas tourné après), avec une épaisseur en fuseau,
// des trous et des brins. L'opacité sort d'une trame ordonnée (Bayer 4×4) : les
// pixels sont allumés ou éteints, jamais à moitié — c'est la trame qui fait le
// dégradé, comme dans un jeu en pixel art. `dens` (0..1) suit l'heure : la brume
// s'étoffe et se défait en gagnant ou perdant des pixels, sans jamais devenir floue.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// hash01 = hash01Lowbias (../hash.js), le tirage de toute la petite vie.
export { hash01 };
const MIST_RGB = [228, 236, 240];
// Bruit de valeur 1D lissé (0..1), pour les bords du filet et ses déchirures.
function noise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const a = hash01(i * 374761 + seed * 668265), b = hash01((i + 1) * 374761 + seed * 668265);
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}
export function mistStrand(seed, dx, dy, len, dens, wide = 1) {
  const dl = Math.hypot(dx, dy) || 1;
  const ux = dx / dl, uy = dy / dl;
  const nx = -uy, ny = ux;
  // Un filet a du CORPS : 11 à 19 px de demi-largeur au plus épais (au zoom 1), ×`wide`
  // pour une nappe. Les deux premiers jets (3-6 px, puis 7-13) se lisaient comme des
  // rayures de vitesse, pas comme de la brume.
  const thick = (11 + hash01(seed * 7 + 1) * 8) * wide;
  const pad = Math.ceil(thick) + 3;
  const x0 = Math.floor(Math.min(0, ux * len) - pad), x1 = Math.ceil(Math.max(0, ux * len) + pad);
  const y0 = Math.floor(Math.min(0, uy * len) - pad), y1 = Math.ceil(Math.max(0, uy * len) + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  const wav = hash01(seed * 7 + 3) * 6.28, wamp = 1.5 + hash01(seed * 7 + 4) * 2.5;
  const skew = (hash01(seed * 7 + 5) - 0.5) * 6;
  // Échelles du bruit en fraction de longueur : les bosses du bord tous les ~20 px,
  // les déchirures tous les ~60 px.
  const edgeF = len / 20, tearF = len / 60;
  let lit = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const px = x + x0, py = y + y0;
      const u = (px * ux + py * uy) / len;                  // 0..1 le long du filet
      if (u < 0 || u > 1) continue;
      const v = (px * nx + py * ny) - Math.sin(u * 6.28 * 1.1 + wav) * wamp - (u - 0.5) * skew;
      // Fuseau irrégulier : le bord se bosselle (bruit), les bouts s'effilochent.
      const prof = Math.pow(Math.sin(Math.PI * u), 0.6);
      const lump = 0.55 + 0.45 * noise1(u * edgeF, seed);
      // Bord haut et bord bas indépendants : une nappe n'est pas symétrique.
      const side = v < 0 ? noise1(u * edgeF + 17, seed + 3) : noise1(u * edgeF + 41, seed + 5);
      const wd = thick * prof * lump * (0.7 + 0.3 * side) + 0.4;
      let a = 1 - Math.abs(v) / wd;
      if (a <= 0) continue;
      a = Math.pow(a, 0.75);
      // Déchirures : là où le bruit tombe bas, le filet s'ouvre.
      const tear = noise1(u * tearF + 5, seed + 9);
      a *= Math.max(0, Math.min(1, (tear - 0.18) / 0.3));
      // Brins : un peu plus dense en lignes dans le sens du courant.
      a *= 0.85 + 0.15 * Math.sin(v * 1.3 + u * 30);
      a = Math.min(1, a * 1.25) * dens;
      const thr = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      if (a <= thr) continue;
      const i = (y * w + x) * 4;
      data[i] = MIST_RGB[0]; data[i + 1] = MIST_RGB[1]; data[i + 2] = MIST_RGB[2];
      // Trois intensités : le cœur, le corps, la frange (trame plus lâche).
      data[i + 3] = a > 0.78 ? 120 : a > 0.5 ? 88 : 60;
      lit += 1;
    }
  }
  // Ancre = le début du filet (0, 0 du tracé) dans l'image.
  return { w, h, data, ox: -x0, oy: -y0, lit };
}

// ── FUMÉE : UNE BOUFFÉE RONDE ───────────────────────────────────────────────
// L'ancienne fumée posait des CARRÉS qui grossissaient. Une bouffée pixel art est
// un disque éclairé en haut à gauche (la lumière du jeu) et ombré en bas à droite,
// au bord tramé (un pixel sur deux) pour qu'il se fonde sans devenir flou.
// `pal` = [éclairé, milieu, ombre] : la fumée blanche des cheminées par défaut, la
// SUIE des incendies de crise (isoAmbient, drawIsoCrisisSmoke) en sombre.
const PUFF_WHITE = [[244, 242, 236], [222, 220, 214], [190, 190, 188]];
export function puffSprite(r, pal = PUFF_WHITE) {
  const R = Math.max(1, Math.round(r)), w = R * 2 + 1, h = R * 2 + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = x - R, dy = y - R;
      const d = Math.hypot(dx, dy) / (R + 0.5);
      if (d > 1) continue;
      const rim = d > 0.7 && R > 1;
      if (rim && ((x + y) & 1)) continue;
      const lit = dx + dy < -R * 0.5, shade = dx + dy > R * 0.6;
      const c = lit ? pal[0] : shade ? pal[2] : pal[1];
      const i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = rim ? 170 : 225;
    }
  }
  return { w, h, data, ox: R, oy: R };
}

// ── HALO DE LUMIÈRE AU PIXEL ────────────────────────────────────────────────
// Pour les PETITES lueurs (luciole, cœur de flamme, étincelle) : la même décroissance
// que le dégradé lissé, mais en TROIS paliers francs — une petite étoile de pixels.
// ⚠ Essayé aussi sur les grandes nappes des réverbères, avec une trame de Bayer
// entre les paliers : sur 50 px de rayon, la trame se lisait comme du BRUIT, pas
// comme de la lumière (planche A/B du 2026-10-01). Les grandes nappes gardent donc
// leur dégradé lisse (cf. vieHalo, seuil de rayon). `squash` écrase
// le halo en ellipse (flaque de lumière couchée au sol). Alpha dans le canal alpha,
// couleur pleine : le blit fixe la force (globalAlpha) et le mode (additif).
export function haloSprite(R, rgb, squash = 1) {
  const Rx = Math.max(1, Math.round(R)), Ry = Math.max(1, Math.round(R * squash));
  const w = Rx * 2 + 1, h = Ry * 2 + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (x - Rx) / (Rx + 0.5), dy = (y - Ry) / (Ry + 0.5);
      const d = Math.hypot(dx, dy);
      if (d >= 1) continue;
      const lv = Math.ceil((1 - d) * 3);
      if (lv <= 0) continue;
      const i = (y * w + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
      data[i + 3] = Math.round(255 * Math.min(3, lv) / 3 * 0.7);
    }
  }
  return { w, h, data, ox: Rx, oy: Ry };
}

// ── OMBRE DE NUAGE ──────────────────────────────────────────────────────────
// Un cumulus vu d'en haut, écrasé de moitié par la vue iso : l'union de cinq à huit
// ellipses, un bord bosselé par un bruit doux, et une frange en DÉGRADÉ d'opacité.
// ⚠ Une frange TRAMÉE (Bayer) a été essayée : les bords des ellipses aplaties font de
// longues lignes presque horizontales, et au zoom 2,5 (cases de 8 px) la trame y
// dessinait un DAMIER en travers des trottoirs (signalé par la session des maisons,
// 2026-10-01). Une ombre de nuage est douce par nature, comme les grandes nappes de
// lumière : elle est posée LISSÉE (isoVieNuages). Force au blit (multiply × alpha).
function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (a, b) => hash01(a * 374761 + b * 668265 + seed * 982451);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
}
const CLOUD_RGB = [112, 122, 146];
export function cloudShadowMask(seed, W, H) {
  W = Math.max(8, Math.round(W)); H = Math.max(4, Math.round(H));
  const blobs = [];
  const n = 5 + Math.floor(hash01(seed * 3 + 1) * 4);
  for (let i = 0; i < n; i += 1) {
    const rx = W * (0.16 + hash01(seed * 31 + i) * 0.16);
    blobs.push({
      cx: W * (0.25 + hash01(seed * 17 + i) * 0.5), cy: H * (0.3 + hash01(seed * 23 + i) * 0.4),
      rx, ry: rx * 0.5 * (0.8 + hash01(seed * 29 + i) * 0.4),
    });
  }
  const data = new Uint8ClampedArray(W * H * 4);
  const edge = 0.2;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let f = -1;
      for (const b of blobs) {
        const dx = (x - b.cx) / b.rx, dy = (y - b.cy) / b.ry;
        const v = 1 - dx * dx - dy * dy;
        if (v > f) f = v;
      }
      f += (noise2(x / 22, y / 11, seed) - 0.5) * 0.35;
      if (f <= 0) continue;
      const i = (y * W + x) * 4;
      data[i] = CLOUD_RGB[0]; data[i + 1] = CLOUD_RGB[1]; data[i + 2] = CLOUD_RGB[2];
      data[i + 3] = f >= edge ? 255 : Math.round(255 * f / edge);
    }
  }
  return { w: W, h: H, data, ox: Math.round(W / 2), oy: Math.round(H / 2) };
}
