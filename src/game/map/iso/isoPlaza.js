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
//   transparent, lumière haut-gauche, palette de l'ère). Un sprite manquant
//   tombe sur un GABARIT plat — visible tout de suite, donc réparable.
//
//   ⚠ UN REPLI SUR LE KIT TOP-DOWN A VÉCU ICI (/pixelart/plazas/, 45 sprites),
//   utile tant que l'art iso n'existait pas. Retiré le 2026-08-23 (Q3 du plan de
//   suppression du legacy) : l'art iso est complet, et ce repli était devenu le
//   piège que `LEGACY_PROP` documentait déjà prop par prop — un sprite DE FACE
//   posé au milieu d'une vue 3/4 sans que rien ne casse. Le bac (2026-08-07) et
//   le puits y étaient déjà passés. **On préfère l'échec bruyant.**
//   La garde qui rend la coupe sûre est dans isoPlaza.test.js — « aucun prop de
//   place ne retombe sur le kit TOP-DOWN » vérifie SUR LE DISQUE que chaque
//   (prop, variante, ère) réellement posé a son fichier iso.
//
//   Ce module ne dépend PAS de isoRenderer (il serait circulaire) : il ne lit
//   que CM/cmHash, la projection et le calque de lumière.
// ============================================================================

import { CM, cmHash, treeCanvasT } from '../layout.js';
import { solInvalidate } from './solInvalidate.js';
import { AGENT_SCALE, agentSetForBand, agentSpecFor, drawNamedAgentIso } from '../agents.js';
import { buildFolk, folkAt, folkRev } from './plazaFolk.js';
import { noteFig, FIG } from '../figures.js';
import { worldToScreen, depthOf } from './projection.js';
import { lightCutImage, lightCtx } from '../lightLayer.js';
import { drawSunShadow } from './isoSunShadow.js';
import { stallVideProp } from './isoFamine.js';
import { streetKitLampArt } from './streetKits.js';

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
const TALL_PROPS = new Set(['flag', 'statue', 'obelisk', 'tree', 'fountain-forum', 'bandstand',
  'stall-red', 'stall-ochre', 'stall-blue', 'stall-green', 'stall-yellow', 'stall-cyan', 'stall-magenta', 'stall-amber']);

