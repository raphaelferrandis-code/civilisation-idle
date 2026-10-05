"use strict";
// LE PEINTRE DU SOL — l'ordre des passes, et rien d'autre.
//
// Jusqu'au lot 4 de PLAN-SOL-PYRAMIDE (2026-09-14), ce fichier portait aussi le
// CACHE du sol : un bake vivant plein écran, ses tranches, ses bandes de
// défilement, un cache de photos par cran de zoom, la pré-cuisson en fond, le
// filet, l'atterrissage « carte web », deux budgets prédictifs et trois horloges
// — 1 141 lignes pour décider QUAND recuire. Le sol en tuiles (solPyramide.js,
// solPyramideFrame.js) a remplacé tout cela : `drawIsoGround` cuit une zone
// quelconque, la pyramide lui donne des tuiles. Les leçons de l'ancien cache
// sont dans docs/NOTE-SOL-PYRAMIDE.md et les fiches mémoire du chantier.
//
// ⚠ `ISO_GROUND_LOD` reste, éteint : les passes savent encore cuire « allégé »
// (LOD/HARD), mais plus personne ne le leur demande — une tuile est toujours
// pleine, c'est le cache qui absorbe le coût, pas le dessin.
//
// ⚠ Ce module ne sait pas quelle heure il est dans le jeu : `drawIsoGround`
// lit la caméra, la taille de viewport et la cible dans `CM` — c'est ce qui
// permet à la pyramide de le pointer sur une tuile (cf. cookTile).
import { CM } from '../layout.js';
import { DIRT_TONE, CAMP_GROUND, campFlowerK, courOf } from './isoTissu.js';
import { townLawnAt } from './isoMeadow.js';
import { sweepIsoGroundCells } from './isoGroundCells.js';
import { SEASON_GRASS, drawGrassDetailAll, drawGrassFringeAll } from './isoGroundDetail.js';
import { makeGroundBake } from './isoGroundResolve.js';
import { drawIsoGroundRoads } from './isoGroundRoads.js';
import { BEACH } from './isoGroundTiles.js';
import { terrainKey, terrainMaxPx } from './isoTerrain.js';
import { rgb } from './isoPalette.js';
import { drawIsoMedians } from './isoStreet.js';
import { drawWonderGroundAll, wonderToneFor, WONDER_GROUND, wonderGroundSet } from './isoWonderGround.js';
import { drawGrassVeils, forestFlowerK } from './isoForestFloor.js';
import { WINTER } from '../seasonMode.js';

