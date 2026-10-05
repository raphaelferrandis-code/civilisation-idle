// LE DESSIN DU PEINTRE — parcourir la liste triée, et peindre.
//
// Sortie de `drawIsoLive` le 2026-08-23 (Q10). Un aiguillage sur `it.kind` :
// bâtiments et habitations, arbres, bestioles, mobilier et dalles de place, fumée,
// chevron, merveilles, Maison des Plaisirs, lampadaires, clôtures, buissons, tabliers
// de pont, bateau du port, véhicules, émeutiers. Plus la GREFFE WebGL des longues
// séries, la passe FANTÔME et la fermeture de la couche lumière.
//
// ⚠ TROIS PHASES PARTENT ENSEMBLE, ET C'ÉTAIT LA CONDITION. La préparation, la boucle
// et la composition se partagent l'ÉTAT DES LOTS GPU (`glPending`, `glRuns`,
// `glSprites`, la boîte englobante `gbx0..gby1`) — un état RÉASSIGNÉ, donc
// indéplaçable seul (cf. P28 du plan : une liaison importée est en lecture seule).
// En les emmenant d'un bloc, l'état voyage avec ses écritures et la contrainte
// disparaît. Même motif que l'état de saison et la couche de marche, ailleurs dans
// ce chantier.
//
// ⚠ LA GREFFE GL EN DEUX MOTS, parce qu'elle explique la forme du code : l'ordre du
// peintre entrelace sprites et procédural, et composer à chaque alternance serait
// ruineux. Mais la distribution est très inégale — deux séries (les ceintures
// forestières) portent la moitié des sprites au dézoom. On ne bascule donc que les
// séries LONGUES, et leur composition tombe À SA PLACE dans la file : la profondeur
// est préservée.
//
// ⚠ Contexte destructuré en tête : les onze lectures vers l'englobante redeviennent
// des locales à leur nom, si bien que les 461 lignes sont reprises SANS UNE LIGNE DE
// CHANGÉE. `items` et `now` restent des paramètres nommés — ce sont les deux vraies
// entrées de la passe : la liste, et l'instant.
import { state } from '../../core/state.js';
import { AGENT_SCALE } from '../agents.js';
import { drawCritterIso } from '../critters.js';
import { pxProbe, recPx } from '../pixelGrid.js';
import { fp } from '../framePerf.js';
import { glBegin, glFlush, glGetCanvas, glInit, glQuad } from '../glPainter.js';
import { CM, cmHash, treeBandMul, treeCanvasT } from '../layout.js';
import {
  LIGHT_LAYER, beginLightLayer, endLightLayer, lightCtx, lightCut, lightCutImage, lightCutLive,
} from '../lightLayer.js';
import {
  drawPixelHouse, drawPixelHouseOutline, drawPixelHouseSunShadow, pixelHouseBox, pixelHouseReady,
} from '../pixelHouses.js';
import { drawIsoCrisisSmoke, drawIsoRevealPin, drawIsoSmoke } from './isoAmbient.js';
import { vieTreeSway } from './isoVie.js';
import { isoArt } from './isoArt.js';
import { drawIsoBridgeSeg } from './isoBridge.js';
import { drawIsoWonderSeg } from './isoWonder.js';
import { drawIsoCampHearthGround, drawIsoCampHearthFire } from './isoCampHearth.js';
import { drawIsoEngineScene, isoEngineScenesFlag } from './isoEngineScene.js';
import { drawIsoField, drawIsoFieldPixel } from './isoField.js';
import { drawIsoMill } from './isoMill.js';
import { drawTerroirTeam } from './terroirLife.js';
import { isoFlatFootprint, isoFrontOffset, isoWetFootprint, seasonTree } from './isoGroundDetail.js';
import { ISO_TREE_VARIANTS, TREE_DEAD_VARIANT, TREE_SPRITES, cityTreeVariant, drawIsoGroundedArt, treeAliveVariant, treeSpriteK } from './isoGroundProps.js';
import { maskHit } from './isoMask.js';
import { HOVER_GOLD, rgb } from './isoPalette.js';
import { drawIsoPlaisirsSeg } from './isoPlaisirs.js';
import { FA_V, FOUNTAIN_ANIM, FOUNTAIN_TUNE, drawIsoPlazaGrid, drawIsoPlazaProp } from './isoPlaza.js';
import { drawIsoPortBoat, drawIsoRiverside, drawIsoShipDeferred } from './isoPort.js';
import { drawDockPorter } from './boatBerths.js';
import { drawFleetScene } from './boatScenes.js';
import {
  isoLampLightFrame, lampBox, lampGlowBox, lampLit, paintLampGlow,
} from './isoStreet.js';
import { drawSunShadow, muteSunShadow } from './isoSunShadow.js';
import { GHOST_TUNE, drawIsoCitizenItem, drawIsoRioter, drawIsoVehicle } from './isoUnits.js';
import { GL_RUN_MIN } from './isoWildForest.js';
import { ISO_X, worldToScreen } from './projection.js';
import { WINTER } from '../seasonMode.js';
import { chuteTileState } from './chuteState.js';
import { paintHouseFall } from './isoChuteScene.js';
import { paintRelic, chuteGone } from './isoChute.js';

// ── Drawables triés au peintre (profondeur = wx + wy) ────────────────────────
function drawTreeIso(ctx, sx, sy, h) {
  // Sapin minimal Phase 1 : tronc + 2 étages de feuillage, ombre portée SE.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(sx + h * 0.16, sy, h * 0.30, h * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d4630';
  ctx.fillRect(sx - h * 0.045, sy - h * 0.22, h * 0.09, h * 0.22);
  ctx.fillStyle = '#3f5a35';
  ctx.beginPath(); ctx.moveTo(sx, sy - h); ctx.lineTo(sx + h * 0.34, sy - h * 0.36); ctx.lineTo(sx - h * 0.34, sy - h * 0.36); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a6a3e';
  ctx.beginPath(); ctx.moveTo(sx, sy - h * 0.72); ctx.lineTo(sx + h * 0.42, sy - h * 0.16); ctx.lineTo(sx - h * 0.42, sy - h * 0.16); ctx.closePath(); ctx.fill();
}

const HOUSE_BOX_CAP = 4000;            // garde-fou mémoire, jamais atteint en jeu

