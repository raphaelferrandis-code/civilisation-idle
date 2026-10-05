"use strict";
// ── LE VIEUX-PORT : un bassin creusé dans la ville (docs/PLAN-PORTS.md, lot P3) ──
//
// Demande de Raph (2026-10-01) : « un port plaisancier type port de Marseille », et
// son choix le soir même : un VRAI bassin creusé dans la berge, pas une marina posée
// sur le fleuve. Le layout le creuse au XIXe (bande 5), là où était le port de la
// grève (map/portSites.js, cityCore.ports.old) : ses cases deviennent de l'eau, un
// anneau de quai l'entoure (deux rangées au nord, une à l'ouest et à l'est), son
// entrée s'ouvre sur le fleuve au sud. Ce module le DESSINE :
//   · l'EAU du bassin : la même que le fleuve (corps, surface animée, voile d'ère,
//     reflets), par le crochet d'isoRiver `setRiverExtraWater` ;
//   · les QUAIS de pierre et leurs murs qui plongent dans le bassin, des bornes ;
//   · bande 5 : pêcheurs et voiliers amarrés cul à quai, à la méditerranéenne ;
//     bande 6+ : la MARINA — pontons flottants et rangées de bateaux de plaisance ;
//   · à l'entrée, deux GARDIENS : une tour carrée crénelée à l'ouest (le fort
//     Saint-Jean), un phare blanc à l'est.
// DEUX PASSES : tout ce qui est au ras de l'eau (l'eau, les quais, les murs, les
// pontons, les bateaux) passe SOUS les bâtiments, avec le fleuve (paintOldPortUnder,
// appelée par la passe des quais) ; seuls les gardiens, debout, entrent au tri du
// peintre (drawOldPort, scène riveraine de la tuile du port).
import { CM } from '../layout.js';
import { quayWallTiles, quayWallTune } from '../quaysAndRiot.js';
import { bakeBoxes, blitLayer, paintBakeUnder, h01, mul, mix, FACE_LIGHT, faceLit } from './isoBoxBake.js';
import { drawMooredHull, hullFootprint, riverEdgeAt, riverWaterAt, riverWindow, registerPortProvider, registerPortLamps, quayJoin } from './portBerths.js';
import { queueFlameGlow } from '../flameGlow.js';
import { depthOf, worldToScreen } from './projection.js';
import { BASIN_NORTH_QUAY } from '../portSites.js';
import { setRiverExtraWater } from './isoRiver.js';
import { propReady } from '../cityEngineSprites.js';
import { blitPropAnchored } from './isoPortProps.js';
import { rippleField, noteRipples } from './waterRipples.js';

export const OLDPORT = { on: true, shadow: true, reflect: true, ink: true };
if (typeof window !== 'undefined') {
  window.__oldPort = (o) => {
    if (o === false) OLDPORT.on = false;
    else if (o === true) OLDPORT.on = true;
    else if (o && typeof o === 'object') Object.assign(OLDPORT, o);
    _cache.clear();
    return { ...OLDPORT };
  };
}

const PAL = {
  top: [[198, 190, 172], [190, 182, 164], [206, 198, 180]], gap: [150, 142, 126], coping: [226, 220, 204],
  wall: [174, 164, 146], bollard: [52, 50, 48], bollardTop: [92, 90, 86],
  deck: [[150, 132, 108], [140, 124, 100], [158, 140, 114]], deckGap: [96, 84, 68], float: [214, 218, 222],
  fort: [196, 178, 146], fortD: [168, 150, 122], fortGap: [140, 124, 100], flag: [190, 52, 46], pole: [70, 66, 60],
  light: [236, 236, 230], lightBand: [186, 58, 50], lamp: [255, 214, 120], lantern: [70, 74, 80],
  rope: [74, 62, 48], crate: [150, 116, 78], crateTop: [178, 144, 102], net: [118, 104, 82], netGap: [92, 80, 62],
};

