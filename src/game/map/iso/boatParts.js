"use strict";
// ── LA BOÎTE À PIÈCES DES BATEAUX (docs/PLAN-BATEAUX.md §3) ─────────────────────
//
// Ce que tous les kits d'époque partagent : la coque paramétrique, l'équipage, les
// cargaisons, la mâture, les cheminées, les cabines, les rambardes. Chaque pièce
// prend ses MATIÈRES en paramètre (rampes de couleurs de l'époque) : la même voile
// carrée est en lin sous le Marbre, en laine rayée sous la Pierre, en lumière sous
// la Noosphère.
//
// Repère et unités : ceux de boatBake.js (a le long, c en travers tribord +, h au-
// dessus de l'eau, px monde au zoom 1). Toise : un homme debout fait 7,2 px.
// Pur : aucun DOM, aucun CM.

import {
  surf, box, boxRamp, ellipsoid, tube, revolve, rampRGB, inFrame, asPart, PART, h32, rgbOf,
} from './boatBake.js';

// ── Tirages ───────────────────────────────────────────────────────────────────
// Deux passes de hachage : en une seule, les petites graines tombaient presque
// toutes sur la même voile (4 safran sur 5 à la première planche).
export const mix = (seed, salt, k) => h32(h32(seed, salt, k), k ^ 0x5bd1, salt);
export const pick = (arr, seed, salt) => arr[mix(seed, salt, 911) % arr.length];
export const chance = (seed, salt, p) => (mix(seed, salt, 733) % 1000) / 1000 < p;

// Couleur ÉMISSIVE (lumière cosmique, hublot allumé) : jamais ombrée.
export const glow = (hex) => { const c = rgbOf(hex); return () => c; };

// ── LA COQUE ──────────────────────────────────────────────────────────────────
// H = { L, B, D (franc-bord au milieu), sb / ss (tonture à l'avant / l'arrière),
//       pb / ps (plénitude des bouts : 1,4 effilé … 4 carré), tb / ts (tableau :
//       largeur résiduelle des bouts carrés), flare (évasement : coque plus étroite
//       à la flottaison), th (épaisseur du bordé), plank (hauteur d'une virure),
//       open (bateau ouvert : intérieur visible) | deck (hauteur du pavois) ,
//       floor (hauteur du plancher d'un bateau ouvert) }
// V = { hull, hullIn, rail, deck, floor, band: [dd0, dd1], bandRamp, boot: [h0, h1],
//       bootRamp (liseré de flottaison), glowRail (couleur émissive du plat-bord) }
export function hullShape(H) {
  const L2 = H.L / 2;
  const f = (u) => {
    const t = Math.min(1, Math.abs(u));
    const ex = u >= 0 ? H.pb : H.ps;
    const k = Math.pow(Math.max(0, 1 - Math.pow(t, ex)), 0.5);
    const tr = u >= 0 ? (H.tb || 0) : (H.ts || 0);
    return tr > 0 ? tr + (1 - tr) * k : k;
  };
  const g = (u) => H.D + (u >= 0 ? H.sb : H.ss) * Math.pow(Math.min(1, Math.abs(u)), 2.4);
  const w = (u, h) => (H.B / 2) * f(u) * (1 - (H.flare || 0) * (1 - Math.max(0, Math.min(1, h / g(u)))));
  const deckH = (u) => g(u) - (H.deck || 0);
  return { L2, f, g, w, deckH, at: (a) => a / L2 };
}

