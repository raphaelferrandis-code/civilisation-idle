"use strict";
// ── L'AUTOROUTE DE L'ARTÈRE — le plan (lot 2 de docs/PLAN-ETAGES.md) ─────────
//
// PUR : aucun import, aucun Canvas. Le layout l'appelle (réserve du terrain de
// l'échangeur, figée dans s.cityCore) ; le rendu (iso/isoHighway.js) dessine ce
// qu'il publie ; les gardes le testent sans DOM.
//
// LE TRACÉ. L'autoroute suit l'ARTÈRE du pont (colonnes ax et ax+1, le boulevard à
// deux voies de la percée), sur chaque rive : au SOL près du fleuve — au-delà de
// la place centrale côté cœur (règle de la planche : une structure haute ne passe
// jamais devant la place centrale), au-delà du quai de l'autre côté (le métro y
// passera) — puis une rampe, un tablier à DECK tuiles, et une redescente avant la
// lisière. Le tablier couvre la chaussée de l'artère : aucun terrain à réserver
// sous lui, ses piles tombent sur le terre-plein central.
//
// L'ÉCHANGEUR (« trèfle partiel ») : au croisement avec une rue transversale, sur
// la rive au plus long tablier, deux BOUCLES de 270° sur les quadrants côté
// lisière — la voie qui descend vers la lisière sort après le croisement, tourne
// et rejoint la rue transversale au sol. Les boucles demandent deux pelouses de
// LAWN×LAWN cases, réservées par le layout (jamais bâties ; un bâtiment qui y
// tenait sa place est relogé, une fois — comme la percée de l'artère).
//
// Repères : cellules entières ; monde = cellule × T. La ligne médiane du tablier
// est la frontière x = ax + 1 entre les deux voies de l'artère.

export const HIGHWAY = {
  on: true,
  band: 6,          // première bande où l'autoroute existe
  deck: 1.75,       // hauteur du tablier, en tuiles (dessus de la chaussée)
  ramp: 8,          // longueur d'une rampe, en cellules
  coreGap: 3,       // côté cœur : cellules libres après la place centrale avant la rampe
  farStart: 6,      // autre rive : cellules au sol depuis l'eau (le quai, le métro)
  endMargin: 4,     // cellules au sol avant le bout de l'artère
  minDeck: 6,       // longueur minimale du tablier plein, en cellules
  minRamp: 5,       // rampe la plus courte (rive courte : un « saut-de-mouton »)
  loopR: 1.7,       // rayon d'une boucle d'échangeur, en tuiles
  lawn: 4,          // côté d'une pelouse de boucle, en cellules
  icReach: 4,       // la rue transversale arrive à au plus N cellules de l'artère, de chaque côté
};

const key = (x, y) => x + "," + y;

// Les deux rives de l'artère : premières cellules sèches de la colonne ax au nord
// et au sud de l'eau, et la suite de cellules d'artère vers l'extérieur.
// `isWet(x, y)` : eau ou berge. `isRoad(x, y)` : chaussée. `inCity(x, y)` : dans
// la ville (l'artère continue au-delà dans la campagne, l'autoroute non). Rend
// [{ sign, y0, len }] — y0 = première rangée sèche, sign = sens de l'extérieur,
// len = cellules d'artère jusqu'à la lisière.
export function arteryBanks({ N, ax, isWet, isRoad, inCity = () => true }) {
  let top = -1, bottom = -1;
  for (let y = 0; y < N; y += 1) if (isWet(ax, y)) { if (top < 0) top = y; bottom = y; }
  if (top < 0) return [];
  const banks = [];
  for (const [sign, y0] of [[-1, top - 1], [1, bottom + 1]]) {
    let len = 0, lastIn = -1;
    for (let y = y0; y >= 0 && y < N; y += sign) {
      if (isWet(ax, y)) break;
      if (!isRoad(ax, y) && !isRoad(ax + 1, y)) break;
      if (inCity(ax, y) || inCity(ax + 1, y)) lastIn = len;
      else if (len - lastIn > 5) break;              // cinq rangées hors ville : la lisière
      len += 1;
    }
    len = Math.min(len, lastIn + 1);
    if (len > 0) banks.push({ sign, y0, len });
  }
  return banks;
}

