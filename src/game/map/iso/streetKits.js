"use strict";
// ── LE MOBILIER DE RUE PAR ÈRE — réverbère et terre-plein dessinés par le code ──
//
// Raph, 2026-10-02 (« on refait une passe sur les lampadaires/buissons/terre
// pleins ? ») : un réverbère PAR ÈRE dessiné par le code, au grain de la ville ;
// hors de la ville le terre-plein n'est plus qu'une bande d'herbe ; sur un
// boulevard, UNE file de candélabres au milieu du terre-plein ; une recette de
// plantations par ère. Pilote l'ère du Marbre (validé le 2026-10-03 : « le reste
// top, tu peux tout faire »), puis les sept autres. docs/PLAN-RUE.md fait foi.
//
// Pourquoi par le code : les images PixelLab des réverbères (110-120 px de haut)
// s'affichaient sur 25 px — un pixel dessiné en valait un cinquième, quand le sol
// et les maisons sont à un pour un. Ici un pixel d'art vaut un pixel d'écran au
// zoom 1, comme le pont (bridgeBake.js), dont on reprend la PALETTE (bridgeKits.js)
// et la lumière : haut-gauche, face gauche éclairée, face droite à l'ombre, liseré
// sombre posé SUR les pixels de bord (pas autour : la taille ne bouge pas), jamais
// sous le pied.
//
// TOISE : un habitant fait 7 à 8 px au zoom 1 ; un réverbère environ deux et demi.
//
// Pur : aucun DOM pour DESSINER. Chaque objet est un raster RGBA ; le passage en
// canvas est fait à la demande (streetKitLampArt, streetKitPlantArt, mémoïsés).
import { solInvalidate } from './solInvalidate.js';
import { bridgeKitForBand } from './bridgeKits.js';
import { SPRING, AUTUMN, WINTER } from '../seasonMode.js';

// ── Raster ───────────────────────────────────────────────────────────────────
// Repère de dessin : x relatif à l'axe du pied (négatif = gauche), y = hauteur au-
// dessus du sol (0 = rangée posée au sol). Le raster final a une marge d'un pixel.
function hexRgb(c) {
  const n = parseInt(String(c).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function makeSprite(xMin, xMax, hMax) {
  const w = xMax - xMin + 3, h = hMax + 3;
  const data = new Uint8ClampedArray(w * h * 4);
  const ox = 1 - xMin;                 // colonne du pied
  const footRow = h - 2;               // rangée y = 0
  const px = (x, y, c) => {
    if (!c) return;
    const i = ox + x, j = footRow - y;
    if (i < 0 || j < 0 || i >= w || j >= h) return;
    const v = typeof c === 'string' ? hexRgb(c) : c;
    const k = (j * w + i) * 4;
    data[k] = v[0]; data[k + 1] = v[1]; data[k + 2] = v[2]; data[k + 3] = 255;
  };
  const has = (x, y) => {
    const i = ox + x, j = footRow - y;
    return i >= 0 && j >= 0 && i < w && j < h && data[(j * w + i) * 4 + 3] > 0;
  };
  return { w, h, data, ox, footRow, px, has };
}
// Liseré : recolore les pixels de bord dont le voisin du DESSUS, de GAUCHE ou de
// DROITE est vide (même règle que le pont) — le dessous reste, l'objet se pose.
function inkEdges(S, ink) {
  const { w, h, data } = S;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) a[i] = data[i * 4 + 3] ? 1 : 0;
  const v = hexRgb(ink);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      if (!a[j * w + i]) continue;
      const up = j > 0 ? a[(j - 1) * w + i] : 0;
      const lf = i > 0 ? a[j * w + i - 1] : 0;
      const rt = i < w - 1 ? a[j * w + i + 1] : 0;
      if (up && lf && rt) continue;
      const k = (j * w + i) * 4;
      data[k] = v[0]; data[k + 1] = v[1]; data[k + 2] = v[2];
    }
  }
}
// Neige : là où elle tient, sur les pixels que rien ne couvre (voisin du dessus
// vide), côté éclairé de préférence. `p` = part des pixels qui la gardent.
function snowTops(S, seed, p = 0.7) {
  const tops = [];
  for (let j = 0; j < S.h; j += 1) {
    for (let i = 0; i < S.w; i += 1) {
      if (!S.data[(j * S.w + i) * 4 + 3]) continue;
      if (j > 0 && S.data[((j - 1) * S.w + i) * 4 + 3]) continue;
      tops.push([i - S.ox, S.footRow - j]);
    }
  }
  for (const [x, y] of tops) {
    if (y < 2) continue;                                     // le pied reste sec
    const q = (hh(seed, x, y, 5) % 100) / 100;
    if (q < p * (x <= 0 ? 1 : 0.6)) S.px(x, y, '#eef3f4');
  }
}
// Hash entier stable (texture du feuillage).
function hh(a, b, c = 0, d = 0) {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647 + (d | 0) * 1274126177;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
}
// Rangée centrée sur `cx` : gauche éclairée, milieu, droite à l'ombre.
function row(S, y, cx, half, lit, mid, shade) {
  for (let x = cx - half; x <= cx + half; x += 1) S.px(x, y, x < cx ? lit : x > cx ? shade : mid);
}

