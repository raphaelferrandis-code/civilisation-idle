// LE PORT FLUVIAL — ce qui vit AU BORD de l'eau, et dessus.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Deux morceaux qui n'en font qu'un :
//   · la FLOTTE legacy (`CM.ships`) posée sur le ruban projeté ;
//   · le QUAI — le riverain, la géométrie du ponton, le mouillage du bateau amarré.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, quatre sortantes. Vérifiée ligne à ligne contre la
// version commitée.
//
// ⚠ IL A FALLU SORTIR LE SOCLE D'ABORD. Ce bloc tenait au peintre par deux fils
// seulement — `fillWorldQuad` et `isoArt` —, tous deux partis le même jour dans
// isoQuad.js et isoArt.js. Deux petits modules ont libéré quatre cents lignes.
//
// ⚠ Aucun cycle : cityEngineSprites, riverFleet, isoFleet, isoBridge et agents
// n'importent rien du peintre. `isoFleet` cite bien `drawIsoShips` — en PROSE, pour
// expliquer d'où vient l'ancre écran qu'il consomme.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { propReady } from '../cityEngineSprites.js';
import { blitPropAnchored } from './isoPortProps.js';
import { orbitPoint, shipAlpha } from '../riverFleet.js';
import { ensureBoat, boatReady, BOAT_SIZES, BOAT_LIFT } from '../agents.js';
import { bridgeBlocks } from './isoBridge.js';
import {
  BOAT_IMG_K, BOAT_IMG_TOP, tradeStage, tradeSizeMul,
  drawIsoBoatStub, shipVisual, riverDodge, boatSector, BOAT_ISO,
} from './isoFleet.js';
import { fillWorldQuad } from './isoQuad.js';
import { isoArt } from './isoArt.js';
import { rgb } from './isoPalette.js';
import { pxProbe, recPx } from '../pixelGrid.js';
import { snapDev } from '../blitSnap.js';
import { drawSunShadow, sunShadowNightK } from './isoSunShadow.js';
import { noteReflection } from './isoReflect.js';
import { PIER, drawPortPier, pierHouseFoot, pierMoorings } from './isoPier.js';
import { drawOldPort, drawPortOffice } from './isoOldPort.js';
import { drawTradePort } from './isoTradePort.js';
import { boatSpecFor, boatSizeMul, boatHasLights, drawBoat, BOATKIT } from './boatKit.js';
import { fleetFor } from './boatKits.js';
import { dockPorters } from './boatBerths.js';
import { BOAT_MODELS } from './boatKits.js';
import { drawSmoke, drawJets } from './boatFx.js';

