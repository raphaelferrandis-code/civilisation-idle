"use strict";
// ── LE MÉTRO DU QUAI — le plan (lot 3 de docs/PLAN-ETAGES.md) ─────────────────
//
// PUR : aucun import, aucun Canvas. Dérivé du layout à chaque calcul (mémo côté
// rendu) — rien n'est stocké, rien n'est réservé.
//
// OÙ. Au-dessus de la PROMENADE DU QUAI (la berge : jamais bâtie) de la rive
// OPPOSÉE au cœur — règle de la planche : une structure haute ne passe jamais
// devant la place centrale, et l'autoroute (lot 2) suit l'artère, au sol près de
// l'eau : le métro la franchit en tête de pont, à une autre hauteur. Ils ne se
// superposent jamais (question de Raph, 2026-10-02).
// QUAND. Bande 5 (métro de fer) ; à partir de la bande 7, la même ligne devient un
// monorail (le rendu change, pas le tracé).
// COMMENT. Une ligne qui suit la berge colonne par colonne, lissée (pas d'escalier
// quand la berge saute d'une rangée), sur la longueur où la ville borde ce quai,
// avec une rampe à chaque bout et des stations régulières.
//
// LES BOUTS : LA LIGNE PLONGE SOUS LE QUAI (retour de Raph, 2026-10-04 : les bouches
// de tunnel « font deux gros carrés verts qui ne vont pas et se posent sur la
// route »). La ligne ne finit plus au niveau du sol contre un talus d'herbe : à
// chaque bout elle descend dans une TRÉMIE — une tranchée maçonnée ouverte, sous le
// niveau de la promenade, au fond de laquelle s'ouvre la bouche du tunnel — puis
// remonte sur une RAMPE MAÇONNÉE jusqu'au viaduc. Rien ne dépasse du sol qu'un
// parapet. Ces `ground` cellules « au sol » exigent du terrain LIBRE (ni rue, ni
// bâtiment, ni eau, ni pont) : la ligne est raccourcie jusqu'à en trouver. Elles
// sont tirées DROITES (une tranchée ne suit pas les festons de la berge).

export const METRO = {
  on: true,
  band: 5,          // première bande
  monoBand: 7,      // la ligne devient monorail
  deck: 1.45,       // hauteur du tablier (tuiles)
  ramp: 7,          // longueur d'une rampe (cellules), de la bouche du tunnel au tablier
  pit: 0.62,        // profondeur des rails à la bouche du tunnel (tuiles sous le sol)
  ground: 5,        // cellules « au sol » à chaque bout : trémie puis rampe maçonnée
  smooth: 3,        // demi-fenêtre du lissage (cellules)
  reach: 8,         // la ville « borde » le quai si un bâtiment est à ≤ reach rangées de la berge
  minLen: 24,       // longueur minimale de la ligne (cellules)
  station: 18,      // pas entre deux stations (cellules)
};

// Rive opposée au cœur : +1 si le cœur est au nord du fleuve (rangées plus petites).
export function metroSide(river, core) {
  if (!river || !river.present || typeof river.riverYAt !== 'function' || !core) return 0;
  return core.y < river.riverYAt(core.x) ? 1 : -1;
}

// Rangée de la berge côté `sign` à la colonne x : depuis la ligne d'eau, la première
// cellule qui n'est plus de l'eau (la berge, ou à défaut le premier sol sec).
// null si la colonne n'a pas d'eau.
export function bankRowAt(river, x, sign, N) {
  const y0 = Math.round(river.riverYAt(x));
  if (!river.isWater(x, y0)) return null;
  for (let y = y0; y >= 0 && y < N; y += sign) if (!river.isWater(x, y)) return y;
  return null;
}

// Profil en long : hauteur des rails (tuiles) à `u` cellules du bout le plus proche.
// −pit à la bouche du tunnel, deck sur le viaduc ; raccord en S (pas de cassure).
export function metroZ(u, cfg = METRO) {
  const t = Math.max(0, Math.min(1, u / cfg.ramp));
  if (t >= 1) return cfg.deck;                   // exact : le téléphérique compare au tablier
  return -cfg.pit + (cfg.deck + cfg.pit) * t * t * (3 - 2 * t);
}
// Abscisse (cellules depuis le bout) où le profil atteint la hauteur z (recherche
// par dichotomie ; le profil est monotone sur la rampe).
export function metroUAt(z, cfg = METRO) {
  let a = 0, b = cfg.ramp;
  for (let k = 0; k < 40; k += 1) { const m = (a + b) / 2; if (metroZ(m, cfg) < z) a = m; else b = m; }
  return (a + b) / 2;
}

