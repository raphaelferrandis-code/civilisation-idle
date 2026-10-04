"use strict";
// ── LES GENS DE LA PLACE ─────────────────────────────────────────────────────
//
// Raph (2026-10-04, capture du marché antique, la nuit) : « sur les places c'est bien
// d'avoir des habitants qui se posent tranquille mais là ça fait secte ^^ — qu'ils se
// baladent sur la place, se posent pour parler puis repartent, pas juste se tenir en
// cercle ». Les passants des kits de place étaient des figurants FIGÉS : un ou deux
// devant chaque étal, tournés vers lui — vus d'en haut, un anneau parfait autour du
// puits. Autour de la fontaine, pareil : des groupes réguliers sur un cercle.
//
// Des FLÂNEURS f(now), sans état (même règle que les promeneurs des quais,
// isoQuayWalk.js) : deux captures du même instant donnent les mêmes poses, et rien ne
// dérive quand l'onglet dort.
//
// LE TEMPS EN CRÉNEAUX. Une horloge commune à la place découpe le temps en créneaux de
// S secondes ; chaque flâneur a son DÉCALAGE (o ∈ [0 ; 0,85 S[), son créneau k court de
// kS + o à (k+1)S + o. Au début de son créneau il quitte son poste, marche jusqu'au
// suivant — chemin calculé AUTOUR du mobilier, parfois par un détour — et y reste
// jusqu'au créneau d'après. Au poste il regarde un étal, admire la pièce maîtresse, fait
// une halte, ou CAUSE à deux ou trois : chacun arrive de son côté, attend l'autre, et
// repart à son heure. Ou bien il fait un TOUR de place sans s'arrêter de tout le
// créneau. Parfois il QUITTE la place (il s'efface sur la rue) ; plus tard quelqu'un
// d'autre en arrive, un autre visage. On ne s'arrête qu'au CŒUR de la place ; la bande
// du bord (derrière les étals, le long des bancs) ne sert qu'à passer vers les rues.
//
// ⚠ PERSONNE L'UN SUR L'AUTRE, ET TOUJOURS SANS ÉTAT. Comme o < S, à un instant donné
// seuls deux créneaux coexistent (m − 1 et m). Les postes sont donc partagés en deux
// PARITÉS qui ne se touchent jamais (les quadrants opposés autour du centre), et le
// créneau k ne pioche que dans la parité k & 1 ; au sein d'un créneau, l'attribution
// est conjointe (liste des postes pris). Ce qui reste — deux marcheurs qui se
// croisent — passe : les chemins contournent les gens arrêtés.
//
// Le module est PUR : la place lui donne sa boîte, deux tests — où l'on MARCHE (la base
// au sol du mobilier) et où l'on S'ARRÊTE (son empreinte écran) — et une fonction
// d'identité ; il rend des fiches de passant ({ wx, wy, d, dir, walking, alpha… }) que
// isoPlaza dessine. Banc : iso/__tests__/plazaFolk.test.js.
import { cmHash } from '../layout.js';

// Molette : __plazaFolk({ on, slot, speed, leaveP, viaP, density }).
//   on: false → le temps de la place s'arrête (poses figées, pour une capture A/B).
export const FOLK = {
  on: true,
  slot: 30,        // s : un créneau = une marche + une halte
  speed: 0.27,     // cellules / s : l'allure d'un flâneur (un passant des rues : ~0,34)
  leaveP: 0.1,     // part de ceux qui quittent la place à chaque créneau
  viaP: 0.4,       // part des marches qui passent par un détour
  density: 1,      // × le nombre de flâneurs du kit
};
let _rev = 0;      // bumpé par la molette : les places se recomposent (le nombre en dépend)
export const folkRev = () => _rev;
if (typeof window !== 'undefined') {
  window.__plazaFolk = (o) => { if (o) { Object.assign(FOLK, o); _rev += 1; } return { ...FOLK }; };
}

const G = 0.25;          // pas de la grille de marche (cellules)
const DMIN = 0.34;       // deux personnes arrêtées jamais plus près (cellules)
const DSOLO = 0.4;       // … et deux inconnus arrêtés au même créneau (deux devant un étal : 0,42)
const BLOCK_R = 0.22;    // rayon autour d'une personne arrêtée que les marcheurs évitent
const FADE = 0.6;        // cellules de fondu à l'arrivée sur la place et au départ
const OFF_SPAN = 0.85;   // décalages ∈ [0 ; 0,85 S[ — < 1 : deux créneaux coexistent au plus
const PAIR_SPAN = 0.35;  // écart de décalage max entre deux qui se retrouvent (part de S)
const WALK_MAX = 0.55;   // une marche tient dans 55 % du créneau
const FORCE_AWAY = 40;   // chacun rentre au moins une fois tous les 40 créneaux (~20 min)

