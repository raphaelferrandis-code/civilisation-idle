// LA COLLECTE DU PEINTRE — dresser la liste de ce qui se dessine, sans rien dessiner.
//
// Sortie de `drawIsoLive` le 2026-08-23 (Q10). Onze passes de ramassage : bâti et
// habitations, arbres, bestioles, forêt sauvage, places, mobilier de trottoir,
// clôtures, merveilles, décor d'île, ponts, émeute. Chacune POUSSE des items ; aucune
// ne peint. Le tri par profondeur, lui, reste chez l'orchestrateur — c'est LUI qui
// donne son sens à la liste.
//
// ⚠ LE POOL VIENT AVEC, et c'est le point. `ISO_ITEM_POOL` garde ses objets d'une
// frame à l'autre (capacité conservée, zéro allocation en régime) et `ISO_ITEM_VIEW`
// en est la vue vidée à chaque tour. C'est l'état privé de cette collecte : le laisser
// dans le peintre aurait été laisser une mécanique sans son moteur.
//
// ⚠ Contexte destructuré en tête, même technique que le sol : les HUIT lectures vers
// l'englobante redeviennent des locales à leur nom — c'est ce qui a permis, le
// 2026-08-23, de reprendre les 386 lignes de l'époque SANS UNE LIGNE DE CHANGÉE (la
// collecte a évolué depuis). Aucune n'est réassignée — vérifié avant la coupe.
import { state } from '../../core/state.js';
import { vehicleLaneOffset } from '../agents.js';
import { CM, CM_WONDERS, cmEngineHomeHidden, cmHash, cmWonderActiveIds } from '../layout.js';
import { pixelHouseReady } from '../pixelHouses.js';
import { REVEAL_PIN_MS, SMOKE_TUNE, crisisSmokeShare } from './isoAmbient.js';
import { bridgeBlocks, bridgeGeoms, pushIsoBridgeItems } from './isoBridge.js';
import { pushIsoWonderItems } from './isoWonder.js';
import { isoEngineScenesFlag } from './isoEngineScene.js';
import { fenceStrip, isoFencesFor } from './isoFence.js';
import { isoFlatFootprint, isoFrontOffset } from './isoGroundDetail.js';
import { ISLAND_DECO, WATER_POINT_P, waterPointEra } from './isoGroundProps.js';
import { plaisirsReady, pushIsoPlaisirsItems } from './isoPlaisirs.js';
import {
  isoPlazaBox, isoPlazaBoxes, isoPlazaItems, isoPlazaKitOn, plazaEraForBand, personHT,
} from './isoPlaza.js';
import { fleetSceneItems } from './boatScenes.js';
import {
  isoLamps, isoStreetPropsFor, medianPlan, streetLampArt, streetPropEra, wildShrubActor,
} from './isoStreet.js';
import { streetKitFor } from './streetKits.js';
import { STREET_PROPS } from './isoStreetProps.js';
import { isoUnitDepth, isoUnitDepthEx, vehSortLift, vehSortWide, orderUnitsAroundVehicles, rioterLane } from './isoUnits.js';
import { WILD_THIN_UNIT, isoWildForest } from './isoWildForest.js';
import { treeBlockedIn } from './forestBake.js';
import { depthOf } from './projection.js';
import { districtMassTiles } from './isoDistricts.js';
import { vieActors } from './isoVie.js';
import { elevatedActors } from './isoElevated.js';
import { pushTerroirTeams } from './terroirLife.js';
import { figuresBeginFrame, noteFig, FIG } from '../figures.js';
import { chuteCollect } from './isoChute.js';

// Pool et vue des items du peintre (cf. commentaire dans drawIsoLive) —
// persistants au module : capacité conservée d'une frame à l'autre.
const ISO_ITEM_POOL = [];
const ISO_ITEM_VIEW = [];
// Jeton du verdict d'exclusion des arbres (places, terre-pleins, ponts), cf. plus bas.
let _blkTok = { pb: null, sg: null, bm: null };