// ── LE PLAN : boîtes en px monde ─────────────────────────────────────────────
function oldPortPlan(b, band, T, sm) {
  const wh = quayWallTiles(band) * quayWallTune.heightK;
  const gx = b.gx, gy = b.gy, w = b.w;
  const yEw = riverEdgeAt(sm, gx - 0.5, 'N'), yEe = riverEdgeAt(sm, gx + w + 0.5, 'N');
  const yE0 = riverEdgeAt(sm, gx + 0.05, 'N'), yE1 = riverEdgeAt(sm, gx + w - 0.05, 'N');
  const low = [], high = [];
  const box = (arr, part, x0, x1, y0, y1, z0, z1, extra) => arr.push({ part, X0: x0 * T, X1: x1 * T, Y0: y0 * T, Y1: y1 * T, Z0: z0 * T, Z1: z1 * T, ...extra });
  // Quais (dalles au ras du sol) : nord sur deux rangées, ouest et est jusqu'au fleuve.
  box(low, 'quay', gx - 1, gx + w + 1, gy - BASIN_NORTH_QUAY, gy, -0.02, 0, { noShadow: true, noMirror: true });
  box(low, 'quay', gx - 1, gx, gy, yEw, -0.02, 0, { noShadow: true, noMirror: true });
  box(low, 'quay', gx + w, gx + w + 1, gy, yEe, -0.02, 0, { noShadow: true, noMirror: true });
  // Murs qui plongent dans l'eau, là où l'œil les voit : le fond (nord) et le flanc
  // ouest du bassin, et les deux bouts de quai face au fleuve.
  box(low, 'wall', gx, gx + w, gy - 0.06, gy, -wh, 0, { noShadow: true, noMirror: true });
  box(low, 'wall', gx - 0.06, gx, gy, Math.max(gy, yE0), -wh, 0, { noShadow: true, noMirror: true });
  box(low, 'wall', gx - 1, gx, yEw - 0.06, yEw, -wh, 0, { noShadow: true, noMirror: true });
  box(low, 'wall', gx + w, gx + w + 1, yEe - 0.06, yEe, -wh, 0, { noShadow: true, noMirror: true });
  // RACCORDS avec le quai du fleuve : il reprend au premier sample hors de la coupure
  // du port (bout carré), jusqu'à 1,5 tuile plus loin que l'anneau du bassin — sans ce
  // bout de quai, un coin d'herbe restait entre les deux maçonneries.
  // ⚠ Retour Raph (2026-10-04, trou d'eau entre le quai et le fort) : le raccord suit la
  // BERGE, par bandes d'un quart de tuile, de la hauteur du bout du quai (`yL`/`yR`, son
  // vrai bord d'eau) à celle de l'anneau (yEw/yEe). D'une seule dalle à plat, posée au
  // bord sous son milieu, il finissait 0,14 tuile en retrait du quai là où la berge
  // penche : un trait d'eau d'un pixel restait entre les deux murs.
  const join = quayJoin(sm, gx - 1, gx + w + 1);
  if (join) {
    for (const [xa, xb, ya, yb] of [[join.xL, gx - 1, join.yL, yEw], [gx + w + 1, join.xR, yEe, join.yR]]) {
      if (!(xb - xa > 0.05)) continue;
      const n = Math.max(1, Math.ceil((xb - xa) / 0.25));
      for (let k = 0; k < n; k += 1) {
        const sa = xa + (xb - xa) * k / n, sb = xa + (xb - xa) * (k + 1) / n;
        const f = (k + 0.5) / n, ye = Math.round((ya != null ? ya : yb) * (1 - f) * T + (yb != null ? yb : ya) * f * T) / T;
        box(low, 'quay', sa, sb, ye - 1, ye, -0.02, 0, { noShadow: true, noMirror: true, join: true });
        box(low, 'wall', sa, sb, ye - 0.06, ye, -wh, 0, { noShadow: true, noMirror: true, join: true });
      }
    }
  }
  // Bornes d'amarrage.
  for (let x = gx + 0.35; x < gx + w - 0.1; x += 0.7) box(low, 'bollard', x, x + 0.08, gy - 0.18, gy - 0.1, 0, 0.08, { noMirror: true });
  for (let y = gy + 0.4; y < yE0 - 0.3; y += 0.7) box(low, 'bollard', gx - 0.18, gx - 0.1, y, y + 0.08, 0, 0.08, { noMirror: true });
  // ── LE BASSIN AMÉNAGÉ (Raph, 2026-10-02, sur une capture de la bande 5) ──────
  // « Ça ne va pas de voir le pêcheur dans son bateau, ce n'est pas logique ; il faut
  // aussi des escaliers et des pontons. » D'où un bassin qu'on peut PARCOURIR :
  //   · un PONTON flottant le long du quai du fond, au niveau de l'eau, relié au quai
  //     par des PASSERELLES inclinées ;
  //   · des ESCALIERS de pierre qui descendent à l'eau le long des deux murs latéraux
  //     (même pas que ceux du quai du fleuve, isoQuay : marches de 2 px sur 4 de giron,
  //     palier haut de 8 px, palier bas de 6 px, 0,3 tuile de large), dans le sens où
  //     le mur DESCEND à l'écran (vers le sud) — l'autre sens s'écrase en damier ;
  //   · des bateaux AMARRÉS, VIDES (le kit de bateaux ne construit pas d'équipage à
  //     quai), retenus par leurs AMARRES au ponton ou aux bornes du quai ;
  //   · bande 5 : à la méditerranéenne, cul au ponton, et le coin des pêcheurs à couple
  //     le long du quai ouest, au pied de l'escalier ; bande 6+ : la marina, des pannes
  //     accrochées au ponton, les bateaux de part et d'autre.
  const boats = [];
  const marina = band >= 6;
  // L'EAU DU BASSIN est au pied des murs, `wh` sous les quais : pontons et bateaux y
  // flottent (posés au niveau du sol, ils chevauchaient la face du mur).
  const zw = -wh;
  const mzw = zw * T;
  const yIn = Math.min(yE0, yE1) - 0.25;           // le fond d'eau commun aux deux flancs
  const px = 1 / T;                                // un pixel d'art, en tuiles
  // Escalier le long d'un mur latéral, de x0 à x1, palier haut au quai à yTop ; rend
  // l'ordonnée du bas de la volée (palier au ras de l'eau compris).
  const stairs = (x0, x1, yTop) => {
    const n = Math.max(2, Math.ceil((wh * T) / 2) - 1);
    box(low, 'stair', x0, x1, yTop, yTop + 8 * px, zw, 0, { mz: mzw, noShadow: true });
    let y = yTop + 8 * px;
    for (let i = 1; i <= n; i += 1) {
      box(low, 'stair', x0, x1, y, y + 4 * px, zw, -Math.min(wh - px, i * 2 * px), { mz: mzw, noShadow: true, step: i });
      y += 4 * px;
    }
    box(low, 'stair', x0, x1, y, y + 6 * px, zw, zw + px, { mz: mzw, noShadow: true, landing: true });
    return y + 6 * px;
  };
  // Passerelle inclinée du quai (z = 0, y = gy) jusqu'au ponton (z = zw, y = yB) : une
  // marche de petites boîtes au pas d'un pixel d'art (le moteur n'a que des boîtes
  // droites), deux filins de garde-corps.
  const gangway = (xg, yB) => {
    const yA = gy - 0.03, zA = 0, zB = zw + 0.05;
    const n = Math.max(4, Math.round(((yB - yA) * T) / 1.5));
    for (let i = 0; i < n; i += 1) {
      const ya = yA + ((yB - yA) * i) / n, yb = yA + ((yB - yA) * (i + 1)) / n;
      const z = zA + ((zB - zA) * (i + 0.5)) / n;
      box(low, 'gangway', xg - 0.1, xg + 0.1, ya, yb, z - 0.035, z, { mz: mzw, noShadow: true });
      for (const sd of [-1, 1]) box(low, 'rope', xg + sd * 0.1 - 0.012, xg + sd * 0.1 + 0.012, ya, yb, z + 0.11, z + 0.13, { noMirror: true, noShadow: true });
    }
    for (const sd of [-1, 1]) for (const [yy, zz] of [[yA + 0.02, zA], [yB - 0.02, zB]]) {
      box(low, 'post', xg + sd * 0.1 - 0.02, xg + sd * 0.1 + 0.02, yy - 0.02, yy + 0.02, zz, zz + 0.14, { noMirror: true, noShadow: true });
    }
  };
  // Les deux escaliers latéraux.
  const yStW = stairs(gx, gx + 0.3, gy + 0.22);
  stairs(gx + w - 0.3, gx + w, gy + 0.22);
  // Le ponton du fond et ses passerelles (deux, trois sur un grand bassin), loin des
  // escaliers et pas devant la capitainerie du quai du fond.
  const yP0 = gy + 0.78, yP1 = gy + 1.02;
  const xP0 = gx + 0.5, xP1 = gx + w - 0.5;
  box(low, 'pontoonEW', xP0, xP1, yP0, yP1, zw, zw + 0.05, { noShadow: true, mz: mzw });
  const nG = w >= 9 ? 3 : 2;
  for (let k = 0; k < nG; k += 1) gangway(xP0 + 0.35 + ((xP1 - xP0 - 0.7) * k) / Math.max(1, nG - 1), yP0 + 0.02);
  // Taquets du ponton (où les amarres se prennent).
  for (let x = xP0 + 0.2; x < xP1 - 0.1; x += 0.52) box(low, 'bollard', x, x + 0.05, yP1 - 0.06, yP1 - 0.01, zw + 0.05, zw + 0.09, { noMirror: true, noShadow: true });
  // Amarres : [x, y, z] côté bateau → [x, y, z] côté ponton/quai, en tuiles.
  const rope2 = (a, b) => [a[0], a[1], a[2], b[0], b[1], b[2]];
  const zDeck = zw + 0.1;
  if (marina) {
    // MARINA : des pannes accrochées au ponton du fond, bateaux de part et d'autre.
    const nP = Math.max(2, Math.floor((w - 1.2) / 2));
    const sailOk = !!hullFootprint('sail', band).kit;
    const y1 = gy + (yIn - gy) * 0.88;
    const xpOf = (k) => xP0 + 0.3 + ((xP1 - xP0 - 0.6) * (k + 0.5)) / nP;
    for (let k = 0; k < nP; k += 1) {
      const xp = xpOf(k);
      box(low, 'pontoon', xp - 0.1, xp + 0.1, yP1, y1, zw, zw + 0.045, { noShadow: true, mz: mzw });
      for (let y = yP1 + 0.3; y < y1 - 0.2; y += 0.56) {
        for (const sd of [-1, 1]) {
          if (h01(k * 7 + (sd > 0 ? 1 : 0), Math.round(y * 10), 41) < 0.18) continue;   // une place libre
          const r = h01(k, Math.round(y * 10) + sd, 43);
          const role = sailOk
            ? (r < 0.4 ? 'motorboat' : r < 0.68 ? 'sail' : r < 0.88 ? 'dinghy' : 'rowboat')
            : (r < 0.62 ? 'motorboat' : r < 0.86 ? 'dinghy' : 'rowboat');
          // LA PLACE se mesure : entre deux pannes, chacune a la moitié de l'eau ; au
          // bord, jusqu'aux escaliers. Une coque trop longue cède la place à une plus
          // petite (sinon les vedettes de deux pannes voisines se chevauchaient).
          const nb = k + sd;
          const room = (nb < 0 ? xp - (gx + 0.38) : nb >= nP ? (gx + w - 0.38) - xp : Math.abs(xpOf(nb) - xp) / 2) - 0.13 - 0.04;
          let role2 = role, fp = hullFootprint(role2, band);
          for (const alt of ['dinghy', 'rowboat']) { if (fp.len <= room) break; role2 = alt; fp = hullFootprint(role2, band); }
          if (fp.len > room) continue;
          const bx = xp + sd * (0.1 + fp.len * 0.5 + 0.03);
          const by = y + 0.1;
          const edge = xp + sd * 0.1;
          boats.push({
            role: role2, x: bx, y: by, heading: sd > 0 ? Math.atan2(0.5, 1) : Math.atan2(-0.5, -1),
            lines: [rope2([bx - sd * fp.len * 0.42, by - fp.beam * 0.3, zDeck], [edge, by - 0.12, zw + 0.06]),
              rope2([bx + sd * fp.len * 0.1, by + fp.beam * 0.3, zDeck], [edge, by + 0.18, zw + 0.06])],
          });
        }
      }
    }
  } else {
    // Bande 5 : à la méditerranéenne, CUL AU PONTON, proue vers le sud ; deux amarres
    // de poupe au ponton.
    for (let x = xP0 + 0.25; x < xP1 - 0.2; x += 0.52) {
      if (h01(Math.round(x * 10), 3, 47) < 0.18) continue;
      const rr = h01(Math.round(x * 10), 5, 49), role = rr < 0.45 ? 'fisher' : rr < 0.75 ? 'dinghy' : 'rowboat';   // pas de cogue médiévale au XIXe
      const fp = hullFootprint(role, band);
      const yc = yP1 + 0.04 + fp.len * 0.5;
      const ys = yc - fp.len * 0.46;
      boats.push({
        role, x, y: yc, heading: Math.atan2(0.5, -1),
        lines: [rope2([x - fp.beam * 0.3, ys, zDeck], [x - 0.13, yP1, zw + 0.07]), rope2([x + fp.beam * 0.3, ys, zDeck], [x + 0.13, yP1, zw + 0.07])],
      });
    }
    // LE COIN DES PÊCHEURS : à couple le long du quai ouest, au pied de l'escalier,
    // proue au sud, amarrés aux bornes du quai.
    for (let y = yStW + 0.25; y < yIn - 0.3;) {
      const role = h01(9, Math.round(y * 10), 51) < 0.7 ? 'fisher' : 'rowboat';
      const fp = hullFootprint(role, band);
      if (y + fp.len > yIn - 0.1) break;
      const yc = y + fp.len * 0.5, xc = gx + 0.07 + fp.beam * 0.5 + 0.04;
      boats.push({
        role, x: xc, y: yc, heading: Math.atan2(0.5, -1),
        // Aux ANNEAUX scellés dans le mur, un peu au-dessus de l'eau : tirées jusqu'aux
        // bornes du quai, les amarres montaient en diagonale et se lisaient comme des mâts.
        lines: [[...rope2([xc - fp.beam * 0.45, yc - fp.len * 0.4, zDeck], [gx + 0.005, yc - fp.len * 0.55, zw + wh * 0.35]), 1],
          [...rope2([xc - fp.beam * 0.45, yc + fp.len * 0.38, zDeck], [gx + 0.005, yc + fp.len * 0.55, zw + wh * 0.35]), 1]],
      });
      y += fp.len + 0.14;
    }
    // Sur le quai du fond : caisses de poisson et filets qui sèchent (pas devant la
    // capitainerie, au milieu du quai).
    const ox = gx + Math.floor(w / 2) - 1;
    for (let x = gx + 0.2; x < gx + w - 0.2; x += 0.9) {
      if (x > ox - 0.4 && x < ox + 2.4) continue;
      const r = h01(Math.round(x * 10), 7, 53);
      if (r < 0.35) box(low, 'crate', x, x + 0.18, gy - 0.44, gy - 0.28, 0, 0.12, { noMirror: true });
      else if (r < 0.7) box(low, 'net', x, x + 0.36, gy - 0.46, gy - 0.26, 0, 0.035, { noMirror: true, noShadow: true });
    }
  }
  // LES GARDIENS DE L'ENTRÉE (debout, au tri du peintre) : miroir sous le mur.
  const mz = -wh * T;
  // Tour carrée crénelée (le fort Saint-Jean), à l'ouest.
  const fx0 = gx - 1.15, fx1 = gx + 0.12, fy1 = yEw + 0.05, fy0 = fy1 - 1.2, fh = 1.35;
  box(high, 'fort', fx0, fx1, fy0, fy1, 0, fh, { mz });
  for (let x = fx0; x < fx1 - 0.05; x += 0.26) {
    box(high, 'merlon', x, x + 0.13, fy1 - 0.13, fy1, fh, fh + 0.13, { mz });
    box(high, 'merlon', x, x + 0.13, fy0, fy0 + 0.13, fh, fh + 0.13, { mz });
  }
  for (let y = fy0; y < fy1 - 0.05; y += 0.26) {
    box(high, 'merlon', fx1 - 0.13, fx1, y, y + 0.13, fh, fh + 0.13, { mz });
    box(high, 'merlon', fx0, fx0 + 0.13, y, y + 0.13, fh, fh + 0.13, { mz });
  }
  box(high, 'pole', fx0 + 0.55, fx0 + 0.6, fy0 + 0.55, fy0 + 0.6, fh, fh + 0.75, { mz, noMirror: true });
  box(high, 'flag', fx0 + 0.6, fx0 + 0.95, fy0 + 0.55, fy0 + 0.58, fh + 0.5, fh + 0.72, { mz, noMirror: true });
  // Phare blanc à bande rouge, à l'est.
  const lx0 = gx + w + 0.22, lx1 = lx0 + 0.56, ly1 = yEe - 0.1, ly0 = ly1 - 0.56, lh = 1.95;
  box(high, 'light', lx0, lx1, ly0, ly1, 0, lh, { mz });
  box(high, 'gallery', lx0 - 0.08, lx1 + 0.08, ly0 - 0.08, ly1 + 0.08, lh, lh + 0.06, { mz });
  box(high, 'lantern', lx0 + 0.12, lx1 - 0.12, ly0 + 0.12, ly1 - 0.12, lh + 0.06, lh + 0.3, { mz });
  box(high, 'gallery', lx0 + 0.06, lx1 - 0.06, ly0 + 0.06, ly1 - 0.06, lh + 0.3, lh + 0.38, { mz });
  const lantern = { x: (lx0 + lx1) / 2, y: (ly0 + ly1) / 2, z: lh + 0.18 };
  for (const bt of boats) bt.z = zw;
  return { lantern, low, high, boats, wh: wh * T, gx, gy, w, yE0, yE1, poly: basinPoly(b, sm, 0.35), clipPoly: basinPoly(b, sm, -0.5) };
}

