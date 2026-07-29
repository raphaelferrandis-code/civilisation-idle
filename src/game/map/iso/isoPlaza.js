"use strict";
// ============================================================================
// isoPlaza.js — LA PLACE COMPOSÉE (vue iso).
//
//   POURQUOI CE FICHIER EXISTE. La place iso était UNE SEULE image
//   (/pixelart/iso/plaza-<ère>.png, ~307×179) ÉTIRÉE sur toute l'emprise de la
//   place (4×4 à 5×5 cellules, cf. cityPlan.buildPlazas). Conséquence
//   mécanique : le rapport banc/fontaine/dallage est CUIT dans le PNG, donc un
//   banc grossit avec la place. Sur une place 5×5 il finissait aussi large
//   qu'une maison. Aucun facteur d'échelle ne répare ça — rapetisser la scène
//   rapetisse la fontaine d'autant. Et PixelLab plafonne à 400×400 : une place
//   monolithique ne peut pas dépasser ~2,5 cellules sans perdre sa densité.
//
//   LA RÈGLE QUI EN DÉCOULE, ET QUI EST TOUT L'INTÉRÊT DU FICHIER :
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ un prop se dimensionne en fraction de TUILE (hT), jamais en         │
//   │ fraction de la place. Sa taille écran = hT × TILE × zoom.           │
//   └─────────────────────────────────────────────────────────────────────┘
//   Une place peut alors passer à 7×7 sans qu'un banc grossisse d'un pixel.
//   Le test isoPlaza.test.js VERROUILLE cet invariant (il compare à des px
//   ATTENDUS EN DUR, pas à la formule qu'il teste).
//
//   CE QU'IL CONTIENT. Un modèle DÉCLARATIF : la boîte de la place est
//   découpée en cellules, chaque cellule reçoit un RÔLE (coin / bord / cœur),
//   et une RECETTE par ère dit quoi poser sur chaque rôle, avec probabilité et
//   hauteur. Le placement est déterministe par cellule (hash), donc stable
//   entre frames — piège n°1 des places : re-tirer par frame = scintillement.
//   Le rendu ne fait qu'exécuter la recette ; TOUT le réglage est dans RECIPES
//   et PLAZA_TUNE, pas dans du code de dessin.
//
//   COMMENT ITÉRER (molette console, cf. docs/PLACES-ISO-COMPOSEES.md) :
//     __plaza()                        → l'état courant
//     __plaza({ mode:'scene' })        → revient à l'ancien PNG (A/B immédiat)
//     __plaza({ propScale: 1.3 })      → tout le mobilier ×1,3
//     __plaza({ hT:{ bench:0.6 } })    → un seul prop
//     __plaza({ density: 0.5 })        → moitié moins garni
//     __plaza({ grid: true })          → rôles des cellules + empreintes
//     __plaza({ ruler: true })         → étalon de taille posé sur la place
//     __plaza({ only: 'bench' })       → n'affiche qu'un prop (jugement d'art)
//     __plaza({ seed: 3 })             → autre tirage, même ville
//
//   ART. /pixelart/iso/plaza/<prop>-<ère>.png (3/4 top-down, fond
//   transparent, lumière haut-gauche, palette de l'ère). Tant qu'un sprite iso
//   manque, on retombe sur le kit top-down legacy (/pixelart/plazas/, 60
//   sprites déjà produits) puis sur un GABARIT plat — de sorte que la
//   COMPOSITION se juge avant que l'art existe.
//
//   Ce module ne dépend PAS de isoRenderer (il serait circulaire) : il ne lit
//   que CM/cmHash, la projection et le calque de lumière.
// ============================================================================

import { CM, cmHash } from '../layout.js';
import { AGENT_SCALE } from '../agents.js';
import { worldToScreen, depthOf } from './projection.js';
import { lightCutImage } from '../lightLayer.js';

// ── ÉCHELLE DE RÉFÉRENCE ────────────────────────────────────────────────────
// Unité : hT = HAUTEUR ÉCRAN du sprite en tuiles (1 tuile = TILE × zoom px).
// Repères mesurés sur le rendu, à garder en tête en réglant les recettes :
//   • une cellule fait 2 tuiles de LARGE à l'écran (losange 64z × 32z px) ;
//   • une maison 1×1 est dessinée à 0.78 cellule de large, soit ≈ 2.05 de hT
//     (sprite 64×84 tiré à 50z px de large) → HOUSE_HT ci-dessous ;
//   • donc « moitié d'une maison » = hT 1.0, « quart » = hT 0.5.
// `houseF(x)` = « x maison ». Sert encore de repère de lecture et à borner le
// mobilier par le haut (aucun prop ne doit atteindre la masse d'un bâtiment).
// ⚠ Mais ce n'est PLUS l'ancre du mobilier : voir « ÉCHELLE DU CORPS » juste
// après. J'avais ancré tout le mobilier ici pour ne pas dépendre d'AGENT_SCALE,
// une molette vivante — et c'était l'erreur : quand les habitants ont rapetissé,
// le mobilier est resté et la place a enflé.
const HOUSE_HT = 2.05;
const houseF = (f) => +(HOUSE_HT * f).toFixed(3);

// ── ÉCHELLE DU CORPS — c'est elle qui commande le MOBILIER ──────────────────
// Retour Raph 2026-07-29, après avoir rapetissé les habitants : « ça fait
// toujours des places géantes ; ça permet de réduire la taille des éléments qui
// s'y trouvent pour en mettre plus ».
//
// J'avais ancré tout le mobilier sur la MAISON, exprès, parce qu'AGENT_SCALE
// était une molette qu'une autre session réglait. C'était le mauvais choix : un
// banc n'est pas dimensionné par le bâtiment derrière lui, il est dimensionné
// par LE CORPS QUI S'Y ASSOIT. Quand les habitants rapetissent, le mobilier doit
// suivre — sinon la place enfle à vue d'œil sans que rien n'ait bougé.
//
// `AGENT_SCALE` est exporté en LIAISON VIVE (ESM) par agents.js : on le relit à
// chaque composition, donc `__villagerScale` recale le mobilier à chaud. La
// composition est mémoïsée avec sa valeur dans la clé.
//
// Un adulte est dessiné à `scale × AGENT_SCALE` tuiles de haut, scale ≈ 0.85
// dans toutes les tables d'ère (cf. agents.js).
const ADULT_SCALE = 0.85;
const personHT = () => ADULT_SCALE * AGENT_SCALE;
// Les recettes déclarent le mobilier en `p` = MULTIPLES DE LA HAUTEUR D'UN
// HABITANT, résolus au moment de la composition (jamais à l'import : la valeur
// serait figée avant le premier réglage de molette). `hT` reste accepté pour ce
// qui n'est PAS à l'échelle du corps.
const personF = (f) => personHT() * f;
// ACCENTS VERTICAUX : un mât, une statue, un obélisque sont FAITS pour dépasser
// — ils ponctuent la place et se voient de loin. Tout le reste est du MOBILIER
// et doit rester sous la demi-maison (c'est le défaut qu'on répare : un banc
// aussi large qu'une maison). Le test isoPlaza.test.js applique les deux
// plafonds séparément ; ajouter un prop haut sans l'inscrire ici le fera tomber.
const TALL_PROPS = new Set(['flag', 'statue', 'obelisk', 'tree']);