// Profil d'une rive : où commence la rampe (s0), où commence la redescente (s1),
// et la longueur des rampes (ramp), en cellules depuis y0. Une rive courte raccourcit
// ses rampes (jusqu'à minRamp) avant de renoncer. null si même ainsi le tablier
// plein serait trop court.
// `coreRows` : rangées de la place centrale si elle est sur cette rive (sinon []).
export function bankProfile(bank, coreRows, cfg = HIGHWAY) {
  let s0 = cfg.farStart;
  for (const y of coreRows) {
    const s = (y - bank.y0) * bank.sign;
    if (s >= 0 && s < bank.len) s0 = Math.max(s0, s + 1 + cfg.coreGap);
  }
  const avail = bank.len - cfg.endMargin - s0;          // rampe + plein + rampe
  const ramp = Math.min(cfg.ramp, Math.floor((avail - cfg.minDeck) / 2));
  if (ramp < cfg.minRamp) return null;
  return { s0, s1: bank.len - cfg.endMargin - ramp, ramp };
}

// Hauteur du tablier (tuiles) à la distance s (cellules, fractionnaire) le long de la
// rive : 0 avant s0, rampe lissée, plein, redescente lissée, 0 après s1 + ramp.
export function deckZAt(s, prof, cfg = HIGHWAY) {
  const sm = (t) => t * t * (3 - 2 * t);
  const R = prof.ramp || cfg.ramp;
  if (s <= prof.s0 || s >= prof.s1 + R) return 0;
  if (s < prof.s0 + R) return cfg.deck * sm((s - prof.s0) / R);
  if (s > prof.s1) return cfg.deck * sm(1 - (s - prof.s1) / R);
  return cfg.deck;
}

// Pelouses d'un échangeur au croisement de la rangée yc, sur la rive `sign` : deux
// carrés LAWN×LAWN côté LISIÈRE, collés au tablier (x < ax et x > ax+1), séparés
// de la rue transversale par rien (la boucle la rejoint par son sommet).
export function interchangeLawns(ax, yc, sign, cfg = HIGHWAY) {
  const n = cfg.lawn, cells = [];
  for (let i = 1; i <= n; i += 1) {
    const y = yc + sign * i;
    for (let j = 1; j <= n; j += 1) { cells.push([ax - j, y]); cells.push([ax + 1 + j, y]); }
  }
  return cells;
}

// La rue transversale de la rangée yc : première cellule de chaussée à l'ouest
// (x < ax) et à l'est (x > ax+1), à au plus icReach cellules. Rend les cellules à
// PAVER pour la raccorder à l'artère (le trou entre les deux), ou null si elle
// n'arrive pas des deux côtés. Les maisons bordent l'artère : la rue s'arrête
// souvent une ou deux cases avant elle.
export function crossGaps(ax, yc, isRoad, cfg = HIGHWAY) {
  let dW = 0, dE = 0;
  for (let d = 1; d <= cfg.icReach; d += 1) if (isRoad(ax - d, yc)) { dW = d; break; }
  for (let d = 1; d <= cfg.icReach; d += 1) if (isRoad(ax + 1 + d, yc)) { dE = d; break; }
  if (!dW || !dE) return null;
  const gaps = [];
  for (let d = 1; d < dW; d += 1) gaps.push([ax - d, yc]);
  for (let d = 1; d < dE; d += 1) gaps.push([ax + 1 + d, yc]);
  return gaps;
}

