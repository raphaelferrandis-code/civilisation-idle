// LES ROUTES DU BAKE — rubans, épaulement, trottoirs, gorge, seuils d'allée.
//
// Sortie de `drawIsoGround` le 2026-08-23 (Q10), et c'est la DERNIÈRE passe du bake
// à en sortir. Elle peint la voirie par-dessus le fond déjà posé : le pavé central et
// ses bras, fusionnés en COULOIRS pour ne pas rastériser cinq quads par cellule ;
// l'épaulement qui mélange sol et chaussée ; la MARCHE du trottoir ; la gorge de
// contact qui assoit la rue dans le sol ; et le seuil d'allée qui rentre sous la façade.
//
// ⚠ LA COUCHE DE MARCHE EST PARTIE AVEC ELLE, et ce n'était pas un choix esthétique.
// `walkLayerBegin` / `walkLayerEnd` encadrent un canevas à la résolution du PIXEL
// D'ART, ouvert au milieu de cette passe et refermé à sa fin : ce n'est pas une donnée
// qu'on se passe, c'est une RESSOURCE À DURÉE DE VIE. La cartographie l'avait posé
// comme condition (cf. docs/CARTO-drawIsoGround.md §2) — deux modules se la
// repassant en paramètre auraient été fragiles. Cette passe en est le seul
// consommateur : elle l'emmène, et la question ne se pose plus.
//
// ⚠ CONTEXTE DESTRUCTURÉ EN TÊTE, même technique que le balayage de cellules : les
// quatorze lectures vers l'englobante redeviennent des locales À LEUR NOM, si bien
// que les 477 lignes sont reprises SANS UNE LIGNE DE CHANGÉE. Aucune n'est réassignée
// dans le corps — vérifié avant la coupe, c'est ce qui autorise des `const`.
import { CM, cmHash, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from '../layout.js';
import { worldToScreen, ISO_X, ISO_Y } from './projection.js';
import { COUR, builtNear } from './isoTissu.js';
import { ROAD_DETAIL, SIDEWALK_ISO, isoRoadHalfW, roadVeilFor } from './isoRoad.js';
import { blitIsoTileKey, ensureIsoTileKey } from './isoGroundTiles.js';
import { drawRoadEdgeFringe, isoBuildingFront, roadFringeK, roadMatFor, smoothNoise } from './isoGroundDetail.js';
import { fillWorldQuad, pathWorldQuad } from './isoQuad.js';
import { rgb } from './isoPalette.js';

// ── LE TROTTOIR EST PEINT EN PIXELS, JAMAIS AU VECTEUR ──────────────────────
// (Raph 2026-08-05 : « je ne veux plus de tracé au vecteur ».)
//
// LE PROBLÈME, dans les termes exacts où il se pose. Le sol est fait de TUILES
// blittées à `k = T·z/32` : un pixel d'art y occupe z pixels de canvas. Les
// couches du trottoir, elles, étaient des `fill()` de quads projetés — donc
// rastérisées à la résolution du CANVAS, avec un bord antialiasé d'UN pixel. À
// zoom 3, la bande était bordée d'un trait trois fois plus fin que le plus petit
// détail de l'art qui l'entoure. C'est ça, « lisse et pas pixel » : pas une
// affaire de couleur, une affaire de RÉSOLUTION.
//
// LA PARADE. On peint toute la passe trottoir dans un calque à l'échelle de
// l'ART (zoom 1 : une cellule y fait 64×32 px, la taille native d'une tuile),
// puis on agrandit ce calque ×z en NEAREST. Chaque pixel tracé devient un bloc
// de z pixels, exactement comme un pixel de tuile — bords en marches, aucun
// demi-ton. Bénéfice second : la matière du trottoir y est blittée à 1:1 exact
// (k = 64/64), donc sans rééchantillonnage du tout.
//
// L'ALIGNEMENT EST EXACT, et c'est ce qui rend la manœuvre sûre : dans le calque
// `sx = (u − u_cam) + wArt/2`, et on le repose en `ox + sx·z` avec
// `ox = cw/2 − wArt·z/2`, ce qui redonne `(u − u_cam)·z + cw/2` — la projection
// du bake, au bit près. Aucun décalage à compenser, aucune dérive au défilement.
//
// COÛT MESURÉ, en alternant pixel/vecteur d'une recuisson à l'autre (le seul
// A/B honnête ici, cf. les pièges de mesure du projet), bake de 346 cellules à
// zoom 3,24 : passe trottoir **0,7 ms en pixels contre 0,4 ms au vecteur**, sur
// ~10 ms de bake total — et le bake ne tourne qu'à la recuisson, pas par frame.
// Le calque fait cw/z × ch/z, soit ~1/z² de surface à rastériser : ce qu'on perd
// à composer, on le regagne à peindre.
let _walkLayer = null;
function walkLayerBegin(z) {
  const wArt = Math.ceil(CM.cw / z) + 2, hArt = Math.ceil(CM.ch / z) + 2;
  if (!_walkLayer || _walkLayer.w !== wArt || _walkLayer.h !== hArt) {
    const c = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(wArt, hArt) : document.createElement('canvas');
    c.width = wArt; c.height = hArt;
    const cx = c.getContext('2d');
    if (!cx) return null;
    _walkLayer = { c, ctx: cx, w: wArt, h: hArt };
  }
  const lay = _walkLayer;
  lay.ctx.setTransform(1, 0, 0, 1, 0, 0);
  lay.ctx.clearRect(0, 0, lay.w, lay.h);
  // Bascule du repère de projection : worldToScreen lit CM.cam.zoom et CM.cw/ch.
  lay.saved = { zoom: CM.cam.zoom, cw: CM.cw, ch: CM.ch };
  CM.cam.zoom = 1; CM.cw = lay.w; CM.ch = lay.h;
  return lay;
}
function walkLayerEnd(lay, ctx, z) {
  const s = lay.saved;
  CM.cam.zoom = s.zoom; CM.cw = s.cw; CM.ch = s.ch;
  const ox = s.cw / 2 - (lay.w * z) / 2, oy = s.ch / 2 - (lay.h * z) / 2;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lay.c, 0, 0, lay.w, lay.h, ox, oy, lay.w * z, lay.h * z);
  ctx.imageSmoothingEnabled = prev;
}

