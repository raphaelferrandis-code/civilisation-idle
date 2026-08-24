// LE BALAYAGE DES CELLULES — la boucle qui peint chaque losange du sol.
//
// Sortie de `drawIsoGround` le 2026-08-23 (Q10). C'est le cœur du bake : pour chaque
// cellule visible, résoudre sa MATIÈRE, poser son aplat, blitter sa tuile, et REMISER
// ce qui se peindra par fournées ensuite — voiles, touffes d'herbe, franges, parvis,
// rubans de chaussée. Elle ne décide d'aucun ordre : elle produit, l'orchestrateur
// dispose.
//
// ⚠⚠ TROIS OBJETS EN PARAMÈTRE, DESTRUCTURÉS À L'ENTRÉE — et c'est délibéré.
// Cette passe lisait VINGT-SEPT variables de son englobante : trop pour des
// paramètres séparés (la carte posait la ligne rouge à dix). Mais les passer en objets
// et écrire `bake.ctx` partout aurait deux coûts : réécrire 194 lignes, et payer un
// accès de propriété par cellule dans la boucle LA PLUS CHAUDE du bake (~33 ms sur 87).
// La destructuration en tête rend les locales À LEUR NOM : le corps est repris SANS
// UNE LIGNE DE CHANGÉE, et le code compilé retrouve ses variables locales.
//
// Les trois objets disent aussi ce que la passe fait :
//   · `bake`    — le contexte de cuisson : canevas, métrique, bornes, drapeaux, layout ;
//   · `resolve` — les questions qu'elle pose (de quoi cette cellule est-elle faite ?) ;
//   · `out`     — les tampons où elle REMISE ce qui se peindra en fournées.
//
// ⚠ AUCUN de ces 27 noms n'est RÉASSIGNÉ dans le corps (vérifié avant la coupe) —
// c'est ce qui autorise des `const` destructurées. Les tampons sont MUTÉS (on y
// pousse), ce qui est légal et voulu.
import { CM, cmHash } from '../layout.js';
import { worldToScreen } from './projection.js';
import { WINTER } from '../seasonMode.js';
import { PLAZA, PLAZA_ERA_TONE, rgb } from './isoPalette.js';
import { DIRT_TONE } from './isoTissu.js';
import { WONDER_GROUND } from './isoWonderGround.js';
import { TERRAIN, terrainZ } from './isoTerrain.js';
import { diamondPath } from './isoQuad.js';
import { beachTone, ensureIsoTileKey, blitIsoTileKey } from './isoGroundTiles.js';
import {
  GRASS_DETAIL, GRASS_FRINGE, GRASS_TILE_UNDER, GRASS_TILE_UNDER_WINTER,
  SEASON_GRASS, URBAN_DETAIL, drawUrbanDetail, smoothNoise, urbanTileAlpha,
} from './isoGroundDetail.js';

