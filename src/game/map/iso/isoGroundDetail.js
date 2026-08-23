// LES MATIÈRES DU SOL — de quoi chaque cellule est FAITE, et comment on la garnit.
//
// Extraites d'isoRenderer.js le 2026-08-23 (Q10). Six sections du fichier, un seul
// sujet : le tapis d'herbe vivant (brins, touffes, speckle, fleurs), le bruit lissé
// qui le fait respirer, la LISIÈRE qui divague entre herbe et ville, la FRANGE
// d'herbe, les matières de sol urbain par âge, et la frange de chaussée.
// S'y ajoutent deux choses qui en dépendent directement : le FRONT DE RUE (où une
// maison se pose par rapport à sa chaussée) et la GÉOMÉTRIE DE RUE publiée aux
// agents — ils lisent les mêmes matières, une copie les ferait diverger.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Vérifiée ligne à ligne contre la
// version commitée.
//
// ⚠⚠ L'ÉTAT DE SAISON PART AVEC SON ÉCRIVAIN, ET C'EST LA CONDITION DE LA COUPE.
// `SEASON_GRASS` & ses trois sœurs sont RÉASSIGNÉES à chaque changement de saison
// par `refreshSeasonPalette()` — qui vit ici. Laisser la déclaration dans le
// peintre aurait fait écrire une liaison IMPORTÉE, donc en LECTURE SEULE : un
// `TypeError` à la première saison, après un lint vert. Les LECTEURS, eux, peuvent
// rester ailleurs : une liaison ESM est VIVANTE, ils verront la nouvelle valeur.
//
// ⚠ `syncIsoStreetGeom()` est appelée AU NIVEAU MODULE (plus bas) : elle publie la
// géométrie de rue sur `CM` pour les agents. L'effet de bord voyage donc avec ce
// module — c'est isoRenderer qui le déclenche désormais, en l'important. (Cf. P32 du
// plan : `roadIsoHierarchy.test.js` en dépend et le dit maintenant à voix haute.)
import { CM, cmHash } from '../layout.js';
import { seasonGrass, seasonWild, seasonTip, seasonFlowerMul, seasonCanopyTint, WINTER } from '../seasonMode.js';
import { isoArt } from './isoArt.js';
import { GRASS, GRASS_WILD } from './isoPalette.js';
import { isoTileCache } from './isoGroundTiles.js';
import {
  ROAD_BAND, ISO_ROAD_HALFW, isoRoadHalfW,
  ROAD_MATS, ROAD_DETAIL, ROAD_VEIL, SIDEWALK_ISO,
} from './isoRoad.js';

export let SEASON_GRASS = GRASS, SEASON_WILD = GRASS_WILD, SEASON_TIP = null, SEASON_FLOWER_MUL = 1;

// ── Détail d'herbe : tapis VIVANT (touffes de brins + speckle + fleurs éparses)
// posé DANS le bake du sol, par-dessus la tuile d'herbe (design réfs pixel-art
// validé par Raph 2026-07-12 : brins en V + pâquerettes ; réfs = DESIGN, pas
// couleur). Dispersion en ESPACE-MONDE (hash par cellule UNIQUE → aucune
// répétition de grille) et STRICTEMENT dans notre palette : verts + 2 accents
// clairs RARES (fleurs blanc cassé / cœur jaune). Densité « moyenne ». Réglable
// live : __grassDetail(false) éteint, __grassDetail(1.6) densifie, __grassDetail()
// lit l'état. N'affecte QUE l'herbe (kind==='grass') — sol urbain/champs/place intacts.
// tileAlpha : opacité de la tuile d'herbe PixelLab. La tuile brute est un carpet
// feuillu DENSE (loin des réfs « base verte propre + motifs épars ») → on la
// blende faiblement sur l'aplat GRASS pour une base CALME, et ce sont nos
// touffes/fleurs qui portent le design. mult : densité globale des motifs.
// DA Raph 2026-07-12 (itérée) : base verte UNIE (tileAlpha 0 → pas de tuile qui
// « tile », + aplat herbe forcé v=1 → pas de maillage par cellule) sur laquelle on
// pose des FLEURS assez présentes + des TOUFFES de brins MODÉRÉES (revenues à la
// demande, mais dosées pour ne PAS re-carpetter : « trop de pixels » = l'écueil).
// speckle & wildShade (plaques de prairie) restent des knobs, à 0 par défaut.
// meadow : PRÉS — plaques lentes de nuance par bruit LISSÉ (smoothNoise, aucune
// couture de cellule ni de bloc, contrairement à la variance par cellule qui
// dessinait un maillage) ; foncé = herbe grasse, clair = herbe sèche. Dosé bas.
// tileAlpha 0 → 1 (Raph 2026-07-28) : la tuile d'herbe regénérée (4 variantes
// brutes, patchwork voulu) est DESSINÉE — l'ancien 0 datait de la tuile unique
// qui tapissait ; « branche ce que j'ai mis en image ».
// clumpScale (Raph 2026-07-28 : « les grosses touffes dénotent trop ») : les
// touffes Cainos passaient à l'échelle pleine du pixel d'art (~une demi-cellule
// à côté de brins de 2 px) — réduites, pas supprimées ; 0 touffe = clumpP: 0.
export const GRASS_DETAIL = { on: true, tileAlpha: 1, flowerP: 0.22, tuftP: 0.45, speckleP: 0, wildShade: 0, meadow: 0.16, clumpP: 0.09, clumpScale: 0.55 };
// Sous-couche des tuiles d'herbe À CREUX (noFill, cf. fetchGroundTiles) : les
// trous entre brins doivent lire comme l'OMBRE sous l'herbe, pas comme le fond
// olive du bake (plus clair que les brins → relief inversé, points clairs).
// = ton moyen mesuré du lot (l'aperçu validé par Raph posait exactement ça).
// La version HIVER suit la tuile enneigée (ton mesuré par fetchGroundTiles).
// ⛔ IL Y AVAIT ICI DEUX MESURES DE DISTANCE AU BORD DE L'ÎLE, en tuiles, pour
// décider CELLULE PAR CELLULE si elle appartenait au rivage. Les deux sont
// retirées avec l'approche : le contour d'île est désormais TRACÉ le long de son
// ellipse (drawIsoIslandShore). Elles étaient justes — la seconde fermait
// effectivement l'anneau, et un test le prouvait — mais aucune règle par cellule
// ne peut donner une largeur RÉGULIÈRE sur un objet de 4,8 tuiles de large, et
// c'était la demande. Leurs tests partent avec elles : garder des gardes sur du
// code que plus rien n'appelle, c'est de la décoration.
export const GRASS_TILE_UNDER = [42, 85, 39];
export const GRASS_TILE_UNDER_WINTER = [126, 143, 137];   // ton mesuré du lot hiver (fetchGroundTiles)
const GD_BLADE = [66, 100, 46];      // brin foncé
const GD_TIP = [156, 180, 96];       // pointe claire du brin (référence = été)
// Décor de sol découpé du pack Cainos (scripts/sliceCainosPlants.mjs), rabattu
// sur la rampe foliage. Les CAILLOUX du même pack ont été dispersés ici puis
// RETIRÉS (Raph, 2026-07-22) — d'abord les pierres plates (« en tuile » dans
// l'herbe), puis les blocs ronds. Ne pas re-proposer de semer des pierres.
const GD_TUFTS = 15;                 // deco/tuft-1..15

