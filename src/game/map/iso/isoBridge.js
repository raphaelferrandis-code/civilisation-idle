"use strict";
// ── PONT ISO « 3/4 top-down » — v1 procédurale (chantier relancé 2026-07-16) ──
// Le pont plat projeté (withLegacyToIso ∘ drawPixelBridges) couchait le tablier
// legacy sur le plan du sol : lecture « tapis posé sur l'eau », aucun volume.
// Les sprites de pont complets (bridge-full-*) re-tournés gardaient leur
// perspective interne (rejetés 2026-07-12). On repart de zéro en PROCÉDURAL,
// avec la grammaire du reste du jeu :
//   · surfaces horizontales (tablier, ombre portée) = quads MONDE projetés,
//     donc posées dans le plan du losange ;
//   · verticalité (piles, épaisseur du tablier, parapets) = rubans VERTICAUX
//     ÉCRAN qui « pendent » sous leur ligne de base — même geste que le mur de
//     quai (cityMapDrawQuays) et l'aqueduc 3-slice debout.
// Le tablier reste AU PLAN DU SOL (pas de dos d'âne) : agents et attelages le
// traversent sans lift ; le volume vient de ce qui pend dessous (face, piles)
// et dépasse dessus (parapets). La hauteur d'eau est CONVENTIONNELLE (l'eau
// peinte vit dans le plan du sol) : les piles descendent de pileH px et posent
// leur remous là — personne d'autre ne référence ce niveau.
//
// Répartition des passes (cf. drawIsoWorld / drawIsoLive dans isoRenderer) :
//   passe A  drawIsoBridgeUnder — AVANT les bateaux : OMBRE portée seule.
//   tri peintre  pushIsoBridgeItems — TOUT LE PONT, par CELLULE (kind
//     'bridgeSeg', même leçon que l'aqueduc : tri LOCAL) : le PLATELAGE (part
//     'deck', profondeur au coin NORD comme les empreintes 'field' → tout ce
//     qui le chevauche passe dessus), côté amont le parapet, côté aval face +
//     arches + piles + contreventement + parapet. Leçon des 1res versions :
//     tout élément dessiné en passe globale AVANT la scène vivante finit
//     recouvert par un voisin plus profond (scène riveraine, bâtiment dont le
//     sprite déborde) — au tri, le pont est un citoyen 3/4 comme les autres.
//     Seul compromis : un bateau émergeant côté aval glisse quelques px
//     DERRIÈRE les piles (lecture « encore sous le pont », acceptable).
//   nuit  drawIsoBridgeNight — après le voile : lanternes (halos, reflets).
// Les piétons/attelages traversent à ±0.16 tuile de l'axe de leur voie (cf.
// __bridgePedEdge) : jamais dans les parapets, et leur profondeur les place
// entre parapet amont et parapet aval de leur cellule.
// Bord AVAL = bord +x (span vertical) ou +y (span horizontal) : celui dont la
// normale DESCEND à l'écran — propriété fixe de la projection, aucun test par
// sample. Hypothèse héritée du legacy : les spans sont RECTILIGNES (bbox).
//
// Matière par bande : bridgeEraForBand (partagé avec le pont legacy top-down).
// A/B : window.__isoBridge3d(false) rebranche l'ancien tablier plat projeté.
// Molettes fines : window.__bridgeTune (objet muté en live, pont non baké).

import { CM, cmHash } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { bridgeEraForBand } from '../pixelBridge.js';

export const isoBridge3dFlag = { on: true };
if (typeof window !== 'undefined') {
  window.__isoBridge3d = (on) => { isoBridge3dFlag.on = on !== false; return isoBridge3dFlag.on; };
}

// Cotes en px MONDE (× zoom au rendu). Partagées entre matières sauf mention.
export const bridgeTune = {
  // Demi-largeur du tablier par voie (fraction de tuile). 0,44 → 0,36 au
  // chantier ÉCHELLE (Lot A, docs/PLAN-ECHELLE.md §A3) : un tablier large se
  // lit « petit fleuve, gros pont » et rapetissait la ville. Garde-fous tenus :
  // piétons à ±0,16 de l'axe de voie + demi-corps ~0,13 = 0,29 < 0,36 ; en iso
  // les véhicules roulent CENTRÉS sur leur cellule de pont (vehicleLaneTarget,
  // rang main → offset nul).
  deckHalf: 0.36,
  landing: 0.55,       // débord du platelage dans la cellule d'atterrissage (fraction)
  shadowA: 0.20,       // alpha de l'ombre portée sur l'eau
  shadowDx: 2.5, shadowDy: 6,   // décalage écran de l'ombre (lumière haut-gauche)
  ripple: true,        // remous clairs au pied des piles
  brace: true,         // contreventement en X des palées bois
  arches: true,        // arches dans la face des ponts maçonnés
  posts: true,         // poteaux de tête aux entrées
  // Demi-largeur de la PASSE NAVIGABLE, en tuiles : les palées du milieu du
  // chenal sautent pour laisser filer les bateaux. 1,7 laisse 3,4 tuiles de
  // large — la plus grosse coque (cosmique bande 9 ÉCRÊTÉ, cf. FLEET_SCALE
  // d'isoRenderer) fait 0,7×3,2 = 2,24 : la passe retrouve sa cote d'origine,
  // que la flotte cosmique d'avant l'écrêtage (3,9 tuiles) débordait.
  passHalf: 1.7,
};
if (typeof window !== 'undefined') window.__bridgeTune = bridgeTune;

// Diagnostic live : géométrie calculée + compteurs de la dernière frame.
// Usage console : __bridgeGeo() → { spans: [...], drew: { under, segs, night } }.
const _drew = { under: 0, segs: 0, night: 0 };
if (typeof window !== 'undefined') {
  window.__bridgeGeo = () => {
    const geos = bridgeGeoms();
    return {
      drew: { ..._drew },
      spans: (geos || []).map((g) => ({
        vertical: g.vertical, lanes: g.lanes, c: g.c, wD: g.wD,
        a: g.a, b: g.b, wetA: g.wetA, wetB: g.wetB,
      })),
    };
  };
}