// Le polygone d'eau du bassin, en tuiles monde : son rectangle, prolongé au sud jusqu'au
// bord du ruban + `over` — un peu au-delà pour l'eau (il recouvre l'entrée), en deçà
// pour le clip des reflets (rempli en evenodd avec le ruban : il ne doit pas le chevaucher).
function basinPoly(b, sm, over) {
  const pts = [{ x: b.gx, y: b.gy }, { x: b.gx + b.w, y: b.gy }];
  for (let x = b.gx + b.w; x >= b.gx - 1e-6; x -= 0.5) pts.push({ x, y: riverEdgeAt(sm, x, 'N') + over });
  return pts;
}

function shadeOldPort(plan) {
  const P = PAL;
  const inner = (hit, wx, wy, zz) => {
    // Raccord en bandes (cf. oldPortPlan) : le flanc est d'une bande, découvert là où la
    // berge recule d'un pixel, se peint comme la face avant — sinon une rainure sombre
    // à chaque marche.
    const bx = hit.bx, face = bx.join && hit.face === 0 ? 1 : hit.face, part = bx.part;
    const g = 1 + (h01(Math.floor(wx), Math.floor(wy), 3) - 0.5) * 0.05;
    let col;
    if (part === 'quay') {
      if (face !== 2) return mul(P.wall, FACE_LIGHT[face]);
      const ka = Math.floor(wx / 10.5), kb = Math.floor(wy / 9);
      col = P.top[Math.floor(h01(ka, kb, 5) * P.top.length)];
      if (((wx % 10.5) + 10.5) % 10.5 < 1 || ((wy % 9) + 9) % 9 < 1) col = P.gap;
      // Margelle au pourtour ; sur une bande du raccord, côté eau seulement.
      if (bx.join ? bx.Y1 - wy < 1.3 : (bx.X1 - wx < 1.3 || bx.Y1 - wy < 1.3 || wx - bx.X0 < 1.1 || wy - bx.Y0 < 1.1)) col = P.coping;
      return mul(col, g);
    }
    if (part === 'wall') {
      if (face === 2) return mul(P.coping, g);
      const row = Math.floor(-zz / 3.2), off = (row & 1) ? 4 : 0, u = face === 1 ? wx : wy;
      if (((-zz) - row * 3.2) < 0.9 || ((((Math.floor(u) + off) % 8) + 8) % 8 === 0)) col = P.gap;
      else col = mix(P.wall, P.top[(row + Math.floor((u + off) / 8)) % P.top.length], 0.25);
      if (-zz > plan.wh - 2.2) col = mix(mul(P.wall, 0.6), [58, 76, 56], 0.3);
      return mul(col, FACE_LIGHT[face] * g);
    }
    if (part === 'bollard') return mul(face === 2 ? P.bollardTop : P.bollard, FACE_LIGHT[face]);
    // Escaliers : la pierre du quai, nez de marche plus clair (la margelle), contremarches
    // dans la teinte du mur — les marches se lisent en rayures, comme au fleuve.
    if (part === 'stair') {
      if (face === 2) return mul(bx.landing ? P.top[1] : P.coping, g * (bx.step ? 1 - (bx.step % 2) * 0.05 : 1));
      return mul(mix(P.wall, P.gap, -zz > plan.wh - 2.2 ? 0.6 : 0.15), FACE_LIGHT[face] * g);
    }
    if (part === 'gangway') {
      if (face !== 2) return mul(P.deckGap, FACE_LIGHT[face]);
      return mul(P.deck[Math.floor(h01(Math.floor(wy / 2), 5, 13) * P.deck.length)], g);
    }
    if (part === 'rope') return P.rope;
    if (part === 'post') return mul(P.pole, FACE_LIGHT[face]);
    if (part === 'crate') return mul(face === 2 ? P.crateTop : P.crate, FACE_LIGHT[face] * g);
    if (part === 'net') return ((Math.floor(wx) + Math.floor(wy)) % 3 === 0) ? P.netGap : mul(P.net, g);
    // Ponton du fond (est-ouest) : planches en travers, flotteurs blancs.
    if (part === 'pontoonEW') {
      if (face !== 2) return mul(P.float, FACE_LIGHT[face]);
      const k = Math.floor(wx / 3), r = wx - k * 3;
      col = P.deck[Math.floor(h01(k, 7, 11) * P.deck.length)];
      if (r < 1) col = P.deckGap;
      return mul(col, g);
    }
    if (part === 'pontoon') {
      if (face !== 2) return mul(P.float, FACE_LIGHT[face]);
      const k = Math.floor(wy / 3), r = wy - k * 3;
      col = P.deck[Math.floor(h01(k, 3, 11) * P.deck.length)];
      if (r < 1) col = P.deckGap;
      return mul(col, g);
    }
    if (part === 'fort' || part === 'merlon') {
      if (face === 2) return faceLit(mul(P.fortD, g), 1.04);
      const row = Math.floor(zz / 4), off = (row & 1) ? 5 : 0, u = face === 1 ? wx : wy;
      col = ((zz - row * 4) < 1 || ((((Math.floor(u) + off) % 10) + 10) % 10 === 0)) ? P.fortGap : P.fort;
      // Meurtrières : une fente sombre au milieu des faces, aux deux tiers de la hauteur.
      if (part === 'fort' && zz > bx.Z1 * 0.55 && zz < bx.Z1 * 0.72) {
        const mid = face === 1 ? (bx.X0 + bx.X1) / 2 : (bx.Y0 + bx.Y1) / 2;
        if (Math.abs(u - mid) < 1.1) col = [44, 40, 38];
      }
      return faceLit(mul(col, g), FACE_LIGHT[face]);
    }
    if (part === 'light') {
      col = zz > bx.Z1 * 0.45 && zz < bx.Z1 * 0.62 ? P.lightBand : P.light;
      return faceLit(mul(col, g), FACE_LIGHT[face]);
    }
    if (part === 'gallery') return faceLit(P.lantern, FACE_LIGHT[face]);
    if (part === 'lantern') return face === 2 ? mul(P.lantern, 1) : P.lamp;
    if (part === 'flag') return P.flag;
    if (part === 'pole') return P.pole;
    return mul([128, 128, 128], FACE_LIGHT[face]);
  };
  return (hit, wx, wy, zz, mirror) => {
    const c = inner(hit, wx, wy, zz);
    return mirror && hit.face === 2 && c ? mul(c, 0.5) : c;
  };
}

