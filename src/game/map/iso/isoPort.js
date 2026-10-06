// LE PORT FLUVIAL — ce qui vit AU BORD de l'eau, et dessus.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Deux morceaux qui n'en font qu'un :
//   · la FLOTTE (`CM.ships`) posée sur le ruban projeté ;
//   · le QUAI — le riverain : la maison du port et son ponton au pixel.
//
// (Audit du 05/10, MORT-6 — retirés le 2026-10-06 avec les A/B `__boatKit({ on: false })`
//  et `__pier(false)` : les coques en sprites de la flotte, leur repli « profil » et la
//  barque de réglage ; le bateau de DÉCOR amarré au ponton, item 'portBoat', qui ne
//  dessinait plus rien depuis que de vrais marchands y accostent ; l'ancien ponton
//  sprité et ses planches de repli. Sprites gardés comme source dans
//  art/references-ab/.)
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe (le
// 2026-08-23 : zéro dépendance entrante, quatre sortantes — un historique, le
// module a grandi depuis). Vérifiée ligne à ligne contre la version commitée.
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
import { orbitPoint, shipAlpha, ferryDeckHidden } from '../riverFleet.js';
import { tradeStage, tradeSizeMul, shipVisual, riverDodge } from './isoFleet.js';
import { snapDev } from '../blitSnap.js';
import { sunShadowNightK } from './isoSunShadow.js';
import { drawPortPier, pierHouseFoot } from './isoPier.js';
import { drawOldPort, drawPortOffice } from './isoOldPort.js';
import { drawTradePort } from './isoTradePort.js';
import { boatSpecFor, boatSizeMul, boatHasLights, drawBoat } from './boatKit.js';
import { dockPorters } from './boatBerths.js';
import { BOAT_MODELS } from './boatKits.js';
import { drawSmoke, drawJets } from './boatFx.js';

// ── BATEAUX : la flotte (CM.ships) sur le ruban projeté ──────────────────────
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
  // Les aspects sont CONSTANTS sur la frame (même ère pour tous) : on les
  // calcule une fois. Le pêcheur en a deux — sans sillage à l'ancre, avec en
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
    // BATEAUX DESSINÉS PAR LE CODE (docs/PLAN-BATEAUX.md) : chaque ère a sa flotte
    // (boatKits.BAND_FLEET, bandes 0 à 9), le bateau est tiré parmi les modèles de son
    // métier et cuit à son cap. Sans modèle (cas impossible, gardé par boatKitCover.test),
    // rien n'est posé.
    const kit = boatSpecFor(sh, band);
    if (!kit) { sh._hull = null; sh._defer = null; continue; }
    // Le passeur garde SES places d'une traversée à l'autre : ce sont les voyageurs qui
    // changent — ceux qui attendaient au ponton (boatScenes, sh._passNames ; lot 5 de
    // PLAN-COMPORTEMENTS). La graine suivait le voyage : sur le pont, d'autres gens.
    // Les coques qui LÉVITENT ne laissent ni sillage ni ellipse sur l'eau.
    const floats = !!(BOAT_MODELS[kit.id] && BOAT_MODELS[kit.id].hover);
    const sizeMul = boatSizeMul(kit);
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
    const orbIle = sh.orbit ? (rv.islands || [])[0] : null;
    // `thW` = cap MONDE (le kit cuit dans le repère du monde ; `heading` est l'angle écran).
    let p, heading, wxS, wyS, thW;
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
      const effSize = 0.7 * sizeMul;
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
    // suit la pente ; la coque, elle, est cuite à son cap par le kit).
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
    // COQUE : le modèle du kit, cuit à son cap (boatKit.drawBoat).
    const bob = Math.sin((now || 0) / 1600 + (sh.phase || 0)) * s * 0.015;
    // Deux bateaux qui se croisent de près se saluent (riverFleet : salute).
    // La navette des Plaisirs : vide amarrée à la Maison, presque vide au retour.
    const kstate = sh.kind === 'shuttle' && sh.at === 'maison' ? 'unload'
      : sh.kind === 'shuttle' && sh.state === 'cruise' && sh.dest === 'city' ? 'return'
        : sh.state === 'cruise' && sh.salute > 0 ? 'salute' : sh.state;
    const pose = { kit, x: p.x, y: snapDev(p.y + bob), thW, z, state: kstate, wx: wxS, wy: wyS, heading, sizeMul, at: now, alpha: ctx.globalAlpha / (prevAlpha || 1) };
    if (sh.kind === 'ferry') { pose.passNames = sh._passNames || null; pose.hidePass = ferryDeckHidden(sh); }
    // À QUAI, ou en train de s'y ranger : le bateau est trié AVEC le ponton (item
    // 'fleetShip' du peintre, cf. drawIsoShipDeferred) — peint ici, avant la passe
    // vivante, le ponton le recouvrait.
    // (Le bac à son embarcadère aussi : il touche l'appontement.)
    // Au QUAI DU TERMINAL de commerce (sh.quay, riverFleet.quayOf), tant qu'il y manœuvre :
    // la scène du terminal le peint (drawQuayShips), l'item n'est que son repli.
    if (sh.state === 'dock' || sh.state === 'board' || (sh._berthApproach || 0) > 0.35 || sh.quay != null) {
      sh._defer = pose;
      // Les porteurs du ponton pendant l'escale (items 'porter' du peintre).
      const berth = sh.state === 'dock' && sh.berthId != null ? (CM.shipBerths || []).find((b) => b.id === sh.berthId) : null;
      sh._porters = berth ? dockPorters(berth, (sh.dockDwell || 0) - (sh.stateT || 0), sh.id, sh.dockDwell || Infinity) : null;
      sh._portersBand = band;
      ctx.globalAlpha = prevAlpha;
      continue;
    }
    sh._defer = null;
    drawKitShip(ctx, sh, pose, now);
    ctx.globalAlpha = prevAlpha;
  }
}