// ── BATEAUX : flotte legacy (CM.ships) sur le ruban projeté ──────────────────
// Reprend la recette drawShips (stade par ère, voie latérale, louvoiement,
// sillage additif, coque « toujours droite ») mais TOUT passe par la projection :
// position monde → worldToScreen, inclinaison = tangente PROJETÉE. Dessinés
// APRÈS le fleuve et AVANT les ponts → ils passent sous les tabliers.
// NE SIMULE PLUS RIEN : la vie de la flotte (naissance, escale, mort) est
// pilotée par riverFleet.js, appelé une fois par frame par le runtime.
export function drawIsoShips(now) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !CM.ships || !CM.ships.length) return;
  const sm = rv.samples;
  if (!sm || sm.length < 2) return;
  const T = CM.TILE, ctx = CM.ctx, z = CM.cam.zoom, s = T * z;
  const band = (L.counts && L.counts.eraBand) | 0, ei = (L.counts && L.counts.eraIndex) | 0;
  // Les trois aspects sont CONSTANTS sur la frame (même ère pour tout le monde) :
  // on les calcule une fois, pas une fois par bateau.
  // Les aspects sont CONSTANTS sur la frame (même ère pour tous) : on les
  // calcule une fois. Le pêcheur en a deux — canne tendue à l'ancre, rangée en
  // route — d'où ses deux entrées, choisies par bateau selon son état.
  const VIS = {
    trade: shipVisual('trade', band, ei),
    fisherPosed: shipVisual('fisher', band, ei, 'anchor'),
    fisherRow: shipVisual('fisher', band, ei, 'cruise'),
  };
  const docks = CM.shipDocks || [];
  for (const sh of CM.ships) {
    const vis = sh.kind === 'fisher'
      ? (sh.state === 'anchor' ? VIS.fisherPosed : VIS.fisherRow)
      : (VIS[sh.kind] || VIS.trade);
    const vstage = vis.stage;
    // BATEAUX DESSINÉS PAR LE CODE (docs/PLAN-BATEAUX.md) : là où l'ère a sa flotte
    // (boatKits.BAND_FLEET), le bateau est tiré parmi les modèles de son métier et
    // cuit à son cap. Sa longueur réelle remplace la table d'échelle des sprites.
    let kit = boatSpecFor(sh, band);
    // Le passeur change de voyageurs à chaque traversée : la graine suit le voyage.
    if (kit && sh.kind === 'ferry') kit = { ...kit, seed: kit.seed + (sh.trip || 0) * 31 };
    // Les coques qui LÉVITENT ne laissent ni sillage ni ellipse sur l'eau.
    const floats = !!(kit && BOAT_MODELS[kit.id] && BOAT_MODELS[kit.id].hover);
    const sizeMul = kit ? boatSizeMul(kit) : vis.sizeMul;
    // Repli profil legacy : réservé aux stades marchands, seuls à avoir une
    // bande top-down sous /agents/boats/.
    const chr = BOAT_SIZES[vstage] ? ensureBoat(vis.key) : null;
    // La position est SIMULÉE en amont (riverFleet.js, un seul point pour les
    // deux rendus) : ici on ne fait plus que lire. `moveF` ne sert donc qu'à
    // l'écume — un bateau à l'arrêt ne traîne pas de sillage.
    const stopped = sh.state === 'dock' || sh.state === 'anchor';
    let moveF = stopped ? 0 : 1;
    if (!stopped && sh.kind === 'trade' && !sh.done) {
      let prox = 0;
      for (const d of docks) { let dd = Math.abs(sh.t - d.t); if (dd > 0.5) dd = 1 - dd; prox = Math.max(prox, Math.max(0, 1 - dd / 0.05)); }
      moveF = 1 - 0.7 * prox;
    }
    // ── OÙ EST-IL ? DEUX RÉGIMES ────────────────────────────────────────────
    // Presque tous les bateaux vivent sur le RUBAN (position `t` + voie latérale).
    // Le pêcheur de l'île, lui, vit sur son ORBITE : sa position ne se lit pas du
    // tout de la même façon, mais tout ce qui suit (coque, sillage, ombre, nuit)
    // ne connaît que `p` et `heading` — d'où cette bifurcation, et elle seule.
    // `tilt` = l'inclinaison de la COQUE legacy, calée sur la pente ÉCRAN de la
    // route suivie (et non sur le sens de marche : une coque ne se retourne pas
    // quand le bateau fait demi-tour). Calculé dans les deux régimes plutôt que
    // reconstruit depuis `heading`, qui, lui, porte le sens.
    const orbIle = sh.orbit ? (rv.islands || [])[0] : null;
    // `thW` = cap MONDE (le kit cuit dans le repère du monde ; `heading` est l'angle écran).
    let p, heading, tilt, wxS, wyS, thW;
    // Coque peinte cette frame (cf. plus bas) : le PONT la redessine quand elle a
    // passé sa face aval (isoBridge.pushIsoBridgeItems) — sinon peinte avant lui,
    // elle restait cachée derrière la face ~1,5 tuile après être sortie de dessous.
    sh._hull = null;
    // De même la pose À QUAI (item 'fleetShip') : sortie du champ, la coque gardait celle
    // de sa dernière image — et deux captures de suite (horloge figée à la même valeur)
    // la redessinaient là, à l'échelle d'alors.
    sh._defer = null;
    if (orbIle) {
      const o = orbitPoint(orbIle, sh.orbit.ang);
      wxS = o.x * T; wyS = o.y * T;
      p = worldToScreen(o.x * T, o.y * T);
      if (p.x < -s * 3 || p.x > CM.cw + s * 3 || p.y < -s * 3 || p.y > CM.ch + s * 3) continue;
      // Cap = tangente de l'orbite, PROJETÉE (et non l'angle monde) : en iso, une
      // trajectoire circulaire devient une ellipse écrasée de moitié, un cap pris
      // dans le monde ferait naviguer la coque en crabe sur les flancs.
      const da = 0.06 * (sh.orbit.dir < 0 ? -1 : 1);
      const o2 = orbitPoint(orbIle, sh.orbit.ang + da);
      const q = worldToScreen(o2.x * T, o2.y * T);
      heading = Math.atan2(q.y - p.y, q.x - p.x);
      thW = Math.atan2(o2.y - o.y, o2.x - o.x);
      tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(q.y - p.y, Math.abs(q.x - p.x) || 1e-6) * 0.45));
    } else {
      const fi = sh.t * (sm.length - 1);
      const i0 = Math.max(0, Math.min(sm.length - 1, Math.floor(fi)));
      const i1 = Math.min(sm.length - 1, i0 + 1);
      const f = fi - i0;
      let cgx = sm[i0].x + (sm[i1].x - sm[i0].x) * f;
      let cgy = sm[i0].y + (sm[i1].y - sm[i0].y) * f;
      // Voie latérale propre + louvoiement (repris du legacy).
      const hw = sm[i0].hw || 2;
      let nx = -(sm[i1].y - sm[i0].y), ny = sm[i1].x - sm[i0].x;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const effSize = (BOAT_SIZES[vstage] || 0.7) * sizeMul;
      // Voie RESSERRÉE (hw×0.78) : dans les coudes, l'interpolation linéaire des
      // samples dérive du ruban lissé → à pleine demi-largeur les coques
      // mordaient la berge près du pont (vu à la capture).
      const laneRoom = Math.max(0, hw * 0.78 - effSize * 0.3 - 0.25);
      const wave = Math.sin((now || 0) / 2600 + (sh.phase || 0)) * 0.12;
      // `sh` sert de MÉMOIRE : le bord choisi pour doubler une île y reste
      // accroché tant que le bateau la longe (cf. riverDodge).
      // NAVIGATION SIMULÉE (riverFleet, docs/PLAN-BATEAUX.md §5) : la voie et le cap
      // viennent de la sim quand elle les fournit — règle de route, dépassements,
      // passe du pont. Le calcul ci-dessus n'est plus que le repli.
      const lateral = sh.lat != null ? sh.lat
        : riverDodge(((sh.lane || 0) + wave) * laneRoom, sh.t, effSize, hw, null, null, sh);
      cgx += nx * lateral; cgy += ny * lateral;
      wxS = cgx * T; wyS = cgy * T;
      p = worldToScreen(cgx * T, cgy * T);
      if (p.x < -s * 3 || p.x > CM.cw + s * 3 || p.y < -s * 3 || p.y > CM.ch + s * 3) continue;
      // Cap PROJETÉ complet (rad écran), signé par le sens de navigation.
      const a2 = worldToScreen(sm[i0].x * T, sm[i0].y * T);
      const b2 = worldToScreen(sm[i1].x * T, sm[i1].y * T);
      const sgn = sh.dir < 0 ? -1 : 1;
      heading = Math.atan2(sgn * (b2.y - a2.y), sgn * (b2.x - a2.x));
      thW = sh.th != null ? sh.th : Math.atan2(sgn * (sm[i1].y - sm[i0].y), sgn * (sm[i1].x - sm[i0].x));
      // Le cap ÉCRAN suit le cap monde simulé (sillage, ellipse de nuit, secteur).
      if (sh.th != null) heading = Math.atan2((Math.cos(thW) + Math.sin(thW)) * 0.5, Math.cos(thW) - Math.sin(thW));
      tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(b2.y - a2.y, Math.abs(b2.x - a2.x) || 1e-6) * 0.45));
    }
    const spd01 = Math.max(0, Math.min(1, (sh.speed - 0.008) / 0.012));
    // Fondu d'entrée : un bateau naît sur le bord du ruban, qui reste visible en
    // vue dézoomée — sans ce fondu il POPPE au bord de la carte. Et fondu de
    // SORTIE (shipAlpha) : le fleuve se prolonge désormais à l'écran au-delà du
    // bout où le bateau meurt, il ne doit donc plus s'y évaporer d'un coup.
    const prevAlpha = ctx.globalAlpha;
    const shipA = shipAlpha(sh);
    if (shipA < 1) ctx.globalAlpha = prevAlpha * shipA;
    // Sillage additif derrière la poupe + ombre : pivotés au CAP COMPLET (l'eau
    // suit la pente, seul le sprite de coque reste droit).
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(heading);
    if (vis.wake > 0 && !floats) {
      const WL = s * (0.85 + spd01 * 0.8) * (0.35 + 0.65 * moveF) * sizeMul * 0.7;
      const foam = vstage === 'cosmic' ? '150,220,255' : '225,238,245';
      // Le sillage dit le MÉTIER autant que la coque : un cargo laboure, un
      // plaisancier effleure, un pêcheur à l'ancre ne trouble rien du tout.
      const wa = (0.10 + spd01 * 0.10) * moveF * vis.wake;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gt = ctx.createLinearGradient(-s * 0.18 * sizeMul, 0, -WL, 0);
      gt.addColorStop(0, `rgba(${foam},${wa.toFixed(2)})`);
      gt.addColorStop(1, `rgba(${foam},0)`);
      ctx.fillStyle = gt;
      ctx.beginPath();
      ctx.moveTo(-s * 0.18 * sizeMul, -s * 0.045 * sizeMul);
      ctx.lineTo(-WL, -s * 0.02 * sizeMul);
      ctx.lineTo(-WL, s * 0.02 * sizeMul);
      ctx.lineTo(-s * 0.18 * sizeMul, s * 0.045 * sizeMul);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Ellipse de flottaison : de jour, l'OMBRE DU SOLEIL de la coque la remplace
    // (ci-dessous) ; elle ne reste que la nuit, en fondu inverse.
    const nk = sunShadowNightK();
    if (nk > 0.01 && !floats) {
      ctx.fillStyle = 'rgba(10,25,35,' + (0.20 * nk).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.06 * sizeMul, s * 0.24 * sizeMul, s * 0.08 * sizeMul, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // COQUE : rotation d'objet PixelLab au SECTEUR du cap (8 vues, Phase 5 —
    // fini le profil penché « qui tombe »), sinon repli profil legacy amorti.
    const bob = Math.sin((now || 0) / 1600 + (sh.phase || 0)) * s * 0.015;
    if (kit) {
      // Deux bateaux qui se croisent de près se saluent (riverFleet : salute).
      // La navette des Plaisirs : vide amarrée à la Maison, presque vide au retour.
      const kstate = sh.kind === 'shuttle' && sh.at === 'maison' ? 'unload'
        : sh.kind === 'shuttle' && sh.state === 'cruise' && sh.dest === 'city' ? 'return'
          : sh.state === 'cruise' && sh.salute > 0 ? 'salute' : sh.state;
      const pose = { kit, x: p.x, y: snapDev(p.y + bob), thW, z, state: kstate, wx: wxS, wy: wyS, heading, sizeMul, at: now, alpha: ctx.globalAlpha / (prevAlpha || 1) };
      // À QUAI, ou en train de s'y ranger : le bateau est trié AVEC le ponton (item
      // 'fleetShip' du peintre, cf. drawIsoShipDeferred) — peint ici, avant la passe
      // vivante, le ponton le recouvrait.
      // (Le bac à son embarcadère aussi : il touche l'appontement.)
      if (sh.state === 'dock' || sh.state === 'board' || (sh._berthApproach || 0) > 0.35) {
        sh._defer = pose;
        // Les porteurs du ponton pendant l'escale (items 'porter' du peintre).
        const berth = sh.state === 'dock' && sh.berthId != null ? (CM.shipBerths || []).find((b) => b.id === sh.berthId) : null;
        sh._porters = berth ? dockPorters(berth, (sh.dockDwell || 0) - (sh.stateT || 0), sh.id) : null;
        sh._portersBand = band;
        ctx.globalAlpha = prevAlpha;
        continue;
      }
      sh._defer = null;
      drawKitShip(ctx, sh, pose, now);
      ctx.globalAlpha = prevAlpha;
      continue;
    }
    const isoBoat = isoArt('boat-' + vis.key + '-' + boatSector(heading));
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    if (isoBoat && isoBoat.ready) {
      // Taille ET position sur la grille de blit DEVICE (blitSnap.js) : la coque
      // avance ET tangue, donc sans ça sa coupe de lignes bougeait à chaque image
      // — le bateau fourmillait même à l'amarre. Le tangage (± un pixel) devient
      // un pas entier, comme tout le pixel-art.
      const dw = Math.max(1, snapDev(s * (BOAT_SIZES[vstage] || 0.7) * sizeMul * BOAT_IMG_K));
      // Sonde G0 : LA ligne « bateaux, à mesurer » du plan. `sizeMul` vient de
      // FLEET_SCALE, réglé pour la MASSE des coques — la densité en tombe comme
      // un reste, et c'est ce reste qu'on mesure ici, stade par stade.
      if (pxProbe.on) recPx('bateau · ' + vis.key, isoBoat.img.naturalWidth, dw);
      // Reflet à la LIGNE DE FLOTTAISON (la coque est sur l'eau, cf. isoReflect
      // 'water'), déclaré ici plutôt que deviné par colonne d'écran. Pivot PAR
      // COLONNE, reflet comme ombre : vue de biais, la coque est une DIAGONALE à
      // l'écran — sa rangée la plus basse n'est que la pointe d'un bout, et retourner
      // tout le bateau autour d'elle décollait le reflet de l'autre bout (retour Raph,
      // 2026-10-01). Chaque colonne a sa ligne de flottaison : son pixel le plus bas.
      const bx = snapDev(p.x - dw / 2), by = snapDev(p.y - dw * BOAT_IMG_TOP + bob);
      noteReflection(ctx, isoBoat.img, bx, by, dw, dw, 0, 0, 0, 0, 'column', 'water');
      drawSunShadow(ctx, isoBoat.img, bx, by, dw, dw, 0, 0, 0, 0, 'column', false);
      ctx.drawImage(isoBoat.img, bx, by, dw, dw);
      sh._hull = { img: isoBoat.img, bx, by, dw, wx: wxS, wy: wyS, a: ctx.globalAlpha, at: now };
    } else if (sh.kind !== 'trade') {
      // Repli des métiers dont l'art n'est pas encore récolté. SANS lui on ne
      // verrait rien du tout et il serait impossible de régler vitesses, voies
      // et durées avant que les sprites arrivent — or c'est précisément ce
      // réglage-là qui décide si le fleuve est vivant.
      drawIsoBoatStub(ctx, p, s, sizeMul, heading, bob, sh);
    } else if (chr && boatReady(chr)) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(tilt);
      ctx.scale((sh.dir < 0 ? -1 : 1) * sizeMul, sizeMul);
      const bimg = chr.img;
      const bfh = bimg.naturalHeight || bimg.height || 64;
      const bnf = Math.max(1, Math.round((bimg.naturalWidth || bimg.width || bfh) / bfh));
      const bf = bnf > 1 ? Math.floor((now || 0) / 140 + sh.t * 7) % bnf : 0;
      const dw = s * BOAT_SIZES[vstage], dh = dw;
      // Sonde G0 : ici `sizeMul` passe par ctx.scale, il n'est PAS dans dw — la
      // boîte réelle vaut dw × sizeMul. Sans ce facteur, le stade cosmique (le
      // plus gros multiplicateur de la table) se mesurerait 3× trop fin.
      if (pxProbe.on) recPx('bateau · ' + vstage + ' · legacy', bfh, dw * sizeMul);
      ctx.drawImage(bimg, bf * bfh, 0, bfh, bfh, -dw / 2, -dh / 2 - dh * BOAT_LIFT, dw, dh);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = prevSm;
    // Ancre écran pour la passe de nuit (drawIsoShipNight) : les feux de
    // position ne peuvent pas être peints ici, le voile passerait dessus.
    // ⚠ `vis.stage` et NON `vis.key` : la clé porte la POSE (fisher / fisher-row)
    // alors que le stade porte la COQUE. Avec la clé, un pêcheur en route serait
    // passé à côté de la liste des coques sans feux et se serait allumé.
    sh._nav = { x: p.x, y: p.y, dw: s * 0.7 * sizeMul, heading, stage: vis.stage, sector: boatSector(heading) };
    sh._navAt = now;
    ctx.globalAlpha = prevAlpha;
  }
}



