// Entrées SYNTHÉTIQUES du générateur de routes (audit 2026-10-05, TEST-9) : roadGraph,
// roadDesserte et roadMaskRepair en avaient chacun leur copie (« harnais jumeau »).
// Aucun import : le banc de roadGraph reste isolé du reste de la carte.

// organicLimit synthétique : un disque de rayon R autour du cœur. Suffit pour
// éprouver le builder en isolation (connexité, déterminisme, monotonie, étendue).
export function diskLimit(core, R) {
  return (x, y, m = 0) => Math.hypot(x - core.x, y - core.y) <= R + m;
}

// Un jeu d'entrées déterministe pour un archétype et une bande d'ère. Les ancres sont
// CUMULATIVES (band 0..eraBand) comme dans cityPlan.buildAnchors, pour pouvoir tester
// la croissance monotone. `seed` donne un GRAIN (les ancres tournent) pour balayer des
// géométries variées ; null = la géométrie de référence (graine du réseau 0xC0FFEE).
// `withRiver` : bande d'eau horizontale au sud du cœur, dans la portée du disque.
export function makeRoadInputs(archetype, eraBand, seed = null, { R = 22, withRiver = false } = {}) {
  const N = 64;
  const core = { x: 32, y: 26 };
  const grain = seed ?? 0;
  const anchors = [];
  for (let band = 0; band <= eraBand; band += 1) {
    const n = band === 0 ? 1 : band <= 2 ? 2 : 3;
    for (let i = 0; i < n; i += 1) {
      const ang = (anchors.length * 1.7 + grain * 0.61) % (Math.PI * 2);
      const dist = R * (0.4 + 0.12 * (anchors.length % 4));
      anchors.push({
        label: `${band}-${i}`, band,
        gx: Math.round(core.x + Math.cos(ang) * dist),
        gy: Math.round(core.y + Math.sin(ang) * dist),
        r: 3.5, strength: 1,
      });
    }
  }
  const riverSet = new Set();
  if (withRiver) for (let x = 0; x < N; x += 1) for (let y = 40; y <= 42; y += 1) riverSet.add(x + "," + y);
  return {
    plan: { archetype, core, reachBase: R, anchors, plazas: [], chaos: 0, order: 1 },
    seed: seed ?? 0xC0FFEE,
    counts: { eraBand, infraRings: Math.min(4, eraBand), urbanTier: eraBand * 2 },
    ageCfg: { roadRanks: { main: eraBand >= 1, avenue: eraBand >= 2, secondary: true, path: true } },
    N, riverSet, bankSet: new Set(), riverBridgeX: core.x + 4,
    organicLimit: diskLimit(core, R),
  };
}