// Socle carré vu en iso : un losange de demi-largeur `a` (en px d'écran), haut de
// `hgt` rangées de faces. Face gauche (normale +y) éclairée, face droite à l'ombre,
// dessus le plus clair. Rend la hauteur du dessus (là où se pose ce qui suit).
function isoBlock(S, a, y0, hgt, lit, shade, top, edge, cx = 0) {
  // Faces : la base forme un V (pointe au milieu), chaque rangée s'élargit.
  for (let r = 0; r < hgt + Math.ceil(a / 2); r += 1) {
    const y = y0 + r;
    const half = Math.min(a, 1 + r * 2);
    for (let x = -half; x <= half; x += 1) {
      if (r >= hgt) {
        // dessus : losange, se referme vers le fond
        const back = (r - hgt + 1) * 2;
        if (Math.abs(x) > a - back + 1) continue;
        S.px(cx + x, y, top);
      } else {
        S.px(cx + x, y, x < 0 ? lit : x > 0 ? shade : edge);
      }
    }
  }
  return y0 + hgt;
}

// ── FEU ──────────────────────────────────────────────────────────────────────
const FIRE = { core: '#fff2b8', mid: '#ffc24a', edge: '#f07a28', ember: '#ff9a3a' };
// Flamme peinte à (cx, y) : trois rangées qui s'effilent. Le vacillement est la
// lueur (isoStreet, lampFlicker), pas le dessin.
function flame(S, cx, y) {
  S.px(cx - 1, y, FIRE.mid); S.px(cx, y, FIRE.core); S.px(cx + 1, y, FIRE.edge);
  S.px(cx - 1, y + 1, FIRE.edge); S.px(cx, y + 1, FIRE.mid);
  S.px(cx, y + 2, FIRE.edge);
}

// ── FEUILLAGES, par saison ───────────────────────────────────────────────────
// Rampe de 5 : 0 reflet · 1 éclairé · 2 moyen · 3 ombre · 4 ombre profonde.
const LEAF = {
  [SPRING]: ['#9bcb64', '#7caf4c', '#5e903b', '#45722e', '#305323'],
  summer: ['#7ea152', '#5e8a3e', '#477232', '#335a28', '#244420'],
  [AUTUMN]: ['#e6b452', '#cf8c37', '#ae6b2b', '#854c20', '#5c3418'],
};
const leafRamp = (season) => LEAF[season] || LEAF.summer;
const leafInk = (season) => (season === AUTUMN ? '#3d2512' : '#1c3216');
const BARK = ['#7d5a3c', '#5e4129', '#43301e'];
const TWIG = ['#8a6a4e', '#6b4f38', '#4c3726'];
// Couronne en ellipse (centre cx, cy ; rayons rx, ry), éclairée d'en haut à gauche,
// bord déchiqueté et touffes au hash. Hiver : branches nues (squelette clairsemé),
// la neige vient ensuite (snowTops). `blossom` : fleurs de printemps.
function crown(S, cx, cy, rx, ry, season, seed, blossom = null) {
  const winter = season === WINTER, G = leafRamp(season);
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      const u = (x - cx) / (rx + 0.5), v = (y - cy) / (ry + 0.5);
      const d = u * u + v * v;
      if (d > 1) continue;
      const n = hh(seed, x, y);
      if (d > 0.72 && n % 5 < 2) continue;                  // bord déchiqueté
      if (winter) {
        // Squelette : le tronc qui monte, et une branche sur trois rangées.
        const onLimb = x === cx || (Math.abs(x - cx) === Math.abs(y - (cy - ry)) % (rx + 1) && n % 2 === 0);
        if (onLimb || n % 4 === 0) S.px(x, y, TWIG[(x > cx ? 1 : 0) + (n % 7 === 0 ? 1 : 0)]);
        continue;
      }
      const light = -u * 0.55 + v * 0.75;
      let k = light > 0.45 ? 0 : light > 0.1 ? 1 : light > -0.25 ? 2 : light > -0.6 ? 3 : 4;
      const m = n % 9;
      if (m === 0) k = Math.max(0, k - 1);
      if (m === 8) k = Math.min(4, k + 1);
      S.px(x, y, G[k]);
      if (blossom && season === SPRING && k <= 2 && hh(seed, x, y, 3) % 6 === 0) S.px(x, y, blossom);
    }
  }
}
function trunk(S, cx, y0, y1, w = 1) {
  for (let y = y0; y <= y1; y += 1) {
    if (w === 1) S.px(cx, y, BARK[1]);
    else { S.px(cx - 1, y, BARK[0]); S.px(cx, y, BARK[2]); }
  }
}

// ═════════════════════════ LES RÉVERBÈRES ══════════════════════════════════
// Chaque dessin rend { S, light, tieY }. `light` : style du vacillement, teinte,
// visibilité de jour, têtes lumineuses (px d'art depuis le pied). `tieY` : où l'on
// peut nouer un fil (fanions des places) — null pour un mât qui BRÛLE : « ce sont
// des mâts avec une flamme au bout, accrocher les fils dessus n'est pas logique »
// (Raph, 2026-10-03).