// ── MOLETTE DE RÉGLAGE ──────────────────────────────────────────────────────
// `rev` s'incrémente à chaque réglage : la composition mémoïsée se reconstruit
// sans avoir à recharger la page.
const PLAZA_TUNE = {
  mode: 'kit',        // 'kit' (composée) | 'scene' (ancien PNG) | 'off'
  propScale: 1,       // multiplie TOUTES les hauteurs
  // Géométrie de la composition (cf. § COMPOSITION) — tout en CELLULES.
  // PLAFOND de bancs par côté. Relevé de 2 à 4 le 2026-07-29 : le mobilier étant
  // passé à l'échelle du corps, il est ~1,6× plus petit et il en tient davantage
  // (« ça permet de réduire la taille des éléments pour en mettre plus »). C'est
  // toujours un MAXIMUM — un côté trop court en met moins, tout seul.
  benchPerSide: 4,
  furnScale: 1,       // grossit ou rapetisse TOUT le mobilier en `p` d'un coup
  // Ce qui tient le CENTRE. 'auto' = la fontaine de la recette, un arbre si la
  // recette n'en a pas. 'tree' force l'arbre. Le centre n'est JAMAIS vide.
  centre: 'auto',
  pairTight: 0.95,    // serrage du duo de bancs, en largeurs de banc
  benchInset: 0.62,   // distance du bord de la place au pied du banc
  cornerKeep: 1.0,    // dégagement gardé à chaque coin (les lampadaires y sont)
  sideGap: 0.68,      // écart banc ↔ compagnon le long du bord
  treeMax: 2,         // arbres sur la place — plafond (le compte suit l'emprise)
  treeSpread: 0.36,   // écart à la fontaine — PLANCHER, en fraction du demi-côté
  treeClear: 0.12,    // marge gardée entre l'arbre et la fontaine (cellules)
  treeR: 0.7,         // rayon, au sens des arbres de la CARTE (hpx = T·z·r·2.7)
  grateMargin: 1.6,   // largeur de la margelle / étalement MESURÉ des racines
  // REMONTÉE de l'arbre au-dessus de sa margelle, en tuiles écran. Sans elle
  // l'arbre se pose sur le BORD AVANT de la margelle au lieu du milieu du trou :
  // il a l'air planté au ras de la pierre, pas dedans (retour Raph 2026-07-29).
  // Réglé À L'ŒIL sur une planche comparative (0.08 / 0.11 / 0.14 / 0.18) : la
  // demi-hauteur de margelle (0.16) faisait « un brin trop haut », l'arbre
  // décollait. 0.11 = 5,3 px au zoom de jeu — le pied est dans le trou, le bord
  // avant de la pierre reste visible. Sans margelle, pas de remontée.
  treeLift: 0.11,
  // Part BASSE de la margelle redessinée PAR-DESSUS l'arbre, en fraction de sa
  // hauteur d'encre. C'est ce qui fait passer les racines DANS le sol : sans
  // elle l'arbre est dessiné en entier au-dessus de l'anneau et ses racines ont
  // l'air posées sur la pierre. Sur une ellipse vue en iso, la moitié basse EST
  // l'arc avant — d'où 0.5. À 0, la margelle repasse entièrement derrière.
  grateFrontF: 0.5,
  // Sens du compagnon le long du bord. 'in' = vers le MILIEU du côté (défaut) :
  // poussés vers l'extérieur ('out'), les compagnons de deux côtés adjacents se
  // retrouvent au même point à l'écran dans le coin — c'est le chevauchement
  // signalé le 2026-07-29, et le filet les supprimait un sur deux.
  sideDir: 'in',
  sideOn: true,       // un buisson ou un pot à côté de chaque banc
  jitter: 0,          // désordre (0 = composition strictement symétrique)
  coreR: 1.15,        // rayon (cellules) autour du centre où rien ne se pose
  minGap: 0.9,        // séparation minimale entre deux props, en largeurs d'encre
  seed: 0,            // change les tirages de variante sans changer la ville
  era: null,          // force une ère ('antique'|'medieval'|'industrial'|'modern'|'cosmic')
  only: null,         // n'affiche qu'un prop
  hT: {},             // surcharges de hauteur par prop : { bench: 0.6 }
  shadow: 0.16,       // opacité de l'ombre douce au pied
  grid: false,        // overlay : rôles des cellules + empreintes
  ruler: false,       // overlay : étalon (empreinte de maison + barre de tuile)
  placeholders: true, // gabarit plat quand aucun art n'existe pour le prop
  rev: 0,
};
if (typeof window !== 'undefined') {
  window.__plaza = (o) => {
    if (o) { Object.assign(PLAZA_TUNE, o); PLAZA_TUNE.rev += 1; }
    return { ...PLAZA_TUNE };
  };
}

// ── ÈRES ────────────────────────────────────────────────────────────────────
// Pas de place aux stades primitifs (cohérence avec les lampadaires).
export const plazaEraForBand = (band) => (band >= 7 ? 'cosmic' : band >= 6 ? 'modern'
  : band >= 5 ? 'industrial' : band >= 4 ? 'medieval' : band >= 2 ? 'antique' : null);
// Ère iso → grappe du kit top-down legacy (repli d'art tant que l'iso manque).
const LEGACY_ERA = {
  antique: 'antique', medieval: 'classique', industrial: 'industrielle',
  modern: 'moderne', cosmic: 'futuriste',
};
// Prop iso → prop du kit legacy quand le nom diffère (null = pas d'équivalent).
const LEGACY_PROP = {
  bench: 'bench', planter: 'planter', bush: 'bush', fountain: 'fountain',
  flag: 'flag', amphora: 'planter', bollard: null, stall: null, statue: null,
  bin: null,                            // pas d'équivalent dans le kit legacy
};

// ── RECETTES PAR ÈRE ────────────────────────────────────────────────────────
// C'est ICI qu'on travaille. La COMPOSITION est fixée (voir plus bas) et voulue
// par Raph : fontaine au milieu, des bancs par côté tournés vers le centre, un
// bac à côté de chaque banc, un lampadaire à chaque coin. Ce tableau ne dit donc
// pas « quoi semer où » mais QUEL ART joue chaque rôle et à quelle taille.
//   centre : la pièce maîtresse, posée au milieu géométrique
//   bench  : le banc (variantes n/s/e/w, tourné vers le centre)
//   side   : le pool du compagnon posé à côté du banc (tiré par hash)
//   trees  : des ARBRES sur la place (cf. § ARBRES) — pas à l'échelle du corps,
//            ce sont ceux de la CARTE et ils ne doivent pas en diverger
//   grate  : la margelle au pied de l'arbre
//   lamps  : 'corners' (un mât par angle) | null — cf. buildLamps
//
// 📏 TOUT LE MOBILIER EST EN `p` = MULTIPLES DE LA HAUTEUR D'UN HABITANT, et
//    résolu à la composition. C'est la correction du 2026-07-29 : ancré sur la
//    maison, le mobilier ne bougeait pas quand Raph rapetissait les habitants et
//    la place enflait à vue d'œil. Repères (habitant ≈ 1,70 m) :
//        banc 1,2 m de haut en 3/4 → p 0.70   ·   bac 0,95 m → p 0.55
//        margelle à plat 0,75 m projeté → p 0.44
// 🚫 Pas de BUISSONS sur une place (« ces buissons n'ont pas lieu d'être, il
//    faudrait des arbres ») : la verdure passe par les arbres.
//
// 📈 LA FONTAINE GRANDIT D'ÈRE EN ÈRE (« qu'on ait une évolution »), de 2,1 m à
//    4,4 m environ. Elle est en `p` comme le reste : c'est un monument, mais un
//    monument se mesure quand même au passant qui le longe. STRICTEMENT
//    croissante, verrouillée comme telle par le test.
//    ⚠ L'art suit : chaque fontaine est générée à EXACTEMENT le double de sa
//    taille d'affichage puis écrasée ×0,5 — blitée au pixel près. Le plafond de
//    168 px de PixelLab borne la progression par le haut.
const RECIPES = {
  antique: {
    centre: { prop: 'fountain', p: 1.25 },
    bench: { p: 0.70 },
    side: [{ prop: 'planter', p: 0.55 }, { prop: 'bin', p: 0.52 }],
    trees: true,
    grate: { p: 0.44 },
    lamps: 'corners',
  },
  medieval: {
    centre: { prop: 'fountain', p: 1.60 },
    bench: { p: 0.70 },
    side: [{ prop: 'planter', p: 0.55 }, { prop: 'bin', p: 0.52 }],
    trees: true,
    grate: { p: 0.44 },
    lamps: 'corners',
  },
  industrial: {
    centre: { prop: 'fountain', p: 1.95 },
    bench: { p: 0.70 },
    side: [{ prop: 'planter', p: 0.55 }, { prop: 'bin', p: 0.52 }],
    trees: true,
    grate: { p: 0.44 },
    lamps: 'corners',
  },
  modern: {
    centre: { prop: 'fountain', p: 2.25 },
    bench: { p: 0.68 },
    side: [{ prop: 'planter', p: 0.55 }, { prop: 'bin', p: 0.52 }],
    trees: true,
    grate: { p: 0.44 },
    lamps: 'corners',
  },
  cosmic: {
    centre: { prop: 'fountain', p: 2.60 },
    bench: { p: 0.66 },
    // 🚫 Pas de `bollard` ici : aucun art n'existe pour lui, un compagnon sur
    //    deux serait un gabarit gris. À rajouter le jour où le sprite existe.
    side: [{ prop: 'planter', p: 0.55 }, { prop: 'bin', p: 0.52 }],
    trees: true,
    grate: { p: 0.44 },
    lamps: 'corners',
  },
};