// ── Styles par matière ────────────────────────────────────────────────────────
// Teintes calées sur bridgeTone/roadTone (palette terracotta, jamais de cyan).
// Hauteurs px monde : faceH = épaisseur pendue sous le bord aval, pileH = chute
// des piles SOUS la face (jusqu'à l'eau conventionnelle), railH = parapet.
const STYLES = {
  bois: {
    deck: [126, 96, 58], plankPitch: 3.8, plankVar: 0.16, joint: 'rgba(42,28,14,0.28)',
    stringer: [88, 62, 38],
    faceH: 4, faceTop: [102, 74, 44], faceBot: [70, 48, 28],
    pileH: 9, pileW: 2.6, pileEvery: 1.15, pile: [82, 58, 36], pileDark: [56, 38, 22],
    railH: 8.5, railPostEvery: 0.56, railPostW: 2, rail: [96, 68, 40], railTop: [128, 94, 56],
    kind: 'wood',
  },
  pierre: {
    deck: [148, 142, 128], plankPitch: 15, plankVar: 0.05, joint: 'rgba(30,26,20,0.16)',
    stringer: [186, 178, 156],          // margelle claire au bord des dalles
    faceH: 9, faceTop: [122, 114, 98], faceBot: [82, 76, 64],
    pileH: 8, pileW: 5.5, pileEvery: 1.6, pile: [112, 106, 92], pileDark: [78, 72, 60],
    railH: 7, railPostEvery: 0.5, railPostW: 2.5, rail: [140, 132, 116], railTop: [190, 182, 160],
    kind: 'stone', arch: [46, 44, 44],
  },
  // ── SUSPENDUS (bande 4+) ───────────────────────────────────────────────────
  // `suspended` : AUCUNE palée dans l'eau. Deux pylônes plantés sur les berges,
  // un câble porteur en caténaire, des suspentes verticales, et le tablier
  // franchit d'un seul jet. C'est la vraie réponse au problème des bateaux qui
  // traversaient la pierre (Raph) : le suspendu ne le contourne pas, il le
  // supprime — plus rien ne se dresse dans le chenal.
  //
  // À partir du FER et pas avant : le suspendu naît avec la métallurgie. Un pont
  // suspendu à l'âge du bronze serait la même faute que le vapeur croisant
  // devant des habitants en toge, déjà corrigée sur ce chantier.
  //
  // towerH = hauteur du pylône au-dessus du tablier ; sag = flèche du câble
  // (fraction de la portée) ; hangEvery = pas des suspentes, en tuiles.
  // ⚠ Gabarits fer/béton/énergie AFFINÉS au chantier ÉCHELLE (Lot A, §A3) :
  // rails, piles et pylônes −10/15 % en même temps que deckHalf — un parapet
  // épais à l'échelle d'une voiture rendait le pont plus « gros » que les tours.
  fer: {
    deck: [96, 92, 88], plankPitch: 8, plankVar: 0.06, joint: 'rgba(16,16,18,0.22)',
    stringer: [58, 54, 52],
    faceH: 7, faceTop: [78, 74, 70], faceBot: [46, 44, 42],
    pileH: 9, pileW: 3.4, pileEvery: 1.5, pile: [70, 66, 62], pileDark: [42, 40, 38],
    railH: 7, railPostEvery: 0.5, railPostW: 1.4, rail: [50, 48, 46], railTop: [104, 98, 92],
    kind: 'metal',
    suspended: true, towerH: 30, towerW: 3.1, sag: 0.30, hangEvery: 0.62,
    cable: [58, 56, 54], cableLite: [126, 122, 116], tower: [78, 74, 70], towerDark: [46, 44, 42],
  },
  beton: {
    deck: [122, 122, 124], plankPitch: 16, plankVar: 0.04, joint: 'rgba(20,20,24,0.14)',
    stringer: [156, 156, 154],
    faceH: 8, faceTop: [104, 104, 106], faceBot: [70, 70, 74],
    pileH: 9, pileW: 5.2, pileEvery: 1.9, pile: [100, 100, 102], pileDark: [66, 66, 70],
    railH: 6, railPostEvery: 0.62, railPostW: 1.7, rail: [96, 96, 100], railTop: [150, 150, 150],
    kind: 'stone', arch: [40, 42, 46],
    suspended: true, towerH: 34, towerW: 3.7, sag: 0.26, hangEvery: 0.7,
    cable: [92, 92, 96], cableLite: [168, 168, 168], tower: [132, 132, 134], towerDark: [82, 82, 86],
  },
  energie: {
    deck: [104, 110, 128], plankPitch: 12, plankVar: 0.05, joint: 'rgba(12,14,20,0.20)',
    stringer: [64, 58, 44],
    faceH: 8, faceTop: [84, 90, 108], faceBot: [50, 54, 68],
    pileH: 10, pileW: 4.4, pileEvery: 1.9, pile: [76, 82, 100], pileDark: [44, 48, 62],
    railH: 6.5, railPostEvery: 0.62, railPostW: 1.6, rail: [70, 76, 94], railTop: [214, 178, 108],
    kind: 'metal', glow: '255,196,110',   // lisse lumineuse ambre (jamais cyan)
    suspended: true, towerH: 38, towerW: 3.4, sag: 0.22, hangEvery: 0.68,
    cable: [70, 76, 94], cableLite: [214, 178, 108], tower: [84, 90, 108], towerDark: [50, 54, 68],
  },
};