// Choix du croisement : une rangée du tablier PLEIN où une rue transversale arrive
// des deux côtés de l'artère, dont les pelouses et le raccord ne touchent ni eau, ni
// site de place, ni merveille (`hard`), en minimisant les bâtiments à reloger
// (`held`) puis l'écart au milieu du tablier. Rend { sign, yc, gaps } ou null.
export function pickInterchange({ ax, bank, prof, isRoad, hard, held, cfg = HIGHWAY }) {
  const lo = prof.s0 + (prof.ramp || cfg.ramp) + 3, hi = prof.s1 - 3 - cfg.lawn;
  if (hi < lo) return null;
  const mid = (lo + hi) / 2;
  let best = null, bestScore = Infinity;
  for (let s = lo; s <= hi; s += 1) {
    const yc = bank.y0 + bank.sign * s;
    const gaps = crossGaps(ax, yc, isRoad, cfg);
    if (!gaps) continue;
    let ok = true, nHeld = 0;
    for (const [x, y] of [...interchangeLawns(ax, yc, bank.sign, cfg), ...gaps]) {
      if (hard(x, y)) { ok = false; break; }
      if (held(x, y)) nHeld += 1;
    }
    if (!ok) continue;
    const score = nHeld * 10 + Math.abs(s - mid);
    if (score < bestScore) { bestScore = score; best = { sign: bank.sign, yc, gaps }; }
  }
  return best;
}

// LE PLAN COMPLET. Entrées (cellules) :
//   N, ax                — grille, colonne ouest de l'artère
//   cx, cy               — centre de grille (repère des choix figés)
//   band                 — bande d'ère
//   isWet, isRoad        — eau/berge, chaussée
//   inCity               — dans la ville (le tablier redescend à la lisière)
//   coreRows             — rangées de la place centrale (sa rive est déduite)
//   hard, held           — prédicats de la réserve (cf. pickInterchange)
//   fix                  — { sign, dy } figé d'un calcul précédent, ou null
// Rend null (pas d'autoroute) ou :
//   { ax, deck, banks: [{ sign, y0, len, s0, s1, ramp }], interchange: { sign, yc } | null,
//     lawn: ['x,y', …], pave: ['x,y', …] }   (pave = raccord de la rue transversale)
export function planHighway({ N, ax, cx, cy, band, isWet, isRoad, inCity, coreRows = [], hard = () => false, held = () => false, fix = null, cfg = HIGHWAY }) {
  if (!cfg.on || !(band >= cfg.band) || ax == null) return null;
  const banks = [];
  for (const b of arteryBanks({ N, ax, isWet, isRoad, inCity })) {
    const mine = coreRows.filter((y) => (y - b.y0) * b.sign >= 0 && (y - b.y0) * b.sign < b.len);
    const prof = bankProfile(b, mine, cfg);
    if (prof) banks.push({ ...b, ...prof });
  }
  if (!banks.length) return null;
  // Échangeur : le choix figé s'il tient encore, sinon la rive au plus long tablier.
  let ic = null;
  if (fix && Number.isFinite(fix.dy) && (fix.sign === 1 || fix.sign === -1)) {
    const b = banks.find((q) => q.sign === fix.sign);
    const yc = cy + fix.dy;
    if (b) {
      const s = (yc - b.y0) * b.sign;
      const gaps = crossGaps(ax, yc, isRoad, cfg) || [];
      const lawnOk = [...interchangeLawns(ax, yc, b.sign, cfg), ...gaps].every(([x, y]) => !hard(x, y));
      if (s >= b.s0 + b.ramp && s <= b.s1 - cfg.lawn && lawnOk) ic = { sign: b.sign, yc, gaps };
    }
  }
  if (!ic) {
    const order = banks.slice().sort((p, q) => (q.s1 - q.s0) - (p.s1 - p.s0));
    for (const b of order) {
      ic = pickInterchange({ ax, bank: b, prof: b, isRoad, hard, held, cfg });
      if (ic) break;
    }
  }
  const lawn = ic ? interchangeLawns(ax, ic.yc, ic.sign, cfg).map(([x, y]) => key(x, y)) : [];
  const pave = ic ? ic.gaps.map(([x, y]) => key(x, y)) : [];
  void cx;
  return { ax, deck: cfg.deck, banks, interchange: ic ? { sign: ic.sign, yc: ic.yc } : null, lawn, pave };
}