// L'encre (isoBoxBake.inkPass) des gardiens de l'entrée : ni la hampe ni le drapeau
// (un pixel de large) n'en prennent.
const OLD_INK = { skip: (b) => b.part === 'pole' || b.part === 'flag' || b.part === 'rope' };

// ── LE CACHE ─────────────────────────────────────────────────────────────────
const _cache = new Map();
function oldPortGeom(t, band) {
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || !t.oldPort) return null;
  // ⚠ CLÉ = LA GÉOMÉTRIE, pas l'horodatage du layout : celui-ci change à chaque
  // recalcul (un achat peut en déclencher un), et la cuisson coûte quelques centaines
  // de ms — elle se refaisait à chaque fois. Le cache est indexé par la clé, pas par
  // l'objet tuile (un recalcul en fabrique de nouveaux).
  const ob = t.oldPort;
  const key = (L.mapSeed | 0) + ':' + ob.gx + ',' + ob.gy + ',' + ob.w + ',' + ob.h + ':' + band + ':' + (OLDPORT.shadow ? 1 : 0) + (OLDPORT.reflect ? 1 : 0) + (OLDPORT.ink ? 1 : 0);
  if (_cache.has(key)) return _cache.get(key);
  const T = CM.TILE, sm = rv.samples;
  const plan = oldPortPlan(t.oldPort, band, T, sm);
  const shade = shadeOldPort(plan);
  const b = t.oldPort;
  // Pour le reflet et le clapot : l'eau = le ruban OU le bassin.
  // Bas du bassin par quart de tuile, calculé une fois (riverEdgeAt parcourt le fleuve).
  const bottom = [];
  for (let k = 0; k <= b.w * 4; k += 1) bottom.push(riverEdgeAt(sm, b.gx + k / 4, 'N') + 0.35);
  const inBasin = (wx, wy) => {
    const x = wx / T, y = wy / T;
    if (x < b.gx || x > b.gx + b.w || y < b.gy) return false;
    return y <= bottom[Math.min(bottom.length - 1, Math.round((x - b.gx) * 4))];
  };
  const [j0, j1] = riverWindow(sm, b.gx - 4, b.gx + b.w + 4);
  const isWater = (wx, wy) => inBasin(wx, wy) || riverWaterAt(sm, wx, wy, T, j0, j1);
  const opt = { shade, isWater, shadow: OLDPORT.shadow, reflect: OLDPORT.reflect, foam: null };
  // Le fort et le phare sont DESSINÉS (encre de la cuisson, comme le terminal) ; les
  // quais et pontons restent du sol.
  const g = { plan, low: bakeBoxes(plan.low, opt), high: bakeBoxes(plan.high, { ...opt, ink: OLDPORT.ink ? OLD_INK : null }) };
  if (_cache.size > 4) _cache.clear();
  _cache.set(key, g);
  return g;
}