const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// ── Géométrie par span, en repère (l = longitudinal, t = transverse) ─────────
// P(l,t) projette directement en écran ; aval = t croissant (cf. en-tête).
let _geo = { at: '', list: null };
function bridgeGeoms() {
  const L = CM.layout;
  if (!L || !CM.bridgeSpans || !CM.bridgeSpans.length) return null;
  // La clé embarque les molettes de gabarit : muter __bridgeTune re-calcule
  // la géométrie à la frame suivante (le pont n'est pas baké).
  const key = CM.layoutRecomputeAt + ':' + bridgeTune.deckHalf + ':' + bridgeTune.landing;
  if (_geo.at === key && _geo.list) return _geo.list;
  const T = CM.TILE, rv = L.river;
  const st = styleFor(L);
  const list = [];
  for (const sp of CM.bridgeSpans) {
    const vertical = sp.vertical;
    const lanes = vertical ? (sp.gx1 - sp.gx0 + 1) : (sp.gy1 - sp.gy0 + 1);
    const c = vertical ? ((sp.gx0 + sp.gx1 + 1) / 2) * T : ((sp.gy0 + sp.gy1 + 1) / 2) * T;
    const wD = (lanes - 1 + bridgeTune.deckHalf * 2) / 2 * T;
    // Bornes longitudinales : cellules-pont + débord dans les atterrissages
    // (recouvre la couture avec la route SANS l'évasement rejeté par Raph).
    let a = (vertical ? sp.gy0 : sp.gx0) * T;
    let b = (vertical ? sp.gy1 + 1 : sp.gx1 + 1) * T;
    if (sp.exits) {
      for (const r of sp.exits) {
        const g = vertical ? r.gy : r.gx;
        if (g < (vertical ? sp.gy0 : sp.gx0)) a = Math.min(a, (g + 1 - bridgeTune.landing) * T);
        else if (g > (vertical ? sp.gy1 : sp.gx1)) b = Math.max(b, (g + bridgeTune.landing) * T);
      }
    }
    // Tronçon MOUILLÉ (piles, face, ombre) : cellules du span posées sur l'eau.
    let wetA = Infinity, wetB = -Infinity;
    if (rv && rv.present && rv.cells) {
      for (const cell of sp.cells) {
        if (!rv.cells.has(cell.gx + ',' + cell.gy)) continue;
        const l0 = (vertical ? cell.gy : cell.gx) * T;
        if (l0 < wetA) wetA = l0;
        if (l0 + T > wetB) wetB = l0 + T;
      }
    }
    if (wetA > wetB) { wetA = a + T * 0.4; wetB = b - T * 0.4; }   // pas d'info eau : approx
    // Un span peut S'ARRÊTER EN PLEINE EAU : au coude du fleuve, le RUBAN PEINT
    // (polyline samples ± hw, lissée) déborde de la discrétisation rv.cells et
    // il n'y a aucune route d'atterrissage (donc aucun exit) pour étendre les
    // bornes — la tête de pont trempait au milieu de l'eau (vu à la capture,
    // place au débouché sud). Le tronçon mouillé RÉEL se lit sur les SAMPLES :
    // ceux dont le ruban passe au droit du gabarit du pont, près du span,
    // étendent wetA/wetB — et le tablier suit, débord `landing` sur la berge.
    if (rv && rv.present && rv.samples && rv.samples.length) {
      for (const s of rv.samples) {
        const sT = (vertical ? s.x : s.y) * T;      // transverse (vs axe c)
        const sL = (vertical ? s.y : s.x) * T;      // longitudinal
        const shw = (s.hw || 0) * T;
        if (Math.abs(sT - c) > shw + wD + T * 0.5) continue;   // ruban hors gabarit
        if (sL < a - T * 3 || sL > b + T * 3) continue;        // trop loin du span
        if (sL - shw < wetA) wetA = sL - shw;
        if (sL + shw > wetB) wetB = sL + shw;
      }
      a = Math.min(a, wetA - bridgeTune.landing * T);
      b = Math.max(b, wetB + bridgeTune.landing * T);
    }
    // PILES précalculées, PIED VÉRIFIÉ SUR L'EAU (distance au ruban continu
    // < hw locale − marge) : une pile posée sur la frange peinte de la berge
    // laissait son remous flotter sur l'herbe (vu à la capture). Phase stable
    // par pile → clapot/écume animés sans re-tirage par frame.
    const piles = [];
    {
      const span = wetB - wetA - T * 0.55;
      if (span >= T * 0.5) {
        const n = Math.max(2, Math.round(span / (st.pileEvery * T)) + 1);
        const tAval = c + wD;
        for (let i = 0; i < n; i += 1) {
          const l = wetA + T * 0.275 + (span * i) / (n - 1);
          const px = (vertical ? tAval : l) / T, py = (vertical ? l : tAval) / T;
          let wet = !(rv && rv.present && rv.samples && rv.samples.length);
          if (!wet) {
            for (const s of rv.samples) {
              const dx = s.x - px, dy = s.y - py, m = (s.hw || 0) - 0.15;
              if (m > 0 && dx * dx + dy * dy < m * m) { wet = true; break; }
            }
          }
          if (wet) piles.push({ l, ph: (cmHash('bpile:' + sp.gx0 + ':' + sp.gy0 + ':' + i) % 1000) / 1000 });
        }
      }
    }
    // ── PASSE NAVIGABLE ──────────────────────────────────────────────────────
    // Les palées tombaient TOUS LES 1,15 à 1,6 tuiles d'une berge à l'autre. Un
    // porte-conteneurs en fait 2,24 de large : il ne pouvait passer nulle part,
    // et traversait donc la pierre (Raph : « qu'ils passent entre les poteaux »).
    //
    // On ouvre la travée du milieu, comme un vrai pont : les palées du chenal
    // sautent et les deux qui bordent la passe deviennent ses culées. Ça règle le
    // problème par la GÉOMÉTRIE plutôt qu'en faisant slalomer les bateaux dans un
    // espace où ils ne tiennent pas.
    // ── SUSPENDU : le chenal est VIDE ────────────────────────────────────────
    // Toutes les palées mouillées sautent, remplacées par deux pylônes plantés
    // en retrait sur la terre ferme. C'est ce qui rend la passe navigable
    // inutile pour ces ères : il n'y a plus rien à éviter d'un bout à l'autre de
    // la traversée.
    const towers = [];
    if (st.suspended) {
      piles.length = 0;
      towers.push(wetA - T * 0.35, wetB + T * 0.35);
    }
    // (Le RECENTRAGE des bateaux sur cette passe est publié à part, par le
    // runtime, à partir des cellules de pont : CM.riverGates.)
    if (piles.length > 2) {
      const mid = (wetA + wetB) / 2;
      const half = bridgeTune.passHalf * T;
      const garde = piles.filter((p) => Math.abs(p.l - mid) > half);
      // Jamais moins de deux palées : sans elles, la face n'a plus de quoi
      // s'appuyer et le tablier flotte.
      if (garde.length >= 2) {
        piles.length = 0;
        piles.push(...garde);
      }
    }
    // LANTERNES : une aux deux têtes de pont + une paire médiane sur les longs
    // spans, alignées sur le PAS des poteaux du parapet (le boîtier se dessine
    // dans drawRailRun, les halos/reflets de nuit dans drawIsoBridgeNight).
    // `wet` : lanterne au-dessus de l'eau → reflet dans l'eau côté aval.
    const lamps = [];
    {
      const step = st.railPostEvery * T;
      const nTot = Math.max(1, Math.round((b - a) / step));
      const post = (i) => a + ((b - a) * i) / nTot;
      const cand = [[0, true], [nTot, true]];
      if (b - a > T * 5.5) cand.push([Math.round(nTot / 2), false]);
      for (const [i, head] of cand) {
        const l = post(i);
        lamps.push({ l, head, wet: l > wetA + T * 0.3 && l < wetB - T * 0.3 });
      }
    }
    list.push({
      sp, vertical, c, wD, a, b, wetA, wetB, lanes, piles, lamps, towers,
      P: vertical ? (l, t) => worldToScreen(t, l) : (l, t) => worldToScreen(l, t),
      D: vertical ? (l, t) => depthOf(t, l) : (l, t) => depthOf(l, t),
    });
  }
  _geo = { at: key, list };
  return list;
}