// Ce que fait celui qui ne cause pas. `chat` = part de ceux qui LANCENT une causette
// (chacun en entraîne un ou deux autres : ~40 % de la place finit par causer).
// `stroll` : faire un TOUR de place sans s'arrêter de tout le créneau.
const MIX = {
  stalls: { chat: 0.24, stall: 0.5, look: 0.08, pause: 0.2, stroll: 0.22 },
  centre: { chat: 0.3, stall: 0, look: 0.4, pause: 0.35, stroll: 0.25 },
};

// ⚠ BRASSÉ (fmix) : cmHash de graines voisines sort des valeurs voisines.
const fmix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
const h01 = (s) => fmix(cmHash(s) >>> 0) / 4294967296;
// Direction de dessin (0 : +x, 1 : −x, 2 : +y, 3 : −y), la convention des habitants.
const face = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 1) : (dy >= 0 ? 2 : 3));
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
// À L'ÉCRAN, en iso : x − y donne l'abscisse (une demi-tuile par cellule), x + y la
// profondeur (un quart de tuile par cellule). Deux personnes arrêtées doivent SE VOIR :
// côte à côte (assez d'écart en abscisse), ou franchement l'une derrière l'autre —
// à 0,4 cellule pile dans la profondeur, celle de devant cachait l'autre jusqu'aux
// épaules (un « totem » à la première capture).
const seen = (a, b) => Math.abs((a.x - b.x) - (a.y - b.y)) >= 0.3 || Math.abs((a.x - b.x) + (a.y - b.y)) >= 0.6;
// Une causette se lit DE CÔTÉ : plus d'écart en abscisse qu'en profondeur.
const sideBySide = (a, b) => Math.abs((a.x - b.x) - (a.y - b.y)) >= Math.max(0.3, 0.75 * Math.abs((a.x - b.x) + (a.y - b.y)));

