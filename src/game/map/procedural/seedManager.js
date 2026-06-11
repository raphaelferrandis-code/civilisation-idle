/* ============================================================================
 * seedManager.js — ProceduralSeedManager
 *   Source unique d'aléatoire déterministe pour la génération de la ville.
 *   Chaque partie (et chaque cycle après effondrement) reçoit une seed propre,
 *   persistée dans state.mapSeed : deux civilisations ne partagent jamais le
 *   même plan, mais une même sauvegarde reste stable d'un rechargement à l'autre.
 * ============================================================================ */

// FNV-1a 32 bits — même famille de hash que cmHash (layout.js), gardé local
// pour que ce module reste sans dépendance.
export function hashString(text) {
  let h = 2166136261;
  const str = String(text);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mélange une seed numérique avec un label de sous-système ("roads", "plan"...)
// pour dériver des flux indépendants sans corrélation visible.
export function mixSeed(seed, label) {
  return hashString(`${seed >>> 0}:${label}`);
}

// PRNG mulberry32 (même algo que seededRng de core/utils.js) — recopié ici pour
// garder le générateur de map utilisable hors contexte jeu (tests, Node).
export function rngFrom(seed, label = "") {
  let t = (label ? mixSeed(seed, label) : seed) >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Tire une nouvelle seed de ville (non déterministe : appelé à la création
// d'une partie ou après un effondrement, jamais pendant la génération).
export function newCitySeed() {
  const t = Date.now() >>> 0;
  const r = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return (hashString(`${t}:${r}`) || 1) >>> 0;
}

// Garantit une seed persistée sur l'état. Les vieilles sauvegardes (sans
// mapSeed) en reçoivent une dérivée de leur rivière existante quand c'est
// possible, pour minimiser le bouleversement visuel au premier chargement.
export function ensureMapSeed(s) {
  if (Number.isFinite(s.mapSeed) && s.mapSeed > 0) return s.mapSeed >>> 0;
  if (Array.isArray(s.riverWP) && s.riverWP.length) {
    s.mapSeed = (hashString("legacy:" + s.riverWP.map((p) => Math.round((p.dy || 0) * 10)).join(",")) || 1) >>> 0;
  } else {
    s.mapSeed = newCitySeed();
  }
  return s.mapSeed;
}

// Entier seedé dans [min, max] inclus.
export function seededInt(seed, label, min, max) {
  const r = rngFrom(seed, label)();
  return min + Math.floor(r * (max - min + 1));
}

// Choix pondéré déterministe dans une liste [{value, weight}].
export function seededWeightedPick(seed, label, entries) {
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  if (total <= 0) return entries[0] ? entries[0].value : null;
  let roll = rngFrom(seed, label)() * total;
  for (const e of entries) {
    roll -= Math.max(0, e.weight);
    if (roll <= 0) return e.value;
  }
  return entries[entries.length - 1].value;
}