export function drawHull(S, H, V) {
  const sh = hullShape(H);
  const { L2, g, w } = sh;
  const th = H.th || 1;
  const plank = H.plank || 0;
  asPart(S, 2, () => {
    // Bordé extérieur, deux bords.
    for (const side of [-1, 1]) {
      surf(S, (u, v) => { const h = v * g(u); return [u * L2, side * w(u, h), h]; }, -1, 1, 0, 1,
        (u, v, nw) => {
          const gg = g(u), h = v * gg, dd = gg - h;
          let ramp = V.hull, bias = 0;
          if (V.band && dd >= V.band[0] && dd < V.band[1]) ramp = V.bandRamp;
          else if (V.boot && h >= V.boot[0] && h < V.boot[1]) ramp = V.bootRamp;
          else if (plank && dd > 0.7 && (dd % plank) > plank - 0.55) bias += 1;
          if (h < 0.9 && !V.boot) bias += 1;
          return rampRGB(ramp, nw, bias);
        });
    }
    // DESSOUS de la coque (bateaux qui LÉVITENT, H.bottom) : invisible d'en haut,
    // mais c'est lui que montre le reflet — sans lui, le reflet laissait voir le pont
    // par une coque ouverte.
    if (H.bottom) {
      surf(S, (u, s) => [u * L2, s * w(u, 0), 0], -1, 1, -1, 1, (u, s, nw) => rampRGB(V.hull, nw, 2));
    }
    // Tableaux des bouts carrés (chaland, bac).
    for (const [u, tr] of [[1, H.tb], [-1, H.ts]]) {
      if (!(tr > 0)) continue;
      surf(S, (s, v) => { const h = v * g(u); return [u * L2, s * w(u, h), h]; }, -1, 1, 0, 1,
        (s, v, nw) => {
          const h = v * g(u);
          if (V.boot && h >= V.boot[0] && h < V.boot[1]) return rampRGB(V.bootRamp, nw);
          return rampRGB(V.hull, nw, h < 0.9 && !V.boot ? 1 : 0);
        });
    }
  });
  // Intérieur : pavois + pont, ou bordé intérieur + plancher.
  asPart(S, 3, () => {
    const inner = (u, h) => Math.max(0, w(u, h) - th);
    const hLo = H.open ? (H.floor || 0.8) : null;
    for (const side of [-1, 1]) {
      surf(S, (u, v) => {
        const top = g(u), bot = H.open ? hLo : sh.deckH(u);
        const h = bot + v * (top - bot);
        return [u * L2 * 0.995, side * inner(u, h), h];
      }, -1, 1, 0, 1, (u, v, nw) => rampRGB(V.hullIn || V.hull, nw, 1));
    }
    if (H.open) {
      surf(S, (u, s) => [u * L2 * 0.98, s * inner(u, hLo), hLo], -1, 1, -1, 1,
        (u, s, nw) => {
          const c = s * inner(u, hLo);
          const seam = ((c + 64) % 2.2) < 0.55;
          return rampRGB(V.floor || V.hullIn || V.hull, nw, seam ? 2 : 1);
        });
    } else {
      surf(S, (u, s) => [u * L2 * 0.985, s * inner(u, sh.deckH(u)), sh.deckH(u)], -1, 1, -1, 1,
        (u, s, nw) => {
          const c = s * inner(u, sh.deckH(u));
          const seam = !V.smoothDeck && ((c + 64) % 2.4) < 0.55;
          return rampRGB(V.deck || V.hull, nw, seam ? 1 : 0);
        });
    }
  });
  // Plat-bord : la ligne claire qui dessine le bateau vu d'en haut (émissive pour
  // les coques cosmiques : le filet de lumière qui les signe).
  asPart(S, 4, () => {
    const col = V.glowRail ? glow(V.glowRail) : (u, s, nw) => rampRGB(V.rail || V.hull, nw);
    for (const side of [-1, 1]) {
      surf(S, (u, s) => { const gg = g(u); return [u * L2, side * (w(u, gg) - s * th), gg + 0.15]; }, -1, 1, 0, 1, col);
    }
    for (const [u, tr] of [[1, H.tb], [-1, H.ts]]) {
      if (!(tr > 0)) continue;
      surf(S, (s, t) => { const gg = g(u); return [u * (L2 - t * th), s * w(u, gg), gg + 0.15]; }, -1, 1, 0, 1, col);
    }
  });
  return sh;
}