// ── LA GRILLE DE MARCHE ──────────────────────────────────────────────────────
// Un nœud tous les G de cellule ; marchable = sur la place ET un passant y tient sans
// toucher le mobilier. Une seule composante compte : celle du CŒUR de la place (le
// premier nœud libre autour du centre). Une poche derrière un étal n'est pas un
// endroit où l'on va — et au square, la rangée bancs-bacs-massifs fait un mur
// continu : la plus GRANDE composante y était l'anneau de pelouse le long de la
// grille, la vie était dehors et la fontaine seule au milieu.
const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function eachNb(g, c, blk, fn) {
  const i = c % g.nx, j = (c / g.nx) | 0;
  const pass = (ii, jj) => ii >= 0 && jj >= 0 && ii < g.nx && jj < g.ny
    && g.ok[jj * g.nx + ii] === 1 && !(blk && blk[jj * g.nx + ii]);
  for (const [di, dj] of NB8) {
    const ii = i + di, jj = j + dj;
    if (!pass(ii, jj)) continue;
    if (di && dj && (!pass(i + di, j) || !pass(i, j + dj))) continue;   // pas de coin coupé
    fn(jj * g.nx + ii);
  }
}
function makeGrid(o) {
  const { gx0, gy0, gx1, gy1 } = o.box;
  const nx = Math.round((gx1 - gx0 + 1) / G), ny = Math.round((gy1 - gy0 + 1) / G);
  const N = nx * ny, ok = new Uint8Array(N);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const x = gx0 + (i + 0.5) * G, y = gy0 + (j + 0.5) * G;
      if (o.inPlaza(Math.floor(x), Math.floor(y)) && o.free(x, y)) ok[j * nx + i] = 1;
    }
  }
  // `at` : le test EXACT d'un point (la ligne de vue le pose à chaque échantillon —
  // le nœud seul laisserait couper le coin d'un étal entre deux centres libres).
  const at = (x, y) => o.inPlaza(Math.floor(x), Math.floor(y)) && o.free(x, y);
  const g = { nx, ny, x0: gx0, y0: gy0, ok, at };
  const comp = new Int32Array(N).fill(-1), q = new Int32Array(N), size = [];
  let id = 0;
  for (let s = 0; s < N; s += 1) {
    if (!ok[s] || comp[s] >= 0) continue;
    let h = 0, t = 0;
    q[t++] = s; comp[s] = id;
    while (h < t) eachNb(g, q[h++], null, (nb) => { if (comp[nb] < 0) { comp[nb] = id; q[t++] = nb; } });
    size.push(t);
    id += 1;
  }
  // Le cœur : la composante (assez grande) du nœud libre le plus proche du centre ;
  // à défaut, la plus grande.
  let best = -1, bd = Infinity;
  for (let s = 0; s < N; s += 1) {
    if (comp[s] < 0 || size[comp[s]] < 12) continue;
    const [x, y] = ctr(g, s), d = dist(x, y, o.cx, o.cy);
    if (d < bd) { bd = d; best = comp[s]; }
  }
  if (best < 0) return null;
  for (let s = 0; s < N; s += 1) ok[s] = comp[s] === best ? 1 : 0;
  return g;
}
const nodeAt = (g, x, y) => {
  const i = Math.floor((x - g.x0) / G), j = Math.floor((y - g.y0) / G);
  return (i < 0 || j < 0 || i >= g.nx || j >= g.ny) ? -1 : j * g.nx + i;
};
const ctr = (g, c) => [g.x0 + ((c % g.nx) + 0.5) * G, g.y0 + (((c / g.nx) | 0) + 0.5) * G];
// Ligne de vue : échantillonnée au pas de 0,4 G — le nœud doit être dans la zone de
// marche, et le point lui-même libre. Hors de la boîte = la rue, libre.
function los(g, ax, ay, bx, by, blk) {
  const n = Math.ceil(dist(ax, ay, bx, by) / (G * 0.4));
  for (let s = 1; s < n; s += 1) {
    const x = ax + (bx - ax) * s / n, y = ay + (by - ay) * s / n;
    const c = nodeAt(g, x, y);
    if (c < 0) continue;
    if (g.ok[c] !== 1 || (blk && blk[c]) || !g.at(x, y)) return false;
  }
  return true;
}
function nearest(g, x, y, blk, rMax = 4) {
  const c0 = nodeAt(g, x, y);
  if (c0 >= 0 && g.ok[c0] === 1 && !(blk && blk[c0])) return c0;
  const i0 = Math.floor((x - g.x0) / G), j0 = Math.floor((y - g.y0) / G);
  let best = -1, bd = Infinity;
  for (let r = 1; r <= rMax && best < 0; r += 1) {
    for (let dj = -r; dj <= r; dj += 1) {
      for (let di = -r; di <= r; di += 1) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
        const c = j * g.nx + i;
        if (g.ok[c] !== 1 || (blk && blk[c])) continue;
        const [cx, cy] = ctr(g, c), d = dist(x, y, cx, cy);
        if (d < bd) { bd = d; best = c; }
      }
    }
  }
  return best;
}
function bfs(g, a, b, blk) {
  const N = g.nx * g.ny, prev = new Int32Array(N).fill(-2), q = new Int32Array(N);
  let h = 0, t = 0;
  q[t++] = a; prev[a] = -1;
  while (h < t) {
    const c = q[h++];
    if (c === b) break;
    eachNb(g, c, blk, (nb) => { if (prev[nb] === -2) { prev[nb] = c; q[t++] = nb; } });
  }
  if (prev[b] === -2) return null;
  const out = [];
  for (let c = b; c !== -1; c = prev[c]) out.push(c);
  return out.reverse();
}
// Chemin de (ax, ay) à (bx, by) : ligne droite si elle passe, sinon la grille puis la
// « ficelle tirée » (on saute à chaque fois au nœud le plus loin qu'on voit).
function route(g, ax, ay, bx, by, blk) {
  if (los(g, ax, ay, bx, by, blk)) return [[ax, ay], [bx, by]];
  const na = nearest(g, ax, ay, blk), nb = nearest(g, bx, by, blk);
  if (na < 0 || nb < 0) return null;
  const nodes = bfs(g, na, nb, blk);
  if (!nodes) return null;
  const raw = [[ax, ay]];
  for (const c of nodes) raw.push(ctr(g, c));
  raw.push([bx, by]);
  const out = [raw[0]];
  for (let i = 0; i < raw.length - 1;) {
    let j = raw.length - 1;
    while (j > i + 1 && !los(g, raw[i][0], raw[i][1], raw[j][0], raw[j][1], blk)) j -= 1;
    out.push(raw[j]);
    i = j;
  }
  return out;
}

