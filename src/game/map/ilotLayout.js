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
import { gridOf, blockOrderLazy, blockStreets, ILOT_DEFAULTS } from "./procedural/blockCity.js";

// Une place de quartier tous les PLAZA_EVERY îlots (au rang PLAZA_EVERY/2 du
// cycle) : un square, un marché, un parvis — le Marbre a ses forums de quartier.
const ILOT_PLAZA_EVERY = 16;
const PLAZA_KINDS = ["marche", "jardin", "parvis"];
// Lots de marge : la ville ouvre un peu d'avance (achats à venir, grands logis).
// 12 (v1 : 6) : au Néon, une maison-moteur sur 129 restait sans lot ; les lots en trop
// sont des jardins (layout.js).
const LOT_MARGIN = 12;
// L'air des îlots (lots de bord laissés en jardin, cf. planIlots) — molette de
// comparaison : __ilotAir(false) puis recalcul de la ville.
// `motifs` : respirations par îlot (un îlot long en a une de plus).
export const ILOT_AIR = { on: true, motifs: 2 };   // dose « forte », choisie par Raph (2026-10-04)
if (import.meta.env?.DEV && typeof window !== "undefined") window.__ilotAir = (on) => { if (on && typeof on === "object") Object.assign(ILOT_AIR, { on: true }, on); else ILOT_AIR.on = on !== false; return { ...ILOT_AIR }; };
// LES GRANDES PLACES (audit 2026-10-05, BUG-63, choix (c) de Raph) : le forum sur quatre
// îlots, le square sur un carré de 2×2 îlots, au lieu d'un îlot chacun (cf. planIlots).
// Molette de comparaison : __grandesPlaces({ forum: false, square: false }) puis recalcul
// de la ville — pour une ville NEUVE : une ville déjà agrandie le reste, sa fiche porte
// les îlots de ses places.
export const GRANDES_PLACES = { forum: true, square: true };
if (import.meta.env?.DEV && typeof window !== "undefined") window.__grandesPlaces = (o) => { if (o && typeof o === "object") Object.assign(GRANDES_PLACES, o); return { ...GRANDES_PLACES }; };
// Les îlots (i, j) du grand forum : les deux du croisement à l'ouest du cardo, puis les
// deux îlots longs qui les prolongent le long du decumanus — le 3e donne le coin
// nord-ouest du rectangle, le 2e le coin sud-est.
const GRAND_FORUM_BLOCKS = [[-1, -1], [-1, 0], [-3, -1], [-3, 0]];
// Cases de cardo sur la rive d'en face, au débouché du pont.
const BRIDGE_LANDING = 5;
// Lots de maisons par îlot plein (4×4 : 12 lots de bord) — pour l'ESTIMATION du
// rayon seulement ; le compte réel se fait îlot par îlot. Un îlot qui RESPIRE en loge
// moins (~1,5 lot de jardin par motif, mesuré : 134 → 184 îlots pour les mêmes 780
// maisons à deux motifs) : sous-estimé, le rayon grandissait d'une ère à l'autre, la
// grille avec lui, et le fleuve qui s'étire avec la grille noyait des rues de berge.
const ILOT_LOTS_PER_BLOCK = 11;
const lotsPerBlock = () => ILOT_LOTS_PER_BLOCK - (ILOT_AIR.on ? 1.5 * (ILOT_AIR.motifs | 0) : 0);

const hash = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};
const bkey = (b) => b.i + ":" + b.j;

// ÎLOTS LONGS le long des axes (Raph 2026-10-04) : les îlots qui bordent le
// decumanus (j = −1, 0) se marient deux à deux le long de X, ceux qui bordent le
// cardo (i = −1, 0) le long de Y — de longues rangées sur les grandes rues, comme
// les insulae d'une via. Les quatre îlots du croisement restent carrés (le forum).
const odd = (n) => ((n % 2) + 2) % 2 === 1;
function ilotMerge(i, j) {
  const onDecu = j === -1 || j === 0, onCardo = i === -1 || i === 0;
  if (onDecu && !onCardo && odd(i)) return "x";
  if (onCardo && !onDecu && odd(j)) return "y";
  return null;
}

/**
 * Les cellules (intérieurs ET rues de pourtour) des îlots déjà OUVERTS, lus dans
 * la mémoire (`cityCore.ilot.blocks`) — même grille que planIlots. Pour ce qui se
 * pose AVANT les îlots (merveille neuve, port de commerce) : le garder hors de la
 * ville déjà bâtie au lieu de rogner ses îlots.
 */