// ── MOLETTE DE RÉGLAGE ──────────────────────────────────────────────────────
// `rev` s'incrémente à chaque réglage : la composition mémoïsée se reconstruit
// sans avoir à recharger la page.
const PLAZA_TUNE = {
  mode: 'kit',        // 'kit' (composée) | 'scene' (ancien PNG) | 'off'
  propScale: 1,       // multiplie TOUTES les hauteurs
  // Géométrie de la composition (cf. § COMPOSITION) — tout en CELLULES.
  // PLAFOND de bancs par côté. `null` = suivre la recette de l'ère (6 au forum
  // antique, 8 au square moderne) ; un nombre posé ici PASSE DEVANT elle.
  // ⚠ La molette doit garder le dernier mot. Quand c'était la recette qui gagnait,
  // __plaza({benchPerSide}) ne faisait plus rien du tout — depuis la densification
  // du 2026-08-03, TOUTES les ères en déclarent un, donc la branche molette était
  // devenue inatteignable. C'est toujours un MAXIMUM : un côté trop court en met
  // moins, tout seul.
  benchPerSide: null,
  furnScale: 1,       // grossit ou rapetisse TOUT le mobilier en `p` d'un coup
  // Ce qui tient le CENTRE — jamais vide. 'auto' TIRE par place : certaines ont
  // leur fontaine, d'autres un arbre (« ça dépend de la place »). 'fountain' et
  // 'tree' forcent. Le tirage est graîné sur le COIN de la place, donc stable :
  // une place ne change pas d'avis d'une frame à l'autre.
  centre: 'auto',
  centreTreeP: 0.4,   // part des places qui prennent un arbre plutôt qu'une fontaine
  pairTight: 0.95,    // serrage du duo de bancs, en largeurs de banc
  benchInset: 0.62,   // distance du bord de la place au pied du banc
  cornerKeep: 1.0,    // dégagement gardé à chaque coin (les lampadaires y sont)
  sideGap: 0.68,      // écart banc ↔ compagnon le long du bord
  // Arbres sur la place — PLAFOND DUR, au-dessus de la recette comme de l'emprise.
  // Relevé de 2 à 4 avec la densification du 2026-08-03 : le square moderne veut
  // son jardin, et le laisser à 2 aurait rendu ce plafond MENTEUR — la recette le
  // franchissait sans que rien ne le dise.
  treeMax: 4,
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
  // (`shadow`, l'ellipse douce au pied, est partie le 2026-09-30 : l'ombre du
  //  soleil la remplace, cf. drawIsoPlazaProp.)
  grid: false,        // overlay : rôles des cellules + empreintes
  ruler: false,       // overlay : étalon (empreinte de maison + barre de tuile)
  // EAU ANIMÉE des fontaines. 240 ms par frame et pas 120 : à 120 les
  // ondulations « allaient trop vite » (retour Raph sur l'ancienne scène), une
  // eau de fontaine doit rester paisible.
  anim: true,
  animMs: 240,
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
// ⚠ RÉPARTITION CORRIGÉE le 2026-09-30 (docs/PLAN-MAQUETTE-VIVANTE.md, « rien sans
// raison ») : le kit « antique » (fontaine de marbre, bancs de pierre) servait aux
// bandes 2-3 — Pierre taillée et Couronne, maisons à colombages — et le kit
// « medieval » (bois, tonneaux) à la bande 4, l'âge du MARBRE, habitants en toge.
// Les deux kits existaient ; seule la table était inversée.
export const plazaEraForBand = (band) => (band >= 7 ? 'cosmic' : band >= 6 ? 'modern'
  : band >= 5 ? 'industrial' : band >= 4 ? 'antique' : band >= 2 ? 'medieval' : null);
// Ère iso → grappe du kit top-down legacy (repli d'art tant que l'iso manque).
// ⚠ DEUX TABLES ONT VÉCU ICI — `LEGACY_ERA` (nom d'ère iso → nom du kit top-down :
// medieval → classique, cosmic → futuriste…) et `LEGACY_PROP` (nom d'objet iso → nom
// du kit, `null` = pas d'équivalent). Elles pilotaient le repli de `propImage` sur
// /pixelart/plazas/. Retirées le 2026-08-23 avec le kit lui-même (Q3).
//
// Ce n'était pas une nouvelle décision : la table s'était déjà vidée d'elle-même,
// prop par prop, et chaque `null` portait sa raison écrite. Le BAC y est passé le
// 2026-08-07 — posé sans variante, il ne trouvait pas d'iso et sortait DE FACE au
// milieu d'une place en 3/4, sans que rien ne casse. Le PUITS ensuite : son repli
// sur la fontaine aurait banalisé la pièce maîtresse de la place à travers toute la
// ville, en silence. À chaque fois la même conclusion, écrite noir sur blanc :
// **on préfère l'échec bruyant**, parce qu'un gabarit gris se voit tout de suite.
// Ne restaient vivants que `bench` et `fountain` ; le reste (`bush`, `flag`,
// `amphora`) n'est émis par aucune recette. Il n'y avait plus de repli à garder,
// seulement un piège à retirer.
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
// DENSIFICATION DE TOUTES LES ÈRES (Raph 2026-08-03, suite du lot P cosmique :
// « les places d'avant l'ère cosmique sont nues ») : au dézoom, seuls les ARBRES
// et la garniture de cœur se voient — le mobilier à l'échelle du corps disparaît.
// Chaque ère reçoit donc ses surcharges benchPerSide / treeWant / field, en
// PROGRESSION STRICTE vers le cosmique (même principe que la fontaine qui
// grandit) : la place médiévale respire (2 arbres), le square moderne est un
// jardin (4). Le filet anti-chevauchement et la géométrie des côtés restent les
// juges : une petite place en met moins toute seule, rien ne déborde.
// ⚠ ORDRE DES BANDES depuis le 2026-09-30 : medieval (bandes 2-3) puis antique
// (bande 4, le Marbre) — cf. plazaEraForBand. Les réglages qui GRANDISSENT avec
// l'ère (fontaine, arbres) ont suivi : la progression reste strictement croissante
// dans l'ordre où le joueur traverse les bandes.
const RECIPES = {
  medieval: {
    centre: { prop: 'fountain', p: 1.25 },
    bench: { p: 0.70 },
    side: [{ prop: 'planter', p: 0.55 }, { prop: 'bin', p: 0.52 }],
    trees: true,
    grate: { p: 0.44 },
    lamps: 'corners',
    benchPerSide: 6,
    treeWant: 2,
    field: [{ prop: 'planter', p: 0.55 }],
  },
  antique: {
    centre: { prop: 'fountain', p: 1.60 },
    bench: { p: 0.70 },
    side: [{ prop: 'planter', p: 0.55 }, { prop: 'bin', p: 0.52 }],
    trees: true,
    grate: { p: 0.44 },
    lamps: 'corners',
    benchPerSide: 6,
    treeWant: 3,
    field: [{ prop: 'planter', p: 0.55 }],
  },
  industrial: {
    centre: { prop: 'fountain', p: 1.95 },
    bench: { p: 0.70 },
    side: [{ prop: 'planter', p: 0.55 }, { prop: 'bin', p: 0.52 }],
    trees: true,
    grate: { p: 0.44 },
    lamps: 'corners',
    benchPerSide: 6,
    treeWant: 3,
    field: [{ prop: 'planter', p: 0.55 }],
  },
  modern: {
    centre: { prop: 'fountain', p: 2.25 },
    bench: { p: 0.68 },
    side: [{ prop: 'planter', p: 0.55 }, { prop: 'bin', p: 0.52 }],
    trees: true,
    grate: { p: 0.44 },
    lamps: 'corners',
    benchPerSide: 8,
    treeWant: 4,
    field: [{ prop: 'planter', p: 0.55 }],
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
    // DENSIFICATION (Raph 2026-08-03, chantier mégalopole — PLAN-TISSU-URBAIN
    // §10 lot P) : à côté de monolithes de 11 tuiles, la place au mobilier de
    // village faisait parvis VIDE. Une place de mégalopole est PLEINE : deux
    // fois plus de bancs (le côté trop court en met moins tout seul), un
    // JARDIN de quatre arbres autour de la pièce maîtresse, et une garniture
    // de cœur (jardinières aux quatre axes, passées au filet — elles cèdent
    // la place au lieu de se chevaucher). Ces surcharges sont descendues à
    // TOUTES les ères le 2026-08-03, en progression stricte : PLAZA_TUNE ne
    // porte donc plus le défaut, seulement le dernier mot de la molette.
    benchPerSide: 8,
    treeWant: 4,
    field: [{ prop: 'planter', p: 0.55 }],
  },
};

// ── LA SORTE DE CHAQUE PLACE ────────────────────────────────────────────────
// Le plan de ville (procedural/cityPlan.js, buildPlazas) nomme chaque place :
// 'centrale' (le cœur historique), 'marche' (quartier marchand), 'parvis'
// (quartier religieux), 'jardin' (square de prestige, bandes 4+). Jusqu'au
// 2026-09-30 ce nom ne servait qu'aux NOMS de rue (cityNaming) : toutes les places
// recevaient le même mobilier, et c'est une grande part de ce que Raph a vu —
// « elles font vides ou surchargées, elles ne sont pas festives, pas un endroit
// qui a l'air agréable pour que les gens s'arrêtent ».
//
// Une boîte prend la sorte de la place du plan dont le centre tombe dedans (à une
// cellule près), sinon de la plus proche. SANS PLAN (villes de test : un réseau de
// rues nu), pas de sorte : la recette de l'ère seule, comme avant — c'est elle que
// gardent les invariants de isoPlaza.test.js.
export function plazaKindOfBox(L, box) {
  const ps = L && L.plan && L.plan.plazas;
  if (!ps || !ps.length || !box) return null;
  const cx = (box.gx0 + box.gx1) / 2, cy = (box.gy0 + box.gy1) / 2;
  let best = null, bd = Infinity;
  for (const p of ps) {
    const dedans = p.gx >= box.gx0 - 1 && p.gx <= box.gx1 + 1 && p.gy >= box.gy0 - 1 && p.gy <= box.gy1 + 1;
    const d = Math.hypot(p.gx - cx, p.gy - cy) - (dedans ? 1e6 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  return (best && best.kind) || null;
}
// Case de place → { sorte, anneau }, par layout (les clôtures et le sol en ont
// besoin, cf. isoFence et isoGroundResolve).
let _kindCache = { at: -1, map: null };
function plazaCellInfo(L, key) {
  if (_kindCache.at !== CM.layoutRecomputeAt || !_kindCache.map) {
    const map = new Map();
    for (const box of isoPlazaBoxes(L)) {
      const kind = plazaKindOfBox(L, box);
      if (!kind) continue;
      for (const c of isoPlazaCells(L, box)) map.set(c.gx + ',' + c.gy, { kind, r: c.r });
    }
    _kindCache = { at: CM.layoutRecomputeAt, map };
  }
  return _kindCache.map.get(key) || null;
}
export function plazaKindAtCell(L, key) {
  const i = plazaCellInfo(L, key);
  return i ? i.kind : null;
}
// LE SQUARE A SA PELOUSE : l'anneau extérieur d'une place 'jardin' est de l'HERBE
// (le pré fleuri de la carte), son cœur reste dallé autour de la fontaine. Dallé de
// bout en bout, le square n'était qu'une esplanade grillagée — « vide ».
// Molette : __plaza({ lawn: false }) rend le dallage plein.
export function plazaLawnAtCell(L, key) {
  if (PLAZA_TUNE.lawn === false) return false;
  const i = plazaCellInfo(L, key);
  return !!(i && i.kind === 'jardin' && i.r === 0);
}

// ── LES KITS PAR SORTE (docs/PLAN-MAQUETTE-VIVANTE.md, lot 2) ────────────────
// Surchargent la recette de l'ÈRE pour UNE sorte de place. Une ère sans kit garde
// sa recette partout (antique = ère pilote ; médiévale et industrielle depuis la nuit
// du 2026-10-01 ; moderne et cosmique à suivre).
//   centre      : la pièce maîtresse, IMPOSÉE (pas de tirage fontaine/arbre)
//   sideItem    : ce qui borde la place À LA PLACE des duos de bancs (les étals du
//                 marché) — un par emplacement, couleur tournante
//   sidePerSide : combien d'emplacements par côté au plus
//   people      : des passants ARRÊTÉS — autour de la pièce maîtresse ('centre')
//                 ou devant les étals ('stalls') ; « un endroit où s'arrêter »
//   garland     : des fanions tendus d'un réverbère de coin à l'autre — la fête
// Les tailles restent en `p` (multiples d'un habitant), comme tout le mobilier.
const KIND_KITS = {
  antique: {
    // LE FORUM : une vraie fontaine monumentale qu'on voit de loin, trois arbres
    // d'ombrage autour, un seul duo de bancs par côté (au lieu de trois : la
    // rangée de bancs était la moitié du « surchargé »), des massifs fleuris sur
    // les axes, du monde autour de l'eau, des fanions.
    centrale: {
      // p 5 : ~69 px au zoom 1 pour 61 px d'encre — la fontaine passe au GRAIN des
      // maisons (1,1 px d'écran par pixel d'art), plus haute qu'une maison : un monument.
      centre: { prop: 'fountain-forum', p: 5.0 }, centreForce: true,
      // Compagnons des bancs : la jardinière seule — les corbeilles semaient des
      // petits tonneaux partout, la « poussière de mobilier » de l'audit.
      benchPerSide: 2, treeWant: 3, side: [{ prop: 'planter', p: 0.55 }],
      field: [{ prop: 'flowerbed', p: 1.1 }],
      people: { mode: 'centre', n: 7 }, garland: true,
    },
    // LE MARCHÉ : des étals à auvents rayés tout autour, tournés vers le centre,
    // des amphores et des cageots entre eux, un puits au milieu, des acheteurs
    // devant chaque étal.
    marche: {
      centre: { prop: 'well', p: 1.1 }, centreForce: true,
      // Pas d'arbre (il mangeait deux étals sur une place de 4×4) et une marge de
      // coin réduite : les étals se serrent jusqu'aux réverbères, comme un vrai marché.
      sideItem: { prop: 'stall', colors: ['red', 'ochre', 'blue'], p: 2.0 }, sidePerSide: 2,
      cornerKeep: 0.45, side: [{ prop: 'crates', p: 0.8 }], treeWant: 0, field: null,
      people: { mode: 'stalls', perItem: 2 }, garland: true,
    },
    // LE PARVIS : une statue sur son socle, quatre braseros autour, peu de bancs.
    parvis: {
      // Les braseros sur les DIAGONALES autour de la statue (`beds`) : sur une place
      // de 4×4, les axes n'ont pas la place de les porter.
      centre: { prop: 'statue', p: 4.0 }, centreForce: true,
      benchPerSide: 2, treeWant: 0, side: [], beds: { prop: 'brazier', p: 1.3 },
      field: [{ prop: 'brazier', p: 1.3 }],
      people: { mode: 'centre', n: 4 }, garland: false,
    },
    // LE SQUARE : la fontaine de quartier, quatre arbres, des massifs fleuris ;
    // c'est la seule sorte qui garde sa grille (cf. isoFence, arbitrage du 06/08).
    jardin: {
      // Deux arbres, et des massifs sur les diagonales qu'ils laissent libres
      // (`beds`) : les axes d'une place de 4×4 n'ont pas la place d'en porter.
      centre: { prop: 'fountain', p: 1.6 }, centreForce: true,
      benchPerSide: 2, treeWant: 2, side: [{ prop: 'planter', p: 0.55 }], beds: { prop: 'flowerbed', p: 1.1 },
      field: [{ prop: 'flowerbed', p: 1.1 }],
      people: { mode: 'centre', n: 3 }, garland: false,
    },
  },
  // ── LES AUTRES ÈRES (nuit du 2026-10-01, « finis toutes les époques ») ────────
  // Même grammaire que le pilote : chaque sorte a SA pièce maîtresse et SON
  // monde, dessinés pour l'ère (PixelLab, public/pixelart/iso/plaza/*-<ère>.png,
  // IDs dans le journal du plan). Avant : un sapin ou une petite fontaine au
  // milieu de bancs, sur toutes les places de toutes les ères.
  medieval: {
    // LA GRAND-PLACE : la fontaine gothique (bassin octogonal, pinacle, saint
    // doré), deux arbres, les massifs en clayonnage, du monde, des fanions.
    centrale: {
      centre: { prop: 'fountain-forum', p: 5.0 }, centreForce: true,
      benchPerSide: 2, treeWant: 2, side: [{ prop: 'planter', p: 0.55 }],
      field: [{ prop: 'flowerbed', p: 1.1 }],
      people: { mode: 'centre', n: 7 }, garland: true,
    },
    // LE MARCHÉ : tréteaux sous toiles rayées (pain et fromages, légumes, draps),
    // le puits au milieu, tonneaux et sacs de grain entre les étals.
    marche: {
      centre: { prop: 'well', p: 1.1 }, centreForce: true,
      sideItem: { prop: 'stall', colors: ['red', 'green', 'blue'], p: 2.0 }, sidePerSide: 2,
      cornerKeep: 0.45, side: [{ prop: 'crates', p: 0.8 }], treeWant: 0, field: null,
      people: { mode: 'stalls', perItem: 2 }, garland: true,
    },
    // LE PARVIS : le roi de pierre sur son socle armorié, quatre braseros de fer.
    parvis: {
      centre: { prop: 'statue', p: 4.0 }, centreForce: true,
      benchPerSide: 2, treeWant: 0, side: [], beds: { prop: 'brazier', p: 1.3 },
      field: [{ prop: 'brazier', p: 1.3 }],
      people: { mode: 'centre', n: 4 }, garland: false,
    },
    // LE JARDIN CLOS : la fontaine de quartier, deux arbres, les massifs.
    jardin: {
      centre: { prop: 'fountain', p: 1.6 }, centreForce: true,
      benchPerSide: 2, treeWant: 2, side: [{ prop: 'planter', p: 0.55 }], beds: { prop: 'flowerbed', p: 1.1 },
      field: [{ prop: 'flowerbed', p: 1.1 }],
      people: { mode: 'centre', n: 3 }, garland: false,
    },
  },
  industrial: {
    // LA PLACE DE L'HÔTEL DE VILLE : la grande fontaine de fonte à trois vasques,
    // trois arbres d'alignement, les massifs, la foule, les fanions de fête.
    centrale: {
      centre: { prop: 'fountain-forum', p: 5.0 }, centreForce: true,
      benchPerSide: 2, treeWant: 3, side: [{ prop: 'planter', p: 0.55 }],
      field: [{ prop: 'flowerbed', p: 1.1 }],
      people: { mode: 'centre', n: 7 }, garland: true,
    },
    // LE MARCHÉ DE PLEIN AIR : étals peints en vert sous toiles rayées (tomates et
    // fleurs, légumes, fromages et pain), bidons de lait et cageots entre eux.
    marche: {
      centre: { prop: 'well', p: 1.1 }, centreForce: true,
      sideItem: { prop: 'stall', colors: ['red', 'green', 'yellow'], p: 2.0 }, sidePerSide: 2,
      cornerKeep: 0.45, side: [{ prop: 'crates', p: 0.8 }], treeWant: 0, field: null,
      people: { mode: 'stalls', perItem: 2 }, garland: true,
    },
    // LE PARVIS : l'homme d'État de bronze sur son granit, quatre vasques de fonte
    // fleuries de géraniums autour.
    parvis: {
      centre: { prop: 'statue', p: 4.0 }, centreForce: true,
      benchPerSide: 2, treeWant: 0, side: [], beds: { prop: 'urn', p: 1.2 },
      field: [{ prop: 'urn', p: 1.2 }],
      people: { mode: 'centre', n: 4 }, garland: false,
    },
    // LE SQUARE : le KIOSQUE À MUSIQUE au milieu — la pièce du square du XIXe —,
    // deux arbres, les massifs de mosaïculture, et son public.
    jardin: {
      centre: { prop: 'bandstand', p: 4.2 }, centreForce: true,
      benchPerSide: 2, treeWant: 2, side: [{ prop: 'planter', p: 0.55 }], beds: { prop: 'flowerbed', p: 1.1 },
      field: [{ prop: 'flowerbed', p: 1.1 }],
      people: { mode: 'centre', n: 5 }, garland: false,
    },
  },
  modern: {
    // LA PLACE CIVIQUE : le bassin carré à jets et sa sphère d'acier. Bassin PLAT et
    // large : à p 5 (hauteur d'encre), il aurait couvert la moitié de la place — p 3,4.
    centrale: {
      centre: { prop: 'fountain-forum', p: 3.4 }, centreForce: true,
      benchPerSide: 2, treeWant: 3, side: [{ prop: 'planter', p: 0.55 }],
      field: [{ prop: 'flowerbed', p: 1.0 }],
      people: { mode: 'centre', n: 8 }, garland: true,
    },
    // LE MARCHÉ : étals sous parasols (fruits, fleurs, pain et fromages), cagettes de
    // plastique, la fontaine à boire au milieu.
    marche: {
      centre: { prop: 'well', p: 1.1 }, centreForce: true,
      sideItem: { prop: 'stall', colors: ['red', 'blue', 'yellow'], p: 2.0 }, sidePerSide: 2,
      cornerKeep: 0.45, side: [{ prop: 'crates', p: 0.8 }], treeWant: 0, field: null,
      people: { mode: 'stalls', perItem: 2 }, garland: true,
    },
    // LE PARVIS : la grande sculpture d'acier rouge, des massifs autour.
    parvis: {
      centre: { prop: 'statue', p: 4.0 }, centreForce: true,
      benchPerSide: 2, treeWant: 0, side: [], beds: { prop: 'flowerbed', p: 1.0 },
      field: [{ prop: 'flowerbed', p: 1.0 }],
      people: { mode: 'centre', n: 5 }, garland: false,
    },
    jardin: {
      centre: { prop: 'fountain', p: 1.6 }, centreForce: true,
      benchPerSide: 2, treeWant: 2, side: [{ prop: 'planter', p: 0.55 }], beds: { prop: 'flowerbed', p: 1.0 },
      field: [{ prop: 'flowerbed', p: 1.0 }],
      people: { mode: 'centre', n: 4 }, garland: false,
    },
  },
  cosmic: {
    // LA PLACE DES ANNEAUX : fontaine aux anneaux d'eau suspendus autour d'une flèche
    // de cristal ; jardin de bioluminescence ; foule ; guirlandes.
    centrale: {
      centre: { prop: 'fountain-forum', p: 5.0 }, centreForce: true,
      benchPerSide: 2, treeWant: 3, side: [{ prop: 'planter', p: 0.55 }],
      field: [{ prop: 'flowerbed', p: 1.1 }],
      people: { mode: 'centre', n: 8 }, garland: true,
    },
    // LE MARCHÉ : kiosques-cosses sous auvents translucides cyan / magenta / ambre,
    // caisses flottantes entre eux.
    marche: {
      centre: { prop: 'well', p: 1.1 }, centreForce: true,
      sideItem: { prop: 'stall', colors: ['cyan', 'magenta', 'amber'], p: 2.0 }, sidePerSide: 2,
      cornerKeep: 0.45, side: [{ prop: 'crates', p: 0.8 }], treeWant: 0, field: null,
      people: { mode: 'stalls', perItem: 2 }, garland: true,
    },
    // LE PARVIS : l'obélisque de cristal, quatre pylônes de lumière.
    parvis: {
      centre: { prop: 'statue', p: 4.5 }, centreForce: true,
      benchPerSide: 2, treeWant: 0, side: [], beds: { prop: 'brazier', p: 1.3 },
      field: [{ prop: 'brazier', p: 1.3 }],
      people: { mode: 'centre', n: 5 }, garland: false,
    },
    jardin: {
      centre: { prop: 'fountain', p: 1.6 }, centreForce: true,
      benchPerSide: 2, treeWant: 2, side: [{ prop: 'planter', p: 0.55 }], beds: { prop: 'flowerbed', p: 1.1 },
      field: [{ prop: 'flowerbed', p: 1.1 }],
      people: { mode: 'centre', n: 4 }, garland: false,
    },
  },
};
// Les sortes qui gardent leur GRILLE (arbitrage de Raph du 2026-08-06 : « une
// enceinte percée d'entrées se lit comme un square clos ») — le square seul ; le
// forum, le marché et le parvis sont des lieux publics ouverts.
export const FENCED_KINDS = new Set(['jardin']);

// ── BANDES D'ANIMATION ──────────────────────────────────────────────────────
// /pixelart/iso/plaza/anim/<prop>-<ère>.png : une bande HORIZONTALE de N frames
// carrées, au format EXACT du sprite statique (même canvas). Le nombre de frames
// se déduit de largeur/hauteur — aucune méta à tenir à jour.
//
// ⚠ L'ancrage vient du sprite STATIQUE, pas de la frame : mesurer l'encre frame
// par frame la ferait bouger d'une image à l'autre, et la fontaine tremblerait
// sur son socle. Les frames partagent le canvas du statique, donc la même
// géométrie de blit vaut pour toutes.
//
// ⚠ LISTE EXPLICITE, et pas « on demande, on verra bien ». Sonder chaque prop
// faisait réclamer une bande pour le banc, le bac, la corbeille et la margelle :
// en dev Vite REND 200 sur un fichier absent (repli SPA, c'est de l'HTML), donc
// rien ne cassait et rien ne se voyait — mais le .exe, lui, les compte en
// ERR_FILE_NOT_FOUND. Un prop qui s'anime se déclare ici.
// La grande fontaine du forum, de la grand-place et de l'hôtel de ville en est
// aussi : arrivée avec les places par sorte SANS bande, elle restait de pierre
// au centre de la place (Raph, 2026-10-03 : « les fontaines des places ne sont
// plus animées »).
export const ANIM_PROPS = new Set(['fountain', 'fountain-forum']);
function propAnim(prop, era) {
  if (!ANIM_PROPS.has(prop)) return null;
  const e = art('/pixelart/iso/plaza/anim/' + prop + '-' + era + '.png');
  if (!e.ready) return null;
  const w = e.img.naturalWidth | 0, h = e.img.naturalHeight | 0;
  const n = h > 0 ? Math.max(1, Math.round(w / h)) : 1;
  return n > 1 ? { img: e.img, n, fw: w / n, fh: h } : null;
}

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
  well: 0.9,                            // puits de quartier : un peu plus haut que large
  brazier: 0.6, flowerbed: 1.8, crates: 1.2,
  bandstand: 1.0,                       // kiosque à musique : aussi large que haut
  urn: 0.6,                             // vasque de fonte sur socle
  person: 0.5,                          // un passant arrêté (kits par sorte)
};
// Props qui ne prennent JAMAIS de gabarit : une grille absente doit laisser le
// pied de l'arbre nu, pas y poser un bloc gris sous chaque arbre de la place.
const NO_PLACEHOLDER = new Set(['grate']);
// Empreinte au sol d'un mât : elle n'existe QUE pour le filet — un arbre posé
// au coin ne doit pas venir sur un lampadaire.
const LAMP_HW = 0.2;
// 'stall-red' → 'stall', 'fountain-forum' → 'fountain' : la famille donne l'aspect.
const aspectOf = (prop) => PROP_ASPECT[prop] || PROP_ASPECT[String(prop).split('-')[0]] || 1;

// EMPREINTE ÉCRAN D'UN PROP, en TUILES — l'UNIQUE implémentation. Le mobilier de
// trottoir (isoStreetProps) s'en sert pour son propre filet : il pose les MÊMES
// objets, avec le même art, il doit les encombrer pareil. Une seconde table
// d'aspects là-bas aurait dérivé à la première taille retouchée ici.
//
// On compare EN ESPACE ÉCRAN, seul endroit où « ça se chevauche » veut dire
// quelque chose : deux props éloignés dans le monde peuvent se superposer à
// l'écran en iso. sx = gx − gy, sy = (gx + gy) / 2 — donc indépendant du zoom.
// `hh` = 0.4·hw : un objet posé au sol occupe en profondeur une fraction de sa
// largeur, la vue 3/4 écrase l'axe vertical.
export function propFootprint(gxf, gyf, prop, hT) {
  const hw = hT * aspectOf(prop) * 0.5;
  return { sx: gxf - gyf, sy: (gxf + gyf) * 0.5, hw, hh: hw * 0.4 };
}
// Deux empreintes se chevauchent-elles ? `gap` < 1 tolère un recouvrement (les
// objets d'une rue se frôlent sans se gêner), > 1 les écarte.
export function footClash(a, b, gap) {
  return Math.abs(a.sx - b.sx) < (a.hw + b.hw) * gap
    && Math.abs(a.sy - b.sy) < (a.hh + b.hh) * gap;
}
// Empreinte d'un MÂT de lampadaire : il n'a pas de recette, mais il encombre.
export const lampFootprint = (gxf, gyf) => ({
  sx: gxf - gyf, sy: (gxf + gyf) * 0.5, hw: LAMP_HW, hh: LAMP_HW * 0.4,
});

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
  // La SORTE de la place (plan de ville) choisit son kit, s'il existe pour l'ère.
  const kind = plazaKindOfBox(L, box);
  const kit = kind && KIND_KITS[era] ? KIND_KITS[era][kind] : null;
  const R = RECIPES[era] ? (kit ? { ...RECIPES[era], ...kit } : RECIPES[era]) : null;
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

  // FILET ANTI-CHEVAUCHEMENT. L'empreinte vient de `propFootprint` (§ EMPREINTE
  // ÉCRAN plus haut) — la même que celle du mobilier de trottoir, une seule
  // implémentation pour un seul art.
  const placed = [];
  const foot = (gxf, gyf, prop, hT) => propFootprint(gxf, gyf, prop, hT);
  const fits = (gxf, gyf, prop, hT) => {
    const f = foot(gxf, gyf, prop, hT);
    for (const o of placed) if (footClash(f, o, PLAZA_TUNE.minGap)) return false;
    placed.push(f);
    return true;
  };
  // Réservation INCONDITIONNELLE : ce qui a la priorité absolue (la pièce
  // maîtresse) ne demande pas la permission au filet, il s'impose et le reste
  // s'écarte. Sans ça, un centre pourrait être refusé et la place resterait
  // vide en son milieu.
  const reserve = (gxf, gyf, prop, hT) => { placed.push(foot(gxf, gyf, prop, hT)); };

  const add = (prop, variant, gxf, gyf, hT, extra) => {
    if (!fits(gxf, gyf, prop, hT)) return false;
    const wx = gxf * T, wy = gyf * T;
    props.push({ prop, variant, wx, wy, hT, d: depthOf(wx, wy), ...extra });
    return true;
  };

  // ── POSE D'UN ARBRE, factorisée ─────────────────────────────────────────────
  // Le CENTRE de la place peut être tenu par un arbre aussi bien que par une
  // fontaine, et c'est exactement le même geste : remontée au-dessus de la
  // margelle, margelle en deux morceaux qui encadrent l'arbre, item au format
  // des arbres de la CARTE. `net` = passer par le filet d'empreinte ; le centre
  // ne le franchit pas, il s'impose.
  const treeHT = TREE_INK_HT * PLAZA_TUNE.treeR;
  // AMORÇAGE des mesures de pied : sans cet appel, le chargement des sprites
  // d'arbre ne démarrait qu'au premier dessin de margelle — et si la margelle
  // manquait, jamais. Même piège que `ensureProps()` sur les scènes de moteur.
  for (let v = 1; v <= 4; v += 1) treeFootMetrics(v);
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
      // `fixed` : l'arbre de place est EXEMPT du multiplicateur d'ère (cf.
      // TREE_TUNE, layout.js) — ce canvas doit rester celui du dessin.
      const canvasT = treeCanvasT(PLAZA_TUNE.treeR, true);
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
      // `fixed` : exempt du multiplicateur d'ère (TREE_TUNE) — margelle et
      // recette de place sont cotées sur CE canvas, et un parc de poche garde
      // son arbre monumental au milieu des tours.
      tr: { gx, gy, jx: tx - 0.5 - gx, jy: ty - 0.9 - gy, r: PLAZA_TUNE.treeR, _tv: tv, fixed: true },
    });
    trees += 1;
    return true;
  };

  // 0. Les MÂTS d'abord, dans le filet seulement : ils sont dessinés par le
  //    système de lampadaires, mais rien ne doit venir se poser dessus.
  const lamps = buildLamps(box, w, h, R, T);
  for (const lp of lamps) placed.push(lampFootprint(lp.wx / T, lp.wy / T));

  // 1. LE CENTRE N'EST JAMAIS VIDE (« il faut que le centre de la place soit
  //    pris, soit par un arbre, soit une fontaine, mais obligatoirement quelque
  //    chose »). Au milieu GÉOMÉTRIQUE — une place de largeur paire n'a pas de
  //    cellule centrale. Posé en PREMIER et SANS demander au filet : la pièce
  //    maîtresse s'impose, tout le reste s'écarte d'elle.
  //    `centre` de la molette : 'fountain' (défaut, si la recette en a une),
  //    'tree' pour un arbre, 'auto' = fontaine sinon arbre.
  const veutArbre = !R.centreForce && (PLAZA_TUNE.centre === 'tree' || !R.centre
    || (PLAZA_TUNE.centre === 'auto' && R.trees
        && h01('plz' + sd + ':centre') < PLAZA_TUNE.centreTreeP));
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
  // LA RÈGLE DU DUO, opposable à TOUTE garniture. Un banc doit avoir son jumeau
  // pour plus proche voisin — c'est la demande de Raph (« 2 bancs côte à côte »),
  // et une garniture qui s'intercale la casse : la rangée se lit alors comme des
  // bancs isolés séparés par des bacs. Les bacs de BOUT de rangée respectaient
  // déjà l'écart `mate` ≥ 1,2 duo, avec le commentaire qui l'explique ; ceux des
  // INTERVALLES et la garniture de cœur, eux, ne demandaient rien à personne.
  // Le défaut a dormi tant qu'un côté ne portait que deux duos — l'intervalle
  // était large. À trois duos sur un côté de 6 cellules (densification du
  // 2026-08-03) le bac tombe à 0,44 tuile d'un banc alors que le duo est serré à
  // 0,45 : le jumeau perd. On MESURE donc, au lieu de supposer que l'écart suffit.
  const benchPts = [];
  const loinDesBancs = (gxf, gyf) => !benchPts.some(
    ([bx, by]) => Math.hypot(bx - gxf, by - gyf) <= duo,
  );

  // LES ÉTALS (kit du marché) : un par emplacement, tourné vers le centre, la
  // couleur de l'auvent tourne d'un étal à l'autre (décalée par place). Les
  // cageots vont dans les intervalles, comme les bacs entre les duos de bancs.
  const stalls = [];
  if (R.sideItem) {
    const S = R.sideItem, hS = hOf(S.prop, S);
    const wS = hS * aspectOf(S.prop);
    const off = Math.floor(h01('plz' + sd + ':stall') * S.colors.length);
    const keep = R.cornerKeep != null ? R.cornerKeep : PLAZA_TUNE.cornerKeep;
    for (let si = 0; si < SIDES.length; si += 1) {
      const side = SIDES[si];
      const usable = side.span - 2 * keep;
      let g = Math.max(0, R.sidePerSide | 0);
      while (g > 1 && usable / g < wS * PLAZA_TUNE.minGap) g -= 1;
      const segAt = (k) => side.base + (k - (g - 1) / 2) * (usable / Math.max(1, g));
      for (let k = 0; k < g; k += 1) {
        const [sx, sy] = at(side, segAt(k));
        const col = S.colors[(off + si * 2 + k) % S.colors.length];
        if (add(S.prop + '-' + col, side.face, sx, sy, hS)) stalls.push({ x: sx, y: sy, face: side.face, hT: hS });
      }
      if (R.side && R.side.length && g > 0) {
        const creux = [segAt(0) - usable / (2 * g), segAt(g - 1) + usable / (2 * g)];
        for (let k = 1; k < g; k += 1) creux.push((segAt(k - 1) + segAt(k)) / 2);
        for (let mi = 0; mi < creux.length; mi += 1) {
          const pick = R.side[Math.floor(h01('plz' + sd + ':c:' + si + ':' + mi) * R.side.length) % R.side.length];
          const [mx, my] = at(side, creux[mi]);
          add(pick.prop, side.face, mx, my, hOf(pick.prop, pick));
        }
      }
    }
  }
  for (let si = 0; si < SIDES.length && !R.sideItem; si += 1) {
    const side = SIDES[si];
    // COMBIEN DE GROUPES TIENNENT ICI. `benchPerSide` est un MAXIMUM de bancs :
    // en duos, cela fait au plus benchPerSide/2 groupes. Un groupe entier doit
    // tenir, et deux groupes voisins ne doivent pas se toucher — d'où le pas
    // minimal entre eux. Un côté trop court en met moins, tout seul.
    const usable = side.span - 2 * PLAZA_TUNE.cornerKeep;
    // Plafond de bancs : la MOLETTE d'abord — elle sert à régler, donc elle
    // tranche — sinon la recette de l'ère. La géométrie du côté reste le vrai
    // juge, via le while dessous.
    const benchCap = (PLAZA_TUNE.benchPerSide != null ? PLAZA_TUNE.benchPerSide
      : R.benchPerSide != null ? R.benchPerSide : 4) | 0;
    let g = Math.max(0, Math.floor(benchCap / 2));
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
        if (add('bench', side.face, bx, by, hOf('bench', R.bench))) { poses += 1; benchPts.push([bx, by]); }
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
        if (loinDesBancs(mx, my)) add(pick.prop, side.face, mx, my, hOf(pick.prop, pick));
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
    // Le compte inclut l'arbre du CENTRE quand c'est lui qui le tient : il vaut
    // pour la place entière, pas par emplacement. Il SUIT L'EMPRISE (« plus la
    // place est grande, plus on met d'éléments ») et la recette le BORNE par le
    // haut — `treeWant` dit combien l'ère en veut AU PLUS, pas combien elle en
    // pose. Le filet et la liste de SPOTS restent juges de ce qui tient vraiment.
    // ⚠ Prendre `treeWant` tel quel rendait plazaTreeCount INATTEIGNABLE — toutes
    // les ères en déclarent un depuis le 2026-08-03 — et un parvis 4×4 recevait
    // alors le jardin d'une place 12×12. La règle d'emprise n'avait pas été
    // retirée : elle était devenue du code mort.
    const emprise = plazaTreeCount(w, h);
    const want = R.treeWant != null ? Math.min(R.treeWant | 0, emprise) : emprise;
    for (let ci = 0; ci < SPOTS.length && trees < want; ci += 1) {
      putTree(SPOTS[ci][0], SPOTS[ci][1], ci, true);
    }
  }
  // 4b. MASSIFS (square) ou BRASEROS (parvis) sur les diagonales que les arbres ont
  //     laissées libres (kit `beds`) : même anneau que les arbres, le filet refuse les
  //     places déjà prises.
  if (R.beds) {
    const hb = hOf(R.beds.prop, R.beds);
    const bd = Math.max(0.95, Math.min(w, h) * 0.3);
    const SPOTS_B = [[cxc + bd, cyc - bd], [cxc - bd, cyc + bd], [cxc - bd, cyc - bd], [cxc + bd, cyc + bd]];
    for (const [bx, by] of SPOTS_B) add(R.beds.prop, null, bx, by, hb, { field: true });
  }
  // 5. GARNITURE DE CŒUR (recette `field`) : quatre props sur les axes cardinaux
  //    MONDE, à mi-chemin entre le centre et le bord — le champ intérieur d'une
  //    grande place restait une dalle nue. C'est de la GARNITURE, donc `sideOn`
  //    l'éteint avec le reste : sans ça la molette ne pouvait plus dénuder une
  //    place pour juger son mobilier seul.
  //    ⚠ AUCUN plancher de distance. `Math.max(1.6, …)` SUPPOSAIT qu'un champ
  //    intérieur existe toujours ; sur un 4×4 il n'en existe pas — bancs à 1,38
  //    tuile du centre, cœur réservé jusqu'à 1,15 — et le plancher y envoyait
  //    quand même les jardinières, AU-DELÀ de la rangée, à 0,32 tuile d'un banc
  //    dont le jumeau est à 0,45. Une place trop petite n'en reçoit donc plus, et
  //    ce sont deux MESURES qui le disent — chacune suffirait, on garde les deux
  //    parce qu'elles disent des choses différentes : sortir du cœur réservé
  //    (`fd > coreR`) et tenir la règle du duo (`loinDesBancs`).
  //    ⚠ ELLE A UNE FACE, comme les compagnons de bord (Raph 2026-08-07 : « il y
  //    a des bacs de fleurs VUS DE FACE sur les places »). Posée sans variante,
  //    elle ne trouvait aucun `planter-<face>-<ère>.png` iso et propImage
  //    retombait sur le kit top-down legacy — un bac dessiné de face, à plat,
  //    au milieu d'une place en 3/4. Chaque emplacement regarde donc le centre,
  //    même convention que les bancs : la variante nomme la direction MONDE vers
  //    laquelle le prop REGARDE.
  const fd = Math.min(w, h) * 0.28;
  if (R.field && R.field.length && sideOn && fd > PLAZA_TUNE.coreR) {
    const F_SPOTS = [
      [cxc + fd, cyc, 'w'],   // à l'est du centre → regarde l'ouest
      [cxc - fd, cyc, 'e'],
      [cxc, cyc + fd, 'n'],
      [cxc, cyc - fd, 's'],
    ];
    for (let fi = 0; fi < F_SPOTS.length; fi += 1) {
      const [fx, fy, face] = F_SPOTS[fi];
      if (!loinDesBancs(fx, fy)) continue;
      const pick = R.field[Math.floor(h01('plz' + sd + ':f:' + fi) * R.field.length) % R.field.length];
      add(pick.prop, face, fx, fy, hOf(pick.prop, pick), { field: true });
    }
  }
  // 6. DES GENS QUI FLÂNENT (kits par sorte). Ce furent des figurants IMMOBILES,
  //    un ou deux devant chaque étal, ou en groupes sur un anneau autour de la
  //    fontaine — vus d'en haut, un cercle parfait : « là ça fait secte ^^ » (Raph,
  //    2026-10-04). Ils vivent maintenant dans plazaFolk.js : ils se promènent
  //    autour du mobilier, s'arrêtent aux étals, à la fontaine, se retrouvent pour
  //    causer, repartent, quittent la place par une rue et d'autres arrivent.
  //    Plus aucun passant n'entre dans `props` : ils sont poussés à chaque frame
  //    par pushOne, à leur position du moment.
  //    DEUX TESTS, PAS UN. Le filet (`placed`) est une empreinte ÉCRAN, faite pour
  //    que deux objets ne se recouvrent pas à l'image : pour un piéton elle est
  //    bien trop large — un arbre de part et d'autre de la fontaine coupait la
  //    place en deux, les bancs fermaient le square. On MARCHE donc sur la base
  //    au sol des objets (`walkFree`, ci-dessous) — passer devant ou derrière une
  //    fontaine est permis, c'est le peintre qui trie — mais on ne S'ARRÊTE que
  //    là où le filet passe (`stand`) : personne ne reste planté dans un étal.
  let folk = null;
  if (R.people) {
    const band = (L.counts && L.counts.eraBand) | 0;
    const set = agentSetForBand(band);
    const pH = personHT();
    const obst = placed.slice();
    const stand = (x, y) => {
      const f = foot(x, y, 'person', pH);
      for (const o2 of obst) if (footClash(f, o2, PLAZA_TUNE.minGap)) return false;
      return true;
    };
    const bases = plazaBases(props, lamps, T);
    const walkFree = (x, y) => {
      for (const b of bases) if (Math.abs(x - b.cx) < b.ex + FOLK_R && Math.abs(y - b.cy) < b.ey + FOLK_R) return false;
      return true;
    };
    const cellSet = new Set(cells.map((c) => c.gx + ',' + c.gy));
    const n = R.people.mode === 'stalls'
      ? Math.round(stalls.length * Math.max(1, R.people.perItem | 0) * 0.8)
      : (R.people.n | 0);
    folk = buildFolk({
      sd: 'plz' + sd, box, cx: cxc, cy: cyc, n, mode: R.people.mode,
      inPlaza: (gx, gy) => cellSet.has(gx + ',' + gy), free: walkFree, stand,
      stalls, exits: plazaExits(L, cells, cellSet),
      centre: centrePris && R.centre ? { x: cxc, y: cyc, prop: String(R.centre.prop).split('-')[0] } : null,
      // UN VISAGE PAR VENUE : celui qui revient sur la place après l'avoir quittée
      // est quelqu'un d'autre. `charType` et `figSeed` fondent son identité de fiche
      // (citizenFocus.js).
      ident: (i, run) => {
        const kk = 'plz' + sd + ':fp:' + i + ':' + run;
        const r = h01(kk + ':c');
        const charType = r < 0.46 ? 0 : r < 0.9 ? 1 : 2;
        const spec = agentSpecFor(set, charType, Math.floor(h01(kk + ':v') * 4));
        if (!spec) return null;
        return { name: spec.name, scale: spec.scale, charType, figSeed: Math.floor(h01(kk + ':id') * 4294967295) >>> 0 };
      },
    });
  }
  // 7. LES FANIONS. Triés à la profondeur de leur bout le plus proche, ils passent
  //    devant ce qui est derrière eux et sous ce qui est devant.
  //    AU MARCHÉ, d'ÉTAL EN ÉTAL, noués au haut des auvents, tout autour de la place
  //    — « ce sont des mâts avec une flamme au bout, accrocher les fils dessus n'est
  //    pas logique » (Raph, 2026-10-03). AILLEURS, d'un réverbère de coin au suivant,
  //    marqués `onLamps` : le dessin les saute si le mât de l'ère brûle (pas de
  //    point d'attache, cf. drawPlazaGarland).
  if (R.garland && stalls.length >= 2) {
    const ring = stalls
      .map((s) => ({ wx: s.x * T, wy: s.y * T, hT: s.hT, d: depthOf(s.x * T, s.y * T) }))
      .sort((p, q) => Math.atan2(p.wy - cyc * T, p.wx - cxc * T) - Math.atan2(q.wy - cyc * T, q.wx - cxc * T));
    const n = ring.length;
    for (let i = 0; i < (n === 2 ? 1 : n); i += 1) {
      const p = ring[i], q = ring[(i + 1) % n];
      props.push({
        prop: 'garland', variant: null, wx: (p.wx + q.wx) / 2, wy: (p.wy + q.wy) / 2, hT: 0,
        a: { wx: p.wx, wy: p.wy }, b: { wx: q.wx, wy: q.wy }, d: Math.max(p.d, q.d) + 0.5,
        liftT: Math.min(p.hT, q.hT) * GARLAND.stallTie,
        seed: Math.floor(h01('plz' + sd + ':gl:' + p.wx + ':' + q.wx) * 4),
      });
    }
  } else if (R.garland && lamps.length === 4) {
    const [a, b, c, d] = lamps;                      // (x0,y0) (x1,y0) (x0,y1) (x1,y1)
    for (const [p, q] of [[a, b], [b, d], [d, c], [c, a]]) {
      props.push({
        prop: 'garland', variant: null, wx: (p.wx + q.wx) / 2, wy: (p.wy + q.wy) / 2, hT: 0,
        a: { wx: p.wx, wy: p.wy }, b: { wx: q.wx, wy: q.wy }, d: Math.max(p.d, q.d) + 0.5,
        onLamps: true,
        seed: Math.floor(h01('plz' + sd + ':gl:' + p.wx + ':' + q.wx) * 4),
      });
    }
  }
  props.sort((a, b) => a.d - b.d);

  return { box, era, kind, w, h, cxc, cyc, cells, props, benchPerSide, trees, centrePris, lamps, folk };
}

