/* ============================================================================
 * cityQuarters.js — LA STRUCTURE DE LA VILLE (docs/PLAN-ROUTES.md, lots L6-L8)
 *
 * Retour de Raph sur le premier bourg à mémoire (2026-10-01) : « un poil trop
 * dense », « il faut une vraie grande artère principale, la place doit se
 * décaler », « les places de quartier doivent trouver leur place ». Ses choix :
 * places RÉSERVÉES à la fondation du quartier, et une ville aérée par des
 * JARDINS entre les maisons et une CEINTURE VERTE entre les quartiers.
 *
 * Ce module ne fait que de la géométrie pure (aucun état, aucun import de
 * layout) : layout.js lui passe ses prédicats et applique le résultat.
 *
 *   ARTÈRE  — elle prolonge le pont tout droit à travers la ville, sur les deux
 *             rives ; les maisons la bordent des deux côtés (une bande réservée à
 *             côté d'elle attirait les sentiers en parallèle — retirée).
 *   PLACE   — la place centrale se pose CONTRE l'artère, côté ouest ; le feu du
 *             campement brûle en son centre, la place du bourg y naît.
 *   QUARTIERS — chaque ancre de quartier (cityPlan) est FONDÉE une fois, au bord
 *             de la ville du moment, dans sa direction ; sa position et sa
 *             nature sont figées (avant : elles dérivaient vers l'extérieur et
 *             changeaient de nature d'une ère à l'autre). Son centre est réservé
 *             (un pré) et devient sa place quand l'ère la justifie.
 *   AÉRATION — des jardins en grappes entre les maisons et une bande verte sur
 *             la frontière entre deux quartiers (médiatrice de leurs centres).
 * ========================================================================== */

// Réglages. Molette : `__cityQuarters({ ... })` puis `__cityRecompute()`.
export const CITY_QUARTERS = {
  on: true,
  centralSize: 4,      // place centrale (plancher de buildPlazas)
  plazaSize: 4,        // place de quartier (marché, parvis, jardin)
  greenSize: 3,        // pré d'un quartier sans place
  siteGap: 3,          // cases libres minimales entre deux sites
  arteryMargin: 3,     // l'artère dépasse la lisière de la ville d'autant
  gardenShare: 0.3,    // part visée de jardins dans le tissu (bande ≥ 1)
  gardenScale: 4,      // taille des grappes de jardins (cellules)
  beltW: 1.6,          // largeur de la ceinture verte (écart des distances)
  beltMinD: 4,         // pas de ceinture à moins de tant d'un centre
  spread: 1.4,         // la ville occupe d'autant plus de terrain (grille, portée)
};

// AÉRATION PAR BANDE (lot L5). Le bourg (bandes 1-3) est l'âge des jardins ; la
// cité dense les remplace par des squares plus rares, la métropole par des
// parcs ponctuels. L'étalement suit le même déclin, et la grille ne RÉTRÉCIT
// jamais (cf. cityCore.maxN dans layout) : une baisse de spread se traduit par
// une ville qui se densifie dans une grille stable, pas par une grille qui recule.
export function gardenShareFor(band) {
  const b = band | 0;
  if (b <= 0) return 0;
  return b <= 3 ? CITY_QUARTERS.gardenShare : b === 4 ? 0.22 : b === 5 ? 0.18 : 0.14;
}
export function spreadFor(band) {
  const b = band | 0;
  if (b <= 0) return 1;
  return b <= 3 ? CITY_QUARTERS.spread : b <= 5 ? 1.25 : 1.15;
}
// L'artère devient boulevard à deux voies (terre-plein) à partir de cette bande ;
// au-delà de la bande 6 c'est l'autoroute (même géométrie, matière de l'ère).
export const ARTERY_TWIN_BAND = 5;

// Kind de quartier → place qui s'y ouvre, et bande d'ouverture. TOUT quartier a
// sa place au bourg (Raph : « il faut qu'elle trouve sa place ») ; les quatre
// sortes de place ont leur décor dessiné dès la bande 2 (iso/isoPlaza, KIND_KITS
// « medieval »). Militaire → parvis : la place d'armes, statue et braseros.
export const QUARTER_PLAZA = {
  marchand: { kind: "marche", band: 2 },
  agricole: { kind: "marche", band: 2 },     // marché aux grains
  religieux: { kind: "parvis", band: 2 },
  militaire: { kind: "parvis", band: 2 },    // place d'armes
  savant: { kind: "jardin", band: 2 },
  prestige: { kind: "jardin", band: 2 },
  habitat: { kind: "jardin", band: 2 },      // square de quartier
};

