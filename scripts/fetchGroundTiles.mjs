// fetchGroundTiles.mjs — TUILES DE SOL isométriques, lots PixelLab `create_tiles_pro`
//   → public/pixelart/iso/<clé>-<n>.png (4 variantes par matière).
//   Remplace fetchIsoTiles.mjs (create_isometric_tile, 1 tuile par matière).
//   Lancer :  node scripts/fetchGroundTiles.mjs        (filtre : … grass)
//
// POURQUOI CE SCRIPT NORMALISE AU LIEU DE COPIER LE PNG
// ────────────────────────────────────────────────────
// L'ancien jeu de tuiles venait de `create_isometric_tile` : des DALLES EN VOLUME
// (face 2:1 + épaisseur). Le moteur devait mesurer la bbox, masquer la face au
// losange pour couper les faces latérales, puis rogner encore (`insetF`) pour ne
// pas recopier le liseré de dalle — et, à `rep: 2`, redessinait une fenêtre de
// 58×29 dans des sous-losanges de 33×17, soit une réduction ×1,757 en NEAREST.
// Ratio non entier ⇒ grille de pixels détruite : le pavé n'avait plus une seule
// pierre lisible, juste un moucheté. L'art n'était vu à 1:1 à AUCUN zoom.
//
// `create_tiles_pro` en `tile_view: 'top-down'` sort des losanges PLATS, sans
// épaisseur (mesuré : ~0 px hors losange, contre 500 px parasites par dalle
// avant). Le losange y est en 1:1 — c'est une vraie vue de dessus, donc un CARRÉ
// tourné de 45°. L'écraser ×0,5 en y n'est pas une bidouille : c'est exactement
// sa projection iso. On sort donc une tuile 64×32 pleine, blittée 1:1 à zoom 1 :
// le format 2:1 exact déclenche le court-circuit `isoTileIsFlat` du moteur, qui
// la dispense de sous-pavage et d'inset (réservés aux dalles en volume — les
// road-*, pas régénérées).
//
// ÉGALISATION — la variété doit venir du DESSIN, pas de la valeur
// ──────────────────────────────────────────────────────────────
// Mesuré sur le 1er lot : les 4 variantes d'herbe s'écartaient de 24,0 en
// luminance moyenne. Posées au hasard sur la carte, elles ne cassaient pas la
// répétition — elles dessinaient un DAMIER clair/sombre qui souligne la grille,
// donc pire que la tuile unique qu'elles remplacent. (Le pavé, lui, ne s'écartait
// que de 1,1 : le défaut dépend de la matière, il faut le mesurer, pas le
// supposer.) Gain PAR CANAL vers la moyenne médiane du lot : corrige la valeur ET
// la teinte — la luminance seule laissait une variante tirer au jaune, encore
// visible en damier. Ce n'est pas un remap de palette : les teintes PixelLab sont
// conservées (choix de Raphaël), on n'aligne que les variantes ENTRE ELLES.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const OUT = 'public/pixelart/iso';
const FW = 64, FH = 32;            // losange d'une cellule à zoom 1 (TILE=32, cf. projection.js)

