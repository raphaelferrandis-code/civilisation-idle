// PEUPLEMENTS ET TROUÉES de la forêt sauvage (docs/PLAN-VEGETATION.md, lot 2).
// Les fonctions sont pures : on mesure le champ sur une grande zone, sans layout.
//  - les essences se REGROUPENT (une sapinière, une chênaie), au lieu du tirage par
//    cellule qui mêlait tout uniformément ;
//  - chaque essence DOMINE quelque part (sinon le peuplement ne sert à rien) ;
//  - la densité garde sa moyenne (le nombre d'arbres ne monte pas) et ne fait plus de
//    marches : l'ancien bruit par blocs de 5 cellules dessinait des clairières carrées.
import { describe, it, expect } from "vitest";
import { FOREST, forestDensity, forestSpecies, forestStand } from "../iso/isoWildForest.js";

const N = 240;

describe("forêt sauvage : peuplements", () => {
  it("deux voisins sont plus souvent de la même essence que deux arbres pris au hasard", () => {
    const sp = [];
    const count = {};
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
      const s = forestSpecies(x, y);
      sp.push(s);
      count[s] = (count[s] || 0) + 1;
    }
    // Probabilité qu'une paire prise au hasard soit de la même essence.
    const tot = N * N;
    const hasard = Object.values(count).reduce((a, c) => a + (c / tot) ** 2, 0);
    let same = 0, pairs = 0;
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N - 1; x += 1) {
      pairs += 1;
      if (sp[y * N + x] === sp[y * N + x + 1]) same += 1;
    }
    expect(same / pairs).toBeGreaterThan(hasard + 0.08);
  });

  it("chaque essence domine une partie de la carte (sapinière, pinède, chênaie…)", () => {
    const B = 20, dom = {};
    for (let by = 0; by < N; by += B) for (let bx = 0; bx < N; bx += B) {
      const c = {};
      for (let y = by; y < by + B; y += 1) for (let x = bx; x < bx + B; x += 1) {
        const s = forestSpecies(x, y);
        c[s] = (c[s] || 0) + 1;
      }
      const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
      if (top[1] / (B * B) > 0.45) dom[top[0]] = (dom[top[0]] || 0) + 1;
    }
    for (const s of ["chene", "sapin", "pin"]) expect(dom[s] || 0, s).toBeGreaterThan(0);
  });

  it("le peuplement couvre toute sa plage, de la sapinière (0) à la chênaie (1)", () => {
    let lo = 1, hi = 0;
    for (let y = 0; y < N; y += 3) for (let x = 0; x < N; x += 3) {
      const n = forestStand(x, y);
      if (n < lo) lo = n; if (n > hi) hi = n;
    }
    expect(lo).toBeLessThan(0.1);
    expect(hi).toBeGreaterThan(0.9);
  });

  it("les bouleaux pionniers poussent à la lisière", () => {
    let coeur = 0, lisiere = 0;
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
      if (forestSpecies(x, y, 0) === "bouleau") coeur += 1;
      if (forestSpecies(x, y, 1) === "bouleau") lisiere += 1;
    }
    expect(lisiere).toBeGreaterThan(coeur * 1.5);
  });
});

describe("forêt sauvage : trouées", () => {
  it("la densité garde sa moyenne (~0,5) : le nombre d'arbres ne monte pas", () => {
    let s = 0, n = 0;
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) { s += forestDensity(x, y); n += 1; }
    expect(s / n).toBeGreaterThan(0.44);
    expect(s / n).toBeLessThan(0.54);
  });

  it("trouées FRANCHES : de vraies clairières et de vrais fourrés", () => {
    let clair = 0, dense = 0, n = 0;
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
      const d = forestDensity(x, y);
      if (d < 0.25) clair += 1;
      if (d > 0.75) dense += 1;
      n += 1;
    }
    expect(clair / n).toBeGreaterThan(0.08);
    expect(dense / n).toBeGreaterThan(0.08);
  });

  it("trouées LISSES : jamais de marche d'une cellule à sa voisine", () => {
    let worst = 0;
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N - 1; x += 1) {
      worst = Math.max(worst, Math.abs(forestDensity(x + 1, y) - forestDensity(x, y)));
    }
    // Pente maximale d'un bruit lissé à l'échelle holeScale, contraste compris.
    expect(worst).toBeLessThan(0.45);
    expect(FOREST.holeScale).toBeGreaterThanOrEqual(6);
  });
});