// Cull écran d'un span (bbox des 4 coins étendus + marge verticale des piles).
function spanVisible(g, z) {
  const m = 24 * z;
  const p = [g.P(g.a, g.c - g.wD), g.P(g.a, g.c + g.wD), g.P(g.b, g.c - g.wD), g.P(g.b, g.c + g.wD)];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of p) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
  return !(x1 < -m || y1 < -m || x0 > CM.cw + m || y0 > CM.ch + m + 24 * z);
}

function styleFor(L) { return STYLES[bridgeEraForBand((L.counts && L.counts.eraBand) | 0)] || STYLES.bois; }

// Le pont de cette bande est-il un SUSPENDU (donc sans aucune palée en eau) ?
// Exporté pour le test : la règle « pas avant le fer » est exactement le genre
// de seuil qui dérive en silence — celui du vapeur avait fini recopié à trois
// endroits avec deux valeurs différentes.
export function bridgeIsSuspended(band) {
  const st = STYLES[bridgeEraForBand(band | 0)];
  return !!(st && st.suspended);
}

// Emprise « pont » pour les poseurs EXTÉRIEURS (bateau amarré du port, arbres
// et rochers du décor…) : vrai si le point monde (wx, wy) tombe sur un
// tablier, élargi de `margin` px.
export function bridgeBlocks(wx, wy, margin = 0) {
  if (!isoBridge3dFlag.on) return false;
  const geos = bridgeGeoms(); if (!geos) return false;
  for (const g of geos) {
    const l = g.vertical ? wy : wx, t = g.vertical ? wx : wy;
    if (l > g.a - margin && l < g.b + margin && Math.abs(t - g.c) < g.wD + margin) return true;
  }
  return false;
}

// Ruban vertical écran : ligne de base (l0→l1 à t fixe) extrudée de h px écran
// vers le bas, découpée en 2 assises (haut clair → bas sombre, lecture quai).
function fillDrop(ctx, g, l0, l1, t, yOff, h, colTop, colBot) {
  const p0 = g.P(l0, t), p1 = g.P(l1, t);
  for (const seg of [[0, 0.5, colTop], [0.5, 1, colBot]]) {
    ctx.fillStyle = seg[2];
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y + yOff + h * seg[0]);
    ctx.lineTo(p1.x, p1.y + yOff + h * seg[0]);
    ctx.lineTo(p1.x, p1.y + yOff + h * seg[1]);
    ctx.lineTo(p0.x, p0.y + yOff + h * seg[1]);
    ctx.closePath(); ctx.fill();
  }
}

// Quad du plan du sol entre (l0..l1) × (t0..t1), rempli.
function fillFlat(ctx, g, l0, t0, l1, t1) {
  const q0 = g.P(l0, t0), q1 = g.P(l1, t0), q2 = g.P(l1, t1), q3 = g.P(l0, t1);
  ctx.beginPath();
  ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y);
  ctx.closePath(); ctx.fill();
}

// ── PASSE A : ombre portée sur l'eau (avant les bateaux) ─────────────────────
export function drawIsoBridgeUnder() {
  if (!isoBridge3dFlag.on) return;
  const L = CM.layout; if (!L) return;
  const geos = bridgeGeoms(); if (!geos) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  _drew.under += 1;
  for (const g of geos) {
    if (!spanVisible(g, z)) continue;
    // Silhouette du tablier (tronçon mouillé seulement, marge aux berges)
    // translatée EN ÉCRAN bas-droite — même convention que les bâtiments.
    const sA = g.wetA + T * 0.12, sB = g.wetB - T * 0.12;
    if (sB > sA) {
      ctx.save();
      ctx.translate(bridgeTune.shadowDx * z, bridgeTune.shadowDy * z);
      ctx.fillStyle = `rgba(8,12,14,${bridgeTune.shadowA})`;
      fillFlat(ctx, g, sA, g.c - g.wD, sB, g.c + g.wD);
      ctx.restore();
    }
  }
}