// ── L'ÉQUIPAGE ────────────────────────────────────────────────────────────────
// Un homme debout fait 7,2 px, comme un habitant. Construit en volumes pour
// tourner avec le bateau ; le contour d'encre du peintre fait le reste.
// pose : 'stand' | 'row' (assis, bras tendus) | 'sit' | 'pole' (bras levés devant)
//        | 'haul' (penché, bras vers l'eau) | 'wave' (un bras en l'air) | 'steer'
//        | 'paddle' (à genoux, pagaie d'un bord).
// face = angle dans le plan du bateau (0 = regarde la proue).
// P = { skin, hair, cloth, legs, hat (rampe d'un couvre-chef, facultatif) }.
let _crewPart = 20;
export function person(S, a, c, h, face, P, pose = 'stand', k = 0) {
  if (S.empty) return;                         // bateau amarré : personne à bord
  _crewPart = _crewPart >= 40 ? 20 : _crewPart + 1;
  asPart(S, _crewPart, () => inFrame(S, a, c, h, face, () => {
    const seated = pose === 'row' || pose === 'sit' || pose === 'paddle';
    const hip = seated ? 0.9 : 2.5;
    const lean = pose === 'haul' ? 0.7 : pose === 'pole' ? 0.35 * Math.sin(k) : 0;
    if (!seated) boxRamp(S, -0.45, 0.45, -0.8, 0.8, 0, 2.6, P.legs || P.cloth);
    else boxRamp(S, 0, 1.6, -0.8, 0.8, 0, 0.9, P.legs || P.cloth);            // cuisses
    // Tunique : du bassin aux épaules.
    box(S, -0.62 + lean * 0.4, 0.62 + lean * 0.6, -1.15, 1.15, hip - 0.5, hip + 2.5, (f, u, v, nw) => rampRGB(P.cloth, nw));
    // Tête GROSSE, comme celle des habitants (≈ 3 px sur 8) : c'est elle qui fait
    // lire un homme à cette taille.
    const hx = lean, hz = hip + 3.75;
    ellipsoid(S, hx, 0, hz, 1.25, 1.25, 1.25, (nw) => rampRGB(P.skin, nw));
    // Couvre-chef PLAT (casquette, casque) : plus large et haut, il faisait de la
    // tête un champignon — on lisait un tonneau, pas un homme.
    if (P.hat) ellipsoid(S, hx - 0.05, 0, hz + 0.72, 1.28, 1.3, 0.5, (nw) => rampRGB(P.hat, nw), 0);
    else ellipsoid(S, hx - 0.35, 0, hz + 0.45, 1.15, 1.3, 0.9, (nw) => rampRGB(P.hair, nw), 0);
    const armR = 0.42;
    const sh = hip + 2.2;
    const arm = (side, pts) => tube(S, pts.map((p) => [p[0], side * p[1], p[2]]), armR, (nw, t) => rampRGB(t < 0.6 ? P.cloth : P.skin, nw));
    if (pose === 'row') {
      const reach = 1.3 + 0.9 * Math.cos(k);
      for (const s of [-1, 1]) arm(s, [[0.1, 1.15, sh], [reach, 0.95, sh - 0.4]]);
    } else if (pose === 'paddle') {
      const sw = Math.cos(k);
      arm(1, [[0.1, 1.15, sh], [0.6 + sw, 1.9, sh - 1.2]]);
      arm(-1, [[0.1, 1.15, sh], [0.9 + sw, 1.2, sh + 0.4]]);
    } else if (pose === 'pole') {
      for (const s of [-1, 1]) arm(s, [[lean, 1.1, sh], [lean + 1.2, 0.5, sh + 1.0 + 0.4 * s]]);
    } else if (pose === 'haul') {
      for (const s of [-1, 1]) arm(s, [[lean, 1.1, sh], [lean + 1.6, 0.8, sh - 1.4 + 0.5 * Math.sin(k + s)]]);
    } else if (pose === 'wave') {
      arm(-1, [[0, 1.15, sh], [0.1, 1.25, sh - 1.9]]);
      arm(1, [[0, 1.15, sh], [0.2, 1.6, sh + 1.2], [0.3, 1.7 + 0.3 * Math.sin(k * 3), sh + 2.4]]);
    } else if (pose === 'steer') {
      for (const s of [-1, 1]) arm(s, [[0, 1.15, sh], [-0.4, 1.5, sh - 1.0]]);
    } else {
      for (const s of [-1, 1]) arm(s, [[0, 1.15, sh], [0.05, 1.25, sh - 1.9]]);
    }
  }));
}