// Coque du kit posée à sa pose de la frame : reflet, ombre, coque ; puis l'ancre
// de la passe de nuit (feux) et la coque que le pont redessine à sa sortie.
function drawKitShip(ctx, sh, P, now) {
  const r = drawBoat(ctx, P.kit, P.x, P.y, P.thW, P.z, now, { state: P.state, memo: sh });
  if (!r) return null;
  // Ce qui bouge par-dessus la coque : la fumée des cheminées, les lances des pompiers.
  if (r.anchors.smoke) drawSmoke(ctx, r.anchors.smoke, now, P.z, sh.id | 0, P.heading, sh.state !== 'dock' && sh.state !== 'anchor');
  if (r.model && r.model.service === 'fire' && sh.state === 'anchor') drawJets(ctx, r.anchors, now, P.z, P.heading, sh.id | 0);
  sh._hull = { img: r.img, bx: r.bx, by: r.by, dw: r.dw, wx: P.wx, wy: P.wy, a: ctx.globalAlpha, at: now, crew: r.crew };
  sh._nav = {
    x: P.x, y: P.y, dw: CM.TILE * P.z * 0.7 * P.sizeMul, heading: P.heading, stage: P.kit.id, sector: boatSector(P.heading), kit: true,
    pts: boatHasLights(P.kit) && r.anchors.port ? { port: r.anchors.port, stbd: r.anchors.stbd } : null,
    beacon: r.model && r.model.beacon && r.anchors.beacon ? r.anchors.beacon : null,
    glow: r.model && r.model.glow ? r.model.glow : null,
    lamps: r.lamps || null,
  };
  sh._navAt = now;
  return r;
}