function oldPortTiles(L) {
  const nT = (L.tiles || []).length;
  if (L._oldPorts && L._oldPorts.n === nT) return L._oldPorts.list;
  const list = (L.tiles || []).filter((t) => t.oldPort);
  L._oldPorts = { n: nT, list };
  return list;
}

// L'EAU du bassin, publiée au fleuve qui la peint avec la sienne (cf. setRiverExtraWater).
setRiverExtraWater((clip) => {
  const L = CM.layout;
  if (!OLDPORT.on || !L || CM.collapseAt) return null;
  const band = (L.counts && L.counts.eraBand) | 0;
  const out = [];
  for (const t of oldPortTiles(L)) { const g = oldPortGeom(t, band); if (g) out.push(clip ? g.plan.clipPoly : g.plan.poly); }
  return out;
});

// SOUS les bâtiments, après les quais du fleuve (l'eau du bassin est déjà peinte avec
// le fleuve) : ses quais et ses murs, ses pontons et ses bateaux ; puis les ombres et
// reflets des gardiens.
// LES REMOUS DU BASSIN (Raph, 2026-10-04 : « sur tous les pontons ») : le liseré et
// les rides autour du ponton du fond, des pannes de la marina et des paliers d'escalier
// au ras de l'eau — à l'altitude de l'eau du bassin (zw), sans découpe au ruban (le
// bassin n'en est pas) : ses dalles et ses murs, peints après, recouvrent le reste.
function oldPortRipples(g) {
  const decks = [];
  let h = 0;
  for (const b of g.plan.low) {
    if (!(b.part === 'pontoonEW' || b.part === 'pontoon' || (b.part === 'stair' && b.landing))) continue;
    decks.push([[b.X0, b.Y0], [b.X1, b.Y0], [b.X1, b.Y1], [b.X0, b.Y1]]);
    h = b.Z0;
  }
  if (!decks.length) return [];
  return [{ F: rippleField({ decks, seed: Math.round(decks[0][0][0]) }), h, clip: null }];
}

