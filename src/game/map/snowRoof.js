"use strict";
// NEIGE SUR LES TOITS — passe de RUNTIME posée sur les sprites de BÂTIMENT
// (habitations et props de scène moteur) quand la saison vaut WINTER.
//
// POURQUOI PAS DES SPRITES `-winter` DÉRIVÉS, CETTE FOIS
// ──────────────────────────────────────────────────────
// Le sol et la végétation ont leur hiver CUIT dans l'art (fetchGroundTiles,
// scripts/snowTrees.mjs) et c'était le bon choix là-bas : 13 matières et 10
// arbres, relisibles d'un coup d'œil sur une planche. Le bâti, lui, pèse 353
// sprites (21 habitations + 332 props, inventaire du 2026-08-05) : dériver, ce
// serait +5 Mo au dépôt ET 353 images à relire une par une, pour un réglage
// qu'on voudra bouger. Demande de Raph (2026-08-05) : « des sprites de motte de
// neige adaptés aux toits pour ne pas avoir à refaire tous les sprites ».
//
// LE DÉPLACEMENT QUI REND L'IDÉE TENABLE : le MASQUE se calcule, il ne s'annote
// pas. Le placement est justement la partie chère d'un décal posé à la main (la
// campagne portes/fenêtres a coûté 296 entrées dans sprite-annotations.json, et
// une ligne de toit est un profil, pas un rectangle) — et c'est celle qui est
// gratuite en automatique. On calcule donc où la neige tient, une fois par
// sprite au décodage, et on remplit ce masque.
//
// ⚠ LA RÈGLE DE DÉPÔT DES ARBRES NE SE TRANSPOSE PAS. snowTrees.mjs prend le
// quantile haut de LUMINANCE, parce que les faces d'une couronne tournées vers
// le ciel sont déjà peintes claires par l'auteur. Sur un bâtiment, le pixel le
// plus clair du sprite est un MUR AU SOLEIL : la même règle enneigerait les
// façades et laisserait les toits nus. Ce qui porte la neige sur du bâti est
// GÉOMÉTRIQUE — une surface tournée vers le ciel, donc une ligne de crête dont
// la pente locale est faible.
//
// ⚠ PASSE ADDITIVE, ET C'EST UN CONTRAT, PAS UNE ÉCONOMIE. On ne repeint QUE
// les pixels de neige ; murs, toits et ombres sortent intacts. Raison :
// applyHouseTint (housePalette.js) est un LOOKUP EXACT sur les rampes de
// matière — quatre unités de dérive et la teinte ne reconnaît plus rien, donc
// les 20 aspects des habitations tomberaient à 1 en hiver, en silence. Vérifié :
// aucun ton de SNOW n'existe dans les rampes de housePalette, les pixels de
// neige traversent donc la teinte inchangés, ce qui est aussi ce qu'on veut (la
// neige ne se teinte pas). Corollaire assumé : les murs gardent leur couleur
// d'été, ce qui est juste — une pierre ne change pas de teinte parce qu'il gèle.
//
// ⚠ LA NEIGE RESTE DANS LA SILHOUETTE. Pas un pixel d'alpha ne bouge. Un chapeau
// qui déborderait du toit changerait la bbox, donc lightCutImage, le liseré de
// survol, le grain mesuré (spriteScale) et la portée peintre des habitations.
// Une motte posée « par-dessus » aurait cassé ces quatre contrats d'un coup.
//
// Module FEUILLE : ni CM ni saison ici. Les appelants décident QUAND (eux seuls
// savent lire CM.season) ; ce fichier ne dit que OÙ et de quelle couleur.

// Rampe de neige — celle du SOL d'hiver, tons dominants mesurés sur
// iso-grass-winter-* et déjà reprise par snowTrees.mjs. Ne pas « améliorer » ces
// valeurs à l'œil : deux matières enneigées côte à côte qui ne partagent pas
// leur blanc se lisent comme deux hivers différents.
export const SNOW_RAMP = [
  [222, 234, 234],   // crête éclairée
  [201, 217, 220],   // corps
  [173, 190, 196],   // retombée / ombre propre
];

// LE FEU NE PREND PAS LA NEIGE, et le sommet d'une flamme est une crête parfaite
// — sans cette garde, chaque brasero de scène recevrait sa calotte blanche. La
// détection est un LOOKUP EXACT sur la rampe de feu (public/pixelart/fire-ramp.json,
// même doctrine que SKIP_FIRE dans remapPalette) et surtout PAS un test
// « rouge-orangé » : la terre cuite passerait le test, et les toits de tuiles
// sont précisément ceux qui doivent recevoir la neige.
const FIRE_HEX = [0x4a0c05, 0x8c1206, 0xc4180a, 0xef2a0b, 0xff5312, 0xff8a20, 0xffbc4e, 0xfff0c8];
const FIRE = new Set(FIRE_HEX);

