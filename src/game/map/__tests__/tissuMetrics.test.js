// La MESURE du tissu urbain (lot L0 de docs/PLAN-TISSU-URBAIN.md).
//
// Tout le chantier « micmacs de routes » se pilotera sur ces nombres : s'ils
// mentent, chaque lot suivant sera validé sur une illusion. Les attendus de ce
// fichier sont donc calculés À LA MAIN sur des grilles jouets dont on connaît la
// réponse (une grille 9×9 avec une rue toutes les deux cellules a 65 cellules de
// voirie sur 81, ça se compte sur les doigts), jamais repris de la sortie du
// code — sinon le test comparerait le calcul à lui-même.
import { describe, it, expect } from "vitest";
import { tissuMetrics, tissuReport } from "../tissuMetrics.js";
// Importé pour le contrôle négatif du compteur de clôtures : on éteint le VRAI module
// et on exige que le compte tombe à zéro.
import { FENCE } from "../fenceEdges.js";

// Grille jouet : sol de ville plein, rues là où `isRoad(gx, gy)` est vrai.
const grid = (N, isRoad, tiles = []) => {
  const urbanSet = new Set(), roadSet = new Set(), roadMap = new Map();
  for (let gy = 0; gy < N; gy += 1) {
    for (let gx = 0; gx < N; gx += 1) {
      const k = gx + "," + gy;
      urbanSet.add(k);
      if (isRoad(gx, gy)) {
        roadSet.add(k);
        roadMap.set(k, { gx, gy, rank: "secondary" });
      }
    }
  }
  return { gridN: N, urbanSet, roadSet, roadMap, tiles };
};