// Coque du kit posée à sa pose de la frame : reflet, ombre, coque ; puis l'ancre
// de la passe de nuit (feux) et la coque que le pont redessine à sa sortie.
function drawKitShip(ctx, sh, P, now) {
  const r = drawBoat(ctx, P.kit, P.x, P.y, P.thW, P.z, now, { state: P.state, memo: sh, passNames: P.passNames, hidePass: P.hidePass });
  if (!r) return null;
  if (r.pass) sh._deckSlots = r.pass;          // les places des voyageurs (boatScenes)
  // Ce qui bouge par-dessus la coque : la fumée des cheminées, les lances des pompiers.
  if (r.anchors.smoke) drawSmoke(ctx, r.anchors.smoke, now, P.z, sh.id | 0, P.heading, sh.state !== 'dock' && sh.state !== 'anchor');
  if (r.model && r.model.service === 'fire' && sh.state === 'anchor') drawJets(ctx, r.anchors, now, P.z, P.heading, sh.id | 0);
  // `dh`, `iw`, `ih` : le canvas de la coque n'est plus carré (boatKit, PERF-36).
  sh._hull = { img: r.img, bx: r.bx, by: r.by, dw: r.dw, dh: r.dh, iw: r.iw, ih: r.ih, wx: P.wx, wy: P.wy, a: ctx.globalAlpha, at: now, crew: r.crew };
  sh._nav = {
    x: P.x, y: P.y,
    pts: boatHasLights(P.kit) && r.anchors.port ? { port: r.anchors.port, stbd: r.anchors.stbd } : null,
    beacon: r.model && r.model.beacon && r.anchors.beacon ? r.anchors.beacon : null,
    glow: r.model && r.model.glow ? r.model.glow : null,
    lamps: r.lamps || null,
  };
  sh._navAt = now;
  return r;
}

// Le bateau à quai, peint par la passe vivante à SA profondeur (item 'fleetShip').
// Une fois par image : déjà peint par la scène du terminal (drawQuayShips), rien.
export function drawIsoShipDeferred(ctx, sh, now) {
  const P = sh._defer;
  if (!P || P.at !== now || P.drawn) return;
  const prevA = ctx.globalAlpha;
  ctx.globalAlpha = prevA * (P.alpha == null ? 1 : P.alpha);
  drawKitShip(ctx, sh, P, now);
  ctx.globalAlpha = prevA;
  P.drawn = true;
}

// LES MARCHANDS AU QUAI DU TERMINAL DE COMMERCE (audit du 2026-10-05, BUG-17) : peints
// par sa scène (isoTradePort.drawTradePort), dans l'ordre de ses navires-décor — sur son
// terre-plein, sous la flèche de ses portiques. L'item 'fleetShip', trié juste après le
// terminal (isoLiveCollect), ne les peint plus que si la scène ne l'a pas fait (hors
// champ, terminal éteint).
function drawQuayShips(ctx, tile, now) {
  for (const sh of CM.ships || []) {
    const P = sh._defer;
    if (P && P.at === now && sh.quay === tile) drawIsoShipDeferred(ctx, sh, now);
  }
}