// Réglages. Tous en un point, molette __snowRoofTune côté navigateur.
export const snowRoofTune = {
  on: true,
  // ── OÙ (la surface regarde-t-elle le ciel ?) ───────────────────────────────
  // ⚠ LA PENTE DE LA LIGNE DE CRÊTE NE SUFFIT PAS, ESSAYÉE ET JETÉE. En
  // projection iso 2:1 l'arête d'un toit descend à 0,5 — et le bord de bien des
  // masses aussi. Sur planche, la neige coulait le long des FLANCS des tours et
  // des immeubles : le test acceptait toute frontière peu inclinée, sans jamais
  // demander de quel côté se trouvait la matière.
  //
  // Ce qui le dit vraiment, c'est la NORMALE de la frontière. On la prend au
  // Sobel sur le champ d'opacité : le gradient pointe du vide vers la matière,
  // donc une surface tournée vers le ciel a un gradient vers le BAS. Le seuil se
  // lit « combien de fois plus haute que large doit être la normale » — une face
  // de toit iso 2:1 sort à 2, une pente à 45° à 1, un flanc vertical à 0.
  //
  // À 0,75 on accepte jusqu'à ~53°, et il le FAUT : plus strict, les toits
  // CONIQUES ne reçoivent rien du tout — mesuré à 0,6 % de l'encre sur la hutte
  // et la tente, c'est-à-dire les deux premières habitations que voit un joueur.
  //
  // ⚠ Ce seuil n'est PAS ce qui empêche la neige de couler sur les flancs : le
  // mettre à 0 ne change le masque que sur 38 sprites du dépôt sur 352, et de
  // quelques dizaines de pixels. Ce qui décide vraiment, c'est l'amincissement
  // par l'inclinaison plus le plancher (cf. minBandK) : une frontière verticale
  // sort à une épaisseur inférieure au plancher et disparaît d'elle-même. Le
  // seuil reste une sortie anticipée, pas la règle.
  upMin: 0.75,
  maxJump: 3,
  // LE SOCLE N'EST PAS UN TOIT. Beaucoup de props portent leur bout de terrain
  // dans le sprite (herbe, dalle, terre battue) : parfaitement tourné vers le
  // ciel, donc la règle s'y jetait et posait deux coins blancs en biseau de part
  // et d'autre de la base — alors que le sol, lui, est DÉJÀ enneigé par les
  // tuiles d'hiver.
  //
  // ⚠ UN GARDE-FOU DE HAUTEUR NE SUFFIT PAS, essayé jusqu'à 30 % : le socle est
  // un LOSANGE, ses deux pointes latérales remontent à mi-hauteur du sprite sur
  // les grandes scènes, exactement là où vivent les toits d'annexe. Ce qui les
  // sépare vraiment, c'est ce qu'il y a DESSOUS : sous un toit il y a un
  // bâtiment, sous une dalle il n'y a que l'épaisseur de la dalle. On exige donc
  // une profondeur de matière sous la graine, en multiple de l'épaisseur de
  // neige. Effet de bord voulu : la lèvre d'un débord de toit, trop mince, ne
  // reçoit rien non plus — une couche de neige en équilibre sur deux pixels
  // d'avant-toit ne se lit pas.
  depthK: 2,
  floorGuard: 0.06,       // et rien dans la toute dernière frange, socle ou pas
  smoothSpan: 5,          // demi-fenêtre du lissage de profondeur, en colonnes
  quantile: 0.35,         // quantile retenu dans la fenêtre (0,5 = médiane)
  // Une crête ISOLÉE (aucune voisine à gauche ni à droite) n'est pas un toit,
  // c'est une antenne, un épi de faîtage ou une girouette. Elle ne reçoit rien :
  // une motte blanche sur un pixel de large est un défaut, pas de la neige.
  minRun: true,
  // ── JUSQU'OÙ (l'épaisseur, et la face qui la borne) ────────────────────────
  // La couche a une ÉPAISSEUR RÉGULIÈRE, et la face de toit — mesurée sous la
  // crête tant que la matière tient — ne sert qu'à la BORNER pour qu'elle ne
  // coule pas sur le mur. L'avant-toit arrête la descente tout seul, sans rien
  // annoter. Il faut bien une épaisseur : la version « crête seule » ne couvrait
  // que 4 à 8 % de l'encre et rendait un cheveu blanc sur l'arête.
  //
  // ⚠ ET LA MESURE DE LA FACE NE PILOTE PAS L'ÉPAISSEUR, ELLE LA BORNE. Essayé
  // dans l'autre sens (couche = une fraction de la face mesurée) : la longueur
  // de face varie du simple au double d'une colonne à l'autre selon l'endroit où
  // tombe un joint de tuiles, et la couche devenait un peigne. Lissée à la
  // médiane elle restait bosselée, lissée au quantile bas elle retombait au
  // liseré. Une couche de neige a une ÉPAISSEUR, pas un pourcentage : on la pose
  // régulière, et la matière ne sert qu'à l'empêcher de couler sur le mur.
  //
  // ⚠ COUVRIR, PAS REMPLACER : la couche s'arrête bien avant l'avant-toit. Un
  // toit intégralement blanc perd sa matière, et 353 bâtiments blancs, c'est une
  // ville en polystyrène. La tuile et l'ardoise doivent continuer de dire l'ère
  // et la richesse du quartier.
  //
  // Épaisseur en fraction de la HAUTEUR D'ENCRE, bornée. ⚠ Le plancher n'est pas
  // cosmétique : à l'échelle de jeu un habitant fait ~10 px apparents et la
  // densité de blit des props tourne autour de 0,83 (sprite-apparent.json) — une
  // couche d'un pixel source rend 0,8 px à l'écran, c'est-à-dire rien.
  thickK: 0.16,
  thickMin: 2,
  thickMax: 12,
  // ⚠ PLUS LA SURFACE EST RAIDE, MOINS ELLE TIENT — et sous un certain seuil elle
  // ne tient RIEN. Retour de Raph sur capture (2026-08-05) : « quand ça fait un
  // trait blanc c'est pas beau ». C'était le cas des RIVES DE PIGNON et des
  // lèvres d'avant-toit : la règle les acceptait (elles regardent le ciel) mais
  // la matière sous elles est mince, donc la couche s'y écrasait à 1 ou 2 px et
  // se lisait comme un trait à l'encre le long du toit, pas comme de la neige.
  //
  // Deux corrections qui vont ensemble. D'abord l'épaisseur suit le COSINUS de
  // l'inclinaison, au carré : une surface plate porte la couche pleine, une face
  // iso 2:1 en garde 80 %, une pente à 45° la moitié, une rive raide presque
  // rien. C'est aussi ce que fait la vraie neige. Ensuite un PLANCHER : sous
  // `minBandK` de l'épaisseur nominale, on ne pose rien du tout. Mieux vaut une
  // arête nue qu'un trait blanc — un trait, l'œil le lit comme un contour dessiné
  // et il saute aux yeux sur toute une ville.
  minBandK: 0.35,
  minBandPx: 3,
  // ── LE BORD BAS (cf. le bloc « BORD BAS » dans la pose) ────────────────────
  // `coreF` = part de la couche en aplat plein ; au-delà, la neige ne se garde
  // que dans les CREUX du dessin, ce qui laisse le motif du toit transparaître.
  // `edgeBlock` = largeur en colonnes d'une ondulation du bord (par blocs : un
  // bruit colonne par colonne ferait un peigne). `grainReach` / `grainP` = les
  // quelques grains isolés qui traînent sous le bord, dans les joints.
  fringePx: 3,
  edgeBlock: 4,
  grainReach: 3,
  grainP: 0.75,
  reliefF: 0.82,       // sous cette part de la valeur moyenne, la neige suit le creux
  maxRunK: 0.55,          // descente maximale mesurée, en fraction de l'encre
  // Distance de CHROMATICITÉ (couleur débarrassée de son ombrage) qui rompt la
  // matière. Relevée sur des profils verticaux : à l'intérieur d'un champ de
  // tuiles les écarts à la référence montent à 0,20 sur les petites habitations,
  // qui sont très denses ; le passage au mur saute à 0,29 sur granary-hall. La
  // marge est mince, le seuil se pose juste au-dessus du bruit interne.
  chroma: 0.26,
  // ⚠ LA LUMINANCE NE SÉPARE RIEN, DEUX FOIS MESURÉ, DEUX MÉCANISMES JETÉS.
  //
  // 1. « L'avant-toit fait de l'ombre, donc une chute de valeur ferme la face » :
  //    faux, dans le même champ de tuiles les JOINTS chutent de 104 unités, plus
  //    que l'avant-toit lui-même.
  // 2. « Une ombre ÉPAISSE est un avant-toit, une ombre fine un joint » : vrai
  //    sur les grandes scènes, ruineux sur les habitations. Un toit d'ardoise
  //    sombre est TOUT ENTIER sombre par rapport à sa ligne de faîte, donc la
  //    règle fermait la face au troisième pixel et la couche retombait à 3 px —
  //    c'est-à-dire au TRAIT BLANC que Raph a vu en jeu. Retiré.
  //
  // Reste `litF`, et seulement pour ce à quoi il sert vraiment : un pixel
  // presque noir n'a pas de teinte fiable (tout tend vers le gris en
  // s'assombrissant), il ne juge donc pas le changement de matière. Seuil bas,
  // volontairement : il ne doit écarter que le vrai noir.
  litF: 0.15,
  // LA FAÎTIÈRE EST D'UNE AUTRE MATIÈRE QUE LE TOIT, et c'est ce qui cassait
  // tout : la référence était prise sur le premier pixel du haut — souvent une
  // tuile de faîtage beige sur un champ de tuiles rouges — donc la descente
  // s'arrêtait au deuxième pixel (mesuré : longueur médiane de 2 px, la neige
  // rendait un cheveu blanc sur l'arête). On tolère donc UN changement de
  // matière, à condition qu'il arrive tôt : une faîtière est mince, un mur non.
  capMax: 5,
};

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Tirage déterministe dans [0,1) à partir de deux entiers. Le brassage (fmix32)
// n'est PAS décoratif : sans lui les bits de poids faible ne sont que la parité
// des entrées, et tout tirage à deux états dessine un damier — le piège que
// `cmHash & 1` a déjà tendu à ce projet. La neige étant cuite une fois par
// sprite, il faut du déterministe pur : deux cuissons doivent donner le même
// bord, sinon la couche changerait de forme à chaque recuisson.
function hash01(a, b) {
  let n = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  n ^= n >>> 16; n = Math.imul(n, 0x85ebca6b) >>> 0;
  n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35) >>> 0;
  n ^= n >>> 16;
  return n / 4294967296;
}