// LE SURVOL AU SOL — le losange de la cellule visée, tracé AVANT le peintre parce
// qu'il est au sol : tout ce qui est debout doit pouvoir passer devant.
//
// Rentré ici le 2026-08-23 (Q10) plutôt que de faire un module de 38 lignes : ce
// fichier portait déjà l'autre moitié du survol (`HOVER_GOLD` et le liseré des
// silhouettes), et les deux noms dont le corps a besoin — `CM`, `worldToScreen` — y
// étaient déjà importés des mêmes sources. ZÉRO import nouveau : la pièce était due.
//
// ⚠ Le survol reste RÉPARTI EN TROIS, et c'est voulu : chaque liseré vit avec ce
// qu'il entoure — les scènes moteur dans isoEngineScene, les habitations et la
// Maison des Plaisirs dans la boucle ci-dessous, et le sol ici. Les rassembler
// obligerait à sortir des one-liners du milieu de leurs boucles, avec leurs locales :
// ce ne serait plus un déplacement pur, et on y perdrait plus qu'on n'y gagnerait.
// CM.hover (posé par cityMapShowTooltip) porte enfin la tuile et la cellule
// visées : il était écrit deux fois et relu nulle part. On s'en sert pour
// répondre à « qu'est-ce que l'infobulle est en train de décrire ? », par un
// liseré sur la silhouette et un trait sur le losange au sol.
const HOVER_CELL = 'rgba(232,198,110,0.7)';