// Le bateau à quai, peint par la passe vivante à SA profondeur (item 'fleetShip').
export function drawIsoShipDeferred(ctx, sh, now) {
  const P = sh._defer;
  if (!P || P.at !== now) return;
  const prevA = ctx.globalAlpha;
  ctx.globalAlpha = prevA * (P.alpha == null ? 1 : P.alpha);
  drawKitShip(ctx, sh, P, now);
  ctx.globalAlpha = prevA;
}

// ── RIVERAIN (port fluvial, seul depuis la refonte éolienne du moulin) posé
// sur le RUBAN (Phase 5). Sa scène legacy suppose l'eau « en bas de la boîte »
// (repère carré) → posée en boîte iso, le bassin flottait à côté du ruban. Ici
// on DÉCOMPOSE : bâtiment (sprite transparent, JAMAIS de procédural — leçon
// carré brun) sur la berge, ponton plongeant vers le SUD monde (garanti par
// layout : waterSide "S", bord sud du lot ≈ centre du fleuve), bateau de l'ère
// amarré SUR le ruban.
// ⚠ Bord d'eau calé sur le RUBAN (samples), pas le riverSet cellulaire : les
// deux divergent et c'est le ruban qu'on voit.
// Ruban AU DROIT d'une colonne x (cellules) : interpole y/hw entre les deux
// samples qui l'encadrent (le fleuve coule ~ouest→est, x ~monotone ; repli =
// sample le plus proche en x). Le sample « le plus proche du lot » ne suffit
// pas : dans un coude, son bord d'eau n'est pas celui du droit du lot (vu à la
// capture : ponton qui démarrait sur l'herbe).
function ribbonAtX(rv, x) {
  const sm = rv.samples;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < sm.length - 1; i += 1) {
    const a = sm[i], b = sm[i + 1];
    if ((a.x - x) * (b.x - x) <= 0 && Math.abs(b.x - a.x) > 1e-6) {
      const f = (x - a.x) / (b.x - a.x);
      return { y: a.y + (b.y - a.y) * f, hw: (a.hw || 2) + ((b.hw || 2) - (a.hw || 2)) * f, i };
    }
    const d = Math.abs(a.x - x);
    if (d < bd) { bd = d; bi = i; }
  }
  return { y: sm[bi].y, hw: sm[bi].hw || 2, i: bi };
}