// ── ARBRES DE LA PLACE ──────────────────────────────────────────────────────
// Ils ne passent PAS par le registre d'art d'ici : on pousse un item `tree` au
// format exact des arbres de la CARTE (`{gx, gy, jx, jy, r}`), donc isoRenderer
// les dessine avec son propre pipeline — mêmes sprites tree-1..4, teinte de
// SAISON, batching WebGL, repli procédural. Un arbre de place est un arbre,
// pas un prop de place qui lui ressemble.
//
// Taille : `r` a le sens des arbres de carte (hauteur canvas = T·z·r·2.7). À
// r = 0.7 l'ENCRE mesure 1.54 à 1.73 tuile selon la variante, soit ~0.8 maison.
// Empreinte au sol utilisée par le filet anti-chevauchement.
const TREE_INK_HT = 1.65 / 0.7;         // encre en tuiles, par unité de r
const TREE_ASPECT = 0.95;               // majorant des 4 variantes (0.58 à 0.96)
// Compte : suit l'emprise, plafonné par treeMax — « 1 ou 2 max » (Raph), et
// « plus la place est grande, plus on met d'éléments ».
function plazaTreeCount(w, h) {
  const n = Math.round(Math.min(w, h) / 3);
  return Math.max(1, Math.min(PLAZA_TUNE.treeMax | 0, n));
}

// ── HASH DÉTERMINISTE ───────────────────────────────────────────────────────
// ⚠ cmHash est un FNV-1a SIGNÉ dont le BIT FAIBLE n'est que la parité de
// l'entrée : `cmHash(k) & 1` sur des coordonnées donne un DAMIER, pas un
// tirage. On rebrasse donc systématiquement (fmix32) avant tout usage, et on
// ne consomme jamais les bits bruts.
function fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16; return h >>> 0;
}
const h01 = (k) => fmix32(cmHash(k) >>> 0) / 4294967296;

// ── LES BOÎTES DES PLACES ───────────────────────────────────────────────────
// ⚠ Composantes CONNEXES (flood-fill), PAS la bbox de toutes les cellules
// 'plaza' : des cellules plaza isolées existent ailleurs et gonflaient la bbox à
// la ville entière (scène géante en fond d'écran).
//
// ⚠ Et TOUTES les composantes, pas seulement la plus grande. Ne garder que la
// plus grande était un garde-fou contre cette bbox géante — mais il jetait au
// passage les places de quartier, qui recevaient leur dallage sans jamais un
// banc (« il n'y a que la place centrale qui construit, les autres ont le sol
// mais aucun élément »). On filtre plutôt par TAILLE : une composante trop
// petite pour porter une composition n'est pas une place, c'est une cellule
// 'plaza' égarée dans le réseau de rues.
const PLAZA_MIN_CELLS = 9;              // au moins l'équivalent d'un 3×3
const PLAZA_MIN_SIDE = 3;               // et pas un couloir d'une cellule de large
let _boxCache = { at: -1, boxes: null };
export function isoPlazaBoxes(L) {
  if (_boxCache.at === CM.layoutRecomputeAt && _boxCache.boxes) return _boxCache.boxes;
  const cells = new Set();
  if (L.roadMap) for (const c of L.roadMap.values()) if (c.rank === 'plaza') cells.add(c.gx + ',' + c.gy);
  const boxes = [];
  const remaining = new Set(cells);
  while (remaining.size) {
    const start = remaining.values().next().value;
    remaining.delete(start);
    const comp = [start];
    const stack = [start.split(',').map(Number)];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (x + dx) + ',' + (y + dy);
        if (remaining.has(k)) { remaining.delete(k); comp.push(k); stack.push([x + dx, y + dy]); }
      }
    }
    if (comp.length < PLAZA_MIN_CELLS) continue;
    let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
    for (const k of comp) {
      const [x, y] = k.split(',').map(Number);
      if (x < gx0) gx0 = x; if (x > gx1) gx1 = x;
      if (y < gy0) gy0 = y; if (y > gy1) gy1 = y;
    }
    if (gx1 - gx0 + 1 < PLAZA_MIN_SIDE || gy1 - gy0 + 1 < PLAZA_MIN_SIDE) continue;
    boxes.push({ gx0, gx1, gy0, gy1, cells: comp.length });
  }
  // Ordre STABLE et indépendant de l'itération de la Map : la plus grande
  // d'abord (c'est la place centrale), puis par position. Les tirages par place
  // sont graînés sur son COIN, pas sur son rang — deux places voisines ne
  // doivent pas se ressembler juste parce qu'elles sont arrivées dans cet ordre.
  boxes.sort((u, v) => v.cells - u.cells || u.gx0 - v.gx0 || u.gy0 - v.gy0);
  _boxCache = { at: CM.layoutRecomputeAt, boxes };
  return boxes;
}
// La PLUS GRANDE — c'est la place centrale. Gardée pour le mode 'scene', qui
// n'a jamais su afficher qu'une seule place.
export function isoPlazaBox(L) {
  const b = isoPlazaBoxes(L);
  return b.length ? b[0] : null;
}

// ── RÔLES DES CELLULES ──────────────────────────────────────────────────────
// r = anneau (0 = extérieur). Une cellule d'angle est un `corner`, le reste de
// l'anneau 0 est `edge`, tout l'intérieur est `inner`. Les cellules de la boîte
// qui ne sont PAS réellement de la place (la composante connexe n'est pas
// forcément un rectangle plein) sont écartées.
export function isoPlazaCells(L, box) {
  const out = [];
  if (!box) return out;
  const w = box.gx1 - box.gx0 + 1, h = box.gy1 - box.gy0 + 1;
  for (let iy = 0; iy < h; iy += 1) {
    for (let ix = 0; ix < w; ix += 1) {
      const gx = box.gx0 + ix, gy = box.gy0 + iy;
      const c = L.roadMap && L.roadMap.get(gx + ',' + gy);
      if (!c || c.rank !== 'plaza') continue;          // trou de la composante
      const r = Math.min(ix, iy, w - 1 - ix, h - 1 - iy);
      const isCorner = (ix === 0 || ix === w - 1) && (iy === 0 || iy === h - 1);
      out.push({ gx, gy, ix, iy, r, role: isCorner ? 'corner' : r === 0 ? 'edge' : 'inner' });
    }
  }
  return out;
}