// ── LES POSTES ───────────────────────────────────────────────────────────────
// Où l'on s'arrête : devant un étal, au bord de la pièce maîtresse, aux haltes du
// cœur de la place. Les SITES de causette sont des paires ou des trios de postes
// voisins, face à face. Chaque poste a une PARITÉ, et deux postes de parité
// différente ne sont jamais à moins de DMIN — l'invariant qui rend l'état inutile.
// La parité est celle du QUADRANT autour du centre (les deux quadrants opposés vont
// ensemble), et une bande de DMIN le long des deux axes reste sans poste : ces axes
// traversent la pièce maîtresse, on n'y perd presque rien. Deux essais l'ont précédé
// et perdaient la moitié de la place libre d'un petit marché (aucune causette sur un
// 4×4) : un damier d'une cellule (autant de frontières que de cases) et une parité
// tirée au fil de la pose (l'anneau du puits tombait tout entier d'un côté).
const SAME_GAP = 0.3;    // deux postes de même parité : pas plus serrés (doublons)
const FINE = 0.18;       // pas des candidats aux haltes (cellules)
export function buildFolk(o) {
  const g = makeGrid(o);
  if (!g) return null;
  const sd = o.sd;
  // On S'ARRÊTE là : hors de l'empreinte écran du mobilier (personne ne reste planté
  // dans un étal ni caché derrière), et la composante du cœur à un nœud près.
  const stand = o.stand || o.free;
  const standOk = (x, y) => o.inPlaza(Math.floor(x), Math.floor(y)) && o.free(x, y) && stand(x, y)
    && nearest(g, x, y, null, 1) >= 0;
  const posts = [{ stall: [], look: [], pause: [] }, { stall: [], look: [], pause: [] }];
  const all = [[], []];
  const near = (list, x, y, d) => list.some((p) => dist(p.x, p.y, x, y) < d);
  const parityFor = (x, y) => {
    const dx = x - o.cx, dy = y - o.cy;
    if (Math.abs(dx) < DMIN / 2 + 0.01 || Math.abs(dy) < DMIN / 2 + 0.01) return -1;
    const par = (dx > 0) !== (dy > 0) ? 1 : 0;
    return near(all[par], x, y, SAME_GAP) || near(all[1 - par], x, y, DMIN) ? -1 : par;
  };
  const put = (kind, p) => {
    if (!standOk(p.x, p.y)) return;
    const par = parityFor(p.x, p.y);
    if (par < 0) return;
    p.kind = kind;
    posts[par][kind].push(p);
    all[par].push(p);
  };

  // 1. Devant les étals, côté centre — l'ancien placement, qui devient un POSTE (deux
  //    par étal : deux acheteurs côte à côte au même créneau).
  for (let k = 0; k < (o.stalls || []).length; k += 1) {
    const s = o.stalls[k];
    const vx = o.cx - s.x, vy = o.cy - s.y, vl = Math.hypot(vx, vy) || 1;
    const nx = vx / vl, ny = vy / vl;
    for (let j = 0; j < 2; j += 1) {
      const lat = (j - 0.5) * 0.42;
      const x = s.x + nx * 0.78 - ny * lat, y = s.y + ny * 0.78 + nx * lat;
      put('stall', { x, y, dir: face(s.x - x, s.y - y) });
    }
  }
  // 2. Au bord de la pièce maîtresse : on part du centre et on marche jusqu'au premier
  //    point libre, dans 24 directions — l'anneau épouse l'empreinte (un bassin large
  //    et plat n'a pas le bord d'un puits).
  if (o.centre) {
    const rot = h01(sd + ':fr') * Math.PI * 2;
    for (let a = 0; a < 24; a += 1) {
      const ang = rot + (a / 24) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
      let r = 0.25;
      while (r < 3 && !stand(o.centre.x + ca * r, o.centre.y + sa * r)) r += 0.05;
      if (r >= 3) continue;
      r += 0.1;
      const x = o.centre.x + ca * r, y = o.centre.y + sa * r;
      put('look', { x, y, dir: face(o.centre.x - x, o.centre.y - y) });
    }
  }
  // 3. Les haltes, AU CŒUR de la place : la bande du bord (derrière les étals, le long
  //    des bancs) est un passage vers les rues, pas un endroit où l'on reste — à la
  //    première capture, la moitié du marché causait dans le dos des marchands.
  const W = o.box.gx1 - o.box.gx0 + 1, H = o.box.gy1 - o.box.gy0 + 1;
  const K = Math.max(0, Math.min(0.9, Math.min(W, H) / 2 - 0.6));
  const cand = [];
  for (let y = o.box.gy0 + K; y <= o.box.gy1 + 1 - K + 1e-9; y += FINE) {
    for (let x = o.box.gx0 + K; x <= o.box.gx1 + 1 - K + 1e-9; x += FINE) {
      cand.push([x, y, h01(sd + ':fq:' + x.toFixed(2) + ':' + y.toFixed(2))]);
    }
  }
  cand.sort((a, b) => a[2] - b[2]);
  for (const [x, y, r] of cand) put('pause', { x, y, dir: Math.floor(r * 1e4) % 4 });
  // 4. Les causettes : deux ou trois postes de même parité, assez proches pour se
  //    parler (et pas l'un dans l'autre), tournés l'un vers l'autre — devant un étal
  //    aussi (deux clients qui se reconnaissent) : sur un marché de 4×4, le cœur
  //    libre est si petit qu'on n'y causait presque jamais.
  const sites = [[], []];
  const talk = (a, b) => { const d = dist(a.x, a.y, b.x, b.y); return d >= DMIN && d <= 0.58; };
  for (const par of [0, 1]) {
    const L = [...posts[par].look, ...posts[par].pause, ...posts[par].stall];
    for (let i = 0; i < L.length; i += 1) {
      for (let j = i + 1; j < L.length; j += 1) {
        const a = L[i], b = L[j];
        if (!talk(a, b) || !seen(a, b)) continue;
        if (sideBySide(a, b)) {
          sites[par].push({ size: 2, pts: [
            { x: a.x, y: a.y, dir: face(b.x - a.x, b.y - a.y) },
            { x: b.x, y: b.y, dir: face(a.x - b.x, a.y - b.y) },
          ] });
        }
        for (let m = j + 1; m < L.length; m += 1) {
          const c = L[m];
          if (!talk(a, c) || !talk(b, c) || !seen(a, c) || !seen(b, c)) continue;
          const mx = (a.x + b.x + c.x) / 3, my = (a.y + b.y + c.y) / 3;
          sites[par].push({ size: 3, pts: [a, b, c].map((p) => ({ x: p.x, y: p.y, dir: face(mx - p.x, my - p.y) })) });
        }
      }
    }
  }
  // 5. Les sorties : là où une rue aborde la place (les entrées du square aussi — la
  //    grille y laisse sa porte). Gardées si l'on y arrive depuis la place.
  const exits = [];
  for (const e of o.exits || []) {
    const c = nearest(g, e.ax, e.ay, null, 1);
    if (c < 0) continue;
    const [nx0, ny0] = ctr(g, c);
    if (los(g, nx0, ny0, e.ox, e.oy, null)) exits.push({ ax: nx0, ay: ny0, ox: e.ox, oy: e.oy });
  }
  // 6. Les points de passage d'un TOUR de place (nœuds du cœur) : celui qui flâne
  //    sans s'arrêter de tout un créneau n'occupe aucun poste.
  const tour = [];
  for (let s = 0; s < g.ok.length; s += 1) {
    if (!g.ok[s]) continue;
    const [x, y] = ctr(g, s);
    if (x - o.box.gx0 >= K && o.box.gx1 + 1 - x >= K && y - o.box.gy0 >= K && o.box.gy1 + 1 - y >= K) tour.push([x, y]);
  }
  // Capacité : combien tiennent DEBOUT à la fois dans une parité, à DSOLO l'un de
  // l'autre (empilement glouton). Le créneau attribue un poste à tous ceux qui
  // s'arrêtent, mais ceux qui font un tour n'en prennent pas — et quand les postes
  // manquent, c'est un tour : on peut donc être un peu plus nombreux que les postes.
  const cap = Math.min(...[0, 1].map((par) => {
    const kept = [];
    for (const p of all[par]) if (!near(kept, p.x, p.y, DSOLO) && kept.every((q) => seen(p, q))) kept.push(p);
    return kept.length;
  }));
  const n = tour.length < 8 ? 0
    : Math.max(0, Math.min(Math.round((o.n | 0) * FOLK.density), Math.max(2, Math.floor(cap * 1.5))));
  const actors = [];
  for (let i = 0; i < n; i += 1) {
    actors.push({
      off: h01(sd + ':fo:' + i) * OFF_SPAN,          // décalage, en part de créneau
      sp: 0.85 + 0.3 * h01(sd + ':fs:' + i),          // ±15 % autour de l'allure
      ph: h01(sd + ':fp:' + i),                       // phase du pas
      fa: Math.floor(h01(sd + ':ff:' + i) * FORCE_AWAY),
    });
  }
  return {
    sd, g, mode: o.mode === 'stalls' ? 'stalls' : 'centre', lookAt: o.centre ? o.centre.prop : null,
    posts, sites: sites.map((l) => ({ 2: l.filter((s) => s.size === 2), 3: l.filter((s) => s.size === 3) })),
    exits, actors, tour, ident: o.ident,
    rev: _rev, am: new Map(), lm: new Map(), recs: new Map(), frame: 0,
  };
}

