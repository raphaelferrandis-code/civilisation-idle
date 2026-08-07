// OÙ SE POSENT LES CLÔTURES (lot L9 de docs/PLAN-TISSU-URBAIN.md).
//
// La crainte de Raph était explicite : « il ne faut pas qu'elles détruisent ou
// alourdissent de trop le visuel ». La réponse n'est pas un dosage prudent, c'est
// une règle qui rend le débordement impossible — une clôture ne se pose que sur un
// bord SÉPARANT DEUX MATIÈRES. Ce fichier vérifie que la règle mord dans les deux
// sens : elle pose là où il faut, et surtout elle ne pose RIEN à l'intérieur d'un
// quartier homogène, ce qui serait le treillis qu'on vient de retirer.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fenceEdges, FENCE } from "../fenceEdges.js";

// Sol de ville N×N ; `mat` donne la matière d'une cellule, `urban` par défaut.
const carte = (N, mat = () => "urban") => {
  const urbanSet = new Set();
  for (let gy = 0; gy < N; gy += 1) for (let gx = 0; gx < N; gx += 1) urbanSet.add(gx + "," + gy);
  return { urbanSet, matOf: mat };
};
const cle = (e) => e.gx + "," + e.gy + ":" + e.side;

// ⚠ CES TESTS EXERCENT LA RÈGLE. Certains cas ont besoin d'une source que le défaut
// livré n'active pas (les quais, abandonnés le 2026-08-06) : on la rallume alors
// localement. Le défaut livré, lui, est verrouillé par le premier `it`.
const DEFAUT = { ...FENCE };
beforeEach(() => { Object.assign(FENCE, DEFAUT); });
afterEach(() => { Object.assign(FENCE, DEFAUT); });