// Chaque lot = un appel create_tiles_pro à 16 tuiles, soit 4 matières × 4 variantes.
// Paramètres du lot (à rejouer à l'identique pour compléter une matière) :
//   tile_type 'isometric', tile_size 64, tile_view 'top-down', tile_flat_top_px 2,
//   outline_mode 'segmentation'.  ⚠ NE PAS passer tile_height : accepté puis ignoré,
//   et le lot sort plus sale (bbox 62-63 au lieu de 64, jusqu'à 140 px hors losange).
const LOTS = [
  {
    id: 'b7686c2b-5f6d-4ea2-a1d0-c2b03443dcac', seed: 101,
    mats: [
      // iso-grass : REPRIS par le lot 10d93d03 ci-dessous (l'herbe plate de ce
      // lot était propre mais SANS relief — Raph préfère celle qui « dépasse »).
      { key: 'iso-dirt', tiles: [4, 5, 6, 7] },           // terre sèche + graviers
      { key: 'ground-cobble', tiles: [8, 9, 10, 11] },    // pavés — bandes 2-3
      { key: 'ground-flagstone', tiles: [12, 13, 14, 15] }, // dalles — bandes 4-5
    ],
  },
  // HERBE À RELIEF (Raph 2026-07-28 : « j'aime bien que ça dépasse ») — le lot
  // « natif 2:1 » (tile_view_angle 30 + tile_depth_ratio 0) écarté au pilote est
  // EXACTEMENT celui qu'il a validé en aperçu : brins qui mordent sur les arêtes,
  // creux entre brins où le fond sombre se lit. Deux choses le préservent :
  //   • la source est déjà ~2:1 (bbox 64×32-35) → l'écrasement est quasi nul,
  //     les brins du bord restent dans le losange (tolérance du masque) et le
  //     PEINTRE (rangées nord→sud) fait le chevauchement ;
  //   • `noFill: true` — le rebouchage des trous (fillHoles) remplirait les
  //     creux entre brins et rendrait la tuile PLEINE, donc plate. C'est le fond
  //     (base d'herbe du bake) qui doit se lire dans ces creux.
  {
    id: '10d93d03-e030-4999-9be6-47ed301717be', seed: 101,
    mats: [
      { key: 'iso-grass', tiles: [0, 1, 2, 3], overshoot: true },   // herbe à brins qui DÉBORDENT
    ],
  },
  // ⚠ Lot 2, 3e essai. Les deux premiers (a7c2346f seed 202, e424e615) décrivaient
  // les matières en OBJETS : « slabs », « panels », « paving ». Le modèle dessine
  // alors UN objet par tuile, avec son propre bord — et répété par cellule ce bord
  // trame une grille sur toute la ville (visible d'un coup d'œil sur un pan de 7×7,
  // invisible sur la vignette d'une tuile seule). Le prompt qui marche décrit une
  // TEXTURE CONTINUE : « seamless », « no borders », « no centered feature »,
  // « texture runs off all edges ».
  // ⚠⚠ CE LOT EST RANGÉ PAR COLONNE, les deux autres par rangée. Rien ne le dit
  // dans la réponse de l'API : il faut REGARDER la planche. Groupé comme les
  // autres ([0,1,2,3] = 1re matière), on égalise quatre matières DIFFÉRENTES
  // entre elles — et l'égalisation, docile, les aplatit toutes les quatre en gris
  // neutre. C'est la garde `spread` ci-dessous qui attrape ça, pas l'œil.
  {
    id: '50c1b9f1-dbfc-4d8e-99c3-5ac0c95aadce', seed: 303,
    mats: [
      { key: 'iso-plaza', tiles: [0, 4, 8, 12] },         // dallage de place
      // ground-earth : REPRIS par le lot a72bcb99 ci-dessous (« le sol stade 0
      // est trop foncé », Raph 2026-07-28 — celui-ci sortait à lum ~57).
      { key: 'ground-concrete', tiles: [2, 6, 10, 14] },  // béton — bande 6
      { key: 'ground-tech', tiles: [3, 7, 11, 15] },      // dalles tech — bandes 7+
    ],
  },
  // Terre battue CLAIRE (seed 606, rangé PAR COLONNE — mesuré : écarts 1-8 par
  // colonne, 33-40 par rangée). Colonne 1 (ocre, graviers fins) retenue : ton
  // [174,124,75], dans la famille de l'ancien aplat [150,130,100], distincte du
  // sentier road-dirt [116,79,55]. ⚠ derim OBLIGATOIRE sur ce lot : liseré de
  // dalle cuit dans l'art malgré le prompt (cf. derim ci-dessus).
  {
    id: 'a72bcb99-f1e8-4841-b5e2-2eea066c71de', seed: 606,
    mats: [
      { key: 'ground-earth', tiles: [1, 5, 9, 13], derim: true },   // terre battue — bandes 0-1
    ],
  },
  // PARVIS DES MERVEILLES (Raph 2026-07-28 : « je veux une génération pixel lab »
  // pour les sols de merveilles) — MOSAÏQUE ocre et blanche, la seule matière du
  // jeu qui ne puisse se confondre ni avec le sol urbain ni avec le dallage de
  // place (iso-plaza), et qui dit « bâtiment important » sans qu'on l'explique.
  // Lot rangé PAR RANGÉE (mesuré : 7-17 d'écart par rangée, 157-175 par colonne).
  //
  // ⚠ 1er jet JETÉ (lot c7e3c951) : le prompt décrivait les matières en phrases
  // longues et décorées (« polished cream white marble paving, fine grey veining,
  // tight thin joints, subtle sheen ») et NUMÉROTAIT les 16 tuiles. Le modèle a
  // rendu 16 OBJETS — des dalles en volume, avec leur liseré et, pour le grès,
  // un cadre à médaillon centré. Exactement le piège déjà écrit en tête du lot 2.
  // Le prompt qui marche est celui du lot 50c1b9f1, au mot près : le préambule
  // « seamless continuous ground textures, no borders, no frames, no centered
  // feature, texture runs off all edges », puis QUATRE matières décrites en trois
  // mots (« many small square tiles in a regular grid »). C'est le nombre d'items
  // qui fixe le nombre de MATIÈRES ; les 4 variantes viennent toutes seules.
  //
  // ⚠⚠ LE PARVIS EST LE SEUL SOL À JUGER AU PAN, PAS À LA PLANCHE. C'est le seul
  // endroit du jeu où une matière couvre un carré PLEIN (15×15 cellules au rang V)
  // au lieu de cellules éparses. Les 4 rangées du lot ont été normalisées et
  // panées à 7×7 (scripts/tilePan.mjs) avant de choisir :
  //   • rangée 1, marbre crème à JOINTS D'OR — la plus belle en vignette, la pire
  //     au pan : la grille de carreaux est CONTINUE dans la tuile mais s'arrête
  //     net au bord de cellule, et le raccord raté se lit comme un patchwork.
  //     Un motif régulier ne survit pas au blit par cellule, quoi qu'on égalise.
  //   • rangée 0, marbre veiné — grandes veines = grandes taches, damier franc.
  //   • rangée 3, porphyre sombre — le plus propre au pan (mouchetis fin et
  //     isotrope, la cellule disparaît) mais un carré NOIR de 15×15 dans une
  //     ville claire. Gardé en réserve.
  //   • rangée 2, MOSAÏQUE — retenue. Les tesselles sont assez fines pour que le
  //     raccord ne saute pas aux yeux, et le motif par cellule se lit comme un
  //     PANNEAU de mosaïque : un vrai sol d'apparat antique est fait de panneaux
  //     répétés, donc la période de la grille devient une intention, pas un défaut.
  //     C'est la seule des quatre où « la cellule se voit » n'est pas un grief.
  {
    id: '675befa7-6736-4dcc-81a2-5c0e9778949e', seed: 909,
    mats: [
      { key: 'iso-wonder', tiles: [12, 13, 14, 15], equalize: true },   // porphyre sombre (essai Raph)
    ],
  },
  // DALLAGE DE PLACE PAR ÈRE (Raph 2026-07-30 : « je veux des sprites de dalles,
  // pas de traits ») — APPAREILLAGE EN ARCS, le pavage en queue de paon des vraies
  // places. Il répond au « rayonnant » demandé sans qu'aucun trait ne soit tracé
  // à la volée : le rayonnement est CUIT dans la matière.
  //
  // ⚠ Pourquoi ce motif-là et pas une grille : le parvis des merveilles a déjà
  // montré (2026-07-28) qu'un motif RÉGULIER meurt au blit par cellule — la
  // grille est continue dans la tuile et s'arrête net au bord, le raccord se lit
  // comme un patchwork. Les arcs sont courbes et courts : aucun alignement
  // franc ne traverse la cellule, il n'y a donc rien qui puisse « rater ».
  //
  // ⚠⚠ `equalize` sur les TROIS : une place composée fait de 3×3 à 8×8 cellules,
  // c'est le second endroit du jeu (avec le parvis) où une matière couvre un
  // carré PLEIN. Le damier clair/sombre entre variantes, tolérable sur des
  // cellules éparses, y devient le motif dominant. Ce qui doit varier d'une
  // cellule à l'autre est le DESSIN seul.
  //
  // Lot rangé PAR RANGÉE (mesuré : 52,8 d'écart moyen par rangée contre 91,0 par
  // colonne). SEULE la rangée du calcaire a survécu au pan — ses trois voisines
  // (petits pavés de granit, dalles grises, dalles de béton) y montraient la
  // grille et sont reprises par le lot a372e6e6 plus bas.
  {
    id: 'e09816ea-1c6f-4377-a482-1bdfb7acbceb', seed: 1101,
    mats: [
      { key: 'iso-plaza-antique', tiles: [0, 1, 2, 3], equalize: true },   // calcaire crème, joints ocre
    ],
  },
  // Industrielle — pavé de basalte SUIÉ. Rangée 0 (basalte pur, lum ~30) écartée :
  // le parvis des merveilles avait déjà tranché la question, un carré noir de
  // plusieurs cellules dans une ville claire ne se lit pas comme un sol.
  // ⚠ Ce lot est sorti en OCTOGONES (pointes du losange rognées d'~8 px) : c'est
  // normalize() qui rétablit le losange, et le journal doit annoncer 100 %.
  {
    id: 'e3a906a5-87a7-4682-94e9-eb3208a6519b', seed: 1303,
    mats: [
      { key: 'iso-plaza-industrial', tiles: [4, 5, 6, 7], equalize: true },
    ],
  },
  // Reprise du médiéval, du moderne et de la cosmique — LE MOT EST « COBBLES ».
  // Le 1er lot avait « setts » (médiéval) et « pavers » (moderne) : au PAN, les
  // premiers donnaient du bruit et les seconds une grille franche, parce que
  // l'éventail de chaque tuile converge au même point et que cette convergence
  // se répète en réseau dès que les pierres sont assez grosses pour la montrer.
  // Des cobbles petits et irréguliers noient la convergence — c'est exactement
  // ce qui faisait passer la rangée calcaire du 1er lot. Le grief n'est PAS la
  // couleur ni le style : c'est la TAILLE de la pierre par rapport à la cellule.
  {
    id: 'a372e6e6-7f98-46f6-9edc-8436fb40f29c', seed: 1505,
    mats: [
      { key: 'iso-plaza-medieval', tiles: [0, 1, 2, 3], equalize: true },  // granit gris
      // ⚠ tuile 9 ÉCARTÉE au pan : elle porte une tache claire beige au centre de
      // son éventail. Invisible sur la planche (18,5 d'écart de luminance, sous la
      // garde), elle CONSTELLAIT la place de points brillants sur le réseau des
      // variantes. Une seule variante tachée suffit à trahir la grille.
      { key: 'iso-plaza-modern', tiles: [8, 10, 11], equalize: true },     // pavé gris clair
      { key: 'iso-plaza-cosmic', tiles: [12, 13, 14, 15], equalize: true }, // marbre blanc, joints ambrés
    ],
  },
  // CHAUSSÉES (Raph 2026-07-28 : « des chemins/routes plutôt que cette route à
  // toutes les ères ») — même recette texture. Consommées par le ruban de
  // chaussée (ROAD_MATS/ROAD_DETAIL.tiles), clippées au tracé.
  // ⚠⚠ Lot rangé PAR COLONNE (vérifié sur la planche) — et la garde d'écart ne
  // l'a PAS vu : mélanger 4 matières par clé donne ~53 d'écart interne (< 60)
  // mais surtout QUATRE TONS MOYENS IDENTIQUES (~[104,90,78]), puisque chaque
  // clé reçoit le même mélange. C'est la garde « matières trop proches » qui
  // attrape ce cas, cf. plus bas.
  {
    id: '514e0cfd-f84d-44c3-92f6-311833b8dcde', seed: 404,
    mats: [
      { key: 'road-dirt', tiles: [0, 4, 8, 12] },         // sentier — bandes 0-1
      { key: 'road-cobble', tiles: [1, 5, 9, 13] },       // rue pavée — bandes 2-3
      { key: 'road-stone', tiles: [2, 6, 10, 14] },       // voie dallée — bandes 4-5
      { key: 'road-asphalt', tiles: [3, 7, 11, 15] },     // asphalte — bande 6
    ],
  },
  {
    id: 'fd9b156e-02c9-4e2e-8e72-13f13cf8a262', seed: 505,
    mats: [
      { key: 'road-tech', tiles: [0, 1, 2, 3] },          // voie tech — bandes 7+
      // rangées 2-4 (béton clair / gravier / sable) : réserves non câblées
    ],
  },
  // JEU D'HIVER (Raph 2026-07-28 : sprites dédiés après suppression du liseré et
  // des mottes procéduraux qui clignotaient au pan) — neige cuite dans l'art,
  // consommée par ISO_TILE_WINTER quand CM.season est l'hiver.
  // Herbe : même recette ang30 que l'été (les 4 prompts échelonnent la
  // couverture de neige — si le lot est rangé par colonne, [0,1,2,3] mélange les
  // niveaux, ce qui fait un patchwork encore meilleur ; regarder la planche).
  // ⚠ Rangée 0 (tuiles 0-3) DIFFORME (losanges partiels 53-61 px, la garde
  // anti-rééchantillonnage l'a rejetée). Retenues à l'œil sur la planche :
  // 10-13 = congères + herbe visible, même famille sombre, couvertures variées.
  {
    id: '34e3e8ab-67f3-442a-9041-e3679cbb77e1', seed: 707,
    mats: [
      // spreadMax 110 : l'écart de luminance entre ces 4 variantes (79,7) est
      // VOULU — c'est la couverture de neige qui varie d'une cellule à l'autre
      // (congères au niveau de la tuile), pas un lot mal groupé. Choix à l'œil
      // sur la planche, pas un groupement aveugle : la garde 1 reste utile pour
      // les autres matières.
      { key: 'iso-grass-winter', tiles: [10, 11, 12, 13], overshoot: true, spreadMax: 110 },
    ],
  },
  // ⚠ Rangé PAR RANGÉE (garde 2 l'a prouvé sur ma 1re hypothèse colonne : les 4
  // « matières » sortaient au même ton à ±4,9) — et l'ordre des rangées ne suit
  // PAS le prompt : béton en rangée 0, pavés en 1, terre en 2, dalles en 3.
  {
    id: 'bf0d58b3-0cd9-489a-b51f-7b4dc2fdd82e', seed: 808,
    mats: [
      { key: 'ground-concrete-winter', tiles: [0, 1, 2, 3] },     // béton + voile de neige
      { key: 'ground-cobble-winter', tiles: [4, 5, 6, 7] },       // pavés + neige aux joints
      { key: 'ground-earth-winter', tiles: [8, 9, 10, 11] },      // terre + plaques
      { key: 'ground-flagstone-winter', tiles: [12, 13, 14, 15] }, // dalles + plaques
    ],
  },
];
const BUCKET = 'https://backblaze.pixellab.ai/file/pixellab-tiles/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const FILTER = process.argv[2] || '';