// ── LE CRÉNEAU k : QUI VA OÙ ─────────────────────────────────────────────────
function isAway(F, i, k) {
  if (!F.exits.length) return false;
  return h01(F.sd + ':fa:' + k + ':' + i) < FOLK.leaveP || ((k + F.actors[i].fa) % FORCE_AWAY + FORCE_AWAY) % FORCE_AWAY === 0;
}
// Deux INCONNUS arrêtés en même temps se tiennent à DSOLO au moins : plus près, on
// croirait qu'ils se parlent (ceux d'une causette sont posés ensemble, entre eux).
const clear = (taken, pts) => pts.every((p) => taken.every((q) => dist(p.x, p.y, q.x, q.y) >= DSOLO && seen(p, q)));
function assign(F, k) {
  const hit = F.am.get(k);
  if (hit) return hit;
  const par = k & 1, n = F.actors.length, mix = MIX[F.mode];
  const res = new Array(n).fill(null), taken = [];
  const away = F.actors.map((a, i) => isAway(F, i, k));
  const order = F.actors.map((a, i) => [i, h01(F.sd + ':fk:' + k + ':' + i)]).sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  // Les causettes d'abord : celui qui la lance entraîne un ou deux autres dont le
  // créneau tombe à peu près en même temps (sinon l'un serait parti quand l'autre arrive).
  for (const i of order) {
    if (res[i] || away[i] || h01(F.sd + ':fc:' + k + ':' + i) >= mix.chat) continue;
    const mates = order.filter((j) => j !== i && !res[j] && !away[j]
      && Math.abs(F.actors[j].off - F.actors[i].off) < PAIR_SPAN);
    if (!mates.length) continue;
    const size = mates.length >= 2 && h01(F.sd + ':fz:' + k + ':' + i) < 0.3 ? 3 : 2;
    const list = F.sites[par][size];
    const s0 = Math.floor(h01(F.sd + ':fx:' + k + ':' + i) * list.length);
    for (let q = 0; q < list.length; q += 1) {
      const s = list[(s0 + q) % list.length];
      if (!clear(taken, s.pts)) continue;
      const grp = [i, ...mates.slice(0, size - 1)];
      grp.forEach((m, gi) => { res[m] = { act: 'chat', x: s.pts[gi].x, y: s.pts[gi].y, dir: s.pts[gi].dir, grp }; });
      taken.push(...s.pts);
      break;
    }
  }
  // Les autres : un étal, la pièce maîtresse, une halte ou un tour de place ; quand
  // les postes manquent, un tour (il ne prend la place de personne).
  for (const i of order) {
    if (res[i]) continue;
    if (away[i]) { res[i] = { act: 'away' }; continue; }
    const r = h01(F.sd + ':fw:' + k + ':' + i) * (mix.stall + mix.look + mix.pause + mix.stroll);
    const first = r < mix.stall ? 'stall' : r < mix.stall + mix.look ? 'look'
      : r < mix.stall + mix.look + mix.pause ? 'pause' : 'stroll';
    for (const kind of first === 'stroll' ? [] : first === 'pause' ? ['pause'] : [first, 'pause']) {
      const list = F.posts[par][kind];
      const s0 = Math.floor(h01(F.sd + ':fy:' + k + ':' + i + kind) * list.length);
      for (let q = 0; q < list.length && !res[i]; q += 1) {
        const p = list[(s0 + q) % list.length];
        if (!clear(taken, [p])) continue;
        res[i] = { act: kind, x: p.x, y: p.y, dir: p.dir };
        taken.push(p);
      }
      if (res[i]) break;
    }
    if (!res[i]) {
      // Le tour finit sur un nœud du cœur, où il ne s'arrête pas : c'est de là que
      // repart la marche du créneau suivant.
      const e = F.tour[Math.floor(h01(F.sd + ':ft:' + k + ':' + i) * F.tour.length) % F.tour.length];
      res[i] = { act: 'stroll', x: e[0], y: e[1], dir: 0 };
    }
  }
  F.am.set(k, res);
  if (F.am.size > 8) for (const kk of F.am.keys()) if (kk < k - 3 || kk > k + 3) F.am.delete(kk);
  return res;
}