// ── PLATELAGE d'une tranche [l0, l1] — item 'deck' du TRI PEINTRE ────────────
// (Le platelage vivait en passe globale AVANT la scène vivante : un bâtiment
// au NORD du pont, dessiné après, recouvrait le tablier de son débord. Comme
// les empreintes à plat 'field', chaque tranche est triée au coin NORD de sa
// cellule → tout ce qui la chevauche se dessine après, donc au-dessus.)
// Fond + planches/dalles PERPENDICULAIRES à l'axe, bornées à la tranche : une
// planche à cheval sur deux tranches est repeinte à l'identique (même hash
// global) — recouvrement exact, couture invisible.
function drawDeckSeg(ctx, g, st, l0, l1, z, lod) {
  const T = CM.TILE;
  const tAval = g.c + g.wD, tAmont = g.c - g.wD;
  ctx.fillStyle = rgb(st.deck);
  fillFlat(ctx, g, l0, tAmont, l1, tAval);
  if (lod) return;
  const pitch = st.plankPitch;
  for (let i = Math.floor(l0 / pitch); i * pitch < l1; i += 1) {
    const p0 = Math.max(l0, i * pitch), p1 = Math.min(l1, (i + 1) * pitch);
    if (p1 - p0 < 0.4) continue;
    const h = cmHash('bdk:' + g.sp.gx0 + ':' + g.sp.gy0 + ':' + i) % 100;
    const v = 1 - st.plankVar / 2 + (h / 100) * st.plankVar;
    if (Math.abs(v - 1) > 0.015) {
      ctx.fillStyle = rgb(st.deck, v);
      fillFlat(ctx, g, p0, tAmont, p1, tAval);
    }
    // Joint marqué toutes les ~2 planches (bois) / chaque dalle (pierre) — au
    // BORD de planche i·pitch, seulement s'il tombe dans la tranche.
    if (h % (st.kind === 'wood' ? 2 : 1) === 0 && i * pitch >= l0) {
      const q0 = g.P(i * pitch, tAmont), q1 = g.P(i * pitch, tAval);
      ctx.strokeStyle = st.joint;
      ctx.lineWidth = Math.max(1, z * 0.5);
      ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
    }
  }
  // Poutres de rive / margelles : liserés longitudinaux aux deux bords.
  ctx.fillStyle = rgb(st.stringer);
  fillFlat(ctx, g, l0, tAmont, l1, tAmont + T * 0.055);
  fillFlat(ctx, g, l0, tAval - T * 0.055, l1, tAval);
}