// PIERRE TAILLÉE — un panier à feu en fer forgé sur un poteau de pierre brute,
// comme les piliers à vasque de feu du pont roman.
function lampPierre(P) {
  const st = P.stone, I = ['#4f4a44', '#35312d', '#221f1c'];
  const S = makeSprite(-4, 4, 20);
  let y = isoBlock(S, 3, 0, 2, st[3], st[5], st[1], st[4]);
  for (const top = y + 10; y < top; y += 1) {
    const joint = (y % 4) === 1;
    S.px(-1, y, joint ? st[4] : st[2]); S.px(0, y, joint ? st[5] : st[3]); S.px(1, y, joint ? st[6] : st[5]);
  }
  row(S, y, 0, 2, st[1], st[2], st[4]); y += 1;
  row(S, y, 0, 2, st[0], st[1], st[3]); y += 1;
  inkEdges(S, st[7]);
  // le panier : barreaux, cercle, braises et flamme
  S.px(-2, y, I[1]); S.px(-1, y, FIRE.ember); S.px(0, y, I[1]); S.px(1, y, FIRE.ember); S.px(2, y, I[2]);
  y += 1;
  for (let x = -3; x <= 3; x += 1) S.px(x, y, Math.abs(x) === 3 ? I[x < 0 ? 0 : 2] : FIRE.ember);
  const headY = y + 1;
  y += 1;
  S.px(-3, y, I[0]); S.px(3, y, I[2]);
  for (let x = -2; x <= 2; x += 1) S.px(x, y, Math.abs(x) === 2 ? FIRE.edge : x === 0 ? FIRE.core : FIRE.mid);
  y += 1;
  S.px(-3, y, I[1]); S.px(3, y, I[2]);
  flame(S, 0, y);
  return { S, light: { style: 'fire', col: '255,176,80', day: 0.5, heads: [{ x: 0, y: headY + 1, r: 0.24 }] }, tieY: null };
}

// COURONNE — une lanterne pendue à une potence de bois. Le fil se noue au poteau.
function lampCouronne(P) {
  const st = P.stone, W = bridgeKitForBand(1).pal.wood, I = ['#3e3a35', '#2a2723'];
  const S = makeSprite(-3, 5, 21);
  isoBlock(S, 2, 0, 1, st[3], st[5], st[1], st[4]);
  for (let y = 1; y <= 19; y += 1) { S.px(-1, y, (y % 5) === 3 ? W[1] : W[0]); S.px(0, y, W[2]); }
  S.px(-1, 20, W[1]); S.px(0, 20, W[2]);
  for (let x = 1; x <= 5; x += 1) { S.px(x, 18, W[1]); S.px(x, 17, W[3]); }   // la potence
  S.px(1, 15, W[2]); S.px(2, 16, W[2]);                                      // le jambage
  inkEdges(S, W[4]);
  // chaîne et lanterne, sous le bout de la potence
  S.px(4, 16, I[1]);
  row(S, 15, 4, 1, I[0], I[0], I[1]);
  for (let y = 12; y <= 14; y += 1) { S.px(3, y, I[0]); S.px(4, y, y === 14 ? '#fff0b8' : '#ffd27a'); S.px(5, y, I[1]); }
  row(S, 11, 4, 1, I[0], I[0], I[1]);
  S.px(4, 10, I[1]);
  return { S, light: { style: 'gas', col: '255,196,110', day: 0.12, heads: [{ x: 4, y: 13, r: 0.18 }] }, tieY: 13 };
}

// MARBRE — colonnette de marbre et vasque de bronze (le pilote).
function lampMarbre(P) {
  const S = makeSprite(-4, 4, 18);
  const M = P.marble, st = P.stone, B = ['#e3c27a', '#b98b45', '#7a5629'];
  let y = isoBlock(S, 3, 0, 2, st[2], st[5], st[0], st[3]);
  for (let x = -2; x <= 2; x += 1) S.px(x, y, x < 0 ? M[0] : x > 0 ? st[4] : M[1]);
  y += 1;
  for (const top = y + 6; y < top; y += 1) { S.px(-1, y, M[0]); S.px(0, y, M[1]); S.px(1, y, st[4]); }
  for (let x = -2; x <= 2; x += 1) S.px(x, y, x < 0 ? M[0] : x > 0 ? st[3] : M[1]);
  y += 1;
  for (let x = -2; x <= 2; x += 1) S.px(x, y, x < 0 ? B[1] : B[2]);
  y += 1;
  for (let x = -3; x <= 3; x += 1) S.px(x, y, x < 0 ? B[0] : x === 0 ? B[1] : B[2]);
  y += 1;
  for (let x = -2; x <= 2; x += 1) S.px(x, y, Math.abs(x) === 2 ? B[2] : FIRE.ember);
  const emberY = y;
  y += 1;
  flame(S, 0, y);
  inkEdges(S, st[7]);
  flame(S, 0, y);                                    // la flamme ne porte pas de liseré
  return { S, light: { style: 'fire', col: '255,186,84', day: 0.5, heads: [{ x: 0, y: emberY + 2, r: 0.2 }] }, tieY: null };
}