// ── SOL : l'ordre des passes ─────────────────────────────────────────────────
// Les cellules-route ne remplissent PLUS tout leur losange (1er jet : rue aussi
// large qu'un îlot → grille illisible). Comme en legacy : fond de TROTTOIR (ton
// urbain) + RUBAN de chaussée plus étroit le long des connexions (masque E/O/S/N).
const ISO_GROUND_LOD = { on: false, light: false };
export function drawIsoGround() {
  // Le MONTAGE vit dans isoGroundResolve.js depuis le 2026-08-23 : il résout, il ne
  // peint pas. Ce qui reste ici est l'ORDRE des passes, et rien d'autre.
  const { bake, resolve, out } = makeGroundBake(ISO_GROUND_LOD);
  const { ctx, T, z, hw, hh, LOD, HARD, b, L, band, mat, urb, road, roadMap, riverCells, plazaEra, wg, PR } = bake;
  const { kindAt, grassAt, keyOfKind, lisiere } = resolve;
  const { fringes, roads, wonderCells, grassCells, grassMask, grassMaskR, veilPush, veilPushRects, flushVeils } = out;
  ctx.save();
  ctx.lineJoin = 'round';
  // FOND D'HERBE UNIQUE : l'herbe (l'écrasante majorité des cellules — toute la
  // plaine hors ville) n'est plus remplie losange par losange mais en UN fillRect
  // sous tout le viewport (les bornes b projettent toujours un sur-ensemble de
  // l'écran, cf. visibleCellBounds). Les cellules d'herbe sautent leur aplat
  // par cellule ; un fond continu n'a par construction AUCUNE couture entre
  // cellules d'herbe, et les sols urbains repeignent par-dessus (leur liseré
  // anti-couture inchangé). L'eau reste peinte herbe (berges douces, cf. kindAt).
  ctx.fillStyle = rgb(SEASON_GRASS, 1);
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  const tLoop = PR && performance.now();
  // ── CULL ÉCRAN PAR CELLULE ────────────────────────────────────────────────
  // visibleCellBounds rend un RECTANGLE de grille (gx0..gx1, gy0..gy1) : la boîte
  // englobante des 4 coins d'écran projetés en monde. Or en isométrique, un écran
  // rectangulaire se projette en LOSANGE — la boîte englobante d'un losange fait
  // le double de son aire. Compté directement : 49 à 51 % des cellules parcourues
  // sont ENTIÈREMENT hors écran, à tous les zooms (2 006 visibles sur 3 969 à
  // zoom 1 ; 12 124 sur 24 649 à zoom 0,4). La moitié de la recuisson — le poste
  // le plus cher de la carte — était dépensée à classer, remplir et border des
  // losanges que personne ne peut voir.
  // Le test est un rejet précoce, avant kindAt et tout tracé.
  // ⚠ Marge d'une cellule pleine : le losange pend SOUS son coin nord (2*hh) et
  // les tuiles/touffes débordent un peu. Trop serré, on raboterait le bord.
  // + terrainMax en Y : la contremarche d'une cellule haute pend d'autant sous
  // son losange — culler au coin nord la couperait au bord haut de l'écran.
  // A/B : globalThis.__isoCellCull = false rejoue le balayage complet.
  const cullPadX = hw * 2, cullPadY = hh * 4 + terrainMaxPx() * z;
  const cullOn = globalThis.__isoCellCull !== false;
  // Contremarches du relief (quads écran, 8 nombres chacun) : terre claire/sombre
  // + pierre d'ère claire/sombre — la tranche prend la matière de sa cellule.
  // Polish : lèvres (herbe/margelle, quads), assise sombre (quads), joints de
  // pierre (verticales, 3 nombres) et ombre de contact au pied (segments, 4).
  const faceL = [], faceD = [], faceLU = [], faceDU = [];
  const faceFoot = [], faceBand = [], faceJoint = [], faceLipG = [], faceLipS = [];
  sweepIsoGroundCells(
    { ctx, T, hw, hh, LOD, HARD, b, cullOn, cullPadX, cullPadY,
      L, roadMap, riverCells, urb, mat, plazaEra, wg, PR },
    { kindAt, grassAt, keyOfKind, lisiere },
    { fringes, roads, wonderCells, grassCells, grassMask, grassMaskR, veilPush, veilPushRects,
      faceL, faceD, faceLU, faceDU, faceFoot, faceBand, faceJoint, faceLipG, faceLipS },
  );
  if (PR) PR.cells = performance.now() - tLoop;
  // CONTREMARCHES DU RELIEF : remisées par le balayage, peintes en DEUX fills
  // d'union (claire = face +y vers la lumière haut-gauche, sombre = face +x).
  // L'ordre est libre — une face ne recouvre jamais un losange, le voisin plus
  // bas commence exactement où elle finit — mais AVANT tout ce qui se pose sur
  // le sol (parvis, franges, rubans) : la route rampe PAR-DESSUS sa marche.
  if (faceL.length || faceD.length || faceLU.length || faceDU.length) {
    const tF = PR && performance.now();
    const flushFaces = (arr, col) => {
      if (!arr.length) return;
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < arr.length; i += 8) {
        ctx.moveTo(arr[i], arr[i + 1]); ctx.lineTo(arr[i + 2], arr[i + 3]);
        ctx.lineTo(arr[i + 4], arr[i + 5]); ctx.lineTo(arr[i + 6], arr[i + 7]);
        ctx.closePath();
      }
      ctx.fill();
    };
    flushFaces(faceD, rgb(DIRT_TONE, 0.58));
    flushFaces(faceL, rgb(DIRT_TONE, 0.82));
    flushFaces(faceDU, rgb(urb, 0.60));    // pierre d'ère : mur de soutènement
    flushFaces(faceLU, rgb(urb, 0.84));
    // ── Polish, du fond vers l'avant : assise sombre → joints → lèvre (elle
    // recouvre le haut des deux premiers) → ombre de contact au pied.
    flushFaces(faceBand, 'rgba(0,0,0,0.16)');
    if (faceJoint.length) {
      ctx.strokeStyle = 'rgba(0,0,0,0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < faceJoint.length; i += 3) {
        ctx.moveTo(faceJoint[i], faceJoint[i + 1]);
        ctx.lineTo(faceJoint[i], faceJoint[i + 2]);
      }
      ctx.stroke();
    }
    flushFaces(faceLipG, rgb(SEASON_GRASS, 0.72));
    // Margelle : le ton urbain fondu vers le blanc — le même geste que la berge
    // maçonnée (lightenHex), en tableau.
    flushFaces(faceLipS, rgb([
      Math.round(urb[0] + (255 - urb[0]) * 0.28),
      Math.round(urb[1] + (255 - urb[1]) * 0.28),
      Math.round(urb[2] + (255 - urb[2]) * 0.28)], 1));
    if (faceFoot.length) {
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.lineWidth = Math.max(1, z * 0.8);
      ctx.beginPath();
      for (let i = 0; i < faceFoot.length; i += 4) {
        ctx.moveTo(faceFoot[i], faceFoot[i + 1]);
        ctx.lineTo(faceFoot[i + 2], faceFoot[i + 3]);
      }
      ctx.stroke();
    }
    if (PR) PR.faces = performance.now() - tF;
  }
  // PARVIS : tout le dallage, PUIS toute la margelle. L'ordre compte — la margelle
  // encadre le parvis et doit rester au-dessus des joints, comme avant.
  drawWonderGroundAll(ctx, wonderCells, hw, hh, wg, wonderToneFor(plazaEra, CM.season === WINTER));
  // Voiles d'herbe puis FLEURS : même ordre qu'avant (voile sous fleur), mais en
  // fills d'union groupés. Les motifs de drawGrassDetail tiennent dans leur
  // cellule → « tous les voiles puis toutes les fleurs » == l'entrelacé par cellule.
  const tV = PR && performance.now();
  flushVeils();
  // PRÉS puis SOUS-BOIS (isoMeadow, isoForestFloor) : deux voiles lissés, dans
  // l'herbe seule — avant les fleurs, qui s'éteignent sous les couronnes.
  if (!LOD) drawGrassVeils(ctx, b, L, T, hw, hh, grassMask, grassMaskR);
  // Camp : l'herbe piétinée au ras de la terre battue ne fleurit pas (campFlowerK).
  const campFK = campFlowerK(L);
  // Pelouse de ville (isoMeadow, lot 5) : ni touffes, fleurs en massif au cœur.
  drawGrassDetailAll(ctx, grassCells, hw, hh, lisiere, forestFlowerK(L, campFK), townLawnAt(L, courOf(L)));
  if (PR) PR.grass += performance.now() - tV;
  // FRANGE D'HERBE : après le fond (les langues mordent sur des cellules déjà
  // peintes), AVANT les rubans de chaussée (la route recouvre ce qui la borde).
  if (fringes.length) {
    const tFr = PR && performance.now();
    drawGrassFringeAll(ctx, fringes, hw, urb, lisiere, campFK ? CAMP_GROUND.flowerNear : 1);
    if (PR) PR.fringe = performance.now() - tFr;
  }
  drawIsoGroundRoads(
    { ctx, T, z, hw, LOD, HARD, L, band, road, roadMap, urb, PR },
    { kindAt },
    roads,
  );
  // Terre-plein PLANTÉ des boulevards 2-cellules : la passe est partie dans
  // isoStreet.js le 2026-08-23, avec sa config (elle y vivait déjà). Le chronomètre
  // reste ici — mesurer l'ordre des passes est le travail de cet orchestrateur.
  const tMd = PR && performance.now();
  drawIsoMedians(ctx, L.terrePlein, T, z);
  if (PR) {
    PR.median = performance.now() - tMd;
    PR.total = performance.now() - PR.t0;
    delete PR.t0;
    globalThis.__isoGroundProfileLast = PR;
  }
  ctx.restore();
  return true;
}