describe("pose des clôtures", () => {
  // ⛔ ARBITRAGE DE RAPH, 2026-08-06 : « oublie les clôtures sur les quais, le fait
  // que ça ne suive pas la ligne des tuiles fait le rendu impossible. On garde pour
  // mettre autour des places/merveilles, en laissant des entrées au niveau des
  // routes. » Ce test est là pour qu'un retour en arrière soit un GESTE, pas un
  // glissement — le fleuve est un ruban libre, la clôture se pose sur des arêtes de
  // cellules, et l'écart entre les deux se voit.
  it("le défaut LIVRÉ : places et merveilles, jamais les quais, avec des portes", () => {
    expect(DEFAUT.wonders).toBe(true);
    expect(DEFAUT.plazas).toBe(true);
    expect(DEFAUT.quays).toBe(false);
    expect(DEFAUT.gateOnRoad).toBe(true);
    expect(DEFAUT.on).toBe(true);
  });

  it("laisse une PORTE partout où une route aborde l'enceinte", () => {
    // Parvis 3×3, et une route qui vient buter sur son bord ouest.
    const w = new Set(["4,4", "5,4", "6,4", "4,5", "5,5", "6,5", "4,6", "5,6", "6,6"]);
    const route = new Set(["3,5"]);
    const mat = (k) => (w.has(k) ? "wonder" : (route.has(k) ? "road" : "urban"));
    const o = { ...carte(11, mat), wonderSet: w };
    const avec = fenceEdges(o);
    FENCE.gateOnRoad = false;
    const sans = fenceEdges(o);
    // Sans la porte, le parvis est ceint sur ses 12 arêtes ; avec, celle qui donne
    // sur la route manque — et c'est la SEULE qui manque.
    expect(sans.length).toBe(12);
    expect(avec.length).toBe(11);
    expect(sans.map(cle)).toContain("4,5:w");
    expect(avec.map(cle)).not.toContain("4,5:w");
  });

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

  // ⚠ DÉFAUT VÉCU, corrigé le 2026-08-06 sur capture de Raph : « il faut que ça longe
  // le quai s'il y en a là ». La source était une CELLULE, donc toutes ses arêtes
  // séparant deux matières recevaient un panneau — une berge qui touche l'eau au sud
  // posait aussi un garde-corps au NORD, côté ville, en pleine herbe et loin de toute
  // eau. Un quai ne se borde que du côté de l'eau.
  // ⚠ Les deux cas de QUAI rallument leur source : elle n'est plus livrée (verdict de
  // Raph, cf. plus haut), mais la règle reste dans le module et doit rester juste — le
  // jour où un art qui suit le ruban arrivera, c'est elle qui décidera.
  it("un quai ne se clôture QUE du côté de l'eau, jamais côté ville", () => {
    FENCE.quays = true;
    // Ligne d'eau en bas (gy = 6), sol de ville au-dessus, et de l'herbe encore
    // au-dessus : la cellule de berge a donc DEUX arêtes qui séparent des matières.
    const eau = new Set(["0,6", "1,6", "2,6", "3,6", "4,6", "5,6", "6,6"]);
    const urbanSet = new Set();
    for (let gx = 0; gx < 7; gx += 1) for (let gy = 3; gy <= 5; gy += 1) urbanSet.add(gx + "," + gy);
    const matOf = (k) => (eau.has(k) ? "water" : (urbanSet.has(k) ? "urban" : "grass"));
    const e = fenceEdges({ urbanSet, waterSet: eau, wonderSet: new Set(), matOf });
    expect(e.length).toBeGreaterThan(0);
    // TOUT est au sud, face à l'eau. Aucune arête nord, malgré urbain ↔ herbe en gy=3.
    expect(e.every((x) => x.side === "s")).toBe(true);
    expect(e.every((x) => x.gy === 5)).toBe(true);
  });

  // ⚠ DÉFAUT VÉCU, corrigé le 2026-08-06 : « la barrière ne fait pas le contour
  // complet des merveilles ». La règle sautait toute arête dont le voisin est hors du
  // sol de ville — garde-fou contre la décoration de la couture ville↔campagne. Mais
  // beaucoup de merveilles sont EN BORDURE : sur un parvis réel, 44 de ses ~96 arêtes
  // de pourtour tombaient ainsi, et le contour restait ouvert. Une enceinte ceint un
  // OBJET, elle ne souligne pas une lisière.
  it("ceint un parvis ENTIÈREMENT, même là où il donne sur la campagne", () => {
    // Parvis 3×3 collé au bord du sol de ville : sa colonne de gauche donne sur du
    // hors-ville (pas d'urbanSet), les autres côtés sur de l'urbain.
    const w = new Set(["0,4", "1,4", "2,4", "0,5", "1,5", "2,5", "0,6", "1,6", "2,6"]);
    const urbanSet = new Set(w);
    for (let gx = 3; gx <= 6; gx += 1) for (let gy = 3; gy <= 7; gy += 1) urbanSet.add(gx + "," + gy);
    for (let gx = 0; gx <= 2; gx += 1) { urbanSet.add(gx + ",3"); urbanSet.add(gx + ",7"); }
    const matOf = (k) => (w.has(k) ? "wonder" : (urbanSet.has(k) ? "urban" : "grass"));
    const e = fenceEdges({ urbanSet, wonderSet: w, waterSet: new Set(), matOf });
    // 12 arêtes de pourtour, y compris les 3 de la colonne ouest qui donnent sur le
    // hors-ville. Sans le correctif il n'en sortait que 9.
    expect(e.length).toBe(12);
    for (const gy of [4, 5, 6]) expect(e.map(cle)).toContain("0," + gy + ":w");
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
    FENCE.quays = true;
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

  // ⚠ CE TEST DISAIT L'INVERSE JUSQU'AU 2026-08-06. Il verrouillait « la campagne
  // n'est pas une couture à souligner » y compris pour un parvis, et c'est ce qui
  // laissait le contour des merveilles ouvert (retour de Raph). La règle de lisière
  // reste juste pour une source à CÔTÉS (une berge, qui longe et ne ceint pas) ;
  // elle est fausse pour une ENCEINTE, qui ceint un objet et doit se refermer.
  it("une enceinte se referme sur la campagne, une berge non", () => {
    // Parvis d'une cellule dans le coin : deux de ses côtés donnent hors ville.
    const w = new Set(["0,0"]);
    const o = { ...carte(4, (k) => (w.has(k) ? "wonder" : "urban")), wonderSet: w };
    // ENCEINTE : les quatre côtés, y compris les deux qui sortent de la ville.
    expect(fenceEdges(o).map(cle).sort()).toEqual(["0,0:e", "0,0:n", "0,0:s", "0,0:w"]);

    // BERGE : source à côtés, la règle de lisière tient. Une cellule de bord de ville
    // qui touche l'eau au sud ne clôture que le sud, jamais son flanc hors ville.
    const eau = new Set(["0,1"]);
    const urbanSet = new Set(["0,0", "1,0"]);
    const mat = (k) => (eau.has(k) ? "water" : (urbanSet.has(k) ? "urban" : "grass"));
    const berge = fenceEdges(
      { urbanSet, waterSet: eau, wonderSet: new Set(), matOf: mat },
      { ...FENCE, wonders: false, plazas: false, quays: true },
    );
    expect(berge.map(cle)).toEqual(["0,0:s"]);
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