// FONTE — le candélabre à deux lanternes des boulevards du Second Empire : socle
// cannelé, bague dorée, traverse à volutes, lanternes à gaz.
function lampFonte(P) {
  const I = P.iron, Gd = P.gold;
  const S = makeSprite(-5, 5, 22);
  let y = isoBlock(S, 3, 0, 3, I[1], I[3], I[0], I[2]);
  y += 1;
  row(S, y, 0, 1, I[1], I[2], I[3]); y += 1;
  for (const top = y + 9; y < top; y += 1) {
    if (y === 10) row(S, y, 0, 2, Gd[0], Gd[1], Gd[2]);
    else { S.px(-1, y, I[1]); S.px(0, y, I[2]); S.px(1, y, I[4]); }
  }
  const tieY = y - 2;
  for (let x = -4; x <= 4; x += 1) S.px(x, y, x < 0 ? I[1] : I[2]);         // traverse
  S.px(-4, y - 1, I[3]); S.px(4, y - 1, I[3]);                               // volutes
  S.px(0, y + 1, I[2]); S.px(0, y + 2, I[2]); S.px(0, y + 3, Gd[0]);         // fleuron
  const lantern = (cx) => {
    row(S, y + 1, cx, 1, I[2], I[2], I[3]);
    for (let k = 2; k <= 4; k += 1) { S.px(cx - 1, y + k, I[2]); S.px(cx, y + k, '#ffd98a'); S.px(cx + 1, y + k, I[3]); }
    row(S, y + 5, cx, 1, I[1], I[1], I[2]);
    S.px(cx, y + 6, I[2]);
  };
  lantern(-4); lantern(4);
  inkEdges(S, I[4]);
  for (const cx of [-4, 4]) for (let k = 2; k <= 4; k += 1) S.px(cx, y + k, k === 4 ? '#fff0c0' : '#ffd98a');
  return {
    S, tieY,
    light: { style: 'gas', col: '255,201,120', day: 0.12, heads: [{ x: -4, y: y + 3, r: 0.16 }, { x: 4, y: y + 3, r: 0.16 }] },
  };
}

// NÉON — un mât d'acier fin, deux bras, deux têtes LED à plat.
function lampNeon(P) {
  const R = P.rail, st = P.stone;
  const S = makeSprite(-6, 5, 22);
  isoBlock(S, 2, 0, 1, R[1], R[2], R[0], R[1]);
  for (let y = 1; y <= 19; y += 1) { S.px(-1, y, R[0]); S.px(0, y, R[2]); }
  for (let x = -5; x <= 4; x += 1) S.px(x, 20, x < 0 ? R[0] : R[1]);       // bras
  for (const [a, b] of [[-6, -4], [3, 5]]) for (let x = a; x <= b; x += 1) S.px(x, 21, st[6]);
  inkEdges(S, st[7]);
  for (const [a, b] of [[-6, -4], [3, 5]]) for (let x = a; x <= b; x += 1) S.px(x, 20, '#e6f7ff');
  return {
    S, tieY: 12,
    light: { style: 'steady', col: '230,244,255', day: 0.14, heads: [{ x: -5, y: 19, r: 0.14 }, { x: 4, y: 19, r: 0.14 }] },
  };
}

// ÈRES COSMIQUES — une lame sombre parcourue d'un filet de lumière, coiffée d'une
// lentille, dans la couleur de l'ère (celle des quais et du pont).
function lampCosmic(P) {
  const st = P.stone, G = P.glow;
  const S = makeSprite(-3, 3, 21);
  isoBlock(S, 3, 0, 1, st[4], st[6], st[3], st[5]);
  for (let y = 2; y <= 17; y += 1) {
    const half = y >= 15 ? 0 : 1;
    if (half) { S.px(-1, y, st[5]); S.px(1, y, st[7]); }
    S.px(0, y, half ? G : st[6]);
  }
  inkEdges(S, st[8]);
  for (let y = 2; y <= 14; y += 1) S.px(0, y, G);
  row(S, 18, 0, 1, G, '#ffffff', G);
  row(S, 19, 0, 1, G, G, G);
  S.px(0, 20, G);
  return { S, tieY: 10, light: { style: 'pulse', col: hexRgb(G).join(','), day: 0.45, heads: [{ x: 0, y: 19, r: 0.22 }] } };
}

// ═════════════════════════ LES PLANTATIONS ═════════════════════════════════
// Chaque plantation : (seed, season, P) → raster. seed ∈ 1..4 (variante).

// BUISSON SAUVAGE (Pierre ; et l'île de la merveille) : touffe ronde, genêt fleuri
// au printemps et l'été. `size` 0..3 : du buisson bas au gros roncier.
function shrub(seed, season, P, size = 0) {
  const rx = 3 + size, ry = 2 + Math.ceil(size * 0.8);
  const S = makeSprite(-rx - 1, rx + 1, ry * 2 + 2);
  // Le pied : trois brins au sol sous la touffe (sinon le buisson flotte d'un pixel,
  // et l'hiver, branches clairsemées, de deux).
  S.px(-1, 0, BARK[1]); S.px(0, 0, BARK[2]); S.px(1, 0, BARK[1]);
  crown(S, 0, ry + 1, rx, ry, season, seed * 31 + size);
  if (season !== WINTER) {
    if (season !== AUTUMN) {
      for (let y = 1; y <= ry * 2 + 1; y += 1) for (let x = -rx; x <= rx; x += 1) {
        if (S.has(x, y) && hh(seed, x, y, 9) % 11 === 0) S.px(x, y, season === SPRING ? '#f3d75a' : '#e9c64a');
      }
    }
    inkEdges(S, leafInk(season));
  } else {
    inkEdges(S, '#3a2a1c');
    snowTops(S, seed, 0.8);
  }
  return S;
}