// Le perchiste d'un chaland : debout SUR LE PLAT-BORD (le haut du bordé, côté
// side = ±1, à l'abscisse a), face à la proue, la perche plantée en arrière et vers le
// dehors. Même geste que celui du radeau (pose 'pole', phase k). Posé dans la cale, il
// n'en sortait que la tête et la perche disparaissait derrière le bordé.
export function poler(S, sh, a, side, P, wood, k) {
  const u = sh.at(a), h = sh.g(u), c = side * (sh.w(u, h) - 0.5);
  person(S, a, c, h, 0, P, 'pole', k);
  const lean = 0.35 * Math.sin(k), out = side;
  // La perche passe par les mains et dépasse au-dessus (40 % de sa partie basse) : c'est
  // ce bout levé qui la fait lire à petit zoom.
  const hand = [a + 2 + lean, c - 0.4 * out, h + 6.3], foot = [a - 9.5 + lean * 4, c + 3.4 * out, -0.8];
  const top = hand.map((v, i) => v + (v - foot[i]) * 0.4);
  asPart(S, PART.oar, () => {
    tube(S, [top, foot], 0.32, (nw) => rampRGB(wood, nw));
  });
}

// Un membre d'équipage tiré dans la garde-robe de l'époque.
// C = { skin: [rampes], hair: [rampes], cloth: [rampes], hat: [rampes] | null,
//       hatP (probabilité d'un couvre-chef) }
export function crewPal(C, seed, salt) {
  return {
    skin: pick(C.skin, seed, salt + 1),
    hair: pick(C.hair, seed, salt + 2),
    cloth: pick(C.cloth, seed, salt),
    legs: C.legs || C.skin[1],
    hat: C.hat && chance(seed, salt + 3, C.hatP == null ? 0.5 : C.hatP) ? pick(C.hat, seed, salt + 4) : null,
  };
}