// LA BASE AU SOL DU MOBILIER, en cellules — ce que heurte un flâneur. Un prop est
// ancré par le BAS de son encre (plazaAnchor) : sa base part de ce point et
// recule dans la profondeur (vers −x −y). Une encre de largeur W (unités sx de
// propFootprint) couvre une base carrée de côté W/2 ; l'étal et le banc, tournés
// vers le centre, sont des rectangles (long le long du bord, peu profonds). Un
// arbre ne gêne que par son TRONC — on passe sous sa couronne. Un mât : son pied.
const FOLK_R = 0.12;                        // demi-largeur d'un flâneur (cellules)
const BASE_DEPTH = { stall: 0.45, bench: 0.35 };
function plazaBases(props, lamps, T) {
  const out = [];
  for (const p of props) {
    if (p.prop === 'garland' || p.front) continue;
    const fam = String(p.prop).split('-')[0];
    const ax = p.wx / T, ay = p.wy / T;
    if (fam === 'tree') { out.push({ cx: ax, cy: ay, ex: 0.16, ey: 0.16 }); continue; }
    const W = (p.hT || 0) * aspectOf(p.prop);
    let ex = W / 4, ey = W / 4;
    const r = BASE_DEPTH[fam];
    if (r != null && p.variant) {
      const long = W / (1 + r) / 2, deep = long * r;
      const alongX = p.variant === 'n' || p.variant === 's';
      ex = alongX ? long : deep; ey = alongX ? deep : long;
    }
    const back = (ex + ey) / 2;
    out.push({ cx: ax - back, cy: ay - back, ex, ey });
  }
  for (const lp of lamps) out.push({ cx: lp.wx / T, cy: lp.wy / T, ex: 0.08, ey: 0.08 });
  return out;
}

