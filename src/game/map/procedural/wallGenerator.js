/* ============================================================================
 * wallGenerator.js — Enceintes urbaines
 *   À partir de l'ère fortifiée (ageCfg.wallTier > 0), la ville s'entoure
 *   d'une muraille qui suit son contour organique de l'époque :
 *     - aux ères fortifiée/royale, l'enceinte englobe presque toute la ville ;
 *     - aux ères suivantes, la ville a débordé : la muraille délimite le
 *       "vieux centre" intra-muros, contraste voulu avec les faubourgs ;
 *     - portes là où les routes traversent, tours à intervalles réguliers,
 *       brèche naturelle au passage du fleuve.
 *   Sortie : { cells: [{gx,gy,kind:wall|gate|tower}], set, outline, gates } —
 *   le set sert à exclure les cellules de muraille du placement de bâtiments
 *   et d'arbres ; gates liste les vraies portes (peu nombreuses, nommées).
 * ============================================================================ */

import { rngFrom } from "./seedManager.js";

// Nom d'une porte selon sa position : proximité du fleuve d'abord, sinon
// point cardinal depuis le cœur de ville. Les doublons reçoivent un surnom.
const GATE_FALLBACKS = ["Porte des Marchands", "Porte des Pèlerins", "Porte du Guet", "Porte des Champs"];
function gateNameFor(angle, nearRiver, used) {
  if (nearRiver && !used.has("fleuve")) { used.add("fleuve"); return "Porte du Fleuve"; }
  const compass = [
    { id: "est", name: "Porte du Levant", a: 0 },
    { id: "sud", name: "Porte du Midi", a: Math.PI / 2 },
    { id: "ouest", name: "Porte du Couchant", a: Math.PI },
    { id: "nord", name: "Porte du Nord", a: -Math.PI / 2 }
  ];
  let best = null, bestD = Infinity;
  for (const c of compass) {
    let d = Math.abs(angle - c.a);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < bestD && !used.has(c.id)) { bestD = d; best = c; }
  }
  if (best) { used.add(best.id); return best.name; }
  return GATE_FALLBACKS[used.size % GATE_FALLBACKS.length];
}