// ── CARGAISONS ────────────────────────────────────────────────────────────────
const AMPHORA = [[0, 0.35], [0.5, 0.95], [1.8, 1.15], [3.0, 0.75], [3.6, 0.42], [4.3, 0.42]];
export function amphora(S, a, c, h, ramp) {
  revolve(S, a, c, h, AMPHORA, (nw, t) => rampRGB(ramp, nw, t > 0.86 ? 1 : 0));
}
export function sack(S, a, c, h, ramp) {
  ellipsoid(S, a, c, h + 0.9, 1.6, 1.15, 0.95, (nw) => rampRGB(ramp, nw), 0);
}
export function block(S, a, c, h, sa, sc, sz, ramp) {
  box(S, a - sa, a + sa, c - sc, c + sc, h, h + sz, (f, u, v, nw) => rampRGB(ramp, nw, (f === 'top' ? 0 : (h32(Math.floor(u * 5), Math.floor(v * 5), 3) % 7 === 0 ? 1 : 0))));
}
// Tonneau couché (le long de a) : douelles et deux cercles plus sombres.
export function barrel(S, a, c, h, ramp, hoop) {
  surf(S, (u, v) => {
    const r = 1.05 * (1 - 0.18 * u * u);
    return [a + u * 1.5, c + r * Math.cos(v), h + 1.05 + r * Math.sin(v)];
  }, -1, 1, 0, Math.PI * 2, (u, v, nw) => {
    const hp = Math.abs(Math.abs(u) - 0.62) < 0.1;
    return hp ? rampRGB(hoop || ramp, nw, 2) : rampRGB(ramp, nw);
  });
}
export function crate(S, a, c, h, s, ramp) {
  box(S, a - s, a + s, c - s, c + s, h, h + s * 1.7, (f, u, v, nw) => {
    const edge = f !== 'top' && (u < 0.12 || u > 0.88 || v < 0.12 || v > 0.88);
    return rampRGB(ramp, nw, edge ? 1 : 0);
  });
}
// Ballot de laine / de drap : un coussin ficelé.
// (Le lien n'est tracé que sur le DESSUS : sur chaque face, à cette taille, il
// faisait un semis de traits — la première planche lisait du bruit.)
export function bale(S, a, c, h, ramp, tie) {
  box(S, a - 1.9, a + 1.9, c - 1.4, c + 1.4, h, h + 2.1, (f, u, v, nw) => {
    const t = f === 'top' && Math.abs(u - 0.5) < 0.09;
    return t && tie ? rampRGB(tie, nw) : rampRGB(ramp, nw, f !== 'top' && v < 0.15 ? 1 : 0);
  });
}
// Pot de terre trapu (premières époques).
export function pot(S, a, c, h, ramp) {
  revolve(S, a, c, h, [[0, 0.6], [0.7, 1.2], [1.6, 1.1], [2.2, 0.7], [2.5, 0.75]], (nw, t) => rampRGB(ramp, nw, t > 0.85 ? 1 : 0));
}
// Conteneur : tôle ondulée (cannelures verticales), une couleur par boîte.
export function container(S, a0, a1, c0, c1, h0, h1, ramp) {
  box(S, a0, a1, c0, c1, h0, h1, (f, u, v, nw) => {
    if (f === 'top') return rampRGB(ramp, nw, 0);
    const n = (f === 'a0' || f === 'a1') ? (c1 - c0) : (a1 - a0);
    const x = u * n;
    const flute = (x % 1.6) < 0.5;
    const edge = u < 0.05 || u > 0.95 || v > 0.9;
    return rampRGB(ramp, nw, edge ? 2 : flute ? 1 : 0);
  });
}

