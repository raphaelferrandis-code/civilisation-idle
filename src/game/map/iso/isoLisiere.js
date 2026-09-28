"use strict";
// LA LISIÈRE ARRONDIE — le bord entre deux sols cesse de suivre les losanges.
//
// Demande de Raph (2026-09-28) : « le contour des cases, pour un rendu plus naturel,
// entre la berge, l'herbe, le sol et les routes ». Montrée d'abord éteinte en
// prototype ; verdict le soir même : « le rendu est mieux, et il faut à toutes les
// ères » → ALLUMÉE par défaut, à toutes les bandes. `__lisiere(false)` rend le sol
// d'avant au pixel près (l'A/B), `__lisiere(true)` la rallume.
//
// LE DÉFAUT QU'AUCUNE PASSE NE TOUCHAIT. Une cellule est UN losange d'UNE matière,
// donc toute frontière entre deux sols est un ESCALIER de losanges. `FRONTIER` fait
// serpenter cette frontière à l'échelle de la CELLULE (il retourne des losanges
// entiers), le mode `wander` de la frange la décale de ±2,6 pixels d'art : aucun
// des deux ne touche à la marche elle-même, qui reste la chose que l'œil voit.
//
// ICI ON DÉCIDE LA MATIÈRE PAR PIXEL D'ART, dans les seules cellules de bord :
//   · un champ LISSE par matière — B-spline quadratique posée sur les centres des
//     3×3 cellules voisines. C'est une partition de l'unité : un bord droit reste
//     exactement à sa place, un coin saillant s'arrondit (rayon ~½ cellule), un
//     coin rentrant se comble, une cellule isolée devient une tache ronde ;
//   · un BRUIT MONDE à deux octaves, un par matière : le bord ondule, continu
//     d'une cellule à l'autre (il est échantillonné en coordonnées monde, jamais
//     par cellule ni par pas).
// Le pixel reçoit la MATIÈRE du sol gagnant — sa tuile, blittée au même endroit
// que si toute la cellule en était faite. Aucune couleur nouvelle, aucun trait,
// aucun élément sombre : c'est la famille de ce qui a SURVÉCU sur cette couture
// (FRONTIER, wander : « on ne décore rien, on déplace le bord »), pas celle des
// sept décorations refusées (docs/PLAN-RENDU-VILLE.md §5).
//
// ⚠ RENDU SEUL. `kindAt`, urbanSet, le plan, les routes et les agents ne bougent
// pas : seul le dessin du sol change, et seulement près des bords.
// ⚠ DÉTERMINISTE ET ANCRÉ MONDE : la décision ne dépend que de la position monde
// et des matières des 3×3 voisines. Deux tuiles de la pyramide qui cuisent la même
// cellule rendent donc les mêmes pixels, et la signature de tuile (2 cellules de
// marge, cf. tileSig) couvre déjà le voisinage lu ici.
import { solInvalidate } from './solInvalidate.js';

// amp  : poids du bruit face au champ. Le champ passe de −1 à +1 en ~1 cellule de
//        part et d'autre du bord (pente 2 par cellule) : amp 0,9 déplace le bord de
//        ±0,2 cellule au plus, ±0,1 en moyenne.
// f1/f2 : fréquences des deux octaves, en cycles par cellule ; fine = part de la
//        seconde (le grain du bord, là où la première donne sa forme).
// roads : arrondit aussi les virages des chemins rustiques (isoGroundRoads).
export const LISIERE = { on: true, amp: 0.9, f1: 1.4, f2: 4.2, fine: 0.35, roads: true };

// Les sols qui ont un bord NATUREL. Place et parvis sont des dallages : leur bord
// franc est voulu (même règle que la frange d'herbe) — ils ne comptent pas dans
// le champ et ne sont jamais retouchés.
const SOFT = { grass: 1, urban: 2, dirt: 3, sand: 4, shingle: 5 };
export const lisiereSoft = (k) => SOFT[k] !== undefined;

// Hash entier → [0, 1). Pas de chaîne : ce bruit est évalué des milliers de fois
// par cellule de bord, là où `smoothNoise` (cmHash sur une chaîne) coûterait cent
// fois plus pour le même service.
function h01(ix, iy, s) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// Poids B-spline quadratique des cellules −1, 0, +1 pour une position t ∈ [0,1)
// dans la cellule (somme = 1).
function bw(t, out) {
  const m = 1 - t;
  out[0] = 0.5 * m * m;
  out[1] = 0.75 - (t - 0.5) * (t - 0.5);
  out[2] = 0.5 * t * t;
}