// LE PLAN. Entrées : river, core ({ x, y } cellules), N, band, built(x, y) = un bâtiment
// tient cette cellule, free(x, y) = la cellule peut recevoir la trémie (facultatif :
// tout est libre). Rend null ou :
//   { sign, x0, x1, pts: [{ x, y, z }] (tuiles, un point par cellule), stations: [x…],
//     mono, ground }
export function planMetro({ river, core, N, band, built, free = null, cfg = METRO }) {
  if (!cfg.on || !(band >= cfg.band)) return null;
  const sign = metroSide(river, core);
  if (!sign) return null;
  // Rangée de berge par colonne, et présence de la ville le long du quai.
  const rows = new Array(N).fill(null), city = new Array(N).fill(false);
  for (let x = 0; x < N; x += 1) {
    const y = bankRowAt(river, x, sign, N);
    rows[x] = y;
    if (y == null) continue;
    for (let d = 1; d <= cfg.reach && !city[x]; d += 1) {
      for (const dx of [-1, 0, 1]) if (built(x + dx, y + sign * d)) { city[x] = true; break; }
    }
  }
  // La plus longue suite de colonnes où la ville borde le quai (trous de 4 tolérés).
  let best = null, a = -1, last = -1;
  for (let x = 0; x <= N; x += 1) {
    const on = x < N && rows[x] != null && city[x];
    if (on) { if (a < 0) a = x; last = x; continue; }
    if (a >= 0 && (x >= N || rows[x] == null || x - last > 4)) {
      if (!best || last - a > best.b - best.a) best = { a, b: last };
      a = -1;
    }
  }
  if (!best || best.b - best.a + 1 < cfg.minLen) return null;
  // Les bouts « au sol » doivent tomber sur du terrain libre : on raccourcit la ligne
  // d'un côté ou de l'autre jusqu'à ce que les deux trémies tiennent.
  let x0 = best.a, x1 = best.b + 1;
  const G = cfg.ground;
  for (let guard = 0; guard < 2 * N; guard += 1) {
    if (x1 - x0 < cfg.minLen) return null;
    const pts = linePts(rows, x0, x1, N, cfg);
    const ok0 = endFree(pts, 0, 1, G, river, free, sign);
    const ok1 = endFree(pts, pts.length - 1, -1, G, river, free, sign);
    if (ok0 && ok1) {
      const stations = [];
      for (let x = x0 + cfg.ramp + Math.floor(cfg.station / 2); x < x1 - cfg.ramp - 2; x += cfg.station) stations.push(x);
      return { sign, x0, x1, pts, stations, mono: band >= cfg.monoBand, ground: G };
    }
    if (!ok0) x0 += 1;
    if (!ok1) x1 -= 1;
  }
  return null;
}

// Ligne : centre de la cellule de berge, lissé par moyenne glissante. Les G
// cellules « au sol » de chaque bout sont tirées DROITES au milieu de la cellule de
// berge du bout (la tranchée tient dans la promenade, sans mordre la rue derrière),
// puis raccordées au tracé lissé sur BLEND cellules.
function linePts(rows, x0, x1, N, cfg) {
  const raw = [];
  for (let x = x0; x <= x1; x += 1) {
    let y = rows[Math.min(x, N - 1)];
    if (y == null) y = raw.length ? raw[raw.length - 1] - 0.5 : rows[x0];
    raw.push(y + 0.5);
  }
  const pts = [];
  const len = x1 - x0;
  for (let i = 0; i < raw.length; i += 1) {
    let s = 0, n = 0;
    for (let k = -cfg.smooth; k <= cfg.smooth; k += 1) { const j = i + k; if (j >= 0 && j < raw.length) { s += raw[j]; n += 1; } }
    pts.push({ x: x0 + i, y: s / n, z: metroZ(Math.min(i, len - i), cfg) });
  }
  const G = Math.min(cfg.ground, Math.floor(pts.length / 2) - 1 - BLEND);
  const n = pts.length;
  const yA = raw[0], yB = raw[n - 2];               // cellules de berge des deux bouts
  for (let i = 0; i <= G + BLEND; i += 1) {
    const w = i <= G ? 0 : (i - G) / (BLEND + 1);
    pts[i].y = yA * (1 - w) + pts[i].y * w;
    pts[n - 1 - i].y = yB * (1 - w) + pts[n - 1 - i].y * w;
  }
  return pts;
}

const BLEND = 3;
// Les G cellules au sol d'un bout (indice i0, sens step) : les rangées que la
// tranchée couvre (±0,42 tuile autour de la ligne, décalée de 0,06 vers les terres
// comme au rendu — LINE_SHIFT d'isoMetro) sont libres et sèches.
function endFree(pts, i0, step, G, river, free, sign) {
  for (let k = 0; k < G; k += 1) {
    const q = pts[i0 + step * k];
    if (!q) return false;
    // Un point de la ligne est au BORD OUEST de sa colonne : la cellule du tronçon
    // qui part vers l'intérieur est la sienne (bout ouest) ou celle d'avant (bout est).
    const cx = step > 0 ? q.x : q.x - 1;
    for (const dy of [-0.42, 0, 0.42]) {
      const cy = Math.floor(q.y + sign * 0.06 + dy);
      if (river.isWater(cx, cy)) return false;
      if (free && !free(cx, cy)) return false;
    }
  }
  return true;
}