// LES PASSANTS DES RUES SUR LA PLACE (docs/PLAN-COMPORTEMENTS.md, lot 1). Ils vont de
// centre de case en centre de case, et sur une place ce centre tombe parfois DANS un
// étal, un banc, une margelle : ils traversaient le mobilier. La seule parade
// (cityMapRuntime, « fountainCells/plazaPropCells ») recopiait la géométrie du décor
// supprimé de juillet. Chaque case de place reçoit ici son POINT DE PASSAGE — le point
// libre le plus proche de son centre, au sens de la base au sol du mobilier
// (plazaBases) — ou rien si la case est pleine (le cœur d'une grande fontaine) : elle
// sort alors du réseau piéton. Clés au format de cityMapWalkRoadKey (gx·10000 + gy),
// décalages en CELLULES.
const STREET_R = 0.15;                      // demi-largeur d'un passant + jeu
let _anchors = { comps: null, v: null };
export function plazaWalkAnchors(L, band) {
  if (!L || !isoPlazaKitOn(band)) return null;
  const comps = isoPlazaCompositions(L, band);
  if (_anchors.comps === comps && _anchors.v) return _anchors.v;
  const blocked = new Set(), offset = new Map();
  const T = CM.TILE;
  for (const comp of comps) {
    const bases = plazaBases(comp.props, comp.lamps, T);
    const free = (x, y) => bases.every((b) => Math.abs(x - b.cx) >= b.ex + STREET_R || Math.abs(y - b.cy) >= b.ey + STREET_R);
    for (const c of comp.cells) {
      const cx = c.gx + 0.5, cy = c.gy + 0.5;
      let best = null, bd = Infinity;
      for (let j = -4; j <= 4; j += 1) {
        for (let i = -4; i <= 4; i += 1) {
          const d = i * i + j * j;
          if (d >= bd || !free(cx + i * 0.1, cy + j * 0.1)) continue;
          bd = d; best = [i * 0.1, j * 0.1];
        }
      }
      const k = c.gx * 10000 + c.gy;
      if (!best) blocked.add(k);
      else if (bd > 0) offset.set(k, best);
    }
  }
  _anchors = { comps, v: { blocked, offset } };
  return _anchors.v;
}

