// LE MONTAGE DU BAKE DE SOL — ce qui répond avant que quoi que ce soit soit peint.
//
// Sorti de `drawIsoGround` le 2026-08-23 (Q10). C'est la dernière pièce du peintre de
// sol à en sortir, et la seule qui ne PEINT rien : elle RÉPOND. Elle résout les
// ensembles dérivés du layout (bâti, cour, friche, grève, parvis, places), puis
// construit les fermetures qui savent dire, pour une cellule, DE QUOI ELLE EST FAITE
// — `kindAt` en tête, mémoïsé parce que le même verdict sert au fond, à la tuile et
// à la frange.
//
// ⚠ CE N'EST PAS UNE PASSE, C'EST UNE FABRIQUE — et c'est pour ça qu'elle rend un
// objet au lieu de dessiner. Les trois familles qu'elle produit sont exactement
// celles que les passes consommaient déjà :
//   · `bake`    — le contexte de cuisson (canevas, métrique, bornes, drapeaux, layout) ;
//   · `resolve` — les résolveurs (`kindAt`, `grassAt`, `keyOfKind`) ;
//   · `out`     — les tampons vides (arêtes de frange, rubans, parvis, herbe).
// L'orchestrateur les déstructure et les répartit ; il ne les construit plus.
//
// ⚠ `ISO_GROUND_LOD` ARRIVE EN PARAMÈTRE, et le nom est celui d'origine EXPRÈS : le
// corps le lit tel quel, donc les 258 lignes sont reprises SANS UNE LIGNE DE CHANGÉE.
// Ce n'est pas qu'un artifice de preuve — c'est aussi le bon sens du montage : le
// CACHE décide du niveau de bake allégé, la fabrique le REÇOIT. Elle n'a pas à
// connaître la politique de qui l'appelle.
import { CM } from '../layout.js';
import { visibleCellBounds, ISO_X, ISO_Y } from './projection.js';
import { terrainMaxPx } from './isoTerrain.js';
import { ensureQuayGate } from '../quaysAndRiot.js';
import { COUR, builtCells, courOf } from './isoTissu.js';
import { ROAD_DETAIL, roadTone } from './isoRoad.js';
import { BEACH, ISO_TILE_KEYS, plazaEraTileKey } from './isoGroundTiles.js';
import { isBeachBankCell, beachPortCells } from './isoBeachCells.js';
import { WONDER_GROUND, wonderGroundSet } from './isoWonderGround.js';
import { FRONTIER, frontierFlip, urbanMatFor, urbanToneFor } from './isoGroundDetail.js';
import { WINTER } from '../seasonMode.js';
import { plazaEraForBand, plazaLawnAtCell } from './isoPlaza.js';
import { LISIERE, makeLisiere } from './isoLisiere.js';
import { LAWN, townLawnAt } from './isoMeadow.js';