export function ilotMemoryCells({ core, bx, memory, pitch = ILOT_DEFAULTS.pitch }) {
  const out = new Set();
  const keys = memory && Array.isArray(memory.blocks) ? memory.blocks : [];
  if (!keys.length) return out;
  const grid = gridOf({ ox: bx, oy: Math.round(core.y), pitch, merge: ilotMerge });
  for (const k of keys) {
    const ci = String(k).indexOf(":");
    const i = Number(String(k).slice(0, ci)), j = Number(String(k).slice(ci + 1));
    if (ci < 0 || !Number.isInteger(i) || !Number.isInteger(j)) continue;
    const { x0, y0, x1, y1 } = grid.interior(i, j);
    for (let y = y0 - 1; y <= y1 + 1; y += 1) for (let x = x0 - 1; x <= x1 + 1; x += 1) out.add(x + "," + y);
  }
  return out;
}

/**
 * Rayon (en cases) d'une ville par îlots qui logerait ce contenu. Sert à caler
 * ce qui, ailleurs, se pose « au bord de la ville » (merveilles, champs).
 */
export function ilotReachFor({ lots, halls, pitch = ILOT_DEFAULTS.pitch }) {
  const blocks = Math.ceil(lots / lotsPerBlock()) + halls + 1;
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
 * @param {(x,y)=>boolean} [o.isHold]   cellule d'îlot GARDÉE en pelouse (échangeur de l'autoroute) :
 *                                      ni lot, ni cour, ni halle — l'îlot, ses rues et l'ordre ne bougent pas
 * @param {object} o.demand  { lots, halls:[{key, zone}], annexes:[{key, id, size, zone, index}] }
 * @param {object} [o.memory] { blocks:["i:j"…], plazas:{"i:j":kind}, halls:{key:"i:j"}, annexes:{key:[dx,dy]} }
 * @param {boolean} [o.forumGrow] fiche d'avant le grand forum : son forum d'un îlot s'agrandit, une fois,
 *                                en reprenant des cases tenues (rendues dans `forumClaim`, à reloger)
 * @param {number} [o.pitch]
 */