// LES ENTRÉES DE LA PLACE : chaque arête où une rue l'aborde (c'est aussi là que la
// grille du square laisse sa porte, cf. fenceEdges `gateOnRoad`). `a` = l'ancre côté
// place, `o` = le point de fuite, à mi-chemin dans la cellule de rue.
function plazaExits(L, cells, cellSet) {
  const out = [];
  if (!L.roadMap) return out;
  for (const c of cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = (c.gx + dx) + ',' + (c.gy + dy);
      if (cellSet.has(nk)) continue;
      const rc = L.roadMap.get(nk);
      if (!rc || rc.rank === 'plaza' || rc.roadSurface === 'bridge') continue;
      out.push({
        ax: c.gx + 0.5 + dx * 0.2, ay: c.gy + 0.5 + dy * 0.2,
        ox: c.gx + 0.5 + dx * 0.95, oy: c.gy + 0.5 + dy * 0.95,
      });
    }
  }
  return out;
}

// TOUTES les places de la ville, mémoïsées ensemble.
export function isoPlazaCompositions(L, band) {
  const era = PLAZA_TUNE.era || plazaEraForBand(band);
  if (!era || !RECIPES[era]) return [];
  // ⚠ AGENT_SCALE et le nombre de pieds d'arbre mesurés entrent dans la CLÉ : le
  // mobilier en `p` dépend du premier, le recentrage des arbres du second.
  const key = CM.layoutRecomputeAt + '|' + era + '|' + PLAZA_TUNE.rev + '|'
    + PLAZA_TUNE.seed + '|' + AGENT_SCALE + '|' + _artRev + '|' + folkRev();
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
// RÉVISION D'ART. ⚠ Le recentrage des arbres sur leur pied dépend d'une mesure
// qui n'existe qu'APRÈS décodage du PNG. Faire porter la clé de composition par
// le seul nombre de pieds mesurés ne suffisait pas : rien ne garantissait qu'on
// re-mesure une fois l'image prête, la composition restait figée sur sa version
// non corrigée jusqu'au prochain recalcul de layout. On incrémente donc à CHAQUE
// décodage, et la clé le porte — la place se recale à la frame suivante.
let _artRev = 0;
function art(src) {
  let e = artCache.get(src);
  if (e) return e;
  e = { img: null, ready: false };
  artCache.set(src, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      e.img = im; e.ready = true;
      _artRev += 1;                       // → recompose : cf. la clé plus bas
      solInvalidate('soft');
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
export function isoPlazaItems(L, band, pushItem, visible, now = 0) {
  let n = 0;
  for (const comp of isoPlazaCompositions(L, band)) n += pushOne(comp, pushItem, visible, now);
  return n;
}
function pushOne(comp, pushItem, visible, now) {
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
  // LES FLÂNEURS, à leur position du moment (plazaFolk.js), triés comme le mobilier.
  if (comp.folk && (!PLAZA_TUNE.only || PLAZA_TUNE.only === 'person')) {
    for (const rec of folkAt(comp.folk, now, CM.TILE, depthOf, { night: CM.nightF || 0, rain: CM.rainF || 0, season: CM.season | 0 })) {
      // Registre des figures : les pigeons s'envolent devant un flâneur EN MARCHE ;
      // arrêté, il ne compte pas — une volée posée près d'une causette repartirait sans fin.
      noteFig(rec.wx, rec.wy, FIG.PLAZA | (rec.walking ? FIG.MOVING : 0));
      if (visible && !visible(rec.wx, rec.wy)) continue;
      const it = pushItem();
      it.d = rec.d; it.kind = 'plazaProp'; it.art = rec; it.eraKey = comp.era;
      n += 1;
    }
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
export function drawIsoPlazaProp(ctx, rec, era, now) {
  if (rec.prop === 'person') { drawPlazaPerson(ctx, rec, now); return; }
  if (rec.prop === 'garland') { drawPlazaGarland(ctx, rec); return; }
  const T = CM.TILE, z = CM.cam.zoom;
  const p = worldToScreen(rec.wx, rec.wy);
  let hPx = rec.hT * T * z * PLAZA_TUNE.propScale;
  if (hPx < 1.5) return;                        // sous le pixel : rien à montrer
  // FAMINE (isoFamine.js) : un étal de nourriture passe à son art VIDE, en place.
  const vide = stallVideProp(rec, era, now);
  const im = (vide && propImage(vide, era, rec.variant)) || propImage(rec.prop, era, rec.variant);
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
      const canvasPx = treeCanvasT(rec.treeR, true) * T * z;   // fixed : cf. putTree
      const g2 = grateFit(bb.w / bb.h, hPx, m, canvasPx, PLAZA_TUNE.grateMargin);
      hPx = g2.hPx; px += g2.ox; py += g2.oy;
    }
  }
  const g = plazaAnchor(bb, im.naturalWidth, im.naturalHeight, px, py, hPx);
  // L'OMBRE DU SOLEIL (2026-09-30, une seule lumière pour toute la carte,
  // iso/isoSunShadow.js) remplace l'ellipse douce du pied, et le refus de l'ellipse
  // sous les points d'eau (Raph, 2026-08-05) tombe avec elle : ce n'est plus une
  // marque de contact, c'est l'ombre que tout objet porte. L'arc AVANT d'une
  // margelle (rec.front) est le même objet, déjà ombré. La FONTAINE est un bassin
  // posé à plat : pivot 'plate' (pied commun au centre du bassin) — par colonne, la
  // profondeur du bassin compterait comme de la hauteur et poserait une fausse
  // bande d'ombre devant lui ; ainsi seule la vasque centrale projette.
  if (!rec.front && !rec.treeV) {
    drawSunShadow(ctx, im, g.dx, g.dy, g.dw, g.dh, 0, 0, 0, 0, PLATE_PROPS.has(rec.prop) ? 'plate' : 'column');
  }
  // EAU ANIMÉE : même géométrie que le statique, seule la SOURCE change. Le
  // cran d'ambiance « aucune » l'arrête avec le reste ; « sobre » la garde,
  // c'est une animation lente, locale et attendue.
  const an = (PLAZA_TUNE.anim && (CM.ambianceK ?? 1) > 0 && !rec.front)
    ? propAnim(rec.prop, era) : null;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (an) {
    const f = Math.floor((now || 0) / PLAZA_TUNE.animMs) % an.n;
    ctx.drawImage(an.img, f * an.fw, 0, an.fw, an.fh, g.dx, g.dy, g.dw, g.dh);
    lightCutImage(im, g.dx, g.dy, g.dw, g.dh);
    ctx.imageSmoothingEnabled = prev;
    return;
  }
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
// Posés À PLAT (bassin, massif, puits) : pivot 'plate' de l'ombre du soleil.
const PLATE_PROPS = new Set(['fountain', 'fountain-forum', 'flowerbed', 'well']);

// ── UN FLÂNEUR DE LA PLACE ──────────────────────────────────────────────────
// Le dessinateur des habitants lui-même (agents.js) : même bande, même échelle,
// même ombre du soleil et même reflet, les pieds MESURÉS sur le sol (groundFeet).
// En marche, le pas suit la DISTANCE parcourue (les pieds ne patinent pas) ;
// arrêté, première image (pieds joints), tourné vers ce qu'il regarde. Il
// s'efface en quittant la place par une rue et apparaît en y arrivant (`alpha`).
function drawPlazaPerson(ctx, rec, now) {
  const p = worldToScreen(rec.wx, rec.wy), z = CM.cam.zoom;
  const a = rec.alpha == null ? 1 : rec.alpha;
  if (a <= 0.02) return;
  const prevA = ctx.globalAlpha;
  if (a < 1) ctx.globalAlpha = prevA * a;
  drawNamedAgentIso(ctx, p.x, p.y, z, rec.name, rec.scale || 1, rec.dir, !!rec.walking, now,
    rec.phase || 0, 1, rec.walking ? rec.walkDist : null, true);
  ctx.globalAlpha = prevA;
}

// ── LES FANIONS ─────────────────────────────────────────────────────────────
// Une corde tendue entre deux supports — le haut de deux auvents d'étal au marché,
// deux réverbères de coin ailleurs —, qui pend en chaînette, et des fanions
// triangulaires de quatre couleurs vives (rouge, ocre, bleu, crème — celles des
// auvents du marché). LA NUIT, chaque fanion porte une lanterne : une lueur chaude
// déposée dans le calque de lumière (lightLayer), qui s'ajoute APRÈS le voile de
// nuit comme celle des lampadaires. Au loin (zoom < 0,6) ce ne serait qu'un trait
// de bruit : rien.
// Molette : __plaza({ garland: { hT, sag, step, stallTie } }) — hT = hauteur des
// attaches sur un réverbère PNG (tuiles), sag = flèche en part de la portée, step =
// pas des fanions (px d'art), stallTie = hauteur du nœud en part de la hauteur de
// l'étal (le haut des poteaux d'auvent).
export const GARLAND = { on: true, hT: 1.25, sag: 0.14, step: 9, stallTie: 0.85, cols: ['#c8402f', '#e2b441', '#3d6fb0', '#efe6d2'] };
function drawPlazaGarland(ctx, rec) {
  const z = CM.cam.zoom;
  if (!GARLAND.on || z < 0.6) return;
  const T = CM.TILE;
  // Où le fil est-il noué ? Sur un étal : au haut de ses poteaux. Sur un réverbère
  // de KIT (iso/streetKits.js) : au point d'attache que son dessin déclare (tieY) —
  // un mât qui porte une FLAMME n'en déclare pas, et la guirlande n'a alors rien
  // pour la tenir (Raph, 2026-10-03). Réverbère PNG d'avant : GARLAND.hT.
  let lift;
  if (rec.liftT != null) lift = rec.liftT * T * z * PLAZA_TUNE.propScale;
  else {
    const kl = streetKitLampArt((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
    if (kl && kl.tieY == null) return;
    lift = kl ? kl.tieY * z : GARLAND.hT * T * z;
  }
  const A = worldToScreen(rec.a.wx, rec.a.wy), B = worldToScreen(rec.b.wx, rec.b.wy);
  const ax = A.x, ay = A.y - lift, bx = B.x, by = B.y - lift;
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 8) return;
  // Flèche bornée : un fil noué bas (auvent, mât de kit) reste au-dessus des têtes
  // au lieu de traîner sur le dallage au milieu d'une grande place.
  const sag = Math.min(len * GARLAND.sag, lift * 0.3);
  // Point de la chaînette (approchée d'une parabole) au paramètre t.
  const at = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t + sag * 4 * t * (1 - t)];
  const px = Math.max(1, z);                           // un pixel d'art
  ctx.save();
  ctx.lineWidth = Math.max(1, Math.round(z * 0.8));
  ctx.strokeStyle = 'rgba(58,42,34,0.85)';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  // Bézier quadratique : le point de contrôle à DEUX flèches sous le milieu.
  ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag * 2, bx, by);
  ctx.stroke();
  const m = Math.max(2, Math.floor(len / (GARLAND.step * px)));
  const night = Math.max(0, Math.min(1, (CM.nightF || 0) * 1.4));
  for (let k = 1; k < m; k += 1) {
    const [x, y] = at(k / m);
    ctx.fillStyle = GARLAND.cols[(k + (rec.seed | 0)) % GARLAND.cols.length];
    ctx.beginPath();
    ctx.moveTo(x - 1.5 * px, y);
    ctx.lineTo(x + 1.5 * px, y);
    ctx.lineTo(x, y + 3.2 * px);
    ctx.closePath();
    ctx.fill();
    if (night > 0.05) {
      const r = 5 * px;
      const lc = lightCtx(x - r, y - r, x + r, y + r);
      if (lc) {
        const g = lc.createRadialGradient(x, y + px, 0, x, y + px, r);
        g.addColorStop(0, 'rgba(255,196,120,' + (0.55 * night).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,196,120,0)');
        lc.fillStyle = g;
        lc.fillRect(x - r, y - r + px, r * 2, r * 2);
      }
    }
  }
  ctx.restore();
}

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

// `inkBox` est exporté pour les CLÔTURES (lot L9) : la composition d'une bande a
// besoin de la boîte d'encre du panneau, et une seconde implémentation de la mesure
// dériverait de celle qui sert au dessin.
export { PLAZA_TUNE, RECIPES, KIND_KITS, HOUSE_HT, houseF, TALL_PROPS, personHT, ADULT_SCALE, inkBox, plazaBases };

// ── LA FONTAINE DE LA SCÈNE DE PLACE, rapatriée d'isoRenderer le 2026-08-23
// (Q10). Elle décrivait déjà une scène de CE module ; la laisser dans le peintre
// obligeait à y garder les rects du crop, donc deux endroits à corriger si l'art
// bouge. Le commentaire ci-dessous est celui d'origine, mot pour mot.
// ── PLACE ───────────────────────────────────────────────────────────────────
// `isoPlazaBox` (composante connexe de la dalle) et `plazaEraForBand` ont
// DÉMÉNAGÉ dans isoPlaza.js : la place composée et l'ancienne scène doivent
// lire la MÊME emprise et la MÊME ère, une copie ici les ferait diverger.
// Ce qui reste ci-dessous ne sert qu'au mode 'scene' (__plaza({mode:'scene'})),
// gardé comme référence d'A/B : la scène par ère validée le 2026-07-12
// (fontaine monumentale + parterres + bancs, UNE image posée sur la dalle).
// ── FONTAINE ANIMÉE : l'eau de la scène de place, bakée en strip 8 frames
// (/pixelart/iso/anim/plaza-fountain-<ère>.png, scripts/fetchFountainAnims.mjs)
// et blittée PAR-DESSUS la scène à l'emplacement exact du crop source. Hors
// eau, chaque frame est VERROUILLÉE sur les pixels de la scène → zéro couture,
// zéro wobble ; le repli (strip absent) est simplement la scène statique.
// Rects en px de la scène SOURCE — miroir exact de FOUNTAIN du script.
// FA_V : version de cache des strips (à incrémenter à chaque réécriture des
// PNG, le cache HTTP ressert sinon l'ancienne version — leçon aqueducs).
export const FA_V = 2;
export const FOUNTAIN_ANIM = {
  antique: { x: 100, y: 4, w: 108, h: 116 },
  medieval: { x: 110, y: 8, w: 126, h: 128 },
  industrial: { x: 108, y: 26, w: 116, h: 104 },
  modern: { x: 116, y: 26, w: 124, h: 100 },
  cosmic: { x: 92, y: 0, w: 110, h: 128 },
};
// Molette : __fountainAnim({ on, ms }) — ms = durée d'une frame.
// 240 ms (≈4 fps, cycle 1.5-2 s) : à 120 les ondulations « allaient trop
// vite » (retour Raph) ; l'eau de fontaine doit rester paisible.
export const FOUNTAIN_TUNE = { on: true, ms: 240 };
if (typeof window !== 'undefined') {
  window.__fountainAnim = (o) => { if (o) Object.assign(FOUNTAIN_TUNE, o); return { ...FOUNTAIN_TUNE }; };
}



