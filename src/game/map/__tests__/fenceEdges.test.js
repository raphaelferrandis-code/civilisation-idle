// OÙ SE POSENT LES CLÔTURES (lot L9 de docs/PLAN-TISSU-URBAIN.md).
//
// La crainte de Raph était explicite : « il ne faut pas qu'elles détruisent ou
// alourdissent de trop le visuel ». La réponse n'est pas un dosage prudent, c'est
// une règle qui rend le débordement impossible — une clôture ne se pose que sur un
// bord SÉPARANT DEUX MATIÈRES. Ce fichier vérifie que la règle mord dans les deux
// sens : elle pose là où il faut, et surtout elle ne pose RIEN à l'intérieur d'un
// quartier homogène, ce qui serait le treillis qu'on vient de retirer.
import { describe, it, expect } from "vitest";
import { fenceEdges, FENCE } from "../fenceEdges.js";

// Sol de ville N×N ; `mat` donne la matière d'une cellule, `urban` par défaut.
const carte = (N, mat = () => "urban") => {
  const urbanSet = new Set();
  for (let gy = 0; gy < N; gy += 1) for (let gx = 0; gx < N; gx += 1) urbanSet.add(gx + "," + gy);
  return { urbanSet, matOf: mat };
};
const cle = (e) => e.gx + "," + e.gy + ":" + e.side;

describe("pose des clôtures", () => {
  it("ceint le parvis d'une merveille, et seulement son pourtour", () => {
    // Parvis 3×3 de matière `wonder` au milieu d'un sol urbain.
    const w = new Set(["4,4", "5,4", "6,4", "4,5", "5,5", "6,5", "4,6", "5,6", "6,6"]);
    const o = { ...carte(11, (k) => (w.has(k) ? "wonder" : "urban")), wonderSet: w };
    const e = fenceEdges(o);
    // 3×3 → 12 arêtes de pourtour, pas une de plus : le cœur du parvis (5,5)
    // n'en porte aucune, ses quatre voisines sont de la même matière.
    expect(e.length).toBe(12);
    expect(e.filter((x) => x.gx === 5 && x.gy === 5)).toEqual([]);
    expect(e.map(cle)).toContain("4,4:n");
    expect(e.map(cle)).toContain("4,4:w");
  });

  // ⚠ LE point du fichier.
  it("mord : rien du tout à l'intérieur d'un quartier homogène", () => {
    // Un parvis dont TOUT le voisinage est de la même matière : la source est
    // pleine, mais aucune arête ne sépare deux matières. Zéro panneau.
    const w = new Set(["4,4", "5,4", "4,5", "5,5"]);
    const o = { ...carte(11, () => "urban"), wonderSet: w };
    expect(fenceEdges(o)).toEqual([]);
    // …et le contrôle inverse, sans lequel le précédent pourrait n'être qu'un
    // bug qui ne pose jamais rien : la même carte, une seule matière changée.
    const o2 = { ...carte(11, (k) => (w.has(k) ? "wonder" : "urban")), wonderSet: w };
    expect(fenceEdges(o2).length).toBe(8);
  });

  it("longe la berge bâtie, une ligne et pas une maille", () => {
    // Fleuve sur la colonne 5 ; le sol de ville s'arrête à son bord.
    const water = new Set();
    for (let gy = 0; gy < 9; gy += 1) water.add("5," + gy);
    const urbanSet = new Set();
    for (let gy = 0; gy < 9; gy += 1) for (let gx = 0; gx < 9; gx += 1) if (gx !== 5) urbanSet.add(gx + "," + gy);
    const e = fenceEdges({ urbanSet, matOf: () => "urban", waterSet: water });
    // Une arête par cellule de rive, des deux côtés du fleuve : 9 + 9 = 18.
    expect(e.length).toBe(18);
    // Toutes tournées vers l'eau, aucune perpendiculaire : c'est une LIGNE.
    expect(e.every((x) => x.side === "e" || x.side === "w")).toBe(true);
    expect(e.filter((x) => x.gx === 4).every((x) => x.side === "e")).toBe(true);
  });

  it("ne double jamais une arête partagée", () => {
    // Deux parvis mitoyens de matières différentes : leur couture commune ne
    // doit porter qu'un seul panneau, pas un de chaque côté.
    const a = new Set(["3,3"]), b = new Set(["4,3"]);
    const w = new Set([...a, ...b]);
    const o = {
      ...carte(9, (k) => (a.has(k) ? "wonder" : b.has(k) ? "plaza" : "urban")),
      wonderSet: w,
    };
    const e = fenceEdges(o);
    const couture = e.filter((x) => (x.gx === 3 && x.side === "e") || (x.gx === 4 && x.side === "w"));
    expect(couture.length).toBe(1);
    expect(new Set(e.map(cle)).size).toBe(e.length);   // aucun doublon nulle part
  });

  it("ignore la lisière : la campagne n'est pas une couture à souligner", () => {
    // Parvis au bord du sol de ville : le côté qui donne sur l'herbe hors ville
    // ne porte rien — la lisière a déjà sa frange d'herbe.
    const w = new Set(["0,0"]);
    const o = { ...carte(4, (k) => (w.has(k) ? "wonder" : "urban")), wonderSet: w };
    const e = fenceEdges(o);
    expect(e.map(cle).sort()).toEqual(["0,0:e", "0,0:s"]);
  });

  it("les sources sont une LISTE BLANCHE : sans elles, aucune clôture", () => {
    // Une ville pleine de coutures cour/pavé et pas une seule source déclarée.
    const o = carte(9, (k) => (k.startsWith("4,") ? "dirt" : "urban"));
    expect(fenceEdges(o)).toEqual([]);
    // Couper une source coupe sa famille, et elle seule.
    const w = new Set(["1,1"]);
    const o2 = { ...carte(9, (k) => (w.has(k) ? "wonder" : "urban")), wonderSet: w };
    expect(fenceEdges(o2, { ...FENCE, wonders: false }).length).toBe(0);
    expect(fenceEdges(o2, { ...FENCE, wonders: true }).length).toBe(4);
  });

  it("l'échappatoire et le fusible coupent vraiment", () => {
    const w = new Set(["4,4", "5,4", "4,5", "5,5"]);
    const o = { ...carte(11, (k) => (w.has(k) ? "wonder" : "urban")), wonderSet: w };
    expect(fenceEdges(o, { ...FENCE, on: false })).toEqual([]);
    expect(fenceEdges(o, { ...FENCE, cap: 3 }).length).toBe(3);
  });

  it("rend la MÊME liste, dans le même ordre, à chaque calcul", () => {
    // Un décor qui se réordonne d'un recompute à l'autre scintille au tri peintre.
    const w = new Set(["4,4", "5,4", "6,4", "4,5", "6,5", "4,6", "5,6", "6,6"]);
    const o = () => ({ ...carte(11, (k) => (w.has(k) ? "wonder" : "urban")), wonderSet: w });
    expect(fenceEdges(o()).map(cle)).toEqual(fenceEdges(o()).map(cle));
  });
});