export function paintOldPortUnder(ctx, now) {
  if (!OLDPORT.on) return;
  const L = CM.layout;
  if (!L || CM.collapseAt) return;
  const band = (L.counts && L.counts.eraBand) | 0;
  for (const t of oldPortTiles(L)) {
    const g = oldPortGeom(t, band);
    if (!g) continue;
    paintBakeUnder(ctx, g.low, { shadow: false, reflect: false });
    // Les remous des pontons et des paliers du bassin (iso/waterRipples.js), peints à
    // l'image suivante sous ses dalles, ses murs et ses bateaux.
    noteRipples('oldport:' + (L.mapSeed | 0) + ':' + t.oldPort.gx + ',' + t.oldPort.gy + ',' + t.oldPort.w + ':' + band, () => oldPortRipples(g));
    if (g.low) blitLayer(ctx, g.low.body);
    for (const bt of g.plan.boats) drawMooredHull(ctx, { role: bt.role, heading: bt.heading, x: bt.x, y: bt.y, z: bt.z, now, band });
    drawMooringLines(ctx, g.plan.boats);
    paintBakeUnder(ctx, g.high, { shadow: OLDPORT.shadow, reflect: OLDPORT.reflect });
  }
}

// Les AMARRES : un trait d'un pixel d'art, du bateau à son taquet ou à sa borne.
function drawMooringLines(ctx, boats) {
  const T = CM.TILE, z = CM.cam.zoom;
  const lw = Math.max(1, Math.round(z));
  ctx.save();
  ctx.strokeStyle = 'rgb(' + PAL.rope.join(',') + ')';
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (const bt of boats) {
    for (const L of bt.lines || []) {
      const a = worldToScreen(L[0] * T, L[1] * T, L[2] * T), b = worldToScreen(L[3] * T, L[4] * T, L[5] * T);
      ctx.moveTo(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5);
      ctx.lineTo(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5);
    }
  }
  ctx.stroke();
  // L'ANNEAU au bout de chaque amarre prise au mur : un pixel d'encre sur la pierre.
  ctx.fillStyle = 'rgb(40,38,36)';
  for (const bt of boats) {
    for (const L of bt.lines || []) {
      if (!L[6]) continue;
      const p = worldToScreen(L[3] * T, L[4] * T, L[5] * T);
      ctx.fillRect(Math.round(p.x - lw / 2), Math.round(p.y - lw / 2), lw, lw);
    }
  }
  ctx.restore();
}