// Remplit un rectangle du pont [a0,a1]×[c0,c1] posé à la hauteur hAt(a).
// M = matières de l'époque (terra, ochre, sack, marble, marblePink, bark, barrel,
// hoop, crate, wool, woolTie, hide, basket, stone).
export function cargo(S, kind, a0, a1, c0, c1, hAt, seed, M) {
  asPart(S, 6, () => {
    if (kind === 'amphorae') {
      for (let a = a0 + 1.2; a <= a1 - 1; a += 2.5) {
        for (let c = c0 + 1.2; c <= c1 - 1; c += 2.4) {
          const ramp = h32(Math.round(a * 3), Math.round(c * 3), seed) % 5 === 0 ? M.ochre : M.terra;
          amphora(S, a, c, hAt(a), ramp);
        }
      }
    } else if (kind === 'sacks') {
      let row = 0;
      for (let a = a0 + 1.6; a <= a1 - 1.4; a += 3.1, row += 1) {
        for (let c = c0 + 1.3 + (row % 2) * 0.6; c <= c1 - 1.1; c += 2.3) sack(S, a, c, hAt(a), M.sack);
      }
      // une seconde couche, plus petite, au milieu
      for (let a = a0 + 3.2; a <= a1 - 3; a += 3.1) sack(S, a, (c0 + c1) / 2, hAt(a) + 1.5, M.sack);
    } else if (kind === 'marble' || kind === 'stone') {
      const ramp = kind === 'stone' ? M.stone : (h32(seed, 77) % 3 === 0 ? M.marblePink : M.marble);
      let a = a0 + 0.4;
      let k = 0;
      while (a < a1 - 3) {
        const la = 3 + (h32(seed, k, 5) % 3);
        const hz = 2.4 + (h32(seed, k, 9) % 3) * 0.7;
        const cw = Math.min(c1 - c0 - 0.8, 4 + (h32(seed, k, 11) % 3));
        block(S, a + la / 2, (c0 + c1) / 2, hAt(a + la / 2), la / 2 - 0.15, cw / 2, hz, ramp);
        a += la + 0.6; k += 1;
      }
    } else if (kind === 'timber') {
      for (let k = 0; k < 4; k += 1) {
        const c = c0 + 1 + k * ((c1 - c0 - 2) / 3);
        tube(S, [[a0 + 0.5, c, hAt(a0) + 0.9], [a1 - 0.5, c, hAt(a1) + 0.9]], 0.9, (nw) => rampRGB(M.bark, nw));
      }
      for (let k = 0; k < 3; k += 1) {
        const c = c0 + 1.7 + k * ((c1 - c0 - 3.4) / 2);
        tube(S, [[a0 + 1, c, hAt(a0) + 2.4], [a1 - 1, c, hAt(a1) + 2.4]], 0.85, (nw) => rampRGB(M.bark, nw));
      }
    } else if (kind === 'barrels') {
      let row = 0;
      for (let a = a0 + 1.7; a <= a1 - 1.6; a += 3.3, row += 1) {
        for (let c = c0 + 1.2; c <= c1 - 1.1; c += 2.3) barrel(S, a, c, hAt(a), M.barrel, M.hoop);
      }
      for (let a = a0 + 3.3; a <= a1 - 3.3; a += 3.3) barrel(S, a, (c0 + c1) / 2 - 1.1, hAt(a) + 1.9, M.barrel, M.hoop);
    } else if (kind === 'crates') {
      for (let a = a0 + 1.4; a <= a1 - 1.3; a += 2.9) {
        for (let c = c0 + 1.3; c <= c1 - 1.2; c += 2.7) crate(S, a, c, hAt(a), 1.2, M.crate);
      }
      for (let a = a0 + 2.8; a <= a1 - 2.8; a += 5.8) crate(S, a, (c0 + c1) / 2, hAt(a) + 2.05, 1.1, M.crate);
    } else if (kind === 'wool') {
      // Une couleur par cargaison (laine écrue, ou drap teint) : des balles de
      // couleurs tirées une à une faisaient une mosaïque illisible.
      const ramp = chance(seed, 61, 0.3) && M.cloth ? M.cloth : M.wool;
      for (let a = a0 + 2.1; a <= a1 - 2; a += 4.1) {
        for (let c = c0 + 1.6; c <= c1 - 1.5; c += 3.0) bale(S, a, c, hAt(a), ramp, M.woolTie);
      }
    } else if (kind === 'pots') {
      for (let a = a0 + 1.4; a <= a1 - 1.3; a += 2.7) {
        for (let c = c0 + 1.3; c <= c1 - 1.2; c += 2.5) pot(S, a, c, hAt(a), h32(Math.round(a * 3), Math.round(c * 3), seed) % 4 === 0 ? M.ochre : M.terra);
      }
    } else if (kind === 'hides') {
      for (let a = a0 + 1.6; a <= a1 - 1.5; a += 3.0) {
        ellipsoid(S, a, (c0 + c1) / 2, hAt(a) + 0.7, 1.7, (c1 - c0) / 2 - 0.6, 1.1, (nw) => rampRGB(M.hide, nw), 0);
      }
    } else if (kind === 'baskets') {
      for (let a = a0 + 1.3; a <= a1 - 1.2; a += 2.6) {
        for (let c = c0 + 1.2; c <= c1 - 1.1; c += 2.4) {
          revolve(S, a, c, hAt(a), [[0, 0.8], [1.5, 1.1], [1.8, 1.15]], (nw, t) => rampRGB(M.basket, nw, (Math.floor(t * 6) % 2)));
        }
      }
    }
  });
}