export function drawIsoHoverCell(ctx, hw, hh) {
  const h = CM.hover;
  if (!h || !h.cell) return;
  const c = h.cell.split(',');
  const gx = +c[0], gy = +c[1];
  // ⚠ L'EMPREINTE ENTIÈRE, pas une cellule. `cell` porte le coin NORD du lot ;
  // un bâtiment de 2×2 ou 3×2 voyait donc son losange tracé sur la seule case
  // d'origine, celle qui est la PLUS ÉLOIGNÉE à l'écran — on croyait voir « la
  // case derrière le bâtiment s'allumer », alors que c'était bien la sienne,
  // mais réduite à son coin nord. Les habitations tiennent sur une case, d'où
  // un défaut invisible sur elles et criant sur les moteurs.
  const t = h.tile;
  const spanX = (t && (t.spanX || t.size)) || 1;
  const spanY = (t && (t.spanY || t.size)) || 1;
  const T = CM.TILE;
  const n = worldToScreen(gx * T, gy * T);                     // coin nord
  const e = { x: n.x + spanX * hw, y: n.y + spanX * hh };      // est
  const s = { x: n.x + (spanX - spanY) * hw, y: n.y + (spanX + spanY) * hh };
  const w = { x: n.x - spanY * hw, y: n.y + spanY * hh };      // ouest
  ctx.save();
  ctx.strokeStyle = HOVER_CELL;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(n.x, n.y);
  ctx.lineTo(e.x, e.y);
  ctx.lineTo(s.x, s.y);
  ctx.lineTo(w.x, w.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function paintIsoItems(bake, items, now) {
  const { ctx, T, z, hw, hh, L, houseBoxes, band, eraIdx, smokeK } = bake;
  // ── GREFFE WebGL DES LONGUES SÉRIES ─────────────────────────────────────────
  // L'ordre du peintre entrelace sprites et procédural : composer à chaque
  // alternance serait ruineux (572 alternances mesurées au dézoom). Mais la
  // distribution est très inégale — au dézoom, DEUX séries (les ceintures
  // forestières nord et sud) portent à elles seules 2 975 des 5 401 sprites.
  // On ne bascule donc en GL que les séries LONGUES : elles partent en un seul
  // appel de dessin, et leur composition tombe à SA PLACE dans la file, donc
  // l'ordre du peintre est rigoureusement conservé. Tout le reste garde le
  // chemin Canvas 2D, inchangé.
  // ⚠ OPT-IN (window.__glPainter = true) — VERDICT MESURÉ du 28/07, poste de dev :
  //  • gain nul (×1,02, dans le bruit) : au dézoom les arbres sont MINUSCULES,
  //    leur `drawImage` coûte déjà presque rien, et la composition du lot mange
  //    ce qu'on économise. Le banc __glBench dit pourtant ×12,7 à 12 000
  //    sprites : le batcher est bon, c'est la MATIÈRE qui manque ici — le vrai
  //    poids de `vif-peinture` est le dessin VECTORIEL (scènes, ponts, champs),
  //    pas les sprites (cf. cartographie : « les blits ne coûtent rien »).
  //  • écart de rééchantillonnage : 3,7 % des pixels (plancher de bruit 0,6 %),
  //    invisible à l'œil mais réel — GL et Canvas 2D ne choisissent pas les
  //    mêmes texels quand un sprite est redimensionné.
  // La bascule redeviendra intéressante quand le procédural sera devenu des
  // sprites (cache de scènes actif, ponts et champs cuits) : la matière sera là.
  // À re-mesurer sur la machine de JEU, dont le GPU sature sur le NOMBRE
  // d'appels — le profil qui, lui, favorise le batcher.
  const profParts = !!globalThis.__isoProfParts;   // pesée fine, cf. plus haut
  // SPRITES D'ARBRE RÉSOLUS UNE FOIS PAR FRAME (et non par arbre). Mesuré à
  // dézoom : les arbres pesaient 12,7 ms sur 34, soit le premier poste de la
  // frame — et l'essentiel n'était pas le blit mais ce qui l'entoure, refait
  // pour CHACUN des 4 648 arbres : un hash de chaîne pour la variante, une
  // recherche de sprite par concaténation, une résolution de teinte
  // saisonnière. Or tout cela ne dépend que de la VARIANTE (une trentaine, cf.
  // TREE_SPRITES) : on le résout une fois par frame, et chaque arbre n'a plus
  // qu'à lire son entrée.
  const treeMemo = typeof window === 'undefined' || window.__treeMemo !== false;
  // Le sapin mort n'a sa place qu'en hiver et dans les ruines (TREE_DEAD_VARIANT).
  const deadTreeOk = (CM.season | 0) === WINTER || !!CM.frameRuined;
  const treeImgs = [];
  for (let tv = 1; tv <= ISO_TREE_VARIANTS; tv += 1) {
    const nm = TREE_SPRITES[tv].name, a = isoArt(nm);
    treeImgs[tv] = a.ready ? (seasonTree(a, nm) || a.img) : null;
  }
  const glWanted = (typeof window !== 'undefined' && window.__glPainter === true) && items.length >= GL_RUN_MIN * 2;
  const glOn = glWanted && glInit();
  let glPending = 0, glRuns = 0, glSprites = 0;
  if (glOn) {
    for (const it of items) it._gl = 0;
    let start = -1;
    for (let i = 0; i <= items.length; i += 1) {
      const it = i < items.length ? items[i] : null;
      // Seuls les kinds à sprite ENTIER et sans géométrie vectorielle sont
      // éligibles : un arbre/buisson = un blit, rien d'autre.
      const q = !!it && (it.kind === 'tree' || it.kind === 'bush');
      if (q) { if (start < 0) start = i; continue; }
      if (start >= 0 && i - start >= GL_RUN_MIN) { for (let k = start; k < i; k += 1) items[k]._gl = 1; glRuns += 1; }
      start = -1;
    }
    if (glRuns) glBegin(CM.cw, CM.ch, CM.dpr || 1);
  }
  // Emprise écran du lot courant : composer PLEIN ÉCRAN coûterait plus cher que
  // les sprites économisés (une ceinture forestière, ce sont des milliers de
  // sprites minuscules — 1,3 Mpx au total — contre 1,5 Mpx par composition
  // plein cadre). On ne recopie donc que le rectangle réellement couvert.
  let gbx0 = 1e9, gby0 = 1e9, gbx1 = -1e9, gby1 = -1e9;
  const glCompose = () => {
    if (!glPending) return;
    glSprites += glFlush();
    const dpr = CM.dpr || 1;
    const x0 = Math.max(0, Math.floor(gbx0)), y0 = Math.max(0, Math.floor(gby0));
    const x1 = Math.min(CM.cw, Math.ceil(gbx1)), y1 = Math.min(CM.ch, Math.ceil(gby1));
    if (x1 > x0 && y1 > y0) {
      const prevS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(glGetCanvas(),
        Math.round(x0 * dpr), Math.round(y0 * dpr), Math.round((x1 - x0) * dpr), Math.round((y1 - y0) * dpr),
        x0, y0, x1 - x0, y1 - y0);
      ctx.imageSmoothingEnabled = prevS;
    }
    glPending = 0;
    gbx0 = 1e9; gby0 = 1e9; gbx1 = -1e9; gby1 = -1e9;
    glBegin(CM.cw, CM.ch, CM.dpr || 1);   // repart d'un cadre vierge
  };
  // HALO d'émeute : nappe rouge pulsée AU SOL, sous toute la scène vivante (le
  // cercle écran du legacy devient une ellipse iso 2:1). Mêmes rayon et alphas.
  if (CM.riotDraw) {
    const c = worldToScreen(CM.riotDraw.cx, CM.riotDraw.cy);
    const pulse = 0.5 + 0.5 * Math.sin(now / 320);
    const R = Math.max(1, (1.6 + (state.instability || 0) * 1.4) * T * z);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, 0.5);                               // disque couché au sol (losange 2:1)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(200,40,30,${(0.16 + 0.12 * pulse).toFixed(2)})`);
    g.addColorStop(1, 'rgba(200,40,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const prevSmooth = ctx.imageSmoothingEnabled;
  // COUCHE DE LUMIÈRE : armée pour toute la durée du peintre. Les lampes y
  // déposent leur halo à leur place dans le tri, les sprites peints ensuite y
  // découpent leur silhouette. Désarmée juste après la boucle — rien de ce qui
  // suit (oiseaux, drones, voile) n'a de profondeur à faire valoir. Sous une
  // tuile de LIGHT_LAYER.minUnit pixels on y renonce (halos minuscules, découpes
  // innombrables) et la passe de nuit repeint les halos en direct, comme avant.
  const lampK = beginLightLayer(T * z >= LIGHT_LAYER.minUnit) ? isoLampLightFrame(L) : null;
  // Ancre ÉCRAN d'un bâtiment : coin SUD de l'empreinte (point monde (gx+spanX,
  // gy+spanY)), DÉCALÉE vers la façade sur rue (cf. FRONT ; une rangée, elle, recule
  // derrière son trottoir) : sans ça le bâtiment flotte au milieu de son lot et la
  // rue n'a pas de mur. Le même décalage est appliqué à la clé de tri, plus haut —
  // les deux ne se séparent jamais. La fumée, la fumée de crise et le chevron la
  // reprennent : avec le coin nu, ils sortaient à côté de la cheminée.
  // ⚠ Les REPÈRES CIVIQUES (pseudo-tiles de district, __district) ne prennent
  // PAS le poussé de front : la masse reste centrée sur son esplanade — et la
  // collecte a trié sans offset, l'ancre doit suivre le même contrat.
  const tileAnchor = (t, spanX, spanY) => {
    const fOff = (t.__district || isoFlatFootprint(t)) ? null : isoFrontOffset(t, L.roadMap);
    return worldToScreen((t.gx + spanX + (fOff ? fOff.ox : 0)) * T, (t.gy + spanY + (fOff ? fOff.oy : 0)) * T);
  };
  for (const it of items) {
    // Un item NON basculé doit être peint APRÈS le lot en cours : on compose
    // d'abord, sinon la série GL passerait par-dessus lui.
    if (glPending && !it._gl) glCompose();
    // Les RUINES du cycle précédent (iso/isoChute.js), triées à leur profondeur.
    if (it.kind === 'relic') { paintRelic(ctx, it); continue; }
    if (it.kind === 'tile') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      const anchor = tileAnchor(t, spanX, spanY);   // poussé / recul de front compris
      // `t.body` : un atelier logé dans une rangée (corps de maison, cf. layout.js).
      const isHouse = t.type === 'house' || t.type === 'enginehome' || !!t.body;
      // Bâtiment RIVERAIN (port : l'empreinte mord la berge/l'eau) : scène iso
      // DÉDIÉE (drawIsoRiverside — bâtiment sur berge, ponton vers le ruban,
      // bateau amarré). Ni scène-boîte legacy ni socle : la boîte legacy
      // embarque son eau en repère carré (bassin flottant, vu à la capture).
      // Les CHAMPS ont un rendu À PLAT dédié (parcelle à sillons, plus bas) et
      // DOIVENT s'afficher même si leur emprise mord la berge : on les exclut du
      // cull « mouillé », sinon ils disparaissaient (branchement iso oublié).
      // Seuls les moteurs « en bloc » sont culés au-dessus de l'eau (le port part
      // en scène riveraine). (Les aqueducs étaient ici aussi, pour la même raison
      // — leur prise d'eau se posait EXPRÈS au bord. Les points d'eau qui les
      //  remplacent ne touchent plus l'eau et n'ont plus rien à y faire.)
      const isFlatFootprint = isoFlatFootprint(t);
      if (t.type === 'engine' && !isFlatFootprint) {
        const rc = (L.river && L.river.present && L.river.cells) || null;
        if (rc) {
          if (isoWetFootprint(t, L.river, rc, spanX, spanY)) {   // mémorisé sur la tuile
            if (t.buildingId === 'river_ports' && isoEngineScenesFlag.on && !chuteGone(t)) {
              drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, eraIdx);
            }
            continue;
          }
        }
      }
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;  // largeur allouée au sprite (~78 % du losange)
      // ⛔ L'ART DÉDIÉ DES MONUMENTS A ÉTÉ RETIRÉ (Raph, 2026-08-24 : « les
      // bâtiments créés sont de face »). Les dix PNG generés l'étaient bien en
      // `low top-down`, mais le MODÈLE a rendu des façades quasi frontales —
      // exactement le défaut que [[building-frontview-regen]] avait déjà corrigé
      // en juillet sur une autre vague, et sa leçon disait comment l'éviter :
      // faire l'audit visuel SOI-MÊME sur planche-contact, pas juger trois
      // sprites sur dix. Je ne l'ai pas fait. Les repères civiques reprennent
      // donc la SCÈNE MOTEUR apparentée (KIND_ART), qui est l'état que Raph
      // avait validé (« c'est mieux ») — l'art se refera avec une vraie planche.
      let engineBox;   // boîte rendue par la scène moteur, publiée pour le survol
      if (isHouse && pixelHouseReady(t)) {
        if (profParts) fp('vif-peinture');
        const hpx = wpx;                                    // seul y+h compte (ancre pieds)
        const hx = anchor.x - wpx / 2, hy = anchor.y - hpx - hh * 0.5;
        // SURVOL : le liseré se dessine AVANT le sprite (blob élargi puis sprite
        // par-dessus), sinon il mange la silhouette au lieu de la cerner.
        // L'ombre du soleil (isoSunShadow.js), sous le liseré de survol et le sprite.
        // LA CHUTE (docs/PLAN-CHUTE.md) : secouée ou en ruine, la maison passe par
        // iso/isoChuteScene.js — ni ombre portée, ni liseré de survol, ni fenêtres.
        const chute = chuteTileState(t);
        if (chute) {
          const box = paintHouseFall(ctx, t, hx, hy, wpx, hpx, chute);
          if (box && houseBoxes && houseBoxes.length < HOUSE_BOX_CAP) houseBoxes.push({ b: box, t });
          if (profParts) fp('vif-maisons');
          continue;
        }
        drawPixelHouseSunShadow(t, hx, hy, wpx, hpx);
        if (CM.hover && CM.hover.tile === t) drawPixelHouseOutline(t, hx, hy, wpx, hpx, HOVER_GOLD);
        const box = drawPixelHouse(t, hx, hy, wpx, hpx);
        // Mémorise la boîte réellement dessinée : c'est le seul endroit qui la
        // connaisse. Consommée par le hit-test à la silhouette (cityMapHitTest),
        // qui tourne à la souris, donc sur les boîtes de la dernière frame.
        // Ordre de la liste = ordre du peintre (loin → près) : le hit-test la
        // parcourt à l'envers pour toucher d'abord ce qui est devant.
        if (box && houseBoxes && houseBoxes.length < HOUSE_BOX_CAP) houseBoxes.push({ b: box, t });
        if (profParts) fp('vif-maisons');
      } else if (t.type === 'engine' && t.buildingId === 'water_mills' && chuteGone(t)) {
        // LA CHUTE : le moulin est tombé avec la cité (pas de ruine dessinée : il disparaît).
      } else if (t.type === 'engine' && t.buildingId === 'water_mills' && (engineBox = drawIsoMill(ctx, t, now))) {
        // MOULIN À VENT cuit par le code (docs/PLAN-TERROIR.md) : tour + pose
        // d'ailes en perspective. Boîte publiée au survol, comme les scènes.
        if (houseBoxes && houseBoxes.length < HOUSE_BOX_CAP) houseBoxes.push({ b: engineBox, t });
      } else if (t.type === 'engine' && isoEngineScenesFlag.on && (engineBox = drawIsoEngineScene(ctx, t, anchor, spanX, spanY, T, z, hh, now))) {
        // Scène moteur legacy posée sur le losange (Phase 3-lite) — cf. helper.
        // ⚠ ON PUBLIE SA BOÎTE, exactement comme les habitations juste au-dessus.
        // Sans ça, un moteur haut (école, temple) n'existait pas pour le
        // hit-test : viser son toit retombait sur la cellule projetée dessous,
        // celle SITUÉE DERRIÈRE, et c'est elle que le losange de survol
        // illuminait — alors que l'infobulle, elle, tombait juste par le repli
        // sur la grille. Symptôme signalé par Raph, capture à l'appui.
        if (houseBoxes && houseBoxes.length < HOUSE_BOX_CAP) houseBoxes.push({ b: engineBox, t });
      } else {
        const n = worldToScreen(t.gx * T, t.gy * T);
        const e = { x: n.x + spanX * hw, y: n.y + spanX * hh };
        const s = { x: n.x + (spanX - spanY) * hw, y: n.y + (spanX + spanY) * hh };
        const w = { x: n.x - spanY * hw, y: n.y + spanY * hh };
        if (isFlatFootprint) {
          // CHAMPS : patchwork de parcelles cultivées façon TheoTown (cf. drawIsoField) —
          // la scène legacy (peinture carrée du sol) ne se pose pas sur le losange.
          if (profParts) fp('vif-peinture');
          if (!drawIsoFieldPixel(ctx, t, spanX, spanY, band, now)) drawIsoField(ctx, t, spanX, spanY, band, eraIdx);
          if (profParts) fp('vif-champs');
          continue;
        }
        // (Un repli « canal plat » de l'aqueduc vivait ici : une bande beige et
        //  un filet d'eau bleu le long de l'axe long de l'emprise, dessinés tant
        //  que les pièces 3-slice n'étaient pas décodées. Retiré avec le reste de
        //  la conduite — un point d'eau n'atteint plus jamais ce chemin, il part
        //  en `plazaProp` bien avant, et son repli à lui est le gabarit du kit.)
        // Socle : BLOC iso extrudé (empreinte + 2 murs + toit plat) — repli des
        // scènes en quarantaine / molette __isoEngineScenes(false).
        const c = t.type === 'engine' ? [172, 152, 112] : [150, 142, 120];
        const v = 0.96 + ((cmHash(t.gx + ':' + t.gy) % 100) / 100) * 0.08;
        // Extrusion discrète, plafonnée : les grandes empreintes moteur ne doivent pas
        // écraser les habitations au jalon (leurs scènes arrivent en Phase 3).
        const hgt = hh * 1.1;
        // mur ouest (ombré) puis mur est (plus sombre — lumière haut-gauche), puis toit.
        ctx.fillStyle = rgb(c, 0.78 * v);
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(c, 0.6 * v);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(c, v);
        ctx.beginPath(); ctx.moveTo(n.x, n.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
        // Le bloc de repli masque lui aussi les halos déposés derrière lui : sa
        // silhouette est le PRISME (losange du toit + deux murs), tracé d'un trait.
        lightCut(w.x, n.y - hgt, e.x, s.y, (lc) => {
          lc.beginPath();
          lc.moveTo(n.x, n.y - hgt); lc.lineTo(e.x, e.y - hgt); lc.lineTo(e.x, e.y);
          lc.lineTo(s.x, s.y); lc.lineTo(w.x, w.y); lc.lineTo(w.x, w.y - hgt);
          lc.closePath(); lc.fill();
        });
      }
    } else if (it.kind === 'tree') {
      if (profParts) fp('vif-peinture');
      // ARBRES PIXEL (retour Raph : les sapins-triangles « pas faits
      // correctement du tout ») : sprite PixelLab /pixelart/iso/tree-N.png,
      // variante stable par hash de cellule ; repli = triangle procédural.
      const tr = it.tr;
      const p = worldToScreen((tr.gx + 0.5 + (tr.jx || 0)) * T, (tr.gy + 0.9 + (tr.jy || 0)) * T);
      // Variante mémoïsée SUR L'ARBRE : elle ne dépend que de sa cellule, et
      // les objets d'arbre sont persistants (layout, et cache par blocs pour la
      // forêt sauvage) — le hash de chaîne ne se paie donc qu'une fois par arbre
      // et par vie de cache, au lieu d'une fois par arbre et par frame.
      // `tr.v` : essence et âge décidés à la plantation (forêt sauvage, cf.
      // isoWildForest) ; sinon un arbre de VILLE, de l'essence de son ère (lot 6).
      let tv = tr._tv;
      if (tv === undefined || !treeMemo) tv = tr._tv = tr.v || cityTreeVariant(tr.gx, tr.gy, band);
      // Hors hiver et hors ruines, la cellule du sapin mort reçoit une essence
      // vivante — tirée à part, et mémoïsée comme la variante.
      if (tv === TREE_DEAD_VARIANT && !deadTreeOk) {
        if (tr._ta === undefined || !treeMemo) tr._ta = treeAliveVariant(tr.gx, tr.gy);
        tv = tr._ta;
      } else if (tr.dead && deadTreeOk) tv = TREE_DEAD_VARIANT;   // conifère de la forêt (isoWildForest)
      // __treeMemo = false : rejoue la résolution par arbre (A/B de la mesure).
      const tImg0 = treeMemo ? treeImgs[tv] : (() => { const nm = TREE_SPRITES[tv].name, a = isoArt(nm); return a.ready ? (seasonTree(a, nm) || a.img) : null; })();
      if (tImg0) {
        // Canevas de l'essence (64 jeune, 96 adulte, 104-128 grand) au grain commun.
        const hpx = T * z * treeCanvasT(tr.r, tr.fixed) * treeSpriteK(tv);
        // Feuillage TEINTÉ par la saison : la teinte est cuite une fois par
        // (variante, saison) dans un canvas hors écran, et l'image résolue nous
        // vient de treeImgs (une fois par frame, cf. plus haut).
        const tImg = tImg0;
        const tdx = p.x - hpx / 2, tdy = p.y - hpx * 0.92;
        // L'OMBRE DU SOLEIL (isoSunShadow.js), pivot au PIED du tronc (0,92 du
        // canvas) : la couronne flotte, son ombre part loin du tronc. Toujours sur
        // le canvas 2D, même quand le sprite part au batcher GL : la série GL se
        // compose par-dessus, l'ombre reste dessous.
        drawSunShadow(ctx, tImg, tdx, tdy, hpx, hpx, 0, 0, 0, 0, 0.92);
        // Série basculée : le sprite part au batcher (un seul appel de dessin
        // pour toute la série). Refus du batcher (atlas plein, source pas
        // décodée) → chemin 2D, sprite par sprite, comme avant.
        let batched = false;
        // VENT (iso/isoVie.js, petite vie) : null = arbre immobile, un seul blit comme
        // avant ; sinon trois bandes, la couronne décalée d'un texel entier.
        const tsw = tImg.naturalWidth || tImg.width | 0, tsh = tImg.naturalHeight || tImg.height | 0;
        const sway = vieTreeSway(tr, now, tsw, tsh, hpx);
        const tu = hpx / tsw, tv2 = hpx / tsh;
        // Coupures entre bandes au pixel DEVICE entier : une coupure fractionnaire
        // laissait une ligne claire en travers de la couronne (même piège que les
        // reflets). Le haut et le bas de l'arbre restent où ils étaient.
        const tdp = CM.dpr || 1;
        const bandY = (r) => (r <= 0 ? tdy : r >= tsh ? tdy + hpx : Math.round((tdy + r * tv2) * tdp) / tdp);
        if (it._gl) {
          if (!sway) batched = glQuad(tImg, 0, 0, tsw, tsh, tdx, tdy, hpx, hpx);
          else {
            batched = true;
            for (const [y0, y1, o] of sway) batched = glQuad(tImg, 0, y0, tsw, y1 - y0, tdx + o * tu, bandY(y0), hpx, bandY(y1) - bandY(y0)) && batched;
          }
          if (batched) {
            glPending += 1;
            if (tdx - tu < gbx0) gbx0 = tdx - tu; if (tdy < gby0) gby0 = tdy;
            if (tdx + hpx + tu > gbx1) gbx1 = tdx + hpx + tu; if (tdy + hpx > gby1) gby1 = tdy + hpx;
          }
        }
        if (!batched) {
          const prevTS = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          if (!sway) ctx.drawImage(tImg, tdx, tdy, hpx, hpx);
          else for (const [y0, y1, o] of sway) ctx.drawImage(tImg, 0, y0, tsw, y1 - y0, tdx + o * tu, bandY(y0), hpx, bandY(y1) - bandY(y0));
          ctx.imageSmoothingEnabled = prevTS;
        }
        // L'occultation du calque de lumière vit dans un AUTRE canvas : elle
        // reste identique quel que soit le pipeline du sprite. Au vent, elle suit
        // les bandes LÀ OÙ elles sont posées (audit du 05/10, PERF-73) : la
        // silhouette de repos laissait une frange de halo traverser la couronne.
        if (!sway) lightCutImage(tImg, tdx, tdy, hpx, hpx);
        else if (lightCutLive()) {
          let reach = 0;
          for (const b of sway) reach = Math.max(reach, Math.abs(b[2]) * tu);
          lightCut(tdx - reach, tdy, tdx + hpx + reach, tdy + hpx, (lc) => {
            for (const [y0, y1, o] of sway) lc.drawImage(tImg, 0, y0, tsw, y1 - y0, tdx + o * tu, bandY(y0), hpx, bandY(y1) - bandY(y0));
          });
        }
      } else {
        drawTreeIso(ctx, p.x, p.y, T * z * (tr.r || 0.7) * 1.3 * treeBandMul(tr.fixed));
      }
      if (profParts) fp('vif-arbres');
    } else if (it.kind === 'critter') {
      const cr = it.cr;
      const p = worldToScreen((cr.gx + 0.5 + cr.jx) * T, (cr.gy + 0.5 + cr.jy) * T);
      const m = drawCritterIso(ctx, p.x, p.y, T * z, cr, AGENT_SCALE, CM.dpr);
      // Sonde G0 : le bétail est mesuré ICI et pas dans critters.js, qui n'a
      // AUCUN IMPORT par construction (cf. son en-tête). Il rend sa mesure, on
      // l'enregistre. Famille absente du relevé §1.2 du plan — et le chat est
      // la plus petite bête du jeu, donc a priori la pire densité.
      if (pxProbe.on && m && m.src) recPx('bete · ' + cr.kind, m.src, m.box);
    } else if (it.kind === 'vie') {
      // Petite vie posée au sol (iso/isoVie.js) : l'acteur se dessine lui-même.
      it.v.draw(ctx, now);
    } else if (it.kind === 'elev') {
      // Les étages de la ville (iso/isoElevated.js) : idem.
      it.v.draw(ctx, now);
    } else if (it.kind === 'campHearth') {
      // Foyer du campement (2026-09-28) : tout le calcul est dans
      // isoCampHearth.js (grain égalisé sur les tentes, flamme animée, lueur).
      // Deux items depuis le 2026-10-03 : le SOL (sous les passants) puis la FLAMME.
      if (it.part === 'fire') drawIsoCampHearthFire(ctx, it.wx, it.wy, T, z, now);
      else drawIsoCampHearthGround(ctx, it.wx, it.wy, T, z, now);
    } else if (it.kind === 'plazaProp') {
      // PLACE COMPOSÉE : un prop, à sa taille en TUILES (jamais en fraction de
      // la place). Tout le calcul est dans isoPlaza.js.
      drawIsoPlazaProp(ctx, it.art, it.eraKey, now);
    } else if (it.kind === 'plazaGrid') {
      drawIsoPlazaGrid(ctx, it.art);     // overlay de travail (__plaza({grid|ruler}))
    } else if (it.kind === 'plazaScene') {
      // Losange de CONTENU mesuré calé pile sur l'emprise de la dalle (le
      // canvas brut décalait la scène — retour Raph).
      const p = worldToScreen(it.wx, it.wy);
      const g = drawIsoGroundedArt(ctx, it.art, p.x, p.y, (it.px + it.py) * T * z * ISO_X * 0.98);
      // EAU DE LA FONTAINE : frame courante du strip re-projetée sur la scène
      // (rect source → géométrie du draw) ; hors eau le strip est identique à
      // la scène (pixels verrouillés) donc l'overlay est invisible à l'arrêt.
      const fa = FOUNTAIN_ANIM[it.eraKey];
      // L'eau de fontaine survit au cran « sobre » : c'est une animation lente,
      // locale et attendue. Seul « aucune » l'arrête, avec le reste.
      if (fa && FOUNTAIN_TUNE.on && g && (CM.ambianceK ?? 1) > 0) {
        const fArt = isoArt('anim/plaza-fountain-' + it.eraKey + '?v=' + FA_V);
        if (fArt.ready) {
          const iw = it.art.img.naturalWidth || 1, ih = it.art.img.naturalHeight || 1;
          const nf = Math.max(1, Math.round((fArt.img.naturalWidth || fa.w) / fa.w));
          const f = Math.floor((now || 0) / FOUNTAIN_TUNE.ms) % nf;
          const prevFS = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(fArt.img, f * fa.w, 0, fa.w, fa.h,
            g.x + fa.x * (g.w / iw), g.y + fa.y * (g.h / ih), fa.w * (g.w / iw), fa.h * (g.h / ih));
          ctx.imageSmoothingEnabled = prevFS;
        }
      }
    } else if (it.kind === 'smoke') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      const anchor = tileAnchor(t, spanX, spanY);
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;
      // MÊME appel de géométrie que le dessin du sprite : la source de la fumée
      // se recale donc automatiquement sur tout changement de cadrage du sprite.
      drawIsoSmoke(pixelHouseBox(t, anchor.x - wpx / 2, anchor.y - wpx - hh * 0.5, wpx, wpx), t._smokeS, now, smokeK);
    } else if (it.kind === 'crisissmoke') {
      // Même géométrie que la cheminée ci-dessus (la boîte RÉELLE du sprite).
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      const anchor = tileAnchor(t, spanX, spanY);
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;
      drawIsoCrisisSmoke(pixelHouseBox(t, anchor.x - wpx / 2, anchor.y - wpx - hh * 0.5, wpx, wpx), t._crisisS, now);
    } else if (it.kind === 'revealpin') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      const anchor = tileAnchor(t, spanX, spanY);
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;
      // MÊME géométrie que le sprite (cf. fumée) → le chevron suit tout recadrage.
      drawIsoRevealPin(pixelHouseBox(t, anchor.x - wpx / 2, anchor.y - wpx - hh * 0.5, wpx, wpx), t._revealPinAt, now);
    } else if (it.kind === 'wonderSeg') {
      drawIsoWonderSeg(ctx, it, now);
    } else if (it.kind === 'plaisirs') {
      // La Maison des Plaisirs, construite par le code (iso/isoPlaisirs.js) :
      // cerne, foyers, ombre, reflet et survol sur la tranche « base », puis
      // les tranches et les objets à leur profondeur.
      drawIsoPlaisirsSeg(ctx, it, now);
    } else if (it.kind === 'lamp') {
      const p = worldToScreen(it.wx, it.wy);
      // Taille : celle du kit de l'ère (un pixel d'art = un pixel d'écran au zoom
      // 1), ou pour un PNG le CONTENU visible ramené à LAMP_TUNE.h tuiles, largeur
      // au ratio de l'image (cf. lampBox, isoStreet.js).
      const { m, hpx, wpx } = lampBox(it.art, T * z);
      const ldp = CM.dpr || 1;
      const lx = Math.round((p.x - wpx * m.footXf) * ldp) / ldp, ly = Math.round((p.y - hpx * m.footYf) * ldp) / ldp;
      // L'ombre du soleil, pivot au PIED du mât (le mât est une colonne mince, sa
      // lanterne déborde : le pivot commun la projette loin, comme un arbre).
      // Sous 24 px, ce n'est plus qu'un trait d'un pixel : pas d'appel pour lui.
      if (hpx >= 24) drawSunShadow(ctx, it.art.img, lx, ly, wpx, hpx, 0, 0, 0, 0, m.footYf);
      const prevLS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(it.art.img, lx, ly, wpx, hpx);
      ctx.imageSmoothingEnabled = prevLS;
      // HALO DÉPOSÉ ICI, à la profondeur du mât : tout ce que le peintre dessine
      // après lui (donc devant) viendra le découper. Sans ce dépôt en place, le
      // halo se peignait à plat en fin de frame et traversait les façades.
      if (lampK && lampLit(it, lampK)) {
        const bx = lampGlowBox(p, lampK);
        const lc = lightCtx(bx.x0, bx.y0, bx.x1, bx.y1);
        if (lc) paintLampGlow(lc, it, p, lampK, now);
      }
    } else if (it.kind === 'fence') {
      // BANDE DE CLÔTURE (lot L9). `it.wx/wy` est le coin de DÉPART de l'arête, et la
      // bande a été composée pour couvrir exactement une arête de cellule.
      //
      // L'échelle se déduit de la couverture voulue, pas d'un réglage : les `per`
      // panneaux doivent couvrir l'écart écran d'UNE cellule sur l'axe, soit
      // T·ISO_X·z. Le reste (hauteur) suit le ratio du canevas — jamais un blit carré,
      // qui écraserait la bande.
      const st = it.art;
      const p = worldToScreen(it.wx, it.wy);
      const s = (T * ISO_X * z) / st.cw;
      // Le PREMIER panneau doit poser son pied sur le coin de départ : sa base est à
      // `panelH` du haut de la bande. Pour un côté e/w le premier panneau est à
      // DROITE du canevas, donc l'ancre horizontale change avec le sens d'avance.
      const x0 = st.right ? p.x : p.x - st.cw * s;
      const y0 = p.y - st.panelH * s;
      const prevFS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      // Sur la grille DEVICE, comme les arbres et les réverbères (audit du
      // 2026-10-05, BUG-98) : l'entier CSS tombe sur un quart ou une moitié de
      // pixel device à dpr 1,25 / 1,5, et la clôture tremblait contre le sol au
      // pan. À dpr 1, c'est l'arrondi d'avant.
      const fdp = CM.dpr || 1, fsn = (v) => Math.round(v * fdp) / fdp;
      ctx.drawImage(st.canvas, fsn(x0), fsn(y0), fsn(st.cw * s), fsn(st.ch * s));
      ctx.imageSmoothingEnabled = prevFS;
    } else if (it.kind === 'bush') {
      // Buisson de terre-plein : feuillu réutilisé petit, pied sur la couture.
      const p = worldToScreen(it.wx, it.wy);
      // Buisson DÉDIÉ (bush-N) ; repli sur le feuillu rapetissé d'avant si le
      // PNG manque. Teinté par la saison comme les arbres — sinon le terre-plein
      // restait vert d'été au milieu d'une avenue en automne.
      // La clé de saison suit l'art RÉELLEMENT dessiné : sur les premières
      // frames le buisson n'est pas encore décodé et on tombe sur l'arbre —
      // une clé fixe aurait figé cet arbre teinté dans le cache pour de bon.
      let bArt = isoArt('bush-' + it.v), bKey = 'bush-' + it.v;
      if (!bArt.ready) { const fv = 1 + (it.v % 2); bArt = isoArt('tree-' + fv); bKey = 'tree-' + fv; }
      if (bArt.ready) {
        const hpx = T * z * treeCanvasT(it.r);
        // Ombre d'ancrage au pied (terre-plein) : sans elle le buisson « vole »
        // au-dessus du gazon (retour Raph 2026-08-03) — l'île garde son rendu nu.
        if (it.shadow) {
          ctx.fillStyle = 'rgba(28,40,22,0.38)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + hpx * 0.01, hpx * 0.30, hpx * 0.115, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const prevBS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        const bImg = seasonTree(bArt, bKey) || bArt.img;
        ctx.drawImage(bImg, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
        ctx.imageSmoothingEnabled = prevBS;
        lightCutImage(bImg, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
      }
    } else if (it.kind === 'bridgeSeg') {
      // Jalons de pesée (opt-in) : ces deux postes sont les candidats à la
      // cuisson en texture — il faut leur coût RÉEL avant d'y consacrer une
      // séance. Coût nul profileur éteint.
      if (profParts) fp('vif-peinture');
      drawIsoBridgeSeg(ctx, it, now);
      if (profParts) fp('vif-ponts');
    } else if (it.kind === 'portBoat') {
      drawIsoPortBoat(ctx, it.moor, now, z, T);
    } else if (it.kind === 'fleetShip') {
      drawIsoShipDeferred(ctx, it.sh, now);
    } else if (it.kind === 'porter') {
      drawDockPorter(ctx, it.q, it.band, now);
    } else if (it.kind === 'fleetScene') {
      drawFleetScene(ctx, it, now);
    } else if (it.kind === 'terroirTeam') {
      drawTerroirTeam(ctx, it, now);
    } else if (it.kind === 'veh') {
      drawIsoVehicle(ctx, it.v, now, z);
    } else if (it.kind === 'riot') {
      drawIsoRioter(ctx, it.p, now, z);
    } else {
      drawIsoCitizenItem(ctx, it.p, now, z);
    }
  }
  glCompose();                     // dernière série éventuelle
  if (glOn) {
    globalThis.__glPainterLast = { series: glRuns, sprites: glSprites };
  }
  // ── SILHOUETTES FANTÔMES ────────────────────────────────────────────────────
  // La vie urbaine disparaissait derrière le bâti haut (correct en 3/4, mais on ne
  // voyait plus vivre la ville — Raph 2026-08-03, « à tous les âges »). Une unité
  // réellement recouverte est REDESSINÉE par-dessus le peintre en transparence : on
  // la devine à travers la façade. AVANT endLightLayer pour qu'elle vive sous la même
  // lumière que la scène. Molette : __ghost({ on, alpha, cover }) — alpha 0 = coupé.
  //
  // ⚠⚠ LE TEST DE COUVERTURE EST FAIT ICI, ET C'EST TOUT L'OBJET DE Q11 (2026-08-23).
  // `isoUnitDepthEx` ne sait pas si l'unité est cachée : il lève `hidden` dès qu'un
  // bâtiment la PLAFONNE dans l'ordre du peintre, sans jamais regarder s'il la
  // recouvre — sa fiche ne porte AUCUNE hauteur, et il ne faut pas lui en donner
  // (P23 : la hauteur n'entre pas dans le tri, c'est prouvé). Mesuré avant la
  // correction : 55 % des unités marquées, dont 62 % que rien ne cachait — on
  // redessinait ~48 silhouettes par frame pile sur elles-mêmes, invisibles.
  //
  // La vraie couverture ne coûte pourtant rien : cette passe tourne À LA FIN de la
  // même frame, donc `houseBoxes` porte déjà les rectangles RÉELLEMENT dessinés de
  // tout ce qui s'est peint — mesure exacte, pas une hauteur approchée.
  if (GHOST_TUNE.on && GHOST_TUNE.alpha > 0 && !CM.lodActive && houseBoxes) {
    // Index par colonne écran : ~700 boîtes contre ~80 unités, le produit naïf
    // coûterait plus cher que les redessins qu'on économise.
    const COL = 128;
    const parCol = new Map();
    for (const hb of houseBoxes) {
      const t = hb.t, bx = hb.b;
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      const key = (t.gx + sx) * T + (t.gy + sy) * T;   // clé peintre, comme isoUnitFiches
      for (let c = Math.floor(bx.dx / COL); c <= Math.floor((bx.dx + bx.dw) / COL); c += 1) {
        let a = parCol.get(c); if (!a) parCol.set(c, a = []);
        a.push(bx); a.push(key);
      }
    }
    const wU = T * z * ISO_X * GHOST_TUNE.wK, hU = T * z * GHOST_TUNE.hK;
    let vus = 0, dessines = 0;
    // ⚠⚠ TEST AU PIXEL, et non plus au rectangle (2026-08-23, second tour de Q11).
    // Le premier jet comparait des AIRES de rectangles. Une boîte d'encre est un
    // rectangle autour d'une silhouette ISOMÉTRIQUE : ses coins sont vides, et une
    // unité qui y tombe passait pour cachée — mesuré sur un attelage du pont, sous la
    // boîte d'une maison de la rive, qui se redessinait sur lui-même. La condition
    // « les pieds dans la boîte » a été essayée : elle n'écarte AUCUN cas.
    // On échantillonne donc la silhouette sur une grille et on interroge le MASQUE du
    // sprite (iso/isoMask.js) : de la matière, ou du vide ?
    const NX = 3, NY = 5;                              // 15 points : assez pour trancher
    const couvert = (gwx, gwy, d) => {
      const sp = worldToScreen(gwx, gwy);
      const besoin = Math.ceil(NX * NY * GHOST_TUNE.cover);
      let touches = 0, restants = NX * NY;
      for (let iy = 0; iy < NY; iy += 1) {
        // De la tête (iy=0) aux pieds : la tête est ce qui compte le plus pour dire
        // qu'on ne voit plus l'unité, mais un corps caché aux 3/4 compte aussi.
        const py = sp.y - hU * (1 - iy / (NY - 1));
        for (let ix = 0; ix < NX; ix += 1) {
          const px = sp.x + wU * ((ix / (NX - 1)) - 0.5);
          let vu = false;
          for (let c = Math.floor((px - 1) / COL); c <= Math.floor((px + 1) / COL) && !vu; c += 1) {
            const a = parCol.get(c); if (!a) continue;
            for (let i = 0; i < a.length; i += 2) {
              if (a[i + 1] <= d) continue;             // dessiné AVANT l'unité : ne la cache pas
              if (maskHit(a[i], px, py)) { vu = true; break; }
            }
          }
          if (vu) touches += 1;
          restants -= 1;
          if (touches >= besoin) return true;
          if (touches + restants < besoin) return false;   // plus atteignable
        }
      }
      return false;
    };
    const prevGA = ctx.globalAlpha;
    ctx.globalAlpha = GHOST_TUNE.alpha;
    // Sans leur ombre : elle a été posée au sol à leur passage dans le peintre, la
    // repeindre ici la collerait sur la façade qui les cache.
    muteSunShadow(() => {
      for (const it of items) {
        if (!it.ghost) continue;
        vus += 1;
        if (!couvert(it.gwx, it.gwy, it.d)) continue;
        dessines += 1;
        if (it.kind === 'cit') drawIsoCitizenItem(ctx, it.p, now, z);
        else if (it.kind === 'veh') drawIsoVehicle(ctx, it.v, now, z);
        else if (it.kind === 'riot') drawIsoRioter(ctx, it.p, now, z);
      }
    });
    ctx.globalAlpha = prevGA;
    if (globalThis.__ghostStats) globalThis.__ghostStatsLast = { marquees: vus, dessinees: dessines };
  }
  endLightLayer();
  ctx.imageSmoothingEnabled = prevSmooth;
}