// LE SUFFIXE DE CLÉ DU SOL — tout ce qui change le sol cuit HORS du plan et du
// zoom : bande d'ère, saison, plage (masque du quai + molette), relief, aperçu
// de merveille. Partagé depuis le lot 2 de PLAN-SOL-PYRAMIDE avec les tuiles
// (solPyramideFrame.js) : une identité de contenu, deux caches.
// ⚠ La PLAGE est dans le sol bakÉ (kind 'shingle') : sa géométrie dépend du
// masque effectif du quai, donc de `quayGate.key` (layout + mode `full`) et de
// la molette __beach — sans ces crans, basculer `full` ou couper la plage
// laissait les galets gelés dans le bake (piège rencontré trois fois).
// LE TERRAIN est dans le sol bakÉ : niveaux et contremarches dépendent du champ.
// La NEIGE DE GRÈVE (`__beach.snow`) aussi : elle change le ton et la tuile d'hiver
// des cellules de grève (beachTone, isoWinterTile) — absente du suffixe, la bascule
// laissait le sable gelé dans les tuiles cuites (audit du 2026-10-05, BUG-100).
export function groundKeySuffix(L) {
  return ':' + ((L.counts && L.counts.eraBand) | 0)
    + ':s' + (CM.season | 0)
    + ':bch' + (BEACH.on ? BEACH.mat + BEACH.islandW + '_' + BEACH.depth + '_' + BEACH.ramp + (BEACH.snow ? '_n' : '') : 'off')
    + ':qg' + ((CM.quayGate && CM.quayGate.key) || '-')
    + terrainKey()
    + (CM.previewWonder ? ':pv' + CM.previewWonder.id : '');
}