// Résout la palette de saison. Appelée en tête de frame : trois lectures de
// table, aucun calcul de couleur — l'interpolation libre est explicitement
// exclue (cf. seasonMode.js), il n'y a donc rien à mélanger.
// Feuillage teinté par saison, cuit à la demande et gardé en cache par
// (sprite, saison). Renvoie null en été (sprite d'origine, coût nul) ou tant
// que l'image n'est pas décodée.
//
// ⚠ L'HIVER NE PASSE PLUS PAR LA TEINTE. Elle vaut rgba(178,186,190,0.34) en
// multiply, soit 10 % de valeur en moins : un feuillu lime restait un feuillu
// lime, posé sur un sol enneigé (Raph, 2026-07-31 : « il faut faire les arbres
// enneigés »). La neige est maintenant CUITE dans un sprite `-winter` dérivé du
// sprite d'été (scripts/snowTrees.mjs) — même doctrine que le sol d'hiver, et
// même repli : tant que le PNG n'est pas décodé (ou absent, cf. le .exe hors
// ligne), on retombe sur la teinte, jamais sur du vide.
const _seasonTrees = new Map();
export function seasonTree(art, name) {
  const s = CM.season | 0;
  if (s === WINTER) {
    const wa = isoArt(name + '-winter');
    if (wa.ready && wa.img) return wa.img;
  }
  const tint = seasonCanopyTint(s);
  if (!tint || !art.ready || !art.img) return null;
  const key = name + ':' + s;
  const hit = _seasonTrees.get(key);
  if (hit) return hit;
  const w = art.img.naturalWidth || art.img.width;
  const h = art.img.naturalHeight || art.img.height;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(art.img, 0, 0);
  // multiply teinte le feuillage sans toucher aux valeurs ; source-atop garde
  // la silhouette (sans lui, le rectangle entier serait peint).
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(art.img, 0, 0);
  _seasonTrees.set(key, c);
  return c;
}

