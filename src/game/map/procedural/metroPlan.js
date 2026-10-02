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

export const METRO = {
  on: true,
  band: 5,          // première bande
  monoBand: 7,      // la ligne devient monorail
  deck: 1.45,       // hauteur du tablier (tuiles)
  ramp: 6,          // longueur d'une rampe (cellules)
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

// LE PLAN. Entrées : river, core ({ x, y } cellules), N, band, built(x, y) = un bâtiment
// tient cette cellule. Rend null ou :
//   { sign, x0, x1, pts: [{ x, y, z }] (tuiles, un point par cellule), stations: [x…], mono }
export function planMetro({ river, core, N, band, built, cfg = METRO }) {
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
  const x0 = best.a, x1 = best.b + 1;
  // Ligne : centre de la cellule de berge, lissé par moyenne glissante.
  const raw = [];
  for (let x = x0; x <= x1; x += 1) {
    let y = rows[Math.min(x, N - 1)];
    if (y == null) y = raw.length ? raw[raw.length - 1] - 0.5 : rows[x0];
    raw.push(y + 0.5);
  }
  const pts = [];
  for (let i = 0; i < raw.length; i += 1) {
    let s = 0, n = 0;
    for (let k = -cfg.smooth; k <= cfg.smooth; k += 1) { const j = i + k; if (j >= 0 && j < raw.length) { s += raw[j]; n += 1; } }
    const x = x0 + i, len = x1 - x0;
    const u = Math.min(i, len - i);
    const t = Math.min(1, u / cfg.ramp), z = cfg.deck * t * t * (3 - 2 * t);
    pts.push({ x, y: s / n, z });
  }
  const stations = [];
  for (let x = x0 + cfg.ramp + Math.floor(cfg.station / 2); x < x1 - cfg.ramp - 2; x += cfg.station) stations.push(x);
  return { sign, x0, x1, pts, stations, mono: band >= cfg.monoBand };
}