// Proportion largeur/hauteur APPROCHÉE de chaque art. Ne sert PAS au dessin (là
// c'est l'encre mesurée du PNG qui commande) mais au filet anti-chevauchement et
// au gabarit : il faut connaître l'encombrement AVANT que l'image soit décodée.
const PROP_ASPECT = {
  bench: 1.6, planter: 1.4, bush: 1.1, amphora: 0.8, fountain: 1.2,
  flag: 0.5, statue: 0.6, stall: 1.5, bollard: 0.5, obelisk: 0.4, tree: TREE_ASPECT,
  bin: 0.75,                            // corbeille : plus haute que large
  grate: 2.0,                           // large et plate : elle cercle le tronc
};
// Props qui ne prennent JAMAIS de gabarit : une grille absente doit laisser le
// pied de l'arbre nu, pas y poser un bloc gris sous chaque arbre de la place.
const NO_PLACEHOLDER = new Set(['grate']);
// Empreinte au sol d'un mât : elle n'existe QUE pour le filet — un arbre posé
// au coin ne doit pas venir sur un lampadaire.
const LAMP_HW = 0.2;
const aspectOf = (prop) => PROP_ASPECT[prop] || 1;

// ── COMPOSITION ─────────────────────────────────────────────────────────────
// FIXÉE, pas semée (retour Raph 2026-07-29, le semis aléatoire faisait se
// chevaucher bancs et buissons) :
//
//        fontaine au MILIEU
//        DEUX bancs par CÔTÉ, tournés vers le centre
//        un buisson ou un pot À CÔTÉ de chaque banc, vers l'extérieur
//        un lampadaire à chaque COIN
//
// Le hasard ne sert plus qu'à CHOISIR quel compagnon (buisson ou pot) accompagne
// quel banc. La géométrie, elle, est symétrique et se règle par la molette
// (benchPerSide, benchInset, benchSpread, sideGap).
//
// Les positions sont en CELLULES fractionnaires ; `wx, wy` en px monde = le
// point où le prop TOUCHE LE SOL. Mémoïsé par (layout, ère, réglages).
let _compCache = { key: '', comps: null };
// Compose UNE place. `box` = son emprise ; toutes les places de la ville passent
// par ici, chacune avec sa propre graine (son coin), donc deux places voisines
// ne se ressemblent pas.
function composeOne(L, era, box) {
  const R = RECIPES[era];
  if (!box || !R) return null;
  // ⚠ AGENT_SCALE entre dans la CLÉ : le mobilier en `p` en dépend, donc bouger
  // __villagerScale doit reconstruire la composition, pas ressortir le cache.
  const T = CM.TILE;
  const w = box.gx1 - box.gx0 + 1, h = box.gy1 - box.gy0 + 1;
  const cxc = box.gx0 + w / 2, cyc = box.gy0 + h / 2;      // centre en CELLULES
  const cells = isoPlazaCells(L, box);
  const props = [];
  // Graine PAR PLACE : son coin entre dans la clé, sinon toutes les places de la
  // ville tirent la même chose et se ressemblent au pixel près.
  const sd = ':' + PLAZA_TUNE.seed + ':' + era + ':' + box.gx0 + ':' + box.gy0;
  // Résolution d'une hauteur. `p` (multiples d'habitant) est résolu ICI, à la
  // composition, pas à l'import : figé au chargement il vaudrait la taille des
  // habitants d'avant le premier réglage de molette. `furnScale` permet de
  // grossir ou rapetisser tout le mobilier d'un coup sans toucher aux recettes.
  const hOf = (prop, post) => {
    if (PLAZA_TUNE.hT[prop] != null) return PLAZA_TUNE.hT[prop];
    if (post.p != null) return personF(post.p) * PLAZA_TUNE.furnScale;
    return post.hT;
  };

  // FILET ANTI-CHEVAUCHEMENT. On compare les empreintes EN ESPACE ÉCRAN, seul
  // endroit où « ça se chevauche » veut dire quelque chose : deux props éloignés
  // dans le monde peuvent se superposer à l'écran en iso. Coordonnées écran en
  // TUILES (donc indépendantes du zoom) : sx = gx − gy, sy = (gx + gy) / 2.
  const placed = [];
  const foot = (gxf, gyf, prop, hT) => {
    const hw = hT * aspectOf(prop) * 0.5;                  // empreinte au SOL
    return { sx: gxf - gyf, sy: (gxf + gyf) * 0.5, hw, hh: hw * 0.4 };
  };
  const fits = (gxf, gyf, prop, hT) => {
    const f = foot(gxf, gyf, prop, hT);
    for (const o of placed) {
      if (Math.abs(f.sx - o.sx) < (f.hw + o.hw) * PLAZA_TUNE.minGap
        && Math.abs(f.sy - o.sy) < (f.hh + o.hh) * PLAZA_TUNE.minGap) return false;
    }
    placed.push(f);
    return true;
  };
  // Réservation INCONDITIONNELLE : ce qui a la priorité absolue (la pièce
  // maîtresse) ne demande pas la permission au filet, il s'impose et le reste
  // s'écarte. Sans ça, un centre pourrait être refusé et la place resterait
  // vide en son milieu.
  const reserve = (gxf, gyf, prop, hT) => { placed.push(foot(gxf, gyf, prop, hT)); };

  const add = (prop, variant, gxf, gyf, hT) => {
    if (!fits(gxf, gyf, prop, hT)) return false;
    const wx = gxf * T, wy = gyf * T;
    props.push({ prop, variant, wx, wy, hT, d: depthOf(wx, wy) });
    return true;
  };

  // ── POSE D'UN ARBRE, factorisée ─────────────────────────────────────────────
  // Le CENTRE de la place peut être tenu par un arbre aussi bien que par une
  // fontaine, et c'est exactement le même geste : remontée au-dessus de la
  // margelle, margelle en deux morceaux qui encadrent l'arbre, item au format
  // des arbres de la CARTE. `net` = passer par le filet d'empreinte ; le centre
  // ne le franchit pas, il s'impose.
  const treeHT = TREE_INK_HT * PLAZA_TUNE.treeR;
  let trees = 0;
  // (fx, fy) = où doivent tomber les RACINES. « L'arbre n'est pas central, il
  // faut que ses racines soient au centre » — deux décalages s'additionnaient :
  //   1. la REMONTÉE au-dessus de la margelle (0.11 cellule, ~5 px). C'est donc
  //      la MARGELLE qui descend maintenant, pas l'arbre qui monte : l'écart
  //      visuel entre les deux est le même, mais le point de référence devient
  //      celui de l'arbre ;
  //   2. le PIED du sprite n'est pas au centre de son canvas (footCx 0.474 à
  //      0.521 selon la variante) alors que le pipeline d'arbres de la carte
  //      dessine centré sur le CANVAS. On corrige avec les métriques MESURÉES,
  //      quand elles sont disponibles — la clé de composition porte leur nombre,
  //      donc la place se recale toute seule au décodage des sprites.
  const putTree = (fx, fy, ci, net) => {
    const tv = 1 + (Math.floor(h01('plz' + sd + ':t:' + ci) * 4) % 4);
    const lift = R.grate ? PLAZA_TUNE.treeLift : 0;
    // Recentrage sur le pied MESURÉ. Un décalage ÉCRAN (dsx, dsy) en tuiles se
    // traduit en monde par dx = dsx/2 + dsy, dy = −dsx/2 + dsy (l'écran lit x−y
    // en abscisse et (x+y)/2 en ordonnée).
    let cx0 = fx, cy0 = fy;
    const m = treeFootMetrics(tv);
    if (m) {
      const canvasT = PLAZA_TUNE.treeR * 2.7;
      const dsx = -(m.footCx - 0.5) * canvasT, dsy = -(m.footBottom - 0.92) * canvasT;
      cx0 += dsx / 2 + dsy; cy0 += -dsx / 2 + dsy;
    }
    // ⚠ Le filet teste la position FINALE, pas celle d'avant recentrage :
    // valider un point que l'arbre n'occupe plus laisse repasser exactement le
    // chevauchement qu'il est censé empêcher.
    if (net) { if (!fits(cx0, cy0, 'tree', treeHT)) return false; }
    else reserve(cx0, cy0, 'tree', treeHT);
    const tx = cx0, ty = cy0;
    const gx = Math.floor(tx), gy = Math.floor(ty);
    const treeD = depthOf(tx * T, ty * T);
    // La MARGELLE descend de `lift` : c'est elle qui bouge, l'arbre reste au point.
    const mx0 = fx + lift, my0 = fy + lift;
    // MARGELLE au pied, à une profondeur juste sous celle de l'ARBRE REMONTÉ (et
    // non sous sa position d'origine — la remontée baisse la profondeur de
    // l'arbre, la margelle repasserait par-dessus). Pas de gabarit : art absent
    // = pied nu.
    if (R.grate) {
      // De QUEL arbre : c'est son pied mesuré qui décide du centrage et de la
      // largeur au dessin (les 4 variantes n'ont pas le même).
      const base = {
        prop: 'grate', variant: null, wx: mx0 * T, wy: my0 * T, spot: ci,
        hT: hOf('grate', R.grate), treeV: tv, treeR: PLAZA_TUNE.treeR,
      };
      props.push({ ...base, d: treeD - 0.001 });
      // ARC AVANT redessiné PAR-DESSUS l'arbre : c'est lui qui enterre les
      // racines. Sans lui, l'arbre passe en entier au-dessus de l'anneau et ses
      // racines ont l'air posées sur la pierre.
      if (PLAZA_TUNE.grateFrontF > 0) props.push({ ...base, d: treeD + 0.001, front: true });
    }
    // `tr` au FORMAT des arbres de la carte : isoRenderer le dessine avec son
    // propre pipeline (sprites tree-1..4, teinte de saison, batching), on ne
    // redessine rien ici. L'ancre carte est (gx+0.5+jx, gy+0.9+jy) : on en déduit
    // le jitter qui pose l'arbre pile où on le veut.
    props.push({
      prop: 'tree', variant: null, wx: tx * T, wy: ty * T, hT: treeHT, d: treeD, spot: ci,
      tr: { gx, gy, jx: tx - 0.5 - gx, jy: ty - 0.9 - gy, r: PLAZA_TUNE.treeR, _tv: tv },
    });
    trees += 1;
    return true;
  };

  // 0. Les MÂTS d'abord, dans le filet seulement : ils sont dessinés par le
  //    système de lampadaires, mais rien ne doit venir se poser dessus.
  const lamps = buildLamps(box, w, h, R, T);
  for (const lp of lamps) {
    const gxf = lp.wx / T, gyf = lp.wy / T;
    placed.push({ sx: gxf - gyf, sy: (gxf + gyf) * 0.5, hw: LAMP_HW, hh: LAMP_HW * 0.4 });
  }

  // 1. LE CENTRE N'EST JAMAIS VIDE (« il faut que le centre de la place soit
  //    pris, soit par un arbre, soit une fontaine, mais obligatoirement quelque
  //    chose »). Au milieu GÉOMÉTRIQUE — une place de largeur paire n'a pas de
  //    cellule centrale. Posé en PREMIER et SANS demander au filet : la pièce
  //    maîtresse s'impose, tout le reste s'écarte d'elle.
  //    `centre` de la molette : 'fountain' (défaut, si la recette en a une),
  //    'tree' pour un arbre, 'auto' = fontaine sinon arbre.
  const veutArbre = PLAZA_TUNE.centre === 'tree' || !R.centre;
  let centrePris = false;
  if (veutArbre && R.trees) {
    centrePris = putTree(cxc, cyc, 9, false);
  } else if (R.centre) {
    const hc = hOf(R.centre.prop, R.centre);
    reserve(cxc, cyc, R.centre.prop, hc);
    props.push({
      prop: R.centre.prop, variant: null, wx: cxc * T, wy: cyc * T, hT: hc,
      d: depthOf(cxc * T, cyc * T),
    });
    centrePris = true;
  }

  // 2. Les quatre côtés — LES BANCS VONT PAR DEUX (« tu peux faire en sorte que
  //    2 bancs soient côte à côte ? »). Chaque côté porte un ou plusieurs
  //    GROUPES symétriques : [bac · banc · banc · bac]. Le duo de bancs occupe le
  //    milieu du groupe, un bac le flanque de chaque côté. `face` nomme la
  //    direction MONDE vers laquelle le banc REGARDE, donc toujours le centre.
  const ins = PLAZA_TUNE.benchInset;
  const SIDES = [
    { face: 's', horiz: true, line: box.gy0 + ins, span: w, base: cxc },        // bord nord
    { face: 'n', horiz: true, line: box.gy1 + 1 - ins, span: w, base: cxc },    // bord sud
    { face: 'e', horiz: false, line: box.gx0 + ins, span: h, base: cyc },       // bord ouest
    { face: 'w', horiz: false, line: box.gx1 + 1 - ins, span: h, base: cyc },   // bord est
  ];
  const at = (side, along) => (side.horiz ? [along, side.line] : [side.line, along]);
  const sideOn = PLAZA_TUNE.sideOn && !!(R.side && R.side.length);
  // ⚠ Le long d'un bord, avancer d'une CELLULE décale l'écran d'exactement une
  // TUILE (sx = gx − gy) : comparer des cellules à des largeurs en tuiles est
  // donc légitime, et c'est pour ça que ce calcul tient à tous les zooms.
  const wBench = hOf('bench', R.bench) * aspectOf('bench');
  const wMate = sideOn ? Math.max(...R.side.map((s2) => hOf(s2.prop, s2) * aspectOf(s2.prop))) : 0;
  const minStep = Math.max(wBench, wMate) * PLAZA_TUNE.minGap;
  // Écart INTERNE au duo : les deux bancs se touchent presque, c'est ce qui les
  // fait lire comme une paire et non comme deux bancs isolés.
  const duo = wBench * PLAZA_TUNE.pairTight;
  // Écart banc ↔ bac. ⚠ Il doit rester PLUS GRAND que l'écart interne au duo,
  // sinon le bac est plus proche du banc que son jumeau et la paire ne se lit
  // plus comme une paire (attrapé par le test du « banc jumeau »). Un bac étant
  // bien plus étroit qu'un banc, la demi-somme des largeurs seule ne suffit pas.
  const mate = Math.max((wBench + wMate) * 0.5 * PLAZA_TUNE.minGap, minStep * 0.6, duo * 1.2);
  // Empreinte d'un DUO seul le long du bord. Les bacs, eux, ne font pas partie
  // du groupe : ils se logent dans les INTERVALLES (les deux bouts, et entre
  // deux duos). C'est ce qui permet de tenir deux duos là où deux groupes
  // « bac + duo + bac » ne tenaient pas.
  const spanFor = () => duo;
  let benchPerSide = 0;

  for (let si = 0; si < SIDES.length; si += 1) {
    const side = SIDES[si];
    // COMBIEN DE GROUPES TIENNENT ICI. `benchPerSide` est un MAXIMUM de bancs :
    // en duos, cela fait au plus benchPerSide/2 groupes. Un groupe entier doit
    // tenir, et deux groupes voisins ne doivent pas se toucher — d'où le pas
    // minimal entre eux. Un côté trop court en met moins, tout seul.
    const usable = side.span - 2 * PLAZA_TUNE.cornerKeep;
    let g = Math.max(0, Math.floor((PLAZA_TUNE.benchPerSide | 0) / 2));
    while (g > 1 && usable / g < spanFor() + 2 * minStep) g -= 1;
    if (g > 0 && usable < spanFor()) g = 0;
    benchPerSide = Math.max(benchPerSide, g * 2);

    const segAt = (k) => side.base + (k - (g - 1) / 2) * (usable / g);
    let poseUnDuo = false;
    for (let k = 0; k < g; k += 1) {
      // Centre du duo, symétrique autour du milieu du côté.
      const seg = segAt(k);
      const jit = (h01('plz' + sd + ':j:' + si + ':' + k) - 0.5) * PLAZA_TUNE.jitter;
      // LE DUO. Deux bancs accolés, tournés tous les deux vers le centre.
      let poses = 0;
      for (const dd of [-0.5, 0.5]) {
        const [bx, by] = at(side, seg + dd * duo + jit);
        if (Math.hypot(bx - cxc, by - cyc) < PLAZA_TUNE.coreR) continue;
        if (add('bench', side.face, bx, by, hOf('bench', R.bench))) poses += 1;
      }
      if (!poses) continue;
      // UN BAC DE CHAQUE CÔTÉ du duo — symétrique, et les coins restent aux
      // lampadaires. Le compagnon prend la MÊME face que ses bancs : un bac
      // rectangulaire posé le long d'un bord doit suivre l'angle de ce bord,
      // sinon il les croise. Sans art directionnel, propImage retombe seul sur
      // le sprite unique.
      poseUnDuo = true;
    }
    // LES BACS vont dans les INTERVALLES : aux deux bouts de la rangée, et entre
    // deux duos. Ils sont la GARNITURE, pas la structure — s'il n'y a pas la
    // place pour l'un d'eux, le filet le refuse et c'est très bien ; ce qui ne
    // doit jamais sauter en silence, ce sont les bancs.
    if (sideOn && poseUnDuo && g > 0) {
      const creux = [segAt(0) - (duo / 2 + mate), segAt(g - 1) + (duo / 2 + mate)];
      for (let k = 1; k < g; k += 1) creux.push((segAt(k - 1) + segAt(k)) / 2);
      for (let mi = 0; mi < creux.length; mi += 1) {
        const pick = R.side[Math.floor(h01('plz' + sd + ':s:' + si + ':m:' + mi) * R.side.length) % R.side.length];
        const [mx, my] = at(side, creux[mi]);
        add(pick.prop, side.face, mx, my, hOf(pick.prop, pick));
      }
    }
  }
  // 4. LES ARBRES de côté, de part et d'autre du centre.
  //    ⚠ PAS aux angles de la place, essayé et refusé par le filet : l'angle
  //    d'un losange iso est BEAUCOUP plus étroit qu'il n'en a l'air, l'arbre y
  //    tombait sur le banc voisin du côté perpendiculaire. On les pose sur
  //    l'ANTI-diagonale monde (x + y constant), qui se projette à l'HORIZONTALE
  //    à l'écran : un arbre va à droite du centre, deux l'encadrent.
  //    (La diagonale x = y, elle, se projette à la verticale — deux arbres y
  //    seraient l'un devant l'autre. Elle ne sert que de repli.)
  if (R.trees && (PLAZA_TUNE.treeMax | 0) > 0) {
    // DISTANCE AU CENTRE. `treeSpread` n'est qu'un PLANCHER : la pièce maîtresse
    // grandit d'ère en ère, et un arbre posé à distance fixe finissait par la
    // toucher. Il basculait alors sur un emplacement de repli DERRIÈRE elle — où
    // il mangeait deux bancs (vu à l'industrielle sur une place 4×4, attrapé par
    // le test « la fontaine qui grandit ne mange pas le mobilier »). Un
    // emplacement à (cxc + d, cyc − d) est à sx = 2d de l'axe du centre, d'où la
    // DEMI-somme des demi-largeurs.
    const cHW = (R.centre ? hOf(R.centre.prop, R.centre) * aspectOf('fountain') : treeHT * aspectOf('tree')) * 0.5;
    const tHW = treeHT * aspectOf('tree') * 0.5;
    const td = Math.max(
      PLAZA_TUNE.treeSpread * Math.min(w, h) / 2,
      (cHW + tHW) * PLAZA_TUNE.minGap / 2 + PLAZA_TUNE.treeClear,
    );
    const SPOTS = [
      [cxc + td, cyc - td],      // droite de l'écran
      [cxc - td, cyc + td],      // gauche de l'écran
      [cxc - td, cyc - td],      // derrière le centre
      [cxc + td, cyc + td],      // devant — dernier recours, il le masque
    ];
    // Le compte inclut l'arbre du CENTRE quand c'est lui qui le tient : « 1 ou
    // 2 max » vaut pour la place entière, pas par emplacement.
    const want = plazaTreeCount(w, h);
    for (let ci = 0; ci < SPOTS.length && trees < want; ci += 1) {
      putTree(SPOTS[ci][0], SPOTS[ci][1], ci, true);
    }
  }
  props.sort((a, b) => a.d - b.d);

  return { box, era, w, h, cxc, cyc, cells, props, benchPerSide, trees, centrePris, lamps };
}

