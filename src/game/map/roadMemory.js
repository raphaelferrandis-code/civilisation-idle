/* ============================================================================
 * roadMemory.js — LA MÉMOIRE DU RÉSEAU (docs/PLAN-ROUTES.md, lot L2)
 *
 * Avant ce lot, `computeCityLayout` redessinait toutes les rues à chaque achat :
 * échafaudage → placement → dissolution → desserte retracée bâtiment par
 * bâtiment. Mesuré sur une partie complète : à chaque changement d'ère, 40 à
 * 60 % des rues d'un village disparaissaient pour renaître ailleurs, et jusqu'à
 * 62 % sur un simple achat. La ville n'avait aucune mémoire.
 *
 * Désormais le réseau final de chaque calcul est ÉCRIT dans la sauvegarde, et
 * le calcul suivant part de lui :
 *   R1 — une rue mémorisée ne disparaît plus (seuls une merveille posée dessus
 *        ou le fleuve qui la recouvre l'effacent) ; son rang ne fait que monter ;
 *   R2 — les rues nouvelles sont celles de la desserte, qui part toujours du
 *        réseau existant ;
 *   R4 — chaque cellule garde la bande où elle est NÉE et celle où elle a été
 *        PAVÉE pour la dernière fois : le rendu lit sa matière à elle.
 *
 * Repère : le centre de grille (cx, cy), le même que les slots de bâtiments —
 * la grille grandit autour de lui, les décalages restent valides.
 *
 * Format compact (une ville de bourg compte ~500 cellules) : un tableau plat
 * [dx, dy, code, dx, dy, code, …], code = rang (3 bits) | h (bit 3) | v (bit 4)
 * | née (bits 5-8) | pavée (bits 9-12). Bandes 0-15 : large pour les 10 bandes.
 * ========================================================================== */

// `lastBand` : dernière bande couverte par la mémoire. Le lot L2 couvrait le
// campement, le village et le bourg (bandes 0-2) ; le lot L5 (cités, 2026-10-01,
// « fais toutes les ères ») l'étend à TOUTES les bandes. Molette :
// `__roadMemory({ on: false })` = ancien calcul partout (A/B), puis
// `__cityRecompute()` ; `{ lastBand: 2 }` rejoue le pilote seul.
export const ROAD_MEMORY = { on: true, lastBand: 9 };

const RANKS = ["path", "secondary", "avenue", "main", "plaza"];
const RANK_IDX = { path: 0, secondary: 1, avenue: 2, main: 3, plaza: 4 };
const MEMORY_MAX_CELLS = 40000;

export function roadMemoryActive(eraBand) {
  return !!ROAD_MEMORY.on && (eraBand | 0) <= ROAD_MEMORY.lastBand;
}

export function rankAbove(a, b) {
  return (RANK_IDX[a] || 0) > (RANK_IDX[b] || 0);
}

// Décode la mémoire en cellules ABSOLUES de la grille courante. null si la
// mémoire appartient à une autre ville (seed) ou est absente.
export function decodeRoadMemory(mem, seed, cx, cy) {
  if (!mem || typeof mem !== "object" || (mem.seed >>> 0) !== (seed >>> 0)) return null;
  const a = mem.cells;
  if (!Array.isArray(a)) return null;
  const out = new Map();
  for (let i = 0; i + 2 < a.length; i += 3) {
    const code = a[i + 2] | 0;
    out.set((cx + (a[i] | 0)) + "," + (cy + (a[i + 1] | 0)), {
      rank: RANKS[code & 7] || "path",
      h: !!(code & 8),
      v: !!(code & 16),
      born: (code >> 5) & 15,
      pave: (code >> 9) & 15,
    });
  }
  return out;
}

// `cells` : itérable de { gx, gy, rank, h, v, born, pave } en coordonnées
// absolues. `extra` : compteurs à faire suivre (chantiers déjà consommés).
export function encodeRoadMemory(cells, seed, cx, cy, extra = {}) {
  const flat = [];
  for (const c of cells) {
    if (flat.length >= MEMORY_MAX_CELLS * 3) break;
    const code = (RANK_IDX[c.rank] || 0)
      | (c.h ? 8 : 0) | (c.v ? 16 : 0)
      | ((Math.max(0, Math.min(15, c.born | 0))) << 5)
      | ((Math.max(0, Math.min(15, c.pave | 0))) << 9);
    flat.push(c.gx - cx, c.gy - cy, code);
  }
  return {
    seed: seed >>> 0,
    cells: flat,
    // Chantiers de voirie déjà RÉALISÉS sur ce réseau : la carte rejouait tous les
    // chantiers payés à chaque calcul ; avec la mémoire, un chantier appliqué l'est
    // pour de bon — ne restent à rejouer que les nouveaux (cf. layout).
    works: Math.max(0, extra.works | 0),
    widened: Math.max(0, extra.widened | 0),
    // Places ouvertes (lot L3) : mémorisées comme les rues, elles ne glissent plus.
    plazas: normalizePlazas(extra.plazas),
  };
}

const PLAZA_KINDS = new Set(["centrale", "marche", "parvis", "jardin"]);
function normalizePlazas(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw.slice(0, 16)) {
    if (!p || typeof p !== "object") continue;
    const dx = Number(p.dx), dy = Number(p.dy), size = Number(p.size);
    if (![dx, dy, size].every(Number.isFinite) || Math.abs(dx) > 400 || Math.abs(dy) > 400) continue;
    out.push({ dx: Math.round(dx), dy: Math.round(dy), size: Math.max(2, Math.min(8, Math.round(size))),
      kind: PLAZA_KINDS.has(p.kind) ? p.kind : "centrale" });
  }
  return out;
}

// Sauvegarde : borne et filtre une mémoire lue (save abîmée → null, la ville
// repart de son calcul courant, comme une save d'avant ce lot).
export function normalizeRoadMemory(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const seed = Number(raw.seed);
  if (!Number.isFinite(seed) || !Array.isArray(raw.cells)) return null;
  const a = raw.cells;
  const n = Math.min(a.length - (a.length % 3), MEMORY_MAX_CELLS * 3);
  const cells = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = Number(a[i]);
    if (!Number.isFinite(v) || Math.abs(v) > 100000) return null;
    cells[i] = Math.trunc(v);
  }
  return {
    seed: seed >>> 0,
    cells,
    works: Number.isFinite(Number(raw.works)) ? Math.max(0, Math.floor(Number(raw.works))) : 0,
    widened: Number.isFinite(Number(raw.widened)) ? Math.max(0, Math.floor(Number(raw.widened))) : 0,
    plazas: normalizePlazas(raw.plazas),
  };
}

if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__roadMemory = (o) => {
    if (o && typeof o === "object") Object.assign(ROAD_MEMORY, o);
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return { ...ROAD_MEMORY };
  };
}