export function planIlots(o) {
  const { N, core, bx } = o;
  // Repère de la mémoire : le centre de grille (la grille grandit autour de lui).
  const ox0 = o.cx | 0, oy0 = o.cy | 0;
  const pitch = o.pitch || ILOT_DEFAULTS.pitch;
  const mem = o.memory || {};
  const oy = Math.round(core.y);
  const grid = gridOf({ ox: bx, oy, pitch, merge: ilotMerge });
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
  // L'ordre est PARESSEUX (PERF-7 de l'audit du 2026-10-05, cf. blockOrderLazy) : on
  // n'avance que jusqu'aux îlots que ce plan lit — `order.at(r)`, `blockByKey(k)` —
  // au lieu de calculer les lots des ~3 500 îlots de la fenêtre. Mêmes îlots, mêmes
  // rangs : chaque lecture rend ce que rendait la liste complète.
  // ⚠ PLAFOND SILENCIEUX (audit 2026-10-05, BUG-88) : 2 000 îlots au plus. C'est LUI qui
  // bute le premier, pas la grille (NCAP, layout.js) : mesuré (graine 0x51a7c0de, ère
  // 136), toutes les maisons-moteur logées jusqu'à 4e5 achats par type (1 974 îlots
  // ouverts dès 2e5), 12 491 sur 16 845 à 1e6. Au-delà, « 1 achat = 1 bâtiment » cesse
  // sans signal — la carte ne révèle que ce qu'elle a posé (engineHomePlaced,
  // cityMapRuntime), donc aucune maison fantôme. Le relever (6 000 : ~4 030 îlots, tout
  // logé à 1e6) alourdit le calcul à ces tailles (boucle d'ouverture quadratique ;
  // ~1,4 s → ~2,5 s mesurés, au bruit près) : profiler d'abord.
  const order = blockOrderLazy({ N, core, grid, usable, streetOk, seed, extraCost, maxBlocks: 2000 });

  // ── LA MÉMOIRE DES ÎLOTS ─────────────────────────────────────────────────
  // L'ordre d'ouverture dépend de la géométrie, et la géométrie bouge un peu : le
  // fleuve s'étire quand la grille grandit (mesuré : N 164 → 170 d'un achat à
  // l'autre, des îlots neufs ouverts ailleurs, champs et moulins chassés sur l'autre
  // rive). Ce qui est OUVERT, lui, ne doit plus bouger : la mémoire garde la LISTE
  // des îlots ouverts et le rôle de chacun (forum, places), pas seulement leur nombre.
  const byKey = new Map();
  let keyed = 0;
  const blockByKey = (k) => {
    for (;;) {
      for (; keyed < order.produced.length; keyed += 1) byKey.set(bkey(order.produced[keyed]), order.produced[keyed]);
      if (byKey.has(k) || !order.at(keyed)) return byKey.get(k);
    }
  };
  const findOrder = (pred) => { for (let r = 0, b; (b = order.at(r)); r += 1) if (pred(b)) return b; return undefined; };
  const role = new Map();                              // "i:j" → { kind, key?, plazaKind?, size? }
  const opened = [], openedSet = new Set();
  const openB = (b) => { opened.push(b); openedSet.add(bkey(b)); };
  for (const k of mem.blocks || []) { const b = blockByKey(k); if (b && !openedSet.has(k)) openB(b); }
  for (const [k, kind] of Object.entries(mem.plazas || {})) if (openedSet.has(k)) role.set(k, { kind: "plaza", plazaKind: kind });
  const full4 = (b) => b.cells.length === (pitch - 1) * (pitch - 1);
  // LES PELOUSES DE L'ÉCHANGEUR (layout.js, autoroute de l'artère — audit 2026-10-05,
  // BUG-16) : `isHold` retire des cases aux lots, aux cours et aux halles SANS toucher
  // à `usable` — mêmes îlots, mêmes rues, même ordre d'ouverture (un îlot rogné aurait
  // pu sortir de l'ordre et décaler tous les rangs suivants). La capacité les décompte
  // (capOf) : il manque des lots, la ville ouvre un îlot de plus, au bout de l'ordre.
  // Un îlot qui en porte ne devient ni forum, ni place, ni halle (comme un îlot tenu).
  const hold = o.isHold || null;
  const heldIn = (b) => b.cells.some((c) => (o.isHeld && o.isHeld(c.x, c.y)) || (hold && hold(c.x, c.y)));
  // LA CAMPAGNE DÉJÀ POSÉE (champs, moulins, port + marge) : un îlot NEUF qui la
  // toucherait (lui ou sa rue) est DIFFÉRÉ — la ville l'entoure. Un îlot déjà
  // ouvert reste ouvert.
  const ruralIn = (b) => !!o.isRural && (b.cells.some((c) => o.isRural(c.x, c.y)) || b.ring.some((c) => o.isRural(c.x, c.y)));
  const deferred = (b) => !openedSet.has(bkey(b)) && ruralIn(b);
  // ── LE GRAND FORUM (audit 2026-10-05, BUG-63, choix (c) de Raph) ────────────
  // Toutes les places faisaient UN îlot, 4×4 : le forum de chaque ère n'avait jamais
  // les arbres d'ombrage ni les massifs sur les axes que ses kits lui dessinent
  // (isoPlaza.js, KIND_KITS) — sur 4×4, pas la place d'un second arbre, pas de champ
  // intérieur. Il prend maintenant QUATRE îlots, de part et d'autre du decumanus, à
  // l'ouest du cardo : les deux îlots du croisement (l'ancien forum en est un) et les
  // deux îlots longs qui les prolongent, rues intérieures comprises — 14 × 9 cases. Le
  // decumanus de l'ouest débouche sur lui et sa fontaine tombe dans l'axe ; le cardo
  // (le pont, l'autoroute) le longe à l'est, intact.
  // Ce ne sont que des RÔLES : la grille, l'ordre d'ouverture, les rues et les lots de
  // tous les autres îlots ne bougent pas (grandesPlaces.test.js, test d'empreinte). Il
  // faut les quatre îlots PLEINS et toutes les cases du rectangle constructibles (ni
  // eau, ni berge, ni réservé, ni pelouse d'échangeur) : un fleuve à moins de cinq
  // rangées du decumanus laisse le forum sur un îlot, comme avant.
  // Une fiche d'avant (`o.forumGrow`) agrandit son forum UNE fois : les bâtiments des
  // trois îlots gagnés sont relogés (`forumClaim`, layout.js), une place de quartier qui
  // s'y trouvait se fond dans le forum. La fiche porte ensuite ses quatre îlots en
  // « centrale » : plus rien ne bouge.
  const gfAll = GRAND_FORUM_BLOCKS.map(([i, j]) => i + ":" + j);
  const gfKeys = GRANDES_PLACES.forum ? gfAll : [];     // pour en ouvrir un ; un forum déjà agrandi est reconnu sans
  const gfRect = () => {
    const a = grid.interior(GRAND_FORUM_BLOCKS[2][0], GRAND_FORUM_BLOCKS[2][1]);
    const z = grid.interior(GRAND_FORUM_BLOCKS[1][0], GRAND_FORUM_BLOCKS[1][1]);
    return { x0: a.x0, y0: a.y0, x1: z.x1, y1: z.y1 };
  };
  const fullB = (b) => b.cells.length === (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
  // Le grand forum s'il tient ({ x0, y0, x1, y1, held }), sinon null. `claim` : des
  // cases tenues sont permises (la migration) et relevées dans `held`.
  const grandForumFits = (claim) => {
    if (!gfKeys.length) return null;
    const R = gfRect(), held = [];
    // La géométrie d'abord : un îlot qui ne s'ouvrira jamais ferait courir l'ordre
    // paresseux jusqu'à son bout (blockByKey).
    for (let y = R.y0; y <= R.y1; y += 1) for (let x = R.x0; x <= R.x1; x += 1) if (!usable(x, y) || (hold && hold(x, y))) return null;
    for (const k of gfKeys) {
      const b = blockByKey(k);
      if (!b || !fullB(b) || deferred(b)) return null;
      const r = role.get(k);
      if (r && r.plazaKind !== "centrale" && !claim) return null;
      for (const c of b.cells) if (o.isHeld && o.isHeld(c.x, c.y)) held.push(c.x + "," + c.y);
    }
    if (held.length && !claim) return null;
    return { ...R, held };
  };
  let forumG = null, forumClaim = [], forumGrew = false;
  {
    const centrales = [...role].filter(([, r]) => r.plazaKind === "centrale").map(([k]) => k);
    const asForum = (g) => { forumG = g; for (const k of gfAll) role.set(k, { kind: "plaza", plazaKind: "centrale" }); };
    if (centrales.length > 1) {
      // La fiche porte déjà le grand forum : il tient tant que ses quatre îlots se rouvrent.
      // Sinon (un îlot perdu en route), le forum redevient l'îlot du croisement.
      if (gfAll.every((k) => centrales.includes(k))) forumG = { ...gfRect(), held: [] };
      else {
        const keep = centrales.find((k) => k === "-1:-1" || k === "-1:0") || centrales[0];
        for (const k of centrales) if (k !== keep) role.delete(k);
      }
    } else if (centrales.length === 1 && o.forumGrow && gfKeys.includes(centrales[0])) {
      const g = grandForumFits(true);
      if (g) { asForum(g); forumClaim = g.held; forumGrew = true; }
    } else if (!centrales.length) {
      const g = grandForumFits(false);
      if (g) asForum(g);
    }
  }
  // ── LE GRAND SQUARE (même chantier) ─────────────────────────────────────────
  // Le square (sorte « jardin », la place verte et grillagée) naît sur un carré de
  // 2×2 îlots ordinaires, rues intérieures comprises — 9 × 9 cases : sa pelouse en
  // anneau, ses arbres, ses massifs sur les diagonales et sur les axes, sa grille à
  // portes. Ses trois îlots compagnons s'ouvrent avec lui : ils ne sont encore ni
  // ouverts ni tenus, personne ne déménage. Sans carré libre autour de son îlot, le
  // square garde un îlot. Les squares d'avant restent comme ils sont.
  const groups = [];                                    // les grandes places : { keys, x0, y0, x1, y1 }
  if (forumG) groups.push({ keys: gfAll, x0: forumG.x0, y0: forumG.y0, x1: forumG.x1, y1: forumG.y1 });
  const sqKeys = (i0, j0) => [[i0, j0], [i0 + 1, j0], [i0, j0 + 1], [i0 + 1, j0 + 1]];
  const sqRect = (i0, j0) => { const a = grid.interior(i0, j0), z = grid.interior(i0 + 1, j0 + 1); return { x0: a.x0, y0: a.y0, x1: z.x1, y1: z.y1 }; };
  const plainB = (i, j) => !ilotMerge(i, j) && !grid.absorbed(i, j);   // un îlot ordinaire (4×4)
  {
    // Ceux de la fiche : quatre îlots « jardin » en carré. Lus en ordre de LECTURE (j
    // puis i, en nombres) : le premier îlot restant d'un pavage de carrés en est toujours
    // le coin haut-gauche. L'ordre des chaînes (« 10:3 » avant « 9:3 ») recollait deux
    // squares accolés de travers (grandesPlaces.test.js).
    const jard = new Set([...role].filter(([, r]) => r.plazaKind === "jardin").map(([k]) => k));
    const used = new Set();
    const ijOf = (k) => { const ci = k.indexOf(":"); return [+k.slice(0, ci), +k.slice(ci + 1)]; };
    for (const k of [...jard].sort((p, q) => { const a = ijOf(p), b = ijOf(q); return a[1] - b[1] || a[0] - b[0]; })) {
      const [i0, j0] = ijOf(k);
      const ks = sqKeys(i0, j0).map(([i, j]) => i + ":" + j);
      if (!ks.every((q) => jard.has(q) && !used.has(q)) || !sqKeys(i0, j0).every(([i, j]) => plainB(i, j))) continue;
      for (const q of ks) used.add(q);
      groups.push({ keys: ks, ...sqRect(i0, j0) });
    }
  }
  // Un grand square dont l'îlot `b` est un coin, ou null. Même géométrie d'abord que le
  // forum (blockByKey ne court qu'après un îlot qui s'ouvrira).
  const grandSquareAt = (b) => {
    if (!GRANDES_PLACES.square) return null;
    for (const [di, dj] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const i0 = b.i + di, j0 = b.j + dj;
      if (!sqKeys(i0, j0).every(([i, j]) => plainB(i, j))) continue;
      const R = sqRect(i0, j0);
      let ok = true;
      for (let y = R.y0; y <= R.y1 && ok; y += 1) for (let x = R.x0; x <= R.x1 && ok; x += 1) if (!usable(x, y) || (hold && hold(x, y))) ok = false;
      const mates = [];
      for (const [i, j] of sqKeys(i0, j0)) {
        const k = i + ":" + j;
        if (!ok || k === bkey(b)) continue;
        const q = blockByKey(k);
        if (!q || !full4(q) || role.has(k) || openedSet.has(k) || heldIn(q) || deferred(q)) ok = false;
        else mates.push(q);
      }
      if (ok) return { keys: sqKeys(i0, j0).map(([i, j]) => i + ":" + j), mates, ...R };
    }
    return null;
  };
  // Le FORUM : le premier îlot complet au croisement du cardo et du decumanus.
  if (![...role.values()].some((r) => r.plazaKind === "centrale")) {
    const ok = (b) => full4(b) && !heldIn(b) && !deferred(b);
    let forum;                                       // parmi les 8 premiers, au croisement…
    for (let r = 0, b; r < 8 && (b = order.at(r)); r += 1) if (ok(b) && (b.i === -1 || b.i === 0) && (b.j === -1 || b.j === 0)) { forum = b; break; }
    if (!forum) forum = findOrder(ok);               // …sinon le premier îlot complet
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
    const b = bk && blockByKey(bk);
    if (b && !role.has(bk)) { role.set(bk, { kind: "hall", key: h.key, size: h.size || 1 }); hallBlock.set(h.key, b); }
  }
  const est = Math.ceil(o.demand.lots / lotsPerBlock()) + o.demand.halls.length + 2;
  const startOf = (zone) => zone === "center" ? 1 : zone === "mid" ? Math.round(est * 0.3) : Math.round(est * 0.55);
  // LE GRAND FORUM, À LA MIGRATION : une halle qui tenait un des îlots gagnés ne part pas
  // au bout de la ville (seuls les îlots neufs y sont libres) — elle reste au cœur, au plus
  // près du forum (le premier îlot de l'ordre, pas le rang de sa zone : celui-ci a grandi
  // avec la ville depuis sa pose), à l'angle d'un îlot de MAISONS : les maisons de son
  // emprise sont relogées (`forumClaim`), jamais un autre monument ni un atelier.
  const DEC_RE = /:dec_/;
  const ousted = new Set();
  if (forumGrew) for (const h of o.demand.halls) if (gfAll.includes(memHalls[h.key])) ousted.add(h.key);
  // Un carré sz × sz de l'îlot où rien d'autre qu'une maison ne tient (les ateliers sont
  // semés dans presque tous les îlots : c'est l'emprise de la halle qui compte).
  const decFits = (q, sz) => {
    const ok = (x, y) => !(hold && hold(x, y)) && !(o.isHeld && o.isHeld(x, y) && !DEC_RE.test((o.heldOwner && o.heldOwner(x, y)) || ""));
    const inQ = new Set(q.cells.map((c) => c.x + "," + c.y));
    for (let gy = q.y0; gy + sz - 1 <= q.y1; gy += 1) for (let gx = q.x0; gx + sz - 1 <= q.x1; gx += 1) {
      let all = true;
      for (let dy = 0; dy < sz && all; dy += 1) for (let dx = 0; dx < sz && all; dx += 1) all = inQ.has((gx + dx) + "," + (gy + dy)) && ok(gx + dx, gy + dy);
      if (all) return true;
    }
    return false;
  };
  for (const h of o.demand.halls) {
    if (hallBlock.has(h.key)) continue;
    let b = null;
    const free = ousted.has(h.key) ? (q) => decFits(q, Math.min(h.size || 1, q.x1 - q.x0 + 1, q.y1 - q.y0 + 1)) : (q) => !heldIn(q);
    // Départ : le rang de sa zone, ou le dernier îlot si l'ordre est plus court.
    const r0 = ousted.has(h.key) ? 1 : order.at(startOf(h.zone)) ? startOf(h.zone) : order.produced.length - 1;
    for (let r = r0, q; !b && (q = order.at(r)); r += 1) {
      if (!role.has(bkey(q)) && q.cells.length >= 9 && free(q) && !deferred(q)) b = q;
    }
    if (!b) continue;
    role.set(bkey(b), { kind: "hall", key: h.key, size: h.size || 1, ousted: ousted.has(h.key) });
    hallBlock.set(h.key, b);
    memHalls[h.key] = bkey(b);
  }

  // ── L'AIR DES ÎLOTS ─────────────────────────────────────────────────────
  // Raph 2026-10-04 : « ça ne respire pas beaucoup maintenant, tous les îlots sont
  // complets ». Un îlot de maisons laisse quelques lots de bord en JARDIN — un angle,
  // un angle en L, deux lots au milieu d'un côté, ou deux angles opposés (motif tiré
  // par îlot, stable). Les rangées s'y interrompent (bouts de rangée à découvert), les
  // carrefours s'ouvrent. La ville ouvre d'autant plus d'îlots pour loger les mêmes
  // maisons (capOf les décompte). Jamais un lot déjà TENU par un bâtiment : une
  // partie en cours ne voit rien bouger chez elle.
  const airOf = new Map();                              // "i:j" → Set("x,y")
  const airSet = (b) => {
    const k = bkey(b);
    if (airOf.has(k)) return airOf.get(k);
    const out = new Set();
    airOf.set(k, out);
    if (!ILOT_AIR.on || role.has(k) || b.lots.length < 8) return out;
    const isLot = new Map(b.lots.map((l) => [l.gx + "," + l.gy, l]));
    const free = (x, y) => { const l = isLot.get(x + "," + y); return l && !(o.isHeld && o.isHeld(x, y)); };
    const corners = b.lots.filter((l) => l.faces.length >= 2 || ((l.gx === b.x0 || l.gx === b.x1) && (l.gy === b.y0 || l.gy === b.y1)));
    const add = (x, y) => { if (free(x, y)) out.add(x + "," + y); };
    const motif = (h) => {
      const m = h % 4;
      if (m === 0 || m === 1 || m === 3) {
        if (!corners.length) return;
        const c = corners[(h >>> 3) % corners.length];
        add(c.gx, c.gy);
        if (m === 1) {                                  // angle en L : ses deux voisins de bord
          const sx = c.gx === b.x0 ? 1 : -1, sy = c.gy === b.y0 ? 1 : -1;
          add(c.gx + sx, c.gy); add(c.gx, c.gy + sy);
        } else if (m === 3) {                           // l'angle opposé
          const ox = c.gx === b.x0 ? b.x1 : b.x0, oy = c.gy === b.y0 ? b.y1 : b.y0;
          add(ox, oy);
        }
      } else {                                          // deux lots au milieu d'un côté
        const side = (h >>> 3) % 4, mx = Math.floor((b.x0 + b.x1) / 2), my = Math.floor((b.y0 + b.y1) / 2);
        if (side === 0) { add(mx, b.y0); add(mx + 1, b.y0); }
        else if (side === 1) { add(mx, b.y1); add(mx + 1, b.y1); }
        else if (side === 2) { add(b.x0, my); add(b.x0, my + 1); }
        else { add(b.x1, my); add(b.x1, my + 1); }
      }
    };
    const n = (ILOT_AIR.motifs | 0) + (b.lots.length > 14 ? 1 : 0);   // îlot long : une de plus
    for (let r = 0; r < n; r += 1) motif(hash("air" + (r ? r + 1 : "") + ":" + k));
    return out;
  };

  // ── Combien d'îlots ouvrir ───────────────────────────────────────────────
  // Les mémorisés d'abord, puis l'ordre, jusqu'à loger la demande ET atteindre le
  // forum et chaque halle. Une place de quartier naît tous les ILOT_PLAZA_EVERY
  // îlots OUVERTS (compte stable : l'ouverture est mémorisée).
  const holdLots = (b) => { if (!hold) return 0; const air = airSet(b); let n = 0; for (const l of b.lots) if (hold(l.gx, l.gy) && !air.has(l.gx + "," + l.gy)) n += 1; return n; };
  const capOf = (b) => { const r = role.get(bkey(b)); return !r ? b.lots.length - airSet(b).size - holdLots(b) : r.kind === "hall" ? Math.max(0, b.lots.length - 2 * r.size - holdLots(b)) : 0; };
  let need = o.demand.lots + LOT_MARGIN;
  for (const b of opened) need -= capOf(b);
  let maxRole = -1;
  for (const [k, r] of role) {
    if (!(r.kind === "hall" || r.plazaKind === "centrale") || openedSet.has(k)) continue;
    const rb = blockByKey(k);
    if (rb) maxRole = Math.max(maxRole, rb.rank);
  }
  for (let r = 0, b; (b = order.at(r)); r += 1) {
    const k = bkey(b);
    if (openedSet.has(k)) continue;
    if (need <= 0 && b.rank > maxRole) break;
    if (deferred(b)) continue;
    let sq = null;
    if (!role.has(k) && full4(b) && !heldIn(b) && opened.length % ILOT_PLAZA_EVERY === ILOT_PLAZA_EVERY / 2) {
      const kind = PLAZA_KINDS[Math.floor(opened.length / ILOT_PLAZA_EVERY) % PLAZA_KINDS.length];
      role.set(k, { kind: "plaza", plazaKind: kind });
      if (kind === "jardin") sq = grandSquareAt(b);
    }
    openB(b);
    need -= capOf(b);
    if (sq) {                                           // ses compagnons s'ouvrent avec lui
      for (const q of sq.mates) { role.set(bkey(q), { kind: "plaza", plazaKind: "jardin" }); openB(q); }
      groups.push({ keys: sq.keys, x0: sq.x0, y0: sq.y0, x1: sq.x1, y1: sq.y1 });
    }
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
    const inB = new Set(b.cells.filter((q) => !(hold && hold(q.x, q.y))).map((q) => q.x + "," + q.y));
    // Une halle qui GRANDIT (palier d'achats) ne chasse pas les maisons de son
    // îlot : si la taille neuve mord une case tenue par un autre, elle garde la
    // plus grande taille qui tient.
    // (Une halle chassée par le grand forum, elle, prend la place de maisons : cf. `ousted`.)
    const mine = (x, y) => { const ow = o.heldOwner ? o.heldOwner(x, y) : null; return !ow || ow === r.key || (!!r.ousted && DEC_RE.test(ow)); };
    const fits = (gx, gy, sz) => { for (let dy = 0; dy < sz; dy += 1) for (let dx = 0; dx < sz; dx += 1) if (!inB.has((gx + dx) + "," + (gy + dy)) || !mine(gx + dx, gy + dy)) return false; return true; };
    let at = null;
    for (let sz = Math.min(r.size, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1); sz >= 1 && !at; sz -= 1) {
      for (let gy = b.y0; gy + sz - 1 <= b.y1 && !at; gy += 1) for (let gx = b.x0; gx + sz - 1 <= b.x1 && !at; gx += 1) if (fits(gx, gy, sz)) at = { gx, gy, size: sz, block: b };
    }
    if (!at) continue;
    for (let dy = 0; dy < at.size; dy += 1) for (let dx = 0; dx < at.size; dx += 1) {
      const x = at.gx + dx, y = at.gy + dy;
      lotTaken.add(x + "," + y);
      if (r.ousted && o.isHeld && o.isHeld(x, y) && (!o.heldOwner || o.heldOwner(x, y) !== r.key)) forumClaim.push(x + "," + y);
    }
    hallAt.set(r.key, at);
  }
  const lotAt = new Map();
  const onLawn = (q) => !!hold && hold(q.gx, q.gy);     // pelouse de l'échangeur
  for (const b of houseBlocks) for (const l of b.lots) if (!airSet(b).has(l.gx + "," + l.gy) && !onLawn(l)) lotAt.set(l.gx + "," + l.gy, { l, b });
  const courtOf = new Set();
  for (const b of houseBlocks) for (const c of b.court) if (!onLawn(c)) courtOf.add(c.gx + "," + c.gy);
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
  const lots = [], lotFace = new Map(), air = [];
  for (const b of houseBlocks) for (const l of b.lots) {
    const e = { gx: l.gx, gy: l.gy, faces: l.faces, block: bkey(b), long: isLong(b) };
    lotFace.set(l.gx + "," + l.gy, e);
    if (airSet(b).has(l.gx + "," + l.gy)) air.push({ gx: l.gx, gy: l.gy });
    else if (!lotTaken.has(l.gx + "," + l.gy) && !onLawn(l)) lots.push(e);
  }
  const courts = [];
  for (const b of houseBlocks) for (const c of b.court) if (!lotTaken.has(c.gx + "," + c.gy) && !onLawn(c)) courts.push(c);

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
  // Les rues INTÉRIEURES d'une grande place (au forum, le decumanus et la rue qui
  // séparait ses îlots) deviennent la place : elles ne bordent que ses îlots.
  const groupOf = new Map();                            // "i:j" → grande place
  for (const g of groups) {
    g.cells = [];
    for (let y = g.y0; y <= g.y1; y += 1) for (let x = g.x0; x <= g.x1; x += 1) {
      g.cells.push({ x, y });
      streets.delete(x + "," + y);
    }
    for (const k of g.keys) groupOf.set(k, g);
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
    // Une grande place : UNE place (son rectangle, rues intérieures comprises), décrite
    // au rang de son premier îlot ouvert.
    const g = r.kind === "plaza" ? groupOf.get(bkey(b)) : null;
    if (g) {
      if (g.done) continue;
      g.done = true;
      const { x0, y0, x1, y1 } = g, w = x1 - x0 + 1, h = y1 - y0 + 1;
      plazas.push({ block: { cells: g.cells, x0, y0, x1, y1 }, kind: r.plazaKind, gx: x0 + Math.floor(w / 2), gy: y0 + Math.floor(h / 2), size: Math.min(w, h), blocks: g.keys.slice() });
      continue;
    }
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    if (r.kind === "plaza") plazas.push({ block: b, kind: r.plazaKind, gx: b.x0 + Math.floor(w / 2), gy: b.y0 + Math.floor(h / 2), size: Math.min(w, h) });
    else if (hallAt.has(r.key)) halls.push({ key: r.key, ...hallAt.get(r.key) });
  }
  const memPlazas = {};
  for (const b of blocks) { const r = role.get(bkey(b)); if (r && r.kind === "plaza") memPlazas[bkey(b)] = r.plazaKind; }
  const memOut = { blocks: blocks.map(bkey), plazas: memPlazas, halls: memHalls, annexes: memAnnex };
  for (const k of Object.keys(memOut.halls)) if (!openedSet.has(memOut.halls[k])) delete memOut.halls[k];
  // `order` : la suite complète, calculée seulement si quelqu'un la lit.
  // `forumClaim` : cases tenues que le grand forum reprend (migration d'une fiche d'avant) —
  // leurs bâtiments sont à reloger (layout.js).
  return { grid, get order() { return order.all(); }, blocks, opened: openedSet, streets, plazas, halls, hallBlock, hallAt, annexAt, lots, lotFace, courts, air, memory: memOut, seed, forumClaim };
}
