// LES ROUTES SILLONNANTES — les invariants du tracé au coût de pente.
//
// windingPath (roadGraph.js) remplace le staircase des tracés longs quand un
// champ de terrain est fourni : ces gardes verrouillent ce que le lot promet —
// même réseau à chaque exécution, contournement des massifs, et l'ABSENCE de
// champ qui rend le staircase historique (contrat des autres tests du dossier).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateRoadsGraph } from "../roadGraph.js";
import { TERRAIN } from "../terrainField.js";

// ⚠ LE RELIEF EST ÉTEINT PAR DÉFAUT depuis le 2026-08-24 (décision de Raph, cf.
// le bandeau de TERRAIN) : ces gardes vérifient un MÉCANISME devenu opt-in, elles
// doivent donc l'armer elles-mêmes. Sans ça elles ne testaient plus rien — elles
// passaient par le repli `staircase` en croyant mesurer le sillonnement.
let ampAvant;
beforeEach(() => { ampAvant = TERRAIN.amp; TERRAIN.amp = 1; });
afterEach(() => { TERRAIN.amp = ampAvant; });

const diskLimit = (core, R) => (x, y, m = 0) => Math.hypot(x - core.x, y - core.y) <= R + m;

// Entrées minimales : un cœur, deux ancres de part et d'autre d'un MASSIF-MUR
// synthétique vertical (une crête gaussienne sur la colonne 40, percée d'un COL
// au sud) — le tracé au cordeau grimpe à ~10 U, le col plafonne à ~2 U.
function makeInputs(fieldAt) {
  const N = 72;
  const core = { x: 20, y: 30 };
  const anchors = [
    { label: "est", band: 0, gx: 60, gy: 30, r: 3.5, strength: 1 },
  ];
  return {
    plan: { archetype: "crossroads", core, reachBase: 26, anchors, plazas: [], chaos: 0, order: 1 },
    seed: 0xBEEF01, counts: { eraBand: 1, eraIndex: 1, urbanTier: 1 },
    ageCfg: { roadRanks: { main: true } }, N,
    riverSet: new Set(), bankSet: new Set(), riverBridgeX: 10,
    organicLimit: diskLimit(core, 40), bridgeAvoid: null,
    fieldAt,
  };
}

// La crête : haute partout sur x∈[38..42], sauf le col en y∈[44..50].
const ridgeField = (gx, gy) => {
  const inRidge = Math.exp(-((gx - 40) * (gx - 40)) / 8);
  const colK = gy > 44 && gy < 50 ? 0.15 : 1;
  return 10 * inRidge * colK;
};

const cellsOf = (out) => [...out.roadKey].sort().join(";");

describe("routes sillonnantes", () => {
  it("DÉTERMINISTE : deux exécutions, le même réseau cellule pour cellule", () => {
    const a = generateRoadsGraph(makeInputs(ridgeField));
    const b = generateRoadsGraph(makeInputs(ridgeField));
    expect(cellsOf(a)).toBe(cellsOf(b));
  });

  it("CONTOURNE : le connecteur passe par le col, pas par la crête", () => {
    const out = generateRoadsGraph(makeInputs(ridgeField));
    // Altitude maximale foulée par le réseau : elle doit rester bien sous la
    // crête (10 U) — le col est à 1,5 U. Un peu de marge : les axes identitaires
    // du crossroads (est-ouest par le cœur) mordent le pied de crête.
    let worst = 0;
    for (const k of out.roadKey) {
      const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      const f = ridgeField(x + 0.5, y + 0.5);
      if (f > worst) worst = f;
    }
    expect(worst).toBeLessThan(6);
    // Et le réseau franchit bien la crête (des cellules de part et d'autre).
    let west = 0, east = 0;
    for (const k of out.roadKey) {
      const x = +k.slice(0, k.indexOf(","));
      if (x < 36) west += 1;
      if (x > 44) east += 1;
    }
    expect(west).toBeGreaterThan(10);
    expect(east).toBeGreaterThan(5);
  });

  it("terrain COUPÉ (amp 0) : le staircase historique reprend, RNG compris", () => {
    const was = TERRAIN.amp;
    try {
      const withField = (() => { TERRAIN.amp = 1; return cellsOf(generateRoadsGraph(makeInputs(ridgeField))); })();
      TERRAIN.amp = 0;
      const cut = cellsOf(generateRoadsGraph(makeInputs(ridgeField)));
      const absent = cellsOf(generateRoadsGraph(makeInputs(null)));
      // amp 0 == champ absent (le repli staircase, mêmes tirages RNG)…
      expect(cut).toBe(absent);
      // …et le champ vivant produit bien un AUTRE tracé.
      expect(withField).not.toBe(cut);
    } finally {
      TERRAIN.amp = was;
    }
  });
});