export function makeGroundBake(ISO_GROUND_LOD) {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const LOD = ISO_GROUND_LOD.on;
  // HARD = l'allégé historique ; en light, les gates marqués !HARD restent actifs.
  const HARD = LOD && !ISO_GROUND_LOD.light;
  const hw = T * z * ISO_X;            // demi-largeur du losange
  const hh = T * z * ISO_Y;            // demi-hauteur
  // + terrainMax : une cellule dont la projection PLATE est sous le bord bas peut
  // être LEVÉE dans l'écran par le relief — la borne grossière s'unprojette à z=0,
  // elle doit donc s'élargir du plafond du champ (0 quand le terrain est coupé).
  const b = visibleCellBounds(hw * 2 + terrainMaxPx() * z);
  // Profileur opt-in (globalThis.__isoGroundProfile = true) — même idiome que
  // __layoutProfile : coût nul éteint, phases en ms dans __isoGroundProfileLast.
  const PR = globalThis.__isoGroundProfile
    ? { n: 0, flat: 0, tiles: 0, grass: 0, cells: 0, fringe: 0, roads: 0, median: 0, total: 0, t0: performance.now() }
    : null;
  const band = (L.counts && L.counts.eraBand) | 0;
  // Aplat urbain de SAISON (bible des surfaces, hiver) : même ton l'été, tiré vers la
  // neige l'hiver — l'épaulement des routes et la lisière le suivent, ils lisent `urb`.
  const mat = urbanMatFor(band), urb = urbanToneFor(band, CM.season === WINTER);
  const road = roadTone(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band);   // honore le forçage d'aperçu
  const riverCells = (L.river && L.river.present && L.river.cells) || null;
  const roadMap = L.roadMap;
  const roads = [];                    // cellules-route de la passe (rubans après le fond)
  const fringes = [];                  // arêtes herbe↔sol de la passe (frange après le fond)
  const wonderCells = [];              // (gx, gy, px, py) du parvis — dallage + margelle après le fond
  const wg = WONDER_GROUND.on ? wonderGroundSet(L) : null;   // parvis des merveilles
  // Résolution du TYPE de sol par cellule, MÉMOÏSÉE : le même verdict sert au
  // fond ET aux tests de voisinage de la frange d'herbe (aucune divergence
  // possible). kind = tuile PixelLab ; le ton d'aplat s'en déduit. L'EAU n'est
  // pas peinte ici : le fleuve est un RUBAN LIVE lissé par-dessus le bake
  // (drawIsoRiver) — le sol sous l'eau reste de l'herbe (berges douces).
  // En place COMPOSÉE, aucune image ne porte le dallage : la dalle de sol est
  // l'esplanade, et le mobilier se pose dessus. (L'ancienne SCÈNE de place, qui
  // portait son propre dallage et rendait les cellules au sol urbain, a été
  // retirée le 2026-10-06.)
  const plazaEra = plazaEraForBand(band);
  // Résolu UNE FOIS par recuisson : l'ère est celle de la bande, elle ne change
  // pas d'une cellule à l'autre. Résoudre par cellule ferait 4 lectures de cache
  // sur chaque cellule de place pour un verdict identique.
  const plazaKey = plazaEraTileKey(plazaEra);
  const keyOfKind = (k) => (k === 'plaza' ? plazaKey : ISO_TILE_KEYS[k]);
  // ⚠ MESURÉ, NE PAS « OPTIMISER » : cette Map est reconstruite à chaque
  // recuisson, donc à chaque cran de zoom, alors que le verdict de kindAt ne
  // dépend NI du zoom NI de la caméra (seulement du layout, du décodage du sprite
  // de place, de l'aperçu de merveille et des molettes __wonderGround/__frontier).
  // La mettre en cache sur l'objet layout — même geste que builtCells(L) juste
  // au-dessus — a été implémenté puis RETIRÉ le 2026-07-24 : cache vérifié
  // effectivement réutilisé (même objet, 27 252 cellules, signature stable sur 4
  // recuissons) et le temps n'a PAS bougé (2326 / 2116 / 1650 / 1971 ms). A/B
  // alterné dans les deux sens : 2029 contre 2066 ms.
  // Le coût de cette boucle est la RASTÉRISATION des losanges (aplat + liseré
  // anti-couture par cellule), pas la classification. Même conclusion que pour les
  // quais : sur cette carte, ce qui coûte est toujours le tracé, jamais le JS.
  const kinds = new Map();
  // ── Décision de la LISIÈRE QUI DIVAGUE, déclarée AVANT kindAt qui l'appelle.
  // (Un const déclaré après son appelant marche tant que l'appel est différé,
  // mais c'est le motif exact qui a déjà produit un TDZ en production ici : on
  // ne le rejoue pas.) Ne lit QUE le layout, jamais kindAt — kindAt l'appelle,
  // l'inverse bouclerait.
  const urbanLogical = (gx, gy) => !!(L.urbanSet && L.urbanSet.has(gx + ',' + gy));
  const built = builtCells(L);
  const courK = courOf(L);      // quartier / cour / friche par cellule (cf. COUR)
  // PELOUSES DE VILLE DÉLIMITÉES (LAWN.crisp, cf. isoMeadow) : une pelouse (jardins,
  // cours et air des îlots — L.townGreen — et friche de quartier) n'est pas une LISIÈRE
  // ville↔campagne. Ses cellules sont hors de urbanSet, donc le pavé qui la borde passait
  // pour un bord de ville et FRONTIER le retournait en herbe au hasard : la pelouse
  // débordait en taches sur la chaussée. Pour une cellule de VILLE, une voisine de
  // pelouse compte donc comme de la ville ; une cellule d'herbe sauvage, elle, voit
  // toujours la pelouse comme de l'herbe (sa divagation au bord de la ville ne change pas).
  const lawnAt = (LAWN.on && LAWN.crisp) ? townLawnAt(L, courK) : null;
  const isLawn = (gx, gy) => !!(lawnAt && lawnAt(gx, gy));
  const urbanOrGreen = (gx, gy) => urbanLogical(gx, gy) || !!(L.townGreen && L.townGreen.has(gx + ',' + gy));
  const frontierFlips = (gx, gy, isUrban) => frontierFlip(gx, gy, isUrban, (lawnAt && isUrban) ? urbanOrGreen : urbanLogical, built);
  // ── PLAGE DES BERGES DU FLEUVE (Raph, 2026-07-30 : « il faut générer une
  // plage ») ──────────────────────────────────────────────────────────────────
  // Elle va là où la maçonnerie du quai s'arrête : l'emprise du port (que
  // `ensureQuayGate` coupe exprès), les passages trop étroits pour un mur, les deux
  // extrémités du fleuve. Le pourtour des ÎLES, lui, est TRACÉ (drawIsoIslandShore)
  // et non baké : voir son en-tête, la grille est trop grossière à cette taille.
  //
  // ⚠ POURQUOI UNE MATIÈRE BAKÉE PAR CELLULE SUR LES BERGES. Ce projet a déjà
  // rejeté trois fois une nappe lisse posée sur du pixel art (le grain d'eau, les
  // vaguelettes, les filets de courant) : sur une large étendue, une plage doit
  // être de la MATIÈRE avec du grain, pas un aplat. Le prix est que la cellule est
  // alignée sur la grille, donc le bord EXTÉRIEUR de la plage est en escalier.
  // Ça passe ici, contrairement à la jonction herbe↔ville (7 refus) : le bord
  // INTÉRIEUR, au ras de l'eau, est recouvert par le ruban du fleuve — l'escalier
  // ne touche jamais la ligne d'eau — et un bord sable↔herbe dentelé se lit comme
  // un rivage irrégulier, là où un escalier eau↔terre se lit comme un bug.
  // ⚠ Le gate doit être FRAIS ici : le sol est baké AVANT le fleuve dans la frame,
  // donc personne ne l'a encore calculé au premier passage. Idempotent et caché
  // par layout, l'appel ne coûte rien les fois suivantes.
  ensureQuayGate();
  const beachIsles = (L.river && L.river.islands) || null;
  // ÎLES : toute cellule que l'ellipse touche. Les 4 coins et le centre sont
  // testés, donc les cellules du bord entrent aussi — l'île est pleine, sans trou.
  const beachIslandAt = (gx, gy) => {
    if (!BEACH.on || !beachIsles || !beachIsles.length) return false;
    for (const il of beachIsles) {
      const rx = Math.max(0.001, il.rx), ry = Math.max(0.001, il.ry);
      for (const [px, py] of [[gx, gy], [gx + 1, gy], [gx, gy + 1], [gx + 1, gy + 1], [gx + 0.5, gy + 0.5]]) {
        const dx = px - il.x, dy = py - il.y;
        const al = dx * il.tx + dy * il.ty, cr = -dx * il.ty + dy * il.tx;
        if (Math.hypot(al / rx, cr / ry) <= 1) return true;
      }
    }
    return false;
  };
  // Le port échappe à l'exclusion du bâti (le pourquoi est dans isoBeachCells) : l'île
  // en a besoin comme la berge, d'où cet ensemble ici. La règle de la BERGE, elle, est
  // partie tout entière — exclusions comprises — dans `isBeachBankCell`.
  const portCells = beachPortCells(L);

  // ÎLES : anneau extérieur de l'ellipse, en coordonnées de l'île (`tx,ty` = le sens
  // du courant). Test ANALYTIQUE, donc exact quelle que soit l'orientation — aucun
  // jeu de cellules à maintenir pour l'île.
  //
  // ⚠ TESTÉ AVANT LE SOL DE VILLE, et c'est indispensable : les cellules de l'île
  // sont dans `urbanSet` (c'est l'emprise de la merveille qui l'a fait naître), donc
  // la branche « sol de ville » les prenait toutes et la plage ne sortait JAMAIS.
  // Mesuré sur l'Aiguille : 60 cellules urbaines sur les 89 de l'ellipse, 0 berge
  // classée. Le parvis d'une merveille (kind 'wonder') garde en revanche la
  // priorité, et les routes aussi — un pont qui traverse l'île reste un pont.
  // ⚠⚠ ON TESTE LA CELLULE ENTIÈRE, PAS SON CENTRE — et sans tirage au sort.
  // Retour Raph : « le contour n'est pas bien fait, on veut un joli contour
  // identique ». La v1 testait le seul centre de la cellule et faisait divaguer la
  // largeur au hasard : sur un fuseau de 4,8 tuiles de large, la grille est trop
  // grossière pour ça et le rivage sortait en POINTILLÉ — des bouts de sable
  // séparés par des bouts d'herbe. Le hasard qui donne une jolie lisière sur une
  // grande étendue (cf. FRONTIER) casse un anneau étroit.
  //
  // On échantillonne donc les 4 coins ET le centre, on garde la distance MINIMALE,
  // et un point hors de l'ellipse compte pour 0 : toute cellule que le bord
  // TRAVERSE entre dans l'anneau. L'anneau est alors FERMÉ par construction —
  // aucune cellule frontière ne peut être sautée — et d'épaisseur régulière.
  // Diagnostic opt-in (globalThis.__beachStats), lu UNE fois par bake : une propriété
  // absente de l'objet global coûte ~35 ns à chercher (audit du 05/10, DEV-4), soit
  // ~0,7 ms par recuisson complète quand le drapeau était relu à chaque cellule.
  const beachStats = import.meta.env?.DEV && globalThis.__beachStats
    ? (globalThis.__beachStatsLast || (globalThis.__beachStatsLast = {})) : null;
  const kindAt = (gx, gy) => {
    const key = gx + ',' + gy;
    const hit = kinds.get(key);
    if (hit !== undefined) return hit;
    let k;
    const isRoad = L.roadSet.has(key);
    const cell = isRoad && roadMap ? roadMap.get(key) : null;
    const isWater = !!(riverCells && riverCells.has(key));
    // Le SQUARE (place 'jardin') porte une pelouse sur son anneau extérieur (cf.
    // plazaLawnAtCell) : de l'herbe, pas de dallage.
    if (cell && cell.rank === 'plaza') k = plazaLawnAtCell(L, key) ? 'grass' : 'plaza';   // ⚠ piège places-dans-roadSet
    // Parvis de merveille : l'emprise réservée porte son dallage propre (l'eau
    // garde la priorité — le ruban du fleuve passe dessus, berges douces).
    else if (!isWater && wg && wg.has(key)) k = 'wonder';
    // ── L'ÎLE EST ENTIÈREMENT EN SABLE ────────────────────────────────────────
    // Demande de Raph (2026-07-30, après l'anneau) : « fais toute l'île en sable ».
    // Toute cellule que l'ellipse touche, pas seulement son pourtour — le test
    // porte sur les 4 coins et le centre, donc les cellules du bord entrent aussi
    // et il ne reste aucun trou. Le contour TRACÉ (drawIsoIslandShore) garde son
    // rôle : lui seul suit la courbe au pixel et lisse l'escalier des cellules
    // sur la ligne d'eau. Priorité AVANT le sol de ville, sans quoi l'emprise de
    // la merveille reprendrait l'île (mesuré : 60 cellules urbaines sur 89).
    else if (!isWater && !isRoad && (!built.has(key) || portCells.has(key))
      && beachIslandAt(gx, gy)) k = BEACH.mat;
    // ── PLAGE SUR LES BERGES DU FLEUVE, AVANT LE SOL DE VILLE ─────────────────
    // ⚠ Cette priorité est le cœur du correctif, et elle a coûté deux essais.
    // Les cellules concernées sont presque toutes dans `urbanSet` : celles de
    // l'ÎLE parce que c'est l'emprise de la merveille qui l'a fait naître (mesuré
    // 60 sur 89), celles du PORT parce que le port et son tissu sont de la ville
    // (mesuré 13 des 59 cellules du trou de quai). Testée après « sol de ville »,
    // la plage ne sortait donc JAMAIS là où Raph la demandait — seulement aux
    // extrémités du fleuve, hors carte. Ce qui garde la priorité : le parvis d'une
    // merveille, les ROUTES (un pont qui traverse l'île reste un pont) et toute
    // cellule BÂTIE — sauf le PORT lui-même, cf. beachPortCells : son emprise
    // mordait la grève en plein milieu et y laissait une bande d'herbe.
    // ⚠ MÊME RÈGLE QUE LA PENTE DE GRÈVE, ET C'EST LE POINT : elle vit désormais dans
    // `isoBeachCells`, appelée ici par le SOL CUIT et là-bas par la passe vive du fleuve.
    // Les exclusions (route, bâti sauf port) sont parties avec elle — les redoubler ici
    // rouvrirait l'écart que l'extraction ferme.
    // Les cases d'EAU de la bande en sont aussi (2026-10-01) : le riverSet déborde le
    // ruban peint, et ce qu'il en laisse voir sortait en herbe entre le sable et l'eau.
    else if (isBeachBankCell(L, gx, gy)) k = BEACH.mat;
    // Routes HORS tissu urbain : fond d'HERBE depuis le 2026-07-20 (retour Raph :
    // le fond de cellule 'dirt' — aplat terre + tuile de mottes — dépassait du
    // ruban en « pavé de terre » cranté à la jonction herbe↔sol). Le chemin se
    // lit par sa dalle + ourlet/épaulement CONTINUS : le fond des routes hors tissu
    // n'est plus 'dirt'. (Le kind 'dirt' reste produit EN VILLE — cour de terre de
    // courField, juste en dessous — et sa plomberie texAlpha/fringe sert toujours.)
    else if (!isWater && L.urbanSet && L.urbanSet.has(key)) {
      // Sol de ville : pavé près du bâti, cour de terre plus loin, friche au-delà
      // (cf. COUR — c'est ici que la moitié vide de la ville cesse d'être minérale).
      k = courK.get(key) || 'urban';
    } else if (!courK.camp && !isWater && riverCells && L.river.banks && L.river.banks.has(key) && L.urbanSet
      && (L.urbanSet.has((gx + 1) + ',' + gy) || L.urbanSet.has((gx - 1) + ',' + gy)
        || L.urbanSet.has(gx + ',' + (gy + 1)) || L.urbanSet.has(gx + ',' + (gy - 1)))) {
      // QUAI-LITE : une berge qui touche le tissu urbain se pave (berge bâtie) —
      // esquisse des quais legacy ; le vrai quai par ère viendra avec l'art Phase 5.
      // Pas au CAMP : son emprise y est surtout du pré (campField), et la berge
      // qui le touchait se couvrait de taches de terre loin de tout sentier.
      k = 'urban';
    } else k = 'grass';   // teinte UNIFORME (couture in-grid/sauvage retirée)
    // LISIÈRE QUI DIVAGUE : la frontière ville↔campagne serpente au lieu de
    // suivre l'emprise au cordeau (cf. FRONTIER). Retour de matière SEULEMENT :
    // ni route, ni eau, ni dallage formel, et jamais une cellule bâtie.
    // Depuis le lot COUR, la limite ville↔campagne n'est plus `urban`↔`grass`
    // mais `dirt`↔`grass` : la friche s'intercale. Faire divaguer l'ANCIENNE
    // couture ne ferait plus rien (les deux matières ne se touchent presque
    // jamais) — c'est le bord de la cour qui doit serpenter, et une cellule
    // reprise à l'herbe revient en TERRE, pas en pavé.
    // Pas au CAMP (courK.camp, cf. campField) : la terre n'y est pas une emprise
    // mais une trace — la faire divaguer retournerait du pré en terre au bord de
    // l'ancienne emprise, des taches loin de tout sentier.
    // Les jardins, prés et ceintures de la structure de ville (L.townGreen) gardent
    // leur herbe : la divagation est une affaire de LISIÈRE, pas d'intérieur de ville.
    if (FRONTIER.on && !courK.camp && !isRoad && !isWater && !(L.townGreen && L.townGreen.has(key)) && (k === 'urban' || k === 'dirt' || k === 'grass')) {
      const cityish = k !== 'grass';
      if (frontierFlips(gx, gy, cityish)) k = cityish ? 'grass' : (COUR.on ? 'dirt' : 'urban');
    }
    // La cour de terre devient PELOUSE aux ères modernes et cosmiques (COUR.lawnFrom).
    // Après la lisière, pour que la divagation, qui rend de la terre, suive aussi.
    if (k === 'dirt' && COUR.lawnFrom != null && band >= COUR.lawnFrom && !courK.camp) k = 'grass';
    // Diagnostic opt-in (`beachStats`, plus haut) : combien de cellules de chaque
    // matière le bake a classées.
    if (beachStats) beachStats[k] = (beachStats[k] || 0) + 1;
    kinds.set(key, k);
    return k;
  };
  // Voisin d'herbe « frangeable » : de l'herbe FERME — pas une cellule d'eau
  // (peinte herbe mais recouverte en live par le ruban du fleuve : une frange
  // là-dessous ressortirait sur les quais).
  // Pas de frange vers une pelouse de ville (LAWN.crisp) : ses langues brouillaient le bord.
  const grassAt = (gx, gy) => kindAt(gx, gy) === 'grass' && !(riverCells && riverCells.has(gx + ',' + gy)) && !isLawn(gx, gy);
  // (Les VOILES D'HERBE PAR LOSANGE — prés clair/foncé, ombre sauvage, remisés par
  //  palier d'alpha : VEIL_COL, veilPush, veilPushRects, flushVeils — n'étaient plus
  //  alimentés depuis que les prés sont des ZONES lissées (iso/isoMeadow.js, lot 4 de
  //  docs/PLAN-VEGETATION.md : « voiles de sol = image lissée, jamais par losange »).
  //  Retirés le 2026-10-06, audit MORT-14.)
  const grassCells = [];               // (gx, gy, px, py) à plat — fleurs différées
  // Géométrie de l'herbe (losanges, rectangles de lisière) : le gabarit des voiles
  // lissés (prés, sous-bois — isoForestFloor.drawGrassVeils).
  const grassMask = [], grassMaskR = [];
  // LISIÈRE ARRONDIE (cf. isoLisiere) : le classement par pixel d'art
  // des cellules de bord. L'eau est HORS CHAMP — son sol est recouvert par le
  // fleuve, et la laisser voter ferait mordre son herbe dans la grève.
  const lisiere = (LISIERE.on && !HARD)
    // Les pelouses de ville sont aussi hors champ (LAWN.crisp) : leur bord reste franc,
    // des deux côtés — la cellule de pavé voisine ne s'arrondit pas non plus.
    // Le repère (grille + graine) : la grille qui grandit périme tout le cache (MEM-7).
    ? makeLisiere(kindAt, (gx, gy) => !!(riverCells && riverCells.has(gx + ',' + gy)) || isLawn(gx, gy), undefined, L.gridN + ':' + L.mapSeed)
    : null;
  return {
    bake: { ctx, T, z, hw, hh, LOD, HARD, b, L, band, mat, urb, road, roadMap, riverCells, plazaEra, wg, PR },
    resolve: { kindAt, grassAt, keyOfKind, lisiere },
    out: { fringes, roads, wonderCells, grassCells, grassMask, grassMaskR },
  };
}