// ── MÂTURE ────────────────────────────────────────────────────────────────────
// Voile carrée enverguée sur une vergue, gonflée vers l'avant. sp = { am (pied
// du mât en a), hBase, mastH, yardH, W, Hs, bil (creux), ramp, stripe: {ramp, at:
// [s0, s1] symétrique} | stripes: {ramp, n} (bandes verticales alternées) |
// cross: ramp (croix héraldique), brails (nombre de cargues verticales),
// furled, mast (rampe du bois), emissive (voile de lumière : couleur unie) }
export function squareRig(S, sp) {
  const mastTop = sp.hBase + sp.mastH;
  const wood = sp.mast;
  asPart(S, 8, () => {
    tube(S, [[sp.am, 0, sp.hBase], [sp.am, 0, mastTop]], (t) => 0.78 - 0.25 * t, sp.mastGlow ? glow(sp.mastGlow) : (nw) => rampRGB(wood, nw));
  });
  const yh = sp.yardH;
  asPart(S, PART.yard, () => {
    tube(S, [[sp.am + 0.7, -sp.W / 2 - 1, yh - 0.6], [sp.am + 0.7, 0, yh], [sp.am + 0.7, sp.W / 2 + 1, yh - 0.6]], 0.5, sp.mastGlow ? glow(sp.mastGlow) : (nw) => rampRGB(wood, nw));
  });
  asPart(S, PART.sail, () => {
    if (sp.furled) {
      tube(S, [[sp.am + 1.1, -sp.W / 2, yh - 1], [sp.am + 1.1, sp.W / 2, yh - 1]], 0.9, (nw) => rampRGB(sp.ramp, nw, 1));
      return;
    }
    surf(S, (s, v) => {
      const bil = sp.bil * (1 - s * s) * Math.sin(Math.PI * (0.1 + 0.85 * v)) * (0.55 + 0.45 * v);
      return [sp.am + 1.0 + bil, s * (sp.W / 2) * (1 - 0.05 * v), yh - 0.7 - v * sp.Hs];
    }, -1, 1, 0, 1, (s, v, nw) => {
      let ramp = sp.ramp, bias = 0;
      if (sp.stripe) {
        const as = Math.abs(s);
        if (as >= sp.stripe.at[0] && as < sp.stripe.at[1]) ramp = sp.stripe.ramp;
      }
      if (sp.stripes && Math.floor(((s + 1) / 2) * sp.stripes.n) % 2 === 1) ramp = sp.stripes.ramp;
      if (sp.cross && (Math.abs(s) < 0.13 || Math.abs(v - 0.42) < 0.09)) ramp = sp.cross;
      if (sp.brails) {
        const x = ((s + 1) / 2) * sp.brails;
        if (Math.abs(x - Math.round(x)) < 0.06 && Math.round(x) > 0 && Math.round(x) < sp.brails) bias += 1;
      }
      if (v > 0.965) bias += 1;                     // ralingue basse
      return rampRGB(ramp, nw, bias);
    });
  });
}

// Voile LATINE (triangle sur une antenne oblique) : pêcheurs, barques à voile.
// lp = { am, hBase, mastH, len (antenne), W (chute), ramp, mast }
export function lateenRig(S, lp) {
  asPart(S, 8, () => {
    tube(S, [[lp.am, 0, lp.hBase], [lp.am, 0, lp.hBase + lp.mastH]], 0.5, (nw) => rampRGB(lp.mast, nw));
  });
  const top = [lp.am - lp.len * 0.35, 0, lp.hBase + lp.mastH + lp.len * 0.35];
  const foot = [lp.am + lp.len * 0.55, 0, lp.hBase + 1.5];
  asPart(S, PART.yard, () => tube(S, [top, foot], 0.38, (nw) => rampRGB(lp.mast, nw)));
  asPart(S, PART.sail, () => {
    // Triangle gonflé : antenne (u) → point d'écoute bas à l'arrière.
    const clew = [lp.am - lp.len * 0.25, 0, lp.hBase + 1.2];
    surf(S, (u, v) => {
      const ax = top[0] + (foot[0] - top[0]) * u, az = top[2] + (foot[2] - top[2]) * u;
      const x = ax + (clew[0] - ax) * v * (1 - u), z = az + (clew[2] - az) * v * (1 - u);
      const bil = lp.bil * Math.sin(Math.PI * u) * Math.sin(Math.PI * v * 0.9);
      return [x, bil, z];
    }, 0, 1, 0, 1, (u, v, nw) => rampRGB(lp.ramp, nw, v > 0.97 ? 1 : 0));
  });
}