// Buisson du terre-plein de la Pierre : la touffe sauvage, en taille 1 ou 2.
function wildBush(seed, season, P) { return shrub(seed, season, P, 1 + (seed % 2)); }

// BORNE de pierre (ères médiévales) : un fût trapu, coiffé.
// Trop étroite pour un liseré (il mangerait les deux flancs) : modelé seul, flanc
// droit dans l'ombre profonde, tête arrondie claire.
function bollard(seed, season, P) {
  const st = P.stone;
  const S = makeSprite(-2, 2, 5);
  for (let y = 0; y <= 3; y += 1) { S.px(-1, y, st[2]); S.px(0, y, st[4]); S.px(1, y, st[6]); }
  S.px(-1, 4, st[0]); S.px(0, 4, st[1]); S.px(1, 4, st[4]);
  S.px(0, 5, st[2]);
  if (season === WINTER) { S.px(-1, 4, '#eef3f4'); S.px(0, 4, '#eef3f4'); S.px(0, 5, '#eef3f4'); }
  return S;
}

// TILLEUL (Couronne) : petit arbre rond d'un mail planté.
function lime(seed, season) {
  const S = makeSprite(-6, 6, 17);
  trunk(S, 0, 0, 4);
  crown(S, 0, 10, 5, 5 + (seed % 2), season, seed * 17, '#f4eedd');
  inkEdges(S, season === WINTER ? '#3a2a1c' : leafInk(season));
  if (season === WINTER) snowTops(S, seed, 0.75);
  return S;
}

// CYPRÈS (Marbre) : le fuseau sombre des voies romaines. Toujours vert ; l'hiver
// pose la neige sur ses épaules.
const CYPRESS_PROFILE = [1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 0, 0];
function cypress(seed, season) {
  const G = LEAF.summer;
  const H = CYPRESS_PROFILE.length + 2;
  const S = makeSprite(-3, 3, H);
  S.px(0, 0, '#6b4a30'); S.px(0, 1, '#563a25');
  for (let i = 0; i < CYPRESS_PROFILE.length; i += 1) {
    const y = i + 2, half = CYPRESS_PROFILE[i];
    for (let x = -half; x <= half; x += 1) {
      const n = hh(seed, x, y) % 7;
      let k = x < 0 ? 1 : x === 0 ? 2 : 3;
      if (x === -half && half > 0 && n < 3) k = 0;
      if (x === half && n < 3) k = 4;
      if (n === 6 && k < 4) k += 1;               // creux entre deux touffes
      S.px(x, y, G[k]);
    }
  }
  S.px(0, CYPRESS_PROFILE.length + 2, G[2]);      // pointe
  inkEdges(S, '#1c3216');
  if (season === WINTER) {
    for (let i = 0; i < CYPRESS_PROFILE.length; i += 1) {
      const half = CYPRESS_PROFILE[i], above = i + 1 < CYPRESS_PROFILE.length ? CYPRESS_PROFILE[i + 1] : -1;
      for (let x = -half; x <= 0; x += 1) if (Math.abs(x) > above) S.px(x, i + 2, '#eef3f4');
    }
    S.px(0, CYPRESS_PROFILE.length + 2, '#eef3f4');
  }
  return S;
}

// VASQUE FLEURIE (Marbre) : coupe de marbre sur pied, pleine de fleurs (dominante +
// accent, robe par variante). Hiver : un buis taillé en boule, coiffé de neige.
const FLOWER_ROBES = [
  ['#f2cf5a', '#e8913a', '#f6f1dc'],   // jaune / orange
  ['#e0605a', '#ee9ab4', '#f6f1dc'],   // rouge / rose
  ['#b48ad8', '#8f78d6', '#f6f1dc'],   // lavande
  ['#f2cf5a', '#e0605a', '#b48ad8'],   // mélange vif
];
function urn(seed, season, P) {
  const M = P.marble, st = P.stone;
  const S = makeSprite(-4, 4, 11);
  for (let x = -1; x <= 1; x += 1) S.px(x, 0, x < 0 ? st[2] : x > 0 ? st[5] : st[3]);
  S.px(0, 1, st[3]);
  [[-2, 2], [-3, 3], [-3, 3], [-4, 4]].forEach(([a, b], i) => {
    for (let x = a; x <= b; x += 1) {
      const c = i === 3 ? (x < 0 ? M[0] : x > 1 ? st[3] : M[1])
        : x < -1 ? M[0] : x < 1 ? M[1] : x < 3 ? M[2] : st[4];
      S.px(x, 2 + i, c);
    }
  });
  fillPlanting(S, seed, season, 6, [[-4, 4], [-3, 3], [-3, 3], [-2, 2], [-1, 1]]);
  inkEdges(S, st[7]);
  return S;
}
// Remplit un contenant (vasque, bac) : fleurs de la saison sur un dôme de feuillage
// à partir de la rangée `top` ; hiver = buis enneigé, automne = feuillage roux.
function fillPlanting(S, seed, season, top, dome) {
  const L = season === AUTUMN ? LEAF[AUTUMN].slice(1, 4) : ['#5f8a3e', '#477232', '#335a28'];
  if (season === WINTER) {
    dome.slice(1).forEach(([a, b], i) => {
      for (let x = a; x <= b; x += 1) S.px(x, top + i, i >= 2 && x <= 0 ? '#eef3f4' : L[x < 0 ? 0 : x === 0 ? 1 : 2]);
    });
    return;
  }
  const robe = FLOWER_ROBES[seed % FLOWER_ROBES.length];
  const bloom = season === AUTUMN ? 0.15 : season === SPRING ? 0.55 : 0.45;
  dome.forEach(([a, b], i) => {
    for (let x = a; x <= b; x += 1) {
      const n = (hh(seed, x, i + 11) % 100) / 100;
      let c = L[x < 0 ? 0 : x === 0 ? 1 : 2];
      if (n < bloom) c = robe[0];
      else if (n < bloom + 0.1) c = robe[1];
      else if (n < bloom + 0.16 && i > 0) c = robe[2];
      S.px(x, top + i, c);
    }
  });
}