// L'EMPREINTE DE CONTENU DU PLAN — la porte de fraîcheur des tuiles du sol
// (solPyramideFrame, fresh) : même empreinte, aucune tuile n'est re-jugée.
// ⚠ Jusqu'à l'audit du 2026-10-05 (BUG-60), elle ne comptait que des TAILLES
// d'ensembles. Un achat qui pose un bâtiment sans route nouvelle — chaque premier
// achat d'un début de partie — gardait les mêmes tailles : les tuiles où il
// apparaissait restaient fraîches, sans allée de seuil ni cour, jusqu'au recompute
// suivant qui changeait une taille (mesuré à l'ère 4 : +1 « scribes », 53 → 54
// emprises, signature identique, 5 tuiles périmées servies).
// C'est maintenant une empreinte du CONTENU — tout ce que tileSig lit du plan :
// emprises (position, taille, type, bâtiment, rang de révélation), routes (clé,
// masque, rang, matière, surface), urbain, pelouses de ville, parvis, fleuve
// (cellules, tracé, îles) et foyer du camp. ⚠ Un champ du plan que tileSig lit et
// qui manque ici, aucune tuile ne verra son changement. Indépendante de l'ordre
// d'insertion (somme et xor des hachages par élément) : deux plans de même contenu
// bâtis dans un autre ordre gardent leurs tuiles. O(cellules), une fois par plan.
let gzcSigL = null, gzcSig = '';
export function groundContentSig(L) {
  if (L === gzcSigL) return gzcSig;
  gzcSigL = L;
  let h = 0, sa = 0, sx = 0;
  const begin = (tag) => { h = Math.imul(2166136261 ^ tag, 16777619) >>> 0; };
  const mix = (v) => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; };
  const mixStr = (s) => { if (s) for (let i = 0; i < s.length; i += 1) mix(s.charCodeAt(i)); };
  const end = () => {
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
    sa = (sa + h) >>> 0; sx = (sx ^ Math.imul(h, 0x297a2d39)) >>> 0;
  };
  const keys = (tag, set) => { if (set) for (const k of set) { begin(tag); mixStr(k); end(); } };
  const q = (v) => Math.round((v || 0) * 64);
  for (const t of (L.tiles || [])) {
    begin(1); mix(t.gx); mix(t.gy); mix(t.spanX || t.size || 1); mix(t.spanY || t.size || 1);
    mixStr(t.type); mixStr(t.buildingId); mix(t.revealIdx || 0); end();
  }
  keys(2, L.roadSet);
  if (L.roadMap) for (const [k, c] of L.roadMap) {
    begin(3); mixStr(k);
    if (c) { mix(c.mask); mixStr(c.rank); mix(c.pave == null ? -1 : c.pave); mixStr(c.roadSurface); }
    end();
  }
  keys(4, L.urbanSet);
  keys(5, L.townGreen);
  keys(6, WONDER_GROUND.on ? wonderGroundSet(L) : L.wonderGround);
  const R = L.river && L.river.present ? L.river : null;
  if (R) {
    keys(7, R.cells);
    (R.samples || []).forEach((s, i) => { begin(8); mix(i); mix(q(s.x)); mix(q(s.y)); mix(q(s.hw)); end(); });
    for (const il of (R.islands || [])) {
      begin(9); mix(q(il.x)); mix(q(il.y)); mix(q(il.rx)); mix(q(il.ry)); mix(q(il.tx)); mix(q(il.ty)); end();
    }
  }
  if (L.campHearth) { begin(10); mix(L.campHearth.gx); mix(L.campHearth.gy); end(); }
  gzcSig = (L.gridN | 0) + '.' + (L.mapSeed | 0) + '.' + sa.toString(36) + '.' + sx.toString(36);
  return gzcSig;
}