// TOUTES les places de la ville, mémoïsées ensemble.
export function isoPlazaCompositions(L, band) {
  const era = PLAZA_TUNE.era || plazaEraForBand(band);
  if (!era || !RECIPES[era]) return [];
  // ⚠ AGENT_SCALE et le nombre de pieds d'arbre mesurés entrent dans la CLÉ : le
  // mobilier en `p` dépend du premier, le recentrage des arbres du second.
  const key = CM.layoutRecomputeAt + '|' + era + '|' + PLAZA_TUNE.rev + '|'
    + PLAZA_TUNE.seed + '|' + AGENT_SCALE + '|' + treeFootCache.size;
  if (_compCache.key === key && _compCache.comps) return _compCache.comps;
  const comps = [];
  for (const box of isoPlazaBoxes(L)) {
    const c = composeOne(L, era, box);
    if (c) comps.push(c);
  }
  _compCache = { key, comps };
  return comps;
}

// La place CENTRALE seule — la plus grande. Gardée pour les tests et pour tout
// ce qui n'a besoin que d'un exemplaire.
export function isoPlazaComposition(L, band) {
  const all = isoPlazaCompositions(L, band);
  return all.length ? all[0] : null;
}

// Lampadaires de la place, au FORMAT du système de mâts existant
// ({wx, wy, gx, gy, d}) : ils héritent ainsi des sprites par ère, des halos, du
// vacillement et du LOD sans une ligne de code de lumière ici. computeIsoLamps
// saute explicitement les cellules 'plaza' — la place était éclairée par son
// PNG ; c'est cette liste qui reprend le relais.
// 🚫 UN MÂT PAR ANGLE, ET RIEN D'AUTRE. Un motif « ring » ajoutait un mât au
//    MILIEU de chaque bord ; or c'est exactement là que vit la rangée de bancs,
//    et sur une place 4×4 les deux se télescopaient — le filet supprimait alors
//    deux bancs, en silence, sur les seules ères qui utilisaient ce motif
//    (industrielle, moderne, cosmique). Défaut resté invisible tant que je ne
//    testais ces ères que sur des places 5×5. Raph n'a jamais demandé ces mâts :
//    « les lampadaires au coin sont bons ». Le motif est retiré, pas désactivé —
//    laisser l'option en place serait laisser le piège.
function buildLamps(box, w, h, R, T) {
  const lamps = [];
  if (!R.lamps) return lamps;
  const put = (gxf, gyf) => {
    const wx = gxf * T, wy = gyf * T;
    lamps.push({ wx, wy, gx: Math.floor(gxf), gy: Math.floor(gyf), d: wx + wy });
  };
  const x0 = box.gx0 + 0.5, x1 = box.gx1 + 0.5, y0 = box.gy0 + 0.5, y1 = box.gy1 + 0.5;
  put(x0, y0); put(x1, y0); put(x0, y1); put(x1, y1);
  return lamps;
}