// ── RIVERAIN (port fluvial, seul depuis la refonte éolienne du moulin) posé
// sur le RUBAN (Phase 5). Sa scène legacy suppose l'eau « en bas de la boîte »
// (repère carré) → posée en boîte iso, le bassin flottait à côté du ruban. Ici
// on DÉCOMPOSE : bâtiment (sprite transparent, JAMAIS de procédural — leçon
// carré brun) sur la plage, ponton au pixel vers le large (iso/isoPier.js), où
// les marchands de la flotte accostent (boatBerths).
// (blitPropAnchored : parti dans iso/isoPortProps.js, partagé avec la capitainerie
// du Vieux-Port.)
// (La géométrie de l'ANCIEN ponton — portDockGeom, ribbonAtX — et le bateau de décor
//  amarré — portMooring, drawIsoPortBoat, item 'portBoat' — sont partis avec l'A/B
//  `__pier(false)`, audit du 05/10, MORT-6.)

// Largeur de dessin (tuiles) de la maison du port posée sur la grève, par sprite.
const PORT_HOUSE_W = {
  'port-prop-house': 1.45,        // cabane de pêcheurs sur pilotis
  'port-house-medieval': 2.0,     // maison de pêcheurs basse sous un grand toit (2026-10-03)
  'port-house-classical': 2.0,    // horreum à arcades (vue de coin, 2026-10-03)
};
// Où tombe la POINTE AVANT du sprite (coin sud-est de l'emprise, son pixel le plus bas),
// en fraction de la largeur du contenu depuis la gauche : la face gauche (sud) en
// occupe cette part, la droite (est) le reste. Mesuré sur les PNG (le bas du contenu).
const PORT_HOUSE_R = {
  'port-prop-house': 0.5,
  'port-house-medieval': 0.48,   // filets et séchoir sur la face gauche, porte à bateaux au pignon
  'port-house-classical': 0.68,   // horreum redessiné en vue de coin : la longue façade à arcades à gauche
};

export function drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, ei) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  // Le VIEUX-PORT (bande 5+, docs/PLAN-PORTS.md) : bassin creusé, quais, forts.
  if (t.oldPort) { drawOldPort(ctx, t, band, now); return; }
  if (t.tradePort) { drawTradePort(ctx, t, band, ei, now, (c) => drawQuayShips(c, t.gx + ',' + t.gy, now)); return; }
  if (t.portOffice) { drawPortOffice(ctx, t, band, T); return; }
  const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
  // Échelle : 1 « cellule legacy » → px iso (entre la cellule stricte T·z et la
  // pose des maisons ~1.56·T·z) ; jugée à la capture.
  const cpx = T * z * 1.3;
  // Tailles par ère : mêmes formules que la scène legacy (tout grandit ensemble).
  const vstage = tradeStage(band, ei);
  const sizeMul = tradeSizeMul(vstage, band);

  // ── PORT : ponton PERPENDICULAIRE au fleuve + maison du port sur la plage ───
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
  // ponton, au lieu de poser son socle dans le fleuve.
  // Sans géométrie de ponton, rien n'est posé : jamais vu (360 ports, 60 graines,
  // bandes 0 à 4 — audit du 05/10, MORT-6). L'ancien ponton sprité, ses planches de
  // repli et la maison posée au bord du ruban sont partis avec l'A/B `__pier(false)`.
  const pier = drawPortPier(ctx, t, spanX, spanY, band, ei);
  if (!pier) return;
  // Largeur de la maison PAR SPRITE (docs/PLAN-PORTS.md, lot P1) : les bâtiments
  // redessinés n'ont plus de socle, et leurs silhouettes diffèrent — l'entrepôt
  // médiéval est une tour à pignon (deux fois plus haute que large), l'horreum une
  // longue halle. La formule par taille de bateau donnait 2 tuiles à la tour : elle
  // écrasait la grève. Repli sur la formule pour les sprites hors table (cosmiques).
  const bWp = PORT_HOUSE_W[HOUSE]
    || (stage === 0 ? Math.min(1.6, spanX * 0.8) : Math.min(spanX * 1.05, 1.25 + sizeMul * 0.42));
  // L'emprise au sol se déduit du dessin : un bâtiment de w × d tuiles fait (w + d)
  // tuiles de large à l'écran, partagées à la pointe avant. Sa face vers l'eau est
  // centrée sur l'axe du ponton (pierHouseFoot) ; blitPropAnchored pose le MILIEU du
  // contenu, la pointe en est décalée de (r − ½) de la largeur.
  const r = PORT_HOUSE_R[HOUSE] != null ? PORT_HOUSE_R[HOUSE] : 0.5;
  const span = bWp * cpx / (T * z);
  const foot = pierHouseFoot(pier, span * r, span * (1 - r));
  const fp = worldToScreen(foot.x * T, foot.y * T);
  blitPropAnchored(ctx, HOUSE, fp.x - (r - 0.5) * bWp * cpx, fp.y, bWp * cpx);
}