// Cheminée : fût rond, bague de couleur, couronne noire. Rend l'ancre de fumée.
export function funnel(S, a, c, h0, ht, r, ramp, bandRamp, topRamp) {
  asPart(S, 12, () => {
    surf(S, (u, v) => [a + r * Math.cos(u), c + r * Math.sin(u), h0 + v * ht], 0, Math.PI * 2, 0, 1,
      (u, v, nw) => {
        if (topRamp && v > 0.88) return rampRGB(topRamp, nw);
        if (bandRamp && v > 0.62 && v < 0.8) return rampRGB(bandRamp, nw);
        return rampRGB(ramp, nw);
      });
  });
  return [a, c, h0 + ht + 1];
}

// Cabine / superstructure : une boîte murée de hublots, toit d'une autre teinte.
// W = { wall, roof, win (rampe ou couleur émissive), winEvery, winH: [v0, v1] }
export function cabin(S, a0, a1, c0, c1, h0, h1, W) {
  asPart(S, 11, () => {
    box(S, a0, a1, c0, c1, h0, h1, (f, u, v, nw) => {
      if (f === 'top') return rampRGB(W.roof || W.wall, nw);
      if (W.win) {
        const n = (f === 'a0' || f === 'a1') ? (c1 - c0) : (a1 - a0);
        const x = (u * n) % (W.winEvery || 2.6);
        const [v0, v1] = W.winH || [0.45, 0.75];
        if (v > v0 && v < v1 && x > 0.6 && x < (W.winEvery || 2.6) - 0.6) {
          return typeof W.win === 'string' ? rgbOf(W.win) : rampRGB(W.win, nw);
        }
      }
      return rampRGB(W.wall, nw, v < 0.08 ? 1 : 0);
    });
  });
}

// Rambarde le long d'un bord : poteaux et lisse (pièces fines, sans contour).
export function railing(S, a0, a1, c, h, ht, ramp, every = 3.2) {
  asPart(S, PART.yard, () => {
    for (let a = a0; a <= a1 + 1e-6; a += every) tube(S, [[a, c, h], [a, c, h + ht]], 0.3, (nw) => rampRGB(ramp, nw));
    tube(S, [[a0, c, h + ht], [a1, c, h + ht]], 0.3, (nw) => rampRGB(ramp, nw));
  });
}

// Paire de rames d'un canot / d'une barque, battement de phase k.
export function rowOars(S, a, cAt, h, reach, k, ramp, docked = false) {
  asPart(S, PART.oar, () => {
    for (const side of [-1, 1]) {
      const port = [a, side * cAt, h];
      const sweep = docked ? 0.15 : 0.5 * Math.cos(k);
      const lift = docked ? 3.5 : (Math.sin(k) > 0 ? 1.8 * Math.sin(k) : 0);
      const R = docked ? reach * 0.5 : reach;
      const tip = [port[0] - Math.sin(sweep) * R, port[1] + side * Math.cos(sweep) * R, -0.6 + lift];
      tube(S, [[port[0] + Math.sin(sweep) * 2.4, port[1] - side * 2.4, port[2] + 0.6], port, tip], 0.3, (nw) => rampRGB(ramp, nw));
      tube(S, [[tip[0] - (tip[0] - port[0]) * 0.25, tip[1] - (tip[1] - port[1]) * 0.25, tip[2] + 0.4], tip], 0.55, (nw) => rampRGB(ramp, nw, 1));
    }
  });
}

// Tas de filet (pêcheurs).
export function netPile(S, a, c, h, ramp) {
  asPart(S, 11, () => {
    ellipsoid(S, a, c, h, 2.4, 2.2, 1.6, (nw) => rampRGB(ramp, nw, (h32(Math.round(nw[0] * 9), Math.round(nw[1] * 9), 2) % 4 === 0) ? 1 : 0), 0);
  });
}
