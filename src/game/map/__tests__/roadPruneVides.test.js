// ÉMONDAGE DES QUARTIERS DE RUES VIDES (lot L8 de docs/PLAN-TISSU-URBAIN.md).
//
// Demande de Raph : « des carrés 2×2 pas très cohérents, il faudrait que ça
// n'arrive plus ». Le trim historique (trimDemandlessRoads) ne mange que des
// FEUILLES ; un quadrillage n'en a aucune, donc il survivait entier sur de la
// friche. Ces gardes vérifient les deux propriétés qui font qu'on peut couper
// sans casser la ville : on ne coupe que ce qui ne dessert rien, et ce qui reste
// est CONNEXE. La connexité est démontrée dans le code ; ici on la constate.
import { describe, it, expect } from "vitest";
import { pruneUnservedRoads, trimDemandlessRoads, ROAD_PRUNE } from "../procedural/roadGraph.js";

// Réseau jouet : grille pleine de rues sur N×N, bâtiments aux clés fournies.
const reseau = (N, batis, ranks = {}) => {
  const roads = [], roadKey = new Set(), roadMeta = new Map();
  for (let gy = 0; gy < N; gy += 1) {
    for (let gx = 0; gx < N; gx += 1) {
      const k = gx + "," + gy;
      if (batis.includes(k)) continue;              // un bâtiment n'est pas une rue
      roads.push({ gx, gy });
      roadKey.add(k);
      roadMeta.set(k, { rank: ranks[k] || "secondary" });
    }
  }
  return { roads, roadKey, roadMeta, demand: new Set(batis) };
};
// Toutes les portes sont-elles encore joignables depuis le cœur par la route ?
const connexe = (roadKey, from) => {
  const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const seen = new Set([from]), q = [from];
  for (let i = 0; i < q.length; i += 1) {
    const c = q[i].indexOf(",");
    const gx = +q[i].slice(0, c), gy = +q[i].slice(c + 1);
    for (const [dx, dy] of ORTHO) {
      const nk = (gx + dx) + "," + (gy + dy);
      if (seen.has(nk) || !roadKey.has(nk)) continue;
      seen.add(nk); q.push(nk);
    }
  }
  return seen.size === roadKey.size;
};

describe("émondage des rues qui ne desservent rien", () => {
  it("le trim historique ne peut PAS entamer un quadrillage : il n'a pas de feuille", () => {
    // ⚠ La raison d'être du nouveau lot, constatée et non supposée. 9 × 9 de rues
    // pleines, un seul bâtiment : le trim par feuilles laisse les 80 cellules.
    const r = reseau(9, ["4,4"]);
    trimDemandlessRoads(r);
    expect(r.roadKey.size).toBe(80);
  });

  it("un quadrillage vide autour d'un seul bâtiment fond jusqu'à sa desserte", () => {
    const r = reseau(9, ["4,4"]);
    pruneUnservedRoads({ ...r, coreX: 4, coreY: 4 });
    // Restent : les 4 portes autour du bâtiment, leur voisinage à `reach` = 2, et
    // rien d'autre — sûrement pas les 80 cellules de départ.
    expect(r.roadKey.size).toBeLessThan(30);
    for (const porte of ["3,4", "5,4", "4,3", "4,5"]) expect(r.roadKey.has(porte)).toBe(true);
    expect(r.roadKey.has("0,0")).toBe(false);       // le coin lointain part
    expect(connexe(r.roadKey, "3,4")).toBe(true);
  });

  it("ce qui reste est TOUJOURS connexe, y compris avec des bâtiments éloignés", () => {
    // Deux pôles aux extrémités : la route qui les relie traverse de la friche et
    // doit survivre entière (c'est l'arbre des plus courts chemins).
    const r = reseau(11, ["1,1", "9,9"]);
    pruneUnservedRoads({ ...r, coreX: 1, coreY: 2 });
    expect(connexe(r.roadKey, "1,2")).toBe(true);
    for (const porte of ["1,2", "2,1", "9,8", "8,9"]) expect(r.roadKey.has(porte)).toBe(true);
    expect(r.roadKey.size).toBeLessThan(60);        // sur 119 au départ
  });

  it("une boucle qui DESSERT est conservée : on ne rend pas la ville arborescente", () => {
    // Anneau de bâtiments : chaque cellule de rue borde une porte, donc rien ne
    // doit tomber. Sans ce contrôle, un émondage trop gourmand raboterait le
    // quadrillage des quartiers bâtis — exactement ce qu'il ne faut pas toucher.
    const batis = [];
    for (let gx = 2; gx <= 6; gx += 1) { batis.push(gx + ",2"); batis.push(gx + ",6"); }
    for (let gy = 3; gy <= 5; gy += 1) { batis.push("2," + gy); batis.push("6," + gy); }
    const r = reseau(9, batis);
    const avant = r.roadKey.size;
    pruneUnservedRoads({ ...r, coreX: 4, coreY: 4 });
    // La couronne de rues au contact de l'anneau bâti est intacte.
    for (const k of ["1,1", "7,7", "1,7", "7,1", "4,4"]) expect(r.roadKey.has(k)).toBe(true);
    expect(r.roadKey.size).toBeGreaterThan(avant * 0.6);
  });

  it("mord : c'est bien `reach` qui coupe, pas un effet de bord", () => {
    // Même réseau, portée énorme : plus rien n'est à plus de `reach` d'une porte,
    // donc RIEN ne doit tomber. Sans ce contrôle, un test qui voit le réseau
    // fondre pourrait se satisfaire d'un bug qui supprime tout.
    const r = reseau(9, ["4,4"]);
    globalThis.__roadPruneReach = 99;
    try { pruneUnservedRoads({ ...r, coreX: 4, coreY: 4 }); }
    finally { delete globalThis.__roadPruneReach; }
    expect(r.roadKey.size).toBe(80);
  });

  it("sanctuarise les places et les cellules semées par l'appelant (travée de pont)", () => {
    const r = reseau(9, ["0,0"]);
    r.roadMeta.get("8,8").rank = "plaza";
    r.demand.add("8,0");                            // ex. une travée de pont semée
    pruneUnservedRoads({ ...r, coreX: 0, coreY: 1 });
    expect(r.roadKey.has("8,8")).toBe(true);
    expect(r.roadKey.has("8,0")).toBe(true);
    expect(connexe(r.roadKey, "0,1")).toBe(true);
  });

  it("un réseau sans aucune demande est laissé intact, pas rasé", () => {
    const r = reseau(6, []);
    pruneUnservedRoads({ ...r, coreX: 0, coreY: 0 });
    expect(r.roadKey.size).toBe(36);
  });

  it("l'échappatoire coupe vraiment le lot", () => {
    const r = reseau(9, ["4,4"]);
    ROAD_PRUNE.on = false;
    try { pruneUnservedRoads({ ...r, coreX: 4, coreY: 4 }); }
    finally { ROAD_PRUNE.on = true; }
    expect(r.roadKey.size).toBe(80);
  });

  it("compacte le tableau `roads` en cohérence avec les clés", () => {
    const r = reseau(9, ["4,4"]);
    pruneUnservedRoads({ ...r, coreX: 4, coreY: 4 });
    expect(r.roads.length).toBe(r.roadKey.size);
    for (const c of r.roads) expect(r.roadKey.has(c.gx + "," + c.gy)).toBe(true);
  });
});