// ── LA MARCHE DU CRÉNEAU k ───────────────────────────────────────────────────
// Du poste du créneau k − 1 (ou d'une entrée de la rue) au poste du créneau k (ou à
// une sortie). Les marcheurs contournent les gens arrêtés des deux créneaux en cours.
const OUT = (r) => r.act === 'away' || r.act === 'hide';
function leg(F, i, k, S) {
  const key = i + ':' + k;
  if (F.lm.has(key)) return F.lm.get(key);
  const A = assign(F, k - 1)[i], B = assign(F, k)[i];
  let L;
  if (B.act === 'hide' || (OUT(A) && OUT(B))) L = null;            // pas sur la place de tout le créneau
  else if (A.act === 'hide') L = { pts: [[B.x, B.y]], cum: [0], len: 0, speed: 1, B };
  else {
    const g = F.g, N = g.nx * g.ny, blk = new Uint8Array(N);
    for (const set of [assign(F, k - 1), assign(F, k)]) {
      for (let j = 0; j < set.length; j += 1) {
        const r = set[j];
        if (j === i || !r || r.x == null || r.act === 'stroll') continue;   // un tour ne s'arrête pas
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            const c = nodeAt(g, r.x + di * G, r.y + dj * G);
            if (c < 0) continue;
            const [cx, cy] = ctr(g, c);
            if (dist(cx, cy, r.x, r.y) < BLOCK_R) blk[c] = 1;
          }
        }
      }
    }
    const pick = (salt) => F.exits[Math.floor(h01(F.sd + salt + k + ':' + i) * F.exits.length) % F.exits.length];
    const eIn = OUT(A) ? pick(':fi:') : null, eOut = OUT(B) ? pick(':fe:') : null;
    const base = FOLK.speed * F.actors[i].sp;
    const stroll = B.act === 'stroll';
    // Les détours. Un TOUR enchaîne des points du cœur jusqu'à remplir le créneau à
    // une allure de promenade ; une marche ordinaire passe parfois par une halte.
    const vias = [];
    if (stroll) {
      const want = 0.6 * base * S;
      let est = 0, last = eIn ? [eIn.ax, eIn.ay] : [A.x, A.y];
      for (let m = 0; m < 24 && est < want; m += 1) {
        const v = F.tour[Math.floor(h01(F.sd + ':fv:' + k + ':' + i + ':' + m) * F.tour.length) % F.tour.length];
        est += dist(last[0], last[1], v[0], v[1]);
        vias.push(v); last = v;
      }
    } else if (!eIn && !eOut && h01(F.sd + ':fj:' + k + ':' + i) < FOLK.viaP) {
      const all = [...F.posts[0].pause, ...F.posts[1].pause];
      const v = all[Math.floor(h01(F.sd + ':fv:' + k + ':' + i) * all.length) % all.length];
      if (v) vias.push([v.x, v.y]);
    }
    const build = (useVia) => {
      const way = [];
      if (eIn) way.push([eIn.ox, eIn.oy], [eIn.ax, eIn.ay]); else way.push([A.x, A.y]);
      if (useVia) way.push(...vias);
      if (eOut) way.push([eOut.ax, eOut.ay], [eOut.ox, eOut.oy]); else way.push([B.x, B.y]);
      const pts = [way[0]];
      for (let m = 0; m < way.length - 1; m += 1) {
        const [ax, ay] = way[m], [bx, by] = way[m + 1];
        // Le pas entre la rue et l'ancre de sortie est tout droit (vérifié à la pose).
        const straight = (eIn && m === 0) || (eOut && m === way.length - 2);
        const seg = straight ? [[ax, ay], [bx, by]]
          : (route(g, ax, ay, bx, by, blk) || route(g, ax, ay, bx, by, null) || [[ax, ay], [bx, by]]);
        for (let s = 1; s < seg.length; s += 1) pts.push(seg[s]);
      }
      const cum = [0];
      for (let s = 1; s < pts.length; s += 1) cum.push(cum[s - 1] + dist(pts[s - 1][0], pts[s - 1][1], pts[s][0], pts[s][1]));
      return { pts, cum, len: cum[cum.length - 1] };
    };
    let P = build(vias.length > 0), speed = base;
    if (stroll) {
      // TOUT le créneau en marche : l'allure se cale sur la longueur du tour, et il
      // arrive au point d'arrivée pile au créneau suivant. Ni plafond (un tour
      // inachevé ferait sauter le marcheur au point d'arrivée) ni plancher (il
      // attendrait sur un nœud quelconque, peut-être sur quelqu'un).
      speed = Math.max(1e-3, P.len / S);
    } else {
      if (vias.length && P.len / speed > WALK_MAX * S) P = build(false);
      speed = Math.max(speed, P.len / (WALK_MAX * S));
    }
    const n2 = P.pts.length;
    const endDir = n2 > 1 ? face(P.pts[n2 - 1][0] - P.pts[n2 - 2][0], P.pts[n2 - 1][1] - P.pts[n2 - 2][1]) : 2;
    L = { ...P, speed, B, endDir, fromExit: !!eIn, toExit: !!eOut };
  }
  F.lm.set(key, L);
  if (F.lm.size > F.actors.length * 4) for (const kk of F.lm.keys()) { if (+kk.split(':')[1] < k - 2) F.lm.delete(kk); }
  return L;
}