// PLATANE (Fonte) : l'alignement des boulevards — tronc tacheté clair, grande
// couronne. Sa grille de fonte est au sol, cuite avec le terre-plein.
function plane(seed, season) {
  const S = makeSprite(-8, 8, 21);
  for (let y = 0; y <= 6; y += 1) {
    const n = hh(seed, y, 1) % 3;
    S.px(-1, y, n === 0 ? '#d8d0b0' : '#bdb58f'); S.px(0, y, n === 1 ? '#8b876a' : '#a49e7c');
  }
  crown(S, 0, 13, 7, 6, season, seed * 13, null);
  inkEdges(S, season === WINTER ? '#3a2a1c' : leafInk(season));
  if (season === WINTER) snowTops(S, seed, 0.7);
  return S;
}

// COLONNE MORRIS (Fonte) : la colonne d'affiches vert sombre, coiffée de son dôme.
// Le fût est un tambour d'affiches sur fond crème : trois affiches côte à côte,
// chacune de sa couleur, le cylindre tournant à l'ombre vers la droite ; corniche
// plus large que le fût, dôme bas et fleuron — la silhouette d'une colonne, pas
// d'une ogive.
function morris(seed, season) {
  const S = makeSprite(-5, 5, 16);
  const GR = ['#6d8f75', '#4c6b54', '#3a5543', '#263a2d'];
  const INK = ['#c8402f', '#e2b441', '#3d6fb0', '#2f7a4a', '#7a3d8a'];
  const shade = (c, x) => hexRgb(c).map((v) => v * (x < -1 ? 1 : x < 1 ? 0.92 : x < 3 ? 0.8 : 0.66));
  row(S, 0, 0, 3, GR[1], GR[2], GR[3]);
  row(S, 1, 0, 4, GR[0], GR[1], GR[3]);
  for (let y = 2; y <= 10; y += 1) {
    for (let x = -3; x <= 3; x += 1) {
      const slot = x < -1 ? 0 : x < 2 ? 1 : 2;                       // trois affiches
      const sx = x === -2 || x === 1;                                 // jour entre deux affiches
      const head = y >= 8;                                            // bandeau du haut de l'affiche
      const n = hh(seed, slot, y >= 6 ? 1 : 0) % INK.length;
      let c = '#efe6cf';
      if (!sx && (head || (y % 3 === 0 && (x + y) % 2 === 0))) c = INK[n];
      if (!sx && y <= 3) c = INK[(n + 2) % INK.length];
      S.px(x, y, shade(c, x));
    }
  }
  row(S, 11, 0, 4, GR[0], GR[1], GR[3]);                              // corniche
  row(S, 12, 0, 3, GR[0], GR[1], GR[2]);
  row(S, 13, 0, 2, GR[0], GR[1], GR[2]);                              // dôme
  row(S, 14, 0, 1, GR[0], GR[0], GR[1]);
  S.px(0, 15, '#d2a53e');                                             // fleuron doré
  inkEdges(S, '#1b2a20');
  S.px(0, 15, '#d2a53e');
  if (season === WINTER) snowTops(S, seed, 0.9);
  return S;
}

// JEUNE ARBRE (Néon) : tronc fin, couronne ovale d'arbre de ville récent.
function youngTree(seed, season) {
  const S = makeSprite(-5, 5, 15);
  trunk(S, 0, 0, 5);
  crown(S, 0, 10, 3 + (seed % 2), 4, season, seed * 7, '#f4f0e6');
  inkEdges(S, season === WINTER ? '#3a2a1c' : leafInk(season));
  if (season === WINTER) snowTops(S, seed, 0.7);
  return S;
}

// BAC DE BÉTON (Néon) : jardinière carrée, arbustes bas et fleurs de saison.
function planter(seed, season, P) {
  const st = P.stone;
  const S = makeSprite(-5, 5, 11);
  const top = isoBlock(S, 4, 0, 4, st[1], st[4], '#5a4a36', st[2]);
  fillPlanting(S, seed, season, top + 1, [[-3, 3], [-3, 3], [-2, 2], [-1, 1]]);
  inkEdges(S, st[6]);
  if (season === WINTER) snowTops(S, seed, 0.85);
  return S;
}