export function drawIsoGroundRoads(bake, resolve, roads) {
  const { ctx, T, z, hw, LOD, HARD, L, band, road, roadMap, urb, PR, ISO_GROUND_SLICE } = bake;
  const { kindAt } = resolve;
  // Rubans de chaussée par-dessus le fond : pavé central + un bras vers chaque
  // connexion (rectangles MONDE projetés → parallélogrammes écran continus).
  const tRd = PR && performance.now();
  const rmat = roadMatFor(band);
  const rVeil = roadVeilFor(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band);   // voile de lecture (forçage d'aperçu honoré)
  // Constantes de la passe route : teinte d'ÉPAULEMENT (mélange sol↔route un peu
  // assombri — la rue s'assoit dans le sol au lieu d'avoir l'air tamponnée),
  // tons de la FRANGE de chaussée (morsures = épaulement en 2 valeurs,
  // gravillons = matière de la route) et intensité par ère (forçage d'aperçu honoré).
  const shm = ROAD_DETAIL.shoulderMix, shv = ROAD_DETAIL.shoulderV;
  const shTone = [0, 1, 2].map((i) => Math.round((urb[i] * (1 - shm) + road[i] * shm) * shv));
  const shCol = `rgb(${shTone[0]},${shTone[1]},${shTone[2]})`;
  const shCol2 = `rgb(${Math.round(shTone[0] * 0.9)},${Math.round(shTone[1] * 0.9)},${Math.round(shTone[2] * 0.9)})`;
  const spillCol = rgb(road, 1);
  const rfK = ROAD_DETAIL.on ? ROAD_DETAIL.edgeFringe * roadFringeK(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band) : 0;
  const puR = Math.max(1, Math.round(hw * 0.055));
  const cbR = T * 0.05;
  // COULOIRS FUSIONNÉS : même union que les 5 quads par cellule (pavé + bras
  // selon le masque) mais en bandes MAXIMALES par ligne/colonne — beaucoup moins
  // de sous-chemins, et chaque passe-union (ourlet, épaulement, joint, trottoir,
  // bordure, gorge) rasterise d'autant plus vite (le par-cellule re-projetait
  // ~5 quads × cellule × passe et dominait la recuisson du sol des mégapoles).
  // Un couloir s'étend tant que les cellules sont contiguës ET mutuellement
  // connectées (E↔W / S↔N) ; chaque bout s'arrête au bord de cellule si le bras
  // existe (masque), au bord du pavé sinon — la géométrie des quads à
  // l'identique, donc les couches en alpha ne marquent toujours aucune couture.
  // Les couloirs verticaux de longueur 1 sans bras N/S sont sautés : leur pavé
  // est déjà couvert par le couloir horizontal de la cellule.
  // `md` = masque de TRACÉ, posé plus bas quand une rue à trottoir refuse de
  // tendre un bras à une venelle (cf. « le trottoir passe devant l'entrée des
  // venelles »). Null partout ailleurs → le masque logique de la cellule.
  const maskOf = (r2) => (r2.md != null ? r2.md : (r2.cell ? (r2.cell.mask | 0) : 0));
  // Demi-largeur de chaussée de la cellule (hiérarchie par rang). Un couloir se
  // BRISE au changement de largeur : chaque run est homogène et porte sa `w` —
  // le sentier reste étroit jusqu'au seuil où la voie s'élargit (marche nette,
  // comme une route qui change de gabarit).
  const wOf = (r2) => isoRoadHalfW(r2.cell && r2.cell.rank);
  const buildRoadRuns = (list) => {
    const rows = new Map(), cols = new Map();
    for (const r2 of list) {
      const a = rows.get(r2.gy); if (a) a.push(r2); else rows.set(r2.gy, [r2]);
      const c = cols.get(r2.gx); if (c) c.push(r2); else cols.set(r2.gx, [r2]);
    }
    const h = [], v = [];
    for (const [gy, a] of rows) {
      a.sort((p2, q2) => p2.gx - q2.gx);
      for (let i = 0; i < a.length;) {
        let j = i;
        while (j + 1 < a.length && a[j + 1].gx === a[j].gx + 1
          && (maskOf(a[j]) & ROAD_E) && (maskOf(a[j + 1]) & ROAD_W)
          && wOf(a[j + 1]) === wOf(a[j])) j += 1;
        h.push({ gy, g0: a[i].gx, g1: a[j].gx, s0: !!(maskOf(a[i]) & ROAD_W), s1: !!(maskOf(a[j]) & ROAD_E), w: wOf(a[i]) });
        i = j + 1;
      }
    }
    for (const [gx, c] of cols) {
      c.sort((p2, q2) => p2.gy - q2.gy);
      for (let i = 0; i < c.length;) {
        let j = i;
        while (j + 1 < c.length && c[j + 1].gy === c[j].gy + 1
          && (maskOf(c[j]) & ROAD_S) && (maskOf(c[j + 1]) & ROAD_N)
          && wOf(c[j + 1]) === wOf(c[j])) j += 1;
        const n = !!(maskOf(c[i]) & ROAD_N), s = !!(maskOf(c[j]) & ROAD_S);
        if (j > i || n || s) v.push({ gx, g0: c[i].gy, g1: c[j].gy, s0: n, s1: s, w: wOf(c[i]) });
        i = j + 1;
      }
    }
    return { h, v };
  };
  // Trace les couloirs en sous-chemins du chemin courant. `extra` = sur-largeur
  // de la passe (épaulement, trottoir, gorge…) AJOUTÉE à la demi-chaussée du run.
  // `c` : contexte de destination — la passe TROTTOIR peint dans un calque à la
  // résolution de l'art, pas dans le bake (cf. § LE TROTTOIR EST PEINT EN PIXELS).
  const addRunQuads = (runs, extra, c = ctx) => {
    for (const s of runs.h) {
      const W = T * s.w + extra;
      const cy2 = (s.gy + 0.5) * T;
      pathWorldQuad(c, s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W, cy2 - W,
        s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W, cy2 + W);
    }
    for (const s of runs.v) {
      const W = T * s.w + extra;
      const cx2 = (s.gx + 0.5) * T;
      pathWorldQuad(c, cx2 - W, s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W,
        cx2 + W, s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W);
    }
  };
  // ROUTE EN CREUX (jonction route↔sol) : couches concentriques autour de la
  // dalle, chacune en passe-union. Deux habillages selon le tronçon :
  //   - CAMPAGNE / premières ères (shRoads) : OURLET en fondu → ÉPAULEMENT plein
  //     (le liseré validé) — la terre se dissout dans le sol.
  //   - VILLE dès l'ère bourg (swRoads, band ≥ SIDEWALK_ISO.minBand et cellule
  //     urbaine) : VRAI TROTTOIR construit — joint sombre au raccord du sol →
  //     bande de dalles claires → joints transversaux → BORDURE claire.
  // Dans les deux cas la GORGE sombre au contact de la dalle vient en dernier
  // (route en creux / caniveau). La dalle garde son bord NET (crantage v4
  // rejeté : une route se lit par son bord net). Tout est continu, rien par cellule.
  const bandRoads = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
  const swOn = SIDEWALK_ISO.on && bandRoads >= SIDEWALK_ISO.minBand;
  const swRoads = [], shRoads = [];
  for (const r2 of roads) {
    // Les SENTIERS (rang path) n'ont JAMAIS de trottoir construit : une venelle
    // se lit rustique (ourlet + épaulement), même en plein cœur urbain — le
    // trottoir commence à la vraie rue (Raph 2026-07-28).
    const isPathRank = !!(r2.cell && r2.cell.rank === 'path');
    // …et le trottoir s'arrête où la ville s'arrête. Le test portait sur
    // `urbanSet`, un RAYON dérivé des compteurs : une rue traversant des
    // hectares que la ville n'a jamais bâtis y gagnait quand même ses dalles de
    // centre-ville. On demande maintenant au sol : si la cellule est peinte en
    // cour ou en friche (cf. COUR), la rue reprend son ourlet de campagne.
    const inCity = COUR.on && COUR.sidewalk
      ? kindAt(r2.gx, r2.gy) === 'urban'
      : !!(L.urbanSet && L.urbanSet.has(r2.gx + ',' + r2.gy));
    r2.md = null;                        // masque de TRACÉ (cf. juste après)
    // …et il faut QUELQU'UN à desservir. Raph 2026-08-05 : « on peut pas juste
    // faire en sorte que des rues ne soient pas au milieu de nulle part ? ».
    // Mesuré : 11 à 12 % des cellules-route n'ont AUCUN bâtiment sur leurs huit
    // voisines — des voies qui traversent des terrains jamais bâtis. Elles ne
    // peuvent pas être SUPPRIMÉES : elles portent la connexité (un émondage aux
    // points d'articulation n'en a libéré que 7 sur 1901, mesuré). Mais rien ne
    // les oblige à RESSEMBLER à des rues : sans façade, pas de trottoir — donc
    // pas de marche, pas de bordure, pas de mobilier. Elles reprennent l'ourlet
    // de campagne et redeviennent ce qu'elles sont : des voies de passage.
    // ⚠ Le test porte sur les 8 voisines, diagonales comprises : une maison en
    // biais d'un carrefour le borde tout autant, et s'en tenir aux 4 orthogonales
    // dénuderait les cellules d'angle en plein quartier bâti.
    if (swOn && !isPathRank && inCity && builtNear(L, r2.gx, r2.gy)) swRoads.push(r2);
    else shRoads.push(r2);
  }
  // ── LE TROTTOIR PASSE DEVANT L'ENTRÉE DES VENELLES ──────────────────────────
  // Une venelle (rang `path`) n'a pas de trottoir. Là où elle débouchait sur une
  // rue qui en a un, la rue tendait son BRAS de chaussée jusqu'au bord de
  // cellule : le bras traversait la bande claire et la coupait NET. C'est la
  // cause dominante des « bouts de trottoir orphelins » qui s'arrêtent au milieu
  // du pavé — mesuré sur une ville band 3 de 1408 cellules-route : 88 débouchés
  // de venelle contre 11 sorties de ville, soit 16 % des 538 rues à trottoir.
  //
  // En ville, un trottoir ne s'interrompt pas pour une ruelle : il PASSE DEVANT,
  // et c'est la ruelle qui vient buter dessus. On retire donc ce bras du seul
  // TRACÉ (masque `md`) : la connexité LOGIQUE du réseau ne bouge pas d'un iota
  // — `cell.mask` reste intact, les agents continuent d'emprunter la venelle, et
  // la venelle garde son propre bras jusqu'à son bord de cellule, qui vient
  // toucher le bord extérieur du trottoir.
  //
  // GARDE : on ne retire jamais le DERNIER bras (`md` doit rester non nul), sans
  // quoi une rue qui ne dessert que des venelles deviendrait une plaque de
  // trottoir carrée posée dans le pavé, sans chaussée.
  // Molette : __sidewalkIso({ alleyThrough: false }) rejoue l'ancien tracé.
  if (SIDEWALK_ISO.alleyThrough !== false) {
    const isAlley = (x, y) => { const c = roadMap && roadMap.get(x + ',' + y); return !!(c && c.rank === 'path'); };
    for (const r2 of swRoads) {
      const m0 = r2.cell ? (r2.cell.mask | 0) : 0;
      let md = m0;
      if ((md & ROAD_E) && isAlley(r2.gx + 1, r2.gy)) md &= ~ROAD_E;
      if ((md & ROAD_W) && isAlley(r2.gx - 1, r2.gy)) md &= ~ROAD_W;
      if ((md & ROAD_S) && isAlley(r2.gx, r2.gy + 1)) md &= ~ROAD_S;
      if ((md & ROAD_N) && isAlley(r2.gx, r2.gy - 1)) md &= ~ROAD_N;
      r2.md = md !== 0 ? md : m0;
    }
  }
  // Couloirs construits UNE fois par liste, rejoués à chaque passe (les largeurs
  // varient, la topologie non). Union sh ∪ sw = union `roads` : un tronçon qui
  // change de liste au bord urbain aboute ses bras au bord de cellule partagé.
  const shRuns = buildRoadRuns(shRoads), swRuns = buildRoadRuns(swRoads);
  // ── TOUTE LA VOIRIE EST PEINTE EN PIXELS, PLUS UN TRAIT AU VECTEUR ─────────
  // (Raph 2026-08-05, après le trottoir : « oui je veux bien » pour le reste.)
  // Ourlet, épaulement, trottoir, caniveau, rubans de chaussée, frange et allées
  // de seuil passent dans le CALQUE à l'échelle de l'art (cf. § LE TROTTOIR EST
  // PEINT EN PIXELS). Ce sont les mêmes tracés, à la même géométrie : seule la
  // résolution de rastérisation change — et avec elle le bord, qui cesse d'être
  // trois fois plus fin que le pixel de l'art voisin.
  // ⚠ LE CULL DE TRANCHE SE FAIT AVANT LA BASCULE. `ISO_GROUND_SLICE` borne des
  // px écran DU BAKE ; sous le calque, worldToScreen répond dans un autre repère
  // et le test deviendrait faux en silence (cellules peintes hors tranche, ou
  // tranche vide). On fige donc ici la liste des cellules à peindre.
  const roadsVis = [];
  for (const r of roads) {
    if (ISO_GROUND_SLICE.on) {
      const pr = worldToScreen(r.gx * T, r.gy * T);
      if (ISO_GROUND_SLICE.yOn && (pr.y < ISO_GROUND_SLICE.y0 - ISO_GROUND_SLICE.padTop
        || pr.y > ISO_GROUND_SLICE.y1 + ISO_GROUND_SLICE.padBot)) continue;
      if (ISO_GROUND_SLICE.xOn && (pr.x < ISO_GROUND_SLICE.x0 - ISO_GROUND_SLICE.padX
        || pr.x > ISO_GROUND_SLICE.x1 + ISO_GROUND_SLICE.padX)) continue;
    }
    roadsVis.push(r);
  }
  const lay = (ROAD_DETAIL.pixel !== false && roads.length) ? walkLayerBegin(z) : null;
  const sctx = lay ? lay.ctx : ctx;
  const shw = lay ? T * ISO_X : hw;   // demi-largeur du losange DANS le repère de dessin
  const tU1 = PR && performance.now();
  if (shRoads.length) {
    if (ROAD_DETAIL.feather > 0 && ROAD_DETAIL.featherA > 0) {
      sctx.beginPath();
      addRunQuads(shRuns, cbR + T * ROAD_DETAIL.feather, sctx);
      sctx.globalAlpha = ROAD_DETAIL.featherA;
      sctx.fillStyle = shCol;
      sctx.fill();
      sctx.globalAlpha = 1;
    }
    sctx.beginPath();
    addRunQuads(shRuns, cbR, sctx);
    sctx.fillStyle = shCol;
    sctx.fill();
  }
  if (PR) PR.roadsShoulder = performance.now() - tU1;
  const tU2 = PR && performance.now();
  if (swRoads.length) {
    // ── LA MARCHE, ET RIEN QUE LA MARCHE ─────────────────────────────────────
    // Raph 2026-08-05, et c'est la remise à plat qui manquait : « techniquement
    // il n'y a pas de sol mais trottoir et maison, donc pas de sens que le
    // trottoir ait une apparence différente du sol. Il faut effectivement la
    // marche mais après bam, du sol ».
    //
    // Autrement dit : LE SOL DE VILLE *EST* LE TROTTOIR. Ce qui borde une rue
    // n'est pas une bande rapportée, c'est le sol de la ville qui court jusqu'au
    // caniveau — et la seule chose qui les sépare est la MARCHE. Tout ce que la
    // bande portait est donc parti : son aplat, sa matière dédiée (walk-*), son
    // appareillage, son joint de rive. Ce qui reste tient en deux traits d'un
    // pixel d'art, CÔTÉ RUE uniquement :
    //   • NEZ DE BORDURE — arête claire à la limite caniveau ↔ sol, le dessus
    //     de la marche qui prend la lumière ;
    //   • OMBRE PORTÉE — un pixel sombre juste sous ce nez, du seul côté qui
    //     fait face à la caméra : c'est elle qui creuse. Sans elle, l'arête
    //     claire flotte.
    // Côté sol, plus rien : pas de liseré, pas de bord. Bam, du sol.
    //
    // ⚠ La géométrie de rue (SIDEWALK_ISO.w) RESTE : elle ne peint plus rien,
    // mais elle publie toujours aux agents où marchent les piétons et où se
    // pose le mobilier — le long de la rue, sur le sol.
    // Réglage : __sidewalkIso({ stepA, stepLight, stepShade }) ; stepA 0 = plat.
    //
    // TRAIT D'UN PIXEL D'ART, EN ESCALIER 2:1 — la pente exacte de la projection
    // d'un axe monde. Tracé en quad, un trait d'un pixel de large ressort PÂLE :
    // l'antialiasing étale son alpha sur deux pixels et il n'en reste rien. Ici,
    // des `fillRect` entiers, donc un alpha exact et la granularité de l'art.
    // `dy` décale vers le bas (une ombre se pose SOUS l'arête qu'elle creuse) ;
    // le dédoublonnage évite qu'une marche repeinte double son alpha.
    // ⚠⚠ LA MARCHE S'INTERROMPT AUX CROISEMENTS (Raph 2026-08-05 : « attention,
    // ça crée des rues FERMÉES au milieu du sol »). Un bord de run est tracé sur
    // toute sa longueur — donc il passait AU-DESSUS des chaussées
    // perpendiculaires. Les marches se rejoignaient d'un run à l'autre et
    // refermaient un quadrillage continu sur le sol : des cadres, au lieu de
    // rues. Au droit d'une chaussée, le trottoir cède le passage — c'est le
    // passage piéton — et la marche reprend de l'autre côté.
    const roadByKey = new Map();
    for (const r2 of roads) roadByKey.set(r2.gx + ',' + r2.gy, r2);
    const onRoadway = (wx, wy) => {
      const gx = Math.floor(wx / T), gy = Math.floor(wy / T);
      const r2 = roadByKey.get(gx + ',' + gy);
      if (!r2) return false;
      const wb = T * wOf(r2) + T * ROAD_DETAIL.groove;   // chaussée + son caniveau
      const dx = wx - (gx + 0.5) * T, dy2 = wy - (gy + 0.5) * T;
      const ax2 = Math.abs(dx), ay2 = Math.abs(dy2);
      if (ax2 <= wb && ay2 <= wb) return true;           // pavé central
      const m = maskOf(r2);                              // bras RÉELLEMENT tracés
      if (ay2 <= wb && dx > wb && (m & ROAD_E)) return true;
      if (ay2 <= wb && dx < -wb && (m & ROAD_W)) return true;
      if (ax2 <= wb && dy2 > wb && (m & ROAD_S)) return true;
      if (ax2 <= wb && dy2 < -wb && (m & ROAD_N)) return true;
      return false;
    };
    let lastPx = -1e9, lastPy = -1e9;
    const pixelLine = (ax, ay, bx, by, dy = 0) => {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const wx = ax + (bx - ax) * t, wy = ay + (by - ay) * t;
        if (onRoadway(wx, wy)) { lastPx = -1e9; lastPy = -1e9; continue; }
        const p = worldToScreen(wx, wy);
        const px = Math.round(p.x) - 1, py = Math.round(p.y) + dy;
        if (px === lastPx && py === lastPy) continue;
        sctx.fillRect(px, py, 2, 1);
        lastPx = px; lastPy = py;
      }
      lastPx = -1e9; lastPy = -1e9;
    };
    // Les deux bords d'un run, en coordonnées monde — `off` = distance à l'axe,
    // en fraction de tuile ; `side` +1 = le bord qui fait face à la caméra.
    const runEdges = (runs, off, draw) => {
      for (const s of runs.h) {
        const W = T * s.w + T * off;
        const cy2 = (s.gy + 0.5) * T;
        const x0 = s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W;
        const x1 = s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W;
        draw(x0, cy2 - W, x1, cy2 - W, -1);
        draw(x0, cy2 + W, x1, cy2 + W, 1);
      }
      for (const s of runs.v) {
        const W = T * s.w + T * off;
        const cx2 = (s.gx + 0.5) * T;
        const y0 = s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W;
        const y1 = s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W;
        draw(cx2 - W, y0, cx2 - W, y1, -1);
        draw(cx2 + W, y0, cx2 + W, y1, 1);
      }
    };
    if (ROAD_DETAIL.groove > 0 && ROAD_DETAIL.grooveA > 0) {
      sctx.beginPath();
      addRunQuads(swRuns, T * ROAD_DETAIL.groove, sctx);
      sctx.fillStyle = `rgba(40,30,18,${ROAD_DETAIL.grooveA})`;
      sctx.fill();
    }
    // ⚠⚠ LA MARCHE N'A QU'UNE FACE, ET LA PERSPECTIVE DIT LAQUELLE (Raph
    // 2026-08-05 : « on doit respecter la perspective »). La v1 posait le même
    // trait sur les DEUX bords d'une chaussée — nez clair et ombre de part et
    // d'autre — ce qui est géométriquement impossible : la bordure « montait »
    // des deux côtés à la fois.
    //
    // En 3/4, on voit les faces tournées vers +x et +y (celles qui regardent le
    // bas de l'écran). Pour une rue est-ouest, le trottoir NORD présente à la
    // chaussée une face orientée +y : elle est VUE, il faut en dessiner la
    // tranche. Le trottoir SUD, lui, est entre la caméra et la rue ; sa face
    // regarde −y, donc elle est CACHÉE — il n'y a rien à y peindre. Idem sur
    // l'autre axe : trottoir OUEST vu, trottoir EST caché. C'est toujours le
    // bord `side < 0` de `runEdges`.
    //
    // La tranche descend DANS la chaussée (vers le bas de l'écran) : le sol
    // reste à plat, c'est elle seule qui raconte le dénivelé.
    if (!LOD && SIDEWALK_ISO.stepA > 0) {
      const inner = ROAD_DETAIL.groove + SIDEWALK_ISO.curb;   // arête haute de la marche
      const hStep = Math.max(1, SIDEWALK_ISO.stepH | 0);
      sctx.fillStyle = `rgba(${SIDEWALK_ISO.stepShade.join(',')},${SIDEWALK_ISO.stepA})`;
      runEdges(swRuns, inner, (ax, ay, bx, by, side) => {
        if (side >= 0) return;                       // face cachée : on ne peint rien
        for (let d = 1; d <= hStep; d += 1) pixelLine(ax, ay, bx, by, d);
      });
      sctx.fillStyle = `rgba(${SIDEWALK_ISO.stepLight.join(',')},${SIDEWALK_ISO.stepA})`;
      runEdges(swRuns, inner, (ax, ay, bx, by, side) => {
        if (side < 0) pixelLine(ax, ay, bx, by);     // nez éclairé, au sommet de la tranche
      });
    }
  }
  if (PR) PR.roadsSidewalk = performance.now() - tU2;
  const tU3 = PR && performance.now();
  if (shRoads.length && ROAD_DETAIL.groove > 0 && ROAD_DETAIL.grooveA > 0) {
    sctx.beginPath();
    addRunQuads(shRuns, T * ROAD_DETAIL.groove, sctx);
    sctx.fillStyle = `rgba(40,30,18,${ROAD_DETAIL.grooveA})`;
    sctx.fill();
  }
  if (PR) PR.roadsGroove = performance.now() - tU3;
  for (const r of roadsVis) {
    const cx = (r.gx + 0.5) * T, cy = (r.gy + 0.5) * T;
    const wb = T * wOf(r);          // demi-chaussée de LA cellule (hiérarchie par rang)
    const mask = maskOf(r);         // masque de TRACÉ (bras vers venelle retiré)
    // Ton de dalle en variation LISSÉE le long du tracé (le hash par cellule
    // rayait le ruban de bandes — même règle que les sols : rien par cellule).
    const v = 0.97 + smoothNoise(r.gx, r.gy, 4, 'rb') * 0.06;
    // Ruban de chaussée = pavé central + un bras vers chaque connexion (tracé CHEMIN).
    sctx.beginPath();
    pathWorldQuad(sctx, cx - wb, cy - wb, cx + wb, cy + wb);                       // pavé central
    if (mask & ROAD_E) pathWorldQuad(sctx, cx + wb, cy - wb, (r.gx + 1) * T, cy + wb);
    if (mask & ROAD_W) pathWorldQuad(sctx, r.gx * T, cy - wb, cx - wb, cy + wb);
    if (mask & ROAD_S) pathWorldQuad(sctx, cx - wb, cy + wb, cx + wb, (r.gy + 1) * T);
    if (mask & ROAD_N) pathWorldQuad(sctx, cx - wb, r.gy * T, cx + wb, cy - wb);
    const rTile = (ROAD_DETAIL.on && ROAD_DETAIL.tiles && rmat.tile && !HARD) ? ensureIsoTileKey(rmat.tile) : null;
    if (rTile && rTile.ready) {
      sctx.save(); sctx.clip();
      const rp = worldToScreen(r.gx * T, r.gy * T);
      const rH = cmHash('rr:' + r.gx + ',' + r.gy);
      const rmir = ((rH >>> 3) & 1) === 1;
      blitIsoTileKey(sctx, rmat.tile, rp.x, rp.y, shw, rmir, rH, rVeil);
      sctx.restore();
    } else {
      // DALLE LISSE : surface PLEINE de chaussée, teinte par ère (roadTone, qui
      // porte DÉJÀ le voile de lecture). Lisse et propre (pas de texture qui
      // transparaît) — la « dalle lisse » demandée par Raph.
      sctx.fillStyle = rgb(road, v);
      sctx.fill();
    }
    // MARQUAGE : UNIQUEMENT le pointillé BLANC d'axe, au milieu des segments droits
    // (Raph : « tirets blancs juste au milieu, pas besoin sur les côtés »').
    // …et plus « toutes ères » : le marquage routier n'existe qu'à partir de
    // l'asphalte (band ≥ 6) — des tirets d'autoroute sur un sentier de terre
    // étaient précisément « cette route à toutes les ères » (Raph 2026-07-28).
    const markBand = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
    const throughH = !!((mask & ROAD_E) && (mask & ROAD_W)), throughV = !!((mask & ROAD_S) && (mask & ROAD_N));
    if (markBand >= 6 && throughH !== throughV) {   // segment droit à un seul axe
      sctx.fillStyle = 'rgba(246,245,240,0.9)';
      const dl = T / 5, dg = T / 7, dw2 = T * 0.03;   // tiret, trou, demi-largeur
      for (let o = dg / 2; o + dl <= T; o += dl + dg) {
        if (throughH) fillWorldQuad(sctx, r.gx * T + o, cy - dw2, r.gx * T + o + dl, cy + dw2);
        else fillWorldQuad(sctx, cx - dw2, r.gy * T + o, cx + dw2, r.gy * T + o + dl);
      }
    }
    // FRANGE DE CHAUSSÉE : crante chaque bord EXPOSÉ du ruban (flancs des bras +
    // caps du pavé sans connexion — les impasses s'effritent au bout). Un flanc
    // qui fait face à une voie JUMELLE non connectée (boulevard 2-cellules) est
    // SAUTÉ : le terre-plein porte cette couture. Arêtes en MONDE → projetées,
    // normale sortante (ox,oy) monde → écran via (±hw,±hh).
    if (rfK > 0 && !LOD) {
      const x0w = r.gx * T, y0w = r.gy * T, x1w = (r.gx + 1) * T, y1w = (r.gy + 1) * T;
      const roadN2 = L.roadSet.has(r.gx + ',' + (r.gy - 1)), roadS2 = L.roadSet.has(r.gx + ',' + (r.gy + 1));
      const roadE2 = L.roadSet.has((r.gx + 1) + ',' + r.gy), roadW2 = L.roadSet.has((r.gx - 1) + ',' + r.gy);
      const segs = [];
      if (mask & ROAD_E) {
        if (!roadN2 || (mask & ROAD_N)) segs.push([cx + wb, cy - wb, x1w, cy - wb, 0, -1, 'en']);
        if (!roadS2 || (mask & ROAD_S)) segs.push([cx + wb, cy + wb, x1w, cy + wb, 0, 1, 'es']);
      } else segs.push([cx + wb, cy - wb, cx + wb, cy + wb, 1, 0, 'ec']);
      if (mask & ROAD_W) {
        if (!roadN2 || (mask & ROAD_N)) segs.push([x0w, cy - wb, cx - wb, cy - wb, 0, -1, 'wn']);
        if (!roadS2 || (mask & ROAD_S)) segs.push([x0w, cy + wb, cx - wb, cy + wb, 0, 1, 'ws']);
      } else segs.push([cx - wb, cy - wb, cx - wb, cy + wb, -1, 0, 'wc']);
      if (mask & ROAD_S) {
        if (!roadE2 || (mask & ROAD_E)) segs.push([cx + wb, cy + wb, cx + wb, y1w, 1, 0, 'se']);
        if (!roadW2 || (mask & ROAD_W)) segs.push([cx - wb, cy + wb, cx - wb, y1w, -1, 0, 'sw']);
      } else segs.push([cx - wb, cy + wb, cx + wb, cy + wb, 0, 1, 'sc']);
      if (mask & ROAD_N) {
        if (!roadE2 || (mask & ROAD_E)) segs.push([cx + wb, y0w, cx + wb, cy - wb, 1, 0, 'ne']);
        if (!roadW2 || (mask & ROAD_W)) segs.push([cx - wb, y0w, cx - wb, cy - wb, -1, 0, 'nw']);
      } else segs.push([cx - wb, cy - wb, cx + wb, cy - wb, 0, -1, 'nc']);
      for (const s of segs) {
        const A = worldToScreen(s[0], s[1]), B = worldToScreen(s[2], s[3]);
        let nx2 = (s[4] - s[5]) * shw, ny2 = (s[4] + s[5]) * (shw * ISO_Y / ISO_X);
        const nl2 = Math.hypot(nx2, ny2) || 1;
        nx2 /= nl2; ny2 /= nl2;
        // `puR` est l'unité de pixel des effets : dans le calque, elle vaut déjà
        // le pixel d'art (hw = T), donc les gravillons sortent au bon calibre.
        drawRoadEdgeFringe(sctx, {
          ax: A.x, ay: A.y, bx: B.x, by: B.y, ox: nx2, oy: ny2,
          seed: 'rf:' + r.gx + ',' + r.gy + ':' + s[6],
        }, lay ? Math.max(1, Math.round(shw * 0.055)) : puR, shCol, shCol2, spillCol, rfK);
      }
    }
  }
  if (PR) PR.roads = performance.now() - tRd;
  // ── ALLÉES DE SEUIL : « un léger trait gris de la porte à la route » ────────
  // (Raph 2026-07-28). Chaque HABITATION (house/enginehome) adjacente au réseau
  // reçoit une fine bande de sa façade au bord de la chaussée voisine — priorité
  // aux faces écran (S puis E, puis O/N) : la porte des sprites regarde la
  // caméra. Couleur d'ÉPAULEMENT (déjà calée sol↔route par ère), légèrement
  // translucide → un seuil discret, pas une route. Le départ rentre SOUS la
  // façade (tuck, recouvert par le sprite) pour ne jamais flotter. Statique →
  // bake ; sautée en LOD (illisible au dézoom). Quads batchés par paquets
  // (même idiome que les joints de trottoir : bbox locale, pas de double-alpha).
  const tAl = PR && performance.now();
  if (ROAD_DETAIL.on && !LOD && L.tiles && roadMap) {
    const aw = T * 0.055;                     // demi-largeur du trait
    const tuck = T * 0.16;                    // rentré sous la façade
    sctx.globalAlpha = 0.8;
    sctx.fillStyle = shCol;
    sctx.beginPath();
    let alN = 0;
    const allee = (x0, y0, x1, y1) => {
      pathWorldQuad(sctx, x0, y0, x1, y1);
      alN += 1;
      if (alN >= 256) { sctx.fill(); sctx.beginPath(); alN = 0; }
    };
    for (const t2 of L.tiles) {
      const isEng = t2.type === 'engine';
      if (!isEng && t2.type !== 'house' && t2.type !== 'enginehome') continue;
      // Les CHAMPS n'ont pas de seuil : une parcelle se laboure, elle n'a pas
      // de porte (Raph 2026-07-28) — seuls moteurs exclus des allées.
      if (isEng && t2.buildingId === 'irrigated_fields') continue;
      // La façade est résolue par isoBuildingFront (partagée avec le poussé du
      // sprite, cf. FRONT) : le seuil et le bâtiment DOIVENT désigner le même
      // côté, sinon le trait sortirait d'un mur aveugle.
      const f2 = isoBuildingFront(t2, roadMap);
      if (f2) {
        const { dx, dy, hx, hy, rank } = f2;
        const rx = hx + dx, ry = hy + dy;
        const rw = isoRoadHalfW(rank);
        if (dy === 1) allee((hx + 0.5) * T - aw, (hy + 1) * T - tuck, (hx + 0.5) * T + aw, (ry + 0.5 - rw) * T);
        else if (dy === -1) allee((hx + 0.5) * T - aw, (ry + 0.5 + rw) * T, (hx + 0.5) * T + aw, hy * T + tuck);
        else if (dx === 1) allee((hx + 1) * T - tuck, (hy + 0.5) * T - aw, (rx + 0.5 - rw) * T, (hy + 0.5) * T + aw);
        else allee((rx + 0.5 + rw) * T, (hy + 0.5) * T - aw, hx * T + tuck, (hy + 0.5) * T + aw);
      }
    }
    if (alN) sctx.fill();
    sctx.globalAlpha = 1;
  }
  // Le calque de voirie est reposé ICI, à la fin de tout ce qui la compose :
  // agrandi ×z en NEAREST, il rend des bords en marches de la même taille que
  // les pixels des tuiles voisines. Après lui viennent le terre-plein et le
  // reste, qui gardent leur tracé propre.
  if (lay) walkLayerEnd(lay, ctx, z);
  if (PR) PR.allees = performance.now() - tAl;
}