// Le créneau d'ARRIVÉE de la présence en cours : c'est lui qui fait le visage. Celui qui
// part est encore celui qui était là.
function runOf(F, i, k) {
  if (!F.exits.length) return 0;
  let j = isAway(F, i, k) ? k - 1 : k;
  for (let s = 0; s <= FORCE_AWAY; s += 1, j -= 1) if (isAway(F, i, j - 1)) return j;
  return j;
}

// ── À L'INSTANT t ────────────────────────────────────────────────────────────
// Les passants visibles de la place, en fiches stables (le même objet tant que la même
// personne est là : la fiche d'habitant et la caméra qui suit s'y accrochent).
// `T` = taille d'une cellule en px monde, `depthOf` = la profondeur du peintre.
export function folkAt(F, nowMs, T, depthOf) {
  if (F.rev !== _rev) { F.rev = _rev; F.am.clear(); F.lm.clear(); }
  const S = Math.max(4, +FOLK.slot || 30);
  const t = FOLK.on ? (nowMs || 0) / 1000 : 0;
  const out = [], byI = new Map();
  F.frame += 1;
  for (let i = 0; i < F.actors.length; i += 1) {
    const a = F.actors[i], o = a.off * S;
    const k = Math.floor((t - o) / S), u = t - o - k * S;
    const L = leg(F, i, k, S);
    if (!L) continue;
    const d = u * L.speed;
    let x, y, dir, walking = false, alpha = 1, act;
    if (d >= L.len) {
      if (L.toExit) continue;                                  // parti par la rue
      x = L.B.x; y = L.B.y; dir = L.B.dir; act = L.B.act;
      // Un tour trop court (petite place) : il attend la fin du créneau là où il est.
      if (act === 'stroll') { act = 'pause'; dir = L.endDir; }
      // REGARDS (docs/PLAN-COMPORTEMENTS.md, lot 3) : qui fait une halte jette un coup
      // d'œil ailleurs de temps en temps (1,6 s toutes les 6 à 10 s) ; qui admire la
      // pièce maîtresse, plus rarement. Ceux qui causent ou regardent un étal restent
      // tournés vers ce qui les occupe.
      if (act === 'pause' || act === 'look') {
        const per = (act === 'pause' ? 6 : 11) + 4 * a.ph, slot = Math.floor((t + a.ph * 37) / per);
        if (t + a.ph * 37 - slot * per < 1.6) dir = (dir + 1 + (fmix(cmHash(F.sd + ':fg:' + i + ':' + slot) >>> 0) % 3)) % 4;
      }
    } else {
      let s = 1;
      while (s < L.cum.length - 1 && L.cum[s] < d) s += 1;
      const [ax, ay] = L.pts[s - 1], [bx, by] = L.pts[s];
      const f = (d - L.cum[s - 1]) / Math.max(1e-6, L.cum[s] - L.cum[s - 1]);
      x = ax + (bx - ax) * f; y = ay + (by - ay) * f;
      dir = face(bx - ax, by - ay);
      walking = true;
      act = L.toExit ? 'leave' : 'walk';
      if (L.fromExit && d < FADE) alpha = d / FADE;
      if (L.toExit && L.len - d < FADE) alpha = Math.min(alpha, (L.len - d) / FADE);
    }
    const run = runOf(F, i, k), key = i + ':' + run;
    let rec = F.recs.get(key);
    if (!rec) {
      const id = F.ident(i, run);
      if (!id) continue;
      rec = { prop: 'person', variant: null, hT: 0, ...id, phase: a.ph };
      F.recs.set(key, rec);
    }
    rec.wx = x * T; rec.wy = y * T; rec.x = rec.wx; rec.y = rec.wy;
    rec.d = depthOf(rec.wx, rec.wy);
    rec.dir = dir; rec.walking = walking; rec.walkDist = walking ? d * T : 0; rec.alpha = alpha;
    rec.act = act; rec.stall = act === 'stall'; rec.lookAt = F.lookAt; rec.mate = null;
    rec._grp = !walking && act === 'chat' ? L.B.grp : null;
    rec._f = F.frame;
    byI.set(i, rec);
    out.push(rec);
  }
  // En causette : chacun nomme sur sa fiche un de ceux avec qui il parle, s'il est là.
  for (const [i, rec] of byI) {
    if (!rec._grp) continue;
    for (const j of rec._grp) {
      const m = byI.get(j);
      if (j !== i && m && m._grp === rec._grp) { rec.mate = m; break; }
    }
  }
  if (F.recs.size > F.actors.length * 3) for (const [kk, r] of F.recs) if (F.frame - r._f > 600) F.recs.delete(kk);
  return out;
}