// LE DÉGAGEMENT : une case de chaque côté de l'artère, sur toutes les rangées où le
// tablier est en l'air (retour Raph, 2026-10-02 : « des bâtiments passent dans
// l'autoroute » — les maisons qui bordaient l'artère se collaient au tablier). Le
// layout en fait une pelouse jamais bâtie. Rend ['x,y', …] (cellules, sans doublon).
export function vergeCells(H, cfg = HIGHWAY) {
  if (!H) return [];
  const out = new Set();
  for (const b of H.banks) {
    for (let s = 0; s < b.len; s += 1) {
      const z = Math.max(deckZAt(s, b, cfg), deckZAt(s + 0.5, b, cfg), deckZAt(s + 1, b, cfg));
      if (z < 0.35) continue;
      const y = b.y0 + b.sign * s;
      out.add(key(H.ax - 1, y));
      out.add(key(H.ax + 2, y));
    }
  }
  return [...out];
}

// ── GÉOMÉTRIE DES RUBANS (tuiles) ─────────────────────────────────────────────
// Partagée par le rendu et les gardes. Un ruban = { id, pts: [{ x, y, z }], w,
// lanes: [décalages latéraux], main }. x, y en TUILES, z en tuiles.

// Le tablier d'une rive : de s0 à s1 + ramp, un point par demi-cellule.
export function bankRibbon(H, b, cfg = HIGHWAY) {
  const pts = [];
  const xm = H.ax + 1;
  for (let s = b.s0; s <= b.s1 + (b.ramp || cfg.ramp) + 1e-9; s += 0.5) {
    const y = b.y0 + b.sign * s + 0.5;
    pts.push({ x: xm, y, z: deckZAt(s, b, cfg) });
  }
  // sens du ruban : toujours vers +y (convention du peintre : la normale gauche
  // d'un tronçon est (−dy, dx) ; les deux sens sont dessinés pareil)
  if (b.sign < 0) pts.reverse();
  return { id: 'bank' + b.sign, pts, w: 1.9, lanes: [-0.72, -0.26, 0.26, 0.72], main: true };
}

// Les deux boucles de l'échangeur. Pour la rive +1 (lisière vers +y) : la boucle
// ouest quitte le bord ouest du tablier (x = ax) au point « est » de son cercle,
// tourne de 270° par l'ouest et le sud… jusqu'au point « nord », posé SUR la rue
// transversale (y = yc + 0,5), au sol. La boucle est symétrique. Rive −1 : miroir
// en y autour de la rue.
export function loopRibbons(H, cfg = HIGHWAY) {
  const ic = H.interchange;
  if (!ic) return [];
  const R = cfg.loopR, Z = H.deck, n = 30;
  const ax = H.ax, yc = ic.yc, sign = ic.sign;
  const ystreet = yc + 0.5;
  const out = [];
  for (const side of [-1, 1]) {
    // bord du tablier côté boucle, et centre du cercle
    const edge = side < 0 ? ax + 0.02 : ax + 2 - 0.02;
    const cxl = edge + side * (R + 0.12);
    const cyl = ystreet + sign * R;
    const pts = [];
    // départ sur le tablier, un peu avant le point de sortie (raccord droit)
    const a0 = side < 0 ? 0 : Math.PI;                    // point « est » (ouest pour la boucle est)
    const sx = cxl + R * Math.cos(a0), sy = cyl;
    pts.push({ x: sx - side * 0.25, y: sy - sign * 1.2, z: Z });
    // 270° : la boucle tourne en s'éloignant du tablier puis revient sur la rue
    const turn = -side * sign;                             // sens de rotation (repère y vers le bas)
    for (let i = 0; i <= n; i += 1) {
      const u = i / n;
      const a = a0 + turn * u * 1.5 * Math.PI;
      const zz = Z * (1 - u * u * (3 - 2 * u));
      pts.push({ x: cxl + R * Math.cos(a), y: cyl + R * Math.sin(a), z: zz });
    }
    // arrivée : un bout de rue au sol, vers l'extérieur
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + side * 0.9, y: last.y, z: 0 });
    out.push({ id: 'loop' + side, pts, w: 0.85, lanes: [0], main: false });
  }
  return out;
}