/**
 * MASQUE DE NEIGE d'un sprite. Pur : ni DOM ni canvas, il ne lit qu'un buffer
 * RGBA — c'est ce qui permet à la garde de le rejouer sous Node sur les vrais
 * PNG du dépôt (__tests__/snowRoof.test.js) au lieu de se croire sur parole.
 *
 * Renvoie { snow, ink, covered } : `snow` porte le RANG de chaque pixel enneigé
 * (1..SNOW_RAMP.length), 0 = pas de neige — un seul tableau pour le masque et
 * son ombrage.
 */
export function roofSnowMask(data, w, h, tune) {
  const T = { ...snowRoofTune, ...(tune || {}) };
  const n = w * h;
  const snow = new Uint8Array(n);
  const op = new Uint8Array(n);
  const L = new Float32Array(n);
  let y0 = h, y1 = -1, ink = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x, o = i * 4;
      L[i] = lum(data[o], data[o + 1], data[o + 2]);
      if (data[o + 3] > 16) {
        op[i] = 1; ink += 1;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (y1 < 0) return { snow, ink: 0, covered: 0 };

  // Pixels de FEU, dilatés d'un cran : une ligne de neige qui EFFLEURE la flamme
  // se lit comme de la neige DANS le feu. Un cran suffit, la rampe de feu est
  // franche (aucun dégradé vers la matière autour).
  const fire = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (!op[i]) continue;
    const o = i * 4;
    if (FIRE.has((data[o] << 16) | (data[o + 1] << 8) | data[o + 2])) fire[i] = 1;
  }
  const blocked = new Uint8Array(fire);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!fire[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) blocked[ny * w + nx] = 1;
        }
      }
    }
  }

  // ── 1. GRAINES : les pixels qui voient le ciel ──────────────────────────────
  // « Rien au-dessus dans la colonne » : la ligne de toit, le faîtage, le haut
  // des cheminées, le bord d'un toit d'annexe qui dépasse. Un seul critère, et
  // GÉOMÉTRIQUE.
  //
  // ⚠ UN SECOND TERME A ÉTÉ ESSAYÉ PUIS RETIRÉ : le « ressaut de luminance »
  // (un pixel nettement plus clair que celui du dessus = une surface éclairée
  // sous une face qui ne l'est pas), censé rattraper les corniches et les toits
  // d'annexe cachés derrière un mur. Mesuré sur les 26 sprites témoins, il
  // apportait 80 % de la charge — parce que la MAÇONNERIE EST HORIZONTALE : un
  // lit de pierres avec son joint sombre au-dessus passe exactement le même
  // test qu'une corniche. Sur planche, façades et colombages étaient constellés
  // de blanc, la maison de pierre en était détruite. Aucun seuil ne sépare les
  // deux familles, elles ont la même signature. Un décroché interne restera donc
  // nu : c'est le prix, il est bien moins cher qu'une ville moisie.
  //
  // On prend TOUTES les entrées de matière de la colonne, pas seulement la
  // première : une arcade, un porche, un beffroi ajouré laissent réapparaître du
  // ciel plus bas, et ce qui se trouve dessous est un toit comme un autre.
  const floorY = y1 - Math.round((y1 - y0 + 1) * T.floorGuard);
  const seedRow = new Int32Array(w * 8).fill(-1);   // jusqu'à 8 graines par colonne
  const seedN = new Uint8Array(w);
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      const i = y * w + x;
      if (!op[i] || (y > 0 && op[i - w]) || blocked[i]) continue;
      if (y > floorY || seedN[x] >= 8) break;
      seedRow[x * 8 + seedN[x]] = y;
      seedN[x] += 1;
    }
  }

  // Graine la plus proche d'une ligne donnée dans une colonne, ou -1.
  const nearSeed = (x, y) => {
    if (x < 0 || x >= w) return -1;
    let best = -1, bd = T.maxJump + 1;
    for (let k = 0; k < seedN[x]; k += 1) {
      const sy = seedRow[x * 8 + k], d = Math.abs(sy - y);
      if (d < bd) { bd = d; best = sy; }
    }
    return best;
  };

  // ── 2. TRI DES GRAINES : où ça tient, et jusqu'où ───────────────────────────
  // Trois questions distinctes, et c'est ce découpage qui fait tout marcher.
  // La NORMALE dit si cette frontière regarde le ciel (un toit) ou si elle longe
  // un flanc (un mur vu de profil). La PROFONDEUR dit s'il y a un bâtiment
  // dessous ou seulement une dalle de sol. La MATIÈRE dit où s'arrête la face,
  // donc jusqu'où la couche a le droit de descendre.
  const inkH = y1 - y0 + 1;
  const maxRun = Math.max(T.thickMin, Math.round(inkH * T.maxRunK));
  const T0 = Math.max(T.thickMin, Math.min(T.thickMax, Math.round(inkH * T.thickK)));
  // Chromaticité : la couleur DÉBARRASSÉE de son ombrage. Deux pixels d'une même
  // tuile, l'un au soleil l'autre à l'ombre, ont la même — c'est justement ce
  // qu'on veut suivre le long d'une face de toit ombrée.
  const chroma = (i) => {
    const o = i * 4;
    const s = data[o] + data[o + 1] + data[o + 2] || 1;
    return [data[o] / s, data[o + 1] / s];
  };
  // Longueur de face RETENUE par graine, -1 = graine rejetée. On la range avant
  // de peindre parce qu'elle doit encore être LISSÉE le long du toit (cf. plus bas).
  // `seedUp` garde le cosinus d'inclinaison de la surface (×1000), qui amincit la
  // couche sur les pentes raides — cf. minBandK.
  const seedRun = new Int32Array(w * 8).fill(-1);
  const seedUp = new Int32Array(w * 8);
  for (let x = 0; x < w; x += 1) {
    for (let k = 0; k < seedN[x]; k += 1) {
      const y = seedRow[x * 8 + k];
      // Normale de la frontière, au Sobel sur l'opacité. `gy > 0` = la matière
      // est en dessous, donc la surface regarde le ciel ; le rapport à |gx| rejette
      // les flancs (cf. le bloc upMin).
      let gx = 0, gy = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          const v = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? 0 : op[ny * w + nx];
          if (!v) continue;
          const wgt = dx && dy ? 1 : 2;
          gx += wgt * dx; gy += wgt * dy;
        }
      }
      if (gy <= 0 || gy < T.upMin * Math.abs(gx)) continue;
      // Cosinus de l'inclinaison : 1 sur une surface plate, 0,89 sur une face
      // iso 2:1, 0,71 à 45°, ~0,45 sur une rive de pignon raide.
      const up = gy / Math.hypot(gx, gy);
      // Crête isolée : ni voisine immédiate à gauche ni à droite → antenne, épi,
      // girouette, pixel d'accroche. Rien.
      if (T.minRun && nearSeed(x - 1, y) < 0 && nearSeed(x + 1, y) < 0) continue;
      // Y a-t-il un BÂTIMENT sous cette surface, ou juste une dalle ? (cf. depthK)
      let depth = 0;
      while (y + depth < h && op[(y + depth) * w + x]) depth += 1;
      if (depth < T.depthK * T0) continue;

      // Descente : longueur de la face sous cette crête.
      let ref = chroma(y * w + x);
      let refL = L[y * w + x], run = 0, reanchored = false;
      while (run < maxRun && y + run < h) {
        const j = (y + run) * w + x;
        if (!op[j] || blocked[j]) break;
        refL = Math.max(refL, L[j]);
        if (run > 0 && L[j] >= T.litF * refL) {      // le vrai noir ne juge pas
          const c = chroma(j);
          if (Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) > T.chroma) {
            if (reanchored || run > T.capMax) break;  // ce n'est plus la faîtière : mur
            ref = c; reanchored = true;
          }
        }
        run += 1;
      }
      seedRun[x * 8 + k] = run;
      seedUp[x * 8 + k] = Math.round(up * 1000);
    }
  }

  // ── 3. LISSAGE LE LONG DU TOIT ──────────────────────────────────────────────
  // ⚠ SANS LUI, LA NEIGE FAIT DES STALACTITES. Chaque colonne mesure sa face
  // toute seule, et un joint de tuiles qui tombe une ligne plus haut ou plus bas
  // change sa longueur du simple au double : peint tel quel, le résultat est un
  // peigne de piques verticales de longueurs aléatoires (vu sur planche, c'est
  // sans appel). Or une couche de neige est une SURFACE : sa butée varie
  // lentement le long du toit. On prend donc un QUANTILE des voisines — un
  // quantile et non une moyenne, pour qu'une colonne aberrante ne tire pas la
  // ligne, et un quantile BAS (0,35) plutôt que la médiane parce que l'erreur
  // coûteuse n'est pas symétrique : une butée trop courte laisse un peu de tuile
  // apparente, une butée trop longue fait couler la neige sur la façade.
  const smooth = new Int32Array(w * 8).fill(-1);
  const buf = [];
  for (let x = 0; x < w; x += 1) {
    for (let k = 0; k < seedN[x]; k += 1) {
      if (seedRun[x * 8 + k] < 0) continue;
      const y = seedRow[x * 8 + k];
      buf.length = 0;
      for (let dx = -T.smoothSpan; dx <= T.smoothSpan; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        for (let kk = 0; kk < seedN[nx]; kk += 1) {
          if (seedRun[nx * 8 + kk] < 0) continue;
          if (Math.abs(seedRow[nx * 8 + kk] - y) > T.maxJump + Math.abs(dx)) continue;
          buf.push(seedRun[nx * 8 + kk]);
        }
      }
      if (!buf.length) continue;
      buf.sort((a, b) => a - b);
      smooth[x * 8 + k] = buf[Math.floor(T.quantile * (buf.length - 1))];
    }
  }

  // ── 4. POSE ─────────────────────────────────────────────────────────────────
  // Plancher de lisibilité : jamais moins que `minBandPx`, et jamais moins de
  // `minBandK` de l'épaisseur nominale. En dessous on ne pose RIEN — c'est la
  // règle « pas de trait blanc ». (Bornée par T0 pour que les petits props, dont
  // l'épaisseur nominale vaut déjà 2 px, ne se retrouvent pas exclus d'office.)
  const minBand = Math.min(T0, Math.max(T.minBandPx, Math.round(T0 * T.minBandK)));
  for (let x = 0; x < w; x += 1) {
    for (let k = 0; k < seedN[x]; k += 1) {
      const run = smooth[x * 8 + k];
      if (run < T.thickMin) continue;
      const y = seedRow[x * 8 + k];
      const up = seedUp[x * 8 + k] / 1000;
      // Régulière, amincie par l'inclinaison, butée par la face.
      const t = Math.min(Math.round(T0 * up * up), run);
      if (t < minBand) continue;
      // ── BORD BAS : là se joue « neige » contre « bande blanche collée » ──────
      // Retour de Raph (2026-08-05) : « ça se voit trop que c'est une bande
      // blanche ajoutée ». Le coupable n'était pas l'épaisseur mais la RÉGULARITÉ
      // du bord bas — une ligne nette à distance constante de l'arête, donc un
      // ruban posé par-dessus le dessin plutôt qu'une matière qui s'y accroche.
      //
      // Deux corrections, et la seconde est celle qui fait tout basculer.
      //
      // 1. Le bord ONDULE, par blocs de quelques colonnes (bruit de valeur figé
      //    sur x). Un bord bruité colonne par colonne ferait un peigne ; par
      //    blocs, il fait des paquets — ce que fait la neige.
      // 2. LA NEIGE TIENT DANS LES CREUX DU DESSIN. Sous le noyau plein, on ne
      //    garde que les pixels que l'auteur a peints SOMBRES : joints de tuiles,
      //    rainures d'ardoise, interstices. Le motif du toit RESSORT donc à
      //    travers la frange, et c'est exactement ce qui distingue une couche
      //    posée sur une matière d'un aplat superposé. Rien n'est inventé : la
      //    frange est dessinée par le sprite lui-même.
      // ⚠ L'effilochage se compte en PIXELS, pas en fraction de la couche. En
      // fraction, une couche mince (toit conique de la hutte, où l'inclinaison
      // rabote déjà l'épaisseur à 3 px) devenait effilochée AUX TROIS QUARTS :
      // plus de calotte, juste du grésil éparpillé sur le chaume. Un bord de
      // neige s'effrange sur deux ou trois pixels, que la couche en fasse
      // quatre ou douze.
      const noise = hash01(x / T.edgeBlock | 0, y);
      const fringe = Math.min(T.fringePx, Math.floor(t / 2));
      const grain = Math.min(T.grainReach, Math.floor(t / 3));
      const core = Math.max(1, t - fringe);
      const edge = Math.min(t, core + Math.round(noise * fringe));
      // Valeur moyenne de la face sous la crête : sert de repère « creux / relief ».
      let mean = 0, mn = 0;
      for (let d = 0; d < t && y + d < h; d += 1) {
        const j = (y + d) * w + x;
        if (!op[j]) break;
        mean += L[j]; mn += 1;
      }
      mean = mn ? mean / mn : 0;
      let last = -1;
      // ⚠ La frange reste DANS la face mesurée : sans ce `run`, les grains
      // descendaient jusqu'à 0,79 de la hauteur d'encre, c'est-à-dire sur le mur.
      const dMax = Math.min(run, edge + grain);
      for (let d = 0; d < dMax; d += 1) {
        const j = (y + d) * w + x;
        if (y + d >= h || !op[j] || blocked[j]) break;   // le lissage peut dépasser la face
        if (d >= edge) {
          // Frange : seuls les CREUX gardent la neige, et de moins en moins loin.
          if (L[j] >= mean) continue;
          if (hash01(x, y + d) > T.grainP * (1 - (d - edge) / (grain + 1))) continue;
        }
        // OMBRAGE : crête éclairée, ventre qui retombe. En PIXELS et non en
        // proportion — un tiers de couche claire sur une couche de 12 px fait
        // trois rangs horizontaux, c'est-à-dire la bande qu'on essaie d'éviter.
        // Une ligne de crête, une ligne de retombée, le reste en corps.
        //
        // Et le RELIEF DE LA MATIÈRE traverse le corps : là où l'auteur a peint
        // un creux (joint de tuile, rainure d'ardoise), la neige prend le ton
        // sombre. Une couverture de neige épouse la tôle qu'elle recouvre, elle
        // ne l'efface pas — c'est ce qui empêche le cœur de la couche de se lire
        // comme un aplat rapporté, et ça ne coûte rien : l'ondulation est déjà
        // dessinée dessous.
        const rank = d === 0 ? 0 : (L[j] < mean * T.reliefF ? SNOW_RAMP.length - 1 : 1);
        if (snow[j] && snow[j] - 1 <= rank) continue;   // déjà posé plus clair
        snow[j] = rank + 1;
        last = d;
      }
      // Retombée : le dernier pixel de la colonne passe au ton sombre, c'est lui
      // qui donne son épaisseur à la couche.
      if (last > 0) {
        const j = (y + last) * w + x;
        snow[j] = SNOW_RAMP.length;
      }
    }
  }

  // ── 5. LUMIÈRE HAUT-GAUCHE ──────────────────────────────────────────────────
  // Même règle que partout ailleurs dans le projet (hue.mjs / light.mjs / le sol
  // d'hiver) : un pixel de neige dont le voisin EST est de la matière non
  // enneigée regarde l'ombre et descend d'un cran. Passe séparée, sinon l'ordre
  // de parcours déciderait du résultat.
  let covered = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!snow[i]) continue;
      covered += 1;
      if (x < w - 1 && op[i + 1] && !snow[i + 1]) {
        snow[i] = Math.min(SNOW_RAMP.length, snow[i] + 1);
      }
    }
  }
  return { snow, ink, covered };
}