/* ── géométrie : LA MÊME que le moteur (isoRenderer.js `isoFaceKeeps`) ────────
 * Recopier la formule ici serait tentant, mais c'est le masque du sol : s'il
 * diverge d'un demi-pixel, les losanges se recouvrent ou laissent un interstice.
 * tol = 0.75 comme le moteur — les voisins se mordent d'un cheveu. */
const keeps = (x, y, fw, fh, tol = 0.75) => {
  const cx = fw / 2, cy = fh / 2;
  return Math.abs(x + 0.5 - cx) / cx + Math.abs(y + 0.5 - cy) / cy <= 1 + tol / cx;
};

function bboxOf(p) {
  const { width: w, height: h, data: d } = p;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (d[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('tuile entièrement transparente');
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Contenu de la bbox → losange 64×32 masqué. NEAREST : la moyenne de boîte
// lisserait mieux les joints mais fabriquerait des teintes hors palette.
//
// Le losange doit ressortir PLEIN. La pointe du losange source est parfois
// émoussée d'un ou deux pixels (le modèle ne remplit pas toujours jusqu'à
// l'angle) : recopiés tels quels, ces trous laissent voir l'aplat de la cellule
// et dessinent une résille sur les arêtes — mesuré 6,2 % du losange manquant sur
// les dalles. On les rebouche par dilatation depuis le voisin opaque le plus
// proche, à l'intérieur du masque seulement.
// noFill : garde les pixels transparents DANS le losange (creux entre brins
// d'herbe) au lieu de les reboucher — le fond du bake s'y lit, c'est le relief.
function normalize(p, noFill = false) {
  const bb = bboxOf(p);
  const out = new PNG({ width: FW, height: FH });
  for (let y = 0; y < FH; y += 1) for (let x = 0; x < FW; x += 1) {
    const di = (y * FW + x) * 4;
    if (!keeps(x, y, FW, FH)) { out.data[di + 3] = 0; continue; }
    const sx = Math.min(p.width - 1, bb.x0 + Math.floor(x * bb.w / FW));
    const sy = Math.min(p.height - 1, bb.y0 + Math.floor(y * bb.h / FH));
    const si = (sy * p.width + sx) * 4;
    out.data[di] = p.data[si]; out.data[di + 1] = p.data[si + 1];
    out.data[di + 2] = p.data[si + 2]; out.data[di + 3] = p.data[si + 3];
  }
  if (!noFill) fillHoles(out);
  return out;
}

// DÉBORD EN PERSPECTIVE (Raph 2026-07-28 : « les tuiles d'herbe respectent la
// perspective : au sud du sol, elles passent devant ») — sortie 64×(32+OV), SANS
// rééchantillonnage : le losange source (déjà natif ~2:1, ancré au BAS de la
// bbox) occupe les 32 dernières lignes, et les OV lignes de brins au-dessus du
// coin nord sont GARDÉES. Le moteur blitte ces lignes en plus au-dessus du coin
// nord de la cellule ; comme le bake balaie nord→sud, elles recouvrent le voisin
// du nord — sol compris. Masque : moitié BASSE hors losange coupée (elle
// mordrait sur des voisins peints APRÈS nous) ; moitié HAUTE gardée entière
// (brins au-dessus des arêtes NO/NE — c'est le débord). Jamais de fillHoles.
function normalizeOvershoot(p) {
  const bb = bboxOf(p);
  if (bb.w !== FW) throw new Error(`overshoot : bbox ${bb.w}px, attendu ${FW} (pas de rééchantillonnage ici)`);
  const OV = Math.max(0, Math.min(12, bb.h - FH));
  const H = FH + OV;
  const out = new PNG({ width: FW, height: H });
  const inDiamond = new Uint8Array(FW * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < FW; x += 1) {
    const di = (y * FW + x) * 4;
    const sy = bb.y0 + (bb.h - H) + y;              // ancrage BAS : dernière ligne = pointe sud
    if (sy < 0 || sy >= p.height) continue;
    const si = (sy * p.width + x + bb.x0) * 4;
    const yD = y - OV;                              // ligne dans le repère du losange
    const inD = yD >= 0 && keeps(x, yD, FW, FH);
    if (inD) inDiamond[y * FW + x] = 1;
    const upper = y < OV + FH / 2;                  // moitié haute : débord permis
    if (!inD && !upper) continue;                   // hors losange en moitié basse : coupé
    out.data[di] = p.data[si]; out.data[di + 1] = p.data[si + 1];
    out.data[di + 2] = p.data[si + 2]; out.data[di + 3] = p.data[si + 3];
  }
  // FRAGMENTS FANTÔMES : sur les lots à fort débord (hiver), le modèle dessine
  // parfois la POINTE d'un voisin imaginaire — un îlot opaque au-dessus du
  // losange, non relié au contenu. Blitté tel quel il flotterait sur la cellule
  // du nord. On ne garde du débord que ce qui est 8-CONNEXE au losange.
  const seen = new Uint8Array(FW * H);
  const stack = [];
  for (let i = 0; i < FW * H; i += 1) {
    if (inDiamond[i] && out.data[i * 4 + 3] > 16) { seen[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % FW, y = (i / FW) | 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= FW || ny >= H) continue;
      const j = ny * FW + nx;
      if (seen[j] || out.data[j * 4 + 3] <= 16) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  let ghosts = 0;
  for (let i = 0; i < FW * H; i += 1) {
    if (out.data[i * 4 + 3] > 16 && !seen[i] && !inDiamond[i]) { out.data[i * 4 + 3] = 0; ghosts += 1; }
  }
  if (ghosts) console.log(`   (débord : ${ghosts} px de fragments fantômes effacés)`);
  return out;
}

// Rebouche les pixels transparents DANS le losange par dilatation depuis le
// voisin opaque le plus proche (cf. le commentaire de normalize).
function fillHoles(out) {
  for (let pass = 0; pass < 4; pass += 1) {
    let filled = 0;
    const snap = Uint8Array.from(out.data);
    for (let y = 0; y < FH; y += 1) for (let x = 0; x < FW; x += 1) {
      const di = (y * FW + x) * 4;
      if (snap[di + 3] >= 16 || !keeps(x, y, FW, FH)) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue;
        const ni = (ny * FW + nx) * 4;
        if (snap[ni + 3] < 16) continue;
        out.data[di] = snap[ni]; out.data[di + 1] = snap[ni + 1];
        out.data[di + 2] = snap[ni + 2]; out.data[di + 3] = 255;
        filled += 1;
        break;
      }
    }
    if (!filled) break;
  }
  return out;
}

// DÉ-LISERAGE (opt-in par matière : `derim: true`). Certains lots cuisent un
// liseré de dalle sombre le long des arêtes basses MALGRÉ le prompt « seamless,
// no borders » (vu sur le lot terre a72bcb99 : les 4 candidates, grille franche
// sur le pan 7×7). Répété par cellule, ce liseré retrace la grille — le défaut
// même qui a fait jeter les dalles en volume. On le retire au pipeline : dans la
// BANDE DE BORD du losange (~3 px), tout pixel nettement plus sombre que la
// médiane de la matière est traité comme un trou puis rebouché par l'intérieur
// (fillHoles). L'intérieur reste 1:1 intact. OPT-IN seulement : sur le pavé ou
// la dalle, les joints sombres au bord sont LÉGITIMES — appliqué en aveugle, ce
// filtre les mangerait.
function derim(p) {
  const lums = [];
  for (let y = 0; y < FH; y += 1) for (let x = 0; x < FW; x += 1) {
    const i = (y * FW + x) * 4;
    if (p.data[i + 3] < 128 || !keeps(x, y, FW, FH, -7)) continue;   // intérieur seul
    lums.push(0.299 * p.data[i] + 0.587 * p.data[i + 1] + 0.114 * p.data[i + 2]);
  }
  if (!lums.length) return p;
  const med = lums.sort((a, b) => a - b)[lums.length >> 1];
  let cut = 0;
  for (let y = 0; y < FH; y += 1) for (let x = 0; x < FW; x += 1) {
    const i = (y * FW + x) * 4;
    if (p.data[i + 3] < 16) continue;
    if (keeps(x, y, FW, FH, -7)) continue;                            // bande de bord seule
    const l = 0.299 * p.data[i] + 0.587 * p.data[i + 1] + 0.114 * p.data[i + 2];
    if (l < med * 0.8) { p.data[i + 3] = 0; cut += 1; }
  }
  if (cut) fillHoles(p);
  return p;
}

const meanRGB = (p) => {
  const s = [0, 0, 0]; let n = 0;
  for (let i = 0; i < p.width * p.height; i += 1) {
    if (p.data[i * 4 + 3] < 128) continue;
    for (let c = 0; c < 3; c += 1) s[c] += p.data[i * 4 + c];
    n += 1;
  }
  return n ? s.map((v) => v / n) : [0, 0, 0];
};
const lum = (m) => 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];

// ITÉRÉ. Un seul passage ne suffit pas : le gain est borné (une variante trop
// écartée ne rejoint pas la cible en un coup) et l'écrêtage à 255 mange une
// partie du gain sur les tuiles claires. Mesuré sur la terre battue : 38,8
// d'écart avant, 10,25 encore après UN passage — alors que le script annonçait
// « → 0 » en dur, sans le mesurer. Le journal ment moins vite que le code : on
// renvoie l'écart CONSTATÉ, et c'est lui qui est affiché.
function equalize(tiles) {
  let target = null;
  for (let pass = 0; pass < 6; pass += 1) {
    const M = tiles.map(meanRGB);
    target = [0, 1, 2].map((c) => [...M.map((m) => m[c])].sort((a, b) => a - b)[M.length >> 1]);
    let moved = 0;
    tiles.forEach((p, i) => {
      const g = [0, 1, 2].map((c) => Math.max(0.5, Math.min(2, target[c] / (M[i][c] || 1))));
      if (g.every((v) => Math.abs(v - 1) < 0.002)) return;
      moved += 1;
      for (let k = 0; k < p.width * p.height; k += 1) {
        if (p.data[k * 4 + 3] < 8) continue;
        for (let c = 0; c < 3; c += 1) p.data[k * 4 + c] = Math.max(0, Math.min(255, Math.round(p.data[k * 4 + c] * g[c])));
      }
    });
    if (!moved) break;
  }
  return target;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
async function grab(url) {
  for (let i = 0; i < 30; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 300 && b.subarray(0, 4).equals(PNG_SIG)) return b;
      }
    } catch { /* pas prêt */ }
    await new Promise((r) => setTimeout(r, 8000));
  }
  return null;
}

fs.mkdirSync(OUT, { recursive: true });
const tones = [];
for (const lot of LOTS) {
  // 1er passage : tout télécharger et MESURER, n'écrire qu'après les gardes —
  // les deux fautes de groupement vues en vrai s'attrapent à deux échelles.
  const batch = [];
  for (const mat of lot.mats) {
    if (FILTER && !mat.key.includes(FILTER)) continue;
    const tiles = [];
    let missing = false;
    for (const t of mat.tiles) {
      const buf = await grab(`${BUCKET}/${lot.id}/tile_${t}.png`);
      if (!buf) { console.warn(mat.key, `— tile_${t} indisponible (lot pas prêt ?), matière ignorée`); missing = true; break; }
      const src = PNG.sync.read(buf);
      const tile = mat.overshoot ? normalizeOvershoot(src) : normalize(src, !!mat.noFill);
      tiles.push(mat.derim ? derim(tile) : tile);
    }
    if (!missing) batch.push({ mat, tiles, mean: null, spread: 0 });
  }
  let lotBad = false;
  for (const b of batch) {
    const before = b.tiles.map((p) => lum(meanRGB(p)));
    b.spread = Math.max(...before) - Math.min(...before);
    b.mean = [0, 1, 2].map((c) => b.tiles.reduce((a, p) => a + meanRGB(p)[c], 0) / b.tiles.length);
    // GARDE 1 (par matière) : au-delà de ~60 d'écart de luminance entre les 4
    // tuiles, ce ne sont pas des variantes mais des matières DIFFÉRENTES →
    // indices `tiles` faux. Mesuré : 1 à 53 sur de vraies variantes, 149 à 194
    // sur le lot 50c1b9f1 mal groupé. `spreadMax` par matière relève le seuil
    // quand l'écart est un CHOIX (couverture de neige variable de l'herbe
    // d'hiver) — réservé aux quartets choisis à l'œil sur la planche.
    if (b.spread > (b.mat.spreadMax || 60)) {
      console.error(`${b.mat.key} — ÉCART DE LUMINANCE ${b.spread.toFixed(1)} entre les 4 tuiles`
        + ` [${b.mat.tiles.join(', ')}] : ce ne sont pas des variantes d'une même matière.`);
      lotBad = true;
    }
  }
  // GARDE 2 (par lot) : des matières VOULUES DIFFÉRENTES qui sortent avec le
  // MÊME ton moyen = chaque clé a reçu le même mélange, donc groupement inversé.
  // C'est le cas qui passe SOUS la garde 1 : le lot 514e0cfd mal groupé donnait
  // ~53 d'écart interne (< 60) mais quatre tons moyens à ±4 l'un de l'autre —
  // alors que sentier/pavé/dalle/asphalte bien groupés s'écartent de 40 à 100.
  if (batch.length >= 2) {
    let maxPair = 0;
    for (let i = 0; i < batch.length; i += 1) for (let j = i + 1; j < batch.length; j += 1) {
      const d = Math.hypot(...[0, 1, 2].map((c) => batch[i].mean[c] - batch[j].mean[c]));
      if (d > maxPair) maxPair = d;
    }
    if (maxPair < 25) {
      console.error(`lot ${lot.id.slice(0, 8)} — les ${batch.length} matières ont le même ton moyen`
        + ` (écart max ${maxPair.toFixed(1)}) : groupement rangée/colonne inversé. Regarder la planche.`);
      lotBad = true;
    }
  }
  if (lotBad) { console.error(`lot ${lot.id.slice(0, 8)} — RIEN ÉCRIT.`); process.exitCode = 2; continue; }
  for (const { mat, tiles, spread } of batch) {
    // BRUTES PAR DÉFAUT (Raph 2026-07-28 : « oublie la palette maîtresse pour
    // l'instant ») : l'égalisation ramenait les variantes au même ton et rendait
    // le sol « pareil qu'avant, voire pire » — les écarts clair/sombre entre
    // variantes SONT le patchwork voulu. `--equalize` la réactive au besoin.
    //
    // …SAUF POUR UN SOL FORMEL, où c'est l'inverse (`equalize: true` par matière).
    // Le patchwork est tolérable tant qu'une matière couvre des cellules
    // ÉPARSES : une place fait 2-3 cellules, personne ne lit le damier. Le PARVIS
    // d'une merveille est le seul endroit du jeu où une matière couvre un carré
    // PLEIN de 15×15 — le damier de valeur y devient le motif dominant (vérifié
    // au pan 7×7 : iso-plaza, déjà en service, l'a aussi ; il ne se voyait
    // simplement nulle part). Sur un dallage d'apparat, ce qui doit varier d'une
    // cellule à l'autre est le DESSIN seul — la règle déjà écrite en tête de ce
    // fichier, appliquée là où elle mord.
    const target = (mat.equalize || process.argv.includes('--equalize')) ? equalize(tiles)
      : [0, 1, 2].map((c) => tiles.reduce((a, p) => a + meanRGB(p)[c], 0) / tiles.length);
    const after = tiles.map((p) => lum(meanRGB(p)));
    const rest = Math.max(...after) - Math.min(...after);
    tiles.forEach((p, i) => fs.writeFileSync(`${OUT}/${mat.key}-${i + 1}.png`, PNG.sync.write(p)));
    // La 1re variante sert aussi de tuile de base : tout chemin qui demande encore
    // `<clé>.png` (sauvegarde d'un ancien build, outil hors jeu) reste servi.
    fs.writeFileSync(`${OUT}/${mat.key}.png`, PNG.sync.write(tiles[0]));
    tones.push([mat.key, target.map(Math.round)]);
    const fill = tiles.map((p) => {
      const OV = p.height - FH;                    // 0 sauf herbe à débord
      let o = 0, ins = 0;
      for (let y = 0; y < FH; y += 1) for (let x = 0; x < FW; x += 1) {
        if (!keeps(x, y, FW, FH)) continue;
        ins += 1;
        if (p.data[((y + OV) * FW + x) * 4 + 3] > 16) o += 1;
      }
      return o / ins;
    });
    // Le NOMBRE de variantes est celui de `mat.tiles`, pas 4 en dur : une matière
    // peut n'en retenir que trois (cf. iso-wonder, tuile hors famille écartée) et
    // le journal annonçait « 4 variantes » quoi qu'il arrive.
    console.log(`${mat.key.padEnd(17)} ${tiles.length} variantes — écart de luminance ${rest.toFixed(1)}`
      + ` (brut ${spread.toFixed(1)}), losange rempli ${(100 * Math.min(...fill)).toFixed(1)} %,`
      + ` ton [${target.map(Math.round).join(', ')}]`);
  }
}
if (tones.length) {
  console.log('\n── tons moyens à reporter dans isoRenderer.js (aplat de repli + LOD lointain) ──');
  for (const [k, t] of tones) console.log(`  ${k}: [${t.join(', ')}]`);
}