export function generateWalls({
  plan, seed, counts, ageCfg, personality, N, reachBase,
  roadKey, roadMeta, riverSet, bankSet
}) {
  let tier = ageCfg.wallTier;
  if (personality.id === "militaire" && counts.eraBand >= 2) tier += 1;
  if (tier <= 0) return null;

  const rng = rngFrom(seed, "walls");
  // Le `reachBase` reçu est FIGÉ au moment de la construction (state.wallRadius) :
  // l'enceinte garde sa taille d'origine pendant que la ville grandit autour.
  const wallMul = 0.78 + rng() * 0.06;
  const towerEvery = 7 + Math.floor(rng() * 3);

  // Échantillonne le contour organique puis rasterise en cellules de grille.
  // `outline` garde les points NON arrondis : le rendu trace la muraille comme
  // une polyligne continue (les cellules rasterisées en diagonale ne se
  // touchent que par les coins — illisible à l'écran).
  const steps = 96;
  const pts = [];
  const outline = [];
  // Les esplanades sont sacrées : si le contour tombe sur l'emprise d'une
  // place (+marge), on pousse le point radialement vers l'extérieur jusqu'à
  // en sortir — la muraille CONTOURNE les places, elle ne les coupe jamais.
  const plazas = (plan.plazas || []);
  const onPlaza = (x, y) => {
    for (const p of plazas) {
      const half = p.size / 2 + 1.5;
      if (Math.abs(x - p.gx) <= half && Math.abs(y - p.gy) <= half) return true;
    }
    return false;
  };
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    let r = Math.max(4, plan.reachFor(reachBase, a) * wallMul);
    let fx = Math.max(1, Math.min(N - 2, plan.core.x + Math.cos(a) * r));
    let fy = Math.max(1, Math.min(N - 2, plan.core.y + Math.sin(a) * r));
    for (let guard = 0; guard < 12 && onPlaza(fx, fy); guard += 1) {
      r += 0.8;
      fx = Math.max(1, Math.min(N - 2, plan.core.x + Math.cos(a) * r));
      fy = Math.max(1, Math.min(N - 2, plan.core.y + Math.sin(a) * r));
    }
    outline.push({ x: fx, y: fy, water: riverSet.has(Math.round(fx) + "," + Math.round(fy)) || bankSet.has(Math.round(fx) + "," + Math.round(fy)) });
    pts.push({ x: Math.round(fx), y: Math.round(fy) });
  }

  const cellMap = new Map(); // key -> kind
  // Une vraie cité n'a que quelques portes : seuls les GRANDS axes en ouvrent
  // une. Les ruelles qui croisent l'enceinte restent murées (le mur prime).
  const gateCandidates = [];
  const addWallCell = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= N || gy >= N) return;
    if (onPlaza(gx, gy)) return;                       // jamais sur une place
    const k = gx + "," + gy;
    if (riverSet.has(k) || bankSet.has(k)) return;     // brèche au fleuve
    if (roadKey.has(k)) {
      const meta = roadMeta && roadMeta.get(k);
      const rank = meta ? meta.rank : "path";
      if (rank === "main" || rank === "avenue") {
        if (!cellMap.has(k)) { cellMap.set(k, "gate"); gateCandidates.push({ gx, gy, rank }); }
        return;
      }
      // Rue mineure : la muraille passe par-dessus, pas d'ouverture.
    }
    if (!cellMap.has(k)) cellMap.set(k, "wall");
  };

  // Bresenham entre points consécutifs du contour.
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    let x = a.x, y = a.y;
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
    let err = dx - dy;
    for (let guard = 0; guard < N * 2; guard += 1) {
      addWallCell(x, y);
      if (x === b.x && y === b.y) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  // ── Sélection des portes : groupe les candidats contigus en sites, garde
  //    au plus 4 sites bien répartis en angle, nomme chacun. ───────────────
  const siteOf = new Map(); // key -> site index
  const sites = [];
  for (const g of gateCandidates) {
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => siteOf.get((g.gx + dx) + "," + (g.gy + dy)))
      .find((si) => si !== undefined);
    const idx2 = adj !== undefined ? adj : (sites.push({ cells: [], rank: g.rank }) - 1);
    sites[idx2].cells.push(g);
    if (g.rank === "main") sites[idx2].rank = "main";
    siteOf.set(g.gx + "," + g.gy, idx2);
  }
  for (const site of sites) {
    let sx = 0, sy = 0;
    for (const c of site.cells) { sx += c.gx; sy += c.gy; }
    site.gx = sx / site.cells.length;
    site.gy = sy / site.cells.length;
    site.angle = Math.atan2(site.gy - plan.core.y, site.gx - plan.core.x);
    site.nearRiver = site.cells.some((c) =>
      [[0, 1], [0, 2], [0, -1], [0, -2], [1, 0], [-1, 0]].some(([dx, dy]) => riverSet.has((c.gx + dx) + "," + (c.gy + dy)) || bankSet.has((c.gx + dx) + "," + (c.gy + dy))));
  }
  // Tri : grands axes d'abord, puis répartition angulaire (écart min ~60°).
  sites.sort((a, b) => (b.rank === "main") - (a.rank === "main") || b.cells.length - a.cells.length);
  const kept = [];
  for (const site of sites) {
    if (kept.length >= 4) break;
    const tooClose = kept.some((k2) => {
      let d = Math.abs(k2.angle - site.angle);
      if (d > Math.PI) d = Math.PI * 2 - d;
      return d < Math.PI / 3;
    });
    if (tooClose && kept.length >= 2) continue;
    kept.push(site);
  }
  const usedNames = new Set();
  const gates = kept.map((site) => ({
    gx: Math.round(site.gx), gy: Math.round(site.gy),
    angle: site.angle,
    name: gateNameFor(site.angle, site.nearRiver, usedNames)
  }));
  const keptCellKeys = new Set();
  for (const site of kept) for (const c of site.cells) keptCellKeys.add(c.gx + "," + c.gy);
  // Les candidats non retenus redeviennent du mur plein.
  for (const [k, kind] of cellMap) {
    if (kind === "gate" && !keptCellKeys.has(k)) cellMap.set(k, "wall");
  }

  // Tours : à intervalles réguliers le long du périmètre (jamais sur une porte).
  const cells = [];
  let idx = 0;
  for (const [k, kind] of cellMap) {
    const comma = k.indexOf(",");
    const gx = +k.slice(0, comma), gy = +k.slice(comma + 1);
    const finalKind = kind === "wall" && idx % towerEvery === 0 ? "tower" : kind;
    cells.push({ gx, gy, kind: finalKind });
    idx += 1;
  }

  const set = new Set(cells.filter((c) => c.kind !== "gate").map((c) => c.gx + "," + c.gy));
  return { cells, set, tier, outline, gates };
}