// CACHE du classement en texels, partagé par toutes les cuissons : la clé porte la
// cellule ET les matières de ses 3×3 voisines, donc un plan qui change ailleurs ne
// le périme pas, et une cellule dont le voisinage change reçoit une clé neuve.
// Vidé quand les réglages bougent (molette) ou quand il dépasse sa taille.
const texCache = new Map();
const TEX_CACHE_MAX = 20000;

// TABLE DES TEXELS du losange (64×32, centre dedans) — constante, construite une
// fois pour toutes : position (i, j), poids B-spline des 9 voisines, et accès à la
// grille de bruit (nœud et fractions). Tout ce qui ne dépend que de la POSITION
// du texel sort ainsi de la boucle chaude ; il n'y reste que les matières.
const G = 8, GN = G + 1;                     // grille de bruit d'une cellule : pas de 1/8
let texTableMemo = null;
function texTable() {
  if (texTableMemo) return texTableMemo;
  const I = [], J = [], W = [], NO = [], NFX = [], NFY = [];
  const wu = [0, 0, 0], wv = [0, 0, 0];
  for (let j = 0; j < 32; j += 1) {
    const fy = (j + 0.5) / 16;               // 0..2 en demi-hauteurs
    for (let i = 0; i < 64; i += 1) {
      const fx = (i + 0.5) / 32 - 1;         // −1..1 en demi-largeurs, 0 = axe nord-sud
      // Losange : |fx| + |fy − 1| ≤ 1 (centre du texel dedans, comme le masque de face).
      if (Math.abs(fx) + Math.abs(fy - 1) > 1) continue;
      // (fx, fy) → coordonnées locales monde : tu = (fx + fy)/2, tv = (fy − fx)/2.
      const tu = Math.min(0.9999, Math.max(0, (fx + fy) / 2)), tv = Math.min(0.9999, Math.max(0, (fy - fx) / 2));
      bw(tu, wu); bw(tv, wv);
      I.push(i); J.push(j);
      for (let c = 0; c < 9; c += 1) W.push(wu[c % 3] * wv[(c / 3) | 0]);
      const x = tu * G, y = tv * G, q0 = Math.min(G - 1, x | 0), j0 = Math.min(G - 1, y | 0);
      NO.push(j0 * GN + q0); NFX.push(x - q0); NFY.push(y - j0);
    }
  }
  texTableMemo = {
    n: I.length, I: Int8Array.from(I), J: Int8Array.from(J), W: Float64Array.from(W),
    NO: Int16Array.from(NO), NFX: Float64Array.from(NFX), NFY: Float64Array.from(NFY),
  };
  return texTableMemo;
}