// LA CAPITAINERIE, sur le quai du fond (sa propre tuile, cf. layout) : le sprite de
// l'ère, posé par le bas de son contenu au coin sud de sa tuile. Bande 5 : pierre de
// taille, toit mansardé, horloge ; bande 6 : marina blanche et vitrée, vigie à radar ;
// au-delà : la tour de port cosmique de l'ère.
// Les ports cosmiques portent leur aire d'atterrissage : un peu plus larges.
const OFFICE_W = { 'port-house-industrial': 1.9, 'port-house-modern': 1.75, 'port-cosmic-7': 2.1, 'port-cosmic-8': 2.1, 'port-cosmic-9': 2.1 };
export function drawPortOffice(ctx, t, band, T) {
  if (!OLDPORT.on) return;
  const key = band >= 7 && propReady('port-cosmic-' + band) ? 'port-cosmic-' + band
    : band >= 6 ? 'port-house-modern' : 'port-house-industrial';
  if (!propReady(key)) return;
  const z = CM.cam.zoom, sx = t.spanX || 2, sy = t.spanY || 2;
  const p = worldToScreen((t.gx + sx - 0.1) * T, (t.gy + sy - 0.15) * T);
  blitPropAnchored(ctx, key, p.x, p.y, (OFFICE_W[key] || 1.6) * T * z * 1.3);
}