// ── REGISTRE D'ART ──────────────────────────────────────────────────────────
// Chargement paresseux, chaîne de repli : sprite ISO → kit top-down legacy →
// gabarit plat. Le décodage d'un sprite invalide DOUCEMENT le bake du sol (même
// geste que isoArt) : sans ça le sol garderait son état d'avant le décodage.
const artCache = new Map();
function art(src) {
  let e = artCache.get(src);
  if (e) return e;
  e = { img: null, ready: false };
  artCache.set(src, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      e.img = im; e.ready = true;
      if (CM._isoGroundBake) CM._isoGroundBake.soft = true;
    };
    im.src = src;
  }
  return e;
}
// Image d'un prop pour cette ère et cette variante, ou null. `variant` (n/s/e/w)
// est tenté d'abord puis abandonné : un banc non directionnel vaut mieux que pas
// de banc.
function propImage(prop, era, variant) {
  const tries = [];
  if (variant) tries.push('/pixelart/iso/plaza/' + prop + '-' + variant + '-' + era + '.png');
  tries.push('/pixelart/iso/plaza/' + prop + '-' + era + '.png');
  const lp = LEGACY_PROP[prop], le = LEGACY_ERA[era];
  if (lp && le) {
    if (variant) tries.push('/pixelart/plazas/' + lp + '-' + variant + '-' + le + '.png');
    tries.push('/pixelart/plazas/' + lp + '-' + le + '.png');
  }
  for (const src of tries) { const e = art(src); if (e.ready) return e.img; }
  return null;
}

