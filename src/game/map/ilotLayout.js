/* ============================================================================
 * ilotLayout.js — LE PLAN PAR ÎLOTS D'UNE VILLE (docs/PLAN-ILOTS.md, lots I1-I2)
 *
 * Pont entre la grille pure (procedural/blockCity.js) et le calcul de la carte
 * (layout.js). Décide, pour une ville donnée :
 *   - la grille : cardo = la colonne du pont (DOUBLE, comme le pont), decumanus =
 *     la rangée du cœur ;
 *   - quels îlots sont OUVERTS (assez pour loger le contenu, jamais moins que la
 *     fois précédente) ;
 *   - ce que porte chaque îlot : le FORUM (place centrale), une place de quartier,
 *     une HALLE de bâtiment-moteur (monument + parvis), ou des maisons ;
 *   - les lots des ateliers (annexes) et des points d'eau, semés d'îlot en îlot ;
 *   - les rues (pourtours des îlots ouverts), les lots restants pour les maisons
 *     (dans l'ordre : îlot par îlot, en rangée le long du pourtour), les cours.
 *
 * Aucun accès au monde : tout arrive par paramètres, tout repart en données.
 * La MÉMOIRE (`memory`) est un petit objet JSON rangé dans state.cityCore.ilot.
 * ========================================================================== */
import { gridOf, blockOrder, blockStreets, ILOT_DEFAULTS } from "./procedural/blockCity.js";

// Une place de quartier tous les PLAZA_EVERY îlots (au rang PLAZA_EVERY/2 du
// cycle) : un square, un marché, un parvis — le Marbre a ses forums de quartier.
export const ILOT_PLAZA_EVERY = 16;
const PLAZA_KINDS = ["marche", "jardin", "parvis"];
// Lots de marge : la ville ouvre un peu d'avance (achats à venir, grands logis).
const LOT_MARGIN = 6;
// Cases de cardo sur la rive d'en face, au débouché du pont.
const BRIDGE_LANDING = 5;
// Lots de maisons par îlot plein (4×4 : 12 lots de bord) — pour l'ESTIMATION du
// rayon seulement ; le compte réel se fait îlot par îlot.
export const ILOT_LOTS_PER_BLOCK = 11;

const hash = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};
const bkey = (b) => b.i + ":" + b.j;

/**
 * Rayon (en cases) d'une ville par îlots qui logerait ce contenu. Sert à caler
 * ce qui, ailleurs, se pose « au bord de la ville » (merveilles, champs).
 */
export function ilotReachFor({ lots, halls, pitch = ILOT_DEFAULTS.pitch }) {
  const blocks = Math.ceil(lots / ILOT_LOTS_PER_BLOCK) + halls + 1;
  const withPlazas = blocks * (1 + 1 / ILOT_PLAZA_EVERY);
  return Math.max(6, Math.sqrt((withPlazas * pitch * pitch) / Math.PI) * 1.1);
}

/**
 * @param {object} o
 * @param {number} o.N
 * @param {{x:number,y:number}} o.core
 * @param {number} o.bx                 colonne du pont (le cardo occupe bx et bx+1)
 * @param {(x,y)=>boolean} o.isWet      eau (fleuve, bras)
 * @param {(x,y)=>boolean} o.isBank     berge (ni bâti ni îlot ; une rue peut la longer)
 * @param {(x,y)=>boolean} o.isReserved merveille + parvis, domaine des Plaisirs, districts…
 * @param {(x,y)=>boolean} [o.isHeld]   cellule tenue par un bâtiment (mémoire)
 * @param {object} o.demand  { lots, halls:[{key, zone}], annexes:[{key, id, size, zone, index}] }
 * @param {object} [o.memory] { blocks:["i:j"…], plazas:{"i:j":kind}, halls:{key:"i:j"}, annexes:{key:[dx,dy]} }
 * @param {number} [o.pitch]
 */