// (blitPropAnchored : parti dans iso/isoPortProps.js, partagé avec la capitainerie
// du Vieux-Port.)

// ── Géométrie du PONTON du port + mouillage du bateau amarré ─────────────────
// Formules extraites de drawIsoRiverside (port) : le bateau amarré est devenu
// un item de tri SÉPARÉ (kind 'portBoat') — dessiné dans la scène riveraine,
// il héritait de la profondeur de l'EMPRISE du bâtiment et passait PAR-DESSUS
// la travée du pont voisin (vu par Raph, band 7). Une seule source de formules
// pour le ponton : la scène ET le mouillage lisent ce helper.
function portDockGeom(t, spanX, T, band, ei, rv) {
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return null;
  const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
  const ccx = t.gx + spanX / 2;
  const rb = ribbonAtX(rv, ccx);
  const yEdge = rb.y - rb.hw;
  const vstage = tradeStage(band, ei);
  const sizeMul = tradeSizeMul(vstage, band);
  const smR = rv.samples;
  const iA = Math.max(0, rb.i - 2), iB = Math.min(smR.length - 1, rb.i + 2);
  const mRiv = (smR[iB].y - smR[iA].y) / ((smR[iB].x - smR[iA].x) || 1e-6);
  const axisOv = (typeof window !== 'undefined' && window.__pontoonAxis) || 'auto';
  const ewAxis = axisOv === 'ew' || (axisOv !== 'ns' && Math.abs(mRiv) > 1);
  const ewSgn = mRiv > 0 ? -1 : 1;               // côté eau de l'axe E-W
  const dockW = stage === 0 ? 0.72 : Math.min(spanX * 0.5, 0.8 + sizeMul * 0.2);
  const dockLen = 0.8 + Math.max(1.0, rb.hw * 0.6);
  const dockY0 = yEdge - 0.8, dockY1 = yEdge - 0.8 + dockLen;
  const dockYew = yEdge + 0.35;
  const dockX0 = ewSgn < 0 ? ccx + 0.8 - dockLen : ccx - 0.8;
  const dockX1 = dockX0 + dockLen;
  return { stage, ccx, rb, si: rb.i, yEdge, vstage, sizeMul, ewAxis, ewSgn, dockW, dockLen, dockY0, dockY1, dockYew, dockX0, dockX1 };
}