export function collectIsoItems(bake, now) {
  // Registre des figures (figures.js) : la frame qui s'achève devient la référence.
  figuresBeginFrame();
  const portDepth = {};          // scène du port par poste (porteurs du ponton)
  const { T, L, b, band, dvVis, z, smokeK } = bake;
  const crisisP = crisisSmokeShare(state.instability);
  const items = ISO_ITEM_VIEW;
  items.length = 0;
  let itemN = 0;
  const pushItem = () => {
    let it = ISO_ITEM_POOL[itemN];
    if (!it) {
      it = ISO_ITEM_POOL[itemN] = {
        d: 0, kind: '', t: null, tr: null, p: null, v: null, w: null, wi: 0,
        moor: null, art: null, eraKey: '', axis: '', wx: 0, wy: 0, gx: 0, gy: 0,
        px: 0, py: 0, x0: 0, x1: 0, y0: 0, y1: 0, r: 0, i: 0, n: 0, pieces: null,
        // Le POINT MONDE qui a servi à la profondeur d'une unité (lu par
        // orderUnitsAroundVehicles et la chute). Déclaré ICI, dans la forme du pool,
        // parce que c'est tout l'objet du pool — une hidden class stable.
        gwx: 0, gwy: 0,
      };
    }
    itemN += 1;
    items.push(it);
    return it;
  };
  // Bâtiments (tuiles du layout) : maisons = sprite existant ; le reste = socle.
  for (const t of L.tiles) {
    // Révélation per-achat (parité legacy drawTile) : une maison-moteur du pool
    // pré-placé pas encore achetée reste MASQUÉE → « 1 achat = 1 bâtiment qui
    // apparaît » vaut aussi en iso (la ville n'est plus en avance sur les achats).
    if (cmEngineHomeHidden(t)) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const idf = t.buildingId || t.variant || '';
    // POINT D'EAU (ex-aqueducs) : une cellule, un prop du KIT DES PLACES. On ne
    // pousse qu'un item `plazaProp` — tout le dessin (art d'ère, ancrage sur
    // l'encre, ombre, découpe des halos) est celui des places. Cf. § POINTS
    // D'EAU plus haut ; l'ancienne conduite 3-slice a été retirée avec son art.
    // Cull sur la SEULE cellule : une 1×1 n'a pas le problème d'emprise qui
    // faisait disparaître les champs d'un bloc.
    if (/aqueduct/i.test(idf)) {
      if (t.gx < b.gx0 || t.gx > b.gx1 || t.gy < b.gy0 || t.gy > b.gy1) continue;
      if (!dvVis(t.gx * T, t.gy * T, (t.gx + 1) * T, (t.gy + 1) * T)) continue;
      const wEra = waterPointEra(band);
      const wx = (t.gx + 0.5) * T, wy = (t.gy + 0.5) * T;
      const it = pushItem();
      it.d = depthOf(wx, wy); it.kind = 'plazaProp'; it.eraKey = wEra;
      // `p` résolu ICI et pas à l'import : personHT() suit la molette d'échelle
      // des habitants, et une valeur figée au chargement ne la verrait jamais.
      // noShadow : PAS d'ellipse sombre au pied (refus Raph 2026-08-05, même
      // refus que sous un bâtiment). Le puits pose sa propre ombre portée dans
      // son sprite, lumière en haut à gauche — la doubler d'une flaque noire
      // marquait le contact au lieu de le régler.
      it.art = { prop: 'well', variant: null, wx, wy, noShadow: true,
        hT: personHT() * (WATER_POINT_P[wEra] || 1) };
      continue;
    }
    // Recouvrement d'EMPRISE (et non la seule cellule d'origine, dont la sortie
    // d'écran faisait disparaître d'un bloc un champ 10×6 encore aux 3/4 visible
    // — G.44 de l'audit), puis test exact contre le losange.
    if (t.gx + sx < b.gx0 || t.gx > b.gx1 || t.gy + sy < b.gy0 || t.gy > b.gy1) continue;
    if (!dvVis(t.gx * T, t.gy * T, (t.gx + sx) * T, (t.gy + sy) * T)) continue;
    // Empreintes À PLAT (champ) = SOL : elles ne se dressent pas → rien
    // ne doit passer DERRIÈRE elles. Profondeur au coin NORD (min wx+wy) et non au
    // coin sud : ainsi tout objet qui les chevauche (arbre/bâtiment/véhicule/piéton,
    // dont le pied a forcément une profondeur ≥ ce coin nord) se trie APRÈS → au-dessus.
    // Un socle (bâtiment volumétrique) garde son ancre au coin SUD (tri par les pieds).
    const flat = isoFlatFootprint(t);   // même identifiant que `idf`, mémorisé sur la tuile
    // FRONT DE RUE : le poussé décale l'ancre du sprite, donc il DOIT décaler sa
    // clé de tri du même geste — sinon un bâtiment avancé de 0,14 tuile vers la
    // rue se dessine devant son voisin mais se trie derrière lui. Une parcelle à
    // plat ne bouge pas (elle n'a pas de porte, cf. les allées de seuil).
    const fo = flat ? null : isoFrontOffset(t, L.roadMap);
    const d = flat ? depthOf(t.gx * T, t.gy * T)
      : depthOf((t.gx + sx + (fo ? fo.ox : 0)) * T, (t.gy + sy + (fo ? fo.oy : 0)) * T);
    { const it = pushItem(); it.d = d; it.kind = 'tile'; it.t = t; }
    // FUMÉE : item SÉPARÉ, juste derrière son bâtiment dans l'ordre du peintre —
    // elle doit passer sous le voisin situé au nord, pas par-dessus tout.
    if (smokeK > 0 && (t.type === 'house' || t.type === 'enginehome') && pixelHouseReady(t)) {
      if (t._smokeS === undefined) t._smokeS = cmHash('smk:' + t.gx + ':' + t.gy) >>> 0;
      if (t._smokeS % SMOKE_TUNE.share === 0) { const it = pushItem(); it.d = d + 0.001; it.kind = 'smoke'; it.t = t; }
    }
    // FUMÉE DE CRISE (isoAmbient) : colonne de suie, tirage FIXE par maison (le
    // même hash à chaque frame → une maison qui fume continue de fumer).
    if (crisisP > 0 && (t.type === 'house' || t.type === 'enginehome') && pixelHouseReady(t)) {
      if (t._crisisS === undefined) t._crisisS = cmHash('crs:' + t.gx + ':' + t.gy) >>> 0;
      if ((t._crisisS % 1000) < crisisP * 1000) { const it = pushItem(); it.d = d + 0.0012; it.kind = 'crisissmoke'; it.t = t; }
    }
    // CHEVRON « nouveau bâtiment » (A4) : item SÉPARÉ juste au-dessus du sien
    // (profondeur > fumée), le temps de REVEAL_PIN_MS après l'achat. Coupé par le
    // cran « Vie de la carte » comme la fumée ; pixelHouseReady garantit une boîte.
    if (t._revealPinAt && (CM.ambianceK ?? 1) > 0 && now - t._revealPinAt < REVEAL_PIN_MS && pixelHouseReady(t)) {
      items.push({ d: d + 0.002, kind: 'revealpin', t });
    }
    // PORT RIVERAIN : sa profondeur, pour les porteurs du ponton. Même test
    // « mouillé » que le rendu de la scène (cas riverain du switch).
    // (L'item 'portBoat' — le bateau de DÉCOR amarré, qui ne dessinait plus rien
    //  depuis que de vrais marchands accostent — est parti, audit du 05/10, MORT-6.)
    if (t.buildingId === 'river_ports' && t.type === 'engine' && isoEngineScenesFlag.on
      && L.river && L.river.present && L.river.cells) {
      let wet = false;
      for (let ax = 0; ax < sx && !wet; ax += 1) for (let ay = 0; ay < sy && !wet; ay += 1) {
        const k = (t.gx + ax) + ',' + (t.gy + ay);
        if (L.river.cells.has(k) || (L.river.banks && L.river.banks.has(k))) wet = true;
      }
      if (wet) {
        // Profondeur de la scène du port (bâtiment + ponton) : les porteurs du
        // ponton passent APRÈS elle, sinon le tablier les recouvre (cf. plus bas).
        portDepth[t.gx + ',' + t.gy] = d;
      }
    }
  }
  // LE LABOUREUR (docs/PLAN-TERROIR.md) : les attelages du terroir, chacun à sa
  // profondeur — sur la parcelle, donc toujours devant elle (triée au coin nord).
  const nT0 = items.length;
  pushTerroirTeams(items, L, band, now);
  // Lot 6 : les laboureurs et les moissonneurs dans le registre des figures — TOUS,
  // ceux qu'un passant évite hors champ compris. Mais seuls ceux du champ de vue vont
  // au peintre (audit du 05/10, PERF-45) : drawDraftIso et drawNamedAgentIso ne
  // cullent pas, et ombre, reflet et blit se payaient hors écran (3 par champ l'été).
  let nT = nT0;
  for (let i = nT0; i < items.length; i += 1) {
    const it = items[i], q = it.team;
    if (q) {
      noteFig(q.x * T, q.y * T, FIG.SCENE | (q.walking !== false ? FIG.MOVING : 0));
      if (!dvVis(q.x * T, q.y * T, q.x * T, q.y * T)) continue;
    }
    items[nT++] = it;
  }
  items.length = nT;
  // BATEAUX À QUAI (docs/PLAN-BATEAUX.md, lot 4) : un marchand amarré au ponton —
  // ou qui s'y range — est trié avec lui (pose calculée par drawIsoShips, plus tôt
  // dans la frame). Même contact visuel que le bateau-décor qu'il remplace.
  for (const sh of CM.ships || []) {
    const P = sh._defer;
    if (!P || P.at !== now) continue;
    // La navette des Plaisirs se range LE LONG du bout de son ponton (ou de l'escalier
    // de la Maison) : triée à son centre, derrière le ponton de la rive d'en face de
    // l'œil, devant celui de l'autre — avancée comme un marchand, elle couvrait le bout
    // du ponton et sa lanterne.
    const hb = sh.kind === 'shuttle' ? 0 : T * 0.30 * (sh._len || 1);
    // Au quai du TERMINAL (sh.quay) : sa scène le peint entre son quai et ses portiques
    // (isoPort.drawQuayShips) ; l'item, trié APRÈS elle, n'est que le repli.
    const qd = sh.quay != null ? portDepth[sh.quay] : null;
    const ds = isoUnitDepth(P.wx + hb, P.wy + hb);
    items.push({ d: qd == null ? ds : Math.max(ds, qd + 0.002), kind: 'fleetShip', sh });
    const pd = portDepth[sh.berthId];
    for (const q of sh._porters || []) {
      noteFig(q.x * T, q.y * T, FIG.PORT | (q.walking ? FIG.MOVING : 0));
      items.push({ d: Math.max(isoUnitDepth(q.x * T, q.y * T), pd == null ? -Infinity : pd + 0.003), kind: 'porter', q, band: sh._portersBand });
    }
  }
  // PETITES SCÈNES DU FLEUVE : embarcadères et voyageurs du passeur (iso/boatScenes.js).
  for (const it of fleetSceneItems(now, band)) {
    items.push(it);
    // Lot 6 : ceux qui attendent le bac, qui y montent ou en descendent.
    if (it.what === 'traveller') noteFig(it.x * T, it.y * T, FIG.SCENE | (it.walking ? FIG.MOVING : 0));
  }
  // REPÈRES CIVIQUES (isoDistricts) : les emprises de district deviennent des
  // pseudo-tiles moteur — même item 'tile', même peintre, même scène span-aware,
  // même survol. PAS de poussé de front (cf. le marqueur __district) : une masse
  // civique reste centrée sur son esplanade, elle ne se colle pas à la rue.
  const dMass = districtMassTiles(L);
  if (dMass) {
    for (const t of dMass) {
      if (t.gx + t.spanX < b.gx0 || t.gx > b.gx1 || t.gy + t.spanY < b.gy0 || t.gy > b.gy1) continue;
      if (!dvVis(t.gx * T, t.gy * T, (t.gx + t.spanX) * T, (t.gy + t.spanY) * T)) continue;
      const it = pushItem();
      it.d = depthOf((t.gx + t.spanX) * T, (t.gy + t.spanY) * T);
      it.kind = 'tile'; it.t = t;
    }
  }
  // Arbres (décor) — assez près de la ville seulement (le bake du sol couvre le
  // reste). AÉRATION (retour Raph « tout est trop collé ») : pas d'arbre décoratif
  // à moins de 1.5 cellule de la place ni à moins de 1 cellule d'un terre-plein
  // (ils chevauchaient la fontaine et les haies).
  // ⚠ TOUTES les places, pas seulement la centrale : les places de quartier ont
  // droit au même dégagement, sinon un arbre du décor vient chevaucher leur
  // mobilier.
  // (La règle vit dans forestBake.js : la forêt cuite dans le sol écarte les mêmes arbres.)
  const pbT = isoPlazaBoxes(L);
  const segsT = L.terrePlein || [];
  const treeBlocked = (gx, gy) => treeBlockedIn(pbT, segsT, gx, gy);
  // Emprise des PONTS (étendue « jusqu'au sec ») : aucun arbre/rocher dessus —
  // un rocher du décor mordait la culée au débouché (vu par Raph à la capture).
  // Le VERDICT (places, terre-pleins, ponts) ne dépend que du plan et des ponts : il
  // est mémorisé sur l'arbre (audit 2026-10-05, PERF-25 — recalculé pour chaque arbre
  // à chaque frame, 0,4 à 1,5 ms en vue large). Le jeton change avec l'un des trois.
  const bms = bridgeGeoms();
  if (_blkTok.pb !== pbT || _blkTok.sg !== segsT || _blkTok.bm !== bms) _blkTok = { pb: pbT, sg: segsT, bm: bms };
  const blkTok = _blkTok;
  const treeExcluded = (tr, wx, wy) => {
    if (tr._blkTok !== blkTok) { tr._blk = treeBlocked(tr.gx, tr.gy) || bridgeBlocks(wx, wy, T * 0.45); tr._blkTok = blkTok; }
    return tr._blk;
  };
  for (const tr of (L.trees || [])) {
    if (tr.gx < b.gx0 || tr.gx > b.gx1 || tr.gy < b.gy0 || tr.gy > b.gy1) continue;
    if (!dvVis(tr.gx * T, tr.gy * T, (tr.gx + 1) * T, (tr.gy + 1) * T)) continue;
    if (treeExcluded(tr, (tr.gx + 0.5) * T, (tr.gy + 0.5) * T)) continue;
    { const it = pushItem(); it.d = depthOf((tr.gx + 0.5) * T, (tr.gy + 0.9) * T); it.kind = 'tree'; it.tr = tr; }
  }
  // Bétail et animaux de rue : un item PAR BÊTE, à sa profondeur — un troupeau
  // trié en bloc verrait ses moutons de devant passer derrière ceux du fond.
  for (const cr of (L.critters || [])) {
    if (cr.gx < b.gx0 || cr.gx > b.gx1 || cr.gy < b.gy0 || cr.gy > b.gy1) continue;
    if (!dvVis(cr.gx * T, cr.gy * T, (cr.gx + 1) * T, (cr.gy + 1) * T)) continue;
    { const it = pushItem(); it.d = depthOf((cr.gx + 0.5 + cr.jx) * T, (cr.gy + 0.5 + cr.jy) * T); it.kind = 'critter'; it.cr = cr; }
  }
  // PETITE VIE (iso/isoVie.js) : ce qui se tient AU SOL — héron sur le quai, pigeons
  // sur la place, mouettes sur le parapet. Un item par acteur, à sa profondeur,
  // comme le bétail : sinon une maison de la rive d'en face se peint sous lui.
  for (const a of vieActors(now)) {
    // Hors du champ de vue (même marge que les passants, au pied de l'acteur) : pas
    // d'item (audit du 05/10, PERF-45 — le linge, ~55 fillRect par corde, se peignait
    // hors écran). Les fournisseurs ont déjà tenu leur registre (noteFig) ; le dessin
    // seul est sauté. Un acteur sans pied (wx indéfini) reste peint.
    if (!dvVis(a.wx, a.wy, a.wx, a.wy)) continue;
    // `d` imposé : ce qui se pose SUR un bâtiment (drapeau, pigeon de toit) passe juste
    // après lui, à sa clé + ε, et non à la profondeur de son propre pied.
    const it = pushItem(); it.d = a.d != null ? a.d : depthOf(a.wx, a.wy); it.kind = 'vie'; it.v = a;
  }
  // LES ÉTAGES DE LA VILLE (iso/isoElevated.js, docs/PLAN-ETAGES.md) : ce qui vit
  // AU-DESSUS du sol — trafic aérien, viaducs, métro. Même contrat que la petite vie.
  for (const a of elevatedActors(now)) {
    const it = pushItem(); it.d = a.d != null ? a.d : depthOf(a.wx, a.wy); it.kind = 'elev'; it.v = a;
  }
  // Forêt sauvage (ceinture autour de la ville, hors sol urbain) — cf. isoWildForest.
  // Culling aux bornes visibles ; le jitter (jx/jy) casse l'alignement sur la grille.
  // ÉCLAIRCIE AU DÉZOOM (opt-in, comparaison visuelle en cours) : sous
  // WILD_THIN_UNIT px de tuile, les arbres de la ceinture se chevauchent
  // largement et l'œil ne distingue plus les individus. En sauter une part
  // (choix STABLE par cellule, donc pas de scintillement au pan) libère le
  // premier poste de la frame. Réglage : window.__wildThin = fraction gardée
  // (1 = tout, 0.5 = un sur deux).
  const wildKeep = (import.meta.env?.DEV && typeof window !== 'undefined' && window.__wildThin != null) ? window.__wildThin : 1;
  const wildThinOn = wildKeep < 1 && T * z < WILD_THIN_UNIT;
  for (const wt of isoWildForest(L, b)) {
    if (wt.gx < b.gx0 || wt.gx > b.gx1 || wt.gy < b.gy0 || wt.gy > b.gy1) continue;
    if (!dvVis(wt.gx * T, wt.gy * T, (wt.gx + 1) * T, (wt.gy + 1) * T)) continue;
    if (wildThinOn) {
      // Rang STABLE par arbre (mémoïsé) : le même arbre est gardé ou écarté
      // d'une frame à l'autre — un tirage par frame ferait clignoter la forêt.
      let rk = wt._rk;
      if (rk === undefined) rk = wt._rk = (cmHash('wk:' + wt.gx + ':' + wt.gy) % 1000) / 1000;
      if (rk >= wildKeep) continue;
    }
    if (treeExcluded(wt, (wt.gx + 0.5 + wt.jx) * T, (wt.gy + 0.5 + wt.jy) * T)) continue;
    { const it = pushItem(); it.d = depthOf((wt.gx + 0.5 + wt.jx) * T, (wt.gy + 0.9 + wt.jy) * T); it.kind = 'tree'; it.tr = wt; }
  }
  // PLACE COMPOSÉE : un item PAR PROP, chacun trié à SA profondeur. C'est ce qui
  // permet à un passant de croiser un banc (l'ancienne image unique, le mode
  // 'scene' retiré le 2026-10-06, n'avait qu'une profondeur pour toute la place)
  // ET aux props de garder leur taille quand la place s'agrandit.
  if (isoPlazaBox(L) && plazaEraForBand(band) && isoPlazaKitOn(band)) {
    // Culling par une boîte d'UNE cellule autour du pied : un prop monte
    // au-dessus de son point d'ancrage, un test sur le point seul le ferait
    // disparaître au ras du bord haut de l'écran.
    // La même boîte autour de l'enveloppe d'une place : hors champ, elle est
    // sautée d'un bloc, flâneurs compris (PERF-48).
    isoPlazaItems(L, band, pushItem, (wx, wy) => dvVis(wx - T, wy - T, wx + T, wy + T), now,
      (wx0, wy0, wx1, wy1) => dvVis(wx0 - T, wy0 - T, wx1 + T, wy1 + T));
  }
  // MOBILIER DE TROTTOIR (bancs, bacs, corbeilles) : mêmes items `plazaProp` que
  // la place, donc même art et même tri — seule la POSE est à nous (isoStreetProps).
  // Sauté en LOD : au dézoom un banc fait moins d'un pixel, et ils sont nombreux.
  CM._streetPropsDrawn = 0;   // remis à zéro même quand la passe est sautée (un compteur qui garde son dernier chiffre ment)
  if (!CM.lodActive && STREET_PROPS.on) {
    const sp = isoStreetPropsFor(L, band);
    let nSp = 0;
    // Sous ~2 px de haut, un banc n'est plus qu'un point : on ne le pousse même
    // pas dans le tri. Sans ce seuil, une mégapole en vue large empilait des
    // centaines d'items (mesuré 334) que drawIsoPlazaProp jetait un à un.
    const minH = 2 / (T * CM.cam.zoom);
    for (const rec of sp) {
      if (rec.hT < minH) continue;
      if (!dvVis(rec.wx - T, rec.wy - T, rec.wx + T, rec.wy + T)) continue;
      const it = pushItem();
      it.d = rec.d; it.kind = 'plazaProp'; it.art = rec; it.eraKey = streetPropEra(band);
      nSp += 1;
    }
    CM._streetPropsDrawn = nSp;
  }
  // CLÔTURES : même art, même tri et même seuil que le mobilier ci-dessus (elles
  // sortent du même kit de place). Sautées en LOD pour la même raison — au dézoom un
  // panneau fait moins d'un pixel, et ils sont quelques centaines.
  CM._fencesDrawn = 0;
  if (!CM.lodActive) {
    const fen = isoFencesFor(L, band);
    let nF = 0;
    const minHF = 2 / (T * CM.cam.zoom);
    const fEra = plazaEraForBand(band);
    for (const rec of fen) {
      if (rec.hT < minHF) continue;
      if (!dvVis(rec.wx - T, rec.wy - T, rec.wx + T * 2, rec.wy + T * 2)) continue;
      // La bande est cuite à la demande : tant que le PNG n'est pas décodé, on ne
      // pousse rien (et on ne met rien en cache) — le panneau apparaîtra au décodage.
      // Gardée sur l'enregistrement pour son ère (PERF-46 : une clé en chaîne par
      // panneau et par frame) ; le cache des bandes ne se vide jamais.
      let strip = rec._stripEra === fEra ? rec._strip : null;
      if (!strip) {
        strip = fenceStrip(rec.side, fEra, rec.per);
        if (!strip) continue;
        rec._strip = strip; rec._stripEra = fEra;
      }
      const it = pushItem();
      it.d = rec.d; it.kind = 'fence'; it.art = strip; it.wx = rec.wx; it.wy = rec.wy;
      nF += 1;
    }
    CM._fencesDrawn = nF;
  }
  // MERVEILLES au TRI PEINTRE (refaites le 2026-10-02, docs/PLAN-MERVEILLES.md) :
  // cuites en iso et découpées en TRANCHES, chacune triée au bord avant de son
  // socle (iso/isoWonder.js) — les badauds attroupés au sud passent devant, ceux
  // du nord disparaissent derrière, à toutes les colonnes. Naissance comptée ici
  // (érection animée, sommeil).
  // L'Aiguille dessine son îlot (wonderIsle.js) : relevé ici, frame par frame.
  CM.wonderIsle = false;
  if (Array.isArray(state.wonders)) {
    const activeW = cmWonderActiveIds(state);
    const pvW = CM.previewWonder;   // aperçu dev (__showWonder) : force le rendu
    for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
      const w = CM_WONDERS[wi];
      if (activeW.has(w.id) || (pvW && pvW.id === w.id)) {
        if (!CM.born['wonder:' + w.id]) CM.born['wonder:' + w.id] = now;
        pushIsoWonderItems(items, w, wi);
      } else if (CM.born['wonder:' + w.id]) {
        delete CM.born['wonder:' + w.id];
      }
    }
  }
  // LA MAISON DES PLAISIRS, au tri peintre comme les merveilles : construite par
  // le code (refonte du 2026-10-02), découpée en TRANCHES triées au bord avant de
  // son pied — un bateau passe devant la façade qu'il longe, derrière celle qu'il
  // contourne.
  {
    const pl = L.river && L.river.plaisirs;
    if (pl && plaisirsReady()) pushIsoPlaisirsItems(items, pl, now);
    // Rien à peindre cette frame (pas de fleuve, donc pas de monument) : on
    // PÉRIME la boîte. Sans ça elle survivait à un effondrement qui redessine
    // une ville sans fleuve, et un carré d'écran restait cliquable dans le vide.
    else CM._plaisirsBox = null;
  }
  // FOYER DU CAMPEMENT (2026-09-28, cf. CAMP_HEARTH dans layout.js). DEUX items
  // depuis le 2026-10-03 (Raph : « le sol du feu de camp doit être du sol, pas un
  // bâtiment ») : le SOL (disque de terre, souches, pots) trié au coin NORD de
  // l'anneau de 3 × 3 — comme un champ : tout ce qui marche ou se dresse dessus
  // passe par-dessus —, et la FLAMME, seule debout, à la profondeur du centre.
  // Littéraux (comme les items de pont) : le pool a une forme figée.
  if (L.campHearth) {
    const h = L.campHearth;
    if (dvVis((h.gx - 0.5) * T, (h.gy - 0.5) * T, (h.gx + 1.5) * T, (h.gy + 1.5) * T)) {
      const wx = (h.gx + 0.5) * T, wy = (h.gy + 0.5) * T;
      items.push({ d: depthOf((h.gx - 1) * T, (h.gy - 1) * T), kind: 'campHearth', part: 'ground', wx, wy });
      items.push({ d: depthOf(wx, wy), kind: 'campHearth', part: 'fire', wx, wy });
    }
  }
  // LAMPADAIRES : mâts de l'ère le long des routes (liste déterministe
  // isoLamps), posés au peintre ; leurs halos de nuit se dessinent dans
  // drawIsoNight à la MÊME position (points lumineux ancrés, retour Raph).
  // Réverbère du kit de l'ère ; null sans kit (bandes 0-1, où isoLamps est vide).
  if (!CM.lodActive) {
    const lampArt = streetLampArt(band);
    if (lampArt) {
      for (const lp of isoLamps(L, band)) {
        if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
        if (!dvVis(lp.wx, lp.wy, lp.wx, lp.wy)) continue;
        // lp.d = clé précalculée (computeIsoLamps) : pied wx+wy, REMONTÉE devant le
        // bâtiment mitoyen quand le mât longe sa façade sud/est (sinon avalé).
        // gx/gy suivent le mât jusqu'ici : c'est d'eux que sort la PHASE de
        // scintillement de son halo, déposé dans la foulée du sprite.
        { const it = pushItem(); it.d = lp.d; it.kind = 'lamp'; it.wx = lp.wx; it.wy = lp.wy; it.gx = lp.gx; it.gy = lp.gy; it.art = lampArt; }
      }
    }
  }
  // TERRE-PLEIN : le sol est dans le BAKE ; ici, les plantations de l'ère (kit,
  // streetKits.js, 2026-10-02), dessinées par le code, là seulement où la ville
  // borde le terre-plein (medianPlan) ; les mâts du plan passent par isoLamps.
  // Chaque plantation se dessine elle-même. (Les buissons PNG d'avant le kit,
  // alternés avec les parterres du bake — medianSlots —, retirés le 2026-10-06.)
  const kitT = streetKitFor(band);
  if (!CM.lodActive && kitT && kitT.median) {
    for (const sg of (L.terrePlein || [])) {
      if (sg.axis === 'v') {
        if (sg.x + 1 < b.gx0 - 1 || sg.x + 1 > b.gx1 + 1) continue;
        if (sg.y1 < b.gy0 - 2 || sg.y0 > b.gy1 + 2) continue;
      } else {
        if (sg.y + 1 < b.gy0 - 1 || sg.y + 1 > b.gy1 + 1) continue;
        if (sg.x1 < b.gx0 - 2 || sg.x0 > b.gx1 + 2) continue;
      }
      for (const sl of medianPlan(L, sg, T, kitT)) {
        if (!sl.urban || sl.kind === 'lamp') continue;
        const it = pushItem(); it.d = depthOf(sl.wx, sl.wy); it.kind = 'vie'; it.v = sl;
      }
    }
  }
  // ── L'ÎLE QUE PERSONNE N'ENTRETIENT ─────────────────────────────────────────
  // Demande de Raph (2026-07-30), en même temps que le sillage : « peut-être du
  // décor dessus, petit caillou ou autre chose qu'on ait déjà ». Les CAILLOUX
  // n'existent plus : le mode `rocks` a été retiré de sliceCainosPlants avec ses
  // PNG, après deux refus (pierres plates « en tuile » dans l'herbe, puis blocs
  // ronds). On prend donc ce qui reste et qui dit la bonne chose : des BUISSONS.
  //
  // Et ils disent précisément la bonne : l'île est le socle d'une merveille où
  // l'on ne débarque jamais (Raph : « je veux que ça reste une île inaccessible »).
  // De la végétation qui repousse sur le sable, c'est le seul décor qui raconte
  // qu'aucune main ne passe là — un banc, une barrière ou un sentier diraient
  // l'inverse. Aucun sur le tiers central : la merveille y est posée.
  //
  // Placement par HASH de la position de l'île, donc stable d'une frame à l'autre
  // et d'une session à l'autre — un décor qui se retire au hasard chaque recompute
  // scintillerait à chaque recalcul de plan.
  // Les buissons de l'îlot n'ont plus de place quand l'Aiguille y bâtit son quai.
  if (!CM.lodActive && ISLAND_DECO.on && !CM.wonderIsle) {
    for (const il of ((L.river && L.river.islands) || [])) {
      for (let k = 0; k < ISLAND_DECO.count; k += 1) {
        const h = cmHash('ideco:' + Math.round(il.x * 4) + ':' + Math.round(il.y * 4) + ':' + k) >>> 0;
        const a = ((h % 1000) / 1000) * Math.PI * 2;
        // Rayon normalisé tenu vers le BORD : au centre il y a la merveille, et
        // c'est de toute façon le pourtour d'une île de rivière qui se végétalise.
        const rr = ISLAND_DECO.rMin + (((h >>> 10) % 1000) / 1000) * (ISLAND_DECO.rMax - ISLAND_DECO.rMin);
        const al = Math.cos(a) * il.rx * rr, cr = Math.sin(a) * il.ry * rr;
        const wx = (il.x + al * il.tx - cr * il.ty) * T;
        const wy = (il.y + al * il.ty + cr * il.tx) * T;
        const gx = wx / T, gy = wy / T;
        if (gx < b.gx0 - 2 || gx > b.gx1 + 2 || gy < b.gy0 - 2 || gy > b.gy1 + 2) continue;
        // Buisson dessiné par le code, au grain de la ville (iso/streetKits.js,
        // 2026-10-03) : ombre solaire, vent.
        const it = pushItem(); it.d = depthOf(wx, wy); it.kind = 'vie';
        it.v = wildShrubActor(wx, wy, h >>> 3, 1 + ((h >>> 20) % 3));
      }
    }
  }
  // PONTS : platelage + verticalité, segments PAR CELLULE au tri peintre —
  // le platelage au coin nord (tout ce qui le chevauche passe dessus), les
  // parapets devant les jambes des traverseurs, le tout derrière/devant les
  // bâtiments voisins selon la profondeur. Seule l'ombre reste en passe
  // globale (drawIsoBridgeUnder, avant les bateaux). Cf. isoBridge.js.
  pushIsoBridgeItems(items, b, now);
  // Habitants : clé aux PIEDS, remontée devant les murs mitoyens (isoUnitDepth).
  if (!CM.lodActive) {
    for (const p of CM.citizens) {
      if (p._nightHidden) continue;
      const pwx = p.x + (p.lox || 0), pwy = p.y + (p.loy || 0);
      // Cull écran ABSENT jusqu'ici en iso (le legacy l'avait) : jusqu'à 450
      // piétons hors champ payaient tri + drawImage à chaque frame.
      if (!dvVis(pwx, pwy, pwx, pwy)) continue;
      noteFig(pwx, pwy, FIG.STREET | ((p.pauseT || 0) > 0 ? 0 : FIG.MOVING));
      { const it = pushItem(); it.d = isoUnitDepthEx(pwx, pwy).d; it.gwx = pwx; it.gwy = pwy; it.kind = 'cit'; it.p = p; }
    }
    // Véhicules : mêmes règles (drones = passe aérienne, plus tard). La
    // carrosserie est dessinée CENTRÉE sur l'ancre (drawIsoVehicle) : son
    // contact sol VISUEL tombe ~0.30·hauteur plus bas à l'écran → le point de
    // TRI est déplacé à ce contact (+h monde sur chaque axe = +0.60·taille·T
    // de profondeur), sinon un piéton derrière la carrosserie se dessinait
    // par-dessus (z-fight sur ~0.4 tuile, ~0.8 pour le tram).
    for (const v of CM.vehicles) {
      if (v.type === 'drone') continue;
      const lo = vehicleLaneOffset(v, T);
      if (!dvVis(v.x + lo.x, v.y + lo.y, v.x + lo.x, v.y + lo.y)) continue;
      // Contact au sol MESURÉ sur l'image servie, à la taille dessinée (isoUnits).
      const h = vehSortLift(v, T);
      // La CAISSE s'étend le long de l'axe de marche (même demi-longueur que la
      // colonne, vehSortWide) : « devant un mur » se juge sur toute la caisse (cf.
      // isoUnitDepthEx). Le porteur de panier est un passant : un point.
      { const gwx = v.x + lo.x + h, gwy = v.y + lo.y + h;
        const w = vehSortWide(v, T), e = v.type === 'basket' ? 0 : w, alongX = v.dir === 0 || v.dir === 1;
        const it = pushItem(); it.d = isoUnitDepthEx(gwx, gwy, w, alongX ? e : 0, alongX ? 0 : e).d; it.gwx = gwx; it.gwy = gwy; it.kind = 'veh'; it.v = v; }
    }
  }
  // ÉMEUTE : émeutiers dans le TRI PEINTRE (clé pieds + offsets de file, comme
  // les habitants) — poussés MÊME au LOD (le signal de crise doit rester
  // visible, parité legacy). La sim tourne dans drawIsoWorld (updateCrisis).
  // + ceux qui s'effacent à la fin de l'émeute (lot 4, CM.riotFading).
  const riotPts = CM.riotDraw ? (CM.riotFading && CM.riotFading.length ? [...CM.riotDraw.pts, ...CM.riotFading] : CM.riotDraw.pts)
    : (CM.riotFading && CM.riotFading.length ? CM.riotFading : null);
  if (riotPts) {
    for (const p of riotPts) {
      const ln = rioterLane(p);
      const laneX = ln.x, laneY = ln.y;
      { const gwx = p.x + laneX, gwy = p.y + laneY;
        noteFig(gwx, gwy, FIG.RIOT | FIG.MOVING);
        items.push({ d: isoUnitDepthEx(gwx, gwy).d, gwx, gwy, kind: 'riot', p }); }
    }
  }
  // Passants et émeutiers qui recoupent un véhicule : rangés selon le sol du véhicule
  // à leur colonne (une seule clé ne vaut pas sur toute sa longueur, cf. isoUnits).
  orderUnitsAroundVehicles(items, T);
  // LA CHUTE (iso/isoChute.js) : la ville se vide sous la vague ; les ruines du cycle
  // précédent entrent dans le tri, et la forêt neuve ne pousse pas dedans.
  chuteCollect(items, L);
  return items;
}