// Fabrique du classement, une par cuisson. `kindAt` = le verdict mémoïsé du bake ;
// `neutral(gx, gy)` = cellule hors champ (l'eau : son sol est recouvert par le
// fleuve, le laisser voter ferait mordre de l'herbe dans la grève).
//
// ⚠ COÛT : c'est une boucle par TEXEL (1 024 par cellule de bord), et la cuisson
// d'une grande ville en compte des milliers. Ce qui la tient :
//   · la table des texels (poids, accès au bruit) est CONSTANTE — calculée une fois ;
//   · l'état d'une cellule (matières des 3×3 voisines, grille de bruit 9×9) est
//     calculé une fois par cuisson et mémorisé : la frange et les fleurs, qui
//     interrogent des points au hasard de part et d'autre des bords, le
//     retrouvent au lieu de refaire 324 bruits à chaque changement de cellule ;
//   · les nœuds de bruit du bord sont partagés avec la voisine (même point
//     monde) : l'interpolation garde la continuité ;
//   · quand le champ seul décide (écart entre les deux premières matières > amp),
//     le bruit n'est même pas lu ; et le cas courant — deux matières, pas d'eau —
//     a sa voie directe (une somme au lieu d'un tri).
export function makeLisiere(kindAt, neutral, cfg = LISIERE) {
  const cells = new Map();                     // 'gx,gy' → état de la cellule (cette cuisson)
  const score = new Float64Array(9), wu = new Float64Array(3), wv = new Float64Array(3);
  let cur = null, curX = NaN, curY = NaN;
  // État de (gx, gy) : indice de matière des 3×3 voisines (KI, −1 = hors champ),
  // matières distinctes, nombre de matières (0 si la cellule est hors champ),
  // et pour la voie directe la liste des voisines de la matière 0.
  const load = (gx, gy) => {
    if (gx === curX && gy === curY) return cur;
    const key = gx + ',' + gy;
    let st = cells.get(key);
    if (!st) {
      const KI = new Int8Array(9), kinds = [], c0 = [];
      let full = true;
      for (let c = 0; c < 9; c += 1) {
        const x = gx + (c % 3) - 1, y = gy + ((c / 3) | 0) - 1;
        let k = neutral(x, y) ? null : kindAt(x, y);
        if (k != null && !lisiereSoft(k)) k = null;
        let idx = -1;
        if (k != null) {
          idx = kinds.indexOf(k);
          if (idx < 0) { idx = kinds.length; kinds.push(k); }
        } else full = false;
        KI[c] = idx;
        if (idx === 0) c0.push(c);
      }
      st = { gx, gy, KI, kinds, n: KI[4] < 0 ? 0 : kinds.length, full, c0: Int8Array.from(c0), noise: null };
      cells.set(key, st);
    }
    cur = st; curX = gx; curY = gy;
    return st;
  };
  // Grille de bruit 9×9 d'une matière, aux nœuds MONDE (gx + q/8, gy + j/8) :
  //   bruit de bord = vnoise(f1)·(1 − fine) + vnoise(f2)·fine − ½   (−½..+½)
  // où vnoise est un bruit de valeur lissé (smoothstep) sur un réseau entier haché
  // (h01). Chaque nœud du RÉSEAU n'est haché qu'une fois par octave : les 81 points
  // × 4 coins en redemandaient quelques dizaines, 324 fois. Les nœuds du bord de la
  // cellule sont les mêmes points monde que ceux de la voisine : même valeur au
  // bit près, donc le bord reste continu d'une cellule à l'autre.
  const octave = (out, gx, gy, f, s, wgt, first) => {
    const lx0 = Math.floor(gx * f), lx1 = Math.floor((gx + 1) * f) + 1;
    const ly0 = Math.floor(gy * f), ly1 = Math.floor((gy + 1) * f) + 1;
    const LW = lx1 - lx0 + 1;
    const tab = new Float64Array(LW * (ly1 - ly0 + 1));
    for (let b = ly0; b <= ly1; b += 1) for (let a = lx0; a <= lx1; a += 1) tab[(b - ly0) * LW + (a - lx0)] = h01(a, b, s);
    for (let j = 0; j < GN; j += 1) {
      const y = (gy + j / G) * f, y0 = Math.floor(y), fy = y - y0, sy = fy * fy * (3 - 2 * fy);
      for (let q = 0; q < GN; q += 1) {
        const x = (gx + q / G) * f, x0 = Math.floor(x), fx = x - x0, sx = fx * fx * (3 - 2 * fx);
        const o = (y0 - ly0) * LW + (x0 - lx0);
        const top = tab[o] + (tab[o + 1] - tab[o]) * sx, bot = tab[o + LW] + (tab[o + LW + 1] - tab[o + LW]) * sx;
        const v = (top + (bot - top) * sy) * wgt;
        out[j * GN + q] = first ? v : out[j * GN + q] + v;
      }
    }
  };
  const noiseOf = (st) => {
    if (st.noise) return st.noise;
    st.noise = st.kinds.map((k) => {
      const arr = new Float64Array(GN * GN), seed = SOFT[k] * 104729 + 17;
      octave(arr, st.gx, st.gy, cfg.f1, seed, 1 - cfg.fine, true);
      if (cfg.fine > 0) octave(arr, st.gx, st.gy, cfg.f2, seed + 7919, cfg.fine, false);
      else for (let i = 0; i < arr.length; i += 1) arr[i] += 0.5 * cfg.fine;
      for (let i = 0; i < arr.length; i += 1) arr[i] -= 0.5;
      return arr;
    });
    return st.noise;
  };
  const lerpNoise = (arr, o, fx, fy) => {
    const top = arr[o] + (arr[o + 1] - arr[o]) * fx;
    const bot = arr[o + GN] + (arr[o + GN + 1] - arr[o + GN]) * fx;
    return top + (bot - top) * fy;
  };
  // INDICE de la matière gagnante pour les 9 poids W[o..o+8] (somme 1), la grille
  // de bruit étant lue au nœud `no` avec les fractions (nfx, nfy).
  const winW = (st, W, o, no, nfx, nfy) => {
    const amp = cfg.amp;
    if (st.n === 2 && st.full) {
      // Voie directe : deux matières, aucune voisine hors champ → score1 = 1 − score0.
      let s0 = 0;
      const c0 = st.c0;
      for (let q = 0; q < c0.length; q += 1) s0 += W[o + c0[q]];
      const d = 2 * s0 - 1;
      if (d > amp) return 0;
      if (-d > amp) return 1;
      const nz = noiseOf(st);
      return d + amp * (lerpNoise(nz[0], no, nfx, nfy) - lerpNoise(nz[1], no, nfx, nfy)) >= 0 ? 0 : 1;
    }
    const KI = st.KI, n = st.kinds.length;
    for (let i = 0; i < n; i += 1) score[i] = 0;
    let tot = 0;
    for (let c = 0; c < 9; c += 1) {
      const idx = KI[c];
      if (idx < 0) continue;
      const w = W[o + c];
      score[idx] += w; tot += w;
    }
    if (tot < 1e-6) return KI[4];
    let b1 = 0, b2 = -1;
    for (let i = 1; i < n; i += 1) {
      if (score[i] > score[b1]) { b2 = b1; b1 = i; } else if (b2 < 0 || score[i] > score[b2]) b2 = i;
    }
    // Le bruit d'une matière vaut ±½·amp : au-delà d'un écart de amp, il ne peut
    // plus rien retourner.
    if (b2 < 0 || (score[b1] - score[b2]) / tot > amp) return b1;
    const nz = noiseOf(st);
    let best = 0, bestS = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const sc = score[i] / tot + amp * lerpNoise(nz[i], no, nfx, nfy);
      if (sc > bestS) { bestS = sc; best = i; }
    }
    return best;
  };
  // Même décision en un point local QUELCONQUE (tu, tv) de la cellule chargée.
  const w9 = new Float64Array(9);
  const winner = (st, tu, tv) => {
    bw(tu, wu); bw(tv, wv);
    for (let c = 0; c < 9; c += 1) w9[c] = wu[c % 3] * wv[(c / 3) | 0];
    const x = tu * G, y = tv * G, q0 = Math.min(G - 1, x | 0), j0 = Math.min(G - 1, y | 0);
    return winW(st, w9, 0, j0 * GN + q0, x - q0, y - j0);
  };
  // La cellule a-t-elle un voisin (8-connexité) d'une AUTRE matière naturelle ?
  // Test RAPIDE, sans rien allouer : presque toutes les cellules balayées sont
  // intérieures, et bâtir leur état pour conclure « rien à faire » coûtait plus
  // que les bords eux-mêmes (mesuré : ~25 ms par vue de ville de l'ère 1).
  // Mémorisé par cuisson : la frange et les fleurs interrogent les MÊMES cellules
  // des dizaines de fois (mesuré sans mémo : la frange passait de 28 à 95 ms).
  const edges = new Map();
  let edgeX = NaN, edgeY = NaN, edgeV = false;
  const isEdge = (gx, gy) => {
    if (gx === edgeX && gy === edgeY) return edgeV;
    const key = gx + ',' + gy;
    let v = edges.get(key);
    if (v === undefined) {
      v = false;
      const k = kindAt(gx, gy);
      if (lisiereSoft(k) && !neutral(gx, gy)) {
        for (let c = 0; c < 9 && !v; c += 1) {
          if (c === 4) continue;
          const x = gx + (c % 3) - 1, y = gy + ((c / 3) | 0) - 1;
          const kn = kindAt(x, y);
          if (kn !== k && lisiereSoft(kn) && !neutral(x, y)) v = true;
        }
      }
      edges.set(key, v);
    }
    edgeX = gx; edgeY = gy; edgeV = v;
    return v;
  };
  // Matière au point MONDE (u, v) en cellules — pour poser fleurs et touffes du
  // bon côté du nouveau bord. Même champ, même grille de bruit que la peinture.
  const kindAtPoint = (u, v) => {
    const gx = Math.floor(u), gy = Math.floor(v);
    if (!isEdge(gx, gy)) return kindAt(gx, gy);
    const st = load(gx, gy);
    return st.kinds[winner(st, Math.min(0.9999, u - gx), Math.min(0.9999, v - gy))];
  };
  // PEINTURE d'une cellule de bord : pour chaque matière présente dans le losange
  // de (gx, gy) — la sienne COMPRISE —, ses rectangles écran (x0,y0,x1,y1 à plat).
  // null si la cellule n'est pas un bord : elle garde alors son losange habituel.
  //
  // Pourquoi la matière propre aussi : le losange habituel bave d'un pixel sur
  // ses voisines (liseré anti-couture, tolérance du masque de face). Sur un bord
  // droit la bavure est de la même matière que le voisin et ne se voit pas ; sur
  // un bord arrondi elle redessinait l'ancien losange en pointillé. Une cellule
  // de bord est donc peinte ENTIÈREMENT par rectangles de texels, sans bavure —
  // les texels de deux cellules voisines pavent le plan sans se recouvrir.
  //
  // La grille est celle des TEXELS de la tuile (64×32, posée en round(nx − hw),
  // round(ny) comme le blit) : un rectangle couvre exactement un pixel d'art, la
  // tuile de la matière le remplit donc sans liseré. Le classement en texels ne
  // dépend NI du zoom NI de la tuile de pyramide qui cuit : il est mis en CACHE
  // par cellule (cf. texelRuns), et seule la mise à l'échelle se refait.
  //
  // `blades` : les zones de BRINS de l'herbe — le débord en perspective de sa
  // tuile, au-dessus des arêtes nord, là où la colonne commence en herbe. Il ne
  // se peint que là où l'herbe touche encore l'ancienne arête ; ailleurs le bord
  // a reculé et les brins flotteraient dans la terre.
  const texelRuns = (st) => {
    let sig = st.gx + ',' + st.gy + '|';
    for (let c = 0; c < 9; c += 1) sig += st.KI[c] < 0 ? '0' : SOFT[st.kinds[st.KI[c]]];
    const hit = texCache.get(sig);
    if (hit) return hit;
    const T = texTable();
    const rr = [];                                  // (indice, j, i0, i1) à plat
    const topK = new Int8Array(64).fill(-2), topJ = new Int8Array(64);
    let runK = -1, runJ = -1, runI = 0, lastI = 0;
    for (let t = 0; t < T.n; t += 1) {
      const i = T.I[t], j = T.J[t];
      const k = winW(st, T.W, t * 9, T.NO[t], T.NFX[t], T.NFY[t]);
      if (topK[i] === -2 && j < 16) { topK[i] = k; topJ[i] = j; }
      if (j !== runJ || k !== runK) {
        if (runK >= 0) rr.push(runK, runJ, runI, lastI + 1);
        runK = k; runJ = j; runI = i;
      }
      lastI = i;
    }
    if (runK >= 0) rr.push(runK, runJ, runI, lastI + 1);
    const res = { kinds: st.kinds.slice(), rr, topK, topJ };
    if (texCache.size > TEX_CACHE_MAX) texCache.clear();
    texCache.set(sig, res);
    return res;
  };
  const BLADE_TEXELS = 4;
  const runs = (gx, gy, own, nx, ny, hw) => {
    if (!lisiereSoft(own) || !isEdge(gx, gy)) return null;
    const st = load(gx, gy);
    if (st.n < 2) return null;
    const tr = texelRuns(st);
    const s2 = (hw * 2) / 64;                       // taille du texel à l'écran (= zoom)
    const X0 = Math.round(nx - hw), Y0 = Math.round(ny);
    // Bord de texel → pixel écran, À LA RÈGLE DU NEAREST : la colonne c montre le
    // texel floor((c + ½)/k), donc le texel i commence en ceil(i·k − ½). Un simple
    // round tomberait à côté d'un pixel sur deux à zoom 1,25 ; sous zoom 1, deux
    // texels peuvent tomber sur le même pixel (rectangle vide, sauté).
    const ex = (i) => X0 + Math.ceil(i * s2 - 0.5), ey = (j) => Y0 + Math.ceil(j * s2 - 0.5);
    const out = new Map();
    const rr = tr.rr;
    for (let q = 0; q < rr.length; q += 4) {
      const x0 = ex(rr[q + 2]), x1 = ex(rr[q + 3]), y0 = ey(rr[q + 1]), y1 = ey(rr[q + 1] + 1);
      if (x1 <= x0 || y1 <= y0) continue;
      const kk = tr.kinds[rr[q]];
      let arr = out.get(kk);
      if (!arr) { arr = []; out.set(kk, arr); }
      arr.push(x0, y0, x1, y1);
    }
    if (!out.size) return null;
    const blades = [];
    if (s2 >= 1 && out.has('grass')) {
      const bh = Math.ceil(BLADE_TEXELS * s2);
      for (let i = 0; i < 64; i += 1) {
        const k = tr.topK[i];
        if (k < 0 || tr.kinds[k] !== 'grass') continue;
        const yTop = ey(tr.topJ[i]);
        blades.push(ex(i), yTop - bh, ex(i + 1), yTop);
      }
    }
    return { byKind: out, blades };
  };
  return { isEdge, runs, kindAtPoint };
}

if (typeof window !== 'undefined') {
  // Molette : __lisiere(true|false) ; ({ amp, f1, f2, fine }) règle le bord.
  // Recuit tout le sol (la pyramide jette ses tuiles).
  window.__lisiere = (arg) => {
    if (arg === false) LISIERE.on = false;
    else if (arg && typeof arg === 'object') { LISIERE.on = true; Object.assign(LISIERE, arg); }
    else LISIERE.on = true;
    texCache.clear();
    solInvalidate('all');
    return { ...LISIERE };
  };
}