// FOUGÈRE LUMINEUSE (ères cosmiques) : tiges sombres qui se courbent, bulbes de
// lumière dans la couleur de l'ère.
function frond(seed, season, P) {
  const D = hexRgb(P.glass), G = P.glow;
  const dark = D.map((c) => c * 0.8), mid = D, lite = D.map((c) => Math.min(255, c * 1.35));
  const S = makeSprite(-5, 5, 13);
  const stems = [
    [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [-1, 6], [-1, 7], [-1, 8], [-1, 9], [-1, 10]],
    [[0, 1], [-1, 2], [-2, 3], [-2, 4], [-3, 5], [-3, 6], [-4, 7]],
    [[0, 1], [1, 2], [2, 3], [2, 4], [3, 5], [3, 6], [3, 7], [4, 8]],
  ];
  if (seed % 2) stems.push([[0, 2], [1, 3], [1, 4], [1, 5], [2, 6], [2, 7]]);
  for (const s of stems) for (const [x, y] of s) S.px(x, y, x < 0 ? lite : x > 0 ? dark : mid);
  inkEdges(S, '#101521');
  for (const s of stems) {
    const [x, y] = s[s.length - 1];
    S.px(x, y + 1, G); S.px(x + 1, y + 1, G); S.px(x, y + 2, '#ffffff');
  }
  return S;
}

// CRISTAL (ères cosmiques) : trois éclats de verre dans la couleur de l'ère.
function crystal(seed, season, P) {
  const G = hexRgb(P.glow), D = hexRgb(P.glass);
  const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
  const lit = mix(G, [255, 255, 255], 0.35), mid = G, shade = mix(G, D, 0.55);
  const S = makeSprite(-4, 4, 10);
  const shard = (cx, h, w) => {
    for (let y = 0; y < h; y += 1) {
      const half = y > h - 3 ? 0 : w;
      for (let x = cx - half; x <= cx + half; x += 1) S.px(x, y, x < cx ? lit : x > cx ? shade : mid);
    }
  };
  shard(-2, 5 + (seed % 2), 1);
  shard(2, 4 + (seed % 3), 1);
  shard(0, 9, 1);
  inkEdges(S, '#151826');
  S.px(-1, 6, '#ffffff'); S.px(-1, 5, '#ffffff');
  if (season === WINTER) snowTops(S, seed, 0.5);
  return S;
}

// ═════════════════════════ LES KITS ════════════════════════════════════════
// `median.pattern` : ce qui se succède le long du terre-plein, un objet tous les
// `step` tuiles. `ground` : 'lawn' (gazon) ou 'gravel' (sable stabilisé). `lawn` /
// `gravel` : leur ton, calé sur le pré de la ville (mesuré 2026-10-02 : pré
// ≈ 65,102,50 ; le gazon d'avant 121,148,82, deux fois plus clair). `curb` : la
// bordure (null = pas de bordure, l'herbe s'arrête sur la chaussée) ; `curbGlow` :
// liseré lumineux. `stripes` : bandes de tonte. `grate` : grille de fonte au pied
// des arbres.
const LAWN = [74, 112, 56];
const KITS = {
  2: {
    id: 'pierre', lamp: lampPierre,
    median: { pattern: ['shrub', 'bollard', 'lamp', 'bollard'], step: 0.625, ground: 'lawn', lawn: [70, 106, 52], curb: null, plants: { shrub: wildBush, bollard } },
  },
  3: {
    id: 'couronne', lamp: lampCouronne,
    median: { pattern: ['tree', 'bollard', 'lamp', 'bollard'], step: 0.625, ground: 'lawn', lawn: LAWN, curb: '#bbae8e', plants: { tree: lime, bollard } },
  },
  4: {
    id: 'marbre', lamp: lampMarbre,
    median: { pattern: ['tree', 'lamp', 'tree', 'urn'], step: 0.625, ground: 'lawn', lawn: LAWN, curb: '#e6dfcd', plants: { tree: cypress, urn } },
  },
  5: {
    id: 'fonte', lamp: lampFonte,
    median: {
      pattern: ['tree', 'lamp', 'tree', 'column', 'tree', 'lamp', 'tree', 'tree'], step: 0.625,
      ground: 'gravel', gravel: [198, 182, 142], curb: '#9c968c', grate: true, plants: { tree: plane, column: morris },
    },
  },
  6: {
    id: 'neon', lamp: lampNeon,
    median: { pattern: ['tree', 'lamp', 'tree', 'planter'], step: 0.625, ground: 'lawn', lawn: [78, 118, 58], stripes: true, curb: '#d2d2ce', plants: { tree: youngTree, planter } },
  },
  7: { id: 'noosphere', lamp: lampCosmic, median: cosmicMedian() },
  8: { id: 'stellaire', lamp: lampCosmic, median: cosmicMedian() },
  9: { id: 'demiurge', lamp: lampCosmic, median: cosmicMedian() },
};
function cosmicMedian() {
  return { pattern: ['frond', 'lamp', 'frond', 'crystal'], step: 0.625, ground: 'lawn', lawn: LAWN, curb: null, curbGlow: true, plants: { frond, crystal } };
}
// Palette d'une bande : celle de son pont (une seule main).
function palOf(band) { return bridgeKitForBand(band).pal; }

// Molette A/B : __streetKit(false) rejoue le mobilier d'avant (PNG, parterres,
// mâts des deux voies), __streetKit(true) le kit. Le sol cuit est invalidé (le
// terre-plein y vit).
export const STREET_KIT = { on: true };
if (typeof window !== 'undefined') {
  window.__streetKit = (v) => {
    if (typeof v === 'boolean') { STREET_KIT.on = v; solInvalidate('all'); }
    return { ...STREET_KIT };
  };
}