export function planIlots(o) {
  const { N, core, bx } = o;
  // Repère de la mémoire : le centre de grille (la grille grandit autour de lui).
  const ox0 = o.cx | 0, oy0 = o.cy | 0;
  const pitch = o.pitch || ILOT_DEFAULTS.pitch;
  const mem = o.memory || {};
  const oy = Math.round(core.y);
  // ÎLOTS LONGS le long des axes (Raph 2026-10-04) : les îlots qui bordent le
  // decumanus (j = −1, 0) se marient deux à deux le long de X, ceux qui bordent le
  // cardo (i = −1, 0) le long de Y — de longues rangées sur les grandes rues, comme
  // les insulae d'une via. Les quatre îlots du croisement restent carrés (le forum).
  const odd = (n) => ((n % 2) + 2) % 2 === 1;
  const merge = (i, j) => {
    const onDecu = j === -1 || j === 0, onCardo = i === -1 || i === 0;
    if (onDecu && !onCardo && odd(i)) return "x";
    if (onCardo && !onDecu && odd(j)) return "y";
    return null;
  };
  const grid = gridOf({ ox: bx, oy, pitch, merge });
  const twin = bx + 1;
  const inGrid = (x, y) => x >= 1 && y >= 1 && x < N - 1 && y < N - 1;
  // La 2e voie du cardo n'est jamais un lot : c'est la rue, de bout en bout.
  const usable = (x, y) => inGrid(x, y) && x !== twin && !o.isWet(x, y) && !o.isBank(x, y) && !o.isReserved(x, y);
  // Une rue peut longer la berge ; elle ne traverse l'eau que sur le cardo (le pont).
  const onCardo = (x) => x === bx || x === twin;
  const streetOk = (x, y) => x >= 0 && y >= 0 && x < N && y < N && !o.isReserved(x, y) && (onCardo(x) || !o.isWet(x, y));

  // Rues de départ : le cardo, du decumanus jusqu'à la rive d'en face — le pont
  // fait partie de la ville dès le premier îlot, et il DÉBOUCHE sur une rue : le cardo
  // court BRIDGE_LANDING cases sur l'autre rive (v1 : deux cases, un pont qui finissait
  // dans l'herbe tant que la rive d'en face n'avait pas d'îlot). Le fleuve peut passer
  // au sud ou au nord du cœur : on cherche la traversée la plus proche des deux côtés.
  const wetAt = (y) => o.isWet(bx, y) || o.isWet(twin, y);
  const crossing = (dir) => {
    let lo = null, hi = null;
    for (let y = oy; y > 0 && y < N - 1; y += dir) {
      if (wetAt(y)) { if (lo === null) lo = y; hi = y; } else if (lo !== null) break;
    }
    return lo === null ? null : { near: lo, far: hi, d: Math.abs(lo - oy) };
  };
  const cs = crossing(1), cn = crossing(-1);
  const cross = cs && (!cn || cs.d <= cn.d) ? { ...cs, dir: 1 } : cn ? { ...cn, dir: -1 } : null;
  const seed = [];
  const yEnd = cross ? Math.max(0, Math.min(N - 1, cross.far + cross.dir * BRIDGE_LANDING)) : oy;
  for (let y = oy; cross ? (cross.dir > 0 ? y <= yEnd : y >= yEnd) : y === oy; y += cross ? cross.dir : 1) {
    seed.push({ x: bx, y, h: y === oy, v: true });
    seed.push({ x: twin, y, h: y === oy, v: true });
    if (!cross) break;
  }
  // La rive d'en face coûte la traversée : on y bâtit quand le cœur est servi.
  const riverMid = cross ? (cross.near + cross.far + 1) / 2 : null;
  const extraCost = (i, j, c) => (riverMid !== null && Math.sign(c.y - riverMid) !== Math.sign((core.y + 0.5) - riverMid) ? 1.5 : 0);
  const order = blockOrder({ N, core, grid, usable, streetOk, seed, extraCost, maxBlocks: 2000 });

  // ── LA MÉMOIRE DES ÎLOTS ─────────────────────────────────────────────────
  // L'ordre d'ouverture dépend de la géométrie, et la géométrie bouge un peu : le
  // fleuve s'étire quand la grille grandit (mesuré : N 164 → 170 d'un achat à
  // l'autre, des îlots neufs ouverts ailleurs, champs et moulins chassés sur l'autre
  // rive). Ce qui est OUVERT, lui, ne doit plus bouger : la mémoire garde la LISTE
  // des îlots ouverts et le rôle de chacun (forum, places), pas seulement leur nombre.
  const byKey = new Map(order.map((b) => [bkey(b), b]));
  const role = new Map();                              // "i:j" → { kind, key?, plazaKind?, size? }
  const opened = [], openedSet = new Set();
  const openB = (b) => { opened.push(b); openedSet.add(bkey(b)); };
  for (const k of mem.blocks || []) { const b = byKey.get(k); if (b && !openedSet.has(k)) openB(b); }
  for (const [k, kind] of Object.entries(mem.plazas || {})) if (openedSet.has(k)) role.set(k, { kind: "plaza", plazaKind: kind });
  const full4 = (b) => b.cells.length === (pitch - 1) * (pitch - 1);
  const heldIn = (b) => o.isHeld && b.cells.some((c) => o.isHeld(c.x, c.y));
  // LA CAMPAGNE DÉJÀ POSÉE (champs, moulins, port + marge) : un îlot NEUF qui la
  // toucherait (lui ou sa rue) est DIFFÉRÉ — la ville l'entoure. Un îlot déjà
  // ouvert reste ouvert.
  const ruralIn = (b) => !!o.isRural && (b.cells.some((c) => o.isRural(c.x, c.y)) || b.ring.some((c) => o.isRural(c.x, c.y)));
  const deferred = (b) => !openedSet.has(bkey(b)) && ruralIn(b);
  // Le FORUM : le premier îlot complet au croisement du cardo et du decumanus.
  if (![...role.values()].some((r) => r.plazaKind === "centrale")) {
    const ok = (b) => full4(b) && !heldIn(b) && !deferred(b);
    const forum = order.slice(0, 8).find((b) => ok(b) && (b.i === -1 || b.i === 0) && (b.j === -1 || b.j === 0)) || order.find(ok);
    if (forum) role.set(bkey(forum), { kind: "plaza", plazaKind: "centrale" });
  }
  // Halles : celles de la mémoire gardent leur îlot ; les nouvelles prennent le
  // premier îlot libre à partir d'un rang qui dépend de leur zone (le cœur pour
  // les institutions, le milieu pour le commerce, la lisière pour le reste).
  // Une halle ne prend plus l'îlot entier (v1 : 25 parvis vides au cœur, vu à la
  // capture) : elle tient l'ANGLE NORD de son îlot, à sa taille, et des maisons
  // bordent le reste — le monument au milieu de son quartier, pas sur une dalle.
  const hallBlock = new Map();
  const memHalls = { ...(mem.halls || {}) };
  for (const h of o.demand.halls) {
    const bk = memHalls[h.key];
    const b = bk && byKey.get(bk);
    if (b && !role.has(bk)) { role.set(bk, { kind: "hall", key: h.key, size: h.size || 1 }); hallBlock.set(h.key, b); }
  }
  const est = Math.ceil(o.demand.lots / ILOT_LOTS_PER_BLOCK) + o.demand.halls.length + 2;
  const startOf = (zone) => zone === "center" ? 1 : zone === "mid" ? Math.round(est * 0.3) : Math.round(est * 0.55);
  for (const h of o.demand.halls) {
    if (hallBlock.has(h.key)) continue;
    let b = null;
    for (let r = Math.min(order.length - 1, startOf(h.zone)); r < order.length && !b; r += 1) {
      const q = order[r];
      if (!role.has(bkey(q)) && q.cells.length >= 9 && !heldIn(q) && !deferred(q)) b = q;
    }
    if (!b) continue;
    role.set(bkey(b), { kind: "hall", key: h.key, size: h.size || 1 });
    hallBlock.set(h.key, b);
    memHalls[h.key] = bkey(b);
  }

  // ── Combien d'îlots ouvrir ───────────────────────────────────────────────
  // Les mémorisés d'abord, puis l'ordre, jusqu'à loger la demande ET atteindre le
  // forum et chaque halle. Une place de quartier naît tous les ILOT_PLAZA_EVERY
  // îlots OUVERTS (compte stable : l'ouverture est mémorisée).
  const capOf = (b) => { const r = role.get(bkey(b)); return !r ? b.lots.length : r.kind === "hall" ? Math.max(0, b.lots.length - 2 * r.size) : 0; };
  let need = o.demand.lots + LOT_MARGIN;
  for (const b of opened) need -= capOf(b);
  let maxRole = -1;
  for (const [k, r] of role) if ((r.kind === "hall" || r.plazaKind === "centrale") && !openedSet.has(k) && byKey.has(k)) maxRole = Math.max(maxRole, byKey.get(k).rank);
  for (const b of order) {
    const k = bkey(b);
    if (openedSet.has(k)) continue;
    if (need <= 0 && b.rank > maxRole) break;
    if (deferred(b)) continue;
    if (!role.has(k) && full4(b) && !heldIn(b) && opened.length % ILOT_PLAZA_EVERY === ILOT_PLAZA_EVERY / 2) {
      role.set(k, { kind: "plaza", plazaKind: PLAZA_KINDS[Math.floor(opened.length / ILOT_PLAZA_EVERY) % PLAZA_KINDS.length] });
    }
    openB(b);
    need -= capOf(b);
  }
  const blocks = opened;

  // ── Les ateliers et points d'eau : semés d'îlot en îlot ──────────────────
  // Un atelier prend un lot de bord (taille 1) ou un angle 2×2 (taille 2). Jamais
  // deux ateliers d'un même métier dans un même îlot ; un emplacement mémorisé
  // tient tant qu'il est encore un lot d'îlot ouvert.
  const houseBlocks = blocks.filter((b) => { const r = role.get(bkey(b)); return !r || r.kind === "hall"; });
  const lotTaken = new Set();
  // Les halles d'abord : l'angle de l'îlot le plus haut à l'écran (x0, y0) s'il est
  // entier, sinon le premier carré qui tient, en réduisant la taille s'il le faut.
  const hallAt = new Map();
  for (const b of blocks) {
    const r = role.get(bkey(b));
    if (!r || r.kind !== "hall") continue;
    const inB = new Set(b.cells.map((q) => q.x + "," + q.y));
    // Une halle qui GRANDIT (palier d'achats) ne chasse pas les maisons de son
    // îlot : si la taille neuve mord une case tenue par un autre, elle garde la
    // plus grande taille qui tient.
    const mine = (x, y) => { const ow = o.heldOwner ? o.heldOwner(x, y) : null; return !ow || ow === r.key; };
    const fits = (gx, gy, sz) => { for (let dy = 0; dy < sz; dy += 1) for (let dx = 0; dx < sz; dx += 1) if (!inB.has((gx + dx) + "," + (gy + dy)) || !mine(gx + dx, gy + dy)) return false; return true; };
    let at = null;
    for (let sz = Math.min(r.size, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1); sz >= 1 && !at; sz -= 1) {
      for (let gy = b.y0; gy + sz - 1 <= b.y1 && !at; gy += 1) for (let gx = b.x0; gx + sz - 1 <= b.x1 && !at; gx += 1) if (fits(gx, gy, sz)) at = { gx, gy, size: sz, block: b };
    }
    if (!at) continue;
    for (let dy = 0; dy < at.size; dy += 1) for (let dx = 0; dx < at.size; dx += 1) lotTaken.add((at.gx + dx) + "," + (at.gy + dy));
    hallAt.set(r.key, at);
  }
  const lotAt = new Map();
  for (const b of houseBlocks) for (const l of b.lots) lotAt.set(l.gx + "," + l.gy, { l, b });
  const courtOf = new Set();
  for (const b of houseBlocks) for (const c of b.court) courtOf.add(c.gx + "," + c.gy);
  const typesIn = new Map();                            // "i:j" → Set(id)
  const annexAt = new Map();
  const memAnnex = { ...(mem.annexes || {}) };
  const cellsOf = (gx, gy, s) => { const out = []; for (let dy = 0; dy < s; dy += 1) for (let dx = 0; dx < s; dx += 1) out.push((gx + dx) + "," + (gy + dy)); return out; };
  // ⚠ Jamais sur une case TENUE par un bâtiment déjà posé (mémoire) : un atelier
  // neuf qui prenait le lot d'une maison la faisait déménager (50 maisons d'une
  // ère à l'autre, roadMemory.test.js).
  const heldK = (k) => { if (!o.isHeld) return false; const ci = k.indexOf(","); return o.isHeld(+k.slice(0, ci), +k.slice(ci + 1)); };
  const fitsAt = (gx, gy, s, b, own = false) => cellsOf(gx, gy, s).every((k) => !lotTaken.has(k) && (own || !heldK(k))
    && ((lotAt.has(k) && lotAt.get(k).b === b) || (s > 1 && courtOf.has(k))));
  const take = (a, gx, gy, b) => {
    for (const k of cellsOf(gx, gy, a.size)) lotTaken.add(k);
    if (!typesIn.has(bkey(b))) typesIn.set(bkey(b), new Set());
    typesIn.get(bkey(b)).add(a.id);
    annexAt.set(a.key, { gx, gy, size: a.size, block: b });
    memAnnex[a.key] = [gx - ox0, gy - oy0];             // repère du centre de grille
  };
  // 1. Les mémorisés d'abord (ils ne bougent pas). L'îlot se retrouve par n'importe
  //    quelle case de lot du carré (l'ancre d'un 2×2 peut tomber dans la cour).
  for (const a of o.demand.annexes) {
    const m = memAnnex[a.key];
    if (!m) continue;
    const gx = m[0] + ox0, gy = m[1] + oy0;
    const hit = cellsOf(gx, gy, a.size).map((k) => lotAt.get(k)).find(Boolean);
    if (hit && fitsAt(gx, gy, a.size, hit.b, true)) take(a, gx, gy, hit.b);
    else delete memAnnex[a.key];
  }
  // 2. Les nouveaux : un rang cible tiré par (métier, index), puis le premier îlot
  //    qui convient en tournant à partir de là.
  const nH = houseBlocks.length;
  for (const a of o.demand.annexes) {
    if (annexAt.has(a.key) || !nH) continue;
    const u = ((a.index * 0.6180339887 + (hash("ilot:" + a.id) % 1000) / 1000) % 1 + 1) % 1;
    const r0 = Math.floor(u * nH);
    let done = false;
    for (let s = 0; s < nH && !done; s += 1) {
      const b = houseBlocks[(r0 + s) % nH];
      const ty = typesIn.get(bkey(b));
      if (ty && ty.has(a.id)) continue;
      for (const l of b.lots) {
        // Angle 2×2 : l'ancre est le coin haut-gauche du carré qui contient le lot.
        const anchors = a.size > 1 ? [[l.gx, l.gy], [l.gx - 1, l.gy], [l.gx, l.gy - 1], [l.gx - 1, l.gy - 1]] : [[l.gx, l.gy]];
        for (const [gx, gy] of anchors) if (fitsAt(gx, gy, a.size, b)) { take(a, gx, gy, b); done = true; break; }
        if (done) break;
      }
    }
  }

  // ── Les maisons : les lots restants, îlot par îlot, en rangée ────────────
  // `long` : îlot allongé (deux pas de grille, le long d'un axe) — ses côtés sont
  // des rangées mitoyennes (layout.js). `lotFace` couvre AUSSI les lots des ateliers.
  const isLong = (b) => Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1 > pitch - 1;
  const lots = [], lotFace = new Map();
  for (const b of houseBlocks) for (const l of b.lots) {
    const e = { gx: l.gx, gy: l.gy, faces: l.faces, block: bkey(b), long: isLong(b) };
    lotFace.set(l.gx + "," + l.gy, e);
    if (!lotTaken.has(l.gx + "," + l.gy)) lots.push(e);
  }
  const courts = [];
  for (const b of houseBlocks) for (const c of b.court) if (!lotTaken.has(c.gx + "," + c.gy)) courts.push(c);

  // ── Les rues : pourtours des îlots ouverts + cardo (deux voies) ──────────
  const streets = blockStreets(grid, blocks, seed);
  for (const [k, m] of Array.from(streets)) {
    const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
    if (x === bx && streetOk(twin, y)) {
      const tk = twin + "," + y, e = streets.get(tk);
      if (e) { e.h = e.h || m.h; e.v = true; e.rank = "main"; } else streets.set(tk, { h: m.h, v: true, rank: "main" });
    }
    if (x === bx || x === twin) m.rank = "main";
  }
  // HIÉRARCHIE : une rue sur deux est une RUELLE (`path`, sans trottoir), l'autre
  // une rue (`secondary`), le cardo et le decumanus des artères (`main`). v1 avait
  // toutes ses rues en `secondary` : 47 % du sol de ville en chaussée à trottoirs,
  // une nappe grise (vu à la capture). Un carrefour prend le rang de la plus forte.
  const RANKS = ["path", "secondary", "main"];
  const lineRank = (idx) => idx === 0 ? 2 : (Math.abs(idx) % 2 === 0 ? 1 : 0);
  for (const [k, m] of streets) {
    if (m.rank === "main") continue;
    const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
    let r = -1;
    if (grid.isStreetCol(x)) r = Math.max(r, lineRank(Math.round((x - grid.ox) / pitch)));
    if (grid.isStreetRow(y)) r = Math.max(r, lineRank(Math.round((y - grid.oy) / pitch)));
    if (r >= 0) m.rank = RANKS[r];
  }
  // Une rue PERDUE sur la berge d'un îlot rogné (aucun lot ne la borde) reste :
  // c'est le quai, la promenade le long de l'eau.

  // ── Places et halles : cellules et descriptifs ───────────────────────────
  const plazas = [], halls = [];
  for (const b of blocks) {
    const r = role.get(bkey(b));
    if (!r) continue;
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    if (r.kind === "plaza") plazas.push({ block: b, kind: r.plazaKind, gx: b.x0 + Math.floor(w / 2), gy: b.y0 + Math.floor(h / 2), size: Math.min(w, h) });
    else if (hallAt.has(r.key)) halls.push({ key: r.key, ...hallAt.get(r.key) });
  }
  const memPlazas = {};
  for (const b of blocks) { const r = role.get(bkey(b)); if (r && r.kind === "plaza") memPlazas[bkey(b)] = r.plazaKind; }
  const memOut = { blocks: blocks.map(bkey), plazas: memPlazas, halls: memHalls, annexes: memAnnex };
  for (const k of Object.keys(memOut.halls)) if (!openedSet.has(memOut.halls[k])) delete memOut.halls[k];
  return { grid, order, blocks, opened: openedSet, streets, plazas, halls, hallBlock, hallAt, annexAt, lots, lotFace, courts, memory: memOut, seed };
}