// Point d'amarrage (en TUILES monde) : flanc historique du ponton, ou flanc
// opposé si le premier tombe sur l'EMPRISE D'UN PONT (bridgeBlocks — le
// mouillage par défaut posait le bateau sur la travée). Coincé des deux côtés →
// null : pas de bateau plutôt qu'un bateau sur le tablier.
export function portMooring(t, spanX, T, band, ei, rv) {
  if (t.oldPort || t.tradePort || t.portOffice) return null;   // bassin et terminal amarrent leurs propres navires
  const G = portDockGeom(t, spanX, T, band, ei, rv);
  if (!G || !BOAT_SIZES[G.vstage]) return null;
  const effSize = (BOAT_SIZES[G.vstage] || 0.7) * G.sizeMul;
  // PONTON AU PIXEL (iso/isoPier.js) : bord à bord le long de sa tête, sinon de son
  // tablier — mêmes garde-fous contre l'emprise des ponts.
  const pm = PIER.on ? pierMoorings(t, spanX, t.spanY || t.size || 1, band, ei, effSize) : null;
  if (pm) {
    const margin = (effSize * 0.55 + 0.3) * T;
    for (const c of pm.cands) {
      if (bridgeBlocks(c.x * T, c.y * T, margin)) continue;
      return { ...G, si: pm.si, effSize, mx: c.x, my: c.y, band, pierDir: c.along === 'pier' ? pm.dir : null };
    }
    return null;
  }
  const myNS = Math.min(G.rb.y - 0.15, G.dockY1 - effSize * 0.1);
  const cands = G.ewAxis
    ? [[(G.ewSgn < 0 ? G.dockX0 : G.dockX1) - G.ewSgn * effSize * 0.3, G.dockYew + G.dockW / 2 + effSize * 0.45],
      [(G.ewSgn < 0 ? G.dockX0 : G.dockX1) - G.ewSgn * effSize * 0.3, G.dockYew - G.dockW / 2 - effSize * 0.45]]
    : [[G.ccx - G.dockW / 2 - effSize * 0.62, myNS],
      [G.ccx + G.dockW / 2 + effSize * 0.62, myNS]];
  const margin = (effSize * 0.55 + 0.3) * T;
  for (const [mx, my] of cands) {
    if (!bridgeBlocks(mx * T, my * T, margin)) return { ...G, effSize, mx, my, band };
  }
  return null;
}

// Bateau de l'ère amarré au ponton (ombre + clapot, pas de sillage) — le corps
// du dessin est celui du bloc historique de la scène riveraine, à l'identique.
export function drawIsoPortBoat(ctx, moor, now, z, T) {
  const rv = CM.layout && CM.layout.river;
  if (!rv || !rv.samples || rv.samples.length < 2) return;
  // Le kit de bateaux a sa flotte pour cette ère : le ponton est servi par de VRAIS
  // marchands qui accostent (docs/PLAN-BATEAUX.md, lot 4), plus par un décor fixe.
  if (BOATKIT.on && fleetFor(moor.band)) return;
  const { vstage, sizeMul, si, ccx } = moor;
  const s = T * z;
  const o = rv.samples[Math.max(0, si - 1)], q = rv.samples[Math.min(rv.samples.length - 1, si + 1)];
  const a2 = worldToScreen(o.x * T, o.y * T), b2 = worldToScreen(q.x * T, q.y * T);
  const p = worldToScreen(moor.mx * T, moor.my * T);
  const bob = Math.sin((now || 0) / 1400 + ccx) * s * 0.02;
  // Amarré le long du TABLIER du ponton (rondins, sans tête) : cap selon le ponton,
  // projeté ; sinon parallèle au quai (la tête en T longe le fleuve).
  const pd = moor.pierDir;
  const heading = pd
    ? Math.atan2((pd.x + pd.y) * 0.5, pd.x - pd.y)
    : Math.atan2(b2.y - a2.y, b2.x - a2.x);
  const isoBoat = BOAT_ISO[vstage] ? isoArt('boat-' + vstage + '-' + boatSector(heading)) : null;
  const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  // Ellipse de flottaison la nuit seulement (cf. la flotte, drawIsoShips).
  const nk = sunShadowNightK();
  if (nk > 0.01) {
    ctx.fillStyle = 'rgba(10,25,35,' + (0.20 * nk).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + s * 0.06 * sizeMul, s * 0.24 * sizeMul, s * 0.08 * sizeMul, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (isoBoat && isoBoat.ready) {
    // Rotation iso au secteur du cap local du ruban (amarré parallèle au quai).
    const dw = Math.max(1, snapDev(s * (BOAT_SIZES[vstage] || 0.7) * sizeMul * 1.15));   // grille DEVICE, cf. la flotte
    if (pxProbe.on) recPx('bateau · ' + vstage + ' · amarre', isoBoat.img.naturalWidth, dw);
    const bx = snapDev(p.x - dw / 2), by = snapDev(p.y - dw * 0.58 + bob);
    // Pivot par colonne, cf. la flotte (drawIsoShips).
    noteReflection(ctx, isoBoat.img, bx, by, dw, dw, 0, 0, 0, 0, 'column', 'water');
    drawSunShadow(ctx, isoBoat.img, bx, by, dw, dw, 0, 0, 0, 0, 'column', false);
    ctx.drawImage(isoBoat.img, bx, by, dw, dw);
  } else {
    const boatKey = vstage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, moor.band)) : vstage;
    const chr = ensureBoat(boatKey);
    if (chr && boatReady(chr)) {
      // Repli profil legacy, tilt amorti comme la flotte.
      const tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(b2.y - a2.y, Math.abs(b2.x - a2.x) || 1e-6) * 0.45));
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.rotate(tilt);
      ctx.scale(sizeMul, sizeMul);
      const bimg = chr.img;
      const bfh = bimg.naturalHeight || bimg.height || 64;
      const bnf = Math.max(1, Math.round((bimg.naturalWidth || bimg.width || bfh) / bfh));
      const bf = bnf > 1 ? Math.floor((now || 0) / 260) % bnf : 0;
      const dw = s * BOAT_SIZES[vstage], dh = dw;
      ctx.drawImage(bimg, bf * bfh, 0, bfh, bfh, -dw / 2, -dh / 2 - dh * BOAT_LIFT, dw, dh);
      ctx.restore();
    }
  }
  ctx.imageSmoothingEnabled = prevSm;
}