// Les gardiens de l'entrée, au tri du peintre. La LANTERNE du phare dépose sa lueur
// (flameGlow : posée après le voile de nuit, masquée par ce qui passe devant).
export function drawOldPort(ctx, t, band, now) {
  if (!OLDPORT.on) return;
  const g = oldPortGeom(t, band);
  if (!g) return;
  if (g.high) blitLayer(ctx, g.high.body);
  const T = CM.TILE, L = g.plan.lantern;
  if (L) {
    const p = worldToScreen(L.x * T, L.y * T, L.z * T);
    queueFlameGlow(p.x, p.y, T * CM.cam.zoom * 0.42, '255,236,180', now, 1.3, 1.5);
  }
}

// ── CE QUE LA FLOTTE DOIT SAVOIR DU VIEUX-PORT (iso/portBerths.js) ─────────────
// Les places du bassin (toutes occupées par un bateau-décor). Rien dans le fleuve :
// le bassin est HORS du ruban, seule son entrée le touche.
registerPortProvider('plaisance', (L) => {
  if (!OLDPORT.on || !L || !L.counts) return null;
  const band = L.counts.eraBand | 0;
  const berths = [];
  for (const t of oldPortTiles(L)) {
    const g = oldPortGeom(t, band);
    if (!g) continue;
    g.plan.boats.forEach((bt, i) => {
      const fp = hullFootprint(bt.role, band);
      berths.push({ id: 'plaisance-' + i, kind: 'plaisance', x: bt.x, y: bt.y, heading: bt.heading, axis: null, maxLen: fp.len + 0.1, decor: true });
    });
  }
  return { berths, water: [] };
});

// ── LES RÉVERBÈRES DU VIEUX-PORT (iso/portBerths.js → isoStreet.isoLamps) ───────
// Le long du quai du fond (pas devant la capitainerie) et des deux quais latéraux, un
// mât de l'ère tous les ~1,6 tuile, en retrait du bord (les bornes y sont).
registerPortLamps('plaisance', (L) => {
  if (!OLDPORT.on || !L || !L.river || !L.river.samples) return [];
  const sm = L.river.samples, T = CM.TILE, out = [];
  const put = (x, y) => {
    const wx = x * T, wy = y * T;
    out.push({ wx, wy, gx: Math.floor(x), gy: Math.floor(y), d: depthOf(wx, wy), s: ((Math.floor(x * 7) * 73856093) ^ (Math.floor(y * 7) * 19349663)) >>> 0 });
  };
  for (const t of oldPortTiles(L)) {
    const b = t.oldPort, ox = b.gx + Math.floor(b.w / 2) - 1;
    for (let x = b.gx - 0.5; x <= b.gx + b.w + 0.5; x += 1.6) if (x < ox - 0.2 || x > ox + 2.2) put(x, b.gy - 0.55);
    const yW = riverEdgeAt(sm, b.gx - 0.5, 'N'), yE = riverEdgeAt(sm, b.gx + b.w + 0.5, 'N');
    for (let y = b.gy + 0.9; y < yW - 1.3; y += 1.7) put(b.gx - 0.55, y);
    for (let y = b.gy + 0.9; y < yE - 1.3; y += 1.7) put(b.gx + b.w + 0.55, y);
  }
  return out;
});
