// Rivage de galets/sable des îles — garde de RÉGLAGE.
//
// Raph, 2026-07-30 : « il faut générer une plage, aussi autour de l'île de
// l'aiguille », puis « le contour n'est pas bien fait, on veut un joli contour
// identique ». Le contour est un TRAIT le long de l'ellipse de l'île, d'épaisseur
// constante (`drawIsoIslandShore`) : il n'y a plus de règle par cellule à tester,
// et son aspect se juge à l'œil.
//
// Ce qui reste testable est le seul chiffre que je me suis trompé DEUX FOIS :
// la largeur. 1,3 tuile puis 0,75 paraissaient modestes dans l'absolu, mais
// l'Aiguille ne fait que 2 × ry = 4,8 tuiles de LARGE — à 1,3 le rivage en
// mangeait la moitié et se lisait comme une allée de gravier, pas comme une berge.
// Une largeur de rivage se juge au RAPPORT à l'objet qu'elle borde.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BEACH } from "../iso/isoGroundTiles.js";
import { CM } from "../layout.js";
import { isBeachBankCell, beachZone } from "../iso/isoBeachCells.js";

// Le masque du quai est posé par le test (CM.quayGate) : son calcul réel est coupé.
vi.mock("../quaysAndRiot.js", async (importOriginal) => ({ ...(await importOriginal()), ensureQuayGate: () => {} }));

// L'Aiguille Céleste telle que layout.js la construit (rx 7,6 / ry 2,4).
const AIGUILLE_RY = 2.4;

describe("réglage du rivage d'île", () => {
  it("reste nettement plus étroit que la demi-largeur de l'île", () => {
    // À ry/2 le sable et l'herbe se partagent l'île moitié-moitié ; au-delà, il
    // n'y a plus d'île sous la plage. On exige une vraie marge.
    expect(BEACH.islandW).toBeLessThan(AIGUILLE_RY / 2);
    expect(BEACH.islandW).toBeGreaterThan(0.2);          // sous 0,2 tuile, invisible au zoom de jeu
  });

  it("la matière du rivage est l'une des deux cuites", () => {
    // `mat` nomme un kind du bake ET une clé de tuile : une valeur fantaisiste
    // ferait un sol en aplat gris sans que rien ne proteste.
    expect(['sand', 'shingle']).toContain(BEACH.mat);
  });

  it("la frange humide a un ton pour CHAQUE matière", () => {
    // Le ton suit la matière (du sable mouillé reste du sable) : une matière sans
    // entrée retomberait sur le gris des galets sous une plage de sable.
    expect(BEACH.wetTone.sand).toMatch(/^\d+,\d+,\d+$/);
    expect(BEACH.wetTone.shingle).toMatch(/^\d+,\d+,\d+$/);
    expect(BEACH.wetTone[BEACH.mat], `pas de ton humide pour « ${BEACH.mat} »`).toBeTruthy();
  });
});

// ── LA RÈGLE DE LA GRÈVE DE BERGE ────────────────────────────────────────────
// Sortie d'`isoGroundResolve` le 2026-08-24 vers `iso/isoBeachCells.js`. Le chantier qui
// l'a motivée (la pente de grève) a été clos par Raph le jour même, mais l'extraction
// reste : la règle et SES EXCLUSIONS forment un tout, et les avoir laissées séparées
// avait déjà produit un bug — une pente de sable posée devant un quartier pavé, parce
// que le second exemplaire de la règle n'avait gardé que le critère de proximité.
//
// ⚠ Garde de RÉSULTAT depuis l'audit 2026-10-05 (TEST-11) : elle cherchait les
// exclusions dans le TEXTE d'isoBeachCells (`L.roadSet.has(key)`…), au caractère près.
// On demande maintenant à la règle elle-même, sur un fleuve droit sans quai (le masque
// du quai est posé à la main : le calcul réel en poserait un au pied de la rue).
describe('grève de berge — la règle et ses exclusions ne se séparent pas', () => {
  const N = 41, K = (x, y) => x + ',' + y;
  const layout = (extra = {}) => ({
    river: { present: true, samples: Array.from({ length: N }, (_, i) => ({ x: i, y: 20, hw: 2 })) },
    roadSet: new Set(), tiles: [], ...extra,
  });
  let savedGate;
  beforeEach(() => {
    savedGate = CM.quayGate;
    CM.quayGate = { key: 'test-sans-quai', drawPlus: new Uint8Array(N), drawMinus: new Uint8Array(N) };
  });
  afterEach(() => { CM.quayGate = savedGate; });

  it('la bande de grève longe la rive, et ses exclusions vivent AVEC la règle', () => {
    // La rangée de berge au nord du lit (centre à 2,5 tuiles de l'axe, bord d'eau à 2).
    const zone = beachZone(layout());
    const rangee = [10, 15, 20, 25].map((x) => [x, 17]);
    for (const [x, y] of rangee) expect(zone.has(K(x, y)), `berge ${K(x, y)} hors de la grève`).toBe(true);
    expect(zone.has(K(20, 5)), 'la grève ne monte pas à 15 tuiles du fleuve').toBe(false);
    const [rue, maison, port, libre] = rangee;
    const L = layout({
      roadSet: new Set([K(...rue)]),
      tiles: [
        { gx: maison[0], gy: maison[1], type: 'house', buildingId: 'houses' },
        { gx: port[0], gy: port[1], type: 'engine', buildingId: 'river_ports' },
      ],
    });
    expect(isBeachBankCell(L, ...rue), 'une rampe vers le quai reste une rampe').toBe(false);
    expect(isBeachBankCell(L, ...maison), 'le bâti garde son sol').toBe(false);
    expect(isBeachBankCell(L, ...port), 'le port est exempté du bâti').toBe(true);
    expect(isBeachBankCell(L, ...libre)).toBe(true);
  });

  // Un VRAI contrat entre deux fichiers : le sol cuit délègue la question à la règle
  // nommée, au lieu de la rejouer (le second exemplaire est le bug d'origine). Lu dans
  // le source, mais sans dépendre de sa mise en forme.
  it('le sol cuit ne rejoue plus le critère à la main', () => {
    const src = readFileSync(join(__dirname, '..', 'iso/isoGroundResolve.js'), 'utf8');
    expect(src).toMatch(/\bisBeachBankCell\s*\(/);
    expect(src).not.toMatch(/\bBEACH\s*\.\s*depth\b/);
  });
});