describe("mesure du tissu urbain", () => {
  // ── Le cas d'aujourd'hui : une rue toutes les deux cellules ────────────────
  // 9×9. Non-route = gx ET gy impairs = 4 × 4 = 16 cellules. Voirie = 81 − 16 = 65.
  // Chaque cellule libre est isolée : ses quatre voisines ont une coordonnée
  // devenue paire, donc sont des rues. 16 îlots d'UNE cellule.
  const fin = grid(9, (gx, gy) => gx % 2 === 0 || gy % 2 === 0);

  it("maille 2 : la voirie occupe 65 cellules sur 81, et tous les îlots font une cellule", () => {
    const m = tissuMetrics(fin);
    expect(m.cells).toBe(81);
    expect(m.road).toBe(65);
    expect(m.free).toBe(16);
    expect(m.roadShare).toBeCloseTo(65 / 81, 6);
    expect(m.maille).toBe(2);
    expect(m.blocks.n).toBe(16);
    expect(m.blocks.median).toBe(1);
    expect(m.blocks.max).toBe(1);
    expect(m.blocks.singleShare).toBe(1);
  });

  // ── La cible : une rue toutes les quatre cellules ──────────────────────────
  // 13×13, rues aux indices multiples de 4 (0, 4, 8, 12). Libres = 9 valeurs sur
  // chaque axe = 81 cellules, en 9 îlots de 3 × 3. Voirie = 169 − 81 = 88.
  const large = grid(13, (gx, gy) => gx % 4 === 0 || gy % 4 === 0);

  it("maille 4 : la voirie tombe à 88 sur 169, en 9 îlots de 9 cellules", () => {
    const m = tissuMetrics(large);
    expect(m.cells).toBe(169);
    expect(m.road).toBe(88);
    expect(m.free).toBe(81);
    expect(m.roadShare).toBeCloseTo(88 / 169, 6);
    expect(m.maille).toBe(4);
    expect(m.blocks.n).toBe(9);
    expect(m.blocks.median).toBe(9);
    expect(m.blocks.singleShare).toBe(0);
  });

  it("le desserrement de la maille fait bien BAISSER la part de voirie", () => {
    // La raison d'être du chantier, vérifiée sur les deux grilles ci-dessus :
    // 80,2 % contre 52,1 %. Si un jour cette assertion tombe, c'est le plan
    // entier qui repose sur une fausse prémisse.
    expect(tissuMetrics(fin).roadShare).toBeGreaterThan(tissuMetrics(large).roadShare + 0.25);
  });

  // ── La forme, pas seulement le compte ──────────────────────────────────────
  // ⚠ LE point du fichier. Un indicateur qui ne compterait que les cellules de
  // route noterait IDENTIQUEMENT une ville en plots et une ville en pâtés : on
  // construit ici deux grilles à part de voirie très proche mais de forme
  // opposée, et on exige que la mesure les sépare. Sans ça l'indicateur
  // laisserait passer exactement le défaut qu'il est censé traquer.
  it("sépare une ville en plots d'une ville en pâtés à voirie comparable", () => {
    const plots = tissuMetrics(grid(9, (gx, gy) => gx % 2 === 0 || gy % 2 === 0));
    // Bandes : rues sur les colonnes paires seulement → îlots en lanières 1 × 9.
    const bandes = tissuMetrics(grid(9, (gx) => gx % 2 === 0));
    expect(Math.abs(plots.roadShare - bandes.roadShare)).toBeLessThan(0.36);
    expect(plots.blocks.singleShare).toBe(1);
    expect(bandes.blocks.singleShare).toBe(0);
    expect(bandes.blocks.median).toBe(9);
  });

  // ── Ce qui ne doit PAS compter ─────────────────────────────────────────────
  it("ignore ce qui sort du sol de ville : une route de campagne n'est pas du tissu", () => {
    const L = grid(5, () => false);
    for (let gy = 0; gy < 5; gy += 1) {           // une route qui file hors ville
      L.roadSet.add("9," + gy);
      L.roadMap.set("9," + gy, { gx: 9, gy, rank: "path" });
    }
    const m = tissuMetrics(L);
    expect(m.cells).toBe(25);
    expect(m.road).toBe(0);
    expect(m.roadShare).toBe(0);
  });

  it("un intervalle tronqué par la LISIÈRE ne compte pas dans la maille", () => {
    // Bande d'une ligne, une seule rue au milieu : aucun intervalle n'est borné
    // par deux rues, donc rien à mesurer. Compter les deux moitiés donnerait une
    // maille inventée de 3 sur une ville qui n'a pas de maille du tout.
    const urbanSet = new Set(), roadSet = new Set(), roadMap = new Map();
    for (let gx = 0; gx < 5; gx += 1) urbanSet.add(gx + ",0");
    roadSet.add("2,0");
    roadMap.set("2,0", { gx: 2, gy: 0, rank: "secondary" });
    const m = tissuMetrics({ gridN: 5, urbanSet, roadSet, roadMap, tiles: [] });
    expect(m.runMedian).toBe(0);
    expect(m.maille).toBe(1);
  });

  it("compte l'emprise ENTIÈRE d'un bâtiment, pas sa seule cellule d'ancrage", () => {
    const L = grid(6, () => false, [{ gx: 1, gy: 1, spanX: 2, spanY: 3 }]);
    const m = tissuMetrics(L);
    expect(m.built).toBe(6);
    expect(m.free).toBe(30);
  });

  it("les places comptent comme du minéral, mais se distinguent des rues", () => {
    const L = grid(5, (gx, gy) => gx === 2 || gy === 2);
    L.roadMap.get("2,2").rank = "plaza";
    const m = tissuMetrics(L);
    expect(m.plaza).toBe(1);
    expect(m.road).toBe(8);
    expect(m.roadShare).toBeCloseTo(9 / 25, 6);
    expect(m.rankCount.plaza).toBe(1);
  });

  // ── La ventilation des MATIÈRES (ce que le joueur voit, lot L2) ────────────
  it("distingue la nappe minérale de la cour et de la friche", () => {
    // 21 × 21 de sol de ville, bâti sur un carré central de 3, aucune rue : tout
    // ce qui est loin du bâti doit sortir en friche, pas en pavé.
    const L = grid(21, () => false,
      [{ gx: 9, gy: 9, spanX: 3, spanY: 3 }]);
    const m = tissuMetrics(L);
    expect(m.cells).toBe(441);
    expect(m.built).toBe(9);
    // Le renderer pave là où le bâti est dense, met une cour de terre autour, et
    // laisse le reste en friche. Un noyau de 3 × 3 dans 441 cellules ne fait pas
    // un quartier : la friche doit dominer largement.
    expect(m.surfaces.cour).toBeGreaterThan(0);
    expect(m.surfaces.fricheShare).toBeGreaterThan(0.5);
    expect(m.surfaces.mineral + m.surfaces.cour + m.surfaces.friche).toBe(m.cells);
  });

  it("mord : la ventilation bouge alors que les compteurs de layout, eux, ne bougent PAS", () => {
    // ⚠ Le piège que ce test ferme. `roadShare` / `builtShare` / `freeShare` sont
    // des propriétés du LAYOUT : le lot L2 ne les change pas d'un pouce, puisqu'il
    // ne fait que repeindre. Un tableau de bord réduit à ces trois nombres aurait
    // affiché « aucun changement » devant une ville visiblement transformée.
    const serre = grid(11, () => false, [{ gx: 4, gy: 4, spanX: 3, spanY: 3 }]);
    const etale = grid(31, () => false, [{ gx: 14, gy: 14, spanX: 3, spanY: 3 }]);
    const a = tissuMetrics(serre), b = tissuMetrics(etale);
    // Même ville bâtie, étalement différent : le layout dit « pareil »…
    expect(a.built).toBe(b.built);
    expect(a.roadShare).toBe(b.roadShare);
    // …la ventilation, elle, sépare nettement les deux.
    expect(b.surfaces.fricheShare).toBeGreaterThan(a.surfaces.fricheShare + 0.3);
  });

  it("le rapport texte tient debout sur un layout vide", () => {
    const m = tissuMetrics({});
    expect(m.cells).toBe(0);
    expect(m.roadShare).toBe(0);
    expect(() => tissuReport(m)).not.toThrow();
  });

  // ── COMPTEUR DE CLÔTURES (lot L9) ────────────────────────────────────────
  // Le plan l'exige AVANT la pose : « "Ça alourdit" ne se teste pas, "tant de
  // panneaux à l'écran" si. Compteur dans __tissu() et plafond dur, pour qu'une ère
  // future ne puisse pas en faire pousser dix mille sans que ça se voie. »
  // Relevé en jeu au branchement du compteur : 60 arêtes à la bande 3, 372 à la
  // bande 7 (30 028 cellules de ville) — le plafond de 4 000 est large.
  describe("compteur de clôtures", () => {
    // Une berge bâtie : sol de ville d'un côté, eau de l'autre. C'est l'étape 2 de
    // l'ordre de pose du plan, et la plus simple à fabriquer en grille jouet.
    const berge = (N) => {
      const L = grid(N, () => false);
      const cells = [];
      for (let gx = 0; gx < N; gx += 1) {
        const k = gx + "," + (N - 1);
        L.urbanSet.delete(k);
        cells.push(k);
      }
      L.river = { cells };
      return L;
    };

    it("expose un compte et son plafond", () => {
      const m = tissuMetrics(berge(8));
      expect(typeof m.fences.n).toBe("number");
      expect(m.fences.cap).toBeGreaterThan(0);
      expect(m.fences.atteintLePlafond).toBe(false);
      expect(() => tissuReport(m)).not.toThrow();
    });

    it("compte bien les arêtes de la berge bâtie", () => {
      const m = tissuMetrics(berge(8));
      // Les 7 cellules de sol qui touchent l'eau, par leur côté sud.
      expect(m.fences.n).toBeGreaterThan(0);
      expect(m.fences.parCote.s).toBe(m.fences.n);
    });

    // ⚠ LE point du test : le compteur doit refléter le MODULE, pas sa propre idée de
    // la règle. On éteint le module et le compte doit tomber à zéro — sinon c'est que
    // la mesure a été recopiée quelque part et dérivera en silence.
    it("mord : éteindre fenceEdges met le compteur à zéro", () => {
      const avant = tissuMetrics(berge(8)).fences.n;
      expect(avant).toBeGreaterThan(0);
      FENCE.on = false;
      try {
        expect(tissuMetrics(berge(8)).fences.n).toBe(0);
      } finally { FENCE.on = true; }
      expect(tissuMetrics(berge(8)).fences.n).toBe(avant);
    });

    it("ne pose rien dans un quartier homogène — la règle du plan", () => {
      // Sol de ville plein, aucune eau, aucun parvis : aucune arête ne sépare deux
      // matières différentes, donc aucune clôture. C'est ce qui écarte le treillis.
      const m = tissuMetrics(grid(8, () => false));
      expect(m.fences.n).toBe(0);
    });
  });
});