// ── ARBITRAGE DU MODE ───────────────────────────────────────────────────────
export const isoPlazaKitOn = (band) => PLAZA_TUNE.mode === 'kit' && !!plazaEraForBand(band);
export const isoPlazaSceneOn = (band) => PLAZA_TUNE.mode === 'scene' && !!plazaEraForBand(band);
// Le SOL : en mode scène le PNG porte son propre dallage (la dalle claire
// dépassait autour, retour Raph) ; en mode composé la place redevient une vraie
// dalle de sol, c'est elle qui donne l'esplanade.
export const isoPlazaSceneCoversGround = (band) => isoPlazaSceneOn(band);

// ── PASSE PEINTRE ───────────────────────────────────────────────────────────
// Pousse un item par prop : chacun trie à SA profondeur, donc un passant au sud
// d'un banc passe devant et celui du nord derrière. C'est exactement ce que la
// scène unique ne savait pas faire (un seul item pour toute la place).
export function isoPlazaItems(L, band, pushItem, visible) {
  let n = 0;
  for (const comp of isoPlazaCompositions(L, band)) n += pushOne(comp, pushItem, visible);
  return n;
}
function pushOne(comp, pushItem, visible) {
  let n = 0;
  if (PLAZA_TUNE.grid || PLAZA_TUNE.ruler) {
    const it = pushItem();
    it.d = depthOf(comp.box.gx0 * CM.TILE, comp.box.gy0 * CM.TILE) - 1;
    it.kind = 'plazaGrid'; it.art = comp;
  }
  for (const rec of comp.props) {
    if (PLAZA_TUNE.only && rec.prop !== PLAZA_TUNE.only) continue;
    if (visible && !visible(rec.wx, rec.wy)) continue;
    const it = pushItem();
    it.d = rec.d;
    if (rec.tr) {
      // ARBRE : item au format de la carte, dessiné par le pipeline d'arbres du
      // renderer (saison, batching, repli procédural) — pas par nous.
      it.kind = 'tree'; it.tr = rec.tr;
    } else {
      it.kind = 'plazaProp'; it.art = rec; it.eraKey = comp.era;
    }
    n += 1;
  }
  return n;
}

// Lampadaires de la place, à concaténer à ceux des rues.
export function isoPlazaLamps(L, band) {
  if (!isoPlazaKitOn(band)) return [];
  const out = [];
  for (const comp of isoPlazaCompositions(L, band)) out.push(...comp.lamps);
  return out;
}

// ── ENCRE D'UN SPRITE ───────────────────────────────────────────────────────
// ⚠ LA CAUSE DU « ÇA VOLE ». Les PNG du kit ont du vide transparent tout autour
// de l'objet. Poser le BAS DU CANVAS sur le sol laisse donc l'objet flotter
// au-dessus de son ombre, d'une hauteur qui change d'un sprite à l'autre — c'est
// exactement ce que Raph a vu le 2026-07-29. On mesure l'encre une fois au
// décodage et on ancre dessus : bas de l'encre sur le sol, centre de l'encre sur
// le point. `hT` devient alors la hauteur de l'OBJET VISIBLE, pas du canvas.
// (Même leçon que les scènes de moteur : rogner sur l'encre MESURÉE, jamais sur
// des fractions de boîte.)
const inkCache = new WeakMap();
function inkBox(img) {
  let b = inkCache.get(img);
  if (b !== undefined) return b;
  b = null;
  const w = img.naturalWidth | 0, h = img.naturalHeight | 0;
  if (w && h) {
    try {
      const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (d[(y * w + x) * 4 + 3] > 16) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      // Une encre VIDE n'est pas « tout le canvas » : c'est un sprite cassé. On
      // le signale par null et le prop ne se dessine pas, plutôt que de poser un
      // rectangle transparent qui volerait la place à son voisin.
      if (x1 >= x0) b = { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch { b = { x0: 0, y0: 0, w, h }; }   // canvas souillé : repli sur le canvas
  }
  inkCache.set(img, b);
  return b;
}

// ── PIED D'UN ARBRE DE LA CARTE ─────────────────────────────────────────────
// Pour CENTRER la margelle sur le tronc et la dimensionner sur l'étalement des
// RACINES, il faut les MESURER. Les quatre sprites d'arbre n'ont ni le même
// centre de pied (0.474 à 0.521 du canvas) ni la même largeur de pied (0.135 à
// 0.240) : publier une moyenne laisserait des racines dehors sur deux variantes.
// Même doctrine que l'ancrage des scènes de moteur — la fraction de pied se
// mesure, elle ne se devine pas.
//   footCx     centre horizontal du pied, en fraction du canvas
//   footW      largeur du pied, en fraction du canvas
//   footBottom bas de l'encre, en fraction du canvas (0.92 = l'ancre carte)
// Le « pied » = la bande basse de l'encre (12 % de sa hauteur), soit le tronc et
// ses racines, pas la couronne.
const treeFootCache = new Map();
function treeFootMetrics(v) {
  if (treeFootCache.has(v)) return treeFootCache.get(v);
  const e = art('/pixelart/iso/tree-' + v + '.png');
  if (!e.ready) return null;                    // pas décodé : on réessaiera
  const im = e.img, w = im.naturalWidth | 0, h = im.naturalHeight | 0;
  let m = null;
  if (w && h) {
    try {
      const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = false;
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      let y0 = h, y1 = -1;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (d[(y * w + x) * 4 + 3] > 16) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
        }
      }
      if (y1 >= y0) {
        const band = Math.max(2, Math.round((y1 - y0 + 1) * 0.12));
        let fx0 = w, fx1 = -1;
        for (let y = y1 - band + 1; y <= y1; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (d[(y * w + x) * 4 + 3] > 16) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }
          }
        }
        if (fx1 >= fx0) {
          m = { footCx: (fx0 + fx1 + 1) / 2 / w, footW: (fx1 - fx0 + 1) / w, footBottom: (y1 + 1) / h };
        }
      }
    } catch { m = null; }                       // canvas souillé : on reste au réglage
  }
  treeFootCache.set(v, m);
  return m;
}

// GÉOMÉTRIE DE LA MARGELLE, pure et testable. `canvasPx` = hauteur écran du
// CANVAS de l'arbre (T·z·r·2.7), l'échelle dans laquelle les fractions ci-dessus
// s'expriment. La largeur du réglage sert de PLANCHER : on ne rétrécit jamais
// une margelle sous sa taille de recette, on l'élargit quand les racines
// débordent. 0.92 est l'ancre verticale des arbres de la carte (drawIsoLive).
export function grateFit(ratio, hPx, foot, canvasPx, margin) {
  const wantW = Math.max(hPx * ratio, foot.footW * canvasPx * margin);
  return {
    hPx: wantW / ratio,
    ox: (foot.footCx - 0.5) * canvasPx,
    oy: (foot.footBottom - 0.92) * canvasPx,
  };
}