/**
 * Écrit la neige d'un sprite. ADDITIVE : `dst` reçoit `src` tel quel, sauf les
 * pixels de neige. L'alpha n'est JAMAIS touché (contrat de silhouette).
 * `src` et `dst` peuvent être le même buffer.
 */
export function applyRoofSnow(src, dst, w, h, tune) {
  const { snow, ink, covered } = roofSnowMask(src, w, h, tune);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    if (dst !== src) {
      dst[o] = src[o]; dst[o + 1] = src[o + 1]; dst[o + 2] = src[o + 2]; dst[o + 3] = src[o + 3];
    }
    if (!snow[i]) continue;
    const c = SNOW_RAMP[snow[i] - 1];
    dst[o] = c[0]; dst[o + 1] = c[1]; dst[o + 2] = c[2];
  }
  return { ink, covered };
}

/* ---------------------------------------------------------------------------
 * CÔTÉ NAVIGATEUR — cuisson paresseuse, une fois par sprite
 * ------------------------------------------------------------------------ */

// SPRITES QUI NE PRENNENT PAS CETTE NEIGE-LÀ.
//
// COSMIQUE (bandes 7-9) : des volumes néon dont l'identité est l'émission. Une
// calotte blanche les éteint, et la doctrine de ces tours est déjà « pas de
// cyan, pas d'orbe lisse » — on ne lui ajoute pas un chapeau. Réversible d'un
// mot : __snowRoofTune({ skipCosmic: false }).
//
// ARBRES de scène (verger, cueilleur) : ce sont des arbres, et un arbre a DÉJÀ
// sa doctrine d'hiver — le quantile de luminance de scripts/snowTrees.mjs, qui
// pose la neige étage par étage sur les faces peintes claires. La règle de toit
// appliquée à une couronne descend dans les trouées du feuillage et rend des
// guirlandes de glaçons (vu sur planche). Les deux règles ne s'échangent pas :
// il faudra passer ces sprites par snowTrees, pas par ici.
const skipKey = (key) => (snowRoofTune.skipCosmic !== false
  && (key.indexOf("-cosmic-") >= 0 || key.indexOf("cosmic-") === 0))
  || /-tree$/.test(key);