export function sweepIsoGroundCells(bake, resolve, out) {
  const {
    ctx, T, hw, hh, LOD, HARD, b, cullOn, cullPadX, cullPadY, ISO_GROUND_SLICE,
    L, roadMap, riverCells, urb, mat, plazaEra, wg, PR,
  } = bake;
  const { kindAt, grassAt, keyOfKind } = resolve;
  const { fringes, roads, wonderCells, grassCells, veilPush,
    faceL, faceD, faceLU, faceDU, faceFoot, faceBand, faceJoint, faceLipG, faceLipS } = out;
  for (let gy = b.gy0; gy <= b.gy1; gy += 1) {
    for (let gx = b.gx0; gx <= b.gx1; gx += 1) {
      const p = worldToScreen(gx * T, gy * T);   // coin NORD du losange
      if (cullOn && (p.x < -cullPadX || p.x > CM.cw + cullPadX
        || p.y < -cullPadY || p.y > CM.ch + cullPadY)) continue;
      // Recuisson en BANDE (tranche horizontale ou bande verticale du
      // défilement) : seules les cellules de la bande travaillent — le clip
      // garantit les pixels, ce test évite le calcul.
      if (ISO_GROUND_SLICE.on) {
        if (ISO_GROUND_SLICE.yOn && (p.y < ISO_GROUND_SLICE.y0 - ISO_GROUND_SLICE.padTop
          || p.y > ISO_GROUND_SLICE.y1 + ISO_GROUND_SLICE.padBot)) continue;
        if (ISO_GROUND_SLICE.xOn && (p.x < ISO_GROUND_SLICE.x0 - ISO_GROUND_SLICE.padX
          || p.x > ISO_GROUND_SLICE.x1 + ISO_GROUND_SLICE.padX)) continue;
      }
      if (PR) PR.n += 1;
      const key = gx + ',' + gy;
      const isRoad = L.roadSet.has(key);
      const cell = isRoad && roadMap ? roadMap.get(key) : null;
      const isPlaza = !!(cell && cell.rank === 'plaza');       // ⚠ piège places-dans-roadSet
      const isBridge = !!(cell && cell.roadSurface === 'bridge');
      const isWater = !!(riverCells && riverCells.has(key));
      const kind = kindAt(gx, gy);
      const tone = kind === 'plaza' ? (PLAZA_ERA_TONE[plazaEra] || PLAZA) : kind === 'wonder' ? WONDER_GROUND.tone
        : kind === 'grass' ? SEASON_GRASS : kind === 'dirt' ? DIRT_TONE
          : kind === 'shingle' ? beachTone('shingle')
            : kind === 'sand' ? beachTone('sand') : urb;
      // UN hash par cellule pour les deux tirages : le miroir (bit 3) et la
      // variante de tuile (bits 5-6, cf. isoVariantKey). Deux cmHash séparés ne
      // coûteraient rien de plus qu'ils ne rapporteraient — mêmes bits, même
      // grille — et ce bake balaie jusqu'à ~9 000 cellules d'herbe.
      const cellH = cmHash(key);
      const mir = ((cellH >>> 3) & 1) === 1;
      // Dosage par matière : l'URBAIN reste un aplat CALME avec un simple GRAIN de
      // texture (alpha faible) — la tuile pleine tapissait la ville d'un motif
      // fissuré qui concurrençait les bâtiments (v2 refusée à la capture). Herbe
      // et place gardent leur tuile pleine (elles portent bien le détail).
      // Urbain : plus de tuile générique (0) — la MATIÈRE par ère (drawUrbanDetail)
      // porte tout le détail. dirt garde son grain, place/parvis/reste leur tuile
      // pleine. Parvis : tileAlpha 1 depuis qu'il a SA matière (iso-wonder) au
      // lieu d'emprunter iso-plaza — cf. WONDER_GROUND pour le pourquoi du retour.
      // dirt 0.5 → 1 (Raph 2026-07-28, même décision que l'herbe) : la tuile de
      // terre regénérée se montre pleine, le voile date de l'ancienne tuile unique.
      const texAlpha = kind === 'urban' ? 0
        : kind === 'wonder' ? WONDER_GROUND.tileAlpha
          : kind === 'grass' ? GRASS_DETAIL.tileAlpha : 1;
      const tile = (kind && !HARD) ? ensureIsoTileKey(keyOfKind(kind)) : null;
      const tileReady = !!(tile && tile.ready);
      if (kind !== 'grass' && (!tileReady || texAlpha < 1)) {
        const tF = PR && performance.now();
        // Aplat STRICTEMENT UNI (v=1) pour TOUS les sols : le jitter par cellule,
        // même ±3 %, ressortait en damier de losanges (« il reste des plaques »,
        // Raph 2026-07-16 — même écueil que l'herbe jadis : toute variation par
        // CELLULE montre la grille). La vie vient de motifs CONTINUS (trame de
        // cailloux à densité lissée, frange, fleurs), jamais d'un ton par cellule.
        // PLUS D'EXCEPTION : le parvis portait un damier 2 teintes indexé sur
        // (gx+gy)&1 — un dallage VOULU, mais dessiné au pas de la cellule, donc
        // exactement la faute que le reste du paragraphe interdit. Retiré le
        // 2026-07-24 ; le dallage se lit maintenant aux joints de drawWonderPaving.
        ctx.fillStyle = rgb(tone, 1);
        diamondPath(ctx, p.x, p.y, hw, hh);
        ctx.fill();
        // Anti-couture : fin liseré de la même couleur par-dessus les bords partagés.
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
        // (Usure éparse RETIRÉE le 2026-07-16 — les ellipses sombres, quasi
        // invisibles sous la trame pleine, ressortaient en « plaques grises »
        // depuis que la trame terre est dosée. Retour Raph : les retirer.)
        if (PR) PR.flat += performance.now() - tF;
      }
      // `texAlpha > 0` : à 0 le blit ne peindrait rien mais coûterait plein pot.
      // Le MIROIR était refusé au parvis tant qu'il empruntait iso-plaza : le flip
      // un coup sur deux cassait NET au bord de cellule, parce que le motif était
      // un objet centré (quatre grandes dalles) dont le miroir déplaçait le
      // liseré. Rendu à sa propre matière — une texture continue de petits
      // carreaux, cf. WONDER_GROUND — le parvis reprend le miroir comme toutes
      // les autres : c'est lui qui casse la répétition des 3 variantes.
      if (tileReady && texAlpha > 0) {
        const tT = PR && performance.now();
        // Herbe : aplat d'OMBRE sous la tuile — ses creux (noFill) doivent lire
        // sombre, pas laisser voir le fond olive du bake. Uniforme (aucune
        // valeur par cellule), même geste anti-couture que l'aplat urbain.
        if (kind === 'grass') {
          ctx.fillStyle = rgb(CM.season === WINTER ? GRASS_TILE_UNDER_WINTER : GRASS_TILE_UNDER, 1);
          diamondPath(ctx, p.x, p.y, hw, hh);
          ctx.fill();
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (texAlpha < 1) ctx.globalAlpha = texAlpha;
        blitIsoTileKey(ctx, keyOfKind(kind), p.x, p.y, hw, mir, cellH);
        if (texAlpha < 1) ctx.globalAlpha = 1;
        if (PR) PR.tiles += performance.now() - tT;
      }
      // Herbe : variation de prairie + tapis vivant (touffes/speckle/fleurs) PAR-DESSUS
      // la base. La variation est INDÉPENDANTE de la grille (fini la couture dure
      // in-grid↔sauvage révélée en calmant la tuile) : plaques douces via un hash de
      // bloc ~4 cellules, biaisé clair (nz²) → alpha faible, pas de bord franc.
      if (kind === 'grass' && !HARD) {
        const tG = PR && performance.now();
        // PRÉS (meadow) : plaques lentes foncé/clair par bruit LISSÉ — aucune
        // couture (ni maillage par cellule ni bord de bloc). Foncé = herbe
        // grasse, clair = herbe sèche. __grassDetail({ meadow: 0 }) pour couper.
        // Les deux voiles ne sont PAS peints ici : un fill de losange par cellule
        // d'herbe (jusqu'à 2 × ~9 000) pesait 57 % de la recuisson. On les REMISE
        // par PALIER D'ALPHA (cf. veilBuckets) → une poignée de fills d'union en
        // fin de passe, même rendu (losanges disjoints, alpha quantifié au 1/256
        // — sous le seuil perceptible sur un voile à alpha ≤ 0,1).
        if (GRASS_DETAIL.meadow > 0) {
          const nzm = smoothNoise(gx, gy, 6, 'mead2') - 0.5;
          const am = Math.abs(nzm) * GRASS_DETAIL.meadow;
          // Seuil sur `am` pour les DEUX (le clair sortait déjà à am*0.8) : gate inchangé.
          if (am > 0.012) veilPush(nzm < 0 ? 0 : 1, nzm < 0 ? am : am * 0.8, p.x, p.y);
        }
        if (GRASS_DETAIL.wildShade > 0) {
          const nz = (cmHash('mead:' + (gx >> 2) + ':' + (gy >> 2)) % 100) / 100;
          const a = GRASS_DETAIL.wildShade * nz * nz;
          if (a > 0.015) veilPush(2, a, p.x, p.y);
        }
        // Le tapis vivant (touffes/speckle/fleurs) reste réservé au bake PLEIN :
        // c'est le poste cher de l'herbe — le light garde prés et ombrage.
        if (GRASS_DETAIL.on && !LOD) grassCells.push(gx, gy, p.x, p.y);   // fleurs après les voiles
        if (PR) PR.grass += performance.now() - tG;
      }
      // Sol urbain : tuile PixelLab de l'ère (par-dessus l'aplat, miroir anti-répétition)
      // si le PNG est prêt ; sinon repli sur le motif procédural (joints/cailloux).
      // TERRE BATTUE : la tuile posée PLEINE sur chaque cellule tapissait la ville
      // d'une trame de cailloux répétée — on la DOSE en alpha (tileA), CONSTANT
      // par défaut (retour Raph 2026-07-20 : « continu et pas haché » — les
      // plaques par bruit lissé lisaient comme des tas de terre épars).
      if (kind === 'urban' && URBAN_DETAIL.on && !HARD) {
        let drew = false;
        if (URBAN_DETAIL.tiles && mat.tile) {
          // S2 : la dose vaut pour TOUTES les matières, plus seulement la terre.
          // À 1 (défaut de tous les types sauf terre) on repasse à l'identique
          // par le chemin d'origine — aucun globalAlpha posé, aucun coût.
          const ta = urbanTileAlpha(mat.type);
          const jit = mat.type === 'earth' && URBAN_DETAIL.tileJit
            ? smoothNoise(gx, gy, 4, 'peb') * URBAN_DETAIL.tileJit : 0;
          if (ta < 1 || jit) {
            // tileJit reste un knob : s'il est ≠ 0, la modulation repasse par le
            // bruit LISSÉ (voisines quasi égales → jamais de damier par cellule).
            ctx.globalAlpha = Math.min(1, ta + jit);
            drew = blitIsoTileKey(ctx, mat.tile, p.x, p.y, hw, mir, cellH);
            ctx.globalAlpha = 1;
          } else {
            drew = blitIsoTileKey(ctx, mat.tile, p.x, p.y, hw, mir, cellH);
          }
        }
        if (!drew) drawUrbanDetail(ctx, gx, gy, p.x, p.y, hw, hh, mat);
      }
      // VOILE DE NUANCE (sols urbain/terre) : plaques lentes foncé/clair par
      // bruit lissé, PAR-DESSUS aplat ET trame (sous une tuile opaque il serait
      // invisible) — la grande nappe de terre n'est plus un aplat monotone.
      // __groundMat({ noiseAmp: 0 }) pour couper.
      if ((kind === 'urban' || kind === 'dirt') && URBAN_DETAIL.noiseAmp > 0 && !HARD) {
        const nzv = smoothNoise(gx, gy, 5, 'veil') - 0.5;
        const av = Math.abs(nzv) * URBAN_DETAIL.noiseAmp;
        if (av > 0.012) {
          ctx.fillStyle = nzv < 0 ? `rgba(52,40,26,${av.toFixed(3)})` : `rgba(255,240,212,${(av * 0.85).toFixed(3)})`;
          diamondPath(ctx, p.x, p.y, hw, hh);
          ctx.fill();
        }
      }
      // Parvis : dallage + margelle DIFFÉRÉS après le fond, même raison que la
      // frange d'herbe — les deux mordent sur des arêtes partagées, et la cellule
      // voisine peinte plus tard repasse son liseré anti-couture dessus. Tracés
      // dans la boucle, la moitié des joints internes survivait selon l'ordre de
      // balayage (une lacune qui se lit comme un défaut de dallage).
      if (kind === 'wonder') wonderCells.push(gx, gy, p.x, p.y);
      // Frange d'herbe : mémorise chaque arête sol↔herbe de cette cellule — la
      // frange se dessine APRÈS le fond (elle mord sur des voisins déjà peints,
      // quel que soit l'ordre de balayage). Sols urbain/terre seulement : les
      // dallages formels (place, parvis) gardent leur bord franc voulu.
      if (GRASS_FRINGE.on && !LOD && (kind === 'urban' || kind === 'dirt')) {
        const inL = 1 / Math.hypot(hw, hh);          // vecteur rentrant normalisé (±hw,±hh)
        const ixn = hw * inL, iyn = hh * inL;
        // wx0/wy0→wx1/wy1 : les deux bouts de l'arête en coordonnées MONDE (en
        // cellules). Le mode 'wander' échantillonne son bruit là-dessus, jamais
        // sur la cellule ni sur l'indice du pas : c'est ce qui rend le bord
        // continu d'un losange au suivant au lieu de casser à chaque coin.
        if (grassAt(gx, gy - 1)) fringes.push({ ax: p.x, ay: p.y, bx: p.x + hw, by: p.y + hh, inx: -ixn, iny: iyn, seed: 'gfr:n:' + key, wx0: gx, wy0: gy, wx1: gx + 1, wy1: gy });
        if (grassAt(gx + 1, gy)) fringes.push({ ax: p.x + hw, ay: p.y + hh, bx: p.x, by: p.y + hh * 2, inx: -ixn, iny: -iyn, seed: 'gfr:e:' + key, wx0: gx + 1, wy0: gy, wx1: gx + 1, wy1: gy + 1 });
        if (grassAt(gx, gy + 1)) fringes.push({ ax: p.x - hw, ay: p.y + hh, bx: p.x, by: p.y + hh * 2, inx: ixn, iny: -iyn, seed: 'gfr:s:' + key, wx0: gx, wy0: gy + 1, wx1: gx + 1, wy1: gy + 1 });
        if (grassAt(gx - 1, gy)) fringes.push({ ax: p.x, ay: p.y, bx: p.x - hw, by: p.y + hh, inx: ixn, iny: iyn, seed: 'gfr:w:' + key, wx0: gx, wy0: gy, wx1: gx, wy1: gy + 1 });
      }
      // ── CONTREMARCHES DU RELIEF (isoTerrain) ──────────────────────────────
      // Une cellule plus HAUTE que son voisin SUD ou EST montre la TRANCHE du
      // terrain : un quad qui pend sous l'arête partagée, de la différence de
      // niveaux. En 3/4 seules ces deux faces existent (+x, +y) — règle de la
      // marche, une face qui regarde ailleurs ne se voit pas. Peintes DANS le
      // balayage : les voisins, dessinés plus bas et plus tard, recouvrent tout
      // débord — on peut donc descendre le sommet SUD jusqu'au niveau du voisin
      // DIAGONAL sans trou de coin ni double peinture visible.
      // Matière TERRE (une coupe de sol montre la terre, jamais l'herbe) ; la
      // face gauche (+y) regarde la lumière haut-gauche → claire, la droite
      // (+x) → sombre. Dessinées à TOUS les niveaux d'allégé : elles sont
      // structurelles — sans elles, le geste montrerait des fentes de fond.
      if (TERRAIN.amp && !isWater && !isBridge) {
        // ⚠ LA MÊME AUTORITÉ QUE LE LOSANGE : terrainZ aux coins nord — socles
        // compris. Comparer des niveaux de cellule (cellLevelU) manquait les
        // marches AUTOUR DES SOCLES : le losange se pose à la hauteur du replat,
        // la face doit pendre d'exactement cette hauteur-là, pas de celle du
        // terrain nu. (Vu à la capture : fentes vertes le long du bâti.)
        //
        // REMISÉES, PAS PEINTES : une face ne recouvre jamais un losange (le
        // voisin plus bas COMMENCE là où elle finit) — l'ordre est donc libre,
        // et on paie 2 fills d'union par recuisson au lieu de milliers (mesuré :
        // les fills par cellule coûtaient ~+45 % de recuisson ; c'est toujours
        // le tracé qui coûte sur cette carte, jamais le JS).
        const zN = terrainZ(gx * T, gy * T);
        const zE = terrainZ((gx + 1) * T, gy * T);
        const zS = terrainZ(gx * T, (gy + 1) * T);
        if (zN > zE || zN > zS) {
          // Le même zoom que le losange : hw = T·z·ISO_X, donc z = hw/T — vrai
          // aussi sous les transformations de calque (walkLayer bascule le repère).
          const k = hw / T;
          const zD = terrainZ((gx + 1) * T, (gy + 1) * T);
          const dD = Math.max(0, zN - zD) * k;
          const sx = p.x, sy = p.y + hh * 2;           // sommet SUD du losange
          // La tranche prend la MATIÈRE de sa cellule : mur de soutènement en
          // pierre d'ère dans la ville (dallage/place/parvis), terre partout
          // ailleurs — le brun jurait sur le dallage gris (vu à la bande 4).
          const stone = kind === 'urban' || kind === 'plaza' || kind === 'wonder';
          // POLISH (remisé comme le reste, ~5 fills/strokes d'union par recuisson,
          // sauté en allégé HARD — c'est de la matière, pas de la structure) :
          //   · LÈVRE — l'herbe DÉBORDE du bord (kind grass), la pierre reçoit sa
          //     margelle claire ; la terre nue n'a pas de lèvre (un surplomb de
          //     sol nu se lirait comme un bug, pas comme de la végétation) ;
          //   · ASSISE sombre sous les GRANDES marches (≥ 2 U — et 2 U d'écran
          //     valent exactement hh : 2·(T/4)·(hw/T) = hw/2) : la lecture de
          //     profondeur du mur de quai, en une bande d'ombre ;
          //   · JOINTS de pierre (faces assez hautes ET assez zoomées : ≥ 6 px) ;
          //   · OMBRE DE CONTACT au pied — le trait qui pose la marche au sol.
          const pushFace = (ax, ay, da, db, dark) => {
            (stone ? (dark ? faceDU : faceLU) : (dark ? faceD : faceL))
              .push(ax, ay, sx, sy, sx, sy + db, ax, ay + da);
            if (HARD) return;
            faceFoot.push(ax, ay + da, sx, sy + db);
            if (kind === 'grass' || stone) {
              const lh = Math.max(1, hh * 0.12);
              (stone ? faceLipS : faceLipG).push(ax, ay, sx, sy, sx, sy + lh, ax, ay + lh);
            }
            if (Math.min(da, db) >= hh) {
              faceBand.push(ax, ay + da * 0.55, sx, sy + db * 0.55, sx, sy + db, ax, ay + da);
            }
            if (stone && da >= 6) {
              for (const tj of [0.35, 0.68]) {
                const jx = ax + (sx - ax) * tj, jy = ay + (sy - ay) * tj;
                faceJoint.push(jx, jy + 1, jy + da + (db - da) * tj - 1);
              }
            }
          };
          if (zN > zE) {
            const dE = (zN - zE) * k;
            pushFace(p.x + hw, p.y + hh, dE, Math.max(dE, dD), true);
          }
          if (zN > zS) {
            const dS = (zN - zS) * k;
            pushFace(p.x - hw, p.y + hh, dS, Math.max(dS, dD), false);
          }
        }
      }
      // Les cellules-PONT ne reçoivent ni fond ni ruban ici : leur tablier est
      // dessiné APRÈS le fleuve (drawIsoBridges), au-dessus de l'eau. Le PARVIS
      // non plus : ses routes sont carvées par le plan — le garde ne couvre que la
      // frame transitoire entre __showWonder et le recalcul du layout.
      if (isRoad && !isPlaza && !isBridge && !isWater && !(wg && wg.has(key))) roads.push({ gx, gy, cell });
    }
  }
}