// GÉOMÉTRIE DU BLIT, isolée et PURE pour être testable sans canvas ni image.
// Contrat : l'ENCRE fait `hPx` de haut, son BAS touche (px, py) et son CENTRE
// horizontal s'aligne sur px. Le canvas entier suit à la même échelle, son vide
// transparent débordant librement — c'est lui qui faisait « voler » les props
// quand on posait le bas du CANVAS sur le sol.
export function plazaAnchor(bb, iw, ih, px, py, hPx) {
  const k = hPx / (bb.h || 1);
  return {
    dx: px - (bb.x0 + bb.w / 2) * k,
    dy: py - (bb.y0 + bb.h) * k,
    dw: (iw || 1) * k,
    dh: (ih || 1) * k,
    inkW: bb.w * k,
  };
}

// ── DESSIN D'UN PROP ────────────────────────────────────────────────────────
// Ombre DOUCE au pied et rien d'autre — le socle carré a été rejeté (il marque
// le conflit au lieu de le régler) — et calée sur la LARGEUR D'ENCRE, pas sur
// celle du canvas, sinon elle déborde de l'objet.
export function drawIsoPlazaProp(ctx, rec, era) {
  const T = CM.TILE, z = CM.cam.zoom;
  const p = worldToScreen(rec.wx, rec.wy);
  let hPx = rec.hT * T * z * PLAZA_TUNE.propScale;
  if (hPx < 1.5) return;                        // sous le pixel : rien à montrer
  const im = propImage(rec.prop, era, rec.variant);
  if (!im) {
    if (PLAZA_TUNE.placeholders && !NO_PLACEHOLDER.has(rec.prop)) drawPlaceholder(ctx, p, hPx, rec);
    return;
  }
  const bb = inkBox(im);
  if (!bb) return;                              // sprite entièrement transparent
  let px = p.x, py = p.y;
  // MARGELLE : recalée sur le pied MESURÉ de SON arbre — centrée sur le tronc,
  // assez large pour contenir les racines, posée sur le bas d'encre réel de la
  // variante. Tant que le sprite d'arbre n'est pas décodé, on garde le réglage
  // de la recette (rien ne saute, la margelle se recale au décodage).
  if (rec.treeV) {
    const m = treeFootMetrics(rec.treeV);
    if (m) {
      const canvasPx = rec.treeR * 2.7 * T * z;
      const g2 = grateFit(bb.w / bb.h, hPx, m, canvasPx, PLAZA_TUNE.grateMargin);
      hPx = g2.hPx; px += g2.ox; py += g2.oy;
    }
  }
  const g = plazaAnchor(bb, im.naturalWidth, im.naturalHeight, px, py, hPx);
  // Pas d'ombre sous une margelle : elle est À PLAT dans le dallage, elle ne se
  // détache pas du sol — et son arbre porte déjà la sienne.
  if (PLAZA_TUNE.shadow > 0 && !rec.treeV) {
    const rx = g.inkW * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,' + PLAZA_TUNE.shadow + ')';
    ctx.beginPath();
    ctx.ellipse(px, py, rx, rx * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (rec.front) {
    // Seule la MOITIÉ BASSE de l'encre : sur une ellipse posée au sol et vue en
    // iso, c'est exactement l'arc AVANT. Découpe en px écran autour du point
    // d'ancrage (py = bas de l'encre), pas en fraction du canvas — le canvas
    // porte du vide dont la part varie d'un sprite à l'autre.
    const cut = hPx * PLAZA_TUNE.grateFrontF;
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.dx, py - cut, g.dw, cut);
    ctx.clip();
    ctx.drawImage(im, g.dx, g.dy, g.dw, g.dh);
    ctx.restore();
  } else {
    ctx.drawImage(im, g.dx, g.dy, g.dw, g.dh);
    lightCutImage(im, g.dx, g.dy, g.dw, g.dh);  // le halo derrière ne traverse pas
  }
  ctx.imageSmoothingEnabled = prev;
}

// Gabarit plat : un prop sans aucun art existe quand même à l'écran, à SA
// taille, pour que la COMPOSITION se juge avant que l'art soit produit. Volontai-
// rement terne et cerné — personne ne doit le confondre avec un rendu fini.
function drawPlaceholder(ctx, p, hPx, rec) {
  const w = hPx * aspectOf(rec.prop);
  ctx.fillStyle = 'rgba(72,66,58,0.55)';
  ctx.strokeStyle = 'rgba(232,224,206,0.7)';
  ctx.lineWidth = 1;
  ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y - hPx), Math.round(w), Math.round(hPx));
  ctx.strokeRect(Math.round(p.x - w / 2) + 0.5, Math.round(p.y - hPx) + 0.5, Math.round(w) - 1, Math.round(hPx) - 1);
  if (hPx > 14) {
    ctx.fillStyle = 'rgba(232,224,206,0.9)';
    ctx.font = Math.round(Math.min(11, hPx * 0.34)) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(rec.prop[0].toUpperCase(), p.x, p.y - hPx * 0.35);
    ctx.textAlign = 'left';
  }
}

// ── OVERLAYS DE TRAVAIL ─────────────────────────────────────────────────────
// `grid`  : rôle de chaque cellule (losange teinté) + le cœur dégagé.
// `ruler` : l'ÉTALON — l'empreinte d'une maison 1×1 et une barre d'une tuile,
//           posées au coin de la place. C'est le seul juge honnête de la taille
//           d'un prop : on compare à l'œil, on ne calcule pas des mètres.
export function drawIsoPlazaGrid(ctx, comp) {
  const T = CM.TILE, z = CM.cam.zoom;
  const ROLE = { corner: 'rgba(226,138,86,0.30)', edge: 'rgba(120,180,226,0.24)', inner: 'rgba(150,150,150,0.13)' };
  if (PLAZA_TUNE.grid) {
    for (const c of comp.cells) {
      const a = worldToScreen(c.gx * T, c.gy * T);
      const b = worldToScreen((c.gx + 1) * T, c.gy * T);
      const d = worldToScreen((c.gx + 1) * T, (c.gy + 1) * T);
      const e = worldToScreen(c.gx * T, (c.gy + 1) * T);
      ctx.fillStyle = ROLE[c.role];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y);
      ctx.closePath(); ctx.fill();
    }
    // Cercle du cœur dégagé (projeté : une ellipse iso, pas un rond).
    const c0 = worldToScreen(comp.cxc * T, comp.cyc * T);
    ctx.strokeStyle = 'rgba(255,120,120,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(c0.x, c0.y, PLAZA_TUNE.coreR * T * z * 2, PLAZA_TUNE.coreR * T * z, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (PLAZA_TUNE.ruler) {
    const rx = comp.box.gx0, ry = comp.box.gy1 + 1.6;
    const f = worldToScreen((rx + 1) * T, (ry + 1) * T);
    // Silhouette d'une maison 1×1 (largeur 0.78 cellule, hauteur HOUSE_HT).
    const hw = 0.78 * 2 * T * z, hh = HOUSE_HT * T * z;
    ctx.fillStyle = 'rgba(40,36,32,0.45)';
    ctx.fillRect(f.x - hw / 2, f.y - hh, hw, hh);
    ctx.strokeStyle = 'rgba(255,220,150,0.9)'; ctx.lineWidth = 1;
    ctx.strokeRect(f.x - hw / 2 + 0.5, f.y - hh + 0.5, hw - 1, hh - 1);
    // Barre d'UNE tuile de haut (hT = 1) juste à côté : l'unité des recettes.
    const u = T * z;
    ctx.fillStyle = 'rgba(255,220,150,0.9)';
    ctx.fillRect(f.x + hw / 2 + 6, f.y - u, 3, u);
    ctx.font = '10px monospace';
    ctx.fillText('hT 1', f.x + hw / 2 + 12, f.y - 2);
    ctx.fillText('maison ' + HOUSE_HT, f.x - hw / 2, f.y + 12);
  }
}

export { PLAZA_TUNE, RECIPES, HOUSE_HT, houseF, TALL_PROPS, personHT, ADULT_SCALE };