export function refreshSeasonPalette() {
  const s = CM.season | 0;
  SEASON_GRASS = seasonGrass(s);
  SEASON_WILD = seasonWild(s);
  SEASON_TIP = seasonTip(s);
  SEASON_FLOWER_MUL = seasonFlowerMul(s);
}
const GD_SPECK_L = [138, 164, 96];   // speckle vert clair
const GD_SPECK_Y = [198, 208, 126];  // speckle jaune pâle
// Palette de fleurs [pétale, cœur] : pâquerette blanche dominante + accents jaune
// (bouton d'or), rose, rouge/coquelicot, violet, bleuet. Poids par RÉPÉTITION
// (blanc/jaune plus fréquents que les vives) → un pré fleuri, pas des confettis.
const GD_FLOWERS = [
  [[240, 242, 228], [234, 206, 96]],   // blanc (pâquerette)
  [[240, 242, 228], [234, 206, 96]],
  [[240, 242, 228], [234, 206, 96]],
  [[244, 216, 102], [220, 168, 60]],   // jaune (bouton d'or)
  [[244, 216, 102], [220, 168, 60]],
  [[236, 152, 178], [234, 206, 96]],   // rose
  [[224, 104, 96], [234, 206, 96]],    // rouge (coquelicot)
  [[184, 148, 216], [234, 206, 96]],   // violet
  [[150, 176, 226], [234, 206, 96]],   // bleuet
];
// ⚠ NE PAS « batcher » ces rects par couleur : essayé et MESURÉ le 2026-07-17 →
// aucun gain (154 ms vs 158 ms sur ~30 000 rects). fillRect est un chemin rapide
// de Skia (aucun path construit) — contrairement aux diamondPath des voiles, que
// le remisage par palier fait gagner pour de bon (194 → 102 ms). Le vrai coût
// résiduel ici est la CHAÎNE de style reconstruite par rect, pas l'appel de dessin.
export function drawGrassDetail(ctx, gx, gy, px, py, hw, hh) {
  const pu = Math.max(1, Math.round(hw * 0.055));    // « pixel » d'art (suit le zoom)
  // Sous-point (fx,fy)∈cellule → écran depuis le coin nord (projection linéaire :
  // Δx world → (hw,hh), Δy world → (−hw,hh)).
  const rect = (sx, sy, w, h, col, a) => {
    ctx.fillStyle = a < 1 ? `rgba(${col[0]},${col[1]},${col[2]},${a})` : `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(sx, sy, w, h);
  };
  const h1 = cmHash('gd:' + gx + ':' + gy);
  const h2 = cmHash('gd2:' + gx + ':' + gy);
  // Speckle (knob speckleP, défaut 0) : 1 point clair/jaune pâle.
  if (GRASS_DETAIL.speckleP > 0 && (h1 & 255) / 255 < GRASS_DETAIL.speckleP) {
    const fx = 0.2 + ((h1 >> 8) & 63) / 63 * 0.6;
    const fy = 0.2 + ((h1 >> 14) & 63) / 63 * 0.6;
    const sx = Math.round(px + (fx - fy) * hw), sy = Math.round(py + (fx + fy) * hh);
    rect(sx, sy, pu, pu, (h1 & 1) ? GD_SPECK_Y : GD_SPECK_L, 0.5);
  }
  // Touffe de brins (knob tuftP, défaut 0) : 2-3 brins verticaux, corps foncé + pointe.
  if (GRASS_DETAIL.tuftP > 0 && (h2 & 255) / 255 < GRASS_DETAIL.tuftP) {
    const fx = 0.28 + ((h2 >> 8) & 31) / 31 * 0.44;
    const fy = 0.30 + ((h2 >> 13) & 31) / 31 * 0.42;
    const bx = Math.round(px + (fx - fy) * hw), by = Math.round(py + (fx + fy) * hh);
    const nB = 2 + ((h2 >> 18) & 1);                 // 2 ou 3 brins
    const bh = Math.max(2 * pu, Math.round(hw * 0.13));
    for (let i = 0; i < nB; i += 1) {
      const bxi = bx + Math.round((i - (nB - 1) / 2) * (pu + 1));
      const jh = bh - ((h2 >> (i * 3)) & 1) * pu;    // hauteur légèrement variée
      rect(bxi, by - jh, pu, jh, GD_BLADE, 1);       // corps du brin
      rect(bxi, by - jh, pu, pu, SEASON_TIP || GD_TIP, 1);   // pointe claire
    }
  }
  // Fleur ÉPARSE (flowerP, le SEUL motif par défaut) : pâquerette = 4 pétales blanc
  // cassé + cœur jaune. « De temps en temps » sur un fond uni.
  // La saison module la densité : rien ne fleurit en hiver, le printemps déborde.
  if ((cmHash('gf:' + gx + ':' + gy) & 1023) / 1023 < GRASS_DETAIL.flowerP * SEASON_FLOWER_MUL) {
    const fl = GD_FLOWERS[cmHash('fc:' + gx + ':' + gy) % GD_FLOWERS.length];
    const petal = fl[0], core = fl[1];
    const fx = 0.3 + ((h1 >> 20) & 15) / 15 * 0.4;
    const fy = 0.3 + ((h2 >> 20) & 15) / 15 * 0.4;
    const cx = Math.round(px + (fx - fy) * hw), cy = Math.round(py + (fx + fy) * hh);
    rect(cx - pu, cy, pu, pu, petal, 1); rect(cx + pu, cy, pu, pu, petal, 1);
    rect(cx, cy - pu, pu, pu, petal, 1); rect(cx, cy + pu, pu, pu, petal, 1);
    rect(cx, cy, pu, pu, core, 1);
  }
  // ── TOUFFES et PIERRES (sprites, pack Cainos) ──────────────────────────────
  // Posés à l'échelle du PIXEL D'ART (pu) et pas à une taille en px : c'est ce
  // qui les met à la même résolution apparente que les brins et les pâquerettes
  // tracés juste au-dessus. Dessiné au pixel près, sans lissage — sinon un
  // sprite de 15 px étalé sur 30 devient flou. Ancrés par le BAS-CENTRE (une
  // pierre pose son assise au point, elle ne flotte pas autour).
  // Ils vivent dans le BAKE du sol : coût nul par frame, et ils sont sautés
  // d'office par le bake allégé (pan) comme les autres détails d'herbe.
  const deco = (art, fx, fy, scale = 1) => {
    if (!art.ready || !art.img) return;
    const iw = art.img.naturalWidth || art.img.width || 0;
    const ih = art.img.naturalHeight || art.img.height || 0;
    if (!iw || !ih) return;
    const w = Math.max(1, Math.round(iw * pu * scale)), hgt = Math.max(1, Math.round(ih * pu * scale));
    const sx = Math.round(px + (fx - fy) * hw), sy = Math.round(py + (fx + fy) * hh);
    ctx.drawImage(art.img, sx - (w >> 1), sy - hgt, w, hgt);
  };
  // Touffe d'herbe haute. Densité SÉPARÉE des brins procéduraux (tuftP) : une
  // touffe dessinée fait ~une demi-cellule, à la densité des brins elle
  // re-carpetterait le sol — l'écueil déjà tranché avec Raph le 2026-07-12.
  const h3 = cmHash('gc:' + gx + ':' + gy);
  if (GRASS_DETAIL.clumpP > 0 && (h3 & 1023) / 1023 < GRASS_DETAIL.clumpP) {
    const fx = 0.24 + ((h3 >> 10) & 31) / 31 * 0.52;
    const fy = 0.24 + ((h3 >> 16) & 31) / 31 * 0.52;
    deco(isoArt('deco/tuft-' + (1 + (h3 % GD_TUFTS))), fx, fy, GRASS_DETAIL.clumpScale);
  }
}
if (typeof window !== 'undefined') {
  // Molette de réglage : rebake le sol immédiatement.
  // __grassDetail(false) éteint ; (nombre) = fréquence des fleurs ; ({tileAlpha,
  // flowerP,tuftP,speckleP,wildShade,clumpP}) = réglage fin. Ex. réactiver les
  // brins : __grassDetail({ tuftP: 0.25 }) ; couper les touffes dessinées :
  // __grassDetail({ clumpP: 0 }).
  window.__grassDetail = (arg) => {
    if (arg === false) GRASS_DETAIL.on = false;
    else if (typeof arg === 'number') { GRASS_DETAIL.on = true; GRASS_DETAIL.flowerP = arg; }
    else if (arg && typeof arg === 'object') { GRASS_DETAIL.on = true; Object.assign(GRASS_DETAIL, arg); }
    else GRASS_DETAIL.on = true;
    CM._isoGroundBake = null;
    return { ...GRASS_DETAIL };
  };
}
// ── Bruit de valeur LISSÉ (interp. bilinéaire de hashs de grille, easing cubique)
// en espace cellule : grandes plaques douces SANS couture (ni maillage par cellule
// ni bord de bloc — les deux écueils déjà rencontrés). 0..1, stable par seed.
// Sert au voile de nuance des sols urbains et aux prés de l'herbe (meadow).
export function smoothNoise(gx, gy, scale, salt) {
  const x = gx / scale, y = gy / scale;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => (cmHash(salt + ':' + i + ':' + j) % 1000) / 1000;
  return (h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx) * (1 - sy)
    + (h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx) * sy;
}

// ── LISIÈRE QUI DIVAGUE (jonction herbe↔ville, RENDU SEUL) ───────────────────
// Cinq tentatives ont échoué sur cette jonction, et toutes DÉCORAIENT la couture
// en ajoutant un élément SOMBRE le long de la ligne : langues crantées à pointe
// sombre ('teeth' → « ça lit comme des tas »), ourlet sombre continu ('hem' →
// « ça n'a rien changé »), bords rongés + gravillons (ROAD_DETAIL.edgeFringe →
// « ça salissait la route »), contour d'un pack de tuiles Wang (→ traînée grise).
// Ce qui a SURVÉCU est d'une autre famille : dégradé de valeur doux (épaulement,
// gorge, ourlet) ou objet posé à cheval (touffes, fleurs).
//
// Le défaut jamais traité n'est pas la décoration : c'est que la frontière est
// une DROITE. urbanSet est un bloc, donc son bord projette une diagonale au
// cordeau, et décorer une droite ne la rend pas naturelle. Ici on ne décore
// rien : on fait SERPENTER la frontière elle-même, en retournant la matière de
// quelques cellules frontalières — une morsure d'herbe dans le pavé, une langue
// de pavé dans l'herbe. Zéro couleur nouvelle, zéro élément sombre, zéro
// primitive en plus : ce sont les deux aplats existants, sur un bord qui n'est
// plus tiré à la règle. Les touffes et les fleurs de la frange suivent
// automatiquement (grassAt lit kindAt) et ont enfin un bord organique à souligner.
//
// ⚠ RENDU SEUL : urbanSet n'est PAS touché. Le placement des bâtiments, les
// routes et le plan continuent de lire l'emprise logique — une cellule rendue en
// herbe reste constructible côté jeu, et surtout aucune maison ne peut se
// retrouver posée sur l'herbe (cf. le garde d'occupation ci-dessous).
//
// Le bruit est LISSÉ sur ~3 cellules (smoothNoise) et UNIQUE pour les deux sens :
// là où il est haut la ville avance, là où il est bas l'herbe mord. La frontière
// ondule donc de façon cohérente au lieu de moucheter au hasard.
// p : part des cellules frontalières retournées de chaque côté.
// Réglage live : __frontier(false) / ({ p, scale, solo }).
export const FRONTIER = { on: true, p: 0.3, scale: 3.2, solo: false };
if (typeof window !== 'undefined') {
  window.__frontier = (arg) => {
    if (arg === false) FRONTIER.on = false;
    else if (arg && typeof arg === 'object') { FRONTIER.on = true; Object.assign(FRONTIER, arg); }
    else FRONTIER.on = true;
    CM._isoGroundBake = null;
    return { ...FRONTIER };
  };
}
// Cellules PORTEUSES d'une emprise bâtie, tous types confondus (L.tiles = la
// source du rendu des bâtiments). Sert de garde : on ne rend jamais en herbe une
// cellule qui porte quelque chose. Cuit une fois par layout — le cache meurt avec
// lui puisqu'un recalcul reconstruit l'objet.
/* ── FRONT DE RUE : le bâtiment cesse de flotter au milieu de son lot (lot L3) ─
 * docs/PLAN-TISSU-URBAIN.md. Un bâtiment est ancré au coin SUD de son emprise et
 * dessiné centré dessus : il flotte au milieu de sa cellule, entouré de sol sur
 * ses quatre côtés. Il n'y a donc aucun MUR DE RUE, et c'est lui qui fait qu'une
 * ville se lit comme une ville : une rue est un couloir entre deux façades, pas
 * une clairière entre deux objets.
 *
 * On pousse donc chaque bâtiment vers LA rue qu'il dessert. Cette face est déjà
 * calculée ailleurs — la passe des allées de seuil la cherche pour poser son
 * trait de la porte à la chaussée — mais elle y était enfouie dans la boucle de
 * dessin. On l'extrait ici : le sprite et son seuil DOIVENT désigner la même
 * façade, sinon le trait sortirait d'un mur aveugle.
 *
 * Priorité S puis E puis O puis N : la porte des sprites regarde la caméra, donc
 * à choisir on ouvre sur la rue que le joueur voit. Ni pont (le seuil plongerait
 * dans l'eau) ni place (déjà dallée). Mémoïsé sur la tuile — les tuiles sont
 * reconstruites à chaque recompute, le cache se périme donc tout seul.
 * ------------------------------------------------------------------------- */
// push 0.14 → 0.19 (Raph, 2026-07-30, sur planche des trois doses). 0,19 n'est pas
// un chiffre rond : c'est TOUTE la place disponible devant une rue ordinaire
// (0,5 − demi-chaussée 0,25 − gap 0,06). Au-delà, le rabotage rendrait la même
// valeur et monter le réglage ne ferait plus rien. Devant une avenue ou un
// boulevard il rabote à 0,11 et 0,08, automatiquement.
export const FRONT = { on: true, push: 0.19, gap: 0.06 };
const FRONT_DIRS = [[0, 1], [1, 0], [-1, 0], [0, -1]];   // S, E, O, N
export function isoBuildingFront(t, roadMap) {
  if (t._front !== undefined) return t._front;
  let out = null;
  if (roadMap) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (const [dx, dy] of FRONT_DIRS) {
      const hits = [];
      for (let ax = 0; ax < sx; ax += 1) {
        for (let ay = 0; ay < sy; ay += 1) {
          const hx = t.gx + ax, hy = t.gy + ay;
          const rc = roadMap.get((hx + dx) + ',' + (hy + dy));
          if (!rc || rc.roadSurface === 'bridge' || rc.rank === 'plaza') continue;
          hits.push([hx, hy, rc]);
        }
      }
      if (!hits.length) continue;
      // Le MILIEU de la façade : une halle de trois cellules a sa porte centrée,
      // pas collée au coin.
      const [hx, hy, rc] = hits[hits.length >> 1];
      out = { dx, dy, hx, hy, rank: rc.rank };
      break;
    }
  }
  t._front = out;
  return out;
}
// Décalage du sprite vers sa façade, en fraction de tuile.
// ⚠ Le poussé est BORNÉ par la largeur de la chaussée d'en face : l'ancre du
// sprite est son point le plus au sud, et la chaussée d'une cellule voisine
// commence à `0,5 − demi-largeur` de son centre. Un poussé fixe qui va bien
// contre une rue (demi-largeur 0,25) plante le bâtiment DANS un boulevard
// (0,36). La borne se calcule, elle ne se règle pas à l'œil.
export function isoFrontOffset(t, roadMap, cfg = FRONT) {
  if (!cfg.on || !cfg.push) return null;
  const f = isoBuildingFront(t, roadMap);
  if (!f) return null;
  const room = 0.5 - isoRoadHalfW(f.rank) - cfg.gap;
  const push = Math.max(0, Math.min(cfg.push, room));
  if (push <= 0) return null;
  return { ox: f.dx * push, oy: f.dy * push };
}
if (typeof window !== 'undefined') {
  // Molette front de rue : __front(false) recentre les bâtiments comme avant ;
  // __front({push,gap}) règle le poussé (push = fraction de tuile vers la rue,
  // gap = marge minimale gardée jusqu'à la chaussée).
  window.__front = (arg) => {
    if (arg === false) FRONT.on = false;
    else if (arg && typeof arg === 'object') { FRONT.on = true; Object.assign(FRONT, arg); }
    else FRONT.on = true;
    if (CM.layout && CM.layout.tiles) for (const t of CM.layout.tiles) delete t._front;
    CM._isoGroundBake = null;   // les allées de seuil vivent dans le bake
    return { ...FRONT };
  };
}
// Cette cellule frontalière rend-elle la matière de l'AUTRE côté ? Pure et
// exportée : c'est ici que vit le garde qui empêche une maison de se retrouver
// plantée dans l'herbe, et un garde non testé ne protège rien.
// `urbanLogical` lit le LAYOUT (jamais kindAt, qui appelle ceci — l'inverse
// bouclerait) ; `built` = cellules porteuses d'une emprise (cf. builtCells).
export function frontierFlip(gx, gy, isUrban, urbanLogical, built, cfg = FRONTIER) {
  // LE RENDU ET L'EMPRISE DOIVENT CONCORDER. Des cellules sont peintes en sol de
  // ville SANS appartenir à urbanSet : le « quai-lite » pave toute berge qui
  // touche le tissu urbain. Sans ce garde, elles arrivaient ici avec isUrban=true
  // alors qu'urbanLogical répond false ; le test de bord ci-dessous ne pouvait
  // donc jamais les retenir, et le bruit les rendait en herbe — autrement dit il
  // EFFAÇAIT LES QUAIS (régression signalée par Raph). On ne perturbe que les
  // cellules dont la matière rendue vient bien de l'emprise logique.
  if (urbanLogical(gx, gy) !== isUrban) return false;
  // Seules les cellules DE BORD bougent : à l'intérieur des deux matières, rien
  // ne doit changer (sinon on moucheterait la ville et la plaine de taches).
  if (urbanLogical(gx + 1, gy) === isUrban && urbanLogical(gx - 1, gy) === isUrban
    && urbanLogical(gx, gy + 1) === isUrban && urbanLogical(gx, gy - 1) === isUrban) return false;
  // GARDE : une cellule qui porte un bâtiment garde son sol de ville.
  if (isUrban && built.has(gx + ',' + gy)) return false;
  const past = (x, y) => {
    const n = smoothNoise(x, y, cfg.scale, 'front');
    return isUrban ? n < cfg.p : n > 1 - cfg.p;
  };
  if (!past(gx, gy)) return false;
  // Pas de LOSANGE ISOLÉ : un seul retournement au milieu de l'autre matière se
  // lit comme une tache géométrique (l'écueil de toute valeur « par cellule »).
  // On exige qu'un voisin bascule aussi → les retournements viennent par paquets
  // et le bord ondule au lieu de moucheter. Le bruit étant lissé sur ~3 cellules
  // c'est presque toujours vrai : ça ne coupe que les cas isolés.
  if (cfg.solo) return true;
  return past(gx + 1, gy) || past(gx - 1, gy) || past(gx, gy + 1) || past(gx, gy - 1);
}

// ── FRANGE D'HERBE (jonction herbe↔sol) ──────────────────────────────────────
// L'escalier de losanges FRANC entre l'herbe et le sol urbain était la couture la
// plus dure de la carte. Le long de chaque arête partagée herbe/sol, l'herbe MORD
// désormais sur le sol : langues crantées profondes de 1..3 « pixels » d'art
// (pas pu suivant le zoom, comme le tapis d'herbe), pointe assombrie (ourlet
// d'ombre du gazon), trouées pour respirer, et quelques touffes debout à cheval
// sur la lisière. Haché par cellule+arête → stable au rebake, aucun motif répété.
// Ne s'applique QU'AUX sols urbain/terre (les dallages formels — place, parvis —
// gardent leur bord franc voulu) et pas vers l'eau (le fleuve couvre en live).
// Réglage live : __grassFringe(false) / ({depth,gapP,tuftP,flowerP,dark}).
// mode 'none' depuis le 2026-07-20 : la lisière herbe↔sol est un bord FRANC —
// seuls restent les touffes debout et les fleurs (accents validés). Historique
// des retours Raph, ne pas re-proposer sans demande : langues crantées 'teeth'
// (pointes sombres lisaient en « tas »), puis ourlet continu 'hem' (« ça n'a
// rien changé, enlève-le »). Les deux restent en knob — mais `dark` a été mis à
// 0 en même temps : le look 'teeth' HISTORIQUE se rejoue avec
// __grassFringe({mode:'teeth', dark:1}) (sans dark:1, pointes sans ourlet
// d'ombre = un rendu qui n'a jamais existé) ; 'hem' : __grassFringe({mode:'hem'}).
// mode 'wander' (2026-07-22) : on ne DÉCORE plus la couture, on DÉPLACE le bord.
// Les quatre décorations tentées ('teeth', 'hem', edgeFringe, contour d'un pack
// de tuiles) ont toutes été refusées, et toutes ajoutaient un élément SOMBRE le
// long de la ligne. Ici, aucun pixel nouveau : le long de l'arête, le bord est
// repoussé d'un côté ou de l'autre, et on repeint simplement avec la teinte du
// voisin. Là où le décalage est positif l'herbe avance dans le pavé, là où il
// est négatif le pavé avance dans l'herbe. Zéro couleur ajoutée, zéro ombre.
// Le décalage vient d'un bruit LISSÉ échantillonné en coordonnées MONDE (jamais
// par cellule ni par pas) : il est donc continu d'une cellule à l'autre, sinon
// chaque coin de losange rouvrirait une discontinuité — et c'est précisément la
// grille qu'on cherche à faire disparaître.
// wander = amplitude du décalage en « pixels d'art » ; wanderF = finesse (plus
// haut = ondulation plus serrée). Réglé pour onduler à ~1/5 de cellule, l'échelle
// à laquelle le pack trouvé beau ondulait — et non à la cellule entière.
// (Retombée de touffes côté sol ESSAYÉE puis ANNULÉE le 2026-07-28 — « non, ce
// n'est pas ce que j'ai demandé » : Raph voulait la PERSPECTIVE des tuiles
// d'herbe (leur débord de brins passe DEVANT le sol au nord, cf. le blit à
// débord d'ensureIsoTileKey/blitIsoTileKey), pas des brins ajoutés par la
// frange.)
export const GRASS_FRINGE = { on: true, mode: 'wander', depth: 1, gapP: 0.14, tuftP: 0.10, flowerP: 0.08, dark: 0, wander: 2.6, wanderF: 12 };
const GF_MID = [102, 126, 72];    // herbe légèrement ombrée (varie le corps des langues)
const GF_DARK = [76, 100, 54];    // pointe sombre : l'ourlet d'ombre de la lisière
export function drawGrassFringeEdge(ctx, f, pu, soilTone) {
  const dxE = f.bx - f.ax, dyE = f.by - f.ay;
  const len = Math.hypot(dxE, dyE);
  const steps = Math.max(3, Math.round(len / pu));
  const rect = (x, y, col) => { ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.fillRect(x, y, pu, pu); };
  const mode = GRASS_FRINGE.mode;
  if (mode === 'wander' && soilTone) {
    // BORD DÉPLACÉ (cf. l'en-tête du bloc). Densité ×2 comme 'hem' : sur une
    // diagonale 2:1, un pas par pu laisserait l'escalier à jour entre les carrés.
    const D = GRASS_FRINGE.wander * pu;
    const F = GRASS_FRINGE.wanderF;
    const n2 = Math.max(4, Math.ceil(len / pu) * 2);
    for (let i = 0; i < n2; i += 1) {
      const t = (i + 0.5) / n2;
      // Position MONDE du pas (en cellules) → le bruit est continu de cellule en
      // cellule, donc le bord ondule sans se rompre aux coins des losanges.
      const wx = f.wx0 + (f.wx1 - f.wx0) * t, wy = f.wy0 + (f.wy1 - f.wy0) * t;
      const d = (smoothNoise(wx * F, wy * F, 2.5, 'wan') - 0.5) * 2 * D;
      const ex = f.ax + dxE * t, ey = f.ay + dyE * t;
      const n = Math.round(Math.abs(d) / pu);
      // d > 0 : l'herbe mord dans le sol (sens rentrant) ; d < 0 : l'inverse.
      const sgn = d > 0 ? 1 : -1;
      const col = d > 0 ? SEASON_GRASS : soilTone;
      for (let j = 0; j < n; j += 1) {
        const s = (j + 0.5) * pu * sgn;
        rect(Math.round(ex + f.inx * s - pu / 2), Math.round(ey + f.iny * s - pu / 2), col);
      }
      // (Le LISERÉ DE NEIGE d'hiver qui vivait ici a été SUPPRIMÉ le 2026-07-28 —
      // il clignotait au pan avec le défilement incrémental, cf. le bloc NEIGE
      // D'HIVER plus haut. La neige vient des tuiles ISO_TILE_WINTER.)
    }
  }
  if (mode === 'hem') {
    // TRAIT CONTINU : rangée de pixels d'art SANS trouée qui longe l'arête, à
    // cheval côté sol — pas-de-vis en carrés opaques (pas de stroke anti-aliasé,
    // la lisière reste crispe). Densité ×2 pour un escalier plein sur les
    // diagonales 2:1.
    const n2 = Math.ceil(len / pu) * 2;
    for (let i = 0; i < n2; i += 1) {
      const t = (i + 0.5) / n2;
      rect(Math.round(f.ax + dxE * t + f.inx * 0.5 * pu - pu / 2),
        Math.round(f.ay + dyE * t + f.iny * 0.5 * pu - pu / 2), GF_DARK);
    }
  }
  for (let i = 0; i < steps; i += 1) {
    const h = cmHash(f.seed + ':' + i);
    if ((h & 255) / 255 < GRASS_FRINGE.gapP) continue;         // trouée : la lisière respire
    const t = (i + 0.5) / steps;
    const ex = f.ax + dxE * t, ey = f.ay + dyE * t;
    if (mode === 'teeth') {
      const d = Math.max(1, Math.round((1 + ((h >>> 8) % 3)) * GRASS_FRINGE.depth));
      for (let j = 0; j < d; j += 1) {
        const bx = Math.round(ex + f.inx * (j + 0.5) * pu - pu / 2);
        const by = Math.round(ey + f.iny * (j + 0.5) * pu - pu / 2);
        const col = (j === d - 1 && GRASS_FRINGE.dark) ? GF_DARK
          : (((h >> (10 + j)) & 3) === 0 ? GF_MID : SEASON_GRASS);
        rect(bx, by, col);
      }
    }
    // Touffe debout occasionnelle, à cheval sur la lisière : brins sombres à
    // pointe claire (mêmes tons que le tapis d'herbe → aucun accent nouveau).
    if ((h % 997) / 997 < GRASS_FRINGE.tuftP) {
      const nB = 2 + ((h >> 16) & 1);
      const bh = 2 * pu + ((h >> 17) & 1) * pu;
      for (let k = 0; k < nB; k += 1) {
        const bxi = Math.round(ex + (k - (nB - 1) / 2) * (pu + 1));
        const jh = bh - ((h >> (18 + k)) & 1) * pu;
        ctx.fillStyle = `rgb(${GD_BLADE[0]},${GD_BLADE[1]},${GD_BLADE[2]})`;
        ctx.fillRect(bxi, Math.round(ey - jh), pu, jh);   // corps du brin
        rect(bxi, Math.round(ey - jh), SEASON_TIP || GD_TIP);   // pointe claire
      }
    }
  }
  // FLEURS DE LISIÈRE (retour Raph 2026-07-16 : « rajoute des petites fleurs ») :
  // pâquerettes & accents de la palette du tapis (GD_FLOWERS, blanc/jaune
  // dominants), posés à cheval sur la lisière, surtout côté herbe — une
  // guirlande discrète qui souligne le bord. 2e boucle : dessinées APRÈS les
  // langues pour qu'un pas voisin ne rogne pas leurs pétales.
  const fringeFlowerP = GRASS_FRINGE.flowerP * SEASON_FLOWER_MUL;
  if (fringeFlowerP > 0) {
    for (let i = 0; i < steps; i += 1) {
      const hf = cmHash(f.seed + ':fl:' + i);
      if ((hf & 1023) / 1023 >= fringeFlowerP) continue;
      const t = (i + 0.5) / steps;
      const off = (((hf >> 10) & 3) - 2) * pu;          // −2pu (herbe) .. +1pu (langue)
      const cx = Math.round(f.ax + dxE * t + f.inx * off);
      const cy = Math.round(f.ay + dyE * t + f.iny * off);
      const fl = GD_FLOWERS[(hf >>> 12) % GD_FLOWERS.length];   // ⚠ >>> : un >> signé rendait l'index négatif
      rect(cx - pu, cy, fl[0]); rect(cx + pu, cy, fl[0]);
      rect(cx, cy - pu, fl[0]); rect(cx, cy + pu, fl[0]);
      rect(cx, cy, fl[1]);
    }
  }
}
if (typeof window !== 'undefined') {
  // Frange d'herbe : __grassFringe(false) éteint ; ({depth,gapP,tuftP,flowerP,dark})
  // réglage fin ; sans argument = rallume. Rebake immédiat.
  window.__grassFringe = (arg) => {
    if (arg === false) GRASS_FRINGE.on = false;
    else if (arg && typeof arg === 'object') { GRASS_FRINGE.on = true; Object.assign(GRASS_FRINGE, arg); }
    else GRASS_FRINGE.on = true;
    CM._isoGroundBake = null;
    return { ...GRASS_FRINGE };
  };
}

// ── Sol urbain : MATIÈRE par âge (terre → pavé → dalles → béton → tech) ───────
// DA Raph 2026-07-12 : sol urbain « différent à chaque ère », CALME MAIS LISIBLE.
// Procédural (pas de tuile → pas de tiling comme l'herbe), posé dans le bake, dans
// NOTRE palette. mat.tone = aplat de base ; le MOTIF (cailloux / joints de pavés /
// joints de dalles / dilatation béton / coutures tech) est tracé PAR-DESSUS, à
// FAIBLE contraste. Les joints suivent les arêtes du losange (= axes monde) → un
// pavage iso naturel, sans concurrencer les bâtiments. 10 âges (ageVisualConfig).
// tile = tuile PixelLab par matière (/pixelart/iso/<tile>.png) ; si le PNG manque,
// repli sur le motif procédural (drawUrbanDetail). type/joint/seam = params du repli.
const URBAN_MATS = [
  // Tons 0-1 = ton moyen MESURÉ de ground-earth (lot 606 dé-liseré, imprimé par
  // fetchGroundTiles) : l'aplat de repli doit rester dans la famille de la tuile
  // qui le recouvre, sinon le sol « saute » quand le PNG décode.
  { tone: [187, 135, 82], type: 'earth', grav: 0, tile: 'ground-earth' },               // 0 primitif — terre battue
  { tone: [187, 135, 82], type: 'earth', grav: 1, tile: 'ground-earth' },               // 1 agricole — terre + graviers
  { tone: [170, 156, 130], type: 'cobble', joint: 0.16, tile: 'ground-cobble' },        // 2 bourg — pavés irréguliers
  { tone: [158, 152, 138], type: 'cobble', joint: 0.18, tile: 'ground-cobble' },        // 3 fortifié — pavé de pierre
  { tone: [188, 178, 150], type: 'flagstone', joint: 0.16, tile: 'ground-flagstone' },  // 4 impérial — grandes dalles
  { tone: [192, 186, 168], type: 'flagstone', joint: 0.14, tile: 'ground-flagstone' },  // 5 monumental — pierre claire
  { tone: [162, 160, 154], type: 'concrete', joint: 0.12, tile: 'ground-concrete' },    // 6 mégalopole — béton
  { tone: [94, 100, 116], type: 'tech', seam: [116, 196, 208], tile: 'ground-tech' },   // 7 noosphère — dalles tech
  { tone: [86, 94, 116], type: 'tech', seam: [130, 210, 220], tile: 'ground-tech' },    // 8 stellaire
  { tone: [80, 90, 118], type: 'tech', seam: [150, 224, 232], tile: 'ground-tech' },    // 9 démiurge
];
// tileA/tileJit : DOSAGE de la tuile de matière « terre » — alpha = tileA +
// bruit LISSÉ × tileJit. Historique des retours Raph : tuile PLEINE = tapis
// criard (2026-07-12), alpha haché PAR CELLULE = damier de losanges, plaques
// par bruit lissé = « tas de terre » épars, et même en dose constante à 0.6
// les mottes lisaient encore comme des tas/« pavés de jonction » (2026-07-20).
// VERDICT FINAL 2026-07-20 : le grief était la FORCE de la trame, pas sa
// répartition → dose CONSTANTE ET FAIBLE (0.12 = simple grain qui vit, zéro
// motte lisible ; validé par captures jour/nuit). tileJit reste un knob.
// noiseAmp : VOILE DE NUANCE par bruit lissé — essayé à 0.3, coupé le
// 2026-07-16 (retour Raph : « retire les plaques grises sur le sol ») ; knob.
// tileA 0.12 → 1 (Raph 2026-07-28) : le 0.12 dosait l'ANCIENNE tuile de terre
// unique (historique ci-dessus, conservé) ; les 4 variantes brutes regénérées
// s'affichent pleines, comme les autres matières.
export const URBAN_DETAIL = { on: true, mult: 1, band: null, tiles: true, tileA: 1, tileJit: 0, noiseAmp: 0 };   // band≠null = force ère (preview) ; tiles=false → procédural
// S2 — DOSE PAR MATIÈRE (docs/PLAN-RENDU-VILLE.md). `tileA` ne s'appliquait qu'à la
// TERRE BATTUE : partout ailleurs la tuile partait à alpha 1, sans qu'aucun réglage
// ne puisse la calmer. Or le grain mesuré des matières de sol est très inégal —
// écart moyen de luminance entre pixels VOISINS, sur les PNG livrés :
//
//   ground-cobble 18,4   ·   iso-grass 16,7   ·   ground-flagstone 6,4
//   iso-dirt 5,8   ·   ground-concrete 4,6   ·   ground-earth 4,4   ·   ground-tech 2,8
//
// Le pavé est 4 à 6 fois plus bruyant que toutes les autres pierres, et c'est la
// matière des bandes 2 et 3 — celles de la capture « brouillon » de Raph.
//
// ⚠ SEUL LE PAVÉ EST DOSÉ, et c'est un ARBITRAGE de Raph (2026-08-05), pas un
// réglage libre : il avait lui-même monté `tileA` de 0,12 à 1 le 2026-07-28 pour que
// les variantes régénérées « s'affichent pleines ». La planche des trois doses
// (`.preview-shots/s2-planche-pave.png`, 1 / 0,6 / 0,35) a tranché sur **0,6** :
// le pavé garde sa matière et cesse de grésiller.
//
//   grain moyen de la frame (écart-type local 8×8) : 40,0 → 36,9 (médiane 38,5 → 33,7)
//   18,0 % des pixels changent, caméra identique — et le masque de différence
//   montre les silhouettes de bâtiments noires au pixel près : SEUL le sol bouge.
//
// ⚠ Doser ne laisse aucun trou parce que l'aplat de ton est peint DESSOUS : pour
// `urban`, `texAlpha` vaut 0, donc la branche de repli peint le losange plein avant
// la tuile. Si ce 0 disparaissait, la dose montrerait le fond du canvas — c'est
// pour ça que la garde le vérifie dans le SOURCE.
//
// Les autres matières restent à 1 : leur grain mesuré est 4 à 6 fois plus bas
// (flagstone 6,4 · concrete 4,6 · earth 4,4 · tech 2,8 contre 18,4 pour le pavé).
// Molette : `__groundMat({ tileAType: { cobble: 1 } })` rejoue l'ancien.
export const URBAN_TILE_A = { earth: null, cobble: 0.6, flagstone: 1, concrete: 1, tech: 1 };
// `null` = suit `tileA` (la terre battue garde son réglage historique partagé).
export const urbanTileAlpha = (type) => {
  const v = URBAN_TILE_A[type];
  return v == null ? URBAN_DETAIL.tileA : v;
};
export function urbanMatFor(band) {
  const b = URBAN_DETAIL.band != null ? URBAN_DETAIL.band : band;
  return URBAN_MATS[Math.max(0, Math.min(URBAN_MATS.length - 1, b | 0))];
}
export function drawUrbanDetail(ctx, gx, gy, px, py, hw, hh, mat) {
  const k = URBAN_DETAIL.mult, t = mat.tone;
  const shade = (f) => `rgb(${Math.max(0, Math.min(255, Math.round(t[0] * f)))},${Math.max(0, Math.min(255, Math.round(t[1] * f)))},${Math.max(0, Math.min(255, Math.round(t[2] * f)))})`;
  const N = [px, py], E = [px + hw, py + hh], W = [px - hw, py + hh];
  const seg = (a, b, style, lw) => { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  if (mat.type === 'earth') {
    // cailloux/poussière : quelques points sombres+clairs (gravier ×1 en agricole).
    const pu = Math.max(1, Math.round(hw * 0.05));
    for (let i = 0, n = mat.grav ? 3 : 2; i < n; i += 1) {
      const h = cmHash('ud:' + gx + ':' + gy + ':' + i);
      const fx = 0.2 + ((h >> 3) & 63) / 63 * 0.6, fy = 0.2 + ((h >> 9) & 63) / 63 * 0.6;
      const sx = Math.round(px + (fx - fy) * hw), sy = Math.round(py + (fx + fy) * hh);
      ctx.fillStyle = (h & 1) ? shade(0.86) : shade(1.08);
      ctx.fillRect(sx, sy, pu, pu);
    }
    return;
  }
  // Joints : 2 arêtes du HAUT / cellule → chaque joint interne tracé 1× (l'arête sud
  // d'une cellule = l'arête nord de sa voisine, tracée par celle-ci). Fins & doux.
  const lw = Math.max(1, hw * 0.03);
  if (mat.type === 'cobble') {
    const jl = shade(1 - mat.joint * k);
    seg(N, E, jl, lw); seg(N, W, jl, lw);
    seg([px + 0.5 * hw, py + 0.5 * hh], [px - 0.5 * hw, py + 1.5 * hh], jl, lw);   // médiane monde X (2×2 pavés)
    seg([px - 0.5 * hw, py + 0.5 * hh], [px + 0.5 * hw, py + 1.5 * hh], jl, lw);   // médiane monde Y
    return;
  }
  if (mat.type === 'flagstone') {
    const jl = shade(1 - mat.joint * k);
    seg(N, E, jl, lw); seg(N, W, jl, lw);                                          // 1 dalle par tuile
    return;
  }
  if (mat.type === 'concrete') {
    const jl = shade(1 - mat.joint * k);
    if ((((gx % 3) + 3) % 3) === 0) seg(N, W, jl, lw);                             // joints de dilatation ~1/3
    if ((((gy % 3) + 3) % 3) === 0) seg(N, E, jl, lw);
    if ((cmHash('uc:' + gx + ':' + gy) % 7) === 0) {                              // tache faible éparse
      ctx.fillStyle = 'rgba(40,40,46,0.10)';
      ctx.beginPath(); ctx.ellipse(px, py + hh, hw * 0.42, hh * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  if (mat.type === 'tech') {
    const s = mat.seam, a = (0.22 * k).toFixed(2), lw2 = Math.max(1, hw * 0.025);
    seg(N, E, `rgba(${s[0]},${s[1]},${s[2]},${a})`, lw2);                          // coutures lumineuses
    seg(N, W, `rgba(${s[0]},${s[1]},${s[2]},${a})`, lw2);
    return;
  }
}
if (typeof window !== 'undefined') {
  // Molette sol urbain : __groundMat(false) off ; (nombre)=intensité ; ({band:3})
  // force une ère pour l'aperçu ; ({mult,band,tileA,tileJit,noiseAmp}) réglage fin
  // (tileA/tileJit = dose de la trame terre par cellule ; noiseAmp = voile de
  // nuance en plaques lissées). Rebake immédiat.
  window.__groundMat = (arg) => {
    if (arg === false) URBAN_DETAIL.on = false;
    else if (typeof arg === 'number') { URBAN_DETAIL.on = true; URBAN_DETAIL.mult = arg; }
    else if (arg && typeof arg === 'object') {
      URBAN_DETAIL.on = true;
      // S2 : `tileAType` va dans SA table, pas dans URBAN_DETAIL — sinon la clé
      // resterait inerte et la molette mentirait en silence.
      const { tileAType, ...rest } = arg;
      if (tileAType && typeof tileAType === 'object') Object.assign(URBAN_TILE_A, tileAType);
      Object.assign(URBAN_DETAIL, rest);
    } else URBAN_DETAIL.on = true;
    CM._isoGroundBake = null;
    return { ...URBAN_DETAIL, tileAType: { ...URBAN_TILE_A } };
  };
}
// Couple de surfaces d'une ère, tel que le sol le PEINT (aucun forçage d'aperçu).
// Exporté pour la garde de contraste : elle lit les PNG que ces clés désignent —
// recopier les clés dans le test reviendrait à le comparer à lui-même.
export function isoEraSurface(band) {
  const b = Math.max(0, Math.min(URBAN_MATS.length - 1, band | 0));
  return {
    ground: URBAN_MATS[b].tile,
    road: ROAD_MATS[Math.max(0, Math.min(ROAD_MATS.length - 1, b))].tile,
    veil: ROAD_VEIL[Math.max(0, Math.min(ROAD_VEIL.length - 1, b))],
  };
}
// ── FRANGE DE CHAUSSÉE : même grammaire que la lisière d'herbe, entre la dalle
// et son épaulement — l'épaulement MORD sur le bord du ruban par petits blocs
// (1..2 pu, deux tons), et la matière de la route s'égrène en GRAVILLONS épars
// sur l'épaulement. Le bord parfaitement géométrique faisait « route tamponnée » ;
// cranté, il fait chemin qui vit avec son sol. Intensité PAR ÈRE (roadFringeK) :
// terre battue très effrangée → pavé/dalle un peu → asphalte à peine → tech NETTE
// (une voie high-tech aux bords rongés ne se lit pas). Bake seulement, hash par
// arête+pas (stable, continu de cellule en cellule — rien « par cellule »).
export function roadFringeK(band) {
  return band >= 7 ? 0 : band >= 6 ? 0.5 : band >= 2 ? 0.75 : 1;
}
export function drawRoadEdgeFringe(ctx, seg, pu, biteCol, biteCol2, spillCol, k) {
  const dxE = seg.bx - seg.ax, dyE = seg.by - seg.ay;
  const len = Math.hypot(dxE, dyE);
  if (len < pu * 2) return;
  const steps = Math.max(2, Math.round(len / pu));
  for (let i = 0; i < steps; i += 1) {
    const h = cmHash(seg.seed + ':' + i);
    const t = (i + 0.5) / steps;
    const ex = seg.ax + dxE * t, ey = seg.ay + dyE * t;
    // Morsure de l'épaulement sur la dalle (vers l'INTÉRIEUR du ruban).
    if ((h & 255) / 255 < 0.6 * k) {
      const d = 1 + ((h >>> 8) % 2);
      for (let j = 0; j < d; j += 1) {
        ctx.fillStyle = ((h >>> (10 + j)) & 1) ? biteCol : biteCol2;
        ctx.fillRect(Math.round(ex - seg.ox * (j + 0.5) * pu - pu / 2), Math.round(ey - seg.oy * (j + 0.5) * pu - pu / 2), pu, pu);
      }
    }
    // Gravillons égrenés vers l'EXTÉRIEUR (sur l'épaulement, un peu au-delà).
    if (((h >>> 16) & 255) / 255 < 0.3 * k) {
      const dOut = 1 + ((h >>> 24) & 1);
      ctx.fillStyle = spillCol;
      ctx.fillRect(Math.round(ex + seg.ox * (dOut + 0.2) * pu - pu / 2), Math.round(ey + seg.oy * (dOut + 0.2) * pu - pu / 2), pu, pu);
    }
  }
}
export function roadMatFor(band) {
  const b = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
  return ROAD_MATS[Math.max(0, Math.min(ROAD_MATS.length - 1, b | 0))];
}
if (typeof window !== 'undefined') {
  // Molette chaussée : __roadMat(false) off ; ({tiles,band,shoulderMix,shoulderV,
  // groove,grooveA,feather,featherA,edgeFringe,veilK}) réglage fin (shoulder* =
  // teinte de l'épaulement ; groove* = gorge d'ombre au contact de la dalle ;
  // feather* = ourlet de fondu épaulement→sol ; edgeFringe = crantage rejeté, 0 ;
  // veilK = dose du voile de lecture, 0 rend la rue à sa tuile nue). Rebake immédiat.
  window.__roadMat = (arg) => {
    if (arg === false) ROAD_DETAIL.on = false;
    else if (arg && typeof arg === 'object') { ROAD_DETAIL.on = true; Object.assign(ROAD_DETAIL, arg); }
    else ROAD_DETAIL.on = true;
    syncIsoStreetGeom();   // la gorge participe à la géométrie publiée aux agents
    isoTileCache.forEach((e) => { e.veiled = null; });   // veilK repeint les faces voilées
    CM._isoGroundBake = null;
    return { ...ROAD_DETAIL };
  };
}
// GÉOMÉTRIE DE RUE publiée aux AGENTS (agents.js ne peut pas importer ce module :
// import inverse). Les piétons et véhicules marchent/roulent sur la géométrie que
// le renderer DESSINE — une seule source de vérité, resynchronisée quand une
// molette change la rue. En tuiles (fractions) :
//   isoVehLane      — centre de voie = demi-chaussée / 2 (conduite à droite) ;
//   isoPedEdge      — milieu de la bande de trottoir (ères à trottoir) ;
//   isoPedEdgeLow   — ligne d'accotement (ères de terre, avant les trottoirs) ;
//   isoPedSpread    — demi-étalement PERSONNEL des piétons dans la bande ;
//   isoSidewalkMinBand — première ère à trottoir.
function syncIsoStreetGeom() {
  const bandW = SIDEWALK_ISO.w - ROAD_DETAIL.groove - SIDEWALK_ISO.curb;   // largeur visible de la bande
  CM.isoVehLane = ROAD_BAND / 2;
  CM.isoPedEdge = ROAD_BAND + ROAD_DETAIL.groove + SIDEWALK_ISO.curb + bandW / 2;
  CM.isoPedEdgeLow = ROAD_BAND + 0.09;
  CM.isoPedSpread = Math.max(0, bandW * 0.3);
  CM.isoSidewalkMinBand = SIDEWALK_ISO.minBand;
  // Variantes PAR RANG (hiérarchie des largeurs) : les agents regardent d'abord
  // le rang de LEUR cellule, et retombent sur les scalaires ci-dessus (rang
  // inconnu, hors-route, saves d'avant la hiérarchie).
  CM.isoVehLaneByRank = {};
  CM.isoPedEdgeByRank = {};
  CM.isoPedEdgeLowByRank = {};
  for (const rk of Object.keys(ISO_ROAD_HALFW)) {
    const w = ISO_ROAD_HALFW[rk];
    CM.isoVehLaneByRank[rk] = w / 2;
    CM.isoPedEdgeByRank[rk] = w + ROAD_DETAIL.groove + SIDEWALK_ISO.curb + bandW / 2;
    CM.isoPedEdgeLowByRank[rk] = w + 0.09;
  }
}
syncIsoStreetGeom();
if (typeof window !== 'undefined') {
  window.__sidewalkIso = (arg) => {
    if (arg === false) SIDEWALK_ISO.on = false;
    else if (arg && typeof arg === 'object') { SIDEWALK_ISO.on = true; Object.assign(SIDEWALK_ISO, arg); }
    else SIDEWALK_ISO.on = true;
    syncIsoStreetGeom();
    CM._isoGroundBake = null;
    return { ...SIDEWALK_ISO };
  };
}

// Le DÉTAIL D'HERBE D'UNE FOURNÉE, tampon compris. Sorti de drawIsoGround le
// 2026-08-23, même raison que le parvis : `grassCells` est un tableau PLAT empaqueté
// par 4, et ce format regarde le peintre, pas l'orchestrateur.
// ⚠ Le LISSAGE est coupé UNE FOIS pour toute la fournée : les touffes sont des
// sprites agrandis au pixel d'art, et le poser par cellule coûterait des centaines
// d'écritures de propriété pour le même résultat.
export function drawGrassDetailAll(ctx, grassCells, hw, hh) {
  const prevGDS = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < grassCells.length; i += 4) {
    drawGrassDetail(ctx, grassCells[i], grassCells[i + 1], grassCells[i + 2], grassCells[i + 3], hw, hh);
  }
  ctx.imageSmoothingEnabled = prevGDS;
}

// La FRANGE D'HERBE d'une fournée. `puF` est le pixel d'art de la frange : sa
// formule regarde le peintre. ⚠ L'appelant garde l'ORDRE — après le fond (les langues
// mordent sur des cellules déjà peintes), avant les rubans (la route les recouvre).
export function drawGrassFringeAll(ctx, fringes, hw, urb) {
  const puF = Math.max(1, Math.round(hw * 0.055));
  // urb = teinte du sol de l'ère : le mode 'wander' repeint avec elle quand le
  // bord se déplace vers l'herbe (aucune couleur nouvelle n'est introduite).
  for (const f of fringes) drawGrassFringeEdge(ctx, f, puF, urb);
}