// ── Parapet : lisse + poteaux verticaux écran le long d'un bord ──────────────
// side = t du bord ; [l0, l1] = tranche dessinée. Les POTEAUX sont ancrés sur
// la grille GLOBALE du span (g.a → g.b) : le parapet, débité par cellule pour
// le tri peintre, garde un pas continu (un poteau pile sur une couture est
// re-dessiné superposé à l'identique — indolore). Têtes de pont renforcées aux
// seules extrémités RÉELLES du span.
function drawRailRun(ctx, g, st, side, l0, l1, z) {
  const railH = st.railH * z;
  const p0 = g.P(l0, side), p1 = g.P(l1, side);
  // Poteaux d'abord (la lisse les coiffe).
  const T = CM.TILE, step = st.railPostEvery * T;
  const nTot = Math.max(1, Math.round((g.b - g.a) / step));
  const pw = Math.max(1, st.railPostW * z);
  for (let i = 0; i <= nTot; i += 1) {
    const l = g.a + ((g.b - g.a) * i) / nTot;
    if (l < l0 - 0.25 || l > l1 + 0.25) continue;
    const p = g.P(l, side);
    const head = bridgeTune.posts && (i === 0 || i === nTot);
    const lamp = g.lamps && g.lamps.some((la) => Math.abs(la.l - l) < step * 0.45);
    const hh = head ? railH * 1.3 : railH;
    const ww = head ? pw * 1.5 : pw;
    ctx.fillStyle = rgb(head ? st.pileDark : st.rail);
    ctx.fillRect(Math.round(p.x - ww / 2), Math.round(p.y - hh), Math.ceil(ww), Math.round(hh));
    if (head) {   // chapeau clair 1px sur les poteaux de tête
      ctx.fillStyle = rgb(st.railTop);
      ctx.fillRect(Math.round(p.x - ww / 2), Math.round(p.y - hh), Math.ceil(ww), Math.max(1, Math.round(z)));
    }
    if (lamp) {
      // BOÎTIER de lanterne au sommet du poteau (mât court + caisson) — la
      // lumière elle-même (point chaud, halo, reflet dans l'eau) vit dans
      // drawIsoBridgeNight, PAR-DESSUS le voile de nuit.
      const bw = Math.max(2, Math.round(1.8 * z));
      const my2 = Math.round(p.y - hh - 2.6 * z);
      ctx.fillStyle = rgb(st.pileDark);
      ctx.fillRect(Math.round(p.x - z * 0.5), my2, Math.max(1, Math.round(z)), Math.round(2.6 * z));
      ctx.fillRect(Math.round(p.x - bw / 2), my2 - bw, bw, bw);
      ctx.fillStyle = rgb(st.railTop);
      ctx.fillRect(Math.round(p.x - bw / 2), my2 - bw, bw, Math.max(1, Math.round(z * 0.6)));
    }
  }
  if (st.kind === 'stone') {
    // Muret plein : parement OMBRÉ (sinon il se fondait dans le platelage,
    // quasi même valeur — vu à la capture) + margelle claire (grammaire du
    // quai) + ombre de contact au pied, qui l'assoit sur le tablier.
    ctx.fillStyle = rgb(st.rail, 0.80);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y - railH); ctx.lineTo(p1.x, p1.y - railH);
    ctx.lineTo(p1.x, p1.y); ctx.lineTo(p0.x, p0.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgb(st.railTop, 1.04);
    ctx.lineWidth = Math.max(1, z * 1.3);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y - railH); ctx.lineTo(p1.x, p1.y - railH); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,16,10,0.30)';
    ctx.lineWidth = Math.max(1, z * 0.6);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  } else {
    // Lisse + sous-lisse (bois/métal). Énergie : la lisse haute LUIT ambre.
    ctx.strokeStyle = rgb(st.railTop);
    ctx.lineWidth = Math.max(1, z * 1.2);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y - railH); ctx.lineTo(p1.x, p1.y - railH); ctx.stroke();
    ctx.strokeStyle = rgb(st.rail);
    ctx.lineWidth = Math.max(1, z * 0.8);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y - railH * 0.52); ctx.lineTo(p1.x, p1.y - railH * 0.52); ctx.stroke();
    if (st.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${st.glow},0.30)`;
      ctx.lineWidth = Math.max(1.5, z * 2.4);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y - railH); ctx.lineTo(p1.x, p1.y - railH); ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Le pont au tri peintre : trois items PAR CELLULE longitudinale ───────────
// part 'deck' (platelage, à plat) : profondeur au coin NORD de sa tranche —
//   même geste que les empreintes 'field' : tout ce qui le chevauche se trie
//   après, donc au-dessus (agents dessus, bâtiments voisins des deux rives).
// part 'up' (bord amont) : parapet seul, profondeur de SA ligne.
// part 'down' (bord aval) : face + arches + piles + contreventement + parapet.
// Poussés SANS garde LOD (les bâtiments du tri n'en ont pas) ; le dessin se
// simplifie de lui-même au LOD (platelage nu, face seule).
export function pushIsoBridgeItems(items, bounds) {
  if (!isoBridge3dFlag.on) return;
  const L = CM.layout; if (!L) return;
  const geos = bridgeGeoms(); if (!geos) return;
  const T = CM.TILE;
  for (let si = 0; si < geos.length; si += 1) {
    const g = geos[si];
    for (let li = Math.floor(g.a / T); li * T < g.b; li += 1) {
      const l0 = Math.max(g.a, li * T), l1 = Math.min(g.b, (li + 1) * T);
      if (l1 - l0 < 1) continue;
      const lMid = (l0 + l1) / 2;
      for (const part of ['deck', 'up', 'down']) {
        const t = part === 'up' ? g.c - g.wD : part === 'down' ? g.c + g.wD : g.c;
        const gx = g.vertical ? Math.floor(t / T) : li;
        const gy = g.vertical ? li : Math.floor(t / T);
        if (gx < bounds.gx0 || gx > bounds.gx1 || gy < bounds.gy0 || gy > bounds.gy1) continue;
        const d = part === 'deck' ? g.D(l0, g.c - g.wD) : g.D(lMid, t);
        items.push({ d, kind: 'bridgeSeg', si, l0, l1, part });
      }
    }
  }
}

export function drawIsoBridgeSeg(ctx, it, now) {
  const geos = bridgeGeoms(); if (!geos || !geos[it.si]) return;
  const L = CM.layout; if (!L) return;
  const g = geos[it.si], st = styleFor(L), z = CM.cam.zoom, T = CM.TILE;
  const lod = CM.lodActive;
  _drew.segs += 1;
  if (it.part === 'deck') {
    drawDeckSeg(ctx, g, st, it.l0, it.l1, z, lod);
    return;
  }
  if (it.part === 'up') {
    if (!lod) drawRailRun(ctx, g, st, g.c - g.wD, it.l0, it.l1, z);
    return;
  }
  const tAval = g.c + g.wD;
  // Écart max entre palées voisines pour les relier (arche, croix) : au-delà,
  // c'est un TROU du filtre « pied sur l'eau » (berge en biais) — on ne jette
  // pas une travée par-dessus.
  // ⚠ Doit couvrir la PASSE NAVIGABLE, dont les palées ont été retirées : sans
  // ça, l'ouverture du chenal laissait un TROU dans la face au lieu de la grande
  // arche centrale qu'on veut y voir.
  const linkMax = Math.max(st.pileEvery * 1.7, bridgeTune.passHalf * 2 + st.pileEvery) * T;
  // 1) FACE d'épaisseur (tronçon mouillé ∩ segment) : 2 assises + ombre de
  // contact. Sur la berge le tablier affleure le sol → pas de face au sec.
  const fA = Math.max(it.l0, Math.max(g.a, g.wetA - T * 0.10));
  const fB = Math.min(it.l1, Math.min(g.b, g.wetB + T * 0.10));
  const fh = st.faceH * z;
  if (fB > fA) {
    fillDrop(ctx, g, fA, fB, tAval, 0, fh, rgb(st.faceTop), rgb(st.faceBot));
    // Arches maçonnées : arcs sombres découpés dans la face entre palées.
    // CLIPPÉES à la tranche du segment : un arc à cheval sur deux segments est
    // peint moitié par moitié (géométrie globale identique → raccord invisible),
    // sans que la face du segment suivant ne recouvre la moitié déjà peinte.
    if (bridgeTune.arches && !lod && st.kind === 'stone' && st.arch) {
      ctx.save();
      ctx.beginPath();
      const c0 = g.P(fA, tAval), c1 = g.P(fB, tAval);
      ctx.moveTo(c0.x, c0.y - 1); ctx.lineTo(c1.x, c1.y - 1);
      ctx.lineTo(c1.x, c1.y + fh + 1); ctx.lineTo(c0.x, c0.y + fh + 1);
      ctx.closePath(); ctx.clip();
      ctx.fillStyle = rgb(st.arch);
      for (let i = 0; i < g.piles.length - 1; i += 1) {
        // Piédroits fins, arc OUVERT (contrôle au-dessus du haut de face,
        // sommet ~70 % de l'épaisseur — l'ancien 0.25·fh donnait un arc plat
        // invisible à la capture) ; le clip borne au ruban de face.
        if (g.piles[i + 1].l - g.piles[i].l > linkMax) continue;
        const la = g.piles[i].l + st.pileW * 0.6, lb = g.piles[i + 1].l - st.pileW * 0.6;
        if (lb - la < T * 0.3) continue;
        if (lb < it.l0 - T || la > it.l1 + T) continue;   // hors tranche (large)
        const pa = g.P(la, tAval), pb = g.P(lb, tAval);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y + fh);
        ctx.quadraticCurveTo((pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - fh * 0.40, pb.x, pb.y + fh);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    // Liseré d'ombre : le platelage porte sur la face.
    const pa = g.P(fA, tAval), pb = g.P(fB, tAval);
    ctx.strokeStyle = 'rgba(20,14,8,0.35)';
    ctx.lineWidth = Math.max(1, z * 0.7);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  if (!lod) {
    // 2) PILES du segment (positions précalculées de la géo, pied sur l'eau)
    // + eau VIVANTE au pied + braces. Une pile pile sur la couture appartient
    // au segment de GAUCHE (< l1-0.25).
    const pw = Math.max(1, st.pileW * z), drop = (st.faceH + st.pileH) * z;
    const inSeg = (l) => l >= it.l0 - 0.25 && (l < it.l1 - 0.25 || (it.l1 >= g.b - 0.5 && l <= it.l1 + 0.25));
    const tsec = (now || 0) / 1000;
    for (const pl of g.piles) {
      if (!inSeg(pl.l)) continue;
      const p = g.P(pl.l, tAval);
      const x = Math.round(p.x - pw / 2);
      ctx.fillStyle = rgb(st.pileDark);
      ctx.fillRect(x, Math.round(p.y), Math.ceil(pw), Math.round(drop));
      ctx.fillStyle = rgb(st.pile);
      ctx.fillRect(x, Math.round(p.y), Math.max(1, Math.round(pw * 0.5)), Math.round(drop));
      if (bridgeTune.ripple) {
        // EAU VIVANTE au pied (retour Raph « effet d'eau sur les pontons ») :
        // anneau de remous qui RESPIRE (rayon + alpha pulsés, phase stable par
        // pile) + écume accrochée qui scintille — mêmes courts traits
        // horizontaux écran que les reflets du fleuve (waterRipple).
        const ph = pl.ph * Math.PI * 2;
        const pulse = Math.sin(tsec * 2.2 + ph);
        const fy = p.y + drop;
        ctx.strokeStyle = `rgba(206,228,220,${(0.30 + 0.13 * pulse).toFixed(2)})`;
        ctx.lineWidth = Math.max(1, z * 0.9);
        ctx.beginPath();
        ctx.ellipse(p.x, fy, pw * (1.5 + 0.28 * pulse), Math.max(1.2, pw * 0.62) * (1 + 0.22 * pulse), 0, 0, Math.PI * 2);
        ctx.stroke();
        const rw = Math.max(2, Math.round(T * z * 0.16));
        const rh = Math.max(1, Math.round(z));
        for (let k = 0; k < 3; k += 1) {
          const tw = Math.sin(tsec * 1.7 + ph + k * 2.1);
          if (tw < 0.05) continue;
          const hx = cmHash('bfoam:' + g.sp.gx0 + ':' + Math.round(pl.l) + ':' + k);
          const ox = ((hx % 100) / 100 - 0.5) * pw * 4.4;
          const oy = (((hx >> 7) % 100) / 100 - 0.2) * pw * 1.3;
          ctx.fillStyle = `rgba(214,234,226,${(0.28 * tw).toFixed(2)})`;
          ctx.fillRect(Math.round(p.x + ox - rw / 2), Math.round(fy + oy), rw, rh);
        }
      }
    }
    // Contreventement en X (bois) : chaque croix appartient au segment de sa
    // palée GAUCHE ; elle déborde sous le bord (zone d'eau) sans rien recouvrir,
    // et la palée droite (segment suivant) vient coiffer son extrémité.
    if (bridgeTune.brace && st.kind === 'wood' && g.piles.length > 1) {
      ctx.strokeStyle = rgb(st.pileDark, 1.05);
      ctx.lineWidth = Math.max(1, z * 0.8);
      for (let i = 0; i < g.piles.length - 1; i += 1) {
        if (!inSeg(g.piles[i].l)) continue;
        if (g.piles[i + 1].l - g.piles[i].l > linkMax) continue;
        const pa = g.P(g.piles[i].l, tAval), pb = g.P(g.piles[i + 1].l, tAval);
        const y0 = st.faceH * z, y1 = drop - 1.5 * z;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y + y0); ctx.lineTo(pb.x, pb.y + y1);
        ctx.moveTo(pb.x, pb.y + y0); ctx.lineTo(pa.x, pa.y + y1);
        ctx.stroke();
      }
    }
    // 3) PARAPET aval : par-dessus la face, devant les jambes des traverseurs.
    drawRailRun(ctx, g, st, tAval, it.l0, it.l1, z);
    // 4) SUSPENSION : pylônes, câble porteur, suspentes — dessinés APRÈS le
    // parapet, ils passent devant lui comme dans la réalité.
    if (st.suspended && !lod) drawSuspension(ctx, g, st, it, z);
  }
}

// ── Suspension : deux pylônes, un câble, des suspentes ──────────────────────
// Tout est tracé côté AVAL, dans le même ruban vertical écran que la face et le
// parapet : la verticalité du jeu est toujours de l'écran, jamais du monde.
//
// Le câble suit une PARABOLE (approximation classique de la caténaire, et la
// seule qui se lise à cette taille) entre les deux têtes de pylône. La flèche
// vaut `sag` × la portée : c'est ce ventre qui dit « suspendu » d'un coup d'œil,
// bien plus qu'un pylône isolé.
function drawSuspension(ctx, g, st, it, z) {
  const tw = g.towers;
  if (!tw || tw.length < 2) return;
  const tAval = g.c + g.wD;
  const [lA, lB] = tw;
  const portee = lB - lA;
  if (!(portee > 0)) return;
  const topH = st.towerH * z;                       // hauteur au-dessus du tablier
  const sag = st.sag * portee;                      // flèche, en px monde longitudinal
  // Hauteur du câble au-dessus du tablier, à la position l. 0 aux pylônes,
  // -sag au milieu (on descend vers le tablier).
  const yCable = (l) => {
    const u = (l - lA) / portee;                    // 0..1
    const v = 4 * u * (1 - u);                      // parabole, 1 au milieu
    return -topH + v * Math.min(topH * 0.92, sag * z * 0.5);
  };
  const inSeg = (l) => l >= it.l0 - 1 && l <= it.l1 + 1;

  // 1) SUSPENTES d'abord : elles passent DERRIÈRE le câble et les pylônes.
  ctx.strokeStyle = rgb(st.cable, 1.08);
  ctx.lineWidth = Math.max(1, z * 0.55);
  ctx.beginPath();
  const pas = Math.max(1, st.hangEvery * (CM.TILE || 32));
  for (let l = lA + pas; l < lB - pas * 0.5; l += pas) {
    if (!inSeg(l)) continue;
    const p = g.P(l, tAval);
    const yTop = p.y + yCable(l);
    if (yTop >= p.y - 2) continue;                  // câble déjà sur le tablier
    ctx.moveTo(Math.round(p.x) + 0.5, yTop);
    ctx.lineTo(Math.round(p.x) + 0.5, p.y);
  }
  ctx.stroke();

  // 2) CÂBLE PORTEUR, en deux passes : un trait sombre épais puis un filet clair
  // au-dessus. Un câble d'une seule teinte disparaît sur un ciel de ville ; le
  // liseré lui donne son galbe.
  for (const [col, lw, dy] of [[st.cable, 1.5, 0], [st.cableLite, 0.8, -0.8]]) {
    ctx.strokeStyle = rgb(col);
    ctx.lineWidth = Math.max(1, z * lw);
    ctx.beginPath();
    let first = true;
    for (let l = lA; l <= lB; l += Math.max(2, portee / 26)) {
      const p = g.P(l, tAval);
      const y = p.y + yCable(l) + dy * z;
      if (first) { ctx.moveTo(p.x, y); first = false; } else ctx.lineTo(p.x, y);
    }
    const pEnd = g.P(lB, tAval);
    ctx.lineTo(pEnd.x, pEnd.y + yCable(lB) + dy * z);
    ctx.stroke();
  }

  // 3) PYLÔNES par-dessus tout : ils tiennent le câble, ils doivent le couper.
  const pw = Math.max(2, st.towerW * z);
  for (const l of tw) {
    if (!inSeg(l)) continue;
    const p = g.P(l, tAval);
    const x = Math.round(p.x - pw / 2);
    const yTop = Math.round(p.y - topH);
    const h = Math.round(topH + st.faceH * z);
    ctx.fillStyle = rgb(st.towerDark);
    ctx.fillRect(x, yTop, Math.ceil(pw), h);
    ctx.fillStyle = rgb(st.tower);
    ctx.fillRect(x, yTop, Math.max(1, Math.round(pw * 0.45)), h);
    // Traverse sous la tête : sans elle le pylône n'est qu'un poteau.
    const bw = Math.ceil(pw * 2.1);
    ctx.fillStyle = rgb(st.towerDark);
    ctx.fillRect(Math.round(p.x - bw / 2), yTop + Math.round(topH * 0.22), bw, Math.max(1, Math.round(z * 1.4)));
  }
}

// ── LUMIÈRES de pont (par-dessus le voile de nuit) ───────────────────────────
// Appelée après drawIsoNight : point chaud + halo additif à chaque lanterne
// (boîtiers posés par drawRailRun), et REFLET dans l'eau côté aval — colonne de
// courts traits horizontaux qui miroitent, la grammaire des reflets du fleuve.
export function drawIsoBridgeNight(now) {
  if (!isoBridge3dFlag.on) return;
  const nf = CM.nightF || 0;
  if (nf < 0.15 || CM.lodActive) return;
  const L = CM.layout; if (!L) return;
  const geos = bridgeGeoms(); if (!geos) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const st = styleFor(L);
  const glow = st.glow || '255,199,120';
  const tsec = (now || 0) / 1000;
  _drew.night += 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const g of geos) {
    if (!spanVisible(g, z)) continue;
    for (const la of g.lamps) {
      const hh = (st.railH * (la.head ? 1.3 : 1) + 2.6) * z;   // sommet du mât (cf. boîtier)
      const flick = 0.86 + 0.14 * Math.sin(tsec * 7.3 + la.l);
      for (const side of [g.c - g.wD, g.c + g.wD]) {
        const p = g.P(la.l, side);
        const ly = p.y - hh - Math.max(2, 1.8 * z) * 0.5;
        // point chaud + halo ambiant
        ctx.fillStyle = `rgba(255,236,190,${(0.9 * nf * flick).toFixed(2)})`;
        ctx.fillRect(Math.round(p.x - z * 0.6), Math.round(ly - z * 0.6), Math.max(1, Math.round(z * 1.2)), Math.max(1, Math.round(z * 1.2)));
        const gr = ctx.createRadialGradient(p.x, ly, 0, p.x, ly, Math.max(5, T * z * 0.55));
        gr.addColorStop(0, `rgba(${glow},${(0.34 * nf * flick).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${glow},0)`);
        ctx.fillStyle = gr;
        const rr = Math.max(5, T * z * 0.55);
        ctx.fillRect(p.x - rr, ly - rr, rr * 2, rr * 2);
      }
      // REFLET dans l'eau, sous le bord AVAL (seulement si la lanterne
      // surplombe l'eau — celles des têtes de pont sont sur la berge). La
      // zone est déjà mangée par l'ombre du tablier + le voile de nuit : la
      // colonne doit être FRANCHE (1re version à 0.20 invisible à la capture) —
      // traits horizontaux qui rétrécissent en descendant et miroitent.
      if (la.wet) {
        const q = g.P(la.l, g.c + g.wD);
        const y0 = q.y + st.faceH * z + 2 * z;
        for (let k = 0; k < 6; k += 1) {
          const sw = Math.sin(tsec * 2.6 + la.l * 0.13 + k * 1.7);
          const w = Math.max(2, (8.5 - k * 1.2) * z * (0.8 + 0.2 * sw));
          ctx.fillStyle = `rgba(${glow},${(nf * (0.40 - k * 0.052) * (0.72 + 0.28 * sw)).toFixed(3)})`;
          ctx.fillRect(Math.round(q.x - w / 2 + sw * z * 1.4), Math.round(y0 + k * 3.1 * z), Math.round(w), Math.max(1, Math.round(z * 1.2)));
        }
      }
    }
  }
  ctx.restore();
}