// Cellules d'un site, même convention que roadGraph.plaza : centre (gx, gy),
// de gx − floor(size/2) à gx − floor(size/2) + size − 1.
export function forSiteCells(site, fn) {
  const half = Math.floor(site.size / 2);
  for (let dx = -half; dx < site.size - half; dx += 1)
    for (let dy = -half; dy < site.size - half; dy += 1) fn(site.gx + dx, site.gy + dy);
}

// Le feu du campement au centre de la place (dans son carré 3×3 intérieur).
export function hearthOfSite(site) {
  return { gx: site.gx - 1, gy: site.gy - 1 };
}

// Site de la place centrale : contre l'artère (colonne ax), côté ouest, à la
// hauteur du cœur. `free(site)` dit si le site est posable (pas d'eau, pas de
// bâtiment tenu…). On longe l'artère vers le nord puis le sud, puis côté est.
export function centralSiteFor({ ax, coreY, size, free }) {
  const half = Math.floor(size / 2);
  const y0 = Math.round(coreY);
  // ouest : dernière cellule en ax − 1 ; est : première en ax + 2 (ax + 1 est la
  // voie réservée de l'artère).
  const sides = [ax - (size - half), ax + 2 + half];
  for (let d = 0; d <= 8; d += 1) {
    for (const gx of sides) {
      for (const gy of d === 0 ? [y0] : [y0 - d, y0 + d]) {
        const site = { gx, gy, size, kind: "centrale" };
        if (free(site)) return site;
      }
    }
  }
  return { gx: sides[0], gy: y0, size, kind: "centrale" };
}

// Lignes de l'artère : depuis chaque rive, la colonne `ax` jusqu'à la lisière
// (inCity) + marge. Renvoie les cellules de chaussée (axe vertical).
export function arteryCells({ ax, N, wet, inCity, margin }) {
  let top = -1, bottom = -1;
  for (let y = 0; y < N; y += 1) if (wet(ax, y)) { if (top < 0) top = y; bottom = y; }
  const out = [];
  const run = (y0, step) => {
    let tail = -1;
    for (let y = y0; y >= 0 && y < N; y += step) {
      if (wet(ax, y)) break;
      if (inCity(ax, y)) tail = margin;
      else if (tail-- <= 0) break;
      out.push({ gx: ax, gy: y });
    }
  };
  if (top < 0) {                       // pas de fleuve : une ligne entière bornée par la ville
    const mid = Math.floor(N / 2);
    run(mid, -1); run(mid + 1, 1);
  } else {
    run(top - 1, -1);
    run(bottom + 1, 1);
  }
  return out;
}

// FONDATION d'un quartier : on part de la position de l'ancre et on s'éloigne
// du cœur dans sa direction jusqu'au premier site libre — un quartier naît au
// bord de la ville du moment, là où il y a de la place.
export function foundSite({ anchor, core, size, free, maxR }) {
  const ang = Math.atan2(anchor.gy - core.y, anchor.gx - core.x);
  const r0 = Math.max(3, Math.hypot(anchor.gx - core.x, anchor.gy - core.y));
  // Rayons croissants depuis l'ancre, puis éventail de plus en plus ouvert : un
  // quartier se pose de préférence dans SA direction, sinon à côté.
  for (let r = Math.max(3, r0 - 2); r <= maxR; r += 1) {
    for (const da of [0, 0.18, -0.18, 0.36, -0.36, 0.6, -0.6, 0.9, -0.9]) {
      const site = {
        gx: Math.round(core.x + Math.cos(ang + da) * r),
        gy: Math.round(core.y + Math.sin(ang + da) * r),
        size,
      };
      if (free(site)) return site;
    }
  }
  return null;
}

// Bruit de valeur lissé (grappes de ~3 cellules), déterministe, ∈ [0, 1).
function hash01(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (seed | 0)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0;
  return ((h >>> 8) & 0xffff) / 65536;
}
export function gardenNoise(gx, gy, seed, scale = 3) {
  const x = gx / scale, y = gy / scale;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash01(x0, y0, seed), b = hash01(x0 + 1, y0, seed);
  const c = hash01(x0, y0 + 1, seed), d = hash01(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

// Ceinture verte : la cellule est sur la frontière entre ses deux centres de
// quartier les plus proches (écart des distances < w), loin de chacun.
export function onBelt(gx, gy, centers, w, minD) {
  if (centers.length < 2) return false;
  let d1 = Infinity, d2 = Infinity;
  for (const c of centers) {
    const d = Math.hypot(gx + 0.5 - c.x, gy + 0.5 - c.y);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d1 >= minD && d2 - d1 < w;
}

if (typeof window !== "undefined") {
  window.__cityQuarters = (o) => {
    if (o === false) CITY_QUARTERS.on = false;
    else if (o && typeof o === "object") Object.assign(CITY_QUARTERS, o);
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return { ...CITY_QUARTERS };
  };
}