// Kit de la bande, ou null (bandes 0-1 : ni boulevard ni réverbère ; ou molette
// coupée → le mobilier d'avant, inchangé).
export function streetKitFor(band) {
  return (STREET_KIT.on && KITS[band | 0]) || null;
}
// Couleur de la lumière de l'ère (liseré des terre-pleins cosmiques).
export function streetKitGlow(band) {
  const p = palOf(band);
  return p && p.glow ? p.glow : null;
}

// ── Raster → art (canvas) ────────────────────────────────────────────────────
// Format « art » d'isoArt ({ ready, img }), plus la métrique de pied déjà connue
// (`_foot`, lue par lampFootMetrics) : le dessin sait où est son pied, rien à mesurer.
function toCanvas(S) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null;
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(S.w, S.h);
  c.width = S.w; c.height = S.h;
  const g = c.getContext('2d');
  g.putImageData(new ImageData(S.data, S.w, S.h), 0, 0);
  return c;
}
function artOf(S, extra) {
  const img = toCanvas(S);
  if (!img) return null;
  return {
    ready: true, img, w: S.w, h: S.h,
    // footXf/footYf : pied en fraction du canvas (centre de la colonne du pied,
    // bas de la rangée posée au sol) ; artW/artH : taille en px d'art = px
    // d'écran au zoom 1 (cf. lampBox, isoStreet.js).
    _foot: { footXf: (S.ox + 0.5) / S.w, footYf: (S.footRow + 1) / S.h, usedHf: 1, artW: S.w, artH: S.h },
    ...extra,
  };
}

// Dessin brut du réverbère d'une bande (null sans kit).
function lampRaster(band) {
  const K = streetKitFor(band);
  return K && K.lamp ? K.lamp(palOf(band)) : null;
}

const _lampArt = new Map();
// Réverbère de l'ère, en art prêt à poser (ou null : pas de kit → PNG d'avant).
// `lig` suit le format de LAMP_LIGHTS (isoStreet.js) : sources en FRACTION du
// canvas. `tieY` : hauteur (px d'art au-dessus du sol) où l'on peut nouer un fil,
// null si le mât brûle.
export function streetKitLampArt(band) {
  const K = streetKitFor(band);
  if (!K || !K.lamp) return null;
  if (_lampArt.has(band)) return _lampArt.get(band);
  const { S, light, tieY } = lampRaster(band);
  const fx = (x) => (S.ox + x + 0.5) / S.w, fy = (y) => (S.footRow - y + 0.5) / S.h;
  const em = light.heads.map((e) => ({ fx: fx(e.x), fy: fy(e.y), r: e.r }));
  const hx = em.reduce((a, e) => a + e.fx, 0) / em.length, hy = em.reduce((a, e) => a + e.fy, 0) / em.length;
  const lig = { style: light.style, col: light.col, day: light.day, hx, hy, em };
  const a = artOf(S, { lig, tieY: tieY == null ? null : tieY });
  _lampArt.set(band, a);
  return a;
}

const _plantArt = new Map();
function plantRaster(band, kind, seed, season) {
  const K = streetKitFor(band);
  const fn = K && K.median && K.median.plants[kind];
  return fn ? fn((seed % 4) + 1, season | 0, palOf(band)) : null;
}
// Plantation du terre-plein : `kind` (tree, urn…), `seed` (variante), `season`
// (seasonMode : SPRING… WINTER).
export function streetKitPlantArt(band, kind, seed, season) {
  const K = streetKitFor(band);
  if (!K || !K.median || !K.median.plants[kind]) return null;
  const key = band + ':' + kind + ':' + (seed % 4) + ':' + (season | 0);
  if (_plantArt.has(key)) return _plantArt.get(key);
  const a = artOf(plantRaster(band, kind, seed, season));
  _plantArt.set(key, a);
  return a;
}
// Buisson sauvage hors des terre-pleins (île de la merveille) : même main, toutes
// ères. `size` 0..3.
const _wildArt = new Map();
export function wildShrubArt(seed, season, size) {
  const key = (seed % 4) + ':' + (season | 0) + ':' + size;
  if (_wildArt.has(key)) return _wildArt.get(key);
  const a = artOf(shrub((seed % 4) + 1, season | 0, null, size));
  _wildArt.set(key, a);
  return a;
}

// Pour l'aperçu hors jeu (scripts) et les tests : les rasters bruts d'une bande,
// plantations en été (`[kind]`, 4 variantes) et dans les quatre saisons
// (`[kind + 'Seasons']`, variante 1).
export function streetKitRasters(band) {
  const K = streetKitFor(band);
  if (!K) return null;
  const lamp = lampRaster(band);
  const out = { lamp: lamp && lamp.S, tieY: lamp && lamp.tieY, heads: lamp && lamp.light.heads };
  for (const kind of Object.keys(K.median.plants)) {
    out[kind] = [0, 1, 2, 3].map((v) => plantRaster(band, kind, v, 1));
    out[kind + 'Seasons'] = [0, 1, 2, 3].map((s) => plantRaster(band, kind, 0, s));
  }
  return out;
}
export function wildShrubRasters() {
  return [0, 1, 2, 3].map((size) => shrub(1, 1, null, size));
}