// Largeur de dessin (tuiles) de la maison du port posée sur la grève, par sprite.
const PORT_HOUSE_W = {
  'port-prop-house': 1.45,        // cabane de pêcheurs sur pilotis
  'port-house-medieval': 1.3,     // entrepôt à pignon, porte de chargement et poulie
  'port-house-classical': 2.0,    // horreum à arcades
};

export function drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, ei) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  // Le VIEUX-PORT (bande 5+, docs/PLAN-PORTS.md) : bassin creusé, quais, forts.
  if (t.oldPort) { drawOldPort(ctx, t, band, now); return; }
  if (t.tradePort) { drawTradePort(ctx, t, band, ei, now); return; }
  if (t.portOffice) { drawPortOffice(ctx, t, band, T); return; }
  const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
  // Échelle : 1 « cellule legacy » → px iso (entre la cellule stricte T·z et la
  // pose des maisons ~1.56·T·z) ; jugée à la capture.
  const cpx = T * z * 1.3;
  const ccx = t.gx + spanX / 2;
  const rb = ribbonAtX(rv, ccx);
  const rhw = rb.hw;
  const yEdge = rb.y - rhw;              // rive NORD du ruban AU DROIT du lot
  // Tailles par ère : mêmes formules que la scène legacy (tout grandit ensemble).
  const vstage = tradeStage(band, ei);
  const sizeMul = tradeSizeMul(vstage, band);

  // ── PORT : ponton PERPENDICULAIRE au fleuve + corps de quai + bateau ────────
  // Bande 4 (Marbre) : la maison de port CLASSIQUE, comme le chemin des scènes
  // (cityEngineSprites) — le stade seul y posait un entrepôt de brique industriel.
  const stageHouse = (band === 4 && propReady('port-house-classical')) ? 'port-house-classical'
    : ['port-prop-house', 'port-house-medieval', 'port-house-industrial', 'port-house-modern'][stage];
  const ckP = 'port-cosmic-' + band;
  const HOUSE = band >= 7 && propReady(ckP) ? ckP
    : propReady(stageHouse) ? stageHouse : (propReady('port-prop-house') ? 'port-prop-house' : null);
  if (!HOUSE) return;
  // ── PONTON AU PIXEL (iso/isoPier.js, 2026-10-01) ──────────────────────────────
  // Un appontement construit (tablier, tête en T, pieux, bornes, matière de l'ère),
  // qui part de la PLAGE ; la maison du port recule sur le sable, au départ du
  // ponton, au lieu de poser son socle dans le fleuve. __pier(false) rend l'ancien
  // sprite et l'ancienne pose, ci-dessous.
  const pier = PIER.on ? drawPortPier(ctx, t, spanX, spanY, band, ei) : null;
  if (pier) {
    const foot = pierHouseFoot(pier);
    // Largeur de la maison PAR SPRITE (docs/PLAN-PORTS.md, lot P1) : les bâtiments
    // redessinés n'ont plus de socle, et leurs silhouettes diffèrent — l'entrepôt
    // médiéval est une tour à pignon (deux fois plus haute que large), l'horreum une
    // longue halle. La formule par taille de bateau donnait 2 tuiles à la tour : elle
    // écrasait la grève. Repli sur la formule pour les sprites hors table (cosmiques).
    const bWp = PORT_HOUSE_W[HOUSE]
      || (stage === 0 ? Math.min(1.6, spanX * 0.8) : Math.min(spanX * 1.05, 1.25 + sizeMul * 0.42));
    const fp = worldToScreen(foot.x * T, foot.y * T);
    blitPropAnchored(ctx, HOUSE, fp.x, fp.y, bWp * cpx);
    return;
  }
  // PONTON perpendiculaire à la TANGENTE LOCALE du ruban (retour Raph : « les
  // pontons longent le bord de l'eau au lieu d'avancer ») : tronçon ~plat
  // (fleuve O→E monde) → axe N-S monde (NE-SW écran) ; coude raide (|dy/dx|>1)
  // → axe E-W monde, plongeant du côté où l'eau vient (ouest si le fleuve fuit
  // au sud-est, est sinon). Molette : __pontoonAxis = 'auto'|'ns'|'ew'.
  // Géométrie PARTAGÉE avec le mouillage du bateau (item 'portBoat' du tri) :
  // formules dans portDockGeom, une seule source.
  const G = portDockGeom(t, spanX, T, band, ei, rv);
  if (!G) return;
  const { ewAxis, dockW, dockLen, dockY0, dockY1, dockYew, dockX0, dockX1 } = G;
  // PONTON EN VRAIE VUE ISO (retour Raph : « les pontons sont tout plats ») :
  // objet 8-dir sur pilotis. ⚠ axes MESURÉS au PCA (scratch axisAudit — la note
  // du roster était inversée) : bois ne/sw = NE-SW écran (N-S monde), bois
  // nw/se = NW-SE écran (E-W monde) ; pierre sw = N-S, pierre se = E-W ; béton
  // généré avec une flaque d'eau bakée → REBUT, la pierre sert aussi au 3+.
  // Repli : planches procédurales orientées pareil.
  const pontKey = stage >= 2 ? (ewAxis ? 'pontoon-pierre-se' : 'pontoon-pierre-sw')
    : (ewAxis ? 'pontoon-bois-nw' : 'pontoon-bois-ne');
  const pontArt = isoArt(pontKey);
  if (pontArt.ready) {
    const pd = ewAxis
      ? worldToScreen(((dockX0 + dockX1) / 2) * T, dockYew * T)
      : worldToScreen(ccx * T, ((dockY0 + dockY1) / 2) * T);
    const W3 = dockLen * T * z * 1.35;             // contenu diagonal ~74 % du canvas
    const prevDS = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pontArt.img, pd.x - W3 / 2, pd.y - W3 * 0.55, W3, W3);
    ctx.imageSmoothingEnabled = prevDS;
  } else {
    const deck = stage >= 3 ? [126, 128, 132] : stage === 2 ? [148, 140, 122] : [122, 88, 48];
    ctx.fillStyle = rgb(deck, 1);
    if (ewAxis) {
      fillWorldQuad(ctx, dockX0 * T, (dockYew - dockW / 2) * T, dockX1 * T, (dockYew + dockW / 2) * T);
      ctx.fillStyle = 'rgba(30,20,10,0.28)';
      for (let px = dockX0 + 0.3; px < dockX1 - 0.1; px += 0.34) {
        fillWorldQuad(ctx, px * T, (dockYew - dockW / 2 + 0.04) * T, (px + 0.06) * T, (dockYew + dockW / 2 - 0.04) * T);
      }
      ctx.fillStyle = 'rgba(15,20,25,0.30)';
      fillWorldQuad(ctx, (dockX0 + 0.2) * T, (dockYew + dockW / 2 - 0.07) * T, dockX1 * T, (dockYew + dockW / 2) * T);
    } else {
      fillWorldQuad(ctx, (ccx - dockW / 2) * T, dockY0 * T, (ccx + dockW / 2) * T, dockY1 * T);
      ctx.fillStyle = 'rgba(30,20,10,0.28)';
      for (let py = dockY0 + 0.3; py < dockY1 - 0.1; py += 0.34) {
        fillWorldQuad(ctx, (ccx - dockW / 2 + 0.04) * T, py * T, (ccx + dockW / 2 - 0.04) * T, (py + 0.06) * T);
      }
      ctx.fillStyle = 'rgba(15,20,25,0.30)';
      fillWorldQuad(ctx, (ccx + dockW / 2 - 0.07) * T, (dockY0 + 0.2) * T, (ccx + dockW / 2) * T, dockY1 * T);
    }
  }
  // CORPS de quai sur la berge (recouvre le raccord du ponton).
  const bWc = stage === 0 ? Math.min(1.6, spanX * 0.8) : Math.min(spanX * 1.05, 1.25 + sizeMul * 0.42);
  const W = bWc * cpx;
  // Base qui mord le bord du ruban : le corps de quai s'assoit SUR la rive, sa
  // frange basse (cale/vaguelettes bakées) touche l'eau et recouvre le départ du
  // ponton. Ancrage par le BAS DU CONTENU, hauteur à l'aspect naturel.
  const base = worldToScreen(ccx * T, (yEdge + 0.1) * T);
  blitPropAnchored(ctx, HOUSE, base.x, base.y, W);
  // (Le BATEAU AMARRÉ n'est plus dessiné ici : item 'portBoat' du tri peintre,
  // poussé par drawIsoLive à SA profondeur — dessiné dans la scène, il héritait
  // de la profondeur de l'emprise du bâtiment et passait PAR-DESSUS la travée
  // du pont voisin. Cf. portMooring/drawIsoPortBoat.)
}