const cache = new Map();   // clé -> canvas enneigé, ou null (pas de neige à poser)

// Canvas enneigé d'une IMAGE déjà décodée, aux MÊMES dimensions que la source.
// Renvoie null si rien n'a été posé (sprite exclu, image absente, canvas
// indisponible) — l'appelant blitte alors sa source d'origine, jamais du vide.
export function snowSprite(key, img) {
  if (!snowRoofTune.on || skipKey(key)) return null;
  if (cache.has(key)) return cache.get(key);
  const w = img && (img.naturalWidth || img.width);
  const h = img && (img.naturalHeight || img.height);
  if (!w || !h || typeof document === "undefined") return null;
  let out = null;
  try {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const cx = c.getContext("2d", { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0);
    const im = cx.getImageData(0, 0, w, h);
    const { covered } = applyRoofSnow(im.data, im.data, w, h);
    if (covered > 0) { cx.putImageData(im, 0, 0); out = c; }
  } catch { out = null; }   // garde cross-origin (ne devrait pas arriver, same-origin)
  cache.set(key, out);
  return out;
}

// Enneige un buffer DÉJÀ EN MAIN (habitations : le canvas est teinté et recadré
// sur la bbox avant d'arriver ici, il n'y a pas d'image à relire). Le cache est
// celui de l'appelant, qui connaît sa clé (archétype + teinte).
export function snowImageData(imageData, w, h) {
  if (!snowRoofTune.on) return 0;
  return applyRoofSnow(imageData.data, imageData.data, w, h).covered;
}

// Vidé au changement de réglage : les canvas cuits portent l'ancien réglage.
// Les habitations cuisent LEUR neige dans leur propre cache de teintes (le canvas
// arrive déjà teinté et recadré), qui n'est pas visible d'ici — d'où le crochet :
// sans lui, un tour de molette comparerait deux fois la même image, ce qui est le
// pire résultat possible pour un A/B.
const resetHooks = [];
export function addSnowResetHook(fn) { resetHooks.push(fn); }
export function resetSnowCache() {
  cache.clear();
  for (const fn of resetHooks) fn();
}

if (typeof window !== "undefined") {
  // A/B immédiat — c'est tout l'intérêt d'une passe de runtime : on juge les
  // deux états sans relancer de dérivation.
  window.__snowRoof = (on) => {
    snowRoofTune.on = on !== false;
    resetSnowCache();
    return snowRoofTune.on;
  };
  window.__snowRoofTune = (o = {}) => {
    Object.assign(snowRoofTune, o);
    resetSnowCache();
    return { ...snowRoofTune };
  };
}
